/* eslint-disable no-sync -- contract tests read one bounded local helper */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const verifier = require('./verify_cheap_lfs_progress_cdp')
const source = fs.readFileSync(
  path.join(__dirname, 'verify_cheap_lfs_progress_cdp.js'),
  'utf8'
)

function validReceipt(scenario = 'wide') {
  const specification = verifier.ScenarioSpecifications[scenario]
  return {
    schemaVersion: 1,
    scenario,
    appearance: {
      theme: 'dark',
      languageMode: specification.languageMode,
    },
    viewport: {
      width: specification.width,
      height: specification.height,
    },
    assertions: {
      terminalVisible: true,
      exactlyThreeActiveRows: true,
      largeFileFilterVisibleAndActive: true,
    },
  }
}

test('capture scenarios pin exact dark wide and narrow bilingual viewports', () => {
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

test('CLI rejects unknown options, duplicate options, and unsafe scenarios', () => {
  const base = [
    '--port',
    '9337',
    '--run-root',
    'C:\\Temp\\desktop-material-cheap-lfs-progress-contract1',
    '--repository-path',
    'C:\\Temp\\desktop-material-cheap-lfs-progress-contract1\\fixture',
    '--scenario',
    'wide',
    '--capture',
    'C:\\Temp\\desktop-material-cheap-lfs-progress-contract1\\wide.png',
    '--receipt',
    'C:\\Temp\\desktop-material-cheap-lfs-progress-contract1\\wide.json',
  ]
  assert.equal(verifier.parseArguments(base).scenario, 'wide')
  assert.throws(
    () => verifier.parseArguments([...base, '--mystery', 'value']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--port', '9338']),
    /Duplicate argument/
  )
  const invalid = [...base]
  invalid[invalid.indexOf('wide')] = 'phone'
  assert.throws(() => verifier.parseArguments(invalid), /Scenario must be/)
})

test('owned path containment rejects roots and parent traversal', () => {
  const root = path.resolve('C:\\Temp\\owned-root')
  assert.equal(
    verifier.isContainedPath(root, path.join(root, 'fixture', 'large.bin')),
    true
  )
  assert.equal(verifier.isContainedPath(root, root), false)
  assert.equal(
    verifier.isContainedPath(root, path.resolve(root, '..', 'escaped.bin')),
    false
  )
})

test('real-directory validation uses filesystem identity for Windows short-name aliases', () => {
  assert.match(source, /status\.dev !== realStatus\.dev/)
  assert.match(source, /status\.ino !== realStatus\.ino/)
  assert.match(source, /status\.isSymbolicLink\(\)/)
  assert.doesNotMatch(
    source,
    /normalizedPath\(real\) !== normalizedPath\(candidate\)/
  )
})

test('receipt validator fails closed on any false assertion or drift', () => {
  for (const scenario of ['wide', 'narrow-bilingual']) {
    const receipt = validReceipt(scenario)
    assert.equal(
      verifier.validateSurfaceReceipt(
        receipt,
        verifier.ScenarioSpecifications[scenario]
      ),
      receipt
    )
  }

  const failed = validReceipt()
  failed.assertions.terminalVisible = false
  assert.throws(
    () =>
      verifier.validateSurfaceReceipt(
        failed,
        verifier.ScenarioSpecifications.wide
      ),
    /terminalVisible/
  )

  const wrongSize = validReceipt()
  wrongSize.viewport.width = 1439
  assert.throws(
    () =>
      verifier.validateSurfaceReceipt(
        wrongSize,
        verifier.ScenarioSpecifications.wide
      ),
    /receipt header diverged/
  )
})

test('driver uses app-native hydration and never controls a visible desktop', () => {
  for (const contract of [
    'appStore._loadStatus(repository, false)',
    'appStore._updateFileListFilter(repository',
    'dispatcher.toggleChangesFilterVisibility()',
    'appStore.repositoryStateCache.update(repository',
    "commitOperationPhase: { kind: 'cheap-lfs', progress }",
    "'.cheap-lfs-mini-terminal'",
    '\'.cheap-lfs-terminal-active-file[role="listitem"]\'',
    '\'.cheap-lfs-terminal-progress[role="progressbar"]\'',
    "(value.textContent ?? '').includes('100 MiB')",
    'activeRows.length === 3',
    'Page.captureScreenshot',
    "fs.writeFileSync(options.capturePath, buffer, { flag: 'wx' })",
  ]) {
    assert.ok(source.includes(contract), `missing driver contract: ${contract}`)
  }

  assert.doesNotMatch(source, /show_headless_desktop|setForegroundWindow/i)
  assert.doesNotMatch(source, /spawnSync|execFileSync|electron\.exe/)
  assert.doesNotMatch(source, /Authorization:\s*Bearer|github_pat_[A-Za-z0-9]/)
})

test('large-file row selection uses a complete CDP pointer press and release', () => {
  const resetSelection = source.indexOf(
    'await appStore._selectWorkingDirectoryFiles(repository, [])'
  )
  const broughtToFront = source.indexOf(
    "await client.send('Page.bringToFront')"
  )
  const moved = source.indexOf("type: 'mouseMoved'")
  const pressed = source.indexOf("type: 'mousePressed'")
  const released = source.indexOf("type: 'mouseReleased'")
  assert.ok(resetSelection >= 0, 'missing deterministic selection reset')
  assert.ok(
    broughtToFront > resetSelection,
    'hidden-renderer activation must follow selection reset'
  )
  assert.ok(
    moved > broughtToFront,
    'pointer move must follow renderer activation'
  )
  assert.ok(pressed > moved, 'mousePressed must follow mouseMoved')
  assert.ok(released > pressed, 'mouseReleased must follow mousePressed')
  assert.match(source, /button: 'left',[\s\S]*buttons: 1,[\s\S]*clickCount: 1/)
  assert.match(source, /button: 'left',[\s\S]*buttons: 0,[\s\S]*clickCount: 1/)
  assert.doesNotMatch(
    source,
    /\b(?:row|candidateRow|visibleRow)\.click\(\)/,
    'DOM click omits the mousedown that SectionList uses for selection'
  )
  assert.match(source, /selectionClearedBeforePointer/)
  assert.match(source, /operationRestoredUnchanged: true/)
  assert.match(source, /settledDiffSurface: 'unrenderable-over-receive-limit'/)
  assert.match(source, /unrenderableDiffSettled: true/)
  assert.match(source, /The diff is too large to be displayed\./)
})

test('fixture expresses three distinct rows plus a suppressed overflow canary', () => {
  assert.equal(verifier.FixtureFiles.length, 3)
  assert.deepEqual(verifier.ExpectedSanitizedPaths, [
    'assets/cheap-lfs-demo-01.mp4',
    'datasets/cheap-lfs-demo-02.bin',
    'exports/cheap-lfs- demo-03.psd',
  ])
  assert.equal(verifier.ExpectedOverallPercentage, 53)
  assert.match(source, /overflow-worker-must-not-render\.dat/)
  assert.match(source, /expectedPercentages = \['45%', '66%', '75%'\]/)
})

test('active paths are verified from visible text without forbidden title tooltips', () => {
  assert.match(source, /rowReceipts\.map\(row => row\.path\)/)
  assert.doesNotMatch(source, /row\.path === row\.title/)
  assert.doesNotMatch(source, /title: row\.getAttribute\('title'\)/)
})

test('the renderer inspection program retains valid regex and newline escapes', () => {
  const expression = verifier.inspectionExpression(
    {
      scenario: 'wide',
      specification: verifier.ScenarioSpecifications.wide,
    },
    { repositoryMatched: true },
    { status: 'loaded' }
  )
  assert.doesNotThrow(() => new Function(`return ${expression}`))
  assert.match(expression, /replace\(\/\\s\+\/g/)
  assert.match(expression, /\\u0000-\\u001f/)
  assert.match(expression, /https\?:\\\/\\\/api\\\.github/)
})

test('top-level verifier failures remain diagnosable for non-Error rejections', () => {
  assert.match(
    source,
    /String\(error \?\? 'Unknown Cheap LFS verifier error\.'\)/
  )
  assert.match(source, /error instanceof Error/)
})

test('CDP sends accept both undefined and null success callbacks', () => {
  assert.match(source, /error !== undefined && error !== null/)
})

test('CLI-open review is accepted only through the scoped off-screen dialog', () => {
  assert.match(source, /getElementById\('add-existing-repository'\)/)
  assert.match(source, /querySelector\('button\[type="submit"\]'\)/)
  assert.match(source, /await acceptCliOpenReview\(\)/)
})

test('paused clone work cannot obscure a passing Cheap LFS capture', () => {
  assert.match(source, /getElementById\('batch-clone-progress'\)/)
  assert.match(
    source,
    /querySelector\('\.dialog-footer button\[type="submit"\]'\)/
  )
  assert.match(
    source,
    /await dismissPausedCloneQueueDialog\(\)[\s\S]*?await showChanges\(\)[\s\S]*?await hydrateAppState\([\s\S]*?await dismissPausedCloneQueueDialog\(\)/
  )
  assert.match(source, /noBlockingDialog:\s*blockingDialogs\.length === 0/)
})

test('large-file pointer retries are bounded and leave diagnostic receipts', () => {
  assert.match(source, /while \(pointerAttempts < 3 && !selectionSettled\)/)
  assert.match(source, /pointerFailureReceipts\.push/)
  assert.match(source, /pointerAttempts,/)
  assert.match(source, /did not settle after 3 pointer attempts/)
})

test('large-file filter gate relies on state hydration and the visible active chip', () => {
  assert.match(source, /candidateCount === \$\{FixtureFiles\.length\}/)
  assert.doesNotMatch(source, /\.changes-list-container/)
})

test('filter controls must clear the hidden-changes warning', () => {
  assert.match(source, /filterControlsClearHiddenChangesWarning/)
  assert.match(
    source,
    /filterRowRect\.bottom <= hiddenChangesWarningRect\.top \+ 1/
  )
})

test('capture framing keeps required filters and the complete progress surface visible', () => {
  assert.match(source, /progressSurfaceRect\.bottom - panelRect\.bottom \+ 2/)
  assert.match(source, /Math\.min\(\.\.\.requiredRects\.map/)
  assert.match(source, /const feasible = desiredScroll <= maxScroll/)
  assert.match(source, /requiredChipRects\.every/)
  assert.match(source, /receipt\.progressBottom <= receipt\.panelBottom - 2/)
  assert.match(source, /receipt\.undoTop >= receipt\.panelBottom - 1/)
  assert.match(source, /attempt < 12/)
  assert.match(
    source,
    /Math\.abs\(applied\.scrollTop - stable\.scrollTop\) <= 1/
  )
})

test('progress semantics compare the DOM attribute to a string literal', () => {
  const expression = verifier.inspectionExpression(
    {
      scenario: 'wide',
      specification: verifier.ScenarioSpecifications.wide,
    },
    { repositoryMatched: true },
    { status: 'loaded' }
  )
  assert.match(expression, /getAttribute\('aria-valuenow'\) === "53"/)
})
