import { useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'

type Site = 'figma' | 'notion'
type Frame = { data: string; width: number; height: number; url: string; title: string; at: number }
type Status = { connected: boolean; proxyReady: boolean; proxy: { country: string }; errors: Record<string, string> }
const defaults = { figma: 'https://www.figma.com/files', notion: 'https://app.notion.com/' }
export function workspaceUrlAllowed(site: Site, value: string): boolean {
    try {
        const u = new URL(value)
        return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')
            && (site === 'figma' ? ['figma.com'] : ['notion.so', 'notion.com']).some(h => u.hostname === h || u.hostname.endsWith('.' + h))
    } catch { return false }
}
function stored(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
function save(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* Keep the panel usable. */ } }
export function WorkspacePanel({ api }: { api: ApiClient | null }) {
    const [open, setOpen] = useState(false)
    const [site, setSite] = useState<Site>(() => stored('hapi-workspace-site', 'figma') === 'notion' ? 'notion' : 'figma')
    const [width, setWidth] = useState(() => Math.max(360, Math.min(900, Number(stored('hapi-workspace-width', '480')) || 480)))
    const [urls, setUrls] = useState(() => ({ figma: stored('hapi-workspace-url-figma', defaults.figma), notion: stored('hapi-workspace-url-notion', defaults.notion) }))
    const [status, setStatus] = useState<Status | null>(null)
    const [frame, setFrame] = useState<Frame | null>(null)
    const [error, setError] = useState('')
    const [pair, setPair] = useState('')
    const [text, setText] = useState('')
    const [pairing, setPairing] = useState(false)
    const queue = useRef(Promise.resolve())
    const lastMove = useRef(0)
    const image = useRef<HTMLImageElement>(null)
    useEffect(() => {
        if (!open || !api) return
        let alive = true, busy = false
        setFrame(null)
        const poll = async () => {
            if (busy) return
            busy = true
            try {
                const [s, f] = await Promise.all([
                    api.workspaceRequest<Status>('status'),
                    api.workspaceRequest<{ frame: Frame | null; error?: string }>('frame/' + site),
                ])
                if (alive) { setStatus(s); setFrame(s.connected && s.proxyReady ? f.frame : null); setError(f.error || '') }
            } catch (e) { if (alive) { setError(e instanceof Error ? e.message : '连接失败'); setFrame(null) } }
            finally { busy = false }
        }
        void poll()
        const timer = setInterval(() => { if (!document.hidden) void poll() }, 1100)
        return () => { alive = false; clearInterval(timer) }
    }, [api, open, site])
    const send = (command: Record<string, unknown>) => {
        queue.current = queue.current.then(async () => {
            if (!api) return
            try { await api.workspaceRequest('command', { ...command, site }); setError('') }
            catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
        })
    }
    const point = (e: { clientX: number; clientY: number }) => {
        const r = image.current!.getBoundingClientRect()
        return { x: Math.max(0, Math.min(frame!.width - 1, (e.clientX - r.left) / r.width * frame!.width)), y: Math.max(0, Math.min(frame!.height - 1, (e.clientY - r.top) / r.height * frame!.height)) }
    }
    useEffect(() => {
        const element = image.current
        if (!open || !frame || !element) return
        const wheel = (event: WheelEvent) => {
            event.preventDefault()
            send({ type: 'wheel', deltaX: event.deltaX, deltaY: event.deltaY, ...point(event) })
        }
        element.addEventListener('wheel', wheel, { passive: false })
        return () => element.removeEventListener('wheel', wheel)
    }, [frame, open, site, api])
    if (!open) return <button type="button" onClick={() => setOpen(true)} className="workspace-launcher fixed right-3 bottom-24 z-30 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm shadow-lg backdrop-blur-xl" aria-label="打开 Figma / Notion 工作台">工作台 · Figma / Notion</button>
    return <aside className="workspace-panel glass-content flex h-full min-h-0 shrink-0 flex-col border-l border-[var(--app-border)]" style={{ width }} aria-label="Figma / Notion 工作台">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--app-divider)] p-3"><strong className="text-sm">工作台 · Edge</strong><button type="button" onClick={() => setOpen(false)} aria-label="关闭工作台">关闭 ×</button></header>
        <div className="flex shrink-0 gap-2 px-3 pt-3" role="tablist" aria-label="工作台站点">
            {(['figma', 'notion'] as const).map(s => <button key={s} role="tab" aria-selected={site === s} className={`rounded-lg px-3 py-2 text-sm ${site === s ? 'bg-[var(--app-secondary-bg)] font-semibold' : ''}`} onClick={() => { setSite(s); save('hapi-workspace-site', s); setFrame(null) }}>{s === 'figma' ? 'Figma' : 'Notion'}</button>)}
        </div>
        <div className="shrink-0 space-y-2 border-b border-[var(--app-divider)] p-3">
            <form className="flex gap-1" onSubmit={e => { e.preventDefault(); if (!workspaceUrlAllowed(site, urls[site])) { setError('请输入当前站点的 HTTPS 地址'); return } save('hapi-workspace-url-' + site, urls[site]); send({ type: 'open', url: urls[site] }) }}>
                <input aria-label="工作台网址" className="min-w-0 flex-1 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-xs" value={urls[site]} onChange={e => setUrls({ ...urls, [site]: e.target.value })} />
                <button disabled={!status?.connected || !status.proxyReady} className="text-xs disabled:opacity-40">打开</button>
                <button type="button" disabled={!status?.connected || !status.proxyReady} className="text-xs disabled:opacity-40" onClick={() => send({ type: 'refresh' })}>刷新</button>
            </form>
            <div role="status" className="text-xs text-[var(--app-hint)]">{status?.connected ? 'Edge 已连接' : '等待 Edge 扩展配对'} · {status?.proxyReady ? '香港出口已验证' : '香港代理验证中／不可用'}</div>
            {!status?.connected ? <>
                <p className="text-xs leading-relaxed">在已登录的 Edge 加载桥接扩展，再生成配对码。登录留在 Edge，只有此面板查看的 Figma／Notion 标签会被共享。</p>
                <details className="text-xs leading-relaxed"><summary className="cursor-pointer">首次安装 Edge 扩展</summary><p className="mt-1"><a className="text-[var(--app-link)] underline" href="/assets/hapi-edge-workspace-0.1.0.zip" download>下载扩展压缩包</a>，在这台电脑上解压。Edge → 扩展 → 管理扩展 → 开发人员模式 → 加载解压缩的扩展，选择解压目录。打开扩展的连接页并填入下方配对码，保留该连接页。</p><p className="mt-1">浏览器会显示此扩展正在调试标签页。它用于传送页面画面和操作；断开连接即停止。请在电脑 Edge 完成额外的登录、安全验证或文件上传。</p></details>
                <button type="button" disabled={pairing} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs" onClick={async () => {
                    if (!api) return
                    setPairing(true)
                    try { const result = await api.workspaceRequest<{code:string}>('pair', {}); setPair(result.code) }
                    catch (e) { setError(e instanceof Error ? e.message : '配对失败') } finally { setPairing(false) }
                }}>生成配对码</button>
                {pair ? <div><input aria-label="一次性配对码" readOnly value={pair} className="w-full rounded bg-[var(--app-secondary-bg)] p-2 text-xs" onFocus={e => e.target.select()} /><p className="mt-1 text-xs">10 分钟有效，只填入本机 Edge 的桥接扩展。</p></div> : null}
            </> : <button type="button" className="text-xs text-red-600" onClick={async () => { if (api) { await api.workspaceRequest('disconnect', {}); setStatus(null); setFrame(null); setPair('') } }}>断开 Edge 连接</button>}
            <label className="workspace-width flex items-center gap-2 text-xs">面板宽度<input aria-label="工作台宽度" type="range" min={360} max={900} value={width} onChange={e => { setWidth(Number(e.target.value)); save('hapi-workspace-width', e.target.value) }} /></label>
            {error ? <p role="alert" className="break-words text-xs text-red-600">{error}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-black/5 p-2" role="tabpanel" aria-label={site === 'figma' ? 'Figma 页面' : 'Notion 页面'}>
            {frame ? <>
                <div className="mb-1 truncate text-xs text-[var(--app-hint)]">{frame.title}</div>
                <img ref={image} src={'data:image/jpeg;base64,' + frame.data} alt={site === 'figma' ? 'Edge 中的 Figma 页面' : 'Edge 中的 Notion 页面'} draggable={false} tabIndex={0}
                    className="w-full rounded border border-[var(--app-border)] outline-none focus:ring-2 focus:ring-[var(--app-link)]" style={{ touchAction: 'none' }}
                    onPointerDown={e => { e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); send({ type: 'pointer', event: 'mousePressed', buttons: 1, ...point(e) }) }}
                    onPointerMove={e => { if (e.buttons && performance.now() - lastMove.current > 70) { lastMove.current = performance.now(); send({ type: 'pointer', event: 'mouseMoved', buttons: 1, ...point(e) }) } }}
                    onPointerUp={e => send({ type: 'pointer', event: 'mouseReleased', buttons: 0, ...point(e) })}
                    onPointerCancel={e => send({ type: 'pointer', event: 'mouseReleased', buttons: 0, ...point(e) })}
                    onKeyDown={e => { e.preventDefault(); send({type:'key',key:e.key,code:e.code,modifiers:(e.altKey?1:0)|(e.ctrlKey?2:0)|(e.metaKey?4:0)|(e.shiftKey?8:0)}) }} />
            </> : <div className="p-5 text-sm leading-relaxed text-[var(--app-hint)]">{status?.connected ? '等待 Edge 标签画面…若标签尚未打开，请点上方“打开”。登录跳转请在电脑上的 Edge 完成。' : '配对后，Figma 和 Notion 会出现在这里。无需将它们的登录凭据交给 HAPI。'}</div>}
        </div>
        {frame ? <form className="flex shrink-0 gap-2 border-t border-[var(--app-divider)] p-2" onSubmit={e => { e.preventDefault(); if(text) { send({type:'text',text}); setText('') } }}><input aria-label="发送文字到 Edge" placeholder="点选网页输入框后，在此输入中文…" className="min-w-0 flex-1 rounded bg-[var(--app-bg)] p-2 text-xs" value={text} onChange={e => setText(e.target.value)} /><button className="text-xs">输入</button></form> : null}
    </aside>
}
