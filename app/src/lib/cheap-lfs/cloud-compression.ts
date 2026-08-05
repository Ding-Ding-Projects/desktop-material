import { randomUUID } from 'crypto'
import { constants, Stats } from 'fs'
import { lstat, link, mkdir, open, realpath, rename, unlink } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { IBuildRunPreferences } from '../../models/build-run-preferences'
import { ICheapLfsPointer } from './pointer'
import { Repository } from '../../models/repository'

/** Immutable commit containing the reviewed composite compressor action. */
export const CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA =
  'b2a846a9e3f8be30da2530f622f6bbb1f91abbb5'

/** Immutable actions/checkout v6.0.2 commit used by managed callers. */
const ACTIONS_CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1'

/** Repository-relative location of the small managed caller workflow. */
export const CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH =
  '.github/workflows/cheap-lfs-cloud-compression.yml'

/**
 * First line of every caller this app owns. Anything at the workflow path that
 * does not start with it belongs to somebody else and is never rewritten.
 */
export const CHEAP_LFS_MANAGED_WORKFLOW_MARKER =
  '# Managed by Desktop Material Cheap LFS. Review changes before committing.'

const ManagedWorkflowMarker = CHEAP_LFS_MANAGED_WORKFLOW_MARKER

const WorkflowWrites = new Map<string, Promise<void>>()
const NoFollowFlag = constants.O_NOFOLLOW ?? 0
const MaximumManagedWorkflowBytes = 64 * 1024

