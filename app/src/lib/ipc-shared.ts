import { IMenuItemState } from './menu-update'
import { MenuIDs } from '../models/menu-ids'
import { ISerializableMenuItem } from './menu-item'
import { MenuLabelsEvent } from '../models/menu-labels'
import { MenuEvent } from '../main-process/menu'
import { LogLevel } from './logging/log-level'
import { ICrashDetails } from '../crash/shared'
import { WindowState } from './window-state'
import { IMenu } from '../models/app-menu'
import { ILaunchStats } from './stats'
import { URLActionType } from './parse-app-url'
import { Architecture } from './get-architecture'
import { EndpointToken } from './endpoint-token'
import { PathType } from '../ui/lib/app-proxy'
import {
  IFileConverterStoragePreflight,
  IFileSignatureInspection,
} from './file-converter'
import { ThemeSource } from '../ui/lib/theme-source'
import { DesktopNotificationPermission } from 'desktop-notifications'
import { NotificationCallback } from 'desktop-notifications'
import { DesktopAliveEvent } from './stores/alive-store'
import { CLIAction } from './cli-action'
import { IQuickActionRequest } from './quick-action'
import {
  IWindowsContextMenuApplyRequest,
  IWindowsContextMenuApplyResponse,
  IWindowsContextMenuLabels,
  IWindowsContextMenuState,
} from './windows-context-menu'
import {
  IBuildRunLogEvent,
  IBuildRunPlan,
  IBuildRunStateEvent,
} from './build-run/types'
import {
  IActionsLocalRunLogEvent,
  IActionsLocalRunPlan,
  IActionsLocalRunStateEvent,
  IActionsLocalToolAvailability,
  IActionsWorkflow,
} from './actions-local-run/types'
import {
  IOpencodeInstallRequest,
  IOpencodeInstallResult,
  IOpencodeLogEvent,
  IOpencodeRunFixRequest,
  IOpencodeRunPromptRequest,
  IOpencodeRunResult,
  IOpencodeStatus,
} from './build-run/opencode'
import {
  ICodexInstallRequest,
  ICodexInstallResult,
  ICodexLogEvent,
  ICodexRunFixRequest,
  ICodexRunPromptRequest,
  ICodexRunResult,
  ICodexStatus,
} from './build-run/codex'
import {
  AgentCommandResult,
  IAgentCommandEnvelope,
  IAgentServerConfiguration,
  IAgentServerStartupConfiguration,
  IAgentServerStatus,
} from './agent-commands'
import {
  ISelfHostedServerControllerStatus,
  ISelfHostedServerProvisioningProgress,
  ISelfHostedServerProvisioningRequest,
  SelfHostedServerProvisioningReply,
} from './self-hosted-server/provisioning'
import {
  ISelfHostedRunnerProgress,
  ISelfHostedRunnerPreflightRequest,
  ISelfHostedRunnerPreflightResult,
  ISelfHostedRunnerRemoveRequest,
  ISelfHostedRunnerRemoveResult,
  ISelfHostedRunnerSetupRequest,
  ISelfHostedRunnerSetupResult,
  ISelfHostedRunnerStatusRequest,
  ISelfHostedRunnerStatus,
  SelfHostedRunnerReply,
} from './self-hosted-runner/types'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
  ICLIWorkbenchOperationRequest,
  ICLIWorkbenchRuntime,
} from './cli-workbench'
import {
  ActionsArtifactTransferResult,
  ActionsJobLogTransferResult,
  IActionsArtifactTransferRequest,
  IActionsJobLogTransferRequest,
  IActionsTransferProgressEvent,
} from './actions-transfer'
import {
  ActionsArtifactSubjectInventoryResult,
  ActionsArtifactSubjectPrepareResult,
  IActionsArtifactSubjectInspectRequest,
  IActionsArtifactSubjectPrepareRequest,
} from './actions-artifact-subjects'
import {
  ActionsArtifactProvenanceResult,
  IActionsArtifactProvenanceCredentialRegistration,
  IActionsArtifactProvenanceVerifyRequest,
} from './actions-artifact-provenance'
import {
  GitHubReleaseAssetDownloadTransferResult,
  GitHubReleaseAssetUploadTransferResult,
  IGitHubReleaseAssetDownloadRequest,
  IGitHubReleaseAssetUploadRequest,
  IGitHubReleaseTransferProgressEvent,
} from './github-release-transfer'
import { ISilentInstallRequest, ISilentInstallResult } from './silent-install'
import {
  INotificationAutomationRunRequest,
  INotificationCommandResult,
  INotificationWebhookResult,
} from './notifications/automation/notification-automation'
import {
  BrowserOpenMode,
  IInternalBrowserContentBounds,
  IInternalBrowserFindTally,
  IInternalBrowserOAuthCallbackReceipt,
  IInternalBrowserPageText,
  IInternalBrowserState,
  IOpenExternalOptions,
  InternalBrowserCommand,
} from './internal-browser'
import {
  CheapLfsPayloadCredentialCleanupResult,
  ICheapLfsPayloadCredentialCleanupRequest,
} from './cheap-lfs/payload-encryption-credential-cleanup'
import {
  AgentSetupRunResult,
  IAgentSetupRunRequest,
} from './agent-sessions/setup-commands'
import {
  HomeAssistantBooleanState,
  IHomeAssistantSettingsRequest,
  ISetHomeAssistantTokenRequest,
  IScheduledSettingsValue,
} from '../models/scheduled-settings'

