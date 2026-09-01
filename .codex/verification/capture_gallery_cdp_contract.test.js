'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const {
  CanonicalCandidateCount,
  CanonicalGalleryOutputs,
  CaptureBatches,
  DeferredCanonicalOutputs,
  DeferredSpecialistOutputs,
  ExpectedPublishedGalleryCount,
  GalleryCapturePlan,
  PublishedGalleryOutputs,
  RetainedHistoricalEvidence,
  SpecialistCaptureEntries,
} = require('./gallery_capture_plan.js')

const driverPath = path.join(__dirname, 'capture_gallery_cdp.js')
const source = fs.readFileSync(driverPath, 'utf8')

function frozenStringArray(name) {
  const match = source.match(
    new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`)
  )
  assert.notEqual(match, null, `${name} is missing`)
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, value]) => value)
}

function sceneSource(name) {
  const start = source.indexOf(`scene('${name}'`)
  assert.notEqual(start, -1, `${name} scene is missing`)
  const next = source.indexOf("\nscene('", start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('gallery theme and language arguments accept only reviewed values', () => {
  for (const options of [
    [],
    ['--theme', 'dark'],
    ['--language-mode', 'cantonese'],
    ['--theme', 'light', '--language-mode', 'bilingual'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [driverPath, '--list', 'true', ...options],
      { encoding: 'utf8', windowsHide: true }
    )
    assert.equal(
      result.status,
      0,
      `reviewed presentation arguments failed: ${result.stderr}`
    )
    assert.match(result.stdout, /^welcome$/m)
  }

  for (const [option, value, expected] of [
    ['--theme', 'system', /expected light\|dark/],
    ['--language-mode', 'french', /expected english\|cantonese\|bilingual/],
  ]) {
    const result = spawnSync(
      process.execPath,
      [driverPath, '--list', 'true', option, value],
      { encoding: 'utf8', windowsHide: true }
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, expected)
  }
})

test('gallery presentation state is seeded, observed, and receipted fail closed', () => {
  assert.deepEqual(frozenStringArray('CaptureThemes'), ['light', 'dark'])
  assert.deepEqual(frozenStringArray('CaptureLanguageModes'), [
    'english',
    'cantonese',
    'bilingual',
  ])
  assert.match(
    source,
    /requestedCaptureOption\(\s*'theme',\s*CaptureThemes,\s*'light'\s*\)/
  )
  assert.match(
    source,
    /requestedCaptureOption\(\s*'language-mode',\s*CaptureLanguageModes,\s*'english'\s*\)/
  )
  for (const contract of [
    "localStorage.getItem('theme')",
    "localStorage.getItem('language-mode-v1')",
    "document.body.getAttribute('data-dm-language-mode')",
    "document.documentElement.getAttribute('data-language-mode')",
    'validateAppearanceLanguageSurface()',
    'LanguageSurfaceExpectations',
    'select[name="languageMode"]',
    'receipt?.value === requestedLanguageMode',
    'receipt?.labelCount === 1',
    'receipt?.ariaLabel === null',
    'receipt?.ariaLabelledBy === null',
    'receipt?.visible === true',
    'appearanceLanguageSurface?.value === requestedLanguageMode',
    'LANGUAGE_SURFACE',
    'Capture presentation state diverged during',
    'PRESENTATION_STATE',
    'SEED_STATE',
    'SCENE_STATE',
    'CAPTURE_STATE',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing presentation contract: ${contract}`
    )
  }

  const seedStart = source.indexOf('async function seedProfile()')
  const seedEnd = source.indexOf('async function ensureRepository(', seedStart)
  const seed = source.slice(seedStart, seedEnd)
  assert.ok(seed.includes("'theme': ${JSON.stringify(requestedTheme)}"))
  assert.ok(
    seed.includes(
      "'language-mode-v1': ${JSON.stringify(requestedLanguageMode)}"
    )
  )
  assert.ok(seed.includes('assertRequestedPresentationState('))
  assert.ok(seed.includes("'seeded profile'"))

  const captureStart = source.indexOf('async function capture(')
  const captureEnd = source.indexOf('/** Emit a menu event', captureStart)
  const capture = source.slice(captureStart, captureEnd)
  const stateGate = capture.indexOf('await assertRequestedPresentationState(')
  const privacyGate = capture.indexOf('await assertCapturePrivacy(name)')
  const screenshot = capture.indexOf("client.send('Page.captureScreenshot'")
  assert.ok(
    stateGate >= 0 && stateGate < privacyGate && privacyGate < screenshot
  )

  const loopStart = source.indexOf('for (const name of names)')
  const loopEnd = source.indexOf('if (canonical)', loopStart)
  const sceneLoop = source.slice(loopStart, loopEnd)
  const reset = sceneLoop.indexOf('await resetSceneState(name)')
  const resetGate = sceneLoop.indexOf(
    'await assertRequestedPresentationState(`reset before scene ${name}`,'
  )
  const run = sceneLoop.indexOf('await run()')
  const completionGate = sceneLoop.indexOf(
    'const scenePresentationReceipt = await assertRequestedPresentationState('
  )
  assert.ok(
    reset >= 0 && reset < resetGate && resetGate < run && run < completionGate
  )
})

test('canonical Appearance verification waits for the welcome transition', () => {
  const scenes = frozenStringArray('CanonicalGalleryScenes')
  assert.deepEqual(scenes.slice(0, 3), ['welcome', 'complete-welcome', 'seed'])

  const mainStart = source.indexOf('async function main()')
  const main = source.slice(mainStart)
  const sceneLoop = main.indexOf('for (const name of names)')
  const sceneRun = main.indexOf('await run()', sceneLoop)
  const deferredGate = main.indexOf(
    "if (canonical && name === 'complete-welcome')",
    sceneRun
  )
  const canonicalReceipt = main.indexOf(
    'Canonical gallery did not validate the Appearance language surface.',
    deferredGate
  )

  assert.ok(sceneLoop >= 0)
  assert.ok(sceneRun > sceneLoop)
  assert.ok(deferredGate > sceneRun)
  assert.ok(canonicalReceipt > deferredGate)
  assert.match(
    source,
    /requireAppearanceSurface = appearanceLanguageSurfaceReceipt !== null/
  )
  assert.match(
    main,
    /reset before scene \$\{name\}`,[\s\S]*requireAppearanceSurface: appearanceLanguageValidated/
  )
  assert.match(
    main,
    /completed scene \$\{name\}`,[\s\S]*requireAppearanceSurface: appearanceLanguageValidated/
  )
  assert.match(main, /validated Appearance language surface after welcome/)

  const validationStart = source.indexOf(
    'async function validateAppearanceLanguageSurface()'
  )
  const validationEnd = source.indexOf(
    'async function setViewport(',
    validationStart
  )
  const validation = source.slice(validationStart, validationEnd)
  const semanticClose = validation.indexOf(
    "await clickSelector('#preferences .preferences-close-button')"
  )
  const closedGate = validation.indexOf(
    "document.querySelector('#preferences') === null",
    semanticClose
  )
  assert.ok(semanticClose >= 0 && closedGate > semanticClose)
  assert.ok(!validation.includes('await pressEscape()'))
})

test('every renderer reload is fenced by the appearance coordinator', () => {
  const pageReloads =
    source.match(
      /await client\.send\('Page\.reload', \{ ignoreCache: true \}\)/g
    ) ?? []
  const locationReloads =
    source.match(/await evaluate\('window\.location\.reload\(\), true'\)/g) ??
    []
  assert.equal(pageReloads.length, 3)
  assert.equal(locationReloads.length, 1)
  assert.equal(pageReloads.length + locationReloads.length, 4)

  const helperStart = source.indexOf(
    'async function waitForElementAppearanceCoordinatorReady(context)'
  )
  const helperEnd = source.indexOf(
    'function expectedDocumentLanguage(',
    helperStart
  )
  assert.ok(helperStart >= 0 && helperEnd > helperStart)
  const helper = source.slice(helperStart, helperEnd)
  for (const contract of [
    "key.startsWith('__reactFiber$')",
    "key.startsWith('__reactInternalInstance$')",
    'fiber.stateNode?.props?.dispatcher',
    "typeof dispatcher?.isElementAppearanceCoordinatorReady === 'function'",
    'dispatcher.isElementAppearanceCoordinatorReady() === true',
  ]) {
    assert.ok(helper.includes(contract), `readiness helper misses ${contract}`)
  }
  assert.ok(!helper.includes('document.body.textContent'))
  assert.ok(!helper.includes('sleep('))

  const applyStart = source.indexOf(
    'async function applyRequestedPresentationState(context)'
  )
  const applyEnd = source.indexOf(
    'async function validateAppearanceLanguageSurface()',
    applyStart
  )
  const apply = source.slice(applyStart, applyEnd)
  const applyPre = apply.indexOf('`${context} before renderer reload`')
  const applyReload = apply.indexOf(
    "await client.send('Page.reload', { ignoreCache: true })"
  )
  const applyTimeOrigin = apply.indexOf(
    'performance.timeOrigin > ${JSON.stringify(beforeReloadTimeOrigin)}',
    applyReload
  )
  const applyPost = apply.indexOf('`${context} after renderer reload`')
  assert.ok(
    applyPre >= 0 &&
      applyPre < applyReload &&
      applyReload < applyTimeOrigin &&
      applyTimeOrigin < applyPost
  )

  const seedStart = source.indexOf('async function seedProfile()')
  const seedEnd = source.indexOf('async function ensureRepository(', seedStart)
  const seed = source.slice(seedStart, seedEnd)
  const seedPre = seed.indexOf("'seedProfile before renderer reload'")
  const seedReload = seed.indexOf(
    "await client.send('Page.reload', { ignoreCache: true })"
  )
  const seedTimeOrigin = seed.indexOf(
    'performance.timeOrigin > ${JSON.stringify(beforeSeedReloadTimeOrigin)}',
    seedReload
  )
  const seedPost = seed.indexOf("'seedProfile after renderer reload'")
  assert.ok(
    seedPre >= 0 &&
      seedPre < seedReload &&
      seedReload < seedTimeOrigin &&
      seedTimeOrigin < seedPost
  )

  const identity = sceneSource('app-identity')
  const identityPre = identity.indexOf("'app-identity before renderer reload'")
  const identityReload = identity.indexOf(
    "await evaluate('window.location.reload(), true')"
  )
  const identityTimeOrigin = identity.indexOf(
    'performance.timeOrigin > ${JSON.stringify(beforeReloadTimeOrigin)}',
    identityReload
  )
  const identityPost = identity.indexOf("'app-identity after renderer reload'")
  assert.ok(
    identityPre >= 0 &&
      identityPre < identityReload &&
      identityReload < identityTimeOrigin &&
      identityTimeOrigin < identityPost
  )

  const tabGroups = sceneSource('tab-group-management-evidence')
  const tabGroupsPre = tabGroups.indexOf(
    "'tab-group management before renderer reload'"
  )
  const tabGroupsReload = tabGroups.indexOf(
    "await client.send('Page.reload', { ignoreCache: true })"
  )
  const tabGroupsTimeOrigin = tabGroups.indexOf(
    'performance.timeOrigin > ${JSON.stringify(',
    tabGroupsReload
  )
  const tabGroupsPost = tabGroups.indexOf(
    "'tab-group management after renderer reload'"
  )
  assert.ok(
    tabGroupsPre >= 0 &&
      tabGroupsPre < tabGroupsReload &&
      tabGroupsReload < tabGroupsTimeOrigin &&
      tabGroupsTimeOrigin < tabGroupsPost
  )

  const anchored = sceneSource('anchored-appearance')
  const anchoredPre = anchored.indexOf(
    "'anchored-appearance before repository toolbar context menu'"
  )
  const anchoredAction = anchored.indexOf(
    "contextMenuSelector('#desktop-app-toolbar')"
  )
  assert.ok(anchoredPre >= 0 && anchoredPre < anchoredAction)
})

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
    "'Hide'",
    "'Skip for now'",
    '\'.tooltip, [role="tooltip"]\'',
    "'Input.dispatchMouseEvent'",
    "await menuEvent('zoom-reset')",
    "await menuEvent('show-changes')",
    'await assertNoSceneLeaks(`scene ${name}`)',
  ]) {
    assert.ok(source.includes(contract), `missing reset contract: ${contract}`)
  }
})

