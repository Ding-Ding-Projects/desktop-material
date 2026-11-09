import {
  MotionLevelPreference,
  MotionSurface,
  MotionSurfaceSwitches,
  ResolvedMotionLevel,
  motionDurations,
  motionSurfaces,
  resolveMotionLevel,
} from '../../models/motion-settings'

/** The body attributes and custom properties this module owns. */
export const MotionBodyAttributes = [
  'data-dm-motion',
  'data-dm-motion-preference',
  'data-dm-motion-off',
] as const

export const MotionCustomProperties = [
  '--dm-motion-short',
  '--dm-motion-medium',
  '--dm-motion-long',
] as const

const ReducedMotionQuery = '(prefers-reduced-motion: reduce)'

/**
 * The operating system's preference only. This deliberately does not read the
 * body attribute (unlike `prefersReducedMotion` in `ripple.ts`), because the
 * body attribute is the output of this module.
 */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(ReducedMotionQuery).matches
  } catch {
    return false
  }
}

/**
 * Subscribe to operating-system changes so motion follows the moment someone
 * flips "Show animations in Windows". Returns an unsubscribe function.
 */
export function onSystemMotionPreferenceChanged(
  callback: () => void
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  let query: MediaQueryList
  try {
    query = window.matchMedia(ReducedMotionQuery)
  } catch {
    return () => {}
  }
  const listener = () => callback()
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }
  return () => {}
}

export interface IMotionAppearance {
  readonly motion: MotionLevelPreference
  readonly motionSpeed: number
  readonly motionSurfaces: MotionSurfaceSwitches
}

export interface IAppliedMotion {
  readonly level: ResolvedMotionLevel
  readonly offSurfaces: ReadonlyArray<MotionSurface>
}

/**
 * Write the resolved motion state onto `<body>`:
 *
 * - `data-dm-motion`: `full`, `calm` or `reduced`. Every existing
 *   `body[data-dm-motion='reduced']` rule keeps working unchanged.
 * - `data-dm-motion-preference`: what the person chose, for diagnostics.
 * - `data-dm-motion-off`: space-separated surfaces that take the reduced path.
 * - `--dm-motion-short|medium|long`: durations stylesheets consume.
 */
export function applyMotionToBody(
  body: HTMLElement,
  appearance: IMotionAppearance,
  systemReduced: boolean = systemPrefersReducedMotion()
): IAppliedMotion {
  const level = resolveMotionLevel(appearance.motion, systemReduced)
  const durations = motionDurations(level, appearance.motionSpeed)
  const offSurfaces = motionSurfaces.filter(
    surface => appearance.motionSurfaces[surface] === false
  )

  body.setAttribute('data-dm-motion', level)
  body.setAttribute('data-dm-motion-preference', appearance.motion)
  if (offSurfaces.length > 0) {
    body.setAttribute('data-dm-motion-off', offSurfaces.join(' '))
  } else {
    body.removeAttribute('data-dm-motion-off')
  }
  body.style.setProperty('--dm-motion-short', `${durations.short}ms`)
  body.style.setProperty('--dm-motion-medium', `${durations.medium}ms`)
  body.style.setProperty('--dm-motion-long', `${durations.long}ms`)

  return { level, offSurfaces }
}

export function clearMotionFromBody(body: HTMLElement) {
  for (const attribute of MotionBodyAttributes) {
    body.removeAttribute(attribute)
  }
  for (const property of MotionCustomProperties) {
    body.style.removeProperty(property)
  }
}

/**
 * True when `surface` should animate right now. Components that drive motion
 * from script (charts, celebrations) ask this instead of reading media queries.
 */
export function isMotionEnabledFor(
  surface: MotionSurface,
  body: HTMLElement | null = typeof document === 'undefined'
    ? null
    : document.body
): boolean {
  if (body === null) {
    return !systemPrefersReducedMotion()
  }
  if (body.getAttribute('data-dm-motion') === 'reduced') {
    return false
  }
  const off = (body.getAttribute('data-dm-motion-off') ?? '').split(' ')
  if (off.includes(surface)) {
    return false
  }
  return !systemPrefersReducedMotion()
}
