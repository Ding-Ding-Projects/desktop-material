import * as React from 'react'
import memoizeOne from 'memoize-one'

import {
  IAgentSession,
  INewAgentSessionRequest,
} from '../../models/agent-session'
import {
  IAgentRunnerAvailability,
  buildAgentSessionFleet,
} from '../../lib/agent-sessions'
import { Button } from '../lib/button'
import { MaterialSymbol } from '../lib/material-symbol'
import { AgentSessionFleetList } from './agent-session-fleet-list'
import { NewAgentSessionForm } from './new-agent-session-form'

export interface IAgentSessionsPanelProps {
  /** Every worktree in the repository, whether or not an agent runs in it. */
  readonly sessions: ReadonlyArray<IAgentSession>
  /** Which runners the host detection probes found. */
  readonly availability: IAgentRunnerAvailability
  /** Short branch names offered as the base for a new session. */
  readonly baseBranches: ReadonlyArray<string>
  readonly defaultBaseBranch: string
  /** Short names of every local branch, used to refuse a duplicate name. */
  readonly existingBranchNames: ReadonlyArray<string>
  readonly selectedPath: string | null
  readonly onSelectSession: (session: IAgentSession) => void
  readonly onCreateSession: (request: INewAgentSessionRequest) => void
  /** True while a create is in flight. */
  readonly isCreating: boolean
  readonly onConfigureSetupCommands?: () => void
}

interface IAgentSessionsPanelState {
  readonly isCreatorOpen: boolean
}

/**
 * The Agents panel: every agent session in the repository at once.
 *
 * The panel is purely presentational — ordering, chip derivation and new-session
 * validation all live in `lib/agent-sessions` as plain functions over plain
 * data, so the interesting decisions are testable without a repository and this
 * component only has to render them.
 */
export class AgentSessionsPanel extends React.Component<
  IAgentSessionsPanelProps,
  IAgentSessionsPanelState
> {
  private getFleet = memoizeOne(buildAgentSessionFleet)

  private getWorktreeNames = memoizeOne(
    (sessions: ReadonlyArray<IAgentSession>) => sessions.map(s => s.name)
  )

  public constructor(props: IAgentSessionsPanelProps) {
    super(props)
    this.state = { isCreatorOpen: false }
  }

  private onOpenCreator = () => {
    this.setState({ isCreatorOpen: true })
  }

  private onCloseCreator = () => {
    this.setState({ isCreatorOpen: false })
  }

  private onStart = (request: INewAgentSessionRequest) => {
    this.props.onCreateSession(request)
    this.setState({ isCreatorOpen: false })
  }

  private renderCreator() {
    if (!this.state.isCreatorOpen) {
      return null
    }

    return (
      <NewAgentSessionForm
        availability={this.props.availability}
        baseBranches={this.props.baseBranches}
        defaultBaseBranch={this.props.defaultBaseBranch}
        existingWorktreeNames={this.getWorktreeNames(this.props.sessions)}
        existingBranchNames={this.props.existingBranchNames}
        isStarting={this.props.isCreating}
        onStart={this.onStart}
        onCancel={this.onCloseCreator}
        onConfigureSetupCommands={this.props.onConfigureSetupCommands}
      />
    )
  }

  public render() {
    const rows = this.getFleet(this.props.sessions)

    return (
      <div className="agent-sessions-panel">
        <div className="agent-sessions-header">
          <h2 className="agent-sessions-title">
            Worktrees
            <span className="agent-sessions-count">{rows.length}</span>
          </h2>
          <Button
            className="new-agent-session-button"
            onClick={this.onOpenCreator}
            disabled={this.state.isCreatorOpen}
          >
            <MaterialSymbol name="add" size={18} />
            New Agent Session
          </Button>
        </div>
        {this.renderCreator()}
        <div className="agent-sessions-fleet-scroller">
          <AgentSessionFleetList
            rows={rows}
            selectedPath={this.props.selectedPath}
            onSelect={this.props.onSelectSession}
          />
        </div>
      </div>
    )
  }
}
