import * as React from 'react'

import {
  normalizeProgressiveLoadError,
  ProgressiveLoad,
  ProgressiveLoadState,
} from '../../lib/progressive-load'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { getPersistedLanguageMode, t } from '../../lib/i18n'
import { Button } from './button'
import { Loading } from './loading'

type LoadSource = () => Promise<unknown>

interface IResolvedLoad {
  readonly value: unknown
}

/**
 * Stable module loaders are evaluated once per renderer session. In-flight
 * requests are shared too, while rejections are deliberately forgotten so the
 * local retry button always starts a real new attempt.
 */
const resolvedLoads = new WeakMap<LoadSource, IResolvedLoad>()
const inFlightLoads = new WeakMap<LoadSource, Promise<unknown>>()

function asLoadSource<T>(source: () => Promise<T>): LoadSource {
  return source as LoadSource
}

function readCachedLoad<T>(source: () => Promise<T>): {
  readonly found: boolean
  readonly value: T | null
} {
  const cached = resolvedLoads.get(asLoadSource(source))
  return cached === undefined
    ? { found: false, value: null }
    : { found: true, value: cached.value as T }
}

function forgetCachedLoad<T>(source: () => Promise<T>): void {
  const key = asLoadSource(source)
  resolvedLoads.delete(key)
  inFlightLoads.delete(key)
}

function loadOnce<T>(source: () => Promise<T>): Promise<T> {
  const key = asLoadSource(source)
  const cached = resolvedLoads.get(key)
  if (cached !== undefined) {
    return Promise.resolve(cached.value as T)
  }

  const inFlight = inFlightLoads.get(key)
  if (inFlight !== undefined) {
    return inFlight as Promise<T>
  }

  const request = Promise.resolve()
    .then(source)
    .then(
      value => {
        resolvedLoads.set(key, { value })
        inFlightLoads.delete(key)
        return value
      },
      error => {
        inFlightLoads.delete(key)
        throw normalizeProgressiveLoadError(error)
      }
    )
  inFlightLoads.set(key, request)
  return request
}

export interface ILazyViewProps<T> {
  /** User-facing name of the local surface being loaded. */
  readonly name: string
  /** Stable module or data loader. It is not invoked until this view mounts. */
  readonly load: () => Promise<T>
  /** Render the resolved surface. */
  readonly render: (value: T) => React.ReactNode
  /** Report an accepted load or render failure through a non-blocking channel. */
  readonly onError?: (name: string, error: Error) => void
}

interface ILazyViewState<T> {
  /** Identifies which loader owns `loadState` across prop changes. */
  readonly source: () => Promise<T>
  readonly loadState: ProgressiveLoadState<T>
  /** Remounts the render boundary for each explicit load or retry attempt. */
  readonly renderAttempt: number
}

function loadingState<T>(): ProgressiveLoadState<T> {
  return { kind: 'loading', value: null }
}

interface ILazyRenderContentProps<T> {
  readonly value: T
  readonly render: (value: T) => React.ReactNode
}

/**
 * Invokes the owner renderer below, rather than inside, the error boundary.
 * React boundaries do not catch exceptions thrown by their own render method.
 */
function LazyRenderContent<T>(props: ILazyRenderContentProps<T>): JSX.Element {
  return <React.Fragment>{props.render(props.value)}</React.Fragment>
}

interface ILazyRenderBoundaryProps<T> extends ILazyRenderContentProps<T> {
  readonly renderFailure: (error: Error) => React.ReactNode
  readonly onError: (error: Error) => void
}

interface ILazyRenderBoundaryState {
  readonly error: Error | null
}

/**
 * Contains exceptions from a successfully loaded surface inside LazyView.
 *
 * The parent owns retry so a retry receives a fresh loader attempt as well as
 * a fresh boundary. This avoids trapping a repaired or newly downloaded chunk
 * behind the state of the failed render.
 */
class LazyRenderBoundary<T> extends React.Component<
  ILazyRenderBoundaryProps<T>,
  ILazyRenderBoundaryState
> {
  public static getDerivedStateFromError(
    error: unknown
  ): Partial<ILazyRenderBoundaryState> {
    return { error: normalizeProgressiveLoadError(error) }
  }

  public state: ILazyRenderBoundaryState = { error: null }

  // eslint-disable-next-line react-proper-lifecycle-methods -- React error-boundary lifecycle.
  public componentDidCatch(error: Error): void {
    this.props.onError(normalizeProgressiveLoadError(error))
  }

  public render(): React.ReactNode {
    if (this.state.error !== null) {
      return this.props.renderFailure(this.state.error)
    }

    return (
      <LazyRenderContent value={this.props.value} render={this.props.render} />
    )
  }
}

