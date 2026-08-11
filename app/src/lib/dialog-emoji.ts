/**
 * "Show emojis in dialogs and message boxes".
 *
 * A dialog decoration is exactly that: decoration. It is a single emoji
 * rendered beside a dialog's title, and it carries no meaning the user could
 * lose by never seeing it. That is the whole boundary this module exists to
 * hold, and it is easy to get wrong in a way that compiles:
 *
 *  - the decoration must never enter an accessible name, so it is rendered
 *    outside whatever element `aria-labelledby` points at and marked
 *    `aria-hidden`;
 *  - it must never appear in a button, an action label, a field label, or any
 *    other control text — those are the strings a user reads to decide what a
 *    control does, and an emoji in one of them is the app deciding for them;
 *  - the factual copy must read identically whether the setting is on or off.
 *    Turning decoration on adds a glyph; it never rewrites a sentence.
 *
 * A dialog therefore asks for *the decoration for a kind of dialog* rather
 * than hard-coding a glyph, so the mapping lives here, once, and switching the
 * setting off removes every one of them from one place.
 *
 * The preference itself round-trips through the same local-storage boolean
 * store every other UI preference uses (`getBoolean` / `setBoolean`); it is not
 * a second store.
 */

import { getBoolean, setBoolean } from './local-storage'

/** Local-storage key for the persisted toggle. */
export const ShowDialogEmojiKey = 'show-dialog-emoji'

/**
 * Shipped default. Decoration is on out of the box: it is purely additive, it
 * cannot obscure a fact, and a user who does not want it turns it off once.
 */
export const ShowDialogEmojiDefault = true

/** Fired on `window` whenever the preference changes, so mounted dialogs update. */
export const ShowDialogEmojiChangedEvent =
  'desktop-material-dialog-emoji-changed'

/**
 * The kinds of dialog a decoration can be asked for.
 *
 * These name the *situation*, never the glyph. A caller asking for
 * `'destructive'` keeps working when the catalog below decides a different
 * emoji reads better, and a reviewer can tell at the call site whether the
 * decoration is relevant without knowing what any emoji looks like.
 */
export type DialogDecorationKind =
  | 'information'
  | 'question'
  | 'warning'
  | 'error'
  | 'destructive'
  | 'success'
  | 'progress'
  | 'security'
  | 'account'
  | 'repository'
  | 'branch'
  | 'commit'
  | 'sync'
  | 'search'
  | 'settings'
  | 'update'
  | 'terminal'
  | 'agent'
  | 'export'
  | 'file'
  | 'celebration'

/**
 * The one place a dialog kind becomes a glyph.
 *
 * Every entry is a single decorative emoji. Nothing here is ever concatenated
 * into a translated string, a label, or an accessible name — the renderer puts
 * it in its own `aria-hidden` element beside the title.
 */
export const DialogDecorations: Readonly<Record<DialogDecorationKind, string>> =
  {
    information: '💬',
    question: '❓',
    warning: '⚠️',
    error: '❌',
    destructive: '🧨',
    success: '✅',
    progress: '⏳',
    security: '🔐',
    account: '👤',
    repository: '📦',
    branch: '🌿',
    commit: '📝',
    sync: '🔄',
    search: '🔎',
    settings: '⚙️',
    update: '🚀',
    terminal: '🖥️',
    agent: '🤖',
    export: '📤',
    file: '📄',
    celebration: '🎉',
  }

/** Every decoration kind, in catalog order. Useful to tests and documentation. */
export const dialogDecorationKinds = Object.keys(
  DialogDecorations
) as ReadonlyArray<DialogDecorationKind>

/** Every glyph the catalog can render. Used by guards that assert absence. */
export const dialogDecorationEmoji: ReadonlyArray<string> =
  Object.values(DialogDecorations)

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Read the persisted preference, falling back to the shipped default. */
export function getShowDialogEmoji(): boolean {
  if (!hasStorage()) {
    return ShowDialogEmojiDefault
  }
  return getBoolean(ShowDialogEmojiKey, ShowDialogEmojiDefault)
}

/**
 * Persist the preference and tell every mounted surface.
 *
 * Returns the value actually stored so a caller never has to guess.
 */
export function setShowDialogEmoji(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(ShowDialogEmojiKey, normalized)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(ShowDialogEmojiChangedEvent))
  }
  return normalized
}

/**
 * Where the current value came from.
 *
 * `'default'` means nobody has ever chosen: the app is falling back to its own
 * compiled-in value. `'stored'` means a real recorded choice. The settings
 * surface states this rather than the opaque word "default", so a user can tell
 * a deliberate `false` from a value that has simply never been set.
 */
export type DialogEmojiProvenance = 'default' | 'stored'

/** Report whether the live value is a recorded choice or the shipped fallback. */
export function getShowDialogEmojiProvenance(): DialogEmojiProvenance {
  if (!hasStorage()) {
    return 'default'
  }
  return getBoolean(ShowDialogEmojiKey) === undefined ? 'default' : 'stored'
}

/**
 * Resolve the decoration a dialog should render, or `null` when it should
 * render none.
 *
 * `enabled` is a parameter so a caller that already knows the live value — a
 * React subtree subscribed to the change event, for instance — does not read
 * local storage once per dialog.
 */
export function resolveDialogDecoration(
  kind: DialogDecorationKind | undefined,
  enabled: boolean = getShowDialogEmoji()
): string | null {
  if (kind === undefined || !enabled) {
    return null
  }
  return DialogDecorations[kind] ?? null
}
