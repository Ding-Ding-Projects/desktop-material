import { createHash, randomBytes } from 'crypto'
import { createReadStream } from 'fs'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import { dirname, join, relative, resolve, sep } from 'path'
import { pipeline } from 'stream/promises'

import { Repository } from '../../models/repository'
import { git } from '../git/core'
import { resolveCheapLfsGitDirectories } from './scratch-storage'
import {
  foldIgnoredPath,
  getIgnoredPathStructuralRejection,
  getIgnoredSubmoduleDestinationError,
  IgnoredSubmoduleDestinationError,
  IIgnoredSubmoduleRejection,
  isIgnoredPathWithin,
  MaximumIgnoredCandidates,
  MaximumIgnoredSelection,
  normalizeIgnoredPath,
  resolveDestinationSelection,
} from './ignored-submodule-plan'

/**
 * The local phase of "ignored files to a local Cheap LFS submodule".
 *
 * ## What this module does
 *
 * 1. Enumerates the working files Git itself currently proves are ignored.
 * 2. Re-proves and validates a user's selection, fail-closed, against links,
 *    reparse points, nested repositories, Git control paths, case-colliding
 *    destinations, path escapes, and a stale inventory.
 * 3. Copies every selected file into a newly created local repository and
 *    proves each copy byte-for-byte by size and SHA-256 **before** the first
 *    index mutation anywhere and long before `git submodule add`.
 * 4. Registers that repository as a submodule of the parent at a safe,
 *    non-overlapping path.
 * 5. Re-verifies that every original still exists, unchanged, at its exact
 *    original path, and only then deletes the independent recovery copies.
 *
 * ## What this module deliberately does not do
 *
 * It never uploads a Cheap LFS object, never creates a provider repository,
 * never adds a remote, never converts a working file into a pointer, and never
 * pushes. Those belong to a separate, explicitly opted-into phase which does
 * not exist yet; see `IgnoredSubmoduleDeferredPhase`. This module imports no
 * upload, provider, or push code at all, and a source test asserts that.
 *
 * ## Why the originals are never moved
 *
 * The whole point of the workflow is that a build output, a virtual
 * environment, or a model checkpoint keeps working from the path the tools
 * that produced it expect. Replacing an original with a link would break every
 * tool that resolves the path itself, and would make an interrupted run
 * unrecoverable. So the originals are read and never written.
 */

/** How many paths are proven ignored per `git check-ignore` invocation. */
const IgnoreProofChunkSize = 512

/** The independent recovery copies live here, outside the working tree. */
const RecoveryRootSegments = [
  'desktop-material',
  'ignored-submodule-recovery',
] as const

/** The manifest filename which names everything a crash left behind. */
export const IgnoredSubmoduleRecoveryManifestName = 'recovery-manifest.json'

/** The exact Git rule which proves a path is currently ignored. */
export interface IIgnoreProof {
  /** The exclude source, e.g. `.gitignore` or `.git/info/exclude`. */
  readonly source: string
  /** The one-based line number within that source. */
  readonly line: number
  /** The pattern on that line. */
  readonly pattern: string
}

/** One ignored working file, as it looked when the inventory was captured. */
export interface IIgnoredFileCandidate {
  /** Repository-relative path in Git's portable slash form. */
  readonly path: string
  /** Size in bytes at capture time. */
  readonly size: number
  /** Modification time in milliseconds at capture time. */
  readonly modifiedAtMs: number
  /** The Git rule which proved this path ignored at capture time. */
  readonly proof: IIgnoreProof
}

/** A point-in-time snapshot of the ignored working files of a repository. */
export interface IIgnoredFileInventory {
  /** Random identity so a selection cannot be replayed onto a later scan. */
  readonly id: string
  /** When the snapshot was captured. */
  readonly capturedAtMs: number
  /** The repository the snapshot describes. */
  readonly repositoryPath: string
  /** Every proven-ignored regular file, sorted by path. */
  readonly candidates: ReadonlyArray<IIgnoredFileCandidate>
  /** True when Git reported more ignored paths than the cap allows. */
  readonly truncated: boolean
}

