/**
 * The Terminal destination's process owner.
 *
 * The MD3 terminal is line-based rather than a character stream, but the thing
 * behind it is the real integrated terminal: every command runs through the
 * CLI workbench's reviewed, allowlisted `custom-git-command` operation — the
 * same path `GitTerminal` and the Custom Git Commands panel use — and its
 * output streams back through the same main-process events. There is no shell,
 * nothing is simulated, and a refused command is refused with the reason Git
 * or the allowlist gave.
 *
 * The controller owns the sessions, their scrollback and the in-flight run,
 * because those outlive any single render of `App`.
 */

import { t } from '../../lib/i18n'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
} from '../../lib/cli-workbench'
import { parseCustomGitCommand } from '../../lib/custom-git-command'
import {
  cancelCLICommand,
  onCLICommandOutput,
  onCLICommandState,
  startCLICommand,
} from '../main-process-proxy'
import {
  applyGitTerminalCompletion,
  completeGitTerminalInput,
} from '../integrated-terminal/git-terminal-completion'

import {
  IMd3TerminalLine,
  IMd3TerminalSearch,
  IMd3TerminalSession,
  IMd3TerminalViewProps,
  Md3TerminalSessionStatus,
} from './md3-terminal-view'
import { IMd3SearchBinding } from './md3-shell'

/** Scrollback bound per session. Matches the integrated terminal's own cap. */
const MaximumLines = 4000

let lineSequence = 0
let runSequence = 0
let sessionSequence = 0

interface IMd3TerminalControllerSession {
  readonly id: string
  readonly label: string
  readonly repositoryPath: string
  status: Md3TerminalSessionStatus
  statusDetail: string | undefined
  lines: ReadonlyArray<IMd3TerminalLine>
  /** The CLI workbench run this session is waiting on, or null when idle. */
  runId: string | null
}

export interface IMd3TerminalControllerHost {
  /** Re-renders the host after any session change. */
  readonly onChanged: () => void
  /**
   * Refreshes the repository after a command completes.
   *
   * The terminal accepts arbitrary allowlisted Git subcommands, so there is no
   * statically known set of dimensions a run can touch — the whole repository
   * is re-read, exactly as `GitTerminal` does.
   */
  readonly onRefreshRepository: () => Promise<void>
  /** Raised by right-clicking the terminal surface. */
  readonly onContextMenu: (event: React.MouseEvent<HTMLElement>) => void
  /** Raised by right-clicking one session tab. */
  readonly onSessionContextMenu?: (
    sessionId: string,
    event: React.MouseEvent<HTMLElement>
  ) => void
}

function line(text: string, kind: IMd3TerminalLine['kind']): IMd3TerminalLine {
  lineSequence++
  return { id: `line-${lineSequence}`, text, kind }
}

export class Md3TerminalController {
  private sessions: Array<IMd3TerminalControllerSession> = []
  private activeSessionId: string | null = null
  private input = ''
  private repositoryPath: string | null = null
  private disposeOutput: (() => void) | null = null
  private disposeState: (() => void) | null = null

  public constructor(private readonly host: IMd3TerminalControllerHost) {}

  /** Begin listening to the CLI workbench. Call once, from `componentDidMount`. */
  public start(): void {
    if (this.disposeOutput !== null) {
      return
    }
    this.disposeOutput = onCLICommandOutput((_event, output) =>
      this.onOutput(output)
    )
    this.disposeState = onCLICommandState((_event, state) =>
      this.onState(state)
    )
  }

  /** Stop listening and cancel every run this controller started. */
  public dispose(): void {
    this.disposeOutput?.()
    this.disposeOutput = null
    this.disposeState?.()
    this.disposeState = null
    for (const session of this.sessions) {
      if (session.runId !== null) {
        void cancelCLICommand(session.runId).catch(() => false)
        session.runId = null
      }
    }
  }

