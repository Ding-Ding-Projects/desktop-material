'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const driverPath = path.join(__dirname, 'capture_gallery_cdp.js')
const source = fs.readFileSync(driverPath, 'utf8')

function frozenStringArray(name) {
  const match = source.match(
    new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`)
  )
  assert.notEqual(match, null, `${name} is missing`)
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, value]) => value)
}

test('every requested scene resets before its runner executes', () => {
  const loopStart = source.indexOf('for (const name of names)')
  const loopEnd = source.indexOf('client.close()', loopStart)
  assert.notEqual(loopStart, -1)
  assert.notEqual(loopEnd, -1)

  const sceneLoop = source.slice(loopStart, loopEnd)
  const resetIndex = sceneLoop.indexOf('await resetSceneState(name)')
  const runIndex = sceneLoop.indexOf('await run()')
  assert.notEqual(resetIndex, -1)
  assert.notEqual(runIndex, -1)
  assert.ok(resetIndex < runIndex)
})

test('reset covers every transient surface that contaminated captures', () => {
  for (const contract of [
    "'dialog[open]'",
    '\'[role="dialog"]\'',
    "'#foldout-container'",
    "'#app-menu-foldout'",
    "'.material-context-menu-backdrop'",
    "'.error-notice-stack .error-notice'",
    "'.error-notice-dismiss'",
    '\'.tooltip, [role="tooltip"]\'',
    "'Input.dispatchMouseEvent'",
    "await menuEvent('zoom-reset')",
    "await menuEvent('show-changes')",
    'await assertNoSceneLeaks(`scene ${name}`)',
  ]) {
    assert.ok(source.includes(contract), `missing reset contract: ${contract}`)
  }
})

test('contaminated gallery scenes always restore the Changes base', () => {
  const match = source.match(
    /const StatePreservingScenes = new Set\(\[([\s\S]*?)\]\)/
  )
  assert.notEqual(match, null)
  const statePreservingScenes = match[1]

  for (const scene of [
    'repository-tools',
    'repository-tools-scroll',
    'branch-rules',
    'add-submodule',
    'anchored-appearance',
    'repository-folder-detection',
    'repository-submodule-management',
  ]) {
    assert.ok(
      source.includes(`scene('${scene}'`),
      `gallery scene is missing: ${scene}`
    )
    assert.ok(
      !statePreservingScenes.includes(`'${scene}'`),
      `gallery scene may bypass the Changes reset: ${scene}`
    )
  }
})

test('appearance captures open the actual owners instead of retired settings tabs', () => {
  for (const contract of [
    "scene('anchored-appearance'",
    "contextMenuSelector('#desktop-app-toolbar')",
    "scene('app-identity'",
    '\'[data-customization-surface="app-identity"]\'',
    "scene('logo-studio'",
    "contextMenuSelector('.repository-list-logo-appearance-target')",
    "scene('tab-style'",
    "contextMenuSelector('.repository-tab.active .repository-tab-label')",
    'waitForPrivacySafeAnchoredEditor',
  ]) {
    assert.ok(source.includes(contract), `missing owner contract: ${contract}`)
  }

  assert.ok(!source.includes("captureSettingsTab('Appearance'"))
  assert.ok(!source.includes("openRepositorySettingsTab('Appearance')"))
  assert.ok(!source.includes("scene('settings-appearance'"))
})

test('new prerequisite scenes use deterministic synthetic owner flows', () => {
  const expected = new Map([
    ['anchored-appearance', 'material-customization'],
    ['repository-folder-detection', 'material-repository-folder-detection'],
    [
      'repository-submodule-management',
      'material-repository-submodule-management',
    ],
  ])

  for (const [sceneName, captureName] of expected) {
    assert.ok(source.includes(`scene('${sceneName}'`))
    assert.ok(source.includes(`capture('${captureName}')`))
  }

  assert.ok(source.includes("['design-system', 'tools/release-kit']"))
  assert.ok(source.includes("channel === 'show-open-dialog'"))
  assert.ok(
    source.includes("setter.call(input, 'C:\\\\Synthetic\\\\Repository Fleet')")
  )
  assert.ok(
    /shiftF10Selector\(\s*'\.submodule-appearance-preview \.submodule-context-back'\s*\)/.test(
      source
    )
  )
})

test('reset rejects unknown base surfaces and residual leakage', () => {
  assert.ok(source.includes('No known base surface is available before'))
  assert.ok(source.includes('did not reset to a known base surface'))
  assert.ok(source.includes('Scene reset left visible UI leakage before'))
})

test('capture-only tooltip suppression is removed before disconnect', () => {
  const cleanup = source.indexOf(
    "document.getElementById('gallery-tooltip-suppressor')?.remove()"
  )
  const close = source.indexOf('client.close()', cleanup)
  assert.notEqual(cleanup, -1)
  assert.notEqual(close, -1)
  assert.ok(cleanup < close)
})

test('canonical mode owns the exact 68-image wiki catalog', () => {
  const scenes = frozenStringArray('CanonicalGalleryScenes')
  const outputs = frozenStringArray('CanonicalGalleryOutputs')
  const gallery = fs.readFileSync(
    path.join(__dirname, '..', '..', 'docs', 'wiki', 'Feature-Gallery.md'),
    'utf8'
  )
  const catalog = [
    ...gallery.matchAll(/^\| `([^`]+)\.png` \| [^|]+ \|$/gm),
  ].map(([, name]) => name)

  assert.equal(outputs.length, 68)
  assert.equal(new Set(outputs).size, 68)
  assert.deepEqual([...outputs].sort(), [...catalog].sort())
  for (const sceneName of scenes) {
    assert.ok(source.includes(`scene('${sceneName}'`), sceneName)
  }
  for (const required of [
    'submodule-context',
    'advanced-workflows',
    'cheap-lfs-preparing',
  ]) {
    assert.ok(scenes.includes(required), required)
  }
  assert.ok(source.includes("process.stdout.write('CANONICAL 68/68"))
})

test('capture candidates cannot overwrite tracked screenshots directly', () => {
  assert.ok(source.includes('requestedOutDir === undefined ? null'))
  assert.ok(
    source.includes(
      "fail('Capture candidates must be reviewed in Temp before promotion.')"
    )
  )
  assert.ok(source.includes("{ flag: 'wx' }"))
  assert.ok(!source.includes("args.get('out') ?? 'docs/assets/screenshots'"))
})

test('every screenshot passes the universal private-path gate', () => {
  const privacy = source.indexOf('async function assertCapturePrivacy(name)')
  const screenshot = source.indexOf("client.send('Page.captureScreenshot'")
  assert.notEqual(privacy, -1)
  assert.notEqual(screenshot, -1)
  assert.ok(privacy < screenshot)
  assert.ok(source.includes('await assertCapturePrivacy(name)'))
  for (const marker of [
    'C:\\\\Users\\\\',
    'C:\\/Users\\/',
    'ADMINI~1',
    'AppData',
    'desktop-material-p0-ui-',
    '.repository-tools-introduction',
    '.sparse-checkout-heading-copy small',
    '.tab-search-result-copy > span',
    'C:\\\\Synthetic\\\\material-fixture',
  ]) {
    assert.ok(source.includes(marker), `missing privacy contract: ${marker}`)
  }
})

test('canonical workflow scenes use current reviewed controls and outcomes', () => {
  for (const contract of [
    "clickText('Sync repositories')",
    "clickText('Start pull'",
    'Every repository has a final result.',
    '\'[data-hub-tool="shallow-history"]\'',
    "clickText('Check history status'",
    "clickText('Review bounded deepen'",
    "clickText('Deepen by 1 commits'",
    'Fetched 1 additional commits of history from origin.',
    "clickText('Review full history'",
    "clickText('Fetch full history'",
    'This repository is no longer shallow.',
    "clickSelector('.history-filter-chips-toggle')",
    "clickSelector('.history-regex-builder-chip')",
    "document.querySelector('#regex-builder-title')",
    '\'#choose-branch [role="option"][aria-label^="main"]\'',
    "document.querySelector('.rebase-route')",
    "document.querySelector('.rebase-ahead-behind')",
    "document.querySelector('.rebase-commit-preview')",
  ]) {
    assert.ok(source.includes(contract), `missing reviewed state: ${contract}`)
  }
  for (const stale of [
    "clickText('Pull all'",
    'Fetch 25 older commits',
    'Deepen by 25',
    'Fetch all remaining history',
    'Review deployments',
  ]) {
    assert.ok(!source.includes(stale), `stale control remains: ${stale}`)
  }
})

test('Actions captures prove inspector pagination, logs, reviews, and cancellation', () => {
  for (const contract of [
    'async function openInspectorRun()',
    'async function loadInspectorPageTwo()',
    '50 loaded of ${ready.workflowRunCount} workflow runs',
    '50 loaded of ${ready.inspectorJobCount} jobs for attempt 2',
    'Page-two current-attempt Windows packaging sentinel',
    'Exact workflow job ${ready?.inspectorCurrentJobSentinelId}',
    '[aria-label="Cancel workflow run 74"]',
    "clickText('Keep current state'",
    "document.querySelectorAll('.actions-pending-environment').length === 2",
    'Locked deployment environment',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing Actions contract: ${contract}`
    )
  }
  assert.ok(!source.includes('WARN no cancellable run found'))
})

test('capture scenes prove PR, sparse, scale, merge, and distinct artifact states', () => {
  for (const contract of [
    "setInput('.sparse-checkout-editor', 'docs/')",
    "document.querySelector('.sparse-checkout-confirmation')",
    "document.querySelector('.pull-request-files-changed')",
    "document.querySelector('#create-github-pull-request')",
    "clickText('Review pull request'",
    "clickText('Create pull request'",
    'Pull request #73 created',
    "countProviderRequests('POST', pullRequestPath)",
    "document.querySelector('#merge-all .merge-all-summary')",
    "document.querySelectorAll('#merge-all .merge-all-results tbody tr')",
    'sha256File(pageTwo) === sha256File(inventory)',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing outcome contract: ${contract}`
    )
  }
  assert.match(
    source,
    /scene\('scale-200',[\s\S]*?for \(let index = 0; index < 5; index\+\+\)/
  )
  assert.ok(source.includes('=== 200`'))
})
