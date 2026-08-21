import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef, ObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'

/**
 * The repeated controls of the MD3 shell design contract
 * (`design/History MD3.dc.html`).
 *
 * Every measurement lives in `app/styles/ui/_md3-shell.scss`; these components
 * exist so the markup, the ARIA state and the glyph sizes are written once
 * rather than once per view. The contract's inline `style` strings are not
 * reproduced here — a value that appears in two views must resolve to the same
 * pixel in both, and a class is the only way to guarantee that.
 *
 * The contract's hover hints arrive as `title` attributes. This repository
 * forbids `title` on anything but an `<iframe>` (a `title` is unreachable by
 * keyboard and unreliable in assistive technology), so the same copy is shown
 * through the app's own `Tooltip`, which is the sanctioned equivalent.
 */

/** The glyph size inside a 32px icon button, per the contract's markup. */
const IconButtonGlyphSize = 16

/** The glyph size inside a 26px or 30px icon button. */
const SmallIconButtonGlyphSize = 15

/** The glyph size inside a tonal or ghost button. */
const TextButtonGlyphSize = 15

/** The leading `check` glyph on an active filter chip. */
const ChipCheckGlyphSize = 14

/** The `search_off` glyph in an empty state. */
const EmptyStateGlyphSize = 26

/**
 * Use the caller's ref when one was supplied, so a view can focus the control,
 * and otherwise mint one — the tooltip needs a target either way.
 */
function useTooltipTarget<T>(
  supplied: ObservableRef<T> | undefined
): ObservableRef<T> {
  const fallback = React.useMemo(() => createObservableRef<T>(), [])
  return supplied ?? fallback
}

export interface IMd3IconButtonProps {
  /** The ligature to render. Decorative — the accessible name is `label`. */
  readonly icon: MaterialSymbolName

  /**
   * The accessible name. Required: the button renders a glyph and nothing
   * else, so without this it reaches assistive technology unnamed.
   */
  readonly label: string

  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /** The contract's `iconBtnSm`: 26px instead of 32px. */
  readonly small?: boolean

  /** The 30px variant the diff toolbar's wrap toggle uses. */
  readonly medium?: boolean

  /**
   * Paint the primary-container active treatment. Set this together with
   * `pressed` for the contract's toggles (commit graph, absolute dates, wrap)
   * so the state is both visible and announced.
   */
  readonly active?: boolean

  /** `aria-pressed`, for a toggle button. */
  readonly pressed?: boolean

  /** `aria-expanded`, for a button that opens a menu or panel. */
  readonly expanded?: boolean

  /** `aria-haspopup`, for a button that opens a menu or dialog. */
  readonly hasPopup?: 'menu' | 'dialog' | 'listbox' | 'true'

  readonly disabled?: boolean

  /** Overrides the per-size glyph default when the contract asks for one. */
  readonly iconSize?: number

  /** Hover hint. Defaults to `label`; pass `null` to suppress it entirely. */
  readonly tooltip?: string | null

  /**
   * Set `-1` when this button sits inside a roving-tabindex list, so Tab
   * reaches the list once rather than once per row.
   */
  readonly tabIndex?: number

  readonly className?: string

  /**
   * Created with `createObservableRef`. Supply one when the view has to move
   * focus back to this button — after closing the menu it opened, say.
   */
  readonly buttonRef?: ObservableRef<HTMLButtonElement>
}

/**
 * The contract's `iconBtn` (32px) and `iconBtnSm` (26px) circular buttons.
 */