  /**
   * Point the controller at a repository.
   *
   * Changing repository cancels the in-flight run and starts a fresh session,
   * because a command's working directory is fixed when it starts and a
   * scrollback from another repository would read as this one's.
   */
  public setRepositoryPath(path: string | null): void {
    if (path === this.repositoryPath) {
      return
    }
    for (const session of this.sessions) {
      if (session.runId !== null) {
        void cancelCLICommand(session.runId).catch(() => false)
        session.runId = null
      }
    }
    this.repositoryPath = path
    this.sessions = []
    this.activeSessionId = null
    this.input = ''
    if (path !== null) {
      this.createSession()
    } else {
      this.host.onChanged()
    }
  }

  private createSession(): void {
    const path = this.repositoryPath
    if (path === null) {
      return
    }
    sessionSequence++
    const id = `md3-terminal-${sessionSequence}`
    this.sessions = [
      ...this.sessions,
      {
        id,
        label: t('md3.terminal.sessionLabel', {
          number: String(this.sessions.length + 1),
        }),
        repositoryPath: path,
        status: 'ready',
        statusDetail: undefined,
        lines: [line(t('md3.terminal.banner', { path }), 'out')],
        runId: null,
      },
    ]
    this.activeSessionId = id
    this.host.onChanged()
  }

  private session(id: string): IMd3TerminalControllerSession | undefined {
    return this.sessions.find(session => session.id === id)
  }

  private sessionForRun(
    runId: string
  ): IMd3TerminalControllerSession | undefined {
    return this.sessions.find(session => session.runId === runId)
  }

  private append(
    session: IMd3TerminalControllerSession,
    text: string,
    kind: IMd3TerminalLine['kind']
  ): void {
    const next = [...session.lines]
    // The workbench streams arbitrary chunk boundaries, so a chunk is split on
    // its own newlines rather than assumed to be one line.
    for (const part of text.split(/\r?\n/)) {
      if (part.length > 0) {
        next.push(line(part, kind))
      }
    }
    session.lines = next.slice(-MaximumLines)
  }

  private onOutput = (event: ICLICommandOutputEvent) => {
    const session = this.sessionForRun(event.id)
    if (session === undefined) {
      return
    }
    this.append(session, event.data, 'out')
    this.host.onChanged()
  }

  private onState = (event: ICLICommandStateEvent) => {
    const session = this.sessionForRun(event.id)
    if (session === undefined || event.state === 'running') {
      return
    }

    session.runId = null

    if (event.state === 'completed') {
      session.status = 'ready'
      session.statusDetail = undefined
      this.host.onChanged()
      void this.host.onRefreshRepository().catch(() => {
        this.append(session, t('md3.terminal.refreshFailed'), 'out')
        this.host.onChanged()
      })
      return
    }

    const detail =
      event.state === 'cancelled'
        ? t('md3.terminal.cancelled')
        : event.error !== undefined
        ? t('md3.terminal.failedWithError', { error: event.error })
        : event.exitCode !== null
        ? t('md3.terminal.exitedWithCode', { code: String(event.exitCode) })
        : t('md3.terminal.failed')

    session.status = event.state === 'cancelled' ? 'ready' : 'error'
    session.statusDetail = detail
    this.append(session, detail, 'out')
    this.host.onChanged()
  }

  // -- Handlers -------------------------------------------------------------

  private onInputChange = (value: string) => {
    this.input = value
    this.host.onChanged()
  }

