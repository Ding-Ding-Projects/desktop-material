#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- synchronous paths are bounded to caller-owned Temp output */

/**
 * Deterministic app-wide Cheap LFS restore-progress verifier (CDP attach only).
 *
 * The caller owns the already-running production Electron renderer, loopback
 * CDP port, hidden Win32 desktop, isolated user-data directory, disposable Git
 * repository, and process/desktop cleanup. This helper never launches, focuses,
 * resizes, or terminates anything. It attaches to that renderer, publishes a
 * rich restore snapshot through the real AppStore, captures original Chromium
 * pixels, emits a strict JSON receipt, and clears the snapshot before it
 * disconnects.
 *
 * Wide English:
 *   node .codex/verification/verify_cheap_lfs_restore_progress_cdp.js \
 *     --port 9337 \
 *     --run-root %TEMP%\desktop-material-cheap-lfs-restore-progress-<run-id> \
 *     --repository-path %TEMP%\desktop-material-cheap-lfs-restore-progress-<run-id>\fixture \
 *     --scenario wide \
 *     --capture %TEMP%\desktop-material-cheap-lfs-restore-progress-<run-id>\captures\wide.png \
 *     --receipt %TEMP%\desktop-material-cheap-lfs-restore-progress-<run-id>\receipts\wide.json
 *
 * Narrow bilingual:
 *   node .codex/verification/verify_cheap_lfs_restore_progress_cdp.js \
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
const ExpectedOverallPercentage = 60
const ExpectedCurrentLanePercentage = 90
const ExpectedPrefetchLanePercentage = 10
const CurrentLanePath = 'models/portrait-weights.bin'
const PrefetchLanePath = 'textures/city-pack.zip'

const ExpectedAssertionNames = Object.freeze([
  'requestedViewport',
  'darkTheme',
  'requestedLanguage',
  'productionRenderer',
  'appWideCardMounted',
  'cardVisibleAndContained',
  'materialThreeSurface',
  'materialSymbolsLoaded',
  'singlePoliteLiveSummary',
  'sectionAccessibility',
  'progressbarAccessibility',
  'overallCountersExact',
  'detailedTransferCounters',
  'exactNinetyPercentBoundary',
  'prefetchLaneActive',
  'laneCountersExact',
  'lookAheadThresholdExplained',
  'lanesVisibleAndContained',
  'lanesDoNotOverlap',
  'visibleContentNotClipped',
  'intentionalVerticalScrollOnly',
  'cancelControlAccessible',
  'failureDetailBounded',
  'reducedMotionHonored',
  'noBlockingDialog',
  'noHorizontalDocumentOverflow',
  'noPrivatePathOrCredentialOutput',
  'noExecutableMarkup',
])

function restoreProgressFixture(
  repositoryId = 17,
  repositoryName = 'cheap-lfs-restore-fixture'
) {
  return {
    repositoryId,
    repositoryName,
    provider: 'mixed',
    phase: 'downloading',
    filesSucceeded: 2,
    filesFailed: 1,
    filesRemaining: 5,
    filesTotal: 8,
    logicalProcessedBytes: 600 * MiB,
    logicalTotalBytes: 1000 * MiB,
    actualDownloadedBytes: 432 * MiB,
    actualDownloadTotalBytes: 720 * MiB,
    downloadRateBytesPerSecond: 12.5 * MiB,
    etaSeconds: 23,
    elapsedSeconds: 77,
    queuedFiles: 3,
    queuedParts: 7,
    currentLane: {
      provider: 'github-release',
      phase: 'downloading',
      relativePath: CurrentLanePath,
      fileOrdinal: 3,
      filesTotal: 8,
      partOrdinal: 4,
      partsTotal: 5,
      processedBytes: 90 * MiB,
      totalBytes: 100 * MiB,
      percent: ExpectedCurrentLanePercentage,
    },
    prefetchLane: {
      provider: 'ghcr',
      phase: 'downloading',
      relativePath: PrefetchLanePath,
      fileOrdinal: 4,
      filesTotal: 8,
      partOrdinal: 1,
      partsTotal: 3,
      processedBytes: 8 * MiB,
      totalBytes: 80 * MiB,
      percent: ExpectedPrefetchLanePercentage,
    },
    lookAheadThresholdPercent: ExpectedCurrentLanePercentage,
    failures: [
      {
        relativePath: 'archives/legacy-export.tar',
        reason: 'Provider returned a temporary response; retry remains queued.',
        statusCode: 503,
      },
    ],
    cancelRequested: false,
  }
}

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
    const normalizedName = name.slice(2)
    if (values.has(normalizedName)) {
      fail(`Duplicate argument ${name}.`)
    }
    values.set(normalizedName, value)
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
    !/^desktop-material-cheap-lfs-restore-progress-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/.test(
      path.basename(runRoot)
    )
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-cheap-lfs-restore-progress-*.'
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
    userGesture: false,
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
      'renderer presentation reload'
    )
    await waitFor(
      `document.querySelector('#desktop-app-container') !== null`,
      'Desktop Material after presentation reload'
    )
  }

  await evaluate(`require('electron').webFrame.setZoomFactor(1), true`)
  await client.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [
      {
        name: 'prefers-reduced-motion',
        value: 'reduce',
      },
    ],
  })
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
    `(() =>
      document.body.classList.contains('theme-dark') &&
      localStorage.getItem('theme') === 'dark' &&
      document.body.getAttribute('data-dm-language-mode') === ${JSON.stringify(
        specification.languageMode
      )} &&
      document.documentElement.getAttribute('data-language-mode') === ${JSON.stringify(
        specification.languageMode
      )} &&
      matchMedia('(prefers-reduced-motion: reduce)').matches &&
      innerWidth === ${specification.width} &&
      innerHeight === ${specification.height}
    )()`,
    'requested dark appearance, language, reduced motion, and viewport'
  )
}

function appStoreFinderSource() {
  return `() => {
    const root = document.querySelector('#desktop-app-container')
    const nodes = root ? [root, ...root.querySelectorAll('*')] : []
    for (const node of nodes) {
      const fiberKey = Object.keys(node).find(key =>
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$')
      )
      let fiber = fiberKey ? node[fiberKey] : null
      for (let depth = 0; fiber && depth < 180; depth += 1, fiber = fiber.return) {
        if (
          fiber.stateNode?.props?.appStore &&
          typeof fiber.stateNode.props.appStore.updateCheapLfsRestore === 'function'
        ) {
          return fiber.stateNode.props.appStore
        }
      }
    }
    return null
  }`
}

async function hydrateAppState(repositoryPath) {
  const fixture = restoreProgressFixture(0, '')
  const receipt = await evaluate(`(() => {
    const findAppStore = ${appStoreFinderSource()}
    const appStore = findAppStore()
    if (appStore === null) return { appStoreFound: false }
    const repository = appStore.selectedRepository
    if (repository === null) {
      return { appStoreFound: true, repositorySelected: false }
    }

    const pathModule = require('path')
    const expectedPath = pathModule.resolve(${JSON.stringify(repositoryPath)})
    const selectedPath = pathModule.resolve(repository.path)
    const repositoryMatched =
      selectedPath.toLowerCase() === expectedPath.toLowerCase()
    if (!repositoryMatched) {
      return {
        appStoreFound: true,
        repositorySelected: true,
        repositoryMatched: false,
      }
    }
    if (
      typeof repository.id !== 'number' ||
      !Number.isSafeInteger(repository.id)
    ) {
      return {
        appStoreFound: true,
        repositorySelected: true,
        repositoryMatched: true,
        repositoryIdentityValid: false,
      }
    }

    const repositoryName =
      typeof repository.name === 'string' && repository.name.trim().length > 0
        ? repository.name
        : pathModule.basename(selectedPath)
    const progress = {
      ...${JSON.stringify(fixture)},
      repositoryId: repository.id,
      repositoryName,
    }
    globalThis.__desktopMaterialCheapLfsRestoreVerificationAppStore = appStore
    appStore.updateCheapLfsRestore(progress)
    const current = appStore.getState().cheapLfsRestore
    return {
      appStoreFound: true,
      repositorySelected: true,
      repositoryMatched: true,
      repositoryIdentityValid: true,
      repositoryId: repository.id,
      repositoryName,
      updateInvoked: true,
      statePublished: current !== null,
      stateRepositoryMatched: current?.repositoryId === repository.id,
      currentLanePercent: current?.currentLane?.percent ?? null,
      currentLaneProcessedBytes: current?.currentLane?.processedBytes ?? null,
      currentLaneTotalBytes: current?.currentLane?.totalBytes ?? null,
      prefetchLanePresent: current?.prefetchLane !== null,
      prefetchLanePercent: current?.prefetchLane?.percent ?? null,
      thresholdPercent: current?.lookAheadThresholdPercent ?? null,
    }
  })()`)

  if (
    receipt?.appStoreFound !== true ||
    receipt.repositorySelected !== true ||
    receipt.repositoryMatched !== true ||
    receipt.repositoryIdentityValid !== true ||
    receipt.updateInvoked !== true ||
    receipt.statePublished !== true ||
    receipt.stateRepositoryMatched !== true ||
    receipt.currentLanePercent !== ExpectedCurrentLanePercentage ||
    receipt.currentLaneProcessedBytes !== 90 * MiB ||
    receipt.currentLaneTotalBytes !== 100 * MiB ||
    receipt.prefetchLanePresent !== true ||
    receipt.prefetchLanePercent !== ExpectedPrefetchLanePercentage ||
    receipt.thresholdPercent !== ExpectedCurrentLanePercentage
  ) {
    fail(
      `App-native Cheap LFS restore hydration failed: ${JSON.stringify(
        receipt
      )}`
    )
  }
  return receipt
}

async function settleAndFrameCard(scenario) {
  await waitFor(
    `document.querySelectorAll(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    ).length === 1`,
    'one app-wide Cheap LFS restore progress card'
  )
  const receipt = await evaluate(`(async () => {
    const card = document.querySelector(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    )
    const lanes = card?.querySelector('.cheap-lfs-restore-lanes')
    if (!(card instanceof HTMLElement) || !(lanes instanceof HTMLElement)) {
      return { cardFound: false }
    }

    await document.fonts.ready
    for (let index = 0; index < 3; index += 1) {
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    }

    const before = {
      scrollTop: card.scrollTop,
      scrollHeight: card.scrollHeight,
      clientHeight: card.clientHeight,
    }
    const cardRect = card.getBoundingClientRect()
    const laneRect = lanes.getBoundingClientRect()
    const desiredScroll =
      card.scrollTop + laneRect.top - cardRect.top - 8
    card.scrollTop = Math.max(
      0,
      Math.min(desiredScroll, card.scrollHeight - card.clientHeight)
    )
    for (let index = 0; index < 3; index += 1) {
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    }

    const current = card.querySelector('.cheap-lfs-restore-lane.current')
    const prefetch = card.querySelector('.cheap-lfs-restore-lane.prefetch')
    return {
      cardFound: true,
      scenario: ${JSON.stringify(scenario)},
      fontsStatus: document.fonts.status,
      before,
      after: {
        scrollTop: card.scrollTop,
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
      },
      currentTop:
        current instanceof HTMLElement
          ? current.getBoundingClientRect().top
          : null,
      prefetchBottom:
        prefetch instanceof HTMLElement
          ? prefetch.getBoundingClientRect().bottom
          : null,
    }
  })()`)
  if (receipt?.cardFound !== true || receipt.fontsStatus !== 'loaded') {
    fail(`Restore progress card did not settle: ${JSON.stringify(receipt)}`)
  }
  return receipt
}

function inspectionExpression(options, hydration, frame) {
  const fixture = restoreProgressFixture(0, '')
  return String.raw`(() => {
    const card = document.querySelector(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    )
    const strip = card?.parentElement
    const header = card?.querySelector('.cheap-lfs-restore-header')
    const badges = card?.querySelector('.cheap-lfs-restore-badges')
    const cancel = card?.querySelector('.cheap-lfs-restore-cancel')
    const summary = card?.querySelector('.cheap-lfs-restore-summary')
    const overall = card?.querySelector(
      '.cheap-lfs-restore-overall [role="progressbar"]'
    )
    const overallFill = overall?.querySelector(':scope > span')
    const lookAhead = card?.querySelector('.cheap-lfs-restore-look-ahead')
    const stats = card?.querySelector('.cheap-lfs-restore-stats')
    const lanes = card?.querySelector('.cheap-lfs-restore-lanes')
    const current = card?.querySelector('.cheap-lfs-restore-lane.current')
    const prefetch = card?.querySelector('.cheap-lfs-restore-lane.prefetch')
    const currentBar = current?.querySelector('[role="progressbar"]')
    const prefetchBar = prefetch?.querySelector('[role="progressbar"]')
    const currentFill = currentBar?.querySelector(':scope > span')
    const prefetchFill = prefetchBar?.querySelector(':scope > span')
    const failures = card?.querySelector('.cheap-lfs-restore-failures')

    if (
      !(card instanceof HTMLElement) ||
      !(strip instanceof HTMLElement) ||
      !(header instanceof HTMLElement) ||
      !(badges instanceof HTMLElement) ||
      !(cancel instanceof HTMLButtonElement) ||
      !(summary instanceof HTMLElement) ||
      !(overall instanceof HTMLElement) ||
      !(overallFill instanceof HTMLElement) ||
      !(lookAhead instanceof HTMLElement) ||
      !(stats instanceof HTMLElement) ||
      !(lanes instanceof HTMLElement) ||
      !(current instanceof HTMLElement) ||
      !(prefetch instanceof HTMLElement) ||
      !(currentBar instanceof HTMLElement) ||
      !(prefetchBar instanceof HTMLElement) ||
      !(currentFill instanceof HTMLElement) ||
      !(prefetchFill instanceof HTMLElement) ||
      !(failures instanceof HTMLElement)
    ) {
      throw new Error('A required app-wide restore progress element is missing.')
    }

    const rect = element => {
      const value = element.getBoundingClientRect()
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      }
    }
    const visible = element => {
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0
      )
    }
    const within = (inner, outer, tolerance = 1) =>
      inner.left >= outer.left - tolerance &&
      inner.top >= outer.top - tolerance &&
      inner.right <= outer.right + tolerance &&
      inner.bottom <= outer.bottom + tolerance
    const fillRatio = (track, fill) => {
      const trackRect = track.getBoundingClientRect()
      const fillRect = fill.getBoundingClientRect()
      return trackRect.width > 0 ? fillRect.width / trackRect.width : null
    }
    const normalizedText = element =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    const hasHorizontalOverflow = element =>
      element.scrollWidth > element.clientWidth + 1
    const opaque = color =>
      color !== 'transparent' &&
      color !== 'rgba(0, 0, 0, 0)' &&
      color !== 'rgba(0,0,0,0)'
    const borderRadius = element =>
      Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
    const noOverlap = (left, right) => {
      const a = left.getBoundingClientRect()
      const b = right.getBoundingClientRect()
      return (
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      )
    }

    const viewport = {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
    }
    const cardRect = card.getBoundingClientRect()
    const stripRect = strip.getBoundingClientRect()
    const lanesRect = lanes.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    const prefetchRect = prefetch.getBoundingClientRect()
    const cardStyle = getComputedStyle(card)
    const currentStyle = getComputedStyle(current)
    const prefetchStyle = getComputedStyle(prefetch)
    const lookAheadStyle = getComputedStyle(lookAhead)
    const progressbars = [...card.querySelectorAll('[role="progressbar"]')]
    const statuses = [...card.querySelectorAll('[role="status"]')]
    const statRows = [...stats.querySelectorAll(':scope > div')]
    const statValues = [...stats.querySelectorAll(':scope > div > dd')]
    const currentMeta =
      current.querySelector('.cheap-lfs-restore-lane-meta')
    const prefetchMeta =
      prefetch.querySelector('.cheap-lfs-restore-lane-meta')
    const currentPercent =
      current.querySelector('.cheap-lfs-restore-lane-percent')
    const prefetchPercent =
      prefetch.querySelector('.cheap-lfs-restore-lane-percent')
    const currentPath =
      current.querySelector('.cheap-lfs-restore-lane-path')
    const prefetchPath =
      prefetch.querySelector('.cheap-lfs-restore-lane-path')
    const summaryText = normalizedText(summary)
    const statsText = normalizedText(stats)
    const lookAheadText = normalizedText(lookAhead)
    const currentMetaText =
      currentMeta instanceof HTMLElement ? normalizedText(currentMeta) : ''
    const prefetchMetaText =
      prefetchMeta instanceof HTMLElement ? normalizedText(prefetchMeta) : ''
    const privacyCorpus = [
      card.innerText,
      ...[...card.querySelectorAll('[aria-label], [aria-valuetext], [title]')]
        .flatMap(element => [
          element.getAttribute('aria-label') ?? '',
          element.getAttribute('aria-valuetext') ?? '',
          element.getAttribute('title') ?? '',
        ]),
    ].join('\n')
    const forbiddenOutput =
      /(authorization\s*[:=]|bearer\s|github_pat_|ghp_|[?&](token|access_token)=)/i
    const privateOutput =
      /(C:\\Users\\|C:\/Users\/|ADMINI~1|AppData[\\/]|(?:^|[\\/])Temp[\\/]|desktop-material-cheap-lfs-restore-progress-)/i
    const visibleDialogs = [...document.querySelectorAll(
      'dialog[open], [role="dialog"][aria-modal="true"]'
    )].filter(element => element instanceof HTMLElement && visible(element))
    const currentRatio = fillRatio(currentBar, currentFill)
    const prefetchRatio = fillRatio(prefetchBar, prefetchFill)
    const overallRatio = fillRatio(overall, overallFill)
    const materialSymbols = [...card.querySelectorAll('.material-symbol')]

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
        document.documentElement.getAttribute('data-language-mode') === ${JSON.stringify(
          options.specification.languageMode
        )} &&
        localStorage.getItem('language-mode-v1') === ${JSON.stringify(
          options.specification.languageMode
        )},
      productionRenderer:
        location.protocol === 'file:' &&
        /[\\/]out[\\/]index\.html$/i.test(decodeURIComponent(location.pathname)),
      appWideCardMounted:
        strip.classList.contains('cheap-lfs-restore-strip') &&
        strip.firstElementChild === card &&
        document.querySelectorAll(
          '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
        ).length === 1,
      cardVisibleAndContained:
        visible(card) &&
        visible(strip) &&
        within(cardRect, stripRect) &&
        within(cardRect, viewport),
      materialThreeSurface:
        opaque(cardStyle.backgroundColor) &&
        Number.parseFloat(cardStyle.borderTopWidth) >= 1 &&
        borderRadius(card) >= 16 &&
        opaque(currentStyle.backgroundColor) &&
        opaque(prefetchStyle.backgroundColor) &&
        borderRadius(current) >= 12 &&
        borderRadius(prefetch) >= 12 &&
        opaque(lookAheadStyle.backgroundColor) &&
        borderRadius(lookAhead) >= 10 &&
        cardStyle.getPropertyValue('--md-sys-color-primary').trim().length > 0,
      materialSymbolsLoaded:
        materialSymbols.length >= 3 &&
        materialSymbols.every(element =>
          /material symbols/i.test(getComputedStyle(element).fontFamily)
        ),
      singlePoliteLiveSummary:
        statuses.length === 1 &&
        statuses[0] === summary &&
        summary.getAttribute('aria-live') === 'polite' &&
        summary.getAttribute('aria-atomic') === 'true',
      sectionAccessibility:
        card.tagName === 'SECTION' &&
        (card.getAttribute('aria-label') ?? '').trim().length > 0 &&
        card.getAttribute('aria-busy') === 'true',
      progressbarAccessibility:
        progressbars.length === 3 &&
        progressbars.every(progressbar =>
          (progressbar.getAttribute('aria-label') ?? '').trim().length > 0 &&
          progressbar.getAttribute('aria-busy') === 'true' &&
          progressbar.getAttribute('aria-valuemin') === '0' &&
          progressbar.getAttribute('aria-valuemax') === '100' &&
          (progressbar.getAttribute('aria-valuetext') ?? '').trim().length > 0
        ) &&
        current.getAttribute('role') === 'group' &&
        prefetch.getAttribute('role') === 'group' &&
        (current.getAttribute('aria-label') ?? '').trim().length > 0 &&
        (prefetch.getAttribute('aria-label') ?? '').trim().length > 0,
      overallCountersExact:
        overall.getAttribute('aria-valuenow') === ${JSON.stringify(
          String(ExpectedOverallPercentage)
        )} &&
        (overall.getAttribute('aria-valuetext') ?? '').includes(
          ${JSON.stringify(`${ExpectedOverallPercentage}%`)}
        ) &&
        summaryText.includes(${JSON.stringify(
          `${ExpectedOverallPercentage}%`
        )}) &&
        Math.abs(overallRatio - ${ExpectedOverallPercentage / 100}) < 0.025,
      detailedTransferCounters:
        statRows.length === 7 &&
        statValues.length === 7 &&
        statValues.every(value => normalizedText(value).length > 0) &&
        statsText.includes('2') &&
        statsText.includes('1') &&
        statsText.includes('5') &&
        statsText.includes('8') &&
        statsText.includes('3') &&
        statsText.includes('7') &&
        statsText.includes('/s'),
      exactNinetyPercentBoundary:
        normalizedText(currentPercent) === ${JSON.stringify(
          `${ExpectedCurrentLanePercentage}%`
        )} &&
        currentBar.getAttribute('aria-valuenow') === ${JSON.stringify(
          String(ExpectedCurrentLanePercentage)
        )} &&
        Math.abs(currentRatio - ${
          ExpectedCurrentLanePercentage / 100
        }) < 0.025 &&
        normalizedText(currentPath) === ${JSON.stringify(CurrentLanePath)},
      prefetchLaneActive:
        normalizedText(prefetchPercent) === ${JSON.stringify(
          `${ExpectedPrefetchLanePercentage}%`
        )} &&
        prefetchBar.getAttribute('aria-valuenow') === ${JSON.stringify(
          String(ExpectedPrefetchLanePercentage)
        )} &&
        Math.abs(prefetchRatio - ${
          ExpectedPrefetchLanePercentage / 100
        }) < 0.025 &&
        normalizedText(prefetchPath) === ${JSON.stringify(PrefetchLanePath)},
      laneCountersExact:
        currentMetaText.includes('3/8') &&
        currentMetaText.includes('4/5') &&
        prefetchMetaText.includes('4/8') &&
        prefetchMetaText.includes('1/3'),
      lookAheadThresholdExplained:
        lookAheadText.includes(${JSON.stringify(
          String(ExpectedCurrentLanePercentage)
        )}),
      lanesVisibleAndContained:
        visible(current) &&
        visible(prefetch) &&
        within(currentRect, lanesRect) &&
        within(prefetchRect, lanesRect) &&
        within(currentRect, cardRect) &&
        within(prefetchRect, cardRect) &&
        within(currentRect, viewport) &&
        within(prefetchRect, viewport),
      lanesDoNotOverlap: noOverlap(current, prefetch),
      visibleContentNotClipped:
        !hasHorizontalOverflow(card) &&
        !hasHorizontalOverflow(lanes) &&
        !hasHorizontalOverflow(current) &&
        !hasHorizontalOverflow(prefetch) &&
        !hasHorizontalOverflow(currentPath) &&
        !hasHorizontalOverflow(prefetchPath),
      intentionalVerticalScrollOnly:
        card.scrollHeight <= card.clientHeight + 1 ||
        (
          ['auto', 'scroll'].includes(cardStyle.overflowY) &&
          card.scrollHeight > card.clientHeight &&
          within(currentRect, cardRect) &&
          within(prefetchRect, cardRect)
        ),
      cancelControlAccessible:
        !cancel.disabled &&
        cancel.tabIndex >= 0 &&
        normalizedText(cancel).length > 0 &&
        cancel.getBoundingClientRect().width >= 40 &&
        cancel.getBoundingClientRect().height >= 40,
      failureDetailBounded:
        failures.getAttribute('role') === 'group' &&
        failures.querySelectorAll('li').length === 1 &&
        !hasHorizontalOverflow(failures) &&
        !forbiddenOutput.test(normalizedText(failures)),
      reducedMotionHonored:
        matchMedia('(prefers-reduced-motion: reduce)').matches &&
        [...card.querySelectorAll('*')].every(element => {
          const style = getComputedStyle(element)
          return style.animationName === 'none' || style.animationDuration === '0s'
        }),
      noBlockingDialog: visibleDialogs.length === 0,
      noHorizontalDocumentOverflow:
        document.documentElement.scrollWidth ===
          document.documentElement.clientWidth &&
        document.body.scrollWidth === document.body.clientWidth,
      noPrivatePathOrCredentialOutput:
        !forbiddenOutput.test(privacyCorpus) &&
        !privateOutput.test(privacyCorpus),
      noExecutableMarkup:
        card.querySelector('script, iframe, object, embed, webview') === null,
    }

    return {
      schemaVersion: 1,
      scenario: ${JSON.stringify(options.scenario)},
      appearance: {
        theme: document.body.classList.contains('theme-dark') ? 'dark' : null,
        persistedTheme: localStorage.getItem('theme'),
        languageMode: document.body.getAttribute('data-dm-language-mode'),
        persistedLanguageMode: localStorage.getItem('language-mode-v1'),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
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
      fixture: {
        lookAheadThresholdPercent: ${fixture.lookAheadThresholdPercent},
        overallPercent: ${ExpectedOverallPercentage},
        currentLanePercent: ${fixture.currentLane.percent},
        currentLaneProcessedBytes: ${fixture.currentLane.processedBytes},
        currentLaneTotalBytes: ${fixture.currentLane.totalBytes},
        currentLanePath: ${JSON.stringify(fixture.currentLane.relativePath)},
        prefetchLanePresent: true,
        prefetchLanePercent: ${fixture.prefetchLane.percent},
        prefetchLanePath: ${JSON.stringify(fixture.prefetchLane.relativePath)},
      },
      frame: ${JSON.stringify(frame)},
      card: {
        geometry: rect(card),
        stripGeometry: rect(strip),
        scrollTop: card.scrollTop,
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        summaryText,
        statsText,
        lookAheadText,
        badgesText: normalizedText(badges),
        currentLane: {
          geometry: rect(current),
          path: normalizedText(currentPath),
          metadata: currentMetaText,
          percent: normalizedText(currentPercent),
          progressValue: currentBar.getAttribute('aria-valuenow'),
          progressValueText: currentBar.getAttribute('aria-valuetext'),
          fillRatio: currentRatio,
        },
        prefetchLane: {
          geometry: rect(prefetch),
          path: normalizedText(prefetchPath),
          metadata: prefetchMetaText,
          percent: normalizedText(prefetchPercent),
          progressValue: prefetchBar.getAttribute('aria-valuenow'),
          progressValueText: prefetchBar.getAttribute('aria-valuetext'),
          fillRatio: prefetchRatio,
        },
        overallProgress: {
          value: overall.getAttribute('aria-valuenow'),
          valueText: overall.getAttribute('aria-valuetext'),
          fillRatio: overallRatio,
        },
        statRows: statRows.map(row => normalizedText(row)),
        failureText: normalizedText(failures),
      },
      assertions,
    }
  })()`
}

async function inspectSurface(options, hydration, frame) {
  return await evaluate(inspectionExpression(options, hydration, frame))
}

function sameKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const actual = Object.keys(value).sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  )
}

function validateSurfaceReceipt(receipt, scenario) {
  const specification = ScenarioSpecifications[scenario]
  if (
    specification === undefined ||
    !sameKeys(receipt, [
      'schemaVersion',
      'scenario',
      'appearance',
      'viewport',
      'hydration',
      'fixture',
      'frame',
      'card',
      'assertions',
    ]) ||
    receipt.schemaVersion !== 1 ||
    receipt.scenario !== scenario ||
    receipt.viewport?.width !== specification.width ||
    receipt.viewport?.height !== specification.height ||
    receipt.viewport?.devicePixelRatio !== 1 ||
    receipt.appearance?.theme !== 'dark' ||
    receipt.appearance?.persistedTheme !== 'dark' ||
    receipt.appearance?.languageMode !== specification.languageMode ||
    receipt.appearance?.persistedLanguageMode !== specification.languageMode ||
    receipt.appearance?.reducedMotion !== true
  ) {
    fail(
      'Cheap LFS restore receipt header diverged from the requested scenario.'
    )
  }
  if (
    receipt.hydration?.repositoryMatched !== true ||
    receipt.hydration?.updateInvoked !== true ||
    receipt.hydration?.statePublished !== true ||
    receipt.fixture?.lookAheadThresholdPercent !==
      ExpectedCurrentLanePercentage ||
    receipt.fixture?.currentLanePercent !== ExpectedCurrentLanePercentage ||
    receipt.fixture?.currentLaneProcessedBytes !== 90 * MiB ||
    receipt.fixture?.currentLaneTotalBytes !== 100 * MiB ||
    receipt.fixture?.prefetchLanePresent !== true ||
    receipt.fixture?.prefetchLanePercent !== ExpectedPrefetchLanePercentage
  ) {
    fail('Cheap LFS restore fixture proof diverged from the exact boundary.')
  }
  if (
    !sameKeys(receipt.assertions, ExpectedAssertionNames) ||
    ExpectedAssertionNames.some(name => receipt.assertions[name] !== true)
  ) {
    const failures = ExpectedAssertionNames.filter(
      name => receipt.assertions?.[name] !== true
    )
    const unexpected =
      receipt.assertions !== null && typeof receipt.assertions === 'object'
        ? Object.keys(receipt.assertions).filter(
            name => !ExpectedAssertionNames.includes(name)
          )
        : []
    fail(
      `Cheap LFS restore UI gate failed (${[
        ...failures,
        ...unexpected.map(name => `unexpected:${name}`),
      ].join(', ')}): ${JSON.stringify(receipt)}`
    )
  }
  return receipt
}

function validateFinalReceipt(receipt, scenario) {
  if (
    !sameKeys(receipt, [
      'schemaVersion',
      'scenario',
      'appearance',
      'viewport',
      'hydration',
      'fixture',
      'frame',
      'card',
      'assertions',
      'capture',
      'cleanup',
    ])
  ) {
    fail('Final Cheap LFS restore receipt has an unexpected shape.')
  }
  const surface = { ...receipt }
  delete surface.capture
  delete surface.cleanup
  validateSurfaceReceipt(surface, scenario)
  const specification = ScenarioSpecifications[scenario]
  if (
    receipt.capture?.width !== specification.width ||
    receipt.capture?.height !== specification.height ||
    !Number.isSafeInteger(receipt.capture?.bytes) ||
    receipt.capture.bytes < 20_000 ||
    !/^[a-f0-9]{64}$/.test(receipt.capture?.sha256 ?? '')
  ) {
    fail('Final Cheap LFS restore receipt has invalid capture evidence.')
  }
  if (
    receipt.cleanup?.appStoreFound !== true ||
    receipt.cleanup?.updateInvoked !== true ||
    receipt.cleanup?.stateCleared !== true ||
    receipt.cleanup?.cardRemoved !== true
  ) {
    fail('Final Cheap LFS restore receipt has invalid cleanup evidence.')
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

async function clearRestoreProgress() {
  const update = await evaluate(`(() => {
    const findAppStore = ${appStoreFinderSource()}
    const appStore =
      globalThis.__desktopMaterialCheapLfsRestoreVerificationAppStore ??
      findAppStore()
    if (
      appStore === null ||
      appStore === undefined ||
      typeof appStore.updateCheapLfsRestore !== 'function'
    ) {
      return { appStoreFound: false, updateInvoked: false, stateCleared: false }
    }
    appStore.updateCheapLfsRestore(null)
    const stateCleared = appStore.getState().cheapLfsRestore === null
    delete globalThis.__desktopMaterialCheapLfsRestoreVerificationAppStore
    return {
      appStoreFound: true,
      updateInvoked: true,
      stateCleared,
    }
  })()`)
  await waitFor(
    `document.querySelector(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    ) === null`,
    'app-wide Cheap LFS restore progress cleanup'
  )
  return { ...update, cardRemoved: true }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const owned = validateOwnedPaths(options)
  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()

  let pendingReceipt = null
  let cleanup = null
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await preparePresentation(options.specification)
    const hydration = await hydrateAppState(owned.repositoryPath)
    const frame = await settleAndFrameCard(options.scenario)
    const surface = validateSurfaceReceipt(
      await inspectSurface(options, hydration, frame),
      options.scenario
    )
    const capture = await captureOriginalPixels(options)
    pendingReceipt = { ...surface, capture }
  } finally {
    try {
      cleanup = await clearRestoreProgress()
    } finally {
      client.close()
    }
  }

  const receipt = validateFinalReceipt(
    { ...pendingReceipt, cleanup },
    options.scenario
  )
  fs.writeFileSync(
    options.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    {
      flag: 'wx',
    }
  )
  process.stdout.write(
    `CHEAP_LFS_RESTORE_PROGRESS_RECEIPT ${JSON.stringify(receipt)}\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(error ?? 'Unknown Cheap LFS restore progress verifier error.')
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  CurrentLanePath,
  ExpectedAssertionNames,
  ExpectedCurrentLanePercentage,
  ExpectedOverallPercentage,
  ExpectedPrefetchLanePercentage,
  MiB,
  PrefetchLanePath,
  ScenarioSpecifications,
  inspectionExpression,
  isContainedPath,
  parseArguments,
  restoreProgressFixture,
  validateFinalReceipt,
  validateSurfaceReceipt,
}
