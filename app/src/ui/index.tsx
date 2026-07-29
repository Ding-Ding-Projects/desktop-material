import '../lib/logging/renderer/install'
import { registerLogSink } from '../lib/logging/renderer/log-sink'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'
import { App } from './app'
import { CrashProofBoundary } from './crash-proof-boundary'
import {
  Dispatcher,
  externalEditorErrorHandler,
  openShellErrorHandler,
  mergeConflictHandler,
  lfsAttributeMismatchHandler,
  defaultErrorHandler,
  missingRepositoryHandler,
  backgroundTaskHandler,
  pushNeedsPullHandler,
  pullBranchDeletedHandler,
  upstreamAlreadyExistsHandler,
  rebaseConflictsHandler,
  localChangesOverwrittenHandler,
  refusedWorkflowUpdate,
  samlReauthRequired,
  insufficientGitHubRepoPermissions,
  discardChangesHandler,
  secretScanningPushProtectionErrorHandler,
  canonicalRemoteVerificationHandler,
} from './dispatcher'
import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  CopilotStore,
  IssuesStore,
  SignInStore,
  RepositoriesStore,
  TokenStore,
  AccountsStore,
  PullRequestStore,
  ProfileStore,
  RepositoryTabsStore,
  BuildRunStore,
  NotificationCentreStore,
  NotificationAutomationStore,
  LogStore,
  ActionsStore,
  GitHubReleasesStore,
  GitHubIssuesStore,
  NamedAPIFunctionsStore,
} from '../lib/stores'
import { GitHubUserDatabase } from '../lib/databases'
import { composeBuildRunNotification } from '../lib/build-run/build-run-notification'
import { getPersistedLanguageMode } from '../lib/i18n'
import { SelectionType, IAppState } from '../lib/app-state'
import { StatsDatabase, StatsStore } from '../lib/stats'
import {
  IssuesDatabase,
  RepositoriesDatabase,
  PullRequestDatabase,
} from '../lib/databases'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { installDevGlobals } from './install-globals'
import {
  reportUncaughtException,
  sendErrorReport,
  setBrowserOpenMode,
  setWindowRepositoryState,
} from './main-process-proxy'
import { getOS } from '../lib/get-os'
import {
  enableSourceMaps,
  withSourceMappedStack,
} from '../lib/source-map-support'
import { UiActivityMonitor } from './lib/ui-activity-monitor'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { isSubmoduleRepository } from '../models/repository'
import { ApiRepositoriesStore } from '../lib/stores/api-repositories-store'
import { CommitStatusStore } from '../lib/stores/commit-status-store'
import { PullRequestCoordinator } from '../lib/stores/pull-request-coordinator'
import { ElementAppearanceCoordinator } from '../lib/stores/element-appearance-coordinator'

import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import { classifyPeerClosedStreamError } from '../lib/peer-closed-stream-error'
import { enableUnhandledRejectionReporting } from '../lib/feature-flag'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
} from './lib/application-theme'
import { trampolineUIHelper } from '../lib/trampoline/trampoline-ui-helper'
import { AliveStore } from '../lib/stores/alive-store'
import { NotificationsStore } from '../lib/stores/notifications-store'
import * as ipcRenderer from '../lib/ipc-renderer'
import { migrateRendererGUID } from '../lib/get-renderer-guid'
import { initializeRendererNotificationHandler } from '../lib/notifications/notification-handler'
import { Grid } from 'react-virtualized'
import { NotificationsDebugStore } from '../lib/stores/notifications-debug-store'
import { trampolineServer } from '../lib/trampoline/trampoline-server'
import { TrampolineCommandIdentifier } from '../lib/trampoline/trampoline-command'
import { createAskpassTrampolineHandler } from '../lib/trampoline/trampoline-askpass-handler'
import { createCredentialHelperTrampolineHandler } from '../lib/trampoline/trampoline-credential-helper'
import { installAgentCommandExecutor } from '../lib/agent-command-executor'
import { setNumber } from '../lib/local-storage'
import { AgentServerLANPortStorageKey } from '../lib/agent-commands'
import { restoreAgentServerStartupConfiguration } from '../lib/agent-server-startup'
import { getCurrentWindowScope } from '../lib/window-scope'
import {
  configureRendererShutdown,
  runAfterRendererShutdown,
} from './lib/renderer-shutdown'
import {
  BrowserPreferencesChangedEvent,
  getBrowserOpenModePreference,
} from '../lib/internal-browser'

