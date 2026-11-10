import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  IMinecraftSchedule,
  describeMinecraftSchedule,
  dueMinecraftSchedules,
  validateMinecraftSchedule,
} from '../../src/lib/minecraft/schedules'

const schedule = (time: string, id = time): IMinecraftSchedule => ({
  id,
  serverId: 'one',
  time,
  action: 'restart',
  command: null,
})

const at = (hours: number, minutes: number, seconds = 0, day = 10) =>
  new Date(2026, 10, day, hours, minutes, seconds)

describe('Minecraft schedules', () => {
  it('checks the time, the action and the command', () => {
    const draft = {
      serverId: 'one',
      time: '04:30',
      action: 'restart' as const,
      command: null,
    }
    assert.deepEqual(validateMinecraftSchedule(draft), [])
    assert.equal(
      validateMinecraftSchedule({ ...draft, time: '4:30' }).length,
      1
    )
    assert.equal(
      validateMinecraftSchedule({ ...draft, time: '24:00' }).length,
      1
    )
    assert.equal(
      validateMinecraftSchedule({ ...draft, action: 'explode' as any }).length,
      1
    )
    assert.equal(
      validateMinecraftSchedule({ ...draft, action: 'command', command: null })
        .length,
      1
    )
    assert.equal(
      validateMinecraftSchedule({
        ...draft,
        action: 'command',
        command: 'say a\nstop',
      }).length,
      1
    )
    assert.deepEqual(
      validateMinecraftSchedule({
        ...draft,
        action: 'command',
        command: 'say hi',
      }),
      []
    )
    assert.equal(
      validateMinecraftSchedule({ ...draft, command: 'stop' }).length,
      1
    )
  })

  it('describes a schedule in one line', () => {
    assert.equal(
      describeMinecraftSchedule(schedule('04:30')),
      'Every day at 04:30: Restart the server'
    )
    assert.equal(
      describeMinecraftSchedule({
        time: '12:00',
        action: 'command',
        command: 'say lunch',
      }),
      'Every day at 12:00: Run "say lunch"'
    )
  })

  it('runs a schedule once when its minute arrives', () => {
    const all = [schedule('04:30'), schedule('04:31'), schedule('23:59')]
    assert.deepEqual(
      dueMinecraftSchedules(all, at(4, 29, 40), at(4, 30, 10)).map(s => s.time),
      ['04:30']
    )
    assert.deepEqual(
      dueMinecraftSchedules(all, at(4, 30, 10), at(4, 30, 40)),
      []
    )
    assert.deepEqual(
      dueMinecraftSchedules(all, at(4, 30, 40), at(4, 31, 10)).map(s => s.time),
      ['04:31']
    )
  })

  it('handles midnight and skips times missed while asleep', () => {
    const all = [schedule('23:59'), schedule('00:00'), schedule('04:30')]
    assert.deepEqual(
      dueMinecraftSchedules(all, at(23, 58, 50), at(0, 0, 20, 11)).map(
        s => s.time
      ),
      ['23:59', '00:00']
    )
    assert.deepEqual(dueMinecraftSchedules(all, at(4, 0), at(5, 0)), [])
    assert.deepEqual(dueMinecraftSchedules(all, at(4, 31), at(4, 29)), [])
  })
})
