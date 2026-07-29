#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- all filesystem work is bounded verification I/O */

/**
 * Packaged progressive-loading acceptance (CDP attach only).
 *
 * Run this first against a fresh production renderer, before any deferred
 * repository section has been opened. The verifier inventories the seven
 * emitted chunks, temporarily withholds only repository-tools.js, observes the
 * real loading -> local failure transition, captures it, restores the exact
 * bytes, activates the real Try again control, and proves both recovery and
 * synchronous cached revisit. The generated build artifact is restored in a
 * finally block even when an assertion fails.
 *
 * It never launches, focuses, resizes, or terminates Electron.
 */

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const WebSocket = require('ws')

const repoRoot = path.resolve(__dirname, '..', '..')
const outRoot = path.join(repoRoot, 'out')
const ReceiptSchema =
  'desktop-material/progressive-packaged-loading-acceptance/v1'
const Specification = Object.freeze({
  width: 1280,
  height: 860,
  theme: 'light',
  languageMode: 'english',
  funnyLevelEnglish: 1,
  funnyLevelCantonese: 1,
})
const ExpectedChunks = Object.freeze([
  'repository-actions.js',
  'repository-cheap-lfs.js',
  'repository-github-api.js',
  'repository-issues.js',
  'repository-provider-triage.js',
  'repository-releases.js',
  'repository-tools.js',
])
const TargetChunk = 'repository-tools.js'
const FailureCaptureName = 'progressive-load-local-failure-1280x860.png'
const RecoveryCaptureName = 'progressive-load-recovered-1280x860.png'
const PrivatePathPatternSource = String.raw`(?:file:/{2,4}|(?:^|[^A-Za-z0-9_])[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|(?:^|[\\/])Users[\\/]|ADMINI~1|AppData[\\/]|desktop-material-(?:p0-ui|progressive-loading)-|authorization\s*[:=]|bearer\s|github_pat_|ghp_)`
const PrivatePathPattern = new RegExp(PrivatePathPatternSource, 'i')

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
    const key = name.slice(2)
    if (values.has(key)) {
      fail(`Duplicate argument ${name}.`)
    }
    values.set(key, value)
  }

  const supported = new Set([
    'port',
    'run-root',
    'repository-path',
    'capture-failure',
    'capture-recovered',
    'receipt',
  ])
  for (const key of values.keys()) {
    if (!supported.has(key)) {
      fail(`Unsupported argument --${key}.`)
    }
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
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
    runRoot: requiredPath('run-root'),
    repositoryPath: requiredPath('repository-path'),
    failureCapturePath: requiredPath('capture-failure'),
    recoveryCapturePath: requiredPath('capture-recovered'),
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

function assertRealFile(candidate, label) {
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
    !status.isFile() ||
    status.isSymbolicLink() ||
    !realStatus.isFile() ||
    status.dev !== realStatus.dev ||
    status.ino !== realStatus.ino
  ) {
    fail(`${label} must be a real file, not a link.`)
  }
  return real
}

function ensureNewOwnedOutput(runRoot, candidate, label) {
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
    !/^desktop-material-(?:p0-ui|progressive-loading)-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/.test(
      path.basename(runRoot)
    )
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-p0-ui-* or desktop-material-progressive-loading-*.'
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

  for (const [candidate, label] of [
    [options.failureCapturePath, 'Failure capture'],
    [options.recoveryCapturePath, 'Recovery capture'],
    [options.receiptPath, 'Acceptance receipt'],
  ]) {
    ensureNewOwnedOutput(runRoot, candidate, label)
  }
  const outputs = new Set(
    [
      options.failureCapturePath,
      options.recoveryCapturePath,
      options.receiptPath,
    ].map(normalizedPath)
  )
  if (outputs.size !== 3) {
    fail('Failure capture, recovery capture, and receipt must be distinct.')
  }
  if (
    path.basename(options.failureCapturePath) !== FailureCaptureName ||
    path.basename(options.recoveryCapturePath) !== RecoveryCaptureName
  ) {
    fail(
      `Capture basenames must be ${FailureCaptureName} and ${RecoveryCaptureName}.`
    )
  }

  return { ...options, runRoot, repositoryPath }
}

