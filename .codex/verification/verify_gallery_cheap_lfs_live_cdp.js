#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- synchronous paths are bounded to caller-owned Temp output */

/**
 * Attach-only verification for the three live Cheap LFS gallery frames.
 *
 * The caller owns preparation: start a production Desktop Material build with
 * remote debugging, select the exact disposable/fresh-clone repository in the
 * app, and pass that repository and its direct Temp run root here. This helper
 * only presses the production Large files rail control, reads the production
 * CheapLfs component state, validates the retained repository state, and
 * captures original Chromium pixels. It never launches the app, fabricates DOM
 * or provider state, performs a provider mutation, materializes a payload,
 * commits, pushes, or writes a tracked gallery image.
 *
 * Current private-repository compression deliberately uses the encrypted public
 * builder and adds no workflow to the private repository. The cloud scene
 * therefore requires the current builder-routing notice, persisted opt-in, and
 * one already-verified compressed pointer rather than recreating the historical
 * in-repository workflow-ready state.
 *
 *   node .codex/verification/verify_gallery_cheap_lfs_live_cdp.js \
 *     --port 9337 \
 *     --run-root <Temp>/desktop-material-gallery-cheap-lfs-live-<id> \
 *     --repository-path <run-root>/<caller-selected-repository> \
 *     --scenario cloud-compression \
 *     --capture <run-root>/captures/cheap-lfs-cloud-compression.png \
 *     --receipt <run-root>/receipts/cheap-lfs-cloud-compression.receipt.json
 */

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('node:child_process')
const WebSocket = require('ws')

const SurfaceReceiptSchema = 'desktop-material/gallery-cheap-lfs-live/v1'
const PointerVersion = 'desktop-material/cheap-lfs/v1'
const PrivateAcceptanceOriginIdentity =
  'DingDingChae/desktop-material-cheap-lfs-private-20260722-153308'
const PrivateAcceptanceCommit = 'e56519d4742c63bb2c9f5f1e917de3fca7379fdd'

const ScenarioSpecifications = Object.freeze({
  'bambu-build-live': Object.freeze({
    outputFile: 'cheap-lfs-bambu-build-live.png',
    width: 960,
    height: 660,
    zoomFactor: 0.75,
    theme: 'dark',
    languageMode: 'bilingual',
    visibility: 'public',
    pointerCount: 10,
    expectedPath: null,
    publicIdentity: 'codingmachineedge/bambu-build',
    expectedCommit: 'c93403ebbc275c455f0440bfeb75fa84f6599522',
  }),
  'cloud-compression': Object.freeze({
    outputFile: 'cheap-lfs-cloud-compression.png',
    width: 960,
    height: 660,
    zoomFactor: 0.75,
    theme: 'dark',
    languageMode: 'bilingual',
    visibility: 'private',
    pointerCount: 1,
    expectedPath: 'payload-private.bin',
    publicIdentity: null,
    expectedCommit: PrivateAcceptanceCommit,
  }),
  'ui-acceptance': Object.freeze({
    outputFile: 'cheap-lfs-ui-acceptance.png',
    width: 1200,
    height: 752,
    zoomFactor: 0.8,
    theme: 'light',
    languageMode: 'english',
    visibility: 'private',
    pointerCount: 1,
    expectedPath: 'payload-private.bin',
    publicIdentity: null,
    expectedCommit: PrivateAcceptanceCommit,
  }),
})

const ExpectedAssertionNames = Object.freeze([
  'requestedViewport',
  'requestedAppearance',
  'productionRenderer',
  'selectedCallerRepository',
  'realCheapLfsSurface',
  'stateValidationOnly',
  'pointersLoadedAndIdle',
  'exactPointerInventory',
  'releaseBackedPointerInventory',
  'pointerIntegrityVerified',
  'pointerWorkingTreeStateVerified',
  'pinnedSummaryVisible',
  'materializeActionPresent',
  'scenarioContract',
  'keyContentVisibleAndContained',
  'noAccountIdentityInCapture',
  'noBlockingDialog',
  'noHorizontalOverflow',
  'noPrivatePathOrCredentialOutput',
  'reducedMotionHonored',
])

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
    fail(
      `Scenario must be one of ${Object.keys(ScenarioSpecifications).join(
        ', '
      )}.`
    )
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

function readBoundedRealFile(candidate, maximumBytes, label) {
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
    status.ino !== realStatus.ino ||
    status.size < 1 ||
    status.size > maximumBytes
  ) {
    fail(`${label} is not one bounded real file.`)
  }
  return fs.readFileSync(real, 'utf8')
}

function ensureOwnedOutput(runRoot, candidate, expectedName, label) {
  if (!isContainedPath(runRoot, candidate)) {
    fail(`${label} must stay inside the owned run root.`)
  }
  if (path.basename(candidate) !== expectedName) {
    fail(`${label} must be named ${expectedName}.`)
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

function parseOriginURL(config) {
  let section = ''
  for (const line of config.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header !== null) {
      section = header[1].trim().toLowerCase()
      continue
    }
    if (section === 'remote "origin"') {
      const entry = line.match(/^\s*url\s*=\s*(.+?)\s*$/i)
      if (entry !== null) {
        return entry[1]
      }
    }
  }
  return null
}

function normalizedGitHubOriginIdentity(origin) {
  if (typeof origin !== 'string') {
    return null
  }
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(
      origin
    )
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase()
}

function hermeticGitEnvironment() {
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (
      /^GIT_/i.test(name) ||
      /^GCM_/i.test(name) ||
      /^SSH_ASKPASS$/i.test(name)
    ) {
      delete environment[name]
    }
  }
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_EXTERNAL_DIFF: '',
    GIT_PAGER: 'cat',
  }
}

function runReadOnlyGit(repositoryPath, args, label) {
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  try {
    return execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-c',
        `core.hooksPath=${nullDevice}`,
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.untrackedCache=false',
        '-c',
        'commit.gpgSign=false',
        '-c',
        'tag.gpgSign=false',
        ...args,
      ],
      {
        cwd: repositoryPath,
        encoding: 'utf8',
        env: hermeticGitEnvironment(),
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
      }
    ).trim()
  } catch {
    fail(`${label} read-only Git provenance check failed.`)
  }
}

