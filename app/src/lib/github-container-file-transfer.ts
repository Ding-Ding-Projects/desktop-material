import { createHash, randomUUID } from 'crypto'
import {
  ChildProcessWithoutNullStreams,
  SpawnOptions,
  spawn,
} from 'child_process'
import { constants } from 'fs'
import type { BigIntStats } from 'fs'
import {
  FileHandle,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { guardStreamAgainstPeerClose } from './peer-closed-stream-error'
import { killTreeAndWait } from '../main-process/build-run/kill-tree'
import {
  CheapLfsBundledOrasManifest,
  CheapLfsOrasExecutableResolution,
  CheapLfsRegistryRuntimeError,
  ICheapLfsGitHubAccountCredentialSource,
  IResolveTrustedCheapLfsOrasExecutableOptions,
  clearCheapLfsRegistryCredentials,
  resolveCheapLfsGhcrCredentialsFromAccount,
  resolveTrustedCheapLfsOrasExecutable,
} from './cheap-lfs/oci-registry-runtime'

export const GitHubContainerFileArtifactType =
  'application/vnd.desktop-material.file.v1'
export const GitHubContainerFileLayerMediaType =
  'application/vnd.desktop-material.file.layer.v1'
export const GitHubContainerFileManifestMediaType =
  'application/vnd.oci.image.manifest.v1+json'
export const GitHubContainerFileEmptyConfigMediaType =
  'application/vnd.oci.empty.v1+json'
export const GitHubContainerFileSourceAnnotation =
  'org.opencontainers.image.source'
export const GitHubContainerFileTitleAnnotation =
  'org.opencontainers.image.title'
export const GitHubContainerFileFormatAnnotation =
  'io.github.ding-ding-projects.desktop-material.file.version'
export const GitHubContainerFileFormatVersion = '1'
export const GitHubContainerFileMaximumBytes = 1_610_612_736

const EmptyJsonDigest =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
const DigestRegex = /^sha256:[0-9a-f]{64}$/
const RegistryRepositoryRegex =
  /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const GitHubOwnerRegex = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GitHubRepositoryRegex = /^[A-Za-z0-9._-]{1,100}$/
const ReservedWindowsNameRegex =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[ .]|$)/i
const UnsafeWindowsTitleRegex = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/u
const UnicodeDirectionControlRegex = /[\u202a-\u202e\u2066-\u2069]/u
const MaximumTitleBytes = 240
const MaximumManifestBytes = 1024 * 1024
const MaximumExecutableBytes = 256 * 1024 * 1024
const MaximumProcessOutputBytes = 64 * 1024
const DefaultProcessTimeoutMs = 9 * 60 * 1000
const CopyBufferBytes = 1024 * 1024
const NoFollowFlag = constants.O_NOFOLLOW ?? 0

export type GitHubContainerFileTransferErrorKind =
  | 'canceled'
  | 'invalid-input'
  | 'untrusted-executable'
  | 'source-changed'
  | 'process-failed'
  | 'process-timeout'
  | 'output-overflow'
  | 'invalid-response'
  | 'integrity'
  | 'destination-exists'
  | 'destination-failed'
  | 'cleanup'

export class GitHubContainerFileTransferError extends Error {
  public constructor(
    public readonly kind: GitHubContainerFileTransferErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'GitHubContainerFileTransferError'
  }
}

export interface IGitHubContainerFileOrasRequest {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  /** The copied GitHub token plus one newline. Cleared after `run` settles. */
  readonly stdin: Buffer
  readonly cwd: string
  readonly environment: Readonly<NodeJS.ProcessEnv>
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface IGitHubContainerFileOrasResult {
  /** Bounded stdout only. Stderr is deliberately never returned or logged. */
  readonly stdout: Buffer
}

export interface IGitHubContainerFileOrasRunner {
  run(
    request: IGitHubContainerFileOrasRequest
  ): Promise<IGitHubContainerFileOrasResult>
}

export type GitHubContainerFileOrasSpawn = (
  executable: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions
) => ChildProcessWithoutNullStreams

export interface IDefaultGitHubContainerFileOrasRunnerDependencies {
  readonly spawn?: GitHubContainerFileOrasSpawn
  readonly killTree?: (
    pid: number,
    isStillOwned: () => boolean
  ) => Promise<boolean>
}

export interface IGitHubContainerFileManifestExpectation {
  readonly manifestDigest: string
  readonly sourceRepositoryUrl: string
  readonly title?: string
  readonly layerDigest?: string
  readonly sizeInBytes?: number
}

export interface IGitHubContainerFileManifest {
  readonly manifestDigest: string
  readonly sourceRepositoryUrl: string
  readonly title: string
  readonly layerDigest: string
  readonly sizeInBytes: number
}

interface IGitHubContainerFileTransferBaseOptions {
  readonly account: ICheapLfsGitHubAccountCredentialSource
  /** Exact lowercase `ghcr.io/owner/package` destination. */
  readonly registryRepository: string
  /** Exact canonical `https://github.com/owner/repository` provenance. */
  readonly sourceRepositoryUrl: string
  readonly signal?: AbortSignal
  readonly processTimeoutMs?: number
  readonly oras?: Omit<IResolveTrustedCheapLfsOrasExecutableOptions, 'manifest'>
}

export interface IUploadGitHubContainerFileOptions
  extends IGitHubContainerFileTransferBaseOptions {
  readonly sourcePath: string
}

export interface IGitHubContainerFileUploadResult
  extends IGitHubContainerFileManifest {
  /** Unique, app-owned tag. Desktop Material never moves or reuses this tag. */
  readonly tag: string
  readonly taggedReference: string
  /** Content-addressed reference to persist and use for every download. */
  readonly immutableReference: string
}

export interface IDownloadGitHubContainerFileOptions
  extends IGitHubContainerFileTransferBaseOptions {
  /** An exact lowercase `sha256:` manifest digest, never a tag. */
  readonly manifestDigest: string
  /** Absolute caller-reviewed path which must not exist. */
  readonly destinationPath: string
}

export interface IGitHubContainerFileDownloadResult
  extends IGitHubContainerFileManifest {
  readonly immutableReference: string
  readonly destinationPath: string
}

export interface IGitHubContainerFileTransferDependencies {
  readonly resolveOras: typeof resolveTrustedCheapLfsOrasExecutable
  readonly runner: IGitHubContainerFileOrasRunner
  readonly createUniqueId: () => string
}

interface IFileDescriptor {
  readonly digest: string
  readonly sizeInBytes: number
}

interface ITransferWorkspace {
  readonly root: string
  readonly registryConfigPath: string
  readonly cachePath: string
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new GitHubContainerFileTransferError(
      'canceled',
      'The GitHub package transfer was canceled.'
    )
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.birthtimeNs === right.birthtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.nlink === right.nlink
  )
}

