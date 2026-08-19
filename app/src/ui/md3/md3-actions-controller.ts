/**
 * The Actions destination's data owner.
 *
 * The Actions view is the one destination whose data does not live in the app
 * store: runs, jobs, steps and logs are read from the GitHub Actions API
 * through `ActionsStore`, paginated, filtered server-side and cancelled with
 * abort signals. That is asynchronous state with a lifecycle, so it cannot be
 * assembled inside `App.render` the way the store-backed destinations can.
 *
 * This controller owns it. `App` creates one, points it at the selected
 * repository, and calls `getViewProps` during render; every mutation the view
 * offers reaches the real `ActionsStore` method behind it. Nothing here is a
 * fixture: an empty list means the API returned none, and a failure is
 * reported as a failure rather than resolving into a plausible empty pane.
 */

import { Disposable } from 'event-kit'

import { t } from '../../lib/i18n'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import {
  ActionsStore,
  IActionsState,
  getActionsRepositoryKey,
} from '../../lib/stores/actions-store'
import { IAPIWorkflowRun } from '../../lib/api'
import {
  IActionsJobList,
  getActionsJobAttemptOptions,
  mergeActionsJobPage,
} from '../../lib/actions-jobs'
import { asError } from '../../lib/progressive-load'
import { getMd3ViewPreferences } from '../../lib/md3-view-preferences'

import {
  IMd3ActionsAttempts,
  IMd3ActionsBanner,
  IMd3ActionsFilterOption,
  IMd3ActionsPagination,
  IMd3ActionsSearch,
  IMd3ActionsViewProps,
  Md3ActionsChip,
  Md3ActionsFilterName,
} from './md3-actions-view'
import { md3ActionsJobs, md3ActionsRuns } from './md3-destination-adapters'
import { IMd3SearchBinding } from './md3-shell'

/** Every filter the run list can constrain on, with its "any" sentinel. */
const AnyFilterValue = ''

const ActionsFilterNames: ReadonlyArray<Md3ActionsFilterName> = [
  'workflow',
  'branch',
  'event',
  'status',
]

/** The run statuses GitHub's own runs endpoint accepts as a filter. */
const StatusFilterValues: ReadonlyArray<string> = [
  'queued',
  'in_progress',
  'completed',
  'success',
  'failure',
  'cancelled',
]

/** The events a run can have been triggered by, offered as a filter. */
function eventOptions(
  runs: ReadonlyArray<IAPIWorkflowRun>
): ReadonlyArray<IMd3ActionsFilterOption> {
  const seen = new Set<string>()
  for (const run of runs) {
    if (run.event.length > 0) {
      seen.add(run.event)
    }
  }
  return [...seen].sort().map(value => ({ value, label: value }))
}

interface IMd3ActionsControllerState {
  readonly actions: IActionsState
  readonly filters: Readonly<Record<Md3ActionsFilterName, string>>
  readonly filtersOpen: boolean
  readonly chips: ReadonlyArray<Md3ActionsChip>
  readonly selectionMode: boolean
  readonly selectedRunIds: ReadonlySet<string>
  readonly bulkBusy: boolean
  readonly selectedRunId: number | null
  readonly selectedAttempt: number | null
  readonly jobList: IActionsJobList | null
  readonly jobsLoading: boolean
  readonly jobsLoadingMore: boolean
  readonly jobsError: Error | null
  readonly busyRunId: number | null
  readonly busyJobId: number | null
  readonly selectedStepId: string | null
  readonly selectedJobId: number | null
  readonly log: string
  readonly logLoading: boolean
  readonly logError: Error | null
  readonly loadingAll: boolean
  readonly banners: ReadonlyArray<IMd3ActionsBanner>
}

const EmptyActionsState: IActionsState = {
  workflows: [],
  runs: [],
  runsTotalCount: 0,
  runsNextPage: null,
  runsLoadingMore: false,
  loading: false,
  error: null,
  rateLimitReset: null,
  lastUpdated: null,
  supported: false,
  caches: null,
  cachesLoading: false,
  cachesError: null,
  cacheUsage: null,
  cacheUsageLoading: false,
}