function validateGitStateProof(state, expectedCommit, label) {
  const expected = String(expectedCommit).toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    fail(`${label} expected commit is invalid.`)
  }
  if (state.status !== '') {
    fail(`${label} fixture must have no staged, unstaged, or untracked state.`)
  }
  if (state.branch !== 'main' || state.upstream !== 'origin/main') {
    fail(`${label} fixture must be the reviewed origin/main checkout.`)
  }
  if (String(state.head).toLowerCase() !== expected) {
    fail(`${label} HEAD does not match the reviewed commit.`)
  }
  if (String(state.upstreamTip).toLowerCase() !== expected) {
    fail(`${label} origin/main does not match the reviewed commit.`)
  }
  return {
    worktreeClean: true,
    expectedCommitMatched: true,
    originTrackingTipMatched: true,
  }
}

function validateReadOnlyGitPreparation(repositoryPath, expectedCommit, label) {
  return validateGitStateProof(
    {
      status: runReadOnlyGit(
        repositoryPath,
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        label
      ),
      branch: runReadOnlyGit(
        repositoryPath,
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        label
      ),
      upstream: runReadOnlyGit(
        repositoryPath,
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        label
      ),
      head: runReadOnlyGit(
        repositoryPath,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
        label
      ),
      upstreamTip: runReadOnlyGit(
        repositoryPath,
        ['rev-parse', '--verify', '@{upstream}^{commit}'],
        label
      ),
    },
    expectedCommit,
    label
  )
}

function validateFreshClonePreparation(
  repositoryPath,
  gitDirectory,
  expectedOriginIdentity,
  expectedCommit,
  label
) {
  const origin = parseOriginURL(
    readBoundedRealFile(
      path.join(gitDirectory, 'config'),
      256 * 1024,
      `${label} Git config`
    )
  )
  const originMatched =
    normalizedGitHubOriginIdentity(origin) ===
    expectedOriginIdentity.toLowerCase()
  if (!originMatched) {
    fail(`${label} fixture origin does not match its reviewed repository.`)
  }

  const reflog = readBoundedRealFile(
    path.join(gitDirectory, 'logs', 'HEAD'),
    1024 * 1024,
    `${label} HEAD reflog`
  )
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
  const freshCloneReflogValidated =
    reflog.length === 1 && /\tclone: from \S+\s*$/i.test(reflog[0])
  if (!freshCloneReflogValidated) {
    fail(
      `${label} fixture must retain a one-entry fresh-clone HEAD reflog; prepare a new caller-owned clone.`
    )
  }
  return {
    originMatched: true,
    freshCloneReflogValidated: true,
    ...validateReadOnlyGitPreparation(repositoryPath, expectedCommit, label),
  }
}

function validateOwnedPaths(options) {
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(path.dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !/^desktop-material-gallery-cheap-lfs-live-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/.test(
      path.basename(runRoot)
    )
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-gallery-cheap-lfs-live-*.'
    )
  }

  const repositoryPath = assertRealDirectory(
    options.repositoryPath,
    'Caller-selected repository'
  )
  if (!isContainedPath(runRoot, repositoryPath)) {
    fail('Caller-selected repository must stay inside the owned run root.')
  }
  const gitDirectory = assertRealDirectory(
    path.join(repositoryPath, '.git'),
    'Repository .git directory'
  )
  if (!isContainedPath(repositoryPath, gitDirectory)) {
    fail('Repository .git directory escaped the caller-selected repository.')
  }

  ensureOwnedOutput(
    runRoot,
    options.capturePath,
    options.specification.outputFile,
    'Capture'
  )
  ensureOwnedOutput(
    runRoot,
    options.receiptPath,
    options.specification.outputFile.replace(/\.png$/, '.receipt.json'),
    'Receipt'
  )
  if (
    normalizedPath(options.capturePath) === normalizedPath(options.receiptPath)
  ) {
    fail('Capture and receipt must be different files.')
  }

  const expectedOriginIdentity =
    options.scenario === 'bambu-build-live'
      ? options.specification.publicIdentity
      : PrivateAcceptanceOriginIdentity
  const preparation = validateFreshClonePreparation(
    repositoryPath,
    gitDirectory,
    expectedOriginIdentity,
    options.specification.expectedCommit,
    options.scenario === 'bambu-build-live'
      ? 'Bambu'
      : 'Private Cheap LFS acceptance'
  )
  return { runRoot, repositoryPath, preparation }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameKeys(value, expected) {
  return (
    isRecord(value) &&
    Object.keys(value).length === expected.length &&
    expected.every(key => Object.hasOwn(value, key))
  )
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
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
    this.socket.on('message', bytes => {
      let message
      try {
        message = JSON.parse(bytes.toString())
      } catch {
        return
      }
      if (message.id === undefined) {
        return
      }
      const pending = this.pending.get(message.id)
      if (pending === undefined) {
        return
      }
      this.pending.delete(message.id)
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message))
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
        if (error !== undefined) {
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

async function settleFrames() {
  await evaluate(`(async () => {
    await document.fonts.ready
    for (let index = 0; index < 4; index += 1) {
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    }
    return true
  })()`)
}

async function preparePresentation(specification) {
  await waitFor(
    `document.querySelector('#desktop-app-container') !== null`,
    'Desktop Material app container'
  )
  const expected = {
    theme: specification.theme,
    'language-mode-v1': specification.languageMode,
    'has-shown-welcome-flow': '1',
    'zoom-auto-fit-enabled': '0',
    'stats-opt-out': '1',
    'has-sent-stats-opt-in-ping': '1',
    'audio-system-settings-v1': JSON.stringify({
      funnyLevelEnglish: 1,
      funnyLevelCantonese: 1,
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

  await evaluate(
    `require('electron').webFrame.setZoomFactor(${JSON.stringify(
      specification.zoomFactor
    )}), true`
  )
  await client.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: specification.width,
    height: specification.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: specification.width,
    screenHeight: specification.height,
  })
  await settleFrames()
  await waitFor(
    `(() => {
      let audio
      try {
        audio = JSON.parse(
          localStorage.getItem('audio-system-settings-v1') ?? '{}'
        )
      } catch {
        return false
      }
      const zoom = require('electron').webFrame.getZoomFactor()
      return (
        document.body.classList.contains(
          ${JSON.stringify(`theme-${specification.theme}`)}
        ) &&
        localStorage.getItem('theme') ===
          ${JSON.stringify(specification.theme)} &&
        document.body.getAttribute('data-dm-language-mode') ===
          ${JSON.stringify(specification.languageMode)} &&
        document.documentElement.getAttribute('data-language-mode') ===
          ${JSON.stringify(specification.languageMode)} &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1 &&
        Math.abs(zoom - ${specification.zoomFactor}) < 0.001 &&
        Math.abs(innerWidth * devicePixelRatio - ${specification.width}) <= 2 &&
        Math.abs(innerHeight * devicePixelRatio - ${
          specification.height
        }) <= 2 &&
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
    })()`,
    'requested gallery presentation'
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
      for (
        let depth = 0;
        fiber && depth < 180;
        depth += 1, fiber = fiber.return
      ) {
        if (
          fiber.stateNode?.props?.appStore &&
          fiber.stateNode.props.appStore.selectedRepository !== undefined
        ) {
          return fiber.stateNode.props.appStore
        }
      }
    }
    return null
  }`
}

function cheapLfsFinderSource() {
  return `root => {
    if (!(root instanceof HTMLElement)) return null
    const fiberKey = Object.keys(root).find(key =>
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$')
    )
    let fiber = fiberKey ? root[fiberKey] : null
    for (
      let depth = 0;
      fiber && depth < 40;
      depth += 1, fiber = fiber.return
    ) {
      const instance = fiber.stateNode
      if (
        instance?.props?.repository &&
        Array.isArray(instance?.state?.pointers) &&
        typeof instance?.state?.loaded === 'boolean' &&
        Object.hasOwn(instance.state, 'cloudPrivateOptIn')
      ) {
        return instance
      }
    }
    return null
  }`
}

async function validateSelectedRepository(options, repositoryPath) {
  const receipt = await evaluate(`(() => {
    const findAppStore = ${appStoreFinderSource()}
    const appStore = findAppStore()
    const repository = appStore?.selectedRepository ?? null
    if (repository === null) {
      return {
        appStoreFound: appStore !== null,
        selected: false,
        pathMatched: false,
        visibility: null,
        publicIdentity: null,
      }
    }
    const pathModule = require('path')
    const selectedPath = pathModule.resolve(repository.path)
    const expectedPath = pathModule.resolve(${JSON.stringify(repositoryPath)})
    const gitHub = repository.gitHubRepository
    const visibility =
      gitHub?.isPrivate === true
        ? 'private'
        : gitHub?.isPrivate === false
        ? 'public'
        : null
    return {
      appStoreFound: true,
      selected: true,
      pathMatched:
        selectedPath.toLowerCase() === expectedPath.toLowerCase(),
      visibility,
      publicIdentity:
        visibility === 'public' && typeof gitHub?.fullName === 'string'
          ? gitHub.fullName
          : null,
    }
  })()`)
  const expectedIdentity = options.specification.publicIdentity
  if (
    receipt?.appStoreFound !== true ||
    receipt.selected !== true ||
    receipt.pathMatched !== true ||
    receipt.visibility !== options.specification.visibility ||
    (expectedIdentity !== null &&
      receipt.publicIdentity?.toLowerCase() !==
        expectedIdentity.toLowerCase()) ||
    (expectedIdentity === null && receipt.publicIdentity !== null)
  ) {
    fail(`Caller-selected repository gate failed: ${JSON.stringify(receipt)}`)
  }
  return receipt
}

async function pressProductionControl(selector, label) {
  const point = await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)})
    if (!(control instanceof HTMLElement)) return null
    const bounds = control.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    }
  })()`)
  if (point === null) {
    fail(`${label} is not available.`)
  }
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    buttons: 0,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })
}

