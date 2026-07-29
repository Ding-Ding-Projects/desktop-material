'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const verifier = require('./verify_progressive_loading_cdp')

const source = fs.readFileSync(
  path.join(__dirname, 'verify_progressive_loading_cdp.js'),
  'utf8'
)

function validFailure() {
  return {
    failureCount: 1,
    loadingCount: 0,
    role: 'alert',
    title: 'Repository tools could not be loaded',
    body: 'Nothing else in the app was affected. Select Try again to load Repository tools once more.',
    detail:
      'Reported error: Loading chunk repository-tools failed. (error: <local app asset>/repository-tools.js)',
    retryText: 'Try again',
    retryEnabled: true,
    loadingObserved: true,
    failedObserved: true,
    orderedTransition: true,
    events: [
      {
        sequence: 1,
        kind: 'loading',
        role: 'status',
        ariaLive: 'polite',
        ariaBusy: 'true',
      },
      {
        sequence: 2,
        kind: 'failed',
        role: 'alert',
        visibleDialogs: 0,
      },
    ],
    activeTag: 'BODY',
    activeInsideFailure: false,
    dialogCount: 0,
    repositoryRailVisible: true,
    changesControlEnabled: true,
    inViewport: true,
    noPrivatePath: true,
    namesTargetChunk: true,
  }
}

function validFinal() {
  const chunks = verifier.ExpectedChunks.map((name, index) => ({
    name,
    bytes: 10_000 + index,
    sha256: String(index + 1).repeat(64),
  }))
  const target = chunks.find(chunk => chunk.name === verifier.TargetChunk)
  return {
    schema: verifier.ReceiptSchema,
    specification: verifier.Specification,
    build: {
      renderer: {
        name: 'renderer.js',
        bytes: 1_000_000,
        sha256: 'a'.repeat(64),
      },
      chunks,
    },
    mutation: {
      target: verifier.TargetChunk,
      originalSha256: target.sha256,
      withheld: true,
      restoredBeforeRetry: true,
      restoredSha256: target.sha256,
    },
    failure: validFailure(),
    recovery: {
      toolsVisible: true,
      mainVisible: true,
      failureCount: 0,
      loadingCount: 0,
      dialogCount: 0,
      repositoryRailVisible: true,
    },
    cachedRevisit: {
      eventCountBefore: 2,
      eventCountAfter: 2,
      newLoadingEvents: 0,
      newFailureEvents: 0,
      toolsVisible: true,
    },
    captures: {
      failure: {
        name: verifier.FailureCaptureName,
        width: verifier.Specification.width,
        height: verifier.Specification.height,
        bytes: 30_000,
        sha256: 'b'.repeat(64),
      },
      recovered: {
        name: verifier.RecoveryCaptureName,
        width: verifier.Specification.width,
        height: verifier.Specification.height,
        bytes: 40_000,
        sha256: 'c'.repeat(64),
      },
    },
    cleanup: {
      observerRemoved: true,
      stateRemoved: true,
      chunkPresent: true,
      withheldSiblingAbsent: true,
      chunkSha256: target.sha256,
    },
  }
}

test('fixed verifier inventories the exact seven asynchronous chunks', () => {
  assert.deepEqual(verifier.ExpectedChunks, [
    'repository-actions.js',
    'repository-cheap-lfs.js',
    'repository-github-api.js',
    'repository-issues.js',
    'repository-provider-triage.js',
    'repository-releases.js',
    'repository-tools.js',
  ])
  assert.equal(verifier.TargetChunk, 'repository-tools.js')
  assert.deepEqual(verifier.Specification, {
    width: 1280,
    height: 860,
    theme: 'light',
    languageMode: 'english',
    funnyLevelEnglish: 1,
    funnyLevelCantonese: 1,
  })
  assert.match(source, /actual\)\s*!==\s*JSON\.stringify\(ExpectedChunks\)/)
})

test('CLI requires owned fixture and distinct original-pixel outputs', () => {
  const parsed = verifier.parseArguments([
    '--port',
    '9337',
    '--run-root',
    'C:\\Temp\\desktop-material-p0-ui-issue82',
    '--repository-path',
    'C:\\Temp\\desktop-material-p0-ui-issue82\\fixture',
    '--capture-failure',
    'C:\\Temp\\desktop-material-p0-ui-issue82\\captures\\failure.png',
    '--capture-recovered',
    'C:\\Temp\\desktop-material-p0-ui-issue82\\captures\\recovered.png',
    '--receipt',
    'C:\\Temp\\desktop-material-p0-ui-issue82\\receipts\\issue82.json',
  ])
  assert.equal(parsed.port, 9337)
  assert.match(parsed.failureCapturePath, /failure\.png$/)
  assert.throws(
    () => verifier.parseArguments(['--port', '9337']),
    /--run-root is required/
  )
  assert.throws(
    () => verifier.parseArguments(['--port', '9337', '--port', '9338']),
    /Duplicate/
  )
})

