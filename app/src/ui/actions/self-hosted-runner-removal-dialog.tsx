/* eslint-disable react/jsx-no-bind -- controlled destructive-action gate callbacks */
import * as React from 'react'

import { ISelfHostedRunner } from '../../lib/self-hosted-runner/types'
import { Button } from '../lib/button'
import { trapActionsDialogFocus } from './actions-dialog-focus'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

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
 * A runner-specific destructive-action gate. The runner is unregistered only
 * after both independent acknowledgements and the full-range authorization
 * slider have completed.
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
    this.state = {
      gateAuthorized: false,
    }
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

  public render() {
    const { runner, submitting, error, progressMessage, onDismissed } =
      this.props
    const { gateAuthorized } = this.state
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
            <div className="actions-confirmation-copy" id={this.descriptionId}>
              <p>
                This permanently unregisters <strong>{runner.name}</strong> from{' '}
                <code>
                  {runner.owner}/{runner.repository}
                </code>{' '}
                and deletes its managed runner files.
              </p>
              {runner.dedicatedWsl && (
                <p>
                  The dedicated WSL distro{' '}
                  <strong>{runner.wslDistribution ?? 'created for it'}</strong>{' '}
                  is also deleted after GitHub unregisters the runner.
                </p>
              )}
            </div>
            <Md3DestructiveGateBody
              actionId="self-hosted-runner-removal"
              summary={`Remove runner ${runner.name} from ${runner.owner}/${runner.repository}.`}
              irreversible="The runner registration and managed runner files will be deleted."
              targetKeyLabel={`runner ${runner.name}`}
              effectKeyLabel="unregistering the runner and deleting its files"
              disabled={submitting}
              onAuthorizationChanged={gateAuthorized =>
                this.setState({ gateAuthorized })
              }
            />
            {progressMessage && submitting ? (
              <div id={this.progressId} role="status" aria-live="polite">
                {progressMessage}
              </div>
            ) : null}
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