function sha256Buffer(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file))
}

function inventoryProductionChunks() {
  const realOut = assertRealDirectory(outRoot, 'Production out directory')
  const renderer = assertRealFile(
    path.join(realOut, 'renderer.js'),
    'Production renderer'
  )
  const actual = fs
    .readdirSync(realOut)
    .filter(name => /^repository-[a-z-]+\.js$/.test(name))
    .sort()
  if (JSON.stringify(actual) !== JSON.stringify(ExpectedChunks)) {
    fail(
      `Production build emitted ${JSON.stringify(
        actual
      )}, expected the exact seven deferred chunks.`
    )
  }

  const chunks = ExpectedChunks.map(name => {
    const file = assertRealFile(
      path.join(realOut, name),
      `Production chunk ${name}`
    )
    if (normalizedPath(path.dirname(file)) !== normalizedPath(realOut)) {
      fail(`Production chunk ${name} escaped the out directory.`)
    }
    const bytes = fs.statSync(file).size
    if (!Number.isSafeInteger(bytes) || bytes < 1_000) {
      fail(`Production chunk ${name} is suspiciously small.`)
    }
    return { name, bytes, sha256: sha256File(file) }
  })

  return {
    outRoot: realOut,
    renderer: {
      name: path.basename(renderer),
      bytes: fs.statSync(renderer).size,
      sha256: sha256File(renderer),
    },
    chunks,
  }
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
      perMessageDeflate: false,
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

async function emitMenuEvent(name) {
  await evaluate(
    `require('electron').ipcRenderer.emit('menu-event', {}, ${JSON.stringify(
      name
    )}), true`
  )
}

async function preparePresentation(repositoryPath) {
  await waitFor(
    `document.querySelector('#desktop-app-container') !== null`,
    'Desktop Material app container'
  )
  const expected = {
    theme: Specification.theme,
    'language-mode-v1': Specification.languageMode,
    'has-shown-welcome-flow': '1',
    'zoom-auto-fit-enabled': '0',
    'stats-opt-out': '1',
    'has-sent-stats-opt-in-ping': '1',
    'audio-system-settings-v1': JSON.stringify({
      funnyLevelEnglish: Specification.funnyLevelEnglish,
      funnyLevelCantonese: Specification.funnyLevelCantonese,
    }),
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
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: Specification.width,
    height: Specification.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: Specification.width,
    screenHeight: Specification.height,
  })
  await waitFor(
    `(() => {
      let audio
      try {
        audio = JSON.parse(localStorage.getItem('audio-system-settings-v1') ?? '{}')
      } catch {
        return false
      }
      return (
        document.body.classList.contains('theme-light') &&
        localStorage.getItem('theme') === 'light' &&
        document.body.getAttribute('data-dm-language-mode') === 'english' &&
        document.documentElement.getAttribute('data-language-mode') === 'english' &&
        document.documentElement.lang === 'en' &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1 &&
        matchMedia('(prefers-reduced-motion: reduce)').matches &&
        innerWidth === ${Specification.width} &&
        innerHeight === ${Specification.height}
      )
    })()`,
    'light English reduced-motion presentation'
  )

  await emitMenuEvent('show-changes')
  await waitFor(
    `document.getElementById('changes-tab')?.closest('[role="tab"]')?.getAttribute('aria-selected') === 'true'`,
    'Changes base surface'
  )
  await waitFor(
    `(() => {
      const root = document.querySelector('#desktop-app-container')
      const nodes = root ? [root, ...root.querySelectorAll('*')] : []
      const expected = require('path').resolve(${JSON.stringify(
        repositoryPath
      )})
      for (const node of nodes) {
        const fiberKey = Object.keys(node).find(key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
        )
        let fiber = fiberKey ? node[fiberKey] : null
        for (let depth = 0; fiber && depth < 180; depth += 1, fiber = fiber.return) {
          const repository = fiber.stateNode?.props?.appStore?.selectedRepository
          if (
            repository?.path &&
            require('path').resolve(repository.path).toLowerCase() === expected.toLowerCase()
          ) {
            return true
          }
        }
      }
      return false
    })()`,
    'owned selected repository'
  )

  await evaluate(`(() => {
    for (const button of document.querySelectorAll('.error-notice-dismiss')) {
      if (button instanceof HTMLElement) button.click()
    }
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    return true
  })()`)
  await waitFor(
    `document.querySelector('.error-notice-stack .error-notice') === null`,
    'clean notice baseline'
  )
}

