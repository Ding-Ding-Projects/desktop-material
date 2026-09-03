import * as React from 'react'
import classNames from 'classnames'

import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from './filter-string-list'
import { FilterModeControl } from './filter-mode-control'
import { getPersistedLanguageMode, translate } from '../../lib/i18n'

/** Distinguishes one instance's listbox id from another's within a document. */
let instanceCount = 0

/** One selectable entry. `label` is what the user reads and searches. */
export interface ISearchableSelectOption {
  readonly value: string
  readonly label: string
}

interface ISearchableSelectProps {
  readonly label: string
  readonly value: string
  readonly options: ReadonlyArray<ISearchableSelectOption>
  readonly onChange: (value: string) => void
  /**
   * This field's own search surface. Every dropdown gets a distinct id: a
   * pattern built for one must never silently apply to whichever field was
   * touched last.
   */
  readonly searchSurfaceId: string
  /** Human-readable name of what is being searched, for the regex builder. */
  readonly regexBuilderTarget: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly ariaDescribedBy?: string
  readonly searchLabel?: string
  readonly noMatchLabel?: string
  readonly invalidPatternLabel?: (message: string) => string
}

interface ISearchableSelectState {
  readonly open: boolean
  readonly query: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
  /** Index into the filtered options that keyboard navigation is on. */
  readonly activeIndex: number
}

/**
 * A `<select>`-shaped control that opens a searchable listbox.
 *
 * A native select is fine for three options and unusable for eighty: it cannot
 * be searched, so finding a workflow means scrolling a list the user cannot
 * filter. This keeps the familiar collapsed appearance and replaces the popup
 * with a listbox whose search field is wired to the full regex builder, like
 * every other search surface in the app.
 *
 * The search field belongs to *this* field. Each instance is given its own
 * surface id, so two dropdowns on one screen never share query, mode, or
 * pattern state.
 */
export class SearchableSelect extends React.Component<
  ISearchableSelectProps,
  ISearchableSelectState
