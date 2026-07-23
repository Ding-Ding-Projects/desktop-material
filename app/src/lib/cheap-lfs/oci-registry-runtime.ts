import { createHash } from 'crypto'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { lstat, open, realpath } from 'fs/promises'
import { join, relative, resolve, isAbsolute, basename } from 'path'

export type CheapLfsRegistryProvider = 'ghcr' | 'docker-hub'
export type CheapLfsOrasArchitecture = 'x64' | 'arm64'

export const CheapLfsOrasManifestVersion = 1
export const CheapLfsDockerHubCredentialServer = 'https://index.docker.io/v1/'
export const CheapLfsBundledOrasVersion = '1.3.2'
export const CheapLfsBundledOrasWindowsAmd64ArchiveUrl =
  'https://github.com/oras-project/oras/releases/download/v1.3.2/oras_1.3.2_windows_amd64.zip'
export const CheapLfsBundledOrasWindowsAmd64ArchiveSha256 =
  'sha256:c896f26245f11e6385d52010bb0a65a4e500e1f3244680a6556ed05462fa1c0d'
export const CheapLfsBundledOrasWindowsAmd64ExecutableSha256 =
  'sha256:1fd2a8672c9a6e5aade53380dd405781271e802529edef6e8d9509d508b8482b'
export const CheapLfsBundledOrasWindowsAmd64ExecutableBytes = 12_280_832

const MaximumExecutableBytes = 256 * 1024 * 1024
const MaximumDockerConfigBytes = 1024 * 1024
const MaximumCredentialHelperOutputBytes = 64 * 1024
const MaximumCredentialBytes = 16 * 1024
const DefaultCredentialHelperTimeoutMs = 15_000
const DigestRegex = /^sha256:[0-9a-f]{64}$/
const GitHubLoginRegex = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const DockerHubNamespaceRegex = /^[a-z0-9](?:[a-z0-9_-]{0,253}[a-z0-9])?$/
const OciNameComponentRegex = /^[a-z0-9]+(?:(?:[._]|__|[-]*)[a-z0-9]+)*$/
const ImmutableDigestRegex = /^sha256:[0-9a-f]{64}$/
const AllowedDockerCredentialHelpers = new Set(['desktop', 'wincred'])

export class CheapLfsRegistryRuntimeError extends Error {
  public constructor(
    public readonly kind:
      | 'canceled'
      | 'invalid-input'
      | 'untrusted-executable'
      | 'invalid-config'
      | 'untrusted-helper'
      | 'credential-unavailable'
      | 'process-failed'
      | 'process-timeout'
      | 'output-overflow'
      | 'policy',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsRegistryRuntimeError'
  }
}

/**
 * GHCR can briefly return no package or no repository link immediately after
 * accepting a manifest. This marker is consumed only by the bounded
 * post-publish verifier; all user-facing failures remain generic.
 */
export class CheapLfsGhcrPolicyPendingError extends CheapLfsRegistryRuntimeError {
  public constructor() {
    super('policy', 'Cheap LFS GHCR package policy metadata is not ready yet.')
    this.name = 'CheapLfsGhcrPolicyPendingError'
  }
}

export interface ICheapLfsOrasManifestBinary {
  /** Lowercase `sha256:` digest of the pinned executable. */
  readonly sha256: string
  readonly sizeInBytes: number
  /** Actual PE architecture, which can differ from the app package target. */
  readonly executableArchitecture: CheapLfsOrasArchitecture
}

/**
 * Build-generated trust manifest. The executable path is deliberately fixed
 * by this module so manifest data cannot redirect execution.
 */
export interface ICheapLfsOrasManifest {
  readonly version: typeof CheapLfsOrasManifestVersion
  readonly binaries: Readonly<
    Partial<Record<CheapLfsOrasArchitecture, ICheapLfsOrasManifestBinary>>
  >
}

const CheapLfsBundledOrasWindowsBinary: ICheapLfsOrasManifestBinary = {
  sha256: CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
  sizeInBytes: CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
  executableArchitecture: 'x64',
}

/**
 * Checked-in runtime trust manifest. Windows arm64 intentionally uses the
 * audited x64 executable through Windows' x64 emulation layer; no unverified
 * architecture-specific payload is substituted during packaging.
 */
export const CheapLfsBundledOrasManifest: ICheapLfsOrasManifest = {
  version: CheapLfsOrasManifestVersion,
  binaries: {
    x64: CheapLfsBundledOrasWindowsBinary,
    arm64: CheapLfsBundledOrasWindowsBinary,
  },
}

export interface IResolveTrustedCheapLfsOrasExecutableOptions {
  readonly manifest: ICheapLfsOrasManifest
  /** Defaults to the built application's `static` directory. */
  readonly staticRoot?: string
  readonly platform?: NodeJS.Platform
  readonly architecture?: string
  readonly environment?: Readonly<NodeJS.ProcessEnv>
}

