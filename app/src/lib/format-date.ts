import { format } from 'date-fns'
import {
  DateFormat,
  TimeFormat,
  defaultDateFormat,
  defaultTimeFormat,
} from '../models/formatting-preferences'

const dateFormatKey = 'dateFormat'
const timeFormatKey = 'timeFormat'

function getDateFormatPreference(): DateFormat {
  return (
    (localStorage.getItem(dateFormatKey) as DateFormat) ?? defaultDateFormat
  )
}

function getTimeFormatPreference(): TimeFormat {
  return (
    (localStorage.getItem(timeFormatKey) as TimeFormat) ?? defaultTimeFormat
  )
}

interface IFormatDateOptions {
  /** Whether to include the date portion. Defaults to true. */
  readonly date?: boolean
  /** Whether to include the time portion. Defaults to true. */
  readonly time?: boolean
}

/**
 * Format a date using the user's preferred date and time format patterns.
 *
 * By default both date and time are included. Pass `{ date: false }` or
 * `{ time: false }` to include only one.
 */
export function formatDate(
  value: Date,
  { date = true, time = true }: IFormatDateOptions = {}
): string {
  if (isNaN(value.valueOf())) {
    return 'Invalid date'
  }

  const parts: Array<string> = []

  if (date) {
    parts.push(format(value, getDateFormatPreference()))
  }

  if (time) {
    parts.push(format(value, getTimeFormatPreference()))
  }

  return parts.join(' ')
}
