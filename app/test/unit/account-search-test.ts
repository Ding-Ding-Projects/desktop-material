import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { Account } from '../../src/models/account'
import {
  getAccountDetailsText,
  getAccountProviderLabel,
  getAccountSearchText,
} from '../../src/lib/account-search'

describe('account search metadata', () => {
  const account = {
    login: 'alice',
    endpoint: 'https://api.example.com/',
    token: 'not-used-by-search',
    emails: [
      {
        email: 'alice@example.com',
        verified: true,
        primary: true,
        visibility: 'public',
      },
    ],
    avatarURL: 'https://avatars.example.com/alice.png',
    id: 42,
    name: 'Alice Example',
    friendlyName: 'Alice Example',
    friendlyEndpoint: 'GitLab · api.example.com',
    plan: 'Enterprise',
    provider: 'gitlab',
  } as unknown as Account

  it('searches the fields displayed by a rich account row', () => {
    assert.deepEqual(getAccountSearchText(account), [
      'Alice Example',
      '@alice',
      'GitLab · api.example.com',
      'https://api.example.com/',
      'GitLab',
      'Enterprise',
      'alice@example.com',
    ])
  })

  it('keeps the provider and tertiary row metadata consistent', () => {
    assert.equal(getAccountProviderLabel(account), 'GitLab')
    assert.equal(
      getAccountDetailsText(account),
      'GitLab · Enterprise · alice@example.com'
    )
  })

  it('does not expose the account token as searchable metadata', () => {
    assert.equal(getAccountSearchText(account).includes(account.token), false)
  })

  it('does not expose a private email when no visible email exists', () => {
    const privateAccount = {
      ...account,
      emails: [
        {
          email: 'private@example.com',
          verified: true,
          primary: true,
          visibility: 'private',
        },
      ],
    } as unknown as Account

    assert.equal(
      getAccountSearchText(privateAccount).includes('private@example.com'),
      false
    )
    assert.equal(getAccountDetailsText(privateAccount), 'GitLab · Enterprise')
  })

  it('labels self-hosted accounts without falling back to GitHub', () => {
    assert.equal(
      getAccountProviderLabel({
        ...account,
        provider: 'self-hosted',
      } as unknown as Account),
      'Self-hosted'
    )
  })
})
