/**
 * A thin, honest client for the team-collaboration endpoints exposed by the
 * user's own self-hosted server (`services/desktop-material-server`). Every
 * function here calls a real HTTP endpoint and validates the exact response
 * shape the server returns — there is no synthesized or placeholder data.
 *
 * All calls require a `publicOrigin` (the server the user configured during
 * provisioning, see `../self-hosted-server/provisioning`) and a `deviceToken`
 * (the credential the app received when it joined that server). Callers that
 * have neither must not render any team surface at all: that is the "honest
 * single-player degrade" this feature is required to preserve.
 */

export type TeamPresenceStatus = 'online' | 'away' | 'offline'

export type TeamPresenceActivity =
  | 'idle'
  | 'reviewing'
  | 'committing'
  | 'branching'
  | 'syncing'
  | null

export interface ITeamMember {
  readonly deviceId: string
  readonly deviceName: string
  readonly status: TeamPresenceStatus
  readonly activity: TeamPresenceActivity
  readonly updatedAt: string | null
}

export interface ISharedWorkspaceReference {
  readonly name: string
  readonly repositoryUrl: string
  readonly branch: string | null
  readonly createdAt?: string
}

export interface ISharedWorkspaceCreated extends ISharedWorkspaceReference {
  readonly shareToken: string
  readonly shareUrl: string
}

export class TeamClientError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message)
  }
}

interface ITeamClientOptions {
  readonly publicOrigin: string
  readonly deviceToken: string
  readonly fetch?: typeof fetch
}

async function call(
  options: ITeamClientOptions,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const doFetch = options.fetch ?? globalThis.fetch
  const response = await doFetch(`${options.publicOrigin}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      authorization: `Bearer ${options.deviceToken}`,
      ...init.headers,
    },
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body !== null &&
      typeof body === 'object' &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `request failed with status ${response.status}`
    throw new TeamClientError(response.status, message)
  }
  return body
}

function isValidStatus(value: unknown): value is TeamPresenceStatus {
  return value === 'online' || value === 'away' || value === 'offline'
}

function isValidActivity(value: unknown): value is TeamPresenceActivity {
  return (
    value === null ||
    value === 'idle' ||
    value === 'reviewing' ||
    value === 'committing' ||
    value === 'branching' ||
    value === 'syncing'
  )
}

function asTeamMember(value: unknown): ITeamMember | null {
  if (value === null || typeof value !== 'object') {
    return null
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.deviceId !== 'string' ||
    typeof candidate.deviceName !== 'string' ||
    !isValidStatus(candidate.status) ||
    !isValidActivity(candidate.activity) ||
    (candidate.updatedAt !== null && typeof candidate.updatedAt !== 'string')
  ) {
    return null
  }
  return {
    deviceId: candidate.deviceId,
    deviceName: candidate.deviceName,
    status: candidate.status,
    activity: candidate.activity,
    updatedAt: candidate.updatedAt as string | null,
  }
}

/**
 * POST /v1/team/heartbeat — announce this device's presence to the team.
 * Should be called periodically (see `HeartbeatIntervalMs`) while a
 * self-hosted server is configured, and stopped otherwise.
 */
export async function sendTeamHeartbeat(
  options: ITeamClientOptions,
  status: 'online' | 'away',
  activity: Exclude<TeamPresenceActivity, null> | null
): Promise<void> {
  await call(options, '/v1/team/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ status, activity }),
  })
}

/** GET /v1/team/members — the current team roster with live presence. */
export async function fetchTeamMembers(
  options: ITeamClientOptions
): Promise<ReadonlyArray<ITeamMember>> {
  const body = await call(options, '/v1/team/members')
  if (
    body === null ||
    typeof body !== 'object' ||
    !Array.isArray((body as { members?: unknown }).members)
  ) {
    throw new TeamClientError(502, 'Malformed team member response')
  }
  const members = (body as { members: unknown[] }).members
    .map(asTeamMember)
    .filter((member): member is ITeamMember => member !== null)
  return members
}

/** POST /v1/workspaces — register a shared workspace and mint a deep link. */
export async function createSharedWorkspace(
  options: ITeamClientOptions,
  request: {
    readonly name: string
    readonly repositoryUrl: string
    readonly branch: string | null
  }
): Promise<ISharedWorkspaceCreated> {
  const body = await call(options, '/v1/workspaces', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  if (
    body === null ||
    typeof body !== 'object' ||
    typeof (body as { name?: unknown }).name !== 'string' ||
    typeof (body as { repositoryUrl?: unknown }).repositoryUrl !== 'string' ||
    typeof (body as { shareToken?: unknown }).shareToken !== 'string' ||
    typeof (body as { shareUrl?: unknown }).shareUrl !== 'string'
  ) {
    throw new TeamClientError(502, 'Malformed shared-workspace response')
  }
  const result = body as {
    name: string
    repositoryUrl: string
    branch: string | null
    shareToken: string
    shareUrl: string
  }
  return result
}

/** GET /v1/workspaces/:token — resolve a shared-workspace deep link. */
export async function fetchSharedWorkspace(
  options: ITeamClientOptions,
  shareToken: string
): Promise<ISharedWorkspaceReference> {
  const body = await call(
    options,
    `/v1/workspaces/${encodeURIComponent(shareToken)}`
  )
  if (
    body === null ||
    typeof body !== 'object' ||
    typeof (body as { name?: unknown }).name !== 'string' ||
    typeof (body as { repositoryUrl?: unknown }).repositoryUrl !== 'string'
  ) {
    throw new TeamClientError(502, 'Malformed shared-workspace response')
  }
  return body as ISharedWorkspaceReference
}

/** How often the app should send a presence heartbeat while connected. */
export const TeamHeartbeatIntervalMs = 60 * 1000
