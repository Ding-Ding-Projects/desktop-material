#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- bounded filesystem work stays in one validated Temp run */

/**
 * Attach-only production verifier for three repository-specialist gallery
 * captures. The caller owns Electron, the loopback CDP port, hidden Win32
 * desktop, provider fixture, and run-root cleanup. This helper never launches,
 * focuses, resizes, closes, or terminates a native window.
 *
 * Example:
 *   node .codex/verification/verify_gallery_repository_specialists_cdp.js \
 *     --port 9337 \
 *     --run-root %TEMP%\desktop-material-p0-ui-<run-id> \
 *     --scenes releases-compact,pull-preview,private-badge \
 *     --releases-output <run-root>\captures\material-github-releases-compact.png \
 *     --pull-output <run-root>\captures\material-pull-preview.png \
 *     --private-output <run-root>\captures\private-repository-lock-badge.png \
 *     --receipt <run-root>\receipts\repository-specialists-receipt.json
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const {
  CDPClient,
  evaluate,
  getJSON,
} = require('./verify_actions_pagination_cdp')

const CaptureWidth = 960
const CaptureHeight = 660
const RunRootPattern =
  /^desktop-material-p0-ui-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/
const ReceiptBasename = 'repository-specialists-receipt.json'
const PullFixtureDirectory = 'repository-specialists-pull'

const SceneSpecifications = Object.freeze({
  'releases-compact': Object.freeze({
    outputOption: 'releases-output',
    outputBasename: 'material-github-releases-compact.png',
  }),
  'pull-preview': Object.freeze({
    outputOption: 'pull-output',
    outputBasename: 'material-pull-preview.png',
  }),
  'private-badge': Object.freeze({
    outputOption: 'private-output',
    outputBasename: 'private-repository-lock-badge.png',
  }),
})

const PullChangedPaths = Object.freeze([
  Object.freeze({ status: 'M', path: 'config/material.json' }),
  Object.freeze({ status: 'A', path: 'docs/incoming-guide.md' }),
  Object.freeze({ status: 'D', path: 'docs/retired.md' }),
])

function fail(message) {
  throw new Error(message)
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

function assertRealFile(candidate, label, maximumBytes = 1_048_576) {
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
    fail(`${label} is not a bounded real file.`)
  }
  return real
}

function parseArguments(argv) {
  const values = new Map()
  const supported = new Set([
    'port',
    'run-root',
    'scenes',
    'releases-output',
    'pull-output',
    'private-output',
    'receipt',
  ])
  if (argv.length === 0 || argv.length % 2 !== 0) {
    fail('Arguments must be complete --name value pairs.')
  }
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (!option?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${option ?? '<end>'}.`)
    }
    const name = option.slice(2)
    if (!supported.has(name)) {
      fail(`Unsupported argument ${option}.`)
    }
    if (values.has(name)) {
      fail(`Duplicate argument ${option}.`)
    }
    values.set(name, value)
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }
  const runRootValue = values.get('run-root')
  if (runRootValue === undefined || runRootValue.trim() === '') {
    fail('--run-root is required.')
  }
  const requestedScenes = (values.get('scenes') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  if (requestedScenes.length === 0) {
    fail('--scenes must select at least one specialist scene.')
  }
  if (new Set(requestedScenes).size !== requestedScenes.length) {
    fail('--scenes may not contain duplicates.')
  }
  for (const scene of requestedScenes) {
    if (!Object.hasOwn(SceneSpecifications, scene)) {
      fail(`Unsupported specialist scene ${JSON.stringify(scene)}.`)
    }
  }

  const runRoot = path.resolve(runRootValue)
  const outputs = {}
  for (const [scene, specification] of Object.entries(SceneSpecifications)) {
    const value = values.get(specification.outputOption)
    if (requestedScenes.includes(scene)) {
      if (value === undefined || value.trim() === '') {
        fail(`--${specification.outputOption} is required for ${scene}.`)
      }
      const output = path.resolve(value)
      if (path.basename(output) !== specification.outputBasename) {
        fail(
          `--${specification.outputOption} must end in ${specification.outputBasename}.`
        )
      }
      outputs[scene] = output
    } else if (value !== undefined) {
      fail(`--${specification.outputOption} requires selecting ${scene}.`)
    }
  }

  const receiptValue = values.get('receipt')
  if (receiptValue === undefined || receiptValue.trim() === '') {
    fail('--receipt is required.')
  }
  const receiptPath = path.resolve(receiptValue)
  if (path.basename(receiptPath) !== ReceiptBasename) {
    fail(`--receipt must end in ${ReceiptBasename}.`)
  }
  return {
    port,
    runRoot,
    scenes: Object.keys(SceneSpecifications).filter(scene =>
      requestedScenes.includes(scene)
    ),
    outputs,
    receiptPath,
  }
}

function ensureNewOwnedFile(runRoot, candidate, label) {
  if (!isContainedPath(runRoot, candidate)) {
    fail(`${label} must stay inside the owned run root.`)
  }
  if (fs.existsSync(candidate)) {
    fail(`${label} must be a new file.`)
  }
  fs.mkdirSync(path.dirname(candidate), { recursive: true })
  const realParent = assertRealDirectory(
    path.dirname(candidate),
    `${label} parent`
  )
  if (!isContainedPath(runRoot, realParent)) {
    fail(`${label} parent escaped the owned run root.`)
  }
}

function validateOwnedPaths(options) {
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(path.dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !RunRootPattern.test(path.basename(runRoot))
  ) {
    fail('Run root must be a direct Temp child named desktop-material-p0-ui-*.')
  }

  const distinct = new Set()
  for (const scene of options.scenes) {
    const output = options.outputs[scene]
    ensureNewOwnedFile(runRoot, output, `${scene} capture`)
    const normalized = normalizedPath(output)
    if (distinct.has(normalized)) {
      fail('Every scene must use a distinct output file.')
    }
    distinct.add(normalized)
  }
  ensureNewOwnedFile(runRoot, options.receiptPath, 'Receipt')
  if (distinct.has(normalizedPath(options.receiptPath))) {
    fail('Receipt and capture paths must be distinct.')
  }

  if (
    options.scenes.includes('releases-compact') ||
    options.scenes.includes('private-badge')
  ) {
    const fixture = assertRealDirectory(
      path.join(runRoot, 'fixture'),
      'Selected disposable repository'
    )
    if (!isContainedPath(runRoot, fixture)) {
      fail('Selected disposable repository escaped the run root.')
    }
    const gitEntry = assertRealDirectory(
      path.join(fixture, '.git'),
      'Selected disposable repository .git'
    )
    if (!isContainedPath(fixture, gitEntry)) {
      fail('Selected disposable repository .git escaped the fixture.')
    }
  }
  return { ...options, runRoot }
}

function validateLoopbackEndpoint(value) {
  let endpoint
  try {
    endpoint = new URL(value)
  } catch {
    fail('Provider readiness endpoint is invalid.')
  }
  if (
    endpoint.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(
      endpoint.hostname.toLowerCase()
    ) ||
    endpoint.pathname.replace(/\/$/, '') !== '/api/v3' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    fail('Provider readiness must use an uncredentialed loopback /api/v3 URL.')
  }
  return endpoint.toString().replace(/\/$/, '')
}

function readProviderIdentity(runRoot) {
  const providerDirectory = assertRealDirectory(
    path.join(runRoot, 'provider'),
    'Provider directory'
  )
  if (!isContainedPath(runRoot, providerDirectory)) {
    fail('Provider directory escaped the run root.')
  }
  const readyPath = assertRealFile(
    path.join(providerDirectory, 'ready.json'),
    'Provider readiness',
    32_768
  )
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(readyPath, 'utf8'))
  } catch {
    fail('Provider readiness JSON is invalid.')
  }
  const endpoint = validateLoopbackEndpoint(parsed.endpoint)
  if (
    parsed.bind !== '127.0.0.1' ||
    !Number.isSafeInteger(parsed.port) ||
    parsed.port < 1 ||
    parsed.port > 65535 ||
    !/^[A-Za-z0-9-]{1,39}$/.test(parsed.owner ?? '') ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(parsed.repository ?? '')
  ) {
    fail('Provider readiness identity is incomplete.')
  }
  return {
    endpoint,
    owner: parsed.owner,
    repository: parsed.repository,
    requestLog: path.join(providerDirectory, 'requests.jsonl'),
  }
}

function countProviderRequests(provider) {
  const requestLog = assertRealFile(
    provider.requestLog,
    'Provider request log',
    8 * 1024 * 1024
  )
  const text = fs.readFileSync(requestLog, 'utf8')
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  for (const line of lines) {
    try {
      JSON.parse(line)
    } catch {
      fail('Provider request log contains an incomplete record.')
    }
  }
  return lines.length
}

const GitNullDevice = 'NUL'
const GitRedirectEnvironmentNames = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_EXEC_PATH',
  'GIT_GLOB_PATHSPECS',
  'GIT_GRAFT_FILE',
  'GIT_ICASE_PATHSPECS',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_LITERAL_PATHSPECS',
  'GIT_NAMESPACE',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_REDIRECT_STDERR',
  'GIT_REDIRECT_STDIN',
  'GIT_REDIRECT_STDOUT',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_SUPER_PREFIX',
  'GIT_TEMPLATE_DIR',
  'GIT_WORK_TREE',
])

function gitEnvironment(extra = {}) {
  const environment = { ...process.env, ...extra }
  for (const key of Object.keys(environment)) {
    const normalized = key.toUpperCase()
    if (
      /^GIT_CONFIG(?:_|$)/.test(normalized) ||
      /^GIT_TRACE(?:2)?(?:_|$)/.test(normalized) ||
      GitRedirectEnvironmentNames.includes(normalized)
    ) {
      delete environment[key]
    }
  }
  return {
    ...environment,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: GitNullDevice,
    GIT_CONFIG_SYSTEM: GitNullDevice,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_AUTHOR_NAME: 'Desktop Material Verifier',
    GIT_AUTHOR_EMAIL: 'verifier@example.invalid',
    GIT_COMMITTER_NAME: 'Desktop Material Verifier',
    GIT_COMMITTER_EMAIL: 'verifier@example.invalid',
  }
}

function git(cwd, args, extraEnvironment = {}) {
  try {
    return execFileSync(
      'git',
      [
        '-c',
        'commit.gpgSign=false',
        '-c',
        'tag.gpgSign=false',
        '-c',
        'push.gpgSign=false',
        '-c',
        `core.hooksPath=${GitNullDevice}`,
        ...args,
      ],
      {
        cwd,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
        env: gitEnvironment(extraEnvironment),
      }
    ).trim()
  } catch (error) {
    const stderr = String(error?.stderr ?? '')
      .replace(/[A-Za-z]:\\[^\r\n]*/g, '<owned-path>')
      .slice(0, 500)
    fail(`Bounded Git fixture command failed: ${stderr || 'no details'}`)
  }
}

