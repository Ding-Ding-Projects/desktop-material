import { createHash, randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import * as Path from 'path'

import { readBoundedActionsJSON } from '../../lib/actions-response'
import { decodeWslOutput } from '../../lib/editors/wsl'
import { EndpointToken } from '../../lib/endpoint-token'
import {
  ISelfHostedRunner,
  ISelfHostedRunnerCreateWslRequest,
  ISelfHostedRunnerControlRequest,
  ISelfHostedRunnerProgress,
  ISelfHostedRunnerRemoveRequest,
  ISelfHostedRunnerRemoveResult,
  ISelfHostedRunnerSetupRequest,
  ISelfHostedRunnerSetupResult,
  ISelfHostedRunnerStatusRequest,
  ISelfHostedRunnerStatus,
  ISelfHostedRunnerWslResult,
  SelfHostedRunnerPlatform,
  SelfHostedRunnerProgressPhase,
  SelfHostedRunnerReply,
  SelfHostedRunnerStatus as RunnerStatus,
} from '../../lib/self-hosted-runner/types'

const ManagedRootName = 'self-hosted-runners'
const StateFileName = 'runners.json'
const RunnerUser = 'desktop-material-runner'
const LinuxRunnerRoot = '/opt/desktop-material-runners'
const MaximumOutputBytes = 64 * 1024
const MaximumDownloadBytes = 512 * 1024 * 1024
const CommandTimeoutMilliseconds = 30 * 60 * 1_000
const WslCommandTimeoutMilliseconds = 30 * 60 * 1_000
const NetworkTimeoutMilliseconds = 30 * 60 * 1_000
const RunnerReleaseAPI =
  'https://api.github.com/repos/actions/runner/releases/latest'
const RunnerUserAgent = 'Desktop-Material-self-hosted-runner-manager'
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

function systemExecutable(name: string): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return Path.join(systemRoot, 'System32', name)
}

function powershellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return Path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
}

type ProcessResult = {
  readonly exitCode: number | null
  readonly stdout: Buffer
  readonly stderr: Buffer
}

interface IProcessRequest {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly input?: string
  readonly timeoutMilliseconds?: number
  readonly maxOutputBytes?: number
}

interface ILaunchResult {
  readonly pid: number
}

interface IDiskRunnerRecord {
  readonly id: string
  readonly owner: string
  readonly repository: string
  readonly githubApiEndpoint: string
  readonly name: string
  readonly labels: ReadonlyArray<string>
  readonly platform: SelfHostedRunnerPlatform
  readonly wslDistribution: string | null
  readonly dedicatedWsl: boolean
  readonly createdAt: string
  readonly pid: number | null
  readonly status: RunnerStatus
}

interface IRunnerReleaseAsset {
  readonly name: string
  readonly browser_download_url: string
  readonly digest?: string | null
}

interface IRunnerRelease {
  readonly assets?: ReadonlyArray<IRunnerReleaseAsset>
}

class SelfHostedRunnerManagerError extends Error {
  public constructor(
    public readonly code: string,
    public readonly recovery: string
  ) {
    super(code)
  }
}

function safeProcessEnvironment(
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

function runProcess(request: IProcessRequest): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: safeProcessEnvironment(request.env),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const timeoutMilliseconds =
      request.timeoutMilliseconds ?? CommandTimeoutMilliseconds
    const maxOutputBytes = request.maxOutputBytes ?? MaximumOutputBytes

    const finish = (error?: Error, result?: ProcessResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error !== undefined) {
        reject(error)
      } else {
        resolve(result!)
      }
    }

    const append = (target: Buffer[], value: Buffer) => {
      outputBytes += value.length
      if (outputBytes > maxOutputBytes) {
        child.kill()
        finish(new Error('command-output-too-large'))
        return
      }
      target.push(value)
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('command-timeout'))
    }, timeoutMilliseconds)

    child.stdout?.on('data', value => append(stdout, Buffer.from(value)))
    child.stderr?.on('data', value => append(stderr, Buffer.from(value)))
    child.on('error', error => finish(error))
    child.on('close', exitCode => {
      finish(undefined, {
        exitCode,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      })
    })

    if (request.input !== undefined) {
      child.stdin?.end(request.input)
    } else {
      child.stdin?.end()
    }
  })
}

function launchProcess(
  request: Omit<IProcessRequest, 'input' | 'timeoutMilliseconds'>
): ILaunchResult {
  const child = spawn(request.executable, [...request.args], {
    cwd: request.cwd,
    env: safeProcessEnvironment(request.env),
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
  })
  child.unref()
  if (child.pid === undefined) {
    throw new Error('runner-process-did-not-start')
  }
  return { pid: child.pid }
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
  )
}

function validateSafeIdentifier(
  value: unknown,
  maximum: number,
  label: string
): string {
  if (
    !isNonEmptyString(value, maximum) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new SelfHostedRunnerManagerError(
      'invalid-runner-configuration',
      `Use a ${label} containing only letters, numbers, dots, hyphens, and underscores.`
    )
  }
  return value
}

function validateRepositoryPart(value: unknown, label: string): string {
  if (
    !isNonEmptyString(value, 100) ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(value)
  ) {
    throw new SelfHostedRunnerManagerError(
      'invalid-runner-configuration',
      `Use a valid GitHub ${label}.`
    )
  }
  return value
}

function normalizeLabels(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new SelfHostedRunnerManagerError(
      'invalid-runner-configuration',
      'Add between one and twenty runner labels.'
    )
  }
  const labels = value.map(label => validateSafeIdentifier(label, 64, 'label'))
  return [...new Set(labels)]
}

function normalizeDistribution(value: unknown, label: string): string {
  return validateSafeIdentifier(value, 128, label)
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function quoteCmd(value: string): string {
  return `"${value.replace(/["&|<>^]/g, '^$&')}"`
}

function runnerDirectory(root: string, id: string): string {
  return Path.join(root, id, 'runner')
}

function runnerTempDirectory(root: string, id: string): string {
  return Path.join(root, id, 'downloads')
}

function runnerIdIsSafe(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(value)
  )
}