async function installTransitionObserver() {
  const receipt = await evaluate(`(() => {
    globalThis.__desktopMaterialIssue82Observer?.disconnect?.()
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 && bounds.width > 0 && bounds.height > 0
    }
    const describeActive = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return null
      return {
        tag: active.tagName,
        id: active.id || null,
        className: typeof active.className === 'string' ? active.className : null,
        text: (active.textContent ?? '').trim().slice(0, 80),
      }
    }
    const visibleDialogs = () =>
      [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')]
        .filter(visible).length
    const state = {
      startedAt: performance.now(),
      activeBefore: describeActive(),
      dialogsBefore: visibleDialogs(),
      events: [],
    }
    const record = (element, kind, reason) => {
      if (!(element instanceof HTMLElement)) return
      const event = {
        sequence: state.events.length + 1,
        kind,
        reason,
        milliseconds: Math.round((performance.now() - state.startedAt) * 100) / 100,
        connected: element.isConnected,
        role: element.getAttribute('role'),
        ariaLive: element.getAttribute('aria-live'),
        ariaBusy: element.getAttribute('aria-busy'),
        title: element.querySelector('.lazy-view-title')?.textContent?.trim() ?? null,
        detail:
          element.querySelector('.lazy-view-error-detail')?.textContent?.trim() ?? null,
        retry:
          [...element.querySelectorAll('button')]
            .map(button => button.textContent?.trim())
            .find(text => text === 'Try again') ?? null,
        active: describeActive(),
        visibleDialogs: visibleDialogs(),
      }
      const previous = state.events.at(-1)
      if (
        previous?.kind === event.kind &&
        previous?.title === event.title &&
        previous?.detail === event.detail
      ) {
        return
      }
      state.events.push(event)
    }
    const collect = (root, reason) => {
      if (!(root instanceof Element)) return
      if (root.matches('.lazy-view-loading')) record(root, 'loading', reason)
      if (root.matches('.lazy-view-failed')) record(root, 'failed', reason)
      for (const element of root.querySelectorAll(
        '.lazy-view-loading, .lazy-view-failed'
      )) {
        record(
          element,
          element.classList.contains('lazy-view-loading') ? 'loading' : 'failed',
          reason
        )
      }
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          collect(node, 'added-node')
        }
      }
      collect(document.body, 'mutation-sample')
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'role', 'aria-live', 'aria-busy'],
    })
    globalThis.__desktopMaterialIssue82Observer = observer
    globalThis.__desktopMaterialIssue82State = state
    return {
      installed: true,
      activeBefore: state.activeBefore,
      dialogsBefore: state.dialogsBefore,
    }
  })()`)
  if (
    receipt?.installed !== true ||
    receipt.dialogsBefore !== 0 ||
    receipt.activeBefore?.tag !== 'BODY'
  ) {
    fail(
      `Progressive transition observer did not start from an inert base: ${JSON.stringify(
        receipt
      )}`
    )
  }
  return receipt
}

