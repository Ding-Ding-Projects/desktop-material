import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

mock.module('../../../src/lib/ipc-renderer', {
  namedExports: {
    on: () => undefined,
    removeListener: () => undefined,
    invoke: async (channel: string) => {
      if (channel === 'get-self-hosted-server-status') {
        return {
          supported: true,
          configured: false,
          publicOrigin: null,
          serverId: null,
          running: false,
        }
      }
      if (channel === 'provision-self-hosted-server') {
        return {
          ok: true as const,
          result: {
            serverId: 'server-1',
            publicOrigin: 'https://localhost:8787',
            joinUrl: 'https://localhost:8787/join#opaque-test-value',
          },
        }
      }
      if (channel === 'cancel-self-hosted-server-provisioning') {
        return undefined
      }
      throw new Error(`Unexpected IPC channel ${channel}`)
    },
  },
})

async function getComponent() {
  return (await import('../../../src/ui/preferences/self-hosted-server'))
    .SelfHostedServerPreferences
}

describe('self-hosted server settings explanations', () => {
  it('covers the origin, metadata, and generated join-link states', async () => {
    const SelfHostedServerPreferences = await getComponent()
    const view = render(
      <SelfHostedServerPreferences dispatcher={{} as Dispatcher} />
    )

    await screen.findByLabelText(
      'Public HTTPS address (or https://localhost:PORT for local-only)'
    )
    assert.ok(
      view.container.querySelector(
        '[data-setting-explanation-id="self-hosted-server-public-origin"]'
      )
    )
    assert.ok(
      view.container.querySelector(
        '[data-setting-explanation-id="self-hosted-server-saml-metadata"]'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set up server' }))
    await waitFor(() => assert.ok(screen.getByLabelText('Join URL')))
    const join = view.container.querySelector(
      '[data-setting-explanation-id="self-hosted-server-join-url"]'
    )
    assert.ok(join)
    assert.equal(join.getAttribute('data-setting-provenance'), 'runtime-only')
    assert.doesNotMatch(
      join.querySelector('.setting-explanation__provenance')?.textContent ?? '',
      /opaque-test-value/
    )
  })
})
