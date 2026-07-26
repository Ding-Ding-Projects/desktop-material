import { Emitter, Disposable } from 'event-kit'
import { Account, getAccountKey } from '../models/account'
import {
  getRepositoryAccountTargetKey,
  IRepositoryAccountTarget,
} from './repository-account-fallback'

/**
 * The pending "another account can see this repository" offers.
 *
 * When `autoSwitchAccountToRepositoryOwner` is off the fallback must not use
 * the identity it found; it records the offer here instead. The user sees a
 * non-blocking notice with a single action and nothing changes until they take
 * it. Offers are keyed by repository so a view that refreshes repeatedly shows
 * one standing offer rather than a growing pile of identical notices.
 *
 * This is deliberately a small standalone registry rather than app-store state:
 * the account-bound API stores have no app-store handle, and an offer is
 * transient UI, never persisted.
 */

export interface IRepositoryAccountFallbackOffer {
  readonly target: IRepositoryAccountTarget
  /** The identity a read-only probe proved can see the repository. */
  readonly account: Account
}

const offers = new Map<string, IRepositoryAccountFallbackOffer>()
const approvals = new Map<string, string>()
const emitter = new Emitter()
const OffersChangedEvent = 'repository-account-fallback-offers-changed'

/** Record (or replace) the standing offer for a repository. */
export function setRepositoryAccountFallbackOffer(
  offer: IRepositoryAccountFallbackOffer
): void {
  offers.set(getRepositoryAccountTargetKey(offer.target), offer)
  emitter.emit(OffersChangedEvent, undefined)
}

/** The standing offer for a repository, if any. */
export function getRepositoryAccountFallbackOffer(
  target: IRepositoryAccountTarget
): IRepositoryAccountFallbackOffer | undefined {
  return offers.get(getRepositoryAccountTargetKey(target))
}

/** Withdraw an offer, e.g. once it has been taken or the error cleared. */
export function clearRepositoryAccountFallbackOffer(
  target: IRepositoryAccountTarget
): void {
  if (offers.delete(getRepositoryAccountTargetKey(target))) {
    emitter.emit(OffersChangedEvent, undefined)
  }
}

/**
 * Withdraw every offer naming an identity, e.g. when it signs out. An offer to
 * use an account that is no longer available would fail the moment it is taken.
 */
export function clearRepositoryAccountFallbackOffersForAccount(
  accountKey: string
): void {
  let changed = false
  for (const [key, offer] of [...offers]) {
    if (getAccountKey(offer.account) === accountKey) {
      offers.delete(key)
      changed = true
    }
  }
  for (const [key, approved] of [...approvals]) {
    if (approved === accountKey) {
      approvals.delete(key)
      changed = true
    }
  }
  if (changed) {
    emitter.emit(OffersChangedEvent, undefined)
  }
}

export function clearAllRepositoryAccountFallbackOffers(): void {
  if (offers.size > 0 || approvals.size > 0) {
    offers.clear()
    approvals.clear()
    emitter.emit(OffersChangedEvent, undefined)
  }
}

/**
 * Take a standing offer: the user has said this repository may use this
 * identity.
 *
 * The approval is what makes the one-click action meaningful while
 * auto-switching is off. It is scoped to a single repository and lives only for
 * the session, so it grants far less than flipping the preference on: the next
 * repository still asks. The offer is withdrawn at the same time, because a
 * notice that stays up after being acted on reads as a failure.
 */
export function approveRepositoryAccountFallback(
  target: IRepositoryAccountTarget,
  accountKey: string
): void {
  approvals.set(getRepositoryAccountTargetKey(target), accountKey)
  offers.delete(getRepositoryAccountTargetKey(target))
  emitter.emit(OffersChangedEvent, undefined)
}

/** The identity the user approved for this repository, if any. */
export function getApprovedRepositoryAccountKey(
  target: IRepositoryAccountTarget
): string | undefined {
  return approvals.get(getRepositoryAccountTargetKey(target))
}

/** Subscribe to offer changes so a notice can appear and disappear live. */
export function onRepositoryAccountFallbackOffersChanged(
  handler: () => void
): Disposable {
  return emitter.on(OffersChangedEvent, handler)
}

/** How many offers are outstanding. Exposed for tests and diagnostics. */
export function getRepositoryAccountFallbackOfferCount(): number {
  return offers.size
}
