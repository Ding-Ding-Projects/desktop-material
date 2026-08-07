import * as React from 'react'

import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { ISettingsTabItem } from './settings-tab-model'

interface ISettingsTabPickerPopoverProps {
  /** The pages this surface offers. Already narrowed by the caller. */
  readonly items: ReadonlyArray<ISettingsTabItem>
  /** The open page, so the list can say which one you are already on. */
  readonly selectedId: string | null
  readonly anchor: HTMLElement | null
  /** Names the surface for assistive tech and for the filter-mode persistence. */
  readonly surfaceId: string
  readonly title: string
  readonly onSelect: (id: string) => void
  readonly onClose: () => void
  readonly pickerId: string
  readonly accessibleLabels?: {
    readonly pickerTitle?: string
    readonly search?: string
    readonly noMatches?: string
  }
}

interface ISettingsTabPickerPopoverState {
  readonly query: string
  readonly filterMode: FilterMode
  readonly caseSensitive: boolean
  readonly highlightedIndex: number
}

/**
 * The settings strip's overflow surface and its search, which are one list.
 *
 * A browser tab strip answers "where did my tab go" two ways — a dropdown of
 * what did not fit, and a search over everything — and both are the same
 * control with a different starting set. The caller decides which set to pass;
 * the filtering, keyboard handling and announcement are shared.
 *
 * The list is never empty of its own accord: a query that matches nothing says
 * so, rather than presenting a blank surface that reads as a broken menu.
 */
export class SettingsTabPickerPopover extends React.Component<
  ISettingsTabPickerPopoverProps,
  ISettingsTabPickerPopoverState
