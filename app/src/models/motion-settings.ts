/**
 * Motion as an appearance value.
 *
 * Motion is persisted, reset and scheduled exactly like theme or accent: the
 * stored level, speed and per-surface switches live inside the appearance
 * customization, and `resolveMotion` turns them, together with the operating
 * system's reduced-motion signal, into what the renderer actually applies.
 *
 * The calmer of the two signals always wins. A person who chose Full motion on
 * a machine set to reduce animation gets the reduced path; a person who chose
 * Reduced never gets more motion because the machine allows it.
 */

/** What a person picks. `system` follows the operating system. */
export type MotionLevelPreference = 'system' | 'full' | 'calm' | 'reduced'

/** What the renderer applies once the system signal is folded in. */
export type ResolvedMotionLevel = 'full' | 'calm' | 'reduced'

export const motionLevelPreferences: ReadonlyArray<MotionLevelPreference> = [
  'system',
  'full',
  'calm',
  'reduced',
]

/** Surfaces that can opt out of motion independently. */
export type MotionSurface =
  | 'dialogs'
  | 'lists'
  | 'tabs'
  | 'charts'
  | 'celebrations'

export const motionSurfaces: ReadonlyArray<MotionSurface> = [
  'dialogs',
  'lists',
  'tabs',
  'charts',
  'celebrations',
]

export type MotionSurfaceSwitches = Readonly<Record<MotionSurface, boolean>>

export const DefaultMotionSurfaceSwitches: MotionSurfaceSwitches = {
  dialogs: true,
  lists: true,
  tabs: true,
  charts: true,
  celebrations: true,
}

/** Speed multiplier bounds. 1 is the design speed; 2 is twice as fast. */
export const MinMotionSpeed = 0.5
export const MaxMotionSpeed = 2
export const DefaultMotionSpeed = 1
export const MotionSpeedStep = 0.1

/** Clamp and round a stored speed so it always lands on a slider step. */
export function normalizeMotionSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DefaultMotionSpeed
  }
  const clamped = Math.min(MaxMotionSpeed, Math.max(MinMotionSpeed, value))
  return Number((Math.round(clamped / MotionSpeedStep) * MotionSpeedStep).toFixed(1))
}

/** Keep only known surfaces, defaulting each missing or invalid one to on. */
export function normalizeMotionSurfaces(value: unknown): MotionSurfaceSwitches {
  const source =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const result: Record<MotionSurface, boolean> = {
    ...DefaultMotionSurfaceSwitches,
  }
  for (const surface of motionSurfaces) {
    const entry = source[surface]
    if (typeof entry === 'boolean') {
      result[surface] = entry
    }
  }
  return result
}

/**
 * Fold the operating-system preference into the stored level.
 *
 * - `system` becomes `full`, or `reduced` when the system asks for less.
 * - Any explicit level becomes `reduced` when the system asks for less.
 */
export function resolveMotionLevel(
  preference: MotionLevelPreference,
  systemPrefersReduced: boolean
): ResolvedMotionLevel {
  if (preference === 'reduced' || systemPrefersReduced) {
    return 'reduced'
  }
  if (preference === 'calm') {
    return 'calm'
  }
  return 'full'
}

/**
 * Durations in milliseconds after the level and speed are applied. These feed
 * the `--dm-motion-*` custom properties; stylesheets never hard-code them.
 */
export interface IMotionDurations {
  readonly short: number
  readonly medium: number
  readonly long: number
}

const BaseDurations: Readonly<Record<ResolvedMotionLevel, IMotionDurations>> =
  {
    full: { short: 200, medium: 300, long: 500 },
    calm: { short: 140, medium: 180, long: 240 },
    // Not zero: transitionend and animationend still fire, so code that waits
    // for them keeps working.
    reduced: { short: 1, medium: 1, long: 1 },
  }

export function motionDurations(
  level: ResolvedMotionLevel,
  speed: number
): IMotionDurations {
  const base = BaseDurations[level]
  if (level === 'reduced') {
    return base
  }
  const s = normalizeMotionSpeed(speed)
  return {
    short: Math.max(1, Math.round(base.short / s)),
    medium: Math.max(1, Math.round(base.medium / s)),
    long: Math.max(1, Math.round(base.long / s)),
  }
}
