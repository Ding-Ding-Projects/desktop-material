import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  GitLabMergeRequestContextChangedError,
  GitLabMergeRequestError,
  GitLabMergeRequestRequestGate,
  normalizeGitLabMergeRequestDraft,
  normalizeGitLabMergeRequestUpdate,
  validateGitLabProjectIdentifier,
} from '../../src/lib/gitlab-merge-request'
import {
  boundedGitLabMergeRequestResponse,
  parseGitLabMergeRequest,
  parseGitLabMergeRequestApprovalState,
  parseGitLabMergeRequestMemberPage,
  parseGitLabMergeRequestPage,
  readBoundedGitLabMergeRequestJSON,
} from '../../src/lib/gitlab-merge-request-json'

const webRoot = 'https://gitlab.example.test/gitlab'

function user(id: number, username = `user-${id}`) {
  return {
    id,
    username,
    name: `User ${id}`,
    avatar_url: null,
    web_url: `${webRoot}/${username}`,
  }
}

function mergeRequest(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: 101,
    iid: 7,
    project_id: 42,
    title: 'Bounded lifecycle',
    description: 'Body',
    state: 'opened',
    draft: false,
    source_branch: 'topic/report',
    target_branch: 'main',
    source_project_id: 42,
    target_project_id: 42,
    sha: 'a'.repeat(40),
    author: user(1, 'author'),
    assignees: [user(2, 'assignee')],
    reviewers: [user(3, 'reviewer')],
    web_url: `${webRoot}/group/project/-/merge_requests/7`,
    created_at: '2026-07-19T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    merged_at: null,
    closed_at: null,
    merge_when_pipeline_succeeds: false,
    detailed_merge_status: 'mergeable',
    has_conflicts: false,
    blocking_discussions_resolved: true,
    ...overrides,
  }
}

describe('GitLab merge request bounded model', () => {
  it('parses lifecycle, readiness, approval, and member DTOs', () => {
    const parsed = parseGitLabMergeRequest(mergeRequest(), webRoot, 7)
    assert.equal(parsed.iid, 7)
    assert.equal(parsed.readiness.kind, 'ready')
    assert.equal(parsed.reviewers[0].username, 'reviewer')
    assert.equal(parsed.approval, null)

    const approval = parseGitLabMergeRequestApprovalState(
      {
        iid: 7,
        approved: false,
        approvals_required: 2,
        approvals_left: 1,
        approved_by: [
          { user: user(4, 'approver'), approved_at: '2026-07-20T11:00:00Z' },
        ],
      },
      webRoot,
      7
    )
    assert.equal(approval.approvalsLeft, 1)
    assert.equal(approval.approvedBy[0].user.username, 'approver')

    const members = parseGitLabMergeRequestMemberPage(
      [{ ...user(5, 'maintainer'), access_level: 40 }],
      webRoot
    )
    assert.deepEqual(
      members.map(x => [x.username, x.accessLevel]),
      [['maintainer', 40]]
    )
  })

  it('normalizes draft titles and exact reviewer/assignee arrays', () => {
    const draft = normalizeGitLabMergeRequestDraft({
      sourceBranch: 'topic/report',
      targetBranch: 'main',
      title: 'WIP: Report',
      description: 'Body',
      draft: true,
      reviewerIds: [2, 3],
      assigneeIds: [4],
    })
    assert.equal(draft.title, 'Draft: Report')
    assert.deepEqual(draft.reviewer_ids, [2, 3])

    const current = parseGitLabMergeRequest(
      mergeRequest({ title: 'Draft: Report', draft: true }),
      webRoot
    )
    const update = normalizeGitLabMergeRequestUpdate(current, {
      title: 'Renamed',
      draft: false,
      reviewerIds: [],
      assigneeIds: [],
      stateEvent: 'close',
    })
    assert.equal(update.title, 'Renamed')
    assert.deepEqual(update.reviewer_ids, [])
    assert.equal(update.state_event, 'close')

    assert.throws(
      () =>
        normalizeGitLabMergeRequestDraft({
          sourceBranch: 'topic/report',
          targetBranch: 'main',
          title: 'Report',
          description: '',
          draft: false,
          reviewerIds: [2, 2],
          assigneeIds: [],
        }),
      GitLabMergeRequestError
    )
  })

  it('rejects malformed provider shapes, paths, and oversized pages', () => {
    assert.throws(
      () => parseGitLabMergeRequest(mergeRequest({ draft: 'false' }), webRoot),
      GitLabMergeRequestError
    )
    assert.throws(
      () =>
        parseGitLabMergeRequest(
          mergeRequest({ web_url: 'https://impostor.example/steal' }),
          webRoot
        ),
      GitLabMergeRequestError
    )
    assert.throws(
      () =>
        parseGitLabMergeRequestPage(
          new Array(101).fill(mergeRequest()),
          webRoot
        ),
      GitLabMergeRequestError
    )
    assert.throws(() => validateGitLabProjectIdentifier('../escape'))
    assert.equal(
      validateGitLabProjectIdentifier('group/subgroup/project'),
      'group/subgroup/project'
    )
  })

  it('bounds response bytes and never surfaces provider error text', async () => {
    await assert.rejects(
      readBoundedGitLabMergeRequestJSON(
        new Response(JSON.stringify({ value: 'x'.repeat(128) })),
        undefined,
        32
      ),
      (error: unknown) =>
        error instanceof GitLabMergeRequestError &&
        error.kind === 'invalid-response'
    )

    const secret = 'token-from-provider-body'
    await assert.rejects(
      boundedGitLabMergeRequestResponse(
        new Response(JSON.stringify({ message: secret }), { status: 403 })
      ),
      (error: unknown) =>
        error instanceof GitLabMergeRequestError &&
        error.kind === 'permission' &&
        !error.message.includes(secret)
    )
  })

  it('prevents an ignored abort from publishing a stale completion', async () => {
    const gate = new GitLabMergeRequestRequestGate()
    let finishFirst: ((value: string) => void) | undefined
    const first = gate.run(
      () =>
        new Promise<string>(resolve => {
          finishFirst = resolve
        })
    )
    const second = gate.run(async () => 'new-context')
    assert.equal(await second, 'new-context')
    finishFirst?.('stale-context')
    await assert.rejects(first, GitLabMergeRequestContextChangedError)
  })
})