> {
  private readonly inputRef = React.createRef<HTMLInputElement>()

  public constructor(props: ISettingsTabPickerPopoverProps) {
    super(props)
    const selectedIndex = props.items.findIndex(
      item => item.id === props.selectedId
    )
    this.state = {
      query: '',
      filterMode: readPersistedFilterMode(props.surfaceId),
      caseSensitive: false,
      highlightedIndex: selectedIndex === -1 ? 0 : selectedIndex,
    }
  }

  public componentDidMount() {
    this.inputRef.current?.focus()
  }

  public componentDidUpdate() {
    const resultsLength = this.results.length
    const highlightedIndex =
      resultsLength === 0
        ? 0
        : Math.min(this.state.highlightedIndex, resultsLength - 1)
    if (highlightedIndex !== this.state.highlightedIndex) {
      this.setState({ highlightedIndex })
    }
  }

  private get results(): ReadonlyArray<ISettingsTabItem> {
    const { query, filterMode, caseSensitive } = this.state
    // Trimming decides whether anything was typed; it must not decide what is
    // matched, so the untrimmed query is what reaches the matcher.
    if (query.trim().length === 0) {
      return this.props.items
    }

    const { results, regexError } = matchWithMode(
      query,
      this.props.items,
      item => [item.searchText, item.accessibleLabel ?? ''],
      { mode: filterMode, caseSensitive }
    )

    // An invalid pattern must never hide rows while the user is still typing.
    if (regexError !== null) {
      return this.props.items
    }

    const matched = new Set(results.map(result => result.item))
    return this.props.items.filter(item => matched.has(item))
  }

  private onQueryChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, highlightedIndex: 0 })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(this.props.surfaceId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onCaseSensitiveChange = (caseSensitive: boolean) =>
    this.setState({ caseSensitive, highlightedIndex: 0 })

  private onRegexPatternApply = (pattern: string, caseSensitive: boolean) =>
    this.setState({
      query: pattern,
      filterMode: FilterMode.Regex,
      caseSensitive,
      highlightedIndex: 0,
    })

  private getSampleItems = () => this.props.items.map(item => item.searchText)

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const results = this.results
    if (results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1
      // http://javascript.about.com/od/problemsolving/a/modulobug.htm
      const next =
        (this.state.highlightedIndex + delta + results.length) % results.length
      this.setState({ highlightedIndex: next })
      event.preventDefault()
    } else if (event.key === 'Enter') {
      const highlightedIndex = Math.min(
        this.state.highlightedIndex,
        results.length - 1
      )
      const item = results[highlightedIndex]
      if (item !== undefined) {
        this.props.onSelect(item.id)
      }
      event.preventDefault()
    }
  }

  private onItemClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = this.results.findIndex(
      item => item.id === event.currentTarget.value
    )
    if (index >= 0) {
      this.setState({ highlightedIndex: index })
    }
    this.props.onSelect(event.currentTarget.value)
  }

  private getOptionId(id: string): string {
    return `${this.props.pickerId}-option-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`
  }

  private renderResults() {
    const results = this.results

    if (results.length === 0) {
      return (
        <>
          <p className="settings-tab-picker-empty" role="status">
            {this.props.accessibleLabels?.noMatches ??
              `No ${this.props.title} page matches that.`}
          </p>
          <ul
            id={`${this.props.pickerId}-list`}
            className="settings-tab-picker-list"
            role="listbox"
            aria-label={
              this.props.accessibleLabels?.pickerTitle ??
              `Choose a ${this.props.title} page`
            }
          />
        </>
      )
    }

    return (
      <ul
        id={`${this.props.pickerId}-list`}
        className="settings-tab-picker-list"
        role="listbox"
        aria-label={
          this.props.accessibleLabels?.pickerTitle ??
          `Choose a ${this.props.title} page`
        }
      >
        {results.map((item, index) => {
          const selected = item.id === this.props.selectedId
          return (
            <li key={item.id} role="presentation">
              <button
                type="button"
                id={this.getOptionId(item.id)}
                value={item.id}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={
                  'settings-tab-picker-item' +
                  (index === this.state.highlightedIndex
                    ? ' highlighted'
                    : '') +
                  (selected ? ' selected' : '')
                }
                onClick={this.onItemClick}
              >
                {item.icon}
                <span className="settings-tab-picker-label">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  public render() {
    const label =
      this.props.accessibleLabels?.search ?? `Search ${this.props.title}`
    const pickerTitle =
      this.props.accessibleLabels?.pickerTitle ??
      `Choose a ${this.props.title} page`
    const results = this.results
    const activeOption = results[this.state.highlightedIndex]

    return (
      <Popover
        id={this.props.pickerId}
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.RightTop}
        decoration={PopoverDecoration.Balloon}
        onClickOutside={this.props.onClose}
        className="settings-tab-picker"
        ariaLabelledby={`${this.props.pickerId}-title`}
      >
        <h2 id={`${this.props.pickerId}-title`} className="sr-only">
          {pickerTitle}
        </h2>
        {/* The list is driven from the field, so the whole surface listens. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div onKeyDown={this.onKeyDown}>
          <div className="settings-tab-picker-field">
            <input
              ref={this.inputRef}
              type="search"
              value={this.state.query}
              onChange={this.onQueryChange}
              role="combobox"
              aria-controls={`${this.props.pickerId}-list`}
              aria-expanded={true}
              aria-autocomplete="list"
              aria-activedescendant={
                activeOption === undefined
                  ? undefined
                  : this.getOptionId(activeOption.id)
              }
              aria-label={label}
              placeholder={label}
              data-search-surface-id={this.props.surfaceId}
            />
            <FilterModeControl
              searchSurfaceId={this.props.surfaceId}
              mode={this.state.filterMode}
              caseSensitive={this.state.caseSensitive}
              onModeChange={this.onFilterModeChange}
              onCaseSensitiveChange={this.onCaseSensitiveChange}
              regexBuilderTarget={this.props.title}
              getSampleItems={this.getSampleItems}
              filterText={this.state.query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>
          {this.renderResults()}
        </div>
      </Popover>
    )
  }
}
