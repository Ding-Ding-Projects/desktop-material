import {
  IMd3Lock,
  lockCredentialAccountKey,
  md3LockAttemptDelayMs,
} from './lock-model'

/**
 * Credential handling for the for-fun surface locks.
 *
 * Three rules govern everything in this file.
 *
 * 1. **A password is verified against a stored hash, never a stored password.**
 *    Each lock gets its own random salt and a SHA-256 digest of
 *    `salt \0 password`; the password itself is never written anywhere and
 *    never leaves the call that verifies it.
 * 2. **Credential material lives in the operating-system credential vault**,
 *    under a stable per-lock account key. It is never written to a settings
 *    file, a preset, an export, the local history, a log line, a screenshot or
 *    Git. The vault is injected so the vault-backed module (which loads a
 *    native dependency) never has to be imported by a test.
 * 3. **Nothing here ever reveals a stored value.** There is no "read the
 *    password back" call, no length report, and no composition hint — not for
 *    the user, not for the interface, and not for a diagnostic. The only
 *    question this module answers about a credential is whether a supplied
 *    answer matched it.
 *
 * TOTP is deliberately absent as an implementation. The app has one
 * authenticator, and this module consumes it through {@link IMd3TotpVerifier}
 * rather than shipping a second RFC 6238 clock. Until that verifier is
 * registered, {@link isMd3TotpAvailable} answers `false` and the interface says
 * plainly that an OTP factor cannot be offered yet — which is honest, where a
 * quietly-broken OTP option would not be.
 */

/**
 * The narrow slice of the operating-system credential vault a lock needs.
 *
 * `app/src/lib/stores/token-store.ts` satisfies it; so does an in-memory fake
 * in a test. Nothing else about the vault is this module's business.
 */
export interface IMd3LockCredentialVault {
  /** Resolves to `null` when nothing is stored under `account`. */
  read(account: string): Promise<string | null>

  write(account: string, value: string): Promise<void>

  /** Resolves to `true` when something was actually removed. */
  remove(account: string): Promise<boolean>
}

/**
 * A verifier for the app's own authenticator.
 *
 * `accountKey` names the authenticator entry holding the secret; the secret
 * itself never crosses this boundary in either direction. `code` is the six-
 * to eight-digit value the user typed.
 */
export interface IMd3TotpVerifier {
  /** Whether the authenticator currently holds an entry under `accountKey`. */
  hasEntry(accountKey: string): Promise<boolean>

  verify(accountKey: string, code: string): Promise<boolean>
}

/**
 * The route from the unlock prompt's "Forgotten your password?" link to the
 * Support Tickets surface.
 *
 * Support Tickets is the app's self-service recovery desk: it opens the
 * application-data folder in the platform's file manager so the user can delete
 * it themselves. This module only needs to know how to get there. When nothing
 * is registered the link is still rendered, but as a plain explanation naming
 * the folder rather than a control that appears to work and does not.
 */
export type Md3LockSupportTicketsRoute = (context: {
  /** The lock the user could not answer, so the ticket opens pre-scoped. */
  readonly lockId: string
  readonly targetLabel: string
}) => void

/**
 * The message a caller sees when no vault has been installed. It names the
 * missing wiring rather than pretending a lock was saved.
 */
export const VaultUnavailableMessage =
  'No credential vault is installed for surface locks'

const unconfiguredVault: IMd3LockCredentialVault = {
  read: () => Promise.reject(new Error(VaultUnavailableMessage)),
  write: () => Promise.reject(new Error(VaultUnavailableMessage)),
  remove: () => Promise.reject(new Error(VaultUnavailableMessage)),
}

let vault: IMd3LockCredentialVault = unconfiguredVault
let totpVerifier: IMd3TotpVerifier | null = null
let supportTicketsRoute: Md3LockSupportTicketsRoute | null = null

/** Install the operating-system credential vault. Called once, at startup. */
export function setMd3LockCredentialVault(next: IMd3LockCredentialVault): void {
  vault = next
}

/** Restore the unconfigured vault. Exists so a test can isolate itself. */
export function resetMd3LockCredentialVault(): void {
  vault = unconfiguredVault
}

export function getMd3LockCredentialVault(): IMd3LockCredentialVault {
  return vault
}

/** Install the app's authenticator as the OTP factor's verifier. */
export function setMd3TotpVerifier(next: IMd3TotpVerifier | null): void {
  totpVerifier = next
}

