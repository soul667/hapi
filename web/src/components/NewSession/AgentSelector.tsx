import { getFlavorLabel } from '@hapi/protocol'
import type { AgentType } from './types'
import { AgentFlavorIcon } from '@/components/AgentFlavorIcon'
import { useTranslation } from '@/lib/use-translation'

export function AgentSelector(props: {
    integration?: string | null
    onIntegrationChange?: (value: 'codebuddy' | 'zcode') => void
    agent: AgentType
    agents: readonly AgentType[]
    isDisabled: boolean
    onAgentChange: (value: AgentType) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.agent')}
            </label>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
                {(['codebuddy', 'zcode'] as const).map(value => (
                    <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="agent" value={value}
                            checked={props.integration === value}
                            onChange={() => props.onIntegrationChange?.(value)}
                            disabled={props.isDisabled} className="accent-[var(--app-link)]" />
                        <span className="text-sm">{value === 'codebuddy' ? 'CodeBuddy / WorkBuddy' : 'ZCode'}</span>
                    </label>
                ))}
                {props.agents.map((agentType) => (
                    <label
                        key={agentType}
                        className="flex items-center gap-1.5 cursor-pointer"
                    >
                        <input
                            type="radio"
                            name="agent"
                            value={agentType}
                            checked={!props.integration && props.agent === agentType}
                            onChange={() => props.onAgentChange(agentType)}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <AgentFlavorIcon flavor={agentType} className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{getFlavorLabel(agentType)}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}
