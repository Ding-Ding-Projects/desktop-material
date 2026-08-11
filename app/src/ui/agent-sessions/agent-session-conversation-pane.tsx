import * as React from 'react'

import { IAgentSessionRow } from '../../lib/agent-sessions'
import { MaterialSymbol } from '../lib/material-symbol'
import { TooltippedContent } from '../lib/tooltipped-content'
import {
  AgentSessionConversationRole,
  IAgentSessionConversation,
} from './agent-session-conversation'
import { codingAgentDisplayName } from './agent-session-localization'
import { t, translateForAccessibleName } from '../../lib/i18n'

interface IAgentSessionConversationPaneProps {
  readonly row: IAgentSessionRow | null
  readonly conversation: IAgentSessionConversation | null
}

function turnLabel(
  role: AgentSessionConversationRole,
  agentName: string
): string {
  switch (role) {
    case 'instruction':
      return t('agentSessions.taskLabel')
    case 'output':
      return agentName
    case 'error':
      return t('agentSessions.status.errorLabel')
    case 'meta':
      return agentName
  }
}

/**
 * The real runner transcript for the selected worktree.
 *
 * Detached coding-agent runs do not accept follow-up stdin, so this deliberately
 * renders captured instructions and streamed output without a decorative send
 * box that would pretend to be interactive.
 */
export class AgentSessionConversationPane extends React.Component<IAgentSessionConversationPaneProps> {
  public render() {
    const { row, conversation } = this.props
    if (row === null) {
      return (
        <section
          className="agent-session-conversation empty"
          aria-label={translateForAccessibleName('agentSessions.agentsTab')}
        >
          <MaterialSymbol name="terminal" size={30} />
        </section>
      )
    }

    const { session, chip } = row
    const agentName = codingAgentDisplayName(session.agent)
    const branch = session.branch ?? session.head.slice(0, 8)
    const turns = conversation?.turns ?? []
    const headingHash =
      session.path
        .split('')
        .reduce(
          (value, char) => Math.imul(value, 31) + char.charCodeAt(0),
          7
        ) >>> 0
    const headingId = `agent-session-conversation-${headingHash}`

    return (
      <section
        className="agent-session-conversation"
        aria-labelledby={headingId}
      >
        <header className="agent-session-conversation-header">
          <MaterialSymbol
            className="agent-session-conversation-icon"
            name="terminal"
            size={19}
          />
          <span className="agent-session-conversation-heading">
            <TooltippedContent
              id={headingId}
              className="agent-session-conversation-name"
              tooltip={session.path}
              onlyWhenOverflowed={true}
            >
              {session.name}
            </TooltippedContent>
            <span className="agent-session-conversation-branch">
              {branch} · {agentName}
            </span>
          </span>
          <span
            className={`agent-session-conversation-status ${chip.kind}`}
            role="status"
            aria-label={chip.accessibleLabel}
          >
            <span aria-hidden={true} />
          </span>
        </header>

        <div
          className="agent-session-conversation-log"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {turns.length === 0 ? (
            <div className="agent-session-conversation-empty" role="status">
              <MaterialSymbol name="menu_book" size={28} />
              <p>
                {session.agent === 'none'
                  ? t('agentSessions.noneHint')
                  : t('agentSessions.status.notMeasured', {
                      name: session.name,
                    })}
              </p>
              <code>{session.path}</code>
            </div>
          ) : (
            turns.map(turn => (
              <article
                key={turn.id}
                className={`agent-session-conversation-turn ${turn.role}`}
              >
                <span className="agent-session-conversation-role">
                  {turnLabel(turn.role, agentName)}
                </span>
                <pre>{turn.text}</pre>
              </article>
            ))
          )}
        </div>

        <footer className="agent-session-conversation-footer">
          <span>
            {session.diffStat === null
              ? t('agentSessions.status.notMeasured', { name: session.name })
              : t('agentSessions.status.diff', {
                  name: session.name,
                  added: String(session.diffStat.linesAdded),
                  deleted: String(session.diffStat.linesDeleted),
                  files:
                    session.diffStat.filesChanged === 1
                      ? t('agentSessions.status.oneFile')
                      : t('agentSessions.status.files', {
                          count: String(session.diffStat.filesChanged),
                        }),
                })}
          </span>
          <span className="agent-session-conversation-live-state">
            <span aria-hidden="true" />
            {conversation?.status ?? session.runState}
          </span>
        </footer>
      </section>
    )
  }
}
