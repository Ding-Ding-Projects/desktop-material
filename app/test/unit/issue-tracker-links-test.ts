import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createIssueTrackerItemLink } from '../../src/lib/issue-trackers/issue-tracker-links'

describe('issue tracker item links', () => {
  it('builds a Jira browse link from the validated item contract', () => {
    assert.equal(
      createIssueTrackerItemLink({
        provider: 'jira-cloud',
        endpoint: 'https://team.atlassian.net',
        accountId: 'jira-account',
        scopeId: 'DESK',
        itemId: 'DESK-42',
      }),
      'https://team.atlassian.net/browse/DESK-42'
    )
  })

  it('builds a Trello card link without putting credentials in the URL', () => {
    const link = createIssueTrackerItemLink({
      provider: 'trello',
      endpoint: 'https://api.trello.com',
      accountId: 'member-1',
      scopeId: 'board-1',
      itemId: 'card/short-link',
    })

    assert.equal(link, 'https://trello.com/c/card%2Fshort-link')
    assert.doesNotMatch(link, /api|token|key|member-1/)
  })

  it('rejects an item that does not satisfy the provider contract', () => {
    assert.throws(
      () =>
        createIssueTrackerItemLink({
          provider: 'jira-cloud',
          endpoint: 'https://team.atlassian.net',
          accountId: 'jira-account',
          scopeId: '',
          itemId: 'DESK-42',
        }),
      /Issue tracker configuration|Issue tracker item identity is invalid/
    )
  })
})
