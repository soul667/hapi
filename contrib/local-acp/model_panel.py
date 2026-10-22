"""Private ACP model switching helpers; no model prompt is sent."""
import json, os, re, socket, subprocess, time, uuid, threading
from pathlib import Path
STATE=Path('/home/axgu/.config/hapi/integrations/session-state')
LOCKS={};GUARD=threading.Lock()
def record_for(sid):
    uuid.UUID(sid)
    p=STATE/'by-hapi'/(sid+'.json')
    p=p.resolve()
    if p.parent!=STATE or not p.exists():raise ValueError('Not an ACP bridge session')
    return p,json.loads(p.read_text())
def choices(record):
    if record.get('agent')!='zcode':return []
    return record.get('available_models') or (json.loads(Path('/home/axgu/.config/hapi/integrations/zcode-model-catalog.json').read_text())['configOptions'][0]['options'])
def info(record):return {'agent':record['agent'],'model':record.get('model') or record.get('requested_model') or ('GLM-5.3' if record['agent']=='zcode' else None),'models':choices(record)}
def switch_model(sid,model,api,token):
    with GUARD: lock=LOCKS.setdefault(sid,threading.Lock())
    if not lock.acquire(blocking=False):raise ValueError('此会话正在切换模型，请稍候')
    try:
        path,record=record_for(sid)
        if record.get('agent')!='zcode':raise ValueError('此会话不支持 ZCode 模型选择')
        target=next((o for o in choices(record) if model in (o['value'],o.get('name'))),None)
        if not target:raise ValueError('当前账号未提供这个模型')
        session=api('/api/sessions/'+sid,token)['session']
        if session.get('thinking') or session.get('backgroundTaskCount',0)>0 or session.get('pendingRequestsCount',0)>0 or ((session.get('agentState')or{}).get('requests')):raise ValueError('请等待当前任务完成并处理待确认项后再切换模型')
        if session.get('active'):
            pid=(session.get('metadata')or{}).get('hostPid')
            if not pid or int(record.get('owner_pid',pid))!=int(pid):raise ValueError('会话进程映射不一致，未中断进程')
            cg=Path(f'/proc/{pid}/cgroup').read_text()
            unit=re.search(r'(hapi-(?:panel-|zcode-)[a-zA-Z0-9_.@-]+\.service)',cg)
            if not unit:raise ValueError('此会话不是受管服务，无法安全重连')
            subprocess.run(['systemctl','--user','stop',unit[1]],check=True,capture_output=True,timeout=25)
            for _ in range(30):
                if not api('/api/sessions/'+sid,token)['session'].get('active'):break
                time.sleep(.5)
            else:raise ValueError('旧进程未完成退出，未重复启动')
        unit='hapi-panel-model-'+uuid.uuid4().hex
        result=subprocess.run(['systemd-run','--user','--quiet','--collect','--unit='+unit,'--property=UMask=0077','--property=NoNewPrivileges=true','--property=KillMode=control-group','/home/axgu/.local/bin/hapi-zcode','--resume',sid,'--model',target['name']],capture_output=True,timeout=10)
        if result.returncode:raise ValueError('ZCode 重连启动失败')
        for _ in range(120):
            updated=json.loads(path.read_text());s=api('/api/sessions/'+sid,token)['session']
            if s.get('active') and updated.get('model')==target['value'] and updated.get('native_restored') and updated.get('owner_pid')==(s.get('metadata')or{}).get('hostPid'):
                return info(updated)
            time.sleep(.5)
        subprocess.run(['systemctl','--user','stop',unit],capture_output=True,timeout=20)
        raise ValueError('模型切换未得到代理确认；会话记录仍保留，可重试恢复')
    finally:lock.release()
