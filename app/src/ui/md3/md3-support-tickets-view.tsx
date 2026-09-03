import * as React from 'react'
import classNames from 'classnames'
import { writeFile } from 'fs/promises'
import { clipboard } from 'electron'

import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  t,
} from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { compileSafeRegex } from '../../lib/safe-regex'
import {
  advanceSupportTicket,
  createSupportTicket,
  isValidSupportTicketDescription,
  ISupportTicket,
  ISupportTicketResponse,
  MaximumSupportTicketDescriptionLength,
  normalizeSupportTicketDescription,
  readSupportTickets,
  SupportTicketCategories,
  SupportTicketCategory,
  SupportTicketEntryPoint,
  SupportTicketSeverities,
  SupportTicketSeverity,
  SupportTicketStatus,
  writeSupportTickets,
} from '../../lib/support-tickets'
import {
  ISupportTicketExport,
  serializeSupportTicketExport,
  SupportTicketExportFormat,
  SupportTicketExportFormats,
  toSupportTicketExportRecord,
} from '../../lib/support-ticket-export'
import {
  openApplicationDataFolder,
  resolveApplicationDataFolder,
  SupportTicketFolderOpener,
  SupportTicketFolderResolver,
  SupportTicketRecoveryOutcome,
} from '../../lib/support-ticket-recovery'
import { getPath, showSaveDialog } from '../main-process-proxy'
import { shell } from '../../lib/app-shell'
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
import { Md3MenuOverlay } from './md3-menu-overlay'
import { IMd3MenuItem, IMd3MenuSpec } from './md3-menu-specs'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { Md3SupportTicketDeleteGate } from './md3-support-ticket-delete-gate'
import { notify } from './md3-toast'
import { PopoverAnchorPosition } from '../lib/popover'

/**
 * Support Tickets — the joke recovery desk, and the only route back into a
 * lock the user set on themselves and then forgot.
 *
 * The desk plays the part properly: a category, a severity nobody honours, a
 * description, a locally generated ticket number, a status that advances, and
 * a canned first response written with the gravity of a service desk that has
 * read the manual once. Then the resolution does the only thing that actually
 * works — it opens the application data folder in the platform's own file
 * manager so the user can delete it themselves.
 *
 * Three things about it are not jokes, and none of them is styled by the funny
 * level:
 *
 *  - the disclosure line, which states in plain words that nothing is sent
 *    anywhere, no ticket exists off this machine, no network request is made,
 *    no data is collected and nobody is reading it. A user who sits waiting for
 *    a reply that was never coming is the one failure this feature must not
 *    produce, so that sentence is fixed copy in both languages;
 *  - the folder path, which is resolved from the running application and is the
 *    exact string the Open button opens — displayed and opened are one value,
 *    not two that could drift;
 *  - the failure report. When the file manager cannot open the folder, the
 *    platform's own message is shown verbatim rather than a shrug.
 *
 * The desk never deletes anything. It opens a folder and stops there; the
 * deletion is the user's own act in their own file manager. Ticket deletion —
 * the only destructive action the desk has — goes through the two-key super
 * confirmation, one ticket or forty, because the desk has no undo.
 *
 * No part of this surface touches the network, and it never fabricates a real
 * agent, a real company's support branding, a real case-management system, or
 * a response time that implies a human.
 */

/** The glyph size of a row's leading status icon. */
const RowIconGlyphSize = 17

/** The glyph size inside a row's trailing 26px buttons. */
const RowButtonGlyphSize = 15

/** The desk header's own glyph. */
const HeaderGlyphSize = 20

/** Sample ticket numbers handed to the regex builder's live tester. */
const MaxBuilderSamples = 50

/** Focusable descendants of the desk panel, in tab order. */
const FocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** The list's own filter chips, by stable identity rather than label. */
export type Md3SupportTicketFilter = 'open' | 'resolved' | 'urgent'

const FilterOrder: ReadonlyArray<Md3SupportTicketFilter> = [
  'open',
  'resolved',
  'urgent',
]

/** A deletion the gate has been opened for. */
type PendingDeletion = {
  readonly ids: ReadonlyArray<string>
  readonly scope: string
}

type OpenMenu =
  | { readonly kind: 'row'; readonly id: string; readonly anchor: HTMLElement }
  | { readonly kind: 'list'; readonly anchor: HTMLElement | null }
  | {
      readonly kind: 'export'
      /** `null` exports the current scope; an id exports that ticket alone. */
      readonly only: string | null
      readonly anchor: HTMLElement | null
    }
  | null

export interface IMd3SupportTicketsDeskProps {
  /** Which of the three routes the user arrived by. Named on the surface. */
  readonly entryPoint: SupportTicketEntryPoint

  /** The close button, the scrim and Escape all call this. */
  readonly onDismissed: () => void

  /**
   * Where tickets live. Defaults to this profile's local storage, beside the
   * app's other local data.
   */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>

  /**
   * Resolves the application data folder. Defaults to asking the running
   * application; injected by tests so the desk can be exercised without one.
   */
  readonly resolveFolder?: SupportTicketFolderResolver

  /**
   * Opens a folder in the platform's file manager, returning an empty string on
   * success and the platform's own message on failure.
   */
  readonly openFolder?: SupportTicketFolderOpener

  /**
   * Writes an export wherever the user picks, returning the path or `null` when
   * they cancel. The desk stays out of the file system so its export path is
   * testable without one.
   */
  readonly onExport?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>

  /** Copies text to the clipboard. */
  readonly onCopy?: (text: string) => void

  /** Injected by tests so ticket numbers and timestamps are deterministic. */
  readonly now?: () => Date
}

function categoryLabel(category: SupportTicketCategory): string {
  switch (category) {
    case 'forgottenPassword':
      return t('supportTickets.category.forgottenPassword')
    case 'lostAuthenticator':
      return t('supportTickets.category.lostAuthenticator')
    case 'lockedTab':
      return t('supportTickets.category.lockedTab')
    case 'lockedAppearance':
      return t('supportTickets.category.lockedAppearance')
    case 'somethingElse':
      return t('supportTickets.category.somethingElse')
  }
}

