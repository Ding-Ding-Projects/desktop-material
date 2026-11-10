import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { editableMinecraftProperties } from '../../../src/lib/minecraft/properties'
import {
  IMinecraftExtrasClient,
  MinecraftServerExtras,
} from '../../../src/ui/repository-tools/minecraft-server-extras'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function fake() {
  let text = 'motd=Hello\n'
  let backups: Array<{ name: string; createdAt: number }> = []
  const calls = new Array<string>()
  const client: IMinecraftExtrasClient = {
    settings: async () => editableMinecraftProperties(text),
    setSetting: async (_id, key, value) => {
      calls.push(`${key}=${value}`)
      if (key === 'max-players' && value === '0') {
        return 'Maximum players must be a whole number from 1 to 1000.'
      }
      text += `${key}=${value}\n`
      return null
    },
    backups: async () => backups,
    backup: async () => {
      calls.push('backup')
      backups = [{ name: 'world-2026-11-10T030405Z', createdAt: 5 }]
      return null
    },
    restore: async (_id, name) => {
      calls.push(`restore:${name}`)
      return null
    },
    addOns: async () => [
      { name: 'Essentials.jar', kind: 'plugin', bytes: 2048 },
    ],
  }
  return { client, calls }
}

describe('MinecraftServerExtras', () => {
  it('changes a switch at once and a text value when focus leaves it', async () => {
    const { client, calls } = fake()
    render(
      <MinecraftServerExtras serverId="one" active={true} client={client} />
    )
    const pvp = (await screen.findByLabelText(
      'Players can hurt each other'
    )) as HTMLSelectElement
    fireEvent.change(pvp, { target: { value: 'false' } })
    await screen.findByText(/reads it the next time it starts/)

    const players = screen.getByLabelText('Maximum players')
    fireEvent.change(players, { target: { value: '0' } })
    assert.deepEqual(calls, ['pvp=false'])
    fireEvent.blur(players)
    await screen.findByText(/whole number from 1 to 1000/)
    assert.deepEqual(calls, ['pvp=false', 'max-players=0'])
  })

  it('backs up only a stopped server and lists the result', async () => {
    const { client, calls } = fake()
    const view = render(
      <MinecraftServerExtras serverId="one" active={true} client={client} />
    )
    const button = await screen.findByRole('button', { name: 'Back up world' })
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    fireEvent.click(button)
    assert.deepEqual(calls, [])

    view.rerender(
      <MinecraftServerExtras serverId="one" active={false} client={client} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back up world' }))
    await screen.findByText('world-2026-11-10T030405Z')
    screen.getByText('The world was backed up.')
    screen.getByText('Essentials.jar')
    screen.getByText('Plugin · 2 KB')

    fireEvent.click(
      screen.getByRole('button', { name: 'Restore world-2026-11-10T030405Z' })
    )
    assert.deepEqual(calls, ['backup'])
    // The first press settles before the second one counts.
    await new Promise(resolve => setTimeout(resolve, 0))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Press again to restore world-2026-11-10T030405Z',
      })
    )
    await screen.findByText(/kept as a before-restore backup/)
    assert.deepEqual(calls, ['backup', 'restore:world-2026-11-10T030405Z'])
  })
})
