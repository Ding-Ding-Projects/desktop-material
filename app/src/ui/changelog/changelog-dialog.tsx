import * as React from 'react'
import classNames from 'classnames'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import { FilterModeControl } from '../lib/filter-mode-control'
import { DateRangePicker } from '../lib/date-range-picker'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { FilterMode } from '../../lib/fuzzy-find'
import {
  ChangelogCategories,
  ChangelogReleases,
  ChangelogSummary,
  CurrentChangelogVersion,
  IChangelogRelease,
} from '../../lib/changelog/changelog-catalog'
import {
  DefaultChangelogFilter,
  filterChangelog,
  IChangelogFilter,
  isEmptyChangelogFilter,
} from '../../lib/changelog/changelog-filter'
import {
  ChangelogExportFormat,
  exportChangelog,
  formatExportStamp,
  getChangelogExportFileName,
  IChangelogExportContext,
} from '../../lib/changelog/changelog-export'
import { formatIsoDate } from '../../lib/changelog/changelog-dates'
import { LinkButton } from '../lib/link-button'
import { commitUrl } from '../../lib/changelog/commit-url'
import {
  getPersistedLanguageMode,
  normalizeLocale,
  SupportedLocale,
  translate,
  TranslationKey,
  TranslationVariables,
  translateForAccessibleName,
  LanguageModeChangedEvent,
} from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { MaterialSymbol } from '../lib/material-symbol'

/**
 * The in-app changelog viewer: every recorded release, narrowed by text,
 * category and date, and exportable exactly as shown.
 *
 * It covers the whole history rather than the newest release, which is the one
 * thing the existing release-notes dialog cannot do — that dialog sends anyone
 * asking "when did this change?" out to a website.
 *
 * Releases render in pages of {@link PageSize}. 683 releases holding 3,694
 * entries is more DOM than a dialog should build up front, and a viewer that
 * takes a second to open is a viewer nobody opens twice.
 */

const PageSize = 40

/** localStorage key for the search's filter mode, shared with every surface. */
const ChangelogFilterListId = 'changelog-viewer'
const ChangelogSearchSurfaceId = 'changelog-viewer'

interface IChangelogDialogProps {
  readonly onDismissed: () => void
  /**
   * Where an export is written and how the user is told. Injected so the
   * dialog does not reach for the file system or the notification store
   * itself, and so both paths are testable.
   */
  readonly onExport?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>
  readonly onNotify?: (message: string) => void
  /** The clock the date presets resolve against. */
  readonly today?: Date
}

interface IChangelogDialogState {
  readonly filter: IChangelogFilter
  readonly languageMode: LanguageMode
  readonly funnyLevels: IFunnyLevels
  readonly visibleCount: number
  readonly datePickerOpen: boolean
  readonly exportMenuOpen: boolean
}

export class ChangelogDialog extends React.Component<
  IChangelogDialogProps,
  IChangelogDialogState
