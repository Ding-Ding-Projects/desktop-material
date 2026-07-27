import '../lib/logging/main/install'

import {
  app,
  Menu,
  BrowserWindow,
  shell,
  session,
  systemPreferences,
  nativeTheme,
  WebContents,
} from 'electron'
import * as Fs from 'fs'
import * as Path from 'path'

import { AppWindow } from './app-window'
import { buildDefaultMenu, getAllMenuItems } from './menu'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { parseAppURL } from '../lib/parse-app-url'
import {
  handleSquirrelEvent,
  installWindowsCLI,
  uninstallWindowsCLI,
} from './squirrel-updater'
import { fatalError } from '../lib/fatal-error'

import { log as writeLog, setLogLevel } from './log'
import { UNSAFE_openDirectory } from './shell'
import { safeForceDeleteDirectory } from './force-delete-directory'
import { reportError } from './exception-reporting'
import {
  enableSourceMaps,
  withSourceMappedStack,
} from '../lib/source-map-support'
import { now } from './now'
import { classifyPeerClosedStreamError } from '../lib/peer-closed-stream-error'
import { showUncaughtException } from './show-uncaught-exception'
import { buildContextMenu } from './menu/build-context-menu'
import { OrderedWebRequest } from './ordered-webrequest'
import { installAuthenticatedImageFilter } from './authenticated-image-filter'
import { installAliveOriginFilter } from './alive-origin-filter'
import { installSameOriginFilter } from './same-origin-filter'
import * as ipcMain from './ipc-main'
import {
  getArchitecture,
  isAppRunningUnderARM64Translation,
} from '../lib/get-architecture'
import { buildSpellCheckMenu } from './menu/build-spell-check-menu'
import { getMainGUID, saveGUIDFile } from '../lib/get-main-guid'
import {
  getNotificationsPermission,
  requestNotificationsPermission,
  showNotification,
} from 'desktop-notifications'
import {
  associateNotificationWithWindow,
  initializeDesktopNotifications,
  terminateDesktopNotifications,
} from './notifications'
import parseCommandLineArgs from 'minimist'
import { CLIAction } from '../lib/cli-action'
import {
  getWindowsContextMenuState,
  setModernContextMenuInstalled,
  setWindowsContextMenuEntryInstalled,
} from './windows-context-menu-installer'
import { repairStaleShellExtensionRegistration } from './shell-extension-installer'
import { QuickActionWindow } from './quick-action-window'
import { IQuickActionRequest, decideQuickAction } from '../lib/quick-action'
import {
  buildRunner,
  codexRunner,
  opencodeRunner,
  registerBuildRunIpc,
} from './build-run'
import {
  cliWorkbenchCatalog,
  cliWorkbenchRunner,
  registerCLIWorkbenchIpc,
} from './cli-workbench'
import {
  actionsLocalRunner,
  registerActionsLocalRunIpc,
} from './actions-local-run'
import { AgentServerController } from './agent-server'
import {
  cancelActionsTransfer,
  handleActionsArtifactTransfer,
  handleActionsJobLogTransfer,
} from './actions-transfer'
import {
  cancelAllGitHubReleaseTransfers,
  updateGitHubReleaseTransferAccounts,
} from './github-release-transfer'
import { registerGitHubReleaseTransferIPC } from './github-release-transfer-ipc'
import { registerNotificationAutomationIpc } from './notification-automation-runner'
import {
  releaseAllCompletedActionsArtifactDownloads,
  releaseCompletedActionsArtifactDownload,
} from './actions-artifact-download-registry'
import {
  cancelAllActionsArtifactSubjectOperations,
  cancelActionsArtifactSubjectOperation,
  inspectActionsArtifactSubjects,
  prepareActionsArtifactSubject,
} from './actions-artifact-subjects'
import {
  cancelActionsArtifactProvenance,
  killAllActionsArtifactProvenanceVerifications,
  verifyActionsArtifactProvenance,
} from './actions-artifact-provenance'
import {
  invalidateActionsArtifactProvenanceCredentialLeaseGeneration,
  registerActionsArtifactProvenanceCredentialLease,
  releaseActionsArtifactProvenanceCredentialLease,
  releaseAllActionsArtifactProvenanceCredentialLeases,
} from './actions-artifact-provenance-credential-lease'
import {
  IOwnedShutdownTask,
  OwnedProcessShutdownBarrier,
  OwnedShutdownEvent,
} from './owned-process-shutdown'
import {
  findWindowForRepositoryPath as findOwningWindow,
  nextWindowScope,
} from './window-routing'
import {
  createChildProcessFailureError,
  createRendererFailureError,
  normalizeUnhandledRejection,
} from './renderer-failure'

app.setAppLogsPath()
enableSourceMaps()

const windows = new Map<number, AppWindow>()
let agentServerController: AgentServerController | null = null

const launchTime = now()

let preventQuit = false
let readyTime: number | null = null
let handlingFatalError = false

type OnDidLoadFn = (window: AppWindow) => void
/** See the `onDidLoad` function. */
const pendingOnDidLoadFns = new Array<OnDidLoadFn>()

/**
 * Contain the one exception family that must not take the app down with it.
 *
 * A write that completes after its peer already closed — a `gh` upload whose
 * child exited, a trampoline client Git killed, a browser that navigated away
 * from the agent server — is reported by Node as an `'error'` event as well as
 * through its own callback. Every one of those streams now keeps a listener
 * attached, but a stream added later (or one inside a dependency) could still
 * let one through, and losing an in-progress upload is not a reason to destroy
 * every window and show the unrecoverable-error dialog.
 *
 * This is deliberately not a general safety net: only errors carrying the exact
 * shape of a peer-closed stream write are contained. Everything else — every
 * error this classifier has no positive evidence about — stays fatal.
 *
 * @param error     The reportable error, already source-mapped.
 * @param failureKind Grouping key for the non-fatal report.
 * @param evidence  The original throwable, when one is available.
 *                  `withSourceMappedStack` rebuilds an error as a plain
 *                  `{ name, message, stack }`, dropping `code`/`errno`/
 *                  `syscall`, so classify the original first and fall back to
 *                  the message-only form.
 *
 * @returns `true` when the exception was contained and must not reach the
 *          crash dialog.
 */
