import * as React from 'react'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showOpenDialogMultiple, inspectFileConverterSource } from '../main-process-proxy'
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

interface IFileConverterProps {
  /** Injectable seams keep file selection and byte inspection out of the UI. */
  readonly chooseSources?: () => Promise<ReadonlyArray<string>>
  readonly inspectSource?: (path: string) => Promise<IFileSignatureInspection>
}

interface IFileConverterState {
  readonly queue: IFileConverterQueueState
  readonly loading: boolean
  readonly error: string | null
  readonly persistenceWarning: string | null
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
    }
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
      const inspections = await Promise.all(paths.map(path => this.inspectSource(path)))
      const now = new Date().toISOString()
      const items = inspections.map((signature, index): IFileConverterQueueItem => {
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
      })
      if (items.length > 0) {
        this.saveQueue({ ...this.state.queue, items: [...this.state.queue.items, ...items] })
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
        item => !['converted', 'skipped', 'cancelled', 'failed'].includes(item.status)
      ),
    })
  }

  private renderAdapterCatalog() {
    return (
      <div className="file-converter-catalog" aria-label="Local file conversion adapters">
        {FileConverterCategories.map(category => {
          const adapters = FileConverterAdapterRegistry.filter(adapter => adapter.category === category)
          return (
            <section className="file-converter-category" key={category} aria-label={category}>
              <h3>{category}</h3>
              {adapters.map(adapter => (
                <article className="file-converter-adapter" key={adapter.id}>
                  <div>
                    <strong>{adapter.title}</strong>
                    <p>
                      {adapter.sourceFormats.join(', ')} → {adapter.targetFormats.join(', ')}
                    </p>
                    <p className="file-converter-unavailable" role="status">
                      {adapter.unavailableReason}
                    </p>
                  </div>
                  <span className="file-converter-state" aria-label="Unavailable">
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
          Detected: {item.signature.format.toUpperCase()} · {item.signature.byteLength.toLocaleString()} bytes
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
      <section className="file-converter" aria-labelledby="file-converter-title">
        <header className="file-converter-heading">
          <span className="file-converter-icon" aria-hidden="true">
            <Octicon symbol={octicons.fileDiff} />
          </span>
          <div>
            <h2 id="file-converter-title">{t('fileConverter.title')}</h2>
            <p>
              {t('fileConverter.subtitle')} {t('fileConverter.noNetwork')}
            </p>
          </div>
        </header>

        <div className="file-converter-actions">
          <Button onClick={this.onAddSources} disabled={loading} ariaBusy={loading}>
            {loading ? t('fileConverter.converting') : t('fileConverter.browseSource')}
          </Button>
          <Button onClick={this.onPauseToggle} ariaPressed={queue.paused}>
            {queue.paused ? 'Resume queue' : 'Pause queue'}
          </Button>
          {hasFinalItems && <Button onClick={this.onClearCompleted}>Clear finished items</Button>}
        </div>
        {error !== null && <p className="file-converter-error" role="alert">{error}</p>}
        {persistenceWarning !== null && <p className="file-converter-error" role="status">{persistenceWarning}</p>}

        <section className="file-converter-queue" aria-labelledby="file-converter-queue-title">
          <div className="file-converter-section-heading">
            <h3 id="file-converter-queue-title">{t('fileConverter.queue')}</h3>
            <span>{queue.items.length} item{queue.items.length === 1 ? '' : 's'} · {queue.paused ? 'paused' : 'ready'}</span>
          </div>
          {queue.items.length === 0 ? (
            <p className="file-converter-empty">{t('fileConverter.sourceEmpty')} No file is copied, uploaded, or converted until a compatible bundled adapter is available and a destination is reviewed.</p>
          ) : (
            <ul>{queue.items.map(this.renderQueueItem)}</ul>
          )}
        </section>
        {this.renderAdapterCatalog()}
      </section>
    )
  }
}
