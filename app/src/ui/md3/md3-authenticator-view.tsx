import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import { compileSafeRegex } from '../../lib/safe-regex'
import { buildOtpauthUri } from '../../lib/authenticator/otpauth-uri'
import {
  DefaultTotpAlgorithm,
  DefaultTotpDigits,
  DefaultTotpPeriod,
  ITotpClockAssessment,
  ITotpWindow,
  TotpAlgorithm,
  totpWindow,
} from '../../lib/authenticator/totp'
import { encodeBase32 } from '../../lib/authenticator/base32'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GhostButton,
  Md3GroupHeader,
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
import { Md3DestructiveGate } from './md3-destructive-gate'
import {
  IMd3AuthenticatorExport,
  IMd3AuthenticatorExportRecord,
  Md3AuthenticatorExportFormat,
  Md3AuthenticatorExportFormats,
  serializeMd3AuthenticatorExport,
  serializeMd3AuthenticatorSecrets,
} from './md3-authenticator-export'
import {
  IMd3RegistrationResult,
  Md3AuthenticatorRegistration,
} from './md3-authenticator-registration'
import { notify } from './md3-toast'

/**
 * The Authenticator destination: the app's own TOTP list.
 *
 * It is a real list, so it carries what this project asks of every list —
 * multi-select by click, shift-click and keyboard; a select-all that says out
 * loud whether it means the filtered set or everything; an inverse selection;
 * grouping; reordering; a search bar wired to the full regex builder; and bulk
 * grouping, deletion and export scoped to the selection or the filter.
 *
 * Two things here are unlike the rest of the app's lists.
 *
 * **The rows change on their own.** A code lasts one time step and then it is
 * a different code, so the view ticks once a second. The code region announces
 * only when the digits actually change — a live region carrying a countdown
 * would read a number at a screen-reader user every second and drown out
 * everything else on the surface. The countdown itself always has a text
 * equivalent in seconds, so it is never colour-only or motion-only.
 *
 * **Two of its actions are destructive in different ways.** Deleting factors
 * destroys secrets that nothing can bring back; exporting secrets in the clear
 * destroys their confidentiality just as permanently. Both go through the
 * shared destructive-action gate, separately, and the ordinary export shares no
 * code path with the secrets one — so no menu item, shortcut or bulk action can
 * reach the secrets file by accident.
 */

/** One registered factor, as the surface renders it. Carries no secret. */
export interface IMd3AuthenticatorFactor {
  readonly id: string
  readonly issuer: string
  readonly account: string
  readonly group: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  readonly period: number
  /** ISO-8601, recorded when the factor was registered. */
  readonly addedAt: string
}

/** An export the view has already serialized, ready for the host to write. */
export interface IMd3AuthenticatorExportRequest {
  readonly payload: IMd3AuthenticatorExport
  readonly factors: ReadonlyArray<IMd3AuthenticatorFactor>
}

export interface IMd3AuthenticatorViewProps {
  /** The factors, in the user's own order. */
  readonly factors: ReadonlyArray<IMd3AuthenticatorFactor>

  /**
   * The decoded secrets, keyed by factor id, read from the credential vault by
   * the host. A factor missing from this map renders as unable to produce a
   * code and says so — which is what a restored entry whose vault key is gone
   * actually is.
   */
  readonly secrets: ReadonlyMap<string, Uint8Array>

  /** Every group name, including empty ones, in the user's own order. */
  readonly groups: ReadonlyArray<string>

  /**
   * The verdict on this machine's clock, or `null` when nothing has been
   * compared against it. `null` reports "unverified" rather than "fine": a
   * check nobody ran is not a check that passed.
   */
  readonly clock?: ITotpClockAssessment | null

  readonly onRegister: (result: IMd3RegistrationResult) => void

  readonly onEdit: (id: string, result: IMd3RegistrationResult) => void

  /**
   * Delete factors and forget their secrets.
   *
   * A host backed by the credential vault may resolve with the ids whose key
   * it could not remove. Those are surfaced by name: a bulk delete that claims
   * a clean sweep while the secrets are still on the machine is the worst
   * outcome this surface has.
   */
  readonly onDelete: (
    ids: ReadonlyArray<string>
  ) => void | Promise<ReadonlyArray<string>>

  readonly onReorder: (id: string, toIndex: number) => void

  readonly onAssignGroup: (ids: ReadonlyArray<string>, group: string) => void

  /** Copy text to the clipboard. Omit and the copy actions are not rendered. */
  readonly onCopy?: (text: string) => void

  /** Write an export the view has already serialized. */
  readonly onExport?: (request: IMd3AuthenticatorExportRequest) => void

  /**
   * Write the secrets export. Omit and the secrets action is not rendered at
   * all — an action that looks like it writes a file and does nothing is worse
   * than no action, and doubly so for this one.
   */
  readonly onExportSecrets?: (request: IMd3AuthenticatorExportRequest) => void

  /** Overridable so a test can pin the instant codes are computed for. */
  readonly nowUnixSeconds?: () => number
}

type OpenMenu =
  | { readonly kind: 'row'; readonly id: string }
  | { readonly kind: 'list' }
  | { readonly kind: 'export'; readonly only: string | null }
  | { readonly kind: 'group'; readonly ids: ReadonlyArray<string> }
  | null

type OpenGate = 'delete' | 'secrets' | null

type OpenDialog =
  | { readonly kind: 'register' }
  | { readonly kind: 'edit'; readonly id: string }
  | null

/** Sample titles handed to the regex builder's live tester. */
const MaxBuilderSamples = 50

const RowGlyphSize = 17
const RowButtonGlyphSize = 15
const NoticeGlyphSize = 15

let viewSequence = 0

/** The entry's display name, never inventing an issuer it does not have. */
export function md3FactorTitle(factor: IMd3AuthenticatorFactor): string {
  return factor.issuer.trim().length === 0
    ? factor.account
    : `${factor.issuer} (${factor.account})`
}

/** What a search and the group chips are being asked to match against. */
export interface IMd3AuthenticatorFilter {
  readonly query: string
  readonly regexEnabled: boolean
  readonly caseSensitive: boolean
  /** Active group names. */
  readonly groups: ReadonlySet<string>
  /** Whether the "Ungrouped" chip is on. */
  readonly ungrouped: boolean
}

