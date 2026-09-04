import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { LanguageModeStorageKey } from '../../../src/lib/language-preference'
import {
  IStatusHubOwnerConfiguration,
  IStatusHubOwnerConfigurationUpdate,
} from '../../../src/models/status-hub'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let configuration: IStatusHubOwnerConfiguration = {
  endpoint: null,
  authorizationPresent: false,
}
let savedUpdate: IStatusHubOwnerConfigurationUpdate | null = null

mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    getStatusHubConfiguration: async () => configuration,
    setStatusHubConfiguration: async (
      update: IStatusHubOwnerConfigurationUpdate
    ) => {
      savedUpdate = update
      configuration = {
        endpoint: update.endpoint,
        authorizationPresent:
          update.authorization !== undefined ||
          configuration.authorizationPresent,
      }
      return configuration
    },
    clearStatusHubAuthorization: async () => {
      configuration = { ...configuration, authorizationPresent: false }
      return configuration
    },
    getStatusHubStatus: async () => ({
      connection: 'connected' as const,
      stableURL: configuration.endpoint,
      message: 'Status Hub is available through the main-process boundary.',
      lastUpdatedAt: 10,
    }),
  },
})

async function getComponent() {
  return (await import('../../../src/ui/preferences/status-hub-owner-settings'))
    .StatusHubOwnerSettings
}

afterEach(() => {
  configuration = { endpoint: null, authorizationPresent: false }
  savedUpdate = null
  localStorage.removeItem(LanguageModeStorageKey)
})

describe('Status Hub owner settings', () => {
  it('loads credential-free state and never renders a stored value', async () => {
    configuration = {
      endpoint: 'https://status.example.test/',
      authorizationPresent: true,
    }
    const StatusHubOwnerSettings = await getComponent()
    const view = render(<StatusHubOwnerSettings />)

    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('HTTPS endpoint') as HTMLInputElement).value,
        'https://status.example.test/'
      )
    )
    assert.equal(
      (screen.getByLabelText('Replace authorization') as HTMLInputElement)
        .value,
      ''
    )
    assert.match(view.container.textContent ?? '', /credential vault/)
    assert.doesNotMatch(view.container.textContent ?? '', /stored-secret/)
    assert.ok(
      screen.getByText(
        'A choice is stored in application data. Current value: https://status.example.test/. Shipped value: not configured.'
      )
    )
    assert.ok(
      screen.getByText(
        'A value is stored in the operating-system credential vault. The value is never read back into this field. Shipped value: none.'
      )
    )
    assert.equal(
      screen.getByLabelText('HTTPS endpoint').getAttribute('aria-describedby'),
      'status-hub-endpoint-setting-explanation status-hub-endpoint-setting-provenance'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    await waitFor(() =>
      assert.match(
        screen.getByRole('status').textContent ?? '',
        /Status Hub is available through the main-process boundary\./
      )
    )
    const status = screen.getByRole('status')
    const actions = screen
      .getByRole('button', { name: 'Save Status Hub settings' })
      .closest('.status-hub-owner-actions')
    assert.ok(actions)
    assert.equal(
      Boolean(
        status.compareDocumentPosition(actions) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ),
      true,
      'the connection result must render before the action row and fixed footer'
    )
  })

  it('saves a replacement without leaving it in the rendered field', async () => {
    const StatusHubOwnerSettings = await getComponent()
    const view = render(<StatusHubOwnerSettings />)
    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('HTTPS endpoint') as HTMLInputElement).disabled,
        false
      )
    )

    assert.ok(
      screen.getByText(
        'No choice is stored in application data. Current and shipped value: not configured.'
      )
    )

    fireEvent.change(screen.getByLabelText('HTTPS endpoint'), {
      target: { value: 'https://status.example.test/' },
    })
    fireEvent.change(screen.getByLabelText('Replace authorization'), {
      target: { value: 'new-authorization-value' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Status Hub settings' })
    )

    await waitFor(() => assert.ok(savedUpdate))
    assert.deepEqual(savedUpdate, {
      endpoint: 'https://status.example.test/',
      authorization: 'new-authorization-value',
    })
    assert.equal(
      (screen.getByLabelText('Replace authorization') as HTMLInputElement)
        .value,
      ''
    )
    assert.doesNotMatch(
      view.container.textContent ?? '',
      /new-authorization-value/
    )
  })

  it('clears vault state and renders bilingual controls', async () => {
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    configuration = {
      endpoint: 'https://status.example.test/',
      authorizationPresent: true,
    }
    const StatusHubOwnerSettings = await getComponent()
    render(<StatusHubOwnerSettings />)

    const clear = await screen.findByRole('button', {
      name: 'Clear stored authorization · 清除已儲存授權資料',
    })
    fireEvent.click(clear)

    await waitFor(() =>
      assert.match(
        screen.getByRole('status').textContent ?? '',
        /Stored Status Hub authorization cleared\. · 已清除 Status Hub 授權資料。/
      )
    )
    assert.equal(configuration.authorizationPresent, false)
  })
})