export interface IAvailableCheapLfsOrasExecutable {
  readonly available: true
  readonly path: string
  readonly sha256: string
  readonly source: 'packaged' | 'program-files' | 'winget'
  readonly architecture: CheapLfsOrasArchitecture
}

export interface IUnavailableCheapLfsOrasExecutable {
  readonly available: false
  readonly reason:
    | 'unsupported-platform'
    | 'unsupported-architecture'
    | 'invalid-manifest'
    | 'unavailable'
    | 'untrusted-candidate'
  /** Actionable and safe for UI display; never contains process output. */
  readonly message: string
}

export type CheapLfsOrasExecutableResolution =
  | IAvailableCheapLfsOrasExecutable
  | IUnavailableCheapLfsOrasExecutable

interface IExecutableCandidate {
  readonly path: string
  readonly source: IAvailableCheapLfsOrasExecutable['source']
  readonly allowedCanonicalRoots: ReadonlyArray<string>
  readonly mayBeRedirected: boolean
}

function sameFile(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function isInside(root: string, path: string): boolean {
  const child = relative(resolve(root), resolve(path))
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

async function isInsideAnyCanonicalRoot(
  roots: ReadonlyArray<string>,
  path: string
): Promise<boolean> {
  for (const root of roots) {
    const canonicalRoot = await realpath(root).catch(() => null)
    if (canonicalRoot !== null && isInside(canonicalRoot, path)) {
      return true
    }
  }
  return false
}

function absoluteEnvironmentDirectory(
  environment: Readonly<NodeJS.ProcessEnv>,
  key: string
): string | null {
  const value = environment[key]
  return value !== undefined && isAbsolute(value) ? resolve(value) : null
}

function deduplicateCandidates(
  candidates: ReadonlyArray<IExecutableCandidate>
): ReadonlyArray<IExecutableCandidate> {
  const seen = new Set<string>()
  const result: IExecutableCandidate[] = []
  for (const candidate of candidates) {
    const key = resolve(candidate.path).toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(candidate)
    }
  }
  return result
}

async function hashOpenFile(
  path: string,
  maximumBytes: number
): Promise<{
  readonly sha256: string
  readonly size: number
  readonly metadata: Awaited<ReturnType<typeof lstat>>
}> {
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size <= 0 || before.size > maximumBytes) {
      throw new CheapLfsRegistryRuntimeError(
        'untrusted-executable',
        'The executable candidate is not a bounded regular file.'
      )
    }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let position = 0
    while (position < before.size) {
      const read = await handle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, before.size - position),
        position
      )
      if (read.bytesRead <= 0) {
        throw new CheapLfsRegistryRuntimeError(
          'untrusted-executable',
          'The executable candidate changed while it was verified.'
        )
      }
      hash.update(buffer.subarray(0, read.bytesRead))
      position += read.bytesRead
    }
    const after = await handle.stat()
    if (
      position !== before.size ||
      after.size !== before.size ||
      !sameFile(before, after)
    ) {
      throw new CheapLfsRegistryRuntimeError(
        'untrusted-executable',
        'The executable candidate changed while it was verified.'
      )
    }
    return {
      sha256: `sha256:${hash.digest('hex')}`,
      size: position,
      metadata: after,
    }
  } finally {
    await handle.close()
  }
}

async function inspectExecutableCandidate(
  candidate: IExecutableCandidate,
  expectedSha256: string,
  expectedSizeInBytes: number
): Promise<{
  readonly source: IAvailableCheapLfsOrasExecutable['source']
  readonly path: string
} | null> {
  let requestedMetadata: Awaited<ReturnType<typeof lstat>>
  try {
    requestedMetadata = await lstat(candidate.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'A trusted ORAS location could not be inspected safely.'
    )
  }

  if (
    basename(candidate.path).toLowerCase() !== 'oras.exe' ||
    (!requestedMetadata.isFile() && !requestedMetadata.isSymbolicLink()) ||
    (requestedMetadata.isSymbolicLink() && !candidate.mayBeRedirected)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'An ORAS candidate at a trusted location was redirected or unsafe.'
    )
  }

  const canonical = await realpath(candidate.path)
  if (
    !(await isInsideAnyCanonicalRoot(
      candidate.allowedCanonicalRoots,
      canonical
    ))
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'An ORAS candidate escaped its trusted installation directory.'
    )
  }
  const canonicalMetadata = await lstat(canonical)
  if (!canonicalMetadata.isFile() || canonicalMetadata.isSymbolicLink()) {
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'An ORAS candidate did not resolve to a regular file.'
    )
  }
  if (
    !requestedMetadata.isSymbolicLink() &&
    !sameFile(requestedMetadata, canonicalMetadata)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'An ORAS candidate changed while its path was resolved.'
    )
  }
  const verified = await hashOpenFile(canonical, MaximumExecutableBytes)
  if (
    verified.sha256 !== expectedSha256 ||
    verified.size !== expectedSizeInBytes ||
    !sameFile(canonicalMetadata, verified.metadata)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'untrusted-executable',
      'An ORAS candidate does not match the application trust manifest.'
    )
  }
  return { source: candidate.source, path: canonical }
}

