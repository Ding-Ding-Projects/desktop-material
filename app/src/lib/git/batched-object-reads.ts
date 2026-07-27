import { git } from './core'
import { Repository } from '../../models/repository'

const ObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/**
 * `<oid> <type> <size>` info header emitted by `git cat-file --batch` and
 * `--batch-check` for every resolvable object name.
 */
const BatchInfoHeaderPattern =
  /^([0-9a-f]{40}|[0-9a-f]{64}) (blob|tree|commit|tag) ([0-9]+)$/

/** `<mode> <oid> <stage>\t<path>` record emitted by `git ls-files --stage -z`. */
const IndexStageEntryPattern =
  /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/

/** `<mode> <type> <oid>\t<path>` record emitted by `git ls-tree -z`. */
const TreeEntryPattern =
  /^([0-7]{6}) (blob|tree|commit|tag) ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/

/**
 * Ceiling for path characters passed as arguments to one Git spawn. Windows
 * caps the whole CreateProcess command line near 32K characters; staying far
 * below leaves room for the git executable path, fixed arguments, quoting, and
 * the `:(literal)` pathspec magic added per path.
 */
export const MaximumBatchedPathArgumentChars = 16_000

/**
 * Ceiling for blob bodies requested from one `cat-file --batch` spawn so a
 * large batch is read in a few bounded processes instead of either one spawn
 * per file or one unbounded buffer.
 */
export const MaximumBatchedBlobChunkBytes = 32 * 1024 * 1024

/** Ceiling for the tiny `--batch-check` info inventory. */
const MaximumBatchCheckOutputBytes = 64 * 1024 * 1024

/** Ceiling for one chunk of `ls-files`/`ls-tree` records. */
const MaximumPathListingOutputBytes = 8 * 1024 * 1024

/** One staged (index) record for a path. */
export interface IIndexStageEntry {
  readonly mode: string
  readonly objectId: string
  readonly stage: string
  readonly path: string
}

/** One committed-tree record for a path. */
export interface ITreeListEntry {
  readonly mode: string
  readonly objectType: 'blob' | 'tree' | 'commit' | 'tag'
  readonly objectId: string
  readonly path: string
}

/** One `--batch-check` inventory record. */
export interface IBatchedObjectInfo {
  readonly objectId: string
  readonly objectType: 'blob' | 'tree' | 'commit' | 'tag'
  readonly sizeInBytes: number
}

/**
 * Split paths into ordered chunks whose combined character count stays within
 * one Git spawn's argument budget. Every chunk contains at least one path so an
 * individually oversized path still gets its own spawn (and its own failure).
 */
export function chunkPathArguments(
  paths: ReadonlyArray<string>,
  maximumChars: number = MaximumBatchedPathArgumentChars
): ReadonlyArray<ReadonlyArray<string>> {
  const chunks = new Array<ReadonlyArray<string>>()
  let current = new Array<string>()
  let currentChars = 0
  for (const path of paths) {
    // Separator, quoting, and `:(literal)` pathspec-magic slack per path.
    const cost = path.length + 16
    if (current.length > 0 && currentChars + cost > maximumChars) {
      chunks.push(current)
      current = []
      currentChars = 0
    }
    current.push(path)
    currentChars += cost
  }
  if (current.length > 0) {
    chunks.push(current)
  }
  return chunks
}

/**
 * Parse `git cat-file --batch-check` output into one record per requested
 * object name, in request order. An unresolvable name (`<name> missing`,
 * ambiguous, and similar) maps to null for exactly that name, matching the
 * prior one-process-per-file readers where only that file's proof failed.
 */
export function parseCatFileBatchCheck(
  stdout: string,
  expectedCount: number
): ReadonlyArray<IBatchedObjectInfo | null> {
  const output = stdout.replace(/[\r\n]+$/, '')
  const lines = output.length === 0 ? [] : output.split(/\r?\n/)
  if (lines.length !== expectedCount) {
    throw new Error(
      'Git returned a truncated object inventory for a batched read.'
    )
  }
  return lines.map(line => {
    const match = BatchInfoHeaderPattern.exec(line)
    if (match === null) {
      return null
    }
    const sizeInBytes = Number(match[3])
    if (!Number.isSafeInteger(sizeInBytes) || sizeInBytes < 0) {
      throw new Error('Git returned an invalid object size for a batched read.')
    }
    return {
      objectId: match[1],
      objectType: match[2] as IBatchedObjectInfo['objectType'],
      sizeInBytes,
    }
  })
}

