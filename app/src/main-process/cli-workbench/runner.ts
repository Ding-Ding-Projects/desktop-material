import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { WebContents } from 'electron'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
} from '../../lib/cli-workbench'
import * as ipcWebContents from '../ipc-webcontents'
import { killTree } from '../build-run/kill-tree'
import {
  CLICommandConcurrencyCap,
  CLICommandOutputLimiter,
  IResolvedCLICommandRequest,
  validateCLICommandRequest,
} from './runner-helpers'
import { resolveCLIWorkbenchTool } from './tool-resolver'

interface IActiveCLICommand {
  readonly request: IResolvedCLICommandRequest
  readonly sender: WebContents
  readonly child: ChildProcessWithoutNullStreams
  readonly pid: number | null
  readonly output: CLICommandOutputLimiter
  cancelled: boolean
  finished: boolean
  cleanup: () => void
}

const OutputTruncatedMessage =
  '\n[CLI workbench output truncated at the 4 MiB safety limit.]\n'

/** Bounded main-process runner for explicit Git and GitHub CLI argv. */
export class CLIWorkbenchRunner {
  private readonly runs = new Map<string, IActiveCLICommand>()

  public async start(value: unknown, sender: WebContents): Promise<void> {
    if (this.runs.size >= CLICommandConcurrencyCap) {
      throw new Error('Too many CLI commands are already running.')
    }

    const request = await validateCLICommandRequest(value)
    // Validation touches the filesystem. Recheck after that await so a burst
    // of simultaneous requests cannot all pass the initial capacity check.
    if (this.runs.size >= CLICommandConcurrencyCap) {
      throw new Error('Too many CLI commands are already running.')
    }
    if (this.runs.has(request.id)) {
      throw new Error('A CLI command with this id is already running.')
    }

    let executable: string
    let toolEnv: Record<string, string | undefined>
    try {
      const resolved = resolveCLIWorkbenchTool(request.tool)
      executable = resolved.executable
      toolEnv = resolved.env
    } catch {
      throw new Error(`Unable to start ${request.tool}.`)
    }
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(executable, [...request.args], {
        cwd: request.repositoryPath,
        env: toolEnv,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
    } catch {
      throw new Error(`Unable to start ${request.tool}.`)
    }

    const run: IActiveCLICommand = {
      request,
      sender,
      child,
      pid: child.pid ?? null,
      output: new CLICommandOutputLimiter(),
      cancelled: false,
      finished: false,
      cleanup: () => {},
    }
    this.runs.set(request.id, run)

    const onNavigate = () => {
      void this.cancel(request.id, sender)
    }
    const onDestroyed = () => {
      void this.cancel(request.id, sender)
    }
    sender.on('did-start-navigation', onNavigate)
    sender.once('destroyed', onDestroyed)
    run.cleanup = () => {
      try {
        sender.removeListener('did-start-navigation', onNavigate)
        sender.removeListener('destroyed', onDestroyed)
      } catch {
        // The originating renderer may already be gone.
      }
    }

    child.stdout.on('data', (chunk: Buffer) =>
      this.emitOutputChunk(run, 'stdout', chunk)
    )
    child.stderr.on('data', (chunk: Buffer) =>
      this.emitOutputChunk(run, 'stderr', chunk)
    )
    // Current named operations never accept stdin. Closing it prevents a
    // fixed recipe from becoming an interactive command surface.
    child.stdin.on('error', () => undefined)
    child.stdin.end()
    child.once('error', () => {
      this.finish(run, {
        id: request.id,
        state: 'failed',
        exitCode: null,
        signal: null,
        error: `Unable to run ${request.tool}.`,
      })
    })
    child.once('close', (code, signal) => {
      if (run.finished) {
        return
      }
      this.flushOutput(run)
      const state = run.cancelled
        ? 'cancelled'
        : code === 0
        ? 'completed'
        : 'failed'
      this.finish(run, {
        id: request.id,
        state,
        exitCode: code,
        signal,
      })
    })

    this.emitState(run, {
      id: request.id,
      state: 'running',
      exitCode: null,
      signal: null,
    })
  }

  /** Cancel only the matching run owned by the requesting renderer. */
  public async cancel(id: string, sender?: WebContents): Promise<boolean> {
    const run = this.runs.get(id)
    if (run === undefined || (sender !== undefined && run.sender !== sender)) {
      return false
    }
    if (run.cancelled || run.finished) {
      return true
    }
    run.cancelled = true
    run.child.stdin.end()
    if (run.pid !== null) {
      killTree(run.pid)
    }
    return true
  }

  /** Kill every exact PID tree during application shutdown. */
  public killAll(): void {
    for (const run of this.runs.values()) {
      run.cancelled = true
      run.child.stdin.end()
      if (run.pid !== null) {
        killTree(run.pid)
      }
    }
  }

  private emitOutputChunk(
    run: IActiveCLICommand,
    stream: ICLICommandOutputEvent['stream'],
    chunk: Buffer
  ): void {
    const limited = run.output.write(stream, chunk)
    if (limited.data.length > 0) {
      this.emitOutput(run, { id: run.request.id, stream, data: limited.data })
    }
    if (limited.didTruncate) {
      this.emitOutput(run, {
        id: run.request.id,
        stream: 'stderr',
        data: OutputTruncatedMessage,
      })
    }
  }

  private flushOutput(run: IActiveCLICommand): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const data = run.output.end(stream)
      if (data.length > 0) {
        this.emitOutput(run, { id: run.request.id, stream, data })
      }
    }
  }

  private emitOutput(
    run: IActiveCLICommand,
    event: ICLICommandOutputEvent
  ): void {
    if (!run.sender.isDestroyed()) {
      ipcWebContents.send(run.sender, 'cli-command-output', event)
    }
  }

  private emitState(
    run: IActiveCLICommand,
    event: ICLICommandStateEvent
  ): void {
    if (!run.sender.isDestroyed()) {
      ipcWebContents.send(run.sender, 'cli-command-state', event)
    }
  }

  private finish(run: IActiveCLICommand, event: ICLICommandStateEvent): void {
    if (run.finished) {
      return
    }
    run.finished = true
    run.cleanup()
    if (this.runs.get(run.request.id) === run) {
      this.runs.delete(run.request.id)
    }
    this.emitState(run, event)
  }
}

export const cliWorkbenchRunner = new CLIWorkbenchRunner()
