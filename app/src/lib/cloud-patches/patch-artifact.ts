import { createHash } from 'crypto'

export const CloudPatchArtifactVersion = 1 as const
export const MaximumCloudPatchPatchBytes = 8 * 1024 * 1024
export const MaximumCloudPatchManifestBytes = 2 * 1024 * 1024
export const MaximumCloudPatchArtifactBytes =
  MaximumCloudPatchPatchBytes * 2 + MaximumCloudPatchManifestBytes + 1024
export const MaximumCloudPatchFileBytes = 512 * 1024 * 1024
export const MaximumCloudPatchFiles = 4096
export const MaximumCloudPatchPathBytes = 4096
export const MaximumCloudPatchPathSegmentBytes = 255
export const MaximumCloudPatchPathDepth = 128

const GitObjectIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const RepositoryIdentityPattern = /^sha256:[a-f0-9]{64}$/
const Sha256Pattern = /^sha256:[a-f0-9]{64}$/
const ForbiddenPathCharacters = /[<>:"\\|?*]/
const ControlCharacters = /[\u0000-\u001f\u007f-\u009f]/
const PatchControlCharacters = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/
const WindowsReservedName =
  /^(?:con|prn|aux|nul|clock\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/i
const MaximumJavaScriptTimestamp = 8_640_000_000_000_000

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export type CloudPatchContentKind = 'commit-range' | 'working-tree-patch'
export type CloudPatchFileMode = '100644' | '100755' | 'deleted'

export interface ICloudPatchFileEntry {
  readonly path: string
  readonly mode: CloudPatchFileMode
  readonly byteLength: number
}

interface ICloudPatchInputBase {
  readonly repositoryId: string
  readonly createdAtMs: number
  readonly expiresAtMs: number
  readonly baseSha: string
  readonly files: ReadonlyArray<ICloudPatchFileEntry>
}

export interface ICloudPatchCommitRangeInput extends ICloudPatchInputBase {
  readonly kind: 'commit-range'
  readonly headSha: string
}

export interface ICloudPatchWorkingTreeInput extends ICloudPatchInputBase {
  readonly kind: 'working-tree-patch'
  readonly patch: string
}

export type CloudPatchArtifactInput =
  | ICloudPatchCommitRangeInput
  | ICloudPatchWorkingTreeInput

export interface ICloudPatchManifest {
  readonly version: typeof CloudPatchArtifactVersion
  readonly repositoryId: string
  readonly createdAtMs: number
  readonly expiresAtMs: number
  readonly contentKind: CloudPatchContentKind
  readonly baseSha: string
  readonly headSha: string | null
  readonly contentByteLength: number
  readonly fileCount: number
  readonly files: ReadonlyArray<ICloudPatchFileEntry>
  readonly sha256: string
}

export interface ICloudPatchArtifact {
  readonly manifest: ICloudPatchManifest
  readonly content: string | null
  /** Exact canonical UTF-8 text. Strings keep the returned artifact immutable. */
  readonly serialized: string
  /** Digest of the complete canonical artifact, including the terminal LF. */
  readonly artifactSha256: string
}

interface ICloudPatchExpectationBase {
  readonly repositoryId: string
  readonly baseSha: string
}

export interface ICloudPatchCommitRangeExpectation
  extends ICloudPatchExpectationBase {
  readonly kind: 'commit-range'
  readonly headSha: string
}

export interface ICloudPatchWorkingTreeExpectation
  extends ICloudPatchExpectationBase {
  readonly kind: 'working-tree-patch'
}

export type CloudPatchVerificationExpectation =
  | ICloudPatchCommitRangeExpectation
  | ICloudPatchWorkingTreeExpectation

export type CloudPatchArtifactErrorCode =
  | 'invalid-input'
  | 'invalid-repository'
  | 'invalid-time'
  | 'invalid-range'
  | 'invalid-content-kind'
  | 'invalid-file'
  | 'unsafe-path'
  | 'unsupported-entry'
  | 'duplicate-file'
  | 'too-many-files'
  | 'file-too-large'
  | 'invalid-patch'
  | 'patch-file-mismatch'
  | 'patch-too-large'
  | 'manifest-too-large'
  | 'artifact-too-large'
  | 'archive-input'
  | 'invalid-utf8'
  | 'invalid-text'
  | 'invalid-json'
  | 'noncanonical-artifact'
  | 'length-mismatch'
  | 'file-count-mismatch'
  | 'digest-mismatch'
  | 'repository-mismatch'
  | 'base-mismatch'
  | 'head-mismatch'
  | 'content-kind-mismatch'
  | 'expired'
  | 'hash-failure'

const SafeErrorMessages: Record<CloudPatchArtifactErrorCode, string> = {
  'invalid-input': 'The Cloud Patch input has an unsupported shape.',
  'invalid-repository':
    'The Cloud Patch repository identity is not a non-secret SHA-256 fingerprint.',
  'invalid-time': 'The Cloud Patch creation or expiry time is invalid.',
  'invalid-range': 'The Cloud Patch commit selection is invalid.',
  'invalid-content-kind': 'The Cloud Patch content kind is invalid.',
  'invalid-file': 'The Cloud Patch file inventory is invalid.',
  'unsafe-path': 'The Cloud Patch contains an unsafe repository path.',
  'unsupported-entry':
    'The Cloud Patch contains an unsupported filesystem entry.',
  'duplicate-file':
    'The Cloud Patch contains duplicate or colliding file entries.',
  'too-many-files': 'The Cloud Patch contains too many file entries.',
  'file-too-large': 'A Cloud Patch file exceeds the allowed size.',
  'invalid-patch': 'The Cloud Patch text is not a supported canonical patch.',
  'patch-file-mismatch':
    'The Cloud Patch text does not match its reviewed file inventory.',
  'patch-too-large': 'The Cloud Patch text exceeds the allowed size.',
  'manifest-too-large': 'The Cloud Patch manifest exceeds the allowed size.',
  'artifact-too-large': 'The Cloud Patch artifact exceeds the allowed size.',
  'archive-input': 'Archive input is not accepted as a Cloud Patch artifact.',
  'invalid-utf8': 'The Cloud Patch artifact is not valid canonical UTF-8.',
  'invalid-text': 'The Cloud Patch artifact contains invalid control text.',
  'invalid-json': 'The Cloud Patch artifact is not valid JSON.',
  'noncanonical-artifact':
    'The Cloud Patch artifact is not canonically serialized.',
  'length-mismatch':
    'The Cloud Patch content length does not match its manifest.',
  'file-count-mismatch':
    'The Cloud Patch file count does not match its manifest.',
  'digest-mismatch': 'The Cloud Patch digest verification failed.',
  'repository-mismatch':
    'The Cloud Patch belongs to a different repository identity.',
  'base-mismatch': 'The Cloud Patch uses a different base commit.',
  'head-mismatch': 'The Cloud Patch uses a different head commit.',
  'content-kind-mismatch':
    'The Cloud Patch uses a different reviewed content kind.',
  expired: 'The Cloud Patch artifact has expired.',
  'hash-failure': 'The Cloud Patch hash boundary failed safely.',
}

/** Fixed-message error that never carries manifest values or patch content. */
export class CloudPatchArtifactError extends Error {
  public readonly name = 'CloudPatchArtifactError'

  public constructor(public readonly code: CloudPatchArtifactErrorCode) {
    super(SafeErrorMessages[code])
  }
}

export type CloudPatchParseResult =
  | { readonly ok: true; readonly artifact: ICloudPatchArtifact }
  | { readonly ok: false; readonly error: CloudPatchArtifactError }

export type CloudPatchVerificationResult = CloudPatchParseResult

export type CloudPatchSHA256 = (bytes: Uint8Array) => string

export interface ICloudPatchCreateOptions {
  readonly sha256?: CloudPatchSHA256
}

export interface ICloudPatchParseOptions extends ICloudPatchCreateOptions {
  readonly now?: () => number
}

function fail(code: CloudPatchArtifactErrorCode): never {
  throw new CloudPatchArtifactError(code)
}

function record(
  value: unknown,
  code: CloudPatchArtifactErrorCode
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(code)
  }
  return value as Record<string, unknown>
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlyArray<string>
): boolean {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return false
  }
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  )
}