function severityLabel(severity: SupportTicketSeverity): string {
  switch (severity) {
    case 'whenever':
      return t('supportTickets.severity.whenever')
    case 'normal':
      return t('supportTickets.severity.normal')
    case 'urgent':
      return t('supportTickets.severity.urgent')
    case 'critical':
      return t('supportTickets.severity.critical')
  }
}

function statusLabel(status: SupportTicketStatus): string {
  switch (status) {
    case 'received':
      return t('supportTickets.status.received')
    case 'triaged':
      return t('supportTickets.status.triaged')
    case 'awaitingCustomer':
      return t('supportTickets.status.awaitingCustomer')
    case 'resolved':
      return t('supportTickets.status.resolved')
  }
}

function entryPointLabel(entryPoint: SupportTicketEntryPoint): string {
  switch (entryPoint) {
    case 'unlockPrompt':
      return t('supportTickets.arrivedFrom.unlockPrompt')
    case 'lockSetting':
      return t('supportTickets.arrivedFrom.lockSetting')
    case 'help':
      return t('supportTickets.arrivedFrom.help')
  }
}

function statusIcon(status: SupportTicketStatus): MaterialSymbolName {
  switch (status) {
    case 'received':
      return 'inbox'
    case 'triaged':
      return 'sort'
    case 'awaitingCustomer':
      return 'schedule'
    case 'resolved':
      return 'task_alt'
  }
}

/**
 * The desk's own words for one response.
 *
 * Only the first acknowledgement is banded by the funny level. The three that
 * follow state what the desk did and what is left for the user to do, which is
 * a fact rather than a voice.
 */
function responseText(response: ISupportTicketResponse): string {
  if (response.kind === 'acknowledged') {
    return translateWithFunnyLevel(
      'supportTickets.response.acknowledged',
      getPersistedLanguageMode(),
      readFunnyLevels()
    )
  }
  switch (response.kind) {
    case 'triaged':
      return t('supportTickets.response.triaged')
    case 'awaitingCustomer':
      return t('supportTickets.response.awaitingCustomer')
    case 'resolved':
      return t('supportTickets.response.resolved')
  }
}

/** The default export writer: a save dialog, then the bytes. */
async function defaultExport(
  contents: string,
  fileName: string
): Promise<string | null> {
  // The operating system's own save dialog reads this, so it is copy like any
  // other and goes through the catalogs rather than shipping as English to a
  // user who has the rest of the app in Cantonese.
  const destination = await showSaveDialog({
    title: t('supportTickets.export.saveDialogTitle'),
    defaultPath: fileName,
  })
  if (destination === null) {
    return null
  }
  await writeFile(destination, contents, 'utf8')
  return destination
}

/** The default folder resolver: whatever the running application reports. */
async function defaultResolveFolder(): Promise<string> {
  return getPath('userData')
}

/** The default opener. `shell.openPath` reports its own failure as a string. */
async function defaultOpenFolder(path: string): Promise<string> {
  return shell.openPath(path)
}

function defaultCopy(text: string): void {
  clipboard.writeText(text)
}

