import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  buildPullBranchDeletedPlan,
  createPullBranchDeletedOfferBudget,
  decidePullBranchDeletedRecovery,
  IFailedPullFacts,
  IPullBranchDeletedPlanFacts,
  MaximumPullBranchDeletedRecoveryOffers,
  RemoteBranchPresence,
} from '../../src/lib/pull-branch-deleted'
import { isProbeableBranchName } from '../../src/lib/git/remote-branch-existence'

const deletedUpstreamPull: IFailedPullFacts = {
  reportedMissingRemoteRef: true,
  isPullOperation: true,
  hasRepository: true,
  currentBranchName: 'feature/widget',
  isOnDefaultBranch: false,
  remoteName: 'origin',
  remoteBranchName: 'feature/widget',
}

const absent = async (): Promise<RemoteBranchPresence> => ({ kind: 'absent' })
const present = async (): Promise<RemoteBranchPresence> => ({
  kind: 'present',
  sha: 'a'.repeat(40),
})
const indeterminate = async (): Promise<RemoteBranchPresence> => ({
  kind: 'indeterminate',
  reason: 'remote-unreachable',
})

const cleanPlan: IPullBranchDeletedPlanFacts = {
  staleBranchName: 'feature/widget',
  defaultBranchName: 'main',
  changedFileCount: 0,
  hasConflicts: false,
  isNetworkOperationInProgress: false,
  unmergedCommitCount: 0,
}

describe('deleted-upstream pull recovery decision', () => {
  it('offers recovery once the remote confirms the branch is gone', async () => {
    let asked: ReadonlyArray<string> = []
    const decision = await decidePullBranchDeletedRecovery(
      deletedUpstreamPull,
      async (remoteName, remoteBranchName) => {
        asked = [remoteName, remoteBranchName]
        return { kind: 'absent' }
      }
    )

    assert.deepStrictEqual(decision, {
      kind: 'offer',
      branchName: 'feature/widget',
      remoteName: 'origin',
      remoteBranchName: 'feature/widget',
    })
    assert.deepStrictEqual(asked, ['origin', 'feature/widget'])
  })

  it('never offers for a failure that was not the missing-ref classification', async () => {
    // Authentication, network, conflicts, and a dirty worktree all surface as
    // some other structured Git failure during the very same pull.
    let probed = false
    for (const unrelated of ['auth', 'network', 'conflict', 'dirty']) {
      const decision = await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, reportedMissingRemoteRef: false },
        async () => {
          probed = true
          return { kind: 'absent' }
        }
      )
      assert.deepStrictEqual(
        decision,
        { kind: 'decline', reason: 'unrelated-failure' },
        unrelated
      )
    }
    assert.equal(
      probed,
      false,
      'an unrelated failure must not touch the remote'
    )
  })

  it('never offers for a push, merge, or checkout that reported the same failure', async () => {
    const decision = await decidePullBranchDeletedRecovery(
      { ...deletedUpstreamPull, isPullOperation: false },
      absent
    )
    assert.deepStrictEqual(decision, { kind: 'decline', reason: 'not-a-pull' })
  })

  it('declines when the remote still advertises the branch', async () => {
    const decision = await decidePullBranchDeletedRecovery(
      deletedUpstreamPull,
      present
    )
    assert.deepStrictEqual(decision, {
      kind: 'decline',
      reason: 'upstream-still-advertised',
    })
  })

  it('fails closed when the remote never answered', async () => {
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(deletedUpstreamPull, indeterminate),
      { kind: 'decline', reason: 'upstream-unverified' }
    )

    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(deletedUpstreamPull, async () => {
        throw new Error('connection refused')
      }),
      { kind: 'decline', reason: 'upstream-unverified' }
    )
  })

  it('declines without a repository, a branch, or a remote', async () => {
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, hasRepository: false },
        absent
      ),
      { kind: 'decline', reason: 'no-repository' }
    )
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, currentBranchName: null },
        absent
      ),
      { kind: 'decline', reason: 'no-current-branch' }
    )
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, remoteName: null },
        absent
      ),
      { kind: 'decline', reason: 'no-current-branch' }
    )
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, remoteBranchName: '' },
        absent
      ),
      { kind: 'decline', reason: 'no-current-branch' }
    )
  })

  it('declines when the default branch is already checked out', async () => {
    assert.deepStrictEqual(
      await decidePullBranchDeletedRecovery(
        { ...deletedUpstreamPull, isOnDefaultBranch: true },
        absent
      ),
      { kind: 'decline', reason: 'already-on-default-branch' }
    )
  })
})

