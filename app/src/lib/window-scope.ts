export const PrimaryWindowScope = 'primary'

/** Read the stable window slot embedded by AppWindow in the renderer URL. */
export function windowScopeFromHash(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const scope = params.get('ws')?.trim()
  return scope && /^[a-z0-9-]{1,32}$/i.test(scope) ? scope : PrimaryWindowScope
}

export function getCurrentWindowScope(): string {
  return windowScopeFromHash(location.hash)
}
