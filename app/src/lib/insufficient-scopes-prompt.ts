import { getStringArray, setStringArray } from './local-storage'

/**
 * Persistence for the "Grant additional GitHub permissions" prompt.
 *
 * The launch-time scope audit used to deduplicate the prompt only per
 * session, so an account whose token predates the required scopes was
 * nagged on every single launch. A "Not now" answer is now remembered per
 * account together with the exact scope set it dismissed: the prompt stays
 * silent while the missing scopes are covered by that answer, and returns
 * only when the app starts requiring a scope the user has not yet been
 * asked about. Signing in again (or the account no longer missing any
 * scope) clears the record.
 */
const dismissalKey = (accountKey: string) =>
  `insufficient-scopes-dismissed/${accountKey}`

/** The scopes a previous "Not now" answer dismissed for this account. */
export function getDismissedScopePrompt(
  accountKey: string
): ReadonlyArray<string> {
  return getStringArray(dismissalKey(accountKey))
}

/** Remember that the user answered "Not now" for these missing scopes. */
export function recordDismissedScopePrompt(
  accountKey: string,
  missingScopes: ReadonlyArray<string>
): void {
  setStringArray(dismissalKey(accountKey), missingScopes)
}

/** Forget a previous "Not now" answer for this account. */
export function clearDismissedScopePrompt(accountKey: string): void {
  localStorage.removeItem(dismissalKey(accountKey))
}

/**
 * Whether a previous "Not now" answer already covers every scope that is
 * currently missing. New missing scopes (the app grew a requirement the
 * user was never asked about) make the prompt eligible again.
 */
export function isScopePromptDismissed(
  accountKey: string,
  missingScopes: ReadonlyArray<string>
): boolean {
  if (missingScopes.length === 0) {
    return true
  }
  const dismissed = new Set(getDismissedScopePrompt(accountKey))
  return missingScopes.every(scope => dismissed.has(scope))
}
