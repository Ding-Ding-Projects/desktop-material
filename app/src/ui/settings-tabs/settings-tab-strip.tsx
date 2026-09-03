import * as React from 'react'
import classNames from 'classnames'

import { TooltippedContent } from '../lib/tooltipped-content'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { SettingsTabPickerPopover } from './settings-tab-picker-popover'
import {
  DefaultSettingsTabDockPosition,
  getPinnedSettingsTabs,
  getOpenSettingsTabs,
  ISettingsTabPersistenceOptions,
  ISettingsTabItem,
  orderSettingsTabs,
  setOpenSettingsTabs,
  SettingsTabDockPosition,
  SettingsTabStripId,
  toggleSettingsTabPin,
} from './settings-tab-model'
import { MaterialSymbol } from '../lib/material-symbol'

interface ISettingsTabStripProps {
  /** Which strip this is. Scopes the pins and the search surface id. */
  readonly strip: SettingsTabStripId
  /** Human name for the strip, used in the search field and menu wording. */
  readonly title: string
  /** Every page, in the dialog's declared order. */
  readonly items: ReadonlyArray<ISettingsTabItem>
  /**
   * The complete page set when `items` is a filtered view. Open-page state is
   * reconciled against this list so searching does not silently close pages.
   */
  readonly allItems?: ReadonlyArray<ISettingsTabItem>
  readonly selectedId: string
  readonly onSelect: (id: string) => void
  /** Blocks navigation while the dialog owns a mutation. */
  readonly disabled?: boolean
  /** Optional owner scope for the browser tab session, such as a repository. */
  readonly openStateScope?: string
  /** Numeric ids written by older versions, keyed by the current stable id. */
  // This migration map is consumed by getPersistenceOptions rather than JSX;
  // react/no-unused-prop-types cannot trace that class-method read.
  // eslint-disable-next-line react/no-unused-prop-types
  readonly legacyTabIdMap?: Readonly<Record<string, string>>

  /** Render the pages as horizontal browser tabs instead of a vertical rail. */
  readonly variant?: 'rail' | 'browser'
  /** Show the plus button that reopens a closed page in a new tab. */
  readonly showNewTab?: boolean
  /** Where the owning settings surface has docked this strip. */
  readonly dockPosition?: SettingsTabDockPosition

  /**
   * Whether the strip offers its own search button.
   *
   * Off by default because both settings dialogs already carry an inline
   * search field above the strip, and a second one a few pixels below it would
   * be two controls competing to do the same job. The picker is still reached
   * through the overflow button, which is the part neither dialog had.
   */
  readonly showSearch?: boolean
  /** Ids for the `aria-controls` contract, keyed by page id. */
  readonly getTabDomId?: (id: string) => string | undefined
  /** Panel ids for the `aria-controls` contract, keyed by page id. */
  readonly getTabPanelId?: (id: string) => string | undefined
  /** Localized action copy for callers whose visible labels are localized. */
  readonly accessibleLabels?: {
    readonly closeTab?: (label: string) => string
    readonly openNewTab?: string
    readonly allPagesOpen?: string
    readonly morePages?: (count: number) => string
    readonly tabList?: string
    readonly search?: string
    readonly pinTab?: (label: string) => string
    readonly unpinTab?: (label: string) => string
    readonly pickerTitle?: string
    readonly noMatches?: string
  }
}

interface ISettingsTabStripState {
  readonly pinnedIds: ReadonlyArray<string>
  /** Page ids that are currently open in the browser-style variant. */
  readonly openIds: ReadonlyArray<string>
  /**
   * The pages whose rows are not wholly inside the scrollport.
   *
   * Measured rather than computed from row heights: labels wrap, the two
   * dialogs use different row metrics, and a measurement cannot disagree with
   * what is on screen the way an estimate can.
   */
  readonly overflowIds: ReadonlyArray<string>
  readonly pickerAnchor: HTMLElement | null
  /** Whether the picker was opened by the overflow button or by search. */
  readonly pickerScope: 'overflow' | 'all' | 'new' | null
}