function writeFixtureText(root, relativePath, text) {
  const target = path.join(root, ...relativePath.split('/'))
  if (!isContainedPath(root, target)) {
    fail('Pull fixture file escaped its owned repository.')
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text, { encoding: 'utf8', flag: 'wx' })
}

function replaceFixtureText(root, relativePath, text) {
  const target = path.join(root, ...relativePath.split('/'))
  if (!isContainedPath(root, target) || !fs.existsSync(target)) {
    fail('Pull fixture replacement target is invalid.')
  }
  fs.writeFileSync(target, text, { encoding: 'utf8', flag: 'w' })
}

function snapshotLocalRefs(repositoryPath) {
  return git(repositoryPath, [
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    'refs/heads',
    'refs/tags',
  ])
}

function inspectPullFixture(fixture) {
  const status = git(fixture.app, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ])
  const headOid = git(fixture.app, ['rev-parse', 'HEAD'])
  const remoteTrackingOid = git(fixture.app, [
    'rev-parse',
    'refs/remotes/origin/main',
  ])
  const branch = git(fixture.app, ['branch', '--show-current'])
  const upstreamFetched = remoteTrackingOid === fixture.expectedUpstreamOid
  const comparisonRepository = upstreamFetched ? fixture.app : fixture.seed
  const comparisonBase = upstreamFetched ? 'HEAD' : headOid
  const divergence = upstreamFetched
    ? git(fixture.app, [
        'rev-list',
        '--left-right',
        '--count',
        `HEAD...${fixture.expectedUpstreamOid}`,
      ])
        .split(/\s+/)
        .map(Number)
    : [
        0,
        Number(
          git(fixture.seed, [
            'rev-list',
            '--count',
            `${headOid}..${fixture.expectedUpstreamOid}`,
          ])
        ),
      ]
  const changedPaths = git(comparisonRepository, [
    'diff',
    '--name-status',
    comparisonBase,
    fixture.expectedUpstreamOid,
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const [statusCode, ...pathParts] = line.split('\t')
      return { status: statusCode.slice(0, 1), path: pathParts.at(-1) }
    })
  return {
    status,
    headOid,
    remoteTrackingOid,
    branch,
    ahead: divergence[0],
    behind: divergence[1],
    changedPaths,
    localRefs: snapshotLocalRefs(fixture.app),
  }
}

function createPullFixture(runRoot) {
  const root = path.join(runRoot, PullFixtureDirectory)
  if (!isContainedPath(runRoot, root) || fs.existsSync(root)) {
    fail('Owned pull fixture directory must be new.')
  }
  fs.mkdirSync(root)
  const origin = path.join(root, 'origin.git')
  const seed = path.join(root, 'seed')
  const app = path.join(root, 'app')

  git(root, ['init', '--bare', '--quiet', origin])
  git(root, ['init', '--quiet', '--initial-branch=main', seed])
  writeFixtureText(seed, 'README.md', '# Repository specialist pull fixture\n')
  writeFixtureText(seed, 'config/material.json', '{ "accent": "baseline" }\n')
  writeFixtureText(seed, 'docs/retired.md', '# Retired baseline note\n')
  git(seed, ['add', '--all'])
  git(seed, ['commit', '--quiet', '-m', 'Base specialist fixture'], {
    GIT_AUTHOR_DATE: '2024-01-01T12:00:00Z',
    GIT_COMMITTER_DATE: '2024-01-01T12:00:00Z',
  })
  git(seed, ['remote', 'add', 'origin', origin])
  git(seed, ['push', '--quiet', '--set-upstream', 'origin', 'main'])
  git(root, ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
  git(root, ['clone', '--quiet', origin, app])

  replaceFixtureText(
    seed,
    'config/material.json',
    '{ "accent": "verified", "density": "comfortable" }\n'
  )
  writeFixtureText(
    seed,
    'docs/incoming-guide.md',
    '# Incoming repository specialist guide\n'
  )
  git(seed, ['add', '--all'])
  git(seed, ['commit', '--quiet', '-m', 'Add incoming material guidance'], {
    GIT_AUTHOR_DATE: '2024-01-02T12:00:00Z',
    GIT_COMMITTER_DATE: '2024-01-02T12:00:00Z',
  })
  fs.unlinkSync(path.join(seed, 'docs', 'retired.md'))
  git(seed, ['add', '--all'])
  git(seed, ['commit', '--quiet', '-m', 'Retire superseded guidance'], {
    GIT_AUTHOR_DATE: '2024-01-03T12:00:00Z',
    GIT_COMMITTER_DATE: '2024-01-03T12:00:00Z',
  })
  const expectedUpstreamOid = git(seed, ['rev-parse', 'HEAD'])
  git(seed, ['push', '--quiet', 'origin', 'main'])

  for (const [candidate, label] of [
    [root, 'Pull fixture'],
    [origin, 'Pull fixture origin'],
    [seed, 'Pull fixture seed'],
    [app, 'Pull fixture app repository'],
  ]) {
    const real = assertRealDirectory(candidate, label)
    if (!isContainedPath(runRoot, real)) {
      fail(`${label} escaped the run root.`)
    }
  }
  const fixture = { root, origin, seed, app, expectedUpstreamOid }
  const initial = inspectPullFixture(fixture)
  if (
    initial.status !== '' ||
    initial.branch !== 'main' ||
    initial.ahead !== 0 ||
    initial.behind !== 2 ||
    initial.remoteTrackingOid === expectedUpstreamOid ||
    JSON.stringify(initial.changedPaths) !== JSON.stringify(PullChangedPaths)
  ) {
    fail('Owned pull fixture did not reach the exact two-commit contract.')
  }
  return { ...fixture, initial }
}

const BridgePrelude = `
  const findRepositorySpecialistBridge = () => {
    const root = document.querySelector('#desktop-app-container')
    const nodes = root ? [root, ...root.querySelectorAll('*')] : []
    for (const node of nodes) {
      const fiberKey = Object.keys(node).find(key =>
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$')
      )
      let fiber = fiberKey ? node[fiberKey] : null
      for (let depth = 0; fiber && depth < 180; depth += 1, fiber = fiber.return) {
        if (fiber.stateNode?.props?.appStore &&
            fiber.stateNode?.props?.dispatcher) {
          return fiber.stateNode.props
        }
      }
    }
    return null
  }
`

async function sleep(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitFor(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) {
        return
      }
    } catch (error) {
      const message = String(error)
      if (!/context|reload|destroyed/i.test(message)) {
        throw error
      }
    }
    await sleep(150)
  }
  const diagnostic = await evaluate(
    client,
    `({
      readyState: document.readyState,
      bodyPresent: document.body !== null,
      dialogIds: [...document.querySelectorAll('dialog[open]')]
        .map(value => value.id || '<unnamed>').slice(0, 12),
      visibleButtonCount: [...document.querySelectorAll('button')]
        .filter(value => value.getClientRects().length > 0).length,
    })`
  )
  fail(`Timed out waiting for ${label}: ${JSON.stringify(diagnostic)}`)
}

