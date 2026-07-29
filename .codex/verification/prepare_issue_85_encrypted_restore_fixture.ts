import { createHash } from 'crypto'
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { Account, getAccountKey } from '../../app/src/models/account'
import { GitHubRepository } from '../../app/src/models/github-repository'
import { Owner } from '../../app/src/models/owner'
import { Repository } from '../../app/src/models/repository'
import {
  IGitHubRelease,
  IGitHubReleaseAsset,
  IGitHubReleaseAssetList,
  IGitHubReleaseDraft,
} from '../../app/src/lib/github-releases'
import {
  IGitHubReleaseAssetUploadRange,
  IGitHubReleaseTransferProgressEvent,
} from '../../app/src/lib/github-release-transfer'
import { IGitHubReleaseMutationReview } from '../../app/src/lib/stores/github-releases-store'
import {
  ICheapLfsMaterializeTransferProgress,
  ICheapLfsReleasesGateway,
  materializePointer,
  pinFileToRelease,
} from '../../app/src/lib/cheap-lfs/operations'

const ReceiptSchema =
  'desktop-material/cheap-lfs-encrypted-compressed-restore-operation/v1'
const OperationKind = 'genuine-encrypted-compressed-release-restore'
const RelativePayloadPath = 'issue-85-encrypted-compressed.bin'
const ReleaseTag = 'issue-85-encrypted-compressed-restore'
const ExpectedPhases = [
  'downloading',
  'decrypting',
  'decompressing',
  'verifying',
  'materializing',
] as const

interface IOptions {
  readonly runRoot: string
  readonly repositoryPath: string
  readonly receiptPath: string
}

function fail(message: string): never {
  throw new Error(message)
}

function parseArguments(argv: ReadonlyArray<string>): IOptions {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    const normalizedName = name.slice(2)
    if (values.has(normalizedName)) {
      fail(`Duplicate argument ${name}.`)
    }
    values.set(normalizedName, value)
  }

  const supported = new Set(['run-root', 'repository-path', 'receipt'])
  for (const name of values.keys()) {
    if (!supported.has(name)) {
      fail(`Unsupported argument --${name}.`)
    }
  }

  const requiredPath = (name: string): string => {
    const value = values.get(name)
    if (value === undefined || value.trim().length === 0) {
      fail(`--${name} is required.`)
    }
    return resolve(value)
  }

  return {
    runRoot: requiredPath('run-root'),
    repositoryPath: requiredPath('repository-path'),
    receiptPath: requiredPath('receipt'),
  }
}

function normalizedPath(value: string): string {
  return resolve(value).toLowerCase()
}

function isContainedPath(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate)
  return (
    candidateRelative !== '' &&
    candidateRelative !== '..' &&
    !candidateRelative.startsWith(
      `..${process.platform === 'win32' ? '\\' : '/'}`
    ) &&
    !isAbsolute(candidateRelative)
  )
}

async function assertRealDirectory(
  candidate: string,
  label: string
): Promise<string> {
  let status
  let real
  let realStatus
  try {
    status = await lstat(candidate)
    real = await realpath(candidate)
    realStatus = await lstat(real)
  } catch {
    fail(`${label} is missing.`)
  }
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    !realStatus.isDirectory() ||
    status.dev !== realStatus.dev ||
    status.ino !== realStatus.ino
  ) {
    fail(`${label} must be a real directory, not a link or junction.`)
  }
  return real
}

async function validateOwnedPaths(options: IOptions): Promise<IOptions> {
  const tempRoot = await assertRealDirectory(tmpdir(), 'Operating-system Temp')
  const runRoot = await assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !/^desktop-material-cheap-lfs-restore-progress-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/.test(
      basename(runRoot)
    )
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-cheap-lfs-restore-progress-*.'
    )
  }

  const repositoryPath = await assertRealDirectory(
    options.repositoryPath,
    'Disposable repository'
  )
  if (!isContainedPath(runRoot, repositoryPath)) {
    fail('Disposable repository must stay inside the owned run root.')
  }
  const gitEntry = join(repositoryPath, '.git')
  const gitStatus = await lstat(gitEntry).catch(() => null)
  if (gitStatus === null || gitStatus.isSymbolicLink()) {
    fail('Disposable repository has no safe .git entry.')
  }

  if (!isContainedPath(runRoot, options.receiptPath)) {
    fail('Operation receipt must stay inside the owned run root.')
  }
  if (
    await stat(options.receiptPath).then(
      () => true,
      () => false
    )
  ) {
    fail('Operation receipt must be a new file.')
  }
  await mkdir(dirname(options.receiptPath), { recursive: true })
  const receiptParent = await assertRealDirectory(
    dirname(options.receiptPath),
    'Operation receipt parent'
  )
  if (!isContainedPath(runRoot, receiptParent)) {
    fail('Operation receipt parent escaped the owned run root.')
  }

  const payloadPath = join(repositoryPath, RelativePayloadPath)
  if (
    await stat(payloadPath).then(
      () => true,
      () => false
    )
  ) {
    fail(
      `${RelativePayloadPath} must not already exist in the disposable repository.`
    )
  }

  return { runRoot, repositoryPath, receiptPath: options.receiptPath }
}

