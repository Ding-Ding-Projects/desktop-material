import * as React from 'react'
import * as ReactDOM from 'react-dom'

import classNames from 'classnames'

import { t, translateForAccessibleName } from '../../lib/i18n'
import { announceRepositoryLogoChanged } from '../../lib/appearance-customization'
import { resolveToolbarTextStyle } from '../../models/appearance-customization'
import {
  DefaultRepositoryAppearanceElementSettings,
  IProfileAppearanceElementSettings,
  IRepositoryAppearanceElementSettings,
  IRepositoryListNameAppearance,
  IRepositoryLogoAppearance,
  IRepositoryTabsOverrideAppearance,
  IRepositoryToolbarAppearance,
  IRepositoryWorkspaceAppearance,
  ProfileAppearanceElementId,
  RepositoryAppearanceElementId,
} from '../../models/element-appearance'
import { Repository } from '../../models/repository'
import { IRepositoryLogoDesign } from '../../models/repository-logo'
import { tabFontStack, tabTitleStyleToCss } from '../../models/repository-tab'
import {
  AppearanceElementHistoryDialog,
  RepositoryListNameAppearanceEditor,
  RepositoryLogoAppearanceEditor,
  RepositoryTabsOverrideAppearanceEditor,
  RepositoryToolbarAppearanceEditor,
  RepositoryWorkspaceAppearanceEditor,
} from '../appearance'
import { DialogContent } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { LocalizedText } from '../lib/localized-text'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RepositoryLogo } from '../repository-logo/repository-logo'
import { IVersionedStoreHistorySource } from '../version-history'

/** How long to wait before re-checking a still-starting element coordinator. */
const CoordinatorRetryDelay = 50

/**
 * The profile values this pane reads so a repository section can name what it
 * inherits. It never writes them: a repository dialog must not silently retune
 * every other repository.
 */
interface IInheritedAppearance {
  readonly workspace: IProfileAppearanceElementSettings[ProfileAppearanceElementId.AppWorkspace]
  readonly toolbar: IProfileAppearanceElementSettings[ProfileAppearanceElementId.Toolbar]
  readonly tabs: IProfileAppearanceElementSettings[ProfileAppearanceElementId.RepositoryTabs]
  readonly logo: IRepositoryLogoDesign
}

interface IRepositoryAppearanceProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

interface IHistoryTarget {
  readonly elementId: RepositoryAppearanceElementId
  readonly title: string
  readonly source: IVersionedStoreHistorySource
  readonly repositoryPath: string
}

interface IRepositoryAppearanceState {
  readonly values: IRepositoryAppearanceElementSettings | null
  readonly inherited: IInheritedAppearance | null
  readonly loading: boolean
  /** The coordinator has not finished starting its dedicated repositories. */
  readonly unavailable: boolean
  readonly error: string | null
  readonly history: IHistoryTarget | null
}