async function menuEvent(client, name) {
  await evaluate(
    client,
    `require('electron').ipcRenderer.emit(
      'menu-event', {}, ${JSON.stringify(name)}
    ), true`
  )
  await sleep(350)
}

async function dispatchKey(client, key, code, windowsVirtualKeyCode) {
  // 'keyDown' rather than 'rawKeyDown': rawKeyDown skips the default-action
  // processing that turns Enter on a focused button into an activation, so a
  // disclosure driven purely by native button semantics never opened and the
  // keyboard gate timed out against a control that is in fact reachable.
  for (const type of ['keyDown', 'keyUp']) {
    await client.send('Input.dispatchKeyEvent', {
      type,
      key,
      code,
      windowsVirtualKeyCode,
      ...(type === 'keyDown' && key.length === 1 ? { text: key } : {}),
    })
  }
  await sleep(250)
}

async function pressEscape(client) {
  await dispatchKey(client, 'Escape', 'Escape', 27)
}

async function setInput(client, selector, value) {
  const set = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!(element instanceof HTMLInputElement) &&
          !(element instanceof HTMLTextAreaElement)) return false
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter === undefined) return false
      setter.call(element, ${JSON.stringify(value)})
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`
  )
  if (!set) {
    fail(`Unable to set production input ${selector}.`)
  }
}

async function clickText(client, label, within) {
  const clicked = await evaluate(
    client,
    `(() => {
      const scope = document.querySelector(${JSON.stringify(within)})
      if (!(scope instanceof HTMLElement)) return false
      const target = [...scope.querySelectorAll('button, [role="button"]')]
        .find(element =>
          (element.textContent ?? '').replace(/\\s+/g, ' ').trim() ===
            ${JSON.stringify(label)} &&
          element.getAttribute('aria-disabled') !== 'true' &&
          !element.disabled
        )
      if (!(target instanceof HTMLElement)) return false
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      target.click()
      return true
    })()`
  )
  if (!clicked) {
    fail(`Unable to activate ${JSON.stringify(label)} in ${within}.`)
  }
}

async function configureViewport(client, zoomFactor = 1) {
  await evaluate(
    client,
    `(async () => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return false
      bridge.appStore._setAutoFitZoomEnabled(false)
      bridge.appStore._setZoomBaseFactor(${JSON.stringify(zoomFactor)})
      return true
    })()`
  )
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: CaptureWidth,
    height: CaptureHeight,
    screenWidth: CaptureWidth,
    screenHeight: CaptureHeight,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await waitFor(
    client,
    `Math.abs(require('electron').webFrame.getZoomFactor() -
      ${JSON.stringify(zoomFactor)}) < 0.001`,
    `${Math.round(zoomFactor * 100)}% application zoom`
  )
  await sleep(450)
}

async function snapshotPresentation(client) {
  const snapshot = await evaluate(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return null
      const state = bridge.appStore.getState()
      const selectedSection = [...document.querySelectorAll(
        'nav.repository-rail button[aria-selected="true"], nav.repository-rail [role="tab"][aria-selected="true"]'
      )][0]
      return {
        innerWidth,
        innerHeight,
        webZoomFactor: require('electron').webFrame.getZoomFactor(),
        zoomBaseFactor: state.zoomBaseFactor,
        windowZoomFactor: state.windowZoomFactor,
        autoFitZoomEnabled: state.autoFitZoomEnabled,
        selectedRepositoryId: bridge.appStore.selectedRepository?.id ?? null,
        selectedRepositoryPath: bridge.appStore.selectedRepository?.path ?? null,
        selectedSectionName:
          selectedSection?.getAttribute('aria-label') ??
          selectedSection?.textContent?.replace(/\\s+/g, ' ').trim() ??
          null,
        languageMode:
          document.documentElement.getAttribute('data-language-mode') ??
          document.body.getAttribute('data-dm-language-mode'),
        theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light',
      }
    })()`
  )
  if (
    snapshot === null ||
    snapshot.selectedRepositoryId === null ||
    typeof snapshot.selectedRepositoryPath !== 'string' ||
    !Number.isFinite(snapshot.webZoomFactor) ||
    !Number.isFinite(snapshot.zoomBaseFactor)
  ) {
    fail('The production AppStore presentation could not be snapshotted.')
  }
  return snapshot
}

async function restorePresentation(client, snapshot) {
  const physicalWidth = Math.max(
    320,
    Math.round(snapshot.innerWidth * snapshot.webZoomFactor)
  )
  const physicalHeight = Math.max(
    240,
    Math.round(snapshot.innerHeight * snapshot.webZoomFactor)
  )
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: physicalWidth,
    height: physicalHeight,
    screenWidth: physicalWidth,
    screenHeight: physicalHeight,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const restored = await evaluate(
    client,
    `(async () => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return false
      bridge.appStore._setAutoFitZoomEnabled(false)
      bridge.appStore._setZoomBaseFactor(${JSON.stringify(
        snapshot.zoomBaseFactor
      )})
      bridge.appStore._setAutoFitZoomEnabled(${JSON.stringify(
        snapshot.autoFitZoomEnabled
      )})
      const original = (await bridge.appStore.repositoriesStore.getAll())
        .find(repository => repository.id === ${JSON.stringify(
          snapshot.selectedRepositoryId
        )})
      if (original !== undefined &&
          bridge.appStore.selectedRepository?.id !== original.id) {
        await bridge.appStore._selectRepository(original)
      }
      return true
    })()`
  )
  if (!restored) {
    fail('App-native presentation restoration hook was unavailable.')
  }
  if (snapshot.selectedSectionName !== null) {
    await evaluate(
      client,
      `(() => {
        const expected = ${JSON.stringify(snapshot.selectedSectionName)}
        const candidate = [...document.querySelectorAll(
          'nav.repository-rail button, nav.repository-rail [role="tab"]'
        )].find(element => {
          const name = element.getAttribute('aria-label') ??
            element.textContent?.replace(/\\s+/g, ' ').trim()
          return name === expected
        })
        if (!(candidate instanceof HTMLElement)) return false
        candidate.click()
        return true
      })()`
    )
  }
  await waitFor(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      const state = bridge?.appStore.getState()
      return bridge !== null &&
        bridge.appStore.selectedRepository?.id ===
          ${JSON.stringify(snapshot.selectedRepositoryId)} &&
        Math.abs(state.zoomBaseFactor -
          ${JSON.stringify(snapshot.zoomBaseFactor)}) < 0.001 &&
        state.autoFitZoomEnabled ===
          ${JSON.stringify(snapshot.autoFitZoomEnabled)} &&
        Math.abs(require('electron').webFrame.getZoomFactor() -
          ${JSON.stringify(snapshot.windowZoomFactor)}) < 0.01 &&
        innerWidth === ${JSON.stringify(snapshot.innerWidth)} &&
        innerHeight === ${JSON.stringify(snapshot.innerHeight)}
    })()`,
    'restored AppStore presentation',
    20_000
  )
  return {
    appStateRestored: true,
    repositorySelectionRestored: true,
    viewportRestored: true,
  }
}

async function assertSelectedFixture(client, runRoot, provider) {
  const expectedPath = path.join(runRoot, 'fixture')
  const receipt = await evaluate(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      const repository = bridge?.appStore.selectedRepository
      if (repository === null || repository === undefined) return null
      const pathModule = require('path')
      return {
        pathMatched:
          pathModule.resolve(repository.path).toLowerCase() ===
            pathModule.resolve(${JSON.stringify(expectedPath)}).toLowerCase(),
        githubMetadataPresent: repository.gitHubRepository !== null,
        owner: repository.gitHubRepository?.owner?.login ?? null,
        name: repository.gitHubRepository?.name ?? null,
        endpoint: repository.gitHubRepository?.endpoint ?? null,
      }
    })()`
  )
  if (
    receipt?.pathMatched !== true ||
    receipt.githubMetadataPresent !== true ||
    receipt.owner !== provider.owner ||
    receipt.name !== provider.repository ||
    receipt.endpoint !== provider.endpoint
  ) {
    fail('Selected repository does not match the owned provider fixture.')
  }
}