/**
 * Defines the simplex IPC channel names we use from the renderer
 * process along with their signatures. This type is used from both
 * the renderer and the main process to ensure a common contract between
 * the two over the untyped IPC framework.
 */
export type RequestChannels = {
  'cancel-actions-artifact-provenance': (operationId: string) => void
  'release-actions-artifact-provenance-credential-lease': (
    accountHandle: string
  ) => void
  'invalidate-actions-artifact-provenance-credential-lease-generation': (
    accountsGeneration: number
  ) => void
  'cancel-actions-artifact-subject-operation': (operationId: string) => void
  'release-actions-artifact-download': (downloadId: string) => void
  'cancel-actions-transfer': (operationId: string) => void
  'actions-transfer-progress': (event: IActionsTransferProgressEvent) => void
  'cancel-github-release-transfer': (operationId: string) => void
  'github-release-transfer-progress': (
    event: IGitHubReleaseTransferProgressEvent
  ) => void
  'agent-command': (command: IAgentCommandEnvelope) => void
  'agent-command-result': (id: string, result: AgentCommandResult) => void
  'agent-server-status': (status: IAgentServerStatus) => void
  'self-hosted-server-provisioning-progress': (
    progress: ISelfHostedServerProvisioningProgress
  ) => void
  'self-hosted-runner-progress': (progress: ISelfHostedRunnerProgress) => void
  'select-all-window-contents': () => void
  'dialog-did-open': () => void
  'update-menu-state': (
    state: Array<{ id: MenuIDs; state: IMenuItemState }>
  ) => void
  'renderer-ready': (time: number) => void
  'execute-menu-item-by-id': (id: string) => void
  'show-certificate-trust-dialog': (
    certificate: Electron.Certificate,
    message: string
  ) => void
  'get-app-menu': () => void
  'update-preferred-app-menu-item-labels': (labels: MenuLabelsEvent) => void
  'uncaught-exception': (error: Error) => void
  'send-error-report': (
    error: Error,
    extra: Record<string, string>,
    nonFatal: boolean
  ) => void
  'unsafe-open-directory': (path: string) => void
  'menu-event': (name: MenuEvent) => void
  log: (level: LogLevel, message: string) => void
  'set-verbose-logging': (verbose: boolean) => void
  'cancel-quitting': () => void
  'crash-ready': () => void
  'crash-quit': () => void
  'window-state-changed': (windowState: WindowState) => void
  error: (crashDetails: ICrashDetails) => void
  'zoom-factor-changed': (zoomFactor: number) => void
  'window-content-size-changed': (width: number, height: number) => void
  'app-menu': (menu: IMenu) => void
  'launch-timing-stats': (stats: ILaunchStats) => void
  'url-action': (
    action: URLActionType,
    internalBrowserCallbackId?: string
  ) => void
  'cli-action': (action: CLIAction) => void
  'certificate-error': (
    certificate: Electron.Certificate,
    error: string,
    url: string
  ) => void
  focus: () => void
  blur: () => void
  'update-accounts': (accounts: ReadonlyArray<EndpointToken>) => void
  'accounts-changed': () => void
  /**
   * A main-process background failure that was contained instead of crashing
   * the app. Carries no detail on purpose: the diagnostics stay in the log so
   * an arbitrary error message can never copy a credential into the UI.
   */
  'contained-background-failure': () => void
  /**
   * A normalized HTTP(S) launch was rejected by the operating system. Carries
   * no URL or error detail so signed links and credentials stay out of notices.
   */
  'browser-external-open-failed': () => void
  'quit-and-install-updates': () => void
  'quit-app': (evenIfUpdating: boolean) => void
  'open-repository-in-new-window': (path: string | null) => void
  'set-window-title': (title: string) => void
  'set-window-repository-state': (
    selectedRepositoryPath: string | null,
    openRepositoryPaths: ReadonlyArray<string>
  ) => void
  'minimize-window': () => void
  'maximize-window': () => void
  'unmaximize-window': () => void
  'close-window': () => void
  /** Main -> renderer: durably drain stores before a native window close. */
  'prepare-window-close': (requestId: string) => void
  /** Renderer -> main: the bounded native-close drain has finished. */
  'window-close-prepared': (requestId: string) => void
  /** Main -> renderer: resume stores after a prepared quit is cancelled. */
  'cancel-window-close-preparation': () => void
  'auto-updater-error': (error: Error) => void
  'auto-updater-checking-for-update': () => void
  'auto-updater-update-available': () => void
  'auto-updater-update-not-available': () => void
  'auto-updater-update-downloaded': () => void
  'native-theme-updated': () => void
  'set-native-theme-source': (themeName: ThemeSource) => void
  'update-window-background-color': (color: string) => void
  'focus-window': () => void
  'notification-event': NotificationCallback<DesktopAliveEvent>
  'set-window-zoom-factor': (zoomFactor: number) => void
  'show-installing-update': () => void
  'install-windows-cli': () => void
  'uninstall-windows-cli': () => void
  /** main -> quick-action renderer: the folder and verb it was opened for. */
  'quick-action-request': (
    request: IQuickActionRequest,
    launchedAt: number
  ) => void
  /** quick-action renderer -> main: listening, send the request. */
  'quick-action-ready': () => void
  /** quick-action renderer -> main: dismiss the window. */
  'quick-action-close': () => void
  /** quick-action renderer -> main: hand this folder to the full app. */
  'quick-action-open-in-app': (path: string) => void
  /** quick-action renderer -> main: measured launch-to-interactive time. */
  'quick-action-opened': (elapsedMs: number) => void
  /** Persisted global preference used by native-menu web links. */
  'set-browser-open-mode': (mode: BrowserOpenMode) => void
  /** Internal-browser chrome -> main: listeners are ready for initial state. */
  'internal-browser-ready': () => void
  /** Internal-browser chrome -> main: a user-issued tab/navigation command. */
  'internal-browser-command': (command: InternalBrowserCommand) => void
  /** Internal-browser chrome -> main: native remote-view viewport. */
  'internal-browser-content-bounds': (
    bounds: IInternalBrowserContentBounds
  ) => void
  /** Main -> internal-browser chrome: sanitized, serializable tab state. */
  'internal-browser-state': (state: IInternalBrowserState) => void
  /** Main -> internal-browser chrome: Chromium's in-page match tally. */
  'internal-browser-find': (tally: IInternalBrowserFindTally) => void
  /** Main -> internal-browser chrome: bounded page text for a regex search. */
  'internal-browser-page-text': (page: IInternalBrowserPageText) => void
  /** Trusted app renderer -> main: OAuth resolution and callback correlation. */
  'internal-browser-oauth-result': (
    receipt: IInternalBrowserOAuthCallbackReceipt
  ) => void
  'build-run-log': (event: IBuildRunLogEvent) => void
  'build-run-state': (event: IBuildRunStateEvent) => void
  'actions-local-run-log': (event: IActionsLocalRunLogEvent) => void
  'actions-local-run-state': (event: IActionsLocalRunStateEvent) => void
  'opencode-log': (event: IOpencodeLogEvent) => void
  'codex-log': (event: ICodexLogEvent) => void
  'cli-command-output': (event: ICLICommandOutputEvent) => void
  'cli-command-state': (event: ICLICommandStateEvent) => void
}

