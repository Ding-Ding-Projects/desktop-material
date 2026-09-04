import * as React from 'react'
import { Repository } from '../../models/repository'
import { IMergeAllState, MergeAllMode } from '../../lib/automation/merge-all'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { MaterialSymbol } from '../lib/material-symbol'

interface IMergeAllDialogProps {
  readonly repository: Repository
  readonly mode: MergeAllMode
  readonly state: IMergeAllState | null
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IMergeAllDialogState {
  readonly started: boolean
  readonly checkpointDirtyWorktrees: boolean
  readonly forceMatDay: boolean
}

export class MergeAllDialog extends React.Component<
  IMergeAllDialogProps,
  IMergeAllDialogState
> {
  public constructor(props: IMergeAllDialogProps) {
    super(props)
    this.state = {
      started: false,
      checkpointDirtyWorktrees: false,
      forceMatDay: false,
    }
  }

  private isRunning(): boolean {
    if (!this.state.started) {
      return false
    }
    const phase = this.props.state?.phase
    return (
      phase === undefined || (phase !== 'complete' && phase !== 'cancelled')
    )
  }

  private onStart = () => {
    if (this.state.started) {
      return
    }
    this.setState({ started: true })
    void this.props.dispatcher.mergeAllIntoDefaultBranch(
      this.props.repository,
      this.props.mode,
      {
        checkpointDirtyWorktrees: this.state.checkpointDirtyWorktrees,
        forceMatDay: this.state.forceMatDay,
      }
    )
  }

  private onCheckpointDirtyWorktreesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ checkpointDirtyWorktrees: event.currentTarget.checked })
  }

  private onForceMatDayChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const forceMatDay = event.currentTarget.checked
    this.setState({
      forceMatDay,
      checkpointDirtyWorktrees:
        forceMatDay || this.state.checkpointDirtyWorktrees,
    })
  }

  private onCancel = () => {
    this.props.dispatcher.cancelMergeAll(this.props.repository)
  }

  private onDismissed = () => {
    if (this.isRunning()) {
      this.onCancel()
    }
    this.props.onDismissed()
  }

  public render() {
    const state = this.props.state
    const title =
      this.props.mode === 'branches'
        ? 'Merge all branches'
        : 'Merge all worktrees'
    return (
      <Dialog id="merge-all" title={title} onDismissed={this.onDismissed}>
        <DialogContent>
          <p className="merge-all-intro">
            Branches are merged one at a time into the default branch. A branch
            is deleted only after Git reports a successful merge or that it is
            already up to date. Copilot resolves conflicts when possible;
            failures stay available.
          </p>
          {!this.state.started && this.props.mode === 'worktrees' && (
            <div className="merge-all-options">
              <Checkbox
                className="merge-all-checkpoint-option"
                value={
                  this.state.checkpointDirtyWorktrees
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                label="Commit, synchronize, and push dirty worktrees before merging"
                onChange={this.onCheckpointDirtyWorktreesChanged}
              />
              <Checkbox
                className="merge-all-checkpoint-option"
                value={
                  this.state.forceMatDay ? CheckboxValue.On : CheckboxValue.Off
                }
                label="Preserve dirty worktrees before merge"
                onChange={this.onForceMatDayChanged}
              />
              <p className="merge-all-option-help">
                Automatically preserve and publish recoverable work, relocate
                the default branch from another worktree, merge, push, prove,
                and clean up. Unsafe or unproved work is always retained.
              </p>
            </div>
          )}
          {state?.currentBranch && (
            <div className="merge-all-current" role="status">
              <MaterialSymbol name="sync" />
              <span>
                {state.phase}: <strong>{state.currentBranch}</strong>
              </span>
            </div>
          )}
          {state?.copilotProgress && (
            <p className="merge-all-copilot">
              <MaterialSymbol name="smart_toy" /> {state.copilotProgress}
            </p>
          )}
          <div
            className="merge-all-results-scroll"
            role="region"
            aria-label="Merge results"
            // This region is a keyboard-scrollable results surface.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
          >
            <table className="merge-all-results">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Result</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {(state?.results ?? []).map((result, index) => (
                  <tr key={`${result.branch}-${index}`}>
                    <td data-label="Branch">{result.branch}</td>
                    <td data-label="Result">
                      <span className={`merge-result ${result.status}`}>
                        {result.status}
                      </span>
                    </td>
                    <td data-label="Details">{result.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state?.phase === 'complete' && (
            <p className="merge-all-summary" role="status">
              Complete.{' '}
              {state.pushed
                ? 'The default branch was pushed.'
                : 'No push was needed.'}
            </p>
          )}
          {state?.phase === 'cancelled' && (
            <p className="merge-all-summary" role="status">
              Cancelled after the current safe stopping point.
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          {this.isRunning() ? (
            <Button onClick={this.onCancel}>Cancel</Button>
          ) : !this.state.started ? (
            <Button onClick={this.onStart}>Start merge all</Button>
          ) : (
            <Button onClick={this.onDismissed}>Done</Button>
          )}
        </DialogFooter>
      </Dialog>
    )
  }
}
