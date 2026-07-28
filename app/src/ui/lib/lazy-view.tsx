import * as React from 'react'

import { Button } from './button'
import { MaterialSymbol } from './material-symbol'
import {
  IProgressiveLoadState,
  ProgressiveLoad,
  asError,
} from '../../lib/progressive-load'
import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'

/**
 * A view module whose evaluation is deferred until the surface is opened.
 *
 * Desktop Material ships as a single bundle, so "lazy" here means the module's
 * top-level code (its imports, class definitions and registrations) is not
 * executed while the app is starting. A tab the user never opens costs nothing
 * at launch; a tab they do open pays for itself once and is then cached for
 * the rest of the session.
 */
export interface ILazyViewModule<P> {
  /** A stable identity for this module, used to detect a swapped surface. */
  readonly id: string

  /** The component if it has already been evaluated, otherwise null. */
  peek(): React.ComponentType<P> | null

  /**
   * Evaluate the module, or join the evaluation already in flight.
   *
   * Rejects with the real error when the module cannot be evaluated, and
   * forgets that failure so a later call genuinely retries instead of
   * replaying a cached rejection forever.
   */
  load(): Promise<React.ComponentType<P>>
}

class LazyViewModule<P> implements ILazyViewModule<P> {
  public readonly id: string
  private readonly loader: () => Promise<React.ComponentType<P>>
  private component: React.ComponentType<P> | null = null
  private inFlight: Promise<React.ComponentType<P>> | null = null

  public constructor(
    id: string,
    loader: () => Promise<React.ComponentType<P>>
  ) {
    this.id = id
    this.loader = loader
  }

  public peek(): React.ComponentType<P> | null {
    return this.component
  }

  public load(): Promise<React.ComponentType<P>> {
    if (this.component !== null) {
      return Promise.resolve(this.component)
    }

    if (this.inFlight === null) {
      this.inFlight = this.loader().then(
        component => {
          this.component = component
          this.inFlight = null
          return component
        },
        error => {
          // Dropping the shared promise is what makes the retry button real; a
          // cached rejection would turn one bad load into a permanent one.
          this.inFlight = null
          throw asError(error)
        }
      )
    }

    return this.inFlight
  }
}

/**
 * Declare a deferred view module.
 *
 * Call this at module scope so the identity — and therefore the cached
 * evaluation — is shared by every mount of the surface.
 */
export function lazyViewModule<P>(
  id: string,
  loader: () => Promise<React.ComponentType<P>>
): ILazyViewModule<P> {
  return new LazyViewModule(id, loader)
}

interface ILazyViewProps<P> {
  /** The deferred module this surface renders. */
  readonly view: ILazyViewModule<P>

  /** The props handed to the component once it has been evaluated. */
  readonly viewProps: P

  /**
   * The localized, human name of the surface, e.g. "Actions".
   *
   * It appears in both the progress and the failure copy so the user is always
   * told exactly which surface is loading, or which one failed.
   */
  readonly name: string

  /**
   * Invoked once per accepted failure so the host can raise a non-blocking
   * notification. The local failure surface is shown either way.
   */
  readonly onLoadFailed?: (name: string, error: Error) => void
}

interface ILazyViewState<P> {
  /** The module id the current load state belongs to. */
  readonly viewId: string

  /** Progress, value and error for the module named by `viewId`. */
  readonly load: IProgressiveLoadState<React.ComponentType<P>>
}

/**
 * Renders a deferred view module, keeping its loading and failure states local
 * to this surface.
 *
 * The rest of the window stays interactive throughout: nothing here is modal,
 * nothing here moves focus, and a failure names the surface and the underlying
 * error instead of leaving a spinner running forever.
 */
export class LazyView<P extends object> extends React.Component<
  ILazyViewProps<P>,
  ILazyViewState<P>
