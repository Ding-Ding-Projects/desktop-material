import { createHash, randomUUID } from 'crypto'
import { ChildProcess, spawn } from 'child_process'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import * as Path from 'path'

import { readBoundedActionsJSON } from '../../lib/actions-response'
import { decodeWslOutput } from '../../lib/editors/wsl'
import { EndpointToken } from '../../lib/endpoint-token'
import {
  normalizeSelfHostedRunnerAccountKey,
  SelfHostedRunnerAccountCredentials,
} from '../../lib/self-hosted-runner/account-credentials'
import {
  buildLinuxRunnerConfigurationScript,
  buildLinuxRunnerRemovalScript,
  buildWindowsRunnerConfigurationInvocation,
  buildWindowsRunnerRemovalInvocation,
  quotePosixShell,
} from '../../lib/self-hosted-runner/registration-command'
import {
  ISelfHostedRunnerProcessRequest as IProcessRequest,
  ISelfHostedRunnerProcessResult as ProcessResult,
  SelfHostedRunnerProcessState as RunnerProcessState,
  runSelfHostedRunnerProcess as runProcess,
  safeSelfHostedRunnerProcessEnvironment as safeProcessEnvironment,
  waitForSelfHostedRunnerProcessStop,
} from './process-runner'
import {
  fetchRepositoryRunnerInventory,
  runnerMatchesExpectedIdentity,
  RunnerReadinessError,
  waitForRunnerReadiness,
} from './runner-readiness'
import {
  assertNoQueuedJobsForRunner,
  QueuedJobAuditError,
} from './queued-job-audit'
import { beginTimedFetch } from './timed-fetch'
import {
  auditRepositoryWorkflowsForSelfHostedRunner,
  IRepositoryWorkflowAuditResult,
  RepositoryWorkflowAuditError,
} from './workflow-audit'
import {
  normalizeManageableWslDistribution,
  parseManageableWslDistributions,
} from './wsl-distributions'
import {
  ISelfHostedRunner,
  ISelfHostedRunnerCreateWslRequest,
  ISelfHostedRunnerControlRequest,
  ISelfHostedRunnerPreflightRequest,
  ISelfHostedRunnerPreflightResult,
  ISelfHostedRunnerProgress,
  ISelfHostedRunnerRemoveRequest,
  ISelfHostedRunnerRemoveResult,
  ISelfHostedRunnerSetupRequest,
  ISelfHostedRunnerSetupResult,
  ISelfHostedRunnerStatusRequest,
  ISelfHostedRunnerStatus,
  ISelfHostedRunnerWslResult,
  KnownUnsafeSelfHostedRunnerPreflightCode,
  SelfHostedRunnerPlatform,
  SelfHostedRunnerProgressPhase,
  SelfHostedRunnerReply,
  SelfHostedRunnerStatus as RunnerStatus,
} from '../../lib/self-hosted-runner/types'
import { killTreeAndWait } from '../build-run/kill-tree'

/**
 * A setup request after validation, where the optional account key has been
 * resolved to a concrete one. `validateSetupRequest` either produces this or
 * throws, so no step after it has to re-decide what an absent account meant.
 */
type ValidatedSelfHostedRunnerSetupRequest = ISelfHostedRunnerSetupRequest & {
  readonly accountKey: string
}

const ManagedRootName = 'self-hosted-runners'
const StateFileName = 'runners.json'
const RunnerUser = 'desktop-material-runner'
const LinuxRunnerRoot = '/opt/desktop-material-runners'
const MaximumDownloadBytes = 512 * 1024 * 1024
const CommandTimeoutMilliseconds = 30 * 60 * 1_000
const WslCommandTimeoutMilliseconds = 30 * 60 * 1_000
const NetworkTimeoutMilliseconds = 30 * 60 * 1_000
const RunnerReleaseAPI =
  'https://api.github.com/repos/actions/runner/releases/latest'
const RunnerUserAgent = 'Desktop-Material-self-hosted-runner-manager'
const RunnerTrustMonitorIntervalMilliseconds = 30_000
const RunnerInventoryStabilityAttempts = 3
const RunnerInventoryPostconditionAttempts = 10
const RunnerInventoryStabilityDelayMilliseconds = 750
const RunnerRegistrationMetadataMaximumBytes = 64 * 1024
const RunnerChildCloseTimeoutMilliseconds = 5_000
const StatusReconciliationOperationId = ':status-reconciliation:'
const TrustMonitorOperationId = ':trust-monitor:'

type RunnerLifecyclePhase =
  | 'provisioning'
  | 'registered'
  | 'starting'
  | 'ready'
  | 'removing'
  | 'remote-removed'

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

interface ILaunchResult {
  readonly pid: number
  readonly child: ChildProcess
}

interface IDiskRunnerRecord {
  readonly id: string
  readonly accountKey?: string
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
  readonly lifecyclePhase?: RunnerLifecyclePhase
  readonly githubRunnerId?: number
}

interface IRunnerReleaseAsset {
  readonly name: string
  readonly browser_download_url: string
  readonly digest?: string | null
}

interface IRunnerRelease {
  readonly assets?: ReadonlyArray<IRunnerReleaseAsset>
}

export class SelfHostedRunnerManagerError extends Error {
  public constructor(
    public readonly code: string,
    public readonly recovery: string,
    /** A bounded main-process fingerprint for a completed known-risk audit. */
    public readonly knownPreflightRiskEvidence?: string
  ) {
    super(code)
  }
}

function isKnownUnsafePreflightRiskCode(
  value: unknown
): value is KnownUnsafeSelfHostedRunnerPreflightCode {
  return (
    value === 'workflow-trust-unsafe' || value === 'runner-queued-job-blocked'
  )
}

interface IKnownUnsafePreflightConfirmation {
  readonly code: KnownUnsafeSelfHostedRunnerPreflightCode
  readonly owner: string
  readonly repository: string
  readonly labels: ReadonlyArray<string>
  readonly auditName: string
  readonly recovery: string
}

interface IKnownUnsafePreflightReceipt {
  readonly scope: string
  readonly evidence: string
}

type ConfirmKnownUnsafePreflightRisk = (
  confirmation: IKnownUnsafePreflightConfirmation
) => Promise<boolean>

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SelfHostedRunnerManagerError(
      'runner-operation-cancelled',
      'Runner setup was cancelled. Any completed registration was rolled back or retained as a stopped recovery record.'
    )
  }
}

async function launchProcess(
  request: Omit<IProcessRequest, 'input' | 'timeoutMilliseconds'>
): Promise<ILaunchResult> {
  const child = spawn(request.executable, [...request.args], {
    cwd: request.cwd,
    env: safeProcessEnvironment(request.env),
    detached: false,
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
  })
  return await new Promise<ILaunchResult>((resolve, reject) => {
    let settled = false
    const fail = (error: Error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    child.once('error', fail)
    child.once('spawn', () => {
      if (settled) {
        return
      }
      settled = true
      child.removeListener('error', fail)
      // A post-spawn process error is represented by the close path. Keep an
      // explicit listener so it can never become an uncaught main-process error.
      child.on('error', () => undefined)
      if (child.pid === undefined) {
        reject(new Error('runner-process-did-not-start'))
        return
      }
      resolve({ pid: child.pid, child })
    })
    child.once('close', () => {
      if (!settled) {
        fail(new Error('runner-process-exited-before-start'))
      }
    })
  })
}

async function waitForChildClose(
  child: ChildProcess,
  timeoutMilliseconds = RunnerChildCloseTimeoutMilliseconds
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.removeListener('close', close)
      reject(new Error('runner-process-close-timeout'))
    }, timeoutMilliseconds)
    const close = () => {
      clearTimeout(timeout)
      resolve()
    }
    child.once('close', close)
  })
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
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

function normalizeLabels(
  value: unknown,
  maximumLabelCount: number = 20
): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumLabelCount
  ) {
    throw new SelfHostedRunnerManagerError(
      'invalid-runner-configuration',
      `Add between one and ${maximumLabelCount} runner labels.`
    )
  }
  const labels = value.map(label => validateSafeIdentifier(label, 64, 'label'))
  return [...new Set(labels)]
}

function normalizeDistribution(value: unknown, label: string): string {
  const distribution = normalizeManageableWslDistribution(value)
  if (distribution === null) {
    throw new SelfHostedRunnerManagerError(
      'invalid-wsl-selection',
      `Choose a user-managed ${label}. Internal WSL distributions are not eligible.`
    )
  }
  return distribution
}

type RunnerArchitecture = 'X64' | 'ARM64'

/**
 * Every audit uses the same complete label set that GitHub assigns at
 * registration. The user-configurable labels stay bounded separately.
 */
function completeRunnerLabels(
  customLabels: ReadonlyArray<string>,
  operatingSystem: 'Windows' | 'Linux',
  architecture: RunnerArchitecture
): ReadonlyArray<string> {
  const result: string[] = []
  const seen = new Set<string>()
  for (const label of [
    'self-hosted',
    ...customLabels,
    operatingSystem,
    architecture,
  ]) {
    const key = label.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(label)
    }
  }
  return result
}

function runnerDirectory(root: string, id: string): string {
  return Path.join(root, id, 'runner')
}

