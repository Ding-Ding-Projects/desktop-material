/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- scroll regions need keyboard focus */
import * as React from 'react'

import {
  IBulkRepositoryItem,
  IBulkRepositoryProgress,
  BulkRepositoryItemStatus,
} from '../../lib/automation/bulk-repository-runner'
import {
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'

/**
 * Bulk repository actions for the repository picker: Fetch selected, Pull
 * selected, Favorite, Unfavorite, Assign to group, Remove from group, and
 * Remove from list.
 *
 * Fetch and Pull are routed one repository at a time through the existing
 * reviewed batch-sync path, so the store revalidates every id and applies its
 * own per-repository pull safety review. Remove from list is confirmation
 * gated and never deletes anything on disk.
 */
export const RepositoryBulkOperations = [
  'fetch-selected',
  'pull-selected',
  'favorite',
  'unfavorite',
  'assign-group',
  'remove-group',
  'remove-from-list',
] as const

export type RepositoryBulkOperation = typeof RepositoryBulkOperations[number]

/** The action buttons, in render order, with their label key. */
const BulkActionButtons: ReadonlyArray<{
  readonly operation: RepositoryBulkOperation
  readonly labelKey: TranslationKey
  readonly className?: string
  readonly needsGroupName?: boolean
}> = [
  { operation: 'fetch-selected', labelKey: 'repositoryBulk.fetch' },
  { operation: 'pull-selected', labelKey: 'repositoryBulk.pull' },
  { operation: 'favorite', labelKey: 'repositoryBulk.favorite' },
  { operation: 'unfavorite', labelKey: 'repositoryBulk.unfavorite' },
  {
    operation: 'assign-group',
    labelKey: 'repositoryBulk.assignGroup',
    needsGroupName: true,
  },
  { operation: 'remove-group', labelKey: 'repositoryBulk.removeGroup' },
  {
    operation: 'remove-from-list',
    labelKey: 'repositoryBulk.remove',
    className: 'danger',
  },
]

const GroupOptionsListId = 'repository-bulk-group-options'

function statusKey(status: BulkRepositoryItemStatus): TranslationKey {
  switch (status) {
    case 'queued':
      return 'repositoryBulk.statusQueued'
    case 'running':
      return 'repositoryBulk.statusRunning'
    case 'done':
      return 'repositoryBulk.statusDone'
    case 'failed':
      return 'repositoryBulk.statusFailed'
    case 'skipped':
      return 'repositoryBulk.statusSkipped'
    case 'cancelled':
      return 'repositoryBulk.statusCancelled'
  }
}

interface IRepositoryBulkActionsProps {
  readonly languageMode: LanguageMode
  readonly selectedCount: number
  readonly visibleCount: number
  readonly allVisibleSelected: boolean
  readonly someVisibleSelected: boolean
  /** True while a fetch/pull batch is running; instant actions are blocked. */
  readonly busy: boolean
  /** Existing custom group names offered as completions. */
  readonly groupNames: ReadonlyArray<string>
  readonly progress: IBulkRepositoryProgress | null
  readonly progressTitleKey: TranslationKey | null
  readonly cancelRequested: boolean
  /** Localized result line for the instant favorite/group/remove operations. */
  readonly notice: string | null
  /** Non-null while the destructive removal is awaiting confirmation. */
  readonly removalCandidates: ReadonlyArray<IBulkRepositoryItem> | null
  readonly onSelectAllVisibleChanged: (selected: boolean) => void
  readonly onOperation: (
    operation: RepositoryBulkOperation,
    groupName: string
  ) => void
  readonly onExit: () => void
  readonly onCancelRun: () => void
  readonly onDismissRun: () => void
  readonly onConfirmRemoval: () => void
  readonly onCancelRemoval: () => void
}

interface IRepositoryBulkActionsState {
  readonly groupDraft: string
}

/** The selection bar, determinate progress row, and removal confirmation. */
export class RepositoryBulkActions extends React.Component<
  IRepositoryBulkActionsProps,
  IRepositoryBulkActionsState
> {
  private selectAllCheckbox: HTMLInputElement | null = null
  private removalConfirmation: HTMLDivElement | null = null

  public constructor(props: IRepositoryBulkActionsProps) {
    super(props)
    this.state = { groupDraft: '' }
  }

  public componentDidMount() {
    this.updateSelectAllIndeterminate()
  }

  public componentDidUpdate(prevProps: IRepositoryBulkActionsProps) {
    this.updateSelectAllIndeterminate()

    if (
      prevProps.removalCandidates === null &&
      this.props.removalCandidates !== null
    ) {
      this.removalConfirmation?.focus()
    }
  }

  private localize(key: TranslationKey, variables?: TranslationVariables) {
    return translate(key, this.props.languageMode, variables)
  }

  private accessibleName(
    key: TranslationKey,
    variables?: TranslationVariables
  ) {
    return translateForAccessibleName(key, variables, this.props.languageMode)
  }

  private onSelectAllCheckboxRef = (element: HTMLInputElement | null) => {
    this.selectAllCheckbox = element
    this.updateSelectAllIndeterminate()
  }

  private onRemovalConfirmationRef = (element: HTMLDivElement | null) => {
    this.removalConfirmation = element
  }

  private updateSelectAllIndeterminate() {
    if (this.selectAllCheckbox === null) {
      return
    }
    this.selectAllCheckbox.indeterminate =
      this.props.someVisibleSelected && !this.props.allVisibleSelected
  }

  private onSelectAllChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSelectAllVisibleChanged(event.currentTarget.checked)
  }

  private onGroupDraftChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ groupDraft: event.currentTarget.value })
  }

  private onOperationClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const operation = event.currentTarget.value as RepositoryBulkOperation
    this.props.onOperation(operation, this.state.groupDraft.trim())
  }

  private renderActionButtons() {
    const { selectedCount, busy } = this.props
    const count = String(selectedCount)
    const disabled = selectedCount === 0 || busy
    const hasGroupDraft = this.state.groupDraft.trim().length > 0

    return (
      <div className="repository-bulk-buttons">
        {BulkActionButtons.map(action => (
          <button
            key={action.operation}
            type="button"
            value={action.operation}
            className={action.className}
            disabled={
              disabled || (action.needsGroupName === true && !hasGroupDraft)
            }
            onClick={this.onOperationClick}
          >
            {this.localize(action.labelKey, { count })}
          </button>
        ))}
      </div>
    )
  }

  private renderGroupField() {
    return (
      <label className="repository-bulk-group">
        <span>{this.localize('repositoryBulk.groupLabel')}</span>
        <input
          type="text"
          list={GroupOptionsListId}
          value={this.state.groupDraft}
          disabled={this.props.busy}
          placeholder={this.localize('repositoryBulk.groupPlaceholder')}
          aria-label={this.accessibleName('repositoryBulk.groupPlaceholder')}
          onChange={this.onGroupDraftChanged}
        />
        <datalist id={GroupOptionsListId}>
          {this.props.groupNames.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
    )
  }

  private renderSelectionBar() {
    const { selectedCount, visibleCount, allVisibleSelected, busy } = this.props

    return (
      <div
        className="repository-bulk-bar"
        role="group"
        aria-label={this.accessibleName('repositoryBulk.barAria')}
      >
        <label className="repository-bulk-select-all">
          <input
            ref={this.onSelectAllCheckboxRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={visibleCount === 0 || busy}
            aria-label={this.accessibleName(
              'repositoryBulk.selectAllVisibleAria'
            )}
            onChange={this.onSelectAllChanged}
          />
          <span>{this.localize('repositoryBulk.selectAllVisible')}</span>
        </label>
        <span className="repository-bulk-selected-count" role="status">
          {this.localize('repositoryBulk.selectedCount', {
            count: String(selectedCount),
          })}
        </span>
        {this.renderGroupField()}
        {this.renderActionButtons()}
        <button
          type="button"
          className="repository-bulk-clear"
          // Leaving would hide a running batch's only progress and cancel
          // control while the work continued unseen.
          disabled={busy}
          aria-label={this.accessibleName('repositoryBulk.clearAria')}
          onClick={this.props.onExit}
        >
          {this.localize('repositoryBulk.clear')}
        </button>
      </div>
    )
  }

  private renderProgress() {
    const { progress, progressTitleKey, cancelRequested } = this.props
    if (progress === null || progressTitleKey === null) {
      return null
    }

    const { completed, total, finished, items } = progress
    const percent =
      total === 0 ? 100 : Math.round((completed / Math.max(total, 1)) * 100)
    const completedOf = this.localize('repositoryBulk.completedOf', {
      completed: String(completed),
      total: String(total),
    })
    const done = items.filter(item => item.status === 'done').length
    const failed = items.filter(item => item.status === 'failed').length
    const skipped = items.filter(item => item.status === 'skipped').length
    const remaining = items.filter(item => item.status === 'cancelled').length

    return (
      <section
        className="repository-bulk-progress"
        aria-label={this.accessibleName('repositoryBulk.progressAria')}
      >
        <div className="repository-bulk-progress-heading">
          <h3>{this.localize(progressTitleKey)}</h3>
          <strong className="repository-bulk-progress-count">
            <span className="sr-only">{completedOf}</span>
            <span aria-hidden="true">
              {completed}/{total}
            </span>
          </strong>
        </div>
        <div
          className="repository-bulk-progress-track"
          role="progressbar"
          aria-label={this.accessibleName('repositoryBulk.progressTrackAria')}
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={completed}
          aria-valuetext={completedOf}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        {cancelRequested && !finished ? (
          <p className="repository-bulk-progress-cancelling" role="status">
            {this.localize('repositoryBulk.cancelling')}
          </p>
        ) : null}
        {finished ? (
          <p className="repository-bulk-progress-summary" role="status">
            {this.localize('repositoryBulk.summary', {
              done: String(done),
              failed: String(failed),
              skipped: String(skipped),
              remaining: String(remaining),
            })}
          </p>
        ) : null}
        {/* A long result list needs keyboard focus so it can be scrolled. */}
        <div
          className="repository-bulk-results-container"
          role="region"
          aria-label={this.accessibleName('repositoryBulk.resultsAria')}
          aria-busy={!finished}
          tabIndex={0}
        >
          <table className="repository-bulk-results">
            <thead>
              <tr>
                <th>{this.localize('repositoryBulk.repository')}</th>
                <th>{this.localize('repositoryBulk.status')}</th>
                <th>{this.localize('repositoryBulk.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td data-label={this.localize('repositoryBulk.repository')}>
                    {item.name}
                  </td>
                  <td data-label={this.localize('repositoryBulk.status')}>
                    <span className={`repository-bulk-status ${item.status}`}>
                      {this.localize(statusKey(item.status))}
                    </span>
                  </td>
                  <td data-label={this.localize('repositoryBulk.detail')}>
                    {item.detail.length > 0
                      ? item.detail
                      : this.localize('repositoryBulk.noDetail')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="repository-bulk-progress-actions">
          {finished ? (
            <button type="button" onClick={this.props.onDismissRun}>
              {this.localize('repositoryBulk.dismiss')}
            </button>
          ) : (
            <button
              type="button"
              disabled={cancelRequested}
              aria-label={this.accessibleName('repositoryBulk.cancelAria')}
              onClick={this.props.onCancelRun}
            >
              {this.localize('repositoryBulk.cancel')}
            </button>
          )}
        </div>
      </section>
    )
  }

  private renderRemovalConfirmation() {
    const candidates = this.props.removalCandidates
    if (candidates === null) {
      return null
    }

    const count = String(candidates.length)

    return (
      <div
        className="repository-bulk-confirmation"
        role="alertdialog"
        aria-modal="false"
        aria-labelledby="repository-bulk-remove-title"
        aria-describedby="repository-bulk-remove-description"
        tabIndex={-1}
        ref={this.onRemovalConfirmationRef}
      >
        <strong id="repository-bulk-remove-title">
          {this.localize(
            candidates.length === 1
              ? 'repositoryBulk.removeTitleSingular'
              : 'repositoryBulk.removeTitlePlural',
            { count }
          )}
        </strong>
        <span id="repository-bulk-remove-description">
          {this.localize('repositoryBulk.removeDescription')}
        </span>
        <ul
          className="repository-bulk-remove-list"
          aria-label={this.accessibleName('repositoryBulk.removeListAria')}
        >
          {candidates.map(candidate => (
            <li key={candidate.id}>{candidate.name}</li>
          ))}
        </ul>
        <span className="repository-bulk-confirmation-actions">
          <button type="button" onClick={this.props.onCancelRemoval}>
            {this.localize('repositoryBulk.removeCancel')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={this.props.onConfirmRemoval}
          >
            {this.localize('repositoryBulk.removeConfirm')}
          </button>
        </span>
      </div>
    )
  }

  public render() {
    return (
      <div className="repository-bulk">
        {this.renderSelectionBar()}
        {this.props.notice !== null ? (
          <p
            className="repository-bulk-notice"
            role="status"
            aria-label={this.accessibleName('repositoryBulk.noticeAria')}
          >
            {this.props.notice}
          </p>
        ) : null}
        {this.renderRemovalConfirmation()}
        {this.renderProgress()}
      </div>
    )
  }
}
