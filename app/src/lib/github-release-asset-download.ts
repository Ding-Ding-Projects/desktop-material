import { createHash, randomBytes } from 'crypto'
import { dirname, isAbsolute, join, parse, resolve } from 'path'
import { FileHandle, link, lstat, open, unlink } from 'fs/promises'
import {
  GitHubReleaseAssetMaximumDownloadBytes,
  IGitHubReleaseAsset,
} from './github-releases'

export type GitHubReleaseAssetDownloadFailure =
  | 'destination'
  | 'too-large'
  | 'size-mismatch'
  | 'digest-mismatch'
  | 'missing-body'

export class GitHubReleaseAssetDownloadError extends Error {
  public constructor(
    message: string,
    public readonly kind: GitHubReleaseAssetDownloadFailure
  ) {
    super(message)
    this.name = 'GitHubReleaseAssetDownloadError'
  }
}

export interface IGitHubReleaseAssetDownloadProgress {
  readonly transferredBytes: number
  readonly totalBytes: number
  readonly direction: 'download'
}

export interface IGitHubReleaseAssetDownloadResult {
  readonly path: string
  readonly bytes: number
  readonly localDigest: string
  readonly matchesGitHubDigest: boolean | null
}

function abortError(): Error {
  const error = new Error('Release asset download canceled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw abortError()
  }
}

/** Require an absolute file destination without silently changing its suffix. */
export function normalizeGitHubReleaseAssetDestination(
  destination: string
): string {
  if (
    typeof destination !== 'string' ||
    destination.length === 0 ||
    destination.includes('\u0000') ||
    !isAbsolute(destination)
  ) {
    throw new GitHubReleaseAssetDownloadError(
      'Choose an absolute destination for the release asset.',
      'destination'
    )
  }
  const normalized = resolve(destination)
  const parsed = parse(normalized)
  if (parsed.base.length === 0 || normalized === parsed.root) {
    throw new GitHubReleaseAssetDownloadError(
      'Choose a file destination for the release asset.',
      'destination'
    )
  }
  return normalized
}

