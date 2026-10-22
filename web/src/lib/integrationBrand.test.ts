import { describe,it,expect } from 'vitest'
import { getSessionAgentBrand,updateIntegrationBindings } from './integrationBrand'
describe('integration brand',()=>{
 it('keeps bridge identity after renaming',()=>{
  updateIntegrationBindings({renamed:'zcode',buddy:'codebuddy'})
  expect(getSessionAgentBrand({id:'renamed',metadata:{flavor:'dsh',name:'生成场景'}})).toBe('zcode')
  expect(getSessionAgentBrand({id:'buddy',metadata:{flavor:'dsh',name:'其他名字'}})).toBe('codebuddy')
 })
 it('preserves native flavor and falls back to bridge titles',()=>{
  expect(getSessionAgentBrand({id:'native',metadata:{flavor:'codex',name:'ZCode'}})).toBe('codex')
  expect(getSessionAgentBrand({id:'old',metadata:{flavor:'dsh',name:'ZCode ACP · test'}})).toBe('zcode')
  expect(getSessionAgentBrand({id:'unknown',metadata:{flavor:'dsh',name:'DSH'}})).toBe('dsh')
 })
})
