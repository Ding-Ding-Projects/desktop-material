import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { lstat, open, realpath } from 'node:fs/promises'
import * as Path from 'node:path'

import {
  AgentSetupExecutableId,
  AgentSetupRunFailureReason,
  AgentSetupRunResult,
  IAgentSetupCommand,
  validateAgentSetupCommands,
} from '../lib/agent-sessions/setup-commands'
import { resolveRunEnv } from '../lib/build-run/resolve-user-path'
import { resolveExecutable } from './build-run/runner'
import { killTreeAndWait } from './build-run/kill-tree'
import { AgentOperationRegistry } from './build-run/agent-operation-registry'
import { resolveCLIWorkbenchTool } from './cli-workbench/tool-resolver'
import * as ipcMain from './ipc-main'

export const AgentSetupCommandTimeoutMilliseconds = 5 * 60 * 1000
export const AgentSetupCommandOutputLimitBytes = 64 * 1024
const MaximumWorktreePathLength = 1024
const MaximumGitPointerBytes = 4 * 1024

const ExecutableNames: Readonly<Record<AgentSetupExecutableId, string>> = {
  git: 'git',
  node: 'node',
  python: 'python',
  py: 'py',
  dotnet: 'dotnet',
  cargo: 'cargo',
  go: 'go',
  java: 'java',
}

interface IAgentSetupProcessResult {
  readonly status: 'succeeded' | 'cancelled' | 'failed'
  readonly reason?: AgentSetupRunFailureReason
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidRequestResult(): AgentSetupRunResult {
  return {
    status: 'failed',
    completed: 0,
    commandIndex: null,
    reason: 'invalid-request',
  }
}

function hasSafeOperationId(
  value: unknown
): value is Readonly<{ operationId: string }> {
  return (
    isRecord(value) &&
    typeof value.operationId === 'string' &&
    value.operationId.length > 0 &&
    value.operationId.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value.operationId)
  )
}

export interface IAgentSetupProcessExecutor {
  execute(
    command: IAgentSetupCommand,
    worktreePath: string,
    signal: AbortSignal,
    validateWorktree: () => Promise<boolean>
  ): Promise<IAgentSetupProcessResult>
  killAll(): Promise<void>
}

export interface IAgentSetupDirectoryValidator {
  isGitWorktree(
    path: string,
    repositoryPath: string,
    branchName: string
  ): Promise<boolean>
}

const SafeEnvironmentNames = new Set(
  [
    'APPDATA',
    'COMMONPROGRAMFILES',
    'COMMONPROGRAMFILES(X86)',
    'COMMONPROGRAMW6432',
    'COMSPEC',
    'HOMEDRIVE',
    'HOMEPATH',
    'LANG',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'PATH',
    'PATHEXT',
    'PROGRAMDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMW6432',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
  ].map(name => name.toLocaleUpperCase('en-US'))
)

/** Keep tool discovery and OS basics, but never inherit credential variables. */
export function buildAgentSetupEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const safe: Record<string, string> = { CI: 'true' }
  for (const [name, value] of Object.entries(environment)) {
    if (
      value !== undefined &&
      SafeEnvironmentNames.has(name.toLocaleUpperCase('en-US'))
    ) {
      safe[name] = value
    }
  }
  return safe
}

/** Resolve packaged Git with Dugite's required private runtime environment. */
export function resolveAgentSetupGitTool(
  environment: Readonly<Record<string, string>>,
  runtimeDirectory: string = __dirname
): { readonly executable: string; readonly env: Record<string, string> } {
  const resolved = resolveCLIWorkbenchTool(
    'git',
    { ...environment },
    runtimeDirectory
  )
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(resolved.env)) {
    if (value !== undefined) {
      env[name] = value
    }
  }
  return { executable: resolved.executable, env }
}

function sameCanonicalPath(left: string, right: string): boolean {
  return (
    Path.resolve(left).toLocaleLowerCase('en-US') ===
    Path.resolve(right).toLocaleLowerCase('en-US')
  )
}

