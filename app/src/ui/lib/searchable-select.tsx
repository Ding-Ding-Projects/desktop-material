import * as React from 'react'
import classNames from 'classnames'

import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from './filter-string-list'
import { FilterModeControl } from './filter-mode-control'
import { attachRipple } from './ripple'

/** Distinguishes one instance's listbox id from another's within a document. */
let instanceCount = 0

/** One selectable entry. `label` is what the user reads and searches. */
export interface ISearchableSelectOption {
  readonly value: string
  readonly label: string
}

export interface ISearchableSelectProps {
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
  readonly className?: string
  /** Localized search-field copy. Falls back for existing call sites. */
  readonly searchPlaceholder?: string
  /** Localized empty-result copy. Falls back for existing call sites. */
  readonly emptyMessage?: string
  readonly supportingText?: string
  readonly error?: string
  /** Optional visual affordance rendered after the selected label. */
  readonly indicator?: React.ReactNode
  /** Enables the shared Material ripple when the host supplies clip geometry. */
  readonly ripple?: boolean
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
  private rootRef = React.createRef<HTMLDivElement>()
  private buttonRef = React.createRef<HTMLButtonElement>()
  private searchRef = React.createRef<HTMLInputElement>()
  // A counter rather than a random suffix: this only has to be unique within
  // the document so `aria-controls` points at one listbox, and a predictable
  // id also keeps snapshots and test selectors stable.
  private listboxId = `searchable-select-${++instanceCount}`

  private get supportId(): string {
    return `${this.listboxId}-support`
  }

  private get regexErrorId(): string {
    return `${this.listboxId}-regex-error`
  }

  private get error(): string | undefined {
    return this.props.error === undefined || this.props.error.length === 0
      ? undefined
      : this.props.error
  }

  private get supportMessage(): string | undefined {
    return this.error ?? this.props.supportingText
  }

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

  private get filterResult() {
    return filterByMode(
      this.props.options,
      option => [option.label, option.value],
      this.state.query,
      this.state.mode,
      this.state.caseSensitive
    )
  }

  private get filtered(): ReadonlyArray<ISearchableSelectOption> {
    return this.filterResult.items
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

  public componentDidUpdate(
    prevProps: ISearchableSelectProps,
    prevState: ISearchableSelectState
  ) {
    if (!prevState.open && this.state.open) {
      document.addEventListener('mousedown', this.onDocumentInteraction)
      document.addEventListener('focusin', this.onDocumentInteraction)
    } else if (prevState.open && !this.state.open) {
      this.removeDocumentListeners()
    }

    if (
      prevProps.disabled !== this.props.disabled &&
      this.props.disabled === true &&
      this.state.open
    ) {
      this.close(false)
      return
    }

    const maximum = Math.max(0, this.filtered.length - 1)
    if (this.state.activeIndex > maximum) {
      this.setState({ activeIndex: maximum })
    }
  }

  public componentWillUnmount() {
    this.removeDocumentListeners()
  }

  private removeDocumentListeners = () => {
    document.removeEventListener('mousedown', this.onDocumentInteraction)
    document.removeEventListener('focusin', this.onDocumentInteraction)
  }

  /** Keep the owning portalled regex builder alive while dismissing outside. */
  private onDocumentInteraction = (event: Event) => {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }
    const builder = document.getElementById('regex-builder-layer')
    if (
      this.rootRef.current?.contains(target) === true ||
      builder?.contains(target) === true
    ) {
      return
    }
    this.close(false)
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
          activeIndex: Math.max(
            0,
            Math.min(this.state.activeIndex + 1, options.length - 1)
          ),
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

  private onOptionMouseDown = (event: React.MouseEvent<HTMLUListElement>) => {
    if (this.props.ripple !== true) {
      return
    }
    const option = (event.target as HTMLElement).closest<HTMLElement>(
      '[role="option"]'
    )
    if (option !== null && event.currentTarget.contains(option)) {
      attachRipple(option, event)
    }
  }

  private onButtonMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.ripple === true) {
      attachRipple(event.currentTarget, event)
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
    const { label, disabled, searchSurfaceId } = this.props

    return (
      <div
        ref={this.rootRef}
        className={classNames('searchable-select', this.props.className)}
        data-invalid={this.error === undefined ? undefined : true}
      >
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
          aria-invalid={this.error === undefined ? undefined : true}
          aria-describedby={
            this.supportMessage === undefined ? undefined : this.supportId
          }
          disabled={disabled}
          onMouseDown={this.onButtonMouseDown}
          onClick={this.onToggle}
          onKeyDown={this.onButtonKeyDown}
        >
          <span className="searchable-select-value">{this.selectedLabel}</span>
          {this.props.indicator}
        </button>
        {this.state.open && this.renderListbox()}
        {this.supportMessage === undefined ? null : (
          <p
            id={this.supportId}
            className="searchable-select-support"
            role="status"
          >
            {this.supportMessage}
          </p>
        )}
      </div>
    )
  }

  private renderListbox() {
    const result = this.filterResult
    const options = result.items
    const { searchSurfaceId, regexBuilderTarget } = this.props
    const activeOption = options[this.state.activeIndex]
    const activeDescendant =
      activeOption === undefined
        ? undefined
        : `${this.listboxId}-option-${this.state.activeIndex}`
    const describedBy = [
      this.supportMessage === undefined ? undefined : this.supportId,
      result.regexError === null ? undefined : this.regexErrorId,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' ')

    return (
      <div className="searchable-select-popover">
        <div className="searchable-select-search">
          <input
            ref={this.searchRef}
            data-search-surface-id={searchSurfaceId}
            type="search"
            value={this.state.query}
            placeholder={
              this.props.searchPlaceholder ?? `Search ${regexBuilderTarget}`
            }
            aria-label={
              this.props.searchPlaceholder ?? `Search ${regexBuilderTarget}`
            }
            aria-controls={this.listboxId}
            aria-activedescendant={activeDescendant}
            aria-invalid={result.regexError === null ? undefined : true}
            aria-describedby={
              describedBy.length === 0 ? undefined : describedBy
            }
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
        {result.regexError === null ? null : (
          <p
            id={this.regexErrorId}
            className="searchable-select-regex-error"
            role="status"
          >
            {result.regexError}
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
          onMouseDown={this.onOptionMouseDown}
          onClick={this.onOptionClick}
        >
          {options.length === 0 && (
            <li className="searchable-select-empty" role="presentation">
              {this.props.emptyMessage ?? 'No match'}
            </li>
          )}
          {options.map((option, index) => (
            <li
              id={`${this.listboxId}-option-${index}`}
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