/** What the caller asked for, after the user reviewed it. */
export interface IIgnoredSubmoduleRequest {
  /** Repository-relative folder the new submodule will occupy. */
  readonly destinationPath: string
  /** Repository-relative paths the user selected, in display order. */
  readonly selectedPaths: ReadonlyArray<string>
  /** The commit message for the single commit in the new repository. */
  readonly commitMessage?: string
}

/** A selection which survived every check, ready to be copied. */
export interface IAcceptedIgnoredFile {
  readonly candidate: IIgnoredFileCandidate
  /** Absolute physical path of the original. */
  readonly absolutePath: string
}

/** The outcome of validating a reviewed request. */
export interface IIgnoredSubmoduleValidation {
  readonly accepted: ReadonlyArray<IAcceptedIgnoredFile>
  readonly rejected: ReadonlyArray<IIgnoredSubmoduleRejection>
  readonly destinationError: IgnoredSubmoduleDestinationError | null
}

/** The proof recorded for one staged file. */
export interface IIgnoredSubmoduleStagedFile {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

/** The named phases, in the exact order a successful run passes through them. */
export type IgnoredSubmodulePhase =
  | 'validate'
  | 'hash-originals'
  | 'recovery-copy'
  | 'stage-copy'
  | 'initialize-repository'
  | 'topology'
  | 'final-verification'
  | 'cleanup'

/** The result of a completed local staging operation. */
export interface IIgnoredSubmoduleResult {
  /** Repository-relative folder the submodule now occupies. */
  readonly destinationPath: string
  /** Every file staged into the new repository, with its proof. */
  readonly stagedFiles: ReadonlyArray<IIgnoredSubmoduleStagedFile>
  /** The single commit created inside the new repository. */
  readonly commitSha: string
  /** Total bytes copied. */
  readonly totalBytes: number
  /**
   * Where the independent recovery copies were kept. `null` once they have
   * been removed, which only happens after every original passed final
   * verification.
   */
  readonly retainedRecoveryDirectory: string | null
}

/** Injectable primitives so tests can simulate a corrupted copy or a race. */
export interface IIgnoredSubmoduleDependencies {
  /**
   * Compute the SHA-256 of a file. Overridable so a test can prove that a
   * failed copy proof aborts before any index mutation.
   */
  readonly hashFile?: (absolutePath: string) => Promise<string>
  /** Called as each named phase begins. */
  readonly onPhase?: (phase: IgnoredSubmodulePhase) => void | Promise<void>
  /** Bounded human-readable progress, already localized by the caller. */
  readonly onProgress?: (completed: number, total: number) => void
}

/** Thrown when a reviewed request cannot be executed. Nothing was changed. */
export class IgnoredSubmoduleRejectedError extends Error {
  public readonly rejections: ReadonlyArray<IIgnoredSubmoduleRejection>
  public readonly destinationError: IgnoredSubmoduleDestinationError | null

  public constructor(
    message: string,
    rejections: ReadonlyArray<IIgnoredSubmoduleRejection>,
    destinationError: IgnoredSubmoduleDestinationError | null
  ) {
    super(message)
    this.name = 'IgnoredSubmoduleRejectedError'
    this.rejections = rejections
    this.destinationError = destinationError
  }
}

/**
 * Thrown when a proof failed after work had begun. The originals were never
 * written to, and this error names the directory holding the independent
 * recovery copies so a human can always get back to a known state.
 */
export class IgnoredSubmoduleProofError extends Error {
  public readonly retainedRecoveryDirectory: string | null
  public readonly phase: IgnoredSubmodulePhase

  public constructor(
    message: string,
    phase: IgnoredSubmodulePhase,
    retainedRecoveryDirectory: string | null
  ) {
    super(message)
    this.name = 'IgnoredSubmoduleProofError'
    this.phase = phase
    this.retainedRecoveryDirectory = retainedRecoveryDirectory
  }
}

async function sha256OfFile(absolutePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(absolutePath), hash)
  return hash.digest('hex')
}

/**
 * Parse `git status --porcelain=1 -z` and return only the ignored paths.
 *
 * Rename and copy entries occupy two NUL-separated records, so the extra
 * record is consumed rather than mistaken for a second path.
 */