async function readBoundedRegularFile(path: string): Promise<string | null> {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.size > MaximumGitPointerBytes) {
    return null
  }
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(MaximumGitPointerBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return bytesRead > MaximumGitPointerBytes
      ? null
      : buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

export class FileSystemAgentSetupDirectoryValidator
  implements IAgentSetupDirectoryValidator
{
  public async isGitWorktree(
    path: string,
    repositoryPath: string,
    branchName: string
  ): Promise<boolean> {
    if (
      !Path.isAbsolute(path) ||
      !Path.isAbsolute(repositoryPath) ||
      path.length === 0 ||
      path.length > MaximumWorktreePathLength ||
      repositoryPath.length === 0 ||
      repositoryPath.length > MaximumWorktreePathLength ||
      branchName.length === 0 ||
      branchName.length > 240 ||
      /[\u0000-\u001f\u007f]/.test(path) ||
      /[\u0000-\u001f\u007f]/.test(repositoryPath) ||
      /[\u0000-\u001f\u007f]/.test(branchName)
    ) {
      return false
    }
    try {
      const directory = await lstat(path)
      const canonicalWorktree = await realpath(path)
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        !sameCanonicalPath(path, canonicalWorktree)
      ) {
        return false
      }

      const repositoryMarkerPath = Path.join(repositoryPath, '.git')
      const repositoryMarker = await lstat(repositoryMarkerPath)
      let expectedCommonDirectory: string
      if (repositoryMarker.isDirectory()) {
        expectedCommonDirectory = await realpath(repositoryMarkerPath)
      } else {
        const repositoryPointer = await readBoundedRegularFile(
          repositoryMarkerPath
        )
        const repositoryMatch = repositoryPointer?.match(
          /^gitdir: ([^\r\n]+)\r?\n?$/
        )
        if (repositoryMatch == null) {
          return false
        }
        const repositoryAdministrativePath = Path.resolve(
          repositoryPath,
          repositoryMatch[1]
        )
        const commonPointer = await readBoundedRegularFile(
          Path.join(repositoryAdministrativePath, 'commondir')
        )
        const commonMatch = commonPointer?.match(/^([^\r\n]+)\r?\n?$/)
        if (commonMatch == null) {
          return false
        }
        expectedCommonDirectory = await realpath(
          Path.resolve(repositoryAdministrativePath, commonMatch[1])
        )
      }
      const markerPath = Path.join(canonicalWorktree, '.git')
      const marker = await readBoundedRegularFile(markerPath)
      const match = marker?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
      if (match == null || /[\u0000-\u001f\u007f]/.test(match[1])) {
        return false
      }

      const administrativePath = Path.resolve(canonicalWorktree, match[1])
      const administrativeDirectory = await lstat(administrativePath)
      const canonicalAdministrativePath = await realpath(administrativePath)
      if (
        !administrativeDirectory.isDirectory() ||
        administrativeDirectory.isSymbolicLink() ||
        !sameCanonicalPath(administrativePath, canonicalAdministrativePath) ||
        Path.basename(
          Path.dirname(canonicalAdministrativePath)
        ).toLocaleLowerCase('en-US') !== 'worktrees'
      ) {
        return false
      }

      const actualCommonDirectory = Path.dirname(
        Path.dirname(canonicalAdministrativePath)
      )
      if (!sameCanonicalPath(actualCommonDirectory, expectedCommonDirectory)) {
        return false
      }

      const head = await readBoundedRegularFile(
        Path.join(canonicalAdministrativePath, 'HEAD')
      )
      if (head?.trim() !== `ref: refs/heads/${branchName}`) {
        return false
      }

      const backpointer = await readBoundedRegularFile(
        Path.join(canonicalAdministrativePath, 'gitdir')
      )
      const backpointerMatch = backpointer?.match(/^([^\r\n]+)\r?\n?$/)
      if (
        backpointerMatch == null ||
        /[\u0000-\u001f\u007f]/.test(backpointerMatch[1])
      ) {
        return false
      }
      return sameCanonicalPath(
        Path.resolve(canonicalAdministrativePath, backpointerMatch[1]),
        markerPath
      )
    } catch {
      return false
    }
  }
}

/**
 * Real shell-free process host. It deliberately counts and discards output:
 * setup output can contain package-registry credentials and never crosses IPC
 * or enters a log, while a maliciously noisy command is still bounded.
 */