function requireTimeout(value: number | undefined): number {
  const timeout = value ?? DefaultProcessTimeoutMs
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout >= 600_000) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Choose an ORAS timeout from one second to less than ten minutes.'
    )
  }
  return timeout
}

function requireRegistryRepository(value: string): string {
  if (!RegistryRepositoryRegex.test(value)) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Choose a canonical lowercase GHCR package path such as ghcr.io/owner/package.'
    )
  }
  return value
}

/** Validate and return the one accepted source-repository URL spelling. */
export function requireGitHubContainerFileSourceRepositoryUrl(
  value: string
): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'The package source must be a canonical GitHub repository URL.'
    )
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    segments.length !== 2 ||
    !GitHubOwnerRegex.test(segments[0]) ||
    !GitHubRepositoryRegex.test(segments[1]) ||
    segments[1].toLowerCase().endsWith('.git') ||
    segments[1] === '.' ||
    segments[1] === '..' ||
    value !== `https://github.com/${segments[0]}/${segments[1]}`
  ) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'The package source must exactly match https://github.com/owner/repository.'
    )
  }
  return value
}

/** Refuse path separators, device names, bidi controls, and ambiguous names. */
export function requireSafeGitHubContainerFileTitle(value: string): string {
  if (
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value !== value.normalize('NFC') ||
    value.trim() !== value ||
    value.endsWith('.') ||
    UnsafeWindowsTitleRegex.test(value) ||
    UnicodeDirectionControlRegex.test(value) ||
    ReservedWindowsNameRegex.test(value) ||
    Buffer.byteLength(value, 'utf8') > MaximumTitleBytes
  ) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Rename the file to a safe single Windows filename before uploading it.'
    )
  }
  return value
}

function requireDigest(value: string, label: string): string {
  if (!DigestRegex.test(value)) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      `${label} must be an exact lowercase sha256 digest.`
    )
  }
  return value
}

function requireSize(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > GitHubContainerFileMaximumBytes
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package contains an invalid or oversized file layer.'
    )
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new GitHubContainerFileTransferError('integrity', message)
  }
  return value
}

/** Parse an already digest-verified manifest using the app-owned file policy. */
export function inspectGitHubContainerFileManifest(
  manifestBytes: Buffer,
  expectation: IGitHubContainerFileManifestExpectation
): IGitHubContainerFileManifest {
  const expectedManifestDigest = requireDigest(
    expectation.manifestDigest,
    'The package version'
  )
  const sourceRepositoryUrl = requireGitHubContainerFileSourceRepositoryUrl(
    expectation.sourceRepositoryUrl
  )
  if (
    manifestBytes.byteLength === 0 ||
    manifestBytes.byteLength > MaximumManifestBytes
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'GHCR returned an empty or oversized package manifest.'
    )
  }
  const actualManifestDigest = `sha256:${createHash('sha256')
    .update(manifestBytes)
    .digest('hex')}`
  if (actualManifestDigest !== expectedManifestDigest) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'GHCR returned manifest bytes that do not match the selected immutable version.'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'GHCR returned malformed package manifest JSON.'
    )
  }
  const manifest = requireRecord(
    parsed,
    'GHCR returned an invalid package manifest.'
  )
  const config = requireRecord(
    manifest.config,
    'The package manifest has no valid empty config descriptor.'
  )
  const annotations = requireRecord(
    manifest.annotations,
    'The package manifest has no valid provenance annotations.'
  )
  if (
    manifest.schemaVersion !== 2 ||
    manifest.mediaType !== GitHubContainerFileManifestMediaType ||
    manifest.artifactType !== GitHubContainerFileArtifactType ||
    manifest.subject !== undefined ||
    config.mediaType !== GitHubContainerFileEmptyConfigMediaType ||
    config.digest !== EmptyJsonDigest ||
    config.size !== 2 ||
    annotations[GitHubContainerFileSourceAnnotation] !== sourceRepositoryUrl ||
    annotations[GitHubContainerFileFormatAnnotation] !==
      GitHubContainerFileFormatVersion ||
    !Array.isArray(manifest.layers) ||
    manifest.layers.length !== 1
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'This version is not an exact Desktop Material single-file package for this repository.'
    )
  }

  const layer = requireRecord(
    manifest.layers[0],
    'The package manifest has no valid file layer.'
  )
  const layerAnnotations = requireRecord(
    layer.annotations,
    'The package file layer has no safe title.'
  )
  if (layer.mediaType !== GitHubContainerFileLayerMediaType) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package file layer uses an unsupported media type.'
    )
  }
  const titleValue = layerAnnotations[GitHubContainerFileTitleAnnotation]
  if (typeof titleValue !== 'string') {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package file layer has no safe title.'
    )
  }
  let title: string
  try {
    title = requireSafeGitHubContainerFileTitle(titleValue)
  } catch {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package file layer title is unsafe for Windows.'
    )
  }
  if (typeof layer.digest !== 'string' || !DigestRegex.test(layer.digest)) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package file layer has an invalid content digest.'
    )
  }
  const layerDigest = layer.digest
  const sizeInBytes = requireSize(layer.size)
  if (
    (expectation.title !== undefined && title !== expectation.title) ||
    (expectation.layerDigest !== undefined &&
      layerDigest !== expectation.layerDigest) ||
    (expectation.sizeInBytes !== undefined &&
      sizeInBytes !== expectation.sizeInBytes)
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The package manifest does not match the reviewed file.'
    )
  }
  return {
    manifestDigest: actualManifestDigest,
    sourceRepositoryUrl,
    title,
    layerDigest,
    sizeInBytes,
  }
}