/**
 * Defines the duplex IPC channel names we use from the renderer
 * process along with their signatures. This type is used from both
 * the renderer and the main process to ensure a common contract between
 * the two over the untyped IPC framework.
 *
 * Return signatures must be promises
 */
export type RequestResponseChannels = {
  /** Fetch and validate a bounded scheduled-settings document in the main process. */
  'fetch-scheduled-settings': (
    endpoint: string
  ) => Promise<IScheduledSettingsValue>
  /** Read a Home Assistant boolean entity without exposing its token to the renderer. */
  'fetch-home-assistant-state': (
    request: IHomeAssistantSettingsRequest
  ) => Promise<HomeAssistantBooleanState>
  /** Store or remove a Home Assistant token in the OS credential vault. */
  'set-home-assistant-token': (
    request: ISetHomeAssistantTokenRequest
  ) => Promise<void>
  /** Lease one absolute Windows Git repository across renderer documents. */
  'acquire-profile-repository-lock': (repositoryPath: string) => Promise<string>
  /** Release a profile repository lease owned by the invoking renderer. */
  'release-profile-repository-lock': (leaseId: string) => Promise<boolean>
  /**
   * Renderer -> main: accept delivery before beginning asynchronous drains.
   * False means the delivery deadline expired and no new writes may start.
   */
  'start-window-close-preparation': (requestId: string) => Promise<boolean>
  'cleanup-cheap-lfs-payload-credentials': (
    request: ICheapLfsPayloadCredentialCleanupRequest
  ) => Promise<CheapLfsPayloadCredentialCleanupResult>
  'register-actions-artifact-provenance-credential-lease': (
    request: IActionsArtifactProvenanceCredentialRegistration
  ) => Promise<string | null>
  'verify-actions-artifact-provenance': (
    request: IActionsArtifactProvenanceVerifyRequest
  ) => Promise<ActionsArtifactProvenanceResult>
  'inspect-actions-artifact-subjects': (
    request: IActionsArtifactSubjectInspectRequest
  ) => Promise<ActionsArtifactSubjectInventoryResult>
  'prepare-actions-artifact-subject': (
    request: IActionsArtifactSubjectPrepareRequest
  ) => Promise<ActionsArtifactSubjectPrepareResult>
  'download-actions-artifact': (
    request: IActionsArtifactTransferRequest
  ) => Promise<ActionsArtifactTransferResult>
  'fetch-actions-job-log': (
    request: IActionsJobLogTransferRequest
  ) => Promise<ActionsJobLogTransferResult>
  'download-release-asset': (
    request: IGitHubReleaseAssetDownloadRequest
  ) => Promise<GitHubReleaseAssetDownloadTransferResult>
  'upload-release-asset': (
    request: IGitHubReleaseAssetUploadRequest
  ) => Promise<GitHubReleaseAssetUploadTransferResult>
  'silent-install-release-asset': (
    request: ISilentInstallRequest
  ) => Promise<ISilentInstallResult>
  'get-agent-server-status': () => Promise<IAgentServerStatus>
  'set-agent-server-enabled': (enabled: boolean) => Promise<IAgentServerStatus>
  'initialize-agent-server': (
    configuration: IAgentServerStartupConfiguration
  ) => Promise<IAgentServerStatus>
  'regenerate-agent-server-token': () => Promise<IAgentServerStatus>
  'configure-agent-server': (
    configuration: IAgentServerConfiguration
  ) => Promise<IAgentServerStatus>
  'regenerate-agent-server-pairing': () => Promise<IAgentServerStatus>
  'revoke-agent-server-device': (id: string) => Promise<IAgentServerStatus>
  'set-agent-server-gateway-url': (
    value: string | null
  ) => Promise<IAgentServerStatus>
  'set-agent-server-remote-site-url': (
    value: string
  ) => Promise<IAgentServerStatus>
  'get-self-hosted-server-status': () => Promise<ISelfHostedServerControllerStatus>
  'provision-self-hosted-server': (
    request: ISelfHostedServerProvisioningRequest
  ) => Promise<SelfHostedServerProvisioningReply>
  'cancel-self-hosted-server-provisioning': () => Promise<void>
  'get-self-hosted-runner-status': (
    request: ISelfHostedRunnerStatusRequest
  ) => Promise<ISelfHostedRunnerStatus>
  'preflight-self-hosted-runner': (
    request: ISelfHostedRunnerPreflightRequest
  ) => Promise<SelfHostedRunnerReply<ISelfHostedRunnerPreflightResult>>
  'setup-self-hosted-runner': (
    request: ISelfHostedRunnerSetupRequest
  ) => Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>>
  'cancel-self-hosted-runner-operation': (runnerId: string) => Promise<boolean>
  'start-self-hosted-runner': (request: {
    readonly id: string
    readonly owner: string
    readonly repository: string
  }) => Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>>
  'stop-self-hosted-runner': (request: {
    readonly id: string
    readonly owner: string
    readonly repository: string
  }) => Promise<SelfHostedRunnerReply<ISelfHostedRunnerSetupResult>>
  'remove-self-hosted-runner': (
    request: ISelfHostedRunnerRemoveRequest
  ) => Promise<SelfHostedRunnerReply<ISelfHostedRunnerRemoveResult>>
  'get-windows-context-menu-state': (
    labels: IWindowsContextMenuLabels
  ) => Promise<IWindowsContextMenuState>
  'set-windows-context-menu-entry': (
    request: IWindowsContextMenuApplyRequest
  ) => Promise<IWindowsContextMenuApplyResponse>
  /** Register or unregister the packaged Windows 11 top-level handler. */
  'set-modern-context-menu-installed': (request: {
    readonly installed: boolean
    readonly labels: IWindowsContextMenuLabels
  }) => Promise<IWindowsContextMenuApplyResponse>
  'get-path': (path: PathType) => Promise<string>
  'get-app-architecture': () => Promise<Architecture>
  'get-app-path': () => Promise<string>
  'get-exec-path': () => Promise<string>
  'is-running-under-arm64-translation': () => Promise<boolean>
  'move-to-trash': (path: string) => Promise<void>
  'force-delete-directory': (path: string) => Promise<void>
  'show-item-in-folder': (path: string) => Promise<void>
  'show-contextual-menu': (
    items: ReadonlyArray<ISerializableMenuItem>,
    addSpellCheckMenu: boolean
  ) => Promise<ReadonlyArray<number> | null>
  'is-window-focused': () => Promise<boolean>
  'open-external': (
    path: string,
    options: IOpenExternalOptions
  ) => Promise<boolean>
  'is-in-application-folder': () => Promise<boolean | null>
  'move-to-applications-folder': () => Promise<void>
  'check-for-updates': (url: string) => Promise<Error | undefined>
  'get-current-window-state': () => Promise<WindowState | undefined>
  'get-current-window-zoom-factor': () => Promise<number | undefined>
  'resolve-proxy': (url: string) => Promise<string>
  'show-save-dialog': (
    options: Electron.SaveDialogOptions
  ) => Promise<string | null>
  'show-open-dialog': (
    options: Electron.OpenDialogOptions
  ) => Promise<string | null>
  'show-open-dialog-multiple': (
    options: Electron.OpenDialogOptions
  ) => Promise<ReadonlyArray<string>>
  'file-converter-inspect-source': (
    path: string
  ) => Promise<IFileSignatureInspection>
  'file-converter-preflight-storage': (
    destinationPath: string,
    requiredBytes: number
  ) => Promise<IFileConverterStoragePreflight>
  'is-window-maximized': () => Promise<boolean>
  'get-apple-action-on-double-click': () => Promise<Electron.AppleActionOnDoubleClickPref>
  'should-use-dark-colors': () => Promise<boolean>
  'save-guid': (guid: string) => Promise<void>
  'get-guid': () => Promise<string>
  'show-notification': (
    title: string,
    body: string,
    userInfo?: DesktopAliveEvent
  ) => Promise<string | null>
  'get-notifications-permission': () => Promise<DesktopNotificationPermission>
  'request-notifications-permission': () => Promise<boolean>
  'start-build-run': (plan: IBuildRunPlan) => Promise<void>
  'cancel-build-run': (runId: string) => Promise<void>
  'detect-actions-local-tools': () => Promise<IActionsLocalToolAvailability>
  'install-actions-local-act': () => Promise<IActionsLocalToolAvailability>
  'list-actions-workflows': (
    repositoryPath: string
  ) => Promise<ReadonlyArray<IActionsWorkflow>>
  'start-actions-local-run': (plan: IActionsLocalRunPlan) => Promise<void>
  'cancel-actions-local-run': (runId: string) => Promise<void>
  'notification-automation-run-webhook': (
    request: INotificationAutomationRunRequest
  ) => Promise<INotificationWebhookResult>
  'notification-automation-run-command': (
    request: INotificationAutomationRunRequest
  ) => Promise<INotificationCommandResult>
  'opencode-detect': () => Promise<IOpencodeStatus>
  'opencode-install': (
    request: IOpencodeInstallRequest
  ) => Promise<IOpencodeInstallResult>
  'opencode-run-fix': (
    request: IOpencodeRunFixRequest
  ) => Promise<IOpencodeRunResult>
  'opencode-run-prompt': (
    request: IOpencodeRunPromptRequest
  ) => Promise<IOpencodeRunResult>
  'opencode-cancel': (operationId: string) => Promise<void>
  'codex-detect': () => Promise<ICodexStatus>
  'codex-install': (
    request: ICodexInstallRequest
  ) => Promise<ICodexInstallResult>
  'codex-run-fix': (request: ICodexRunFixRequest) => Promise<ICodexRunResult>
  'codex-run-prompt': (
    request: ICodexRunPromptRequest
  ) => Promise<ICodexRunResult>
  'codex-cancel': (operationId: string) => Promise<void>
  'run-agent-setup-commands': (
    request: IAgentSetupRunRequest
  ) => Promise<AgentSetupRunResult>
  'cancel-agent-setup-commands': (operationId: string) => Promise<boolean>
  'get-cli-workbench-runtime': () => Promise<ICLIWorkbenchRuntime>
  'start-cli-command': (request: ICLIWorkbenchOperationRequest) => Promise<void>
  'cancel-cli-command': (id: string) => Promise<boolean>
}
