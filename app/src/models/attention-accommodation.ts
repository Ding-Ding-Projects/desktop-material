import { getObject, setObject } from '../lib/local-storage'

/** The five independently toggleable, non-medical interface accommodations. */
export const AttentionAccommodationModes = [
  'focus',
  'lowStimulation',
  'timeAwareness',
  'oneThingAtATime',
  'momentum',
] as const

export type AttentionAccommodationMode =
  (typeof AttentionAccommodationModes)[number]

export interface IAttentionAccommodationPreferences {
  readonly version: 1
  readonly enabled: Readonly<Record<AttentionAccommodationMode, boolean>>
  /** The single user-chosen next action, retained across restarts. */
  readonly nextAction: string
  /** Until this timestamp, the momentum nudge stays dismissed. */
  readonly momentumDeferredUntil: number | null
  /** The last time a preference or the next action changed. */
  readonly lastChangedAt: number
}

export const AttentionAccommodationStorageKey = 'attention-accommodation-preferences'
export const AttentionAccommodationChangedEvent =
  'desktop-material-attention-accommodation-changed'

export const DefaultAttentionAccommodationPreferences: IAttentionAccommodationPreferences = {
  version: 1,
  enabled: {
    focus: false,
    lowStimulation: false,
    timeAwareness: false,
    oneThingAtATime: false,
    momentum: false,
  },
  nextAction: '',
  momentumDeferredUntil: null,
  lastChangedAt: 0,
}

const MaximumNextActionLength = 240
const MaximumTimestamp = 4102444800000 // 2100-01-01, bounds corrupt input.

function isFiniteTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MaximumTimestamp
  )
}

function coerceEnabled(value: unknown): Readonly<Record<AttentionAccommodationMode, boolean>> {
  const raw = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

  return {
    focus: raw.focus === true,
    lowStimulation: raw.lowStimulation === true,
    timeAwareness: raw.timeAwareness === true,
    oneThingAtATime: raw.oneThingAtATime === true,
    momentum: raw.momentum === true,
  }
}

export function coerceAttentionAccommodationPreferences(
  value: unknown
): IAttentionAccommodationPreferences {
  const raw = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
  const rawAction = typeof raw.nextAction === 'string' ? raw.nextAction : ''

  return {
    version: 1,
    enabled: coerceEnabled(raw.enabled),
    nextAction: rawAction.trim().slice(0, MaximumNextActionLength),
    momentumDeferredUntil:
      raw.momentumDeferredUntil === null ||
      raw.momentumDeferredUntil === undefined
        ? null
        : isFiniteTimestamp(raw.momentumDeferredUntil)
          ? raw.momentumDeferredUntil
          : null,
    lastChangedAt: isFiniteTimestamp(raw.lastChangedAt)
      ? raw.lastChangedAt
      : 0,
  }
}

export function readAttentionAccommodationPreferences(): IAttentionAccommodationPreferences {
  return coerceAttentionAccommodationPreferences(
    getObject<unknown>(AttentionAccommodationStorageKey)
  )
}

export function saveAttentionAccommodationPreferences(
  preferences: IAttentionAccommodationPreferences
): void {
  const normalized = coerceAttentionAccommodationPreferences(preferences)
  setObject(AttentionAccommodationStorageKey, normalized)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AttentionAccommodationChangedEvent))
  }
}

export function updateAttentionAccommodationPreferences(
  change: Partial<Omit<IAttentionAccommodationPreferences, 'enabled'>> & {
    enabled?: Partial<Record<AttentionAccommodationMode, boolean>>
  }
): IAttentionAccommodationPreferences {
  const current = readAttentionAccommodationPreferences()
  const next = coerceAttentionAccommodationPreferences({
    ...current,
    ...change,
    enabled: { ...current.enabled, ...change.enabled },
    lastChangedAt: Date.now(),
  })
  saveAttentionAccommodationPreferences(next)
  return next
}

export function setAttentionAccommodationEnabled(
  mode: AttentionAccommodationMode,
  enabled: boolean
): IAttentionAccommodationPreferences {
  const enabledChange: Partial<
    Record<AttentionAccommodationMode, boolean>
  > = { [mode]: enabled }
  return updateAttentionAccommodationPreferences({ enabled: enabledChange })
}

export function setAttentionNextAction(nextAction: string): IAttentionAccommodationPreferences {
  return updateAttentionAccommodationPreferences({ nextAction })
}

export function deferAttentionMomentum(until: number): IAttentionAccommodationPreferences {
  return updateAttentionAccommodationPreferences({ momentumDeferredUntil: until })
}

/** Session facts intentionally start fresh for each renderer launch. */
export function createAttentionSessionStartedAt(): number {
  return Date.now()
}

export function formatAttentionElapsed(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