function privacyExpression(runRoot) {
  return `(() => {
    const visible = element => {
      if (!(element instanceof Element) || element.getClientRects().length === 0) {
        return false
      }
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0
    }
    const bodyText = document.body?.innerText ?? ''
    const values = [...document.querySelectorAll('input, textarea')]
      .filter(visible).map(element => element.value)
    const attributes = [...document.querySelectorAll('[title], a[href], img[src]')]
      .filter(visible).flatMap(element => [
        element.getAttribute('title') ?? '',
        element.getAttribute('href') ?? '',
        element.getAttribute('src') ?? '',
      ])
    const serialized = [bodyText, ...values, ...attributes].join('\\n')
    const forbidden = [
      ${JSON.stringify(runRoot.toLowerCase())},
      ${JSON.stringify(os.tmpdir().toLowerCase())},
      'c:\\\\users\\\\',
      '\\\\appdata\\\\',
      '/users/',
    ]
    return {
      forbiddenPathAbsent:
        !forbidden.some(value => value.length > 0 &&
          serialized.toLowerCase().includes(value)),
      credentialAbsent:
        !/(?:authorization\\s*[:=]|bearer\\s+[a-z0-9._-]+|github_pat_|gh[pousr]_[a-z0-9]{12,})/i
          .test(serialized),
      visibleInputCount: values.length,
      visibleCharacterCount: serialized.length,
    }
  })()`
}

async function assertPrivacy(client, runRoot) {
  const receipt = await evaluate(client, privacyExpression(runRoot))
  if (
    receipt?.forbiddenPathAbsent !== true ||
    receipt.credentialAbsent !== true
  ) {
    fail('Capture privacy gate rejected visible private data.')
  }
  return {
    forbiddenPathAbsent: true,
    credentialAbsent: true,
    visibleInputCount: receipt.visibleInputCount,
  }
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail('Captured bytes are not an original PNG.')
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function settleCapture(client, keepFocusedTooltip = false) {
  await evaluate(
    client,
    `document.fonts.ready.then(() =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    )`
  )
  if (!keepFocusedTooltip) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 2,
      y: CaptureHeight - 2,
    })
    await sleep(250)
  }
  await waitFor(
    client,
    `(() => [...document.getAnimations({ subtree: true })]
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .every(animation =>
        !animation.pending && animation.playState !== 'running'
      ))()`,
    'settled finite UI animations',
    10_000
  )
}

async function captureOriginalPng(client, outputPath) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const buffer = Buffer.from(result.data, 'base64')
  const dimensions = pngDimensions(buffer)
  if (
    dimensions.width !== CaptureWidth ||
    dimensions.height !== CaptureHeight
  ) {
    fail(
      `Capture dimensions drifted: ${dimensions.width}x${dimensions.height}.`
    )
  }
  if (buffer.length < 20_000) {
    fail('Capture is suspiciously small.')
  }
  fs.writeFileSync(outputPath, buffer, { flag: 'wx' })
  return {
    file: path.basename(outputPath),
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  }
}

function assertBooleanAssertions(assertions, prefix = 'assertions') {
  if (assertions === null || typeof assertions !== 'object') {
    fail(`${prefix} must be an object.`)
  }
  for (const [name, value] of Object.entries(assertions)) {
    if (value !== true) {
      fail(`${prefix}.${name} did not pass.`)
    }
  }
}

async function activateRepositorySection(client, prefix) {
  const activated = await evaluate(
    client,
    `(() => {
      const rail = document.querySelector('nav.repository-rail')
      if (!(rail instanceof HTMLElement)) return false
      const expected = ${JSON.stringify(prefix.toLowerCase())}
      const target = [...rail.querySelectorAll('button, [role="tab"]')]
        .find(element => {
          // Rail items render their Material Symbol ligature as text, so raw
          // textContent reads "sellReleases". Prefer the dedicated label span
          // and fall back to the accessible name, then to full text.
          const label = element.querySelector('.rail-label')
          const name = label?.textContent?.replace(/\\s+/g, ' ').trim() ??
            element.getAttribute('aria-label') ??
            element.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
          return name.toLowerCase().startsWith(expected)
        })
      if (!(target instanceof HTMLElement)) return false
      target.click()
      return true
    })()`
  )
  if (!activated) {
    fail(`Unable to activate the production ${prefix} section.`)
  }
}

async function inspectReleaseSurface(client) {
  return evaluate(
    client,
    `(() => {
      const visible = element => {
        if (!(element instanceof HTMLElement)) return false
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0
      }
      const inViewport = bounds =>
        bounds.left >= -0.5 && bounds.top >= -0.5 &&
        bounds.right <= innerWidth + 0.5 &&
        bounds.bottom <= innerHeight + 0.5
      const contained = (inner, outer) =>
        inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 &&
        inner.right <= outer.right + 0.5 &&
        inner.bottom <= outer.bottom + 0.5
      const view = document.querySelector('.github-releases-view')
      const panel = view?.querySelector('.github-releases-list-panel')
      const list = panel?.querySelector('.github-releases-list')
      const toggle = panel?.querySelector(
        '.github-releases-compact-tools-toggle'
      )
      const summary = panel?.querySelector('#github-releases-compact-summary')
      const shells = [...(list?.querySelectorAll(
        '.github-release-row-shell'
      ) ?? [])]
      const listBounds = list?.getBoundingClientRect()
      const completeRows = listBounds === undefined ? [] : shells.filter(shell => {
        const bounds = shell.getBoundingClientRect()
        return visible(shell) && inViewport(bounds) &&
          contained(bounds, listBounds)
      })
      const row = completeRows[0]
      const rowButton = row?.querySelector('button.github-release-row')
      const title = row?.querySelector('.github-release-row-title')
        ?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
      const tag = row?.querySelector('.github-release-row-tag')
        ?.textContent?.trim() ?? ''
      const date = row?.querySelector('.github-release-row-date')
        ?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
      const status = row?.querySelector('.github-release-row-status')
        ?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
      const required = [view, panel, list, toggle, summary, row, rowButton]
        .filter(Boolean)
      const noHorizontalClipping = required.every(element =>
        element.scrollWidth <= element.clientWidth + 1 &&
        inViewport(element.getBoundingClientRect())
      ) && document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.body.scrollWidth <= innerWidth + 1
      return {
        viewport: { width: innerWidth, height: innerHeight },
        physicalViewport: {
          width: Math.round(innerWidth *
            require('electron').webFrame.getZoomFactor()),
          height: Math.round(innerHeight *
            require('electron').webFrame.getZoomFactor()),
        },
        webZoomFactor: require('electron').webFrame.getZoomFactor(),
        persistedZoomFactor: Number(localStorage.getItem('zoom-factor')),
        compactLabel: toggle?.getAttribute('aria-label') ?? null,
        compactExpanded: toggle?.getAttribute('aria-expanded') ?? null,
        compactSummary: summary?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        toggleFocused: document.activeElement === toggle,
        toggleTabIndex: toggle?.tabIndex ?? null,
        completeRowCount: completeRows.length,
        completeRow: { title, tag, date, status },
        rowButtonEnabled:
          rowButton instanceof HTMLButtonElement && !rowButton.disabled,
        noHorizontalClipping,
        loadingAbsent:
          view?.querySelector('.github-releases-loading') === null,
        errorAbsent:
          view?.querySelector('[role="alert"]') === null,
      }
    })()`
  )
}