test('every capture suppresses unrelated Undo chrome and incidental focus paint', () => {
  const prepareStart = source.indexOf('async function prepareCaptureSurface(')
  const prepareEnd = source.indexOf('\nasync function capture(', prepareStart)
  const captureEnd = source.indexOf('\n/** Emit a menu event', prepareEnd)
  assert.notEqual(prepareStart, -1)
  assert.notEqual(prepareEnd, -1)
  assert.notEqual(captureEnd, -1)

  const prepare = source.slice(prepareStart, prepareEnd)
  const capture = source.slice(prepareEnd, captureEnd)
  for (const contract of [
    "document.querySelector('#undo-commit')",
    "style.setProperty('display', 'none', 'important')",
    "setAttribute('data-capture-suppressed', 'true')",
    'focused.blur()',
    'requestAnimationFrame(() =>',
    'receipt?.undoHidden !== true',
    'retained unrelated Undo commit chrome',
  ]) {
    assert.ok(prepare.includes(contract), `capture hygiene misses ${contract}`)
  }
  assert.ok(
    prepare.match(/requestAnimationFrame\(/g)?.length >= 2,
    'capture hygiene must settle for two animation frames'
  )

  const hygiene = capture.indexOf('await prepareCaptureSurface(name)')
  const privacy = capture.indexOf('await assertCapturePrivacy(name)')
  const screenshot = capture.indexOf("client.send('Page.captureScreenshot'")
  assert.ok(hygiene >= 0 && hygiene < privacy && privacy < screenshot)
  for (const dimensionsContract of [
    'const dimensions = pngDimensions(file)',
    'dimensions.width !== currentViewportWidth',
    'dimensions.height !== currentViewportHeight',
  ]) {
    assert.ok(
      capture.includes(dimensionsContract),
      `capture misses dimension gate: ${dimensionsContract}`
    )
  }
})

test('every capture waits fail closed for all bundled design fonts', () => {
  const prepareStart = source.indexOf(
    'async function waitForBundledCaptureFonts('
  )
  const captureEnd = source.indexOf('\n/** Emit a menu event', prepareStart)
  assert.notEqual(prepareStart, -1)
  assert.notEqual(captureEnd, -1)
  const block = source.slice(prepareStart, captureEnd)

  assert.ok(!block.includes("typeof FontFaceSet === 'undefined'"))
  assert.ok(!block.includes('instanceof FontFaceSet'))
  for (const contract of [
    'const fonts = document.fonts',
    '!fonts',
    "typeof fonts.load !== 'function'",
    "typeof fonts.check !== 'function'",
    "typeof fonts.ready?.then !== 'function'",
    'fonts.load',
    'fonts.check',
    'await fonts.ready',
    "receipt?.status !== 'loaded'",
    'receipt?.faces?.length !== BundledCaptureFonts.length',
    'face.count < 1',
    'face.check !== true',
    "status !== 'loaded'",
    'const fontReceipt = await prepareCaptureSurface(name)',
    'fonts: fontReceipt',
  ]) {
    assert.ok(block.includes(contract), `font gate misses ${contract}`)
  }
  for (const family of [
    'Roboto',
    'Roboto Mono',
    'Roboto Serif',
    'Material Symbols Rounded',
  ]) {
    assert.ok(source.includes(`family: '${family}'`), `missing ${family}`)
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
    "scene('logo-studio'",
    "contextMenuSelector('.repository-list-logo-appearance-target', {",
    "scene('tab-style'",
    // The tab label reserves plain right-click for tab management; the
    // anchored editor's pointer gesture is Shift+Right-click, so the capture
    // must dispatch the shifted variant of the owner gesture.
    "contextMenuSelector('.repository-tab.active .repository-tab-label', {",
    'shiftKey: true,',
    'waitForPrivacySafeAnchoredEditor',
  ]) {
    assert.ok(source.includes(contract), `missing owner contract: ${contract}`)
  }

  assert.ok(!source.includes("captureSettingsTab('Appearance'"))
  assert.ok(!source.includes("openRepositorySettingsTab('Appearance')"))
  assert.ok(!source.includes("scene('settings-appearance'"))
})

test('app identity capture proves a reload-restored closed workspace', () => {
  const identity = sceneSource('app-identity')
  for (const contract of [
    'const GalleryAppIdentity = Object.freeze({',
    "displayName: 'Material Studio'",
    "logo: 'sparkle'",
  ]) {
    assert.ok(
      source.includes(contract),
      `app identity state misses ${contract}`
    )
  }

  for (const contract of [
    'repositoryTabsStore.getActiveTab()',
    'dispatcher.setAppearanceCustomization({',
    'repositoryTabsStore.setTabFavorite(activeTab.id, true)',
    "'live customized app identity and favorite repository tab'",
    "crypto.randomBytes(12).toString('hex')",
    "crypto.randomBytes(32).toString('hex')",
    '`desktop-material:gallery:app-identity:${reloadProofId}`',
    '`__desktopMaterialGalleryReload_${reloadProofId}`',
    'sessionStorage.setItem(storageKey, nonce)',
    'Object.defineProperty(window, sentinelKey, {',
    'sentinelPresent:',
    "await evaluate('window.location.reload(), true')",
    "resetSceneState('restored app-identity workspace')",
    "'stable restored app-identity workspace'",
    '.getAnimations({ subtree: true })',
    'activeFiniteAnimations.length === 0',
    'requestAnimationFrame(() => requestAnimationFrame(',
    '\'.repository-tab.active.favorite[role="tab"][aria-selected="true"]\'',
    "document.querySelector('.app-identity-section') === null",
    "document.querySelector('.anchored-appearance-editor') === null",
    "document.querySelector('#preferences') === null",
    'sessionNonceMatches:',
    'sessionStorage.getItem(',
    'globalSentinelAbsent: !Object.prototype.hasOwnProperty.call(',
    'restored?.sessionNonceMatches !== true',
    'restored?.globalSentinelAbsent !== true',
    'restored?.timeOrigin > beforeReloadTimeOrigin',
    "assertNoSceneLeaks('restored app-identity workspace')",
    'APP_IDENTITY_RELOAD',
    'sessionNonceSurvived:',
    'navigationType: restored.navigationType',
    'appIdentity: originalIdentity',
    'sessionStorage.removeItem(',
    'reloadProofRemoved:',
    'identityRestored:',
    'tabFound:',
    'favoriteRestored:',
  ]) {
    assert.ok(
      identity.includes(contract),
      `app identity gate misses ${contract}`
    )
  }

  assert.ok(!identity.includes('contextMenuSelector('))
  assert.ok(!identity.includes('waitForPrivacySafeAnchoredEditor('))
  assert.ok(!identity.includes("restored?.navigationType !== 'reload'"))
  const armProof = identity.indexOf('sessionStorage.setItem(storageKey, nonce)')
  const reload = identity.indexOf(
    "await evaluate('window.location.reload(), true')"
  )
  const persistenceGate = identity.indexOf(
    'Restored app identity workspace failed its persistence/geometry gate'
  )
  const capture = identity.indexOf("capture('material-app-identity-workspace')")
  const cleanup = identity.indexOf('appIdentity: originalIdentity')
  const removeProof = identity.indexOf('sessionStorage.removeItem(', capture)
  assert.ok(armProof >= 0 && armProof < reload)
  assert.ok(reload < persistenceGate)
  assert.ok(persistenceGate >= 0 && persistenceGate < capture)
  assert.ok(capture < cleanup)
  assert.ok(cleanup < removeProof)
})

test('settings captures select distinct settled Preferences tabs', () => {
  const settings = sceneSource('settings')
  const accounts = sceneSource('settings-accounts')
  const helperStart = source.indexOf('async function captureSettingsTab(')
  const helperEnd = source.indexOf(
    "\nscene('settings-agent-access'",
    helperStart
  )
  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  const helper = source.slice(helperStart, helperEnd)

  assert.ok(settings.includes("captureSettingsTab('Git', 'material-settings')"))
  assert.ok(
    accounts.includes(
      "captureSettingsTab('Accounts', 'material-provider-accounts')"
    )
  )

  for (const contract of [
    'preferences-tab-${tabLabel',
    'label?.closest(\'button[role="tab"]\')',
    "tab.classList.contains('selected')",
    "tab.getAttribute('aria-selected') === 'true'",
    "panel.getAttribute('aria-labelledby')",
    'bounds.width > 0 && bounds.height > 0',
    '.getAnimations({ subtree: true })',
    'iterations !== Infinity',
    'activeFiniteAnimations.length === 0',
    'selected ${tabLabel} settings tab',
    'stable selected ${tabLabel} settings tab',
    'requestAnimationFrame(() => requestAnimationFrame(',
  ]) {
    assert.ok(helper.includes(contract), `settings tab gate misses ${contract}`)
  }
  assert.ok(!helper.includes('await sleep(700)'))
  assert.ok(!helper.includes('await sleep(900)'))
  assert.ok(
    helper.indexOf('stable selected ${tabLabel} settings tab') <
      helper.indexOf('await capture(name, captureOptions)'),
    'the exact stable tab gate must pass before capture'
  )
})

test('appearance captures require a visible in-viewport owner editor', () => {
  for (const contract of [
    "editor?.closest('.popover-component')",
    'bounds.width > 0',
    'bounds.left >= -0.5',
    'bounds.right <= window.innerWidth + 0.5',
    'repository toolbar appearance title',
  ]) {
    assert.ok(source.includes(contract), `missing appearance gate: ${contract}`)
  }
  const scene = sceneSource('anchored-appearance')
  assert.ok(
    scene.indexOf('repository toolbar appearance title') <
      scene.indexOf("capture('material-customization')"),
    'the toolbar editor must be visible before capture'
  )
})

test('repository logo capture proves its foldout portal and scroll range', () => {
  const logo = sceneSource('logo-studio')
  for (const contract of [
    "document.querySelector('.repository-logo-anchored-editor')",
    "editor.closest('.foldout') === null",
    'mount.parentElement === foldoutContainer',
    'popoverBounds.width > foldoutBounds.width',
    'content.clientHeight >= Math.min(320, window.innerHeight - 200)',
    "studio?.querySelector('.repository-logo-editor-scroll')",
    "headingText.data !== 'Custom repository logo'",
    'firstGlyphRange.setEnd(headingText, 1)',
    "contentStyle.overflowY === 'auto'",
    "workbenchScrollStyle.overflowY === 'visible'",
    'contentOwnsScroll && !workbenchOwnsScroll',
    'content.scrollLeft === 0 && workbenchScroll.scrollLeft === 0',
    'firstGlyphBounds.left >= studioBounds.left + 4',
    "studio?.querySelector('#repository-logo-studio-heading')",
    'studio?.querySelector(\'[aria-label^="Live logo preview for "]\')',
    'studio?.querySelector(\'[aria-label="Logo presets"]\')',
    'content.scrollHeight - content.clientHeight',
    'content.scrollTop = content.scrollHeight',
    'reachedBottom',
    'content.scrollTop = 0',
    'restored repository logo studio scroll position',
  ]) {
    assert.ok(
      logo.includes(contract),
      `repository logo gate misses ${contract}`
    )
  }
  assert.ok(
    logo.indexOf('restored repository logo studio scroll position') <
      logo.indexOf("capture('material-repository-logo-studio')"),
    'the portal and scroll gates must run before capture'
  )
})

test('regex builder capture proves bounded RE2 matching and captures', () => {
  const regex = sceneSource('regex-builder')
  for (const contract of [
    "setInput('.regex-pattern-input', '^(a+)+$')",
    'bounded RE2 adversarial near-miss',
    'SAFE_RE2_NEAR_MISS_MS',
    "setInput('.regex-pattern-input', '^(?<letters>a+)$')",
    "'.regex-test-sample'",
    "document.querySelector('.regex-test-sample')",
    "document.querySelector('.regex-test-preview')",
    "document.querySelector('.regex-test-count')",
    "document.querySelector('.regex-test-captures')",
    "document.querySelector('.regex-builder-flags-label')",
    "document.querySelector('.regex-builder-scroll-region')",
    "document.querySelector('.regex-builder-footer')",
    'sample.scrollTop = 0',
    'preview.scrollTop = 0',
    "dialect.textContent?.trim() === 'SAFE RE2'",
    "count.textContent?.trim() === '1 match'",
    "captures.textContent?.includes('$1')",
    "captures.textContent?.includes('<letters>')",
    "document.querySelector('.regex-test-error') === null",
    'within(capturesBounds, scrollBounds)',
    'within(footerBounds, dialogBounds)',
    'safe RE2 match, capture preview, and unclipped dialog',
  ]) {
    assert.ok(regex.includes(contract), `regex capture gate misses ${contract}`)
  }
  assert.ok(
    regex.indexOf('safe RE2 match, capture preview, and unclipped dialog') <
      regex.indexOf("capture('regex-builder')"),
    'the safe-evaluation and geometry gate must pass before capture'
  )
})

test('provider triage capture waits for the exact settled surface', () => {
  const triage = sceneSource('provider-triage')
  for (const contract of [
    "document.querySelector('#triage-tab')",
    'closest(\'button[role="tab"]\')',
    "getAttribute('aria-selected') === 'true'",
    "document.querySelector('main.provider-triage-view')",
    "querySelectorAll('.provider-triage-channel.ready')",
    "querySelectorAll('.provider-triage-item')",
    "heading?.textContent?.trim() === '2 of 2 work items'",
    'settled exact provider triage surface',
  ]) {
    assert.ok(triage.includes(contract), `provider triage misses ${contract}`)
  }
  assert.ok(
    triage.indexOf('settled exact provider triage surface') <
      triage.indexOf("capture('material-provider-triage')"),
    'the settled triage gate must run before capture'
  )
})

