import { describe, expect, it } from 'vitest'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'

describe('getClaudeComposerModelOptions', () => {
    it('includes the active non-preset Claude model in the options list', () => {
        expect(getClaudeComposerModelOptions('claude-opus-4-1-20250805')).toEqual(expect.arrayContaining([
            { value: null, label: 'Default' },
            { value: 'claude-opus-4-1-20250805', label: 'claude-opus-4-1-20250805' },
            { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
        ]))
    })

    it('does not duplicate preset Claude models', () => {
        for (const model of ['opus', 'claude-sonnet-5-5', 'claude-opus-5-5']) {
            const options = getClaudeComposerModelOptions(model)
            expect(options.filter((option) => option.value === model)).toHaveLength(1)
            expect(options[0]).toEqual({ value: null, label: 'Default' })
        }
    })
})

describe('getNextClaudeComposerModel', () => {
    it('cycles from a non-preset Claude model to the next selectable model instead of auto', () => {
        expect(getNextClaudeComposerModel('claude-opus-4-1-20250805')).toBe('sonnet')
    })
})