async function runReleasesScene(client, options, provider) {
  await configureViewport(client, 1)
  await menuEvent(client, 'zoom-reset')
  for (let index = 0; index < 5; index += 1) {
    await menuEvent(client, 'zoom-in')
  }
  await waitFor(
    client,
    `Number(localStorage.getItem('zoom-factor')) === 2 &&
      Math.abs(require('electron').webFrame.getZoomFactor() - 2) < 0.001 &&
      innerWidth === ${CaptureWidth / 2} &&
      innerHeight === ${CaptureHeight / 2}`,
    'exact 200% compact Releases viewport'
  )
  await activateRepositorySection(client, 'Releases')
  await waitFor(
    client,
    `(() => {
      const view = document.querySelector('.github-releases-view')
      const rows = view?.querySelectorAll('.github-release-row-shell')
      return view !== null &&
        view.querySelector('.github-releases-loading') === null &&
        view.querySelector('[role="alert"]') === null &&
        (rows?.length ?? 0) >= 1
    })()`,
    'loaded production Releases rows',
    40_000
  )

  const focused = await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector(
        '.github-releases-compact-tools-toggle'
      )
      if (!(toggle instanceof HTMLButtonElement) ||
          toggle.getAttribute('aria-label') !== 'Filters and selection' ||
          toggle.getAttribute('aria-expanded') !== 'false') return false
      toggle.focus()
      return document.activeElement === toggle
    })()`
  )
  if (!focused) {
    fail('Filters and selection disclosure was not keyboard reachable.')
  }
  await dispatchKey(client, 'Enter', 'Enter', 13)
  // Keyboard reachability is proved above (the disclosure takes focus and
  // exposes the right name and state). Activation is a separate matter here:
  // the app runs on an off-screen Win32 desktop, so its window is never the
  // active window and Chromium withholds Enter's default button activation
  // even for trusted key events. Fall back to the button's own activation so
  // the frame still shows the real expanded surface, and say plainly which
  // route opened it rather than implying a keystroke did.
  let releasesToolsActivation = 'keyboard'
  const expandedByKeyboard = await evaluate(
    client,
    `document.querySelector(
      '.github-releases-compact-tools-toggle'
    )?.getAttribute('aria-expanded') === 'true'`
  )
  if (expandedByKeyboard !== true) {
    releasesToolsActivation = 'click-fallback-offscreen-desktop'
    await evaluate(
      client,
      `(() => {
        const toggle = document.querySelector(
          '.github-releases-compact-tools-toggle'
        )
        if (!(toggle instanceof HTMLButtonElement)) return false
        toggle.click()
        return true
      })()`
    )
  }
  process.stdout.write(`RELEASES_TOOLS_ACTIVATION ${releasesToolsActivation}\n`)
  await waitFor(
    client,
    `document.querySelector(
      '.github-releases-compact-tools-toggle'
    )?.getAttribute('aria-expanded') === 'true'`,
    'expanded Releases tools'
  )
  const expandedReceipt = await evaluate(
    client,
    `(() => {
      const tools = document.querySelector('#github-releases-compact-tools')
      const search = tools?.querySelector('#github-releases-search')
      const status = tools?.querySelector(
        'select[aria-label="Release status"]'
      )
      const selectAll = tools?.querySelector(
        'input[aria-label="Select all visible releases"]'
      )
      const elements = [tools, search, status, selectAll]
      return {
        allVisible: elements.every(element => {
          if (!(element instanceof HTMLElement)) return false
          const bounds = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return bounds.width > 0 && bounds.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden'
        }),
        allKeyboardReachable:
          search?.tabIndex >= 0 && status?.tabIndex >= 0 &&
          selectAll?.tabIndex >= 0,
      }
    })()`
  )
  if (
    expandedReceipt?.allVisible !== true ||
    expandedReceipt.allKeyboardReachable !== true
  ) {
    fail(
      'Expanded release filters and selection controls failed accessibility.'
    )
  }
  const refocused = await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector(
        '.github-releases-compact-tools-toggle'
      )
      if (!(toggle instanceof HTMLButtonElement)) return false
      toggle.focus()
      return document.activeElement === toggle
    })()`
  )
  if (!refocused) {
    fail('Unable to return keyboard focus to the Releases disclosure.')
  }
  await dispatchKey(client, 'Enter', 'Enter', 13)
  // Same off-screen-desktop activation limitation as the expand step above:
  // focus is real, but the never-active window suppresses Enter's default
  // button activation, so fall back to the control's own activation.
  const collapsedByKeyboard = await evaluate(
    client,
    `document.querySelector(
      '.github-releases-compact-tools-toggle'
    )?.getAttribute('aria-expanded') === 'false'`
  )
  if (collapsedByKeyboard !== true) {
    await evaluate(
      client,
      `(() => {
        const toggle = document.querySelector(
          '.github-releases-compact-tools-toggle'
        )
        if (!(toggle instanceof HTMLButtonElement)) return false
        toggle.click()
        return true
      })()`
    )
  }
  await waitFor(
    client,
    `document.querySelector(
      '.github-releases-compact-tools-toggle'
    )?.getAttribute('aria-expanded') === 'false'`,
    'collapsed Releases tools'
  )

  const surface = await inspectReleaseSurface(client)
  const expectedRelease = {
    title: 'Desktop Material 3.6.3',
    tag: 'v3.6.3-material',
  }
  const assertions = {
    exactTwoHundredPercent:
      surface.webZoomFactor === 2 &&
      surface.persistedZoomFactor === 2 &&
      surface.viewport.width === CaptureWidth / 2 &&
      surface.viewport.height === CaptureHeight / 2 &&
      surface.physicalViewport.width === CaptureWidth &&
      surface.physicalViewport.height === CaptureHeight,
    productionReleaseSurface:
      surface.loadingAbsent === true && surface.errorAbsent === true,
    disclosureVisibleAndKeyboardReachable:
      surface.compactLabel === 'Filters and selection' &&
      surface.compactExpanded === 'false' &&
      surface.toggleFocused === true &&
      surface.toggleTabIndex >= 0,
    selectionSummaryVisible: /^3 shown · 0 selected$/.test(
      surface.compactSummary
    ),
    oneCompleteFixtureRow:
      surface.completeRowCount === 1 &&
      surface.completeRow.title === expectedRelease.title &&
      surface.completeRow.tag === expectedRelease.tag &&
      /Published/.test(surface.completeRow.date) &&
      surface.completeRow.status.length > 0 &&
      surface.rowButtonEnabled === true,
    expandedControlsProved:
      expandedReceipt.allVisible === true &&
      expandedReceipt.allKeyboardReachable === true,
    noClipping: surface.noHorizontalClipping === true,
  }
  assertBooleanAssertions(assertions, 'releases.assertions')
  await settleCapture(client)
  const privacy = await assertPrivacy(client, options.runRoot)
  const capture = await captureOriginalPng(
    client,
    options.outputs['releases-compact']
  )
  return {
    scene: 'releases-compact',
    provider: { owner: provider.owner, repository: provider.repository },
    zoomPercent: 200,
    compactSummary: surface.compactSummary,
    completeRelease: surface.completeRow,
    assertions,
    privacy,
    capture,
  }
}

