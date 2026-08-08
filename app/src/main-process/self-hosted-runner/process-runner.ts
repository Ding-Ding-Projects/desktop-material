import { spawn } from 'child_process'

import { killTreeAndWait } from '../build-run/kill-tree'

const DefaultCommandTimeoutMilliseconds = 30 * 60 * 1_000
const DefaultMaximumOutputBytes = 64 * 1024

export type SelfHostedRunnerProcessState = 'running' | 'stopped'

const RunnerEnvironmentKeys = new Set([
  'comspec',
  'computername',
  'home',
  'lang',
  'lc_all',
  'localappdata',
  'number_of_processors',
  'path',
  'pathext',
  'processor_architecture',
  'processor_identifier',
  'programdata',
  'programfiles',
  'programfiles(x86)',
  'psmodulepath',
  'systemdrive',
  'systemroot',
  'temp',
  'tmp',
  'userdomain',
  'username',
  'userprofile',
  'windir',
])

export interface ISelfHostedRunnerProcessResult {
  readonly exitCode: number | null
  readonly stdout: Buffer
  readonly stderr: Buffer
}

export interface ISelfHostedRunnerProcessRequest {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly input?: string
  readonly timeoutMilliseconds?: number
  readonly maxOutputBytes?: number
  readonly signal?: AbortSignal
}

export function safeSelfHostedRunnerProcessEnvironment(
  overrides: Readonly<Record<string, string>> | undefined
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      RunnerEnvironmentKeys.has(key.toLocaleLowerCase())
    ) {
      environment[key] = value
    }
  }
  Object.assign(environment, overrides ?? {})
  return environment
}

export interface ISelfHostedRunnerStopWaitDependencies {
  readonly readState: () => Promise<SelfHostedRunnerProcessState>
  readonly now: () => number
  readonly delay: (milliseconds: number) => Promise<void>
}

/** Do not report a stop until the identity-aware process probe proves it. */
export async function waitForSelfHostedRunnerProcessStop(
  dependencies: ISelfHostedRunnerStopWaitDependencies,
  deadlineMilliseconds: number = 5_000,
  pollIntervalMilliseconds: number = 100
): Promise<void> {
  const deadline = dependencies.now() + deadlineMilliseconds
  while (true) {
    if ((await dependencies.readState()) === 'stopped') {
      return
    }
    if (dependencies.now() >= deadline) {
      throw new Error('runner-process-stop-timeout')
    }
    await dependencies.delay(pollIntervalMilliseconds)
  }
}

/**
 * Run one bounded helper command. A timeout or output overflow terminates the
 * exact process tree and waits for the child close event before returning.
 */
export function runSelfHostedRunnerProcess(
  request: ISelfHostedRunnerProcessRequest
): Promise<ISelfHostedRunnerProcessResult> {
  return new Promise((resolve, reject) => {
    if (request.signal?.aborted) {
      reject(new Error('runner-operation-cancelled'))
      return
    }
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: safeSelfHostedRunnerProcessEnvironment(request.env),
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    let forcedError: Error | null = null
    let termination: Promise<boolean> | null = null
    const timeoutMilliseconds =
      request.timeoutMilliseconds ?? DefaultCommandTimeoutMilliseconds
    const maxOutputBytes = request.maxOutputBytes ?? DefaultMaximumOutputBytes

    const terminate = (reason: string) => {
      if (forcedError === null) {
        forcedError = new Error(reason)
      }
      if (termination !== null || child.pid === undefined) {
        return
      }
      termination = (async () => {
        const killed = await killTreeAndWait(
          child.pid!,
          () => child.exitCode === null && child.signalCode === null
        )
        if (!killed && child.exitCode === null && child.signalCode === null) {
          try {
            child.kill('SIGKILL')
          } catch {
            // The process may have exited while the tree kill was finishing.
          }
        }
        return killed
      })()
    }

    const finish = (
      error: Error | null,
      result?: ISelfHostedRunnerProcessResult
    ) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
      if (error !== null) {
        reject(error)
      } else {
        resolve(result!)
      }
    }

    const append = (target: Buffer[], value: Buffer) => {
      outputBytes += value.length
      if (outputBytes > maxOutputBytes) {
        terminate('command-output-too-large')
        return
      }
      target.push(value)
    }

    const timeout = setTimeout(
      () => terminate('command-timeout'),
      timeoutMilliseconds
    )
    const cancel = () => terminate('runner-operation-cancelled')
    request.signal?.addEventListener('abort', cancel, { once: true })

    child.stdout.on('data', value => append(stdout, Buffer.from(value)))
    child.stderr.on('data', value => append(stderr, Buffer.from(value)))
    child.on('error', error => finish(error))
    child.on('close', async exitCode => {
      if (forcedError !== null) {
        const terminated = termination === null ? false : await termination
        finish(
          terminated
            ? forcedError
            : new Error(`${forcedError.message}-tree-termination-failed`)
        )
        return
      }
      finish(null, {
        exitCode,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      })
    })

    child.stdin.on('error', () => undefined)
    if (request.input !== undefined) {
      child.stdin.end(request.input)
    } else {
      child.stdin.end()
    }
  })
}
