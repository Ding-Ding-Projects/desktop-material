/**
 * Immutable Cheap LFS asset selection captured before cloning a hosted
 * repository.
 *
 * The inventory is only an untrusted discovery hint. Consumers must still
 * inspect the freshly cloned repository and match these paths against
 * authoritative committed pointer files before materializing anything.
 */
export interface ICheapLfsCloneSelection {
  /** Stable signed-in account identity used for the manifest request. */
  readonly accountKey: string

  /** Exact hosted clone URL whose row exposed the inventory. */
  readonly repositoryCloneUrl: string

  /** Default branch ref used to fetch the inventory. */
  readonly defaultBranch: string

  /** Git blob identity returned for the managed inventory file. */
  readonly manifestBlobSha: string

  /** Deterministic pointer-set identity declared by inventory schema v1. */
  readonly pointerSetSha256: string

  /**
   * Safe repository-relative POSIX paths selected for post-clone
   * materialization. An empty list is an explicit "download none" choice.
   */
  readonly paths: ReadonlyArray<string>
}

export const MaximumCheapLfsCloneAssets = 5000
export const MaximumCheapLfsClonePathBytes = 4096
export const MaximumCheapLfsClonePathDepth = 128
export const MaximumCheapLfsClonePathSegmentBytes = 255
export const MaximumCheapLfsCloneAccountKeyLength = 4096
export const MaximumCheapLfsCloneUrlLength = 8192
export const MaximumCheapLfsCloneBranchLength = 1024

const utf8Encoder = new TextEncoder()
const sha256 = /^[a-f0-9]{64}$/
const gitObjectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const controlCharacters = /[\u0000-\u001f\u007f]/
const windowsForbiddenCharacters = /[<>:"\\|?*]/
const windowsReservedName =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i
const selectionKeys = new Set([
  'accountKey',
  'repositoryCloneUrl',
  'defaultBranch',
  'manifestBlobSha',
  'pointerSetSha256',
  'paths',
])

/** Exact UTF-8 byte length without relying on Node-only Buffer globals. */
function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength
}

/**
 * Validate one portable repository-relative asset path.
 *
 * Inventory paths use POSIX separators even though Desktop Material is a
 * Windows application. Rejecting traversal, alternate separators, device
 * names, case-fold collisions (at the collection boundary), and components
 * Windows cannot create keeps the selection safe to persist and later join
 * beneath a freshly cloned worktree. Linux helper scripts consume the same
 * normalized POSIX spelling.
 */
export function isSafeCheapLfsClonePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    controlCharacters.test(value) ||
    windowsForbiddenCharacters.test(value) ||
    utf8ByteLength(value) > MaximumCheapLfsClonePathBytes
  ) {
    return false
  }

  const segments = value.split('/')
  if (
    segments.length === 0 ||
    segments.length > MaximumCheapLfsClonePathDepth
  ) {
    return false
  }

  return segments.every(
    segment =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.endsWith('.') &&
      !segment.endsWith(' ') &&
      !windowsReservedName.test(segment) &&
      utf8ByteLength(segment) <= MaximumCheapLfsClonePathSegmentBytes
  )
}

/**
 * Validate a persisted/pre-clone selection before it can reach clone
 * orchestration. Paths must be strictly sorted and case-fold unique so their
 * identity is deterministic and cannot alias on a Windows worktree.
 */
export function isSafeCheapLfsCloneSelection(
  value: unknown
): value is ICheapLfsCloneSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const actualKeys = Object.keys(value)
  if (
    actualKeys.length !== selectionKeys.size ||
    actualKeys.some(key => !selectionKeys.has(key))
  ) {
    return false
  }

  const selection = value as Partial<ICheapLfsCloneSelection>
  if (
    typeof selection.accountKey !== 'string' ||
    selection.accountKey.length === 0 ||
    selection.accountKey.length > MaximumCheapLfsCloneAccountKeyLength ||
    controlCharacters.test(selection.accountKey) ||
    typeof selection.repositoryCloneUrl !== 'string' ||
    selection.repositoryCloneUrl.length === 0 ||
    selection.repositoryCloneUrl.length > MaximumCheapLfsCloneUrlLength ||
    controlCharacters.test(selection.repositoryCloneUrl) ||
    typeof selection.defaultBranch !== 'string' ||
    selection.defaultBranch.length === 0 ||
    selection.defaultBranch.length > MaximumCheapLfsCloneBranchLength ||
    controlCharacters.test(selection.defaultBranch) ||
    typeof selection.manifestBlobSha !== 'string' ||
    !gitObjectId.test(selection.manifestBlobSha) ||
    typeof selection.pointerSetSha256 !== 'string' ||
    !sha256.test(selection.pointerSetSha256) ||
    !Array.isArray(selection.paths) ||
    selection.paths.length > MaximumCheapLfsCloneAssets
  ) {
    return false
  }

  let previous: string | null = null
  const folded = new Set<string>()
  for (const path of selection.paths) {
    if (
      !isSafeCheapLfsClonePath(path) ||
      (previous !== null && previous >= path)
    ) {
      return false
    }
    const key = path.toLocaleLowerCase('en-US')
    if (folded.has(key)) {
      return false
    }
    folded.add(key)
    previous = path
  }

  return true
}

/** Stable key used to reject stale selections after any inventory ref changes. */
export function getCheapLfsCloneSelectionIdentity(
  selection: Pick<
    ICheapLfsCloneSelection,
    | 'accountKey'
    | 'repositoryCloneUrl'
    | 'defaultBranch'
    | 'manifestBlobSha'
    | 'pointerSetSha256'
  >
): string {
  return [
    selection.accountKey,
    selection.repositoryCloneUrl,
    selection.defaultBranch,
    selection.manifestBlobSha,
    selection.pointerSetSha256,
  ].join('\u0000')
}