function toWslMountPath(value: string): string {
  const match = /^([A-Za-z]):\\(.*)$/.exec(value)
  if (match === null) {
    throw new SelfHostedRunnerManagerError(
      'invalid-runner-path',
      'The managed runner directory must be on a local Windows drive.'
    )
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`
}

function digestFromReleaseAsset(asset: IRunnerReleaseAsset): string {
  const digest = asset.digest ?? ''
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new SelfHostedRunnerManagerError(
      'runner-package-unverified',
      'The runner package did not include a verifiable SHA-256 digest.'
    )
  }
  return digest.slice('sha256:'.length).toLowerCase()
}

function runnerAssetName(platform: SelfHostedRunnerPlatform): string {
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `actions-runner-${
    platform === 'windows' ? 'win' : 'linux'
  }-${architecture}-`
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number
): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error('response-body-missing')
  }
  const chunks: Buffer[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        return Buffer.concat(chunks, length)
      }
      const chunk = Buffer.from(next.value)
      length += chunk.length
      if (length > maximumBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('response-body-too-large')
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds: number
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadAndVerifyRunner(
  platform: SelfHostedRunnerPlatform,
  destination: string
): Promise<void> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      RunnerReleaseAPI,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': RunnerUserAgent,
        },
        redirect: 'error',
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-release-unavailable',
      'The Actions runner release could not be reached. Check the network and retry.'
    )
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new SelfHostedRunnerManagerError(
      'runner-release-unavailable',
      'The Actions runner release could not be read. Check the network and retry.'
    )
  }
  let release: IRunnerRelease
  try {
    const text = (await readBoundedBody(response, 2 * 1024 * 1024)).toString(
      'utf8'
    )
    release = JSON.parse(text) as IRunnerRelease
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-release-invalid',
      'The Actions runner release metadata was not valid. Retry after checking for a newer release.'
    )
  }

  const prefix = runnerAssetName(platform)
  const suffix = platform === 'windows' ? '.zip' : '.tar.gz'
  const asset = (release.assets ?? []).find(
    candidate =>
      candidate.name.startsWith(prefix) &&
      candidate.name.endsWith(suffix) &&
      /^https:\/\/github\.com\/actions\/runner\/releases\/download\//.test(
        candidate.browser_download_url
      )
  )
  if (asset === undefined) {
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'No compatible Actions runner package was published for this Windows host.'
    )
  }
  const expectedDigest = digestFromReleaseAsset(asset)

  let packageResponse: Response
  try {
    packageResponse = await fetchWithTimeout(
      asset.browser_download_url,
      {
        headers: { 'User-Agent': RunnerUserAgent },
        redirect: 'follow',
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'The Actions runner package could not be downloaded. Check the network and retry.'
    )
  }
  if (!packageResponse.ok) {
    await packageResponse.body?.cancel().catch(() => undefined)
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'The Actions runner package could not be downloaded. Check the network and retry.'
    )
  }
  const packageHost = new URL(packageResponse.url).hostname.toLocaleLowerCase()
  if (
    packageHost !== 'github.com' &&
    !packageHost.endsWith('.githubusercontent.com')
  ) {
    await packageResponse.body?.cancel().catch(() => undefined)
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'The runner package redirected to an untrusted host and was discarded.'
    )
  }
  const contentLength = Number(packageResponse.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MaximumDownloadBytes) {
    await packageResponse.body?.cancel().catch(() => undefined)
    throw new SelfHostedRunnerManagerError(
      'runner-package-too-large',
      'The runner package exceeded the safety limit and was discarded.'
    )
  }
  let bytes: Buffer
  try {
    bytes = await readBoundedBody(packageResponse, MaximumDownloadBytes)
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-package-too-large',
      'The downloaded runner package was empty or exceeded the safety limit.'
    )
  }
  if (bytes.length === 0 || bytes.length > MaximumDownloadBytes) {
    throw new SelfHostedRunnerManagerError(
      'runner-package-too-large',
      'The downloaded runner package was empty or exceeded the safety limit.'
    )
  }
  const actualDigest = createHash('sha256').update(bytes).digest('hex')
  if (actualDigest !== expectedDigest) {
    throw new SelfHostedRunnerManagerError(
      'runner-package-integrity-failed',
      'The downloaded runner package failed its SHA-256 integrity check and was discarded.'
    )
  }
  await writeFile(destination, bytes, { mode: 0o600 })
}

function commandFailure(
  label: string,
  result: ProcessResult | undefined,
  recovery: string
): SelfHostedRunnerManagerError {
  const suffix =
    result?.exitCode === null ? 'timed out' : 'exited unsuccessfully'
  return new SelfHostedRunnerManagerError(
    `${label}-failed`,
    `${label} ${suffix}. ${recovery}`
  )
}

function normalizeGitHubAPIEndpoint(value: unknown): string {
  if (!isNonEmptyString(value, 2_048)) {
    throw new SelfHostedRunnerManagerError(
      'invalid-github-account',
      'Select a signed-in GitHub account before managing a runner.'
    )
  }
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new SelfHostedRunnerManagerError(
      'invalid-github-account',
      'Select a signed-in GitHub account before managing a runner.'
    )
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0 ||
    !endpoint.pathname.endsWith('/')
  ) {
    throw new SelfHostedRunnerManagerError(
      'invalid-github-account',
      'The selected GitHub account endpoint is not a safe HTTPS API endpoint.'
    )
  }
  return endpoint.toString()
}

function githubRepositoryURL(
  apiEndpoint: string,
  owner: string,
  repository: string
): string {
  const endpoint = new URL(apiEndpoint)
  const htmlOrigin =
    endpoint.hostname.toLocaleLowerCase() === 'api.github.com'
      ? 'https://github.com/'
      : `${endpoint.origin}/`
  return `${htmlOrigin}${owner}/${repository}`
}

function validateRunnerToken(value: unknown): string {
  if (!isNonEmptyString(value, 16 * 1024) || /[\0\r\n]/.test(value)) {
    throw new SelfHostedRunnerManagerError(
      'runner-token-invalid',
      'GitHub returned an unusable runner token. Request a new token and retry.'
    )
  }
  return value
}

async function mintRunnerToken(
  endpoint: string,
  owner: string,
  repository: string,
  accountToken: string,
  action: 'registration' | 'remove'
): Promise<string> {
  const path = `repos/${owner}/${repository}/actions/runners/${action}-token`
  let response: Response
  try {
    response = await fetchWithTimeout(
      new URL(path, endpoint),
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accountToken}`,
          'User-Agent': RunnerUserAgent,
        },
        redirect: 'error',
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-token-request-failed',
      'GitHub did not issue a runner token. Check the selected account and network, then retry.'
    )
  }

  let value: unknown
  try {
    value = await readBoundedActionsJSON(response)
  } catch {
    throw new SelfHostedRunnerManagerError(
      'runner-token-request-failed',
      'GitHub returned an invalid runner-token response. Request a new token and retry.'
    )
  }
  if (!response.ok) {
    throw new SelfHostedRunnerManagerError(
      'runner-token-request-failed',
      'GitHub refused the runner-token request. Check repository Actions permission and retry.'
    )
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SelfHostedRunnerManagerError(
      'runner-token-invalid',
      'GitHub returned an invalid runner token. Request a new token and retry.'
    )
  }
  return validateRunnerToken((value as { token?: unknown }).token)
}

