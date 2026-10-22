import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getSessionTitle } from '@/lib/sessionTitle'

type Selection = { selecting: boolean; pending: boolean; selected: Set<string>; toggle: (id: string) => void }
const SelectionContext = createContext<Selection | null>(null)
export const useBulkSessionSelection = () => useContext(SelectionContext)

export async function deleteSelectedSessions(api: Pick<ApiClient, 'deleteSession'>, sessions: SessionSummary[]) {
    const deleted: string[] = []
    const failed: string[] = []
    // Bound concurrency and let later rows succeed when one request fails.
    for (const session of sessions) {
        if (session.active) { failed.push(session.id); continue }
        try { await api.deleteSession(session.id); deleted.push(session.id) }
        catch { failed.push(session.id) }
    }
    return { deleted, failed }
}

export function BulkSessionSelection(props: {
    sessions: SessionSummary[]; api: ApiClient | null; onRefresh: () => Promise<unknown> | void; children: ReactNode
}) {
    const [selecting, setSelecting] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [pending, setPending] = useState(false)
    const [status, setStatus] = useState('')
    const eligible = useMemo(() => props.sessions.filter(s => !s.active), [props.sessions])
    const selectedSessions = eligible.filter(s => selected.has(s.id))
    const selectedIds = new Set(selectedSessions.map(s => s.id))
    const toggle = (id: string) => {
        if (pending || !eligible.some(s => s.id === id)) return
        setSelected(previous => {
            const next = new Set(previous)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }
    const deleteBatch = async () => {
        if (!props.api || pending) return
        setPending(true)
        const batch = [...selectedSessions]
        try {
            const result = await deleteSelectedSessions(props.api, batch)
            setSelected(new Set(result.failed))
            setStatus(`已删除 ${result.deleted.length} 个会话${result.failed.length ? `，${result.failed.length} 个失败，可重新选择并重试。` : '。'}`)
            setConfirmOpen(false)
            // A refresh error must not turn successful deletions into retry requests.
            try { await props.onRefresh() } catch { /* SSE also refreshes the list. */ }
        } finally { setPending(false) }
    }
    const buttonClass = 'rounded px-2 py-1 text-sm hover:bg-[var(--app-secondary-bg)] disabled:opacity-40'
    return (
        <SelectionContext.Provider value={{ selecting, pending, selected: selectedIds, toggle }}>
            <div className="flex min-h-0 w-full flex-1 flex-col">
                <div className="shrink-0 border-b border-[var(--app-divider)] px-2 py-1">
                    {!selecting ? (
                        <button type="button" className={buttonClass} disabled={!props.api} onClick={() => { setSelecting(true); setStatus('') }}>多选 / 批量删除</button>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-1">
                                <span className="text-xs">已选 {selectedSessions.length}</span>
                                <button type="button" className={buttonClass} disabled={pending || !eligible.length} onClick={() => setSelected(new Set(eligible.map(s => s.id)))}>全选筛选结果</button>
                                <button type="button" className={buttonClass} disabled={pending || !selectedSessions.length} onClick={() => setSelected(new Set())}>清空</button>
                                <button type="button" className={`${buttonClass} text-red-600`} disabled={pending || !selectedSessions.length} onClick={() => setConfirmOpen(true)}>批量删除 ({selectedSessions.length})</button>
                                <button type="button" className={buttonClass} disabled={pending} onClick={() => { setSelecting(false); setSelected(new Set()) }}>完成</button>
                            </div>
                            <p className="text-xs text-[var(--app-hint)]">全选包括筛选结果中折叠的会话；运行中的会话需先归档。</p>
                        </>
                    )}
                    {status ? <p role="status" className="text-xs">{status}</p> : null}
                </div>
                {props.children}
                <ConfirmDialog isOpen={confirmOpen} onClose={() => { if (!pending) setConfirmOpen(false) }}
                    title={`删除 ${selectedSessions.length} 个会话？`}
                    description={`将永久删除所选 HAPI 会话及消息，无法撤销。\n\n${selectedSessions.slice(0, 8).map(s => getSessionTitle(s)).join('\n')}${selectedSessions.length > 8 ? '\n…' : ''}`}
                    confirmLabel={`确认删除 ${selectedSessions.length} 个`} confirmingLabel="正在删除…"
                    onConfirm={deleteBatch} isPending={pending} destructive />
            </div>
        </SelectionContext.Provider>
    )
}
