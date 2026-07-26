import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  IBulkRepositoryItem,
  IBulkRepositoryProgress,
  initialBulkRepositoryProgress,
  MaximumBulkReasonLength,
  runSequentialRepositoryBulk,
  sanitizeBulkFailureReason,
} from '../../src/lib/automation/bulk-repository-runner'

const items: ReadonlyArray<IBulkRepositoryItem> = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
  { id: 3, name: 'gamma' },
]

function statuses(progress: IBulkRepositoryProgress) {
  return progress.items.map(item => item.status)
}

describe('initialBulkRepositoryProgress', () => {
  it('queues every repository before any work starts', () => {
    const progress = initialBulkRepositoryProgress(items)
    assert.strictEqual(progress.completed, 0)
    assert.strictEqual(progress.total, 3)
    assert.strictEqual(progress.finished, false)
    assert.strictEqual(progress.cancelled, false)
    assert.deepStrictEqual(statuses(progress), ['queued', 'queued', 'queued'])
  })
})

describe('runSequentialRepositoryBulk', () => {
  it('reports a determinate N-of-M progression and finishes', async () => {
    const updates: Array<IBulkRepositoryProgress> = []
    const summary = await runSequentialRepositoryBulk(
      items,
      async item => ({ status: 'done', detail: `synced ${item.name}` }),
      { onProgress: update => updates.push(update) }
    )

    assert.strictEqual(summary.done, 3)
    assert.strictEqual(summary.failed, 0)
    assert.strictEqual(summary.skipped, 0)
    assert.strictEqual(summary.remaining, 0)
    assert.strictEqual(summary.completed, 3)
    assert.strictEqual(summary.total, 3)
    assert.strictEqual(summary.finished, true)
    assert.strictEqual(summary.cancelled, false)

    // The first snapshot is the all-queued state and the last is the summary.
    assert.deepStrictEqual(statuses(updates[0]), ['queued', 'queued', 'queued'])
    assert.deepStrictEqual(
      updates.map(update => update.completed),
      [0, 0, 1, 1, 2, 2, 3, 3]
    )
    assert.deepStrictEqual(statuses(updates[updates.length - 1]), [
      'done',
      'done',
      'done',
    ])
    assert.strictEqual(summary.items[0].detail, 'synced alpha')
  })

  it('runs strictly one repository at a time', async () => {
    let active = 0
    let peak = 0
    await runSequentialRepositoryBulk(items, async () => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return { status: 'done', detail: '' }
    })
    assert.strictEqual(peak, 1)
  })

  it('surfaces the running state and per-repository detail updates', async () => {
    const running: Array<string> = []
    await runSequentialRepositoryBulk(
      [items[0]],
      async (item, reportDetail) => {
        reportDetail('Refreshing repository state.')
        return { status: 'done', detail: 'Pull completed.' }
      },
      {
        onProgress: update => {
          const first = update.items[0]
          if (first.status === 'running') {
            running.push(first.detail)
          }
        },
      }
    )

    assert.deepStrictEqual(running, ['', 'Refreshing repository state.'])
  })

  it('records a partial failure without stopping the batch', async () => {
    const summary = await runSequentialRepositoryBulk(items, async item => {
      if (item.id === 2) {
        throw new Error('fatal: could not read from remote repository')
      }
      return { status: 'done', detail: '' }
    })

    assert.deepStrictEqual(statuses(summary), ['done', 'failed', 'done'])
    assert.strictEqual(summary.done, 2)
    assert.strictEqual(summary.failed, 1)
    assert.strictEqual(
      summary.items[1].detail,
      'fatal: could not read from remote repository'
    )
  })

  it('keeps skipped repositories distinct from failures', async () => {
    const summary = await runSequentialRepositoryBulk(items, async item =>
      item.id === 3
        ? { status: 'skipped', detail: 'No pull remote.' }
        : { status: 'done', detail: '' }
    )

    assert.strictEqual(summary.skipped, 1)
    assert.strictEqual(summary.failed, 0)
    assert.strictEqual(summary.items[2].detail, 'No pull remote.')
  })

  it('finishes the in-flight repository, then stops and reports the rest', async () => {
    let cancelled = false
    const started: Array<number> = []

    const summary = await runSequentialRepositoryBulk(
      items,
      async item => {
        started.push(item.id)
        // Cancel while the first repository is still doing its work.
        cancelled = true
        return { status: 'done', detail: 'Fetch completed.' }
      },
      { isCancelled: () => cancelled }
    )

    assert.deepStrictEqual(started, [1])
    assert.deepStrictEqual(statuses(summary), [
      'done',
      'cancelled',
      'cancelled',
    ])
    assert.strictEqual(summary.cancelled, true)
    assert.strictEqual(summary.done, 1)
    assert.strictEqual(summary.remaining, 2)
    assert.strictEqual(summary.completed, 1)
    assert.strictEqual(summary.finished, true)
  })

  it('cancels everything when cancellation precedes the first repository', async () => {
    let started = 0
    const summary = await runSequentialRepositoryBulk(
      items,
      async () => {
        started++
        return { status: 'done', detail: '' }
      },
      { isCancelled: () => true }
    )

    assert.strictEqual(started, 0)
    assert.strictEqual(summary.remaining, 3)
    assert.strictEqual(summary.completed, 0)
    assert.deepStrictEqual(statuses(summary), [
      'cancelled',
      'cancelled',
      'cancelled',
    ])
  })

  it('handles an empty selection', async () => {
    const summary = await runSequentialRepositoryBulk([], async () => ({
      status: 'done',
      detail: '',
    }))
    assert.strictEqual(summary.total, 0)
    assert.strictEqual(summary.finished, true)
  })
})

