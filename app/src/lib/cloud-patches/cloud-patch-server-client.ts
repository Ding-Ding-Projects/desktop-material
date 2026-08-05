/**
 * Thin HTTP client for the R1 self-hosted server's Cloud Patch storage
 * endpoints (`POST /v1/patches`, `GET /v1/patches/:shareId`,
 * `POST /v1/patches/:shareId/revoke`; see
 * `services/desktop-material-server/server.mjs`). Pure network glue: it does
 * not read the working tree, run Git, or touch the filesystem. Building the
 * artifact bytes is `createCloudPatchArtifact` (patch-artifact.ts); applying
 * fetched bytes locally is the caller's job via the existing `git am`
 * plumbing already used by `patch-series.tsx`.
 *
 * This module talks only to a server the user configured for R1
 * (self-hosted, own server, own device token). There is no default or
 * fallback server — every function requires an explicit origin and device
 * token, so a caller with no R1 server configured simply never calls in
 * (the "honest single-player degrade" the issue calls for).
 */

export interface ICloudPatchServerConfig {
  /** e.g. "https://patches.example.internal:8787" — no path, no trailing slash. */
  readonly origin: string
  /** This device's bearer token from `/v1/join`, the same one R1 already persists. */
  readonly deviceToken: string
}

export interface ICloudPatchUploadRequest {
  readonly recipientDeviceIds: ReadonlyArray<string>
  readonly expectedArtifactSha256: string
  readonly artifactBytes: Uint8Array
  readonly lifetimeMs?: number
}

export interface ICloudPatchUploadResult {
  readonly shareId: string
  readonly shareSecret: string
  readonly shareUrl: string
  readonly expiresAtMs: number
}

export interface ICloudPatchFetchResult {
  readonly shareId: string
  readonly artifactBytes: Uint8Array
}

export type CloudPatchServerErrorCode =
  | 'network-failure'
  | 'unauthorized'
  | 'not-configured'
  | 'server-error'
  | 'invalid-response'

export class CloudPatchServerError extends Error {
  public readonly name = 'CloudPatchServerError'
  public constructor(
    public readonly code: CloudPatchServerErrorCode,
    public readonly serverErrorCode?: string
  ) {
    super(`Cloud Patch server request failed: ${code}`)
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function fromBase64Url(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64url'))
}

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new CloudPatchServerError('invalid-response')
  }
}

function serverErrorCodeOf(body: unknown): string | undefined {
  return typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : undefined
}

function throwForStatus(status: number, body: unknown): never {
  if (status === 401) {
    throw new CloudPatchServerError('unauthorized', serverErrorCodeOf(body))
  }
  if (status === 404) {
    throw new CloudPatchServerError('not-configured', serverErrorCodeOf(body))
  }
  throw new CloudPatchServerError('server-error', serverErrorCodeOf(body))
}

/** Upload an already-built, already-reviewed Cloud Patch artifact and mint a share link. */
export async function uploadCloudPatch(
  config: ICloudPatchServerConfig,
  request: ICloudPatchUploadRequest,
  fetchImplementation: typeof fetch = fetch
): Promise<ICloudPatchUploadResult> {
  let response: Response
  try {
    response = await fetchImplementation(`${config.origin}/v1/patches`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.deviceToken}`,
      },
      body: JSON.stringify({
        recipientDeviceIds: request.recipientDeviceIds,
        expectedArtifactSha256: request.expectedArtifactSha256,
        artifactBase64: toBase64Url(request.artifactBytes),
        ...(request.lifetimeMs === undefined
          ? {}
          : { lifetimeMs: request.lifetimeMs }),
      }),
    })
  } catch {
    throw new CloudPatchServerError('network-failure')
  }
  const body = await parseJsonBody(response)
  if (!response.ok) {
    throwForStatus(response.status, body)
  }
  const value = body as {
    shareId?: unknown
    shareSecret?: unknown
    shareUrl?: unknown
    expiresAtMs?: unknown
  }
  if (
    typeof value.shareId !== 'string' ||
    typeof value.shareSecret !== 'string' ||
    typeof value.shareUrl !== 'string' ||
    typeof value.expiresAtMs !== 'number'
  ) {
    throw new CloudPatchServerError('invalid-response')
  }
  return {
    shareId: value.shareId,
    shareSecret: value.shareSecret,
    shareUrl: value.shareUrl,
    expiresAtMs: value.expiresAtMs,
  }
}

/** Fetch a shared Cloud Patch's raw artifact bytes. Callers must still verify them (see `parseCloudPatchArtifact`/`verifyCloudPatchArtifact`). */
export async function fetchCloudPatch(
  config: ICloudPatchServerConfig,
  shareId: string,
  shareSecret: string,
  fetchImplementation: typeof fetch = fetch
): Promise<ICloudPatchFetchResult> {
  let response: Response
  try {
    response = await fetchImplementation(
      `${config.origin}/v1/patches/${encodeURIComponent(
        shareId
      )}?shareSecret=${encodeURIComponent(shareSecret)}`,
      {
        headers: { authorization: `Bearer ${config.deviceToken}` },
      }
    )
  } catch {
    throw new CloudPatchServerError('network-failure')
  }
  const body = await parseJsonBody(response)
  if (!response.ok) {
    throwForStatus(response.status, body)
  }
  const value = body as { shareId?: unknown; artifactBase64?: unknown }
  if (
    typeof value.shareId !== 'string' ||
    typeof value.artifactBase64 !== 'string'
  ) {
    throw new CloudPatchServerError('invalid-response')
  }
  return {
    shareId: value.shareId,
    artifactBytes: fromBase64Url(value.artifactBase64),
  }
}

/** Revoke a share early so the link stops working before it expires. */
export async function revokeCloudPatch(
  config: ICloudPatchServerConfig,
  shareId: string,
  fetchImplementation: typeof fetch = fetch
): Promise<void> {
  let response: Response
  try {
    response = await fetchImplementation(
      `${config.origin}/v1/patches/${encodeURIComponent(shareId)}/revoke`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.deviceToken}`,
        },
        body: '{}',
      }
    )
  } catch {
    throw new CloudPatchServerError('network-failure')
  }
  if (!response.ok) {
    throwForStatus(response.status, await parseJsonBody(response))
  }
}

/**
 * Parse a `shareUrl`/pasted link of the shape produced by `uploadCloudPatch`
 * (`.../patches/<shareId>#<shareSecret>`) back into its parts. Returns `null`
 * for anything that isn't recognizably that shape — callers should treat a
 * `null` result as "not a Cloud Patch link" rather than throwing.
 */
export function parseCloudPatchShareLink(
  link: string
): { readonly shareId: string; readonly shareSecret: string } | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  const match = /^\/patches\/(cp_[a-f0-9]{64})$/.exec(url.pathname)
  const shareSecret = url.hash.startsWith('#') ? url.hash.slice(1) : ''
  if (match === null || !/^cps_[A-Za-z0-9_-]{43}$/.test(shareSecret)) {
    return null
  }
  return { shareId: match[1], shareSecret }
}