function defaultSHA256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function computeSHA256(
  bytes: Uint8Array,
  hash: CloudPatchSHA256 = defaultSHA256
): string {
  let digest: string
  try {
    digest = hash(bytes)
  } catch {
    return fail('hash-failure')
  }
  if (!Sha256Pattern.test(digest)) {
    return fail('hash-failure')
  }
  return digest
}

function requireRepositoryId(value: unknown): string {
  if (typeof value !== 'string' || !RepositoryIdentityPattern.test(value)) {
    return fail('invalid-repository')
  }
  return value
}

function requireTimestamp(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MaximumJavaScriptTimestamp
  ) {
    return fail('invalid-time')
  }
  return value
}

function requireObjectId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !GitObjectIdPattern.test(value) ||
    /^0+$/.test(value)
  ) {
    return fail('invalid-range')
  }
  return value
}

function isSafePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    ControlCharacters.test(value) ||
    ForbiddenPathCharacters.test(value) ||
    utf8ByteLength(value) > MaximumCloudPatchPathBytes
  ) {
    return false
  }

  const segments = value.split('/')
  if (segments.length === 0 || segments.length > MaximumCloudPatchPathDepth) {
    return false
  }

  return segments.every(
    segment =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      segment.toLocaleLowerCase('en-US') !== '.git' &&
      !segment.endsWith('.') &&
      !segment.endsWith(' ') &&
      !WindowsReservedName.test(segment) &&
      utf8ByteLength(segment) <= MaximumCloudPatchPathSegmentBytes
  )
}