async function openCheapLfsSurface() {
  await waitFor(
    `document.querySelector('#cheap-lfs-tab') !== null`,
    'production Large files rail control'
  )
  await pressProductionControl('#cheap-lfs-tab', 'Large files rail control')
  await waitFor(
    `document.querySelector(
      '.cheap-lfs-manager-view .cheap-lfs[aria-label="Cheap LFS large files"]'
    ) !== null`,
    'production Cheap LFS manager'
  )
  const findCheapLfs = cheapLfsFinderSource()
  await waitFor(
    `(() => {
      const root = document.querySelector(
        '.cheap-lfs-manager-view .cheap-lfs[aria-label="Cheap LFS large files"]'
      )
      const component = (${findCheapLfs})(root)
      return (
        component !== null &&
        component.state.loaded === true &&
        component.state.busy === null &&
        component.state.cloudBusy === false
      )
    })()`,
    'loaded, idle production Cheap LFS state',
    60_000
  )

  await evaluate(`(() => {
    const search = document.querySelector('.cheap-lfs-search-input')
    if (search instanceof HTMLInputElement && search.value !== '') {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(search, '')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    return true
  })()`)
  await waitFor(
    `document.querySelector('.cheap-lfs-search-input')?.value === ''`,
    'unfiltered pinned-file list'
  )
  await settleFrames()
}

async function positionSurface(scenario) {
  const positioned = await evaluate(`(() => {
    const manager = document.querySelector('.cheap-lfs-manager-view')
    const cloud = document.querySelector('.cheap-lfs-cloud-compression')
    const list = document.querySelector('.cheap-lfs-list')
    if (!(manager instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return false
    }
    const scenario = ${JSON.stringify(scenario)}
    if (scenario === 'cloud-compression') {
      if (!(cloud instanceof HTMLElement)) return false
      manager.scrollTop = Math.max(0, cloud.offsetTop - 8)
    } else if (scenario === 'bambu-build-live') {
      if (!(cloud instanceof HTMLElement)) return false
      manager.scrollTop = Math.max(
        0,
        list.offsetTop - Math.min(150, cloud.offsetHeight * 0.45)
      )
    } else {
      manager.scrollTop = Math.max(0, list.offsetTop - 10)
    }
    manager.scrollLeft = 0
    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
    return true
  })()`)
  if (positioned !== true) {
    fail(`Could not position the ${scenario} production surface.`)
  }
  await settleFrames()
}

