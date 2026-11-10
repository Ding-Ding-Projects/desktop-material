import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IMinecraftSchedule } from '../../../src/lib/minecraft/schedules'
import {
  IMinecraftPlanningClient,
  MinecraftServerPlanning,
} from '../../../src/ui/repository-tools/minecraft-server-planning'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function fake() {
  let schedules: ReadonlyArray<IMinecraftSchedule> = []
  let world = 'world'
  const calls = new Array<string>()
  const client: IMinecraftPlanningClient = {
    schedules: async () => schedules,
    addSchedule: async draft => {
      calls.push(`add:${draft.time}:${draft.action}:${draft.command}`)
      if (draft.time !== '04:30') {
        return ['Give the time as HH:MM on a 24 hour clock, such as 04:30.']
      }
      schedules = [...schedules, { id: 's1', ...draft }]
      return []
    },
    removeSchedule: async id => {
      calls.push(`remove:${id}`)
      schedules = schedules.filter(s => s.id !== id)
    },
    currentWorld: async () => world,
    newWorld: async (_id, request) => {
      calls.push(`world:${request.name}:${request.type}:${request.structures}`)
      world = request.name
      return []
    },
  }
  return { client, calls }
}

describe('MinecraftServerPlanning', () => {
  it('adds a schedule after checking it and removes it again', async () => {
    const { client, calls } = fake()
    render(
      <MinecraftServerPlanning serverId="one" active={false} client={client} />
    )
    await screen.findByText('Schedules (0)')
    fireEvent.change(screen.getByLabelText('Time (24 hour, HH:MM)'), {
      target: { value: '4:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }))
    await screen.findByText(/HH:MM on a 24 hour clock/)

    await new Promise(resolve => setTimeout(resolve, 0))
    fireEvent.change(screen.getByLabelText('Time (24 hour, HH:MM)'), {
      target: { value: '04:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }))
    await screen.findByText('Every day at 04:30: Restart the server')
    screen.getByText('Schedules (1)')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove: Every day at 04:30: Restart the server',
      })
    )
    await screen.findByText('Schedules (0)')
    assert.deepEqual(calls, [
      'add:4:30:restart:null',
      'add:04:30:restart:null',
      'remove:s1',
    ])
  })

  it('sets up a new world only for a stopped server', async () => {
    const { client, calls } = fake()
    const view = render(
      <MinecraftServerPlanning serverId="one" active={true} client={client} />
    )
    await screen.findByText(/Current world folder: world\./)
    const button = screen.getByRole('button', { name: 'Use a new world' })
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    fireEvent.click(button)
    assert.deepEqual(calls, [])

    view.rerender(
      <MinecraftServerPlanning serverId="one" active={false} client={client} />
    )
    fireEvent.change(screen.getByLabelText('Name of the new world'), {
      target: { value: ' Flatland ' },
    })
    fireEvent.change(screen.getByLabelText('World type'), {
      target: { value: 'minecraft:flat' },
    })
    fireEvent.click(
      screen.getByLabelText('Generate villages and other structures')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use a new world' }))
    await screen.findByText(/generated the next time the server starts\.$/)
    await screen.findByText(/Current world folder: Flatland\./)
    assert.deepEqual(calls, ['world:Flatland:minecraft:flat:false'])
  })
})
