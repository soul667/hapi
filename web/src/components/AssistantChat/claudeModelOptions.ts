import { CLAUDE_MODEL_OPTIONS } from '@/lib/claudeModelCatalog'

export type ClaudeComposerModelOption = {
    value: string | null
    label: string
}

function normalizeClaudeComposerModel(model?: string | null): string | null {
    const trimmedModel = model?.trim()
    if (!trimmedModel || trimmedModel === 'auto' || trimmedModel === 'default') {
        return null
    }

    return trimmedModel
}

export function getClaudeComposerModelOptions(currentModel?: string | null): ClaudeComposerModelOption[] {
    const normalizedCurrentModel = normalizeClaudeComposerModel(currentModel)
    const options: ClaudeComposerModelOption[] = [
        { value: null, label: 'Default' }
    ]

    if (
        normalizedCurrentModel
        && !CLAUDE_MODEL_OPTIONS.some((option) => option.value === normalizedCurrentModel)
    ) {
        options.push({
            value: normalizedCurrentModel,
            label: normalizedCurrentModel
        })
    }

    options.push(...CLAUDE_MODEL_OPTIONS)

    return options
}

export function getNextClaudeComposerModel(currentModel?: string | null): string | null {
    const normalizedCurrentModel = normalizeClaudeComposerModel(currentModel)
    const options = getClaudeComposerModelOptions(normalizedCurrentModel)
    const currentIndex = options.findIndex((option) => option.value === normalizedCurrentModel)

    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }

    return options[(currentIndex + 1) % options.length]?.value ?? null
}
