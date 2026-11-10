/**
 * Daily schedules for a Minecraft server: start, stop, restart, back up or
 * run one console command at a time of day. They only run while the app is
 * open, and a time that passed while the computer slept is skipped rather
 * than run late.
 */

import { normalizeMinecraftCommand } from './server'

export type MinecraftScheduleAction =
  'start' | 'stop' | 'restart' | 'backup' | 'command'

export const MinecraftScheduleActions: ReadonlyArray<MinecraftScheduleAction> =
  ['start', 'stop', 'restart', 'backup', 'command']

export const MinecraftScheduleActionLabels: Record<
  MinecraftScheduleAction,
  string
> = {
  start: 'Start the server',
  stop: 'Stop the server',
  restart: 'Restart the server',
  backup: 'Back up the world (server must be stopped)',
  command: 'Run a console command',
}

export interface IMinecraftSchedule {
  readonly id: string
  readonly serverId: string
  /** Local time of day, `HH:MM` on a 24 hour clock. */
  readonly time: string
  readonly action: MinecraftScheduleAction
  /** The console command, for the `command` action only. */
  readonly command: string | null
}

export type MinecraftScheduleDraft = Omit<IMinecraftSchedule, 'id'>

export const MaxMinecraftSchedules = 50
/** A schedule missed by more than this is skipped, not run late. */
export const MaxMinecraftScheduleLatenessMs = 5 * 60 * 1000

/** Every problem with a schedule, in plain words. */
export function validateMinecraftSchedule(
  draft: MinecraftScheduleDraft
): ReadonlyArray<string> {
  const errors = new Array<string>()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
    errors.push('Give the time as HH:MM on a 24 hour clock, such as 04:30.')
  }
  if (!MinecraftScheduleActions.includes(draft.action)) {
    errors.push('Choose what the schedule does.')
  }
  if (draft.action === 'command') {
    if (normalizeMinecraftCommand(draft.command ?? '') === null) {
      errors.push('Give one console command of at most 256 characters.')
    }
  } else if (draft.command !== null && draft.command !== '') {
    errors.push('Only a console command schedule takes a command.')
  }
  return errors
}

/** One line describing a schedule. */
export function describeMinecraftSchedule(
  schedule: Pick<IMinecraftSchedule, 'time' | 'action' | 'command'>
): string {
  const what =
    schedule.action === 'command'
      ? `Run "${schedule.command ?? ''}"`
      : MinecraftScheduleActionLabels[schedule.action]
  return `Every day at ${schedule.time}: ${what}`
}

const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes()

/**
 * The schedules whose time of day was reached after `previous` and no later
 * than `now`. A gap longer than the lateness limit returns nothing.
 */
export function dueMinecraftSchedules(
  schedules: ReadonlyArray<IMinecraftSchedule>,
  previous: Date,
  now: Date
): ReadonlyArray<IMinecraftSchedule> {
  const gap = now.getTime() - previous.getTime()
  if (gap <= 0 || gap > MaxMinecraftScheduleLatenessMs) {
    return []
  }
  const from = minuteOfDay(previous)
  const to = minuteOfDay(now)
  if (from === to) {
    return []
  }
  return schedules.filter(schedule => {
    const [hours, minutes] = schedule.time.split(':').map(Number)
    const at = hours * 60 + minutes
    // The window may wrap past midnight.
    return from < to ? at > from && at <= to : at > from || at <= to
  })
}
