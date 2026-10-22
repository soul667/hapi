#!/usr/bin/env python3
"""Authenticated local launcher for the two installed ACP integrations."""
import json, os, subprocess, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from model_panel import record_for, info, switch_model
ROOT=Path('/home/axgu/.local/share/hapi/integrations')
STATE=Path('/home/axgu/.config/hapi/integrations/session-state')
HTTP=build_opener(ProxyHandler({}))
GATE=__import__('threading').BoundedSemaphore(2)
def api(path,token):
    with HTTP.open(Request('http://127.0.0.1:3007'+path,headers={'Authorization':token}),timeout=10) as r:
        return json.load(r)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,data):
        body=json.dumps(data).encode();self.send_response(status)
        self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        token=self.headers.get('Authorization','')
        if not token.startswith('Bearer '):return self.reply(401,{'error':'Unauthorized'})
        try:
            if self.path=='/api/integrations/catalog':
                sessions=api('/api/sessions',token)['sessions'];bindings={}
                for session in sessions:
                    try: bindings[session['id']]=info(record_for(session['id'])[1])['agent']
                    except (ValueError,FileNotFoundError):pass
                return self.reply(200,{'bindings':bindings})
            if self.path.startswith('/api/integrations/session/'):
                sid=self.path.rsplit('/',1)[-1];api('/api/sessions/'+sid,token)
                return self.reply(200,info(record_for(sid)[1]))
            return self.reply(404,{'error':'Not found'})
        except HTTPError as e:return self.reply(e.code,{'error':'Session access denied'})
        except (ValueError,FileNotFoundError):return self.reply(404,{'error':'Not a bridge session'})
        except Exception:return self.reply(503,{'error':'Bridge unavailable'})
    def do_POST(self):
        if self.path.startswith('/api/integrations/session/'):
            token=self.headers.get('Authorization','')
            if not token.startswith('Bearer '):return self.reply(401,{'error':'Unauthorized'})
            try:
                sid=self.path.rsplit('/',1)[-1];api('/api/sessions/'+sid,token)
                length=int(self.headers.get('Content-Length','0'));assert 0<length<=4096
                data=json.loads(self.rfile.read(length));return self.reply(200,switch_model(sid,data.get('model'),api,token))
            except HTTPError as e:return self.reply(e.code,{'error':'Session access denied'})
            except ValueError as e:return self.reply(409,{'error':str(e)})
            except Exception:return self.reply(500,{'error':'模型切换失败，请检查代理服务'})
        if self.path!='/api/integrations/spawn':return self.reply(404,{'error':'Not found'})
        token=self.headers.get('Authorization','')
        if not token.startswith('Bearer '):return self.reply(401,{'error':'Unauthorized'})
        try: machines=api('/api/machines',token)['machines']
        except HTTPError as e:return self.reply(e.code,{'error':'Authentication failed'})
        except Exception:return self.reply(503,{'error':'Hub unavailable'})
        length=int(self.headers.get('Content-Length','0'))
        if not 0<length<=8192:return self.reply(400,{'error':'Invalid request size'})
        try:
            data=json.loads(self.rfile.read(length))
            agent=data['agent'];machine=data['machineId'];cwd=Path(data['directory']).resolve(strict=True)
            assert agent in ('codebuddy','zcode')
            assert any(m['id']==machine and m.get('metadata',{}).get('host')=='axgu' for m in machines)
            assert cwd.is_dir() and (cwd.is_relative_to('/home/axgu') or cwd.is_relative_to('/media/axgu/Data/claude'))
            assert data.get('sessionType','simple')=='simple'
        except Exception:return self.reply(400,{'type':'error','message':'请选择本机、已有工作区目录和普通会话。'})
        if not GATE.acquire(blocking=False):return self.reply(429,{'error':'Launch already in progress'})
        unit='hapi-panel-'+uuid.uuid4().hex
        try:
            before=set(STATE.glob('*.json'))
            result=subprocess.run(['systemd-run','--user','--quiet','--collect','--unit='+unit,
                '--property=WorkingDirectory='+str(cwd),'--property=UMask=0077',
                '--property=NoNewPrivileges=true','--property=KillMode=control-group',
                '/home/axgu/.local/bin/hapi-'+agent,'--cwd',str(cwd)],capture_output=True,timeout=10)
            if result.returncode:raise RuntimeError('启动服务失败')
            for _ in range(120):
                for p in set(STATE.glob('*.json'))-before:
                    record=json.loads(p.read_text())
                    if record.get('agent')==agent and record.get('cwd')==str(cwd) and record.get('hapi_id'):
                        # Match the service's owner via its cgroup, including concurrent same-directory starts.
                        owner=record.get('owner_pid')
                        if owner and unit in Path(f'/proc/{owner}/cgroup').read_text():
                            return self.reply(200,{'type':'success','sessionId':record['hapi_id']})
                time.sleep(.5)
            raise RuntimeError('会话注册超时，请检查桥接服务')
        except Exception as e:
            subprocess.run(['systemctl','--user','stop',unit],capture_output=True,timeout=20)
            self.reply(500,{'type':'error','message':str(e) if isinstance(e,RuntimeError) else '启动失败'})
        finally:GATE.release()
os.umask(0o077)
ThreadingHTTPServer(('127.0.0.1',3010),Handler).serve_forever()
