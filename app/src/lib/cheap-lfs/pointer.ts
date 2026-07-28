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

/**
 * The largest legacy pointer part that remains valid when materializing files.
 * GitHub historically documented this as a 2 GiB cap, and existing pointers
 * may therefore contain a part of exactly that size.
 */
const CheapLfsLegacyMaximumPartSizeBytes = 2 * 1024 * 1024 * 1024

/**
 * The per-part size used for new uploads. GitHub requires each release asset
 * to be under 2 GiB, but uploads anywhere near that ceiling proved unreliable
 * in practice: a single failed part re-transfers gigabytes, and a slow link
 * is far more likely to break before a part completes. New parts are
 * therefore 500 MiB — small enough that a retry is cheap and progress is
 * fine-grained, while still far larger than the per-request overhead.
 *
 * Shrinking this only affects newly written pointers. The parser retains
 * support for existing pointers whose parts are up to exactly 2 GiB, so files
 * pinned by earlier versions keep materializing unchanged.
 */
export const CHEAP_LFS_PART_SIZE_BYTES = 500 * 1024 * 1024

/**
 * Pointers are small, but a multi-part pointer for a very large file lists one
 * line per part, so the guard is generous rather than tiny. A part line is well
 * under 350 bytes, so this still bounds the text far below any real binary.
 */
export const CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES = 512 * 1024

const utf8Encoder = new TextEncoder()

/** Return the exact UTF-8 byte count used by the on-disk pointer. */
export function cheapLfsPointerTextSizeInBytes(text: string): number {
  return utf8Encoder.encode(text).byteLength
}

const sha256Hex = /^[a-f0-9]{64}$/
const nonNegativeInteger = /^(?:0|[1-9][0-9]*)$/
// `part <64-hex sha256> <size> <name>` — sha256 and size sit in fixed leading
// positions so the trailing name may itself contain spaces.
const partLine = /^([a-f0-9]{64}) (0|[1-9][0-9]*) (.+)$/
// `part-deflate <sha256> <original-size> <stored-size> <name>` records an
// adaptively compressed asset while retaining the original-byte digest/size.
const deflatedPartLine = /^([a-f0-9]{64}) (0|[1-9][0-9]*) (0|[1-9][0-9]*) (.+)$/
// `part-encrypted <plaintext-sha256> <plaintext-size> <stored-size>
//  <stored-sha256> <name>` records an encrypted container asset. Both digests
// are recorded on purpose. The stored pair verifies the object sitting at the
// provider **without holding the password**, so integrity stays checkable by
// any client; the plaintext pair verifies what actually came back out after
// decrypting, so a wrong password or a reassembly bug still fails closed.
const encryptedPartLine =
  /^([a-f0-9]{64}) (0|[1-9][0-9]*) (0|[1-9][0-9]*) ([a-f0-9]{64}) (.+)$/
const positiveInteger = /^[1-9][0-9]*$/
const controlCharacters = /[\u0000-\u001f]/

/**
 * The largest encryption container format version this parser admits.
 * Deliberately generous: a pointer naming a newer container still *parses*, so
 * the app can say "this needs a newer Desktop Material" rather than reporting
 * the committed file as not-a-pointer at all.
 */
const CheapLfsMaximumEncryptionFormatVersion = 1000

/** One uploaded part of a whole file that was split across release assets. */
export interface ICheapLfsPointerPart {
  readonly name: string
  /** The part's *plaintext* byte size. Parts sum to the whole file's size. */
  readonly sizeInBytes: number
  /** The part's *plaintext* SHA-256. */
  readonly sha256: string
  /** Present when the release asset is raw-DEFLATE encoded. */
  readonly deflatedSizeInBytes?: number
  /**
   * Byte size of the encrypted container actually stored at the provider.
   * Present only on an encrypted part, and always strictly larger than
   * `sizeInBytes` because the container carries a header, a salt, a nonce, and
   * an authentication tag on top of the plaintext.
   */
  readonly encryptedStoredSizeInBytes?: number
  /**
   * SHA-256 of those exact stored container bytes. This is the digest any
   * client can check against the downloaded asset **without the password**,
   * which is what keeps the stored object's integrity publicly verifiable
   * while its contents stay unreadable.
   */
  readonly encryptedStoredSha256?: string
}

