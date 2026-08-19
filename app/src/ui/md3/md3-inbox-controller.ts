/**
 * The Inbox destination's muted-thread store.
 *
 * The design contract's `inboxRowMenu` carries "Mute this thread", and
 * `Md3InboxView` renders a MUTED badge for a row whose `muted` flag is set —
 * but the notification centre's own entries have no mute field, so nothing
 * ever set it and the menu item never rendered. The mute is a presentation
 * preference about a subject rather than a property of one logged event, so it
 * lives here, beside the pinned-repository store's precedent, rather than in
 * the on-disk notification log.
 *
 * A thread is identified by `md3NotificationThreadKey` in
 * `md3-destination-adapters`: an entry's own id is a per-event uuid, so muting
 * by id would silence the row in front of the user and nothing that came after
 * it.
 */

import * as LocalStorage from '../../lib/local-storage'

const MutedNotificationThreadsKey = 'md3-inbox-muted-threads'

/**
 * How many muted threads are retained.
 *
 * Muting is unbounded from the user's side — every notification offers it —
 * and the list is read on every render, so it is capped the way the
 * notification log itself is. The oldest mutes fall off first.
 */
export const MutedNotificationThreadCap = 500

/** Every muted thread key, as a set the row mapping can test directly. */
export function getMutedNotificationThreads(): ReadonlySet<string> {
  return new Set(LocalStorage.getStringArray(MutedNotificationThreadsKey))
}

/**
 * Mute or unmute one thread.
 *
 * Returns the resulting set so a caller can hand it straight to the row
 * mapping without a second read.
 */
export function setNotificationThreadMuted(
  threadKey: string,
  muted: boolean
): ReadonlySet<string> {
  const next = applyNotificationThreadMute(
    LocalStorage.getStringArray(MutedNotificationThreadsKey),
    threadKey,
    muted
  )
  LocalStorage.setStringArray(MutedNotificationThreadsKey, next)
  return new Set(next)
}

/**
 * The pure half of {@link setNotificationThreadMuted}, so the cap and the
 * ordering are testable without a `localStorage`.
 */
export function applyNotificationThreadMute(
  current: ReadonlyArray<string>,
  threadKey: string,
  muted: boolean,
  cap: number = MutedNotificationThreadCap
): ReadonlyArray<string> {
  const without = current.filter(key => key !== threadKey)
  const next = muted ? [...without, threadKey] : without
  return next.length > cap ? next.slice(next.length - cap) : next
}