function isSafeStoredRunnerRecord(value: unknown): value is IDiskRunnerRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Partial<IDiskRunnerRecord>
  const safeRepositoryPart = (part: unknown) =>
    typeof part === 'string' &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(part)
  const safeName =
    typeof record.name === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(record.name)
  const labels = record.labels
  const safeLabels =
    Array.isArray(labels) &&
    labels.length > 0 &&
    labels.length <= 20 &&
    labels.every(
      label =>
        typeof label === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)
    ) &&
    new Set(labels).size === labels.length
  const safeDistribution =
    record.wslDistribution === null ||
    (typeof record.wslDistribution === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.wslDistribution))
  const safePid =
    record.pid === null ||
    (typeof record.pid === 'number' &&
      Number.isSafeInteger(record.pid) &&
      record.pid > 0)
  let safeEndpoint = false
  try {
    normalizeGitHubAPIEndpoint(record.githubApiEndpoint)
    safeEndpoint = true
  } catch {
    // Keep corrupt state out of process control paths.
  }
  return (
    runnerIdIsSafe(record.id) &&
    safeRepositoryPart(record.owner) &&
    safeRepositoryPart(record.repository) &&
    safeEndpoint &&
    safeName &&
    safeLabels &&
    (record.platform === 'windows' || record.platform === 'linux-wsl') &&
    safeDistribution &&
    typeof record.dedicatedWsl === 'boolean' &&
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    safePid &&
    (record.status === 'running' ||
      record.status === 'stopped' ||
      record.status === 'missing')
  )
}

/**
 * Owns all local state and processes for GitHub Actions self-hosted runners.
 * Renderer input is treated as hostile: identifiers are constrained, managed
 * paths are derived from an internal root, and registration/removal tokens are
 * consumed through stdin or a transient environment only.
 */
export class WindowsSelfHostedRunnerManager {
  private readonly root: string
  private readonly statePath: string
  private records: Array<IDiskRunnerRecord> | null = null
  private activeRunnerId: string | null = null
  private readonly accountTokens = new Map<string, string>()

  public constructor(
    userDataPath: string,
    private readonly onProgress: (progress: ISelfHostedRunnerProgress) => void
  ) {
    this.root = Path.join(userDataPath, ManagedRootName)
    this.statePath = Path.join(this.root, StateFileName)
  }

  /** Keep the app's existing in-memory account map available to the main process only. */
  public updateAccountTokens(accounts: ReadonlyArray<EndpointToken>): void {
    this.accountTokens.clear()
    for (const account of accounts) {
      if (
        !isNonEmptyString(account.token, 16 * 1024) ||
        /[\0\r\n]/.test(account.token)
      ) {
        continue
      }
      try {
        this.accountTokens.set(
          normalizeGitHubAPIEndpoint(account.endpoint),
          account.token
        )
      } catch {
        // Non-GitHub account endpoints are not eligible for this manager.
      }
    }
  }

  private progress(
    runnerId: string,
    phase: SelfHostedRunnerProgressPhase,
    detail: string
  ) {
    this.onProgress({ runnerId, phase, detail })
  }

  private async loadRecords(): Promise<Array<IDiskRunnerRecord>> {
    if (this.records !== null) {
      return this.records
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    try {
      const value: unknown = JSON.parse(await readFile(this.statePath, 'utf8'))
      if (
        typeof value !== 'object' ||
        value === null ||
        !Array.isArray((value as { runners?: unknown }).runners)
      ) {
        throw new Error('invalid-state')
      }
      const records = (value as { runners: unknown[] }).runners
      const ids = new Set<string>()
      if (
        !records.every(record => {
          if (!isSafeStoredRunnerRecord(record)) {
            return false
          }
          if (ids.has(record.id)) {
            return false
          }
          ids.add(record.id)
          return true
        })
      ) {
        throw new Error('invalid-state-record')
      }
      this.records = records as Array<IDiskRunnerRecord>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.records = []
      } else {
        throw new SelfHostedRunnerManagerError(
          'runner-state-corrupt',
          'The saved runner manager state could not be read. Preserve the managed folder and contact support.'
        )
      }
    }
    return this.records
  }