export function parseIgnoredStatusPaths(stdout: string): ReadonlyArray<string> {
  const records = stdout.split('\0')
  const paths = new Array<string>()

  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (record.length < 4) {
      continue
    }

    const x = record[0]
    const y = record[1]
    const path = record.slice(3)

    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      // The origin path follows in its own record; never read it as an entry.
      index++
      continue
    }

    if (x === '!' && y === '!') {
      paths.push(normalizeIgnoredPath(path))
    }
  }

  return paths
}

/** Parse the NUL-separated quadruples emitted by `git check-ignore -v -z`. */
export function parseIgnoreProofs(
  stdout: string
): ReadonlyMap<string, IIgnoreProof> {
  const proofs = new Map<string, IIgnoreProof>()
  const fields = stdout.split('\0')

  // `<source> NUL <line> NUL <pattern> NUL <pathname> NUL`
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const source = fields[index]
    const line = Number.parseInt(fields[index + 1], 10)
    const pattern = fields[index + 2]
    const path = normalizeIgnoredPath(fields[index + 3])

    if (path.length === 0) {
      continue
    }

    proofs.set(path, {
      source,
      line: Number.isFinite(line) ? line : 0,
      pattern,
    })
  }

  return proofs
}

/**
 * Ask Git — and only Git — which of these paths it currently proves ignored.
 *
 * `git check-ignore -v -z --stdin` is deliberately run **without**
 * `--no-index`. Git skips tracked paths in that mode, so a file which is in
 * the index can never come back with a proof, no matter what a `.gitignore`
 * line says about it. That is the property the whole workflow rests on: only a
 * file whose bytes exist nowhere in Git history is eligible to be copied into
 * a new repository. Exit code 1 means "none of these are ignored" and is a
 * successful, empty answer rather than an error.
 */
export async function proveIgnoredPaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<ReadonlyMap<string, IIgnoreProof>> {
  const proofs = new Map<string, IIgnoreProof>()
  const usable = paths
    .map(normalizeIgnoredPath)
    .filter(path => getIgnoredPathStructuralRejection(path) === null)

  for (let start = 0; start < usable.length; start += IgnoreProofChunkSize) {
    const chunk = usable.slice(start, start + IgnoreProofChunkSize)
    const { stdout } = await git(
      ['check-ignore', '-v', '-z', '--stdin'],
      repository.path,
      'proveIgnoredPaths',
      {
        stdin: chunk.join('\0'),
        // 0: at least one path is ignored. 1: none are. Both are answers.
        successExitCodes: new Set([0, 1]),
      }
    )

    for (const [path, proof] of parseIgnoreProofs(stdout)) {
      proofs.set(path, proof)
    }
  }

  return proofs
}

/**
 * Capture the ignored working files of a repository.
 *
 * Enumeration uses `git status --porcelain=1 -z --untracked-files=all
 * --ignored=traditional`, which is Git's own working-tree scan: it honours
 * every exclude source (`.gitignore` at any depth, `.git/info/exclude`,
 * `core.excludesFile`) and, because `--untracked-files=all` is combined with
 * `--ignored=traditional`, it expands ignored directories into their
 * individual files instead of collapsing them into one directory entry. No
 * `.gitignore` file is ever parsed by this app.
 *
 * Every enumerated path is then individually proven with `git check-ignore`,
 * and only regular, non-link files with a proof become candidates.
 */
