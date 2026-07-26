import { Account } from '../models/account'
import { LanguageMode } from '../models/language-mode'
import { getPersistedLanguageMode, translate } from './i18n'
import {
  describeProbedAccount,
  describeProbedAccounts,
  describeRepositoryAccountTarget,
  IRepositoryAccountTarget,
} from './repository-account-fallback'

/**
 * User-facing copy for the shared account fallback.
 *
 * Separated from the resolver so the decision logic stays free of presentation
 * and so every surface reports the same thing in the same words. The language
 * mode is a parameter with a persisted default, which keeps these helpers
 * deterministic under test.
 *
 * Two rules govern the copy. Errors are plain: they say the repository was not
 * found and list the identities that were tried, with no jargon and no blame.
 * And logins are ordinary interpolation values, never bilingual variables, so a
 * login is reproduced verbatim in both catalogs rather than being translated.
 */

/** A label naming the identity an operation ended up using. */
export function getRepositoryAccountUsedLabel(
  account: Account,
  mode: LanguageMode = getPersistedLanguageMode()
): string {
  return translate('accountFallback.usingAccount', mode, {
    account: describeProbedAccount(account),
  })
}

/** Progress copy while other identities are being probed. */
export function getRepositoryAccountSearchingLabel(
  target: IRepositoryAccountTarget,
  mode: LanguageMode = getPersistedLanguageMode()
): string {
  return translate('accountFallback.searching', mode, {
    repository: describeRepositoryAccountTarget(target),
  })
}

export interface IRepositoryAccountFallbackNotice {
  readonly title: string
  readonly body: string
  /** Present only when the user must confirm the switch. */
  readonly actionLabel?: string
}

/**
 * The notice shown after the fallback silently adopted another identity,
 * i.e. when `autoSwitchAccountToRepositoryOwner` is on.
 */
export function getRepositoryAccountSwitchedNotice(
  target: IRepositoryAccountTarget,
  account: Account,
  mode: LanguageMode = getPersistedLanguageMode()
): IRepositoryAccountFallbackNotice {
  const variables = {
    repository: describeRepositoryAccountTarget(target),
    account: describeProbedAccount(account),
  }

  return {
    title: translate('accountFallback.switchedTitle', mode),
    body: translate('accountFallback.switchedBody', mode, variables),
  }
}

/**
 * The notice shown when auto-switching is off: state what was found and offer a
 * one-click switch rather than changing the active identity behind the user's
 * back.
 */
export function getRepositoryAccountAskNotice(
  target: IRepositoryAccountTarget,
  account: Account,
  mode: LanguageMode = getPersistedLanguageMode()
): IRepositoryAccountFallbackNotice {
  const variables = {
    repository: describeRepositoryAccountTarget(target),
    account: describeProbedAccount(account),
  }

  return {
    title: translate('accountFallback.askTitle', mode),
    body: translate('accountFallback.askBody', mode, variables),
    actionLabel: translate('accountFallback.askAction', mode, {
      account: describeProbedAccount(account),
    }),
  }
}

/**
 * The plain error reported only after every eligible identity failed.
 *
 * The identities tried are listed so the user can tell "I am signed in with the
 * wrong account" apart from "this repository really is gone". When nothing was
 * eligible we say so explicitly instead of claiming accounts were tried.
 */
export function getRepositoryAccountExhaustedNotice(
  target: IRepositoryAccountTarget,
  triedAccounts: ReadonlyArray<Account>,
  mode: LanguageMode = getPersistedLanguageMode()
): IRepositoryAccountFallbackNotice {
  const repository = describeRepositoryAccountTarget(target)

  if (triedAccounts.length === 0) {
    return {
      title: translate('accountFallback.notFoundTitle', mode),
      body: translate('accountFallback.notFoundNoAccounts', mode, {
        repository,
      }),
    }
  }

  return {
    title: translate('accountFallback.notFoundTitle', mode),
    body: `${translate('accountFallback.notFoundBody', mode, {
      repository,
    })} ${translate('accountFallback.triedAccounts', mode, {
      accounts: describeProbedAccounts(triedAccounts),
    })}`,
  }
}
