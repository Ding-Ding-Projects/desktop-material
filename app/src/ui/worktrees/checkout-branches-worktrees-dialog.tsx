import * as React from 'react'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { SectionFilterList } from '../lib/section-filter-list'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { Ref } from '../lib/ref'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { getBranches } from '../../lib/git'
import {
  BranchWorktreeContainerName,
  IBranchWorktreeCandidate,
  IBranchWorktreeProgress,
  IBranchWorktreePlan,
  planBranchWorktrees,
  safelyListWorktrees,
} from '../../lib/git/branch-worktrees'
import { IListFilter } from '../lib/filter-list-mode'

const RowHeight = 48

interface IBranchWorktreeListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly candidate: IBranchWorktreeCandidate
}

type BranchWorktreeGroup = 'local' | 'remote'

const BranchTypeFilters: ReadonlyArray<IListFilter<IBranchWorktreeListItem>> = [
  {
    id: 'local',
    label: 'Local',
    predicate: item => item.candidate.createBranch === undefined,
  },
  {
    id: 'remote',
    label: 'Remote',
    predicate: item => item.candidate.createBranch !== undefined,
  },
]

interface ICheckoutBranchesAsWorktreesDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /**
   * The branches already known to the app. They are only a starting point -
   * the dialog always re-reads the refs so that a repository cloned moments
   * ago lists every branch the clone brought down.
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * Set when the dialog opens straight after a clone, which changes the copy
   * from "this repository" to "the repository you just cloned".
   */
  readonly fromClone?: boolean

  readonly onDismissed: () => void
}

interface ICheckoutBranchesAsWorktreesDialogState {
  /** Set while the branches and existing worktrees are being read. */
  readonly loading: boolean

  readonly plan: IBranchWorktreePlan | null

  /** The branch names that will get a worktree. Every branch starts selected. */
  readonly selectedBranches: ReadonlySet<string>

  /** The rows currently surviving the search, for "select these". */
  readonly visibleBranches: ReadonlyArray<string>

  readonly filterText: string

  /** Set while the worktrees are being created. */
  readonly creating: boolean

  readonly progress: IBranchWorktreeProgress | null

  /** The branches that could not be checked out, after an attempt. */
  readonly failures: ReadonlyArray<{
    readonly branchName: string
    readonly message: string
  }>

  readonly error: Error | null
}

interface IBranchWorktreeRowProps {
  readonly item: IBranchWorktreeListItem
  readonly matches: IMatches
  readonly checked: boolean
  readonly onToggle: (branchName: string) => void
}

/**
 * One selectable branch row. A class component so the checkbox handlers are
 * stable instance methods rather than arrows rebuilt on every render of a
 * virtualized list.
 */
class BranchWorktreeRow extends React.PureComponent<IBranchWorktreeRowProps> {
  private onCheckboxClick = (event: React.MouseEvent<HTMLInputElement>) => {
    // The row itself toggles too; without this the checkbox would toggle twice.
    event.stopPropagation()
  }

  private onCheckboxChange = () =>
    this.props.onToggle(this.props.item.candidate.branchName)