export async function listIgnoredFileInventory(
  repository: Repository,
  maximumCandidates: number = MaximumIgnoredCandidates
): Promise<IIgnoredFileInventory> {
  const { stdout } = await git(
    [
      'status',
      '--porcelain=1',
      '-z',
      '--untracked-files=all',
      '--ignored=traditional',
    ],
    repository.path,
    'listIgnoredFileInventory'
  )

  const reported = parseIgnoredStatusPaths(stdout).filter(
    path => getIgnoredPathStructuralRejection(path) === null
  )
  const truncated = reported.length > maximumCandidates
  const bounded = truncated ? reported.slice(0, maximumCandidates) : reported
  const proofs = await proveIgnoredPaths(repository, bounded)

  const candidates = new Array<IIgnoredFileCandidate>()
  for (const path of bounded) {
    const proof = proofs.get(path)
    if (proof === undefined) {
      continue
    }

    try {
      const entry = await lstat(join(repository.path, path))
      if (entry.isSymbolicLink() || !entry.isFile()) {
        continue
      }
      candidates.push({
        path,
        size: entry.size,
        modifiedAtMs: entry.mtimeMs,
        proof,
      })
    } catch {
      // Vanished between the scan and the stat; it is simply not a candidate.
    }
  }

  candidates.sort((first, second) => first.path.localeCompare(second.path))

  return {
    id: randomBytes(16).toString('hex'),
    capturedAtMs: Date.now(),
    repositoryPath: repository.path,
    candidates,
    truncated,
  }
}

/** Read the paths every declared or indexed submodule already occupies. */
async function readOccupiedSubmodulePaths(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const paths = new Set<string>()

  const declared = await git(
    [
      'config',
      '-f',
      '.gitmodules',
      '-z',
      '--get-regexp',
      '^submodule\\..*\\.path$',
    ],
    repository.path,
    'readDeclaredSubmodulePaths',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  for (const record of declared.stdout.split('\0')) {
    const newline = record.indexOf('\n')
    if (newline > 0) {
      paths.add(normalizeIgnoredPath(record.slice(newline + 1)))
    }
  }

  const indexed = await git(
    ['ls-files', '--stage', '-z'],
    repository.path,
    'readIndexedSubmodulePaths',
    { successExitCodes: new Set([0, 128]) }
  )
  for (const record of indexed.stdout.split('\0')) {
    const match = /^160000 [0-9a-fA-F]{40,64} [0-3]\t([\s\S]+)$/.exec(record)
    if (match !== null) {
      paths.add(normalizeIgnoredPath(match[1]))
    }
  }

  return [...paths].filter(path => path.length > 0)
}

/** Whether the directory exists and holds no entries. */
async function isEmptyOrAbsentDirectory(
  absolutePath: string
): Promise<boolean> {
  try {
    const entry = await lstat(absolutePath)
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      return false
    }
    return (await readdir(absolutePath)).length === 0
  } catch {
    return true
  }
}

/**
 * Validate the destination folder the new submodule would occupy.
 *
 * Every failure is fail-closed. The path must be relative and inside the
 * repository, must avoid Git's control directories, must not overlap an
 * existing submodule, must resolve to a physical location inside the real
 * repository root (so a junction cannot redirect it), must be absent or an
 * empty directory, and must not itself be ignored — `git submodule add`
 * refuses an ignored path without `--force`, and forcing it is exactly the
 * kind of override this workflow does not take.
 */
export async function validateIgnoredSubmoduleDestination(
  repository: Repository,
  destinationPath: string
): Promise<IgnoredSubmoduleDestinationError | null> {
  const path = normalizeIgnoredPath(destinationPath)
  const existing = await readOccupiedSubmodulePaths(repository)
  const structural = getIgnoredSubmoduleDestinationError(path, existing)
  if (structural !== null) {
    return structural
  }

  const root = await realpath(repository.path).catch(() => repository.path)
  const absolute = resolve(root, path)
  const within = relative(root, absolute)
  if (within.length === 0 || within === '..' || within.startsWith(`..${sep}`)) {
    return 'absolute'
  }

  try {
    const entry = await lstat(absolute)
    if (entry.isSymbolicLink()) {
      return 'unsafe-link'
    }
    const physical = await realpath(absolute)
    if (foldIgnoredPath(physical) !== foldIgnoredPath(absolute)) {
      return 'unsafe-link'
    }
  } catch {
    // Absent is the expected, best case.
  }

  if (!(await isEmptyOrAbsentDirectory(absolute))) {
    return 'occupied'
  }

  const proofs = await proveIgnoredPaths(repository, [path])
  if (proofs.has(path)) {
    return 'ignored'
  }

  return null
}

