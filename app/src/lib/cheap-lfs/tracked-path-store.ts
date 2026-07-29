import { constants } from 'fs'
import type { BigIntStats } from 'fs'
import { createHash, randomUUID } from 'crypto'
import {
  chmod,
  FileHandle,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { setTimeout as delay } from 'timers/promises'
import { validateCheapLfsTrackedPath } from './pointer'
import { cheapLfsSidecarName } from './sidecar-name'

const NoFollowFlag = constants.O_NOFOLLOW ?? 0
const CopyBufferBytes = 1024 * 1024

/**
 * Modification times are quantized. `mtimeNs` is *reported* in nanoseconds, but
 * a write only moves it once the clock the kernel stamps writes from has ticked
 * — so two different writes that land inside one tick share an `mtime`, share a
 * `ctime`, and (for a same-size rewrite) share a size. An identity captured
 * inside its own modification tick therefore proves nothing at all about
 * content. This is Git's "racily clean" hazard, and Git's answer is the one
 * used here: distrust the stat cache and re-read.
 *
 * Two seconds is the coarsest granularity Desktop Material expects to meet
 * (FAT/exFAT-class volumes and several network filesystems quantize modification
 * times that far). Any identity whose modification time is already older than
 * that when it is captured is trusted with no probe, no wait, and no extra read
 * — which is every file that has not been touched in the last couple of
 * seconds, i.e. the overwhelming majority.
 */
const ConservativeTimestampGranularityNanoseconds = 2_000_000_000n

/**
 * Floor applied to a *probed* granularity. Windows stamps writes from the system
 * clock, whose default tick is 15.625 ms and which any process on the machine
 * may raise or lower at runtime through `timeBeginPeriod`; a probe taken while
 * some other process holds a fine tick would otherwise cache a granularity that
 * stops being true the moment that process exits. 16 ms also sits above the
 * 10 ms coarse-clock tick of a 100 Hz Linux kernel.
 */
const MinimumTimestampGranularityNanoseconds = 16_000_000n

/** Bounds one granularity probe. The result is cached per device. */
const TimestampProbeBudgetMilliseconds = 150
const TimestampProbeSampleLimit = 64

/**
 * Longest wait accepted to let a just-written file's modification time become
 * provably older than the capture. Past this the identity is simply recorded as
 * unsettled, which re-hashes under a full content proof and fails closed
 * without one.
 */
const MaximumSettleWaitNanoseconds = 2_500_000_000n
const SettleAttemptLimit = 4
const SettleSlackNanoseconds = 1_000_000n

const timestampGranularityByDevice = new Map<string, Promise<bigint>>()

declare const trackedProofBrand: unique symbol
declare const sourceProofBrand: unique symbol
declare const ownedFileBrand: unique symbol

interface IPathIdentity {
  readonly device: bigint
  readonly inode: bigint
  readonly birthtimeNanoseconds: bigint
  readonly changeTimeNanoseconds: bigint
  readonly modificationTimeNanoseconds: bigint
  readonly sizeInBytes: bigint
  readonly links: bigint
  readonly mode: bigint
  /** Wall clock at the moment this identity was read, in nanoseconds. */
  readonly observedAtNanoseconds: bigint
  /**
   * `true` when this identity's modification time is older than the moment it
   * was captured by more than the volume's timestamp granularity, so any write
   * made after the capture is guaranteed to move `mtime`. Only a settled
   * identity may stand in for a content re-hash.
   */
  readonly settled: boolean
}

interface IParentProof {
  readonly path: string
  readonly identity: IPathIdentity
}

export interface ICheapLfsTrackedFileProof {
  readonly [trackedProofBrand]: true
  readonly repositoryRoot: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly exists: boolean
  readonly sizeInBytes: number
  readonly sha256: string | null
}

export interface ICheapLfsSourceFileProof {
  readonly [sourceProofBrand]: true
  readonly absolutePath: string
  readonly sizeInBytes: number
  readonly sha256: string
}

export interface ICheapLfsOwnedFile {
  readonly [ownedFileBrand]: true
  readonly path: string
  readonly sizeInBytes: number
  readonly sha256: string
}

export interface ICheapLfsTrackedHashedPart {
  readonly offset: number
  readonly length: number
  readonly sha256: string
}

export interface ICheapLfsVerifiedSourceCopy {
  readonly destination: ICheapLfsTrackedFileProof
  readonly source: ICheapLfsSourceFileProof
  readonly owned: ICheapLfsOwnedFile
  readonly sha256: string
  readonly sizeInBytes: number
  readonly parts: ReadonlyArray<ICheapLfsTrackedHashedPart>
}

export interface ICheapLfsTrackedTextWrite {
  readonly proof: ICheapLfsTrackedFileProof
  readonly text: string
}

export class CheapLfsTrackedPathError extends Error {
  public constructor(
    message: string,
    public readonly recoveryPaths: ReadonlyArray<string> = [],
    public readonly applied: boolean = false
  ) {
    super(message)
    this.name = 'CheapLfsTrackedPathError'
  }
}

export interface ICheapLfsTrackedPathStoreHooks {
  readonly beforeQuarantine?: (
    proof: ICheapLfsTrackedFileProof
  ) => Promise<void>
  readonly beforePublish?: (
    proof: ICheapLfsTrackedFileProof,
    recoveryDirectory: string
  ) => Promise<void>
}

export interface ICheapLfsTrackedPathStore {
  proveExisting(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof>
  proveDestination(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof>
  /**
   * Like `proveDestination`, but captures only the strong path identity
   * and defers the content hash: `sha256` stays `null` even for an existing
   * file. Mutations verified against such a proof revalidate by identity and
   * fail closed on any drift instead of accepting a hash match. Optional so
   * structural test fakes remain compatible; callers fall back to
   * `proveDestination`.
   */
  proveDestinationIdentity?(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof>
  proveManagedPath(
    repositoryPath: string,
    relativePath: string,
    exactAllowedPath: string
  ): Promise<ICheapLfsTrackedFileProof>
  readText(
    proof: ICheapLfsTrackedFileProof,
    maximumBytes: number
  ): Promise<string>
  /**
   * Read only the requested prefix from an identity-proven regular file. The
   * file may be larger than the prefix; symlinks, reparse points, linked files,
   * parent redirects, and identity drift remain fail-closed.
   */
  readTextPrefix(
    proof: ICheapLfsTrackedFileProof,
    maximumBytes: number
  ): Promise<string>
  prepareUpload(
    repositoryPath: string,
    relativePath: string,
    sourcePath: string,
    partSize: number,
    signal?: AbortSignal,
    onProgress?: (processedBytes: number) => void
  ): Promise<ICheapLfsVerifiedSourceCopy>
  revalidateSource(proof: ICheapLfsSourceFileProof): Promise<void>
  revalidate(proof: ICheapLfsTrackedFileProof): Promise<void>
  refreshAfterOwnedLinkCleanup?(
    proof: ICheapLfsTrackedFileProof
  ): Promise<ICheapLfsTrackedFileProof>
  publishText(proof: ICheapLfsTrackedFileProof, text: string): Promise<void>
  publishTextBatch?(
    writes: ReadonlyArray<ICheapLfsTrackedTextWrite>
  ): Promise<void>
  replaceFromPath(
    proof: ICheapLfsTrackedFileProof,
    sourcePath: string,
    expectedSha256: string,
    expectedSizeInBytes: number,
    signal?: AbortSignal
  ): Promise<void>
  remove(proof: ICheapLfsTrackedFileProof): Promise<void>
  cleanupOwned(owned: ICheapLfsOwnedFile): Promise<void>
}

interface IInternalTrackedProof extends ICheapLfsTrackedFileProof {
  readonly owner: object
  readonly parents: ReadonlyArray<IParentProof>
  readonly identity: IPathIdentity | null
}

interface IInternalSourceProof
  extends Omit<ICheapLfsSourceFileProof, 'sha256'> {
  readonly owner: object
  readonly parent: IParentProof
  readonly identity: IPathIdentity
  /** `null` while deferred; backfilled by the authoritative owned-copy hash. */
  readonly sha256: string | null
}

interface IInternalOwnedFile extends ICheapLfsOwnedFile {
  readonly owner: object
  readonly directoryPath: string
  readonly directoryIdentity: IPathIdentity
  readonly identity: IPathIdentity
}

interface IResolvedTrackedLocation {
  readonly repositoryRoot: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly parents: ReadonlyArray<IParentProof>
}

interface IHashResult {
  readonly sha256: string
  readonly sizeInBytes: number
  readonly parts: ReadonlyArray<ICheapLfsTrackedHashedPart>
}

function abortError(): Error {
  const error = new Error('The Cheap LFS file operation was canceled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortError()
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function samePath(left: string, right: string): boolean {
  if (process.platform !== 'win32') {
    return resolve(left) === resolve(right)
  }
  const comparable = (value: string) =>
    resolve(value)
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/i, '')
      .toLowerCase()
  return comparable(left) === comparable(right)
}

function isOutside(root: string, candidate: string): boolean {
  const value = relative(root, candidate)
  return isAbsolute(value) || value === '..' || value.startsWith(`..${sep}`)
}

function nowNanoseconds(): bigint {
  return BigInt(Date.now()) * 1_000_000n
}

/**
 * Measure the smallest observable step between two modification times on the
 * volume that holds `directory`, by rewriting a private probe file. Every
 * observed step is a whole multiple of the real quantum, so the smallest one
 * can only over-estimate it, which is the safe direction. A volume too coarse
 * to show any step inside the budget (FAT's two seconds, for instance) yields
 * `null` and keeps the conservative bound. Any failure — a read-only tree, a
 * full disk, a denied write — also yields `null`: the probe must never fail the
 * operation it runs inside.
 */
async function probeTimestampGranularity(
  directory: string
): Promise<bigint | null> {
  const path = join(
    directory,
    `.cheap-lfs-timestamp-probe-${process.pid}-${randomUUID()}`
  )
  try {
    const deadline = Date.now() + TimestampProbeBudgetMilliseconds
    let previous: bigint | null = null
    let smallest: bigint | null = null
    for (let sample = 0; sample < TimestampProbeSampleLimit; sample++) {
      await writeFile(path, sample % 2 === 0 ? 'a' : 'b', {
        // The first write claims the name exclusively, so the probe can never
        // follow something another process planted there first.
        flag: sample === 0 ? 'wx' : 'w',
        mode: 0o600,
      })
      const observed = (await lstat(path, { bigint: true })).mtimeNs
      if (previous !== null && observed > previous) {
        const step = observed - previous
        if (smallest === null || step < smallest) {
          smallest = step
        }
      }
      previous = observed
      if (Date.now() >= deadline) {
        break
      }
    }
    return smallest
  } catch {
    return null
  } finally {
    await unlink(path).catch(() => undefined)
  }
}

function timestampGranularityFor(
  device: bigint,
  directory: string
): Promise<bigint> {
  const key = String(device)
  const cached = timestampGranularityByDevice.get(key)
  if (cached !== undefined) {
    return cached
  }
  const pending = probeTimestampGranularity(directory).then(probed =>
    probed === null
      ? ConservativeTimestampGranularityNanoseconds
      : probed < MinimumTimestampGranularityNanoseconds
      ? MinimumTimestampGranularityNanoseconds
      : probed
  )
  timestampGranularityByDevice.set(key, pending)
  return pending
}

function identity(
  stats: BigIntStats,
  observedAtNanoseconds: bigint = nowNanoseconds()
): IPathIdentity {
  return {
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
    changeTimeNanoseconds: stats.ctimeNs,
    modificationTimeNanoseconds: stats.mtimeNs,
    sizeInBytes: stats.size,
    links: stats.nlink,
    mode: stats.mode,
    observedAtNanoseconds,
    settled:
      observedAtNanoseconds - stats.mtimeNs >
      ConservativeTimestampGranularityNanoseconds,
  }
}

/**
 * Turn a freshly captured identity into a settled one by waiting out the rest
 * of its modification tick and reading it again, so that any write landing
 * after the capture is guaranteed to move `mtime`. Only a file modified within
 * the last couple of seconds reaches the probe or the wait at all. A file whose
 * modification time is in the future, or so recent that the volume's own
 * granularity would need a longer wait than {@link
 * MaximumSettleWaitNanoseconds}, is returned unsettled — callers then re-hash
 * under a full content proof and fail closed without one.
 */
async function settleIdentity(
  captured: IPathIdentity,
  directory: string,
  recapture: () => Promise<IPathIdentity>
): Promise<IPathIdentity> {
  let observed = captured
  for (let attempt = 0; attempt < SettleAttemptLimit; attempt++) {
    if (observed.settled) {
      return observed
    }
    const granularity = await timestampGranularityFor(
      observed.device,
      directory
    )
    const age =
      observed.observedAtNanoseconds - observed.modificationTimeNanoseconds
    if (age > granularity) {
      return { ...observed, settled: true }
    }
    const wait = granularity - age + SettleSlackNanoseconds
    if (wait > MaximumSettleWaitNanoseconds) {
      return observed
    }
    await delay(Number(wait / 1_000_000n) + 1)
    observed = await recapture()
  }
  return observed
}

function sameEntry(
  left: IPathIdentity,
  right: IPathIdentity,
  includeContentMetadata: boolean
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthtimeNanoseconds === right.birthtimeNanoseconds &&
    (!includeContentMetadata ||
      (left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
        left.modificationTimeNanoseconds ===
          right.modificationTimeNanoseconds &&
        left.sizeInBytes === right.sizeInBytes))
  )
}

/**
 * Rename/link-tolerant content identity: the same device, inode, and birth
 * time with an unchanged modification time and size. `ctime` is deliberately
 * excluded because `rename`, `link`, and mode fixes advance it without touching
 * content.
 *
 * `left` must be a *settled* capture, and this refuses outright when it is not.
 * A content write does **not** reliably advance `mtime` or the size: `mtime`
 * only moves when the clock the kernel stamps writes from has ticked, so a
 * same-size rewrite inside one tick leaves `mtime`, `ctime`, and the size all
 * identical. Only once a capture's own modification time is older than the
 * capture by more than the volume's timestamp granularity is every later write
 * guaranteed to be visible here — and only then does a match prove the bytes
 * hashed at capture are the bytes present now, letting a revalidation skip
 * re-hashing. Any `false` must re-hash or fail closed.
 */
function sameContentEntry(left: IPathIdentity, right: IPathIdentity): boolean {
  return (
    left.settled &&
    sameEntry(left, right, false) &&
    left.modificationTimeNanoseconds === right.modificationTimeNanoseconds &&
    left.sizeInBytes === right.sizeInBytes
  )
}

/**
 * The strictest identity match: everything {@link sameContentEntry} proves plus
 * an unchanged `ctime`, again only from a settled capture. Used wherever a
 * captured identity stands in for a content re-hash across an operation.
 */
function sameSettledEntry(left: IPathIdentity, right: IPathIdentity): boolean {
  return left.settled && sameEntry(left, right, true)
}

async function hashHandle(
  handle: FileHandle,
  partSize: number,
  signal?: AbortSignal,
  destination?: FileHandle,
  onProgress?: (processedBytes: number) => void
): Promise<IHashResult> {
  if (!Number.isSafeInteger(partSize) || partSize <= 0) {
    throw new CheapLfsTrackedPathError(
      'Cheap LFS requires a positive safe upload part size.'
    )
  }
  const whole = createHash('sha256')
  const parts = new Array<ICheapLfsTrackedHashedPart>()
  const buffer = Buffer.allocUnsafe(CopyBufferBytes)
  let part = createHash('sha256')
  let partOffset = 0
  let partBytes = 0
  let position = 0
  onProgress?.(0)
  while (true) {
    throwIfAborted(signal)
    const read = await handle.read(buffer, 0, buffer.byteLength, position)
    if (read.bytesRead === 0) {
      break
    }
    let written = 0
    while (destination !== undefined && written < read.bytesRead) {
      const result = await destination.write(
        buffer,
        written,
        read.bytesRead - written,
        position + written
      )
      if (result.bytesWritten <= 0) {
        throw new CheapLfsTrackedPathError(
          'Cheap LFS could not write its verified private source copy.'
        )
      }
      written += result.bytesWritten
    }
    whole.update(buffer.subarray(0, read.bytesRead))
    let offset = 0
    while (offset < read.bytesRead) {
      const count = Math.min(partSize - partBytes, read.bytesRead - offset)
      part.update(buffer.subarray(offset, offset + count))
      partBytes += count
      offset += count
      if (partBytes === partSize) {
        parts.push({
          offset: partOffset,
          length: partBytes,
          sha256: part.digest('hex'),
        })
        partOffset += partBytes
        partBytes = 0
        part = createHash('sha256')
      }
    }
    position += read.bytesRead
    onProgress?.(position)
  }
  if (partBytes > 0 || position === 0) {
    parts.push({
      offset: partOffset,
      length: partBytes,
      sha256: part.digest('hex'),
    })
  }
  return {
    sha256: whole.digest('hex'),
    sizeInBytes: position,
    parts,
  }
}

async function openRegularFile(
  path: string,
  expectedLinks: bigint = 1n
): Promise<{
  readonly handle: FileHandle
  readonly identity: IPathIdentity
}> {
  const entry = await lstat(path, { bigint: true })
  if (
    entry.isSymbolicLink() ||
    !entry.isFile() ||
    entry.nlink !== expectedLinks
  ) {
    throw new CheapLfsTrackedPathError(
      'Cheap LFS refused a symlink, junction, or linked file (including a reparse point or non-file).'
    )
  }
  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat({ bigint: true })
    if (
      !opened.isFile() ||
      opened.nlink !== expectedLinks ||
      !sameEntry(identity(entry), identity(opened), true)
    ) {
      throw new CheapLfsTrackedPathError(
        'The Cheap LFS file changed while it was being opened.'
      )
    }
    // Settle before anything is read or hashed from this handle. An identity
    // captured inside its own modification tick can never prove that a later
    // same-size write did not happen; settling first also means the content
    // hash `inspectPath` takes next is bracketed by a modification time that
    // any concurrent write is now bound to move.
    return {
      handle,
      identity: await settleIdentity(
        identity(opened),
        dirname(path),
        async () => {
          const refreshed = await handle.stat({ bigint: true })
          if (!refreshed.isFile() || refreshed.nlink !== expectedLinks) {
            throw new CheapLfsTrackedPathError(
              'The Cheap LFS file changed while its identity was settled.'
            )
          }
          return identity(refreshed)
        }
      ),
    }
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
  }
}

/**
 * Capture a path's strong identity with the same symlink/reparse/link-count
 * refusals as {@link inspectPath}, but without paying a full content read.
 * Used wherever an identity captured earlier in the same operation (always
 * bracketed by at least one authoritative full-content hash) is revalidated.
 */
async function inspectPathIdentity(
  path: string,
  expectedLinks: bigint = 1n
): Promise<{
  readonly identity: IPathIdentity
  readonly sizeInBytes: number
}> {
  const opened = await openRegularFile(path, expectedLinks)
  await opened.handle.close()
  return {
    identity: opened.identity,
    sizeInBytes: Number(opened.identity.sizeInBytes),
  }
}

async function inspectPath(
  path: string,
  expectedLinks: bigint = 1n
): Promise<{
  readonly identity: IPathIdentity
  readonly sha256: string
  readonly sizeInBytes: number
}> {
  const opened = await openRegularFile(path, expectedLinks)
  try {
    const hashed = await hashHandle(opened.handle, Number.MAX_SAFE_INTEGER)
    const after = await opened.handle.stat({ bigint: true })
    const visible = await lstat(path, { bigint: true })
    if (
      !sameEntry(opened.identity, identity(after), true) ||
      !sameEntry(opened.identity, identity(visible), true)
    ) {
      throw new CheapLfsTrackedPathError(
        'The Cheap LFS file changed while its content was verified.'
      )
    }
    return {
      identity: opened.identity,
      sha256: hashed.sha256,
      sizeInBytes: hashed.sizeInBytes,
    }
  } finally {
    await opened.handle.close()
  }
}

export class CheapLfsTrackedPathStore implements ICheapLfsTrackedPathStore {
  private readonly owner = Object.freeze({})

  public constructor(
    private readonly hooks: ICheapLfsTrackedPathStoreHooks = {}
  ) {}

  private requireProof(
    proof: ICheapLfsTrackedFileProof
  ): IInternalTrackedProof {
    const candidate = proof as IInternalTrackedProof
    if (candidate.owner !== this.owner) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS rejected a foreign or forged tracked-path proof.'
      )
    }
    return candidate
  }

  private requireSource(proof: ICheapLfsSourceFileProof): IInternalSourceProof {
    const candidate = proof as unknown as IInternalSourceProof
    if (candidate.owner !== this.owner) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS rejected a foreign or forged source proof.'
      )
    }
    return candidate
  }

  private requireOwned(owned: ICheapLfsOwnedFile): IInternalOwnedFile {
    const candidate = owned as IInternalOwnedFile
    if (candidate.owner !== this.owner) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS rejected a foreign or forged owned-file proof.'
      )
    }
    return candidate
  }

  private async resolveLocation(
    repositoryPath: string,
    relativePathInput: string,
    exactAllowedPath?: string
  ): Promise<IResolvedTrackedLocation> {
    const relativePath =
      exactAllowedPath === undefined
        ? validateCheapLfsTrackedPath(relativePathInput)
        : relativePathInput === exactAllowedPath
        ? relativePathInput.replace(/\\/g, '/')
        : null
    if (relativePath === null) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS rejected an unsafe tracked path spelling.'
      )
    }
    const requestedRoot = resolve(repositoryPath)
    const repositoryRoot = await realpath(requestedRoot).catch(() => null)
    if (repositoryRoot === null) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS could not canonicalize the repository root.'
      )
    }
    const rootEntry = await lstat(repositoryRoot, { bigint: true })
    if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS requires a canonical regular repository directory.'
      )
    }
    const parents = new Array<IParentProof>()
    parents.push({
      path: repositoryRoot,
      identity: identity(rootEntry),
    })
    const segments = relativePath.split('/')
    let parent = repositoryRoot
    for (const component of segments.slice(0, -1)) {
      const requested = join(parent, component)
      const entry = await lstat(requested, { bigint: true }).catch(() => null)
      if (entry === null || entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new CheapLfsTrackedPathError(
          'Cheap LFS refused a missing/non-directory symlink or junction/reparse-point parent.'
        )
      }
      const canonical = await realpath(requested)
      if (
        !samePath(canonical, requested) ||
        isOutside(repositoryRoot, canonical)
      ) {
        throw new CheapLfsTrackedPathError(
          'Cheap LFS refused a redirected tracked-path parent.'
        )
      }
      const canonicalEntry = await lstat(canonical, { bigint: true })
      if (
        canonicalEntry.isSymbolicLink() ||
        !canonicalEntry.isDirectory() ||
        !sameEntry(identity(entry), identity(canonicalEntry), false)
      ) {
        throw new CheapLfsTrackedPathError(
          'A Cheap LFS tracked-path parent changed during canonicalization.'
        )
      }
      parent = canonical
      parents.push({ path: parent, identity: identity(canonicalEntry) })
    }
    const absolutePath = join(parent, segments[segments.length - 1])
    if (isOutside(repositoryRoot, absolutePath)) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused a tracked path outside the repository.'
      )
    }
    return { repositoryRoot, relativePath, absolutePath, parents }
  }

  private async revalidateParents(
    parents: ReadonlyArray<IParentProof>
  ): Promise<void> {
    for (const parent of parents) {
      const entry = await lstat(parent.path, { bigint: true }).catch(() => null)
      const canonical = await realpath(parent.path).catch(() => null)
      if (
        entry === null ||
        canonical === null ||
        entry.isSymbolicLink() ||
        !entry.isDirectory() ||
        !samePath(canonical, parent.path) ||
        !sameEntry(parent.identity, identity(entry), false)
      ) {
        throw new CheapLfsTrackedPathError(
          'A canonical Cheap LFS tracked-path parent changed during the operation.'
        )
      }
    }
  }

  private async proveLocation(
    location: IResolvedTrackedLocation,
    requireExisting: boolean,
    capture: 'hash' | 'identity' = 'hash'
  ): Promise<IInternalTrackedProof> {
    await this.revalidateParents(location.parents)
    let inspected: {
      readonly identity: IPathIdentity
      readonly sizeInBytes: number
      readonly sha256: string | null
    } | null = null
    try {
      inspected =
        capture === 'hash'
          ? await inspectPath(location.absolutePath)
          : {
              ...(await inspectPathIdentity(location.absolutePath)),
              sha256: null,
            }
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error
      }
    }
    if (inspected === null && requireExisting) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS requires an existing regular tracked file.'
      )
    }
    await this.revalidateParents(location.parents)
    return {
      owner: this.owner,
      repositoryRoot: location.repositoryRoot,
      relativePath: location.relativePath,
      absolutePath: location.absolutePath,
      parents: location.parents,
      exists: inspected !== null,
      identity: inspected?.identity ?? null,
      sizeInBytes: inspected?.sizeInBytes ?? 0,
      sha256: inspected?.sha256 ?? null,
    } as IInternalTrackedProof
  }

  public async proveExisting(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof> {
    return this.proveLocation(
      await this.resolveLocation(repositoryPath, relativePath),
      true
    )
  }

  public async proveDestination(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof> {
    return this.proveLocation(
      await this.resolveLocation(repositoryPath, relativePath),
      false
    )
  }

  public async proveDestinationIdentity(
    repositoryPath: string,
    relativePath: string
  ): Promise<ICheapLfsTrackedFileProof> {
    return this.proveLocation(
      await this.resolveLocation(repositoryPath, relativePath),
      false,
      'identity'
    )
  }

  public async proveManagedPath(
    repositoryPath: string,
    relativePath: string,
    exactAllowedPath: string
  ): Promise<ICheapLfsTrackedFileProof> {
    return this.proveLocation(
      await this.resolveLocation(
        repositoryPath,
        relativePath,
        exactAllowedPath
      ),
      false
    )
  }

  public async revalidate(
    proofInput: ICheapLfsTrackedFileProof
  ): Promise<void> {
    const proof = this.requireProof(proofInput)
    await this.revalidateParents(proof.parents)
    let current: Awaited<ReturnType<typeof inspectPathIdentity>> | null = null
    try {
      current = await inspectPathIdentity(proof.absolutePath)
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error
      }
    }
    if (!proof.exists) {
      if (current !== null) {
        throw new CheapLfsTrackedPathError(
          'The Cheap LFS destination was created concurrently.'
        )
      }
      return
    }
    // A full ctime-inclusive identity match against a *settled* capture proves
    // the bytes proven at capture time are untouched, so the content re-hash is
    // skipped. Any drift fails closed exactly as the previous hash comparison
    // did (metadata cannot drift back without advancing `ctime`).
    let matches =
      current !== null &&
      proof.identity !== null &&
      sameSettledEntry(proof.identity, current.identity) &&
      current.sizeInBytes === proof.sizeInBytes
    if (
      !matches &&
      current !== null &&
      proof.identity !== null &&
      !proof.identity.settled &&
      proof.sha256 !== null &&
      sameEntry(proof.identity, current.identity, true) &&
      current.sizeInBytes === proof.sizeInBytes
    ) {
      // The identity is intact but was captured inside its own modification
      // tick, so it cannot rule out a later same-size rewrite. Fall back to the
      // full content proof this proof carries.
      const rehashed = await inspectPath(proof.absolutePath)
      matches =
        sameEntry(proof.identity, rehashed.identity, false) &&
        rehashed.sha256 === proof.sha256 &&
        rehashed.sizeInBytes === proof.sizeInBytes
    }
    if (!matches) {
      throw new CheapLfsTrackedPathError(
        'The tracked Cheap LFS file changed during the operation.'
      )
    }
    await this.revalidateParents(proof.parents)
  }

  public async readText(
    proofInput: ICheapLfsTrackedFileProof,
    maximumBytes: number
  ): Promise<string> {
    const proof = this.requireProof(proofInput)
    if (!proof.exists || proof.sizeInBytes > maximumBytes || maximumBytes < 0) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused an absent or oversized tracked text file.'
      )
    }
    const handle = await open(
      proof.absolutePath,
      constants.O_RDONLY | NoFollowFlag
    )
    try {
      const opened = identity(await handle.stat({ bigint: true }))
      if (proof.identity === null || !sameEntry(proof.identity, opened, true)) {
        throw new CheapLfsTrackedPathError(
          'The tracked Cheap LFS text changed while it was opened.'
        )
      }
      const buffer = Buffer.alloc(proof.sizeInBytes + 1)
      const result = await handle.read(buffer, 0, buffer.length, 0)
      if (result.bytesRead !== proof.sizeInBytes) {
        throw new CheapLfsTrackedPathError(
          'The tracked Cheap LFS text changed while it was read.'
        )
      }
      await this.revalidate(proof)
      return buffer.subarray(0, result.bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  }

  public async readTextPrefix(
    proofInput: ICheapLfsTrackedFileProof,
    maximumBytes: number
  ): Promise<string> {
    const proof = this.requireProof(proofInput)
    if (
      !proof.exists ||
      !Number.isSafeInteger(maximumBytes) ||
      maximumBytes < 0
    ) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused an absent tracked prefix read.'
      )
    }
    const bytesToRead = Math.min(proof.sizeInBytes, maximumBytes)
    const handle = await open(
      proof.absolutePath,
      constants.O_RDONLY | NoFollowFlag
    )
    try {
      const openedStats = await handle.stat({ bigint: true })
      const opened = identity(openedStats)
      if (
        !openedStats.isFile() ||
        openedStats.nlink !== 1n ||
        proof.identity === null ||
        !sameSettledEntry(proof.identity, opened)
      ) {
        throw new CheapLfsTrackedPathError(
          'The tracked Cheap LFS prefix changed while it was opened.'
        )
      }
      const buffer = Buffer.alloc(bytesToRead)
      const result =
        bytesToRead === 0
          ? { bytesRead: 0 }
          : await handle.read(buffer, 0, bytesToRead, 0)
      const afterStats = await handle.stat({ bigint: true })
      const visibleStats = await lstat(proof.absolutePath, { bigint: true })
      const after = identity(afterStats)
      const visible = identity(visibleStats)
      if (
        result.bytesRead !== bytesToRead ||
        !afterStats.isFile() ||
        afterStats.nlink !== 1n ||
        visibleStats.isSymbolicLink() ||
        !visibleStats.isFile() ||
        visibleStats.nlink !== 1n ||
        !sameSettledEntry(proof.identity, after) ||
        !sameSettledEntry(proof.identity, visible)
      ) {
        throw new CheapLfsTrackedPathError(
          'The tracked Cheap LFS prefix changed while it was read.'
        )
      }
      await this.revalidateParents(proof.parents)
      return buffer.subarray(0, result.bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  }

  public async refreshAfterOwnedLinkCleanup(
    proofInput: ICheapLfsTrackedFileProof
  ): Promise<ICheapLfsTrackedFileProof> {
    const proof = this.requireProof(proofInput)
    if (!proof.exists) {
      await this.revalidate(proof)
      return proof
    }
    await this.revalidateParents(proof.parents)
    // Removing an owned link only advances `ctime`/`nlink`; the inode, `mtime`
    // and size still prove the content. On drift, fall back to the full
    // content proof when the proof carries a hash, else fail closed.
    const current = await inspectPathIdentity(proof.absolutePath)
    let identity: IPathIdentity | null =
      proof.identity !== null &&
      sameContentEntry(proof.identity, current.identity)
        ? current.identity
        : null
    if (identity === null && proof.identity !== null && proof.sha256 !== null) {
      const rehashed = await inspectPath(proof.absolutePath)
      if (
        sameEntry(proof.identity, rehashed.identity, false) &&
        proof.sha256 === rehashed.sha256 &&
        proof.sizeInBytes === rehashed.sizeInBytes
      ) {
        identity = rehashed.identity
      }
    }
    if (identity === null) {
      throw new CheapLfsTrackedPathError(
        'The tracked Cheap LFS file changed while its owned upload links were being cleaned.'
      )
    }
    await this.revalidateParents(proof.parents)
    return {
      ...proof,
      identity,
    } as IInternalTrackedProof
  }

  private async sourceProof(
    pathInput: string,
    capture: 'hash' | 'identity' = 'hash'
  ): Promise<IInternalSourceProof> {
    if (
      typeof pathInput !== 'string' ||
      pathInput.length === 0 ||
      pathInput.includes('\u0000') ||
      !isAbsolute(pathInput)
    ) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS requires an absolute regular source file.'
      )
    }
    const requestedPath = resolve(pathInput)
    const requestedParentPath = dirname(requestedPath)
    const requestedParentEntry = await lstat(requestedParentPath, {
      bigint: true,
    })
    if (
      requestedParentEntry.isSymbolicLink() ||
      !requestedParentEntry.isDirectory()
    ) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused a redirected source-directory path.'
      )
    }
    const parentPath = await realpath(requestedParentPath)
    const parentEntry = await lstat(parentPath, { bigint: true })
    if (
      parentEntry.isSymbolicLink() ||
      !parentEntry.isDirectory() ||
      !sameEntry(identity(requestedParentEntry), identity(parentEntry), false)
    ) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused a redirected source directory.'
      )
    }
    const requestedEntry = await lstat(requestedPath, { bigint: true })
    if (requestedEntry.isSymbolicLink() || !requestedEntry.isFile()) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused a redirected external source file.'
      )
    }
    const canonicalPath = await realpath(requestedPath)
    const canonicalEntry = await lstat(canonicalPath, { bigint: true })
    if (
      !samePath(dirname(canonicalPath), parentPath) ||
      canonicalEntry.isSymbolicLink() ||
      !canonicalEntry.isFile() ||
      !sameEntry(identity(requestedEntry), identity(canonicalEntry), false)
    ) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS refused a redirected external source file.'
      )
    }
    const path = canonicalPath
    const inspected =
      capture === 'hash'
        ? await inspectPath(path)
        : { ...(await inspectPathIdentity(path)), sha256: null }
    return {
      owner: this.owner,
      absolutePath: path,
      parent: { path: parentPath, identity: identity(parentEntry) },
      identity: inspected.identity,
      sizeInBytes: inspected.sizeInBytes,
      sha256: inspected.sha256,
    } as IInternalSourceProof
  }

  public async revalidateSource(
    proofInput: ICheapLfsSourceFileProof
  ): Promise<void> {
    await this.revalidateSourceProof(this.requireSource(proofInput), true)
  }

  /**
   * `proveContent` demands that the captured identity be settled, so that an
   * identity match really does stand in for a content re-hash. It is `false`
   * only for the checks that bracket `createOwnedCopy`'s streamed read, where
   * the copy itself *is* the authoritative content proof and the identity is
   * only asked to show that the inode was never swapped.
   */
  private async revalidateSourceProof(
    proof: IInternalSourceProof,
    proveContent: boolean
  ): Promise<void> {
    await this.revalidateParents([proof.parent])
    // The ctime-inclusive identity match proves the proven bytes are still in
    // place without re-reading them; any drift fails closed exactly as the
    // previous full re-hash-and-compare did on an identity mismatch.
    const current = await inspectPathIdentity(proof.absolutePath)
    let matches =
      (proveContent
        ? sameSettledEntry(proof.identity, current.identity)
        : sameEntry(proof.identity, current.identity, true)) &&
      proof.sizeInBytes === current.sizeInBytes
    if (
      !matches &&
      proveContent &&
      !proof.identity.settled &&
      proof.sha256 !== null &&
      sameEntry(proof.identity, current.identity, true) &&
      proof.sizeInBytes === current.sizeInBytes
    ) {
      // Identity intact but captured inside its own modification tick: it
      // cannot rule out a later same-size rewrite, so pay the re-hash.
      const rehashed = await inspectPath(proof.absolutePath)
      matches =
        sameEntry(proof.identity, rehashed.identity, false) &&
        rehashed.sha256 === proof.sha256 &&
        rehashed.sizeInBytes === proof.sizeInBytes
    }
    if (!matches) {
      throw new CheapLfsTrackedPathError(
        'The Cheap LFS source changed during the operation.'
      )
    }
    await this.revalidateParents([proof.parent])
  }

  private async createOwnedCopy(
    source: IInternalSourceProof,
    partSize: number,
    signal?: AbortSignal,
    onProgress?: (processedBytes: number) => void
  ): Promise<{
    readonly owned: IInternalOwnedFile
    readonly hashed: IHashResult
  }> {
    throwIfAborted(signal)
    // Inode-stability only: the streamed copy below is what establishes this
    // upload's content proof, so these brackets are not asked to stand in for a
    // hash that does not exist yet.
    await this.revalidateSourceProof(source, false)
    const directoryPath = await mkdtemp(
      join(tmpdir(), 'desktop-material-cheap-lfs-upload-')
    )
    const directoryEntry = await lstat(directoryPath, { bigint: true })
    const path = join(directoryPath, 'payload')
    let sourceHandle: FileHandle | null = null
    let destinationHandle: FileHandle | null = null
    try {
      sourceHandle = await open(
        source.absolutePath,
        constants.O_RDONLY | NoFollowFlag
      )
      const openedSource = await sourceHandle.stat({ bigint: true })
      if (!sameEntry(source.identity, identity(openedSource), true)) {
        throw new CheapLfsTrackedPathError(
          'The Cheap LFS source changed before its private copy was created.'
        )
      }
      destinationHandle = await open(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          NoFollowFlag,
        0o600
      )
      const hashed = await hashHandle(
        sourceHandle,
        partSize,
        signal,
        destinationHandle,
        onProgress
      )
      await destinationHandle.sync()
      const destinationIdentity = identity(
        await destinationHandle.stat({ bigint: true })
      )
      // A pending (`null`) source hash is proven by this very copy: the
      // identity checks bracketing the streamed read pin the hashed bytes to
      // the proven source inode, and this hash becomes the authoritative
      // content proof for everything published from the copy.
      if (
        (source.sha256 !== null && hashed.sha256 !== source.sha256) ||
        hashed.sizeInBytes !== source.sizeInBytes
      ) {
        throw new CheapLfsTrackedPathError(
          'The Cheap LFS source changed while its private copy was created.'
        )
      }
      await this.revalidateSourceProof(source, false)
      const owned = {
        owner: this.owner,
        path,
        directoryPath,
        directoryIdentity: identity(directoryEntry),
        identity: destinationIdentity,
        sizeInBytes: hashed.sizeInBytes,
        sha256: hashed.sha256,
      } as IInternalOwnedFile
      return { owned, hashed }
    } catch (error) {
      await destinationHandle?.close().catch(() => undefined)
      destinationHandle = null
      await sourceHandle?.close().catch(() => undefined)
      sourceHandle = null
      await unlink(path).catch(() => undefined)
      await rmdir(directoryPath).catch(() => undefined)
      throw error
    } finally {
      await destinationHandle?.close().catch(() => undefined)
      await sourceHandle?.close().catch(() => undefined)
    }
  }

  public async prepareUpload(
    repositoryPath: string,
    relativePath: string,
    sourcePath: string,
    partSize: number,
    signal?: AbortSignal,
    onProgress?: (processedBytes: number) => void
  ): Promise<ICheapLfsVerifiedSourceCopy> {
    // The destination and source are proven by identity only; the single
    // streamed copy below is the one authoritative full-content hash for this
    // upload, and every later revalidation compares against these identities.
    const destination = this.requireProof(
      await this.proveDestinationIdentity(repositoryPath, relativePath)
    )
    let source: IInternalSourceProof
    if (destination.exists && samePath(destination.absolutePath, sourcePath)) {
      source = {
        owner: this.owner,
        absolutePath: destination.absolutePath,
        parent: destination.parents[destination.parents.length - 1],
        identity: destination.identity!,
        sizeInBytes: destination.sizeInBytes,
        sha256: null,
      } as IInternalSourceProof
    } else {
      source = await this.sourceProof(sourcePath, 'identity')
    }
    const copied = await this.createOwnedCopy(
      source,
      partSize,
      signal,
      onProgress
    )
    const provenSource = {
      ...source,
      sha256: copied.hashed.sha256,
    } as IInternalSourceProof
    return {
      destination,
      source: provenSource as unknown as ICheapLfsSourceFileProof,
      owned: copied.owned,
      sha256: copied.hashed.sha256,
      sizeInBytes: copied.hashed.sizeInBytes,
      parts: copied.hashed.parts,
    }
  }

  public async cleanupOwned(ownedInput: ICheapLfsOwnedFile): Promise<void> {
    const owned = this.requireOwned(ownedInput)
    const file = await lstat(owned.path, { bigint: true }).catch(() => null)
    if (file !== null) {
      if (!sameEntry(owned.identity, identity(file), true)) {
        throw new CheapLfsTrackedPathError(
          'A private Cheap LFS upload copy was replaced and was preserved.',
          [owned.path]
        )
      }
      await unlink(owned.path)
    }
    const directory = await lstat(owned.directoryPath, { bigint: true }).catch(
      () => null
    )
    if (directory !== null) {
      if (!sameEntry(owned.directoryIdentity, identity(directory), false)) {
        throw new CheapLfsTrackedPathError(
          'A private Cheap LFS upload directory was replaced and was preserved.',
          [owned.directoryPath]
        )
      }
      await rmdir(owned.directoryPath)
    }
  }

  private async stageReplacement(
    proof: IInternalTrackedProof,
    writer?: (handle: FileHandle) => Promise<void>,
    mode?: number
  ): Promise<{
    readonly directory: string
    readonly directoryIdentity: IPathIdentity
    readonly original: string
    readonly replacement: string | null
    readonly replacementIdentity: IPathIdentity | null
  }> {
    await this.revalidateParents(proof.parents)
    const directory = join(
      dirname(proof.absolutePath),
      cheapLfsSidecarName('recovery')
    )
    await mkdir(directory, { mode: 0o700 })
    const directoryEntry = await lstat(directory, { bigint: true })
    if (directoryEntry.isSymbolicLink() || !directoryEntry.isDirectory()) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS could not create a private recovery directory.'
      )
    }
    const directoryIdentity = identity(directoryEntry)
    try {
      await this.revalidateParents(proof.parents)
    } catch (error) {
      await rmdir(directory).catch(() => undefined)
      throw error
    }
    const original = join(directory, 'original')
    if (writer === undefined) {
      return {
        directory,
        directoryIdentity,
        original,
        replacement: null,
        replacementIdentity: null,
      }
    }
    const replacement = join(directory, 'replacement')
    const handle = await open(
      replacement,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NoFollowFlag,
      mode ?? 0o600
    )
    let closed = false
    try {
      await writer(handle)
      await handle.sync()
      await handle.close()
      closed = true
      // These bytes were written a moment ago, so this identity is settled
      // before it is recorded: an identity captured inside its own modification
      // tick could never prove later that the staged file still holds exactly
      // the bytes this writer produced.
      const staged = await inspectPathIdentity(replacement)
      return {
        directory,
        directoryIdentity,
        original,
        replacement,
        replacementIdentity: staged.identity,
      }
    } catch (error) {
      if (!closed) {
        await handle.close().catch(() => undefined)
      }
      await unlink(replacement).catch(() => undefined)
      await rmdir(directory).catch(() => undefined)
      throw error
    }
  }

  private async restoreWithoutOverwrite(
    original: string,
    target: string,
    recoveryDirectory: string
  ): Promise<never> {
    try {
      await link(original, target)
      await unlink(original)
      throw new CheapLfsTrackedPathError(
        `The Cheap LFS pointer changed or was removed; the current file was left in place. The staged replacement was preserved at ${recoveryDirectory}.`,
        [recoveryDirectory]
      )
    } catch (error) {
      if (error instanceof CheapLfsTrackedPathError) {
        throw error
      }
      throw new CheapLfsTrackedPathError(
        `The tracked Cheap LFS file changed at the mutation boundary. Both files were preserved for recovery at ${recoveryDirectory}.`,
        [recoveryDirectory]
      )
    }
  }

  private async assertRecoveryDirectory(
    staged: Awaited<ReturnType<CheapLfsTrackedPathStore['stageReplacement']>>
  ): Promise<void> {
    const directory = await lstat(staged.directory, { bigint: true }).catch(
      () => null
    )
    if (
      directory === null ||
      directory.isSymbolicLink() ||
      !directory.isDirectory() ||
      !sameEntry(staged.directoryIdentity, identity(directory), false)
    ) {
      throw new CheapLfsTrackedPathError(
        `The private Cheap LFS recovery directory changed and was preserved at ${staged.directory}.`,
        [staged.directory]
      )
    }
  }

  private async discardUnusedStaging(
    staged: Awaited<ReturnType<CheapLfsTrackedPathStore['stageReplacement']>>
  ): Promise<void> {
    if (staged.replacement !== null) {
      const replacement = await lstat(staged.replacement, {
        bigint: true,
      }).catch(() => null)
      if (replacement !== null) {
        if (
          staged.replacementIdentity === null ||
          !sameEntry(staged.replacementIdentity, identity(replacement), true)
        ) {
          throw new CheapLfsTrackedPathError(
            `An unused Cheap LFS staging file changed and was preserved at ${staged.directory}.`,
            [staged.directory]
          )
        }
        await unlink(staged.replacement)
      }
    }
    await this.assertRecoveryDirectory(staged)
    await rmdir(staged.directory)
  }

  private async compareExchange(
    proof: IInternalTrackedProof,
    staged: Awaited<ReturnType<CheapLfsTrackedPathStore['stageReplacement']>>
  ): Promise<void> {
    let quarantined = false
    try {
      await this.hooks.beforeQuarantine?.(proof)
      await this.revalidateParents(proof.parents)
      await this.assertRecoveryDirectory(staged)
      if (proof.exists) {
        // Capture the identity at the last instant before the rename: a full
        // ctime-inclusive match against the proof plus an inode/mtime/size
        // match across the rename proves the quarantined bytes are the proven
        // bytes without re-reading them. On any drift, fall back to the full
        // content proof when the proof carries a hash, else restore.
        let preQuarantine: IPathIdentity | null = null
        try {
          preQuarantine = (await inspectPathIdentity(proof.absolutePath))
            .identity
        } catch {
          preQuarantine = null
        }
        try {
          await rename(proof.absolutePath, staged.original)
          quarantined = true
        } catch (error) {
          if (isFileSystemError(error, 'ENOENT')) {
            throw new CheapLfsTrackedPathError(
              'The tracked Cheap LFS file disappeared before mutation.'
            )
          }
          throw error
        }
        const claimed = await inspectPathIdentity(staged.original)
        let claimMatches =
          proof.identity !== null &&
          preQuarantine !== null &&
          sameSettledEntry(proof.identity, preQuarantine) &&
          sameContentEntry(preQuarantine, claimed.identity)
        if (!claimMatches && proof.identity !== null && proof.sha256 !== null) {
          const rehashed = await inspectPath(staged.original)
          claimMatches =
            sameEntry(proof.identity, rehashed.identity, false) &&
            rehashed.sizeInBytes === proof.sizeInBytes &&
            rehashed.sha256 === proof.sha256
        }
        if (!claimMatches) {
          return this.restoreWithoutOverwrite(
            staged.original,
            proof.absolutePath,
            staged.directory
          )
        }
      } else {
        const occupant = await lstat(proof.absolutePath).catch(error => {
          if (isFileSystemError(error, 'ENOENT')) {
            return null
          }
          throw error
        })
        if (occupant !== null) {
          throw new CheapLfsTrackedPathError(
            'The Cheap LFS destination was created concurrently.',
            [staged.directory]
          )
        }
      }

      if (staged.replacement === null) {
        if (!quarantined) {
          throw new CheapLfsTrackedPathError(
            'Cheap LFS cannot remove a destination that was initially absent.'
          )
        }
        await unlink(staged.original)
        quarantined = false
        await rmdir(staged.directory)
        return
      }

      await this.hooks.beforePublish?.(proof, staged.directory)
      await this.revalidateParents(proof.parents)
      await this.assertRecoveryDirectory(staged)
      try {
        await link(staged.replacement, proof.absolutePath)
      } catch (error) {
        if (isFileSystemError(error, 'EEXIST')) {
          throw new CheapLfsTrackedPathError(
            `Cheap LFS did not overwrite a concurrently created destination. Recovery files were preserved at ${staged.directory}.`,
            [staged.directory]
          )
        }
        throw error
      }
      // The hard link makes the published name and the staged replacement the
      // same inode; proving that (device/inode/birthtime) plus the unchanged
      // staged identity replaces the two full re-hashes: the published bytes
      // are exactly the bytes whose content proof produced the staged file.
      const published = await inspectPathIdentity(proof.absolutePath, 2n)
      const replacement = await inspectPathIdentity(staged.replacement, 2n)
      if (
        staged.replacementIdentity === null ||
        !sameContentEntry(staged.replacementIdentity, replacement.identity) ||
        !sameEntry(published.identity, replacement.identity, false) ||
        published.sizeInBytes !== replacement.sizeInBytes
      ) {
        throw new CheapLfsTrackedPathError(
          `Cheap LFS published an uncertain destination. Recovery files were preserved at ${staged.directory}.`,
          [staged.directory],
          true
        )
      }
      if (quarantined) {
        await unlink(staged.original)
        quarantined = false
      }
      await unlink(staged.replacement)
      const finalDestination = await inspectPathIdentity(proof.absolutePath)
      if (!sameContentEntry(replacement.identity, finalDestination.identity)) {
        throw new CheapLfsTrackedPathError(
          `The Cheap LFS destination changed during cleanup. Recovery metadata remains at ${staged.directory}.`,
          [staged.directory],
          true
        )
      }
      await rmdir(staged.directory)
    } catch (error) {
      if (
        quarantined &&
        !(error instanceof CheapLfsTrackedPathError && error.applied)
      ) {
        const current = await lstat(proof.absolutePath).catch(() => null)
        if (current === null) {
          try {
            await link(staged.original, proof.absolutePath)
            await unlink(staged.original)
            quarantined = false
          } catch {
            // Both identities remain in the surfaced recovery directory.
          }
        }
      }
      if (error instanceof CheapLfsTrackedPathError) {
        if (
          !quarantined &&
          error.recoveryPaths.length === 0 &&
          (await lstat(staged.original).catch(() => null)) === null
        ) {
          await this.discardUnusedStaging(staged)
        }
        throw error
      }
      throw new CheapLfsTrackedPathError(
        `Cheap LFS could not complete its compare-exchange. Recovery files were preserved at ${
          staged.directory
        }. (${String(error)})`,
        [staged.directory]
      )
    }
  }

  /**
   * Consume a caller-owned materialization temp without ever unlinking a path
   * whose captured identity changed. A raced replacement is restored when the
   * original name is free, otherwise the quarantined identity is surfaced.
   */
  private async consumeSource(source: IInternalSourceProof): Promise<void> {
    await this.revalidateSourceProof(source, true)
    const quarantine = join(
      dirname(source.absolutePath),
      cheapLfsSidecarName('consumed')
    )
    try {
      await rename(source.absolutePath, quarantine)
    } catch (error) {
      throw new CheapLfsTrackedPathError(
        `Cheap LFS could not quarantine its verified materialization temp; it was preserved at ${
          source.absolutePath
        }. (${String(error)})`,
        [source.absolutePath]
      )
    }

    let moved: Awaited<ReturnType<typeof inspectPathIdentity>>
    try {
      moved = await inspectPathIdentity(quarantine)
    } catch (error) {
      throw new CheapLfsTrackedPathError(
        `The quarantined Cheap LFS materialization temp could not be verified and was preserved at ${quarantine}. (${String(
          error
        )})`,
        [quarantine]
      )
    }
    // The rename only advances `ctime`; the inode/mtime/size match against the
    // revalidated pre-rename identity proves the quarantined file is still the
    // verified temp, without re-reading a multi-gigabyte payload.
    if (
      !sameContentEntry(source.identity, moved.identity) ||
      source.sizeInBytes !== moved.sizeInBytes
    ) {
      try {
        await link(quarantine, source.absolutePath)
        await unlink(quarantine)
        throw new CheapLfsTrackedPathError(
          'The Cheap LFS materialization temp changed at cleanup and was restored without deleting it.'
        )
      } catch (error) {
        if (
          error instanceof CheapLfsTrackedPathError &&
          error.recoveryPaths.length === 0
        ) {
          throw error
        }
        throw new CheapLfsTrackedPathError(
          `The Cheap LFS materialization temp changed at cleanup; both names were preserved, including ${quarantine}.`,
          [source.absolutePath, quarantine]
        )
      }
    }
    await unlink(quarantine)
  }

  public async publishText(
    proofInput: ICheapLfsTrackedFileProof,
    text: string
  ): Promise<void> {
    const proof = this.requireProof(proofInput)
    const bytes = Buffer.from(text, 'utf8')
    const mode =
      proof.identity === null
        ? 0o600
        : Number(proof.identity.mode & BigInt(0o777))
    const staged = await this.stageReplacement(
      proof,
      async handle => {
        await handle.writeFile(bytes)
      },
      mode
    )
    await this.compareExchange(proof, staged)
  }

  /**
   * Quarantine every original before publishing any replacement. A failure at
   * a later path rolls earlier paths back from their still-private originals;
   * any identity that cannot be restored without overwrite stays surfaced in
   * its recovery directory.
   */
  public async publishTextBatch(
    writes: ReadonlyArray<ICheapLfsTrackedTextWrite>
  ): Promise<void> {
    if (writes.length === 0) {
      return
    }
    const pathKeys = new Set<string>()
    const items = new Array<{
      readonly proof: IInternalTrackedProof
      readonly staged: Awaited<
        ReturnType<CheapLfsTrackedPathStore['stageReplacement']>
      >
      quarantined: boolean
      published: boolean
      preserve: boolean
      completed: boolean
    }>()
    try {
      for (const write of writes) {
        const proof = this.requireProof(write.proof)
        const pathKey =
          process.platform === 'win32'
            ? proof.absolutePath.toLowerCase()
            : proof.absolutePath
        if (pathKeys.has(pathKey)) {
          throw new CheapLfsTrackedPathError(
            'Cheap LFS refused duplicate or case-colliding batch destinations.'
          )
        }
        pathKeys.add(pathKey)
        const mode =
          proof.identity === null
            ? 0o600
            : Number(proof.identity.mode & BigInt(0o777))
        const bytes = Buffer.from(write.text, 'utf8')
        const staged = await this.stageReplacement(
          proof,
          async handle => {
            await handle.writeFile(bytes)
          },
          mode
        )
        items.push({
          proof,
          staged,
          quarantined: false,
          published: false,
          preserve: false,
          completed: false,
        })
      }
      for (const item of items) {
        await this.revalidate(item.proof)
      }
    } catch (error) {
      for (const item of items.reverse()) {
        await this.discardUnusedStaging(item.staged).catch(() => undefined)
      }
      throw error
    }

    const rollback = async (): Promise<ReadonlyArray<string>> => {
      const recoveryPaths = new Array<string>()
      for (const item of [...items].reverse()) {
        if (item.completed) {
          continue
        }
        const { proof, staged } = item
        if (item.published && staged.replacement !== null) {
          try {
            const target = await inspectPath(proof.absolutePath, 2n)
            const replacement = await inspectPath(staged.replacement, 2n)
            if (
              staged.replacementIdentity === null ||
              !sameEntry(
                staged.replacementIdentity,
                replacement.identity,
                false
              ) ||
              target.sha256 !== replacement.sha256 ||
              target.sizeInBytes !== replacement.sizeInBytes
            ) {
              item.preserve = true
            } else {
              await unlink(proof.absolutePath)
              item.published = false
            }
          } catch {
            item.preserve = true
          }
        }
        if (item.quarantined) {
          const occupant = await lstat(proof.absolutePath).catch(error => {
            if (isFileSystemError(error, 'ENOENT')) {
              return null
            }
            throw error
          })
          if (occupant !== null) {
            item.preserve = true
          } else {
            try {
              await link(staged.original, proof.absolutePath)
              await unlink(staged.original)
              item.quarantined = false
            } catch {
              item.preserve = true
            }
          }
        }
        if (!item.preserve && !item.quarantined && !item.published) {
          try {
            await this.discardUnusedStaging(staged)
            continue
          } catch {
            item.preserve = true
          }
        }
        recoveryPaths.push(staged.directory)
      }
      return recoveryPaths
    }

    let applied = false
    try {
      // Claim all original names first. No pointer becomes visible until every
      // member's exact captured identity has been quarantined successfully.
      for (const item of items) {
        const { proof, staged } = item
        await this.hooks.beforeQuarantine?.(proof)
        await this.revalidateParents(proof.parents)
        await this.assertRecoveryDirectory(staged)
        if (proof.exists) {
          // Same identity-first quarantine proof as `compareExchange`: never
          // re-read a multi-gigabyte original when its identity provably
          // matches; fall back to the content proof on drift when available.
          let preQuarantine: IPathIdentity | null = null
          try {
            preQuarantine = (await inspectPathIdentity(proof.absolutePath))
              .identity
          } catch {
            preQuarantine = null
          }
          await rename(proof.absolutePath, staged.original)
          item.quarantined = true
          const claimed = await inspectPathIdentity(staged.original)
          let claimMatches =
            proof.identity !== null &&
            preQuarantine !== null &&
            sameSettledEntry(proof.identity, preQuarantine) &&
            sameContentEntry(preQuarantine, claimed.identity)
          if (
            !claimMatches &&
            proof.identity !== null &&
            proof.sha256 !== null
          ) {
            const rehashed = await inspectPath(staged.original)
            claimMatches =
              sameEntry(proof.identity, rehashed.identity, false) &&
              proof.sha256 === rehashed.sha256 &&
              proof.sizeInBytes === rehashed.sizeInBytes
          }
          if (!claimMatches) {
            item.preserve = true
            throw new CheapLfsTrackedPathError(
              'A tracked Cheap LFS batch member changed at the quarantine boundary.'
            )
          }
        } else {
          const occupant = await lstat(proof.absolutePath).catch(error => {
            if (isFileSystemError(error, 'ENOENT')) {
              return null
            }
            throw error
          })
          if (occupant !== null) {
            item.preserve = true
            throw new CheapLfsTrackedPathError(
              'A Cheap LFS batch destination was created concurrently.'
            )
          }
        }
      }

      for (const item of items) {
        const { proof, staged } = item
        await this.hooks.beforePublish?.(proof, staged.directory)
        await this.revalidateParents(proof.parents)
        await this.assertRecoveryDirectory(staged)
        try {
          await link(staged.replacement!, proof.absolutePath)
        } catch (error) {
          item.preserve = true
          if (isFileSystemError(error, 'EEXIST')) {
            throw new CheapLfsTrackedPathError(
              'Cheap LFS did not overwrite a concurrently created batch destination.'
            )
          }
          throw error
        }
        item.published = true
        applied = true
        const target = await inspectPath(proof.absolutePath, 2n)
        const replacement = await inspectPath(staged.replacement!, 2n)
        if (
          staged.replacementIdentity === null ||
          !sameEntry(staged.replacementIdentity, replacement.identity, false) ||
          target.sha256 !== replacement.sha256 ||
          target.sizeInBytes !== replacement.sizeInBytes
        ) {
          item.preserve = true
          throw new CheapLfsTrackedPathError(
            'Cheap LFS could not prove a published batch destination.',
            [staged.directory],
            true
          )
        }
      }

      for (const item of items) {
        const { proof, staged } = item
        if (item.quarantined) {
          await unlink(staged.original)
          item.quarantined = false
        }
        const replacement = await inspectPath(staged.replacement!, 2n)
        await unlink(staged.replacement!)
        const target = await inspectPath(proof.absolutePath)
        if (
          staged.replacementIdentity === null ||
          target.sha256 !== replacement.sha256 ||
          target.sizeInBytes !== replacement.sizeInBytes
        ) {
          item.preserve = true
          throw new CheapLfsTrackedPathError(
            'A Cheap LFS batch destination changed during final cleanup.',
            [staged.directory],
            true
          )
        }
        item.published = false
        await rmdir(staged.directory)
        item.completed = true
      }
    } catch (error) {
      const recoveryPaths = await rollback()
      throw new CheapLfsTrackedPathError(
        `${
          error instanceof Error ? error.message : String(error)
        } No unproven path was overwritten; unresolved identities were preserved for recovery.`,
        recoveryPaths,
        applied && recoveryPaths.length > 0
      )
    }
  }

  public async replaceFromPath(
    proofInput: ICheapLfsTrackedFileProof,
    sourcePath: string,
    expectedSha256: string,
    expectedSizeInBytes: number,
    signal?: AbortSignal
  ): Promise<void> {
    const proof = this.requireProof(proofInput)
    const source = await this.sourceProof(resolve(sourcePath))
    if (
      source.sha256 !== expectedSha256 ||
      source.sizeInBytes !== expectedSizeInBytes
    ) {
      throw new CheapLfsTrackedPathError(
        'The materialized Cheap LFS source failed its expected integrity proof.'
      )
    }
    const mode =
      proof.identity === null
        ? 0o600
        : Number(proof.identity.mode & BigInt(0o777))

    // The verified temp is operation-owned and normally sits beside the
    // destination, so it is *claimed* into the private staging directory by
    // rename instead of being read and rewritten in full a second time. The
    // sourceProof hash above stays the store's authoritative content proof;
    // every later step revalidates the claimed inode by identity and fails
    // closed on drift. A cross-device source (where rename cannot move the
    // inode) falls back to the original copy-and-verify staging.
    const destinationParent = proof.parents[proof.parents.length - 1]
    const claimByRename =
      destinationParent !== undefined &&
      source.identity.device === destinationParent.identity.device

    let sourceClaimed = false
    let operationError: unknown = null
    try {
      let staged: Awaited<
        ReturnType<CheapLfsTrackedPathStore['stageReplacement']>
      >
      if (claimByRename) {
        throwIfAborted(signal)
        const bare = await this.stageReplacement(proof)
        const replacement = join(bare.directory, 'replacement')
        try {
          const current = await inspectPathIdentity(source.absolutePath)
          if (!sameEntry(source.identity, current.identity, true)) {
            throw new CheapLfsTrackedPathError(
              'The materialized Cheap LFS source changed while staging.'
            )
          }
          await rename(source.absolutePath, replacement)
          sourceClaimed = true
        } catch (error) {
          await rmdir(bare.directory).catch(() => undefined)
          throw error
        }
        try {
          await chmod(replacement, mode)
          const claimed = await inspectPathIdentity(replacement)
          if (!sameContentEntry(source.identity, claimed.identity)) {
            throw new CheapLfsTrackedPathError(
              `The claimed Cheap LFS materialization temp changed while staging and was preserved at ${bare.directory}.`,
              [bare.directory]
            )
          }
          staged = {
            directory: bare.directory,
            directoryIdentity: bare.directoryIdentity,
            original: bare.original,
            replacement,
            replacementIdentity: claimed.identity,
          }
        } catch (error) {
          if (error instanceof CheapLfsTrackedPathError) {
            throw error
          }
          throw new CheapLfsTrackedPathError(
            `Cheap LFS could not stage its claimed materialization temp; it was preserved at ${
              bare.directory
            }. (${String(error)})`,
            [bare.directory]
          )
        }
      } else {
        staged = await this.stageReplacement(
          proof,
          async destination => {
            const input = await open(
              source.absolutePath,
              constants.O_RDONLY | NoFollowFlag
            )
            try {
              const copied = await hashHandle(
                input,
                Number.MAX_SAFE_INTEGER,
                signal,
                destination
              )
              if (
                copied.sha256 !== expectedSha256 ||
                copied.sizeInBytes !== expectedSizeInBytes
              ) {
                throw new CheapLfsTrackedPathError(
                  'The materialized Cheap LFS source changed while staging.'
                )
              }
            } finally {
              await input.close()
            }
            // The copy above just re-hashed the source against its expected
            // digest, so this bracket only has to show the inode never changed.
            await this.revalidateSourceProof(source, false)
          },
          mode
        )
      }
      await this.compareExchange(proof, staged)
    } catch (error) {
      operationError = error
    }

    if (sourceClaimed) {
      // The temp now lives (or lived) inside the staging directory: the
      // compare-exchange either consumed it on success or preserved it under
      // its recovery paths, so there is no free-standing temp to consume.
      if (operationError !== null) {
        throw operationError
      }
      return
    }

    try {
      await this.consumeSource(source)
    } catch (cleanupError) {
      if (operationError === null) {
        throw new CheapLfsTrackedPathError(
          `Cheap LFS materialized the tracked file, but its verified temp could not be safely removed. ${String(
            cleanupError
          )}`,
          cleanupError instanceof CheapLfsTrackedPathError
            ? cleanupError.recoveryPaths
            : [source.absolutePath],
          true
        )
      }
      const operationRecovery =
        operationError instanceof CheapLfsTrackedPathError
          ? operationError.recoveryPaths
          : []
      const cleanupRecovery =
        cleanupError instanceof CheapLfsTrackedPathError
          ? cleanupError.recoveryPaths
          : [source.absolutePath]
      throw new CheapLfsTrackedPathError(
        `Cheap LFS could not replace the tracked file and could not safely clean its verified temp. ${String(
          operationError
        )} ${String(cleanupError)}`,
        [...new Set([...operationRecovery, ...cleanupRecovery])],
        operationError instanceof CheapLfsTrackedPathError &&
          operationError.applied
      )
    }
    if (operationError !== null) {
      throw operationError
    }
  }

  public async remove(proofInput: ICheapLfsTrackedFileProof): Promise<void> {
    const proof = this.requireProof(proofInput)
    if (!proof.exists) {
      throw new CheapLfsTrackedPathError(
        'Cheap LFS cannot remove an initially absent tracked path.'
      )
    }
    const staged = await this.stageReplacement(proof)
    await this.compareExchange(proof, staged)
  }
}

export const defaultCheapLfsTrackedPathStore: ICheapLfsTrackedPathStore =
  new CheapLfsTrackedPathStore()
