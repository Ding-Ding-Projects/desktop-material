import * as React from 'react'
import { OcticonSymbol } from '../octicons'
import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from '../lib/filter-string-list'
import { FilterModeControl } from '../lib/filter-mode-control'
import { SettingsTabStrip } from '../settings-tabs/settings-tab-strip'
import { SettingsTabDockControl } from '../settings-tabs/settings-tab-dock-control'
import {
  getSettingsTabDockPosition,
  ISettingsTabItem,
  setSettingsTabDockPosition,
  SettingsTabDockPosition,
} from '../settings-tabs/settings-tab-model'
import { Remote } from './remote'
import { GitIgnore } from './git-ignore'
import { BuildRunSettings } from './build-run-settings'
import { CheapLfsSettings } from './cheap-lfs-settings'
import { Submodules } from './submodules'
import { SubtreeManager } from '../subtrees/subtree-manager-dialog'
import { LocalizedText } from '../lib/localized-text'
import { assertNever } from '../../lib/fatal-error'
import {
  IRemote,
  IRemoteManagementPlan,
  IRemoteManagementSnapshot,
} from '../../models/remote'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import {
  Repository,
  getForkContributionTarget,
  isRepositoryWithGitHubRepository,
  isRepositoryWithForkedGitHubRepository,
} from '../../models/repository'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { getRemoteManagementSnapshot, readGitIgnoreAtRoot } from '../../lib/git'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { OperationProgressRow } from '../lib/operation-progress-row'
import { t, translateForAccessibleName } from '../../lib/i18n'
import type { TranslationKey } from '../../lib/i18n'
import { ForkSettings } from './fork-settings'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { GitConfigLocation, GitConfig } from './git-config'
import {
  getConfigValue,
  getGlobalConfigValue,
  removeConfigValue,
  setConfigValue,
} from '../../lib/git/config'
import {
  gitAuthorNameIsValid,
  InvalidGitAuthorNameMessage,
} from '../lib/identifier-rules'
import { Account, getAccountKey } from '../../models/account'
import {
  IBuildRunPreferences,
  defaultBuildRunPreferences,
} from '../../models/build-run-preferences'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { AccountPicker } from '../account-picker'
import { AutomationOverrides } from './automation-overrides'
import {
  IAutomationSettingsOverrides,
  loadRepositoryAutomationOverrides,
} from '../../lib/automation/automation-settings'
import { RepositoryMetadata } from './repository-metadata'
import { RepositoryAppearance } from './repository-appearance'
import { AISecurityOverrides } from './ai-security-overrides'
import {
  getAIAdminPolicySettings,
  setAIAdminPolicySettings,
  withRepositoryOverride,
} from '../../lib/ai-admin-policy'
import { getAvailableEditors } from '../../lib/editors/lookup'
import {
  ICustomIntegration,
  TargetPathArgument,
} from '../../lib/custom-integration'
import {
  EditorOverride,
  getEditorOverrideHash,
} from '../../models/editor-override'
import { IAppearanceCustomization } from '../../models/appearance-customization'
import { RepositorySettingsTab } from '../../models/repository-settings'
import { teleportAnchor } from '../../lib/teleport-targets'

interface IRepositorySettingsProps {
  readonly initialSelectedTab?: RepositorySettingsTab
  readonly dispatcher: Dispatcher
  readonly remote: IRemote | null
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly repositoryAccount: Account | null
  readonly appearanceCustomization: IAppearanceCustomization
  readonly onDismissed: () => void
}

export { RepositorySettingsTab }

interface IRemoteApplyProgress {
  /** Mutations that have finished. Zero while the first snapshot is read. */
  readonly completed: number
  readonly total: number
}

/**
 * One row in the settings navigation, carrying the identity it selects.
 *
 * `searchText` exists because a label may be a `<LocalizedText>` element
 * rather than a string, and a search has to match words the user can read.
 */
interface IRepositorySettingsTabDescriptor {
  readonly tab: RepositorySettingsTab
  readonly icon: OcticonSymbol
  readonly label: React.ReactNode
  readonly translationKey: TranslationKey
  readonly searchText?: string
}

const RepositorySettingsTabIds: Readonly<
  Record<RepositorySettingsTab, string>
> = {
  [RepositorySettingsTab.Remote]: 'remote',
  [RepositorySettingsTab.IgnoredFiles]: 'ignored-files',
  [RepositorySettingsTab.GitConfig]: 'git-config',
  [RepositorySettingsTab.BuildRun]: 'build-run',
  [RepositorySettingsTab.CheapLfs]: 'cheap-lfs',
  [RepositorySettingsTab.Submodules]: 'submodules',
  [RepositorySettingsTab.Subtrees]: 'subtrees',
  [RepositorySettingsTab.Automation]: 'automation',
  [RepositorySettingsTab.Metadata]: 'metadata',
  [RepositorySettingsTab.Appearance]: 'appearance',
  [RepositorySettingsTab.AISecurity]: 'ai-security',
  [RepositorySettingsTab.ForkSettings]: 'fork-settings',
}

const RepositorySettingsTabById: Readonly<
  Record<string, RepositorySettingsTab>
> = Object.fromEntries(
  Object.entries(RepositorySettingsTabIds).map(([tab, id]) => [id, Number(tab)])
)