function containPeerClosedStreamException(
  error: Error,
  failureKind: string,
  evidence: unknown = error
): boolean {
  const code =
    classifyPeerClosedStreamError(evidence) ??
    classifyPeerClosedStreamError(error)
  if (code === null) {
    return false
  }

  try {
    log.error(
      `Contained a write to a closed peer (${code}); the owning operation fails on its own.`,
      error
    )
  } catch {
    // Containment must not depend on logging succeeding.
  }

  reportErrorSafely(
    error,
    { ...getExtraErrorContext(), failureKind, peerClosedStreamCode: code },
    true
  )

  // Surface it where the user can see it without blocking them, and only in a
  // window that already exists — containment must never create UI.
  for (const window of windows.values()) {
    try {
      window.sendContainedBackgroundFailure()
    } catch {
      // A window tearing down mid-notice is not itself a failure.
    }
  }

  return true
}

function handleUncaughtException(error: Error) {
  if (handlingFatalError) {
    return
  }
  handlingFatalError = true
  preventQuit = true

  // If we haven't got a window we'll assume it's because
  // we've just launched and haven't created it yet.
  // It could also be because we're encountering an unhandled
  // exception on shutdown but that's less likely and since
  // this only affects the presentation of the crash dialog
  // it's a safe assumption to make.
  const isLaunchError = windows.size === 0

  for (const window of windows.values()) {
    try {
      window.destroy()
    } catch (destroyError) {
      try {
        log.error(
          'Unable to destroy a failed application window',
          destroyError instanceof Error
            ? destroyError
            : new Error(String(destroyError))
        )
      } catch {
        // Continue tearing down remaining windows even if logging is broken.
      }
    }
  }
  windows.clear()

  showUncaughtException(isLaunchError, error)
}

/**
 * Calculates the number of seconds the app has been running
 */
function getUptimeInSeconds() {
  return (now() - launchTime) / 1000
}

function getExtraErrorContext(): Record<string, string> {
  return {
    uptime: getUptimeInSeconds().toFixed(3),
    time: new Date().toString(),
  }
}

function reportErrorSafely(
  error: Error,
  extra?: Record<string, string>,
  nonFatal?: boolean
): void {
  void reportError(error, extra, nonFatal).catch(reportingError => {
    try {
      log.error(
        'Unable to submit an exception report',
        reportingError instanceof Error
          ? reportingError
          : new Error(String(reportingError))
      )
    } catch {
      // Reporting and logging are diagnostics; neither may trigger recovery.
    }
  })
}

/** Extra argument for the protocol launcher on Windows */
const protocolLauncherArg = '--protocol-launcher'

const possibleProtocols = new Set(['x-github-client'])
if (__DEV_SECRETS__) {
  possibleProtocols.add('x-github-desktop-dev-auth')
} else {
  possibleProtocols.add('x-github-desktop-auth')
}
// Also support Desktop Classic's protocols.
if (__DARWIN__) {
  possibleProtocols.add('github-mac')
} else if (__WIN32__) {
  possibleProtocols.add('github-windows')
}

// On Windows, in order to get notifications properly working for dev builds,
// we'll want to set the right App User Model ID from production builds.
if (__WIN32__ && __DEV__) {
  app.setAppUserModelId('com.squirrel.GitHubDesktop.GitHubDesktop')
}

app.on('window-all-closed', () => {
  // If we don't subscribe to this event and all windows are closed, the default
  // behavior is to quit the app. We don't want that though, we control that
  // behavior through the mainWindow onClose event such that on macOS we only
  // hide the main window when a user attempts to close it.
  //
  // If we don't subscribe to this and change the default behavior we break
  // the crash process window which is shown after the main window is closed.
})

app.on('child-process-gone', (_event, details) => {
  if (details.reason === 'clean-exit') {
    return
  }
  const error = createChildProcessFailureError(details)
  log.error('Electron child process exited unexpectedly', error)
  reportErrorSafely(error, {
    ...getExtraErrorContext(),
    failureKind: 'electron-child-process-gone',
    processType: details.type,
  })
})

const ownedShutdownTasks: ReadonlyArray<IOwnedShutdownTask> = [
  {
    name: 'GitHub release transfers',
    run: cancelAllGitHubReleaseTransfers,
  },
  {
    name: 'Actions provenance verification',
    run: killAllActionsArtifactProvenanceVerifications,
  },
  { name: 'Build & Run processes', run: () => buildRunner.killAll() },
  { name: 'Local Actions runs', run: () => actionsLocalRunner.killAll() },
  { name: 'opencode processes', run: () => opencodeRunner.killAll() },
  { name: 'Codex processes', run: () => codexRunner.killAll() },
  { name: 'CLI catalog probes', run: () => cliWorkbenchCatalog.killAll() },
  {
    name: 'CLI workbench processes',
    run: () => cliWorkbenchRunner.killAll(),
  },
  {
    name: 'Actions artifact subject operations',
    run: cancelAllActionsArtifactSubjectOperations,
  },
  {
    name: 'Actions provenance credential leases',
    run: releaseAllActionsArtifactProvenanceCredentialLeases,
  },
  {
    name: 'completed Actions artifact downloads',
    run: releaseAllCompletedActionsArtifactDownloads,
  },
  { name: 'agent server', run: () => agentServerController?.stop() },
  { name: 'desktop notifications', run: terminateDesktopNotifications },
]

function reportOwnedShutdown(event: OwnedShutdownEvent): void {
  const duration = `${event.durationMilliseconds}ms`
  switch (event.kind) {
    case 'started':
      log.info(`[shutdown] Stopping ${event.name}`)
      return
    case 'completed':
      log.info(`[shutdown] Stopped ${event.name} in ${duration}`)
      return
    case 'failed':
      log.error(
        `[shutdown] Failed to stop ${event.name} in ${duration}`,
        event.error
      )
      return
    case 'timed-out':
      log.error(
        `[shutdown] Timed out stopping ${event.name} after ${duration}; continuing quit`,
        event.error
      )
      return
  }
}

