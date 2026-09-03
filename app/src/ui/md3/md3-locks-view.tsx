import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import {
  filterMd3Locks,
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3LockExport,
  isMd3UnlockActive,
  Md3LockExportFormat,
  Md3LockExportFormats,
  Md3LockSurfaceKind,
  serializeMd3LockExport,
  toMd3LockExportRecord,
} from '../../lib/md3-locks'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3EmptyState,
  Md3GhostButton,
  Md3IconButton,
  Md3SearchField,
} from './md3-primitives'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { IMd3BulkAction, Md3BulkBar } from './md3-bulk-bar'
import {
  IMd3ListExportColumn,
  Md3ListExportFormat,
  md3ListExportSchema,
} from './md3-list-export'
import { IMd3MenuSpec } from './md3-menu-specs'
import { Md3MenuOverlay } from './md3-menu-overlay'
import {
  md3ApplySelection,
  md3BulkPartitionSummary,
  md3BulkScopeLabel,
  md3InvertSelection,
  md3PartitionBulk,
  md3SelectionIntent,
  md3ToggleSelectAll,
} from './md3-list-selection'
import { Md3LockRemovalGate } from './md3-lock-removal-gate'
import { IMd3LockAnchorRect } from './md3-lock-unlock-prompt'
import { notify } from './md3-toast'
import { announceAppearanceLockBlocked } from '../appearance/appearance-lock-gate'

/**
 * The lock manager: every lock in the app, as a real list.
 *
 * "Each and every lock carries its own credential" is a promise the user has to
 * be able to check, so the locks are enumerable rather than scattered: one row
 * per lock, searchable through the same regex-wired search bar every other list
 * has, individually editable and removable, and manageable in bulk.
 *
 * It carries what this project asks of every list — multi-select by click,
 * shift-click and keyboard; a select-all that says out loud whether it means
 * the searched set or everything; an inverse selection; and bulk removal and
 * export. Bulk removal forgets credentials that cannot be recovered, so it goes
 * through the destructive-action super confirmation; removing one named lock
 * from its own row does not.
 *
 * The manager never reveals a credential. A row shows what a lock covers, which
 * factor answers it, when it was made and whether it is open right now — and
 * nothing whatsoever about the value that opens it.
 */

/** The glyph size of a row's leading lock icon. */
const RowIconGlyphSize = 17

/** The glyph size inside a row's trailing 26px buttons. */
const RowButtonGlyphSize = 15

/** Sample labels handed to the regex builder's live tester. */
const MaxBuilderSamples = 50

const SurfaceIcons: Readonly<Record<Md3LockSurfaceKind, MaterialSymbolName>> = {
  // `tab` is not one of the bundled ligatures, and a name outside the bundled
  // set renders as the literal English word rather than a glyph.
  tab: 'view_stream',
  tabGroup: 'stacks',
  appearanceProperty: 'palette',
  appearanceElement: 'category',
  appearancePreset: 'inventory_2',
}

const SurfaceLabelKeys = {
  tab: 'md3.locks.surface.tab',
  tabGroup: 'md3.locks.surface.tabGroup',
  appearanceProperty: 'md3.locks.surface.appearanceProperty',
  appearanceElement: 'md3.locks.surface.appearanceElement',
  appearancePreset: 'md3.locks.surface.appearancePreset',
} as const

/**
 * The export schema for a lock row.
 *
 * Every field {@link toMd3LockExportRecord} writes, and nothing else — above
 * all no credential, no digest, no salt and no secret. Nothing here is
 * multiline, so no format drops a field and the picker offers every format it
 * can actually produce without a loss warning.
 */
export const Md3LockExportColumns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'id' },
  { name: 'surface' },
  { name: 'targetId' },
  { name: 'targetLabel' },
  { name: 'factor' },
  { name: 'otpAccountKey' },
  { name: 'unlockDurationKind' },
  { name: 'unlockDurationMinutes' },
  { name: 'lockOnLaunch' },
  { name: 'createdAt' },
]

/**
 * Flatten one lock for export.
 *
 * A thin re-shaping of the model's own flattener rather than a second one:
 * two record builders would drift, and the one that drifted would be the one
 * that quietly started writing something the credential rules forbid.
 */
export function md3LockExportRecord(
  lock: IMd3Lock
): Readonly<Record<string, string | number | boolean>> {
  return { ...toMd3LockExportRecord(lock) }
}