describe('deleted-upstream recovery plan', () => {
  it('clears the way when the worktree is clean and a default branch exists', () => {
    const plan = buildPullBranchDeletedPlan(cleanPlan)
    assert.equal(plan.blocker, null)
    assert.equal(plan.defaultBranchName, 'main')
    assert.equal(plan.unmergedCommitCount, 0)
    assert.equal(plan.deletionWouldStrandCommits, false)
  })

  it('reports a missing default branch instead of guessing at one', () => {
    const plan = buildPullBranchDeletedPlan({
      ...cleanPlan,
      defaultBranchName: null,
    })
    assert.equal(plan.blocker, 'no-default-branch')
    assert.equal(plan.defaultBranchName, null)
    assert.doesNotMatch(String(plan.defaultBranchName), /main|master/)
  })

  it('refuses the switch on a dirty or conflicted worktree', () => {
    assert.equal(
      buildPullBranchDeletedPlan({ ...cleanPlan, changedFileCount: 3 }).blocker,
      'dirty-worktree'
    )
    // A conflict outranks a plain dirty tree so the message names the real cause.
    assert.equal(
      buildPullBranchDeletedPlan({
        ...cleanPlan,
        changedFileCount: 3,
        hasConflicts: true,
      }).blocker,
      'conflicted-worktree'
    )
  })

  it('refuses while another network operation holds the repository', () => {
    assert.equal(
      buildPullBranchDeletedPlan({
        ...cleanPlan,
        isNetworkOperationInProgress: true,
      }).blocker,
      'operation-in-progress'
    )
  })

  it('refuses when there is nothing to switch away from or to', () => {
    assert.equal(
      buildPullBranchDeletedPlan({ ...cleanPlan, staleBranchName: null })
        .blocker,
      'no-current-branch'
    )
    assert.equal(
      buildPullBranchDeletedPlan({ ...cleanPlan, staleBranchName: 'main' })
        .blocker,
      'already-on-default-branch'
    )
  })

  it('treats an uncountable branch as one that would strand work', () => {
    const unknown = buildPullBranchDeletedPlan({
      ...cleanPlan,
      unmergedCommitCount: null,
    })
    assert.equal(unknown.unmergedCommitCount, null)
    assert.equal(unknown.deletionWouldStrandCommits, true)

    const nonsense = buildPullBranchDeletedPlan({
      ...cleanPlan,
      unmergedCommitCount: -4,
    })
    assert.equal(nonsense.unmergedCommitCount, null)
    assert.equal(nonsense.deletionWouldStrandCommits, true)
  })

  it('flags a branch carrying commits the default branch does not have', () => {
    const plan = buildPullBranchDeletedPlan({
      ...cleanPlan,
      unmergedCommitCount: 7,
    })
    assert.equal(plan.unmergedCommitCount, 7)
    assert.equal(plan.deletionWouldStrandCommits, true)
  })
})

describe('deleted-upstream recovery offer budget', () => {
  it('bounds how many modal decisions one batch may raise', () => {
    assert.equal(
      createPullBranchDeletedOfferBudget().offersRemaining,
      MaximumPullBranchDeletedRecoveryOffers
    )
    assert.equal(createPullBranchDeletedOfferBudget(2).offersRemaining, 2)
    assert.equal(
      createPullBranchDeletedOfferBudget(9999).offersRemaining,
      MaximumPullBranchDeletedRecoveryOffers
    )
    assert.equal(
      createPullBranchDeletedOfferBudget(Number.NaN).offersRemaining,
      MaximumPullBranchDeletedRecoveryOffers
    )
  })
})

describe('remote branch probe input validation', () => {
  it('accepts ordinary branch names', () => {
    for (const name of ['main', 'feature/widget', 'release-1.2', 'a']) {
      assert.equal(isProbeableBranchName(name), true, name)
    }
  })

  it('rejects names that would be read as options or as invalid refs', () => {
    for (const name of [
      '',
      '--upload-pack=touch',
      '--exec=evil',
      '/leading',
      'trailing/',
      '.hidden',
      'trailing.',
      'has..dots',
      'has//slash',
      'has space',
      'has~tilde',
      'has^caret',
      'has:colon',
      'has?question',
      'has*star',
      'has[bracket]',
      'has\\backslash',
      'has\nnewline',
      'branch.lock',
      'ref@{0}',
    ]) {
      assert.equal(isProbeableBranchName(name), false, name)
    }
  })
})
