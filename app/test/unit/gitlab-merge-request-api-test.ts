import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getGitLabAPIEndpoint, GitLabAPI } from '../../src/lib/api'
import {
  GitLabMergeRequestContextChangedError,
  GitLabMergeRequestError,
} from '../../src/lib/gitlab-merge-request'

const endpoint = 'https://gitlab.example.test/gitlab'
const webRoot = endpoint
const headSHA = 'a'.repeat(40)

function user(id: number, username = `user-${id}`) {
  return {
    id,
    username,
    name: `User ${id}`,
    avatar_url: null,
    web_url: `${webRoot}/${username}`,
  }
}

function mergeRequest(
  iid: number,
  overrides: Readonly<Record<string, unknown>> = {}
) {
  return {
    id: 1000 + iid,
    iid,
    project_id: 42,
    title: 'Merge request',
    description: 'Body',
    state: 'opened',
    draft: false,
    source_branch: `topic-${iid}`,
    target_branch: 'main',
    source_project_id: 42,
    target_project_id: 42,
    sha: headSHA,
    author: user(1, 'author'),
    assignees: [],
    reviewers: [],
    web_url: `${webRoot}/group/project/-/merge_requests/${iid}`,
    created_at: '2026-07-19T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    merged_at: null,
    closed_at: null,
    detailed_merge_status: 'mergeable',
    has_conflicts: false,
    blocking_discussions_resolved: true,
    merge_when_pipeline_succeeds: false,
    ...overrides,
  }
}

function approval(iid: number, approved: boolean) {
  return {
    iid,
    approved,
    approvals_required: 1,
    approvals_left: approved ? 0 : 1,
    approved_by: approved
      ? [{ user: user(9, 'approver'), approved_at: '2026-07-20T11:00:00Z' }]
      : [],
  }
}

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), { status, headers })
}

interface IRequestRecord {
  readonly url: string
  readonly options?: RequestInit
}