function labelForValue(value: string): string {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`
}

/**
 * Name one resolved value and say, per value, whether the repository owns it or
 * inherited it. The section status line reports the owner as a whole; this
 * makes the individual field unambiguous when only one of them is overridden.
 */
function resolvedValue(value: string, overridden: boolean): string {
  const origin = translateForAccessibleName(
    overridden
      ? 'repositorySettings.appearance.overriddenSuffix'
      : 'repositorySettings.appearance.inheritedSuffix'
  )
  return `${labelForValue(value)} (${origin})`
}

/**
 * The per-repository appearance hub inside Repository Settings.
 *
 * Every section renders the exact editor the anchored (right-click) surface
 * renders, and commits through the exact same repository-scoped owner via
 * `Dispatcher.setRepositoryAppearanceElement`. There is no parallel store, no
 * staged copy, and no separate Save: a change lands in the owner's dedicated
 * local Git repository immediately, exactly as it does from the element, and
 * the same invalidation event refreshes any mounted row or tab.
 */
export class RepositoryAppearance extends React.Component<
  IRepositoryAppearanceProps,
  IRepositoryAppearanceState
> {
  private mounted = false
  private loadId = 0
  private retryTimeout: number | null = null

  public constructor(props: IRepositoryAppearanceProps) {
    super(props)
    this.state = {
      values: null,
      inherited: null,
      loading: true,
      unavailable: false,
      error: null,
      history: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    void this.load()
  }

  public componentWillUnmount() {
    this.mounted = false
    this.loadId++
    this.clearRetry()
  }

  private clearRetry() {
    if (this.retryTimeout !== null) {
      window.clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
  }

  private readInherited(): IInheritedAppearance {
    const { dispatcher } = this.props
    return {
      workspace: dispatcher.getProfileAppearanceElement(
        ProfileAppearanceElementId.AppWorkspace
      ),
      toolbar: dispatcher.getProfileAppearanceElement(
        ProfileAppearanceElementId.Toolbar
      ),
      tabs: dispatcher.getProfileAppearanceElement(
        ProfileAppearanceElementId.RepositoryTabs
      ),
      logo: dispatcher.getProfileAppearanceElement(
        ProfileAppearanceElementId.DefaultRepositoryLogo
      ),
    }
  }

  private load = async () => {
    this.clearRetry()
    const loadId = ++this.loadId
    const { dispatcher, repository } = this.props

    if (!dispatcher.isElementAppearanceCoordinatorReady()) {
      // The dedicated per-owner repositories are authoritative. Never paint a
      // guessed value while they start; say so and re-check shortly.
      this.setState({ loading: false, unavailable: true })
      this.retryTimeout = window.setTimeout(() => {
        this.retryTimeout = null
        void this.load()
      }, CoordinatorRetryDelay)
      return
    }

    try {
      const values = await dispatcher.getRepositoryAppearanceElements(
        repository
      )
      const inherited = this.readInherited()
      if (!this.mounted || loadId !== this.loadId) {
        return
      }
      this.setState({
        values,
        inherited,
        loading: false,
        unavailable: false,
        error: null,
      })
    } catch (e) {
      log.error(
        `RepositoryAppearance: unable to read appearance owners for ${repository.path}`,
        e
      )
      if (this.mounted && loadId === this.loadId) {
        this.setState({
          loading: false,
          unavailable: false,
          error: t('repositorySettings.appearance.loadFailed'),
        })
      }
    }
  }

  private setElement = <K extends RepositoryAppearanceElementId>(
    id: K,
    value: IRepositoryAppearanceElementSettings[K]
  ) => {
    const { values } = this.state
    if (values === null) {
      return
    }

    // Optimistic, then reconciled from the owner. The anchored editors behave
    // the same way, so both surfaces converge on the durable value.
    this.setState({ values: { ...values, [id]: value }, error: null })

    void this.props.dispatcher
      .setRepositoryAppearanceElement(this.props.repository, id, value)
      .then(() => announceRepositoryLogoChanged(this.props.repository.path))
      .catch(error => {
        log.error(
          `RepositoryAppearance: unable to save the ${id} owner for ${this.props.repository.path}`,
          error
        )
        if (this.mounted) {
          this.setState({
            error: t('repositorySettings.appearance.saveFailed'),
          })
        }
        void this.load()
      })
  }

  private onWorkspaceChanged = (value: IRepositoryWorkspaceAppearance) =>
    this.setElement(RepositoryAppearanceElementId.Workspace, value)

  private onToolbarChanged = (value: IRepositoryToolbarAppearance) =>
    this.setElement(RepositoryAppearanceElementId.Toolbar, value)

  private onTabsChanged = (value: IRepositoryTabsOverrideAppearance) =>
    this.setElement(RepositoryAppearanceElementId.Tabs, value)

  private onListNameChanged = (style: IRepositoryListNameAppearance['style']) =>
    this.setElement(RepositoryAppearanceElementId.ListName, { style })

  private onLogoChanged = (logo: IRepositoryLogoAppearance['logo']) =>
    this.setElement(RepositoryAppearanceElementId.Logo, { logo })

  private resetElement(id: RepositoryAppearanceElementId) {
    this.setElement(id, DefaultRepositoryAppearanceElementSettings[id])
  }

  private onResetWorkspace = () =>
    this.resetElement(RepositoryAppearanceElementId.Workspace)
  private onResetToolbar = () =>
    this.resetElement(RepositoryAppearanceElementId.Toolbar)
  private onResetTabs = () =>
    this.resetElement(RepositoryAppearanceElementId.Tabs)
  private onResetListName = () =>
    this.resetElement(RepositoryAppearanceElementId.ListName)
  private onResetLogo = () =>
    this.resetElement(RepositoryAppearanceElementId.Logo)

  private async showHistory(
    elementId: RepositoryAppearanceElementId,
    title: string
  ) {
    const { dispatcher, repository } = this.props
    try {
      const [source, repositoryPath] = await Promise.all([
        dispatcher.getRepositoryAppearanceHistorySource(repository, elementId),
        dispatcher.getRepositoryAppearanceRepositoryPath(repository, elementId),
      ])
      if (this.mounted) {
        this.setState({ history: { elementId, title, source, repositoryPath } })
      }
    } catch (e) {
      log.error(
        `RepositoryAppearance: unable to open ${elementId} history for ${repository.path}`,
        e
      )
    }
  }

  private onShowWorkspaceHistory = () =>
    void this.showHistory(
      RepositoryAppearanceElementId.Workspace,
      translateForAccessibleName(
        'repositorySettings.appearance.workspaceSection'
      )
    )

  private onShowToolbarHistory = () =>
    void this.showHistory(
      RepositoryAppearanceElementId.Toolbar,
      translateForAccessibleName('repositorySettings.appearance.toolbarSection')
    )

  private onShowTabsHistory = () =>
    void this.showHistory(
      RepositoryAppearanceElementId.Tabs,
      translateForAccessibleName('repositorySettings.appearance.tabsSection')
    )

  private onShowListNameHistory = () =>
    void this.showHistory(
      RepositoryAppearanceElementId.ListName,
      translateForAccessibleName(
        'repositorySettings.appearance.listNameSection'
      )
    )

  private onShowLogoHistory = () =>
    void this.showHistory(
      RepositoryAppearanceElementId.Logo,
      translateForAccessibleName('repositorySettings.appearance.logoSection')
    )

  private onHistoryDismissed = () => this.setState({ history: null })

  private onHistoryMutation = async () => {
    await this.load()
    announceRepositoryLogoChanged(this.props.repository.path)
  }

  private get repositoryName(): string {
    return this.props.repository.alias ?? this.props.repository.name
  }

  private renderStatus(overridden: boolean): JSX.Element {
    return (
      <span
        className={classNames('repository-appearance-status', {
          overridden,
        })}
      >
        <Octicon
          className="icon"
          symbol={overridden ? octicons.pencil : octicons.arrowDown}
        />
        <LocalizedText
          translationKey={
            overridden
              ? 'repositorySettings.appearance.overridden'
              : 'repositorySettings.appearance.inheriting'
          }
        />
      </span>
    )
  }

  private renderSection(options: {
    readonly id: RepositoryAppearanceElementId
    readonly sectionKey:
      | 'repositorySettings.appearance.workspaceSection'
      | 'repositorySettings.appearance.toolbarSection'
      | 'repositorySettings.appearance.tabsSection'
      | 'repositorySettings.appearance.listNameSection'
      | 'repositorySettings.appearance.logoSection'
    readonly overridden: boolean
    readonly onReset: () => void
    /** Supplied only for editors that do not already own a History action. */
    readonly onShowHistory?: () => void
    readonly editor: JSX.Element
    readonly preview?: JSX.Element
  }): JSX.Element {
    const headingId = `repository-appearance-${options.id}-heading`
    const section = translateForAccessibleName(options.sectionKey)

    return (
      <section
        className="repository-appearance-section"
        aria-labelledby={headingId}
      >
        <header className="repository-appearance-section-header">
          <div className="repository-appearance-section-heading">
            <h3 id={headingId}>
              <LocalizedText translationKey={options.sectionKey} />
            </h3>
            {this.renderStatus(options.overridden)}
          </div>
          <div className="repository-appearance-section-actions">
            {options.onShowHistory !== undefined && (
              <Button
                type="button"
                size="small"
                ariaLabel={translateForAccessibleName(
                  'repositorySettings.appearance.historyAccessibleName',
                  { section }
                )}
                onClick={options.onShowHistory}
              >
                <Octicon symbol={octicons.history} />
                <LocalizedText translationKey="repositorySettings.appearance.history" />
              </Button>
            )}
            <Button
              type="button"
              size="small"
              disabled={!options.overridden}
              ariaLabel={translateForAccessibleName(
                'repositorySettings.appearance.resetAccessibleName',
                { section }
              )}
              onClick={options.onReset}
            >
              <Octicon symbol={octicons.sync} />
              <LocalizedText translationKey="repositorySettings.appearance.reset" />
            </Button>
          </div>
        </header>
        <div className="repository-appearance-section-body">
          {options.editor}
          {options.preview}
        </div>
      </section>
    )
  }

  /**
   * A bounded, decorative sample. Screen readers get the resolved values from
   * the section's own controls and status line, so the sample itself is hidden
   * rather than read out as duplicated, order-dependent fragments.
   */
  private renderPreview(
    sectionKey:
      | 'repositorySettings.appearance.workspaceSection'
      | 'repositorySettings.appearance.toolbarSection'
      | 'repositorySettings.appearance.tabsSection',
    resolved: ReadonlyArray<string>,
    canvas: JSX.Element
  ): JSX.Element {
    const section = translateForAccessibleName(sectionKey)

    return (
      <div className="repository-appearance-preview">
        <span className="repository-appearance-preview-eyebrow">
          <LocalizedText translationKey="repositorySettings.appearance.previewLabel" />
        </span>
        <div
          className="repository-appearance-preview-canvas"
          aria-hidden={true}
        >
          {canvas}
        </div>
        <p className="repository-appearance-preview-resolved">
          <span className="sr-only">
            {translateForAccessibleName(
              'repositorySettings.appearance.previewDescription',
              { section }
            )}
          </span>
          {resolved.join(' · ')}
        </p>
      </div>
    )
  }

  private renderWorkspaceSection(
    value: IRepositoryWorkspaceAppearance,
    inherited: IInheritedAppearance
  ): JSX.Element {
    const accent = value.accentPalette ?? inherited.workspace.accentPalette
    const surface = value.surfacePalette ?? inherited.workspace.surfacePalette

    return this.renderSection({
      id: RepositoryAppearanceElementId.Workspace,
      sectionKey: 'repositorySettings.appearance.workspaceSection',
      overridden: value.accentPalette !== null || value.surfacePalette !== null,
      onReset: this.onResetWorkspace,
      editor: (
        <RepositoryWorkspaceAppearanceEditor
          value={value}
          inherited={inherited.workspace}
          onChange={this.onWorkspaceChanged}
          onShowHistory={this.onShowWorkspaceHistory}
        />
      ),
      preview: this.renderPreview(
        'repositorySettings.appearance.workspaceSection',
        [
          t('repositorySettings.appearance.resolvedAccent', {
            value: resolvedValue(accent, value.accentPalette !== null),
          }),
          t('repositorySettings.appearance.resolvedSurface', {
            value: resolvedValue(surface, value.surfacePalette !== null),
          }),
        ],
        <div className="repository-appearance-preview-row">
          <span className="preview-row-icon">
            <Octicon symbol={octicons.repo} />
          </span>
          <span className="preview-row-name">{this.repositoryName}</span>
        </div>
      ),
    })
  }

  private renderToolbarSection(
    value: IRepositoryToolbarAppearance,
    inherited: IInheritedAppearance
  ): JSX.Element {
    const labels = value.toolbarLabels ?? inherited.toolbar.toolbarLabels
    const density = value.toolbarDensity ?? inherited.toolbar.toolbarDensity
    const textStyle = resolveToolbarTextStyle(
      inherited.toolbar.toolbarTextStyle ?? null,
      value.toolbarTextStyle
    )
    const previewStyle = {
      ...tabTitleStyleToCss(textStyle),
      fontFamily:
        textStyle?.fontFamily !== undefined
          ? tabFontStack(textStyle.fontFamily)
          : undefined,
    }

    return this.renderSection({
      id: RepositoryAppearanceElementId.Toolbar,
      sectionKey: 'repositorySettings.appearance.toolbarSection',
      overridden:
        value.toolbarLabels !== null ||
        value.toolbarDensity !== null ||
        (value.toolbarTextStyle ?? null) !== null,
      onReset: this.onResetToolbar,
      editor: (
        <RepositoryToolbarAppearanceEditor
          value={value}
          inherited={inherited.toolbar}
          onChange={this.onToolbarChanged}
          onShowHistory={this.onShowToolbarHistory}
        />
      ),
      preview: this.renderPreview(
        'repositorySettings.appearance.toolbarSection',
        [
          t('repositorySettings.appearance.resolvedLabels', {
            value: resolvedValue(labels, value.toolbarLabels !== null),
          }),
          t('repositorySettings.appearance.resolvedDensity', {
            value: resolvedValue(density, value.toolbarDensity !== null),
          }),
        ],
        <div
          className={classNames(
            'repository-appearance-preview-toolbar',
            density
          )}
        >
          <span className="preview-toolbar-action">
            <Octicon symbol={octicons.gitBranch} />
            {labels !== 'icons' && (
              <span className="preview-toolbar-label" style={previewStyle}>
                {this.repositoryName}
              </span>
            )}
          </span>
          <span className="preview-toolbar-action">
            <Octicon symbol={octicons.sync} />
            {labels !== 'icons' && (
              <span className="preview-toolbar-label" style={previewStyle}>
                Fetch origin
              </span>
            )}
          </span>
        </div>
      ),
    })
  }

  private renderTabsSection(
    value: IRepositoryTabsOverrideAppearance,
    inherited: IInheritedAppearance
  ): JSX.Element {
    const density = value.tabDensity ?? inherited.tabs.tabDensity
    const width = value.tabWidth ?? inherited.tabs.tabWidth

    return this.renderSection({
      id: RepositoryAppearanceElementId.Tabs,
      sectionKey: 'repositorySettings.appearance.tabsSection',
      overridden: value.tabDensity !== null || value.tabWidth !== null,
      onReset: this.onResetTabs,
      editor: (
        <RepositoryTabsOverrideAppearanceEditor
          value={value}
          inherited={inherited.tabs}
          onChange={this.onTabsChanged}
          onShowHistory={this.onShowTabsHistory}
        />
      ),
      preview: this.renderPreview(
        'repositorySettings.appearance.tabsSection',
        [
          t('repositorySettings.appearance.resolvedDensity', {
            value: resolvedValue(density, value.tabDensity !== null),
          }),
          t('repositorySettings.appearance.resolvedWidth', {
            value: resolvedValue(width, value.tabWidth !== null),
          }),
        ],
        <span
          className={classNames(
            'repository-appearance-preview-tab',
            density,
            width
          )}
        >
          <Octicon symbol={octicons.repo} />
          <span className="preview-tab-label">{this.repositoryName}</span>
        </span>
      ),
    })
  }

  private renderListNameSection(
    value: IRepositoryListNameAppearance
  ): JSX.Element {
    return this.renderSection({
      id: RepositoryAppearanceElementId.ListName,
      sectionKey: 'repositorySettings.appearance.listNameSection',
      overridden: value.style !== null,
      onReset: this.onResetListName,
      onShowHistory: this.onShowListNameHistory,
      editor: (
        <RepositoryListNameAppearanceEditor
          value={value.style}
          repositoryName={this.repositoryName}
          onChange={this.onListNameChanged}
        />
      ),
    })
  }

  private renderLogoSection(
    value: IRepositoryLogoAppearance,
    inherited: IInheritedAppearance
  ): JSX.Element {
    return this.renderSection({
      id: RepositoryAppearanceElementId.Logo,
      sectionKey: 'repositorySettings.appearance.logoSection',
      overridden: value.logo !== null,
      onReset: this.onResetLogo,
      onShowHistory: this.onShowLogoHistory,
      editor: (
        <RepositoryLogoAppearanceEditor
          value={value.logo}
          profileValue={inherited.logo}
          repositoryName={this.repositoryName}
          onChange={this.onLogoChanged}
        />
      ),
      preview: (
        <div className="repository-appearance-preview">
          <span className="repository-appearance-preview-eyebrow">
            <LocalizedText translationKey="repositorySettings.appearance.previewLabel" />
          </span>
          <div
            className="repository-appearance-preview-canvas"
            aria-hidden={true}
          >
            <div className="repository-appearance-preview-row">
              <RepositoryLogo
                className="preview-row-logo"
                design={value.logo ?? inherited.logo}
                repositoryName={this.repositoryName}
                size={34}
              />
              <span className="preview-row-name">{this.repositoryName}</span>
            </div>
          </div>
          <p className="repository-appearance-preview-resolved">
            <LocalizedText
              translationKey={
                value.logo === null
                  ? 'repositorySettings.appearance.logoInherits'
                  : 'repositorySettings.appearance.overridden'
              }
            />
          </p>
        </div>
      ),
    })
  }

  private renderHistory(): React.ReactNode {
    const { history } = this.state
    if (history === null) {
      return null
    }

    // Repository Settings wraps its tab body in a <form>, and every Dialog
    // renders its own <form>. Nesting them is invalid markup, and the inner
    // submit would bubble into the outer dialog's Save-and-dismiss handler.
    // Portal the owner's history manager out to the document instead, so it
    // behaves exactly as it does when opened from the anchored editor.
    return ReactDOM.createPortal(
      <AppearanceElementHistoryDialog
        title={history.title}
        source={history.source}
        repositoryPath={history.repositoryPath}
        onMutation={this.onHistoryMutation}
        onDismissed={this.onHistoryDismissed}
      />,
      document.body
    )
  }

  public render() {
    const { values, inherited, loading, unavailable, error } = this.state

    return (
      <DialogContent className="repository-appearance-settings">
        <div className="repository-appearance-intro">
          <p>
            <LocalizedText translationKey="repositorySettings.appearance.intro" />
          </p>
          <p className="repository-appearance-intro-hint">
            <Octicon className="icon" symbol={octicons.paintbrush} />
            <LocalizedText translationKey="repositorySettings.appearance.introHint" />
          </p>
        </div>

        {error !== null && (
          <p className="repository-appearance-error" role="alert">
            {error}
          </p>
        )}

        {loading && (
          <p role="status">
            <LocalizedText translationKey="repositorySettings.appearance.loading" />
          </p>
        )}

        {unavailable && (
          <p role="status">
            <LocalizedText translationKey="repositorySettings.appearance.unavailable" />
          </p>
        )}

        {values !== null && inherited !== null && (
          <div className="repository-appearance-sections">
            {this.renderListNameSection(
              values[RepositoryAppearanceElementId.ListName]
            )}
            {this.renderLogoSection(
              values[RepositoryAppearanceElementId.Logo],
              inherited
            )}
            {this.renderTabsSection(
              values[RepositoryAppearanceElementId.Tabs],
              inherited
            )}
            {this.renderToolbarSection(
              values[RepositoryAppearanceElementId.Toolbar],
              inherited
            )}
            {this.renderWorkspaceSection(
              values[RepositoryAppearanceElementId.Workspace],
              inherited
            )}
          </div>
        )}

        {this.renderHistory()}
      </DialogContent>
    )
  }
}
