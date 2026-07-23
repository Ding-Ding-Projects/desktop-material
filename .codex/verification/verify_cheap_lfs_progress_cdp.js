#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- every synchronous path is bounded to an owned Temp fixture */

/**
 * Deterministic Cheap LFS commit-progress verifier (CDP attach mode).
 *
 * The caller owns the Electron process, loopback CDP port, hidden Win32
 * desktop, disposable repository, and cleanup. This helper never launches,
 * focuses, resizes, or terminates a window. It creates sparse files only in
 * the caller-owned disposable repository, hydrates the running app through its
 * AppStore/Dispatcher seams, captures original CDP pixels, and emits a strict
 * JSON receipt.
 *
 * Wide documentation capture:
 *   node .codex/verification/verify_cheap_lfs_progress_cdp.js \
 *     --port 9337 \
 *     --run-root %TEMP%\desktop-material-cheap-lfs-progress-<run-id> \
 *     --repository-path %TEMP%\desktop-material-cheap-lfs-progress-<run-id>\fixture \
 *     --scenario wide \
 *     --capture %TEMP%\desktop-material-cheap-lfs-progress-<run-id>\captures\wide.png \
 *     --receipt %TEMP%\desktop-material-cheap-lfs-progress-<run-id>\receipts\wide.json
 *
 * Narrow bilingual inspection:
 *   node .codex/verification/verify_cheap_lfs_progress_cdp.js \
 *     --port 9337 --run-root <owned-root> --repository-path <fixture> \
 *     --scenario narrow-bilingual --capture <owned-root>\captures\narrow.png \
 *     --receipt <owned-root>\receipts\narrow.json
 */

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const WebSocket = require('ws')

const ScenarioSpecifications = Object.freeze({
  wide: Object.freeze({
    width: 1440,
    height: 960,
    languageMode: 'english',
  }),
  'narrow-bilingual': Object.freeze({
    width: 640,
    height: 960,
    languageMode: 'bilingual',
  }),
})

const MiB = 1024 * 1024
const FixtureFiles = Object.freeze([
  Object.freeze({
    relativePath: 'assets/cheap-lfs-demo-01.mp4',
    sizeInBytes: 160 * MiB,
  }),
  Object.freeze({
    relativePath: 'datasets/cheap-lfs-demo-02.bin',
    sizeInBytes: 144 * MiB,
  }),
  Object.freeze({
    relativePath: 'exports/cheap-lfs-demo-03.psd',
    sizeInBytes: 128 * MiB,
  }),
])
const SmallFixtureRelativePath = 'notes/ordinary-change.txt'
const ExpectedSanitizedPaths = Object.freeze([
  FixtureFiles[0].relativePath,
  FixtureFiles[1].relativePath,
  'exports/cheap-lfs- demo-03.psd',
])
const OverflowWorkerCanary = 'overflow-worker-must-not-render.dat'
const ExpectedOverallPercentage = 53

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    if (values.has(name.slice(2))) {
      fail(`Duplicate argument ${name}.`)
    }
    values.set(name.slice(2), value)
  }

  const supported = new Set([
    'port',
    'run-root',
    'repository-path',
    'scenario',
    'capture',
    'receipt',
  ])
  for (const name of values.keys()) {
    if (!supported.has(name)) {
      fail(`Unsupported argument --${name}.`)
    }
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }

  const scenario = values.get('scenario')
  if (!Object.hasOwn(ScenarioSpecifications, scenario ?? '')) {
    fail('Scenario must be wide or narrow-bilingual.')
  }

  const requiredPath = name => {
    const value = values.get(name)
    if (value === undefined || value.trim().length === 0) {
      fail(`--${name} is required.`)
    }
    return path.resolve(value)
  }

  return {
    port,
    scenario,
    specification: ScenarioSpecifications[scenario],
    runRoot: requiredPath('run-root'),
    repositoryPath: requiredPath('repository-path'),
    capturePath: requiredPath('capture'),
    receiptPath: requiredPath('receipt'),
  }
}

function normalizedPath(value) {
  return path.resolve(value).toLowerCase()
}

function isContainedPath(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function assertRealDirectory(candidate, label) {
  let status
  let real
  let realStatus
  try {
    status = fs.lstatSync(candidate)
    real = fs.realpathSync.native(candidate)
    realStatus = fs.lstatSync(real)
  } catch {
    fail(`${label} is missing.`)
  }
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    !realStatus.isDirectory() ||
    status.dev !== realStatus.dev ||
    status.ino !== realStatus.ino
  ) {
    fail(`${label} must be a real directory, not a link or junction.`)
  }
  return real
}

function ensureOwnedOutput(runRoot, candidate, label) {
  if (!isContainedPath(runRoot, candidate)) {
    fail(`${label} must stay inside the owned run root.`)
  }
  if (fs.existsSync(candidate)) {
    fail(`${label} must be a new file.`)
  }
  fs.mkdirSync(path.dirname(candidate), { recursive: true })
  const parent = assertRealDirectory(path.dirname(candidate), `${label} parent`)
  if (!isContainedPath(runRoot, parent)) {
    fail(`${label} parent escaped the owned run root.`)
  }
}

function validateOwnedPaths(options) {
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(path.dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !/^desktop-material-cheap-lfs-progress-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/.test(
      path.basename(runRoot)
    )
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-cheap-lfs-progress-*.'
    )
  }

  const repositoryPath = assertRealDirectory(
    options.repositoryPath,
    'Disposable repository'
  )
  if (!isContainedPath(runRoot, repositoryPath)) {
    fail('Disposable repository must stay inside the owned run root.')
  }
  const gitEntry = path.join(repositoryPath, '.git')
  if (!fs.existsSync(gitEntry) || fs.lstatSync(gitEntry).isSymbolicLink()) {
    fail('Disposable repository has no safe .git entry.')
  }

  ensureOwnedOutput(runRoot, options.capturePath, 'Capture')
  ensureOwnedOutput(runRoot, options.receiptPath, 'Receipt')
  if (
    normalizedPath(options.capturePath) === normalizedPath(options.receiptPath)
  ) {
    fail('Capture and receipt must use different files.')
  }

  return { runRoot, repositoryPath }
}

function containedFixturePath(repositoryPath, relativePath) {
  const candidate = path.resolve(repositoryPath, ...relativePath.split('/'))
  if (!isContainedPath(repositoryPath, candidate)) {
    fail('A verification fixture path escaped the disposable repository.')
  }
  return candidate
}

function writeSparseFile(repositoryPath, file) {
  const absolutePath = containedFixturePath(repositoryPath, file.relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  const parent = fs.realpathSync.native(path.dirname(absolutePath))
  if (!isContainedPath(repositoryPath, parent)) {
    fail('A sparse fixture parent escaped the disposable repository.')
  }
  const descriptor = fs.openSync(absolutePath, 'w')
  try {
    fs.writeSync(
      descriptor,
      'Desktop Material Cheap LFS verification fixture\n'
    )
    fs.ftruncateSync(descriptor, file.sizeInBytes)
  } finally {
    fs.closeSync(descriptor)
  }
}

function prepareDisposableFixture(repositoryPath) {
  for (const file of FixtureFiles) {
    writeSparseFile(repositoryPath, file)
  }
  const smallPath = containedFixturePath(
    repositoryPath,
    SmallFixtureRelativePath
  )
  fs.mkdirSync(path.dirname(smallPath), { recursive: true })
  fs.writeFileSync(
    smallPath,
    'This ordinary change must disappear when the large-file filter is active.\n'
  )
}

function requestJSON(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        timeout: 5_000,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`CDP discovery returned ${response.statusCode}.`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () =>
      request.destroy(new Error('CDP discovery timed out.'))
    )
    request.on('error', reject)
  })
}

