/**
 * The MD3 shell's presentation preferences.
 *
 * Six of the contract's menu rows flip a value that decides how a destination
 * draws itself rather than performing an operation: which way round the commit
 * list is sorted, whether it is grouped by day, whether the graph column is
 * drawn, whether long diff lines wrap, how many context lines a diff shows, and
 * whether the changes list is grouped by folder. Every one of them shows its
 * live value as the menu row's hint.
 *
 * None of the six had an owner. The app store carries the diff mode and the
 * whitespace setting, but nothing in it knows about commit sorting or the graph
 * column, so a menu item flipping one of these had nowhere to write — and a hint
 * reading "Newest first" while the menu could not tell you whether that was
 * true is exactly the quiet wrongness a hint exists to prevent.
 *
 * So they live here: persisted through the same `getBoolean`/`setBoolean`
 * local-storage store every other UI preference uses (never a second store),
 * read back by the menu context so each hint states the real value, and
 * broadcast on a window event so a mounted shell updates the moment one
 * changes. When a destination's MD3 view is wired it consumes this module
 * rather than growing its own copy of the same six values.
 */

import {
  getBoolean,
  getEnum,
  getNumber,
  setBoolean,
  setNumber,
} from './local-storage'

/** Which way round the commit list is ordered. */
export type Md3CommitSortOrder = 'newest' | 'oldest'

/** The sort orders, as `getEnum` wants them. */
const CommitSortOrders: Record<string, Md3CommitSortOrder> = {
  newest: 'newest',
  oldest: 'oldest',
}

/** Local-storage keys. Stable: renaming one silently forgets the preference. */
export const Md3CommitSortOrderKey = 'md3-commit-sort-order'
export const Md3GroupCommitsByDayKey = 'md3-group-commits-by-day'
export const Md3CommitGraphVisibleKey = 'md3-commit-graph-visible'
export const Md3WrapLongLinesKey = 'md3-wrap-long-lines'
export const Md3DiffContextLinesKey = 'md3-diff-context-lines'
export const Md3GroupChangesByFolderKey = 'md3-group-changes-by-folder'
export const Md3ActionsRunListWidthKey = 'md3-actions-run-list-width'
export const Md3LogGroupsCollapsedKey = 'md3-log-groups-collapsed'

/** Fired on `window` whenever any of the six changes. */
export const Md3ViewPreferencesChangedEvent =
  'desktop-material-md3-view-preferences-changed'

/**
 * The fewest and most context lines a diff may be asked for.
 *
 * Three is Git's own default and the value the contract's hint shows; twenty
 * is where more context stops adding information and starts being the whole
 * file. A stored value outside the range is clamped rather than honoured, so a
 * hand-edited profile cannot ask the diff machinery for something it will
 * refuse.
 */
export const Md3MinDiffContextLines = 1
export const Md3MaxDiffContextLines = 20

/** How far one `increaseDiffContextLines` step moves. */
export const Md3DiffContextLineStep = 3

/**
 * The widths the Actions run list steps through.
 *
 * The contract draws one 356px run list and no divider, so a pointer drag has
 * nothing to grab. The capability the replaced surface had was "make the run
 * list narrower or wider", and a menu row that steps through named widths
 * delivers exactly that from the keyboard as well as the pointer — which a
 * drag handle never did. 356 is the contract's own width and is therefore the
 * default; the stepper wraps, for the same reason `stepMd3DiffContextLines`
 * does, so one row can reach every value.
 */
export const Md3ActionsRunListWidths: ReadonlyArray<number> = [
  280, 356, 440, 560,
]

/** The shipped defaults, in one place so a reset cannot drift from a read. */
export const Md3ViewPreferenceDefaults = {
  commitSortOrder: 'newest' as Md3CommitSortOrder,
  groupCommitsByDay: true,
  commitGraphVisible: true,
  wrapLongLines: false,
  diffContextLines: 3,
  groupChangesByFolder: true,
  actionsRunListWidth: 356,
  logGroupsCollapsed: false,
} as const

/** Every persisted presentation preference, resolved. */
export interface IMd3ViewPreferences {
  readonly commitSortOrder: Md3CommitSortOrder
  readonly groupCommitsByDay: boolean
  readonly commitGraphVisible: boolean
  readonly wrapLongLines: boolean
  readonly diffContextLines: number
  readonly groupChangesByFolder: boolean

  /** How wide the Actions run list is drawn, in CSS pixels. */
  readonly actionsRunListWidth: number