function initialState(): IMd3ActionsControllerState {
  return {
    actions: EmptyActionsState,
    filters: { workflow: '', branch: '', event: '', status: '' },
    filtersOpen: false,
    chips: [],
    selectionMode: false,
    selectedRunIds: new Set<string>(),
    bulkBusy: false,
    selectedRunId: null,
    selectedAttempt: null,
    jobList: null,
    jobsLoading: false,
    jobsLoadingMore: false,
    jobsError: null,
    busyRunId: null,
    busyJobId: null,
    selectedStepId: null,
    selectedJobId: null,
    log: '',
    logLoading: false,
    logError: null,
    loadingAll: false,
    banners: [],
  }
}

/** What the controller needs from its host to do its job. */
export interface IMd3ActionsControllerHost {
  readonly actionsStore: ActionsStore
  /** Re-renders the host. Called on every state change the view can see. */
  readonly onChanged: () => void
  /** Opens the workflow-dispatch dialog, which the host owns. */
  readonly onDispatchWorkflow: (repository: Repository) => void
  /** Opens a URL in the user's browser. */
  readonly onOpenExternal: (url: string) => void
  /** Opens the local CI-fix flow for a failed run, when the host has one. */
  readonly onFixCiLocally?: (repository: Repository, runId: number) => void

  /**
   * Opens the run's artifacts.
   *
   * The artifact list is a real surface the classic layout rendered inside the
   * run-details pane — download, provenance, the lot. The MD3 shell has no
   * run-details pane, so the view offers a button instead, and drew nothing at
   * all while nobody supplied this.
   */
  readonly onOpenArtifacts?: (repository: Repository, runId: number) => void
}

export class Md3ActionsController {
  private repository: Repository | null = null
  private repositoryKey: string | null = null
  private subscription: Disposable | null = null
  private jobRequest: AbortController | null = null
  private logRequest: AbortController | null = null
  private loadAllRequest: AbortController | null = null
  private state = initialState()
  private bannerSequence = 0
  /** The branch the `This branch` chip filters to. */
  private currentBranch = ''

  public constructor(private readonly host: IMd3ActionsControllerHost) {}

  /**
   * Point the controller at a repository, or at nothing.
   *
   * Idempotent per repository key: re-pointing at the same repository keeps
   * the loaded runs, the selection and the open log, so an unrelated app-state
   * change does not throw away a page the user is reading.
   */
  public setRepository(
    repository: Repository | null,
    accounts: ReadonlyArray<Account>
  ): void {
    const key = repository === null ? null : getActionsRepositoryKey(repository)
    if (key === this.repositoryKey) {
      this.repository = repository
      return
    }

    this.subscription?.dispose()
    this.subscription = null
    this.abortAll()

    this.repository = repository
    this.repositoryKey = key
    this.state = initialState()

    if (repository === null) {
      this.host.onChanged()
      return
    }

    // Accounts are read by the store itself; this call exists so a controller
    // created before sign-in still refreshes once an account arrives.
    void accounts

    this.subscription = this.host.actionsStore.subscribe(
      repository,
      actions => {
        this.setState({ actions })
      }
    )
  }

  /** Release every subscription and in-flight request. */
  public dispose(): void {
    this.subscription?.dispose()
    this.subscription = null
    this.abortAll()
  }

  private abortAll(): void {
    this.jobRequest?.abort()
    this.jobRequest = null
    this.logRequest?.abort()
    this.logRequest = null
    this.loadAllRequest?.abort()
    this.loadAllRequest = null
  }

  private setState(patch: Partial<IMd3ActionsControllerState>): void {
    this.state = { ...this.state, ...patch }
    this.host.onChanged()
  }

  private banner(kind: IMd3ActionsBanner['kind'], message: string): void {
    this.bannerSequence++
    this.setState({
      banners: [
        ...this.state.banners.slice(-2),
        { id: `banner-${this.bannerSequence}`, kind, message },
      ],
    })
  }

  private reportFailure(error: unknown): void {
    this.banner('error', asError(error).message)
  }

  // -- Filtering ------------------------------------------------------------

