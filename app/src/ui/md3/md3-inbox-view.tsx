import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { compileSafeRegex } from '../../lib/safe-regex'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GhostButton,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import { statusTone } from './md3-style-contract'
import { Md3MenuOverlay } from './md3-menu-overlay'
import { IMd3MenuItem, IMd3MenuSpec } from './md3-menu-specs'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { Md3DestructiveGate } from './md3-destructive-gate'
import {
  IMd3InboxExport,
  IMd3InboxExportRecord,
  Md3InboxExportFormat,
  Md3InboxExportFormats,
  serializeMd3InboxExport,
} from './md3-inbox-export'
import { notify } from './md3-toast'

/**
 * The Inbox destination of the MD3 shell rewrite — the
 * `<sc-if value="{{ isInbox }}">` branch of `design/History MD3.dc.html`.
 *
 * The contract draws one full-width pane: a search field bound to the `inbox`
 * key, the Unread / Failures / Mentions chips with a trailing "Mark all read",
 * and the notification rows. Each row is an unread dot, a tone-coloured glyph,
 * the title / meta / detail column, a relative time, a read-state toggle whose
 * glyph flips between `mark_email_read` and `mark_email_unread`, and a delete
 * button; a read row drops to 62% opacity. Every measurement lives in
 * `app/styles/ui/_md3-inbox.scss`.
 *
 * This is a real list, so it carries what the project asks of every list and
 * the contract's prototype never drew: multi-select by click, shift-click and
 * keyboard; a select-all that says out loud whether it means the filtered set
 * or everything; an inverse selection; and bulk mark-read, mark-unread, delete
 * and export scoped to the active filter. Bulk deletion is irreversible in one
 * gesture, so it goes through the repository's destructive-action super
 * confirmation; deleting a single row does not, because that path raises a
 * toast with a working Undo.
 *
 * It is a presentation of the existing notification centre store, not a second
 * notification system. Every mutation leaves through a prop, so the same
 * dispatcher calls the notification centre panel already makes — `markNotificationRead`,
 * `setNotificationsRead`, `deleteNotifications`, `markAllNotificationsRead`,
 * `undoLastNotificationChange` — are the ones that run.
 */

/** The contract's notification tones, keyed exactly as `statusTone()` reads them. */
export type Md3InboxTone = 'ok' | 'bad' | 'info'

/** The contract's three filter chips, by stable identity rather than label. */
export type Md3InboxFilter = 'unread' | 'failures' | 'mentions'

/** The chips in the order the contract renders them. */
const FilterOrder: ReadonlyArray<Md3InboxFilter> = [
  'unread',
  'failures',
  'mentions',
]

/** The glyph size of a row's tone icon, per the contract's `iconStyle`. */
const RowIconGlyphSize = 17

/** The glyph size inside the row's trailing 26px buttons. */
const RowButtonGlyphSize = 15

/** Sample titles handed to the regex builder's live tester. */
const MaxBuilderSamples = 50

/** One notification row. */
export interface IMd3InboxNotification {
  /** Stable identity — the notification centre entry's own id. */
  readonly id: string

  /** The bold first line. */
  readonly title: string

  /** The contract's second line: who, where, which run. */
  readonly meta: string

  /**
   * `owner/repo`, rendered as the first segment of the detail line. Omit it
   * for a notification that is not scoped to a repository; the detail line
   * then opens with the read state instead of inventing a source.
   */
  readonly source?: string

  /** The contract's per-notification glyph. */
  readonly icon: MaterialSymbolName

  readonly tone: Md3InboxTone

  /** The right-aligned relative time, already formatted: "2m", "Yesterday". */
  readonly time: string

  /**
   * ISO-8601. Not rendered in the row, but announced to assistive technology
   * and written into every export, because "Yesterday" stops being an answer
   * the moment the file leaves the application.
   */
  readonly createdAt: string

  readonly read: boolean

  /**
   * Whether this notification mentions the signed-in user, which is what the
   * Mentions chip filters on. Defaults to the contract's own rule — the
   * `alternate_email` glyph — so a caller that has no better signal still
   * gets the contract's behaviour.
   */
  readonly mention?: boolean

  /** Present when "Open in browser" applies to this row. */
  readonly externalUrl?: string

  /** Whether this thread is muted. Rendered as a badge beside the title. */
  readonly muted?: boolean

  /** The notification's human-readable kind, for search and export. */
  readonly kindLabel?: string
}

/** An export the view has already serialized, ready for the host to write. */
export interface IMd3InboxExportRequest {
  readonly payload: IMd3InboxExport
  /** The rows the payload was built from, in the order they were exported. */
  readonly notifications: ReadonlyArray<IMd3InboxNotification>
}

export interface IMd3InboxViewProps {
  /**
   * The notifications to show, newest first. The view filters and sorts
   * nothing beyond the search field and the chips — the order it is handed is
   * the order it renders.
   */
  readonly notifications: ReadonlyArray<IMd3InboxNotification>

  /**
   * Activate a notification: follow its action and mark it read, exactly as
   * the notification centre's own row activation does.
   */
  readonly onOpen: (notification: IMd3InboxNotification) => void

  /** Set the read state of one or many notifications in a single change. */
  readonly onSetRead: (ids: ReadonlyArray<string>, read: boolean) => void

  /** Delete one or many notifications in a single change. */
  readonly onDelete: (ids: ReadonlyArray<string>) => void

  /** The contract's "Mark all read" — every notification, not the filtered set. */
  readonly onMarkAllRead: () => void

  /**
   * Undo the last notification change, which is what makes the delete toast's
   * Undo real. Omit it and no Undo action is rendered, because an Undo button
   * that does nothing is worse than none.
   */
  readonly onUndoLastChange?: () => void

  /** Open a notification's own URL in the browser. */
  readonly onOpenExternal?: (notification: IMd3InboxNotification) => void