export function Md3IconButton(props: IMd3IconButtonProps) {
  const ref = useTooltipTarget(props.buttonRef)
  const defaultGlyph =
    props.small === true || props.medium === true
      ? SmallIconButtonGlyphSize
      : IconButtonGlyphSize
  const tooltip = props.tooltip === undefined ? props.label : props.tooltip

  return (
    <button
      ref={ref}
      type="button"
      className={classNames(
        'md3-icon-button',
        {
          'md3-icon-button--small': props.small === true,
          'md3-icon-button--medium':
            props.medium === true && props.small !== true,
          'md3-icon-button--active': props.active === true,
        },
        props.className
      )}
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      aria-haspopup={props.hasPopup}
      disabled={props.disabled}
      tabIndex={props.tabIndex}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
    >
      {tooltip === null ? null : (
        <Tooltip target={ref} applyAriaDescribedBy={tooltip !== props.label}>
          {tooltip}
        </Tooltip>
      )}
      <MaterialSymbol name={props.icon} size={props.iconSize ?? defaultGlyph} />
    </button>
  )
}

export interface IMd3TextButtonProps {
  /** The visible text. */
  readonly label: string

  /** Native form semantics for the shared MD3 text-button primitive. */
  readonly type?: 'button' | 'submit' | 'reset'

  /** An optional leading glyph. Decorative. */
  readonly icon?: MaterialSymbolName

  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A fuller accessible name, for a label that is unambiguous on screen but
   * not on its own. It must contain `label` verbatim, or a speech-input user
   * cannot activate the control by the words they can see (WCAG 2.5.3).
   */
  readonly accessibleName?: string

  /** `aria-pressed`, for a toggle button. */
  readonly pressed?: boolean

  /** `aria-expanded`, for a button that opens a menu or panel. */
  readonly expanded?: boolean

  /** `aria-haspopup`, for a button that opens a menu or dialog. */
  readonly hasPopup?: 'menu' | 'dialog' | 'listbox' | 'true'

  readonly disabled?: boolean

  readonly iconSize?: number

  /** Hover hint. Omitted by default — the label is already visible. */
  readonly tooltip?: string

  readonly className?: string

  /** Created with `createObservableRef`. */
  readonly buttonRef?: ObservableRef<HTMLButtonElement>
}

function Md3TextButton(
  props: IMd3TextButtonProps & { readonly baseClassName: string }
) {
  const ref = useTooltipTarget(props.buttonRef)

  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={classNames(props.baseClassName, props.className)}
      aria-label={props.accessibleName}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      aria-haspopup={props.hasPopup}
      disabled={props.disabled}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
    >
      {props.tooltip === undefined ? null : (
        <Tooltip
          target={ref}
          applyAriaDescribedBy={props.tooltip !== props.label}
        >
          {props.tooltip}
        </Tooltip>
      )}
      {props.icon === undefined ? null : (
        <MaterialSymbol
          name={props.icon}
          size={props.iconSize ?? TextButtonGlyphSize}
        />
      )}
      <span>{props.label}</span>
    </button>
  )
}

/** The contract's `smallTonalBtn`: 28px, surface-container-high. */
export function Md3TonalButton(props: IMd3TextButtonProps) {
  return <Md3TextButton {...props} baseClassName="md3-tonal-button" />
}

/** The contract's `smallGhostBtn`: 26px, outline-variant border, no fill. */
export function Md3GhostButton(props: IMd3TextButtonProps) {
  return <Md3TextButton {...props} baseClassName="md3-ghost-button" />
}

export interface IMd3SearchFieldProps {
  /** The input's DOM id, so a caller can label or focus it. */
  readonly id: string

  /**
   * The audited collection search surface this field is, as registered in
   * `lib/collection-surface-registry.ts`.
   *
   * Required, and deliberately so: this is the one shared search row of the
   * MD3 shell, so a new field is created by rendering this component and
   * nothing else. Without the id here a field would reach the screen carrying
   * a regex builder that belongs to no registered surface, and the source
   * audit — which is the project's guard that every search input is registered
   * and carries the full builder — would have nothing to bind it to.
   */
  readonly searchSurfaceId: string

  readonly value: string

  /** The placeholder, which also serves as the input's accessible name. */
  readonly placeholder: string

  /** Whether the query is being read as a regular expression. */
  readonly regexEnabled: boolean

  readonly onChange: (value: string) => void

  readonly onClear: () => void

  readonly onToggleRegex: () => void

