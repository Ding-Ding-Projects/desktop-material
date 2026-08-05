/**
 * A minimal, real HTTP client for verifying Trello credentials.
 *
 * Exposes a single connection-verification call, `fetchTrelloMember`, which
 * hits Trello's authenticated-member endpoint, `GET /1/members/me`. Trello
 * authenticates with an application `key` (public, tied to the app
 * registration, not a secret) and a per-member `token` (secret, scoped to
 * the signed-in member and revocable independently). Per Trello's API, both
 * are passed as query-string parameters — there is no header-based scheme
 * for the REST API. The token is never logged.
 */

import { APIError, getUserAgent } from '../http'

/** The subset of the Trello `members/me` response this app cares about. */
export interface ITrelloMember {
  readonly id: string
  readonly username: string
  readonly fullName: string | null
}

function trelloMemberUrl(endpoint: string, key: string, token: string) {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  const url = new URL('1/members/me', base)
  url.searchParams.set('key', key)
  url.searchParams.set('token', token)
  url.searchParams.set('fields', 'id,username,fullName')
  return url.toString()
}

/**
 * Verify a Trello credential by fetching the authenticated member.
 *
 * @param endpoint The Trello API origin, normally `https://api.trello.com`.
 * @param key      The Trello application key. Not secret.
 * @param token    The Trello member token. Never logged.
 */
export async function fetchTrelloMember(
  endpoint: string,
  key: string,
  token: string,
  signal?: AbortSignal
): Promise<ITrelloMember> {
  const url = trelloMemberUrl(endpoint, key, token)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
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
    throw new APIError(
      response,
      apiError !== null && typeof apiError === 'object'
        ? apiError
        : { message: typeof apiError === 'string' ? apiError : undefined }
    )
  }

  const body = await response.json()
  return {
    id: typeof body.id === 'string' ? body.id : '',
    username: typeof body.username === 'string' ? body.username : '',
    fullName: typeof body.fullName === 'string' ? body.fullName : null,
  }
}
