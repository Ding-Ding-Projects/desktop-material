import assert from 'node:assert'
import { describe, it } from 'node:test'
import { cheapLfsSidecarName } from '../../../src/lib/cheap-lfs/sidecar-name'
import type { CheapLfsSidecarKind } from '../../../src/lib/cheap-lfs/sidecar-name'

describe('Cheap LFS sidecar names', () => {
  it('keeps every app sidecar well below the Windows component limit', () => {
    const nonce = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
    const maximumPid = 4_294_967_295
    const kinds: ReadonlyArray<CheapLfsSidecarKind> = [
      'recovery',
      'consumed',
      'ghcr',
      'materialized',
    ]

    for (const kind of kinds) {
      const name = cheapLfsSidecarName(kind, maximumPid, nonce)
      assert.ok(name.length < 100, `${kind} sidecar was ${name.length} units`)
      assert.doesNotMatch(name, /tracked-file-name/)
    }
  })
})
