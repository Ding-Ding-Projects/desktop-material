/* eslint-disable no-sync -- contract tests read one bounded local helper */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const verifier = require('./verify_cheap_lfs_restore_progress_cdp')
const source = fs.readFileSync(
  path.join(__dirname, 'verify_cheap_lfs_restore_progress_cdp.js'),
  'utf8'
)

function validSurfaceReceipt(scenario = 'wide') {
  const specification = verifier.ScenarioSpecifications[scenario]
  return {
    schemaVersion: 1,
    scenario,
    appearance: {
      theme: 'dark',
      persistedTheme: 'dark',
      languageMode: specification.languageMode,
      persistedLanguageMode: specification.languageMode,
      reducedMotion: true,
    },
    viewport: {
      width: specification.width,
      height: specification.height,
      devicePixelRatio: 1,
    },
    hydration: {
      repositoryMatched: true,
      updateInvoked: true,
      statePublished: true,
    },
    fixture: {
      lookAheadThresholdPercent: 90,
      currentLanePercent: 90,
      currentLaneProcessedBytes: 90 * verifier.MiB,
      currentLaneTotalBytes: 100 * verifier.MiB,
      prefetchLanePresent: true,
      prefetchLanePercent: 10,
    },
    frame: { cardFound: true },
    card: { currentLane: { percent: '90%' } },
    assertions: Object.fromEntries(
      verifier.ExpectedAssertionNames.map(name => [name, true])
    ),
  }
}

function validFinalReceipt(scenario = 'wide') {
  const specification = verifier.ScenarioSpecifications[scenario]
  return {
    ...validSurfaceReceipt(scenario),
    capture: {
      width: specification.width,
      height: specification.height,
      bytes: 30_000,
      sha256: 'a'.repeat(64),
    },
    cleanup: {
      appStoreFound: true,
      updateInvoked: true,
      stateCleared: true,
      cardRemoved: true,
    },
  }
}

test('scenarios pin the required wide English and narrow bilingual viewports', () => {
  assert.deepEqual(verifier.ScenarioSpecifications.wide, {
    width: 1440,
    height: 960,
    languageMode: 'english',
  })
  assert.deepEqual(verifier.ScenarioSpecifications['narrow-bilingual'], {
    width: 640,
    height: 960,
    languageMode: 'bilingual',
  })
})