  private async saveRecords(): Promise<void> {
    const records = this.records ?? []
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ schemaVersion: 1, runners: records }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    await rename(temporaryPath, this.statePath)
  }

  private async listWslDistributions(): Promise<ReadonlyArray<string>> {
    if (process.platform !== 'win32') {
      return []
    }
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: ['--list', '--quiet'],
        timeoutMilliseconds: 5_000,
      })
    } catch {
      return []
    }
    if (result.exitCode !== 0) {
      return []
    }
    const seen = new Set<string>()
    const distributions: string[] = []
    for (const line of decodeWslOutput(result.stdout).split(/\r?\n/)) {
      const value = line.trim()
      if (
        value.length === 0 ||
        value.length > 128 ||
        /[\0-\x1f\x7f]/.test(value) ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
      ) {
        continue
      }
      const key = value.toLocaleLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        distributions.push(value)
      }
      if (distributions.length === 32) {
        break
      }
    }
    return distributions
  }

  private async isRunnerProcessRunning(
    record: IDiskRunnerRecord
  ): Promise<boolean> {
    if (record.pid === null || record.pid <= 0) {
      return false
    }
    try {
      process.kill(record.pid, 0)
    } catch {
      return false
    }
    const query = `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${record.pid}' | Select-Object -First 1 ProcessId,CommandLine,ExecutablePath; if ($null -ne $p) { $p | ConvertTo-Json -Compress -Depth 2 }`
    try {
      const result = await runProcess({
        executable: powershellExecutable(),
        args: ['-NoProfile', '-NonInteractive', '-Command', query],
        timeoutMilliseconds: 5_000,
      })
      if (result.exitCode !== 0) {
        return false
      }
      const details = JSON.parse(result.stdout.toString('utf8')) as {
        CommandLine?: unknown
        ExecutablePath?: unknown
      }
      const commandLine =
        typeof details.CommandLine === 'string'
          ? details.CommandLine.toLocaleLowerCase()
          : ''
      const marker =
        record.platform === 'windows'
          ? Path.normalize(runnerDirectory(this.root, record.id))
              .replace(/\\/g, '/')
              .toLocaleLowerCase()
          : `${LinuxRunnerRoot}/${record.id}`.toLocaleLowerCase()
      return commandLine.replace(/\\/g, '/').includes(marker)
    } catch {
      return false
    }
  }

  private async refreshStatuses(records: Array<IDiskRunnerRecord>) {
    for (let index = 0; index < records.length; index++) {
      const record = records[index]
      const running = await this.isRunnerProcessRunning(record)
      records[index] = {
        ...record,
        status: running
          ? 'running'
          : record.platform === 'windows' &&
            !(await exists(runnerDirectory(this.root, record.id)))
          ? 'missing'
          : 'stopped',
        pid: running ? record.pid : null,
      }
    }
  }

  private publicRecord(record: IDiskRunnerRecord): ISelfHostedRunner {
    return {
      id: record.id,
      owner: record.owner,
      repository: record.repository,
      name: record.name,
      labels: record.labels,
      platform: record.platform,
      wslDistribution: record.wslDistribution,
      dedicatedWsl: record.dedicatedWsl,
      createdAt: record.createdAt,
      status: record.status,
    }
  }

  private normalizeScope(
    scope: ISelfHostedRunnerStatusRequest
  ): ISelfHostedRunnerStatusRequest {
    return {
      owner: validateRepositoryPart(scope.owner, 'owner'),
      repository: validateRepositoryPart(scope.repository, 'repository'),
    }
  }

  private recordsForScope(
    records: ReadonlyArray<IDiskRunnerRecord>,
    scope: ISelfHostedRunnerStatusRequest
  ): ReadonlyArray<IDiskRunnerRecord> {
    return records.filter(
      record =>
        record.owner === scope.owner && record.repository === scope.repository
    )
  }

  public async getStatus(
    request: ISelfHostedRunnerStatusRequest
  ): Promise<ISelfHostedRunnerStatus> {
    const scope = this.normalizeScope(request)
    if (process.platform !== 'win32') {
      return {
        supported: false,
        wslAvailable: false,
        distributions: [],
        runners: [],
        activeRunnerId: null,
      }
    }
    const records = await this.loadRecords()
    await this.refreshStatuses(records)
    await this.saveRecords()
    const distributions = await this.listWslDistributions()
    const scopedRecords = this.recordsForScope(records, scope)
    return {
      supported: true,
      wslAvailable: distributions.length > 0,
      distributions,
      runners: scopedRecords.map(record => this.publicRecord(record)),
      activeRunnerId: scopedRecords.some(
        record => record.id === this.activeRunnerId
      )
        ? this.activeRunnerId
        : null,
    }
  }

  private validateSetupRequest(
    request: ISelfHostedRunnerSetupRequest
  ): ISelfHostedRunnerSetupRequest {
    if (process.platform !== 'win32') {
      throw new SelfHostedRunnerManagerError(
        'unsupported-platform',
        'Self-hosted runner management is available from the Windows desktop app.'
      )
    }
    if (!runnerIdIsSafe(request.id)) {
      throw new SelfHostedRunnerManagerError(
        'invalid-runner-configuration',
        'The runner identifier is invalid. Start setup again.'
      )
    }
    const platform = request.platform
    if (platform !== 'windows' && platform !== 'linux-wsl') {
      throw new SelfHostedRunnerManagerError(
        'invalid-runner-configuration',
        'Choose Windows or Linux in WSL.'
      )
    }
    const normalized: ISelfHostedRunnerSetupRequest = {
      id: request.id,
      owner: validateRepositoryPart(request.owner, 'owner'),
      repository: validateRepositoryPart(request.repository, 'repository'),
      githubApiEndpoint: normalizeGitHubAPIEndpoint(request.githubApiEndpoint),
      name: validateSafeIdentifier(request.name, 64, 'runner name'),
      labels: normalizeLabels(request.labels),
      platform,
      wslDistribution:
        platform === 'linux-wsl' && request.wslDistribution !== undefined
          ? normalizeDistribution(request.wslDistribution, 'distribution')
          : undefined,
      createDedicatedWsl: request.createDedicatedWsl === true,
      wslBaseDistribution:
        platform === 'linux-wsl' && request.wslBaseDistribution !== undefined
          ? normalizeDistribution(
              request.wslBaseDistribution,
              'base distribution'
            )
          : undefined,
      dedicatedWslDistribution:
        platform === 'linux-wsl' &&
        request.dedicatedWslDistribution !== undefined
          ? normalizeDistribution(
              request.dedicatedWslDistribution,
              'dedicated distribution'
            )
          : undefined,
      autoInstallDependencies: request.autoInstallDependencies !== false,
    }
    if (platform === 'linux-wsl') {
      if (normalized.createDedicatedWsl) {
        if (
          normalized.wslBaseDistribution === undefined ||
          normalized.dedicatedWslDistribution === undefined
        ) {
          throw new SelfHostedRunnerManagerError(
            'invalid-wsl-selection',
            'Choose an existing base distro and a new dedicated distro name.'
          )
        }
      } else if (normalized.wslDistribution === undefined) {
        throw new SelfHostedRunnerManagerError(
          'invalid-wsl-selection',
          'Choose an existing WSL distribution or create a dedicated one.'
        )
      }
    }
    return normalized
  }

  private async ensureDependencies(
    request: ISelfHostedRunnerSetupRequest,
    runnerId: string,
    distribution: string | null
  ): Promise<void> {
    if (request.platform === 'windows') {
      this.progress(
        runnerId,
        'installing-windows-dependencies',
        'Checking for Git and the Windows runner prerequisites.'
      )
      try {
        const probe = await runProcess({
          executable: systemExecutable('where.exe'),
          args: ['git'],
          timeoutMilliseconds: 10_000,
        })
        if (probe.exitCode === 0) {
          return
        }
      } catch {
        // Install below.
      }
      if (!request.autoInstallDependencies) {
        throw new SelfHostedRunnerManagerError(
          'windows-dependencies-missing',
          'Git is required. Enable automatic dependency installation and retry.'
        )
      }
      let installed: ProcessResult
      try {
        installed = await runProcess({
          executable: 'winget.exe',
          args: [
            'install',
            '--id',
            'Git.Git',
            '--exact',
            '--scope',
            'user',
            '--accept-source-agreements',
            '--accept-package-agreements',
          ],
          timeoutMilliseconds: 30 * 60 * 1_000,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'windows-dependencies-install-failed',
          'Git could not be installed automatically. Install Git for Windows and retry.'
        )
      }
      if (installed.exitCode !== 0) {
        throw commandFailure(
          'Git installation',
          installed,
          'Install Git for Windows and retry.'
        )
      }
      return
    }

    if (distribution === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-wsl-selection',
        'Choose a WSL distribution before installing the Linux runner.'
      )
    }
    if (!request.autoInstallDependencies) {
      const probe = [
        'set -eu',
        'command -v bash >/dev/null 2>&1',
        'command -v tar >/dev/null 2>&1',
        `id -u ${RunnerUser} >/dev/null 2>&1`,
      ].join('\n')
      try {
        const result = await runProcess({
          executable: systemExecutable('wsl.exe'),
          args: [
            '--distribution',
            distribution,
            '--user',
            'root',
            '--exec',
            '/bin/bash',
            '-lc',
            probe,
          ],
          timeoutMilliseconds: WslCommandTimeoutMilliseconds,
          maxOutputBytes: 2 * 1024 * 1024,
        })
        if (result.exitCode === 0) {
          return
        }
      } catch {
        // Report the same actionable dependency message below.
      }
      throw new SelfHostedRunnerManagerError(
        'linux-dependencies-missing',
        'The selected WSL distro is missing the managed runner prerequisites. Enable automatic dependency installation and retry.'
      )
    }
    this.progress(
      runnerId,
      'installing-linux-dependencies',
      'Installing the Linux runner toolchain inside WSL.'
    )
    const packageList = [
      'ca-certificates',
      'curl',
      'git',
      'jq',
      'tar',
      'gzip',
      'unzip',
      'build-essential',
      'python3',
      'python3-pip',
      'pkg-config',
      'libssl-dev',
      'libffi-dev',
      'zlib1g-dev',
      'libicu-dev',
      'libkrb5-3',
    ]
    const linuxRunner = `${LinuxRunnerRoot}/${runnerId}`
    const script = [
      'set -eu',
      'command -v apt-get >/dev/null 2>&1',
      'export DEBIAN_FRONTEND=noninteractive',
      'apt-get update',
      `apt-get install -y --no-install-recommends ${packageList.join(' ')}`,
      `id -u ${RunnerUser} >/dev/null 2>&1 || useradd --create-home --shell /bin/bash ${RunnerUser}`,
      `install -d -m 0755 -o ${RunnerUser} -g ${RunnerUser} ${quoteShell(
        linuxRunner
      )}`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          distribution,
          '--user',
          'root',
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        timeoutMilliseconds: WslCommandTimeoutMilliseconds,
        maxOutputBytes: 2 * 1024 * 1024,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'linux-dependencies-install-failed',
        'WSL could not run the Linux dependency bootstrap. Check that the distro is Debian or Ubuntu and retry.'
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'Linux dependency installation',
        result,
        'Check that the WSL distro is Debian or Ubuntu with network access, then retry.'
      )
    }
  }

  private async createDedicatedWsl(
    request: ISelfHostedRunnerCreateWslRequest,
    runnerId: string
  ): Promise<ISelfHostedRunnerWslResult> {
    const baseDistribution = normalizeDistribution(
      request.baseDistribution,
      'base distribution'
    )
    const dedicatedDistribution = normalizeDistribution(
      request.dedicatedDistribution,
      'dedicated distribution'
    )
    const distributions = await this.listWslDistributions()
    const matches = (value: string, candidate: string) =>
      value.toLocaleLowerCase() === candidate.toLocaleLowerCase()
    if (
      !distributions.some(distribution =>
        matches(distribution, baseDistribution)
      )
    ) {
      throw new SelfHostedRunnerManagerError(
        'wsl-base-not-found',
        'The selected base WSL distro is no longer installed. Refresh the list and retry.'
      )
    }
    if (
      distributions.some(distribution =>
        matches(distribution, dedicatedDistribution)
      )
    ) {
      throw new SelfHostedRunnerManagerError(
        'wsl-dedicated-name-exists',
        'That dedicated WSL name is already in use. Choose another name.'
      )
    }
    const installDirectory = Path.join(this.root, 'wsl', dedicatedDistribution)
    if (await exists(installDirectory)) {
      throw new SelfHostedRunnerManagerError(
        'wsl-managed-directory-exists',
        'The managed WSL directory already exists. Choose another distro name or remove the incomplete directory.'
      )
    }
    await mkdir(Path.dirname(installDirectory), {
      recursive: true,
      mode: 0o700,
    })
    const archivePath = Path.join(
      Path.dirname(installDirectory),
      `${dedicatedDistribution}-${randomUUID()}.tar`
    )
    this.progress(
      runnerId,
      'creating-wsl',
      `Cloning ${baseDistribution} into the dedicated ${dedicatedDistribution} distro.`
    )
    try {
      let exported: ProcessResult
      try {
        exported = await runProcess({
          executable: systemExecutable('wsl.exe'),
          args: ['--export', baseDistribution, archivePath],
          timeoutMilliseconds: WslCommandTimeoutMilliseconds,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'wsl-export-failed',
          'WSL could not export the selected base distro. Check its health and retry.'
        )
      }
      if (exported.exitCode !== 0) {
        throw commandFailure(
          'WSL export',
          exported,
          'Check the selected distro and retry.'
        )
      }
      let imported: ProcessResult
      try {
        imported = await runProcess({
          executable: systemExecutable('wsl.exe'),
          args: [
            '--import',
            dedicatedDistribution,
            installDirectory,
            archivePath,
            '--version',
            '2',
          ],
          timeoutMilliseconds: WslCommandTimeoutMilliseconds,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'wsl-import-failed',
          'WSL could not create the dedicated distro. Check free disk space and retry.'
        )
      }
      if (imported.exitCode !== 0) {
        throw commandFailure(
          'WSL import',
          imported,
          'Check free disk space and retry.'
        )
      }
      return { distribution: dedicatedDistribution }
    } finally {
      await rm(archivePath, { force: true }).catch(() => undefined)
    }
  }

  private async unregisterDedicatedWsl(distribution: string): Promise<void> {
    const safeDistribution = normalizeDistribution(
      distribution,
      'dedicated distribution'
    )
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: ['--unregister', safeDistribution],
        timeoutMilliseconds: WslCommandTimeoutMilliseconds,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'wsl-unregister-failed',
        `WSL could not delete the dedicated ${safeDistribution} distro. Remove it from WSL after the runner operation is complete.`
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'WSL distro deletion',
        result,
        `Remove the dedicated ${safeDistribution} distro from WSL after the runner operation is complete.`
      )
    }
  }

  private async extractRunner(
    platform: SelfHostedRunnerPlatform,
    packagePath: string,
    id: string,
    distribution: string | null
  ): Promise<void> {
    const targetDirectory = runnerDirectory(this.root, id)
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
    this.progress(
      id,
      'downloading-runner',
      'Verifying and unpacking the signed Actions runner package.'
    )
    let listing: ProcessResult
    try {
      listing = await runProcess({
        executable: systemExecutable('tar.exe'),
        args: ['-tf', packagePath],
        timeoutMilliseconds: CommandTimeoutMilliseconds,
        maxOutputBytes: 4 * 1024 * 1024,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'runner-package-invalid',
        'The verified Actions runner package could not be inspected safely.'
      )
    }
    if (listing.exitCode !== 0) {
      throw commandFailure(
        'Runner package inspection',
        listing,
        'Check the managed runner directory and retry.'
      )
    }
    for (const entry of listing.stdout.toString('utf8').split(/\r?\n/)) {
      const normalizedEntry = entry.trim().replace(/\\/g, '/')
      if (
        normalizedEntry.length === 0 ||
        normalizedEntry.startsWith('/') ||
        /^[A-Za-z]:\//.test(normalizedEntry) ||
        normalizedEntry.split('/').includes('..') ||
        /[\0-\x1f\x7f]/.test(normalizedEntry)
      ) {
        throw new SelfHostedRunnerManagerError(
          'runner-package-invalid',
          'The verified Actions runner package contained an unsafe archive path.'
        )
      }
    }
    if (platform === 'windows') {
      let result: ProcessResult
      try {
        result = await runProcess({
          executable: systemExecutable('tar.exe'),
          args: ['-xf', packagePath, '-C', targetDirectory],
          timeoutMilliseconds: CommandTimeoutMilliseconds,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'runner-package-extract-failed',
          'Windows could not unpack the Actions runner package.'
        )
      }
      if (result.exitCode !== 0) {
        throw commandFailure(
          'Runner package extraction',
          result,
          'Check the managed runner directory and retry.'
        )
      }
      if (!(await exists(Path.join(targetDirectory, 'config.cmd')))) {
        throw new SelfHostedRunnerManagerError(
          'runner-package-invalid',
          'The Actions runner package did not contain config.cmd.'
        )
      }
      return
    }
    if (distribution === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-wsl-selection',
        'Choose a WSL distribution before unpacking the Linux runner.'
      )
    }
    const wslPackagePath = toWslMountPath(packagePath)
    const linuxTarget = `${LinuxRunnerRoot}/${id}`
    const script = [
      'set -eu',
      `mkdir -p ${quoteShell(linuxTarget)}`,
      `tar -xzf ${quoteShell(wslPackagePath)} -C ${quoteShell(linuxTarget)}`,
      `chown -R ${RunnerUser}:${RunnerUser} ${quoteShell(linuxTarget)}`,
      `test -x ${quoteShell(`${linuxTarget}/config.sh`)}`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          distribution,
          '--user',
          'root',
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        timeoutMilliseconds: WslCommandTimeoutMilliseconds,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'runner-package-extract-failed',
        'WSL could not unpack the Actions runner package.'
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'Runner package extraction',
        result,
        'Check the selected distro and retry.'
      )
    }
  }

  private async unregisterRunner(
    platform: SelfHostedRunnerPlatform,
    runnerId: string,
    distribution: string | null,
    removeToken: string
  ): Promise<void> {
    if (platform === 'windows') {
      const targetDirectory = runnerDirectory(this.root, runnerId)
      const commandLine = [
        quoteCmd(Path.join(targetDirectory, 'config.cmd')),
        'remove',
        '--token',
        '%RUNNER_REMOVE_TOKEN%',
      ].join(' ')
      let result: ProcessResult
      try {
        result = await runProcess({
          executable: systemExecutable('cmd.exe'),
          args: ['/d', '/s', '/c', commandLine],
          env: { RUNNER_REMOVE_TOKEN: removeToken },
          timeoutMilliseconds: CommandTimeoutMilliseconds,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'runner-removal-failed',
          'Windows could not unregister the runner. Request a fresh GitHub removal token and retry.'
        )
      }
      if (result.exitCode !== 0) {
        throw commandFailure(
          'Runner removal',
          result,
          'Request a fresh GitHub removal token and retry.'
        )
      }
      return
    }

    if (distribution === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-wsl-selection',
        'The Linux runner no longer has a WSL distribution selected.'
      )
    }
    const linuxTarget = `${LinuxRunnerRoot}/${runnerId}`
    const script = [
      'set -eu',
      `cd ${quoteShell(linuxTarget)}`,
      'IFS= read -r RUNNER_REMOVE_TOKEN',
      './config.sh remove --token "$RUNNER_REMOVE_TOKEN"',
    ].join('\n')
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          distribution,
          '--user',
          RunnerUser,
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        input: `${removeToken}\n`,
        timeoutMilliseconds: WslCommandTimeoutMilliseconds,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'runner-removal-failed',
        'WSL could not unregister the runner. Request a fresh GitHub removal token and retry.'
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'Runner removal',
        result,
        'Request a fresh GitHub removal token and retry.'
      )
    }
  }

  private async configureRunner(
    request: ISelfHostedRunnerSetupRequest,
    runnerId: string,
    distribution: string | null,
    registrationToken: string
  ): Promise<void> {
    this.progress(
      runnerId,
      'configuring-runner',
      'Registering the runner with the selected GitHub repository.'
    )
    const repositoryURL = githubRepositoryURL(
      request.githubApiEndpoint,
      request.owner,
      request.repository
    )
    const labels = request.labels.join(',')
    if (request.platform === 'windows') {
      const targetDirectory = runnerDirectory(this.root, runnerId)
      const commandLine = [
        quoteCmd(Path.join(targetDirectory, 'config.cmd')),
        '--unattended',
        '--url',
        quoteCmd(repositoryURL),
        '--token',
        '%RUNNER_REGISTRATION_TOKEN%',
        '--name',
        quoteCmd(request.name),
        '--labels',
        quoteCmd(labels),
        '--work',
        quoteCmd('_work'),
        '--replace',
      ].join(' ')
      let result: ProcessResult
      try {
        result = await runProcess({
          executable: systemExecutable('cmd.exe'),
          args: ['/d', '/s', '/c', commandLine],
          env: { RUNNER_REGISTRATION_TOKEN: registrationToken },
          timeoutMilliseconds: CommandTimeoutMilliseconds,
        })
      } catch {
        throw new SelfHostedRunnerManagerError(
          'runner-configuration-failed',
          'Windows could not register the runner. Request a fresh GitHub token and retry.'
        )
      }
      if (result.exitCode !== 0) {
        throw commandFailure(
          'Runner registration',
          result,
          'Request a fresh GitHub token and retry.'
        )
      }
      return
    }
    if (distribution === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-wsl-selection',
        'Choose a WSL distribution before registering the Linux runner.'
      )
    }
    const linuxTarget = `${LinuxRunnerRoot}/${runnerId}`
    const script = [
      'set -eu',
      `cd ${quoteShell(linuxTarget)}`,
      'IFS= read -r RUNNER_REGISTRATION_TOKEN',
      `./config.sh --unattended --url ${quoteShell(
        repositoryURL
      )} --token "$RUNNER_REGISTRATION_TOKEN" --name ${quoteShell(
        request.name
      )} --labels ${quoteShell(labels)} --work ${quoteShell(
        '_work'
      )} --replace`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          distribution,
          '--user',
          RunnerUser,
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        input: `${registrationToken}\n`,
        timeoutMilliseconds: WslCommandTimeoutMilliseconds,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'runner-configuration-failed',
        'WSL could not register the runner. Request a fresh GitHub token and retry.'
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'Runner registration',
        result,
        'Request a fresh GitHub token and retry.'
      )
    }
  }

  private launchRunner(
    record: IDiskRunnerRecord,
    distribution: string | null
  ): ILaunchResult {
    if (record.platform === 'windows') {
      return launchProcess({
        executable: systemExecutable('cmd.exe'),
        args: [
          '/d',
          '/s',
          '/c',
          quoteCmd(Path.join(runnerDirectory(this.root, record.id), 'run.cmd')),
        ],
        cwd: runnerDirectory(this.root, record.id),
      })
    }
    if (distribution === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-wsl-selection',
        'The Linux runner no longer has a WSL distribution selected.'
      )
    }
    const linuxTarget = `${LinuxRunnerRoot}/${record.id}`
    return launchProcess({
      executable: systemExecutable('wsl.exe'),
      args: [
        '--distribution',
        distribution,
        '--user',
        RunnerUser,
        '--exec',
        '/bin/bash',
        '-lc',
        `cd ${quoteShell(linuxTarget)} && exec ./run.sh`,
      ],
    })
  }

  public async setup(
    request: ISelfHostedRunnerSetupRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    if (this.activeRunnerId !== null) {
      return {
        ok: false,
        code: 'runner-operation-active',
        recovery:
          'Wait for the current runner operation to finish, then retry.',
      }
    }
    let normalized: ISelfHostedRunnerSetupRequest
    try {
      normalized = this.validateSetupRequest(request)
    } catch (error) {
      return this.failure(error)
    }
    this.activeRunnerId = normalized.id
    this.progress(normalized.id, 'validating', 'Validating runner settings.')
    let recordSaved = false
    let recordAdded = false
    let registrationCompleted = false
    let registrationCompensated = true
    let managedDirectoryCreated = false
    let distribution: string | null = null
    let packagePath: string | null = null
    let dedicatedWsl = false
    let createdDedicatedDistribution: string | null = null
    let records: Array<IDiskRunnerRecord> | null = null
    try {
      records = await this.loadRecords()
      if (records.some(record => record.id === normalized.id)) {
        throw new SelfHostedRunnerManagerError(
          'runner-already-managed',
          'That runner is already managed here. Refresh the list or remove it before creating another.'
        )
      }
      if (normalized.platform === 'linux-wsl') {
        if (normalized.createDedicatedWsl) {
          const created = await this.createDedicatedWsl(
            {
              baseDistribution: normalized.wslBaseDistribution!,
              dedicatedDistribution: normalized.dedicatedWslDistribution!,
            },
            normalized.id
          )
          distribution = created.distribution
          createdDedicatedDistribution = created.distribution
          dedicatedWsl = true
        } else {
          const distributions = await this.listWslDistributions()
          distribution =
            distributions.find(
              candidate =>
                candidate.toLocaleLowerCase() ===
                normalized.wslDistribution!.toLocaleLowerCase()
            ) ?? null
          if (distribution === null) {
            throw new SelfHostedRunnerManagerError(
              'wsl-distribution-not-found',
              'The selected WSL distro is no longer installed. Refresh the list and retry.'
            )
          }
        }
      }
      const rootDirectory = Path.join(this.root, normalized.id)
      await mkdir(rootDirectory, { recursive: true, mode: 0o700 })
      managedDirectoryCreated = true
      await mkdir(runnerTempDirectory(this.root, normalized.id), {
        recursive: true,
        mode: 0o700,
      })
      await this.ensureDependencies(normalized, normalized.id, distribution)
      packagePath = Path.join(
        runnerTempDirectory(this.root, normalized.id),
        normalized.platform === 'windows' ? 'runner.zip' : 'runner.tar.gz'
      )
      await downloadAndVerifyRunner(normalized.platform, packagePath)
      await this.extractRunner(
        normalized.platform,
        packagePath,
        normalized.id,
        distribution
      )
      const accountToken = this.accountTokens.get(normalized.githubApiEndpoint)
      if (accountToken === undefined) {
        throw new SelfHostedRunnerManagerError(
          'github-account-unavailable',
          'The selected GitHub account is no longer available in the main process. Refresh accounts and retry.'
        )
      }
      const registrationToken = await mintRunnerToken(
        normalized.githubApiEndpoint,
        normalized.owner,
        normalized.repository,
        accountToken,
        'registration'
      )
      await this.configureRunner(
        normalized,
        normalized.id,
        distribution,
        registrationToken
      )
      registrationCompleted = true
      await rm(packagePath, { force: true }).catch(() => undefined)

      const record: IDiskRunnerRecord = {
        id: normalized.id,
        owner: normalized.owner,
        repository: normalized.repository,
        githubApiEndpoint: normalized.githubApiEndpoint,
        name: normalized.name,
        labels: normalized.labels,
        platform: normalized.platform,
        wslDistribution: distribution,
        dedicatedWsl,
        createdAt: new Date().toISOString(),
        pid: null,
        status: 'stopped',
      }
      records.push(record)
      recordAdded = true
      await this.saveRecords()
      recordSaved = true
      this.progress(
        normalized.id,
        'starting-runner',
        'Starting the runner process in the background.'
      )
      const launch = this.launchRunner(record, distribution)
      const storedIndex = records.findIndex(
        candidate => candidate.id === record.id
      )
      records[storedIndex] = { ...record, pid: launch.pid, status: 'running' }
      await this.saveRecords()
      this.progress(normalized.id, 'complete', 'Runner setup is complete.')
      return {
        ok: true,
        result: { runner: this.publicRecord(records[storedIndex]) },
      }
    } catch (error) {
      if (registrationCompleted && !recordSaved) {
        registrationCompensated = false
        const accountToken = this.accountTokens.get(
          normalized.githubApiEndpoint
        )
        if (accountToken !== undefined) {
          try {
            const removeToken = await mintRunnerToken(
              normalized.githubApiEndpoint,
              normalized.owner,
              normalized.repository,
              accountToken,
              'remove'
            )
            await this.unregisterRunner(
              normalized.platform,
              normalized.id,
              distribution,
              removeToken
            )
            registrationCompensated = true
          } catch {
            // Preserve the original setup failure and retain a recovery record
            // below when remote compensation cannot be completed.
          }
        }
      }
      if (recordAdded && records !== null) {
        const index = records.findIndex(record => record.id === normalized.id)
        if (index >= 0) {
          records.splice(index, 1)
        }
      }
      if (
        registrationCompleted &&
        !registrationCompensated &&
        records !== null
      ) {
        records.push({
          id: normalized.id,
          owner: normalized.owner,
          repository: normalized.repository,
          githubApiEndpoint: normalized.githubApiEndpoint,
          name: normalized.name,
          labels: normalized.labels,
          platform: normalized.platform,
          wslDistribution: distribution,
          dedicatedWsl,
          createdAt: new Date().toISOString(),
          pid: null,
          status: 'stopped',
        })
        try {
          await this.saveRecords()
        } catch {
          records.pop()
        }
      }
      if (
        managedDirectoryCreated &&
        !recordSaved &&
        (!registrationCompleted || registrationCompensated)
      ) {
        await rm(Path.join(this.root, normalized.id), {
          recursive: true,
          force: true,
        }).catch(() => undefined)
      }
      if (packagePath !== null) {
        await rm(packagePath, { force: true }).catch(() => undefined)
      }
      if (
        createdDedicatedDistribution !== null &&
        !recordSaved &&
        (!registrationCompleted || registrationCompensated)
      ) {
        try {
          await this.unregisterDedicatedWsl(createdDedicatedDistribution)
        } catch {
          // Keep the original setup failure visible; the recovery text from
          // the setup error remains the most useful next action.
        }
      }
      return this.failure(error)
    } finally {
      this.activeRunnerId = null
    }
  }

  private failure<T>(error: unknown): SelfHostedRunnerReply<T> {
    if (error instanceof SelfHostedRunnerManagerError) {
      return { ok: false, code: error.code, recovery: error.recovery }
    }
    return {
      ok: false,
      code: 'runner-manager-failed',
      recovery:
        'The runner manager hit an unexpected failure. Retry from Preferences.',
    }
  }

  private async findRecord(
    request: ISelfHostedRunnerControlRequest
  ): Promise<IDiskRunnerRecord> {
    const scope = this.normalizeScope(request)
    if (!runnerIdIsSafe(request.id)) {
      throw new SelfHostedRunnerManagerError(
        'invalid-runner-id',
        'The selected runner identifier is invalid. Refresh the runner list.'
      )
    }
    const record = (await this.loadRecords()).find(
      candidate =>
        candidate.id === request.id &&
        candidate.owner === scope.owner &&
        candidate.repository === scope.repository
    )
    if (record === undefined) {
      throw new SelfHostedRunnerManagerError(
        'runner-not-found',
        'That managed runner no longer exists. Refresh the runner list.'
      )
    }
    return record
  }

  private async stopProcess(record: IDiskRunnerRecord): Promise<void> {
    if (!(await this.isRunnerProcessRunning(record))) {
      return
    }
    try {
      const result = await runProcess({
        executable: systemExecutable('taskkill.exe'),
        args: ['/PID', String(record.pid), '/T', '/F'],
        timeoutMilliseconds: 10_000,
      })
      if (
        result.exitCode !== 0 &&
        (await this.isRunnerProcessRunning(record))
      ) {
        throw commandFailure(
          'Runner stop',
          result,
          'Close the runner process and retry.'
        )
      }
    } catch (error) {
      if (error instanceof SelfHostedRunnerManagerError) {
        throw error
      }
      if (await this.isRunnerProcessRunning(record)) {
        throw new SelfHostedRunnerManagerError(
          'runner-stop-failed',
          'The runner process could not be stopped. Close it and retry.'
        )
      }
    }
  }

  public async start(
    request: ISelfHostedRunnerControlRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    if (process.platform !== 'win32') {
      return this.failure(
        new SelfHostedRunnerManagerError(
          'unsupported-platform',
          'Self-hosted runner management is available from the Windows desktop app.'
        )
      )
    }
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      await this.refreshStatuses(records)
      const refreshed = records.find(candidate => candidate.id === record.id)!
      if (refreshed.status === 'running') {
        return { ok: true, result: { runner: this.publicRecord(refreshed) } }
      }
      this.progress(
        record.id,
        'starting-runner',
        'Starting the runner process.'
      )
      const launch = this.launchRunner(refreshed, refreshed.wslDistribution)
      const index = records.findIndex(candidate => candidate.id === record.id)
      records[index] = { ...refreshed, pid: launch.pid, status: 'running' }
      await this.saveRecords()
      return { ok: true, result: { runner: this.publicRecord(records[index]) } }
    } catch (error) {
      return this.failure(error)
    }
  }

  public async stop(
    request: ISelfHostedRunnerControlRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    if (process.platform !== 'win32') {
      return this.failure(
        new SelfHostedRunnerManagerError(
          'unsupported-platform',
          'Self-hosted runner management is available from the Windows desktop app.'
        )
      )
    }
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      await this.stopProcess(record)
      const index = records.findIndex(candidate => candidate.id === record.id)
      records[index] = { ...record, pid: null, status: 'stopped' }
      await this.saveRecords()
      return { ok: true, result: { runner: this.publicRecord(records[index]) } }
    } catch (error) {
      return this.failure(error)
    }
  }

  public async remove(
    request: ISelfHostedRunnerRemoveRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerRemoveResult>> {
    if (process.platform !== 'win32') {
      return this.failure(
        new SelfHostedRunnerManagerError(
          'unsupported-platform',
          'Self-hosted runner management is available from the Windows desktop app.'
        )
      )
    }
    if (this.activeRunnerId !== null) {
      return {
        ok: false,
        code: 'runner-operation-active',
        recovery:
          'Wait for the current runner operation to finish, then retry.',
      }
    }
    this.activeRunnerId = request.id
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      const githubApiEndpoint = normalizeGitHubAPIEndpoint(
        request.githubApiEndpoint
      )
      if (githubApiEndpoint !== record.githubApiEndpoint) {
        throw new SelfHostedRunnerManagerError(
          'github-account-mismatch',
          'Select the GitHub account that created this runner before removing it.'
        )
      }
      const accountToken = this.accountTokens.get(githubApiEndpoint)
      if (accountToken === undefined) {
        throw new SelfHostedRunnerManagerError(
          'github-account-unavailable',
          'The selected GitHub account is no longer available in the main process. Refresh accounts and retry.'
        )
      }
      const removeToken = await mintRunnerToken(
        githubApiEndpoint,
        record.owner,
        record.repository,
        accountToken,
        'remove'
      )
      this.progress(
        record.id,
        'removing-runner',
        'Stopping and unregistering the runner.'
      )
      await this.stopProcess(record)
      const distribution = record.wslDistribution
      await this.unregisterRunner(
        record.platform,
        record.id,
        distribution,
        removeToken
      )
      const warnings: string[] = []
      try {
        await rm(Path.join(this.root, record.id), {
          recursive: true,
          force: true,
        })
      } catch {
        warnings.push(
          'The GitHub runner was unregistered, but its managed files could not be deleted. Remove them from the runner manager folder after this operation.'
        )
      }
      const index = records.findIndex(candidate => candidate.id === record.id)
      records.splice(index, 1)
      await this.saveRecords()
      if (record.dedicatedWsl && distribution !== null) {
        try {
          await this.unregisterDedicatedWsl(distribution)
        } catch (error) {
          warnings.push(
            error instanceof SelfHostedRunnerManagerError
              ? error.recovery
              : `Remove the dedicated ${distribution} distro from WSL.`
          )
        }
      }
      this.progress(
        record.id,
        'complete',
        warnings.length === 0
          ? 'Runner and its dedicated resources were removed.'
          : 'Runner removed; the dedicated WSL cleanup needs attention.'
      )
      return {
        ok: true,
        result: { removedRunnerId: record.id, warnings },
      }
    } catch (error) {
      return this.failure(error)
    } finally {
      this.activeRunnerId = null
    }
  }
}