if (__DEV__) {
  installDevGlobals()
}

migrateRendererGUID()

if (shellNeedsPatching(process)) {
  updateEnvironmentForProcess()
}

enableSourceMaps()

// Tell dugite where to find the git environment,
// see https://github.com/desktop/dugite/pull/85
process.env['LOCAL_GIT_DIRECTORY'] = Path.resolve(__dirname, 'git')

// Ensure that dugite infers the GIT_EXEC_PATH
// based on the LOCAL_GIT_DIRECTORY env variable
// instead of just blindly trusting what's set in
// the current environment. See https://git.io/JJ7KF
delete process.env.GIT_EXEC_PATH

const startTime = performance.now()

// Keep native-menu links aligned with the persisted renderer preference before
// the user invokes any browser-bound action.
setBrowserOpenMode(getBrowserOpenModePreference())
document.addEventListener(BrowserPreferencesChangedEvent, () =>
  setBrowserOpenMode(getBrowserOpenModePreference())
)

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
   * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

// TODO (electron): Remove this once
// https://bugs.chromium.org/p/chromium/issues/detail?id=1113293
// gets fixed and propagated to electron.
if (__DARWIN__) {
  require('../lib/fix-emoji-spacing')
}

let currentState: IAppState | null = null

const sendErrorWithContext = (
  e: unknown,
  context: Record<string, string> = {},
  nonFatal?: boolean
) => {
  const error = withSourceMappedStack(e)

  console.error('Uncaught exception', error)

  if (__DEV__ || process.env.TEST_ENV) {
    console.error(
      `An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`
    )
  } else {
    const extra: Record<string, string> = {
      osVersion: getOS(),
      ...context,
    }

    try {
      if (currentState) {
        if (currentState.currentBanner !== null) {
          extra.currentBanner = currentState.currentBanner.type
        }

        if (currentState.currentPopup !== null) {
          extra.currentPopup = `${currentState.currentPopup.type}`
        }

        if (currentState.selectedState !== null) {
          extra.selectedState = `${currentState.selectedState.type}`

          if (currentState.selectedState.type === SelectionType.Repository) {
            extra.selectedRepositorySection = `${currentState.selectedState.state.selectedSection}`
          }
        }

        if (currentState.currentFoldout !== null) {
          extra.currentFoldout = `${currentState.currentFoldout.type}`
        }

        if (currentState.showWelcomeFlow) {
          extra.inWelcomeFlow = 'true'
        }

        if (currentState.windowZoomFactor !== 1) {
          extra.windowZoomFactor = `${currentState.windowZoomFactor}`
        }

        if (currentState.errorCount > 0) {
          extra.activeAppErrors = `${currentState.errorCount}`
        }

        extra.repositoryCount = `${currentState.repositories.length}`
        extra.windowState = currentState.windowState ?? 'Unknown'
        extra.accounts = `${currentState.accounts.length}`

        extra.automaticallySwitchTheme = `${
          currentState.selectedTheme === ApplicationTheme.System &&
          supportsSystemThemeChanges()
        }`
      }
    } catch (err) {
      /* ignore */
    }

    sendErrorReport(error, extra, nonFatal ?? false)
  }
}

const resizeLoopCompletedMessage =
  'ResizeObserver loop completed with undelivered notifications.'

let rendererUnhandledRejectionSink: ((error: Error) => void) | null = null
let pendingRendererUnhandledRejectionNotice = false

/**
 * Show a contained background failure as a non-blocking in-app notice.
 *
 * The message is always a fixed string chosen by the caller, never text taken
 * from the error, so an arbitrary failure can never copy a credential into the
 * UI. A notice raised before the dispatcher exists is replayed once it does.
 */
function showContainedBackgroundFailureNotice(message: string) {
  if (rendererUnhandledRejectionSink === null) {
    pendingRendererUnhandledRejectionNotice = true
    return
  }
  try {
    rendererUnhandledRejectionSink(new Error(message))
  } catch {
    pendingRendererUnhandledRejectionNotice = true
  }
}

