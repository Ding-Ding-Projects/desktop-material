import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { render } from '../../helpers/ui/render'

let resolveRoster: ((members: ReadonlyArray<never>) => void) | undefined
let resolveRosterStarted: (() => void) | undefined

mock.module('../../../src/lib/self-hosted-server/team-connection', {
  namedExports: {
    getTeamConnection: async () => ({
      publicOrigin: 'https://team.example.com',
      serverId: 'server-1',
      deviceId: 'device-1',
      deviceName: 'Test device',
      deviceToken: 'd'.repeat(43),
    }),
  },
})

mock.module('../../../src/lib/self-hosted-server/team-client', {
  namedExports: {
    TeamHeartbeatIntervalMs: 60_000,
    fetchTeamMembers: () => {
      resolveRosterStarted?.()
      return new Promise<ReadonlyArray<never>>(resolve => {
        resolveRoster = resolve
      })
    },
    sendTeamHeartbeat: async () => undefined,
  },
})

describe('useTeamPresence lifecycle', () => {
  it('does not install timers after unmount during the first roster request', async () => {
    const { useTeamPresence } = await import(
      '../../../src/ui/launchpad/use-team-presence'
    )
    const rosterStarted = new Promise<void>(resolve => {
      resolveRosterStarted = resolve
    })

    function Probe() {
      useTeamPresence()
      return null
    }

    const setIntervalMock = mock.method(globalThis, 'setInterval')
    const view = render(<Probe />)
    await rosterStarted

    view.unmount()
    resolveRoster?.([])
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    assert.equal(setIntervalMock.mock.calls.length, 0)
    setIntervalMock.mock.restore()
    resolveRoster = undefined
    resolveRosterStarted = undefined
  })
})
