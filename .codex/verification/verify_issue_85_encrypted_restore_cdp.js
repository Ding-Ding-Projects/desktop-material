#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- synchronous paths are bounded to caller-owned Temp output */

/**
 * Genuine encrypted-and-compressed Cheap LFS restore evidence (CDP attach only).
 *
 * First run run_issue_85_encrypted_restore_fixture.js against the disposable
 * repository. Its TypeScript operation helper calls the production
 * pinFileToRelease and materializePointer entrypoints and records their real
 * progress callbacks. This helper then validates that immutable operation
 * receipt, publishes its actual decrypting callback through the real AppStore,
 * captures original Chromium pixels, emits a strict surface receipt, and clears
 * AppStore again.
 *
 * It never launches, focuses, resizes, or terminates the application.
 *
 *   node .codex/verification/verify_issue_85_encrypted_restore_cdp.js \
 *     --port 9337 --run-root <owned-temp-root> \
 *     --repository-path <disposable-repository> \
 *     --operation-receipt <owned-temp-root>/receipts/operation.json \
 *     --capture <owned-temp-root>/captures/decrypting-bilingual.png \
 *     --receipt <owned-temp-root>/receipts/decrypting-bilingual.json
 */

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const WebSocket = require('ws')

const OperationReceiptSchema =
  'desktop-material/cheap-lfs-encrypted-compressed-restore-operation/v1'
const OperationKind = 'genuine-encrypted-compressed-release-restore'
const SurfaceReceiptSchema =
  'desktop-material/cheap-lfs-encrypted-compressed-restore-surface/v1'
