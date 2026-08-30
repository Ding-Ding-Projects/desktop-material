import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DefaultOllamaChatParameters,
  normalizeOllamaChatParameters,
  normalizeOllamaSystemPrompt,
  supportsOllamaVision,
} from '../../../src/lib/ollama/chat-options'

describe('Ollama chat options', () => {
  it('falls back from invalid generation parameters instead of forwarding them', () => {
    assert.deepEqual(
      normalizeOllamaChatParameters({
        temperature: 10,
        topP: -1,
        numPredict: 0,
      }),
      DefaultOllamaChatParameters
    )
  })

  it('requires an explicit declared vision capability for attachments', () => {
    assert.equal(supportsOllamaVision(undefined), false)
    assert.equal(supportsOllamaVision(['vision']), true)
  })

  it('bounds the local-only system prompt', () => {
    assert.equal(normalizeOllamaSystemPrompt('  rules  '), 'rules')
  })
})