export interface ICheapLfsWorkflowFileHandle {
  readFile(encoding: BufferEncoding): Promise<string>
  writeFile(data: string, encoding: BufferEncoding): Promise<void>
  stat(): Promise<Stats>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface ICheapLfsWorkflowFileSystem {
  lstat(path: string): Promise<Stats>
  link(existingPath: string, newPath: string): Promise<void>
  mkdir(path: string): Promise<string | undefined>
  open(
    path: string,
    flags: number,
    mode?: number
  ): Promise<ICheapLfsWorkflowFileHandle>
  realpath(path: string): Promise<string>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

const nodeWorkflowFileSystem: ICheapLfsWorkflowFileSystem = {
  lstat,
  link,
  mkdir,
  open: (path, flags, mode) => open(path, flags, mode),
  realpath,
  rename,
  unlink,
}

export type CheapLfsCloudCompressionPolicy =
  | 'automatic-public'
  | 'enabled-private'
  | 'disabled-private'
  | 'visibility-unknown'
  | 'not-github'

/**
 * Resolve cloud-compression policy without ever guessing that a repository is
 * public. Public repositories are automatic. Private repositories require the
 * persisted per-repository opt-in. Unknown visibility fails closed.
 */
export function getCheapLfsCloudCompressionPolicy(
  repository: Repository,
  preferences: IBuildRunPreferences = repository.buildRunPreferences
): CheapLfsCloudCompressionPolicy {
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository === null) {
    return 'not-github'
  }
  if (gitHubRepository.isPrivate === false) {
    return 'automatic-public'
  }
  if (gitHubRepository.isPrivate === true) {
    return preferences.cheapLfsCloudCompression === true
      ? 'enabled-private'
      : 'disabled-private'
  }
  return 'visibility-unknown'
}

/** True only for the two policies where compression runs at all. */
export function isCheapLfsCloudCompressionEnabled(
  policy: CheapLfsCloudCompressionPolicy
): boolean {
  return policy === 'automatic-public' || policy === 'enabled-private'
}

/**
 * Where a repository's compression actually runs.
 *
 * - `in-repo-workflow`           — a confirmed-public repository, or a private
 *   repository whose user explicitly accepted its Actions-minute cost. The
 *   reviewed caller lives in that repository so GitHub can run it and publish
 *   the verified pointer update back to the same default branch.
 * - `encrypted-public-builder`   — reserved for an externally provisioned
 *   builder. No current repository policy selects it.
 * - `blocked-visibility-unknown` — GitHub has not said whether the repository
 *   is public or private. Neither route may run: installing a caller could
 *   bill private minutes, and preparing a public builder could publish an
 *   identifier that turns out to be private.
 * - `none`                       — compression is off, or there is no GitHub
 *   repository to run it against.
 */
export type CheapLfsCloudCompressionRoute =
  | 'in-repo-workflow'
  | 'encrypted-public-builder'
  | 'blocked-visibility-unknown'
  | 'none'

/** Resolve the delivery route for a policy. Never guesses. */
export function getCheapLfsCloudCompressionRoute(
  policy: CheapLfsCloudCompressionPolicy
): CheapLfsCloudCompressionRoute {
  switch (policy) {
    case 'automatic-public':
      return 'in-repo-workflow'
    case 'enabled-private':
      return 'in-repo-workflow'
    case 'visibility-unknown':
      return 'blocked-visibility-unknown'
    case 'disabled-private':
    case 'not-github':
    default:
      return 'none'
  }
}

/**
 * True only when the repository-local caller may exist and run: either the
 * repository is confirmed public, or it is confirmed private and the user
 * explicitly opted in.
 */
export function cheapLfsCloudCompressionUsesInRepoWorkflow(
  policy: CheapLfsCloudCompressionPolicy
): boolean {
  return getCheapLfsCloudCompressionRoute(policy) === 'in-repo-workflow'
}

/** One pointer's cloud storage state, including valid mixed pointers. */
export interface ICheapLfsCloudCompressionStats {
  readonly totalObjects: number
  readonly compressedObjects: number
  readonly rawObjects: number
  readonly originalSizeInBytes: number
  readonly storedSizeInBytes: number
}

export function getCheapLfsCloudCompressionStats(
  pointer: ICheapLfsPointer
): ICheapLfsCloudCompressionStats {
  const parts = pointer.parts
  if (parts === undefined) {
    return {
      totalObjects: 1,
      compressedObjects: 0,
      rawObjects: 1,
      originalSizeInBytes: pointer.sizeInBytes,
      storedSizeInBytes: pointer.sizeInBytes,
    }
  }
  let compressedObjects = 0
  let storedSizeInBytes = 0
  for (const part of parts) {
    storedSizeInBytes +=
      part.storedSizeInBytes ?? part.deflatedSizeInBytes ?? part.sizeInBytes
    if (part.deflatedSizeInBytes === undefined) {
      continue
    } else {
      compressedObjects++
    }
  }
  return {
    totalObjects: parts.length,
    compressedObjects,
    rawObjects: parts.length - compressedObjects,
    originalSizeInBytes: pointer.sizeInBytes,
    storedSizeInBytes,
  }
}

/**
 * Render the entire repository-local caller. The runtime visibility check is
 * authoritative: a public repository that later becomes private stops on its
 * own, without waiting for this app to notice.
 *
 * `privateRepositoryOptIn` is embedded in the reviewed caller so the live event
 * visibility check preserves the user's explicit private-repository choice.
 * Disabling that choice rewrites the managed caller with this arm closed.
 */
export function renderCheapLfsCloudCompressionWorkflow(
  privateRepositoryOptIn: boolean
): string {
  return `${ManagedWorkflowMarker}
# Private repository opt-in: ${privateRepositoryOptIn ? 'enabled' : 'disabled'}
name: Cheap LFS cloud compression

on:
  push:
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: cheap-lfs-compress-\${{ github.run_id }}-\${{ github.run_attempt }}
  cancel-in-progress: false

jobs:
  compress:
    name: Compress release objects one by one
    if: >-
      github.ref_type == 'branch' && github.ref == format('refs/heads/{0}',
      github.event.repository.default_branch) &&
      (github.event.repository.private == false || ${
        privateRepositoryOptIn ? 'true' : 'false'
      })
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - name: Check out the pointer commit
        uses: actions/checkout@${ACTIONS_CHECKOUT_SHA}
        with:
          fetch-depth: 1
          sparse-checkout: .github
          sparse-checkout-cone-mode: true
      - name: Compress and adopt verified side assets
        uses: Ding-Ding-Projects/desktop-material/.github/actions/cheap-lfs-cloud-compression@${CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA}
`
}

export interface IEnsureCheapLfsCloudCompressionResult {
  readonly path: string
  readonly changed: boolean
  readonly policy: CheapLfsCloudCompressionPolicy
}

/** Exact identity and bytes of one safely opened managed workflow. */
export interface ICheapLfsWorkflowSnapshot {
  readonly contents: string
  readonly device: number
  readonly inode: number
}

/** Mutation receipt used to compare-and-swap a superseded scheduler write. */
export interface ICheapLfsWorkflowMutationResult
  extends IEnsureCheapLfsCloudCompressionResult {
  readonly snapshot: ICheapLfsWorkflowSnapshot | null
}

/** A read-only look at the workflow path, taken without writing anything. */
export interface ICheapLfsWorkflowInspection {
  readonly path: string
  /** Exact working-tree bytes, or `null` when nothing occupies the path. */
  readonly contents: string | null
  /** Exact identity paired with `contents`, for later compare-and-swap. */
  readonly snapshot: ICheapLfsWorkflowSnapshot | null
  /** The canonical caller for the repository's current policy. */
  readonly canonicalContents: string
  readonly policy: CheapLfsCloudCompressionPolicy
}

function isFileSystemError(
  error: unknown,
  ...codes: ReadonlyArray<string>
): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    codes.includes(String(error.code))
  )
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function sameFile(
  left: Pick<ICheapLfsWorkflowSnapshot, 'device' | 'inode'>,
  right: Pick<ICheapLfsWorkflowSnapshot, 'device' | 'inode'>
): boolean {
  return left.device === right.device && left.inode === right.inode
}

