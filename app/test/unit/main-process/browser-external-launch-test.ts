import assert from 'node:assert'
import { describe, it } from 'node:test'
import { launchExternalTarget } from '../../../src/main-process/browser-external-launch'

interface IScenarioOptions {
  readonly target?: string
  readonly mode?: 'internal' | 'external'
  readonly reportFailure?: boolean
  readonly reject?: boolean
}

async function runScenario(options: IScenarioOptions = {}) {
  let openCount = 0
  let failureCount = 0
  const errors: Array<unknown> = []
  const rejection = new Error('fixture launcher rejection')
  const opened = await launchExternalTarget(
    options.target ?? 'https://example.com/docs',
    {
      mode: options.mode ?? 'external',
      reportFailure: options.reportFailure ?? true,
      openExternal: async () => {
        openCount++
        if (options.reject) {
          throw rejection
        }
      },
      onBrowserOpenFailed: () => {
        failureCount++
      },
      onError: error => errors.push(error),
    }
  )
  return { opened, openCount, failureCount, errors, rejection }
}

describe('main-process external browser launch', () => {
  it('returns success without reporting a failure', async () => {
    const result = await runScenario()

    assert.equal(result.opened, true)
    assert.equal(result.openCount, 1)
    assert.equal(result.failureCount, 0)
    assert.deepEqual(result.errors, [])
  })

  it('reports one rejected external HTTP launch without forwarding details', async () => {
    const result = await runScenario({ reject: true })

    assert.equal(result.opened, false)
    assert.equal(result.openCount, 1)
    assert.equal(result.failureCount, 1)
    assert.deepEqual(result.errors, [result.rejection])
  })

  it('does not report when the caller handles the rejected web launch', async () => {
    const result = await runScenario({
      reject: true,
      reportFailure: false,
    })

    assert.equal(result.opened, false)
    assert.equal(result.failureCount, 0)
    assert.deepEqual(result.errors, [result.rejection])
  })

  it('does not label rejected file or operating-system schemes as web failures', async () => {
    for (const target of [
      'file:///C:/fixture.txt',
      'mailto:octocat@example.com',
      'tel:+15555550100',
    ]) {
      const result = await runScenario({ target, reject: true })
      assert.equal(result.opened, false)
      assert.equal(result.failureCount, 0)
      assert.deepEqual(result.errors, [result.rejection])
    }
  })

  it('does not report an explicit internal route as an external failure', async () => {
    const result = await runScenario({
      reject: true,
      mode: 'internal',
    })

    assert.equal(result.opened, false)
    assert.equal(result.failureCount, 0)
    assert.deepEqual(result.errors, [result.rejection])
  })
})
