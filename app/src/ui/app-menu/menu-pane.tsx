import * as React from 'react'
import classNames from 'classnames'

import {
  ClickSource,
  findLastSelectableRow,
  findNextSelectableRow,
  IHoverSource,
  IKeyboardSource,
  IMouseClickSource,
  SelectionSource,
} from '../lib/list'
import {
  MenuItem,
  itemIsSelectable,
  findItemByAccessKey,
} from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'
import { assertNever } from '../../lib/fatal-error'

/**
 * The item to select when the user types `char`, searching from just after the
 * current selection and wrapping around.
 *
 * `selectedIndex` is the index of the selected item, or -1 when nothing is
 * selected. Returns -1 when no item starts with that character.
 *
 * Searching from the wrong place is not harmless: the search used to start two
 * rows past the selection rather than one, so the item directly below the
 * selection was skipped and repeated presses of the same letter could never
 * reach it.
 */
export function findByFirstCharacter(
  firstCharacters: ReadonlyArray<string>,
  char: string,
  selectedIndex: number
): number {
  const start =
    selectedIndex + 1 >= firstCharacters.length ? 0 : selectedIndex + 1
  const after = firstCharacters.indexOf(char, start)
  return after === -1 ? firstCharacters.indexOf(char, 0) : after
}

interface IMenuPaneProps {
  /**
   * An optional classname which will be appended to the 'menu-pane' class
   */
  readonly className?: string

  /**
   * The current Menu pane depth, starts at zero and increments by one for each
   * open submenu.
   */
  readonly depth: number

  /**
   * All items available in the current menu. Note that this includes disabled
   * menu items as well as invisible ones. This list is filtered before
   * rendering.
   */
  readonly items: ReadonlyArray<MenuItem>

  /**
   * The currently selected item in the menu or undefined if no item is
   * selected.
   */
  readonly selectedItem?: MenuItem

  /**
   * A callback for when a selectable menu item was clicked by a pointer device
   * or when the Enter or Space key is pressed on a selected item. The source
   * parameter can be used to determine whether the click is a result of a
   * pointer device or keyboard.
   */
  readonly onItemClicked: (
    depth: number,
    item: MenuItem,
    source: ClickSource
  ) => void

  /**
   * Called when the user presses down on a key while focused on, or within, the
   * menu pane. Consumers should inspect isDefaultPrevented to determine whether
   * the event was handled by the menu pane or not.
   */
  readonly onKeyDown?: (
    depth: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void

  /**
   * A callback for when the MenuPane selection changes (i.e. a new menu item is selected).
   */
  readonly onSelectionChanged: (
    depth: number,
    item: MenuItem,
    source: SelectionSource
  ) => void

  /** Callback for when the mouse enters the menu pane component */
  readonly onMouseEnter?: (depth: number) => void

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  readonly enableAccessKeyNavigation?: boolean

  /**
   * Called to deselect the currently selected menu item (if any). This
   * will be called when the user's pointer device leaves a menu item.
   */
  readonly onClearSelection: (depth: number) => void

  /** The id of the element that serves as the menu's accessibility label */
  readonly ariaLabelledby?: string

  /** Whether we move focus to the next menu item with a label that starts with
   * the typed character if such an menu item exists. */
  readonly allowFirstCharacterNavigation?: boolean

  readonly renderLabel?: (item: MenuItem) => JSX.Element | undefined

  /** Optional callback for capturing a ref to the menu pane element */
  readonly onRef?: (depth: number, element: HTMLDivElement | null) => void
}

export class MenuPane extends React.Component<IMenuPaneProps> {
  private onMenuPaneRef = (element: HTMLDivElement | null) => {
    this.props.onRef?.(this.props.depth, element)
  }

  private onRowClick = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (item.type !== 'separator' && item.enabled) {
      const source: IMouseClickSource = { kind: 'mouseclick', event }
      this.props.onItemClicked(this.props.depth, item, source)
    }
  }

  private tryMoveSelection(
    direction: 'up' | 'down' | 'first' | 'last',
    source: ClickSource
  ) {
    const { items, selectedItem } = this.props
    const row = selectedItem ? items.indexOf(selectedItem) : -1
    const count = items.length
    const selectable = (ix: number) => items[ix] && itemIsSelectable(items[ix])

    let ix: number | null = null

    if (direction === 'up' || direction === 'down') {
      ix = findNextSelectableRow(count, { direction, row }, selectable)
    } else if (direction === 'first' || direction === 'last') {
      const d = direction === 'first' ? 'up' : 'down'
      ix = findLastSelectableRow(d, count, selectable)
    }

    if (ix !== null && items[ix] !== undefined) {
      this.props.onSelectionChanged(this.props.depth, items[ix], source)
      return true
    }

    return false
  }

