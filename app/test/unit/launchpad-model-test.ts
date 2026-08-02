import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildLaunchpadSections,
  classifyLaunchpadItem,
  createLaunchpadItemIdentity,
  createLaunchpadItemKey,
  createLaunchpadProviderItemKey,
  deduplicateLaunchpadItems,
  ILaunchpadAttentionSignals,
  ILaunchpadCIItem,
  ILaunchpadIssueItem,
  ILaunchpadItemIdentity,
  ILaunchpadLocalWIPItem,
  ILaunchpadPullRequestItem,
  isLaunchpadItemIdentity,
  isLaunchpadItemKey,
  isLaunchpadProviderItemKey,
  LaunchpadBucketOrder,
  LaunchpadBuckets,
  LaunchpadIdentitySegmentMaximumLength,
  LaunchpadItem,
  LaunchpadItemKeyMaximumLength,
  LaunchpadItemKind,
  LaunchpadMaximumOmittedItems,
  LaunchpadNotApplicable,
  LaunchpadUnavailable,
  launchpadValue,
} from '../../src/lib/launchpad/launchpad-model'

const defaultIdentity = {
  endpointId: 'https://forge.example/api',
  accountId: 'account-1',
  repositoryId: 'repository-1',
} as const

type IdentityOverrides<K extends LaunchpadItemKind> = Partial<
  Pick<ILaunchpadItemIdentity<K>, 'endpointId' | 'accountId' | 'repositoryId'>
>

function identity<K extends LaunchpadItemKind>(
  kind: K,
  itemId: string,
  overrides: IdentityOverrides<K> = {}
): ILaunchpadItemIdentity<K> {
  return { ...defaultIdentity, ...overrides, kind, itemId }
}

function attention(
  overrides: Partial<ILaunchpadAttentionSignals> = {}
): ILaunchpadAttentionSignals {
  return {
    readyToMerge: launchpadValue(false),
    assignment: launchpadValue('assigned'),
    mergeConflict: launchpadValue('conflict-free'),
    ...overrides,
  }
}

function issueAttention(
  overrides: Partial<ILaunchpadAttentionSignals> = {}
): ILaunchpadAttentionSignals {
  return attention({
    readyToMerge: LaunchpadNotApplicable,
    mergeConflict: LaunchpadNotApplicable,
    ...overrides,
  })
}

function unrelatedAttention(): ILaunchpadAttentionSignals {
  return {
    readyToMerge: LaunchpadNotApplicable,
    assignment: LaunchpadNotApplicable,
    mergeConflict: LaunchpadNotApplicable,
  }
}

function issue(
  itemId: string,
  signals: ILaunchpadAttentionSignals = issueAttention(),
  identityOverrides: IdentityOverrides<'issue'> = {},
  title: string = `Issue ${itemId}`
): ILaunchpadIssueItem {
  return {
    kind: 'issue',
    identity: identity('issue', itemId, identityOverrides),
    title,
    updatedAt: launchpadValue('2026-08-02T12:00:00.000Z'),
    attention: signals,
    referenceNumber: launchpadValue(7),
    branchName: LaunchpadNotApplicable,
    webUrl: launchpadValue(`https://forge.example/issues/${itemId}`),
    diffStat: LaunchpadNotApplicable,
    ciStatus: LaunchpadNotApplicable,
  }
}

function pullRequest(
  itemId: string,
  signals: ILaunchpadAttentionSignals = attention(),
  identityOverrides: IdentityOverrides<'pull-request'> = {},
  title: string = `Pull request ${itemId}`
): ILaunchpadPullRequestItem {
  return {
    kind: 'pull-request',
    identity: identity('pull-request', itemId, identityOverrides),
    title,
    updatedAt: launchpadValue('2026-08-02T12:00:00.000Z'),
    attention: signals,
    referenceNumber: launchpadValue(7),
    branchName: launchpadValue('feature/launchpad'),
    webUrl: launchpadValue(`https://forge.example/pulls/${itemId}`),
    diffStat: launchpadValue({ additions: 12, deletions: 3 }),
    ciStatus: launchpadValue('succeeded'),
  }
}

function ciRun(
  itemId: string,
  signals: ILaunchpadAttentionSignals = unrelatedAttention()
): ILaunchpadCIItem {
  return {
    kind: 'ci-run',
    identity: identity('ci-run', itemId),
    title: `CI run ${itemId}`,
    updatedAt: LaunchpadUnavailable,
    attention: signals,
    referenceNumber: launchpadValue(42),
    branchName: launchpadValue('main'),
    webUrl: LaunchpadUnavailable,
    diffStat: LaunchpadNotApplicable,
    ciStatus: launchpadValue('in-progress'),
  }
}

