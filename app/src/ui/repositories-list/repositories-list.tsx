import * as React from 'react'

import {
  commitGrammar,
  IRepositoryLogoChange,
  RepositoryListItem,
} from './repository-list-item'
import {
  groupRepositories,
  IRepositoryListItem,
  Repositoryish,
  RepositoryListGroup,
  getGroupKey,
} from './group-repositories'
import {
  getRepositorySyncSummary,
  getRepositorySyncSummaryText,
  IRepositorySyncFunnyLevels,
  readRepositorySyncFunnyLevels,
} from './repository-sync-summary'
import { IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import {
  ILocalRepositoryState,
  Repository,
  SubmoduleRepository,
} from '../../models/repository'
import { DensityPreference } from '../../models/appearance-customization'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { MaterialSymbol } from '../lib/material-symbol'
import { showContextualMenu } from '../../lib/menu-item'
import { IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import { TooltippedContent } from '../lib/tooltipped-content'
import memoizeOne from 'memoize-one'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { generateRepositoryListContextMenu } from '../repositories-list/repository-list-item-context-menu'
import { enableWorktreeSupport } from '../../lib/feature-flag'
import { FoldoutType } from '../../lib/app-state'
import { SectionFilterList } from '../lib/section-filter-list'
import { assertNever } from '../../lib/fatal-error'
import { IAheadBehind } from '../../models/branch'
import { getEditorOverrideLabel } from '../../models/editor-override'
import {
  ShowBranchNameInRepoListSetting,
  shouldShowBranchName,
} from '../../models/show-branch-name-in-repo-list'
import {
  addPinnedRepository,
  getPinnedRepositories,
  removePinnedRepository,
} from '../../lib/stores/repository-pinning'
import { Account } from '../../models/account'
import {
  accountFilterFor,
  filterRepositoryGroups,
  isAccountFilterAvailable,
  RepositoryAccountFilter,
  RepositoryServiceFilter,
  RepositoryStatusFilter,
} from './repository-list-filters'
import {
  getHiddenRepositories,
  hideRepository,
  unhideRepository,
} from '../../lib/stores/repository-list-visibility'
import {
  countAutoExpandedRepositoryGroups,
  getCollapsedRepositoryGroups,
  isRepositoryFilterActive,
  isRepositoryGroupCollapsed,
  setRepositoryGroupCollapsed,
} from '../../lib/stores/repository-group-collapse'
import {
  getAutoExpandedGroupsSegments,
  getRepositoryGroupAccessibleName,
  repositoryGroupRowsId,
} from './repository-group-header'
import {
  customRepositoryGroupKeyName,
  IRepositoryGroupNoticeDetail,
  planRepositoryGroupRemoval,
  RepositoryGroupNoticeEvent,
} from './repository-group-actions'
import {
  getProfileRepositoryLogoSignature,
  IRepositoryLogoLoader,
  repositoryLogoLoader,
} from '../repository-logo/repository-logo-loader'
import {
  IRepositoryLogoChangedDetail,
  RepositoryLogoChangedEvent,
} from '../../lib/appearance-customization'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'
import {
  RepositoryBulkActions,
  RepositoryBulkOperation,
} from './repository-bulk-actions'
import {
  clearBulkSelection,
  dedupeRepositoryIds,
  emptyRepositoryBulkSelection,
  enterBulkSelection,
  exitBulkSelection,
  IRepositoryBulkSelection,
  isAllVisibleSelected,
  isSomeVisibleSelected,
  pruneBulkSelection,
  selectedRepositoryIds,
  setVisibleSelection,
  toggleRepositorySelection,
} from './repository-bulk-selection'
import {
  IBulkRepositoryItem,
  IBulkRepositoryProgress,
  initialBulkRepositoryProgress,
  runSequentialRepositoryBulk,
  sanitizeBulkFailureReason,
} from '../../lib/automation/bulk-repository-runner'
import { RepositorySyncOperation } from '../../lib/automation/pull-all'

interface IRepositoriesListProps {
  /** Signed-in identities used by the account and provider scope controls. */
  readonly accounts?: ReadonlyArray<Account>
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly recentRepositories: ReadonlyArray<number>
  readonly showRecentRepositories: boolean
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting

  /**
   * The app-wide repository-list density; compact uses the shorter side-sheet
   * row geometry. Optional so focused tests default to comfortable.
   */
  readonly repositoryListDensity?: DensityPreference

  /** A cache of the latest repository state values, keyed by the repository id */
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >

  /** Called when a repository has been selected. */
  readonly onSelectionChanged: (repository: Repositoryish) => void

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish) => void

  /** Called when the repository should be opened on GitHub in the default web browser. */
  readonly onViewOnGitHub: (repository: Repositoryish) => void

  /** Called when an eligible GitHub repository should be forked. */
  readonly onForkRepository?: (repository: Repositoryish) => void

  /** Called when the repository should be opened in another app window. */
  readonly onOpenInNewWindow: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** The label for the user's preferred shell. */
  readonly shellLabel?: string

  /** The callback to fire when the filter text has changed */
  readonly onFilterTextChanged: (text: string) => void

  /** The text entered by the user to filter their repository list */
  readonly filterText: string

  readonly dispatcher: Dispatcher

  /** Test seam for deterministic repository-logo loading. */
  readonly repositoryLogoLoader?: IRepositoryLogoLoader
}

interface IRepositoriesListState {
  readonly newRepositoryMenuExpanded: boolean
  readonly selectedItem: IRepositoryListItem | null
  readonly pinnedRepositoryIds: ReadonlyArray<number>
  readonly accountFilter: RepositoryAccountFilter
  readonly serviceFilter: RepositoryServiceFilter
  readonly statusFilters: ReadonlyArray<RepositoryStatusFilter>
  readonly hiddenRepositoryIds: ReadonlyArray<number>
  readonly showHiddenRepositories: boolean
  readonly repositoryLogoChange: IRepositoryLogoChange
  readonly languageMode: LanguageMode
  /** Read once (not per row) — the sync line's wording honours these. */
  readonly syncFunnyLevels: IRepositorySyncFunnyLevels
  readonly bulkSelection: IRepositoryBulkSelection
  /** Repository ids the active filter is showing, deduped and selectable. */
  readonly visibleRepositoryIds: ReadonlyArray<number>
  readonly bulkProgress: IBulkRepositoryProgress | null
  readonly bulkProgressTitleKey: TranslationKey | null
  readonly bulkNotice: string | null
  readonly bulkRemovalCandidates: ReadonlyArray<IBulkRepositoryItem> | null
  readonly bulkCancelRequested: boolean
  /**
   * Group keys the user has folded away, as persisted in the profile's
   * registered settings. Held in state so a toggle repaints immediately; the
   * store stays the source of truth across restarts.
   */
  readonly collapsedGroupKeys: ReadonlyArray<string>
  /**
   * Indices (into the chip-filtered groups) of the groups the text filter left
   * on screen. Reported by the list, because only the list knows the match mode
   * that produced them.
   */
  readonly filteredGroupIndices: ReadonlyArray<number>
  /**
   * The most recent repository-group result, shown as a non-blocking polite
   * status line. Null once it has been read and cleared.
   */
  readonly groupNotice: string | null
}

/**
 * Cloning rows carry temporary ids and submodules cannot be removed from the
 * list at all, so neither takes part in a reviewed bulk selection.
 */
function isBulkSelectable(repository: Repositoryish): repository is Repository {
  return (
    repository instanceof Repository &&
    !(repository instanceof SubmoduleRepository)
  )
}

function toBulkItems(
  repositories: ReadonlyArray<Repository>
): ReadonlyArray<IBulkRepositoryItem> {
  return repositories.map(repository => ({
    id: repository.id,
    name: repository.name,
  }))
}

const RepositoryStatusFilters: ReadonlyArray<{
  readonly value: RepositoryStatusFilter
  readonly labelKey: TranslationKey
}> = [
  { value: 'clean', labelKey: 'repositoryPicker.clean' },
  { value: 'changed', labelKey: 'repositoryPicker.changed' },
  { value: 'ahead', labelKey: 'repositoryPicker.ahead' },
  { value: 'behind', labelKey: 'repositoryPicker.behind' },
  {
    value: 'missing-or-cloning',
    labelKey: 'repositoryPicker.missingOrCloning',
  },
]

/**
 * Side-sheet row geometry. The list renders exclusively inside the Current
 * Repository foldout, so each height mirrors the `#foldout-container` rules in
 * `app/styles/ui/_repository-list.scss`: a 34px icon chip plus 2×10px block
 * padding (comfortable), a 28px chip plus 2×5px at compact repository-list
 * density, and the uppercase group label with its block padding. Keep these in
 * sync with the SCSS — a shorter virtualized slot makes rows overlap their
 * neighbors and mis-target clicks.
 */
const RowHeight = 54
const CompactRowHeight = 38
const GroupHeaderRowHeight = 36

/**
 * How long a repository-group result stays on screen.
 *
 * Long enough to read a bilingual sentence at a comfortable pace, short enough
 * that a stale line never sits over a list the user has moved on from.
 */
const GroupNoticeDurationMs = 8000

/**
 * Iterate over all groups until a list item is found that matches
 * the id of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >,
  selectedRepository: Repositoryish | null
) {
  if (selectedRepository !== null) {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.repository.id === selectedRepository.id) {
          return item
        }
      }
    }
  }

  return null
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  IRepositoriesListState
> {
  private profileLogoSignature: string

  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish> | null,
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
      recentRepositories: ReadonlyArray<number>,
      showRecentRepositories: boolean,
      pinnedRepositories: ReadonlyArray<number>
    ) =>
      repositories === null
        ? []
        : groupRepositories(
            repositories,
            localRepositoryStateLookup,
            recentRepositories,
            showRecentRepositories,
            pinnedRepositories
          )
  )

  /**
   * The chip-filtered groups the list actually renders.
   *
   * Memoized on flattened arguments (rather than on the options object
   * `filterRepositoryGroups` takes) so a fresh object literal cannot defeat the
   * cache. Several surfaces need the very same array — the rendered list, the
   * group headers, the section ids, and the auto-expanded notice — and they
   * must agree on it or a header would report a count for a group that is not
   * the one on screen.
   */
  private getFilteredGroups = memoizeOne(
    (
      allGroups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >,
      accounts: ReadonlyArray<Account>,
      accountFilter: RepositoryAccountFilter,
      serviceFilter: RepositoryServiceFilter,
      statusFilters: ReadonlyArray<RepositoryStatusFilter>,
      hiddenRepositoryIds: ReadonlyArray<number>,
      showHiddenRepositories: boolean
    ) =>
      filterRepositoryGroups(
        allGroups,
        accounts,
        accountFilter,
        serviceFilter,
        {
          statusFilters,
          hiddenRepositoryIds,
          showHiddenRepositories,
        }
      )
  )

  /**
   * How many repositories each rendered group holds, keyed by group key.
   *
   * A folded group has to keep saying what is inside it, and the header only
   * receives the group identifier, so the count is looked up here rather than
   * recounted per header render.
   */
  private getGroupMemberCounts = memoizeOne(
    (
      groups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >
    ) =>
      new Map<string, number>(
        groups.map(group => [getGroupKey(group.identifier), group.items.length])
      )
  )

  /**
   * Stable per-group DOM ids so each header's `aria-controls` names the row
   * container it really discloses.
   */
  private getSectionIdGetter = memoizeOne(
    (
        groups: ReadonlyArray<
          IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
        >
      ) =>
      (group: number) => {
        const identifier = groups[group]?.identifier
        return identifier === undefined
          ? undefined
          : repositoryGroupRowsId(getGroupKey(identifier))
      }
  )

  /**
   * A memoized function for finding the selected list item based
   * on an IAPIRepository instance. The selected item will not be
   * recomputed as long as the provided list of repositories and
   * the selected data object is equal to the last time the method
   * was called (reference equality).
   *
   * See findMatchingListItem for more details.
   */
  private getSelectedListItem = memoizeOne(findMatchingListItem)

  /**
   * Accessible sync sentences for every repository, keyed by id.
   *
   * The row's `aria-label` replaces its inner text for assistive technology, so
   * the sync line has to be folded into that label or it is never announced.
   * Memoized on the state cache rather than on the filtered rows: the filter
   * text is not an input here, so typing re-uses the same map instead of
   * re-deriving one sentence per visible row per keystroke.
   */
  private getSyncAccessibleNames = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish>,
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
      languageMode: LanguageMode,
      syncFunnyLevels: IRepositorySyncFunnyLevels
    ) => {
      const names = new Map<number, string>()

      for (const repository of repositories) {
        const state = localRepositoryStateLookup.get(repository.id)
        names.set(
          repository.id,
          getRepositorySyncSummaryText(
            getRepositorySyncSummary(
              repository,
              state?.upstreamState ?? 'unknown',
              state?.aheadBehind ?? null
            ),
            languageMode,
            syncFunnyLevels
          ).accessibleName
        )
      }

      return names
    }
  )

  /**
   * Live references to the mounted row components, keyed by repository id, so
   * the row context menu's "Customize …" items can open the anchored appearance
   * editor owned by the correct row.
   */
  private itemRefs = new Map<number, RepositoryListItem>()
  private itemRefCallbacks = new Map<
    number,
    (instance: RepositoryListItem | null) => void
  >()

  /**
   * Cancellation for a running bulk fetch/pull. Checked between repositories,
   * never during one, so the in-flight Git operation always completes.
   */
  private bulkCancelled = false
  private unmounted = false
  /** Auto-clear timer for the polite repository-group status line. */
  private groupNoticeTimer: ReturnType<typeof setTimeout> | null = null

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.profileLogoSignature = getProfileRepositoryLogoSignature()
    const logoLoader = props.repositoryLogoLoader ?? repositoryLogoLoader
    logoLoader.synchronizeProfile(this.profileLogoSignature)

    this.state = {
      newRepositoryMenuExpanded: false,
      selectedItem: null,
      pinnedRepositoryIds: getPinnedRepositories(),
      accountFilter: 'all',
      serviceFilter: 'all',
      statusFilters: [],
      hiddenRepositoryIds: getHiddenRepositories(),
      showHiddenRepositories: false,
      repositoryLogoChange: { revision: 0, repositoryPath: null },
      languageMode: getPersistedLanguageMode(),
      syncFunnyLevels: readRepositorySyncFunnyLevels(),
      bulkSelection: emptyRepositoryBulkSelection,
      visibleRepositoryIds: [],
      bulkProgress: null,
      bulkProgressTitleKey: null,
      bulkNotice: null,
      bulkRemovalCandidates: null,
      bulkCancelRequested: false,
      collapsedGroupKeys: getCollapsedRepositoryGroups(),
      filteredGroupIndices: [],
      groupNotice: null,
    }
  }

  private getItemRef = (id: number) => {
    let callback = this.itemRefCallbacks.get(id)
    if (callback === undefined) {
      callback = (instance: RepositoryListItem | null) => {
        if (instance === null) {
          this.itemRefs.delete(id)
        } else {
          this.itemRefs.set(id, instance)
        }
      }
      this.itemRefCallbacks.set(id, callback)
    }
    return callback
  }

  private onCustomizeNameAppearance = (repository: Repositoryish) => {
    this.itemRefs.get(repository.id)?.openNameAppearanceEditorFromMenu()
  }

  private onCustomizeLogoAppearance = (repository: Repositoryish) => {
    this.itemRefs.get(repository.id)?.openLogoAppearanceEditorFromMenu()
  }

  public componentDidMount() {
    document.addEventListener(
      RepositoryLogoChangedEvent,
      this.onRepositoryLogoChanged
    )
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.addEventListener(
      RepositoryGroupNoticeEvent,
      this.onRepositoryGroupNotice
    )
  }

  public componentDidUpdate(prevProps: IRepositoriesListProps) {
    if (prevProps.repositories !== this.props.repositories) {
      const available = this.props.repositories
        .filter(isBulkSelectable)
        .map(repository => repository.id)
      const bulkSelection = pruneBulkSelection(
        this.state.bulkSelection,
        available
      )
      if (bulkSelection !== this.state.bulkSelection) {
        this.setState({ bulkSelection })
      }
    }

    if (
      prevProps.accounts !== this.props.accounts &&
      !isAccountFilterAvailable(
        this.state.accountFilter,
        this.props.accounts ?? []
      )
    ) {
      this.setState({ accountFilter: 'all', selectedItem: null })
    }

    const profileLogoSignature = getProfileRepositoryLogoSignature()
    if (profileLogoSignature !== this.profileLogoSignature) {
      this.profileLogoSignature = profileLogoSignature
      this.logoLoader.synchronizeProfile(profileLogoSignature)
      this.bumpRepositoryLogoChange(null)
    } else if (
      prevProps.repositoryLogoLoader !== this.props.repositoryLogoLoader
    ) {
      this.logoLoader.synchronizeProfile(profileLogoSignature)
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
    this.bulkCancelled = true
    document.removeEventListener(
      RepositoryLogoChangedEvent,
      this.onRepositoryLogoChanged
    )
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.removeEventListener(
      RepositoryGroupNoticeEvent,
      this.onRepositoryGroupNotice
    )
    if (this.groupNoticeTimer !== null) {
      clearTimeout(this.groupNoticeTimer)
      this.groupNoticeTimer = null
    }
  }

  /**
   * Show a repository-group result without blocking anything.
   *
   * Creating, editing, and dissolving a group all report here — including the
   * dialog, which lives outside this list and posts its sentence as a document
   * event. The line is polite, auto-clears, and never gates the list.
   */
  private onRepositoryGroupNotice = (event: Event) => {
    const detail = (event as CustomEvent<IRepositoryGroupNoticeDetail>).detail
    const notice = detail?.notice
    if (typeof notice !== 'string' || notice.length === 0) {
      return
    }
    this.showGroupNotice(notice)
  }

  private showGroupNotice(notice: string) {
    if (this.groupNoticeTimer !== null) {
      clearTimeout(this.groupNoticeTimer)
    }
    this.setState({ groupNotice: notice })
    this.groupNoticeTimer = setTimeout(() => {
      this.groupNoticeTimer = null
      if (!this.unmounted) {
        this.setState({ groupNotice: null })
      }
    }, GroupNoticeDurationMs)
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    // The funny levels are persisted beside the language preference, so this is
    // also the moment to pick up a changed playfulness without paying a
    // localStorage read on every row of every render.
    const syncFunnyLevels = readRepositorySyncFunnyLevels()
    const funnyLevelsChanged =
      syncFunnyLevels.english !== this.state.syncFunnyLevels.english ||
      syncFunnyLevels.cantonese !== this.state.syncFunnyLevels.cantonese

    if (languageMode !== this.state.languageMode || funnyLevelsChanged) {
      this.setState({
        languageMode,
        syncFunnyLevels: funnyLevelsChanged
          ? syncFunnyLevels
          : this.state.syncFunnyLevels,
      })
    }
  }

  private get logoLoader(): IRepositoryLogoLoader {
    return this.props.repositoryLogoLoader ?? repositoryLogoLoader
  }

  private onRepositoryLogoChanged = (event: Event) => {
    const detail = (event as CustomEvent<IRepositoryLogoChangedDetail>).detail
    const repositoryPath = detail?.repositoryPath ?? null
    const profileLogoSignature = getProfileRepositoryLogoSignature()
    this.profileLogoSignature = profileLogoSignature
    this.logoLoader.synchronizeProfile(profileLogoSignature)
    this.logoLoader.invalidate(repositoryPath, event)
    this.bumpRepositoryLogoChange(repositoryPath)
  }

  private bumpRepositoryLogoChange(repositoryPath: string | null) {
    this.setState(state => ({
      repositoryLogoChange: {
        revision: state.repositoryLogoChange.revision + 1,
        repositoryPath,
      },
    }))
  }

  /** Match each virtualized slot to the side-sheet geometry it renders. */
  private getRowHeight = ({
    item,
  }: {
    readonly item: IRepositoryListItem | null
  }) => {
    if (item === null) {
      return GroupHeaderRowHeight
    }
    return this.props.repositoryListDensity === 'compact'
      ? CompactRowHeight
      : RowHeight
  }

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const row = this.renderRepositoryRow(item, matches)
    if (!this.state.bulkSelection.active) {
      return row
    }

    const repository = item.repository
    const selectable = isBulkSelectable(repository)

    return (
      <div className="repository-list-item-bulk">
        <input
          type="checkbox"
          className="repository-list-item-select"
          data-repository-id={repository.id}
          checked={
            selectable &&
            this.state.bulkSelection.selectedIds.has(repository.id)
          }
          disabled={!selectable || this.isBulkBusy}
          aria-label={translateForAccessibleName(
            'repositoryBulk.selectRepositoryAria',
            { repository: repository.name },
            this.state.languageMode
          )}
          onClick={this.onRowCheckboxClick}
          onChange={this.onRowCheckboxChanged}
        />
        {row}
      </div>
    )
  }

  private onRowCheckboxClick = (event: React.MouseEvent<HTMLInputElement>) => {
    // The row itself is clickable; without this the toggle would also change
    // the app-wide repository selection and close the side sheet.
    event.stopPropagation()
  }

  private onRowCheckboxChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const id = Number(event.currentTarget.dataset.repositoryId)
    if (!Number.isSafeInteger(id)) {
      return
    }
    this.setBulkSelection(
      toggleRepositorySelection(
        this.state.bulkSelection,
        id,
        event.currentTarget.checked
      )
    )
  }

  private renderRepositoryRow = (
    item: IRepositoryListItem,
    matches: IMatches
  ) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        ref={this.getItemRef(repository.id)}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        upstreamState={item.upstreamState}
        syncFunnyLevels={this.state.syncFunnyLevels}
        changedFilesCount={item.changedFilesCount}
        branchName={
          shouldShowBranchName(
            this.props.showBranchNameInRepoList,
            item.branchName,
            item.defaultBranchName
          )
            ? item.branchName
            : null
        }
        isHidden={this.state.hiddenRepositoryIds.includes(repository.id)}
        languageMode={this.state.languageMode}
        repositoryLogoChange={this.state.repositoryLogoChange}
        repositoryLogoLoader={this.logoLoader}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private getAheadBehindTooltip = (aheadBehind: IAheadBehind | null) => {
    if (aheadBehind === null) {
      return null
    }

    const { ahead, behind } = aheadBehind

    if (behind === 0 && ahead === 0) {
      return null
    }

    return (
      'The currently checked out branch is' +
      (behind ? ` ${commitGrammar(behind)} behind ` : '') +
      (behind && ahead ? 'and' : '') +
      (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
      'its tracked branch.'
    )
  }

  private renderRowFocusTooltip = (
    item: IRepositoryListItem
  ): JSX.Element | string | null => {
    const { repository, aheadBehind, changedFilesCount } = item
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const alias = repository instanceof Repository ? repository.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repository.name
    const aheadBehindTooltip = this.getAheadBehindTooltip(aheadBehind)
    const hasChanges = changedFilesCount > 0
    const uncommittedChangesTooltip = hasChanges
      ? `There are uncommitted changes in this repository.`
      : null

    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0

    return (
      <div className="repository-list-item-tooltip list-item-tooltip">
        <div>
          <div className="label">Full Name: </div>
          {realName}
          {alias && <> ({alias})</>}
        </div>
        <div>
          <div className="label">Path: </div>
          {repository.path}
        </div>
        {aheadBehindTooltip && (
          <div>
            <div className="label">
              <div className="ahead-behind">
                {ahead > 0 && <MaterialSymbol name="arrow_upward" size={14} />}
                {behind > 0 && (
                  <MaterialSymbol
                    name="arrow_upward"
                    size={14}
                    className="behind-indicator"
                  />
                )}
              </div>
            </div>
            {aheadBehindTooltip}
          </div>
        )}
        {uncommittedChangesTooltip && (
          <div>
            <div className="label">
              <span className="change-indicator-wrapper">
                <MaterialSymbol name="circle" fill={1} size={10} />
              </span>
            </div>
            {uncommittedChangesTooltip}
          </div>
        )}
      </div>
    )
  }

  private getGroupLabel(group: RepositoryListGroup) {
    const { kind } = group
    if (kind === 'pinned') {
      return 'Pinned'
    } else if (kind === 'enterprise') {
      return group.host
    } else if (kind === 'other') {
      return 'Other'
    } else if (kind === 'dotcom') {
      return group.owner.login
    } else if (kind === 'recent') {
      return 'Recent'
    } else if (kind === 'custom') {
      return group.name
    } else {
      assertNever(kind, `Unknown repository group kind ${kind}`)
    }
  }

  /** Whether the active text filter is narrowing the list right now. */
  private get filterActive(): boolean {
    return isRepositoryFilterActive(this.props.filterText)
  }

  /**
   * Whether one group renders folded.
   *
   * While a filter is running this is always false. That is the whole of the
   * "a search hit is never silently swallowed" rule: rather than counting
   * matches hidden behind folds and hoping the user reads a warning, every fold
   * simply opens for the duration of the filter and closes again — from the
   * untouched persisted set — the moment the filter is cleared.
   */
  private isGroupCollapsed = (group: RepositoryListGroup) =>
    isRepositoryGroupCollapsed(
      this.state.collapsedGroupKeys,
      getGroupKey(group),
      this.filterActive
    )

  private renderGroupHeader = (group: RepositoryListGroup) => {
    const label = this.getGroupLabel(group)
    const groupKey = getGroupKey(group)
    const collapsed = this.isGroupCollapsed(group)
    const count =
      this.getGroupMemberCounts(this.visibleGroups).get(groupKey) ?? 0

    const customName = customRepositoryGroupKeyName(groupKey)

    const disclosure = (
      <button
        key={groupKey}
        type="button"
        className="filter-list-group-header repository-group-header"
        // The row's own aria-label is undefined for header rows, so this button
        // is what assistive technology actually reads. It carries the group
        // name, the exact member count, and the disclosure state, because the
        // painted chevron and count pill are decorative.
        aria-expanded={!collapsed}
        aria-controls={repositoryGroupRowsId(groupKey)}
        aria-label={getRepositoryGroupAccessibleName(
          label,
          count,
          collapsed,
          this.state.languageMode,
          this.state.syncFunnyLevels
        )}
        data-group-key={groupKey}
        onClick={this.onGroupHeaderClick}
        onKeyDown={this.onGroupHeaderKeyDown}
      >
        <MaterialSymbol
          name="expand_more"
          size={18}
          className="repository-group-chevron"
        />
        <TooltippedContent
          className="repository-group-label"
          tooltip={label}
          onlyWhenOverflowed={true}
          tagName="span"
        >
          {label}
        </TooltippedContent>
        {collapsed && (
          <span className="repository-group-count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
    )

    // Only a user-created group can be renamed, re-populated, or dissolved.
    // The provider-derived groups (pinned, recent, an owner, an Enterprise
    // host) describe facts about the repositories, so there is nothing there
    // for a group action to change.
    if (customName === null) {
      return disclosure
    }

    return (
      <div key={groupKey} className="repository-group-header-row">
        {disclosure}
        <button
          type="button"
          className="repository-group-actions"
          aria-label={translateForAccessibleName(
            'repositoryGroups.actionsLabel',
            { group: label },
            this.state.languageMode
          )}
          aria-haspopup="menu"
          data-group-name={label}
          onClick={this.onGroupActionsClick}
          onKeyDown={this.onGroupActionsKeyDown}
        >
          <MaterialSymbol name="tune" size={16} />
        </button>
      </div>
    )
  }

  /**
   * The custom group's own menu: rename and re-populate, or dissolve it.
   *
   * Both routes are non-destructive by construction — the only field either can
   * write is the repository's group label.
   */
  private onGroupActionsClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // The button lives inside a list row; without this the row would also
    // process the press and the side sheet would react to opening a menu.
    event.stopPropagation()
    this.openGroupActionsMenu(event.currentTarget.dataset.groupName)
  }

  private onGroupActionsKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (
      event.key !== 'Enter' &&
      event.key !== ' ' &&
      event.key !== 'Spacebar'
    ) {
      return
    }
    // Handle it here and suppress the button's own synthesized click, which
    // would otherwise open the menu twice.
    event.preventDefault()
    event.stopPropagation()
    this.openGroupActionsMenu(event.currentTarget.dataset.groupName)
  }

  private openGroupActionsMenu(groupName: string | undefined) {
    if (groupName === undefined || groupName.length === 0) {
      return
    }

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: translate('repositoryGroups.editMenu', this.state.languageMode),
        action: () => this.onEditRepositoryGroup(groupName),
      },
      {
        label: translate(
          'repositoryGroups.removeMenu',
          this.state.languageMode
        ),
        action: () => this.onRemoveRepositoryGroup(groupName),
      },
    ]

    showContextualMenu(items)
  }

  private onNewRepositoryGroup = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.ManageRepositoryGroup,
      groupName: null,
    })
  }

  private onEditRepositoryGroup(groupName: string) {
    this.props.dispatcher.showPopup({
      type: PopupType.ManageRepositoryGroup,
      groupName,
    })
  }

  /**
   * Dissolve a custom group.
   *
   * Every member's group label goes back to `null` and nothing else happens:
   * the repositories stay in the list, keep their pins, their aliases, and
   * every byte on disk. The announced sentence states the exact count that
   * stayed, so the user is never left guessing what a "remove" did.
   */
  private onRemoveRepositoryGroup(groupName: string) {
    const assignments = planRepositoryGroupRemoval(
      this.props.repositories,
      groupName
    )
    const count = String(assignments.length)

    Promise.all(
      assignments.map(assignment =>
        this.props.dispatcher.changeRepositoryGroupName(
          assignment.repository,
          null
        )
      )
    )
      .then(() => {
        if (!this.unmounted) {
          this.showGroupNotice(
            translate(
              'repositoryGroups.removedStatus',
              this.state.languageMode,
              { group: groupName, count }
            )
          )
        }
      })
      .catch(error => {
        log.error('Failed to remove repository group', error)
        if (!this.unmounted) {
          this.showGroupNotice(
            translate('repositoryGroups.actionFailed', this.state.languageMode)
          )
        }
      })
  }

  /** The polite, auto-clearing result line for a group action. */
  private renderGroupNotice() {
    const { groupNotice } = this.state
    return (
      <div
        className="repository-group-notice"
        role="status"
        aria-live="polite"
        aria-label={translateForAccessibleName(
          'repositoryGroups.noticeAria',
          {},
          this.state.languageMode
        )}
      >
        {groupNotice ?? ''}
      </div>
    )
  }

  private onGroupHeaderClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // The header lives inside a list row; without this the row would also
    // process the press and the side sheet would react to a fold.
    event.stopPropagation()
    this.toggleGroupCollapsed(event.currentTarget.dataset.groupKey)
  }

  private onGroupHeaderKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (
      event.key !== 'Enter' &&
      event.key !== ' ' &&
      event.key !== 'Spacebar'
    ) {
      return
    }

    // Handle the disclosure here and suppress the button's own synthesized
    // click. Letting both run would toggle twice and land the group exactly
    // where it started, which reads as a dead key.
    event.preventDefault()
    event.stopPropagation()
    this.toggleGroupCollapsed(event.currentTarget.dataset.groupKey)
  }

  /**
   * Fold or unfold one group and persist the change.
   *
   * The write goes to a registered profile setting, so the profile store picks
   * it up on its next debounced snapshot; the dispatcher call below is what
   * tells the store to look. Nothing is committed per toggle — a burst of folds
   * collapses into one settings-history entry.
   */
  private toggleGroupCollapsed(groupKey: string | undefined) {
    if (groupKey === undefined || groupKey.length === 0) {
      return
    }

    const collapsedGroupKeys = setRepositoryGroupCollapsed(
      groupKey,
      !this.state.collapsedGroupKeys.includes(groupKey)
    )
    this.setState({ collapsedGroupKeys })
    this.props.dispatcher.recordRepositoryGroupCollapseChange()
  }

  private onItemClick = (item: IRepositoryListItem) => {
    if (this.state.bulkSelection.active) {
      const repository = item.repository
      if (!isBulkSelectable(repository) || this.isBulkBusy) {
        return
      }
      this.setBulkSelection(
        toggleRepositorySelection(
          this.state.bulkSelection,
          repository.id,
          !this.state.bulkSelection.selectedIds.has(repository.id)
        )
      )
      return
    }

    const hasIndicator =
      item.changedFilesCount > 0 ||
      (item.aheadBehind !== null
        ? item.aheadBehind.ahead > 0 || item.aheadBehind.behind > 0
        : false)
    this.props.dispatcher.recordRepoClicked(hasIndicator)
    this.props.onSelectionChanged(item.repository)
  }

  private onItemContextMenu = (
    item: IRepositoryListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const items = generateRepositoryListContextMenu({
      accounts: this.props.accounts ?? [],
      onRemoveRepository: this.props.onRemoveRepository,
      onShowRepository: this.props.onShowRepository,
      onOpenInShell: this.props.onOpenInShell,
      onOpenInExternalEditor: this.props.onOpenInExternalEditor,
      askForConfirmationOnRemoveRepository:
        this.props.askForConfirmationOnRemoveRepository,
      externalEditorLabel:
        item.repository instanceof Repository &&
        item.repository.customEditorOverride !== null
          ? getEditorOverrideLabel(item.repository.customEditorOverride)
          : this.props.externalEditorLabel,
      onChangeRepositoryAlias: this.onChangeRepositoryAlias,
      onRemoveRepositoryAlias: this.onRemoveRepositoryAlias,
      onChangeRepositoryGroupName: this.onChangeRepositoryGroupName,
      onRemoveRepositoryGroupName: this.onRemoveRepositoryGroupName,
      onViewOnGitHub: this.props.onViewOnGitHub,
      onForkRepository: this.props.onForkRepository,
      onOpenInNewWindow: this.props.onOpenInNewWindow,
      onCreateWorktree: enableWorktreeSupport()
        ? this.onCreateWorktree
        : undefined,
      onShowWorktrees: enableWorktreeSupport()
        ? this.onShowWorktrees
        : undefined,
      isPinned: this.state.pinnedRepositoryIds.includes(item.repository.id),
      onPinRepository: this.onPinRepository,
      onUnpinRepository: this.onUnpinRepository,
      isHidden: this.state.hiddenRepositoryIds.includes(item.repository.id),
      languageMode: this.state.languageMode,
      onHideRepository: this.onHideRepository,
      onUnhideRepository: this.onUnhideRepository,
      onCustomizeNameAppearance: this.onCustomizeNameAppearance,
      onCustomizeLogoAppearance: this.onCustomizeLogoAppearance,
      repository: item.repository,
      shellLabel: this.props.shellLabel,
    })

    showContextualMenu(items)
  }

  private getItemAriaLabel = (item: IRepositoryListItem) => {
    const name = this.state.hiddenRepositoryIds.includes(item.repository.id)
      ? translateForAccessibleName(
          'repositoryPicker.itemHiddenAria',
          { repository: item.repository.name },
          this.state.languageMode
        )
      : item.repository.name
    const privacy =
      item.repository instanceof Repository &&
      item.repository.gitHubRepository?.isPrivate === true
        ? translateForAccessibleName(
            'repositoryPicker.privateRepository',
            {},
            this.state.languageMode
          )
        : null

    const syncName = this.getSyncAccessibleNames(
      this.props.repositories,
      this.props.localRepositoryStateLookup,
      this.state.languageMode,
      this.state.syncFunnyLevels
    ).get(item.repository.id)

    return [name, privacy, syncName]
      .filter((segment): segment is string => typeof segment === 'string')
      .join(', ')
  }
  private getGroupAriaLabelGetter =
    (
      groups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >
    ) =>
    (group: number) =>
      this.getGroupLabel(groups[group].identifier)

  /**
   * The groups the list is currently showing, after the account, service,
   * status, and hidden-repository chips have had their say but before any text
   * filter. Memoized, so every surface that asks gets the same array.
   */
  private get visibleGroups(): ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  > {
    return this.getFilteredGroups(
      this.getRepositoryGroups(
        this.props.repositories,
        this.props.localRepositoryStateLookup,
        this.props.recentRepositories,
        this.props.showRecentRepositories,
        this.state.pinnedRepositoryIds
      ),
      this.props.accounts ?? [],
      this.state.accountFilter,
      this.state.serviceFilter,
      this.state.statusFilters,
      this.state.hiddenRepositoryIds,
      this.state.showHiddenRepositories
    )
  }

  public render() {
    const groups = this.visibleGroups

    // So there's two types of selection at play here. There's the repository
    // selection for the whole app and then there's the keyboard selection in
    // the list itself. If the user has selected a repository using keyboard
    // navigation we want to honor that selection. If the user hasn't selected a
    // repository yet we'll select the repository currently selected in the app.
    const selectedItem =
      this.state.selectedItem ??
      this.getSelectedListItem(groups, this.props.selectedRepository)

    return (
      // The container only observes Escape so multi-select can unwind before
      // the side sheet closes; every control inside it stays natively
      // interactive and keyboard reachable on its own.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div className="repository-list" onKeyDown={this.onListKeyDown}>
        {this.renderSheetHeader()}
        {this.renderBulkActions()}
        <SectionFilterList<IRepositoryListItem, RepositoryListGroup>
          rowHeight={this.getRowHeight}
          selectedItem={selectedItem}
          filterListId="repositories"
          filterListLabel="Repositories"
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          renderPreList={this.renderScopeFilters}
          renderItem={this.renderItem}
          renderRowFocusTooltip={this.renderRowFocusTooltip}
          renderGroupHeader={this.renderGroupHeader}
          isGroupCollapsed={this.isGroupCollapsed}
          getSectionId={this.getSectionIdGetter(groups)}
          onItemClick={this.onItemClick}
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          groups={groups}
          onVisibleItemsChanged={this.onVisibleItemsChanged}
          onFilteredGroupsChanged={this.onFilteredGroupsChanged}
          invalidationProps={{
            repositories: this.props.repositories,
            filterText: this.props.filterText,
            bulkSelectionActive: this.state.bulkSelection.active,
            bulkSelectedIds: this.state.bulkSelection.selectedIds,
            bulkBusy: this.isBulkBusy,
            showRecentRepositories: this.props.showRecentRepositories,
            pinnedRepositoryIds: this.state.pinnedRepositoryIds,
            accounts: this.props.accounts,
            accountFilter: this.state.accountFilter,
            serviceFilter: this.state.serviceFilter,
            statusFilters: this.state.statusFilters,
            hiddenRepositoryIds: this.state.hiddenRepositoryIds,
            showHiddenRepositories: this.state.showHiddenRepositories,
            repositoryLogoRevision: this.state.repositoryLogoChange.revision,
            languageMode: this.state.languageMode,
            collapsedGroupKeys: this.state.collapsedGroupKeys,
          }}
          onItemContextMenu={this.onItemContextMenu}
          getGroupAriaLabel={this.getGroupAriaLabelGetter(groups)}
          getItemAriaLabel={this.getItemAriaLabel}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }

  private onSelectionChanged = (selectedItem: IRepositoryListItem | null) => {
    this.setState({ selectedItem })
  }

  private onAccountFilterChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    this.setState({
      accountFilter: event.currentTarget.value as RepositoryAccountFilter,
      selectedItem: null,
    })
  }

  private onServiceFilterChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    this.setState({
      serviceFilter: event.currentTarget.value as RepositoryServiceFilter,
      selectedItem: null,
    })
  }

  private onStatusFilterToggle = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const status = event.currentTarget.value as RepositoryStatusFilter
    this.setState(state => {
      const filters = new Set(state.statusFilters)
      if (filters.has(status)) {
        filters.delete(status)
      } else {
        filters.add(status)
      }
      return { statusFilters: [...filters], selectedItem: null }
    })
  }

  private onShowAllStatuses = () => {
    this.setState({ statusFilters: [], selectedItem: null })
  }

  private onShowHiddenRepositoriesToggle = () => {
    this.setState(state => ({
      showHiddenRepositories: !state.showHiddenRepositories,
      selectedItem: null,
    }))
  }

  private get hiddenRepositoryCount() {
    const hidden = new Set(this.state.hiddenRepositoryIds)
    return this.props.repositories.filter(
      repository =>
        repository instanceof Repository && hidden.has(repository.id)
    ).length
  }

  private renderScopeFilters = () => {
    const accounts = this.props.accounts ?? []
    const allStatusesSelected = this.state.statusFilters.length === 0
    const hiddenRepositoryCount = this.hiddenRepositoryCount
    const languageMode = this.state.languageMode

    return (
      <div className="repository-list-filter-controls">
        <div
          className="repository-list-scope-filters"
          role="group"
          aria-label="Repository scope filters"
        >
          <label>
            <span>Repository account</span>
            <select
              aria-label="Repository account"
              value={this.state.accountFilter}
              onChange={this.onAccountFilterChange}
            >
              <option value="all">All accounts</option>
              {accounts.map(account => (
                <option
                  key={accountFilterFor(account)}
                  value={accountFilterFor(account)}
                >
                  {account.friendlyName} · {account.friendlyEndpoint}
                </option>
              ))}
              <option value="unassigned">No available account</option>
            </select>
          </label>
          <label>
            <span>Repository service</span>
            <select
              aria-label="Repository service"
              value={this.state.serviceFilter}
              onChange={this.onServiceFilterChange}
            >
              <option value="all">All services</option>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">Bitbucket</option>
              <option value="local">Local only</option>
              <option value="unknown">Unknown or signed out</option>
            </select>
          </label>
        </div>
        <div className="repository-list-status-filter">
          <span id="repository-status-filter-label">
            <LocalizedText
              translationKey="repositoryPicker.status"
              languageMode={languageMode}
            />
          </span>
          <div
            className="repository-list-status-chips"
            role="group"
            aria-labelledby="repository-status-filter-label"
          >
            <button
              type="button"
              className="repository-status-chip"
              aria-label={translateForAccessibleName(
                'repositoryPicker.all',
                {},
                languageMode
              )}
              aria-pressed={allStatusesSelected}
              onClick={this.onShowAllStatuses}
            >
              <LocalizedText
                translationKey="repositoryPicker.all"
                languageMode={languageMode}
              />
            </button>
            {RepositoryStatusFilters.map(filter => (
              <button
                type="button"
                key={filter.value}
                value={filter.value}
                className="repository-status-chip"
                aria-label={translateForAccessibleName(
                  filter.labelKey,
                  {},
                  languageMode
                )}
                aria-pressed={this.state.statusFilters.includes(filter.value)}
                onClick={this.onStatusFilterToggle}
              >
                <LocalizedText
                  translationKey={filter.labelKey}
                  languageMode={languageMode}
                />
              </button>
            ))}
          </div>
          {this.renderAutoExpandedGroupsNotice()}
          {this.renderGroupNotice()}
          {hiddenRepositoryCount > 0 && (
            <button
              type="button"
              className="repository-hidden-toggle"
              aria-pressed={this.state.showHiddenRepositories}
              aria-label={
                this.state.showHiddenRepositories
                  ? translateForAccessibleName(
                      'repositoryPicker.hideHiddenAria',
                      {},
                      languageMode
                    )
                  : translateForAccessibleName(
                      'repositoryPicker.showHiddenAria',
                      { count: String(hiddenRepositoryCount) },
                      languageMode
                    )
              }
              onClick={this.onShowHiddenRepositoriesToggle}
            >
              <MaterialSymbol name="visibility" size={16} />
              <LocalizedText
                translationKey={
                  this.state.showHiddenRepositories
                    ? 'repositoryPicker.showingHidden'
                    : 'repositoryPicker.showHidden'
                }
                variables={{ count: String(hiddenRepositoryCount) }}
                languageMode={languageMode}
              />
            </button>
          )}
        </div>
      </div>
    )
  }

  /**
   * Say, in words, why folded groups are open right now.
   *
   * Auto-expanding already guarantees no match is swallowed, but a fold
   * silently reopening itself is confusing on its own. The count is exact: it
   * counts only the folded groups the filter actually left on screen, so a
   * folded group with no matches is never claimed to have been opened.
   */
  private renderAutoExpandedGroupsNotice() {
    const groups = this.visibleGroups
    const renderedGroupKeys = this.state.filteredGroupIndices.flatMap(index => {
      const group = groups[index]
      return group === undefined ? [] : [getGroupKey(group.identifier)]
    })
    const count = countAutoExpandedRepositoryGroups(
      renderedGroupKeys,
      this.state.collapsedGroupKeys,
      this.filterActive
    )
    const segments = getAutoExpandedGroupsSegments(
      count,
      this.state.languageMode,
      this.state.syncFunnyLevels
    )

    if (segments.length === 0) {
      return null
    }

    return (
      <div className="repository-group-auto-expanded" role="status">
        <MaterialSymbol name="unfold_more" size={16} />
        <span>
          {segments.map((segment, index) => (
            <React.Fragment key={segment.locale}>
              {index > 0 && (
                <span className="localized-text-separator" aria-hidden={true}>
                  {' · '}
                </span>
              )}
              <span lang={segment.locale}>{segment.text}</span>
            </React.Fragment>
          ))}
        </span>
      </div>
    )
  }

  // In-sheet header (spec-overlays §3.1): title + close ✕. The Add split-button
  // stays in the filter row; the scrim handles outside-click dismissal.
  private renderSheetHeader() {
    return (
      <header className="side-sheet-header">
        <h2 className="side-sheet-title">Repositories</h2>
        <button
          type="button"
          className="side-sheet-close"
          onClick={this.onCloseClick}
          aria-label="Close"
        >
          <MaterialSymbol name="close" size={20} />
        </button>
      </header>
    )
  }

  private onCloseClick = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
  }

  private renderPostFilter = () => {
    return (
      <div className="repository-list-actions">
        <Button
          className="repository-bulk-enter-button"
          ariaLabel={translateForAccessibleName(
            'repositoryBulk.enterSelectionAria',
            {},
            this.state.languageMode
          )}
          ariaPressed={this.state.bulkSelection.active}
          disabled={this.isBulkBusy}
          onClick={this.onToggleBulkSelection}
        >
          <MaterialSymbol name="library_add_check" size={16} />
          <LocalizedText
            translationKey="repositoryBulk.enterSelection"
            languageMode={this.state.languageMode}
          />
        </Button>
        <Button
          className="repository-group-new-button"
          ariaLabel={translateForAccessibleName(
            'repositoryGroups.newButtonAria',
            {},
            this.state.languageMode
          )}
          onClick={this.onNewRepositoryGroup}
        >
          <MaterialSymbol name="group_add" size={16} />
          <LocalizedText
            translationKey="repositoryGroups.newButton"
            languageMode={this.state.languageMode}
          />
        </Button>
        <Button
          className="pull-all-repositories-button"
          onClick={this.onPullAllRepositories}
        >
          <MaterialSymbol name="sync" size={16} /> Sync repositories
        </Button>
        <Button
          className="commit-push-all-repositories-button"
          onClick={this.onCommitAndPushAllRepositories}
        >
          <MaterialSymbol name="arrow_upward" size={16} /> Commit &amp; push all
        </Button>
        <Button
          className="new-repository-button"
          onClick={this.onNewRepositoryButtonClick}
          ariaExpanded={this.state.newRepositoryMenuExpanded}
          onKeyDown={this.onNewRepositoryButtonKeyDown}
        >
          Add
          <MaterialSymbol name="expand_more" size={18} />
        </Button>
      </div>
    )
  }

  private onPullAllRepositories = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.PullAllRepositories,
    })
  }

  private onCommitAndPushAllRepositories = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CommitAndPushAll,
    })
  }

  private onNewRepositoryButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === 'ArrowDown') {
      this.onNewRepositoryButtonClick()
    }
  }

  private renderNoItems = () => {
    return (
      <div className="no-items no-results-found">
        <div className="blankslate-symbol" aria-hidden="true">
          <MaterialSymbol name="search_off" size={34} />
        </div>
        <div className="title">Sorry, I can't find that repository</div>

        <div className="protip">
          ProTip! Press{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut darwinKeys={['⌘', 'O']} keys={['Ctrl', 'O']} />
          </div>{' '}
          to quickly add a local repository, and{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut
              darwinKeys={['⇧', '⌘', 'O']}
              keys={['Ctrl', 'Shift', 'O']}
            />
          </div>{' '}
          to clone from anywhere within the app
        </div>
      </div>
    )
  }

  private onNewRepositoryButtonClick = () => {
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clone repository…',
        action: this.onCloneRepository,
      },
      {
        label: __DARWIN__ ? 'Create New Repository…' : 'Create new repository…',
        action: this.onCreateNewRepository,
      },
      {
        label: __DARWIN__
          ? 'Add Existing Repository…'
          : 'Add existing repository…',
        action: this.onAddExistingRepository,
      },
    ]

    this.setState({ newRepositoryMenuExpanded: true })
    showContextualMenu(items).then(() => {
      this.setState({ newRepositoryMenuExpanded: false })
    })
  }

  private onCloneRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL: null,
    })
  }

  private onAddExistingRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.CreateRepository })
  }

  private onChangeRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryAlias,
      repository,
    })
  }

  private onRemoveRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryAlias(repository, null)
  }

  private onChangeRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryGroupName,
      repository,
    })
  }

  private onRemoveRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryGroupName(repository, null)
  }

  private onCreateWorktree = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository,
    })
  }

  private onShowWorktrees = (repository: Repository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.showWorktreesFoldout()
  }

  // ---------------------------------------------------------------------------
  // Bulk selection and bulk actions
  // ---------------------------------------------------------------------------

  private get isBulkBusy(): boolean {
    const progress = this.state.bulkProgress
    return progress !== null && !progress.finished
  }

  private get customGroupNames(): ReadonlyArray<string> {
    const names = new Set<string>()
    for (const repository of this.props.repositories) {
      if (repository instanceof Repository && repository.groupName !== null) {
        names.add(repository.groupName)
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }

  private localizeBulk(
    key: TranslationKey,
    variables?: Readonly<Record<string, string>>
  ): string {
    return translate(key, this.state.languageMode, variables)
  }

  private setBulkSelection(bulkSelection: IRepositoryBulkSelection) {
    if (bulkSelection === this.state.bulkSelection) {
      return
    }
    this.setState({
      bulkSelection,
      bulkNotice: null,
      bulkRemovalCandidates: null,
    })
  }

  private onToggleBulkSelection = () => {
    if (this.state.bulkSelection.active) {
      this.onExitBulkSelection()
      return
    }
    this.setState({
      bulkSelection: enterBulkSelection(),
      bulkNotice: null,
      bulkRemovalCandidates: null,
    })
  }

  private onExitBulkSelection = () => {
    this.setState({
      bulkSelection: exitBulkSelection(),
      bulkNotice: null,
      bulkRemovalCandidates: null,
    })
  }

  private onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.key !== 'Escape') {
      return
    }

    // Unwind the confirmation first, then multi-select, and only then let the
    // side sheet's own Escape handling close the foldout.
    if (this.state.bulkRemovalCandidates !== null) {
      event.preventDefault()
      event.stopPropagation()
      this.setState({ bulkRemovalCandidates: null })
      return
    }

    if (this.state.bulkSelection.active && !this.isBulkBusy) {
      event.preventDefault()
      event.stopPropagation()
      this.onExitBulkSelection()
    }
  }

  private onFilteredGroupsChanged = (groupIndices: ReadonlyArray<number>) => {
    this.setState({ filteredGroupIndices: groupIndices })
  }

  private onVisibleItemsChanged = (
    items: ReadonlyArray<IRepositoryListItem>
  ) => {
    const visibleRepositoryIds = dedupeRepositoryIds(
      items
        .filter(item => isBulkSelectable(item.repository))
        .map(item => item.repository.id)
    )
    this.setState({ visibleRepositoryIds })
  }

  private onSelectAllVisibleChanged = (selected: boolean) => {
    this.setBulkSelection(
      setVisibleSelection(
        this.state.bulkSelection,
        this.state.visibleRepositoryIds,
        selected
      )
    )
  }

  private getSelectedRepositories(): ReadonlyArray<Repository> {
    const byId = new Map<number, Repository>()
    for (const repository of this.props.repositories) {
      if (isBulkSelectable(repository)) {
        byId.set(repository.id, repository)
      }
    }
    return selectedRepositoryIds(this.state.bulkSelection).flatMap(id => {
      const repository = byId.get(id)
      return repository === undefined ? [] : [repository]
    })
  }

  private onBulkOperation = (
    operation: RepositoryBulkOperation,
    groupName: string
  ) => {
    if (this.isBulkBusy) {
      return
    }

    const repositories = this.getSelectedRepositories()
    if (repositories.length === 0) {
      return
    }

    switch (operation) {
      case 'fetch-selected':
        void this.runReviewedSyncBulk('fetch', repositories)
        return
      case 'pull-selected':
        void this.runReviewedSyncBulk('pull', repositories)
        return
      case 'favorite':
        this.runFavoriteBulk(repositories, true)
        return
      case 'unfavorite':
        this.runFavoriteBulk(repositories, false)
        return
      case 'assign-group':
        if (groupName.length > 0) {
          void this.runGroupBulk(repositories, groupName)
        }
        return
      case 'remove-group':
        void this.runGroupBulk(repositories, null)
        return
      case 'remove-from-list':
        this.setState({
          bulkRemovalCandidates: toBulkItems(repositories),
          bulkNotice: null,
        })
        return
      default:
        assertNever(operation, `Unknown bulk operation ${operation}`)
    }
  }

  private runFavoriteBulk(
    repositories: ReadonlyArray<Repository>,
    favorite: boolean
  ) {
    for (const repository of repositories) {
      if (favorite) {
        addPinnedRepository(repository)
      } else {
        removePinnedRepository(repository)
      }
    }

    this.setState({
      pinnedRepositoryIds: getPinnedRepositories(),
      bulkNotice: this.localizeBulk(
        favorite
          ? 'repositoryBulk.favoritedNotice'
          : 'repositoryBulk.unfavoritedNotice',
        { count: String(repositories.length) }
      ),
    })
  }

  private async runGroupBulk(
    repositories: ReadonlyArray<Repository>,
    groupName: string | null
  ) {
    let changed = 0
    let failure: string | null = null

    for (const repository of repositories) {
      try {
        await this.props.dispatcher.changeRepositoryGroupName(
          repository,
          groupName
        )
        changed++
      } catch (error) {
        failure = sanitizeBulkFailureReason(error)
      }
    }

    if (this.unmounted) {
      return
    }

    this.setState({
      bulkNotice:
        failure ??
        (groupName === null
          ? this.localizeBulk('repositoryBulk.removedGroupNotice', {
              count: String(changed),
            })
          : this.localizeBulk('repositoryBulk.assignedNotice', {
              count: String(changed),
              group: groupName,
            })),
    })
  }

  private async runReviewedSyncBulk(
    operation: RepositorySyncOperation,
    repositories: ReadonlyArray<Repository>
  ) {
    const items = toBulkItems(repositories)
    this.bulkCancelled = false

    this.setState({
      bulkProgress: initialBulkRepositoryProgress(items),
      bulkProgressTitleKey:
        operation === 'pull'
          ? 'repositoryBulk.pullingTitle'
          : 'repositoryBulk.fetchingTitle',
      bulkCancelRequested: false,
      bulkNotice: null,
      bulkRemovalCandidates: null,
    })

    await runSequentialRepositoryBulk(
      items,
      async (item, reportDetail) => {
        // One reviewed single-repository batch per item. The store revalidates
        // the id against the live inventory and runs its own per-repository
        // pull safety review, so a bulk selection can never bypass reviewed
        // pull semantics or reach Git with an unreviewed argument.
        const results = await this.props.dispatcher.syncRepositories(
          { operation, repositoryIds: [item.id] },
          update => reportDetail(update.item.detail)
        )
        const result = results[0]
        if (result === undefined) {
          return { status: 'skipped', detail: '' }
        }
        if (result.status === 'failed') {
          return { status: 'failed', detail: result.detail }
        }
        if (result.status === 'skipped') {
          return { status: 'skipped', detail: result.detail }
        }
        return { status: 'done', detail: result.detail }
      },
      {
        isCancelled: () => this.bulkCancelled,
        onProgress: progress => {
          if (!this.unmounted) {
            this.setState({ bulkProgress: progress })
          }
        },
      }
    )
  }

  private onCancelBulkRun = () => {
    this.bulkCancelled = true
    this.setState({ bulkCancelRequested: true })
  }

  private onDismissBulkRun = () => {
    this.setState({
      bulkProgress: null,
      bulkProgressTitleKey: null,
      bulkCancelRequested: false,
    })
  }

  private onCancelBulkRemoval = () => {
    this.setState({ bulkRemovalCandidates: null })
  }

  private onConfirmBulkRemoval = async () => {
    const candidates = this.state.bulkRemovalCandidates
    if (candidates === null) {
      return
    }

    const wanted = new Set(candidates.map(candidate => candidate.id))
    const repositories = this.props.repositories.filter(
      (repository): repository is Repository =>
        isBulkSelectable(repository) && wanted.has(repository.id)
    )

    this.setState({ bulkRemovalCandidates: null })

    let removed = 0
    let failure: string | null = null
    for (const repository of repositories) {
      try {
        // `moveToTrash` is always false here: removing repositories in bulk
        // only forgets them, it never deletes on-disk content.
        await this.props.dispatcher.removeRepository(repository, false)
        removed++
      } catch (error) {
        failure = sanitizeBulkFailureReason(error)
      }
    }

    if (this.unmounted) {
      return
    }

    this.setState({
      bulkSelection: clearBulkSelection(this.state.bulkSelection),
      bulkNotice:
        failure ??
        this.localizeBulk('repositoryBulk.removedNotice', {
          count: String(removed),
        }),
    })
  }

  private renderBulkActions() {
    if (!this.state.bulkSelection.active) {
      return null
    }

    const visibleIds = this.state.visibleRepositoryIds

    return (
      <RepositoryBulkActions
        languageMode={this.state.languageMode}
        selectedCount={this.state.bulkSelection.selectedIds.size}
        visibleCount={visibleIds.length}
        allVisibleSelected={isAllVisibleSelected(
          this.state.bulkSelection,
          visibleIds
        )}
        someVisibleSelected={isSomeVisibleSelected(
          this.state.bulkSelection,
          visibleIds
        )}
        busy={this.isBulkBusy}
        groupNames={this.customGroupNames}
        progress={this.state.bulkProgress}
        progressTitleKey={this.state.bulkProgressTitleKey}
        cancelRequested={this.state.bulkCancelRequested}
        notice={this.state.bulkNotice}
        removalCandidates={this.state.bulkRemovalCandidates}
        onSelectAllVisibleChanged={this.onSelectAllVisibleChanged}
        onOperation={this.onBulkOperation}
        onExit={this.onExitBulkSelection}
        onCancelRun={this.onCancelBulkRun}
        onDismissRun={this.onDismissBulkRun}
        onConfirmRemoval={this.onConfirmBulkRemoval}
        onCancelRemoval={this.onCancelBulkRemoval}
      />
    )
  }

  private onPinRepository = (repository: Repository) => {
    addPinnedRepository(repository)
    this.setState({ pinnedRepositoryIds: getPinnedRepositories() })
  }

  private onUnpinRepository = (repository: Repository) => {
    removePinnedRepository(repository)
    this.setState({ pinnedRepositoryIds: getPinnedRepositories() })
  }

  private onHideRepository = (repository: Repository) => {
    hideRepository(repository)
    this.setState({
      hiddenRepositoryIds: getHiddenRepositories(),
      selectedItem: null,
    })
  }

  private onUnhideRepository = (repository: Repository) => {
    unhideRepository(repository)
    this.setState({
      hiddenRepositoryIds: getHiddenRepositories(),
      selectedItem: null,
    })
  }
}