export class BoundedAgentSetupProcessExecutor
  implements IAgentSetupProcessExecutor
{
  private readonly children = new Map<
    ChildProcessWithoutNullStreams,
    (reason: AgentSetupRunFailureReason | null) => Promise<boolean>
  >()

  public constructor(
    private readonly timeoutMilliseconds = AgentSetupCommandTimeoutMilliseconds,
    private readonly outputLimitBytes = AgentSetupCommandOutputLimitBytes
  ) {}

  public async execute(
    command: IAgentSetupCommand,
    worktreePath: string,
    signal: AbortSignal,
    validateWorktree: () => Promise<boolean>
  ): Promise<IAgentSetupProcessResult> {
    if (signal.aborted) {
      return { status: 'cancelled' }
    }

    let env = buildAgentSetupEnvironment(resolveRunEnv())
    let executable: string
    if (command.executable === 'git') {
      const git = resolveAgentSetupGitTool(env)
      executable = git.executable
      env = git.env
    } else {
      const requestedExecutable = ExecutableNames[command.executable]
      executable = await resolveExecutable(requestedExecutable, env)
    }
    if (signal.aborted) {
      return { status: 'cancelled' }
    }
    // Batch and PowerShell shims require a command interpreter. Setup commands
    // never take that escape hatch: only native executables are accepted.
    if (
      process.platform === 'win32' &&
      (!/\.(?:exe|com)$/i.test(executable) ||
        /\.(?:cmd|bat|ps1)$/i.test(executable))
    ) {
      return { status: 'failed', reason: 'executable-unavailable' }
    }

    try {
      // Executable discovery can await. Re-prove the exact repository and
      // branch after discovery, in the final step before the synchronous
      // shell-free spawn, so a replaced worktree never receives a command.
      if (!(await validateWorktree())) {
        return { status: 'failed', reason: 'worktree-unavailable' }
      }
    } catch {
      return { status: 'failed', reason: 'worktree-unavailable' }
    }
    if (signal.aborted) {
      return { status: 'cancelled' }
    }

    return new Promise<IAgentSetupProcessResult>(resolve => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(executable, [...command.args], {
          cwd: worktreePath,
          env,
          windowsHide: true,
          shell: false,
          detached: process.platform !== 'win32',
        })
      } catch {
        resolve({ status: 'failed', reason: 'spawn-failed' })
        return
      }

      // A missing executable can close stdin before the ChildProcess emits its
      // own error. Keep that stream failure private and let the process-level
      // handler return the fixed spawn-failed reason.
      child.stdin.on('error', () => undefined)
      child.stdin.end()
      let settled = false
      let outputBytes = 0
      let forcedReason: AgentSetupRunFailureReason | null = null
      let termination: Promise<boolean> | null = null

      const terminate = (
        reason: AgentSetupRunFailureReason | null
      ): Promise<boolean> => {
        if (reason !== null && forcedReason === null) {
          forcedReason = reason
        }
        if (termination !== null) {
          return termination
        }
        termination = (async () => {
          if (child.pid === undefined) {
            return false
          }
          const killed = await killTreeAndWait(
            child.pid,
            () => child.exitCode === null && child.signalCode === null
          )
          if (!killed && child.exitCode === null && child.signalCode === null) {
            try {
              return child.kill('SIGKILL')
            } catch {
              return false
            }
          }
          return killed
        })()
        return termination
      }
      this.children.set(child, terminate)
      const onAbort = () => void terminate(null)
      signal.addEventListener('abort', onAbort, { once: true })
      // Abort can race between the initial check and listener registration.
      if (signal.aborted) {
        void terminate(null)
      }
      const timeout = setTimeout(
        () => void terminate('timeout'),
        this.timeoutMilliseconds
      )
      const onOutput = (chunk: Buffer) => {
        outputBytes += chunk.byteLength
        if (outputBytes > this.outputLimitBytes && forcedReason === null) {
          void terminate('output-limit')
        }
      }
      child.stdout.on('data', onOutput)
      child.stderr.on('data', onOutput)

      const done = (result: IAgentSetupProcessResult) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        this.children.delete(child)
        resolve(result)
      }
      child.on('error', () =>
        done({ status: 'failed', reason: 'spawn-failed' })
      )
      child.on('close', code => {
        if (signal.aborted) {
          done({ status: 'cancelled' })
        } else if (forcedReason !== null) {
          done({ status: 'failed', reason: forcedReason })
        } else if (code === 0) {
          done({ status: 'succeeded' })
        } else {
          done({ status: 'failed', reason: 'exit-code' })
        }
      })
    })
  }

  public async killAll(): Promise<void> {
    const children = [...this.children.entries()]
    const closed = children.map(
      ([child]) =>
        new Promise<void>(resolve => child.once('close', () => resolve()))
    )
    await Promise.all(children.map(([, terminate]) => terminate(null)))
    await Promise.all(closed)
  }
}

export class AgentSetupCommandRunner {
  private readonly shutdownController = new AbortController()
  private readonly activeRuns = new Set<Promise<AgentSetupRunResult>>()

  public constructor(
    private readonly executor: IAgentSetupProcessExecutor = new BoundedAgentSetupProcessExecutor(),
    private readonly directoryValidator: IAgentSetupDirectoryValidator = new FileSystemAgentSetupDirectoryValidator()
  ) {}

