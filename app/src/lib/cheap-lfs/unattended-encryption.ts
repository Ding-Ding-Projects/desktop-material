import { t } from '../i18n'
import type {
  ICheapLfsAutoPinFailure,
  ICheapLfsAutoPinProgress,
  ICheapLfsFailedFileProgress,
} from './operations'

/**
 * How a saved payload password read ended, as reported by
 * `readSavedCheapLfsPayloadPassword`/`hasSavedCheapLfsPayloadPassword`.
 */
export type CheapLfsSavedPasswordState = 'saved' | 'missing' | 'unavailable'

/** What the commit-time encryption gate must do before any upload starts. */
export type CheapLfsUnattendedEncryptionDecision =
  /** Continue exactly as before: prompt when needed, then encrypt and upload. */
  | 'proceed'
  /**
   * Pin nothing. There is a password to collect and nobody present to type it,
   * so the only outcomes left are asking a machine nobody is sitting at or
   * uploading in the clear. Both are refused: the large files stay in the
   * working tree, out of the commit, and the skip is reported.
   */
  | 'skip-unattended-password'

/** Everything the gate needs to know about one commit attempt. */
export interface ICheapLfsUnattendedEncryptionInput {
  /** True for scheduled/automated commits, which must never summon UI. */
  readonly isBackgroundTask: boolean
  /** True when this repository's next upload must be encrypted. */
  readonly encryptionEnabled: boolean
  /** Result of the operating-system vault lookup for this repository. */
  readonly savedPassword: CheapLfsSavedPasswordState
}

/**
 * Decide, fail-closed, whether an automatic commit may run its encrypted pin.
 *
 * An interactive commit always proceeds: the password dialog is a decision the
 * person in front of the app must make before continuing, which is exactly what
 * a modal is for. An unattended commit has no such person, so a repository with
 * encryption on and no usable saved password can only be skipped.
 *
 * `unavailable` is treated like `missing` on purpose. A locked or broken
 * credential vault is not permission to upload a payload in the clear, and it
 * is not permission to open a dialog nobody will answer either.
 */
export function decideCheapLfsUnattendedEncryption(
  input: ICheapLfsUnattendedEncryptionInput
): CheapLfsUnattendedEncryptionDecision {
  if (!input.isBackgroundTask || !input.encryptionEnabled) {
    return 'proceed'
  }
  return input.savedPassword === 'saved'
    ? 'proceed'
    : 'skip-unattended-password'
}

/** One large file an unattended commit refused to pin. */
export interface ICheapLfsUnattendedSkipTarget {
  readonly relativePath: string
  readonly sizeInBytes: number
}

/** A persistent, non-blocking notice describing an unattended skip. */
export interface ICheapLfsUnattendedSkipNotice {
  readonly title: string
  readonly body: string
  /** Collapses repeated skips for the same repository into one card. */
  readonly dedupeKey: string
}

/**
 * Translate one `<base>.plain`/`.light`/`.playful` family, each language taking
 * its own funny level. Injected so this module stays free of browser storage
 * and so a test can pin an exact band.
 */
export type CheapLfsUnattendedLocalizeWithFunnyLevel = (
  base: 'cheapLfs.unattendedEncryption.body',
  variables: Readonly<Record<string, string>>
) => string

/** How many skipped paths the notice names before `{count}` covers the rest. */
const MaximumNamedSkippedPaths = 3

/** Longest displayed path before the notice elides the remainder. */
const MaximumNamedPathLength = 120

/** True for C0/C1 control code points, which never belong in a notice. */
function isControlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

/** Strip control characters and bound one path for display in a notice. */
function safeName(path: string): string {
  const normalized = Array.from(path)
    .map(character =>
      isControlCodePoint(character.codePointAt(0) ?? 0) ? ' ' : character
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  const characters = Array.from(normalized)
  return characters.length <= MaximumNamedPathLength
    ? normalized
    : `${characters.slice(0, MaximumNamedPathLength - 1).join('')}…`
}

/**
 * Build every surface an unattended encryption skip owes the user, in one
 * place, from one set of facts.
 *
 * There are three of them and they must agree: the per-file rows the commit
 * excludes and explains, the terminal progress snapshot that states the counts,
 * and the non-blocking notice. The reason on the rows is a fixed, factual
 * resource key; only the notice body carries funny-level bands, and every band
 * still names the same files, the same count, and the same remedy.
 */
export function buildCheapLfsUnattendedEncryptionSkip(
  targets: ReadonlyArray<ICheapLfsUnattendedSkipTarget>,
  repositoryId: number,
  localizeWithFunnyLevel: CheapLfsUnattendedLocalizeWithFunnyLevel
): {
  readonly failures: ReadonlyArray<ICheapLfsAutoPinFailure>
  readonly progress: ICheapLfsAutoPinProgress
  readonly notice: ICheapLfsUnattendedSkipNotice
} {
  const reasonKey = 'cheapLfs.unattendedEncryption.reason' as const
  const failures = targets.map(
    (target): ICheapLfsAutoPinFailure => ({
      relativePath: target.relativePath,
      sizeInBytes: target.sizeInBytes,
      message: t(reasonKey),
      reasonKey,
    })
  )
  const progress: ICheapLfsAutoPinProgress = {
    // Nothing was hashed, encrypted, or uploaded: the skip is decided while
    // preparing, before the first pin worker starts.
    phase: 'preparing',
    completedFiles: failures.length,
    totalFiles: failures.length,
    currentPath: null,
    transferredBytes: 0,
    totalBytes: failures.reduce((sum, entry) => sum + entry.sizeInBytes, 0),
    succeededFiles: 0,
    failedFiles: failures.length,
    failedFileDetails: failures.map(
      (entry): ICheapLfsFailedFileProgress => ({
        relativePath: entry.relativePath,
        // The localized key carries the reason; no provider was ever contacted,
        // so there is no relayed text to show.
        reason: '',
        reasonKey,
      })
    ),
  }
  const names = targets
    .slice(0, MaximumNamedSkippedPaths)
    .map(target => safeName(target.relativePath))
    .filter(name => name.length > 0)
    .join(', ')
  return {
    failures,
    progress,
    notice: {
      title: t('cheapLfs.unattendedEncryption.title'),
      // `count` is the true total even when only the first few are named, so a
      // long list is summarized without ever understating what was skipped.
      body: localizeWithFunnyLevel('cheapLfs.unattendedEncryption.body', {
        count: targets.length.toString(),
        names,
      }),
      dedupeKey: `cheap-lfs-unattended-encryption:${repositoryId}`,
    },
  }
}