/**
 * A settings navigation strip with the affordances a browser tab strip has.
 *
 * The plain `TabBar` these dialogs used to render had one failure mode that
 * mattered: when the pages did not fit, they were simply below the fold. The
 * strip scrolled, but Chromium draws an overlay scrollbar there — no reserved
 * space, invisible until the list is already moving — and Settings put its
 * version line directly underneath, so the list looked finished. Eight of
 * fourteen pages showed and the other six read as features the app did not
 * have.
 *
 * So the fix is not "make it scroll" — it already did. It is to say out loud
 * that there is more: a count of what did not fit, a surface that lists it, a
 * search across every page, and pinning so the pages you actually use stop
 * being the ones that fall off the bottom.
 */
export class SettingsTabStrip extends React.Component<
  ISettingsTabStripProps,
  ISettingsTabStripState
> {
  private list: HTMLDivElement | null = null
  private readonly rowRefs = new Map<string, HTMLButtonElement>()
  private readonly rowRefCallbacks = new Map<
    string,
    (row: HTMLButtonElement | null) => void
  >()
  private resizeObserver: ResizeObserver | undefined
  private measureHandle: number | null = null

  public constructor(props: ISettingsTabStripProps) {
    super(props)
    const declaredItems = props.allItems ?? props.items
    const persistenceOptions = this.getPersistenceOptions(props)
    const persistedOpenIds = getOpenSettingsTabs(
      props.strip,
      undefined,
      persistenceOptions
    )
    const storedOpenIds = getOpenSettingsTabs(
      props.strip,
      declaredItems.map(item => item.id),
      persistenceOptions
    )
    const openIds = [
      ...this.reconcileOpenIds(
        declaredItems,
        storedOpenIds ?? declaredItems.map(item => item.id),
        props.selectedId,
        props.variant
      ),
    ]
    if (
      props.variant === 'browser' &&
      persistedOpenIds !== null &&
      (props.openStateScope !== undefined ||
        openIds.length !== persistedOpenIds.length ||
        openIds.some((id, index) => id !== persistedOpenIds[index]))
    ) {
      setOpenSettingsTabs(props.strip, openIds, persistenceOptions)
    }
    this.state = {
      pinnedIds: getPinnedSettingsTabs(props.strip, persistenceOptions),
      openIds,
      overflowIds: [],
      pickerAnchor: null,
      pickerScope: null,
    }

    // Guard and construct from the same value: a capability check that tests
    // one binding and constructs another passes and then throws, and a throw in
    // a component constructor takes the whole subtree down rather than
    // degrading to an unobserved strip.
    const ResizeObserverClass: typeof ResizeObserver | undefined =
      (window as any)?.ResizeObserver ?? (globalThis as any).ResizeObserver

    if (typeof ResizeObserverClass === 'function') {
      this.resizeObserver = new ResizeObserverClass(() =>
        this.scheduleMeasure()
      )
    }
  }

  private getPersistenceOptions(
    props: ISettingsTabStripProps = this.props
  ): ISettingsTabPersistenceOptions {
    const allowedIds = new Set(
      (props.allItems ?? props.items).map(item => item.id)
    )
    for (const id of Object.values(props.legacyTabIdMap ?? {})) {
      allowedIds.add(id)
    }
    return {
      scope: props.openStateScope,
      legacyIdMap: props.legacyTabIdMap,
      allowedIds: [...allowedIds],
    }
  }

  private reconcileOpenIds(
    items: ReadonlyArray<ISettingsTabItem>,
    ids: ReadonlyArray<string>,
    selectedId: string,
    variant: 'rail' | 'browser' | undefined
  ): ReadonlyArray<string> {
    const declaredIds = new Set(items.map(item => item.id))
    const openIds = ids.filter(id => declaredIds.has(id))
    if (openIds.length === 0) {
      openIds.push(...items.slice(0, 1).map(item => item.id))
    }
    if (
      variant === 'browser' &&
      declaredIds.has(selectedId) &&
      !openIds.includes(selectedId)
    ) {
      openIds.push(selectedId)
    }
    return openIds
  }

  public componentDidMount() {
    this.scheduleMeasure()
  }

  public componentDidUpdate(
    prevProps: ISettingsTabStripProps,
    prevState: ISettingsTabStripState
  ) {
    if (
      this.props.disabled === true &&
      prevProps.disabled !== true &&
      this.state.pickerAnchor !== null
    ) {
      this.setState({ pickerAnchor: null, pickerScope: null })
      return
    }
    if (this.props.variant === 'browser') {
      const declaredItems = this.props.allItems ?? this.props.items
      const openIds = this.reconcileOpenIds(
        declaredItems,
        this.state.openIds,
        this.props.selectedId,
        this.props.variant
      )
      const openIdsChanged =
        openIds.length !== this.state.openIds.length ||
        openIds.some((id, index) => id !== this.state.openIds[index])
      if (openIdsChanged) {
        setOpenSettingsTabs(
          this.props.strip,
          openIds,
          this.getPersistenceOptions()
        )
        this.setState({ openIds })
        return
      }
    }
    if (
      this.props.variant === 'browser' &&
      this.props.items.some(item => item.id === this.props.selectedId) &&
      !this.state.openIds.includes(this.props.selectedId)
    ) {
      const openIds = [...this.state.openIds, this.props.selectedId]
      setOpenSettingsTabs(
        this.props.strip,
        openIds,
        this.getPersistenceOptions()
      )
      this.setState({ openIds })
      return
    }
    if (
      prevProps.items !== this.props.items ||
      prevProps.selectedId !== this.props.selectedId ||
      prevProps.variant !== this.props.variant ||
      prevProps.showNewTab !== this.props.showNewTab ||
      prevProps.items.length !== this.props.items.length ||
      prevState.openIds !== this.state.openIds ||
      prevProps.dockPosition !== this.props.dockPosition
    ) {
      this.scheduleMeasure()
    }
  }

  public componentWillUnmount() {
    if (this.measureHandle !== null) {
      cancelAnimationFrame(this.measureHandle)
      this.measureHandle = null
    }
    this.resizeObserver?.disconnect()
  }

  /**
   * Measure after the frame paints.
   *
   * Measuring inside the resize callback would read a layout this same callback
   * is about to invalidate, and setting state from it synchronously is how a
   * ResizeObserver loop starts.
   */
  private scheduleMeasure() {
    if (this.measureHandle !== null) {
      return
    }
    this.measureHandle = requestAnimationFrame(() => {
      this.measureHandle = null
      this.measure()
    })
  }

  private measure() {
    const list = this.list
    if (list === null) {
      return
    }

    const port = list.getBoundingClientRect()
    const overflowIds: Array<string> = []

    for (const [id, row] of this.rowRefs) {
      const box =
        this.props.variant === 'browser'
          ? (row.parentElement ?? row).getBoundingClientRect()
          : row.getBoundingClientRect()
      // A row counts as reachable only when it is wholly inside the scrollport.
      // A half-visible row is exactly the state that made the list look
      // finished when it was not.
      const outside = this.isHorizontal
        ? box.left < port.left - 1 || box.right > port.right + 1
        : box.top < port.top - 1 || box.bottom > port.bottom + 1
      if (outside) {
        overflowIds.push(id)
      }
    }

    const changed =
      overflowIds.length !== this.state.overflowIds.length ||
      overflowIds.some((id, i) => this.state.overflowIds[i] !== id)

    if (changed) {
      this.setState({ overflowIds })
    }
  }

  private onListRef = (list: HTMLDivElement | null) => {
    if (this.resizeObserver !== undefined) {
      this.resizeObserver.disconnect()
      if (list !== null) {
        this.resizeObserver.observe(list)
      }
    }
    this.list = list
  }

  /**
   * A stable ref callback per page id.
   *
   * Cached rather than written inline: a fresh closure each render makes React
   * detach and reattach every row's ref on every render, which for this
   * component means the measurement map empties and refills underneath the
   * observer that reads it.
   */
  private getRowRef(id: string) {
    let ref = this.rowRefCallbacks.get(id)
    if (ref === undefined) {
      ref = (row: HTMLButtonElement | null) => {
        if (row === null) {
          this.rowRefs.delete(id)
        } else {
          this.rowRefs.set(id, row)
        }
      }
      this.rowRefCallbacks.set(id, ref)
    }
    return ref
  }

  private get allOrdered() {
    return orderSettingsTabs(
      this.props.allItems ?? this.props.items,
      this.state.pinnedIds
    )
  }

  private get visibleOrdered() {
    return orderSettingsTabs(this.props.items, this.state.pinnedIds)
  }

  private getTabPanelId(item: ISettingsTabItem): string | undefined {
    return (
      this.props.getTabPanelId?.(item.id) ??
      (item.domId === undefined ? undefined : `${item.domId}-panel`)
    )
  }

  private getTabId(item: ISettingsTabItem): string {
    return (
      item.domId ??
      this.props.getTabDomId?.(item.id) ??
      `settings-${this.props.strip}-tab-${item.id.replace(
        /[^A-Za-z0-9_-]/g,
        '-'
      )}`
    )
  }

  private get ordered() {
    const ordered = this.visibleOrdered
    if (this.props.variant !== 'browser') {
      return ordered
    }
    const open = new Set(this.state.openIds)
    const filtered = ordered.ordered.filter(item => open.has(item.id))
    const pinnedIds = new Set(this.state.pinnedIds)
    let pinnedCount = 0
    for (const item of filtered) {
      if (!pinnedIds.has(item.id)) {
        break
      }
      pinnedCount++
    }
    return { ordered: filtered, pinnedCount }
  }

  private get dockPosition(): SettingsTabDockPosition {
    return (
      this.props.dockPosition ??
      (this.props.variant === 'browser'
        ? 'top'
        : DefaultSettingsTabDockPosition)
    )
  }

  private get isHorizontal(): boolean {
    return this.dockPosition === 'top' || this.dockPosition === 'bottom'
  }

  private onRowClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled !== true) {
      this.props.onSelect(event.currentTarget.value)
    }
  }

  private onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    const horizontal = this.isHorizontal
    const validKeys = horizontal
      ? ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      : ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!validKeys.includes(event.key)) {
      return
    }

    const { ordered } = this.ordered
    const index = ordered.findIndex(
      item => item.id === event.currentTarget.value
    )
    if (index === -1) {
      return
    }

    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? ordered.length - 1
        : (index +
            (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) +
            ordered.length) %
          ordered.length
    const next = ordered[nextIndex]
    this.props.onSelect(next.id)
    this.rowRefs.get(next.id)?.focus()
    event.preventDefault()
  }

  private onRowContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    event.preventDefault()
    const id = event.currentTarget.value
    const pinned = this.state.pinnedIds.includes(id)
    const item = (this.props.allItems ?? this.props.items).find(
      item => item.id === id
    )
    const label =
      item?.accessibleLabel ?? item?.searchText ?? event.currentTarget.value
    const items: ReadonlyArray<IMenuItem> = [
      {
        label: pinned
          ? this.props.accessibleLabels?.unpinTab?.(label) ?? `Unpin ${label}`
          : this.props.accessibleLabels?.pinTab?.(label) ?? `Pin ${label}`,
        action: () => {
          // A menu item can outlive the disabled transition that opened it.
          // Re-check at execution time so a queued click cannot mutate state
          // while the owning dialog is busy.
          if (this.props.disabled === true) {
            return
          }
          const persistenceOptions = this.getPersistenceOptions()
          toggleSettingsTabPin(this.props.strip, id, persistenceOptions)
          this.setState({
            pinnedIds: getPinnedSettingsTabs(
              this.props.strip,
              persistenceOptions
            ),
          })
        },
      },
    ]
    showContextualMenu(items)
  }

  private onOpenOverflow = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'overflow',
    })
  }

  private onOpenSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({ pickerAnchor: event.currentTarget, pickerScope: 'all' })
  }

  private onOpenNewTab = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({ pickerAnchor: event.currentTarget, pickerScope: 'new' })
  }

  private onPickerClose = () => {
    const anchor = this.state.pickerAnchor
    this.setState({ pickerAnchor: null, pickerScope: null }, () => {
      if (anchor !== null && anchor.isConnected) {
        anchor.focus()
      }
    })
  }

  private onPickerSelect = (id: string) => {
    if (this.props.disabled === true) {
      return
    }
    const openIds =
      this.props.variant === 'browser' && !this.state.openIds.includes(id)
        ? [...this.state.openIds, id]
        : this.state.openIds
    if (openIds !== this.state.openIds) {
      setOpenSettingsTabs(
        this.props.strip,
        openIds,
        this.getPersistenceOptions()
      )
    }
    this.setState({ pickerAnchor: null, pickerScope: null, openIds }, () => {
      const row = this.rowRefs.get(id)
      row?.focus()
      if (typeof row?.scrollIntoView === 'function') {
        row.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }
      this.scheduleMeasure()
    })
    this.props.onSelect(id)
  }

  private onCloseTab = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (this.props.disabled === true || this.props.variant !== 'browser') {
      return
    }

    const id = event.currentTarget.value
    const { ordered } = this.ordered
    if (ordered.length <= 1 || !this.state.openIds.includes(id)) {
      return
    }

    const index = ordered.findIndex(item => item.id === id)
    const next = ordered[(index + 1) % ordered.length]
    const openIds = this.state.openIds.filter(openId => openId !== id)
    if (this.props.selectedId === id) {
      // Change the controlled selection in the same event as the close. If we
      // let the child render one frame with its selected id already closed,
      // componentDidUpdate quite correctly reopens that id as a safety net.
      this.props.onSelect(next.id)
    }
    setOpenSettingsTabs(this.props.strip, openIds, this.getPersistenceOptions())
    this.setState({ openIds }, () => {
      const row = this.rowRefs.get(next.id)
      row?.focus()
      if (typeof row?.scrollIntoView === 'function') {
        row.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }
      this.scheduleMeasure()
    })
  }

  private onBrowserTabsScroll = () => this.scheduleMeasure()

  private renderPicker() {
    const { pickerAnchor, pickerScope } = this.state
    if (pickerAnchor === null || pickerScope === null) {
      return null
    }

    const { ordered } = this.allOrdered
    const items =
      pickerScope === 'overflow'
        ? ordered.filter(item => this.state.overflowIds.includes(item.id))
        : pickerScope === 'new'
        ? ordered.filter(item => !this.state.openIds.includes(item.id))
        : ordered

    return (
      <SettingsTabPickerPopover
        items={items}
        selectedId={this.props.selectedId}
        anchor={pickerAnchor}
        surfaceId={`${this.props.strip}-tabs`}
        title={this.props.title}
        onSelect={this.onPickerSelect}
        onClose={this.onPickerClose}
        pickerId={`settings-${this.props.strip}-tab-picker`}
        accessibleLabels={this.props.accessibleLabels}
      />
    )
  }

  private renderActions() {
    const overflowCount = this.state.overflowIds.length

    if (overflowCount === 0 && this.props.showSearch !== true) {
      return null
    }

    return (
      <div className="settings-tab-strip-actions">
        {this.props.showSearch === true && (
          <button
            type="button"
            className="settings-tab-strip-action"
            onClick={this.onOpenSearch}
            aria-label={
              this.props.accessibleLabels?.search ??
              `Search ${this.props.title}`
            }
            disabled={this.props.disabled}
          >
            <MaterialSymbol name="search" />
            <span>Search</span>
          </button>
        )}
        {overflowCount > 0 && (
          <button
            type="button"
            className="settings-tab-strip-action overflow"
            onClick={this.onOpenOverflow}
            aria-label={
              this.props.accessibleLabels?.morePages?.(overflowCount) ??
              `${overflowCount} more settings pages`
            }
            disabled={this.props.disabled}
          >
            <MaterialSymbol name="more_horiz" />
            <span>{overflowCount} more</span>
          </button>
        )}
      </div>
    )
  }

  private renderBrowser() {
    const { ordered, pinnedCount } = this.ordered
    const { ordered: allItems } = this.allOrdered
    const { selectedId, disabled } = this.props
    const showNewTab = this.props.showNewTab !== false
    const hasClosedPage = allItems.some(
      item => !this.state.openIds.includes(item.id)
    )
    const openNewTabLabel =
      this.props.accessibleLabels?.openNewTab ??
      `Open a ${this.props.title} page in a new tab`
    const allPagesOpenLabel =
      this.props.accessibleLabels?.allPagesOpen ??
      `All ${this.props.title} pages are already open`
    const searchLabel =
      this.props.accessibleLabels?.search ?? `Search ${this.props.title}`
    const tabListLabel =
      this.props.accessibleLabels?.tabList ?? this.props.title

    const orientation = this.isHorizontal ? 'horizontal' : 'vertical'

    return (
      <div
        className="settings-tab-strip settings-tab-strip-browser"
        data-settings-tab-dock-position={this.dockPosition}
        data-settings-tab-dock-orientation={orientation}
      >
        <div
          className="settings-browser-tabs"
          ref={this.onListRef}
          onScroll={this.onBrowserTabsScroll}
        >
          <div
            className="settings-browser-tablist"
            role="tablist"
            aria-label={tabListLabel}
            aria-orientation={orientation}
            aria-owns={ordered.map(item => this.getTabId(item)).join(' ')}
          />
          <div className="settings-browser-tab-items">
            {ordered.map((item, index) => {
              const selected = item.id === selectedId
              return (
                <div
                  key={item.id}
                  className={classNames('settings-browser-tab', {
                    active: selected,
                    pinned: index < pinnedCount,
                  })}
                >
                  <button
                    value={item.id}
                    ref={this.getRowRef(item.id)}
                    id={this.getTabId(item)}
                    data-dm-feature={item.isFeature === true || undefined}
                    data-settings-no-match={
                      item.noSearchMatch === true || undefined
                    }
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={
                      selected ? this.getTabPanelId(item) : undefined
                    }
                    aria-label={item.accessibleLabel ?? item.searchText}
                    tabIndex={selected ? 0 : -1}
                    disabled={disabled}
                    aria-disabled={disabled ? 'true' : undefined}
                    className="settings-browser-tab-select"
                    onClick={this.onRowClick}
                    onKeyDown={this.onRowKeyDown}
                    onContextMenu={this.onRowContextMenu}
                  >
                    {item.icon}
                    <TooltippedContent
                      tagName="span"
                      className="settings-browser-tab-title"
                      tooltip={item.accessibleLabel ?? item.searchText}
                      onlyWhenOverflowed={true}
                    >
                      {item.label}
                    </TooltippedContent>
                    {item.badge}
                    {index < pinnedCount && (
                      <MaterialSymbol
                        name="push_pin"
                        className="settings-browser-tab-pin"
                      />
                    )}
                  </button>
                  {ordered.length > 1 && (
                    <button
                      type="button"
                      value={item.id}
                      className="settings-browser-tab-close"
                      disabled={disabled}
                      aria-label={
                        this.props.accessibleLabels?.closeTab?.(
                          item.accessibleLabel ?? item.searchText
                        ) ?? `Close ${item.searchText} tab`
                      }
                      onClick={this.onCloseTab}
                    >
                      <MaterialSymbol name="close" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="settings-browser-tab-actions">
          <button
            type="button"
            className="settings-browser-tab-action search"
            aria-label={searchLabel}
            aria-haspopup="dialog"
            aria-expanded={this.state.pickerScope === 'all'}
            aria-controls={`settings-${this.props.strip}-tab-picker`}
            disabled={disabled}
            onClick={this.onOpenSearch}
          >
            <MaterialSymbol name="search" />
          </button>
          {showNewTab && (
            <button
              type="button"
              className="settings-browser-tab-action"
              aria-label={openNewTabLabel}
              title={!hasClosedPage ? allPagesOpenLabel : undefined}
              aria-haspopup="dialog"
              aria-expanded={this.state.pickerScope === 'new'}
              aria-controls={`settings-${this.props.strip}-tab-picker`}
              disabled={disabled || !hasClosedPage}
              onClick={this.onOpenNewTab}
            >
              <MaterialSymbol name="add" />
            </button>
          )}
          {this.state.overflowIds.length > 0 && (
            <button
              type="button"
              className="settings-browser-tab-action overflow"
              aria-label={
                this.props.accessibleLabels?.morePages?.(
                  this.state.overflowIds.length
                ) ??
                `${this.state.overflowIds.length} more ${this.props.title} pages`
              }
              aria-haspopup="dialog"
              aria-expanded={this.state.pickerScope === 'overflow'}
              aria-controls={`settings-${this.props.strip}-tab-picker`}
              disabled={disabled}
              onClick={this.onOpenOverflow}
            >
              <MaterialSymbol name="more_horiz" />
              <span>{this.state.overflowIds.length}</span>
            </button>
          )}
        </div>
        {this.renderPicker()}
      </div>
    )
  }

  public render() {
    if (this.props.variant === 'browser') {
      return this.renderBrowser()
    }

    const { ordered, pinnedCount } = this.ordered
    const { selectedId, disabled } = this.props
    const orientation = this.isHorizontal ? 'horizontal' : 'vertical'

    return (
      <div
        className="settings-tab-strip"
        data-settings-tab-dock-position={this.dockPosition}
        data-settings-tab-dock-orientation={orientation}
      >
        <div
          className="settings-tab-strip-list"
          role="tablist"
          aria-orientation={orientation}
          ref={this.onListRef}
        >
          {ordered.map((item, index) => {
            const selected = item.id === selectedId
            return (
              <button
                key={item.id}
                value={item.id}
                ref={this.getRowRef(item.id)}
                id={item.domId ?? this.props.getTabDomId?.(item.id)}
                data-dm-feature={item.isFeature === true || undefined}
                data-settings-no-match={
                  item.noSearchMatch === true || undefined
                }
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? this.getTabPanelId(item) : undefined}
                tabIndex={selected ? undefined : -1}
                disabled={disabled}
                aria-disabled={disabled ? 'true' : undefined}
                className={classNames('settings-tab-strip-item', {
                  selected,
                  pinned: index < pinnedCount,
                })}
                onClick={this.onRowClick}
                onKeyDown={this.onRowKeyDown}
                onContextMenu={this.onRowContextMenu}
              >
                {item.icon}
                <span className="settings-tab-strip-label">{item.label}</span>
                {item.badge}
                {index < pinnedCount && (
                  <MaterialSymbol
                    name="push_pin"
                    className="settings-tab-strip-pin"
                  />
                )}
              </button>
            )
          })}
        </div>
        {this.renderActions()}
        {this.renderPicker()}
      </div>
    )
  }
}