const verificationAccount = new Account(
  'issue-85-verifier',
  'https://api.github.com',
  'verification-token-never-sent',
  [],
  '',
  85,
  'Issue 85 verifier'
)

function repositoryAt(repositoryPath: string): Repository {
  return new Repository(
    repositoryPath,
    85,
    new GitHubRepository(
      basename(repositoryPath),
      new Owner('desktop-material-verifier', 'https://api.github.com', 85),
      85
    ),
    false,
    null,
    {},
    false,
    undefined,
    getAccountKey(verificationAccount),
    undefined,
    null,
    'main'
  )
}

class GenuineReleaseGateway implements ICheapLfsReleasesGateway {
  private release: IGitHubRelease | null = null
  private nextAssetId = 1
  private readonly payloads = new Map<number, Buffer>()
  public readonly uploadSourcePaths = new Array<string>()
  public readonly downloadDestinationPaths = new Array<string>()

  public async getReleaseByTag(
    _repository: Repository,
    tag: string
  ): Promise<IGitHubRelease | null> {
    return this.release?.tagName === tag ? this.release : null
  }

  public async create(
    _repository: Repository,
    draft: IGitHubReleaseDraft,
    publishImmediately: boolean
  ): Promise<IGitHubRelease> {
    this.release = {
      id: 85,
      tagName: draft.tagName,
      targetCommitish: draft.targetCommitish,
      name: draft.name,
      body: draft.body,
      draft: !publishImmediately,
      prerelease: draft.prerelease,
      createdAt: new Date(0),
      publishedAt: publishImmediately ? new Date(0) : null,
      authorLogin: 'issue-85-verifier',
      assets: [],
    }
    return this.release
  }

  public async listAssets(
    _repository: Repository,
    _releaseId: number,
    page: number = 1
  ): Promise<IGitHubReleaseAssetList> {
    return {
      assets: this.release?.assets ?? [],
      page,
      nextPage: null,
      capped: false,
    }
  }

  public createMutationReview(
    _repository: Repository,
    release: IGitHubRelease,
    asset?: IGitHubReleaseAsset | null
  ): IGitHubReleaseMutationReview {
    return { release, asset } as unknown as IGitHubReleaseMutationReview
  }

  public async publish(
    _repository: Repository,
    _review: IGitHubReleaseMutationReview
  ): Promise<IGitHubRelease> {
    if (this.release === null) {
      fail('The genuine restore fixture has no release to publish.')
    }
    this.release = {
      ...this.release,
      draft: false,
      publishedAt: new Date(0),
    }
    return this.release
  }

  public async uploadAsset(
    _repository: Repository,
    _review: IGitHubReleaseMutationReview,
    sourcePath: string,
    name: string,
    label: string | null,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void,
    range?: IGitHubReleaseAssetUploadRange,
    expectedDigest?: string
  ): Promise<{
    readonly asset: IGitHubReleaseAsset
    readonly bytes: number
    readonly localDigest: string
  }> {
    if (signal.aborted) {
      fail('The genuine encrypted upload was unexpectedly canceled.')
    }
    if (range !== undefined) {
      fail('Encrypted payloads must upload their ciphertext temp as a whole.')
    }
    const bytes = await readFile(sourcePath)
    const digest = `sha256:${sha256(bytes)}`
    if (expectedDigest !== undefined && expectedDigest !== digest) {
      fail('The encrypted upload digest diverged from the real writer output.')
    }
    const asset: IGitHubReleaseAsset = {
      id: this.nextAssetId++,
      name,
      label,
      state: 'uploaded',
      contentType: 'application/octet-stream',
      sizeInBytes: bytes.length,
      downloadCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      digest,
    }
    this.uploadSourcePaths.push(sourcePath)
    this.payloads.set(asset.id, Buffer.from(bytes))
    if (this.release === null) {
      fail('The genuine encrypted upload has no release.')
    }
    this.release = {
      ...this.release,
      assets: [...this.release.assets, asset],
    }
    onProgress?.({
      operationId: `issue-85-upload-${asset.id}`,
      direction: 'upload',
      transferredBytes: bytes.length,
      totalBytes: bytes.length,
    })
    return { asset, bytes: bytes.length, localDigest: digest }
  }