  private tryMoveSelectionByFirstCharacter(key: string, source: ClickSource) {
    if (
      key.length > 1 ||
      !isPrintableCharacterKey(key) ||
      !this.props.allowFirstCharacterNavigation
    ) {
      return
    }
    const { items, selectedItem } = this.props
    const char = key.toLowerCase()
    const firstChars = items.map(v =>
      v.type === 'separator' ? '' : (v.label.trim().at(0) ?? '').toLowerCase()
    )

    const ix = findByFirstCharacter(
      firstChars,
      char,
      selectedItem === undefined ? -1 : items.indexOf(selectedItem)
    )

    if (ix >= 0 && items[ix] !== undefined) {
      this.props.onSelectionChanged(this.props.depth, items[ix], source)
      return true
    }

    return false
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return
    }

    // Modifier keys are handled elsewhere, we only care about letters and symbols
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }

    const source: IKeyboardSource = { kind: 'keyboard', event }
    const { selectedItem } = this.props
    const { key } = event

    if (isSupportedKey(key)) {
      event.preventDefault()

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        this.tryMoveSelection(key === 'ArrowUp' ? 'up' : 'down', source)
      } else if (key === 'Home' || key === 'End') {
        const direction = key === 'Home' ? 'first' : 'last'
        this.tryMoveSelection(direction, source)
      } else if (key === 'Enter' || key === ' ') {
        if (selectedItem !== undefined) {
          this.props.onItemClicked(this.props.depth, selectedItem, source)
        }
      } else {
        assertNever(key, 'Unsupported key')
      }
    }

    this.tryMoveSelectionByFirstCharacter(key, source)

    // If we weren't opened with the Alt key we ignore key presses other than
    // arrow keys and Enter/Space etc.
    if (this.props.enableAccessKeyNavigation) {
      // At this point the list will already have intercepted any arrow keys
      // and the list items themselves will have caught Enter/Space
      const item = findItemByAccessKey(event.key, this.props.items)
      if (item && itemIsSelectable(item)) {
        event.preventDefault()
        this.props.onSelectionChanged(this.props.depth, item, {
          kind: 'keyboard',
          event: event,
        })
        this.props.onItemClicked(this.props.depth, item, {
          kind: 'keyboard',
          event: event,
        })
      }
    }

    this.props.onKeyDown?.(this.props.depth, event)
  }

  private onMouseEnter = (event: React.MouseEvent<any>) => {
    this.props.onMouseEnter?.(this.props.depth)
  }

  private onRowMouseEnter = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (itemIsSelectable(item)) {
      const source: IHoverSource = { kind: 'hover', event }
      this.props.onSelectionChanged(this.props.depth, item, source)
    }
  }

  private onRowMouseLeave = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (this.props.selectedItem === item) {
      this.props.onClearSelection(this.props.depth)
    }
  }

  public render(): JSX.Element {
    const className = classNames('menu-pane', this.props.className)

    return (
      /**
       * This a11y linter is a false-positive as the mousedown and keydown
       * listeners facilitate navigating the menu with the keyboard.
       */
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        ref={this.onMenuPaneRef}
        className={className}
        onMouseEnter={this.onMouseEnter}
        onKeyDown={this.onKeyDown}
        tabIndex={-1}
        role="menu"
        aria-labelledby={this.props.ariaLabelledby}
      >
        {this.props.items
          .filter(x => x.visible)
          .map((item, ix) => (
            <MenuListItem
              key={ix + item.id}
              item={item}
              highlightAccessKey={this.props.enableAccessKeyNavigation === true}
              selected={item.id === this.props.selectedItem?.id}
              onMouseEnter={this.onRowMouseEnter}
              onMouseLeave={this.onRowMouseLeave}
              onClick={this.onRowClick}
              renderLabel={this.props.renderLabel}
              focusOnSelection={true}
            />
          ))}
      </div>
    )
  }
}

const supportedKeys = [
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Enter',
  ' ',
] as const
const isSupportedKey = (key: string): key is typeof supportedKeys[number] =>
  (supportedKeys as readonly string[]).includes(key)

const isPrintableCharacterKey = (key: string) =>
  key.length === 1 && key.match(/\S/)
