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
} from '../../lib/md3-locks'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import {
  Md3EmptyState,
  Md3GhostButton,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { Md3LockRemovalGate } from './md3-lock-removal-gate'
import { IMd3LockAnchorRect } from './md3-lock-unlock-prompt'
import { notify } from './md3-toast'

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
  readonly onToggleSelected: (
    lock: IMd3Lock,
    index: number,
    extend: boolean
  ) => void
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
      onToggleSelected(lock, index, event.shiftKey)
    },
    [onToggleSelected, lock, index]
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
  const [format, setFormat] = React.useState<Md3LockExportFormat>('json')
  const [gateOpen, setGateOpen] = React.useState(false)

  const anchorIndex = React.useRef<number | null>(null)
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)

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

  const selectedVisible = React.useMemo(
    () => visible.filter(lock => selected.has(lock.id)),
    [visible, selected]
  )

  // A tri-state select-all is the only honest one here: some of the searched
  // set selected is neither "all" nor "none".
  React.useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate =
        selectedVisible.length > 0 && selectedVisible.length < visible.length
    }
  }, [selectedVisible.length, visible.length])

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
    (lock: IMd3Lock, index: number, extend: boolean) => {
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
        if (next.has(lock.id)) {
          next.delete(lock.id)
        } else {
          next.add(lock.id)
        }
        return next
      })
    },
    [visible]
  )

  const onSelectAllVisible = React.useCallback(() => {
    const ids = visible.map(lock => lock.id)
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
    setSelected(new Set(locks.map(lock => lock.id)))
    notify(t('md3.locks.toast.selectedAll', { count: String(locks.length) }))
  }, [locks])

  const onInvertSelection = React.useCallback(() => {
    setSelected(current => {
      const next = new Set<string>()
      for (const lock of visible) {
        if (!current.has(lock.id)) {
          next.add(lock.id)
        }
      }
      return next
    })
  }, [visible])

  const onClearSelection = React.useCallback(() => {
    setSelected(new Set<string>())
    anchorIndex.current = null
  }, [])

  const onResetFilters = React.useCallback(() => {
    setQuery('')
    setRegexEnabled(false)
  }, [])

  const selectedLocks = React.useMemo(
    () => locks.filter(lock => selected.has(lock.id)),
    [locks, selected]
  )

  const exportScope = t('md3.locks.bulk.export', {
    count: String(
      selectedLocks.length > 0 ? selectedLocks.length : visible.length
    ),
  })

  const onExportSelection = React.useCallback(() => {
    const subject = selectedLocks.length > 0 ? selectedLocks : visible
    const result = serializeMd3LockExport(subject, format, {
      scope: exportScope,
    })
    onExport(result)
    notify(
      t('md3.locks.toast.exported', {
        count: String(result.count),
        format: result.format.toUpperCase(),
      })
    )
  }, [exportScope, format, onExport, selectedLocks, visible])

  const onFormatChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const chosen = Md3LockExportFormats.find(
        descriptor => descriptor.format === event.currentTarget.value
      )
      if (chosen !== undefined) {
        setFormat(chosen.format)
      }
    },
    []
  )

  const onOpenGate = React.useCallback(() => setGateOpen(true), [])
  const onCloseGate = React.useCallback(() => setGateOpen(false), [])

  const onConfirmRemoval = React.useCallback(() => {
    const ids = (selectedLocks.length > 0 ? selectedLocks : visible).map(
      lock => lock.id
    )
    onRemoveLocks(ids)
    setSelected(new Set<string>())
    setGateOpen(false)
    notify(t('md3.locks.toast.removed', { count: String(ids.length) }))
  }, [onRemoveLocks, selectedLocks, visible])

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
        toggleSelected(lock, index, event.shiftKey)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onEditLock(lock, rectOf(event.currentTarget))
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
        value={query}
        placeholder={t('md3.locks.search.placeholder')}
        fieldLabel={t('md3.locks.search.fieldLabel')}
        regexEnabled={regexEnabled}
        matchCount={visible.length}
        onChange={onSearchChange}
        onClear={onSearchClear}
        onToggleRegex={onToggleRegex}
        onOpenBuilder={onOpenBuilder}
      />

      {regexError === null ? null : (
        <p className="md3-locks__regex-error" role="alert">
          {regexError}
        </p>
      )}

      <div
        className="md3-locks__selection"
        role="group"
        aria-label={t('md3.locks.title')}
      >
        <label className="md3-locks__select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={
              visible.length > 0 && selectedVisible.length === visible.length
            }
            onChange={onSelectAllVisible}
          />
          <span>
            {t('md3.locks.selection.selectAllFiltered', {
              count: String(visible.length),
            })}
          </span>
        </label>
        <Md3GhostButton
          label={t('md3.locks.selection.selectAllEverything', {
            count: String(locks.length),
          })}
          onClick={onSelectEverything}
        />
        <Md3GhostButton
          label={t('md3.locks.selection.invert')}
          onClick={onInvertSelection}
        />
        <Md3GhostButton
          label={t('md3.locks.selection.clear')}
          disabled={selected.size === 0}
          onClick={onClearSelection}
        />
        <span className="md3-locks__selection-count" role="status">
          {t('md3.locks.selection.count', {
            selected: String(selected.size),
            total: String(locks.length),
          })}
        </span>
      </div>

      <div className="md3-locks__bulk">
        <fieldset className="md3-locks__formats">
          <legend>{t('md3.locks.bulk.exportFormat')}</legend>
          {Md3LockExportFormats.map(descriptor => (
            <label className="md3-locks__format" key={descriptor.format}>
              <input
                type="radio"
                name="md3-locks-export-format"
                value={descriptor.format}
                checked={format === descriptor.format}
                onChange={onFormatChanged}
              />
              <span>{descriptor.label}</span>
            </label>
          ))}
        </fieldset>
        <Md3TonalButton
          label={t('md3.locks.bulk.export', {
            count: String(
              selectedLocks.length > 0 ? selectedLocks.length : visible.length
            ),
          })}
          icon="cloud_download"
          disabled={visible.length === 0 && selectedLocks.length === 0}
          onClick={onExportSelection}
        />
        <Md3TonalButton
          label={t('md3.locks.bulk.remove', {
            count: String(
              selectedLocks.length > 0 ? selectedLocks.length : visible.length
            ),
          })}
          icon="delete_sweep"
          disabled={visible.length === 0 && selectedLocks.length === 0}
          onClick={onOpenGate}
          className="md3-locks__bulk-remove"
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
          count={
            selectedLocks.length > 0 ? selectedLocks.length : visible.length
          }
          scope={
            selectedLocks.length > 0
              ? t('md3.locks.selection.count', {
                  selected: String(selectedLocks.length),
                  total: String(locks.length),
                })
              : t('md3.locks.selection.selectAllFiltered', {
                  count: String(visible.length),
                })
          }
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
