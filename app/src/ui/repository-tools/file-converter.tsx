import * as React from 'react'
import { Button } from '../lib/button'
import { webUtils } from 'electron'
import {
  showOpenDialogMultiple,
  inspectFileConverterSource,
  expandFileConverterDrop,
  convertFileConverterBinaryEncoding,
} from '../main-process-proxy'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  IBinaryEncodingResult,
  IDropPlan,
  IDropSkip,
} from '../../lib/file-converter-drop'
import { t } from '../../lib/i18n'
import {
  FileConverterAdapterRegistry,
  FileConverterCategories,
  IFileConverterQueueItem,
  IFileConverterQueueState,
  IFileSignatureInspection,
  createEmptyFileConverterQueueState,
  readFileConverterQueueState,
  writeFileConverterQueueState,
} from '../../lib/file-converter'
import { MaterialSymbol } from '../lib/material-symbol'

interface IFileConverterProps {
  /** Injectable seams keep file selection and byte inspection out of the UI. */
  readonly chooseSources?: () => Promise<ReadonlyArray<string>>
  readonly inspectSource?: (path: string) => Promise<IFileSignatureInspection>
  /** Resolve a dropped File to its path on disk. */
  readonly pathForFile?: (file: File) => string
  readonly expandDrop?: (
    paths: ReadonlyArray<string>,
    includeSubfolders: boolean
  ) => Promise<IDropPlan>
  readonly convertBinaryEncoding?: (
    sourcePath: string
  ) => Promise<IBinaryEncodingResult>
}

type QuickConversionStatus = 'waiting' | 'working' | 'done' | 'failed'

interface IQuickConversion {
  readonly path: string
  readonly status: QuickConversionStatus
  readonly detail: string
}

interface IFileConverterState {
  readonly queue: IFileConverterQueueState
  readonly loading: boolean
  readonly error: string | null
  readonly persistenceWarning: string | null
  readonly dropActive: boolean
  readonly includeSubfolders: boolean
  readonly quickRunning: boolean
  readonly quickConversions: ReadonlyArray<IQuickConversion>
  readonly quickSkipped: ReadonlyArray<IDropSkip>
  readonly quickTruncated: boolean
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

const defaultChooseSources = () =>
  showOpenDialogMultiple({
    title: 'Choose local files to convert',
    properties: ['openFile'],
  })

/**
 * The Repository tools converter surface is deliberately an adapter catalog and
 * a durable queue, not a generic faux converter. An operation becomes enabled
 * only when a packaged offline adapter proves it can run.
 */
export class FileConverter extends React.Component<
  IFileConverterProps,
  IFileConverterState
> {
  public constructor(props: IFileConverterProps) {
    super(props)
    this.state = {
      queue: this.readQueue(),
      loading: false,
      error: null,
      persistenceWarning: null,
      dropActive: false,
      includeSubfolders: true,
      quickRunning: false,
      quickConversions: [],
      quickSkipped: [],
      quickTruncated: false,
    }
  }

  private get pathForFile() {
    return this.props.pathForFile ?? webUtils.getPathForFile
  }

  private get expandDrop() {
    return this.props.expandDrop ?? expandFileConverterDrop
  }

  private get convertBinaryEncoding() {
    return (
      this.props.convertBinaryEncoding ?? convertFileConverterBinaryEncoding
    )
  }

  private onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    // Claim the drop so the window does not treat the folder as a repository.
    event.preventDefault()
    event.stopPropagation()
    if (!this.state.dropActive) {
      this.setState({ dropActive: true })
    }
  }

  private onDragLeave = () => {
    this.setState({ dropActive: false })
  }

