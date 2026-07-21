import { randomBytes } from 'crypto'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rmdir,
  statfs,
  symlink,
  unlink,
} from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join, resolve } from 'path'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { getHTMLURL } from '../api'
import {
  GitHubReleaseAssetMaximumCount,
  GitHubReleaseAssetMaximumPages,
  IGitHubRelease,
  IGitHubReleaseAsset,
  isUploadedGitHubReleaseAsset,
} from '../github-releases'
import {
  CheapLfsAutoPinPhase,
  defaultCheapLfsFileSystem,
  ICheapLfsAutoPinnedFile,
  ICheapLfsFileSystem,
  ICheapLfsFileProgress,
  ICheapLfsManualAssetPlan,
  ICheapLfsManualPinPlan,
  ICheapLfsManualReleasesGateway,
  ICheapLfsPinOptions,
  planCheapLfsManualUpload,
} from './operations'

const ManualUploadCopyBufferBytes = 1024 * 1024
const ManualUploadFreeSpaceReserveBytes = 64 * 1024 * 1024
const ManualUploadProgressReportIntervalMs = 250
const DefaultManualUploadPollAttempts = 720
const DefaultManualUploadPollIntervalMs = 5000
const DefaultManualUploadMaximumPollIntervalMs = 30000

function manualAbortError(): Error {
  const error = new Error('The manual cheap LFS upload was canceled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw manualAbortError()
  }
}

type OwnedPathKind = 'directory' | 'entry'

interface IOwnedPathIdentity {
  readonly path: string
  readonly kind: OwnedPathKind
  readonly device: number
  readonly inode: number
  readonly birthtimeMs: number
  readonly isDirectory: boolean
  readonly isSymbolicLink: boolean
}

async function captureOwnedPath(
  path: string,
  kind: OwnedPathKind
): Promise<IOwnedPathIdentity> {
  const value = await lstat(path)
  return {
    path,
    kind,
    device: value.dev,
    inode: value.ino,
    birthtimeMs: value.birthtimeMs,
    isDirectory: value.isDirectory(),
    isSymbolicLink: value.isSymbolicLink(),
  }
}

async function stillOwnsPath(identity: IOwnedPathIdentity): Promise<boolean> {
  try {
    const current = await lstat(identity.path)
    return (
      current.dev === identity.device &&
      current.ino === identity.inode &&
      current.birthtimeMs === identity.birthtimeMs &&
      current.isDirectory() === identity.isDirectory &&
      current.isSymbolicLink() === identity.isSymbolicLink
    )
  } catch {
    return false
  }
}

async function removeOwnedPath(identity: IOwnedPathIdentity): Promise<void> {
  if (!(await stillOwnsPath(identity))) {
    return
  }
  if (identity.kind === 'directory') {
    await rmdir(identity.path).catch(() => undefined)
  } else {
    await unlink(identity.path).catch(() => undefined)
  }
}

async function writeExclusiveText(path: string, text: string): Promise<void> {
  const file = await open(path, 'wx')
  try {
    await file.writeFile(text, 'utf8')
    await file.sync()
  } finally {
    await file.close()
  }
}

