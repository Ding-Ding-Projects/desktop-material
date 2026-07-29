import { Buffer } from 'buffer'
import { createHash } from 'crypto'
import {
  ICheapLfsCloneSelection,
  isSafeCheapLfsClonePath,
  isSafeCheapLfsCloneSelection,
  MaximumCheapLfsCloneAssets,
} from '../../models/cheap-lfs-clone-selection'

/** Managed default-branch discovery marker emitted by the helper template. */
export const CHEAP_LFS_CLONE_INVENTORY_PATH =
  '.desktop-material/cheap-lfs/inventory.json'

/** Hard limit for decoded schema-v1 inventory text. */
export const CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES = 1024 * 1024

/**
 * The GitHub Contents envelope base64-encodes the inventory and adds metadata.
 * Keep the network JSON read bounded independently of the decoded-file guard.
 */
export const CHEAP_LFS_CLONE_INVENTORY_RESPONSE_MAXIMUM_BYTES = 2 * 1024 * 1024

export type CheapLfsCloneAssetProvider = 'release' | 'ghcr' | 'docker-hub'

export interface ICheapLfsCloneInventoryAsset {
  readonly path: string
  readonly provider: CheapLfsCloneAssetProvider
  readonly size: number
  readonly objectSha256: string
  readonly pointerBlobSha256: string
}

export interface ICheapLfsCloneInventory {
  readonly schemaVersion: 1
  readonly pointerSetSha256: string
  readonly assets: ReadonlyArray<ICheapLfsCloneInventoryAsset>
}

/**
 * Stable identity for the exact pointer set advertised by a managed inventory.
 *
 * Paths are already strict, sorted, and NUL-free. Encoding each
 * path/pointer-digest pair as JSON avoids delimiter ambiguity and lets the
 * post-clone validator reproduce the identity from authoritative pointer
 * bytes before any asset is hydrated.
 */
export function calculateCheapLfsClonePointerSetSha256(
  assets: ReadonlyArray<
    Pick<ICheapLfsCloneInventoryAsset, 'path' | 'pointerBlobSha256'>
  >
): string {
  const identity = JSON.stringify(
    assets.map(asset => [asset.path, asset.pointerBlobSha256])
  )
  return createHash('sha256').update(identity, 'utf8').digest('hex')
}

export type CheapLfsCloneInventoryParseFailure =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-schema'
  | 'too-many-assets'
  | 'unsafe-path'
  | 'duplicate-path'
  | 'unsorted-assets'

export type CheapLfsCloneInventoryParseResult =
  | {
      readonly kind: 'valid'
      readonly inventory: ICheapLfsCloneInventory
    }
  | {
      readonly kind: 'invalid'
      readonly reason: CheapLfsCloneInventoryParseFailure
    }

export type CheapLfsCloneInventoryRemoteFile =
  | {
      readonly kind: 'found'
      readonly text: string
      readonly blobSha: string
      readonly ref: string
    }
  | { readonly kind: 'absent' }
  | { readonly kind: 'auth' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'truncated' }

const utf8Encoder = new TextEncoder()
const sha256 = /^[a-f0-9]{64}$/
const gitObjectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const providers = new Set<CheapLfsCloneAssetProvider>([
  'release',
  'ghcr',
  'docker-hub',
])

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the deterministic v1 manifest as an untrusted hint.
 *
 * Strict shape/order checks keep cache and selection identities stable. The
 * actual pointer files in the completed clone remain authoritative.
 */