async function openRegularFile(
  path: string,
  maximumBytes: number,
  requireSingleLink: boolean
): Promise<{ readonly handle: FileHandle; readonly identity: BigIntStats }> {
  const visible = await lstat(path, { bigint: true }).catch(() => null)
  if (
    visible === null ||
    visible.isSymbolicLink() ||
    !visible.isFile() ||
    visible.size < 0n ||
    visible.size > BigInt(maximumBytes) ||
    (requireSingleLink && visible.nlink !== 1n)
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The transfer refused a missing, linked, non-regular, or oversized file.'
    )
  }
  const canonical = await realpath(path).catch(() => null)
  if (canonical === null) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The transfer could not resolve the selected file safely.'
    )
  }
  const canonicalMetadata = await lstat(canonical, { bigint: true })
  if (
    canonicalMetadata.isSymbolicLink() ||
    !canonicalMetadata.isFile() ||
    !sameFile(visible, canonicalMetadata)
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'The transfer refused a redirected or changed file.'
    )
  }
  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat({ bigint: true })
    if (
      !opened.isFile() ||
      !sameFile(visible, opened) ||
      (requireSingleLink && opened.nlink !== 1n)
    ) {
      throw new GitHubContainerFileTransferError(
        'integrity',
        'The transfer file changed while it was being opened.'
      )
    }
    return { handle, identity: opened }
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
  }
}

async function copyRegularFileSnapshot(
  sourcePath: string,
  destinationPath: string,
  maximumBytes: number,
  signal?: AbortSignal
): Promise<IFileDescriptor> {
  throwIfAborted(signal)
  const source = await openRegularFile(sourcePath, maximumBytes, false)
  let destination: FileHandle | null = null
  let completed = false
  try {
    destination = await open(
      destinationPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NoFollowFlag,
      0o600
    )
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(CopyBufferBytes)
    let position = 0
    while (true) {
      throwIfAborted(signal)
      const read = await source.handle.read(
        buffer,
        0,
        buffer.byteLength,
        position
      )
      if (read.bytesRead === 0) {
        break
      }
      hash.update(buffer.subarray(0, read.bytesRead))
      let written = 0
      while (written < read.bytesRead) {
        throwIfAborted(signal)
        const result = await destination.write(
          buffer,
          written,
          read.bytesRead - written,
          position + written
        )
        if (result.bytesWritten === 0) {
          throw new GitHubContainerFileTransferError(
            'destination-failed',
            'The destination stopped accepting package bytes.'
          )
        }
        written += result.bytesWritten
      }
      position += read.bytesRead
      if (position > maximumBytes) {
        throw new GitHubContainerFileTransferError(
          'integrity',
          'The selected package file exceeded its size limit while being read.'
        )
      }
    }
    await destination.sync()
    const [sourceAfter, visibleAfter, destinationAfter] = await Promise.all([
      source.handle.stat({ bigint: true }),
      lstat(sourcePath, { bigint: true }),
      destination.stat({ bigint: true }),
    ])
    if (
      !sameFile(source.identity, sourceAfter) ||
      !sameFile(source.identity, visibleAfter) ||
      visibleAfter.isSymbolicLink() ||
      position !== Number(source.identity.size) ||
      !destinationAfter.isFile() ||
      destinationAfter.isSymbolicLink() ||
      destinationAfter.nlink !== 1n ||
      destinationAfter.size !== BigInt(position)
    ) {
      throw new GitHubContainerFileTransferError(
        'source-changed',
        'The selected package file changed while Desktop Material copied it.'
      )
    }
    completed = true
    return {
      digest: `sha256:${hash.digest('hex')}`,
      sizeInBytes: position,
    }
  } finally {
    await source.handle.close().catch(() => undefined)
    if (destination !== null) {
      await destination.close().catch(() => undefined)
    }
    if (!completed) {
      await unlink(destinationPath).catch(() => undefined)
    }
  }
}