  readonly onOpenBuilder: () => void

  /**
   * A short human-readable name for what this field searches — "commits",
   * "the diff", "workflow runs".
   *
   * It is required because the regex-mode and regex-builder buttons carry no
   * visible text of their own. A screen-reader user meeting six identical
   * "Regex builder" buttons on one screen has no way to tell which field each
   * one belongs to; naming them "Regex builder for the diff" is the whole
   * difference between a usable screen and an unusable one.
   */
  readonly fieldLabel: string

  /**
   * The number of matches, rendered as the contract's trailing "N hits" label
   * beside the diff, log and terminal searches.
   *
   * The label only appears while there is a query, exactly as the contract's
   * `dQuery ? diffMatches + ' hits' : ''` does, so an empty field can never
   * report "0 hits".
   */
  readonly matchCount?: number

  /**
   * Marks the query as one the field cannot currently act on — an unfinished
   * regular expression, typically. The list stays whole while this is true, so
   * the flag is what says *why* nothing is being filtered.
   *
   * Leave it unset and the field works it out: a regex-mode query that will not
   * compile is invalid whether or not the caller noticed. Pass `false` to
   * suppress that entirely, for a surface whose own matcher is not a regular
   * expression at all.
   */
  readonly invalid?: boolean

  /**
   * Why the query cannot be acted on, in the user's own words.
   *
   * Rendered as a polite status line beneath the row and pointed at by the
   * input's `aria-describedby`, so the reason reaches somebody who focuses the
   * field rather than only somebody who can see the sentence under it. Omit it
   * and the field supplies its own message for an uncompilable regular
   * expression; pass `null` to render no message while still reporting
   * `aria-invalid`.
   *
   * It is deliberately polite rather than an alert. This message changes on
   * every keystroke of a pattern being typed — `(`, `([`, `([a` are each their
   * own error — and an assertive region would interrupt a screen-reader user on
   * every one of those characters.
   */
  readonly error?: string | null

  readonly onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void

  /**
   * The leading `search` glyph size. Defaults to the contract's 16px sidebar
   * value; the application header's 40px pill uses 18px.
   */
  readonly iconSize?: number

  /** The `close` glyph size. Defaults to 15px; the header pill uses 16px. */
  readonly clearIconSize?: number

  /**
   * The `construction` glyph size. Defaults to 15px; the header pill uses 16px.
   */
  readonly builderIconSize?: number

  readonly className?: string

  readonly inputRef?: React.Ref<HTMLInputElement>
}

/**
 * Compilation is bounded so a pasted megabyte cannot be handed to the engine on
 * every keystroke. It is a guard on the *build*, not on matching — the
 * evaluation limits live with the builder.
 */
const MaximumSearchPatternLength = 2000

/**
 * Whether a regex-mode query can be compiled at all, and the engine's own
 * complaint when it cannot.
 *
 * Every MD3 search surface reaches its filter through the same shape — compile
 * the query, and on failure leave the collection whole. That fallback is the
 * right behaviour and the wrong silence: the list stops narrowing and nothing
 * on screen, and nothing at all in the accessibility tree, says why. Deriving
 * the answer here means a field reports it whether or not its view remembered
 * to.
 *
 * Returns `null` while the query is empty, while regex mode is off, or while
 * the pattern compiles.
 */
