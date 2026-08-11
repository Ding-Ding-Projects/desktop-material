/**
 * The Repositories destination's bulk-run owner.
 *
 * The rows themselves come straight out of the app store and are mapped by
 * `md3-destination-adapters`. What cannot live in a render pass is the run:
 * a bulk fetch, pull, favourite, group assignment or removal is a sequential
 * batch with per-repository outcomes, a cancel request and a summary, and it
 * survives many renders.
 *
 * Every operation reaches the same reviewed dispatcher path the classic
 * repository list uses — `syncRepositories` one repository at a time, so the
 * store revalidates each id and applies its own per-repository pull safety
 * review, and `removeRepository` behind the view's own destructive gate.
 */

import { t } from '../../lib/i18n'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { Dispatcher } from '../dispatcher'
import {
  IBulkRepositoryItem,
  IBulkRepositoryProgress,
  initialBulkRepositoryProgress,
  runSequentialRepositoryBulk,
  sanitizeBulkFailureReason,
} from '../../lib/automation/bulk-repository-runner'
import {
  addPinnedRepository,
  getPinnedRepositories,
  removePinnedRepository,
} from '../../lib/stores/repository-pinning'
import {
  IRepositoryBulkSelection,
  emptyRepositoryBulkSelection,
  selectedRepositoryIds,
} from '../repositories-list/repository-bulk-selection'

import {
  IMd3RepositoriesViewProps,
  IMd3RepositoryRow,
  IMd3RepositoryRun,
  Md3RepositoryBulkOperation,
} from './md3-repositories-view'
import { IMd3SearchBinding } from './md3-shell'

function toBulkItems(
  repositories: ReadonlyArray<Repository>
): ReadonlyArray<IBulkRepositoryItem> {
  return repositories.map(repository => ({
    id: repository.id,
    name: repository.name,
  }))
}

export interface IMd3RepositoriesControllerHost {
  readonly dispatcher: Dispatcher
  readonly onChanged: () => void
  /** Every repository the app knows about, cloning ones included. */
  readonly getRepositories: () => ReadonlyArray<Repository | CloningRepository>
  /** Opens the clone dialog. */
  readonly onClone: () => void
  /** Opens the add-local-repository dialog. */
  readonly onAddLocal: () => void
  /** Opens the row's full context menu, which the host owns. */
  readonly onOpenRowMenu: (repository: Repository, id: number) => void
  /** Writes an exported repository inventory somewhere the user chose. */
  readonly onExportSelection: (repositories: ReadonlyArray<Repository>) => void
  /** Opens a repository in a new tab or window, as the host does elsewhere. */
  readonly onOpenRepository: (repository: Repository) => void
}

export class Md3RepositoriesController {
  private selection: IRepositoryBulkSelection = emptyRepositoryBulkSelection
  private run: IMd3RepositoryRun | null = null
  private notice: string | null = null
  private removalCandidates: ReadonlyArray<IBulkRepositoryItem> | null = null
  private cancelRequested = false
  private chips: ReadonlyArray<string> = []
  private pinnedIds: ReadonlySet<number> = new Set(getPinnedRepositories())

  public constructor(private readonly host: IMd3RepositoriesControllerHost) {}

  /** Repository ids the user has pinned, for the row adapter. */
  public getPinnedIds(): ReadonlySet<number> {
    return this.pinnedIds
  }

  private changed(): void {
    this.host.onChanged()
  }

  private selectedRepositories(): ReadonlyArray<Repository> {
    const byId = new Map<number, Repository>()
    for (const repository of this.host.getRepositories()) {
      if (repository instanceof Repository) {
        byId.set(repository.id, repository)
      }
    }
    return selectedRepositoryIds(this.selection).flatMap(id => {
      const repository = byId.get(id)
      return repository === undefined ? [] : [repository]
    })
  }

  private repositoriesFor(
    ids: ReadonlyArray<number>
  ): ReadonlyArray<Repository> {
    const wanted = new Set(ids)
    const found = new Array<Repository>()
    for (const repository of this.host.getRepositories()) {
      if (repository instanceof Repository && wanted.has(repository.id)) {
        found.push(repository)
      }
    }
    return found
  }

