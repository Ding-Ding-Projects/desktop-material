import type { Account } from '../models/account'

function getSearchEmail(account: Account): string {
  const primary = account.emails.find(
    email =>
      email.primary &&
      (email.visibility === 'public' || email.visibility === null)
  )
  return primary?.email ?? account.emails[0]?.email ?? ''
}

/** The provider name shown in rich account rows and searchable metadata. */
export function getAccountProviderLabel(account: Account): string {
  switch (account.provider) {
    case 'gitlab':
      return 'GitLab'
    case 'bitbucket':
      return 'Bitbucket'
    case 'github':
    default:
      return 'GitHub'
  }
}

/**
 * Return the visible and useful account fields used by every account search
 * surface. The token is deliberately absent: search should help find an
 * account without ever treating its credential as displayable metadata.
 */
export function getAccountSearchText(account: Account): ReadonlyArray<string> {
  return [
    account.friendlyName,
    `@${account.login}`,
    account.friendlyEndpoint,
    account.endpoint,
    getAccountProviderLabel(account),
    account.plan ?? '',
    getSearchEmail(account),
  ].filter(value => value.length > 0)
}

/** The compact metadata line used by account rows. */
export function getAccountMetaText(account: Account): string {
  return `@${account.login} · ${account.friendlyEndpoint}`
}

/** The optional tertiary metadata line used by rich account rows. */
export function getAccountDetailsText(account: Account): string {
  return [
    getAccountProviderLabel(account),
    account.plan,
    getSearchEmail(account),
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(' · ')
}
