import * as React from 'react'
import classNames from 'classnames'

import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from './filter-string-list'
import { FilterModeControl } from './filter-mode-control'

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
  private listboxId = `searchable-select-${Math.random()
    .toString(36)
    .slice(2, 10)}`

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
    return filterByMode(
      this.props.options,
      option => [option.label, option.value],
      this.state.query,
      this.state.mode,
      this.state.caseSensitive
    ).items
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

  public render() {
    const { label, disabled, searchSurfaceId } = this.props

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
          disabled={disabled}
          onClick={this.state.open ? () => this.close() : this.open}
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
            aria-label={`Search ${regexBuilderTarget}`}
            aria-controls={this.listboxId}
            onChange={this.onQueryChanged}
            onKeyDown={this.onSearchKeyDown}
          />
          <FilterModeControl
            searchSurfaceId={searchSurfaceId}
            mode={this.state.mode}
            caseSensitive={this.state.caseSensitive}
            onModeChange={mode => this.setState({ mode })}
            onCaseSensitiveChange={caseSensitive =>
              this.setState({ caseSensitive })
            }
            regexBuilderTarget={regexBuilderTarget}
            getSampleItems={() => this.props.options.map(o => o.label)}
            filterText={this.state.query}
            onRegexPatternApply={(pattern: string, caseSensitive: boolean) =>
              this.setState({
                mode: FilterMode.Regex,
                query: pattern,
                caseSensitive,
                activeIndex: 0,
              })
            }
          />
        </div>
        <ul
          id={this.listboxId}
          className="searchable-select-listbox"
          role="listbox"
          aria-label={regexBuilderTarget}
        >
          {options.length === 0 && (
            <li className="searchable-select-empty" role="presentation">
              No match
            </li>
          )}
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === this.props.value}
              className={classNames('searchable-select-option', {
                active: index === this.state.activeIndex,
              })}
              onClick={() => this.choose(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    )
  }
}