async function readOwnedBoundedFile(
  path: string,
  maximumBytes: number
): Promise<Buffer> {
  const opened = await openRegularFile(path, maximumBytes, true)
  try {
    const bytes = await opened.handle.readFile()
    const after = await opened.handle.stat({ bigint: true })
    const visible = await lstat(path, { bigint: true })
    if (
      bytes.byteLength !== Number(opened.identity.size) ||
      !sameFile(opened.identity, after) ||
      !sameFile(opened.identity, visible)
    ) {
      throw new GitHubContainerFileTransferError(
        'integrity',
        'The downloaded package file changed during verification.'
      )
    }
    return bytes
  } finally {
    await opened.handle.close().catch(() => undefined)
  }
}

async function hashOwnedRegularFile(
  path: string,
  maximumBytes: number,
  signal?: AbortSignal
): Promise<IFileDescriptor> {
  const opened = await openRegularFile(path, maximumBytes, true)
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(CopyBufferBytes)
    let position = 0
    while (true) {
      throwIfAborted(signal)
      const read = await opened.handle.read(
        buffer,
        0,
        buffer.byteLength,
        position
      )
      if (read.bytesRead === 0) {
        break
      }
      hash.update(buffer.subarray(0, read.bytesRead))
      position += read.bytesRead
    }
    const after = await opened.handle.stat({ bigint: true })
    const visible = await lstat(path, { bigint: true })
    if (
      position !== Number(opened.identity.size) ||
      !sameFile(opened.identity, after) ||
      !sameFile(opened.identity, visible)
    ) {
      throw new GitHubContainerFileTransferError(
        'integrity',
        'The downloaded package file changed during verification.'
      )
    }
    return {
      digest: `sha256:${hash.digest('hex')}`,
      sizeInBytes: position,
    }
  } finally {
    await opened.handle.close().catch(() => undefined)
  }
}

async function requireTrustedOrasExecutable(
  resolution: CheapLfsOrasExecutableResolution
): Promise<string> {
  if (!resolution.available) {
    throw new GitHubContainerFileTransferError(
      'untrusted-executable',
      resolution.message
    )
  }
  if (
    !isAbsolute(resolution.path) ||
    basename(resolution.path).toLowerCase() !== 'oras.exe' ||
    !DigestRegex.test(resolution.sha256)
  ) {
    throw new GitHubContainerFileTransferError(
      'untrusted-executable',
      'Desktop Material requires an absolute, digest-pinned oras.exe.'
    )
  }
  const path = resolve(resolution.path)
  const before = await lstat(path, { bigint: true }).catch(() => null)
  if (
    before === null ||
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.size <= 0n ||
    before.size > BigInt(MaximumExecutableBytes)
  ) {
    throw new GitHubContainerFileTransferError(
      'untrusted-executable',
      'Desktop Material rejected an unsafe ORAS executable.'
    )
  }
  const canonical = await realpath(path)
  const canonicalMetadata = await lstat(canonical, { bigint: true })
  if (!sameFile(before, canonicalMetadata)) {
    throw new GitHubContainerFileTransferError(
      'untrusted-executable',
      'Desktop Material rejected a redirected ORAS executable.'
    )
  }
  const opened = await openRegularFile(path, MaximumExecutableBytes, false)
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(CopyBufferBytes)
    let position = 0
    while (true) {
      const read = await opened.handle.read(
        buffer,
        0,
        buffer.byteLength,
        position
      )
      if (read.bytesRead === 0) {
        break
      }
      hash.update(buffer.subarray(0, read.bytesRead))
      position += read.bytesRead
    }
    const after = await opened.handle.stat({ bigint: true })
    if (
      !sameFile(opened.identity, after) ||
      `sha256:${hash.digest('hex')}` !== resolution.sha256
    ) {
      throw new GitHubContainerFileTransferError(
        'untrusted-executable',
        'The ORAS executable no longer matches this app build.'
      )
    }
  } finally {
    await opened.handle.close().catch(() => undefined)
  }
  return canonical
}