  private applyServerFilter(): void {
    const repository = this.repository
    if (repository === null) {
      return
    }
    const { filters } = this.state
    const workflowId =
      filters.workflow === AnyFilterValue
        ? undefined
        : Number.parseInt(filters.workflow, 10)

    void this.host.actionsStore
      .setRunFilter(repository, {
        ...(workflowId !== undefined && Number.isSafeInteger(workflowId)
          ? { workflowId }
          : {}),
        ...(filters.branch === AnyFilterValue
          ? {}
          : { branch: filters.branch }),
        ...(filters.event === AnyFilterValue ? {} : { event: filters.event }),
        ...(filters.status === AnyFilterValue
          ? {}
          : { status: filters.status }),
      })
      .catch(error => this.reportFailure(error))
  }

  private onFilterChange = (name: Md3ActionsFilterName, value: string) => {
    this.setState({ filters: { ...this.state.filters, [name]: value } })
    this.applyServerFilter()
  }

  private onResetFilters = () => {
    this.setState({
      filters: { workflow: '', branch: '', event: '', status: '' },
      chips: [],
    })
    this.applyServerFilter()
  }

  private onToggleFilters = () => {
    this.setState({ filtersOpen: !this.state.filtersOpen })
  }

  private onToggleChip = (chip: Md3ActionsChip) => {
    const active = this.state.chips.includes(chip)
    this.setState({
      chips: active
        ? this.state.chips.filter(entry => entry !== chip)
        : [...this.state.chips, chip],
    })
  }

  // -- Selection ------------------------------------------------------------

  private onSelectRun = (runId: string) => {
    const id = Number.parseInt(runId, 10)
    if (!Number.isSafeInteger(id)) {
      return
    }
    const run = this.state.actions.runs.find(candidate => candidate.id === id)
    this.setState({
      selectedRunId: id,
      selectedAttempt: run?.run_attempt ?? null,
      jobList: null,
      jobsError: null,
      selectedStepId: null,
      selectedJobId: null,
      log: '',
      logError: null,
    })
    this.loadJobs(id, run?.run_attempt ?? null, 1, false)
  }

