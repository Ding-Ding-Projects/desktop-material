import * as React from 'react'
import memoize from 'memoize-one'
import { Commit } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { KeyboardInsertionData, List } from '../lib/list'
import { arrayEquals } from '../../lib/equality'
import { DragData, DragType } from '../../models/drag-drop'
import classNames from 'classnames'
import memoizeOne from 'memoize-one'
import { RowIndexPath } from '../lib/list/list-row-index-path'
import { assertNever } from '../../lib/fatal-error'
import { CommitDragElement } from '../drag-elements/commit-drag-element'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import debounce from 'lodash/debounce'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverScreenBorderPadding,
} from '../lib/popover'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { formatDate } from '../../lib/format-date'
import { Avatar } from '../lib/avatar'
import { buildCommitGraphRows, ICommitGraphRow } from './commit-graph-model'
import { RelativeTime } from '../relative-time'
import {
  ICommitContextMenuProps,
  showCommitContextMenu,
} from './commit-context-menu'
import { MaterialSymbol } from '../lib/material-symbol'

export { getEffectiveCommitSelection } from './commit-context-menu'

// v2 prototype "History panel" row geometry: 11px vertical inset + the 34px
// leading avatar disc.
const RowHeight = 56

interface ICommitListProps extends ICommitContextMenuProps {
  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, Emoji>

  /** The message to display inside the list when no results are displayed */
  readonly emptyListMessage?: JSX.Element | string

  /** Data to be reordered via keyboard */
  readonly keyboardReorderData?: KeyboardInsertionData

  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitsSelected?: (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll?: (start: number, end: number) => void

  /** Callback to fire to cancel a keyboard reordering operation */
  readonly onCancelKeyboardReorder?: () => void

  /**
   * A handler called whenever the user drops commits on the list to be inserted.
   *
   * @param baseCommit - The commit before the selected commits will be inserted.
   *                     This will be null when commits must be inserted at the
   *                     end of the list.
   * @param commitsToInsert -  The commits dropped by the user.
   */
  readonly onDropCommitInsertion?: (
    baseCommit: Commit | null,
    commitsToInsert: ReadonlyArray<Commit>,
    lastRetainedCommitRef: string | null
  ) => void

  /**
   * Optional callback that fires on page scroll in order to allow passing
   * a new scrollTop value up to the parent component for storing.
   */
  readonly onCompareListScrolled?: (scrollTop: number) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly compareListScrollTop?: number

  /* Whether the repository is local (it has no remotes) */
  readonly isLocalRepository: boolean

  /** Whether or not commits in this list can be reordered. */
  readonly reorderingEnabled?: boolean

  /** Callback to render commit drag element */
  readonly onRenderCommitDragElement?: (
    commit: Commit,
    selectedCommits: ReadonlyArray<Commit>
  ) => void

  /** Callback to remove commit drag element */
  readonly onRemoveCommitDragElement?: () => void

  /** Shas that should be highlighted */
  readonly shasToHighlight?: ReadonlyArray<string>

  readonly accounts: ReadonlyArray<Account>

  readonly preferAbsoluteDates: boolean

  /** This will make the list semantics friendly to screen reader users in browse mode. */
  readonly isInformationalView?: boolean

  /** Whether to draw the commit ancestry graph beside each history row. */
  readonly showCommitGraph?: boolean
}

interface ICommitListState {
  /**
   * Aria live message used to guide users through the keyboard reordering
   * process.
   */
  readonly reorderingMessage: string
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<
  ICommitListProps,
  ICommitListState
> {
  private commitsHash = memoize(makeCommitsHash, arrayEquals)
  private commitIndexBySha = memoizeOne(
    (commitSHAs: ReadonlyArray<string>) =>
      new Map(commitSHAs.map((sha, index) => [sha, index]))
  )
  private graphRowsBySHA = memoizeOne(
    (
      commitSHAs: ReadonlyArray<string>,
      commitLookup: ReadonlyMap<string, Commit>
    ): ReadonlyMap<string, ICommitGraphRow> => {
      const commits = commitSHAs.flatMap(sha => {
        const commit = commitLookup.get(sha)
        return commit === undefined ? [] : [commit]
      })
      return new Map(buildCommitGraphRows(commits).map(row => [row.sha, row]))
    }
  )

  private containerRef = React.createRef<HTMLDivElement>()
  private listRef = React.createRef<List>()

  // This function is debounced to avoid updating the aria live region too
  // frequently on every key press.
  private updateKeyboardReorderingMessage = debounce(
    (insertionIndexPath: RowIndexPath | null) => {
      const { keyboardReorderData } = this.props

      if (keyboardReorderData === undefined) {
        this.setState({ reorderingMessage: '' })
        return
      }

      const plural = keyboardReorderData.commits.length === 1 ? '' : 's'

      if (insertionIndexPath !== null) {
        const { row } = insertionIndexPath

        const insertionPoint =
          row < this.props.commitSHAs.length
            ? `before commit ${row + 1}`
            : `after commit ${row}`

        this.setState({
          reorderingMessage: `Press Enter to insert the selected commit${plural} ${insertionPoint} or Escape to cancel.`,
        })
        return
      }

      this.setState({
        reorderingMessage: `Use the Up and Down arrow keys to choose a new location for the selected commit${plural}, then press Enter to confirm or Escape to cancel.`,
      })
    },
    500
  )

  public constructor(props: ICommitListProps) {
    super(props)

    this.state = { reorderingMessage: '' }
  }

  public componentDidUpdate(prevProps: ICommitListProps) {
    if (this.props.keyboardReorderData !== prevProps.keyboardReorderData) {
      this.updateKeyboardReorderingMessage(null)
    }
  }

  private getVisibleCommits(): ReadonlyArray<Commit> {
    const commits = new Array<Commit>()
    for (const sha of this.props.commitSHAs) {
      const commitMaybe = this.props.commitLookup.get(sha)
      // this should never be undefined, but just in case
      if (commitMaybe !== undefined) {
        commits.push(commitMaybe)
      }
    }
    return commits
  }

  private isLocalCommit = (sha: string) =>
    this.props.localCommitSHAs.includes(sha)

  private renderCommit = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)