async function inspectFailureSurface() {
  return await evaluate(`(() => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 && bounds.width > 0 && bounds.height > 0
    }
    const failures = [...document.querySelectorAll('.lazy-view-failed')]
      .filter(visible)
    const failure = failures[0]
    const loading = [...document.querySelectorAll('.lazy-view-loading')]
      .filter(visible)
    const retry = failure
      ? [...failure.querySelectorAll('button')]
          .find(button => button.textContent?.trim() === 'Try again')
      : null
    const dialogs = [...document.querySelectorAll(
      'dialog[open], [role="dialog"], [role="alertdialog"]'
    )].filter(visible)
    const active = document.activeElement
    const bounds = failure instanceof HTMLElement
      ? failure.getBoundingClientRect()
      : null
    const events = globalThis.__desktopMaterialIssue82State?.events ?? []
    const loadingIndex = events.findIndex(event => event.kind === 'loading')
    const failedIndex = events.findIndex(event => event.kind === 'failed')
    const detail =
      failure?.querySelector('.lazy-view-error-detail')?.textContent?.trim() ?? ''
    return {
      failureCount: failures.length,
      loadingCount: loading.length,
      role: failure?.getAttribute('role') ?? null,
      title: failure?.querySelector('.lazy-view-title')?.textContent?.trim() ?? null,
      body: failure?.querySelector('.lazy-view-message')?.textContent?.trim() ?? null,
      detail,
      retryText: retry?.textContent?.trim() ?? null,
      retryEnabled:
        retry instanceof HTMLButtonElement &&
        !retry.disabled &&
        retry.getAttribute('aria-disabled') !== 'true',
      loadingObserved: loadingIndex >= 0,
      failedObserved: failedIndex >= 0,
      orderedTransition: loadingIndex >= 0 && failedIndex > loadingIndex,
      events,
      activeTag: active?.tagName ?? null,
      activeInsideFailure:
        failure instanceof HTMLElement && active instanceof Node
          ? failure.contains(active)
          : false,
      dialogCount: dialogs.length,
      repositoryRailVisible:
        visible(document.querySelector('nav.repository-rail')),
      changesControlEnabled: (() => {
        const tab = document.getElementById('changes-tab')?.closest('[role="tab"]')
        return tab instanceof HTMLElement &&
          visible(tab) &&
          tab.getAttribute('aria-disabled') !== 'true'
      })(),
      inViewport:
        bounds !== null &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth &&
        bounds.bottom <= innerHeight,
      noPrivatePath: !new RegExp(
        ${JSON.stringify(PrivatePathPatternSource)},
        'i'
      ).test(detail),
      namesTargetChunk:
        /repository-tools/i.test(detail) &&
        /local app asset/i.test(detail),
    }
  })()`)
}

function validateFailureReceipt(receipt) {
  const loadingEvent = receipt?.events?.find(event => event.kind === 'loading')
  const failedEvent = receipt?.events?.find(event => event.kind === 'failed')
  const valid =
    receipt?.failureCount === 1 &&
    receipt.loadingCount === 0 &&
    receipt.role === 'alert' &&
    receipt.title === 'Repository tools could not be loaded' &&
    typeof receipt.body === 'string' &&
    receipt.body.includes('Try again') &&
    receipt.retryText === 'Try again' &&
    receipt.retryEnabled === true &&
    receipt.loadingObserved === true &&
    receipt.failedObserved === true &&
    receipt.orderedTransition === true &&
    receipt.activeTag === 'BODY' &&
    receipt.activeInsideFailure === false &&
    receipt.dialogCount === 0 &&
    receipt.repositoryRailVisible === true &&
    receipt.changesControlEnabled === true &&
    receipt.inViewport === true &&
    receipt.noPrivatePath === true &&
    receipt.namesTargetChunk === true &&
    loadingEvent?.role === 'status' &&
    loadingEvent.ariaLive === 'polite' &&
    loadingEvent.ariaBusy === 'true' &&
    failedEvent?.role === 'alert' &&
    failedEvent.visibleDialogs === 0
  if (!valid) {
    fail(
      `Local progressive failure did not satisfy its contract: ${JSON.stringify(
        receipt
      )}`
    )
  }
  return receipt
}

async function assertCapturePrivacy(label) {
  const evidence = await evaluate(`(() => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 && bounds.width > 0 && bounds.height > 0
    }
    const bundledAsset = value =>
      /^file:\/\/\/[a-z]:\/(?:[^?#]*\/)?out\/static\/[a-z0-9._-]+\.(?:gif|ico|png|svg|webp)(?:[?#].*)?$/i.test(
        value
      )
    const corpus = [
      document.body.innerText,
      ...[...document.querySelectorAll('input, textarea')]
        .filter(visible)
        .map(element => element.value),
      ...[...document.querySelectorAll('[title], a[href], img[src]')]
        .filter(visible)
        .flatMap(element => [
          element.getAttribute('title') ?? '',
          element.getAttribute('href') ?? '',
          element.getAttribute('src') ?? '',
        ])
        .filter(value => !bundledAsset(value)),
    ].join('\\n')
    return {
      corpus,
      width: innerWidth,
      height: innerHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })()`)
  if (
    evidence?.width !== Specification.width ||
    evidence?.height !== Specification.height ||
    evidence.horizontalOverflow === true ||
    PrivatePathPattern.test(evidence?.corpus ?? '')
  ) {
    fail(
      `Capture ${label} failed its geometry/privacy gate: ${JSON.stringify({
        width: evidence?.width,
        height: evidence?.height,
        horizontalOverflow: evidence?.horizontalOverflow,
        privateMatch:
          PrivatePathPattern.exec(evidence?.corpus ?? '')?.[0] ?? null,
      })}`
    )
  }
}

