const bindings = new Map<string, string>()
export function updateIntegrationBindings(values: Record<string, string>) {
    for (const [id, value] of Object.entries(values)) if (value === 'zcode' || value === 'codebuddy') bindings.set(id, value)
}
export function getSessionAgentBrand(session: { id: string; metadata?: { flavor?: string | null; name?: string | null } | null }): string {
    const flavor = session.metadata?.flavor || ''
    if (flavor !== 'dsh') return flavor
    return bindings.get(session.id) || (/^zcode\b/i.test(session.metadata?.name || '') ? 'zcode' : /^(codebuddy|workbuddy)\b/i.test(session.metadata?.name || '') ? 'codebuddy' : flavor)
}
