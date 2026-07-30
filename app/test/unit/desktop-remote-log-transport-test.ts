import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  normalizeRemoteLogDestination,
  normalizeRemoteLogEndpoint,
  redactRemoteLogMessage,
} from '../../src/main-process/desktop-remote-log-transport'

describe('remote diagnostic logging configuration', () => {
  it('accepts only credential-free HTTP(S) endpoints and owns the ingest path', () => {
    assert.equal(
      normalizeRemoteLogEndpoint('http://192.168.50.242:4318')?.toString(),
      'http://192.168.50.242:4318/v1/logs'
    )
    assert.equal(
      normalizeRemoteLogEndpoint('https://logs.example.test/base')?.toString(),
      'https://logs.example.test/v1/logs'
    )
    assert.equal(
      normalizeRemoteLogEndpoint('https://user:pass@logs.example.test'),
      null
    )
    assert.equal(normalizeRemoteLogEndpoint('file:///tmp/logs'), null)
  })

  it('defaults to local logging and accepts the two explicit remote modes', () => {
    assert.equal(normalizeRemoteLogDestination(undefined), 'local')
    assert.equal(normalizeRemoteLogDestination('unknown'), 'local')
    assert.equal(normalizeRemoteLogDestination('remote'), 'remote')
    assert.equal(normalizeRemoteLogDestination('both'), 'both')
  })

  it('redacts credentials before a message leaves the client', () => {
    const redacted = redactRemoteLogMessage(
      'Authorization: Bearer abcdefghijklmnop token=my-secret ' +
        'https://me:password@example.test github_pat_0123456789abcdef'
    )
    assert.doesNotMatch(
      redacted,
      /abcdefghijklmnop|my-secret|password|github_pat_/
    )
    assert.match(redacted, /\[REDACTED/)
  })
})