    if (commit == null) {
      if (__DEV__) {
        log.warn(
          `[CommitList]: the commit '${sha}' does not exist in the cache`
        )
      }
      return null
    }

    const isLocal = this.isLocalCommit(commit.sha)
    const unpushedTags = this.getUnpushedTags(commit)

    const showUnpushedIndicator =
      (isLocal || unpushedTags.length > 0) &&
      this.props.isLocalRepository === false
    const graphRow = this.props.showCommitGraph
      ? this.graphRowsBySHA(this.props.commitSHAs, this.props.commitLookup).get(
          commit.sha
        )
      : undefined

    return (
      <CommitListItem
        key={commit.sha}
        gitHubRepository={this.props.gitHubRepository}
        showUnpushedIndicator={showUnpushedIndicator}
        unpushedIndicatorTitle={this.getUnpushedIndicatorTitle(
          isLocal,
          unpushedTags.length
        )}
        commit={commit}
        emoji={this.props.emoji}
        isDraggable={
          this.props.isMultiCommitOperationInProgress === false &&
          !this.inKeyboardReorderMode
        }
        onSquash={this.onSquash}
        selectedCommits={this.selectedCommits}
        onRenderCommitDragElement={this.onRenderCommitDragElement}
        onRemoveDragElement={this.props.onRemoveCommitDragElement}
        disableSquashing={this.props.disableSquashing}
        accounts={this.props.accounts}
        preferAbsoluteDates={this.props.preferAbsoluteDates}
        graphRow={graphRow}
        onShowContextMenu={
          this.inKeyboardReorderMode ? undefined : this.onShowCommitContextMenu
        }
      />
    )
  }

