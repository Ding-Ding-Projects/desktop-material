import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { AgentSessionsPanel } from '../../../src/ui/agent-sessions/agent-sessions-panel'
import { IStatusHubStatus } from '../../../src/models/status-hub'
import { render, screen } from '../../helpers/ui/render'

const states: ReadonlyArray<{
  readonly connection: IStatusHubStatus['connection']
  readonly expected: RegExp
}> = [
  { connection: 'connected', expected: /Status Hub connected/i },
  {
    connection: 'authentication-unavailable',
    expected: /authentication is unavailable/i,
  },
  {
    connection: 'delivery-unconfirmed',
    expected: /delivery is not confirmed/i,
  },
  { connection: 'unavailable', expected: /local session state only/i },
]

describe('Status Hub panel state', () => {
  for (const state of states) {
    it(`renders ${state.connection} as an honest live status`, () => {
      render(
        <AgentSessionsPanel
          sessions={[]}
          availability={{
            codexInstalled: false,
            codexAuthenticated: false,
            opencodeInstalled: false,
            opencodeAuthenticated: false,
          }}
          baseBranches={['main']}
          defaultBaseBranch="main"
          existingBranchNames={['main']}
          selectedPath={null}
          onSelectSession={() => undefined}
          onCreateSession={() => true}
          isCreating={false}
          setupCommands={[]}
          setupCommandsAvailable={true}
          onSaveSetupCommands={() => true}
          canCancelCreate={false}
          onCancelCreate={() => undefined}
          retryableSetups={[]}
          statusHubStatus={{
            connection: state.connection,
            stableURL: null,
            message: 'Fixture',
            lastUpdatedAt: null,
          }}
        />
      )

      const status = screen.getByRole('status')
      assert.match(status.textContent ?? '', state.expected)
    })
  }
})
