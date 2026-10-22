const BASE = 'http://127.0.0.1:3011'
const status = document.querySelector('#status')
const sites = { figma: ['figma.com'], notion: ['notion.com', 'notion.so'] }
const defaults = { figma: 'https://www.figma.com/files', notion: 'https://app.notion.com/' }
const attached = new Map()
const tabs = new Map()
const lastCapture = new Map()
let key = '', running = false, proxyOwned = false
const allowed = (site, value) => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && sites[site]?.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) } catch { return false }
}
async function request(path, body) {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Bridge unavailable')
    return data
}
const PAC = `function FindProxyForURL(url, host) {
    if (isPlainHostName(host) || host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '111.230.201.63' || host === 'hapi.axgu.top' || shExpMatch(host,'10.*') || shExpMatch(host,'192.168.*') || shExpMatch(host,'172.1[6-9].*') || shExpMatch(host,'172.2?.*') || shExpMatch(host,'172.3[0-1].*')) return 'DIRECT';
    var domains = ['figma.com','figmausercontent.com','figma-alpha-api.s3.us-west-2.amazonaws.com','notion.com','notion.so','notion.site','notion-static.com','notionusercontent.com'];
    for(var i=0;i<domains.length;i++) if(host === domains[i] || dnsDomainIs(host,'.'+domains[i])) return 'PROXY 127.0.0.1:7898';
    return 'PROXY 127.0.0.1:7897';
}`
async function configureProxy() {
    const old = await chrome.proxy.settings.get({ incognito: false })
    if (old.levelOfControl === 'controlled_by_other_extensions' || old.levelOfControl === 'not_controllable') throw new Error('代理由其他扩展或组织策略管理，未修改。')
    if (old.value?.mode !== 'system' && !(old.value?.mode === 'pac_script' && old.value.pacScript?.data === PAC)) throw new Error('当前有自定义代理设置，未覆盖。请先恢复 Edge 使用系统代理。')
    await chrome.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data: PAC, mandatory: true } }, scope: 'regular' })
    proxyOwned = true
}
async function ensureTab(site, url) {
    let tab
    const oldId = tabs.get(site)
    if (oldId) { try { tab = await chrome.tabs.get(oldId) } catch { tabs.delete(site) } }
    if (tab && !allowed(site, tab.url)) { await detach(oldId); tabs.delete(site); tab = null }
    if (!tab) {
        const matches = await chrome.tabs.query({ url: sites[site].map(h => `https://*.${h}/*`) })
        // Prefer an existing logged-in tab. No profile or Cookie database is opened.
        tab = matches.find(t => allowed(site, t.url))
        if (!tab) tab = await chrome.tabs.create({ url: url || defaults[site], active: false })
        tabs.set(site, tab.id)
    }
    if (url && tab.url !== url) await chrome.tabs.update(tab.id, { url })
    if (!attached.has(tab.id)) {
        await chrome.debugger.attach({ tabId: tab.id }, '1.3')
        attached.set(tab.id, site)
        await chrome.storage.session.set({ workspaceAttached: [...attached.keys()] })
    }
    return tab.id
}
async function detach(id) { attached.delete(id); try { await chrome.debugger.detach({ tabId: id }) } catch {} }
chrome.debugger.onDetach.addListener(source => attached.delete(source.tabId))
chrome.tabs.onUpdated.addListener(async (id, change) => {
    if (change.url && attached.has(id) && !allowed(attached.get(id), change.url)) {
        await detach(id)
        for (const [s,t] of tabs) if(t===id) tabs.delete(s)
    }
})
const send = (id, method, params = {}) => chrome.debugger.sendCommand({ tabId: id }, method, params)
async function command(c) {
    const id = await ensureTab(c.site, c.type === 'open' && allowed(c.site, c.url) ? c.url : undefined)
    const t = await chrome.tabs.get(id)
    if (!allowed(c.site, t.url)) throw new Error('标签页导航出了允许的站点，已停止操作。')
    if (c.type === 'refresh') await send(id, 'Page.reload')
    if (c.type === 'pointer') await send(id, 'Input.dispatchMouseEvent', { type: c.event, x: c.x, y: c.y, button: c.event === 'mouseMoved' && !c.buttons ? 'none' : 'left', buttons: c.buttons, clickCount: c.event === 'mouseMoved' ? 0 : 1 })
    if (c.type === 'wheel') await send(id, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: c.deltaX, deltaY: c.deltaY })
    if (c.type === 'text') await send(id, 'Input.insertText', { text: c.text })
    if (c.type === 'key') {
        await send(id, 'Input.dispatchKeyEvent', { type: 'keyDown', key: c.key, code: c.code, modifiers: c.modifiers, ...(c.key.length === 1 && !(c.modifiers & 7) ? { text: c.key } : {}) })
        await send(id, 'Input.dispatchKeyEvent', { type: 'keyUp', key: c.key, code: c.code, modifiers: c.modifiers })
    }
}
async function capture(site) {
    const id = await ensureTab(site)
    const tab = await chrome.tabs.get(id)
    if (!allowed(site, tab.url)) throw new Error('标签页尚未加载，或正在登录跳转。')
    const metrics = await send(id, 'Page.getLayoutMetrics')
    const viewport = metrics.cssVisualViewport || metrics.visualViewport
    const tree = await send(id, 'Page.getFrameTree')
    if (!allowed(site, tree.frameTree.frame.url)) throw new Error('页面导航不在允许范围内。')
    const result = await send(id, 'Page.captureScreenshot', { format: 'jpeg', quality: 65, captureBeyondViewport: false })
    const after = await send(id, 'Page.getFrameTree')
    if (!allowed(site, after.frameTree.frame.url)) throw new Error('页面导航不在允许范围内。')
    await request('/extension/frame', { site, data: result.data, width: viewport.clientWidth, height: viewport.clientHeight, url: tab.url, title: tab.title })
}
async function disconnect() {
    running = false
    for (const id of [...attached.keys()]) await detach(id)
    tabs.clear()
    if (proxyOwned) { await chrome.proxy.settings.clear({ scope: 'regular' }); proxyOwned = false }
    key = ''; status.textContent = '已断开，已释放标签和代理设置。'
}
async function loop() {
    while (running) {
        try {
            const response = await request('/extension/poll')
            if (!running) break
            if (!response.proxyReady) { status.textContent = '香港出口尚未验证，暂停画面和操作。'; continue }
            for (const c of response.commands) {
                try { await command(c) } catch (e) { await request('/extension/frame', { site: c.site, error: e.message }) }
            }
            for (const site of response.capture) {
                if (Date.now() - (lastCapture.get(site) || 0) < 900) continue
                lastCapture.set(site, Date.now())
                try { await capture(site) } catch (e) { await request('/extension/frame', { site, error: e.message }) }
            }
            status.textContent = '已连接；香港专用代理已应用。只共享正在 HAPI 面板查看的站点。'
        } catch (e) {
            const message = e.message
            await disconnect(); status.textContent = '已断开：' + message; break
        }
    }
}
document.querySelector('#connect').addEventListener('click', async () => {
    if (running) return
    try {
        const local = await chrome.tabs.getCurrent(); await chrome.storage.session.set({ workspaceBridgeTab: local.id })
        const response = await request('/extension/pair', { code: document.querySelector('#pair').value.trim() })
        document.querySelector('#pair').value = ''; key = response.key
        await configureProxy(); running = true; void loop()
    } catch (e) { status.textContent = e.message; if(proxyOwned) await chrome.proxy.settings.clear({ scope: 'regular' }); proxyOwned = false; key = '' }
})
document.querySelector('#disconnect').addEventListener('click', disconnect)
window.addEventListener('pagehide', () => { if (proxyOwned) void chrome.proxy.settings.clear({scope:'regular'}); for(const id of attached.keys()) void chrome.debugger.detach({tabId:id}) })