const ownedProcessShutdown = new OwnedProcessShutdownBarrier(
  ownedShutdownTasks,
  () => app.quit(),
  undefined,
  reportOwnedShutdown
)
// Wait until Electron has accepted every window close. A before-quit barrier
// would permanently disable owned services when update UX cancels that close.
app.on('will-quit', event => {
  ownedProcessShutdown.handle(event)
})

process.on('uncaughtException', (thrown: Error) => {
  const error = withSourceMappedStack(thrown)
  if (
    containPeerClosedStreamException(
      error,
      'main-process-peer-closed-write',
      thrown
    )
  ) {
    return
  }
  reportErrorSafely(error, getExtraErrorContext())
  handleUncaughtException(error)
})

process.on('unhandledRejection', reason => {
  const error = withSourceMappedStack(normalizeUnhandledRejection(reason))
  if (
    containPeerClosedStreamException(
      error,
      'main-process-peer-closed-write-rejection',
      reason
    )
  ) {
    return
  }
  reportErrorSafely(error, {
    ...getExtraErrorContext(),
    failureKind: 'main-process-unhandled-rejection',
  })
  handleUncaughtException(error)
})

let handlingSquirrelEvent = false
if (__WIN32__ && process.argv.length > 1) {
  const arg = process.argv[1]
  const promise = handleSquirrelEvent(arg)

  if (promise) {
    handlingSquirrelEvent = true
    promise
      .catch(e => log.error(`Failed handling Squirrel event: ${arg}`, e))
      .then(() => app.quit())
  }
}

if (!handlingSquirrelEvent) {
  handleCommandLineArguments(process.argv)
}

initializeDesktopNotifications()

function getAppWindows(): ReadonlyArray<AppWindow> {
  return [...windows.values()]
}

function getAppWindowFromBrowserWindow(
  browserWindow: BrowserWindow | null | undefined
): AppWindow | null {
  return browserWindow ? windows.get(browserWindow.id) ?? null : null
}

function getAppWindowFromWebContents(
  webContents: WebContents
): AppWindow | null {
  return getAppWindowFromBrowserWindow(
    BrowserWindow.fromWebContents(webContents)
  )
}

function getTargetWindow(): AppWindow | null {
  const focused = getAppWindowFromBrowserWindow(
    BrowserWindow.getFocusedWindow()
  )
  return focused ?? getAppWindows()[0] ?? null
}

function getLoadedTargetWindow(): AppWindow | null {
  const target = getTargetWindow()
  if (target?.isLoaded) {
    return target
  }
  return getAppWindows().find(window => window.isLoaded) ?? null
}

function getWindowsByRoutingPriority(): ReadonlyArray<AppWindow> {
  const target = getTargetWindow()
  return target === null
    ? getAppWindows()
    : [target, ...getAppWindows().filter(window => window !== target)]
}

function findWindowForRepositoryPath(path: string): AppWindow | null {
  return findOwningWindow(getWindowsByRoutingPriority(), path, __WIN32__)
}

function shouldHandleMenuUpdate(webContents: WebContents): boolean {
  const source = getAppWindowFromWebContents(webContents)
  if (source === null) {
    return false
  }
  const focused = BrowserWindow.getFocusedWindow()
  return focused === null || focused.id === source.id
}

function sendAppMenuToAllWindows() {
  for (const window of getAppWindows()) {
    window.sendAppMenu()
  }
}

let accountsFingerprint: string | null = null

function handleAppURL(url: string) {
  log.info('Processing protocol url')
  const action = parseAppURL(url)
  onDidLoad(window => {
    // This manual focus call _shouldn't_ be necessary, but is for Chrome on
    // macOS. See https://github.com/desktop/desktop/issues/973.
    window.focus()
    if (action.name === 'oauth') {
      broadcastOAuthAction(action)
    } else {
      window.sendURLAction(action)
    }
  })
}

function broadcastOAuthAction(action: ReturnType<typeof parseAppURL>) {
  for (const window of getAppWindows()) {
    if (window.isLoaded) {
      window.sendURLAction(action)
    } else {
      window.onDidLoad(() => window.sendURLAction(action))
    }
  }
}

let isDuplicateInstance = false
// If we're handling a Squirrel event we don't want to enforce single instance.
// We want to let the updated instance launch and do its work. It will then quit
// once it's done.
if (!handlingSquirrelEvent) {
  const gotSingleInstanceLock = app.requestSingleInstanceLock()
  isDuplicateInstance = !gotSingleInstanceLock

  app.on('second-instance', async (event, args, workingDirectory) => {
    if (await handleCommandLineArguments(args)) {
      return
    }

    const targetWindow = getTargetWindow()
    if (targetWindow) {
      if (targetWindow.isMinimized()) {
        targetWindow.restore()
      }

      if (!targetWindow.isVisible()) {
        targetWindow.show()
      }

      targetWindow.focus()
    }
  })

  if (isDuplicateInstance) {
    app.quit()
  }
}

if (shellNeedsPatching(process)) {
  updateEnvironmentForProcess()
}

app.on('will-finish-launching', () => {
  // macOS only
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAppURL(url)
  })
})

if (__DARWIN__) {
  app.on('open-file', async (event, path) => {
    event.preventDefault()

    log.info(`[main] a path to ${path} was triggered`)

    Fs.stat(path, (err, stats) => {
      if (err) {
        log.error(`Unable to open path '${path}' in Desktop`, err)
        return
      }

      if (stats.isFile()) {
        log.warn(
          `A file at ${path} was dropped onto Desktop, but it can only handle folders. Ignoring this action.`
        )
        return
      }

      // Yeah this isn't technically a CLI action we use it here to indicate
      // that it's more trusted than a URL action.
      handleCLIAction({ kind: 'open-repository', path })
    })
  })
}

/** Quick-action windows currently open, keyed by their webContents id. */
const quickActionWindows = new Map<number, QuickActionWindow>()

/**
 * How long after launch the shell-extension registration is checked. Long
 * enough to stay out of the cold-start path, short enough that a user who opens
 * Explorer straight after launching finds their menu repaired.
 */
const ShellExtensionRepairDelayMs = 5_000

/**
 * Open the small always-on-top window for an Explorer context-menu verb.
 *
 * `launchedAt` is the earliest timestamp this process knows about, so the
 * renderer can report a launch-to-interactive figure that includes process
 * startup rather than only the window's own load.
 */