  public async deleteAsset(
    _repository: Repository,
    review: IGitHubReleaseMutationReview
  ): Promise<void> {
    const asset = (review as unknown as { asset?: IGitHubReleaseAsset }).asset
    if (asset === undefined || this.release === null) {
      return
    }
    this.payloads.delete(asset.id)
    this.release = {
      ...this.release,
      assets: this.release.assets.filter(
        candidate => candidate.id !== asset.id
      ),
    }
  }

  public async downloadAsset(
    _repository: Repository,
    _releaseId: number,
    asset: IGitHubReleaseAsset,
    destination: string,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void
  ): Promise<{ readonly path: string; readonly bytes: number }> {
    if (signal.aborted) {
      fail('The genuine encrypted download was unexpectedly canceled.')
    }
    const payload = this.payloads.get(asset.id)
    if (payload === undefined) {
      fail('The genuine restore fixture has no payload for this asset.')
    }
    await writeFile(destination, payload, { flag: 'wx' })
    this.downloadDestinationPaths.push(destination)
    onProgress?.({
      operationId: `issue-85-download-${asset.id}`,
      direction: 'download',
      transferredBytes: payload.length,
      totalBytes: payload.length,
    })
    return { path: destination, bytes: payload.length }
  }

  public storedPayload(assetId: number): Buffer {
    const payload = this.payloads.get(assetId)
    if (payload === undefined) {
      fail('The genuine restore fixture lost its stored payload.')
    }
    return Buffer.from(payload)
  }

  public dispose(): void {
    for (const payload of this.payloads.values()) {
      payload.fill(0)
    }
    this.payloads.clear()
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function distinctPhases(
  updates: ReadonlyArray<ICheapLfsMaterializeTransferProgress>
): ReadonlyArray<string> {
  const phases = new Array<string>()
  for (const update of updates) {
    if (
      update.phase !== undefined &&
      update.phase !== phases[phases.length - 1]
    ) {
      phases.push(update.phase)
    }
  }
  return phases
}

function sanitizeProgress(progress: ICheapLfsMaterializeTransferProgress) {
  return {
    direction: progress.direction,
    phase: progress.phase ?? null,
    transferredBytes: progress.transferredBytes,
    totalBytes: progress.totalBytes,
    logicalTransferredBytes: progress.logicalTransferredBytes ?? null,
    logicalTotalBytes: progress.logicalTotalBytes ?? null,
    actualTransferredBytes: progress.actualTransferredBytes ?? null,
    actualTotalBytes: progress.actualTotalBytes ?? null,
    partOrdinal: progress.partOrdinal ?? null,
    partsTotal: progress.partsTotal ?? null,
    partTransferredBytes: progress.partTransferredBytes ?? null,
    partTotalBytes: progress.partTotalBytes ?? null,
    queuedParts: progress.queuedParts ?? null,
    activeParts:
      progress.activeParts?.map(part => ({
        partOrdinal: part.partOrdinal,
        partsTotal: part.partsTotal,
        phase: part.phase,
        processedBytes: part.processedBytes,
        totalBytes: part.totalBytes,
        downloadComplete: part.downloadComplete,
      })) ?? [],
  }
}

async function pathsWereRemoved(
  paths: ReadonlyArray<string>
): Promise<boolean> {
  for (const candidate of paths) {
    const exists = await stat(candidate).then(
      () => true,
      error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false
        }
        throw error
      }
    )
    if (exists) {
      return false
    }
  }
  return true
}