function getInstalledOrasCandidates(
  environment: Readonly<NodeJS.ProcessEnv>
): ReadonlyArray<IExecutableCandidate> {
  const programRoots = [
    absoluteEnvironmentDirectory(environment, 'ProgramFiles'),
    absoluteEnvironmentDirectory(environment, 'ProgramW6432'),
  ].filter((value): value is string => value !== null)
  const localAppData = absoluteEnvironmentDirectory(environment, 'LOCALAPPDATA')
  const candidates: IExecutableCandidate[] = []
  for (const root of programRoots) {
    candidates.push({
      path: join(root, 'ORAS', 'oras.exe'),
      source: 'program-files',
      allowedCanonicalRoots: [join(root, 'ORAS')],
      mayBeRedirected: false,
    })
  }
  if (localAppData !== null) {
    const wingetRoot = join(localAppData, 'Microsoft', 'WinGet')
    candidates.push({
      path: join(wingetRoot, 'Links', 'oras.exe'),
      source: 'winget',
      allowedCanonicalRoots: [
        join(wingetRoot, 'Links'),
        join(wingetRoot, 'Packages'),
      ],
      mayBeRedirected: true,
    })
  }
  return deduplicateCandidates(candidates)
}

/**
 * Resolve only a build-pinned ORAS binary. PATH and the current working
 * directory are never searched or consulted.
 */
export async function resolveTrustedCheapLfsOrasExecutable(
  options: IResolveTrustedCheapLfsOrasExecutableOptions
): Promise<CheapLfsOrasExecutableResolution> {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return {
      available: false,
      reason: 'unsupported-platform',
      message: 'Cheap LFS OCI storage currently requires the Windows app.',
    }
  }
  const architecture = options.architecture ?? process.arch
  if (architecture !== 'x64' && architecture !== 'arm64') {
    return {
      available: false,
      reason: 'unsupported-architecture',
      message:
        'Cheap LFS OCI storage requires a supported Windows x64 or arm64 build.',
    }
  }
  const manifestBinary = options.manifest.binaries[architecture]
  if (
    options.manifest.version !== CheapLfsOrasManifestVersion ||
    manifestBinary === undefined ||
    !DigestRegex.test(manifestBinary.sha256) ||
    !Number.isSafeInteger(manifestBinary.sizeInBytes) ||
    manifestBinary.sizeInBytes <= 0 ||
    manifestBinary.sizeInBytes > MaximumExecutableBytes ||
    (manifestBinary.executableArchitecture !== 'x64' &&
      manifestBinary.executableArchitecture !== 'arm64')
  ) {
    return {
      available: false,
      reason: 'invalid-manifest',
      message:
        'This app build does not contain a valid ORAS trust manifest. Reinstall or update Desktop Material.',
    }
  }

  if (options.staticRoot !== undefined && !isAbsolute(options.staticRoot)) {
    return {
      available: false,
      reason: 'invalid-manifest',
      message:
        'This app build supplied an unsafe ORAS resource path. Reinstall or update Desktop Material.',
    }
  }
  const staticRoot = resolve(options.staticRoot ?? join(__dirname, 'static'))
  const packagedDirectory = join(
    staticRoot,
    'cheap-lfs',
    'oras',
    `win32-${architecture}`
  )
  const packagedCandidate: IExecutableCandidate = {
    path: join(packagedDirectory, 'oras.exe'),
    source: 'packaged',
    allowedCanonicalRoots: [packagedDirectory],
    mayBeRedirected: false,
  }
  const environment = options.environment ?? process.env
  const candidates = [
    packagedCandidate,
    ...getInstalledOrasCandidates(environment),
  ]

  for (const candidate of candidates) {
    try {
      const candidateResult = await inspectExecutableCandidate(
        candidate,
        manifestBinary.sha256,
        manifestBinary.sizeInBytes
      )
      if (candidateResult !== null) {
        return {
          available: true,
          path: candidateResult.path,
          sha256: manifestBinary.sha256,
          source: candidateResult.source,
          architecture,
        }
      }
    } catch (error) {
      if (error instanceof CheapLfsRegistryRuntimeError) {
        return {
          available: false,
          reason: 'untrusted-candidate',
          message:
            'An ORAS binary was found but failed integrity checks. Reinstall Desktop Material or the pinned ORAS package.',
        }
      }
      throw error
    }
  }
  return {
    available: false,
    reason: 'unavailable',
    message:
      'ORAS is not bundled in this app build and no digest-matching trusted installation was found. Update or reinstall Desktop Material.',
  }
}

export interface ICheapLfsRegistryCredentials {
  readonly username: string
  /** Caller must clear this buffer after the transfer completes. */
  readonly token: Uint8Array
}

export interface ICheapLfsGitHubAccountCredentialSource {
  readonly login: string
  readonly token: string
}

