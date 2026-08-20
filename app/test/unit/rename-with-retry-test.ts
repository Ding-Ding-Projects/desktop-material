import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  renameWithRetry,
  RenameAttempts,
} from '../../src/lib/rename-with-retry'

function failing(code: string, times: number) {
  let calls = 0
  return {
    calls: () => calls,
    rename: async () => {
      calls += 1
      if (calls <= times) {
        const error: NodeJS.ErrnoException = new Error(`simulated ${code}`)
        error.code = code
        throw error
      }
    },
  }
}

const noWait = async () => undefined

describe('renameWithRetry', () => {
  it('succeeds on the first attempt when nothing is holding the destination', async () => {
    const target = failing('EPERM', 0)
    await renameWithRetry('a', 'b', { rename: target.rename, wait: noWait })
    assert.equal(target.calls(), 1)
  })

  for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
    it(`retries ${code} and succeeds once the holder lets go`, async () => {
      const target = failing(code, 3)
      await renameWithRetry('a', 'b', { rename: target.rename, wait: noWait })
      assert.equal(target.calls(), 4)
    })
  }

  it('gives up after the bounded number of attempts and rethrows', async () => {
    const target = failing('EPERM', Number.MAX_SAFE_INTEGER)
    await assert.rejects(
      renameWithRetry('a', 'b', { rename: target.rename, wait: noWait }),
      /simulated EPERM/
    )
    assert.equal(target.calls(), RenameAttempts)
  })

  it('does not retry ENOENT, because a missing temp file is a caller bug', async () => {
    const target = failing('ENOENT', Number.MAX_SAFE_INTEGER)
    await assert.rejects(
      renameWithRetry('a', 'b', { rename: target.rename, wait: noWait }),
      /simulated ENOENT/
    )
    assert.equal(target.calls(), 1)
  })

  it('does not retry ENOSPC, because it will not improve', async () => {
    const target = failing('ENOSPC', Number.MAX_SAFE_INTEGER)
    await assert.rejects(
      renameWithRetry('a', 'b', { rename: target.rename, wait: noWait }),
      /simulated ENOSPC/
    )
    assert.equal(target.calls(), 1)
  })

  it('does not retry an error with no code at all', async () => {
    let calls = 0
    await assert.rejects(
      renameWithRetry('a', 'b', {
        rename: async () => {
          calls += 1
          throw new Error('plain failure')
        },
        wait: noWait,
      }),
      /plain failure/
    )
    assert.equal(calls, 1)
  })

  it('backs off between attempts rather than spinning', async () => {
    const waits: number[] = []
    const target = failing('EBUSY', 2)
    await renameWithRetry('a', 'b', {
      rename: target.rename,
      wait: async ms => {
        waits.push(ms)
      },
    })
    assert.deepStrictEqual(waits, [10, 20])
  })
})
