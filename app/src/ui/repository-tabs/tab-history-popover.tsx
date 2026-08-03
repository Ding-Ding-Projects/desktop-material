import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { IRepositoryTab } from '../../models/repository-tab'
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

interface ITabHistoryPopoverProps {
  readonly tabs: ReadonlyArray<IRepositoryTab>
  readonly anchor: HTMLElement | null
  readonly languageMode: LanguageMode
  readonly resolveLabel: (tab: IRepositoryTab) => string
  readonly resolveMatchKeys: (tab: IRepositoryTab) => ReadonlyArray<string>
  readonly onRestore: (tab: IRepositoryTab) => void
  readonly onForget: (tab: IRepositoryTab) => void
  readonly onClear: () => void
  readonly onClose: () => void
}

interface ITabHistoryPopoverState {
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
}

const FilterListId = 'closed-tab-history'

/** Keyboard-friendly reopen list for tabs that were closed by the user. */
export class TabHistoryPopover extends React.Component<
  ITabHistoryPopoverProps,
  ITabHistoryPopoverState
> {
  public constructor(props: ITabHistoryPopoverProps) {
    super(props)
    this.state = {
      query: '',
      filterMode: readPersistedFilterMode(FilterListId),
      filterCaseSensitive: false,
    }
  }

  private text(key: TranslationKey, variables?: TranslationVariables): string {
    return translate(key, this.props.languageMode, variables)
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.props.languageMode)
  }

  private getResults(): {
    readonly tabs: ReadonlyArray<IRepositoryTab>
    readonly regexError: string | null
  } {
    if (this.state.query.trim().length === 0) {
      return { tabs: this.props.tabs, regexError: null }
    }
    const { results, regexError } = matchWithMode(
      this.state.query,
      this.props.tabs,
      this.props.resolveMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )
    const matched = new Set(results.map(result => result.item.id))
    return {
      tabs: this.props.tabs.filter(tab => matched.has(tab.id)),
      regexError,
    }
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(FilterListId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern })
  }

  private onRestoreClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tab = this.props.tabs.find(
      candidate => candidate.id === event.currentTarget.dataset.tabId
    )
    if (tab !== undefined) {
      this.props.onRestore(tab)
    }
  }

  private onForgetClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tab = this.props.tabs.find(
      candidate => candidate.id === event.currentTarget.dataset.tabId
    )
    if (tab !== undefined) {
      this.props.onForget(tab)
    }
  }

  private getFilterSampleItems = () =>
    this.props.tabs.map(tab => this.props.resolveMatchKeys(tab).join(' · '))

  private onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      this.props.onClose()
    }
  }

  public render(): JSX.Element {
    const { tabs: results, regexError } = this.getResults()
    const isFiltering = this.state.query.trim().length > 0
    const total = this.props.tabs.length
    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="closed-tab-history-title"
        ariaDescribedBy="closed-tab-history-status"
        onClickOutside={this.props.onClose}
      >
        <div className="tab-history-popover">
          <header className="tab-history-header">
            <h3 id="closed-tab-history-title">
              {this.text('tabs.closedHistoryTitle')}
            </h3>
            <p>{this.text('tabs.closedHistoryDescription')}</p>
          </header>
          <div className="tab-history-filter-row" role="search">
            <input
              data-search-surface-id={FilterListId}
              className="tab-history-input"
              type="search"
              aria-label={this.accessibleText('tabs.closedHistorySearch')}
              placeholder={this.text('tabs.closedHistorySearchPlaceholder')}
              value={this.state.query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onInputKeyDown}
            />
            <FilterModeControl
              searchSurfaceId={FilterListId}
              mode={this.state.filterMode}
              caseSensitive={this.state.filterCaseSensitive}
              onModeChange={this.onFilterModeChange}
              onCaseSensitiveChange={this.onFilterCaseSensitiveChange}
              regexBuilderTarget={this.accessibleText(
                'tabs.closedHistorySearchTarget'
              )}
              getSampleItems={this.getFilterSampleItems}
              filterText={this.state.query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>
          {regexError !== null && (
            <p className="tab-history-error" role="alert">
              {regexError}
            </p>
          )}
          {results.length === 0 ? (
            <p className="tab-history-empty">
              {this.text(
                isFiltering
                  ? 'tabs.closedHistoryNoMatches'
                  : 'tabs.closedHistoryEmpty'
              )}
            </p>
          ) : (
            <ul
              className="tab-history-results"
              aria-label={this.text('tabs.closedHistoryTitle')}
            >
              {results.map(tab => (
                <li className="tab-history-row" key={tab.id}>
                  <button
                    className="tab-history-restore"
                    type="button"
                    data-tab-id={tab.id}
                    onClick={this.onRestoreClick}
                  >
                    <span className="tab-history-label">
                      {this.props.resolveLabel(tab)}
                    </span>
                    <span className="tab-history-path">
                      {tab.repositoryPath}
                    </span>
                  </button>
                  <button
                    className="tab-history-forget"
                    type="button"
                    aria-label={this.accessibleText(
                      'tabs.closedHistoryForget',
                      { name: this.props.resolveLabel(tab) }
                    )}
                    data-tab-id={tab.id}
                    onClick={this.onForgetClick}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer className="tab-history-footer">
            <span
              id="closed-tab-history-status"
              role="status"
              aria-live="polite"
            >
              {total === 1
                ? this.text('tabs.closedHistoryCountOne')
                : this.text('tabs.closedHistoryCountMany', {
                    count: String(total),
                  })}
            </span>
            <button
              type="button"
              className="tab-history-clear"
              disabled={total === 0}
              onClick={this.props.onClear}
            >
              {this.text('tabs.closedHistoryClear')}
            </button>
          </footer>
        </div>
      </Popover>
    )
  }
}
