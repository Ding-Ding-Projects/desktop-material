import * as React from 'react'
import { teleportAnchor } from '../../lib/teleport-targets'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { MaterialSymbol } from '../lib/material-symbol'
import {
  Default as DefaultShell,
  Shell,
  parse as parseShell,
} from '../../lib/shells'
import { suggestedExternalEditor } from '../../lib/editors/shared'
import { CustomIntegrationForm } from './custom-integration-form'
import { ICustomIntegration } from '../../lib/custom-integration'
import { enableCustomIntegration } from '../../lib/feature-flag'
import { getExternalEditorDisplayName } from '../../lib/editors/display-name'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import * as ipcRenderer from '../../lib/ipc-renderer'
import {
  IWindowsContextMenuLabels,
  IWindowsContextMenuState,
  WindowsContextMenuEntryId,
} from '../../lib/windows-context-menu'
import { isModernContextMenuActionable } from '../../lib/shell-extension-package'
import { BrowserExtensionIntegrationAvailability } from '../../lib/browser-extension-download'
import { BrowserExtensionDownloadIntegrationStatus } from '../browser-extension-download/browser-extension-download-surfaces'
import { StatusHubOwnerSettings } from './status-hub-owner-settings'
import {
  branchPresetScriptKey,
  customEditorKey,
  customShellKey,
  externalEditorKey,
  shellKey,
} from '../../lib/stores/app-store'
import {
  SelectionSettingExplanation,
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

const CustomIntegrationValue = 'other'
const BranchPresetScriptDocumentationUrl =
  'https://github.com/desktop-plus/desktop-plus/blob/66327944558d5c5c24260ce79a20e4c7ed925e7e/docs/branch-name-presets.md'

const BrowserExtensionDownloadAvailability: BrowserExtensionIntegrationAvailability =
  {
    kind: 'unavailable',
    reason:
      'No installed browser-extension native-messaging host is registered for this Desktop Material build.',
  }

interface IIntegrationsPreferencesProps {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedExternalEditor: string | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly branchPresetScript: ICustomIntegration
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
  readonly onUseCustomEditorChanged: (useCustomEditor: boolean) => void
  readonly onCustomEditorChanged: (customEditor: ICustomIntegration) => void
  readonly onUseCustomShellChanged: (useCustomShell: boolean) => void
  readonly onCustomShellChanged: (customShell: ICustomIntegration) => void
  readonly onBranchPresetScriptChanged: (
    branchPresetScript: ICustomIntegration
  ) => void
}

interface IIntegrationsPreferencesState {
  readonly languageMode: LanguageMode
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly branchPresetScript: ICustomIntegration
  /**
   * The live registry state of the Explorer entries, or null while it is still
   * being read. The registry is the source of truth rather than a mirrored
   * preference, so an entry removed by another tool shows as off immediately.
   */
  readonly contextMenu: IWindowsContextMenuState | null
  /** Entry currently being installed or removed, if any. */
  readonly contextMenuBusyId: WindowsContextMenuEntryId | null
  readonly contextMenuError: string | null
}

export class Integrations extends React.Component<
  IIntegrationsPreferencesProps,
  IIntegrationsPreferencesState
> {
  private customEditorFormRef = React.createRef<CustomIntegrationForm>()
  private customShellFormRef = React.createRef<CustomIntegrationForm>()

  private localizeText(english: string, cantonese: string): string {
    switch (this.state.languageMode) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  public constructor(props: IIntegrationsPreferencesProps) {
    super(props)

    this.state = {
      languageMode: getPersistedLanguageMode(),
      selectedExternalEditor: this.props.selectedExternalEditor,
      selectedShell: this.props.selectedShell,
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell,
      branchPresetScript: this.props.branchPresetScript,
      contextMenu: null,
      contextMenuBusyId: null,
      contextMenuError: null,
    }
  }

  public async componentWillReceiveProps(
    nextProps: IIntegrationsPreferencesProps
  ) {
    const editors = nextProps.availableEditors
    let selectedExternalEditor = nextProps.selectedExternalEditor
    if (editors.length) {
      const indexOf = selectedExternalEditor
        ? editors.indexOf(selectedExternalEditor)
        : -1
      if (indexOf === -1) {
        selectedExternalEditor = editors[0]
        nextProps.onSelectedEditorChanged(selectedExternalEditor)
      }
    }

    const shells = nextProps.availableShells
    let selectedShell = nextProps.selectedShell
    if (shells.length) {
      const indexOf = shells.indexOf(selectedShell)
      if (indexOf === -1) {
        selectedShell = shells[0]
        nextProps.onSelectedShellChanged(selectedShell)
      }
    }
    this.setState({
      selectedExternalEditor,
      selectedShell,
      useCustomEditor: nextProps.useCustomEditor,
      useCustomShell: nextProps.useCustomShell,
      customShell: nextProps.customShell,
      customEditor: nextProps.customEditor,
      branchPresetScript: nextProps.branchPresetScript,
    })
  }

  public componentDidMount(): void {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.refreshContextMenuState()
    if (enableCustomIntegration()) {
      const {
        availableEditors,
        availableShells,
        useCustomEditor,
        useCustomShell,
      } = this.props

      // When there are no available editors or shells, the `Select` component
      // will have the custom editor or shell already selected, but we need
      // to handle that as initial value, otherwise the custom integration
      // form won't be rendered.

      if (availableEditors.length === 0 && !useCustomEditor) {
        this.setSelectedEditor(CustomIntegrationValue)
      }

      if (availableShells.length === 0 && !useCustomShell) {
        this.setSelectedShell(CustomIntegrationValue)
      }
    }
  }

  public componentWillUnmount(): void {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  public componentDidUpdate(
    prevProps: IIntegrationsPreferencesProps,
    prevState: IIntegrationsPreferencesState
  ): void {
    // When the user switches to the custom editor or shell, we want to focus the
    // path input field.
    if (!prevState.useCustomEditor && this.state.useCustomEditor) {
      this.customEditorFormRef.current?.focus()
    }

    if (!prevState.useCustomShell && this.state.useCustomShell) {
      this.customShellFormRef.current?.focus()
    }
  }

  private setSelectedEditor = (editor: string) => {
    if (editor === CustomIntegrationValue) {
      this.setState({ useCustomEditor: true })
      this.props.onUseCustomEditorChanged(true)
    } else {
      this.setState({
        useCustomEditor: false,
        selectedExternalEditor: editor,
      })
      this.props.onUseCustomEditorChanged(false)
      this.props.onSelectedEditorChanged(editor)
    }
  }

  private setSelectedShell = (shell: string) => {
    if (shell === CustomIntegrationValue) {
      this.setState({ useCustomShell: true })
      this.props.onUseCustomShellChanged(true)
    } else {
      const parsedValue = parseShell(shell)
      this.setState({
        useCustomShell: false,
        selectedShell: parsedValue,
      })
      this.props.onSelectedShellChanged(parsedValue)
      this.props.onUseCustomShellChanged(false)
    }
  }

  /**
   * A Material Design 3 list-item card for choosing an application: an
   * icon-badged leading tile, a title/helper column, and a trailing tonal menu
   * button that opens the choice menu. Replaces the bare `<Select>` dropdowns
   * while preserving the existing selection plumbing.
   */
  private renderApplicationCard(config: {
    readonly icon: 'code' | 'terminal'
    readonly title: string
    readonly subtitle: string
    readonly buttonLabel: string
    readonly menuAriaLabel: string
    readonly disabled: boolean
    readonly onOpenMenu: () => void
    readonly settingId: string
    readonly currentValue: string
    readonly shippedValue: string
    readonly storageKey: string
    readonly explanationEnglish: string
    readonly explanationCantonese: string
  }) {
    // The icon doubles as the teleport identity: the palette's "external
    // editor" and "shell" rows land on these cards.
    const anchor =
      config.icon === 'code' ? 'settings-external-editor' : 'settings-shell'
    return (
      <>
        <div
          className="integration-application-card"
          {...teleportAnchor(anchor)}
        >
          <span className="preference-disclosure-icon">
            <MaterialSymbol name={config.icon} size={21} />
          </span>
          <span className="preference-disclosure-text">
            <span className="preference-disclosure-title">{config.title}</span>
            <span className="preference-disclosure-subtitle">
              {config.subtitle}
            </span>
          </span>
          <button
            type="button"
            className="integration-application-menu-button"
            aria-haspopup="menu"
            aria-label={config.menuAriaLabel}
            aria-describedby={
              settingExplanationDescriptionIds(config.settingId).ariaDescribedBy
            }
            disabled={config.disabled}
            onClick={config.onOpenMenu}
          >
            {config.buttonLabel}
            <MaterialSymbol name="unfold_more" size={18} />
          </button>
        </div>
        <SelectionSettingExplanation
          settingId={config.settingId}
          explanationEnglish={config.explanationEnglish}
          explanationCantonese={config.explanationCantonese}
          currentEnglish={config.currentValue}
          currentCantonese={config.currentValue}
          shippedEnglish={config.shippedValue}
          shippedCantonese={config.shippedValue}
          storageKey={config.storageKey}
        />
      </>
    )
  }

  private renderExternalEditor() {
    const { languageMode, selectedExternalEditor, useCustomEditor } = this.state
    const hasChoices =
      this.props.availableEditors.length > 0 || enableCustomIntegration()
    const currentLabel = useCustomEditor
      ? translate('settings.integrationsCustomEditorLabel', languageMode)
      : selectedExternalEditor
      ? getExternalEditorDisplayName(selectedExternalEditor, languageMode)
      : translate('settings.integrationsSelectEditor', languageMode)
    const purpose = translateForAccessibleName(
      'settings.integrationsChooseEditor',
      {},
      languageMode
    )

    return this.renderApplicationCard({
      icon: 'code',
      title: translate(
        'settings.integrationsExternalEditorTitle',
        languageMode
      ),
      subtitle: translate(
        'settings.integrationsExternalEditorSubtitle',
        languageMode
      ),
      buttonLabel: currentLabel,
      menuAriaLabel: `${purpose}: ${currentLabel}`,
      disabled: !hasChoices,
      onOpenMenu: this.onOpenEditorMenu,
      settingId: 'integrations-external-editor',
      currentValue: currentLabel,
      shippedValue: 'automatic first detected editor',
      storageKey: externalEditorKey,
      explanationEnglish:
        'Chooses the detected or custom external editor used to open exported files and project folders.',
      explanationCantonese:
        '揀用嚟開啟匯出檔案同專案資料夾嘅已偵測或者自訂外部編輯器。',
    })
  }

  private onOpenEditorMenu = () => {
    const { languageMode, selectedExternalEditor, useCustomEditor } = this.state
    const items: IMenuItem[] = this.props.availableEditors.map(
      (editor): IMenuItem => ({
        label: getExternalEditorDisplayName(editor, languageMode),
        type: 'checkbox',
        checked: !useCustomEditor && selectedExternalEditor === editor,
        action: () => this.setSelectedEditor(editor),
      })
    )

    if (enableCustomIntegration()) {
      items.push({
        label: translate(
          'settings.integrationsCustomEditorChoice',
          languageMode
        ),
        type: 'checkbox',
        checked: useCustomEditor,
        action: () => this.setSelectedEditor(CustomIntegrationValue),
      })
    }

    showContextualMenu(items)
  }

  private renderNoExternalEditorHint() {
    const options = this.props.availableEditors
    if (options.length > 0) {
      return null
    }

    return (
      <Row>
        <div className="no-options-found">
          <span>
            No other editors found.{' '}
            <LinkButton uri={suggestedExternalEditor.url}>
              Install {suggestedExternalEditor.name}?
            </LinkButton>
          </span>
        </div>
      </Row>
    )
  }

  private renderCustomExternalEditor() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-editor"
          ref={this.customEditorFormRef}
          path={this.state.customEditor.path ?? ''}
          arguments={this.state.customEditor.arguments}
          storageKey={customEditorKey}
          onPathChanged={this.onCustomEditorPathChanged}
          onArgumentsChanged={this.onCustomEditorArgumentsChanged}
        />
      </Row>
    )
  }

  private onCustomEditorPathChanged = (path: string, bundleID?: string) => {
    const customEditor: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customEditor.arguments ?? [],
    }

    this.setState({ customEditor })
    this.props.onCustomEditorChanged(customEditor)
  }

  private onCustomEditorArgumentsChanged = (args: string) => {
    const customEditor: ICustomIntegration = {
      path: this.state.customEditor.path,
      bundleID: this.state.customEditor.bundleID,
      arguments: args,
    }

    this.setState({ customEditor })
    this.props.onCustomEditorChanged(customEditor)
  }

  private renderSelectedShell() {
    const { languageMode, selectedShell, useCustomShell } = this.state
    const hasChoices =
      this.props.availableShells.length > 0 || enableCustomIntegration()
    const currentLabel = useCustomShell
      ? translate('settings.integrationsCustomShellLabel', languageMode)
      : selectedShell
    const purpose = translateForAccessibleName(
      'settings.integrationsChooseShell',
      {},
      languageMode
    )

    return this.renderApplicationCard({
      icon: 'terminal',
      title: translate('settings.integrationsShellTitle', languageMode),
      subtitle: translate('settings.integrationsShellSubtitle', languageMode),
      buttonLabel: currentLabel,
      menuAriaLabel: `${purpose}: ${currentLabel}`,
      disabled: !hasChoices,
      onOpenMenu: this.onOpenShellMenu,
      settingId: 'integrations-shell',
      currentValue: currentLabel,
      shippedValue: DefaultShell,
      storageKey: shellKey,
      explanationEnglish:
        'Chooses the detected or custom shell used by terminal and command integrations.',
      explanationCantonese: '揀終端同命令整合使用嘅已偵測或者自訂 shell。',
    })
  }

  private onOpenShellMenu = () => {
    const { languageMode, selectedShell, useCustomShell } = this.state
    const items: IMenuItem[] = this.props.availableShells.map(
      (shell): IMenuItem => ({
        label: shell,
        type: 'checkbox',
        checked: !useCustomShell && selectedShell === shell,
        action: () => this.setSelectedShell(shell),
      })
    )

    if (enableCustomIntegration()) {
      items.push({
        label: translate(
          'settings.integrationsCustomShellChoice',
          languageMode
        ),
        type: 'checkbox',
        checked: useCustomShell,
        action: () => this.setSelectedShell(CustomIntegrationValue),
      })
    }

    showContextualMenu(items)
  }

  private renderCustomShell() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-shell"
          ref={this.customShellFormRef}
          path={this.state.customShell.path}
          arguments={this.state.customShell.arguments}
          storageKey={customShellKey}
          onPathChanged={this.onCustomShellPathChanged}
          onArgumentsChanged={this.onCustomShellArgumentsChanged}
        />
      </Row>
    )
  }

  private onCustomShellPathChanged = (path: string, bundleID?: string) => {
    const customShell: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customShell.arguments ?? [],
    }

    this.setState({ customShell })
    this.props.onCustomShellChanged(customShell)
  }

  private onCustomShellArgumentsChanged = (args: string) => {
    const customShell: ICustomIntegration = {
      path: this.state.customShell.path ?? '',
      bundleID: this.state.customShell.bundleID,
      arguments: args,
    }

    this.setState({ customShell })
    this.props.onCustomShellChanged(customShell)
  }

  private onBranchPresetPathChanged = (path: string) => {
    const branchPresetScript = {
      path,
      arguments: this.state.branchPresetScript.arguments,
    }
    this.setState({ branchPresetScript })
    this.props.onBranchPresetScriptChanged(branchPresetScript)
  }

  private onBranchPresetArgumentsChanged = (args: string) => {
    const branchPresetScript = {
      path: this.state.branchPresetScript.path,
      arguments: args,
    }
    this.setState({ branchPresetScript })
    this.props.onBranchPresetScriptChanged(branchPresetScript)
  }

  private renderBranchPresetScript() {
    return (
      <Row>
        <CustomIntegrationForm
          id="branch-preset-script"
          path={this.state.branchPresetScript.path}
          arguments={this.state.branchPresetScript.arguments}
          storageKey={branchPresetScriptKey}
          hideArgumentsWhenPathEmpty={true}
          allowEmptyPath={true}
          requireTargetPathArgument={false}
          onPathChanged={this.onBranchPresetPathChanged}
          onArgumentsChanged={this.onBranchPresetArgumentsChanged}
        />
      </Row>
    )
  }

  /**
   * The `MUIVerb` labels Explorer will show, translated here because the
   * language mode lives in renderer `localStorage`. Bilingual mode would make a
   * very wide menu entry, so the registry always gets a single language: the
   * Cantonese label in Cantonese mode, English otherwise.
   */
  private contextMenuLabels(): IWindowsContextMenuLabels {
    const mode =
      this.state.languageMode === 'cantonese' ? 'cantonese' : 'english'
    return {
      openWithOpencode: translate('settings.contextMenuOpencodeLabel', mode),
      openInDesktopMaterial: translate(
        'settings.contextMenuDesktopMaterialLabel',
        mode
      ),
    }
  }

  private refreshContextMenuState = () => {
    if (!__WIN32__) {
      // The group is not rendered off Windows, so there is nothing to probe.
      return
    }

    ipcRenderer
      .invoke('get-windows-context-menu-state', this.contextMenuLabels())
      .then(contextMenu =>
        this.setState({ contextMenu, contextMenuBusyId: null })
      )
      .catch(() =>
        this.setState({
          contextMenuBusyId: null,
          contextMenuError: translate(
            'settings.contextMenuStateError',
            this.state.languageMode
          ),
        })
      )
  }

  private onContextMenuEntryChanged = (
    id: WindowsContextMenuEntryId,
    installed: boolean
  ) => {
    this.setState({ contextMenuBusyId: id, contextMenuError: null })
    ipcRenderer
      .invoke('set-windows-context-menu-entry', {
        id,
        installed,
        labels: this.contextMenuLabels(),
      })
      .then(({ result, state }) =>
        this.setState({
          contextMenu: state,
          contextMenuBusyId: null,
          // The re-read state already reflects reality, so an error here is
          // purely explanatory — the toggle never lies about what happened.
          contextMenuError: result.error,
        })
      )
      .catch(() =>
        this.setState({
          contextMenuBusyId: null,
          contextMenuError: translate(
            'settings.contextMenuApplyError',
            this.state.languageMode
          ),
        })
      )
  }

  private onOpencodeEntryChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.onContextMenuEntryChanged(
      'open-with-opencode',
      event.currentTarget.checked
    )
  }

  private onDesktopMaterialEntryChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.onContextMenuEntryChanged(
      'open-in-desktop-material',
      event.currentTarget.checked
    )
  }

  private renderContextMenuEntry(
    id: WindowsContextMenuEntryId,
    labelKey:
      | 'settings.contextMenuOpencodeLabel'
      | 'settings.contextMenuDesktopMaterialLabel',
    descriptionKey:
      | 'settings.contextMenuOpencodeDescription'
      | 'settings.contextMenuDesktopMaterialDescription',
    onChange: (event: React.FormEvent<HTMLInputElement>) => void
  ) {
    const { contextMenu, contextMenuBusyId, languageMode } = this.state
    const entry = contextMenu?.entries.find(candidate => candidate.id === id)
    const unavailable = entry?.unavailableReason ?? null
    const descriptionId = `context-menu-${id}-description`
    const settingId =
      id === 'open-with-opencode'
        ? 'integrations-context-menu-opencode'
        : 'integrations-context-menu-desktop-material'

    // `outdated` means the verb is present but does not match this install.
    // It renders as on — because Explorer really does show it — with a repair
    // hint, rather than as off, which would be a lie about the current menu.
    const checked = entry !== undefined && entry.state !== 'not-installed'

    return (
      <div
        className="context-menu-entry"
        {...teleportAnchor(
          id === 'open-with-opencode'
            ? 'settings-context-menu-opencode'
            : 'settings-context-menu-desktop-material'
        )}
      >
        <Checkbox
          label={translate(labelKey, languageMode)}
          value={checked ? CheckboxValue.On : CheckboxValue.Off}
          onChange={onChange}
          disabled={
            contextMenu === null ||
            contextMenuBusyId !== null ||
            (unavailable !== null && !checked)
          }
          ariaDescribedBy={`${descriptionId} ${
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }`}
        />
        <p id={descriptionId} className="settings-description">
          {translate(descriptionKey, languageMode)}
          {unavailable === 'opencode-not-found' && (
            <>
              {' '}
              {translate('settings.contextMenuOpencodeMissing', languageMode)}
            </>
          )}
          {unavailable === 'app-path-unknown' && (
            <>
              {' '}
              {translate('settings.contextMenuAppPathUnknown', languageMode)}
            </>
          )}
          {entry?.state === 'outdated' && (
            <> {translate('settings.contextMenuNeedsRepair', languageMode)}</>
          )}
        </p>
        <SettingExplanation
          settingId={settingId}
          summary={translate('dialogEmoji.explanationSummary', languageMode)}
          explanation={translate(descriptionKey, languageMode)}
          provenance={this.localizeText(
            `Current registry value: ${
              entry?.state ?? 'not read'
            }. Shipped value: not installed. Source: live Explorer registration.`,
            `目前登錄值：${
              entry?.state ?? '未讀取'
            }。出廠值：未安裝。來源：即時 Explorer 登記。`
          )}
          source="main-process-config"
        />
      </div>
    )
  }

  private onModernContextMenuChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const installed = event.currentTarget.checked
    this.setState({
      contextMenuBusyId: 'open-in-desktop-material',
      contextMenuError: null,
    })
    ipcRenderer
      .invoke('set-modern-context-menu-installed', {
        installed,
        labels: this.contextMenuLabels(),
      })
      .then(({ result, state }) =>
        this.setState({
          contextMenu: state,
          contextMenuBusyId: null,
          contextMenuError: result.error,
        })
      )
      .catch(() =>
        this.setState({
          contextMenuBusyId: null,
          contextMenuError: translate(
            'settings.contextMenuApplyError',
            this.state.languageMode
          ),
        })
      )
  }

  /**
   * The packaged Windows 11 handler, plus an honest statement of which
   * implementation is actually serving the menu right now.
   */
  private renderModernContextMenu() {
    const { contextMenu, contextMenuBusyId, languageMode } = this.state
    const mode = contextMenu?.mode ?? null
    const blocker = contextMenu?.modernBlocker ?? null
    const descriptionId = 'context-menu-modern-description'
    const settingId = 'integrations-context-menu-modern'

    const blockerText =
      blocker === 'requires-windows-11'
        ? translate('settings.contextMenuNeedsWindows11', languageMode)
        : blocker === 'package-missing'
        ? translate('settings.contextMenuPackageMissing', languageMode)
        : blocker === 'developer-mode-required'
        ? translate('settings.contextMenuNeedsDeveloperMode', languageMode)
        : blocker === 'registration-stale'
        ? translate('settings.contextMenuRegistrationStale', languageMode)
        : null

    const modeText =
      mode === 'modern'
        ? translate('settings.contextMenuModeModern', languageMode)
        : mode === 'classic'
        ? translate('settings.contextMenuModeClassic', languageMode)
        : mode === 'none'
        ? translate('settings.contextMenuModeNone', languageMode)
        : null

    return (
      <div
        className="context-menu-entry"
        {...teleportAnchor('settings-context-menu-modern')}
      >
        <Checkbox
          label={translate('settings.contextMenuModernLabel', languageMode)}
          value={mode === 'modern' ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onModernContextMenuChanged}
          disabled={
            contextMenu === null ||
            contextMenuBusyId !== null ||
            // A stale registration is the one blocker this toggle can clear,
            // so it stays operable: switching it on re-registers against the
            // current install.
            (!isModernContextMenuActionable(blocker) && mode !== 'modern')
          }
          ariaDescribedBy={`${descriptionId} ${
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }`}
        />
        <p id={descriptionId} className="settings-description">
          {translate('settings.contextMenuModernDescription', languageMode)}
          {/* Stated even when the modern route works, because the classic
              entries stay installed underneath it. */}{' '}
          {translate('settings.contextMenuPlacementNote', languageMode)}
          {blockerText !== null && <> {blockerText}</>}
        </p>
        <SettingExplanation
          settingId={settingId}
          summary={translate('dialogEmoji.explanationSummary', languageMode)}
          explanation={translate(
            'settings.contextMenuModernDescription',
            languageMode
          )}
          provenance={this.localizeText(
            `Current registered mode: ${
              mode ?? 'not read'
            }. Shipped value: not installed. Source: live Explorer registration.`,
            `目前已登記模式：${
              mode ?? '未讀取'
            }。出廠值：未安裝。來源：即時 Explorer 登記。`
          )}
          source="main-process-config"
        />
        {modeText !== null && (
          <p className="settings-description context-menu-mode" role="status">
            {modeText}
          </p>
        )}
      </div>
    )
  }

  private renderWindowsContextMenu() {
    if (!__WIN32__) {
      return null
    }

    const { contextMenuBusyId, contextMenuError, languageMode } = this.state

    return (
      <fieldset className="context-menu-settings">
        <legend>
          <h2>{translate('settings.contextMenuHeading', languageMode)}</h2>
        </legend>
        <p className="settings-description">
          {translate('settings.contextMenuDescription', languageMode)}
        </p>
        {this.renderContextMenuEntry(
          'open-with-opencode',
          'settings.contextMenuOpencodeLabel',
          'settings.contextMenuOpencodeDescription',
          this.onOpencodeEntryChanged
        )}
        {this.renderContextMenuEntry(
          'open-in-desktop-material',
          'settings.contextMenuDesktopMaterialLabel',
          'settings.contextMenuDesktopMaterialDescription',
          this.onDesktopMaterialEntryChanged
        )}
        {this.renderModernContextMenu()}
        <p aria-live="polite" className="settings-description">
          {contextMenuBusyId !== null &&
            translate('settings.contextMenuBusy', languageMode)}
          {contextMenuBusyId === null && contextMenuError !== null && (
            <span className="context-menu-error">{contextMenuError}</span>
          )}
        </p>
      </fieldset>
    )
  }

  private renderBrowserExtensionDownloads() {
    const { languageMode } = this.state
    return (
      <fieldset {...teleportAnchor('settings-browser-extension-downloads')}>
        <legend>
          <h2>
            {translate('settings.browserExtensionDownloadTitle', languageMode)}
          </h2>
        </legend>
        <p className="settings-description">
          {translate('settings.browserExtensionDownloadSubtitle', languageMode)}
        </p>
        <BrowserExtensionDownloadIntegrationStatus
          availability={BrowserExtensionDownloadAvailability}
        />
      </fieldset>
    )
  }

  public render() {
    return (
      <DialogContent>
        <h2>Applications</h2>
        <div
          className="integration-application-cards"
          {...teleportAnchor('settings-custom-integration')}
        >
          {this.renderExternalEditor()}
          {this.state.useCustomEditor && this.renderCustomExternalEditor()}
          {this.renderNoExternalEditorHint()}
          {this.renderSelectedShell()}
          {this.state.useCustomShell && this.renderCustomShell()}
        </div>
        <StatusHubOwnerSettings />
        {this.renderBrowserExtensionDownloads()}
        {this.renderWindowsContextMenu()}
        {enableCustomIntegration() && (
          <fieldset {...teleportAnchor('settings-branch-preset-script')}>
            <legend>
              <h2>Branch name presets</h2>
            </legend>
            {this.renderBranchPresetScript()}
            <p>
              Run a script to suggest editable branch names. Use{' '}
              <code>%TARGET_PATH%</code> in its arguments when the output
              depends on the current repository.{' '}
              <LinkButton uri={BranchPresetScriptDocumentationUrl}>
                View script format and examples.
              </LinkButton>
            </p>
          </fieldset>
        )}
      </DialogContent>
    )
  }
}