  public run(
    request: unknown,
    signal: AbortSignal
  ): Promise<AgentSetupRunResult> {
    if (this.shutdownController.signal.aborted) {
      return Promise.resolve({
        status: 'cancelled',
        completed: 0,
        commandIndex: null,
      })
    }
    const combinedSignal = AbortSignal.any([
      signal,
      this.shutdownController.signal,
    ])
    const execution = this.runCommands(request, combinedSignal)
    this.activeRuns.add(execution)
    void execution.then(
      () => this.activeRuns.delete(execution),
      () => this.activeRuns.delete(execution)
    )
    return execution
  }

  private async runCommands(
    request: unknown,
    signal: AbortSignal
  ): Promise<AgentSetupRunResult> {
    if (
      !isRecord(request) ||
      typeof request.repositoryPath !== 'string' ||
      typeof request.branchName !== 'string' ||
      typeof request.worktreePath !== 'string' ||
      request.repositoryPath.length === 0 ||
      request.branchName.length === 0 ||
      request.worktreePath.length === 0
    ) {
      return invalidRequestResult()
    }
    // Capture the narrowed identity before any await or callback. Besides
    // keeping TypeScript's narrowing stable, this prevents a mutable test or
    // in-process caller from swapping the validated strings mid-run.
    const worktreePath = request.worktreePath
    const repositoryPath = request.repositoryPath
    const branchName = request.branchName
    const problems = validateAgentSetupCommands(request.commands)
    if (problems.length > 0) {
      return invalidRequestResult()
    }
    const commands = request.commands as ReadonlyArray<IAgentSetupCommand>
    if (signal.aborted) {
      return { status: 'cancelled', completed: 0, commandIndex: null }
    }
    if (
      !(await this.directoryValidator.isGitWorktree(
        worktreePath,
        repositoryPath,
        branchName
      ))
    ) {
      return {
        status: 'failed',
        completed: 0,
        commandIndex: null,
        reason: 'worktree-unavailable',
      }
    }

    const enabled = commands
      .map((command, originalIndex) => ({ command, originalIndex }))
      .filter(entry => entry.command.enabled)
    let completed = 0
    for (const entry of enabled) {
      if (signal.aborted) {
        return {
          status: 'cancelled',
          completed,
          commandIndex: entry.originalIndex,
        }
      }
      if (
        !(await this.directoryValidator.isGitWorktree(
          worktreePath,
          repositoryPath,
          branchName
        ))
      ) {
        return {
          status: 'failed',
          completed,
          commandIndex: entry.originalIndex,
          reason: 'worktree-unavailable',
        }
      }
      let result: IAgentSetupProcessResult
      try {
        result = await this.executor.execute(
          entry.command,
          worktreePath,
          signal,
          () =>
            this.directoryValidator.isGitWorktree(
              worktreePath,
              repositoryPath,
              branchName
            )
        )
      } catch {
        if (signal.aborted) {
          return {
            status: 'cancelled',
            completed,
            commandIndex: entry.originalIndex,
          }
        }
        return {
          status: 'failed',
          completed,
          commandIndex: entry.originalIndex,
          reason: 'spawn-failed',
        }
      }
      if (result.status === 'cancelled') {
        return {
          status: 'cancelled',
          completed,
          commandIndex: entry.originalIndex,
        }
      }
      if (result.status === 'failed') {
        return {
          status: 'failed',
          completed,
          commandIndex: entry.originalIndex,
          reason: result.reason ?? 'spawn-failed',
        }
      }
      completed++
    }
    if (
      !(await this.directoryValidator.isGitWorktree(
        worktreePath,
        repositoryPath,
        branchName
      ))
    ) {
      return {
        status: 'failed',
        completed,
        commandIndex: null,
        reason: 'worktree-unavailable',
      }
    }
    return { status: 'succeeded', completed }
  }

  public async killAll(): Promise<void> {
    this.shutdownController.abort()
    await this.executor.killAll()
    await Promise.allSettled([...this.activeRuns])
    // A run already resolving an executable when shutdown began observes the
    // combined signal before spawn. The second sweep proves no child appeared
    // at that boundary before shutdown ownership is released.
    await this.executor.killAll()
  }
}

export const agentSetupCommandRunner = new AgentSetupCommandRunner()
const operations = new AgentOperationRegistry()

export function registerAgentSetupCommandRunnerIpc(): void {
  ipcMain.handle('run-agent-setup-commands', async (event, request) => {
    if (!hasSafeOperationId(request)) {
      return invalidRequestResult()
    }
    return operations.run(event.sender, request.operationId, controller =>
      agentSetupCommandRunner.run(request, controller.signal)
    )
  })
  ipcMain.handle(
    'cancel-agent-setup-commands',
    async (event, operationId) =>
      hasSafeOperationId({ operationId }) &&
      operations.cancel(event.sender, operationId)
  )
}