async function rendererWebSocketURL(port) {
  const deadline = Date.now() + 20_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await requestJSON(port, '/json/list')
      const renderer = targets.find(
        target =>
          target.type === 'page' &&
          typeof target.url === 'string' &&
          target.url.includes('/out/index.html') &&
          typeof target.webSocketDebuggerUrl === 'string'
      )
      if (renderer !== undefined) {
        return renderer.webSocketDebuggerUrl
      }
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw (
    lastError ?? new Error('Desktop Material renderer target was not found.')
  )
}

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url, {
      handshakeTimeout: 5_000,
      maxPayload: 64 * 1024 * 1024,
    })
    this.nextId = 1
    this.pending = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
    this.socket.on('message', data => {
      const message = JSON.parse(String(data))
      if (message.id === undefined) {
        return
      }
      const pending = this.pending.get(message.id)
      if (pending === undefined) {
        return
      }
      this.pending.delete(message.id)
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message ?? 'CDP failure'))
      } else {
        pending.resolve(message.result)
      }
    })
    this.socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP connection closed.'))
      }
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }), error => {
        // ws may report a successful send as either undefined or null,
        // depending on its Node runtime integration.
        if (error !== undefined && error !== null) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  close() {
    this.socket.close()
  }
}

let client = null

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails !== undefined) {
    fail(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Renderer evaluation failed.'
    )
  }
  return result.result?.value
}

async function waitFor(expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) {
        return
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  fail(`Timed out waiting for ${label}.`)
}

async function preparePresentation(specification) {
  await waitFor(
    `document.querySelector('#desktop-app-container') !== null`,
    'Desktop Material app container'
  )
  const expected = {
    theme: 'dark',
    'language-mode-v1': specification.languageMode,
    'has-shown-welcome-flow': '1',
    'zoom-auto-fit-enabled': '0',
    'stats-opt-out': '1',
    'has-sent-stats-opt-in-ping': '1',
  }
  const changed = await evaluate(`(() => {
    const expected = ${JSON.stringify(expected)}
    let changed = false
    if (localStorage.getItem('autoSwitchTheme') !== null) {
      localStorage.removeItem('autoSwitchTheme')
      changed = true
    }
    for (const [key, value] of Object.entries(expected)) {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value)
        changed = true
      }
    }
    return changed
  })()`)

  if (changed) {
    const previousTimeOrigin = await evaluate('performance.timeOrigin')
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(
      `performance.timeOrigin > ${JSON.stringify(previousTimeOrigin)}`,
      'renderer reload'
    )
    await waitFor(
      `document.querySelector('#desktop-app-container') !== null`,
      'Desktop Material after presentation reload'
    )
  }

  await evaluate(`require('electron').webFrame.setZoomFactor(1), true`)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: specification.width,
    height: specification.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: specification.width,
    screenHeight: specification.height,
  })
  await new Promise(resolve => setTimeout(resolve, 500))
  await waitFor(
    `(() => document.body.classList.contains('theme-dark') &&
      localStorage.getItem('theme') === 'dark' &&
      document.body.getAttribute('data-dm-language-mode') === ${JSON.stringify(
        specification.languageMode
      )} &&
      document.documentElement.getAttribute('data-language-mode') === ${JSON.stringify(
        specification.languageMode
      )} && innerWidth === ${specification.width} &&
      innerHeight === ${specification.height})()`,
    'requested dark appearance and viewport'
  )
}

async function showChanges() {
  await evaluate(
    `require('electron').ipcRenderer.emit('menu-event', {}, 'show-changes'), true`
  )
  await waitFor(
    `document.getElementById('changes-tab')?.closest('[role="tab"]')?.getAttribute('aria-selected') === 'true'`,
    'Changes section'
  )
}

async function acceptCliOpenReview() {
  await waitFor(
    `(() => {
      const dialog = document.getElementById('add-existing-repository')
      if (dialog === null) return true
      const button = dialog.querySelector('button[type="submit"]')
      return button instanceof HTMLButtonElement && !button.disabled
    })()`,
    'reviewed local repository action'
  )
  const result = await evaluate(`(() => {
    const dialog = document.getElementById('add-existing-repository')
    if (dialog === null) return 'not-required'
    const button = dialog.querySelector('button[type="submit"]')
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return 'unavailable'
    }
    button.click()
    return 'clicked'
  })()`)
  if (result === 'unavailable') {
    fail('The reviewed local repository action was unavailable.')
  }
  if (result === 'clicked') {
    await waitFor(
      `document.getElementById('add-existing-repository') === null &&
       document.getElementById('changes-tab') !== null`,
      'reviewed disposable repository open'
    )
  }
}

async function dismissPausedCloneQueueDialog() {
  const dismissed = await evaluate(`(() => {
    const dialog = document.getElementById('batch-clone-progress')
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return false
    const hide = dialog.querySelector('.dialog-footer button[type="submit"]')
    if (!(hide instanceof HTMLButtonElement) || hide.disabled) {
      throw new Error('Paused clone queue Hide action is unavailable.')
    }
    hide.click()
    return true
  })()`)
  if (dismissed) {
    await waitFor(
      `(() => {
        const dialog = document.getElementById('batch-clone-progress')
        return !(dialog instanceof HTMLDialogElement) || !dialog.open
      })()`,
      'paused clone queue dialog hidden'
    )
  }
  return dismissed
}

function progressFixture() {
  return {
    phase: 'uploading',
    selectedStorageProvider: 'release',
    recommendedStorageProvider: 'ghcr',
    estimatedRegistryLayers: 6,
    completedFiles: 4,
    succeededFiles: 3,
    failedFiles: 1,
    totalFiles: 8,
    currentPath: ` ${FixtureFiles[0].relativePath}\r\n`,
    transferredBytes: 550 * MiB,
    totalBytes: 1024 * MiB,
    activeFiles: [
      {
        relativePath: ` ${FixtureFiles[0].relativePath}\r\n`,
        phase: 'uploading',
        processedBytes: 72 * MiB,
        totalBytes: FixtureFiles[0].sizeInBytes,
      },
      {
        relativePath: `${FixtureFiles[1].relativePath}\u001b`,
        phase: 'hashing',
        processedBytes: 96 * MiB,
        totalBytes: FixtureFiles[1].sizeInBytes,
      },
      {
        relativePath: 'exports/cheap-lfs-\u0007demo-03.psd',
        phase: 'verifying',
        processedBytes: 96 * MiB,
        totalBytes: FixtureFiles[2].sizeInBytes,
      },
      {
        relativePath: OverflowWorkerCanary,
        phase: 'release',
        processedBytes: 0,
        totalBytes: 120 * MiB,
      },
    ],
  }
}