> {
  // The date-filter button is a shared Button now, so its element arrives via
  // onButtonRef rather than React.createRef's read-only current.
  private dateButtonRef: HTMLButtonElement | null = null

  private setDateButtonRef = (element: HTMLButtonElement | null) => {
    this.dateButtonRef = element
  }
  private readonly today: Date

  public constructor(props: IChangelogDialogProps) {
    super(props)
    this.today = props.today ?? new Date()
    this.state = {
      filter: {
        ...DefaultChangelogFilter,
        mode: readPersistedFilterMode(ChangelogFilterListId),
      },
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
      visibleCount: PageSize,
      datePickerOpen: false,
      exportMenuOpen: false,
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
      this.setState({ languageMode, funnyLevels: readFunnyLevels() })
    }
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.state.languageMode)

  private get locale(): SupportedLocale {
    return normalizeLocale(
      this.state.languageMode === 'cantonese' ? 'zh-HK' : 'en'
    )
  }

  private updateFilter(update: Partial<IChangelogFilter>) {
    // Any narrowing resets the page: keeping a deep scroll position across a
    // new search would show page 8 of a 2-release result.
    this.setState(previous => ({
      filter: { ...previous.filter, ...update },
      visibleCount: PageSize,
    }))
  }

  private onQueryChanged = (query: string) => {
    this.updateFilter({ query })
  }

  private onModeChanged = (mode: FilterMode) => {
    persistFilterMode(ChangelogFilterListId, mode)
    this.updateFilter({ mode })
  }

  private onCaseSensitiveChanged = (caseSensitive: boolean) => {
    this.updateFilter({ caseSensitive })
  }

  private onRegexPatternApply = (query: string) => {
    this.updateFilter({ query })
  }

  private getSampleItems = (): ReadonlyArray<string> => {
    // The builder's tester needs real text to try a pattern against, and the
    // first page is representative without walking 3,694 entries.
    const samples = new Array<string>()
    for (const release of ChangelogReleases) {
      for (const entry of release.entries) {
        samples.push(entry.text)
        if (samples.length >= 50) {
          return samples
        }
      }
    }
    return samples
  }

  private onToggleCategory = (event: React.MouseEvent<HTMLButtonElement>) => {
    const raw = event.currentTarget.dataset.category
    const category = raw === '' ? null : raw ?? null
    const categories = this.state.filter.categories
    this.updateFilter({
      categories: categories.includes(category)
        ? categories.filter(existing => existing !== category)
        : [...categories, category],
    })
  }

  private onClearCategories = () => this.updateFilter({ categories: [] })

  private onToggleDatePicker = () =>
    this.setState({ datePickerOpen: !this.state.datePickerOpen })

  private onCloseDatePicker = () => this.setState({ datePickerOpen: false })

  private onRangeChanged = (range: {
    from: string | null
    to: string | null
  }) => {
    this.updateFilter({ from: range.from, to: range.to })
  }

  private onToggleIncludeUndated = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.updateFilter({ includeUndated: event.currentTarget.checked })
  }

  private onResetFilters = () => {
    this.setState({
      filter: { ...DefaultChangelogFilter, mode: this.state.filter.mode },
      visibleCount: PageSize,
    })
  }

  private onShowMore = () => {
    this.setState({ visibleCount: this.state.visibleCount + PageSize })
  }

  private buildExportContext(
    result: ReturnType<typeof filterChangelog>
  ): IChangelogExportContext {
    return {
      filter: this.state.filter,
      totalReleaseCount: ChangelogSummary.versionCount,
      hiddenUndatedCount: result.hiddenUndatedCount,
      appVersion: CurrentChangelogVersion,
      exportedAt: formatExportStamp(new Date()),
    }
  }

  private onCopy = async () => {
    const result = this.getResult()
    const contents = exportChangelog(
      result.releases,
      this.buildExportContext(result),
      'markdown'
    )
    // A clipboard write rejects for reasons the user can do something about —
    // the document is not focused, permission was denied — and an uncaught one
    // reaches the global handler, which says only that "a background action
    // stopped unexpectedly", in English, with no mention of the copy.
    try {
      await navigator.clipboard.writeText(contents)
    } catch (error) {
      this.props.onNotify?.(
        this.text('changelog.copyFailed', {
          error: error instanceof Error ? error.message : String(error),
        })
      )
      return
    }
    this.props.onNotify?.(
      this.text('changelog.copied', { count: String(result.releases.length) })
    )
  }

  private exportAs = async (format: ChangelogExportFormat) => {
    this.setState({ exportMenuOpen: false })
    const result = this.getResult()
    const context = this.buildExportContext(result)
    const contents = exportChangelog(result.releases, context, format)
    const fileName = getChangelogExportFileName(context, format)

    if (this.props.onExport === undefined) {
      return
    }
    try {
      const path = await this.props.onExport(contents, fileName)
      if (path === null) {
        // The save dialog was cancelled; saying "exported" would be a lie.
        return
      }
      this.props.onNotify?.(
        this.text('changelog.exported', {
          count: String(result.releases.length),
          path,
        })
      )
    } catch (error) {
      this.props.onNotify?.(
        this.text('changelog.exportFailed', {
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }

  private onExportMarkdown = () => this.exportAs('markdown')
  private onExportText = () => this.exportAs('text')
  private onToggleExportMenu = () =>
    this.setState({ exportMenuOpen: !this.state.exportMenuOpen })

  private getResult() {
    return filterChangelog(ChangelogReleases, this.state.filter)
  }

  private renderCategories() {
    const active = this.state.filter.categories
    return (
      <div
        className="changelog-categories"
        role="group"
        aria-label={this.accessibleText('changelog.categories')}
      >
        <button
          type="button"
          className={classNames('changelog-category', {
            active: active.length === 0,
          })}
          aria-pressed={active.length === 0}
          onClick={this.onClearCategories}
        >
          {this.text('changelog.categoryAll')}
        </button>
        {ChangelogCategories.map(({ category, count }) => (
          <button
            key={category ?? '(uncategorized)'}
            type="button"
            // An empty string round-trips as null through the dataset, which
            // cannot hold null. The real "no category" bucket is a filter
            // choice like any other, not an absence.
            data-category={category ?? ''}
            className={classNames('changelog-category', {
              active: active.includes(category),
            })}
            aria-pressed={active.includes(category)}
            onClick={this.onToggleCategory}
          >
            {category ?? this.text('changelog.uncategorized')}
            <span className="changelog-category-count">{count}</span>
          </button>
        ))}
      </div>
    )
  }

  private renderDateControl() {
    const { from, to } = this.state.filter
    const active = from !== null || to !== null
    const label = active
      ? this.text('changelog.dateFilterActive', {
          range: `${from === null ? '…' : formatIsoDate(from, this.locale)} – ${
            to === null ? '…' : formatIsoDate(to, this.locale)
          }`,
        })
      : this.text('changelog.dateFilter')

    return (
      <>
        <Button
          type="button"
          onButtonRef={this.setDateButtonRef}
          className={classNames('changelog-date-button', { active })}
          ariaExpanded={this.state.datePickerOpen}
          ariaHaspopup="dialog"
          inferTooltip={false}
          onClick={this.onToggleDatePicker}
        >
          <MaterialSymbol name="calendar_today" />
          {label}
        </Button>
        {this.state.datePickerOpen && (
          <Popover
            anchor={this.dateButtonRef}
            anchorPosition={PopoverAnchorPosition.BottomLeft}
            onClickOutside={this.onCloseDatePicker}
            ariaLabelledby="changelog-date-picker-label"
            // Without a decoration the popover has no background, no border
            // and no elevation, so the calendar floated over the dialog with
            // the category chips showing straight through it.
            decoration={PopoverDecoration.Bordered}
            className="changelog-date-popover"
          >
            <h3 id="changelog-date-picker-label" className="sr-only">
              {this.accessibleText('dateRange.calendarLabel')}
            </h3>
            <DateRangePicker
              range={{ from, to }}
              onRangeChanged={this.onRangeChanged}
              languageMode={this.state.languageMode}
              locale={this.locale}
              today={this.today}
              earliest={ChangelogSummary.oldestDate}
              latest={ChangelogSummary.newestDate}
            />
            <Checkbox
              className="changelog-include-undated"
              value={
                this.state.filter.includeUndated
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              label={this.text('changelog.includeUndated')}
              onChange={this.onToggleIncludeUndated}
            />
          </Popover>
        )}
      </>
    )
  }

  private renderRelease(release: IChangelogRelease) {
    const current = release.version === CurrentChangelogVersion
    return (
      <section
        key={release.version}
        className={classNames('changelog-release', { current })}
      >
        <header>
          <h3 className="changelog-version">
            {release.version}
            {current && (
              <span className="changelog-current-badge">
                {this.text('changelog.currentVersion')}
              </span>
            )}
          </h3>
          <p className="changelog-stamp">
            {release.date === null ? (
              // Never left blank: an empty date reads as a rendering bug
              // rather than as a fact about the repository.
              <em>{this.text('changelog.dateUnrecorded')}</em>
            ) : (
              <>
                <time dateTime={release.date}>
                  {formatIsoDate(release.date, this.locale)}
                </time>
                {release.time !== null && (
                  // Always 24-hour; the catalog never stores an AM/PM form.
                  <span className="changelog-time">{release.time}</span>
                )}
              </>
            )}
          </p>
        </header>
        {release.entries.length === 0 ? (
          <p className="changelog-no-changes">
            {this.text('changelog.noChanges')}
          </p>
        ) : (
          <ul className="changelog-entries">
            {release.entries.map((entry, index) => (
              <li key={`${release.version}-${index}`}>
                {entry.category !== null && (
                  <span
                    className="changelog-entry-category"
                    data-category={entry.category.toLowerCase()}
                  >
                    {entry.category}
                  </span>
                )}
                <span className="changelog-entry-text">{entry.text}</span>
                {entry.commit !== null && (
                  <LinkButton
                    className="changelog-entry-commit"
                    uri={commitUrl(entry.commit)}
                    title={this.accessibleText('changelog.openCommit', {
                      commit: entry.commit,
                    })}
                  >
                    {entry.commit.slice(0, 7)}
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  public render() {
    const result = this.getResult()
    const shown = result.releases.slice(0, this.state.visibleCount)
    const remaining = result.releases.length - shown.length

    return (
      <Dialog
        id="changelog"
        title={this.text('changelog.title')}
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>
          <div className="changelog-controls">
            <div className="changelog-search">
              <MaterialSymbol name="search" />
              <TextBox
                type="text"
                searchSurfaceId={ChangelogSearchSurfaceId}
                value={this.state.filter.query}
                placeholder={this.text('changelog.searchPlaceholder')}
                ariaLabel={this.accessibleText('changelog.searchLabel')}
                spellcheck={false}
                onValueChanged={this.onQueryChanged}
              />
              <FilterModeControl
                searchSurfaceId={ChangelogSearchSurfaceId}
                mode={this.state.filter.mode}
                caseSensitive={this.state.filter.caseSensitive}
                onModeChange={this.onModeChanged}
                onCaseSensitiveChange={this.onCaseSensitiveChanged}
                regexBuilderTarget={this.text('changelog.title')}
                getSampleItems={this.getSampleItems}
                filterText={this.state.filter.query}
                onRegexPatternApply={this.onRegexPatternApply}
              />
            </div>
            {this.renderDateControl()}
          </div>

          {this.renderCategories()}

          <p className="changelog-summary" aria-live="polite">
            {translateWithFunnyLevel(
              'changelog.summary',
              this.state.languageMode,
              this.state.funnyLevels,
              {
                releases: String(result.releases.length),
                total: String(ChangelogSummary.versionCount),
                entries: String(result.matchedEntryCount),
              }
            )}
            {result.hiddenUndatedCount > 0 &&
              !this.state.filter.includeUndated && (
                <span className="changelog-undated-note">
                  {this.text('changelog.undatedHidden', {
                    count: String(result.hiddenUndatedCount),
                  })}
                </span>
              )}
            {result.regexError !== null && (
              <span className="changelog-regex-error" role="alert">
                {result.regexError}
              </span>
            )}
          </p>

          <div className="changelog-list">
            {shown.length === 0 ? (
              <p className="changelog-empty">
                {translateWithFunnyLevel(
                  'changelog.empty',
                  this.state.languageMode,
                  this.state.funnyLevels
                )}
              </p>
            ) : (
              shown.map(release => this.renderRelease(release))
            )}
            {remaining > 0 && (
              <Button
                type="button"
                className="changelog-show-more"
                inferTooltip={false}
                onClick={this.onShowMore}
              >
                {this.text('changelog.showMore', {
                  count: String(Math.min(remaining, PageSize)),
                })}
              </Button>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="changelog-actions">
            <Button
              onClick={this.onResetFilters}
              disabled={isEmptyChangelogFilter(this.state.filter)}
            >
              {this.text('changelog.reset')}
            </Button>
            <Button onClick={this.onCopy}>{this.text('changelog.copy')}</Button>
            <div className="changelog-export">
              <Button
                onClick={this.onToggleExportMenu}
                ariaExpanded={this.state.exportMenuOpen}
              >
                {this.text('changelog.export')}
              </Button>
              {this.state.exportMenuOpen && (
                <div className="changelog-export-menu" role="menu">
                  <Button
                    type="button"
                    role="menuitem"
                    inferTooltip={false}
                    onClick={this.onExportMarkdown}
                  >
                    {this.text('changelog.exportMarkdown')}
                  </Button>
                  <Button
                    type="button"
                    role="menuitem"
                    inferTooltip={false}
                    onClick={this.onExportText}
                  >
                    {this.text('changelog.exportText')}
                  </Button>
                </div>
              )}
            </div>
            <Button type="submit">{this.text('changelog.close')}</Button>
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
