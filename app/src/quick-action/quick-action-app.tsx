import * as Path from 'path'
import * as React from 'react'
import * as ipcRenderer from '../lib/ipc-renderer'
import { getPersistedLanguageMode, translate } from '../lib/i18n'
import { LanguageMode } from '../models/language-mode'
import {
  IQuickActionRequest,
  QuickCommitBlocker,
  QuickCommitPhase,
  decideQuickCommit,
} from '../lib/quick-action'
import {
  IQuickRepositorySnapshot,
  commitAndPush,
  loadQuickRepositorySnapshot,
} from './quick-git'

interface IQuickActionAppState {
  readonly request: IQuickActionRequest | null
  readonly snapshot: IQuickRepositorySnapshot | null
  readonly phase: QuickCommitPhase
  readonly summary: string
  readonly progress: string | null
  readonly error: string | null
  readonly resultSha: string | null
  readonly languageMode: LanguageMode
}

/**
 * The whole quick-action window UI.
 *
 * Deliberately a single component with no store: the window exists for one
 * folder and one action, and the fastest thing it can do is render immediately
 * and fill itself in as the git probe resolves.
 */
export class QuickActionApp extends React.Component<{}, IQuickActionAppState> {
  private readonly summaryInput = React.createRef<HTMLInputElement>()

