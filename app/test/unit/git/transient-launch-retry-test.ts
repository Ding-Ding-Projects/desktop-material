import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isTransientGitLaunchFailure,
  withTransientGitLaunchRetry,
} from '../../../src/lib/git/transient-launch-retry'

const probe = ['rev-parse', '--verify', 'HEAD'] as const
const result = (stderr: string, exitCode = 1) => ({ stderr, exitCode })

describe('transient Git launch retry', () => {
  it('recognizes localized launcher failures only for the safe startup probe', () => {
    assert.equal(
      isTransientGitLaunchFailure(
        result('error launching git: Access is denied.\r\n'),
        probe
      ),
      __WIN32__
    )
    assert.equal(
      isTransientGitLaunchFailure(
        result('error launching git: Zugriff verweigert.'),
        probe
      ),
      __WIN32__
    )
    assert.equal(
      isTransientGitLaunchFailure(result('fatal: bad revision'), probe),
      false
    )
    assert.equal(
      isTransientGitLaunchFailure(
        result('error launching git: Access is denied.'),
        ['commit', '-m', 'never retry mutations']
      ),
      false
    )
  })

  it('retries the launcher failure and returns the successful result', async () => {
    const responses = [
      result('error launching git: Access is denied.'),
      result('', 0),
    ]
    const delays: number[] = []
    let attempts = 0
    const actual = await withTransientGitLaunchRetry(
      async () => responses[attempts++],
      { args: probe, delay: async value => void delays.push(value) }
    )

    assert.equal(actual.exitCode, 0)
    assert.equal(attempts, __WIN32__ ? 2 : 1)
    assert.deepEqual(delays, __WIN32__ ? [75] : [])
  })

  it('stops after two bounded retries when launch keeps failing', async () => {
    let attempts = 0
    const delays: number[] = []
    const actual = await withTransientGitLaunchRetry(
      async () => {
        attempts += 1
        return result('error launching git: Access is denied.')
      },
      { args: probe, delay: async value => void delays.push(value) }
    )

    assert.equal(actual.exitCode, 1)
    assert.equal(attempts, __WIN32__ ? 3 : 1)
    assert.deepEqual(delays, __WIN32__ ? [75, 250] : [])
  })

  it('does not relaunch after cancellation during backoff', async () => {
    const controller = new AbortController()
    let attempts = 0
    await assert.rejects(
      withTransientGitLaunchRetry(
        async () => {
          attempts += 1
          return result('error launching git: Access is denied.')
        },
        {
          args: probe,
          signal: controller.signal,
          delay: async () => controller.abort(new Error('cancelled')),
        }
      ),
      /cancelled/
    )
    assert.equal(attempts, 1)
  })
})