async function hydrateAppState(repositoryPath) {
  const receipt = await evaluate(`(async () => {
    const findApp = () => {
      const root = document.querySelector('#desktop-app-container')
      const nodes = root ? [root, ...root.querySelectorAll('*')] : []
      for (const node of nodes) {
        const fiberKey = Object.keys(node).find(key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
        )
        let fiber = fiberKey ? node[fiberKey] : null
        for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
          if (
            fiber.stateNode?.props?.appStore &&
            fiber.stateNode?.props?.dispatcher
          ) {
            return fiber.stateNode.props
          }
        }
      }
      return null
    }
    const app = findApp()
    if (app === null) return { app: false }
    const { appStore, dispatcher } = app
    const repository = appStore.selectedRepository
    const pathModule = require('path')
    const expectedPath = pathModule.resolve(${JSON.stringify(repositoryPath)})
    const repositoryMatched =
      repository !== null &&
      pathModule.resolve(repository.path).toLowerCase() ===
        expectedPath.toLowerCase()
    if (!repositoryMatched) {
      return { app: true, repositoryMatched: false }
    }

    const status = await appStore._loadStatus(repository, false)
    if (status === null) {
      return { app: true, repositoryMatched: true, statusLoaded: false }
    }
    appStore._updateFileListFilter(repository, {
      filterText: '',
      isIncludedInCommit: false,
      isExcludedFromCommit: false,
      isNewFile: false,
      isModifiedFile: false,
      isDeletedFile: false,
      isCheapLfsCandidate: true,
    })
    if (appStore.getState().showChangesFilter !== true) {
      dispatcher.toggleChangesFilterVisibility()
    }
    const progress = ${JSON.stringify(progressFixture())}
    appStore.repositoryStateCache.update(repository, () => ({
      isCommitting: true,
      commitOperationPhase: { kind: 'cheap-lfs', progress },
    }))
    appStore.emitUpdate()
    const current = appStore.repositoryStateCache.get(repository)
    return {
      app: true,
      repositoryMatched: true,
      statusLoaded: true,
      changedFileCount: current.changesState.workingDirectory.files.length,
      fixtureFilesPresent: ${JSON.stringify(
        FixtureFiles.map(file => file.relativePath)
      )}.every(path =>
        current.changesState.workingDirectory.files.some(file => file.path === path)
      ),
      smallFixturePresent: current.changesState.workingDirectory.files.some(
        file => file.path === ${JSON.stringify(SmallFixtureRelativePath)}
      ),
      filterActive:
        current.changesState.fileListFilter.isCheapLfsCandidate === true,
      isCommitting: current.isCommitting,
      phaseKind: current.commitOperationPhase?.kind ?? null,
      activeFiles: current.commitOperationPhase?.kind === 'cheap-lfs'
        ? current.commitOperationPhase.progress.activeFiles?.length ?? 0
        : 0,
    }
  })()`)

  if (
    receipt?.app !== true ||
    receipt.repositoryMatched !== true ||
    receipt.statusLoaded !== true ||
    receipt.fixtureFilesPresent !== true ||
    receipt.smallFixturePresent !== true ||
    receipt.filterActive !== true ||
    receipt.isCommitting !== true ||
    receipt.phaseKind !== 'cheap-lfs' ||
    receipt.activeFiles !== 4
  ) {
    fail(`App-native Cheap LFS hydration failed: ${JSON.stringify(receipt)}`)
  }
  return receipt
}