/**
 * Local progressive boundary for modules and other expensive inactive views.
 *
 * It deliberately owns no focus calls. Loading is announced politely, loader
 * and render errors stay in this surface with a retry, late completions are
 * fenced by the underlying ProgressiveLoad generation, and resolved stable
 * loaders are reused without flashing a spinner when a surface is revisited.
 */
export class LazyView<T> extends React.Component<
  ILazyViewProps<T>,
  ILazyViewState<T>
> {
  private progressiveLoad: ProgressiveLoad<T>
  private mounted = false
  private nextRenderAttempt = 0

  public constructor(props: ILazyViewProps<T>) {
    super(props)
    const cached = readCachedLoad(props.load)
    this.progressiveLoad = new ProgressiveLoad<T>(
      cached.found ? cached.value : null
    )
    this.state = {
      source: props.load,
      loadState: cached.found ? this.progressiveLoad.state : loadingState<T>(),
      renderAttempt: this.nextRenderAttempt,
    }
  }

  public componentDidMount(): void {
    this.mounted = true
    if (this.progressiveLoad.state.kind !== 'ready') {
      this.startLoad(this.props.load)
    }
  }

  public componentDidUpdate(prevProps: ILazyViewProps<T>): void {
    if (prevProps.load === this.props.load) {
      return
    }

    this.progressiveLoad.dispose()
    const cached = readCachedLoad(this.props.load)
    this.progressiveLoad = new ProgressiveLoad<T>(
      cached.found ? cached.value : null
    )
    if (cached.found) {
      this.setState({
        source: this.props.load,
        loadState: this.progressiveLoad.state,
        renderAttempt: ++this.nextRenderAttempt,
      })
    } else {
      this.startLoad(this.props.load)
    }
  }

  public componentWillUnmount(): void {
    this.mounted = false
    this.progressiveLoad.dispose()
  }

  private startLoad(source: () => Promise<T>): void {
    const renderAttempt = ++this.nextRenderAttempt
    const completion = this.progressiveLoad.run(() => loadOnce(source))
    this.setState({
      source,
      loadState: this.progressiveLoad.state,
      renderAttempt,
    })

    void completion.then(result => {
      if (!this.mounted || !result.accepted || source !== this.props.load) {
        return
      }

      this.setState({ source, loadState: result.state, renderAttempt })
      if (result.state.kind === 'failed') {
        this.reportFailure(result.state.error)
      }
    })
  }

  private reportFailure = (error: Error): void => {
    try {
      this.props.onError?.(this.props.name, error)
    } catch (reportError) {
      try {
        log.error('Unable to report a lazy view failure', reportError)
      } catch {
        // A local recovery surface must not depend on diagnostics.
      }
    }
  }

  private retry = (): void => {
    forgetCachedLoad(this.props.load)
    this.startLoad(this.props.load)
  }

  private renderLoading(): JSX.Element {
    const message = translateWithFunnyLevel(
      'lazyView.loading',
      getPersistedLanguageMode(),
      readFunnyLevels(),
      { name: this.props.name }
    )

    return (
      <section
        className="lazy-view lazy-view-loading"
        role="status"
        aria-live="polite"
        aria-busy={true}
      >
        <span className="lazy-view-spinner" aria-hidden={true}>
          <Loading />
        </span>
        <p className="lazy-view-message">{message}</p>
      </section>
    )
  }

  private renderFailure = (error: Error): JSX.Element => {
    const variables = { name: this.props.name }
    const body = translateWithFunnyLevel(
      'lazyView.failedBody',
      getPersistedLanguageMode(),
      readFunnyLevels(),
      variables
    )

    return (
      <section className="lazy-view lazy-view-failed" role="alert">
        <h2 className="lazy-view-title">
          {t('lazyView.failedTitle', variables)}
        </h2>
        <p className="lazy-view-message">{body}</p>
        <p className="lazy-view-error-detail">
          {t('lazyView.failedDetail', { error: error.message })}
        </p>
        <Button type="button" onClick={this.retry}>
          {t('lazyView.retry')}
        </Button>
      </section>
    )
  }

  public render(): React.ReactNode {
    // A prop change renders once before componentDidUpdate runs. Never hand a
    // resource from the previous loader to the new renderer during that frame.
    if (this.state.source !== this.props.load) {
      return this.renderLoading()
    }

    const state = this.state.loadState
    if (state.kind === 'ready') {
      return (
        <LazyRenderBoundary
          key={this.state.renderAttempt}
          value={state.value}
          render={this.props.render}
          renderFailure={this.renderFailure}
          onError={this.reportFailure}
        />
      )
    }
    if (state.kind === 'failed') {
      return this.renderFailure(state.error)
    }
    return this.renderLoading()
  }
}
