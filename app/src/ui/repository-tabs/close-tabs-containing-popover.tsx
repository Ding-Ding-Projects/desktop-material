import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import {
  RepositoryTabMatchKeyResolver,
  RepositoryTabsStore,
} from '../../lib/stores/repository-tabs-store'
import { IRepositoryTab } from '../../models/repository-tab'
import { FilterMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import { persistFilterMode } from '../lib/filter-list-mode'
import { getBoolean, getEnum, setBoolean } from '../../lib/local-storage'
import {
  formatAllTabsStayOpen,
  formatRemainingTabCount,
} from './tab-count-copy'

/** The persistence id for the close-matching filter's mode. */
const CloseTabsFilterListId = 'close-tabs-containing'

/**
 * Both bulk-close directions read one stored mode and one stored casing, so
 * the inverse action can never match differently from the action it inverts.
 * The mode key mirrors the layout `persistFilterMode` writes.
 */
const CloseTabsFilterModeKey = `filter-mode/${CloseTabsFilterListId}`
const CloseTabsCaseSensitiveKey = `filter-case/${CloseTabsFilterListId}`

/**
 * Bulk close is destructive, and "containing" reads as a substring rather than
 * as a subsequence scattered across an absolute path: on a first open, `dm`
 * must not offer to close every tab living under Documents/desktop-material.
 * A stored choice still wins; only the first-use default differs from the
 * fuzzy default the ordinary filter lists share.
 */
function readCloseTabsFilterMode(): FilterMode {
  return getEnum(CloseTabsFilterModeKey, FilterMode) ?? FilterMode.Substring
}

function readCloseTabsCaseSensitive(): boolean {
  return getBoolean(CloseTabsCaseSensitiveKey, false)
}

/** Name the shared predicate for the direction that cannot show its controls. */
function describeMatching(mode: FilterMode, caseSensitive: boolean): string {
  const strategy =
    mode === FilterMode.Regex
      ? 'a regular expression'
      : mode === FilterMode.Fuzzy
      ? 'fuzzy matching'
      : 'a literal substring'
  const casing = caseSensitive ? 'matches letter case' : 'ignores letter case'
  return `Matching uses ${strategy} and ${casing}, exactly as “Close tabs containing” does.`
}

interface ICloseTabsContainingPopoverProps {
  readonly tabsStore: RepositoryTabsStore
  readonly anchor: HTMLElement | null
  /**
   * Repository-aware keys (name, alias, GitHub full name) for a tab. The host
   * must pass the same resolver to this popover and to the inverse one below:
   * an action whose inverse searches different text disagrees with itself
   * about the same phrase.
   */
  readonly resolveAdditionalKeys?: RepositoryTabMatchKeyResolver
  /** Called with the new active tab id once tabs have been closed. */
  readonly onClosed: (activeTabId: string | null) => void
  /** Called to dismiss the popover without closing any tabs. */
  readonly onClose: () => void
}

interface ICloseTabsContainingPopoverState {
  readonly query: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
  readonly isSubmitting: boolean
  readonly error: string | null
}

/**
 * The existing close-matching action. This remains separate from the inverse
 * close flow so adding "close all except" never removes regex-based matching;
 * the matching strategy comes from the shared filter-mode cluster.
 */
export class CloseTabsContainingPopover extends React.Component<
  ICloseTabsContainingPopoverProps,
  ICloseTabsContainingPopoverState
> {
  public constructor(props: ICloseTabsContainingPopoverProps) {
    super(props)
    this.state = {
      query: '',
      mode: readCloseTabsFilterMode(),
      caseSensitive: readCloseTabsCaseSensitive(),
      isSubmitting: false,
      error: null,
    }
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, error: null })
  }

  private onModeChange = (mode: FilterMode) => {
    persistFilterMode(CloseTabsFilterListId, mode)
    this.setState({ mode, error: null })
  }

  private onCaseSensitiveChange = (caseSensitive: boolean) => {
    // Persisted because the inverse popover has no controls of its own and
    // reads this casing to stay the negation of this action.
    setBoolean(CloseTabsCaseSensitiveKey, caseSensitive)
    this.setState({ caseSensitive, error: null })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, error: null })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.props.tabsStore
      .getState()
      .tabs.map(tab => tab.customLabel ?? tab.repositoryPath)

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onConfirm()
    }
  }

  /**
   * The single predicate behind the preview, the count, the status line and
   * the confirm button. Splitting them is what let a whitespace-only query
   * enable a "Close 3" button that the confirm handler then refused.
   */
  private findMatches() {
    const { query, mode, caseSensitive } = this.state
    return this.props.tabsStore.findMatchingTabs(
      query,
      mode,
      caseSensitive,
      this.props.resolveAdditionalKeys
    )
  }

  private onConfirm = () => {
    const { query, mode, caseSensitive, isSubmitting } = this.state
    const { tabs, regexError } = this.findMatches()
    const closableTabs = tabs.filter(tab => tab.isPinned !== true)
    if (isSubmitting || regexError !== null || closableTabs.length === 0) {
      return
    }

    this.setState({ isSubmitting: true, error: null })
    this.props.tabsStore
      .closeTabsMatching(
        query,
        mode,
        caseSensitive,
        this.props.resolveAdditionalKeys
      )
      .then(activeTabId => {
        this.props.onClosed(activeTabId)
        this.props.onClose()
      })
      .catch(err => {
        log.error('Failed to close matching tabs', err)
        this.setState({
          isSubmitting: false,
          error:
            'The change could not be saved. Review open tabs before trying again.',
        })
      })
  }

  public render() {
    const { query, mode, caseSensitive, isSubmitting, error } = this.state
    const { tabs, regexError } = this.findMatches()
    const closableCount = tabs.filter(tab => tab.isPinned !== true).length
    const protectedCount = tabs.length - closableCount
    const hasQuery = query.trim().length > 0

    const status =
      error ??
      (regexError !== null
        ? regexError
        : !hasQuery
        ? 'Type to preview matches.'
        : tabs.length === 0
        ? 'No tabs match. Nothing will close.'
        : `${closableCount} close, ${protectedCount} pinned protected.`)

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="close-tabs-containing-title"
        ariaDescribedBy="close-tabs-containing-status"
        onClickOutside={this.props.onClose}
      >
        <div className="close-tabs-containing">
          <h3 id="close-tabs-containing-title">Close tabs containing</h3>
          <div className="close-tabs-containing-field">
            <input
              data-search-surface-id="close-tabs-containing"
              type="text"
              className="close-tabs-containing-input"
              placeholder="Filter by name"
              value={query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onKeyDown}
              aria-label="Close tabs containing"
              aria-describedby="close-tabs-containing-status"
            />
            <FilterModeControl
              searchSurfaceId="close-tabs-containing"
              mode={mode}
              caseSensitive={caseSensitive}
              onModeChange={this.onModeChange}
              onCaseSensitiveChange={this.onCaseSensitiveChange}
              regexBuilderTarget="Open tabs"
              getSampleItems={this.getFilterSampleItems}
              filterText={query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>
          <div
            id="close-tabs-containing-status"
            className={
              regexError === null && error === null
                ? 'close-tabs-containing-status'
                : 'close-tabs-containing-status error'
            }
            role="status"
            aria-live="polite"
          >
            {status}
          </div>
          <div className="close-tabs-containing-actions">
            <button
              type="button"
              className="close-tabs-containing-cancel"
              onClick={this.props.onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="close-tabs-containing-confirm"
              disabled={closableCount === 0 || isSubmitting}
              onClick={this.onConfirm}
            >
              {isSubmitting
                ? 'Closing…'
                : closableCount > 0
                ? `Close ${closableCount}`
                : 'Close'}
            </button>
          </div>
        </div>
      </Popover>
    )
  }
}