function comparePaths(left: ICloudPatchFileEntry, right: ICloudPatchFileEntry) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
}

function normalizeFiles(
  value: unknown,
  sort: boolean
): ReadonlyArray<ICloudPatchFileEntry> {
  if (!Array.isArray(value) || value.length === 0) {
    return fail('invalid-file')
  }
  if (value.length > MaximumCloudPatchFiles) {
    return fail('too-many-files')
  }

  const files = new Array<ICloudPatchFileEntry>()
  const foldedPaths = new Set<string>()
  for (const rawFile of value) {
    const candidate = record(rawFile, 'invalid-file')
    if (!hasExactKeys(candidate, ['path', 'mode', 'byteLength'])) {
      return fail('invalid-file')
    }
    if (!isSafePath(candidate.path)) {
      return fail('unsafe-path')
    }
    if (
      candidate.mode !== '100644' &&
      candidate.mode !== '100755' &&
      candidate.mode !== 'deleted'
    ) {
      return fail('unsupported-entry')
    }
    if (
      typeof candidate.byteLength !== 'number' ||
      !Number.isSafeInteger(candidate.byteLength) ||
      candidate.byteLength < 0
    ) {
      return fail('invalid-file')
    }
    if (candidate.byteLength > MaximumCloudPatchFileBytes) {
      return fail('file-too-large')
    }
    if (candidate.mode === 'deleted' && candidate.byteLength !== 0) {
      return fail('invalid-file')
    }

    const folded = candidate.path.toLocaleLowerCase('en-US')
    if (foldedPaths.has(folded)) {
      return fail('duplicate-file')
    }
    foldedPaths.add(folded)
    files.push({
      path: candidate.path,
      mode: candidate.mode,
      byteLength: candidate.byteLength,
    })
  }

  if (sort) {
    files.sort(comparePaths)
  } else {
    for (let index = 1; index < files.length; index++) {
      if (comparePaths(files[index - 1], files[index]) >= 0) {
        return fail('noncanonical-artifact')
      }
    }
  }
  return files
}