async function copyRangeWithBoundedBuffer(
  sourcePath: string,
  destinationPath: string,
  expectedSourceBytes: number,
  sourceOffset: number,
  rangeBytes: number,
  signal: AbortSignal,
  onProgress?: (copiedBytes: number) => void
): Promise<void> {
  if (
    !Number.isSafeInteger(expectedSourceBytes) ||
    !Number.isSafeInteger(sourceOffset) ||
    !Number.isSafeInteger(rangeBytes) ||
    expectedSourceBytes < 0 ||
    sourceOffset < 0 ||
    rangeBytes < 0 ||
    sourceOffset + rangeBytes > expectedSourceBytes
  ) {
    throw new Error('Cheap LFS refused an invalid manual upload file range.')
  }
  const source = await open(sourcePath, 'r')
  let destination: Awaited<ReturnType<typeof open>> | undefined
  try {
    destination = await open(destinationPath, 'wx')
    const buffer = Buffer.allocUnsafe(
      Math.min(ManualUploadCopyBufferBytes, Math.max(1, rangeBytes))
    )
    let copied = 0
    let lastReportedBytes = -1
    let lastReportedAt = 0
    const reportProgress = (bytes: number, force: boolean = false) => {
      if (onProgress === undefined || bytes === lastReportedBytes) {
        return
      }
      const now = Date.now()
      if (
        force ||
        lastReportedBytes < 0 ||
        now - lastReportedAt >= ManualUploadProgressReportIntervalMs
      ) {
        lastReportedBytes = bytes
        lastReportedAt = now
        onProgress(bytes)
      }
    }
    reportProgress(0, true)
    while (copied < rangeBytes) {
      throwIfAborted(signal)
      const requested = Math.min(buffer.byteLength, rangeBytes - copied)
      const read = await source.read(
        buffer,
        0,
        requested,
        sourceOffset + copied
      )
      if (read.bytesRead === 0) {
        throw new Error(
          'The cheap LFS source became shorter while preparing the manual upload.'
        )
      }
      let written = 0
      while (written < read.bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          read.bytesRead - written,
          copied + written
        )
        if (result.bytesWritten === 0) {
          throw new Error('Could not copy the manual cheap LFS handoff file.')
        }
        written += result.bytesWritten
      }
      copied += read.bytesRead
      reportProgress(copied)
    }
    if ((await source.stat()).size !== expectedSourceBytes) {
      throw new Error(
        'The cheap LFS source changed size while preparing the manual upload.'
      )
    }
    await destination.sync()
    reportProgress(rangeBytes, true)
  } catch (error) {
    await destination?.close().catch(() => undefined)
    destination = undefined
    await unlink(destinationPath).catch(() => undefined)
    throw error
  } finally {
    await destination?.close().catch(() => undefined)
    await source.close()
  }
}

export type CheapLfsManualHandoffMethod = 'symlink' | 'hardlink' | 'copy'

export interface ICheapLfsManualHandoffAsset {
  readonly name: string
  readonly path: string
  readonly method: CheapLfsManualHandoffMethod
}

export interface ICheapLfsManualHandoff {
  readonly rootPath: string
  readonly uploadDirectoryPath: string
  readonly assets: ReadonlyArray<ICheapLfsManualHandoffAsset>
  cleanup(): Promise<void>
}

export interface ICheapLfsManualHandoffLinker {
  readonly symlink: (source: string, destination: string) => Promise<void>
  readonly hardlink: (source: string, destination: string) => Promise<void>
}

const defaultHandoffLinker: ICheapLfsManualHandoffLinker = {
  symlink: (source, destination) => symlink(source, destination, 'file'),
  hardlink: (source, destination) => link(source, destination),
}

/**
 * Create a private, random handoff root and an upload subfolder containing
 * every correctly named asset. Cleanup only unlinks identities created by this
 * operation; a replaced path is left untouched.
 */