const onUncaughtException = (error: unknown) => {
  // This is a known issue with the ResizeObserver API in Chromium 132 which is
  // fixed in 133 that we can safely ignore.
  // See: https://issues.chromium.org/issues/391393420
  if (
    error === resizeLoopCompletedMessage ||
    (error &&
      typeof error === 'object' &&
      'message' in error &&
      error.message === resizeLoopCompletedMessage)
  ) {
    sendNonFatalException(
      'resizeObserverLoopCompleted',
      withSourceMappedStack(error)
    )
    return
  }

  // A write that finished after its peer closed — a trampoline client Git
  // killed, a socket torn down mid-reply. The operation fails through its own
  // error path; destroying the window over it would lose the user's work for
  // no reason. Deliberately narrow: anything this does not positively
  // recognize still crashes, exactly as before.
  const peerClosedCode = classifyPeerClosedStreamError(error)
  if (peerClosedCode !== null) {
    const containedError = withSourceMappedStack(error)
    try {
      log.error(
        `Contained a write to a closed peer (${peerClosedCode})`,
        containedError
      )
    } catch {
      // Containment must not depend on logging succeeding.
    }
    sendNonFatalException('peerClosedStreamWrite', containedError)
    showContainedBackgroundFailureNotice(
      'A background transfer stopped because the connection closed. Desktop Material contained the error so you can keep working.'
    )
    return
  }

  sendErrorWithContext(error)
  reportUncaughtException(withSourceMappedStack(error))

  // We used to subscribe to uncaughtException using process.once but we want
  // to be able to ignore the resize observer error above so we need to
  // unsubscribe manually once we encounter an error we actually want to crash
  // the app for.
  process.off('uncaughtException', onUncaughtException)
}

process.on('uncaughtException', onUncaughtException)

// See sendNonFatalException for more information
process.on(
  'send-non-fatal-exception',
  (error: Error, context?: { [key: string]: string }) => {
    sendErrorWithContext(error, context, true)
  }
)

/**
 * Keep an unexpected background rejection from disappearing into DevTools.
 * Reporting retains the original Error, while the in-app notice is deliberately
 * generic so an arbitrary rejection cannot copy a credential into the UI.
 */
window.addEventListener('unhandledrejection', ev => {
  const reportableError =
    ev.reason instanceof Error
      ? ev.reason
      : new Error('The renderer rejected a promise without an Error.')
  try {
    log.error('Unhandled renderer promise rejection', reportableError)
  } catch {
    // Containment and the user-visible notice still run without diagnostics.
  }
  try {
    if (enableUnhandledRejectionReporting()) {
      sendNonFatalException('unhandledRejection', reportableError)
    }
  } catch {
    // Error reporting cannot become a second unhandled rejection.
  }

  showContainedBackgroundFailureNotice(
    'A background action stopped unexpectedly. Desktop Material contained the error so you can keep working.'
  )
  ev.preventDefault()
})

const gitHubUserStore = new GitHubUserStore(
  new GitHubUserDatabase('GitHubUserDatabase')
)
const issuesStore = new IssuesStore(new IssuesDatabase('IssuesDatabase'))
const statsStore = new StatsStore(
  new StatsDatabase('StatsDatabase'),
  new UiActivityMonitor()
)

const accountsStore = new AccountsStore(localStorage, TokenStore)
const cloningRepositoriesStore = new CloningRepositoriesStore(() =>
  accountsStore.getAll()
)

const profileStore = new ProfileStore(accountsStore)
const elementAppearanceCoordinator = new ElementAppearanceCoordinator(
  profileStore
)
const namedAPIFunctionsStore = new NamedAPIFunctionsStore(localStorage)
const repositoryTabsStore = new RepositoryTabsStore(
  profileStore,
  getCurrentWindowScope(),
  Date.now,
  elementAppearanceCoordinator
)

const signInStore = new SignInStore()

trampolineServer.registerCommandHandler(
  TrampolineCommandIdentifier.AskPass,
  createAskpassTrampolineHandler(accountsStore)
)

trampolineServer.registerCommandHandler(
  TrampolineCommandIdentifier.CredentialHelper,
  createCredentialHelperTrampolineHandler(accountsStore)
)

const repositoriesStore = new RepositoriesStore(
  new RepositoriesDatabase('Database')
)

const pullRequestStore = new PullRequestStore(
  new PullRequestDatabase('PullRequestDatabase'),
  repositoriesStore
)

const pullRequestCoordinator = new PullRequestCoordinator(
  pullRequestStore,
  repositoriesStore
)

const repositoryStateManager = new RepositoryStateCache(statsStore)