  private onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    this.setState({ dropActive: false })
    const paths = Array.from(event.dataTransfer.files, this.pathForFile).filter(
      path => path.length > 0
    )
    void this.quickConvert(paths)
  }

  private onChooseQuickSources = async () => {
    try {
      void this.quickConvert(await this.chooseSources())
    } catch (error) {
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to choose files to convert.',
      })
    }
  }

  private onIncludeSubfoldersChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ includeSubfolders: event.currentTarget.checked })
  }

  private setQuickConversion(index: number, patch: Partial<IQuickConversion>) {
    this.setState(state => ({
      quickConversions: state.quickConversions.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }))
  }

  /**
   * Convert dropped files and folders one after another. Each result is
   * written beside its original; one failure never stops the rest.
   */
  private quickConvert = async (paths: ReadonlyArray<string>) => {
    if (paths.length === 0 || this.state.quickRunning) {
      return
    }
    this.setState({ quickRunning: true, error: null })
    try {
      const plan = await this.expandDrop(paths, this.state.includeSubfolders)
      this.setState({
        quickConversions: plan.files.map(path => ({
          path,
          status: 'waiting' as const,
          detail: 'Waiting',
        })),
        quickSkipped: plan.skipped,
        quickTruncated: plan.truncated,
      })
      for (let index = 0; index < plan.files.length; index++) {
        this.setQuickConversion(index, {
          status: 'working',
          detail: 'Converting',
        })
        try {
          const result = await this.convertBinaryEncoding(plan.files[index])
          this.setQuickConversion(index, {
            status: 'done',
            detail: `Saved beside the original as ${fileNameOf(
              result.destinationPath
            )}`,
          })
        } catch (error) {
          this.setQuickConversion(index, {
            status: 'failed',
            detail:
              error instanceof Error
                ? `Not converted: ${error.message}`
                : 'Not converted.',
          })
        }
      }
    } catch (error) {
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to read the dropped files.',
      })
    } finally {
      this.setState({ quickRunning: false })
    }
  }

  private renderQuickConvert() {
    const {
      dropActive,
      includeSubfolders,
      quickRunning,
      quickConversions,
      quickSkipped,
      quickTruncated,
    } = this.state
    const done = quickConversions.filter(item => item.status === 'done').length
    return (
      <section
        className="file-converter-quick"
        aria-labelledby="file-converter-quick-title"
      >
        <div className="file-converter-section-heading">
          <h3 id="file-converter-quick-title">Quick convert</h3>
          {quickConversions.length > 0 && (
            <span role="status">
              {done} of {quickConversions.length} converted
            </span>
          )}
        </div>
        <div
          className={
            dropActive
              ? 'file-converter-drop file-converter-drop-active'
              : 'file-converter-drop'
          }
          onDragOver={this.onDragOver}
          onDragLeave={this.onDragLeave}
          onDrop={this.onDrop}
        >
          <MaterialSymbol name="upload" />
          <div>
            <strong>Drop files or folders here</strong>
            <p>
              Each file becomes Base64 text beside its original, and a
              .base64.txt file is turned back into the original. Results go in
              the folder each file was dragged from. Nothing is overwritten,
              moved or uploaded.
            </p>
          </div>
          <Button onClick={this.onChooseQuickSources} disabled={quickRunning}>
            Choose files
          </Button>
        </div>
        <Checkbox
          label="Include subfolders"
          value={includeSubfolders ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onIncludeSubfoldersChanged}
        />
        {quickTruncated && (
          <p className="file-converter-error" role="status">
            This drop held more files than one batch allows. The first 5,000
            were taken; drop the rest again afterwards.
          </p>
        )}
        {quickConversions.length > 0 && (
          <ul className="file-converter-quick-list">
            {quickConversions.map(item => (
              <li className="file-converter-queue-item" key={item.path}>
                <div>
                  <strong>{fileNameOf(item.path)}</strong>
                  <p>{item.detail}</p>
                </div>
                <span
                  className="file-converter-state"
                  data-status={item.status}
                >
                  {item.status === 'done'
                    ? 'Done'
                    : item.status === 'failed'
                      ? 'Failed'
                      : item.status === 'working'
                        ? 'Working'
                        : 'Waiting'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {quickSkipped.length > 0 && (
          <ul className="file-converter-quick-list">
            {quickSkipped.map(item => (
              <li className="file-converter-queue-item" key={item.path}>
                <div>
                  <strong>{fileNameOf(item.path)}</strong>
                  <p>{item.reason}</p>
                </div>
                <span className="file-converter-state" data-status="skipped">
                  Skipped
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  private get chooseSources() {
    return this.props.chooseSources ?? defaultChooseSources
  }

  private get inspectSource() {
    return this.props.inspectSource ?? inspectFileConverterSource
  }

  private readQueue(): IFileConverterQueueState {
    try {
      return readFileConverterQueueState(localStorage)
    } catch {
      return createEmptyFileConverterQueueState()
    }
  }

  private saveQueue = (queue: IFileConverterQueueState) => {
    let persisted = false
    try {
      persisted = writeFileConverterQueueState(queue, localStorage)
    } catch {
      persisted = false
    }
    this.setState({
      queue,
      persistenceWarning: persisted
        ? null
        : 'Queue changes are active for this window, but could not be saved locally.',
    })
  }

  private onAddSources = async () => {
    this.setState({ loading: true, error: null })
    try {
      const paths = await this.chooseSources()
      const inspections = await Promise.all(
        paths.map(path => this.inspectSource(path))
      )
      const now = new Date().toISOString()
      const items = inspections.map(
        (signature, index): IFileConverterQueueItem => {
          const compatible = FileConverterAdapterRegistry.find(
            adapter =>
              adapter.availability === 'available' &&
              signature.category !== null &&
              adapter.category === signature.category
          )
          return {
            id: `${now}-${index}-${signature.path}`,
            sourcePath: signature.path,
            destinationPath: null,
            adapterId: compatible?.id ?? null,
            signature,
            status: compatible === undefined ? 'skipped' : 'queued',
            progress: 0,
            outcome:
              compatible === undefined
                ? 'No compatible bundled offline adapter is available for this source.'
                : null,
            createdAt: now,
            updatedAt: now,
          }
        }
      )
      if (items.length > 0) {
        this.saveQueue({
          ...this.state.queue,
          items: [...this.state.queue.items, ...items],
        })
      }
    } catch (error) {
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to inspect the selected local files.',
      })
    } finally {
      this.setState({ loading: false })
    }
  }

  private onPauseToggle = () => {
    this.saveQueue({ ...this.state.queue, paused: !this.state.queue.paused })
  }

  private onClearCompleted = () => {
    this.saveQueue({
      ...this.state.queue,
      items: this.state.queue.items.filter(
        item =>
          !['converted', 'skipped', 'cancelled', 'failed'].includes(item.status)
      ),
    })
  }

  private renderAdapterCatalog() {
    return (
      <div
        className="file-converter-catalog"
        role="region"
        aria-label="Local file conversion adapters"
      >
        {FileConverterCategories.map(category => {
          const adapters = FileConverterAdapterRegistry.filter(
            adapter => adapter.category === category
          )
          return (
            <section
              className="file-converter-category"
              key={category}
              role="region"
              aria-label={category}
            >
              <h3>{category}</h3>
              {adapters.map(adapter => (
                <article className="file-converter-adapter" key={adapter.id}>
                  <div>
                    <strong>{adapter.title}</strong>
                    <p>
                      {adapter.sourceFormats.join(', ')} →{' '}
                      {adapter.targetFormats.join(', ')}
                    </p>
                    <p className="file-converter-unavailable" role="status">
                      {adapter.unavailableReason}
                    </p>
                  </div>
                  <span
                    className="file-converter-state"
                    role="note"
                    aria-label="Unavailable"
                  >
                    Unavailable
                  </span>
                </article>
              ))}
            </section>
          )
        })}
      </div>
    )
  }

  private renderQueueItem = (item: IFileConverterQueueItem) => (
    <li className="file-converter-queue-item" key={item.id}>
      <div>
        <strong>{item.sourcePath}</strong>
        <span>
          Detected: {item.signature.format.toUpperCase()} ·{' '}
          {item.signature.byteLength.toLocaleString()} bytes
        </span>
        {item.outcome !== null && <span>{item.outcome}</span>}
      </div>
      <span className="file-converter-state" data-status={item.status}>
        {item.status}
      </span>
    </li>
  )

  public render() {
    const { queue, loading, error, persistenceWarning } = this.state
    const hasFinalItems = queue.items.some(item =>
      ['converted', 'skipped', 'cancelled', 'failed'].includes(item.status)
    )
    return (
      <section
        className="file-converter"
        aria-labelledby="file-converter-title"
      >
        <header className="file-converter-heading">
          <span className="file-converter-icon" aria-hidden="true">
            <MaterialSymbol name="difference" />
          </span>
          <div>
            <h2 id="file-converter-title">{t('fileConverter.title')}</h2>
            <p>
              {t('fileConverter.subtitle')} {t('fileConverter.noNetwork')}
            </p>
          </div>
        </header>

        <div className="file-converter-actions">
          <Button
            onClick={this.onAddSources}
            disabled={loading}
            ariaBusy={loading}
          >
            {loading
              ? t('fileConverter.converting')
              : t('fileConverter.browseSource')}
          </Button>
          <Button onClick={this.onPauseToggle} ariaPressed={queue.paused}>
            {queue.paused ? 'Resume queue' : 'Pause queue'}
          </Button>
          {hasFinalItems && (
            <Button onClick={this.onClearCompleted}>
              Clear finished items
            </Button>
          )}
        </div>
        {error !== null && (
          <p className="file-converter-error" role="alert">
            {error}
          </p>
        )}
        {persistenceWarning !== null && (
          <p className="file-converter-error" role="status">
            {persistenceWarning}
          </p>
        )}

        {this.renderQuickConvert()}

        <section
          className="file-converter-queue"
          aria-labelledby="file-converter-queue-title"
        >
          <div className="file-converter-section-heading">
            <h3 id="file-converter-queue-title">{t('fileConverter.queue')}</h3>
            <span>
              {queue.items.length} item{queue.items.length === 1 ? '' : 's'} ·{' '}
              {queue.paused ? 'paused' : 'ready'}
            </span>
          </div>
          {queue.items.length === 0 ? (
            <p className="file-converter-empty">
              {t('fileConverter.sourceEmpty')} No file is copied, uploaded, or
              converted until a compatible bundled adapter is available and a
              destination is reviewed.
            </p>
          ) : (
            <ul>{queue.items.map(this.renderQueueItem)}</ul>
          )}
        </section>
        {this.renderAdapterCatalog()}
      </section>
    )
  }
}
