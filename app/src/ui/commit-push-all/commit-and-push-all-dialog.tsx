/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- scroll regions need keyboard focus */
import * as React from 'react'
import {
  CommitPushAllProgressStatus,
  ICommitPushAllProgress,
  ICommitPushAllProgressUpdate,
} from '../../lib/automation/commit-push-all'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { FilterMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import { filterByMode } from '../lib/filter-string-list'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { MaterialSymbol } from '../lib/material-symbol'

/** A suggested default the user can accept or replace before confirming. */
export const DefaultCommitAndPushAllMessage = translate(
  'commitPushAll.defaultMessage',
  'english'
)

/** The search bar's identity, so its regex builder is its own. */
export const CommitPushAllSearchSurfaceId =
  'commit-push-all-repositories-search'

export interface ICommitPushAllRepositorySummary {
  readonly id: number
  readonly name: string
}

interface ICommitAndPushAllDialogProps {
  readonly dispatcher: Dispatcher
  /** The repositories that will be processed (those with local work). */
  readonly affectedRepositories: ReadonlyArray<ICommitPushAllRepositorySummary>
  readonly onDismissed: () => void
}

interface IRunState {
  readonly progress: ReadonlyArray<ICommitPushAllProgress>
  readonly completed: number
  readonly total: number
  readonly active: number
  readonly complete: boolean
  readonly error: string | null
}

interface ICommitAndPushAllDialogState {
  readonly phase: 'confirm' | 'running'
  readonly message: string
  readonly messageEdited: boolean
  readonly run: IRunState
  /** Repository ids that will actually be committed and pushed. */
  readonly selectedIds: ReadonlySet<number>
  readonly filterText: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly languageMode: LanguageMode
}

interface ICommitPushAllRun {
  message: string
  state: IRunState
  readonly listeners: Set<(state: IRunState) => void>
}

const commitPushAllRuns = new WeakMap<Dispatcher, ICommitPushAllRun>()

function emptyRunState(): IRunState {
  return {
    progress: [],
    completed: 0,
    total: 0,
    active: 0,
    complete: false,
    error: null,
  }
}

function updateRun(
  run: ICommitPushAllRun,
  update: (state: IRunState) => IRunState
): void {
  run.state = update(run.state)
  for (const listener of run.listeners) {
    listener(run.state)
  }
}

function updateRunProgress(
  run: ICommitPushAllRun,
  update: ICommitPushAllProgressUpdate
) {
  updateRun(run, state => {
    const existingIndex = state.progress.findIndex(
      item => item.id === update.item.id
    )
    const progress = [...state.progress]
    if (existingIndex === -1) {
      progress.push(update.item)
    } else {
      progress[existingIndex] = update.item
    }

    return {
      ...state,
      progress,
      completed: update.completed,
      total: update.total,
      active: update.active,
    }
  })
}

/**
 * Start a single commit-and-push-all session per Dispatcher so dismissing and
 * reopening the modal resumes the in-flight run instead of starting a second
 * one.
 */
function startRun(
  dispatcher: Dispatcher,
  message: string,
  repositoryIds: ReadonlyArray<number>
): ICommitPushAllRun {
  const run: ICommitPushAllRun = {
    message,
    state: emptyRunState(),
    listeners: new Set(),
  }
  commitPushAllRuns.set(dispatcher, run)

  Promise.resolve()
    .then(() =>
      dispatcher.commitAndPushAllRepositories(
        message,
        update => updateRunProgress(run, update),
        repositoryIds
      )
    )
    .then(results => {
      updateRun(run, state => ({
        ...state,
        completed: results.length,
        total: results.length,
        active: 0,
        complete: true,
      }))
      commitPushAllRuns.delete(dispatcher)
    })
    .catch(error => {
      updateRun(run, state => ({
        ...state,
        active: 0,
        error: error instanceof Error ? error.message : String(error),
      }))
      commitPushAllRuns.delete(dispatcher)
    })

  return run
}

function getProgressStatusKey(
  status: CommitPushAllProgressStatus
): TranslationKey {
  switch (status) {
    case 'queued':
      return 'commitPushAll.status.waiting'
    case 'pulling':
      return 'commitPushAll.status.pulling'
    case 'committing':
      return 'commitPushAll.status.committing'
    case 'pushing':
      return 'commitPushAll.status.pushing'
    case 'done':
      return 'commitPushAll.status.done'
    case 'skipped':
      return 'commitPushAll.status.skipped'
    case 'failed':
      return 'commitPushAll.status.failed'
  }
}

export class CommitAndPushAllDialog extends React.Component<
  ICommitAndPushAllDialogProps,
  ICommitAndPushAllDialogState
> {
  private run: ICommitPushAllRun | null = null

  public constructor(props: ICommitAndPushAllDialogProps) {
    super(props)
    const languageMode = getPersistedLanguageMode()
    this.state = {
      phase: 'confirm',
      message: translate('commitPushAll.defaultMessage', languageMode),
      messageEdited: false,
      run: emptyRunState(),
      // Everything with local work starts selected: the action is named "all",
      // and unticking is a smaller surprise than discovering nothing was ticked.
      selectedIds: new Set(props.affectedRepositories.map(r => r.id)),
      filterText: '',
      filterMode: FilterMode.Substring,
      filterCaseSensitive: false,
      languageMode,
    }
  }

  public componentDidMount(): void {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    const existing = commitPushAllRuns.get(this.props.dispatcher)
    if (existing !== undefined) {
      this.run = existing
      existing.listeners.add(this.onRunUpdated)
      this.setState({
        phase: 'running',
        message: existing.message,
        messageEdited: true,
        run: existing.state,
      })
    }
  }

  public componentWillUnmount(): void {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.run?.listeners.delete(this.onRunUpdated)
    this.run = null
  }

  private onRunUpdated = (run: IRunState) => this.setState({ run })

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    this.setState(state =>
      languageMode === state.languageMode
        ? null
        : {
            languageMode,
            message:
              state.phase === 'confirm' && !state.messageEdited
                ? translate('commitPushAll.defaultMessage', languageMode)
                : state.message,
          }
    )
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.state.languageMode)

  private renderTitle(): string | JSX.Element {
    if (this.state.languageMode !== 'bilingual') {
      return this.text('commitPushAll.title')
    }
    return (
      <>
        <span aria-hidden="true">{this.text('commitPushAll.title')}</span>
        <span className="sr-only">
          {this.accessibleText('commitPushAll.title')}
        </span>
      </>
    )
  }

  private onMessageChanged = (message: string) =>
    this.setState({ message, messageEdited: true })

  private onFilterTextChanged = (filterText: string) =>
    this.setState({ filterText })

  private onFilterModeChanged = (filterMode: FilterMode) =>
    this.setState({ filterMode })

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) =>
    this.setState({ filterCaseSensitive })

  private onRegexPatternApply = (
    filterText: string,
    filterCaseSensitive: boolean
  ) => {
    this.setState({
      filterText,
      filterMode: FilterMode.Regex,
      filterCaseSensitive,
    })
  }

  private getSampleItems = () =>
    this.props.affectedRepositories.slice(0, 50).map(r => r.name)

  private getFilteredRepositories() {
    return filterByMode(
      this.props.affectedRepositories,
      repository => [repository.name],
      this.state.filterText,
      this.state.filterMode,
      this.state.filterCaseSensitive
    )
  }

  private onRepositoryToggled = (id: number) => () => {
    this.setState(state => {
      const selectedIds = new Set(state.selectedIds)
      if (selectedIds.has(id)) {
        selectedIds.delete(id)
      } else {
        selectedIds.add(id)
      }
      return { selectedIds }
    })
  }

  /**
   * Select or clear the repositories the search is currently showing, not every
   * repository there is. A bulk action that reaches past the filter is the one
   * way a filtered list can commit something the user cannot see.
   */
  private setSelectionForVisible(selected: boolean) {
    const visible = this.getFilteredRepositories().items
    this.setState(state => {
      const selectedIds = new Set(state.selectedIds)
      for (const repository of visible) {
        if (selected) {
          selectedIds.add(repository.id)
        } else {
          selectedIds.delete(repository.id)
        }
      }
      return { selectedIds }
    })
  }

  private onSelectAll = () => this.setSelectionForVisible(true)
  private onSelectNone = () => this.setSelectionForVisible(false)

  private onCommitAndPush = () => {
    const message = this.state.message.trim()
    const repositoryIds = this.props.affectedRepositories
      .filter(repository => this.state.selectedIds.has(repository.id))
      .map(repository => repository.id)

    if (message.length === 0 || repositoryIds.length === 0) {
      return
    }

    const run = startRun(this.props.dispatcher, message, repositoryIds)
    this.run = run
    run.listeners.add(this.onRunUpdated)
    this.setState({ phase: 'running', run: run.state })
  }

  public render() {
    return this.state.phase === 'confirm'
      ? this.renderConfirm()
      : this.renderRunning()
  }

  private renderConfirm() {
    const { affectedRepositories } = this.props
    const hasWork = affectedRepositories.length > 0
    const messageEmpty = this.state.message.trim().length === 0
    const filtered = this.getFilteredRepositories()
    const selectedCount = affectedRepositories.filter(repository =>
      this.state.selectedIds.has(repository.id)
    ).length
    const filterErrorId =
      filtered.regexError === null ? undefined : 'commit-push-all-filter-error'

    return (
      <Dialog
        id="commit-push-all-repositories"
        title={this.renderTitle()}
        titleId="commit-push-all-repositories-title"
        onSubmit={this.onCommitAndPush}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="commit-push-all-intro">
            {this.text('commitPushAll.intro')}
          </p>
          {hasWork ? (
            <>
              <TextBox
                label={this.text('commitPushAll.messageLabel')}
                ariaLabel={this.accessibleText('commitPushAll.messageLabel')}
                value={this.state.message}
                onValueChanged={this.onMessageChanged}
                placeholder={this.text('commitPushAll.messagePlaceholder')}
                autoFocus={true}
              />
              <div className="commit-push-all-search">
                <TextBox
                  searchSurfaceId={CommitPushAllSearchSurfaceId}
                  displayClearButton={true}
                  value={this.state.filterText}
                  onValueChanged={this.onFilterTextChanged}
                  placeholder={this.text('commitPushAll.filterPlaceholder')}
                  ariaLabel={this.accessibleText('commitPushAll.filterAria')}
                  ariaInvalid={filtered.regexError !== null}
                  ariaDescribedBy={filterErrorId}
                />
                <FilterModeControl
                  searchSurfaceId={CommitPushAllSearchSurfaceId}
                  mode={this.state.filterMode}
                  caseSensitive={this.state.filterCaseSensitive}
                  onModeChange={this.onFilterModeChanged}
                  onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
                  regexBuilderTarget={this.text('commitPushAll.filterTarget')}
                  getSampleItems={this.getSampleItems}
                  filterText={this.state.filterText}
                  onRegexPatternApply={this.onRegexPatternApply}
                />
              </div>
              {filtered.regexError !== null && (
                <div
                  id="commit-push-all-filter-error"
                  className="commit-push-all-filter-error"
                  role="alert"
                >
                  {filtered.regexError}
                </div>
              )}
              <div className="commit-push-all-bulk-actions">
                <span role="status">
                  {this.text('commitPushAll.selectionCount', {
                    selectedCount: String(selectedCount),
                    totalCount: String(affectedRepositories.length),
                  })}
                </span>
                <button
                  type="button"
                  onClick={this.onSelectAll}
                  aria-label={this.accessibleText('commitPushAll.selectShown')}
                >
                  {this.text('commitPushAll.selectShown')}
                </button>
                <button
                  type="button"
                  onClick={this.onSelectNone}
                  aria-label={this.accessibleText('commitPushAll.clearShown')}
                >
                  {this.text('commitPushAll.clearShown')}
                </button>
              </div>
              <div
                className="commit-push-all-affected"
                role="group"
                aria-label={this.accessibleText(
                  'commitPushAll.repositoriesGroupAria'
                )}
                tabIndex={0}
              >
                {filtered.items.length === 0 ? (
                  <p className="commit-push-all-no-matches">
                    {this.text('commitPushAll.noMatches')}
                  </p>
                ) : (
                  <ul>
                    {filtered.items.map(repository => (
                      <li key={repository.id}>
                        <Checkbox
                          label={repository.name}
                          value={
                            this.state.selectedIds.has(repository.id)
                              ? CheckboxValue.On
                              : CheckboxValue.Off
                          }
                          onChange={this.onRepositoryToggled(repository.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="commit-push-all-empty">
              {this.text('commitPushAll.empty')}
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          {hasWork ? (
            <OkCancelButtonGroup
              okButtonText={
                selectedCount === affectedRepositories.length
                  ? this.text('commitPushAll.commitAll')
                  : this.text('commitPushAll.commitCount', {
                      count: String(selectedCount),
                    })
              }
              okButtonAriaLabel={
                selectedCount === affectedRepositories.length
                  ? this.accessibleText('commitPushAll.commitAll')
                  : this.accessibleText('commitPushAll.commitCount', {
                      count: String(selectedCount),
                    })
              }
              cancelButtonText={this.text('commitPushAll.cancel')}
              cancelButtonAriaLabel={this.accessibleText(
                'commitPushAll.cancel'
              )}
              okButtonDisabled={messageEmpty || selectedCount === 0}
              onCancelButtonClick={this.props.onDismissed}
            />
          ) : (
            <Button
              onClick={this.props.onDismissed}
              ariaLabel={this.accessibleText('commitPushAll.done')}
            >
              {this.text('commitPushAll.done')}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    )
  }

  private renderRunning() {
    const { progress, completed, total, active, complete, error } =
      this.state.run
    const done = progress.filter(result => result.status === 'done').length
    const skipped = progress.filter(
      result => result.status === 'skipped'
    ).length
    const failed = progress.filter(result => result.status === 'failed').length
    const isRunning = !complete && error === null
    const percent =
      total === 0 ? (complete ? 100 : 0) : Math.round((completed / total) * 100)
    const activeRepositories = progress
      .filter(
        item =>
          item.status === 'pulling' ||
          item.status === 'committing' ||
          item.status === 'pushing'
      )
      .map(item => item.name)
      .join(', ')
    const repositoriesComplete = this.text(
      'commitPushAll.repositoriesComplete',
      {
        completed: String(completed),
        total: String(total),
      }
    )
    const repositoryColumn = this.text('commitPushAll.columnRepository')
    const statusColumn = this.text('commitPushAll.columnStatus')
    const resultColumn = this.text('commitPushAll.columnResult')

    return (
      <Dialog
        id="commit-push-all-repositories"
        title={this.renderTitle()}
        titleId="commit-push-all-repositories-title"
        loading={isRunning}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <section
            className="pull-all-overview"
            aria-label={this.accessibleText('commitPushAll.progressAria')}
          >
            <div className="pull-all-progress-heading">
              <div className="pull-all-progress-title-group">
                <p className="pull-all-overline">
                  {error !== null
                    ? this.text('commitPushAll.overlineStopped')
                    : complete
                    ? this.text('commitPushAll.overlineComplete')
                    : this.text('commitPushAll.overlineLive')}
                </p>
                <h2>
                  {error !== null
                    ? this.text('commitPushAll.headingFailed')
                    : complete
                    ? this.text('commitPushAll.headingComplete')
                    : this.text('commitPushAll.headingRunning')}
                </h2>
              </div>
              <strong className="pull-all-progress-count">
                <span className="sr-only">{repositoriesComplete}</span>
                <span aria-hidden="true">
                  {completed}/{total}
                </span>
              </strong>
            </div>
            <div
              className="pull-all-progress-track"
              role="progressbar"
              aria-label={this.accessibleText('commitPushAll.progressBarAria')}
              aria-valuemin={0}
              aria-valuemax={total || 1}
              aria-valuenow={completed}
              aria-valuetext={repositoriesComplete}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="pull-all-progress-metrics">
              <span>
                {this.text('commitPushAll.metricComplete', {
                  count: String(completed),
                })}
              </span>
              <span>
                {this.text('commitPushAll.metricActive', {
                  count: String(active),
                })}
              </span>
              <span>
                {this.text('commitPushAll.metricWaiting', {
                  count: String(Math.max(total - completed - active, 0)),
                })}
              </span>
            </div>
            <p className="pull-all-current" role="status" aria-live="polite">
              {complete
                ? this.text('commitPushAll.allFinal')
                : activeRepositories.length > 0
                ? this.text('commitPushAll.nowWorking', {
                    repositories: activeRepositories,
                  })
                : this.text('commitPushAll.waitingNext')}
            </p>
            {isRunning && (
              <p className="pull-all-running">
                <MaterialSymbol name="sync" className="spin" />{' '}
                {this.text('commitPushAll.concurrencyHint')}
              </p>
            )}
          </section>
          {error !== null && (
            <p className="pull-all-error" role="alert">
              {error}
            </p>
          )}
          {complete && (
            <p className="pull-all-summary" role="status">
              {this.text('commitPushAll.summary', {
                done: String(done),
                skipped: String(skipped),
                failed: String(failed),
              })}
            </p>
          )}
          {progress.length === 0 && complete && (
            <p className="pull-all-empty">
              {this.text('commitPushAll.noRepositoriesRun')}
            </p>
          )}
          {progress.length > 0 && (
            <div
              className="pull-all-results-container"
              role="region"
              aria-label={this.accessibleText(
                'commitPushAll.resultsRegionAria'
              )}
              aria-busy={isRunning}
              tabIndex={0}
            >
              <table className="pull-all-results">
                <thead>
                  <tr>
                    <th>{repositoryColumn}</th>
                    <th>{statusColumn}</th>
                    <th>{resultColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map(item => (
                    <tr key={item.id}>
                      <td data-label={repositoryColumn}>{item.name}</td>
                      <td data-label={statusColumn}>
                        <span className={`pull-all-status ${item.status}`}>
                          {this.text(getProgressStatusKey(item.status))}
                        </span>
                      </td>
                      <td data-label={resultColumn}>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            onClick={this.props.onDismissed}
            ariaLabel={this.accessibleText(
              isRunning ? 'commitPushAll.runInBackground' : 'commitPushAll.done'
            )}
          >
            {isRunning
              ? this.text('commitPushAll.runInBackground')
              : this.text('commitPushAll.done')}
          </Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
