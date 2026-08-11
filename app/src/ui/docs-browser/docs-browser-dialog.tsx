import * as React from 'react'
import classNames from 'classnames'

import { Emoji } from '../../lib/emoji'
import {
  LanguageModeChangedEvent,
  TranslationKey,
  TranslationVariables,
  getPersistedLanguageMode,
  translate,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import {
  DocsBrowserArticles,
  DocsBrowserCategories,
  DocsBrowserExportFormat,
  IDocsBrowserArticle,
  IDocsBrowserMatch,
  docsBrowserExportFileName,
  exportDocsArticles,
  getDocsArticle,
  getFirstDocsArticle,
  resolveDocsBrowserLink,
  searchDocsArticles,
} from '../../lib/docs-browser/docs-browser-catalog'
import { MaterialSymbol } from '../lib/material-symbol'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import {
  IMd3RegexBuilderApplication,
  Md3Chip,
  Md3ChipRow,
  Md3EmptyState,
  Md3GhostButton,
  Md3IconButton,
  Md3RegexBuilderDialog,
  Md3SearchField,
  Md3TonalButton,
  notify,
} from '../md3'

/**
 * The in-app offline documentation browser.
 *
 * Every feature article under `docs/features` is compiled into the build by
 * `script/generate-docs-browser-bundle.mjs`, so this surface performs no fetch
 * of any kind and works with the network unplugged. That is the whole point of
 * it: a documentation link that opens a website is documentation the user does
 * not have when they most need it.
 *
 * Articles render through the app's one shared Markdown renderer — the
 * sandboxed iframe every release note, issue body and pull-request comment
 * already goes through — rather than a second renderer written for this
 * screen. The articles are local and trusted, but one isolated path means one
 * place where sanitisation, link interception and emoji resolution live.
 *
 * Links between articles resolve inside the app. Every relative link in the
 * bundle was rewritten at build time onto a reserved `.invalid` origin, which
 * is what makes a click reportable at all: the shared renderer only reports a
 * link whose protocol is http(s), so an untouched `../other.md` would be
 * cancelled silently and reach nothing. A link that resolves to no bundled
 * article says which path it pointed at instead of doing nothing.
 */

/** The persisted-selection id prefix for a row, so options can be addressed. */
const RowIdPrefix = 'docs-browser-row'

/** How many article titles seed the regex builder's live tester. */
const RegexSampleLimit = 50

export interface IDocsBrowserDialogProps {
  readonly onDismissed: () => void

  /**
   * The article to open with. The command palette teleports to a specific
   * article rather than the browser's front page, and passes its id here. An
   * id the bundle no longer holds falls back to the first article rather than
   * opening a neighbouring one.
   */
  readonly initialArticleId?: string

  /** Emoji shortcuts for the shared Markdown renderer. */
  readonly emoji: Map<string, Emoji>

  /** The app's link-underlining accessibility preference. */
  readonly underlineLinks: boolean

  /**
   * Writes an export to wherever the user picks, returning the path, or null
   * when they cancel. Injected so the surface never reaches for the file
   * system itself, and so the export path is testable without one.
   */
  readonly onExport?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>

  /** Opens a genuine web link in the user's browser, on their explicit click. */
  readonly onOpenExternalLink?: (url: string) => void
}

interface IDocsBrowserDialogState {
  readonly query: string
  readonly regexEnabled: boolean
  readonly caseSensitive: boolean
  readonly builderOpen: boolean
  /** The category chip in effect, or null for every category. */
  readonly category: string | null
  /** The article on screen. */
  readonly currentId: string | null
  /** The multi-selected articles, by id. */
  readonly selected: ReadonlySet<string>
  /** The row the listbox's `aria-activedescendant` points at. */
  readonly activeIndex: number
  /** Where a Shift range extends from. */
  readonly anchorIndex: number
  readonly languageMode: LanguageMode
  readonly funnyLevels: IFunnyLevels
}

export class DocsBrowserDialog extends React.Component<
  IDocsBrowserDialogProps,
  IDocsBrowserDialogState
> {
  private readonly titleId = createUniqueId('docs-browser-title')
  private readonly hintId = createUniqueId('docs-browser-hint')
  private readonly listId = createUniqueId('docs-browser-list')
  private readonly panelRef = React.createRef<HTMLDivElement>()
  private readonly listRef = React.createRef<HTMLUListElement>()
  private openerElement: Element | null = null

  public constructor(props: IDocsBrowserDialogProps) {
    super(props)

    const requested =
      props.initialArticleId === undefined
        ? null
        : getDocsArticle(props.initialArticleId)
    const opening = requested ?? getFirstDocsArticle()

    this.state = {
      query: '',
      regexEnabled: false,
      caseSensitive: false,
      builderOpen: false,
      category: null,
      currentId: opening === null ? null : opening.id,
      selected: new Set<string>(),
      activeIndex: 0,
      anchorIndex: 0,
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
    }
  }

  public componentDidMount() {
    this.openerElement = document.activeElement
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.listRef.current?.focus()
    this.syncActiveIndexToCurrent()
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    releaseUniqueId(this.titleId)
    releaseUniqueId(this.hintId)
    releaseUniqueId(this.listId)
    // Give focus back to whatever opened the browser; without this a keyboard
    // user lands at the top of the document every time they close it.
    if (
      this.openerElement instanceof HTMLElement &&
      this.openerElement.isConnected
    ) {
      this.openerElement.focus()
    }
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

  /** The articles the category chips leave in play, before searching. */
  private get scopedArticles(): ReadonlyArray<IDocsBrowserArticle> {
    const { category } = this.state
    return category === null
      ? DocsBrowserArticles
      : DocsBrowserArticles.filter(article => article.category === category)
  }

  private get search() {
    return searchDocsArticles(
      this.scopedArticles,
      this.state.query,
      this.state.regexEnabled,
      this.state.caseSensitive
    )
  }

  private syncActiveIndexToCurrent() {
    const { currentId } = this.state
    if (currentId === null) {
      return
    }
    const index = this.search.matches.findIndex(
      match => match.article.id === currentId
    )
    if (index >= 0 && index !== this.state.activeIndex) {
      this.setState({ activeIndex: index, anchorIndex: index })
    }
  }

  private categoryLabel(name: string): string {
    switch (name) {
      case 'agent-api':
        return this.text('docsBrowser.category.agentApi')
      case 'collaboration':
        return this.text('docsBrowser.category.collaboration')
      case 'design-system':
        return this.text('docsBrowser.category.designSystem')
      case 'identity-and-workspace':
        return this.text('docsBrowser.category.identityAndWorkspace')
      case 'integrations':
        return this.text('docsBrowser.category.integrations')
      case 'linux-tui':
        return this.text('docsBrowser.category.linuxTui')
      case 'quality-and-reliability':
        return this.text('docsBrowser.category.qualityAndReliability')
      case 'repository-management':
        return this.text('docsBrowser.category.repositoryManagement')
      case 'review-and-diff':
        return this.text('docsBrowser.category.reviewAndDiff')
      case 'root':
        return this.text('docsBrowser.category.root')
      default: {
        // A category directory added after this build. Its generated label is
        // the honest fallback: inventing a translation for a name nobody has
        // seen would be worse than showing the folder's own words.
        const known = DocsBrowserCategories.find(entry => entry.name === name)
        return known?.label ?? name
      }
    }
  }

  private onQueryChanged = (query: string) => {
    this.setState({ query, activeIndex: 0, anchorIndex: 0 })
  }

  private onClearQuery = () => {
    this.setState({ query: '', activeIndex: 0, anchorIndex: 0 })
  }

  private onToggleRegex = () => {
    this.setState(previous => ({ regexEnabled: !previous.regexEnabled }))
  }

  private onOpenBuilder = () => {
    this.setState({ builderOpen: true })
  }

  private onDismissBuilder = () => {
    this.setState({ builderOpen: false })
  }

  private onApplyPattern = (application: IMd3RegexBuilderApplication) => {
    // Applying a pattern must also turn regex mode on, or the field would
    // search for the pattern's literal characters.
    this.setState({
      query: application.pattern,
      regexEnabled: true,
      caseSensitive: application.caseSensitive,
      activeIndex: 0,
      anchorIndex: 0,
    })
  }

  private onToggleCategory = (label: string) => {
    const entry = DocsBrowserCategories.find(
      category => this.categoryLabel(category.name) === label
    )
    const name = entry?.name ?? null
    this.setState(previous => ({
      category: previous.category === name ? null : name,
      activeIndex: 0,
      anchorIndex: 0,
    }))
  }

  private onShowAllCategories = () => {
    this.setState({ category: null, activeIndex: 0, anchorIndex: 0 })
  }

  private openArticle(id: string, index: number) {
    this.setState({ currentId: id, activeIndex: index, anchorIndex: index })
  }

  private toggleSelection(id: string, index: number) {
    this.setState(previous => {
      const selected = new Set(previous.selected)
      if (selected.has(id)) {
        selected.delete(id)
      } else {
        selected.add(id)
      }
      return { selected, activeIndex: index, anchorIndex: index }
    })
  }

  private selectRange(index: number) {
    const matches = this.search.matches
    this.setState(previous => {
      const from = Math.min(previous.anchorIndex, index)
      const to = Math.max(previous.anchorIndex, index)
      const selected = new Set(previous.selected)
      for (let i = from; i <= to; i++) {
        const match = matches[i]
        if (match !== undefined) {
          selected.add(match.article.id)
        }
      }
      return { selected, activeIndex: index }
    })
  }

  private onSelectAllListed = () => {
    const matches = this.search.matches
    this.setState({
      selected: new Set(matches.map(match => match.article.id)),
    })
  }

  private onInvertSelection = () => {
    const matches = this.search.matches
    this.setState(previous => {
      const selected = new Set<string>()
      for (const match of matches) {
        if (!previous.selected.has(match.article.id)) {
          selected.add(match.article.id)
        }
      }
      return { selected }
    })
  }

  private onClearSelection = () => {
    this.setState({ selected: new Set<string>() })
  }

  /**
   * The articles an export writes: the multi-selection when there is one, and
   * otherwise the single article on screen. Stated in the toast afterwards so
   * the count is never a surprise.
   */
  private get exportTargets(): ReadonlyArray<IDocsBrowserArticle> {
    const { selected, currentId } = this.state
    if (selected.size > 0) {
      return DocsBrowserArticles.filter(article => selected.has(article.id))
    }
    const current = currentId === null ? null : getDocsArticle(currentId)
    return current === null ? [] : [current]
  }

  private exportAs = (format: DocsBrowserExportFormat) => {
    const targets = this.exportTargets
    if (targets.length === 0) {
      notify(this.text('docsBrowser.exportEmpty'), { kind: 'warning' })
      return
    }

    const write = this.props.onExport
    if (write === undefined) {
      notify(
        this.text('docsBrowser.exportFailed', {
          message: this.text('docsBrowser.exportEmpty'),
        }),
        { kind: 'error' }
      )
      return
    }

    write(
      exportDocsArticles(targets, format),
      docsBrowserExportFileName(targets, format)
    )
      .then(destination => {
        if (destination === null) {
          return
        }
        notify(
          this.text('docsBrowser.exported', {
            count: String(targets.length),
            path: destination,
          }),
          { kind: 'success' }
        )
      })
      .catch((error: unknown) => {
        notify(
          this.text('docsBrowser.exportFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
          { kind: 'error' }
        )
      })
  }

  private onExportMarkdown = () => this.exportAs('markdown')
  private onExportText = () => this.exportAs('text')
  private onExportJson = () => this.exportAs('json')

  /**
   * Bulk delete, answered honestly.
   *
   * The articles ship inside the build and are read-only, so there is no
   * delete to offer. Saying so out loud beats both a missing control and a
   * control that looks live and does nothing.
   */
  private onExplainDelete = () => {
    notify(this.text('docsBrowser.deleteUnavailable'), { kind: 'info' })
  }

  private onMarkdownLinkClicked = (href: string) => {
    const target = resolveDocsBrowserLink(href)

    switch (target.kind) {
      case 'article': {
        if (target.article.id === this.state.currentId) {
          // Already here. The renderer cancels in-document jumps, so say what
          // the link pointed at rather than appearing to ignore the click.
          notify(
            this.text('docsBrowser.linkSection', {
              section: target.fragment ?? target.article.title,
            }),
            { kind: 'info' }
          )
          return
        }
        const index = this.search.matches.findIndex(
          match => match.article.id === target.article.id
        )
        this.setState({
          currentId: target.article.id,
          activeIndex: index >= 0 ? index : this.state.activeIndex,
          anchorIndex: index >= 0 ? index : this.state.anchorIndex,
        })
        notify(
          this.text('docsBrowser.linkOpened', { title: target.article.title }),
          { kind: 'info' }
        )
        return
      }
      case 'unbundled':
        notify(this.text('docsBrowser.linkUnbundled', { path: target.path }), {
          kind: 'warning',
        })
        return
      case 'external':
        if (this.props.onOpenExternalLink === undefined) {
          notify(
            this.text('docsBrowser.linkUnreadable', { href: target.href }),
            { kind: 'warning' }
          )
          return
        }
        notify(this.text('docsBrowser.linkExternal', { href: target.href }), {
          kind: 'info',
        })
        this.props.onOpenExternalLink(target.href)
        return
      default:
        notify(this.text('docsBrowser.linkUnreadable', { href: target.href }), {
          kind: 'warning',
        })
    }
  }

  private onScrimClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      this.props.onDismissed()
    }
  }

  private onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.props.onDismissed()
    }
  }

  private onRowClick = (event: React.MouseEvent<HTMLLIElement>) => {
    const index = Number(event.currentTarget.dataset.index)
    const match = this.search.matches[index]
    if (match === undefined) {
      return
    }

    if (event.shiftKey) {
      event.preventDefault()
      this.selectRange(index)
      return
    }

    const onCheck =
      event.target instanceof Element &&
      event.target.closest('.docs-browser-row__check') !== null

    if (onCheck || event.ctrlKey || event.metaKey) {
      event.preventDefault()
      this.toggleSelection(match.article.id, index)
      return
    }

    this.openArticle(match.article.id, index)
  }

  private moveActive(delta: number, extend: boolean) {
    const matches = this.search.matches
    if (matches.length === 0) {
      return
    }
    const next = Math.min(
      matches.length - 1,
      Math.max(0, this.state.activeIndex + delta)
    )
    if (extend) {
      this.selectRange(next)
      return
    }
    this.setState({ activeIndex: next, anchorIndex: next })
  }

  private onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const matches = this.search.matches
    const active = matches[this.state.activeIndex]

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.moveActive(1, event.shiftKey)
        return
      case 'ArrowUp':
        event.preventDefault()
        this.moveActive(-1, event.shiftKey)
        return
      case 'Home':
        event.preventDefault()
        this.setState({ activeIndex: 0, anchorIndex: 0 })
        return
      case 'End':
        event.preventDefault()
        this.setState({
          activeIndex: Math.max(0, matches.length - 1),
          anchorIndex: Math.max(0, matches.length - 1),
        })
        return
      case ' ':
        event.preventDefault()
        if (active !== undefined) {
          this.toggleSelection(active.article.id, this.state.activeIndex)
        }
        return
      case 'Enter':
        event.preventDefault()
        if (active !== undefined) {
          this.openArticle(active.article.id, this.state.activeIndex)
        }
        return
      case 'a':
      case 'A':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          this.onSelectAllListed()
        }
        return
      default:
        return
    }
  }

  private renderRow(match: IDocsBrowserMatch, index: number) {
    const { article } = match
    const selected = this.state.selected.has(article.id)
    const current = article.id === this.state.currentId
    const active = index === this.state.activeIndex

    return (
      /* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the
         listbox itself owns every keyboard gesture (arrows, Space, Enter,
         Ctrl+A); the option is a pointer target only, exactly as the ARIA
         listbox pattern prescribes. */
      <li
        key={article.id}
        id={`${RowIdPrefix}-${index}`}
        role="option"
        data-index={index}
        aria-selected={selected}
        aria-current={current ? 'true' : undefined}
        className={classNames('docs-browser-row', {
          'docs-browser-row--current': current,
          'docs-browser-row--active': active,
          'docs-browser-row--selected': selected,
        })}
        onClick={this.onRowClick}
      >
        <span className="docs-browser-row__check" aria-hidden="true">
          <MaterialSymbol
            name={selected ? 'check_box' : 'check_box_outline_blank'}
            size={16}
          />
        </span>
        <span className="docs-browser-row__copy">
          <span className="docs-browser-row__title">{article.title}</span>
          <span className="docs-browser-row__meta">
            {this.categoryLabel(article.category)}
          </span>
          {match.snippet === '' ? (
            <span className="docs-browser-row__snippet">
              {article.description}
            </span>
          ) : (
            <span className="docs-browser-row__snippet">{match.snippet}</span>
          )}
        </span>
      </li>
    )
  }

  private renderArticle(article: IDocsBrowserArticle | null) {
    if (article === null) {
      return (
        <div className="docs-browser-article">
          <Md3EmptyState
            icon="menu_book"
            message={this.text('docsBrowser.offlineNote')}
          />
        </div>
      )
    }

    return (
      <div className="docs-browser-article">
        <div className="docs-browser-article__header">
          <h2 className="docs-browser-article__title">{article.title}</h2>
          <span className="docs-browser-article__source">
            {this.text('docsBrowser.sourcePath', { path: article.sourcePath })}
          </span>
        </div>
        <div className="docs-browser-article__body">
          <SandboxedMarkdown
            markdown={article.markdown}
            emoji={this.props.emoji}
            underlineLinks={this.props.underlineLinks}
            onMarkdownLinkClicked={this.onMarkdownLinkClicked}
            ariaLabel={this.text('docsBrowser.articleLabel', {
              title: article.title,
            })}
          />
        </div>
      </div>
    )
  }

  private renderBuilder() {
    if (!this.state.builderOpen) {
      return null
    }

    return (
      <Md3RegexBuilderDialog
        targetLabel={this.text('docsBrowser.searchField')}
        initialPattern={this.state.query}
        sampleItems={DocsBrowserArticles.slice(0, RegexSampleLimit).map(
          article => article.title
        )}
        onApply={this.onApplyPattern}
        onDismissed={this.onDismissBuilder}
      />
    )
  }

  public render() {
    const { matches, error } = this.search
    const current =
      this.state.currentId === null
        ? null
        : getDocsArticle(this.state.currentId)
    const selectedCount = this.state.selected.size
    const activeId =
      matches.length === 0
        ? undefined
        : `${RowIdPrefix}-${Math.min(
            this.state.activeIndex,
            matches.length - 1
          )}`

    const summary = translateWithFunnyLevel(
      'docsBrowser.summary',
      this.state.languageMode,
      this.state.funnyLevels,
      {
        shown: String(matches.length),
        total: String(DocsBrowserArticles.length),
      }
    )

    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
            the scrim's click is a pointer shortcut for the close button and
            Escape, both of which are present. */}
        <div
          className="docs-browser-scrim md3-anim-fade--overlay"
          onClick={this.onScrimClick}
          onKeyDown={this.onPanelKeyDown}
        >
          <div
            ref={this.panelRef}
            className="docs-browser md3-anim-menu"
            role="dialog"
            aria-modal={true}
            aria-labelledby={this.titleId}
          >
            <div className="docs-browser__header">
              <MaterialSymbol
                className="docs-browser__header-icon"
                name="menu_book"
                size={18}
              />
              <span id={this.titleId} className="docs-browser__title">
                {this.text('docsBrowser.title')}
              </span>
              <span className="docs-browser__offline">
                {this.text('docsBrowser.offlineNote')}
              </span>
              <Md3IconButton
                small={true}
                icon="close"
                iconSize={16}
                label={this.text('docsBrowser.close')}
                onClick={this.props.onDismissed}
              />
            </div>

            <div className="docs-browser__body">
              <div className="docs-browser__rail">
                <Md3SearchField
                  id={`${this.listId}-search`}
                  searchSurfaceId="md3-docs-browser"
                  value={this.state.query}
                  placeholder={this.text('docsBrowser.searchPlaceholder')}
                  fieldLabel={this.text('docsBrowser.searchField')}
                  regexEnabled={this.state.regexEnabled}
                  matchCount={matches.length}
                  onChange={this.onQueryChanged}
                  onClear={this.onClearQuery}
                  onToggleRegex={this.onToggleRegex}
                  onOpenBuilder={this.onOpenBuilder}
                />

                <Md3ChipRow label={this.text('docsBrowser.categoriesLabel')}>
                  <Md3Chip
                    label={this.text('docsBrowser.categoryAll')}
                    active={this.state.category === null}
                    onToggle={this.onShowAllCategories}
                  />
                  {DocsBrowserCategories.map(category => (
                    <Md3Chip
                      key={category.name}
                      label={this.categoryLabel(category.name)}
                      active={this.state.category === category.name}
                      onToggle={this.onToggleCategory}
                    />
                  ))}
                </Md3ChipRow>

                <div
                  className="docs-browser__bulk"
                  role="group"
                  aria-label={this.text('docsBrowser.listLabel')}
                >
                  <span className="docs-browser__selection-count">
                    {this.text('docsBrowser.selectionCount', {
                      count: String(selectedCount),
                    })}
                  </span>
                  <Md3GhostButton
                    icon="library_add_check"
                    label={
                      this.state.query.trim().length === 0 &&
                      this.state.category === null
                        ? this.text('docsBrowser.selectAllArticles', {
                            count: String(matches.length),
                          })
                        : this.text('docsBrowser.selectAllMatches', {
                            count: String(matches.length),
                          })
                    }
                    onClick={this.onSelectAllListed}
                  />
                  <Md3GhostButton
                    icon="swap_horiz"
                    label={this.text('docsBrowser.invertSelection')}
                    onClick={this.onInvertSelection}
                  />
                  <Md3GhostButton
                    icon="close"
                    label={this.text('docsBrowser.clearSelection')}
                    disabled={selectedCount === 0}
                    onClick={this.onClearSelection}
                  />
                  <Md3GhostButton
                    icon="delete"
                    label={this.text('docsBrowser.deleteLabel')}
                    tooltip={this.text('docsBrowser.deleteUnavailable')}
                    className="docs-browser__delete"
                    onClick={this.onExplainDelete}
                  />
                </div>

                <div
                  className="docs-browser__exports"
                  role="group"
                  aria-label={this.text('docsBrowser.exportMenuLabel')}
                >
                  <Md3TonalButton
                    icon="content_paste_go"
                    label={this.text('docsBrowser.exportMarkdown')}
                    onClick={this.onExportMarkdown}
                  />
                  <Md3TonalButton
                    icon="subject"
                    label={this.text('docsBrowser.exportText')}
                    onClick={this.onExportText}
                  />
                  <Md3TonalButton
                    icon="data_object"
                    label={this.text('docsBrowser.exportJson')}
                    onClick={this.onExportJson}
                  />
                </div>

                <p id={this.hintId} className="docs-browser__hint">
                  {this.text('docsBrowser.selectionHint')}
                </p>

                {error !== null ? (
                  <p className="docs-browser__error" role="alert">
                    {this.text('docsBrowser.searchInvalid', {
                      message: error,
                    })}
                  </p>
                ) : null}

                {matches.length === 0 ? (
                  <Md3EmptyState
                    message={translateWithFunnyLevel(
                      'docsBrowser.empty',
                      this.state.languageMode,
                      this.state.funnyLevels,
                      { query: this.state.query }
                    )}
                    actionLabel={this.text('docsBrowser.resetSearch')}
                    onAction={this.onClearQuery}
                  />
                ) : (
                  <ul
                    ref={this.listRef}
                    id={this.listId}
                    className="docs-browser__list"
                    role="listbox"
                    tabIndex={0}
                    aria-multiselectable={true}
                    aria-label={this.text('docsBrowser.listLabel')}
                    aria-describedby={this.hintId}
                    aria-activedescendant={activeId}
                    onKeyDown={this.onListKeyDown}
                  >
                    {matches.map((match, index) =>
                      this.renderRow(match, index)
                    )}
                  </ul>
                )}

                <p className="docs-browser__summary" role="status">
                  {summary}
                </p>
              </div>

              {this.renderArticle(current)}
            </div>
          </div>
        </div>
        {this.renderBuilder()}
      </>
    )
  }
}