function requirePrintableCredential(value: string): Buffer {
  const credential = Buffer.from(value, 'utf8')
  if (
    credential.byteLength === 0 ||
    credential.byteLength > MaximumCredentialBytes ||
    [...credential].some(byte => byte < 0x21 || byte > 0x7e)
  ) {
    credential.fill(0)
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'The registry credential must be bounded printable single-line text.'
    )
  }
  return credential
}

/** Copy credentials from an already-authenticated GitHub Account. */
export function resolveCheapLfsGhcrCredentialsFromAccount(
  account: ICheapLfsGitHubAccountCredentialSource
): ICheapLfsRegistryCredentials {
  if (!GitHubLoginRegex.test(account.login)) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'The signed-in GitHub account has an invalid login for GHCR.'
    )
  }
  return {
    username: account.login,
    token: requirePrintableCredential(account.token),
  }
}

export function clearCheapLfsRegistryCredentials(
  credentials: ICheapLfsRegistryCredentials
): void {
  credentials.token.fill(0)
}

export interface IDockerCredentialHelperRequest {
  readonly executable: string
  readonly args: readonly ['get']
  readonly stdin: Buffer
  readonly timeoutMs: number
}

export interface IDockerCredentialHelperResult {
  readonly exitCode: number
  readonly stdout: Buffer
}

export interface IDockerCredentialHelperRunner {
  run(
    request: IDockerCredentialHelperRequest
  ): Promise<IDockerCredentialHelperResult>
}

function boundedTimeout(value: number | undefined): number {
  const timeout = value ?? DefaultCredentialHelperTimeoutMs
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'The Docker credential helper timeout is invalid.'
    )
  }
  return timeout
}

function safeCredentialHelperEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const key of [
    'SystemRoot',
    'WINDIR',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
  ]) {
    const value = process.env[key]
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

export class SpawnDockerCredentialHelperRunner
  implements IDockerCredentialHelperRunner
{
  public async run(
    request: IDockerCredentialHelperRequest
  ): Promise<IDockerCredentialHelperResult> {
    if (
      !isAbsolute(request.executable) ||
      request.args.length !== 1 ||
      request.args[0] !== 'get' ||
      request.stdin.byteLength > 1024
    ) {
      throw new CheapLfsRegistryRuntimeError(
        'invalid-input',
        'The Docker credential helper request is invalid.'
      )
    }
    return new Promise<IDockerCredentialHelperResult>(
      (resolvePromise, reject) => {
        let child: ChildProcessWithoutNullStreams
        try {
          child = spawn(request.executable, ['get'], {
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: safeCredentialHelperEnvironment(),
          })
        } catch {
          reject(
            new CheapLfsRegistryRuntimeError(
              'process-failed',
              'The trusted Docker credential helper could not be started.'
            )
          )
          return
        }
        const stdout: Buffer[] = []
        let stdoutBytes = 0
        let outputBytes = 0
        let completed = false
        const clearOwnedStdout = () => {
          for (const chunk of stdout) {
            chunk.fill(0)
          }
          stdout.length = 0
          stdoutBytes = 0
        }
        const finish = (
          error?: CheapLfsRegistryRuntimeError,
          exitCode?: number
        ) => {
          if (completed) {
            return
          }
          completed = true
          clearTimeout(timer)
          child.stdout.removeAllListeners()
          child.stderr.removeAllListeners()
          child.removeAllListeners()
          if (error !== undefined) {
            clearOwnedStdout()
            reject(error)
          } else {
            const combined = Buffer.concat(stdout, stdoutBytes)
            clearOwnedStdout()
            resolvePromise({
              exitCode: exitCode ?? -1,
              stdout: combined,
            })
          }
        }
        const countOutput = (value: Buffer | string, keep: boolean) => {
          const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
          outputBytes += bytes.byteLength
          if (outputBytes > MaximumCredentialHelperOutputBytes) {
            child.kill()
            finish(
              new CheapLfsRegistryRuntimeError(
                'output-overflow',
                'The Docker credential helper exceeded its output limit.'
              )
            )
          } else if (keep) {
            stdout.push(Buffer.from(bytes))
            stdoutBytes += bytes.byteLength
          }
        }
        child.stdout.on('data', value => countOutput(value, true))
        // stderr is bounded but never retained or reflected into an error.
        child.stderr.on('data', value => countOutput(value, false))
        child.once('error', () =>
          finish(
            new CheapLfsRegistryRuntimeError(
              'process-failed',
              'The trusted Docker credential helper failed.'
            )
          )
        )
        child.once('close', code => finish(undefined, code ?? -1))
        const timer = setTimeout(() => {
          child.kill()
          finish(
            new CheapLfsRegistryRuntimeError(
              'process-timeout',
              'The Docker credential helper timed out.'
            )
          )
        }, request.timeoutMs)
        child.stdin.once('error', () => undefined)
        child.stdin.end(request.stdin)
      }
    )
  }
}

export interface IResolveCheapLfsDockerHubCredentialsOptions {
  /** Explicitly injectable for tests; defaults to `%USERPROFILE%\\.docker`. */
  readonly configDirectory?: string
  readonly environment?: Readonly<NodeJS.ProcessEnv>
  readonly runner?: IDockerCredentialHelperRunner
  readonly timeoutMs?: number
}

type JsonObject = { readonly [key: string]: unknown }

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownString(value: JsonObject, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return null
  }
  const candidate = value[key]
  return typeof candidate === 'string' ? candidate : null
}

