import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { ActionsStore, IActionsState } from '../../lib/stores/actions-store'
import { IAPIWorkflowRun } from '../../lib/api'
import { RunArtifacts } from './run-artifacts'

/**
 * A run's artifacts, as their own dialog.
 *
 * The classic layout rendered `RunArtifacts` inside the run-details side pane.
 * The MD3 shell has no such pane — the Actions destination puts the run's own
 * detail in the main area — so the artifact list needs a home of its own, and
 * had none: the view's Artifacts button was never drawn, because nothing
 * supplied the handler that opens it.
 *
 * This wraps the existing surface rather than reimplementing it. Downloading,
 * revealing and provenance are unchanged, so the two layouts cannot drift into
 * offering different artifact behaviour.
 *
 * The run is looked up from the store rather than passed in, because the popup
 * has to survive a refresh: holding the run object would pin a snapshot taken
 * when the button was clicked, and an artifact list built from a stale run is
 * the kind of wrong that looks completely normal.
 */

interface IActionsRunArtifactsDialogProps {
  readonly repository: Repository
  readonly runId: number
  readonly actionsStore: ActionsStore
  readonly onDismissed: () => void
}

interface IActionsRunArtifactsDialogState {
  readonly run: IAPIWorkflowRun | null
}

export class ActionsRunArtifactsDialog extends React.Component<
  IActionsRunArtifactsDialogProps,
  IActionsRunArtifactsDialogState
> {
  private disposable: { dispose(): void } | null = null

  public constructor(props: IActionsRunArtifactsDialogProps) {
    super(props)
    // `null` until the store reports, which it does on subscribe. The empty
    // state below says so rather than rendering a blank panel.
    this.state = { run: null }
  }

  public componentDidMount() {
    this.disposable = this.props.actionsStore.subscribe(
      this.props.repository,
      state => this.setState({ run: this.lookup(state) })
    )
  }

  public componentWillUnmount() {
    this.disposable?.dispose()
    this.disposable = null
  }

  private lookup(state: IActionsState): IAPIWorkflowRun | null {
    return (
      state.runs.find(candidate => candidate.id === this.props.runId) ?? null
    )
  }

  public render() {
    const run = this.state.run

    return (
      <Dialog
        id="actions-run-artifacts"
        title={
          run === null
            ? 'Run artifacts'
            : `Artifacts for run #${run.run_number}`
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>
          {run === null ? (
            // An honest empty state rather than an empty dialog: the run may
            // have aged out of the loaded page, and saying so is more useful
            // than a blank panel that reads as a failure to load.
            <p>
              This run is no longer in the loaded list, so its artifacts cannot
              be shown. Refresh the Actions list and try again.
            </p>
          ) : (
            <RunArtifacts
              repository={this.props.repository}
              run={run}
              actionsStore={this.props.actionsStore}
            />
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Close"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