function pngDimensions(bytes) {
  if (
    bytes.byteLength < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail('CDP capture was not a valid PNG.')
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

async function captureOriginalPixels(file, label) {
  await assertCapturePrivacy(label)
  const fontsReady = await evaluate(`(async () => {
    await document.fonts.ready
    return document.fonts.status === 'loaded'
  })()`)
  if (fontsReady !== true) {
    fail(`Capture ${label} could not settle bundled fonts.`)
  }
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const bytes = Buffer.from(result.data, 'base64')
  const dimensions = pngDimensions(bytes)
  if (
    dimensions.width !== Specification.width ||
    dimensions.height !== Specification.height ||
    bytes.byteLength < 20_000
  ) {
    fail(
      `Capture ${label} was ${dimensions.width}x${dimensions.height}/${bytes.byteLength} bytes.`
    )
  }
  fs.writeFileSync(file, bytes, { flag: 'wx' })
  return {
    name: path.basename(file),
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.byteLength,
    sha256: sha256Buffer(bytes),
  }
}

async function activateRetry() {
  const center = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.lazy-view-failed button')]
      .find(element => element.textContent?.trim() === 'Try again')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return null
    const bounds = button.getBoundingClientRect()
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    }
  })()`)
  if (
    !Number.isFinite(center?.x) ||
    !Number.isFinite(center?.y) ||
    center.x < 0 ||
    center.y < 0
  ) {
    fail('The real Try again control is not available.')
  }
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: center.x,
    y: center.y,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1,
  })
}

async function inspectRecovery() {
  return await evaluate(`(() => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 && bounds.width > 0 && bounds.height > 0
    }
    const tools = document.querySelector('.repository-tools-sidebar')
    const main = document.querySelector('main.repository-tools')
    return {
      toolsVisible: visible(tools),
      mainVisible: visible(main),
      failureCount:
        [...document.querySelectorAll('.lazy-view-failed')].filter(visible).length,
      loadingCount:
        [...document.querySelectorAll('.lazy-view-loading')].filter(visible).length,
      dialogCount:
        [...document.querySelectorAll(
          'dialog[open], [role="dialog"], [role="alertdialog"]'
        )].filter(visible).length,
      heading:
        main?.querySelector('h1, h2, .repository-tools-title')?.textContent?.trim() ??
        null,
      repositoryRailVisible:
        visible(document.querySelector('nav.repository-rail')),
    }
  })()`)
}

async function proveCachedRevisit() {
  const before = await evaluate(
    `globalThis.__desktopMaterialIssue82State?.events?.length ?? -1`
  )
  await emitMenuEvent('show-changes')
  await waitFor(
    `document.getElementById('changes-tab')?.closest('[role="tab"]')?.getAttribute('aria-selected') === 'true'`,
    'Changes after successful retry'
  )
  await emitMenuEvent('show-repository-tools')
  await waitFor(
    `document.querySelector('.repository-tools-sidebar') !== null`,
    'cached Repository tools revisit'
  )
  const receipt = await evaluate(`(() => {
    const events = globalThis.__desktopMaterialIssue82State?.events ?? []
    return {
      eventCountBefore: ${JSON.stringify(before)},
      eventCountAfter: events.length,
      newLoadingEvents: events
        .slice(${JSON.stringify(before)})
        .filter(event => event.kind === 'loading').length,
      newFailureEvents: events
        .slice(${JSON.stringify(before)})
        .filter(event => event.kind === 'failed').length,
      toolsVisible:
        document.querySelector('.repository-tools-sidebar') !== null,
    }
  })()`)
  if (
    receipt.eventCountBefore < 0 ||
    receipt.eventCountAfter < receipt.eventCountBefore ||
    receipt.newLoadingEvents !== 0 ||
    receipt.newFailureEvents !== 0 ||
    receipt.toolsVisible !== true
  ) {
    fail(`Cached revisit flashed or failed: ${JSON.stringify(receipt)}`)
  }
  return receipt
}

async function cleanupRendererEvidence() {
  const result = await evaluate(`(() => {
    globalThis.__desktopMaterialIssue82Observer?.disconnect?.()
    delete globalThis.__desktopMaterialIssue82Observer
    delete globalThis.__desktopMaterialIssue82State
    for (const button of document.querySelectorAll('.error-notice-dismiss')) {
      if (button instanceof HTMLElement) button.click()
    }
    require('electron').ipcRenderer.emit('menu-event', {}, 'show-changes')
    return {
      observerRemoved:
        globalThis.__desktopMaterialIssue82Observer === undefined,
      stateRemoved:
        globalThis.__desktopMaterialIssue82State === undefined,
    }
  })()`).catch(() => ({
    observerRemoved: false,
    stateRemoved: false,
  }))
  return result
}

function validateFinalReceipt(receipt) {
  const chunkNames = receipt?.build?.chunks?.map(chunk => chunk.name)
  const validCapture = (capture, expectedName) =>
    capture?.name === expectedName &&
    capture.width === Specification.width &&
    capture.height === Specification.height &&
    Number.isSafeInteger(capture.bytes) &&
    capture.bytes >= 20_000 &&
    /^[a-f0-9]{64}$/.test(capture.sha256 ?? '')
  const valid =
    receipt?.schema === ReceiptSchema &&
    JSON.stringify(receipt.specification) === JSON.stringify(Specification) &&
    receipt.build?.renderer?.name === 'renderer.js' &&
    Number.isSafeInteger(receipt.build.renderer.bytes) &&
    receipt.build.renderer.bytes >= 1_000 &&
    /^[a-f0-9]{64}$/.test(receipt.build.renderer.sha256 ?? '') &&
    JSON.stringify(chunkNames) === JSON.stringify(ExpectedChunks) &&
    receipt.build.chunks.every(
      chunk =>
        Number.isSafeInteger(chunk.bytes) &&
        chunk.bytes >= 1_000 &&
        /^[a-f0-9]{64}$/.test(chunk.sha256)
    ) &&
    receipt.mutation?.target === TargetChunk &&
    receipt.mutation?.withheld === true &&
    receipt.mutation?.restoredBeforeRetry === true &&
    receipt.mutation?.restoredSha256 === receipt.mutation?.originalSha256 &&
    receipt.failure?.orderedTransition === true &&
    receipt.failure?.noPrivatePath === true &&
    receipt.recovery?.toolsVisible === true &&
    receipt.recovery?.failureCount === 0 &&
    receipt.recovery?.loadingCount === 0 &&
    receipt.cachedRevisit?.newLoadingEvents === 0 &&
    receipt.cachedRevisit?.newFailureEvents === 0 &&
    validCapture(receipt.captures?.failure, FailureCaptureName) &&
    validCapture(receipt.captures?.recovered, RecoveryCaptureName) &&
    receipt.cleanup?.chunkPresent === true &&
    receipt.cleanup?.withheldSiblingAbsent === true &&
    receipt.cleanup?.chunkSha256 === receipt.mutation?.originalSha256 &&
    receipt.cleanup?.observerRemoved === true &&
    receipt.cleanup?.stateRemoved === true
  if (!valid) {
    fail('Final packaged progressive-loading receipt is invalid.')
  }
  return receipt
}

async function main() {
  const options = validateOwnedPaths(parseArguments(process.argv.slice(2)))
  const build = inventoryProductionChunks()
  const target = path.join(build.outRoot, TargetChunk)
  const targetReceipt = build.chunks.find(chunk => chunk.name === TargetChunk)
  if (targetReceipt === undefined) {
    fail('Target deferred chunk is absent from the exact inventory.')
  }
  const withheld = path.join(
    build.outRoot,
    `.${TargetChunk}.issue82-withheld-${process.pid}`
  )
  if (fs.existsSync(withheld)) {
    fail('The temporary withheld-chunk sibling already exists.')
  }

  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()

  let chunkWithheld = false
  let restoredBeforeRetry = false
  let pendingReceipt = null
  let rendererCleanup = {
    observerRemoved: false,
    stateRemoved: false,
  }
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await preparePresentation(options.repositoryPath)
    await installTransitionObserver()

    fs.renameSync(target, withheld)
    chunkWithheld = true
    if (fs.existsSync(target) || !fs.existsSync(withheld)) {
      fail('Repository tools chunk was not withheld exactly once.')
    }

    await emitMenuEvent('show-repository-tools')
    await waitFor(
      `document.querySelector('.lazy-view-failed[role="alert"]') !== null`,
      'local Repository tools failure',
      30_000
    )
    const failure = validateFailureReceipt(await inspectFailureSurface())
    const failureCapture = await captureOriginalPixels(
      options.failureCapturePath,
      'progressive local failure'
    )

    fs.renameSync(withheld, target)
    chunkWithheld = false
    restoredBeforeRetry = true
    if (sha256File(target) !== targetReceipt.sha256) {
      fail('Restored Repository tools chunk differs from the built bytes.')
    }

    await activateRetry()
    await waitFor(
      `document.querySelector('.repository-tools-sidebar') !== null &&
       document.querySelector('.lazy-view-loading, .lazy-view-failed') === null`,
      'Repository tools retry recovery',
      30_000
    )
    const recovery = await inspectRecovery()
    if (
      recovery?.toolsVisible !== true ||
      recovery.mainVisible !== true ||
      recovery.failureCount !== 0 ||
      recovery.loadingCount !== 0 ||
      recovery.dialogCount !== 0 ||
      recovery.repositoryRailVisible !== true
    ) {
      fail(
        `Repository tools did not recover locally: ${JSON.stringify(recovery)}`
      )
    }
    const recoveryCapture = await captureOriginalPixels(
      options.recoveryCapturePath,
      'progressive retry recovery'
    )
    const cachedRevisit = await proveCachedRevisit()

    pendingReceipt = {
      schema: ReceiptSchema,
      specification: Specification,
      build: {
        renderer: build.renderer,
        chunks: build.chunks,
      },
      mutation: {
        target: TargetChunk,
        originalSha256: targetReceipt.sha256,
        withheld: true,
        restoredBeforeRetry,
        restoredSha256: sha256File(target),
      },
      failure,
      recovery,
      cachedRevisit,
      captures: {
        failure: {
          ...failureCapture,
          name: FailureCaptureName,
        },
        recovered: {
          ...recoveryCapture,
          name: RecoveryCaptureName,
        },
      },
    }
  } finally {
    try {
      if (chunkWithheld) {
        if (fs.existsSync(target)) {
          fail(
            'Both target and withheld Repository tools chunks exist during cleanup.'
          )
        }
        fs.renameSync(withheld, target)
        chunkWithheld = false
      }
    } finally {
      rendererCleanup = await cleanupRendererEvidence()
      client.close()
    }
  }

  if (pendingReceipt === null) {
    fail('Packaged progressive-loading verification produced no receipt.')
  }
  const finalReceipt = validateFinalReceipt({
    ...pendingReceipt,
    cleanup: {
      ...rendererCleanup,
      chunkPresent: fs.existsSync(target),
      withheldSiblingAbsent: !fs.existsSync(withheld),
      chunkSha256: sha256File(target),
    },
  })
  fs.writeFileSync(
    options.receiptPath,
    `${JSON.stringify(finalReceipt, null, 2)}\n`,
    { flag: 'wx' }
  )
  process.stdout.write(
    `PROGRESSIVE_PACKAGED_LOADING_RECEIPT ${JSON.stringify(finalReceipt)}\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(
            error ?? 'Unknown packaged progressive-loading verifier error.'
          )
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  ExpectedChunks,
  FailureCaptureName,
  PrivatePathPatternSource,
  ReceiptSchema,
  RecoveryCaptureName,
  Specification,
  TargetChunk,
  isContainedPath,
  parseArguments,
  validateFailureReceipt,
  validateFinalReceipt,
}
