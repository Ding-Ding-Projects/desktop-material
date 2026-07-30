import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import TransportStream, { TransportStreamOptions } from 'winston-transport'

export type RemoteLogDestination = 'local' | 'remote' | 'both'

export interface IDesktopRemoteLogTransportOptions
  extends TransportStreamOptions {
  readonly endpoint: URL
  readonly token: string
  readonly clientId: string
  readonly sessionId: string
  readonly appVersion: string
  readonly releaseChannel: string
}

const RequestTimeoutMs = 5_000
const MaximumMessageLength = 32 * 1024

/**
 * Best-effort, non-blocking transport for the self-hosted diagnostic server.
 *
 * Logging must never hold up Git, shutdown, or crash recovery, so Winston is
 * acknowledged before the bounded network request finishes. Transport errors
 * are swallowed after emitting no diagnostic of their own (which would
 * recurse back into this transport).
 */
export class DesktopRemoteLogTransport extends TransportStream {
  private readonly endpoint: URL
  private readonly token: string
  private readonly clientId: string
  private readonly sessionId: string
  private readonly appVersion: string
  private readonly releaseChannel: string

  public constructor(options: IDesktopRemoteLogTransportOptions) {
    const {
      endpoint,
      token,
      clientId,
      sessionId,
      appVersion,
      releaseChannel,
      ...transportOptions
    } = options
    super(transportOptions)
    this.endpoint = endpoint
    this.token = token
    this.clientId = clientId
    this.sessionId = sessionId
    this.appVersion = appVersion
    this.releaseChannel = releaseChannel
  }

  public log(
    info: { level?: unknown; message?: unknown },
    callback: () => void
  ) {
    const body = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: normalizeRemoteLogLevel(info.level),
      message: redactRemoteLogMessage(String(info.message ?? '')).slice(
        0,
        MaximumMessageLength
      ),
      clientId: this.clientId,
      sessionId: this.sessionId,
      appVersion: this.appVersion,
      releaseChannel: this.releaseChannel,
    })
    callback()
    const send =
      this.endpoint.protocol === 'https:' ? httpsRequest : httpRequest
    const request = send(
      this.endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: RequestTimeoutMs,
      },
      response => response.resume()
    )
    request.on('timeout', () => request.destroy())
    request.on('error', () => undefined)
    request.end(body)
  }
}

export function normalizeRemoteLogEndpoint(value: string): URL | null {
  try {
    const endpoint = new URL(value)
    if (
      (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.search !== '' ||
      endpoint.hash !== ''
    ) {
      return null
    }
    endpoint.pathname = '/v1/logs'
    return endpoint
  } catch {
    return null
  }
}

export function normalizeRemoteLogDestination(
  value: string | undefined
): RemoteLogDestination {
  return value === 'remote' || value === 'both' ? value : 'local'
}

export function redactRemoteLogMessage(value: string): string {
  return value
    .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@/gi, 'https://[REDACTED]@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(?:authorization|proxy-authorization|token|password|passwd|secret|api[-_]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      match => `${match.split(/[:=]/, 1)[0]}=[REDACTED]`
    )
    .replace(
      /\b(?:gh[opsu]_|github_pat_)[A-Za-z0-9_]{12,}\b/g,
      '[REDACTED_TOKEN]'
    )
}

function normalizeRemoteLogLevel(value: unknown): string {
  return value === 'debug' ||
    value === 'info' ||
    value === 'warn' ||
    value === 'error'
    ? value
    : 'info'
}
