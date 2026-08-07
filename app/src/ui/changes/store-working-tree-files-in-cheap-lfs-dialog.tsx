import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { OperationProgressRow } from '../lib/operation-progress-row'
import { PathText } from '../lib/path-text'
import type { Dispatcher } from '../dispatcher'
import type { Repository } from '../../models/repository'
import { t } from '../../lib/i18n'
import type {
  ICheapLfsAutoPinProgress,
  ICheapLfsWorkingTreePinResult,
} from '../../lib/cheap-lfs/operations'
import type { ICheapLfsSkippedWorkingTreePath } from '../../models/popup'

interface IStoreWorkingTreeFilesInCheapLfsProps {
  readonly repository: Repository
  readonly paths: ReadonlyArray<string>
  readonly excludedPaths?: ReadonlyArray<ICheapLfsSkippedWorkingTreePath>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IStoreWorkingTreeFilesInCheapLfsState {
  readonly running: boolean
  readonly cancelRequested: boolean
  readonly progress: ICheapLfsAutoPinProgress | null
  readonly result: ICheapLfsWorkingTreePinResult | null
  readonly error: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`
}

function progressDescription(progress: ICheapLfsAutoPinProgress): string {
  const path = progress.currentPath
  const files =
    path ?? t('cheapLfs.files.many', { count: String(progress.totalFiles) })
  const percentage =
    progress.totalBytes > 0
      ? String(
          Math.min(
            100,
            Math.floor((progress.transferredBytes / progress.totalBytes) * 100)
          )
        )
      : '0'
  switch (progress.phase) {
    case 'hashing':
      return t('cheapLfs.progress.hashing', {
        files,
        percentage,
        amend: '',
      })
    case 'release':
      return t('cheapLfs.progress.release', { files, amend: '' })
    case 'uploading':
      return t('cheapLfs.progress.uploading', {
        files,
        percentage,
        amend: '',
      })
    case 'verifying':
      return t('cheapLfs.progress.verifying', { files, amend: '' })
    default:
      return t('cheapLfs.progress.preparing', { files, amend: '' })
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const sanitized = message
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '')
    .replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]+/g, '')
    .replace(
      /\b(?:authorization\s*[:=]\s*|token\s*[:=]\s*|bearer\s+)(?:bearer\s+)?\S+/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (sanitized.length === 0) {
    return t('cheapLfs.workingTree.result.unknownError')
  }
  const characters = Array.from(sanitized)
  return characters.length <= 240
    ? sanitized
    : `${characters.slice(0, 239).join('')}…`
}

/** Review-gated, cancellable batch action for raw working-tree files. */
export class StoreWorkingTreeFilesInCheapLfsDialog extends React.Component<
  IStoreWorkingTreeFilesInCheapLfsProps,
  IStoreWorkingTreeFilesInCheapLfsState
> {
  private readonly operationController = new AbortController()

  public constructor(props: IStoreWorkingTreeFilesInCheapLfsProps) {
    super(props)
    this.state = {
      running: false,
      cancelRequested: false,
      progress: null,
      result: null,
      error: null,
    }
  }

  public componentWillUnmount() {
    this.operationController.abort()
  }

  private onSubmit = () => {
    if (this.state.running || this.state.result !== null) {
      return
    }
    this.setState({ running: true, error: null })
    void this.runOperation()
  }

  private runOperation = async () => {
    try {
      const result =
        await this.props.dispatcher.storeWorkingTreeFilesInCheapLfs(
          this.props.repository,
          this.props.paths,
          this.operationController.signal,
          progress => this.setState({ progress })
        )
      this.setState({ running: false, result })
    } catch (error) {
      this.setState({
        running: false,
        error: safeErrorMessage(error),
      })
    }
  }

  private onCancelOperation = () => {
    if (!this.state.running || this.state.cancelRequested) {
      return
    }
    this.setState({ cancelRequested: true })
    this.operationController.abort()
  }

  private onDismissed = () => {
    this.operationController.abort()
    this.props.onDismissed()
  }

  private renderSelectedFiles() {
    return (
      <ul className="store-working-tree-files-in-cheap-lfs-list">
        {this.props.paths.map(path => (
          <li key={path} aria-label={path}>
            <PathText path={path} />
          </li>
        ))}
      </ul>
    )
  }

  private renderExcludedFiles() {
    const excluded = this.props.excludedPaths ?? []
    if (excluded.length === 0) {
      return null
    }
    return (
      <div className="store-working-tree-files-in-cheap-lfs-excluded">
        <p>
          {excluded.length === 1
            ? t('cheapLfs.workingTree.skipped.one')
            : t('cheapLfs.workingTree.skipped.many', {
                count: String(excluded.length),
              })}
        </p>
        <ul>
          {excluded.map(entry => (
            <li
              key={`${entry.path}:${entry.reason}`}
              aria-label={`${entry.path}: ${entry.reason}`}
            >
              <PathText path={entry.path} /> — {entry.reason}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  private renderProgress() {
    const progress = this.state.progress
    if (!this.state.running || progress === null) {
      return null
    }
    return (
      <div className="store-working-tree-files-in-cheap-lfs-progress">
        <OperationProgressRow
          label={t('cheapLfs.workingTree.progress.label')}
          description={progressDescription(progress)}
          value={progress.completedFiles}
          max={progress.totalFiles}
          valueText={t('cheapLfs.workingTree.progress.files', {
            completed: String(progress.completedFiles),
            total: String(progress.totalFiles),
          })}
          countText={t('cheapLfs.workingTree.progress.count', {
            completed: String(progress.completedFiles),
            total: String(progress.totalFiles),
          })}
          detail={`${formatBytes(progress.transferredBytes)} of ${formatBytes(
            progress.totalBytes
          )}`}
        />
        {this.state.cancelRequested && (
          <p role="status">{t('cheapLfs.workingTree.progress.canceling')}</p>
        )}
      </div>
    )
  }

  private renderResult() {
    const result = this.state.result
    if (result === null && this.state.error === null) {
      return null
    }
    if (this.state.error !== null) {
      return (
        <p className="store-working-tree-files-in-cheap-lfs-error" role="alert">
          {t('cheapLfs.workingTree.result.error', {
            error: this.state.error,
          })}
        </p>
      )
    }
    if (result === null) {
      return null
    }
    return (
      <div className="store-working-tree-files-in-cheap-lfs-result">
        <p role="status">
          {result.canceled
            ? t('cheapLfs.workingTree.result.canceled')
            : result.stored.length === 1
            ? t('cheapLfs.workingTree.result.stored.one')
            : t('cheapLfs.workingTree.result.stored.many', {
                count: String(result.stored.length),
              })}
        </p>
        {result.stored.length > 0 && (
          <>
            <p>{t('cheapLfs.workingTree.result.storedLabel')}</p>
            <ul>
              {result.stored.map(file => (
                <li key={file.relativePath} aria-label={file.relativePath}>
                  <PathText path={file.relativePath} /> (
                  {formatBytes(file.sizeInBytes)})
                </li>
              ))}
            </ul>
          </>
        )}
        {result.failures.length > 0 && (
          <>
            <p>{t('cheapLfs.workingTree.result.unchangedLabel')}</p>
            <ul>
              {result.failures.map(failure => (
                <li
                  key={failure.relativePath}
                  aria-label={`${failure.relativePath}: ${failure.message}`}
                >
                  <PathText path={failure.relativePath} /> — {failure.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  private renderFooter() {
    if (this.state.running) {
      return (
        <Button
          onClick={this.onCancelOperation}
          disabled={this.state.cancelRequested}
        >
          {this.state.cancelRequested
            ? t('cheapLfs.workingTree.canceling')
            : t('cheapLfs.cancel')}
        </Button>
      )
    }
    if (this.state.result !== null || this.state.error !== null) {
      return (
        <Button onClick={this.onDismissed}>
          {t('cheapLfs.workingTree.done')}
        </Button>
      )
    }
    return (
      <>
        <Button onClick={this.onDismissed}>{t('cheapLfs.cancel')}</Button>
        <Button
          onClick={this.onSubmit}
          disabled={this.props.paths.length === 0}
        >
          {this.props.paths.length === 1
            ? t('cheapLfs.workingTree.store.one')
            : t('cheapLfs.workingTree.store.many', {
                count: String(this.props.paths.length),
              })}
        </Button>
      </>
    )
  }

  public render() {
    const descriptionId = 'store-working-tree-files-in-cheap-lfs-description'
    return (
      <Dialog
        id="store-working-tree-files-in-cheap-lfs"
        className="store-working-tree-files-in-cheap-lfs-dialog"
        type="warning"
        role="alertdialog"
        ariaDescribedBy={descriptionId}
        title={t('cheapLfs.workingTree.title')}
        backdropDismissable={false}
        loading={this.state.running}
        onSubmit={this.onSubmit}
        onDismissed={this.onDismissed}
      >
        <DialogContent>
          <div id={descriptionId}>
            {this.state.result === null && this.state.error === null ? (
              <>
                <p>{t('cheapLfs.workingTree.reviewBody')}</p>
                <p>{t('cheapLfs.workingTree.reviewWarning')}</p>
                {this.renderSelectedFiles()}
                {this.renderExcludedFiles()}
              </>
            ) : null}
            {this.renderProgress()}
            {this.renderResult()}
          </div>
        </DialogContent>
        <DialogFooter>{this.renderFooter()}</DialogFooter>
      </Dialog>
    )
  }
}