/**
 * Whether any ancestor directory strictly between the repository root and the
 * file is itself a Git repository, which would put the file inside a nested
 * repository rather than this one.
 */
async function findNestedRepositoryRoot(
  repositoryRoot: string,
  relativePath: string
): Promise<string | null> {
  const segments = normalizeIgnoredPath(relativePath).split('/')

  for (let depth = 1; depth < segments.length; depth++) {
    const ancestor = segments.slice(0, depth).join('/')
    try {
      await lstat(join(repositoryRoot, ancestor, '.git'))
      return ancestor
    } catch {
      // No `.git` here; keep walking down.
    }
  }

  return null
}

/**
 * Re-prove and re-check a reviewed selection immediately before it is used.
 *
 * Nothing here trusts the inventory: every path is proven ignored again, stat
 * again, resolved again, and compared against the snapshot. A file whose size
 * or modification time moved since the user reviewed it is refused as stale
 * rather than copied, because the bytes the user approved are no longer the
 * bytes on disk.
 */
export async function validateIgnoredSubmoduleSelection(
  repository: Repository,
  inventory: IIgnoredFileInventory,
  request: IIgnoredSubmoduleRequest
): Promise<IIgnoredSubmoduleValidation> {
  const destinationPath = normalizeIgnoredPath(request.destinationPath)
  const destinationError = await validateIgnoredSubmoduleDestination(
    repository,
    destinationPath
  )

  const rejected = new Array<IIgnoredSubmoduleRejection>()
  const accepted = new Array<IAcceptedIgnoredFile>()

  const selected = request.selectedPaths.map(normalizeIgnoredPath)
  if (selected.length > MaximumIgnoredSelection) {
    for (const path of selected.slice(MaximumIgnoredSelection)) {
      rejected.push({
        path,
        reason: 'stale-inventory',
        detail: `Only ${MaximumIgnoredSelection} files can be staged in one operation.`,
      })
    }
  }
  const bounded = selected.slice(0, MaximumIgnoredSelection)

  const selection = resolveDestinationSelection(bounded)
  for (const collision of selection.rejections) {
    rejected.push(collision)
  }
  const survivors = selection.survivors

  const inventoryByPath = new Map(
    inventory.candidates.map(candidate => [candidate.path, candidate])
  )
  const proofs = await proveIgnoredPaths(repository, survivors)
  const root = await realpath(repository.path).catch(() => repository.path)

  for (const path of survivors) {
    const structural = getIgnoredPathStructuralRejection(path)
    if (structural !== null) {
      rejected.push(structural)
      continue
    }

    if (
      destinationPath.length > 0 &&
      isIgnoredPathWithin(destinationPath, path)
    ) {
      rejected.push({
        path,
        reason: 'inside-destination',
        detail: `'${path}' is inside the new submodule folder '${destinationPath}'.`,
      })
      continue
    }

    // The filesystem hazards are checked before the inventory is consulted, so
    // a link, a junction, or a nested repository is always reported as what it
    // actually is rather than as a generic stale entry.
    const absolute = join(root, ...path.split('/'))

    let entry
    try {
      entry = await lstat(absolute)
    } catch {
      rejected.push({
        path,
        reason: 'stale-inventory',
        detail: 'The file no longer exists at this path.',
      })
      continue
    }

    if (entry.isSymbolicLink()) {
      rejected.push({
        path,
        reason: 'symbolic-link',
        detail: 'The path is a link and is never followed.',
      })
      continue
    }

    if (!entry.isFile()) {
      rejected.push({
        path,
        reason: 'not-regular-file',
        detail: 'The path is not a regular file.',
      })
      continue
    }

    let physical: string
    try {
      physical = await realpath(absolute)
    } catch {
      rejected.push({
        path,
        reason: 'stale-inventory',
        detail: 'The physical location of the file could not be resolved.',
      })
      continue
    }

    if (foldIgnoredPath(physical) !== foldIgnoredPath(absolute)) {
      const inside =
        relative(root, physical).startsWith(`..${sep}`) ||
        relative(root, physical) === '..'
      rejected.push({
        path,
        reason: inside ? 'path-escape' : 'reparse-point',
        detail: `The path reaches '${physical}' through a link, junction, or mount point.`,
      })
      continue
    }

    const nested = await findNestedRepositoryRoot(root, path)
    if (nested !== null) {
      rejected.push({
        path,
        reason: 'nested-repository',
        detail: `'${nested}' is a separate Git repository.`,
      })
      continue
    }

    if (!proofs.has(path)) {
      rejected.push({
        path,
        reason: 'not-proven-ignored',
        detail: 'Git does not currently prove this path is ignored.',
      })
      continue
    }

    const candidate = inventoryByPath.get(path)
    if (candidate === undefined) {
      rejected.push({
        path,
        reason: 'stale-inventory',
        detail: 'The path is not part of the reviewed inventory.',
      })
      continue
    }

    if (
      entry.size !== candidate.size ||
      entry.mtimeMs !== candidate.modifiedAtMs
    ) {
      rejected.push({
        path,
        reason: 'stale-inventory',
        detail: `The file changed since it was reviewed (${candidate.size} bytes at ${candidate.modifiedAtMs}, now ${entry.size} bytes at ${entry.mtimeMs}).`,
      })
      continue
    }

    accepted.push({ candidate, absolutePath: absolute })
  }

  return { accepted, rejected, destinationError }
}

