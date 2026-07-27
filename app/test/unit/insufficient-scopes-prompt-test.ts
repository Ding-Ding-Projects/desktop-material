import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  clearDismissedScopePrompt,
  getDismissedScopePrompt,
  isScopePromptDismissed,
  recordDismissedScopePrompt,
} from '../../src/lib/insufficient-scopes-prompt'

describe('insufficient-scopes prompt persistence', () => {
  const accountKey = 'github.com+codingmachineedge'
  const otherAccountKey = 'github.example.com+someone-else'

  beforeEach(() => {
    localStorage.clear()
  })

  it('does not consider an account dismissed before any answer', () => {
    assert.strictEqual(
      isScopePromptDismissed(accountKey, ['user', 'notifications']),
      false
    )
  })

  it('remembers a "Not now" answer across launches for the same scopes', () => {
    recordDismissedScopePrompt(accountKey, [
      'user',
      'notifications',
      'write:packages',
    ])
    assert.strictEqual(
      isScopePromptDismissed(accountKey, [
        'user',
        'notifications',
        'write:packages',
      ]),
      true
    )
  })

  it('still suppresses the prompt when missing scopes shrink to a subset', () => {
    recordDismissedScopePrompt(accountKey, ['user', 'notifications'])
    assert.strictEqual(isScopePromptDismissed(accountKey, ['user']), true)
  })

  it('re-prompts when a scope the user was never asked about goes missing', () => {
    recordDismissedScopePrompt(accountKey, ['user'])
    assert.strictEqual(
      isScopePromptDismissed(accountKey, ['user', 'write:packages']),
      false
    )
  })

  it('scopes the dismissal to the exact account', () => {
    recordDismissedScopePrompt(accountKey, ['user'])
    assert.strictEqual(isScopePromptDismissed(otherAccountKey, ['user']), false)
  })

  it('clearing the record makes the prompt eligible again', () => {
    recordDismissedScopePrompt(accountKey, ['user'])
    clearDismissedScopePrompt(accountKey)
    assert.deepStrictEqual(getDismissedScopePrompt(accountKey), [])
    assert.strictEqual(isScopePromptDismissed(accountKey, ['user']), false)
  })

  it('treats an empty missing set as trivially dismissed', () => {
    assert.strictEqual(isScopePromptDismissed(accountKey, []), true)
  })
})