async function readBoundedRegularFile(
  path: string,
  maximumBytes: number,
  kind: 'invalid-config' | 'untrusted-helper'
): Promise<Buffer> {
  const requested = await lstat(path).catch(() => null)
  if (
    requested === null ||
    requested.isSymbolicLink() ||
    !requested.isFile() ||
    requested.size <= 0 ||
    requested.size > maximumBytes
  ) {
    throw new CheapLfsRegistryRuntimeError(
      kind,
      kind === 'invalid-config'
        ? 'Docker credential configuration is missing or unsafe.'
        : 'The configured Docker credential helper is missing or unsafe.'
    )
  }
  const canonical = await realpath(path)
  const canonicalMetadata = await lstat(canonical)
  if (!sameFile(requested, canonicalMetadata)) {
    throw new CheapLfsRegistryRuntimeError(
      kind,
      'A trusted credential path was redirected.'
    )
  }
  const handle = await open(canonical, 'r')
  try {
    const before = await handle.stat()
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      bytes.byteLength !== before.size ||
      bytes.byteLength > maximumBytes ||
      !sameFile(before, after) ||
      after.size !== before.size
    ) {
      bytes.fill(0)
      throw new CheapLfsRegistryRuntimeError(
        kind,
        'A trusted credential file changed while it was read.'
      )
    }
    return bytes
  } finally {
    await handle.close()
  }
}

async function requireTrustedDirectory(
  path: string,
  kind: 'invalid-config' | 'untrusted-helper'
): Promise<string> {
  const requested = await lstat(path).catch(() => null)
  if (
    requested === null ||
    requested.isSymbolicLink() ||
    !requested.isDirectory()
  ) {
    throw new CheapLfsRegistryRuntimeError(
      kind,
      'A trusted credential directory is missing or redirected.'
    )
  }
  const canonical = await realpath(path)
  const canonicalMetadata = await lstat(canonical)
  if (
    !canonicalMetadata.isDirectory() ||
    !sameFile(requested, canonicalMetadata)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      kind,
      'A trusted credential directory changed while it was resolved.'
    )
  }
  return canonical
}

function selectDockerCredentialHelper(config: JsonObject): string {
  const candidates: string[] = []
  const helpers = config.credHelpers
  if (isObject(helpers)) {
    for (const server of [
      CheapLfsDockerHubCredentialServer,
      'docker.io',
      'registry-1.docker.io',
    ]) {
      const helper = ownString(helpers, server)
      if (helper !== null) {
        candidates.push(helper)
      }
    }
  }
  const unique = [...new Set(candidates)]
  if (unique.length > 1) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-config',
      'Docker Hub has conflicting credential helper configuration.'
    )
  }
  const selected = unique[0] ?? ownString(config, 'credsStore')
  if (selected === null || !AllowedDockerCredentialHelpers.has(selected)) {
    throw new CheapLfsRegistryRuntimeError(
      'credential-unavailable',
      'Sign in to Docker Desktop so its trusted credential store can supply Docker Hub credentials.'
    )
  }
  return selected
}

async function resolveTrustedDockerCredentialHelper(
  helper: string,
  environment: Readonly<NodeJS.ProcessEnv>
): Promise<string> {
  const roots = [
    absoluteEnvironmentDirectory(environment, 'ProgramFiles'),
    absoluteEnvironmentDirectory(environment, 'ProgramW6432'),
  ].filter((value): value is string => value !== null)
  for (const root of [...new Set(roots)]) {
    const directory = join(root, 'Docker', 'Docker', 'resources', 'bin')
    const path = join(directory, `docker-credential-${helper}.exe`)
    const metadata = await lstat(path).catch(() => null)
    if (metadata === null) {
      continue
    }
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size <= 0 ||
      metadata.size > MaximumExecutableBytes
    ) {
      throw new CheapLfsRegistryRuntimeError(
        'untrusted-helper',
        'The Docker credential helper at its trusted location is unsafe.'
      )
    }
    const canonical = await realpath(path)
    const canonicalMetadata = await lstat(canonical)
    const canonicalDirectory = await requireTrustedDirectory(
      directory,
      'untrusted-helper'
    )
    if (
      !isInside(canonicalDirectory, canonical) ||
      !sameFile(metadata, canonicalMetadata)
    ) {
      throw new CheapLfsRegistryRuntimeError(
        'untrusted-helper',
        'The Docker credential helper escaped its trusted installation directory.'
      )
    }
    return canonical
  }
  throw new CheapLfsRegistryRuntimeError(
    'credential-unavailable',
    'Docker Desktop and its trusted credential helper were not found in Program Files.'
  )
}