/**
 * Whether an OTP factor can be offered at all.
 *
 * The lock setup surface reads this and disables the OTP choice with a stated
 * reason when it is `false`, rather than accepting a factor it cannot check.
 */
export function isMd3TotpAvailable(): boolean {
  return totpVerifier !== null
}

/** Install the route to Support Tickets. */
export function setMd3LockSupportTicketsRoute(
  next: Md3LockSupportTicketsRoute | null
): void {
  supportTicketsRoute = next
}

/** Whether the "Forgotten your password?" link can actually go anywhere. */
export function isMd3LockSupportTicketsAvailable(): boolean {
  return supportTicketsRoute !== null
}

/** Open Support Tickets for a lock the user could not answer. */
export function openMd3LockSupportTickets(context: {
  readonly lockId: string
  readonly targetLabel: string
}): boolean {
  if (supportTicketsRoute === null) {
    return false
  }
  supportTicketsRoute(context)
  return true
}

/** The shortest and longest password a lock accepts. */
export const MinimumLockPasswordLength = 4
export const MaximumLockPasswordLength = 128

export function isValidMd3LockPassword(value: string): boolean {
  const normalized = value.trim()
  return (
    normalized.length >= MinimumLockPasswordLength &&
    normalized.length <= MaximumLockPasswordLength
  )
}

interface IStoredPasswordRecord {
  readonly salt: string
  readonly digest: string
}

