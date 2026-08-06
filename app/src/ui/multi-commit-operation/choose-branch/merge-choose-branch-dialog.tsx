import React from 'react'
import { getAheadBehind, revSymmetricDifference } from '../../../lib/git'
import { determineMergeability } from '../../../lib/git/merge-tree'
import { getBranchesNotUpdatedWithDefault } from '../../../lib/git/not-updated-with-default'
import { Branch } from '../../../models/branch'
import { ComputedAction } from '../../../models/computed-action'
import { MergeTreeResult } from '../../../models/merge'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { PopupType } from '../../../models/popup'
import { ActionStatusIcon } from '../../lib/action-status-icon'
import {
  ChooseBranchDialog,
  IBaseChooseBranchDialogProps,
  canStartOperation,
} from './base-choose-branch-dialog'
import { truncateWithEllipsis } from '../../../lib/truncate-with-ellipsis'
import { formatNumber } from '../../../lib/format-number'
import { MergeConflictPathPreview } from '../../lib/merge-conflict-path-preview'
import { createNotUpdatedWithDefaultBranchFilter } from './merge-branch-filters'

interface IMergeChooseBranchDialogState {
  readonly commitCount: number
  readonly mergeStatus: MergeTreeResult | null
  readonly selectedBranch: Branch | null
  readonly notUpdatedWithDefaultBranchNames: ReadonlySet<string>
}

export class MergeChooseBranchDialog extends React.Component<
  IBaseChooseBranchDialogProps,
  IMergeChooseBranchDialogState