function isDockerHubCredentialServer(value: string): boolean {
  return new Set([
    CheapLfsDockerHubCredentialServer,
    'docker.io',
    'registry-1.docker.io',
  ]).has(value)
}

/**
 * Resolve Docker Hub credentials through Docker's helper protocol. Inline
 * `auths` values are intentionally ignored; no credential is read from PATH,
 * argv, process output, or persistent application state.
 */
export async function resolveCheapLfsDockerHubCredentials(
  options: IResolveCheapLfsDockerHubCredentialsOptions = {}
): Promise<ICheapLfsRegistryCredentials> {
  const environment = options.environment ?? process.env
  const userProfile = absoluteEnvironmentDirectory(environment, 'USERPROFILE')
  const configDirectory =
    options.configDirectory ??
    (userProfile === null ? null : join(userProfile, '.docker'))
  if (configDirectory === null || !isAbsolute(configDirectory)) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-config',
      'Docker credential configuration requires an absolute trusted user profile path.'
    )
  }
  const canonicalConfigDirectory = resolve(configDirectory)
  if (
    options.configDirectory !== undefined &&
    userProfile !== null &&
    canonicalConfigDirectory.toLowerCase() !==
      resolve(userProfile, '.docker').toLowerCase()
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-config',
      'Docker credential configuration must be the signed-in user profile configuration.'
    )
  }
  const trustedConfigDirectory = await requireTrustedDirectory(
    canonicalConfigDirectory,
    'invalid-config'
  )
  const configBytes = await readBoundedRegularFile(
    join(trustedConfigDirectory, 'config.json'),
    MaximumDockerConfigBytes,
    'invalid-config'
  )
  let config: unknown
  try {
    config = JSON.parse(configBytes.toString('utf8'))
  } catch {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-config',
      'Docker credential configuration is invalid JSON.'
    )
  } finally {
    configBytes.fill(0)
  }
  if (!isObject(config)) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-config',
      'Docker credential configuration must be an object.'
    )
  }
  const helperName = selectDockerCredentialHelper(config)
  const executable = await resolveTrustedDockerCredentialHelper(
    helperName,
    environment
  )
  const runner = options.runner ?? new SpawnDockerCredentialHelperRunner()
  const stdin = Buffer.from(`${CheapLfsDockerHubCredentialServer}\n`, 'utf8')
  const result = await runner.run({
    executable,
    args: ['get'],
    stdin,
    timeoutMs: boundedTimeout(options.timeoutMs),
  })
  if (
    result.exitCode !== 0 ||
    result.stdout.byteLength === 0 ||
    result.stdout.byteLength > MaximumCredentialHelperOutputBytes
  ) {
    result.stdout.fill(0)
    throw new CheapLfsRegistryRuntimeError(
      result.stdout.byteLength > MaximumCredentialHelperOutputBytes
        ? 'output-overflow'
        : 'credential-unavailable',
      'Docker Desktop did not return bounded Docker Hub credentials.'
    )
  }
  let response: unknown
  try {
    response = JSON.parse(result.stdout.toString('utf8'))
  } catch {
    throw new CheapLfsRegistryRuntimeError(
      'credential-unavailable',
      'Docker Desktop returned an invalid credential response.'
    )
  } finally {
    result.stdout.fill(0)
  }
  if (!isObject(response)) {
    throw new CheapLfsRegistryRuntimeError(
      'credential-unavailable',
      'Docker Desktop returned an invalid credential response.'
    )
  }
  const server = ownString(response, 'ServerURL')
  const username = ownString(response, 'Username')
  const secret = ownString(response, 'Secret')
  if (
    server === null ||
    !isDockerHubCredentialServer(server) ||
    username === null ||
    !DockerHubNamespaceRegex.test(username) ||
    secret === null
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'credential-unavailable',
      'Docker Desktop returned credentials for an unexpected registry or account.'
    )
  }
  return { username, token: requirePrintableCredential(secret) }
}

export interface ICheapLfsGitHubRepositoryIdentityInput {
  readonly repositoryId: number | string
  readonly owner: string
  readonly name: string
}

export interface IDeriveCheapLfsRegistryTargetOptions
  extends ICheapLfsGitHubRepositoryIdentityInput {
  readonly provider: CheapLfsRegistryProvider
  readonly dockerHubNamespace?: string
}

export interface ICheapLfsRegistryTarget {
  readonly provider: CheapLfsRegistryProvider
  readonly repositoryIdentity: string
  readonly registryRepository: string
  readonly sourceRepositoryUrl: string
  readonly sourceOwner: string
  readonly sourceName: string
}

function canonicalRepositoryId(value: number | string): string {
  const text = typeof value === 'number' ? String(value) : value
  if (
    !/^[1-9][0-9]*$/.test(text) ||
    (typeof value === 'number' && !Number.isSafeInteger(value))
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'Cheap LFS requires an authoritative positive GitHub repository id.'
    )
  }
  return text
}

function canonicalGitHubOwner(value: string): string {
  if (!GitHubLoginRegex.test(value)) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'Cheap LFS requires a canonical GitHub owner.'
    )
  }
  return value.toLowerCase()
}

