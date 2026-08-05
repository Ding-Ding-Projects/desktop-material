/**
 * A minimal, real HTTP client for verifying Jira credentials.
 *
 * This intentionally does not attempt to model issue sync. It exposes a
 * single connection-verification call, `fetchJiraMyself`, which hits the
 * standard "who am I" endpoint every Jira flavor this app targets supports:
 *
 *  - Jira Cloud (`jira-cloud`): `GET /rest/api/3/myself`, Basic auth with
 *    the account email and an API token.
 *  - Jira Data Center (`jira-data-center`) and the Git Integration for Jira
 *    app (`git-integration-for-jira`): also `GET /rest/api/3/myself` on
 *    modern Data Center releases, authenticated with a personal access
 *    token as a Bearer credential (Data Center does not support Basic auth
 *    with API tokens the way Cloud does).
 *
 * No token is ever logged, and the response is never persisted verbatim;
 * callers get back only the fields needed to confirm the identity of the
 * connected account.
 */

import { APIError, getUserAgent } from '../http'

export type JiraAuthMode = 'basic-email-token' | 'bearer-token'

/** The subset of the Jira `myself` response this app cares about. */
export interface IJiraUser {
  readonly accountId: string
  readonly displayName: string
  readonly emailAddress: string | null
}

function jiraMyselfUrl(endpoint: string): string {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  return new URL('rest/api/3/myself', base).toString()
}

function jiraAuthHeader(
  mode: JiraAuthMode,
  email: string,
  token: string
): string {
  if (mode === 'basic-email-token') {
    const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64')
    return `Basic ${encoded}`
  }
  return `Bearer ${token}`
}

/**
 * Verify a Jira credential by fetching the authenticated user.
 *
 * @param endpoint The canonical Jira origin, e.g. `https://team.atlassian.net`
 *                 for Cloud, or the base URL of a Data Center instance.
 * @param mode     Which authentication scheme to use for this endpoint.
 * @param email    The Atlassian account email. Only used for
 *                 `basic-email-token`; pass an empty string for
 *                 `bearer-token`.
 * @param token    The Jira API token or personal access token. Never
 *                 logged.
 */
export async function fetchJiraMyself(
  endpoint: string,
  mode: JiraAuthMode,
  email: string,
  token: string,
  signal?: AbortSignal
): Promise<IJiraUser> {
  const url = jiraMyselfUrl(endpoint)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: jiraAuthHeader(mode, email, token),
      'User-Agent': getUserAgent(),
    },
    signal,
  })

  if (!response.ok) {
    let apiError = null
    try {
      apiError = await response.json()
    } catch {
      apiError = null
    }
    throw new APIError(response, apiError)
  }

  const body = await response.json()
  return {
    accountId: typeof body.accountId === 'string' ? body.accountId : '',
    displayName: typeof body.displayName === 'string' ? body.displayName : '',
    emailAddress:
      typeof body.emailAddress === 'string' ? body.emailAddress : null,
  }
}
