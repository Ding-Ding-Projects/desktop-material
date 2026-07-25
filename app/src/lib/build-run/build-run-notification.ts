import { INotificationInput } from '../../models/notification-centre'
import { LanguageMode } from '../../models/language-mode'
import { translate } from '../i18n'
import { BuildRunPhase } from './types'

/**
 * Compose the non-blocking notification-centre entry for a finished Build & Run.
 *
 * Pure and localized: it returns `null` for phases that should not notify
 * (anything other than a terminal success or failure — a user-initiated
 * cancellation is deliberately silent), and otherwise a ready-to-post
 * {@link INotificationInput} whose title/body are translated for the given
 * language mode. Build outcomes previously surfaced only inside the Build & Run
 * panel, so a minimized or closed panel hid the result; this routes them to the
 * reviewable notification centre as well.
 */
export function composeBuildRunNotification(
  repositoryId: number,
  repositoryName: string,
  phase: BuildRunPhase,
  exitCode: number | null,
  mode: LanguageMode
): INotificationInput | null {
  if (phase !== 'succeeded' && phase !== 'failed') {
    return null
  }

  const succeeded = phase === 'succeeded'
  const title = translate(
    succeeded
      ? 'buildRun.notify.succeededTitle'
      : 'buildRun.notify.failedTitle',
    mode
  )
  const body = succeeded
    ? translate('buildRun.notify.succeededBody', mode, {
        repository: repositoryName,
      })
    : translate('buildRun.notify.failedBody', mode, {
        repository: repositoryName,
        code: exitCode === null ? '?' : String(exitCode),
      })

  return {
    kind: 'build-run',
    title,
    body,
    repositoryId,
    action: { kind: 'open-repository', repositoryId },
  }
}
