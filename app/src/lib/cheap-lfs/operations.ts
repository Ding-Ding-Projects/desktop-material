import { createHash, randomBytes } from 'crypto'
import { createReadStream } from 'fs'
import { open, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import {
  GitHubReleaseAssetMaximumUploadBytes,
  IGitHubRelease,
  IGitHubReleaseAsset,
  IGitHubReleaseDraft,
  normalizeGitHubReleaseAssetName,
} from '../github-releases'
import { IGitHubReleaseTransferProgressEvent } from '../github-release-transfer'
import {
  getGitHubReleasesAccount,
  GitHubReleasesError,
  IGitHubReleaseMutationReview,
} from '../stores/github-releases-store'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  isCheapLfsPointerText,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
  validateCheapLfsTrackedPath,
} from './pointer'

/**
 * Orchestration for the cheap-LFS flow: hashing a working-tree file, uploading
 * it as a GitHub Release asset, writing the committed pointer, and later
 * materializing the pointer back into the real bytes with end-to-end
 * verification. Every side effect (release CRUD, transfers, disk access) is
 * injected so the flow is unit-testable without a network or a real account,
 * while the exported defaults wire up the real implementations.
 */

/** Cap on files inspected while listing pointers, keeping the walk bounded. */
const CheapLfsMaximumWalkEntries = 4000
/** Depth cap for the pointer-listing walk. */
const CheapLfsMaximumWalkDepth = 8
/** Cap on pointers returned by {@link listCheapLfsPointers}. */
const CheapLfsMaximumPointerEntries = 256
/** Only the first bytes of a file are read to classify it as a pointer. */
const CheapLfsSniffBytes = 4096
/** Directories skipped by the pointer-listing walk. */
const CheapLfsSkipDirectories = new Set([
  '.git',
  'node_modules',
  'vendor',
  'target',
  'dist',
  'out',
  'build',
  '.venv',
  '__pycache__',
])

function abortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/** A file that looked like a pointer during a bounded working-tree scan. */
export interface ICheapLfsPointerCandidate {
  readonly relativePath: string
  readonly text: string
}

/** One resolved pointer discovered by {@link listCheapLfsPointers}. */
export interface ICheapLfsPointerEntry {
  readonly relativePath: string
  readonly pointer: ICheapLfsPointer
}

/**
 * The subset of the `GitHubReleasesStore` the cheap-LFS flow depends on.
 * `GitHubReleasesStore` satisfies this structurally, and tests inject a store
 * built from fake transfer dependencies.
 */
export interface ICheapLfsReleasesGateway {
  getReleaseByTag(
    repository: Repository,
    tag: string,
    signal?: AbortSignal
  ): Promise<IGitHubRelease | null>
  createDraft(
    repository: Repository,
    draft: IGitHubReleaseDraft,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  createMutationReview(
    repository: Repository,
    release: IGitHubRelease,
    asset?: IGitHubReleaseAsset | null
  ): IGitHubReleaseMutationReview
  uploadAsset(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    sourcePath: string,
    name: string,
    label: string | null,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void
  ): Promise<{ readonly asset: IGitHubReleaseAsset; readonly bytes: number }>
  downloadAsset(
    repository: Repository,
    releaseId: number,
    asset: IGitHubReleaseAsset,
    destination: string,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void
  ): Promise<{ readonly path: string; readonly bytes: number }>
}

/** Injectable disk seam so the flow can run against fakes or the real OS. */
export interface ICheapLfsFileSystem {
  hashFile(
    path: string,
    signal?: AbortSignal
  ): Promise<{ readonly sha256: string; readonly sizeInBytes: number }>
  statSize(path: string): Promise<number>
  readPointerText(path: string): Promise<string>
  writePointer(path: string, text: string): Promise<void>
  replaceFile(from: string, to: string): Promise<void>
  removeFile(path: string): Promise<void>
  temporaryPathFor(path: string): string
  scanPointerCandidates(
    root: string
  ): Promise<ReadonlyArray<ICheapLfsPointerCandidate>>
}

export interface ICheapLfsPinOptions {
  readonly absoluteFilePath: string
  readonly trackedRelativePath: string
  readonly releaseTag: string
  readonly releaseName?: string
  readonly targetCommitish?: string
}

export interface ICheapLfsPinResult {
  readonly pointer: ICheapLfsPointer
  readonly asset: IGitHubReleaseAsset
  readonly releaseId: number
}

export interface ICheapLfsMaterializeResult {
  readonly path: string
  readonly bytes: number
}

/**
 * Stream a file through a SHA-256 hash without buffering it, returning the
 * lowercase hex digest and the exact byte size. The download side streams, so
 * hashing streams too — a multi-gigabyte pin must never be read into memory.
 */
export function hashFileSha256(
  path: string,
  signal?: AbortSignal
): Promise<{ readonly sha256: string; readonly sizeInBytes: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError('Cheap LFS hashing canceled.'))
      return
    }
    const hash = createHash('sha256')
    let sizeInBytes = 0
    const stream = createReadStream(path)
    const onAbort = () =>
      stream.destroy(abortError('Cheap LFS hashing canceled.'))
    signal?.addEventListener('abort', onAbort, { once: true })
    stream.on('data', chunk => {
      sizeInBytes += chunk.length
      hash.update(chunk)
    })
    stream.once('error', error => {
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    stream.once('end', () => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ sha256: hash.digest('hex'), sizeInBytes })
    })
  })
}