const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

const commitStatusStore = new CommitStatusStore(accountsStore)
const aheadBehindStore = new AheadBehindStore()

const aliveStore = new AliveStore(accountsStore)

const copilotStore = new CopilotStore(accountsStore)

const notificationsStore = new NotificationsStore(
  accountsStore,
  aliveStore,
  pullRequestCoordinator,
  statsStore
)

const notificationsDebugStore = new NotificationsDebugStore(
  accountsStore,
  notificationsStore,
  pullRequestCoordinator
)

const notificationCentreStore = new NotificationCentreStore()
const notificationAutomationStore = new NotificationAutomationStore()

const logStore = new LogStore()
registerLogSink((level, message) => {
  void logStore.append(level, message).catch(() => undefined)
})

const appStore = new AppStore(
  gitHubUserStore,
  cloningRepositoriesStore,
  issuesStore,
  statsStore,
  signInStore,
  accountsStore,
  repositoriesStore,
  pullRequestCoordinator,
  repositoryStateManager,
  apiRepositoriesStore,
  notificationsStore,
  copilotStore,
  notificationCentreStore,
  notificationAutomationStore,
  logStore,
  elementAppearanceCoordinator
)

let lastEnsuredRepositoryId: number | null = null
let lastEnsuredAppearanceProfileKey: string | null = null
let repositoryTabsInitialized = false
let selectedRepositoryPath: string | null = null
const reportWindowRepositoryState = () => {
  setWindowRepositoryState(
    selectedRepositoryPath,
    repositoryTabsStore.getState().tabs.map(tab => tab.repositoryPath)
  )
}

const ensureSelectedRepositoryTab = (state: IAppState) => {
  const elementAppearanceState = elementAppearanceCoordinator.getState()
  if (!repositoryTabsInitialized || !elementAppearanceState.initialized) {
    lastEnsuredRepositoryId = null
    lastEnsuredAppearanceProfileKey = null
    return
  }
  if (
    lastEnsuredAppearanceProfileKey !== elementAppearanceState.activeProfileKey
  ) {
    lastEnsuredRepositoryId = null
    lastEnsuredAppearanceProfileKey = elementAppearanceState.activeProfileKey
  }

  const selected = state.selectedState
  if (selected !== null && selected.type === SelectionType.Repository) {
    const repository = selected.repository
    if (
      !isSubmoduleRepository(repository) &&
      repository.id !== lastEnsuredRepositoryId
    ) {
      lastEnsuredRepositoryId = repository.id
      repositoryTabsStore.ensureTabForRepository(repository).catch(err => {
        if (
          lastEnsuredRepositoryId === repository.id &&
          lastEnsuredAppearanceProfileKey ===
            elementAppearanceState.activeProfileKey
        ) {
          lastEnsuredRepositoryId = null
        }
        log.error('Failed to ensure repository tab', err)
      })
    }
  } else {
    lastEnsuredRepositoryId = null
  }
}

repositoryTabsStore.onDidUpdate(reportWindowRepositoryState)
appStore.onDidUpdate(state => {
  currentState = state
  profileStore.onAppStateChanged()

  const selected = state.selectedState
  selectedRepositoryPath = selected?.repository.path ?? null
  reportWindowRepositoryState()
  ensureSelectedRepositoryTab(state)
})

const profileStoreInitialization = profileStore.initialize()
const elementAppearanceCoordinatorInitialization =
  profileStoreInitialization.then(() =>
    elementAppearanceCoordinator.initialize()
  )
elementAppearanceCoordinatorInitialization
  .then(async () => {
    try {
      namedAPIFunctionsStore.migrate()
      profileStore.onAppStateChanged()
    } catch (error) {
      log.error('Failed to migrate named API functions', error)
    }
    await repositoryTabsStore.initialize()
    repositoryTabsInitialized = true
    if (currentState !== null) {
      ensureSelectedRepositoryTab(currentState)
    }
  })
  .catch(err => log.error('Failed to initialize profile stores', err))

const notificationCentreStoreInitialization =
  notificationCentreStore.initialize()
void notificationCentreStoreInitialization.catch(err =>
  log.error('Failed to initialize notification centre', err)
)

const logStoreInitialization = logStore.initialize()
void logStoreInitialization.catch(err =>
  log.error('Failed to initialize log store', err)
)