function openQuickActionWindow(
  request: IQuickActionRequest,
  launchedAt: number
) {
  const window = new QuickActionWindow(request, launchedAt)
  quickActionWindows.set(window.webContents.id, window)

  window.onClose(() => {
    quickActionWindows.delete(window.webContents.id)
    // A quick action never keeps the app alive on its own: if it was the only
    // reason this process started, closing it should quit rather than leave an
    // invisible process behind.
    if (!__DARWIN__ && windows.size === 0 && quickActionWindows.size === 0) {
      app.quit()
    }
  })

  window.onFailedToLoad(() => {
    log.error('Quick action window failed to load; falling back to the app')
    window.close()
    handleCLIAction({ kind: 'open-repository', path: request.path })
  })

  window.load()
  window.show()
}

/**
 * Handle a command line that may request a quick action.
 *
 * Returns true when the arguments were a quick action (valid or not) and the
 * normal window logic must not also run. An invalid request degrades to opening
 * the folder in the full app rather than failing silently.
 */
function handleQuickActionArguments(
  argv: ReadonlyArray<string>,
  launchedAt: number
): boolean {
  const args = parseCommandLineArgs([...argv], {
    string: ['quick-action', 'path'],
  })
  const decision = decideQuickAction(args)

  switch (decision.kind) {
    case 'not-requested':
      return false
    case 'invalid':
      log.error(`Ignoring malformed quick action request: ${decision.reason}`)
      return false
    case 'quick-action':
      if (decision.request.verb === 'open-in-full-app') {
        handleCLIAction({
          kind: 'open-repository',
          path: decision.request.path,
        })
      } else {
        openQuickActionWindow(decision.request, launchedAt)
      }
      return true
  }
}

async function handleCommandLineArguments(argv: string[]): Promise<boolean> {
  // Only once Electron will let us create a window. This function is also
  // called at module scope, long before `ready`, where opening the quick-action
  // window would throw and surface as an unhandled rejection. The initial
  // command line is re-examined from the `ready` handler instead; this branch
  // exists for `second-instance`, which is always post-ready.
  if (app.isReady() && handleQuickActionArguments(argv, now())) {
    return true
  }

  const args = parseCommandLineArgs(argv, {
    boolean: ['protocol-launcher'],
  })

  // Desktop registers it's protocol handler callback on Windows as
  // `[executable path] --protocol-launcher "%1"`. Note that extra command
  // line arguments might be added by Chromium
  // (https://electronjs.org/docs/api/app#event-second-instance).

  if (__LINUX__ || (__WIN32__ && args['protocol-launcher'] === true)) {
    // On Windows we'll end up getting called with something like
    // `--protocol-launcher --allow-file-access-from-files x-github-client://..`
    // which minimist naturally interprets as
    // `--allow-file-access-from-files=x:/github-client`. This is due to
    // Chromium's hot take on parsing command line arguments, see:
    // https://github.com/electron/electron/issues/20322#issuecomment-534137321
    // So while we could add '--allow-file...' as a boolean we can't know for
    // sure that Chromium won't add more switches later on which is why we have
    // to resort to looking through all arguments looking for something that
    // appears to be an app url.
    const prefixes = Array.from(possibleProtocols, p => `${p}://`)
    const matchingUrl = argv.find(arg => {
      if (prefixes.some(p => arg.startsWith(p))) {
        try {
          new URL(arg)
          return true
        } catch (e) {
          log.error(`Unable to parse argument as URL: ${arg}`)
        }
      }
      return false
    })

    if (matchingUrl) {
      handleAppURL(matchingUrl)
      return true
    } else if (__WIN32__) {
      log.error(`Encountered --protocol-launcher without app url`)
      return false
    }
    // If --protocol-launcher is present we always want to bail and not
    // risk a smuggled cli switch
  }

  if (typeof args['cli-open'] === 'string') {
    handleCLIAction({ kind: 'open-repository', path: args['cli-open'] })
    return true
  } else if (typeof args['cli-clone'] === 'string') {
    handleCLIAction({
      kind: 'clone-url',
      url: args['cli-clone'],
      branch:
        typeof args['cli-branch'] === 'string' ? args['cli-branch'] : undefined,
    })
    return true
  }

  return false
}

function handleCLIAction(action: CLIAction) {
  if (action.kind === 'open-repository') {
    const existingWindow = findWindowForRepositoryPath(action.path)
    if (existingWindow !== null) {
      existingWindow.revealAndFocus()
      existingWindow.sendCLIAction(action)
      return
    }
  }

  onDidLoad(window => {
    // This manual focus call _shouldn't_ be necessary, but is for Chrome on
    // macOS. See https://github.com/desktop/desktop/issues/973.
    window.focus()
    window.sendCLIAction(action)
  })
}

/**
 * Wrapper around app.setAsDefaultProtocolClient that adds our
 * custom prefix command line switches on Windows.
 */
function setAsDefaultProtocolClient(protocol: string) {
  if (__WIN32__) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [
      protocolLauncherArg,
    ])
  } else {
    app.setAsDefaultProtocolClient(protocol)
  }
}

if (process.env.GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION) {
  log.info(
    `GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION environment variable set, disabling hardware acceleration`
  )
  app.disableHardwareAcceleration()
}

