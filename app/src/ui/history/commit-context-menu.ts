import * as React from 'react'

import { clipboard } from 'electron'

import { getDotComAPIEndpoint } from '../../lib/api'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Commit, CommitOneLine } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import * as octicons from '../octicons/octicons.generated'

/**
 * The complete state and capability contract behind a commit-row context
 * menu. CommitList and HistoryGraphView both implement this contract so the
 * two history presentations cannot drift into different actions or enabled
 * states.
 */
export interface ICommitContextMenuProps {
  /** The GitHub repository associated with this commit, when one is known. */
  readonly gitHubRepository: GitHubRepository | null

  /** Commits in the exact order rendered by the invoking history view. */
  readonly commitSHAs: ReadonlyArray<string>
  readonly commitLookup: ReadonlyMap<string, Commit>
  readonly selectedSHAs: ReadonlyArray<string>

  /** Commits which have not yet reached a remote repository. */
  readonly localCommitSHAs: ReadonlyArray<string>

  readonly canUndoCommits?: boolean
  readonly canAmendCommits?: boolean
  readonly canResetToCommits?: boolean
  readonly tagsToPush?: ReadonlyArray<string>
  readonly disableReordering?: boolean
  readonly disableSquashing?: boolean
  readonly isMultiCommitOperationInProgress?: boolean

  readonly onUndoCommit?: (commit: Commit) => void
  readonly onResetToCommit?: (commit: Commit) => void
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onAmendCommit?: (commit: Commit, isLocalCommit: boolean) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
  readonly onCreateBranch?: (commit: CommitOneLine) => void
  readonly onCreateWorktreeFromCommit?: (commit: CommitOneLine) => void
  readonly onCheckoutCommit?: (commit: CommitOneLine) => void
  readonly onCreateTag?: (targetCommitSha: string) => void
  readonly onDeleteTag?: (tagName: string, unpushed: boolean) => void
  readonly onCherryPick?: (commits: ReadonlyArray<CommitOneLine>) => void
  readonly onKeyboardReorder?: (toReorder: ReadonlyArray<Commit>) => void
  readonly onSquash?: (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null,
    isInvokedByContextMenu: boolean
  ) => void
}

/**
 * Resolve the commits a contextual action should affect. Invoking an
 * unselected row must not act on a stale multi-selection, while invoking a
 * member of the current selection preserves that selection.
 */
export function getEffectiveCommitSelection(
  clickedCommit: Commit,
  selectedSHAs: ReadonlyArray<string>,
  commitLookup: ReadonlyMap<string, Commit>
): ReadonlyArray<Commit> {
  if (!selectedSHAs.includes(clickedCommit.sha)) {
    return [clickedCommit]
  }

  const commits = selectedSHAs
    .map(sha => commitLookup.get(sha))
    .filter((commit): commit is Commit => commit !== undefined)

  return commits.length === 0 ? [clickedCommit] : commits
}

function canCherryPick(props: ICommitContextMenuProps): boolean {
  return (
    props.onCherryPick !== undefined &&
    props.isMultiCommitOperationInProgress === false
  )
}

function canReorder(props: ICommitContextMenuProps): boolean {
  return (
    props.onKeyboardReorder !== undefined &&
    props.disableReordering === false &&
    props.isMultiCommitOperationInProgress === false
  )
}

function canSquash(props: ICommitContextMenuProps): boolean {
  return (
    props.onSquash !== undefined &&
    props.disableSquashing === false &&
    props.isMultiCommitOperationInProgress === false
  )
}

function getLastRetainedCommitRef(
  commitSHAs: ReadonlyArray<string>,
  commits: ReadonlyArray<Commit>
): string | null {
  const indexes = commits.map(commit => commitSHAs.indexOf(commit.sha))
  const maxIndex = Math.max(...indexes)
  const lastIndex = commitSHAs.length - 1

  // The first commit in the branch cannot be referenced through its parent.
  return maxIndex !== lastIndex ? `${commitSHAs[maxIndex]}^` : null
}

