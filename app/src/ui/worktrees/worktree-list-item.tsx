import * as React from 'react'
import { Branch } from '../../models/branch'
import {
  getWorktreeDescription,
  getWorktreeDisplayName,
  WorktreeEntry,
} from '../../models/worktree'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import classNames from 'classnames'
import { TooltippedContent } from '../lib/tooltipped-content'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { RelativeTime } from '../relative-time'
import { Button } from '../lib/button'
import { appearanceLockTargetProps } from '../appearance'

interface IWorktreeListItemProps {
  readonly worktree: WorktreeEntry
  readonly isCurrentWorktree: boolean
  readonly matches: IMatches
  readonly mergeBranch?: Branch
  readonly onMergeWorktree?: (branch: Branch) => void
  readonly appearanceId?: string
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  private onMergeWorktree = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const { mergeBranch, onMergeWorktree } = this.props
    if (mergeBranch !== undefined && onMergeWorktree !== undefined) {
      onMergeWorktree(mergeBranch)
    }
  }

  public render() {
    const {
      worktree,
      isCurrentWorktree,
      matches,
      mergeBranch,
      onMergeWorktree,
    } = this.props
    const name = getWorktreeDisplayName(worktree)
    const appearanceProps =
      this.props.appearanceId === undefined
        ? {}
        : {
            ...appearanceLockTargetProps(`feature:${this.props.appearanceId}`),
            'data-dm-feature': this.props.appearanceId,
            'data-dm-feature-id': this.props.appearanceId,
            'data-worktree-appearance-id': this.props.appearanceId,
            'data-md3-element-label': `Worktree ${name}`,
          }
    const icon = isCurrentWorktree ? octicons.check : octicons.fileDirectory
    const refLabel = getWorktreeDescription(worktree)
    const stateLabels = [
      worktree.dirtyFileCount === null ? 'status unavailable' : null,
      worktree.dirtyFileCount && worktree.dirtyFileCount > 0
        ? `${worktree.dirtyFileCount} uncommitted`
        : null,
      worktree.isLocked ? 'locked' : null,
      worktree.isPrunable ? 'missing' : null,
    ].filter((label): label is string => label !== null)
    const description =
      stateLabels.length === 0
        ? refLabel
        : `${refLabel} · ${stateLabels.join(' · ')}`
    const className = classNames('worktrees-list-item', {
      'current-worktree': isCurrentWorktree,
      'dirty-worktree': (worktree.dirtyFileCount ?? 0) > 0,
    })

    return (
      <div className={className} {...appearanceProps}>
        <Octicon className="icon" symbol={icon} />
        <TooltippedContent
          className="name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="div"
          disabled={enableAccessibleListToolTips()}
        >
          <HighlightText text={name} highlight={matches.title} />
        </TooltippedContent>
        <div className="description">
          <TooltippedContent
            className="ref-label"
            tooltip={description}
            onlyWhenOverflowed={true}
            tagName="div"
            disabled={enableAccessibleListToolTips()}
          >
            {description}
          </TooltippedContent>
          {worktree.createdAt !== undefined && (
            <RelativeTime
              className="creation-age"
              date={new Date(worktree.createdAt)}
              onlyRelative={true}
              tooltip={true}
            />
          )}
        </div>
        {mergeBranch !== undefined && onMergeWorktree !== undefined && (
          <Button
            className="merge-worktree-button"
            size="small"
            tooltip={`Merge ${mergeBranch.name} into the current branch`}
            onClick={this.onMergeWorktree}
          >
            Merge worktree
          </Button>
        )}
      </div>
    )
  }
}
