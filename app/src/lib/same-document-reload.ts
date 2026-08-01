/**
 * Whether a `will-navigate` request is the current document reloading itself.
 *
 * The main process denies every `will-navigate` on app windows as a security
 * measure (no link may carry the window away from the app). But
 * `window.location.reload()` also emits `will-navigate` with the document's
 * own URL, so an unconditional denial silently breaks every renderer Reload
 * button — the crash-proof boundary's and the startup shell's — and any
 * harness that proves state survives a reload. A reload is not navigation
 * away, so it must stay allowed.
 *
 * The fragment is ignored on both sides: the app parks presentation state in
 * the hash, and Chromium does not always echo it identically in the
 * `will-navigate` URL.
 */
export function isSameDocumentReloadUrl(
  currentUrl: string,
  targetUrl: string
): boolean {
  const withoutFragment = (url: string) => {
    const hashIndex = url.indexOf('#')
    return hashIndex === -1 ? url : url.slice(0, hashIndex)
  }

  const current = withoutFragment(currentUrl)
  const target = withoutFragment(targetUrl)
  return current.length > 0 && current === target
}