async function selectVisibleLargeFileWithPointer() {
  const released = await evaluate(`(async () => {
    const findApp = () => {
      const root = document.querySelector('#desktop-app-container')
      const nodes = root ? [root, ...root.querySelectorAll('*')] : []
      for (const node of nodes) {
        const fiberKey = Object.keys(node).find(key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
        )
        let fiber = fiberKey ? node[fiberKey] : null
        for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
          if (fiber.stateNode?.props?.appStore) return fiber.stateNode.props.appStore
        }
      }
      return null
    }
    const appStore = findApp()
    const repository = appStore?.selectedRepository ?? null
    if (appStore === null || repository === null) return null
    const current = appStore.repositoryStateCache.get(repository)
    const candidate = current.changesState.workingDirectory.files.find(
      file => file.path === ${JSON.stringify(FixtureFiles[0].relativePath)}
    )
    if (!candidate || current.commitOperationPhase?.kind !== 'cheap-lfs') return null
    const operationSnapshot = JSON.stringify(current.commitOperationPhase)
    appStore.repositoryStateCache.update(repository, () => ({ isCommitting: false }))
    appStore.emitUpdate()
    await appStore._selectWorkingDirectoryFiles(repository, [])
    const cleared = appStore.repositoryStateCache.get(repository).changesState.selection
    return {
      candidateId: candidate.id,
      operationSnapshot,
      released: appStore.repositoryStateCache.get(repository).isCommitting === false,
      selectionCleared:
        cleared.kind === 'WorkingDirectory' &&
        cleared.selectedFileIDs.length === 0 &&
        cleared.diff === null,
    }
  })()`)
  if (
    released?.released !== true ||
    released.selectionCleared !== true ||
    typeof released.candidateId !== 'string' ||
    typeof released.operationSnapshot !== 'string'
  ) {
    fail(
      `Could not release the synthetic commit lock: ${JSON.stringify(released)}`
    )
  }

  await waitFor(
    `(() => {
      const row = [...document.querySelectorAll('#changes-list .list-item')]
        .find(value => (value.textContent ?? '').includes(${JSON.stringify(
          FixtureFiles[0].relativePath
        )}))
      if (!(row instanceof HTMLElement)) return false
      const bounds = row.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= 0 && bounds.top >= 0 &&
        bounds.right <= innerWidth && bounds.bottom <= innerHeight &&
        row.getAttribute('aria-selected') === 'false'
    })()`,
    'visible Cheap LFS candidate row'
  )
  const target = await evaluate(`(() => {
    const row = [...document.querySelectorAll('#changes-list .list-item')]
      .find(value => (value.textContent ?? '').includes(${JSON.stringify(
        FixtureFiles[0].relativePath
      )}))
    if (!(row instanceof HTMLElement)) return null
    const bounds = row.getBoundingClientRect()
    return {
      x: Math.round(bounds.left + bounds.width / 2),
      y: Math.round(bounds.top + bounds.height / 2),
      ariaSelected: row.getAttribute('aria-selected'),
    }
  })()`)
  if (
    target === null ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    target.ariaSelected !== 'false'
  ) {
    fail(
      `Cheap LFS candidate pointer target was invalid: ${JSON.stringify(
        target
      )}`
    )
  }

  // CDP pointer input is ignored by an inactive Electron renderer. This only
  // activates the BrowserWindow on the caller-owned named headless desktop; it
  // never switches or focuses the user's visible desktop.
  await client.send('Page.bringToFront')
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: target.x,
    y: target.y,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: target.x,
    y: target.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: target.x,
    y: target.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })

  const selectionExpression = `(() => {
    const root = document.querySelector('#desktop-app-container')
    const nodes = root ? [root, ...root.querySelectorAll('*')] : []
    let appStore = null
    for (const node of nodes) {
      const fiberKey = Object.keys(node).find(key =>
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$')
      )
      let fiber = fiberKey ? node[fiberKey] : null
      for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
        if (fiber.stateNode?.props?.appStore) {
          appStore = fiber.stateNode.props.appStore
          break
        }
      }
      if (appStore !== null) break
    }
    const repository = appStore?.selectedRepository ?? null
    if (appStore === null || repository === null) return false
    const current = appStore.repositoryStateCache.get(repository)
    const selection = current.changesState.selection
    const row = [...document.querySelectorAll('#changes-list .list-item')]
      .find(value => (value.textContent ?? '').includes(${JSON.stringify(
        FixtureFiles[0].relativePath
      )}))
    const switcher = document.querySelector('.diff-container .seamless-diff-switcher')
    const unrenderable = document.querySelector('.diff-container .panel.empty.large-diff')
    const unrenderableDescription = unrenderable?.querySelector(
      '.empty-state-description'
    )
    return selection.kind === 'WorkingDirectory' &&
      selection.selectedFileIDs?.length === 1 &&
      selection.selectedFileIDs[0] === ${JSON.stringify(
        released.candidateId
      )} &&
      row?.getAttribute('aria-selected') === 'true' &&
      switcher instanceof HTMLElement &&
      switcher.classList.contains('has-diff') &&
      !switcher.classList.contains('loading') &&
      unrenderable instanceof HTMLElement &&
      (unrenderableDescription?.textContent ?? '').trim() ===
        'The diff is too large to be displayed.'
  })()`
  let pointerAttempts = 0
  let selectionSettled = false
  const pointerFailureReceipts = []
  while (pointerAttempts < 3 && !selectionSettled) {
    pointerAttempts++
    if (pointerAttempts > 1) {
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: target.x,
        y: target.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      })
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: target.x,
        y: target.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    }
    try {
      await waitFor(
        selectionExpression,
        'stable selected Cheap LFS large-file diff',
        12_000
      )
      selectionSettled = true
    } catch {
      // The disposable repository watcher can rebound once while the sparse
      // file diff is loading. Retry the same verified row with a real CDP
      // pointer event; never replace this UI proof with a store mutation.
      pointerFailureReceipts.push(
        await evaluate(`(() => {
        const row = [...document.querySelectorAll('#changes-list .list-item')]
          .find(value => (value.textContent ?? '').includes(${JSON.stringify(
            FixtureFiles[0].relativePath
          )}))
        const bounds = row?.getBoundingClientRect()
        const hit = bounds
          ? document.elementFromPoint(
              Math.round(bounds.left + bounds.width / 2),
              Math.round(bounds.top + bounds.height / 2)
            )
          : null
        const switcher = document.querySelector(
          '.diff-container .seamless-diff-switcher'
        )
        const unrenderable = document.querySelector(
          '.diff-container .panel.empty.large-diff'
        )
        return {
          attempt: ${pointerAttempts},
          viewport: [innerWidth, innerHeight],
          rowSelected: row?.getAttribute('aria-selected') ?? null,
          rowGeometry: bounds?.toJSON() ?? null,
          hitClass: hit instanceof HTMLElement ? hit.className : null,
          switcherClass: switcher?.className ?? null,
          description:
            unrenderable?.querySelector('.empty-state-description')
              ?.textContent ?? null,
        }
      })()`)
      )
    }
  }
  if (!selectionSettled) {
    fail(
      `The verified Cheap LFS row did not settle after 3 pointer attempts: ${JSON.stringify(
        pointerFailureReceipts
      )}`
    )
  }
  await new Promise(resolve => setTimeout(resolve, 500))

  // The repository watcher can replace the selection object between two
  // consecutive frames even though the same large-file diff remains rendered.
  // The final surface receipt independently re-proves the settled switcher,
  // unrenderable large-file panel, description, geometry, and spinner state.
  // Avoid rejecting that stronger end-state proof on an intermediate object
  // identity rebound.

  const restored = await evaluate(`(() => {
    const root = document.querySelector('#desktop-app-container')
    const nodes = root ? [root, ...root.querySelectorAll('*')] : []
    let appStore = null
    for (const node of nodes) {
      const fiberKey = Object.keys(node).find(key =>
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$')
      )
      let fiber = fiberKey ? node[fiberKey] : null
      for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
        if (fiber.stateNode?.props?.appStore) {
          appStore = fiber.stateNode.props.appStore
          break
        }
      }
      if (appStore !== null) break
    }
    const repository = appStore?.selectedRepository ?? null
    if (appStore === null || repository === null) return null
    appStore.repositoryStateCache.update(repository, () => ({ isCommitting: true }))
    appStore.emitUpdate()
    const current = appStore.repositoryStateCache.get(repository)
    return {
      isCommitting: current.isCommitting,
      operationSnapshot: JSON.stringify(current.commitOperationPhase),
      selectedFileIDs: current.changesState.selection.selectedFileIDs ?? null,
    }
  })()`)
  if (
    restored?.isCommitting !== true ||
    restored.operationSnapshot !== released.operationSnapshot
  ) {
    fail(
      `Synthetic Cheap LFS progress was not restored unchanged: ${JSON.stringify(
        restored
      )}`
    )
  }
  await waitFor(
    `(${selectionExpression}) && (() => {
      const root = document.querySelector('#desktop-app-container')
      const nodes = root ? [root, ...root.querySelectorAll('*')] : []
      for (const node of nodes) {
        const fiberKey = Object.keys(node).find(key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
        )
        let fiber = fiberKey ? node[fiberKey] : null
        for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
          const appStore = fiber.stateNode?.props?.appStore
          const repository = appStore?.selectedRepository ?? null
          if (appStore && repository) {
            const current = appStore.repositoryStateCache.get(repository)
            return current.isCommitting === true &&
              JSON.stringify(current.commitOperationPhase) === ${JSON.stringify(
                released.operationSnapshot
              )}
          }
        }
      }
      return false
    })()`,
    'selection and large-file diff after Cheap LFS progress restore'
  )

  return {
    candidateId: released.candidateId,
    pointer: target,
    pointerAttempts,
    selectionClearedBeforePointer: released.selectionCleared,
    selectedFileIDs: restored.selectedFileIDs,
    operationRestoredUnchanged: true,
    settledDiffSurface: 'unrenderable-over-receive-limit',
    unrenderableDiffSettled: true,
  }
}

