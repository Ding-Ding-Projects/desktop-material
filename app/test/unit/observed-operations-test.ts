import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  asReportableError,
  containBackgroundOperation,
  observeUserInitiatedOperation,
} from '../../src/ui/lib/observed-operations'

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 10))

describe('observed renderer operations', () => {
  it('presents a rejected user action exactly once', async () => {
    const expected = new Error('remote rejected')
    const reported = new Array<Error>()

    observeUserInitiatedOperation(
      () => Promise.reject(expected),
      {
        postError: async error => {
          reported.push(error)
        },
      },
      'test push'
    )
    await flush()

    assert.deepEqual(reported, [expected])
  })

  it('does not present a successful user action', async () => {
    let reports = 0
    observeUserInitiatedOperation(
      () => Promise.resolve(),
      {
        postError: async () => {
          reports++
        },
      },
      'test push'
    )
    await flush()
    assert.equal(reports, 0)
  })

  it('normalizes synchronous and non-Error failures', async () => {
    const reported = new Array<Error>()
    const reporter = {
      postError: async (error: Error) => {
        reported.push(error)
      },
    }

    observeUserInitiatedOperation(
      () => {
        throw 'sync failure'
      },
      reporter,
      'synchronous test'
    )
    observeUserInitiatedOperation(
      () => Promise.reject(42),
      reporter,
      'asynchronous test'
    )
    await flush()

    assert.deepEqual(
      reported.map(error => error.message),
      ['sync failure', '42']
    )
    assert.equal(asReportableError(reported[0]), reported[0])
  })

  it('contains a rejection from the error presenter', async () => {
    let unhandled: unknown = null
    const listener = (reason: unknown) => {
      unhandled = reason
    }
    process.once('unhandledRejection', listener)
    try {
      observeUserInitiatedOperation(
        () => Promise.reject(new Error('operation failed')),
        {
          postError: async () => {
            throw new Error('presentation failed')
          },
        },
        'test push'
      )
      await flush()
      assert.equal(unhandled, null)
    } finally {
      process.removeListener('unhandledRejection', listener)
    }
  })

  it('contains rejected advisory background work', async () => {
    let unhandled: unknown = null
    const listener = (reason: unknown) => {
      unhandled = reason
    }
    process.once('unhandledRejection', listener)
    try {
      containBackgroundOperation(
        () => Promise.reject(new Error('provider unavailable')),
        'Provider refresh'
      )
      await flush()
      assert.equal(unhandled, null)
    } finally {
      process.removeListener('unhandledRejection', listener)
    }
  })
})
