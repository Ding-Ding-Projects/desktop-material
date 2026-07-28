'use strict'

/* eslint-disable no-sync -- contract tests inspect one bounded local verifier */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const verifierPath = path.join(
  __dirname,
  'verify_gallery_repository_specialists_cdp.js'
)
const verifier = require(verifierPath)
const source = fs.readFileSync(verifierPath, 'utf8')

function completeArguments(
  runRoot,
  scenes = Object.keys(verifier.SceneSpecifications)
) {
  const argumentsList = [
    '--port',
    '9337',
    '--run-root',
    runRoot,
    '--scenes',
    scenes.join(','),
  ]
  for (const scene of scenes) {
    const specification = verifier.SceneSpecifications[scene]
    argumentsList.push(
      `--${specification.outputOption}`,
      path.join(runRoot, 'captures', specification.outputBasename)
    )
  }
  argumentsList.push(
    '--receipt',
    path.join(runRoot, 'receipts', verifier.ReceiptBasename)
  )
  return argumentsList
}

function passingReceipt(scenes = ['releases-compact']) {
  return {
    schemaVersion: 1,
    verifier: 'gallery-repository-specialists',
    selectedScenes: scenes,
    viewport: {
      width: verifier.CaptureWidth,
      height: verifier.CaptureHeight,
    },
    scenes: scenes.map(scene => ({
      scene,
      assertions: { exact: true },
      privacy: {
        forbiddenPathAbsent: true,
        credentialAbsent: true,
      },
      capture: {
        width: verifier.CaptureWidth,
        height: verifier.CaptureHeight,
        bytes: 20_001,
        sha256: 'a'.repeat(64),
      },
    })),
    restoration: {
      appStateRestored: true,
      repositorySelectionRestored: true,
      viewportRestored: true,
    },
  }
}

test('scene map pins all three exact gallery output contracts', () => {
  assert.equal(verifier.CaptureWidth, 960)
  assert.equal(verifier.CaptureHeight, 660)
  assert.deepEqual(verifier.SceneSpecifications, {
    'releases-compact': {
      outputOption: 'releases-output',
      outputBasename: 'material-github-releases-compact.png',
    },
    'pull-preview': {
      outputOption: 'pull-output',
      outputBasename: 'material-pull-preview.png',
    },
    'private-badge': {
      outputOption: 'private-output',
      outputBasename: 'private-repository-lock-badge.png',
    },
  })
  assert.equal(verifier.ReceiptBasename, 'repository-specialists-receipt.json')
})

test('strict CLI rejects unknown, duplicate, missing, and mismatched scene outputs', () => {
  const runRoot = path.join(
    os.tmpdir(),
    'desktop-material-p0-ui-contract-parser'
  )
  const base = completeArguments(runRoot)
  const parsed = verifier.parseArguments(base)
  assert.deepEqual(parsed.scenes, [
    'releases-compact',
    'pull-preview',
    'private-badge',
  ])
  assert.equal(parsed.port, 9337)

  assert.throws(
    () => verifier.parseArguments([...base, '--host', '0.0.0.0']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--port', '9338']),
    /Duplicate argument/
  )
  assert.throws(
    () =>
      verifier.parseArguments(
        completeArguments(runRoot, ['releases-compact']).filter(
          (value, index, array) =>
            value !== '--releases-output' &&
            array[index - 1] !== '--releases-output'
        )
      ),
    /releases-output is required/
  )
  assert.throws(
    () =>
      verifier.parseArguments([
        ...completeArguments(runRoot, ['pull-preview']),
        '--private-output',
        path.join(runRoot, 'private-repository-lock-badge.png'),
      ]),
    /requires selecting private-badge/
  )
  const wrongBasename = completeArguments(runRoot, ['pull-preview'])
  wrongBasename[wrongBasename.indexOf('--pull-output') + 1] = path.join(
    runRoot,
    'captures',
    'almost-pull.png'
  )
  assert.throws(
    () => verifier.parseArguments(wrongBasename),
    /material-pull-preview\.png/
  )
})

test('owned path validation requires a direct real Temp root and create-only outputs', t => {
  const runRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-p0-ui-contract-')
  )
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(runRoot, 'fixture', '.git'), { recursive: true })
  const options = verifier.parseArguments(
    completeArguments(runRoot, ['releases-compact', 'private-badge'])
  )
  const validated = verifier.validateOwnedPaths(options)
  assert.equal(validated.runRoot, fs.realpathSync.native(runRoot))
  assert.equal(
    verifier.isContainedPath(
      validated.runRoot,
      validated.outputs['releases-compact']
    ),
    true
  )

  fs.writeFileSync(validated.outputs['releases-compact'], 'collision')
  assert.throws(
    () => verifier.validateOwnedPaths(options),
    /must be a new file/
  )

  const escaped = verifier.parseArguments(
    completeArguments(runRoot, ['pull-preview'])
  )
  escaped.outputs['pull-preview'] = path.join(
    os.tmpdir(),
    'material-pull-preview.png'
  )
  assert.throws(
    () => verifier.validateOwnedPaths(escaped),
    /inside the owned run root/
  )
})

