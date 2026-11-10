import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  EmptyPanelAnnouncerState,
  IPanelAnnouncerOptions,
  WebhookFetch,
  announcePanel,
  buildPanelMessage,
  isDiscordWebhookUrl,
  planPanelAnnouncement,
} from '../../src/lib/web-panel/discord-webhook'
import {
  QuickTunnelState,
  parseQuickTunnelUrl,
  quickTunnelArguments,
  quickTunnelUrl,
  reduceQuickTunnel,
} from '../../src/lib/web-panel/quick-tunnel'

const hook =
  'https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklMNOpqrstuvwxyz0123456789'
const options: IPanelAnnouncerOptions = {
  resendOnChange: true,
  replacePrevious: true,
  announceOffline: true,
}
const link = (name: string) => ({
  url: `https://${name}.trycloudflare.com`,
  pairingCode: '482 913',
})

function fakeDiscord(statuses: ReadonlyArray<number>) {
  const calls = new Array<{ url: string; method: string; body: string }>()
  const fetch: WebhookFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    return {
      status,
      json: async () => ({ id: `90000000000000000${calls.length}` }),
    }
  }
  return { calls, fetch }
}

describe('quick tunnel', () => {
  it('finds the public address in the helper output', () => {
    assert.equal(
      parseQuickTunnelUrl(
        '2026-11-09T20:02:11Z INF |  https://Amber-Otter-Signal-Maple.trycloudflare.com  |'
      ),
      'https://amber-otter-signal-maple.trycloudflare.com'
    )
    assert.equal(parseQuickTunnelUrl('INF Starting tunnel'), null)
    assert.equal(
      parseQuickTunnelUrl('https://evil.example/trycloudflare.com'),
      null
    )
  })

  it('always tunnels to this computer and rejects a bad port', () => {
    assert.deepEqual(quickTunnelArguments(8443), [
      'tunnel',
      '--no-autoupdate',
      '--url',
      'http://127.0.0.1:8443',
    ])
    assert.throws(() => quickTunnelArguments(0))
    assert.throws(() => quickTunnelArguments(8443.5))
  })

  it('moves from starting to running, follows a new link and reports a close', () => {
    let state: QuickTunnelState = { kind: 'stopped' }
    state = reduceQuickTunnel(state, { kind: 'start' })
    assert.deepEqual(state, { kind: 'starting' })
    state = reduceQuickTunnel(state, { kind: 'output', text: 'INF connecting' })
    assert.equal(quickTunnelUrl(state), null)
    state = reduceQuickTunnel(state, {
      kind: 'output',
      text: 'https://quiet-harbor.trycloudflare.com',
    })
    assert.equal(
      quickTunnelUrl(state),
      'https://quiet-harbor.trycloudflare.com'
    )
    state = reduceQuickTunnel(state, { kind: 'exit', code: 1 })
    assert.equal(state.kind, 'failed')
    assert.equal(quickTunnelUrl(state), null)

    assert.deepEqual(
      reduceQuickTunnel({ kind: 'starting' }, { kind: 'exit', code: null }),
      { kind: 'failed', reason: 'The tunnel helper could not be started.' }
    )
    assert.deepEqual(
      reduceQuickTunnel({ kind: 'stopped' }, { kind: 'exit', code: 0 }),
      { kind: 'stopped' }
    )
  })
})

describe('Discord webhook for the panel link', () => {
  it('accepts only a real webhook address', () => {
    assert.equal(isDiscordWebhookUrl(hook), true)
    assert.equal(isDiscordWebhookUrl(` ${hook} `), true)
    for (const bad of [
      hook.replace('https', 'http'),
      hook.replace('discord.com', 'discord.com.evil.example'),
      `${hook}?wait=true`,
      'https://discord.com/api/webhooks/1/short',
      'not a url',
    ]) {
      assert.equal(isDiscordWebhookUrl(bad), false, bad)
    }
  })

  it('writes the message with the link and code and no mentions', () => {
    const message = buildPanelMessage(link('amber-otter'))
    assert.match(message.content, /https:\/\/amber-otter\.trycloudflare\.com/)
    assert.match(message.content, /Pairing code: 482 913/)
    assert.deepEqual(message.allowed_mentions, { parse: [] })
    assert.doesNotMatch(
      buildPanelMessage({ url: link('a').url, pairingCode: null }).content,
      /Pairing code:/
    )
    assert.equal(
      buildPanelMessage({ url: null, pairingCode: null }).content,
      'The Minecraft panel is offline.'
    )
  })

  it('posts the first link, then edits that message when the link changes', async () => {
    const discord = fakeDiscord([200])
    const first = await announcePanel(
      hook,
      EmptyPanelAnnouncerState,
      link('one'),
      options,
      discord.fetch
    )
    assert.ok(first.ok)
    assert.equal(first.action, 'post')
    assert.equal(discord.calls[0].url, `${hook}?wait=true`)

    const same = await announcePanel(
      hook,
      first.state,
      link('one'),
      options,
      discord.fetch
    )
    assert.ok(same.ok)
    assert.equal(same.action, 'none')
    assert.equal(discord.calls.length, 1)

    const changed = await announcePanel(
      hook,
      first.state,
      link('two'),
      options,
      discord.fetch
    )
    assert.ok(changed.ok)
    assert.equal(changed.action, 'edit')
    assert.equal(discord.calls[1].method, 'PATCH')
    assert.equal(
      discord.calls[1].url,
      `${hook}/messages/${first.state.messageId}`
    )
    assert.deepEqual(changed.state.last, link('two'))
  })

  it('honours the switches and the Send now button', () => {
    const sent = { last: link('one'), messageId: '900000000000000001' }
    assert.equal(
      planPanelAnnouncement(sent, link('two'), {
        ...options,
        resendOnChange: false,
      }),
      'none'
    )
    assert.equal(
      planPanelAnnouncement(sent, link('two'), {
        ...options,
        replacePrevious: false,
      }),
      'post'
    )
    assert.equal(
      planPanelAnnouncement(
        sent,
        { url: null, pairingCode: null },
        { ...options, announceOffline: false }
      ),
      'none'
    )
    assert.equal(
      planPanelAnnouncement(sent, link('one'), options, true),
      'edit'
    )
  })

  it('posts again when the earlier message was deleted in Discord', async () => {
    const discord = fakeDiscord([404, 200])
    const result = await announcePanel(
      hook,
      { last: link('one'), messageId: '900000000000000009' },
      link('two'),
      options,
      discord.fetch
    )
    assert.ok(result.ok)
    assert.equal(result.action, 'post')
    assert.deepEqual(
      discord.calls.map(c => c.method),
      ['PATCH', 'POST']
    )
  })

  it('keeps the old state on failure and never leaks the webhook address', async () => {
    const before = { last: link('one'), messageId: '900000000000000001' }
    for (const fetch of [
      fakeDiscord([429]).fetch,
      fakeDiscord([500]).fetch,
      (async () => {
        throw new Error(`getaddrinfo failed for ${hook}`)
      }) as WebhookFetch,
    ]) {
      const result = await announcePanel(
        hook,
        before,
        link('two'),
        options,
        fetch
      )
      assert.ok(!result.ok)
      assert.deepEqual(result.state, before)
      assert.doesNotMatch(result.error, /webhooks|abcDEF/)
    }
    const invalid = await announcePanel(
      'https://example.com/hook',
      before,
      link('two'),
      options,
      fakeDiscord([200]).fetch
    )
    assert.ok(!invalid.ok)
  })
})