/**
 * Apply the search and the group chips.
 *
 * Exported as a pure function so the filtering can be asserted without a DOM:
 * an invalid pattern filters nothing rather than everything, and the chips and
 * the query compose instead of one overriding the other.
 */
export function filterMd3AuthenticatorFactors(
  factors: ReadonlyArray<IMd3AuthenticatorFactor>,
  filter: IMd3AuthenticatorFilter
): ReadonlyArray<IMd3AuthenticatorFactor> {
  const trimmed = filter.query.trim()
  let test: ((value: string) => boolean) | null = null

  if (trimmed.length > 0) {
    if (filter.regexEnabled) {
      const { regex } = compileSafeRegex(trimmed, filter.caseSensitive)
      test = regex === null ? null : (value: string) => regex.test(value)
    } else {
      const needle = filter.caseSensitive ? trimmed : trimmed.toLowerCase()
      test = (value: string) =>
        (filter.caseSensitive ? value : value.toLowerCase()).includes(needle)
    }
  }

  return factors.filter(factor => {
    if (filter.groups.size > 0 || filter.ungrouped) {
      const matchesChip =
        factor.group.length === 0
          ? filter.ungrouped
          : filter.groups.has(factor.group)
      if (!matchesChip) {
        return false
      }
    }
    if (test === null) {
      return true
    }
    return [
      factor.issuer,
      factor.account,
      factor.group,
      factor.algorithm,
      String(factor.digits),
      String(factor.period),
    ].some(test)
  })
}

/** Flatten a factor for export. Never carries a secret. */
export function md3AuthenticatorExportRecord(
  factor: IMd3AuthenticatorFactor
): IMd3AuthenticatorExportRecord {
  return {
    id: factor.id,
    issuer: factor.issuer,
    account: factor.account,
    group: factor.group,
    algorithm: factor.algorithm,
    digits: factor.digits,
    period: factor.period,
    addedAt: factor.addedAt,
    secret: 'omitted',
  }
}

interface IMd3AuthenticatorRowProps {
  readonly factor: IMd3AuthenticatorFactor
  readonly index: number
  readonly window: ITotpWindow | null
  readonly selected: boolean
  readonly focused: boolean
  readonly canCopy: boolean
  readonly onActivate: (
    factor: IMd3AuthenticatorFactor,
    index: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onToggleSelected: (
    factor: IMd3AuthenticatorFactor,
    index: number,
    extend: boolean
  ) => void
  readonly onCopyCode: (factor: IMd3AuthenticatorFactor) => void
  readonly onEdit: (factor: IMd3AuthenticatorFactor) => void
  readonly onDelete: (factor: IMd3AuthenticatorFactor) => void
  readonly onContextMenu: (
    factor: IMd3AuthenticatorFactor,
    index: number,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void
  readonly registerRow: (id: string, element: HTMLDivElement | null) => void
}

function Md3AuthenticatorRow(props: IMd3AuthenticatorRowProps) {
  const {
    factor,
    index,
    window: codeWindow,
    selected,
    focused,
    canCopy,
    onActivate,
    onToggleSelected,
    onCopyCode,
    onEdit,
    onDelete,
    onContextMenu,
    onKeyDown,
    registerRow,
  } = props

  const title = md3FactorTitle(factor)

  const rowRef = React.useCallback(
    (element: HTMLDivElement | null) => registerRow(factor.id, element),
    [registerRow, factor.id]
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) =>
      onActivate(factor, index, event),
    [onActivate, factor, index]
  )

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) =>
      onContextMenu(factor, index, event),
    [onContextMenu, factor, index]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => onKeyDown(index, event),
    [onKeyDown, index]
  )

  // Driven from the click rather than the change event so a shift-click can
  // extend the range; `onChange` carries no modifier keys.
  const handleSelectClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation()
      onToggleSelected(factor, index, event.shiftKey)
    },
    [onToggleSelected, factor, index]
  )

  const handleSelectChange = React.useCallback(() => {
    // Handled by the click above; React still wants a change handler here.
  }, [])

  const handleCopy = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onCopyCode(factor)
    },
    [onCopyCode, factor]
  )

  const handleEdit = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onEdit(factor)
    },
    [onEdit, factor]
  )

  const handleDelete = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onDelete(factor)
    },
    [onDelete, factor]
  )

  // Selecting the digits is what somebody does when they are about to copy
  // them by hand, so a click inside the box selects the whole code rather than
  // activating the row behind it.
  const handleCodeClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation()
      event.currentTarget.select()
    },
    []
  )

  const handleCodeChange = React.useCallback(() => {
    // The box is read-only; React still wants a handler on a controlled input.
  }, [])

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       a grid row is the focusable unit of this list: it carries roving
       tabindex, answers Enter and Space, and is reached by the arrow keys. */
    <div
      ref={rowRef}
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      className={classNames('md3-row', 'md3-auth__row', {
        'md3-auth__row--selected': selected,
        'md3-auth__row--broken': codeWindow === null,
      })}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      <span role="gridcell" className="md3-auth__cell md3-auth__cell--select">
        <input
          type="checkbox"
          className="md3-auth__checkbox"
          tabIndex={-1}
          checked={selected}
          aria-label={t('md3.auth.row.select', { title })}
          onClick={handleSelectClick}
          onChange={handleSelectChange}
        />
      </span>

      <span role="gridcell" className="md3-auth__cell md3-auth__cell--icon">
        <MaterialSymbol
          name={codeWindow === null ? 'warning' : 'key'}
          className="md3-auth__icon"
          size={RowGlyphSize}
        />
      </span>

      <span role="gridcell" className="md3-auth__cell md3-auth__text">
        <span className="md3-auth__title">{title}</span>
        {factor.group.length === 0 ? null : (
          <span className="md3-auth__badge">{factor.group}</span>
        )}
        <span className="md3-row__detail">
          {t('md3.auth.row.parameters', {
            algorithm: factor.algorithm,
            digits: String(factor.digits),
            period: String(factor.period),
          })}
        </span>
        <span className="sr-only">
          {t('md3.auth.row.added', { timestamp: factor.addedAt })}
        </span>
      </span>

      <span role="gridcell" className="md3-auth__cell md3-auth__cell--code">
        {codeWindow === null ? (
          <span className="md3-auth__missing">
            {t('md3.auth.row.missingSecret')}
          </span>
        ) : (
          <>
            {/*
              A read-only text box rather than a span: the digits are meant to
              be selected and copied by hand as often as they are copied by the
              button, and a plain span makes that a drag-select gamble.
            */}
            <input
              type="text"
              readOnly={true}
              className="md3-auth__code"
              value={codeWindow.code}
              aria-label={t('md3.auth.row.code', { title })}
              tabIndex={-1}
              onClick={handleCodeClick}
              onChange={handleCodeChange}
            />
            <span className="md3-auth__next">
              {t('md3.auth.row.nextCode', { code: codeWindow.nextCode })}
            </span>
            {/*
              The live region carries the code and nothing else, so it speaks
              once per time step. A countdown in here would speak every second.
            */}
            <span className="sr-only" aria-live="polite">
              {t('md3.auth.row.codeChanged', {
                title,
                code: codeWindow.code,
              })}
            </span>
          </>
        )}
      </span>

      <span role="gridcell" className="md3-auth__cell md3-auth__cell--timer">
        {codeWindow === null ? null : (
          <>
            <span className="md3-auth__countdown" aria-hidden={true}>
              {t('md3.auth.row.countdown', {
                seconds: String(codeWindow.secondsRemaining),
              })}
            </span>
            <span className="sr-only">
              {t('md3.auth.row.countdownText', {
                seconds: String(codeWindow.secondsRemaining),
              })}
            </span>
          </>
        )}
      </span>

      <span role="gridcell" className="md3-auth__cell">
        {canCopy && codeWindow !== null ? (
          <Md3IconButton
            small={true}
            icon="content_copy"
            iconSize={RowButtonGlyphSize}
            label={t('md3.auth.row.copyCode', { title })}
            onClick={handleCopy}
            onContextMenu={handleContextMenu}
          />
        ) : null}
      </span>

      <span role="gridcell" className="md3-auth__cell">
        <Md3IconButton
          small={true}
          icon="edit"
          iconSize={RowButtonGlyphSize}
          label={t('md3.auth.row.edit', { title })}
          hasPopup="dialog"
          onClick={handleEdit}
          onContextMenu={handleContextMenu}
        />
      </span>

      <span role="gridcell" className="md3-auth__cell">
        <Md3IconButton
          small={true}
          icon="delete"
          iconSize={RowButtonGlyphSize}
          label={t('md3.auth.row.delete', { title })}
          hasPopup="dialog"
          onClick={handleDelete}
          onContextMenu={handleContextMenu}
        />
      </span>
    </div>
  )
}

