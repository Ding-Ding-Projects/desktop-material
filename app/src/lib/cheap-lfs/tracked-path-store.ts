import { constants } from 'fs'
import type { BigIntStats } from 'fs'
import { createHash, randomUUID } from 'crypto'
import {
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
} from 'fs/promises'
import { tmpdir } from 'os'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'path'
import { validateCheapLfsTrackedPath } from './pointer'

const NoFollowFlag = constants.O_NOFOLLOW ?? 0
const CopyBufferBytes = 1024 * 1024

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
  proveManagedPath(
    repositoryPath: string,
    relativePath: string,
    exactAllowedPath: string
  ): Promise<ICheapLfsTrackedFileProof>
  readText(
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

interface IInternalSourceProof extends ICheapLfsSourceFileProof {
  readonly owner: object
  readonly parent: IParentProof
  readonly identity: IPathIdentity
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

function identity(stats: BigIntStats): IPathIdentity {
  return {
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
    changeTimeNanoseconds: stats.ctimeNs,
    modificationTimeNanoseconds: stats.mtimeNs,
    sizeInBytes: stats.size,
    links: stats.nlink,
    mode: stats.mode,
  }
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
    return { handle, identity: identity(opened) }
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
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
    const candidate = proof as IInternalSourceProof
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
    requireExisting: boolean
  ): Promise<IInternalTrackedProof> {
    await this.revalidateParents(location.parents)
    let inspected: Awaited<ReturnType<typeof inspectPath>> | null = null
    try {
      inspected = await inspectPath(location.absolutePath)
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
    let current: Awaited<ReturnType<typeof inspectPath>> | null = null
    try {
      current = await inspectPath(proof.absolutePath)
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
    if (
      current === null ||
      proof.identity === null ||
      !sameEntry(proof.identity, current.identity, true) ||
      current.sizeInBytes !== proof.sizeInBytes ||
      current.sha256 !== proof.sha256
    ) {
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

  public async refreshAfterOwnedLinkCleanup(
    proofInput: ICheapLfsTrackedFileProof
  ): Promise<ICheapLfsTrackedFileProof> {
    const proof = this.requireProof(proofInput)
    if (!proof.exists) {
      await this.revalidate(proof)
      return proof
    }
    await this.revalidateParents(proof.parents)
    const current = await inspectPath(proof.absolutePath)
    if (
      proof.identity === null ||
      !sameEntry(proof.identity, current.identity, false) ||
      proof.sha256 !== current.sha256 ||
      proof.sizeInBytes !== current.sizeInBytes
    ) {
      throw new CheapLfsTrackedPathError(
        'The tracked Cheap LFS file changed while its owned upload links were being cleaned.'
      )
    }
    await this.revalidateParents(proof.parents)
    return {
      ...proof,
      identity: current.identity,
    } as IInternalTrackedProof
  }

  private async sourceProof(pathInput: string): Promise<IInternalSourceProof> {
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
    const inspected = await inspectPath(path)
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
    const proof = this.requireSource(proofInput)
    await this.revalidateParents([proof.parent])
    const current = await inspectPath(proof.absolutePath)
    if (
      !sameEntry(proof.identity, current.identity, true) ||
      proof.sizeInBytes !== current.sizeInBytes ||
      proof.sha256 !== current.sha256
    ) {
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
    await this.revalidateSource(source)
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
      if (
        hashed.sha256 !== source.sha256 ||
        hashed.sizeInBytes !== source.sizeInBytes
      ) {
        throw new CheapLfsTrackedPathError(
          'The Cheap LFS source changed while its private copy was created.'
        )
      }
      await this.revalidateSource(source)
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
    const destination = this.requireProof(
      await this.proveDestination(repositoryPath, relativePath)
    )
    let source: IInternalSourceProof
    if (destination.exists && samePath(destination.absolutePath, sourcePath)) {
      source = {
        owner: this.owner,
        absolutePath: destination.absolutePath,
        parent: destination.parents[destination.parents.length - 1],
        identity: destination.identity!,
        sizeInBytes: destination.sizeInBytes,
        sha256: destination.sha256!,
      } as IInternalSourceProof
    } else {
      source = await this.sourceProof(sourcePath)
    }
    const copied = await this.createOwnedCopy(
      source,
      partSize,
      signal,
      onProgress
    )
    return {
      destination,
      source,
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
      `.${basename(proof.absolutePath)}.cheap-lfs-recovery-${
        process.pid
      }-${randomUUID()}`
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
    try {
      await writer(handle)
      await handle.sync()
      return {
        directory,
        directoryIdentity,
        original,
        replacement,
        replacementIdentity: identity(await handle.stat({ bigint: true })),
      }
    } catch (error) {
      await handle.close().catch(() => undefined)
      await unlink(replacement).catch(() => undefined)
      await rmdir(directory).catch(() => undefined)
      throw error
    } finally {
      await handle.close().catch(() => undefined)
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
        const claimed = await inspectPath(staged.original)
        if (
          proof.identity === null ||
          !sameEntry(proof.identity, claimed.identity, false) ||
          claimed.sizeInBytes !== proof.sizeInBytes ||
          claimed.sha256 !== proof.sha256
        ) {
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
      const published = await inspectPath(proof.absolutePath, 2n)
      const replacement = await inspectPath(staged.replacement, 2n)
      if (
        staged.replacementIdentity === null ||
        !sameEntry(staged.replacementIdentity, replacement.identity, false) ||
        published.sha256 !== replacement.sha256 ||
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
      const finalDestination = await inspectPath(proof.absolutePath)
      if (
        finalDestination.sha256 !== replacement.sha256 ||
        finalDestination.sizeInBytes !== replacement.sizeInBytes
      ) {
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
    await this.revalidateSource(source)
    const quarantine = join(
      dirname(source.absolutePath),
      `.${basename(source.absolutePath)}.cheap-lfs-consumed-${
        process.pid
      }-${randomUUID()}`
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

    let moved: Awaited<ReturnType<typeof inspectPath>>
    try {
      moved = await inspectPath(quarantine)
    } catch (error) {
      throw new CheapLfsTrackedPathError(
        `The quarantined Cheap LFS materialization temp could not be verified and was preserved at ${quarantine}. (${String(
          error
        )})`,
        [quarantine]
      )
    }
    if (
      !sameEntry(source.identity, moved.identity, false) ||
      source.sha256 !== moved.sha256 ||
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
          await rename(proof.absolutePath, staged.original)
          item.quarantined = true
          const claimed = await inspectPath(staged.original)
          if (
            proof.identity === null ||
            !sameEntry(proof.identity, claimed.identity, false) ||
            proof.sha256 !== claimed.sha256 ||
            proof.sizeInBytes !== claimed.sizeInBytes
          ) {
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
    let operationError: unknown = null
    try {
      const staged = await this.stageReplacement(
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
          await this.revalidateSource(source)
        },
        mode
      )
      await this.compareExchange(proof, staged)
    } catch (error) {
      operationError = error
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