/**
 * Parse `git cat-file --batch` output into one body per requested object name,
 * in request order. Bodies are consumed by the byte count from each record's
 * own size header, so file contents (including NUL and newline bytes) can never
 * desynchronize the stream or leak into a neighboring file's verdict. A record
 * that is unresolvable, not a blob, or larger than `maximumBodyBytes` maps to
 * null for exactly that name.
 */
export function parseCatFileBatchBodies(
  stdout: Buffer,
  expectedCount: number,
  maximumBodyBytes: number
): ReadonlyArray<Buffer | null> {
  const results = new Array<Buffer | null>()
  let cursor = 0
  for (let index = 0; index < expectedCount; index++) {
    const headerEnd = stdout.indexOf(0x0a, cursor)
    if (headerEnd === -1) {
      throw new Error('Git returned a truncated batched object stream.')
    }
    const header = stdout
      .subarray(cursor, headerEnd)
      .toString('utf8')
      .replace(/\r$/, '')
    cursor = headerEnd + 1
    const match = BatchInfoHeaderPattern.exec(header)
    if (match === null) {
      // `<name> missing` and friends occupy exactly one line with no body.
      results.push(null)
      continue
    }
    const sizeInBytes = Number(match[3])
    if (!Number.isSafeInteger(sizeInBytes) || sizeInBytes < 0) {
      throw new Error('Git returned an invalid object size for a batched read.')
    }
    if (
      cursor + sizeInBytes + 1 > stdout.length ||
      stdout[cursor + sizeInBytes] !== 0x0a
    ) {
      throw new Error('Git returned a truncated batched object body.')
    }
    const body = stdout.subarray(cursor, cursor + sizeInBytes)
    cursor += sizeInBytes + 1
    results.push(
      match[2] === 'blob' && sizeInBytes <= maximumBodyBytes ? body : null
    )
  }
  if (cursor !== stdout.length) {
    throw new Error(
      'Git returned unexpected trailing data in a batched object stream.'
    )
  }
  return results
}

/** Parse `git ls-files --stage -z` output into its per-path records. */
export function parseNulTerminatedIndexEntries(
  stdout: string
): ReadonlyArray<IIndexStageEntry> {
  const records = stdout.split('\0')
  if (records.length > 0 && records[records.length - 1] === '') {
    records.pop()
  }
  return records.map(record => {
    const match = IndexStageEntryPattern.exec(record)
    if (match === null) {
      throw new Error(
        'Git returned an invalid staged-entry record for a batched read.'
      )
    }
    return {
      mode: match[1],
      objectId: match[2],
      stage: match[3],
      path: match[4],
    }
  })
}

/** Parse `git ls-tree -z` output into its per-path records. */
export function parseNulTerminatedTreeEntries(
  stdout: string
): ReadonlyArray<ITreeListEntry> {
  const records = stdout.split('\0')
  if (records.length > 0 && records[records.length - 1] === '') {
    records.pop()
  }
  return records.map(record => {
    const match = TreeEntryPattern.exec(record)
    if (match === null) {
      throw new Error(
        'Git returned an invalid tree-entry record for a batched read.'
      )
    }
    return {
      mode: match[1],
      objectType: match[2] as ITreeListEntry['objectType'],
      objectId: match[3],
      path: match[4],
    }
  })
}

function groupByPath<T extends { readonly path: string }>(
  target: Map<string, Array<T>>,
  entries: ReadonlyArray<T>
): void {
  for (const entry of entries) {
    const existing = target.get(entry.path)
    if (existing === undefined) {
      target.set(entry.path, [entry])
    } else {
      existing.push(entry)
    }
  }
}

/**
 * Read the texts of many blobs — object names such as `:<path>` (staged) or
 * `<sha>:<path>` (committed) — with a bounded number of Git processes instead
 * of one process per file.
 *
 * Per-name results are position-aligned with `objectNames`; a name that is
 * unresolvable, not a blob, or whose size header exceeds `maximumBytesPerObject`
 * yields null for exactly that name without affecting any other name, matching
 * the prior per-file `git show` readers. The `--batch-check` size inventory
 * runs first so an over-limit body is rejected before it is ever requested.
 */
