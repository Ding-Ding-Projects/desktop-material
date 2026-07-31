import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { ITabGroup, normalizeTabGroupColor } from '../../models/repository-tab'
import { LanguageMode } from '../../models/language-mode'
import {
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'

interface IMoveTabToGroupDialogProps {
  readonly tabLabel: string
  readonly groups: ReadonlyArray<ITabGroup>
  readonly currentGroup: ITabGroup | null
  readonly languageMode: LanguageMode
  readonly onMove: (groupId: string | null) => void
  readonly onDismissed: () => void
}

interface IMoveTabToGroupDialogState {
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly highlightedIndex: number
}

interface IMoveTabGroupDestination {
  readonly key: string
  readonly groupId: string | null
  readonly label: string
  readonly accessibleLabel: string
  readonly group: ITabGroup | null
}

const ResultListId = 'move-tab-to-group-results'
const FilterListId = 'move-tab-to-group'

/**
 * Searchable destination picker for moving one repository tab.
 *
 * Group names stay out of the native context menu so hundreds of groups cost
 * one command there, while this bounded list remains searchable and fully
 * keyboard operable. Choosing "No group" is the same store operation as the
 * former one-off "Remove from group" menu item.
 */
export class MoveTabToGroupDialog extends React.Component<
  IMoveTabToGroupDialogProps,
  IMoveTabToGroupDialogState
> {
  private readonly listRef = React.createRef<HTMLUListElement>()

  public constructor(props: IMoveTabToGroupDialogProps) {
    super(props)
    this.state = {
      query: '',
      filterMode: readPersistedFilterMode(FilterListId),
      filterCaseSensitive: false,
      highlightedIndex:
        props.currentGroup !== null || props.groups.length > 0 ? 0 : -1,
    }
  }

  public componentDidUpdate(
    prevProps: IMoveTabToGroupDialogProps,
    prevState: IMoveTabToGroupDialogState
  ) {
    const resultCount = this.getResults().destinations.length
    const nextIndex =
      resultCount === 0
        ? -1
        : Math.min(Math.max(this.state.highlightedIndex, 0), resultCount - 1)

    if (nextIndex !== this.state.highlightedIndex) {
      this.setState({ highlightedIndex: nextIndex })
      return
    }

    if (
      prevState.highlightedIndex !== this.state.highlightedIndex ||
      prevState.query !== this.state.query ||
      prevProps.groups !== this.props.groups ||
      prevProps.currentGroup !== this.props.currentGroup
    ) {
      this.listRef.current
        ?.querySelector<HTMLElement>(
          `[data-result-index="${this.state.highlightedIndex}"]`
        )
        ?.scrollIntoView?.({ block: 'nearest' })
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

  private getDestinations(): ReadonlyArray<IMoveTabGroupDestination> {
    const destinations = new Array<IMoveTabGroupDestination>()
    if (this.props.currentGroup !== null) {
      const variables = { name: this.props.currentGroup.name }
      destinations.push({
        key: 'ungroup',
        groupId: null,
        label: this.text('tabs.groupMoveRemoveCurrent', variables),
        accessibleLabel: this.accessibleText(
          'tabs.groupMoveRemoveCurrent',
          variables
        ),
        group: null,
      })
    }

    for (const group of this.props.groups) {
      const variables = { name: group.name }
      destinations.push({
        key: group.id,
        groupId: group.id,
        label: group.name,
        accessibleLabel: this.accessibleText(
          'tabs.groupMoveDestinationLabel',
          variables
        ),
        group,
      })
    }
    return destinations
  }

  private getResults(): {
    readonly destinations: ReadonlyArray<IMoveTabGroupDestination>
    readonly regexError: string | null
  } {
    const destinations = this.getDestinations()
    if (this.state.query.trim().length === 0) {
      return { destinations, regexError: null }
    }

    const result = matchWithMode(
      this.state.query,
      destinations,
      destination => [
        destination.label,
        destination.group?.name ?? this.props.currentGroup?.name ?? '',
      ],
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )
    return {
      destinations: result.results.map(match => match.item),
      regexError: result.regexError,
    }
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({
      query: event.currentTarget.value,
      highlightedIndex: 0,
    })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(FilterListId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, highlightedIndex: 0 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.getDestinations().map(destination => destination.label)

  private selectDestination(destination: IMoveTabGroupDestination) {
    this.props.onMove(destination.groupId)
  }

  private onOptionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.resultIndex)
    const destination = this.getResults().destinations[index]
    if (destination !== undefined) {
      this.selectDestination(destination)
    }
  }

  private onOptionMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.resultIndex)
    if (Number.isInteger(index)) {
      this.setState({ highlightedIndex: index })
    }
  }

  private onNavigationKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const results = this.getResults().destinations
    let highlightedIndex = this.state.highlightedIndex

    if (
      results.length === 0 &&
      (event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Home' ||
        event.key === 'End')
    ) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        highlightedIndex =
          (highlightedIndex + 1 + results.length) % results.length
        break
      case 'ArrowUp':
        highlightedIndex =
          (highlightedIndex - 1 + results.length) % results.length
        break
      case 'Home':
        highlightedIndex = results.length > 0 ? 0 : -1
        break
      case 'End':
        highlightedIndex = results.length - 1
        break
      case ' ':
        // Space is listbox activation. In the search field it must remain a
        // normal text-entry key rather than unexpectedly moving the tab.
        if (event.currentTarget.getAttribute('role') !== 'listbox') {
          return
        }
        {
          const destination = results[highlightedIndex]
          if (destination !== undefined) {
            event.preventDefault()
            this.selectDestination(destination)
          }
        }
        return
      case 'Enter': {
        const destination = results[highlightedIndex]
        if (destination !== undefined) {
          event.preventDefault()
          this.selectDestination(destination)
        }
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.setState({ highlightedIndex })
  }

  private onSubmit = () => {
    const destination =
      this.getResults().destinations[this.state.highlightedIndex]
    if (destination !== undefined) {
      this.selectDestination(destination)
    }
  }

  public render() {
    const allDestinations = this.getDestinations()
    const { destinations, regexError } = this.getResults()
    const isFiltering = this.state.query.trim().length > 0
    const hasResults = destinations.length > 0
    const activeDescendant =
      hasResults && this.state.highlightedIndex >= 0
        ? `move-tab-to-group-result-${this.state.highlightedIndex}`
        : undefined

    return (
      <Dialog
        id="move-tab-to-group"
        title={
          <>
            <span aria-hidden="true">
              {this.text('tabs.groupMoveDialogTitle')}
            </span>
            <span className="sr-only">
              {this.accessibleText('tabs.groupMoveDialogTitle')}
            </span>
          </>
        }
        ariaDescribedBy="move-tab-to-group-intro"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p id="move-tab-to-group-intro" className="move-tab-to-group-intro">
            {this.text('tabs.groupMoveDialogIntro', {
              tab: this.props.tabLabel,
            })}
          </p>

          <div className="move-tab-to-group-search" role="search">
            <input
              data-search-surface-id="move-tab-to-group"
              className="move-tab-to-group-input"
              type="search"
              role="combobox"
              aria-label={this.accessibleText('tabs.groupMoveSearchLabel')}
              aria-controls={hasResults ? ResultListId : undefined}
              aria-expanded={hasResults}
              aria-activedescendant={activeDescendant}
              aria-describedby="move-tab-to-group-status"
              autoComplete="off"
              autoFocus={true}
              placeholder={this.text('tabs.groupMoveSearchPlaceholder')}
              value={this.state.query}
              onChange={this.onQueryChange}
              onKeyDown={this.onNavigationKeyDown}
            />
            <FilterModeControl
              searchSurfaceId="move-tab-to-group"
              mode={this.state.filterMode}
              caseSensitive={this.state.filterCaseSensitive}
              onModeChange={this.onFilterModeChange}
              onCaseSensitiveChange={this.onFilterCaseSensitiveChange}
              regexBuilderTarget={this.accessibleText(
                'tabs.groupMoveSearchTarget'
              )}
              getSampleItems={this.getFilterSampleItems}
              filterText={this.state.query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>

          {regexError !== null && (
            <p className="move-tab-to-group-error" role="alert">
              {this.text('tabs.groupMoveRegexError', { message: regexError })}
            </p>
          )}

          {destinations.length === 0 ? (
            <p className="move-tab-to-group-empty">
              {this.text(
                isFiltering ? 'tabs.groupMoveNoMatches' : 'tabs.groupMoveEmpty'
              )}
            </p>
          ) : (
            <ul
              ref={this.listRef}
              id={ResultListId}
              className="move-tab-to-group-results"
              role="listbox"
              aria-label={this.accessibleText('tabs.groupMoveListLabel')}
              aria-activedescendant={activeDescendant}
              tabIndex={0}
              onKeyDown={this.onNavigationKeyDown}
            >
              {destinations.map((destination, index) => {
                const isHighlighted = index === this.state.highlightedIndex
                return (
                  <li key={destination.key} role="presentation">
                    <button
                      id={`move-tab-to-group-result-${index}`}
                      className={`move-tab-to-group-result${
                        isHighlighted ? ' highlighted' : ''
                      }${
                        destination.group === null
                          ? ' remove-current'
                          : ` tab-group--${normalizeTabGroupColor(
                              destination.group.color
                            )}`
                      }`}
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      aria-label={destination.accessibleLabel}
                      tabIndex={-1}
                      data-result-index={index}
                      onClick={this.onOptionClick}
                      onMouseEnter={this.onOptionMouseEnter}
                    >
                      {destination.group === null ? (
                        <span
                          className="move-tab-to-group-remove-icon"
                          aria-hidden="true"
                        >
                          ×
                        </span>
                      ) : (
                        <span
                          className="move-tab-to-group-color"
                          aria-hidden="true"
                        />
                      )}
                      <span className="move-tab-to-group-label">
                        {destination.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            id="move-tab-to-group-status"
            className="move-tab-to-group-status"
            role="status"
            aria-live="polite"
          >
            {isFiltering
              ? this.text('tabs.groupMoveFilterCount', {
                  visible: String(destinations.length),
                  total: String(allDestinations.length),
                })
              : this.text(
                  destinations.length === 1
                    ? 'tabs.groupMoveCountOne'
                    : 'tabs.groupMoveCountMany',
                  { count: String(destinations.length) }
                )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            ariaLabel={this.accessibleText('tabs.groupCancelAction')}
            onClick={this.props.onDismissed}
          >
            {this.text('tabs.groupCancelAction')}
          </Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
