import {
  IStatusHubReplyPollResult,
  IStatusHubSessionProjection,
  IStatusHubStatus,
  LocalStatusHubFallback,
} from '../models/status-hub'

const MaximumStatusHubPayloadBytes = 64 * 1024
const StatusHubRequestTimeoutMs = 10_000

export interface IStatusHubClientConfiguration {
  /** Owner-configured HTTPS endpoint. Kept out of renderer state. */
  readonly endpoint: string | null
  /**
   * A main-process-only authorization provider. It must return null when the
   * owner has not registered the read-plus-reply credential in the OS vault.
   */
  readonly getAuthorization: () => Promise<string | null>
  readonly fetch?: typeof fetch
  readonly now?: () => number
}

function normalizeEndpoint(value: string | null): URL | null {
  if (value === null) {return null}
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.hostname === '127.0.0.1'
      ? url
      : null
  } catch {
    return null
  }
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MaximumStatusHubPayloadBytes) {
    throw new Error('Status Hub response exceeded the fixed size limit.')
  }
  return JSON.parse(text) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The desktop Status Hub boundary. Discord never appears here: its bridge has
 * read-plus-reply powers in the Hub, while this app only reads its own inbox
 * through the same authenticated session route.
 */
export class StatusHubClient {
  private readonly endpoint: URL | null
  private readonly request: typeof fetch
  private readonly now: () => number

  public constructor(private readonly configuration: IStatusHubClientConfiguration) {
    this.endpoint = normalizeEndpoint(configuration.endpoint)
    this.request = configuration.fetch ?? fetch
    this.now = configuration.now ?? Date.now
  }

  public async getStatus(): Promise<IStatusHubStatus> {
    if (this.endpoint === null) {return LocalStatusHubFallback}
    const authorization = await this.configuration.getAuthorization()
    if (authorization === null) {
      return {
        connection: 'authentication-unavailable',
        stableURL: this.endpoint.toString(),
        message: 'Status Hub is configured, but its owner credential is unavailable on this computer.',
        lastUpdatedAt: null,
      }
    }
    return {
      connection: 'connected',
      stableURL: this.endpoint.toString(),
      message: 'Status Hub is available through the main-process boundary.',
      lastUpdatedAt: this.now(),
    }
  }

  public async publish(projection: IStatusHubSessionProjection): Promise<IStatusHubStatus> {
    const status = await this.getStatus()
    if (status.connection !== 'connected' || this.endpoint === null) {return status}
    const authorization = await this.configuration.getAuthorization()
    if (authorization === null) {return { ...status, connection: 'authentication-unavailable' }}
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), StatusHubRequestTimeoutMs)
      const response = await this.request(new URL('/api/agent/sessions', this.endpoint), {
        method: 'PUT', headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(projection), signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
      if (!response.ok) {throw new Error(`Status Hub returned HTTP ${response.status}.`)}
      await readBoundedJSON(response)
      return { ...status, lastUpdatedAt: this.now() }
    } catch {
      return { ...status, connection: 'unavailable', message: 'Status Hub could not accept this update; local session state remains authoritative here.' }
    }
  }

  public async pollReplies(sessionId: string, cursor: string | null): Promise<IStatusHubReplyPollResult> {
    const status = await this.getStatus()
    if (status.connection !== 'connected' || this.endpoint === null) {
      return { replies: [], nextCursor: cursor, deliveryConfirmed: false }
    }
    const authorization = await this.configuration.getAuthorization()
    if (authorization === null) {return { replies: [], nextCursor: cursor, deliveryConfirmed: false }}
    const url = new URL(`/api/agent/sessions/${encodeURIComponent(sessionId)}/replies`, this.endpoint)
    if (cursor !== null) {url.searchParams.set('cursor', cursor)}
    try {
      const response = await this.request(url, { headers: { authorization } })
      if (!response.ok) {return { replies: [], nextCursor: cursor, deliveryConfirmed: false }}
      const value = await readBoundedJSON(response)
      if (!isRecord(value) || !Array.isArray(value.replies)) {return { replies: [], nextCursor: cursor, deliveryConfirmed: false }}
      const replies = value.replies.filter(isRecord).flatMap(reply =>
        typeof reply.id === 'string' && typeof reply.questionId === 'string' && typeof reply.text === 'string' && typeof reply.receivedAt === 'number'
          ? [{ id: reply.id, questionId: reply.questionId, text: reply.text, receivedAt: reply.receivedAt }]
          : [])
      return { replies, nextCursor: typeof value.nextCursor === 'string' ? value.nextCursor : null, deliveryConfirmed: value.deliveryConfirmed === true }
    } catch {
      return { replies: [], nextCursor: cursor, deliveryConfirmed: false }
    }
  }
}

/** A safe default until an owner registers a Hub endpoint and vault credential. */
export function createUnconfiguredStatusHubClient(): StatusHubClient {
  return new StatusHubClient({ endpoint: null, getAuthorization: async () => null })
}
