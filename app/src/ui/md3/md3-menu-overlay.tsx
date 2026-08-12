import * as React from 'react'
import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { Md3IconButton, Md3SearchField, Md3TonalButton } from './md3-primitives'
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
 * a case-insensitive substring match on the label by default, and a
 * case-insensitive regular expression when regex mode is on.
 */
export function filterMenuItems(
  items: ReadonlyArray<IMd3MenuItem>,
  query: string,
  regexEnabled: boolean
): IMd3MenuFilterResult {
  if (query.length === 0) {
    return { items, patternInvalid: false }
  }

  if (regexEnabled) {
    let expression: RegExp
    try {
      expression = new RegExp(query, 'i')
    } catch {
      return { items, patternInvalid: true }
    }
    return {
      items: items.filter(item => expression.test(item.label)),
      patternInvalid: false,
    }
  }

  const needle = query.toLowerCase()
  return {
    items: items.filter(item => item.label.toLowerCase().includes(needle)),
    patternInvalid: false,
  }
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
  readonly onOpenRegexBuilder: (pattern: string) => void

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
}

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export class Md3MenuOverlay extends React.Component<
  IMd3MenuOverlayProps,
  IMd3MenuOverlayState
> {
  private readonly panelRef = createObservableRef<HTMLDivElement>()
  private readonly listRef = createObservableRef<HTMLDivElement>()
  private readonly filterRef = createObservableRef<HTMLInputElement>()

  /** Whatever held focus when the menu opened, restored when it closes. */
  private previouslyFocused: HTMLElement | null = null

  public constructor(props: IMd3MenuOverlayProps) {
    super(props)
    this.state = {
      filter: props.initialFilter ?? '',
      regexEnabled: props.initialRegexEnabled ?? false,
    }
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
    this.filterRef.current?.focus()
  }

  public componentWillUnmount() {
    this.panelRef.current?.removeEventListener('keydown', this.onPanelKeyDown)
    const target = this.props.returnFocusTo?.current ?? this.previouslyFocused
    // The node can have left the document while the menu was up — restoring
    // focus to a detached element silently drops focus onto <body>, so check.
    if (target !== null && target.isConnected) {
      target.focus()
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
        this.setState({ filter: '' })
        this.filterRef.current?.focus()
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
    this.setState({ filter: appended })
    this.filterRef.current?.focus()
  }

  private activate(item: IMd3MenuItem) {
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
    this.setState({ filter: value })
  }

  private onClearFilter = () => {
    this.setState({ filter: '' })
    this.filterRef.current?.focus()
  }

  private onToggleRegex = () => {
    this.setState(previous => ({ regexEnabled: !previous.regexEnabled }))
  }

  private onOpenBuilder = () => {
    this.props.onOpenRegexBuilder(this.state.filter)
  }

  private renderFilterRow() {
    const { spec } = this.props

    if (!spec.hasFilter) {
      return null
    }

    const { items, patternInvalid } = this.filterResult

    // One audited surface for every menu, not one per menu kind: there is a
    // single filter field, owned by this overlay and rendered for whichever
    // menu is open, exactly as the app's context menus share the
    // `material-context-menu` surface.
    return (
      <Md3SearchField
        id={`md3-menu-${spec.kind}-filter`}
        searchSurfaceId="md3-menu-filter"
        inputRef={this.filterRef}
        value={this.state.filter}
        placeholder={spec.filterPlaceholder}
        fieldLabel={spec.title}
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
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        className="md3-menu-overlay__item"
        data-item-id={item.id}
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
          <span className="md3-menu-overlay__item-hint">{item.hint}</span>
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
    const headingId = `md3-menu-${spec.kind}-title`

    return (
      <div
        className="md3-menu-overlay md3-anim-fade--overlay"
        role="presentation"
        onMouseDown={this.onScrimMouseDown}
      >
        <div
          ref={this.panelRef}
          className="md3-menu-overlay__panel md3-anim-menu"
          style={{ maxWidth: `${spec.width}px` }}
          role="dialog"
          aria-modal={true}
          aria-labelledby={headingId}
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
      </div>
    )
  }
}
