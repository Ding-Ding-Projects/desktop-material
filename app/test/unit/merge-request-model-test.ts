import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  MergeRequestBodyMaximumLength,
  MergeRequestMaximumBranchChoices,
  MergeRequestMaximumReviewers,
  MergeRequestTitleMaximumLength,
  boundMergeRequestEditorContext,
  classifyDetailedMergeStatus,
  createHeadShaGuardedApprovalIntent,
  getMergeRequestRouteKey,
  normalizeMergeRequestInitialValue,
  validateMergeRequestDraft,
  type IMergeRequestApprovalContext,
  type IMergeRequestEditorContext,
  type IMergeRequestRouteIdentity,
} from '../../src/ui/merge-request/merge-request-model'

function route(
  accountKey = 'gitlab:https://gitlab.example:test-user'
): IMergeRequestRouteIdentity {
  return {
    repositoryId: 'repository-1',
    accountKey,
    accountDisplayName: 'Test User',
    friendlyEndpoint: 'gitlab.example',
    projectPath: 'desktop/material',
  }
}

function context(): IMergeRequestEditorContext {
  return {
    version: 'context-1',
    route: route(),
    sourceBranches: [{ name: 'feature' }, { name: 'main' }],
    targetBranches: [{ name: 'main' }, { name: 'release' }],
    reviewers: [
      { id: '11', displayName: 'Reviewer One', username: 'reviewer-one' },
      { id: '12', displayName: 'Reviewer Two' },
    ],
    assignees: [{ id: '21', displayName: 'Assignee One' }],
    detailedMergeStatus: 'mergeable',
    headSha: 'a'.repeat(40),
  }
}

describe('merge request structural model', () => {
  it('bounds, validates, and de-duplicates provider choice lists', () => {
    const sourceBranches = Array.from(
      { length: MergeRequestMaximumBranchChoices + 2 },
      (_, index) => ({ name: `branch-${index}` })
    )
    sourceBranches.splice(1, 0, { name: 'branch-0' })
    sourceBranches.splice(2, 0, { name: 'unsafe\nbranch' })
    const bounded = boundMergeRequestEditorContext({
      ...context(),
      sourceBranches,
      reviewers: [
        { id: '11', displayName: 'Reviewer One' },
        { id: '11', displayName: 'Duplicate Reviewer' },
        { id: 'bad\u0000id', displayName: 'Unsafe Reviewer' },
      ],
    })

    assert.strictEqual(
      bounded.context.sourceBranches.length,
      MergeRequestMaximumBranchChoices
    )
    assert.strictEqual(bounded.context.sourceBranches[0].name, 'branch-0')
    assert.strictEqual(
      bounded.context.sourceBranches.some(branch => branch.name.includes('\n')),
      false
    )
    assert.deepStrictEqual(bounded.context.reviewers, [
      { id: '11', displayName: 'Reviewer One' },
    ])
    assert.deepStrictEqual(bounded.capped, ['sourceBranches', 'reviewers'])
  })

  it('prefers an explicit draft flag and supports the legacy Draft title', () => {
    assert.deepStrictEqual(
      normalizeMergeRequestInitialValue({
        title: 'Draft: Ship the safe editor',
        body: 'Details',
      }),
      {
        sourceBranch: '',
        targetBranch: '',
        title: 'Ship the safe editor',
        body: 'Details',
        draft: true,
        reviewerIds: [],
        assigneeIds: [],
      }
    )
    assert.strictEqual(
      normalizeMergeRequestInitialValue({
        title: 'Draft: This is the literal title',
        draft: false,
      }).title,
      'Draft: This is the literal title'
    )
    assert.strictEqual(
      normalizeMergeRequestInitialValue({
        title: 'Ready title',
        draft: true,
      }).draft,
      true
    )
  })

  it('validates required fields, exact choices, limits, and duplicate IDs', () => {
    const current = context()
    assert.deepStrictEqual(
      validateMergeRequestDraft(
        {
          sourceBranch: 'feature',
          targetBranch: 'main',
          title: 'Ready',
          body: 'Bounded',
          draft: false,
          reviewerIds: ['11'],
          assigneeIds: ['21'],
        },
        current
      ),
      []
    )

    const errors = validateMergeRequestDraft(
      {
        sourceBranch: 'missing',
        targetBranch: 'missing',
        title: 'x'.repeat(MergeRequestTitleMaximumLength + 1),
        body: 'x'.repeat(MergeRequestBodyMaximumLength + 1),
        draft: true,
        reviewerIds: [
          ...Array.from(
            { length: MergeRequestMaximumReviewers + 1 },
            () => '11'
          ),
          'missing',
        ],
        assigneeIds: ['21', '21', 'missing'],
      },
      current
    )

    assert.ok(errors.includes('source-required'))
    assert.ok(errors.includes('target-required'))
    assert.ok(errors.includes('branches-must-differ'))
    assert.ok(errors.includes('title-too-long'))
    assert.ok(errors.includes('body-too-long'))
    assert.ok(errors.includes('too-many-reviewers'))
    assert.ok(errors.includes('duplicate-reviewers'))
    assert.ok(errors.includes('duplicate-assignees'))
    assert.ok(errors.includes('invalid-reviewer'))
    assert.ok(errors.includes('invalid-assignee'))
  })

  it('treats checking and approval syncing as transient readiness', () => {
    assert.deepStrictEqual(classifyDetailedMergeStatus('checking'), {
      kind: 'transient',
    })
    assert.deepStrictEqual(classifyDetailedMergeStatus('approvals_syncing'), {
      kind: 'transient',
    })
    assert.deepStrictEqual(classifyDetailedMergeStatus('mergeable'), {
      kind: 'ready',
    })
    assert.deepStrictEqual(classifyDetailedMergeStatus('not_approved'), {
      kind: 'blocked',
      status: 'not_approved',
    })
    assert.deepStrictEqual(classifyDetailedMergeStatus('new_server_value'), {
      kind: 'unknown',
    })
  })

  it('creates approval intents only for the exact route, IID, and HEAD SHA', () => {
    const reviewed: IMergeRequestApprovalContext = {
      route: route(),
      mergeRequestIid: 42,
      headSha: 'a'.repeat(40),
    }
    const intent = createHeadShaGuardedApprovalIntent(
      reviewed,
      { ...reviewed },
      true
    )
    assert.deepStrictEqual(intent, { ...reviewed, approve: true })

    assert.strictEqual(
      createHeadShaGuardedApprovalIntent(
        reviewed,
        { ...reviewed, headSha: 'b'.repeat(40) },
        true
      ),
      null
    )
    assert.strictEqual(
      createHeadShaGuardedApprovalIntent(
        reviewed,
        { ...reviewed, route: route('gitlab:other-account') },
        true
      ),
      null
    )
    assert.strictEqual(
      createHeadShaGuardedApprovalIntent(
        reviewed,
        { ...reviewed, mergeRequestIid: 43 },
        false
      ),
      null
    )
    assert.strictEqual(
      createHeadShaGuardedApprovalIntent(
        { ...reviewed, headSha: 'not-a-sha' },
        { ...reviewed, headSha: 'not-a-sha' },
        true
      ),
      null
    )
  })

  it('includes the exact repository account route in its stable identity', () => {
    assert.notStrictEqual(
      getMergeRequestRouteKey(route()),
      getMergeRequestRouteKey(route('gitlab:other-account'))
    )
    assert.notStrictEqual(
      getMergeRequestRouteKey(route()),
      getMergeRequestRouteKey({
        ...route(),
        repositoryId: 'repository-2',
      })
    )
  })
})