function startsWithBytes(
  bytes: Uint8Array,
  signature: ReadonlyArray<number>
): boolean {
  return (
    bytes.byteLength >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  )
}

function hasArchiveMagic(bytes: Uint8Array): boolean {
  const signatures: ReadonlyArray<ReadonlyArray<number>> = [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
    [0x1f, 0x8b],
    [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
    [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    [0x42, 0x5a, 0x68],
    [0x28, 0xb5, 0x2f, 0xfd],
  ]
  if (signatures.some(signature => startsWithBytes(bytes, signature))) {
    return true
  }
  return (
    bytes.byteLength >= 262 &&
    bytes[257] === 0x75 &&
    bytes[258] === 0x73 &&
    bytes[259] === 0x74 &&
    bytes[260] === 0x61 &&
    bytes[261] === 0x72
  )
}

function requireRegularGitMode(mode: string): void {
  if (mode !== '100644' && mode !== '100755') {
    fail('unsupported-entry')
  }
}

function parseDiffHeaderPath(line: string): string {
  const prefix = 'diff --git a/'
  if (!line.startsWith(prefix) || line.includes('"')) {
    return fail('invalid-patch')
  }
  const separator = line.lastIndexOf(' b/')
  if (separator <= prefix.length) {
    return fail('invalid-patch')
  }
  const before = line.slice(prefix.length, separator)
  const after = line.slice(separator + 3)
  if (before !== after || !isSafePath(after)) {
    return fail(before !== after ? 'patch-file-mismatch' : 'unsafe-path')
  }
  return after
}

function validatePatchSideHeader(
  line: string,
  marker: '---' | '+++',
  currentPath: string
): void {
  const value = line.slice(4)
  if (value === '/dev/null') {
    return
  }
  const prefix = marker === '---' ? 'a/' : 'b/'
  if (
    !value.startsWith(prefix) ||
    value.includes('"') ||
    value.includes('\t')
  ) {
    fail('invalid-patch')
  }
  const path = value.slice(prefix.length)
  if (!isSafePath(path)) {
    fail('unsafe-path')
  }
  if (path !== currentPath) {
    fail('patch-file-mismatch')
  }
}

function validatePatchContent(
  value: unknown,
  files: ReadonlyArray<ICloudPatchFileEntry>
): string {
  if (typeof value !== 'string') {
    return fail('invalid-patch')
  }
  const bytes = encoder.encode(value)
  if (bytes.byteLength > MaximumCloudPatchPatchBytes) {
    return fail('patch-too-large')
  }
  if (hasArchiveMagic(bytes)) {
    return fail('archive-input')
  }
  if (
    value.length === 0 ||
    !value.startsWith('diff --git ') ||
    !value.endsWith('\n') ||
    value.includes('\r') ||
    PatchControlCharacters.test(value)
  ) {
    return fail('invalid-patch')
  }

  const patchPaths = new Array<string>()
  const dispositions = new Map<string, 'regular' | 'deleted'>()
  let metadata = false
  let currentPath: string | null = null
  for (const line of value.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentPath = parseDiffHeaderPath(line)
      if (dispositions.has(currentPath)) {
        return fail('invalid-patch')
      }
      patchPaths.push(currentPath)
      dispositions.set(currentPath, 'regular')
      metadata = true
      continue
    }
    if (!metadata || currentPath === null) {
      continue
    }
    if (line.startsWith('@@')) {
      metadata = false
      continue
    }
    if (
      line === 'GIT binary patch' ||
      line.startsWith('Binary files ') ||
      line.startsWith('Submodule ')
    ) {
      return fail('unsupported-entry')
    }

    if (line.startsWith('--- ')) {
      validatePatchSideHeader(line, '---', currentPath)
      continue
    }
    if (line.startsWith('+++ ')) {
      validatePatchSideHeader(line, '+++', currentPath)
      continue
    }

    const mode =
      /^(?:new file mode|deleted file mode|old mode|new mode) ([0-7]{6})$/.exec(
        line
      )
    if (mode !== null) {
      requireRegularGitMode(mode[1])
      if (line.startsWith('deleted file mode')) {
        dispositions.set(currentPath, 'deleted')
      }
      continue
    }
    if (/^(?:new file mode|deleted file mode|old mode|new mode) /.test(line)) {
      return fail('invalid-patch')
    }
    if (line.startsWith('index ')) {
      const indexMode =
        /^index [a-f0-9]{7,64}\.\.[a-f0-9]{7,64}(?: ([0-7]{6}))?$/.exec(line)
      if (indexMode === null) {
        return fail('invalid-patch')
      }
      if (indexMode[1] !== undefined) {
        requireRegularGitMode(indexMode[1])
      }
    }
  }

  if (patchPaths.length !== files.length) {
    return fail('file-count-mismatch')
  }
  const sortedPatchPaths = [...patchPaths].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  )
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    if (sortedPatchPaths[index] !== file.path) {
      return fail('patch-file-mismatch')
    }
    const disposition = dispositions.get(file.path)
    if (
      disposition === undefined ||
      (file.mode === 'deleted') !== (disposition === 'deleted')
    ) {
      return fail('patch-file-mismatch')
    }
  }
  return value
}