export class DefaultGitHubContainerFileOrasRunner
  implements IGitHubContainerFileOrasRunner
{
  private readonly spawnProcess: GitHubContainerFileOrasSpawn
  private readonly killProcessTree: (
    pid: number,
    isStillOwned: () => boolean
  ) => Promise<boolean>

  public constructor(
    dependencies: IDefaultGitHubContainerFileOrasRunnerDependencies = {}
  ) {
    this.spawnProcess =
      dependencies.spawn ?? (spawn as GitHubContainerFileOrasSpawn)
    this.killProcessTree = dependencies.killTree ?? killTreeAndWait
  }

  public async run(
    request: IGitHubContainerFileOrasRequest
  ): Promise<IGitHubContainerFileOrasResult> {
    throwIfAborted(request.signal)
    return new Promise((resolveRun, rejectRun) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = this.spawnProcess(request.executable, [...request.args], {
          shell: false,
          windowsHide: true,
          cwd: request.cwd,
          env: { ...request.environment },
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        }) as ChildProcessWithoutNullStreams
      } catch {
        rejectRun(
          new GitHubContainerFileTransferError(
            'process-failed',
            'Desktop Material could not start its trusted ORAS process.'
          )
        )
        return
      }

      const stdout: Buffer[] = []
      let outputBytes = 0
      let forcedError: GitHubContainerFileTransferError | null = null
      let settled = false
      let exited = false
      let closed = false
      let killStarted = false
      let killPromise: Promise<boolean> = Promise.resolve(true)
      const isStillOwned = () => !exited && !closed
      const directKill = () => {
        if (!isStillOwned()) {
          return
        }
        try {
          child.kill('SIGKILL')
        } catch {
          // ORAS may already have exited at this exact boundary.
        }
      }
      const terminate = () => {
        if (!isStillOwned() || killStarted) {
          return
        }
        killStarted = true
        if (child.pid === undefined) {
          directKill()
          return
        }
        let settleKill!: (value: boolean) => void
        killPromise = new Promise(resolve => {
          settleKill = resolve
        })
        try {
          void Promise.resolve(this.killProcessTree(child.pid, isStillOwned))
            .then(ok => {
              if (!ok) {
                directKill()
              }
              return ok
            })
            .catch(() => {
              directKill()
              return false
            })
            .then(settleKill)
        } catch {
          directKill()
          settleKill(false)
        }
      }
      const force = (error: GitHubContainerFileTransferError) => {
        if (forcedError === null) {
          forcedError = error
          terminate()
        }
      }
      const countOutput = (value: Buffer | string, keep: boolean) => {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
        outputBytes += bytes.byteLength
        if (outputBytes > MaximumProcessOutputBytes) {
          stdout.length = 0
          force(
            new GitHubContainerFileTransferError(
              'output-overflow',
              'ORAS exceeded its bounded output allowance.'
            )
          )
          return
        }
        if (keep) {
          stdout.push(Buffer.from(bytes))
        }
      }
      child.stdout.on('data', value => countOutput(value, true))
      child.stderr.on('data', value => countOutput(value, false))
      const onAbort = () =>
        force(
          new GitHubContainerFileTransferError(
            'canceled',
            'The GitHub package transfer was canceled.'
          )
        )
      request.signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = setTimeout(
        () =>
          force(
            new GitHubContainerFileTransferError(
              'process-timeout',
              'The GHCR transfer timed out. Check connectivity and try again.'
            )
          ),
        request.timeoutMs
      )
      const finish = (
        result?: IGitHubContainerFileOrasResult,
        error?: GitHubContainerFileTransferError
      ) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        request.signal?.removeEventListener('abort', onAbort)
        if (error !== undefined) {
          rejectRun(error)
        } else {
          resolveRun(result ?? { stdout: Buffer.alloc(0) })
        }
      }
      const finishAfterTermination = (
        result?: IGitHubContainerFileOrasResult,
        error?: GitHubContainerFileTransferError
      ) => {
        void killPromise.catch(() => false).then(() => finish(result, error))
      }
      child.once('error', () => {
        const error =
          forcedError ??
          new GitHubContainerFileTransferError(
            'process-failed',
            'The trusted ORAS process failed. Check GHCR package access and connectivity.'
          )
        if (child.pid === undefined) {
          finishAfterTermination(undefined, error)
        } else {
          force(error)
        }
      })
      child.once('exit', () => {
        exited = true
      })
      child.once('close', code => {
        closed = true
        exited = true
        if (forcedError !== null) {
          finishAfterTermination(undefined, forcedError)
        } else if (code === 0) {
          finishAfterTermination({ stdout: Buffer.concat(stdout) })
        } else {
          finishAfterTermination(
            undefined,
            new GitHubContainerFileTransferError(
              'process-failed',
              'GHCR rejected or could not complete the transfer. Check package permissions and connectivity.'
            )
          )
        }
      })
      guardStreamAgainstPeerClose(
        child.stdin,
        'GitHub package ORAS credential stdin'
      )
      if (request.signal?.aborted) {
        onAbort()
        child.stdin.end()
      } else {
        child.stdin.end(request.stdin)
      }
    })
  }
}

const defaultDependencies: IGitHubContainerFileTransferDependencies = {
  resolveOras: resolveTrustedCheapLfsOrasExecutable,
  runner: new DefaultGitHubContainerFileOrasRunner(),
  createUniqueId: randomUUID,
}

async function withTransferWorkspace<T>(
  operation: (workspace: ITransferWorkspace) => Promise<T>
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-material-package-'))
  const registryConfigPath = join(root, 'registry-config.json')
  const cachePath = join(root, 'oras-cache')
  let operationError: unknown
  try {
    // Per-command stdin auth is used. This file must never retain credentials.
    await writeFile(registryConfigPath, '{}', { flag: 'wx', mode: 0o600 })
    return await operation({ root, registryConfigPath, cachePath })
  } catch (error) {
    operationError = error
    throw error
  } finally {
    try {
      await rm(root, { recursive: true, force: true })
    } catch (cleanupError) {
      if (operationError === undefined) {
        throw new GitHubContainerFileTransferError(
          'cleanup',
          'Desktop Material could not clean its private ORAS workspace.'
        )
      }
      if (operationError instanceof Error) {
        operationError.cause = cleanupError
      }
    }
  }
}

function authenticationArguments(
  username: string,
  registryConfigPath: string,
  noTty: boolean
): ReadonlyArray<string> {
  return [
    '--username',
    username,
    '--password-stdin',
    '--registry-config',
    registryConfigPath,
    ...(noTty ? ['--no-tty'] : []),
  ]
}

async function runAuthenticated(
  dependencies: IGitHubContainerFileTransferDependencies,
  resolution: CheapLfsOrasExecutableResolution,
  args: ReadonlyArray<string>,
  username: string,
  token: Uint8Array,
  workspace: ITransferWorkspace,
  timeoutMs: number,
  signal?: AbortSignal,
  workingDirectory: string = workspace.root
): Promise<IGitHubContainerFileOrasResult> {
  throwIfAborted(signal)
  const executable = await requireTrustedOrasExecutable(resolution)
  const stdin = Buffer.allocUnsafe(token.byteLength + 1)
  stdin.set(token, 0)
  stdin[stdin.byteLength - 1] = 0x0a
  try {
    return await dependencies.runner.run({
      executable,
      args,
      stdin,
      cwd: workingDirectory,
      environment: { ...process.env, ORAS_CACHE: workspace.cachePath },
      signal,
      timeoutMs,
    })
  } catch (error) {
    if (error instanceof GitHubContainerFileTransferError) {
      throw error
    }
    throw new GitHubContainerFileTransferError(
      signal?.aborted ? 'canceled' : 'process-failed',
      signal?.aborted
        ? 'The GitHub package transfer was canceled.'
        : 'The trusted ORAS process failed without a usable result.'
    )
  } finally {
    stdin.fill(0)
  }
}

