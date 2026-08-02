import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { RepositoryTabsStore } from '../../lib/stores/repository-tabs-store'
import { IProfileTabsState, IRepositoryTab } from '../../models/repository-tab'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'

/** The persistence id for the arrange filter's mode. */
const ArrangeTabsFilterListId = 'arrange-tabs'

interface IArrangeTabsPopoverProps {
  readonly tabs: IProfileTabsState
  readonly tabsStore: RepositoryTabsStore
  readonly anchor: HTMLElement | null
  readonly resolveLabel: (tab: IRepositoryTab) => string
  readonly resolveMatchKeys: (tab: IRepositoryTab) => ReadonlyArray<string>
  readonly resolveStatusRank: (tab: IRepositoryTab) => number
  readonly onClose: () => void
}

interface IArrangeTabsPopoverState {
  readonly isApplying: boolean
  readonly announcementKey: TranslationKey
  readonly announcementVariables: TranslationVariables
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly languageMode: LanguageMode
}

/** A Material one-shot arrange surface with accessible manual-order actions. */
export class ArrangeTabsPopover extends React.Component<
  IArrangeTabsPopoverProps,
  IArrangeTabsPopoverState
> {
  public constructor(props: IArrangeTabsPopoverProps) {
    super(props)
    this.state = {
      isApplying: false,
      announcementKey: 'tabs.arrange.initialAnnouncement',
      announcementVariables: {},
      query: '',
      filterMode: readPersistedFilterMode(ArrangeTabsFilterListId),
      filterCaseSensitive: false,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.state.languageMode)

  private run = (
    action: () => Promise<void>,
    announcementKey: TranslationKey,
    announcementVariables: TranslationVariables = {}
  ) => {
    if (this.state.isApplying) {
      return
    }
    this.setState({ isApplying: true })
    action()
      .then(() =>
        this.setState({
          isApplying: false,
          announcementKey,
          announcementVariables,
        })
      )
      .catch(err => {
        log.error('Failed to arrange repository tabs', err)
        this.setState({
          isApplying: false,
          announcementKey: 'tabs.arrange.saveError',
          announcementVariables: {},
        })
      })
  }

  private move = (
    tab: IRepositoryTab,
    toIndex: number,
    announcementKey: TranslationKey
  ) => {
    const label = this.props.resolveLabel(tab)
    this.run(
      () => this.props.tabsStore.moveTab(tab.id, toIndex),
      announcementKey,
      { label }
    )
  }

  private togglePinned = (tab: IRepositoryTab) => {
    const willPin = tab.isPinned !== true
    const label = this.props.resolveLabel(tab)
    this.run(
      () => this.props.tabsStore.setTabPinned(tab.id, willPin),
      willPin ? 'tabs.arrange.pinned' : 'tabs.arrange.unpinned',
      { label }
    )
  }

  private toggleFavorite = (tab: IRepositoryTab) => {
    const willFavorite = tab.isFavorite !== true
    const label = this.props.resolveLabel(tab)
    this.run(
      () => this.props.tabsStore.setTabFavorite(tab.id, willFavorite),
      willFavorite
        ? 'tabs.arrange.favoriteAdded'
        : 'tabs.arrange.favoriteRemoved',
      { label }
    )
  }

  private onManualAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { tabId, action } = event.currentTarget.dataset
    const { tabs } = this.props.tabs
    const tab = tabs.find(candidate => candidate.id === tabId)
    if (tab === undefined) {
      return
    }
    const index = tabs.findIndex(candidate => candidate.id === tab.id)
    const pinnedCount = tabs.filter(item => item.isPinned === true).length
    const groupStart = tab.isPinned === true ? 0 : pinnedCount
    const groupEnd =
      tab.isPinned === true ? Math.max(0, pinnedCount - 1) : tabs.length - 1

    switch (action) {
      case 'pin':
        this.togglePinned(tab)
        break
      case 'favorite':
        this.toggleFavorite(tab)
        break
      case 'first':
        this.move(tab, groupStart, 'tabs.arrange.movedFirst')
        break
      case 'left':
        this.move(tab, index - 1, 'tabs.arrange.movedLeft')
        break
      case 'right':
        this.move(tab, index + 1, 'tabs.arrange.movedRight')
        break
      case 'last':
        this.move(tab, groupEnd, 'tabs.arrange.movedLast')
        break
    }
  }

  private renderManualRow(tab: IRepositoryTab) {
    const { tabs } = this.props.tabs
    const label = this.props.resolveLabel(tab)
    const index = tabs.findIndex(candidate => candidate.id === tab.id)
    const pinnedCount = tabs.filter(item => item.isPinned === true).length
    const groupStart = tab.isPinned === true ? 0 : pinnedCount
    const groupEnd =
      tab.isPinned === true ? Math.max(0, pinnedCount - 1) : tabs.length - 1
    const atStart = index === groupStart
    const atEnd = index === groupEnd
    const disabled = this.state.isApplying

    return (
      <li className="arrange-tabs-row" key={tab.id}>
        <div className="arrange-tabs-row-label">
          <span>{label}</span>
          {tab.isPinned === true && (
            <span className="arrange-tabs-chip">
              {this.text('tabs.arrange.pinnedChip')}
            </span>
          )}
          {tab.isFavorite === true && (
            <span className="arrange-tabs-chip favorite">
              {this.text('tabs.arrange.favoriteChip')}
            </span>
          )}
        </div>
        <div className="arrange-tabs-row-actions">
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="pin"
            onClick={this.onManualAction}
            disabled={disabled}
            aria-label={this.accessibleText(
              tab.isPinned === true
                ? 'tabs.arrange.unpinAria'
                : 'tabs.arrange.pinAria',
              { label }
            )}
          >
            {this.text(
              tab.isPinned === true ? 'tabs.arrange.unpin' : 'tabs.arrange.pin'
            )}
          </button>
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="favorite"
            onClick={this.onManualAction}
            disabled={disabled}
            aria-label={this.accessibleText(
              tab.isFavorite === true
                ? 'tabs.arrange.unfavoriteAria'
                : 'tabs.arrange.favoriteAria',
              { label }
            )}
          >
            {this.text(
              tab.isFavorite === true
                ? 'tabs.arrange.unstar'
                : 'tabs.arrange.star'
            )}
          </button>
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="first"
            onClick={this.onManualAction}
            disabled={disabled || atStart}
            aria-label={this.accessibleText('tabs.arrange.moveFirstAria', {
              label,
            })}
          >
            {this.text('tabs.arrange.first')}
          </button>
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="left"
            onClick={this.onManualAction}
            disabled={disabled || atStart}
            aria-label={this.accessibleText('tabs.arrange.moveLeftAria', {
              label,
            })}
          >
            {this.text('tabs.arrange.left')}
          </button>
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="right"
            onClick={this.onManualAction}
            disabled={disabled || atEnd}
            aria-label={this.accessibleText('tabs.arrange.moveRightAria', {
              label,
            })}
          >
            {this.text('tabs.arrange.right')}
          </button>
          <button
            type="button"
            data-tab-id={tab.id}
            data-action="last"
            onClick={this.onManualAction}
            disabled={disabled || atEnd}
            aria-label={this.accessibleText('tabs.arrange.moveLastAria', {
              label,
            })}
          >
            {this.text('tabs.arrange.last')}
          </button>
        </div>
      </li>
    )
  }

  private arrangeByLabel = (order: 'ascending' | 'descending') => {
    this.run(
      () =>
        this.props.tabsStore.arrangeTabsByLabel(order, this.props.resolveLabel),
      order === 'ascending'
        ? 'tabs.arrange.sortedLabelAscending'
        : 'tabs.arrange.sortedLabelDescending'
    )
  }

  private arrangeByOpenedAt = (order: 'newest' | 'oldest') => {
    this.run(
      () => this.props.tabsStore.arrangeTabsByOpenedAt(order),
      order === 'newest'
        ? 'tabs.arrange.sortedOpenedNewest'
        : 'tabs.arrange.sortedOpenedOldest'
    )
  }

  private arrangeByStatus = (
    order: 'needs-attention-first' | 'clean-first'
  ) => {
    this.run(
      () =>
        this.props.tabsStore.arrangeTabsByRepositoryStatus(
          order,
          this.props.resolveStatusRank
        ),
      order === 'needs-attention-first'
        ? 'tabs.arrange.sortedAttentionFirst'
        : 'tabs.arrange.sortedCleanFirst'
    )
  }

  private arrangeByFavorite = (order: 'favorites-first' | 'favorites-last') => {
    this.run(
      () => this.props.tabsStore.arrangeTabsByFavorite(order),
      order === 'favorites-first'
        ? 'tabs.arrange.sortedFavoritesFirst'
        : 'tabs.arrange.sortedFavoritesLast'
    )
  }

  private onSortClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    switch (event.currentTarget.dataset.sort) {
      case 'label-ascending':
        this.arrangeByLabel('ascending')
        break
      case 'label-descending':
        this.arrangeByLabel('descending')
        break
      case 'opened-newest':
        this.arrangeByOpenedAt('newest')
        break
      case 'opened-oldest':
        this.arrangeByOpenedAt('oldest')
        break
      case 'status-attention':
        this.arrangeByStatus('needs-attention-first')
        break
      case 'status-clean':
        this.arrangeByStatus('clean-first')
        break
      case 'favorites-first':
        this.arrangeByFavorite('favorites-first')
        break
      case 'favorites-last':
        this.arrangeByFavorite('favorites-last')
        break
    }
  }

  private onFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(ArrangeTabsFilterListId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.props.tabs.tabs.map(tab =>
      this.props.resolveMatchKeys(tab).join(' · ')
    )

  private getFilteredTabs(): ReadonlyArray<IRepositoryTab> {
    const { tabs } = this.props.tabs
    if (this.state.query.trim().length === 0) {
      return tabs
    }

    const { results } = matchWithMode(
      this.state.query,
      tabs,
      this.props.resolveMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )

    return results.map(r => r.item)
  }

  public render() {
    const { tabs } = this.props.tabs
    const disabled = this.state.isApplying || tabs.length < 2
    const filteredTabs = this.getFilteredTabs()
    const resultSummary = this.text(
      tabs.length === 1
        ? 'tabs.arrange.filterCountOne'
        : 'tabs.arrange.filterCountMany',
      {
        visible: String(filteredTabs.length),
        total: String(tabs.length),
      }
    )

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="arrange-tabs-title"
        ariaDescribedBy="arrange-tabs-status"
        onClickOutside={this.props.onClose}
      >
        <div className="arrange-tabs">
          <header className="arrange-tabs-header">
            <h3
              id="arrange-tabs-title"
              aria-label={this.accessibleText('tabs.arrange.title')}
            >
              <span aria-hidden="true">{this.text('tabs.arrange.title')}</span>
            </h3>
            <p>{this.text('tabs.arrange.description')}</p>
          </header>

          <div className="arrange-tabs-filter" role="search">
            <label htmlFor="arrange-tabs-filter-input">
              {this.text('tabs.arrange.filterLabel')}
            </label>
            <div className="arrange-tabs-filter-field">
              <input
                data-search-surface-id="arrange-tabs"
                id="arrange-tabs-filter-input"
                className="arrange-tabs-filter-input"
                type="search"
                value={this.state.query}
                onChange={this.onFilterChange}
                autoFocus={true}
                placeholder={this.text('tabs.arrange.filterPlaceholder')}
                aria-label={this.accessibleText('tabs.arrange.filterLabel')}
              />
              <FilterModeControl
                searchSurfaceId="arrange-tabs"
                mode={this.state.filterMode}
                caseSensitive={this.state.filterCaseSensitive}
                onModeChange={this.onFilterModeChange}
                onCaseSensitiveChange={this.onFilterCaseSensitiveChange}
                regexBuilderTarget={this.text('tabs.arrange.filterTarget')}
                getSampleItems={this.getFilterSampleItems}
                filterText={this.state.query}
                onRegexPatternApply={this.onRegexPatternApply}
              />
            </div>
            <span className="arrange-tabs-filter-count" aria-live="polite">
              {resultSummary}
            </span>
          </div>

          <section aria-labelledby="arrange-tabs-manual-title">
            <h4 id="arrange-tabs-manual-title">
              {this.text('tabs.arrange.manualOrder')}
            </h4>
            {filteredTabs.length === 0 ? (
              <p className="arrange-tabs-empty" role="status">
                {this.text('tabs.arrange.noMatches')}
              </p>
            ) : (
              <ul className="arrange-tabs-list">
                {filteredTabs.map(tab => this.renderManualRow(tab))}
              </ul>
            )}
          </section>

          <section aria-labelledby="arrange-tabs-sort-title">
            <h4 id="arrange-tabs-sort-title">
              {this.text('tabs.arrange.sortOnce')}
            </h4>
            <p className="arrange-tabs-sort-hint">
              {this.text('tabs.arrange.sortHint')}
            </p>
            <div className="arrange-tabs-sort-grid">
              <button
                type="button"
                disabled={disabled}
                data-sort="label-ascending"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortLabelAscending'
                )}
              >
                {this.text('tabs.arrange.sortLabelAscending')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="label-descending"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortLabelDescending'
                )}
              >
                {this.text('tabs.arrange.sortLabelDescending')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="opened-newest"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortOpenedNewest'
                )}
              >
                {this.text('tabs.arrange.sortOpenedNewest')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="opened-oldest"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortOpenedOldest'
                )}
              >
                {this.text('tabs.arrange.sortOpenedOldest')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="status-attention"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortAttentionFirst'
                )}
              >
                {this.text('tabs.arrange.sortAttentionFirst')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="status-clean"
                onClick={this.onSortClick}
                aria-label={this.accessibleText('tabs.arrange.sortCleanFirst')}
              >
                {this.text('tabs.arrange.sortCleanFirst')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="favorites-first"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortFavoritesFirst'
                )}
              >
                {this.text('tabs.arrange.sortFavoritesFirst')}
              </button>
              <button
                type="button"
                disabled={disabled}
                data-sort="favorites-last"
                onClick={this.onSortClick}
                aria-label={this.accessibleText(
                  'tabs.arrange.sortFavoritesLast'
                )}
              >
                {this.text('tabs.arrange.sortFavoritesLast')}
              </button>
            </div>
          </section>

          <div
            id="arrange-tabs-status"
            className="arrange-tabs-status"
            role="status"
            aria-live="polite"
          >
            {this.text(
              this.state.announcementKey,
              this.state.announcementVariables
            )}
          </div>
          <div className="arrange-tabs-actions">
            <button
              type="button"
              onClick={this.props.onClose}
              aria-label={this.accessibleText('tabs.arrange.done')}
            >
              {this.text('tabs.arrange.done')}
            </button>
          </div>
        </div>
      </Popover>
    )
  }
}
