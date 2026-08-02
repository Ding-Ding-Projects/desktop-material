import * as React from 'react'

import {
  IInteractiveRebasePlan,
  InteractiveRebaseAction,
  InteractiveRebaseActions,
} from '../../lib/interactive-rebase/interactive-rebase-plan'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'

export interface IInteractiveRebaseCommitLabelContext {
  readonly commitId: string
  readonly shortCommitId: string
  readonly subject: string
}

/** Every visible or assistive string rendered by the isolated editor. */
export interface IInteractiveRebaseEditorLabels {
  readonly title: string
  readonly description: string
  readonly planHeading: string
  readonly summaryHeading: string
  readonly confirmationHeading: string
  readonly actionLabels: Readonly<Record<InteractiveRebaseAction, string>>
  readonly commitIdLabel: (
    commit: IInteractiveRebaseCommitLabelContext
  ) => string
  readonly actionSelectorLabel: (
    commit: IInteractiveRebaseCommitLabelContext
  ) => string
  readonly moveUpLabel: (commit: IInteractiveRebaseCommitLabelContext) => string
  readonly moveDownLabel: (
    commit: IInteractiveRebaseCommitLabelContext
  ) => string
  readonly pauseRequiredLabel: string
  readonly totalSummary: (count: number) => string
  readonly pauseSummary: (count: number) => string
  readonly dropSummary: (count: number) => string
  readonly foldSummary: (count: number) => string
  readonly reorderedSummary: (reordered: boolean) => string
  readonly rewriteWarningTitle: string
  readonly rewriteWarningBody: string
  readonly pushedHistoryWarningTitle: string
  readonly pushedHistoryWarningBody: string
  readonly reviewConfirmationLabel: string
  readonly pushedHistoryConfirmationLabel: string
  readonly reviewConfirmationRequiredReason: string
  readonly pushedHistoryConfirmationRequiredReason: string
  readonly executeLabel: string
  readonly cancelLabel: string
}

export interface IInteractiveRebaseEditorProps {
  readonly plan: IInteractiveRebasePlan
  readonly labels: IInteractiveRebaseEditorLabels
  readonly hasPushedReviewedCommits: boolean
  readonly onActionChange: (
    commitId: string,
    action: InteractiveRebaseAction
  ) => void
  readonly onReorder: (commitId: string, beforeCommitId: string | null) => void
  readonly onExecute: (plan: IInteractiveRebasePlan) => void
  readonly onCancel: () => void
}

interface IInteractiveRebaseEditorState {
  readonly reviewConfirmed: boolean
  readonly pushedHistoryConfirmed: boolean
}

function isInteractiveRebaseAction(
  value: string | undefined
): value is InteractiveRebaseAction {
  return (
    value !== undefined &&
    (InteractiveRebaseActions as ReadonlyArray<string>).includes(value)
  )
}

/**
 * A controlled presentation for reviewing an immutable rebase plan.
 *
 * The component emits identity-based editing intent only. It deliberately has
 * no serialization, Git, IPC, process, filesystem, or execution capability.
 */
export class InteractiveRebaseEditor extends React.Component<
  IInteractiveRebaseEditorProps,
  IInteractiveRebaseEditorState
