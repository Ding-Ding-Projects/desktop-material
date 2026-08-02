import * as React from 'react'
import classNames from 'classnames'

import { Commit, CommitOneLine, ICommitContext } from '../../models/commit'
import {
  HistoryScope,
  HistoryTabMode,
  ICompareState,
  ICompareBranch,
  ComparisonMode,
  IDisplayHistory,
} from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { defaultErrorHandler, Dispatcher } from '../dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'
import { IBranchListItem } from '../branches/group-branches'
import { TabBar } from '../tab-bar'
import { CompareBranchListItem } from './compare-branch-list-item'
import { FancyTextBox } from '../lib/fancy-text-box'
import * as octicons from '../octicons/octicons.generated'
import { SelectionSource } from '../lib/filter-list'
import {
  FilterMode,
  IMatch,
  IMatches,
  matchWithMode,
  mergeMatchesByDescendingScore,
} from '../../lib/fuzzy-find'
import { MaxRegexTotalInputLength } from '../../lib/safe-regex'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { Ref } from '../lib/ref'
import { MergeCallToActionWithConflicts } from './merge-call-to-action-with-conflicts'
import { AheadBehindStore } from '../../lib/stores/ahead-behind-store'
import { DragType } from '../../models/drag-drop'
import { PopupType } from '../../models/popup'
import { getUniqueCoauthorsAsAuthors } from '../../lib/unique-coauthors-as-authors'
import { getSquashedCommitDescription } from '../../lib/squash/squashed-commit-description'
import { doMergeCommitsExistAfterCommit } from '../../lib/git'
import { KeyboardInsertionData } from '../lib/list'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'
import { formatNumber } from '../../lib/format-number'
import { getCommitSearchKeys } from '../../lib/commit-search'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import { RegexBuilder } from '../lib/regex-builder/regex-builder'
import { isAttributableEmailFor } from '../../lib/email'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translateForAccessibleName,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'
import { CollapsibleSection } from '../lib/collapsible-section'
import { collapsibleRepositoryKey } from '../../lib/collapsed-state'
import { HistoryGraphView } from './history-graph-view'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly isLocalRepository: boolean
  readonly compareState: ICompareState
  readonly emoji: Map<string, Emoji>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly askForConfirmationOnCheckoutCommit: boolean
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly selectedCommitShas: ReadonlyArray<string>
  readonly onRevertCommit: (commit: Commit) => void
  readonly onAmendCommit: (commit: Commit, isLocalCommit: boolean) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly onCompareListScrolled: (scrollTop: number) => void
  readonly onCherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void
  readonly compareListScrollTop?: number
  readonly localTags: Map<string, string> | null
  readonly tagsToPush: ReadonlyArray<string> | null
  readonly aheadBehindStore: AheadBehindStore
  readonly isMultiCommitOperationInProgress?: boolean
  readonly shasToHighlight: ReadonlyArray<string>
  readonly accounts: ReadonlyArray<Account>
  readonly preferAbsoluteDates: boolean
}
interface ICompareSidebarState {
  /**
   * This branch should only be used when tracking interactions that the user is performing.
   *
   * For all other cases, use the prop
   */
  readonly focusedBranch: Branch | null

  /** Data to be reordered via keyboard */
  readonly keyboardReorderData?: KeyboardInsertionData

  /**
   * Free-text filter applied client-side to the History commit list
   * (matches commit summary / author / SHA). Empty string means no filter.
   */
  readonly commitFilterText: string

  /** The matching strategy used by the History commit filter. */
  readonly commitFilterMode: FilterMode

  /** Whether the History commit filter matches case-sensitively. */
  readonly commitFilterCaseSensitive: boolean

  /** Whether the ancestry graph is visible beside commit rows. */
  readonly showCommitGraph: boolean

  /**
   * Whether history renders as the three-column Branch / Graph / Message view
   * instead of the commit list.
   */
  readonly showGraphView: boolean

  /**
   * Whether the inline filter chip row (v2 prototype "History panel" chips) is
   * shown below the commit search field.
   */
  readonly showCommitFilterChips: boolean

  /** Chip predicate: only show commits that haven't been pushed. */
  readonly commitFilterUnpushed: boolean

  /** Chip predicate: only show commits carrying at least one tag. */
  readonly commitFilterTagged: boolean

  /** Chip predicate: only show commits authored by a signed-in account. */
  readonly commitFilterMine: boolean

  /** Whether the full regex-builder dialog is open. */
  readonly isRegexBuilderOpen: boolean

  /** Active persisted language mode for the new history-scope controls. */
  readonly languageMode: LanguageMode
}

/**
 * The cached inputs and outputs of the History commit filter.
 *
 * The filter runs over every loaded commit and the sidebar re-renders on every
 * app-store update, so the result is cached against the exact inputs that
 * produced it (the repo-wide memoize-one style, hand-rolled because search
 * auto-deepening also needs incremental appends: when a commit batch arrives
 * for an unchanged query only the added SHAs are matched and merged instead of
 * re-filtering the whole history per batch).
 */
interface ICommitFilterCache {
  readonly commitSHAs: ReadonlyArray<string>
  readonly commitLookup: Map<string, Commit>
  readonly query: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
  readonly filterUnpushed: boolean
  readonly filterTagged: boolean
  readonly filterMine: boolean
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly tagsToPush: ReadonlyArray<string> | null
  readonly accounts: ReadonlyArray<Account>
  readonly historyScope: HistoryScope
  /** Query-match results in display order (scores kept for fuzzy merging). */
  readonly results: ReadonlyArray<IMatch<string>>
  /** The filtered SHAs handed to the commit list. */
  readonly filteredSHAs: ReadonlyArray<string>
  /**
   * The total search-key length already fed to the regex engine, so appended
   * batches preserve matchWithMode's cumulative fail-closed input cap.
   */
  readonly regexInputLength: number
  /** The regex pass reported an error; appended batches must re-run in full. */
  readonly regexError: boolean
}