function validateTimes(createdAtMs: number, expiresAtMs: number): void {
  if (createdAtMs >= expiresAtMs) {
    fail('invalid-time')
  }
}

function validateRange(baseSha: string, headSha: string): void {
  if (baseSha.length !== headSha.length || baseSha === headSha) {
    fail('invalid-range')
  }
}

function digestPreimage(
  manifest: Omit<ICloudPatchManifest, 'sha256'>,
  content: string | null
): string {
  return `${JSON.stringify({
    version: manifest.version,
    repositoryId: manifest.repositoryId,
    createdAtMs: manifest.createdAtMs,
    expiresAtMs: manifest.expiresAtMs,
    contentKind: manifest.contentKind,
    baseSha: manifest.baseSha,
    headSha: manifest.headSha,
    contentByteLength: manifest.contentByteLength,
    fileCount: manifest.fileCount,
    files: manifest.files,
    content,
  })}\n`
}

function serializeArtifact(
  manifest: ICloudPatchManifest,
  content: string | null
): string {
  return `${JSON.stringify({ manifest, content })}\n`
}

function freezeArtifact(
  manifest: ICloudPatchManifest,
  content: string | null,
  serialized: string,
  artifactSha256: string
): ICloudPatchArtifact {
  const files = Object.freeze(
    manifest.files.map(file => Object.freeze({ ...file }))
  )
  const frozenManifest = Object.freeze({ ...manifest, files })
  return Object.freeze({
    manifest: frozenManifest,
    content,
    serialized,
    artifactSha256,
  })
}

function manifestWithoutDigest(
  repositoryId: string,
  createdAtMs: number,
  expiresAtMs: number,
  contentKind: CloudPatchContentKind,
  baseSha: string,
  headSha: string | null,
  contentByteLength: number,
  files: ReadonlyArray<ICloudPatchFileEntry>
): Omit<ICloudPatchManifest, 'sha256'> {
  return {
    version: CloudPatchArtifactVersion,
    repositoryId,
    createdAtMs,
    expiresAtMs,
    contentKind,
    baseSha,
    headSha,
    contentByteLength,
    fileCount: files.length,
    files,
  }
}