/** The on-disk shape of a retained recovery manifest. */
interface IRecoveryManifest {
  readonly version: 1
  readonly createdAtMs: number
  readonly parentRepositoryPath: string
  readonly destinationPath: string
  readonly recoveryDirectory: string
  readonly files: ReadonlyArray<{
    readonly path: string
    readonly size: number
    readonly sha256: string
  }>
}

async function createRecoveryDirectory(
  repository: Repository
): Promise<string> {
  const directories = await resolveCheapLfsGitDirectories(repository.path)
  const base =
    directories === null
      ? join(repository.path, '.git', ...RecoveryRootSegments)
      : join(directories.gitDir, ...RecoveryRootSegments)
  const root = join(base, `run-${Date.now()}-${randomBytes(6).toString('hex')}`)
  await mkdir(join(root, 'originals'), { recursive: true, mode: 0o700 })
  return root
}

async function copyAndProve(
  sourcePath: string,
  destinationPath: string,
  expectedSize: number,
  expectedSha256: string,
  hashFile: (absolutePath: string) => Promise<string>
): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true })
  await copyFile(sourcePath, destinationPath)

  const copied = await lstat(destinationPath)
  if (copied.isSymbolicLink() || !copied.isFile()) {
    throw new Error(`The copy at '${destinationPath}' is not a regular file.`)
  }
  if (copied.size !== expectedSize) {
    throw new Error(
      `The copy at '${destinationPath}' is ${copied.size} bytes; the original is ${expectedSize}.`
    )
  }

  const actual = await hashFile(destinationPath)
  if (actual !== expectedSha256) {
    throw new Error(
      `The copy at '${destinationPath}' hashes to ${actual}; the original hashes to ${expectedSha256}.`
    )
  }
}

/** Resolve the identity arguments a brand-new repository needs to commit. */
async function commitIdentityArguments(
  repositoryPath: string
): Promise<ReadonlyArray<string>> {
  const email = await git(
    ['config', '--get', 'user.email'],
    repositoryPath,
    'readIgnoredSubmoduleIdentity',
    { successExitCodes: new Set([0, 1]) }
  )
  if (email.stdout.trim().length > 0) {
    return []
  }

  // Only used when the machine has no identity at all; the user's own config
  // is never overridden.
  return [
    '-c',
    'user.name=Desktop Material',
    '-c',
    'user.email=desktop-material@localhost',
  ]
}