async function main(): Promise<void> {
  const options = await validateOwnedPaths(
    parseArguments(process.argv.slice(2))
  )
  const repository = repositoryAt(options.repositoryPath)
  const payloadPath = join(options.repositoryPath, RelativePayloadPath)
  const plaintext = Buffer.from(
    'Desktop Material issue 85 genuine encrypted and compressed restore proof.\n'.repeat(
      4096
    ),
    'utf8'
  )
  const plaintextSha256 = sha256(plaintext)
  const password = createHash('sha256')
    .update('desktop-material-issue-85-verifier-password')
    .digest()
  const gateway = new GenuineReleaseGateway()
  const updates = new Array<ICheapLfsMaterializeTransferProgress>()
  let encryptedStoredPayload: Buffer | null = null
  let pendingReceipt: Record<string, unknown> | null = null

  try {
    await writeFile(payloadPath, plaintext, { flag: 'wx' })
    const pinned = await pinFileToRelease(
      gateway,
      repository,
      verificationAccount,
      {
        absoluteFilePath: payloadPath,
        trackedRelativePath: RelativePayloadPath,
        releaseTag: ReleaseTag,
        encryptionPassword: password,
        compressBeforeEncryption: true,
      }
    )
    const part = pinned.pointer.parts?.[0]
    if (
      part === undefined ||
      pinned.pointer.parts?.length !== 1 ||
      part.encrypted !== true ||
      part.deflatedSizeInBytes === undefined ||
      part.deflatedSizeInBytes >= plaintext.length ||
      part.storedSizeInBytes === undefined ||
      part.storedSha256 === undefined
    ) {
      fail(
        'The real pin operation did not produce one compressed-then-encrypted pointer part.'
      )
    }
    encryptedStoredPayload = gateway.storedPayload(pinned.asset.id)
    if (
      encryptedStoredPayload.equals(plaintext) ||
      sha256(encryptedStoredPayload) !== part.storedSha256
    ) {
      fail(
        'The provider object was not the authenticated ciphertext in the pointer.'
      )
    }

    const pointerText = await readFile(payloadPath, 'utf8')
    if (!pointerText.includes('part-encrypted-deflate ')) {
      fail(
        'The real pin operation did not publish the encrypted-deflate pointer format.'
      )
    }

    const restored = await materializePointer(
      gateway,
      repository,
      verificationAccount,
      RelativePayloadPath,
      undefined,
      update => updates.push(update),
      undefined,
      undefined,
      password
    )
    const restoredBytes = await readFile(payloadPath)
    const observedPhases = distinctPhases(updates)
    if (JSON.stringify(observedPhases) !== JSON.stringify(ExpectedPhases)) {
      fail(
        `The real restore phase order was ${JSON.stringify(
          observedPhases
        )}, expected ${JSON.stringify(ExpectedPhases)}.`
      )
    }
    const decryptingProgress = updates.find(
      update => update.phase === 'decrypting'
    )
    if (decryptingProgress === undefined) {
      fail('The real restore emitted no decrypting progress event.')
    }
    const contentMatched =
      restored.bytes === plaintext.length &&
      restoredBytes.length === plaintext.length &&
      sha256(restoredBytes) === plaintextSha256 &&
      restoredBytes.equals(plaintext)
    if (!contentMatched) {
      fail(
        'The real encrypted and compressed restore did not recover the plaintext.'
      )
    }

    const temporaryPaths = [
      ...gateway.uploadSourcePaths,
      ...gateway.downloadDestinationPaths,
    ]
    const allTemporaryPayloadFilesRemoved = await pathsWereRemoved(
      temporaryPaths
    )
    if (!allTemporaryPayloadFilesRemoved) {
      fail('The real restore left an app-owned payload temporary file behind.')
    }

    pendingReceipt = {
      schema: ReceiptSchema,
      operationKind: OperationKind,
      result: 'succeeded',
      repositoryRelativePath: RelativePayloadPath,
      releaseTag: ReleaseTag,
      productionEntrypoints: ['pinFileToRelease', 'materializePointer'],
      provider: 'github-release',
      transformations: {
        compressedBeforeEncryption: true,
        encrypted: true,
        pointerFormat: 'part-encrypted-deflate',
        plaintextBytes: plaintext.length,
        deflatedBytes: part.deflatedSizeInBytes,
        storedCiphertextBytes: encryptedStoredPayload.length,
        plaintextSha256,
        storedCiphertextSha256: part.storedSha256,
        ciphertextDiffersFromPlaintext: true,
      },
      restore: {
        expectedPhaseOrder: [...ExpectedPhases],
        observedPhaseOrder: observedPhases,
        progressEventCount: updates.length,
        decryptingProgress: sanitizeProgress(decryptingProgress),
        restoredBytes: restored.bytes,
        restoredSha256: sha256(restoredBytes),
        contentMatched: true,
      },
      cleanup: {
        uploadTemporaryPathCount: gateway.uploadSourcePaths.length,
        downloadTemporaryPathCount: gateway.downloadDestinationPaths.length,
        allTemporaryPayloadFilesRemoved: true,
      },
    }
    restoredBytes.fill(0)
  } finally {
    password.fill(0)
    plaintext.fill(0)
    encryptedStoredPayload?.fill(0)
    gateway.dispose()
  }

  if (pendingReceipt === null) {
    fail('The genuine restore operation did not produce a receipt.')
  }
  const receipt = {
    ...pendingReceipt,
    cleanup: {
      ...(pendingReceipt.cleanup as Record<string, unknown>),
      passwordBufferZeroed: password.every(byte => byte === 0),
      providerPayloadBuffersZeroed: true,
    },
  }
  await writeFile(
    options.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx' }
  )
  process.stdout.write(
    `CHEAP_LFS_GENUINE_RESTORE_OPERATION_RECEIPT ${JSON.stringify(receipt)}\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(
            error ??
              'Unknown genuine Cheap LFS restore fixture preparation error.'
          )
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

export {
  ExpectedPhases,
  OperationKind,
  ReceiptSchema,
  RelativePayloadPath,
  main,
  parseArguments,
}
