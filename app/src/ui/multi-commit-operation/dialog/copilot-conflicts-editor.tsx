import * as React from 'react'
import { join } from 'path'

import { Repository } from '../../../models/repository'
import { WorkingDirectoryFileChange } from '../../../models/status'
import { IFileResolution } from '../../../lib/copilot-conflict-resolution'
import { getConflictStageContents } from '../../../lib/git'
import { FileList } from '../../history/file-list'
import { AppFileStatusKind, CommittedFileChange } from '../../../models/status'
import {
  AIMergeEditor,
  IAIMergeEditorFile,
  IAIMergeEditorLabels,
  IAIMergeEditorResultChange,
  IAIMergeEditorSelection,
} from '../../merge-conflicts/ai-merge-editor'

interface ICopilotConflictsEditorProps {
  readonly repository: Repository
  readonly conflictedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
  readonly ourBranch: string | undefined
  readonly theirBranch: string | undefined
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  /** Re-runs the whole-repository Copilot resolution pipeline (R14-gated). */
  readonly onResolveWithCopilot: () => void
  /**
   * Called whenever the user hand-edits the result pane for a file, with
   * the file path and its current edited text. The parent owns applying
   * these overrides when the operation continues.
   */
  readonly onEditedResultChange: (path: string, text: string) => void
  readonly editedResults: ReadonlyMap<string, string>
}

interface ICopilotConflictsEditorState {
  readonly selectedFile: CommittedFileChange | null
  readonly stageContents: {
    readonly ours: string
    readonly theirs: string
  } | null
}

/**
 * The Editor tab in the Copilot conflicts dialog — a three-pane
 * ours | result | theirs view per file, with the result pane editable by
 * hand, an "Auto-resolve with AI" action, an "Open in external merge tool"
 * action, and the AI Merge Summary (confidence + reason) when available.
 *
 * NOTE ON CONFIDENCE: the Copilot conflict-resolution pipeline
 * (`copilot-conflict-resolution.ts`) currently returns per-file
 * `reasoning` text but no numeric confidence score — the model is never
 * asked for one. Rather than fabricate a number, this view always passes
 * `{ kind: 'unavailable' }` for the summary today; the moment the pipeline
 * starts returning a real confidence value on `IFileResolution`, this is
 * the only place that needs to change to surface it.
 */
export class CopilotConflictsEditor extends React.Component<
  ICopilotConflictsEditorProps,
  ICopilotConflictsEditorState