/** Numeric ids written before browser tabs used stable string identities. */
const LegacyRepositorySettingsTabIds: Readonly<Record<string, string>> = {
  '0': 'remote',
  '1': 'ignored-files',
  '2': 'git-config',
  '3': 'build-run',
  '4': 'cheap-lfs',
  '5': 'submodules',
  '6': 'subtrees',
  '7': 'automation',
  '8': 'metadata',
  '9': 'appearance',
  '10': 'ai-security',
  '11': 'fork-settings',
}

/**
 * Adapt a settings page to the shared strip's vocabulary.
 *
 * The strip keys everything by a string id because it is shared between two
 * dialogs whose page enums have nothing to do with each other; stringifying the
 * enum keeps the identity stable without leaking the enum into the strip.
 */
const toSettingsTabItem = (
  descriptor: IRepositorySettingsTabDescriptor
): ISettingsTabItem => ({
  id: RepositorySettingsTabIds[descriptor.tab],
  domId: `repository-settings-tab-${RepositorySettingsTabIds[descriptor.tab]}`,
  label: descriptor.label,
  searchText:
    descriptor.searchText ??
    translateForAccessibleName(descriptor.translationKey, {}, 'english'),
  accessibleLabel: translateForAccessibleName(descriptor.translationKey),
  icon: <Octicon className="icon" symbol={descriptor.icon} />,
})

interface IRepositorySettingsState {
  readonly selectedTab: RepositorySettingsTab
  readonly tabDockPosition: SettingsTabDockPosition

  /** The settings search: its query, and the mode the regex builder set. */
  readonly tabFilter: string
  readonly tabFilterMode: FilterMode
  readonly tabFilterCaseSensitive: boolean
  /** The last bounded, credential-redacted Remote Manager inspection. */
  readonly remoteSnapshot: IRemoteManagementSnapshot | null
  readonly remoteManagementDirty: boolean
  readonly remoteManagementPlan: IRemoteManagementPlan | null
  /**
   * Determinate progress for the reviewed remote plan. Each mutation is
   * bracketed by a full remote snapshot, so a modest plan is still ~130 serial
   * child processes; null means no plan is being applied.
   */
  readonly remoteApplyProgress: IRemoteApplyProgress | null
  readonly ignoreText: string | null
  readonly ignoreTextHasChanged: boolean
  readonly disabled: boolean
  /** True while the embedded subtree manager owns a Git mutation. */
  readonly subtreeOperationInProgress: boolean
  readonly saveDisabled: boolean
  readonly gitConfigLocation: GitConfigLocation
  readonly committerName: string
  readonly committerEmail: string
  readonly globalCommitterName: string
  readonly globalCommitterEmail: string
  readonly initialGitConfigLocation: GitConfigLocation
  readonly initialCommitterName: string | null
  readonly initialCommitterEmail: string | null
  readonly errors?: ReadonlyArray<JSX.Element | string>
  readonly forkContributionTarget: ForkContributionTarget
  readonly isLoadingGitConfig: boolean
  readonly accountKey: string | null
  readonly buildRunPreferences: IBuildRunPreferences
  readonly buildRunPreferencesHaveChanged: boolean
  readonly automationOverrides: IAutomationSettingsOverrides
  readonly appearanceCustomization: IAppearanceCustomization
  readonly appearanceCustomizationHasChanged: boolean
  readonly defaultBranch: string
  readonly availableEditors: ReadonlyArray<string>
  readonly useDefaultEditor: boolean
  readonly selectedExternalEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly aiAdminPolicySettings: ReturnType<typeof getAIAdminPolicySettings>
}

export class RepositorySettings extends React.Component<
  IRepositorySettingsProps,
  IRepositorySettingsState