export function parseCheapLfsCloneInventory(
  text: string
): CheapLfsCloneInventoryParseResult {
  if (
    typeof text !== 'string' ||
    utf8Encoder.encode(text).byteLength >
      CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES
  ) {
    return { kind: 'invalid', reason: 'too-large' }
  }

  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return { kind: 'invalid', reason: 'invalid-json' }
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'pointerSetSha256', 'assets']) ||
    value.schemaVersion !== 1 ||
    typeof value.pointerSetSha256 !== 'string' ||
    !sha256.test(value.pointerSetSha256) ||
    !Array.isArray(value.assets)
  ) {
    return { kind: 'invalid', reason: 'invalid-schema' }
  }
  if (value.assets.length > MaximumCheapLfsCloneAssets) {
    return { kind: 'invalid', reason: 'too-many-assets' }
  }

  const assets = new Array<ICheapLfsCloneInventoryAsset>()
  const foldedPaths = new Set<string>()
  let previousPath: string | null = null

  for (const candidate of value.assets) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, [
        'path',
        'provider',
        'size',
        'objectSha256',
        'pointerBlobSha256',
      ]) ||
      typeof candidate.path !== 'string' ||
      typeof candidate.provider !== 'string' ||
      !providers.has(candidate.provider as CheapLfsCloneAssetProvider) ||
      typeof candidate.size !== 'number' ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size < 0 ||
      typeof candidate.objectSha256 !== 'string' ||
      !sha256.test(candidate.objectSha256) ||
      typeof candidate.pointerBlobSha256 !== 'string' ||
      !sha256.test(candidate.pointerBlobSha256)
    ) {
      return { kind: 'invalid', reason: 'invalid-schema' }
    }
    if (!isSafeCheapLfsClonePath(candidate.path)) {
      return { kind: 'invalid', reason: 'unsafe-path' }
    }
    if (previousPath !== null && previousPath >= candidate.path) {
      return { kind: 'invalid', reason: 'unsorted-assets' }
    }
    const foldedPath = candidate.path.toLocaleLowerCase('en-US')
    if (foldedPaths.has(foldedPath)) {
      return { kind: 'invalid', reason: 'duplicate-path' }
    }
    foldedPaths.add(foldedPath)
    previousPath = candidate.path
    assets.push({
      path: candidate.path,
      provider: candidate.provider as CheapLfsCloneAssetProvider,
      size: candidate.size,
      objectSha256: candidate.objectSha256,
      pointerBlobSha256: candidate.pointerBlobSha256,
    })
  }
  if (
    calculateCheapLfsClonePointerSetSha256(assets) !== value.pointerSetSha256
  ) {
    return { kind: 'invalid', reason: 'invalid-schema' }
  }

  return {
    kind: 'valid',
    inventory: {
      schemaVersion: 1,
      pointerSetSha256: value.pointerSetSha256,
      assets,
    },
  }
}

/**
 * Decode and validate the small GitHub Contents API envelope used by the
 * inventory request. GitHub may return `encoding: "none"` for oversized
 * content; that is explicitly classified as truncation rather than parsed.
 */
export function decodeCheapLfsCloneInventoryContents(
  value: unknown,
  ref: string
): CheapLfsCloneInventoryRemoteFile {
  if (!isRecord(value)) {
    return { kind: 'invalid' }
  }
  if (
    value.type !== 'file' ||
    typeof value.sha !== 'string' ||
    !gitObjectId.test(value.sha) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0
  ) {
    return { kind: 'invalid' }
  }
  if (value.size > CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES) {
    return { kind: 'truncated' }
  }
  if (value.encoding !== 'base64' || typeof value.content !== 'string') {
    return { kind: 'truncated' }
  }

  const encoded = value.content.replace(/\s/g, '')
  if (
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded
    )
  ) {
    return { kind: 'invalid' }
  }

  let bytes: Uint8Array
  try {
    bytes = Buffer.from(encoded, 'base64')
  } catch {
    return { kind: 'invalid' }
  }
  if (
    bytes.byteLength !== value.size ||
    bytes.byteLength > CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES
  ) {
    return { kind: 'invalid' }
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { kind: 'invalid' }
  }

  return { kind: 'found', text, blobSha: value.sha, ref }
}

/** Build a deterministic, validated selection from a discovered inventory. */
export function createCheapLfsCloneSelection(
  accountKey: string,
  repositoryCloneUrl: string,
  defaultBranch: string,
  manifestBlobSha: string,
  inventory: ICheapLfsCloneInventory,
  selectedPaths: Iterable<string> = inventory.assets.map(asset => asset.path)
): ICheapLfsCloneSelection {
  const paths = [...selectedPaths].sort()
  const selection: ICheapLfsCloneSelection = {
    accountKey,
    repositoryCloneUrl,
    defaultBranch,
    manifestBlobSha,
    pointerSetSha256: inventory.pointerSetSha256,
    paths,
  }
  if (!isSafeCheapLfsCloneSelection(selection)) {
    throw new Error('Cheap LFS clone selection is unsafe or stale.')
  }
  return selection
}