function canonicalRepositoryName(value: string): string {
  const canonical = value.toLowerCase()
  if (
    value.length === 0 ||
    value.length > 100 ||
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    !OciNameComponentRegex.test(canonical)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'The GitHub repository name cannot form a canonical lowercase OCI repository.'
    )
  }
  return canonical
}

export function getCheapLfsGitHubRepositoryIdentity(
  repositoryId: number | string
): string {
  return `github.com/repositories/${canonicalRepositoryId(repositoryId)}`
}

/** Derive the sole canonical OCI repository used by a source repository. */
export function deriveCheapLfsRegistryTarget(
  options: IDeriveCheapLfsRegistryTargetOptions
): ICheapLfsRegistryTarget {
  const sourceOwner = canonicalGitHubOwner(options.owner)
  const sourceName = canonicalRepositoryName(options.name)
  const repositoryIdentity = getCheapLfsGitHubRepositoryIdentity(
    options.repositoryId
  )
  const namespace =
    options.provider === 'ghcr'
      ? sourceOwner
      : options.dockerHubNamespace ?? sourceOwner
  if (
    options.provider === 'docker-hub' &&
    !DockerHubNamespaceRegex.test(namespace)
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'Docker Hub requires a canonical lowercase namespace.'
    )
  }
  const registryHost = options.provider === 'ghcr' ? 'ghcr.io' : 'docker.io'
  return {
    provider: options.provider,
    repositoryIdentity,
    registryRepository: `${registryHost}/${namespace}/${sourceName}-cheap-lfs`,
    sourceRepositoryUrl: `https://github.com/${sourceOwner}/${sourceName}`,
    sourceOwner,
    sourceName,
  }
}

export type CheapLfsRegistryVisibility = 'public' | 'private'

export interface ICheapLfsSourceRepositoryPolicy {
  readonly repositoryIdentity: string
  readonly repositoryUrl: string
  readonly owner: string
  readonly name: string
  readonly visibility: CheapLfsRegistryVisibility
  readonly access: 'none' | 'read' | 'write' | 'admin'
}

export interface ICheapLfsSourceRepositoryPolicyApi {
  /** Uses the API client's own authentication; no token is passed here. */
  inspectSourceRepository(
    source: ICheapLfsGitHubRepositoryIdentityInput
  ): Promise<ICheapLfsSourceRepositoryPolicy>
}

export interface ICheapLfsRegistryRepositoryPolicy {
  readonly visibility: CheapLfsRegistryVisibility
  readonly hasPushAccess: boolean
  /** Required and exact for GHCR; Docker Hub has no such link. */
  readonly linkedRepositoryIdentity: string | null
  readonly linkedRepositoryUrl?: string | null
}

export interface ICheapLfsRegistryRepositoryPolicyApi {
  /** Uses the API client's own authentication; no token is passed here. */
  inspectRegistryRepository(
    target: {
      readonly provider: CheapLfsRegistryProvider
      readonly registryRepository: string
    },
    signal?: AbortSignal
  ): Promise<ICheapLfsRegistryRepositoryPolicy>
}

export interface ICheapLfsRegistryPolicyRequest {
  readonly provider: CheapLfsRegistryProvider
  readonly repositoryIdentity: string
  readonly registryRepository: string
  readonly sourceRepositoryUrl: string
  readonly immutableReference: string
  readonly visibility: CheapLfsRegistryVisibility
  readonly signal?: AbortSignal
}

export interface ICheapLfsRegistryPolicyResult {
  readonly provider: CheapLfsRegistryProvider
  readonly repositoryIdentity: string
  readonly registryRepository: string
  readonly sourceRepositoryUrl: string
  readonly visibility: CheapLfsRegistryVisibility
  readonly sourceRepositoryAccessVerified: boolean
  readonly registryVisibilityVerified: boolean
}

export interface ICheapLfsRegistryPolicyVerifier {
  verify(
    request: ICheapLfsRegistryPolicyRequest
  ): Promise<ICheapLfsRegistryPolicyResult>
}

export interface ICreateCheapLfsRegistryPolicyVerifierOptions {
  readonly source: ICheapLfsGitHubRepositoryIdentityInput
  readonly target: ICheapLfsRegistryTarget
  readonly sourceApi: ICheapLfsSourceRepositoryPolicyApi
  readonly registryApi: ICheapLfsRegistryRepositoryPolicyApi
  /** Test seam for the fixed, bounded GHCR metadata poll. */
  readonly waitForGhcrPolicyRetry?: (
    delayMs: number,
    signal?: AbortSignal
  ) => Promise<void>
}

export const CheapLfsGhcrPolicyVerificationMaximumAttempts = 12
export const CheapLfsGhcrPolicyVerificationRetryDelayMs = 1_000

function policyFailure(): CheapLfsRegistryRuntimeError {
  return new CheapLfsRegistryRuntimeError(
    'policy',
    'Cheap LFS could not verify source repository access and registry visibility.'
  )
}