async function showFilterChips() {
  await waitFor(
    `document.querySelector('.filter-button') instanceof HTMLButtonElement`,
    'Changes filter button'
  )
  const opened = await evaluate(`(() => {
    if (document.querySelector('.changes-filter-chips') !== null) return true
    const button = document.querySelector('.filter-button')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  if (!opened) {
    fail('Changes filter chips could not be opened.')
  }
  await waitFor(
    `document.querySelector('.changes-filter-chips') !== null`,
    'Changes filter chip row'
  )
  await waitFor(
    `(() => {
      const chips = [...document.querySelectorAll('.changes-filter-chip')]
      const chip = chips.find(value => (value.textContent ?? '').includes('100 MiB'))
      const count = Number(chip?.querySelector('.chip-count')?.textContent ?? 'NaN')
      return chip?.getAttribute('aria-pressed') === 'true' &&
        Number.isFinite(count) && count === ${FixtureFiles.length}
    })()`,
    'active large-file filter and size inventory',
    45_000
  )
}

async function settleCaptureSurface() {
  const fontReceipt = await evaluate(`(async () => {
    const requested = [
      { family: 'Roboto', descriptor: '400 12px Roboto', sample: 'Upload' },
      { family: 'Roboto Mono', descriptor: '400 11px "Roboto Mono"', sample: '53%' },
      { family: 'Material Symbols Rounded', descriptor: '400 16px "Material Symbols Rounded"', sample: 'check' },
    ]
    const faces = []
    for (const font of requested) {
      const loaded = await document.fonts.load(font.descriptor, font.sample)
      faces.push({
        family: font.family,
        count: loaded.length,
        loaded: document.fonts.check(font.descriptor, font.sample),
      })
    }
    await document.fonts.ready
    let style = document.querySelector('style[data-cheap-lfs-progress-verification]')
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style')
      style.setAttribute('data-cheap-lfs-progress-verification', 'true')
      style.textContent = '*,:before,:after{animation:none!important;transition:none!important;caret-color:transparent!important}'
      document.head.appendChild(style)
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    return new Promise(resolve => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve({
        status: document.fonts.status,
        faces,
        styleInstalled: style.isConnected,
      }))
    ))
  })()`)
  if (
    fontReceipt?.status !== 'loaded' ||
    fontReceipt.styleInstalled !== true ||
    fontReceipt.faces?.length !== 3 ||
    fontReceipt.faces.some(face => face.count < 1 || face.loaded !== true)
  ) {
    fail(`Bundled capture fonts did not settle: ${JSON.stringify(fontReceipt)}`)
  }
  return fontReceipt
}

async function frameCaptureSurface() {
  // Repository status hydration can finish one last render after fonts settle,
  // especially after a language-mode reload. Require the requested frame to
  // remain stable for one polling interval, then apply it once more immediately
  // before inspection so a persisted scroll restore cannot win the race.
  const applyFrameExpression = `(() => {
    const panel = document.querySelector('#repository-sidebar .panel')
    const chips = [...document.querySelectorAll('.changes-filter-chip')]
    const requiredChips = [
      chips.find(value => (value.textContent ?? '').includes('Included in commit')),
      chips.find(value => (value.textContent ?? '').includes('Excluded')),
      chips.find(value => (value.textContent ?? '').includes('100 MiB')),
    ]
    const terminal = document.querySelector('.cheap-lfs-mini-terminal')
    const progressSurface = terminal?.closest('.cheap-lfs-progress')
    if (
      !(panel instanceof HTMLElement) ||
      requiredChips.some(value => !(value instanceof HTMLElement)) ||
      !(terminal instanceof HTMLElement) ||
      !(progressSurface instanceof HTMLElement)
    ) {
      return null
    }
    panel.scrollTop = 0
    const panelRect = panel.getBoundingClientRect()
    const progressSurfaceRect = progressSurface.getBoundingClientRect()
    const requiredRects = requiredChips.map(value => value.getBoundingClientRect())
    const desiredScroll = Math.ceil(Math.max(
      0,
      progressSurfaceRect.bottom - panelRect.bottom + 2
    ))
    const maxScroll = Math.floor(
      Math.min(...requiredRects.map(value => value.top)) - panelRect.top - 4
    )
    const feasible = desiredScroll <= maxScroll
    if (feasible) panel.scrollTop = desiredScroll
    const undo = document.querySelector('#undo-commit')
    return {
      scrollTop: panel.scrollTop,
      desiredScroll,
      maxScroll,
      feasible,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      requiredChipRects: requiredChips.map(value => {
        const bounds = value.getBoundingClientRect()
        return { top: bounds.top, bottom: bounds.bottom }
      }),
      terminalBottom: terminal.getBoundingClientRect().bottom,
      progressBottom: progressSurface.getBoundingClientRect().bottom,
      undoTop:
        undo instanceof HTMLElement ? undo.getBoundingClientRect().top : innerHeight,
    }
  })()`
  const inspectFrameExpression = `(() => {
    const panel = document.querySelector('#repository-sidebar .panel')
    const chips = [...document.querySelectorAll('.changes-filter-chip')]
    const requiredChips = [
      chips.find(value => (value.textContent ?? '').includes('Included in commit')),
      chips.find(value => (value.textContent ?? '').includes('Excluded')),
      chips.find(value => (value.textContent ?? '').includes('100 MiB')),
    ]
    const terminal = document.querySelector('.cheap-lfs-mini-terminal')
    const progressSurface = terminal?.closest('.cheap-lfs-progress')
    if (
      !(panel instanceof HTMLElement) ||
      requiredChips.some(value => !(value instanceof HTMLElement)) ||
      !(terminal instanceof HTMLElement) ||
      !(progressSurface instanceof HTMLElement)
    ) {
      return null
    }
    const panelRect = panel.getBoundingClientRect()
    const undo = document.querySelector('#undo-commit')
    return {
      scrollTop: panel.scrollTop,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      requiredChipRects: requiredChips.map(value => {
        const bounds = value.getBoundingClientRect()
        return { top: bounds.top, bottom: bounds.bottom }
      }),
      terminalBottom: terminal.getBoundingClientRect().bottom,
      progressBottom: progressSurface.getBoundingClientRect().bottom,
      undoTop:
        undo instanceof HTMLElement ? undo.getBoundingClientRect().top : innerHeight,
    }
  })()`
  const isValid = receipt =>
    receipt !== null &&
    receipt.feasible !== false &&
    receipt.requiredChipRects.every(
      value =>
        value.top >= receipt.panelTop + 3 &&
        value.bottom <= receipt.panelBottom - 3
    ) &&
    receipt.terminalBottom <= receipt.panelBottom - 2 &&
    receipt.progressBottom <= receipt.panelBottom - 2 &&
    receipt.undoTop >= receipt.panelBottom - 1

  let lastReceipt = null
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250))
    const applied = await evaluate(applyFrameExpression)
    await new Promise(resolve => setTimeout(resolve, 250))
    const stable = await evaluate(inspectFrameExpression)
    lastReceipt = { attempt: attempt + 1, applied, stable }
    if (
      isValid(applied) &&
      isValid(stable) &&
      Math.abs(applied.scrollTop - stable.scrollTop) <= 1
    ) {
      const finalReceipt = await evaluate(applyFrameExpression)
      if (isValid(finalReceipt)) {
        return { ...lastReceipt, final: finalReceipt }
      }
    }
  }
  fail(
    `Could not keep the filter and terminal frame stable: ${JSON.stringify(
      lastReceipt
    )}`
  )
}

function inspectionExpression(options, hydration, fontReceipt) {
  // String.raw is intentional: this evaluated program contains regular
  // expressions and escaped newlines whose backslashes must reach Chromium.
  return String.raw`(() => {
    const rect = element => {
      const value = element.getBoundingClientRect()
      return {
        left: Math.round(value.left),
        top: Math.round(value.top),
        right: Math.round(value.right),
        bottom: Math.round(value.bottom),
        width: Math.round(value.width),
        height: Math.round(value.height),
      }
    }
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0
    }
    const within = (inner, outer) =>
      inner.left >= outer.left - 1 && inner.top >= outer.top - 1 &&
      inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1
    const viewport = {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
    }
    const clippingAncestors = element => {
      const target = element.getBoundingClientRect()
      const clipped = []
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        const clipsX = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowX)
        const clipsY = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowY)
        if (!clipsX && !clipsY) continue
        const bounds = parent.getBoundingClientRect()
        if (
          (clipsX && (target.left < bounds.left - 1 || target.right > bounds.right + 1)) ||
          (clipsY && (target.top < bounds.top - 1 || target.bottom > bounds.bottom + 1))
        ) {
          clipped.push({
            className: parent.className?.toString().slice(0, 120) ?? '',
            overflowX: style.overflowX,
            overflowY: style.overflowY,
          })
        }
      }
      return clipped
    }

    const commit = document.querySelector('.commit-button')
    const progress = document.querySelector('.commit-progress.cheap-lfs-progress')
    const terminal = document.querySelector('.cheap-lfs-mini-terminal')
    const terminalBody = document.querySelector('.cheap-lfs-mini-terminal-body')
    const progressbar = document.querySelector(
      '.cheap-lfs-terminal-progress[role="progressbar"]'
    )
    const progressFill = progressbar?.firstElementChild
    const activeRows = [...document.querySelectorAll(
      '.cheap-lfs-terminal-active-file[role="listitem"]'
    )]
    const panel = document.querySelector('#repository-sidebar .panel')
    const filterList = document.querySelector('.filtered-changes-list')
    const filterRow = document.querySelector('.filter-field-row')
    const filterGroup = document.querySelector('.changes-filter-chips')
    const chips = [...document.querySelectorAll('.changes-filter-chip')]
    const includedChip = chips.find(value =>
      (value.textContent ?? '').includes('Included in commit'))
    const excludedChip = chips.find(value =>
      (value.textContent ?? '').includes('Excluded'))
    const candidateChip = chips.find(value =>
      (value.textContent ?? '').includes('100 MiB'))
    const regexChip = document.querySelector('.changes-regex-builder-chip')
    const stash = document.querySelector('.stashed-changes-section.stash-manager')
    const hiddenChangesWarning = document.querySelector('.hidden-changes-warning')
    const warningMessage = document.querySelector('.hidden-changes-warning-message')
    const composer = document.querySelector('.commit-message-component')
    const summary = document.querySelector('.summary-field input')
    const description = document.querySelector('#commit-message-description')
    const recommendation = terminal.querySelector('.cheap-lfs-terminal-path')
    const manual = progress.querySelector('.cheap-lfs-action:not(.cheap-lfs-cancel)')
    const cancel = progress.querySelector('.cheap-lfs-cancel')
    const switcher = document.querySelector('.diff-container .seamless-diff-switcher')
    const spinner = document.querySelector('.diff-container .loading-indicator')
    const unrenderableDiff = document.querySelector(
      '.diff-container .panel.empty.large-diff'
    )
    const unrenderableDescription = unrenderableDiff?.querySelector(
      '.empty-state-description'
    )
    const diff = unrenderableDiff?.closest('.diff-container')
    const undo = document.querySelector('#undo-commit')
    if (
      !(commit instanceof HTMLElement) ||
      !(progress instanceof HTMLElement) ||
      !(terminal instanceof HTMLElement) ||
      !(terminalBody instanceof HTMLElement) ||
      !(progressbar instanceof HTMLElement) ||
      !(progressFill instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(filterList instanceof HTMLElement) ||
      !(filterRow instanceof HTMLElement) ||
      !(filterGroup instanceof HTMLElement) ||
      !(includedChip instanceof HTMLElement) ||
      !(excludedChip instanceof HTMLElement) ||
      !(candidateChip instanceof HTMLElement) ||
      !(regexChip instanceof HTMLElement) ||
      !(stash instanceof HTMLElement) ||
      !(hiddenChangesWarning instanceof HTMLElement) ||
      !(warningMessage instanceof HTMLElement) ||
      !(composer instanceof HTMLElement) ||
      !(summary instanceof HTMLElement) ||
      !(description instanceof HTMLElement) ||
      !(recommendation instanceof HTMLElement) ||
      !(manual instanceof HTMLElement) ||
      !(cancel instanceof HTMLElement) ||
      !(switcher instanceof HTMLElement) ||
      !(unrenderableDiff instanceof HTMLElement) ||
      !(unrenderableDescription instanceof HTMLElement) ||
      !(diff instanceof HTMLElement)
    ) {
      throw new Error('A required Cheap LFS verification surface is missing.')
    }

    const panelRect = panel.getBoundingClientRect()
    const filterListRect = filterList.getBoundingClientRect()
    const filterGroupRect = filterGroup.getBoundingClientRect()
    const stashRect = stash.getBoundingClientRect()
    const warningRect = hiddenChangesWarning.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    const terminalRect = terminal.getBoundingClientRect()
    const commitRect = commit.getBoundingClientRect()
    const progressSurfaceRect = progress.getBoundingClientRect()
    const progressRect = progressbar.getBoundingClientRect()
    const fillRect = progressFill.getBoundingClientRect()
    const filterRowRect = filterRow.getBoundingClientRect()
    const hiddenChangesWarningRect = hiddenChangesWarning.getBoundingClientRect()
    const diffRect = diff.getBoundingClientRect()
    const requiredChips = [includedChip, excludedChip, candidateChip]
    const noIntersection = (left, right) =>
      left.right <= right.left + 1 || right.right <= left.left + 1 ||
      left.bottom <= right.top + 1 || right.bottom <= left.top + 1
    const terminalText = terminal.innerText
    const terminalAttributes = [...terminal.querySelectorAll('[title], [aria-label], [aria-valuetext]')]
      .flatMap(element => [
        element.getAttribute('title') ?? '',
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('aria-valuetext') ?? '',
      ])
      .join('')
    const visibleElements = [...document.querySelectorAll('body *')].filter(visible)
    const privacyCorpus = visibleElements
      .flatMap(element => [
        element instanceof HTMLElement ? element.innerText : '',
        element.getAttribute('title') ?? '',
        element.getAttribute('aria-label') ?? '',
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : '',
      ])
      .join('\n')
    const candidateCount = Number(
      candidateChip.querySelector('.chip-count')?.textContent ?? 'NaN'
    )
    const rowReceipts = activeRows.map(row => {
      const rowRect = row.getBoundingClientRect()
      const pathElement = row.querySelector('.cheap-lfs-terminal-active-path')
      const detailElement = row.querySelector('.cheap-lfs-terminal-active-detail')
      return {
        worker: row.querySelector('.cheap-lfs-terminal-worker')?.textContent?.trim() ?? '',
        path: pathElement?.textContent?.trim() ?? '',
        detail: detailElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        geometry: rect(row),
        withinTerminal: within(rowRect, terminalRect),
        clippedByAncestor: clippingAncestors(row),
        pathOverflow:
          pathElement instanceof HTMLElement
            ? {
                overflow: getComputedStyle(pathElement).overflow,
                textOverflow: getComputedStyle(pathElement).textOverflow,
                whiteSpace: getComputedStyle(pathElement).whiteSpace,
              }
            : null,
      }
    })
    const detailsText =
      terminal.querySelector('.cheap-lfs-terminal-details')?.textContent
        ?.replace(/\s+/g, ' ')
        .trim() ?? ''
    const expectedPaths = ${JSON.stringify(ExpectedSanitizedPaths)}
    const expectedPercentages = ['45%', '66%', '75%']
    const forbiddenOutput =
      /(authorization:|bearer\s|github_pat_|ghp_|[?&](token|access_token)=|https?:\/\/api\.github)/i
    const privateOutput =
      /(C:\\Users\\|C:\/Users\/|ADMINI~1|AppData[\\/]|(?:^|[\\/])Temp[\\/]|desktop-material-cheap-lfs-progress-)/i
    const controlOutput = /[\u0000-\u001f\u007f-\u009f]/
    const valueText = progressbar.getAttribute('aria-valuetext') ?? ''
    const bottomSurfaces = [...document.querySelectorAll(
      '#undo-commit,dialog[open],[role="dialog"],.regex-builder-dialog,.popover,.stash-manager-panel'
    )]
      .filter(visible)
      .map(value => ({ element: value, bounds: value.getBoundingClientRect() }))
      .filter(value =>
        value.bounds.top < panelRect.bottom - 1 &&
        value.bounds.bottom > panelRect.bottom + 1)
    const blockingDialogs = [...document.querySelectorAll('dialog[open],[role="dialog"]')]
      .filter(visible)
    const assertions = {
      requestedViewport:
        innerWidth === ${options.specification.width} &&
        innerHeight === ${options.specification.height} &&
        devicePixelRatio === 1,
      darkTheme:
        document.body.classList.contains('theme-dark') &&
        localStorage.getItem('theme') === 'dark',
      requestedLanguage:
        document.body.getAttribute('data-dm-language-mode') === ${JSON.stringify(
          options.specification.languageMode
        )} &&
        localStorage.getItem('language-mode-v1') === ${JSON.stringify(
          options.specification.languageMode
        )},
      terminalVisible: visible(terminal),
      terminalDirectlyBelowCommit:
        commit.nextElementSibling === progress &&
        progress.firstElementChild === terminal &&
        terminalRect.top >= commitRect.bottom - 1,
      terminalWithinViewport: within(terminalRect, viewport),
      terminalNotClipped:
        clippingAncestors(terminal).length === 0 &&
        terminal.scrollWidth <= terminal.clientWidth + 1 &&
        terminalBody.scrollWidth <= terminalBody.clientWidth + 1,
      exactlyThreeActiveRows: activeRows.length === 3,
      activeRowsContained:
        rowReceipts.every(row => row.withinTerminal && row.clippedByAncestor.length === 0),
      activePathsSanitized:
        JSON.stringify(rowReceipts.map(row => row.path)) ===
          JSON.stringify(expectedPaths) &&
        !controlOutput.test(rowReceipts.map(row => row.path).join('')),
      overflowWorkerSuppressed:
        !terminalText.includes(${JSON.stringify(OverflowWorkerCanary)}) &&
        !terminalAttributes.includes(${JSON.stringify(OverflowWorkerCanary)}),
      distinctPerFileProgress:
        expectedPercentages.every((percentage, index) =>
          rowReceipts[index]?.detail.includes(percentage)
        ) && new Set(rowReceipts.map(row => row.detail)).size === 3,
      detailedSettledCounts:
        detailsText.includes('4/8') &&
        /(?:pinned|pin 咗)\s*3/i.test(detailsText) &&
        /(?:failed|失手)\s*1/i.test(detailsText),
      detailedBytes: detailsText.includes('/') && detailsText.includes('53%'),
      progressSemantics:
        progressbar.getAttribute('aria-valuemin') === '0' &&
        progressbar.getAttribute('aria-valuemax') === '100' &&
        progressbar.getAttribute('aria-valuenow') === ${JSON.stringify(
          ExpectedOverallPercentage.toString()
        )} &&
        valueText.includes('4/8') && valueText.includes('53%'),
      progressFillMatchesValue:
        progressRect.width > 0 &&
        Math.abs(fillRect.width / progressRect.width - ${
          ExpectedOverallPercentage / 100
        }) < 0.025,
      liveStatusSemantics:
        terminal.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]') !== null,
      filterGroupVisible: visible(filterGroup),
      requiredFilterChipsVisibleAndContained:
        requiredChips.every(value =>
          visible(value) &&
          within(value.getBoundingClientRect(), panelRect) &&
          within(value.getBoundingClientRect(), filterGroupRect) &&
          clippingAncestors(value).length === 0 &&
          value.scrollWidth <= value.clientWidth + 1),
      regexBuilderVisibleAndContained:
        visible(regexChip) &&
        within(regexChip.getBoundingClientRect(), panelRect) &&
        within(regexChip.getBoundingClientRect(), filterGroupRect) &&
        clippingAncestors(regexChip).length === 0,
      largeFileFilterVisibleAndActive:
        visible(candidateChip) &&
        candidateChip.getAttribute('aria-pressed') === 'true' &&
        candidateCount === ${FixtureFiles.length} &&
        within(candidateChip.getBoundingClientRect(), viewport) &&
        clippingAncestors(candidateChip).length === 0,
      filterControlsClearHiddenChangesWarning:
        visible(hiddenChangesWarning) &&
        filterRowRect.bottom <= hiddenChangesWarningRect.top + 1,
      filterStashWarningComposerSequential:
        filterListRect.bottom <= stashRect.top + 1 &&
        stashRect.bottom <= warningRect.top + 1 &&
        warningRect.bottom <= composerRect.top + 1,
      filterStashWarningComposerNoIntersections:
        noIntersection(filterListRect, stashRect) &&
        noIntersection(stashRect, warningRect) &&
        noIntersection(warningRect, composerRect),
      warningContainedAndWrapped:
        visible(hiddenChangesWarning) &&
        within(warningRect, panelRect) &&
        clippingAncestors(hiddenChangesWarning).length === 0 &&
        hiddenChangesWarning.scrollWidth <= hiddenChangesWarning.clientWidth + 1 &&
        warningMessage.scrollWidth <= warningMessage.clientWidth + 1,
      commitControlsContained:
        [summary, description, commit].every(value =>
          visible(value) &&
          within(value.getBoundingClientRect(), composerRect) &&
          within(value.getBoundingClientRect(), panelRect) &&
          clippingAncestors(value).length === 0),
      recommendationVisibleAndContained:
        visible(recommendation) &&
        within(recommendation.getBoundingClientRect(), terminalRect) &&
        clippingAncestors(recommendation).length === 0 &&
        /(?:recommended|建議)/i.test(recommendation.textContent ?? ''),
      terminalAndActionsContained:
        visible(terminal) &&
        within(terminalRect, progressSurfaceRect) &&
        within(progressSurfaceRect, composerRect) &&
        within(progressSurfaceRect, panelRect) &&
        clippingAncestors(terminal).length === 0 &&
        [manual, cancel].every(value =>
          visible(value) &&
          within(value.getBoundingClientRect(), progressSurfaceRect) &&
          within(value.getBoundingClientRect(), panelRect) &&
          clippingAncestors(value).length === 0),
      mainPaneSettledUnrenderableLargeFileDiff:
        visible(diff) &&
        visible(switcher) &&
        switcher.classList.contains('has-diff') &&
        !switcher.classList.contains('loading') &&
        !(spinner instanceof HTMLElement && visible(spinner)) &&
        visible(unrenderableDiff) &&
        (unrenderableDescription.textContent ?? '').trim() ===
          'The diff is too large to be displayed.' &&
        within(unrenderableDiff.getBoundingClientRect(), diffRect) &&
        within(diffRect, viewport),
      undoPanelExcluded:
        !(undo instanceof HTMLElement) || undo.getBoundingClientRect().top >= panelRect.bottom - 1,
      noPartialBottomSurface: bottomSurfaces.length === 0,
      noBlockingDialog: blockingDialogs.length === 0,
      documentHasNoHorizontalOverflow:
        document.documentElement.scrollWidth === document.documentElement.clientWidth &&
        document.body.scrollWidth === document.body.clientWidth,
      noRawProviderOrCredentialOutput:
        !forbiddenOutput.test(terminalText) &&
        !forbiddenOutput.test(terminalAttributes),
      noPrivatePathInVisibleCapture: !privateOutput.test(privacyCorpus),
      noExecutableMarkup: terminal.querySelector('script, iframe, object, embed') === null,
    }

    return {
      schemaVersion: 1,
      scenario: ${JSON.stringify(options.scenario)},
      appearance: {
        theme: document.body.classList.contains('theme-dark') ? 'dark' : null,
        persistedTheme: localStorage.getItem('theme'),
        languageMode: document.body.getAttribute('data-dm-language-mode'),
        persistedLanguageMode: localStorage.getItem('language-mode-v1'),
      },
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      },
      hydration: ${JSON.stringify(hydration)},
      fonts: ${JSON.stringify(fontReceipt)},
      terminal: {
        geometry: rect(terminal),
        commitGeometry: rect(commit),
        clippingAncestors: clippingAncestors(terminal),
        activeRows: rowReceipts,
        detailsText,
        progress: {
          label: progressbar.getAttribute('aria-label'),
          minimum: progressbar.getAttribute('aria-valuemin'),
          maximum: progressbar.getAttribute('aria-valuemax'),
          value: progressbar.getAttribute('aria-valuenow'),
          valueText,
          fillRatio: progressRect.width > 0 ? fillRect.width / progressRect.width : null,
        },
      },
      largeFileFilter: {
        text: candidateChip.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        count: candidateCount,
        pressed: candidateChip.getAttribute('aria-pressed'),
        geometry: rect(candidateChip),
      },
      filterLayout: {
        panelGeometry: rect(panel),
        filterListGeometry: rect(filterList),
        filterGroupGeometry: rect(filterGroup),
        requiredChipGeometry: requiredChips.map(rect),
        regexBuilderGeometry: rect(regexChip),
        stashGeometry: rect(stash),
        filterRowGeometry: rect(filterRow),
        hiddenChangesWarningGeometry: rect(hiddenChangesWarning),
        composerGeometry: rect(composer),
        progressSurfaceGeometry: rect(progress),
        undoGeometry: undo instanceof HTMLElement ? rect(undo) : null,
        bottomSurfaces: bottomSurfaces.map(value => ({
          className: value.element.className?.toString() ?? '',
          geometry: rect(value.element),
        })),
      },
      mainPane: {
        diffGeometry: rect(diff),
        unrenderableGeometry: rect(unrenderableDiff),
        description: (unrenderableDescription.textContent ?? '').trim(),
        switcherClassName: switcher.className,
        spinnerVisible: spinner instanceof HTMLElement && visible(spinner),
      },
      assertions,
    }
  })()`
}

async function inspectSurface(options, hydration, fontReceipt) {
  return await evaluate(inspectionExpression(options, hydration, fontReceipt))
}

function validateSurfaceReceipt(receipt, specification) {
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.viewport?.width !== specification.width ||
    receipt.viewport?.height !== specification.height ||
    receipt.appearance?.theme !== 'dark' ||
    receipt.appearance?.languageMode !== specification.languageMode
  ) {
    fail('Cheap LFS receipt header diverged from the requested scenario.')
  }
  const assertions = receipt.assertions
  if (assertions === null || typeof assertions !== 'object') {
    fail('Cheap LFS receipt has no assertion map.')
  }
  const failures = Object.entries(assertions)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
  if (failures.length > 0) {
    fail(
      `Cheap LFS progress UI gate failed (${failures.join(
        ', '
      )}): ${JSON.stringify(receipt)}`
    )
  }
  return receipt
}

function pngDimensions(buffer) {
  if (
    buffer.byteLength < 24 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail('CDP capture was not a valid PNG.')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function captureOriginalPixels(options) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const buffer = Buffer.from(result.data, 'base64')
  const dimensions = pngDimensions(buffer)
  if (
    dimensions.width !== options.specification.width ||
    dimensions.height !== options.specification.height
  ) {
    fail(
      `Capture dimensions were ${dimensions.width}x${dimensions.height}, expected ${options.specification.width}x${options.specification.height}.`
    )
  }
  if (buffer.byteLength < 20_000) {
    fail('Capture is suspiciously small and may be blank.')
  }
  fs.writeFileSync(options.capturePath, buffer, { flag: 'wx' })
  return {
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const owned = validateOwnedPaths(options)
  prepareDisposableFixture(owned.repositoryPath)

  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await preparePresentation(options.specification)
    await acceptCliOpenReview()
    await dismissPausedCloneQueueDialog()
    await showChanges()
    const hydration = await hydrateAppState(owned.repositoryPath)
    await dismissPausedCloneQueueDialog()
    await waitFor(
      `document.querySelector('.cheap-lfs-mini-terminal') !== null`,
      'Cheap LFS mini terminal'
    )
    await showFilterChips()
    const selection = await selectVisibleLargeFileWithPointer()
    const fontReceipt = await settleCaptureSurface()
    await frameCaptureSurface()
    const surfaceReceipt = validateSurfaceReceipt(
      await inspectSurface(options, hydration, fontReceipt),
      options.specification
    )
    const capture = await captureOriginalPixels(options)
    const receipt = { ...surfaceReceipt, selection, capture }
    fs.writeFileSync(
      options.receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      {
        flag: 'wx',
      }
    )
    process.stdout.write(
      `CHEAP_LFS_PROGRESS_RECEIPT ${JSON.stringify(receipt)}\n`
    )
  } finally {
    client.close()
  }
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(error ?? 'Unknown Cheap LFS verifier error.')
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  ExpectedOverallPercentage,
  ExpectedSanitizedPaths,
  FixtureFiles,
  ScenarioSpecifications,
  inspectionExpression,
  isContainedPath,
  parseArguments,
  validateSurfaceReceipt,
}