function squash(
  props: ICommitContextMenuProps,
  toSquash: ReadonlyArray<Commit>,
  squashOnto: Commit
) {
  props.onSquash?.(
    toSquash,
    squashOnto,
    getLastRetainedCommitRef(props.commitSHAs, [...toSquash, squashOnto]),
    true
  )
}

function getDeleteTagsMenuItem(
  props: ICommitContextMenuProps,
  commit: Commit
): IMenuItem | null {
  const { onDeleteTag } = props

  if (onDeleteTag === undefined || commit.tags.length === 0) {
    return null
  }

  const tagsToPush = new Set(props.tagsToPush ?? [])

  if (commit.tags.length === 1) {
    const tagName = commit.tags[0]
    return {
      label: `Delete tag ${tagName}`,
      action: () => onDeleteTag(tagName, tagsToPush.has(tagName)),
    }
  }

  return {
    label: 'Delete tag…',
    submenu: commit.tags.map(tagName => ({
      label: tagName,
      action: () => onDeleteTag(tagName, tagsToPush.has(tagName)),
    })),
  }
}

function getContextMenuForSingleCommit(
  props: ICommitContextMenuProps,
  row: number,
  commit: Commit
): IMenuItem[] {
  // These are commit-targeted commands. Similarly named application-menu
  // commands target the repository or HEAD instead, so borrowing their
  // accelerators would advertise shortcuts that do something else.
  const isLocal = props.localCommitSHAs.includes(commit.sha)
  const canBeUndone = props.canUndoCommits === true && row === 0
  const canBeAmended = props.canAmendCommits === true && row === 0
  // The newest commit is already checked out and cannot be reset to itself.
  const canBeResetTo = props.canResetToCommits === true && row > 0
  const canBeCheckedOut = row > 0

  let viewOnGitHubLabel = 'View on GitHub'
  if (
    props.gitHubRepository !== null &&
    props.gitHubRepository.endpoint !== getDotComAPIEndpoint()
  ) {
    viewOnGitHubLabel = 'View on GitHub Enterprise'
  }

  const items: IMenuItem[] = []

  if (canBeAmended) {
    items.push({
      label: __DARWIN__ ? 'Amend Commit…' : 'Amend commit…',
      action: () => props.onAmendCommit?.(commit, isLocal),
    })
  }

  if (canBeUndone) {
    items.push({
      label: __DARWIN__ ? 'Undo Commit…' : 'Undo commit…',
      action: () => props.onUndoCommit?.(commit),
      enabled: props.onUndoCommit !== undefined,
    })
  }

  items.push(
    {
      label: __DARWIN__ ? 'Reset to Commit…' : 'Reset to commit…',
      action: () => props.onResetToCommit?.(commit),
      enabled: canBeResetTo && props.onResetToCommit !== undefined,
    },
    {
      label: __DARWIN__ ? 'Checkout Commit' : 'Checkout commit',
      action: () => props.onCheckoutCommit?.(commit),
      enabled: canBeCheckedOut && props.onCheckoutCommit !== undefined,
    },
    {
      label: __DARWIN__ ? 'Reorder Commit' : 'Reorder commit',
      action: () => props.onKeyboardReorder?.([commit]),
      enabled: canReorder(props),
    },
    {
      label: __DARWIN__
        ? 'Revert Changes in Commit'
        : 'Revert changes in commit',
      action: () => props.onRevertCommit?.(commit),
      enabled: props.onRevertCommit !== undefined,
    },
    { type: 'separator' },
    {
      label: __DARWIN__
        ? 'Create Branch from Commit'
        : 'Create branch from commit',
      icon: octicons.gitBranch,
      action: () => props.onCreateBranch?.(commit),
      enabled: props.onCreateBranch !== undefined,
    },
    {
      label: __DARWIN__
        ? 'Create Worktree from Commit…'
        : 'Create worktree from commit…',
      icon: octicons.fileDirectory,
      action: () => props.onCreateWorktreeFromCommit?.(commit),
      enabled: props.onCreateWorktreeFromCommit !== undefined,
    },
    {
      label: 'Create Tag…',
      icon: octicons.tag,
      action: () => props.onCreateTag?.(commit.sha),
      enabled: props.onCreateTag !== undefined,
    }
  )

  const deleteTagsMenuItem = getDeleteTagsMenuItem(props, commit)
  if (deleteTagsMenuItem !== null) {
    items.push({ type: 'separator' }, deleteTagsMenuItem)
  }

  const darwinTagsLabel = commit.tags.length > 1 ? 'Copy Tags' : 'Copy Tag'
  const windowsTagsLabel = commit.tags.length > 1 ? 'Copy tags' : 'Copy tag'
  items.push(
    {
      label: __DARWIN__ ? 'Cherry-pick Commit…' : 'Cherry-pick commit…',
      action: () => props.onCherryPick?.([commit]),
      enabled: canCherryPick(props),
    },
    { type: 'separator' },
    {
      label: 'Copy SHA',
      icon: octicons.copy,
      action: () => clipboard.writeText(commit.sha),
    },
    {
      label: __DARWIN__ ? darwinTagsLabel : windowsTagsLabel,
      icon: octicons.tag,
      action: () => clipboard.writeText(commit.tags.join(' ')),
      enabled: commit.tags.length > 0,
    },
    {
      label: viewOnGitHubLabel,
      action: () => props.onViewCommitOnGitHub?.(commit.sha),
      enabled: !isLocal && props.gitHubRepository !== null,
    }
  )

  return items
}

