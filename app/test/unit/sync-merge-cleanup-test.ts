import assert from 'node:assert'
import { describe, it } from 'node:test'

import { Branch, BranchType } from '../../src/models/branch'
import {
  buildSyncMergeConflictPrompt,
  planSyncMergeCleanup,
} from '../../src/lib/automation/sync-merge-cleanup'
import { WorktreeEntry } from '../../src/models/worktree'

const sha = (value: string) => value.repeat(40)

const local = (name: string, upstream: string | null = null) =>
  new Branch(
    name,
    upstream,
    { sha: sha(name.slice(0, 1)) },
    BranchType.Local,
    `refs/heads/${name}`
  )

const remote = (name: string) =>
  new Branch(
    `origin/${name}`,
    null,
    { sha: sha(name.slice(-1)) },
    BranchType.Remote,
    `refs/remotes/origin/${name}`
  )

const linked = (
  path: string,
  branch: string | null,
  options: Partial<WorktreeEntry> = {}
): WorktreeEntry => ({
  path,
  head: sha('a'),
  branch,
  isDetached: false,
  type: 'linked',
  isLocked: false,
  isPrunable: false,
  ...options,
})

describe('reviewed sync merge cleanup planning', () => {
  it('selects exact tracked candidates and retains unsafe ownership/state', () => {
    const branches = [
      local('main', 'origin/main'),
      local('feature', 'origin/feature'),
      local('same-name-without-tracking'),
      local('dirty', 'origin/dirty'),
      remote('main'),
      remote('feature'),
      remote('same-name-without-tracking'),
      remote('dirty'),
      remote('remote-only'),
    ]
    const worktrees = [
      linked('C:\\repo-feature', 'refs/heads/feature'),
      linked('C:\\repo-dirty', 'refs/heads/dirty'),
      linked('C:\\repo-detached', null, { isDetached: true }),
    ]

    const plan = planSyncMergeCleanup(
      branches,
      worktrees,
      new Set(['C:\\repo-feature']),
      'origin'
    )

    assert.equal(plan.exceedsBranchLimit, false)
    assert.deepEqual(
      plan.candidates.map(candidate => ({
        name: candidate.name,
        ownership: candidate.remoteOwnership,
        worktree: candidate.worktree?.path ?? null,
      })),
      [
        {
          name: 'feature',
          ownership: 'tracked',
          worktree: 'C:\\repo-feature',
        },
        {
          name: 'same-name-without-tracking',
          ownership: 'uncertain',
          worktree: null,
        },
      ]
    )
    assert.ok(
      plan.retained.some(
        item =>
          item.name === 'dirty' && item.detail.includes('uncommitted work')
      )
    )
    assert.ok(
      plan.retained.some(
        item =>
          item.name === 'origin/remote-only' &&
          item.detail.includes('ownership relationship')
      )
    )
    assert.ok(
      plan.retained.some(item => item.detail.includes('Detached linked'))
    )
  })

  it('retains locked linked worktrees instead of selecting their branch', () => {
    const plan = planSyncMergeCleanup(
      [local('main', 'origin/main'), local('locked', 'origin/locked')],
      [
        linked('C:\\repo-locked', 'refs/heads/locked', {
          isLocked: true,
        }),
      ],
      new Set(['C:\\repo-locked']),
      'origin'
    )

    assert.equal(plan.candidates.length, 0)
    assert.deepEqual(plan.retained, [
      { name: 'locked', detail: 'Locked linked worktree retained.' },
    ])
  })

  it('tells the configured agent to resolve files without owning Git cleanup', () => {
    const candidate = planSyncMergeCleanup(
      [local('main', 'origin/main'), local('feature', 'origin/feature')],
      [],
      new Set(),
      'origin'
    ).candidates[0]
    const prompt = buildSyncMergeConflictPrompt(candidate, 'Codex')

    assert.match(prompt, /configured Codex provider/)
    assert.match(prompt, /Do not commit, push, fetch, pull, checkout/)
    assert.match(prompt, /MERGE_HEAD present/)
    assert.match(prompt, /Desktop Material will revalidate/)
  })
})
