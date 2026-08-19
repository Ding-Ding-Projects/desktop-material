import * as React from 'react'
import classNames from 'classnames'

import { tFunny } from '../../lib/funny-level-text'
import { t } from '../../lib/i18n'
import { compileSafeRegex } from '../../lib/safe-regex'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
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
  IMd3BulkAction,
  Md3BulkBar,
  md3BulkExportMenuSpec,
} from './md3-bulk-bar'
import {
  IMd3ListExport,
  IMd3ListExportColumn,
  IMd3ListExportSpec,
  Md3ListExportFormat,
  Md3ListExportRecord,
  serializeMd3ListExport,
} from './md3-list-export'
import {
  IMd3BulkPartition,
  md3ApplySelection,
  md3BulkPartitionSummary,
  md3BulkScope,
  md3BulkScopeLabel,
  md3InvertSelection,
  md3PartitionBulk,
  md3SelectionIntent,
  md3ToggleSelectAll,
} from './md3-list-selection'
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
  readonly payload: IMd3ListExport
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

/**
 * The export schema for a notification row.
 *
 * Every field the row renders plus the identity it is keyed by and the
 * absolute timestamp the row only announces — "Yesterday" stops being an
 * answer the moment the file leaves the application. Nothing here is
 * multiline, so no format drops anything and the picker says so by offering
 * every format without a warning — which is only true because this schema has
 * been checked against the row type, not assumed.
 */
export const Md3InboxExportColumns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'id' },
  { name: 'title' },
  { name: 'meta' },
  { name: 'source' },
  { name: 'tone' },
  { name: 'state' },
  { name: 'kind' },
  { name: 'time' },
  { name: 'createdAt' },
  { name: 'read' },
  { name: 'muted' },
]

/** Everything the shared serializer needs to write a notification export. */
export const Md3InboxExportSpec: IMd3ListExportSpec = {
  columns: Md3InboxExportColumns,
  collectionName: 'notifications',
  recordName: 'notification',
  title: 'Notifications',
  baseName: 'notifications',
}

