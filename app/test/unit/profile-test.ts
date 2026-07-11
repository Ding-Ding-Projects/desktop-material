import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  sanitizeProfileDirectoryName,
  LocalProfileKey,
  composeProfileCommitMessage,
} from '../../src/models/profile'

describe('sanitizeProfileDirectoryName', () => {
  it('returns the local key unchanged', () => {
    assert.equal(sanitizeProfileDirectoryName(LocalProfileKey), 'local')
  })

  it('keeps a readable prefix and appends a short hash', () => {
    const name = sanitizeProfileDirectoryName('https://api.github.com#1234')
    assert.match(name, /^api\.github\.com-1234-[0-9a-f]{8}$/)
  })

  it('is deterministic for the same key', () => {
    const key = 'https://ghe.example.com/api/v3#7'
    assert.equal(
      sanitizeProfileDirectoryName(key),
      sanitizeProfileDirectoryName(key)
    )
  })

  it('produces different names for different keys', () => {
    assert.notEqual(
      sanitizeProfileDirectoryName('https://api.github.com#1'),
      sanitizeProfileDirectoryName('https://api.github.com#2')
    )
  })

  it('strips characters that are unsafe in a directory name', () => {
    const name = sanitizeProfileDirectoryName('https://api.github.com#1')
    assert.doesNotMatch(name, /[/:#]/)
  })
})

describe('composeProfileCommitMessage', () => {
  it('falls back to a generic subject when there are no descriptions', () => {
    assert.equal(composeProfileCommitMessage([]), 'Update profile')
  })

  it('uses a single description as the whole subject', () => {
    assert.equal(
      composeProfileCommitMessage(['Set sidebar width']),
      'Set sidebar width'
    )
  })

  it('summarizes multiple descriptions with a bulleted body', () => {
    assert.equal(
      composeProfileCommitMessage(['Set sidebar width', 'Change tab size']),
      'Update profile (2 changes)\n\n- Set sidebar width\n- Change tab size'
    )
  })
})