  private onRunCommand = (sessionId: string, command: string) => {
    const session = this.session(sessionId)
    if (session === undefined || session.runId !== null) {
      return
    }

    const trimmed = command.trim()
    this.input = ''
    if (trimmed.length === 0) {
      this.host.onChanged()
      return
    }

    this.append(session, `${session.repositoryPath}> ${trimmed}`, 'cmd')

    const tokens = trimmed.split(/\s+/)
    const subcommand = tokens[0] === 'git' ? tokens[1] : tokens[0]
    const rest = (tokens[0] === 'git' ? tokens.slice(2) : tokens.slice(1)).join(
      ' '
    )

    if (subcommand === undefined) {
      this.host.onChanged()
      return
    }

    let operation: ReturnType<typeof parseCustomGitCommand>
    try {
      operation = parseCustomGitCommand(subcommand, rest)
    } catch (error) {
      // A refused command says exactly why the allowlist refused it. This is
      // the whole safety boundary of the terminal, so it is never softened
      // into a generic failure.
      this.append(
        session,
        error instanceof Error ? error.message : t('md3.terminal.notAllowed'),
        'out'
      )
      session.status = 'error'
      session.statusDetail = t('md3.terminal.notAllowed')
      this.host.onChanged()
      return
    }

    runSequence++
    const runId = `md3-terminal-run-${Date.now()}-${runSequence}`
    session.runId = runId
    session.status = 'running'
    session.statusDetail = undefined
    this.host.onChanged()

    void startCLICommand({
      id: runId,
      repositoryPath: session.repositoryPath,
      operation,
      confirmed: true,
    }).catch(error => {
      if (session.runId !== runId) {
        return
      }
      session.runId = null
      session.status = 'error'
      session.statusDetail =
        error instanceof Error ? error.message : t('md3.terminal.startFailed')
      this.append(session, session.statusDetail, 'out')
      this.host.onChanged()
    })
  }

  private onSelectSession = (sessionId: string) => {
    if (this.session(sessionId) !== undefined) {
      this.activeSessionId = sessionId
      this.host.onChanged()
    }
  }

  private onCreateSession = () => {
    this.createSession()
  }

  private onCloseSession = (sessionId: string) => {
    const session = this.session(sessionId)
    if (session === undefined) {
      return
    }
    if (session.runId !== null) {
      void cancelCLICommand(session.runId).catch(() => false)
    }
    this.sessions = this.sessions.filter(entry => entry.id !== sessionId)
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.sessions[0]?.id ?? null
    }
    if (this.sessions.length === 0) {
      this.createSession()
      return
    }
    this.host.onChanged()
  }

  private onRestartSession = (sessionId: string) => {
    const session = this.session(sessionId)
    if (session === undefined) {
      return
    }
    if (session.runId !== null) {
      void cancelCLICommand(session.runId).catch(() => false)
      session.runId = null
    }
    session.status = 'ready'
    session.statusDetail = undefined
    session.lines = [
      line(t('md3.terminal.banner', { path: session.repositoryPath }), 'out'),
    ]
    this.host.onChanged()
  }

  private onCancelCommand = (sessionId: string) => {
    const session = this.session(sessionId)
    if (session?.runId === null || session === undefined) {
      return
    }
    void cancelCLICommand(session.runId).catch(() => false)
  }

  private onCompleteInput = (_sessionId: string, input: string): string => {
    const result = completeGitTerminalInput(input)
    if (result.candidates.length !== 1) {
      return input
    }
    return applyGitTerminalCompletion(input, result, result.candidates[0])
  }

  // -- Props ----------------------------------------------------------------

  private toViewSession(
    session: IMd3TerminalControllerSession
  ): IMd3TerminalSession {
    return {
      id: session.id,
      label: session.label,
      status: session.status,
      lines: session.lines,
      prompt: `${session.repositoryPath}>`,
      statusDetail: session.statusDetail,
    }
  }

  /** The Terminal view's props, built from the live sessions. */
  public getViewProps(search: IMd3SearchBinding): IMd3TerminalViewProps {
    const viewSearch: IMd3TerminalSearch = {
      value: search.value,
      regexEnabled: search.regexEnabled,
      onChange: search.onChange,
      onClear: search.onClear,
      onToggleRegex: search.onToggleRegex,
      onOpenBuilder: search.onOpenBuilder,
    }

    return {
      sessions: this.sessions.map(session => this.toViewSession(session)),
      activeSessionId: this.activeSessionId,
      search: viewSearch,
      input: this.input,
      onInputChange: this.onInputChange,
      onRunCommand: this.onRunCommand,
      onSelectSession: this.onSelectSession,
      onCreateSession: this.onCreateSession,
      onCloseSession: this.onCloseSession,
      onRestartSession: this.onRestartSession,
      onCancelCommand: this.onCancelCommand,
      onCompleteInput: this.onCompleteInput,
      onContextMenu: this.host.onContextMenu,
      onSessionContextMenu: this.host.onSessionContextMenu,
    }
  }
}