function finishArtifact(
  partialManifest: Omit<ICloudPatchManifest, 'sha256'>,
  content: string | null,
  hash?: CloudPatchSHA256
): ICloudPatchArtifact {
  const sha256 = computeSHA256(
    encoder.encode(digestPreimage(partialManifest, content)),
    hash
  )
  const manifest: ICloudPatchManifest = { ...partialManifest, sha256 }
  const manifestBytes = utf8ByteLength(`${JSON.stringify(manifest)}\n`)
  if (manifestBytes > MaximumCloudPatchManifestBytes) {
    return fail('manifest-too-large')
  }
  const serialized = serializeArtifact(manifest, content)
  const serializedBytes = encoder.encode(serialized)
  if (serializedBytes.byteLength > MaximumCloudPatchArtifactBytes) {
    return fail('artifact-too-large')
  }
  const artifactSha256 = computeSHA256(serializedBytes, hash)
  return freezeArtifact(manifest, content, serialized, artifactSha256)
}

/**
 * Build the immutable local artifact reviewed before any upload. Upload/share
 * authorization remains R1 work; apply authorization and fresh repository
 * revalidation remain R14 work. This module performs no filesystem, process,
 * Git, network, upload, share, or apply operation.
 */
export function createCloudPatchArtifact(
  input: CloudPatchArtifactInput,
  options: ICloudPatchCreateOptions = {}
): ICloudPatchArtifact {
  const candidate = record(input, 'invalid-input')
  const commonKeys = [
    'kind',
    'repositoryId',
    'createdAtMs',
    'expiresAtMs',
    'baseSha',
    'files',
  ]
  if (candidate.kind === 'commit-range') {
    if (!hasExactKeys(candidate, [...commonKeys, 'headSha'])) {
      return fail('invalid-input')
    }
  } else if (candidate.kind === 'working-tree-patch') {
    if (!hasExactKeys(candidate, [...commonKeys, 'patch'])) {
      return fail('invalid-input')
    }
  } else {
    return fail('invalid-content-kind')
  }

  const repositoryId = requireRepositoryId(candidate.repositoryId)
  const createdAtMs = requireTimestamp(candidate.createdAtMs)
  const expiresAtMs = requireTimestamp(candidate.expiresAtMs)
  validateTimes(createdAtMs, expiresAtMs)
  const baseSha = requireObjectId(candidate.baseSha)
  const files = normalizeFiles(candidate.files, true)

  if (candidate.kind === 'commit-range') {
    const headSha = requireObjectId(candidate.headSha)
    validateRange(baseSha, headSha)
    return finishArtifact(
      manifestWithoutDigest(
        repositoryId,
        createdAtMs,
        expiresAtMs,
        candidate.kind,
        baseSha,
        headSha,
        0,
        files
      ),
      null,
      options.sha256
    )
  }

  const content = validatePatchContent(candidate.patch, files)
  return finishArtifact(
    manifestWithoutDigest(
      repositoryId,
      createdAtMs,
      expiresAtMs,
      candidate.kind,
      baseSha,
      null,
      utf8ByteLength(content),
      files
    ),
    content,
    options.sha256
  )
}

function decodeCanonicalArtifact(bytes: Uint8Array): string {
  if (bytes.byteLength > MaximumCloudPatchArtifactBytes) {
    return fail('artifact-too-large')
  }
  if (hasArchiveMagic(bytes)) {
    return fail('archive-input')
  }
  let serialized: string
  try {
    serialized = decoder.decode(bytes)
  } catch {
    return fail('invalid-utf8')
  }
  if (!bytesEqual(encoder.encode(serialized), bytes)) {
    return fail('invalid-utf8')
  }
  if (
    !serialized.endsWith('\n') ||
    serialized.indexOf('\n') !== serialized.length - 1 ||
    ControlCharacters.test(serialized.slice(0, -1))
  ) {
    return fail('invalid-text')
  }
  return serialized
}

