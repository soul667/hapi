import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePanel, workspaceUrlAllowed } from './WorkspacePanel'
import type { ApiClient } from '@/api/client'
afterEach(cleanup)
describe('workspace panel', () => {
    it('rejects other sites, credentials, insecure schemes and unusual ports', () => {
        expect(workspaceUrlAllowed('figma','https://www.figma.com/design/abc')).toBe(true)
        expect(workspaceUrlAllowed('notion','https://app.notion.com/a')).toBe(true)
        for(const url of ['https://figma.com.evil.test','http://figma.com','https://user:secret@figma.com','javascript:alert(1)','https://figma.com:444','https://notion.com']) expect(workspaceUrlAllowed('figma',url)).toBe(false)
    })
    it('shows real disconnected state and obtains pairing only on request', async () => {
        const workspaceRequest=vi.fn(async (path:string) => path === 'pair' ? {code:'one-time-test-code'} : path === 'status' ? {connected:false,proxyReady:true,proxy:{country:'HK'},errors:{}} : {frame:null})
        render(<WorkspacePanel api={{workspaceRequest} as unknown as ApiClient} />)
        expect(workspaceRequest).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button',{name:'打开 Figma / Notion 工作台'}))
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('等待 Edge 扩展配对'))
        expect(screen.getByRole('tab',{name:'Figma'})).toHaveAttribute('aria-selected','true')
        fireEvent.click(screen.getByRole('tab',{name:'Notion'}))
        expect(screen.getByRole('tab',{name:'Notion'})).toHaveAttribute('aria-selected','true')
        fireEvent.click(screen.getByRole('button',{name:'生成配对码'}))
        await waitFor(() => expect(screen.getByRole('textbox',{name:'一次性配对码'})).toHaveValue('one-time-test-code'))
        fireEvent.click(screen.getByRole('button',{name:'关闭工作台'}))
        expect(screen.getByRole('button',{name:'打开 Figma / Notion 工作台'})).toBeVisible()
    })
})
