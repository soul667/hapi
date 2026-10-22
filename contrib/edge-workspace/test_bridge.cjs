const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
function setup(proxyMode='system') {
    const calls=[]
    const elements={ '#status':{}, '#pair':{value:''}, '#connect':{addEventListener(){}}, '#disconnect':{addEventListener(){}} }
    const event={addListener(){}}
    const chrome={
        tabs:{onUpdated:event, get:async()=>({id:10,url:'https://www.figma.com/design/test',title:'Test'}),query:async()=>[{id:10,url:'https://www.figma.com/design/test'}],create:async()=>{calls.push('create');return{id:20}},update:async()=>{}},
        debugger:{attach:async(t)=>calls.push(['attach',t.tabId]),detach:async()=>{},onDetach:event,sendCommand:async(t,method)=>{calls.push(method);if(method==='Page.getLayoutMetrics')return{cssVisualViewport:{clientWidth:1000,clientHeight:700}};if(method==='Page.getFrameTree')return{frameTree:{frame:{url:'https://www.figma.com/design/test'}}};return{data:'/9j/2Q=='};}},
        storage:{session:{set:async()=>{}}},
        proxy:{settings:{get:async()=>({value:{mode:proxyMode},levelOfControl:'controllable_by_this_extension'}),set:async()=>calls.push('setProxy'),clear:async()=>{}}}
    }
    const context=vm.createContext({URL,Map,Date,Promise,Error,Set,chrome,document:{querySelector:s=>elements[s]},window:{addEventListener(){}},fetch:async()=>{calls.push('upload');return{ok:true,json:async()=>({ok:true})}},console,setTimeout})
    vm.runInContext(fs.readFileSync(__dirname+'/bridge.js','utf8'),context)
    return{context,chrome,calls,run:s=>vm.runInContext(s,context)}
}
test('existing allowed tab is reused without opening another tab',async()=>{
 const s=setup();await s.run("ensureTab('figma')");assert(s.calls.some(x=>Array.isArray(x)&&x[0]==='attach'&&x[1]===10));assert(!s.calls.includes('create'))
})
test('custom proxy is not overwritten',async()=>{
 const s=setup('pac_script');await assert.rejects(s.run('configureProxy()'),/自定义代理/);assert(!s.calls.includes('setProxy'))
})
test('PAC pins target domains to HK without routing HAPI there',()=>{
 const s=setup();const pac=s.run('PAC');const c=vm.createContext({isPlainHostName:h=>!h.includes('.'),dnsDomainIs:(h,d)=>h.endsWith(d),shExpMatch:()=>false})
 vm.runInContext(pac,c)
 const route=h=>vm.runInContext(`FindProxyForURL('https://${h}/','${h}')`,c)
 assert.equal(route('app.notion.com'),'PROXY 127.0.0.1:7898');assert.equal(route('www.figma.com'),'PROXY 127.0.0.1:7898');assert.equal(route('hapi.axgu.top'),'DIRECT');assert.equal(route('figma.com.evil.test'),'PROXY 127.0.0.1:7897');assert.equal(route('api.anthropic.com'),'PROXY 127.0.0.1:7897')
})
test('navigation to another origin during capture is never uploaded',async()=>{
 const s=setup();let frames=0
 s.chrome.debugger.sendCommand=async(t,method)=>{
   if(method==='Page.getLayoutMetrics')return{cssVisualViewport:{clientWidth:1000,clientHeight:700}}
   if(method==='Page.getFrameTree')return{frameTree:{frame:{url:++frames===1?'https://www.figma.com/design/test':'https://evil.test/'}}}
   return{data:'/9j/2Q=='}
 }
 await assert.rejects(s.run("capture('figma')"),/导航/);assert(!s.calls.includes('upload'))
})
