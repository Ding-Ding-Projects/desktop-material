/**
 * Pure, import-free model for "cheap LFS" pointer files.
 *
 * A pointer is a tiny, human-readable stand-in that a repository commits in
 * place of a large binary. The binary itself lives as a GitHub Release asset;
 * the pointer records enough to find and verify it (release tag, asset name,
 * byte size, and a SHA-256 content hash). This module only parses, serializes,
 * and validates the text form — no disk, network, or process access — so it
 * stays trivially unit-testable and safe to share between the renderer and the
 * main process.
 */

/** Version marker written on the first line of every pointer. */
export const CHEAP_LFS_POINTER_VERSION = 'desktop-material/cheap-lfs/v1'

/** Pointers are minuscule; refuse to parse anything larger as a guard. */
const MaximumPointerTextBytes = 4096

const sha256Hex = /^[a-f0-9]{64}$/
const nonNegativeInteger = /^(?:0|[1-9][0-9]*)$/
const controlCharacters = /[\u0000-\u001f]/

export interface ICheapLfsPointer {
  readonly version: string
  readonly releaseTag: string
  readonly assetName: string
  readonly sizeInBytes: number
  readonly sha256: string
}

/**
 * Serialize a pointer to its canonical five-line `key value` form with a
 * trailing newline. Always written with `\n` line endings so the committed
 * bytes are stable regardless of the platform or `core.autocrlf`.
 */
export function serializeCheapLfsPointer(pointer: ICheapLfsPointer): string {
  return (
    [
      `version ${pointer.version}`,
      `release-tag ${pointer.releaseTag}`,
      `asset-name ${pointer.assetName}`,
      `size ${pointer.sizeInBytes}`,
      `sha256 ${pointer.sha256}`,
    ].join('\n') + '\n'
  )
}

/**
 * Parse pointer text, tolerating surrounding whitespace, a leading BOM, and
 * CRLF line endings. Returns `null` on any malformation rather than throwing so
 * callers can cheaply distinguish "not a pointer" from a real parse of a valid
 * one. Field order is not significant, but every field must appear exactly once
 * and satisfy its format (correct version, 64-hex SHA-256, non-negative integer
 * size, and non-empty whitespace-free tag / non-empty asset name).
 */
export function parseCheapLfsPointer(text: string): ICheapLfsPointer | null {
  if (typeof text !== 'string' || text.length > MaximumPointerTextBytes) {
    return null
  }
  if (text.includes('\u0000')) {
    return null
  }

  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
  if (lines.length !== 5) {
    return null
  }

  const fields = new Map<string, string>()
  for (const line of lines) {
    const separator = line.indexOf(' ')
    if (separator <= 0) {
      return null
    }
    const key = line.slice(0, separator)
    if (fields.has(key)) {
      return null
    }
    fields.set(key, line.slice(separator + 1))
  }

  const version = fields.get('version')
  const releaseTag = fields.get('release-tag')
  const assetName = fields.get('asset-name')
  const size = fields.get('size')
  const sha256 = fields.get('sha256')

  if (version !== CHEAP_LFS_POINTER_VERSION) {
    return null
  }
  if (
    releaseTag === undefined ||
    releaseTag.length === 0 ||
    /\s/.test(releaseTag)
  ) {
    return null
  }
  if (assetName === undefined || assetName.length === 0) {
    return null
  }
  if (sha256 === undefined || !sha256Hex.test(sha256)) {
    return null
  }
  if (size === undefined || !nonNegativeInteger.test(size)) {
    return null
  }
  const sizeInBytes = Number(size)
  if (!Number.isSafeInteger(sizeInBytes) || sizeInBytes < 0) {
    return null
  }

  return { version, releaseTag, assetName, sizeInBytes, sha256 }
}

/**
 * Cheap first-line probe used to decide whether a working-tree file looks like
 * a pointer before committing to a full parse. Rejects anything with a NUL byte
 * in its prefix (a strong "this is binary" signal) and only accepts text whose
 * first non-empty line is the exact version marker.
 */
export function isCheapLfsPointerText(text: string): boolean {
  if (typeof text !== 'string') {
    return false
  }
  const prefix = text.slice(0, 256)
  if (prefix.includes('\u0000')) {
    return false
  }
  const firstLine = (
    prefix.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  ).trim()
  return firstLine === `version ${CHEAP_LFS_POINTER_VERSION}`
}

/**
 * Validate that a caller-supplied path is a safe repository-relative location
 * to track. Mirrors the safety rules of `normalizeRepositoryLFSPattern`
 * (no parent traversal, no absolute or drive-rooted paths, no Git metadata) but
 * returns a normalized forward-slash path, or `null` when the input is unsafe.
 */
export function validateCheapLfsTrackedPath(relPath: string): string | null {
  if (typeof relPath !== 'string') {
    return null
  }
  const normalized = relPath.trim().replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (
    normalized.length === 0 ||
    normalized.length > 4096 ||
    controlCharacters.test(normalized) ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.includes('..') ||
    segments.includes('.') ||
    segments.some(segment => segment.length === 0) ||
    /^\.git/i.test(segments[0])
  ) {
    return null
  }
  return normalized
}