test('issues capture proves a populated list and useful selected detail', () => {
  const issues = sceneSource('issues')
  for (const contract of [
    "captureSection('Issues', null, 3500)",
    "document.querySelectorAll('.github-issue-row')",
    "count?.textContent?.trim() === '1 on page 1'",
    "document.querySelector('.github-issues-busy, .github-issues-metadata-note')",
    "clickSelector('.github-issue-row')",
    "title?.textContent?.trim() === 'Verify the complete Windows gallery before publication'",
    'comments?.length === 1',
    "['Open on GitHub', 'Edit', 'Add comment', 'Close issue']",
    'selected issue detail, lifecycle controls, and comments',
  ]) {
    assert.ok(
      issues.includes(contract),
      `GitHub Issues gate misses ${contract}`
    )
  }
  assert.ok(
    issues.indexOf('selected issue detail, lifecycle controls, and comments') <
      issues.indexOf("capture('material-github-issues')")
  )
})

test('multi-window capture opens the selected repository context menu', () => {
  const multiWindow = sceneSource('multi-window-menu')
  for (const contract of [
    "clickAria('Open a repository in a new tab')",
    '#foldout-container .repository-list [role="option"][aria-selected="true"][data-context-menu-owner="true"]',
    'contextMenuSelector(selectedRepository)',
    'document.querySelector(\'.material-context-menu[role="menu"]\')',
    "querySelector('.context-menu-item-label')",
    "'Open in new window'",
    'enabled Open in new window repository command',
  ]) {
    assert.ok(
      multiWindow.includes(contract),
      `multi-window menu misses ${contract}`
    )
  }
  assert.ok(
    multiWindow.indexOf('enabled Open in new window repository command') <
      multiWindow.indexOf("capture('material-multi-window-menu')"),
    'the exact repository command gate must run before capture'
  )
})

test('submodule context capture waits for its final unanimated surface', () => {
  const submodule = sceneSource('submodule-context')
  for (const contract of [
    "document.querySelector('#submodule-manager') === null",
    "document.querySelector('.changes-interstitial')",
    "heading?.textContent?.trim() === 'No local changes'",
    "document.querySelector('.submodule-repository-context')",
    "document.querySelector('#repository-sidebar')",
    'root.getAnimations({ subtree: true })',
    'iterations !== Infinity',
    'animation.pending',
    "animation.playState === 'running'",
    'activeFiniteAnimations.length === 0',
    'settled temporary submodule Changes surface',
    'requestAnimationFrame(() => requestAnimationFrame(',
    'document.querySelectorAll(\'.error-notice[role="alert"]\')',
    '/unsafe Cheap LFS tracked path/i',
    'Ordinary submodule metadata triggered Cheap LFS validation',
  ]) {
    assert.ok(submodule.includes(contract), `submodule gate misses ${contract}`)
  }
  assert.ok(!submodule.includes('await sleep(900)'))
  assert.ok(
    submodule.indexOf('settled temporary submodule Changes surface') <
      submodule.indexOf("capture('material-submodule-context')"),
    'the final surface and animation gates must run before capture'
  )
})