function getContextMenuForMultipleCommits(
  props: ICommitContextMenuProps,
  commit: Commit,
  selectedCommits: ReadonlyArray<Commit>
): IMenuItem[] {
  const count = selectedCommits.length

  return [
    {
      label: __DARWIN__
        ? `Cherry-pick ${count} Commits…`
        : `Cherry-pick ${count} commits…`,
      action: () => props.onCherryPick?.(selectedCommits),
      enabled: canCherryPick(props),
    },
    {
      label: __DARWIN__
        ? `Squash ${count} Commits…`
        : `Squash ${count} commits…`,
      action: () => squash(props, selectedCommits, commit),
      enabled: canSquash(props),
    },
    {
      label: __DARWIN__
        ? `Reorder ${count} Commits…`
        : `Reorder ${count} commits…`,
      action: () => props.onKeyboardReorder?.(selectedCommits),
      enabled: canReorder(props),
    },
  ]
}

/** Build the exact action set for one rendered commit row. */
export function buildCommitContextMenuItems(
  row: number,
  props: ICommitContextMenuProps
): ReadonlyArray<IMenuItem> | null {
  const sha = props.commitSHAs[row]
  const commit = props.commitLookup.get(sha)

  if (commit === undefined) {
    if (__DEV__) {
      log.warn(
        `[CommitContextMenu]: the commit '${sha}' does not exist in the cache`
      )
    }
    return null
  }

  const selectedCommits = getEffectiveCommitSelection(
    commit,
    props.selectedSHAs,
    props.commitLookup
  )

  return selectedCommits.length > 1
    ? getContextMenuForMultipleCommits(props, commit, selectedCommits)
    : getContextMenuForSingleCommit(props, row, commit)
}

/** Open the shared commit-row menu without changing row focus or selection. */
export function showCommitContextMenu(
  row: number,
  event: React.SyntheticEvent<HTMLElement>,
  props: ICommitContextMenuProps
) {
  event.preventDefault()
  event.stopPropagation()

  const items = buildCommitContextMenuItems(row, props)
  if (items !== null) {
    showContextualMenu(items)
  }
}