test('CLI parsing rejects unknown, duplicate, incomplete, and unsafe arguments', () => {
  const root = 'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-contract1'
  const base = [
    '--port',
    '9337',
    '--run-root',
    root,
    '--repository-path',
    `${root}\\fixture`,
    '--scenario',
    'wide',
    '--capture',
    `${root}\\captures\\wide.png`,
    '--receipt',
    `${root}\\receipts\\wide.json`,
  ]
  const parsed = verifier.parseArguments(base)
  assert.equal(parsed.scenario, 'wide')
  assert.equal(parsed.port, 9337)
  assert.throws(
    () => verifier.parseArguments([...base, '--mystery', 'value']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--port', '9338']),
    /Duplicate argument/
  )
  assert.throws(
    () => verifier.parseArguments(base.slice(0, -1)),
    /Invalid argument/
  )
  const invalidScenario = [...base]
  invalidScenario[invalidScenario.indexOf('wide')] = 'phone'
  assert.throws(
    () => verifier.parseArguments(invalidScenario),
    /Scenario must be/
  )
  const invalidPort = [...base]
  invalidPort[invalidPort.indexOf('9337')] = '0'
  assert.throws(
    () => verifier.parseArguments(invalidPort),
    /valid loopback CDP port/
  )
})

test('owned output and disposable repository containment fail closed', () => {
  const root = path.resolve('C:\\Temp\\owned-restore-progress')
  assert.equal(
    verifier.isContainedPath(root, path.join(root, 'captures', 'wide.png')),
    true
  )
  assert.equal(
    verifier.isContainedPath(root, path.join(root, 'fixture', '.git')),
    true
  )
  assert.equal(verifier.isContainedPath(root, root), false)
  assert.equal(
    verifier.isContainedPath(
      root,
      path.resolve(root, '..', 'escaped', 'wide.png')
    ),
    false
  )
  assert.match(
    source,
    /Run root must be a direct Temp child named desktop-material-cheap-lfs-restore-progress-\*/
  )
  assert.match(source, /status\.dev !== realStatus\.dev/)
  assert.match(source, /status\.ino !== realStatus\.ino/)
  assert.match(source, /status\.isSymbolicLink\(\)/)
  assert.match(
    source,
    /Disposable repository must stay inside the owned run root/
  )
})

test('fixture proves equality at the exact 90 percent boundary and active prefetch', () => {
  const fixture = verifier.restoreProgressFixture(42, 'fixture')
  assert.equal(fixture.repositoryId, 42)
  assert.equal(fixture.repositoryName, 'fixture')
  assert.equal(fixture.lookAheadThresholdPercent, 90)
  assert.equal(fixture.currentLane.percent, 90)
  assert.equal(
    fixture.currentLane.processedBytes * 10,
    fixture.currentLane.totalBytes * 9
  )
  assert.equal(fixture.currentLane.relativePath, verifier.CurrentLanePath)
  assert.equal(fixture.currentLane.fileOrdinal, 3)
  assert.equal(fixture.currentLane.partOrdinal, 4)
  assert.notEqual(fixture.prefetchLane, null)
  assert.equal(fixture.prefetchLane.percent, 10)
  assert.equal(fixture.prefetchLane.relativePath, verifier.PrefetchLanePath)
  assert.equal(fixture.prefetchLane.fileOrdinal, 4)
  assert.equal(fixture.prefetchLane.partOrdinal, 1)
  assert.equal(verifier.ExpectedOverallPercentage, 60)
})

test('driver attaches to the real renderer and injects only through AppStore', () => {
  for (const contract of [
    "target.url.includes('/out/index.html')",
    'fiber.stateNode?.props?.appStore',
    'const repository = appStore.selectedRepository',
    'appStore.updateCheapLfsRestore(progress)',
    'appStore.getState().cheapLfsRestore',
    '\'.cheap-lfs-restore-strip > [data-verification="cheap-lfs-restore-progress"]\'',
    "client.send('Page.captureScreenshot'",
    "fs.writeFileSync(options.capturePath, buffer, { flag: 'wx' })",
  ]) {
    assert.ok(source.includes(contract), `missing attach contract: ${contract}`)
  }
  assert.doesNotMatch(
    source,
    /show_headless_desktop|setForegroundWindow|Page\.bringToFront/i
  )
  assert.doesNotMatch(
    source,
    /spawn(?:Sync)?|execFile(?:Sync)?|electron\.exe|Input\.dispatch/i
  )
  assert.doesNotMatch(source, /writeSparseFile|ftruncateSync/)
  assert.doesNotMatch(source, /Authorization:\s*Bearer|github_pat_[A-Za-z0-9]/)
})

test('renderer inspection retains the exact boundary, M3, accessibility, and clipping gates', () => {
  const expression = verifier.inspectionExpression(
    {
      scenario: 'wide',
      specification: verifier.ScenarioSpecifications.wide,
    },
    {
      repositoryMatched: true,
      updateInvoked: true,
      statePublished: true,
    },
    { cardFound: true }
  )
  assert.doesNotThrow(() => new Function(`return ${expression}`))
  for (const contract of [
    'materialThreeSurface',
    'singlePoliteLiveSummary',
    'progressbarAccessibility',
    'exactNinetyPercentBoundary',
    'prefetchLaneActive',
    'lanesVisibleAndContained',
    'visibleContentNotClipped',
    'noHorizontalDocumentOverflow',
  ]) {
    assert.ok(expression.includes(contract), `missing UI gate: ${contract}`)
  }
  assert.match(expression, /getAttribute\('aria-valuenow'\) === "90"/)
  assert.match(expression, /getAttribute\('aria-valuenow'\) === "10"/)
  assert.match(expression, /getAttribute\('aria-valuenow'\) === "60"/)
})

test('cleanup always clears AppStore before the CDP connection closes', () => {
  const finallyIndex = source.indexOf('} finally {')
  const cleanupCall = source.lastIndexOf(
    'cleanup = await clearRestoreProgress()'
  )
  const clearUpdate = source.lastIndexOf('appStore.updateCheapLfsRestore(null)')
  const disconnect = source.lastIndexOf('client.close()')
  assert.ok(finallyIndex >= 0, 'missing top-level finally cleanup')
  assert.ok(cleanupCall > finallyIndex, 'cleanup must be called from finally')
  assert.ok(clearUpdate >= 0, 'cleanup must clear the real AppStore')
  assert.ok(
    disconnect > cleanupCall && disconnect > clearUpdate,
    'CDP must disconnect only after restore cleanup'
  )
  assert.match(source, /stateCleared/)
  assert.match(source, /cardRemoved/)
})

test('strict receipt validation rejects drift, false gates, extras, capture, or cleanup gaps', () => {
  for (const scenario of ['wide', 'narrow-bilingual']) {
    const surface = validSurfaceReceipt(scenario)
    const complete = validFinalReceipt(scenario)
    assert.equal(verifier.validateSurfaceReceipt(surface, scenario), surface)
    assert.equal(verifier.validateFinalReceipt(complete, scenario), complete)
  }

  const failedGate = validSurfaceReceipt()
  failedGate.assertions.exactNinetyPercentBoundary = false
  assert.throws(
    () => verifier.validateSurfaceReceipt(failedGate, 'wide'),
    /exactNinetyPercentBoundary/
  )

  const unexpectedGate = validSurfaceReceipt()
  unexpectedGate.assertions.unreviewedAssertion = true
  assert.throws(
    () => verifier.validateSurfaceReceipt(unexpectedGate, 'wide'),
    /unexpected:unreviewedAssertion/
  )

  const wrongBoundary = validSurfaceReceipt()
  wrongBoundary.fixture.currentLaneProcessedBytes -= 1
  assert.throws(
    () => verifier.validateSurfaceReceipt(wrongBoundary, 'wide'),
    /exact boundary/
  )

  const wrongViewport = validSurfaceReceipt()
  wrongViewport.viewport.width = 1439
  assert.throws(
    () => verifier.validateSurfaceReceipt(wrongViewport, 'wide'),
    /header diverged/
  )

  const badCapture = validFinalReceipt()
  badCapture.capture.sha256 = 'not-a-hash'
  assert.throws(
    () => verifier.validateFinalReceipt(badCapture, 'wide'),
    /invalid capture evidence/
  )

  const missingCleanup = validFinalReceipt()
  missingCleanup.cleanup.stateCleared = false
  assert.throws(
    () => verifier.validateFinalReceipt(missingCleanup, 'wide'),
    /invalid cleanup evidence/
  )

  const extraTopLevel = validFinalReceipt()
  extraTopLevel.unreviewed = true
  assert.throws(
    () => verifier.validateFinalReceipt(extraTopLevel, 'wide'),
    /unexpected shape/
  )
})

test('top-level non-Error failures remain diagnosable and CDP null sends are accepted', () => {
  assert.match(source, /Unknown Cheap LFS restore progress verifier error\./)
  assert.match(source, /error instanceof Error/)
  assert.match(source, /error !== undefined && error !== null/)
})