> {
  private mounted = false
  private requestId = 0

  public constructor(props: ICopilotConflictsEditorProps) {
    super(props)
    const files = this.getCommittedFiles()
    this.state = {
      selectedFile: files.length > 0 ? files[0] : null,
      stageContents: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    if (this.state.selectedFile !== null) {
      this.loadStageContents(this.state.selectedFile.path)
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  public componentDidUpdate(prevProps: ICopilotConflictsEditorProps) {
    if (
      this.state.selectedFile !== null &&
      prevProps.copilotResolutions !== this.props.copilotResolutions
    ) {
      // Resolutions changed (e.g. after re-running Auto-resolve) — refresh.
      this.loadStageContents(this.state.selectedFile.path)
    }
  }

  private getCommittedFiles(): ReadonlyArray<CommittedFileChange> {
    return this.props.conflictedFiles.map(
      f =>
        new CommittedFileChange(
          f.path,
          { kind: AppFileStatusKind.Modified },
          'HEAD',
          'HEAD^'
        )
    )
  }

  private async loadStageContents(path: string) {
    const requestId = ++this.requestId
    this.setState({ stageContents: null })
    try {
      const contents = await getConflictStageContents(
        this.props.repository,
        path
      )
      if (this.mounted && requestId === this.requestId) {
        this.setState({ stageContents: contents })
      }
    } catch (e) {
      log.error('Failed to read conflict stage contents', e)
      if (this.mounted && requestId === this.requestId) {
        this.setState({ stageContents: { ours: '', theirs: '' } })
      }
    }
  }

  private onSelectedFileChanged = (file: CommittedFileChange) => {
    this.setState({ selectedFile: file })
    this.loadStageContents(file.path)
  }

  private onRowDoubleClick = () => {
    // No-op: double-click opens nothing extra in the editor tab.
  }

  private onResultChange = (change: IAIMergeEditorResultChange) => {
    this.props.onEditedResultChange(change.path, change.text)
  }

  private onAutoResolve = (_selection: IAIMergeEditorSelection) => {
    // Per-file re-resolution isn't supported by the pipeline yet — this
    // re-runs the same R14-gated resolution used for the whole operation.
    this.props.onResolveWithCopilot()
  }

  private onOpenExternalTool = (selection: IAIMergeEditorSelection) => {
    // Reuses the app's existing "open in external editor" launcher — there
    // is no separate external *diff/merge* tool launcher in this codebase
    // today, so the user's configured external editor stands in for it.
    const { repository, openFileInExternalEditor } = this.props
    openFileInExternalEditor(join(repository.path, selection.path))
  }

  private buildFile(path: string): IAIMergeEditorFile | null {
    const { stageContents } = this.state
    if (stageContents === null) {
      return null
    }

    const resolution = this.props.copilotResolutions?.find(r => r.path === path)
    const edited = this.props.editedResults.get(path)
    const result = edited ?? resolution?.resolvedContent ?? stageContents.ours

    return {
      id: path,
      path,
      ours: stageContents.ours,
      result,
      theirs: stageContents.theirs,
      // See the class-level NOTE ON CONFIDENCE — never fabricated.
      summary: { kind: 'unavailable' },
    }
  }

  public render() {
    const files = this.getCommittedFiles()
    const { selectedFile } = this.state

    const file =
      selectedFile !== null ? this.buildFile(selectedFile.path) : null

    const labels: IAIMergeEditorLabels = {
      editor: 'Conflict editor',
      filePath: 'File:',
      ours: this.props.ourBranch ? `Ours (${this.props.ourBranch})` : 'Ours',
      result: 'Result (editable)',
      theirs: this.props.theirBranch
        ? `Theirs (${this.props.theirBranch})`
        : 'Theirs',
      readOnly: 'Read only',
      summary: 'AI Merge Summary',
      confidence: 'Confidence',
      reason: 'Reason',
      summaryUnavailable:
        'AI confidence and reasoning are not available for this file yet.',
      formatConfidence: value => `${Math.round(value)}% confidence`,
      autoResolve: 'Auto-resolve with AI',
      policyPending: 'Waiting for AI security policy authorization…',
      policyDenied: 'AI conflict resolution was denied by security policy.',
      openExternalTool: this.props.resolvedExternalEditor
        ? `Open in ${this.props.resolvedExternalEditor}`
        : 'Open in external merge tool',
      contentTruncated: 'Content was truncated for display.',
      resultCharacterLimit: maximum =>
        `Maximum ${maximum.toLocaleString()} characters.`,
      resultTooLarge: maximum =>
        `The result exceeds ${maximum.toLocaleString()} characters and is read only here.`,
    }

    return (
      <div className="copilot-conflicts-editor-tab">
        <div className="copilot-changes-file-list">
          <FileList
            files={files}
            onSelectedFileChanged={this.onSelectedFileChanged}
            selectedFile={selectedFile}
            availableWidth={200}
            onRowDoubleClick={this.onRowDoubleClick}
          />
        </div>
        <div className="copilot-conflicts-editor-content">
          {file !== null ? (
            <AIMergeEditor
              file={file}
              policyState="allowed"
              labels={labels}
              onResultChange={this.onResultChange}
              onAutoResolve={this.onAutoResolve}
              onOpenExternalTool={this.onOpenExternalTool}
            />
          ) : (
            <div className="copilot-changes-no-diff">Loading file…</div>
          )}
        </div>
      </div>
    )
  }
}