function destinationCandidate(destination: string, index: number): string {
  if (index === 1) {
    return destination
  }
  const parsed = parse(destination)
  return join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`)
}

/** Filesystem errors that commonly mean the target volume cannot hard-link. */
const unsupportedHardLinkErrorCodes = new Set([
  'EACCES',
  'EINVAL',
  'ENOSYS',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EPERM',
  'EXDEV',
  'UNKNOWN',
])

function isUnsupportedHardLinkError(error: unknown): boolean {
  return unsupportedHardLinkErrorCodes.has(
    (error as NodeJS.ErrnoException).code ?? ''
  )
}

const fallbackCopyBufferBytes = 1024 * 1024

interface IFileIdentity {
  readonly device: bigint
  readonly inode: bigint
  readonly birthtimeNanoseconds: bigint
}

interface IOwnedPath {
  readonly path: string
  readonly identity: IFileIdentity
}

async function fileIdentity(handle: FileHandle): Promise<IFileIdentity> {
  const stats = await handle.stat({ bigint: true })
  return {
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
  }
}

async function pathStillOwned(owned: IOwnedPath): Promise<boolean> {
  try {
    const stats = await lstat(owned.path, { bigint: true })
    return (
      stats.dev === owned.identity.device &&
      stats.ino === owned.identity.inode &&
      stats.birthtimeNs === owned.identity.birthtimeNanoseconds
    )
  } catch {
    return false
  }
}

async function openOwnedPath(
  path: string
): Promise<{ readonly handle: FileHandle; readonly owned: IOwnedPath } | null> {
  let handle: FileHandle
  try {
    handle = await open(path, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null
    }
    throw error
  }
  try {
    return {
      handle,
      owned: { path, identity: await fileIdentity(handle) },
    }
  } catch (error) {
    // The still-open exclusive handle proves this path was created by us.
    await unlink(path).catch(() => undefined)
    await handle.close().catch(() => undefined)
    throw error
  }
}

/** Remove a path only while it still identifies the file created by us. */
async function unlinkOwnedPath(owned: IOwnedPath): Promise<void> {
  if (await pathStillOwned(owned)) {
    await unlink(owned.path).catch(() => undefined)
  }
}

async function createPartialFile(destination: string): Promise<{
  readonly path: string
  readonly handle: FileHandle
}> {
  const directory = dirname(destination)
  const base = parse(destination).base
  for (let attempt = 0; attempt < 10; attempt++) {
    const path = join(
      directory,
      `.${base}.${randomBytes(8).toString('hex')}.partial`
    )
    try {
      return { path, handle: await open(path, 'wx') }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new GitHubReleaseAssetDownloadError(
          'The temporary release asset could not be created at the selected destination.',
          'destination'
        )
      }
    }
  }
  throw new GitHubReleaseAssetDownloadError(
    'Could not create a unique temporary release asset file.',
    'destination'
  )
}

async function writeAll(handle: FileHandle, bytes: Uint8Array) {
  let offset = 0
  while (offset < bytes.byteLength) {
    let written: number
    try {
      written = (
        await handle.write(bytes, offset, bytes.byteLength - offset, null)
      ).bytesWritten
    } catch {
      throw new GitHubReleaseAssetDownloadError(
        'The release asset could not be written at the selected destination.',
        'destination'
      )
    }
    if (written <= 0) {
      throw new GitHubReleaseAssetDownloadError(
        'The release asset could not be written at the selected destination.',
        'destination'
      )
    }
    offset += written
  }
}

/**
 * Claim a final name without replacement and copy the verified partial into
 * that owned file using bounded memory. Keeping the exclusive-create handle
 * removes the reserve/check/rename race: no later operation can overwrite a
 * path another process substituted for our file.
 */
async function publishFallbackCopyWithoutOverwrite(
  partialPath: string,
  candidate: string,
  signal: AbortSignal
): Promise<IOwnedPath | null> {
  const created = await openOwnedPath(candidate)
  if (created === null) {
    return null
  }

  const { handle: destinationHandle, owned } = created
  let sourceHandle: FileHandle | null = null
  try {
    sourceHandle = await open(partialPath, 'r')
    const buffer = Buffer.allocUnsafe(fallbackCopyBufferBytes)
    let position = 0
    while (true) {
      throwIfAborted(signal)
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.byteLength,
        position
      )
      if (bytesRead === 0) {
        break
      }
      await writeAll(destinationHandle, buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    await destinationHandle.sync()
    throwIfAborted(signal)

    // On file systems which permit unlink/replacement while a handle remains
    // open, fail closed if the visible name no longer identifies our file.
    if (!(await pathStillOwned(owned))) {
      throw new GitHubReleaseAssetDownloadError(
        'The release asset destination changed before it could be published.',
        'destination'
      )
    }
    return owned
  } catch (error) {
    await unlinkOwnedPath(owned)
    throw error
  } finally {
    await sourceHandle?.close().catch(() => undefined)
    await destinationHandle.close().catch(() => undefined)
  }
}

async function publishWithoutOverwrite(
  partialPath: string,
  destination: string,
  signal: AbortSignal
): Promise<string> {
  let published: IOwnedPath | null = null
  try {
    const partialStats = await lstat(partialPath, { bigint: true })
    const partialIdentity = {
      device: partialStats.dev,
      inode: partialStats.ino,
      birthtimeNanoseconds: partialStats.birthtimeNs,
    }
    let fallbackIndex: number | null = null
    for (let index = 1; index <= 1000; index++) {
      const candidate = destinationCandidate(destination, index)
      try {
        // A same-directory hard link claims the name atomically and never
        // replaces a file that another process published first.
        await link(partialPath, candidate)
        published = { path: candidate, identity: partialIdentity }
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
          continue
        }
        if (!isUnsupportedHardLinkError(error)) {
          throw new GitHubReleaseAssetDownloadError(
            'The release asset could not be published at the selected destination.',
            'destination'
          )
        }
        fallbackIndex = index
        break
      }
    }

    if (published === null && fallbackIndex !== null) {
      for (let index = fallbackIndex; index <= 1000; index++) {
        const candidate = destinationCandidate(destination, index)
        try {
          published = await publishFallbackCopyWithoutOverwrite(
            partialPath,
            candidate,
            signal
          )
        } catch (error) {
          if (
            (error as Error).name === 'AbortError' ||
            error instanceof GitHubReleaseAssetDownloadError
          ) {
            throw error
          }
          throw new GitHubReleaseAssetDownloadError(
            'The release asset could not be published at the selected destination.',
            'destination'
          )
        }
        if (published === null) {
          continue
        }
        break
      }
    }

    if (published === null) {
      throw new GitHubReleaseAssetDownloadError(
        'Too many files already use this release asset name.',
        'destination'
      )
    }
    throwIfAborted(signal)
    await unlink(partialPath)
    throwIfAborted(signal)
    const completed = published.path
    published = null
    return completed
  } catch (error) {
    if (published !== null) {
      await unlinkOwnedPath(published)
    }
    throw error
  }
}

function advertisedLength(response: Response): number | null {
  const value = response.headers.get('content-length')
  if (value === null) {
    return null
  }
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new GitHubReleaseAssetDownloadError(
      'GitHub returned an invalid release asset size.',
      'size-mismatch'
    )
  }
  return Number(value)
}

/** Stream, hash, verify, and atomically publish one exact release asset. */
export async function downloadGitHubReleaseAsset(
  asset: IGitHubReleaseAsset,
  response: Response,
  destination: string,
  signal: AbortSignal,
  onProgress?: (progress: IGitHubReleaseAssetDownloadProgress) => void
): Promise<IGitHubReleaseAssetDownloadResult> {
  let target: string
  try {
    throwIfAborted(signal)
    if (asset.sizeInBytes > GitHubReleaseAssetMaximumDownloadBytes) {
      throw new GitHubReleaseAssetDownloadError(
        'This release asset exceeds the app’s 5 GiB safety limit.',
        'too-large'
      )
    }
    const length = advertisedLength(response)
    if (
      length !== null &&
      (length > GitHubReleaseAssetMaximumDownloadBytes ||
        length !== asset.sizeInBytes)
    ) {
      throw new GitHubReleaseAssetDownloadError(
        'GitHub’s release asset size does not match the response.',
        length > GitHubReleaseAssetMaximumDownloadBytes
          ? 'too-large'
          : 'size-mismatch'
      )
    }
    if (response.body === null && asset.sizeInBytes !== 0) {
      throw new GitHubReleaseAssetDownloadError(
        'GitHub returned the release asset without content.',
        'missing-body'
      )
    }
    target = normalizeGitHubReleaseAssetDestination(destination)
  } catch (error) {
    await response.body?.cancel().catch(() => undefined)
    throw error
  }

  const reader = response.body?.getReader() ?? null
  const partial = await createPartialFile(target).catch(async error => {
    await reader?.cancel().catch(() => undefined)
    reader?.releaseLock()
    throw error
  })
  let openHandle: FileHandle | null = partial.handle
  const hash = createHash('sha256')
  let transferredBytes = 0
  const cancelReader = () => reader?.cancel(abortError()).catch(() => undefined)
  signal.addEventListener('abort', cancelReader, { once: true })
  try {
    onProgress?.({
      transferredBytes,
      totalBytes: asset.sizeInBytes,
      direction: 'download',
    })
    if (reader !== null) {
      while (true) {
        throwIfAborted(signal)
        const next = await reader.read()
        throwIfAborted(signal)
        if (next.done) {
          break
        }
        transferredBytes += next.value.byteLength
        if (
          transferredBytes > asset.sizeInBytes ||
          transferredBytes > GitHubReleaseAssetMaximumDownloadBytes
        ) {
          throw new GitHubReleaseAssetDownloadError(
            'The downloaded release asset exceeded its advertised size.',
            'size-mismatch'
          )
        }
        hash.update(next.value)
        await writeAll(partial.handle, next.value)
        onProgress?.({
          transferredBytes,
          totalBytes: asset.sizeInBytes,
          direction: 'download',
        })
      }
    }
    if (transferredBytes !== asset.sizeInBytes) {
      throw new GitHubReleaseAssetDownloadError(
        'The downloaded release asset was incomplete.',
        'size-mismatch'
      )
    }
    const localDigest = `sha256:${hash.digest('hex')}`
    const matchesGitHubDigest =
      asset.digest === null ? null : asset.digest === localDigest
    if (matchesGitHubDigest === false) {
      throw new GitHubReleaseAssetDownloadError(
        'The release asset digest does not match GitHub’s digest.',
        'digest-mismatch'
      )
    }
    await partial.handle.sync()
    await partial.handle.close()
    openHandle = null
    throwIfAborted(signal)
    return {
      path: await publishWithoutOverwrite(partial.path, target, signal),
      bytes: transferredBytes,
      localDigest,
      matchesGitHubDigest,
    }
  } catch (error) {
    await reader?.cancel().catch(() => undefined)
    await openHandle?.close().catch(() => undefined)
    await unlink(partial.path).catch(() => undefined)
    if (signal.aborted && (error as Error)?.name !== 'AbortError') {
      throw abortError()
    }
    throw error
  } finally {
    signal.removeEventListener('abort', cancelReader)
    reader?.releaseLock()
  }
}
