import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MaxOllamaBatchPullConcurrency,
  normalizeOllamaBatchPullQueue,
} from '../../../src/lib/ollama/batch-pull-queue'

describe('Ollama batch pull queue document', () => {
  it('bounds concurrency and requeues interrupted work for live reconciliation', () => {
    const queue = normalizeOllamaBatchPullQueue({
      concurrency: MaxOllamaBatchPullConcurrency + 10,
      items: [{ id: 'one', model: 'llama3.2:latest', state: 'pulling', createdAt: 1, updatedAt: 2 }],
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
    assert.deepEqual(queue.items.map(item => item.id), ['one'])
  })
})