function parseJsonOutput(
  value: Buffer,
  operation: string
): Record<string, unknown> {
  if (value.byteLength === 0 || value.byteLength > MaximumProcessOutputBytes) {
    throw new GitHubContainerFileTransferError(
      'invalid-response',
      `${operation} returned no usable bounded result.`
    )
  }
  try {
    return requireRecord(
      JSON.parse(value.toString('utf8')),
      `${operation} returned invalid JSON.`
    )
  } catch (error) {
    if (error instanceof GitHubContainerFileTransferError) {
      throw new GitHubContainerFileTransferError(
        'invalid-response',
        `${operation} returned invalid JSON.`
      )
    }
    throw new GitHubContainerFileTransferError(
      'invalid-response',
      `${operation} returned invalid JSON.`
    )
  }
}

function uniqueTag(createUniqueId: () => string): string {
  const id = createUniqueId().toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Desktop Material could not create a safe unique package tag.'
    )
  }
  return `desktop-material-file-v1-${id}`
}

async function fetchAndInspectManifest(
  dependencies: IGitHubContainerFileTransferDependencies,
  resolution: CheapLfsOrasExecutableResolution,
  registryRepository: string,
  manifestDigest: string,
  sourceRepositoryUrl: string,
  username: string,
  token: Uint8Array,
  workspace: ITransferWorkspace,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  expected?: Pick<
    IGitHubContainerFileManifestExpectation,
    'title' | 'layerDigest' | 'sizeInBytes'
  >
): Promise<IGitHubContainerFileManifest> {
  const manifestPath = join(workspace.root, 'manifest.json')
  await runAuthenticated(
    dependencies,
    resolution,
    [
      'manifest',
      'fetch',
      '--media-type',
      GitHubContainerFileManifestMediaType,
      '--output',
      manifestPath,
      ...authenticationArguments(username, workspace.registryConfigPath, false),
      `${registryRepository}@${manifestDigest}`,
    ],
    username,
    token,
    workspace,
    timeoutMs,
    signal
  )
  const bytes = await readOwnedBoundedFile(manifestPath, MaximumManifestBytes)
  return inspectGitHubContainerFileManifest(bytes, {
    manifestDigest,
    sourceRepositoryUrl,
    ...expected,
  })
}

function parseUploadResult(output: Buffer, registryRepository: string): string {
  const result = parseJsonOutput(output, 'ORAS upload')
  if (typeof result.digest !== 'string' || !DigestRegex.test(result.digest)) {
    throw new GitHubContainerFileTransferError(
      'invalid-response',
      'ORAS did not return an immutable package digest.'
    )
  }
  const digest = result.digest
  if (
    result.reference !== `${registryRepository}@${digest}` ||
    result.mediaType !== GitHubContainerFileManifestMediaType ||
    result.artifactType !== GitHubContainerFileArtifactType
  ) {
    throw new GitHubContainerFileTransferError(
      'invalid-response',
      'ORAS did not confirm the expected Desktop Material package manifest.'
    )
  }
  return digest
}

function validatePullOutput(
  output: Buffer,
  immutableReference: string,
  manifest: IGitHubContainerFileManifest
): void {
  const result = parseJsonOutput(output, 'ORAS download')
  if (result.reference !== immutableReference || !Array.isArray(result.files)) {
    throw new GitHubContainerFileTransferError(
      'invalid-response',
      'ORAS did not confirm the selected immutable package download.'
    )
  }
  if (result.files.length !== 1) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'ORAS returned an unexpected number of package files.'
    )
  }
  const file = requireRecord(
    result.files[0],
    'ORAS returned invalid package file metadata.'
  )
  const annotations = requireRecord(
    file.annotations,
    'ORAS returned package file metadata without a title.'
  )
  if (
    file.digest !== manifest.layerDigest ||
    file.size !== manifest.sizeInBytes ||
    file.mediaType !== GitHubContainerFileLayerMediaType ||
    annotations[GitHubContainerFileTitleAnnotation] !== manifest.title
  ) {
    throw new GitHubContainerFileTransferError(
      'integrity',
      'ORAS returned file metadata that differs from the verified package manifest.'
    )
  }
}

