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
import { getPersistedLanguageMode, t } from '../../lib/i18n'

export interface IAgentSessionsPanelProps {
  /** Every worktree in the repository, whether or not an agent runs in it. */
  readonly sessions: ReadonlyArray<IAgentSession>
  /** Which runners the host probes found installed and authenticated. */
  readonly availability: IAgentRunnerAvailability
  /** Short branch names offered as the base for a new session. */
  readonly baseBranches: ReadonlyArray<string>
  readonly defaultBaseBranch: string
  /** Short names of every local branch, used to refuse a duplicate name. */
  readonly existingBranchNames: ReadonlyArray<string>
  readonly selectedPath: string | null
  readonly onSelectSession: (session: IAgentSession) => void
  readonly onCancelSession?: (session: IAgentSession) => void
  readonly onCreateSession: (
    request: INewAgentSessionRequest
  ) => boolean | Promise<boolean>
  /** True while a create is in flight. */
  readonly isCreating: boolean
  readonly onConfigureSetupCommands?: () => void
}

interface IAgentSessionsPanelState {
  readonly isCreatorOpen: boolean
  readonly isSubmitting: boolean
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
  private readonly newSessionButton = React.createRef<Button>()
  private mounted = false

  private getWorktreeNames = memoizeOne(
    (sessions: ReadonlyArray<IAgentSession>) => sessions.map(s => s.name)
  )

  public constructor(props: IAgentSessionsPanelProps) {
    super(props)
    this.state = { isCreatorOpen: false, isSubmitting: false }
  }

  public componentDidMount() {
    this.mounted = true
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private onOpenCreator = () => {
    this.setState({ isCreatorOpen: true, isSubmitting: false })
  }

  private onCloseCreator = () => {
    if (this.props.isCreating || this.state.isSubmitting) {
      return
    }
    this.setState({ isCreatorOpen: false }, () =>
      this.newSessionButton.current?.focus()
    )
  }

  private onStart = async (request: INewAgentSessionRequest) => {
    if (this.props.isCreating || this.state.isSubmitting) {
      return
    }

    this.setState({ isSubmitting: true })
    let accepted = false
    try {
      accepted = await this.props.onCreateSession(request)
    } catch {
      accepted = false
    }
    if (!this.mounted) {
      return
    }

    this.setState(
      {
        isCreatorOpen: accepted ? false : this.state.isCreatorOpen,
        isSubmitting: false,
      },
      () => {
        if (accepted) {
          this.newSessionButton.current?.focus()
        }
      }
    )
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
        isStarting={this.props.isCreating || this.state.isSubmitting}
        onStart={this.onStart}
        onCancel={this.onCloseCreator}
        onConfigureSetupCommands={this.props.onConfigureSetupCommands}
      />
    )
  }

  public render() {
    const rows = this.getFleet(this.props.sessions, getPersistedLanguageMode())

    return (
      <div className="agent-sessions-panel">
        <div className="agent-sessions-header">
          <h2 className="agent-sessions-title">
            {t('agentSessions.worktrees')}
            <span className="agent-sessions-count">{rows.length}</span>
          </h2>
          <Button
            ref={this.newSessionButton}
            className="new-agent-session-button"
            onClick={this.onOpenCreator}
            disabled={
              this.state.isCreatorOpen ||
              this.props.isCreating ||
              this.state.isSubmitting
            }
          >
            <MaterialSymbol name="add" size={18} />
            {t('agentSessions.newSession')}
          </Button>
        </div>
        {this.renderCreator()}
        <div className="agent-sessions-fleet-scroller">
          <AgentSessionFleetList
            rows={rows}
            selectedPath={this.props.selectedPath}
            onSelect={this.props.onSelectSession}
            onCancel={this.props.onCancelSession}
          />
        </div>
      </div>
    )
  }
}