> {
  private notUpdatedWithDefaultBranchRequest = 0

  public constructor(props: IBaseChooseBranchDialogProps) {
    super(props)

    this.state = {
      selectedBranch: null,
      commitCount: 0,
      mergeStatus: null,
      notUpdatedWithDefaultBranchNames: new Set(),
    }
  }

  public componentDidMount(): void {
    this.refreshNotUpdatedWithDefaultBranches()
  }

  public componentDidUpdate(prevProps: IBaseChooseBranchDialogProps): void {
    if (
      prevProps.repository.id !== this.props.repository.id ||
      this.getBranchContextKey(prevProps) !==
        this.getBranchContextKey(this.props)
    ) {
      this.refreshNotUpdatedWithDefaultBranches()
    }
  }

  public componentWillUnmount(): void {
    this.notUpdatedWithDefaultBranchRequest++
  }

  private getBranchContextKey = (props: IBaseChooseBranchDialogProps) => {
    const defaultBranch = props.defaultBranch
    const defaultBranchKey = defaultBranch
      ? `${defaultBranch.ref}:${defaultBranch.tip.sha}`
      : 'none'
    const branchKeys = props.allBranches
      .map(branch => `${branch.ref}:${branch.tip.sha}`)
      .join('|')
    return `${defaultBranchKey}|${branchKeys}`
  }

  private refreshNotUpdatedWithDefaultBranches = () => {
    const request = ++this.notUpdatedWithDefaultBranchRequest
    const { defaultBranch, allBranches, repository } = this.props

    this.setState({ notUpdatedWithDefaultBranchNames: new Set() })

    getBranchesNotUpdatedWithDefault(repository, defaultBranch, allBranches)
      .then(names => {
        if (request !== this.notUpdatedWithDefaultBranchRequest) {
          return
        }
        this.setState({ notUpdatedWithDefaultBranchNames: names })
      })
      .catch(error => {
        log.error(
          'Failed determining branches not updated with the default branch',
          error
        )
      })
  }

  private getBranchFilters = () => {
    const filter = createNotUpdatedWithDefaultBranchFilter(
      this.props.defaultBranch,
      this.state.notUpdatedWithDefaultBranchNames
    )
    return filter === null ? [] : [filter]
  }

  private start = () => {
    if (!this.canStart()) {
      return
    }

    const { selectedBranch, mergeStatus } = this.state
    const { operation, dispatcher, repository } = this.props
    if (!selectedBranch) {
      return
    }

    dispatcher.mergeBranch(
      repository,
      selectedBranch,
      mergeStatus,
      operation === MultiCommitOperationKind.Squash
    )

    dispatcher.closePopup(PopupType.MultiCommitOperation)
  }

  private canStart = (): boolean => {
    const { currentBranch } = this.props
    const { selectedBranch, commitCount, mergeStatus } = this.state

    return canStartOperation(
      selectedBranch,
      currentBranch,
      commitCount,
      mergeStatus?.kind
    )
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    if (selectedBranch === null) {
      this.setState({ selectedBranch, commitCount: 0, mergeStatus: null })
    } else {
      this.setState(
        {
          selectedBranch,
          commitCount: 0,
          mergeStatus: { kind: ComputedAction.Loading },
        },
        () => this.updateStatus(selectedBranch)
      )
    }
  }

  private getDialogTitle = () => {
    const truncatedName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )
    const squashPrefix =
      this.props.operation === MultiCommitOperationKind.Squash
        ? 'Squash and '
        : null
    return (
      <>
        {squashPrefix}Merge into <strong>{truncatedName}</strong>
      </>
    )
  }

  private updateStatus = async (branch: Branch) => {
    const { currentBranch, repository } = this.props

    const mergeStatus = await determineMergeability(
      repository,
      currentBranch,
      branch
    ).catch<MergeTreeResult>(e => {
      log.error('Failed determining mergeability', e)
      return { kind: ComputedAction.Clean }
    })

    // The user has selected a different branch since we started or the branch
    // has changed, so don't update the preview with stale data.
    //
    // We don't have to check if the state changed from underneath us if we
    // loaded the status from cache, because that means we never kicked off an
    // async operation.
    if (this.state.selectedBranch?.tip.sha !== branch.tip.sha) {
      return
    }

    // Can't go forward if the merge status is invalid, no need to check commit count
    if (mergeStatus.kind === ComputedAction.Invalid) {
      this.setState({ mergeStatus })
      return
    }

    // Commit count is used in the UI output as well as determining whether the
    // submit button is enabled
    const range = revSymmetricDifference('', branch.name)
    const aheadBehind = await getAheadBehind(repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch.tip.sha !== branch.tip.sha) {
      return
    }

    this.setState({ commitCount, mergeStatus })
  }

  private renderStatusPreviewMessage(): JSX.Element | null {
    const { mergeStatus, selectedBranch: branch } = this.state
    const { currentBranch } = this.props

    if (mergeStatus === null || branch === null) {
      return null
    }

    if (mergeStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }

    if (mergeStatus.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(
        branch,
        currentBranch,
        this.state.commitCount
      )
    }

    if (mergeStatus.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }

    return this.renderConflictedMergeMessage(
      branch,
      currentBranch,
      mergeStatus.conflictedFiles,
      mergeStatus.conflictedFilePaths
    )
  }

  private renderLoadingMergeMessage() {
    return <>Checking for ability to merge automatically...</>
  }

  private renderCleanMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number
  ) {
    if (commitCount === 0) {
      return (
        <React.Fragment>
          <strong>{currentBranch.name}</strong>
          {` `}
          is already up to date with <strong>{branch.name}</strong>
        </React.Fragment>
      )
    }

    const pluralized = commitCount === 1 ? 'commit' : 'commits'
    return (
      <React.Fragment>
        This will merge
        <strong>{` ${formatNumber(commitCount)} ${pluralized}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </React.Fragment>
    )
  }

  private renderInvalidMergeMessage() {
    return (
      <React.Fragment>
        Unable to merge unrelated histories in this repository
      </React.Fragment>
    )
  }

  private renderConflictedMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    count: number,
    paths: ReadonlyArray<string>
  ) {
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <div className="merge-conflict-preview-summary">
        <p>
          There will be
          <strong>{` ${formatNumber(count)} conflicted ${pluralized}`}</strong>
          {` when merging `}
          <strong>{branch.name}</strong>
          {` into `}
          <strong>{currentBranch.name}</strong>
        </p>
        <MergeConflictPathPreview paths={paths} />
      </div>
    )
  }

  private renderStatusPreview() {
    return (
      <>
        <ActionStatusIcon
          status={this.state.mergeStatus}
          classNamePrefix="merge-status"
        />
        <div className="merge-info" id="merge-status-preview">
          {this.renderStatusPreviewMessage()}
        </div>
      </>
    )
  }

  public render() {
    return (
      <ChooseBranchDialog
        {...this.props}
        start={this.start}
        selectedBranch={this.state.selectedBranch}
        canStartOperation={this.canStart()}
        dialogTitle={this.getDialogTitle()}
        onSelectionChanged={this.onSelectionChanged}
        customFilters={this.getBranchFilters()}
      >
        {this.renderStatusPreview()}
      </ChooseBranchDialog>
    )
  }
}
