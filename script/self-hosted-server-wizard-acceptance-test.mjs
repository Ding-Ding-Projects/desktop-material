import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  evaluateHostDiagnostics,
  validateOrigin,
} from './self-hosted-server-wizard-acceptance.mjs'

describe('self-hosted server wizard acceptance diagnostics', () => {
  it('reports unsupported hosts without pretending Docker or a second machine ran', () => {
    assert.deepEqual(evaluateHostDiagnostics({ platform: 'linux' }), {
      status: 'unsupported',
      code: 'unsupported-platform',
      detail: 'The self-hosted server wizard requires Windows.',
    })
  })

  it('distinguishes missing Compose from an unavailable engine', () => {
    assert.equal(
      evaluateHostDiagnostics({
        platform: 'win32',
        dockerCliAvailable: false,
        composeAvailable: false,
        daemonAvailable: false,
      }).code,
      'docker-compose-unavailable'
    )
    assert.equal(
      evaluateHostDiagnostics({
        platform: 'win32',
        dockerCliAvailable: true,
        composeAvailable: true,
        daemonAvailable: false,
      }).code,
      'docker-daemon-unavailable'
    )
  })

  it('accepts only credential-free HTTPS origins or loopback HTTP', () => {
    assert.equal(validateOrigin('https://server.example').ok, true)
    assert.equal(validateOrigin('http://127.0.0.1:8787').ok, true)
    assert.equal(validateOrigin('https://user:secret@server.example').ok, false)
    assert.equal(
      validateOrigin('https://server.example/join#token=secret').ok,
      false
    )
    assert.equal(validateOrigin('http://server.example').ok, false)
  })
})