configureRendererShutdown([
  {
    name: 'profile settings',
    run: async () => {
      await profileStoreInitialization
      await profileStore.flush()
    },
  },
  {
    name: 'element appearance settings',
    run: async () => {
      await elementAppearanceCoordinatorInitialization
      await elementAppearanceCoordinator.flush()
    },
  },
  {
    name: 'notification centre',
    run: async () => {
      await notificationCentreStoreInitialization
      await notificationCentreStore.flush()
    },
  },
  {
    name: 'log history',
    run: async () => {
      await logStoreInitialization
      await logStore.flush()
    },
  },
  {
    name: 'clone recovery journal',
    run: () => appStore.flushForShutdown(),
  },
])

ipcRenderer.on('prepare-window-close', (_event, requestId) => {
  void ipcRenderer
    .invoke('start-window-close-preparation', requestId)
    .then(accepted => {
      if (!accepted) {
        return
      }
      return runAfterRendererShutdown(() =>
        ipcRenderer.send('window-close-prepared', requestId)
      )
    })
    .catch(error =>
      log.error('Unable to prepare renderer state for window close', error)
    )
})

ipcRenderer.on('cancel-window-close-preparation', () => {
  void appStore
    .resumeAfterCancelledShutdown()
    .catch(error =>
      log.error('Unable to resume renderer after cancelled quit', error)
    )
})

const buildRunStore = new BuildRunStore(({ repositoryId, phase, exitCode }) => {
  // Surface a finished build's outcome in the reviewable notification centre so
  // it is not lost when the Build & Run panel is closed or minimized.
  const repository = appStore
    .getState()
    .repositories.find(r => r.id === repositoryId)
  const input = composeBuildRunNotification(
    repositoryId,
    repository?.name ?? '',
    phase,
    exitCode,
    getPersistedLanguageMode()
  )
  if (input !== null) {
    appStore.postNotification(input)
  }
})
const actionsStore = new ActionsStore(accountsStore)
const releasesStore = new GitHubReleasesStore(accountsStore)
const issueWorkflowsStore = new GitHubIssuesStore(accountsStore)

const dispatcher = new Dispatcher(
  appStore,
  repositoryStateManager,
  statsStore,
  commitStatusStore,
  profileStore,
  repositoryTabsStore,
  buildRunStore,
  namedAPIFunctionsStore,
  elementAppearanceCoordinator
)

installAgentCommandExecutor(
  dispatcher,
  () => appStore.getState(),
  repositoryTabsStore
)
void ipcRenderer
  .invoke(
    'initialize-agent-server',
    restoreAgentServerStartupConfiguration(localStorage)
  )
  .then(status => {
    if (status.mode !== 'local' && status.port !== null) {
      setNumber(AgentServerLANPortStorageKey, status.port)
    }
  })
  .catch(error =>
    log.error(
      'Unable to restore the agent server configuration',
      error instanceof Error ? error : new Error(String(error))
    )
  )

dispatcher.registerErrorHandler(defaultErrorHandler)
dispatcher.registerErrorHandler(upstreamAlreadyExistsHandler)
dispatcher.registerErrorHandler(externalEditorErrorHandler)
dispatcher.registerErrorHandler(openShellErrorHandler)
dispatcher.registerErrorHandler(mergeConflictHandler)
dispatcher.registerErrorHandler(lfsAttributeMismatchHandler)
dispatcher.registerErrorHandler(insufficientGitHubRepoPermissions)
dispatcher.registerErrorHandler(pushNeedsPullHandler)
dispatcher.registerErrorHandler(pullBranchDeletedHandler)
dispatcher.registerErrorHandler(samlReauthRequired)
dispatcher.registerErrorHandler(backgroundTaskHandler)
dispatcher.registerErrorHandler(missingRepositoryHandler)
dispatcher.registerErrorHandler(localChangesOverwrittenHandler)
dispatcher.registerErrorHandler(rebaseConflictsHandler)
dispatcher.registerErrorHandler(refusedWorkflowUpdate)
dispatcher.registerErrorHandler(discardChangesHandler)
dispatcher.registerErrorHandler(secretScanningPushProtectionErrorHandler)
dispatcher.registerErrorHandler(canonicalRemoteVerificationHandler)

