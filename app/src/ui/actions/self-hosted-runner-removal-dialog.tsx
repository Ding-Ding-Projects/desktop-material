import * as React from 'react'

import { ISelfHostedRunner } from '../../lib/self-hosted-runner/types'
import { Button } from '../lib/button'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'
import { trapActionsDialogFocus } from './actions-dialog-focus'

interface ISelfHostedRunnerRemovalDialogProps {
  readonly runner: ISelfHostedRunner
  readonly submitting: boolean
  readonly error: Error | null
  readonly progressMessage: string | null
  readonly onConfirm: () => void
  readonly onDismissed: () => void
}

interface ISelfHostedRunnerRemovalDialogState {
  readonly gateAuthorized: boolean
}

let removalDialogSequence = 0

/**
 * The destructive-action gate for unregistering a self-hosted runner.
 *
 * The two keys, the authorization slider, the progress treatment and the
 * completion treatment all come from the shared
 * `Md3DestructiveGateBody`. This dialog owns only the chrome around it: the
 * heading naming the exact runner, the emergency exit, the submit button it
 * holds disabled until the gate reports itself authorized, and the running and
 * failure states of the removal itself, which are facts about the operation
 * rather than part of the gate.
 */
export class SelfHostedRunnerRemovalDialog extends React.Component<
  ISelfHostedRunnerRemovalDialogProps,
  ISelfHostedRunnerRemovalDialogState
> {
  private dismissButton: HTMLButtonElement | null = null
  private previousFocus: HTMLElement | null = null
  private readonly titleId: string
  private readonly descriptionId: string
  private readonly progressId: string
  private readonly errorId: string

  public constructor(props: ISelfHostedRunnerRemovalDialogProps) {
    super(props)
    const instanceId = ++removalDialogSequence
    this.titleId = `self-hosted-runner-removal-title-${instanceId}`
    this.descriptionId = `self-hosted-runner-removal-description-${instanceId}`
    this.progressId = `self-hosted-runner-removal-progress-${instanceId}`
    this.errorId = `self-hosted-runner-removal-error-${instanceId}`
    this.state = { gateAuthorized: false }
  }

  public componentDidMount() {
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    this.dismissButton?.focus()
  }

  public componentWillUnmount() {
    if (this.previousFocus?.isConnected) {
      this.previousFocus.focus()
    }
  }

  private setDismissButtonRef = (button: HTMLButtonElement | null) => {
    this.dismissButton = button
  }

  private onGateAuthorizationChanged = (gateAuthorized: boolean) => {
    this.setState({ gateAuthorized })
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    event.stopPropagation()
    trapActionsDialogFocus(event, event.currentTarget)
    if (event.key === 'Escape' && !this.props.submitting) {
      event.preventDefault()
      this.props.onDismissed()
    }
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!this.props.submitting && this.state.gateAuthorized) {
      this.props.onConfirm()
    }
  }

  /** What the confirmed removal destroys, in the words the user needs. */
  private removalSummary() {
    const { runner } = this.props
    const scope = `${runner.owner}/${runner.repository}`
    const wsl = runner.dedicatedWsl
      ? ` The dedicated WSL distro ${
          runner.wslDistribution ?? 'created for it'
        } is deleted after GitHub unregisters the runner.`
      : ''
    return `This permanently unregisters ${runner.name} from ${scope} and deletes its managed runner files.${wsl}`
  }

  public render() {
    const { runner, submitting, error, progressMessage, onDismissed } =
      this.props
    const scope = `${runner.owner}/${runner.repository}`
    const describedBy = [
      this.descriptionId,
      progressMessage ? this.progressId : null,
      error ? this.errorId : null,
    ]
      .filter((value): value is string => value !== null)
      .join(' ')

    return (
      <div className="actions-dialog-layer">
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          className="actions-confirmation-dialog actions-runner-super-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={this.titleId}
          aria-describedby={describedBy}
          aria-busy={submitting}
          tabIndex={-1}
          onKeyDown={this.onKeyDown}
          onSubmit={this.onSubmit}
        >
          <header>
            <div>
              <span className="eyebrow">Destructive action</span>
              <h2 id={this.titleId}>Remove {runner.name}?</h2>
            </div>
          </header>
          <div className="actions-confirmation-body">
            <Md3DestructiveGateBody
              actionId="self-hosted-runner-removal"
              summaryId={this.descriptionId}
              summary={this.removalSummary()}
              irreversible={`${runner.name} has to be registered again from scratch to come back, and its managed files are not recoverable from this app.`}
              targetKeyLabel={`the runner ${runner.name} on ${scope}`}
              effectKeyLabel="it is unregistered from GitHub and its managed files are deleted"
              disabled={submitting}
              onAuthorizationChanged={this.onGateAuthorizationChanged}
            />
            <div
              id={this.progressId}
              className="actions-super-confirmation-progress"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {submitting
                ? progressMessage ??
                  'Removal is in progress and cannot be dismissed until the exact result is known.'
                : null}
            </div>
            {error && (
              <div
                id={this.errorId}
                className="actions-inline-error"
                role="alert"
              >
                {error.message}
              </div>
            )}
          </div>
          <footer>
            <Button
              onButtonRef={this.setDismissButtonRef}
              onClick={onDismissed}
              disabled={submitting}
              ariaDescribedBy={this.descriptionId}
            >
              {submitting ? 'Wait for removal result' : 'Emergency exit'}
            </Button>
            <Button
              type="submit"
              className="destructive"
              disabled={!this.state.gateAuthorized || submitting}
              ariaDescribedBy={this.descriptionId}
            >
              {submitting ? 'Removing…' : 'Remove runner'}
            </Button>
          </footer>
        </form>
      </div>
    )
  }
}
