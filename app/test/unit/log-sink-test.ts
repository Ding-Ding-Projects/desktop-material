import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import {
  forwardToLogSink,
  registerLogSink,
  runWithLogSinkSuppressed,
  setLogSinkVerbose,
} from '../../src/lib/logging/renderer/log-sink'

describe('renderer log sink', () => {
  afterEach(() => {
    registerLogSink(null)
    setLogSinkVerbose(false)
  })

  it('does not mirror profile Git bookkeeping into its own history', () => {
    const messages = new Array<string>()
    registerLogSink((_level, message) => messages.push(message))

    forwardToLogSink(
      'info',
      '[ui] Executing profileCommit: git commit -m Capture log activity (took 0.050s)'
    )
    forwardToLogSink(
      'info',
      '[ui] Executing profileStatus: git status --porcelain (took 0.020s)'
    )
    forwardToLogSink('info', '[ui] Repository refresh completed')

    assert.deepEqual(messages, ['[ui] Repository refresh completed'])
  })

  it('continues to apply the debug verbosity gate', () => {
    const messages = new Array<string>()
    registerLogSink((_level, message) => messages.push(message))

    forwardToLogSink('debug', '[ui] hidden')
    setLogSinkVerbose(true)
    forwardToLogSink('debug', '[ui] visible')

    assert.deepEqual(messages, ['[ui] visible'])
  })

  it('restores forwarding after an async suppression scope rejects', async () => {
    const messages = new Array<string>()
    registerLogSink((_level, message) => messages.push(message))

    await assert.rejects(
      runWithLogSinkSuppressed(async () => {
        forwardToLogSink('error', '[ui] self-generated failure')
        throw new Error('commit failed')
      }),
      /commit failed/
    )
    forwardToLogSink('info', '[ui] normal logging')

    assert.deepEqual(messages, ['[ui] normal logging'])
  })
})