  public render() {
    const { item, matches, checked } = this.props
    const { candidate } = item

    return (
      <div className="branch-worktree-row">
        <Checkbox
          className="branch-worktree-checkbox"
          value={checked ? CheckboxValue.On : CheckboxValue.Off}
          onClick={this.onCheckboxClick}
          onChange={this.onCheckboxChange}
          ariaLabel={`Check out ${candidate.branchName} as a worktree`}
        />
        <Octicon className="branch-worktree-icon" symbol={octicons.gitBranch} />
        <div className="branch-worktree-detail">
          <div className="branch-worktree-name">
            <HighlightText
              text={candidate.branchName}
              highlight={matches.title}
            />
          </div>
          <div className="branch-worktree-path">
            {candidate.remoteName !== undefined && (
              <span className="branch-worktree-remote">
                {candidate.remoteName}
              </span>
            )}
            {candidate.path}
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Checks a whole repository out at once: every branch the user picks gets its
 * own linked worktree under a single container directory, so the branches are
 * all on disk without a directory per branch landing next to the repository.
 *
 * Opened both from the clone flow (all branches of a fresh clone) and from an
 * existing repository (the branches that do not have a worktree yet).
 */
export class CheckoutBranchesAsWorktreesDialog extends React.Component<
  ICheckoutBranchesAsWorktreesDialogProps,
  ICheckoutBranchesAsWorktreesDialogState
> {
  private isMounted_ = false

  public constructor(props: ICheckoutBranchesAsWorktreesDialogProps) {
    super(props)

    this.state = {
      loading: true,
      plan: null,
      selectedBranches: new Set<string>(),
      visibleBranches: [],
      filterText: '',
      creating: false,
      progress: null,
      failures: [],
      error: null,
    }
  }

  public componentDidMount() {
    this.isMounted_ = true
    this.loadPlan()
  }

  public componentWillUnmount() {
    this.isMounted_ = false
  }

  private async loadPlan() {
    const { repository, allBranches } = this.props

    try {
      const [branches, worktrees] = await Promise.all([
        getBranches(repository).catch(() => allBranches),
        safelyListWorktrees(repository),
      ])

      const plan = planBranchWorktrees(
        repository.path,
        branches.length > 0 ? branches : allBranches,
        worktrees
      )

      if (!this.isMounted_) {
        return
      }

      this.setState({
        loading: false,
        plan,
        // Every branch is selected by default; the list is there to take
        // branches out of a set that is already complete.
        selectedBranches: new Set(plan.candidates.map(c => c.branchName)),
      })
    } catch (e) {
      if (this.isMounted_) {
        this.setState({ loading: false, error: e as Error })
      }
    }
  }

  private getGroups(
    plan: IBranchWorktreePlan
  ): ReadonlyArray<
    IFilterListGroup<IBranchWorktreeListItem, BranchWorktreeGroup>
  > {
    const groups = new Array<
      IFilterListGroup<IBranchWorktreeListItem, BranchWorktreeGroup>
    >()

    const toItem = (candidate: IBranchWorktreeCandidate) => ({
      id: candidate.branchName,
      text: [
        candidate.branchName,
        candidate.path,
        candidate.remoteName ?? '',
        candidate.sha.slice(0, 8),
      ],
      candidate,
    })

    const local = plan.candidates.filter(c => c.createBranch === undefined)
    const remote = plan.candidates.filter(c => c.createBranch !== undefined)

    if (local.length > 0) {
      groups.push({ identifier: 'local', items: local.map(toItem) })
    }

    if (remote.length > 0) {
      groups.push({ identifier: 'remote', items: remote.map(toItem) })
    }

    return groups
  }

  private onToggleBranch = (branchName: string) => {
    this.setState(state => {
      const selectedBranches = new Set(state.selectedBranches)
      if (!selectedBranches.delete(branchName)) {
        selectedBranches.add(branchName)
      }
      return { selectedBranches }
    })
  }

  private onItemClick = (item: IBranchWorktreeListItem) =>
    this.onToggleBranch(item.candidate.branchName)

  private onVisibleItemsChanged = (
    items: ReadonlyArray<IBranchWorktreeListItem>
  ) => this.setState({ visibleBranches: items.map(item => item.id) })

  private onFilterTextChanged = (filterText: string) =>
    this.setState({ filterText })

  private onSelectAllVisible = () =>
    this.setState(state => {
      const branches =
        state.filterText.trim().length === 0 && state.plan !== null
          ? state.plan.candidates.map(candidate => candidate.branchName)
          : state.visibleBranches
      return {
        selectedBranches: new Set([...state.selectedBranches, ...branches]),
      }
    })

  private onSelectNoneVisible = () =>
    this.setState(state => {
      const selectedBranches = new Set(state.selectedBranches)
      const branches =
        state.filterText.trim().length === 0 && state.plan !== null
          ? state.plan.candidates.map(candidate => candidate.branchName)
          : state.visibleBranches
      for (const branchName of branches) {
        selectedBranches.delete(branchName)
      }
      return { selectedBranches }
    })

  private onProgress = (progress: IBranchWorktreeProgress) => {
    if (this.isMounted_) {
      this.setState({ progress })
    }
  }

  private getSelectedCandidates(): ReadonlyArray<IBranchWorktreeCandidate> {
    const { plan, selectedBranches } = this.state
    return plan === null
      ? []
      : plan.candidates.filter(c => selectedBranches.has(c.branchName))
  }

  private onSubmit = async () => {
    const candidates = this.getSelectedCandidates()

    if (candidates.length === 0) {
      return
    }

    this.setState({ creating: true, failures: [], error: null, progress: null })

    const results = await this.props.dispatcher
      .checkoutBranchesAsWorktrees(
        this.props.repository,
        candidates,
        this.onProgress
      )
      .catch((e: Error) => e)

    if (!this.isMounted_) {
      return
    }

    if (results instanceof Error) {
      this.setState({ creating: false, progress: null, error: results })
      return
    }

    const failures = results
      .filter(result => result.error !== undefined)
      .map(result => ({
        branchName: result.branchName,
        message: result.error?.message ?? 'Unknown error',
      }))

    if (failures.length === 0) {
      this.props.onDismissed()
      return
    }

    // Some branches are now checked out and some are not, so the dialog stays
    // open naming the ones that failed rather than reporting a flat success.
    const attempted = results.map(result => result.branchName)
    this.setState(prev => ({
      creating: false,
      progress: null,
      failures,
      plan: this.removeSucceeded(prev.plan, attempted, failures),
      selectedBranches: new Set(failures.map(f => f.branchName)),
    }))
  }

  private removeSucceeded(
    plan: IBranchWorktreePlan | null,
    attempted: ReadonlyArray<string>,
    failures: ReadonlyArray<{ readonly branchName: string }>
  ): IBranchWorktreePlan | null {
    if (plan === null) {
      return null
    }

    const failed = new Set(failures.map(f => f.branchName))
    const succeeded = new Set(
      attempted.filter(branchName => !failed.has(branchName))
    )

    return {
      ...plan,
      candidates: plan.candidates.filter(c => !succeeded.has(c.branchName)),
    }
  }

  private renderItem = (item: IBranchWorktreeListItem, matches: IMatches) => (
    <BranchWorktreeRow
      item={item}
      matches={matches}
      checked={this.state.selectedBranches.has(item.candidate.branchName)}
      onToggle={this.onToggleBranch}
    />
  )

  private renderGroupHeader = (identifier: BranchWorktreeGroup) => (
    <div className="filter-list-group-header">
      {identifier === 'local' ? 'Local branches' : 'Remote branches'}
    </div>
  )

  private renderPostFilter = () => {
    const filtered = this.state.filterText.trim().length > 0
    return (
      <div className="branch-worktrees-selection-actions">
        <Button onClick={this.onSelectAllVisible}>
          {filtered ? 'Select shown' : 'Select all'}
        </Button>
        <Button onClick={this.onSelectNoneVisible}>
          {filtered ? 'Deselect shown' : 'Select none'}
        </Button>
      </div>
    )
  }

  private renderNoItems = () => (
    <div className="no-items-found">No branches match this search</div>
  )

  private renderSummary(plan: IBranchWorktreePlan) {
    const { repository, fromClone } = this.props
    const alreadyCheckedOut = plan.skipped.filter(
      s => s.reason === 'already-checked-out'
    ).length
    const shadowedByLocal = plan.skipped.filter(
      s => s.reason === 'shadowed-by-local'
    ).length
    const duplicateRemote = plan.skipped.filter(
      s => s.reason === 'duplicate-remote'
    ).length
    const directoryConflicts = plan.skipped.filter(
      s => s.reason === 'directory-conflict'
    ).length

    return (
      <p className="branch-worktrees-summary">
        Every branch you keep selected is checked out into its own worktree
        under <Ref>{BranchWorktreeContainerName}</Ref> inside{' '}
        <Ref>{repository.name}</Ref>
        {fromClone ? ', the repository you just cloned' : ''}, so the branches
        never land next to your other repositories.
        {alreadyCheckedOut > 0 && (
          <>
            {' '}
            {alreadyCheckedOut}{' '}
            {alreadyCheckedOut === 1 ? 'branch is' : 'branches are'} already
            checked out and {alreadyCheckedOut === 1 ? 'is' : 'are'} not listed.
          </>
        )}
        {shadowedByLocal > 0 && (
          <>
            {' '}
            {shadowedByLocal} remote{' '}
            {shadowedByLocal === 1 ? 'branch matches' : 'branches match'} a
            local branch and {shadowedByLocal === 1 ? 'is' : 'are'} not listed
            twice.
          </>
        )}
        {duplicateRemote > 0 && (
          <>
            {' '}
            {duplicateRemote} duplicate remote{' '}
            {duplicateRemote === 1 ? 'branch is' : 'branches are'} not listed
            twice.
          </>
        )}
        {directoryConflicts > 0 && (
          <>
            {' '}
            {directoryConflicts}{' '}
            {directoryConflicts === 1 ? 'branch needs' : 'branches need'} a
            directory that overlaps an earlier branch and{' '}
            {directoryConflicts === 1 ? 'is' : 'are'} not listed.
          </>
        )}
      </p>
    )
  }

  private renderFailures() {
    const { failures } = this.state

    if (failures.length === 0) {
      return null
    }

    return (
      <DialogError>
        <p>
          {failures.length} {failures.length === 1 ? 'branch' : 'branches'}{' '}
          could not be checked out. The rest were created.
        </p>
        <ul className="branch-worktrees-failures">
          {failures.map(failure => (
            <li key={failure.branchName}>
              <Ref>{failure.branchName}</Ref> — {failure.message}
            </li>
          ))}
        </ul>
      </DialogError>
    )
  }

  private renderProgress() {
    const { progress } = this.state

    if (progress === null) {
      return null
    }

    return (
      <div className="branch-worktrees-progress" role="status">
        Checking out <Ref>{progress.branchName}</Ref> ({progress.value} of{' '}
        {progress.total})
      </div>
    )
  }

  private renderContent() {
    const { loading, plan } = this.state

    if (loading) {
      return (
        <DialogContent>
          <p>Reading branches…</p>
        </DialogContent>
      )
    }

    if (plan === null || plan.candidates.length === 0) {
      return (
        <DialogContent>
          <p>
            Every branch in <Ref>{this.props.repository.name}</Ref> is already
            checked out in a worktree.
          </p>
        </DialogContent>
      )
    }

    return (
      <DialogContent>
        {this.renderSummary(plan)}
        <SectionFilterList<IBranchWorktreeListItem, BranchWorktreeGroup>
          className="branch-worktrees-list"
          rowHeight={RowHeight}
          filterListId="checkout-branches-as-worktrees"
          filterListLabel="Branches"
          placeholderText="Search branches"
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          selectedItem={null}
          groups={this.getGroups(plan)}
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          onItemClick={this.onItemClick}
          onVisibleItemsChanged={this.onVisibleItemsChanged}
          invalidationProps={{
            candidates: plan.candidates,
            selected: this.state.selectedBranches,
          }}
          customFilters={BranchTypeFilters}
        />
        {this.renderProgress()}
      </DialogContent>
    )
  }

  public render() {
    const selectedCount = this.getSelectedCandidates().length
    const total = this.state.plan?.candidates.length ?? 0

    return (
      <Dialog
        id="checkout-branches-as-worktrees"
        title={
          __DARWIN__
            ? 'Check Out All Branches as Worktrees'
            : 'Check out all branches as worktrees'
        }
        loading={this.state.loading || this.state.creating}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error.message}</DialogError>
        )}
        {this.renderFailures()}
        {this.renderContent()}
        <DialogFooter>
          <div className="branch-worktrees-count" role="status">
            {selectedCount} of {total}{' '}
            {selectedCount === 1 ? 'branch' : 'branches'} selected
          </div>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Worktrees' : 'Create worktrees'}
            okButtonDisabled={
              selectedCount === 0 || this.state.creating || this.state.loading
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