const RelativePayloadPath = 'issue-85-encrypted-compressed.bin'
const ExpectedPhaseOrder = Object.freeze([
  'downloading',
  'decrypting',
  'decompressing',
  'verifying',
  'materializing',
])
const Specification = Object.freeze({
  width: 1440,
  height: 960,
  languageMode: 'bilingual',
  funnyLevelEnglish: 1,
  funnyLevelCantonese: 1,
})
const ExpectedAssertionNames = Object.freeze([
  'requestedViewport',
  'darkTheme',
  'bilingualPlainVoice',
  'productionRenderer',
  'appWideCardMounted',
  'cardVisibleAndContained',
  'materialThreeSurface',
  'singlePoliteLiveSummary',
  'sectionAccessibility',
  'progressbarAccessibility',
  'genuineDecryptingBadgeVisible',
  'genuineDecryptingLaneVisible',
  'singleCurrentLaneOnly',
  'repositoryRelativePathVisible',
  'visibleContentNotClipped',
  'reducedMotionHonored',
  'noBlockingDialog',
  'noHorizontalDocumentOverflow',
  'noPrivatePathOrCredentialOutput',
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
    'operation-receipt',
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
  const requiredPath = name => {
    const value = values.get(name)
    if (value === undefined || value.trim().length === 0) {
      fail(`--${name} is required.`)
    }
    return path.resolve(value)
  }

  return {
    port,
    specification: Specification,
    runRoot: requiredPath('run-root'),
    repositoryPath: requiredPath('repository-path'),
    operationReceiptPath: requiredPath('operation-receipt'),
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

function assertRealInputFile(runRoot, candidate, label) {
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
    !isContainedPath(runRoot, real)
  ) {
    fail(`${label} must be one real file inside the owned run root.`)
  }
  return real
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

  const operationReceiptPath = assertRealInputFile(
    runRoot,
    options.operationReceiptPath,
    'Genuine operation receipt'
  )
  ensureOwnedOutput(runRoot, options.capturePath, 'Capture')
  ensureOwnedOutput(runRoot, options.receiptPath, 'Surface receipt')
  const distinct = new Set(
    [operationReceiptPath, options.capturePath, options.receiptPath].map(
      normalizedPath
    )
  )
  if (distinct.size !== 3) {
    fail(
      'Operation receipt, capture, and surface receipt must be different files.'
    )
  }

  return { runRoot, repositoryPath, operationReceiptPath }
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

function validNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function validateOperationReceipt(receipt) {
  if (
    !sameKeys(receipt, [
      'schema',
      'operationKind',
      'result',
      'repositoryRelativePath',
      'releaseTag',
      'productionEntrypoints',
      'provider',
      'transformations',
      'restore',
      'cleanup',
    ]) ||
    receipt.schema !== OperationReceiptSchema ||
    receipt.operationKind !== OperationKind ||
    receipt.result !== 'succeeded' ||
    receipt.repositoryRelativePath !== RelativePayloadPath ||
    receipt.releaseTag !== 'issue-85-encrypted-compressed-restore' ||
    receipt.provider !== 'github-release' ||
    JSON.stringify(receipt.productionEntrypoints) !==
      JSON.stringify(['pinFileToRelease', 'materializePointer'])
  ) {
    fail('Genuine operation receipt header is invalid.')
  }

  const transformations = receipt.transformations
  if (
    !sameKeys(transformations, [
      'compressedBeforeEncryption',
      'encrypted',
      'pointerFormat',
      'plaintextBytes',
      'deflatedBytes',
      'storedCiphertextBytes',
      'plaintextSha256',
      'storedCiphertextSha256',
      'ciphertextDiffersFromPlaintext',
    ]) ||
    transformations.compressedBeforeEncryption !== true ||
    transformations.encrypted !== true ||
    transformations.pointerFormat !== 'part-encrypted-deflate' ||
    !validPositiveInteger(transformations.plaintextBytes) ||
    !validPositiveInteger(transformations.deflatedBytes) ||
    transformations.deflatedBytes >= transformations.plaintextBytes ||
    !validPositiveInteger(transformations.storedCiphertextBytes) ||
    transformations.storedCiphertextBytes <= transformations.deflatedBytes ||
    !/^[a-f0-9]{64}$/.test(transformations.plaintextSha256) ||
    !/^[a-f0-9]{64}$/.test(transformations.storedCiphertextSha256) ||
    transformations.storedCiphertextSha256 ===
      transformations.plaintextSha256 ||
    transformations.ciphertextDiffersFromPlaintext !== true
  ) {
    fail('Genuine operation transformation proof is invalid.')
  }

  const restore = receipt.restore
  if (
    !sameKeys(restore, [
      'expectedPhaseOrder',
      'observedPhaseOrder',
      'progressEventCount',
      'decryptingProgress',
      'restoredBytes',
      'restoredSha256',
      'contentMatched',
    ]) ||
    JSON.stringify(restore.expectedPhaseOrder) !==
      JSON.stringify(ExpectedPhaseOrder) ||
    JSON.stringify(restore.observedPhaseOrder) !==
      JSON.stringify(ExpectedPhaseOrder) ||
    !validPositiveInteger(restore.progressEventCount) ||
    restore.restoredBytes !== transformations.plaintextBytes ||
    restore.restoredSha256 !== transformations.plaintextSha256 ||
    restore.contentMatched !== true
  ) {
    fail('Genuine operation restore proof is invalid.')
  }

  const progress = restore.decryptingProgress
  if (
    !sameKeys(progress, [
      'direction',
      'phase',
      'transferredBytes',
      'totalBytes',
      'logicalTransferredBytes',
      'logicalTotalBytes',
      'actualTransferredBytes',
      'actualTotalBytes',
      'partOrdinal',
      'partsTotal',
      'partTransferredBytes',
      'partTotalBytes',
      'queuedParts',
      'activeParts',
    ]) ||
    progress.direction !== 'download' ||
    progress.phase !== 'decrypting' ||
    !validNonNegativeInteger(progress.transferredBytes) ||
    !validPositiveInteger(progress.totalBytes) ||
    !validNonNegativeInteger(progress.logicalTransferredBytes) ||
    !validPositiveInteger(progress.logicalTotalBytes) ||
    !validNonNegativeInteger(progress.actualTransferredBytes) ||
    !validPositiveInteger(progress.actualTotalBytes) ||
    !validPositiveInteger(progress.partOrdinal) ||
    !validPositiveInteger(progress.partsTotal) ||
    !validNonNegativeInteger(progress.partTransferredBytes) ||
    !validPositiveInteger(progress.partTotalBytes) ||
    !validNonNegativeInteger(progress.queuedParts) ||
    !Array.isArray(progress.activeParts) ||
    progress.activeParts.length !== 1
  ) {
    fail('Genuine operation decrypting callback is invalid.')
  }
  const activePart = progress.activeParts[0]
  if (
    !sameKeys(activePart, [
      'partOrdinal',
      'partsTotal',
      'phase',
      'processedBytes',
      'totalBytes',
      'downloadComplete',
    ]) ||
    activePart.phase !== 'decrypting' ||
    !validPositiveInteger(activePart.partOrdinal) ||
    !validPositiveInteger(activePart.partsTotal) ||
    !validNonNegativeInteger(activePart.processedBytes) ||
    !validPositiveInteger(activePart.totalBytes) ||
    activePart.processedBytes > activePart.totalBytes ||
    activePart.downloadComplete !== true
  ) {
    fail('Genuine operation active decrypting part is invalid.')
  }

  const cleanup = receipt.cleanup
  if (
    !sameKeys(cleanup, [
      'uploadTemporaryPathCount',
      'downloadTemporaryPathCount',
      'allTemporaryPayloadFilesRemoved',
      'passwordBufferZeroed',
      'providerPayloadBuffersZeroed',
    ]) ||
    !validPositiveInteger(cleanup.uploadTemporaryPathCount) ||
    !validPositiveInteger(cleanup.downloadTemporaryPathCount) ||
    cleanup.allTemporaryPayloadFilesRemoved !== true ||
    cleanup.passwordBufferZeroed !== true ||
    cleanup.providerPayloadBuffersZeroed !== true
  ) {
    fail('Genuine operation cleanup proof is invalid.')
  }

  const privacyCorpus = JSON.stringify(receipt)
  if (
    /(C:\\Users\\|C:\/Users\/|ADMINI~1|AppData[\\/]|(?:^|[\\/])Temp[\\/])/i.test(
      privacyCorpus
    ) ||
    /(authorization\s*[:=]|bearer\s|github_pat_|ghp_|verification-token-never-sent)/i.test(
      privacyCorpus
    )
  ) {
    fail('Genuine operation receipt contains a private path or credential.')
  }
  return receipt
}

function loadOperationReceipt(operationReceiptPath) {
  const bytes = fs.readFileSync(operationReceiptPath)
  let receipt
  try {
    receipt = JSON.parse(bytes.toString('utf8'))
  } catch {
    fail('Genuine operation receipt is not valid JSON.')
  }
  return {
    receipt: validateOperationReceipt(receipt),
    bytes: bytes.byteLength,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }
}

function buildAppProgress(operationReceipt, repositoryId, repositoryName) {
  const transformations = operationReceipt.transformations
  const progress = operationReceipt.restore.decryptingProgress
  const active = progress.activeParts[0]
  const logicalTotalBytes = transformations.plaintextBytes
  const logicalProcessedBytes = Math.min(
    logicalTotalBytes,
    progress.logicalTransferredBytes
  )
  const laneTotalBytes = active.totalBytes
  const laneProcessedBytes = Math.min(laneTotalBytes, active.processedBytes)
  const percent =
    laneTotalBytes > 0
      ? Math.floor((laneProcessedBytes / laneTotalBytes) * 100)
      : null
  return {
    repositoryId,
    repositoryName,
    provider: 'github-release',
    phase: 'decrypting',
    filesSucceeded: 0,
    filesFailed: 0,
    filesRemaining: 1,
    filesTotal: 1,
    logicalProcessedBytes,
    logicalTotalBytes,
    actualDownloadedBytes: progress.actualTransferredBytes,
    actualDownloadTotalBytes: progress.actualTotalBytes,
    downloadRateBytesPerSecond: null,
    etaSeconds: null,
    elapsedSeconds: 1,
    queuedFiles: 0,
    queuedParts: progress.queuedParts,
    currentLane: {
      provider: 'github-release',
      phase: 'decrypting',
      relativePath: operationReceipt.repositoryRelativePath,
      fileOrdinal: 1,
      filesTotal: 1,
      partOrdinal: progress.partOrdinal,
      partsTotal: progress.partsTotal,
      processedBytes: laneProcessedBytes,
      totalBytes: laneTotalBytes,
      percent,
    },
    prefetchLane: null,
    lookAheadThresholdPercent: 90,
    failures: [],
    cancelRequested: false,
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
    'audio-system-settings-v1': JSON.stringify({
      funnyLevelEnglish: specification.funnyLevelEnglish,
      funnyLevelCantonese: specification.funnyLevelCantonese,
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
    width: specification.width,
    height: specification.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: specification.width,
    screenHeight: specification.height,
  })
  await new Promise(resolve => setTimeout(resolve, 500))
  await waitFor(
    `(() => {
      let audio
      try {
        audio = JSON.parse(localStorage.getItem('audio-system-settings-v1') ?? '{}')
      } catch {
        return false
      }
      return (
        document.body.classList.contains('theme-dark') &&
        localStorage.getItem('theme') === 'dark' &&
        document.body.getAttribute('data-dm-language-mode') === 'bilingual' &&
        document.documentElement.getAttribute('data-language-mode') === 'bilingual' &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1 &&
        matchMedia('(prefers-reduced-motion: reduce)').matches &&
        innerWidth === ${specification.width} &&
        innerHeight === ${specification.height}
      )
    })()`,
    'requested dark bilingual plain-voice presentation'
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

async function hydrateAppState(repositoryPath, operationReceipt) {
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
    if (selectedPath.toLowerCase() !== expectedPath.toLowerCase()) {
      return {
        appStoreFound: true,
        repositorySelected: true,
        repositoryMatched: false,
      }
    }
    if (typeof repository.id !== 'number' || !Number.isSafeInteger(repository.id)) {
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
    const buildAppProgress = ${buildAppProgress.toString()}
    const progress = buildAppProgress(
      ${JSON.stringify(operationReceipt)},
      repository.id,
      repositoryName
    )
    globalThis.__desktopMaterialIssue85RestoreVerificationAppStore = appStore
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
      phase: current?.phase ?? null,
      currentLanePhase: current?.currentLane?.phase ?? null,
      currentLanePath: current?.currentLane?.relativePath ?? null,
      prefetchLanePresent: current?.prefetchLane !== null,
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
    receipt.phase !== 'decrypting' ||
    receipt.currentLanePhase !== 'decrypting' ||
    receipt.currentLanePath !== RelativePayloadPath ||
    receipt.prefetchLanePresent !== false
  ) {
    fail(
      `App-native genuine decrypting progress hydration failed: ${JSON.stringify(
        receipt
      )}`
    )
  }
  return receipt
}

async function settleSurface() {
  await waitFor(
    `document.querySelectorAll(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    ).length === 1`,
    'one app-wide genuine Cheap LFS restore progress card'
  )
  const settled = await evaluate(`(async () => {
    const card = document.querySelector(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    )
    if (!(card instanceof HTMLElement)) return false
    await document.fonts.ready
    card.scrollTop = 0
    for (let index = 0; index < 3; index += 1) {
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    }
    return document.fonts.status === 'loaded'
  })()`)
  if (settled !== true) {
    fail('Genuine decrypting progress surface did not settle.')
  }
}

async function inspectSurface(options, hydration, operationEvidence) {
  return await evaluate(`(() => {
    const card = document.querySelector(
      '.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]'
    )
    const strip = card?.parentElement
    const badges = card?.querySelector('.cheap-lfs-restore-badges')
    const phaseBadge = badges?.lastElementChild
    const summary = card?.querySelector('.cheap-lfs-restore-summary')
    const overall = card?.querySelector(
      '.cheap-lfs-restore-overall [role="progressbar"]'
    )
    const lanes = card?.querySelector('.cheap-lfs-restore-lanes')
    const current = card?.querySelector('.cheap-lfs-restore-lane.current')
    const currentBar = current?.querySelector('[role="progressbar"]')
    const currentPath = current?.querySelector('.cheap-lfs-restore-lane-path')
    const currentPhase = current?.querySelector(
      '.cheap-lfs-restore-lane-meta > span:last-child'
    )
    if (
      !(card instanceof HTMLElement) ||
      !(strip instanceof HTMLElement) ||
      !(badges instanceof HTMLElement) ||
      !(phaseBadge instanceof HTMLElement) ||
      !(summary instanceof HTMLElement) ||
      !(overall instanceof HTMLElement) ||
      !(lanes instanceof HTMLElement) ||
      !(current instanceof HTMLElement) ||
      !(currentBar instanceof HTMLElement) ||
      !(currentPath instanceof HTMLElement) ||
      !(currentPhase instanceof HTMLElement)
    ) {
      throw new Error('A required genuine decrypting progress element is missing.')
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
    const normalizedText = element =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    const viewport = {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
    }
    const cardRect = card.getBoundingClientRect()
    const cardStyle = getComputedStyle(card)
    const cardText = normalizedText(card)
    const phaseBadgeText = normalizedText(phaseBadge)
    const lanePhaseText = normalizedText(currentPhase)
    const pathText = normalizedText(currentPath)
    const progressbars = [...card.querySelectorAll('[role="progressbar"]')]
    const statuses = [...card.querySelectorAll('[role="status"]')]
    const visibleDialogs = [...document.querySelectorAll(
      'dialog[open], [role="dialog"][aria-modal="true"]'
    )].filter(element => element instanceof HTMLElement && visible(element))
    const privacyCorpus = [
      card.innerText,
      ...[...card.querySelectorAll('[aria-label], [aria-valuetext], [title]')]
        .flatMap(element => [
          element.getAttribute('aria-label') ?? '',
          element.getAttribute('aria-valuetext') ?? '',
          element.getAttribute('title') ?? '',
        ]),
    ].join('\n')
    const privateOutput =
      /(C:\\Users\\|C:\/Users\/|ADMINI~1|AppData[\\/]|(?:^|[\\/])Temp[\\/]|desktop-material-cheap-lfs-restore-progress-)/i
    const forbiddenOutput =
      /(authorization\s*[:=]|bearer\s|github_pat_|ghp_|[?&](token|access_token)=|verification-token-never-sent)/i
    let audio = {}
    try {
      audio = JSON.parse(localStorage.getItem('audio-system-settings-v1') ?? '{}')
    } catch {}

    const assertions = {
      requestedViewport:
        innerWidth === ${options.specification.width} &&
        innerHeight === ${options.specification.height} &&
        devicePixelRatio === 1,
      darkTheme:
        document.body.classList.contains('theme-dark') &&
        localStorage.getItem('theme') === 'dark',
      bilingualPlainVoice:
        document.body.getAttribute('data-dm-language-mode') === 'bilingual' &&
        document.documentElement.getAttribute('data-language-mode') ===
          'bilingual' &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1,
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
        within(cardRect, viewport) &&
        cardRect.width > 700 &&
        cardRect.height > 250,
      materialThreeSurface:
        cardStyle.backgroundColor !== 'transparent' &&
        cardStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        (Number.parseFloat(cardStyle.borderTopLeftRadius) || 0) >= 8 &&
        card.querySelectorAll('.material-symbol').length >= 2,
      singlePoliteLiveSummary:
        statuses.length === 1 &&
        statuses[0] === summary &&
        summary.getAttribute('aria-live') === 'polite' &&
        summary.getAttribute('aria-atomic') === 'true',
      sectionAccessibility:
        card.tagName === 'SECTION' &&
        card.getAttribute('aria-busy') === 'true' &&
        (card.getAttribute('aria-label') ?? '').trim().length > 0,
      progressbarAccessibility:
        progressbars.length === 2 &&
        progressbars.every(progressbar =>
          progressbar.getAttribute('role') === 'progressbar' &&
          progressbar.getAttribute('aria-valuemin') === '0' &&
          progressbar.getAttribute('aria-valuemax') === '100' &&
          (progressbar.getAttribute('aria-valuetext') ?? '').trim().length > 0
        ),
      genuineDecryptingBadgeVisible:
        visible(phaseBadge) &&
        phaseBadgeText === 'Phase: Decrypting · 階段：解密緊' &&
        cardText.includes('Decrypting') &&
        cardText.includes('解密緊'),
      genuineDecryptingLaneVisible:
        visible(currentPhase) &&
        lanePhaseText === 'Decrypting · 解密緊' &&
        current.getAttribute('role') === 'group' &&
        (current.getAttribute('aria-label') ?? '').trim().length > 0,
      singleCurrentLaneOnly:
        card.querySelectorAll('.cheap-lfs-restore-lane').length === 1 &&
        card.querySelector('.cheap-lfs-restore-lane.prefetch') === null,
      repositoryRelativePathVisible:
        visible(currentPath) &&
        pathText === ${JSON.stringify(RelativePayloadPath)},
      visibleContentNotClipped:
        ![phaseBadge, summary, lanes, current, currentPath, currentPhase].some(
          element =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1
        ),
      reducedMotionHonored:
        matchMedia('(prefers-reduced-motion: reduce)').matches &&
        [...card.querySelectorAll('*')].every(element => {
          const style = getComputedStyle(element)
          return (
            style.animationName === 'none' ||
            style.animationDuration === '0s' ||
            style.animationPlayState === 'paused'
          )
        }),
      noBlockingDialog: visibleDialogs.length === 0,
      noHorizontalDocumentOverflow:
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.body.scrollWidth <= innerWidth + 1 &&
        card.scrollWidth <= card.clientWidth + 1,
      noPrivatePathOrCredentialOutput:
        !privateOutput.test(privacyCorpus) &&
        !forbiddenOutput.test(privacyCorpus) &&
        !card.innerHTML.includes('<script'),
    }
    return {
      schema: ${JSON.stringify(SurfaceReceiptSchema)},
      operation: ${JSON.stringify(operationEvidence)},
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
      },
      appearance: {
        theme: 'dark',
        languageMode:
          document.body.getAttribute('data-dm-language-mode'),
        funnyLevelEnglish: audio.funnyLevelEnglish ?? null,
        funnyLevelCantonese: audio.funnyLevelCantonese ?? null,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
      hydration: ${JSON.stringify(hydration)},
      visibleText: {
        phaseBadge: phaseBadgeText,
        lanePhase: lanePhaseText,
        relativePath: pathText,
      },
      assertions,
    }
  })()`)
}

function validateSurfaceReceipt(receipt) {
  if (
    !sameKeys(receipt, [
      'schema',
      'operation',
      'viewport',
      'appearance',
      'hydration',
      'visibleText',
      'assertions',
    ]) ||
    receipt.schema !== SurfaceReceiptSchema ||
    receipt.operation?.schema !== OperationReceiptSchema ||
    receipt.operation?.operationKind !== OperationKind ||
    JSON.stringify(receipt.operation?.observedPhaseOrder) !==
      JSON.stringify(ExpectedPhaseOrder) ||
    receipt.operation?.contentMatched !== true ||
    receipt.operation?.temporaryPayloadFilesRemoved !== true ||
    !/^[a-f0-9]{64}$/.test(receipt.operation?.receiptSha256 ?? '') ||
    receipt.viewport?.width !== Specification.width ||
    receipt.viewport?.height !== Specification.height ||
    receipt.viewport?.devicePixelRatio !== 1 ||
    receipt.appearance?.theme !== 'dark' ||
    receipt.appearance?.languageMode !== 'bilingual' ||
    receipt.appearance?.funnyLevelEnglish !== 1 ||
    receipt.appearance?.funnyLevelCantonese !== 1 ||
    receipt.appearance?.reducedMotion !== true ||
    receipt.hydration?.phase !== 'decrypting' ||
    receipt.hydration?.currentLanePhase !== 'decrypting' ||
    receipt.hydration?.currentLanePath !== RelativePayloadPath ||
    receipt.hydration?.prefetchLanePresent !== false ||
    receipt.visibleText?.phaseBadge !== 'Phase: Decrypting · 階段：解密緊' ||
    receipt.visibleText?.lanePhase !== 'Decrypting · 解密緊' ||
    receipt.visibleText?.relativePath !== RelativePayloadPath ||
    !sameKeys(receipt.assertions, ExpectedAssertionNames)
  ) {
    fail('Genuine decrypting surface receipt structure is invalid.')
  }
  const failures = ExpectedAssertionNames.filter(
    name => receipt.assertions[name] !== true
  )
  if (failures.length > 0) {
    fail(`Genuine decrypting surface gates failed: ${failures.join(', ')}.`)
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
      globalThis.__desktopMaterialIssue85RestoreVerificationAppStore ??
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
    delete globalThis.__desktopMaterialIssue85RestoreVerificationAppStore
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
    'genuine Cheap LFS restore progress cleanup'
  )
  return { ...update, cardRemoved: true }
}

function validateFinalReceipt(receipt) {
  if (
    !sameKeys(receipt, [
      'schema',
      'operation',
      'viewport',
      'appearance',
      'hydration',
      'visibleText',
      'assertions',
      'capture',
      'cleanup',
    ])
  ) {
    fail('Final genuine decrypting receipt keys are invalid.')
  }
  const surface = { ...receipt }
  delete surface.capture
  delete surface.cleanup
  validateSurfaceReceipt(surface)
  if (
    receipt.capture?.width !== Specification.width ||
    receipt.capture?.height !== Specification.height ||
    !validPositiveInteger(receipt.capture?.bytes) ||
    receipt.capture.bytes < 20_000 ||
    !/^[a-f0-9]{64}$/.test(receipt.capture?.sha256 ?? '') ||
    receipt.cleanup?.appStoreFound !== true ||
    receipt.cleanup?.updateInvoked !== true ||
    receipt.cleanup?.stateCleared !== true ||
    receipt.cleanup?.cardRemoved !== true
  ) {
    fail('Final genuine decrypting capture or cleanup proof is invalid.')
  }
  return receipt
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const owned = validateOwnedPaths(options)
  const loadedOperation = loadOperationReceipt(owned.operationReceiptPath)
  const operationEvidence = {
    schema: loadedOperation.receipt.schema,
    operationKind: loadedOperation.receipt.operationKind,
    receiptBytes: loadedOperation.bytes,
    receiptSha256: loadedOperation.sha256,
    observedPhaseOrder: loadedOperation.receipt.restore.observedPhaseOrder,
    contentMatched: loadedOperation.receipt.restore.contentMatched,
    temporaryPayloadFilesRemoved:
      loadedOperation.receipt.cleanup.allTemporaryPayloadFilesRemoved,
  }
  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()

  let pendingReceipt = null
  let cleanup = null
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await preparePresentation(options.specification)
    const hydration = await hydrateAppState(
      owned.repositoryPath,
      loadedOperation.receipt
    )
    await settleSurface()
    const surface = validateSurfaceReceipt(
      await inspectSurface(options, hydration, operationEvidence)
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

  const receipt = validateFinalReceipt({ ...pendingReceipt, cleanup })
  fs.writeFileSync(
    options.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx' }
  )
  process.stdout.write(
    `CHEAP_LFS_GENUINE_RESTORE_SURFACE_RECEIPT ${JSON.stringify(receipt)}\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(
            error ??
              'Unknown genuine encrypted Cheap LFS restore surface verifier error.'
          )
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  ExpectedAssertionNames,
  ExpectedPhaseOrder,
  OperationKind,
  OperationReceiptSchema,
  RelativePayloadPath,
  Specification,
  SurfaceReceiptSchema,
  buildAppProgress,
  isContainedPath,
  parseArguments,
  validateFinalReceipt,
  validateOperationReceipt,
  validateSurfaceReceipt,
}
