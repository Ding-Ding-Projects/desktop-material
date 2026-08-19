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

import { homedir } from 'os'

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
  stripTerminalControlSequences,
} from './md3-terminal-view'
import { IMd3SearchBinding } from './md3-shell'

/** Scrollback bound per session. Matches the integrated terminal's own cap. */
const MaximumLines = 4000

/**
 * The program the Terminal destination actually drives.
 *
 * Every command runs through the CLI workbench's allowlisted
 * `custom-git-command` operation, so this is Git and nothing else. The
 * contract's pill reads `<shell> — <repository>`; naming a shell the app does
 * not run — `bash`, say — would be the pill lying about what a typed command
 * will reach.
 */
const ShellName = 'git'

/**
 * How many trailing path segments the prompt keeps.
 *
 * The contract's prompt is `~/code/desktop-material $` — a short, abbreviated
 * working directory. The full path is kept on the session and is what the
 * prompt's tooltip and the input's accessible name say, so nothing is hidden;
 * this is only what the 12px monospace row draws.
 */
const PromptSegments = 2

/** Marks the segments an abbreviated prompt left out. */
const Ellipsis = '…'

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
  /**
   * The tail of the last output chunk, when it did not end at a line boundary.
   *
   * The workbench streams arbitrary chunk boundaries, so a line can arrive in
   * two pieces. Emitting each piece as its own line is how one `git status`
   * row becomes two half-rows in the scroller, so the remainder waits here for
   * the rest of itself and is flushed when the run ends.
   */
  pending: string
}

/**
 * Normalise a filesystem path for display: forward slashes, no trailing
 * separator. Windows paths are what this mostly sees, and a prompt full of
 * backslashes is not what the contract draws.
 */
