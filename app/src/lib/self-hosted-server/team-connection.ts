/**
 * The renderer's record of "this device is joined to a self-hosted server as
 * a team-collaboration client." This is deliberately separate from the R1
 * provisioning wizard's admin bootstrap: provisioning creates the server and
 * an *admin* credential, but running the R13 team surfaces requires this
 * device to hold an ordinary device token, obtained the same way any other
 * teammate's device would (`POST /v1/join`) or by resolving a shared-workspace
 * deep link against a server the user already trusts.
 *
 * Everything here is a pure, testable read/write over `localStorage` plus the
 * OS-backed `TokenStore`. Nothing here fabricates a connection: if any part of
 * the record is missing, `getTeamConnection` returns `null`, and callers must
 * treat that as "no server configured" — the single-player degrade required
 * by #130.
 */

import { TokenStore } from '../stores/token-store'

const OriginKey = 'self-hosted-server/team-connection/origin'
const ServerIdKey = 'self-hosted-server/team-connection/server-id'
const DeviceIdKey = 'self-hosted-server/team-connection/device-id'
const DeviceNameKey = 'self-hosted-server/team-connection/device-name'
const TokenStoreKey = 'desktop-material.self-hosted-server.device-token'

export interface ITeamConnection {
  readonly publicOrigin: string
  readonly serverId: string
  readonly deviceId: string
  readonly deviceName: string
  readonly deviceToken: string
}

/**
 * Reads the persisted connection, if any. Returns `null` when no server is
 * configured for this device — the caller must not render team surfaces.
 */
export async function getTeamConnection(): Promise<ITeamConnection | null> {
  const publicOrigin = localStorage.getItem(OriginKey)
  const serverId = localStorage.getItem(ServerIdKey)
  const deviceId = localStorage.getItem(DeviceIdKey)
  const deviceName = localStorage.getItem(DeviceNameKey)
  if (
    publicOrigin === null ||
    serverId === null ||
    deviceId === null ||
    deviceName === null
  ) {
    return null
  }
  const deviceToken = await TokenStore.getItem(TokenStoreKey, serverId)
  if (deviceToken === null) {
    return null
  }
  return { publicOrigin, serverId, deviceId, deviceName, deviceToken }
}

export async function setTeamConnection(
  connection: ITeamConnection
): Promise<void> {
  await TokenStore.setItem(
    TokenStoreKey,
    connection.serverId,
    connection.deviceToken
  )
  localStorage.setItem(OriginKey, connection.publicOrigin)
  localStorage.setItem(ServerIdKey, connection.serverId)
  localStorage.setItem(DeviceIdKey, connection.deviceId)
  localStorage.setItem(DeviceNameKey, connection.deviceName)
}

export function clearTeamConnection(): void {
  localStorage.removeItem(OriginKey)
  localStorage.removeItem(ServerIdKey)
  localStorage.removeItem(DeviceIdKey)
  localStorage.removeItem(DeviceNameKey)
}