export interface IMd3LocksViewProps {
  readonly locks: ReadonlyArray<IMd3Lock>

  /** The unlocks currently in force, so a row can say it is open. */
  readonly activeUnlocks: ReadonlyArray<IMd3ActiveUnlock>

  /** Named in the recovery sentence. `null` renders the honest fallback. */
  readonly applicationDataFolder: string | null

  /** Open the setup dialog anchored beside the row's Edit button. */
  readonly onEditLock: (lock: IMd3Lock, anchor: IMd3LockAnchorRect) => void

  /** Remove these locks and forget their credentials. */
  readonly onRemoveLocks: (lockIds: ReadonlyArray<string>) => void

  /** Retire a live unlock so the surface is locked again immediately. */
  readonly onLockAgain: (lock: IMd3Lock) => void

  /** Hand the serialized export to the host, which decides where it lands. */
  readonly onExport: (result: IMd3LockExport) => void

  /** Injected by tests. Defaults to `Date.now`. */
  readonly now?: () => number
}

function surfaceLabel(kind: Md3LockSurfaceKind): string {
  return t(SurfaceLabelKeys[kind])
}

function factorLabel(lock: IMd3Lock): string {
  return lock.factor === 'otp'
    ? t('md3.locks.factor.otp')
    : t('md3.locks.factor.password')
}

/** The row's state line: locked, or open and until when. */
export function describeLockState(
  lock: IMd3Lock,
  unlock: IMd3ActiveUnlock | undefined,
  now: number
): string {
  if (!isMd3UnlockActive(unlock, now) || unlock === undefined) {
    return t('md3.locks.row.locked')
  }
  if (unlock.kind === 'session') {
    return t('md3.locks.row.unlockedSession')
  }
  if (unlock.kind === 'surface') {
    return t('md3.locks.row.unlockedSurface')
  }
  return t('md3.locks.row.unlockedUntil', {
    time: new Date(unlock.expiresAt ?? now).toLocaleTimeString(),
  })
}

interface IMd3LockRowProps {
  readonly lock: IMd3Lock
  readonly index: number
  readonly unlock: IMd3ActiveUnlock | undefined
  readonly now: number
  readonly selected: boolean
  readonly focused: boolean
  readonly onToggleSelected: (index: number, shiftKey: boolean) => void
  readonly onEditLock: (lock: IMd3Lock, anchor: IMd3LockAnchorRect) => void
  readonly onRemoveLock: (lock: IMd3Lock) => void
  readonly onLockAgain: (lock: IMd3Lock) => void
  readonly onKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void
}

/**
 * One lock, as a grid row.
 *
 * The row is the tab stop and its cells are reached with the arrow keys, which
 * is why every button inside carries `tabIndex={-1}`: leaving them in the tab
 * order would put four tab stops on every lock.
 */