  /** Whether `::group::` sections of a job log start collapsed. */
  readonly logGroupsCollapsed: boolean
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Keep a stored or requested context count inside the supported range. */
export function clampMd3DiffContextLines(value: number): number {
  if (!Number.isFinite(value)) {
    return Md3ViewPreferenceDefaults.diffContextLines
  }
  return Math.min(
    Md3MaxDiffContextLines,
    Math.max(Md3MinDiffContextLines, Math.round(value))
  )
}

/** Read every preference, falling back to the shipped defaults. */
export function getMd3ViewPreferences(): IMd3ViewPreferences {
  if (!hasStorage()) {
    return { ...Md3ViewPreferenceDefaults }
  }

  return {
    commitSortOrder:
      getEnum(Md3CommitSortOrderKey, CommitSortOrders) ??
      Md3ViewPreferenceDefaults.commitSortOrder,
    groupCommitsByDay: getBoolean(
      Md3GroupCommitsByDayKey,
      Md3ViewPreferenceDefaults.groupCommitsByDay
    ),
    commitGraphVisible: getBoolean(
      Md3CommitGraphVisibleKey,
      Md3ViewPreferenceDefaults.commitGraphVisible
    ),
    wrapLongLines: getBoolean(
      Md3WrapLongLinesKey,
      Md3ViewPreferenceDefaults.wrapLongLines
    ),
    diffContextLines: clampMd3DiffContextLines(
      getNumber(
        Md3DiffContextLinesKey,
        Md3ViewPreferenceDefaults.diffContextLines
      )
    ),
    groupChangesByFolder: getBoolean(
      Md3GroupChangesByFolderKey,
      Md3ViewPreferenceDefaults.groupChangesByFolder
    ),
    actionsRunListWidth: normalizeMd3ActionsRunListWidth(
      getNumber(
        Md3ActionsRunListWidthKey,
        Md3ViewPreferenceDefaults.actionsRunListWidth
      )
    ),
    logGroupsCollapsed: getBoolean(
      Md3LogGroupsCollapsedKey,
      Md3ViewPreferenceDefaults.logGroupsCollapsed
    ),
  }
}

/**
 * Snap a stored or requested run-list width onto one of the offered widths.
 *
 * A hand-edited profile holding 4000 would push the detail pane off the pane
 * entirely, and there is no drag handle to pull it back with, so an unknown
 * value becomes the nearest offered one rather than being honoured.
 */
export function normalizeMd3ActionsRunListWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return Md3ViewPreferenceDefaults.actionsRunListWidth
  }
  let closest = Md3ActionsRunListWidths[0]
  for (const width of Md3ActionsRunListWidths) {
    if (Math.abs(width - value) < Math.abs(closest - value)) {
      closest = width
    }
  }
  return closest
}

function announce() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(Md3ViewPreferencesChangedEvent))
  }
}

/** Persist the commit sort order and tell every mounted surface. */
export function setMd3CommitSortOrder(
  value: Md3CommitSortOrder
): Md3CommitSortOrder {
  if (hasStorage()) {
    // `getEnum` has no `setEnum` companion by design; the store's own comment
    // says to write the value directly.
    localStorage.setItem(Md3CommitSortOrderKey, value)
  }
  announce()
  return value
}

/** Persist "group commits by day". */
export function setMd3GroupCommitsByDay(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(Md3GroupCommitsByDayKey, normalized)
  }
  announce()
  return normalized
}

/** Persist whether the commit graph column is drawn. */
export function setMd3CommitGraphVisible(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(Md3CommitGraphVisibleKey, normalized)
  }
  announce()
  return normalized
}

/** Persist whether long diff lines wrap. */
export function setMd3WrapLongLines(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(Md3WrapLongLinesKey, normalized)
  }
  announce()
  return normalized
}

/** Persist the diff context-line count, clamped to the supported range. */
export function setMd3DiffContextLines(value: number): number {
  const clamped = clampMd3DiffContextLines(value)
  if (hasStorage()) {
    setNumber(Md3DiffContextLinesKey, clamped)
  }
  announce()
  return clamped
}

/**
 * Step the context-line count up, wrapping back to the minimum once it passes
 * the maximum.
 *
 * The contract's row is "Increase context lines" with no matching decrease, so
 * a count that could only ever climb would be a one-way door: the wrap is what
 * makes one menu item enough to reach every value.
 */
export function stepMd3DiffContextLines(current: number): number {
  const next = clampMd3DiffContextLines(current) + Md3DiffContextLineStep
  return setMd3DiffContextLines(
    next > Md3MaxDiffContextLines ? Md3MinDiffContextLines : next
  )
}

/** Persist whether the changes list is grouped by folder. */
export function setMd3GroupChangesByFolder(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(Md3GroupChangesByFolderKey, normalized)
  }
  announce()
  return normalized
}

/** Persist the Actions run-list width, snapped to an offered width. */
export function setMd3ActionsRunListWidth(value: number): number {
  const normalized = normalizeMd3ActionsRunListWidth(value)
  if (hasStorage()) {
    setNumber(Md3ActionsRunListWidthKey, normalized)
  }
  announce()
  return normalized
}

/** Step the run list to the next offered width, wrapping at the widest. */
export function stepMd3ActionsRunListWidth(current: number): number {
  const index = Md3ActionsRunListWidths.indexOf(
    normalizeMd3ActionsRunListWidth(current)
  )
  const next =
    Md3ActionsRunListWidths[(index + 1) % Md3ActionsRunListWidths.length]
  return setMd3ActionsRunListWidth(next)
}

/** Persist whether job-log `::group::` sections start collapsed. */
export function setMd3LogGroupsCollapsed(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(Md3LogGroupsCollapsedKey, normalized)
  }
  announce()
  return normalized
}
