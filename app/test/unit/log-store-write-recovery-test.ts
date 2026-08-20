import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

const logStorePath = fileURLToPath(
  new URL('../../src/lib/stores/log-store.ts', import.meta.url)
)

describe('LogStore write recovery coverage', () => {
  it('routes serialized writes through the recovering write chain', async () => {
    const source = (await readFile(logStorePath, 'utf8')).replace(/\r\n/g, '\n')

    assert.match(
      source,
      /^import \{ enqueueRecoveringLogWrite \} from '\.\/log-write-chain'$/m
    )
    assert.match(
      source,
      /^\s*this\.writeChain = enqueueRecoveringLogWrite\($/m
    )
    assert.doesNotMatch(source, /^\s*\.catch\(\(\) => undefined\)$/m)
  })

  it('replaces the complete snapshot after an earlier append fails', async () => {
    const { enqueueRecoveringLogWrite } = await import(
      '../../src/lib/stores/log-write-chain'
    )
    const writes: Array<{ kind: 'append' | 'rewrite'; content: string }> = []

    await enqueueRecoveringLogWrite(
      Promise.reject(new Error('simulated append failure')),
      'first line\nsecond line\n',
      'second line\n',
      {
        append: async content => {
          writes.push({ kind: 'append', content })
        },
        rewrite: async content => {
          writes.push({ kind: 'rewrite', content })
        },
      }
    )

    assert.deepEqual(writes, [
      { kind: 'rewrite', content: 'first line\nsecond line\n' },
    ])
  })

  it('keeps normal appends incremental when the earlier write succeeded', async () => {
    const { enqueueRecoveringLogWrite } = await import(
      '../../src/lib/stores/log-write-chain'
    )
    const writes: Array<{ kind: 'append' | 'rewrite'; content: string }> = []

    await enqueueRecoveringLogWrite(
      Promise.resolve(),
      'first line\nsecond line\n',
      'second line\n',
      {
        append: async content => {
          writes.push({ kind: 'append', content })
        },
        rewrite: async content => {
          writes.push({ kind: 'rewrite', content })
        },
      }
    )

    assert.deepEqual(writes, [{ kind: 'append', content: 'second line\n' }])
  })

  it('retains a failed recovery so a later queued snapshot can repair it', async () => {
    const { enqueueRecoveringLogWrite } = await import(
      '../../src/lib/stores/log-write-chain'
    )
    let recoveryAttempts = 0

    const failedRecovery = enqueueRecoveringLogWrite(
      Promise.reject(new Error('simulated append failure')),
      'first line\nsecond line\n',
      'second line\n',
      {
        append: async () => {
          assert.fail('recovery must not append after a failed predecessor')
        },
        rewrite: async () => {
          recoveryAttempts++
          throw new Error('simulated rewrite failure')
        },
      }
    )

    await assert.rejects(failedRecovery, /simulated rewrite failure/)

    const writes: string[] = []
    await enqueueRecoveringLogWrite(
      failedRecovery,
      'first line\nsecond line\nthird line\n',
      'third line\n',
      {
        append: async () => {
          assert.fail('a later recovery must replace the complete snapshot')
        },
        rewrite: async content => {
          recoveryAttempts++
          writes.push(content)
        },
      }
    )

    assert.equal(recoveryAttempts, 2)
    assert.deepEqual(writes, ['first line\nsecond line\nthird line\n'])
  })
})
