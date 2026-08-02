import * as React from 'react'
import classNames from 'classnames'

import { IAgentSessionChip } from '../../models/agent-session'
import { MaterialSymbol } from '../lib/material-symbol'

interface IAgentSessionChipProps {
  readonly chip: IAgentSessionChip
}

/**
 * The live status chip on a fleet card: `+97`, `Error`, or a pencil and an
 * edited-file count.
 *
 * The visible label is terse because a fleet of cards has no room for a
 * sentence, so the chip carries its full derived description in a
 * screen-reader-only span. That span sits inside the card's own button, so it
 * lands in the card's accessible name — the status is never signalled by the
 * chip's colour alone.
 */
export class AgentSessionChip extends React.Component<IAgentSessionChipProps> {
  public render() {
    const { chip } = this.props
    const className = classNames(
      'agent-session-chip',
      `agent-session-chip-${chip.kind}`
    )

    return (
      <span className={className}>
        {chip.showsDot && <span className="agent-session-chip-dot" />}
        {chip.kind === 'working' && (
          <MaterialSymbol
            className="agent-session-chip-icon"
            name="edit"
            size={14}
          />
        )}
        <span aria-hidden="true">{chip.label}</span>
        <span className="sr-only">{chip.accessibleLabel}</span>
      </span>
    )
  }
}
