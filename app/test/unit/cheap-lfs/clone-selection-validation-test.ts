import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  calculateCheapLfsClonePointerSetSha256,
  createCheapLfsCloneSelection,
  ICheapLfsCloneInventory,
  ICheapLfsCloneInventoryAsset,
} from '../../../src/lib/cheap-lfs/clone-inventory'
import {
  ICheapLfsCloneManifestEvidence,
  validateCheapLfsCloneSelection,
} from '../../../src/lib/cheap-lfs/clone-selection-validation'
import { ICheapLfsManagedPointerEntry } from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'

const accountKey = 'https://api.github.com#7'
const cloneUrl = 'https://github.com/example/game.git'
const defaultBranch = 'main'
const manifestBlobSha = 'f'.repeat(40)
const path = 'assets/hero.psd'
type ReleasePointerEntry = Extract<
  ICheapLfsManagedPointerEntry,
  { readonly kind: 'release' }
>

function pointer(overrides: Partial<ICheapLfsPointer> = {}): ICheapLfsPointer {
  return {
    version: CHEAP_LFS_POINTER_VERSION,
    releaseTag: 'assets',
    assetName: 'hero.psd',
    sizeInBytes: 42,
    sha256: 'a'.repeat(64),
    ...overrides,
  }
}

function entry(value = pointer(), relativePath = path): ReleasePointerEntry {
  return {
    kind: 'release',
    provider: 'release',
    relativePath,
    pointer: value,
    workingTreeState: 'pointer',
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function fixture() {
  const managedPointer = entry()
  const asset: ICheapLfsCloneInventoryAsset = {
    path,
    provider: 'release',
    size: managedPointer.pointer.sizeInBytes,
    objectSha256: managedPointer.pointer.sha256,
    pointerBlobSha256: sha256(serializeCheapLfsPointer(managedPointer.pointer)),
  }
  const inventory: ICheapLfsCloneInventory = {
    schemaVersion: 1,
    pointerSetSha256: calculateCheapLfsClonePointerSetSha256([asset]),
    assets: [asset],
  }
  const selection = createCheapLfsCloneSelection(
    accountKey,
    cloneUrl,
    defaultBranch,
    manifestBlobSha,
    inventory
  )
  const manifest: ICheapLfsCloneManifestEvidence = {
    blobSha: manifestBlobSha,
    text: JSON.stringify(inventory),
  }
  const context = {
    accountKey,
    repositoryCloneUrl: cloneUrl,
    defaultBranch,
  }
  return { managedPointer, inventory, selection, manifest, context }
}

describe('validateCheapLfsCloneSelection', () => {
  it('accepts only the exact selected manifest blob and authoritative pointer', () => {
    const { managedPointer, selection, manifest, context } = fixture()
    const result = validateCheapLfsCloneSelection(
      selection,
      context,
      manifest,
      [managedPointer]
    )

    assert.equal(result.kind, 'valid')
    if (result.kind === 'valid') {
      assert.deepEqual([...result.selectedPaths], [path])
    }
  })

  it('rejects a public inventory selection when the manifest changes before clone', () => {
    const { managedPointer, selection, manifest, context } = fixture()
    assert.deepEqual(
      validateCheapLfsCloneSelection(
        selection,
        context,
        { ...manifest, blobSha: 'e'.repeat(40) },
        [managedPointer]
      ),
      { kind: 'invalid', reason: 'manifest-changed' }
    )
  })

  it('fails closed when account, clone URL, or default branch no longer match', () => {
    const { managedPointer, selection, manifest, context } = fixture()
    const cases = [
      [
        { ...context, accountKey: 'https://api.github.com#8' },
        'account-changed',
      ],
      [
        {
          ...context,
          repositoryCloneUrl: 'https://github.com/example/other.git',
        },
        'repository-changed',
      ],
      [{ ...context, defaultBranch: 'trunk' }, 'default-branch-changed'],
    ] as const

    for (const [changedContext, reason] of cases) {
      assert.deepEqual(
        validateCheapLfsCloneSelection(selection, changedContext, manifest, [
          managedPointer,
        ]),
        { kind: 'invalid', reason }
      )
    }
  })

  it('rejects a missing or byte-changed committed pointer', () => {
    const { managedPointer, selection, manifest, context } = fixture()
    assert.deepEqual(
      validateCheapLfsCloneSelection(selection, context, manifest, []),
      { kind: 'invalid', reason: 'pointer-missing' }
    )
    assert.deepEqual(
      validateCheapLfsCloneSelection(selection, context, manifest, [
        entry(pointer({ sizeInBytes: 43 })),
      ]),
      { kind: 'invalid', reason: 'pointer-changed' }
    )
    assert.equal(managedPointer.relativePath, path)
  })

  it('preserves an explicit empty selection without broadening it to all files', () => {
    const { managedPointer, inventory, manifest, context } = fixture()
    const selection = createCheapLfsCloneSelection(
      accountKey,
      cloneUrl,
      defaultBranch,
      manifestBlobSha,
      inventory,
      []
    )
    const result = validateCheapLfsCloneSelection(
      selection,
      context,
      manifest,
      [managedPointer]
    )

    assert.equal(result.kind, 'valid')
    if (result.kind === 'valid') {
      assert.equal(result.selectedPaths.size, 0)
    }
  })

  it('rejects selected paths that the exact manifest did not advertise', () => {
    const { managedPointer, inventory, manifest, context } = fixture()
    const selection = createCheapLfsCloneSelection(
      accountKey,
      cloneUrl,
      defaultBranch,
      manifestBlobSha,
      inventory,
      ['assets/not-advertised.bin']
    )

    assert.deepEqual(
      validateCheapLfsCloneSelection(selection, context, manifest, [
        managedPointer,
      ]),
      { kind: 'invalid', reason: 'selection-path-missing' }
    )
  })
})
