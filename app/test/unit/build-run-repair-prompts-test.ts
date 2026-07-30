import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildCloudCiRepairPrompt,
  buildConflictRepairPrompt,
} from '../../src/lib/build-run/repair-prompts'

describe('bounded agent repair prompts', () => {
  it('includes conflicted paths and forbids destructive repository actions', () => {
    const prompt = buildConflictRepairPrompt({
      ourBranch: 'main',
      theirBranch: 'feature',
      conflictedPaths: ['app/a.ts', 'app/b.ts'],
    })
    assert.match(prompt, /app\/a\.ts/)
    assert.match(prompt, /Do not commit, push, change branches/)
    assert.ok(prompt.length <= 8_000)
  })

  it('summarizes failed CI jobs and keeps cloud verification honest', () => {
    const prompt = buildCloudCiRepairPrompt(
      {
        id: 1,
        name: 'Windows',
        display_title: 'Build',
        status: 'completed',
        conclusion: 'failure',
        run_number: 12,
        event: 'push',
        head_branch: 'main',
      } as any,
      [
        {
          id: 2,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          steps: [
            {
              name: 'Unit tests',
              number: 1,
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        } as any,
      ]
    )
    assert.match(prompt, /Unit tests \(failure\)/)
    assert.match(prompt, /cloud CI remains unverified/)
    assert.ok(prompt.length <= 8_000)
  })
})
