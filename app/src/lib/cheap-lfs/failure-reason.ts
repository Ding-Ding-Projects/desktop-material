import { t } from '../i18n'
import { TranslationKey } from '../i18n-resources'
import { sanitizeCheapLfsFailureReason } from './operations'

/**
 * The parts of a settled Cheap LFS failure needed to explain it. Accepts both
 * `ICheapLfsAutoPinFailure` (which carries `message`) and the progress-side
 * `ICheapLfsFailedFileProgress` (which carries an already-sanitized `reason`).
 */
export interface ICheapLfsFailureReasonInput {
  readonly message?: string
  readonly reason?: string
  readonly statusCode?: number
  readonly reasonKey?: TranslationKey
}

/**
 * Resolve one bounded, localized, single-line reason for a failed pin.
 *
 * A key this app diagnosed itself always wins over relayed provider text, so
 * conditions like "this repository has never been published" read as guidance
 * rather than as a raw `422 Validation Failed`. Provider text is sanitized
 * before it is shown. Returns `''` only when no reason exists at all.
 */
export function cheapLfsFailureReasonText(
  failure: ICheapLfsFailureReasonInput | undefined
): string {
  if (failure === undefined) {
    return ''
  }
  if (failure.reasonKey !== undefined) {
    return t(failure.reasonKey)
  }
  return sanitizeCheapLfsFailureReason(failure.reason ?? failure.message ?? '')
}

/**
 * The reason clause appended to the pin-failure notification body. Empty when
 * the failure carries no reason, so the sentence never ends in a dangling
 * "Reason:".
 */
export function cheapLfsPinFailureReasonText(
  failure: ICheapLfsFailureReasonInput | undefined
): string {
  const reason = cheapLfsFailureReasonText(failure)
  if (reason.length === 0) {
    return ''
  }
  // A self-diagnosed reason is already a complete sentence and carries no
  // provider status, so it is never decorated with an HTTP code.
  return failure?.reasonKey === undefined && failure?.statusCode !== undefined
    ? t('cheapLfs.pinFailures.reasonWithStatus', {
        status: failure.statusCode.toString(),
        reason,
      })
    : t('cheapLfs.pinFailures.reason', { reason })
}

/** One failed-file row for the Cheap LFS commit terminal. */
export function cheapLfsFailedFileRowText(
  path: string,
  failure: ICheapLfsFailureReasonInput
): string {
  const reason = cheapLfsFailureReasonText(failure)
  if (reason.length === 0) {
    return t('cheapLfs.progress.terminalFailedFileNoReason', { path })
  }
  return failure.reasonKey === undefined && failure.statusCode !== undefined
    ? t('cheapLfs.progress.terminalFailedFileWithStatus', {
        path,
        status: failure.statusCode.toString(),
        reason,
      })
    : t('cheapLfs.progress.terminalFailedFile', { path, reason })
}
