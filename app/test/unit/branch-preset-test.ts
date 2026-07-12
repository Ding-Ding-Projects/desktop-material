import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseBranchNamePresets } from '../../src/models/branch-preset'

describe('branch name presets', () => {
  it('parses names, optional descriptions, whitespace, and CRLF', () => {
    assert.deepEqual(
      parseBranchNamePresets(
        'feature/ New features\r\n  bugfix/   Bug fixes  \r\n\r\nhotfix/\n'
      ),
      [
        { name: 'feature/', description: 'New features' },
        { name: 'bugfix/', description: 'Bug fixes' },
        { name: 'hotfix/', description: 'hotfix/' },
      ]
    )
  })
})
