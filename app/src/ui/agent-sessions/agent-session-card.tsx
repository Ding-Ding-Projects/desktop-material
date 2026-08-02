import * as React from 'react'
import classNames from 'classnames'

import { IAgentSession } from '../../models/agent-session'
import { IAgentSessionRow } from '../../lib/agent-sessions'
import { MaterialSymbol } from '../lib/material-symbol'
import { AgentSessionChip } from './agent-session-chip'

interface IAgentSessionCardProps {
  readonly row: IAgentSessionRow
  readonly isSelected: boolean
  /** Roving tabindex: only the active card participates in tab order. */
  readonly isTabbable: boolean
  readonly onSelect: (session: IAgentSession) => void
  readonly onKeyDown: (
    session: IAgentSession,
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => void
  readonly onButtonRef: (path: string, button: HTMLButtonElement | null) => void
}

/**
 * One session in the fleet.
 *
 * The card is a real `<button>`, so activation, focus ring and screen-reader
 * role all come from the platform. Every piece of text stays in the DOM at full
 * length — truncation is CSS only — so a long branch name is still readable
 * through the tooltip and still reaches the card's accessible name.
 */
export class AgentSessionCard extends React.Component<IAgentSessionCardProps> {
  private onClick = () => {
    this.props.onSelect(this.props.row.session)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    this.props.onKeyDown(this.props.row.session, event)
  }

  private onButtonRef = (button: HTMLButtonElement | null) => {
    this.props.onButtonRef(this.props.row.session.path, button)
  }

  private renderState() {
    const { session } = this.props.row
    const states: Array<string> = []
    if (session.isLocked) {
      states.push('Locked')
    }
    if (session.isMissing) {
      states.push('Missing')
    }
    if (states.length === 0) {
      return null
    }

    return (
      <span className="agent-session-card-state">{states.join(' · ')}</span>
    )
  }

  public render() {
    const { row, isSelected, isTabbable } = this.props
    const { session, chip } = row
    const branch = session.branch ?? session.head.slice(0, 8)

    return (
      <li className="agent-session-card-row">
        <button
          type="button"
          className={classNames('agent-session-card', {
            selected: isSelected,
            'main-worktree': session.isMainWorktree,
          })}
          ref={this.onButtonRef}
          tabIndex={isTabbable ? 0 : -1}
          onClick={this.onClick}
          onKeyDown={this.onKeyDown}
          title={session.path}
        >
          <MaterialSymbol
            className="agent-session-card-icon"
            name="account_tree"
            size={18}
          />
          <span className="agent-session-card-text">
            <span className="agent-session-card-name">{session.name}</span>
            <span className="agent-session-card-branch">
              <span className="sr-only">
                {session.branch === null ? 'detached at ' : 'on branch '}
              </span>
              {branch}
            </span>
          </span>
          {this.renderState()}
          <AgentSessionChip chip={chip} />
        </button>
      </li>
    )
  }
}