> {
  private buttonRef = React.createRef<HTMLButtonElement>()
  private searchRef = React.createRef<HTMLInputElement>()
  // A counter rather than a random suffix: this only has to be unique within
  // the document so `aria-controls` points at one listbox, and a predictable
  // id also keeps snapshots and test selectors stable.
  private listboxId = `searchable-select-${++instanceCount}`

  public constructor(props: ISearchableSelectProps) {
    super(props)
    this.state = {
      open: false,
      query: '',
      mode: FilterMode.Substring,
      caseSensitive: false,
      activeIndex: 0,
    }
  }

  private get filtered(): ReadonlyArray<ISearchableSelectOption> {
    return this.filterResult.items
  }

  private get filterResult() {
    return filterByMode(
      this.props.options,
      option => [option.label, option.value],
      this.state.query,
      this.state.mode,
      this.state.caseSensitive
    )
  }

  private get selectedLabel(): string {
    const match = this.props.options.find(o => o.value === this.props.value)
    return match?.label ?? this.props.placeholder ?? ''
  }

  private open = () => {
    if (this.props.disabled === true) {
      return
    }
    const index = Math.max(
      0,
      this.props.options.findIndex(o => o.value === this.props.value)
    )
    this.setState({ open: true, activeIndex: index }, () => {
      this.searchRef.current?.focus()
    })
  }

  /**
   * Close and hand focus back to the control that opened this. A popover that
   * drops focus on the document leaves a keyboard user at the top of the page.
   */
  private close = (restoreFocus: boolean = true) => {
    this.setState({ open: false }, () => {
      if (restoreFocus) {
        this.buttonRef.current?.focus()
      }
    })
  }

  private choose = (value: string) => {
    this.props.onChange(value)
    this.close()
  }

  private onButtonKeyDown = (event: React.KeyboardEvent) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      this.open()
    }
  }

  private onSearchKeyDown = (event: React.KeyboardEvent) => {
    const options = this.filtered

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.close()
        break
      case 'ArrowDown':
        event.preventDefault()
        this.setState({
          activeIndex: Math.min(this.state.activeIndex + 1, options.length - 1),
        })
        break
      case 'ArrowUp':
        event.preventDefault()
        this.setState({ activeIndex: Math.max(this.state.activeIndex - 1, 0) })
        break
      case 'Enter': {
        event.preventDefault()
        const option = options[this.state.activeIndex]
        if (option !== undefined) {
          this.choose(option.value)
        }
        break
      }
    }
  }

  private onQueryChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ activeIndex: 0, query: event.currentTarget.value })
  }

  /** Resolve the clicked option from the list, ignoring clicks on the gaps. */
  private onOptionClick = (event: React.MouseEvent<HTMLUListElement>) => {
    const option = (event.target as HTMLElement).closest('[data-value]')
    const value = option?.getAttribute('data-value')
    if (value !== null && value !== undefined) {
      this.choose(value)
    }
  }

  private onToggle = () => {
    if (this.state.open) {
      this.close()
    } else {
      this.open()
    }
  }

  private onModeChange = (mode: FilterMode) => this.setState({ mode })

  private onCaseSensitiveChange = (caseSensitive: boolean) =>
    this.setState({ caseSensitive })

  private getSampleItems = () => this.props.options.map(o => o.label)

  private onRegexPatternApply = (pattern: string, caseSensitive: boolean) => {
    this.setState({
      mode: FilterMode.Regex,
      query: pattern,
      caseSensitive,
      activeIndex: 0,
    })
  }

  public render() {
    const { label, disabled, searchSurfaceId, ariaDescribedBy } = this.props

    return (
      <div className="searchable-select">
        <label htmlFor={`${searchSurfaceId}-button`}>{label}</label>
        <button
          id={`${searchSurfaceId}-button`}
          ref={this.buttonRef}
          type="button"
          className="searchable-select-button"
          role="combobox"
          aria-expanded={this.state.open}
          aria-controls={this.listboxId}
          aria-haspopup="listbox"
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          onClick={this.onToggle}
          onKeyDown={this.onButtonKeyDown}
        >
          {this.selectedLabel}
        </button>
        {this.state.open && this.renderListbox()}
      </div>
    )
  }

  private renderListbox() {
    const options = this.filtered
    const { searchSurfaceId, regexBuilderTarget } = this.props

    return (
      <div className="searchable-select-popover">
        <div className="searchable-select-search">
          <input
            ref={this.searchRef}
            data-search-surface-id={searchSurfaceId}
            type="search"
            value={this.state.query}
            placeholder={this.props.placeholder}
            aria-label={
              this.props.searchLabel ?? `Search ${regexBuilderTarget}`
            }
            aria-controls={this.listboxId}
            onChange={this.onQueryChanged}
            onKeyDown={this.onSearchKeyDown}
          />
          <FilterModeControl
            searchSurfaceId={searchSurfaceId}
            mode={this.state.mode}
            caseSensitive={this.state.caseSensitive}
            onModeChange={this.onModeChange}
            onCaseSensitiveChange={this.onCaseSensitiveChange}
            regexBuilderTarget={regexBuilderTarget}
            getSampleItems={this.getSampleItems}
            filterText={this.state.query}
            onRegexPatternApply={this.onRegexPatternApply}
          />
        </div>
        {this.filterResult.regexError !== null && (
          <p className="searchable-select-error" role="alert">
            {this.props.invalidPatternLabel?.(this.filterResult.regexError) ??
              translate(
                'settings.tabGroupInvalidRegex',
                getPersistedLanguageMode(),
                {
                  message: this.filterResult.regexError,
                }
              )}
          </p>
        )}
        {/*
          The click is delegated to the list rather than bound per option, so
          the handler count does not grow with the option count and every
          option stays a plain, cheap node. Keyboard operation lives on the
          search field, which is what actually holds focus in this pattern —
          the options are addressed through aria-activedescendant, so none of
          them is a focus target that could receive a key event of its own.
        */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <ul
          id={this.listboxId}
          className="searchable-select-listbox"
          role="listbox"
          aria-label={regexBuilderTarget}
          onClick={this.onOptionClick}
        >
          {options.length === 0 && (
            <li className="searchable-select-empty" role="presentation">
              {this.props.noMatchLabel ?? 'No match'}
            </li>
          )}
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              data-value={option.value}
              aria-selected={option.value === this.props.value}
              className={classNames('searchable-select-option', {
                active: index === this.state.activeIndex,
              })}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    )
  }
}