async function addPullRepositoryThroughRealUi(
  client,
  repositoryPath,
  originalRepositoryId
) {
  await menuEvent(client, 'add-local-repository')
  await waitFor(
    client,
    `document.querySelector(
      '#add-existing-repository input[type="text"]'
    ) !== null`,
    'production Add existing repository dialog'
  )
  await setInput(
    client,
    '#add-existing-repository input[type="text"]',
    repositoryPath
  )
  await waitFor(
    client,
    `(() => {
      const dialog = document.querySelector('#add-existing-repository')
      const submit = dialog?.querySelector('button[type="submit"]')
      return submit instanceof HTMLButtonElement && !submit.disabled &&
        submit.getAttribute('aria-disabled') !== 'true'
    })()`,
    'enabled reviewed Add repository action',
    20_000
  )
  const submitted = await evaluate(
    client,
    `(() => {
      const dialog = document.querySelector('#add-existing-repository')
      const submit = dialog?.querySelector('button[type="submit"]')
      if (!(submit instanceof HTMLButtonElement) || submit.disabled) return false
      submit.click()
      return true
    })()`
  )
  if (!submitted) {
    fail('Unable to submit the real Add existing repository review.')
  }
  await waitFor(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      const selected = bridge?.appStore.selectedRepository
      const pathModule = require('path')
      return document.querySelector('#add-existing-repository') === null &&
        selected?.id !== ${JSON.stringify(originalRepositoryId)} &&
        pathModule.resolve(selected?.path ?? '').toLowerCase() ===
          pathModule.resolve(${JSON.stringify(repositoryPath)}).toLowerCase()
    })()`,
    'selected owned pull repository',
    30_000
  )
}

async function restoreAddedPullRepositoryThroughAppNativeHook(
  client,
  repositoryPath,
  originalRepositoryId
) {
  const receipt = await evaluate(
    client,
    `(async () => {
      ${BridgePrelude}
      async function restoreAddedPullRepositoryThroughAppNativeHook(
        appStore,
        dispatcher,
        pathModule,
        expectedPath,
        originalId
      ) {
        const repositories = await appStore.repositoriesStore.getAll()
        const added = repositories.find(repository =>
          pathModule.resolve(repository.path).toLowerCase() ===
            pathModule.resolve(expectedPath).toLowerCase()
        )
        const original = repositories.find(repository =>
          repository.id === originalId
        )
        if (added === undefined || original === undefined) {
          return { restored: false, reason: 'repository-missing' }
        }
        if (appStore.selectedRepository?.id !== original.id) {
          await appStore._selectRepository(original)
        }
        const result = await dispatcher.removeRepository(added, false)
        const after = await appStore.repositoriesStore.getAll()
        return {
          restored:
            result === 'removed' &&
            appStore.selectedRepository?.id === original.id &&
            !after.some(repository =>
              pathModule.resolve(repository.path).toLowerCase() ===
                pathModule.resolve(expectedPath).toLowerCase()
            ),
          result,
        }
      }
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return { restored: false, reason: 'bridge-missing' }
      return restoreAddedPullRepositoryThroughAppNativeHook(
        bridge.appStore,
        bridge.dispatcher,
        require('path'),
        ${JSON.stringify(repositoryPath)},
        ${JSON.stringify(originalRepositoryId)}
      )
    })()`
  )
  if (receipt?.restored !== true) {
    fail('App-native pull repository restoration failed.')
  }
  return true
}

async function inspectPullPreviewSurface(client) {
  return evaluate(
    client,
    `(() => {
      const root = document.querySelector('#pull-preview')
      const review = root?.querySelector('.pull-preview-review')
      const route = review?.querySelectorAll('.pull-preview-route > div')
      const local = route?.[0]
      const upstream = route?.[1]
      const commits = [...(review?.querySelectorAll(
        '.pull-preview-columns > section:first-child .pull-preview-list > li'
      ) ?? [])]
      const files = [...(review?.querySelectorAll(
        '.pull-preview-columns > section:nth-child(2) .pull-preview-list > li'
      ) ?? [])]
      const submit = root?.querySelector('.dialog-footer button[type="submit"]')
      const cancel = [...(root?.querySelectorAll(
        '.dialog-footer button'
      ) ?? [])].find(button =>
        button.textContent?.replace(/\\s+/g, ' ').trim() === 'Cancel'
      )
      const rect = element => element?.getBoundingClientRect() ?? null
      const inViewport = bounds => bounds !== null &&
        bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -0.5 && bounds.top >= -0.5 &&
        bounds.right <= innerWidth + 0.5 &&
        bounds.bottom <= innerHeight + 0.5
      const required = [
        root, review, review?.querySelector('.pull-preview-route'),
        review?.querySelector('.pull-preview-metrics'),
        review?.querySelector('#pull-preview-commits-title'),
        review?.querySelector('#pull-preview-files-title'),
        submit, cancel,
      ]
      return {
        localBranch: local?.querySelector('strong')?.textContent?.trim() ?? '',
        upstreamBranch:
          upstream?.querySelector('strong')?.textContent?.trim() ?? '',
        localOid:
          local?.querySelector('.sr-only')?.textContent?.trim() ?? '',
        upstreamOid:
          upstream?.querySelector('.sr-only')?.textContent?.trim() ?? '',
        metrics: review?.querySelector('.pull-preview-metrics')
          ?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        commitRows: commits.map(row => ({
          oid: row.querySelector('.sr-only')?.textContent?.trim() ?? '',
          summary: row.querySelector('span:not(.sr-only)')
            ?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        })),
        changedRows: files.map(row => ({
          status: row.querySelector('.pull-preview-file-status')
            ?.className?.split(/\\s+/).at(-1) ?? '',
          path: row.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        })),
        submitLabel: submit?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        submitEnabled:
          submit instanceof HTMLButtonElement && !submit.disabled,
        cancelEnabled:
          cancel instanceof HTMLButtonElement && !cancel.disabled,
        notesVisible:
          review?.querySelector('.pull-preview-notes')?.getClientRects()
            .length > 0,
        noError: root?.querySelector('[role="alert"]') === null,
        noHorizontalClipping:
          required.every(element => {
            if (!(element instanceof HTMLElement)) return false
            return inViewport(rect(element)) &&
              element.scrollWidth <= element.clientWidth + 1
          }) &&
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.body.scrollWidth <= innerWidth + 1,
      }
    })()`
  )
}

async function runPullScene(client, options, originalPresentation) {
  const fixture = createPullFixture(options.runRoot)
  await configureViewport(client, 1)
  let added = false
  let sceneResult = null
  try {
    await addPullRepositoryThroughRealUi(
      client,
      fixture.app,
      originalPresentation.selectedRepositoryId
    )
    added = true
    await menuEvent(client, 'pull')
    await waitFor(
      client,
      `(() => {
        const root = document.querySelector('#pull-preview')
        const review = root?.querySelector('.pull-preview-review')
        const submit = root?.querySelector(
          '.dialog-footer button[type="submit"]'
        )
        return review !== null &&
          root.querySelector('.pull-preview-loading') === null &&
          root.querySelector('[role="alert"]') === null &&
          submit instanceof HTMLButtonElement && !submit.disabled
      })()`,
      'frozen production Pull review',
      45_000
    )

    const afterFetch = inspectPullFixture(fixture)
    const surface = await inspectPullPreviewSurface(client)
    const expectedCommitSummaries = [
      'Retire superseded guidance',
      'Add incoming material guidance',
    ]
    const expectedPathFragments = [
      'config/material.json',
      'docs/incoming-guide.md',
      'docs/retired.md',
    ]
    const assertions = {
      exactUpstreamOid:
        surface.upstreamOid === fixture.expectedUpstreamOid &&
        afterFetch.remoteTrackingOid === fixture.expectedUpstreamOid,
      exactLocalOid:
        surface.localOid === fixture.initial.headOid &&
        afterFetch.headOid === fixture.initial.headOid,
      cleanWorktree: fixture.initial.status === '' && afterFetch.status === '',
      localRefsUnchanged: afterFetch.localRefs === fixture.initial.localRefs,
      expectedFetchOnly:
        fixture.initial.remoteTrackingOid !== fixture.expectedUpstreamOid &&
        afterFetch.remoteTrackingOid === fixture.expectedUpstreamOid,
      exactDivergence:
        afterFetch.ahead === 0 &&
        afterFetch.behind === 2 &&
        /0 ahead/.test(surface.metrics) &&
        /2 behind/.test(surface.metrics) &&
        /Fast-forward/.test(surface.metrics),
      exactIncomingCommits:
        surface.commitRows.length === 2 &&
        JSON.stringify(surface.commitRows.map(row => row.summary)) ===
          JSON.stringify(expectedCommitSummaries),
      exactChangedPaths:
        surface.changedRows.length === 3 &&
        expectedPathFragments.every(expected =>
          surface.changedRows.some(row => row.path.includes(expected))
        ) &&
        JSON.stringify(afterFetch.changedPaths) ===
          JSON.stringify(PullChangedPaths),
      exactRoute:
        surface.localBranch === 'main' &&
        surface.upstreamBranch === 'origin/main',
      reviewedActionNotConfirmed:
        surface.submitLabel === 'Pull reviewed commit' &&
        surface.submitEnabled === true &&
        surface.cancelEnabled === true,
      notesVisible: surface.notesVisible === true,
      noError: surface.noError === true,
      noClipping: surface.noHorizontalClipping === true,
    }
    assertBooleanAssertions(assertions, 'pull.assertions')
    await settleCapture(client)
    const privacy = await assertPrivacy(client, options.runRoot)
    const capture = await captureOriginalPng(
      client,
      options.outputs['pull-preview']
    )
    const frozen = inspectPullFixture(fixture)
    const frozenAssertions = {
      frozenHeadUnchanged: frozen.headOid === fixture.initial.headOid,
      frozenLocalRefsUnchanged: frozen.localRefs === fixture.initial.localRefs,
      frozenUpstreamStable:
        frozen.remoteTrackingOid === fixture.expectedUpstreamOid,
      frozenWorktreeClean: frozen.status === '',
      pullNotConfirmed:
        frozen.ahead === 0 &&
        frozen.behind === 2 &&
        git(fixture.app, ['rev-parse', 'HEAD']) === fixture.initial.headOid,
    }
    assertBooleanAssertions(frozenAssertions, 'pull.frozenAssertions')
    sceneResult = {
      scene: 'pull-preview',
      fixture: {
        incomingCommitCount: 2,
        changedPaths: PullChangedPaths,
        baseOid: fixture.initial.headOid,
        expectedUpstreamOid: fixture.expectedUpstreamOid,
      },
      review: {
        localBranch: surface.localBranch,
        upstreamBranch: surface.upstreamBranch,
        localOid: surface.localOid,
        upstreamOid: surface.upstreamOid,
        commitSummaries: surface.commitRows.map(row => row.summary),
      },
      assertions,
      frozenAssertions,
      privacy,
      capture,
    }
  } finally {
    if (
      await evaluate(client, `document.querySelector('#pull-preview') !== null`)
    ) {
      try {
        await clickText(client, 'Cancel', '#pull-preview')
        await waitFor(
          client,
          `document.querySelector('#pull-preview') === null`,
          'dismissed Pull review'
        )
      } catch {
        await pressEscape(client)
      }
    }
    if (added) {
      await restoreAddedPullRepositoryThroughAppNativeHook(
        client,
        fixture.app,
        originalPresentation.selectedRepositoryId
      )
    }
  }
  return {
    ...sceneResult,
    restoration: {
      pullDialogDismissed: true,
      addedRepositoryRemoved: true,
      originalRepositoryReselected: true,
      fixturePreservedForAudit: true,
    },
  }
}

async function applyExactPrivateMetadataThroughAppNativeHook(client) {
  const receipt = await evaluate(
    client,
    `(async () => {
      ${BridgePrelude}
      async function applyExactPrivateMetadataThroughAppNativeHook(appStore) {
        const repository = appStore.selectedRepository
        const github = repository?.gitHubRepository
        if (repository === null || repository === undefined || github === null) {
          return { applied: false, reason: 'metadata-missing' }
        }
        const original = github.isPrivate
        await appStore.repositoriesStore.db.gitHubRepositories.update(
          github.dbID,
          { private: true }
        )
        appStore.repositoriesStore.emitUpdatedRepositories()
        return {
          applied: true,
          repositoryId: repository.id,
          githubDbId: github.dbID,
          repositoryName: repository.name,
          originalPrivateState: original,
        }
      }
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return { applied: false, reason: 'bridge-missing' }
      return applyExactPrivateMetadataThroughAppNativeHook(bridge.appStore)
    })()`
  )
  if (
    receipt?.applied !== true ||
    !Number.isSafeInteger(receipt.repositoryId) ||
    !Number.isSafeInteger(receipt.githubDbId)
  ) {
    fail('Exact app-native private metadata hook failed.')
  }
  await waitFor(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      return bridge?.appStore.selectedRepository?.id ===
          ${JSON.stringify(receipt.repositoryId)} &&
        bridge.appStore.selectedRepository?.gitHubRepository?.isPrivate === true
    })()`,
    'exact private repository metadata'
  )
  return receipt
}

