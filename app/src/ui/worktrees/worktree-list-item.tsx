import * as React from 'react'
import * as Path from 'path'
import { WorktreeEntry } from '../../models/worktree'
import { shortenSHA } from '../../models/commit'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import classNames from 'classnames'
import { TooltippedContent } from '../lib/tooltipped-content'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { RelativeTime } from '../relative-time'

interface IWorktreeListItemProps {
  readonly worktree: WorktreeEntry
  readonly isCurrentWorktree: boolean
  readonly matches: IMatches
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { worktree, isCurrentWorktree, matches } = this.props
    const name = Path.basename(worktree.path)
    const icon = isCurrentWorktree ? octicons.check : octicons.fileDirectory
    const refLabel = worktree.branch
      ? worktree.branch.replace(/^refs\/heads\//, '')
      : shortenSHA(worktree.head)
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
      <div className={className}>
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
      </div>
    )
  }
}
