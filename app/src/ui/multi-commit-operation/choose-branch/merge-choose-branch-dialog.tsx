import React from 'react'
import { getAheadBehind, revSymmetricDifference } from '../../../lib/git'
import { determineMergeability } from '../../../lib/git/merge-tree'
    const { selectedBranch, commitCount, mergeStatus, mergeStatusKnown } =
      this.state    const { currentBranch, defaultBranch } = this.props

    if (
      selectedBranch === null ||
      mergeStatus?.kind !== ComputedAction.Clean ||
      !(
        selectedBranch.type === BranchType.Remote &&
        selectedBranch.nameWithoutRemote === currentBranch.nameWithoutRemote
      ) &&      selectedBranch.nameWithoutRemote !== defaultBranch?.nameWithoutRemote
    )
  }

  private deleteSelectedBranch = () => {
    const { selectedBranch } = this.state
    const { dispatcher, repository } = this.props

    if (selectedBranch === null || !this.canDeleteSelectedBranch()) {
      return
    }

    this.props.onDismissed()

    if (selectedBranch.type === BranchType.Remote) {
      dispatcher.showPopup({
        type: PopupType.DeleteRemoteBranch,
        repository,
        branch: selectedBranch,
      expectedSha: selectedBranch.tip.sha,      existsOnRemote:
        selectedBranch.upstreamRemoteName !== null &&
        selectedBranch.isGone !== true,
    })
  }

  private renderDeleteBranchButton = () => {
    if (!this.canDeleteSelectedBranch()) {
      return null
    }

    return (
      <Button
        className="destructive"
        dataVerification="merge-delete-branch"
        onClick={this.deleteSelectedBranch}
        ariaLabel="Delete branch"
        tooltip="Delete the selected branch"
      >
        Delete branch
      </Button>
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
        renderAdditionalActions={this.renderDeleteBranchButton}
      >
        {this.renderStatusPreview()}
      </ChooseBranchDialog>
    )
  }
}
