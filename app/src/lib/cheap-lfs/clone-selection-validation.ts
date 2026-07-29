import { createHash } from 'crypto'

import { Repository } from '../../models/repository'
import {
  ICheapLfsCloneSelection,
  isSafeCheapLfsCloneSelection,
} from '../../models/cheap-lfs-clone-selection'
import { git } from '../git/core'
import { getPartialBlobContents } from '../git/show'
import {
  CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES,
  CHEAP_LFS_CLONE_INVENTORY_PATH,
  parseCheapLfsCloneInventory,
} from './clone-inventory'
import { serializeCheapLfsGhcrPointer } from './ghcr-pointer'
import { ICheapLfsManagedPointerEntry } from './operations'
import { serializeCheapLfsPointer } from './pointer'

export type CheapLfsCloneSelectionValidationFailure =
  | 'unsafe-selection'
  | 'account-changed'
  | 'repository-changed'
  | 'default-branch-changed'
  | 'manifest-missing'
  | 'manifest-changed'
  | 'manifest-invalid'
  | 'pointer-missing'
  | 'pointer-changed'
  | 'selection-path-missing'

export type CheapLfsCloneSelectionValidationResult =
  | {
      readonly kind: 'valid'
      readonly selectedPaths: ReadonlySet<string>
    }
  | {
      readonly kind: 'invalid'
      readonly reason: CheapLfsCloneSelectionValidationFailure
    }

export interface ICheapLfsCloneManifestEvidence {
  readonly blobSha: string
  readonly text: string
}

interface ICheapLfsCloneSelectionContext {
  readonly accountKey: string | null
  readonly repositoryCloneUrl: string
  readonly defaultBranch: string | null
}

const gitObjectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Read only the committed default checkout's managed manifest. The Git object
 * id is compared with the exact Contents API blob selected before clone, so a
 * branch/ref race cannot silently broaden the user's chosen asset set.
 */
export async function readCheapLfsCloneManifestEvidence(
  repository: Repository
): Promise<ICheapLfsCloneManifestEvidence | null> {
  try {
    const bytes = await getPartialBlobContents(
      repository,
      'HEAD',
      CHEAP_LFS_CLONE_INVENTORY_PATH,
      CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES + 1
    )
    if (
      bytes === null ||
      bytes.byteLength > CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES
    ) {
      return null
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const result = await git(
      ['rev-parse', `HEAD:${CHEAP_LFS_CLONE_INVENTORY_PATH}`],
      repository.path,
      'readCheapLfsCloneManifestBlob'
    )
    const blobSha = result.stdout.trim().toLowerCase()
    return gitObjectId.test(blobSha) ? { blobSha, text } : null
  } catch {
    return null
  }
}

/**
 * Validate a pre-clone selection against committed local evidence.
 *
 * The network inventory is discovery UI only. Nothing is hydrated unless the
 * cloned HEAD contains the exact selected manifest blob and every advertised
 * pointer still serializes to the same digest, provider, size, and object hash.
 */
export function validateCheapLfsCloneSelection(
  selection: ICheapLfsCloneSelection,
  context: ICheapLfsCloneSelectionContext,
  manifest: ICheapLfsCloneManifestEvidence | null,
  pointers: ReadonlyArray<ICheapLfsManagedPointerEntry>
): CheapLfsCloneSelectionValidationResult {
  if (!isSafeCheapLfsCloneSelection(selection)) {
    return { kind: 'invalid', reason: 'unsafe-selection' }
  }
  if (context.accountKey !== selection.accountKey) {
    return { kind: 'invalid', reason: 'account-changed' }
  }
  if (context.repositoryCloneUrl !== selection.repositoryCloneUrl) {
    return { kind: 'invalid', reason: 'repository-changed' }
  }
  if (
    context.defaultBranch !== null &&
    context.defaultBranch !== selection.defaultBranch
  ) {
    return { kind: 'invalid', reason: 'default-branch-changed' }
  }
  if (manifest === null) {
    return { kind: 'invalid', reason: 'manifest-missing' }
  }
  if (manifest.blobSha !== selection.manifestBlobSha) {
    return { kind: 'invalid', reason: 'manifest-changed' }
  }

  const parsed = parseCheapLfsCloneInventory(manifest.text)
  if (
    parsed.kind !== 'valid' ||
    parsed.inventory.pointerSetSha256 !== selection.pointerSetSha256
  ) {
    return { kind: 'invalid', reason: 'manifest-invalid' }
  }

  const pointerByPath = new Map(
    pointers
      .filter(pointer => pointer.workingTreeState === 'pointer')
      .map(pointer => [pointer.relativePath, pointer] as const)
  )
  const inventoryPaths = new Set<string>()

  for (const asset of parsed.inventory.assets) {
    inventoryPaths.add(asset.path)
    const pointer = pointerByPath.get(asset.path)
    if (pointer === undefined) {
      return { kind: 'invalid', reason: 'pointer-missing' }
    }
    const pointerText =
      pointer.kind === 'release'
        ? serializeCheapLfsPointer(pointer.pointer)
        : serializeCheapLfsGhcrPointer(pointer.pointer)
    const provider = pointer.kind === 'release' ? 'release' : pointer.provider
    const objectSha256 =
      pointer.kind === 'release'
        ? pointer.pointer.sha256
        : pointer.pointer.object.slice('sha256:'.length)
    if (
      sha256(pointerText) !== asset.pointerBlobSha256 ||
      provider !== asset.provider ||
      pointer.pointer.sizeInBytes !== asset.size ||
      objectSha256 !== asset.objectSha256
    ) {
      return { kind: 'invalid', reason: 'pointer-changed' }
    }
  }

  for (const path of selection.paths) {
    if (!inventoryPaths.has(path)) {
      return { kind: 'invalid', reason: 'selection-path-missing' }
    }
  }

  return { kind: 'valid', selectedPaths: new Set(selection.paths) }
}