  public constructor(props: {}) {
    super(props)
    this.state = {
      request: null,
      snapshot: null,
      phase: 'loading',
      summary: '',
      progress: null,
      error: null,
      resultSha: null,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    ipcRenderer.on('quick-action-request', this.onRequest)
    document.addEventListener('keydown', this.onKeyDown)
    ipcRenderer.send('quick-action-ready')
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('quick-action-request', this.onRequest)
    document.removeEventListener('keydown', this.onKeyDown)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // A transient panel must be dismissible without reaching for the mouse.
    if (event.key === 'Escape') {
      ipcRenderer.send('quick-action-close')
    }
  }

  private onRequest = (
    _event: unknown,
    request: IQuickActionRequest,
    launchedAt: number
  ) => {
    // Report the interval from process launch to an interactive window. This is
    // the number the feature is judged on, so it is measured rather than
    // asserted.
    ipcRenderer.send('quick-action-opened', Date.now() - launchedAt)

    this.setState({ request })

    if (request.verb === 'open-in-full-app') {
      this.openInFullApp(request.path)
      return
    }

    loadQuickRepositorySnapshot(request.path)
      .then(snapshot =>
        this.setState({ snapshot, phase: 'ready' }, () =>
          // Focus lands on the one field the user came here to fill in.
          this.summaryInput.current?.focus()
        )
      )
      .catch(error =>
        this.setState({
          phase: 'failed',
          error: this.describeError(error),
        })
      )
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : translate('quickAction.genericError', this.state.languageMode)
  }

  private openInFullApp = (path?: string) => {
    const target = path ?? this.state.request?.path
    if (target !== undefined) {
      ipcRenderer.send('quick-action-open-in-app', target)
    }
  }

  private onOpenInFullAppClicked = () => this.openInFullApp()

  private onSummaryChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ summary: event.currentTarget.value })
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    this.commitAndPush()
  }

  private commitAndPush() {
    const { request, snapshot, summary } = this.state
    if (request === null || snapshot === null || snapshot.repository === null) {
      return
    }

    this.setState({ phase: 'committing', error: null, progress: null })

    commitAndPush(snapshot, summary, {
      onPhase: phase => this.setState({ phase }),
      onProgress: progress => this.setState({ progress }),
    })
      .then(sha =>
        this.setState(
          previous => ({
            phase: 'done' as const,
            resultSha: sha,
            progress: null,
            // The window deliberately allows a further commit, so the state it
            // offers one from has to be the state the folder is actually in.
            // The files just committed are no longer pending: clear them and
            // the summary at once, because until the re-probe answers a stale
            // list is the one thing a second click could commit twice.
            summary: '',
            snapshot:
              previous.snapshot === null
                ? null
                : { ...previous.snapshot, files: [], changedFileCount: 0 },
          }),
          () => this.refreshSnapshot()
        )
      )
      .catch(error =>
        this.setState({
          phase: 'failed',
          progress: null,
          error: this.describeError(error),
        })
      )
  }

  /**
   * Re-probe the folder after a commit lands.
   *
   * A failure here is deliberately silent: the commit and push already
   * succeeded, and replacing that success with a probe's error message would
   * report a failure that did not happen. The optimistically cleared file list
   * is the safe state to stay in, so nothing is committed twice either way.
   */
  private refreshSnapshot() {
    const { request } = this.state
    if (request === null) {
      return
    }

    loadQuickRepositorySnapshot(request.path)
      .then(snapshot => this.setState({ snapshot }))
      .catch(() => undefined)
  }

  private blockerMessage(blocker: QuickCommitBlocker): string {
    const { languageMode } = this.state
    switch (blocker) {
      case 'loading':
        return translate('quickAction.loading', languageMode)
      case 'not-a-repository':
        return translate('quickAction.notARepository', languageMode)
      case 'no-changes':
        return translate('quickAction.noChanges', languageMode)
      case 'no-summary':
        return translate('quickAction.needSummary', languageMode)
      case 'detached-head':
        return translate('quickAction.detachedHead', languageMode)
      case 'busy':
        return translate('quickAction.busy', languageMode)
    }
  }

  private renderStatusLine(blocker: QuickCommitBlocker | null) {
    const { snapshot, languageMode, phase } = this.state

    if (phase === 'done') {
      return (
        <p className="quick-action-status quick-action-status-success">
          {translate('quickAction.pushed', languageMode, {
            sha: this.state.resultSha ?? '',
          })}
        </p>
      )
    }

    if (blocker !== null) {
      return (
        <p className="quick-action-status">{this.blockerMessage(blocker)}</p>
      )
    }

    const count = snapshot?.changedFileCount ?? 0
    return (
      <p className="quick-action-status">
        {translate('quickAction.changeCount', languageMode, {
          count: String(count),
        })}
      </p>
    )
  }

  public render() {
    const { request, snapshot, phase, summary, progress, error, languageMode } =
      this.state

    const blocker = decideQuickCommit({
      phase,
      isRepository: snapshot?.repository !== null && snapshot !== null,
      changedFileCount: snapshot?.changedFileCount ?? 0,
      summary,
      currentBranch: snapshot?.currentBranch,
    })

    const folderName =
      request === null ? '' : Path.basename(request.path) || request.path
    const busy = phase === 'committing' || phase === 'pushing'

    return (
      <div className="quick-action-window">
        <header className="quick-action-header">
          <h1 className="quick-action-title">{folderName}</h1>
          {/* The full path is rendered rather than hidden in a `title`
              attribute, which assistive technology cannot reliably reach. */}
          {request !== null && (
            <p className="quick-action-path">{request.path}</p>
          )}
          {snapshot?.currentBranch !== undefined && (
            <p className="quick-action-branch">{snapshot.currentBranch}</p>
          )}
        </header>

        <form className="quick-action-body" onSubmit={this.onSubmit}>
          {this.renderStatusLine(blocker)}

          <label className="quick-action-label" htmlFor="quick-action-summary">
            {translate('quickAction.summaryLabel', languageMode)}
          </label>
          <input
            id="quick-action-summary"
            className="quick-action-summary"
            type="text"
            value={summary}
            onChange={this.onSummaryChanged}
            // Not disabled once a commit has landed: the window deliberately
            // allows a further one, and a further commit needs its own summary.
            disabled={busy || phase === 'loading'}
            placeholder={translate(
              'quickAction.summaryPlaceholder',
              languageMode
            )}
            ref={this.summaryInput}
          />

          <div className="quick-action-actions">
            <button
              type="submit"
              className="quick-action-primary"
              disabled={blocker !== null}
            >
              {translate('quickAction.commitAndPush', languageMode)}
            </button>
            <button
              type="button"
              className="quick-action-secondary"
              onClick={this.onOpenInFullAppClicked}
            >
              {translate('quickAction.openInFullApp', languageMode)}
            </button>
          </div>

          {/* One live region for every transient message so a screen reader
              hears progress, success and failure in the order they happen. */}
          <div
            className="quick-action-live"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {progress !== null && (
              <span className="quick-action-progress">{progress}</span>
            )}
            {error !== null && (
              <span className="quick-action-error">{error}</span>
            )}
          </div>
        </form>
      </div>
    )
  }
}