async function withFetchQueue(
  work: (
    api: GitLabAPI,
    responses: Response[],
    requests: IRequestRecord[]
  ) => Promise<void>
) {
  const originalFetch = globalThis.fetch
  const responses = new Array<Response>()
  const requests = new Array<IRequestRecord>()
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    const response = responses.shift()
    assert.ok(response, `unexpected request to ${String(url)}`)
    return response
  }
  try {
    await work(
      new GitLabAPI(endpoint, 'exact-private-token'),
      responses,
      requests
    )
    assert.equal(responses.length, 0, 'all queued responses should be consumed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe('GitLab merge request API', () => {
  it('uses exact self-managed routes, token auth, and mutation bodies', async () => {
    await withFetchQueue(async (api, responses, requests) => {
      responses.push(
        jsonResponse(mergeRequest(7, { title: 'Draft: New MR', draft: true })),
        jsonResponse(approval(7, false))
      )
      const created = await api.createGitLabMergeRequest(
        'group/subgroup/project',
        {
          sourceBranch: 'topic/report',
          targetBranch: 'main',
          title: 'New MR',
          description: 'Body',
          draft: true,
          reviewerIds: [2],
          assigneeIds: [3],
        }
      )
      assert.equal(created.title, 'New MR')
      assert.equal(created.draft, true)
      assert.match(
        requests[0].url,
        /\/gitlab\/api\/v4\/projects\/group%2Fsubgroup%2Fproject\/merge_requests$/
      )
      assert.equal(requests[0].options?.method, 'POST')
      assert.deepEqual(JSON.parse(String(requests[0].options?.body)), {
        source_branch: 'topic/report',
        target_branch: 'main',
        title: 'Draft: New MR',
        description: 'Body',
        reviewer_ids: [2],
        assignee_ids: [3],
      })
      const headers = new Headers(requests[0].options?.headers)
      assert.equal(headers.get('PRIVATE-TOKEN'), 'exact-private-token')
      assert.equal(headers.get('Authorization'), null)
      assert.match(requests[1].url, /\/merge_requests\/7\/approvals$/)

      responses.push(
        jsonResponse(mergeRequest(7)),
        jsonResponse(
          mergeRequest(7, {
            title: 'Draft: Renamed',
            draft: true,
            target_branch: 'release',
            reviewers: [user(2, 'reviewer')],
            assignees: [user(3, 'assignee')],
          })
        ),
        jsonResponse(approval(7, false))
      )
      const updated = await api.updateGitLabMergeRequest(
        'group/subgroup/project',
        7,
        headSHA,
        {
          title: 'Renamed',
          targetBranch: 'release',
          draft: true,
          reviewerIds: [2],
          assigneeIds: [3],
        }
      )
      assert.equal(updated.title, 'Renamed')
      assert.equal(requests[3].options?.method, 'PUT')
      assert.deepEqual(JSON.parse(String(requests[3].options?.body)), {
        title: 'Draft: Renamed',
        target_branch: 'release',
        reviewer_ids: [2],
        assignee_ids: [3],
      })

      responses.push(
        jsonResponse(mergeRequest(7)),
        jsonResponse(mergeRequest(7, { state: 'closed' })),
        jsonResponse(approval(7, false))
      )
      const closed = await api.setGitLabMergeRequestState(
        'group/subgroup/project',
        7,
        headSHA,
        'close'
      )
      assert.equal(closed.state, 'closed')
      assert.deepEqual(JSON.parse(String(requests[6].options?.body)), {
        state_event: 'close',
      })
    })
  })

  it('keeps successful lifecycle responses when approval metadata is partial', async () => {
    await withFetchQueue(async (api, responses, requests) => {
      responses.push(
        jsonResponse(mergeRequest(7)),
        jsonResponse({ message: 'approval unavailable' }, 403)
      )
      const loaded = await api.getGitLabMergeRequest(
        'group/subgroup/project',
        7
      )
      assert.equal(loaded.approval, null)
      assert.match(requests[1].url, /\/merge_requests\/7\/approvals$/)

      responses.push(
        jsonResponse(mergeRequest(8)),
        jsonResponse({ message: 'approval unavailable' }, 500)
      )
      const created = await api.createGitLabMergeRequest(
        'group/subgroup/project',
        {
          sourceBranch: 'topic-partial',
          targetBranch: 'main',
          title: 'Partial approval',
          description: '',
          draft: false,
          reviewerIds: [],
          assigneeIds: [],
        }
      )
      assert.equal(created.iid, 8)
      assert.equal(created.approval, null)
      assert.equal(requests[2].options?.method, 'POST')
      assert.match(requests[3].url, /\/merge_requests\/8\/approvals$/)

      responses.push(
        jsonResponse(mergeRequest(7)),
        jsonResponse(mergeRequest(7, { title: 'Updated' })),
        jsonResponse({ message: 'approval unavailable' }, 403)
      )
      const updated = await api.updateGitLabMergeRequest(
        'group/subgroup/project',
        7,
        headSHA,
        { title: 'Updated' }
      )
      assert.equal(updated.title, 'Updated')
      assert.equal(updated.approval, null)
      assert.equal(requests[5].options?.method, 'PUT')
      assert.match(requests[6].url, /\/merge_requests\/7\/approvals$/)
      assert.equal(requests.length, 7)
    })
  })

  it('bounds list and members pagination and propagates cancellation', async () => {
    await withFetchQueue(async (api, responses, requests) => {
      responses.push(
        jsonResponse(
          Array.from({ length: 100 }, (_, index) => mergeRequest(index + 1)),
          200,
          { 'x-page': '1', 'x-per-page': '100', 'x-next-page': '2' }
        ),
        jsonResponse([mergeRequest(101)], 200, {
          'x-page': '2',
          'x-per-page': '100',
          'x-next-page': '',
        })
      )
      const list = await api.listGitLabMergeRequests('group/subgroup/project', {
        state: 'all',
        orderBy: 'updated_at',
        sort: 'desc',
      })
      assert.equal(list.items.length, 101)
      assert.equal(list.capped, false)
      assert.match(requests[0].url, /state=all/)
      assert.match(requests[0].url, /with_merge_status_recheck=true/)
      assert.match(requests[0].url, /page=1&per_page=100/)
      assert.match(requests[1].url, /page=2&per_page=100/)

      responses.push(
        jsonResponse([{ ...user(2, 'developer'), access_level: 30 }], 200, {
          'x-next-page': '2',
        }),
        jsonResponse([{ ...user(3, 'maintainer'), access_level: 40 }], 200, {
          'x-next-page': '',
        })
      )
      const members = await api.listGitLabProjectMembers(
        'group/subgroup/project'
      )
      assert.deepEqual(
        members.items.map(x => x.username),
        ['developer', 'maintainer']
      )
      assert.match(
        requests[2].url,
        /projects\/group%2Fsubgroup%2Fproject\/members\/all\?page=1&per_page=100/
      )

      responses.push(
        jsonResponse([mergeRequest(1)], 200, { 'x-next-page': '4' })
      )
      await assert.rejects(
        api.listGitLabMergeRequests('group/subgroup/project'),
        (error: unknown) =>
          error instanceof GitLabMergeRequestError &&
          error.kind === 'invalid-response'
      )

      const requestCount = requests.length
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        api.listGitLabMergeRequests(
          'group/subgroup/project',
          {},
          controller.signal
        ),
        (error: unknown) => (error as Error)?.name === 'AbortError'
      )
      assert.equal(requests.length, requestCount)
    })
  })

  it('pins approvals to the reviewed HEAD and guards unapprove staleness', async () => {
    await withFetchQueue(async (api, responses, requests) => {
      responses.push(
        jsonResponse(approval(7, true)),
        jsonResponse(mergeRequest(7))
      )
      const approved = await api.approveGitLabMergeRequest(
        'group/subgroup/project',
        7,
        headSHA
      )
      assert.equal(approved.approved, true)
      assert.match(requests[0].url, /\/merge_requests\/7\/approve$/)
      assert.deepEqual(JSON.parse(String(requests[0].options?.body)), {
        sha: headSHA,
      })

      responses.push(
        jsonResponse(mergeRequest(7)),
        jsonResponse(approval(7, false)),
        jsonResponse(mergeRequest(7))
      )
      const unapproved = await api.unapproveGitLabMergeRequest(
        'group/subgroup/project',
        7,
        headSHA
      )
      assert.equal(unapproved.approved, false)
      assert.match(requests[3].url, /\/merge_requests\/7\/unapprove$/)
      assert.equal(requests[3].options?.body, undefined)

      responses.push(jsonResponse(mergeRequest(7, { sha: 'b'.repeat(40) })))
      await assert.rejects(
        api.unapproveGitLabMergeRequest('group/subgroup/project', 7, headSHA),
        GitLabMergeRequestContextChangedError
      )
      assert.equal(requests.length, 6)
    })
  })

  it('rejects credentialed, queried, and non-HTTP self-managed endpoints', () => {
    for (const invalid of [
      'https://user:secret@gitlab.example.test',
      'https://gitlab.example.test?token=secret',
      'https://gitlab.example.test/#fragment',
      'ftp://gitlab.example.test',
    ]) {
      assert.throws(
        () => getGitLabAPIEndpoint(invalid),
        GitLabMergeRequestError
      )
    }
    assert.equal(
      getGitLabAPIEndpoint('http://gitlab.example.test/subpath'),
      'http://gitlab.example.test/subpath/api/v4'
    )
  })
})
