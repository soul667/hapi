/** Explicit Anthropic model IDs, alongside aliases that follow CLI defaults. */
export const CLAUDE_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'sonnet', label: 'Sonnet (latest)' },
    { value: 'sonnet[1m]', label: 'Sonnet 1M (latest)' },
    { value: 'opus', label: 'Opus (latest)' },
    { value: 'opus[1m]', label: 'Opus 1M (latest)' },
    { value: 'haiku', label: 'Haiku (latest)' },
    { value: 'fable', label: 'Fable (latest; may use credits)' },
    { value: 'fable[1m]', label: 'Fable 1M (latest; may use credits)' },
    { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
    { value: 'claude-opus-5-5', label: 'Opus 5.5' },
    { value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
    { value: 'claude-fable-5-1', label: 'Fable 5.1 (may use credits)' },
]
