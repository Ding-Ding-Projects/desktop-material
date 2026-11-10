import assert from 'node:assert'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as Path from 'node:path'
import { describe, it } from 'node:test'

import { IMinecraftServerState } from '../../src/lib/minecraft/server'
import {
  IPanelServers,
  WebPanelServer,
} from '../../src/main-process/web-panel-server'

function fakeServers() {
  const calls = new Array<string>()
  let state: IMinecraftServerState = {
    server: {
      id: 'one',
      name: 'Survival',
      directory: 'D:\\Minecraft\\survival',
      jar: 'server.jar',
      javaPath: 'java',
      memoryMegabytes: 2048,
      port: 25565,
    },
    status: 'running',
    eulaAccepted: true,
    message: null,
  }
  const servers: IPanelServers = {
    list: async () => [state],
    start: async id => {
      calls.push(`start:${id}`)
      return state.status === 'running'
        ? 'That server is already running.'
        : null
    },
    stop: async id => {
      calls.push(`stop:${id}`)
      state = { ...state, status: 'stopped' }
    },
    command: async (id, command) => {
      calls.push(`command:${id}:${command}`)
      return state.status === 'running'
    },
    console: (_id, after) => ({
      next: 2,
      lines: ['one', 'two'].slice(after),
      status: state.status,
    }),
    players: () => ['Steve'],
  }
  return { servers, calls }
}

