/**
 * Quick conversion of dropped files and folders.
 *
 * A drop is expanded into regular files, each result is written beside its
 * original in the folder it was dragged from, and nothing is ever overwritten.
 * This module holds the rules; the privileged process does the file work.
 */

/** Appended to a file's full name when it is encoded as Base64 text. */
export const Base64TextSuffix = '.base64.txt'

/** A single drop never expands into more files than this. */
export const MaxDroppedFiles = 5000

export type BinaryEncodingDirection = 'encode' | 'decode'

export type DroppedEntryKind = 'file' | 'directory' | 'other'

export interface IDroppedEntry {
  readonly path: string
  readonly kind: DroppedEntryKind
}

export interface IDropSkip {
  readonly path: string
  readonly reason: string
}

export interface IDropPlan {
  /** Regular files to convert, in the order they were found. */
  readonly files: ReadonlyArray<string>
  readonly skipped: ReadonlyArray<IDropSkip>
  /** True when the drop held more files than `MaxDroppedFiles`. */
  readonly truncated: boolean
}

export interface IDropPlanOptions {
  readonly includeSubfolders: boolean
  readonly limit?: number
}

export interface IBinaryEncodingResult {
  readonly sourcePath: string
  readonly destinationPath: string
  readonly direction: BinaryEncodingDirection
  readonly sourceBytes: number
  readonly outputBytes: number
  /** SHA-256 of the original bytes, checked against a round trip. */
  readonly sha256: string
}

const SkipReasons = {
  notRegular: 'Skipped: not a regular file.',
  partial: 'Skipped: an unfinished conversion file.',
  subfolder: 'Skipped: subfolders are not included.',
} as const

/** A file whose name ends in `.base64.txt` is decoded; anything else is encoded. */
export function binaryEncodingDirection(
  fileName: string
): BinaryEncodingDirection {
  return fileName.toLowerCase().endsWith(Base64TextSuffix) &&
    fileName.length > Base64TextSuffix.length
    ? 'decode'
    : 'encode'
}

/** The name a result gets before any clash with an existing file is resolved. */
export function binaryEncodingTargetName(fileName: string): string {
  return binaryEncodingDirection(fileName) === 'decode'
    ? fileName.slice(0, fileName.length - Base64TextSuffix.length)
    : `${fileName}${Base64TextSuffix}`
}

/**
 * Pick a name that is not taken, by adding ` (1)`, ` (2)` and so on before the
 * extension. The Base64 text suffix counts as one extension, so
 * `photo.png.base64.txt` becomes `photo.png (1).base64.txt`.
 */
export function nonClashingFileName(
  fileName: string,
  isTaken: (candidate: string) => boolean
): string {
  if (!isTaken(fileName)) {
    return fileName
  }
  const lower = fileName.toLowerCase()
  let split = fileName.lastIndexOf('.')
  if (
    lower.endsWith(Base64TextSuffix) &&
    fileName.length > Base64TextSuffix.length
  ) {
    split = fileName.length - Base64TextSuffix.length
  }
  const stem = split > 0 ? fileName.slice(0, split) : fileName
  const extension = split > 0 ? fileName.slice(split) : ''
  for (let index = 1; index < 10_000; index++) {
    const candidate = `${stem} (${index})${extension}`
    if (!isTaken(candidate)) {
      return candidate
    }
  }
  throw new Error('No free file name is available beside the original.')
}

function isPartialFile(path: string): boolean {
  return /\.partial$/i.test(path)
}

/**
 * Expand dropped files and folders into the regular files to convert.
 *
 * Folders are walked breadth-first through `listDirectory`, so a huge tree is
 * never held in memory beyond the bounded result.
 */
export async function planDroppedEntries(
  entries: ReadonlyArray<IDroppedEntry>,
  listDirectory: (path: string) => Promise<ReadonlyArray<IDroppedEntry>>,
  options: IDropPlanOptions
): Promise<IDropPlan> {
  const limit = Math.max(1, options.limit ?? MaxDroppedFiles)
  const files = new Array<string>()
  const skipped = new Array<IDropSkip>()
  const seen = new Set<string>()
  let truncated = false

  const addFile = (path: string) => {
    if (seen.has(path)) {
      return
    }
    if (isPartialFile(path)) {
      skipped.push({ path, reason: SkipReasons.partial })
      return
    }
    if (files.length >= limit) {
      truncated = true
      return
    }
    seen.add(path)
    files.push(path)
  }

  // Each queued folder remembers whether it was dropped directly: a dropped
  // folder is always opened, its subfolders only when asked.
  const pending = new Array<{ path: string; dropped: boolean }>()
  for (const entry of entries) {
    if (entry.kind === 'file') {
      addFile(entry.path)
    } else if (entry.kind === 'directory') {
      pending.push({ path: entry.path, dropped: true })
    } else {
      skipped.push({ path: entry.path, reason: SkipReasons.notRegular })
    }
  }

  while (pending.length > 0 && !truncated) {
    const directory = pending.shift()!
    if (!directory.dropped && !options.includeSubfolders) {
      skipped.push({ path: directory.path, reason: SkipReasons.subfolder })
      continue
    }
    for (const child of await listDirectory(directory.path)) {
      if (child.kind === 'file') {
        addFile(child.path)
      } else if (child.kind === 'directory') {
        pending.push({ path: child.path, dropped: false })
      } else {
        skipped.push({ path: child.path, reason: SkipReasons.notRegular })
      }
    }
  }

  return { files, skipped, truncated }
}