function parseManifest(
  value: unknown,
  content: unknown
): { readonly manifest: ICloudPatchManifest; readonly content: string | null } {
  const candidate = record(value, 'invalid-input')
  const keys = [
    'version',
    'repositoryId',
    'createdAtMs',
    'expiresAtMs',
    'contentKind',
    'baseSha',
    'headSha',
    'contentByteLength',
    'fileCount',
    'files',
    'sha256',
  ]
  if (!hasExactKeys(candidate, keys)) {
    return fail('invalid-input')
  }
  if (candidate.version !== CloudPatchArtifactVersion) {
    return fail('invalid-input')
  }
  const repositoryId = requireRepositoryId(candidate.repositoryId)
  const createdAtMs = requireTimestamp(candidate.createdAtMs)
  const expiresAtMs = requireTimestamp(candidate.expiresAtMs)
  validateTimes(createdAtMs, expiresAtMs)
  const baseSha = requireObjectId(candidate.baseSha)
  const files = normalizeFiles(candidate.files, false)
  if (
    typeof candidate.fileCount !== 'number' ||
    !Number.isSafeInteger(candidate.fileCount) ||
    candidate.fileCount < 0
  ) {
    return fail('file-count-mismatch')
  }
  if (candidate.fileCount !== files.length) {
    return fail('file-count-mismatch')
  }
  if (
    typeof candidate.contentByteLength !== 'number' ||
    !Number.isSafeInteger(candidate.contentByteLength) ||
    candidate.contentByteLength < 0
  ) {
    return fail('length-mismatch')
  }
  if (
    typeof candidate.sha256 !== 'string' ||
    !Sha256Pattern.test(candidate.sha256)
  ) {
    return fail('digest-mismatch')
  }

  let contentKind: CloudPatchContentKind
  let headSha: string | null
  let normalizedContent: string | null
  if (candidate.contentKind === 'commit-range') {
    contentKind = candidate.contentKind
    headSha = requireObjectId(candidate.headSha)
    validateRange(baseSha, headSha)
    if (content !== null || candidate.contentByteLength !== 0) {
      return fail('invalid-content-kind')
    }
    normalizedContent = null
  } else if (candidate.contentKind === 'working-tree-patch') {
    contentKind = candidate.contentKind
    if (candidate.headSha !== null) {
      return fail('invalid-content-kind')
    }
    headSha = null
    normalizedContent = validatePatchContent(content, files)
    if (utf8ByteLength(normalizedContent) !== candidate.contentByteLength) {
      return fail('length-mismatch')
    }
  } else {
    return fail('invalid-content-kind')
  }

  return {
    manifest: {
      version: CloudPatchArtifactVersion,
      repositoryId,
      createdAtMs,
      expiresAtMs,
      contentKind,
      baseSha,
      headSha,
      contentByteLength: candidate.contentByteLength,
      fileCount: candidate.fileCount,
      files,
      sha256: candidate.sha256,
    },
    content: normalizedContent,
  }
}

function parseArtifactOrThrow(
  bytes: Uint8Array,
  options: ICloudPatchParseOptions
): ICloudPatchArtifact {
  if (bytes.byteLength > MaximumCloudPatchArtifactBytes) {
    return fail('artifact-too-large')
  }
  const copiedBytes = Uint8Array.from(bytes)
  const serialized = decodeCanonicalArtifact(copiedBytes)
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return fail('invalid-json')
  }
  const artifact = record(value, 'invalid-input')
  if (!hasExactKeys(artifact, ['manifest', 'content'])) {
    return fail('invalid-input')
  }
  if (
    utf8ByteLength(`${JSON.stringify(artifact.manifest)}\n`) >
    MaximumCloudPatchManifestBytes
  ) {
    return fail('manifest-too-large')
  }

  const parsed = parseManifest(artifact.manifest, artifact.content)
  const withoutDigest = manifestWithoutDigest(
    parsed.manifest.repositoryId,
    parsed.manifest.createdAtMs,
    parsed.manifest.expiresAtMs,
    parsed.manifest.contentKind,
    parsed.manifest.baseSha,
    parsed.manifest.headSha,
    parsed.manifest.contentByteLength,
    parsed.manifest.files
  )
  const expectedDigest = computeSHA256(
    encoder.encode(digestPreimage(withoutDigest, parsed.content)),
    options.sha256
  )
  if (expectedDigest !== parsed.manifest.sha256) {
    return fail('digest-mismatch')
  }
  const canonical = serializeArtifact(parsed.manifest, parsed.content)
  if (canonical !== serialized) {
    return fail('noncanonical-artifact')
  }

  let now: number
  try {
    now = options.now?.() ?? Date.now()
  } catch {
    return fail('invalid-time')
  }
  now = requireTimestamp(now)
  if (now >= parsed.manifest.expiresAtMs) {
    return fail('expired')
  }

  return freezeArtifact(
    parsed.manifest,
    parsed.content,
    serialized,
    computeSHA256(copiedBytes, options.sha256)
  )
}