function Md3LockRow(props: IMd3LockRowProps) {
  const {
    lock,
    index,
    unlock,
    now,
    selected,
    focused,
    onToggleSelected,
    onEditLock,
    onRemoveLock,
    onLockAgain,
    onKeyDown,
  } = props

  const open = isMd3UnlockActive(unlock, now)

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => onKeyDown(index, event),
    [onKeyDown, index]
  )

  // Driven from the click rather than the change event, so a shift-click can
  // extend the range; `onChange` carries no modifier keys.
  const handleSelectClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation()
      onToggleSelected(index, event.shiftKey)
    },
    [onToggleSelected, index]
  )

  const handleSelectChange = React.useCallback(() => {
    // Handled by the click above; React still wants a change handler on a
    // controlled checkbox.
  }, [])

  const handleEdit = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onEditLock(lock, rectOf(event.currentTarget))
    },
    [onEditLock, lock]
  )

  const handleRemove = React.useCallback(() => {
    onRemoveLock(lock)
  }, [onRemoveLock, lock])

  const handleLockAgain = React.useCallback(() => {
    onLockAgain(lock)
  }, [onLockAgain, lock])

  const handleUnlock = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // This manager button is the reliable route for a native-disabled target:
      // browsers do not promise to dispatch click/keyboard events from the
      // disabled control itself. The prompt still names the exact target lock.
      announceAppearanceLockBlocked(
        lock.target.id,
        event.currentTarget,
        lock.target.kind
      )
    },
    [lock]
  )

  return (
    // A grid row is the focusable unit of this list: it carries the roving
    // tabindex, answers Space and Enter, and is reached by the arrow keys.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      className={classNames('md3-locks__row', {
        'md3-locks__row--selected': selected,
        'md3-locks__row--open': open,
      })}
      onKeyDown={handleKeyDown}
    >
      <span role="gridcell" className="md3-locks__row-select">
        <input
          type="checkbox"
          tabIndex={-1}
          checked={selected}
          aria-label={t('md3.locks.row.select', { label: lock.target.label })}
          onClick={handleSelectClick}
          onChange={handleSelectChange}
        />
      </span>
      <span role="gridcell" className="md3-locks__row-body">
        <MaterialSymbol
          name={open ? 'key' : SurfaceIcons[lock.target.kind]}
          className="md3-locks__row-icon"
          size={RowIconGlyphSize}
        />
        <span className="md3-locks__row-text">
          <span className="md3-locks__row-label">{lock.target.label}</span>
          <span className="md3-locks__row-meta">
            {`${surfaceLabel(lock.target.kind)} · ${factorLabel(lock)} · ${t(
              'md3.locks.row.created',
              { date: new Date(lock.createdAt).toLocaleDateString() }
            )}`}
          </span>
          <span className="md3-locks__row-state">
            {describeLockState(lock, unlock, now)}
            {lock.lockOnLaunch ? ` · ${t('md3.locks.row.lockOnLaunch')}` : ''}
          </span>
        </span>
      </span>
      <span role="gridcell" className="md3-locks__row-actions">
        {!open ? (
          <Md3IconButton
            small={true}
            icon="key"
            iconSize={RowButtonGlyphSize}
            label={t('md3.locks.row.unlock', { label: lock.target.label })}
            tabIndex={focused ? 0 : -1}
            onClick={handleUnlock}
          />
        ) : null}
        {open ? (
          <Md3IconButton
            small={true}
            icon="lock"
            iconSize={RowButtonGlyphSize}
            label={t('md3.locks.row.lockAgain', { label: lock.target.label })}
            tabIndex={-1}
            onClick={handleLockAgain}
          />
        ) : null}
        <Md3IconButton
          small={true}
          icon="edit"
          iconSize={RowButtonGlyphSize}
          label={t('md3.locks.row.edit', { label: lock.target.label })}
          hasPopup="dialog"
          tabIndex={-1}
          onClick={handleEdit}
        />
        <Md3IconButton
          small={true}
          icon="delete"
          iconSize={RowButtonGlyphSize}
          label={t('md3.locks.row.remove', { label: lock.target.label })}
          tabIndex={-1}
          onClick={handleRemove}
        />
      </span>
    </div>
  )
}