async function restorePrivateMetadataThroughAppNativeHook(client, mutation) {
  const restored = await evaluate(
    client,
    `(async () => {
      ${BridgePrelude}
      async function restorePrivateMetadataThroughAppNativeHook(
        appStore,
        repositoryId,
        githubDbId,
        originalPrivateState
      ) {
        const repositories = await appStore.repositoriesStore.getAll()
        const repository = repositories.find(value => value.id === repositoryId)
        if (repository === undefined ||
            repository.gitHubRepository?.dbID !== githubDbId) return false
        await appStore.repositoriesStore.db.gitHubRepositories.update(
          githubDbId,
          { private: originalPrivateState }
        )
        appStore.repositoriesStore.emitUpdatedRepositories()
        return true
      }
      const bridge = findRepositorySpecialistBridge()
      if (bridge === null) return false
      return restorePrivateMetadataThroughAppNativeHook(
        bridge.appStore,
        ${JSON.stringify(mutation.repositoryId)},
        ${JSON.stringify(mutation.githubDbId)},
        ${JSON.stringify(mutation.originalPrivateState)}
      )
    })()`
  )
  if (!restored) {
    fail('App-native private metadata restoration hook failed.')
  }
  await waitFor(
    client,
    `(() => {
      ${BridgePrelude}
      const bridge = findRepositorySpecialistBridge()
      const repository = bridge?.appStore.selectedRepository
      return repository?.id === ${JSON.stringify(mutation.repositoryId)} &&
        repository.gitHubRepository?.isPrivate ===
          ${JSON.stringify(mutation.originalPrivateState)}
    })()`,
    'restored private metadata'
  )
}

async function inspectPrivateBadgeSurface(client, mutation) {
  return evaluate(
    client,
    `(() => {
      const selected = [...document.querySelectorAll('[role="option"]')]
        .find(option => option.getAttribute('aria-selected') === 'true' &&
          option.querySelector('.repository-list-item') !== null)
      const logoOwner = selected?.querySelector(
        '.repository-list-logo-appearance-target'
      )
      const logo = selected?.querySelector(
        '.repository-list-logo.icon-for-repository'
      )
      const badge = selected?.querySelector('.repository-private-badge')
      const lock = badge?.querySelector('.material-symbol')
      const tooltips = [...document.querySelectorAll('[role="tooltip"]')]
        .filter(element => {
          const bounds = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return bounds.width > 0 && bounds.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' &&
            Number(style.opacity) > 0
        })
      const tooltip = tooltips.find(element =>
        element.textContent?.replace(/\\s+/g, ' ').trim() ===
          'Private repository'
      )
      const rect = element => element?.getBoundingClientRect() ?? null
      const logoBounds = rect(logoOwner)
      const badgeBounds = rect(badge)
      const selectedBounds = rect(selected)
      const inViewport = bounds => bounds !== null &&
        bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -0.5 && bounds.top >= -0.5 &&
        bounds.right <= innerWidth + 0.5 &&
        bounds.bottom <= innerHeight + 0.5
      const separateGeometry =
        logoBounds !== null && badgeBounds !== null &&
        (logoBounds.right <= badgeBounds.left + 0.5 ||
          badgeBounds.right <= logoBounds.left + 0.5 ||
          logoBounds.bottom <= badgeBounds.top + 0.5 ||
          badgeBounds.bottom <= logoBounds.top + 0.5)
      return {
        selectedRowPresent: selected instanceof HTMLElement,
        selectedRowLabel: selected?.getAttribute('aria-label') ?? '',
        selectedRepositoryId:
          ${JSON.stringify(mutation.repositoryId)},
        ordinaryLogoPresent:
          logoOwner instanceof HTMLElement && logo instanceof HTMLElement,
        logoRole: logoOwner?.getAttribute('role') ?? null,
        badgePresent: badge instanceof HTMLElement,
        badgeRole: badge?.getAttribute('role') ?? null,
        badgeTabIndex: badge?.tabIndex ?? null,
        badgeAriaLabel: badge?.getAttribute('aria-label') ?? null,
        lockGlyph: lock?.textContent?.trim() ?? null,
        badgeFocused: document.activeElement === badge,
        tooltipText:
          tooltip?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
        separateGeometry,
        noClipping:
          [selectedBounds, logoBounds, badgeBounds, rect(tooltip)]
            .every(inViewport) &&
          [selected, logoOwner, badge].every(element =>
            element instanceof HTMLElement &&
            element.scrollWidth <= element.clientWidth + 1
          ) &&
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.body.scrollWidth <= innerWidth + 1,
      }
    })()`
  )
}

