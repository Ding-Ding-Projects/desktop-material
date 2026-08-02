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
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  translatedVariable,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'

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
function describeMatching(
  mode: FilterMode,
  caseSensitive: boolean,
  languageMode: LanguageMode
): string {
  const strategyKey: TranslationKey =
    mode === FilterMode.Regex
      ? 'tabs.close.matchStrategyRegex'
      : mode === FilterMode.Fuzzy
      ? 'tabs.close.matchStrategyFuzzy'
      : 'tabs.close.matchStrategySubstring'
  const casingKey: TranslationKey = caseSensitive
    ? 'tabs.close.matchCaseSensitive'
    : 'tabs.close.matchCaseInsensitive'
  return translate('tabs.close.matchDescription', languageMode, {
    strategy: translatedVariable(strategyKey),
    casing: translatedVariable(casingKey),
  })
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
  readonly errorKey: TranslationKey | null
  readonly languageMode: LanguageMode
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
      errorKey: null,
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

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, errorKey: null })
  }

  private onModeChange = (mode: FilterMode) => {
    persistFilterMode(CloseTabsFilterListId, mode)
    this.setState({ mode, errorKey: null })
  }

  private onCaseSensitiveChange = (caseSensitive: boolean) => {
    // Persisted because the inverse popover has no controls of its own and
    // reads this casing to stay the negation of this action.
    setBoolean(CloseTabsCaseSensitiveKey, caseSensitive)
    this.setState({ caseSensitive, errorKey: null })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, errorKey: null })
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

    this.setState({ isSubmitting: true, errorKey: null })
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
          errorKey: 'tabs.close.saveError',
        })
      })
  }

  public render() {
    const { query, mode, caseSensitive, isSubmitting, errorKey } = this.state
    const { tabs, regexError } = this.findMatches()
    const closableCount = tabs.filter(tab => tab.isPinned !== true).length
    const protectedCount = tabs.length - closableCount
    const hasQuery = query.trim().length > 0

    const status =
      (errorKey !== null ? this.text(errorKey) : null) ??
      (regexError !== null
        ? this.text('regex.error.invalidOrUnsupported', {
            detail: regexError,
          })
        : !hasQuery
        ? this.text('tabs.closeContaining.previewPrompt')
        : tabs.length === 0
        ? this.text('tabs.close.noMatches')
        : this.text('tabs.closeContaining.matchSummary', {
            closeCount: String(closableCount),
            pinnedCount: String(protectedCount),
          }))

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
          <h3
            id="close-tabs-containing-title"
            aria-label={this.accessibleText('tabs.closeContaining.title')}
          >
            <span aria-hidden="true">
              {this.text('tabs.closeContaining.title')}
            </span>
          </h3>
          <div className="close-tabs-containing-field">
            <input
              data-search-surface-id="close-tabs-containing"
              type="text"
              className="close-tabs-containing-input"
              placeholder={this.text('tabs.closeContaining.placeholder')}
              value={query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onKeyDown}
              aria-label={this.accessibleText('tabs.closeContaining.title')}
              aria-describedby="close-tabs-containing-status"
            />
            <FilterModeControl
              searchSurfaceId="close-tabs-containing"
              mode={mode}
              caseSensitive={caseSensitive}
              onModeChange={this.onModeChange}
              onCaseSensitiveChange={this.onCaseSensitiveChange}
              regexBuilderTarget={this.text('tabs.close.openTabsTarget')}
              getSampleItems={this.getFilterSampleItems}
              filterText={query}
              onRegexPatternApply={this.onRegexPatternApply}
            />
          </div>
          <div
            id="close-tabs-containing-status"
            className={
              regexError === null && errorKey === null
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
              aria-label={this.accessibleText('tabs.close.cancel')}
            >
              {this.text('tabs.close.cancel')}
            </button>
            <button
              type="button"
              className="close-tabs-containing-confirm"
              disabled={closableCount === 0 || isSubmitting}
              onClick={this.onConfirm}
              aria-label={
                isSubmitting
                  ? this.accessibleText('tabs.close.closing')
                  : closableCount > 0
                  ? this.accessibleText('tabs.close.count', {
                      count: String(closableCount),
                    })
                  : this.accessibleText('tabs.close.action')
              }
            >
              {isSubmitting
                ? this.text('tabs.close.closing')
                : closableCount > 0
                ? this.text('tabs.close.count', {
                    count: String(closableCount),
                  })
                : this.text('tabs.close.action')}
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
  readonly errorKey: TranslationKey | null
  readonly languageMode: LanguageMode
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
      errorKey: null,
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

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value, errorKey: null })
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

    this.setState({ isSubmitting: true, errorKey: null })
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
          errorKey: 'tabs.close.saveError',
        })
      })
  }

  public render() {
    const { query, mode, caseSensitive, isSubmitting, errorKey } = this.state
    const preview = this.preview()
    const hasQuery = query.trim().length > 0
    const closedIds = new Set(preview.closedTabs.map(tab => tab.id))
    const pinnedProtected = preview.keptTabs.filter(
      tab => tab.isPinned === true
    ).length

    const status =
      (errorKey !== null ? this.text(errorKey) : null) ??
      (preview.regexError !== null
        ? this.text('regex.error.invalidOrUnsupported', {
            detail: preview.regexError,
          })
        : !hasQuery
        ? this.text('tabs.closeExcept.previewPrompt')
        : preview.matchingTabs.length === 0
        ? this.text('tabs.close.noMatches')
        : preview.closedTabs.length === 0
        ? this.text(
            preview.keptTabs.length === 1
              ? 'tabs.closeExcept.allStayOpenOne'
              : 'tabs.closeExcept.allStayOpenMany',
            { count: String(preview.keptTabs.length) }
          )
        : this.text(
            pinnedProtected > 0
              ? 'tabs.closeExcept.summaryWithPinned'
              : 'tabs.closeExcept.summary',
            {
              keptCount: String(preview.keptTabs.length),
              closedCount: String(preview.closedTabs.length),
              pinnedCount: String(pinnedProtected),
            }
          ))

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
            <h3
              id="close-tabs-except-title"
              aria-label={this.accessibleText('tabs.closeExcept.title')}
            >
              <span aria-hidden="true">
                {this.text('tabs.closeExcept.title')}
              </span>
            </h3>
            <p>
              {describeMatching(mode, caseSensitive, this.state.languageMode)}
            </p>
          </header>
          <label
            className="close-tabs-except-field"
            htmlFor="close-tabs-except-query"
          >
            <span>{this.text('tabs.closeExcept.fieldLabel')}</span>
            <input
              id="close-tabs-except-query"
              type="text"
              className="close-tabs-except-input"
              placeholder={this.text('tabs.closeExcept.placeholder')}
              value={query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onKeyDown}
              aria-label={this.accessibleText('tabs.closeExcept.fieldLabel')}
              aria-describedby="close-tabs-except-status"
            />
          </label>
          <div
            id="close-tabs-except-status"
            className={
              errorKey === null && preview.regexError === null
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
              aria-label={this.accessibleText('tabs.closeExcept.previewAria')}
            >
              <ul>
                {previewTabs.map(tab => {
                  const disposition =
                    tab.isPinned === true
                      ? 'pinned'
                      : closedIds.has(tab.id)
                      ? 'close'
                      : 'keep'
                  const dispositionKey: TranslationKey =
                    disposition === 'pinned'
                      ? 'tabs.closeExcept.dispositionPinned'
                      : disposition === 'close'
                      ? 'tabs.closeExcept.dispositionClose'
                      : 'tabs.closeExcept.dispositionKeep'
                  return (
                    <li key={tab.id} data-disposition={disposition}>
                      <span className="close-tabs-except-preview-label">
                        {this.props.resolveLabel(tab)}
                      </span>
                      <span className="close-tabs-except-preview-action">
                        {this.text(dispositionKey)}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {remaining > 0 && (
                <p className="close-tabs-except-more">
                  {this.text(
                    remaining === 1
                      ? 'tabs.closeExcept.remainingOne'
                      : 'tabs.closeExcept.remainingMany',
                    { count: String(remaining) }
                  )}
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
              aria-label={this.accessibleText('tabs.close.cancel')}
            >
              {this.text('tabs.close.cancel')}
            </button>
            <button
              type="button"
              className="close-tabs-except-confirm"
              disabled={!preview.canClose || isSubmitting}
              onClick={this.onConfirm}
              aria-label={
                isSubmitting
                  ? this.accessibleText('tabs.close.closing')
                  : preview.closedTabs.length > 0
                  ? this.accessibleText('tabs.close.count', {
                      count: String(preview.closedTabs.length),
                    })
                  : this.accessibleText('tabs.close.closeTabs')
              }
            >
              {isSubmitting
                ? this.text('tabs.close.closing')
                : preview.closedTabs.length > 0
                ? this.text('tabs.close.count', {
                    count: String(preview.closedTabs.length),
                  })
                : this.text('tabs.close.closeTabs')}
            </button>
          </div>
        </div>
      </Popover>
    )
  }
}