export function Md3LocksView(props: IMd3LocksViewProps) {
  const {
    locks,
    activeUnlocks,
    applicationDataFolder,
    onEditLock,
    onRemoveLocks,
    onLockAgain,
    onExport,
    now,
  } = props

  const readNow = React.useMemo(() => now ?? (() => Date.now()), [now])
  const languageMode = getPersistedLanguageMode()
  const funnyLevels = readFunnyLevels()

  const [query, setQuery] = React.useState('')
  const [regexEnabled, setRegexEnabled] = React.useState(false)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [builderOpen, setBuilderOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [focusIndex, setFocusIndex] = React.useState(0)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [gateOpen, setGateOpen] = React.useState(false)

  const anchorIndex = React.useRef<number | null>(null)
  const exportButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const removeButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const unlockById = React.useMemo(() => {
    const map = new Map<string, IMd3ActiveUnlock>()
    for (const unlock of activeUnlocks) {
      map.set(unlock.lockId, unlock)
    }
    return map
  }, [activeUnlocks])

  const { locks: visible, regexError } = React.useMemo(
    () => filterMd3Locks(locks, query, { regexEnabled, caseSensitive }),
    [locks, query, regexEnabled, caseSensitive]
  )

  const visibleIds = React.useMemo(
    () => visible.map(lock => lock.id),
    [visible]
  )

  /*
   * A lock that leaves the collection — removed here, or removed by another
   * surface — leaves the selection with it, or a bulk verb runs against an id
   * nothing holds and reports a count it did not achieve.
   *
   * Unlike the branch list this prunes against the whole collection rather
   * than the visible rows: this list deliberately offers a select-all that
   * reaches past the search, so a search narrowing the rows must not quietly
   * unselect what the user asked for on purpose.
   */
  React.useEffect(() => {
    setSelected(previous => {
      const next = new Set<string>()
      for (const lock of locks) {
        if (previous.has(lock.id)) {
          next.add(lock.id)
        }
      }
      return next.size === previous.size ? previous : next
    })
  }, [locks])

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
    () => visible.slice(0, MaxBuilderSamples).map(lock => lock.target.label),
    [visible]
  )

  const toggleSelected = React.useCallback(
    (index: number, shiftKey: boolean) => {
      setFocusIndex(index)
      const intent = md3SelectionIntent({
        shiftKey,
        // Ticking a box is always additive: the checkbox is the whole gesture,
        // so a plain click must never replace what is already ticked.
        ctrlKey: true,
        metaKey: false,
      })
      setSelected(current => {
        const result = md3ApplySelection(
          visibleIds,
          current,
          index,
          intent,
          anchorIndex.current,
          // A checkbox list extends over a range rather than replacing with
          // it; replacing here would silently drop everything ticked before.
          'extend'
        )
        if (intent !== 'range') {
          anchorIndex.current = result.anchor
        }
        return new Set(result.ids)
      })
    },
    [visibleIds]
  )

  const onToggleSelectAll = React.useCallback(() => {
    setSelected(current => new Set(md3ToggleSelectAll(visibleIds, current)))
    anchorIndex.current = null
  }, [visibleIds])

  const onSelectEverything = React.useCallback(() => {
    setSelected(new Set(locks.map(lock => lock.id)))
    notify(t('md3.locks.toast.selectedAll', { count: String(locks.length) }))
  }, [locks])

  const onInvertSelection = React.useCallback(() => {
    setSelected(current => new Set(md3InvertSelection(visibleIds, current)))
    anchorIndex.current = null
  }, [visibleIds])

  const onClearSelection = React.useCallback(() => {
    setSelected(new Set<string>())
    anchorIndex.current = null
  }, [])

  const onResetFilters = React.useCallback(() => {
    setQuery('')
    setRegexEnabled(false)
  }, [])

  /**
   * What a bulk verb runs over: the selected locks, or the whole searched set.
   *
   * `md3BulkScope` resolves a selection against the visible rows, which is
   * right for a list whose selection cannot outlive its filter. This one's
   * can — **Select all N locks, including the ones this search is hiding** is
   * a control the user pressed on purpose — so the selection is resolved
   * against the collection and only the fallback is the searched set.
   */
  const scopeLocks = React.useMemo(() => {
    const chosen = locks.filter(lock => selected.has(lock.id))
    return chosen.length > 0 ? chosen : visible
  }, [locks, visible, selected])

  const filtered = query.length > 0

  const scopeLabel = md3BulkScopeLabel(selected.size, visible.length, filtered)

  /*
   * Locking again only means anything for a lock that is open right now, so
   * the verb says how many it will skip rather than reporting a count it
   * never touched.
   */
  const relockable = React.useMemo(
    () =>
      md3PartitionBulk(
        scopeLocks,
        lock => isMd3UnlockActive(unlockById.get(lock.id), readNow()),
        t('md3.locks.bulkSkipAlreadyLocked')
      ),
    [scopeLocks, unlockById, readNow]
  )

  const onBulkLockAgain = React.useCallback(() => {
    for (const lock of relockable.applied) {
      onLockAgain(lock)
    }
    const skipped = md3BulkPartitionSummary(relockable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
  }, [onLockAgain, relockable])

  const runExport = React.useCallback(
    (format: Md3LockExportFormat) => {
      const result = serializeMd3LockExport(scopeLocks, format, {
        scope: scopeLabel,
      })
      setExportOpen(false)
      onExport(result)
      notify(
        t('md3.locks.toast.exported', {
          count: String(result.count),
          format: result.format.toUpperCase(),
        })
      )
    },
    [onExport, scopeLocks, scopeLabel]
  )

  /*
   * The picker is built here rather than with `md3BulkExportMenuSpec` because
   * the shared one offers every format the generic serializer can write, and
   * locks are not written by it: their own serializer states in the file, in
   * every format, that credentials were left out. It has no SQL writer, and a
   * row for a format nothing can produce is a control that cannot work.
   */
  const exportMenuSpec = React.useMemo((): IMd3MenuSpec => {
    return {
      kind: 'listMenu',
      title: t('md3.bulk.exportMenu.title', { scope: scopeLabel }),
      icon: 'cloud_download',
      width: 460,
      hasFilter: true,
      filterPlaceholder: t('md3.bulk.exportMenu.filterPlaceholder'),
      footer: md3ListExportSchema(Md3LockExportColumns),
      items: Md3LockExportFormats.map(descriptor => ({
        id: descriptor.format,
        label: descriptor.label,
        icon: 'description' as MaterialSymbolName,
        hint: `.${descriptor.extension}`,
        onClick: () => runExport(descriptor.format),
      })),
    }
  }, [scopeLabel, runExport])

  /*
   * The bar's export contract speaks the generic format list, which is one
   * format wider than anything that writes a lock. Narrowing here rather than
   * casting keeps the extra format from reaching a serializer that has no
   * writer for it — the picker above never offers it in the first place.
   */
  const onBarExport = React.useCallback(
    (format: Md3ListExportFormat) => {
      const supported = Md3LockExportFormats.find(
        descriptor => descriptor.format === format
      )
      if (supported !== undefined) {
        runExport(supported.format)
      }
    },
    [runExport]
  )

  const onOpenExport = React.useCallback(() => setExportOpen(true), [])
  const onCloseExport = React.useCallback(() => setExportOpen(false), [])

  const onOpenGate = React.useCallback(() => setGateOpen(true), [])
  const onCloseGate = React.useCallback(() => setGateOpen(false), [])

  const bulkActions = React.useMemo((): ReadonlyArray<IMd3BulkAction> => {
    return [
      {
        id: 'lockAgain',
        label: t('md3.locks.bulkLockAgain'),
        icon: 'lock',
        disabled: relockable.applied.length === 0,
        onClick: onBulkLockAgain,
      },
      {
        id: 'remove',
        label: t('md3.locks.bulkRemove'),
        icon: 'delete_sweep',
        destructive: true,
        // Removal forgets credentials nobody can recover, so it never runs
        // from the button: it opens the two-key gate.
        hasPopup: 'dialog',
        buttonRef: removeButtonRef,
        disabled: scopeLocks.length === 0,
        onClick: onOpenGate,
      },
    ]
  }, [relockable, onBulkLockAgain, scopeLocks, onOpenGate, removeButtonRef])

  const onConfirmRemoval = React.useCallback(() => {
    const ids = scopeLocks.map(lock => lock.id)
    onRemoveLocks(ids)
    setSelected(new Set<string>())
    setGateOpen(false)
    notify(t('md3.locks.toast.removed', { count: String(ids.length) }))
  }, [onRemoveLocks, scopeLocks])

  const removeOne = React.useCallback(
    (lock: IMd3Lock) => {
      onRemoveLocks([lock.id])
      notify(t('md3.locks.toast.removed', { count: '1' }))
    },
    [onRemoveLocks]
  )

  const onRowKeyDown = React.useCallback(
    (index: number, event: React.KeyboardEvent<HTMLDivElement>) => {
      const lock = visible[index]
      if (lock === undefined) {
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next =
          event.key === 'ArrowDown'
            ? Math.min(visible.length - 1, index + 1)
            : Math.max(0, index - 1)
        setFocusIndex(next)
        const target = visible[next]
        if (event.shiftKey && target !== undefined) {
          // Shift with the arrows is the keyboard equivalent of shift-click:
          // it extends the selection rather than merely moving focus.
          setSelected(current => new Set([...current, lock.id, target.id]))
        }
        return
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        toggleSelected(index, event.shiftKey)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onEditLock(lock, rectOf(event.currentTarget))
        return
      }
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault()
        announceAppearanceLockBlocked(
          lock.target.id,
          event.currentTarget,
          lock.target.kind
        )
      }
    },
    [onEditLock, toggleSelected, visible]
  )

  const currentTime = readNow()

  return (
    <section
      className="md3-locks md3-anim-up"
      aria-label={t('md3.locks.title')}
    >
      <header className="md3-locks__header">
        <h1 className="md3-locks__title">{t('md3.locks.title')}</h1>
        <p className="md3-locks__lead">
          {translateWithFunnyLevel(
            'md3.locks.managerLead',
            languageMode,
            funnyLevels
          )}
        </p>
        <p className="md3-locks__subtitle">{t('md3.locks.subtitle')}</p>
      </header>

      <Md3SearchField
        id="md3-locks-search"
        searchSurfaceId="md3-locks"
        value={query}
        placeholder={t('md3.locks.search.placeholder')}
        fieldLabel={t('md3.locks.search.fieldLabel')}
        regexEnabled={regexEnabled}
        matchCount={visible.length}
        error={regexError}
        onChange={onSearchChange}
        onClear={onSearchClear}
        onToggleRegex={onToggleRegex}
        onOpenBuilder={onOpenBuilder}
      />

      <Md3BulkBar
        listId="locks"
        label={t('md3.locks.bulkLabel')}
        visibleIds={visibleIds}
        selected={selected}
        filtered={filtered}
        scopeLabel={scopeLabel}
        actions={bulkActions}
        onToggleSelectAll={onToggleSelectAll}
        onInvertSelection={onInvertSelection}
        onClearSelection={onClearSelection}
        onExport={onBarExport}
        exportColumns={Md3LockExportColumns}
        onOpenExport={onOpenExport}
        exportDisabled={scopeLocks.length === 0}
        exportButtonRef={exportButtonRef}
      />

      {/*
        The bar's select-all deliberately stops at the search, as it does on
        every list. This list also holds locks the search is hiding, and a
        user who wants all of them should not have to clear the search to say
        so — so the escape hatch sits beside the bar, naming its own scope.
      */}
      <div
        className="md3-locks__selection"
        role="group"
        aria-label={t('md3.locks.title')}
      >
        <Md3GhostButton
          label={t('md3.locks.selection.selectAllEverything', {
            count: String(locks.length),
          })}
          disabled={locks.length === 0}
          onClick={onSelectEverything}
        />
      </div>

      {visible.length === 0 ? (
        <Md3EmptyState
          message={
            locks.length === 0
              ? t('md3.locks.empty.none')
              : t('md3.locks.empty.noMatch')
          }
          onAction={locks.length === 0 ? undefined : onResetFilters}
        />
      ) : (
        <div
          className="md3-locks__list"
          role="grid"
          aria-label={t('md3.locks.list.label')}
          aria-multiselectable={true}
          aria-rowcount={visible.length}
        >
          {visible.map((lock, index) => (
            <Md3LockRow
              key={lock.id}
              lock={lock}
              index={index}
              unlock={unlockById.get(lock.id)}
              now={currentTime}
              selected={selected.has(lock.id)}
              focused={index === focusIndex}
              onToggleSelected={toggleSelected}
              onEditLock={onEditLock}
              onRemoveLock={removeOne}
              onLockAgain={onLockAgain}
              onKeyDown={onRowKeyDown}
            />
          ))}
        </div>
      )}

      {/*
        The recovery route is repeated here as well as on the two lock controls:
        somebody who has come to the manager because they cannot get into a
        surface should not have to open the lock they cannot open to be told how
        to get out of it.
      */}
      <p className="md3-locks__recovery">
        {applicationDataFolder === null
          ? t('md3.locks.unlock.recoveryUnknown')
          : t('md3.locks.unlock.recovery', { folder: applicationDataFolder })}
      </p>

      {exportOpen ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={onCloseExport}
          returnFocusTo={exportButtonRef}
          instanceId="locks-export"
          anchor={exportButtonRef.current}
        />
      ) : null}

      {builderOpen ? (
        <Md3RegexBuilderDialog
          targetLabel={t('md3.locks.search.fieldLabel')}
          initialPattern={query}
          sampleItems={builderSamples}
          onApply={onApplyPattern}
          onDismissed={onCloseBuilder}
        />
      ) : null}

      {gateOpen ? (
        <Md3LockRemovalGate
          count={scopeLocks.length}
          scope={scopeLabel}
          onConfirm={onConfirmRemoval}
          onDismissed={onCloseGate}
        />
      ) : null}
    </section>
  )
}

/** The viewport rect of an element, for anchoring a dialog beside it. */
function rectOf(element: Element): IMd3LockAnchorRect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}
