import { createHash, timingSafeEqual } from 'crypto'

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
export const MaximumCloudPatchArtifactLifetimeMs = 7 * 24 * 60 * 60 * 1000
export const CloudPatchFutureClockSkewAllowanceMs = 5 * 60 * 1000

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
  /** Self-contained integrity checksum; it is not an authenticity claim. */
  readonly sha256: string
}

export interface ICloudPatchArtifact {
  readonly manifest: ICloudPatchManifest
  readonly content: string | null
  /** Exact canonical UTF-8 text. Strings keep the returned artifact immutable. */
  readonly serialized: string
  /** Complete canonical checksum, including the terminal LF; not authentication. */
  readonly artifactSha256: string
}

interface ICloudPatchExpectationBase {
  readonly repositoryId: string
  readonly baseSha: string
  /** Complete-artifact digest supplied by reviewed out-of-band share metadata. */
  readonly expectedArtifactSha256: string
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
  | 'artifact-digest-mismatch'
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
  'artifact-digest-mismatch':
    'The complete Cloud Patch artifact does not match the reviewed digest.',
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
  readonly now?: () => number
}

export type ICloudPatchParseOptions = ICloudPatchCreateOptions

export interface ICloudPatchVerificationOptions {
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

function sha256DigestsEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
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

function requireSHA256(
  value: unknown,
  code: 'invalid-input' | 'digest-mismatch' = 'digest-mismatch'
): string {
  if (typeof value !== 'string' || !Sha256Pattern.test(value)) {
    return fail(code)
  }
  return value
}

function readClock(now: (() => number) | undefined): number {
  let value: number
  try {
    value = now?.() ?? Date.now()
  } catch {
    return fail('invalid-time')
  }
  return requireTimestamp(value)
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

type RegularCloudPatchFileMode = Exclude<CloudPatchFileMode, 'deleted'>
type PatchFileDisposition = 'create' | 'delete' | 'modify'
type PatchFilePhase = 'metadata' | 'new-side' | 'hunk-header' | 'hunks'

interface IPatchFileState {
  readonly path: string
  readonly file: ICloudPatchFileEntry
  phase: PatchFilePhase
  sawIndex: boolean
  indexOldIsNull?: boolean
  indexNewIsNull?: boolean
  oldSideIsNull?: boolean
  newSideIsNull?: boolean
  indexMode?: RegularCloudPatchFileMode
  newFileMode?: RegularCloudPatchFileMode
  deletedFileMode?: RegularCloudPatchFileMode
  oldMode?: RegularCloudPatchFileMode
  newMode?: RegularCloudPatchFileMode
}

function requireRegularGitMode(mode: string): RegularCloudPatchFileMode {
  if (mode !== '100644' && mode !== '100755') {
    fail('unsupported-entry')
  }
  return mode
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
): boolean {
  const value = line.slice(4)
  if (value === '/dev/null') {
    return true
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
  return false
}

function setPatchMode(
  state: IPatchFileState,
  declaration: 'new file mode' | 'deleted file mode' | 'old mode' | 'new mode',
  mode: RegularCloudPatchFileMode
): void {
  const key =
    declaration === 'new file mode'
      ? 'newFileMode'
      : declaration === 'deleted file mode'
      ? 'deletedFileMode'
      : declaration === 'old mode'
      ? 'oldMode'
      : 'newMode'
  if (state[key] !== undefined) {
    fail('invalid-patch')
  }
  state[key] = mode
}

function parsePatchMetadata(line: string, state: IPatchFileState): boolean {
  const mode =
    /^(new file mode|deleted file mode|old mode|new mode) ([0-7]{6})$/.exec(
      line
    )
  if (mode !== null) {
    setPatchMode(
      state,
      mode[1] as
        | 'new file mode'
        | 'deleted file mode'
        | 'old mode'
        | 'new mode',
      requireRegularGitMode(mode[2])
    )
    return true
  }
  if (/^(?:new file mode|deleted file mode|old mode|new mode) /.test(line)) {
    return fail('invalid-patch')
  }

  if (line.startsWith('index ')) {
    if (state.sawIndex) {
      return fail('invalid-patch')
    }
    state.sawIndex = true
    const index =
      /^index ([a-f0-9]{7,64})\.\.([a-f0-9]{7,64})(?: ([0-7]{6}))?$/.exec(line)
    if (index === null) {
      return fail('invalid-patch')
    }
    if (index[1].length !== index[2].length) {
      return fail('invalid-patch')
    }
    state.indexOldIsNull = /^0+$/.test(index[1])
    state.indexNewIsNull = /^0+$/.test(index[2])
    if (index[3] !== undefined) {
      state.indexMode = requireRegularGitMode(index[3])
    }
    return true
  }

  if (
    line === 'GIT binary patch' ||
    line.startsWith('Binary files ') ||
    line.startsWith('Submodule ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('copy from ') ||
    line.startsWith('copy to ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('dissimilarity index ')
  ) {
    return fail('unsupported-entry')
  }
  return false
}

function patchDisposition(state: IPatchFileState): PatchFileDisposition {
  if (state.oldSideIsNull === undefined || state.newSideIsNull === undefined) {
    return fail('invalid-patch')
  }
  if (state.oldSideIsNull && state.newSideIsNull) {
    return fail('invalid-patch')
  }
  return state.oldSideIsNull
    ? 'create'
    : state.newSideIsNull
    ? 'delete'
    : 'modify'
}

function requirePatchIndex(
  state: IPatchFileState
): readonly [oldIsNull: boolean, newIsNull: boolean] {
  if (
    !state.sawIndex ||
    state.indexOldIsNull === undefined ||
    state.indexNewIsNull === undefined
  ) {
    fail('invalid-patch')
  }
  return [state.indexOldIsNull, state.indexNewIsNull]
}

function finishMetadataOnlyPatchFile(state: IPatchFileState): void {
  const [oldIndexIsNull, newIndexIsNull] = requirePatchIndex(state)
  const hasModePair = state.oldMode !== undefined && state.newMode !== undefined
  if ((state.oldMode === undefined) !== (state.newMode === undefined)) {
    fail('invalid-patch')
  }
  if (
    state.oldSideIsNull !== undefined ||
    state.newSideIsNull !== undefined ||
    state.indexMode !== undefined ||
    state.file.byteLength !== 0 ||
    oldIndexIsNull === newIndexIsNull
  ) {
    fail(state.file.byteLength !== 0 ? 'patch-file-mismatch' : 'invalid-patch')
  }

  if (oldIndexIsNull) {
    if (
      state.newFileMode === undefined ||
      state.deletedFileMode !== undefined ||
      hasModePair
    ) {
      fail('invalid-patch')
    }
    if (
      state.file.mode === 'deleted' ||
      state.newFileMode !== state.file.mode
    ) {
      fail('patch-file-mismatch')
    }
    return
  }

  if (
    state.deletedFileMode === undefined ||
    state.newFileMode !== undefined ||
    hasModePair
  ) {
    fail('invalid-patch')
  }
  if (state.file.mode !== 'deleted') {
    fail('patch-file-mismatch')
  }
}

function finishPatchFile(state: IPatchFileState): void {
  if (state.phase === 'metadata') {
    finishMetadataOnlyPatchFile(state)
    return
  }
  if (state.phase !== 'hunks') {
    fail('invalid-patch')
  }
  const disposition = patchDisposition(state)
  const [oldIndexIsNull, newIndexIsNull] = requirePatchIndex(state)
  if (
    oldIndexIsNull !== state.oldSideIsNull ||
    newIndexIsNull !== state.newSideIsNull
  ) {
    fail('invalid-patch')
  }
  const hasModePair = state.oldMode !== undefined && state.newMode !== undefined
  if ((state.oldMode === undefined) !== (state.newMode === undefined)) {
    fail('invalid-patch')
  }

  if (disposition === 'create') {
    if (
      state.newFileMode === undefined ||
      state.deletedFileMode !== undefined ||
      hasModePair
    ) {
      fail('invalid-patch')
    }
    if (
      state.file.mode === 'deleted' ||
      state.newFileMode !== state.file.mode ||
      (state.indexMode !== undefined && state.indexMode !== state.file.mode)
    ) {
      fail('patch-file-mismatch')
    }
    return
  }

  if (disposition === 'delete') {
    if (
      state.deletedFileMode === undefined ||
      state.newFileMode !== undefined ||
      hasModePair
    ) {
      fail('invalid-patch')
    }
    if (state.file.mode !== 'deleted' || state.indexMode !== undefined) {
      fail('patch-file-mismatch')
    }
    return
  }

  if (state.newFileMode !== undefined || state.deletedFileMode !== undefined) {
    fail('invalid-patch')
  }
  if (state.file.mode === 'deleted') {
    fail('patch-file-mismatch')
  }
  if (state.indexMode !== undefined && state.indexMode !== state.file.mode) {
    fail('patch-file-mismatch')
  }
  const resultingMode = state.newMode ?? state.indexMode
  if (resultingMode === undefined || resultingMode !== state.file.mode) {
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

  const filesByPath = new Map(files.map(file => [file.path, file]))
  const patchPaths = new Set<string>()
  let current: IPatchFileState | null = null
  const lines = value.slice(0, -1).split('\n')
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current !== null) {
        finishPatchFile(current)
      }
      const path = parseDiffHeaderPath(line)
      if (patchPaths.has(path)) {
        return fail('invalid-patch')
      }
      const file = filesByPath.get(path)
      if (file === undefined) {
        return fail('patch-file-mismatch')
      }
      patchPaths.add(path)
      current = { path, file, phase: 'metadata', sawIndex: false }
      continue
    }
    if (current === null) {
      return fail('invalid-patch')
    }

    if (current.phase === 'hunks') {
      if (line.startsWith('@@')) {
        continue
      }
      if (
        line !== '\\ No newline at end of file' &&
        line[0] !== ' ' &&
        line[0] !== '+' &&
        line[0] !== '-'
      ) {
        return fail('invalid-patch')
      }
      continue
    }

    if (line.startsWith('@@')) {
      if (current.phase !== 'hunk-header') {
        return fail('invalid-patch')
      }
      current.phase = 'hunks'
      continue
    }

    if (current.phase === 'metadata' && line.startsWith('--- ')) {
      current.oldSideIsNull = validatePatchSideHeader(line, '---', current.path)
      current.phase = 'new-side'
      continue
    }
    if (current.phase === 'new-side' && line.startsWith('+++ ')) {
      current.newSideIsNull = validatePatchSideHeader(line, '+++', current.path)
      current.phase = 'hunk-header'
      continue
    }
    if (current.phase !== 'metadata') {
      return fail('invalid-patch')
    }
    if (!parsePatchMetadata(line, current)) {
      return fail('invalid-patch')
    }
  }

  if (current === null) {
    return fail('invalid-patch')
  }
  finishPatchFile(current)
  if (patchPaths.size !== files.length) {
    return fail('file-count-mismatch')
  }
  return value
}

function validateTimeRange(createdAtMs: number, expiresAtMs: number): void {
  if (
    createdAtMs >= expiresAtMs ||
    expiresAtMs - createdAtMs > MaximumCloudPatchArtifactLifetimeMs
  ) {
    fail('invalid-time')
  }
}

function validateFreshness(
  createdAtMs: number,
  expiresAtMs: number,
  nowMs: number
): void {
  if (
    createdAtMs > nowMs &&
    createdAtMs - nowMs > CloudPatchFutureClockSkewAllowanceMs
  ) {
    fail('invalid-time')
  }
  if (nowMs >= expiresAtMs) {
    fail('expired')
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
  validateTimeRange(createdAtMs, expiresAtMs)
  validateFreshness(createdAtMs, expiresAtMs, readClock(options.now))
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
  validateTimeRange(createdAtMs, expiresAtMs)
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

  validateFreshness(
    parsed.manifest.createdAtMs,
    parsed.manifest.expiresAtMs,
    readClock(options.now)
  )

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
      !hasExactKeys(candidate, [
        'kind',
        'repositoryId',
        'baseSha',
        'headSha',
        'expectedArtifactSha256',
      ])
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
      expectedArtifactSha256: requireSHA256(
        candidate.expectedArtifactSha256,
        'invalid-input'
      ),
    }
  }
  if (candidate.kind === 'working-tree-patch') {
    if (
      !hasExactKeys(candidate, [
        'kind',
        'repositoryId',
        'baseSha',
        'expectedArtifactSha256',
      ])
    ) {
      return fail('invalid-input')
    }
    return {
      kind: candidate.kind,
      repositoryId: requireRepositoryId(candidate.repositoryId),
      baseSha: requireObjectId(candidate.baseSha),
      expectedArtifactSha256: requireSHA256(
        candidate.expectedArtifactSha256,
        'invalid-input'
      ),
    }
  }
  return fail('invalid-content-kind')
}

/**
 * Bind parsed integrity to a complete-artifact digest obtained from separately
 * reviewed or server-authenticated metadata, then verify repository selection.
 * This function does not create signatures, trust metadata, or contact a server.
 */
export function verifyCloudPatchArtifact(
  bytes: Uint8Array,
  expectation: CloudPatchVerificationExpectation,
  options: ICloudPatchVerificationOptions = {}
): CloudPatchVerificationResult {
  try {
    const expected = normalizeExpectation(expectation)
    // Verification always uses the fixed SHA-256 implementation. Hash injection
    // remains a parse/create test boundary and cannot override reviewed metadata.
    const artifact = parseArtifactOrThrow(bytes, { now: options.now })
    if (
      !sha256DigestsEqual(
        artifact.artifactSha256,
        expected.expectedArtifactSha256
      )
    ) {
      return {
        ok: false,
        error: new CloudPatchArtifactError('artifact-digest-mismatch'),
      }
    }
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