function getWebCrypto(): Crypto {
  if (
    typeof crypto === 'undefined' ||
    crypto.subtle === undefined ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error('Web Crypto is unavailable for surface-lock credentials')
  }
  return crypto
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function digestPassword(password: string, salt: string): Promise<string> {
  const input = new TextEncoder().encode(`${salt}\u0000${password}`)
  const digest = await getWebCrypto().subtle.digest('SHA-256', input)
  return bytesToHex(new Uint8Array(digest))
}

/**
 * Compare two hex digests without leaking where they first differ.
 *
 * A toy lock does not need this and it costs nothing, which is the whole
 * argument for writing it correctly the first time rather than leaving a
 * short-circuiting `===` for somebody to copy into a surface that does.
 */
function digestsMatch(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }
  let difference = 0
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function parseRecord(raw: string | null): IStoredPasswordRecord | null {
  if (raw === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    return typeof record.salt === 'string' && typeof record.digest === 'string'
      ? { salt: record.salt, digest: record.digest }
      : null
  } catch {
    return null
  }
}

/**
 * Store the salted digest of a lock's password.
 *
 * Rejects an invalid password rather than storing a digest of it, so the length
 * rule is enforced once, here, instead of in each caller.
 */
export async function setMd3LockPassword(
  lockId: string,
  password: string,
  credentialVault: IMd3LockCredentialVault = vault
): Promise<void> {
  if (!isValidMd3LockPassword(password)) {
    throw new Error(
      `A lock password must be ${MinimumLockPasswordLength} to ${MaximumLockPasswordLength} characters`
    )
  }
  const saltBytes = new Uint8Array(16)
  getWebCrypto().getRandomValues(saltBytes)
  const salt = bytesToHex(saltBytes)
  const record: IStoredPasswordRecord = {
    salt,
    digest: await digestPassword(password, salt),
  }
  await credentialVault.write(
    lockCredentialAccountKey(lockId),
    JSON.stringify(record)
  )
}

/** Whether a password lock has its credential stored. */
export async function hasMd3LockPassword(
  lockId: string,
  credentialVault: IMd3LockCredentialVault = vault
): Promise<boolean> {
  const record = parseRecord(
    await credentialVault.read(lockCredentialAccountKey(lockId))
  )
  return record !== null
}

/** Verify a typed password against the stored digest. Never reveals anything. */
export async function verifyMd3LockPassword(
  lockId: string,
  password: string,
  credentialVault: IMd3LockCredentialVault = vault
): Promise<boolean> {
  const record = parseRecord(
    await credentialVault.read(lockCredentialAccountKey(lockId))
  )
  if (record === null) {
    return false
  }
  return digestsMatch(
    await digestPassword(password, record.salt),
    record.digest
  )
}

/** Forget a lock's credential. Called when the lock itself is removed. */
export async function removeMd3LockCredential(
  lockId: string,
  credentialVault: IMd3LockCredentialVault = vault
): Promise<boolean> {
  return credentialVault.remove(lockCredentialAccountKey(lockId))
}

/** Why a verification attempt did not succeed. */
export type Md3LockVerificationOutcome =
  | 'matched'
  | 'mismatched'
  | 'throttled'
  | 'unavailable'

export interface IMd3LockVerification {
  readonly outcome: Md3LockVerificationOutcome

  /**
   * How many consecutive wrong answers this lock has taken, including this one.
   * Zero after a match.
   */
  readonly consecutiveFailures: number

  /** Epoch milliseconds before which another attempt is refused. */
  readonly retryAt: number
}

interface IAttemptLedgerEntry {
  failures: number
  retryAt: number
}

/**
 * Consecutive wrong answers, per lock, held in memory only.
 *
 * It is not persisted, because persisting it would turn a mistyped password
 * into a delay that survives a restart — enforcement, which this is explicitly
 * not. Restarting the app clears it, and the copy never claims otherwise.
 */
const attempts = new Map<string, IAttemptLedgerEntry>()

/** The current throttle state for a lock, without attempting anything. */
export function md3LockAttemptState(
  lockId: string
): Pick<IMd3LockVerification, 'consecutiveFailures' | 'retryAt'> {
  const entry = attempts.get(lockId)
  return {
    consecutiveFailures: entry?.failures ?? 0,
    retryAt: entry?.retryAt ?? 0,
  }
}

/** Forget a lock's attempt history. Used on a match and on removal. */
export function clearMd3LockAttempts(lockId: string): void {
  attempts.delete(lockId)
}

/** Forget every lock's attempt history. Exists so a test can isolate itself. */
export function clearAllMd3LockAttempts(): void {
  attempts.clear()
}

function recordFailure(lockId: string, now: number): IAttemptLedgerEntry {
  const failures = (attempts.get(lockId)?.failures ?? 0) + 1
  const entry: IAttemptLedgerEntry = {
    failures,
    retryAt: now + md3LockAttemptDelayMs(failures),
  }
  attempts.set(lockId, entry)
  return entry
}

/**
 * Answer one lock with one attempt.
 *
 * `answer` is a password for a `password` lock and a code for an `otp` lock.
 * The two never share a credential and never share a code path: an OTP lock is
 * checked only by the registered authenticator, and a password lock only by the
 * stored digest.
 */
export async function verifyMd3Lock(
  lock: IMd3Lock,
  answer: string,
  now: number = Date.now(),
  credentialVault: IMd3LockCredentialVault = vault
): Promise<IMd3LockVerification> {
  const state = md3LockAttemptState(lock.id)
  if (state.retryAt > now) {
    return { outcome: 'throttled', ...state }
  }

  if (lock.factor === 'otp') {
    if (totpVerifier === null || lock.otpAccountKey === null) {
      // Nothing was attempted, so nothing is recorded against the user: the
      // failure is the app's, and the copy says which part is missing.
      return { outcome: 'unavailable', ...state }
    }
    const matched = await totpVerifier.verify(lock.otpAccountKey, answer.trim())
    if (matched) {
      clearMd3LockAttempts(lock.id)
      return { outcome: 'matched', consecutiveFailures: 0, retryAt: 0 }
    }
    const entry = recordFailure(lock.id, now)
    return {
      outcome: 'mismatched',
      consecutiveFailures: entry.failures,
      retryAt: entry.retryAt,
    }
  }

  const matched = await verifyMd3LockPassword(lock.id, answer, credentialVault)
  if (matched) {
    clearMd3LockAttempts(lock.id)
    return { outcome: 'matched', consecutiveFailures: 0, retryAt: 0 }
  }
  const entry = recordFailure(lock.id, now)
  return {
    outcome: 'mismatched',
    consecutiveFailures: entry.failures,
    retryAt: entry.retryAt,
  }
}

/** Whether a lock has everything it needs to be answerable right now. */
export async function isMd3LockAnswerable(
  lock: IMd3Lock,
  credentialVault: IMd3LockCredentialVault = vault
): Promise<boolean> {
  if (lock.factor === 'otp') {
    if (totpVerifier === null || lock.otpAccountKey === null) {
      return false
    }
    return totpVerifier.hasEntry(lock.otpAccountKey)
  }
  return hasMd3LockPassword(lock.id, credentialVault)
}
