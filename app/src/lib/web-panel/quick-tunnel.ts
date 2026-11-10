/**
 * Free Cloudflare quick tunnel for a locally hosted web panel.
 *
 * `cloudflared tunnel --url http://127.0.0.1:<port>` opens an outbound-only
 * tunnel and prints a random `https://<words>.trycloudflare.com` address. The
 * address changes on every start, there is no uptime guarantee, and at most
 * 200 requests are served at once, so this module only tracks the state and
 * never promises a stable link.
 *
 * Pure rules only: the privileged process owns the child process.
 */

export type QuickTunnelState =
  | { readonly kind: 'stopped' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'running'; readonly url: string }
  | { readonly kind: 'failed'; readonly reason: string }

export type QuickTunnelEvent =
  | { readonly kind: 'start' }
  | { readonly kind: 'output'; readonly text: string }
  | { readonly kind: 'exit'; readonly code: number | null }
  | { readonly kind: 'stop' }

const QuickTunnelUrl =
  /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/i

/** Find the public address in a chunk of `cloudflared` output. */
export function parseQuickTunnelUrl(text: string): string | null {
  const match = QuickTunnelUrl.exec(text)
  return match === null ? null : match[0].toLowerCase()
}

/** Arguments for `cloudflared`. The origin is always this computer's loopback. */
export function quickTunnelArguments(localPort: number): ReadonlyArray<string> {
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    throw new Error('The panel port must be a whole number from 1 to 65535.')
  }
  return ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${localPort}`]
}

/** Advance the tunnel state. Unknown output never changes a running link. */
export function reduceQuickTunnel(
  state: QuickTunnelState,
  event: QuickTunnelEvent
): QuickTunnelState {
  switch (event.kind) {
    case 'start':
      return state.kind === 'starting' || state.kind === 'running'
        ? state
        : { kind: 'starting' }
    case 'stop':
      return { kind: 'stopped' }
    case 'output': {
      if (state.kind !== 'starting' && state.kind !== 'running') {
        return state
      }
      const url = parseQuickTunnelUrl(event.text)
      if (url === null || (state.kind === 'running' && state.url === url)) {
        return state
      }
      return { kind: 'running', url }
    }
    case 'exit':
      if (state.kind === 'stopped') {
        return state
      }
      return {
        kind: 'failed',
        reason:
          state.kind === 'running'
            ? 'The tunnel closed. The public link no longer works.'
            : event.code === null
              ? 'The tunnel helper could not be started.'
              : `The tunnel helper stopped before a link was ready (exit code ${event.code}).`,
      }
  }
}

/** The public link, when there is one. */
export function quickTunnelUrl(state: QuickTunnelState): string | null {
  return state.kind === 'running' ? state.url : null
}
