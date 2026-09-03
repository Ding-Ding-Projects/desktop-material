import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../../dialog'
import { DialogHeader } from '../../dialog/header'
import { Dispatcher } from '../../dispatcher'
import { Emoji } from '../../../lib/emoji'
import { Repository } from '../../../models/repository'
import { MultiCommitOperationStepKind } from '../../../models/multi-commit-operation'
import { MultiCommitOperationConflictState } from '../../../lib/app-state'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  isConflictWithMarkers,
  isManualConflict,
} from '../../../models/status'
import { getUnmergedFiles, isConflictedFile } from '../../../lib/status'
import { assertNever } from '../../../lib/fatal-error'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  IFileResolution,
  ICopilotResolutionSummary,
  ICopilotSkippedFile,
} from '../../../lib/copilot-conflict-resolution'
import { IConflictResolutionModelDisplay } from '../../../lib/copilot/conflict-resolution-model'
import { formatReasoningEffort } from '../../../lib/stores/copilot-store'
import { showContextualMenu, IMenuItem } from '../../../lib/menu-item'
import { OkCancelButtonGroup } from '../../dialog/ok-cancel-button-group'
import { Button } from '../../lib/button'
import { LocalizedText } from '../../lib/localized-text'
import { Octicon } from '../../octicons'
import { join } from 'path'
import { PathText } from '../../lib/path-text'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../../lib/context-menu'
import { openFile } from '../../lib/open-file'
import { revealInFileManager } from '../../../lib/app-shell'
import { CopilotConflictsResolutionSummary } from './copilot-conflicts-resolution-summary'
import { PopupType } from '../../../models/popup'
import { PreferencesTab } from '../../../models/preferences'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { TabBar, TabBarType } from '../../tab-bar'
import { CopilotConflictsChanges } from './copilot-conflicts-changes'
import { CopilotConflictsEditor } from './copilot-conflicts-editor'
import { getPersistedLanguageMode, translate } from '../../../lib/i18n'
import {
  canContinueAfterCopilotConflictApplication,
  ICopilotConflictApplicationResult,
  ICopilotConflictApplicationRefusal,
} from '../../../lib/copilot-conflict-application-result'

import {
  CopilotFileResolutionChoice,
  getResolutionChoiceForFile,
  resolutionChoices,
  isDeleteConflictFile,
  getDeletedSide,
  getDeleteConflictChoiceLabel,
  getOursTheirsLabels,
} from './copilot-resolution-helpers'
import { MaterialSymbol } from '../../lib/material-symbol'

interface ICopilotConflictsDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly conflictState: MultiCommitOperationConflictState
  readonly workingDirectory: WorkingDirectoryStatus
  readonly operationKind: MultiCommitOperationKind
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
  readonly copilotResolutionSummary: ICopilotResolutionSummary | null
  readonly copilotSkippedFiles: ReadonlyArray<ICopilotSkippedFile> | null
  readonly model: IConflictResolutionModelDisplay
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  readonly onContinueAfterConflicts: () => Promise<void>
  readonly onAbort: () => Promise<void>
  readonly onDismissed: () => void
  /** Re-runs the (R14-gated) Copilot conflict resolution pipeline. */
  readonly onResolveWithCopilot: () => void
  /** Main-process guarded application callback, supplied by the safety lane. */
  readonly applyCopilotConflictResolutions?: () => Promise<ICopilotConflictApplicationResult>
  /** Main-process guarded callback for editor-produced file contents. */
  readonly applyEditedConflictResults?: (
    editedResults: ReadonlyMap<string, string>
  ) => Promise<ICopilotConflictApplicationResult>
  readonly emoji: Map<string, Emoji>
}

enum CopilotConflictsTab {
  Summary,
  Changes,
  Editor,
}

interface ICopilotConflictsDialogState {
  readonly isContinuing: boolean
  readonly selectedTab: CopilotConflictsTab
  /**
   * Hand-edited result content, keyed by file path, from the Editor tab's
   * editable result pane. Written to disk (overriding the Copilot
   * resolution for that file) when the user continues the operation.
   */
  readonly editedResults: ReadonlyMap<string, string>
  readonly applicationRefusals: ReadonlyArray<ICopilotConflictApplicationRefusal>
  readonly freshWorkingDirectory: WorkingDirectoryStatus | null
}