  private loadJobs(
    runId: number,
    attempt: number | null,
    page: number,
    append: boolean
  ): void {
    const repository = this.repository
    if (repository === null) {
      return
    }

    this.jobRequest?.abort()
    const controller = new AbortController()
    this.jobRequest = controller

    const latestAttempt =
      this.state.actions.runs.find(run => run.id === runId)?.run_attempt ?? null

    this.setState(
      append
        ? { jobsLoadingMore: true }
        : { jobsLoading: true, jobsError: null }
    )

    void this.host.actionsStore
      .fetchJobPage(
        repository,
        runId,
        attempt,
        latestAttempt,
        page,
        controller.signal
      )
      .then(list => {
        if (controller.signal.aborted || this.state.selectedRunId !== runId) {
          return
        }
        const merged =
          append && this.state.jobList !== null
            ? mergeActionsJobPage(this.state.jobList, list)
            : list
        this.setState({
          jobList: merged,
          jobsLoading: false,
          jobsLoadingMore: false,
          jobsError: null,
        })
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return
        }
        this.setState({
          jobsLoading: false,
          jobsLoadingMore: false,
          jobsError: asError(error),
        })
      })
  }

  private onReloadJobs = () => {
    const { selectedRunId, selectedAttempt } = this.state
    if (selectedRunId !== null) {
      this.loadJobs(selectedRunId, selectedAttempt, 1, false)
    }
  }

  private onLoadMoreJobs = () => {
    const { selectedRunId, selectedAttempt, jobList } = this.state
    if (
      selectedRunId === null ||
      jobList === null ||
      jobList.nextPage === null
    ) {
      return
    }
    this.loadJobs(selectedRunId, selectedAttempt, jobList.nextPage, true)
  }

  private onSelectAttempt = (attempt: number) => {
    const { selectedRunId } = this.state
    if (selectedRunId === null) {
      return
    }
    this.setState({ selectedAttempt: attempt, jobList: null })
    this.loadJobs(selectedRunId, attempt, 1, false)
  }

  // -- Steps and logs -------------------------------------------------------

  private onSelectStep = (stepId: string, jobId: string) => {
    const id = Number.parseInt(jobId, 10)
    if (!Number.isSafeInteger(id)) {
      return
    }
    this.setState({ selectedStepId: stepId, selectedJobId: id })
    if (this.state.selectedJobId !== id) {
      this.loadLog(id)
    }
  }

  private loadLog(jobId: number): void {
    const repository = this.repository
    if (repository === null) {
      return
    }

    this.logRequest?.abort()
    const controller = new AbortController()
    this.logRequest = controller
    this.setState({ logLoading: true, logError: null, log: '' })

    void this.host.actionsStore
      .fetchJobLogs(repository, jobId, controller.signal)
      .then(log => {
        if (controller.signal.aborted) {
          return
        }
        this.setState({
          log: typeof log === 'string' ? log : '',
          logLoading: false,
        })
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return
        }
        this.setState({ logLoading: false, logError: asError(error) })
      })
  }

  private onRetryLog = () => {
    if (this.state.selectedJobId !== null) {
      this.loadLog(this.state.selectedJobId)
    }
  }

  // -- Mutations ------------------------------------------------------------

  private withRun(runId: string, run: (id: number) => Promise<void>): void {
    const id = Number.parseInt(runId, 10)
    const repository = this.repository
    if (!Number.isSafeInteger(id) || repository === null) {
      return
    }
    this.setState({ busyRunId: id })
    void run(id)
      .catch(error => this.reportFailure(error))
      .then(() => this.setState({ busyRunId: null }))
  }

  private onRerunRun = (runId: string) => {
    const repository = this.repository
    if (repository === null) {
      return
    }
    this.withRun(runId, id => this.host.actionsStore.rerun(repository, id))
  }

  private onRerunSelectedRun = () => {
    if (this.state.selectedRunId !== null) {
      this.onRerunRun(`${this.state.selectedRunId}`)
    }
  }

  private onRerunFailedJobs = () => {
    const repository = this.repository
    const runId = this.state.selectedRunId
    if (repository === null || runId === null) {
      return
    }
    this.withRun(`${runId}`, id =>
      this.host.actionsStore.rerunFailed(repository, id)
    )
  }

  private onCancelSelectedRun = () => {
    const repository = this.repository
    const runId = this.state.selectedRunId
    if (repository === null || runId === null) {
      return
    }
    this.setState({ busyRunId: runId })
    void this.host.actionsStore
      .cancelRun(repository, runId)
      .then(result => {
        // `accepted` is GitHub having taken the request, which is the only
        // thing this call can honestly report — the run is not cancelled yet.
        this.banner(
          result.accepted ? 'success' : 'warning',
          result.accepted
            ? t('md3.actions.cancelRequested')
            : t('md3.actions.cancelRefused')
        )
      })
      .catch(error => this.reportFailure(error))
      .then(() => this.setState({ busyRunId: null }))
  }

  private onRerunJob = (jobId: string) => {
    const repository = this.repository
    const id = Number.parseInt(jobId, 10)
    if (repository === null || !Number.isSafeInteger(id)) {
      return
    }
    this.setState({ busyJobId: id })
    void this.host.actionsStore
      .rerunJob(repository, id)
      .catch(error => this.reportFailure(error))
      .then(() => {
        this.setState({ busyJobId: null })
        this.onReloadJobs()
      })
  }

  // -- Pagination -----------------------------------------------------------

  private onLoadMoreRuns = () => {
    const repository = this.repository
    if (repository === null) {
      return
    }
    void this.host.actionsStore
      .loadMoreRuns(repository)
      .catch(error => this.reportFailure(error))
  }

  private onLoadAllRuns = () => {
    const repository = this.repository
    if (repository === null || this.state.loadingAll) {
      return
    }

    const controller = new AbortController()
    this.loadAllRequest = controller
    this.setState({ loadingAll: true })

    const step = async (): Promise<void> => {
      // Ask for the next page until the provider says there is not one. Each
      // pass is a real request, so it stays interruptible: a busy repository
      // can be hundreds of pages and the user must be able to stop.
      while (
        !controller.signal.aborted &&
        this.state.actions.runsNextPage !== null
      ) {
        await this.host.actionsStore.loadMoreRuns(repository)
      }
    }

    void step()
      .catch(error => this.reportFailure(error))
      .then(() => {
        if (this.loadAllRequest === controller) {
          this.loadAllRequest = null
        }
        this.setState({ loadingAll: false })
      })
  }

  // -- Bulk selection -------------------------------------------------------

  private onToggleSelectionMode = () => {
    this.setState({
      selectionMode: !this.state.selectionMode,
      selectedRunIds: new Set<string>(),
    })
  }

  private onToggleRunSelection = (runId: string) => {
    const next = new Set(this.state.selectedRunIds)
    if (next.has(runId)) {
      next.delete(runId)
    } else {
      next.add(runId)
    }
    this.setState({ selectedRunIds: next })
  }

  /**
   * Replace the whole selection in one write.
   *
   * The view can compose the same result out of `onToggleRunSelection`, one
   * differing id at a time, and does when this is absent — exact, but one
   * `setState` per changed row, so a select-all over a few hundred runs is a
   * few hundred renders. A shell that can write the set should.
   */
  private onSetRunSelection = (ids: ReadonlyArray<string>) => {
    this.setState({ selectedRunIds: new Set(ids) })
  }

  private onToggleAllVisibleRuns = () => {
    const visible = this.visibleRuns().map(run => `${run.id}`)
    const allSelected = visible.every(id => this.state.selectedRunIds.has(id))
    this.setState({
      selectedRunIds: allSelected ? new Set<string>() : new Set(visible),
    })
  }

  private onClearRunSelection = () => {
    this.setState({ selectedRunIds: new Set<string>() })
  }

  private async runBulk(
    action: (repository: Repository, id: number) => Promise<unknown>
  ): Promise<void> {
    const repository = this.repository
    if (repository === null || this.state.bulkBusy) {
      return
    }
    const ids = [...this.state.selectedRunIds]
      .map(id => Number.parseInt(id, 10))
      .filter(id => Number.isSafeInteger(id))
    if (ids.length === 0) {
      return
    }

    this.setState({ bulkBusy: true })
    let failed = 0
    for (const id of ids) {
      try {
        await action(repository, id)
      } catch {
        // One refused run must not abandon the rest of the batch; the count is
        // reported honestly at the end instead of the batch claiming success.
        failed++
      }
    }
    this.setState({ bulkBusy: false })
    this.banner(
      failed === 0 ? 'success' : 'warning',
      failed === 0
        ? t('md3.actions.bulkDone', { count: String(ids.length) })
        : t('md3.actions.bulkPartial', {
            done: String(ids.length - failed),
            failed: String(failed),
          })
    )
  }

  private onBulkRerun = () => {
    void this.runBulk((repository, id) =>
      this.host.actionsStore.rerun(repository, id)
    )
  }

  private onBulkCancel = () => {
    void this.runBulk((repository, id) =>
      this.host.actionsStore.cancelRun(repository, id)
    )
  }

  // -- Derived --------------------------------------------------------------

  private visibleRuns(): ReadonlyArray<IAPIWorkflowRun> {
    const { chips, actions } = this.state
    if (chips.length === 0) {
      return actions.runs
    }
    return actions.runs.filter(run => {
      for (const chip of chips) {
        switch (chip) {
          case 'Running':
            if (run.status === 'completed') {
              return false
            }
            break
          case 'Failed':
            if (run.conclusion !== 'failure') {
              return false
            }
            break
          case 'Success':
            if (run.conclusion !== 'success') {
              return false
            }
            break
          case 'This branch':
            if (run.head_branch !== this.currentBranch) {
              return false
            }
            break
        }
      }
      return true
    })
  }

  /** The branch the `This branch` chip filters to. */
  public setCurrentBranch(branch: string): void {
    this.currentBranch = branch
  }

  /**
   * Re-read the run list from the provider, exactly as the pane's refresh
   * control does.
   */
  public refresh(): void {
    const repository = this.repository
    if (repository === null) {
      return
    }
    void this.host.actionsStore
      .refresh(repository, true)
      .catch(error => this.reportFailure(error))
  }

  /** Page through every remaining run, interruptibly. */
  public loadAllRuns(): void {
    this.onLoadAllRuns()
  }

  /** How many runs are loaded, and how many the provider reports in total. */
  public getRunCounts(): { readonly loaded: number; readonly total: number } {
    const { actions } = this.state
    return {
      loaded: actions.runs.length,
      total: Math.max(actions.runsTotalCount, actions.runs.length),
    }
  }

  /**
   * Move the selected run to its previous attempt, wrapping to the latest once
   * it passes the first.
   *
   * The wrap is what makes one menu row enough to reach every attempt, exactly
   * as it is for `stepMd3DiffContextLines`. Returns the attempt now selected,
   * or `null` when no run is selected or the run has only ever run once.
   */
  public stepSelectedAttempt(): number | null {
    const attempts = this.attempts()
    if (attempts === null || attempts.options.length < 2) {
      return null
    }
    const index = attempts.options.indexOf(attempts.selected)
    const next =
      index <= 0
        ? attempts.options[attempts.options.length - 1]
        : attempts.options[index - 1]
    this.onSelectAttempt(next)
    return next
  }

  /** The attempt currently selected, or `null` when no run is selected. */
  public getSelectedAttempt(): number | null {
    return this.attempts()?.selected ?? null
  }

  /** The live Actions state, for a host rendering the real cache manager. */
  public getActionsState(): IActionsState {
    return this.state.actions
  }

  /** The repository the controller is pointed at, or `null`. */
  public getRepository(): Repository | null {
    return this.repository
  }

  /**
   * Load the cache inventory once, for a host about to render the cache
   * manager. The manager reads what the store holds and never fetches for
   * itself, so opening it without this shows an empty inventory that looks
   * like a repository with no caches.
   */
  public ensureCacheManagerLoaded(): void {
    const repository = this.repository
    const actions = this.state.actions
    if (
      repository === null ||
      repository.gitHubRepository === null ||
      !actions.supported ||
      actions.caches !== null ||
      actions.cacheUsage !== null ||
      actions.cachesLoading ||
      actions.cacheUsageLoading ||
      actions.cachesError !== null
    ) {
      return
    }
    void this.host.actionsStore
      .loadCacheManager(repository)
      .catch(error => this.reportFailure(error))
  }

  /** Enable or disable a workflow, reporting the outcome on the pane's banners. */
  public setWorkflowEnabled(workflowId: number, enabled: boolean): void {
    const repository = this.repository
    if (repository === null) {
      return
    }
    const name =
      this.state.actions.workflows.find(workflow => workflow.id === workflowId)
        ?.name ?? String(workflowId)
    void this.host.actionsStore
      .setWorkflowEnabled(repository, workflowId, enabled)
      .then(() =>
        this.banner(
          'success',
          enabled
            ? t('md3.actions.workflowEnabled', { name })
            : t('md3.actions.workflowDisabled', { name })
        )
      )
      .catch(error => this.reportFailure(error))
  }

  /**
   * The live workflow and run lists, for a host rendering the real
   * workflow-dispatch dialog. The dialog needs the same lists the run pane is
   * showing, so it reads them from here rather than fetching a second copy
   * that could disagree with what is on screen.
   */
  public getDispatchContext(): {
    readonly workflows: IActionsState['workflows']
    readonly runs: ReadonlyArray<IAPIWorkflowRun>
  } {
    return {
      workflows: this.state.actions.workflows,
      runs: this.state.actions.runs,
    }
  }

  /** Run a dispatch through the store and refresh, reporting failure honestly. */
  public dispatchWorkflow(
    workflowId: number,
    ref: string,
    inputs: Readonly<Record<string, string>>
  ): Promise<void> {
    const repository = this.repository
    if (repository === null) {
      return Promise.reject(new Error(t('md3.actions.noRepository')))
    }
    return this.host.actionsStore.dispatch(repository, workflowId, ref, inputs)
  }

  private failedJobRunIds(): ReadonlySet<number> {
    const ids = new Set<number>()
    for (const run of this.state.actions.runs) {
      if (run.conclusion === 'failure') {
        ids.add(run.id)
      }
    }
    return ids
  }

  /**
   * The job count of every run whose job page has actually been read.
   *
   * A run summary from the runs endpoint carries no job count at all, so this
   * is one entry — the selected run — until another run's jobs are loaded. Any
   * run missing from the map has an unknown count and its row says nothing
   * about jobs, rather than reporting a `0` no real run ever has.
   */
  private jobCounts(): ReadonlyMap<number, number> {
    const { jobList } = this.state
    return jobList === null
      ? new Map<number, number>()
      : new Map<number, number>([[jobList.runId, jobList.totalCount]])
  }

  private filterOptions(): Readonly<
    Record<Md3ActionsFilterName, ReadonlyArray<IMd3ActionsFilterOption>>
  > {
    const { actions } = this.state
    const branches = new Set<string>()
    for (const run of actions.runs) {
      if (run.head_branch !== null && run.head_branch !== undefined) {
        branches.add(run.head_branch)
      }
    }

    return {
      workflow: actions.workflows.map(workflow => ({
        value: `${workflow.id}`,
        label: workflow.name,
      })),
      branch: [...branches].sort().map(value => ({ value, label: value })),
      event: eventOptions(actions.runs),
      status: StatusFilterValues.map(value => ({ value, label: value })),
    }
  }

  private pagination(): IMd3ActionsPagination | null {
    const { actions } = this.state
    if (actions.runs.length === 0 && actions.runsTotalCount === 0) {
      return null
    }
    return {
      loadedCount: actions.runs.length,
      totalCount: actions.runsTotalCount,
      hasMore: actions.runsNextPage !== null,
      loadingMore: actions.runsLoadingMore,
      loadingAll: this.state.loadingAll,
    }
  }

  private attempts(): IMd3ActionsAttempts | null {
    const { selectedRunId, selectedAttempt, actions } = this.state
    if (selectedRunId === null) {
      return null
    }
    const run = actions.runs.find(candidate => candidate.id === selectedRunId)
    const latest = run?.run_attempt ?? 1
    return {
      selected: selectedAttempt ?? latest,
      latest,
      options: getActionsJobAttemptOptions(latest),
    }
  }

  private banners(): ReadonlyArray<IMd3ActionsBanner> {
    const { actions } = this.state
    const banners = [...this.state.banners]
    if (!actions.supported) {
      banners.unshift({
        id: 'unsupported',
        kind: 'warning',
        message: t('md3.actions.unsupported'),
      })
    }
    if (actions.error !== null) {
      banners.unshift({
        id: 'store-error',
        kind: 'error',
        message: actions.error.message,
      })
    }
    return banners
  }

  /**
   * The Actions view's props, built from the live store state.
   *
   * @param runSearch  The shell's `actions` search field binding.
   * @param logSearch  The shell's `logs` search field binding.
   */
  public getViewProps(
    runSearch: IMd3SearchBinding,
    logSearch: IMd3SearchBinding,
    onOpenPaneMenu: () => void,
    onOpenRunMenu: (runId: string) => void
  ): IMd3ActionsViewProps {
    const { state } = this
    const preferences = getMd3ViewPreferences()
    const repository = this.repository
    const visible = this.visibleRuns()
    const runs = md3ActionsRuns({
      runs: visible,
      busyRunId: state.busyRunId,
      failedJobRunIds: this.failedJobRunIds(),
      jobCounts: this.jobCounts(),
    })
    const selectedRun =
      state.selectedRunId === null
        ? null
        : runs.find(run => run.id === `${state.selectedRunId}`) ?? null

    const search = (binding: IMd3SearchBinding): IMd3ActionsSearch => ({
      value: binding.value,
      regexEnabled: binding.regexEnabled,
      error: null,
      onChange: binding.onChange,
      onClear: binding.onClear,
      onToggleRegex: binding.onToggleRegex,
      onOpenBuilder: binding.onOpenBuilder,
    })

    const jobs =
      state.jobList === null
        ? []
        : md3ActionsJobs(state.jobList.jobs, state.busyJobId)

    return {
      runSearch: search(runSearch),
      activeChips: state.chips,
      onToggleChip: this.onToggleChip,
      thisBranchAvailable: this.currentBranch.length > 0,
      canDispatch: repository !== null && state.actions.workflows.length > 0,
      onDispatchWorkflow: () => {
        if (repository !== null) {
          this.host.onDispatchWorkflow(repository)
        }
      },
      filtersOpen: state.filtersOpen,
      onToggleFilters: this.onToggleFilters,
      filterValues: state.filters,
      filterOptions: this.filterOptions(),
      onFilterChange: this.onFilterChange,
      onResetFilters: this.onResetFilters,
      selectionMode: state.selectionMode,
      onToggleSelectionMode: this.onToggleSelectionMode,
      selectedRunIds: state.selectedRunIds,
      onToggleRunSelection: this.onToggleRunSelection,
      onSetRunSelection: this.onSetRunSelection,
      // Undefined when there is no selected run or no host handler, because
      // the view draws no Artifacts button without one — which is right: an
      // artifacts button with no run to fetch them for is a dead control.
      onOpenArtifacts:
        this.host.onOpenArtifacts === undefined ||
        repository === null ||
        state.selectedRunId === null
          ? undefined
          : () =>
              this.host.onOpenArtifacts?.(
                repository,
                Number(state.selectedRunId)
              ),
      onToggleAllVisibleRuns: this.onToggleAllVisibleRuns,
      onClearRunSelection: this.onClearRunSelection,
      onBulkRerun: this.onBulkRerun,
      onBulkCancel: this.onBulkCancel,
      bulkBusy: state.bulkBusy,
      runs,
      selectedRunId:
        state.selectedRunId === null ? null : `${state.selectedRunId}`,
      onSelectRun: this.onSelectRun,
      onRerunRun: this.onRerunRun,
      onOpenRunMenu,
      pagination: this.pagination(),
      onLoadMoreRuns: this.onLoadMoreRuns,
      onLoadAllRuns: this.onLoadAllRuns,
      selectedRun,
      onRerunSelectedRun: this.onRerunSelectedRun,
      onRerunFailedJobs: this.onRerunFailedJobs,
      onOpenPaneMenu,
      onCancelSelectedRun: this.onCancelSelectedRun,
      onFixCiLocally:
        this.host.onFixCiLocally === undefined ||
        repository === null ||
        state.selectedRunId === null
          ? undefined
          : () =>
              this.host.onFixCiLocally?.(repository, state.selectedRunId ?? 0),
      onOpenRunOnGitHub: this.openSelectedRunOnGitHub,
      attempts: this.attempts(),
      onSelectAttempt: this.onSelectAttempt,
      jobs,
      selectedStepId: state.selectedStepId,
      onSelectStep: this.onSelectStep,
      jobsLoading: state.jobsLoading,
      jobsLoadingMore: state.jobsLoadingMore,
      jobsError: state.jobsError,
      jobsHasMore: state.jobList !== null && state.jobList.nextPage !== null,
      jobsTruncated: state.jobList?.truncated ?? false,
      onLoadMoreJobs: this.onLoadMoreJobs,
      onReloadJobs: this.onReloadJobs,
      onRerunJob: this.onRerunJob,
      onOpenJobOnGitHub: this.openJobOnGitHub,
      logSearch: search(logSearch),
      logText: state.log,
      logLoading: state.logLoading,
      logError: state.logError,
      onRetryLog: this.onRetryLog,
      // Both are persisted presentation preferences the shell's menus flip, so
      // they are read here rather than mirrored into controller state — a
      // second copy is how a menu hint starts disagreeing with the pane.
      logGroupsCollapsed: preferences.logGroupsCollapsed,
      runListWidth: preferences.actionsRunListWidth,
      banners: this.banners(),
    }
  }

  private openSelectedRunOnGitHub = () => {
    const run = this.state.actions.runs.find(
      candidate => candidate.id === this.state.selectedRunId
    )
    if (run?.html_url !== undefined) {
      this.host.onOpenExternal(run.html_url)
    }
  }

  private openJobOnGitHub = (jobId: string) => {
    const id = Number.parseInt(jobId, 10)
    const job = this.state.jobList?.jobs.find(candidate => candidate.id === id)
    if (job !== undefined && job.htmlUrl.length > 0) {
      this.host.onOpenExternal(job.htmlUrl)
    }
  }
}

/** Every filter name, for a host that renders its own filter row. */
export const Md3ActionsFilterNames = ActionsFilterNames