/** localStorage key used to persist the History commit filter mode. */
const CommitFilterListId = 'history-commits'
const ShowCommitGraphKey = 'history-show-commit-graph'
const ShowGraphViewKey = 'history-show-graph-view'

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<
  ICompareSidebarProps,
  ICompareSidebarState
> {
  private textbox: TextBox | null = null
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)
  private branchList: BranchList | null = null
  private commitListRef = React.createRef<CommitList>()
  private historyGraphViewRef = React.createRef<HistoryGraphView>()
  private loadingMoreCommitsPromise: Promise<void> | null = null
  private loadingSearchCommitsPromise: Promise<void> | null = null
  private exhaustedSearchQuery: string | null = null
  private commitFilterCache: ICommitFilterCache | null = null
  private isUnmounted = false
  private resultCount = 0

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      focusedBranch: null,
      commitFilterText: '',
      commitFilterMode: readPersistedFilterMode(CommitFilterListId),
      commitFilterCaseSensitive: false,
      showCommitGraph: getBoolean(ShowCommitGraphKey, true),
      showGraphView: getBoolean(ShowGraphViewKey, false),
      showCommitFilterChips: false,
      commitFilterUnpushed: false,
      commitFilterTagged: false,
      commitFilterMine: false,
      isRegexBuilderOpen: false,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillReceiveProps(nextProps: ICompareSidebarProps) {
    const newFormState = nextProps.compareState.formState
    const oldFormState = this.props.compareState.formState

    if (
      newFormState.kind !== oldFormState.kind &&
      newFormState.kind === HistoryTabMode.History
    ) {
      this.setState({
        focusedBranch: null,
      })
      return
    }

    if (
      newFormState.kind !== HistoryTabMode.History &&
      oldFormState.kind !== HistoryTabMode.History
    ) {
      const oldBranch = oldFormState.comparisonBranch
      const newBranch = newFormState.comparisonBranch

      if (oldBranch.name !== newBranch.name) {
        // ensure the focused branch is in sync with the chosen branch
        this.setState({
          focusedBranch: newBranch,
        })
      }
    }
  }

  public componentDidUpdate(prevProps: ICompareSidebarProps) {
    this.ensureCommitSearchDepth()

    const { showBranchList } = this.props.compareState

    if (showBranchList === prevProps.compareState.showBranchList) {
      return
    }

    if (this.textbox !== null) {
      if (showBranchList) {
        this.textbox.focus()
      } else if (!showBranchList) {
        this.textbox.blur()
      }
    }
  }

  private ensureCommitSearchDepth() {
    const query = this.state.commitFilterText.trim()
    const { formState, commitSHAs } = this.props.compareState
    if (
      query.length === 0 ||
      formState.kind !== HistoryTabMode.History ||
      this.getFilteredCommitSHAs(commitSHAs).length >= 50 ||
      this.exhaustedSearchQuery === query ||
      this.loadingSearchCommitsPromise !== null
    ) {
      return
    }

    this.loadingSearchCommitsPromise = this.props.dispatcher
      .loadNextCommitBatch(this.props.repository)
      .then(loaded => {
        if (loaded === 0) {
          this.exhaustedSearchQuery = query
        }
      })
      .catch(error => {
        if (this.state.commitFilterText.trim() === query) {
          this.exhaustedSearchQuery = query
        }
        defaultErrorHandler(error, this.props.dispatcher)
      })
      .then(() => {
        this.loadingSearchCommitsPromise = null
        if (!this.isUnmounted) {
          this.ensureCommitSearchDepth()
        }
      })
  }

  public focusHistory() {
    // Only one of the two history views is mounted at a time, so whichever ref
    // is live is the one holding the commits the user asked to focus.
    this.commitListRef.current?.focus()
    this.historyGraphViewRef.current?.focus()
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompare(this.props.repository)
  }

  public componentWillUnmount() {
    this.isUnmounted = true
    this.textbox = null
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )

    // by hiding the branch list here when the component is torn down
    // we ensure any ahead/behind computation work is discarded
    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
    })
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  public render() {
    const { branches, filterText, showBranchList } = this.props.compareState
    const placeholderText = getPlaceholderText(this.props.compareState)

    return (
      <div id="compare-view" role="tabpanel" aria-labelledby="history-tab">
        {this.renderPanelHeader()}
        <div className="compare-form">
          {/*
            This is the external textbox of the shared "branches" filter list
            rendered below (BranchList wires it into its FilterList), whose
            mode control and regex builder live inside that list.
          */}
          <FancyTextBox
            searchSurfaceId="branches"
            ariaLabel="Branch filter"
            symbol={octicons.gitBranch}
            displayClearButton={true}
            placeholder={placeholderText}
            onFocus={this.onTextBoxFocused}
            value={filterText}
            disabled={!branches.some(b => !b.isDesktopForkRemoteBranch)}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onBranchFilterTextChanged}
            onKeyDown={this.onBranchFilterKeyDown}
            onSearchCleared={this.handleEscape}
          />
        </div>

        {showBranchList ? this.renderFilterList() : this.renderCommits()}
      </div>
    )
  }

  /**
   * Sidebar title header (v2 prototype "History panel"): a 21px H1 with a
   * pill count chip carrying the number of loaded commits, rendered above the
   * search field.
   */
  private renderPanelHeader() {
    const commitCount = this.props.compareState.commitSHAs.length

    return (
      <div className="history-panel-header">
        <h1 className="history-panel-title">History</h1>
        {commitCount > 0 && (
          <span className="history-panel-count" aria-hidden="true">
            {formatNumber(commitCount)}
          </span>
        )}
      </div>
    )
  }

  private onBranchesListRef = (branchList: BranchList | null) => {
    this.branchList = branchList
  }

  private renderCommits() {
    const formState = this.props.compareState.formState
    return (
      <div className="compare-commit-list">
        {formState.kind === HistoryTabMode.History
          ? this.renderCommitList()
          : this.renderTabBar(formState)}
      </div>
    )
  }

  private filterListResultsChanged = (resultCount: number) => {
    this.resultCount = resultCount
  }

  private viewHistoryForBranch = () => {
    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.History,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
    })
  }

  /** Whether any of the filter-chip predicates is currently toggled on. */
  private hasActiveCommitFilterChips(): boolean {
    return (
      this.state.commitFilterUnpushed ||
      this.state.commitFilterTagged ||
      this.state.commitFilterMine
    )
  }

  /** Whether the commit hasn't been pushed (local commit or unpushed tag). */
  private isUnpushedCommit(commit: Commit): boolean {
    if (this.props.localCommitSHAs.includes(commit.sha)) {
      return true
    }

    const tagsToPush = new Set(this.props.tagsToPush ?? [])
    return commit.tags.some(tag => tagsToPush.has(tag))
  }

  /** Whether the commit was authored/committed by a signed-in account. */
  private isOwnCommit(commit: Commit): boolean {
    return this.props.accounts.some(
      account =>
        isAttributableEmailFor(account, commit.author.email) ||
        isAttributableEmailFor(account, commit.committer.email)
    )
  }

  /** Test a commit against the active filter-chip predicates (AND semantics). */
  private commitMatchesFilterChips(sha: string): boolean {
    const commit = this.props.commitLookup.get(sha)
    if (commit === undefined) {
      return false
    }

    if (this.state.commitFilterUnpushed && !this.isUnpushedCommit(commit)) {
      return false
    }

    if (this.state.commitFilterTagged && commit.tags.length === 0) {
      return false
    }

    if (this.state.commitFilterMine && !this.isOwnCommit(commit)) {
      return false
    }

    return true
  }

  /**
   * Filter the loaded commit SHAs client-side using the current History filter
   * text / mode and the filter-chip predicates. When comparing branches (or
   * with an empty filter) the list is returned unchanged.
   *
   * The result is cached against its inputs, and when a new commit batch is
   * appended for otherwise-unchanged inputs (search auto-deepening) only the
   * added SHAs are matched and merged into the cached result.
   */
  private getFilteredCommitSHAs(
    commitSHAs: ReadonlyArray<string>
  ): ReadonlyArray<string> {
    const query = this.state.commitFilterText.trim()

    if (query.length === 0 && !this.hasActiveCommitFilterChips()) {
      this.commitFilterCache = null
      return commitSHAs
    }

    const cache = this.commitFilterCache
    const reusable =
      cache !== null &&
      cache.query === query &&
      cache.mode === this.state.commitFilterMode &&
      cache.caseSensitive === this.state.commitFilterCaseSensitive &&
      cache.filterUnpushed === this.state.commitFilterUnpushed &&
      cache.filterTagged === this.state.commitFilterTagged &&
      cache.filterMine === this.state.commitFilterMine &&
      cache.commitLookup === this.props.commitLookup &&
      cache.localCommitSHAs === this.props.localCommitSHAs &&
      cache.tagsToPush === this.props.tagsToPush &&
      cache.accounts === this.props.accounts &&
      cache.historyScope === this.props.compareState.historyScope
        ? cache
        : null

    if (reusable !== null && reusable.commitSHAs === commitSHAs) {
      return reusable.filteredSHAs
    }

    // Loading only ever appends to the SHA list (a scope or branch switch
    // replaces the tip commit, and with it the first element), so matching
    // endpoints prove the cached list is a prefix of the new one.
    const previous =
      reusable !== null &&
      !reusable.regexError &&
      reusable.commitSHAs.length > 0 &&
      commitSHAs.length > reusable.commitSHAs.length &&
      commitSHAs[0] === reusable.commitSHAs[0] &&
      commitSHAs[reusable.commitSHAs.length - 1] ===
        reusable.commitSHAs[reusable.commitSHAs.length - 1]
        ? reusable
        : null

    const next = this.computeCommitFilterCache(commitSHAs, query, previous)
    this.commitFilterCache = next
    return next.filteredSHAs
  }

  /**
   * Run the chip and query filters over `commitSHAs`, reusing `previous` (a
   * proven prefix of `commitSHAs` filtered with identical inputs) so only the
   * newly appended SHAs are matched. The merged output is byte-identical to a
   * full pass: substring/regex matching preserves item order so appended
   * results concatenate, and fuzzy results merge by descending score exactly
   * as the matcher's stable sort would have ordered the combined list.
   */
  private computeCommitFilterCache(
    commitSHAs: ReadonlyArray<string>,
    query: string,
    previous: ICommitFilterCache | null
  ): ICommitFilterCache {
    const mode = this.state.commitFilterMode
    const caseSensitive = this.state.commitFilterCaseSensitive

    const addedSHAs =
      previous === null
        ? commitSHAs
        : commitSHAs.slice(previous.commitSHAs.length)
    const chipFilteredSHAs = this.hasActiveCommitFilterChips()
      ? addedSHAs.filter(sha => this.commitMatchesFilterChips(sha))
      : addedSHAs

    // Two keys so fuzzy mode (which only scores the first two) still matches on
    // author and SHA: the summary is the "title", and author + full/short SHA
    // are folded into the "subtitle". Substring / regex modes test every key.
    const getKey = (sha: string): ReadonlyArray<string> => {
      const commit = this.props.commitLookup.get(sha)
      if (commit === undefined) {
        return [sha]
      }
      return getCommitSearchKeys(commit)
    }

    const asCache = (
      results: ReadonlyArray<IMatch<string>>,
      filteredSHAs: ReadonlyArray<string>,
      regexInputLength: number,
      regexError: boolean
    ): ICommitFilterCache => ({
      commitSHAs,
      commitLookup: this.props.commitLookup,
      query,
      mode,
      caseSensitive,
      filterUnpushed: this.state.commitFilterUnpushed,
      filterTagged: this.state.commitFilterTagged,
      filterMine: this.state.commitFilterMine,
      localCommitSHAs: this.props.localCommitSHAs,
      tagsToPush: this.props.tagsToPush,
      accounts: this.props.accounts,
      historyScope: this.props.compareState.historyScope,
      results,
      filteredSHAs,
      regexInputLength,
      regexError,
    })

    if (query.length === 0) {
      // Chip filtering preserves item order, so appended batches concatenate.
      const filteredSHAs =
        previous === null
          ? chipFilteredSHAs
          : [...previous.filteredSHAs, ...chipFilteredSHAs]
      return asCache([], filteredSHAs, 0, false)
    }

    let regexInputLength = previous?.regexInputLength ?? 0
    if (mode === FilterMode.Regex) {
      for (const sha of chipFilteredSHAs) {
        for (const key of getKey(sha)) {
          regexInputLength += key.length
        }
      }
      if (previous !== null && regexInputLength > MaxRegexTotalInputLength) {
        // The regex engine fails closed once its cumulative input cap is
        // exceeded, which an appended batch alone cannot see; re-run the whole
        // list so the cap keeps its exact fail-closed behavior.
        return this.computeCommitFilterCache(commitSHAs, query, null)
      }
    }

    const { results, regexError } = matchWithMode(
      query,
      chipFilteredSHAs,
      getKey,
      { mode, caseSensitive }
    )

    const merged =
      previous === null
        ? results
        : mode === FilterMode.Fuzzy
        ? mergeMatchesByDescendingScore(previous.results, results)
        : [...previous.results, ...results]

    return asCache(
      merged,
      merged.map(r => r.item),
      regexInputLength,
      regexError !== null
    )
  }

  private getCommitFilterSampleItems = (): ReadonlyArray<string> => {
    const items = new Array<string>()
    for (const sha of this.props.compareState.commitSHAs) {
      const commit = this.props.commitLookup.get(sha)
      if (commit !== undefined) {
        items.push(...getCommitSearchKeys(commit))
      }
      if (items.length >= 50) {
        break
      }
    }
    return items
  }

  private onCommitFilterTextChanged = (commitFilterText: string) => {
    this.exhaustedSearchQuery = null
    this.setState({ commitFilterText }, this.ensureCommitSearchDepth)
  }

  private onCommitFilterCleared = () => {
    this.setState({ commitFilterText: '' })
  }

  private onCommitFilterModeChanged = (commitFilterMode: FilterMode) => {
    persistFilterMode(CommitFilterListId, commitFilterMode)
    this.setState({ commitFilterMode })
  }

  private onCommitFilterCaseSensitiveChanged = (
    commitFilterCaseSensitive: boolean
  ) => {
    this.setState({ commitFilterCaseSensitive })
  }

  private onCommitFilterRegexPatternApply = (pattern: string) => {
    this.setState({ commitFilterText: pattern })
  }

  private renderCommitFilter() {
    const activeChipCount = [
      this.state.commitFilterUnpushed,
      this.state.commitFilterTagged,
      this.state.commitFilterMine,
    ].filter(on => on).length

    const filterOptionsLabel = `Filter options${
      activeChipCount > 0 ? ` (${activeChipCount} applied)` : ''
    }`

    return (
      <CollapsibleSection
        elementId="history-filters"
        repositoryKey={collapsibleRepositoryKey(this.props.repository)}
        label="Filters"
        ariaLabel="Commit filters"
        // The scope and any live search stay legible while it is closed: a
        // folded filter row that is quietly narrowing the history is how a
        // reader concludes commits have gone missing.
        summary={
          this.state.commitFilterText.length > 0
            ? `Searching “${this.state.commitFilterText}”`
            : activeChipCount > 0
            ? `${activeChipCount} applied`
            : 'None applied'
        }
      >
        <div className="history-commit-filter">
          {this.renderHistoryScopeControl()}
          <div className="history-commit-filter-row">
            <TextBox
              searchSurfaceId="history-commits"
              className="history-commit-filter-field"
              type="search"
              displayClearButton={true}
              prefixedIcon={octicons.search}
              placeholder="Search commits"
              ariaLabel="Search commits by title, message, tag, or hash"
              value={this.state.commitFilterText}
              onValueChanged={this.onCommitFilterTextChanged}
              onSearchCleared={this.onCommitFilterCleared}
            />
            <FilterModeControl
              searchSurfaceId="history-commits"
              mode={this.state.commitFilterMode}
              caseSensitive={this.state.commitFilterCaseSensitive}
              onModeChange={this.onCommitFilterModeChanged}
              onCaseSensitiveChange={this.onCommitFilterCaseSensitiveChanged}
              regexBuilderTarget="Commits"
              getSampleItems={this.getCommitFilterSampleItems}
              filterText={this.state.commitFilterText}
              onRegexPatternApply={this.onCommitFilterRegexPatternApply}
              showRegexBuilder={false}
            />
            <Button
              className={classNames('history-filter-chips-toggle', {
                active:
                  this.state.showCommitFilterChips ||
                  this.hasActiveCommitFilterChips(),
              })}
              ariaLabel={filterOptionsLabel}
              tooltip={filterOptionsLabel}
              ariaExpanded={this.state.showCommitFilterChips}
              onClick={this.onToggleCommitFilterChips}
            >
              <Octicon symbol={octicons.filter} />
            </Button>
            <Button
              className="history-commit-graph-toggle"
              ariaLabel="Show commit graph"
              tooltip="Show commit graph"
              ariaPressed={this.state.showCommitGraph}
              onClick={this.onCommitGraphToggle}
            >
              <Octicon symbol={octicons.gitMerge} />
            </Button>
            <Button
              className="history-graph-view-toggle"
              ariaLabel="Graph view"
              tooltip="Graph view"
              ariaPressed={this.state.showGraphView}
              onClick={this.onGraphViewToggle}
            >
              <Octicon symbol={octicons.table} />
            </Button>
          </div>
          {this.renderCommitFilterChips()}
          {this.renderCommitRegexBuilder()}
        </div>
      </CollapsibleSection>
    )
  }

  private renderHistoryScopeControl() {
    const scope = this.props.compareState.historyScope

    return (
      <div
        className="history-scope-control"
        role="group"
        aria-label={translateForAccessibleName(
          'history.scope',
          {},
          this.state.languageMode
        )}
      >
        <Button
          ariaPressed={scope === HistoryScope.CurrentBranch}
          onClick={this.onShowCurrentBranchHistory}
        >
          <LocalizedText
            translationKey="history.scope.currentBranch"
            languageMode={this.state.languageMode}
          />
        </Button>
        <Button
          ariaPressed={scope === HistoryScope.AllRefs}
          onClick={this.onShowAllRefsHistory}
        >
          <LocalizedText
            translationKey="history.scope.allRefs"
            languageMode={this.state.languageMode}
          />
        </Button>
      </div>
    )
  }

  private onShowCurrentBranchHistory = () => {
    this.setHistoryScope(HistoryScope.CurrentBranch)
  }

  private onShowAllRefsHistory = () => {
    this.setHistoryScope(HistoryScope.AllRefs)
  }

  private setHistoryScope(scope: HistoryScope) {
    this.exhaustedSearchQuery = null
    this.props.dispatcher
      .setHistoryScope(this.props.repository, scope)
      .catch(error => defaultErrorHandler(error, this.props.dispatcher))
  }

  /**
   * The inline filter chip row (v2 prototype "History panel"): Unpushed /
   * Tagged / Mine predicate chips plus a trailing Regex builder launcher chip.
   */
  private renderCommitFilterChips() {
    if (!this.state.showCommitFilterChips) {
      return null
    }

    const chips: ReadonlyArray<{
      readonly id: string
      readonly label: string
      readonly on: boolean
    }> = [
      {
        id: 'unpushed',
        label: 'Unpushed',
        on: this.state.commitFilterUnpushed,
      },
      { id: 'tagged', label: 'Tagged', on: this.state.commitFilterTagged },
      { id: 'mine', label: 'Mine', on: this.state.commitFilterMine },
    ]

    return (
      <div
        className="history-filter-chips"
        role="group"
        aria-label="History filters"
      >
        {chips.map(chip => (
          <button
            key={chip.id}
            className={classNames('history-filter-chip', { active: chip.on })}
            aria-pressed={chip.on}
            data-chip-id={chip.id}
            onClick={this.onCommitFilterChipToggle}
          >
            {chip.on && (
              <Octicon className="chip-check" symbol={octicons.check} />
            )}
            <span className="chip-label">{chip.label}</span>
          </button>
        ))}
        <button
          className="history-regex-builder-chip"
          aria-label="Open regex builder"
          onClick={this.onOpenCommitRegexBuilder}
        >
          <span className="chip-glyph">.*</span>
          <span className="chip-label">Regex builder</span>
        </button>
      </div>
    )
  }

  private renderCommitRegexBuilder() {
    if (!this.state.isRegexBuilderOpen) {
      return null
    }

    return (
      <RegexBuilder
        searchSurfaceId="history-commits"
        targetLabel="Commits"
        initialPattern={this.state.commitFilterText}
        caseSensitive={this.state.commitFilterCaseSensitive}
        sampleItems={this.getCommitFilterSampleItems()}
        onApply={this.onCommitRegexBuilderApply}
        onDismissed={this.onCloseCommitRegexBuilder}
      />
    )
  }

  private onToggleCommitFilterChips = () => {
    this.setState(state => ({
      showCommitFilterChips: !state.showCommitFilterChips,
    }))
  }

  private onCommitFilterChipToggle = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const chipId = event.currentTarget.dataset.chipId

    if (chipId === 'unpushed') {
      this.setState(state => ({
        commitFilterUnpushed: !state.commitFilterUnpushed,
      }))
    } else if (chipId === 'tagged') {
      this.setState(state => ({
        commitFilterTagged: !state.commitFilterTagged,
      }))
    } else if (chipId === 'mine') {
      this.setState(state => ({ commitFilterMine: !state.commitFilterMine }))
    }
  }

  private onOpenCommitRegexBuilder = () => {
    this.setState({ isRegexBuilderOpen: true })
  }

  private onCloseCommitRegexBuilder = () => {
    this.setState({ isRegexBuilderOpen: false })
  }

  private onCommitRegexBuilderApply = (
    pattern: string,
    caseSensitive: boolean
  ) => {
    persistFilterMode(CommitFilterListId, FilterMode.Regex)
    this.exhaustedSearchQuery = null
    this.setState(
      {
        commitFilterMode: FilterMode.Regex,
        commitFilterText: pattern,
        commitFilterCaseSensitive: caseSensitive,
        isRegexBuilderOpen: false,
      },
      this.ensureCommitSearchDepth
    )
  }

  private onCommitGraphToggle = () => {
    this.setState(state => {
      const showCommitGraph = !state.showCommitGraph
      setBoolean(ShowCommitGraphKey, showCommitGraph)
      return { showCommitGraph }
    })
  }

  private onGraphViewToggle = () => {
    this.setState(state => {
      const showGraphView = !state.showGraphView
      setBoolean(ShowGraphViewKey, showGraphView)
      return { showGraphView }
    })
  }

  private renderCommitList() {
    const { formState, commitSHAs } = this.props.compareState

    const isHistory = formState.kind === HistoryTabMode.History
    const filteredCommitSHAs = isHistory
      ? this.getFilteredCommitSHAs(commitSHAs)
      : commitSHAs
    const isCommitFilterActive =
      isHistory &&
      (this.state.commitFilterText.trim().length > 0 ||
        this.hasActiveCommitFilterChips())

    let emptyListMessage: string | JSX.Element
    if (isCommitFilterActive && filteredCommitSHAs.length === 0) {
      emptyListMessage = 'No matching commits'
    } else if (formState.kind === HistoryTabMode.History) {
      emptyListMessage = 'No history'
    } else {
      const currentlyComparedBranchName = formState.comparisonBranch.name

      emptyListMessage =
        formState.comparisonMode === ComparisonMode.Ahead ? (
          <p>
            The compared branch (<Ref>{currentlyComparedBranchName}</Ref>) is up
            to date with your branch
          </p>
        ) : (
          <p>
            Your branch is up to date with the compared branch (
            <Ref>{currentlyComparedBranchName}</Ref>)
          </p>
        )
    }

    // While a text filter is active the displayed commits are a non-contiguous
    // subset of history, so row indices no longer map to the real commit graph.
    // Disable the history-mutating affordances (reorder / squash / reset / undo
    // / amend) until the filter is cleared to avoid operating on the wrong
    // commit. Read-only actions (checkout, view, copy SHA, cherry-pick) stay
    // available.
    const allowHistoryOps =
      isHistory &&
      this.props.compareState.historyScope === HistoryScope.CurrentBranch &&
      !isCommitFilterActive

    if (isHistory && this.state.showGraphView) {
      return (
        <>
          {this.renderCommitFilter()}
          <HistoryGraphView
            ref={this.historyGraphViewRef}
            gitHubRepository={this.props.repository.gitHubRepository}
            commitLookup={this.props.commitLookup}
            commitSHAs={filteredCommitSHAs}
            selectedSHAs={this.props.selectedCommitShas}
            localCommitSHAs={this.props.localCommitSHAs}
            canResetToCommits={allowHistoryOps}
            canUndoCommits={allowHistoryOps}
            canAmendCommits={allowHistoryOps}
            branches={this.props.compareState.branches}
            currentBranch={this.props.currentBranch}
            emoji={this.props.emoji}
            emptyListMessage={emptyListMessage}
            onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
            onUndoCommit={this.onUndoCommit}
            onResetToCommit={this.onResetToCommit}
            onRevertCommit={
              ableToRevertCommit(this.props.compareState.formState)
                ? this.props.onRevertCommit
                : undefined
            }
            onAmendCommit={this.props.onAmendCommit}
            onCommitsSelected={this.onCommitsSelected}
            onScroll={this.onScroll}
            onCreateBranch={this.onCreateBranch}
            onCreateWorktreeFromCommit={this.onCreateWorktreeFromCommit}
            onCheckoutCommit={this.onCheckoutCommit}
            onCreateTag={this.onCreateTag}
            onDeleteTag={this.onDeleteTag}
            onCherryPick={this.onCherryPick}
            onKeyboardReorder={this.onKeyboardReorder}
            onSquash={this.onSquash}
            onCompareListScrolled={this.props.onCompareListScrolled}
            compareListScrollTop={this.props.compareListScrollTop}
            tagsToPush={this.props.tagsToPush ?? []}
            disableReordering={!allowHistoryOps}
            disableSquashing={!allowHistoryOps}
            isMultiCommitOperationInProgress={
              this.props.isMultiCommitOperationInProgress
            }
          />
        </>
      )
    }

    return (
      <>
        {isHistory ? this.renderCommitFilter() : null}
        <CommitList
          ref={this.commitListRef}
          gitHubRepository={this.props.repository.gitHubRepository}
          isLocalRepository={this.props.isLocalRepository}
          commitLookup={this.props.commitLookup}
          commitSHAs={filteredCommitSHAs}
          selectedSHAs={this.props.selectedCommitShas}
          shasToHighlight={this.props.shasToHighlight}
          localCommitSHAs={this.props.localCommitSHAs}
          canResetToCommits={allowHistoryOps}
          canUndoCommits={allowHistoryOps}
          canAmendCommits={allowHistoryOps}
          emoji={this.props.emoji}
          reorderingEnabled={allowHistoryOps}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          onUndoCommit={this.onUndoCommit}
          onResetToCommit={this.onResetToCommit}
          onRevertCommit={
            ableToRevertCommit(this.props.compareState.formState)
              ? this.props.onRevertCommit
              : undefined
          }
          onAmendCommit={this.props.onAmendCommit}
          onCommitsSelected={this.onCommitsSelected}
          onScroll={this.onScroll}
          onCreateBranch={this.onCreateBranch}
          onCreateWorktreeFromCommit={this.onCreateWorktreeFromCommit}
          onCheckoutCommit={this.onCheckoutCommit}
          onCreateTag={this.onCreateTag}
          onDeleteTag={this.onDeleteTag}
          onCherryPick={this.onCherryPick}
          onDropCommitInsertion={this.onDropCommitInsertion}
          onKeyboardReorder={this.onKeyboardReorder}
          onCancelKeyboardReorder={this.onCancelKeyboardReorder}
          onSquash={this.onSquash}
          emptyListMessage={emptyListMessage}
          onCompareListScrolled={this.props.onCompareListScrolled}
          compareListScrollTop={this.props.compareListScrollTop}
          tagsToPush={this.props.tagsToPush ?? []}
          onRenderCommitDragElement={this.onRenderCommitDragElement}
          onRemoveCommitDragElement={this.onRemoveCommitDragElement}
          disableReordering={!allowHistoryOps}
          disableSquashing={!allowHistoryOps}
          isMultiCommitOperationInProgress={
            this.props.isMultiCommitOperationInProgress
          }
          keyboardReorderData={this.state.keyboardReorderData}
          accounts={this.props.accounts}
          preferAbsoluteDates={this.props.preferAbsoluteDates}
          showCommitGraph={
            isHistory && this.state.showCommitGraph && !isCommitFilterActive
          }
        />
      </>
    )
  }

  private onCancelKeyboardReorder = () => {
    this.setState({ keyboardReorderData: undefined })
  }

  private onDropCommitInsertion = async (
    baseCommit: Commit | null,
    commitsToInsert: ReadonlyArray<Commit>,
    lastRetainedCommitRef: string | null
  ) => {
    this.setState({ keyboardReorderData: undefined })

    if (
      await doMergeCommitsExistAfterCommit(
        this.props.repository,
        lastRetainedCommitRef
      )
    ) {
      defaultErrorHandler(
        new Error(
          `Unable to reorder. Reordering replays all commits up to the last one required for the reorder. A merge commit cannot exist among those commits.`
        ),
        this.props.dispatcher
      )
      return
    }

    return this.props.dispatcher.reorderCommits(
      this.props.repository,
      commitsToInsert,
      baseCommit,
      lastRetainedCommitRef
    )
  }

  private onRenderCommitDragElement = (
    commit: Commit,
    selectedCommits: ReadonlyArray<Commit>
  ) => {
    this.props.dispatcher.setDragElement({
      type: DragType.Commit,
      commit,
      selectedCommits,
      gitHubRepository: this.props.repository.gitHubRepository,
    })
  }

  private onRemoveCommitDragElement = () => {
    this.props.dispatcher.clearDragElement()
  }

  private renderActiveTab(view: ICompareBranch) {
    return (
      <div className="compare-commit-list">
        {this.renderCommitList()}
        {view.comparisonMode === ComparisonMode.Behind
          ? this.renderMergeCallToAction(view)
          : null}
      </div>
    )
  }

  private renderFilterList() {
    const { defaultBranch, branches, recentBranches, filterText } =
      this.props.compareState

    return (
      <BranchList
        repository={this.props.repository}
        ref={this.onBranchesListRef}
        defaultBranch={defaultBranch}
        currentBranch={this.props.currentBranch}
        allBranches={branches}
        recentBranches={recentBranches}
        filterText={filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.focusedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onItemClick={this.onBranchItemClicked}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        renderBranch={this.renderCompareBranchListItem}
        getBranchAriaLabel={this.getBranchAriaLabel}
        onFilterListResultsChanged={this.filterListResultsChanged}
      />
    )
  }

  private renderMergeCallToAction(formState: ICompareBranch) {
    if (this.props.currentBranch == null) {
      return null
    }

    return (
      <MergeCallToActionWithConflicts
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        mergeStatus={this.props.compareState.mergeStatus}
        currentBranch={this.props.currentBranch}
        comparisonBranch={formState.comparisonBranch}
        commitsBehind={formState.aheadBehind.behind}
      />
    )
  }

  private onTabClicked = (index: number) => {
    const formState = this.props.compareState.formState

    if (formState.kind === HistoryTabMode.History) {
      return
    }

    const comparisonMode =
      index === 0 ? ComparisonMode.Behind : ComparisonMode.Ahead
    const branch = formState.comparisonBranch

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.Compare,
      branch,
      comparisonMode,
    })
  }

  private renderTabBar(formState: ICompareBranch) {
    const selectedTab =
      formState.comparisonMode === ComparisonMode.Behind ? 0 : 1

    return (
      <div className="compare-content">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span>{`Behind (${formatNumber(
            formState.aheadBehind.behind
          )})`}</span>
          <span>{`Ahead (${formatNumber(formState.aheadBehind.ahead)})`}</span>
        </TabBar>
        {this.renderActiveTab(formState)}
      </div>
    )
  }

  private renderCompareBranchListItem = (
    item: IBranchListItem,
    matches: IMatches
  ) => {
    return (
      <CompareBranchListItem
        branch={item.branch}
        currentBranch={this.props.currentBranch}
        matches={matches}
        repository={this.props.repository}
        aheadBehindStore={this.props.aheadBehindStore}
      />
    )
  }

  private getBranchAriaLabel = (item: IBranchListItem): string => {
    return item.branch.name
  }

  private onBranchFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const key = event.key

    if (key === 'Enter') {
      if (this.resultCount === 0) {
        event.preventDefault()
        return
      }
      const branch = this.state.focusedBranch

      if (branch === null) {
        this.viewHistoryForBranch()
      } else {
        this.props.dispatcher.executeCompare(this.props.repository, {
          kind: HistoryTabMode.Compare,
          comparisonMode: ComparisonMode.Behind,
          branch,
        })

        this.props.dispatcher.updateCompareForm(this.props.repository, {
          filterText: branch.name,
        })
      }

      if (this.textbox) {
        this.textbox.blur()
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    } else if (key === 'ArrowDown') {
      if (this.branchList !== null) {
        this.branchList.selectNextItem(true, 'down')
      }
    } else if (key === 'ArrowUp') {
      if (this.branchList !== null) {
        this.branchList.selectNextItem(true, 'up')
      }
    }
  }

  private handleEscape = () => {
    this.clearFilterState()
    if (this.textbox) {
      this.textbox.blur()
    }
  }

  private onCommitsSelected = (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => {
    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      commits.map(c => c.sha),
      isContiguous
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const compareState = this.props.compareState
    const formState = compareState.formState

    if (formState.kind === HistoryTabMode.Compare) {
      // as the app is currently comparing the current branch to some other
      // branch, everything needed should be loaded
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      if (this.loadingMoreCommitsPromise != null) {
        // as this callback fires for any scroll event we need to guard
        // against re-entrant calls to loadCommitBatch
        return
      }

      this.loadingMoreCommitsPromise = this.props.dispatcher
        .loadNextCommitBatch(this.props.repository)
        .then(() => {
          // deferring unsetting this flag to some time _after_ the commits
          // have been appended to prevent eagerly adding more commits due
          // to scroll events (which fire indiscriminately)
          window.setTimeout(() => {
            this.loadingMoreCommitsPromise = null
          }, 500)
        })
    }
  }

  private onBranchFilterTextChanged = (filterText: string) => {
    if (filterText.length === 0) {
      this.setState({ focusedBranch: null })
    }

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText,
    })
  }

  private clearFilterState = () => {
    this.setState({
      focusedBranch: null,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText: '',
    })

    this.viewHistoryForBranch()
  }

  private onBranchItemClicked = (branch: Branch) => {
    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.Compare,
      comparisonMode: ComparisonMode.Behind,
      branch,
    })

    this.setState({
      focusedBranch: null,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText: branch.name,
      showBranchList: false,
    })
  }

  private onSelectionChanged = (
    branch: Branch | null,
    source: SelectionSource
  ) => {
    this.setState({
      focusedBranch: branch,
    })
  }

  private onTextBoxFocused = () => {
    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: true,
    })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onCreateTag = (targetCommitSha: string) => {
    this.props.dispatcher.showCreateTagDialog(
      this.props.repository,
      targetCommitSha,
      this.props.localTags
    )
  }

  private onUndoCommit = (commit: Commit) => {
    this.props.dispatcher.undoCommit(this.props.repository, commit)
  }

  private onResetToCommit = (commit: Commit) => {
    this.props.dispatcher.resetToCommit(this.props.repository, commit)
  }

  private onCreateBranch = (commit: CommitOneLine) => {
    const { repository, dispatcher } = this.props

    dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
      targetCommit: commit,
    })
  }

  private onCreateWorktreeFromCommit = (commit: CommitOneLine) => {
    const { repository, dispatcher } = this.props

    dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository,
      commitish: commit.sha,
      initialWorktreeName: `commit-${commit.sha.slice(0, 8)}`,
    })
  }

  private onCheckoutCommit = (commit: CommitOneLine) => {
    const { repository, dispatcher, askForConfirmationOnCheckoutCommit } =
      this.props
    if (!askForConfirmationOnCheckoutCommit) {
      dispatcher.checkoutCommit(repository, commit)
    } else {
      dispatcher.showPopup({
        type: PopupType.ConfirmCheckoutCommit,
        commit: commit,
        repository,
      })
    }
  }

  private onDeleteTag = (tagName: string, unpushed: boolean) => {
    const { dispatcher, repository } = this.props
    if (unpushed) {
      dispatcher.showDeleteTagDialog(repository, tagName)
    } else {
      dispatcher.showPopup({
        type: PopupType.ConfirmDeletePushedTag,
        repository,
        tagName,
      })
    }
  }

  private onCherryPick = (commits: ReadonlyArray<CommitOneLine>) => {
    this.props.onCherryPick(this.props.repository, commits)
  }

  private onKeyboardReorder = (toReorder: ReadonlyArray<Commit>) => {
    const { commitSHAs } = this.props.compareState
    const keyboardReorderData: KeyboardInsertionData = {
      type: DragType.Commit,
      commits: toReorder,
      itemIndices: toReorder.map(c => commitSHAs.indexOf(c.sha)),
    }

    // Keyboard reordering is implemented by CommitList's insertion surface.
    // If the shared row menu starts it from the graph, move to that equivalent
    // view before installing the operation. List initializes its insertion
    // cursor on the undefined-to-defined prop transition, which must happen
    // after CommitList mounts.
    if (this.state.showGraphView) {
      setBoolean(ShowGraphViewKey, false)
      this.setState({ showGraphView: false }, () => {
        this.setState({ keyboardReorderData })
      })
      return
    }

    this.setState({ keyboardReorderData })
  }

  private onSquash = async (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null,
    isInvokedByContextMenu: boolean
  ) => {
    const toSquashSansSquashOnto = toSquash.filter(
      c => c.sha !== squashOnto.sha
    )

    const allCommitsInSquash = [...toSquashSansSquashOnto, squashOnto]
    const coAuthors = getUniqueCoauthorsAsAuthors(allCommitsInSquash)

    const squashedDescription = getSquashedCommitDescription(
      toSquashSansSquashOnto,
      squashOnto
    )

    if (
      await doMergeCommitsExistAfterCommit(
        this.props.repository,
        lastRetainedCommitRef
      )
    ) {
      defaultErrorHandler(
        new Error(
          `Unable to squash. Squashing replays all commits up to the last one required for the squash. A merge commit cannot exist among those commits.`
        ),
        this.props.dispatcher
      )
      return
    }

    this.props.dispatcher.recordSquashInvoked(isInvokedByContextMenu)

    this.props.dispatcher.showPopup({
      type: PopupType.CommitMessage,
      repository: this.props.repository,
      coAuthors,
      showCoAuthoredBy: coAuthors.length > 0,
      commitMessage: {
        summary: squashOnto.summary,
        description: squashedDescription,
        timestamp: Date.now(),
      },
      dialogTitle: `Squash ${allCommitsInSquash.length} Commits`,
      dialogButtonText: `Squash ${allCommitsInSquash.length} Commits`,
      prepopulateCommitSummary: true,
      onSubmitCommitMessage: async (context: ICommitContext) => {
        this.props.dispatcher.closePopup(PopupType.CommitMessage)

        this.props.dispatcher.squash(
          this.props.repository,
          toSquashSansSquashOnto,
          squashOnto,
          lastRetainedCommitRef,
          context
        )
        return true
      },
    })
  }
}

function getPlaceholderText(state: ICompareState) {
  const { branches, formState } = state

  if (!branches.some(b => !b.isDesktopForkRemoteBranch)) {
    return __DARWIN__ ? 'No Branches to Compare' : 'No branches to compare'
  } else if (formState.kind === HistoryTabMode.History) {
    return __DARWIN__
      ? 'Select Branch to Compare…'
      : 'Select branch to compare…'
  } else {
    return undefined
  }
}

// determine if the `onRevertCommit` function should be exposed to the CommitList/CommitListItem.
// `onRevertCommit` is only exposed if the form state of the branch compare form is either
// 1: History mode, 2: Comparison Mode with the 'Ahead' list shown.
// When not exposed, the context menu item 'Revert this commit' is disabled.
function ableToRevertCommit(
  formState: IDisplayHistory | ICompareBranch
): boolean {
  return (
    formState.kind === HistoryTabMode.History ||
    formState.comparisonMode === ComparisonMode.Ahead
  )
}
