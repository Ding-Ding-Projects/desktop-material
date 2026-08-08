import { getGlobalConfigValue, setGlobalConfigValue } from './config'

export type PushAutoSetupRemoteResult = 'already-configured' | 'enabled'

/**
 * Ensure `git push` publishes a brand-new branch instead of stopping at
 * "The current branch <name> has no upstream branch."
 *
 * The CLI's own hint names the remedy — `push.autoSetupRemote` — and this is
 * that remedy applied automatically: when the key is not configured anywhere
 * visible to the global scope, it is set to `true` so a first push of a new
 * branch sets its upstream and lands, in the CLI exactly as in the app.
 *
 * An explicit user choice is never overwritten: any existing value, whether
 * `true` or `false`, leaves the configuration untouched.
 */
export async function ensurePushAutoSetupRemote(env?: {
  HOME: string
}): Promise<PushAutoSetupRemoteResult> {
  const existing = await getGlobalConfigValue('push.autoSetupRemote', env)
  if (existing !== null) {
    return 'already-configured'
  }
  await setGlobalConfigValue('push.autoSetupRemote', 'true', env)
  return 'enabled'
}