  /** Mute or unmute a notification's thread. */
  readonly onSetMuted?: (
    notification: IMd3InboxNotification,
    muted: boolean
  ) => void

  /** Open the notification automations dialog for one notification. */
  readonly onOpenAutomations?: (notification: IMd3InboxNotification) => void

  /** Open the git-backed notification history. */
  readonly onOpenHistory?: () => void

  /** Open the GitHub notification inbox, which is a separate server-side source. */
  readonly onOpenGitHubInbox?: () => void

  /** Write an export the view has already serialized. */
  readonly onExport?: (request: IMd3InboxExportRequest) => void

  /** Copy one notification's details to the clipboard. */
  readonly onCopyDetails?: (text: string) => void
}

type OpenMenu =
  | { readonly kind: 'row'; readonly id: string }
  | { readonly kind: 'list' }
  | {
      readonly kind: 'export'
      /** `null` exports the current scope; an id exports that row alone. */
      readonly only: string | null
    }
  | null

function filterLabel(filter: Md3InboxFilter): string {
  switch (filter) {
    case 'unread':
      return t('md3.inbox.chip.unread')
    case 'failures':
      return t('md3.inbox.chip.failures')
    case 'mentions':
      return t('md3.inbox.chip.mentions')
  }
}

/** The contract's `n.tone.replace('ok','success').replace('bad','failure')`. */
export function md3InboxToneWord(tone: Md3InboxTone): string {
  switch (tone) {
    case 'ok':
      return t('md3.inbox.tone.success')
    case 'bad':
      return t('md3.inbox.tone.failure')
    case 'info':
      return t('md3.inbox.tone.info')
  }
}

/** The contract's `alternate_email` rule, overridable per notification. */
export function md3InboxIsMention(
  notification: IMd3InboxNotification
): boolean {
  return notification.mention ?? notification.icon === 'alternate_email'
}

/**
 * The contract's third row line:
 * `'material/' + repo + ' · ' + (isRead ? 'read' : 'unread') + ' · ' + tone`.
 */
export function md3InboxDetailLine(
  notification: IMd3InboxNotification
): string {
  const state = notification.read
    ? t('md3.inbox.state.read')
    : t('md3.inbox.state.unread')
  const tone = md3InboxToneWord(notification.tone)
  return notification.source === undefined
    ? t('md3.inbox.detailNoSource', { state, tone })
    : t('md3.inbox.detail', { source: notification.source, state, tone })
}

/** Flatten a row for {@link serializeMd3InboxExport}. */
export function md3InboxExportRecord(
  notification: IMd3InboxNotification
): IMd3InboxExportRecord {
  return {
    id: notification.id,
    title: notification.title,
    meta: notification.meta,
    source: notification.source ?? '',
    tone: md3InboxToneWord(notification.tone),
    state: notification.read
      ? t('md3.inbox.state.read')
      : t('md3.inbox.state.unread'),
    kind: notification.kindLabel ?? '',
    time: notification.time,
    createdAt: notification.createdAt,
    read: notification.read,
    muted: notification.muted === true,
  }
}

/** The search and chip state the filter reads. */
export interface IMd3InboxFilterState {
  readonly query: string
  readonly regexEnabled: boolean
  readonly caseSensitive: boolean
  readonly filters: ReadonlySet<Md3InboxFilter>
}

export interface IMd3InboxFilterResult {
  readonly visible: ReadonlyArray<IMd3InboxNotification>
  /**
   * True when regex mode holds a pattern that will not compile. The list is
   * left unfiltered in that case and the view says so, exactly as the menu
   * overlay's own filter does — silently showing nothing while somebody is
   * halfway through typing `(` reads as a broken list.
   */
  readonly patternInvalid: boolean
}

/**
 * The contract's `visibleInbox` computation.
 *
 * It matches the row's own visible text: the title and meta the contract
 * matches, plus the repository and kind its detail line shows. A word a user
 * can read in a row is a word they will type into the field above it.
 */
export function filterMd3InboxNotifications(
  notifications: ReadonlyArray<IMd3InboxNotification>,
  state: IMd3InboxFilterState
): IMd3InboxFilterResult {
  const { query, regexEnabled, caseSensitive, filters } = state
  const trimmed = query.trim()

  let test: ((value: string) => boolean) | null = null
  let patternInvalid = false

  if (trimmed.length > 0) {
    if (regexEnabled) {
      const { regex } = compileSafeRegex(trimmed, caseSensitive)
      if (regex === null) {
        patternInvalid = true
      } else {
        test = value => regex.test(value)
      }
    } else {
      const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
      test = value =>
        (caseSensitive ? value : value.toLowerCase()).includes(needle)
    }
  }

  const visible = notifications.filter(notification => {
    if (test !== null) {
      const haystack = [
        notification.title,
        notification.meta,
        notification.source ?? '',
        notification.kindLabel ?? '',
      ]
      if (!haystack.some(test)) {
        return false
      }
    }
    if (filters.has('unread') && notification.read) {
      return false
    }
    if (filters.has('failures') && notification.tone !== 'bad') {
      return false
    }
    if (filters.has('mentions') && !md3InboxIsMention(notification)) {
      return false
    }
    return true
  })

  return { visible, patternInvalid }
}