export async function readBlobTextsByObjectName(
  repository: Repository,
  objectNames: ReadonlyArray<string>,
  maximumBytesPerObject: number,
  operation: string,
  isBackgroundTask: boolean = false
): Promise<ReadonlyArray<string | null>> {
  if (objectNames.length === 0) {
    return []
  }
  for (const name of objectNames) {
    // Requests are framed one per line; validated callers never produce
    // control characters, so reject rather than mis-frame anything else.
    if (name.length === 0 || /[\0\r\n]/.test(name)) {
      throw new Error('Git refused an unsafe object name in a batched read.')
    }
  }

  const inventory = await git(
    ['cat-file', '--batch-check'],
    repository.path,
    operation,
    {
      stdin: `${objectNames.join('\n')}\n`,
      maxBuffer: MaximumBatchCheckOutputBytes,
      isBackgroundTask,
    }
  )
  const infos = parseCatFileBatchCheck(inventory.stdout, objectNames.length)

  const results = new Array<string | null>(objectNames.length).fill(null)
  const readable = new Array<number>()
  for (let index = 0; index < infos.length; index++) {
    const info = infos[index]
    if (
      info !== null &&
      info.objectType === 'blob' &&
      info.sizeInBytes <= maximumBytesPerObject
    ) {
      readable.push(index)
    }
  }

  const chunks = new Array<ReadonlyArray<number>>()
  let current = new Array<number>()
  let currentBytes = 0
  for (const index of readable) {
    const cost = (infos[index]?.sizeInBytes ?? 0) + 192
    if (
      current.length > 0 &&
      currentBytes + cost > MaximumBatchedBlobChunkBytes
    ) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(index)
    currentBytes += cost
  }
  if (current.length > 0) {
    chunks.push(current)
  }

  for (const chunk of chunks) {
    const bodies = await git(
      ['cat-file', '--batch'],
      repository.path,
      operation,
      {
        stdin: `${chunk.map(index => objectNames[index]).join('\n')}\n`,
        encoding: 'buffer',
        maxBuffer:
          MaximumBatchedBlobChunkBytes + maximumBytesPerObject + 1024 * 1024,
        isBackgroundTask,
      }
    )
    const parsed = parseCatFileBatchBodies(
      bodies.stdout,
      chunk.length,
      maximumBytesPerObject
    )
    chunk.forEach((nameIndex, bodyIndex) => {
      const body = parsed[bodyIndex]
      if (body !== null) {
        const text = body.toString('utf8')
        // Match the prior per-file reader exactly: the decoded text must also
        // stay within the ceiling after UTF-8 re-encoding.
        results[nameIndex] =
          Buffer.byteLength(text, 'utf8') <= maximumBytesPerObject ? text : null
      }
    })
  }
  return results
}

/**
 * Read the staged index records for many paths with a bounded number of
 * `git ls-files --stage -z` processes. Paths are matched with `:(literal)`
 * pathspec magic so names containing glob characters stay literal and one
 * path's records can never contaminate another path's verdict. A path with no
 * staged record is simply absent from the returned map.
 */
export async function readIndexStageEntries(
  repository: Repository,
  paths: ReadonlyArray<string>,
  operation: string,
  isBackgroundTask: boolean = false
): Promise<ReadonlyMap<string, ReadonlyArray<IIndexStageEntry>>> {
  const entries = new Map<string, Array<IIndexStageEntry>>()
  if (paths.length === 0) {
    return entries
  }
  for (const chunk of chunkPathArguments(paths)) {
    const result = await git(
      [
        'ls-files',
        '--stage',
        '-z',
        '--',
        ...chunk.map(path => `:(literal)${path}`),
      ],
      repository.path,
      operation,
      { maxBuffer: MaximumPathListingOutputBytes, isBackgroundTask }
    )
    groupByPath(entries, parseNulTerminatedIndexEntries(result.stdout))
  }
  return entries
}

/**
 * Read the committed tree records for many paths of one commit with a bounded
 * number of `git ls-tree -z` processes, using `:(literal)` pathspec magic like
 * {@link readIndexStageEntries}. A path absent from the commit is simply absent
 * from the returned map.
 */
export async function readCommitTreeEntries(
  repository: Repository,
  commitSha: string,
  paths: ReadonlyArray<string>,
  operation: string,
  isBackgroundTask: boolean = false
): Promise<ReadonlyMap<string, ReadonlyArray<ITreeListEntry>>> {
  if (!ObjectIdPattern.test(commitSha)) {
    throw new Error('Git refused an invalid commit id for a batched tree read.')
  }
  const entries = new Map<string, Array<ITreeListEntry>>()
  if (paths.length === 0) {
    return entries
  }
  for (const chunk of chunkPathArguments(paths)) {
    const result = await git(
      [
        'ls-tree',
        '-z',
        commitSha,
        '--',
        ...chunk.map(path => `:(literal)${path}`),
      ],
      repository.path,
      operation,
      { maxBuffer: MaximumPathListingOutputBytes, isBackgroundTask }
    )
    groupByPath(entries, parseNulTerminatedTreeEntries(result.stdout))
  }
  return entries
}