async function publishDestinationAtomically(
  sourcePath: string,
  destinationPath: string,
  expected: IFileDescriptor,
  createUniqueId: () => string,
  signal?: AbortSignal
): Promise<void> {
  if (
    !isAbsolute(destinationPath) ||
    dirname(destinationPath) === destinationPath
  ) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Choose an absolute file destination.'
    )
  }
  const existing = await lstat(destinationPath).catch(error => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null
    }
    throw new GitHubContainerFileTransferError(
      'destination-failed',
      'Desktop Material could not inspect the selected destination.'
    )
  })
  if (existing !== null) {
    throw new GitHubContainerFileTransferError(
      'destination-exists',
      'The selected destination already exists. Choose a new filename.'
    )
  }
  const parent = dirname(destinationPath)
  const parentMetadata = await lstat(parent).catch(() => null)
  if (
    parentMetadata === null ||
    parentMetadata.isSymbolicLink() ||
    !parentMetadata.isDirectory()
  ) {
    throw new GitHubContainerFileTransferError(
      'destination-failed',
      'Choose an existing regular destination folder.'
    )
  }
  const id = createUniqueId().toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new GitHubContainerFileTransferError(
      'destination-failed',
      'Desktop Material could not create a safe destination transaction.'
    )
  }
  const temporaryPath = join(parent, `.desktop-material-package-${id}.tmp`)
  let operationError: unknown
  try {
    const copied = await copyRegularFileSnapshot(
      sourcePath,
      temporaryPath,
      GitHubContainerFileMaximumBytes,
      signal
    )
    if (
      copied.digest !== expected.digest ||
      copied.sizeInBytes !== expected.sizeInBytes
    ) {
      throw new GitHubContainerFileTransferError(
        'integrity',
        'The verified package bytes changed before destination publication.'
      )
    }
    throwIfAborted(signal)
    try {
      // A same-volume hard link is an atomic, fail-if-present publication.
      await link(temporaryPath, destinationPath)
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EEXIST') {
        throw new GitHubContainerFileTransferError(
          'destination-exists',
          'The selected destination was created by another process. No file was overwritten.'
        )
      }
      throw new GitHubContainerFileTransferError(
        'destination-failed',
        'Desktop Material could not atomically publish the downloaded file on this volume.'
      )
    }
  } catch (error) {
    operationError = error
    throw error
  } finally {
    try {
      await unlink(temporaryPath)
    } catch (cleanupError) {
      if (!(isErrnoException(cleanupError) && cleanupError.code === 'ENOENT')) {
        if (operationError === undefined) {
          throw new GitHubContainerFileTransferError(
            'cleanup',
            'The downloaded file was created, but Desktop Material could not remove its private transaction file.'
          )
        }
        if (operationError instanceof Error) {
          operationError.cause = cleanupError
        }
      }
    }
  }
}

async function requireNewDestinationCandidate(
  destinationPath: string
): Promise<void> {
  if (
    !isAbsolute(destinationPath) ||
    dirname(destinationPath) === destinationPath
  ) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Choose an absolute file destination.'
    )
  }
  const existing = await lstat(destinationPath).catch(error => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null
    }
    throw new GitHubContainerFileTransferError(
      'destination-failed',
      'Desktop Material could not inspect the selected destination.'
    )
  })
  if (existing !== null) {
    throw new GitHubContainerFileTransferError(
      'destination-exists',
      'The selected destination already exists. Choose a new filename.'
    )
  }
  const parent = await lstat(dirname(destinationPath)).catch(() => null)
  if (parent === null || parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new GitHubContainerFileTransferError(
      'destination-failed',
      'Choose an existing regular destination folder.'
    )
  }
}

async function resolveRuntime(
  options: IGitHubContainerFileTransferBaseOptions,
  dependencies: IGitHubContainerFileTransferDependencies
): Promise<CheapLfsOrasExecutableResolution> {
  throwIfAborted(options.signal)
  const resolution = await dependencies.resolveOras({
    ...options.oras,
    manifest: CheapLfsBundledOrasManifest,
  })
  if (!resolution.available) {
    throw new GitHubContainerFileTransferError(
      'untrusted-executable',
      resolution.message
    )
  }
  return resolution
}

/** Upload one reviewed file and return the immutable GHCR package reference. */
async function uploadGitHubContainerFileInternal(
  options: IUploadGitHubContainerFileOptions,
  dependencies: IGitHubContainerFileTransferDependencies = defaultDependencies
): Promise<IGitHubContainerFileUploadResult> {
  throwIfAborted(options.signal)
  const registryRepository = requireRegistryRepository(
    options.registryRepository
  )
  const sourceRepositoryUrl = requireGitHubContainerFileSourceRepositoryUrl(
    options.sourceRepositoryUrl
  )
  if (!isAbsolute(options.sourcePath)) {
    throw new GitHubContainerFileTransferError(
      'invalid-input',
      'Choose an absolute local file to upload.'
    )
  }
  const title = requireSafeGitHubContainerFileTitle(
    basename(options.sourcePath)
  )
  const timeoutMs = requireTimeout(options.processTimeoutMs)
  const tag = uniqueTag(dependencies.createUniqueId)
  const taggedReference = `${registryRepository}:${tag}`
  const resolution = await resolveRuntime(options, dependencies)
  const credentials = resolveCheapLfsGhcrCredentialsFromAccount(options.account)
  try {
    return await withTransferWorkspace(async workspace => {
      const stagedDirectory = join(workspace.root, 'upload')
      await mkdir(stagedDirectory, { mode: 0o700 })
      const stagedPath = join(stagedDirectory, title)
      const staged = await copyRegularFileSnapshot(
        options.sourcePath,
        stagedPath,
        GitHubContainerFileMaximumBytes,
        options.signal
      )
      const upload = await runAuthenticated(
        dependencies,
        resolution,
        [
          'push',
          '--image-spec',
          'v1.1',
          '--artifact-type',
          GitHubContainerFileArtifactType,
          '--annotation',
          `${GitHubContainerFileSourceAnnotation}=${sourceRepositoryUrl}`,
          '--annotation',
          `${GitHubContainerFileFormatAnnotation}=${GitHubContainerFileFormatVersion}`,
          '--concurrency',
          '1',
          '--format',
          'json',
          ...authenticationArguments(
            credentials.username,
            workspace.registryConfigPath,
            true
          ),
          '--',
          taggedReference,
          `${title}:${GitHubContainerFileLayerMediaType}`,
        ],
        credentials.username,
        credentials.token,
        workspace,
        timeoutMs,
        options.signal,
        stagedDirectory
      )
      const manifestDigest = parseUploadResult(
        upload.stdout,
        registryRepository
      )
      const manifest = await fetchAndInspectManifest(
        dependencies,
        resolution,
        registryRepository,
        manifestDigest,
        sourceRepositoryUrl,
        credentials.username,
        credentials.token,
        workspace,
        timeoutMs,
        options.signal,
        {
          title,
          layerDigest: staged.digest,
          sizeInBytes: staged.sizeInBytes,
        }
      )
      return {
        ...manifest,
        tag,
        taggedReference,
        immutableReference: `${registryRepository}@${manifestDigest}`,
      }
    })
  } finally {
    clearCheapLfsRegistryCredentials(credentials)
  }
}

