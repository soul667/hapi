import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { IntegrationModelControl } from './IntegrationModelControl'
afterEach(cleanup)
const info={agent:'zcode',model:'p\\GLM-5.3',models:[{value:'p\\GLM-5.3',name:'GLM-5.3'},{value:'p\\GLM-5.3-Flash',name:'GLM-5.3-Flash'}]}
describe('integration model control',()=>{
 it('uses account model options and sends selected model for the same session',async()=>{
  const api={getIntegrationSession:vi.fn().mockResolvedValue(info),setIntegrationModel:vi.fn().mockResolvedValue({...info,model:'p\\GLM-5.3-Flash'})}
  render(<IntegrationModelControl api={api as unknown as ApiClient} sessionId="existing" busy={false} active />)
  const select=await screen.findByRole('combobox',{name:'ZCode 会话模型'})
  fireEvent.change(select,{target:{value:'p\\GLM-5.3-Flash'}})
  await waitFor(()=>expect(api.setIntegrationModel).toHaveBeenCalledWith('existing','p\\GLM-5.3-Flash'))
  await waitFor(()=>expect(select).toHaveValue('p\\GLM-5.3-Flash'))
 })
 it('does not interrupt busy sessions',async()=>{
  const api={getIntegrationSession:vi.fn().mockResolvedValue(info),setIntegrationModel:vi.fn()}
  render(<IntegrationModelControl api={api as unknown as ApiClient} sessionId="busy" busy active />)
  expect(await screen.findByRole('combobox')).toBeDisabled()
  expect(api.setIntegrationModel).not.toHaveBeenCalled()
 })
 it('offers native CodeBuddy Full Access and applies it to the existing session',async()=>{
  const buddy={agent:'codebuddy',model:null,models:[],permissionMode:'default',permissionModes:[{value:'default',name:'Default'},{value:'fullAccess',name:'Full Access'}]}
  const api={getIntegrationSession:vi.fn().mockResolvedValue(buddy),setIntegrationPermission:vi.fn().mockResolvedValue({...buddy,permissionMode:'fullAccess'})}
  render(<IntegrationModelControl api={api as unknown as ApiClient} sessionId="buddy-existing" busy={false} active />)
  const select=await screen.findByRole('combobox',{name:'CodeBuddy 执行权限'})
  fireEvent.change(select,{target:{value:'fullAccess'}})
  await waitFor(()=>expect(api.setIntegrationPermission).toHaveBeenCalledWith('buddy-existing','fullAccess'))
  await waitFor(()=>expect(select).toHaveValue('fullAccess'))
 })

})
