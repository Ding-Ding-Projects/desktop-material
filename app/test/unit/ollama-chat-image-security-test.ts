import './profile-history-test-env'

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { matchesImageSignature } from '../../src/ui/copilot/ollama-chat-workspace'

describe('Ollama chat image validation', () => {
  it('accepts only an allowlisted media type with its matching magic bytes', () => {
    assert.equal(
      matchesImageSignature(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        'image/png'
      ),
      true
    )
    assert.equal(
      matchesImageSignature(new Uint8Array([255, 216, 255, 224]), 'image/jpeg'),
      true
    )
    assert.equal(
      matchesImageSignature(
        new Uint8Array([71, 73, 70, 56, 57, 97]),
        'image/gif'
      ),
      true
    )
    assert.equal(
      matchesImageSignature(
        new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
        'image/webp'
      ),
      true
    )
    assert.equal(
      matchesImageSignature(
        new Uint8Array([60, 115, 118, 103, 62]),
        'image/png'
      ),
      false
    )
  })
})