app.on('ready', () => {
  if (isDuplicateInstance || handlingSquirrelEvent) {
    return
  }

  readyTime = now() - launchTime

  possibleProtocols.forEach(protocol => setAsDefaultProtocolClient(protocol))

  // A quick action opens only its own small window. Booting the full workspace
  // alongside it would erase the startup saving the feature exists for.
  if (!handleQuickActionArguments(process.argv, launchTime)) {
    createWindow()
  }

  agentServerController = new AgentServerController(
    Path.join(app.getPath('userData'), 'agent-server.json'),
    command => {
      const target = getLoadedTargetWindow()
      if (target === null) {
        return false
      }
      target.sendAgentCommand(command)
      return true
    },
    status => {
      for (const window of getAppWindows()) {
        window.sendAgentServerStatus(status)
      }
    }
  )

  ipcMain.handle('set-agent-server-enabled', async (_event, enabled) =>
    agentServerController!.setEnabled(enabled)
  )
  ipcMain.on('agent-command-result', (_event, id, result) => {
    agentServerController?.acceptRendererResult(id, result)
  })
  ipcMain.handle('get-agent-server-status', async () =>
    agentServerController!.getStatus()
  )
  ipcMain.handle('initialize-agent-server', async (_event, configuration) =>
    agentServerController!.initialize(configuration)
  )
  ipcMain.handle('regenerate-agent-server-token', async () =>
    agentServerController!.regenerateToken()
  )
  ipcMain.handle('configure-agent-server', async (_event, configuration) =>
    agentServerController!.configure(configuration)
  )
  ipcMain.handle('regenerate-agent-server-pairing', async () =>
    agentServerController!.regeneratePairing()
  )
  ipcMain.handle('revoke-agent-server-device', async (_event, id) =>
    agentServerController!.revokeDevice(id)
  )
  ipcMain.handle('set-agent-server-gateway-url', async (_event, value) =>
    agentServerController!.setGatewayURL(value)
  )
  ipcMain.handle('set-agent-server-remote-site-url', async (_event, value) =>
    agentServerController!.setRemoteSiteURL(value)
  )
  ipcMain.handle('download-actions-artifact', (event, request) =>
    handleActionsArtifactTransfer(event.sender, request)
  )
  ipcMain.handle('fetch-actions-job-log', (event, request) =>
    handleActionsJobLogTransfer(event.sender, request)
  )
  ipcMain.on('cancel-actions-transfer', (event, operationId) => {
    cancelActionsTransfer(event.sender.id, operationId)
  })
  ipcMain.handle('verify-actions-artifact-provenance', (event, request) =>
    verifyActionsArtifactProvenance(event.sender, request)
  )
  ipcMain.handle(
    'register-actions-artifact-provenance-credential-lease',
    async (event, request) =>
      registerActionsArtifactProvenanceCredentialLease(event.sender, request)
  )
  ipcMain.on(
    'release-actions-artifact-provenance-credential-lease',
    (event, accountHandle) => {
      releaseActionsArtifactProvenanceCredentialLease(
        event.sender.id,
        accountHandle
      )
    }
  )
  ipcMain.on(
    'invalidate-actions-artifact-provenance-credential-lease-generation',
    (event, accountsGeneration) => {
      invalidateActionsArtifactProvenanceCredentialLeaseGeneration(
        event.sender,
        accountsGeneration
      )
    }
  )
  ipcMain.on('cancel-actions-artifact-provenance', (event, operationId) => {
    cancelActionsArtifactProvenance(event.sender.id, operationId)
  })
  ipcMain.handle('inspect-actions-artifact-subjects', (event, request) =>
    inspectActionsArtifactSubjects(event.sender, request)
  )
  ipcMain.handle('prepare-actions-artifact-subject', (event, request) =>
    prepareActionsArtifactSubject(event.sender, request)
  )
  ipcMain.on(
    'cancel-actions-artifact-subject-operation',
    (event, operationId) => {
      cancelActionsArtifactSubjectOperation(event.sender.id, operationId)
    }
  )
  ipcMain.on('release-actions-artifact-download', (event, downloadId) => {
    releaseCompletedActionsArtifactDownload(event.sender.id, downloadId)
  })

  const orderedWebRequest = new OrderedWebRequest(
    session.defaultSession.webRequest
  )

  // Ensures auth-related headers won't traverse http redirects to hosts
  // on different origins than the originating request.
  installSameOriginFilter(orderedWebRequest)

  // Ensures Alive websocket sessions are initiated with an acceptable Origin
  installAliveOriginFilter(orderedWebRequest)

  // Adds an authorization header for requests of avatars on GHES and private
  // repo assets
  const updateAccounts = installAuthenticatedImageFilter(orderedWebRequest)

  Menu.setApplicationMenu(
    buildDefaultMenu({
      selectedShell: null,
      selectedExternalEditor: null,
      askForConfirmationOnRepositoryRemoval: false,
      askForConfirmationOnForcePush: false,
    })
  )

  registerBuildRunIpc()
  registerActionsLocalRunIpc()
  registerCLIWorkbenchIpc()
  registerGitHubReleaseTransferIPC(ipcMain)
  registerNotificationAutomationIpc()

  ipcMain.on('update-accounts', (event, accounts) => {
    updateAccounts(accounts)
    updateGitHubReleaseTransferAccounts(accounts)
    // EndpointToken deliberately omits login and account id. Every account
    // refresh therefore revokes a provenance lease before the fingerprint
    // shortcut: a credential rotation, removal, or login-only change in any
    // window cannot leave an owned GHE verifier process authorized.
    releaseAllActionsArtifactProvenanceCredentialLeases()
    const fingerprint = JSON.stringify(accounts)
    if (fingerprint === accountsFingerprint) {
      return
    }
    accountsFingerprint = fingerprint
    const source = getAppWindowFromWebContents(event.sender)
    for (const window of getAppWindows()) {
      if (window !== source) {
        window.sendAccountsChanged()
      }
    }
  })

  ipcMain.on('update-preferred-app-menu-item-labels', (event, labels) => {
    if (!shouldHandleMenuUpdate(event.sender)) {
      return
    }
    // The current application menu is mutable and we frequently
    // change whether particular items are enabled or not through
    // the update-menu-state IPC event. This menu that we're creating
    // now will have all the items enabled so we need to merge the
    // current state with the new in order to not get a temporary
    // race conditions where menu items which shouldn't be enabled
    // are.
    const newMenu = buildDefaultMenu(labels)

    const currentMenu = Menu.getApplicationMenu()

    // This shouldn't happen but whenever one says that it does
    // so here's the escape hatch when we can't merge the current
    // menu with the new one; we just use the new one.
    if (currentMenu === null) {
      // https://github.com/electron/electron/issues/2717
      Menu.setApplicationMenu(newMenu)

      sendAppMenuToAllWindows()

      return
    }

    // It's possible that after rebuilding the menu we'll end up
    // with the exact same structural menu as we had before so we
    // keep track of whether anything has actually changed in order
    // to avoid updating the global menu and telling the renderer
    // about it.
    let menuHasChanged = false

    for (const newItem of getAllMenuItems(newMenu)) {
      // Our menu items always have ids and Electron.MenuItem takes on whatever
      // properties was defined on the MenuItemOptions template used to create it
      // but doesn't surface those in the type declaration.
      const id = (newItem as any).id

      if (!id) {
        continue
      }

      const currentItem = currentMenu.getMenuItemById(id)

      // Unfortunately the type information for getMenuItemById
      // doesn't specify if it'll return null or undefined when
      // the item doesn't exist so we'll do a falsy check here.
      if (!currentItem) {
        menuHasChanged = true
      } else {
        if (currentItem.label !== newItem.label) {
          menuHasChanged = true
        }

        // Copy the enabled property from the existing menu
        // item since it'll be the most recent reflection of
        // what the renderer wants.
        if (currentItem.enabled !== newItem.enabled) {
          newItem.enabled = currentItem.enabled
          menuHasChanged = true
        }
      }
    }

    if (menuHasChanged) {
      // https://github.com/electron/electron/issues/2717
      Menu.setApplicationMenu(newMenu)
      sendAppMenuToAllWindows()
    }
  })

  /**
   * An event sent by the renderer asking that the menu item with the given id
   * is executed (ie clicked).
   */
  ipcMain.on('execute-menu-item-by-id', (event, id) => {
    const currentMenu = Menu.getApplicationMenu()

    if (currentMenu === null) {
      return
    }

    const menuItem = currentMenu.getMenuItemById(id)
    if (menuItem) {
      const window = BrowserWindow.fromWebContents(event.sender) || undefined
      const fakeEvent = { preventDefault: () => {}, sender: event.sender }
      menuItem.click(fakeEvent, window, event.sender)
    }
  })

  ipcMain.on('update-menu-state', (event, items) => {
    if (!shouldHandleMenuUpdate(event.sender)) {
      return
    }
    let sendMenuChangedEvent = false

    const currentMenu = Menu.getApplicationMenu()

    if (currentMenu === null) {
      log.debug(`unable to get current menu, bailing out...`)
      return
    }

    for (const item of items) {
      const { id, state } = item

      const menuItem = currentMenu.getMenuItemById(id)

      if (menuItem) {
        // Only send the updated app menu when the state actually changes
        // or we might end up introducing a never ending loop between
        // the renderer and the main process
        if (state.enabled !== undefined && menuItem.enabled !== state.enabled) {
          menuItem.enabled = state.enabled
          sendMenuChangedEvent = true
        }
      } else {
        fatalError(`Unknown menu id: ${id}`)
      }
    }

    if (sendMenuChangedEvent) {
      Menu.setApplicationMenu(currentMenu)
      sendAppMenuToAllWindows()
    }
  })

  /**
   * Handle the action to show a contextual menu.
   *
   * It responds an array of indices that maps to the path to reach
   * the menu (or submenu) item that was clicked or null if the menu was closed
   * without clicking on any item or the item click was handled by the main
   * process as opposed to the renderer.
   */
  ipcMain.handle(
    'show-contextual-menu',
    async (event, items, addSpellCheckMenu) => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const spellCheckMenuItems = addSpellCheckMenu
        ? await buildSpellCheckMenu(window)
        : undefined

      return new Promise(resolve => {
        const menu = buildContextMenu(
          items,
          indices => resolve(indices),
          spellCheckMenuItems
        )

        menu.popup({ window, callback: () => resolve(null) })
      })
    }
  )

  ipcMain.handle('check-for-updates', async (event, url) =>
    getAppWindowFromWebContents(event.sender)?.checkForUpdates(url)
  )

  ipcMain.on('quit-and-install-updates', event =>
    getAppWindowFromWebContents(event.sender)?.quitAndInstallUpdate()
  )

  ipcMain.on('quit-app', () => app.quit())

  ipcMain.on('open-repository-in-new-window', (_, path: string | null) => {
    createWindow(
      path === null
        ? undefined
        : window => {
            window.sendCLIAction({
              kind: 'open-repository',
              path,
              persistSelection: false,
            })
          }
    )
  })

  ipcMain.on('set-window-title', (event, title: string) =>
    getAppWindowFromWebContents(event.sender)?.setTitle(title)
  )

  ipcMain.on(
    'set-window-repository-state',
    (
      event,
      selectedRepositoryPath: string | null,
      openRepositoryPaths: ReadonlyArray<string>
    ) =>
      getAppWindowFromWebContents(event.sender)?.setRepositoryState(
        selectedRepositoryPath,
        openRepositoryPaths
      )
  )

  ipcMain.on('update-window-background-color', (event, color) =>
    getAppWindowFromWebContents(event.sender)?.setBackgroundColor(color)
  )

  ipcMain.on('minimize-window', event =>
    getAppWindowFromWebContents(event.sender)?.minimizeWindow()
  )

  ipcMain.on('maximize-window', event =>
    getAppWindowFromWebContents(event.sender)?.maximizeWindow()
  )

  ipcMain.on('unmaximize-window', event =>
    getAppWindowFromWebContents(event.sender)?.unmaximizeWindow()
  )

  ipcMain.on('close-window', event =>
    getAppWindowFromWebContents(event.sender)?.closeWindow()
  )

  ipcMain.handle(
    'is-window-maximized',
    async event =>
      getAppWindowFromWebContents(event.sender)?.isMaximized() ?? false
  )

  ipcMain.handle('get-apple-action-on-double-click', async () =>
    systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
  )

  ipcMain.handle('get-current-window-state', async event =>
    getAppWindowFromWebContents(event.sender)?.getCurrentWindowState()
  )

  ipcMain.handle('get-current-window-zoom-factor', async event =>
    getAppWindowFromWebContents(event.sender)?.getCurrentWindowZoomFactor()
  )

  ipcMain.on('set-window-zoom-factor', (event, zoomFactor: number) =>
    getAppWindowFromWebContents(event.sender)?.setWindowZoomFactor(zoomFactor)
  )

  if (__WIN32__) {
    ipcMain.on('install-windows-cli', () => installWindowsCLI())
    ipcMain.on('uninstall-windows-cli', () => uninstallWindowsCLI())

    // Quick-action window plumbing. Each handler resolves the calling window
    // from the event sender so several quick windows can coexist.
    ipcMain.on('quick-action-ready', event =>
      quickActionWindows.get(event.sender.id)?.onRendererReady()
    )
    ipcMain.on('quick-action-close', event =>
      quickActionWindows.get(event.sender.id)?.close()
    )
    ipcMain.on('quick-action-open-in-app', (event, path) => {
      quickActionWindows.get(event.sender.id)?.close()
      handleCLIAction({ kind: 'open-repository', path })
    })
    ipcMain.on('quick-action-opened', (_event, elapsedMs) => {
      log.info(`Quick action window interactive in ${elapsedMs}ms`)
    })

    // An update installs into a new `app-<version>` directory and eventually
    // deletes the old one, which used to strand the shell extension's
    // registration on a path that no longer existed — the package still
    // reported itself installed while Explorer showed nothing. Repair it here,
    // and only for a user who already had it registered: this restores a
    // choice, it never makes one.
    //
    // Deferred because the check shells out to PowerShell on every Windows
    // launch, including the overwhelmingly common one where nothing is
    // registered at all. A menu that has been broken since the last update can
    // wait a few more seconds; a slower cold start cannot be given back.
    setTimeout(
      () =>
        repairStaleShellExtensionRegistration().catch(error =>
          log.warn('Could not check the shell-extension registration', error)
        ),
      ShellExtensionRepairDelayMs
    )

    // Explorer context-menu entries. Both handlers are per-user (HKCU) and
    // never elevate; the labels come from the renderer because the language
    // mode lives in localStorage.
    ipcMain.handle('get-windows-context-menu-state', async (_event, labels) =>
      getWindowsContextMenuState(labels)
    )
    ipcMain.handle(
      'set-windows-context-menu-entry',
      async (_event, request) => {
        const result = await setWindowsContextMenuEntryInstalled(
          request.id,
          request.installed,
          request.labels
        )
        return {
          result,
          state: await getWindowsContextMenuState(request.labels),
        }
      }
    )
    ipcMain.handle(
      'set-modern-context-menu-installed',
      async (_event, request) => {
        const { error } = await setModernContextMenuInstalled(request.installed)
        return {
          // The packaged handler is not a per-entry concept; the id is carried
          // only so the reply shape matches the classic one.
          result: {
            id: 'open-in-desktop-material' as const,
            installed: request.installed,
            error,
          },
          state: await getWindowsContextMenuState(request.labels),
        }
      }
    )
  }

  /**
   * An event sent by the renderer asking for a copy of the current
   * application menu.
   */
  ipcMain.on('get-app-menu', event =>
    getAppWindowFromWebContents(event.sender)?.sendAppMenu()
  )

  ipcMain.on('show-certificate-trust-dialog', (event, certificate, message) => {
    // This API is only implemented for macOS and Windows right now.
    if (__DARWIN__ || __WIN32__) {
      const target = getAppWindowFromWebContents(event.sender)
      if (target !== null) {
        target.showCertificateTrustDialog(certificate, message)
      }
    }
  })

  ipcMain.on('log', (_, level, message) => writeLog(level, message))

  ipcMain.on('set-verbose-logging', (_, verbose) =>
    setLogLevel(verbose ? 'debug' : 'info')
  )

  ipcMain.on('uncaught-exception', (_, error) => {
    // The renderer contains these itself; this is the same boundary applied
    // again in case an older renderer build reports one.
    if (
      containPeerClosedStreamException(
        error,
        'renderer-process-peer-closed-write'
      )
    ) {
      return
    }
    handleUncaughtException(error)
  })

  ipcMain.on('send-error-report', (_, error, extra, nonFatal) => {
    reportErrorSafely(error, { ...getExtraErrorContext(), ...extra }, nonFatal)
  })

  ipcMain.handle('open-external', async (_, path: string) => {
    const pathLowerCase = path.toLowerCase()
    if (
      pathLowerCase.startsWith('http://') ||
      pathLowerCase.startsWith('https://')
    ) {
      log.info(`opening in browser: ${path}`)
    }

    try {
      await shell.openExternal(path)
      return true
    } catch (e) {
      log.error(`Call to openExternal failed: '${e}'`)
      return false
    }
  })

  /**
   * An event sent by the renderer asking for the app's architecture
   */
  ipcMain.handle('get-path', async (_, path) => app.getPath(path))

  /**
   * An event sent by the renderer asking for the app's architecture
   */
  ipcMain.handle('get-app-architecture', async () => getArchitecture(app))

  /**
   * An event sent by the renderer asking for the app's path
   */
  ipcMain.handle('get-app-path', async () => app.getAppPath())

  /**
   * An event sent by the renderer asking for the executable path
   */
  ipcMain.handle('get-exec-path', async () => process.execPath)

  /**
   * An event sent by the renderer asking for whether the app is running under
   * rosetta translation
   */
  ipcMain.handle('is-running-under-arm64-translation', async () =>
    isAppRunningUnderARM64Translation(app)
  )

  /**
   * An event sent by the renderer asking to move the app to the application
   * folder
   */
  ipcMain.handle('move-to-applications-folder', async () => {
    app.moveToApplicationsFolder?.()
  })

  ipcMain.handle('move-to-trash', (_, path) => shell.trashItem(path))
  ipcMain.handle('force-delete-directory', (_, path) =>
    safeForceDeleteDirectory(path)
  )
  ipcMain.handle('show-item-in-folder', async (_, path) =>
    shell.showItemInFolder(path)
  )

  ipcMain.on('unsafe-open-directory', async (_, path) =>
    UNSAFE_openDirectory(path)
  )

  /** An event sent by the renderer asking to select all of the window's contents */
  ipcMain.on('select-all-window-contents', event =>
    getAppWindowFromWebContents(event.sender)?.selectAllWindowContents()
  )

  /** An event sent by the renderer indicating a modal dialog is opened */
  ipcMain.on('dialog-did-open', event =>
    getAppWindowFromWebContents(event.sender)?.dialogDidOpen()
  )

  /**
   * An event sent by the renderer asking whether the Desktop is in the
   * applications folder
   *
   * Note: This will return null when not running on Darwin
   */
  ipcMain.handle('is-in-application-folder', async () => {
    // Contrary to what the types tell you the `isInApplicationsFolder` will be undefined
    // when not on macOS
    return app.isInApplicationsFolder?.() ?? null
  })

  /**
   * Handle action to resolve proxy
   */
  ipcMain.handle('resolve-proxy', async (_, url: string) => {
    return session.defaultSession.resolveProxy(url)
  })

  /**
   * An event sent by the renderer asking to show the save dialog
   *
   * Returns null if filepath is undefined or if dialog is canceled.
   */
  ipcMain.handle(
    'show-save-dialog',
    async (event, options) =>
      getAppWindowFromWebContents(event.sender)?.showSaveDialog(options) ?? null
  )

  /**
   * An event sent by the renderer asking to show the open dialog
   */
  ipcMain.handle(
    'show-open-dialog',
    async (event, options) =>
      getAppWindowFromWebContents(event.sender)?.showOpenDialog(options) ?? null
  )

  /** An event sent by the renderer asking for a bounded multi-file selection. */
  ipcMain.handle(
    'show-open-dialog-multiple',
    async (event, options) =>
      getAppWindowFromWebContents(event.sender)?.showOpenDialogMultiple(
        options
      ) ?? []
  )

  /**
   * An event sent by the renderer asking obtain whether the window is focused
   */
  ipcMain.handle(
    'is-window-focused',
    async event =>
      getAppWindowFromWebContents(event.sender)?.isFocused() ?? false
  )

  /** An event sent by the renderer asking to focus the main window. */
  ipcMain.on('focus-window', event => {
    getAppWindowFromWebContents(event.sender)?.revealAndFocus()
  })

  ipcMain.on('set-native-theme-source', (_, themeName) => {
    nativeTheme.themeSource = themeName
  })

  ipcMain.handle(
    'should-use-dark-colors',
    async () => nativeTheme.shouldUseDarkColors
  )

  ipcMain.handle('get-guid', () => getMainGUID())

  ipcMain.handle('save-guid', (_, guid) => saveGUIDFile(guid))

  ipcMain.handle('show-notification', async (event, title, body, userInfo) => {
    const notificationId = await showNotification(title, body, userInfo)
    const sourceWindow = BrowserWindow.fromWebContents(event.sender)
    if (notificationId !== null && sourceWindow !== null) {
      associateNotificationWithWindow(notificationId, sourceWindow)
    }
    return notificationId
  })

  ipcMain.handle('get-notifications-permission', async () =>
    getNotificationsPermission()
  )
  ipcMain.handle('request-notifications-permission', async () =>
    requestNotificationsPermission()
  )

  ipcMain.on('will-quit', event => {
    for (const window of getAppWindows()) {
      window.markWillQuit()
    }
    event.returnValue = true
  })

  ipcMain.on('will-quit-even-if-updating', event => {
    for (const window of getAppWindows()) {
      window.markWillQuitEvenIfUpdating()
    }
    event.returnValue = true
  })

  ipcMain.on('cancel-quitting', event => {
    for (const window of getAppWindows()) {
      window.cancelQuitting()
    }
    event.returnValue = true
  })
})