async function readBoundedText(
  path: string,
  maximumBytes: number
): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(maximumBytes)
    const { bytesRead } = await handle.read(buffer, 0, maximumBytes, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function scanPointerCandidatesFromDisk(
  root: string
): Promise<ReadonlyArray<ICheapLfsPointerCandidate>> {
  const candidates = new Array<ICheapLfsPointerCandidate>()
  const queue: Array<{ dir: string; depth: number; rel: string }> = [
    { dir: root, depth: 0, rel: '' },
  ]
  let entryCount = 0

  while (queue.length > 0 && entryCount < CheapLfsMaximumWalkEntries) {
    const { dir, depth, rel } = queue.shift()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (
        entryCount >= CheapLfsMaximumWalkEntries ||
        candidates.length >= CheapLfsMaximumPointerEntries
      ) {
        break
      }
      entryCount++
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (
          !CheapLfsSkipDirectories.has(entry.name) &&
          depth < CheapLfsMaximumWalkDepth
        ) {
          queue.push({
            dir: join(dir, entry.name),
            depth: depth + 1,
            rel: relPath,
          })
        }
      } else if (entry.isFile()) {
        let text: string
        try {
          text = await readBoundedText(
            join(dir, entry.name),
            CheapLfsSniffBytes
          )
        } catch {
          continue
        }
        if (isCheapLfsPointerText(text)) {
          candidates.push({ relativePath: relPath, text })
        }
      }
    }
  }
  return candidates
}

/** The real-OS disk seam used unless a caller injects a fake. */
export const defaultCheapLfsFileSystem: ICheapLfsFileSystem = {
  hashFile: hashFileSha256,
  statSize: async path => (await stat(path)).size,
  readPointerText: path => readBoundedText(path, CheapLfsSniffBytes),
  // Written with the pointer's own `\n` bytes; never routed through the
  // autocrlf-aware .gitignore writer so the committed pointer is byte-stable.
  writePointer: (path, text) => writeFile(path, text, 'utf8'),
  replaceFile: (from, to) => rename(from, to),
  removeFile: async path => {
    await unlink(path).catch(() => undefined)
  },
  temporaryPathFor: path =>
    `${path}.cheeplfs-${randomBytes(8).toString('hex')}.tmp`,
  scanPointerCandidates: scanPointerCandidatesFromDisk,
}

function ensureReleasesAccount(repository: Repository, account: Account): void {
  if (getGitHubReleasesAccount(repository, [account]) === null) {
    throw new GitHubReleasesError(
      'authentication',
      'Sign in with the account selected for this repository to use cheap LFS.'
    )
  }
}

/** Append a short content hash before the extension to dodge a name clash. */
function dedupeAssetName(
  name: string,
  assets: ReadonlyArray<IGitHubReleaseAsset>,
  sha256: string
): string {
  if (!assets.some(asset => asset.name === name)) {
    return name
  }
  const short = sha256.slice(0, 7)
  const dot = name.lastIndexOf('.')
  const deduped =
    dot <= 0
      ? `${name}-${short}`
      : `${name.slice(0, dot)}-${short}${name.slice(dot)}`
  return normalizeGitHubReleaseAssetName(deduped)
}

/**
 * Upload a working-tree file to a release asset and replace it with a pointer.
 *
 * Validates the tracked path and the 128 MiB upload cap before hashing (uploads
 * are buffered in the main process, so oversized files are rejected up front),
 * finds or creates the release for `releaseTag`, uploads the asset under a name
 * derived from the file's basename (deduped with a short hash if the release
 * already has one), and writes the serialized pointer in place.
 */