interface IMd3InboxRowProps {
  readonly notification: IMd3InboxNotification
  readonly index: number
  readonly selected: boolean
  readonly focused: boolean
  readonly onOpen: (
    notification: IMd3InboxNotification,
    index: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onToggleSelected: (
    notification: IMd3InboxNotification,
    index: number,
    extend: boolean
  ) => void
  readonly onToggleRead: (notification: IMd3InboxNotification) => void
  readonly onDelete: (notification: IMd3InboxNotification) => void
  readonly onContextMenu: (
    notification: IMd3InboxNotification,
    index: number,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void
  readonly registerRow: (id: string, element: HTMLDivElement | null) => void
}

function Md3InboxRow(props: IMd3InboxRowProps) {
  const {
    notification,
    index,
    selected,
    focused,
    onOpen,
    onToggleSelected,
    onToggleRead,
    onDelete,
    onContextMenu,
    onKeyDown,
    registerRow,
  } = props

  const tone = statusTone(notification.tone)

  const rowRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      registerRow(notification.id, element)
      if (element === null) {
        return
      }
      // In a grid the row is the tab stop and its cells are reached with the
      // arrow keys. Leaving the row's own buttons in the tab order would put
      // two Tab stops on every notification — a thousand of them in a full
      // inbox — which is exactly the tab-through-everything list this pattern
      // exists to avoid. React has no `tabIndex` prop on `Md3IconButton`, and
      // child refs attach before their parent's, so the buttons are already in
      // the DOM here.
      for (const button of element.querySelectorAll('button')) {
        button.tabIndex = -1
      }
    },
    [registerRow, notification.id]
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) =>
      onOpen(notification, index, event),
    [onOpen, notification, index]
  )

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) =>
      onContextMenu(notification, index, event),
    [onContextMenu, notification, index]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => onKeyDown(index, event),
    [onKeyDown, index]
  )

  // The checkbox is driven from its click rather than its change event so a
  // shift-click can extend the range; `onChange` carries no modifier keys.
  const handleSelectClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation()
      onToggleSelected(notification, index, event.shiftKey)
    },
    [onToggleSelected, notification, index]
  )

  const handleSelectChange = React.useCallback(() => {
    // Handled by the click above; React still wants a change handler on a
    // controlled checkbox.
  }, [])

  const handleToggleRead = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onToggleRead(notification)
    },
    [onToggleRead, notification]
  )

  const handleDelete = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onDelete(notification)
    },
    [onDelete, notification]
  )

  const readLabel = notification.read
    ? t('md3.inbox.row.markUnread', { title: notification.title })
    : t('md3.inbox.row.markRead', { title: notification.title })

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       a grid row is the focusable unit of this list: it carries roving
       tabindex, answers Enter and Space, and is reached by the arrow keys. */
    <div
      ref={rowRef}
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      className={classNames('md3-row', 'md3-inbox__row', {
        'md3-inbox__row--read': notification.read,
        'md3-inbox__row--selected': selected,
      })}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      <span role="gridcell" className="md3-inbox__cell md3-inbox__cell--select">
        <input
          type="checkbox"
          className="md3-inbox-checkbox"
          tabIndex={-1}
          checked={selected}
          aria-label={t('md3.inbox.row.select', { title: notification.title })}
          onClick={handleSelectClick}
          onChange={handleSelectChange}
        />
      </span>
      <span role="gridcell" className="md3-inbox__cell md3-inbox__cell--tone">
        {notification.read ? null : (
          <span className="md3-inbox__dot" aria-hidden={true} />
        )}
        <MaterialSymbol
          name={notification.icon}
          className={classNames('md3-inbox__icon', tone.on)}
          size={RowIconGlyphSize}
        />
      </span>
      <span role="gridcell" className="md3-inbox__cell md3-inbox__text">
        <span className="md3-inbox__title">
          {notification.title}
          {notification.muted === true ? (
            <span className="md3-inbox__badge">{t('md3.inbox.muted')}</span>
          ) : null}
        </span>
        <span className="md3-inbox__meta">{notification.meta}</span>
        <span className="md3-row__detail">
          {md3InboxDetailLine(notification)}
        </span>
        <span className="sr-only">
          {t('md3.inbox.row.received', { timestamp: notification.createdAt })}
        </span>
      </span>
      <span role="gridcell" className="md3-inbox__cell md3-inbox__time">
        {notification.time}
      </span>
      <span role="gridcell" className="md3-inbox__cell">
        <Md3IconButton
          small={true}
          icon={notification.read ? 'mark_email_unread' : 'mark_email_read'}
          iconSize={RowButtonGlyphSize}
          label={readLabel}
          pressed={notification.read}
          onClick={handleToggleRead}
          onContextMenu={handleContextMenu}
        />
      </span>
      <span role="gridcell" className="md3-inbox__cell">
        <Md3IconButton
          small={true}
          icon="delete"
          iconSize={RowButtonGlyphSize}
          label={t('md3.inbox.row.delete', { title: notification.title })}
          onClick={handleDelete}
          onContextMenu={handleContextMenu}
        />
      </span>
    </div>
  )
}