function inspectionExpression(options, repositoryGate, preparation) {
  const specification = options.specification
  return `(() => {
    const specification = ${JSON.stringify(specification)}
    const scenario = ${JSON.stringify(options.scenario)}
    const repositoryGate = ${JSON.stringify(repositoryGate)}
    const preparation = ${JSON.stringify(preparation)}
    const findAppStore = ${appStoreFinderSource()}
    const findCheapLfs = ${cheapLfsFinderSource()}
    const root = document.querySelector(
      '.cheap-lfs-manager-view .cheap-lfs[aria-label="Cheap LFS large files"]'
    )
    const component = findCheapLfs(root)
    const appStore = findAppStore()
    const repository = appStore?.selectedRepository ?? null
    if (
      !(root instanceof HTMLElement) ||
      component === null ||
      repository === null
    ) {
      throw new Error('The real Cheap LFS component state is unavailable.')
    }

    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.right > 0 &&
        bounds.bottom > 0 &&
        bounds.left < innerWidth &&
        bounds.top < innerHeight
      )
    }
    const withinViewport = (element, tolerance = 1) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false
      const bounds = element.getBoundingClientRect()
      return (
        bounds.left >= -tolerance &&
        bounds.top >= -tolerance &&
        bounds.right <= innerWidth + tolerance &&
        bounds.bottom <= innerHeight + tolerance
      )
    }
    const normalizedText = element =>
      (element?.textContent ?? '').replace(/\\s+/g, ' ').trim()
    const sha256 = value =>
      require('crypto').createHash('sha256').update(value).digest('hex')
    const validHash = value =>
      typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    const validRelativePath = value =>
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 4096 &&
      !/^(?:[A-Za-z]:[\\\\/]|[\\\\/])/.test(value) &&
      !value.split(/[\\\\/]/).includes('..')
    const validPointer = entry => {
      if (
        entry?.kind !== 'release' ||
        entry.provider !== 'release' ||
        !validRelativePath(entry.relativePath) ||
        entry.pointer?.version !== ${JSON.stringify(PointerVersion)} ||
        typeof entry.pointer.releaseTag !== 'string' ||
        entry.pointer.releaseTag.trim().length === 0 ||
        typeof entry.pointer.assetName !== 'string' ||
        entry.pointer.assetName.trim().length === 0 ||
        !Number.isSafeInteger(entry.pointer.sizeInBytes) ||
        entry.pointer.sizeInBytes <= 0 ||
        !validHash(entry.pointer.sha256)
      ) {
        return false
      }
      const parts = entry.pointer.parts
      if (parts === undefined) return true
      if (!Array.isArray(parts) || parts.length < 1) return false
      const size = parts.reduce((sum, part) => sum + part.sizeInBytes, 0)
      return (
        size === entry.pointer.sizeInBytes &&
        parts.every(part =>
          typeof part.name === 'string' &&
          part.name.trim().length > 0 &&
          Number.isSafeInteger(part.sizeInBytes) &&
          part.sizeInBytes > 0 &&
          validHash(part.sha256) &&
          (part.deflatedSizeInBytes === undefined ||
            (Number.isSafeInteger(part.deflatedSizeInBytes) &&
              part.deflatedSizeInBytes > 0 &&
              part.deflatedSizeInBytes < part.sizeInBytes))
        )
      )
    }
    const compression = entry => {
      const parts = entry?.pointer?.parts
      if (
        !Array.isArray(parts) ||
        parts.length < 1 ||
        !parts.every(
          part =>
            Number.isSafeInteger(part.deflatedSizeInBytes) &&
            part.deflatedSizeInBytes > 0 &&
            part.deflatedSizeInBytes < part.sizeInBytes
        )
      ) {
        return null
      }
      const original = parts.reduce((sum, part) => sum + part.sizeInBytes, 0)
      const stored = parts.reduce(
        (sum, part) => sum + part.deflatedSizeInBytes,
        0
      )
      return {
        original,
        stored,
        savings:
          Math.round((1 - stored / original) * 1000) / 10,
      }
    }

    const pointers = component.state.pointers
    const pointerProof = pointers
      .map(entry => ({
        kind: entry.kind,
        provider: entry.provider,
        relativePath: entry.relativePath,
        workingTreeState: entry.workingTreeState,
        version: entry.pointer?.version ?? null,
        releaseTag: entry.pointer?.releaseTag ?? null,
        assetName: entry.pointer?.assetName ?? null,
        sizeInBytes: entry.pointer?.sizeInBytes ?? null,
        sha256: entry.pointer?.sha256 ?? null,
        parts: Array.isArray(entry.pointer?.parts)
          ? entry.pointer.parts.map(part => ({
              name: part.name,
              sizeInBytes: part.sizeInBytes,
              sha256: part.sha256,
              deflatedSizeInBytes: part.deflatedSizeInBytes ?? null,
            }))
          : null,
      }))
      .sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      )
    const compressed = pointers
      .map(entry => ({ entry, compression: compression(entry) }))
      .filter(item => item.compression !== null)
    const rowElements = [...root.querySelectorAll('.cheap-lfs-row')]
    const rowForPath = relativePath =>
      rowElements.find(
        row =>
          normalizedText(row.querySelector('.cheap-lfs-row-path')) ===
          relativePath
      ) ?? null
    const primaryPath =
      specification.expectedPath ?? pointers[0]?.relativePath ?? null
    const primaryRow =
      typeof primaryPath === 'string' ? rowForPath(primaryPath) : null
    const materializeButton =
      primaryRow === null
        ? null
        : [...primaryRow.querySelectorAll('button')].find(
            button => normalizedText(button) === 'Materialize'
          ) ?? null
    const list = root.querySelector('.cheap-lfs-list')
    const listTitle = root.querySelector('#cheap-lfs-list-title')
    const trackedSummary =
      listTitle?.parentElement?.querySelector('span') ?? null
    const search = root.querySelector('.cheap-lfs-search')
    const pathElement = primaryRow?.querySelector('.cheap-lfs-row-path') ?? null
    const rowMetadata =
      primaryRow === null
        ? []
        : [...primaryRow.querySelectorAll('.cheap-lfs-row-meta')]
    const compressionElement =
      rowMetadata.find(element =>
        /(?:Compressed\\s*·\\s*99\\.9% smaller|已壓縮\\s*·\\s*慳咗 99\\.9%)/.test(
          normalizedText(element)
        )
      ) ?? null
    const cloud = root.querySelector('.cheap-lfs-cloud-compression')
    const cloudCheckbox = cloud?.querySelector('input[type="checkbox"]') ?? null
    const cloudReady = root.querySelector('.cheap-lfs-cloud-ready')
    const notice = root.querySelector('.cheap-lfs-notice')
    const noticeText = normalizedText(notice)
    const builderNoticeCurrent =
      visible(notice) &&
      noticeText.includes(
        'No workflow was added to this private repository'
      ) &&
      noticeText.includes('encrypted public builder') &&
      noticeText.includes('呢個私人 repo 冇加過 workflow') &&
      noticeText.includes('加密 public builder')
    const workflowIndicator =
      scenario === 'cloud-compression'
        ? notice
        : visible(cloudReady)
        ? cloudReady
        : notice
    const managedWorkflowKind =
      scenario === 'cloud-compression' && builderNoticeCurrent
        ? 'encrypted-public-builder-routed'
        : visible(cloudReady)
        ? 'public-in-repo-workflow-ready'
        : null
    const managerTitle = root.querySelector('.cheap-lfs-intro h2')
    const account = root.querySelector('.cheap-lfs-account')
    const accountIdentityVisible =
      visible(account) && /^Using\\s+.+\\s+·\\s+.+$/i.test(normalizedText(account))

    const visibleTextParts = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    )
    while (walker.nextNode()) {
      const textNode = walker.currentNode
      const text = textNode.nodeValue?.replace(/\\s+/g, ' ').trim() ?? ''
      if (text.length === 0) continue
      const range = document.createRange()
      range.selectNodeContents(textNode)
      const bounds = range.getBoundingClientRect()
      const parent = textNode.parentElement
      if (
        parent !== null &&
        visible(parent) &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.right > 0 &&
        bounds.bottom > 0 &&
        bounds.left < innerWidth &&
        bounds.top < innerHeight
      ) {
        visibleTextParts.push(text)
      }
    }
    const visibleAttributes = [
      ...document.querySelectorAll('[aria-label], [aria-valuetext], [title]'),
    ]
      .filter(element => visible(element))
      .flatMap(element => [
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('aria-valuetext') ?? '',
        element.getAttribute('title') ?? '',
      ])
    const privacyCorpus = [...visibleTextParts, ...visibleAttributes].join('\\n')
    const privateOutput =
      /(?:[A-Za-z]:[\\\\/](?:Users|Documents and Settings|ProgramData|Windows|Temp)[\\\\/]|ADMINI~1|AppData[\\\\/]|(?:^|[\\\\/])desktop-material-gallery-cheap-lfs-live-)/im
    const credentialOutput =
      /(?:authorization\\s*[:=]|bearer\\s|github_pat_|ghp_|gho_|ghu_|ghs_|ghr_|[?&](?:token|access_token|sig|signature)=|X-Amz-(?:Credential|Signature)|X-Goog-Signature)/i
    const visibleDialogs = [
      ...document.querySelectorAll(
        'dialog[open], [role="dialog"][aria-modal="true"]'
      ),
    ].filter(element => visible(element))
    let audio = {}
    try {
      audio = JSON.parse(
        localStorage.getItem('audio-system-settings-v1') ?? '{}'
      )
    } catch {}
    const zoomFactor = require('electron').webFrame.getZoomFactor()
    const physicalWidth = Math.round(innerWidth * devicePixelRatio)
    const physicalHeight = Math.round(innerHeight * devicePixelRatio)
    const expectedSummary =
      specification.pointerCount === 1
        ? '1 tracked by Cheap LFS'
        : specification.pointerCount + ' tracked by Cheap LFS'
    const releasePointerCount = pointers.filter(
      entry => entry.kind === 'release' && entry.provider === 'release'
    ).length
    const validIntegrityCount = pointers.filter(validPointer).length
    const localPointerCount = pointers.filter(
      entry => entry.workingTreeState === 'pointer'
    ).length
    const materializeButtons = rowElements
      .flatMap(row => [...row.querySelectorAll('button')])
      .filter(button => normalizedText(button) === 'Materialize')
    const gitHub = repository.gitHubRepository
    const visibility =
      gitHub?.isPrivate === true
        ? 'private'
        : gitHub?.isPrivate === false
        ? 'public'
        : null
    const persistedCloudOptIn =
      repository.buildRunPreferences?.cheapLfsCloudCompression === true
    const firstCompressedSavings =
      compressed.length === 1 ? compressed[0].compression.savings : null

    const commonKeyElements = [
      listTitle,
      trackedSummary,
      search,
      pathElement,
    ]
    const keyElements =
      scenario === 'cloud-compression'
        ? [
            cloud,
            cloudCheckbox,
            workflowIndicator,
            ...commonKeyElements,
            compressionElement,
          ]
        : [...commonKeyElements, materializeButton]
    const keyContentVisibleAndContained =
      keyElements.every(element => withinViewport(element))

    const scenarioContract =
      scenario === 'bambu-build-live'
        ? visibility === 'public' &&
          gitHub.fullName.toLowerCase() ===
            'codingmachineedge/bambu-build' &&
          preparation.originMatched === true &&
          preparation.freshCloneReflogValidated === true &&
          preparation.worktreeClean === true &&
          preparation.expectedCommitMatched === true &&
          preparation.originTrackingTipMatched === true &&
          pointers.length === 10 &&
          releasePointerCount === 10 &&
          validIntegrityCount === 10 &&
          localPointerCount === 10 &&
          visible(materializeButton)
        : scenario === 'cloud-compression'
        ? visibility === 'private' &&
          preparation.originMatched === true &&
          preparation.freshCloneReflogValidated === true &&
          preparation.worktreeClean === true &&
          preparation.expectedCommitMatched === true &&
          preparation.originTrackingTipMatched === true &&
          pointers.length === 1 &&
          pointers[0]?.relativePath === 'payload-private.bin' &&
          component.state.cloudPrivateOptIn === true &&
          component.state.cloudWorkflowReady === false &&
          persistedCloudOptIn === true &&
          builderNoticeCurrent &&
          managedWorkflowKind === 'encrypted-public-builder-routed' &&
          compressed.length === 1 &&
          firstCompressedSavings === 99.9 &&
          visible(compressionElement)
        : visibility === 'private' &&
          preparation.originMatched === true &&
          preparation.freshCloneReflogValidated === true &&
          preparation.worktreeClean === true &&
          preparation.expectedCommitMatched === true &&
          preparation.originTrackingTipMatched === true &&
          pointers.length === 1 &&
          pointers[0]?.relativePath === 'payload-private.bin' &&
          releasePointerCount === 1 &&
          validIntegrityCount === 1 &&
          localPointerCount === 1 &&
          visible(materializeButton) &&
          materializeButton.disabled === false

    const assertions = {
      requestedViewport:
        physicalWidth === specification.width &&
        physicalHeight === specification.height &&
        Math.abs(zoomFactor - specification.zoomFactor) < 0.001,
      requestedAppearance:
        document.body.classList.contains('theme-' + specification.theme) &&
        localStorage.getItem('theme') === specification.theme &&
        document.body.getAttribute('data-dm-language-mode') ===
          specification.languageMode &&
        document.documentElement.getAttribute('data-language-mode') ===
          specification.languageMode &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1,
      productionRenderer:
        location.protocol === 'file:' &&
        /[\\\\/]out[\\\\/]index\\.html$/i.test(
          decodeURIComponent(location.pathname)
        ),
      selectedCallerRepository:
        repositoryGate.appStoreFound === true &&
        repositoryGate.selected === true &&
        repositoryGate.pathMatched === true &&
        repositoryGate.visibility === specification.visibility &&
        visibility === specification.visibility,
      realCheapLfsSurface:
        root.getAttribute('role') === 'group' &&
        root.getAttribute('aria-label') === 'Cheap LFS large files' &&
        root.closest('.cheap-lfs-manager-view') !== null &&
        component.props.repository === repository,
      stateValidationOnly: true,
      pointersLoadedAndIdle:
        component.state.loaded === true &&
        component.state.busy === null &&
        component.state.cloudBusy === false &&
        component.state.error === null,
      exactPointerInventory: pointers.length === specification.pointerCount,
      releaseBackedPointerInventory:
        releasePointerCount === specification.pointerCount,
      pointerIntegrityVerified:
        validIntegrityCount === specification.pointerCount,
      pointerWorkingTreeStateVerified:
        localPointerCount === specification.pointerCount,
      pinnedSummaryVisible:
        visible(trackedSummary) &&
        normalizedText(trackedSummary) === expectedSummary,
      materializeActionPresent:
        materializeButtons.length > 0 &&
        materializeButtons.every(button => button.disabled === false),
      scenarioContract,
      keyContentVisibleAndContained,
      noAccountIdentityInCapture: !accountIdentityVisible,
      noBlockingDialog: visibleDialogs.length === 0,
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.body.scrollWidth <= innerWidth + 1 &&
        root.scrollWidth <= root.clientWidth + 1,
      noPrivatePathOrCredentialOutput:
        !privateOutput.test(privacyCorpus) &&
        !credentialOutput.test(privacyCorpus),
      reducedMotionHonored:
        matchMedia('(prefers-reduced-motion: reduce)').matches,
    }

    return {
      schema: ${JSON.stringify(SurfaceReceiptSchema)},
      scenario,
      evidence: {
        mode: 'retained-state-validation',
        stateValidationPerformed: true,
        providerMutationPerformed: false,
        repositoryMutationPerformed: false,
        clonePerformedByVerifier: false,
        mutationReceipt: null,
      },
      repository: {
        selectedPathMatched: repositoryGate.pathMatched,
        gitEntryKind: 'real-directory',
        visibility,
        publicIdentity:
          visibility === 'public' ? gitHub.fullName : null,
        freshCloneReflogValidated:
          preparation.freshCloneReflogValidated,
        worktreeClean: preparation.worktreeClean,
        expectedCommitMatched: preparation.expectedCommitMatched,
        originTrackingTipMatched:
          preparation.originTrackingTipMatched,
      },
      viewport: {
        captureWidth: specification.width,
        captureHeight: specification.height,
        cssWidth: innerWidth,
        cssHeight: innerHeight,
        devicePixelRatio,
        physicalWidth,
        physicalHeight,
        zoomFactor,
      },
      appearance: {
        theme: specification.theme,
        languageMode:
          document.body.getAttribute('data-dm-language-mode'),
        funnyLevelEnglish: audio.funnyLevelEnglish ?? null,
        funnyLevelCantonese: audio.funnyLevelCantonese ?? null,
        reducedMotion:
          matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
      state: {
        loaded: component.state.loaded,
        busy: component.state.busy,
        errorPresent: component.state.error !== null,
        pointerCount: pointers.length,
        releasePointerCount,
        validIntegrityCount,
        localPointerCount,
        visibleMaterializeButtonCount: materializeButtons.length,
        cloudPrivateOptIn: component.state.cloudPrivateOptIn,
        cloudWorkflowReady: component.state.cloudWorkflowReady,
        persistedCloudOptIn,
        managedWorkflowKind,
        compressedPointerCount: compressed.length,
        compressionSavingsPercent: firstCompressedSavings,
        relativePaths: pointers
          .map(entry => entry.relativePath)
          .sort((left, right) => left.localeCompare(right)),
        pointerSetSha256: sha256(JSON.stringify(pointerProof)),
      },
      visibleText: {
        managerTitle: normalizedText(managerTitle),
        trackedSummary: normalizedText(trackedSummary),
        firstPath: normalizedText(pathElement),
        workflowIndicator: normalizedText(workflowIndicator),
        compressionLabel: normalizedText(compressionElement),
        materializeLabel: normalizedText(materializeButton),
        privacyCorpusSha256: sha256(privacyCorpus),
      },
      assertions,
    }
  })()`
}

