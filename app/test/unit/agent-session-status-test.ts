import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  AgentSessionChipAttention,
  ErrorSummaryCap,
  deriveAgentSessionChip,
  summarizeAgentSessionError,
} from '../../src/lib/agent-sessions'
import { IAgentSession } from '../../src/models/agent-session'

function session(overrides: Partial<IAgentSession> = {}): IAgentSession {
  return {
    path: 'C:\\work\\feature-x',
    name: 'feature-x',
    branch: 'feature-x',
    head: '0123456789abcdef0123456789abcdef01234567',
    isMainWorktree: false,
    isLocked: false,
    isMissing: false,
    agent: 'codex',
    runState: 'idle',
    errorMessage: null,
    diffStat: null,
    editedFileCount: null,
    lastActivityAt: null,
    ...overrides,
  }
}

describe('deriveAgentSessionChip', () => {
  it('shows the added line count for a changed worktree', () => {
    const chip = deriveAgentSessionChip(
      session({
        diffStat: { filesChanged: 4, linesAdded: 97, linesDeleted: 0 },
      })
    )

    assert.strictEqual(chip.kind, 'diff')
    assert.strictEqual(chip.label, '+97')
    assert.strictEqual(chip.showsDot, false)
    assert.strictEqual(
      chip.accessibleLabel,
      'feature-x has 97 lines added and 0 lines deleted across 4 files'
    )
  })

  it('shows both halves of the diff when lines were deleted too', () => {
    const chip = deriveAgentSessionChip(
      session({
        diffStat: { filesChanged: 1, linesAdded: 3, linesDeleted: 2 },
      })
    )

    assert.strictEqual(chip.label, '+3 \u22122')
    assert.strictEqual(
      chip.accessibleLabel,
      'feature-x has 3 lines added and 2 lines deleted across 1 file'
    )
  })

  it('uses the file count when a binary or untracked diff has no line totals', () => {
    const chip = deriveAgentSessionChip(
      session({
        diffStat: { filesChanged: 2, linesAdded: 0, linesDeleted: 0 },
      })
    )

    assert.strictEqual(chip.kind, 'diff')
    assert.strictEqual(chip.label, '2 files')
    assert.strictEqual(
      chip.accessibleLabel,
      'feature-x has 0 lines added and 0 lines deleted across 2 files'
    )
  })

  it('localizes visible and accessible status text in Cantonese', () => {
    const chip = deriveAgentSessionChip(
      session({ runState: 'running', editedFileCount: 2 }),
      'cantonese'
    )

    assert.strictEqual(chip.label, '2')
    assert.strictEqual(chip.accessibleLabel, 'feature-x 處理中，已改 2 個檔案')
  })

  it('keeps both languages in a bilingual status announcement', () => {
    const chip = deriveAgentSessionChip(
      session({
        diffStat: { filesChanged: 1, linesAdded: 3, linesDeleted: 2 },
      }),
      'bilingual'
    )

    assert.match(chip.accessibleLabel, /^feature-x has 3 lines added/)
    assert.match(chip.accessibleLabel, /feature-x 新增 3 行/)
  })

  it('shows the edited file count while an agent is working', () => {
    const chip = deriveAgentSessionChip(
      session({ runState: 'running', editedFileCount: 91 })
    )

    assert.strictEqual(chip.kind, 'working')
    assert.strictEqual(chip.label, '91')
    assert.strictEqual(
      chip.accessibleLabel,
      'feature-x is working, 91 files edited'
    )
  })

  it('still says it is working when the agent reports no count', () => {
    const chip = deriveAgentSessionChip(session({ runState: 'running' }))

    assert.strictEqual(chip.kind, 'working')
    assert.strictEqual(chip.label, 'Working')
    assert.strictEqual(chip.accessibleLabel, 'feature-x is working')
  })

  it('renders cancellation as a neutral terminal outcome, not success', () => {
    const chip = deriveAgentSessionChip(
      session({ runState: 'cancelled', diffStat: null })
    )

    assert.strictEqual(chip.kind, 'clean')
    assert.strictEqual(chip.label, 'Cancelled')
    assert.match(chip.accessibleLabel, /feature-x — Cancelled/)
    assert.strictEqual(chip.showsDot, false)
  })

  it('shows the error state with its dot and announces the reason', () => {
    const chip = deriveAgentSessionChip(
      session({
        runState: 'error',
        errorMessage: 'fatal: could not read from remote',
        diffStat: { filesChanged: 9, linesAdded: 400, linesDeleted: 1 },
      })
    )

    // Attention beats detail: a failed session says so even when it also
    // changed a great deal.
    assert.strictEqual(chip.kind, 'error')
    assert.strictEqual(chip.label, 'Error')
    assert.strictEqual(chip.showsDot, true)
    assert.strictEqual(
      chip.accessibleLabel,
      'feature-x failed: fatal: could not read from remote'
    )
  })

  it('announces a failure with no message without a dangling colon', () => {
    const chip = deriveAgentSessionChip(session({ runState: 'error' }))

    assert.strictEqual(chip.accessibleLabel, 'feature-x failed')
  })

  it('separates a measured-empty worktree from an unmeasured one', () => {
    const measured = deriveAgentSessionChip(
      session({ diffStat: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 } })
    )
    assert.strictEqual(measured.kind, 'clean')
    assert.strictEqual(measured.label, 'No changes')
    assert.strictEqual(measured.accessibleLabel, 'feature-x has no changes')

    const unmeasured = deriveAgentSessionChip(session())
    assert.strictEqual(unmeasured.kind, 'clean')
    assert.strictEqual(unmeasured.label, 'Not measured')
    assert.strictEqual(
      unmeasured.accessibleLabel,
      'feature-x has no measured changes yet'
    )
  })

  it('ranks the chip kinds so errors sort ahead of quiet sessions', () => {
    assert.ok(
      AgentSessionChipAttention.error < AgentSessionChipAttention.working &&
        AgentSessionChipAttention.working < AgentSessionChipAttention.diff &&
        AgentSessionChipAttention.diff < AgentSessionChipAttention.clean
    )
  })
})

describe('summarizeAgentSessionError', () => {
  it('folds a multi-line failure onto one line', () => {
    assert.strictEqual(
      summarizeAgentSessionError('fatal: bad object\n\tat refs/heads/x\r\n'),
      'fatal: bad object at refs/heads/x'
    )
  })

  it('redacts credentials embedded in a remote URL', () => {
    assert.strictEqual(
      summarizeAgentSessionError(
        'could not read https://octocat:ghp_supersecrettoken@example.com/x.git'
      ),
      'could not read https://[redacted]@example.com/x.git'
    )
  })

  it('redacts a bare provider token and an explicitly named secret', () => {
    const summary = summarizeAgentSessionError(
      'auth failed for ghp_abcdefghijklmnop with Authorization: Bearer zzzz'
    )

    assert.ok(!summary.includes('ghp_abcdefghijklmnop'), summary)
    assert.ok(!summary.includes('zzzz'), summary)
    assert.strictEqual(summary, 'auth failed for [redacted] with [redacted]')
  })

  it('bounds a runaway message', () => {
    const summary = summarizeAgentSessionError('e'.repeat(5_000))

    assert.strictEqual(summary.length, ErrorSummaryCap)
    assert.ok(summary.endsWith('\u2026'))
  })
})