rendererUnhandledRejectionSink = error => {
  try {
    void dispatcher.postError(error).catch(postErrorFailure => {
      try {
        log.error('Failed to show contained background error', postErrorFailure)
      } catch {
        // A notification/reporting failure is terminal for this one notice.
      }
    })
  } catch {
    // Dispatcher setup can fail synchronously during startup containment.
  }
}
if (pendingRendererUnhandledRejectionNotice) {
  pendingRendererUnhandledRejectionNotice = false
  rendererUnhandledRejectionSink(
    new Error(
      'A background action stopped during startup. Desktop Material contained the error so you can keep working.'
    )
  )
}

// The main process contained a background failure (an upload whose connection
// closed, for example). It sends no detail on purpose; the diagnostics stay in
// the log while the user gets a notice instead of a crash dialog.
ipcRenderer.on('contained-background-failure', () =>
  showContainedBackgroundFailureNotice(
    'A background action stopped because the connection closed. Desktop Material contained the error so you can keep working.'
  )
)

document.body.classList.add(`platform-${process.platform}`)

dispatcher.initializeAppFocusState()

initializeRendererNotificationHandler(notificationsStore)

// The trampoline UI helper needs a reference to the dispatcher before it's used
trampolineUIHelper.setDispatcher(dispatcher)

ipcRenderer.on('focus', () => {
  const { selectedState } = appStore.getState()

  // Refresh the currently selected repository on focus (if
  // we have a selected repository, that is not cloning).
  if (
    selectedState &&
    !(selectedState.type === SelectionType.CloningRepository)
  ) {
    dispatcher.refreshRepository(selectedState.repository)
  }

  dispatcher.setAppFocusState(true)
})

ipcRenderer.on('blur', () => {
  // Make sure we stop highlighting the menu button (on non-macOS)
  // when someone uses Alt+Tab to switch application since we won't
  // get the onKeyUp event for the Alt key in that case.
  dispatcher.setAccessKeyHighlightState(false)
  dispatcher.setAppFocusState(false)
})

ipcRenderer.on('url-action', (_, action, callbackId) => {
  dispatcher
    .dispatchURLAction(action)
    .then(result => {
      if (action.name === 'oauth') {
        if (typeof callbackId !== 'string') {
          log.error('OAuth URL action arrived without a callback correlation')
          return
        }
        ipcRenderer.send('internal-browser-oauth-result', {
          callbackId,
          result: result ?? 'failed',
        })
      }
    })
    .catch(e => {
      log.error(`URL action ${action.name} failed`, e)
      if (action.name === 'oauth') {
        if (typeof callbackId !== 'string') {
          log.error('Failed OAuth URL action had no callback correlation')
          return
        }
        ipcRenderer.send('internal-browser-oauth-result', {
          callbackId,
          result: 'failed',
        })
      }
    })
})

ipcRenderer.on('cli-action', (_, action) =>
  dispatcher
    .dispatchCLIAction(action)
    .catch(e => log.error(`CLI action ${action.kind} failed`, e))
)

// react-virtualized will use the literal string "grid" as the 'aria-label'
// attribute unless we override it. This is a problem because aria-label should
// not be set unless there's a compelling reason for it[1].
//
// Similarly the default props call for the 'aria-readonly' attribute to be set
// to true which according to MDN doesn't fit our use case[2]:
//
// > This indicates to the user that an interactive element that would normally
// > be focusable and copyable has been placed in a read-only (not disabled)
// > state.
//
// 1. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label
// 2. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-readonly
;(function (
  defaults: Record<string, unknown> | undefined,
  types: Record<string, unknown> | undefined
) {
  ;['aria-label', 'aria-readonly'].forEach(k => {
    delete defaults?.[k]
    delete types?.[k]
  })
})(Grid.defaultProps, Grid.propTypes)

ReactDOM.render(
  <CrashProofBoundary name="Desktop Material" root={true}>
    <App
      dispatcher={dispatcher}
      appStore={appStore}
      repositoryStateManager={repositoryStateManager}
      issuesStore={issuesStore}
      gitHubUserStore={gitHubUserStore}
      aheadBehindStore={aheadBehindStore}
      notificationsDebugStore={notificationsDebugStore}
      repositoryTabsStore={repositoryTabsStore}
      buildRunStore={buildRunStore}
      actionsStore={actionsStore}
      releasesStore={releasesStore}
      issueWorkflowsStore={issueWorkflowsStore}
      startTime={startTime}
    />
  </CrashProofBoundary>,
  document.getElementById('desktop-app-container')!
)
