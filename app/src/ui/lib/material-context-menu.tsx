import * as React from 'react'
import * as ReactDOM from 'react-dom'
import classNames from 'classnames'
import { IMenuItem } from '../../lib/menu-item'
import { getLastPointerPosition } from '../../lib/context-menu-pointer'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from './filter-mode-control'
import { persistFilterMode, readPersistedFilterMode } from './filter-list-mode'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { friendlyAcceleratorText } from '../app-menu/menu-list-item'
import {
  getPersistedLanguageMode,
  translate,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import { roleAccelerator } from '../../lib/menu-accelerators'
import { MaterialSymbol } from './material-symbol'

/**
 * The Material Design in-app context menu.
 *
 * Renders IMenuItem lists as an M3 menu surface at the pointer instead of a
 * native OS popup: tokened colors, rounded container, optional per-action
 * icons, a type-to-filter bar, checkbox items, and one-level submenu
 * expansion. Resolves with the chosen item, or null when dismissed.
 */

/** The persistence id for the context-menu filter's mode. */
const ContextMenuFilterListId = 'material-context-menu'

/**
 * The search-surface id shared by the filter input, its filter-mode cluster and
 * the regex builder those open. One constant because the backdrop matches the
 * builder's overlay by this id, and a typo there would silently restore the
 * dismiss-on-click bug it exists to prevent.
 */
const ContextMenuSearchSurfaceId = 'material-context-menu'

/**
 * The items Electron's `editMenu` role stands for.
 *
 * The native menu expands that role itself; the in-app menu never did, so every
 * text field's context menu (`showContextualMenu([{ role: 'editMenu' }])` in
 * text-box, text-area and the autocompleting input) rendered as a single blank,
 * unclickable row. Expanding it here restores the actual commands — and they
 * are the items whose shortcuts a user is most likely to be looking up.
 */
function expandEditMenu(): ReadonlyArray<IMenuItem> {
  const languageMode = getPersistedLanguageMode()
  const label = (key: TranslationKey) => translate(key, languageMode)
  return [
    {
      label: label('contextMenu.cut'),
      role: 'cut',
      accelerator: roleAccelerator('cut'),
    },
    {
      label: label('contextMenu.copy'),
      role: 'copy',
      accelerator: roleAccelerator('copy'),
    },
    {
      label: label('contextMenu.paste'),
      role: 'paste',
      accelerator: roleAccelerator('paste'),
    },
    { type: 'separator' },
    {
      label: label('contextMenu.selectAll'),
      role: 'selectAll',
      accelerator: roleAccelerator('selectAll'),
    },
  ]
}

/**
 * Replaces composite roles with the items they stand for, leaving every other
 * item untouched. Submenus are expanded too, since a caller may nest an edit
 * menu inside one.
 */
export function expandRoleMenus(
  items: ReadonlyArray<IMenuItem>
): ReadonlyArray<IMenuItem> {
  const expanded = new Array<IMenuItem>()
  for (const item of items) {
    if (item.role === 'editMenu') {
      expanded.push(...expandEditMenu())
      continue
    }
    if (item.submenu !== undefined && item.submenu.length > 0) {
      expanded.push({
        ...item,
        submenu: expandRoleMenus(item.submenu) as ReadonlyArray<
          typeof item
        > as IMenuItem['submenu'],
      })
      continue
    }
    expanded.push(item)
  }
  return expanded
}

/**
 * The `aria-keyshortcuts` form of an Electron accelerator.
 *
 * ARIA names the keys in its own vocabulary ("Control+C", "Meta+C"), which is
 * not the string a user sees; the visible hint keeps the platform's symbols
 * while assistive technology gets the form it can announce correctly.
 */
export function ariaKeyShortcuts(accelerator: string): string {
  return accelerator
    .split('+')
    .map(part => {
      switch (part.toLowerCase()) {
        case 'cmdorctrl':
        case 'commandorcontrol':
          return __DARWIN__ ? 'Meta' : 'Control'
        case 'cmd':
        case 'command':
          return 'Meta'
        case 'ctrl':
          return 'Control'
        case 'option':
          return 'Alt'
        default:
          return part
      }
    })
    .join('+')
}

/** Execute a predefined edit role against the focused element. */
function performRole(role: NonNullable<IMenuItem['role']>) {
  switch (role) {
    case 'copy':
      document.execCommand('copy')
      break
    case 'cut':
      document.execCommand('cut')
      break
    case 'paste':
      document.execCommand('paste')
      break
    case 'selectAll':
      document.execCommand('selectAll')
      break
    default:
      // Other roles have no in-app equivalent; they are rendered disabled.
      break
  }
}

interface IMaterialContextMenuProps {
  readonly items: ReadonlyArray<IMenuItem>
  readonly position: { readonly x: number; readonly y: number }
  readonly onResolve: (item: IMenuItem | null) => void
}

interface IMaterialContextMenuState {
  readonly filterText: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly highlightedIndex: number
  readonly languageMode: LanguageMode
  readonly expandedSubmenus: ReadonlySet<number>
}

interface IVisibleRow {
  readonly item: IMenuItem
  readonly index: number
  readonly depth: number
  readonly parentIndex: number | null
}

class MaterialContextMenu extends React.Component<
  IMaterialContextMenuProps,
  IMaterialContextMenuState
> {
  private surfaceRef = React.createRef<HTMLDivElement>()
  private filterRef = React.createRef<HTMLInputElement>()

  public constructor(props: IMaterialContextMenuProps) {
    super(props)
    this.state = {
      filterText: '',
      filterMode: readPersistedFilterMode(ContextMenuFilterListId),
      filterCaseSensitive: false,
      highlightedIndex: -1,
      expandedSubmenus: new Set(),
      // Read once: a context menu is transient, and the language cannot be
      // changed while one is open.
      languageMode: getPersistedLanguageMode(),
    }
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  public componentDidMount() {
    this.filterRef.current?.focus()
    window.addEventListener('resize', this.dismiss)
  }

  public componentWillUnmount() {
    window.removeEventListener('resize', this.dismiss)
  }

  private dismiss = () => {
    this.props.onResolve(null)
  }

  /**
   * True while this menu's own regex builder is on screen.
   *
   * The builder's full-viewport overlay is `pointer-events: none` outside its
   * dialog, so a click in that empty margin lands on the menu backdrop
   * underneath. Dismissing there would tear down the menu and the builder with
   * it, discarding a half-built pattern, so the backdrop stands down while the
   * builder is up — the builder keeps its own Escape and Cancel.
   *
   * The surface id is matched so an unrelated builder opened elsewhere cannot
   * pin this menu open.
   */
  private isBuilderOpen(): boolean {
    return (
      document.querySelector(
        `.regex-builder-overlay[data-search-surface-id="${ContextMenuSearchSurfaceId}"]`
      ) !== null
    )
  }

  private onBackdropMouseDown = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && !this.isBuilderOpen()) {
      event.preventDefault()
      this.dismiss()
    }
  }

  /**
   * Test a single menu label against the filter under the current mode. An
   * invalid regex matches everything (matchWithMode's passthrough) so the
   * menu stays usable while a pattern is still being typed.
   */
  private labelMatches(query: string, label: string): boolean {
    const { results } = matchWithMode(query, [label], key => [key], {
      mode: this.state.filterMode,
      caseSensitive: this.state.filterCaseSensitive,
    })
    return results.length > 0
  }

  /**
   * The items as rendered: composite roles already expanded into the commands
   * they stand for. Computed per call rather than cached because a menu is
   * mounted once with fixed items and the list is tiny.
   */
  private getItems(): ReadonlyArray<IMenuItem> {
    return expandRoleMenus(this.props.items)
  }

  /** The flattened, filter-narrowed rows in display order. */
  private getVisibleRows(): ReadonlyArray<IVisibleRow> {
    const query = this.state.filterText.trim()
    const rows: IVisibleRow[] = []

    this.getItems().forEach((item, index) => {
      if (item.type === 'separator') {
        if (query.length === 0) {
          rows.push({ item, index, depth: 0, parentIndex: null })
        }
        return
      }

      const label = item.label ?? ''
      const submenu = item.submenu ?? []
      const selfMatches = query.length === 0 || this.labelMatches(query, label)
      const matchingChildren = submenu.filter(
        child =>
          child.type !== 'separator' &&
          (query.length === 0 || this.labelMatches(query, child.label ?? ''))
      )

      if (!selfMatches && matchingChildren.length === 0) {
        return
      }

      rows.push({ item, index, depth: 0, parentIndex: null })

      const expanded =
        this.state.expandedSubmenus.has(index) || query.length > 0
      if (submenu.length > 0 && expanded) {
        const children = query.length > 0 ? matchingChildren : submenu
        children.forEach(child => {
          if (child.type !== 'separator') {
            rows.push({
              item: child,
              index: submenu.indexOf(child),
              depth: 1,
              parentIndex: index,
            })
          }
        })
      }
    })

    // Collapse leading/trailing/doubled separators left over from filtering.
    return rows.filter((row, ix) => {
      if (row.item.type !== 'separator') {
        return true
      }
      const previous = rows[ix - 1]
      const next = rows[ix + 1]
      return (
        previous !== undefined &&
        previous.item.type !== 'separator' &&
        next !== undefined
      )
    })
  }

  private isSelectable(row: IVisibleRow): boolean {
    return row.item.type !== 'separator' && row.item.enabled !== false
  }

  private onFilterChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ filterText: event.target.value, highlightedIndex: -1 })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(ContextMenuFilterListId, filterMode)
    this.setState({ filterMode, highlightedIndex: -1 })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: -1 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ filterText: pattern, highlightedIndex: -1 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> => {
    const labels = new Array<string>()
    for (const item of this.getItems()) {
      if (item.type !== 'separator' && item.label !== undefined) {
        labels.push(item.label)
      }
      for (const child of item.submenu ?? []) {
        if (child.type !== 'separator' && child.label !== undefined) {
          labels.push(child.label)
        }
      }
    }
    return labels
  }

  private onKeyDown = (event: React.KeyboardEvent) => {
    // Keys pressed inside the filter-mode cluster (or the regex-builder
    // overlay it hosts) must not drive the menu's own navigation: Enter on a
    // mode button should cycle the mode, not activate the highlighted row,
    // and Escape inside the builder should close only the builder.
    //
    // The builder is portalled to a body-level layer, so it is NOT a DOM
    // descendant of `.filter-mode-control` — only of the React tree, which is
    // why its key events still arrive here. Testing that class alone therefore
    // let every keystroke typed into the pattern field drive the menu instead:
    // Escape tore down the whole menu, Enter fired a menu action, and the
    // arrow keys moved the highlight behind the builder. Every other host of
    // the builder already tests `.regex-builder-overlay` for this reason.
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('.filter-mode-control') !== null ||
        event.target.closest('.regex-builder-overlay') !== null)
    ) {
      return
    }

    const rows = this.getVisibleRows()
    const selectable = rows
      .map((row, ix) => (this.isSelectable(row) ? ix : -1))
      .filter(ix => ix !== -1)

    if (event.key === 'Escape') {
      event.preventDefault()
      this.dismiss()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (selectable.length === 0) {
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const current = selectable.indexOf(this.state.highlightedIndex)
      const nextPosition =
        current === -1
          ? direction === 1
            ? 0
            : selectable.length - 1
          : (current + direction + selectable.length) % selectable.length
      this.setState({ highlightedIndex: selectable[nextPosition] })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const target =
        this.state.highlightedIndex !== -1
          ? rows[this.state.highlightedIndex]
          : rows.find(row => this.isSelectable(row))
      if (target !== undefined && this.isSelectable(target)) {
        this.activateRow(target)
      }
    }
  }

  private activateRow(row: IVisibleRow) {
    const { item } = row
    if (
      item.submenu !== undefined &&
      item.submenu.length > 0 &&
      row.depth === 0
    ) {
      this.setState(previous => {
        const expandedSubmenus = new Set(previous.expandedSubmenus)
        if (expandedSubmenus.has(row.index)) {
          expandedSubmenus.delete(row.index)
        } else {
          expandedSubmenus.add(row.index)
        }
        return { ...previous, expandedSubmenus }
      })
      return
    }

    if (item.role !== undefined) {
      performRole(item.role)
      this.props.onResolve(null)
      return
    }

    this.props.onResolve(item)
  }

  private onItemButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const ix = Number(event.currentTarget.dataset.rowIndex)
    const row = this.getVisibleRows()[ix]
    if (row !== undefined && this.isSelectable(row)) {
      this.activateRow(row)
    }
  }

  private renderRow(row: IVisibleRow, ix: number) {
    const { item } = row

    if (item.type === 'separator') {
      return <hr key={`separator-${ix}`} className="context-menu-separator" />
    }

    const hasSubmenu =
      item.submenu !== undefined && item.submenu.length > 0 && row.depth === 0
    const expanded = this.state.expandedSubmenus.has(row.index)
    const icon = item.icon as OcticonSymbol | undefined
    const accelerator = item.accelerator

    return (
      <button
        key={`item-${row.parentIndex ?? 'root'}-${row.index}-${ix}`}
        type="button"
        className={classNames('context-menu-item', {
          highlighted: this.state.highlightedIndex === ix,
          submenu: row.depth > 0,
        })}
        disabled={item.enabled === false}
        data-row-index={ix}
        onClick={this.onItemButtonClick}
        role="menuitem"
        aria-keyshortcuts={
          accelerator === undefined ? undefined : ariaKeyShortcuts(accelerator)
        }
      >
        <span className="context-menu-item-leading">
          {item.type === 'checkbox' ? (
            <MaterialSymbol
              name="check"
              className={classNames('context-menu-check', {
                unchecked: item.checked !== true,
              })}
            />
          ) : icon !== undefined ? (
            <Octicon symbol={icon} className="context-menu-icon" />
          ) : null}
        </span>
        <span className="context-menu-item-label">{item.label}</span>
        {accelerator !== undefined && (
          // `aria-hidden` because the same shortcut is already announced from
          // `aria-keyshortcuts` above; reading the glyphs a second time as
          // literal text ("Ctrl plus C") only clutters the item.
          <kbd className="context-menu-accelerator" aria-hidden={true}>
            {friendlyAcceleratorText(accelerator)}
          </kbd>
        )}
        {hasSubmenu && (
          <Octicon
            symbol={expanded ? octicons.chevronDown : octicons.chevronRight}
            className="context-menu-expand"
          />
        )}
      </button>
    )
  }

  public render() {
    const rows = this.getVisibleRows()
    const { x, y } = this.props.position

    // Clamp the surface within the viewport; flip upward near the bottom.
    const estimatedHeight = Math.min(44 + rows.length * 32 + 16, 420)
    const estimatedWidth = 264
    const left = Math.max(
      8,
      Math.min(x, window.innerWidth - estimatedWidth - 8)
    )
    const top = Math.max(
      8,
      y + estimatedHeight > window.innerHeight - 8 ? y - estimatedHeight : y
    )

    return (
      <div
        className="material-context-menu-backdrop"
        role="presentation"
        onMouseDown={this.onBackdropMouseDown}
        onContextMenu={this.onBackdropMouseDown}
      >
        <div
          ref={this.surfaceRef}
          className="material-context-menu"
          style={{ left, top }}
          role="menu"
          tabIndex={-1}
          onKeyDown={this.onKeyDown}
        >
          <div className="context-menu-filter">
            <MaterialSymbol name="filter_alt" />
            <input
              data-search-surface-id="material-context-menu"
              ref={this.filterRef}
              type="text"
              placeholder={this.text('contextMenu.filterPlaceholder')}
              aria-label={this.text('contextMenu.filterLabel')}
              value={this.state.filterText}
              onChange={this.onFilterChanged}
              spellCheck={false}
            />
            <FilterModeControl
              searchSurfaceId="material-context-menu"
              mode={this.state.filterMode}
              caseSensitive={this.state.filterCaseSensitive}
              onModeChange={this.onFilterModeChanged}
              onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
              regexBuilderTarget="Menu actions"
              getSampleItems={this.getFilterSampleItems}
              filterText={this.state.filterText}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>
          <div className="context-menu-items" role="presentation">
            {rows.length === 0 ? (
              <p className="context-menu-empty">
                {this.text('contextMenu.empty')}
              </p>
            ) : (
              rows.map((row, ix) => this.renderRow(row, ix))
            )}
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Show the Material context menu at the last pointer position and resolve
 * with the picked item (null when dismissed). The caller runs the action.
 */
export function showMaterialContextMenu(
  items: ReadonlyArray<IMenuItem>
): Promise<IMenuItem | null> {
  return new Promise(resolve => {
    const host = document.createElement('div')
    host.className = 'material-context-menu-host'
    document.body.appendChild(host)
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    function cleanup(item: IMenuItem | null) {
      ReactDOM.unmountComponentAtNode(host)
      host.remove()
      previouslyFocused?.focus()
      resolve(item)
    }

    ReactDOM.render(
      <MaterialContextMenu
        items={items}
        position={getLastPointerPosition()}
        // The imperative mount owns teardown; there is no parent component
        // whose instance method could carry this callback.
        // eslint-disable-next-line react/jsx-no-bind
        onResolve={cleanup}
      />,
      host
    )
  })
}
