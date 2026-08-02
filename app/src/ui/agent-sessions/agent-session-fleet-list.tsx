import * as React from 'react'

import { IAgentSession } from '../../models/agent-session'
import {
  IAgentSessionRow,
  canonicalAgentSessionPath,
} from '../../lib/agent-sessions'
import { AgentSessionCard } from './agent-session-card'
import { t, translateForAccessibleName } from '../../lib/i18n'

interface IAgentSessionFleetListProps {
  readonly rows: ReadonlyArray<IAgentSessionRow>
  readonly selectedPath: string | null
  readonly onSelect: (session: IAgentSession) => void
  readonly onCancel?: (session: IAgentSession) => void
}

interface IAgentSessionFleetListState {
  /** The card that owns the tab stop. Kept separate from selection so
   * arrowing through the fleet does not act on anything. */
  readonly activePath: string | null
}

/**
 * The fleet: one card per worktree, ordered by how much attention it wants.
 *
 * Keyboard handling is the standard roving-tabindex pattern for the card set:
 * arrows move within it and Home/End jump, so twenty sessions cost one card tab
 * stop. A running card's independent Stop action remains separately reachable.
 */
export class AgentSessionFleetList extends React.Component<
  IAgentSessionFleetListProps,
  IAgentSessionFleetListState
> {
  private readonly buttons = new Map<string, HTMLButtonElement>()

  public constructor(props: IAgentSessionFleetListProps) {
    super(props)
    this.state = { activePath: null }
  }

  private get tabbablePath(): string | null {
    const { rows, selectedPath } = this.props
    const selectableRows = rows.filter(row => !row.session.isMissing)
    const candidates = [this.state.activePath, selectedPath]
    for (const candidate of candidates) {
      if (
        candidate !== null &&
        selectableRows.some(
          row =>
            canonicalAgentSessionPath(row.session.path) ===
            canonicalAgentSessionPath(candidate)
        )
      ) {
        return selectableRows.find(
          row =>
            canonicalAgentSessionPath(row.session.path) ===
            canonicalAgentSessionPath(candidate)
        )!.session.path
      }
    }
    return selectableRows.length === 0 ? null : selectableRows[0].session.path
  }

  private onButtonRef = (path: string, button: HTMLButtonElement | null) => {
    if (button === null) {
      this.buttons.delete(path)
    } else {
      this.buttons.set(path, button)
    }
  }

  private focusRow(index: number) {
    const rows = this.props.rows.filter(row => !row.session.isMissing)
    if (rows.length === 0) {
      return
    }
    const clamped = Math.min(Math.max(index, 0), rows.length - 1)
    const path = rows[clamped].session.path
    this.setState({ activePath: path }, () => this.buttons.get(path)?.focus())
  }

  private onKeyDown = (
    session: IAgentSession,
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    const selectableRows = this.props.rows.filter(row => !row.session.isMissing)
    const index = selectableRows.findIndex(
      row => row.session.path === session.path
    )
    if (index === -1) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        this.focusRow(index + 1)
        break
      case 'ArrowUp':
        this.focusRow(index - 1)
        break
      case 'Home':
        this.focusRow(0)
        break
      case 'End':
        this.focusRow(selectableRows.length - 1)
        break
      default:
        return
    }

    // Only reached when a key was handled, so the list never swallows Tab,
    // Enter, Space, or a shortcut the surrounding app owns.
    event.preventDefault()
  }

  public render() {
    const { rows, selectedPath } = this.props

    if (rows.length === 0) {
      return (
        <div className="agent-session-fleet-empty">
          {t('agentSessions.empty')}
        </div>
      )
    }

    const tabbablePath = this.tabbablePath
    const selectedPathKey =
      selectedPath === null ? null : canonicalAgentSessionPath(selectedPath)

    return (
      <ul
        className="agent-session-fleet"
        aria-label={translateForAccessibleName('agentSessions.worktrees')}
      >
        {rows.map(row => (
          <AgentSessionCard
            key={row.session.path}
            row={row}
            isSelected={
              selectedPathKey !== null &&
              canonicalAgentSessionPath(row.session.path) === selectedPathKey
            }
            isTabbable={row.session.path === tabbablePath}
            onSelect={this.props.onSelect}
            onCancel={this.props.onCancel}
            onKeyDown={this.onKeyDown}
            onButtonRef={this.onButtonRef}
          />
        ))}
      </ul>
    )
  }
}