test('provider endpoints are accepted only on uncredentialed loopback /api/v3', () => {
  assert.equal(
    verifier.validateLoopbackEndpoint('http://127.0.0.1:57520/api/v3'),
    'http://127.0.0.1:57520/api/v3'
  )
  for (const endpoint of [
    'https://127.0.0.1:57520/api/v3',
    'http://example.com/api/v3',
    'http://user:password@localhost:57520/api/v3',
    'http://localhost:57520/not-api',
    'http://127.0.0.1:57520/api/v3?token=secret',
    'http://127.0.0.1:57520/api/v3#credential',
  ]) {
    assert.throws(
      () => verifier.validateLoopbackEndpoint(endpoint),
      /loopback|invalid/
    )
  }
})

test('fixture Git rejects inherited redirects, config, tracing, and hooks', () => {
  for (const contract of [
    '/^GIT_CONFIG(?:_|$)/',
    '/^GIT_TRACE(?:2)?(?:_|$)/',
    'GitRedirectEnvironmentNames.includes(normalized)',
    'GIT_CONFIG_GLOBAL: GitNullDevice',
    'GIT_CONFIG_SYSTEM: GitNullDevice',
    '`core.hooksPath=${GitNullDevice}`',
    "'commit.gpgSign=false'",
  ]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('owned pull fixture has exactly two incoming commits and three controlled paths', t => {
  const runRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-p0-ui-pull-contract-')
  )
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  const fixture = verifier.createPullFixture(runRoot)
  const state = verifier.inspectPullFixture(fixture)
  assert.equal(state.status, '')
  assert.equal(state.branch, 'main')
  assert.equal(state.ahead, 0)
  assert.equal(state.behind, 2)
  assert.notEqual(state.remoteTrackingOid, fixture.expectedUpstreamOid)
  assert.deepEqual(state.changedPaths, verifier.PullChangedPaths)
  assert.equal(
    fs.realpathSync.native(fixture.root),
    path.join(runRoot, verifier.PullFixtureDirectory)
  )
})

test('PNG inspection accepts only an IHDR image and returns exact dimensions', () => {
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png)
  Buffer.from('IHDR', 'ascii').copy(png, 12)
  png.writeUInt32BE(960, 16)
  png.writeUInt32BE(660, 20)
  assert.deepEqual(verifier.pngDimensions(png), {
    width: 960,
    height: 660,
  })
  assert.throws(() => verifier.pngDimensions(Buffer.alloc(24)), /original PNG/)
})

test('final receipt validator fails closed on false assertions or capture drift', () => {
  const receipt = passingReceipt()
  assert.equal(
    verifier.validateFinalReceipt(receipt, ['releases-compact']),
    receipt
  )
  const failed = passingReceipt()
  failed.scenes[0].assertions.exact = false
  assert.throws(
    () => verifier.validateFinalReceipt(failed, ['releases-compact']),
    /did not pass/
  )
  const wrongSize = passingReceipt()
  wrongSize.scenes[0].capture.width = 959
  assert.throws(
    () => verifier.validateFinalReceipt(wrongSize, ['releases-compact']),
    /capture receipt drifted/
  )
})

test('releases scene proves exact 200 percent, keyboard disclosure, and one full fixture row', () => {
  for (const contract of [
    "await menuEvent(client, 'zoom-reset')",
    'for (let index = 0; index < 5; index += 1)',
    "await menuEvent(client, 'zoom-in')",
    "'.github-releases-compact-tools-toggle'",
    "'Filters and selection'",
    "await dispatchKey(client, 'Enter', 'Enter', 13)",
    "'#github-releases-search'",
    'Select all visible releases',
    "'Desktop Material 3.6.3'",
    "'v3.6.3-material'",
    'surface.completeRowCount === 1',
    'captureBeyondViewport: false',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing Releases contract: ${contract}`
    )
  }
  assert.match(source, /innerWidth === \$\{CaptureWidth \/ 2\}/)
  assert.match(source, /innerHeight === \$\{CaptureHeight \/ 2\}/)
})

test('pull scene opens the real frozen review and never confirms it', () => {
  for (const contract of [
    "await menuEvent(client, 'add-local-repository')",
    "await menuEvent(client, 'pull')",
    "'#pull-preview'",
    "surface.submitLabel === 'Pull reviewed commit'",
    'surface.commitRows.length === 2',
    'surface.changedRows.length === 3',
    'afterFetch.localRefs === fixture.initial.localRefs',
    'frozen.localRefs === fixture.initial.localRefs',
    'frozen.remoteTrackingOid === fixture.expectedUpstreamOid',
    'restoreAddedPullRepositoryThroughAppNativeHook',
    "await clickText(client, 'Cancel', '#pull-preview')",
  ]) {
    assert.ok(source.includes(contract), `missing Pull contract: ${contract}`)
  }
  assert.equal(
    source.includes("clickText(client, 'Pull reviewed commit'"),
    false
  )
  assert.deepEqual(verifier.PullChangedPaths, [
    { status: 'M', path: 'config/material.json' },
    { status: 'A', path: 'docs/incoming-guide.md' },
    { status: 'D', path: 'docs/retired.md' },
  ])
})

test('private scene uses named exact metadata hooks and forbids provider inference', () => {
  for (const contract of [
    'async function applyExactPrivateMetadataThroughAppNativeHook(appStore)',
    'db.gitHubRepositories.update(',
    '{ private: true }',
    'appStore.repositoriesStore.emitUpdatedRepositories()',
    "await menuEvent(client, 'choose-repository')",
    "'.repository-list-logo-appearance-target'",
    "'.repository-list-logo.icon-for-repository'",
    "'.repository-private-badge'",
    "badge.getAttribute('aria-label') !== 'Private repository'",
    "badge.getAttribute('role') !== 'img'",
    "surface.lockGlyph === 'lock'",
    'requestsBefore === requestsAtCapture',
    'requestsAfterCapture !== requestsBefore',
    'restorePrivateMetadataThroughAppNativeHook',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing private contract: ${contract}`
    )
  }
  assert.doesNotMatch(source, /refreshRepository|matchGitHub|fetch\(/)
})

test('helper is attach-only, uses Git subprocesses only for its owned fixture, and never fakes capture DOM', () => {
  for (const forbidden of [
    'chromium.launch(',
    'electron.launch(',
    'electron.exe',
    'Start-Process',
    'Page.bringToFront',
    'setForegroundWindow',
    'show_headless_desktop',
    'browser.close(',
    'page.close(',
    'window.close(',
    'document.createElement(',
    '.appendChild(',
    '.innerHTML =',
    '.textContent =',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  assert.match(source, /execFileSync\(\s*'git',\s*\[/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /Page\.captureScreenshot/)
  assert.match(
    source,
    /fs\.writeFileSync\(outputPath, buffer, \{ flag: 'wx' \}\)/
  )
  assert.match(source, /fs\.writeFileSync\([\s\S]*flag: 'wx'/)
  assert.equal(
    source.includes("require('./capture_gallery_cdp"),
    false,
    'standalone verifier must not import the gallery driver'
  )
})