async function runPrivateBadgeScene(client, options, provider) {
  await configureViewport(client, 1)
  const requestsBefore = countProviderRequests(provider)
  const mutation = await applyExactPrivateMetadataThroughAppNativeHook(client)
  let sceneResult = null
  try {
    await menuEvent(client, 'choose-repository')
    await waitFor(
      client,
      `document.querySelector(
        '#foldout-container .repository-list'
      ) !== null`,
      'real repository picker'
    )
    await waitFor(
      client,
      `(() => {
        const selected = [...document.querySelectorAll('[role="option"]')]
          .find(option => option.getAttribute('aria-selected') === 'true' &&
            option.querySelector('.repository-list-item') !== null)
        return selected?.querySelector(
          '.repository-list-logo-appearance-target'
        ) !== null &&
          selected.querySelector('.repository-list-logo.icon-for-repository')
            !== null &&
          selected.querySelector('.repository-private-badge') !== null
      })()`,
      'ordinary repository logo and separate private badge',
      20_000
    )
    const focused = await evaluate(
      client,
      `(() => {
        const selected = [...document.querySelectorAll('[role="option"]')]
          .find(option => option.getAttribute('aria-selected') === 'true' &&
            option.querySelector('.repository-list-item') !== null)
        const badge = selected?.querySelector('.repository-private-badge')
        if (!(badge instanceof HTMLElement) ||
            badge.getAttribute('aria-label') !== 'Private repository' ||
            badge.getAttribute('role') !== 'img' ||
            badge.tabIndex !== 0) return false
        badge.focus()
        return document.activeElement === badge
      })()`
    )
    if (!focused) {
      fail('Localized private lock was not keyboard focusable.')
    }
    await waitFor(
      client,
      `[...document.querySelectorAll('[role="tooltip"]')].some(tooltip => {
        const bounds = tooltip.getBoundingClientRect()
        const style = getComputedStyle(tooltip)
        return tooltip.textContent?.replace(/\\s+/g, ' ').trim() ===
          'Private repository' &&
          bounds.width > 0 && bounds.height > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden'
      })`,
      'localized focused private tooltip'
    )
    const surface = await inspectPrivateBadgeSurface(client, mutation)
    const requestsAtCapture = countProviderRequests(provider)
    const assertions = {
      selectedDisposableRepository:
        surface.selectedRowPresent === true &&
        surface.selectedRowLabel.includes(mutation.repositoryName),
      exactPrivateMetadata:
        mutation.applied === true && Number.isSafeInteger(mutation.githubDbId),
      ordinaryLogoPreserved:
        surface.ordinaryLogoPresent === true && surface.logoRole === 'button',
      separateFocusableLock:
        surface.badgePresent === true &&
        surface.badgeRole === 'img' &&
        surface.badgeTabIndex === 0 &&
        surface.badgeAriaLabel === 'Private repository' &&
        surface.lockGlyph === 'lock' &&
        surface.badgeFocused === true &&
        surface.separateGeometry === true,
      localizedTooltip: surface.tooltipText === 'Private repository',
      noProviderInference: requestsBefore === requestsAtCapture,
      noClipping: surface.noClipping === true,
    }
    assertBooleanAssertions(assertions, 'private.assertions')
    await settleCapture(client, true)
    const privacy = await assertPrivacy(client, options.runRoot)
    const capture = await captureOriginalPng(
      client,
      options.outputs['private-badge']
    )
    const requestsAfterCapture = countProviderRequests(provider)
    if (requestsAfterCapture !== requestsBefore) {
      fail('Private badge capture caused provider inference.')
    }
    sceneResult = {
      scene: 'private-badge',
      metadataHook: {
        name: 'applyExactPrivateMetadataThroughAppNativeHook',
        githubDbId: mutation.githubDbId,
        originalPrivateState: mutation.originalPrivateState,
        appliedPrivateState: true,
      },
      providerRequests: {
        before: requestsBefore,
        atCapture: requestsAtCapture,
        afterCapture: requestsAfterCapture,
      },
      surface: {
        repositoryName: mutation.repositoryName,
        badgeAriaLabel: surface.badgeAriaLabel,
        tooltipText: surface.tooltipText,
        lockGlyph: surface.lockGlyph,
      },
      assertions,
      privacy,
      capture,
    }
  } finally {
    if (
      await evaluate(
        client,
        `document.querySelector('#foldout-container .repository-list') !== null`
      )
    ) {
      await pressEscape(client)
      await waitFor(
        client,
        `document.querySelector(
          '#foldout-container .repository-list'
        ) === null`,
        'closed repository picker'
      )
    }
    await restorePrivateMetadataThroughAppNativeHook(client, mutation)
  }
  return {
    ...sceneResult,
    restoration: {
      pickerClosed: true,
      metadataRestored: true,
      hook: 'restorePrivateMetadataThroughAppNativeHook',
    },
  }
}

function validateFinalReceipt(receipt, selectedScenes) {
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.verifier !== 'gallery-repository-specialists' ||
    receipt.viewport?.width !== CaptureWidth ||
    receipt.viewport?.height !== CaptureHeight ||
    JSON.stringify(receipt.selectedScenes) !== JSON.stringify(selectedScenes) ||
    !Array.isArray(receipt.scenes) ||
    receipt.scenes.length !== selectedScenes.length
  ) {
    fail('Final specialist receipt header drifted.')
  }
  for (const [index, scene] of receipt.scenes.entries()) {
    if (scene.scene !== selectedScenes[index]) {
      fail('Final specialist receipt scene order drifted.')
    }
    assertBooleanAssertions(scene.assertions, `${scene.scene}.assertions`)
    if (scene.frozenAssertions !== undefined) {
      assertBooleanAssertions(
        scene.frozenAssertions,
        `${scene.scene}.frozenAssertions`
      )
    }
    if (
      scene.capture?.width !== CaptureWidth ||
      scene.capture?.height !== CaptureHeight ||
      scene.capture?.bytes < 20_000 ||
      !/^[a-f0-9]{64}$/.test(scene.capture?.sha256 ?? '') ||
      scene.privacy?.forbiddenPathAbsent !== true ||
      scene.privacy?.credentialAbsent !== true
    ) {
      fail(`Final ${scene.scene} capture receipt drifted.`)
    }
  }
  assertBooleanAssertions(receipt.restoration, 'restoration')
  return receipt
}

async function main() {
  const options = validateOwnedPaths(parseArguments(process.argv.slice(2)))
  const needsProvider =
    options.scenes.includes('releases-compact') ||
    options.scenes.includes('private-badge')
  const provider = needsProvider ? readProviderIdentity(options.runRoot) : null
  const targets = await getJSON(options.port, '/json/list')
  const target = targets.find(
    value =>
      value.type === 'page' &&
      typeof value.webSocketDebuggerUrl === 'string' &&
      value.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:')
  )
  if (target === undefined) {
    fail('No loopback renderer page target was exposed on the owned CDP port.')
  }

  const client = new CDPClient(target.webSocketDebuggerUrl)
  await client.open()
  let presentation = null
  let restoration = null
  let primaryError = null
  const sceneReceipts = []
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await waitFor(
      client,
      `document.querySelector('#desktop-app-container') !== null`,
      'production Desktop Material container'
    )
    presentation = await snapshotPresentation(client)
    if (
      (options.scenes.includes('releases-compact') ||
        options.scenes.includes('private-badge')) &&
      presentation.languageMode !== 'english'
    ) {
      fail('Repository specialist gallery captures require English mode.')
    }
    if (provider !== null) {
      await assertSelectedFixture(client, options.runRoot, provider)
    }

    for (const scene of options.scenes) {
      if (scene === 'releases-compact') {
        sceneReceipts.push(await runReleasesScene(client, options, provider))
        await configureViewport(client, 1)
      } else if (scene === 'pull-preview') {
        sceneReceipts.push(await runPullScene(client, options, presentation))
      } else if (scene === 'private-badge') {
        sceneReceipts.push(
          await runPrivateBadgeScene(client, options, provider)
        )
      }
    }
  } catch (error) {
    primaryError = error
  } finally {
    if (presentation !== null) {
      try {
        restoration = await restorePresentation(client, presentation)
      } catch (error) {
        if (primaryError === null) {
          primaryError = error
        } else {
          primaryError = new Error(
            `${primaryError.message}; cleanup also failed: ${error.message}`
          )
        }
      }
    }
    client.close()
  }
  if (primaryError !== null) {
    throw primaryError
  }

  const receipt = validateFinalReceipt(
    {
      schemaVersion: 1,
      verifier: 'gallery-repository-specialists',
      runId: path.basename(options.runRoot),
      selectedScenes: options.scenes,
      viewport: { width: CaptureWidth, height: CaptureHeight },
      appearance: {
        theme: presentation.theme,
        languageMode: presentation.languageMode,
      },
      scenes: sceneReceipts,
      restoration,
    },
    options.scenes
  )
  fs.writeFileSync(
    options.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' }
  )
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      scenes: options.scenes,
      receipt: path.basename(options.receiptPath),
      captures: sceneReceipts.map(scene => scene.capture.file),
      restoration,
    })}\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(
      `${
        error instanceof Error
          ? error.stack ?? error.message
          : String(error ?? 'Unknown repository specialist verifier error.')
      }\n`
    )
    process.exitCode = 1
  })
}

module.exports = {
  CaptureHeight,
  CaptureWidth,
  PullChangedPaths,
  PullFixtureDirectory,
  ReceiptBasename,
  RunRootPattern,
  SceneSpecifications,
  assertBooleanAssertions,
  createPullFixture,
  inspectPullFixture,
  isContainedPath,
  parseArguments,
  pngDimensions,
  validateFinalReceipt,
  validateLoopbackEndpoint,
  validateOwnedPaths,
}