app.on('activate', () => {
  if (windows.size === 0) {
    createWindow()
    return
  }
  getTargetWindow()?.revealAndFocus()
})

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    log.warn(`Prevented new window to: ${url}`)
    return { action: 'deny' }
  })

  // prevent link navigation within our windows
  // see https://www.electronjs.org/docs/tutorial/security#12-disable-or-limit-navigation
  contents.on('will-navigate', (event, url) => {
    event.preventDefault()
    log.warn(`Prevented navigation to: ${url}`)
  })
})

app.on(
  'certificate-error',
  (event, webContents, url, error, certificate, callback) => {
    callback(false)

    const target = getAppWindowFromWebContents(webContents)
    if (target !== null) {
      target.sendCertificateError(certificate, error, url)
    } else {
      onDidLoad(window => window.sendCertificateError(certificate, error, url))
    }
  }
)

function createWindow(onWindowDidLoad?: OnDidLoadFn): AppWindow {
  const scope = nextWindowScope(new Set(getAppWindows().map(w => w.scope)))
  const window = new AppWindow(scope)
  windows.set(window.id, window)

  if (__DEV__) {
    const {
      default: installExtension,
      REACT_DEVELOPER_TOOLS,
    } = require('electron-devtools-installer')

    const axeDevTools = {
      id: 'lhdoppojpmngadmnindnejefpokejbdd',
    }

    const extensions = [REACT_DEVELOPER_TOOLS, axeDevTools]

    try {
      installExtension(extensions, {
        loadExtensionOptions: { allowFileAccess: true },
      })
      console.log('Added Extensions: "React Developer Tools", "axe DevTools"')
    } catch (e) {
      console.log('An error occurred while loading extensions: ', e)
    }
  }

  window.onClosed(() => {
    windows.delete(window.id)
    if (!__DARWIN__ && windows.size === 0 && !preventQuit) {
      app.quit()
    }
  })

  window.onRendererFailure(failure => {
    const error = createRendererFailureError(window.scope, failure)
    reportErrorSafely(error, {
      ...getExtraErrorContext(),
      failureKind: failure.kind,
      windowScope: window.scope,
    })
    handleUncaughtException(error)
  })

  window.onDidLoad(() => {
    window.show()
    window.sendLaunchTimingStats({
      mainReadyTime: readyTime!,
      loadTime: window.loadTime!,
      rendererReadyTime: window.rendererReadyTime!,
    })

    const fns = pendingOnDidLoadFns.splice(0)
    for (const fn of fns) {
      fn(window)
    }
  })

  if (onWindowDidLoad !== undefined) {
    window.onDidLoad(() => onWindowDidLoad(window))
  }

  window.load()

  return window
}

/**
 * Register a function to be called once the window has been loaded. If the
 * window has already been loaded, the function will be called immediately.
 */
function onDidLoad(fn: OnDidLoadFn) {
  const loaded = getLoadedTargetWindow()
  if (loaded !== null) {
    fn(loaded)
    return
  }
  pendingOnDidLoadFns.push(fn)
}
