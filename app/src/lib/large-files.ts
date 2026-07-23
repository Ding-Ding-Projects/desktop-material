import { WorkingDirectoryStatus } from '../models/status'
import { DiffSelectionType } from '../models/diff'
import { Repository } from '../models/repository'
import { lstat } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'

/** GitHub rejects a push containing any single file larger than this. */
export const ReceiveLimit = 100 * 1024 * 1024 // 100 MiB

/**
 * The size at which the auto-pin-on-commit feature moves a selected file to a
 * GitHub Release asset instead of committing it directly. A file strictly over
 * this size cannot be pushed, so pinning it (committing only a small pointer) is
 * what keeps the repository pushable. Anchored to {@link ReceiveLimit}.
 */
export const CheapLfsPinThresholdBytes = ReceiveLimit

export type WorkingDirectoryFileSizeKind =
  | 'known'
  | 'missing'
  | 'non-file'
  | 'unknown'

/** Fail-closed disk metadata used by filters and commit-size planning. */
export interface IWorkingDirectoryFileSize {
  readonly kind: WorkingDirectoryFileSizeKind
  readonly sizeInBytes: number | null
}

const WorkingDirectorySizeScanConcurrency = 8

function canceledSizeScanError(): Error {
  const error = new Error('Working-directory size scan was canceled.')
  error.name = 'AbortError'
  return error
}

/**
 * Read changed-path sizes without following symlinks. Work is bounded and every
 * path is proven to remain beneath the repository root before disk access.
 * Missing paths are represented separately from unreadable/invalid metadata so
 * callers can treat deletions as zero while failing closed on ambiguity.
 */
export async function getWorkingDirectoryFileSizes(
  repository: Repository,
  files: ReadonlyArray<{ readonly path: string }>,
  signal?: AbortSignal,
  maximumConcurrency: number = WorkingDirectorySizeScanConcurrency
): Promise<ReadonlyMap<string, IWorkingDirectoryFileSize>> {
  const root = resolve(repository.path)
  const results = new Map<string, IWorkingDirectoryFileSize>()
  const concurrency = Math.max(
    1,
    Math.min(
      16,
      files.length,
      Number.isFinite(maximumConcurrency)
        ? Math.floor(maximumConcurrency)
        : WorkingDirectorySizeScanConcurrency
    )
  )
  let nextIndex = 0
  let canceled = signal?.aborted === true

  const worker = async () => {
    while (!canceled) {
      const index = nextIndex++
      if (index >= files.length) {
        return
      }
      if (signal?.aborted) {
        canceled = true
        return
      }

      const path = files[index].path
      const absolutePath = resolve(root, path)
      const relativePath = relative(root, absolutePath)
      if (
        relativePath.length === 0 ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        results.set(path, { kind: 'unknown', sizeInBytes: null })
        continue
      }

      try {
        const fileStatus = await lstat(absolutePath)
        if (signal?.aborted) {
          canceled = true
          return
        }
        if (!fileStatus.isFile() && !fileStatus.isSymbolicLink()) {
          results.set(path, { kind: 'non-file', sizeInBytes: 0 })
        } else if (
          !Number.isSafeInteger(fileStatus.size) ||
          fileStatus.size < 0
        ) {
          results.set(path, { kind: 'unknown', sizeInBytes: null })
        } else {
          results.set(path, {
            kind: 'known',
            sizeInBytes: fileStatus.size,
          })
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        results.set(
          path,
          code === 'ENOENT' || code === 'ENOTDIR'
            ? { kind: 'missing', sizeInBytes: 0 }
            : { kind: 'unknown', sizeInBytes: null }
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  if (canceled || signal?.aborted) {
    throw canceledSizeScanError()
  }
  return results
}

/**
 * Retrieve paths of working directory files that are larger than a given Megabyte size.
 *
 * @param repository        - The repository from which the base file directory will be retrieved.
 * @param workingDirectory  - The collection of changed files, from which the selected files will
 *                            be determined.
 * @param maximumSizeMB     - The size limit (in Megabytes) at which an exceeding file size will
 *                            result in it's path being retrieved.
 */
export async function getLargeFilePaths(
  repository: Repository,
  workingDirectory: WorkingDirectoryStatus
) {
  const workingDirectoryFiles = workingDirectory.files
  const includedFiles = workingDirectoryFiles.filter(
    file => file.selection.getSelectionType() !== DiffSelectionType.None
  )

  const sizes = await getWorkingDirectoryFileSizes(repository, includedFiles)
  return includedFiles
    .filter(file => {
      const size = sizes.get(file.path)
      return (
        size?.kind === 'known' &&
        typeof size.sizeInBytes === 'number' &&
        size.sizeInBytes > ReceiveLimit
      )
    })
    .map(file => file.path)
}