function safeFailure(error: unknown): CloudPatchArtifactError {
  return error instanceof CloudPatchArtifactError
    ? error
    : new CloudPatchArtifactError('invalid-input')
}

/** Strictly parse, validate integrity, canonicalize, and expiry-check an artifact. */
export function parseCloudPatchArtifact(
  bytes: Uint8Array,
  options: ICloudPatchParseOptions = {}
): CloudPatchParseResult {
  try {
    return { ok: true, artifact: parseArtifactOrThrow(bytes, options) }
  } catch (error) {
    return { ok: false, error: safeFailure(error) }
  }
}

function normalizeExpectation(
  value: CloudPatchVerificationExpectation
): CloudPatchVerificationExpectation {
  const candidate = record(value, 'invalid-input')
  if (candidate.kind === 'commit-range') {
    if (
      !hasExactKeys(candidate, ['kind', 'repositoryId', 'baseSha', 'headSha'])
    ) {
      return fail('invalid-input')
    }
    const baseSha = requireObjectId(candidate.baseSha)
    const headSha = requireObjectId(candidate.headSha)
    validateRange(baseSha, headSha)
    return {
      kind: candidate.kind,
      repositoryId: requireRepositoryId(candidate.repositoryId),
      baseSha,
      headSha,
    }
  }
  if (candidate.kind === 'working-tree-patch') {
    if (!hasExactKeys(candidate, ['kind', 'repositoryId', 'baseSha'])) {
      return fail('invalid-input')
    }
    return {
      kind: candidate.kind,
      repositoryId: requireRepositoryId(candidate.repositoryId),
      baseSha: requireObjectId(candidate.baseSha),
    }
  }
  return fail('invalid-content-kind')
}

/** Verify that a parsed artifact is the exact reviewed repository selection. */
export function verifyCloudPatchArtifact(
  bytes: Uint8Array,
  expectation: CloudPatchVerificationExpectation,
  options: ICloudPatchParseOptions = {}
): CloudPatchVerificationResult {
  try {
    const expected = normalizeExpectation(expectation)
    const artifact = parseArtifactOrThrow(bytes, options)
    const { manifest } = artifact
    if (manifest.repositoryId !== expected.repositoryId) {
      return {
        ok: false,
        error: new CloudPatchArtifactError('repository-mismatch'),
      }
    }
    if (manifest.contentKind !== expected.kind) {
      return {
        ok: false,
        error: new CloudPatchArtifactError('content-kind-mismatch'),
      }
    }
    if (manifest.baseSha !== expected.baseSha) {
      return { ok: false, error: new CloudPatchArtifactError('base-mismatch') }
    }
    if (
      expected.kind === 'commit-range' &&
      manifest.headSha !== expected.headSha
    ) {
      return { ok: false, error: new CloudPatchArtifactError('head-mismatch') }
    }
    return { ok: true, artifact }
  } catch (error) {
    return { ok: false, error: safeFailure(error) }
  }
}