> {
  private readonly instanceId = createUniqueId('InteractiveRebaseEditor')
  private readonly titleId = `${this.instanceId}-title`
  private readonly descriptionId = `${this.instanceId}-description`
  private readonly planHeadingId = `${this.instanceId}-plan-heading`
  private readonly summaryHeadingId = `${this.instanceId}-summary-heading`
  private readonly confirmationHeadingId = `${this.instanceId}-confirmation-heading`
  private readonly rewriteWarningTitleId = `${this.instanceId}-rewrite-warning-title`
  private readonly pushedWarningTitleId = `${this.instanceId}-pushed-warning-title`
  private readonly reviewConfirmationId = `${this.instanceId}-review-confirmation`
  private readonly pushedConfirmationId = `${this.instanceId}-pushed-confirmation`
  private readonly executeReasonId = `${this.instanceId}-execute-reason`

  public constructor(props: IInteractiveRebaseEditorProps) {
    super(props)
    this.state = {
      reviewConfirmed: false,
      pushedHistoryConfirmed: false,
    }
  }

  public componentDidUpdate(prevProps: IInteractiveRebaseEditorProps): void {
    if (
      (prevProps.plan !== this.props.plan ||
        prevProps.hasPushedReviewedCommits !==
          this.props.hasPushedReviewedCommits) &&
      (this.state.reviewConfirmed || this.state.pushedHistoryConfirmed)
    ) {
      this.clearConfirmations()
    }
  }

  public componentWillUnmount(): void {
    releaseUniqueId(this.instanceId)
  }

  private getCommitContext(
    commitId: string,
    subject: string
  ): IInteractiveRebaseCommitLabelContext {
    return {
      commitId,
      shortCommitId: commitId.slice(0, 7),
      subject,
    }
  }

  private clearConfirmations(): void {
    if (this.state.reviewConfirmed || this.state.pushedHistoryConfirmed) {
      this.setState({
        reviewConfirmed: false,
        pushedHistoryConfirmed: false,
      })
    }
  }

  private onActionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const commitId = event.currentTarget.dataset.commitId
    const action = event.currentTarget.value
    if (
      commitId !== undefined &&
      isInteractiveRebaseAction(action) &&
      this.props.plan.entries.some(entry => entry.commitId === commitId)
    ) {
      this.clearConfirmations()
      this.props.onActionChange(commitId, action)
    }
  }

  private onMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const commitId = event.currentTarget.dataset.commitId
    const direction = event.currentTarget.dataset.direction
    const entries = this.props.plan.entries
    if (commitId === undefined) {
      return
    }
    const index = entries.findIndex(entry => entry.commitId === commitId)

    if (index < 0) {
      return
    }
    if (direction === 'up' && index > 0) {
      this.clearConfirmations()
      this.props.onReorder(commitId, entries[index - 1].commitId)
    } else if (direction === 'down' && index < entries.length - 1) {
      this.clearConfirmations()
      this.props.onReorder(commitId, entries[index + 2]?.commitId ?? null)
    }
  }

  private onReviewConfirmationChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ reviewConfirmed: event.currentTarget.checked })
  }

  private onPushedHistoryConfirmationChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ pushedHistoryConfirmed: event.currentTarget.checked })
  }

  private getExecuteUnavailableReason(): string | null {
    if (!this.state.reviewConfirmed) {
      return this.props.labels.reviewConfirmationRequiredReason
    }
    if (
      this.props.hasPushedReviewedCommits &&
      !this.state.pushedHistoryConfirmed
    ) {
      return this.props.labels.pushedHistoryConfirmationRequiredReason
    }
    return null
  }

  private onExecute = () => {
    if (this.getExecuteUnavailableReason() === null) {
      this.props.onExecute(this.props.plan)
    }
  }

  private onCancel = () => {
    this.props.onCancel()
  }

  private renderPlanRow(
    entry: IInteractiveRebasePlan['entries'][number],
    index: number
  ): JSX.Element {
    const { labels, plan } = this.props
    const context = this.getCommitContext(entry.commitId, entry.subject)
    const actionId = `${this.instanceId}-action-${entry.commitId}`
    const canMoveUp = index > 0
    const canMoveDown = index < plan.entries.length - 1

    return (
      <li
        className="interactive-rebase-editor__row"
        data-action={entry.action}
        data-commit-id={entry.commitId}
        key={entry.commitId}
      >
        <div className="interactive-rebase-editor__commit">
          <div className="interactive-rebase-editor__commit-heading">
            <span className="interactive-rebase-editor__commit-id">
              <span className="sr-only">{labels.commitIdLabel(context)}</span>
              <code aria-hidden="true">{context.shortCommitId}</code>
            </span>
            {entry.pauseRequired ? (
              <span className="interactive-rebase-editor__pause-badge">
                {labels.pauseRequiredLabel}
              </span>
            ) : null}
          </div>
          <span className="interactive-rebase-editor__subject">
            {entry.subject}
          </span>
        </div>

        <label
          className="interactive-rebase-editor__action-field"
          htmlFor={actionId}
        >
          <span className="interactive-rebase-editor__field-label">
            {labels.actionSelectorLabel(context)}
          </span>
          <select
            className="interactive-rebase-editor__action-select"
            data-commit-id={entry.commitId}
            id={actionId}
            onChange={this.onActionChange}
            value={entry.action}
          >
            {InteractiveRebaseActions.map(action => (
              <option key={action} value={action}>
                {labels.actionLabels[action]}
              </option>
            ))}
          </select>
        </label>

        <div className="interactive-rebase-editor__move-controls">
          <button
            aria-disabled={canMoveUp ? undefined : true}
            className="interactive-rebase-editor__move-button"
            data-commit-id={entry.commitId}
            data-direction="up"
            onClick={this.onMove}
            type="button"
          >
            {labels.moveUpLabel(context)}
          </button>
          <button
            aria-disabled={canMoveDown ? undefined : true}
            className="interactive-rebase-editor__move-button"
            data-commit-id={entry.commitId}
            data-direction="down"
            onClick={this.onMove}
            type="button"
          >
            {labels.moveDownLabel(context)}
          </button>
        </div>
      </li>
    )
  }

  public render(): JSX.Element {
    const { hasPushedReviewedCommits, labels, plan } = this.props
    const executeUnavailableReason = this.getExecuteUnavailableReason()

    return (
      <section
        aria-describedby={this.descriptionId}
        aria-labelledby={this.titleId}
        className="interactive-rebase-editor"
      >
        <header className="interactive-rebase-editor__header">
          <h1 className="interactive-rebase-editor__title" id={this.titleId}>
            {labels.title}
          </h1>
          <p
            className="interactive-rebase-editor__description"
            id={this.descriptionId}
          >
            {labels.description}
          </p>
        </header>

        <section
          aria-labelledby={this.summaryHeadingId}
          className="interactive-rebase-editor__summary"
        >
          <h2
            className="interactive-rebase-editor__section-heading"
            id={this.summaryHeadingId}
          >
            {labels.summaryHeading}
          </h2>
          <ul className="interactive-rebase-editor__summary-list">
            <li>{labels.totalSummary(plan.summary.totalCount)}</li>
            <li>{labels.pauseSummary(plan.summary.pauseRequiredCount)}</li>
            <li>{labels.dropSummary(plan.summary.droppedCount)}</li>
            <li>{labels.foldSummary(plan.summary.foldedCount)}</li>
            <li>{labels.reorderedSummary(plan.summary.reordered)}</li>
          </ul>
        </section>

        <aside
          aria-labelledby={this.rewriteWarningTitleId}
          className="interactive-rebase-editor__warning"
        >
          <h2
            className="interactive-rebase-editor__warning-title"
            id={this.rewriteWarningTitleId}
          >
            {labels.rewriteWarningTitle}
          </h2>
          <p>{labels.rewriteWarningBody}</p>
        </aside>

        {hasPushedReviewedCommits ? (
          <aside
            aria-labelledby={this.pushedWarningTitleId}
            className="interactive-rebase-editor__warning interactive-rebase-editor__warning--pushed"
            role="alert"
          >
            <h2
              className="interactive-rebase-editor__warning-title"
              id={this.pushedWarningTitleId}
            >
              {labels.pushedHistoryWarningTitle}
            </h2>
            <p>{labels.pushedHistoryWarningBody}</p>
          </aside>
        ) : null}

        <section
          aria-labelledby={this.planHeadingId}
          className="interactive-rebase-editor__plan"
        >
          <h2
            className="interactive-rebase-editor__section-heading"
            id={this.planHeadingId}
          >
            {labels.planHeading}
          </h2>
          <ol
            aria-labelledby={this.planHeadingId}
            className="interactive-rebase-editor__rows"
          >
            {plan.entries.map((entry, index) =>
              this.renderPlanRow(entry, index)
            )}
          </ol>
        </section>

        <fieldset
          className="interactive-rebase-editor__confirmations"
          aria-labelledby={this.confirmationHeadingId}
        >
          <legend
            className="interactive-rebase-editor__section-heading"
            id={this.confirmationHeadingId}
          >
            {labels.confirmationHeading}
          </legend>
          <label
            className="interactive-rebase-editor__confirmation"
            htmlFor={this.reviewConfirmationId}
          >
            <input
              checked={this.state.reviewConfirmed}
              id={this.reviewConfirmationId}
              onChange={this.onReviewConfirmationChange}
              type="checkbox"
            />
            <span>{labels.reviewConfirmationLabel}</span>
          </label>
          {hasPushedReviewedCommits ? (
            <label
              className="interactive-rebase-editor__confirmation"
              htmlFor={this.pushedConfirmationId}
            >
              <input
                checked={this.state.pushedHistoryConfirmed}
                id={this.pushedConfirmationId}
                onChange={this.onPushedHistoryConfirmationChange}
                type="checkbox"
              />
              <span>{labels.pushedHistoryConfirmationLabel}</span>
            </label>
          ) : null}
          {executeUnavailableReason === null ? null : (
            <p
              className="interactive-rebase-editor__execute-reason"
              id={this.executeReasonId}
              role="status"
            >
              {executeUnavailableReason}
            </p>
          )}
        </fieldset>

        <footer className="interactive-rebase-editor__footer">
          <button
            className="interactive-rebase-editor__footer-button interactive-rebase-editor__footer-button--cancel"
            onClick={this.onCancel}
            type="button"
          >
            {labels.cancelLabel}
          </button>
          <button
            aria-describedby={
              executeUnavailableReason === null
                ? undefined
                : this.executeReasonId
            }
            aria-disabled={executeUnavailableReason === null ? undefined : true}
            className="interactive-rebase-editor__footer-button interactive-rebase-editor__footer-button--execute"
            onClick={this.onExecute}
            type="button"
          >
            {labels.executeLabel}
          </button>
        </footer>
      </section>
    )
  }
}