function validateSurfaceReceipt(receipt, scenario) {
  const specification = ScenarioSpecifications[scenario]
  if (
    specification === undefined ||
    !sameKeys(receipt, [
      'schema',
      'scenario',
      'evidence',
      'repository',
      'viewport',
      'appearance',
      'state',
      'visibleText',
      'assertions',
    ]) ||
    receipt.schema !== SurfaceReceiptSchema ||
    receipt.scenario !== scenario ||
    !sameKeys(receipt.evidence, [
      'mode',
      'stateValidationPerformed',
      'providerMutationPerformed',
      'repositoryMutationPerformed',
      'clonePerformedByVerifier',
      'mutationReceipt',
    ]) ||
    receipt.evidence.mode !== 'retained-state-validation' ||
    receipt.evidence.stateValidationPerformed !== true ||
    receipt.evidence.providerMutationPerformed !== false ||
    receipt.evidence.repositoryMutationPerformed !== false ||
    receipt.evidence.clonePerformedByVerifier !== false ||
    receipt.evidence.mutationReceipt !== null ||
    !sameKeys(receipt.repository, [
      'selectedPathMatched',
      'gitEntryKind',
      'visibility',
      'publicIdentity',
      'freshCloneReflogValidated',
      'worktreeClean',
      'expectedCommitMatched',
      'originTrackingTipMatched',
    ]) ||
    receipt.repository.selectedPathMatched !== true ||
    receipt.repository.gitEntryKind !== 'real-directory' ||
    receipt.repository.visibility !== specification.visibility ||
    receipt.repository.publicIdentity !== specification.publicIdentity ||
    receipt.repository.freshCloneReflogValidated !== true ||
    receipt.repository.worktreeClean !== true ||
    receipt.repository.expectedCommitMatched !== true ||
    receipt.repository.originTrackingTipMatched !== true ||
    !sameKeys(receipt.viewport, [
      'captureWidth',
      'captureHeight',
      'cssWidth',
      'cssHeight',
      'devicePixelRatio',
      'physicalWidth',
      'physicalHeight',
      'zoomFactor',
    ]) ||
    receipt.viewport.captureWidth !== specification.width ||
    receipt.viewport.captureHeight !== specification.height ||
    receipt.viewport.physicalWidth !== specification.width ||
    receipt.viewport.physicalHeight !== specification.height ||
    Math.abs(receipt.viewport.zoomFactor - specification.zoomFactor) > 0.001 ||
    !sameKeys(receipt.appearance, [
      'theme',
      'languageMode',
      'funnyLevelEnglish',
      'funnyLevelCantonese',
      'reducedMotion',
    ]) ||
    receipt.appearance.theme !== specification.theme ||
    receipt.appearance.languageMode !== specification.languageMode ||
    receipt.appearance.funnyLevelEnglish !== 1 ||
    receipt.appearance.funnyLevelCantonese !== 1 ||
    receipt.appearance.reducedMotion !== true ||
    !sameKeys(receipt.state, [
      'loaded',
      'busy',
      'errorPresent',
      'pointerCount',
      'releasePointerCount',
      'validIntegrityCount',
      'localPointerCount',
      'visibleMaterializeButtonCount',
      'cloudPrivateOptIn',
      'cloudWorkflowReady',
      'persistedCloudOptIn',
      'managedWorkflowKind',
      'compressedPointerCount',
      'compressionSavingsPercent',
      'relativePaths',
      'pointerSetSha256',
    ]) ||
    receipt.state.loaded !== true ||
    receipt.state.busy !== null ||
    receipt.state.errorPresent !== false ||
    receipt.state.pointerCount !== specification.pointerCount ||
    receipt.state.releasePointerCount !== specification.pointerCount ||
    receipt.state.validIntegrityCount !== specification.pointerCount ||
    receipt.state.localPointerCount !== specification.pointerCount ||
    !validPositiveInteger(receipt.state.visibleMaterializeButtonCount) ||
    !Array.isArray(receipt.state.relativePaths) ||
    receipt.state.relativePaths.length !== specification.pointerCount ||
    !/^[a-f0-9]{64}$/.test(receipt.state.pointerSetSha256 ?? '') ||
    !sameKeys(receipt.visibleText, [
      'managerTitle',
      'trackedSummary',
      'firstPath',
      'workflowIndicator',
      'compressionLabel',
      'materializeLabel',
      'privacyCorpusSha256',
    ]) ||
    receipt.visibleText.trackedSummary !==
      `${specification.pointerCount} tracked by Cheap LFS` ||
    !/^[a-f0-9]{64}$/.test(receipt.visibleText.privacyCorpusSha256 ?? '') ||
    !sameKeys(receipt.assertions, ExpectedAssertionNames)
  ) {
    fail(`Surface receipt header diverged for ${scenario}.`)
  }

  if (specification.expectedPath !== null) {
    if (
      receipt.state.relativePaths.length !== 1 ||
      receipt.state.relativePaths[0] !== specification.expectedPath ||
      receipt.visibleText.firstPath !== specification.expectedPath
    ) {
      fail(`Surface receipt pointer path diverged for ${scenario}.`)
    }
  }
  if (
    scenario === 'cloud-compression' &&
    (receipt.state.cloudPrivateOptIn !== true ||
      receipt.state.cloudWorkflowReady !== false ||
      receipt.state.persistedCloudOptIn !== true ||
      receipt.state.managedWorkflowKind !== 'encrypted-public-builder-routed' ||
      receipt.state.compressedPointerCount !== 1 ||
      receipt.state.compressionSavingsPercent !== 99.9 ||
      !receipt.visibleText.workflowIndicator.includes(
        'No workflow was added to this private repository'
      ) ||
      !receipt.visibleText.compressionLabel.includes('99.9%'))
  ) {
    fail('Cloud-compression retained-state receipt is invalid.')
  }
  if (
    scenario === 'ui-acceptance' &&
    receipt.visibleText.materializeLabel !== 'Materialize'
  ) {
    fail('UI-acceptance Materialize action receipt is invalid.')
  }
  const failed = ExpectedAssertionNames.filter(
    name => receipt.assertions[name] !== true
  )
  if (failed.length > 0) {
    fail(`Surface gates failed for ${scenario}: ${failed.join(', ')}.`)
  }
  return receipt
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
    ? above
    : upperLeft
}