/** Exact equality used by scheduler rollback and commit publication receipts. */
export function cheapLfsWorkflowSnapshotsMatch(
  left: ICheapLfsWorkflowSnapshot | null,
  right: ICheapLfsWorkflowSnapshot | null
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null &&
      right !== null &&
      left.contents === right.contents &&
      sameFile(left, right))
  )
}

function requireUnaliasedRegularFile(path: string, metadata: Stats): void {
  if (metadata.isSymbolicLink()) {
    throw new Error(`Cheap LFS refuses a symbolic link or junction at ${path}.`)
  }
  if (!metadata.isFile()) {
    throw new Error(`Cheap LFS requires a regular workflow file at ${path}.`)
  }
  if (metadata.nlink !== 1) {
    throw new Error(`Cheap LFS refuses a hard-linked workflow file at ${path}.`)
  }
  if (metadata.size > MaximumManagedWorkflowBytes) {
    throw new Error(`Cheap LFS refuses an oversized workflow file at ${path}.`)
  }
}

async function readWorkflowSnapshot(
  path: string,
  fileSystem: ICheapLfsWorkflowFileSystem
): Promise<ICheapLfsWorkflowSnapshot | null> {
  let entry: Stats
  try {
    entry = await fileSystem.lstat(path)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) {
      return null
    }
    throw error
  }

  requireUnaliasedRegularFile(path, entry)
  const handle = await fileSystem.open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat()
    requireUnaliasedRegularFile(path, opened)
    const entryIdentity = { device: entry.dev, inode: entry.ino }
    const openedIdentity = { device: opened.dev, inode: opened.ino }
    if (!sameFile(entryIdentity, openedIdentity)) {
      throw new Error(`Cheap LFS refuses a workflow that changed at ${path}.`)
    }

    const contents = await handle.readFile('utf8')
    if (Buffer.byteLength(contents, 'utf8') > MaximumManagedWorkflowBytes) {
      throw new Error(
        `Cheap LFS refuses an oversized workflow file at ${path}.`
      )
    }
    const after = await fileSystem.lstat(path)
    requireUnaliasedRegularFile(path, after)
    if (!sameFile(openedIdentity, { device: after.dev, inode: after.ino })) {
      throw new Error(`Cheap LFS refuses a workflow that changed at ${path}.`)
    }
    return { contents, ...openedIdentity }
  } finally {
    await handle.close()
  }
}

