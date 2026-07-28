import * as React from 'react'

import { Branch, BranchType } from '../../models/branch'

import { IBranchListItem } from './group-branches'
import { BranchListItem } from './branch-list-item'
import { IMatches } from '../../lib/fuzzy-find'
import { getRelativeTimeInfoFromDate } from '../relative-time'
import { getPreferAbsoluteDates } from '../../models/formatting-preferences'
import { WorktreeEntry } from '../../models/worktree'

export function renderDefaultBranch(
  item: IBranchListItem,
  matches: IMatches,
  currentBranch: Branch | null,
  authorDate: Date | undefined,
  onDropOntoBranch?: (branchName: string) => void,
  onDropOntoCurrentBranch?: () => void,
  linkedWorktree?: WorktreeEntry
): JSX.Element {
  const branch = item.branch
  const currentBranchName = currentBranch ? currentBranch.name : null
  const isLocalOnly =
    branch.type === BranchType.Local &&
    (branch.upstream === null || branch.isGone)
  return (
    <BranchListItem
      name={branch.name}
      isPinned={item.isPinned}
      isCurrentBranch={branch.name === currentBranchName}
      isLocalOnly={isLocalOnly}
      linkedWorktreePath={linkedWorktree?.path}
      authorDate={authorDate}
      matches={matches}
      onDropOntoBranch={onDropOntoBranch}
      onDropOntoCurrentBranch={onDropOntoCurrentBranch}
    />
  )
}

export function getDefaultAriaLabelForBranch(
  item: IBranchListItem,
  authorDate: Date | undefined,
  linkedWorktree?: WorktreeEntry
): string {
  const branch = item.branch
  const localOnlySuffix =
    branch.type === BranchType.Local &&
    (branch.upstream === null || branch.isGone)
      ? ', not published'
      : ''
  const pinnedSuffix = item.isPinned ? ', pinned' : ''
  const worktreeSuffix =
    linkedWorktree === undefined
      ? ''
      : `, checked out in another worktree at ${linkedWorktree.path}`

  if (!authorDate) {
    return `${branch.name}${localOnlySuffix}${pinnedSuffix}${worktreeSuffix}`
  }

  const { relativeText, absoluteText } = getRelativeTimeInfoFromDate(
    authorDate,
    true
  )

  return `${item.branch.name}${localOnlySuffix}${pinnedSuffix}${worktreeSuffix} ${
    getPreferAbsoluteDates() ? absoluteText : relativeText
  }`
}
