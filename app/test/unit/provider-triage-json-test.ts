import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  parseBitbucketTriagePullRequests,
  parseGitHubTriageIssues,
  parseGitHubTriagePullRequests,
  parseGitLabTriageIssues,
  parseGitLabTriagePullRequests,
  ProviderTriageJSONError,
  ProviderTriageJSONMaximumBytes,
  readBoundedProviderTriageJSON,
} from '../../src/lib/provider-triage-json'

const githubIdentity = { login: 'fixture-bot' }
const gitlabIdentity = { username: 'fixture-bot' }
const bitbucketIdentity = { nickname: 'fixture-bot' }

describe('provider triage bounded JSON', () => {
  it('rejects oversized declared and streamed bodies before projection', async () => {
    const declared = new Response('{}', {
      headers: {
        'content-length': String(ProviderTriageJSONMaximumBytes + 1),
      },
    })
    await assert.rejects(
      readBoundedProviderTriageJSON(declared),
      (error: ProviderTriageJSONError) => error.kind === 'too-large'
    )

    const streamed = new Response(
      'x'.repeat(ProviderTriageJSONMaximumBytes + 1)
    )
    await assert.rejects(
      readBoundedProviderTriageJSON(streamed),
      (error: ProviderTriageJSONError) => error.kind === 'too-large'
    )
  })

  it('strictly projects GitHub issues and omits pull requests from that channel', () => {
    const items = parseGitHubTriageIssues(
      [
        {
          number: 1,
          title: 'Issue',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
          user: githubIdentity,
          assignees: [githubIdentity],
          body: 'must not be retained',
          html_url: 'javascript:alert(1)',
        },
        { pull_request: {}, body: 'raw pull request payload' },
      ],
      2
    )
    assert.equal(items.length, 1)
    assert.deepEqual(Object.keys(items[0]).sort(), [
      'assigneeLogins',
      'authorLogin',
      'createdAt',
      'draft',
      'number',
      'reviewRequestedLogins',
      'title',
      'updatedAt',
    ])
    assert.doesNotMatch(JSON.stringify(items), /javascript|must not|raw pull/)
  })

  it('rejects malformed optional draft flags and unbounded nested arrays', () => {
    const githubPullRequest = {
      number: 2,
      title: 'Pull request',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
      user: githubIdentity,
      draft: 'false',
    }
    assert.throws(
      () => parseGitHubTriagePullRequests([githubPullRequest], 1),
      ProviderTriageJSONError
    )
    assert.equal(
      parseGitHubTriagePullRequests(
        [{ ...githubPullRequest, draft: undefined }],
        1
      )[0].draft,
      false
    )
    assert.throws(
      () =>
        parseGitHubTriagePullRequests(
          [
            {
              ...githubPullRequest,
              draft: false,
              assignees: Array.from({ length: 51 }, () => githubIdentity),
            },
          ],
          1
        ),
      ProviderTriageJSONError
    )
  })

  it('strictly projects GitLab issues and merge requests', () => {
    const issue = parseGitLabTriageIssues(
      [
        {
          iid: 3,
          title: 'GitLab issue',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
          author: gitlabIdentity,
          assignees: [],
        },
      ],
      1
    )[0]
    const mergeRequest = parseGitLabTriagePullRequests(
      [
        {
          iid: 4,
          title: 'GitLab merge request',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
          author: gitlabIdentity,
          reviewers: [gitlabIdentity],
          draft: true,
        },
      ],
      1
    )[0]
    assert.equal(issue.number, 3)
    assert.equal(mergeRequest.reviewRequestedLogins[0], 'fixture-bot')
    assert.equal(mergeRequest.draft, true)
  })

  it('strictly projects Bitbucket pages and validates optional pagination', () => {
    const value = {
      values: [
        {
          id: 5,
          title: 'Bitbucket pull request',
          created_on: '2026-07-01T00:00:00Z',
          updated_on: '2026-07-02T00:00:00Z',
          author: bitbucketIdentity,
          reviewers: [bitbucketIdentity],
          draft: false,
        },
      ],
      next: '',
    }
    const parsed = parseBitbucketTriagePullRequests(value, 1)
    assert.equal(parsed.items[0].number, 5)
    assert.equal(parsed.hasNextPage, false)
    assert.throws(
      () => parseBitbucketTriagePullRequests({ ...value, next: {} }, 1),
      ProviderTriageJSONError
    )
  })
})