test('merge-all capture preserves main and cleans only its evidence branch', () => {
  const mergeAll = sceneSource('merge-all')
  for (const contract of [
    'assertOwnedDisposableFixture()',
    "'symbolic-ref', 'refs/remotes/origin/HEAD'",
    '`refs/remotes/origin/${ready.defaultBranch}`',
    'startingBranch !== ready.featureBranch',
    "capture('material-worktree-force-mat-day')",
    "clickText('Force Mat Day')",
    'checks.length !== 2',
    'checks.every(check => check instanceof HTMLInputElement && check.checked)',
    "dialog.textContent?.includes('Unsafe or unproved work is always retained.')",
    'Force Mat Day checked, bounded, and safety copy visible',
    'rows.length !== 1',
    "'gallery/merge-all-evidence'",
    "textContent?.trim() === 'up-to-date'",
    "'Already up to date; cleaned up and deleted.'",
    "textContent?.trim() === 'main'",
    "'refs/heads/main'",
    "'refs/heads/gallery/merge-all-evidence'",
    'survivingBranch !== ready.defaultBranch',
    '!mainExists',
    'evidenceExists',
    'single safe Merge All result',
  ]) {
    assert.ok(mergeAll.includes(contract), `merge-all gate misses ${contract}`)
  }
  assert.ok(
    mergeAll.indexOf('Force Mat Day checked, bounded, and safety copy visible') <
      mergeAll.indexOf("capture('material-worktree-force-mat-day')"),
    'the Force Mat Day semantic and geometry gate must run before capture'
  )
  assert.ok(
    mergeAll.indexOf('single safe Merge All result') <
      mergeAll.indexOf("capture('material-branch-merge-all')"),
    'the exact result gate must run before capture'
  )
  assert.ok(
    mergeAll.indexOf('survivingBranch !== ready.defaultBranch') <
      mergeAll.indexOf("capture('material-branch-merge-all')"),
    'the post-operation Git proof must run before capture'
  )
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

test('canonical and promoted specialist batches own all 98 published images exactly once', () => {
  const scenes = frozenStringArray('CanonicalGalleryScenes')
  const outputs = frozenStringArray('CanonicalGalleryOutputs')
  const publishedCanonical = outputs.filter(
    output => !DeferredCanonicalOutputs.includes(output)
  )
  const specialistOutputs = SpecialistCaptureEntries.map(entry => entry.output)
  const publishedSpecialistOutputs = specialistOutputs.filter(
    output => !DeferredSpecialistOutputs.includes(output)
  )
  const expectedCatalog = [...publishedCanonical, ...publishedSpecialistOutputs]
  const historicalLinuxOutputs = [
    'linux-tui-bilingual-narrow',
    'linux-tui-cheap-lfs',
    'linux-tui-overview',
    'linux-tui-regex-builder',
    'linux-tui-text-input',
  ]

  assert.equal(CanonicalCandidateCount, 69)
  assert.deepEqual(CanonicalGalleryOutputs, outputs)
  assert.equal(outputs.length, CanonicalCandidateCount)
  assert.equal(new Set(outputs).size, CanonicalCandidateCount)
  assert.deepEqual(DeferredCanonicalOutputs, [
    'material-cheap-lfs-preparing',
    'material-repositories-sheet',
    'material-worktree-force-mat-day',
  ])
  assert.deepEqual(DeferredSpecialistOutputs, [])
  assert.equal(publishedCanonical.length, 66)
  assert.equal(specialistOutputs.length, 32)
  assert.equal(new Set(specialistOutputs).size, 32)
  assert.equal(publishedSpecialistOutputs.length, 32)
  assert.ok(specialistOutputs.includes('auto-updater-current-source-ready'))
  assert.ok(specialistOutputs.includes('material-publish-organization-picker'))
  assert.ok(!specialistOutputs.includes('auto-updater-update-ready'))
  assert.ok(specialistOutputs.includes('worktree-context-menu-merge-delete'))
  assert.ok(
    specialistOutputs.includes('worktree-merge-preview-from-context-menu')
  )
  assert.equal(ExpectedPublishedGalleryCount, 98)
  assert.equal(PublishedGalleryOutputs.length, ExpectedPublishedGalleryCount)
  assert.equal(new Set(PublishedGalleryOutputs).size, 98)
  assert.equal(GalleryCapturePlan.length, 98)
  assert.deepEqual(
    [...expectedCatalog].sort(),
    [...PublishedGalleryOutputs].sort()
  )
  assert.deepEqual(
    GalleryCapturePlan.map(entry => entry.output).sort(),
    [...PublishedGalleryOutputs].sort()
  )
  for (const output of specialistOutputs) {
    assert.ok(
      !outputs.includes(output) || DeferredCanonicalOutputs.includes(output),
      output
    )
  }
  for (const output of historicalLinuxOutputs) {
    assert.ok(!PublishedGalleryOutputs.includes(output), output)
    assert.ok(
      !GalleryCapturePlan.some(entry => entry.output === output),
      output
    )
  }
  assert.ok(!PublishedGalleryOutputs.includes('auto-updater-update-ready'))
  assert.deepEqual(
    RetainedHistoricalEvidence['auto-updater-update-ready.png'],
    {
      acceptedAt: '2026-07-22',
      document: 'docs/verification/auto-updater-version-order-2026-07-22.md',
      sourceCommit: '923dbb51acad8f01f01f1c100c6945c7a2e08e23',
      sha256:
        'a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d',
    }
  )
  const currentUpdater = GalleryCapturePlan.find(
    entry => entry.output === 'auto-updater-current-source-ready'
  )
  assert.ok(currentUpdater)
  assert.ok(
    currentUpdater.commands.some(command =>
      command.includes('verify_gallery_auto_updater_ready_cdp.js')
    )
  )
  assert.ok(
    currentUpdater.commands.some(command =>
      command.includes('auto-updater-current-source-ready-receipt.json')
    )
  )
  assert.ok(
    currentUpdater.commands.every(
      command => !command.includes('\\captures\\auto-updater-update-ready.png')
    )
  )
  assert.equal(CaptureBatches['linux-tui-lowlevel'], undefined)
  assert.ok(
    Object.values(CaptureBatches).every(
      batch => batch.platform !== 'linux-xvfb'
    )
  )
  for (const deferred of DeferredCanonicalOutputs) {
    assert.ok(outputs.includes(deferred), deferred)
    assert.ok(
      !PublishedGalleryOutputs.includes(deferred) ||
        specialistOutputs.includes(deferred),
      deferred
    )
  }
  for (const deferred of DeferredSpecialistOutputs) {
    assert.ok(specialistOutputs.includes(deferred), deferred)
    assert.ok(!PublishedGalleryOutputs.includes(deferred), deferred)
    assert.ok(
      !GalleryCapturePlan.some(entry => entry.output === deferred),
      deferred
    )
  }
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
  for (const entry of GalleryCapturePlan) {
    assert.ok(entry.scene.length > 0, entry.output)
    assert.ok(entry.interaction.length > 0, entry.output)
    assert.ok(entry.fixture.length > 0, entry.output)
    assert.ok(entry.privacyGate.length > 0, entry.output)
    assert.ok(entry.commands.length > 0, entry.output)
    assert.ok(CaptureBatches[entry.batch], entry.output)
    assert.ok(
      entry.commands.every(
        command => command.length > 0 && !command.includes('<output>')
      ),
      entry.output
    )
  }
  assert.ok(
    source.includes(
      '`CANONICAL ${expected.length}/${expected.length} exact output set\\n`'
    )
  )
})

test('specialist command templates satisfy verifier-owned output containment', () => {
  const internalBrowser = GalleryCapturePlan.find(
    entry => entry.output === 'app-hosted-browser-authentication'
  )
  const ollama = GalleryCapturePlan.find(
    entry => entry.output === 'material-ollama-model-manager'
  )
  assert.ok(internalBrowser)
  assert.ok(ollama)

  assert.ok(
    internalBrowser.commands.some(command =>
      command.includes(
        '--receipt <owned-temp-run-root>\\internal-browser-cdp-receipt.json'
      )
    )
  )
  assert.ok(
    internalBrowser.commands.every(
      command => !command.includes('<owned-temp-run-root>\\receipts\\')
    )
  )
  assert.ok(
    ollama.commands.some(command =>
      command.includes(
        '--receipt <owned-p0-run-root>\\captures\\material-ollama-model-manager.json'
      )
    )
  )

  const internalBrowserVerifier = fs.readFileSync(
    path.join(__dirname, 'verify_internal_browser_cdp.js'),
    'utf8'
  )
  const ollamaVerifier = fs.readFileSync(
    path.join(__dirname, 'verify_ollama_manager_cdp.js'),
    'utf8'
  )
  assert.match(
    internalBrowserVerifier,
    /path\.dirname\(requestedReceipt\)\.toLowerCase\(\) !== runRoot\.toLowerCase\(\)/
  )
  assert.match(
    ollamaVerifier,
    /const expectedParent = path\.join\(p0\.runRoot, 'captures'\)[\s\S]*?parent\.toLowerCase\(\) !== expectedParent\.toLowerCase\(\)/
  )
})

test('History hover specialist runs its declared non-canonical scene', () => {
  const historyHover = GalleryCapturePlan.find(
    entry => entry.output === 'material-history-hover-time'
  )
  assert.ok(historyHover)
  assert.equal(historyHover.batch, 'windows-history-hover')
  assert.ok(
    historyHover.commands.some(command =>
      command.includes('--scenes history-hover-time')
    )
  )
  assert.ok(
    historyHover.commands.some(command =>
      command.includes('--language-mode bilingual')
    )
  )
})

test('Repository sheet specialist runs its dark bilingual scene', () => {
  const repositoriesSheet = GalleryCapturePlan.find(
    entry => entry.output === 'material-repositories-sheet'
  )
  assert.ok(repositoriesSheet)
  assert.equal(repositoriesSheet.batch, 'windows-repositories-sheet')
  assert.ok(
    repositoriesSheet.commands.some(command =>
      command.includes('--scenes seed,repositories-sheet')
    )
  )
  assert.ok(
    repositoriesSheet.commands.some(command => command.includes('--theme dark'))
  )
  assert.ok(
    repositoriesSheet.commands.some(command =>
      command.includes('--language-mode bilingual')
    )
  )
})

test('promoted Publish Organization capture has one bilingual P0 specialist owner', () => {
  const candidate = SpecialistCaptureEntries.find(
    entry => entry.output === 'material-publish-organization-picker'
  )
  assert.ok(candidate)
  assert.equal(candidate.scene, 'publish-organization-picker')
  assert.equal(candidate.batch, 'windows-publish-organization-cdp')
  assert.deepEqual(DeferredSpecialistOutputs, [])
  assert.ok(
    GalleryCapturePlan.some(
      entry => entry.output === 'material-publish-organization-picker'
    ),
    'the accepted capture must be in the published gallery plan'
  )

  const batch = CaptureBatches[candidate.batch]
  assert.ok(batch)
  assert.equal(batch.platform, 'windows-headless')
  assert.match(batch.fixture, /real git-source repository \(no remote\)/)
  assert.match(batch.fixture, /three deterministic organization owners/)
  assert.match(batch.privacyGate, /physical 390x844 auto-fit geometry/)
  assert.match(batch.privacyGate, /1440x960/)
  const command = batch.commands.find(value =>
    value.includes('capture_gallery_cdp.js')
  )
  assert.ok(command)
  for (const contract of [
    '--scenes publish-organization-picker',
    '--run-root <owned-p0-run-root>',
    '--fixture-path <owned-p0-run-root>\\fixture',
    '--out <owned-p0-run-root>\\captures\\gallery',
    '--theme dark',
    '--language-mode bilingual',
    '--width 1440',
    '--height 960',
  ]) {
    assert.ok(
      command.includes(contract),
      `specialist command misses ${contract}`
    )
  }
})

test('audit-design mode owns a separate exact five-surface catalog', () => {
  const scenes = frozenStringArray('AuditDesignScenes')
  const outputs = frozenStringArray('AuditDesignOutputs')
  assert.deepEqual(scenes, [
    'account-switcher',
    'workflow-manager',
    'workflow-catalog',
    'workflow-dispatch',
    'clone-dialog-design',
  ])
  assert.deepEqual(outputs, [
    'material-design-account-switcher',
    'material-design-workflow-manager',
    'material-design-workflow-catalog',
    'material-design-workflow-dispatch',
    'material-design-clone-dialog',
  ])
  assert.equal(new Set(scenes).size, 5)
  assert.equal(new Set(outputs).size, 5)
  for (const sceneName of scenes) {
    assert.ok(source.includes(`scene('${sceneName}'`), sceneName)
  }
  for (const contract of [
    "const auditDesign = auditDesignValue === 'true'",
    '? [...AuditDesignScenes]',
    "fail('Use either --canonical true or --audit-design true, not both.')",
    "fail('Use either --audit-design true or --scenes, not both.')",
    "fail('--audit-design true requires an owned provider --run-root.')",
    'await seedProfile()',
    'const expected = [...AuditDesignOutputs].sort()',
    "process.stdout.write('AUDIT_DESIGN 5/5 exact output set",
  ]) {
    assert.ok(source.includes(contract), `audit mode misses ${contract}`)
  }

  const result = spawnSync(process.execPath, [driverPath, '--list', 'true'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  const listed = result.stdout.trim().split(/\r?\n/)
  for (const sceneName of scenes) {
    assert.ok(listed.includes(sceneName), `--list misses ${sceneName}`)
  }
})

test('audit-design scenes are semantic, contained, private, and non-destructive', () => {
  const expected = new Map([
    ['account-switcher', 'material-design-account-switcher'],
    ['workflow-manager', 'material-design-workflow-manager'],
    ['workflow-catalog', 'material-design-workflow-catalog'],
    ['workflow-dispatch', 'material-design-workflow-dispatch'],
    ['clone-dialog-design', 'material-design-clone-dialog'],
  ])

  for (const [sceneName, captureName] of expected) {
    const scene = sceneSource(sceneName)
    for (const contract of [
      `capture('${captureName}')`,
      'assertNoProviderMutations(mutationsBefore',
      'semantic or containment check failed',
      'receipt.contained !== true',
      `assertNoSceneLeaks('${sceneName}`,
    ]) {
      assert.ok(scene.includes(contract), `${sceneName} misses ${contract}`)
    }
    assert.ok(
      scene.includes('receipt.inViewport !== true') ||
        scene.includes('receipt.inOwner !== true'),
      `${sceneName} misses a viewport/owner containment gate`
    )
  }

  const mutationHelperStart = source.indexOf(
    'function countProviderMutations()'
  )
  const mutationHelperEnd = source.indexOf(
    'function ensureDirectFixtureProviderRemote()',
    mutationHelperStart
  )
  const mutationHelpers = source.slice(mutationHelperStart, mutationHelperEnd)
  for (const contract of [
    "new Set(['POST', 'PUT', 'PATCH', 'DELETE'])",
    'Audit design scenes require the owned provider request log.',
    'after !== before',
    'state-changing provider requests',
    'NONDESTRUCTIVE',
  ]) {
    assert.ok(
      mutationHelpers.includes(contract),
      `provider mutation gate misses ${contract}`
    )
  }

  const catalog = sceneSource('workflow-catalog')
  assert.ok(catalog.includes('receipt.cardCount !== 8'))
  assert.ok(
    catalog.includes(
      "JSON.stringify(['Automation', 'CI', 'Deploy', 'Release', 'Security'])"
    )
  )
  assert.ok(!catalog.includes("clickEnabledSelector('.workflow-template-use"))
  assert.ok(!catalog.includes("clickText('Use workflow'"))

  const dispatch = sceneSource('workflow-dispatch')
  assert.ok(dispatch.includes('receipt.workflowCount !== 1'))
  assert.ok(dispatch.includes('receipt.runEnabled !== true'))
  assert.ok(
    !dispatch.includes("clickEnabledSelector('.workflow-dispatch-run-button")
  )

  const manager = sceneSource('workflow-manager')
  assert.ok(manager.includes("receipt.heading !== 'Workflows · 1 active'"))
  assert.ok(!manager.includes("clickEnabledSelector('.actions-workflow-switch"))

  const account = sceneSource('account-switcher')
  assert.ok(account.includes('receipt.rowCount !== 1'))
  assert.ok(!account.includes("clickText('Add another account'"))

  const clone = sceneSource('clone-dialog-design')
  assert.ok(clone.includes("receipt.selectedTab !== 'GitHub Enterprise'"))
  assert.ok(clone.includes('receipt.modal !== null'))
  assert.ok(!clone.includes("clickText('Clone'"))

  const captureStart = source.indexOf('async function capture(')
  const captureEnd = source.indexOf('/** Emit a menu event', captureStart)
  const capture = source.slice(captureStart, captureEnd)
  assert.ok(capture.includes('await assertCapturePrivacy(name)'))
  assert.ok(capture.includes('await prepareCaptureSurface(name)'))
})

test('capture candidates cannot overwrite tracked screenshots directly', () => {
  assert.ok(source.includes('requestedOutDir === undefined ? null'))
  assert.ok(
    source.includes(
      "fail('Capture candidates must be reviewed in Temp before promotion.')"
    )
  )
  assert.ok(source.includes("{ flag: 'wx' }"))
  assert.ok(source.includes('const capturedHashes = new Map()'))
  assert.ok(source.includes('duplicates ${duplicate}.png byte-for-byte'))
  assert.ok(!source.includes("args.get('out') ?? 'docs/assets/screenshots'"))
})

test('API app-function capture shows the seeded repository functions', () => {
  const apiFunctions = sceneSource('api-app-functions')
  for (const contract of [
    "captureSection('API explorer', null, 2000)",
    "document.querySelector('.github-api-functions')",
    'querySelectorAll(\'[aria-label="Named API functions"] > li\')',
    'cards.length >= 1',
    'seeded API functions surface',
    "capture('material-api-app-functions')",
  ]) {
    assert.ok(
      apiFunctions.includes(contract),
      `API app-functions scene misses ${contract}`
    )
  }
  for (const forbidden of [
    "clickText('Run function'",
    "clickText('Run request'",
    "clickText('Run reviewed request'",
  ]) {
    assert.ok(
      !apiFunctions.includes(forbidden),
      `API app-functions scene must not invoke ${forbidden}`
    )
  }
  const seeded = apiFunctions.indexOf('seeded API functions surface')
  const capture = apiFunctions.indexOf("capture('material-api-app-functions')")
  assert.ok(seeded >= 0 && seeded < capture)
})

test('every screenshot passes the universal private-path gate', () => {
  const privacy = source.indexOf('async function assertCapturePrivacy(name)')
  const screenshot = source.indexOf("client.send('Page.captureScreenshot'")
  assert.notEqual(privacy, -1)
  assert.notEqual(screenshot, -1)
  assert.ok(privacy < screenshot)
  assert.ok(source.includes('await assertCapturePrivacy(name)'))
  assert.ok(source.includes('.filter(value => !bundledAsset(value))'))
  assert.ok(
    source.includes('out\\/static\\/[a-z0-9._-]+\\.(?:gif|ico|png|svg|webp)')
  )
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

test('settings history masks only the owned run path before capture', () => {
  const helperStart = source.indexOf(
    'async function maskSettingsHistoryPrivatePaths()'
  )
  const helperEnd = source.indexOf(
    'function countProviderRequests(',
    helperStart
  )
  const helper = source.slice(helperStart, helperEnd)
  const settingsHistory = sceneSource('settings-history')
  assert.ok(helper.includes("const syntheticRoot = 'C:\\\\Synthetic"))
  assert.ok(helper.includes('fs.realpathSync.native(path.resolve(runRoot))'))
  assert.ok(helper.includes("privateRoot.replaceAll('\\\\', '\\\\\\\\')"))
  assert.ok(
    settingsHistory.indexOf('await maskSettingsHistoryPrivatePaths()') <
      settingsHistory.indexOf("await capture('settings-history-manager')")
  )
})

test('fixture mutation is restricted to the named owned Temp run', () => {
  const ownership = source.indexOf('function assertOwnedDisposableFixture()')
  const assertion = source.indexOf(
    'assertOwnedDisposableFixture()',
    ownership + 1
  )
  const loop = source.indexOf('for (const name of names)', assertion)
  assert.notEqual(ownership, -1)
  assert.notEqual(assertion, -1)
  assert.notEqual(loop, -1)
  assert.ok(ownership < assertion && assertion < loop)
  for (const contract of [
    'fs.realpathSync.native(os.tmpdir())',
    "startsWith('desktop-material-p0-ui-')",
    "relativeFixture.toLowerCase() !== 'fixture'",
  ]) {
    assert.ok(
      source.includes(contract),
      `missing ownership contract: ${contract}`
    )
  }
})

test('fixture account hydration returns only privacy-safe receipts', () => {
  const start = source.indexOf('async function seedProfile()')
  const end = source.indexOf('async function ensureRepository(', start)
  const seed = source.slice(start, end)
  const repositoryOpen = seed.indexOf('await ensureRepository(fixturePath)')
  const hydration = seed.indexOf('const hydrated = await evaluate')
  assert.ok(repositoryOpen >= 0, 'seedProfile must open the owned fixture')
  assert.ok(
    repositoryOpen < hydration,
    'seedProfile must open the owned fixture before provider hydration'
  )
  for (const contract of [
    'accountsStore.reloadFromStore()',
    'accountsStore.refresh()',
    'accountsStore.getAll()',
    'repositoryWithRefreshedGitHubRepository(repository)',
    'accountCount: accounts.length',
    'fixtureAccountMatched: fixtureAccount !== undefined',
    'fixtureTokenPresent:',
    'fixtureCopilotFeatureEnabled:',
    'fixtureAccount?.features?.includes(',
    "'desktop_enable_copilot_sdk_commit_message_generation'",
    'repositoryMatched: Boolean(freshRepository?.gitHubRepository)',
    'selectedRepositoryMatched: Boolean(',
  ]) {
    assert.ok(
      seed.includes(contract),
      `missing hydration contract: ${contract}`
    )
  }
  assert.ok(seed.includes("client.send('Page.reload', { ignoreCache: true })"))
  assert.ok(seed.includes('beforeSeedReloadTimeOrigin'))
  assert.ok(!seed.includes('fixtureAccount?.isCopilotDesktopEnabled'))
  assert.ok(!seed.includes('fixtureAccount?.copilotLicenseType'))
  for (const leak of [
    'login: value.login',
    'endpoint: value.endpoint',
    'token: fixtureAccount',
  ]) {
    assert.ok(!seed.includes(leak), `hydration receipt leaks: ${leak}`)
  }
})

test('fixture account hydration removes only its exact temporary Git proxy', () => {
  const start = source.indexOf('function ensureDirectFixtureProviderRemote()')
  const end = source.indexOf('async function seedProfile()', start)
  const remote = source.slice(start, end)
  for (const contract of [
    "['-C', fixturePath, 'config', '--get-all', 'http.proxy']",
    '`http://127.0.0.1:${endpoint.port}`',
    'Fixture proxy is not the owned provider',
    "['-C', fixturePath, 'remote', 'set-url', 'origin', directURL]",
    "['-C', fixturePath, 'config', '--unset-all', 'http.proxy']",
  ]) {
    assert.ok(remote.includes(contract), `missing proxy contract: ${contract}`)
  }
  assert.ok(
    remote.indexOf('proxyValues[0] !== expectedProxy') <
      remote.indexOf("'--unset-all'"),
    'the proxy must be validated before it is removed'
  )
})

test('Ollama evidence uses an owned loopback fixture and a full reversible UI exercise', () => {
  const fixtureStart = source.indexOf('function readOwnedOllamaFixture(')
  const fixtureEnd = source.indexOf(
    'function assertOwnedDisposableFixture()',
    fixtureStart
  )
  assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart)
  const fixture = source.slice(fixtureStart, fixtureEnd)
  for (const contract of [
    "args.get('ollama-run-root')",
    'fs.realpathSync.native(os.tmpdir())',
    '/^desktop-material-ollama-',
    "receipt.fixture !== 'desktop-material-ollama'",
    'receipt.protocolVersion !== 1',
    "receipt.bind !== '127.0.0.1'",
    "endpoint.protocol !== 'http:'",
    "endpoint.hostname !== '127.0.0.1'",
    "receipt.mutationLog !== 'ollama/mutations.jsonl'",
    'ready?.copilotEnabled !== true',
    "integration: 'ollama'",
    "authKind: 'none'",
    "wireApi: 'completions'",
  ]) {
    assert.ok(fixture.includes(contract), `Ollama fixture misses ${contract}`)
  }
  assert.ok(!fixture.includes('TokenStore'))

  const seedStart = source.indexOf('async function seedProfile()')
  const seedEnd = source.indexOf('async function ensureRepository(', seedStart)
  const seed = source.slice(seedStart, seedEnd)
  assert.ok(
    seed.includes(
      "'language-mode-v1': ${JSON.stringify(requestedLanguageMode)}"
    )
  )
  assert.ok(seed.includes("localStorage.removeItem('autoSwitchTheme')"))
  assert.ok(seed.includes("localStorage.getItem('copilot-byok-providers')"))
  assert.ok(seed.includes("localStorage.setItem('copilot-byok-providers'"))
  assert.ok(!seed.includes('TokenStore'))

  const manager = sceneSource('ollama-manager')
  for (const contract of [
    'await setViewport(1452, 1001)',
    "setThemeThroughToggle('dark')",
    'await captureSettingsTab(',
    "'Copilot'",
    "clickText('Providers'",
    "clickText('Manage models'",
    'material-ollama-model-manager',
    'ollama-endpoint-status',
    'ollama-refresh',
    "vt(refresh) === 'Refresh'",
    'ollama-pull-progress',
    'ollama-pull-cancel',
    'material-code:1.5b',
    'material-gallery-copy:latest',
    'ollama-copy',
    'ollama-load',
    'ollama-unload',
    'ollama-delete-dialog',
    'ollama-delete-confirm',
    "'pull-cancelled'",
    "'/__fixture__/reset'",
    'assertBaseOllamaFixtureState(finalReset',
    "document.body.classList.contains('theme-dark')",
    "localStorage.getItem('theme') === 'dark'",
    'window.innerWidth === 1452 && window.innerHeight === 1001',
    'document.querySelector(\'[data-verification="ollama-notice"]\') === null',
    'finally {',
    "{ expectedTheme: 'dark' }",
    'setThemeThroughToggle(requestedTheme)',
    'await restoreCaptureViewport()',
    'post-scroll stable Ollama capture surface',
  ]) {
    assert.ok(manager.includes(contract), `Ollama scene misses ${contract}`)
  }
  assert.ok(
    source.includes('\'button.theme-toggle-button[aria-label="Toggle theme"]\'')
  )
  assert.ok(
    source.includes("button?.querySelector('.sr-only')"),
    'theme settling must read the status label, not Material Symbol ligature text'
  )
  assert.ok(
    source.includes("?.querySelector('.sr-only')"),
    'theme transition waits must read the status label'
  )
  for (const model of [
    'material-chat:7b',
    'material-embed:latest',
    'material-vision:3b',
  ]) {
    assert.ok(manager.includes(model), `Ollama scene misses ${model}`)
  }
  assert.ok(!manager.includes('TokenStore'))

  const viewport = manager.indexOf('await setViewport(1452, 1001)')
  const capture = manager.indexOf('material-ollama-model-manager')
  const restoration = manager.lastIndexOf('await restoreCaptureViewport()')
  assert.ok(viewport >= 0 && viewport < capture && capture < restoration)
})

test('both pull-request scenes refresh the non-empty origin/main comparison', () => {
  for (const name of ['pull-request-compose', 'pull-request-open']) {
    const scene = sceneSource(name)
    for (const contract of [
      'ensurePullRequestMergeBase()',
      "clickSelector('.open-pull-request .popover-dropdown-component > button')",
      'clickPointerSelector(',
      '[role="option"][aria-label^="origin/main"]',
      'base:origin[/]main',
      "document.querySelector('.pull-request-files-changed')",
    ]) {
      assert.ok(scene.includes(contract), `${name} misses ${contract}`)
    }
  }
})

test('native pull-request capture waits for final clean mergeability', () => {
  const scene = sceneSource('pull-request-compose')
  for (const contract of [
    "document.querySelector('.open-pull-request .pr-merge-status-clean')",
    "clean.textContent?.includes('Able to merge.') === true",
    "document.querySelector('.open-pull-request .pr-merge-status-loading') === null",
    "document.querySelector('.open-pull-request .pr-merge-status-invalid') === null",
    "document.querySelector('.open-pull-request .pr-merge-status-conflicts') === null",
    'stable clean pull-request mergeability',
  ]) {
    assert.ok(
      scene.includes(contract),
      `PR mergeability gate misses ${contract}`
    )
  }
  assert.ok(
    scene.indexOf('stable clean pull-request mergeability') <
      scene.indexOf("capture('material-native-pull-request')")
  )
})

test('history power-tools capture proves a positive fixture result', () => {
  const scene = sceneSource('history-power-tools')
  for (const contract of [
    "setInput('input[placeholder*=\"Search commits\"]', 'submodules')",
    "document.querySelectorAll('#commit-list .commit')",
    "commit.querySelector('.summary')",
    "summaries[0] === 'Add deterministic initialized and dormant submodules'",
    "!historyText.includes('No matching commits')",
    'positive submodule history search result',
  ]) {
    assert.ok(
      scene.includes(contract),
      `history result gate misses ${contract}`
    )
  }
  assert.ok(
    scene.indexOf('positive submodule history search result') <
      scene.indexOf("capture('material-history-power-tools')")
  )
})

test('native pull-request review handles aria-only disablement at most once', () => {
  const helperStart = source.indexOf('async function clickTextWhenEnabled(')
  const helperEnd = source.indexOf(
    '\nasync function clickSelector(',
    helperStart
  )
  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  const helper = source.slice(helperStart, helperEnd)
  assert.ok(!helper.includes('waitFor('))
  assert.ok(!helper.includes('catch'))
  const scene = sceneSource('pull-request-open')
  for (const contract of [
    'const clicked = await evaluate(',
    "candidate.getAttribute('aria-disabled') !== 'true' &&",
    '!candidate.disabled',
    'target.click()',
    'if (clicked) {',
    'await sleep(300)',
  ]) {
    assert.ok(
      helper.includes(contract),
      `atomic text action misses ${contract}`
    )
  }
  assert.match(helper, /target\.click\(\)\s+return true/)
  assert.match(helper, /if \(clicked\) \{\s+return\s+\}/)
  assert.equal(helper.match(/target\.click\(\)/g)?.length, 1)
  assert.equal(source.match(/await clickTextWhenEnabled\(/g)?.length, 1)
  assert.ok(scene.includes("clickTextWhenEnabled('Review pull request'"))
  assert.ok(scene.includes("within: '#create-github-pull-request'"))
  assert.ok(scene.includes('timeout: 30000'))
  assert.ok(!scene.includes("'enabled pull-request review action'"))
  assert.ok(!scene.includes("clickText('Review pull request'"))

  const reviewGuard = scene.indexOf(
    "const afterReview = countProviderRequests('POST', pullRequestPath)"
  )
  const providerMutation = scene.indexOf(
    "clickText('Create pull request'",
    reviewGuard
  )
  assert.notEqual(reviewGuard, -1)
  assert.notEqual(providerMutation, -1)
  assert.ok(scene.includes('if (afterReview !== before)'))
  assert.ok(
    reviewGuard < providerMutation,
    'the non-mutating Review guard must precede Create'
  )
})

test('canonical workflow scenes use current reviewed controls and outcomes', () => {
  for (const contract of [
    // Batch sync moved into the repository list's "More" actions menu, so the
    // reviewed control is that menu item rather than a bare button.
    "clickSelector('.repository-more-actions-button')",
    "'Sync repositories'",
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
    '\'#choose-branch [role="option"][aria-label^="origin/main"]\'',
    "document.querySelector('.rebase-route')",
    "document.querySelector('.rebase-ahead-behind')",
    "document.querySelector('.rebase-commit-preview')",
    '[role="group"][aria-label="Create commit"] input[placeholder="Summary (required)"]',
    "const recoveryBranch = 'gallery/stale-lock-evidence'",
    "'enabled stale-lock commit action'",
    "clickEnabledSelector('.commit-button')",
    "'restored canonical fixture branch'",
  ]) {
    assert.ok(source.includes(contract), `missing reviewed state: ${contract}`)
  }
  for (const stale of [
    "clickText('Pull all'",
    'Fetch 25 older commits',
    'Deepen by 25',
    'Fetch all remaining history',
    'Review deployments',
    'input[aria-label="Commit summary"]',
  ]) {
    assert.ok(!source.includes(stale), `stale control remains: ${stale}`)
  }
})

test('issue 87 evidence uses the real scheduled handler and commit password dialog', () => {
  const errorScene = sceneSource('error-notice')
  const dialogScene = sceneSource('cheap-lfs-commit-password-evidence')
  const backgroundHelperStart = source.indexOf(
    'async function postBackgroundCommitPasswordNotice()'
  )
  const backgroundHelperEnd = source.indexOf(
    "\nscene('error-notice'",
    backgroundHelperStart
  )
  const backgroundHelper = source.slice(
    backgroundHelperStart,
    backgroundHelperEnd
  )

  assert.ok(errorScene.includes('postBackgroundCommitPasswordNotice()'))
  for (const contract of [
    'resolveUnattendedCheapLfsEncryptedPin',
    'performScheduledCommitPush',
    "'isScheduledAutomationFenceCurrent'",
    "'_commitIncludedChanges'",
    'observedBackgroundTask = isBackgroundTask',
    'isBackgroundTask !== true',
    'evidence/oversized-encrypted.bin',
    "resolution?.kind === 'credential'",
    'resolution.password.fill(0)',
    "resolution?.kind !== 'skip'",
    'appStore.postPersistentErrorNotice',
    'Nothing was encrypted',
    'no Release anchor was created',
    'changes remain eligible',
    'Repository settings > Large files & storage',
    '}).length === 1',
    'for (const entry of overrides.reverse())',
    'if (entry.own)',
    'delete appStore[entry.name]',
  ]) {
    assert.ok(
      backgroundHelper.includes(contract),
      `background evidence misses ${contract}`
    )
  }
  assert.ok(
    backgroundHelper.indexOf('resolveUnattendedCheapLfsEncryptedPin') <
      backgroundHelper.indexOf(
        'The synthetic issue-87 credential identity unexpectedly resolved.'
      )
  )
  for (const contract of [
    'promptForCheapLfsPayloadPassword',
    "'commit-auto-pin'",
    "capture('commit-auto-pin-password-dialog')",
    'inputs.length === 2',
    "inputs.every(input => input.value === '')",
    'finally',
    'cancel?.click()',
  ]) {
    assert.ok(
      dialogScene.includes(contract),
      `commit-password evidence misses ${contract}`
    )
  }
  assert.ok(!dialogScene.includes('globalThis.__issue87'))
})

test('issue 80 evidence proves the real Push origin warning fails closed', () => {
  const evidence = sceneSource('canonical-remote-warning-evidence')
  for (const contract of [
    'assertOwnedDisposableFixture()',
    "requestedLanguageMode !== 'english'",
    'missingRemote.origin !== endpoint.origin',
    "missingRemote.username !== ''",
    "missingRemote.password !== ''",
    'missingRemote.href.includes(ready.token',
    "'remote'",
    "'get-url'",
    "'origin'",
    "'symbolic-ref'",
    "'HEAD'",
    '`refs/remotes/origin/${ready.featureBranch}`',
    'originalHeadOID',
    'originalRemoteTrackingOID',
    'ownedBareRepository',
    'providerRemoteRef',
    'originalProviderRemoteOID',
    'behind !== 0',
    'ahead < 1',
    'setViewport(1280, 860)',
    "'set-url'",
    'missingRemoteURL',
    "require('electron').ipcRenderer.emit('focus')",
    'selection?.state?.remote?.url',
    "'.toolbar-button.push-pull-button.push-pull-button--push button.button-component'",
    "vt(button).includes('Push origin')",
    'providerLogPositionBeforeClick',
    'providerMutationsBeforeClick',
    'new MutationObserver',
    'observer.observe(document.body, { childList: true, subtree: true })',
    "pushButton.setAttribute('data-canonical-remote-warning-target', 'true')",
    'pushButton.focus()',
    'pushButton.click()',
    "'Remote URL needs attention'",
    'No push was attempted.',
    "'Change remote URL'",
    'genericBackgroundNoticeCount',
    'duplicateOccurrenceCount',
    'visibleDialogCount',
    'warningBackground',
    'domReceipt?.focus?.tag',
    'domReceipt?.observer?.noticeAdditions?.length !== 1',
    'domReceipt?.observer?.dialogAdditions?.length !== 0',
    'providerLogPositionAfterClick',
    'missingRepositoryAPIPath',
    'entry.status === 404',
    'git-receive-pack|service=git-receive-pack',
    'receivePackRequests.length !== 0',
    'providerMutationsAfterClick !== providerMutationsBeforeClick',
    'localHeadAfterClick !== originalHeadOID',
    'remoteTrackingAfterClick !== originalRemoteTrackingOID',
    'providerRemoteAfterClick !== originalProviderRemoteOID',
    "capture('canonical-remote-warning-1280x860')",
    'backgroundProviderRefresh',
    'exercised: false',
    'No reviewed app-native built-app action',
    'push-network-rejection-test.ts',
    'push-rejection-observation-test.tsx',
    'finally',
    'originalRemoteURL',
    'originalRemoteRestored',
    'providerRemoteOIDRestored',
    "'canonical-remote-warning-evidence.json'",
    'serializedReceipt.includes(ready.token)',
    'fs.writeFileSync(receiptPath, serializedReceipt',
  ]) {
    assert.ok(
      evidence.includes(contract),
      `issue 80 evidence misses ${contract}`
    )
  }

  const observer = evidence.indexOf('new MutationObserver')
  const click = evidence.indexOf('pushButton.click()')
  const domGate = evidence.indexOf('domReceipt?.warningCount !== 1')
  const providerGate = evidence.indexOf('expectedProviderRequests.length < 1')
  const refGate = evidence.indexOf('localHeadAfterClick !== originalHeadOID')
  const capture = evidence.indexOf(
    "capture('canonical-remote-warning-1280x860')"
  )
  const restore = evidence.indexOf(
    'originalRemoteRestored: restoredRemoteURL === originalRemoteURL'
  )
  const receiptWrite = evidence.indexOf(
    'fs.writeFileSync(receiptPath, serializedReceipt'
  )
  assert.match(
    evidence,
    /finally[\s\S]*?'set-url',\s*'origin',\s*originalRemoteURL[\s\S]*?originalRemoteRestored/
  )
  assert.ok(observer >= 0 && observer < click)
  assert.ok(click < domGate && domGate < providerGate)
  assert.ok(providerGate < refGate && refGate < capture)
  assert.ok(capture < restore && restore < receiptWrite)
})

test('issue 94 evidence proves a real transient tooltip disappears at two viewports', () => {
  const evidence = sceneSource('tab-group-tooltip-dismissal-evidence')
  for (const contract of [
    '\'.repository-tab[role="tab"][aria-selected="true"]\'',
    "vt(button) === 'Add tab to new group…'",
    'button.context-menu-item[data-issue-94-target="true"]',
    'visible owner tooltip before context-menu teardown',
    "'#dialog-layer dialog#create-tab-group[open]'",
    "document.querySelector('.material-context-menu') === null",
    'await sleep(650)',
    'staleTooltipCount: staleTooltips.length',
    'settled?.staleTooltipCount !== 0',
    'settled?.swatchCount !== 6',
    'tab-group-tooltip-dismissed-${width}x${height}',
  ]) {
    assert.ok(
      evidence.includes(contract),
      `issue 94 evidence misses ${contract}`
    )
  }
  assert.ok(evidence.includes('[1440, 960]'))
  assert.ok(evidence.includes('[1180, 820]'))
  assert.ok(
    evidence.indexOf('visible owner tooltip before context-menu teardown') <
      evidence.indexOf('clickPointerSelector')
  )
  assert.ok(
    evidence.indexOf('clickPointerSelector') <
      evidence.indexOf('settled?.staleTooltipCount !== 0')
  )
})

test('issue 95 evidence proves singular accessible and visible copy', () => {
  const evidence = sceneSource('tab-group-member-singular-evidence')
  for (const contract of [
    'setViewport(1280, 860)',
    "'Verification group'",
    "vt(label) === 'Verification group'",
    "vt(count) !== '1'",
    "'Show the 1 tab in Verification group'",
    "'1 tab in this group.'",
    "button.dispatchEvent(new MouseEvent('mouseover'",
    "'singular one-member accessible tooltip'",
    "capture('tab-group-member-singular-1280x860')",
  ]) {
    assert.ok(
      evidence.includes(contract),
      `issue 95 evidence misses ${contract}`
    )
  }
  assert.ok(
    evidence.indexOf("'Show the 1 tab in Verification group'") <
      evidence.indexOf("capture('tab-group-member-singular-1280x860')")
  )
  assert.ok(
    evidence.indexOf("'1 tab in this group.'") <
      evidence.indexOf("capture('tab-group-member-singular-1280x860')")
  )
})

test('tab-group management evidence creates only fresh owned Git fixtures', () => {
  const start = source.indexOf('const TabGroupManagementEvidenceDirectory')
  const end = source.indexOf('const DefaultWidth', start)
  assert.ok(start >= 0 && end > start)
  const fixture = source.slice(start, end)

  for (const contract of [
    'assertOwnedDisposableFixture()',
    "'tab-group-management-evidence'",
    "'material-evidence-beta'",
    "'material-evidence-gamma'",
    'path.relative(ownedRunRoot, evidenceRoot)',
    'fs.existsSync(evidenceRoot)',
    'fs.mkdirSync(evidenceRoot, { recursive: false })',
    'fs.lstatSync(evidenceRoot)',
    'entry.isSymbolicLink()',
    'fs.mkdirSync(repositoryPath, { recursive: false })',
    "{ encoding: 'utf8', flag: 'wx' }",
    "runAdvancedWorkflowGit(ownedRepository, ['init', '--quiet'])",
    "'user.name=Desktop Material Evidence'",
    "'user.email=evidence@desktop-material.invalid'",
    "'--no-gpg-sign'",
    "'--is-inside-work-tree'",
    "'status'",
    "'--porcelain=v1'",
    "'switch-receipt.json'",
    'TAB_GROUP_MANAGEMENT_FIXTURE',
  ]) {
    assert.ok(
      fixture.includes(contract),
      `tab-group fixture misses ${contract}`
    )
  }
  for (const destructive of [
    'rmSync(',
    'rmdirSync(',
    'unlinkSync(',
    "'reset'",
    "'clean'",
  ]) {
    assert.ok(
      !fixture.includes(destructive),
      `tab-group fixture must not use ${destructive}`
    )
  }
})

test('tab-group management evidence drives, receipts, edits, and reloads real UI', () => {
  const evidence = sceneSource('tab-group-management-evidence')
  const canonical = frozenStringArray('CanonicalGalleryScenes')
  assert.ok(!canonical.includes('tab-group-management-evidence'))

  for (const contract of [
    'initialState?.tabCount !== 1',
    'initialState?.groupCount !== 0',
    'prepareTabGroupManagementEvidenceFixture()',
    "menuEvent('add-local-repository')",
    '\'#add-existing-repository input[type="text"]\'',
    "clickText('Add repository'",
    'contextMenuSelector(seedTabSelector)',
    "'Add tab to new group…'",
    '\'#create-tab-group button.tab-group-color[data-color="purple"]\'',
    "clickText('Create group'",
    '`Move to “${initialGroupName}”`',
    'expectedMemberCount',
    "'3 tabs in this group.'",
    "capture('tab-group-members-collapsed-1280x860')",
    "dispatchKeyboardKey('ArrowDown', 'ArrowDown', 40)",
    "dispatchKeyboardKey('Enter', 'Enter', 13)",
    "navigation: Object.freeze(['ArrowDown', 'Enter'])",
    'afterActiveTabId === targetTabId',
    "scene: 'tab-group-management-evidence'",
    'path.relative(evidenceFixture.root, evidenceFixture.receiptPath)',
    "{ encoding: 'utf8', flag: 'wx' }",
    'TAB_GROUP_SWITCH_RECEIPT',
    '`Edit group “${initialGroupName}”…`',
    '\'#edit-tab-group button.tab-group-color[data-color="green"]\'',
    "capture('tab-group-edit-1280x860')",
    "clickText('Save group'",
    "'tab-group management before renderer reload'",
    "await client.send('Page.reload', { ignoreCache: true })",
    "'tab-group management after renderer reload'",
    '`${persistedGroupName} group, 3 tabs, collapsed. Expand group.`',
    '`Show the 3 tabs in ${persistedGroupName}`',
    "capture('tab-group-persisted-1280x860')",
  ]) {
    assert.ok(
      evidence.includes(contract),
      `tab-group management evidence misses ${contract}`
    )
  }

  assert.equal(
    (evidence.match(/await dispatchKeyboardKey\('Enter', 'Enter', 13\)/g) ?? [])
      .length,
    1
  )
  assert.equal(
    (evidence.match(/await maskTabGroupMemberPathsForCapture\(\)/g) ?? [])
      .length,
    2
  )
  assert.equal(
    (
      evidence.match(
        /await client\.send\('Page\.reload', \{ ignoreCache: true \}\)/g
      ) ?? []
    ).length,
    1
  )

  const firstMask = evidence.indexOf(
    'await maskTabGroupMemberPathsForCapture()'
  )
  const collapsedCapture = evidence.indexOf(
    "capture('tab-group-members-collapsed-1280x860')"
  )
  const arrow = evidence.indexOf(
    "dispatchKeyboardKey('ArrowDown', 'ArrowDown', 40)"
  )
  const enter = evidence.indexOf("dispatchKeyboardKey('Enter', 'Enter', 13)")
  const receipt = evidence.indexOf('TAB_GROUP_SWITCH_RECEIPT')
  const editCapture = evidence.indexOf("capture('tab-group-edit-1280x860')")
  const reload = evidence.indexOf(
    "await client.send('Page.reload', { ignoreCache: true })"
  )
  const secondMask = evidence.indexOf(
    'await maskTabGroupMemberPathsForCapture()',
    firstMask + 1
  )
  const persistedCapture = evidence.indexOf(
    "capture('tab-group-persisted-1280x860')"
  )
  assert.ok(
    firstMask >= 0 &&
      firstMask < collapsedCapture &&
      collapsedCapture < arrow &&
      arrow < enter &&
      enter < receipt &&
      receipt < editCapture &&
      editCapture < reload &&
      reload < secondMask &&
      secondMask < persistedCapture
  )
})

test('repository sheet capture verifies compact actions and filter disclosure', () => {
  const scene = sceneSource('repositories-sheet')
  for (const contract of [
    "document.querySelector('#foldout-container .foldout')",
    "document.querySelector('.repository-list-actions')",
    "document.querySelector('.repository-list-filter-button')",
    "['Add', 'Select', 'More']",
    'button.right > actionLayout.sheet.right + 0.5',
    'Repository sheet clips or omits actions',
    "'expanded repository filter panel'",
    "'repository filter Regex Builder'",
    "'collapsed repository filter panel without detached Regex Builder'",
    "document.querySelector('#regex-builder-layer .regex-builder-dialog') === null",
    "document.activeElement === document.querySelector('.repository-list-filter-button')",
  ]) {
    assert.ok(scene.includes(contract), `repository sheet misses ${contract}`)
  }
  assert.ok(
    scene.indexOf('Repository sheet clips or omits actions') <
      scene.indexOf("capture('material-repositories-sheet')"),
    'the layout gate must run before capture'
  )
})

test('Publish Organization scene opens the real P0 no-remote repository through app flows', () => {
  const ownershipStart = source.indexOf(
    'function assertOwnedPublishSourceFixture()'
  )
  const ownershipEnd = source.indexOf(
    'const AdvancedWorkflowLocalTagNames',
    ownershipStart
  )
  assert.ok(ownershipStart >= 0 && ownershipEnd > ownershipStart)
  const ownership = source.slice(ownershipStart, ownershipEnd)
  for (const contract of [
    'assertOwnedDisposableFixture()',
    "relativeSource.toLowerCase() !== 'git-source'",
    'sourceEntry.isSymbolicLink()',
    "runAdvancedWorkflowGit(ownedSource, ['remote'])",
    "'status'",
    "'--porcelain=v1'",
    "insideWorkTree !== 'true' || remotes !== '' || status !== ''",
    'clean real P0 repository with no remote',
  ]) {
    assert.ok(ownership.includes(contract), `ownership gate misses ${contract}`)
  }

  const scene = sceneSource('publish-organization-picker')
  for (const contract of [
    "requestedLanguageMode !== 'bilingual'",
    'CaptureWidth !== 1440 || CaptureHeight !== 960',
    'ready === null || providerRequestLog === null',
    'const publishSource = assertOwnedPublishSourceFixture()',
    'await seedProfile()',
    "localStorage.setItem('filter-mode/publish-organizations', 'fuzzy')",
    "await menuEvent('add-local-repository')",
    '\'#add-existing-repository input[type="text"]\'',
    "await clickText('Add repository'",
    'appStore?.selectedRepository?.path',
    "'git-source'",
    "await menuEvent('push')",
    "'#publish-repository[open]'",
    "'#publish-organization-results.publish-organization-results'",
    "options[0]?.dataset.optionKey === 'none'",
    "'desktop-material-responsive-verification-organization-with-a-deliberately-long-login'",
    'const organizationRequestsBefore = countProviderRequests(',
    'const organizationRequestsAfter = countProviderRequests(',
    '/\\/user\\/orgs(?:\\?|$)/',
    'assertNoProviderMutations(',
    "'publish-organization-picker scene'",
    "capture('material-publish-organization-picker')",
  ]) {
    assert.ok(scene.includes(contract), `Publish scene misses ${contract}`)
  }

  const ownershipGate = scene.indexOf(
    'const publishSource = assertOwnedPublishSourceFixture()'
  )
  const seed = scene.indexOf('await seedProfile()')
  const add = scene.indexOf("await menuEvent('add-local-repository')")
  const select = scene.indexOf("'selected real P0 no-remote repository'")
  const push = scene.indexOf("await menuEvent('push')")
  const list = scene.indexOf("'Publish Repository organization listbox'")
  const capture = scene.indexOf(
    "capture('material-publish-organization-picker')"
  )
  assert.ok(
    ownershipGate >= 0 &&
      ownershipGate < seed &&
      seed < add &&
      add < select &&
      select < push &&
      push < list &&
      list < capture
  )
})

test('Publish Organization scene exercises filtering and rejects narrow layout regressions', () => {
  const scene = sceneSource('publish-organization-picker')
  for (const contract of [
    "'Filter mode: Fuzzy (click to change)'",
    "await setInput(searchSelector, 'material-design')",
    "'Filter mode: Substring (click to change)'",
    "await setInput(searchSelector, 'definitely-no-publish-destination')",
    "'.publish-organization-empty'",
    "await setInput(searchSelector, '[')",
    '\'.publish-organization-error[role="alert"]\'',
    "input?.getAttribute('aria-invalid') === 'true'",
    'options?.length === 4',
    "'#publish-repository .filter-regex-builder-button'",
    "document.querySelector('#regex-builder-title')",
    "await setInput(searchSelector, '.*')",
    'await setViewport(390, 844)',
    'Math.round(window.innerWidth * window.devicePixelRatio) - 390',
    'Math.round(window.innerHeight * window.devicePixelRatio) - 844',
    "localStorage.getItem('zoom-auto-fit-enabled') === '1'",
    "await dispatchKeyboardKey('End', 'End', 35)",
    "await dispatchKeyboardKey('Home', 'Home', 36)",
    "await dispatchKeyboardKey('Enter', 'Enter', 13)",
    'geometry?.list?.width <= 0',
    'geometry?.list?.height < 120',
    'geometry?.list?.physicalHeight < 44',
    'geometry?.list?.clientHeight < 120',
    'geometry?.list?.scrollHeight <= geometry?.list?.clientHeight',
    'geometry?.list?.maximumScrollTop <= 0',
    'geometry?.list?.initialScrollTop > 0.5',
    'geometry?.list?.scrollWidth > geometry?.list?.clientWidth + 1',
    'geometry?.visibleOptionCount',
    'geometry?.emptyVisible',
    'geometry?.controlFailures?.length !== 0',
    'geometry?.horizontalOverflow?.length !== 0',
    'geometry?.optionHorizontalFailures?.length !== 0',
    'longCopy.scrollWidth > longCopy.clientWidth + 1',
    "longCopyStyle?.textOverflow === 'ellipsis'",
    "longCopyStyle?.whiteSpace === 'nowrap'",
    'list.scrollTop = 0',
    'const initialScrollTop = list.scrollTop',
    'list.scrollTop = list.scrollHeight',
    'list.scrollHeight > list.clientHeight',
    'maximumScrollTop > 0',
    'Math.abs(list.scrollTop - maximumScrollTop) <= 1',
    'list.scrollTop > initialScrollTop + 0.5',
    'geometry?.reachedBottom !== true',
    'geometry?.scrolledForward !== true',
    'geometry?.finalOptionVisible !== true',
    'logicalViewport: [window.innerWidth, window.innerHeight]',
    'devicePixelRatio: deviceScale',
    'zoomFactor',
    'autoFitZoomEnabled:',
    'physicalHeight: listBounds.height * deviceScale',
    'PUBLISH_ORGANIZATION_GEOMETRY',
    'await restoreCaptureViewport()',
    'window.innerWidth === 1440 && window.innerHeight === 960',
    "document.querySelector('#window-zoom-info') === null",
    "'dismissed Publish Organization zoom indicator'",
    'wideState?.noHorizontalOverflow !== true',
    'wideState?.noneSelected !== true',
  ]) {
    assert.ok(scene.includes(contract), `Publish geometry misses ${contract}`)
  }

  const fuzzy = scene.indexOf("'Publish Organization fuzzy mode'")
  const substring = scene.indexOf("'Publish Organization substring mode'")
  const empty = scene.indexOf("'explicit empty Publish Organization result'")
  const regex = scene.indexOf("'Publish Organization regex mode'")
  const invalid = scene.indexOf("'non-destructive invalid organization regex'")
  const builder = scene.indexOf("'Publish Organization Regex Builder'")
  const narrow = scene.indexOf('await setViewport(390, 844)')
  const end = scene.indexOf("await dispatchKeyboardKey('End', 'End', 35)")
  const home = scene.indexOf("await dispatchKeyboardKey('Home', 'Home', 36)")
  const geometry = scene.indexOf('const geometry = await evaluate')
  const restore = scene.indexOf('await restoreCaptureViewport()', geometry)
  const wide = scene.indexOf(
    "'restored 1440x960 Publish Organization viewport'",
    restore
  )
  const capture = scene.indexOf(
    "capture('material-publish-organization-picker')",
    wide
  )
  assert.ok(
    fuzzy >= 0 &&
      fuzzy < substring &&
      substring < empty &&
      empty < regex &&
      regex < invalid &&
      invalid < builder &&
      builder < narrow &&
      narrow < end &&
      end < home &&
      home < geometry &&
      geometry < restore &&
      restore < wide &&
      wide < capture
  )
})

test('branch sheet capture rejects clipped or overlapping footer actions', () => {
  const scene = sceneSource('branches-sheet')
  for (const contract of [
    "document.querySelector('#foldout-container .foldout')",
    "document.querySelector('.branches-container .merge-button-row')",
    "'.branches-container .merge-all-button'",
    "'.branches-container .new-branch-button'",
    'layout.row.scrollWidth > layout.row.clientWidth + 1',
    'intersects(layout.newBranch, layout.merge)',
    'Branch sheet controls are clipped or overlapping',
  ]) {
    assert.ok(scene.includes(contract), `branch sheet misses ${contract}`)
  }
  assert.ok(
    scene.indexOf('Branch sheet controls are clipped or overlapping') <
      scene.indexOf("capture('material-branches-sheet')"),
    'the branch layout gate must run before capture'
  )
})

test('Actions captures prove inspector pagination, logs, reviews, and cancellation', () => {
  for (const contract of [
    'async function openInspectorRun()',
    'async function loadInspectorPageTwo()',
    "document.querySelector('.actions-run-list')",
    "document.querySelector('.actions-content')",
    'content.scrollTop = 0',
    'details.scrollTop = 0',
    'requestAnimationFrame(() => requestAnimationFrame(',
    "run.getAttribute('aria-pressed') === 'true'",
    'cards?.length === 50',
    'contentBounds.height > 300',
    'inside(runBounds, listBounds)',
    'inside(titleBounds, detailsBounds)',
    'inside(detailsBounds, contentBounds)',
    'inside(paginationBounds, detailsBounds)',
    'visible Actions inspector split panes',
    "scene('actions-sentinel'",
    "within: '.actions-run-details'",
    "document.querySelector('.actions-run-list')",
    "button.querySelector('.actions-run-summary strong')",
    "card.querySelector('.actions-run-number')?.textContent?.trim() === '#125'",
    "document.querySelector('.actions-run-details') === null",
    'inside(cardBounds, listBounds)',
    'visible exact Actions inspector sentinel',
    '50 loaded of ${ready.workflowRunCount} workflow runs',
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
  assert.match(
    source,
    /50 loaded of \$\{\s*ready\.inspectorJobCount\s*\} jobs for attempt 2/
  )
  for (const retainedState of [
    'const runInventoryComplete',
    'if (!runInventoryComplete)',
    '${ready.workflowRunCount} loaded of ${ready.workflowRunCount} workflow runs',
    '${ready.inspectorJobCount} loaded of ${ready.inspectorJobCount} jobs for attempt 2',
  ]) {
    assert.ok(
      source.includes(retainedState),
      `missing retained state: ${retainedState}`
    )
  }
  assert.ok(!source.includes('WARN no cancellable run found'))
})

test('artifact page-two capture targets its exact card inside the details pane', () => {
  const artifactPageTwo = sceneSource('actions-artifact-page-two')
  for (const contract of [
    'exact page-one artifact inventory and enabled pagination action',
    'const pageOneArtifactCount = ready.artifactCount - 1',
    // The shipped status line names loaded, total and visible.
    'const pageOneArtifactStatus = `Showing ${pageOneArtifactCount} loaded of ${ready.artifactCount} artifacts \u00b7 ${pageOneArtifactCount} visible.`',
    'const status = pagination?.querySelector(\'[role="status"]\')',
    "candidate.textContent?.trim() === 'Load more artifacts'",
    'button instanceof HTMLButtonElement',
    '!button.disabled',
    "button.getAttribute('aria-disabled') !== 'true'",
    "within: '.actions-run-details .actions-artifacts'",
    "'#actions-artifact-${",
    'ready.artifactSentinelId',
    'ready.artifactCount',
    'page-two-artifact-sentinel-with-a-deliberately-long-name-that-must-wrap-without-clipping-overlap-or-sideways-scrolling',
    'complete exact artifact page-two inventory',
    "document.querySelector('.actions-content')",
    'content.scrollTop = 0',
    'details.scrollTop += headingBounds.top - detailsBounds.top',
    "heading?.closest('.actions-artifact-card')",
    "'.actions-run-reviews .actions-inline-error'",
    'visibleReviewErrors.length === 0',
    'details.scrollWidth <= details.clientWidth + 1',
    'grid.scrollWidth <= grid.clientWidth + 1',
    'visible exact artifact page-two sentinel',
  ]) {
    assert.ok(
      artifactPageTwo.includes(contract),
      `artifact page-two gate misses ${contract}`
    )
  }
  assert.match(
    artifactPageTwo,
    /status\?\.textContent\?\.trim\(\) === \$\{JSON\.stringify\(\s*pageOneArtifactStatus\s*\)\}/
  )
  assert.match(
    artifactPageTwo,
    /querySelectorAll\('#actions-artifact-grid \.actions-artifact-card'\)\.length ===\s*\$\{pageOneArtifactCount\}/
  )
  assert.match(
    artifactPageTwo,
    /querySelector\('#actions-artifact-\$\{\s*ready\.artifactSentinelId\s*\}'\) === null/
  )
  const open = artifactPageTwo.indexOf('await openFirstRun()')
  const pageOne = artifactPageTwo.indexOf(
    'exact page-one artifact inventory and enabled pagination action'
  )
  const loadMore = artifactPageTwo.indexOf("clickText('Load more artifacts'")
  assert.ok(open >= 0 && open < pageOne && pageOne < loadMore)
  assert.ok(
    artifactPageTwo.indexOf('visible exact artifact page-two sentinel') <
      artifactPageTwo.indexOf("capture('material-actions-artifact-page-two')"),
    'the exact artifact and error gate must run before capture'
  )
})

test('advanced workflow and Cheap-LFS scenes use exact enabled controls', () => {
  const advanced = sceneSource('advanced-workflows')
  const advancedSelector =
    '.tag-lifecycle-manager > header .tag-lifecycle-actions button:nth-of-type(2)'
  assert.ok(advanced.includes(advancedSelector))
  assert.ok(advanced.includes("?.textContent?.trim() === 'Load remote'"))
  assert.ok(advanced.includes("getAttribute('aria-disabled') !== 'true'"))
  assert.ok(advanced.includes('clickEnabledSelector(loadRemoteSelector)'))
  assert.ok(!advanced.includes("clickText('Load remote'"))

  const cheap = sceneSource('cheap-lfs-preparing')
  const checkout = cheap.indexOf("'checkout',")
  const create = cheap.indexOf("fs.openSync(largeFilePath, 'wx')")
  const cleanBase = cheap.indexOf("baseStatus !== ''")
  const exactPreparedStatus = cheap.indexOf(
    'preparedStatus[0] !== `?? ${largeFileName}`'
  )
  assert.notEqual(checkout, -1)
  assert.notEqual(create, -1)
  assert.notEqual(cleanBase, -1)
  assert.notEqual(exactPreparedStatus, -1)
  assert.ok(checkout < cleanBase)
  assert.ok(cleanBase < create)
  assert.ok(create < exactPreparedStatus)
  for (const contract of [
    "const cheapLfsBranch = 'gallery/cheap-lfs-evidence'",
    'assertOwnedDisposableFixture()',
    'const cheapLfsBaseRef = `refs/heads/${ready.featureBranch}^{commit}`',
    "'rev-parse', '--verify', cheapLfsBaseRef",
    "'branch', '--show-current'",
    "'status', '--porcelain=v1', '--untracked-files=all'",
    'checkedOutHead !== cheapLfsBaseHead',
    'preparedStatus.length !== 1',
    'isolated Cheap-LFS evidence branch',
    "setInput('.summary-field input'",
    "getAttribute('aria-disabled') !== 'true'",
    "clickEnabledSelector('.commit-button')",
    'Preparing 1 large file for cheap LFS',
  ]) {
    assert.ok(cheap.includes(contract), `Cheap-LFS misses ${contract}`)
  }
  assert.match(
    cheap,
    /'checkout',\s*'--quiet',\s*'-B',\s*cheapLfsBranch,\s*cheapLfsBaseRef/
  )
})

test('advanced workflow seeds and proves the exact owned tag topology', () => {
  const helperStart = source.indexOf(
    'function prepareAdvancedWorkflowTagFixture()'
  )
  const helperEnd = source.indexOf('const DefaultWidth', helperStart)
  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  const helper = source.slice(helperStart, helperEnd)
  for (const contract of [
    'assertOwnedDisposableFixture()',
    'fs.realpathSync.native(path.resolve(runRoot))',
    'ownedBare = fs.realpathSync.native(',
    "'git-http'",
    'const bareInsideRunRoot =',
    "relativeFixture.toLowerCase() !== 'fixture'",
    'relativeBare.toLowerCase() !== expectedBare.toLowerCase()',
    "'--is-inside-work-tree'",
    "'--is-bare-repository'",
    '`refs/remotes/origin/${ready.defaultBranch}^{commit}`',
    '`refs/remotes/origin/${ready.featureBranch}^{commit}`',
    "runAdvancedWorkflowGit(ownedBare, ['update-ref', '-d', tagRef])",
    'GIT_COMMITTER_DATE: taggerDate',
    "'preview-local'",
    "'v1.0.0'",
    "'v1.1.0'",
    "'archive-remote'",
    "'refs/tags/v1.0.0:refs/tags/v1.0.0'",
    "'refs/tags/v1.1.0:refs/tags/v1.1.0'",
    "'refs/tags/archive-remote:refs/tags/archive-remote'",
    "JSON.stringify(pushed) !== JSON.stringify(['v1.0.0', 'v1.1.0'])",
    "JSON.stringify(localOnly) !== JSON.stringify(['preview-local'])",
    "JSON.stringify(remoteOnly) !== JSON.stringify(['archive-remote'])",
    'ADVANCED_TAG_FIXTURE',
  ]) {
    assert.ok(
      helper.includes(contract),
      `tag fixture helper misses ${contract}`
    )
  }

  const advanced = sceneSource('advanced-workflows')
  const seed = advanced.indexOf('prepareAdvancedWorkflowTagFixture()')
  const repository = advanced.indexOf('await ensureRepository()')
  const capture = advanced.indexOf("capture('advanced-workflows')")
  assert.ok(seed >= 0 && seed < repository)
  for (const contract of [
    'Local tags (3)',
    'Remote-only tags (1) on origin',
    '["preview-local","v1.0.0","v1.1.0"]',
    '["archive-remote"]',
    "textByName.get('preview-local')?.includes('Local only') === true",
    "textByName.get('v1.0.0')?.includes('Pushed') === true",
    "textByName.get('v1.1.0')?.includes('Pushed') === true",
    "textByName.get('archive-remote')?.includes('remote only') === true",
    'row.withinViewport',
    'row.withinResultsColumn',
    'row.withinInventoryHorizontally',
    '!row.horizontalOverflow',
    'row.buttonsWithinRow',
    '!row.buttonsOverlap',
    'receipt.visibleErrors.length !== 0',
    'Advanced workflows failed semantic/geometry/privacy checks',
  ]) {
    assert.ok(advanced.includes(contract), `advanced gate misses ${contract}`)
  }
  assert.ok(
    advanced.indexOf('const rowsHaveValidGeometry =') < capture,
    'the semantic and geometry receipt must run before capture'
  )
})

test('advanced workflow Git subprocesses are bounded and hermetic', () => {
  const redirectEnvironmentNames = frozenStringArray(
    'AdvancedWorkflowGitRedirectEnvironmentNames'
  )
  const requiredRedirectEnvironmentNames = [
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
  ]
  assert.deepEqual(redirectEnvironmentNames, requiredRedirectEnvironmentNames)
  assert.equal(
    new Set(redirectEnvironmentNames).size,
    redirectEnvironmentNames.length,
    'Git redirection environment names must remain unique'
  )

  const helperStart = source.indexOf(
    'const AdvancedWorkflowGitTimeoutMs = 30_000'
  )
  const helperEnd = source.indexOf(
    'function readAdvancedWorkflowTagRefs(',
    helperStart
  )
  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  const helper = source.slice(helperStart, helperEnd)

  for (const contract of [
    'const AdvancedWorkflowGitMaxBufferBytes = 1024 * 1024',
    "const AdvancedWorkflowGitNullDevice = 'NUL'",
    'const environment = { ...process.env, ...overrides }',
    'const normalizedKey = key.toUpperCase()',
    '/^GIT_CONFIG(?:_|$)/.test(normalizedKey)',
    '/^GIT_TRACE(?:2)?(?:_|$)/.test(normalizedKey)',
    'AdvancedWorkflowGitRedirectEnvironmentNames.includes(normalizedKey)',
    'delete environment[key]',
    'GIT_CONFIG_GLOBAL: AdvancedWorkflowGitNullDevice',
    'GIT_CONFIG_SYSTEM: AdvancedWorkflowGitNullDevice',
    "GIT_CONFIG_NOSYSTEM: '1'",
    "'tag.gpgSign=false'",
    "'push.gpgSign=false'",
    '`core.hooksPath=${AdvancedWorkflowGitNullDevice}`',
    'env: getAdvancedWorkflowGitEnvironment(environmentOverrides)',
    'timeout: AdvancedWorkflowGitTimeoutMs',
    'maxBuffer: AdvancedWorkflowGitMaxBufferBytes',
  ]) {
    assert.ok(helper.includes(contract), `tag Git helper misses ${contract}`)
  }
  const callerOptions = helper.indexOf('...execOptions')
  const timeout = helper.indexOf('timeout: AdvancedWorkflowGitTimeoutMs')
  const maxBuffer = helper.indexOf(
    'maxBuffer: AdvancedWorkflowGitMaxBufferBytes'
  )
  assert.ok(callerOptions >= 0 && callerOptions < timeout)
  assert.ok(callerOptions < maxBuffer)

  const inheritedEnvironment = Object.fromEntries(
    redirectEnvironmentNames.map((name, index) => [
      index % 2 === 0 ? name : name.toLowerCase(),
      `inherited-${index}`,
    ])
  )
  inheritedEnvironment.GIT_CONFIG_COUNT = '1'
  inheritedEnvironment.GIT_CONFIG_KEY_0 = 'core.hooksPath'
  inheritedEnvironment.GIT_CONFIG_VALUE_0 = 'inherited-hook-path'
  inheritedEnvironment.Git_Trace = 'inherited-trace-path'
  inheritedEnvironment.git_trace2_event = 'inherited-trace2-path'
  inheritedEnvironment.GIT_COMMITTER_NAME = 'Inherited identity'
  inheritedEnvironment.SAFE_CAPTURE_SENTINEL = 'inherited-safe-value'
  const getEnvironment = vm.runInNewContext(
    `(() => { ${helper}; return getAdvancedWorkflowGitEnvironment })()`,
    { process: { env: inheritedEnvironment } }
  )
  const sanitizedEnvironment = getEnvironment({
    git_dir: 'override-repository',
    git_config_global: 'override-config',
    GIT_COMMITTER_NAME: 'Material Fixture',
    GIT_COMMITTER_EMAIL: 'material-fixture@example.invalid',
    GIT_COMMITTER_DATE: '2026-07-13T10:24:00Z',
    SAFE_OVERRIDE_SENTINEL: 'override-safe-value',
  })
  for (const name of redirectEnvironmentNames) {
    assert.equal(
      Object.keys(sanitizedEnvironment).some(key => key.toUpperCase() === name),
      false,
      `${name} escaped Git environment isolation`
    )
  }
  assert.equal(
    Object.keys(sanitizedEnvironment).some(key =>
      /^GIT_TRACE(?:2)?(?:_|$)/.test(key.toUpperCase())
    ),
    false,
    'Git trace output escaped environment isolation'
  )
  assert.equal(
    Object.keys(sanitizedEnvironment).some(key =>
      /^GIT_CONFIG(?:_|$)/.test(key.toUpperCase())
    ),
    true,
    'only the fixed Git configuration variables should survive isolation'
  )
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(sanitizedEnvironment).filter(([key]) =>
        /^GIT_CONFIG(?:_|$)/.test(key.toUpperCase())
      )
    ),
    {
      GIT_CONFIG_GLOBAL: 'NUL',
      GIT_CONFIG_SYSTEM: 'NUL',
      GIT_CONFIG_NOSYSTEM: '1',
    }
  )
  assert.equal(sanitizedEnvironment.GIT_COMMITTER_NAME, 'Material Fixture')
  assert.equal(
    sanitizedEnvironment.GIT_COMMITTER_EMAIL,
    'material-fixture@example.invalid'
  )
  assert.equal(sanitizedEnvironment.GIT_COMMITTER_DATE, '2026-07-13T10:24:00Z')
  assert.equal(
    sanitizedEnvironment.SAFE_CAPTURE_SENTINEL,
    'inherited-safe-value'
  )
  assert.equal(
    sanitizedEnvironment.SAFE_OVERRIDE_SENTINEL,
    'override-safe-value'
  )

  const fixtureStart = source.indexOf(
    'function prepareAdvancedWorkflowTagFixture()'
  )
  const fixtureEnd = source.indexOf('const DefaultWidth', fixtureStart)
  assert.notEqual(fixtureStart, -1)
  assert.notEqual(fixtureEnd, -1)
  const fixture = source.slice(fixtureStart, fixtureEnd)
  for (const contract of ["'--no-sign'", "'--no-signed'", "'--no-verify'"]) {
    assert.ok(
      fixture.includes(contract),
      `tag fixture command misses ${contract}`
    )
  }
  assert.match(fixture, /'tag',\s*'--no-sign',\s*'--annotate',\s*'--force'/)
  assert.match(fixture, /'push',\s*'--no-signed',\s*'--no-verify',\s*'--force'/)
})

test('requested 200% scale proves the base and a lower auto-fit factor', () => {
  const scale = sceneSource('scale-200')
  for (const contract of [
    "Number(localStorage.getItem('zoom-factor')) === 2",
    "localStorage.getItem('zoom-auto-fit-enabled') === '1'",
    "require('electron').webFrame.getZoomFactor() >= 0.5",
    "require('electron').webFrame.getZoomFactor() < 2",
    "await capture('material-scale-200-autofit')",
  ]) {
    assert.ok(scale.includes(contract), `scale-200 misses ${contract}`)
  }
  assert.ok(!scale.includes('getZoomFactor() * 100) === 200'))
})

test('capture scenes prove PR, sparse, scale, merge, and distinct artifact states', () => {
  for (const contract of [
    "setInput('.sparse-checkout-editor', 'docs/')",
    "document.querySelector('.sparse-checkout-confirmation')",
    "document.querySelector('.pull-request-files-changed')",
    "document.querySelector('#create-github-pull-request')",
    "clickTextWhenEnabled('Review pull request'",
    "clickText('Create pull request'",
    'const expectedPullRequestNumber = 73 + before',
    'const expectedPullRequestReceipt =',
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
    /JSON\.stringify\(\r?\n\s+expectedPullRequestReceipt/,
    'the native pull-request receipt must be evaluated exactly'
  )
  assert.match(
    source,
    /scene\('scale-200',[\s\S]*?for \(let index = 0; index < 5; index\+\+\)/
  )
})
