import collections, importlib.util, json, threading, time, unittest
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('workspace',Path(__file__).with_name('server.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response:
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return b'{"machines":[{"id":"test-machine"}]}'
class Hub:
    def open(self,req,**kwargs):
        if req.headers.get('Authorization')!='Bearer valid':raise HTTPError(req.full_url,401,'Unauthorized',{},None)
        return Response()
class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler);cls.server.daemon_threads=True
        threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.url='http://127.0.0.1:'+str(cls.server.server_port)
        cls.client=build_opener(ProxyHandler({}));m.HTTP=Hub();m.MACHINE='test-machine'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        with m.LOCK:m.STATE.update(key='',pair='',pair_until=0,last_seen=0,frames={},wanted={},commands=collections.deque(maxlen=100),proxy={'country':'HK','checked':time.time()},errors={})
    def request(self,path,data=None,token='valid',origin=None,host='127.0.0.1:3011'):
        headers={'Host':host,'Content-Type':'application/json'}
        if token is not None:headers['Authorization']='Bearer '+token
        if origin:headers['Origin']=origin
        req=Request(self.url+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with self.client.open(req,timeout=3) as r:return r.status,json.load(r)
        except HTTPError as e:return e.code,json.load(e)
    def pair(self):
        _,code=self.request('/api/workspace/pair',{})
        status,result=self.request('/extension/pair',{'code':code['code']},token=None,origin='chrome-extension://'+'a'*32)
        self.assertEqual(status,200);return result['key']
    def test_url_guard(self):
        for u in ['https://www.figma.com/design/x','https://app.notion.com/x']:
            self.assertTrue(m.allowed('figma' if 'figma' in u else 'notion',u))
        for u in ['http://figma.com','https://figma.com.evil.test','https://figma.com@evil.test','file:///tmp/a','https://localhost','https://figma.com:444/']:
            self.assertFalse(m.allowed('figma',u))
    def test_auth_and_host_required(self):
        self.assertEqual(self.request('/api/workspace/status',token=None)[0],401)
        self.assertEqual(self.request('/api/workspace/status',token='wrong')[0],401)
        self.assertEqual(self.request('/api/workspace/status',host='evil.test')[0],403)
        self.assertEqual(self.request('/extension/poll',token='wrong')[0],401)
    def test_wrong_namespace_cannot_access_browser(self):
        with patch.object(m,'MACHINE','other-machine'):
            self.assertEqual(self.request('/api/workspace/status')[0],403)
    def test_pair_is_one_use_and_extension_only(self):
        _,d=self.request('/api/workspace/pair',{})
        self.assertEqual(self.request('/extension/pair',{'code':d['code']},origin='https://evil.test')[0],403)
        key=self.pair()
        self.assertEqual(self.request('/extension/pair',{'code':d['code']},origin='chrome-extension://'+'a'*32)[0],401)
        self.assertTrue(key)
    def test_restricted_commands_and_proxy_fail_closed(self):
        self.pair()
        self.assertEqual(self.request('/api/workspace/command',{'site':'figma','type':'open','url':'http://127.0.0.1'})[0],400)
        self.assertEqual(self.request('/api/workspace/command',{'site':'figma','type':'Runtime.evaluate'})[0],400)
        self.assertEqual(self.request('/api/workspace/command',{'site':'figma','type':'text','text':'test'})[0],200)
        m.STATE['proxy']['country']='US'
        self.assertEqual(self.request('/api/workspace/command',{'site':'figma','type':'refresh'})[0],503)
        self.assertIsNone(self.request('/api/workspace/frame/figma')[1]['frame'])
    def test_disconnect_revokes_extension_and_clears_frames(self):
        key=self.pair();m.STATE['frames']['figma']={'private':'temporary'}
        self.assertEqual(self.request('/api/workspace/disconnect',{})[0],200)
        self.assertEqual(self.request('/extension/poll',token=key)[0],401)
        self.assertEqual(m.STATE['frames'],{})
    def test_expired_pair_and_stale_proxy(self):
        self.request('/api/workspace/pair',{});m.STATE['pair_until']=0
        self.assertEqual(self.request('/extension/pair',{'code':m.STATE['pair']},origin='chrome-extension://'+'a'*32)[0],401)
        m.STATE['proxy']={'country':'HK','checked':0};self.assertFalse(m.proxy_ok())
if __name__=='__main__':unittest.main()
