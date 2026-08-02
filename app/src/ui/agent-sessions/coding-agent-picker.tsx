import * as React from 'react'

import { CodingAgentId } from '../../models/agent-session'
import {
  IAgentRunnerAvailability,
  ICodingAgentOption,
  resolveCodingAgentOptions,
} from '../../lib/agent-sessions'
import { Select } from '../lib/select'
import { t } from '../../lib/i18n'
import { codingAgentDisplayName } from './agent-session-localization'

interface ICodingAgentPickerProps {
  readonly value: CodingAgentId
  readonly availability: IAgentRunnerAvailability
  readonly onChange: (agent: CodingAgentId) => void
  readonly disabled?: boolean
}

/**
 * The coding-agent picker.
 *
 * Every listed agent has a real runner behind it. An agent whose CLI is not
 * installed on this host is still shown, disabled, with the reason in its
 * visible label — the option exists and the user can make it work by
 * installing the CLI, which is a different situation from an agent this app
 * cannot launch at all (those are not listed).
 */
export class CodingAgentPicker extends React.Component<ICodingAgentPickerProps> {
  private onChange = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onChange(event.currentTarget.value as CodingAgentId)
  }

  private renderOption(option: ICodingAgentOption) {
    const name = codingAgentDisplayName(option.agent.id)
    const label =
      option.unavailableReason === null
        ? name
        : option.unavailableReason === 'not authenticated'
        ? t('agentSessions.agent.notAuthenticated', { name })
        : option.unavailableReason === 'not detected'
        ? t('agentSessions.agent.notDetected', { name })
        : `${name} — ${option.unavailableReason}`
    return (
      <option
        key={option.agent.id}
        value={option.agent.id}
        disabled={option.disabled}
      >
        {label}
      </option>
    )
  }

  public render() {
    const options = resolveCodingAgentOptions(this.props.availability)

    return (
      <div className="coding-agent-picker">
        <Select
          label={t('agentSessions.codingAgent')}
          value={this.props.value}
          onChange={this.onChange}
          disabled={this.props.disabled}
        >
          {options.map(option => this.renderOption(option))}
        </Select>
        <p className="coding-agent-picker-hint">
          {t('agentSessions.noneHint')}
        </p>
      </div>
    )
  }
}
