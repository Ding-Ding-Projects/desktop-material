import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  IRepositoryTab,
  tabTitleStyleToCss,
  tabFrameStyleToCss,
} from '../../models/repository-tab'
import { LanguageMode } from '../../models/language-mode'
import {
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import {
  ITabFunnyLevels,
  readTabFunnyLevels,
  translateWithTabFunnyLevel,
} from './tab-action-helpers'
import { tabOverflowFilterCountKey } from './tab-count-copy'

interface ITabOverflowPopoverProps {
  /** The tabs that did not fit in the strip, in their original order. */
  readonly tabs: ReadonlyArray<IRepositoryTab>
  readonly activeTabId: string | null
  readonly anchor: HTMLElement | null
  readonly languageMode: LanguageMode
  readonly resolveLabel: (tab: IRepositoryTab) => string
  /** Every literal name this tab can be searched by (alias, path, URL, …). */
  readonly resolveMatchKeys: (tab: IRepositoryTab) => ReadonlyArray<string>
  readonly onSelect: (tab: IRepositoryTab) => void
  /** Open the per-tab appearance editor for an overflowed tab. */
  readonly onCustomize: (tab: IRepositoryTab) => void
  /**
   * Open the same command menu a tab in the strip gets from a right-click.
   *
   * The event is forwarded so the strip can read the Shift+Right-click
   * appearance gesture from an overflow row exactly as it does from the strip.
   */
  readonly onContextMenu: (
    tab: IRepositoryTab,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onClose: () => void
}

interface ITabOverflowPopoverState {
  readonly highlightedIndex: number
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
}

const ListId = 'tab-overflow-list'

/** The persistence id, audit identity, and regex-builder binding for the search. */
const TabOverflowFilterListId = 'tab-overflow'

/**
 * The dropdown that lists every repository tab pushed out of the strip when it
 * overflows.
 *
 * It carries the same search stack as every other collection surface in the
 * app — a plain-text default with substring and regex as explicit opt-ins, the
 * shared `FilterModeControl` and its regex builder, and a non-throwing invalid
 * pattern that reports itself without hiding a single row. The overflow list is
 * long precisely when it exists, so scanning it by eye is the one thing that
 * does not scale.
 *
 * It is a keyboard-navigable listbox driven from either the search field or the
 * list itself: arrow keys move the highlight, Home/End jump to the ends,
 * Enter (and Space, from the list) activates, Escape closes. Each entry
 * re-applies the tab's own per-tab appearance (font, color, size, and the frame
 * background) so a customized tab looks the same in the dropdown as it did in
 * the strip, and carries the appearance editor and the full tab command menu so
 * an overflowed tab keeps every capability a visible tab has.
 */
export class TabOverflowPopover extends React.Component<
  ITabOverflowPopoverProps,
  ITabOverflowPopoverState
> {
  /**
   * Read once per mount rather than per render: this touches localStorage and
   * the popover re-renders on every keystroke in the search field.
   */
  private readonly funnyLevels: ITabFunnyLevels = readTabFunnyLevels()

  public constructor(props: ITabOverflowPopoverProps) {
    super(props)
    const activeIndex = props.tabs.findIndex(
      tab => tab.id === props.activeTabId
    )
    this.state = {
      highlightedIndex:
        activeIndex === -1 && props.tabs.length > 0 ? 0 : activeIndex,
      query: '',
      filterMode: readPersistedFilterMode(TabOverflowFilterListId),
      filterCaseSensitive: false,
    }
  }

  public componentDidUpdate() {
    const count = this.getResults().tabs.length
    const clamped =
      count === 0
        ? -1
        : Math.min(Math.max(this.state.highlightedIndex, 0), count - 1)
    if (clamped !== this.state.highlightedIndex) {
      this.setState({ highlightedIndex: clamped })
    }
  }

  private text(key: TranslationKey, variables?: TranslationVariables) {
    return translate(key, this.props.languageMode, variables)
  }

  /** A concise single-language name for a control, per the language mode. */
  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) {
    return translateForAccessibleName(key, variables, this.props.languageMode)
  }

  /**
   * The rows to paint plus the regex-engine complaint, if any.
   *
   * An invalid pattern never empties the menu: the shared matcher returns every
   * item untouched alongside the error, so the user keeps a usable tab list
   * while they are still typing the expression.
   */
  private getResults(): {
    readonly tabs: ReadonlyArray<IRepositoryTab>
    readonly regexError: string | null
  } {
    if (this.state.query.trim().length === 0) {
      return { tabs: this.props.tabs, regexError: null }
    }

    const { results, regexError } = matchWithMode(
      this.state.query.trim(),
      this.props.tabs,
      this.props.resolveMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )

    // Keep the strip's own order instead of a fuzzy score order: this menu is a
    // continuation of the tab strip, and a row that jumps rank while the user
    // types is a row they cannot aim at.
    const matched = new Set(results.map(result => result.item))
    return {
      tabs: this.props.tabs.filter(tab => matched.has(tab)),
      regexError,
    }
  }

  private selectTab(tab: IRepositoryTab) {
    this.props.onSelect(tab)
    this.props.onClose()
  }

  private tabFromElement(element: HTMLElement): IRepositoryTab | undefined {
    return this.props.tabs.find(
      candidate => candidate.id === element.dataset.tabId
    )
  }

  private onResultClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tab = this.tabFromElement(event.currentTarget)
    if (tab !== undefined) {
      this.selectTab(tab)
    }
  }

  private onCustomizeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tab = this.tabFromElement(event.currentTarget)
    if (tab !== undefined) {
      this.props.onCustomize(tab)
    }
  }

  private onRowContextMenu = (event: React.MouseEvent<HTMLLIElement>) => {
    const tab = this.tabFromElement(event.currentTarget)
    if (tab !== undefined) {
      event.preventDefault()
      this.props.onContextMenu(tab, event)
    }
  }

  private onResultMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.resultIndex)
    if (Number.isInteger(index)) {
      this.setState({ highlightedIndex: index })
    }
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, highlightedIndex: 0 })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(TabOverflowFilterListId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, highlightedIndex: 0 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.props.tabs.map(tab => this.props.resolveMatchKeys(tab).join(' · '))

  /**
   * Shared list navigation. The search field owns the same arrow/Home/End/Enter
   * keys as the list, so typing a query never costs the user their keyboard
   * navigation; the list keeps its own handler (and Space) for anyone who tabs
   * into it instead.
   */
  private navigate(
    event: React.KeyboardEvent<HTMLElement>,
    allowSpace: boolean
  ) {
    const results = this.getResults().tabs
    const count = results.length
    let highlightedIndex = this.state.highlightedIndex

    switch (event.key) {
      case 'ArrowDown':
        if (count > 0) {
          highlightedIndex = (highlightedIndex + 1 + count) % count
        }
        break
      case 'ArrowUp':
        if (count > 0) {
          highlightedIndex = (highlightedIndex - 1 + count) % count
        }
        break
      case 'Home':
        highlightedIndex = count > 0 ? 0 : -1
        break
      case 'End':
        highlightedIndex = count - 1
        break
      case 'Enter':
      case ' ': {
        // Space activates only from the list; inside the query field it is a
        // character the user is typing.
        if (event.key === ' ' && !allowSpace) {
          return
        }
        const selected = results[this.state.highlightedIndex]
        if (selected !== undefined) {
          event.preventDefault()
          this.selectTab(selected)
        }
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.setState({ highlightedIndex })
  }

  private onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    this.navigate(event, false)
  }

  private onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    this.navigate(event, true)
  }

  private renderRow(tab: IRepositoryTab, index: number) {
    const label = this.props.resolveLabel(tab)
    const isActive = tab.id === this.props.activeTabId
    const isHighlighted = index === this.state.highlightedIndex
    const frameStyle = tabFrameStyleToCss(tab.titleStyle)

    return (
      <li
        key={tab.id}
        className="tab-overflow-row"
        role="presentation"
        data-tab-id={tab.id}
        onContextMenu={this.onRowContextMenu}
      >
        <button
          id={`tab-overflow-result-${index}`}
          className={`tab-overflow-result${
            isHighlighted ? ' highlighted' : ''
          }${isActive ? ' active' : ''}`}
          type="button"
          role="option"
          aria-selected={isHighlighted}
          aria-label={`${label}${
            isActive ? this.text('tabs.overflowActiveSuffix') : ''
          }${tab.isPinned === true ? this.text('tabs.tabPinnedSuffix') : ''}${
            tab.isFavorite === true ? this.text('tabs.tabFavoriteSuffix') : ''
          }`}
          style={
            frameStyle.backgroundColor !== undefined
              ? { backgroundColor: frameStyle.backgroundColor }
              : undefined
          }
          data-tab-id={tab.id}
          data-result-index={index}
          onClick={this.onResultClick}
          onMouseEnter={this.onResultMouseEnter}
        >
          <span className="tab-overflow-result-copy">
            <strong style={tabTitleStyleToCss(tab.titleStyle)}>{label}</strong>
            <span className="tab-overflow-result-path">
              {tab.repositoryPath}
            </span>
          </span>
          <span className="tab-overflow-result-chips">
            {isActive && <span>{this.text('tabs.overflowActiveChip')}</span>}
            {tab.isPinned === true && (
              <span>{this.text('tabs.overflowPinnedChip')}</span>
            )}
            {tab.isFavorite === true && (
              <span>{this.text('tabs.overflowFavoriteChip')}</span>
            )}
          </span>
        </button>
        <button
          className="tab-overflow-result-customize"
          type="button"
          aria-label={this.accessibleText('tabs.overflowCustomizeLabel', {
            name: label,
          })}
          data-tab-id={tab.id}
          onClick={this.onCustomizeClick}
        >
          <Octicon symbol={octicons.paintbrush} />
        </button>
      </li>
    )
  }

  public render() {
    const { tabs: results, regexError } = this.getResults()
    const total = this.props.tabs.length
    const isFiltering = this.state.query.trim().length > 0
    const activeDescendant =
      this.state.highlightedIndex >= 0
        ? `tab-overflow-result-${this.state.highlightedIndex}`
        : undefined

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="tab-overflow-title"
        ariaDescribedBy="tab-overflow-status"
        onClickOutside={this.props.onClose}
      >
        <div className="tab-overflow-popover">
          <header className="tab-overflow-header">
            <h3 id="tab-overflow-title">{this.text('tabs.overflowTitle')}</h3>
            <p>
              {translateWithTabFunnyLevel(
                'tabs.overflowDescription',
                this.props.languageMode,
                this.funnyLevels
              )}
            </p>
          </header>

          <div className="tab-overflow-filter-row" role="search">
            <input
              data-search-surface-id="tab-overflow"
              className="tab-overflow-input"
              type="search"
              role="combobox"
              aria-label={this.accessibleText('tabs.overflowSearchLabel')}
              aria-controls={ListId}
              aria-expanded={true}
              aria-activedescendant={activeDescendant}
              autoComplete="off"
              autoFocus={true}
              placeholder={this.text('tabs.overflowSearchPlaceholder')}
              value={this.state.query}
              onChange={this.onQueryChange}
              onKeyDown={this.onInputKeyDown}
            />
            <FilterModeControl
              searchSurfaceId="tab-overflow"
              mode={this.state.filterMode}
              caseSensitive={this.state.filterCaseSensitive}
              onModeChange={this.onFilterModeChange}
              onCaseSensitiveChange={this.onFilterCaseSensitiveChange}
              regexBuilderTarget={this.accessibleText(
                'tabs.overflowSearchTarget'
              )}
              getSampleItems={this.getFilterSampleItems}
              filterText={this.state.query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>

          {regexError !== null && (
            <p className="tab-overflow-error" role="alert">
              {this.text('tabs.overflowRegexError', { message: regexError })}
            </p>
          )}

          {results.length === 0 ? (
            <p className="tab-overflow-empty">
              {this.text(
                isFiltering ? 'tabs.overflowNoMatches' : 'tabs.overflowEmpty'
              )}
            </p>
          ) : (
            <ul
              id={ListId}
              className="tab-overflow-results"
              role="listbox"
              aria-label={this.text('tabs.overflowListLabel')}
              aria-activedescendant={activeDescendant}
              tabIndex={0}
              onKeyDown={this.onListKeyDown}
            >
              {results.map((tab, index) => this.renderRow(tab, index))}
            </ul>
          )}

          <p className="tab-overflow-hint">
            {this.text('tabs.overflowActionsHint')}
          </p>

          <div
            id="tab-overflow-status"
            className="tab-overflow-status"
            role="status"
            aria-live="polite"
          >
            {isFiltering
              ? this.text(tabOverflowFilterCountKey(total), {
                  visible: String(results.length),
                  total: String(total),
                })
              : total === 1
              ? this.text('tabs.overflowCountOne')
              : this.text('tabs.overflowCountMany', { count: String(total) })}
          </div>
        </div>
      </Popover>
    )
  }
}