async function requireSafeDirectory(
  path: string,
  fileSystem: ICheapLfsWorkflowFileSystem
): Promise<void> {
  const metadata = await fileSystem.lstat(path)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(
      `Cheap LFS refuses a symbolic link, junction, or non-directory at ${path}.`
    )
  }
  const canonical = await fileSystem.realpath(path)
  if (!pathsEqual(canonical, path)) {
    throw new Error(
      `Cheap LFS refuses a redirected workflow directory at ${path}.`
    )
  }
}

async function safeWorkflowPath(
  repositoryPath: string,
  create: boolean,
  fileSystem: ICheapLfsWorkflowFileSystem
): Promise<{ readonly path: string; readonly parentExists: boolean }> {
  const requestedRoot = resolve(repositoryPath)
  const requestedRootMetadata = await fileSystem.lstat(requestedRoot)
  if (
    requestedRootMetadata.isSymbolicLink() ||
    !requestedRootMetadata.isDirectory()
  ) {
    throw new Error(
      `Cheap LFS refuses a symbolic link, junction, or non-directory at ${requestedRoot}.`
    )
  }
  // Windows may present a normal directory through an 8.3 spelling. Use the
  // canonical root from here on without treating that spelling as a reparse
  // point; lstat above still rejects an actual repository-root link/junction.
  const root = await fileSystem.realpath(requestedRoot)
  await requireSafeDirectory(root, fileSystem)

  let parent = root
  for (const segment of ['.github', 'workflows']) {
    const candidate = join(parent, segment)
    try {
      await requireSafeDirectory(candidate, fileSystem)
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error
      }
      if (!create) {
        return {
          path: join(
            root,
            ...CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH.split('/')
          ),
          parentExists: false,
        }
      }
      try {
        await fileSystem.mkdir(candidate)
      } catch (mkdirError) {
        if (!isFileSystemError(mkdirError, 'EEXIST')) {
          throw mkdirError
        }
      }
      await requireSafeDirectory(candidate, fileSystem)
    }
    parent = candidate
  }

  return {
    path: join(parent, 'cheap-lfs-cloud-compression.yml'),
    parentExists: true,
  }
}

async function writeSyncedExclusive(
  path: string,
  contents: string,
  fileSystem: ICheapLfsWorkflowFileSystem
): Promise<void> {
  let handle: ICheapLfsWorkflowFileHandle | null = null
  try {
    handle = await fileSystem.open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NoFollowFlag,
      0o600
    )
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
  } catch (error) {
    await handle?.close().catch(() => {})
    await fileSystem.unlink(path).catch(() => {})
    throw error
  }
}