function runnerPidPath(root: string, id: string): string {
  return Path.join(root, id, 'runner-process.pid')
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

function hostRunnerArchitecture(): RunnerArchitecture {
  return process.arch === 'arm64' ? 'ARM64' : 'X64'
}

function runnerAssetName(
  platform: SelfHostedRunnerPlatform,
  runnerArchitecture: RunnerArchitecture
): string {
  const architecture = runnerArchitecture === 'ARM64' ? 'arm64' : 'x64'
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

async function downloadAndVerifyRunner(
  platform: SelfHostedRunnerPlatform,
  destination: string,
  runnerArchitecture: RunnerArchitecture,
  signal?: AbortSignal
): Promise<void> {
  let releaseFetch: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    releaseFetch = await beginTimedFetch(
      RunnerReleaseAPI,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': RunnerUserAgent,
        },
        redirect: 'error',
        signal,
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-release-unavailable',
      'The Actions runner release could not be reached. Check the network and retry.'
    )
  }
  const response = releaseFetch.response
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    releaseFetch.dispose()
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
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-release-invalid',
      'The Actions runner release metadata was not valid. Retry after checking for a newer release.'
    )
  } finally {
    releaseFetch.dispose()
  }

  const prefix = runnerAssetName(platform, runnerArchitecture)
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

  let packageFetch: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    packageFetch = await beginTimedFetch(
      asset.browser_download_url,
      {
        headers: { 'User-Agent': RunnerUserAgent },
        redirect: 'follow',
        signal,
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'The Actions runner package could not be downloaded. Check the network and retry.'
    )
  }
  const packageResponse = packageFetch.response
  if (!packageResponse.ok) {
    await packageResponse.body?.cancel().catch(() => undefined)
    packageFetch.dispose()
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
    packageFetch.dispose()
    throw new SelfHostedRunnerManagerError(
      'runner-package-unavailable',
      'The runner package redirected to an untrusted host and was discarded.'
    )
  }
  const contentLength = Number(packageResponse.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MaximumDownloadBytes) {
    await packageResponse.body?.cancel().catch(() => undefined)
    packageFetch.dispose()
    throw new SelfHostedRunnerManagerError(
      'runner-package-too-large',
      'The runner package exceeded the safety limit and was discarded.'
    )
  }
  let bytes: Buffer
  try {
    bytes = await readBoundedBody(packageResponse, MaximumDownloadBytes)
  } catch {
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-package-too-large',
      'The downloaded runner package was empty or exceeded the safety limit.'
    )
  } finally {
    packageFetch.dispose()
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
  throwIfCancelled(signal)
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
  action: 'registration' | 'remove',
  signal?: AbortSignal
): Promise<string> {
  const path = `repos/${owner}/${repository}/actions/runners/${action}-token`
  let tokenFetch: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    tokenFetch = await beginTimedFetch(
      new URL(path, endpoint),
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accountToken}`,
          'User-Agent': RunnerUserAgent,
        },
        redirect: 'error',
        signal,
      },
      NetworkTimeoutMilliseconds
    )
  } catch {
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-token-request-failed',
      'GitHub did not issue a runner token. Check the selected account and network, then retry.'
    )
  }
  const response = tokenFetch.response

  let value: unknown
  try {
    value = await readBoundedActionsJSON(response, tokenFetch.signal)
  } catch {
    throwIfCancelled(signal)
    throw new SelfHostedRunnerManagerError(
      'runner-token-request-failed',
      'GitHub returned an invalid runner-token response. Request a new token and retry.'
    )
  } finally {
    tokenFetch.dispose()
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
  const safeAccountKey =
    record.accountKey === undefined ||
    normalizeSelfHostedRunnerAccountKey(record.accountKey) !== null
  const safeLifecyclePhase =
    record.lifecyclePhase === undefined ||
    record.lifecyclePhase === 'provisioning' ||
    record.lifecyclePhase === 'registered' ||
    record.lifecyclePhase === 'starting' ||
    record.lifecyclePhase === 'ready' ||
    record.lifecyclePhase === 'removing' ||
    record.lifecyclePhase === 'remote-removed'
  const safeGitHubRunnerId =
    record.githubRunnerId === undefined ||
    (typeof record.githubRunnerId === 'number' &&
      Number.isSafeInteger(record.githubRunnerId) &&
      record.githubRunnerId > 0)
  let safeEndpoint = false
  try {
    normalizeGitHubAPIEndpoint(record.githubApiEndpoint)
    safeEndpoint = true
  } catch {
    // Keep corrupt state out of process control paths.
  }
  return (
    runnerIdIsSafe(record.id) &&
    safeAccountKey &&
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
    safeLifecyclePhase &&
    safeGitHubRunnerId &&
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
  private recordsLoadPromise: Promise<Array<IDiskRunnerRecord>> | null = null
  private activeRunnerId: string | null = null
  private activeOperationAbortController: AbortController | null = null
  private activeOperationCompletion: Promise<void> | null = null
  private completeActiveOperation: (() => void) | null = null
  private readonly accountCredentials = new SelfHostedRunnerAccountCredentials()
  private readonly liveProcesses = new Map<string, ChildProcess>()
  private trustMonitorHandle: NodeJS.Timeout | null = null
  private trustMonitorPromise: Promise<void> | null = null
  private trustMonitorAbortController: AbortController | null = null
  private shuttingDown = false

  public constructor(
    userDataPath: string,
    private readonly onProgress: (progress: ISelfHostedRunnerProgress) => void,
    private readonly confirmKnownUnsafePreflightRisk: ConfirmKnownUnsafePreflightRisk = async () =>
      false
  ) {
    this.root = Path.join(userDataPath, ManagedRootName)
    this.statePath = Path.join(this.root, StateFileName)
    if (process.platform === 'win32') {
      this.trustMonitorHandle = setInterval(
        () => this.queueTrustMonitor(),
        RunnerTrustMonitorIntervalMilliseconds
      )
      this.trustMonitorHandle.unref()
    }
  }

  /** Keep the app's existing in-memory account map available to the main process only. */
  public updateAccountTokens(accounts: ReadonlyArray<EndpointToken>): void {
    this.accountCredentials.update(accounts)
  }

  private accountToken(accountKey: string, endpoint: string): string {
    const token = this.accountCredentials.resolve(accountKey, endpoint)
    if (token === null) {
      throw new SelfHostedRunnerManagerError(
        'github-account-unavailable',
        'The selected GitHub account is no longer available in the main process. Refresh accounts and retry.'
      )
    }
    return token
  }

  private async assertRepositoryWorkflowTrust(
    endpoint: string,
    owner: string,
    repository: string,
    token: string,
    runnerLabels: ReadonlyArray<string>,
    signal?: AbortSignal
  ): Promise<IRepositoryWorkflowAuditResult> {
    try {
      return await auditRepositoryWorkflowsForSelfHostedRunner({
        endpoint,
        owner,
        repository,
        token,
        runnerLabels,
        signal,
      })
    } catch (error) {
      this.throwIfOperationCancelled(signal)
      if (
        error instanceof RepositoryWorkflowAuditError &&
        error.kind === 'unsafe'
      ) {
        const summary = error.findings
          .slice(0, 4)
          .map(
            finding =>
              `${finding.path} (${finding.job}: ${finding.trigger}/${finding.reason})`
          )
          .join('; ')
        const evidence = createHash('sha256')
          .update(
            JSON.stringify({
              commitSHA: error.commitSHA ?? null,
              findings: error.findings
                .map(finding => ({
                  job: finding.job,
                  path: finding.path,
                  reason: finding.reason,
                  trigger: finding.trigger,
                }))
                .sort((left, right) =>
                  JSON.stringify(left).localeCompare(JSON.stringify(right))
                ),
            })
          )
          .digest('hex')
        throw new SelfHostedRunnerManagerError(
          'workflow-trust-unsafe',
          `Runner operation is blocked because untrusted or indeterminate events can reach runner execution: ${summary}. Remove those paths or pin and audit the reusable workflows, then retry.`,
          evidence
        )
      }
      throw new SelfHostedRunnerManagerError(
        'workflow-trust-unavailable',
        'The main process could not enumerate and audit every workflow at one immutable commit. No runner process or managed file was changed.'
      )
    }
  }

  private progress(
    runnerId: string,
    phase: SelfHostedRunnerProgressPhase,
    detail: string
  ) {
    this.onProgress({ runnerId, phase, detail })
  }

  private async assertStableRunnerQueue(
    endpoint: string,
    owner: string,
    repository: string,
    token: string,
    runnerLabels: ReadonlyArray<string>,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      let fingerprint: string | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        const snapshot = await assertNoQueuedJobsForRunner({
          endpoint,
          owner,
          repository,
          token,
          runnerLabels,
          signal,
        })
        if (fingerprint !== null && fingerprint !== snapshot.fingerprint) {
          throw new QueuedJobAuditError('unavailable')
        }
        fingerprint = snapshot.fingerprint
        if (attempt === 0) {
          await this.operationDelay(
            RunnerInventoryStabilityDelayMilliseconds,
            signal
          )
        }
      }
    } catch (error) {
      this.throwIfOperationCancelled(signal)
      if (
        error instanceof QueuedJobAuditError &&
        error.kind === 'matching-job'
      ) {
        const match = error.match
        const evidence =
          match === undefined
            ? undefined
            : createHash('sha256')
                .update(
                  JSON.stringify({
                    jobId: match.jobId,
                    jobName: match.jobName,
                    labels: [...match.labels]
                      .map(label => label.toLocaleLowerCase())
                      .sort(),
                    runId: match.runId,
                    status: match.status,
                  })
                )
                .digest('hex')
        throw new SelfHostedRunnerManagerError(
          'runner-queued-job-blocked',
          match === undefined
            ? 'A pending GitHub Actions job can target this runner. Cancel or complete it before connecting the runner.'
            : `GitHub Actions run ${match.runId}, job ${match.jobId} (${match.jobName}), is ${match.status} and can target these runner labels. Cancel or complete that run before connecting the runner.`,
          evidence
        )
      }
      throw new SelfHostedRunnerManagerError(
        'runner-queue-audit-unavailable',
        'The main process could not prove the repository free of historical pending jobs that can target this runner. No runner process was started.'
      )
    }
  }

  /**
   * A known-risk decision is main-process owned, volatile, and evidence bound.
   * It is never persisted and never accepted from a renderer IPC payload.
   */
  private knownPreflightRiskScope(
    accountKey: string,
    endpoint: string,
    owner: string,
    repository: string,
    runnerLabels: ReadonlyArray<string>
  ): string {
    return JSON.stringify({
      accountKey,
      endpoint,
      labels: [...runnerLabels].map(label => label.toLocaleLowerCase()).sort(),
      owner: owner.toLocaleLowerCase(),
      repository: repository.toLocaleLowerCase(),
    })
  }

  private async continueAfterConfirmedKnownPreflightRisk(
    error: unknown,
    receipts: Map<
      KnownUnsafeSelfHostedRunnerPreflightCode,
      IKnownUnsafePreflightReceipt
    >,
    accountKey: string,
    endpoint: string,
    owner: string,
    repository: string,
    runnerLabels: ReadonlyArray<string>,
    runnerId: string,
    auditName: string
  ): Promise<boolean> {
    if (
      !(error instanceof SelfHostedRunnerManagerError) ||
      !isKnownUnsafePreflightRiskCode(error.code) ||
      error.knownPreflightRiskEvidence === undefined
    ) {
      return false
    }

    const scope = this.knownPreflightRiskScope(
      accountKey,
      endpoint,
      owner,
      repository,
      runnerLabels
    )
    const existing = receipts.get(error.code)
    if (
      existing !== undefined &&
      existing.scope === scope &&
      existing.evidence === error.knownPreflightRiskEvidence
    ) {
      this.progress(
        runnerId,
        'validating',
        `The ${auditName} finding exactly matches the main-process-confirmed evidence for this setup operation. Continuing; a changed finding or unavailable evidence still stops setup.`
      )
      return true
    }

    let confirmed: boolean
    try {
      confirmed = await this.confirmKnownUnsafePreflightRisk({
        code: error.code,
        owner,
        repository,
        labels: runnerLabels,
        auditName,
        recovery: error.recovery,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'preflight-risk-confirmation-unavailable',
        'The Windows-owned confirmation for the completed preflight warning could not be shown. No runner process or managed file was changed.'
      )
    }
    if (!confirmed) {
      throw new SelfHostedRunnerManagerError(
        'preflight-risk-not-accepted',
        'The completed preflight warning was not accepted in the Windows confirmation. No runner process or managed file was changed.'
      )
    }

    receipts.set(error.code, {
      scope,
      evidence: error.knownPreflightRiskEvidence,
    })
    this.progress(
      runnerId,
      'validating',
      `The Windows-owned confirmation accepted the current ${auditName} warning. Only this exact scope and evidence can pass later setup rechecks; Start and scheduled monitoring remain strict.`
    )
    return true
  }

  private async assertRepositoryWorkflowTrustWithConfirmedRisk(
    endpoint: string,
    accountKey: string,
    owner: string,
    repository: string,
    token: string,
    runnerLabels: ReadonlyArray<string>,
    signal: AbortSignal | undefined,
    receipts: Map<
      KnownUnsafeSelfHostedRunnerPreflightCode,
      IKnownUnsafePreflightReceipt
    >,
    runnerId: string,
    auditName: string
  ): Promise<IRepositoryWorkflowAuditResult | null> {
    try {
      const audit = await this.assertRepositoryWorkflowTrust(
        endpoint,
        owner,
        repository,
        token,
        runnerLabels,
        signal
      )
      receipts.delete('workflow-trust-unsafe')
      return audit
    } catch (error) {
      if (
        await this.continueAfterConfirmedKnownPreflightRisk(
          error,
          receipts,
          accountKey,
          endpoint,
          owner,
          repository,
          runnerLabels,
          runnerId,
          auditName
        )
      ) {
        return null
      }
      throw error
    }
  }

  private async assertStableRunnerQueueWithConfirmedRisk(
    endpoint: string,
    accountKey: string,
    owner: string,
    repository: string,
    token: string,
    runnerLabels: ReadonlyArray<string>,
    signal: AbortSignal | undefined,
    receipts: Map<
      KnownUnsafeSelfHostedRunnerPreflightCode,
      IKnownUnsafePreflightReceipt
    >,
    runnerId: string,
    auditName: string
  ): Promise<boolean> {
    try {
      await this.assertStableRunnerQueue(
        endpoint,
        owner,
        repository,
        token,
        runnerLabels,
        signal
      )
      receipts.delete('runner-queued-job-blocked')
      return true
    } catch (error) {
      if (
        await this.continueAfterConfirmedKnownPreflightRisk(
          error,
          receipts,
          accountKey,
          endpoint,
          owner,
          repository,
          runnerLabels,
          runnerId,
          auditName
        )
      ) {
        return false
      }
      throw error
    }
  }

  private ensureNotShuttingDown(): void {
    if (this.shuttingDown) {
      throw new SelfHostedRunnerManagerError(
        'runner-manager-shutting-down',
        'The app is closing, so no new runner operation was started.'
      )
    }
  }

  private runOperationProcess(
    request: IProcessRequest
  ): Promise<ProcessResult> {
    return runProcess({
      ...request,
      signal: request.signal ?? this.activeOperationAbortController?.signal,
    })
  }

  public cancel(runnerId: string): boolean {
    if (
      !runnerIdIsSafe(runnerId) ||
      this.activeRunnerId !== runnerId ||
      this.activeOperationAbortController === null
    ) {
      return false
    }
    this.activeOperationAbortController.abort()
    return true
  }

  private beginActiveOperation(runnerId: string): AbortController {
    const controller = new AbortController()
    this.activeRunnerId = runnerId
    this.activeOperationAbortController = controller
    this.activeOperationCompletion = new Promise(resolve => {
      this.completeActiveOperation = resolve
    })
    return controller
  }

  private finishActiveOperation(controller: AbortController): void {
    if (this.activeOperationAbortController !== controller) {
      return
    }
    this.activeOperationAbortController = null
    this.activeRunnerId = null
    this.completeActiveOperation?.()
    this.completeActiveOperation = null
    this.activeOperationCompletion = null
  }

  private operationSignal(): AbortSignal | undefined {
    return this.activeOperationAbortController?.signal
  }

  private throwIfOperationCancelled(signal = this.operationSignal()): void {
    if (signal?.aborted) {
      throw new SelfHostedRunnerManagerError(
        'runner-operation-cancelled',
        'Runner setup was cancelled. Any completed registration was rolled back or retained as a stopped recovery record.'
      )
    }
  }

  private async operationDelay(
    milliseconds: number,
    signal = this.operationSignal()
  ): Promise<void> {
    this.throwIfOperationCancelled(signal)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }, milliseconds)
      const abort = () => {
        clearTimeout(timeout)
        reject(
          new SelfHostedRunnerManagerError(
            'runner-operation-cancelled',
            'Runner setup was cancelled. Any completed registration was rolled back or retained as a stopped recovery record.'
          )
        )
      }
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  private queueTrustMonitor(): void {
    if (
      process.platform !== 'win32' ||
      this.shuttingDown ||
      this.trustMonitorPromise !== null
    ) {
      return
    }
    const controller = new AbortController()
    this.trustMonitorAbortController = controller
    const monitor = this.runTrustMonitor(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (this.trustMonitorPromise === monitor) {
          this.trustMonitorPromise = null
          this.trustMonitorAbortController = null
        }
      })
    this.trustMonitorPromise = monitor
  }

  private async loadRecords(): Promise<Array<IDiskRunnerRecord>> {
    if (this.records !== null) {
      return this.records
    }
    if (this.recordsLoadPromise !== null) {
      return this.recordsLoadPromise
    }
    const loading = this.readRecordsFromDisk()
    this.recordsLoadPromise = loading
    try {
      return await loading
    } finally {
      if (this.recordsLoadPromise === loading) {
        this.recordsLoadPromise = null
      }
    }
  }

  private async readRecordsFromDisk(): Promise<Array<IDiskRunnerRecord>> {
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
      this.records = (records as Array<IDiskRunnerRecord>).map(record => {
        // Versions that briefly persisted renderer-provided risk codes must
        // forget them on load. Native confirmations are intentionally
        // operation-local and never survive a restart.
        const { acceptedPreflightRiskCode: _legacyAcceptance, ...safeRecord } =
          record as IDiskRunnerRecord & {
            readonly acceptedPreflightRiskCode?: unknown
          }
        void _legacyAcceptance
        return {
          ...safeRecord,
          lifecyclePhase:
            safeRecord.lifecyclePhase ??
            (safeRecord.status === 'running' ? 'ready' : 'registered'),
        }
      })
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
    return parseManageableWslDistributions(decodeWslOutput(result.stdout))
  }

  private async preflightWslDistribution(
    distribution: string
  ): Promise<RunnerArchitecture> {
    const safeDistribution = normalizeDistribution(
      distribution,
      'WSL distribution'
    )
    const script = [
      'set -eu',
      'test -r /etc/os-release',
      '. /etc/os-release',
      'case "${ID:-}" in debian|ubuntu) ;; *) exit 41 ;; esac',
      'command -v bash >/dev/null 2>&1',
      'command -v apt-get >/dev/null 2>&1',
      'command -v setsid >/dev/null 2>&1',
      'uname -m',
    ].join('\n')
    let result: ProcessResult
    try {
      result = await this.runOperationProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          safeDistribution,
          '--user',
          'root',
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        timeoutMilliseconds: 15_000,
        maxOutputBytes: 64 * 1024,
      })
    } catch {
      this.throwIfOperationCancelled()
      throw new SelfHostedRunnerManagerError(
        'wsl-preflight-failed',
        'The selected WSL distro could not complete the bounded compatibility check. Choose a healthy Debian or Ubuntu distro.'
      )
    }
    if (result.exitCode !== 0) {
      throw new SelfHostedRunnerManagerError(
        'wsl-preflight-failed',
        'The selected WSL distro must be Debian or Ubuntu with bash, apt-get, and setsid available.'
      )
    }
    const architecture = result.stdout.toString('utf8').trim().toLowerCase()
    if (architecture === 'x86_64' || architecture === 'amd64') {
      return 'X64'
    }
    if (architecture === 'aarch64' || architecture === 'arm64') {
      return 'ARM64'
    }
    throw new SelfHostedRunnerManagerError(
      'wsl-architecture-unsupported',
      `The selected WSL distro reported unsupported architecture ${
        architecture.length === 0 ? 'unknown' : architecture
      }. Choose an x64 or arm64 distro.`
    )
  }

  private async recoveredRunnerPid(
    record: IDiskRunnerRecord
  ): Promise<number | null> {
    if (record.pid !== null && record.pid > 0) {
      return record.pid
    }
    if (
      record.lifecyclePhase !== 'starting' &&
      record.lifecyclePhase !== 'ready'
    ) {
      return null
    }
    try {
      const raw = (
        await readFile(runnerPidPath(this.root, record.id), 'utf8')
      ).trim()
      if (!/^\d{1,10}$/.test(raw)) {
        throw new Error('invalid-runner-pid-file')
      }
      const pid = Number(raw)
      if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new Error('invalid-runner-pid-file')
      }
      return pid
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw new SelfHostedRunnerManagerError(
        'runner-process-state-unavailable',
        'The managed runner ownership marker could not be validated. No process or runner state was changed.'
      )
    }
  }

  private async runnerProcessState(
    record: IDiskRunnerRecord
  ): Promise<RunnerProcessState> {
    const pid = await this.recoveredRunnerPid(record)
    if (pid === null) {
      if (
        record.lifecyclePhase === 'starting' ||
        record.lifecyclePhase === 'ready'
      ) {
        throw new SelfHostedRunnerManagerError(
          'runner-process-state-unavailable',
          'The managed runner launch is missing its process ownership marker. Wait for recovery or remove it only after the process identity can be proven.'
        )
      }
      return 'stopped'
    }
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return 'stopped'
      }
      throw new SelfHostedRunnerManagerError(
        'runner-process-state-unavailable',
        'Windows would not confirm whether the managed runner process still exists. No process or runner state was changed.'
      )
    }
    const query = `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -First 1 ProcessId,CommandLine,ExecutablePath; if ($null -ne $p) { $p | ConvertTo-Json -Compress -Depth 2 }`
    try {
      const result = await runProcess({
        executable: powershellExecutable(),
        args: ['-NoProfile', '-NonInteractive', '-Command', query],
        timeoutMilliseconds: 5_000,
      })
      if (result.exitCode !== 0) {
        throw new SelfHostedRunnerManagerError(
          'runner-process-state-unavailable',
          'Windows process identity could not be queried. No process or runner state was changed.'
        )
      }
      const raw = result.stdout.toString('utf8').trim()
      if (raw.length === 0) {
        return 'stopped'
      }
      const details = JSON.parse(raw) as {
        ProcessId?: unknown
        CommandLine?: unknown
        ExecutablePath?: unknown
      }
      if (details.ProcessId !== pid) {
        throw new Error('runner-process-id-mismatch')
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
      if (!commandLine.replace(/\\/g, '/').includes(marker)) {
        throw new Error('runner-process-command-mismatch')
      }
      return 'running'
    } catch (error) {
      if (error instanceof SelfHostedRunnerManagerError) {
        throw error
      }
      throw new SelfHostedRunnerManagerError(
        'runner-process-state-unavailable',
        'Windows returned an invalid or mismatched process identity. No process or runner state was changed.'
      )
    }
  }

  private async isRunnerProcessRunning(
    record: IDiskRunnerRecord
  ): Promise<boolean> {
    return (await this.runnerProcessState(record)) === 'running'
  }

  private async refreshStatuses(records: Array<IDiskRunnerRecord>) {
    for (let index = 0; index < records.length; index++) {
      const record = records[index]
      const recoveredPid = await this.recoveredRunnerPid(record)
      const recoveredRecord = { ...record, pid: recoveredPid }
      const running =
        (await this.runnerProcessState(recoveredRecord)) === 'running'
      records[index] = {
        ...recoveredRecord,
        status: running
          ? 'running'
          : record.platform === 'windows' &&
            !(await exists(runnerDirectory(this.root, record.id)))
          ? 'missing'
          : 'stopped',
        pid: running ? recoveredPid : null,
        lifecyclePhase: running
          ? record.lifecyclePhase === 'starting'
            ? 'starting'
            : 'ready'
          : record.lifecyclePhase === 'provisioning' ||
            record.lifecyclePhase === 'removing' ||
            record.lifecyclePhase === 'remote-removed'
          ? record.lifecyclePhase
          : 'registered',
      }
    }
  }

  private matchingRepositoryRunner(
    record: IDiskRunnerRecord,
    inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
  ) {
    const expectation = {
      existingRunnerIds: new Set<number>(),
      expectedRunnerId: record.githubRunnerId,
      name: record.name,
      requiredLabels: record.labels,
      os: 'Windows' as const,
      architecture: hostRunnerArchitecture(),
    }
    const matches = inventory.filter(candidate =>
      runnerMatchesExpectedIdentity(candidate, expectation)
    )
    if (matches.length > 1) {
      throw new SelfHostedRunnerManagerError(
        'runner-registration-mismatch',
        'GitHub reported multiple registrations matching this managed runner. Resolve the duplicate registrations before continuing.'
      )
    }
    return matches.length === 1 ? matches[0] : null
  }

  private async recoveredGitHubRunnerId(
    record: IDiskRunnerRecord
  ): Promise<number | undefined> {
    if (record.githubRunnerId !== undefined) {
      return record.githubRunnerId
    }
    if (record.platform !== 'windows') {
      return undefined
    }
    const metadataPath = Path.join(
      runnerDirectory(this.root, record.id),
      '.runner'
    )
    try {
      const metadataStat = await stat(metadataPath)
      if (
        !metadataStat.isFile() ||
        metadataStat.size <= 0 ||
        metadataStat.size > RunnerRegistrationMetadataMaximumBytes
      ) {
        throw new Error('runner-registration-metadata-invalid')
      }
      const value: unknown = JSON.parse(await readFile(metadataPath, 'utf8'))
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('runner-registration-metadata-invalid')
      }
      const metadata = value as { agentId?: unknown; agentName?: unknown }
      if (
        !Number.isSafeInteger(metadata.agentId) ||
        Number(metadata.agentId) <= 0 ||
        typeof metadata.agentName !== 'string' ||
        metadata.agentName.toLocaleLowerCase() !==
          record.name.toLocaleLowerCase()
      ) {
        throw new Error('runner-registration-metadata-invalid')
      }
      return Number(metadata.agentId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      throw new SelfHostedRunnerManagerError(
        'runner-registration-metadata-invalid',
        'The local GitHub runner identity metadata is unreadable or invalid. Managed files and the recovery journal were retained; repair the runner metadata or remove the registration on GitHub before retrying.'
      )
    }
  }

  private repositoryRunnerByRecoverableName(
    record: IDiskRunnerRecord,
    inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
  ) {
    const named = inventory.filter(
      candidate =>
        candidate.name.toLocaleLowerCase() === record.name.toLocaleLowerCase()
    )
    if (named.length > 1) {
      throw new SelfHostedRunnerManagerError(
        'runner-registration-mismatch',
        'GitHub reported multiple registrations with this managed runner name. Resolve the duplicate registrations before continuing.'
      )
    }
    if (named.length === 0) {
      return null
    }
    const candidate = named[0]
    const labels = new Set(
      candidate.labels.map(label => label.toLocaleLowerCase())
    )
    if (
      candidate.os.toLocaleLowerCase() !== 'windows' ||
      !labels.has(hostRunnerArchitecture().toLocaleLowerCase())
    ) {
      throw new SelfHostedRunnerManagerError(
        'runner-registration-mismatch',
        'GitHub reported this runner name with a different operating system or architecture. Managed files and the recovery journal were retained.'
      )
    }
    return candidate
  }

  /**
   * A persisted runner id is authoritative for removal and recovery. Labels are
   * deliberately not part of this lookup because GitHub lets users edit them.
   */
  private async repositoryRunnerForRecovery(
    record: IDiskRunnerRecord,
    inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
  ) {
    const runnerId = await this.recoveredGitHubRunnerId(record)
    if (runnerId !== undefined) {
      return inventory.find(candidate => candidate.id === runnerId) ?? null
    }
    return this.repositoryRunnerByRecoverableName(record, inventory)
  }

  private async fetchRunnerInventory(
    record: IDiskRunnerRecord,
    token: string,
    signal?: AbortSignal
  ) {
    return fetchRepositoryRunnerInventory({
      endpoint: record.githubApiEndpoint,
      owner: record.owner,
      repository: record.repository,
      token,
      signal,
    })
  }

  private async confirmRepositoryRunnerAbsent(
    record: IDiskRunnerRecord,
    token: string,
    signal?: AbortSignal
  ): Promise<boolean> {
    let consecutiveAbsent = 0
    for (
      let attempt = 0;
      attempt < RunnerInventoryPostconditionAttempts;
      attempt++
    ) {
      this.throwIfOperationCancelled(signal)
      const inventory = await this.fetchRunnerInventory(record, token, signal)
      if (
        (await this.repositoryRunnerForRecovery(record, inventory)) !== null
      ) {
        consecutiveAbsent = 0
      } else {
        consecutiveAbsent++
        if (consecutiveAbsent === RunnerInventoryStabilityAttempts) {
          return true
        }
      }
      if (attempt + 1 < RunnerInventoryPostconditionAttempts) {
        await this.operationDelay(
          RunnerInventoryStabilityDelayMilliseconds,
          signal
        )
      }
    }
    return false
  }

  private async findRegistrationAfterAttempt(
    record: IDiskRunnerRecord,
    token: string,
    signal?: AbortSignal
  ) {
    const recoveredRunnerId = await this.recoveredGitHubRunnerId(record)
    for (
      let attempt = 0;
      attempt < RunnerInventoryPostconditionAttempts;
      attempt++
    ) {
      this.throwIfOperationCancelled(signal)
      const inventory = await this.fetchRunnerInventory(record, token, signal)
      const registered =
        recoveredRunnerId === undefined
          ? this.matchingRepositoryRunner(
              { ...record, githubRunnerId: undefined },
              inventory
            )
          : inventory.find(candidate => candidate.id === recoveredRunnerId) ??
            null
      if (registered !== null) {
        return registered
      }
      if (attempt + 1 < RunnerInventoryPostconditionAttempts) {
        await this.operationDelay(
          RunnerInventoryStabilityDelayMilliseconds,
          signal
        )
      }
    }
    return null
  }

  private async reconcileInterruptedRecords(
    records: Array<IDiskRunnerRecord>,
    signal?: AbortSignal
  ): Promise<void> {
    for (let index = 0; index < records.length; ) {
      const record = records[index]
      if (record.platform !== 'windows') {
        index++
        continue
      }
      if (record.lifecyclePhase === 'remote-removed') {
        try {
          await this.stopProcess(record)
          await rm(Path.join(this.root, record.id), {
            recursive: true,
            force: true,
          })
          records.splice(index, 1)
          await this.saveRecords()
          continue
        } catch {
          index++
          continue
        }
      }
      if (
        record.lifecyclePhase !== 'provisioning' &&
        record.lifecyclePhase !== 'removing' &&
        record.lifecyclePhase !== 'starting'
      ) {
        index++
        continue
      }
      const token =
        record.accountKey === undefined
          ? null
          : this.accountCredentials.resolve(
              record.accountKey,
              record.githubApiEndpoint
            )
      if (token === null) {
        index++
        continue
      }
      let inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
      try {
        inventory = await this.fetchRunnerInventory(record, token, signal)
      } catch {
        index++
        continue
      }
      const registered = await this.repositoryRunnerForRecovery(
        record,
        inventory
      )
      if (record.lifecyclePhase === 'provisioning') {
        if (registered !== null) {
          records[index] = {
            ...record,
            lifecyclePhase: 'registered',
            githubRunnerId: registered.id,
          }
          await this.saveRecords()
          index++
          continue
        }
        // A single absent inventory snapshot is not proof that a just-created
        // registration never existed. Keep the journal for an explicit retry.
      } else if (record.lifecyclePhase === 'removing') {
        // Removal may have crossed the local/remote boundary immediately
        // before a crash. Never reverse or complete it from one API snapshot;
        // the explicit Remove retry performs the stable postcondition proof.
      } else {
        const recoveredPid = await this.recoveredRunnerPid(record)
        if (recoveredPid === null) {
          // The launch wrapper writes its marker asynchronously. A restart in
          // that window must remain indeterminate instead of launching a
          // duplicate runner or erasing ownership of the eventual process.
          index++
          continue
        }
        const recovered = { ...record, pid: recoveredPid }
        const state = await this.runnerProcessState(recovered)
        const strictRegistration = this.matchingRepositoryRunner(
          {
            ...record,
            githubRunnerId: registered?.id ?? record.githubRunnerId,
          },
          inventory
        )
        records[index] =
          state === 'running'
            ? {
                ...recovered,
                status: 'running',
                lifecyclePhase:
                  strictRegistration?.status === 'online'
                    ? 'ready'
                    : 'starting',
                githubRunnerId: registered?.id ?? record.githubRunnerId,
              }
            : {
                ...recovered,
                pid: null,
                status: 'stopped',
                lifecyclePhase: 'registered',
                githubRunnerId: registered?.id ?? record.githubRunnerId,
              }
        await this.saveRecords()
      }
      index++
    }
  }

  private async runTrustMonitor(signal: AbortSignal): Promise<void> {
    if (this.shuttingDown || this.activeRunnerId !== null) {
      return
    }
    const controller = this.beginActiveOperation(TrustMonitorOperationId)
    const operationSignal = AbortSignal.any([signal, controller.signal])
    try {
      const records = await this.loadRecords()
      await this.reconcileInterruptedRecords(records, operationSignal)
      for (let index = 0; index < records.length; index++) {
        const record = records[index]
        if (
          operationSignal.aborted ||
          this.shuttingDown ||
          this.activeOperationAbortController !== controller ||
          record.platform !== 'windows'
        ) {
          return
        }
        if (record.lifecyclePhase !== 'ready') {
          continue
        }
        let state: RunnerProcessState
        try {
          state = await this.runnerProcessState(record)
        } catch {
          this.progress(
            record.id,
            'validating',
            'Runner trust recheck could not prove the local process identity; no destructive action was taken.'
          )
          continue
        }
        this.throwIfOperationCancelled(operationSignal)
        if (state === 'stopped') {
          if (record.status !== 'stopped' || record.pid !== null) {
            records[index] = {
              ...record,
              pid: null,
              status: 'stopped',
              lifecyclePhase: 'registered',
            }
            await this.saveRecords()
          }
          continue
        }
        try {
          const token =
            record.accountKey === undefined
              ? null
              : this.accountCredentials.resolve(
                  record.accountKey,
                  record.githubApiEndpoint
                )
          if (token === null) {
            throw new SelfHostedRunnerManagerError(
              'github-account-unavailable',
              'The creator account is unavailable for the scheduled runner trust recheck.'
            )
          }
          const inventory = await this.fetchRunnerInventory(
            record,
            token,
            operationSignal
          )
          const registeredRunner = await this.repositoryRunnerForRecovery(
            record,
            inventory
          )
          if (registeredRunner === null) {
            throw new SelfHostedRunnerManagerError(
              'runner-registration-mismatch',
              'The persisted GitHub runner registration is no longer present.'
            )
          }
          await this.assertRepositoryWorkflowTrust(
            record.githubApiEndpoint,
            record.owner,
            record.repository,
            token,
            registeredRunner.labels,
            operationSignal
          )
          if (
            !runnerMatchesExpectedIdentity(registeredRunner, {
              existingRunnerIds: new Set<number>(),
              expectedRunnerId: registeredRunner.id,
              name: record.name,
              requiredLabels: record.labels,
              os: 'Windows',
              architecture: hostRunnerArchitecture(),
            })
          ) {
            throw new SelfHostedRunnerManagerError(
              'runner-registration-mismatch',
              'GitHub reported changed runner identity or labels.'
            )
          }
          if (record.githubRunnerId !== registeredRunner.id) {
            records[index] = {
              ...record,
              githubRunnerId: registeredRunner.id,
            }
            await this.saveRecords()
          }
        } catch {
          if (operationSignal.aborted || this.shuttingDown) {
            return
          }
          try {
            await this.stopProcess(record)
            records[index] = {
              ...record,
              pid: null,
              status: 'stopped',
              lifecyclePhase: 'registered',
            }
            await this.saveRecords()
            this.progress(
              record.id,
              'complete',
              'Runner stopped because its repository trust check no longer passed.'
            )
          } catch {
            this.progress(
              record.id,
              'validating',
              'Runner trust changed, but Windows could not prove the owned process stopped. Close it before running another job.'
            )
          }
        }
      }
    } finally {
      this.finishActiveOperation(controller)
    }
  }

  public async shutdown(): Promise<void> {
    this.shuttingDown = true
    const activeOperation = this.activeOperationCompletion
    const trustMonitor = this.trustMonitorPromise
    this.activeOperationAbortController?.abort()
    this.trustMonitorAbortController?.abort()
    if (this.trustMonitorHandle !== null) {
      clearInterval(this.trustMonitorHandle)
      this.trustMonitorHandle = null
    }
    await Promise.allSettled(
      [activeOperation, trustMonitor].filter(
        (operation): operation is Promise<void> => operation !== null
      )
    )
    const records = await this.loadRecords()
    const recordById = new Map(
      records
        .filter(record => record.platform === 'windows')
        .map(record => [record.id, record] as const)
    )
    const runnerIds = new Set([
      ...recordById.keys(),
      ...this.liveProcesses.keys(),
    ])
    const runnerIdList = [...runnerIds]
    const stopResults = await Promise.allSettled(
      runnerIdList.map(async runnerId => {
        const child = this.liveProcesses.get(runnerId)
        if (child !== undefined) {
          if (child.pid === undefined) {
            throw new Error('runner-process-missing-pid')
          }
          const stopped = await killTreeAndWait(
            child.pid,
            () => child.exitCode === null && child.signalCode === null
          )
          if (!stopped) {
            throw new Error('runner-process-stop-timeout')
          }
          await waitForChildClose(child)
          this.liveProcesses.delete(runnerId)
          await rm(runnerPidPath(this.root, runnerId), { force: true }).catch(
            () => undefined
          )
          return runnerId
        }
        const record = recordById.get(runnerId)
        if (record === undefined) {
          return runnerId
        }
        await this.stopProcess(record)
        return runnerId
      })
    )
    const failures: Error[] = []
    for (let index = 0; index < stopResults.length; index++) {
      const result = stopResults[index]
      const runnerId = runnerIdList[index]
      if (result.status === 'rejected') {
        failures.push(
          result.reason instanceof Error
            ? result.reason
            : new Error('Unable to prove a managed runner stopped.')
        )
        continue
      }
      const recordIndex = records.findIndex(record => record.id === runnerId)
      if (recordIndex < 0) {
        continue
      }
      const record = records[recordIndex]
      records[recordIndex] = {
        ...record,
        pid: null,
        status: 'stopped',
        lifecyclePhase:
          record.lifecyclePhase === 'provisioning' ||
          record.lifecyclePhase === 'removing' ||
          record.lifecyclePhase === 'remote-removed'
            ? record.lifecyclePhase
            : 'registered',
      }
    }
    await this.saveRecords()
    if (failures.length > 0) {
      throw failures[0]
    }
  }

  private publicRecord(record: IDiskRunnerRecord): ISelfHostedRunner {
    return {
      id: record.id,
      accountKey: record.accountKey ?? null,
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
    this.ensureNotShuttingDown()
    let records = await this.loadRecords()
    this.ensureNotShuttingDown()
    if (this.activeRunnerId === StatusReconciliationOperationId) {
      const reconciliation = this.activeOperationCompletion
      if (reconciliation !== null) {
        await reconciliation
      }
      this.ensureNotShuttingDown()
      records = await this.loadRecords()
    }
    if (this.activeRunnerId === null) {
      const controller = this.beginActiveOperation(
        StatusReconciliationOperationId
      )
      try {
        await this.refreshStatuses(records)
        this.throwIfOperationCancelled(controller.signal)
        this.ensureNotShuttingDown()
        await this.saveRecords()
      } finally {
        this.finishActiveOperation(controller)
      }
    }
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

  public async preflight(
    request: ISelfHostedRunnerPreflightRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerPreflightResult>> {
    try {
      this.ensureNotShuttingDown()
      if (process.platform !== 'win32') {
        throw new SelfHostedRunnerManagerError(
          'unsupported-platform',
          'Self-hosted runner management is available from the Windows desktop app.'
        )
      }
      const accountKey = normalizeSelfHostedRunnerAccountKey(request.accountKey)
      if (accountKey === null) {
        throw new SelfHostedRunnerManagerError(
          'invalid-github-account',
          'Select a signed-in GitHub account before checking runner safety.'
        )
      }
      const endpoint = normalizeGitHubAPIEndpoint(request.githubApiEndpoint)
      const owner = validateRepositoryPart(request.owner, 'owner')
      const repository = validateRepositoryPart(
        request.repository,
        'repository'
      )
      // The setup form accepts at most 20 custom labels plus these three
      // GitHub-assigned labels. Reject an impossible form before audit IPC.
      const labels = normalizeLabels(request.labels, 23)
      const token = this.accountToken(accountKey, endpoint)
      const signal = AbortSignal.timeout(45_000)
      const audit = await this.assertRepositoryWorkflowTrust(
        endpoint,
        owner,
        repository,
        token,
        labels,
        signal
      )
      await this.assertStableRunnerQueue(
        endpoint,
        owner,
        repository,
        token,
        labels,
        signal
      )
      return { ok: true, result: audit }
    } catch (error) {
      return this.failure(error)
    }
  }

  private validateSetupRequest(
    request: ISelfHostedRunnerSetupRequest
  ): ValidatedSelfHostedRunnerSetupRequest {
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
    // The request may omit its account key, because the interface that builds
    // it has no account picker. Resolve it here so every step below has a
    // concrete account rather than each having to re-decide what "no account"
    // meant, and refuse when the endpoint carries more than one signed-in
    // account: guessing would register a runner as a user who never chose it.
    const normalizedEndpoint = normalizeGitHubAPIEndpoint(
      request.githubApiEndpoint
    )
    const resolvedAccountKey =
      request.accountKey ??
      this.accountCredentials.onlyAccountKeyForEndpoint(normalizedEndpoint)
    if (
      resolvedAccountKey === null ||
      resolvedAccountKey === undefined ||
      resolvedAccountKey.length === 0
    ) {
      throw new SelfHostedRunnerManagerError(
        'github-account-unavailable',
        'Sign in to exactly one account for this GitHub endpoint, or name the account to use.'
      )
    }
    const normalized: ValidatedSelfHostedRunnerSetupRequest = {
      id: request.id,
      accountKey: resolvedAccountKey,
      owner: validateRepositoryPart(request.owner, 'owner'),
      repository: validateRepositoryPart(request.repository, 'repository'),
      githubApiEndpoint: normalizedEndpoint,
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
    if (normalizeSelfHostedRunnerAccountKey(normalized.accountKey) === null) {
      throw new SelfHostedRunnerManagerError(
        'invalid-github-account',
        'Select a signed-in GitHub account before managing a runner.'
      )
    }
    if (platform === 'linux-wsl') {
      throw new SelfHostedRunnerManagerError(
        'linux-wsl-runner-management-disabled',
        'Linux in WSL runner management is temporarily unavailable because the app cannot yet prove cancellation of the in-distro process group. Use native Windows setup or manage the WSL runner directly.'
      )
    }
    return normalized
  }

  private async activateCompatibleWindowsGit(): Promise<boolean> {
    const candidates = new Set<string>()
    try {
      const discovered = await this.runOperationProcess({
        executable: systemExecutable('where.exe'),
        args: ['git.exe'],
        timeoutMilliseconds: 10_000,
      })
      if (discovered.exitCode === 0) {
        for (const line of discovered.stdout.toString('utf8').split(/\r?\n/)) {
          if (line.trim().length > 0) {
            candidates.add(line.trim())
          }
        }
      }
    } catch {
      this.throwIfOperationCancelled()
    }
    for (const base of [
      process.env.LocalAppData,
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
    ]) {
      if (base !== undefined && base.length > 0) {
        candidates.add(
          Path.join(
            base,
            base === process.env.LocalAppData ? 'Programs' : '',
            'Git',
            'cmd',
            'git.exe'
          )
        )
      }
    }
    for (const candidate of candidates) {
      if (!(await exists(candidate))) {
        continue
      }
      try {
        const version = await this.runOperationProcess({
          executable: candidate,
          args: ['--version'],
          timeoutMilliseconds: 10_000,
          maxOutputBytes: 4 * 1024,
        })
        if (
          version.exitCode !== 0 ||
          !/^git version \d+\.\d+(?:\.\d+)?/i.test(
            version.stdout.toString('utf8').trim()
          )
        ) {
          continue
        }
        const gitDirectory = Path.dirname(candidate)
        const pathKey =
          Object.keys(process.env).find(
            key => key.toLocaleLowerCase() === 'path'
          ) ?? 'Path'
        const currentPath = process.env[pathKey] ?? ''
        if (
          !currentPath
            .split(Path.delimiter)
            .some(
              entry =>
                Path.normalize(entry).toLocaleLowerCase() ===
                Path.normalize(gitDirectory).toLocaleLowerCase()
            )
        ) {
          process.env[
            pathKey
          ] = `${gitDirectory}${Path.delimiter}${currentPath}`
        }
        return true
      } catch {
        this.throwIfOperationCancelled()
      }
    }
    return false
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
      if (await this.activateCompatibleWindowsGit()) {
        return
      }
      if (!request.autoInstallDependencies) {
        throw new SelfHostedRunnerManagerError(
          'windows-dependencies-missing',
          'Git is required. Enable automatic dependency installation and retry.'
        )
      }
      let installed: ProcessResult
      try {
        installed = await this.runOperationProcess({
          executable: 'winget.exe',
          args: [
            'install',
            '--id',
            'Git.Git',
            '--exact',
            '--source',
            'winget',
            '--scope',
            'user',
            '--accept-source-agreements',
            '--accept-package-agreements',
          ],
          timeoutMilliseconds: 30 * 60 * 1_000,
        })
      } catch {
        this.throwIfOperationCancelled()
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
      if (!(await this.activateCompatibleWindowsGit())) {
        throw new SelfHostedRunnerManagerError(
          'windows-dependencies-install-failed',
          'Git installation completed, but the app could not verify a compatible git.exe. Repair Git for Windows and retry.'
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
        const result = await this.runOperationProcess({
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
        this.throwIfOperationCancelled()
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
      `install -d -m 0755 -o ${RunnerUser} -g ${RunnerUser} ${quotePosixShell(
        linuxRunner
      )}`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await this.runOperationProcess({
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
      this.throwIfOperationCancelled()
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
        exported = await this.runOperationProcess({
          executable: systemExecutable('wsl.exe'),
          args: ['--export', baseDistribution, archivePath],
          timeoutMilliseconds: WslCommandTimeoutMilliseconds,
        })
      } catch {
        this.throwIfOperationCancelled()
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
        imported = await this.runOperationProcess({
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
        this.throwIfOperationCancelled()
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

  private async removeWslRunnerDirectory(
    distribution: string,
    runnerId: string
  ): Promise<void> {
    const safeDistribution = normalizeDistribution(
      distribution,
      'WSL distribution'
    )
    if (!runnerIdIsSafe(runnerId)) {
      throw new SelfHostedRunnerManagerError(
        'invalid-runner-id',
        'The managed WSL runner identifier is invalid; its files were retained.'
      )
    }
    const target = `${LinuxRunnerRoot}/${runnerId}`
    const script = [
      'set -eu',
      `rm -rf -- ${quotePosixShell(target)}`,
      `test ! -e ${quotePosixShell(target)}`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await runProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          safeDistribution,
          '--user',
          'root',
          '--exec',
          '/bin/bash',
          '-lc',
          script,
        ],
        timeoutMilliseconds: 30_000,
      })
    } catch {
      throw new SelfHostedRunnerManagerError(
        'wsl-runner-cleanup-failed',
        `Remove ${target} from ${safeDistribution}; automatic cleanup did not finish.`
      )
    }
    if (result.exitCode !== 0) {
      throw commandFailure(
        'WSL runner file cleanup',
        result,
        `Remove ${target} from ${safeDistribution}.`
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
      'Unpacking the SHA-256-verified official Actions runner package.'
    )
    let listing: ProcessResult
    try {
      listing = await this.runOperationProcess({
        executable: systemExecutable('tar.exe'),
        args: ['-tf', packagePath],
        timeoutMilliseconds: CommandTimeoutMilliseconds,
        maxOutputBytes: 4 * 1024 * 1024,
      })
    } catch {
      this.throwIfOperationCancelled()
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
        result = await this.runOperationProcess({
          executable: systemExecutable('tar.exe'),
          args: ['-xf', packagePath, '-C', targetDirectory],
          timeoutMilliseconds: CommandTimeoutMilliseconds,
        })
      } catch {
        this.throwIfOperationCancelled()
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
      `mkdir -p ${quotePosixShell(linuxTarget)}`,
      `tar -xzf ${quotePosixShell(wslPackagePath)} -C ${quotePosixShell(
        linuxTarget
      )}`,
      `chown -R ${RunnerUser}:${RunnerUser} ${quotePosixShell(linuxTarget)}`,
      `test -x ${quotePosixShell(`${linuxTarget}/config.sh`)}`,
    ].join('\n')
    let result: ProcessResult
    try {
      result = await this.runOperationProcess({
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
      this.throwIfOperationCancelled()
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
    removeToken: string,
    signal?: AbortSignal
  ): Promise<void> {
    if (platform === 'windows') {
      const targetDirectory = runnerDirectory(this.root, runnerId)
      const invocation = buildWindowsRunnerRemovalInvocation(
        Path.join(targetDirectory, 'config.cmd'),
        removeToken
      )
      let result: ProcessResult
      try {
        result = await runProcess({
          executable: systemExecutable('cmd.exe'),
          args: ['/d', '/s', '/c', invocation.command],
          env: invocation.environment,
          timeoutMilliseconds: CommandTimeoutMilliseconds,
          signal,
        })
      } catch {
        this.throwIfOperationCancelled(signal)
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
    const script = buildLinuxRunnerRemovalScript(linuxTarget)
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
        signal,
      })
    } catch {
      this.throwIfOperationCancelled(signal)
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
    if (request.platform === 'windows') {
      const targetDirectory = runnerDirectory(this.root, runnerId)
      const invocation = buildWindowsRunnerConfigurationInvocation(
        {
          configPath: Path.join(targetDirectory, 'config.cmd'),
          repositoryURL,
          name: request.name,
          labels: request.labels,
        },
        registrationToken
      )
      let result: ProcessResult
      try {
        result = await this.runOperationProcess({
          executable: systemExecutable('cmd.exe'),
          args: ['/d', '/s', '/c', invocation.command],
          env: invocation.environment,
          timeoutMilliseconds: CommandTimeoutMilliseconds,
        })
      } catch {
        this.throwIfOperationCancelled()
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
    const script = buildLinuxRunnerConfigurationScript(
      linuxTarget,
      repositoryURL,
      request.name,
      request.labels
    )
    let result: ProcessResult
    try {
      result = await this.runOperationProcess({
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
      this.throwIfOperationCancelled()
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

  private async launchRunner(
    record: IDiskRunnerRecord,
    distribution: string | null
  ): Promise<ILaunchResult> {
    let launch: ILaunchResult
    if (record.platform === 'windows') {
      const runPath = Path.join(
        runnerDirectory(this.root, record.id),
        'run.cmd'
      )
      const runnerArguments = `/d /s /c ""${runPath.replace(/"/g, '""')}""`
      const script = [
        `[IO.File]::WriteAllText(${quotePowerShellLiteral(
          runnerPidPath(this.root, record.id)
        )}, [string]$PID)`,
        `$owner = Get-Process -Id ${process.pid} -ErrorAction Stop`,
        '$ownerStarted = $owner.StartTime.ToUniversalTime().Ticks',
        '$startInfo = New-Object System.Diagnostics.ProcessStartInfo',
        `$startInfo.FileName = ${quotePowerShellLiteral(
          systemExecutable('cmd.exe')
        )}`,
        `$startInfo.Arguments = ${quotePowerShellLiteral(runnerArguments)}`,
        `$startInfo.WorkingDirectory = ${quotePowerShellLiteral(
          runnerDirectory(this.root, record.id)
        )}`,
        '$startInfo.UseShellExecute = $false',
        '$startInfo.CreateNoWindow = $true',
        '$runner = [System.Diagnostics.Process]::Start($startInfo)',
        'if ($null -eq $runner) { exit 70 }',
        'try {',
        '  while (-not $runner.WaitForExit(1000)) {',
        `    $currentOwner = Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
        '    if ($null -eq $currentOwner -or $currentOwner.StartTime.ToUniversalTime().Ticks -ne $ownerStarted) {',
        `      & ${quotePowerShellLiteral(
          systemExecutable('taskkill.exe')
        )} /PID ([string]$runner.Id) /T /F | Out-Null`,
        '      $runner.WaitForExit(5000) | Out-Null',
        '      exit 71',
        '    }',
        '  }',
        '  exit $runner.ExitCode',
        '} finally {',
        '  if ($null -ne $runner -and -not $runner.HasExited) {',
        `    & ${quotePowerShellLiteral(
          systemExecutable('taskkill.exe')
        )} /PID ([string]$runner.Id) /T /F | Out-Null`,
        '    $runner.WaitForExit(5000) | Out-Null',
        '  }',
        '}',
      ].join('\n')
      launch = await launchProcess({
        executable: powershellExecutable(),
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        cwd: runnerDirectory(this.root, record.id),
      })
    } else {
      if (distribution === null) {
        throw new SelfHostedRunnerManagerError(
          'invalid-wsl-selection',
          'The Linux runner no longer has a WSL distribution selected.'
        )
      }
      const linuxTarget = `${LinuxRunnerRoot}/${record.id}`
      launch = await launchProcess({
        executable: systemExecutable('wsl.exe'),
        args: [
          '--distribution',
          distribution,
          '--user',
          RunnerUser,
          '--exec',
          '/bin/bash',
          '-lc',
          `cd ${quotePosixShell(linuxTarget)} && exec ./run.sh`,
        ],
      })
    }
    this.liveProcesses.set(record.id, launch.child)
    launch.child.once('close', () => {
      if (this.liveProcesses.get(record.id) === launch.child) {
        this.liveProcesses.delete(record.id)
      }
    })
    return launch
  }

  public async setup(
    request: ISelfHostedRunnerSetupRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    try {
      this.ensureNotShuttingDown()
    } catch (error) {
      return this.failure(error)
    }
    if (this.activeRunnerId !== null) {
      return {
        ok: false,
        code: 'runner-operation-active',
        recovery:
          'Wait for the current runner operation to finish, then retry.',
      }
    }
    let normalized: ValidatedSelfHostedRunnerSetupRequest
    try {
      normalized = this.validateSetupRequest(request)
    } catch (error) {
      return this.failure(error)
    }
    const operationController = this.beginActiveOperation(normalized.id)
    const operationSignal = operationController.signal
    this.progress(normalized.id, 'validating', 'Validating runner settings.')
    let recordAdded = false
    let registrationAttempted = false
    let registrationCompleted = false
    let registrationCompensated = true
    let managedDirectoryCreated = false
    let distribution: string | null = null
    let packagePath: string | null = null
    let dedicatedWsl = false
    let createdDedicatedDistribution: string | null = null
    let runnerArchitecture = hostRunnerArchitecture()
    let accountToken: string | null = null
    let existingRunnerIds: ReadonlySet<number> = new Set()
    let runnerExtracted = false
    let launchedRecord: IDiskRunnerRecord | null = null
    let readinessCompleted = false
    let records: Array<IDiskRunnerRecord> | null = null
    const knownPreflightRiskReceipts = new Map<
      KnownUnsafeSelfHostedRunnerPreflightCode,
      IKnownUnsafePreflightReceipt
    >()
    const initialRunnerLabels = completeRunnerLabels(
      normalized.labels,
      'Windows',
      runnerArchitecture
    )
    try {
      accountToken = this.accountToken(
        normalized.accountKey,
        normalized.githubApiEndpoint
      )
      this.progress(
        normalized.id,
        'validating',
        'Auditing every workflow at the immutable default-branch commit.'
      )
      await this.assertRepositoryWorkflowTrustWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        initialRunnerLabels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'workflow-trust'
      )
      this.progress(
        normalized.id,
        'validating',
        'Checking for historical pending jobs before creating managed runner files.'
      )
      await this.assertStableRunnerQueueWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        initialRunnerLabels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'queued-job'
      )
      this.throwIfOperationCancelled(operationSignal)
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
        runnerArchitecture = await this.preflightWslDistribution(distribution)
      }
      this.progress(
        normalized.id,
        'validating',
        'Checking the current GitHub runner inventory for a safe unique name.'
      )
      let initialInventory: Awaited<
        ReturnType<typeof fetchRepositoryRunnerInventory>
      >
      try {
        initialInventory = await fetchRepositoryRunnerInventory({
          endpoint: normalized.githubApiEndpoint,
          owner: normalized.owner,
          repository: normalized.repository,
          token: accountToken,
          signal: operationSignal,
        })
      } catch {
        this.throwIfOperationCancelled(operationSignal)
        throw new SelfHostedRunnerManagerError(
          'runner-inventory-unavailable',
          'GitHub runner inventory could not be verified. Setup stopped before registration so an existing runner cannot be replaced.'
        )
      }
      if (
        initialInventory.some(
          runner =>
            runner.name.toLocaleLowerCase() ===
            normalized.name.toLocaleLowerCase()
        )
      ) {
        throw new SelfHostedRunnerManagerError(
          'runner-name-exists',
          'GitHub already has a runner with that name. Choose a unique runner name and retry.'
        )
      }
      existingRunnerIds = new Set(initialInventory.map(runner => runner.id))
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
      this.progress(
        normalized.id,
        'downloading-runner',
        'Downloading and verifying the official Actions runner package.'
      )
      await downloadAndVerifyRunner(
        normalized.platform,
        packagePath,
        runnerArchitecture,
        operationSignal
      )
      await this.extractRunner(
        normalized.platform,
        packagePath,
        normalized.id,
        distribution
      )
      runnerExtracted = true
      const record: IDiskRunnerRecord = {
        id: normalized.id,
        accountKey: normalized.accountKey,
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
        lifecyclePhase: 'provisioning',
      }
      records.push(record)
      recordAdded = true
      await this.saveRecords()
      this.progress(
        normalized.id,
        'validating',
        'Rechecking repository trust immediately before registration.'
      )
      await this.assertRepositoryWorkflowTrustWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        initialRunnerLabels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'pre-registration workflow-trust'
      )
      const registrationToken = await mintRunnerToken(
        normalized.githubApiEndpoint,
        normalized.owner,
        normalized.repository,
        accountToken,
        'registration',
        operationSignal
      )
      this.ensureNotShuttingDown()
      this.throwIfOperationCancelled(operationSignal)
      registrationAttempted = true
      registrationCompensated = false
      await this.configureRunner(
        normalized,
        normalized.id,
        distribution,
        registrationToken
      )
      registrationCompleted = true
      const storedIndex = records.findIndex(
        candidate => candidate.id === record.id
      )
      const configuredRunner = await this.findRegistrationAfterAttempt(
        record,
        accountToken,
        operationSignal
      )
      if (configuredRunner === null) {
        const recoveredRunnerId = await this.recoveredGitHubRunnerId(record)
        if (recoveredRunnerId !== undefined) {
          records[storedIndex] = {
            ...record,
            lifecyclePhase: 'registered',
            githubRunnerId: recoveredRunnerId,
          }
          await this.saveRecords()
        }
        throw new SelfHostedRunnerManagerError(
          'runner-registration-not-visible',
          'GitHub did not report the exact new registration after configuration. Setup retained recovery state and stopped before launch.'
        )
      }
      records[storedIndex] = {
        ...record,
        lifecyclePhase: 'registered',
        githubRunnerId: configuredRunner.id,
      }
      await this.saveRecords()
      await rm(packagePath, { force: true }).catch(() => undefined)
      this.progress(
        normalized.id,
        'starting-runner',
        'Starting the runner process in the background.'
      )
      await rm(runnerPidPath(this.root, record.id), { force: true })
      records[storedIndex] = {
        ...records[storedIndex],
        lifecyclePhase: 'starting',
      }
      await this.saveRecords()
      this.progress(
        normalized.id,
        'validating',
        'Rechecking repository trust immediately before launch.'
      )
      const prelaunchInventory = await fetchRepositoryRunnerInventory({
        endpoint: normalized.githubApiEndpoint,
        owner: normalized.owner,
        repository: normalized.repository,
        token: accountToken,
        signal: operationSignal,
      })
      const prelaunchRunner = await this.repositoryRunnerForRecovery(
        records[storedIndex],
        prelaunchInventory
      )
      const prelaunchExpectation = {
        existingRunnerIds: new Set<number>(),
        expectedRunnerId: configuredRunner.id,
        name: normalized.name,
        requiredLabels: normalized.labels,
        os: 'Windows' as const,
        architecture: runnerArchitecture,
      }
      if (
        prelaunchRunner === null ||
        !runnerMatchesExpectedIdentity(prelaunchRunner, prelaunchExpectation)
      ) {
        throw new SelfHostedRunnerManagerError(
          'runner-registration-mismatch',
          'The registered runner identity or labels changed before launch. Setup stopped and rolled the registration back.'
        )
      }
      await this.assertRepositoryWorkflowTrustWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        prelaunchRunner.labels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'pre-launch workflow-trust'
      )
      this.progress(
        normalized.id,
        'validating',
        'Checking for historical pending jobs that could claim this runner.'
      )
      await this.assertStableRunnerQueueWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        prelaunchRunner.labels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'pre-launch queued-job'
      )
      await this.assertRepositoryWorkflowTrustWithConfirmedRisk(
        normalized.githubApiEndpoint,
        normalized.accountKey,
        normalized.owner,
        normalized.repository,
        accountToken,
        prelaunchRunner.labels,
        operationSignal,
        knownPreflightRiskReceipts,
        normalized.id,
        'final workflow-trust'
      )
      this.ensureNotShuttingDown()
      this.throwIfOperationCancelled(operationSignal)
      const launch = await this.launchRunner(records[storedIndex], distribution)
      launchedRecord = {
        ...records[storedIndex],
        pid: launch.pid,
        status: 'running',
        lifecyclePhase: 'starting',
      }
      records[storedIndex] = launchedRecord
      await this.saveRecords()
      this.progress(
        normalized.id,
        'starting-runner',
        'Waiting for GitHub to report the exact runner online with the expected labels.'
      )
      const readyRunner = await waitForRunnerReadiness(
        {
          existingRunnerIds,
          name: normalized.name,
          requiredLabels: normalized.labels,
          os: normalized.platform === 'windows' ? 'Windows' : 'Linux',
          architecture: runnerArchitecture,
        },
        {
          fetchInventory: () =>
            fetchRepositoryRunnerInventory({
              endpoint: normalized.githubApiEndpoint,
              owner: normalized.owner,
              repository: normalized.repository,
              token: accountToken!,
              signal: operationSignal,
            }),
          isLocalProcessRunning: () =>
            this.isRunnerProcessRunning(launchedRecord!),
          now: () => Date.now(),
          delay: milliseconds =>
            this.operationDelay(milliseconds, operationSignal),
          signal: operationSignal,
        }
      )
      readinessCompleted = true
      records[storedIndex] = {
        ...launchedRecord,
        lifecyclePhase: 'ready',
        githubRunnerId: readyRunner.id,
      }
      launchedRecord = records[storedIndex]
      await this.saveRecords()
      this.progress(normalized.id, 'complete', 'Runner setup is complete.')
      return {
        ok: true,
        result: { runner: this.publicRecord(records[storedIndex]) },
      }
    } catch (error) {
      const cleanupWarnings: string[] = []
      let processStopped = launchedRecord === null
      if (launchedRecord !== null && !readinessCompleted) {
        try {
          await this.stopProcess(launchedRecord)
          processStopped = true
        } catch {
          cleanupWarnings.push(
            'The launched runner process could not be proven stopped; its managed files were retained.'
          )
        }
      }

      if (
        registrationAttempted &&
        !registrationCompleted &&
        records !== null &&
        accountToken !== null
      ) {
        const index = records.findIndex(record => record.id === normalized.id)
        if (index >= 0) {
          try {
            const recoveredRegistration =
              await this.findRegistrationAfterAttempt(
                records[index],
                accountToken,
                operationSignal
              )
            if (recoveredRegistration === null) {
              const recoveredRunnerId = await this.recoveredGitHubRunnerId(
                records[index]
              )
              if (recoveredRunnerId !== undefined) {
                registrationCompleted = true
                records[index] = {
                  ...records[index],
                  lifecyclePhase: 'registered',
                  githubRunnerId: recoveredRunnerId,
                }
              } else {
                cleanupWarnings.push(
                  'GitHub did not prove the interrupted registration absent; a provisioning recovery record was retained.'
                )
              }
            } else {
              registrationCompleted = true
              records[index] = {
                ...records[index],
                lifecyclePhase: 'registered',
                githubRunnerId: recoveredRegistration.id,
              }
            }
          } catch {
            cleanupWarnings.push(
              'GitHub could not prove whether the interrupted registration exists; a provisioning recovery record was retained.'
            )
          }
        }
      }

      if (registrationCompleted && !readinessCompleted) {
        registrationCompensated = false
        const recoveryToken =
          accountToken ??
          this.accountCredentials.resolve(
            normalized.accountKey,
            normalized.githubApiEndpoint
          )
        if (processStopped && recoveryToken !== null) {
          try {
            const removeToken = await mintRunnerToken(
              normalized.githubApiEndpoint,
              normalized.owner,
              normalized.repository,
              recoveryToken,
              'remove',
              operationSignal
            )
            await this.unregisterRunner(
              normalized.platform,
              normalized.id,
              distribution,
              removeToken,
              operationSignal
            )
            const recoveryIndex = records?.findIndex(
              record => record.id === normalized.id
            )
            const recoveryRecord =
              recoveryIndex !== undefined && recoveryIndex >= 0
                ? records![recoveryIndex]
                : null
            if (
              recoveryRecord !== null &&
              (await this.confirmRepositoryRunnerAbsent(
                recoveryRecord,
                recoveryToken,
                AbortSignal.timeout(15_000)
              ))
            ) {
              registrationCompensated = true
            } else {
              cleanupWarnings.push(
                'GitHub did not prove the failed registration absent; a stopped recovery record was retained.'
              )
            }
          } catch {
            cleanupWarnings.push(
              'The failed setup could not be unregistered from GitHub; a stopped recovery record was retained.'
            )
          }
        }
      }

      const retainRecoveryRecord =
        registrationAttempted && !registrationCompensated
      let stateSafeForCleanup = true
      if (records !== null && recordAdded) {
        const index = records.findIndex(record => record.id === normalized.id)
        if (retainRecoveryRecord) {
          const recoveryRecord: IDiskRunnerRecord = {
            id: normalized.id,
            accountKey: normalized.accountKey,
            owner: normalized.owner,
            repository: normalized.repository,
            githubApiEndpoint: normalized.githubApiEndpoint,
            name: normalized.name,
            labels: normalized.labels,
            platform: normalized.platform,
            wslDistribution: distribution,
            dedicatedWsl,
            createdAt:
              index >= 0 ? records[index].createdAt : new Date().toISOString(),
            pid: processStopped ? null : launchedRecord?.pid ?? null,
            status: processStopped ? 'stopped' : 'running',
            lifecyclePhase: registrationCompleted
              ? processStopped
                ? 'registered'
                : 'starting'
              : 'provisioning',
            githubRunnerId:
              index >= 0 ? records[index].githubRunnerId : undefined,
          }
          if (index >= 0) {
            records[index] = recoveryRecord
          } else {
            records.push(recoveryRecord)
          }
        } else if (index >= 0) {
          records.splice(index, 1)
        }
        try {
          await this.saveRecords()
        } catch {
          stateSafeForCleanup = false
          cleanupWarnings.push(
            'The runner state file could not be updated; managed resources were retained for recovery.'
          )
        }
      }

      const cleanupAllowed =
        processStopped &&
        stateSafeForCleanup &&
        (!registrationAttempted || registrationCompensated)
      if (
        cleanupAllowed &&
        runnerExtracted &&
        normalized.platform === 'linux-wsl' &&
        distribution !== null &&
        !dedicatedWsl
      ) {
        try {
          await this.removeWslRunnerDirectory(distribution, normalized.id)
        } catch {
          cleanupWarnings.push(
            `Remove ${LinuxRunnerRoot}/${normalized.id} from ${distribution}; WSL cleanup did not complete.`
          )
        }
      }
      if (cleanupAllowed && managedDirectoryCreated) {
        try {
          await rm(Path.join(this.root, normalized.id), {
            recursive: true,
            force: true,
          })
        } catch {
          cleanupWarnings.push(
            'The local managed runner directory could not be deleted.'
          )
        }
      }
      if (packagePath !== null) {
        await rm(packagePath, { force: true }).catch(() => undefined)
      }
      if (cleanupAllowed && createdDedicatedDistribution !== null) {
        try {
          await this.unregisterDedicatedWsl(createdDedicatedDistribution)
        } catch {
          cleanupWarnings.push(
            `Remove the dedicated ${createdDedicatedDistribution} distro from WSL; automatic cleanup did not complete.`
          )
        }
      }
      const reportedError =
        error instanceof RunnerReadinessError
          ? new SelfHostedRunnerManagerError(
              error.code === 'local-process-exited'
                ? 'runner-start-failed'
                : 'runner-readiness-timeout',
              error.code === 'local-process-exited'
                ? 'The runner process exited before GitHub reported it online. Review the managed runner diagnostics and retry.'
                : 'GitHub did not report the exact runner online with the expected labels before the readiness deadline. Setup was rolled back.'
            )
          : error
      const failure = this.failure<ISelfHostedRunnerSetupResult>(reportedError)
      if (cleanupWarnings.length === 0 || failure.ok) {
        return failure
      }
      return {
        ...failure,
        recovery: `${failure.recovery} ${cleanupWarnings.join(' ')}`,
      }
    } finally {
      this.finishActiveOperation(operationController)
    }
  }

  private failure<T>(error: unknown): SelfHostedRunnerReply<T> {
    if (error instanceof SelfHostedRunnerManagerError) {
      return { ok: false, code: error.code, recovery: error.recovery }
    }
    if (
      error instanceof Error &&
      error.message.startsWith('runner-operation-cancelled')
    ) {
      return {
        ok: false,
        code: 'runner-operation-cancelled',
        recovery:
          'Runner setup was cancelled. Any completed registration was rolled back or retained as a stopped recovery record.',
      }
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
    const ownedRecord = {
      ...record,
      pid: await this.recoveredRunnerPid(record),
    }
    if ((await this.runnerProcessState(ownedRecord)) === 'stopped') {
      this.liveProcesses.delete(record.id)
      await rm(runnerPidPath(this.root, record.id), { force: true }).catch(
        () => undefined
      )
      return
    }
    let commandResult: ProcessResult | null = null
    try {
      commandResult = await runProcess({
        executable: systemExecutable('taskkill.exe'),
        args: ['/PID', String(ownedRecord.pid), '/T', '/F'],
        timeoutMilliseconds: 10_000,
      })
    } catch {
      // The postcondition below decides whether an error still stopped the tree.
    }
    try {
      await waitForSelfHostedRunnerProcessStop({
        readState: () => this.runnerProcessState(ownedRecord),
        now: () => Date.now(),
        delay: milliseconds =>
          new Promise(resolve => setTimeout(resolve, milliseconds)),
      })
      this.liveProcesses.delete(record.id)
      await rm(runnerPidPath(this.root, record.id), { force: true }).catch(
        () => undefined
      )
    } catch (error) {
      if (error instanceof SelfHostedRunnerManagerError) {
        throw error
      }
      if (commandResult !== null && commandResult.exitCode !== 0) {
        throw commandFailure(
          'Runner stop',
          commandResult,
          'Close the runner process and retry.'
        )
      }
      throw new SelfHostedRunnerManagerError(
        'runner-stop-failed',
        'Windows did not prove that the exact managed runner process tree stopped. No runner state or managed files were changed.'
      )
    }
  }

  public async start(
    request: ISelfHostedRunnerControlRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    try {
      this.ensureNotShuttingDown()
    } catch (error) {
      return this.failure(error)
    }
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
    const operationController = this.beginActiveOperation(request.id)
    const operationSignal = operationController.signal
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      if (record.platform === 'linux-wsl') {
        throw new SelfHostedRunnerManagerError(
          'linux-wsl-runner-management-disabled',
          'The app cannot yet prove process-group control inside WSL. Start this runner directly inside its distro.'
        )
      }
      await this.refreshStatuses(records)
      let current = records.find(candidate => candidate.id === record.id)!
      if (current.accountKey === undefined) {
        throw new SelfHostedRunnerManagerError(
          'github-account-unavailable',
          'This legacy runner record has no creator account identity. Remove and recreate it before starting.'
        )
      }
      const accountToken = this.accountToken(
        current.accountKey,
        current.githubApiEndpoint
      )
      this.progress(
        current.id,
        'validating',
        'Re-auditing repository visibility and workflows before launch.'
      )
      await this.assertRepositoryWorkflowTrust(
        current.githubApiEndpoint,
        current.owner,
        current.repository,
        accountToken,
        completeRunnerLabels(
          current.labels,
          'Windows',
          hostRunnerArchitecture()
        ),
        operationSignal
      )
      let inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
      try {
        inventory = await fetchRepositoryRunnerInventory({
          endpoint: current.githubApiEndpoint,
          owner: current.owner,
          repository: current.repository,
          token: accountToken,
          signal: operationSignal,
        })
      } catch {
        this.throwIfOperationCancelled(operationSignal)
        throw new SelfHostedRunnerManagerError(
          'runner-inventory-unavailable',
          'GitHub runner inventory could not be verified, so the runner was not started.'
        )
      }
      const baseExpectation = {
        existingRunnerIds: new Set<number>(),
        name: current.name,
        requiredLabels: current.labels,
        os: 'Windows' as const,
        architecture: hostRunnerArchitecture(),
      }
      const registeredRunner = await this.repositoryRunnerForRecovery(
        current,
        inventory
      )
      if (registeredRunner === null) {
        throw new SelfHostedRunnerManagerError(
          'runner-registration-mismatch',
          'GitHub did not report the persisted runner registration. Repair or recreate it before starting.'
        )
      }
      await this.assertRepositoryWorkflowTrust(
        current.githubApiEndpoint,
        current.owner,
        current.repository,
        accountToken,
        registeredRunner.labels,
        operationSignal
      )
      if (
        !runnerMatchesExpectedIdentity(registeredRunner, {
          ...baseExpectation,
          expectedRunnerId: registeredRunner.id,
        })
      ) {
        throw new SelfHostedRunnerManagerError(
          'runner-registration-mismatch',
          'GitHub reported changed runner identity or labels. Review the live labels and recreate the managed runner before starting it.'
        )
      }
      this.progress(
        current.id,
        'validating',
        'Checking for historical pending jobs that could claim this runner.'
      )
      await this.assertStableRunnerQueue(
        current.githubApiEndpoint,
        current.owner,
        current.repository,
        accountToken,
        registeredRunner.labels,
        operationSignal
      )
      await this.assertRepositoryWorkflowTrust(
        current.githubApiEndpoint,
        current.owner,
        current.repository,
        accountToken,
        registeredRunner.labels,
        operationSignal
      )
      const expectedRunnerId = registeredRunner.id
      if (current.githubRunnerId !== expectedRunnerId) {
        current = { ...current, githubRunnerId: expectedRunnerId }
      }
      let launchedHere = false
      let startingJournalSaved = false
      const index = records.findIndex(candidate => candidate.id === record.id)
      if (current.status !== 'running') {
        try {
          this.progress(
            record.id,
            'starting-runner',
            'Starting the runner process.'
          )
          await rm(runnerPidPath(this.root, current.id), { force: true })
          current = { ...current, lifecyclePhase: 'starting' }
          records[index] = current
          startingJournalSaved = true
          await this.saveRecords()
          this.ensureNotShuttingDown()
          this.throwIfOperationCancelled(operationSignal)
          const launch = await this.launchRunner(
            current,
            current.wslDistribution
          )
          launchedHere = true
          current = {
            ...current,
            pid: launch.pid,
            status: 'running',
            lifecyclePhase: 'starting',
          }
          records[index] = current
          try {
            await this.saveRecords()
          } catch (error) {
            try {
              await this.stopProcess(current)
            } catch {
              throw new SelfHostedRunnerManagerError(
                'runner-start-rollback-failed',
                'The runner launched, but its state could not be saved and the process could not be proven stopped. Close the managed runner process before retrying.'
              )
            }
            current = {
              ...current,
              pid: null,
              status: 'stopped',
              lifecyclePhase: 'registered',
            }
            records[index] = current
            try {
              await this.saveRecords()
            } catch {
              throw new SelfHostedRunnerManagerError(
                'runner-start-rollback-failed',
                'The runner stopped after its state save failed, but the stopped recovery state could not be saved. Repair the runner journal before retrying.'
              )
            }
            throw error
          }
        } catch (error) {
          if (!launchedHere && startingJournalSaved) {
            current = {
              ...current,
              pid: null,
              status: 'stopped',
              lifecyclePhase: 'registered',
            }
            records[index] = current
            try {
              await this.saveRecords()
            } catch {
              throw new SelfHostedRunnerManagerError(
                'runner-start-rollback-failed',
                'Runner start failed before launch, but its stopped recovery state could not be saved. Repair the runner journal before retrying.'
              )
            }
          }
          throw error
        }
      }
      try {
        const readyRunner = await waitForRunnerReadiness(
          { ...baseExpectation, expectedRunnerId },
          {
            fetchInventory: () =>
              fetchRepositoryRunnerInventory({
                endpoint: current.githubApiEndpoint,
                owner: current.owner,
                repository: current.repository,
                token: accountToken,
                signal: operationSignal,
              }),
            isLocalProcessRunning: () => this.isRunnerProcessRunning(current),
            now: () => Date.now(),
            delay: milliseconds =>
              this.operationDelay(milliseconds, operationSignal),
            signal: operationSignal,
          }
        )
        current = {
          ...current,
          lifecyclePhase: 'ready',
          githubRunnerId: readyRunner.id,
        }
        records[index] = current
        await this.saveRecords()
      } catch (error) {
        if (launchedHere) {
          try {
            await this.stopProcess(current)
            current = {
              ...current,
              pid: null,
              status: 'stopped',
              lifecyclePhase: 'registered',
            }
            records[index] = current
            await this.saveRecords()
          } catch {
            throw new SelfHostedRunnerManagerError(
              'runner-start-rollback-failed',
              'GitHub did not report the runner ready, and the launched process could not be proven stopped. Close it before retrying.'
            )
          }
        }
        if (error instanceof RunnerReadinessError) {
          throw new SelfHostedRunnerManagerError(
            error.code === 'local-process-exited'
              ? 'runner-start-failed'
              : 'runner-readiness-timeout',
            error.code === 'local-process-exited'
              ? 'The runner process exited before GitHub reported it online. Review its diagnostics and retry.'
              : 'GitHub did not report the exact registered runner online before the readiness deadline.'
          )
        }
        throw error
      }
      return { ok: true, result: { runner: this.publicRecord(current) } }
    } catch (error) {
      return this.failure(error)
    } finally {
      this.finishActiveOperation(operationController)
    }
  }

  public async stop(
    request: ISelfHostedRunnerControlRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>> {
    try {
      this.ensureNotShuttingDown()
    } catch (error) {
      return this.failure(error)
    }
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
    const operationController = this.beginActiveOperation(request.id)
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      if (record.platform === 'linux-wsl') {
        throw new SelfHostedRunnerManagerError(
          'linux-wsl-runner-management-disabled',
          'The app cannot yet prove process-group control inside WSL. Stop this runner directly inside its distro.'
        )
      }
      await this.stopProcess(record)
      const index = records.findIndex(candidate => candidate.id === record.id)
      records[index] = {
        ...record,
        pid: null,
        status: 'stopped',
        lifecyclePhase: 'registered',
      }
      await this.saveRecords()
      return { ok: true, result: { runner: this.publicRecord(records[index]) } }
    } catch (error) {
      return this.failure(error)
    } finally {
      this.finishActiveOperation(operationController)
    }
  }

  public async remove(
    request: ISelfHostedRunnerRemoveRequest
  ): Promise<SelfHostedRunnerReply<ISelfHostedRunnerRemoveResult>> {
    try {
      this.ensureNotShuttingDown()
    } catch (error) {
      return this.failure(error)
    }
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
    const operationController = this.beginActiveOperation(request.id)
    const operationSignal = operationController.signal
    try {
      const records = await this.loadRecords()
      const record = await this.findRecord(request)
      if (record.platform === 'linux-wsl') {
        throw new SelfHostedRunnerManagerError(
          'linux-wsl-runner-management-disabled',
          'The app cannot yet prove process-group control inside WSL. Remove this runner directly in GitHub and its selected distro.'
        )
      }
      const githubApiEndpoint = normalizeGitHubAPIEndpoint(
        request.githubApiEndpoint
      )
      if (githubApiEndpoint !== record.githubApiEndpoint) {
        throw new SelfHostedRunnerManagerError(
          'github-account-mismatch',
          'Select the GitHub account that created this runner before removing it.'
        )
      }
      const accountKey = normalizeSelfHostedRunnerAccountKey(request.accountKey)
      if (accountKey === null) {
        throw new SelfHostedRunnerManagerError(
          'invalid-github-account',
          'Select a signed-in GitHub account before removing a runner.'
        )
      }
      if (record.accountKey !== undefined && record.accountKey !== accountKey) {
        throw new SelfHostedRunnerManagerError(
          'github-account-mismatch',
          'Select the GitHub account that created this runner before removing it.'
        )
      }
      const accountToken = this.accountToken(accountKey, githubApiEndpoint)
      this.progress(
        record.id,
        'removing-runner',
        'Stopping and unregistering the runner.'
      )
      await this.stopProcess(record)
      const index = records.findIndex(candidate => candidate.id === record.id)
      const recoveredGitHubRunnerId = await this.recoveredGitHubRunnerId(record)
      const removalRecord = {
        ...record,
        githubRunnerId: recoveredGitHubRunnerId,
      }
      records[index] = {
        ...removalRecord,
        pid: null,
        status: 'stopped',
        lifecyclePhase: 'removing',
      }
      await this.saveRecords()
      const distribution = record.wslDistribution
      const warnings: string[] = []
      let inventory: Awaited<ReturnType<typeof fetchRepositoryRunnerInventory>>
      try {
        inventory = await fetchRepositoryRunnerInventory({
          endpoint: githubApiEndpoint,
          owner: record.owner,
          repository: record.repository,
          token: accountToken,
          signal: operationSignal,
        })
      } catch {
        this.throwIfOperationCancelled(operationSignal)
        throw new SelfHostedRunnerManagerError(
          'runner-inventory-unavailable',
          'GitHub runner inventory could not be verified, so removal stopped before unregistering or deleting files.'
        )
      }
      const registeredRunner = await this.repositoryRunnerForRecovery(
        removalRecord,
        inventory
      )
      if (registeredRunner !== null) {
        records[index] = {
          ...records[index],
          githubRunnerId: registeredRunner.id,
        }
        await this.saveRecords()
        const removeToken = await mintRunnerToken(
          githubApiEndpoint,
          record.owner,
          record.repository,
          accountToken,
          'remove',
          operationSignal
        )
        await this.unregisterRunner(
          record.platform,
          record.id,
          distribution,
          removeToken,
          operationSignal
        )
      }
      const absenceConfirmed = await this.confirmRepositoryRunnerAbsent(
        {
          ...removalRecord,
          githubRunnerId: registeredRunner?.id ?? removalRecord.githubRunnerId,
        },
        accountToken,
        operationSignal
      )
      if (!absenceConfirmed) {
        throw new SelfHostedRunnerManagerError(
          'runner-removal-not-confirmed',
          'GitHub still reports the exact runner registration. Managed files and the recovery journal were retained; retry removal after the inventory updates.'
        )
      }
      records[index] = {
        ...records[index],
        lifecyclePhase: 'remote-removed',
      }
      await this.saveRecords()
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
      this.finishActiveOperation(operationController)
    }
  }
}