> {
  private progressive: ProgressiveLoad<React.ComponentType<P>>
  private mounted = false

  public constructor(props: ILazyViewProps<P>) {
    super(props)

    // A module evaluated earlier in this session is adopted synchronously, so
    // revisiting a surface shows no progress state at all.
    this.progressive = new ProgressiveLoad<React.ComponentType<P>>(
      this.onLoadStateChanged,
      props.view.peek()
    )
    this.state = { viewId: props.view.id, load: this.progressive.getState() }
  }

  public componentDidMount() {
    this.mounted = true
    if (this.progressive.getState().value === null) {
      this.startLoad()
    }
  }

  public componentDidUpdate(prevProps: ILazyViewProps<P>) {
    if (prevProps.view === this.props.view) {
      return
    }

    // The surface was swapped for a different module. Every in-flight result
    // for the previous one is refused rather than being painted here.
    this.progressive.dispose()
    this.progressive = new ProgressiveLoad<React.ComponentType<P>>(
      this.onLoadStateChanged,
      this.props.view.peek()
    )
    this.setState({
      viewId: this.props.view.id,
      load: this.progressive.getState(),
    })
    if (this.progressive.getState().value === null) {
      this.startLoad()
    }
  }

  public componentWillUnmount() {
    this.mounted = false
    this.progressive.dispose()
  }

  public render() {
    const { viewId, load } = this.state

    // State left over from a previous module must never be rendered with the
    // current module's props; componentDidUpdate has already queued its load.
    if (viewId !== this.props.view.id) {
      return this.renderLoading()
    }

    if (load.value !== null) {
      return React.createElement(load.value, this.props.viewProps)
    }

    if (load.status === 'failed' && load.error !== null) {
      return this.renderFailure(load.error)
    }

    return this.renderLoading()
  }

  private startLoad() {
    const progressive = this.progressive
    const view = this.props.view
    const load = () => view.load()

    void progressive.run(load).then(applied => {
      const { error } = progressive.getState()
      if (!applied || error === null) {
        return
      }

      // A rejected surface load is never dropped on the floor: it is logged,
      // rendered locally, and offered to the host as a notification.
      log.error(`Deferred view '${view.id}' failed to load`, error)
      if (this.mounted) {
        this.props.onLoadFailed?.(this.props.name, error)
      }
    })
  }

  private onLoadStateChanged = (
    load: IProgressiveLoadState<React.ComponentType<P>>
  ) => {
    if (this.mounted) {
      this.setState({ viewId: this.props.view.id, load })
    }
  }

  private onRetry = () => {
    this.startLoad()
  }

  private renderLoading() {
    // role=status announces politely and never moves focus, which is exactly
    // what loading a background surface should do.
    return (
      <div
        className="lazy-view lazy-view-loading"
        role="status"
        aria-live="polite"
        aria-busy={true}
      >
        <MaterialSymbol
          name="progress_activity"
          className="lazy-view-spinner"
          size={32}
        />
        <p className="lazy-view-message">
          {translateWithFunnyLevel(
            'lazyView.loading',
            getPersistedLanguageMode(),
            readFunnyLevels(),
            { name: this.props.name }
          )}
        </p>
      </div>
    )
  }

  private renderFailure(error: Error) {
    return (
      <div className="lazy-view lazy-view-failed" role="alert">
        <MaterialSymbol name="error" className="lazy-view-icon" size={32} />
        <h2 className="lazy-view-title">
          {t('lazyView.failedTitle', { name: this.props.name })}
        </h2>
        <p className="lazy-view-message">
          {translateWithFunnyLevel(
            'lazyView.failedBody',
            getPersistedLanguageMode(),
            readFunnyLevels(),
            { name: this.props.name }
          )}
        </p>
        <p className="lazy-view-detail">
          {t('lazyView.failedDetail', { error: error.message })}
        </p>
        <Button onClick={this.onRetry}>{t('lazyView.retry')}</Button>
      </div>
    )
  }
}
