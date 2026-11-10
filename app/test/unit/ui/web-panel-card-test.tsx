import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  DefaultWebPanelOptions,
  IWebPanelStatus,
} from '../../../src/lib/web-panel/status'
import {
  IWebPanelClient,
  WebPanelCard,
} from '../../../src/ui/repository-tools/web-panel-card'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function fake(initial: Partial<IWebPanelStatus> = {}) {
  let status: IWebPanelStatus = {
    port: null,
    tunnel: { kind: 'stopped' },
    webhookSet: false,
    options: DefaultWebPanelOptions,
    webhookError: null,
    webhookSentAt: null,
    devices: [],
    activity: [],
    ...initial,
  }
  const calls = new Array<string>()
  const copied = new Array<string>()
  const client: IWebPanelClient = {
    status: async () => status,
    start: async () => {
      calls.push('start')
      status = { ...status, port: 25580 }
      return null
    },
    stop: async () => {
      calls.push('stop')
      status = { ...status, port: null, tunnel: { kind: 'stopped' } }
    },
    startTunnel: async () => {
      calls.push('tunnel')
      status = {
        ...status,
        tunnel: {
          kind: 'running',
          url: 'https://calm-river.trycloudflare.com',
        },
      }
      return null
    },
    stopTunnel: async () => {
      calls.push('stop-tunnel')
      status = { ...status, tunnel: { kind: 'stopped' } }
    },
    setWebhook: async address => {
      calls.push(`webhook:${address.length > 0 ? 'set' : 'clear'}`)
      if (address.length > 0 && !address.startsWith('https://discord.com/')) {
        return 'That is not a Discord webhook address.'
      }
      status = { ...status, webhookSet: address.length > 0 }
      return null
    },
    setOptions: async options => {
      calls.push(`options:${JSON.stringify(options)}`)
      status = { ...status, options }
    },
    newCode: async () => {
      calls.push('code')
      return 'ABCD-EFGH'
    },
    revoke: async id => {
      calls.push(`revoke:${id}`)
      status = {
        ...status,
        devices: id === null ? [] : status.devices.filter(d => d.id !== id),
      }
    },
    sendNow: async () => {
      calls.push('send')
      return null
    },
  }
  const view = (
    <WebPanelCard
      client={client}
      schedule={() => () => {}}
      copyText={text => copied.push(text)}
    />
  )
  return { view, calls, copied }
}

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('WebPanelCard', () => {
  it('starts the public link with one click, turning the panel on first', async () => {
    const { view, calls, copied } = fake()
    render(view)
    await screen.findByText('Off')
    press('Start free public link')
    await screen.findByText('https://calm-river.trycloudflare.com')
    assert.deepEqual(calls, ['start', 'tunnel'])
    screen.getByText('http://127.0.0.1:25580')
    screen.getByText(/new random address every time/)

    press('Copy public link')
    assert.deepEqual(copied, ['https://calm-river.trycloudflare.com'])

    press('Stop public link')
    await screen.findByRole('button', { name: 'Start free public link' })
    press('Turn off')
    await screen.findByText('Off')
    assert.deepEqual(calls, ['start', 'tunnel', 'stop-tunnel', 'stop'])
  })

  it('shows a pairing code and removes paired devices', async () => {
    const { view, calls } = fake({
      port: 25580,
      devices: [{ id: 'd1', label: 'Phone', pairedAt: 1, expiresAt: 2 }],
    })
    render(view)
    await screen.findByText(/Phone/)
    press('New pairing code')
    await screen.findByText('ABCD-EFGH')
    screen.getByText('Works once, for 10 minutes.')

    press('Remove Phone')
    await screen.findByText('No devices are paired.')
    assert.deepEqual(calls, ['code', 'revoke:d1'])
  })

  it('saves the webhook without showing it and warns about sent codes', async () => {
    const { view, calls } = fake()
    render(view)
    const field = (await screen.findByLabelText(
      'Discord webhook address'
    )) as HTMLInputElement
    assert.equal(field.type, 'password')

    fireEvent.change(field, { target: { value: 'https://example.com/x' } })
    press('Save webhook')
    await screen.findByText('That is not a Discord webhook address.')

    fireEvent.change(field, {
      target: { value: 'https://discord.com/api/webhooks/1/secretsecret' },
    })
    press('Save webhook')
    await screen.findByText(/saved in the system vault\. The link is sent/)
    assert.equal(document.body.textContent?.includes('secretsecret'), false)

    fireEvent.click(
      screen.getByLabelText('Send a one-time pairing code with the link')
    )
    await screen.findByText(
      /Anyone who can read that channel can pair a device/
    )

    press('Send now')
    await screen.findByText('Sent to Discord.')
    press('Remove webhook')
    await screen.findByLabelText('Discord webhook address')
    assert.deepEqual(
      calls.filter(c => !c.startsWith('options')),
      ['webhook:set', 'webhook:set', 'send', 'webhook:clear']
    )
    await waitFor(() =>
      assert.equal(
        calls.some(c => c.includes('"sendPairingCode":true')),
        true
      )
    )
  })

  it('shows why the link failed and why Discord did not get it', async () => {
    const { view } = fake({
      port: 25580,
      tunnel: {
        kind: 'failed',
        reason: 'The tunnel helper could not be started.',
      },
      webhookSet: true,
      webhookError:
        'Discord asked to slow down. The link will be sent again shortly.',
    })
    render(view)
    await screen.findByText('The tunnel helper could not be started.')
    screen.getByText(/Discord asked to slow down/)
  })
})