test('transition observer is installed before the real section action', () => {
  const observer = source.indexOf('await installTransitionObserver()')
  const withhold = source.indexOf('fs.renameSync(target, withheld)')
  const action = source.indexOf(
    "await emitMenuEvent('show-repository-tools')",
    observer
  )
  const failure = source.indexOf('validateFailureReceipt', action)
  assert.ok(observer >= 0)
  assert.ok(withhold > observer)
  assert.ok(action > withhold)
  assert.ok(failure > action)
  for (const contract of [
    "record(root, 'loading'",
    "record(root, 'failed'",
    "role: element.getAttribute('role')",
    "ariaLive: element.getAttribute('aria-live')",
    "ariaBusy: element.getAttribute('aria-busy')",
    'orderedTransition',
  ]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('failure gate requires local accessible recovery without focus or modal theft', () => {
  const receipt = validFailure()
  assert.equal(verifier.validateFailureReceipt(receipt), receipt)
  for (const mutate of [
    candidate => {
      candidate.orderedTransition = false
    },
    candidate => {
      candidate.role = 'status'
    },
    candidate => {
      candidate.activeInsideFailure = true
    },
    candidate => {
      candidate.dialogCount = 1
    },
    candidate => {
      candidate.noPrivatePath = false
    },
    candidate => {
      candidate.namesTargetChunk = false
    },
    candidate => {
      candidate.events[0].ariaBusy = 'false'
    },
  ]) {
    const candidate = structuredClone(receipt)
    mutate(candidate)
    assert.throws(() => verifier.validateFailureReceipt(candidate))
  }
})

test('privacy gate rejects drive, parenthesized-profile, and UNC paths', () => {
  const privatePath = new RegExp(verifier.PrivatePathPatternSource, 'i')
  for (const value of [
    'file:///C:/Users/Alice (Work)/AppData/Local/repository-tools.js',
    'file://build-server/share/private/repository-tools.js',
    '\\\\build-server\\share\\private\\repository-tools.js',
    'D:\\private\\repository-tools.js',
    'Cannot load “C:\\Users\\Alice\\AppData\\chunk.js”',
    'Cannot load C:\\Users\\Alice\\AppData\\chunk.js…',
    'Cannot load \\\\server\\share\\private\\chunk.js—retry',
    'Cannot load 「C:\\Users\\Alice\\AppData\\chunk.js」',
    'Cannot load 『file:///C:/Users/Alice/AppData/chunk.js』',
  ]) {
    assert.match(value, privatePath)
  }
  assert.doesNotMatch(
    'Reported error: <local app asset>/repository-tools.js',
    privatePath
  )
  assert.doesNotMatch(
    'Unable to load https://example.invalid/repository-tools.js',
    privatePath
  )
})

test('the exact chunk is restored before physical retry and in finally', () => {
  const firstRestore = source.indexOf('fs.renameSync(withheld, target)')
  const retry = source.indexOf('await activateRetry()')
  const finallyBlock = source.lastIndexOf('if (chunkWithheld)')
  const finalRestore = source.indexOf(
    'fs.renameSync(withheld, target)',
    finallyBlock
  )
  assert.ok(firstRestore >= 0)
  assert.ok(retry > firstRestore)
  assert.ok(finallyBlock > retry)
  assert.ok(finalRestore > finallyBlock)
  assert.match(source, /sha256File\(target\) !== targetReceipt\.sha256/)
  assert.match(source, /Input\.dispatchMouseEvent/)
  assert.doesNotMatch(source, /\.click\(\).*Try again/)
})

test('recovery proves the real surface and a spinner-free cached revisit', () => {
  for (const contract of [
    "document.querySelector('.repository-tools-sidebar')",
    "document.querySelector('main.repository-tools')",
    'newLoadingEvents',
    'newFailureEvents',
    "await emitMenuEvent('show-changes')",
    "await emitMenuEvent('show-repository-tools')",
  ]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('captures and final receipt require restoration and renderer cleanup', () => {
  const receipt = validFinal()
  assert.equal(verifier.validateFinalReceipt(receipt), receipt)
  for (const mutate of [
    candidate => {
      candidate.mutation.restoredSha256 = 'f'.repeat(64)
    },
    candidate => {
      candidate.cachedRevisit.newLoadingEvents = 1
    },
    candidate => {
      candidate.cleanup.withheldSiblingAbsent = false
    },
    candidate => {
      candidate.cleanup.observerRemoved = false
    },
    candidate => {
      candidate.captures.failure.name = 'mock.png'
    },
  ]) {
    const candidate = structuredClone(receipt)
    mutate(candidate)
    assert.throws(() => verifier.validateFinalReceipt(candidate))
  }
  assert.match(source, /Page\.captureScreenshot/)
  assert.match(source, /fromSurface: true/)
  assert.match(source, /captureBeyondViewport: false/)
  assert.match(source, /flag: 'wx'/)
})

test('verifier never launches the app or fabricates the failure DOM', () => {
  assert.doesNotMatch(
    source,
    /child_process|spawnSync|execFile|Start-Process|electron\.exe/
  )
  assert.doesNotMatch(
    source,
    /createElement\(['"](?:section|button|dialog)['"]\)|innerHTML\s*=/
  )
  assert.match(source, /require\('electron'\)\.ipcRenderer\.emit/)
  assert.match(source, /MutationObserver/)
})
