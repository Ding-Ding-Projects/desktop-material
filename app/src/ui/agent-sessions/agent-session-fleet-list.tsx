import * as React from 'react'

import { IAgentSession } from '../../models/agent-session'
import { IAgentSessionRow } from '../../lib/agent-sessions'
import { AgentSessionCard } from './agent-session-card'

interface IAgentSessionFleetListProps {
  readonly rows: ReadonlyArray<IAgentSessionRow>
  readonly selectedPath: string | null
  readonly onSelect: (session: IAgentSession) => void
}

interface IAgentSessionFleetListState {
  /** The card that owns the tab stop. Kept separate from selection so
   * arrowing through the fleet does not act on anything. */
  readonly activePath: string | null
}

/**
 * The fleet: one card per worktree, ordered by how much attention it wants.
 *
 * Keyboard handling is the standard roving-tabindex pattern — one tab stop for
 * the whole list, arrows to move within it, Home/End to jump — so a fleet of
 * twenty sessions costs a keyboard user one tab, not twenty.
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
    const candidates = [this.state.activePath, selectedPath]
    for (const candidate of candidates) {
      if (candidate !== null && rows.some(r => r.session.path === candidate)) {
        return candidate
      }
    }
    return rows.length === 0 ? null : rows[0].session.path
  }

  private onButtonRef = (path: string, button: HTMLButtonElement | null) => {
    if (button === null) {
      this.buttons.delete(path)
    } else {
      this.buttons.set(path, button)
    }
  }

  private focusRow(index: number) {
    const { rows } = this.props
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
    const index = this.props.rows.findIndex(
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
        this.focusRow(this.props.rows.length - 1)
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
          No worktrees yet. Create one to start an agent session.
        </div>
      )
    }

    const tabbablePath = this.tabbablePath

    return (
      <ul className="agent-session-fleet" aria-label="Worktrees">
        {rows.map(row => (
          <AgentSessionCard
            key={row.session.path}
            row={row}
            isSelected={row.session.path === selectedPath}
            isTabbable={row.session.path === tabbablePath}
            onSelect={this.props.onSelect}
            onKeyDown={this.onKeyDown}
            onButtonRef={this.onButtonRef}
          />
        ))}
      </ul>
    )
  }
}
