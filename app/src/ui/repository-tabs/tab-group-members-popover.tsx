import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { MaterialSymbol } from '../lib/material-symbol'
import {
  IRepositoryTab,
  ITabGroup,
  normalizeTabGroupColor,
  tabTitleStyleToCss,
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

interface ITabGroupMembersPopoverProps {
  readonly group: ITabGroup
  /** Every tab in the group, in strip order, collapsed or not. */
  readonly members: ReadonlyArray<IRepositoryTab>
  readonly activeTabId: string | null
  readonly anchor: HTMLElement | null
  readonly languageMode: LanguageMode
  readonly resolveLabel: (tab: IRepositoryTab) => string
  /** Every literal name this tab can be searched by (alias, path, URL, …). */
  readonly resolveMatchKeys: (tab: IRepositoryTab) => ReadonlyArray<string>
  /** Switch to a member. One action: the caller also closes this dropdown. */
  readonly onSelect: (tab: IRepositoryTab) => void
  readonly onEditGroup: () => void
  readonly onToggleCollapsed: () => void
  /** Delete the group label. Its tabs stay open; the caller enforces that. */
  readonly onDeleteGroup: () => void
  readonly onClose: () => void
}

interface ITabGroupMembersPopoverState {
  readonly highlightedIndex: number
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
}

const ListId = 'tab-group-members-list'

/** The persistence id, audit identity, and regex-builder binding for the search. */
const TabGroupMembersFilterListId = 'tab-group-members'

/** Select the localized member-button form without teaching i18n English rules. */
export function tabGroupMembersButtonKey(count: number): TranslationKey {
  return count === 1
    ? 'tabs.groupMembersButtonOne'
    : 'tabs.groupMembersButtonMany'
}

/** Select the localized member-count form; zero deliberately uses the many form. */
export function tabGroupMembersCountKey(count: number): TranslationKey {
  return count === 1
    ? 'tabs.groupMembersCountOne'
    : 'tabs.groupMembersCountMany'
}

/**
 * The dropdown a group chip opens to list every tab it holds.
 *
 * A collapsed group used to be a dead end: the chip toggled the fold and
 * nothing else, so the tabs inside it were unreachable without expanding the
 * group first. This lists every member — collapsed or not — and switching to
 * one stays a single action, because the row activates the tab and closes the
 * dropdown in the same press.
 *
 * It is a keyboard-navigable listbox driven from either the search field or the
 * list itself: arrow keys move the highlight, Home/End jump to the ends, Enter
 * (and Space, from the list) activates, Escape closes. The search carries the
 * same stack as every other collection surface — a plain-text default with
 * substring and regex as explicit opt-ins through the shared
 * `FilterModeControl` and its regex builder — and an invalid pattern reports
 * itself without hiding a single member.
 *
 * The group's own actions live at the foot of the dropdown so renaming,
 * recoloring, folding, and deleting the group are reachable from the same
 * surface as its members. Deleting is stated in words: it clears the label and
 * leaves every tab open.
 */
export class TabGroupMembersPopover extends React.Component<
  ITabGroupMembersPopoverProps,
  ITabGroupMembersPopoverState
> {
  public constructor(props: ITabGroupMembersPopoverProps) {
    super(props)
    const activeIndex = props.members.findIndex(
      tab => tab.id === props.activeTabId
    )
    this.state = {
      highlightedIndex:
        activeIndex === -1 && props.members.length > 0 ? 0 : activeIndex,
      query: '',
      filterMode: readPersistedFilterMode(TabGroupMembersFilterListId),
      filterCaseSensitive: false,
    }
  }

  public componentDidUpdate() {
    const count = this.getResults().members.length
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
   * An invalid pattern never empties the dropdown: the shared matcher returns
   * every item untouched alongside the error, so the group's tabs stay reachable
   * while the expression is still half-typed.
   */
  private getResults(): {
    readonly members: ReadonlyArray<IRepositoryTab>
    readonly regexError: string | null
  } {
    if (this.state.query.trim().length === 0) {
      return { members: this.props.members, regexError: null }
    }

    const { results, regexError } = matchWithMode(
      this.state.query.trim(),
      this.props.members,
      this.props.resolveMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )

    // Keep the strip's own order rather than a fuzzy score order: this dropdown
    // is a continuation of the group in the strip, and a row that changes rank
    // while the user types is a row they cannot aim at.
    const matched = new Set(results.map(result => result.item))
    return {
      members: this.props.members.filter(tab => matched.has(tab)),
      regexError,
    }
  }

  private selectTab(tab: IRepositoryTab) {
    this.props.onSelect(tab)
    this.props.onClose()
  }

  private onResultClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tab = this.props.members.find(
      candidate => candidate.id === event.currentTarget.dataset.tabId
    )
    if (tab !== undefined) {
      this.selectTab(tab)
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
    persistFilterMode(TabGroupMembersFilterListId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, highlightedIndex: 0 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.props.members.map(tab => this.props.resolveMatchKeys(tab).join(' · '))

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
    const results = this.getResults().members
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

    return (
      <li key={tab.id} className="tab-group-members-row" role="presentation">
        <button
          id={`tab-group-member-${index}`}
          className={`tab-group-members-result${
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
          data-tab-id={tab.id}
          data-result-index={index}
          onClick={this.onResultClick}
          onMouseEnter={this.onResultMouseEnter}
        >
          <span className="tab-group-members-result-copy">
            <strong style={tabTitleStyleToCss(tab.titleStyle)}>{label}</strong>
            <span className="tab-group-members-result-path">
              {tab.repositoryPath}
            </span>
          </span>
          <span className="tab-group-members-result-chips">
            {isActive && <span>{this.text('tabs.overflowActiveChip')}</span>}
            {tab.isPinned === true && (
              <span>{this.text('tabs.overflowPinnedChip')}</span>
            )}
            {tab.isFavorite === true && (
              <span>{this.text('tabs.overflowFavoriteChip')}</span>
            )}
          </span>
        </button>
      </li>
    )
  }

  private renderGroupActions() {
    const { group } = this.props
    const isCollapsed = group.isCollapsed === true

    return (
      <div
        className="tab-group-members-actions"
        role="group"
        aria-label={this.accessibleText('tabs.groupMembersTitle', {
          name: group.name,
        })}
      >
        <button
          type="button"
          className="tab-group-members-action"
          onClick={this.props.onEditGroup}
        >
          <MaterialSymbol name="edit" size={16} />
          {this.text('tabs.groupEdit', { name: group.name })}
        </button>
        <button
          type="button"
          className="tab-group-members-action"
          onClick={this.props.onToggleCollapsed}
        >
          <MaterialSymbol
            name={isCollapsed ? 'unfold_more' : 'expand_more'}
            size={16}
          />
          {this.text(isCollapsed ? 'tabs.groupExpand' : 'tabs.groupCollapse', {
            name: group.name,
          })}
        </button>
        <button
          type="button"
          className="tab-group-members-action danger"
          onClick={this.props.onDeleteGroup}
        >
          <MaterialSymbol name="delete" size={16} />
          {this.text('tabs.groupDelete', { name: group.name })}
        </button>
      </div>
    )
  }

  public render() {
    const { members: results, regexError } = this.getResults()
    const total = this.props.members.length
    const isFiltering = this.state.query.trim().length > 0
    const activeDescendant =
      this.state.highlightedIndex >= 0
        ? `tab-group-member-${this.state.highlightedIndex}`
        : undefined

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="tab-group-members-title"
        ariaDescribedBy="tab-group-members-status"
        onClickOutside={this.props.onClose}
      >
        <div
          className={`tab-group-members-popover tab-group--${normalizeTabGroupColor(
            this.props.group.color
          )}`}
        >
          <header className="tab-group-members-header">
            <h3 id="tab-group-members-title">
              {this.text('tabs.groupMembersTitle', {
                name: this.props.group.name,
              })}
            </h3>
            <p>{this.text('tabs.groupMembersDescription')}</p>
          </header>

          <div className="tab-group-members-filter-row" role="search">
            <input
              data-search-surface-id="tab-group-members"
              className="tab-group-members-input"
              type="search"
              role="combobox"
              aria-label={this.accessibleText('tabs.groupMembersListLabel')}
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
              searchSurfaceId="tab-group-members"
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
            <p className="tab-group-members-error" role="alert">
              {this.text('tabs.overflowRegexError', { message: regexError })}
            </p>
          )}

          {results.length === 0 ? (
            <p className="tab-group-members-empty">
              {this.text(
                isFiltering
                  ? 'tabs.overflowNoMatches'
                  : 'tabs.groupMembersEmpty'
              )}
            </p>
          ) : (
            <ul
              id={ListId}
              className="tab-group-members-results"
              role="listbox"
              aria-label={this.accessibleText('tabs.groupMembersListLabel')}
              aria-activedescendant={activeDescendant}
              tabIndex={0}
              onKeyDown={this.onListKeyDown}
            >
              {results.map((tab, index) => this.renderRow(tab, index))}
            </ul>
          )}

          {this.renderGroupActions()}

          <p className="tab-group-members-hint">
            {this.text('tabs.groupMembersKeepsTabs')}
          </p>

          <div
            id="tab-group-members-status"
            className="tab-group-members-status"
            role="status"
            aria-live="polite"
          >
            {isFiltering
              ? this.text('tabs.overflowFilterCount', {
                  visible: String(results.length),
                  total: String(total),
                })
              : this.text(tabGroupMembersCountKey(total), {
                  count: String(total),
                })}
          </div>
        </div>
      </Popover>
    )
  }
}