/**
 * Copy every selected ignored file into a newly created local repository and
 * register that repository as a submodule of the parent.
 *
 * ## The proof boundary
 *
 * Everything up to and including `stage-copy` is read-only with respect to the
 * parent repository: originals are only read, and the destination folder is a
 * freshly created, previously absent directory. The first index mutation
 * anywhere is `initialize-repository` (the new repository's own `git add` and
 * `git commit`), and the only change to the parent's topology is the single
 * `git submodule add` in `topology`. If any size or SHA-256 proof fails before
 * that point the operation aborts, the created destination folder is removed,
 * and the parent's index and `.gitmodules` are exactly as they were.
 *
 * ## Recovery
 *
 * Independent copies of every original are written under
 * `<git-dir>/desktop-material/ignored-submodule-recovery/<run>/originals/`,
 * outside the working tree where Git cannot see them, together with a manifest
 * naming the run. They are removed only after `final-verification` proves every
 * original is still byte-for-byte identical at its exact original path. A
 * failure at any point leaves them in place and names the directory in the
 * thrown error.
 */
export async function stageIgnoredFilesIntoLocalSubmodule(
  repository: Repository,
  inventory: IIgnoredFileInventory,
  request: IIgnoredSubmoduleRequest,
  dependencies: IIgnoredSubmoduleDependencies = {}
): Promise<IIgnoredSubmoduleResult> {
  const hashFile = dependencies.hashFile ?? sha256OfFile
  const onPhase = async (phase: IgnoredSubmodulePhase) => {
    await dependencies.onPhase?.(phase)
  }

  await onPhase('validate')
  const destinationPath = normalizeIgnoredPath(request.destinationPath)
  const validation = await validateIgnoredSubmoduleSelection(
    repository,
    inventory,
    request
  )

  if (validation.destinationError !== null || validation.rejected.length > 0) {
    throw new IgnoredSubmoduleRejectedError(
      'The reviewed selection cannot be staged; nothing was changed.',
      validation.rejected,
      validation.destinationError
    )
  }
  if (validation.accepted.length === 0) {
    throw new IgnoredSubmoduleRejectedError(
      'No file in the reviewed selection is still eligible; nothing was changed.',
      [],
      null
    )
  }

  await onPhase('hash-originals')
  const originals = new Array<IIgnoredSubmoduleStagedFile>()
  let completed = 0
  for (const file of validation.accepted) {
    originals.push({
      path: file.candidate.path,
      size: file.candidate.size,
      sha256: await hashFile(file.absolutePath),
    })
    completed++
    dependencies.onProgress?.(completed, validation.accepted.length)
  }

  await onPhase('recovery-copy')
  const recoveryDirectory = await createRecoveryDirectory(repository)
  let createdDestination = false
  const root = await realpath(repository.path).catch(() => repository.path)
  const destinationAbsolute = join(root, ...destinationPath.split('/'))

  const failWith = async (
    error: unknown,
    phase: IgnoredSubmodulePhase
  ): Promise<never> => {
    if (createdDestination) {
      await rm(destinationAbsolute, { recursive: true, force: true }).catch(
        () => undefined
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new IgnoredSubmoduleProofError(
      `${message} The originals were never written to; independent copies are retained at ${recoveryDirectory}.`,
      phase,
      recoveryDirectory
    )
  }

  try {
    for (const [index, file] of validation.accepted.entries()) {
      await copyAndProve(
        file.absolutePath,
        join(recoveryDirectory, 'originals', ...file.candidate.path.split('/')),
        originals[index].size,
        originals[index].sha256,
        hashFile
      )
    }

    const manifest: IRecoveryManifest = {
      version: 1,
      createdAtMs: Date.now(),
      parentRepositoryPath: root,
      destinationPath,
      recoveryDirectory,
      files: originals,
    }
    await writeFile(
      join(recoveryDirectory, IgnoredSubmoduleRecoveryManifestName),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    )
  } catch (error) {
    return failWith(error, 'recovery-copy')
  }

  // --- Copy and prove every staged byte. No index has been touched yet. ---
  await onPhase('stage-copy')
  try {
    await mkdir(destinationAbsolute, { recursive: true })
    createdDestination = true

    for (const [index, file] of validation.accepted.entries()) {
      await copyAndProve(
        file.absolutePath,
        join(destinationAbsolute, ...file.candidate.path.split('/')),
        originals[index].size,
        originals[index].sha256,
        hashFile
      )
      dependencies.onProgress?.(index + 1, validation.accepted.length)
    }
  } catch (error) {
    return failWith(error, 'stage-copy')
  }

  // --- Proofs are complete. Only now may an index exist. ---
  await onPhase('initialize-repository')
  let commitSha: string
  try {
    await git(['init'], destinationAbsolute, 'initIgnoredSubmoduleRepository')
    await git(
      ['add', '--all', '--'],
      destinationAbsolute,
      'stageIgnoredSubmoduleFiles'
    )
    const identity = await commitIdentityArguments(destinationAbsolute)
    await git(
      [
        ...identity,
        'commit',
        '--no-verify',
        '-m',
        request.commitMessage ??
          'Stage ignored working files / 收埋啲被忽略嘅檔案',
      ],
      destinationAbsolute,
      'commitIgnoredSubmoduleFiles'
    )
    const head = await git(
      ['rev-parse', 'HEAD'],
      destinationAbsolute,
      'readIgnoredSubmoduleHead'
    )
    commitSha = head.stdout.trim()
  } catch (error) {
    return failWith(error, 'initialize-repository')
  }

  // --- The single parent-topology change. ---
  await onPhase('topology')
  try {
    // Git only accepts a submodule URL which is absolute, contains a colon, or
    // begins with `./` or `../`; a bare relative path is rejected outright, and
    // a `./` one is resolved against the superproject's *remote*, which this
    // repository may not even have. The absolute physical path is therefore
    // passed here — the repository already exists at that path, so Git stages
    // it instead of cloning — and the tracked `.gitmodules` URL is then
    // rewritten to the relative `./<path>` placeholder below. The absolute path
    // stays in the untracked local config, where it is correct and private, and
    // no machine-specific path is ever committed.
    await git(
      [
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        '--name',
        destinationPath,
        '--',
        destinationAbsolute.replace(/\\/g, '/'),
        destinationPath,
      ],
      root,
      'addIgnoredSubmodule'
    )
    await git(
      [
        'config',
        '-f',
        '.gitmodules',
        `submodule.${destinationPath}.url`,
        `./${destinationPath}`,
      ],
      root,
      'recordIgnoredSubmoduleUrl'
    )
    await git(
      ['add', '--', '.gitmodules'],
      root,
      'stageIgnoredSubmoduleDeclaration'
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new IgnoredSubmoduleProofError(
      `${message} Every original is untouched; independent copies are retained at ${recoveryDirectory}.`,
      'topology',
      recoveryDirectory
    )
  }

  // --- Every original must still be exactly where and what it was. ---
  await onPhase('final-verification')
  for (const [index, file] of validation.accepted.entries()) {
    const expected = originals[index]
    let entry
    try {
      entry = await lstat(file.absolutePath)
    } catch {
      throw new IgnoredSubmoduleProofError(
        `The original '${file.candidate.path}' is missing after staging. Independent copies are retained at ${recoveryDirectory}.`,
        'final-verification',
        recoveryDirectory
      )
    }
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new IgnoredSubmoduleProofError(
        `The original '${file.candidate.path}' is no longer a regular file. Independent copies are retained at ${recoveryDirectory}.`,
        'final-verification',
        recoveryDirectory
      )
    }
    if (entry.size !== expected.size) {
      throw new IgnoredSubmoduleProofError(
        `The original '${file.candidate.path}' is ${entry.size} bytes; it was ${expected.size}. Independent copies are retained at ${recoveryDirectory}.`,
        'final-verification',
        recoveryDirectory
      )
    }
    const actual = await hashFile(file.absolutePath)
    if (actual !== expected.sha256) {
      throw new IgnoredSubmoduleProofError(
        `The original '${file.candidate.path}' hashes to ${actual}; it was ${expected.sha256}. Independent copies are retained at ${recoveryDirectory}.`,
        'final-verification',
        recoveryDirectory
      )
    }
  }

  await onPhase('cleanup')
  await rm(recoveryDirectory, { recursive: true, force: true }).catch(
    () => undefined
  )

  return {
    destinationPath,
    stagedFiles: originals,
    commitSha,
    totalBytes: originals.reduce((total, file) => total + file.size, 0),
    retainedRecoveryDirectory: null,
  }
}
