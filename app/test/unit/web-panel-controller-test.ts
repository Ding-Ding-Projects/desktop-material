import assert from 'node:assert'
import { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as Path from 'node:path'
import { describe, it } from 'node:test'

import {
  WebPanelController,
  WebPanelCredentialService,
} from '../../src/main-process/web-panel-controller'
import { WebPanelServer } from '../../src/main-process/web-panel-server'

const Webhook =
  'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF'

class FakeTunnel extends EventEmitter {
  public readonly stdout = new EventEmitter()
  public readonly stderr = new EventEmitter()
  public killed = false
  public kill() {
    this.killed = true
    return true
  }
}

async function setup() {
  const root = await mkdtemp(Path.join(tmpdir(), 'panel-controller-'))
  const vaultValues = new Map<string, string>()
  const vault = {
    getPassword: async (service: string, account: string) =>
      vaultValues.get(`${service}/${account}`) ?? null,
    setPassword: async (service: string, account: string, value: string) => {
      vaultValues.set(`${service}/${account}`, value)
    },
    deletePassword: async (service: string, account: string) =>
      vaultValues.delete(`${service}/${account}`),
  }
  const sent = new Array<{ url: string; method: string; content: string }>()
  let nextStatus = 200
  const fetch = async (url: string, init: { method: string; body: string }) => {
    sent.push({
      url,
      method: init.method,
      content: JSON.parse(init.body).content,
    })
    const status = nextStatus
    return { status, json: async () => ({ id: '998877665544332211' }) }
  }
  const tunnels = new Array<{
    tunnel: FakeTunnel
    args: ReadonlyArray<string>
  }>()
  const panel = new WebPanelServer(
    {
      list: async () => [],
      start: async () => null,
      stop: async () => {},
      command: async () => false,
      console: () => ({ next: 0, lines: [], status: 'stopped' }),
      players: () => [],
      settings: async () => [],
      setSetting: async () => null,
      backups: async () => [],
      backup: async () => null,
      addOns: async () => [],
    },
    root
  )
  const controller = new WebPanelController(
    panel,
    root,
    vault,
    fetch,
    (command, args) => {
      assert.equal(command, 'cloudflared')
      const tunnel = new FakeTunnel()
      tunnels.push({ tunnel, args })
      return tunnel as unknown as ChildProcess
    },
    () => 5000
  )
  const settle = async () => {
    await new Promise(resolve => setImmediate(resolve))
    await (controller as any).queue
  }
  return {
    root,
    vaultValues,
    sent,
    tunnels,
    controller,
    settle,
    failNext: (status: number) => {
      nextStatus = status
    },
  }
}

describe('WebPanelController', () => {
  it('needs the panel before the public link and reports a busy port', async () => {
    const { controller } = await setup()
    assert.equal(await controller.startTunnel(), 'Turn the panel on first.')
    assert.equal(await controller.startPanel(0), null)
    const port = (await controller.status()).port
    assert.equal(typeof port, 'number')

    const other = await setup()
    assert.match(
      (await other.controller.startPanel(port!)) ?? '',
      /already in use/
    )
    await controller.stopPanel()
    assert.equal((await controller.status()).port, null)
  })

  it('keeps the webhook only in the vault', async () => {
    const { root, vaultValues, controller } = await setup()
    assert.equal(
      await controller.setWebhook('https://example.com/hook'),
      'That is not a Discord webhook address.'
    )
    assert.equal((await controller.status()).webhookSet, false)

    assert.equal(await controller.setWebhook(` ${Webhook} `), null)
    assert.equal(
      vaultValues.get(`${WebPanelCredentialService}/discord-webhook`),
      Webhook
    )
    const status = await controller.status()
    assert.equal(status.webhookSet, true)
    assert.equal(JSON.stringify(status).includes('abcdefghij'), false)
    for (const file of await readdir(root)) {
      const text = await readFile(Path.join(root, file), 'utf8')
      assert.equal(text.includes('abcdefghij'), false)
    }

    assert.equal(await controller.setWebhook(''), null)
    assert.equal((await controller.status()).webhookSet, false)
  })

  it('sends the link, edits it when the link changes, and says when it is offline', async () => {
    const { sent, tunnels, controller, settle } = await setup()
    await controller.setWebhook(Webhook)
    await controller.startPanel(0)
    assert.equal(await controller.startTunnel(), null)
    assert.deepEqual(tunnels[0].args.slice(0, 2), ['tunnel', '--no-autoupdate'])
    assert.equal((await controller.status()).tunnel.kind, 'starting')

    tunnels[0].tunnel.stderr.emit(
      'data',
      'INF |  https://calm-river-one.trycloudflare.com  |'
    )
    await settle()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].method, 'POST')
    assert.match(sent[0].content, /calm-river-one\.trycloudflare\.com/)
    assert.match(sent[0].content, /Ask the host/)
    assert.equal((await controller.status()).webhookSentAt, 5000)

    tunnels[0].tunnel.stderr.emit('data', 'unrelated output')
    await settle()
    assert.equal(sent.length, 1)

    tunnels[0].tunnel.stderr.emit(
      'data',
      'https://bold-lake-two.trycloudflare.com'
    )
    await settle()
    assert.equal(sent.length, 2)
    assert.equal(sent[1].method, 'PATCH')
    assert.match(sent[1].url, /\/messages\/998877665544332211$/)

    await controller.stopTunnel()
    assert.equal(tunnels[0].tunnel.killed, true)
    assert.equal(sent.length, 3)
    assert.match(sent[2].content, /offline/)
    await controller.stopPanel()
  })

  it('sends a fresh one-time code with the link when asked to', async () => {
    const { sent, tunnels, controller, settle } = await setup()
    await controller.setWebhook(Webhook)
    await controller.setOptions({
      sendPairingCode: true,
      replacePrevious: false,
    })
    await controller.startPanel(0)
    await controller.startTunnel()
    tunnels[0].tunnel.stderr.emit(
      'data',
      'https://calm-river-one.trycloudflare.com'
    )
    await settle()
    const first = /Pairing code: (\S{4}-\S{4})/.exec(sent[0].content)?.[1]
    assert.ok(first)

    assert.equal(await controller.sendNow(), null)
    const second = /Pairing code: (\S{4}-\S{4})/.exec(sent[1].content)?.[1]
    assert.ok(second)
    assert.notEqual(first, second)
    assert.equal(sent[1].method, 'POST')
    await controller.stopPanel()
  })

  it('reports a failed delivery without the address and retries on Send now', async () => {
    const { sent, tunnels, controller, settle, failNext } = await setup()
    assert.equal(await controller.sendNow(), 'Add a Discord webhook first.')
    await controller.setWebhook(Webhook)
    await controller.startPanel(0)
    await controller.startTunnel()
    failNext(500)
    tunnels[0].tunnel.stderr.emit(
      'data',
      'https://calm-river-one.trycloudflare.com'
    )
    await settle()
    const error = (await controller.status()).webhookError ?? ''
    assert.notEqual(error, '')
    assert.equal(error.includes('discord.com'), false)

    failNext(200)
    assert.equal(await controller.sendNow(), null)
    assert.equal(sent.length, 2)
    assert.equal((await controller.status()).webhookError, null)
    await controller.stopPanel()
  })

  it('marks the link as failed when the helper exits', async () => {
    const { tunnels, controller } = await setup()
    await controller.startPanel(0)
    await controller.startTunnel()
    tunnels[0].tunnel.emit('exit', 1)
    const status = await controller.status()
    assert.equal(status.tunnel.kind, 'failed')
    assert.equal(await controller.startTunnel(), null)
    assert.equal(tunnels.length, 2)
    await controller.stopPanel()
  })
})
