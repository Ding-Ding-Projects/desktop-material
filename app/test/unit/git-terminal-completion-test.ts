import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  applyGitTerminalCompletion,
  completeGitTerminalInput,
} from '../../src/ui/integrated-terminal/git-terminal-completion'

describe('git-terminal-completion', () => {
  it('completes a partial Git subcommand', () => {
    const result = completeGitTerminalInput('sta')
    assert.ok(result.candidates.includes('status'))
    assert.ok(result.candidates.includes('stash'))
    assert.strictEqual(result.tokenIndex, 0)
  })

  it('completes a subcommand after a leading "git" token', () => {
    const result = completeGitTerminalInput('git dif')
    assert.deepStrictEqual(result.candidates, ['diff'])
    assert.strictEqual(result.tokenIndex, 1)
  })

  it('suggests known flags once a subcommand is chosen', () => {
    const result = completeGitTerminalInput('log --one')
    assert.deepStrictEqual(result.candidates, ['--oneline'])
  })

  it('offers every flag once a trailing space starts a new token', () => {
    const result = completeGitTerminalInput('status ')
    assert.ok(result.candidates.includes('--short'))
    assert.ok(result.candidates.includes('--branch'))
    assert.strictEqual(result.prefix, '')
  })

  it('never suggests a subcommand outside the allowlist', () => {
    const result = completeGitTerminalInput('conf')
    assert.strictEqual(result.candidates.length, 0)
  })

  it('applies a chosen completion by replacing only the active token', () => {
    const result = completeGitTerminalInput('git dif')
    const next = applyGitTerminalCompletion('git dif', result, 'diff')
    assert.strictEqual(next, 'git diff ')
  })

  it('leaves the line untouched when the candidate does not extend the prefix', () => {
    const result = completeGitTerminalInput('git dif')
    const next = applyGitTerminalCompletion('git dif', result, 'status')
    assert.strictEqual(next, 'git dif')
  })
})