  private get inKeyboardReorderMode() {
    return this.props.keyboardReorderData !== undefined
  }

  private getLastRetainedCommitRef(indexes: ReadonlyArray<number>) {
    const maxIndex = Math.max(...indexes)
    const lastIndex = this.props.commitSHAs.length - 1
    /* If the commit is the first commit in the branch, you cannot reference it
    using the sha */
    const lastRetainedCommitRef =
      maxIndex !== lastIndex ? `${this.props.commitSHAs[maxIndex]}^` : null
    return lastRetainedCommitRef
  }

  private onSquash = (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    isInvokedByContextMenu: boolean
  ) => {
    const indexes = [...toSquash, squashOnto].map(v =>
      this.props.commitSHAs.findIndex(sha => sha === v.sha)
    )
    this.props.onSquash?.(
      toSquash,
      squashOnto,
      this.getLastRetainedCommitRef(indexes),
      isInvokedByContextMenu
    )
  }

  private onRenderCommitDragElement = (commit: Commit) => {
    this.props.onRenderCommitDragElement?.(commit, this.selectedCommits)
  }

  private getUnpushedIndicatorTitle(
    isLocalCommit: boolean,
    numUnpushedTags: number
  ) {
    if (isLocalCommit) {
      return 'This commit has not been pushed to the remote repository'
    }

    if (numUnpushedTags > 0) {
      return `This commit has ${numUnpushedTags} tag${
        numUnpushedTags > 1 ? 's' : ''
      } to push`
    }

    return undefined
  }

  private get selectedCommits() {
    return this.lookupCommits(this.props.selectedSHAs)
  }