function cancellationFailure(): CheapLfsRegistryRuntimeError {
  return new CheapLfsRegistryRuntimeError(
    'canceled',
    'Cheap LFS registry policy verification was canceled.'
  )
}

function abortPolicyVerificationIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw cancellationFailure()
  }
}

async function waitForGhcrPolicyRetry(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  abortPolicyVerificationIfNeeded(signal)
  await new Promise<void>((resolveWait, rejectWait) => {
    const state: { timer?: ReturnType<typeof setTimeout> } = {}
    const abort = () => {
      if (state.timer !== undefined) {
        clearTimeout(state.timer)
      }
      rejectWait(cancellationFailure())
    }
    signal?.addEventListener('abort', abort, { once: true })
    state.timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolveWait()
    }, delayMs)
  })
}

/**
 * Build a transport-compatible policy verifier around caller-authenticated API
 * clients. Secrets never enter requests, results, or thrown messages.
 */
export function createCheapLfsRegistryPolicyVerifier(
  options: ICreateCheapLfsRegistryPolicyVerifierOptions
): ICheapLfsRegistryPolicyVerifier {
  const waitForRetry = options.waitForGhcrPolicyRetry ?? waitForGhcrPolicyRetry
  const expectedTarget = deriveCheapLfsRegistryTarget({
    ...options.source,
    provider: options.target.provider,
    dockerHubNamespace:
      options.target.provider === 'docker-hub'
        ? options.target.registryRepository.split('/')[1]
        : undefined,
  })
  if (
    expectedTarget.repositoryIdentity !== options.target.repositoryIdentity ||
    expectedTarget.registryRepository !== options.target.registryRepository ||
    expectedTarget.sourceRepositoryUrl !== options.target.sourceRepositoryUrl
  ) {
    throw new CheapLfsRegistryRuntimeError(
      'invalid-input',
      'The Cheap LFS registry target does not match its source repository.'
    )
  }

  return {
    async verify(request) {
      const immutablePrefix = `${options.target.registryRepository}@`
      const digest = request.immutableReference.slice(immutablePrefix.length)
      if (
        request.provider !== options.target.provider ||
        request.repositoryIdentity !== options.target.repositoryIdentity ||
        request.registryRepository !== options.target.registryRepository ||
        request.sourceRepositoryUrl !== options.target.sourceRepositoryUrl ||
        !request.immutableReference.startsWith(immutablePrefix) ||
        !ImmutableDigestRegex.test(digest)
      ) {
        throw policyFailure()
      }
      try {
        abortPolicyVerificationIfNeeded(request.signal)
        const source = await options.sourceApi.inspectSourceRepository(
          options.source
        )
        abortPolicyVerificationIfNeeded(request.signal)
        if (
          source.repositoryIdentity !== options.target.repositoryIdentity ||
          source.repositoryUrl !== options.target.sourceRepositoryUrl ||
          source.owner.toLowerCase() !== options.target.sourceOwner ||
          source.name.toLowerCase() !== options.target.sourceName ||
          source.visibility !== request.visibility ||
          (source.access !== 'write' && source.access !== 'admin')
        ) {
          throw policyFailure()
        }
        for (
          let attempt = 1;
          attempt <= CheapLfsGhcrPolicyVerificationMaximumAttempts;
          attempt++
        ) {
          abortPolicyVerificationIfNeeded(request.signal)
          try {
            const registry =
              await options.registryApi.inspectRegistryRepository(
                {
                  provider: options.target.provider,
                  registryRepository: options.target.registryRepository,
                },
                request.signal
              )
            if (
              registry.visibility !== request.visibility ||
              !registry.hasPushAccess ||
              (options.target.provider === 'ghcr' &&
                registry.linkedRepositoryIdentity !==
                  options.target.repositoryIdentity) ||
              (registry.linkedRepositoryUrl !== undefined &&
                registry.linkedRepositoryUrl !== null &&
                registry.linkedRepositoryUrl !==
                  options.target.sourceRepositoryUrl)
            ) {
              throw policyFailure()
            }
            break
          } catch (error) {
            if (
              options.target.provider !== 'ghcr' ||
              !(error instanceof CheapLfsGhcrPolicyPendingError) ||
              attempt === CheapLfsGhcrPolicyVerificationMaximumAttempts
            ) {
              throw error
            }
            await waitForRetry(
              CheapLfsGhcrPolicyVerificationRetryDelayMs,
              request.signal
            )
            abortPolicyVerificationIfNeeded(request.signal)
          }
        }
      } catch (error) {
        if (
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'canceled'
        ) {
          throw error
        }
        throw policyFailure()
      }
      return {
        provider: request.provider,
        repositoryIdentity: request.repositoryIdentity,
        registryRepository: request.registryRepository,
        sourceRepositoryUrl: request.sourceRepositoryUrl,
        visibility: request.visibility,
        sourceRepositoryAccessVerified: true,
        registryVisibilityVerified: true,
      }
    },
  }
}
