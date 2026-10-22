chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('bridge.html') }))
chrome.runtime.onInstalled.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('bridge.html') }))

chrome.tabs.onRemoved.addListener(async id => {
    const state = await chrome.storage.session.get(['workspaceBridgeTab','workspaceAttached'])
    if (id !== state.workspaceBridgeTab) return
    for (const tabId of state.workspaceAttached || []) { try { await chrome.debugger.detach({tabId}) } catch {} }
    const proxy = await chrome.proxy.settings.get({incognito:false})
    if (proxy.levelOfControl === 'controlled_by_this_extension') await chrome.proxy.settings.clear({scope:'regular'})
    await chrome.storage.session.remove(['workspaceBridgeTab','workspaceAttached'])
})