interface ICloseTabsExceptContainingPopoverProps {
  readonly tabsStore: RepositoryTabsStore
  readonly anchor: HTMLElement | null
  /** The same repository-aware keys the forward popover must be given. */
  readonly resolveAdditionalKeys: RepositoryTabMatchKeyResolver
  readonly resolveLabel: (tab: IRepositoryTab) => string
  /** Called with the new active tab id once tabs have been closed. */
  readonly onClosed: (activeTabId: string | null) => void
  /** Called to dismiss the popover without closing any tabs. */
  readonly onClose: () => void
}

interface ICloseTabsExceptContainingPopoverState {
  readonly query: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
  readonly isSubmitting: boolean
  readonly error: string | null
}

/**
 * A bounded Material confirmation for the inverse bulk-close action. It negates
 * "Close tabs containing" exactly — same mode, same casing, same searched keys —
 * by reading the stored settings that popover writes, so one phrase can never
 * mean two different things in the two directions. An empty, invalid or
 * zero-match query still can never become an accidental close-all.
 */
export class CloseTabsExceptContainingPopover extends React.Component<
  ICloseTabsExceptContainingPopoverProps,
  ICloseTabsExceptContainingPopoverState
> {
  public constructor(props: ICloseTabsExceptContainingPopoverProps) {
    super(props)
    this.state = {
      query: '',
      mode: readCloseTabsFilterMode(),
      caseSensitive: readCloseTabsCaseSensitive(),
      isSubmitting: false,
      error: null,
    }
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, error: null })
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onConfirm()
    }
  }

  /** The inverse half of the predicate the forward popover runs. */
  private preview() {
    const { query, mode, caseSensitive } = this.state
    return this.props.tabsStore.previewCloseTabsExceptContaining(
      query,
      mode,
      caseSensitive,
      this.props.resolveAdditionalKeys
    )
  }

  private onConfirm = () => {
    const { query, mode, caseSensitive, isSubmitting } = this.state
    if (isSubmitting || !this.preview().canClose) {
      return
    }

    this.setState({ isSubmitting: true, error: null })
    this.props.tabsStore
      .closeTabsExceptContaining(
        query,
        mode,
        caseSensitive,
        this.props.resolveAdditionalKeys
      )
      .then(activeTabId => {
        this.props.onClosed(activeTabId)
        this.props.onClose()
      })
      .catch(err => {
        log.error('Failed to close inverse-matching tabs', err)
        this.setState({
          isSubmitting: false,
          error:
            'The change could not be saved. Review open tabs before trying again.',
        })
      })
  }

  public render() {
    const { query, mode, caseSensitive, isSubmitting, error } = this.state
    const preview = this.preview()
    const hasQuery = query.trim().length > 0
    const closedIds = new Set(preview.closedTabs.map(tab => tab.id))
    const pinnedProtected = preview.keptTabs.filter(
      tab => tab.isPinned === true
    ).length

    const status =
      error ??
      (preview.regexError !== null
        ? preview.regexError
        : !hasQuery
        ? 'Type a phrase to preview which tabs stay open.'
        : preview.matchingTabs.length === 0
        ? 'No tabs match. Nothing will close.'
        : preview.closedTabs.length === 0
        ? formatAllTabsStayOpen(preview.keptTabs.length)
        : `${preview.keptTabs.length} kept, ${
            preview.closedTabs.length
          } closed${
            pinnedProtected > 0 ? `, ${pinnedProtected} pinned protected` : ''
          }.`)

    // Seed the bounded preview with a representative match, protected pin, and
    // close candidate before filling in strip order. This prevents a long run
    // of one disposition from hiding the consequence of confirmation.
    const allTabs = this.props.tabsStore.getState().tabs
    const representativeTabs = [
      preview.matchingTabs[0],
      preview.keptTabs.find(tab => tab.isPinned === true),
      preview.closedTabs[0],
    ].filter((tab): tab is IRepositoryTab => tab !== undefined)
    const previewIds = new Set<string>()
    const previewTabs = [...representativeTabs, ...allTabs]
      .filter(tab => {
        if (previewIds.has(tab.id)) {
          return false
        }
        previewIds.add(tab.id)
        return true
      })
      .slice(0, 8)
    const remaining = allTabs.length - previewTabs.length

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="close-tabs-except-title"
        ariaDescribedBy="close-tabs-except-status"
        onClickOutside={this.props.onClose}
      >
        <div className="close-tabs-except">
          <header className="close-tabs-except-header">
            <h3 id="close-tabs-except-title">
              Close all tabs except those containing…
            </h3>
            <p>{describeMatching(mode, caseSensitive)}</p>
          </header>
          <label
            className="close-tabs-except-field"
            htmlFor="close-tabs-except-query"
          >
            <span>Text to keep</span>
            <input
              id="close-tabs-except-query"
              type="text"
              className="close-tabs-except-input"
              placeholder="Repository name, alias, or path"
              value={query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onKeyDown}
              aria-describedby="close-tabs-except-status"
            />
          </label>
          <div
            id="close-tabs-except-status"
            className={
              error === null && preview.regexError === null
                ? 'close-tabs-except-status'
                : 'close-tabs-except-status error'
            }
            role="status"
            aria-live="polite"
          >
            {status}
          </div>
          {hasQuery && preview.matchingTabs.length > 0 && (
            <div
              className="close-tabs-except-preview"
              role="region"
              aria-label="Tab close preview"
            >
              <ul>
                {previewTabs.map(tab => {
                  const disposition =
                    tab.isPinned === true
                      ? 'Protected pinned'
                      : closedIds.has(tab.id)
                      ? 'Close'
                      : 'Keep'
                  return (
                    <li key={tab.id} data-disposition={disposition}>
                      <span className="close-tabs-except-preview-label">
                        {this.props.resolveLabel(tab)}
                      </span>
                      <span className="close-tabs-except-preview-action">
                        {disposition}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {remaining > 0 && (
                <p className="close-tabs-except-more">
                  {formatRemainingTabCount(remaining)}
                </p>
              )}
            </div>
          )}
          <div className="close-tabs-except-actions">
            <button
              type="button"
              className="close-tabs-except-cancel"
              onClick={this.props.onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="close-tabs-except-confirm"
              disabled={!preview.canClose || isSubmitting}
              onClick={this.onConfirm}
            >
              {isSubmitting
                ? 'Closing…'
                : preview.closedTabs.length > 0
                ? `Close ${preview.closedTabs.length}`
                : 'Close tabs'}
            </button>
          </div>
        </div>
      </Popover>
    )
  }
}
