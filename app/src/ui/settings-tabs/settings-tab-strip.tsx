import * as React from 'react'
import classNames from 'classnames'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { SettingsTabPickerPopover } from './settings-tab-picker-popover'
import {
  getPinnedSettingsTabs,
  ISettingsTabItem,
  orderSettingsTabs,
  SettingsTabStripId,
  toggleSettingsTabPin,
} from './settings-tab-model'

interface ISettingsTabStripProps {
  /** Which strip this is. Scopes the pins and the search surface id. */
  readonly strip: SettingsTabStripId
  /** Human name for the strip, used in the search field and menu wording. */
  readonly title: string
  /** Every page, in the dialog's declared order. */
  readonly items: ReadonlyArray<ISettingsTabItem>
  readonly selectedId: string
  readonly onSelect: (id: string) => void
  /** Blocks navigation while the dialog owns a mutation. */
  readonly disabled?: boolean

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
}

interface ISettingsTabStripState {
  readonly pinnedIds: ReadonlyArray<string>
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
  readonly pickerScope: 'overflow' | 'all' | null
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
    this.state = {
      pinnedIds: getPinnedSettingsTabs(props.strip),
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

  public componentDidMount() {
    this.scheduleMeasure()
  }

  public componentDidUpdate(prevProps: ISettingsTabStripProps) {
    if (
      prevProps.items !== this.props.items ||
      prevProps.selectedId !== this.props.selectedId
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
      const box = row.getBoundingClientRect()
      // A row counts as reachable only when it is wholly inside the scrollport.
      // A half-visible row is exactly the state that made the list look
      // finished when it was not.
      if (box.top < port.top - 1 || box.bottom > port.bottom + 1) {
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

  private get ordered() {
    return orderSettingsTabs(this.props.items, this.state.pinnedIds)
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
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    const { ordered } = this.ordered
    const index = ordered.findIndex(
      item => item.id === event.currentTarget.value
    )
    if (index === -1) {
      return
    }

    const delta = event.key === 'ArrowDown' ? 1 : -1
    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const next = ordered[(index + delta + ordered.length) % ordered.length]
    this.props.onSelect(next.id)
    this.rowRefs.get(next.id)?.focus()
    event.preventDefault()
  }

  private onRowContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const id = event.currentTarget.value
    const pinned = this.state.pinnedIds.includes(id)
    const items: ReadonlyArray<IMenuItem> = [
      {
        label: pinned ? 'Unpin page' : 'Pin page',
        action: () => {
          toggleSettingsTabPin(this.props.strip, id)
          this.setState({ pinnedIds: getPinnedSettingsTabs(this.props.strip) })
        },
      },
    ]
    showContextualMenu(items)
  }

  private onOpenOverflow = (event: React.MouseEvent<HTMLButtonElement>) =>
    this.setState({
      pickerAnchor: event.currentTarget,
      pickerScope: 'overflow',
    })

  private onOpenSearch = (event: React.MouseEvent<HTMLButtonElement>) =>
    this.setState({ pickerAnchor: event.currentTarget, pickerScope: 'all' })

  private onPickerClose = () =>
    this.setState({ pickerAnchor: null, pickerScope: null })

  private onPickerSelect = (id: string) => {
    this.setState({ pickerAnchor: null, pickerScope: null })
    this.props.onSelect(id)
    // Bring the chosen page into view; it is very often one that did not fit.
    this.rowRefs.get(id)?.scrollIntoView({ block: 'nearest' })
  }

  private renderPicker() {
    const { pickerAnchor, pickerScope } = this.state
    if (pickerAnchor === null || pickerScope === null) {
      return null
    }

    const { ordered } = this.ordered
    const items =
      pickerScope === 'overflow'
        ? ordered.filter(item => this.state.overflowIds.includes(item.id))
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
            aria-label={`Search ${this.props.title}`}
          >
            <Octicon symbol={octicons.search} />
            <span>Search</span>
          </button>
        )}
        {overflowCount > 0 && (
          <button
            type="button"
            className="settings-tab-strip-action overflow"
            onClick={this.onOpenOverflow}
            aria-label={`${overflowCount} more settings pages`}
          >
            <Octicon symbol={octicons.kebabHorizontal} />
            <span>{overflowCount} more</span>
          </button>
        )}
      </div>
    )
  }

  public render() {
    const { ordered, pinnedCount } = this.ordered
    const { selectedId, disabled } = this.props

    return (
      <div className="settings-tab-strip">
        <div
          className="settings-tab-strip-list"
          role="tablist"
          aria-orientation="vertical"
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
                  <Octicon
                    className="settings-tab-strip-pin"
                    symbol={octicons.pin}
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