/** Flatten a row for {@link serializeMd3ListExport}. */
export function md3InboxExportRecord(
  notification: IMd3InboxNotification
): Md3ListExportRecord {
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

/**
 * Whether a query or a chip is narrowing the list.
 *
 * The bulk bar's select-all reads this to decide whether it says "all 12
 * matching these filters" or "all 12". Passing `false` while a filter is on is
 * the one defect neither the bar nor the user can detect, so the rule is a
 * named function the view calls and a test can check, rather than an
 * expression buried in the render.
 */
export function md3InboxFiltersActive(
  state: Pick<IMd3InboxFilterState, 'query' | 'filters'>
): boolean {
  return state.filters.size > 0 || state.query.trim().length > 0
}

/** The four eligibility splits the bulk verbs run over. */
export interface IMd3InboxBulkPartitions {
  readonly markable: IMd3BulkPartition<IMd3InboxNotification>
  readonly unmarkable: IMd3BulkPartition<IMd3InboxNotification>
  readonly mutable: IMd3BulkPartition<IMd3InboxNotification>
  readonly unmutable: IMd3BulkPartition<IMd3InboxNotification>
}

/**
 * Split the scope by what each verb can actually change.
 *
 * Marking read a row that is already read is not an error, it is a lie in the
 * toast afterwards: the count says twelve and nine changed. Each partition
 * carries its own localized reason so the button's disabled state, the work
 * and the report all describe one set.
 */
export function md3InboxBulkPartitions(
  rows: ReadonlyArray<IMd3InboxNotification>
): IMd3InboxBulkPartitions {
  return {
    markable: md3PartitionBulk(
      rows,
      entry => !entry.read,
      t('md3.inbox.bulkSkipAlreadyRead')
    ),
    unmarkable: md3PartitionBulk(
      rows,
      entry => entry.read,
      t('md3.inbox.bulkSkipAlreadyUnread')
    ),
    mutable: md3PartitionBulk(
      rows,
      entry => entry.muted !== true,
      t('md3.inbox.bulkSkipAlreadyMuted')
    ),
    unmutable: md3PartitionBulk(
      rows,
      entry => entry.muted === true,
      t('md3.inbox.bulkSkipNotMuted')
    ),
  }
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
          {/* The title is its own element rather than a bare text node: the
              row's title is a flex container so it can seat the MUTED badge,
              and `text-overflow` never applies to a flex container's anonymous
              text item. Without this span a long title clips mid-character and
              the badge is pushed off the row. */}
          <span className="md3-inbox__title-text">{notification.title}</span>
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
  const exportButtonRef = React.useMemo(
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

  // The ids the bulk bar reasons over are the ones left AFTER the query and
  // the chips: a select-all that reached past the filter would tick rows
  // nobody has looked at.
  const visibleIds = React.useMemo(
    () => visible.map(entry => entry.id),
    [visible]
  )
  const visibleIdSet = React.useMemo(() => new Set(visibleIds), [visibleIds])

  const filtersActive = md3InboxFiltersActive({ query, filters })

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

  /**
   * What a bulk verb runs over: the ticked rows, or the whole filtered list.
   *
   * Resolved against `visible` rather than every notification, so a row a
   * filter is hiding is never in the scope even when it is still ticked from
   * an earlier search. The label below counts the same set for the same
   * reason — a button reading "12 selected" that acts on nine is the exact
   * disagreement the shared scope helpers exist to prevent.
   */
  const scopeNotifications = React.useMemo(
    () => md3BulkScope(visible, selected, entry => entry.id),
    [visible, selected]
  )

  const scopeDescription = md3BulkScopeLabel(
    selectedVisibleCount,
    visible.length,
    filtersActive
  )

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

  /**
   * One selection gesture, resolved by the shared algebra.
   *
   * The range mode is `extend` because these rows carry checkboxes: somebody
   * who has ticked four notifications and then Shift-clicks a fifth is asking
   * for more, not for those four to vanish.
   *
   * `md3ApplySelection` returns the selection ordered within `visibleIds`,
   * which necessarily drops any id the filter is hiding. This view lets a
   * selection survive a filter change on purpose — a user builds one across
   * several searches — so the hidden ids are carried back over the result
   * rather than being quietly discarded by a tick on an unrelated row.
   */
  const applySelectionAt = React.useCallback(
    (
      index: number,
      modifiers: {
        readonly shiftKey: boolean
        readonly ctrlKey: boolean
        readonly metaKey: boolean
      }
    ) => {
      setFocusIndex(index)
      const intent = md3SelectionIntent(modifiers)
      setSelected(current => {
        const result = md3ApplySelection(
          visibleIds,
          current,
          index,
          intent,
          anchorIndex.current,
          'extend'
        )
        // A range must not walk its own anchor along with it, or Shift-click,
        // Shift-click stops growing one range and starts drawing new ones.
        if (intent !== 'range') {
          anchorIndex.current = result.anchor
        }
        const hidden = [...current].filter(id => !visibleIdSet.has(id))
        return new Set([...hidden, ...result.ids])
      })
    },
    [visibleIds, visibleIdSet]
  )

  const onToggleSelected = React.useCallback(
    (notification: IMd3InboxNotification, index: number, extend: boolean) =>
      applySelectionAt(index, {
        shiftKey: extend,
        // A checkbox click is the whole gesture, so it is always additive: a
        // plain tick must never replace the rest of the selection.
        ctrlKey: true,
        metaKey: false,
      }),
    [applySelectionAt]
  )

  const onSelectAllVisible = React.useCallback(() => {
    setSelected(current => new Set(md3ToggleSelectAll(visibleIds, current)))
    anchorIndex.current = null
  }, [visibleIds])

  const onSelectEverything = React.useCallback(() => {
    setSelectionFrom(notifications.map(entry => entry.id))
    notify(
      t('md3.inbox.toast.selectedAll', { count: String(notifications.length) })
    )
  }, [notifications, setSelectionFrom])

  const onInvertSelection = React.useCallback(() => {
    setSelected(current => new Set(md3InvertSelection(visibleIds, current)))
    anchorIndex.current = null
  }, [visibleIds])

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

  /*
   * Each verb names what it will skip and why, so the button's own count, the
   * toast afterwards and — for the delete — the gate's preview all describe
   * the same set. "Marked 12 read" after marking nine is the quiet failure a
   * partition exists to prevent.
   */
  const { markable, unmarkable, mutable, unmutable } = React.useMemo(
    () => md3InboxBulkPartitions(scopeNotifications),
    [scopeNotifications]
  )

  const reportSkipped = React.useCallback((summary: string | null) => {
    if (summary !== null) {
      notify(summary, { kind: 'warning' })
    }
  }, [])

  const onBulkMarkRead = React.useCallback(() => {
    const ids = markable.applied.map(entry => entry.id)
    if (ids.length === 0) {
      return
    }
    onSetRead(ids, true)
    notify(t('md3.inbox.toast.markedRead', { count: String(ids.length) }))
    reportSkipped(md3BulkPartitionSummary(markable))
  }, [markable, onSetRead, reportSkipped])

  const onBulkMarkUnread = React.useCallback(() => {
    const ids = unmarkable.applied.map(entry => entry.id)
    if (ids.length === 0) {
      return
    }
    onSetRead(ids, false)
    notify(t('md3.inbox.toast.markedUnread', { count: String(ids.length) }))
    reportSkipped(md3BulkPartitionSummary(unmarkable))
  }, [unmarkable, onSetRead, reportSkipped])

  const onBulkMute = React.useCallback(() => {
    if (onSetMuted === undefined) {
      return
    }
    for (const entry of mutable.applied) {
      onSetMuted(entry, true)
    }
    notify(
      t('md3.inbox.toast.mutedMany', {
        count: String(mutable.applied.length),
      })
    )
    reportSkipped(md3BulkPartitionSummary(mutable))
  }, [onSetMuted, mutable, reportSkipped])

  const onBulkUnmute = React.useCallback(() => {
    if (onSetMuted === undefined) {
      return
    }
    for (const entry of unmutable.applied) {
      onSetMuted(entry, false)
    }
    notify(
      t('md3.inbox.toast.unmutedMany', {
        count: String(unmutable.applied.length),
      })
    )
    reportSkipped(md3BulkPartitionSummary(unmutable))
  }, [onSetMuted, unmutable, reportSkipped])

  const onBulkCopyDetails = React.useCallback(() => {
    if (onCopyDetails === undefined) {
      return
    }
    onCopyDetails(
      scopeNotifications
        .map(entry =>
          [
            entry.title,
            entry.meta,
            md3InboxDetailLine(entry),
            entry.createdAt,
          ].join('\n')
        )
        .join('\n\n')
    )
  }, [onCopyDetails, scopeNotifications])

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
    (format: Md3ListExportFormat, only: string | null) => {
      const rows =
        only === null
          ? scopeNotifications
          : notifications.filter(entry => entry.id === only)
      const scope =
        only === null
          ? scopeDescription
          : t('md3.inbox.scope.one', { count: String(rows.length) })
      const payload = serializeMd3ListExport(
        rows.map(md3InboxExportRecord),
        Md3InboxExportSpec,
        format,
        { scope }
      )
      setMenu(null)
      onExport?.({ payload, notifications: rows })
      notify(
        payload.loss === null
          ? t('md3.bulk.toast.exported', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
            })
          : t('md3.bulk.toast.exportedLossy', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
              loss: payload.loss,
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
        // A modified row click is a selection gesture, and the modifiers say
        // which one: Shift ranges, Ctrl/Cmd ticks this row alone.
        applySelectionAt(index, {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        })
        return
      }
      anchorIndex.current = index
      onOpen(notification)
      notify(t('md3.inbox.toast.opened', { title: notification.title }))
    },
    [onOpen, applySelectionAt]
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

  // The shared picker: every format, each row carrying what that format would
  // drop from this schema, and the declared schema itself in the footer.
  const exportMenuSpec = React.useMemo(
    (): IMd3MenuSpec =>
      md3BulkExportMenuSpec(
        Md3InboxExportColumns,
        exportOnly === null
          ? scopeDescription
          : t('md3.inbox.scope.one', { count: '1' }),
        format => runExport(format, exportOnly)
      ),
    [runExport, exportOnly, scopeDescription]
  )

  const onOpenListMenu = React.useCallback(() => setMenu({ kind: 'list' }), [])

  const onOpenBulkExport = React.useCallback(
    () => setMenu({ kind: 'export', only: null }),
    []
  )

  /**
   * The bar's verbs: every row action this list already performs singly,
   * except the two that are navigations to one place rather than operations
   * over a set — "Open in browser" and the per-notification automations
   * dialog, neither of which has a meaning for forty rows at once.
   *
   * Each verb is disabled by the count its own partition will actually act
   * on, so a button that would do nothing says so before it is pressed.
   */
  const bulkActions = React.useMemo((): ReadonlyArray<IMd3BulkAction> => {
    const actions: Array<IMd3BulkAction> = [
      {
        id: 'markRead',
        label: t('md3.inbox.bulkMarkRead'),
        icon: 'mark_email_read',
        disabled: markable.applied.length === 0,
        onClick: onBulkMarkRead,
      },
      {
        id: 'markUnread',
        label: t('md3.inbox.bulkMarkUnread'),
        icon: 'mark_email_unread',
        disabled: unmarkable.applied.length === 0,
        onClick: onBulkMarkUnread,
      },
    ]

    if (onSetMuted !== undefined) {
      actions.push(
        {
          id: 'mute',
          label: t('md3.inbox.bulkMute'),
          icon: 'notifications_off',
          disabled: mutable.applied.length === 0,
          onClick: onBulkMute,
        },
        {
          id: 'unmute',
          label: t('md3.inbox.bulkUnmute'),
          // `notifications`, the plain bell: the bundled subset carries no
          // `notifications_active`, and a name the font does not have renders
          // the literal English word rather than a glyph.
          icon: 'notifications',
          disabled: unmutable.applied.length === 0,
          onClick: onBulkUnmute,
        }
      )
    }

    if (onCopyDetails !== undefined) {
      actions.push({
        id: 'copyDetails',
        label: t('md3.inbox.bulkCopyDetails'),
        icon: 'content_copy',
        disabled: scopeNotifications.length === 0,
        onClick: onBulkCopyDetails,
      })
    }

    actions.push({
      id: 'delete',
      label: t('md3.inbox.bulkDelete'),
      icon: 'delete_sweep',
      destructive: true,
      hasPopup: 'dialog',
      buttonRef: bulkDeleteButtonRef,
      disabled: scopeNotifications.length === 0,
      onClick: onRequestBulkDelete,
    })

    actions.push({
      id: 'more',
      label: t('md3.inbox.moreActions'),
      icon: 'more_vert',
      hasPopup: 'menu',
      buttonRef: listMenuButtonRef,
      onClick: onOpenListMenu,
    })

    return actions
  }, [
    markable,
    unmarkable,
    mutable,
    unmutable,
    scopeNotifications,
    onSetMuted,
    onCopyDetails,
    onBulkMarkRead,
    onBulkMarkUnread,
    onBulkMute,
    onBulkUnmute,
    onBulkCopyDetails,
    onRequestBulkDelete,
    onOpenListMenu,
    bulkDeleteButtonRef,
    listMenuButtonRef,
  ])

  /** The bar hands back a format directly; the row menu supplies its own id. */
  const onBulkExportFormat = React.useCallback(
    (format: Md3ListExportFormat) => runExport(format, null),
    [runExport]
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

        <Md3BulkBar
          listId="inbox"
          label={t('md3.inbox.bulkLabel')}
          visibleIds={visibleIds}
          selected={selected}
          filtered={filtersActive}
          scopeLabel={scopeDescription}
          actions={bulkActions}
          onToggleSelectAll={onSelectAllVisible}
          onInvertSelection={onInvertSelection}
          onClearSelection={onClearSelection}
          onExport={onExport === undefined ? undefined : onBulkExportFormat}
          exportColumns={Md3InboxExportColumns}
          onOpenExport={onExport === undefined ? undefined : onOpenBulkExport}
          exportButtonRef={exportButtonRef}
        />

        {visible.length === 0 ? (
          <Md3EmptyState
            icon={filtersActive ? 'search_off' : 'notifications_off'}
            message={
              filtersActive
                ? t('md3.inbox.empty.noMatch')
                : tFunny('md3.inbox.empty.caughtUp')
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
