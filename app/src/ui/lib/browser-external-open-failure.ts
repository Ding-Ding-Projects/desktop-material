import { translate } from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'

export const BrowserExternalOpenFailureNoticeKey =
  'browser-external-open-failed'

export interface IBrowserExternalOpenFailurePresenter {
  readonly showPersistentErrorNotice: (
    title: string,
    message: string,
    dedupeKey: string
  ) => void
}

/** Present the detail-free main-process failure as one localized notice. */
export function showBrowserExternalOpenFailure(
  presenter: IBrowserExternalOpenFailurePresenter,
  languageMode: LanguageMode
): void {
  presenter.showPersistentErrorNotice(
    translate('browser.error.externalOpenFailedTitle', languageMode),
    translate('browser.error.externalOpenFailed', languageMode),
    BrowserExternalOpenFailureNoticeKey
  )
}