/**
 * How many bytes this part actually occupies at the provider, which is what a
 * release asset's reported size must equal. Plain parts store their plaintext,
 * compressed parts store fewer bytes, and encrypted parts store more.
 */
export function cheapLfsPartStoredSizeInBytes(
  part: ICheapLfsPointerPart
): number {
  return (
    part.encryptedStoredSizeInBytes ??
    part.deflatedSizeInBytes ??
    part.sizeInBytes
  )
}

/** True when this part's release asset is an encrypted container. */
export function isEncryptedCheapLfsPointerPart(
  part: ICheapLfsPointerPart
): boolean {
  return (
    part.encryptedStoredSizeInBytes !== undefined &&
    part.encryptedStoredSha256 !== undefined
  )
}

export interface ICheapLfsPointer {
  readonly version: string
  readonly releaseTag: string
  readonly assetName: string
  /**
   * The whole file's byte size (the sum of every part when split).
   *
   * Always the **plaintext** size, encrypted or not. This field is the tracked
   * file's own identity: the never-re-pin check compares a working-tree content
   * hash to it, and post-commit payload restore re-hashes the retained copy
   * against it. Putting ciphertext measurements here would break both.
   */
  readonly sizeInBytes: number
  /** The whole file's SHA-256, always over the **plaintext**, as above. */
  readonly sha256: string
  /**
   * Present when every part is an encrypted container, carrying that
   * container's format version. Absent means the assets are stored in the
   * clear. A pointer may never be half-encrypted: the parser refuses a mix.
   */
  readonly encryptionFormatVersion?: number
  /**
   * Present when the file was split across release assets or its single asset
   * was compressed. An uncompressed single-asset pointer omits this entirely
   * and parses byte-for-byte as the original v1 five-line form. Parts are
   * listed in file order.
   */
  readonly parts?: ReadonlyArray<ICheapLfsPointerPart>
}

/** One planned byte range of a file, used to drive a split upload or hash. */
export interface ICheapLfsPartPlan {
  readonly index: number
  readonly offset: number
  readonly length: number
}

/**
 * Split a total byte size into contiguous ranges of at most `partSize`, with
 * the final range holding the remainder. A file that fits in a single part
 * yields one whole-file range, so the single-asset flow is simply the N=1 case.
 */
export function planFileParts(
  totalSize: number,
  partSize: number
): ReadonlyArray<ICheapLfsPartPlan> {
  if (
    !Number.isSafeInteger(totalSize) ||
    totalSize < 0 ||
    !Number.isSafeInteger(partSize) ||
    partSize < 1
  ) {
    throw new Error('Cheap LFS cannot plan parts for these sizes.')
  }
  if (totalSize <= partSize) {
    return [{ index: 0, offset: 0, length: totalSize }]
  }
  const plans = new Array<ICheapLfsPartPlan>()
  let offset = 0
  let index = 0
  while (offset < totalSize) {
    const length = Math.min(partSize, totalSize - offset)
    plans.push({ index, offset, length })
    offset += length
    index++
  }
  return plans
}

/**
 * Serialize a pointer to its canonical `key value` form with a trailing
 * newline. A single-asset pointer is the original five lines, byte-for-byte. A
 * split pointer appends one deterministic `part <sha256> <size> <name>` line
 * per part, in file order, after those five. Always written with `\n` line
 * endings so the committed bytes are stable regardless of the platform or
 * `core.autocrlf`.
 */
