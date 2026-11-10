import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IMinecraftServerState } from '../../../src/lib/minecraft/server'
import {
  IMinecraftServersClient,
  MinecraftServers,
} from '../../../src/ui/repository-tools/minecraft-servers'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../../helpers/ui/render'

const server = (
  overrides: Partial<IMinecraftServerState> = {}
): IMinecraftServerState => ({
  server: {
    id: 'one',
    name: 'Survival',
    directory: 'D:\\Minecraft\\survival',
    jar: 'server.jar',
    javaPath: 'java',
    memoryMegabytes: 2048,
    port: 25565,
  },
  status: 'stopped',
  eulaAccepted: false,
  message: null,
  ...overrides,
})

function fake(initial: ReadonlyArray<IMinecraftServerState>) {
  let servers = initial
  let lines: ReadonlyArray<string> = []
  const calls = new Array<string>()
  let tick: () => void = () => {}
  const patch = (change: Partial<IMinecraftServerState>) => {
    servers = servers.map(s => ({ ...s, ...change }))
  }
  const client: IMinecraftServersClient = {
    list: async () => servers,
    save: async draft => {
      calls.push(`save:${draft.name}`)
      servers = [...servers, server({ server: { id: 'two', ...draft } })]
      return []
    },
    remove: async id => {
      calls.push(`remove:${id}`)
      servers = servers.filter(s => s.server.id !== id)
    },
    acceptEula: async id => {
      calls.push(`eula:${id}`)
      patch({ eulaAccepted: true })
    },
    start: async id => {
      calls.push(`start:${id}`)
      patch({ status: 'running' })
      lines = ['[INFO]: Done (3.2s)! For help']
      return null
    },
    stop: async id => {
      calls.push(`stop:${id}`)
      patch({ status: 'stopped' })
    },
    command: async (id, command) => {
      calls.push(`command:${id}:${command}`)
      lines = [...lines, `> ${command}`]
      return true
    },
    console: async (_id, after) => ({
      next: lines.length,
      lines: lines.slice(after),
      status: servers[0]?.status ?? 'stopped',
    }),
    openFolder: async id => {
      calls.push(`open:${id}`)
    },
  }
  const schedule = (run: () => void) => {
    tick = run
    return () => {}
  }
  return { client, calls, schedule, runTick: () => tick() }
}

const disabled = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-disabled') === 'true'

describe('MinecraftServers', () => {
  it('explains the empty list and adds a server after checking it', async () => {
    const { client, calls, schedule } = fake([])
    render(<MinecraftServers client={client} schedule={schedule} />)
    await screen.findByText(/No servers yet/)

    fireEvent.click(screen.getByRole('button', { name: 'Add a server' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    await screen.findByText(/Give the server a name/)
    assert.deepEqual(calls, [])

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Creative' },
    })
    fireEvent.change(screen.getByLabelText('Server folder'), {
      target: { value: 'D:\\Minecraft\\creative' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    await screen.findByRole('heading', { name: 'Creative' })
    assert.deepEqual(calls, ['save:Creative'])
  })

  it('keeps Start off until the EULA is accepted by the person', async () => {
    const { client, calls, schedule } = fake([server()])
    render(<MinecraftServers client={client} schedule={schedule} />)
    await screen.findByRole('heading', { name: 'Survival' })
    assert.equal(disabled('Start'), true)
    assert.equal(disabled('Accept for this server'), true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Accept for this server' })
    )
    assert.deepEqual(calls, [])

    fireEvent.click(
      screen.getByLabelText('I have read and agree to the Minecraft EULA')
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Accept for this server' })
    )
    await waitFor(() => assert.equal(disabled('Start'), false))
    assert.deepEqual(calls, ['eula:one'])
  })

  it('starts, shows the console, sends a command and stops', async () => {
    const { client, calls, schedule, runTick } = fake([
      server({ eulaAccepted: true }),
    ])
    render(<MinecraftServers client={client} schedule={schedule} />)
    await screen.findByRole('heading', { name: 'Survival' })
    screen.getByText(/The console is empty/)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await screen.findByText(/Done \(3\.2s\)!/)
    assert.equal(screen.getByRole('status').textContent, 'Running')
    assert.equal(disabled('Remove from list'), true)

    fireEvent.change(screen.getByLabelText('Console command'), {
      target: { value: '/say hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/> say hello/)

    await act(async () => runTick())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() =>
      assert.equal(screen.getByRole('status').textContent, 'Stopped')
    )
    assert.deepEqual(calls, ['start:one', 'command:one:say hello', 'stop:one'])
  })
})