describe('sanitizeBulkFailureReason', () => {
  it('redacts Windows absolute paths', () => {
    assert.strictEqual(
      sanitizeBulkFailureReason(
        new Error('cannot open C:\\Users\\someone\\secrets\\repo')
      ),
      'cannot open <path>'
    )
  })

  it('redacts UNC and POSIX absolute paths', () => {
    assert.strictEqual(
      sanitizeBulkFailureReason('lock held by \\\\server\\share\\repo'),
      'lock held by <path>'
    )
    assert.strictEqual(
      sanitizeBulkFailureReason('cannot stat /home/someone/repo'),
      'cannot stat <path>'
    )
  })

  it('redacts credentials embedded in a remote URL', () => {
    assert.match(
      sanitizeBulkFailureReason(
        new Error('failed for https://someone:hunter2@example.com/x.git')
      ),
      /^failed for https:\/\/<redacted>@/
    )
  })

  it('redacts provider tokens', () => {
    assert.strictEqual(
      sanitizeBulkFailureReason('bad credentials ghp_ABCDEFGHIJKLMNOP1234'),
      'bad credentials <redacted>'
    )
  })

  it('collapses whitespace and elides an over-long reason', () => {
    const reason = sanitizeBulkFailureReason(new Error('a'.repeat(400)))
    assert.strictEqual(reason.length, MaximumBulkReasonLength)
    assert.ok(reason.endsWith('…'))

    assert.strictEqual(
      sanitizeBulkFailureReason(new Error('too   many\n\nspaces')),
      'too many spaces'
    )
  })

  it('leaves an unrecognized message alone', () => {
    assert.strictEqual(
      sanitizeBulkFailureReason('Branch main has no upstream.'),
      'Branch main has no upstream.'
    )
    // A bare path is still reduced to its placeholder, never echoed.
    assert.strictEqual(sanitizeBulkFailureReason('/only/a/path'), '<path>')
  })

  it('falls back to a plain reason when there is no message at all', () => {
    assert.strictEqual(
      sanitizeBulkFailureReason(new Error('')),
      'Unknown failure.'
    )
    assert.strictEqual(sanitizeBulkFailureReason(undefined), 'Unknown failure.')
  })
})
