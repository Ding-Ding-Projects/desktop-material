import {
  TeleportTargetId,
  teleportTargetSelector,
} from '../../lib/teleport-targets'

/** The class a spotlit element wears while the ring is showing. */
export const TeleportSpotlightClassName = 'teleport-spotlight'

/** How long the spotlight ring stays on the element. */
export const TeleportSpotlightDurationMs = 2400

/**
 * How long to keep looking for the target before giving up.
 *
 * The surface that owns a target is often opening while we look for it — a
 * dialog animating in, a pane mounting after its tab is selected — so the
 * lookup polls rather than reading the DOM once and concluding the feature
 * does not exist.
 */
export const TeleportLookupTimeoutMs = 4000

/** Elements worth handing focus to once we arrive. */
const FocusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Resolve the element to spotlight, or null while it is not on screen yet. */
function findTarget(selector: string): HTMLElement | null {
  const element = document.querySelector(selector)
  return element instanceof HTMLElement ? element : null
}

/**
 * Wait for `selector` to resolve, polling on animation frames until the
 * timeout. Resolves with null when the surface never appeared.
 */
function waitForTarget(
  selector: string,
  timeoutMs: number
): Promise<HTMLElement | null> {
  const immediate = findTarget(selector)
  if (immediate !== null) {
    return Promise.resolve(immediate)
  }

  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs
    const poll = () => {
      const found = findTarget(selector)
      if (found !== null) {
        resolve(found)
        return
      }
      if (Date.now() >= deadline) {
        resolve(null)
        return
      }
      requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
}

/** The element that should receive focus when we land on `target`. */
function resolveFocusTarget(target: HTMLElement): HTMLElement | null {
  if (target.matches(FocusableSelector)) {
    return target
  }
  const descendant = target.querySelector(FocusableSelector)
  return descendant instanceof HTMLElement ? descendant : null
}

/**
 * Take the user to where a feature lives: scroll its control into view, ring
 * it so it is unmistakable among its neighbours, and hand it focus so the
 * keyboard arrives with the eyes.
 *
 * Resolves true when the target was found and spotlit, false when the surface
 * never appeared — the caller decides whether that silence is worth reporting.
 */
export async function teleportTo(
  id: TeleportTargetId,
  timeoutMs = TeleportLookupTimeoutMs
): Promise<boolean> {
  const target = await waitForTarget(teleportTargetSelector(id), timeoutMs)
  if (target === null) {
    return false
  }

  const reducedMotion = prefersReducedMotion()
  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: reducedMotion ? 'auto' : 'smooth',
  })

  target.classList.add(TeleportSpotlightClassName)
  window.setTimeout(
    () => target.classList.remove(TeleportSpotlightClassName),
    TeleportSpotlightDurationMs
  )

  // Focus lands on the control itself when it takes focus, otherwise on the
  // first focusable thing inside it. Scrolling is already handled above, so the
  // focus call must not fight it.
  resolveFocusTarget(target)?.focus({ preventScroll: true })

  return true
}
