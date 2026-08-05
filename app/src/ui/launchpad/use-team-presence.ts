import * as React from 'react'

import {
  fetchTeamMembers,
  ITeamMember,
  sendTeamHeartbeat,
  TeamHeartbeatIntervalMs,
} from '../../lib/self-hosted-server/team-client'
import { getTeamConnection } from '../../lib/self-hosted-server/team-connection'

const RosterPollIntervalMs = 15 * 1000

export interface IUseTeamPresenceResult {
  /**
   * `undefined` while the connection lookup is still in flight, `null` when
   * no self-hosted server is configured for this device (the honest
   * single-player degrade — callers must not render team surfaces), and an
   * array once a real `GET /v1/team/members` response has arrived. `[]` is a
   * real, empty roster, not a "no server" signal.
   */
  readonly members: ReadonlyArray<ITeamMember> | null | undefined
  readonly available: boolean
}

/**
 * Owns the side effects for the Team View / presence surfaces: reads the
 * persisted self-hosted server connection, sends a periodic heartbeat while
 * mounted, and polls the real team roster. Renders nothing itself; components
 * decide what "no server configured" (`available: false`) looks like.
 */
export function useTeamPresence(): IUseTeamPresenceResult {
  const [members, setMembers] = React.useState<
    ReadonlyArray<ITeamMember> | null | undefined
  >(undefined)
  const [available, setAvailable] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function start() {
      const connection = await getTeamConnection()
      if (cancelled) {
        return
      }
      if (connection === null) {
        setAvailable(false)
        setMembers(null)
        return
      }

      const options = {
        publicOrigin: connection.publicOrigin,
        deviceToken: connection.deviceToken,
      }

      // The connection is enough to expose the real Team View loading state;
      // the roster remains null until the first server response arrives.
      setAvailable(true)
      setMembers(null)

      const poll = async () => {
        try {
          const roster = await fetchTeamMembers(options)
          if (!cancelled) {
            setMembers(roster)
          }
        } catch {
          // A transient failure keeps the last known roster on screen rather
          // than flashing to an empty state; the surface simply stops
          // updating until the next successful poll.
        }
      }

      const heartbeat = async () => {
        try {
          await sendTeamHeartbeat(options, 'online', 'idle')
        } catch {
          // Best-effort: presence is advisory, never blocking.
        }
      }

      await heartbeat()
      await poll()
      heartbeatTimer = setInterval(
        () => void heartbeat(),
        TeamHeartbeatIntervalMs
      )
      pollTimer = setInterval(() => void poll(), RosterPollIntervalMs)
    }

    void start()

    return () => {
      cancelled = true
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer)
      }
      if (pollTimer !== null) {
        clearInterval(pollTimer)
      }
    }
  }, [])

  return { members, available }
}