/** Download one exact digest after validating its app-owned manifest. */
async function downloadGitHubContainerFileInternal(
  options: IDownloadGitHubContainerFileOptions,
  dependencies: IGitHubContainerFileTransferDependencies = defaultDependencies
): Promise<IGitHubContainerFileDownloadResult> {
  throwIfAborted(options.signal)
  const registryRepository = requireRegistryRepository(
    options.registryRepository
  )
  const sourceRepositoryUrl = requireGitHubContainerFileSourceRepositoryUrl(
    options.sourceRepositoryUrl
  )
  const manifestDigest = requireDigest(
    options.manifestDigest,
    'The selected package version'
  )
  await requireNewDestinationCandidate(options.destinationPath)
  const timeoutMs = requireTimeout(options.processTimeoutMs)
  const resolution = await resolveRuntime(options, dependencies)
  const credentials = resolveCheapLfsGhcrCredentialsFromAccount(options.account)
  const immutableReference = `${registryRepository}@${manifestDigest}`
  try {
    return await withTransferWorkspace(async workspace => {
      const manifest = await fetchAndInspectManifest(
        dependencies,
        resolution,
        registryRepository,
        manifestDigest,
        sourceRepositoryUrl,
        credentials.username,
        credentials.token,
        workspace,
        timeoutMs,
        options.signal
      )
      const outputPath = join(workspace.root, 'download')
      await mkdir(outputPath, { mode: 0o700 })
      const pull = await runAuthenticated(
        dependencies,
        resolution,
        [
          'pull',
          '--output',
          outputPath,
          '--keep-old-files',
          '--concurrency',
          '1',
          '--format',
          'json',
          ...authenticationArguments(
            credentials.username,
            workspace.registryConfigPath,
            true
          ),
          immutableReference,
        ],
        credentials.username,
        credentials.token,
        workspace,
        timeoutMs,
        options.signal
      )
      validatePullOutput(pull.stdout, immutableReference, manifest)
      const entries = await readdir(outputPath, { withFileTypes: true })
      if (
        entries.length !== 1 ||
        entries[0].name !== manifest.title ||
        !entries[0].isFile() ||
        entries[0].isSymbolicLink()
      ) {
        throw new GitHubContainerFileTransferError(
          'integrity',
          'The package download did not produce exactly one safe regular file.'
        )
      }
      const pulledPath = join(outputPath, manifest.title)
      const pulled = await hashOwnedRegularFile(
        pulledPath,
        GitHubContainerFileMaximumBytes,
        options.signal
      )
      if (
        pulled.digest !== manifest.layerDigest ||
        pulled.sizeInBytes !== manifest.sizeInBytes
      ) {
        throw new GitHubContainerFileTransferError(
          'integrity',
          'The downloaded bytes do not match the verified package manifest.'
        )
      }
      await publishDestinationAtomically(
        pulledPath,
        options.destinationPath,
        pulled,
        dependencies.createUniqueId,
        options.signal
      )
      return {
        ...manifest,
        immutableReference,
        destinationPath: options.destinationPath,
      }
    })
  } finally {
    clearCheapLfsRegistryCredentials(credentials)
  }
}

function normalizeTransferError(
  error: unknown,
  signal: AbortSignal | undefined
): GitHubContainerFileTransferError {
  if (error instanceof GitHubContainerFileTransferError) {
    return error
  }
  if (signal?.aborted) {
    return new GitHubContainerFileTransferError(
      'canceled',
      'The GitHub package transfer was canceled.'
    )
  }
  if (error instanceof CheapLfsRegistryRuntimeError) {
    return new GitHubContainerFileTransferError(
      error.kind === 'untrusted-executable'
        ? 'untrusted-executable'
        : 'invalid-input',
      error.message
    )
  }
  return new GitHubContainerFileTransferError(
    'process-failed',
    'The GHCR transfer could not complete a local safety check. Verify the selected paths and try again.'
  )
}

export async function uploadGitHubContainerFile(
  options: IUploadGitHubContainerFileOptions,
  dependencies: IGitHubContainerFileTransferDependencies = defaultDependencies
): Promise<IGitHubContainerFileUploadResult> {
  try {
    return await uploadGitHubContainerFileInternal(options, dependencies)
  } catch (error) {
    throw normalizeTransferError(error, options.signal)
  }
}

export async function downloadGitHubContainerFile(
  options: IDownloadGitHubContainerFileOptions,
  dependencies: IGitHubContainerFileTransferDependencies = defaultDependencies
): Promise<IGitHubContainerFileDownloadResult> {
  try {
    return await downloadGitHubContainerFileInternal(options, dependencies)
  } catch (error) {
    throw normalizeTransferError(error, options.signal)
  }
}