export function serializeCheapLfsPointer(pointer: ICheapLfsPointer): string {
  const lines = [
    `version ${pointer.version}`,
    `release-tag ${pointer.releaseTag}`,
    `asset-name ${pointer.assetName}`,
    `size ${pointer.sizeInBytes}`,
    `sha256 ${pointer.sha256}`,
  ]
  if (pointer.encryptionFormatVersion !== undefined) {
    lines.push(`encryption ${pointer.encryptionFormatVersion}`)
  }
  if (pointer.parts !== undefined) {
    for (const part of pointer.parts) {
      if (isEncryptedCheapLfsPointerPart(part)) {
        lines.push(
          `part-encrypted ${part.sha256} ${part.sizeInBytes} ${part.encryptedStoredSizeInBytes} ${part.encryptedStoredSha256} ${part.name}`
        )
      } else {
        lines.push(
          part.deflatedSizeInBytes === undefined
            ? `part ${part.sha256} ${part.sizeInBytes} ${part.name}`
            : `part-deflate ${part.sha256} ${part.sizeInBytes} ${part.deflatedSizeInBytes} ${part.name}`
        )
      }
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * Parse pointer text, tolerating surrounding whitespace, a leading BOM, and
 * CRLF line endings. Returns `null` on any malformation rather than throwing so
 * callers can cheaply distinguish "not a pointer" from a real parse of a valid
 * one. The five head fields may appear in any order but must each appear
 * exactly once and satisfy their format (correct version, 64-hex SHA-256,
 * non-negative integer size, non-empty whitespace-free tag / non-empty asset
 * name). Optional raw `part` or compressed `part-deflate` lines follow; when
 * present each must have a 64-hex SHA-256, a bounded original size, and a
 * non-empty name. Compressed records also carry their smaller stored size.
 * Original sizes must sum exactly to the head `size` (the whole file). Old
 * single-asset pointers have no part lines and parse with no `parts`.
 */
export function parseCheapLfsPointer(text: string): ICheapLfsPointer | null {
  if (
    typeof text !== 'string' ||
    // UTF-8 cannot use fewer bytes than UTF-16 code units. This cheap first
    // guard avoids allocating an encoded copy for obviously oversized input.
    text.length > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES ||
    cheapLfsPointerTextSizeInBytes(text) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
  ) {
    return null
  }
  if (text.includes('\u0000')) {
    return null
  }

  const allLines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
  const headLines = new Array<string>()
  const partTexts = new Array<{
    readonly text: string
    readonly kind: 'raw' | 'deflate' | 'encrypted'
  }>()
  const encryptionLines = new Array<string>()
  for (const line of allLines) {
    if (line.startsWith('part ')) {
      partTexts.push({ text: line.slice('part '.length), kind: 'raw' })
    } else if (line.startsWith('part-deflate ')) {
      partTexts.push({
        text: line.slice('part-deflate '.length),
        kind: 'deflate',
      })
    } else if (line.startsWith('part-encrypted ')) {
      partTexts.push({
        text: line.slice('part-encrypted '.length),
        kind: 'encrypted',
      })
    } else if (line.startsWith('encryption ')) {
      encryptionLines.push(line.slice('encryption '.length))
    } else {
      headLines.push(line)
    }
  }
  if (headLines.length !== 5 || encryptionLines.length > 1) {
    return null
  }

  let encryptionFormatVersion: number | undefined
  if (encryptionLines.length === 1) {
    const declared = encryptionLines[0]
    if (!positiveInteger.test(declared)) {
      return null
    }
    encryptionFormatVersion = Number(declared)
    if (
      !Number.isSafeInteger(encryptionFormatVersion) ||
      encryptionFormatVersion > CheapLfsMaximumEncryptionFormatVersion
    ) {
      return null
    }
  }

  const fields = new Map<string, string>()
  for (const line of headLines) {
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

  if (partTexts.length === 0) {
    // An `encryption` line with nothing encrypted under it is a malformed
    // pointer, not a plain one: it would claim protection this file's assets
    // do not have.
    return encryptionFormatVersion === undefined
      ? { version, releaseTag, assetName, sizeInBytes, sha256 }
      : null
  }

  const parts = new Array<ICheapLfsPointerPart>()
  let partsTotal = 0
  for (const entry of partTexts) {
    // A pointer is either wholly encrypted or wholly not. A mix would let one
    // readable part sit inside a file the user was told is protected, so the
    // declaration and every part record must agree.
    if (
      (entry.kind === 'encrypted') !==
      (encryptionFormatVersion !== undefined)
    ) {
      return null
    }
    const match = (
      entry.kind === 'encrypted'
        ? encryptedPartLine
        : entry.kind === 'deflate'
        ? deflatedPartLine
        : partLine
    ).exec(entry.text)
    const nameIndex =
      entry.kind === 'encrypted' ? 5 : entry.kind === 'deflate' ? 4 : 3
    // Deliberately measured in UTF-16 code units, not UTF-8 bytes, even though
    // *writing* a name now budgets bytes. No string can spend fewer bytes than
    // it has code units, so a 255-byte name is always within 255 characters:
    // the character bound is the strictly wider of the two. Tightening this to
    // bytes would orphan every pointer written by an earlier version under the
    // old character budget — a 255-character CJK name is ~765 bytes — and those
    // files are already pinned and already committed. A parser may widen what
    // it accepts; it must never narrow it.
    if (match === null || match[nameIndex].length > 255) {
      return null
    }
    const partSize = Number(match[2])
    if (
      !Number.isSafeInteger(partSize) ||
      partSize < 0 ||
      partSize > CheapLfsLegacyMaximumPartSizeBytes
    ) {
      return null
    }
    partsTotal += partSize
    if (!Number.isSafeInteger(partsTotal)) {
      return null
    }
    if (entry.kind === 'encrypted') {
      const encryptedStoredSizeInBytes = Number(match[3])
      if (
        !Number.isSafeInteger(encryptedStoredSizeInBytes) ||
        encryptedStoredSizeInBytes > CheapLfsLegacyMaximumPartSizeBytes ||
        // The container is a header, a salt, a nonce, and a tag wrapped around
        // the plaintext, so it can never be as small as what it protects. A
        // stored size that is not strictly larger describes something this
        // format cannot have produced.
        encryptedStoredSizeInBytes <= partSize
      ) {
        return null
      }
      parts.push({
        name: match[5],
        sizeInBytes: partSize,
        sha256: match[1],
        encryptedStoredSizeInBytes,
        encryptedStoredSha256: match[4],
      })
    } else if (entry.kind === 'deflate') {
      const deflatedSizeInBytes = Number(match[3])
      if (
        !Number.isSafeInteger(deflatedSizeInBytes) ||
        deflatedSizeInBytes < 1 ||
        deflatedSizeInBytes > CheapLfsLegacyMaximumPartSizeBytes ||
        deflatedSizeInBytes >= partSize
      ) {
        return null
      }
      parts.push({
        name: match[4],
        sizeInBytes: partSize,
        sha256: match[1],
        deflatedSizeInBytes,
      })
    } else {
      parts.push({ name: match[3], sizeInBytes: partSize, sha256: match[1] })
    }
  }
  // Every byte of the whole file must be accounted for by exactly the parts.
  if (partsTotal !== sizeInBytes) {
    return null
  }

  return {
    version,
    releaseTag,
    assetName,
    sizeInBytes,
    sha256,
    ...(encryptionFormatVersion === undefined
      ? {}
      : { encryptionFormatVersion }),
    parts,
  }
}

/** True when this pointer's release assets are encrypted containers. */
export function isEncryptedCheapLfsPointer(pointer: ICheapLfsPointer): boolean {
  return pointer.encryptionFormatVersion !== undefined
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
  // Never silently retarget a reviewed spelling. Win32 removes trailing spaces
  // and periods, treats ':' as an alternate-data-stream separator, and aliases
  // device basenames such as NUL/CON even when they carry an extension.
  if (relPath !== relPath.trim()) {
    return null
  }
  const normalized = relPath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  const invalidWindowsSegmentCharacters = /[<>:"|?*\u0000-\u001f]/
  const reservedWindowsBasename =
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
  if (
    normalized.length === 0 ||
    normalized.length > 4096 ||
    controlCharacters.test(normalized) ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.includes('..') ||
    segments.includes('.') ||
    segments.some(segment => segment.length === 0) ||
    segments.some(
      segment =>
        // Also deliberately UTF-16 code units. This bound describes the *local
        // filesystem*, not GitHub: NTFS and APFS both count 255 name units the
        // way JavaScript does, so a 200-character Chinese file name is a real,
        // creatable file on the platforms this app ships to. Re-measuring in
        // bytes would import ext4's 255-*byte* NAME_MAX and start refusing to
        // track files the user is looking at in Explorer. The GitHub-side byte
        // budget is enforced where it belongs, on the asset name.
        segment.length > 255 ||
        invalidWindowsSegmentCharacters.test(segment) ||
        /[ .]$/.test(segment) ||
        reservedWindowsBasename.test(segment)
    ) ||
    /^\.git/i.test(segments[0])
  ) {
    return null
  }
  return normalized
}
