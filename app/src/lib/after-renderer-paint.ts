export type AnimationFrameScheduler = (callback: FrameRequestCallback) => number
export type AnimationFrameCanceller = (handle: number) => void
export type FallbackTimerScheduler = (
  callback: () => void,
  delay: number
) => number
export type FallbackTimerCanceller = (handle: number) => void

export interface IAfterRendererPaintDependencies {
  readonly scheduleFrame: AnimationFrameScheduler
  readonly cancelFrame: AnimationFrameCanceller
  readonly scheduleFallback: FallbackTimerScheduler
  readonly cancelFallback: FallbackTimerCanceller
  readonly isHidden: () => boolean
  readonly subscribeToHidden: (callback: () => void) => () => void
}

export const DefaultRendererPaintFallbackTimeout = 250

const defaultDependencies: IAfterRendererPaintDependencies = {
  scheduleFrame: callback => window.requestAnimationFrame(callback),
  cancelFrame: handle => window.cancelAnimationFrame(handle),
  scheduleFallback: (callback, delay) => window.setTimeout(callback, delay),
  cancelFallback: handle => window.clearTimeout(handle),
  isHidden: () => document.hidden,
  subscribeToHidden: callback => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        callback()
      }
    }
    const onPageHide = () => callback()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  },
}

/**
 * Resolve only after the renderer has had an opportunity to present work that
 * was already queued for the next animation frame. Hidden or stalled renderers
 * cannot produce a useful paint, so visibility and timeout fallbacks keep the
 * caller from waiting forever.
 *
 * The first callback runs alongside state-update callbacks already queued for
 * the upcoming frame. The second callback runs in the following frame, which
 * means the browser had a paint opportunity between them.
 */
export function afterRendererPaint(
  dependencies: IAfterRendererPaintDependencies = defaultDependencies,
  fallbackTimeout: number = DefaultRendererPaintFallbackTimeout
): Promise<void> {
  return new Promise(resolve => {
    let settled = false
    let frameHandle: number | null = null
    let fallbackHandle: number | null = null
    let unsubscribeFromHidden: (() => void) | null = null

    const finish = () => {
      if (settled) {
        return
      }

      settled = true

      if (frameHandle !== null) {
        dependencies.cancelFrame(frameHandle)
        frameHandle = null
      }

      if (fallbackHandle !== null) {
        dependencies.cancelFallback(fallbackHandle)
        fallbackHandle = null
      }

      unsubscribeFromHidden?.()
      unsubscribeFromHidden = null
      resolve()
    }

    if (dependencies.isHidden()) {
      finish()
      return
    }

    const unsubscribe = dependencies.subscribeToHidden(finish)
    if (settled) {
      unsubscribe()
      return
    }
    unsubscribeFromHidden = unsubscribe

    // Close the small race between the first visibility check and listener
    // registration, even when a host does not deliver the transition event.
    if (dependencies.isHidden()) {
      finish()
      return
    }

    fallbackHandle = dependencies.scheduleFallback(() => {
      fallbackHandle = null
      finish()
    }, fallbackTimeout)
    frameHandle = dependencies.scheduleFrame(() => {
      frameHandle = null
      if (settled) {
        return
      }

      if (dependencies.isHidden()) {
        finish()
        return
      }

      frameHandle = dependencies.scheduleFrame(() => {
        frameHandle = null
        finish()
      })
    })
  })
}
