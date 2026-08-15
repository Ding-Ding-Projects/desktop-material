/* eslint-disable react/jsx-no-bind -- controlled destructive-action gate callbacks */
import * as React from 'react'

import { ISelfHostedRunner } from '../../lib/self-hosted-runner/types'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
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
  readonly identityConfirmed: boolean
  readonly scopeConfirmed: boolean
  readonly authorizationProgress: number
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
      identityConfirmed: false,
      scopeConfirmed: false,
      authorizationProgress: 0,
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
    if (event.key === 'Escape') {
      event.preventDefault()
      this.props.onDismissed()
    }
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !this.props.submitting &&
      this.state.identityConfirmed &&
      this.state.scopeConfirmed &&
      this.state.authorizationProgress === 100
    ) {
      this.props.onConfirm()
    }
  }

  private onAuthorizationProgress = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ authorizationProgress: Number(event.currentTarget.value) })
  }

  public render() {
    const { runner, submitting, error, progressMessage, onDismissed } =
      this.props
    const { identityConfirmed, scopeConfirmed, authorizationProgress } =
      this.state
    const bothConfirmed = identityConfirmed && scopeConfirmed
    const authorized = bothConfirmed && authorizationProgress === 100
    const moving =
      bothConfirmed && authorizationProgress > 0 && authorizationProgress < 100
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
            <fieldset className="actions-super-confirmation-checks">
              <legend>Authorize this exact removal</legend>
              <Checkbox
                value={identityConfirmed ? CheckboxValue.On : CheckboxValue.Off}
                disabled={submitting}
                label={`I confirmed the runner identity: ${runner.name}.`}
                onChange={event =>
                  this.setState({
                    identityConfirmed: event.currentTarget.checked,
                    authorizationProgress: 0,
                  })
                }
              />
              <Checkbox
                value={scopeConfirmed ? CheckboxValue.On : CheckboxValue.Off}
                disabled={submitting}
                label={`I confirmed the affected repository: ${runner.owner}/${runner.repository}.`}
                onChange={event =>
                  this.setState({
                    scopeConfirmed: event.currentTarget.checked,
                    authorizationProgress: 0,
                  })
                }
              />
            </fieldset>
            <label className="actions-super-confirmation-slider">
              <span>
                Slide fully to authorize removal ({authorizationProgress}%)
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={bothConfirmed ? authorizationProgress : 0}
                disabled={!bothConfirmed || submitting}
                aria-label="Full-range removal authorization"
                aria-valuetext={`${authorizationProgress}% authorized`}
                onChange={this.onAuthorizationProgress}
              />
              <output aria-live="polite">{authorizationProgress}%</output>
            </label>
            <div
              id={this.progressId}
              className={`actions-super-confirmation-progress ${
                authorized ? 'complete' : moving ? 'moving' : ''
              }`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {submitting
                ? progressMessage ?? 'Removal is in progress…'
                : authorized
                ? 'Authorization complete. Submit to remove this runner.'
                : 'Both confirmations are required before the slider can move.'}
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
              disabled={false}
              ariaDescribedBy={this.descriptionId}
            >
              {submitting ? 'Emergency exit' : 'Keep runner'}
            </Button>
            <Button
              type="submit"
              className="destructive"
              disabled={!authorized || submitting}
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
