import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import { describe, it } from 'node:test'

import {
  calculateCheapLfsClonePointerSetSha256,
  CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES,
  createCheapLfsCloneSelection,
  decodeCheapLfsCloneInventoryContents,
  ICheapLfsCloneInventoryAsset,
  parseCheapLfsCloneInventory,
} from '../../../src/lib/cheap-lfs/clone-inventory'

const digest = (character: string) => character.repeat(64)

function asset(
  path: string,
  pointerCharacter: string,
  objectCharacter = pointerCharacter
): ICheapLfsCloneInventoryAsset {
  return {
    path,
    provider: 'release',
    size: 12,
    objectSha256: digest(objectCharacter),
    pointerBlobSha256: digest(pointerCharacter),
  }
}

function inventoryText(
  assets: ReadonlyArray<ICheapLfsCloneInventoryAsset>,
  pointerSetSha256 = calculateCheapLfsClonePointerSetSha256(assets)
): string {
  return JSON.stringify({
    schemaVersion: 1,
    pointerSetSha256,
    assets,
  })
}

describe('Cheap LFS clone inventory', () => {
  it('accepts a strict sorted manifest and verifies its pointer-set digest', () => {
    const assets = [
      asset('assets/audio/theme.flac', 'a'),
      asset('assets/images/splash.psd', 'b'),
    ]
    const expectedPointerSet = calculateCheapLfsClonePointerSetSha256(assets)
    const parsed = parseCheapLfsCloneInventory(
      inventoryText(assets, expectedPointerSet)
    )

    assert.equal(parsed.kind, 'valid')
    if (parsed.kind === 'valid') {
      assert.equal(parsed.inventory.pointerSetSha256, expectedPointerSet)
      assert.deepEqual(parsed.inventory.assets, assets)
    }
    assert.notEqual(
      expectedPointerSet,
      calculateCheapLfsClonePointerSetSha256([
        assets[0],
        { ...assets[1], pointerBlobSha256: digest('c') },
      ])
    )
  })

  it('rejects malformed JSON and a schema with undeclared fields', () => {
    assert.deepEqual(parseCheapLfsCloneInventory('{'), {
      kind: 'invalid',
      reason: 'invalid-json',
    })

    const value = JSON.parse(
      inventoryText([asset('assets/file.bin', 'a')])
    ) as Record<string, unknown>
    value.untrustedExtra = true
    assert.deepEqual(parseCheapLfsCloneInventory(JSON.stringify(value)), {
      kind: 'invalid',
      reason: 'invalid-schema',
    })
  })

  it('rejects an inventory whose decoded UTF-8 body exceeds the hard limit', () => {
    assert.deepEqual(
      parseCheapLfsCloneInventory(
        ' '.repeat(CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES + 1)
      ),
      { kind: 'invalid', reason: 'too-large' }
    )
  })

  it('rejects unsafe portable paths before they can reach a worktree', () => {
    for (const path of [
      '../escape.bin',
      '/absolute.bin',
      'assets\\alternate-separator.bin',
      'assets/NUL.txt',
      'assets/trailing-dot.',
    ]) {
      assert.deepEqual(
        parseCheapLfsCloneInventory(inventoryText([asset(path, 'a')])),
        { kind: 'invalid', reason: 'unsafe-path' },
        path
      )
    }
  })

  it('distinguishes case-fold duplicate paths from an unsorted manifest', () => {
    const duplicate = [
      asset('Assets/file.bin', 'a'),
      asset('assets/file.bin', 'b'),
    ]
    assert.deepEqual(parseCheapLfsCloneInventory(inventoryText(duplicate)), {
      kind: 'invalid',
      reason: 'duplicate-path',
    })

    const unsorted = [
      asset('assets/z-last.bin', 'a'),
      asset('assets/a-first.bin', 'b'),
    ]
    assert.deepEqual(parseCheapLfsCloneInventory(inventoryText(unsorted)), {
      kind: 'invalid',
      reason: 'unsorted-assets',
    })
  })

  it('rejects a manifest whose pointer-set digest does not match its assets', () => {
    const assets = [asset('assets/file.bin', 'a')]
    const actual = calculateCheapLfsClonePointerSetSha256(assets)
    const mismatched = `${actual[0] === '0' ? '1' : '0'}${actual.slice(1)}`
    assert.deepEqual(
      parseCheapLfsCloneInventory(inventoryText(assets, mismatched)),
      { kind: 'invalid', reason: 'invalid-schema' }
    )
  })

  it('strictly decodes the bounded GitHub Contents envelope', () => {
    const text = inventoryText([asset('assets/file.bin', 'a')])
    const encoded = Buffer.from(text, 'utf8').toString('base64')
    assert.deepEqual(
      decodeCheapLfsCloneInventoryContents(
        {
          type: 'file',
          sha: 'b'.repeat(40),
          size: Buffer.byteLength(text),
          encoding: 'base64',
          content: encoded,
        },
        'main'
      ),
      {
        kind: 'found',
        text,
        blobSha: 'b'.repeat(40),
        ref: 'main',
      }
    )

    assert.deepEqual(
      decodeCheapLfsCloneInventoryContents(
        {
          type: 'file',
          sha: 'b'.repeat(40),
          size: CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES + 1,
          encoding: 'none',
          content: '',
        },
        'main'
      ),
      { kind: 'truncated' }
    )
  })

  it('selects every advertised file by default and preserves explicit none', () => {
    const assets = [
      asset('assets/audio/theme.flac', 'a'),
      asset('assets/images/splash.psd', 'b'),
    ]
    const parsed = parseCheapLfsCloneInventory(inventoryText(assets))
    assert.equal(parsed.kind, 'valid')
    if (parsed.kind !== 'valid') {
      return
    }

    const all = createCheapLfsCloneSelection(
      'https://api.github.com#7',
      'https://github.com/example/game.git',
      'main',
      'c'.repeat(40),
      parsed.inventory
    )
    assert.deepEqual(
      all.paths,
      assets.map(item => item.path)
    )

    const none = createCheapLfsCloneSelection(
      all.accountKey,
      all.repositoryCloneUrl,
      all.defaultBranch,
      all.manifestBlobSha,
      parsed.inventory,
      []
    )
    assert.deepEqual(none.paths, [])
  })
})