export async function pinFileToRelease(
  releases: ICheapLfsReleasesGateway,
  repository: Repository,
  account: Account,
  options: ICheapLfsPinOptions,
  signal?: AbortSignal,
  onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void,
  fs: ICheapLfsFileSystem = defaultCheapLfsFileSystem
): Promise<ICheapLfsPinResult> {
  const trackedRelativePath = validateCheapLfsTrackedPath(
    options.trackedRelativePath
  )
  if (trackedRelativePath === null) {
    throw new Error(
      'Choose a safe repository-relative path without parent traversal or Git metadata to track with cheap LFS.'
    )
  }
  ensureReleasesAccount(repository, account)

  const sizeInBytes = await fs.statSize(options.absoluteFilePath)
  if (sizeInBytes > GitHubReleaseAssetMaximumUploadBytes) {
    throw new Error(
      'This file is larger than the 128 MiB cheap LFS upload limit. Store it another way.'
    )
  }

  const hashed = await fs.hashFile(options.absoluteFilePath, signal)
  const existing = await releases.getReleaseByTag(
    repository,
    options.releaseTag,
    signal
  )
  const release =
    existing ??
    (await releases.createDraft(
      repository,
      {
        tagName: options.releaseTag,
        targetCommitish: options.targetCommitish ?? 'main',
        name: options.releaseName ?? options.releaseTag,
        body: '',
        prerelease: false,
      },
      signal
    ))

  const assetName = dedupeAssetName(
    normalizeGitHubReleaseAssetName(basename(options.absoluteFilePath)),
    release.assets,
    hashed.sha256
  )
  const review = releases.createMutationReview(repository, release)
  const upload = await releases.uploadAsset(
    repository,
    review,
    options.absoluteFilePath,
    assetName,
    null,
    signal ?? new AbortController().signal,
    onProgress
  )

  const pointer: ICheapLfsPointer = {
    version: CHEAP_LFS_POINTER_VERSION,
    releaseTag: options.releaseTag,
    assetName,
    sizeInBytes: hashed.sizeInBytes,
    sha256: hashed.sha256,
  }
  await fs.writePointer(
    join(repository.path, trackedRelativePath),
    serializeCheapLfsPointer(pointer)
  )

  return { pointer, asset: upload.asset, releaseId: release.id }
}

/**
 * Replace a committed pointer with its real bytes.
 *
 * Parses the pointer, finds the release and asset it names, downloads to a
 * same-volume sibling temp path (the download side refuses to overwrite, so it
 * must land on a fresh name), re-hashes the downloaded bytes, and only when the
 * streamed SHA-256 and byte size both match the pointer does it atomically
 * rename the temp file over the tracked path. Any failure deletes the temp file
 * and leaves the original pointer untouched.
 */
export async function materializePointer(
  releases: ICheapLfsReleasesGateway,
  repository: Repository,
  account: Account,
  trackedRelativePath: string,
  signal?: AbortSignal,
  onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void,
  fs: ICheapLfsFileSystem = defaultCheapLfsFileSystem
): Promise<ICheapLfsMaterializeResult> {
  const relativePath = validateCheapLfsTrackedPath(trackedRelativePath)
  if (relativePath === null) {
    throw new Error(
      'Choose a safe repository-relative path without parent traversal or Git metadata to materialize.'
    )
  }
  ensureReleasesAccount(repository, account)

  const trackedPath = join(repository.path, relativePath)
  const pointer = parseCheapLfsPointer(await fs.readPointerText(trackedPath))
  if (pointer === null) {
    throw new Error('This file is not a cheap LFS pointer.')
  }

  const release = await releases.getReleaseByTag(
    repository,
    pointer.releaseTag,
    signal
  )
  if (release === null) {
    throw new Error(
      `No release tagged “${pointer.releaseTag}” holds this pointer's asset.`
    )
  }
  const asset =
    release.assets.find(candidate => candidate.name === pointer.assetName) ??
    null
  if (asset === null) {
    throw new Error(
      `Release “${pointer.releaseTag}” has no asset named “${pointer.assetName}”.`
    )
  }

  const temporaryPath = fs.temporaryPathFor(trackedPath)
  const download = await releases.downloadAsset(
    repository,
    release.id,
    asset,
    temporaryPath,
    signal ?? new AbortController().signal,
    onProgress
  )

  try {
    const verified = await fs.hashFile(download.path, signal)
    if (
      verified.sha256 !== pointer.sha256 ||
      verified.sizeInBytes !== pointer.sizeInBytes
    ) {
      throw new Error(
        'The downloaded asset does not match the cheap LFS pointer. The pointer was left in place.'
      )
    }
    await fs.replaceFile(download.path, trackedPath)
    return { path: trackedPath, bytes: verified.sizeInBytes }
  } catch (error) {
    await fs.removeFile(download.path)
    throw error
  }
}

/**
 * List the committed pointers in a repository's working tree. The scan is
 * bounded (skips `.git`/`node_modules` and other heavy directories, caps the
 * entries walked and the pointers returned) and only sniffs each file's first
 * {@link CheapLfsSniffBytes} bytes, so it stays cheap even on large trees.
 */
export async function listCheapLfsPointers(
  repository: Repository,
  fs: ICheapLfsFileSystem = defaultCheapLfsFileSystem
): Promise<ReadonlyArray<ICheapLfsPointerEntry>> {
  const candidates = await fs.scanPointerCandidates(repository.path)
  const entries = new Array<ICheapLfsPointerEntry>()
  for (const candidate of candidates) {
    const pointer = parseCheapLfsPointer(candidate.text)
    if (pointer !== null) {
      entries.push({ relativePath: candidate.relativePath, pointer })
    }
  }
  return entries
}
