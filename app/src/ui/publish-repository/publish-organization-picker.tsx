import * as React from 'react'

import { IAPIOrganization } from '../../lib/api'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import {
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { TextBox } from '../lib/text-box'

export interface IPublishOrganizationPickerProps {
  readonly organizations: ReadonlyArray<IAPIOrganization>
  readonly selectedOrganization: IAPIOrganization | null
  readonly languageMode: LanguageMode
  readonly onSelectedOrganizationChanged: (
    organization: IAPIOrganization | null
  ) => void
}

interface IPublishOrganizationPickerState {
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly highlightedIndex: number
}

interface IPublishOrganizationOption {
  readonly key: string
  readonly label: string
  readonly organization: IAPIOrganization | null
}

const SearchSurfaceId = 'publish-organizations'
const ResultListId = 'publish-organization-results'
const ResultStatusId = 'publish-organization-status'
const RegexErrorId = 'publish-organization-regex-error'
const NoneOptionKey = 'none'

/**
 * Searchable, keyboard-operable organization selector used by Publish
 * Repository.
 *
 * The shared matcher owns the regular-expression limits. Incomplete or unsafe
 * expressions therefore report an inline error and return the unfiltered
 * options instead of making the ownership choice disappear.
 */
export class PublishOrganizationPicker extends React.Component<
  IPublishOrganizationPickerProps,
  IPublishOrganizationPickerState
> {
  private readonly listRef = React.createRef<HTMLUListElement>()
  private readonly optionRows = new Map<string, HTMLButtonElement>()
  private readonly optionRefCallbacks = new Map<
    string,
    (element: HTMLButtonElement | null) => void
  >()

  public constructor(props: IPublishOrganizationPickerProps) {
    super(props)

    this.state = {
      query: '',
      filterMode: readPersistedFilterMode(SearchSurfaceId),
      filterCaseSensitive: false,
      highlightedIndex: this.selectedIndex(this.allOptions(props)),
    }
  }

  public componentDidMount() {
    this.scrollSelectedRowIntoView()
  }

  public componentDidUpdate(
    prevProps: IPublishOrganizationPickerProps,
    prevState: IPublishOrganizationPickerState
  ) {
    const options = this.getResults().options
    const selectedChanged =
      prevProps.selectedOrganization?.id !== this.props.selectedOrganization?.id
    const resultsChanged =
      prevProps.organizations !== this.props.organizations ||
      prevProps.languageMode !== this.props.languageMode ||
      prevState.query !== this.state.query ||
      prevState.filterMode !== this.state.filterMode ||
      prevState.filterCaseSensitive !== this.state.filterCaseSensitive

    let highlightedIndex = this.state.highlightedIndex
    if (selectedChanged) {
      highlightedIndex = this.selectedIndex(options)
    }
    if (options.length === 0) {
      highlightedIndex = -1
    } else if (highlightedIndex < 0 || highlightedIndex >= options.length) {
      highlightedIndex = 0
    }

    if (highlightedIndex !== this.state.highlightedIndex) {
      this.setState({ highlightedIndex }, () => {
        if (selectedChanged) {
          this.scrollSelectedRowIntoView()
        } else {
          this.scrollHighlightedRowIntoView()
        }
      })
      return
    }

    if (selectedChanged) {
      this.scrollSelectedRowIntoView()
    } else if (resultsChanged) {
      this.scrollHighlightedRowIntoView()
    }
  }

  private text(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, this.props.languageMode, variables)
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.props.languageMode)
  }

  private allOptions(
    props: IPublishOrganizationPickerProps = this.props
  ): ReadonlyArray<IPublishOrganizationOption> {
    return [
      {
        key: NoneOptionKey,
        label: translate('publish.organization.none', props.languageMode),
        organization: null,
      },
      ...props.organizations.map(organization => ({
        key: String(organization.id),
        label: organization.login,
        organization,
      })),
    ]
  }

  private selectedIndex(
    options: ReadonlyArray<IPublishOrganizationOption>
  ): number {
    const selectedId = this.props.selectedOrganization?.id
    return options.findIndex(option =>
      selectedId === undefined
        ? option.organization === null
        : option.organization?.id === selectedId
    )
  }

  private optionMatchKeys = (
    option: IPublishOrganizationOption
  ): ReadonlyArray<string> => {
    const organization = option.organization
    return organization === null
      ? [option.label]
      : [organization.login, organization.url]
  }

  private getResults(): {
    readonly options: ReadonlyArray<IPublishOrganizationOption>
    readonly regexError: string | null
  } {
    const options = this.allOptions()
    const query = this.state.query.trim()
    if (query.length === 0) {
      return { options, regexError: null }
    }

    const { results, regexError } = matchWithMode(
      query,
      options,
      this.optionMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )

    return {
      options: results.map(result => result.item),
      regexError,
    }
  }

  private onQueryChanged = (query: string) => {
    this.setState({ query, highlightedIndex: 0 })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(SearchSurfaceId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, highlightedIndex: 0 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.allOptions().map(option => this.optionMatchKeys(option).join(' · '))

  private selectOption(option: IPublishOrganizationOption) {
    this.props.onSelectedOrganizationChanged(option.organization)
  }

  private onOptionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.resultIndex)
    const option = this.allOptions().find(
      candidate => candidate.key === event.currentTarget.dataset.optionKey
    )
    if (option !== undefined) {
      if (Number.isInteger(index)) {
        this.setState({ highlightedIndex: index }, () =>
          this.listRef.current?.focus()
        )
      } else {
        this.listRef.current?.focus()
      }
      this.selectOption(option)
    }
  }

  private onOptionMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.resultIndex)
    if (Number.isInteger(index)) {
      this.setState({ highlightedIndex: index })
    }
  }

  private navigate(
    event: React.KeyboardEvent<HTMLElement>,
    source: 'input' | 'listbox'
  ) {
    if (event.key === 'Escape' && this.state.query.length > 0) {
      event.preventDefault()
      this.setState({ query: '', highlightedIndex: 0 })
      return
    }

    const options = this.getResults().options
    const count = options.length
    let highlightedIndex = this.state.highlightedIndex

    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) {
          return
        }
        highlightedIndex =
          highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % count
        break
      case 'ArrowUp':
        if (count === 0) {
          return
        }
        highlightedIndex =
          highlightedIndex < 0
            ? count - 1
            : (highlightedIndex - 1 + count) % count
        break
      case 'Home':
        if (source === 'input') {
          return
        }
        if (count === 0) {
          return
        }
        highlightedIndex = 0
        break
      case 'End':
        if (source === 'input') {
          return
        }
        if (count === 0) {
          return
        }
        highlightedIndex = count - 1
        break
      case 'Enter': {
        event.preventDefault()
        if (source === 'input') {
          // Hand focus to the element that exposes aria-activedescendant
          // before Enter can select anything. This keeps the option target
          // announced instead of changing an invisible searchbox-owned
          // highlight.
          if (count > 0) {
            this.listRef.current?.focus()
            this.scrollHighlightedRowIntoView()
          }
          return
        }

        const option = options[this.state.highlightedIndex]
        if (option !== undefined) {
          this.selectOption(option)
        }
        return
      }
      case ' ': {
        if (source === 'input') {
          return
        }
        event.preventDefault()
        const option = options[this.state.highlightedIndex]
        if (option !== undefined) {
          this.selectOption(option)
        }
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.setState({ highlightedIndex }, () => {
      this.scrollHighlightedRowIntoView()
      if (source === 'input') {
        this.listRef.current?.focus()
      }
    })
  }

  private onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    this.navigate(event, 'input')
  }

  private onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    this.navigate(event, 'listbox')
  }

  private getOptionRef(
    optionKey: string
  ): (element: HTMLButtonElement | null) => void {
    const existing = this.optionRefCallbacks.get(optionKey)
    if (existing !== undefined) {
      return existing
    }

    const callback = (element: HTMLButtonElement | null) => {
      if (element === null) {
        this.optionRows.delete(optionKey)
      } else {
        this.optionRows.set(optionKey, element)
      }
    }
    this.optionRefCallbacks.set(optionKey, callback)
    return callback
  }

  private scrollSelectedRowIntoView = () => {
    const selectedKey =
      this.props.selectedOrganization === null
        ? NoneOptionKey
        : String(this.props.selectedOrganization.id)
    this.optionRows.get(selectedKey)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }

  private scrollHighlightedRowIntoView = () => {
    const highlighted = this.getResults().options[this.state.highlightedIndex]
    if (highlighted === undefined) {
      return
    }
    this.optionRows.get(highlighted.key)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }

  private renderOption(
    option: IPublishOrganizationOption,
    index: number
  ): JSX.Element {
    const selected =
      option.organization === null
        ? this.props.selectedOrganization === null
        : option.organization.id === this.props.selectedOrganization?.id
    const highlighted = index === this.state.highlightedIndex
    const optionId = `publish-organization-option-${option.key}`

    return (
      <li
        key={option.key}
        className="publish-organization-row"
        role="presentation"
      >
        <button
          id={optionId}
          className={`publish-organization-option${
            highlighted ? ' highlighted' : ''
          }${selected ? ' selected' : ''}`}
          type="button"
          tabIndex={-1}
          role="option"
          aria-selected={selected}
          aria-label={
            selected
              ? `${option.label}. ${this.accessibleText(
                  'publish.organization.selectedHint'
                )}`
              : option.label
          }
          data-testid={optionId}
          data-option-key={option.key}
          data-result-index={index}
          ref={this.getOptionRef(option.key)}
          onClick={this.onOptionClick}
          onMouseEnter={this.onOptionMouseEnter}
        >
          {option.organization !== null && (
            <img
              className="publish-organization-avatar"
              src={option.organization.avatar_url}
              alt=""
              aria-hidden="true"
            />
          )}
          <span className="publish-organization-option-copy">
            {option.label}
          </span>
          {selected && (
            <span className="publish-organization-selected-hint">
              {this.text('publish.organization.selectedHint')}
            </span>
          )}
        </button>
      </li>
    )
  }

  public render() {
    const { options, regexError } = this.getResults()
    const activeDescendant =
      this.state.highlightedIndex >= 0 &&
      this.state.highlightedIndex < options.length
        ? `publish-organization-option-${
            options[this.state.highlightedIndex].key
          }`
        : undefined
    const errorDescription =
      regexError === null ? ResultStatusId : `${RegexErrorId} ${ResultStatusId}`

    return (
      <div
        className="publish-organization-picker"
        data-testid="publish-organization-picker"
      >
        <div className="publish-organization-filter-row" role="search">
          <TextBox
            searchSurfaceId="publish-organizations"
            className="publish-organization-search"
            type="search"
            label={this.text('publish.organization.label')}
            ariaLabel={this.accessibleText(
              'publish.organization.searchAriaLabel'
            )}
            ariaControls={ResultListId}
            ariaDescribedBy={errorDescription}
            ariaInvalid={regexError !== null}
            placeholder={this.text('publish.organization.searchPlaceholder')}
            value={this.state.query}
            onValueChanged={this.onQueryChanged}
            onKeyDown={this.onInputKeyDown}
          />
          <FilterModeControl
            searchSurfaceId="publish-organizations"
            mode={this.state.filterMode}
            caseSensitive={this.state.filterCaseSensitive}
            onModeChange={this.onFilterModeChanged}
            onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
            regexBuilderTarget={this.accessibleText(
              'publish.organization.listAriaLabel'
            )}
            getSampleItems={this.getFilterSampleItems}
            filterText={this.state.query}
            onRegexPatternApply={this.onRegexPatternApply}
          />
        </div>

        {regexError !== null && (
          <p
            id={RegexErrorId}
            className="publish-organization-error"
            role="alert"
          >
            {this.text('publish.organization.regexErrorPrefix')} {regexError}
          </p>
        )}

        {options.length === 0 && (
          <p className="publish-organization-empty">
            {this.text('publish.organization.noMatches')}
          </p>
        )}

        <ul
          ref={this.listRef}
          id={ResultListId}
          className="publish-organization-results"
          data-testid="publish-organization-results"
          role="listbox"
          aria-label={this.accessibleText('publish.organization.listAriaLabel')}
          aria-activedescendant={activeDescendant}
          tabIndex={0}
          onKeyDown={this.onListKeyDown}
        >
          {options.map((option, index) => this.renderOption(option, index))}
        </ul>

        <p
          id={ResultStatusId}
          className="publish-organization-result-count"
          role="status"
          aria-live="polite"
        >
          {options.length === 1
            ? this.text('publish.organization.resultCountOne')
            : this.text('publish.organization.resultCountMany', {
                count: String(options.length),
              })}
        </p>
      </div>
    )
  }
}
