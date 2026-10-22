import { useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
type Info = { agent: string; model: string | null; models: { value: string; name: string }[]; permissionMode?: string; permissionModes?: {value:string;name:string}[] }
export function IntegrationModelControl(props: { api: ApiClient | null; sessionId: string; busy: boolean; active: boolean }) {
    const [info, setInfo] = useState<Info | null>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    useEffect(() => {
        if (!props.api?.getIntegrationSession) return
        let alive = true
        setInfo(null)
        props.api.getIntegrationSession<Info>(props.sessionId).then(value => { if (alive) setInfo(value) }).catch(() => {})
        return () => { alive = false }
    }, [props.api, props.sessionId, props.active])
    if (!info || !['zcode','codebuddy'].includes(info.agent)) return null
    const isBuddy = info.agent === 'codebuddy'
    const current = info.models.find(m => m.value === info.model || m.name === info.model)?.value || ''
    return <div className="shrink-0 border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><label htmlFor={`zcode-model-${props.sessionId}`}>{isBuddy ? 'CodeBuddy 执行权限' : 'ZCode 模型'}</label>
            <select id={`zcode-model-${props.sessionId}`} aria-label={isBuddy ? 'CodeBuddy 执行权限' : 'ZCode 会话模型'} className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1" value={isBuddy ? info.permissionMode : current} disabled={pending || props.busy} onChange={async event => {
                if (!props.api) return
                const model = event.target.value
                setPending(true); setError('')
                try { setInfo(isBuddy ? await props.api.setIntegrationPermission<Info>(props.sessionId, model) : await props.api.setIntegrationModel<Info>(props.sessionId, model)) }
                catch (e) { setError(e instanceof Error ? e.message : '切换失败') }
                finally { setPending(false) }
            }}>
                {!isBuddy && !current ? <option value="" disabled>当前模型</option> : null}
                {(isBuddy ? info.permissionModes || [] : info.models).map(model => <option key={model.value} value={model.value}>{model.value === 'fullAccess' ? '全部执行（Full Access）' : model.name}</option>)}
            </select><span role="status" className="text-[var(--app-hint)]">{pending ? '正在切换并恢复原会话…' : props.busy ? '当前任务结束后可切换' : '切换时短暂重连，保留会话上下文'}</span>
        </div>{error ? <p role="alert" className="mt-1 text-red-600">{error}</p> : null}
    </div>
}