  private getUnpushedTags(commit: Commit) {
    const tagsToPushSet = new Set(this.props.tagsToPush ?? [])
    return commit.tags.filter(tagName => tagsToPushSet.has(tagName))
  }

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    const selectedShas = rows.map(r => this.props.commitSHAs[r])
    const selectedCommits = this.lookupCommits(selectedShas)
    this.props.onCommitsSelected?.(selectedCommits, this.isContiguous(rows))
  }

  /**
   * Accepts a sorted array of numbers in descending order. If the numbers ar
   * contiguous order, 4, 3, 2 not 5, 3, 1, returns true.
   *
   * Defined an array of 0 and 1 are considered contiguous.
   */
  private isContiguous(indexes: ReadonlyArray<number>) {
    if (indexes.length <= 1) {
      return true
    }

    const sorted = indexes.toSorted((a, b) => b - a)

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]
      if (i + 1 === sorted.length) {
        continue
      }

      if (current - 1 !== sorted[i + 1]) {
        return false
      }
    }

    return true
  }

  // This is required along with onSelectedRangeChanged in the case of a user
  // paging up/down or using arrow keys up/down.
  private onSelectedRowChanged = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit) {
      this.props.onCommitsSelected?.([commit], true)
    }
  }

  private lookupCommits(
    commitSHAs: ReadonlyArray<string>
  ): ReadonlyArray<Commit> {
    const commits: Commit[] = []
    commitSHAs.forEach(sha => {
      const commit = this.props.commitLookup.get(sha)
      if (commit === undefined) {
        log.warn(
          '[Commit List] - Unable to lookup commit from sha - This should not happen.'
        )
        return
      }
      commits.push(commit)
    })
    return commits
  }

  private onScroll = (scrollTop: number, clientHeight: number) => {
    const numberOfRows = Math.ceil(clientHeight / RowHeight)
    const top = Math.floor(scrollTop / RowHeight)
    const bottom = top + numberOfRows
    this.props.onScroll?.(top, bottom)

    // Pass new scroll value so the scroll position will be remembered (if the callback has been supplied).
    this.props.onCompareListScrolled?.(scrollTop)
  }

  private rowForSHA(sha: string) {
    return this.commitIndexBySha(this.props.commitSHAs).get(sha) ?? -1
  }

  private getRowCustomClassMap = () => {
    const { commitSHAs, shasToHighlight } = this.props
    if (shasToHighlight === undefined || shasToHighlight.length === 0) {
      return undefined
    }

    const rowsForShasNotInDiff = commitSHAs
      .filter(sha => shasToHighlight.includes(sha))
      .map(sha => this.rowForSHA(sha))

    if (rowsForShasNotInDiff.length === 0) {
      return undefined
    }

    const rowClassMap = new Map<string, ReadonlyArray<number>>()
    rowClassMap.set('highlighted', rowsForShasNotInDiff)
    return rowClassMap
  }

  private renderExpandedAuthor(user: IAvatarUser): string | JSX.Element {
    if (!user) {
      return 'Unknown user'
    }

    if (user.name) {
      return (
        <>
          <div>{user.name}</div>
          <div>{user.email}</div>
        </>
      )
    }

    return user.email
  }

  private renderRowFocusTooltip = (indexPath: RowIndexPath | undefined) => {
    if (!indexPath) {
      return null
    }
    const row = indexPath.row
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (!commit) {
      return null
    }

    const avatarUsers = getAvatarUsersForCommit(
      this.props.gitHubRepository,
      commit
    )

    const {
      author: { date },
    } = commit

    const absoluteDate = formatDate(date, {
      dateStyle: 'full',
      timeStyle: 'short',
    })

    const authorList = avatarUsers.map((user, i) => {
      return (
        <div className="author" key={i}>
          <div className="label">
            <Avatar accounts={this.props.accounts} user={user} title={null} />
          </div>
          <div>{this.renderExpandedAuthor(user)}</div>
        </div>
      )
    })

    const isLocal = this.isLocalCommit(commit.sha)
    const unpushedTags = this.getUnpushedTags(commit)

    const showUnpushedIndicator =
      (isLocal || unpushedTags.length > 0) &&
      this.props.isLocalRepository === false

    return (
      <div className="commit-list-item-tooltip list-item-tooltip">
        {authorList}
        <div>
          <div className="label">Date: </div>
          <div className="commit-tooltip-date">
            <div>{absoluteDate}</div>
            <RelativeTime
              className="commit-tooltip-relative-date"
              date={date}
              onlyRelative={true}
              tooltip={false}
            />
          </div>
        </div>
        {showUnpushedIndicator ? (
          <div>
            <div className="label">
              <span className="unpushed-indicator">
                <MaterialSymbol name="arrow_upward" />
              </span>
            </div>
            <div>
              {this.getUnpushedIndicatorTitle(isLocal, unpushedTags.length)}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  public focus() {
    this.listRef.current?.focus()
  }

  public render() {
    const {
      commitSHAs,
      selectedSHAs,
      shasToHighlight,
      emptyListMessage,
      reorderingEnabled,
      isMultiCommitOperationInProgress,
    } = this.props
    if (commitSHAs.length === 0) {
      return (
        <div className="panel blankslate">
          {emptyListMessage ?? 'No commits to list'}
        </div>
      )
    }

    const classes = classNames({
      'has-highlighted-commits':
        shasToHighlight !== undefined && shasToHighlight.length > 0,
    })

    const selectedRows = selectedSHAs
      .map(sha => this.rowForSHA(sha))
      .filter(r => r !== -1)

    return (
      <div id="commit-list" className={classes} ref={this.containerRef}>
        {this.renderReorderCommitsHint()}
        <List
          ariaLabel="Commits"
          role={this.props.isInformationalView === true ? 'list' : 'listbox'}
          ref={this.listRef}
          rowCount={commitSHAs.length}
          rowHeight={RowHeight}
          selectedRows={selectedRows}
          rowRenderer={this.renderCommit}
          onDropDataInsertion={this.onDropDataInsertion}
          onSelectionChanged={this.onSelectionChanged}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onKeyboardInsertionIndexPathChanged={
            this.onKeyboardInsertionIndexPathChanged
          }
          onCancelKeyboardInsertion={this.props.onCancelKeyboardReorder}
          onConfirmKeyboardInsertion={this.onConfirmKeyboardReorder}
          onRowContextMenu={this.onRowContextMenu}
          onRowKeyboardContextMenu={this.onRowKeyboardContextMenu}
          selectionMode="multi"
          onScroll={this.onScroll}
          keyboardInsertionData={this.props.keyboardReorderData}
          keyboardInsertionElementRenderer={this.renderKeyboardInsertionElement}
          insertionDragType={
            reorderingEnabled === true &&
            isMultiCommitOperationInProgress === false
              ? DragType.Commit
              : undefined
          }
          invalidationProps={{
            commits: this.props.commitSHAs,
            localCommitSHAs: this.props.localCommitSHAs,
            commitLookupHash: this.commitsHash(this.getVisibleCommits()),
            tagsToPush: this.props.tagsToPush,
            shasToHighlight: this.props.shasToHighlight,
            preferAbsoluteDates: this.props.preferAbsoluteDates,
          }}
          setScrollTop={this.props.compareListScrollTop}
          rowCustomClassNameMap={this.getRowCustomClassMap()}
          renderRowFocusTooltip={this.renderRowFocusTooltip}
        />
        <AriaLiveContainer message={this.state.reorderingMessage} />
      </div>
    )
  }

  private renderReorderCommitsHint = () => {
    if (!this.inKeyboardReorderMode) {
      return null
    }

    const containerWidth = this.containerRef.current?.clientWidth ?? 0
    const reorderCommitsHintTitle = __DARWIN__
      ? 'Reorder Commits'
      : 'Reorder commits'

    return (
      <Popover
        className="reorder-commits-hint-popover"
        anchor={this.containerRef.current}
        anchorOffset={PopoverScreenBorderPadding}
        anchorPosition={PopoverAnchorPosition.Top}
        isDialog={false}
        trapFocus={false}
        style={{
          width: `${containerWidth - 2 * PopoverScreenBorderPadding}px`,
        }}
      >
        <h4>{reorderCommitsHintTitle}</h4>
        <p>
          Use <KeyboardShortcut darwinKeys={['↑']} keys={['↑']} />
          <KeyboardShortcut darwinKeys={['↓']} keys={['↓']} /> to choose a new
          location.
        </p>
        <p>
          Press <KeyboardShortcut darwinKeys={['⏎']} keys={['⏎']} /> to confirm.
        </p>
      </Popover>
    )
  }

  private renderKeyboardInsertionElement = (
    data: KeyboardInsertionData
  ): JSX.Element | null => {
    const { emoji, gitHubRepository } = this.props
    const { commits } = data

    if (commits.length === 0) {
      return null
    }

    switch (data.type) {
      case DragType.Commit:
        return (
          <CommitDragElement
            gitHubRepository={gitHubRepository}
            commit={commits[0]}
            selectedCommits={commits}
            isKeyboardInsertion={true}
            emoji={emoji}
            accounts={this.props.accounts}
          />
        )
      default:
        return assertNever(data.type, `Unknown drag element type: ${data}`)
    }
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    this.showRowContextMenu(row, event)
  }

  private onRowKeyboardContextMenu = (
    row: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    this.showRowContextMenu(row, event)
  }

  private onShowCommitContextMenu = (
    commit: Commit,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const row = this.props.commitSHAs.indexOf(commit.sha)
    if (row !== -1) {
      this.showRowContextMenu(row, event)
    }
  }

  private showRowContextMenu = (
    row: number,
    event: React.SyntheticEvent<HTMLElement>
  ) => {
    if (this.inKeyboardReorderMode) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    showCommitContextMenu(row, event, this.props)
  }

  private onKeyboardInsertionIndexPathChanged = (indexPath: RowIndexPath) => {
    this.updateKeyboardReorderingMessage(indexPath)
  }

  private onConfirmKeyboardReorder = (
    indexPath: RowIndexPath,
    data: KeyboardInsertionData
  ) => {
    this.onDropDataInsertion(indexPath.row, data)
  }

  private onDropDataInsertion = (row: number, data: DragData) => {
    if (
      this.props.onDropCommitInsertion === undefined ||
      data.type !== DragType.Commit
    ) {
      return
    }

    // The base commit index will be in row - 1, because row is the position
    // where the new item should be inserted, and commits have a reverse order
    // (newer commits are in lower row values) in the list.
    const baseCommitIndex = row === 0 ? null : row - 1

    if (
      this.props.commitSHAs.length === 0 ||
      (baseCommitIndex !== null &&
        baseCommitIndex > this.props.commitSHAs.length)
    ) {
      return
    }

    const baseCommitSHA =
      baseCommitIndex === null ? null : this.props.commitSHAs[baseCommitIndex]
    const baseCommit =
      baseCommitSHA !== null ? this.props.commitLookup.get(baseCommitSHA) : null

    // Ascending by row, which both the contiguity check and the first-dropped
    // index below depend on.
    const commitIndexes = sortCommitRowIndexes(
      data.commits
        .filter((v): v is Commit => v !== null && v !== undefined)
        .map(v => this.props.commitSHAs.findIndex(sha => sha === v.sha))
    )

    if (isRedundantCommitDrop(commitIndexes, baseCommitIndex)) {
      return
    }

    const allIndexes = commitIndexes.concat(
      baseCommitIndex !== null ? [baseCommitIndex] : []
    )

    this.props.onDropCommitInsertion(
      baseCommit ?? null,
      data.commits,
      this.getLastRetainedCommitRef(allIndexes)
    )
  }
}

/**
 * Commit row indexes in ascending order.
 *
 * `Array.prototype.sort` compares as text unless it is given a comparer, so a
 * bare sort put row 10 before row 2 and made a contiguous multi-commit
 * selection spanning row ten look non-contiguous.
 */
export function sortCommitRowIndexes(
  indexes: ReadonlyArray<number>
): ReadonlyArray<number> {
  return [...indexes].sort((left, right) => left - right)
}

/**
 * Whether dropping these commits at `baseCommitIndex` would leave the list
 * exactly as it is, and can therefore be ignored.
 *
 * Getting this wrong is not cosmetic: a drop that is not recognized as
 * redundant is carried out, and carrying it out rewrites history.
 *
 * `commitIndexes` must be ascending.
 */
export function isRedundantCommitDrop(
  commitIndexes: ReadonlyArray<number>,
  baseCommitIndex: number | null
): boolean {
  const commitsAreContiguous = commitIndexes.every(
    (value, i, array) => i === array.length - 1 || value === array[i + 1] - 1
  )

  if (!commitsAreContiguous) {
    return false
  }

  const firstDroppedCommitIndex = commitIndexes[0]

  // Commits are dropped right above themselves if
  // 1. The base commit index is null (meaning, it was dropped at the top
  //    of the commit list) and the index of the first dropped commit is 0.
  // 2. The base commit index is the index right above the first dropped.
  const commitsDroppedRightAboveThemselves =
    (baseCommitIndex === null && firstDroppedCommitIndex === 0) ||
    baseCommitIndex === firstDroppedCommitIndex - 1

  // Commits are dropped within themselves if there is a base commit index
  // and it's in the list of commit indexes.
  const commitsDroppedWithinThemselves =
    baseCommitIndex !== null && commitIndexes.indexOf(baseCommitIndex) !== -1

  return commitsDroppedRightAboveThemselves || commitsDroppedWithinThemselves
}

/**
 * Makes a hash of the commit's data that will be shown in a CommitListItem
 */
function commitListItemHash(commit: Commit): string {
  return `${commit.sha} ${commit.tags}`
}

function makeCommitsHash(commits: ReadonlyArray<Commit>): string {
  return commits.map(commitListItemHash).join(' ')
}