function normalizePathForDisplay(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** The repository's own folder name — what `Repository.name` resolves to. */
export function md3TerminalRepositoryName(repositoryPath: string): string {
  const segments = normalizePathForDisplay(repositoryPath)
    .split('/')
    .filter(segment => segment.length > 0)
  return segments[segments.length - 1] ?? repositoryPath
}

/**
 * Abbreviate a working directory the way a shell prompt does: the home
 * directory collapses to `~`, and anything deeper than `PromptSegments` keeps
 * its last segments behind an ellipsis.
 *
 * `homeDirectory` is a parameter rather than a call to `homedir()` inside so
 * the mapping can be asserted for a Windows path on a Linux runner and the
 * other way round.
 */
export function abbreviateMd3TerminalDirectory(
  directory: string,
  homeDirectory: string = homedir()
): string {
  const normalized = normalizePathForDisplay(directory)
  if (normalized.length === 0) {
    return directory
  }

  const home = normalizePathForDisplay(homeDirectory)
  const foldCase = process.platform === 'win32'
  const comparable = foldCase ? normalized.toLowerCase() : normalized
  const comparableHome = foldCase ? home.toLowerCase() : home

  const insideHome =
    comparableHome.length > 0 &&
    (comparable === comparableHome ||
      comparable.startsWith(`${comparableHome}/`))

  const remainder = insideHome ? normalized.slice(home.length) : normalized
  const segments = remainder.split('/').filter(segment => segment.length > 0)

  if (insideHome) {
    return segments.length <= PromptSegments
      ? ['~', ...segments].join('/')
      : ['~', Ellipsis, ...segments.slice(-PromptSegments)].join('/')
  }

  return segments.length <= PromptSegments
    ? normalized
    : [Ellipsis, ...segments.slice(-PromptSegments)].join('/')
}

/** The contract's `termPrompt`: an abbreviated working directory and a `$`. */
export function md3TerminalPrompt(
  repositoryPath: string,
  homeDirectory: string = homedir()
): string {
  return `${abbreviateMd3TerminalDirectory(repositoryPath, homeDirectory)} $`
}

/**
 * The contract's shell pill: `<shell> — <repository>`.
 *
 * `ordinal` disambiguates a second shell on the same repository, because two
 * pills reading `git — desktop-material` are two pills nobody can tell apart.
 */
export function md3TerminalSessionLabel(
  repositoryPath: string,
  ordinal: number
): string {
  const repository = md3TerminalRepositoryName(repositoryPath)
  return ordinal <= 1
    ? t('md3.terminal.sessionLabel', { shell: ShellName, repository })
    : t('md3.terminal.sessionLabelNumbered', {
        shell: ShellName,
        repository,
        number: String(ordinal),
      })
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
    const ordinal =
      this.sessions.filter(session => session.repositoryPath === path).length +
      1
    this.sessions = [
      ...this.sessions,
      {
        id,
        label: md3TerminalSessionLabel(path, ordinal),
        repositoryPath: path,
        status: 'ready',
        statusDetail: undefined,
        // The contract's first line is the shell's own context line, painted
        // in on-surface-variant rather than the on-surface of real output.
        // Calling it `out` would make the app's own words indistinguishable
        // from what a command printed.
        lines: [line(t('md3.terminal.banner', { path }), 'prompt')],
        runId: null,
        pending: '',
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

  /** Push already-complete lines onto a session, oldest first. */
  private push(
    session: IMd3TerminalControllerSession,
    texts: ReadonlyArray<string>,
    kind: IMd3TerminalLine['kind']
  ): void {
    if (texts.length === 0) {
      return
    }
    const next = [...session.lines]
    for (const text of texts) {
      next.push(line(text, kind))
    }
    session.lines = next.slice(-MaximumLines)
  }

  /**
   * Append one whole line the controller itself authored — a banner, a refusal
   * or a failure notice. Never used for process output, which arrives in
   * chunks and goes through `appendOutput`.
   */
  private append(
    session: IMd3TerminalControllerSession,
    text: string,
    kind: IMd3TerminalLine['kind']
  ): void {
    this.push(session, [stripTerminalControlSequences(text)], kind)
  }

  /**
   * Append a streamed output chunk.
   *
   * Git colours its output whenever the command asked it to, so the chunk can
   * carry ANSI escape sequences that a plain-text renderer would draw as
   * literal `[32m` noise; they are stripped here with the same function the
   * view exports for the purpose. A chunk that stops mid-line leaves its tail
   * in `pending` rather than being emitted as a line of its own.
   */
  private appendOutput(
    session: IMd3TerminalControllerSession,
    chunk: string
  ): void {
    const combined =
      session.pending + stripTerminalControlSequences(chunk).replace(/\r/g, '')
    const parts = combined.split('\n')
    session.pending = parts.pop() ?? ''
    this.push(session, parts, 'out')
  }

  /** Emit whatever a run left behind without a final newline. */
  private flushPending(session: IMd3TerminalControllerSession): void {
    if (session.pending.length === 0) {
      return
    }
    const remainder = session.pending
    session.pending = ''
    this.push(session, [remainder], 'out')
  }

  private onOutput = (event: ICLICommandOutputEvent) => {
    const session = this.sessionForRun(event.id)
    if (session === undefined) {
      return
    }
    this.appendOutput(session, event.data)
    this.host.onChanged()
  }

  private onState = (event: ICLICommandStateEvent) => {
    const session = this.sessionForRun(event.id)
    if (session === undefined || event.state === 'running') {
      return
    }

    session.runId = null
    this.flushPending(session)

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

    // The contract's echo is `$ git status --short` — the prompt the user
    // typed at, then the command. The full working directory would push a
    // 60-character absolute path in front of every command in the scrollback.
    this.append(
      session,
      `${md3TerminalPrompt(session.repositoryPath)} ${trimmed}`,
      'cmd'
    )

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
      prompt: md3TerminalPrompt(session.repositoryPath),
      workingDirectory: session.repositoryPath,
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
      // A shell runs in a repository, so with none selected there is nothing to
      // open one in. Reporting that here is what stops the `add` button and the
      // empty state's action being controls that do nothing when pressed.
      canCreateSession: this.repositoryPath !== null,
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
