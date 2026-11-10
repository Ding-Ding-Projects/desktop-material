import assert from 'node:assert'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as Path from 'node:path'
import { describe, it } from 'node:test'
import { Script } from 'node:vm'

import { IMinecraftSchedule } from '../../src/lib/minecraft/schedules'
import { IMinecraftServerState } from '../../src/lib/minecraft/server'
import {
  IPanelServers,
  WebPanelServer,
} from '../../src/main-process/web-panel-server'
import { PanelHtml, PanelJs } from '../../src/lib/web-panel/panel-page'

function fakeServers() {
  const calls = new Array<string>()
  let schedules: ReadonlyArray<IMinecraftSchedule> = []
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
    settings: async () => [
      {
        spec: {
          key: 'pvp',
          label: 'Players can hurt each other',
          type: { kind: 'boolean' as const },
          fallback: 'true',
        },
        value: 'true',
      },
    ],
    setSetting: async (id, key, value) => {
      calls.push(`set:${id}:${key}=${value}`)
      return key === 'pvp' ? null : 'That setting cannot be changed here.'
    },
    backups: async () => [{ name: 'world-2026-11-10T030405Z', createdAt: 5 }],
    backup: async id => {
      calls.push(`backup:${id}`)
      return state.status === 'running'
        ? 'Stop the server before backing up its world.'
        : null
    },
    restore: async (id, name) => {
      calls.push(`restore:${id}:${name}`)
      return name === 'world-2026-11-10T030405Z'
        ? null
        : 'That backup is no longer in the backups folder.'
    },
    schedules: async () => schedules,
    addSchedule: async draft => {
      if (draft.time !== '04:30') {
        return ['Give the time as HH:MM on a 24 hour clock, such as 04:30.']
      }
      schedules = [...schedules, { id: 's1', ...draft }]
      return []
    },
    removeSchedule: async scheduleId => {
      schedules = schedules.filter(s => s.id !== scheduleId)
    },
    addOns: async () => [{ name: 'Essentials.jar', kind: 'plugin', bytes: 3 }],
    files: async (_id, relative) =>
      relative === ''
        ? [{ name: 'logs', kind: 'folder', bytes: 0, viewable: false }]
        : null,
    readTextFile: async (_id, relative) =>
      relative === 'logs/latest.log'
        ? { text: 'line one\n', truncated: false }
        : null,
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

  it('serves settings, backups and add-ons to paired devices only', async () => {
    const { panel, calls, call, pair } = await setup()
    try {
      for (const path of ['/api/config', '/api/backups', '/api/addons']) {
        assert.equal((await call('GET', `${path}?id=one`)).status, 401)
      }
      const cookie = await pair()
      const config = await call('GET', '/api/config?id=one', undefined, cookie)
      assert.deepEqual(config.body.settings[0], {
        key: 'pvp',
        label: 'Players can hurt each other',
        type: { kind: 'boolean' },
        value: 'true',
      })
      assert.equal(
        (await call('GET', '/api/backups?id=one', undefined, cookie)).body
          .backups.length,
        1
      )
      assert.equal(
        (await call('GET', '/api/addons?id=one', undefined, cookie)).body
          .addOns[0].name,
        'Essentials.jar'
      )
      assert.equal(
        (await call('GET', '/api/config?id=nope', undefined, cookie)).status,
        404
      )

      assert.equal(
        (
          await call(
            'POST',
            '/api/config',
            { id: 'one', key: 'pvp', value: 'false' },
            cookie
          )
        ).status,
        200
      )
      const refused = await call(
        'POST',
        '/api/config',
        { id: 'one', key: 'online-mode', value: 'false' },
        cookie
      )
      assert.equal(refused.status, 409)
      assert.match(refused.body.error, /cannot be changed/)
      assert.equal(
        (await call('POST', '/api/backup', { id: 'one' }, cookie)).status,
        409
      )
      assert.deepEqual(calls, [
        'set:one:pvp=false',
        'set:one:online-mode=false',
        'backup:one',
      ])
      assert.equal(panel.activity[0].what, 'Changed pvp on Survival')
      assert.equal(
        (
          await call(
            'POST',
            '/api/restore',
            { id: 'one', name: 'nope' },
            cookie
          )
        ).status,
        409
      )
      assert.equal(
        (
          await call(
            'POST',
            '/api/restore',
            { id: 'one', name: 'world-2026-11-10T030405Z' },
            cookie
          )
        ).status,
        200
      )
      assert.equal(
        panel.activity[0].what,
        'Restored world-2026-11-10T030405Z on Survival'
      )
    } finally {
      await panel.stop()
    }
  })

  it('lets paired devices browse files and refuses paths the host refuses', async () => {
    const { panel, call, pair } = await setup()
    try {
      assert.equal((await call('GET', '/api/files?id=one&path=')).status, 401)
      assert.equal(
        (await call('GET', '/api/file?id=one&path=logs/latest.log')).status,
        401
      )
      const cookie = await pair()
      const listing = await call(
        'GET',
        '/api/files?id=one&path=',
        undefined,
        cookie
      )
      assert.equal(listing.body.entries[0].name, 'logs')
      assert.equal(
        (await call('GET', '/api/files?id=one&path=..', undefined, cookie))
          .status,
        404
      )
      const file = await call(
        'GET',
        '/api/file?id=one&path=logs%2Flatest.log',
        undefined,
        cookie
      )
      assert.deepEqual(file.body, { text: 'line one\n', truncated: false })
      assert.equal(
        (
          await call(
            'GET',
            '/api/file?id=one&path=server.jar',
            undefined,
            cookie
          )
        ).status,
        404
      )
    } finally {
      await panel.stop()
    }
  })

  it('adds, lists and removes schedules for paired devices', async () => {
    const { panel, call, pair } = await setup()
    try {
      assert.equal((await call('GET', '/api/schedules?id=one')).status, 401)
      const cookie = await pair()
      const bad = await call(
        'POST',
        '/api/schedule',
        { id: 'one', time: '25:00', action: 'restart' },
        cookie
      )
      assert.equal(bad.status, 409)
      assert.match(bad.body.error, /HH:MM/)
      assert.equal(
        (
          await call(
            'POST',
            '/api/schedule',
            { id: 'one', time: '04:30', action: 'restart' },
            cookie
          )
        ).status,
        200
      )
      const listed = await call(
        'GET',
        '/api/schedules?id=one',
        undefined,
        cookie
      )
      assert.deepEqual(listed.body.schedules, [
        { id: 's1', text: 'Every day at 04:30: Restart the server' },
      ])
      assert.equal(
        (
          await call(
            'POST',
            '/api/schedule-remove',
            { id: 'one', scheduleId: 'other' },
            cookie
          )
        ).status,
        404
      )
      assert.equal(
        (
          await call(
            'POST',
            '/api/schedule-remove',
            { id: 'one', scheduleId: 's1' },
            cookie
          )
        ).status,
        200
      )
      assert.equal(panel.activity[0].what, 'Removed a schedule on Survival')
    } finally {
      await panel.stop()
    }
  })

  it('ships a page script that parses and only touches elements the page has', () => {
    assert.doesNotThrow(() => new Script(PanelJs))
    const ids = new Set(
      [...PanelHtml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
    )
    for (const [, id] of PanelJs.matchAll(/\$\('([^']+)'\)/g)) {
      assert.equal(ids.has(id), true, `#${id} is missing from the page`)
    }
  })
})
