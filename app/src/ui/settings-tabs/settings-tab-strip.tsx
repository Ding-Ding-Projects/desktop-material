import * as React from 'react'
import classNames from 'classnames'

import { TooltippedContent } from '../lib/tooltipped-content'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { SettingsTabPickerPopover } from './settings-tab-picker-popover'
import { getPersistedLanguageMode, translate } from '../../lib/i18n'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import {
  DefaultSettingsTabDockPosition,
  SettingsTabPersistenceVersion,
  getSettingsTabLayout,
  getSettingsTabGroupMembership,
  getPinnedSettingsTabs,
  getOpenSettingsTabs,
  ISettingsTabPersistenceOptions,
  ISettingsTabItem,
  orderSettingsTabs,
  setSettingsTabGroupCollapsed,
  setSettingsTabGroupMembership,
  setSettingsTabLayout,
  reorderSettingsTabPinnedOrder,
  reorderSettingsTabGroup,
  ISettingsTabGroup,
  normalizeSettingsTabGroupName,
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

const UngroupedSettingsTabOptionId = '__ungrouped__'

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
  readonly pickerScope:
    | 'overflow'
    | 'all'
    | 'current'
    | 'new'
    | 'group'
    | 'groups'
    | null
  /** Complete user ordering, independent of the currently filtered view. */
  readonly orderIds: ReadonlyArray<string>
  readonly groups: ReadonlyArray<ISettingsTabGroup>
  readonly groupOrder: ReadonlyArray<string>
  readonly membership: Readonly<Record<string, string | null>>
  readonly groupPickerId: string | null
  readonly moveTabId: string | null
  readonly revealedGroupId: string | null
  readonly groupEditorAnchor: HTMLElement | null
  readonly groupEditorId: string | null
  readonly groupEditorMode: 'create' | 'rename' | null
  readonly groupEditorName: string
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
    const layout = getSettingsTabLayout(props.strip, {
      ...persistenceOptions,
      allowedIds: declaredItems.map(item => item.id),
    })
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
      pinnedIds: layout.pinnedIds,
      openIds,
      orderIds: this.reconcileOrderIds(
        declaredItems.map(item => item.id),
        layout.order
      ),
      groups: layout.groups,
      groupOrder: layout.groupOrder,
      membership:
        layout.membership ??
        getSettingsTabGroupMembership(props.strip, persistenceOptions),
      overflowIds: [],
      pickerAnchor: null,
      pickerScope: null,
      groupPickerId: null,
      moveTabId: null,
      revealedGroupId:
        layout.membership[props.selectedId] !== undefined &&
        layout.groups.some(
          group =>
            group.id === layout.membership[props.selectedId] &&
            group.isCollapsed === true
        )
          ? layout.membership[props.selectedId]
          : null,
      groupEditorAnchor: null,
      groupEditorId: null,
      groupEditorMode: null,
      groupEditorName: '',
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

  private reconcileOrderIds(
    declaredIds: ReadonlyArray<string>,
    persistedIds: ReadonlyArray<string>
  ): ReadonlyArray<string> {
    const declared = new Set(declaredIds)
    const seen = new Set<string>()
    const order: string[] = []
    for (const id of persistedIds) {
      if (declared.has(id) && !seen.has(id)) {
        seen.add(id)
        order.push(id)
      }
    }
    for (const id of declaredIds) {
      if (!seen.has(id)) {
        seen.add(id)
        order.push(id)
      }
    }
    return order
  }

  private persistLayout = (
    layout: Partial<{
      orderIds: ReadonlyArray<string>
      groups: ReadonlyArray<ISettingsTabGroup>
      groupOrder: ReadonlyArray<string>
      membership: Readonly<Record<string, string | null>>
    }>
  ) => {
    const options = this.getPersistenceOptions()
    setSettingsTabLayout(
      this.props.strip,
      {
        version: SettingsTabPersistenceVersion,
        order: layout.orderIds ?? this.state.orderIds,
        pinnedIds: this.state.pinnedIds,
        groups: layout.groups ?? this.state.groups,
        groupOrder: layout.groupOrder ?? this.state.groupOrder,
        membership: layout.membership ?? this.state.membership,
      },
      options
    )
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
      (this.state.pickerAnchor !== null ||
        this.state.groupEditorAnchor !== null)
    ) {
      this.setState({
        pickerAnchor: null,
        pickerScope: null,
        groupPickerId: null,
        moveTabId: null,
        groupEditorAnchor: null,
        groupEditorId: null,
        groupEditorMode: null,
        groupEditorName: '',
      })
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
      this.state.pinnedIds,
      this.state.orderIds
    )
  }

  private get visibleOrdered() {
    return orderSettingsTabs(
      this.props.items,
      this.state.pinnedIds,
      this.state.orderIds
    )
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

    const movingForward =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
    if (
      event.ctrlKey &&
      (movingForward || event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    ) {
      const delta = movingForward ? 1 : -1
      const targetIndex = Math.max(
        0,
        Math.min(index + delta, ordered.length - 1)
      )
      if (targetIndex !== index) {
        if (this.state.pinnedIds.includes(event.currentTarget.value)) {
          const pinnedIndex = this.state.pinnedIds.indexOf(
            event.currentTarget.value
          )
          const pinnedIds = reorderSettingsTabPinnedOrder(
            this.props.strip,
            event.currentTarget.value,
            pinnedIndex + delta,
            this.getPersistenceOptions()
          )
          this.setState({ pinnedIds })
          event.preventDefault()
          return
        }
        const orderIds = [...this.state.orderIds]
        const currentOrderIndex = orderIds.indexOf(event.currentTarget.value)
        if (currentOrderIndex >= 0) {
          orderIds.splice(currentOrderIndex, 1)
          const nextOrderIndex = Math.max(
            0,
            Math.min(currentOrderIndex + delta, orderIds.length)
          )
          orderIds.splice(nextOrderIndex, 0, event.currentTarget.value)
          this.persistLayout({ orderIds })
          this.setState({ orderIds }, () => this.scheduleMeasure())
        }
      }
      event.preventDefault()
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

  private onRowDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(
      'text/settings-tab-id',
      event.currentTarget.value
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  private onRowDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (event.dataTransfer.types.includes('text/settings-tab-id')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  private onRowDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.props.disabled === true) {
      return
    }
    const sourceId = event.dataTransfer.getData('text/settings-tab-id')
    const targetId = event.currentTarget.value
    if (sourceId.length === 0 || sourceId === targetId) {
      return
    }
    const orderIds = [...this.state.orderIds]
    const sourceIndex = orderIds.indexOf(sourceId)
    const targetIndex = orderIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) {
      return
    }
    orderIds.splice(sourceIndex, 1)
    orderIds.splice(
      Math.max(0, Math.min(targetIndex, orderIds.length)),
      0,
      sourceId
    )
    this.persistLayout({ orderIds })
    this.setState({ orderIds }, () => this.scheduleMeasure())
  }

  private onRowContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const languageMode = getPersistedLanguageMode()
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
    const items: Array<IMenuItem> = [
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
          const pinnedIds = getPinnedSettingsTabs(
            this.props.strip,
            persistenceOptions
          )
          setSettingsTabLayout(
            this.props.strip,
            {
              version: SettingsTabPersistenceVersion,
              order: this.state.orderIds,
              pinnedIds,
              groups: this.state.groups,
              groupOrder: this.state.groupOrder,
              membership: this.state.membership,
            },
            persistenceOptions
          )
          this.setState({ pinnedIds })
        },
      },
      {
        label: translate('settings.tabGroupCreate', languageMode),
        action: () => this.openGroupEditor('create', null, event.currentTarget),
      },
      {
        label: translate('settings.tabGroupMove', languageMode),
        action: () => this.openMoveGroupPicker(id),
      },
    ]
    showContextualMenu(items)
  }

  private openMoveGroupPicker = (tabId: string) => {
    const anchor = this.rowRefs.get(tabId)
    if (anchor === undefined || this.state.groups.length === 0) {
      return
    }
    this.setState({
      pickerAnchor: anchor,
      pickerScope: 'group',
      groupPickerId: null,
      moveTabId: tabId,
    })
  }

  private onOpenGroupSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true || this.state.groups.length === 0) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'groups',
      groupPickerId: null,
      moveTabId: null,
    })
  }

  private openGroupEditor = (
    mode: 'create' | 'rename',
    group: ISettingsTabGroup | null,
    anchor: HTMLElement
  ) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      groupEditorAnchor: anchor,
      groupEditorId: group?.id ?? null,
      groupEditorMode: mode,
      groupEditorName: group?.name ?? '',
    })
  }

  private onOpenCurrentStripSearch = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'current',
      groupPickerId: null,
      moveTabId: null,
    })
  }

  private closeGroupEditor = () => {
    const anchor = this.state.groupEditorAnchor
    this.setState(
      {
        groupEditorAnchor: null,
        groupEditorId: null,
        groupEditorMode: null,
        groupEditorName: '',
      },
      () => {
        if (anchor?.isConnected) {
          anchor.focus()
        }
      }
    )
  }

  private saveGroupEditor = () => {
    const name = normalizeSettingsTabGroupName(this.state.groupEditorName)
    if (name === null) {
      return
    }
    if (this.state.groupEditorMode === 'rename' && this.state.groupEditorId) {
      const groups = this.state.groups.map(group =>
        group.id === this.state.groupEditorId ? { ...group, name } : group
      )
      this.persistLayout({ groups })
      this.setState({ groups }, this.closeGroupEditor)
      return
    }
    if (this.state.groupEditorMode === 'create') {
      const id = `settings-group-${Date.now().toString(36)}`
      const group: ISettingsTabGroup = { id, name, color: 'blue' }
      const groups = [...this.state.groups, group]
      const groupOrder = [...this.state.groupOrder, id]
      this.persistLayout({ groups, groupOrder })
      this.setState({ groups, groupOrder }, this.closeGroupEditor)
    }
  }

  private moveTabToGroup = (tabId: string, groupId: string | null) => {
    if (this.props.disabled === true) {
      return
    }
    const membership = { ...this.state.membership, [tabId]: groupId }
    this.persistLayout({ membership })
    setSettingsTabGroupMembership(
      this.props.strip,
      tabId,
      groupId,
      this.getPersistenceOptions()
    )
    this.setState({ membership })
  }

  private onGroupContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    group: ISettingsTabGroup
  ) => {
    if (
      this.props.disabled === true ||
      (event.target as HTMLElement).closest('.settings-browser-tab-select') !==
        null
    ) {
      return
    }
    event.preventDefault()
    const languageMode = getPersistedLanguageMode()
    showContextualMenu([
      {
        label: translate(
          group.isCollapsed
            ? 'settings.tabGroupExpand'
            : 'settings.tabGroupCollapse',
          languageMode,
          { group: group.name }
        ),
        action: () => {
          const isCollapsed = group.isCollapsed !== true
          setSettingsTabGroupCollapsed(
            this.props.strip,
            group.id,
            isCollapsed,
            this.getPersistenceOptions()
          )
          const groups = this.state.groups.map(candidate =>
            candidate.id === group.id
              ? { ...candidate, isCollapsed }
              : candidate
          )
          this.persistLayout({ groups })
          this.setState({ groups })
        },
      },
      {
        label: translate('settings.tabGroupRenamePrompt', languageMode),
        action: () =>
          this.openGroupEditor('rename', group, event.currentTarget),
      },
      {
        label: translate('settings.tabGroupRemove', languageMode, {
          group: group.name,
        }),
        action: () => {
          const groups = this.state.groups.filter(
            candidate => candidate.id !== group.id
          )
          const groupOrder = this.state.groupOrder.filter(id => id !== group.id)
          const membership = Object.fromEntries(
            Object.entries(this.state.membership).map(([tabId, value]) => [
              tabId,
              value === group.id ? null : value,
            ])
          )
          this.persistLayout({ groups, groupOrder, membership })
          this.setState({ groups, groupOrder, membership })
        },
      },
    ])
  }

  private onGroupSearch = (
    event: React.MouseEvent<HTMLButtonElement>,
    groupId: string
  ) => {
    event.stopPropagation()
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'all',
      groupPickerId: groupId,
      moveTabId: null,
    })
  }

  private onGroupDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(
      'text/settings-tab-group-id',
      event.currentTarget
        .closest('[data-settings-tab-group-id]')
        ?.getAttribute('data-settings-tab-group-id') ?? ''
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  private onGroupDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    if (event.dataTransfer.types.includes('text/settings-tab-group-id')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  private onGroupDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.props.disabled === true) {
      return
    }
    const sourceId = event.dataTransfer.getData('text/settings-tab-group-id')
    const targetId = event.currentTarget
      .closest('[data-settings-tab-group-id]')
      ?.getAttribute('data-settings-tab-group-id')
    if (
      sourceId.length === 0 ||
      targetId === null ||
      targetId === undefined ||
      sourceId === targetId
    ) {
      return
    }
    const groupOrder = this.state.groupOrder.filter(id => id !== sourceId)
    const targetIndex = groupOrder.indexOf(targetId)
    if (targetIndex < 0) {
      return
    }
    groupOrder.splice(targetIndex, 0, sourceId)
    this.persistLayout({ groupOrder })
    this.setState({ groupOrder })
  }

  private onGroupKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    group: ISettingsTabGroup
  ) => {
    if (
      !event.ctrlKey ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      return
    }
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const index = this.state.groupOrder.indexOf(group.id)
    if (index < 0) {
      return
    }
    const groupOrder = reorderSettingsTabGroup(
      this.props.strip,
      group.id,
      index + delta,
      this.getPersistenceOptions()
    )
    this.setState({ groupOrder })
    event.preventDefault()
  }

  private onOpenOverflow = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'overflow',
      groupPickerId: null,
      moveTabId: null,
    })
  }

  private onOpenSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'all',
      groupPickerId: null,
      moveTabId: null,
    })
  }

  private onOpenNewTab = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.disabled === true) {
      return
    }
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'new',
      groupPickerId: null,
      moveTabId: null,
    })
  }

  private onPickerClose = () => {
    const anchor = this.state.pickerAnchor
    this.setState(
      {
        pickerAnchor: null,
        pickerScope: null,
        groupPickerId: null,
        moveTabId: null,
      },
      () => {
        if (anchor !== null && anchor.isConnected) {
          anchor.focus()
        }
      }
    )
  }

  private onPickerSelect = (id: string) => {
    if (this.props.disabled === true) {
      return
    }
    if (this.state.moveTabId !== null) {
      const tabId = this.state.moveTabId
      this.moveTabToGroup(
        tabId,
        id === UngroupedSettingsTabOptionId ? null : id
      )
      this.onPickerClose()
      return
    }
    if (this.state.pickerScope === 'groups') {
      this.setState(
        {
          revealedGroupId: id,
          pickerAnchor: null,
          pickerScope: null,
          groupPickerId: null,
          moveTabId: null,
        },
        () => {
          Array.from(
            this.list?.querySelectorAll<HTMLElement>(
              '.settings-browser-tab-group-toggle'
            ) ?? []
          )
            .find(
              element =>
                element
                  .closest('[data-settings-tab-group-id]')
                  ?.getAttribute('data-settings-tab-group-id') === id
            )
            ?.focus()
        }
      )
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
    const selectedGroupId = this.state.membership[id] ?? null
    const selectedGroup = this.state.groups.find(
      group => group.id === selectedGroupId
    )
    this.setState(
      {
        pickerAnchor: null,
        pickerScope: null,
        groupPickerId: null,
        moveTabId: null,
        revealedGroupId:
          selectedGroup?.isCollapsed === true ? selectedGroup.id : null,
        openIds,
      },
      () => {
        const row = this.rowRefs.get(id)
        row?.focus()
        if (typeof row?.scrollIntoView === 'function') {
          row.scrollIntoView({ inline: 'nearest', block: 'nearest' })
        }
        this.scheduleMeasure()
      }
    )
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
      pickerScope === 'group'
        ? [
            {
              id: UngroupedSettingsTabOptionId,
              label: translate(
                'settings.tabGroupMoveOut',
                getPersistedLanguageMode()
              ),
              searchText: translate(
                'settings.tabGroupMoveOut',
                getPersistedLanguageMode()
              ),
              accessibleLabel: translate(
                'settings.tabGroupMoveOut',
                getPersistedLanguageMode()
              ),
            },
            ...this.state.groups.map(group => ({
              id: group.id,
              label: group.name,
              searchText: group.name,
              accessibleLabel: group.name,
            })),
          ]
        : pickerScope === 'groups'
        ? this.state.groups.map(group => ({
            id: group.id,
            label: group.name,
            searchText: group.name,
            accessibleLabel: group.name,
          }))
        : this.state.groupPickerId !== null
        ? ordered.filter(
            item => this.state.membership[item.id] === this.state.groupPickerId
          )
        : pickerScope === 'overflow'
        ? ordered.filter(item => this.state.overflowIds.includes(item.id))
        : pickerScope === 'current'
        ? this.visibleOrdered.ordered
        : pickerScope === 'new'
        ? ordered.filter(item => !this.state.openIds.includes(item.id))
        : ordered

    return (
      <SettingsTabPickerPopover
        items={items}
        selectedId={this.props.selectedId}
        anchor={pickerAnchor}
        surfaceId={`${this.props.strip}-${
          pickerScope === 'current'
            ? 'current-strip'
            : this.props.variant === 'browser'
            ? 'master-tabs'
            : 'current-strip'
        }${
          pickerScope === 'group'
            ? '-move-group'
            : this.state.groupPickerId === null
            ? ''
            : `-group-${this.state.groupPickerId}`
        }`}
        title={
          this.state.groupPickerId === null
            ? this.props.title
            : this.state.groups.find(
                group => group.id === this.state.groupPickerId
              )?.name ?? this.props.title
        }
        onSelect={this.onPickerSelect}
        onClose={this.onPickerClose}
        pickerId={`settings-${this.props.strip}-tab-picker`}
        accessibleLabels={this.props.accessibleLabels}
      />
    )
  }

  private renderGroupEditor() {
    const { groupEditorAnchor, groupEditorMode, groupEditorName } = this.state
    if (groupEditorAnchor === null || groupEditorMode === null) {
      return null
    }
    const languageMode = getPersistedLanguageMode()
    const title = translate(
      groupEditorMode === 'create'
        ? 'settings.tabGroupNamePrompt'
        : 'settings.tabGroupRenamePrompt',
      languageMode
    )
    return (
      <Popover
        id={`settings-${this.props.strip}-group-editor`}
        anchor={groupEditorAnchor}
        anchorPosition={PopoverAnchorPosition.RightTop}
        decoration={PopoverDecoration.Balloon}
        onClickOutside={this.closeGroupEditor}
        ariaLabelledby={`settings-${this.props.strip}-group-editor-title`}
        className="settings-tab-group-editor"
      >
        <h2
          id={`settings-${this.props.strip}-group-editor-title`}
          className="settings-tab-group-editor-title"
        >
          {title}
        </h2>
        <input
          autoFocus={true}
          type="text"
          value={groupEditorName}
          aria-label={title}
          onChange={event =>
            this.setState({ groupEditorName: event.currentTarget.value })
          }
          onKeyDown={event => {
            if (event.key === 'Enter') {
              this.saveGroupEditor()
              event.preventDefault()
            } else if (event.key === 'Escape') {
              this.closeGroupEditor()
              event.preventDefault()
            }
          }}
        />
        <div className="settings-tab-group-editor-actions">
          <button type="button" onClick={this.closeGroupEditor}>
            {translate('tabs.close.cancel', languageMode)}
          </button>
          <button
            type="button"
            disabled={normalizeSettingsTabGroupName(groupEditorName) === null}
            onClick={this.saveGroupEditor}
          >
            {translate(
              groupEditorMode === 'create'
                ? 'repositoryGroups.createAction'
                : 'repositoryGroups.saveAction',
              languageMode
            )}
          </button>
        </div>
      </Popover>
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

  private onGroupToggle = (group: ISettingsTabGroup) => {
    if (this.props.disabled === true) {
      return
    }
    const isCollapsed = group.isCollapsed !== true
    setSettingsTabGroupCollapsed(
      this.props.strip,
      group.id,
      isCollapsed,
      this.getPersistenceOptions()
    )
    const groups = this.state.groups.map(candidate =>
      candidate.id === group.id ? { ...candidate, isCollapsed } : candidate
    )
    this.persistLayout({ groups })
    this.setState({ groups, revealedGroupId: null })
  }

  private renderBrowserTab(
    item: ISettingsTabItem,
    index: number,
    pinnedCount: number,
    totalCount: number,
    disabled: boolean
  ) {
    const selected = item.id === this.props.selectedId
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
          data-settings-no-match={item.noSearchMatch === true || undefined}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={selected ? this.getTabPanelId(item) : undefined}
          aria-label={item.accessibleLabel ?? item.searchText}
          tabIndex={selected ? 0 : -1}
          disabled={disabled}
          aria-disabled={disabled ? 'true' : undefined}
          className="settings-browser-tab-select"
          draggable={true}
          onClick={this.onRowClick}
          onKeyDown={this.onRowKeyDown}
          onContextMenu={this.onRowContextMenu}
          onDragStart={this.onRowDragStart}
          onDragOver={this.onRowDragOver}
          onDrop={this.onRowDrop}
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
              className="settings-browser-tab-pin"
              name="push_pin"
            />
          )}
        </button>
        {totalCount > 1 && (
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
  }

  private renderBrowserItems(
    ordered: ReadonlyArray<ISettingsTabItem>,
    pinnedCount: number,
    disabled: boolean
  ) {
    const languageMode = getPersistedLanguageMode()
    if (this.state.groups.length === 0) {
      return ordered.map((item, index) =>
        this.renderBrowserTab(
          item,
          index,
          pinnedCount,
          ordered.length,
          disabled
        )
      )
    }

    const groupsById = new Map(
      this.state.groups.map(group => [group.id, group])
    )
    const grouped = new Set<string>()
    let index = 0
    const output: React.ReactNode[] = []
    // Keep the protected pinned region physically first. Group blocks are
    // rendered only after it, so an unpinned grouped page can never displace a
    // pinned page from the first visible slots.
    for (const item of ordered.slice(0, pinnedCount)) {
      output.push(
        this.renderBrowserTab(
          item,
          index,
          pinnedCount,
          ordered.length,
          disabled
        )
      )
      index++
    }
    const unpinned = ordered.slice(pinnedCount)
    const orderedGroupIds = [
      ...this.state.groupOrder,
      ...this.state.groups
        .map(group => group.id)
        .filter(id => !this.state.groupOrder.includes(id)),
    ]
    for (const groupId of orderedGroupIds) {
      const group = groupsById.get(groupId)
      if (group === undefined) {
        continue
      }
      const members = unpinned.filter(item => {
        const belongs = this.state.membership[item.id] === group.id
        if (belongs) {
          grouped.add(item.id)
        }
        return belongs
      })
      const collapsed =
        group.isCollapsed === true && this.state.revealedGroupId !== group.id
      output.push(
        <div
          key={`group-${group.id}`}
          className={classNames('settings-browser-tab-group', { collapsed })}
          data-settings-tab-group-id={group.id}
          onContextMenu={event => this.onGroupContextMenu(event, group)}
        >
          <div className="settings-browser-tab-group-header">
            <button
              type="button"
              className="settings-browser-tab-group-toggle"
              draggable={true}
              disabled={disabled}
              aria-disabled={disabled ? 'true' : undefined}
              aria-expanded={!collapsed}
              aria-label={translate(
                collapsed
                  ? 'settings.tabGroupExpand'
                  : 'settings.tabGroupCollapse',
                languageMode,
                { group: group.name }
              )}
              onClick={() => this.onGroupToggle(group)}
              onKeyDown={event => this.onGroupKeyDown(event, group)}
              onDragStart={this.onGroupDragStart}
              onDragOver={this.onGroupDragOver}
              onDrop={this.onGroupDrop}
            >
              <MaterialSymbol
                name={
                  collapsed ? 'keyboard_arrow_right' : 'keyboard_arrow_down'
                }
              />
              <span>{group.name}</span>
              <span className="settings-browser-tab-group-count">
                {members.length}
              </span>
            </button>
            <button
              type="button"
              className="settings-browser-tab-group-search"
              aria-label={translate(
                'settings.tabGroupSearchTabs',
                languageMode,
                {
                  group: group.name,
                }
              )}
              aria-haspopup="dialog"
              disabled={disabled}
              aria-disabled={disabled ? 'true' : undefined}
              onClick={event => this.onGroupSearch(event, group.id)}
            >
              <MaterialSymbol name="search" />
            </button>
          </div>
          {!collapsed && members.length > 0 && (
            <div className="settings-browser-tab-group-items">
              {members.map(item => {
                const result = this.renderBrowserTab(
                  item,
                  index,
                  pinnedCount,
                  ordered.length,
                  disabled
                )
                index++
                return result
              })}
            </div>
          )}
          {members.length === 0 && (
            <p className="settings-browser-tab-group-empty" role="status">
              {translate('settings.tabGroupEmpty', languageMode)}
            </p>
          )}
        </div>
      )
    }
    // The pinned region above already rendered ordered.slice(0, pinnedCount),
    // and those items are never added to `grouped`. Walking `ordered` here
    // rendered every pinned tab a second time.
    for (const item of unpinned) {
      if (!grouped.has(item.id)) {
        output.push(
          this.renderBrowserTab(
            item,
            index,
            pinnedCount,
            ordered.length,
            disabled
          )
        )
        index++
      }
    }
    return output
  }

  private renderBrowser() {
    const { ordered, pinnedCount } = this.ordered
    const { ordered: allItems } = this.allOrdered
    const { disabled } = this.props
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
            {this.renderBrowserItems(ordered, pinnedCount, disabled === true)}
          </div>
        </div>
        <div className="settings-browser-tab-actions">
          <button
            type="button"
            className="settings-browser-tab-action current-search"
            aria-label={translate(
              'settings.tabGroupCurrentSearch',
              getPersistedLanguageMode()
            )}
            aria-haspopup="dialog"
            aria-expanded={this.state.pickerScope === 'current'}
            disabled={disabled}
            onClick={this.onOpenCurrentStripSearch}
          >
            <MaterialSymbol name="search" />
          </button>
          {this.state.groups.length > 0 && (
            <button
              type="button"
              className="settings-browser-tab-action group-search"
              aria-label={translate(
                'settings.tabGroupSearch',
                getPersistedLanguageMode()
              )}
              aria-haspopup="dialog"
              aria-expanded={this.state.pickerScope === 'groups'}
              disabled={disabled}
              onClick={this.onOpenGroupSearch}
            >
              <MaterialSymbol name="search" />
              <span>
                {translate(
                  'settings.tabGroupSearch',
                  getPersistedLanguageMode()
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            className="settings-browser-tab-action group-add"
            aria-label={translate(
              'settings.tabGroupCreate',
              getPersistedLanguageMode()
            )}
            disabled={disabled}
            onClick={event =>
              this.openGroupEditor('create', null, event.currentTarget)
            }
          >
            <MaterialSymbol name="add" />
          </button>
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
        {this.renderGroupEditor()}
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
                draggable={true}
                onClick={this.onRowClick}
                onKeyDown={this.onRowKeyDown}
                onContextMenu={this.onRowContextMenu}
                onDragStart={this.onRowDragStart}
                onDragOver={this.onRowDragOver}
                onDrop={this.onRowDrop}
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
