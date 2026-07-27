import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

import { IGitStringExecutionOptions } from './core'

/** Scratch object database beside the scratch index, deleted with it. */
const ScratchObjectsDirectoryName = 'objects'
const ScratchIndexFileName = 'index'

/**
 * The Git runner one temporary-index refresh needs.
 *
 * Both call sites already own a repository-scoped runner, so this never takes
 * a repository path of its own for anything but resolving the object database.
 */
export type TemporaryWorktreeIndexRunner = (
  args: string[],
  name: string,
  options: IGitStringExecutionOptions
) => Promise<{ readonly stdout: string; readonly exitCode: number }>

/** Operation names reported for each Git process a refresh spawns. */
export interface ITemporaryWorktreeIndexOperationNames {
  readonly locateObjects: string
  readonly readBase: string
  readonly listPaths: string
  readonly refreshPaths: string
  readonly stageEverything: string
  readonly writeTree: string
}

export interface ITemporaryWorktreeIndexRequest {
  readonly run: TemporaryWorktreeIndexRunner
  readonly repositoryPath: string
  /** A private, empty directory owned and later deleted by the caller. */
  readonly temporaryDirectory: string
  /** Commit whose tree seeds the scratch index; `null` for an unborn HEAD. */
  readonly baseSha: string | null
  readonly names: ITemporaryWorktreeIndexOperationNames
  /** Ceiling on one whole-tree path inventory or staging pass. */
  readonly maximumInventoryBytes: number
  /** Ceiling on a one-line object-id or path answer. */
  readonly maximumSmallOutputBytes: number
}

export class TemporaryWorktreeIndexError extends Error {
  public override readonly name = 'TemporaryWorktreeIndexError'
}

/**
 * Point the scratch object database at the repository's real one.
 *
 * An `info/alternates` file is used instead of
 * `GIT_ALTERNATE_OBJECT_DIRECTORIES` because the environment variable is split
 * on the platform path separator, which a repository path may legitimately
 * contain; the file is newline-delimited and has no such ambiguity.
 */
async function prepareScratchObjectDatabase(
  request: ITemporaryWorktreeIndexRequest
): Promise<string> {
  const located = await request.run(
    ['rev-parse', '--git-path', 'objects'],
    request.names.locateObjects,
    { maxBuffer: request.maximumSmallOutputBytes }
  )
  const reported = located.stdout.replace(/[\r\n]+$/, '')
  if (reported.length === 0 || reported.includes('\0')) {
    throw new TemporaryWorktreeIndexError(
      'Git returned an invalid object-database path for a scratch working-tree index.'
    )
  }
  const repositoryObjects = resolve(request.repositoryPath, reported)
  const scratchObjects = join(
    request.temporaryDirectory,
    ScratchObjectsDirectoryName
  )
  await mkdir(join(scratchObjects, 'info'), { recursive: true })
  await writeFile(
    join(scratchObjects, 'info', 'alternates'),
    `${repositoryObjects}\n`,
    'utf8'
  )
  return scratchObjects
}

/**
 * Stage every working-tree path into the scratch index without writing a
 * single object anywhere.
 *
 * `git add -A` hashes each changed file *and stores it*, so on a repository
 * using Cheap LFS a whole-tree refresh copied every materialized multi-gigabyte
 * payload into the object database as a loose blob — the exact bloat Cheap LFS
 * exists to prevent. `git update-index --info-only` computes the identical
 * object ids (it runs the same `index_path` conversion `git add` does) and
 * simply does not store them, and `git write-tree --missing-ok` then builds the
 * identical tree from those ids.
 *
 * Returns `false` when Git refused the explicit path list, which happens for a
 * directory/file collision (a tracked file replaced by a directory of the same
 * name). `git add`'s own traversal resolves that case, so the caller falls back
 * to it rather than narrowing what the refresh covers.
 */
async function refreshWithoutStoringObjects(
  request: ITemporaryWorktreeIndexRequest,
  environment: Record<string, string>
): Promise<boolean> {
  // `--cached` is the seeded base tree and `--others --exclude-standard` the
  // untracked, un-ignored files: together the exact universe `git add -A -- .`
  // walks from this same scratch index.
  const listed = await request.run(
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    request.names.listPaths,
    { env: environment, maxBuffer: request.maximumInventoryBytes }
  )
  // `ls-files` reports an untracked embedded repository as `name/`; the same
  // path without the trailing separator is what records its gitlink, which is
  // what `git add -A` records for it.
  const paths = listed.stdout.replace(/\/(?=\0)/g, '')
  const refreshed = await request.run(
    ['update-index', '--add', '--remove', '--info-only', '-z', '--stdin'],
    request.names.refreshPaths,
    {
      env: environment,
      stdin: paths,
      successExitCodes: new Set([0, 1, 128]),
      maxBuffer: request.maximumInventoryBytes,
    }
  )
  return refreshed.exitCode === 0
}

/**
 * Capture the exact tree of the whole working tree in a scratch index, adding
 * nothing to the repository's object database.
 *
 * The returned object id is byte-for-byte the one `git add -A -- .` followed by
 * `git write-tree` produced before, so every drift these proofs detected — a
 * changed file, an added or removed path, a mode change, a moved submodule —
 * is still detected identically. What changed is only where the objects behind
 * it live: nothing is stored in the repository, and the few tree objects that
 * are written land in the caller's scratch directory and die with it.
 */
export async function captureTemporaryWorktreeIndexTree(
  request: ITemporaryWorktreeIndexRequest
): Promise<string> {
  const scratchObjects = await prepareScratchObjectDatabase(request)
  const environment = {
    GIT_INDEX_FILE: join(request.temporaryDirectory, ScratchIndexFileName),
    GIT_OBJECT_DIRECTORY: scratchObjects,
  }
  const seed =
    request.baseSha === null
      ? ['read-tree', '--empty']
      : ['read-tree', request.baseSha]

  await request.run(seed, request.names.readBase, {
    env: environment,
    maxBuffer: request.maximumSmallOutputBytes,
  })
  if (!(await refreshWithoutStoringObjects(request, environment))) {
    await request.run(seed, request.names.readBase, {
      env: environment,
      maxBuffer: request.maximumSmallOutputBytes,
    })
    // One line-ending warning per path can far exceed a small ceiling on a
    // large working tree; being killed mid-stage is what strands `index.lock`.
    await request.run(['add', '-A', '--', '.'], request.names.stageEverything, {
      env: environment,
      maxBuffer: request.maximumInventoryBytes,
    })
  }
  const tree = await request.run(
    ['write-tree', '--missing-ok'],
    request.names.writeTree,
    { env: environment, maxBuffer: request.maximumSmallOutputBytes }
  )
  return tree.stdout.trim()
}