interface IMd3SupportTicketRowProps {
  readonly ticket: ISupportTicket
  readonly index: number
  readonly selected: boolean
  readonly focused: boolean
  readonly expanded: boolean
  readonly onToggleSelected: (
    ticket: ISupportTicket,
    index: number,
    extend: boolean
  ) => void
  readonly onToggleExpanded: (ticket: ISupportTicket) => void
  readonly onAdvance: (ticket: ISupportTicket) => void
  readonly onDelete: (ticket: ISupportTicket) => void
  readonly onContextMenu: (
    ticket: ISupportTicket,
    index: number,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void
  readonly onFocused: (index: number) => void
  readonly registerRow: (id: string, element: HTMLDivElement | null) => void
}

function Md3SupportTicketRow(props: IMd3SupportTicketRowProps) {
  const {
    ticket,
    index,
    selected,
    focused,
    expanded,
    onToggleSelected,
    onToggleExpanded,
    onAdvance,
    onDelete,
    onContextMenu,
    onKeyDown,
    onFocused,
    registerRow,
  } = props

  const rowRef = React.useCallback(
    (element: HTMLDivElement | null) => registerRow(ticket.id, element),
    [registerRow, ticket.id]
  )

  const handleClick = React.useCallback(
    () => onFocused(index),
    [onFocused, index]
  )

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) =>
      onContextMenu(ticket, index, event),
    [onContextMenu, ticket, index]
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
      onToggleSelected(ticket, index, event.shiftKey)
    },
    [onToggleSelected, ticket, index]
  )

  const handleSelectChange = React.useCallback(() => {
    // Handled by the click above; React still wants a change handler on a
    // controlled checkbox.
  }, [])

  const handleExpand = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onToggleExpanded(ticket)
    },
    [onToggleExpanded, ticket]
  )

  const handleAdvance = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onAdvance(ticket)
    },
    [onAdvance, ticket]
  )

  const handleDelete = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onDelete(ticket)
    },
    [onDelete, ticket]
  )

  const correspondenceId = `md3-support-correspondence-${ticket.id}`

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       a grid row is the focusable unit of this list: it carries roving
       tabindex, answers Enter and Space, and is reached by the arrow keys. */
    <div
      ref={rowRef}
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      className={classNames('md3-row', 'md3-support-tickets__row', {
        'md3-support-tickets__row--selected': selected,
        'md3-support-tickets__row--resolved': ticket.status === 'resolved',
      })}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      <span
        role="gridcell"
        className="md3-support-tickets__cell md3-support-tickets__cell--select"
      >
        <input
          type="checkbox"
          className="md3-support-checkbox"
          tabIndex={-1}
          checked={selected}
          aria-label={t('supportTickets.row.select', {
            number: ticket.number,
          })}
          onClick={handleSelectClick}
          onChange={handleSelectChange}
        />
      </span>
      <span
        role="gridcell"
        className="md3-support-tickets__cell md3-support-tickets__cell--status"
      >
        <MaterialSymbol
          name={statusIcon(ticket.status)}
          className="md3-support-tickets__status-icon"
          size={RowIconGlyphSize}
        />
      </span>
      <span
        role="gridcell"
        className="md3-support-tickets__cell md3-support-tickets__text"
      >
        <span className="md3-support-tickets__number">{ticket.number}</span>
        <span className="md3-support-tickets__description">
          {ticket.description}
        </span>
        <span className="md3-row__detail">
          {t('supportTickets.row.detail', {
            category: categoryLabel(ticket.category),
            severity: severityLabel(ticket.severity),
            status: statusLabel(ticket.status),
          })}
        </span>
        <span className="sr-only">
          {t('supportTickets.row.opened', { timestamp: ticket.createdAt })}
        </span>
        {expanded ? (
          <ul
            id={correspondenceId}
            className="md3-support-tickets__responses"
            aria-label={t('supportTickets.correspondence', {
              number: ticket.number,
            })}
          >
            {ticket.responses.map(response => (
              <li key={`${response.kind}-${response.at}`}>
                <span className="md3-support-tickets__response-body">
                  {responseText(response)}
                </span>
                <span className="md3-support-tickets__response-time">
                  {t('supportTickets.responseAt', { time: response.at })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </span>
      <span role="gridcell" className="md3-support-tickets__cell">
        <Md3GhostButton
          label={t('supportTickets.row.responses', {
            count: String(ticket.responses.length),
          })}
          icon="subject"
          pressed={expanded}
          onClick={handleExpand}
          onContextMenu={handleContextMenu}
        />
      </span>
      <span role="gridcell" className="md3-support-tickets__cell">
        <Md3IconButton
          small={true}
          icon="play_arrow"
          iconSize={RowButtonGlyphSize}
          label={t('supportTickets.row.advance', { number: ticket.number })}
          disabled={ticket.status === 'resolved'}
          onClick={handleAdvance}
          onContextMenu={handleContextMenu}
        />
      </span>
      <span role="gridcell" className="md3-support-tickets__cell">
        <Md3IconButton
          small={true}
          icon="delete"
          iconSize={RowButtonGlyphSize}
          label={t('supportTickets.row.delete', { number: ticket.number })}
          hasPopup="dialog"
          onClick={handleDelete}
          onContextMenu={handleContextMenu}
        />
      </span>
    </div>
  )
}

export function Md3SupportTicketsDesk(props: IMd3SupportTicketsDeskProps) {
  const {
    entryPoint,
    onDismissed,
    storage,
    resolveFolder = defaultResolveFolder,
    openFolder = defaultOpenFolder,
    onExport = defaultExport,
    onCopy = defaultCopy,
    now = () => new Date(),
  } = props

  // Re-read the catalogs whenever the language mode changes, so a desk left
  // open while the mode is switched does not keep speaking the old language.
  const [, setLanguageTick] = React.useState(0)
  React.useEffect(() => {
    const onLanguageChanged = () => setLanguageTick(current => current + 1)
    window.addEventListener(LanguageModeChangedEvent, onLanguageChanged)
    return () =>
      window.removeEventListener(LanguageModeChangedEvent, onLanguageChanged)
  }, [])

  const [tickets, setTickets] = React.useState<ReadonlyArray<ISupportTicket>>(
    () => readSupportTickets(storage)
  )
  const [everStored, setEverStored] = React.useState(
    () => readSupportTickets(storage).length > 0
  )

  const [category, setCategory] =
    React.useState<SupportTicketCategory>('forgottenPassword')
  const [severity, setSeverity] =
    React.useState<SupportTicketSeverity>('normal')
  const [description, setDescription] = React.useState('')
  const [descriptionTouched, setDescriptionTouched] = React.useState(false)

  const [query, setQuery] = React.useState('')
  const [regexEnabled, setRegexEnabled] = React.useState(false)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [builderOpen, setBuilderOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<
    ReadonlySet<Md3SupportTicketFilter>
  >(() => new Set<Md3SupportTicketFilter>())
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [focusIndex, setFocusIndex] = React.useState(0)
  const [menu, setMenu] = React.useState<OpenMenu>(null)
  const [pendingDeletion, setPendingDeletion] =
    React.useState<PendingDeletion | null>(null)

  const [folderPath, setFolderPath] = React.useState<string | null>(null)
  const [folderResolved, setFolderResolved] = React.useState(false)
  const [outcome, setOutcome] =
    React.useState<SupportTicketRecoveryOutcome | null>(null)

  const rowElements = React.useRef(new Map<string, HTMLDivElement>())
  const anchorIndex = React.useRef<number | null>(null)
  const pendingFocus = React.useRef(false)
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const descriptionRef = React.useRef<HTMLTextAreaElement | null>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const listMenuButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const exportMenuButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  // ---------------------------------------------------------------------
  // The application data folder
  // ---------------------------------------------------------------------

  React.useEffect(() => {
    let cancelled = false
    void resolveApplicationDataFolder(resolveFolder).then(path => {
      if (cancelled) {
        return
      }
      setFolderPath(path)
      setFolderResolved(true)
    })
    return () => {
      cancelled = true
    }
  }, [resolveFolder])

  // ---------------------------------------------------------------------
  // Focus containment
  // ---------------------------------------------------------------------

  React.useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeRef.current?.focus()
    const restoreTo = previouslyFocused.current
    return () => {
      if (restoreTo?.isConnected === true) {
        restoreTo.focus()
      }
    }
  }, [closeRef])

  const onPanelKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismissed()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const panel = panelRef.current
      if (panel === null) {
        return
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FocusableSelector)
      )
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onDismissed]
  )

  const onScrimMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onDismissed()
      }
    },
    [onDismissed]
  )

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  const commit = React.useCallback(
    (next: ReadonlyArray<ISupportTicket>) => {
      const stored = writeSupportTickets(next, storage)
      setTickets(stored)
      setEverStored(true)
      return stored
    },
    [storage]
  )

  // ---------------------------------------------------------------------
  // Search and filters
  // ---------------------------------------------------------------------

  const match = React.useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      return {
        test: null as null | ((value: string) => boolean),
        invalid: false,
      }
    }
    if (regexEnabled) {
      const { regex } = compileSafeRegex(trimmed, caseSensitive)
      if (regex === null) {
        return { test: null, invalid: true }
      }
      return { test: (value: string) => regex.test(value), invalid: false }
    }
    const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
    return {
      test: (value: string) =>
        (caseSensitive ? value : value.toLowerCase()).includes(needle),
      invalid: false,
    }
  }, [query, regexEnabled, caseSensitive])

  const visible = React.useMemo(() => {
    const test = match.test
    return tickets.filter(ticket => {
      if (test !== null) {
        const haystack = [
          ticket.number,
          ticket.description,
          categoryLabel(ticket.category),
          severityLabel(ticket.severity),
          statusLabel(ticket.status),
        ]
        if (!haystack.some(test)) {
          return false
        }
      }
      if (filters.has('open') && ticket.status === 'resolved') {
        return false
      }
      if (filters.has('resolved') && ticket.status !== 'resolved') {
        return false
      }
      if (
        filters.has('urgent') &&
        ticket.severity !== 'urgent' &&
        ticket.severity !== 'critical'
      ) {
        return false
      }
      return true
    })
  }, [tickets, match, filters])

  const filtersActive = filters.size > 0 || query.trim().length > 0

  React.useEffect(() => {
    setSelected(current => {
      if (current.size === 0) {
        return current
      }
      const live = new Set(tickets.map(entry => entry.id))
      const next = new Set([...current].filter(id => live.has(id)))
      return next.size === current.size ? current : next
    })
  }, [tickets])

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

  const selectedTickets = React.useMemo(
    () => tickets.filter(entry => selected.has(entry.id)),
    [tickets, selected]
  )

  /** What a bulk action runs on: the selection when there is one, else the filter. */
  const scopeTickets = selectedTickets.length > 0 ? selectedTickets : visible

  const scopeDescription =
    selectedTickets.length > 0
      ? t('supportTickets.scope.selection', {
          count: String(selectedTickets.length),
        })
      : filtersActive
      ? t('supportTickets.scope.filtered', { count: String(visible.length) })
      : t('supportTickets.scope.all', { count: String(visible.length) })

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

  const closeMenu = React.useCallback(() => setMenu(null), [])

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
    () => visible.slice(0, MaxBuilderSamples).map(entry => entry.number),
    [visible]
  )

  const toggleFilter = React.useCallback((filter: Md3SupportTicketFilter) => {
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

  const onToggleOpen = React.useCallback(
    () => toggleFilter('open'),
    [toggleFilter]
  )
  const onToggleResolved = React.useCallback(
    () => toggleFilter('resolved'),
    [toggleFilter]
  )
  const onToggleUrgent = React.useCallback(
    () => toggleFilter('urgent'),
    [toggleFilter]
  )

  const onResetFilters = React.useCallback(() => {
    setFilters(new Set<Md3SupportTicketFilter>())
    setQuery('')
    setRegexEnabled(false)
  }, [])

  // ---------------------------------------------------------------------
  // The form
  // ---------------------------------------------------------------------

  const onCategoryChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCategory(event.currentTarget.value as SupportTicketCategory)
    },
    []
  )

  const onSeverityChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSeverity(event.currentTarget.value as SupportTicketSeverity)
    },
    []
  )

  const onDescriptionChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(
        event.currentTarget.value.slice(
          0,
          MaximumSupportTicketDescriptionLength
        )
      )
    },
    []
  )

  const descriptionValid = isValidSupportTicketDescription(description)

  const submitTicket = React.useCallback(() => {
    setDescriptionTouched(true)
    if (!descriptionValid) {
      // The button stays live rather than disabled: a disabled control gives a
      // keyboard user nothing to press and no explanation of why.
      descriptionRef.current?.focus()
      return
    }
    const ticket = createSupportTicket(
      { category, severity, description, entryPoint },
      { at: now(), existing: tickets }
    )
    commit([ticket, ...tickets])
    setDescription('')
    setDescriptionTouched(false)
    setExpanded(current => new Set([...current, ticket.id]))
    notify(t('supportTickets.toast.created', { number: ticket.number }))
  }, [
    descriptionValid,
    category,
    severity,
    description,
    entryPoint,
    now,
    tickets,
    commit,
  ])

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submitTicket()
    },
    [submitTicket]
  )

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
    (ticket: ISupportTicket, index: number, extend: boolean) => {
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
        if (next.has(ticket.id)) {
          next.delete(ticket.id)
        } else {
          next.add(ticket.id)
        }
        return next
      })
    },
    [visible]
  )

  const onSelectAllVisible = React.useCallback(() => {
    const ids = visible.map(entry => entry.id)
    setSelected(current => {
      const everySelected = ids.length > 0 && ids.every(id => current.has(id))
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
    setSelectionFrom(tickets.map(entry => entry.id))
    notify(
      t('supportTickets.toast.selectedAll', { count: String(tickets.length) })
    )
  }, [tickets, setSelectionFrom])

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

  const onToggleExpanded = React.useCallback((ticket: ISupportTicket) => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(ticket.id)) {
        next.delete(ticket.id)
      } else {
        next.add(ticket.id)
      }
      return next
    })
  }, [])

  const onRowFocused = React.useCallback(
    (index: number) => setFocusIndex(index),
    []
  )

  // ---------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------

  const advanceMany = React.useCallback(
    (targets: ReadonlyArray<ISupportTicket>) => {
      const advancing = new Set(
        targets.filter(entry => entry.status !== 'resolved').map(e => e.id)
      )
      if (advancing.size === 0) {
        const single = targets.length === 1 ? targets[0] : null
        if (single !== null) {
          notify(
            t('supportTickets.toast.alreadyResolved', {
              number: single.number,
            })
          )
        }
        return
      }
      const at = now()
      const next = tickets.map(entry =>
        advancing.has(entry.id) ? advanceSupportTicket(entry, at) : entry
      )
      commit(next)
      const first = next.find(entry => advancing.has(entry.id))
      if (first !== undefined) {
        notify(
          t('supportTickets.toast.advanced', {
            number: first.number,
            status: statusLabel(first.status),
          })
        )
      }
    },
    [tickets, commit, now]
  )

  const onAdvanceOne = React.useCallback(
    (ticket: ISupportTicket) => advanceMany([ticket]),
    [advanceMany]
  )

  const onBulkAdvance = React.useCallback(
    () => advanceMany(scopeTickets),
    [advanceMany, scopeTickets]
  )

  /**
   * Every deletion opens the gate — one ticket or forty. The desk has no undo,
   * so there is no count at which a delete stops being irreversible.
   */
  const requestDeletion = React.useCallback(
    (targets: ReadonlyArray<ISupportTicket>, scope: string) => {
      if (targets.length === 0) {
        return
      }
      setMenu(null)
      setPendingDeletion({ ids: targets.map(entry => entry.id), scope })
    },
    []
  )

  const onDeleteOne = React.useCallback(
    (ticket: ISupportTicket) =>
      requestDeletion(
        [ticket],
        t('supportTickets.rowMenu.title', {
          number: ticket.number,
        })
      ),
    [requestDeletion]
  )

  const onRequestBulkDelete = React.useCallback(
    () => requestDeletion(scopeTickets, scopeDescription),
    [requestDeletion, scopeTickets, scopeDescription]
  )

  const onCancelDeletion = React.useCallback(() => setPendingDeletion(null), [])

  const onConfirmDeletion = React.useCallback(() => {
    if (pendingDeletion === null) {
      return
    }
    const doomed = new Set(pendingDeletion.ids)
    const remaining = tickets.filter(entry => !doomed.has(entry.id))
    commit(remaining)
    setSelected(current => {
      const next = new Set([...current].filter(id => !doomed.has(id)))
      return next
    })
    setPendingDeletion(null)
    if (doomed.size === 1) {
      notify(
        t('supportTickets.toast.deleted', {
          number: pendingDeletion.ids[0],
        })
      )
    } else {
      notify(
        t('supportTickets.toast.deletedMany', { count: String(doomed.size) })
      )
    }
  }, [pendingDeletion, tickets, commit])

  const runExport = React.useCallback(
    (format: SupportTicketExportFormat, only: string | null) => {
      const rows =
        only === null
          ? scopeTickets
          : tickets.filter(entry => entry.id === only)
      const scope =
        only === null
          ? scopeDescription
          : t('supportTickets.scope.selection', { count: String(rows.length) })
      const payload: ISupportTicketExport = serializeSupportTicketExport(
        rows.map(ticket =>
          toSupportTicketExportRecord(ticket, {
            category: categoryLabel(ticket.category),
            severity: severityLabel(ticket.severity),
            status: statusLabel(ticket.status),
            entryPoint: entryPointLabel(ticket.entryPoint),
          })
        ),
        format,
        { scope }
      )
      setMenu(null)
      void onExport(payload.content, payload.filename).then(destination => {
        if (destination === null) {
          return
        }
        notify(
          t('supportTickets.toast.exported', {
            count: String(payload.count),
            format: payload.format.toUpperCase(),
          })
        )
      })
    },
    [scopeTickets, scopeDescription, tickets, onExport]
  )

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  const moveFocus = React.useCallback(
    (index: number) => {
      pendingFocus.current = true
      setFocusIndex(Math.max(0, Math.min(index, visible.length - 1)))
    },
    [visible.length]
  )

  const onRowKeyDown = React.useCallback(
    (index: number, event: React.KeyboardEvent<HTMLDivElement>) => {
      const ticket = visible[index]
      if (ticket === undefined) {
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
            addToSelection([ticket.id, visible[next].id])
          }
          moveFocus(next)
          return
        }
        case 'ArrowUp': {
          event.preventDefault()
          const previous = Math.max(index - 1, 0)
          if (event.shiftKey) {
            addToSelection([ticket.id, visible[previous].id])
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
            onAdvanceOne(ticket)
          }
          return
        case ' ':
        case 'Spacebar':
          if (event.target === row) {
            event.preventDefault()
            onToggleSelected(ticket, index, event.shiftKey)
          }
          return
        case 'Delete':
        case 'Backspace':
          if (event.target === row) {
            event.preventDefault()
            onDeleteOne(ticket)
          }
          return
        case 'Escape':
          if (selected.size > 0) {
            event.preventDefault()
            event.stopPropagation()
            onClearSelection()
          }
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
          setMenu({
            kind: 'row',
            id: ticket.id,
            anchor: rowElements.current.get(ticket.id) ?? row,
          })
          return
        default:
          return
      }
    },
    [
      visible,
      moveFocus,
      addToSelection,
      onAdvanceOne,
      onToggleSelected,
      onDeleteOne,
      onClearSelection,
      setSelectionFrom,
      selected.size,
    ]
  )

  const onRowContextMenu = React.useCallback(
    (
      ticket: ISupportTicket,
      index: number,
      event: React.MouseEvent<HTMLElement>
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setFocusIndex(index)
      setMenu({ kind: 'row', id: ticket.id, anchor: event.currentTarget })
    },
    []
  )

  // ---------------------------------------------------------------------
  // The resolution
  // ---------------------------------------------------------------------

  const onOpenFolder = React.useCallback(() => {
    void openApplicationDataFolder(folderPath, openFolder).then(result => {
      setOutcome(result)
      if (result.kind === 'opened') {
        notify(t('supportTickets.toast.folderOpened', { path: result.path }))
        return
      }
      if (result.kind === 'failed') {
        notify(
          t('supportTickets.toast.folderFailed', {
            path: result.path,
            error: result.error,
          }),
          { kind: 'error' }
        )
        return
      }
      notify(
        t('supportTickets.toast.folderUnavailable', { error: result.error }),
        { kind: 'error' }
      )
    })
  }, [folderPath, openFolder])

  const onCopyPath = React.useCallback(() => {
    if (folderPath === null) {
      return
    }
    onCopy(folderPath)
    notify(t('supportTickets.toast.copiedPath', { path: folderPath }))
  }, [folderPath, onCopy])

  // ---------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------

  const menuTicket =
    menu !== null && menu.kind === 'row'
      ? tickets.find(entry => entry.id === menu.id) ?? null
      : null

  const rowMenuSpec = React.useMemo((): IMd3MenuSpec | null => {
    const ticket = menuTicket
    if (ticket === null) {
      return null
    }
    const items: Array<IMd3MenuItem> = [
      {
        id: 'advance',
        label: t('supportTickets.rowMenu.advance'),
        icon: 'play_arrow',
        hint: '↵',
        onClick: () => {
          onAdvanceOne(ticket)
          closeMenu()
        },
      },
      {
        id: 'select',
        label: selected.has(ticket.id)
          ? t('supportTickets.rowMenu.deselect')
          : t('supportTickets.rowMenu.select'),
        icon: 'library_add_check',
        hint: '⇧click',
        onClick: () => {
          setSelected(current => {
            const next = new Set(current)
            if (next.has(ticket.id)) {
              next.delete(ticket.id)
            } else {
              next.add(ticket.id)
            }
            return next
          })
          closeMenu()
        },
      },
      {
        id: 'copyNumber',
        label: t('supportTickets.rowMenu.copyNumber'),
        icon: 'content_copy',
        hint: '',
        onClick: () => {
          onCopy(ticket.number)
          notify(t('supportTickets.toast.copied', { number: ticket.number }))
          closeMenu()
        },
      },
      {
        id: 'exportOne',
        label: t('supportTickets.rowMenu.export'),
        icon: 'cloud_download',
        hint: '',
        onClick: () =>
          setMenu({
            kind: 'export',
            only: ticket.id,
            anchor: rowElements.current.get(ticket.id) ?? null,
          }),
      },
      {
        id: 'delete',
        label: t('supportTickets.rowMenu.delete'),
        icon: 'delete',
        hint: '⌫',
        onClick: () => onDeleteOne(ticket),
      },
    ]

    return {
      kind: 'rowMenu',
      title: t('supportTickets.rowMenu.title', { number: ticket.number }),
      icon: 'live_help',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('supportTickets.menuFilterPlaceholder'),
      items,
    }
  }, [menuTicket, selected, onAdvanceOne, onCopy, onDeleteOne, closeMenu])

  const listMenuSpec = React.useMemo((): IMd3MenuSpec => {
    const items: Array<IMd3MenuItem> = [
      {
        id: 'selectFiltered',
        label: t('supportTickets.listMenu.selectFiltered', {
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
        label: t('supportTickets.listMenu.selectEverything', {
          count: String(tickets.length),
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
        label: t('supportTickets.listMenu.invert'),
        icon: 'swap_horiz',
        hint: '',
        onClick: () => {
          onInvertSelection()
          closeMenu()
        },
      },
      {
        id: 'clearSelection',
        label: t('supportTickets.listMenu.clearSelection'),
        icon: 'close',
        hint: 'Esc',
        onClick: () => {
          onClearSelection()
          closeMenu()
        },
      },
      {
        id: 'advanceScope',
        label: t('supportTickets.listMenu.advanceScope', {
          count: String(scopeTickets.length),
        }),
        icon: 'play_arrow',
        hint: '',
        onClick: () => {
          onBulkAdvance()
          closeMenu()
        },
      },
      {
        id: 'export',
        label: t('supportTickets.listMenu.export', {
          count: String(scopeTickets.length),
        }),
        icon: 'cloud_download',
        hint: '',
        onClick: () =>
          setMenu({
            kind: 'export',
            only: null,
            anchor: listMenuButtonRef.current,
          }),
      },
      {
        id: 'bulkDelete',
        label: t('supportTickets.listMenu.deleteScope', {
          count: String(scopeTickets.length),
        }),
        icon: 'delete_sweep',
        hint: '',
        onClick: onRequestBulkDelete,
      },
    ]

    return {
      kind: 'listMenu',
      title: t('supportTickets.listMenu.title'),
      icon: 'live_help',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('supportTickets.menuFilterPlaceholder'),
      items,
    }
  }, [
    visible,
    tickets.length,
    scopeTickets.length,
    onSelectEverything,
    onInvertSelection,
    onClearSelection,
    onBulkAdvance,
    onRequestBulkDelete,
    setSelectionFrom,
    closeMenu,
  ])

  const exportOnly = menu !== null && menu.kind === 'export' ? menu.only : null

  const exportMenuSpec = React.useMemo(
    (): IMd3MenuSpec => ({
      kind: 'listMenu',
      title: t('supportTickets.exportMenu.title'),
      icon: 'cloud_download',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('supportTickets.exportMenu.filterPlaceholder'),
      items: SupportTicketExportFormats.map(descriptor => ({
        id: descriptor.format,
        label: descriptor.label,
        icon: 'description' as MaterialSymbolName,
        hint: `.${descriptor.extension}`,
        onClick: () => runExport(descriptor.format, exportOnly),
      })),
    }),
    [runExport, exportOnly]
  )

  const onOpenListMenu = React.useCallback(
    () => setMenu({ kind: 'list', anchor: listMenuButtonRef.current }),
    [listMenuButtonRef]
  )

  const onOpenBulkExport = React.useCallback(
    () =>
      setMenu({
        kind: 'export',
        only: null,
        anchor: exportMenuButtonRef.current,
      }),
    [exportMenuButtonRef]
  )

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const allVisibleSelected =
    visible.length > 0 && selectedVisibleCount === visible.length

  const languageMode = getPersistedLanguageMode()
  const funnyLevels = readFunnyLevels()

  return (
    <div
      className="md3-support-tickets md3-anim-fade--overlay"
      role="presentation"
      onMouseDown={onScrimMouseDown}
    >
      {/*
        eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
        the panel is the modal surface itself: it answers Escape and wraps Tab
        so neither can escape into the application behind the scrim. Every
        control inside it is separately focusable and separately operable.
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        className="md3-support-tickets__panel md3-anim-menu"
        role="dialog"
        aria-modal={true}
        aria-labelledby="md3-support-tickets-title"
        aria-describedby="md3-support-tickets-disclosure"
        onKeyDown={onPanelKeyDown}
      >
        <header className="md3-support-tickets__header">
          <MaterialSymbol
            name="live_help"
            className="md3-support-tickets__header-icon"
            size={HeaderGlyphSize}
          />
          <div className="md3-support-tickets__heading">
            <h1
              id="md3-support-tickets-title"
              className="md3-support-tickets__title"
            >
              {t('supportTickets.title')}
            </h1>
            <p className="md3-support-tickets__subtitle">
              {t('supportTickets.subtitle')}
            </p>
          </div>
          <Md3IconButton
            icon="close"
            label={t('supportTickets.close')}
            buttonRef={closeRef}
            onClick={onDismissed}
          />
        </header>

        {/*
          The bit is a bit, and this line is where the app says so. It is fixed
          copy in both languages, outside the comedy and unstyled by the funny
          level, because a user waiting for a reply that was never coming is the
          one outcome this whole feature exists to prevent.
        */}
        <p
          id="md3-support-tickets-disclosure"
          className="md3-support-tickets__disclosure"
          role="note"
        >
          <MaterialSymbol name="shield" size={16} />
          {/*
            The glyph is a ligature font, so its own name is in the DOM as text.
            The sentence lives in its own element to keep it separable from that
            — both for a reader and for the test that asserts it is unaltered.
          */}
          <span className="md3-support-tickets__disclosure-text">
            {t('supportTickets.disclosure')}
          </span>
        </p>

        <p className="md3-support-tickets__origin" role="status">
          {entryPointLabel(entryPoint)}
        </p>

        <p className="md3-support-tickets__lead">
          {translateWithFunnyLevel(
            'supportTickets.deskLead',
            languageMode,
            funnyLevels
          )}
        </p>

        <details className="md3-support-tickets__explain">
          <summary>{t('supportTickets.explain.summary')}</summary>
          <p>{t('supportTickets.explain.body')}</p>
          <p className="md3-support-tickets__provenance">
            {everStored
              ? t('supportTickets.provenance.stored', {
                  count: String(tickets.length),
                })
              : t('supportTickets.provenance.default')}
          </p>
        </details>

        <form className="md3-support-tickets__form" onSubmit={onSubmit}>
          <fieldset className="md3-support-tickets__fieldset">
            <legend>{t('supportTickets.form.legend')}</legend>

            <fieldset
              className="md3-support-tickets__options"
              aria-describedby="md3-support-tickets-category-hint"
            >
              <legend>{t('supportTickets.form.category')}</legend>
              {SupportTicketCategories.map(value => (
                <label key={value} className="md3-support-tickets__option">
                  <input
                    type="radio"
                    name="md3-support-ticket-category"
                    value={value}
                    checked={category === value}
                    onChange={onCategoryChanged}
                  />
                  <span>{categoryLabel(value)}</span>
                </label>
              ))}
            </fieldset>
            <p
              id="md3-support-tickets-category-hint"
              className="md3-support-tickets__hint"
            >
              {t('supportTickets.form.categoryHint')}
            </p>

            <fieldset
              className="md3-support-tickets__options"
              aria-describedby="md3-support-tickets-severity-hint"
            >
              <legend>{t('supportTickets.form.severity')}</legend>
              {SupportTicketSeverities.map(value => (
                <label key={value} className="md3-support-tickets__option">
                  <input
                    type="radio"
                    name="md3-support-ticket-severity"
                    value={value}
                    checked={severity === value}
                    onChange={onSeverityChanged}
                  />
                  <span>{severityLabel(value)}</span>
                </label>
              ))}
            </fieldset>
            <p
              id="md3-support-tickets-severity-hint"
              className="md3-support-tickets__hint"
            >
              {t('supportTickets.form.severityHint')}
            </p>

            <label
              className="md3-support-tickets__description-label"
              htmlFor="md3-support-ticket-description"
            >
              {t('supportTickets.form.description')}
            </label>
            <textarea
              id="md3-support-ticket-description"
              ref={descriptionRef}
              className="md3-support-tickets__textarea"
              value={description}
              rows={3}
              maxLength={MaximumSupportTicketDescriptionLength}
              aria-invalid={descriptionTouched && !descriptionValid}
              aria-describedby={
                descriptionTouched && !descriptionValid
                  ? 'md3-support-tickets-description-error md3-support-tickets-description-hint'
                  : 'md3-support-tickets-description-hint'
              }
              onChange={onDescriptionChanged}
            />
            <p
              id="md3-support-tickets-description-hint"
              className="md3-support-tickets__hint"
            >
              {t('supportTickets.form.descriptionHint', {
                used: String(
                  normalizeSupportTicketDescription(description).length
                ),
                max: String(MaximumSupportTicketDescriptionLength),
              })}
            </p>
            {descriptionTouched && !descriptionValid ? (
              <p
                id="md3-support-tickets-description-error"
                className="md3-support-tickets__error"
                role="alert"
              >
                {t('supportTickets.form.descriptionRequired')}
              </p>
            ) : null}

            <div className="md3-support-tickets__form-actions">
              <Md3TonalButton
                label={t('supportTickets.form.submit')}
                icon="send"
                onClick={submitTicket}
                className="md3-support-tickets__submit"
              />
            </div>
          </fieldset>
        </form>

        <section
          className="md3-support-tickets__list-section"
          aria-label={t('supportTickets.list')}
        >
          <Md3SearchField
            id="md3-support-tickets-search"
            searchSurfaceId="md3-support-tickets"
            value={query}
            placeholder={t('supportTickets.searchPlaceholder')}
            fieldLabel={t('supportTickets.searchField')}
            regexEnabled={regexEnabled}
            matchCount={visible.length}
            onChange={onSearchChange}
            onClear={onSearchClear}
            onToggleRegex={onToggleRegex}
            onOpenBuilder={onOpenBuilder}
          />

          {match.invalid ? (
            <p className="md3-support-tickets__note" role="status">
              {t('supportTickets.invalidPattern')}
            </p>
          ) : null}

          <Md3ChipRow label={t('supportTickets.filters')}>
            {FilterOrder.map(filter => (
              <Md3Chip
                key={filter}
                label={
                  filter === 'open'
                    ? t('supportTickets.chip.open')
                    : filter === 'resolved'
                    ? t('supportTickets.chip.resolved')
                    : t('supportTickets.chip.urgent')
                }
                active={filters.has(filter)}
                onToggle={
                  filter === 'open'
                    ? onToggleOpen
                    : filter === 'resolved'
                    ? onToggleResolved
                    : onToggleUrgent
                }
              />
            ))}
            <Md3ChipRowSpacer />
          </Md3ChipRow>

          <div className="md3-support-tickets__bulk">
            <label className="md3-support-tickets__select-all">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="md3-support-checkbox"
                checked={allVisibleSelected}
                disabled={visible.length === 0}
                onChange={onSelectAllVisible}
              />
              <span>
                {filtersActive
                  ? t('supportTickets.selectAllFiltered', {
                      count: String(visible.length),
                    })
                  : t('supportTickets.selectAllEverything', {
                      count: String(visible.length),
                    })}
              </span>
            </label>

            <span
              className="md3-support-tickets__selection-count"
              role="status"
            >
              {t('supportTickets.selectionCount', {
                count: String(selected.size),
              })}
            </span>

            <Md3GhostButton
              label={t('supportTickets.invertSelection')}
              icon="swap_horiz"
              disabled={visible.length === 0}
              onClick={onInvertSelection}
            />
            <Md3GhostButton
              label={t('supportTickets.bulkAdvance')}
              accessibleName={t('supportTickets.bulkScoped', {
                label: t('supportTickets.bulkAdvance'),
                scope: scopeDescription,
              })}
              icon="play_arrow"
              disabled={scopeTickets.every(
                entry => entry.status === 'resolved'
              )}
              onClick={onBulkAdvance}
            />
            <Md3GhostButton
              label={t('supportTickets.bulkExport')}
              accessibleName={t('supportTickets.bulkScoped', {
                label: t('supportTickets.bulkExport'),
                scope: scopeDescription,
              })}
              icon="cloud_download"
              buttonRef={exportMenuButtonRef}
              hasPopup="menu"
              disabled={scopeTickets.length === 0}
              onClick={onOpenBulkExport}
            />
            <Md3GhostButton
              label={t('supportTickets.bulkDelete')}
              accessibleName={t('supportTickets.bulkScoped', {
                label: t('supportTickets.bulkDelete'),
                scope: scopeDescription,
              })}
              icon="delete_sweep"
              className="md3-support-tickets__danger"
              hasPopup="dialog"
              disabled={scopeTickets.length === 0}
              onClick={onRequestBulkDelete}
            />
            <Md3IconButton
              small={true}
              icon="more_vert"
              label={t('supportTickets.moreActions')}
              hasPopup="menu"
              expanded={menu !== null && menu.kind === 'list'}
              buttonRef={listMenuButtonRef}
              onClick={onOpenListMenu}
            />
          </div>

          {visible.length === 0 ? (
            <Md3EmptyState
              icon={filtersActive ? 'search_off' : 'live_help'}
              message={
                filtersActive
                  ? t('supportTickets.empty.noMatch')
                  : t('supportTickets.empty.none')
              }
              onAction={filtersActive ? onResetFilters : undefined}
            />
          ) : (
            <div
              role="grid"
              aria-multiselectable={true}
              aria-label={t('supportTickets.list')}
              aria-rowcount={visible.length}
              className="md3-support-tickets__list"
            >
              {visible.map((ticket, index) => (
                <Md3SupportTicketRow
                  key={ticket.id}
                  ticket={ticket}
                  index={index}
                  selected={selected.has(ticket.id)}
                  focused={index === focusIndex}
                  expanded={expanded.has(ticket.id)}
                  onToggleSelected={onToggleSelected}
                  onToggleExpanded={onToggleExpanded}
                  onAdvance={onAdvanceOne}
                  onDelete={onDeleteOne}
                  onContextMenu={onRowContextMenu}
                  onKeyDown={onRowKeyDown}
                  onFocused={onRowFocused}
                  registerRow={registerRow}
                />
              ))}
            </div>
          )}
        </section>

        <section
          className="md3-support-tickets__resolution"
          aria-labelledby="md3-support-tickets-resolution-heading"
        >
          <h2
            id="md3-support-tickets-resolution-heading"
            className="md3-support-tickets__resolution-heading"
          >
            {t('supportTickets.resolution.heading')}
          </h2>
          <p className="md3-support-tickets__lead">
            {translateWithFunnyLevel(
              'supportTickets.resolution.lead',
              languageMode,
              funnyLevels
            )}
          </p>

          <p className="md3-support-tickets__path-label">
            {t('supportTickets.resolution.pathLabel')}
          </p>
          {folderPath === null ? (
            <p className="md3-support-tickets__path-missing">
              {folderResolved
                ? t('supportTickets.resolution.pathUnavailable')
                : t('supportTickets.resolution.pathResolving')}
            </p>
          ) : (
            <p className="md3-support-tickets__path">
              <code>{folderPath}</code>
            </p>
          )}
          <p className="md3-support-tickets__provenance">
            {folderPath === null
              ? t('supportTickets.resolution.pathProvenanceUnresolved')
              : t('supportTickets.resolution.pathProvenanceResolved')}
          </p>

          <div className="md3-support-tickets__resolution-actions">
            <Md3TonalButton
              label={t('supportTickets.resolution.open')}
              icon="folder_open"
              disabled={folderPath === null}
              onClick={onOpenFolder}
            />
            <Md3GhostButton
              label={t('supportTickets.resolution.copyPath')}
              icon="content_copy"
              disabled={folderPath === null}
              onClick={onCopyPath}
            />
          </div>

          {/*
            Fixed copy: the app opens the folder and stops there. Any product
            that ever offers to delete it in-app owes that action the two-key
            super confirmation, never a button on a joke ticket.
          */}
          <p className="md3-support-tickets__never-deletes">
            {t('supportTickets.resolution.neverDeletes')}
          </p>

          <p className="md3-support-tickets__outcome" role="status">
            {outcome === null
              ? ''
              : outcome.kind === 'opened'
              ? t('supportTickets.resolution.opened', { path: outcome.path })
              : outcome.kind === 'failed'
              ? t('supportTickets.resolution.failed', {
                  path: outcome.path,
                  error: outcome.error,
                })
              : t('supportTickets.resolution.unavailable', {
                  error: outcome.error,
                })}
          </p>
        </section>
      </div>

      {builderOpen ? (
        <Md3RegexBuilderDialog
          targetLabel={t('supportTickets.searchField')}
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
          instanceId={`row-${menu.id}`}
          anchor={menu.anchor}
          anchorPosition={PopoverAnchorPosition.RightTop}
          returnFocusTo={{ current: menu.anchor }}
        />
      ) : null}

      {menu !== null && menu.kind === 'list' ? (
        <Md3MenuOverlay
          spec={listMenuSpec}
          onDismiss={closeMenu}
          returnFocusTo={listMenuButtonRef}
          instanceId="list"
          anchor={menu.anchor}
        />
      ) : null}

      {menu !== null && menu.kind === 'export' ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={closeMenu}
          returnFocusTo={exportMenuButtonRef}
          instanceId={`export-${menu.only ?? 'all'}`}
          anchor={menu.anchor}
        />
      ) : null}

      {pendingDeletion !== null ? (
        <Md3SupportTicketDeleteGate
          count={pendingDeletion.ids.length}
          scope={pendingDeletion.scope}
          onConfirm={onConfirmDeletion}
          onDismissed={onCancelDeletion}
        />
      ) : null}
    </div>
  )
}
