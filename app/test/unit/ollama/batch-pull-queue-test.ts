import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MaxOllamaBatchPullConcurrency,
  MaxOllamaBatchPullItemIdCharacters,
  MaxOllamaBatchPullModelNameCharacters,
  normalizeOllamaBatchPullQueue,
  reconcileOllamaBatchPullQueue,
  runOllamaBatchPullQueue,
} from '../../../src/lib/ollama/batch-pull-queue'

describe('Ollama batch pull queue document', () => {
  it('bounds concurrency and requeues interrupted work for live reconciliation', () => {
    const queue = normalizeOllamaBatchPullQueue({
      concurrency: MaxOllamaBatchPullConcurrency + 10,
      items: [
        {
          id: 'one',
          model: 'llama3.2:latest',
          state: 'pulling',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    })
    assert.equal(queue.concurrency, MaxOllamaBatchPullConcurrency)
    assert.equal(queue.items[0]?.state, 'queued')
  })

  it('drops duplicate identities and untrusted item states', () => {
    const queue = normalizeOllamaBatchPullQueue({
      items: [
        { id: 'one', model: 'llama3.2', state: 'queued' },
        { id: 'one', model: 'llama3.2', state: 'completed' },
        { id: 'two', model: '', state: 'queued' },
        { id: 'three', model: 'bad', state: 'invented' },
      ],
    })
    assert.deepEqual(
      queue.items.map(item => item.id),
      ['one']
    )
  })

  it('requeues completed tags that are absent from a successful live inventory', () => {
    const queue = reconcileOllamaBatchPullQueue(
      {
        version: 1,
        concurrency: 2,
        items: [
          {
            id: 'kept',
            model: 'llama3.2',
            state: 'completed',
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: 'missing',
            model: 'gemma3:4b',
            state: 'completed',
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: 'interrupted',
            model: 'qwen3:8b',
            state: 'pulling',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
      [{ name: 'llama3.2' }],
      42
    )

    assert.deepEqual(
      queue.items.map(item => [item.id, item.state, item.updatedAt]),
      [
        ['kept', 'completed', 2],
        ['missing', 'queued', 42],
        ['interrupted', 'queued', 2],
      ]
    )
  })

  it('accepts model records from the native inventory without trusting unrelated fields', () => {
    const queue = reconcileOllamaBatchPullQueue(
      {
        items: [{ id: 'one', model: 'llama3.2', state: 'completed' }],
      },
      [
        { model: 'llama3.2' },
        { name: 'other', model: 'llama3.2' },
        { name: '' },
      ],
      9
    )
    assert.equal(queue.items[0]?.state, 'completed')
  })

  it('serializes persistence while workers and progress callbacks overlap', async () => {
    const snapshots: Array<
      ReadonlyArray<{ id: string; state: string; progress?: number }>
    > = []
    let writes = 0
    let activeWrites = 0
    let maxActiveWrites = 0
    const result = await runOllamaBatchPullQueue(
      {
        version: 1,
        concurrency: 2,
        items: [
          {
            id: 'one',
            model: 'llama3.2',
            state: 'queued',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'two',
            model: 'gemma3:4b',
            state: 'queued',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      {
        pull: async (_model, options) => {
          options.onProgress({
            status: 'pulling',
            completed: 1,
            total: 2,
            done: false,
          })
          await new Promise(resolve => setTimeout(resolve, 2))
          options.onProgress({
            status: 'success',
            completed: 2,
            total: 2,
            done: true,
          })
        },
      },
      async document => {
        activeWrites++
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites)
        await new Promise(resolve => setTimeout(resolve, 1))
        writes++
        snapshots.push(
          document.items.map(item => ({
            id: item.id,
            state: item.state,
            progress: item.progress?.completed,
          }))
        )
        activeWrites--
      }
    )

    assert.equal(maxActiveWrites, 1)
    assert.ok(writes >= 8)
    assert.deepEqual(
      result.items.map(item => item.state),
      ['completed', 'completed']
    )
    assert.ok(snapshots.some(items => items.some(item => item.progress === 1)))
    assert.ok(
      snapshots.some(items => items.every(item => item.state === 'completed'))
    )
  })

  it('rejects oversized queue identities and model names instead of persisting them', () => {
    const queue = normalizeOllamaBatchPullQueue({
      items: [
        {
          id: 'a'.repeat(MaxOllamaBatchPullItemIdCharacters + 1),
          model: 'valid',
          state: 'queued',
        },
        {
          id: 'valid',
          model: 'm'.repeat(MaxOllamaBatchPullModelNameCharacters + 1),
          state: 'queued',
        },
      ],
    })
    assert.deepEqual(queue.items, [])
  })

  it('does not let a late progress callback regress a completed item', async () => {
    let lateProgress:
      | ((progress: { status: string; done: boolean }) => void)
      | undefined
    let writes = 0
    const result = await runOllamaBatchPullQueue(
      {
        version: 1,
        concurrency: 1,
        items: [
          {
            id: 'one',
            model: 'llama3.2',
            state: 'queued',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      {
        pull: async (_model, options) => {
          lateProgress = options.onProgress
        },
      },
      async () => {
        writes++
      }
    )
    assert.equal(result.items[0]?.state, 'completed')
    lateProgress?.({ status: 'late', done: false })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(result.items[0]?.state, 'completed')
    assert.equal(writes, 2)
  })
})