> {
  private remoteManagementAbortController = new AbortController()
  private isMounted = false

  public constructor(props: IRepositorySettingsProps) {
    super(props)

    this.state = {
      selectedTab:
        this.props.initialSelectedTab || RepositorySettingsTab.Remote,
      tabDockPosition: getSettingsTabDockPosition('repository-settings'),
      tabFilter: '',
      tabFilterMode: FilterMode.Substring,
      tabFilterCaseSensitive: false,
      remoteSnapshot: null,
      remoteManagementDirty: false,
      remoteManagementPlan: null,
      remoteApplyProgress: null,
      ignoreText: null,
      ignoreTextHasChanged: false,
      disabled: false,
      subtreeOperationInProgress: false,
      forkContributionTarget: getForkContributionTarget(props.repository),
      saveDisabled: false,
      gitConfigLocation: GitConfigLocation.Global,
      committerName: '',
      committerEmail: '',
      globalCommitterName: '',
      globalCommitterEmail: '',
      initialGitConfigLocation: GitConfigLocation.Global,
      initialCommitterName: null,
      initialCommitterEmail: null,
      isLoadingGitConfig: true,
      // Keep a legacy repository unbound until the user actually chooses an
      // identity. Display may still show the effective endpoint fallback, but
      // saving an unrelated setting must not silently persist the first account
      // on a shared GitHub host.
      accountKey: props.repository.accountKey,
      buildRunPreferences:
        props.repository.buildRunPreferences ?? defaultBuildRunPreferences,
      buildRunPreferencesHaveChanged: false,
      automationOverrides: loadRepositoryAutomationOverrides(
        props.repository.id
      ),
      appearanceCustomization: props.appearanceCustomization,
      appearanceCustomizationHasChanged: false,
      defaultBranch: props.repository.defaultBranch ?? '',
      availableEditors: [],
      useDefaultEditor: props.repository.customEditorOverride === null,
      selectedExternalEditor:
        props.repository.customEditorOverride?.selectedExternalEditor ?? null,
      useCustomEditor:
        props.repository.customEditorOverride?.useCustomEditor ?? false,
      customEditor: props.repository.customEditorOverride?.customEditor ?? {
        path: '',
        arguments: TargetPathArgument,
      },
      aiAdminPolicySettings: getAIAdminPolicySettings(),
    }
  }

  public componentDidMount() {
    this.isMounted = true
    // The settings dialog reads several independent sources on startup. Keep
    // that work out of componentWillMount: React may render and discard a
    // component before it ever mounts, leaving an async lifecycle method free
    // to call setState on a tree that no longer exists.
    void this.loadInitialSettings()
  }

  private async loadInitialSettings() {
    await this.loadRemoteManagementSnapshot()

    if (!this.isMounted) {
      return
    }

    try {
      const ignoreText = await readGitIgnoreAtRoot(this.props.repository)
      if (!this.isMounted) {
        return
      }
      this.setState({ ignoreText })
    } catch (e) {
      if (!this.isMounted) {
        return
      }
      log.error(
        `RepositorySettings: unable to read root .gitignore file for ${this.props.repository.path}`,
        e
      )
      this.setState({ errors: [`Could not read root .gitignore: ${e}`] })
    }

    try {
      const editors = await getAvailableEditors()
      if (!this.isMounted) {
        return
      }
      this.setState({ availableEditors: editors.map(editor => editor.editor) })
    } catch (e) {
      if (!this.isMounted) {
        return
      }
      log.warn('RepositorySettings: unable to find external editors', e)
    }

    const localCommitterName = await getConfigValue(
      this.props.repository,
      'user.name',
      true
    )
    const localCommitterEmail = await getConfigValue(
      this.props.repository,
      'user.email',
      true
    )

    const globalCommitterName = (await getGlobalConfigValue('user.name')) || ''
    const globalCommitterEmail =
      (await getGlobalConfigValue('user.email')) || ''

    if (!this.isMounted) {
      return
    }

    const gitConfigLocation =
      localCommitterName === null && localCommitterEmail === null
        ? GitConfigLocation.Global
        : GitConfigLocation.Local

    let committerName = globalCommitterName
    let committerEmail = globalCommitterEmail

    if (gitConfigLocation === GitConfigLocation.Local) {
      committerName = localCommitterName ?? ''
      committerEmail = localCommitterEmail ?? ''
    }

    this.setState({
      gitConfigLocation,
      committerName,
      committerEmail,
      globalCommitterName,
      globalCommitterEmail,
      initialGitConfigLocation: gitConfigLocation,
      initialCommitterName: localCommitterName,
      initialCommitterEmail: localCommitterEmail,
      isLoadingGitConfig: false,
    })
  }

  public componentWillUnmount() {
    this.isMounted = false
    this.remoteManagementAbortController.abort()
  }

  public componentDidUpdate(prevProps: IRepositorySettingsProps) {
    if (prevProps.repository.path !== this.props.repository.path) {
      this.remoteManagementAbortController.abort()
      this.props.onDismissed()
    }
  }

  private async loadRemoteManagementSnapshot() {
    try {
      const remoteSnapshot = await getRemoteManagementSnapshot(
        this.props.repository,
        this.remoteManagementAbortController.signal
      )
      if (
        this.isMounted &&
        !this.remoteManagementAbortController.signal.aborted
      ) {
        this.setState({
          remoteSnapshot,
          remoteManagementDirty: false,
          remoteManagementPlan: null,
        })
      }
    } catch (e) {
      if (
        !this.isMounted ||
        this.remoteManagementAbortController.signal.aborted
      ) {
        return
      }
      log.error(
        `RepositorySettings: unable to read remotes for ${this.props.repository.path}`,
        e
      )
      this.setState({
        errors: [
          'Remote Manager could not inspect this repository safely. Close settings, verify the repository, and try again.',
        ],
      })
    }
  }

  private renderErrors(): JSX.Element[] | null {
    const errors = this.state.errors

    if (!errors || !errors.length) {
      return null
    }

    return errors.map((err, ix) => {
      const key = `err-${ix}`
      return <DialogError key={key}>{err}</DialogError>
    })
  }

  public render() {
    const visibleTabs = this.visibleTabs
    const allTabItems = this.tabDescriptors.map(toSettingsTabItem)
    const dialogBusy =
      this.state.disabled || this.state.subtreeOperationInProgress

    return (
      <Dialog
        id="repository-settings"
        title={translateForAccessibleName('repositorySettings.dialogTitle')}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={dialogBusy}
        dismissDisabled={this.state.subtreeOperationInProgress}
        // The remote plan apply is a long serial run of child processes; fold
        // it into the same header spinner the subtree operations already use so
        // the dialog never just goes inert.
        loading={
          this.state.subtreeOperationInProgress ||
          (this.state.disabled && this.state.remoteManagementPlan !== null)
        }
      >
        {this.renderErrors()}

        <div
          className="tab-container settings-workbench settings-workbench-repository"
          data-settings-tab-dock-position={this.state.tabDockPosition}
        >
          <div className="settings-tab-rail settings-workbench-navigation">
            <div className="settings-tab-rail-header settings-workbench-heading">
              {this.renderTabSearch()}
              <SettingsTabDockControl
                strip="repository-settings"
                position={this.state.tabDockPosition}
                onChange={this.onTabDockPositionChanged}
                disabled={dialogBusy}
              />
            </div>
            <SettingsTabStrip
              strip="repository-settings"
              title={this.getRepositoryBrowserTabLabels().surface}
              items={visibleTabs.map(toSettingsTabItem)}
              allItems={allTabItems}
              selectedId={RepositorySettingsTabIds[this.state.selectedTab]}
              onSelect={this.onTabSelected}
              disabled={dialogBusy}
              openStateScope={this.props.repository.path}
              legacyTabIdMap={LegacyRepositorySettingsTabIds}
              variant="browser"
              showNewTab={true}
              dockPosition={this.state.tabDockPosition}
              getTabPanelId={this.getTabPanelId}
              accessibleLabels={this.getRepositoryBrowserTabLabels()}
            />
          </div>

          <div
            className="active-tab settings-workbench-content"
            id={this.getTabPanelId(
              RepositorySettingsTabIds[this.state.selectedTab]
            )}
            role="tabpanel"
            aria-labelledby={`repository-settings-tab-${
              RepositorySettingsTabIds[this.state.selectedTab]
            }`}
            data-settings-tab-dock-position={this.state.tabDockPosition}
          >
            {this.renderActiveTab()}
          </div>
        </div>
        {this.renderRemoteApplyProgress()}
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Save"
            okButtonDisabled={
              this.state.subtreeOperationInProgress ||
              this.state.saveDisabled ||
              (this.state.remoteManagementDirty &&
                this.state.remoteManagementPlan === null)
            }
            cancelButtonDisabled={this.state.subtreeOperationInProgress}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderActiveTab() {
    const tab = this.state.selectedTab
    switch (tab) {
      case RepositorySettingsTab.Remote: {
        const snapshot = this.state.remoteSnapshot
        return (
          <>
            {this.renderRepositoryAccountPicker()}
            {snapshot === null ? (
              <DialogContent>
                <p role="status">Inspecting bounded remote settings…</p>
              </DialogContent>
            ) : (
              <Remote
                repositoryPath={this.props.repository.path}
                snapshot={snapshot}
                preferredRemoteName={this.props.remote?.name ?? null}
                disabled={this.state.disabled}
                onReviewStateChanged={this.onRemoteReviewStateChanged}
                onPublish={this.onPublish}
                onTransfer={
                  isRepositoryWithGitHubRepository(this.props.repository)
                    ? this.onTransfer
                    : undefined
                }
              />
            )}
          </>
        )
      }
      case RepositorySettingsTab.IgnoredFiles: {
        return (
          <GitIgnore
            repository={this.props.repository}
            text={this.state.ignoreText}
            onIgnoreTextChanged={this.onIgnoreTextChanged}
            onShowExamples={this.onShowGitIgnoreExamples}
          />
        )
      }
      case RepositorySettingsTab.BuildRun: {
        return (
          <BuildRunSettings
            repository={this.props.repository}
            preferences={this.state.buildRunPreferences}
            onPreferencesChanged={this.onBuildRunPreferencesChanged}
          />
        )
      }
      case RepositorySettingsTab.CheapLfs: {
        return (
          <CheapLfsSettings
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            preferences={this.state.buildRunPreferences}
            onPreferencesChanged={this.onBuildRunPreferencesChanged}
          />
        )
      }
      case RepositorySettingsTab.Submodules: {
        return (
          <Submodules
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            onRepositoryOpened={this.props.onDismissed}
            appearanceCustomization={this.state.appearanceCustomization}
            onAppearanceCustomizationChanged={
              this.onAppearanceCustomizationChanged
            }
          />
        )
      }
      case RepositorySettingsTab.Subtrees: {
        return (
          <SubtreeManager
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            accounts={this.props.accounts}
            onOperationStateChanged={this.onSubtreeOperationStateChanged}
          />
        )
      }
      case RepositorySettingsTab.Automation: {
        return (
          <AutomationOverrides
            overrides={this.state.automationOverrides}
            onChanged={this.onAutomationOverridesChanged}
          />
        )
      }
      case RepositorySettingsTab.Metadata: {
        return (
          <RepositoryMetadata
            defaultBranch={this.state.defaultBranch}
            availableEditors={this.state.availableEditors}
            useDefaultEditor={this.state.useDefaultEditor}
            selectedExternalEditor={this.state.selectedExternalEditor}
            useCustomEditor={this.state.useCustomEditor}
            customEditor={this.state.customEditor}
            onDefaultBranchChanged={this.onDefaultBranchChanged}
            onUseDefaultEditorChanged={this.onUseDefaultEditorChanged}
            onSelectedEditorChanged={this.onSelectedEditorChanged}
            onUseCustomEditorChanged={this.onUseCustomEditorChanged}
            onCustomEditorChanged={this.onCustomEditorChanged}
          />
        )
      }
      case RepositorySettingsTab.Appearance: {
        return (
          <RepositoryAppearance
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
          />
        )
      }
      case RepositorySettingsTab.AISecurity: {
        return (
          <AISecurityOverrides
            repositoryPath={this.props.repository.path}
            settings={this.state.aiAdminPolicySettings}
            onOverrideChanged={this.onAISecurityOverrideChanged}
          />
        )
      }
      case RepositorySettingsTab.ForkSettings: {
        if (!isRepositoryWithForkedGitHubRepository(this.props.repository)) {
          return null
        }

        return (
          <ForkSettings
            forkContributionTarget={this.state.forkContributionTarget}
            repository={this.props.repository}
            onForkContributionTargetChanged={
              this.onForkContributionTargetChanged
            }
          />
        )
      }

      case RepositorySettingsTab.GitConfig: {
        return (
          <GitConfig
            account={this.props.repositoryAccount}
            gitConfigLocation={this.state.gitConfigLocation}
            onGitConfigLocationChanged={this.onGitConfigLocationChanged}
            name={this.state.committerName}
            email={this.state.committerEmail}
            globalName={this.state.globalCommitterName}
            globalEmail={this.state.globalCommitterEmail}
            onNameChanged={this.onCommitterNameChanged}
            onEmailChanged={this.onCommitterEmailChanged}
            isLoadingGitConfig={this.state.isLoadingGitConfig}
          />
        )
      }

      default:
        return assertNever(tab, `Unknown tab type: ${tab}`)
    }
  }

  private onPublish = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.PublishRepository,
      repository: this.props.repository,
    })
  }

  private onTransfer = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      void this.props.dispatcher.showTransferRepositoryDialog(
        this.props.repository,
        () => void this.loadRemoteManagementSnapshot()
      )
    }
  }

  private renderRepositoryAccountPicker() {
    const endpoint = this.props.repository.gitHubRepository?.endpoint
    if (endpoint === undefined) {
      return null
    }

    const eligibleAccounts = this.props.accounts.filter(
      account => account.endpoint === endpoint
    )
    const selectedAccount =
      eligibleAccounts.find(
        account => getAccountKey(account) === this.state.accountKey
      ) ?? eligibleAccounts.at(0)

    if (selectedAccount === undefined) {
      return (
        <section className="repository-account-setting">
          <h3>Repository account</h3>
          <p>
            Sign in to this GitHub host to choose an identity for authenticated
            operations.
          </p>
        </section>
      )
    }

    return (
      <section
        className="repository-account-setting"
        {...teleportAnchor('repo-settings-account')}
      >
        <div>
          <h3>Repository account</h3>
          <p>
            Used for fetch, push, pull requests, issues, and other GitHub
            operations in this repository.
          </p>
        </div>
        <AccountPicker
          accounts={eligibleAccounts}
          selectedAccount={selectedAccount}
          onSelectedAccountChanged={this.onSelectedAccountChanged}
        />
      </section>
    )
  }

  private onSelectedAccountChanged = (account: Account) => {
    this.setState({ accountKey: getAccountKey(account) })
  }

  private onShowGitIgnoreExamples = () => {
    this.props.dispatcher.openInBrowser('https://git-scm.com/docs/gitignore')
  }

  private onRemoteMutationApplied = (completed: number, total: number) => {
    if (!this.isMounted) {
      return
    }
    this.setState({ remoteApplyProgress: { completed, total } })
  }

  private renderRemoteApplyProgress() {
    if (!this.state.disabled || this.state.remoteManagementPlan === null) {
      return null
    }

    const progress = this.state.remoteApplyProgress
    const description =
      progress === null
        ? t('remoteManager.applyProgressPreparing')
        : t('remoteManager.applyProgressStatus', {
            index: String(Math.min(progress.completed + 1, progress.total)),
            total: String(progress.total),
          })

    return (
      <OperationProgressRow
        className="repository-settings-remote-apply-progress"
        label={translateForAccessibleName('remoteManager.applyProgressLabel')}
        description={description}
        value={progress?.completed ?? null}
        max={progress?.total ?? null}
        countText={
          progress === null
            ? undefined
            : `${progress.completed}/${progress.total}`
        }
      />
    )
  }

  private onSubmit = async () => {
    if (this.state.subtreeOperationInProgress) {
      return
    }

    if (
      this.state.remoteManagementDirty &&
      this.state.remoteManagementPlan === null
    ) {
      this.setState({
        selectedTab: RepositorySettingsTab.Remote,
        errors: ['Review and confirm the staged remote changes before Save.'],
      })
      return
    }

    this.setState({ disabled: true, errors: undefined })
    const errors = new Array<JSX.Element | string>()

    if (this.state.remoteManagementPlan !== null) {
      // Total is not known until the plan is expanded inside the library, so
      // the row starts indeterminate and becomes determinate on the first
      // onMutationApplied callback.
      this.setState({ remoteApplyProgress: null })
      try {
        const remoteSnapshot =
          await this.props.dispatcher.applyRemoteManagementPlan(
            this.props.repository,
            this.state.remoteManagementPlan,
            {
              signal: this.remoteManagementAbortController.signal,
              onMutationApplied: this.onRemoteMutationApplied,
            }
          )
        this.setState({
          remoteSnapshot,
          remoteManagementDirty: false,
          remoteManagementPlan: null,
          remoteApplyProgress: null,
        })
      } catch (e) {
        if (this.remoteManagementAbortController.signal.aborted) {
          return
        }
        log.error('RepositorySettings: guarded remote plan stopped', e)
        this.setState({
          disabled: false,
          remoteApplyProgress: null,
          selectedTab: RepositorySettingsTab.Remote,
          errors: [
            e instanceof Error
              ? e.message
              : 'The reviewed remote plan stopped safely. Inspect it again.',
          ],
        })
        return
      }
    }

    this.props.dispatcher.setRepositoryAutomationOverrides(
      this.props.repository.id,
      this.state.automationOverrides
    )

    if (this.state.appearanceCustomizationHasChanged) {
      try {
        await this.props.dispatcher.setAppearanceCustomization(
          this.state.appearanceCustomization
        )
        this.setState({ appearanceCustomizationHasChanged: false })
      } catch (e) {
        log.error(
          'RepositorySettings: unable to save active-profile appearance',
          e
        )
        errors.push(`Failed saving the active-profile appearance: ${e}`)
      }
    }

    if (this.state.accountKey !== this.props.repository.accountKey) {
      await this.props.dispatcher.updateRepositoryAccount(
        this.props.repository,
        this.state.accountKey
      )
    }

    if (this.state.ignoreTextHasChanged && this.state.ignoreText !== null) {
      try {
        await this.props.dispatcher.saveGitIgnore(
          this.props.repository,
          this.state.ignoreText
        )
      } catch (e) {
        log.error(
          `RepositorySettings: unable to save gitignore at ${this.props.repository.path}`,
          e
        )
        errors.push(`Failed saving the .gitignore file: ${e}`)
      }
    }

    // only update this if it will be different from what we have stored
    if (
      this.state.forkContributionTarget !==
      this.props.repository.workflowPreferences.forkContributionTarget
    ) {
      await this.props.dispatcher.updateRepositoryWorkflowPreferences(
        this.props.repository,
        {
          ...this.props.repository.workflowPreferences,
          forkContributionTarget: this.state.forkContributionTarget,
        }
      )
    }

    if (this.state.buildRunPreferencesHaveChanged) {
      try {
        await this.props.dispatcher.updateRepositoryBuildRunPreferences(
          this.props.repository,
          this.state.buildRunPreferences
        )
      } catch (e) {
        log.error(
          `RepositorySettings: unable to save Build & Run preferences at ${this.props.repository.path}`,
          e
        )
        errors.push(`Failed saving the Build & Run preferences: ${e}`)
      }
    }

    const defaultBranch = this.state.defaultBranch.trim() || null
    if (defaultBranch !== this.props.repository.defaultBranch) {
      try {
        await this.props.dispatcher.updateRepositoryDefaultBranch(
          this.props.repository,
          defaultBranch
        )
      } catch (e) {
        log.error('RepositorySettings: unable to save default branch', e)
        errors.push(`Failed saving the default branch: ${e}`)
      }
    }

    const editorOverride: EditorOverride | null = this.state.useDefaultEditor
      ? null
      : {
          selectedExternalEditor: this.state.selectedExternalEditor,
          useCustomEditor: this.state.useCustomEditor,
          customEditor: this.state.customEditor,
        }
    if (
      getEditorOverrideHash(editorOverride) !==
      getEditorOverrideHash(this.props.repository.customEditorOverride)
    ) {
      try {
        await this.props.dispatcher.updateRepositoryEditorOverride(
          this.props.repository,
          editorOverride
        )
      } catch (e) {
        log.error('RepositorySettings: unable to save editor override', e)
        errors.push(`Failed saving the external editor: ${e}`)
      }
    }

    let shouldRefreshAuthor = false
    const gitLocationChanged =
      this.state.gitConfigLocation !== this.state.initialGitConfigLocation

    if (
      gitLocationChanged &&
      this.state.gitConfigLocation === GitConfigLocation.Global
    ) {
      // If it's now configured to use the global config, just delete the local
      // user info in this repository.
      await removeConfigValue(this.props.repository, 'user.name')
      await removeConfigValue(this.props.repository, 'user.email')

      shouldRefreshAuthor = true
    } else if (this.state.gitConfigLocation === GitConfigLocation.Local) {
      // Otherwise, update the local name and email if needed
      if (this.state.committerName !== this.state.initialCommitterName) {
        await setConfigValue(
          this.props.repository,
          'user.name',
          this.state.committerName
        )
        shouldRefreshAuthor = true
      }

      if (this.state.committerEmail !== this.state.initialCommitterEmail) {
        await setConfigValue(
          this.props.repository,
          'user.email',
          this.state.committerEmail
        )
        shouldRefreshAuthor = true
      }
    }

    if (shouldRefreshAuthor) {
      this.props.dispatcher.refreshAuthor(this.props.repository)
    }

    if (!errors.length) {
      this.props.onDismissed()
    } else {
      this.setState({ disabled: false, errors })
    }
  }

  private onRemoteReviewStateChanged = (
    remoteManagementDirty: boolean,
    remoteManagementPlan: IRemoteManagementPlan | null
  ) => {
    this.setState({ remoteManagementDirty, remoteManagementPlan })
  }

  private onIgnoreTextChanged = (text: string) => {
    this.setState({ ignoreText: text, ignoreTextHasChanged: true })
  }

  private onBuildRunPreferencesChanged = (
    buildRunPreferences: IBuildRunPreferences
  ) => {
    this.setState({
      buildRunPreferences,
      buildRunPreferencesHaveChanged: true,
    })
  }

  private onAutomationOverridesChanged = (
    automationOverrides: IAutomationSettingsOverrides
  ) => {
    this.setState({ automationOverrides })
  }

  private onAISecurityOverrideChanged = (override: 'allow' | 'deny' | null) => {
    const updated = withRepositoryOverride(
      this.state.aiAdminPolicySettings,
      this.props.repository.path,
      override
    )
    setAIAdminPolicySettings(updated)
    this.setState({ aiAdminPolicySettings: updated })
  }

  private onAppearanceCustomizationChanged = (
    appearanceCustomization: IAppearanceCustomization
  ) => {
    this.setState({
      appearanceCustomization,
      appearanceCustomizationHasChanged: true,
    })
  }

  private onSubtreeOperationStateChanged = (
    subtreeOperationInProgress: boolean
  ) => {
    if (this.isMounted) {
      this.setState({ subtreeOperationInProgress })
    }
  }

  /**
   * Every tab, in display order, paired with the identity it selects.
   *
   * The enum used to be positional — its values were defined to equal the
   * TabBar's child indices, with a note asking integrators to keep them
   * contiguous. That held only while the list was a fixed run of children.
   * A search filters the list, so the third visible row is no longer the
   * third tab, and an index passed straight through would open whichever
   * settings page happened to sit at that position. Identity travels with
   * each descriptor instead, so the mapping survives both filtering and the
   * conditionally-rendered fork tab.
   */
  private get tabDescriptors(): ReadonlyArray<IRepositorySettingsTabDescriptor> {
    const showForkSettings = isRepositoryWithForkedGitHubRepository(
      this.props.repository
    )

    const descriptors: Array<IRepositorySettingsTabDescriptor> = [
      {
        tab: RepositorySettingsTab.Remote,
        icon: octicons.server,
        label: <LocalizedText translationKey="repositorySettings.tabRemote" />,
        translationKey: 'repositorySettings.tabRemote',
      },
      {
        tab: RepositorySettingsTab.IgnoredFiles,
        icon: octicons.file,
        label: (
          <LocalizedText translationKey="repositorySettings.tabIgnoredFiles" />
        ),
        translationKey: 'repositorySettings.tabIgnoredFiles',
      },
      {
        tab: RepositorySettingsTab.GitConfig,
        icon: octicons.gitCommit,
        label: (
          <LocalizedText translationKey="repositorySettings.tabGitConfig" />
        ),
        translationKey: 'repositorySettings.tabGitConfig',
      },
      {
        tab: RepositorySettingsTab.BuildRun,
        icon: octicons.play,
        label: (
          <LocalizedText translationKey="repositorySettings.buildRunTab" />
        ),
        translationKey: 'repositorySettings.buildRunTab',
        searchText: 'Build and run',
      },
      {
        tab: RepositorySettingsTab.CheapLfs,
        icon: octicons.database,
        label: (
          <LocalizedText translationKey="repositorySettings.cheapLfsTab" />
        ),
        translationKey: 'repositorySettings.cheapLfsTab',
        searchText: 'Cheap LFS',
      },
      {
        tab: RepositorySettingsTab.Submodules,
        icon: octicons.fileSubmodule,
        label: <LocalizedText translationKey="submodule.title" />,
        translationKey: 'submodule.title',
        searchText: 'Submodules',
      },
      {
        tab: RepositorySettingsTab.Subtrees,
        icon: octicons.gitMerge,
        label: <LocalizedText translationKey="subtree.title" />,
        translationKey: 'subtree.title',
        searchText: 'Subtrees',
      },
      {
        tab: RepositorySettingsTab.Automation,
        icon: octicons.sync,
        label: (
          <LocalizedText translationKey="repositorySettings.automationTab" />
        ),
        translationKey: 'repositorySettings.automationTab',
        searchText: 'Automation',
      },
      {
        tab: RepositorySettingsTab.Metadata,
        icon: octicons.gear,
        label: (
          <LocalizedText translationKey="repositorySettings.tabMetadata" />
        ),
        translationKey: 'repositorySettings.tabMetadata',
      },
      {
        tab: RepositorySettingsTab.Appearance,
        icon: octicons.paintbrush,
        label: (
          <LocalizedText translationKey="repositorySettings.appearanceTab" />
        ),
        translationKey: 'repositorySettings.appearanceTab',
        searchText: 'Appearance',
      },
      {
        tab: RepositorySettingsTab.AISecurity,
        icon: octicons.shield,
        label: (
          <LocalizedText translationKey="repositorySettings.tabAISecurity" />
        ),
        translationKey: 'repositorySettings.tabAISecurity',
        searchText: 'AI security',
      },
    ]

    if (showForkSettings) {
      descriptors.push({
        tab: RepositorySettingsTab.ForkSettings,
        icon: octicons.repoForked,
        label: (
          <LocalizedText translationKey="repositorySettings.tabForkSettings" />
        ),
        translationKey: 'repositorySettings.tabForkSettings',
        searchText: 'Fork behavior',
      })
    }

    return descriptors
  }

  /** The tabs surviving the current filter, never fewer than the selected one. */
  private get visibleTabs(): ReadonlyArray<IRepositorySettingsTabDescriptor> {
    const all = this.tabDescriptors
    const filtered = filterByMode(
      all,
      descriptor => [
        descriptor.searchText ??
          translateForAccessibleName(descriptor.translationKey, {}, 'english'),
      ],
      this.state.tabFilter,
      this.state.tabFilterMode,
      this.state.tabFilterCaseSensitive
    ).items

    // Never filter the open tab out from under the panel beside it: the panel
    // keeps rendering that tab's content, so a strip that no longer lists it
    // would show a selection the user cannot see or return to.
    if (filtered.some(d => d.tab === this.state.selectedTab)) {
      return filtered
    }
    const selected = all.find(d => d.tab === this.state.selectedTab)
    return selected === undefined ? filtered : [selected, ...filtered]
  }

  private renderTabSearch() {
    return (
      <div className="repository-settings-tab-search settings-workbench-search">
        <label htmlFor="repository-settings-tab-filter">
          <LocalizedText translationKey="repositorySettings.searchLabel" />
        </label>
        <div className="repository-settings-tab-filter-field">
          <input
            id="repository-settings-tab-filter"
            data-search-surface-id="repository-settings-tabs"
            type="search"
            value={this.state.tabFilter}
            onChange={this.onTabFilterChanged}
            aria-label={translateForAccessibleName(
              'repositorySettings.searchLabel'
            )}
          />
          <FilterModeControl
            searchSurfaceId="repository-settings-tabs"
            mode={this.state.tabFilterMode}
            caseSensitive={this.state.tabFilterCaseSensitive}
            onModeChange={this.onTabFilterModeChanged}
            onCaseSensitiveChange={this.onTabFilterCaseChanged}
            regexBuilderTarget="repository settings"
            getSampleItems={this.getTabSampleItems}
            filterText={this.state.tabFilter}
            onRegexPatternApply={this.onTabFilterPatternApply}
          />
        </div>
      </div>
    )
  }

  private onTabFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ tabFilter: event.currentTarget.value })
  }

  private onTabFilterModeChanged = (mode: FilterMode) => {
    this.setState({ tabFilterMode: mode })
  }

  private onTabFilterCaseChanged = (caseSensitive: boolean) => {
    this.setState({ tabFilterCaseSensitive: caseSensitive })
  }

  private onTabFilterPatternApply = (
    pattern: string,
    caseSensitive: boolean
  ) => {
    this.setState({
      tabFilter: pattern,
      tabFilterMode: FilterMode.Regex,
      tabFilterCaseSensitive: caseSensitive,
    })
  }

  private getTabSampleItems = () =>
    this.tabDescriptors.map(
      d =>
        d.searchText ??
        translateForAccessibleName(d.translationKey, {}, 'english')
    )

  /**
   * The strip reports the page's own id, never a position.
   *
   * The enum used to be positional — its values were defined to equal the tab
   * bar's child indices — so once a filter removed earlier rows, an index
   * passed straight through opened whichever page happened to sit at that
   * number. Identity travels with the row instead.
   */
  private onTabSelected = (id: string) => {
    if (this.state.subtreeOperationInProgress) {
      return
    }
    const tab = RepositorySettingsTabById[id]
    const descriptor =
      tab === undefined
        ? undefined
        : this.tabDescriptors.find(d => d.tab === tab)
    if (descriptor !== undefined) {
      this.setState({ selectedTab: descriptor.tab })
    }
  }

  private getTabPanelId = (id: string) => `repository-settings-panel-${id}`

  private getRepositoryBrowserTabLabels = () => {
    const surface = translateForAccessibleName('repositorySettings.tabsLabel')
    return {
      surface,
      tabList: surface,
      search: translateForAccessibleName('settings.browserTabSearch', {
        surface,
      }),
      openNewTab: translateForAccessibleName('settings.browserTabOpenNew', {
        surface,
      }),
      allPagesOpen: translateForAccessibleName('settings.browserTabAllOpen', {
        surface,
      }),
      morePages: (count: number) =>
        translateForAccessibleName('settings.browserTabMore', {
          count: String(count),
          surface,
        }),
      closeTab: (page: string) =>
        translateForAccessibleName('settings.browserTabClose', { page }),
      pinTab: (page: string) =>
        translateForAccessibleName('settings.browserTabPin', { page }),
      unpinTab: (page: string) =>
        translateForAccessibleName('settings.browserTabUnpin', { page }),
      pickerTitle: translateForAccessibleName(
        'settings.browserTabPickerTitle',
        { surface }
      ),
      noMatches: translateForAccessibleName('settings.browserTabNoMatches', {
        surface,
      }),
    }
  }

  private onTabDockPositionChanged = (
    tabDockPosition: SettingsTabDockPosition
  ) => {
    setSettingsTabDockPosition('repository-settings', tabDockPosition)
    this.setState({ tabDockPosition })
  }

  private onForkContributionTargetChanged = (
    forkContributionTarget: ForkContributionTarget
  ) => {
    this.setState({
      forkContributionTarget,
    })
  }

  private onGitConfigLocationChanged = (value: GitConfigLocation) => {
    this.setState({ gitConfigLocation: value })
  }

  private onCommitterNameChanged = (committerName: string) => {
    const errors = new Array<JSX.Element | string>()

    if (gitAuthorNameIsValid(committerName)) {
      this.setState({ saveDisabled: false })
    } else {
      this.setState({ saveDisabled: true })
      errors.push(InvalidGitAuthorNameMessage)
    }

    this.setState({ committerName, errors })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.setState({ defaultBranch })
  }

  private onUseDefaultEditorChanged = (useDefaultEditor: boolean) => {
    this.setState({ useDefaultEditor })
  }

  private onSelectedEditorChanged = (selectedExternalEditor: string) => {
    this.setState({ selectedExternalEditor })
  }

  private onUseCustomEditorChanged = (useCustomEditor: boolean) => {
    this.setState({ useCustomEditor })
  }

  private onCustomEditorChanged = (customEditor: ICustomIntegration) => {
    this.setState({ customEditor })
  }
}
