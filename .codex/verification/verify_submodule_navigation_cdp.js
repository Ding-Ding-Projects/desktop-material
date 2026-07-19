#!/usr/bin/env node
'use strict'

/**
 * Ten-pass renderer verifier for temporary submodule-repository navigation.
 *
 * The caller owns the Electron process, loopback CDP port, hidden desktop,
 * fixture, and native-window cleanup. This script only attaches to the already
 * owned renderer. It never launches, closes, raises, or focuses a native
 * window. Keyboard focus below is renderer DOM focus used for accessibility
 * checks, not Win32 focus.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

const StateVersion = 1
const StateFileName = 'submodule-navigation-state.json'
const AppearanceStorageKey = 'appearance-customization-v1'
const OwnedRootPrefix = 'desktop-material-p0-ui-'
const MaxStateBytes = 32 * 1024

const TEN_PASS_COVERAGE = Object.freeze({
  1: Object.freeze([
    'fresh-launch',
    'fixture-identity',
    'persistent-list-baseline',
    'nonblank-no-error',
  ]),
  2: Object.freeze([
    'manager-search-counters',
    'checked-out-gating',
    'uninitialized-gating',
    'keyboard-order',
  ]),
  3: Object.freeze([
    'temporary-child-open',
    'parent-labelled-back',
    'child-git-surface',
    'list-count-stable',
  ]),
  4: Object.freeze([
    'back-to-parent',
    'section-continuity',
    'focus-restoration',
    'no-duplicate-entry',
  ]),
  5: Object.freeze([
    'restart-policy',
    'temporary-session-not-restored',
    'repository-tab-switch',
    'parent-linkage',
  ]),
  6: Object.freeze([
    'appearance-live-preview',
    'appearance-save',
    'appearance-cancel-rollback',
    'legacy-fallback',
  ]),
  7: Object.freeze([
    'compact-layout',
    'keyboard-only-back',
    'accessible-names',
    'no-clipping',
  ]),
  8: Object.freeze([
    'dark-theme',
    'scale-200',
    'auto-fit',
    'responsive-parent-identity',
  ]),
  9: Object.freeze([
    'english',
    'cantonese',
    'bilingual',
    'language-persistence-fallback',
  ]),
  10: Object.freeze([
    'changes-history',
    'actions-releases',
    'notifications-tools-settings',
    'final-child-parent-regression',
  ]),
})

function fail(message) {
  throw new Error(message)
}

function isWithinOrEqual(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

function isContainedPath(root, candidate) {
  return root !== candidate && isWithinOrEqual(root, candidate)
}

function parseArguments(argv) {
  const allowed = new Set(['port', 'run-root', 'pass', 'capture'])
  const values = new Map()
  if (argv.length === 0 || argv.length % 2 !== 0) {
    fail('Arguments must be supplied as --name value pairs.')
  }
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    const key = name.slice(2)
    if (!allowed.has(key)) {
      fail(`Unknown argument --${key}.`)
    }
    if (values.has(key)) {
      fail(`Duplicate argument --${key}.`)
    }
    values.set(key, value)
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }

  const pass = Number(values.get('pass'))
  if (!Number.isSafeInteger(pass) || pass < 1 || pass > 10) {
    fail('Pass must be an integer from 1 through 10.')
  }

  const runRootValue = values.get('run-root')
  if (runRootValue === undefined || !path.isAbsolute(runRootValue)) {
    fail('run-root must be an absolute owned path.')
  }
  const requestedRoot = path.resolve(runRootValue)
  if (!fs.statSync(requestedRoot).isDirectory()) {
    fail('The owned run root does not exist.')
  }
  const runRoot = fs.realpathSync.native(requestedRoot)
  const temporaryRoot = fs.realpathSync.native(os.tmpdir())
  if (
    !isContainedPath(temporaryRoot, runRoot) ||
    !path.basename(runRoot).startsWith(OwnedRootPrefix)
  ) {
    fail('The owned run root name is invalid.')
  }

  const fixturePath = path.join(runRoot, 'fixture')
  if (!fs.statSync(fixturePath).isDirectory()) {
    fail('The deterministic fixture clone is missing.')
  }
  const gitMetadataPath = path.join(fixturePath, '.git')
  if (!fs.existsSync(gitMetadataPath)) {
    fail('The deterministic fixture clone is not a Git repository.')
  }

  const captureValue = values.get('capture')
  if (captureValue === undefined || !path.isAbsolute(captureValue)) {
    fail('capture must be an absolute PNG path.')
  }
  const requestedCapture = path.resolve(captureValue)
  const captureParent = fs.realpathSync.native(path.dirname(requestedCapture))
  const capture = path.join(captureParent, path.basename(requestedCapture))
  const expectedPrefix = `pass-${String(pass).padStart(2, '0')}-`
  if (
    !isContainedPath(runRoot, capture) ||
    !isWithinOrEqual(runRoot, captureParent) ||
    path.extname(capture).toLowerCase() !== '.png' ||
    !path.basename(capture).startsWith(expectedPrefix) ||
    fs.existsSync(capture)
  ) {
    fail(
      `capture must be a new ${expectedPrefix}*.png file inside the owned run root.`
    )
  }

  return {
    port,
    pass,
    runRoot,
    fixturePath,
    capture,
    statePath: path.join(runRoot, StateFileName),
  }
}

function emptyState(runRoot) {
  return {
    version: StateVersion,
    runId: path.basename(runRoot),
    lastCompletedPass: 0,
    parentName: null,
    checkedOutPath: null,
    uninitializedPath: null,
    persistentRepositoryCount: null,
    repositoryTabCount: null,
    rendererTimeOrigin: null,
    captures: [],
  }
}

function readState(options) {
  if (!fs.existsSync(options.statePath)) {
    return emptyState(options.runRoot)
  }
  const stats = fs.statSync(options.statePath)
  if (!stats.isFile() || stats.size > MaxStateBytes) {
    fail('The persisted verifier state is invalid or oversized.')
  }
  const realState = fs.realpathSync.native(options.statePath)
  if (!isContainedPath(options.runRoot, realState)) {
    fail('The persisted verifier state escaped the owned run root.')
  }
  const state = JSON.parse(fs.readFileSync(realState, 'utf8'))
  if (
    state === null ||
    typeof state !== 'object' ||
    state.version !== StateVersion ||
    state.runId !== path.basename(options.runRoot) ||
    !Number.isSafeInteger(state.lastCompletedPass) ||
    state.lastCompletedPass < 0 ||
    state.lastCompletedPass > 10 ||
    !Array.isArray(state.captures)
  ) {
    fail('The persisted verifier state schema is invalid.')
  }
  return state
}

function assertPassOrder(state, pass) {
  if (state.lastCompletedPass !== pass - 1) {
    fail(
      `Pass ${pass} requires completed pass ${pass - 1}; state records ${
        state.lastCompletedPass
      }.`
    )
  }
}

function writeState(options, state) {
  const serialized = `${JSON.stringify(state, null, 2)}\n`
  if (Buffer.byteLength(serialized) > MaxStateBytes) {
    fail('The next verifier state is unexpectedly large.')
  }
  const temporary = path.join(
    options.runRoot,
    `${StateFileName}.${process.pid}.tmp`
  )
  if (fs.existsSync(temporary)) {
    fail('The owned state temporary file already exists.')
  }
  try {
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
    if (fs.existsSync(options.statePath)) {
      const existing = fs.lstatSync(options.statePath)
      if (!existing.isFile() || existing.isSymbolicLink()) {
        fail('The owned state destination is not a regular file.')
      }
      fs.copyFileSync(temporary, options.statePath)
      fs.unlinkSync(temporary)
    } else {
      fs.renameSync(temporary, options.statePath)
    }
  } catch (error) {
    if (fs.existsSync(temporary)) {
      fs.unlinkSync(temporary)
    }
    throw error
  }
}

async function connect(port) {
  const deadline = Date.now() + 20_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  throw lastError ?? new Error('Timed out attaching to loopback CDP.')
}

async function getRenderer(browser) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const pages = browser
      .contexts()
      .flatMap(context => context.pages())
      .filter(candidate => candidate.url().includes('/out/index.html'))
    if (pages.length === 1) {
      return pages[0]
    }
    if (pages.length > 1) {
      fail('More than one Desktop Material renderer target is attached.')
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  fail('The owned Desktop Material renderer target was not found.')
}

async function menuEvent(page, eventName) {
  await page.evaluate(name => {
    require('electron').ipcRenderer.emit('menu-event', {}, name)
  }, eventName)
  await page.waitForTimeout(350)
}

async function setViewport(session, width, height) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  })
  await new Promise(resolve => setTimeout(resolve, 300))
}

async function initializeProfile(page) {
  const changed = await page.evaluate(() => {
    const expected = {
      'has-shown-welcome-flow': '1',
      'stats-opt-out': '1',
      'has-sent-stats-opt-in-ping': '1',
      theme: 'light',
    }
    let didChange = false
    for (const [key, value] of Object.entries(expected)) {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value)
        didChange = true
      }
    }
    return didChange
  })
  if (changed) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
}

async function waitForApp(page) {
  await page.locator('#desktop-app-contents').waitFor({
    state: 'visible',
    timeout: 30_000,
  })
  const continueWithoutAccount = page.getByRole('link', {
    name: 'Continue without signing in',
    exact: true,
  })
  if (await continueWithoutAccount.isVisible().catch(() => false)) {
    await continueWithoutAccount.click()
  }
  await page.waitForTimeout(500)
}

async function dismissTransientSurfaces(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const errorNoticeDismiss = page
      .locator('.error-notice-dismiss:visible')
      .first()
    if ((await errorNoticeDismiss.count()) > 0) {
      await errorNoticeDismiss.click()
      await page.waitForTimeout(100)
      continue
    }

    const preferences = page.locator('#preferences')
    if (await preferences.isVisible().catch(() => false)) {
      const cancel = preferences.getByRole('button', {
        name: 'Cancel',
        exact: true,
      })
      const close = preferences.getByRole('button', {
        name: 'Close',
        exact: true,
      })
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click()
      } else if (await close.isVisible().catch(() => false)) {
        await close.click()
      }
      await preferences.waitFor({ state: 'hidden' })
      continue
    }

    const dialog = page.locator('[role="dialog"]:visible').last()
    if ((await dialog.count()) > 0) {
      const cancel = dialog.getByRole('button', {
        name: 'Cancel',
        exact: true,
      })
      const close = dialog.getByRole('button', {
        name: 'Close',
        exact: true,
      })
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click()
      } else if (await close.isVisible().catch(() => false)) {
        await close.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(150)
      continue
    }

    const transient = page.locator(
      '.tab-search-popover:visible, .arrange-tabs:visible, #app-menu-foldout:visible, .material-context-menu:visible'
    )
    if ((await transient.count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)
      continue
    }
    break
  }
}

function repositoryDropdown(page) {
  return page.locator('.toolbar-dropdown.foldout-style', {
    has: page.locator('.description', { hasText: 'Current repository' }),
  })
}

const RepositoryRailTabIds = Object.freeze({
  Changes: 'changes-tab',
  History: 'history-tab',
  Actions: 'actions-tab',
  Releases: 'releases-tab',
  Issues: 'issues-tab',
  API: 'github-api-tab',
  Triage: 'triage-tab',
  Tools: 'repository-tools-tab',
})

function repositoryRailTab(page, label) {
  const id = RepositoryRailTabIds[label]
  if (id === undefined) {
    fail(`Unknown repository rail label: ${label}`)
  }
  return page
    .locator('nav.repository-rail [role="tab"]')
    .filter({ has: page.locator(`#${id}`) })
}

async function currentRepositoryName(page) {
  return (
    (
      await repositoryDropdown(page)
        .locator('.title')
        .textContent()
        .catch(() => null)
    )?.trim() ?? null
  )
}

async function addFixtureRepository(page, fixturePath) {
  await menuEvent(page, 'add-local-repository')
  const heading = page.getByRole('heading', {
    name: 'Add local repository',
    exact: true,
  })
  await heading.waitFor({ state: 'visible', timeout: 10_000 })
  const pathInput = page.locator('#__TextBox_Local_path')
  await pathInput.fill(fixturePath)
  await pathInput.blur()
  const add = page.getByRole('button', {
    name: 'Add repository',
    exact: true,
  })
  if (!(await add.isEnabled())) {
    fail('The owned git-source fixture could not be added.')
  }
  await add.click()
  await heading.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function chooseFixtureRepository(page, fixturePath) {
  const fixtureName = path.basename(fixturePath)
  const dropdown = repositoryDropdown(page)
  await dropdown.locator('.toolbar-button > button').click()
  const list = page.locator('.repository-list')
  await list.waitFor({ state: 'visible', timeout: 10_000 })
  const option = list
    .getByRole('option')
    .filter({ hasText: fixtureName })
    .first()
  if ((await option.count()) === 0) {
    const close = list.getByRole('button', { name: 'Close', exact: true })
    if (await close.isVisible()) {
      await close.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await list.waitFor({ state: 'hidden' })
    await addFixtureRepository(page, fixturePath)
    return
  }
  await option.click()
  await list.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function ensureRootRepository(page, fixturePath) {
  const context = page.locator('.submodule-repository-context')
  if (await context.isVisible().catch(() => false)) {
    await context.locator('.submodule-context-back').click()
    await context.waitFor({ state: 'hidden', timeout: 30_000 })
  }
  const fixtureName = path.basename(fixturePath)
  const dropdown = repositoryDropdown(page)
  const dropdownReady = await dropdown
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!dropdownReady) {
    await addFixtureRepository(page, fixturePath)
  }
  if ((await currentRepositoryName(page)) !== fixtureName) {
    await chooseFixtureRepository(page, fixturePath)
  }
  await repositoryDropdown(page)
    .locator('.title')
    .filter({ hasText: fixtureName })
    .waitFor({ state: 'visible', timeout: 30_000 })
  for (const tabName of ['Changes', 'History', 'Tools']) {
    await repositoryRailTab(page, tabName).waitFor({
      state: 'visible',
      timeout: 60_000,
    })
  }
}

async function persistentRepositoryCount(page) {
  const count = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('Database')
        open.onerror = () => reject(open.error ?? new Error('open failed'))
        open.onsuccess = () => {
          const database = open.result
          if (!database.objectStoreNames.contains('repositories')) {
            database.close()
            reject(new Error('repositories store is unavailable'))
            return
          }
          const transaction = database.transaction('repositories', 'readonly')
          const request = transaction.objectStore('repositories').count()
          request.onerror = () => {
            database.close()
            reject(request.error ?? new Error('count failed'))
          }
          request.onsuccess = () => {
            const result = request.result
            transaction.oncomplete = () => database.close()
            resolve(result)
          }
        }
      })
  )
  if (count < 1) {
    fail('The persistent repository database is unexpectedly empty.')
  }
  return count
}

async function repositoryTabCount(page) {
  return page.locator('.repository-tab[role="tab"]').count()
}

async function assertUsableDocument(page, label) {
  const receipt = await page.evaluate(() => {
    const app = document.querySelector('#desktop-app-contents')
    const rect = app?.getBoundingClientRect()
    return {
      width: innerWidth,
      height: innerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      appWidth: rect === undefined ? 0 : Math.round(rect.width),
      appHeight: rect === undefined ? 0 : Math.round(rect.height),
      appTextLength: app?.textContent?.trim().length ?? 0,
    }
  })
  if (
    receipt.width < 320 ||
    receipt.height < 320 ||
    receipt.appWidth < 300 ||
    receipt.appHeight < 300 ||
    receipt.appTextLength < 20 ||
    receipt.documentScrollWidth > receipt.documentClientWidth + 1 ||
    receipt.bodyScrollWidth > receipt.bodyClientWidth + 1
  ) {
    fail(`${label} failed the nonblank/overflow gate.`)
  }
  const errorCount = await page
    .locator(
      '.error-notice-stack .error-notice:visible, .crash-window:visible, #fatal-error:visible'
    )
    .count()
  if (errorCount !== 0) {
    fail(`${label} displayed an error or crash surface.`)
  }
  return {
    width: receipt.width,
    height: receipt.height,
    appTextPresent: receipt.appTextLength >= 20,
    noHorizontalOverflow: true,
    noErrorSurface: true,
  }
}

async function inspectSurface(page, selector) {
  return page.evaluate(value => {
    const element = document.querySelector(value)
    if (!(element instanceof HTMLElement)) {
      return null
    }
    const rect = element.getBoundingClientRect()
    const interactive = [
      ...element.querySelectorAll(
        'button, input, select, textarea, a[href], [role="tab"], [role="option"], [tabindex="0"]'
      ),
    ].filter(candidate => {
      const style = getComputedStyle(candidate)
      const box = candidate.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        box.width > 0 &&
        box.height > 0
      )
    })
    const unnamed = interactive.filter(candidate => {
      const labels =
        'labels' in candidate && candidate.labels
          ? [...candidate.labels]
              .map(label => label.textContent ?? '')
              .join(' ')
          : ''
      return !(
        candidate.getAttribute('aria-label') ||
        candidate.getAttribute('aria-labelledby') ||
        candidate.getAttribute('title') ||
        candidate.getAttribute('placeholder') ||
        labels.trim() ||
        candidate.textContent?.trim()
      )
    }).length
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      interactiveCount: interactive.length,
      unnamed,
      withinViewport:
        rect.left >= -1 &&
        rect.top >= -1 &&
        rect.right <= innerWidth + 1 &&
        rect.bottom <= innerHeight + 1,
    }
  }, selector)
}

function assertBoundedSurface(receipt, label) {
  if (
    receipt === null ||
    !receipt.withinViewport ||
    receipt.scrollWidth > receipt.clientWidth + 1 ||
    receipt.unnamed > 0
  ) {
    fail(`${label} failed its clipping/accessibility gate.`)
  }
}

async function activate(locator, keyboardOnly) {
  if (keyboardOnly) {
    await locator.focus()
    await locator.press('Enter')
  } else {
    await locator.click()
  }
}

async function openSubmoduleManager(page, fixturePath, keyboardOnly = false) {
  const existing = page.locator('#submodule-manager')
  if (await existing.isVisible().catch(() => false)) {
    return existing
  }
  await dismissTransientSurfaces(page)
  await ensureRootRepository(page, fixturePath)
  await activate(repositoryRailTab(page, 'Tools'), keyboardOnly)
  const tools = page.locator('main.repository-tools')
  await tools.waitFor({ state: 'visible', timeout: 30_000 })
  const search = tools.locator('input[aria-label="Search tools"]')
  if (await search.isVisible().catch(() => false)) {
    await search.fill('')
  }
  const allCategory = tools.locator(
    '.repository-tools-filter-chip[data-category="All"]'
  )
  if (await allCategory.isVisible().catch(() => false)) {
    await activate(allCategory, keyboardOnly)
  }
  const entry = tools.locator('[data-hub-tool="submodule-manager"]')
  await entry.waitFor({ state: 'visible', timeout: 30_000 })
  await activate(entry, keyboardOnly)
  const open = tools.getByRole('button', { name: /Open submodule manager/i })
  await open.waitFor({ state: 'visible', timeout: 15_000 })
  await activate(open, keyboardOnly)
  await existing.waitFor({ state: 'visible', timeout: 30_000 })
  await existing.locator('.submodule-row').first().waitFor({
    state: 'visible',
    timeout: 30_000,
  })
  return existing
}

async function managerRows(manager) {
  const rows = await manager.locator('.submodule-row').all()
  const classified = []
  for (const row of rows) {
    const rowPath = (
      (await row.locator('.submodule-row-path').textContent()) ?? ''
    ).trim()
    const open = row.locator('.submodule-open-repository')
    const uninitialized =
      (await row.locator('.submodule-status-uninitialized').count()) === 1
    classified.push({ row, rowPath, open, uninitialized })
  }
  return classified
}

async function tooltipText(page, target) {
  await target.hover()
  const tooltip = page.locator('.tooltip:visible').last()
  await tooltip.waitFor({ state: 'visible', timeout: 5_000 })
  const text = ((await tooltip.textContent()) ?? '').replace(/\s+/g, ' ').trim()
  await page.mouse.move(1, 1)
  await tooltip
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => undefined)
  return text
}

async function inspectManager(manager) {
  const rows = await managerRows(manager)
  const checked = rows.filter(row => !row.uninitialized)
  const uninitialized = rows.filter(row => row.uninitialized)
  if (checked.length < 1 || uninitialized.length < 1) {
    fail('The fixture must expose checked-out and uninitialized submodules.')
  }
  for (const item of checked) {
    if ((await item.open.getAttribute('aria-disabled')) === 'true') {
      fail('A checked-out submodule cannot be opened.')
    }
    if (!(await item.open.getAttribute('aria-label'))?.trim()) {
      fail('A checked-out Open as repository action lacks an accessible name.')
    }
  }
  for (const item of uninitialized) {
    if ((await item.open.getAttribute('aria-disabled')) !== 'true') {
      fail('An uninitialized submodule Open as repository action is enabled.')
    }
    if (!(await item.open.getAttribute('aria-label'))?.trim()) {
      fail('An unavailable Open as repository action lacks an accessible name.')
    }
    if ((await tooltipText(manager.page(), item.open)).length === 0) {
      fail('An unavailable Open as repository action lacks its explanation.')
    }
  }
  const search = manager.getByRole('textbox', { name: 'Search submodules' })
  const filters = manager.getByRole('group', {
    name: 'Filter submodules by status',
  })
  if (!(await search.isVisible()) || !(await filters.isVisible())) {
    fail('The manager search or status filters are not reachable.')
  }
  await search.focus()
  await search.press('Tab')
  const keyboardStayedInside = await manager.evaluate(element =>
    element.contains(document.activeElement)
  )
  if (!keyboardStayedInside) {
    fail('Keyboard traversal escaped the Submodule Manager unexpectedly.')
  }
  const surface = await inspectSurface(
    manager.page(),
    '#submodule-manager .submodules-settings'
  )
  assertBoundedSurface(surface, 'Submodule Manager')
  return {
    rows,
    checked,
    uninitialized,
    surface,
  }
}

async function openCheckedOutChild(
  page,
  fixturePath,
  expectedPath = null,
  keyboardOnly = false
) {
  const manager = await openSubmoduleManager(page, fixturePath, keyboardOnly)
  const rows = await managerRows(manager)
  const checked = rows.filter(row => !row.uninitialized)
  const target =
    checked.find(row => row.rowPath === expectedPath) ?? checked.at(0)
  if (target === undefined) {
    fail('No checked-out submodule is available to open.')
  }
  await activate(target.open, keyboardOnly)
  const context = page.locator('.submodule-repository-context')
  await context.waitFor({ state: 'visible', timeout: 30_000 })
  await manager.waitFor({ state: 'hidden', timeout: 30_000 })
  return { context, rowPath: target.rowPath }
}

async function inspectContext(page, parentName) {
  return page.evaluate(expectedParent => {
    const context = document.querySelector('.submodule-repository-context')
    const back = context?.querySelector('.submodule-context-back')
    const label = context?.querySelector('.submodule-context-back-label')
    if (!(context instanceof HTMLElement) || !(back instanceof HTMLElement)) {
      return null
    }
    const rect = context.getBoundingClientRect()
    const backRect = back.getBoundingClientRect()
    const accessibleName = back.getAttribute('aria-label') ?? ''
    const text = label?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const description = context.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return {
      parentNamed:
        accessibleName.includes(expectedParent) &&
        description.includes(expectedParent),
      accessibleNamePresent: accessibleName.trim().length > 0,
      labelPresent: text.length > 0,
      accessibleName,
      text,
      description,
      className: back.className,
      focused: document.activeElement === back,
      withinViewport:
        rect.left >= -1 &&
        rect.top >= -1 &&
        rect.right <= innerWidth + 1 &&
        rect.bottom <= innerHeight + 1,
      noHorizontalOverflow:
        context.scrollWidth <= context.clientWidth + 1 &&
        back.scrollWidth <= back.clientWidth + 1,
      hitTarget: {
        width: Math.round(backRect.width),
        height: Math.round(backRect.height),
      },
    }
  }, parentName)
}

function assertContext(receipt, label) {
  if (
    receipt === null ||
    !receipt.parentNamed ||
    !receipt.accessibleNamePresent ||
    !receipt.withinViewport ||
    !receipt.noHorizontalOverflow ||
    receipt.hitTarget.width < 32 ||
    receipt.hitTarget.height < 32
  ) {
    fail(`${label} failed the temporary-context navigation gate.`)
  }
}

async function openAppearance(page) {
  if (
    !(await page
      .locator('#preferences')
      .isVisible()
      .catch(() => false))
  ) {
    await menuEvent(page, 'show-preferences')
    await page.locator('#preferences').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
  }
  const section = page.locator('.appearance-language-navigation')
  if (!(await section.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
  }
  await section.waitFor({ state: 'visible', timeout: 15_000 })
  await section.evaluate(element => element.scrollIntoView({ block: 'center' }))
  return section
}

async function savePreferences(page) {
  const preferences = page.locator('#preferences')
  await preferences.getByRole('button', { name: 'Save', exact: true }).click()
  await preferences.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function cancelPreferences(page) {
  const preferences = page.locator('#preferences')
  await preferences.getByRole('button', { name: 'Cancel', exact: true }).click()
  await preferences.waitFor({ state: 'hidden', timeout: 15_000 })
}

async function setAppearanceChoices(page, choices) {
  const section = await openAppearance(page)
  for (const [name, value] of Object.entries(choices)) {
    const select = section.locator(`select[name="${name}"]`)
    await select.selectOption(value)
    await page.waitForFunction(
      ({ attribute, expected }) =>
        document.body.getAttribute(attribute) === expected,
      {
        attribute:
          name === 'languageMode'
            ? 'data-dm-language-mode'
            : name === 'submoduleBackButtonStyle'
            ? 'data-dm-submodule-back-style'
            : 'data-dm-submodule-back-label',
        expected: value,
      }
    )
  }
  return section
}

async function testLegacyAppearanceFallback(page, fixturePath) {
  const original = await page.evaluate(
    key => localStorage.getItem(key),
    AppearanceStorageKey
  )
  if (original === null) {
    fail('The normalized appearance profile has not been persisted.')
  }
  await page.evaluate(
    ({ key, serialized }) => {
      const parsed = JSON.parse(serialized)
      parsed.languageMode = 'legacy-language'
      parsed.submoduleBackButtonStyle = 'legacy-bevel'
      parsed.submoduleBackButtonLabel = 'legacy-caption'
      localStorage.setItem(key, JSON.stringify(parsed))
    },
    { key: AppearanceStorageKey, serialized: original }
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  const fallback = await page.evaluate(() => ({
    language: document.body.getAttribute('data-dm-language-mode'),
    style: document.body.getAttribute('data-dm-submodule-back-style'),
    label: document.body.getAttribute('data-dm-submodule-back-label'),
  }))
  if (
    fallback.language !== 'english' ||
    fallback.style !== 'tonal' ||
    fallback.label !== 'back-to-parent'
  ) {
    fail('Legacy appearance values did not normalize to safe defaults.')
  }
  await page.evaluate(
    ({ key, serialized }) => localStorage.setItem(key, serialized),
    { key: AppearanceStorageKey, serialized: original }
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await ensureRootRepository(page, fixturePath)
  return true
}

async function pass1(page, state, options) {
  await initializeProfile(page)
  await waitForApp(page)
  await dismissTransientSurfaces(page)
  await ensureRootRepository(page, options.fixturePath)
  const parentName = await currentRepositoryName(page)
  if (parentName !== path.basename(options.fixturePath)) {
    fail('The fresh launch did not select the owned fixture repository.')
  }
  const persistentCount = await persistentRepositoryCount(page)
  const tabs = await repositoryTabCount(page)
  const document = await assertUsableDocument(page, 'Pass 1')
  const railCount = await page
    .locator('nav.repository-rail [role="tab"]')
    .count()
  if (railCount < 3 || tabs < 1) {
    fail('The fresh workspace navigation did not render.')
  }
  return {
    checks: {
      fixtureSelected: true,
      persistentCount,
      repositoryTabCount: tabs,
      railCount,
      document,
    },
    statePatch: {
      parentName,
      persistentRepositoryCount: persistentCount,
      repositoryTabCount: tabs,
    },
    externalRequired: ['original-resolution pixel/privacy inspection'],
  }
}

async function pass2(page, state, options) {
  await waitForApp(page)
  await dismissTransientSurfaces(page)
  await ensureRootRepository(page, options.fixturePath)
  const persistentCount = await persistentRepositoryCount(page)
  const manager = await openSubmoduleManager(page, options.fixturePath)
  const result = await inspectManager(manager)
  if (persistentCount !== state.persistentRepositoryCount) {
    fail(
      `The persistent repository count changed before the Submodule Manager check (expected ${state.persistentRepositoryCount}, received ${persistentCount}).`
    )
  }
  return {
    checks: {
      rowCount: result.rows.length,
      checkedOutCount: result.checked.length,
      uninitializedCount: result.uninitialized.length,
      keyboardStayedInside: true,
      persistentCountStable: true,
      namedInteractiveCount: result.surface.interactiveCount,
    },
    statePatch: {
      checkedOutPath: result.checked[0].rowPath,
      uninitializedPath: result.uninitialized[0].rowPath,
    },
    externalRequired: ['original-resolution pixel/privacy inspection'],
  }
}

async function pass3(page, state, options) {
  await waitForApp(page)
  const beforeCount = state.persistentRepositoryCount
  const beforeTabs = await repositoryTabCount(page)
  const opened = await openCheckedOutChild(
    page,
    options.fixturePath,
    state.checkedOutPath
  )
  const context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 3')
  const current = await currentRepositoryName(page)
  const afterCount = await persistentRepositoryCount(page)
  const afterTabs = await repositoryTabCount(page)
  if (
    current === state.parentName ||
    beforeCount !== state.persistentRepositoryCount ||
    afterCount !== beforeCount ||
    afterTabs !== beforeTabs
  ) {
    fail('Temporary child navigation polluted persistent repository state.')
  }
  for (const name of ['Changes', 'History']) {
    await repositoryRailTab(page, name).waitFor()
  }
  const branchControl = page.locator('[data-toolbar-item-id="branch"]')
  await branchControl.locator('.branch-toolbar-button').waitFor({
    state: 'visible',
    timeout: 30_000,
  })
  const branchNamed =
    ((await branchControl.textContent().catch(() => '')) ?? '').trim().length >
    0
  if (!branchNamed) {
    fail('The temporary child did not expose a branch/worktree control.')
  }
  return {
    checks: {
      childIdentityDistinct: true,
      parentLabelledBack: true,
      backInitiallyFocused: context.focused,
      branchSurfacePresent: true,
      persistentCountStable: true,
      repositoryTabCountStable: true,
    },
    statePatch: { checkedOutPath: opened.rowPath },
    externalRequired: [
      'repository database hash before/after child open',
      'Git CLI proof that HEAD/worktree operations resolve inside child',
      'original-resolution pixel/privacy inspection',
    ],
  }
}

async function pass4(page, state) {
  await waitForApp(page)
  const context = page.locator('.submodule-repository-context')
  if (!(await context.isVisible().catch(() => false))) {
    fail('Pass 4 requires the child context left by pass 3.')
  }
  await context.locator('.submodule-context-back').click()
  await context.waitFor({ state: 'hidden', timeout: 30_000 })
  await repositoryDropdown(page)
    .locator('.title')
    .filter({ hasText: state.parentName })
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(100)
  const toolsSelected =
    (await repositoryRailTab(page, 'Tools').getAttribute('aria-selected')) ===
    'true'
  const dropdownFocused = await repositoryDropdown(page)
    .locator('.toolbar-button > button')
    .evaluate(button => button === document.activeElement)
  const count = await persistentRepositoryCount(page)
  const tabs = await repositoryTabCount(page)
  if (
    !toolsSelected ||
    !dropdownFocused ||
    count !== state.persistentRepositoryCount ||
    tabs !== state.repositoryTabCount
  ) {
    fail('Back did not restore the exact parent workspace continuity.')
  }
  return {
    checks: {
      parentRestored: true,
      toolsSectionRestored: true,
      repositoryDropdownFocused: true,
      persistentCountStable: true,
      repositoryTabCountStable: true,
    },
    externalRequired: [
      'fixture-controller child HEAD mutation and post-Back Git proof',
      'original-resolution pixel/privacy inspection',
    ],
  }
}

async function pass5(page, state, options, rendererTimeOrigin) {
  await waitForApp(page)
  if (rendererTimeOrigin === state.rendererTimeOrigin) {
    fail('Pass 5 requires a caller-controlled renderer restart after pass 4.')
  }
  if (await page.locator('.submodule-repository-context').isVisible()) {
    fail('A temporary submodule context was restored across restart.')
  }
  if ((await currentRepositoryName(page)) !== state.parentName) {
    fail('The restart did not restore the persisted parent repository.')
  }
  const countAfterRestart = await persistentRepositoryCount(page)
  const tabsAfterRestart = await repositoryTabCount(page)
  if (
    countAfterRestart !== state.persistentRepositoryCount ||
    tabsAfterRestart !== state.repositoryTabCount
  ) {
    fail('Restart polluted the repository list or repository tabs.')
  }
  await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)
  const tabsInChild = await repositoryTabCount(page)
  const rootTab = page.locator('.repository-tab[role="tab"]').first()
  await rootTab.click()
  await page
    .locator('.submodule-repository-context')
    .waitFor({ state: 'hidden', timeout: 30_000 })
  if ((await currentRepositoryName(page)) !== state.parentName) {
    fail('Selecting the persisted repository tab did not leave the child.')
  }
  await repositoryRailTab(page, 'Changes').waitFor({
    state: 'visible',
    timeout: 60_000,
  })
  await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)
  const context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 5')
  if (tabsInChild !== tabsAfterRestart) {
    fail('Opening the child created a repository tab.')
  }
  return {
    checks: {
      newRendererObserved: true,
      temporaryContextNotRestored: true,
      parentRestored: true,
      rootTabLeavesChild: true,
      childCreatesNoTab: true,
      parentLinkageRestored: true,
    },
    externalRequired: [
      'saved PID/HWND restart and cleanup ledger proof',
      'repository database hash across process restart',
      'original-resolution pixel/privacy inspection',
    ],
  }
}

async function pass6(page, state, options) {
  await waitForApp(page)
  await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)

  // Cause the profile to be materialized through the real UI before testing
  // how a future/legacy value normalizes on the next renderer load.
  await setAppearanceChoices(page, {
    submoduleBackButtonStyle: 'outlined',
    submoduleBackButtonLabel: 'icon-only',
  })
  await savePreferences(page)
  await testLegacyAppearanceFallback(page, options.fixturePath)
  await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)

  await setAppearanceChoices(page, {
    submoduleBackButtonStyle: 'filled',
    submoduleBackButtonLabel: 'parent-name',
  })
  let context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 6 live preview')
  if (
    !context.className.includes('submodule-context-back-filled') ||
    !context.labelPresent
  ) {
    fail('The filled/parent-name Back preview did not apply live.')
  }
  await savePreferences(page)

  await setAppearanceChoices(page, {
    submoduleBackButtonStyle: 'outlined',
    submoduleBackButtonLabel: 'icon-only',
  })
  context = await inspectContext(page, state.parentName)
  if (
    context === null ||
    !context.className.includes('submodule-context-back-outlined') ||
    context.labelPresent
  ) {
    fail('The outlined/icon-only Back preview did not apply live.')
  }
  await cancelPreferences(page)
  context = await inspectContext(page, state.parentName)
  if (
    context === null ||
    !context.className.includes('submodule-context-back-filled') ||
    !context.labelPresent
  ) {
    fail('Cancel did not roll the Back presentation back to the saved values.')
  }

  const section = await openAppearance(page)
  const persistedValues = {
    style: await section
      .locator('select[name="submoduleBackButtonStyle"]')
      .inputValue(),
    label: await section
      .locator('select[name="submoduleBackButtonLabel"]')
      .inputValue(),
  }
  if (
    persistedValues.style !== 'filled' ||
    persistedValues.label !== 'parent-name'
  ) {
    fail('Saved Back customization did not reopen consistently.')
  }
  const surface = await inspectSurface(
    page,
    '#preferences .appearance-language-navigation'
  )
  assertBoundedSurface(surface, 'Appearance language/navigation section')
  return {
    checks: {
      legacyFallback: true,
      livePreview: true,
      savePersisted: true,
      cancelRolledBack: true,
      style: persistedValues.style,
      label: persistedValues.label,
      namedInteractiveCount: surface.interactiveCount,
    },
    externalRequired: [
      'profile Git history commit/restore proof',
      'original-resolution pixel/privacy inspection',
    ],
  }
}

async function pass7(page, state, options) {
  await waitForApp(page)
  if (
    await page
      .locator('#preferences')
      .isVisible()
      .catch(() => false)
  ) {
    await savePreferences(page)
  }
  if (!(await page.locator('.submodule-repository-context').isVisible())) {
    await openCheckedOutChild(
      page,
      options.fixturePath,
      state.checkedOutPath,
      true
    )
  }
  const context = page.locator('.submodule-repository-context')
  const back = context.locator('.submodule-context-back')
  await back.focus()
  if ((await back.getAttribute('aria-label'))?.trim().length === 0) {
    fail('The compact Back action has no screen-reader name.')
  }
  await back.press('Enter')
  await context.waitFor({ state: 'hidden', timeout: 30_000 })
  await repositoryRailTab(page, 'Tools').focus()
  await repositoryRailTab(page, 'Tools').press('Enter')
  await openCheckedOutChild(
    page,
    options.fixturePath,
    state.checkedOutPath,
    true
  )
  const compact = await inspectContext(page, state.parentName)
  assertContext(compact, 'Pass 7 compact keyboard context')
  await page.locator('.submodule-context-back').focus()
  const document = await assertUsableDocument(page, 'Pass 7')
  return {
    checks: {
      keyboardBackActivated: true,
      keyboardChildFlowCompleted: true,
      accessibleNamePresent: true,
      contextWithinViewport: true,
      contextNoOverflow: true,
      hitTargetWidth: compact.hitTarget.width,
      hitTargetHeight: compact.hitTarget.height,
      document,
    },
    externalRequired: ['original-resolution compact pixel/privacy inspection'],
  }
}

async function pass8(page, state, options) {
  await waitForApp(page)
  if (!(await page.locator('.submodule-repository-context').isVisible())) {
    await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)
  }
  const toggle = page.getByRole('button', { name: 'Toggle theme', exact: true })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (
      await page.evaluate(() => document.body.classList.contains('theme-dark'))
    ) {
      break
    }
    await toggle.click()
    await page.waitForTimeout(250)
  }
  if (
    !(await page.evaluate(() => document.body.classList.contains('theme-dark')))
  ) {
    fail('Dark theme did not apply.')
  }

  await openAppearance(page)
  const autoFit = page.getByRole('checkbox', {
    name: /^Automatically shrink the interface to fit small windows/,
  })
  if (!(await autoFit.isChecked())) {
    await autoFit.check()
  }
  await savePreferences(page)
  await menuEvent(page, 'zoom-reset')
  for (let index = 0; index < 5; index++) {
    await menuEvent(page, 'zoom-in')
  }
  const scale = await page.evaluate(() => ({
    effective: require('electron').webFrame.getZoomFactor(),
    base: Number(localStorage.getItem('zoom-factor')),
    autoFit: localStorage.getItem('zoom-auto-fit-enabled'),
  }))
  if (
    !Number.isFinite(scale.effective) ||
    scale.effective <= 0 ||
    !Number.isFinite(scale.base) ||
    scale.base < 1.99 ||
    scale.autoFit !== '1'
  ) {
    fail('The 200%/auto-fit scaling request was not retained safely.')
  }
  const context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 8 dark/scaled context')
  const document = await assertUsableDocument(page, 'Pass 8')
  return {
    checks: {
      darkTheme: true,
      requestedScale200Percent: true,
      effectiveScalePositive: true,
      autoFitEnabled: true,
      parentIdentityStable: true,
      contextNoOverflow: true,
      document,
    },
    externalRequired: [
      'original-resolution dark/scale contrast and alignment inspection',
    ],
  }
}

function languageShape(mode, value) {
  if (mode === 'english') {
    return /Back to|Open as repository/.test(value) && !value.includes(' · ')
  }
  if (mode === 'cantonese') {
    return /返去|當獨立 repo 打開/.test(value) && !value.includes(' · ')
  }
  return value.includes(' · ') && /Back to|Open as repository/.test(value)
}

function unavailableLanguageShape(mode, value) {
  if (mode === 'english') {
    return /Clone this submodule/.test(value) && !value.includes(' · ')
  }
  if (mode === 'cantonese') {
    return /複製呢個子模組/.test(value) && !value.includes(' · ')
  }
  return (
    value.includes(' · ') &&
    /Clone this submodule/.test(value) &&
    /複製呢個子模組/.test(value)
  )
}

async function setLanguageAndReopenChild(page, state, options, mode) {
  if (await page.locator('.submodule-repository-context').isVisible()) {
    await page.locator('.submodule-context-back').click()
    await page
      .locator('.submodule-repository-context')
      .waitFor({ state: 'hidden', timeout: 30_000 })
  }
  await setAppearanceChoices(page, { languageMode: mode })
  await savePreferences(page)
  if (
    (await page.evaluate(() =>
      document.body.getAttribute('data-dm-language-mode')
    )) !== mode
  ) {
    fail(`Language mode ${mode} did not apply.`)
  }
  const manager = await openSubmoduleManager(page, options.fixturePath)
  const rows = await managerRows(manager)
  const checked = rows.find(row => !row.uninitialized)
  const unavailable = rows.find(row => row.uninitialized)
  if (checked === undefined || unavailable === undefined) {
    fail('The language sweep lost the deterministic manager rows.')
  }
  const openText = ((await checked.open.textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const unavailableCopy = await tooltipText(page, unavailable.open)
  if (
    !languageShape(mode, openText) ||
    !unavailableLanguageShape(mode, unavailableCopy)
  ) {
    fail(`Manager copy did not render safely in ${mode}.`)
  }
  await checked.open.click()
  await page
    .locator('.submodule-repository-context')
    .waitFor({ state: 'visible', timeout: 30_000 })
  const context = await inspectContext(page, state.parentName)
  assertContext(context, `Pass 9 ${mode}`)
  if (!languageShape(mode, context.accessibleName)) {
    fail(`Back copy did not render safely in ${mode}.`)
  }
  return true
}

async function pass9(page, state, options) {
  await waitForApp(page)
  await menuEvent(page, 'zoom-reset')
  for (let attempt = 0; attempt < 3; attempt++) {
    if (
      await page.evaluate(() => document.body.classList.contains('theme-light'))
    ) {
      break
    }
    await page
      .getByRole('button', { name: 'Toggle theme', exact: true })
      .click()
    await page.waitForTimeout(200)
  }
  for (const mode of ['english', 'cantonese', 'bilingual']) {
    await setLanguageAndReopenChild(page, state, options, mode)
  }
  const section = await openAppearance(page)
  const persisted = await section
    .locator('select[name="languageMode"]')
    .inputValue()
  await savePreferences(page)
  if (persisted !== 'bilingual') {
    fail('The bilingual language choice did not persist on reopen.')
  }
  if (!(await page.locator('.submodule-repository-context').isVisible())) {
    await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)
  }
  const context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 9 final bilingual compact context')
  if (!languageShape('bilingual', context.accessibleName)) {
    fail('The final compact Back action is not bilingual.')
  }
  const document = await assertUsableDocument(page, 'Pass 9')
  return {
    checks: {
      english: true,
      cantonese: true,
      bilingual: true,
      persistedBilingual: true,
      unavailableCopyNamedInEveryMode: true,
      compactBilingualNoOverflow: true,
      document,
    },
    externalRequired: [
      'stale-child failure injection for localized open-error copy',
      'original-resolution three-language pixel/privacy inspection',
    ],
  }
}

async function visitRailSection(page, label) {
  const tab = repositoryRailTab(page, label)
  if ((await tab.count()) === 0) {
    return { available: false, rendered: false }
  }
  await tab.click()
  await page.waitForTimeout(500)
  const selected = (await tab.getAttribute('aria-selected')) === 'true'
  if (!selected) {
    fail(`${label} did not become the selected repository surface.`)
  }
  await assertUsableDocument(page, `Pass 10 ${label}`)
  return { available: true, rendered: true }
}

async function pass10(page, state, options) {
  await waitForApp(page)
  await dismissTransientSurfaces(page)
  if (await page.locator('.submodule-repository-context').isVisible()) {
    await page.locator('.submodule-context-back').click()
    await page
      .locator('.submodule-repository-context')
      .waitFor({ state: 'hidden', timeout: 30_000 })
  }
  await setAppearanceChoices(page, { languageMode: 'english' })
  await savePreferences(page)
  const surfaces = {}
  for (const label of ['Changes', 'History', 'Actions', 'Releases', 'Tools']) {
    surfaces[label.toLowerCase()] = await visitRailSection(page, label)
  }

  const notifications = page.getByRole('button', { name: /^Notifications/ })
  if ((await notifications.count()) !== 1) {
    fail('The notification-centre control is missing.')
  }
  await notifications.click()
  const notificationSurface = page.locator('.notification-centre-panel')
  const notificationRendered = await notificationSurface
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!notificationRendered) {
    fail('The notification centre did not render.')
  }
  await notificationSurface.locator('.notification-centre-close').click()
  await notificationSurface.waitFor({ state: 'hidden', timeout: 10_000 })

  const appearance = await openAppearance(page)
  if (!(await appearance.isVisible())) {
    fail('Settings → Appearance did not render.')
  }
  await cancelPreferences(page)
  await openCheckedOutChild(page, options.fixturePath, state.checkedOutPath)
  const context = await inspectContext(page, state.parentName)
  assertContext(context, 'Pass 10 final child context')
  const countInChild = await persistentRepositoryCount(page)
  await page.locator('.submodule-context-back').click()
  await page
    .locator('.submodule-repository-context')
    .waitFor({ state: 'hidden', timeout: 30_000 })
  const countAtParent = await persistentRepositoryCount(page)
  if (
    countInChild !== state.persistentRepositoryCount ||
    countAtParent !== state.persistentRepositoryCount
  ) {
    fail('The regression sweep changed the persistent repository list.')
  }
  await dismissTransientSurfaces(page)
  await page.mouse.move(1, 1)
  const document = await assertUsableDocument(page, 'Pass 10 final parent')
  const externalRequired = [
    'original-resolution final pixel/privacy inspection',
  ]
  if (!surfaces.actions.available || !surfaces.releases.available) {
    externalRequired.push(
      'provider-backed Actions/Releases sweep with the synthetic provider fixture'
    )
  }
  return {
    checks: {
      changes: surfaces.changes.rendered,
      history: surfaces.history.rendered,
      actions: surfaces.actions.rendered,
      releases: surfaces.releases.rendered,
      tools: surfaces.tools.rendered,
      notifications: true,
      settingsAppearance: true,
      finalChildParentRoundTrip: true,
      persistentCountStable: true,
      document,
    },
    externalRequired,
  }
}

const PassHandlers = Object.freeze({
  1: pass1,
  2: pass2,
  3: pass3,
  4: pass4,
  5: pass5,
  6: pass6,
  7: pass7,
  8: pass8,
  9: pass9,
  10: pass10,
})

function viewportForPass(pass) {
  if (pass === 7 || pass === 9) {
    return { width: 700, height: 650 }
  }
  if (pass === 8) {
    return { width: 640, height: 480 }
  }
  return { width: 1440, height: 960 }
}

function inspectPNG(file) {
  const buffer = fs.readFileSync(file)
  const signature = '89504e470d0a1a0a'
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== signature
  ) {
    fail('The pass capture is not a valid PNG.')
  }
  return {
    bytes: buffer.length,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const state = readState(options)
  assertPassOrder(state, options.pass)
  const browser = await connect(options.port)
  const page = await getRenderer(browser)
  const session = await page.context().newCDPSession(page)
  const viewport = viewportForPass(options.pass)
  let receipt
  try {
    await setViewport(session, viewport.width, viewport.height)
    // Gallery captures temporarily suppress hover help. A prior capture run
    // must never change the semantics exercised by this verifier.
    await page.evaluate(() =>
      document.getElementById('gallery-tooltip-suppressor')?.remove()
    )
    const rendererTimeOrigin = await page.evaluate(() => performance.timeOrigin)
    const result = await PassHandlers[options.pass](
      page,
      state,
      options,
      rendererTimeOrigin
    )
    await page.waitForTimeout(250)
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    })
    fs.writeFileSync(options.capture, Buffer.from(shot.data, 'base64'), {
      flag: 'wx',
    })
    const capture = inspectPNG(options.capture)
    if (
      capture.bytes < 20_000 ||
      capture.width !== viewport.width ||
      capture.height !== viewport.height
    ) {
      fail('The pass capture is blank-sized or has unexpected dimensions.')
    }

    const nextState = {
      ...state,
      ...(result.statePatch ?? {}),
      lastCompletedPass: options.pass,
      rendererTimeOrigin,
      captures: [
        ...state.captures,
        {
          pass: options.pass,
          file: path.basename(options.capture),
          bytes: capture.bytes,
          width: capture.width,
          height: capture.height,
        },
      ],
    }
    writeState(options, nextState)
    receipt = {
      schemaVersion: 1,
      pass: options.pass,
      status: 'passed',
      coverage: TEN_PASS_COVERAGE[options.pass],
      capture: {
        file: path.basename(options.capture),
        ...capture,
      },
      checks: result.checks,
      state: { lastCompletedPass: nextState.lastCompletedPass },
      externalRequired: result.externalRequired ?? [],
    }
  } finally {
    await session
      .send('Emulation.clearDeviceMetricsOverride')
      .catch(() => undefined)
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
  process.exit(0)
}

module.exports = {
  TEN_PASS_COVERAGE,
  isContainedPath,
  parseArguments,
  readState,
  viewportForPass,
  writeState,
}

if (require.main === module) {
  main().catch(error => {
    const passIndex = process.argv.indexOf('--pass')
    const parsedPass = Number(process.argv[passIndex + 1])
    const message = String(error?.message ?? error)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 400)
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        pass:
          Number.isSafeInteger(parsedPass) &&
          parsedPass >= 1 &&
          parsedPass <= 10
            ? parsedPass
            : null,
        status: 'failed',
        error: { code: 'verification-failed', message },
      })}\n`
    )
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exit(1)
  })
}