export function md3SearchPatternError(
  value: string,
  regexEnabled: boolean
): string | null {
  if (!regexEnabled) {
    return null
  }

  const raw = value.trim()
  if (raw.length === 0) {
    return null
  }

  if (raw.length > MaximumSearchPatternLength) {
    return t('md3.search.patternTooLong', {
      limit: String(MaximumSearchPatternLength),
    })
  }

  try {
    // Built and discarded: the question is whether the engine accepts it, and
    // every caller compiles its own with the flags that surface needs.
    new RegExp(raw)
    return null
  } catch (error) {
    return t('md3.search.invalidPattern', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * The contract's `searchRow`: a search glyph, the input, a clear button that
 * only exists while there is something to clear, the `.*` regex-mode toggle,
 * and the anchored regex-builder launcher.
 */
export function Md3SearchField(props: IMd3SearchFieldProps) {
  const { onChange, fieldLabel } = props
  const onInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.currentTarget.value)
    },
    [onChange]
  )

  const clearLabel = t('md3.search.clear', { field: fieldLabel })
  const regexLabel = t('md3.search.regexMode', { field: fieldLabel })
  const builderLabel = t('md3.search.regexBuilder', { field: fieldLabel })

  const clearRef = useTooltipTarget<HTMLButtonElement>(undefined)
  const regexRef = useTooltipTarget<HTMLButtonElement>(undefined)

  const showHits =
    props.value.trim().length > 0 && props.matchCount !== undefined

  // The caller's message wins when it supplies one, so a view that already
  // phrases the failure in its own words keeps doing so. `error={null}` is a
  // deliberate "invalid, but said elsewhere" rather than "no error", which is
  // why the state below is still derived when the message is suppressed.
  const derived = md3SearchPatternError(props.value, props.regexEnabled)
  const message = props.error !== undefined ? props.error : derived
  const invalid = props.invalid ?? (message !== null || derived !== null)
  const errorId = `${props.id}-error`

  return (
    <>
      <div
        className={classNames('md3-search-row', props.className)}
        onContextMenu={props.onContextMenu}
      >
        <MaterialSymbol
          name="search"
          className="md3-search-row__icon"
          size={props.iconSize ?? 16}
        />
        <input
          ref={props.inputRef}
          id={props.id}
          data-search-surface-id={props.searchSurfaceId}
          type="text"
          role="searchbox"
          className="md3-search-row__input"
          placeholder={props.placeholder}
          aria-label={props.placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={message === null ? undefined : errorId}
          value={props.value}
          spellCheck={false}
          autoComplete="off"
          onChange={onInputChange}
        />
        {props.value.length === 0 ? null : (
          <button
            ref={clearRef}
            type="button"
            className="md3-search-row__clear"
            aria-label={clearLabel}
            onClick={props.onClear}
          >
            <Tooltip target={clearRef} applyAriaDescribedBy={false}>
              {clearLabel}
            </Tooltip>
            <MaterialSymbol name="close" size={props.clearIconSize ?? 15} />
          </button>
        )}
        <button
          ref={regexRef}
          type="button"
          className={classNames('md3-search-row__regex', {
            'md3-search-row__regex--active': props.regexEnabled,
          })}
          aria-pressed={props.regexEnabled}
          aria-label={regexLabel}
          onClick={props.onToggleRegex}
        >
          <Tooltip target={regexRef} applyAriaDescribedBy={false}>
            {regexLabel}
          </Tooltip>
          .*
        </button>
        <Md3IconButton
          small={true}
          icon="construction"
          iconSize={props.builderIconSize}
          label={builderLabel}
          hasPopup="dialog"
          onClick={props.onOpenBuilder}
        />
        {showHits ? (
          <span className="md3-search-row__hits" role="status">
            {t('md3.search.hits', { count: String(props.matchCount) })}
          </span>
        ) : null}
      </div>
      {message === null ? null : (
        <p id={errorId} className="md3-search-row__error" role="status">
          {message}
        </p>
      )}
    </>
  )
}

export interface IMd3ChipRowProps {
  readonly children: React.ReactNode
  readonly className?: string
  readonly onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
  /** An accessible name for the group of chips, e.g. "Commit filters". */
  readonly label?: string
}

/**
 * The contract's `chipRow` — the wrapping filter-chip strip beneath a search
 * field, which also carries the trailing toggles for that surface.
 */
export function Md3ChipRow(props: IMd3ChipRowProps) {
  return (
    <div
      className={classNames('md3-chip-row', props.className)}
      role="group"
      aria-label={props.label}
      onContextMenu={props.onContextMenu}
    >
      {props.children}
    </div>
  )
}

/** The contract's `<div style="flex: 1">` between chips and trailing toggles. */
export function Md3ChipRowSpacer() {
  return <div className="md3-chip-row__spacer" />
}

export interface IMd3ChipProps {
  readonly label: string

  /**
   * The stable identifier `onToggle` reports, when the chip's label is not
   * itself the thing being filtered on.
   *
   * A chip whose label is data — a repository group's own name, a commit's own
   * day — filters by that label, so the two are the same string and this is
   * omitted. A chip whose label is *copy* must not: the label is localized and
   * changes with the language mode and the funny level, so a caller matching a
   * filter against it would stop recognising its own chips the moment the user
   * switched to Cantonese. Those chips pass their untranslated id here.
   */
  readonly value?: string

  readonly active: boolean

  readonly onToggle: (value: string) => void

  readonly disabled?: boolean

  readonly className?: string

  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/**
 * The contract's `chipVals()` filter chip: an `aria-pressed` toggle that grows
 * a leading `check` glyph and a secondary-container fill when it is on, and
 * carries an outline-variant border when it is off.
 */
export function Md3Chip(props: IMd3ChipProps) {
  const { onToggle, label, value } = props
  const reported = value ?? label
  const onClick = React.useCallback(() => {
    onToggle(reported)
  }, [onToggle, reported])

  return (
    <button
      type="button"
      className={classNames(
        'md3-chip',
        { 'md3-chip--active': props.active },
        props.className
      )}
      aria-pressed={props.active}
      aria-label={t('md3.chip.filterBy', { label: props.label })}
      disabled={props.disabled}
      onClick={onClick}
      onContextMenu={props.onContextMenu}
    >
      {props.active ? (
        <MaterialSymbol name="check" size={ChipCheckGlyphSize} />
      ) : null}
      <span>{props.label}</span>
    </button>
  )
}

export interface IMd3EmptyStateProps {
  /** The sentence explaining why the list is empty. */
  readonly message: string

  /** The glyph above the message. The contract uses `search_off`. */
  readonly icon?: MaterialSymbolName

  /**
   * The recovery action. Omit `onAction` to render the message alone — an
   * empty state with a button that does nothing is worse than one without.
   */
  readonly onAction?: () => void

  /** Defaults to the contract's "Reset filters". */
  readonly actionLabel?: string

  readonly className?: string
}

/**
 * The contract's `historyEmptyStyle` / `repoEmptyStyle` block: a `search_off`
 * glyph, the no-match sentence, and the tonal "Reset filters" action.
 */
export function Md3EmptyState(props: IMd3EmptyStateProps) {
  const actionLabel = props.actionLabel ?? t('md3.emptyState.resetFilters')

  return (
    <div
      className={classNames('md3-empty-state', props.className)}
      role="status"
    >
      <MaterialSymbol
        name={props.icon ?? 'search_off'}
        size={EmptyStateGlyphSize}
      />
      <span className="md3-empty-state__message">{props.message}</span>
      {props.onAction === undefined ? null : (
        <button
          type="button"
          className="md3-reset-button"
          onClick={props.onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export interface IMd3GroupHeaderProps {
  /** The group's visible name — a day, a branch group, an organisation. */
  readonly label: string

  /**
   * Pin the header to the top of the scrolling container while its group is
   * on screen. Off by default, matching the contract, which renders these
   * headers in normal flow.
   */
  readonly sticky?: boolean

  /** Set this and point the group's container at it with `aria-labelledby`. */
  readonly id?: string

  readonly className?: string
}

/**
 * The contract's `headerStyle` — the uppercase, letter-spaced label above the
 * first row of each day, branch group or organisation.
 */
export function Md3GroupHeader(props: IMd3GroupHeaderProps) {
  return (
    <div
      id={props.id}
      className={classNames(
        'md3-group-header',
        { 'md3-group-header--sticky': props.sticky === true },
        props.className
      )}
    >
      {props.label}
    </div>
  )
}
