/**
 * The gate in front of the first encrypted pin.
 *
 * Encryption is the one Cheap LFS setting whose mistake is unrecoverable. A
 * wrong storage provider costs an upload; a lost passphrase costs the file, and
 * there is no recovery path, no override, and nobody to appeal to. So this is a
 * pure decision module rather than a checkbox handler: the app must be able to
 * prove, in a test, that no byte is ever encrypted for a repository whose user
 * has not been shown that sentence in a modal they had to act on.
 *
 * Three facts are kept per repository, all off by default:
 *
 * - **enabled** — the user asked for encryption on this repository. Never
 *   global, never inherited, never pre-ticked.
 * - **acknowledged** — the irreversibility gate was shown and confirmed. Set
 *   only by that modal.
 * - **savePassphrase** — the passphrase may be kept in the OS credential
 *   vault. Independent of the other two, and independently revocable.
 *
 * The important asymmetry is what happens when `enabled` is true and
 * `acknowledged` is not. The pin **refuses**. It does not quietly fall back to
 * uploading in the clear, because a user whose settings say "encrypted" and
 * whose release holds plaintext is worse off than one whose pin failed with a
 * reason.
 */

/** The three persisted per-repository facts this decision reads. */
export interface ICheapLfsEncryptionSettings {
  readonly enabled?: boolean
  readonly acknowledgedIrreversible?: boolean
  readonly savePassphrase?: boolean
}

export type CheapLfsEncryptionDecision =
  /** Encryption is off for this repository; pin exactly as before. */
  | 'plaintext'
  /** Encryption is on and confirmed; the pin needs a passphrase. */
  | 'encrypt'
  /**
   * Encryption is on but the irreversibility gate was never confirmed. The pin
   * refuses rather than falling back to plaintext.
   */
  | 'blocked-needs-acknowledgement'

/**
 * Decide what an about-to-run pin should do. Absent fields read as off, so a
 * preferences record written by an older build encrypts nothing.
 */
export function decideCheapLfsEncryption(
  settings: ICheapLfsEncryptionSettings | undefined
): CheapLfsEncryptionDecision {
  if (settings?.enabled !== true) {
    return 'plaintext'
  }
  return settings.acknowledgedIrreversible === true
    ? 'encrypt'
    : 'blocked-needs-acknowledgement'
}

/**
 * Whether the irreversibility modal must be shown before this repository's
 * encryption setting may be turned on. True until it has been confirmed once —
 * confirming it is what makes the checkbox usable, not the other way round.
 */
export function requiresCheapLfsEncryptionAcknowledgement(
  settings: ICheapLfsEncryptionSettings | undefined
): boolean {
  return settings?.acknowledgedIrreversible !== true
}

/**
 * Whether the surface should offer to forget a saved passphrase. Offered
 * whenever saving is on, so "forget" is reachable from exactly the same place
 * that offered to save — a user who can turn it on can always turn it off.
 */
export function offersCheapLfsPassphraseForget(
  settings: ICheapLfsEncryptionSettings | undefined
): boolean {
  return settings?.savePassphrase === true
}

/** The error a blocked pin raises. Never carries the passphrase. */
export class CheapLfsEncryptionGateError extends Error {
  public constructor() {
    super(
      'Cheap LFS encryption is enabled for this repository but its irreversible-loss warning was never confirmed, so nothing was uploaded and no file was replaced.'
    )
    this.name = 'CheapLfsEncryptionGateError'
  }
}
