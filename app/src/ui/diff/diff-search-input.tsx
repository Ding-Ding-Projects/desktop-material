import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { FilterMode, IFilterOptions } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { compileSafeRegex } from '../../lib/safe-regex'

/** The per-surface persistence id for the in-diff search's filter mode. */
const DiffSearchFilterId = 'diff-search'

interface IDiffSearchInputProps {
  /**
   * Called when the user indicated that they either want to initiate a search
   * or want to advance to the next hit (typically done by hitting `Enter`).
   */
  readonly onSearch: (
    query: string,
    direction: 'next' | 'previous',
    options: IFilterOptions
  ) => void

  /**
   * Called when the user indicates that they want to abort the search,
   * either by clicking outside of the component or by hitting `Escape`.
   */
  readonly onClose: () => void

  /**
   * Returns sample lines from the diff being searched, used to seed the
   * regex builder's live tester.
   */
  readonly getSampleItems: () => ReadonlyArray<string>
}

interface IDiffSearchInputState {
  readonly value: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
}

export class DiffSearchInput extends React.Component<
  IDiffSearchInputProps,
  IDiffSearchInputState
> {
  private readonly textBoxRef = React.createRef<TextBox>()
  private lastAutomaticSearchKey: string | null = null

  public constructor(props: IDiffSearchInputProps) {
    super(props)
    this.state = {
      value: '',
      mode: readPersistedFilterMode(DiffSearchFilterId),
      caseSensitive: false,
    }
  }

  public render() {
    const regexError = this.getRegexError()
    return (
      // Closing is handled on the container rather than the text box so that
      // focus moving to the mode buttons or its owned portalled regex builder
      // overlay doesn't dismiss the search.
      <div className="diff-search" onBlur={this.onBlur}>
        <TextBox
          searchSurfaceId="diff"
          ref={this.textBoxRef}
          placeholder="Search…"
          ariaLabel="Search within diff"
          ariaDescribedBy={
            regexError === null ? undefined : 'diff-search-regex-error'
          }
          ariaInvalid={regexError !== null}
          className={regexError === null ? undefined : 'invalid'}
          displayClearButton={true}
          autoFocus={true}
          onValueChanged={this.onChange}
          onKeyDown={this.onKeyDown}
          value={this.state.value}
        />
        <FilterModeControl
          searchSurfaceId="diff"
          mode={this.state.mode}
          caseSensitive={this.state.caseSensitive}
          onModeChange={this.onModeChange}
          onCaseSensitiveChange={this.onCaseSensitiveChange}
          regexBuilderTarget="Diff"
          getSampleItems={this.props.getSampleItems}
          filterText={this.state.value}
          onRegexPatternApply={this.onRegexPatternApply}
        />
        {regexError === null ? null : (
          <p id="diff-search-regex-error" role="alert">
            {regexError}
          </p>
        )}
      </div>
    )
  }

  private getOptions(): IFilterOptions {
    return { mode: this.state.mode, caseSensitive: this.state.caseSensitive }
  }

  private getRegexError(): string | null {
    if (this.state.mode !== FilterMode.Regex || this.state.value.length === 0) {
      return null
    }
    return compileSafeRegex(this.state.value, this.state.caseSensitive).error
  }

  private onChange = (value: string) => {
    this.lastAutomaticSearchKey = null
    this.setState({ value })
  }

  private onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const { relatedTarget } = event
    const movedIntoOwnedRegexBuilder =
      relatedTarget instanceof Element &&
      relatedTarget.closest(
        '.regex-builder-overlay[data-search-surface-id="diff"]'
      ) !== null
    if (
      !(relatedTarget instanceof Node) ||
      (!event.currentTarget.contains(relatedTarget) &&
        !movedIntoOwnedRegexBuilder)
    ) {
      this.props.onClose()
    }
  }

  private onModeChange = (mode: FilterMode) => {
    persistFilterMode(DiffSearchFilterId, mode)
    this.setState({ mode }, this.onOptionsChanged)
  }

  private onCaseSensitiveChange = (caseSensitive: boolean) => {
    this.setState({ caseSensitive }, this.onOptionsChanged)
  }

  private onRegexPatternApply = (pattern: string) => {
    // FilterModeControl switches to regex mode (through onModeChange, whose
    // setState callback runs after this batched update and re-runs the search)
    // so only the pattern needs adopting here.
    this.lastAutomaticSearchKey = null
    this.setState({ value: pattern })
  }

  /** Re-run the active search under the new options and restore typing focus. */
  private onOptionsChanged = () => {
    this.textBoxRef.current?.focus()
    const searchKey = `${this.state.mode}\u0000${this.state.caseSensitive}\u0000${this.state.value}`
    if (
      this.state.value.length > 0 &&
      searchKey !== this.lastAutomaticSearchKey
    ) {
      this.lastAutomaticSearchKey = searchKey
      // Validation is rendered here, but the owning diff holds the current
      // highlights. Send invalid option transitions through so its validated
      // search path can clear stale results and announce the error.
      this.props.onSearch(this.state.value, 'next', this.getOptions())
    }
  }

  private onKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === 'Escape' && !evt.defaultPrevented) {
      evt.preventDefault()
      this.props.onClose()
    } else if (evt.key === 'Enter' && !evt.defaultPrevented) {
      evt.preventDefault()
      // The parent performs the authoritative validation and owns result
      // state, so it must see invalid submissions in order to clear old hits.
      this.props.onSearch(
        this.state.value,
        evt.shiftKey ? 'previous' : 'next',
        this.getOptions()
      )
    }
  }
}
