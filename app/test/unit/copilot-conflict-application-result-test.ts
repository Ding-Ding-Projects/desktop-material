import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  canContinueAfterCopilotConflictApplication,
  ICopilotConflictApplicationResult,
} from '../../src/lib/copilot-conflict-application-result'

function result(
  overrides: Partial<ICopilotConflictApplicationResult> = {}
): ICopilotConflictApplicationResult {
  return {
    written: [],
    staged: [],
    refused: [],
    freshWorkingDirectory:
      {} as ICopilotConflictApplicationResult['freshWorkingDirectory'],
    complete: true,
    ...overrides,
  }
}

describe('Copilot conflict application result contract', () => {
  it('allows Continue only for a complete refusal-free staged result', () => {
    assert.equal(canContinueAfterCopilotConflictApplication(result()), true)
    assert.equal(
      canContinueAfterCopilotConflictApplication(
        result({ refused: [{ path: 'a.txt', reason: 'changed externally' }] })
      ),
      false
    )
    assert.equal(
      canContinueAfterCopilotConflictApplication(
        result({ written: ['a.txt'], staged: [] })
      ),
      false
    )
    assert.equal(
      canContinueAfterCopilotConflictApplication(result({ complete: false })),
      false
    )
  })
})