function inspectPngBytes(bytes, expectedWidth, expectedHeight) {
  if (
    bytes.byteLength < 33 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    fail('The capture is not a valid PNG.')
  }
  let offset = 8
  let header = null
  const compressed = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const start = offset + 8
    const end = start + length
    if (end + 4 > bytes.length) {
      fail('The capture contains a truncated PNG chunk.')
    }
    const data = bytes.subarray(start, end)
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
    } else if (type === 'IDAT') {
      compressed.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset = end + 4
  }
  if (
    header === null ||
    header.width !== expectedWidth ||
    header.height !== expectedHeight ||
    header.bitDepth !== 8 ||
    ![2, 6].includes(header.colorType) ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0 ||
    compressed.length === 0
  ) {
    fail(`The capture PNG contract failed: ${JSON.stringify(header)}`)
  }

  const channels = header.colorType === 6 ? 4 : 3
  const stride = header.width * channels
  const raw = zlib.inflateSync(Buffer.concat(compressed), {
    maxOutputLength: (stride + 1) * header.height,
  })
  if (raw.length !== (stride + 1) * header.height) {
    fail('The capture PNG decompressed to an unexpected size.')
  }
  let previous = Buffer.alloc(stride)
  let cursor = 0
  let minimum = 255
  let maximum = 0
  let darkPixels = 0
  let lightPixels = 0
  const colors = new Set()
  for (let rowIndex = 0; rowIndex < header.height; rowIndex++) {
    const filter = raw[cursor++]
    const encoded = raw.subarray(cursor, cursor + stride)
    cursor += stride
    const row = Buffer.allocUnsafe(stride)
    for (let index = 0; index < stride; index++) {
      const value = encoded[index]
      const left = index >= channels ? row[index - channels] : 0
      const above = previous[index]
      const upperLeft = index >= channels ? previous[index - channels] : 0
      switch (filter) {
        case 0:
          row[index] = value
          break
        case 1:
          row[index] = (value + left) & 0xff
          break
        case 2:
          row[index] = (value + above) & 0xff
          break
        case 3:
          row[index] = (value + Math.floor((left + above) / 2)) & 0xff
          break
        case 4:
          row[index] = (value + paeth(left, above, upperLeft)) & 0xff
          break
        default:
          fail(`The capture PNG uses unsupported filter ${filter}.`)
      }
    }
    for (let index = 0; index < stride; index += channels) {
      const red = row[index]
      const green = row[index + 1]
      const blue = row[index + 2]
      minimum = Math.min(minimum, red, green, blue)
      maximum = Math.max(maximum, red, green, blue)
      const luminance = (red * 2126 + green * 7152 + blue * 722) / 10000
      if (luminance < 8) darkPixels++
      if (luminance > 247) lightPixels++
      if (colors.size < 4096) {
        colors.add(`${red >> 3},${green >> 3},${blue >> 3}`)
      }
    }
    previous = row
  }
  const pixelCount = header.width * header.height
  const stats = {
    width: header.width,
    height: header.height,
    colorType: header.colorType,
    channelMinimum: minimum,
    channelMaximum: maximum,
    quantizedColorCount: colors.size,
    darkPixelRatio: Number((darkPixels / pixelCount).toFixed(6)),
    lightPixelRatio: Number((lightPixels / pixelCount).toFixed(6)),
  }
  if (
    maximum - minimum < 16 ||
    colors.size < 32 ||
    stats.darkPixelRatio > 0.98 ||
    stats.lightPixelRatio > 0.995
  ) {
    fail(`The capture appears blank or monochrome: ${JSON.stringify(stats)}`)
  }
  return stats
}

