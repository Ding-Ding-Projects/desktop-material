import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  getCheapLfsOciRegistryProvider,
  isCheapLfsGhcrPointerText,
  parseCheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'

const digest = (value: string) => `sha256:${value.repeat(64)}`

describe('Cheap LFS OCI pointer', () => {
  for (const [provider, image] of [
    ['ghcr', `ghcr.io/owner/package@${digest('a')}`],
    ['docker-hub', `docker.io/owner/package@${digest('b')}`],
  ] as const) {
    it(`round-trips a strict immutable ${provider} pointer`, () => {
      const text = serializeCheapLfsGhcrPointer({
        version: CHEAP_LFS_GHCR_POINTER_VERSION,
        image,
        object: digest('c'),
        sizeInBytes: 12,
        layers: [digest('d'), digest('e')],
      })

      assert.deepEqual(parseCheapLfsGhcrPointer(text), {
        version: CHEAP_LFS_GHCR_POINTER_VERSION,
        image,
        object: digest('c'),
        sizeInBytes: 12,
        layers: [digest('d'), digest('e')],
      })
      assert.equal(getCheapLfsOciRegistryProvider(image), provider)
    })
  }

  it('leaves Release v1 pointers independent and rejects tags or hostile text', () => {
    const valid = serializeCheapLfsGhcrPointer({
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: `ghcr.io/owner/package@${digest('a')}`,
      object: digest('b'),
      sizeInBytes: 1,
      layers: [digest('c')],
    })
    const rejected = [
      valid.replace(`@${digest('a')}`, ':latest'),
      valid.replace('ghcr.io', 'example.com'),
      valid.replace('size 1', 'size 01'),
      valid.replace('layers ', 'extra value\nlayers '),
      valid.replace(/\n/g, '\r\n'),
      `${valid}\0`,
      'version https://desktop-material.app/cheap-lfs/v1\nrelease-tag assets\n',
    ]

    for (const text of rejected) {
      assert.equal(isCheapLfsGhcrPointerText(text), false, text)
    }
  })

  it('binds new private pointers to one canonical repository key while reading legacy text', () => {
    const legacy = serializeCheapLfsGhcrPointer({
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: `ghcr.io/owner/package@${digest('a')}`,
      object: digest('b'),
      sizeInBytes: 2,
      layers: [digest('c')],
    })
    const keyId = digest('d')
    const current = serializeCheapLfsGhcrPointer({
      ...parseCheapLfsGhcrPointer(legacy)!,
      keyId,
    })

    assert.equal(parseCheapLfsGhcrPointer(legacy)?.keyId, undefined)
    assert.equal(parseCheapLfsGhcrPointer(current)?.keyId, keyId)
    assert.match(current, new RegExp(`key-id ${keyId}\\n$`))
    assert.throws(() =>
      serializeCheapLfsGhcrPointer({
        ...parseCheapLfsGhcrPointer(legacy)!,
        keyId: 'sha256:not-a-key',
      })
    )
    assert.equal(
      isCheapLfsGhcrPointerText(
        current.replace(`key-id ${keyId}\n`, `key-id ${keyId}\nextra no\n`)
      ),
      false
    )
  })
})