  private startRun(
    operation: IMd3RepositoryRun['operation'],
    label: string,
    items: ReadonlyArray<IBulkRepositoryItem>
  ): void {
    this.cancelRequested = false
    this.run = {
      operation,
      label,
      progress: initialBulkRepositoryProgress(items),
      cancelRequested: false,
    }
    this.notice = null
    this.changed()
  }

  private reportProgress(progress: IBulkRepositoryProgress): void {
    if (this.run === null) {
      return
    }
    this.run = { ...this.run, progress }
    this.changed()
  }

  private async runRepositorySyncBulk(
    operation: 'fetch' | 'pull',
    repositories: ReadonlyArray<Repository>,
    viewOperation: IMd3RepositoryRun['operation'],
    label: string
  ): Promise<void> {
    const items = toBulkItems(repositories)
    this.startRun(viewOperation, label, items)

    const summary = await runSequentialRepositoryBulk(
      items,
      async (item, reportDetail) => {
        const results = await this.host.dispatcher.syncRepositories(
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
        isCancelled: () => this.cancelRequested,
        onProgress: progress => this.reportProgress(progress),
      }
    )

    if (this.run !== null) {
      this.run = { ...this.run, progress: summary }
    }
    this.changed()
  }

  private async runGroup(
    repositories: ReadonlyArray<Repository>,
    groupName: string | null,
    label: string
  ): Promise<void> {
    const items = toBulkItems(repositories)
    this.startRun(
      groupName === null ? 'remove-group' : 'assign-group',
      label,
      items
    )

    const summary = await runSequentialRepositoryBulk(
      items,
      async item => {
        const repository = this.repositoriesFor([item.id])[0]
        if (repository === undefined) {
          return { status: 'skipped', detail: t('md3.repositories.gone') }
        }
        try {
          await this.host.dispatcher.changeRepositoryGroupName(
            repository,
            groupName
          )
          return { status: 'done', detail: '' }
        } catch (error) {
          return { status: 'failed', detail: sanitizeBulkFailureReason(error) }
        }
      },
      {
        isCancelled: () => this.cancelRequested,
        onProgress: progress => this.reportProgress(progress),
      }
    )

    if (this.run !== null) {
      this.run = { ...this.run, progress: summary }
    }
    this.changed()
  }

  private runFavourite(
    repositories: ReadonlyArray<Repository>,
    favourite: boolean
  ): void {
    for (const repository of repositories) {
      if (favourite) {
        addPinnedRepository(repository)
      } else {
        removePinnedRepository(repository)
      }
    }
    this.pinnedIds = new Set(getPinnedRepositories())
    this.notice = favourite
      ? t('md3.repositories.favourited', {
          count: String(repositories.length),
        })
      : t('md3.repositories.unfavourited', {
          count: String(repositories.length),
        })
    this.changed()
  }

  // -- Handlers -------------------------------------------------------------

  private onSelectionChanged = (selection: IRepositoryBulkSelection) => {
    this.selection = selection
    this.changed()
  }

  private onToggleChip = (label: string) => {
    this.chips = this.chips.includes(label)
      ? this.chips.filter(chip => chip !== label)
      : [...this.chips, label]
    this.changed()
  }

  private onResetFilters = () => {
    this.chips = []
    this.changed()
  }

  private onCancelRun = () => {
    this.cancelRequested = true
    if (this.run !== null) {
      this.run = { ...this.run, cancelRequested: true }
    }
    this.changed()
  }

  private onDismissRun = () => {
    this.run = null
    this.changed()
  }

  private onDismissNotice = () => {
    this.notice = null
    this.changed()
  }

  private onCancelRemoval = () => {
    this.removalCandidates = null
    this.changed()
  }

  private onConfirmRemoval = () => {
    const candidates = this.removalCandidates
    if (candidates === null) {
      return
    }
    this.removalCandidates = null
    const repositories = this.repositoriesFor(candidates.map(item => item.id))
    // One repository at a time: `removeRepository` takes a single repository,
    // and a refused removal must not abandon the rest of the confirmed batch.
    void (async () => {
      let removed = 0
      let failure: string | null = null
      for (const repository of repositories) {
        try {
          await this.host.dispatcher.removeRepository(repository, false)
          removed++
        } catch (error) {
          failure = sanitizeBulkFailureReason(error)
        }
      }
      this.notice =
        failure ?? t('md3.repositories.removed', { count: String(removed) })
      this.selection = emptyRepositoryBulkSelection
      this.changed()
    })()
  }

  private onPullAll = (repositoryIds: ReadonlyArray<number>) => {
    const repositories = this.repositoriesFor(repositoryIds)
    if (repositories.length === 0) {
      return
    }
    void this.runRepositorySyncBulk(
      'pull',
      repositories,
      'pull-all',
      t('md3.repositories.pullingAll')
    )
  }

  private onBulkOperation = (
    operation: Md3RepositoryBulkOperation,
    groupName: string
  ) => {
    if (this.run !== null && !this.run.progress.finished) {
      return
    }
    const repositories = this.selectedRepositories()
    if (repositories.length === 0) {
      return
    }

    switch (operation) {
      case 'fetch-selected':
        void this.runRepositorySyncBulk(
          'fetch',
          repositories,
          operation,
          t('md3.repositories.fetching')
        )
        return
      case 'pull-selected':
        void this.runRepositorySyncBulk(
          'pull',
          repositories,
          operation,
          t('md3.repositories.pulling')
        )
        return
      case 'favorite':
        this.runFavourite(repositories, true)
        return
      case 'unfavorite':
        this.runFavourite(repositories, false)
        return
      case 'assign-group':
        if (groupName.length > 0) {
          void this.runGroup(
            repositories,
            groupName,
            t('md3.repositories.assigningGroup', { group: groupName })
          )
        }
        return
      case 'remove-group':
        void this.runGroup(
          repositories,
          null,
          t('md3.repositories.removingGroup')
        )
        return
      case 'remove-from-list':
        // Removal never runs from the bulk bar directly: the view's own
        // two-key-and-slider gate lists exactly which repositories go, and
        // `onConfirmRemoval` is the only path that reaches the dispatcher.
        this.removalCandidates = toBulkItems(repositories)
        this.notice = null
        this.changed()
        return
      case 'open-selected':
        for (const repository of repositories) {
          this.host.onOpenRepository(repository)
        }
        return
      case 'export-selected':
        this.host.onExportSelection(repositories)
        return
    }
  }

  /** The Repositories view's props. */
  public getViewProps(
    rows: ReadonlyArray<IMd3RepositoryRow>,
    search: IMd3SearchBinding,
    selectedRepositoryId: number | null,
    onSelectRepository: (id: number) => void,
    onOpenRepository: (id: number) => void,
    onRowContextMenu?: (
      id: number,
      event: React.MouseEvent<HTMLElement>
    ) => void
  ): IMd3RepositoriesViewProps {
    const groupNames = [
      ...new Set(
        this.host
          .getRepositories()
          .flatMap(repository =>
            repository instanceof Repository && repository.groupName !== null
              ? [repository.groupName]
              : []
          )
      ),
    ].sort()

    return {
      repositories: rows,
      searchValue: search.value,
      regexEnabled: search.regexEnabled,
      activeChips: this.chips,
      selectedRepositoryId,
      selection: this.selection,
      groupNames,
      run: this.run,
      notice: this.notice,
      removalCandidates: this.removalCandidates,
      onSearchChange: search.onChange,
      onClearSearch: search.onClear,
      onToggleRegex: search.onToggleRegex,
      onOpenRegexBuilder: search.onOpenBuilder,
      onToggleChip: this.onToggleChip,
      onResetFilters: this.onResetFilters,
      onClone: this.host.onClone,
      onAddLocal: this.host.onAddLocal,
      onPullAll: this.onPullAll,
      onSelectRepository,
      onOpenRepository,
      onOpenRowMenu: (id: number) => {
        const repository = this.repositoriesFor([id])[0]
        if (repository !== undefined) {
          this.host.onOpenRowMenu(repository, id)
        }
      },
      onRowContextMenu,
      onSelectionChanged: this.onSelectionChanged,
      onBulkOperation: this.onBulkOperation,
      onCancelRun: this.onCancelRun,
      onDismissRun: this.onDismissRun,
      onConfirmRemoval: this.onConfirmRemoval,
      onCancelRemoval: this.onCancelRemoval,
      onDismissNotice: this.onDismissNotice,
    }
  }
}