export function Md3AuthenticatorView(props: IMd3AuthenticatorViewProps) {
  const {
    factors,
    secrets,
    groups,
    clock,
    onRegister,
    onEdit,
    onDelete,
    onReorder,
    onAssignGroup,
    onCopy,
    onExport,
    onExportSecrets,
    nowUnixSeconds,
  } = props

  const voice = React.useMemo<{
    readonly languageMode: LanguageMode
    readonly funnyLevels: IFunnyLevels
  }>(
    () => ({
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
    }),
    []
  )

  const [query, setQuery] = React.useState('')
  const [regexEnabled, setRegexEnabled] = React.useState(false)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [builderOpen, setBuilderOpen] = React.useState(false)
  /**
   * The active group chips.
   *
   * "Ungrouped" is tracked separately rather than as a reserved string in this
   * set. A sentinel would have to be a value no real group name can take, and
   * group names are arbitrary user text — so the sentinel is either guessable
   * and collidable, or an invisible character nobody can read in a diff.
   */
  const [chips, setChips] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [ungroupedChip, setUngroupedChip] = React.useState(false)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [focusIndex, setFocusIndex] = React.useState(0)
  const [menu, setMenu] = React.useState<OpenMenu>(null)
  const [gate, setGate] = React.useState<OpenGate>(null)
  const [dialog, setDialog] = React.useState<OpenDialog>(null)
  const [explained, setExplained] = React.useState(false)

  const rowElements = React.useRef(new Map<string, HTMLDivElement>())
  const anchorIndex = React.useRef<number | null>(null)
  const pendingFocus = React.useRef(false)
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)
  const listMenuButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const instanceId = React.useMemo(() => ++viewSequence, [])
  const explainId = `md3-authenticator-explain-${instanceId}`

  // The whole surface re-reads the clock once a second. Every code on screen
  // expires on its own period boundary, so a slower tick would leave a stale
  // code visible and a faster one would only burn frames.
  const readNow = nowUnixSeconds ?? (() => Date.now() / 1000)
  const [tick, setTick] = React.useState(() => Math.floor(readNow()))

  // The clock source lives in a ref rather than in the effect's dependencies:
  // a caller that supplies none gets a fresh closure on every render, and
  // depending on that would tear the interval down and rebuild it every
  // second.
  const clockRef = React.useRef(readNow)
  clockRef.current = readNow

  React.useEffect(() => {
    const timer = setInterval(
      () => setTick(Math.floor(clockRef.current())),
      1000
    )
    return () => clearInterval(timer)
  }, [])

  const windows = React.useMemo(() => {
    const computed = new Map<string, ITotpWindow>()
    for (const factor of factors) {
      const secret = secrets.get(factor.id)
      if (secret === undefined || secret.length === 0) {
        continue
      }
      computed.set(
        factor.id,
        totpWindow(secret, tick, {
          algorithm: factor.algorithm,
          digits: factor.digits,
          period: factor.period,
        })
      )
    }
    return computed
  }, [factors, secrets, tick])

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

  // The search matches what the row shows: issuer, account, group and the
  // parameter line. A word a user can read in a row is a word they will type
  // into the field above it.
  /**
   * Whether the field currently holds a pattern that will not compile.
   *
   * The filter itself treats an invalid pattern as no filter at all, which
   * would silently show everything; this is what lets the surface say so.
   */
  const invalidPattern = React.useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0 || !regexEnabled) {
      return false
    }
    return compileSafeRegex(trimmed, caseSensitive).regex === null
  }, [query, regexEnabled, caseSensitive])

  const visible = React.useMemo(
    () =>
      filterMd3AuthenticatorFactors(factors, {
        query,
        regexEnabled,
        caseSensitive,
        groups: chips,
        ungrouped: ungroupedChip,
      }),
    [factors, query, regexEnabled, caseSensitive, chips, ungroupedChip]
  )

  const filtersActive =
    chips.size > 0 || ungroupedChip || query.trim().length > 0

  React.useEffect(() => {
    setSelected(current => {
      if (current.size === 0) {
        return current
      }
      const live = new Set(factors.map(factor => factor.id))
      const next = new Set([...current].filter(id => live.has(id)))
      return next.size === current.size ? current : next
    })
  }, [factors])

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
    () => visible.filter(factor => selected.has(factor.id)).length,
    [visible, selected]
  )

  React.useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate =
        selectedVisibleCount > 0 && selectedVisibleCount < visible.length
    }
  }, [selectedVisibleCount, visible.length])

  const selectedFactors = React.useMemo(
    () => factors.filter(factor => selected.has(factor.id)),
    [factors, selected]
  )

  /** What a bulk action runs on: the selection when there is one, else the filter. */
  const scopeFactors = selectedFactors.length > 0 ? selectedFactors : visible

  const scopeDescription =
    selectedFactors.length > 0
      ? t('md3.auth.scope.selection', {
          count: String(selectedFactors.length),
        })
      : filtersActive
      ? t('md3.auth.scope.filtered', { count: String(visible.length) })
      : t('md3.auth.scope.all', { count: String(visible.length) })

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
    () => visible.slice(0, MaxBuilderSamples).map(md3FactorTitle),
    [visible]
  )

  const onToggleUngrouped = React.useCallback(
    () => setUngroupedChip(current => !current),
    []
  )

  const toggleChip = React.useCallback((chip: string) => {
    setChips(current => {
      const next = new Set(current)
      if (next.has(chip)) {
        next.delete(chip)
      } else {
        next.add(chip)
      }
      return next
    })
  }, [])

  const onResetFilters = React.useCallback(() => {
    setChips(new Set<string>())
    setUngroupedChip(false)
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
    (factor: IMd3AuthenticatorFactor, index: number, extend: boolean) => {
      setFocusIndex(index)
      if (extend && anchorIndex.current !== null) {
        const from = Math.min(anchorIndex.current, index)
        const to = Math.max(anchorIndex.current, index)
        const range = visible.slice(from, to + 1).map(factor => factor.id)
        setSelected(current => new Set([...current, ...range]))
        return
      }
      anchorIndex.current = index
      setSelected(current => {
        const next = new Set(current)
        if (next.has(factor.id)) {
          next.delete(factor.id)
        } else {
          next.add(factor.id)
        }
        return next
      })
    },
    [visible]
  )

  const onSelectAllVisible = React.useCallback(() => {
    const ids = visible.map(factor => factor.id)
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
    setSelectionFrom(factors.map(factor => factor.id))
    notify(t('md3.auth.toast.selectedAll', { count: String(factors.length) }))
  }, [factors, setSelectionFrom])

  const onInvertSelection = React.useCallback(() => {
    setSelected(current => {
      const next = new Set<string>()
      for (const factor of visible) {
        if (!current.has(factor.id)) {
          next.add(factor.id)
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

  const copyCode = React.useCallback(
    (factor: IMd3AuthenticatorFactor) => {
      const computed = windows.get(factor.id)
      if (computed === undefined || onCopy === undefined) {
        return
      }
      onCopy(computed.code)
      notify(t('md3.auth.toast.copied', { title: md3FactorTitle(factor) }))
    },
    [windows, onCopy]
  )

  const copyNextCode = React.useCallback(
    (factor: IMd3AuthenticatorFactor) => {
      const computed = windows.get(factor.id)
      if (computed === undefined || onCopy === undefined) {
        return
      }
      onCopy(computed.nextCode)
      notify(t('md3.auth.toast.copied', { title: md3FactorTitle(factor) }))
    },
    [windows, onCopy]
  )

  /**
   * Report any ids the credential vault refused to clear.
   *
   * Silent on the ordinary path, so a host that returns nothing simply never
   * raises it.
   */
  const reportVaultFailures = React.useCallback(
    (outcome: void | Promise<ReadonlyArray<string>>) => {
      void Promise.resolve(outcome).then(failed => {
        if (failed !== undefined && failed.length > 0) {
          notify(
            t('md3.auth.toast.vaultFailed', { count: String(failed.length) }),
            { kind: 'error' }
          )
        }
      })
    },
    []
  )

  const deleteOne = React.useCallback(
    (factor: IMd3AuthenticatorFactor) => {
      reportVaultFailures(onDelete([factor.id]))
      setSelected(current => {
        if (!current.has(factor.id)) {
          return current
        }
        const next = new Set(current)
        next.delete(factor.id)
        return next
      })
      notify(t('md3.auth.toast.deleted', { title: md3FactorTitle(factor) }))
    },
    [onDelete, reportVaultFailures]
  )

  const onRequestBulkDelete = React.useCallback(() => {
    if (scopeFactors.length === 0) {
      return
    }
    setMenu(null)
    setGate('delete')
  }, [scopeFactors.length])

  const onConfirmBulkDelete = React.useCallback(() => {
    const ids = scopeFactors.map(factor => factor.id)
    setGate(null)
    if (ids.length === 0) {
      return
    }
    reportVaultFailures(onDelete(ids))
    setSelected(new Set<string>())
    notify(t('md3.auth.toast.deletedMany', { count: String(ids.length) }))
  }, [scopeFactors, onDelete, reportVaultFailures])

  const assignGroup = React.useCallback(
    (ids: ReadonlyArray<string>, group: string) => {
      onAssignGroup(ids, group)
      setMenu(null)
      notify(
        group.length === 0
          ? t('md3.auth.toast.ungrouped', { count: String(ids.length) })
          : t('md3.auth.toast.grouped', {
              count: String(ids.length),
              group,
            })
      )
    },
    [onAssignGroup]
  )

  const moveBy = React.useCallback(
    (factor: IMd3AuthenticatorFactor, delta: number) => {
      const from = factors.findIndex(candidate => candidate.id === factor.id)
      if (from === -1) {
        return
      }
      const to = Math.max(0, Math.min(from + delta, factors.length - 1))
      if (to === from) {
        return
      }
      onReorder(factor.id, to)
      notify(t('md3.auth.toast.moved', { title: md3FactorTitle(factor) }))
    },
    [factors, onReorder]
  )

  const runExport = React.useCallback(
    (format: Md3AuthenticatorExportFormat, only: string | null) => {
      const rows =
        only === null
          ? scopeFactors
          : factors.filter(factor => factor.id === only)
      const scope = only === null ? scopeDescription : t('md3.auth.scope.one')
      const payload = serializeMd3AuthenticatorExport(
        rows.map(md3AuthenticatorExportRecord),
        format,
        { scope, omissionNotice: t('md3.auth.export.omissionNotice') }
      )
      setMenu(null)
      onExport?.({ payload, factors: rows })
      notify(
        t('md3.auth.toast.exported', {
          count: String(rows.length),
          format: payload.format.toUpperCase(),
        })
      )
    },
    [scopeFactors, scopeDescription, factors, onExport]
  )

  const onRequestSecretsExport = React.useCallback(() => {
    if (scopeFactors.length === 0 || onExportSecrets === undefined) {
      return
    }
    setMenu(null)
    setGate('secrets')
  }, [scopeFactors.length, onExportSecrets])

  const onConfirmSecretsExport = React.useCallback(() => {
    setGate(null)
    if (onExportSecrets === undefined) {
      return
    }
    const exported = scopeFactors.filter(factor => secrets.has(factor.id))
    const uris = exported.map(factor =>
      buildOtpauthUri({
        account: factor.account,
        issuer: factor.issuer,
        // `secrets` holds decoded bytes; the URI wants base32 again.
        secret: encodeBase32(secrets.get(factor.id) ?? new Uint8Array()),
        algorithm: factor.algorithm,
        digits: factor.digits,
        period: factor.period,
      })
    )
    const payload = serializeMd3AuthenticatorSecrets(uris, {
      scope: scopeDescription,
      warning: t('md3.auth.secrets.warning'),
    })
    onExportSecrets({ payload, factors: exported })
    notify(t('md3.auth.toast.secretsExported', { count: String(uris.length) }))
  }, [onExportSecrets, scopeFactors, secrets, scopeDescription])

  // ---------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------

  const onRowActivate = React.useCallback(
    (
      factor: IMd3AuthenticatorFactor,
      index: number,
      event: React.MouseEvent<HTMLDivElement>
    ) => {
      setFocusIndex(index)
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        onToggleSelected(factor, index, event.shiftKey)
        return
      }
      anchorIndex.current = index
      copyCode(factor)
    },
    [onToggleSelected, copyCode]
  )

  const onRowContextMenu = React.useCallback(
    (
      factor: IMd3AuthenticatorFactor,
      index: number,
      event: React.MouseEvent<HTMLElement>
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setFocusIndex(index)
      setMenu({ kind: 'row', id: factor.id })
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

  const onEditFactor = React.useCallback(
    (factor: IMd3AuthenticatorFactor) =>
      setDialog({ kind: 'edit', id: factor.id }),
    []
  )

  const onRowKeyDown = React.useCallback(
    (index: number, event: React.KeyboardEvent<HTMLDivElement>) => {
      const factor = visible[index]
      if (factor === undefined) {
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
          if (event.altKey) {
            moveBy(factor, 1)
            return
          }
          if (event.shiftKey) {
            addToSelection([factor.id, visible[next].id])
          }
          moveFocus(next)
          return
        }
        case 'ArrowUp': {
          event.preventDefault()
          const previous = Math.max(index - 1, 0)
          if (event.altKey) {
            moveBy(factor, -1)
            return
          }
          if (event.shiftKey) {
            addToSelection([factor.id, visible[previous].id])
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
            copyCode(factor)
          }
          return
        case ' ':
        case 'Spacebar':
          if (event.target === row) {
            event.preventDefault()
            onToggleSelected(factor, index, event.shiftKey)
          }
          return
        case 'Delete':
        case 'Backspace':
          if (event.target === row) {
            event.preventDefault()
            deleteOne(factor)
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
            setSelectionFrom(visible.map(candidate => candidate.id))
          }
          return
        case 'ContextMenu':
          event.preventDefault()
          setMenu({ kind: 'row', id: factor.id })
          return
        default:
          return
      }
    },
    [
      visible,
      moveFocus,
      moveBy,
      copyCode,
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

  const menuFactor =
    menu !== null && menu.kind === 'row'
      ? factors.find(factor => factor.id === menu.id) ?? null
      : null

  const rowMenuSpec = React.useMemo((): IMd3MenuSpec | null => {
    const factor = menuFactor
    if (factor === null) {
      return null
    }
    const items: Array<IMd3MenuItem> = []

    if (onCopy !== undefined && windows.has(factor.id)) {
      items.push(
        {
          id: 'copyCode',
          label: t('md3.auth.rowMenu.copyCode'),
          icon: 'content_copy',
          hint: '⏎',
          onClick: () => {
            copyCode(factor)
            closeMenu()
          },
        },
        {
          id: 'copyNext',
          label: t('md3.auth.rowMenu.copyNext'),
          icon: 'schedule',
          hint: '',
          onClick: () => {
            copyNextCode(factor)
            closeMenu()
          },
        }
      )
    }

    items.push(
      {
        id: 'edit',
        label: t('md3.auth.rowMenu.edit'),
        icon: 'edit',
        hint: '',
        onClick: () => {
          setDialog({ kind: 'edit', id: factor.id })
          closeMenu()
        },
      },
      {
        id: 'group',
        label: t('md3.auth.rowMenu.group'),
        icon: 'label',
        hint: '',
        onClick: () => openGroupPicker([factor.id]),
      },
      {
        id: 'moveUp',
        label: t('md3.auth.rowMenu.moveUp'),
        icon: 'arrow_upward',
        hint: '⌥↑',
        onClick: () => {
          moveBy(factor, -1)
          closeMenu()
        },
      },
      {
        id: 'moveDown',
        label: t('md3.auth.rowMenu.moveDown'),
        icon: 'arrow_downward',
        hint: '⌥↓',
        onClick: () => {
          moveBy(factor, 1)
          closeMenu()
        },
      },
      {
        id: 'select',
        label: selected.has(factor.id)
          ? t('md3.auth.rowMenu.deselect')
          : t('md3.auth.rowMenu.select'),
        icon: 'library_add_check',
        hint: '⇧click',
        onClick: () => {
          setSelected(current => {
            const next = new Set(current)
            if (next.has(factor.id)) {
              next.delete(factor.id)
            } else {
              next.add(factor.id)
            }
            return next
          })
          closeMenu()
        },
      }
    )

    if (onExport !== undefined) {
      items.push({
        id: 'exportOne',
        label: t('md3.auth.rowMenu.exportOne'),
        icon: 'cloud_download',
        hint: '',
        onClick: () => setMenu({ kind: 'export', only: factor.id }),
      })
    }

    items.push({
      id: 'delete',
      label: t('md3.auth.rowMenu.delete'),
      icon: 'delete',
      hint: '⌫',
      onClick: () => {
        deleteOne(factor)
        closeMenu()
      },
    })

    return {
      kind: 'rowMenu',
      title: t('md3.auth.rowMenu.title'),
      icon: 'key',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.menu.filterPlaceholder'),
      items,
    }
  }, [
    menuFactor,
    onCopy,
    windows,
    copyCode,
    copyNextCode,
    moveBy,
    selected,
    onExport,
    deleteOne,
    closeMenu,
  ])

  const listMenuSpec = React.useMemo((): IMd3MenuSpec => {
    const items: Array<IMd3MenuItem> = [
      {
        id: 'selectFiltered',
        label: t('md3.auth.listMenu.selectFiltered', {
          count: String(visible.length),
        }),
        icon: 'library_add_check',
        hint: '',
        onClick: () => {
          setSelectionFrom(visible.map(factor => factor.id))
          closeMenu()
        },
      },
      {
        id: 'selectEverything',
        label: t('md3.auth.listMenu.selectEverything', {
          count: String(factors.length),
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
        label: t('md3.auth.listMenu.invert'),
        icon: 'swap_horiz',
        hint: '',
        onClick: () => {
          onInvertSelection()
          closeMenu()
        },
      },
      {
        id: 'clearSelection',
        label: t('md3.auth.listMenu.clearSelection'),
        icon: 'close',
        hint: 'Esc',
        onClick: () => {
          onClearSelection()
          closeMenu()
        },
      },
      {
        id: 'group',
        label: t('md3.auth.listMenu.group'),
        icon: 'label',
        hint: '',
        onClick: () => openGroupPicker(scopeFactors.map(factor => factor.id)),
      },
      {
        id: 'bulkDelete',
        label: t('md3.auth.listMenu.deleteScope', {
          count: String(scopeFactors.length),
        }),
        icon: 'delete_sweep',
        hint: '',
        onClick: onRequestBulkDelete,
      },
    ]

    if (onExport !== undefined) {
      items.push({
        id: 'export',
        label: t('md3.auth.listMenu.export', {
          count: String(scopeFactors.length),
        }),
        icon: 'cloud_download',
        hint: '',
        onClick: () => setMenu({ kind: 'export', only: null }),
      })
    }

    if (onExportSecrets !== undefined) {
      items.push({
        id: 'exportSecrets',
        label: t('md3.auth.listMenu.exportSecrets', {
          count: String(scopeFactors.length),
        }),
        icon: 'lock',
        hint: '',
        onClick: onRequestSecretsExport,
      })
    }

    return {
      kind: 'listMenu',
      title: t('md3.auth.listMenu.title'),
      icon: 'security',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.menu.filterPlaceholder'),
      items,
    }
  }, [
    visible,
    factors.length,
    scopeFactors,
    onExport,
    onExportSecrets,
    onSelectEverything,
    onInvertSelection,
    onClearSelection,
    onRequestBulkDelete,
    onRequestSecretsExport,
    setSelectionFrom,
    closeMenu,
  ])

  const exportOnly = menu !== null && menu.kind === 'export' ? menu.only : null

  const exportMenuSpec = React.useMemo(
    (): IMd3MenuSpec => ({
      kind: 'listMenu',
      title: t('md3.auth.exportMenu.title'),
      icon: 'cloud_download',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.auth.exportMenu.filterPlaceholder'),
      items: Md3AuthenticatorExportFormats.map(descriptor => ({
        id: descriptor.format,
        label: descriptor.label,
        icon: 'description' as MaterialSymbolName,
        hint: `.${descriptor.extension}`,
        onClick: () => runExport(descriptor.format, exportOnly),
      })),
    }),
    [runExport, exportOnly]
  )

  const groupTargets = menu !== null && menu.kind === 'group' ? menu.ids : []

  const groupMenuSpec = React.useMemo((): IMd3MenuSpec => {
    const items: Array<IMd3MenuItem> = [
      {
        id: 'ungrouped',
        label: t('md3.auth.groupMenu.ungrouped'),
        icon: 'close',
        hint: '',
        onClick: () => assignGroup(groupTargets, ''),
      },
      ...groups.map(group => ({
        id: `group-${group}`,
        label: group,
        icon: 'label' as MaterialSymbolName,
        hint: String(factors.filter(factor => factor.group === group).length),
        onClick: () => assignGroup(groupTargets, group),
      })),
    ]

    return {
      kind: 'listMenu',
      title: t('md3.auth.groupMenu.title'),
      icon: 'label',
      width: 420,
      hasFilter: true,
      filterPlaceholder: t('md3.auth.groupMenu.filterPlaceholder'),
      items,
    }
  }, [groups, groupTargets, factors, assignGroup])

  const onOpenListMenu = React.useCallback(() => setMenu({ kind: 'list' }), [])

  const onOpenRegistration = React.useCallback(
    () => setDialog({ kind: 'register' }),
    []
  )

  const onDismissDialog = React.useCallback(() => setDialog(null), [])

  const onDismissGate = React.useCallback(() => setGate(null), [])

  const onToggleExplained = React.useCallback(
    () => setExplained(current => !current),
    []
  )

  const onOpenBulkExport = React.useCallback(
    () => setMenu({ kind: 'export', only: null }),
    []
  )

  /**
   * Open the move-into-group picker for a set of factors.
   *
   * With no groups yet the picker can only offer "No group", so the honest
   * empty state is raised as a notification rather than left as a menu that
   * silently offers nothing — a picker that looks broken is worse than a
   * sentence saying where groups come from.
   */
  const openGroupPicker = React.useCallback(
    (ids: ReadonlyArray<string>) => {
      if (groups.length === 0) {
        notify(t('md3.auth.groupMenu.empty'))
      }
      setMenu({ kind: 'group', ids })
    },
    [groups.length]
  )

  const onOpenBulkGroup = React.useCallback(
    () => openGroupPicker(scopeFactors.map(factor => factor.id)),
    [openGroupPicker, scopeFactors]
  )

  /**
   * The regex builder reached from a menu's own filter row.
   *
   * `Md3MenuOverlay` owns its filter text and has no way to receive a pattern
   * back, so the builder it opens targets the factor search instead, seeded
   * with whatever the menu filter already holds.
   */
  const onOpenMenuBuilder = React.useCallback((pattern: string) => {
    setQuery(pattern)
    setMenu(null)
    setBuilderOpen(true)
  }, [])

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  const editSubjectId =
    dialog !== null && dialog.kind === 'edit' ? dialog.id : null
  const editSubject = React.useMemo(() => {
    if (editSubjectId === null) {
      return undefined
    }
    const factor = factors.find(candidate => candidate.id === editSubjectId)
    return factor === undefined
      ? undefined
      : {
          title: md3FactorTitle(factor),
          issuer: factor.issuer,
          account: factor.account,
          group: factor.group,
          algorithm: factor.algorithm,
          digits: factor.digits,
          period: factor.period,
        }
  }, [editSubjectId, factors])

  const onCommitRegistration = React.useCallback(
    (result: IMd3RegistrationResult) => {
      const title =
        result.issuer.trim().length === 0
          ? result.account
          : `${result.issuer} (${result.account})`
      if (editSubjectId !== null) {
        onEdit(editSubjectId, result)
        notify(t('md3.auth.toast.edited', { title }))
      } else {
        onRegister(result)
        notify(t('md3.auth.toast.registered', { title }))
      }
      setDialog(null)
    },
    [editSubjectId, onEdit, onRegister]
  )

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const allVisibleSelected =
    visible.length > 0 && selectedVisibleCount === visible.length

  const clockNotice =
    clock === undefined || clock === null
      ? t('md3.auth.clock.unverified')
      : !clock.skewed
      ? t('md3.auth.clock.ok', {
          tolerance: String(clock.toleranceSeconds),
        })
      : clock.offsetSeconds > 0
      ? t('md3.auth.clock.ahead', {
          seconds: String(Math.abs(clock.offsetSeconds)),
          tolerance: String(clock.toleranceSeconds),
        })
      : t('md3.auth.clock.behind', {
          seconds: String(Math.abs(clock.offsetSeconds)),
          tolerance: String(clock.toleranceSeconds),
        })

  const clockSkewed = clock !== undefined && clock !== null && clock.skewed

  return (
    <div className="md3-auth md3-anim-up">
      <section className="md3-auth__pane" aria-label={t('md3.auth.pane')}>
        <Md3SearchField
          id="md3-authenticator-search"
          value={query}
          placeholder={t('md3.auth.searchPlaceholder')}
          fieldLabel={t('md3.auth.searchField')}
          regexEnabled={regexEnabled}
          matchCount={visible.length}
          onChange={onSearchChange}
          onClear={onSearchClear}
          onToggleRegex={onToggleRegex}
          onOpenBuilder={onOpenBuilder}
        />

        {invalidPattern ? (
          <p className="md3-auth__note" role="status">
            {t('md3.auth.invalidPattern')}
          </p>
        ) : null}

        <Md3ChipRow label={t('md3.auth.filters')}>
          <Md3Chip
            label={t('md3.auth.chipUngrouped')}
            active={ungroupedChip}
            onToggle={onToggleUngrouped}
          />
          {groups.map(group => (
            <Md3Chip
              key={group}
              label={group}
              active={chips.has(group)}
              onToggle={toggleChip}
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3TonalButton
            label={t('md3.auth.addFactor')}
            icon="add"
            hasPopup="dialog"
            onClick={onOpenRegistration}
          />
        </Md3ChipRow>

        <p
          className={classNames('md3-auth__clock', {
            'md3-auth__clock--skewed': clockSkewed,
          })}
          role="status"
        >
          <MaterialSymbol
            name={clockSkewed ? 'warning' : 'schedule'}
            size={NoticeGlyphSize}
          />
          <span>{clockNotice}</span>
        </p>

        <div className="md3-auth__explain">
          <button
            type="button"
            className="md3-auth__explain-toggle"
            aria-expanded={explained}
            aria-controls={explainId}
            onClick={onToggleExplained}
          >
            <MaterialSymbol name="help" size={NoticeGlyphSize} />
            <span>{t('md3.auth.explain.toggle')}</span>
          </button>
          <p id={explainId} hidden={!explained}>
            {t('md3.auth.explain.body')}
          </p>
          <p className="md3-auth__provenance">
            {t('md3.auth.explain.provenance', {
              algorithm: DefaultTotpAlgorithm,
              digits: String(DefaultTotpDigits),
              period: String(DefaultTotpPeriod),
            })}
          </p>
        </div>

        <div className="md3-auth__bulk">
          <label className="md3-auth__select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="md3-auth__checkbox"
              checked={allVisibleSelected}
              disabled={visible.length === 0}
              onChange={onSelectAllVisible}
            />
            <span>
              {filtersActive
                ? t('md3.auth.selectAllFiltered', {
                    count: String(visible.length),
                  })
                : t('md3.auth.selectAllEverything', {
                    count: String(visible.length),
                  })}
            </span>
          </label>

          <span className="md3-auth__selection-count" role="status">
            {t('md3.auth.selectionCount', { count: String(selected.size) })}
          </span>

          <Md3GhostButton
            label={t('md3.auth.invertSelection')}
            icon="swap_horiz"
            disabled={visible.length === 0}
            onClick={onInvertSelection}
          />
          <Md3GhostButton
            label={t('md3.auth.bulkGroup')}
            accessibleName={t('md3.auth.scopedAction', {
              label: t('md3.auth.bulkGroup'),
              scope: scopeDescription,
            })}
            icon="label"
            hasPopup="menu"
            disabled={scopeFactors.length === 0}
            onClick={onOpenBulkGroup}
          />
          <Md3GhostButton
            label={t('md3.auth.bulkDelete')}
            accessibleName={t('md3.auth.scopedAction', {
              label: t('md3.auth.bulkDelete'),
              scope: scopeDescription,
            })}
            icon="delete_sweep"
            className="md3-auth__danger"
            hasPopup="dialog"
            disabled={scopeFactors.length === 0}
            onClick={onRequestBulkDelete}
          />
          {onExport === undefined ? null : (
            <Md3GhostButton
              label={t('md3.auth.bulkExport')}
              accessibleName={t('md3.auth.scopedAction', {
                label: t('md3.auth.bulkExport'),
                scope: scopeDescription,
              })}
              icon="cloud_download"
              hasPopup="menu"
              disabled={scopeFactors.length === 0}
              onClick={onOpenBulkExport}
            />
          )}
          <Md3IconButton
            small={true}
            icon="more_vert"
            label={t('md3.auth.moreActions')}
            hasPopup="menu"
            expanded={menu !== null && menu.kind === 'list'}
            buttonRef={listMenuButtonRef}
            onClick={onOpenListMenu}
          />
        </div>

        {visible.length === 0 ? (
          <Md3EmptyState
            icon={filtersActive ? 'search_off' : 'key'}
            message={
              filtersActive
                ? t('md3.auth.empty.noMatch')
                : translateWithFunnyLevel(
                    'md3.auth.empty.none',
                    voice.languageMode,
                    voice.funnyLevels
                  )
            }
            onAction={filtersActive ? onResetFilters : undefined}
          />
        ) : (
          <div
            role="grid"
            aria-multiselectable={true}
            aria-label={t('md3.auth.list')}
            aria-rowcount={visible.length}
            className="md3-auth__list"
          >
            {visible.map((factor, index) => {
              const previous = visible[index - 1]
              const startsGroup =
                previous === undefined || previous.group !== factor.group
              return (
                <React.Fragment key={factor.id}>
                  {startsGroup && factor.group.length > 0 ? (
                    <Md3GroupHeader label={factor.group} />
                  ) : null}
                  <Md3AuthenticatorRow
                    factor={factor}
                    index={index}
                    window={windows.get(factor.id) ?? null}
                    selected={selected.has(factor.id)}
                    focused={index === focusIndex}
                    canCopy={onCopy !== undefined}
                    onActivate={onRowActivate}
                    onToggleSelected={onToggleSelected}
                    onCopyCode={copyCode}
                    onEdit={onEditFactor}
                    onDelete={deleteOne}
                    onContextMenu={onRowContextMenu}
                    onKeyDown={onRowKeyDown}
                    registerRow={registerRow}
                  />
                </React.Fragment>
              )
            })}
          </div>
        )}
      </section>

      {builderOpen ? (
        <Md3RegexBuilderDialog
          targetLabel={t('md3.auth.searchField')}
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

      {menu !== null && menu.kind === 'group' ? (
        <Md3MenuOverlay
          spec={groupMenuSpec}
          onDismiss={closeMenu}
          onOpenRegexBuilder={onOpenMenuBuilder}
        />
      ) : null}

      {gate === 'delete' ? (
        <Md3DestructiveGate
          actionId="authenticator-bulk-delete"
          title={t('md3.auth.gate.title', {
            count: String(scopeFactors.length),
          })}
          icon="delete_sweep"
          summary={t('md3.auth.gate.summary', {
            count: String(scopeFactors.length),
            scope: scopeDescription,
          })}
          irreversible={t('md3.auth.gate.irreversible')}
          targetKeyLabel={t('md3.auth.gate.keyTarget', {
            count: String(scopeFactors.length),
            scope: scopeDescription,
          })}
          effectKeyLabel={t('md3.auth.gate.keyEffect')}
          confirmLabel={t('md3.auth.gate.confirm', {
            count: String(scopeFactors.length),
          })}
          onConfirm={onConfirmBulkDelete}
          onDismissed={onDismissGate}
        />
      ) : null}

      {gate === 'secrets' ? (
        <Md3DestructiveGate
          actionId="authenticator-secrets-export"
          title={t('md3.auth.secretsGate.title', {
            count: String(scopeFactors.length),
          })}
          icon="lock"
          summary={t('md3.auth.secretsGate.summary', {
            count: String(scopeFactors.length),
            scope: scopeDescription,
          })}
          irreversible={t('md3.auth.secretsGate.irreversible')}
          targetKeyLabel={t('md3.auth.secretsGate.keyTarget', {
            count: String(scopeFactors.length),
            scope: scopeDescription,
          })}
          effectKeyLabel={t('md3.auth.secretsGate.keyEffect')}
          confirmLabel={t('md3.auth.secretsGate.confirm', {
            count: String(scopeFactors.length),
          })}
          onConfirm={onConfirmSecretsExport}
          onDismissed={onDismissGate}
        />
      ) : null}

      {dialog === null ? null : (
        <Md3AuthenticatorRegistration
          subject={editSubject}
          groups={groups}
          onCommit={onCommitRegistration}
          onDismissed={onDismissDialog}
          onCopy={onCopy}
          nowUnixSeconds={nowUnixSeconds}
        />
      )}
    </div>
  )
}