async function setup() {
  const root = await mkdtemp(Path.join(tmpdir(), 'panel-'))
  const { servers, calls } = fakeServers()
  let now = 1_000_000
  const panel = new WebPanelServer(servers, root, () => now)
  const port = await panel.start(0)
  const base = `http://127.0.0.1:${port}`
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    headers: Record<string, string> = { 'X-Panel-Request': '1' }
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...headers,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json().catch(() => null)) as any,
    }
  }
  const pair = async () => {
    const code = await panel.issueCode()
    const paired = await call('POST', '/api/pair', { code, label: 'Phone' })
    assert.equal(paired.status, 200)
    return (paired.headers.get('set-cookie') ?? '').split(';')[0]
  }
  return {
    root,
    panel,
    calls,
    base,
    call,
    pair,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('WebPanelServer', () => {
  it('serves the page with strict headers and nothing else without pairing', async () => {
    const { panel, base, call } = await setup()
    try {
      const page = await fetch(base + '/')
      assert.equal(page.status, 200)
      assert.match(await page.text(), /Pair this device/)
      assert.match(
        page.headers.get('content-security-policy') ?? '',
        /default-src 'none'/
      )
      assert.equal(page.headers.get('x-frame-options'), 'DENY')
      assert.equal(page.headers.get('cache-control'), 'no-store')
      assert.equal((await fetch(base + '/panel.js')).status, 200)
      assert.equal((await fetch(base + '/panel.css')).status, 200)

      assert.equal((await call('GET', '/api/state')).status, 401)
      assert.equal((await call('GET', '/api/console?id=one')).status, 401)
      assert.equal((await call('POST', '/api/stop', { id: 'one' })).status, 401)
      assert.equal((await call('GET', '/secrets')).status, 404)
    } finally {
      await panel.stop()
    }
  })

  it('pairs once per code and keeps only a digest of the session', async () => {
    const { root, panel, call } = await setup()
    try {
      const code = await panel.issueCode()
      assert.equal(
        (await call('POST', '/api/pair', { code: 'WRONG123' })).status,
        403
      )
      const paired = await call('POST', '/api/pair', { code, label: 'Phone' })
      assert.equal(paired.status, 200)
      const setCookie = paired.headers.get('set-cookie') ?? ''
      assert.match(setCookie, /HttpOnly; SameSite=Strict/)
      const token = setCookie.split(';')[0].split('=')[1]

      assert.equal((await call('POST', '/api/pair', { code })).status, 403)

      const saved = await readFile(
        Path.join(root, 'panel-devices.json'),
        'utf8'
      )
      assert.equal(saved.includes(token), false)
      assert.equal((await panel.devices())[0].label, 'Phone')
      assert.equal('tokenDigest' in (await panel.devices())[0], false)
    } finally {
      await panel.stop()
    }
  })

  it('lets a paired device read state and the console, and act', async () => {
    const { panel, calls, call, pair } = await setup()
    try {
      const cookie = await pair()
      const state = await call('GET', '/api/state', undefined, cookie)
      assert.equal(state.status, 200)
      assert.equal(state.body.servers[0].name, 'Survival')
      assert.deepEqual(state.body.servers[0].players, ['Steve'])
      assert.equal('directory' in state.body.servers[0], false)

      const lines = await call(
        'GET',
        '/api/console?id=one&after=1',
        undefined,
        cookie
      )
      assert.deepEqual(lines.body.lines, ['two'])
      assert.equal(
        (await call('GET', '/api/console?id=nope', undefined, cookie)).status,
        404
      )

      assert.equal(
        (
          await call(
            'POST',
            '/api/command',
            { id: 'one', command: '/say hi' },
            cookie
          )
        ).status,
        200
      )
      assert.equal(
        (
          await call(
            'POST',
            '/api/command',
            { id: 'one', command: 'a\nb' },
            cookie
          )
        ).status,
        409
      )
      assert.equal(
        (
          await call(
            'POST',
            '/api/kick',
            { id: 'one', player: 'Steve' },
            cookie
          )
        ).status,
        200
      )
      assert.equal(
        (
          await call(
            'POST',
            '/api/kick',
            { id: 'one', player: 'x; op me' },
            cookie
          )
        ).status,
        409
      )
      assert.equal(
        (await call('POST', '/api/start', { id: 'one' }, cookie)).status,
        409
      )
      assert.equal(
        (await call('POST', '/api/stop', { id: 'one' }, cookie)).status,
        200
      )
      assert.deepEqual(calls, [
        'command:one:say hi',
        'command:one:kick Steve',
        'start:one',
        'stop:one',
      ])
      assert.deepEqual(
        panel.activity.map(a => a.what),
        [
          'Stopped Survival',
          'Kicked Steve from Survival',
          'Ran "say hi" on Survival',
          'Paired',
        ]
      )
    } finally {
      await panel.stop()
    }
  })

  it('refuses changes that lack the request header or a JSON body', async () => {
    const { panel, calls, call, pair } = await setup()
    try {
      const cookie = await pair()
      assert.equal(
        (await call('POST', '/api/stop', { id: 'one' }, cookie, {})).status,
        400
      )
      assert.equal(
        (await call('POST', '/api/stop', { id: 'x'.repeat(5000) }, cookie))
          .status,
        400
      )
      assert.deepEqual(calls, [])
    } finally {
      await panel.stop()
    }
  })

  it('ends a session on sign-out, on revoke and after it expires', async () => {
    const { panel, call, pair, advance } = await setup()
    try {
      const first = await pair()
      assert.equal((await call('POST', '/api/signout', {}, first)).status, 200)
      assert.equal(
        (await call('GET', '/api/state', undefined, first)).status,
        401
      )

      const second = await pair()
      await panel.revoke(null)
      assert.equal(
        (await call('GET', '/api/state', undefined, second)).status,
        401
      )

      const third = await pair()
      advance(31 * 24 * 60 * 60 * 1000)
      assert.equal(
        (await call('GET', '/api/state', undefined, third)).status,
        401
      )
    } finally {
      await panel.stop()
    }
  })

  it('pauses pairing after repeated wrong codes', async () => {
    const { panel, call } = await setup()
    try {
      const code = await panel.issueCode()
      for (let i = 0; i < 8; i++) {
        assert.equal(
          (await call('POST', '/api/pair', { code: 'WRONG123' })).status,
          403
        )
      }
      assert.equal((await call('POST', '/api/pair', { code })).status, 429)
    } finally {
      await panel.stop()
    }
  })
})
