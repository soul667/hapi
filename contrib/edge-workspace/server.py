#!/usr/bin/env python3
"""Loopback Edge bridge. Browser credentials never leave the browser profile."""
import base64, collections, hmac, json, math, os, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit

SITES={'figma':('figma.com',),'notion':('notion.com','notion.so')}
LOCK=threading.Condition()
STATE={'key':'','pair':'','pair_until':0,'last_seen':0,'frames':{},'wanted':{},'commands':collections.deque(maxlen=100),'proxy':{'country':'','checked':0},'errors':{}}
HTTP=build_opener(ProxyHandler({}))
HUB=os.environ.get('HAPI_WORKSPACE_HUB','http://127.0.0.1:3007')
MACHINE=os.environ.get('HAPI_WORKSPACE_MACHINE_ID','')

def allowed(site,url):
    try:
        u=urlsplit(url)
        return u.scheme=='https' and not u.username and not u.password and u.port in (None,443) and any(u.hostname==h or (u.hostname or '').endswith('.'+h) for h in SITES.get(site,()))
    except ValueError:return False

def proxy_ok():
    p=STATE['proxy'];return p.get('country')=='HK' and time.time()-p.get('checked',0)<180

def check_proxy():
    proxy=build_opener(ProxyHandler({'https':os.environ.get('HAPI_WORKSPACE_PROXY','http://127.0.0.1:7898')}))
    while True:
        try:
            with proxy.open('https://api.country.is/',timeout=12) as r: result=json.load(r)
            with LOCK: STATE['proxy']={'country':result.get('country',''),'checked':time.time()}
        except Exception:
            with LOCK: STATE['proxy']={'country':'','checked':time.time()}
        time.sleep(60)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,code,data):
        body=json.dumps(data).encode();self.send_response(code)
        origin=self.headers.get('Origin','')
        if origin.startswith('chrome-extension://') and len(origin)==51:self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Vary','Origin');self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):
        if self.path.startswith('/extension/'):
            self.send_response(204);origin=self.headers.get('Origin','')
            if origin.startswith('chrome-extension://') and len(origin)==51:self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type');self.end_headers()
        else:self.reply(405,{'error':'Method not allowed'})
    def do_GET(self):self.handle_request()
    def do_POST(self):self.handle_request()
    def handle_request(self):
        if self.headers.get('Host') not in ('127.0.0.1:3011','localhost:3011'):return self.reply(403,{'error':'Invalid host'})
        path=urlsplit(self.path).path
        api=path.startswith('/api/workspace/')
        extension=path.startswith('/extension/')
        if not api and not extension:return self.reply(404,{'error':'Not found'})
        token=self.headers.get('Authorization','')
        if api:
            if not token.startswith('Bearer '):return self.reply(401,{'error':'Unauthorized'})
            try:
                with HTTP.open(Request(HUB+'/api/machines',headers={'Authorization':token}),timeout=5) as r: machines=json.loads(r.read()).get('machines',[])
                if not MACHINE or not any(machine.get('id')==MACHINE for machine in machines):return self.reply(403,{'error':'Workspace machine access required'})
            except HTTPError as e:return self.reply(e.code,{'error':'Authentication failed'})
            except Exception:return self.reply(503,{'error':'Hub unavailable'})
        elif path!='/extension/pair':
            with LOCK:key=STATE['key']
            if not key or not hmac.compare_digest(token,'Bearer '+key):return self.reply(401,{'error':'Bridge not paired'})
        data={}
        if self.command=='POST':
            try:
                n=int(self.headers.get('Content-Length','0'));assert 0<n<=2_000_000
                data=json.loads(self.rfile.read(n));assert isinstance(data,dict)
            except Exception:return self.reply(400,{'error':'Invalid JSON request'})
        with LOCK:
            now=time.time()
            if api and self.command=='GET' and path=='/api/workspace/status':
                return self.reply(200,{'connected':bool(STATE['key']) and now-STATE['last_seen']<20,'proxy':STATE['proxy'],'proxyReady':proxy_ok(),'errors':STATE['errors']})
            if api and self.command=='POST' and path=='/api/workspace/pair':
                STATE['pair']=secrets.token_urlsafe(32);STATE['pair_until']=now+600
                return self.reply(200,{'code':STATE['pair'],'expiresIn':600})
            if api and self.command=='POST' and path=='/api/workspace/disconnect':
                STATE.update(key='',last_seen=0,frames={},wanted={},errors={});STATE['commands'].clear();LOCK.notify_all()
                return self.reply(200,{'ok':True})
            if extension and self.command=='POST' and path=='/extension/pair':
                origin=self.headers.get('Origin','')
                if not origin.startswith('chrome-extension://') or len(origin)!=51:return self.reply(403,{'error':'Extension origin required'})
                if not STATE['pair'] or now>STATE['pair_until'] or not hmac.compare_digest(str(data.get('code','')),STATE['pair']):return self.reply(401,{'error':'Invalid or expired pairing code'})
                STATE.update(key=secrets.token_urlsafe(32),pair='',pair_until=0,last_seen=now,frames={},errors={});STATE['commands'].clear()
                return self.reply(200,{'key':STATE['key']})
            if extension and self.command=='GET' and path=='/extension/poll':
                STATE['last_seen']=now
                if not STATE['commands']:LOCK.wait(timeout=1)
                if not STATE['key'] or not hmac.compare_digest(token,'Bearer '+STATE['key']):return self.reply(401,{'error':'Bridge disconnected'})
                commands=list(STATE['commands']);STATE['commands'].clear()
                return self.reply(200,{'commands':commands if proxy_ok() else [],'capture':[s for s,t in STATE['wanted'].items() if now-t<8] if proxy_ok() else [],'proxyReady':proxy_ok()})
            if extension and self.command=='POST' and path=='/extension/frame':
                site=data.get('site');frame=data.get('data','')
                if not isinstance(site,str) or site not in SITES:return self.reply(400,{'error':'Invalid site'})
                if data.get('error'):
                    STATE['errors'][site]=str(data['error'])[:200];STATE['frames'].pop(site,None)
                    return self.reply(200,{'ok':True})
                if not proxy_ok() or not allowed(site,data.get('url','')):return self.reply(403,{'error':'Site or Hong Kong proxy unavailable'})
                try:
                    raw=base64.b64decode(frame,validate=True);assert raw.startswith(b'\xff\xd8') and len(raw)<1_400_000
                    w=float(data['width']);h=float(data['height']);assert 0<w<=10000 and 0<h<=10000
                except Exception:return self.reply(400,{'error':'Invalid frame'})
                STATE['frames'][site]={'data':frame,'width':w,'height':h,'url':data['url'],'title':str(data.get('title',''))[:200],'at':now}
                STATE['last_seen']=now;STATE['errors'].pop(site,None)
                return self.reply(200,{'ok':True})
            if api and self.command=='GET' and path.startswith('/api/workspace/frame/'):
                site=path.rsplit('/',1)[-1]
                if not isinstance(site,str) or site not in SITES:return self.reply(400,{'error':'Invalid site'})
                STATE['wanted'][site]=now
                frame=STATE['frames'].get(site)
                return self.reply(200,{'frame':frame if frame and now-frame['at']<8 and proxy_ok() and now-STATE['last_seen']<20 else None,'error':STATE['errors'].get(site)})
            if api and self.command=='POST' and path=='/api/workspace/command':
                site=data.get('site');kind=data.get('type')
                if not isinstance(site,str) or site not in SITES or kind not in ['open','pointer','wheel','key','text','refresh']:return self.reply(400,{'error':'Unsupported command'})
                if not proxy_ok():return self.reply(503,{'error':'Hong Kong proxy not verified'})
                if not STATE['key'] or now-STATE['last_seen']>20:return self.reply(409,{'error':'Connect the Edge extension first'})
                if kind=='open' and not allowed(site,str(data.get('url',''))):return self.reply(400,{'error':'Only this site HTTPS URLs are allowed'})
                clean={'site':site,'type':kind}
                if kind=='open':clean['url']=data['url']
                if kind in ['pointer','wheel']:
                    try:
                        for k in ['x','y']+(['deltaX','deltaY'] if kind=='wheel' else []):
                            v=float(data.get(k,0));assert math.isfinite(v) and abs(v)<=10000;clean[k]=v
                        if kind=='pointer':assert data.get('event') in ['mousePressed','mouseReleased','mouseMoved'];clean['event']=data['event'];clean['buttons']=int(data.get('buttons',0))&7
                    except Exception:return self.reply(400,{'error':'Invalid pointer input'})
                if kind=='text':clean['text']=str(data.get('text',''))[:4000]
                if kind=='key':
                    clean['key']=str(data.get('key',''))[:40];clean['code']=str(data.get('code',''))[:40]
                    try:clean['modifiers']=int(data.get('modifiers',0))&15
                    except (ValueError,TypeError):return self.reply(400,{'error':'Invalid key modifiers'})
                if len(STATE['commands'])>=100:return self.reply(429,{'error':'Input queue full'})
                STATE['commands'].append(clean);LOCK.notify_all();return self.reply(200,{'ok':True})
        return self.reply(404,{'error':'Not found'})

if __name__=='__main__':
    os.umask(0o077);threading.Thread(target=check_proxy,daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1',3011),Handler).serve_forever()
