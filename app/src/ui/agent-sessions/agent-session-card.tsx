import * as React from 'react'
import classNames from 'classnames'

import { IAgentSession } from '../../models/agent-session'
import { IAgentSessionRow } from '../../lib/agent-sessions'
import { MaterialSymbol } from '../lib/material-symbol'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AgentSessionChip } from './agent-session-chip'
import { t, translateForAccessibleName } from '../../lib/i18n'

interface IAgentSessionCardProps {
  readonly row: IAgentSessionRow
  readonly isSelected: boolean
  /** Roving tabindex: only the active card participates in tab order. */
  readonly isTabbable: boolean
  readonly onSelect: (session: IAgentSession) => void
  readonly onCancel?: (session: IAgentSession) => void
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
    if (!this.props.row.session.isMissing) {
      this.props.onSelect(this.props.row.session)
    }
  }

  private onCancel = () => {
    this.props.onCancel?.(this.props.row.session)
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
      states.push(t('agentSessions.locked'))
    }
    if (session.isMissing) {
      states.push(t('agentSessions.missing'))
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
          tabIndex={isTabbable && !session.isMissing ? 0 : -1}
          disabled={session.isMissing}
          aria-current={isSelected ? 'true' : undefined}
          onClick={this.onClick}
          onKeyDown={this.onKeyDown}
        >
          <MaterialSymbol
            className="agent-session-card-icon"
            name="account_tree"
            size={18}
          />
          <span className="agent-session-card-text">
            <TooltippedContent
              className="agent-session-card-name"
              tooltip={session.path}
              onlyWhenOverflowed={true}
            >
              {session.name}
            </TooltippedContent>
            <TooltippedContent
              className="agent-session-card-branch"
              tooltip={branch}
              onlyWhenOverflowed={true}
            >
              <span className="sr-only">
                {session.branch === null
                  ? t('agentSessions.detachedAt')
                  : t('agentSessions.onBranch')}
              </span>
              {branch}
            </TooltippedContent>
          </span>
          {this.renderState()}
          <AgentSessionChip chip={chip} />
        </button>
        {session.runState === 'running' && this.props.onCancel !== undefined && (
          <button
            type="button"
            className="agent-session-stop"
            aria-label={`${translateForAccessibleName('buildRun.stop')} — ${
              session.name
            }`}
            onClick={this.onCancel}
          >
            <MaterialSymbol name="cancel" size={18} />
            {t('buildRun.stop')}
          </button>
        )}
      </li>
    )
  }
}