async function publishExclusive(
  source: string,
  destination: string,
  fileSystem: ICheapLfsWorkflowFileSystem
): Promise<void> {
  try {
    // A hard-link publication is atomic and, unlike rename on POSIX, cannot
    // overwrite a destination created by a concurrent editor.
    await fileSystem.link(source, destination)
  } catch (error) {
    if (isFileSystemError(error, 'EEXIST')) {
      throw new Error(
        `Cheap LFS did not overwrite a workflow created while updating ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    throw error
  }
}

async function replaceManagedWorkflow(
  path: string,
  current: ICheapLfsWorkflowSnapshot | null,
  next: string,
  fileSystem: ICheapLfsWorkflowFileSystem,
  shouldProceed: () => boolean
): Promise<ICheapLfsWorkflowSnapshot | null> {
  if (!shouldProceed()) {
    return current
  }
  const directory = dirname(path)
  const temporary = join(
    directory,
    `.cheap-lfs-cloud-compression.yml.desktop-material-temp-${
      process.pid
    }-${randomUUID()}`
  )
  let temporaryExists = true

  await writeSyncedExclusive(temporary, next, fileSystem)
  try {
    let staged = await readWorkflowSnapshot(temporary, fileSystem)
    if (staged === null || staged.contents !== next) {
      throw new Error(
        `Cheap LFS could not verify the staged workflow at ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    const latest = await readWorkflowSnapshot(path, fileSystem)
    if (
      (current === null && latest !== null) ||
      (current !== null &&
        (latest === null ||
          latest.contents !== current.contents ||
          !sameFile(latest, current)))
    ) {
      throw new Error(
        `Cheap LFS did not overwrite a workflow that changed while updating ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }

    await requireSafeDirectory(directory, fileSystem)
    if (!shouldProceed()) {
      return current
    }
    if (current === null) {
      if ((await readWorkflowSnapshot(path, fileSystem)) !== null) {
        throw new Error(
          `Cheap LFS did not overwrite a workflow created while updating ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
        )
      }
      await publishExclusive(temporary, path, fileSystem)
      const linked = await fileSystem.lstat(path)
      if (
        linked.isSymbolicLink() ||
        !linked.isFile() ||
        !sameFile(staged, { device: linked.dev, inode: linked.ino }) ||
        linked.nlink !== 2
      ) {
        if (
          !linked.isSymbolicLink() &&
          linked.isFile() &&
          sameFile(staged, { device: linked.dev, inode: linked.ino })
        ) {
          await fileSystem.unlink(path)
        }
        throw new Error(
          `Cheap LFS refuses an aliased workflow publication at ${path}.`
        )
      }
      await fileSystem.unlink(temporary)
      temporaryExists = false
    } else {
      // Revalidate immediately before the one atomic directory-entry swap.
      // rename replaces an entry rather than following a symlink. If Windows
      // denies replacement, the original remains intact and the staged sibling
      // is cleaned in finally; never unlink the destination first.
      const beforeRename = await readWorkflowSnapshot(path, fileSystem)
      staged = await readWorkflowSnapshot(temporary, fileSystem)
      if (
        beforeRename === null ||
        beforeRename.contents !== current.contents ||
        !sameFile(beforeRename, current) ||
        staged === null ||
        staged.contents !== next
      ) {
        throw new Error(
          `Cheap LFS did not overwrite a workflow that changed while updating ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
        )
      }
      if (!shouldProceed()) {
        return current
      }
      await fileSystem.rename(temporary, path)
      temporaryExists = false
    }

    const published = await readWorkflowSnapshot(path, fileSystem)
    if (
      published === null ||
      published.contents !== next ||
      !sameFile(published, staged)
    ) {
      throw new Error(
        `Cheap LFS could not verify the updated workflow at ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    return published
  } finally {
    if (temporaryExists) {
      await fileSystem.unlink(temporary).catch(() => {})
    }
  }
}

async function serializeWorkflowWrite<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = WorkflowWrites.get(path) ?? Promise.resolve()
  let release = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const tail = previous.catch(() => {}).then(() => gate)
  WorkflowWrites.set(path, tail)
  await previous.catch(() => {})
  try {
    return await operation()
  } finally {
    release()
    if (WorkflowWrites.get(path) === tail) {
      WorkflowWrites.delete(path)
    }
  }
}

/**
 * Add or update only Desktop Material's owned workflow file. This never stages,
 * commits, or pushes: the generated change remains visible for user review.
 *
 * A confirmed-public repository gains the public caller automatically. A
 * confirmed-private repository gains the private caller only after explicit
 * opt-in; disabling that choice closes an existing managed caller. Unknown
 * visibility still fails closed.
 */
export async function ensureCheapLfsCloudCompressionWorkflow(
  repository: Repository,
  preferences: IBuildRunPreferences = repository.buildRunPreferences,
  fileSystem: ICheapLfsWorkflowFileSystem = nodeWorkflowFileSystem,
  shouldProceed: () => boolean = () => true
): Promise<ICheapLfsWorkflowMutationResult> {
  const policy = getCheapLfsCloudCompressionPolicy(repository, preferences)
  const requestedPath = resolve(
    repository.path,
    ...CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH.split('/')
  )
  return await serializeWorkflowWrite(requestedPath, async () => {
    if (!shouldProceed()) {
      return { path: requestedPath, changed: false, policy, snapshot: null }
    }
    const enabled = cheapLfsCloudCompressionUsesInRepoWorkflow(policy)
    let safePath = await safeWorkflowPath(repository.path, enabled, fileSystem)
    let current = safePath.parentExists
      ? await readWorkflowSnapshot(safePath.path, fileSystem)
      : null
    if (!enabled && current === null) {
      return { path: safePath.path, changed: false, policy, snapshot: null }
    }
    if (
      current !== null &&
      !current.contents.startsWith(ManagedWorkflowMarker)
    ) {
      throw new Error(
        `Cheap LFS did not overwrite the existing unowned workflow at ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }

    const next = renderCheapLfsCloudCompressionWorkflow(
      policy === 'enabled-private'
    )
    if (current?.contents === next) {
      return { path: safePath.path, changed: false, policy, snapshot: current }
    }
    if (!shouldProceed()) {
      return { path: safePath.path, changed: false, policy, snapshot: current }
    }

    // Re-resolve after any directory creation and use only the validated path.
    safePath = await safeWorkflowPath(repository.path, true, fileSystem)
    current = await readWorkflowSnapshot(safePath.path, fileSystem)
    if (
      current !== null &&
      !current.contents.startsWith(ManagedWorkflowMarker)
    ) {
      throw new Error(
        `Cheap LFS did not overwrite the existing unowned workflow at ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    if (current?.contents === next) {
      return { path: safePath.path, changed: false, policy, snapshot: current }
    }
    const snapshot = await replaceManagedWorkflow(
      safePath.path,
      current,
      next,
      fileSystem,
      shouldProceed
    )
    return {
      path: safePath.path,
      changed: !cheapLfsWorkflowSnapshotsMatch(snapshot, current),
      policy,
      snapshot,
    }
  })
}

/**
 * Remove only Desktop Material's owned caller.
 *
 * Public repositories that move away from Release storage cannot retain a
 * "closed" private guard: the public half of that same guard would still run.
 * The provider transition therefore removes the managed caller with the same
 * path, ownership, alias, and size checks used by the writer. An absent caller
 * remains absent and an unowned caller is never removed.
 */
export async function removeCheapLfsCloudCompressionWorkflow(
  repository: Repository,
  preferences: IBuildRunPreferences = repository.buildRunPreferences,
  fileSystem: ICheapLfsWorkflowFileSystem = nodeWorkflowFileSystem,
  shouldProceed: () => boolean = () => true
): Promise<ICheapLfsWorkflowMutationResult> {
  const policy = getCheapLfsCloudCompressionPolicy(repository, preferences)
  const requestedPath = resolve(
    repository.path,
    ...CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH.split('/')
  )
  return await serializeWorkflowWrite(requestedPath, async () => {
    if (!shouldProceed()) {
      return { path: requestedPath, changed: false, policy, snapshot: null }
    }
    const safePath = await safeWorkflowPath(repository.path, false, fileSystem)
    if (!safePath.parentExists) {
      return { path: safePath.path, changed: false, policy, snapshot: null }
    }
    const current = await readWorkflowSnapshot(safePath.path, fileSystem)
    if (current === null) {
      return { path: safePath.path, changed: false, policy, snapshot: null }
    }
    if (!current.contents.startsWith(ManagedWorkflowMarker)) {
      throw new Error(
        `Cheap LFS did not remove the existing unowned workflow at ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    const latest = await readWorkflowSnapshot(safePath.path, fileSystem)
    if (
      latest === null ||
      latest.contents !== current.contents ||
      !sameFile(latest, current)
    ) {
      throw new Error(
        `Cheap LFS did not remove a workflow that changed while updating ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    await requireSafeDirectory(dirname(safePath.path), fileSystem)
    if (!shouldProceed()) {
      return { path: safePath.path, changed: false, policy, snapshot: current }
    }
    await fileSystem.unlink(safePath.path)
    if ((await readWorkflowSnapshot(safePath.path, fileSystem)) !== null) {
      throw new Error(
        `Cheap LFS could not verify removal of ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    return { path: safePath.path, changed: true, policy, snapshot: null }
  })
}

/**
 * Restore the exact app-owned working-tree bytes observed before a superseded
 * reconcile. This is intentionally narrower than a generic file writer: both
 * the saved bytes and any current occupant must be managed, and `null` can
 * remove only a managed current occupant.
 */
export async function restoreCheapLfsCloudCompressionWorkflowSnapshot(
  repository: Repository,
  contents: string | null,
  expectedCurrent: ICheapLfsWorkflowSnapshot | null,
  fileSystem: ICheapLfsWorkflowFileSystem = nodeWorkflowFileSystem
): Promise<void> {
  if (
    contents !== null &&
    !contents.startsWith(CHEAP_LFS_MANAGED_WORKFLOW_MARKER)
  ) {
    throw new Error('Cheap LFS refused an unowned workflow rollback snapshot.')
  }
  if (
    expectedCurrent !== null &&
    !expectedCurrent.contents.startsWith(CHEAP_LFS_MANAGED_WORKFLOW_MARKER)
  ) {
    throw new Error(
      'Cheap LFS refused an unowned current workflow rollback snapshot.'
    )
  }
  const requestedPath = resolve(
    repository.path,
    ...CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH.split('/')
  )
  await serializeWorkflowWrite(requestedPath, async () => {
    let safePath = await safeWorkflowPath(
      repository.path,
      contents !== null,
      fileSystem
    )
    let current = safePath.parentExists
      ? await readWorkflowSnapshot(safePath.path, fileSystem)
      : null
    if (!cheapLfsWorkflowSnapshotsMatch(current, expectedCurrent)) {
      throw new Error(
        `Cheap LFS did not overwrite a workflow that changed while rolling back ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    if (
      current?.contents === contents ||
      (current === null && contents === null)
    ) {
      return
    }
    if (contents === null) {
      await requireSafeDirectory(dirname(safePath.path), fileSystem)
      const latest = await readWorkflowSnapshot(safePath.path, fileSystem)
      if (!cheapLfsWorkflowSnapshotsMatch(latest, expectedCurrent)) {
        throw new Error(
          `Cheap LFS did not remove a workflow that changed while rolling back ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
        )
      }
      await fileSystem.unlink(safePath.path)
      if ((await readWorkflowSnapshot(safePath.path, fileSystem)) !== null) {
        throw new Error(
          `Cheap LFS could not verify rollback removal of ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
        )
      }
      return
    }
    safePath = await safeWorkflowPath(repository.path, true, fileSystem)
    current = await readWorkflowSnapshot(safePath.path, fileSystem)
    if (!cheapLfsWorkflowSnapshotsMatch(current, expectedCurrent)) {
      throw new Error(
        `Cheap LFS did not overwrite a workflow that changed while rolling back ${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}.`
      )
    }
    await replaceManagedWorkflow(
      safePath.path,
      current,
      contents,
      fileSystem,
      () => true
    )
  })
}

/**
 * Read the workflow path without creating a directory, a file, or anything
 * else. Used by the background installer to decide, before it touches the
 * repository at all, whether a caller is already present.
 *
 * Every hardening `ensureCheapLfsCloudCompressionWorkflow` applies to a read
 * applies here too — a symlink, junction, hard link, non-regular file, or
 * oversized file at the path throws rather than being reported as content.
 */
export async function inspectCheapLfsCloudCompressionWorkflow(
  repository: Repository,
  preferences: IBuildRunPreferences = repository.buildRunPreferences,
  fileSystem: ICheapLfsWorkflowFileSystem = nodeWorkflowFileSystem
): Promise<ICheapLfsWorkflowInspection> {
  const policy = getCheapLfsCloudCompressionPolicy(repository, preferences)
  const canonicalContents = renderCheapLfsCloudCompressionWorkflow(
    policy === 'enabled-private'
  )
  const safePath = await safeWorkflowPath(repository.path, false, fileSystem)
  const snapshot = safePath.parentExists
    ? await readWorkflowSnapshot(safePath.path, fileSystem)
    : null
  return {
    path: safePath.path,
    contents: snapshot?.contents ?? null,
    snapshot,
    canonicalContents,
    policy,
  }
}