const CopilotConflictsDialogTitleId = 'Dialog_Copilot_Conflicts'

/**
 * Dialog shown after Copilot has resolved conflicts.
 *
 * Displays the list of conflicted files with Copilot resolution indicators,
 * per-file reasoning, and resolution choice dropdowns. Allows the user to
 * continue the operation or go back to manual resolution.
 */
export class CopilotConflictsDialog extends React.Component<
  ICopilotConflictsDialogProps,
  ICopilotConflictsDialogState
> {
  private readonly dropdownHandlers = new Map<string, () => void>()
  private readonly overflowHandlers = new Map<string, () => void>()
  private readonly skippedDropdownHandlers = new Map<string, () => void>()

  public constructor(props: ICopilotConflictsDialogProps) {
    super(props)
    this.state = {
      isContinuing: false,
      selectedTab: CopilotConflictsTab.Summary,
      editedResults: new Map(),
      applicationRefusals: [],
      freshWorkingDirectory: null,
    }
  }

  private onBackToManual = () => {
    const { dispatcher, repository, conflictState } = this.props

    dispatcher.setMultiCommitOperationStepWithCopilotResolution(
      repository,
      {
        kind: MultiCommitOperationStepKind.ShowConflicts,
        conflictState,
      },
      false
    )
  }

  private onOpenCopilotSettings = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Copilot,
    })
  }

  private onContinue = async () => {
    this.setState({ isContinuing: true })
    try {
      // Write Copilot resolutions to disk before continuing the operation.
      // Done here (shared) so it works for merge, rebase, and cherry-pick.
      const applicationResult = this.props.applyCopilotConflictResolutions
        ? await this.props.applyCopilotConflictResolutions()
        : undefined
      if (applicationResult === undefined) {
        throw new Error(
          translate(
            'copilotConflict.editedResultsAuthorityUnavailable',
            getPersistedLanguageMode()
          )
        )
      }
      this.setState({
        applicationRefusals: applicationResult.refused,
        freshWorkingDirectory: applicationResult.freshWorkingDirectory,
      })
      if (!canContinueAfterCopilotConflictApplication(applicationResult)) {
        this.setState({ isContinuing: false })
        return
      }
      await this.applyEditedResults()
      await this.props.onContinueAfterConflicts()
    } catch (e) {
      this.setState({ isContinuing: false })
      throw e
    }
  }

  private async applyEditedResults(): Promise<void> {
    const { editedResults } = this.state
    if (editedResults.size === 0) {
      return
    }

    if (this.props.applyEditedConflictResults === undefined) {
      throw new Error(
        translate(
          'copilotConflict.editedResultsAuthorityUnavailable',
          getPersistedLanguageMode()
        )
      )
    }
    const result = await this.props.applyEditedConflictResults(editedResults)
    this.setState({
      applicationRefusals: result.refused,
      freshWorkingDirectory: result.freshWorkingDirectory,
    })
    if (!canContinueAfterCopilotConflictApplication(result)) {
      throw new Error(
        translate(
          'copilotConflict.editedResultsNotApplied',
          getPersistedLanguageMode()
        )
      )
    }
  }

  private onEditedResultChange = (path: string, text: string) => {
    this.setState(prev => {
      const next = new Map(prev.editedResults)
      next.set(path, text)
      return { editedResults: next }
    })
  }

  private onAbort = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    await this.props.onAbort()
  }

  private getResolutionForFile(path: string): CopilotFileResolutionChoice {
    return getResolutionChoiceForFile(
      path,
      this.props.conflictState.manualResolutions
    )
  }

  private onResolutionDropdownClick = (path: string) => {
    const currentChoice = this.getResolutionForFile(path)
    const { ourBranch, theirBranch } = this.props.conflictState
    const fileStatus = this.getConflictedFileStatus(path)
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      fileStatus,
      ourBranch,
      theirBranch
    )

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: "Use Copilot's suggestion",
        type: 'checkbox',
        checked: currentChoice === 'copilot',
        action: () => this.setResolution(path, 'copilot'),
      },
      {
        label: oursLabel,
        type: 'checkbox',
        checked: currentChoice === 'ours',
        action: () => this.setResolution(path, 'ours'),
      },
      {
        label: theirsLabel,
        type: 'checkbox',
        checked: currentChoice === 'theirs',
        action: () => this.setResolution(path, 'theirs'),
      },
    ]

    showContextualMenu(items)
  }

  private setResolution(
    path: string,
    choice: CopilotFileResolutionChoice
  ): void {
    const { dispatcher, repository } = this.props

    if (choice === 'copilot') {
      dispatcher.updateManualConflictResolution(repository, path, null)
    } else if (choice === 'ours') {
      dispatcher.updateManualConflictResolution(
        repository,
        path,
        ManualConflictResolution.ours
      )
    } else {
      dispatcher.updateManualConflictResolution(
        repository,
        path,
        ManualConflictResolution.theirs
      )
    }
  }

  private onOverflowMenuClick = (path: string) => {
    const { repository, dispatcher, resolvedExternalEditor } = this.props
    const absolutePath = join(repository.path, path)

    const items: IMenuItem[] = []

    if (resolvedExternalEditor !== null) {
      items.push({
        label: `Open in ${resolvedExternalEditor}`,
        action: () => this.props.openFileInExternalEditor(absolutePath),
      })
    }

    items.push(
      {
        label: OpenWithDefaultProgramLabel,
        action: () => openFile(absolutePath, dispatcher),
      },
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(repository, path),
      }
    )

    showContextualMenu(items)
  }

  private getResolutionDropdownClickHandler(path: string): () => void {
    let handler = this.dropdownHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onResolutionDropdownClick(path)
      this.dropdownHandlers.set(path, handler)
    }
    return handler
  }

  private getOverflowMenuClickHandler(path: string): () => void {
    let handler = this.overflowHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onOverflowMenuClick(path)
      this.overflowHandlers.set(path, handler)
    }
    return handler
  }

  private getResolutionForPath(path: string): IFileResolution | undefined {
    return this.props.copilotResolutions?.find(r => r.path === path)
  }

  private getConflictedFileStatus(path: string) {
    const file = this.currentWorkingDirectory.files.find(f => f.path === path)
    if (file === undefined || !isConflictedFile(file.status)) {
      return undefined
    }
    return file.status
  }

  private get skippedFiles(): ReadonlyArray<ICopilotSkippedFile> {
    return this.props.copilotSkippedFiles ?? []
  }

  private get skippedPaths(): ReadonlySet<string> {
    return new Set(this.skippedFiles.map(file => file.path))
  }

  private getSkippedFileChoice(path: string): 'ours' | 'theirs' | undefined {
    const manual = this.props.conflictState.manualResolutions.get(path)
    if (manual === ManualConflictResolution.ours) {
      return 'ours'
    }
    if (manual === ManualConflictResolution.theirs) {
      return 'theirs'
    }
    return undefined
  }

  private isSkippedFileResolved(path: string): boolean {
    if (this.getSkippedFileChoice(path) !== undefined) {
      return true
    }
    const file = this.currentWorkingDirectory.files.find(f => f.path === path)
    if (file === undefined || !isConflictedFile(file.status)) {
      return true
    }
    return this.isFileResolvedExternally(file)
  }

  private hasUnresolvedSkippedFiles(): boolean {
    return this.skippedFiles.some(
      file => !this.isSkippedFileResolved(file.path)
    )
  }

  private onSkippedResolutionDropdownClick = (path: string) => {
    const { ourBranch, theirBranch } = this.props.conflictState
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      this.getConflictedFileStatus(path),
      ourBranch,
      theirBranch
    )
    const currentChoice = this.getSkippedFileChoice(path)
    showContextualMenu([
      {
        label: oursLabel,
        type: 'checkbox',
        checked: currentChoice === 'ours',
        action: () => this.setResolution(path, 'ours'),
      },
      {
        label: theirsLabel,
        type: 'checkbox',
        checked: currentChoice === 'theirs',
        action: () => this.setResolution(path, 'theirs'),
      },
    ])
  }

  private get currentWorkingDirectory(): WorkingDirectoryStatus {
    return this.state.freshWorkingDirectory ?? this.props.workingDirectory
  }

  private getSkippedDropdownClickHandler(path: string): () => void {
    let handler = this.skippedDropdownHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onSkippedResolutionDropdownClick(path)
      this.skippedDropdownHandlers.set(path, handler)
    }
    return handler
  }

  private isFileResolvedExternally(file: WorkingDirectoryFileChange): boolean {
    if (!isConflictedFile(file.status)) {
      return false
    }
    if (isConflictWithMarkers(file.status)) {
      return file.status.conflictMarkerCount === 0
    }
    return false
  }

  private renderResolvedExternally(
    file: WorkingDirectoryFileChange
  ): JSX.Element {
    return (
      <li key={file.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={file.path} />
          <span className="copilot-file-explanation resolved-text">
            No conflicts remaining
          </span>
        </div>
        <div className="green-circle">
          <MaterialSymbol name="check" />
        </div>
      </li>
    )
  }

  private renderConflictedFile(file: WorkingDirectoryFileChange): JSX.Element {
    const resolution = this.getResolutionForPath(file.path)
    const choice = this.getResolutionForFile(file.path)
    const reasoning = resolution?.reasoning
    const fileStatus = isConflictedFile(file.status) ? file.status : undefined
    const isDeleteConflict =
      fileStatus !== undefined && isDeleteConflictFile(fileStatus)

    let choiceLabel: string
    let choiceIcon: typeof octicons.copilot
    if (isDeleteConflict && isManualConflict(fileStatus)) {
      choiceLabel = getDeleteConflictChoiceLabel(choice, fileStatus)
      choiceIcon =
        choice === 'copilot' ? octicons.copilot : resolutionChoices[choice].icon
    } else {
      choiceLabel = resolutionChoices[choice].label
      choiceIcon = resolutionChoices[choice].icon
    }

    let reasoningText: string | undefined
    if (choice === 'copilot' && reasoning) {
      reasoningText = reasoning
    } else if (isDeleteConflict && isManualConflict(fileStatus)) {
      const deletedSide = getDeletedSide(fileStatus)
      if (deletedSide === 'ours') {
        reasoningText =
          choice === 'ours' ? 'Deleting file' : 'Keeping modified file'
      } else if (deletedSide === 'theirs') {
        reasoningText =
          choice === 'theirs' ? 'Deleting file' : 'Keeping modified file'
      }
    } else if (choice === 'ours') {
      reasoningText = `Using changes from ${
        this.props.conflictState.ourBranch ?? 'current branch'
      }`
    } else if (choice === 'theirs') {
      reasoningText = `Using changes from ${
        this.props.conflictState.theirBranch ?? 'incoming branch'
      }`
    }

    const onDropdownClick = this.getResolutionDropdownClickHandler(file.path)
    const onOverflowClick = this.getOverflowMenuClickHandler(file.path)

    return (
      <li key={file.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={file.path} />
          {reasoningText !== undefined && (
            <span className="copilot-file-explanation">{reasoningText}</span>
          )}
        </div>
        <div className="copilot-file-actions">
          <Button
            className="copilot-resolution-dropdown"
            onClick={onDropdownClick}
            disabled={this.state.isContinuing}
          >
            <Octicon symbol={choiceIcon} />
            {choiceLabel}
            <MaterialSymbol name="arrow_drop_down" />
          </Button>
          <Button
            className="copilot-overflow-menu"
            onClick={onOverflowClick}
            disabled={this.state.isContinuing}
            ariaLabel="File options"
          >
            <MaterialSymbol name="more_horiz" />
          </Button>
        </div>
      </li>
    )
  }

  private renderResolutionSummary(): JSX.Element | null {
    const { copilotResolutionSummary, operationKind, repository, emoji } =
      this.props
    if (copilotResolutionSummary === null) {
      return null
    }
    return (
      <CopilotConflictsResolutionSummary
        summary={copilotResolutionSummary}
        operationKind={operationKind}
        emoji={emoji}
        gitHubRepository={repository.gitHubRepository}
        onMarkdownLinkClicked={this.onMarkdownLinkClicked}
      />
    )
  }

  private onMarkdownLinkClicked = (url: string): void => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderFileList(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    const skippedPaths = this.skippedPaths
    const conflictedFiles = files.filter(
      f => isConflictedFile(f.status) && !skippedPaths.has(f.path)
    )

    return (
      <>
        <h2 className="copilot-conflicts-file-heading">
          <MaterialSymbol name="code" />
          {conflictedFiles.length} Conflicted files
        </h2>
        <ul className="copilot-conflicts-file-list">
          {conflictedFiles.map(file =>
            this.isFileResolvedExternally(file)
              ? this.renderResolvedExternally(file)
              : this.renderConflictedFile(file)
          )}
        </ul>
      </>
    )
  }

  private renderResolvedFileRow(path: string): JSX.Element {
    return (
      <li key={path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={path} />
          <span className="copilot-file-explanation resolved-text">
            No conflicts remaining
          </span>
        </div>
        <div className="green-circle">
          <Octicon symbol={octicons.check} />
        </div>
      </li>
    )
  }

  private renderSkippedFile(skipped: ICopilotSkippedFile): JSX.Element {
    const file = this.currentWorkingDirectory.files.find(
      candidate => candidate.path === skipped.path
    )
    if (
      file === undefined ||
      !isConflictedFile(file.status) ||
      this.isFileResolvedExternally(file)
    ) {
      return this.renderResolvedFileRow(skipped.path)
    }

    const { ourBranch, theirBranch } = this.props.conflictState
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      this.getConflictedFileStatus(skipped.path),
      ourBranch,
      theirBranch
    )
    const choice = this.getSkippedFileChoice(skipped.path)
    const choiceLabel =
      choice === 'ours'
        ? oursLabel
        : choice === 'theirs'
        ? theirsLabel
        : 'Choose a resolution'

    return (
      <li key={skipped.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={skipped.path} />
          <span className="copilot-file-explanation">{skipped.reason}</span>
        </div>
        <div className="copilot-file-actions">
          <Button
            className="copilot-resolution-dropdown"
            onClick={this.getSkippedDropdownClickHandler(skipped.path)}
            disabled={this.state.isContinuing}
            ariaLabel="Choose a resolution for this file"
          >
            <Octicon
              symbol={choice === undefined ? octicons.alert : octicons.check}
            />
            {choiceLabel}
            <Octicon symbol={octicons.triangleDown} />
          </Button>
          <Button
            className="copilot-overflow-menu"
            onClick={this.getOverflowMenuClickHandler(skipped.path)}
            disabled={this.state.isContinuing}
            ariaLabel="File options"
          >
            <Octicon symbol={octicons.kebabHorizontal} />
          </Button>
        </div>
      </li>
    )
  }

  private renderSkippedFileList(): JSX.Element | null {
    if (this.skippedFiles.length === 0) {
      return null
    }
    return (
      <>
        <h2 className="copilot-conflicts-file-heading copilot-conflicts-skipped-heading">
          <Octicon symbol={octicons.alert} />
          <LocalizedText
            translationKey="copilotConflict.skippedHeading"
            variables={{ count: `${this.skippedFiles.length}` }}
          />
        </h2>
        <ul className="copilot-conflicts-file-list">
          {this.skippedFiles.map(file => this.renderSkippedFile(file))}
        </ul>
      </>
    )
  }

  private renderApplicationRefusalList(): JSX.Element | null {
    if (this.state.applicationRefusals.length === 0) {
      return null
    }
    return (
      <>
        <h2 className="copilot-conflicts-file-heading">
          <Octicon symbol={octicons.alert} />
          <LocalizedText translationKey="copilotConflict.resolutionNotApplied" />
        </h2>
        <ul className="copilot-conflicts-file-list">
          {this.state.applicationRefusals.map(refusal => (
            <li key={refusal.path} className="copilot-conflicts-file-item">
              <div className="copilot-file-details">
                <PathText path={refusal.path} />
                <span className="copilot-file-explanation">
                  {refusal.reason}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  private onTabSelected = (index: CopilotConflictsTab) => {
    this.setState({ selectedTab: index })
  }

  private renderSummaryContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    return (
      <div className="copilot-conflicts-summary-content">
        {this.renderResolutionSummary()}
        {this.renderFileList(unmergedFiles)}
        {this.renderSkippedFileList()}
        {this.renderApplicationRefusalList()}
      </div>
    )
  }

  private renderTabContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    switch (this.state.selectedTab) {
      case CopilotConflictsTab.Changes: {
        const conflictedFiles = unmergedFiles.filter(f =>
          isConflictedFile(f.status)
        )
        return (
          <CopilotConflictsChanges
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            conflictedFiles={conflictedFiles}
            copilotResolutions={this.props.copilotResolutions}
            manualResolutions={this.props.conflictState.manualResolutions}
            ourBranch={this.props.conflictState.ourBranch}
            theirBranch={this.props.conflictState.theirBranch}
            onResolutionDropdownClick={this.onResolutionDropdownClick}
          />
        )
      }
      case CopilotConflictsTab.Summary:
        return this.renderSummaryContent(unmergedFiles)
      case CopilotConflictsTab.Editor: {
        const conflictedFiles = unmergedFiles.filter(f =>
          isConflictedFile(f.status)
        )
        return (
          <CopilotConflictsEditor
            repository={this.props.repository}
            conflictedFiles={conflictedFiles}
            copilotResolutions={this.props.copilotResolutions}
            ourBranch={this.props.conflictState.ourBranch}
            theirBranch={this.props.conflictState.theirBranch}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            onResolveWithCopilot={this.props.onResolveWithCopilot}
            onEditedResultChange={this.onEditedResultChange}
            editedResults={this.state.editedResults}
          />
        )
      }
      default:
        return assertNever(
          this.state.selectedTab,
          `Unknown tab: ${this.state.selectedTab}`
        )
    }
  }

  public render() {
    const { operationKind, model } = this.props
    const { isContinuing, selectedTab } = this.state

    const unmergedFiles = getUnmergedFiles(this.currentWorkingDirectory)
    const operation = __DARWIN__ ? operationKind : operationKind.toLowerCase()
    const hasUnresolvedSkippedFiles = this.hasUnresolvedSkippedFiles()

    const modelLabel =
      model.reasoningEffort !== undefined
        ? `${model.modelName} · ${formatReasoningEffort(model.reasoningEffort)}`
        : model.modelName

    return (
      <Dialog
        id="copilot-conflicts-dialog"
        titleId={CopilotConflictsDialogTitleId}
        dismissDisabled={isContinuing}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
        loading={isContinuing}
        disabled={isContinuing}
      >
        <DialogHeader
          title={`Resolve conflicts before ${operationKind}`}
          titleId={CopilotConflictsDialogTitleId}
          showCloseButton={!isContinuing}
          onCloseButtonClick={this.props.onDismissed}
          loading={isContinuing}
        >
          <div className="copilot-conflicts-dialog-model-row">
            <span className="copilot-conflicts-dialog-model">{modelLabel}</span>
            <Button
              className="copilot-conflicts-dialog-settings-button"
              tooltip="Configure Copilot in app settings"
              ariaLabel="Configure Copilot in app settings"
              onClick={this.onOpenCopilotSettings}
            >
              <MaterialSymbol name="tune" />
            </Button>
          </div>
        </DialogHeader>
        <DialogContent>
          <TabBar
            selectedIndex={selectedTab}
            onTabClicked={this.onTabSelected}
            type={TabBarType.Tabs}
          >
            <span>Summary</span>
            <span>Changes</span>
            <span>Editor</span>
          </TabBar>
          {this.renderTabContent(unmergedFiles)}
        </DialogContent>
        <DialogFooter>
          <div className="copilot-conflicts-footer">
            <Button onClick={this.onBackToManual} disabled={isContinuing}>
              Switch to manual
            </Button>
            <OkCancelButtonGroup
              okButtonText={`Continue ${operation}`}
              okButtonDisabled={hasUnresolvedSkippedFiles || isContinuing}
              okButtonTitle={
                hasUnresolvedSkippedFiles
                  ? translate(
                      'copilotConflict.continueBlocked',
                      getPersistedLanguageMode()
                    )
                  : undefined
              }
              cancelButtonText={`Abort ${operation}`}
              onCancelButtonClick={this.onAbort}
              cancelButtonDisabled={isContinuing}
            />
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
