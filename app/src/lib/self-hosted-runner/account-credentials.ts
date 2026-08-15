import { EndpointToken } from '../endpoint-token'

interface ISelfHostedRunnerAccountCredential {
  readonly endpoint: string
  readonly token: string
}

function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return null
  }
  try {
    const endpoint = new URL(value)
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username.length > 0 ||
      endpoint.password.length > 0 ||
      endpoint.search.length > 0 ||
      endpoint.hash.length > 0 ||
      !endpoint.pathname.endsWith('/')
    ) {
      return null
    }
    return endpoint.toString()
  } catch {
    return null
  }
}

/** Stable account keys are opaque, bounded renderer-provided identifiers. */
export function normalizeSelfHostedRunnerAccountKey(
  value: unknown
): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4_096 &&
    !/[\0-\x1f\x7f]/.test(value)
    ? value
    : null
}

/**
 * Keeps credentials distinct by stable account identity, even when several
 * signed-in users share GitHub.com or one GitHub Enterprise endpoint.
 */
export class SelfHostedRunnerAccountCredentials {
  private credentials = new Map<string, ISelfHostedRunnerAccountCredential>()

  public update(accounts: ReadonlyArray<EndpointToken>): void {
    const next = new Map<string, ISelfHostedRunnerAccountCredential>()
    if (!Array.isArray(accounts)) {
      this.credentials = next
      return
    }
    for (const account of accounts) {
      const accountKey = normalizeSelfHostedRunnerAccountKey(
        account?.accountKey
      )
      const endpoint = normalizeEndpoint(account?.endpoint)
      const token = account?.token
      if (
        accountKey === null ||
        endpoint === null ||
        typeof token !== 'string' ||
        token.length === 0 ||
        token.length > 16 * 1024 ||
        /[\0\r\n]/.test(token)
      ) {
        continue
      }
      next.set(accountKey, { endpoint, token })
    }
    this.credentials = next
  }

  public resolve(accountKey: string, endpoint: string): string | null {
    const normalizedKey = normalizeSelfHostedRunnerAccountKey(accountKey)
    const normalizedEndpoint = normalizeEndpoint(endpoint)
    if (normalizedKey === null || normalizedEndpoint === null) {
      return null
    }
    const credential = this.credentials.get(normalizedKey)
    return credential?.endpoint === normalizedEndpoint ? credential.token : null
  }
}