export function Md3InboxView(props: IMd3InboxViewProps) {
  const {
    notifications,
    onOpen,
    onSetRead,
    onDelete,
    onMarkAllRead,
    onUndoLastChange,
    onOpenExternal,
    onSetMuted,
    onOpenAutomations,
    onOpenHistory,
    onOpenGitHubInbox,
    onExport,
    onCopyDetails,
  } = props

  const [query, setQuery] = React.useState('')
  const [regexEnabled, setRegexEnabled] = React.useState(false)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [builderOpen, setBuilderOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<ReadonlySet<Md3InboxFilter>>(
    () => new Set<Md3InboxFilter>()
  )
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [focusIndex, setFocusIndex] = React.useState(0)
  const [menu, setMenu] = React.useState<OpenMenu>(null)
  const [gateOpen, setGateOpen] = React.useState(false)

  const rowElements = React.useRef(new Map<string, HTMLDivElement>())
  const anchorIndex = React.useRef<number | null>(null)
  const pendingFocus = React.useRef(false)
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)
  const listMenuButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  // The gate anchors itself beside the control that opened it, and focus
  // returns there when it closes either way.
  const bulkDeleteButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const registerRow = React.useCallback(
    (id: string, element: HTMLDivElement | null) => {
      if (element === null) {
        rowElements.current.delete(id)
      } else {
        rowElements.current.set(id, element)
      }
    },
    []
  )

  const { visible, patternInvalid } = React.useMemo(
    () =>
      filterMd3InboxNotifications(notifications, {
        query,
        regexEnabled,
        caseSensitive,
        filters,
      }),
    [notifications, query, regexEnabled, caseSensitive, filters]
  )

  const filtersActive = filters.size > 0 || query.trim().length > 0

  // Selection survives a filter change — deliberately, so a user can build a
  // selection across several searches — but never survives the disappearance
  // of the notification it pointed at.
  React.useEffect(() => {
    setSelected(current => {
      if (current.size === 0) {
        return current
      }
      const live = new Set(notifications.map(entry => entry.id))
      const next = new Set([...current].filter(id => live.has(id)))
      return next.size === current.size ? current : next
    })
  }, [notifications])

  React.useEffect(() => {
    setFocusIndex(current =>
      visible.length === 0 ? 0 : Math.min(current, visible.length - 1)
    )
  }, [visible.length])

  React.useEffect(() => {
    if (!pendingFocus.current) {
      return
    }
    pendingFocus.current = false
    const target = visible[focusIndex]
    if (target !== undefined) {
      rowElements.current.get(target.id)?.focus()
    }
  }, [focusIndex, visible])

  const selectedVisibleCount = React.useMemo(
    () => visible.filter(entry => selected.has(entry.id)).length,
    [visible, selected]
  )

  React.useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate =
        selectedVisibleCount > 0 && selectedVisibleCount < visible.length
    }
  }, [selectedVisibleCount, visible.length])

  const selectedNotifications = React.useMemo(
    () => notifications.filter(entry => selected.has(entry.id)),
    [notifications, selected]
  )

  /** What a bulk action runs on: the selection when there is one, else the filter. */
  const scopeNotifications =
    selectedNotifications.length > 0 ? selectedNotifications : visible

  const scopeDescription =
    selectedNotifications.length > 0
      ? t('md3.inbox.scope.selection', {
          count: String(selectedNotifications.length),
        })
      : filtersActive
      ? t('md3.inbox.scope.filtered', { count: String(visible.length) })
      : t('md3.inbox.scope.all', { count: String(visible.length) })

  const closeMenu = React.useCallback(() => setMenu(null), [])

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  const onSearchChange = React.useCallback(
    (value: string) => setQuery(value),
    []
  )
  const onSearchClear = React.useCallback(() => setQuery(''), [])
  const onToggleRegex = React.useCallback(
    () => setRegexEnabled(current => !current),
    []
  )
  const onOpenBuilder = React.useCallback(() => setBuilderOpen(true), [])
  const onCloseBuilder = React.useCallback(() => setBuilderOpen(false), [])

  const onApplyPattern = React.useCallback(
    (application: IMd3RegexBuilderApplication) => {
      setQuery(application.pattern)
      setCaseSensitive(application.caseSensitive)
      // Applying a pattern to a field still reading its query as plain text
      // would search for the pattern's literal characters.
      setRegexEnabled(true)
      setBuilderOpen(false)
    },
    []
  )

  const builderSamples = React.useMemo(
    () => visible.slice(0, MaxBuilderSamples).map(entry => entry.title),
    [visible]
  )

  const toggleFilter = React.useCallback((filter: Md3InboxFilter) => {
    setFilters(current => {
      const next = new Set(current)
      if (next.has(filter)) {
        next.delete(filter)
      } else {
        next.add(filter)
      }
      return next
    })
  }, [])

  const onToggleUnread = React.useCallback(
    () => toggleFilter('unread'),
    [toggleFilter]
  )
  const onToggleFailures = React.useCallback(
    () => toggleFilter('failures'),
    [toggleFilter]
  )
  const onToggleMentions = React.useCallback(
    () => toggleFilter('mentions'),
    [toggleFilter]
  )

  const onResetFilters = React.useCallback(() => {
    setFilters(new Set<Md3InboxFilter>())
    setQuery('')
    setRegexEnabled(false)
  }, [])

  // ---------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------

  const setSelectionFrom = React.useCallback(
    (ids: ReadonlyArray<string>) => setSelected(new Set(ids)),
    []
  )

  const addToSelection = React.useCallback((ids: ReadonlyArray<string>) => {
    setSelected(current => new Set([...current, ...ids]))
  }, [])

  const onToggleSelected = React.useCallback(
    (notification: IMd3InboxNotification, index: number, extend: boolean) => {
      setFocusIndex(index)
      if (extend && anchorIndex.current !== null) {
        const from = Math.min(anchorIndex.current, index)
        const to = Math.max(anchorIndex.current, index)
        const range = visible.slice(from, to + 1).map(entry => entry.id)
        setSelected(current => new Set([...current, ...range]))
        return
      }
      anchorIndex.current = index
      setSelected(current => {
        const next = new Set(current)
        if (next.has(notification.id)) {
          next.delete(notification.id)
        } else {
          next.add(notification.id)
        }
        return next
      })
    },
    [visible]
  )

  const onSelectAllVisible = React.useCallback(() => {
    const ids = visible.map(entry => entry.id)
    setSelected(current => {
      const everySelected = ids.every(id => current.has(id))
      if (everySelected) {
        const next = new Set(current)
        for (const id of ids) {
          next.delete(id)
        }
        return next
      }
      return new Set([...current, ...ids])
    })
  }, [visible])

  const onSelectEverything = React.useCallback(() => {
    setSelectionFrom(notifications.map(entry => entry.id))
    notify(
      t('md3.inbox.toast.selectedAll', { count: String(notifications.length) })
    )
  }, [notifications, setSelectionFrom])

  const onInvertSelection = React.useCallback(() => {
    setSelected(current => {
      const next = new Set<string>()
      for (const entry of visible) {
        if (!current.has(entry.id)) {
          next.add(entry.id)
        }
      }
      return next
    })
  }, [visible])

  const onClearSelection = React.useCallback(() => {
    setSelected(new Set<string>())
    anchorIndex.current = null
  }, [])

  // ---------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------

  const undoOptions = React.useMemo(
    () =>
      onUndoLastChange === undefined
        ? {}
        : { onUndo: onUndoLastChange, undoLabel: t('md3.inbox.undo') },
    [onUndoLastChange]
  )

  const deleteOne = React.useCallback(
    (notification: IMd3InboxNotification) => {
      onDelete([notification.id])
      setSelected(current => {
        if (!current.has(notification.id)) {
          return current
        }
        const next = new Set(current)
        next.delete(notification.id)
        return next
      })
      notify(
        t('md3.inbox.toast.deleted', { title: notification.title }),
        undoOptions
      )
    },
    [onDelete, undoOptions]
  )

  const onRowToggleRead = React.useCallback(
    (notification: IMd3InboxNotification) => {
      onSetRead([notification.id], !notification.read)
    },
    [onSetRead]
  )

  const onBulkMarkRead = React.useCallback(() => {
    const ids = scopeNotifications.filter(e => !e.read).map(e => e.id)
    if (ids.length === 0) {
      return
    }
    onSetRead(ids, true)
    notify(t('md3.inbox.toast.markedRead', { count: String(ids.length) }))
  }, [scopeNotifications, onSetRead])

  const onBulkMarkUnread = React.useCallback(() => {
    const ids = scopeNotifications.filter(e => e.read).map(e => e.id)
    if (ids.length === 0) {
      return
    }
    onSetRead(ids, false)
    notify(t('md3.inbox.toast.markedUnread', { count: String(ids.length) }))
  }, [scopeNotifications, onSetRead])

  const onRequestBulkDelete = React.useCallback(() => {
    if (scopeNotifications.length === 0) {
      return
    }
    setMenu(null)
    setGateOpen(true)
  }, [scopeNotifications.length])

  const onCancelBulkDelete = React.useCallback(() => setGateOpen(false), [])

  const onConfirmBulkDelete = React.useCallback(() => {
    const ids = scopeNotifications.map(entry => entry.id)
    setGateOpen(false)
    if (ids.length === 0) {
      return
    }
    onDelete(ids)
    setSelected(new Set<string>())
    notify(
      t('md3.inbox.toast.deletedMany', { count: String(ids.length) }),
      undoOptions
    )
  }, [scopeNotifications, onDelete, undoOptions])

  const onMarkEveryoneRead = React.useCallback(() => {
    onMarkAllRead()
    notify(t('md3.inbox.toast.allRead'))
  }, [onMarkAllRead])

  const runExport = React.useCallback(
    (format: Md3InboxExportFormat, only: string | null) => {
      const rows =
        only === null
          ? scopeNotifications
          : notifications.filter(entry => entry.id === only)
      const scope =
        only === null
          ? scopeDescription
          : t('md3.inbox.scope.one', { count: String(rows.length) })
      const payload = serializeMd3InboxExport(
        rows.map(md3InboxExportRecord),
        format,
        { scope }
      )
      setMenu(null)
      onExport?.({ payload, notifications: rows })
      notify(
        t('md3.inbox.toast.exported', {
          count: String(rows.length),
          format: payload.format.toUpperCase(),
        })
      )
    },
    [scopeNotifications, scopeDescription, notifications, onExport]
  )

  // ---------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------

  const onRowOpen = React.useCallback(
    (
      notification: IMd3InboxNotification,
      index: number,
      event: React.MouseEvent<HTMLDivElement>
    ) => {
      setFocusIndex(index)
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        onToggleSelected(notification, index, event.shiftKey)
        return
      }
      anchorIndex.current = index
      onOpen(notification)
      notify(t('md3.inbox.toast.opened', { title: notification.title }))
    },
    [onOpen, onToggleSelected]
  )

  const onRowContextMenu = React.useCallback(
    (
      notification: IMd3InboxNotification,
      index: number,
      event: React.MouseEvent<HTMLElement>
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setFocusIndex(index)
      setMenu({ kind: 'row', id: notification.id })
    },
    []
  )

  const moveFocus = React.useCallback(
    (index: number) => {
      pendingFocus.current = true
      setFocusIndex(Math.max(0, Math.min(index, visible.length - 1)))
    },
    [visible.length]
  )

  const onRowKeyDown = React.useCallback(
    (index: number, event: React.KeyboardEvent<HTMLDivElement>) => {
      const notification = visible[index]
      if (notification === undefined) {
        return
      }

      const row = event.currentTarget
      const inRowControls = () =>
        Array.from(row.querySelectorAll<HTMLElement>('input, button')).filter(
          element => !(element as HTMLButtonElement).disabled
        )

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          const next = Math.min(index + 1, visible.length - 1)
          if (event.shiftKey) {
            addToSelection([notification.id, visible[next].id])
          }
          moveFocus(next)
          return
        }
        case 'ArrowUp': {
          event.preventDefault()
          const previous = Math.max(index - 1, 0)
          if (event.shiftKey) {
            addToSelection([notification.id, visible[previous].id])
          }
          moveFocus(previous)
          return
        }
        case 'Home':
          event.preventDefault()
          moveFocus(0)
          return
        case 'End':
          event.preventDefault()
          moveFocus(visible.length - 1)
          return
        case 'ArrowRight': {
          const controls = inRowControls()
          if (controls.length > 0) {
            event.preventDefault()
            const active = document.activeElement
            const current = controls.findIndex(element => element === active)
            controls[Math.min(current + 1, controls.length - 1)].focus()
          }
          return
        }
        case 'ArrowLeft': {
          const controls = inRowControls()
          const active = document.activeElement
          const current = controls.findIndex(element => element === active)
          event.preventDefault()
          if (current <= 0) {
            row.focus()
          } else {
            controls[current - 1].focus()
          }
          return
        }
        case 'Enter':
          if (event.target === row) {
            event.preventDefault()
            onOpen(notification)
            notify(t('md3.inbox.toast.opened', { title: notification.title }))
          }
          return
        case ' ':
        case 'Spacebar':
          if (event.target === row) {
            event.preventDefault()
            onToggleSelected(notification, index, event.shiftKey)
          }
          return
        case 'Delete':
        case 'Backspace':
          if (event.target === row) {
            event.preventDefault()
            deleteOne(notification)
          }
          return
        case 'Escape':
          event.preventDefault()
          onClearSelection()
          return
        case 'a':
        case 'A':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setSelectionFrom(visible.map(entry => entry.id))
          }
          return
        case 'ContextMenu':
          event.preventDefault()
          setMenu({ kind: 'row', id: notification.id })
          return
        default:
          return
      }
    },
    [
      visible,
      moveFocus,
      onOpen,
      onToggleSelected,
      addToSelection,
      deleteOne,
      onClearSelection,
      setSelectionFrom,
    ]
  )

  // ---------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------

  const menuNotification =
    menu !== null && menu.kind === 'row'
      ? notifications.find(entry => entry.id === menu.id) ?? null
      : null

  const rowMenuSpec = React.useMemo((): IMd3MenuSpec | null => {
    const notification = menuNotification
    if (notification === null) {
      return null
    }
    const items: Array<IMd3MenuItem> = [
      {
        id: 'markRead',
        label: t('md3.menu.inboxRowMenu.markRead'),
        icon: 'mark_email_read',
        hint: '',
        onClick: () => {
          onSetRead([notification.id], true)
          closeMenu()
        },
      },
      {
        id: 'markUnread',
        label: t('md3.menu.inboxRowMenu.markUnread'),
        icon: 'mark_email_unread',
        hint: '',
        onClick: () => {
          onSetRead([notification.id], false)
          closeMenu()
        },
      },
    ]

    if (
      onOpenExternal !== undefined &&
      notification.externalUrl !== undefined
    ) {
      items.push({
        id: 'openInBrowser',
        label: t('md3.menu.inboxRowMenu.openInBrowser'),
        icon: 'open_in_new',
        hint: '',
        onClick: () => {
          onOpenExternal(notification)
          closeMenu()
        },
      })
    }

    if (onSetMuted !== undefined) {
      const muted = notification.muted === true
      items.push({
        id: 'mute',
        label: muted
          ? t('md3.inbox.rowMenu.unmute')
          : t('md3.menu.inboxRowMenu.mute'),
        icon: 'notifications_off',
        hint: '',
        onClick: () => {
          onSetMuted(notification, !muted)
          notify(
            muted
              ? t('md3.inbox.toast.unmuted', { title: notification.title })
              : t('md3.inbox.toast.muted', { title: notification.title })
          )
          closeMenu()
        },
      })
    }

    if (onOpenAutomations !== undefined) {
      items.push({
        id: 'automations',
        label: t('md3.inbox.rowMenu.automations'),
        icon: 'tune',
        hint: '',
        onClick: () => {
          onOpenAutomations(notification)
          closeMenu()
        },
      })
    }

    items.push({
      id: 'select',
      label: selected.has(notification.id)
        ? t('md3.inbox.rowMenu.deselect')
        : t('md3.inbox.rowMenu.select'),
      icon: 'library_add_check',
      hint: '⇧click',
      onClick: () => {
        setSelected(current => {
          const next = new Set(current)
          if (next.has(notification.id)) {
            next.delete(notification.id)
          } else {
            next.add(notification.id)
          }
          return next
        })
        closeMenu()
      },
    })

    if (onCopyDetails !== undefined) {
      items.push({
        id: 'copyDetails',
        label: t('md3.inbox.rowMenu.copyDetails'),
        icon: 'content_copy',
        hint: '⌘C',
        onClick: () => {
          onCopyDetails(
            [
              notification.title,
              notification.meta,
              md3InboxDetailLine(notification),
              notification.createdAt,
            ].join('\n')
          )
          closeMenu()
        },
      })
    }

    if (onExport !== undefined) {
      items.push({
        id: 'exportOne',
        label: t('md3.inbox.rowMenu.exportOne'),
        icon: 'cloud_download',
        hint: '',
        onClick: () => setMenu({ kind: 'export', only: notification.id }),
      })
    }

    items.push({
      id: 'delete',
      label: t('md3.menu.inboxRowMenu.delete'),
      icon: 'delete',
      hint: '⌫',
      onClick: () => {
        deleteOne(notification)
        closeMenu()
      },
    })

    return {
      kind: 'inboxRowMenu',
      title: t('md3.menu.inboxRowMenu.title'),
      icon: 'notifications',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.menu.filterPlaceholder'),
      items,
    }
  }, [
    menuNotification,
    onSetRead,
    onOpenExternal,
    onSetMuted,
    onOpenAutomations,
    onCopyDetails,
    onExport,
    deleteOne,
    closeMenu,
    selected,
  ])

  const listMenuSpec = React.useMemo((): IMd3MenuSpec => {
    const items: Array<IMd3MenuItem> = [
      {
        id: 'selectFiltered',
        label: t('md3.inbox.listMenu.selectFiltered', {
          count: String(visible.length),
        }),
        icon: 'library_add_check',
        hint: '',
        onClick: () => {
          setSelectionFrom(visible.map(entry => entry.id))
          closeMenu()
        },
      },
      {
        id: 'selectEverything',
        label: t('md3.inbox.listMenu.selectEverything', {
          count: String(notifications.length),
        }),
        icon: 'checklist',
        hint: '',
        onClick: () => {
          onSelectEverything()
          closeMenu()
        },
      },
      {
        id: 'invert',
        label: t('md3.inbox.listMenu.invert'),
        icon: 'swap_horiz',
        hint: '',
        onClick: () => {
          onInvertSelection()
          closeMenu()
        },
      },
      {
        id: 'clearSelection',
        label: t('md3.inbox.listMenu.clearSelection'),
        icon: 'close',
        hint: 'Esc',
        onClick: () => {
          onClearSelection()
          closeMenu()
        },
      },
      {
        id: 'markAllRead',
        label: t('md3.inbox.markAllRead'),
        icon: 'done_all',
        hint: '',
        onClick: () => {
          onMarkEveryoneRead()
          closeMenu()
        },
      },
      {
        id: 'bulkDelete',
        label: t('md3.inbox.listMenu.deleteScope', {
          count: String(scopeNotifications.length),
        }),
        icon: 'delete_sweep',
        hint: '',
        onClick: onRequestBulkDelete,
      },
    ]

    if (onExport !== undefined) {
      items.push({
        id: 'export',
        label: t('md3.inbox.listMenu.export', {
          count: String(scopeNotifications.length),
        }),
        icon: 'cloud_download',
        hint: '',
        onClick: () => setMenu({ kind: 'export', only: null }),
      })
    }

    if (onOpenHistory !== undefined) {
      items.push({
        id: 'history',
        label: t('md3.inbox.listMenu.history'),
        icon: 'history',
        hint: '',
        onClick: () => {
          onOpenHistory()
          closeMenu()
        },
      })
    }

    if (onOpenGitHubInbox !== undefined) {
      items.push({
        id: 'githubInbox',
        label: t('md3.inbox.listMenu.githubInbox'),
        icon: 'open_in_new',
        hint: '',
        onClick: () => {
          onOpenGitHubInbox()
          closeMenu()
        },
      })
    }

    return {
      kind: 'listMenu',
      title: t('md3.inbox.listMenu.title'),
      icon: 'inbox',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.menu.filterPlaceholder'),
      items,
    }
  }, [
    visible,
    notifications.length,
    scopeNotifications.length,
    onExport,
    onOpenHistory,
    onOpenGitHubInbox,
    onSelectEverything,
    onInvertSelection,
    onClearSelection,
    onMarkEveryoneRead,
    onRequestBulkDelete,
    setSelectionFrom,
    closeMenu,
  ])

  const exportOnly = menu !== null && menu.kind === 'export' ? menu.only : null

  const exportMenuSpec = React.useMemo(
    (): IMd3MenuSpec => ({
      kind: 'listMenu',
      title: t('md3.inbox.exportMenu.title'),
      icon: 'cloud_download',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.inbox.exportMenu.filterPlaceholder'),
      items: Md3InboxExportFormats.map(descriptor => ({
        id: descriptor.format,
        label: descriptor.label,
        icon: 'description' as MaterialSymbolName,
        hint: `.${descriptor.extension}`,
        onClick: () => runExport(descriptor.format, exportOnly),
      })),
    }),
    [runExport, exportOnly]
  )

  const onOpenListMenu = React.useCallback(() => setMenu({ kind: 'list' }), [])

  const onOpenBulkExport = React.useCallback(
    () => setMenu({ kind: 'export', only: null }),
    []
  )

  /**
   * The regex builder reached from a menu's own filter row.
   *
   * `Md3MenuOverlay` owns its filter text and has no way to receive a pattern
   * back, so the builder it opens targets the notification search instead,
   * seeded with whatever the menu filter already holds. The dialog names that
   * target in its own title, so nobody applies a pattern without seeing where
   * it lands.
   */
  const onOpenMenuBuilder = React.useCallback((pattern: string) => {
    setQuery(pattern)
    setMenu(null)
    setBuilderOpen(true)
  }, [])

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const allVisibleSelected =
    visible.length > 0 && selectedVisibleCount === visible.length

  return (
    <div className="md3-inbox md3-anim-up">
      <section className="md3-inbox__pane" aria-label={t('md3.inbox.pane')}>
        <Md3SearchField
          id="md3-inbox-search"
          searchSurfaceId="md3-inbox"
          value={query}
          placeholder={t('md3.inbox.searchPlaceholder')}
          fieldLabel={t('md3.inbox.searchField')}
          regexEnabled={regexEnabled}
          matchCount={visible.length}
          onChange={onSearchChange}
          onClear={onSearchClear}
          onToggleRegex={onToggleRegex}
          onOpenBuilder={onOpenBuilder}
        />

        {patternInvalid ? (
          <p className="md3-inbox__note" role="status">
            {t('md3.inbox.invalidPattern')}
          </p>
        ) : null}

        <Md3ChipRow label={t('md3.inbox.filters')}>
          {FilterOrder.map(filter => (
            <Md3Chip
              key={filter}
              label={filterLabel(filter)}
              active={filters.has(filter)}
              onToggle={
                filter === 'unread'
                  ? onToggleUnread
                  : filter === 'failures'
                  ? onToggleFailures
                  : onToggleMentions
              }
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3TonalButton
            label={t('md3.inbox.markAllRead')}
            icon="done_all"
            disabled={notifications.every(entry => entry.read)}
            onClick={onMarkEveryoneRead}
          />
        </Md3ChipRow>

        <div className="md3-inbox__bulk">
          <label className="md3-inbox__select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="md3-inbox-checkbox"
              checked={allVisibleSelected}
              disabled={visible.length === 0}
              onChange={onSelectAllVisible}
            />
            <span>
              {filtersActive
                ? t('md3.inbox.selectAllFiltered', {
                    count: String(visible.length),
                  })
                : t('md3.inbox.selectAllEverything', {
                    count: String(visible.length),
                  })}
            </span>
          </label>

          <span className="md3-inbox__selection-count" role="status">
            {t('md3.inbox.selectionCount', { count: String(selected.size) })}
          </span>

          <Md3GhostButton
            label={t('md3.inbox.invertSelection')}
            icon="swap_horiz"
            disabled={visible.length === 0}
            onClick={onInvertSelection}
          />
          <Md3GhostButton
            label={t('md3.inbox.bulkMarkRead')}
            accessibleName={t('md3.inbox.bulkMarkReadScoped', {
              label: t('md3.inbox.bulkMarkRead'),
              scope: scopeDescription,
            })}
            icon="mark_email_read"
            disabled={scopeNotifications.every(entry => entry.read)}
            onClick={onBulkMarkRead}
          />
          <Md3GhostButton
            label={t('md3.inbox.bulkMarkUnread')}
            accessibleName={t('md3.inbox.bulkMarkUnreadScoped', {
              label: t('md3.inbox.bulkMarkUnread'),
              scope: scopeDescription,
            })}
            icon="mark_email_unread"
            disabled={scopeNotifications.every(entry => !entry.read)}
            onClick={onBulkMarkUnread}
          />
          <Md3GhostButton
            label={t('md3.inbox.bulkDelete')}
            accessibleName={t('md3.inbox.bulkDeleteScoped', {
              label: t('md3.inbox.bulkDelete'),
              scope: scopeDescription,
            })}
            icon="delete_sweep"
            className="md3-inbox__danger"
            disabled={scopeNotifications.length === 0}
            hasPopup="dialog"
            buttonRef={bulkDeleteButtonRef}
            onClick={onRequestBulkDelete}
          />
          {onExport === undefined ? null : (
            <Md3GhostButton
              label={t('md3.inbox.bulkExport')}
              accessibleName={t('md3.inbox.bulkExportScoped', {
                label: t('md3.inbox.bulkExport'),
                scope: scopeDescription,
              })}
              icon="cloud_download"
              hasPopup="menu"
              disabled={scopeNotifications.length === 0}
              onClick={onOpenBulkExport}
            />
          )}
          <Md3IconButton
            small={true}
            icon="more_vert"
            label={t('md3.inbox.moreActions')}
            hasPopup="menu"
            expanded={menu !== null && menu.kind === 'list'}
            buttonRef={listMenuButtonRef}
            onClick={onOpenListMenu}
          />
        </div>

        {visible.length === 0 ? (
          <Md3EmptyState
            icon={filtersActive ? 'search_off' : 'notifications_off'}
            message={
              filtersActive
                ? t('md3.inbox.empty.noMatch')
                : t('md3.inbox.empty.caughtUp')
            }
            onAction={filtersActive ? onResetFilters : undefined}
          />
        ) : (
          /*
           * Not virtualized on purpose: the notification log is capped at
           * NotificationCentreCap (500) entries, so the whole list is a few
           * hundred rows at its very largest, and a windowed list would put a
           * scroll position between the roving tabindex and the row it wants
           * to focus.
           */
          <div
            role="grid"
            aria-multiselectable={true}
            aria-label={t('md3.inbox.list')}
            aria-rowcount={visible.length}
            className="md3-inbox__list"
          >
            {visible.map((notification, index) => (
              <Md3InboxRow
                key={notification.id}
                notification={notification}
                index={index}
                selected={selected.has(notification.id)}
                focused={index === focusIndex}
                onOpen={onRowOpen}
                onToggleSelected={onToggleSelected}
                onToggleRead={onRowToggleRead}
                onDelete={deleteOne}
                onContextMenu={onRowContextMenu}
                onKeyDown={onRowKeyDown}
                registerRow={registerRow}
              />
            ))}
          </div>
        )}
      </section>

      {builderOpen ? (
        <Md3RegexBuilderDialog
          targetLabel={t('md3.inbox.searchField')}
          initialPattern={query}
          sampleItems={builderSamples}
          onApply={onApplyPattern}
          onDismissed={onCloseBuilder}
        />
      ) : null}

      {menu !== null && menu.kind === 'row' && rowMenuSpec !== null ? (
        <Md3MenuOverlay
          spec={rowMenuSpec}
          onDismiss={closeMenu}
          onOpenRegexBuilder={onOpenMenuBuilder}
        />
      ) : null}

      {menu !== null && menu.kind === 'list' ? (
        <Md3MenuOverlay
          spec={listMenuSpec}
          onDismiss={closeMenu}
          onOpenRegexBuilder={onOpenMenuBuilder}
          returnFocusTo={listMenuButtonRef}
        />
      ) : null}

      {menu !== null && menu.kind === 'export' ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={closeMenu}
          onOpenRegexBuilder={onOpenMenuBuilder}
        />
      ) : null}

      {gateOpen ? (
        <Md3DestructiveGate
          actionId="inbox-bulk-delete"
          icon="delete_sweep"
          title={t('md3.inbox.gate.title', {
            count: String(scopeNotifications.length),
          })}
          summary={t('md3.inbox.gate.summary', {
            count: String(scopeNotifications.length),
            scope: scopeDescription,
          })}
          irreversible={t('md3.inbox.gate.irreversible')}
          targetKeyLabel={t('md3.inbox.gate.keyTarget', {
            count: String(scopeNotifications.length),
            scope: scopeDescription,
          })}
          effectKeyLabel={t('md3.inbox.gate.keyEffect')}
          confirmLabel={t('md3.inbox.gate.confirm', {
            count: String(scopeNotifications.length),
          })}
          anchorTo={bulkDeleteButtonRef}
          onConfirm={onConfirmBulkDelete}
          onDismissed={onCancelBulkDelete}
        />
      ) : null}
    </div>
  )
}
