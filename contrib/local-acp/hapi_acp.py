#!/usr/bin/env python3
"""Experimental ACP launch/resume bridge; HAPI remains the authenticated UI."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path('/home/axgu/.local/share/hapi/integrations')
STATE = Path('/home/axgu/.config/hapi/integrations/session-state')
BY_HAPI = STATE / 'by-hapi'
COMMANDS = {'codebuddy': ROOT / 'codebuddy-acp', 'zcode': ROOT / 'zcode-acp-entry'}
LABELS = {'codebuddy': 'CodeBuddy ACP', 'zcode': 'ZCode ACP'}


def update_state(path, changes):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(str(path) + '.lock', 'a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads(path.read_text()) if path.exists() else {}
        data.update(changes)
        tmp = path.with_name(path.name + '.tmp')
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        tmp.chmod(0o600)
        tmp.replace(path)
    return data


class Hub:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.jwt = None
        secret = Path('/home/axgu/.config/hapi/access-token.txt').read_text().strip()
        self.jwt = self.request('/api/auth', {'accessToken': secret})['token']

    def request(self, path, data=None, method=None):
        headers = {'Content-Type': 'application/json'}
        if self.jwt:
            headers['Authorization'] = 'Bearer ' + self.jwt
        request = urllib.request.Request('http://127.0.0.1:3006' + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers=headers, method=method)
        with self.opener.open(request, timeout=10) as response:
            return json.load(response)


def proxy(record_path, command):
    record = json.loads(Path(record_path).read_text())
    native_resume = record.get('resume_native_id')
    env = os.environ.copy()
    for key in ['CLI_API_TOKEN', 'HAPI_DSH_ACP_COMMAND', 'HAPI_DSH_ACP_ARGS_JSON', 'HAPI_DSH_ACP_CONFIG']:
        env.pop(key, None)
    child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=sys.stderr, env=env, text=True, bufsize=1)
    pending = {}
    errors = []

    def forward_input():
        try:
            for line in sys.stdin:
                request = json.loads(line)
                method = request.get('method')
                if method == 'session/new':
                    pending[request['id']] = True
                    if native_resume:
                        request['method'] = 'session/load'
                        request['params']['sessionId'] = native_resume
                child.stdin.write(json.dumps(request, ensure_ascii=False) + '\n')
                child.stdin.flush()
        except (BrokenPipeError, OSError):
            pass
        except Exception:
            errors.append(True)
        finally:
            try:
                child.stdin.close()
            except OSError:
                pass

    def stop(signum, _frame):
        if child.poll() is None:
            child.send_signal(signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    threading.Thread(target=forward_input, daemon=True).start()
    try:
        for line in child.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                print('ACP bridge: ignored non-protocol stdout line', file=sys.stderr)
                continue
            if 'method' not in message and message.get('id') in pending:
                pending.pop(message['id'])
                result = message.get('result')
                if isinstance(result, dict):
                    if record.get('agent') == 'codebuddy':
                        modes = result.get('modes') or {}
                        options = modes.get('availableModes', [])
                        wanted_mode = record.get('requested_permission_mode') or 'fullAccess'
                        if wanted_mode not in [o['id'] for o in options]: raise RuntimeError('Requested CodeBuddy permission mode not offered')
                        if modes.get('currentModeId') != wanted_mode:
                            mode_request_id = 'hapi-permission-' + str(uuid.uuid4())
                            child.stdin.write(json.dumps({'jsonrpc':'2.0','id':mode_request_id,'method':'session/set_mode','params':{'sessionId':native_resume or result['sessionId'],'modeId':wanted_mode}}) + '\n')
                            child.stdin.flush()
                            while True:
                                mode_line = child.stdout.readline()
                                if not mode_line: raise RuntimeError('CodeBuddy exited while setting permissions')
                                mode_reply = json.loads(mode_line)
                                if mode_reply.get('id') == mode_request_id and 'method' not in mode_reply:
                                    if mode_reply.get('error'): raise RuntimeError('CodeBuddy rejected permission mode')
                                    modes['currentModeId'] = wanted_mode
                                    break
                                print(json.dumps(mode_reply,ensure_ascii=False),flush=True)
                        result['modes'] = modes
                        update_state(record_path, {'permission_mode':wanted_mode,'permission_modes':[{'value':o['id'],'name':o.get('name',o['id'])} for o in options if o['id'] != 'delegate']})
                    if record.get('agent') == 'zcode':
                        mode_config = next((c for c in result.get('configOptions',[]) if c.get('category') == 'mode' or c.get('id') == 'mode'), None)
                        if mode_config:
                            wanted_mode = record.get('requested_permission_mode') or 'yolo'
                            mode_choices = mode_config.get('options',[])
                            if wanted_mode not in [o['value'] for o in mode_choices]: raise RuntimeError('Requested ZCode mode is not offered')
                            if mode_config.get('currentValue') != wanted_mode:
                                mode_request_id = 'hapi-zcode-mode-' + str(uuid.uuid4())
                                child.stdin.write(json.dumps({'jsonrpc':'2.0','id':mode_request_id,'method':'session/set_config_option','params':{'sessionId':native_resume or result['sessionId'],'configId':mode_config['id'],'value':wanted_mode}}) + '\n')
                                child.stdin.flush()
                                while True:
                                    mode_line = child.stdout.readline()
                                    if not mode_line: raise RuntimeError('ZCode exited during mode change')
                                    mode_reply=json.loads(mode_line)
                                    if mode_reply.get('id') == mode_request_id and 'method' not in mode_reply:
                                        if mode_reply.get('error'): raise RuntimeError('ZCode rejected permission mode')
                                        result['configOptions']=mode_reply.get('result',{}).get('configOptions',result['configOptions'])
                                        break
                                    print(json.dumps(mode_reply,ensure_ascii=False),flush=True)
                            if result.get('modes'):result['modes']['currentModeId']=wanted_mode
                            update_state(record_path, {'permission_mode':wanted_mode,'permission_modes':[{'value':o['value'],'name':o.get('name',o['value'])} for o in mode_choices]})
                    config = next((c for c in result.get('configOptions', []) if c.get('category') == 'model' or c.get('id') == 'model'), None)
                    requested = record.get('requested_model')
                    if config:
                        choices = config.get('options', [])
                        current = config.get('currentValue')
                        wanted = next((o['value'] for o in choices if o.get('value') == requested or o.get('name') == requested), None) if requested else None
                        if requested and wanted is None:
                            raise RuntimeError('Requested model is not offered by this agent account')
                        if wanted and wanted != current:
                            request_id = 'hapi-model-' + str(uuid.uuid4())
                            child.stdin.write(json.dumps({'jsonrpc':'2.0','id':request_id,'method':'session/set_config_option','params':{'sessionId': native_resume or result['sessionId'], 'configId': config['id'], 'value':wanted}}) + '\n')
                            child.stdin.flush()
                            while True:
                                reply_line = child.stdout.readline()
                                if not reply_line: raise RuntimeError('Agent exited during model selection')
                                reply = json.loads(reply_line)
                                if reply.get('id') == request_id and 'method' not in reply:
                                    if reply.get('error'): raise RuntimeError('Agent rejected model selection')
                                    current = wanted
                                    result['configOptions'] = reply.get('result',{}).get('configOptions',result['configOptions'])
                                    break
                                print(json.dumps(reply,ensure_ascii=False),flush=True)
                        update_state(record_path, {'model':current,'available_models':[{'value':o['value'],'name':o.get('name',o['value'])} for o in choices]})
                    if native_resume:
                        result['sessionId'] = native_resume
                    if result.get('sessionId'):
                        update_state(record_path, {
                            'native_id': result['sessionId'],
                            'mode': (result.get('modes') or {}).get('currentModeId'),
                            **({'model':result['models']['currentModelId']} if result.get('models') else {}),
                            'native_restored': bool(native_resume),
                        })
            # Permission requests and their outcomes pass through unchanged.
            print(json.dumps(message, ensure_ascii=False), flush=True)
    finally:
        if child.poll() is None:
            child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    return child.returncode or (1 if errors else 0)


def launch(agent, argv):
    parser = argparse.ArgumentParser(description=f'{LABELS[agent]} through HAPI. Experimental DSH transport.')
    parser.add_argument('--resume', metavar='HAPI_SESSION_ID', help='Resume a session created by this bridge')
    parser.add_argument('--cwd', help='Project directory; defaults to the current directory')
    parser.add_argument('--model', help='Native agent model for a new session')
    parser.add_argument('--permission-mode', help='Native CodeBuddy ACP permission mode')
    opts, extra = parser.parse_known_args(argv)
    if agent == 'zcode' and extra:
        parser.error('Unsupported ZCode arguments: ' + ' '.join(extra))
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    BY_HAPI.mkdir(parents=True, exist_ok=True, mode=0o700)
    hub = Hub()
    existing = opts.resume
    record = {}
    if existing:
        uuid.UUID(existing)
        index = BY_HAPI / (existing + '.json')
        if not index.exists():
            raise SystemExit('No saved native session mapping for this HAPI session.')
        record_path = index.resolve()
        if record_path.parent != STATE:
            raise SystemExit('Invalid bridge state path.')
        record = json.loads(record_path.read_text())
        if record['agent'] != agent or not record.get('native_id'):
            raise SystemExit('Agent mismatch or native session missing.')
        remote = hub.request('/api/sessions/' + existing)['session']
        if remote.get('active'):
            raise SystemExit('Session is already online: https://hapi.axgu.top:26008/sessions/' + existing)
        cwd = record['cwd']
        extra = record.get('agent_args', [])
        model = opts.model or record.get('requested_model')
        native_resume = record['native_id']
    else:
        cwd = str(Path(opts.cwd or os.getcwd()).resolve())
        if not Path(cwd).is_dir():
            raise SystemExit('Project directory does not exist.')
        record_path = STATE / (str(uuid.uuid4()) + '.json')
        native_resume = None
        model = opts.model
    update_state(record_path, {'agent': agent, 'cwd': cwd, 'agent_args': extra,
        'requested_model': model, 'resume_native_id': native_resume, 'requested_permission_mode': opts.permission_mode or record.get('requested_permission_mode') or ('fullAccess' if agent == 'codebuddy' else 'yolo')})
    command = [str(COMMANDS[agent])]
    if agent == 'codebuddy':
        command += (['--model', model] if model else []) + extra
    env = os.environ.copy()
    if agent == 'zcode' and model:
        env['HAPI_ZCODE_MODEL'] = model
    env['HAPI_DSH_ACP_COMMAND'] = str(Path(__file__).resolve())
    env['HAPI_DSH_ACP_ARGS_JSON'] = json.dumps(['proxy', str(record_path)] + command)
    args = ['/home/axgu/.local/bin/hapi', 'dsh']
    if existing:
        args += ['--existing-session-id', existing]
    child = subprocess.Popen(args, cwd=cwd, env=env)
    update_state(record_path, {'owner_pid': child.pid})

    def stop(signum, _frame):
        if child.poll() is None:
            child.send_signal(signum)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        deadline = time.monotonic() + 60
        while child.poll() is None and time.monotonic() < deadline:
            sessions = hub.request('/api/sessions')['sessions']
            for session in sessions:
                if not session.get('active') or (session.get('metadata') or {}).get('flavor') != 'dsh':
                    continue
                full = hub.request('/api/sessions/' + session['id'])['session']
                if (full.get('metadata') or {}).get('hostPid') != child.pid:
                    continue
                sid = session['id']
                update_state(record_path, {'hapi_id': sid})
                link = BY_HAPI / (sid + '.json')
                if not link.exists():
                    link.symlink_to(Path('..') / record_path.name)
                if not existing:
                    hub.request('/api/sessions/' + sid,
                                {'name': LABELS[agent] + ' · ' + Path(cwd).name}, 'PATCH')
                print('\nHAPI: https://hapi.axgu.top:26008/sessions/' + sid, flush=True)
                print('Resume after stopping: hapi-' + agent + ' --resume ' + sid, flush=True)
                return child.wait()
            time.sleep(0.5)
        if child.poll() is not None:
            return child.returncode
        print('HAPI session registration timed out; stopping this new bridge.', file=sys.stderr)
        return 1
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) > 1 and sys.argv[1] == 'proxy':
        raise SystemExit(proxy(sys.argv[2], sys.argv[3:]))
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit('Expected codebuddy or zcode')
    raise SystemExit(launch(sys.argv[1], sys.argv[2:]))