function localWIP(
  itemId: string,
  signals: ILaunchpadAttentionSignals = unrelatedAttention()
): ILaunchpadLocalWIPItem {
  return {
    kind: 'local-wip',
    identity: identity('local-wip', itemId),
    title: `Local work ${itemId}`,
    updatedAt: launchpadValue('2026-08-02T11:00:00.000Z'),
    attention: signals,
    referenceNumber: LaunchpadNotApplicable,
    branchName: LaunchpadUnavailable,
    webUrl: LaunchpadNotApplicable,
    diffStat: LaunchpadUnavailable,
    ciStatus: LaunchpadNotApplicable,
  }
}

describe('Launchpad model', () => {
  it('constructs strict identities and rejects malformed or surplus fields', () => {
    const candidate = identity('issue', 'item-1')
    const constructed = createLaunchpadItemIdentity(candidate)

    assert.deepEqual(constructed, candidate)
    assert.equal(Object.isFrozen(constructed), true)
    assert.equal(isLaunchpadItemIdentity(candidate), true)
    assert.equal(isLaunchpadItemIdentity({ ...candidate, extra: true }), false)
    assert.equal(isLaunchpadItemIdentity({ ...candidate, itemId: '' }), false)
    assert.equal(
      isLaunchpadItemIdentity({ ...candidate, itemId: 'bad\nidentity' }),
      false
    )
    assert.equal(
      isLaunchpadItemIdentity({
        ...candidate,
        itemId: 'x'.repeat(LaunchpadIdentitySegmentMaximumLength + 1),
      }),
      false
    )
    assert.equal(
      isLaunchpadItemIdentity({ ...candidate, kind: 'commit' }),
      false
    )
    assert.throws(() => createLaunchpadItemIdentity(null))
  })

  it('encodes every identity component without delimiter or JSON-escape collisions', () => {
    const identities = [
      identity('issue', 'd', {
        endpointId: 'a|b',
        accountId: 'c',
      }),
      identity('issue', 'd', {
        endpointId: 'a',
        accountId: 'b|c',
      }),
      identity('issue', 'd', { repositoryId: 'repository|1' }),
      identity('issue', 'repository|1', { repositoryId: 'd' }),
      identity('issue', 'quote"slash\\id'),
      identity('pull-request', 'd'),
      identity('issue', 'different-item'),
    ]
    const keys = identities.map(createLaunchpadItemKey)

    assert.equal(new Set(keys).size, identities.length)
    assert.equal(keys.every(isLaunchpadItemKey), true)
    assert.notEqual(
      createLaunchpadItemKey(identity('issue', 'x', { accountId: 'one' })),
      createLaunchpadItemKey(identity('issue', 'x', { accountId: 'two' }))
    )
    assert.notEqual(
      createLaunchpadItemKey(identity('issue', 'x', { repositoryId: 'one' })),
      createLaunchpadItemKey(identity('issue', 'x', { repositoryId: 'two' }))
    )
  })

  it('validates only bounded canonical exact and provider keys', () => {
    const issueIdentity = identity('issue', 'shared-provider-id')
    const pullRequestIdentity = identity('pull-request', 'shared-provider-id')
    const exactKey = createLaunchpadItemKey(issueIdentity)
    const providerKey = createLaunchpadProviderItemKey(issueIdentity)

    assert.equal(isLaunchpadItemKey(exactKey), true)
    assert.equal(isLaunchpadProviderItemKey(providerKey), true)
    assert.notEqual(exactKey, createLaunchpadItemKey(pullRequestIdentity))
    assert.equal(
      providerKey,
      createLaunchpadProviderItemKey(pullRequestIdentity)
    )
    assert.equal(isLaunchpadItemKey(` ${exactKey}`), false)
    assert.equal(
      isLaunchpadItemKey(exactKey.replace('issue', '\\u0069ssue')),
      false
    )
    assert.equal(isLaunchpadItemKey(providerKey), false)
    assert.equal(isLaunchpadProviderItemKey(exactKey), false)
    assert.equal(
      isLaunchpadItemKey('x'.repeat(LaunchpadItemKeyMaximumLength + 1)),
      false
    )
    assert.equal(isLaunchpadItemKey('{"not":"an array"}'), false)
    assert.equal(isLaunchpadItemKey('["launchpad-item",2]'), false)
  })

  it('keeps unavailable and not-applicable provider facts explicit by kind', () => {
    const issueItem = issue('issue-fields')
    const pullRequestItem: ILaunchpadPullRequestItem = {
      ...pullRequest('pr-fields'),
      attention: attention({
        assignment: LaunchpadUnavailable,
        mergeConflict: LaunchpadUnavailable,
      }),
      diffStat: LaunchpadUnavailable,
      ciStatus: LaunchpadUnavailable,
    }
    const ciItem = ciRun('ci-fields')
    const localItem = localWIP('wip-fields')

    assert.equal(issueItem.branchName.availability, 'not-applicable')
    assert.equal(issueItem.diffStat.availability, 'not-applicable')
    assert.equal(
      issueItem.attention.readyToMerge.availability,
      'not-applicable'
    )
    assert.equal(issueItem.attention.assignment.availability, 'value')
    assert.equal(
      issueItem.attention.mergeConflict.availability,
      'not-applicable'
    )
    assert.equal(pullRequestItem.diffStat.availability, 'unavailable')
    assert.equal(pullRequestItem.ciStatus.availability, 'unavailable')
    assert.equal(
      pullRequestItem.attention.assignment.availability,
      'unavailable'
    )
    assert.equal(
      pullRequestItem.attention.mergeConflict.availability,
      'unavailable'
    )
    assert.equal(ciItem.updatedAt.availability, 'unavailable')
    assert.equal(ciItem.diffStat.availability, 'not-applicable')
    assert.equal(ciItem.attention.assignment.availability, 'not-applicable')
    assert.equal(ciItem.attention.mergeConflict.availability, 'not-applicable')
    assert.equal(localItem.referenceNumber.availability, 'not-applicable')
    assert.equal(localItem.webUrl.availability, 'not-applicable')
    assert.equal(localItem.diffStat.availability, 'unavailable')
  })

  it('applies the exact issue section precedence for simultaneous signals', () => {
    const multiSignal: ILaunchpadPullRequestItem = {
      ...pullRequest('multi-signal'),
      attention: attention({
        assignment: launchpadValue('unassigned'),
        mergeConflict: launchpadValue('conflicted'),
        readyToMerge: launchpadValue(true),
      }),
      ciStatus: launchpadValue('failed'),
    }
    const pinnedKeys = new Set([
      createLaunchpadProviderItemKey(multiSignal.identity),
    ])

    assert.equal(
      classifyLaunchpadItem(multiSignal, pinnedKeys),
      LaunchpadBuckets.Pinned
    )
    assert.equal(
      classifyLaunchpadItem(multiSignal, new Set()),
      LaunchpadBuckets.ReadyToMerge
    )

    const unassigned: ILaunchpadPullRequestItem = {
      ...multiSignal,
      attention: {
        ...multiSignal.attention,
        readyToMerge: launchpadValue(false),
      },
    }
    assert.equal(
      classifyLaunchpadItem(unassigned, new Set()),
      LaunchpadBuckets.Unassigned
    )

    const failing: ILaunchpadPullRequestItem = {
      ...unassigned,
      attention: {
        ...unassigned.attention,
        assignment: launchpadValue('assigned'),
      },
    }
    assert.equal(
      classifyLaunchpadItem(failing, new Set()),
      LaunchpadBuckets.CIFailing
    )

    const conflicted: ILaunchpadPullRequestItem = {
      ...failing,
      ciStatus: launchpadValue('succeeded'),
    }
    assert.equal(
      classifyLaunchpadItem(conflicted, new Set()),
      LaunchpadBuckets.MergeConflicts
    )
    assert.equal(classifyLaunchpadItem(issue('unmatched'), new Set()), null)
    assert.deepEqual(LaunchpadBucketOrder, [
      'Pinned',
      'Ready to merge',
      'Unassigned',
      'CI failing',
      'Merge conflicts',
    ])
  })

  it('derives CI failure only from a known failed CI status', () => {
    const base = pullRequest(
      'ci-truth',
      attention({
        readyToMerge: launchpadValue(false),
        assignment: launchpadValue('assigned'),
        mergeConflict: launchpadValue('conflict-free'),
      })
    )

    assert.equal(
      classifyLaunchpadItem(
        { ...base, ciStatus: launchpadValue('failed') },
        new Set()
      ),
      LaunchpadBuckets.CIFailing
    )
    for (const ciStatus of [
      LaunchpadUnavailable,
      launchpadValue('cancelled' as const),
      launchpadValue('action-required' as const),
      launchpadValue('succeeded' as const),
    ]) {
      assert.equal(
        classifyLaunchpadItem({ ...base, ciStatus }, new Set()),
        null
      )
    }
  })

  it('collapses a proven issue/PR alias to the PR independent of input order', () => {
    const issueAlias = issue('shared-route')
    const pullRequestAlias = pullRequest('shared-route')

    for (const input of [
      [issueAlias, pullRequestAlias],
      [pullRequestAlias, issueAlias],
    ]) {
      const result = deduplicateLaunchpadItems(input)
      assert.equal(result.length, 1)
      assert.equal(result[0].kind, 'pull-request')
      assert.equal(result[0].title, 'Pull request shared-route')
    }
  })

  it('does not dedupe visible-number or route collisions without full identity', () => {
    const sameVisibleNumber = [issue('issue:7'), pullRequest('pull-request:7')]
    const routeVariants = [
      issue('shared', undefined, { endpointId: 'endpoint-a' }),
      issue('shared', undefined, { endpointId: 'endpoint-b' }),
      issue('shared', undefined, { accountId: 'account-2' }),
      issue('shared', undefined, { repositoryId: 'repository-2' }),
    ]

    assert.equal(deduplicateLaunchpadItems(sameVisibleNumber).length, 2)
    assert.equal(deduplicateLaunchpadItems(routeVariants).length, 4)
  })

  it('chooses the richer same-kind duplicate deterministically', () => {
    const sparse: ILaunchpadCIItem = {
      ...ciRun('duplicate'),
      title: 'Sparse',
      referenceNumber: LaunchpadUnavailable,
      branchName: LaunchpadUnavailable,
      webUrl: LaunchpadUnavailable,
      ciStatus: LaunchpadUnavailable,
    }
    const rich: ILaunchpadCIItem = {
      ...ciRun('duplicate'),
      title: 'Rich',
      webUrl: launchpadValue('https://forge.example/actions/runs/duplicate'),
    }

    for (const input of [
      [sparse, rich],
      [rich, sparse],
    ]) {
      assert.deepEqual(deduplicateLaunchpadItems(input), [rich])
    }
  })

  it('uses a total numeric tie-break for non-finite values and signed zero', () => {
    const candidates = [Number.NaN, Number.POSITIVE_INFINITY, -0, 0].map(
      (additions, index): ILaunchpadPullRequestItem => ({
        ...pullRequest('numeric-tie'),
        title: 'Same title',
        diffStat: launchpadValue({ additions, deletions: index % 2 }),
      })
    )
    const forward = deduplicateLaunchpadItems(candidates)
    const reverse = deduplicateLaunchpadItems([...candidates].reverse())

    assert.equal(forward.length, 1)
    assert.deepEqual(forward, reverse)
  })

  it('partitions each visible unsnoozed item once and reports unmatched work', () => {
    const pinned = localWIP('pinned')
    const ready = pullRequest(
      'ready',
      attention({ readyToMerge: launchpadValue(true) })
    )
    const unassigned = issue(
      'unassigned',
      issueAttention({ assignment: launchpadValue('unassigned') })
    )
    const failing: ILaunchpadCIItem = {
      ...ciRun('failing'),
      ciStatus: launchpadValue('failed'),
    }
    const conflicted = pullRequest(
      'conflicted',
      attention({ mergeConflict: launchpadValue('conflicted') })
    )
    const unmatched = issue('unmatched')
    const snoozed = pullRequest(
      'snoozed',
      attention({ readyToMerge: launchpadValue(true) })
    )
    const items: ReadonlyArray<LaunchpadItem> = [
      unmatched,
      snoozed,
      conflicted,
      failing,
      unassigned,
      ready,
      issue('ready'),
      pinned,
      ready,
    ]
    const pinnedKeys = new Set([
      createLaunchpadProviderItemKey(pinned.identity),
    ])
    const snoozedKeys = new Set([
      createLaunchpadProviderItemKey(snoozed.identity),
    ])
    const forward = buildLaunchpadSections(items, pinnedKeys, snoozedKeys)
    const reverse = buildLaunchpadSections(
      [...items].reverse(),
      pinnedKeys,
      snoozedKeys
    )

    assert.deepEqual(
      forward.sections.map(section => section.bucket),
      LaunchpadBucketOrder
    )
    assert.deepEqual(
      forward.sections.map(section => section.items.length),
      [1, 1, 1, 1, 1]
    )
    assert.equal(forward.omittedItemCount, 1)
    assert.deepEqual(forward.omittedItems, [unmatched])
    assert.equal(forward.snoozedItemCount, 1)
    assert.deepEqual(forward, reverse)
    assert.equal(
      new Set(
        forward.sections.flatMap(section =>
          section.items.map(item =>
            createLaunchpadProviderItemKey(item.identity)
          )
        )
      ).size,
      5
    )
  })

  it('bounds the unmatched sample without hiding the total omitted count', () => {
    const unmatched = Array.from(
      { length: LaunchpadMaximumOmittedItems + 3 },
      (_, index) => issue(`omitted-${index}`)
    )
    const result = buildLaunchpadSections(unmatched, new Set())

    assert.equal(result.omittedItemCount, LaunchpadMaximumOmittedItems + 3)
    assert.equal(result.omittedItems.length, LaunchpadMaximumOmittedItems)
    assert.equal(result.snoozedItemCount, 0)
    assert.equal(
      result.sections.every(section => section.items.length === 0),
      true
    )
  })
})