async function captureOriginalPixels(options) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const buffer = Buffer.from(result.data, 'base64')
  const pixelInspection = inspectPngBytes(
    buffer,
    options.specification.width,
    options.specification.height
  )
  if (buffer.byteLength < 20_000) {
    fail('Capture is suspiciously small and may be blank.')
  }
  fs.writeFileSync(options.capturePath, buffer, { flag: 'wx' })
  return {
    outputFile: options.specification.outputFile,
    source: 'Page.captureScreenshot',
    fromSurface: true,
    captureBeyondViewport: false,
    originalPng: true,
    width: pixelInspection.width,
    height: pixelInspection.height,
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    pixelInspection,
  }
}

function validateFinalReceipt(receipt) {
  if (
    !sameKeys(receipt, [
      'schema',
      'scenario',
      'evidence',
      'repository',
      'viewport',
      'appearance',
      'state',
      'visibleText',
      'assertions',
      'capture',
    ])
  ) {
    fail('Final live gallery receipt keys are invalid.')
  }
  const surface = { ...receipt }
  delete surface.capture
  validateSurfaceReceipt(surface, receipt.scenario)
  const specification = ScenarioSpecifications[receipt.scenario]
  if (
    !sameKeys(receipt.capture, [
      'outputFile',
      'source',
      'fromSurface',
      'captureBeyondViewport',
      'originalPng',
      'width',
      'height',
      'bytes',
      'sha256',
      'pixelInspection',
    ]) ||
    receipt.capture.outputFile !== specification.outputFile ||
    receipt.capture.source !== 'Page.captureScreenshot' ||
    receipt.capture.fromSurface !== true ||
    receipt.capture.captureBeyondViewport !== false ||
    receipt.capture.originalPng !== true ||
    receipt.capture.width !== specification.width ||
    receipt.capture.height !== specification.height ||
    !validPositiveInteger(receipt.capture.bytes) ||
    receipt.capture.bytes < 20_000 ||
    !/^[a-f0-9]{64}$/.test(receipt.capture.sha256 ?? '') ||
    receipt.capture.pixelInspection?.width !== specification.width ||
    receipt.capture.pixelInspection?.height !== specification.height ||
    receipt.capture.pixelInspection?.quantizedColorCount < 32
  ) {
    fail('Final live gallery original-pixel capture proof is invalid.')
  }
  return receipt
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const owned = validateOwnedPaths(options)
  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()

  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await preparePresentation(options.specification)
    const repositoryGate = await validateSelectedRepository(
      options,
      owned.repositoryPath
    )
    await openCheapLfsSurface()
    await positionSurface(options.scenario)
    const surface = validateSurfaceReceipt(
      await evaluate(
        inspectionExpression(options, repositoryGate, owned.preparation)
      ),
      options.scenario
    )
    const capture = await captureOriginalPixels(options)
    const receipt = validateFinalReceipt({ ...surface, capture })
    fs.writeFileSync(
      options.receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      { flag: 'wx' }
    )
    process.stdout.write(
      `GALLERY_CHEAP_LFS_LIVE_RECEIPT ${JSON.stringify(receipt)}\n`
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
        : String(error ?? 'Unknown live Cheap LFS gallery verifier error.')
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  ExpectedAssertionNames,
  PointerVersion,
  ScenarioSpecifications,
  SurfaceReceiptSchema,
  inspectPngBytes,
  inspectionExpression,
  isContainedPath,
  parseArguments,
  parseOriginURL,
  validateGitStateProof,
  validateFinalReceipt,
  validateSurfaceReceipt,
}
