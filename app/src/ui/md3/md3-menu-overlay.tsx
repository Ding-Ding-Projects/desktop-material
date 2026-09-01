import * as React from 'react'
import { FilterMode } from '../../lib/fuzzy-find'
import { t } from '../../lib/i18n'
import { filterByMode } from '../lib/filter-string-list'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  IRegexFlags,
  flagsToString,
} from '../lib/regex-builder/regex-block-model'
import {
  md3SearchPatternError,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { IMd3MenuItem, IMd3MenuSpec } from './md3-menu-specs'

/**
 * The generic filterable menu overlay of the MD3 shell contract
 * (`design/History MD3.dc.html`, the `menuOpen` block): a scrim, a panel with
 * the menu's glyph, title and close button, a filter row carrying the `.*`
 * regex toggle and the anchored regex-builder launcher, and a scrolling list of
 * actions.
 *
 * Every measurement lives in `app/styles/ui/_md3-menu-overlay.scss`. The panel
 * width is the one value the contract computes per menu, so it is the one
 * inline style here.
 */

/** The result of filtering a menu's items. */
export interface IMd3MenuFilterResult {
  readonly items: ReadonlyArray<IMd3MenuItem>

  /**
   * True when regex mode is on and the query does not compile.
   *
   * The contract's filter returns `true` for every item in that case, so the
   * list stays whole rather than emptying while somebody is halfway through
   * typing `(foo`. That behaviour is reproduced exactly; the flag exists so the
   * field can additionally say why nothing is being filtered, which the
   * contract leaves the user to work out.
   */
  readonly patternInvalid: boolean
}

/**
 * Filter a menu's items exactly as the contract's `menuItems` mapping does:
 * a case-insensitive substring match on the label by default, and the shared
 * bounded RE2 adapter when regex mode is on. Keeping this at the same adapter
 * used by the rest of the app means a menu cannot accidentally hand user text
 * to the renderer's native RegExp engine.
 */
export function filterMenuItems(
  items: ReadonlyArray<IMd3MenuItem>,
  query: string,
  regexEnabled: boolean
): IMd3MenuFilterResult {
  const result = filterByMode(
    items,
    item => [item.label],
    query,
    regexEnabled ? FilterMode.Regex : FilterMode.Substring,
    false
  )
  return {
    items: result.items,
    patternInvalid: result.regexError !== null,
  }
}

/**
 * Translate the menu spec's visible shortcut notation into ARIA's key
 * vocabulary. The hint remains the single source of truth: state hints such as
 * "On" and pointer gestures such as "⇧click" are deliberately not exposed as
 * keyboard shortcuts.
 */
function ariaKeyShortcutsForHint(hint: string): string | undefined {
  if (!/[⌘⌥⇧⌃]/u.test(hint)) {
    return undefined
  }

  const modifiers: string[] = []
  let key = ''
  let isNamedKey = false
  for (const character of hint) {
    switch (character) {
      case '⌘':
        modifiers.push('Meta')
        break
      case '⌥':
        modifiers.push('Alt')
        break
      case '⇧':
        modifiers.push('Shift')
        break
      case '⌃':
        modifiers.push('Control')
        break
      case '⏎':
        key = 'Enter'
        isNamedKey = true
        break
      default:
        key += character
        break
    }
  }

  // A pointer gesture is visible in the hint but is not an ARIA keyboard
  // shortcut. Likewise, refuse multi-character keys that are not the one
  // explicit Enter glyph handled above.
  if (key.length !== 1 && !isNamedKey) {
    return undefined
  }

  return [...modifiers, key].join('+')
}

/** Anything with a `current` — an `ObservableRef` or a plain React ref object. */
export interface IMd3FocusTarget {
  readonly current: HTMLElement | null
}

export interface IMd3MenuOverlayProps {
  /** The menu to render. Build it with `getMenuSpec`. */
  readonly spec: IMd3MenuSpec

  /** Close the menu: the scrim, the close button and Escape all call this. */
  readonly onDismiss: () => void

  /**
   * Open the regex builder seeded with the filter's current text, as the
   * contract's `openMenuBuilder` does.
   */
  /**
   * Legacy host callback retained for menu-spec compatibility. The overlay
   * now owns its builder, so a menu filter never routes into another view's
   * search state.
   */
  readonly onOpenRegexBuilder?: (pattern: string) => void

  /** Explicit identity for this concrete menu instance. */
  readonly instanceId?: string

  /** Alias accepted by callers that name the value as a menu instance. */
  readonly menuInstanceId?: string

  /** Optional pointer/trigger anchor. Omit for the centered fallback. */
  readonly anchor?: HTMLElement | null

  /** Preferred Floating UI edge for an anchored menu. */
  readonly anchorPosition?: PopoverAnchorPosition

  /**
   * The control that opened the menu, so focus can go back to it on close.
   *
   * Optional: when it is absent the overlay restores whatever held focus at the
   * moment it mounted, which is the same element in every ordinary case. Pass
   * it when the opening control is re-rendered while the menu is up and the
   * remembered node would be stale.
   */
  readonly returnFocusTo?: IMd3FocusTarget

  /**
   * Seeds the filter field. Defaults to empty, which is how the contract opens
   * every menu.
   *
   * The shell supplies it after the regex builder writes a pattern back into
   * this menu's own filter: the menu is the field that opened the builder, so
   * it has to come back carrying what was built rather than making the user
   * retype it.
   */
  readonly initialFilter?: string

  /** Seeds the filter's regex mode. Defaults to off. */
  readonly initialRegexEnabled?: boolean
}

interface IMd3MenuOverlayState {
  readonly filter: string

  readonly regexEnabled: boolean

  readonly pattern: string

  readonly flags: IRegexFlags

  readonly validation: string | null

  readonly mode: 'substring' | 'regex'

  readonly history: ReadonlyArray<string>

  readonly builderOpen: boolean

  readonly centeredFallback: boolean
}

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface IPopoverMenuSurfaceProps {
  readonly anchor: HTMLElement
  readonly anchorPosition: PopoverAnchorPosition
  readonly onDismiss: () => void
  readonly children: React.ReactNode
}

/** The bounded Floating UI envelope used by trigger-owned menu instances. */
function PopoverMenuSurface(props: IPopoverMenuSurfaceProps) {
  return (
    <Popover
      anchor={props.anchor}
      anchorPosition={props.anchorPosition}
      decoration={PopoverDecoration.Bordered}
      isDialog={false}
      style={{ zIndex: 40 }}
      onClickOutside={props.onDismiss}
      onMousedownOutside={props.onDismiss}
    >
      {props.children}
    </Popover>
  )
}

export class Md3MenuOverlay extends React.Component<
  IMd3MenuOverlayProps,
  IMd3MenuOverlayState
> {
  private static nextInstanceId = 0

  private readonly instanceId: string

  private readonly searchSurfaceId: string

  private readonly panelRef = createObservableRef<HTMLDivElement>()
  private readonly listRef = createObservableRef<HTMLDivElement>()
  private readonly filterRef = createObservableRef<HTMLInputElement>()
  private readonly builderButtonRef = createObservableRef<HTMLButtonElement>()

  /** Whatever held focus when the menu opened, restored when it closes. */
  private previouslyFocused: HTMLElement | null = null

  public constructor(props: IMd3MenuOverlayProps) {
    super(props)
    const suppliedId = props.instanceId ?? props.menuInstanceId
    this.instanceId =
      suppliedId === undefined || suppliedId.length === 0
        ? `${props.spec.kind}-${++Md3MenuOverlay.nextInstanceId}`
        : suppliedId
    this.searchSurfaceId = `md3-menu-${props.spec.kind}-${this.instanceId}`
    const initialFilter = props.initialFilter ?? ''
    const initialRegexEnabled = props.initialRegexEnabled ?? false
    this.state = {
      filter: initialFilter,
      regexEnabled: initialRegexEnabled,
      pattern: initialFilter,
      flags: {
        g: false,
        i: initialRegexEnabled,
        m: false,
        s: false,
        u: false,
        y: false,
      },
      validation: md3SearchPatternError(initialFilter, initialRegexEnabled),
      mode: initialRegexEnabled ? 'regex' : 'substring',
      history: initialFilter.length === 0 ? [] : [initialFilter],
      builderOpen: false,
      centeredFallback: this.shouldUseCenteredFallback(),
    }
  }

  private shouldUseCenteredFallback(): boolean {
    if (this.props.anchor === undefined || this.props.anchor === null) {
      return true
    }
    if (typeof window === 'undefined') {
      return true
    }
    return window.innerWidth < 620 || window.innerHeight < 560
  }

  public componentDidMount() {
    this.previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    // The panel is a `dialog`, which is a non-interactive role, so its key
    // handling is attached natively rather than as a JSX prop. Every key the
    // menu answers to has to work wherever focus sits inside the panel —
    // the filter, an item, the close button — so one listener on the panel is
    // also simply the correct shape for it.
    this.panelRef.current?.addEventListener('keydown', this.onPanelKeyDown)
    window.addEventListener('resize', this.onViewportResize)
    this.filterRef.current?.focus()
  }

  public componentWillUnmount() {
    this.panelRef.current?.removeEventListener('keydown', this.onPanelKeyDown)
    window.removeEventListener('resize', this.onViewportResize)
    const target = this.props.returnFocusTo?.current ?? this.previouslyFocused
    // The node can have left the document while the menu was up — restoring
    // focus to a detached element silently drops focus onto <body>, so check.
    if (target !== null && target.isConnected) {
      target.focus()
    }
  }

  private onViewportResize = () => {
    const centeredFallback = this.shouldUseCenteredFallback()
    if (centeredFallback !== this.state.centeredFallback) {
      this.setState({ centeredFallback })
    }
  }

  private get filterResult(): IMd3MenuFilterResult {
    return filterMenuItems(
      this.props.spec.items,
      this.state.filter,
      this.state.regexEnabled
    )
  }

  private itemButtons(): ReadonlyArray<HTMLButtonElement> {
    const list = this.listRef.current
    if (list === null) {
      return []
    }
    return Array.from(
      list.querySelectorAll<HTMLButtonElement>('.md3-menu-overlay__item')
    )
  }

  private focusItemAt(index: number) {
    const buttons = this.itemButtons()
    if (buttons.length === 0) {
      return
    }
    const wrapped = ((index % buttons.length) + buttons.length) % buttons.length
    const button = buttons[wrapped]
    button.focus()
    button.scrollIntoView({ block: 'nearest' })
  }

  private moveFocus(direction: 1 | -1) {
    const buttons = this.itemButtons()
    if (buttons.length === 0) {
      return
    }
    const active = document.activeElement
    const current = buttons.findIndex(button => button === active)
    if (current === -1) {
      this.focusItemAt(direction === 1 ? 0 : buttons.length - 1)
      return
    }
    this.focusItemAt(current + direction)
  }

  private trapTab(event: KeyboardEvent) {
    const panel = this.panelRef.current
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
  }

  private onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      // Escape clears a filter that has something in it, and only closes the
      // menu once there is nothing left to clear.
      if (this.state.filter.length > 0) {
        this.onClearFilter()
      } else {
        this.props.onDismiss()
      }
      return
    }

    if (event.key === 'Tab') {
      this.trapTab(event)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.moveFocus(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.moveFocus(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      this.focusItemAt(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      this.focusItemAt(this.itemButtons().length - 1)
      return
    }

    const filterInput: EventTarget | null = this.filterRef.current
    if (event.key === 'Enter' && event.target === filterInput) {
      // Enter from the filter runs the first surviving item. An item that
      // already has focus activates natively, so this must not fire for it.
      event.preventDefault()
      const first = this.filterResult.items[0]
      if (first !== undefined) {
        this.activate(first)
      }
    }
  }

  private onItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Typing while an item has focus goes on filtering rather than doing
    // nothing: the character is appended and focus returns to the field, so a
    // user who arrowed too far can simply keep typing.
    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    const appended = this.state.filter + event.key
    this.onFilterChange(appended)
    this.filterRef.current?.focus()
  }

  private activate(item: IMd3MenuItem) {
    // A menu's builder action belongs to this menu instance. Treating it as a
    // view-level command would close this surface and seed whichever search
    // happened to be mounted there, which is precisely the cross-surface
    // routing bug this overlay owns.
    if (item.id === 'openRegexBuilder') {
      this.onOpenBuilder()
      return
    }
    item.onClick()
  }

  private onItemClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.itemId
    const item = this.filterResult.items.find(candidate => candidate.id === id)
    if (item !== undefined) {
      this.activate(item)
    }
  }

  private onScrimMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only a press that both starts and lands on the scrim itself dismisses:
    // a drag that began inside the panel must not close it on release.
    if (event.target === event.currentTarget) {
      this.props.onDismiss()
    }
  }

  private onFilterChange = (value: string) => {
    const validation = md3SearchPatternError(value, this.state.regexEnabled)
    this.setState(previous => ({
      filter: value,
      pattern: value,
      validation,
      history:
        value === previous.filter
          ? previous.history
          : [...previous.history, value].slice(-20),
    }))
  }

  private onClearFilter = () => {
    this.onFilterChange('')
    this.filterRef.current?.focus()
  }

  private onToggleRegex = () => {
    this.setState(previous => {
      const regexEnabled = !previous.regexEnabled
      return {
        regexEnabled,
        mode: regexEnabled ? 'regex' : 'substring',
        validation: md3SearchPatternError(previous.filter, regexEnabled),
        flags: {
          ...previous.flags,
          i: regexEnabled,
        },
      }
    })
  }

  private onOpenBuilder = () => {
    this.setState({ builderOpen: true })
  }

  private onCloseBuilder = () => {
    this.setState({ builderOpen: false })
  }

  private onApplyBuilder = (application: IMd3RegexBuilderApplication) => {
    const validation = md3SearchPatternError(application.pattern, true)
    this.setState(previous => ({
      filter: application.pattern,
      pattern: application.pattern,
      regexEnabled: true,
      mode: 'regex',
      flags: application.flags,
      validation,
      history:
        application.pattern === previous.filter
          ? previous.history
          : [...previous.history, application.pattern].slice(-20),
      builderOpen: false,
    }))
  }

  private renderFilterRow() {
    const { spec } = this.props

    if (!spec.hasFilter) {
      return null
    }

    const { items, patternInvalid } = this.filterResult

    // Every concrete menu instance owns a distinct search surface. A shared
    // registry entry describes the implementation, while this value carries
    // the instance boundary that keeps simultaneous menus isolated.
    return (
      <Md3SearchField
        id={`${this.searchSurfaceId}-filter`}
        searchSurfaceId={this.searchSurfaceId}
        inputRef={this.filterRef}
        builderButtonRef={this.builderButtonRef}
        searchPattern={this.state.pattern}
        searchMode={this.state.mode}
        searchFlags={flagsToString(this.state.flags)}
        searchHistory={this.state.history}
        value={this.state.filter}
        placeholder={spec.filterPlaceholder}
        fieldLabel={`${spec.title} (${this.instanceId})`}
        regexEnabled={this.state.regexEnabled}
        invalid={patternInvalid}
        matchCount={items.length}
        onChange={this.onFilterChange}
        onClear={this.onClearFilter}
        onToggleRegex={this.onToggleRegex}
        onOpenBuilder={this.onOpenBuilder}
      />
    )
  }

  private renderItem(item: IMd3MenuItem) {
    const ariaKeyShortcuts = ariaKeyShortcutsForHint(item.hint)
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        className="md3-menu-overlay__item"
        data-item-id={item.id}
        aria-keyshortcuts={ariaKeyShortcuts}
        onClick={this.onItemClick}
        onKeyDown={this.onItemKeyDown}
      >
        <MaterialSymbol
          name={item.icon}
          className="md3-menu-overlay__item-icon"
          size={17}
        />
        <span className="md3-menu-overlay__item-label">{item.label}</span>
        {item.hint.length === 0 ? null : (
          <span
            className="md3-menu-overlay__item-hint"
            aria-hidden={ariaKeyShortcuts === undefined ? undefined : true}
          >
            {item.hint}
          </span>
        )}
      </button>
    )
  }

  private renderEmptyState() {
    return (
      <div className="md3-menu-overlay__empty" role="status">
        <MaterialSymbol name="search_off" size={26} />
        <span className="md3-menu-overlay__empty-message">
          {t('md3.menuOverlay.noMatches', { title: this.props.spec.title })}
        </span>
        <Md3TonalButton
          icon="backspace"
          label={t('md3.menuOverlay.clearFilter')}
          onClick={this.onClearFilter}
        />
      </div>
    )
  }

  public render() {
    const { spec } = this.props
    const { items, patternInvalid } = this.filterResult
    const headingId = `${this.searchSurfaceId}-title`

    const panel = (
      <div
        ref={this.panelRef}
        className="md3-menu-overlay__panel md3-anim-menu"
        style={{
          maxWidth: `${spec.width}px`,
          width: this.state.centeredFallback ? '100%' : `${spec.width}px`,
        }}
        role="dialog"
        aria-modal={
          this.props.anchor !== undefined && !this.state.centeredFallback
            ? false
            : true
        }
        aria-labelledby={headingId}
        data-menu-kind={spec.kind}
        data-menu-instance-id={this.instanceId}
        data-search-surface-id={this.searchSurfaceId}
      >
        <div className="md3-menu-overlay__header">
          <MaterialSymbol
            name={spec.icon}
            className="md3-menu-overlay__header-icon"
            size={18}
          />
          <span id={headingId} className="md3-menu-overlay__title">
            {spec.title}
          </span>
          <Md3IconButton
            small={true}
            icon="close"
            iconSize={16}
            label={t('md3.menuOverlay.close')}
            onClick={this.props.onDismiss}
          />
        </div>
        {this.renderFilterRow()}
        {patternInvalid ? (
          <p
            className="md3-menu-overlay__note md3-menu-overlay__note--invalid"
            role="status"
          >
            {t('md3.menuOverlay.invalidPattern')}
          </p>
        ) : null}
        <div
          ref={this.listRef}
          className="md3-menu-overlay__list"
          role="menu"
          aria-label={t('md3.menuOverlay.itemsLabel', { title: spec.title })}
        >
          {items.length === 0
            ? this.renderEmptyState()
            : items.map(item => this.renderItem(item))}
        </div>
        {spec.footer === undefined ? null : (
          <p className="md3-menu-overlay__footer">{spec.footer}</p>
        )}
      </div>
    )

    const menuSurface =
      this.props.anchor !== undefined &&
      this.props.anchor !== null &&
      !this.state.centeredFallback ? (
        <div
          className="md3-menu-overlay md3-menu-overlay--anchored"
          data-menu-kind={spec.kind}
          data-menu-instance-id={this.instanceId}
          data-search-surface-id={this.searchSurfaceId}
        >
          {panel}
        </div>
      ) : (
        <div
          className="md3-menu-overlay md3-anim-fade--overlay"
          role="presentation"
          onMouseDown={this.onScrimMouseDown}
          data-menu-kind={spec.kind}
          data-menu-instance-id={this.instanceId}
          data-search-surface-id={this.searchSurfaceId}
        >
          {panel}
        </div>
      )

    const rendered =
      this.props.anchor !== undefined &&
      this.props.anchor !== null &&
      !this.state.centeredFallback ? (
        <PopoverMenuSurface
          anchor={this.props.anchor}
          anchorPosition={
            this.props.anchorPosition ?? PopoverAnchorPosition.BottomLeft
          }
          onDismiss={this.props.onDismiss}
        >
          {panel}
        </PopoverMenuSurface>
      ) : (
        menuSurface
      )

    return (
      <>
        {rendered}
        {this.state.builderOpen ? (
          <Md3RegexBuilderDialog
            targetLabel={`${spec.title} (${this.instanceId})`}
            searchSurfaceId={this.searchSurfaceId}
            anchor={this.builderButtonRef.current}
            anchorPosition={PopoverAnchorPosition.BottomRight}
            initialPattern={this.state.pattern}
            initialFlags={this.state.flags}
            sampleItems={spec.items.map(item => item.label)}
            onApply={this.onApplyBuilder}
            onDismissed={this.onCloseBuilder}
          />
        ) : null}
      </>
    )
  }
}