export async function createCheapLfsManualHandoff(
  plan: ICheapLfsManualPinPlan,
  signal: AbortSignal,
  linker: ICheapLfsManualHandoffLinker = defaultHandoffLinker,
  onProgress?: (progress: ICheapLfsFileProgress) => void
): Promise<ICheapLfsManualHandoff> {
  throwIfAborted(signal)
  if (
    plan.files.some(file =>
      file.assets.some(asset => basename(asset.assetName) !== asset.assetName)
    )
  ) {
    throw new Error('Cheap LFS produced an unsafe manual asset name.')
  }
  const totalBytes = plan.files.reduce((sum, file) => sum + file.sizeInBytes, 0)
  const stagedWorstCaseBytes = plan.files.reduce(
    (sum, file) => sum + BigInt(file.sizeInBytes),
    0n
  )
  const largestVerificationBytes = plan.files.reduce(
    (largest, file) =>
      Math.max(largest, ...file.assets.map(asset => asset.sizeInBytes)),
    0
  )
  const requiredTemporaryBytes =
    stagedWorstCaseBytes +
    BigInt(largestVerificationBytes) +
    BigInt(ManualUploadFreeSpaceReserveBytes)
  const temporaryVolume = await statfs(tmpdir())
  const availableTemporaryBytes =
    BigInt(temporaryVolume.bavail) * BigInt(temporaryVolume.bsize)
  if (availableTemporaryBytes < requiredTemporaryBytes) {
    throw new Error(
      'Cheap LFS needs more free temporary-disk space to prepare and verify this manual upload.'
    )
  }
  const owned = new Array<IOwnedPathIdentity>()
  const cleanup = async () => {
    for (const identity of [...owned].reverse()) {
      await removeOwnedPath(identity)
    }
  }

  const rootPath = await mkdtemp(join(tmpdir(), 'desktop-material-lfs-'))
  owned.push(await captureOwnedPath(rootPath, 'directory'))
  const uploadDirectoryPath = join(rootPath, 'upload-these-files')
  try {
    await mkdir(uploadDirectoryPath)
    owned.push(await captureOwnedPath(uploadDirectoryPath, 'directory'))
    const assets = new Array<ICheapLfsManualHandoffAsset>()
    let completedBytes = 0
    for (const file of plan.files) {
      let preparedFileBytes = 0
      const reportFileProgress = (processedBytes: number) => {
        preparedFileBytes = processedBytes
        onProgress?.({
          processedBytes: completedBytes + processedBytes,
          totalBytes,
          currentPath: file.trackedRelativePath,
        })
      }
      reportFileProgress(0)
      for (const asset of file.assets) {
        throwIfAborted(signal)
        const assetPath = join(uploadDirectoryPath, asset.assetName)
        let method: CheapLfsManualHandoffMethod
        const isWholeSource =
          file.assets.length === 1 &&
          asset.offset === 0 &&
          asset.sizeInBytes === file.sizeInBytes
        if (isWholeSource) {
          try {
            await linker.symlink(file.absoluteFilePath, assetPath)
            method = 'symlink'
          } catch {
            try {
              await linker.hardlink(file.absoluteFilePath, assetPath)
              method = 'hardlink'
            } catch {
              await copyRangeWithBoundedBuffer(
                file.absoluteFilePath,
                assetPath,
                file.sizeInBytes,
                asset.offset,
                asset.sizeInBytes,
                signal,
                copiedBytes => reportFileProgress(asset.offset + copiedBytes)
              )
              method = 'copy'
            }
          }
        } else {
          await copyRangeWithBoundedBuffer(
            file.absoluteFilePath,
            assetPath,
            file.sizeInBytes,
            asset.offset,
            asset.sizeInBytes,
            signal,
            copiedBytes => reportFileProgress(asset.offset + copiedBytes)
          )
          method = 'copy'
        }
        owned.push(await captureOwnedPath(assetPath, 'entry'))
        assets.push({ name: asset.assetName, path: assetPath, method })
      }
      if (preparedFileBytes !== file.sizeInBytes) {
        reportFileProgress(file.sizeInBytes)
      }
      completedBytes += file.sizeInBytes
    }

    const manifestPath = join(rootPath, 'handoff.json')
    await writeExclusiveText(
      manifestPath,
      `${JSON.stringify(
        {
          version: 2,
          files: plan.files.map(file => {
            return {
              trackedPath: file.trackedRelativePath,
              sizeInBytes: file.sizeInBytes,
              sha256: file.sha256,
              pointerAssetName: file.assetName,
              assets: file.assets.map(asset => {
                const handoff = assets.find(
                  candidate => candidate.name === asset.assetName
                )!
                return {
                  assetName: asset.assetName,
                  offset: asset.offset,
                  sizeInBytes: asset.sizeInBytes,
                  sha256: asset.sha256,
                  handoffMethod: handoff.method,
                }
              }),
            }
          }),
        },
        null,
        2
      )}\n`
    )
    owned.push(await captureOwnedPath(manifestPath, 'entry'))
    return {
      rootPath,
      uploadDirectoryPath,
      assets,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export interface ICheapLfsManualUploadPolicy {
  readonly maximumPollAttempts: number
  readonly pollIntervalMs: number
  readonly maximumPollIntervalMs?: number
}

const defaultManualUploadPolicy: ICheapLfsManualUploadPolicy = {
  maximumPollAttempts: DefaultManualUploadPollAttempts,
  pollIntervalMs: DefaultManualUploadPollIntervalMs,
  maximumPollIntervalMs: DefaultManualUploadMaximumPollIntervalMs,
}

async function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (ms <= 0) {
    return
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onAbort = () => {
      clearTimeout(timer)
      rejectPromise(manualAbortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolvePromise()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function listAllAssets(
  releases: ICheapLfsManualReleasesGateway,
  repository: Repository,
  releaseId: number,
  signal: AbortSignal
): Promise<ReadonlyArray<IGitHubReleaseAsset>> {
  const assets = new Array<IGitHubReleaseAsset>()
  const assetIds = new Set<number>()
  let page = 1
  for (let request = 0; request < GitHubReleaseAssetMaximumPages; request++) {
    const result = await releases.listAssets(
      repository,
      releaseId,
      page,
      signal
    )
    if (result.page !== page) {
      throw new Error('GitHub returned an unexpected release asset page.')
    }
    for (const asset of result.assets) {
      if (assetIds.has(asset.id)) {
        throw new Error('GitHub returned duplicate release asset ids.')
      }
      assetIds.add(asset.id)
      assets.push(asset)
    }
    if (result.capped && assets.length !== GitHubReleaseAssetMaximumCount) {
      throw new Error(
        'This release has too many assets to verify a manual cheap LFS upload safely.'
      )
    }
    if (assets.length > GitHubReleaseAssetMaximumCount) {
      throw new Error(
        'This release has too many assets to verify a manual cheap LFS upload safely.'
      )
    }
    if (result.nextPage === null) {
      return assets
    }
    if (result.nextPage <= page) {
      throw new Error('GitHub returned an invalid release asset page.')
    }
    page = result.nextPage
  }
  throw new Error(
    'This release has too many assets to verify a manual cheap LFS upload safely.'
  )
}

async function waitForNewAssets(
  releases: ICheapLfsManualReleasesGateway,
  repository: Repository,
  plan: ICheapLfsManualPinPlan,
  signal: AbortSignal,
  policy: ICheapLfsManualUploadPolicy
): Promise<ReadonlyMap<string, IGitHubReleaseAsset>> {
  const expectedAssets = plan.files.flatMap(file => file.assets)
  const expectedByName = new Map(
    expectedAssets.map(asset => [asset.assetName, asset] as const)
  )
  if (expectedByName.size !== expectedAssets.length) {
    throw new Error('Cheap LFS produced duplicate manual upload asset names.')
  }
  for (let attempt = 0; attempt < policy.maximumPollAttempts; attempt++) {
    throwIfAborted(signal)
    const assets = await listAllAssets(
      releases,
      repository,
      plan.release.id,
      signal
    )
    const detected = new Map<string, IGitHubReleaseAsset>()
    for (const asset of assets) {
      if (
        !isUploadedGitHubReleaseAsset(asset) ||
        plan.preexistingAssetIds.has(asset.id)
      ) {
        continue
      }
      const expected = expectedByName.get(asset.name)
      if (expected === undefined) {
        continue
      }
      if (detected.has(asset.name)) {
        throw new Error(
          `GitHub returned multiple new assets named “${asset.name}”.`
        )
      }
      if (asset.sizeInBytes !== expected.sizeInBytes) {
        throw new Error(
          `The manually uploaded “${asset.name}” asset has the wrong byte size.`
        )
      }
      detected.set(asset.name, asset)
    }
    if (detected.size === expectedAssets.length) {
      return detected
    }
    if (attempt + 1 < policy.maximumPollAttempts) {
      const maximumInterval = Math.max(
        policy.pollIntervalMs,
        policy.maximumPollIntervalMs ?? policy.pollIntervalMs
      )
      const backoff =
        policy.pollIntervalMs * Math.pow(1.5, Math.min(attempt, 20))
      await waitForPoll(Math.min(maximumInterval, backoff), signal)
    }
  }
  throw new Error(
    'Timed out waiting for every manually uploaded cheap LFS release asset.'
  )
}

async function verifyDownloadedAsset(
  releases: ICheapLfsManualReleasesGateway,
  repository: Repository,
  releaseId: number,
  file: ICheapLfsManualAssetPlan,
  asset: IGitHubReleaseAsset,
  rootPath: string,
  signal: AbortSignal,
  fs: ICheapLfsFileSystem
): Promise<void> {
  const expectedDigest = `sha256:${file.sha256}`
  if (asset.digest !== null && asset.digest !== expectedDigest) {
    throw new Error(
      'GitHub reports a digest that does not match the manual cheap LFS asset.'
    )
  }
  const destination = join(
    rootPath,
    `.verify-${randomBytes(8).toString('hex')}.tmp`
  )
  let identity: IOwnedPathIdentity | undefined
  try {
    const download = await releases.downloadAsset(
      repository,
      releaseId,
      asset,
      destination,
      signal
    )
    if (resolve(download.path) !== resolve(destination)) {
      throw new Error('GitHub returned an unsafe verification download path.')
    }
    identity = await captureOwnedPath(destination, 'entry')
    const hashed = await fs.hashFile(destination, signal)
    if (
      download.bytes !== file.sizeInBytes ||
      hashed.sizeInBytes !== file.sizeInBytes ||
      hashed.sha256 !== file.sha256
    ) {
      throw new Error(
        'The downloaded manual cheap LFS asset does not match the original file.'
      )
    }
  } finally {
    if (identity === undefined) {
      identity = await captureOwnedPath(destination, 'entry').catch(
        () => undefined
      )
    }
    if (identity !== undefined) {
      await removeOwnedPath(identity)
    }
  }
}

export interface ICheapLfsManualUploadHooks {
  readonly onStage?: (stage: CheapLfsAutoPinPhase) => void
  readonly onPreparationProgress?: (progress: ICheapLfsFileProgress) => void
  readonly onReady: (
    handoff: ICheapLfsManualHandoff,
    plan: ICheapLfsManualPinPlan
  ) => Promise<void>
}

/**
 * Browser-assisted fallback that remains inside the original pin promise.
 * A pointer is written only after a new asset is discovered, downloaded and
 * hashed, and the source is rehashed to prove it did not change meanwhile.
 */
export async function manualPinFilesToRelease(
  releases: ICheapLfsManualReleasesGateway,
  repository: Repository,
  account: Account,
  options: ReadonlyArray<ICheapLfsPinOptions>,
  signal: AbortSignal,
  hooks: ICheapLfsManualUploadHooks,
  fs: ICheapLfsFileSystem = defaultCheapLfsFileSystem,
  policy: ICheapLfsManualUploadPolicy = defaultManualUploadPolicy
): Promise<ReadonlyArray<ICheapLfsAutoPinnedFile>> {
  hooks.onStage?.('manual-preparing')
  let totalSourceBytes = 0
  const plan = await planCheapLfsManualUpload(
    releases,
    repository,
    account,
    options,
    signal,
    undefined,
    fs,
    progress => {
      totalSourceBytes = progress.totalBytes
      hooks.onPreparationProgress?.({
        ...progress,
        totalBytes: progress.totalBytes * 2,
      })
    }
  )
  if (totalSourceBytes === 0) {
    totalSourceBytes = plan.files.reduce(
      (sum, file) => sum + file.sizeInBytes,
      0
    )
  }
  const handoff = await createCheapLfsManualHandoff(
    plan,
    signal,
    undefined,
    progress =>
      hooks.onPreparationProgress?.({
        ...progress,
        processedBytes: totalSourceBytes + progress.processedBytes,
        totalBytes: totalSourceBytes * 2,
      })
  )
  try {
    await hooks.onReady(handoff, plan)
    hooks.onStage?.('manual-waiting')
    const assets = await waitForNewAssets(
      releases,
      repository,
      plan,
      signal,
      policy
    )
    hooks.onStage?.('manual-verifying')
    for (const file of plan.files) {
      for (const expectedAsset of file.assets) {
        await verifyDownloadedAsset(
          releases,
          repository,
          plan.release.id,
          expectedAsset,
          assets.get(expectedAsset.assetName)!,
          handoff.rootPath,
          signal,
          fs
        )
      }
    }
    // Rehash every source before mutating any source path. This makes a changed
    // member fail the whole rendezvous while all original files remain intact.
    for (const file of plan.files) {
      const source = await fs.hashFile(file.absoluteFilePath, signal)
      if (
        source.sizeInBytes !== file.sizeInBytes ||
        source.sha256 !== file.sha256
      ) {
        throw new Error(
          `The cheap LFS source “${file.trackedRelativePath}” changed during manual upload. Original files were left in place.`
        )
      }
    }
    throwIfAborted(signal)
    hooks.onStage?.('manual-detected')
    // Cancellation is fenced immediately before the mutation phase. Once the
    // first per-file atomic pointer write starts, finish the reviewed batch so
    // the caller never reports "canceled" after silently converting files.
    for (const file of plan.files) {
      await fs.writePointer(
        join(repository.path, file.trackedRelativePath),
        file.pointerText
      )
    }
    return plan.files.map(file => ({
      relativePath: file.trackedRelativePath,
      sizeInBytes: file.sizeInBytes,
      result: {
        pointer: file.pointer,
        asset: assets.get(file.assets[0].assetName)!,
        releaseId: plan.release.id,
      },
    }))
  } finally {
    await handoff.cleanup()
  }
}

/**
 * Build the exact validated release edit page when the API exposes its web
 * slug. Older GHES responses can omit it; those safely fall back to the
 * repository Releases listing rather than guessing a tag-based draft route.
 */
export function getCheapLfsReleaseUploadURL(
  repository: Repository,
  release: IGitHubRelease
): string {
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository === null || gitHubRepository.htmlURL === null) {
    throw new Error('Cheap LFS cannot open a release page for this repository.')
  }
  const providerURL = new URL(getHTMLURL(gitHubRepository.endpoint))
  const endpointURL = new URL(gitHubRepository.endpoint)
  const repositoryURL = new URL(gitHubRepository.htmlURL)
  if (
    (providerURL.protocol !== 'https:' && providerURL.protocol !== 'http:') ||
    (endpointURL.protocol !== 'https:' && endpointURL.protocol !== 'http:') ||
    (repositoryURL.protocol !== 'https:' &&
      repositoryURL.protocol !== 'http:') ||
    providerURL.username.length > 0 ||
    providerURL.password.length > 0 ||
    endpointURL.username.length > 0 ||
    endpointURL.password.length > 0 ||
    repositoryURL.username.length > 0 ||
    repositoryURL.password.length > 0 ||
    providerURL.origin !== repositoryURL.origin ||
    repositoryURL.search.length > 0 ||
    repositoryURL.hash.length > 0
  ) {
    throw new Error('Cheap LFS refused an unsafe repository release URL.')
  }
  let providerPath: string
  let repositoryPath: string
  try {
    providerPath = decodeURIComponent(providerURL.pathname).replace(/\/+$/, '')
    const endpointBasePath = decodeURIComponent(endpointURL.pathname)
      .replace(/\/api\/v3\/?$/i, '')
      .replace(/\/+$/, '')
    if (providerPath.length === 0 && endpointBasePath.length > 0) {
      providerPath = endpointBasePath
    }
    repositoryPath = decodeURIComponent(repositoryURL.pathname).replace(
      /\/+$/,
      ''
    )
  } catch {
    throw new Error('Cheap LFS refused an invalid repository release URL.')
  }
  const expectedPath =
    `${providerPath}/${gitHubRepository.owner.login}/${gitHubRepository.name}`.replace(
      /^\/\//,
      '/'
    )
  if (repositoryPath.toLowerCase() !== expectedPath.toLowerCase()) {
    throw new Error('Cheap LFS refused a release URL for another repository.')
  }
  repositoryURL.pathname = `${repositoryURL.pathname.replace(
    /\/+$/,
    ''
  )}/releases`
  const releasesListing = repositoryURL.toString()
  if (release.htmlURL === null || release.htmlURL === undefined) {
    return releasesListing
  }

  try {
    const releaseURL = new URL(release.htmlURL)
    if (
      (releaseURL.protocol !== 'https:' && releaseURL.protocol !== 'http:') ||
      releaseURL.username.length > 0 ||
      releaseURL.password.length > 0 ||
      releaseURL.origin !== repositoryURL.origin ||
      releaseURL.search.length > 0 ||
      releaseURL.hash.length > 0
    ) {
      return releasesListing
    }
    const repositoryBasePath = repositoryURL.pathname.replace(
      /\/releases\/?$/,
      ''
    )
    const tagPrefix = `${repositoryBasePath}/releases/tag/`
    if (
      !releaseURL.pathname.toLowerCase().startsWith(tagPrefix.toLowerCase())
    ) {
      return releasesListing
    }
    const slug = releaseURL.pathname.slice(tagPrefix.length)
    const decodedSlug = decodeURIComponent(slug)
    if (
      slug.length === 0 ||
      slug.includes('/') ||
      /[\u0000-\u001f\u007f]/.test(decodedSlug)
    ) {
      return releasesListing
    }
    releaseURL.pathname = `${repositoryBasePath}/releases/edit/${slug}`
    return releaseURL.toString()
  } catch {
    return releasesListing
  }
}
