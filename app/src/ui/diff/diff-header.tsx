import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { DiffLineType } from '../../models/diff/diff-line'
import { Octicon, iconForStatus } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'

interface IDiffHeaderProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Whether we should hide whitespace in diffs. */
  readonly hideWhitespaceInDiff: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void

  /**
   * The name of the branch the working directory is currently on, used to
   * render the "{status} · {branch}" subline beneath the path (spec §8.1).
   */
  readonly branchName?: string

  /**
   * Human-readable label of the user's selected external editor (e.g. "Visual
   * Studio Code"), used for the open-in-editor button's tooltip.
   */
  readonly externalEditorLabel?: string

  /** Whether an external editor is available to open the file in. */
  readonly isExternalEditorAvailable?: boolean

  /**
   * Called when the user clicks the open-in-editor button in the diff header.
   * Dispatches the same action as the "Open in external editor" repository
   * menu item. When omitted the button is not rendered.
   */
  readonly onOpenInExternalEditor?: () => void
}

/** Displays information about a file */
export class DiffHeader extends React.Component<IDiffHeaderProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <div className="diff-path-column">
          <PathLabel path={this.props.path} status={this.props.status} />
          {this.renderStatusLine(fileStatus)}
        </div>

        {this.renderLineStats()}

        {this.renderOpenInEditor()}

        {this.renderDiffOptions()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderStatusLine(fileStatus: string) {
    const { branchName } = this.props
    const subline =
      branchName !== undefined && branchName.length > 0
        ? `${fileStatus} · ${branchName}`
        : fileStatus

    return <div className="diff-status-line">{subline}</div>
  }

  /** Count added / deleted lines from the diff's hunks (spec §8.1 chips). */
  private getLineStats(): { added: number; deleted: number } | null {
    const diff = this.props.diff

    if (
      diff == null ||
      (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText)
    ) {
      return null
    }

    let added = 0
    let deleted = 0

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === DiffLineType.Add) {
          added++
        } else if (line.type === DiffLineType.Delete) {
          deleted++
        }
      }
    }

    return { added, deleted }
  }

  private renderLineStats() {
    const stats = this.getLineStats()

    if (stats === null) {
      return null
    }

    return (
      <div className="diff-line-stats" role="group" aria-label="Lines changed">
        <span className="diff-line-stat diff-line-stat-added">
          +{stats.added}
        </span>
        <span className="diff-line-stat diff-line-stat-deleted">
          {'−'}
          {stats.deleted}
        </span>
      </div>
    )
  }

  private renderOpenInEditor() {
    const { onOpenInExternalEditor, externalEditorLabel } = this.props

    if (onOpenInExternalEditor === undefined) {
      return null
    }

    const label =
      externalEditorLabel !== undefined
        ? `Open in ${externalEditorLabel}`
        : 'Open in external editor'

    return (
      <button
        className="diff-open-editor-button"
        onClick={onOpenInExternalEditor}
        disabled={this.props.isExternalEditorAvailable === false}
        aria-label={label}
      >
        <Octicon symbol={octicons.code} />
      </button>
    )
  }

  private renderDiffOptions() {
    if (this.props.diff?.kind === DiffType.Submodule) {
      return null
    }

    return (
      <DiffOptions
        isInteractiveDiff={true}
        onHideWhitespaceChangesChanged={
          this.props.onHideWhitespaceInDiffChanged
        }
        hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
        onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onDiffOptionsOpened={this.props.onDiffOptionsOpened}
      />
    )
  }
}
