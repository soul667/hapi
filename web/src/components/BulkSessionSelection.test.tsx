import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { BulkSessionSelection, deleteSelectedSessions, useBulkSessionSelection } from './BulkSessionSelection'

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: (props: { isOpen: boolean; onConfirm: () => Promise<void>; isPending: boolean; description: string }) => props.isOpen
        ? <div role="dialog"><p>{props.description}</p><button disabled={props.isPending} onClick={props.onConfirm}>确认执行</button></div> : null
}))
afterEach(cleanup)
const session = (id: string, active = false) => ({ id, active, metadata: { name: id } } as SessionSummary)
function Probe() {
    const state = useBulkSessionSelection()!
    return <button onClick={() => state.toggle('a')}>选择第一条</button>
}

describe('bulk deletion', () => {
    it('skips active sessions and continues after individual failures', async () => {
        const api = { deleteSession: vi.fn(async (id: string) => { if (id === 'b') throw new Error('409') }) }
        expect(await deleteSelectedSessions(api, [session('a'), session('b'), session('live', true), session('c')]))
            .toEqual({ deleted: ['a', 'c'], failed: ['b', 'live'] })
        expect(api.deleteSession.mock.calls.flat()).toEqual(['a', 'b', 'c'])
    })
    it('requires selection and confirmation; deletes only the currently filtered inactive set', async () => {
        const deleteSession = vi.fn().mockResolvedValue(undefined)
        const api = { deleteSession } as unknown as ApiClient
        const refresh = vi.fn()
        const view = render(<BulkSessionSelection sessions={[session('a'), session('hidden'), session('live', true)]} api={api} onRefresh={refresh}><Probe /></BulkSessionSelection>)
        fireEvent.click(screen.getByText('多选 / 批量删除'))
        fireEvent.click(screen.getByText('全选筛选结果'))
        view.rerender(<BulkSessionSelection sessions={[session('a'), session('live', true)]} api={api} onRefresh={refresh}><Probe /></BulkSessionSelection>)
        fireEvent.click(screen.getByText('批量删除 (1)'))
        expect(deleteSession).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog')).toHaveTextContent('无法撤销')
        fireEvent.click(screen.getByText('确认执行'))
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
        expect(deleteSession.mock.calls.flat()).toEqual(['a'])
        expect(screen.getByRole('status')).toHaveTextContent('已删除 1 个会话')
    })
    it('keeps failures selected for retry without repeating successful deletions', async () => {
        const deleteSession = vi.fn().mockImplementation(async (id: string) => { if (id === 'b') throw new Error('offline') })
        render(<BulkSessionSelection sessions={[session('a'), session('b')]} api={{ deleteSession } as unknown as ApiClient} onRefresh={vi.fn()}><Probe /></BulkSessionSelection>)
        fireEvent.click(screen.getByText('多选 / 批量删除'))
        fireEvent.click(screen.getByText('全选筛选结果'))
        fireEvent.click(screen.getByText('批量删除 (2)'))
        fireEvent.click(screen.getByText('确认执行'))
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 个失败'))
        expect(screen.getByText('批量删除 (1)')).toBeEnabled()
        fireEvent.click(screen.getByText('批量删除 (1)'))
        fireEvent.click(screen.getByText('确认执行'))
        await waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(3))
        expect(deleteSession.mock.calls.flat()).toEqual(['a', 'b', 'b'])
    })
})
