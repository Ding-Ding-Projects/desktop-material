import * as React from 'react'
import { Branch, BranchType } from '../../models/branch'
import {
  getWorktreeAriaLabel,
  getWorktreeDisplayName,
  worktreePathsEqual,
  WorktreeEntry,
} from '../../models/worktree'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { SectionFilterList } from '../lib/section-filter-list'
import { WorktreeListItem } from './worktree-list-item'
import { Button } from '../lib/button'
import { IMatches } from '../../lib/fuzzy-find'
import { ClickSource } from '../lib/list'
import memoizeOne from 'memoize-one'
import { IListFilter } from '../lib/filter-list-mode'

const RowHeight = 30

interface IWorktreeListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly worktree: WorktreeEntry
}

interface IWorktreeListProps {
  readonly worktrees: ReadonlyArray<WorktreeEntry>
  readonly currentWorktree: WorktreeEntry | null

  readonly onWorktreeClick?: (
    worktree: WorktreeEntry,
    source: ClickSource
  ) => void
  readonly onFilterTextChanged: (text: string) => void
  readonly filterText: string
  readonly canCreateNewWorktree: boolean
  readonly onCreateNewWorktree?: () => void
  readonly onMergeWorktree?: (branch: Branch) => void
  readonly onMergeAllWorktrees?: () => void
  readonly onCheckoutAllBranchesAsWorktrees?: () => void
  readonly renderAdministration?: () => React.ReactNode
  readonly onWorktreeContextMenu?: (
    worktree: WorktreeEntry,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

type WorktreeGroupIdentifier = 'main' | 'linked'

const WorktreeTypeFilters: ReadonlyArray<IListFilter<IWorktreeListItem>> = [
  {
    id: 'main',
    label: 'Main',
    predicate: item => item.worktree.type === 'main',
  },
  {
    id: 'linked',
    label: 'Linked',
    predicate: item => item.worktree.type === 'linked',
  },
]

export class WorktreeList extends React.Component<IWorktreeListProps> {
  private getGroups = memoizeOne((worktrees: ReadonlyArray<WorktreeEntry>) => {
    const groups: Array<
      IFilterListGroup<IWorktreeListItem, WorktreeGroupIdentifier>
    > = []

    const mainWorktree = worktrees.find(w => w.type === 'main')
    const linkedWorktrees = worktrees.filter(w => w.type === 'linked')

    if (mainWorktree) {
      groups.push({
        identifier: 'main',
        items: [
          {
            text: worktreeFilterText(mainWorktree),
            id: mainWorktree.path,
            worktree: mainWorktree,
          },
        ],
      })
    }

    if (linkedWorktrees.length > 0) {
      groups.push({
        identifier: 'linked',
        items: linkedWorktrees.map(w => ({
          text: worktreeFilterText(w),
          id: w.path,
          worktree: w,
        })),
      })
    }

    return groups
  })

  private renderItem = (item: IWorktreeListItem, matches: IMatches) => {
    const isCurrentWorktree =
      this.props.currentWorktree !== null &&
      worktreePathsEqual(this.props.currentWorktree.path, item.worktree.path)
    const mergeBranch =
      this.props.onMergeWorktree === undefined
        ? undefined
        : getMergeBranchForWorktree(item.worktree, isCurrentWorktree)

    return (
      <WorktreeListItem
        worktree={item.worktree}
        isCurrentWorktree={isCurrentWorktree}
        matches={matches}
        mergeBranch={mergeBranch}
        onMergeWorktree={this.props.onMergeWorktree}
      />
    )
  }

  private renderGroupHeader = (identifier: WorktreeGroupIdentifier) => {
    const label = identifier === 'main' ? 'Main worktree' : 'Linked worktrees'
    return <div className="filter-list-group-header">{label}</div>
  }

  private getGroupAriaLabel = (group: number) => {
    const identifier = this.getGroups(this.props.worktrees)[group].identifier
    return identifier === 'main' ? 'Main worktree' : 'Linked worktrees'
  }

  private getItemAriaLabel = (item: IWorktreeListItem) => {
    const isCurrent =
      this.props.currentWorktree !== null &&
      worktreePathsEqual(this.props.currentWorktree.path, item.worktree.path)
    const state = getWorktreeAriaLabel(item.worktree)
    return isCurrent ? `${state}, current worktree` : state
  }

  private onRenderNewButton = () => {
    if (
      (!this.props.canCreateNewWorktree ||
        this.props.onCreateNewWorktree === undefined) &&
      this.props.renderAdministration === undefined
    ) {
      return null
    }
    return (
      <div className="worktree-list-post-filter">
        {this.props.canCreateNewWorktree &&
          this.props.onCreateNewWorktree !== undefined && (
            <div className="worktree-list-actions">
              <Button
                className="new-worktree-button"
                onClick={this.props.onCreateNewWorktree}
              >
                {__DARWIN__ ? 'New Worktree' : 'New worktree'}
              </Button>
              {this.props.onCheckoutAllBranchesAsWorktrees && (
                <Button
                  className="checkout-all-branches-worktrees-button"
                  onClick={this.props.onCheckoutAllBranchesAsWorktrees}
                >
                  {__DARWIN__
                    ? 'All Branches as Worktrees…'
                    : 'All branches as worktrees…'}
                </Button>
              )}
              {this.props.onMergeAllWorktrees && (
                <Button
                  className="merge-all-worktrees-button"
                  onClick={this.props.onMergeAllWorktrees}
                >
                  Merge all worktrees
                </Button>
              )}
            </div>
          )}
        {this.props.renderAdministration !== undefined &&
          this.props.renderAdministration()}
      </div>
    )
  }

  private onRenderNoItems = () => {
    return <div className="no-items-found">No worktrees found</div>
  }

  private onItemClick = (item: IWorktreeListItem, source: ClickSource) => {
    if (this.props.onWorktreeClick) {
      this.props.onWorktreeClick(item.worktree, source)
    }
  }

  private onItemContextMenu = (
    item: IWorktreeListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (this.props.onWorktreeContextMenu) {
      this.props.onWorktreeContextMenu(item.worktree, event)
    }
  }

  public render() {
    const groups = this.getGroups(this.props.worktrees)

    return (
      <SectionFilterList<IWorktreeListItem, WorktreeGroupIdentifier>
        className="worktree-list"
        rowHeight={RowHeight}
        filterListId="worktrees"
        filterListLabel="Worktrees"
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        selectedItem={null}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        getItemAriaLabel={this.getItemAriaLabel}
        getGroupAriaLabel={this.getGroupAriaLabel}
        onItemClick={this.onItemClick}
        groups={groups}
        invalidationProps={this.props.worktrees}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        onItemContextMenu={this.onItemContextMenu}
        customFilters={WorktreeTypeFilters}
      />
    )
  }
}

export function getMergeBranchForWorktree(
  worktree: WorktreeEntry,
  isCurrentWorktree: boolean
): Branch | undefined {
  if (
    worktree.type !== 'linked' ||
    worktree.branch === null ||
    worktree.isDetached ||
    isCurrentWorktree ||
    worktree.dirtyFileCount === null ||
    worktree.isLocked ||
    worktree.isPrunable
  ) {
    return undefined
  }

  const branchName = worktree.branch.replace(/^refs\/heads\//, '')
  if (branchName === worktree.branch) {
    return undefined
  }

  return new Branch(
    branchName,
    null,
    { sha: worktree.head },
    BranchType.Local,
    worktree.branch
  )
}

function worktreeFilterText(worktree: WorktreeEntry): ReadonlyArray<string> {
  const branch = worktree.branch?.replace(/^refs\/heads\//, '') ?? 'detached'
  const state = [
    worktree.dirtyFileCount && worktree.dirtyFileCount > 0
      ? `uncommitted ${worktree.dirtyFileCount}`
      : 'clean',
    worktree.isLocked ? 'locked' : '',
    worktree.isPrunable ? 'missing' : '',
  ]
  return [getWorktreeDisplayName(worktree), worktree.path, branch, ...state]
}
