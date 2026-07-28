'use strict'

const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')

const RepositoryRoot = path.resolve(__dirname, '..', '..')
const SiteRoot = path.join(RepositoryRoot, 'site')
const PageName = 'cheap-lfs.html'
const WideViewport = { width: 1440, height: 960 }
const NarrowViewport = { width: 390, height: 844 }
const ExpectedComparisonMinimum = 30

const report = {
  schemaVersion: 1,
  helper: path.resolve(__filename),
  repositoryRoot: RepositoryRoot,
  siteRoot: SiteRoot,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  passed: false,
  runDirectory: null,
  pageUrl: null,
  chrome: {
    launchMode: null,
    executablePath: null,
    headless: true,
  },
  pids: {
    helper: process.pid,
    server: null,
    browser: null,
  },
  server: {
    host: '127.0.0.1',
    port: null,
    requests: 0,
    responsesByStatus: {},
  },
  captures: {},
  phases: [],
  checks: [],
  errors: {
    console: [],
    page: [],
    requests: [],
    http: [],
    phases: [],
    fatal: [],
    cleanup: [],
  },
  cleanup: {
    browserClosed: false,
    serverClosed: false,
    runDirectoryRetained: true,
  },
}

let server = null
let browser = null

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    }
  }

  return {
    name: 'NonError',
    message: String(error),
    stack: null,
  }
}

function recordCheck(name, passed, details = {}) {
  report.checks.push({
    name,
    passed: Boolean(passed),
    details,
  })
}

async function runPhase(name, action) {
  const phase = {
    name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    passed: false,
  }
  report.phases.push(phase)

  try {
    await action()
    phase.passed = true
  } catch (error) {
    report.errors.phases.push({
      phase: name,
      ...serializeError(error),
    })
  } finally {
    phase.finishedAt = new Date().toISOString()
  }
}

function chromeCandidates() {
  const candidates = []
  const add = candidate => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  add(process.env.CHROME_PATH)
  add(
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      )
  )
  add(
    process.env['PROGRAMFILES(X86)'] &&
      path.join(
        process.env['PROGRAMFILES(X86)'],
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      )
  )
  add(
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      )
  )

  return candidates
}

function findInstalledChrome() {
  return chromeCandidates().find(candidate => fs.existsSync(candidate)) ?? null
}

const MimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function resolveRequestPath(requestUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(
      new URL(requestUrl, 'http://127.0.0.1').pathname
    )
  } catch {
    return null
  }

  const relative = pathname === '/' ? PageName : pathname.replace(/^[/\\]+/, '')
  const normalized = relative.replaceAll('/', path.sep)
  const servesRepositoryAsset = relative.startsWith('docs/assets/screenshots/')
  const base = servesRepositoryAsset ? RepositoryRoot : SiteRoot
  const candidate = path.resolve(base, normalized)

  return isInside(base, candidate) ? candidate : null
}

function countStatus(status) {
  const key = String(status)
  report.server.responsesByStatus[key] =
    (report.server.responsesByStatus[key] ?? 0) + 1
}

async function serveRequest(request, response) {
  report.server.requests += 1

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    countStatus(405)
    response.writeHead(405, {
      'content-type': 'text/plain; charset=utf-8',
      allow: 'GET, HEAD',
    })
    response.end('Method not allowed')
    return
  }

  const filePath = resolveRequestPath(request.url ?? '/')
  if (filePath === null) {
    countStatus(400)
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Invalid path')
    return
  }

  try {
    const stat = await fsp.stat(filePath)
    if (!stat.isFile()) {
      throw new Error('Not a regular file')
    }

    const contentType =
      MimeTypes.get(path.extname(filePath).toLowerCase()) ??
      'application/octet-stream'
    countStatus(200)
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': stat.size,
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
    })

    if (request.method === 'HEAD') {
      response.end()
      return
    }

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
      stream.on('error', reject)
      response.on('close', resolve)
      response.on('finish', resolve)
      stream.pipe(response)
    })
  } catch (error) {
    if (!response.headersSent) {
      countStatus(404)
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
    report.errors.http.push({
      requestUrl: request.url ?? null,
      filePath,
      ...serializeError(error),
    })
  }
}

async function startStaticServer() {
  const ownedServer = http.createServer((request, response) => {
    serveRequest(request, response).catch(error => {
      report.errors.http.push({
        requestUrl: request.url ?? null,
        ...serializeError(error),
      })
      if (!response.headersSent) {
        countStatus(500)
        response.writeHead(500, {
          'content-type': 'text/plain; charset=utf-8',
        })
      }
      response.end('Internal server error')
    })
  })

  await new Promise((resolve, reject) => {
    ownedServer.once('error', reject)
    ownedServer.listen(0, '127.0.0.1', resolve)
  })

  const address = ownedServer.address()
  if (address === null || typeof address === 'string') {
    throw new Error('The owned static server did not expose a TCP address.')
  }

  report.server.port = address.port
  report.pids.server = process.pid
  report.pageUrl = `http://127.0.0.1:${address.port}/${PageName}`
  return ownedServer
}

async function closeStaticServer(ownedServer) {
  if (ownedServer === null || !ownedServer.listening) {
    report.cleanup.serverClosed = true
    return
  }

  if (typeof ownedServer.closeAllConnections === 'function') {
    ownedServer.closeAllConnections()
  }

  await new Promise((resolve, reject) => {
    ownedServer.close(error => (error ? reject(error) : resolve()))
  })
  report.cleanup.serverClosed = true
}

function attachPageDiagnostics(page) {
  page.on('console', message => {
    if (message.type() === 'error') {
      report.errors.console.push({
        type: message.type(),
        text: message.text(),
        location: message.location(),
      })
    }
  })

  page.on('pageerror', error => {
    report.errors.page.push(serializeError(error))
  })

  page.on('requestfailed', request => {
    report.errors.requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure(),
    })
  })

  page.on('response', response => {
    if (response.status() >= 400) {
      report.errors.http.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      })
    }
  })
}

async function navigate(page, hash = '') {
  await page.goto(`${report.pageUrl}${hash}`, {
    waitUntil: 'load',
    timeout: 30_000,
  })
  await page.waitForFunction(() => document.readyState === 'complete')
}

async function loadEveryImage(page) {
  await page.evaluate(async () => {
    const pause = milliseconds =>
      new Promise(resolve => window.setTimeout(resolve, milliseconds))
    const step = Math.max(280, Math.floor(window.innerHeight * 0.72))
    let position = 0

    while (position < document.documentElement.scrollHeight) {
      window.scrollTo(0, position)
      await pause(35)
      position += step
    }

    window.scrollTo(0, document.documentElement.scrollHeight)
    await pause(120)
  })

  await page.waitForFunction(
    () => [...document.images].every(image => image.complete),
    null,
    { timeout: 30_000 }
  )

  const images = await page.evaluate(() =>
    [...document.images].map(image => ({
      src: image.getAttribute('src'),
      currentSrc: image.currentSrc,
      alt: image.getAttribute('alt'),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  return images
}

async function documentOverflow(page) {
  return page.evaluate(() => {
    const documentElement = document.documentElement
    const body = document.body
    const viewportWidth = documentElement.clientWidth
    const scrollWidth = Math.max(
      documentElement.scrollWidth,
      body?.scrollWidth ?? 0
    )
    const offenders = Array.from(document.querySelectorAll('body *'))
      .map(element => {
        const rect = element.getBoundingClientRect()
        return {
          element:
            element.id || element.className || element.tagName.toLowerCase(),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        }
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > viewportWidth + 1)
      )
      .sort(
        (first, second) =>
          Math.abs(first.right - viewportWidth) -
          Math.abs(second.right - viewportWidth)
      )
      .slice(0, 12)
    const comparisonLayout = [
      '.comparison-section',
      '.comparison-section > .wrap',
      '.comparison-controls',
      '.comparison-filters',
      '.comparison-table-shell',
    ]
      .map(selector => {
        const element = document.querySelector(selector)
        if (element === null) return null
        const rect = element.getBoundingClientRect()
        return {
          selector,
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }
      })
      .filter(Boolean)
    const layoutRegions = Array.from(
      document.querySelectorAll(
        'body > *, main > section, .guide-appbar, .guide-footer'
      )
    ).map(element => {
      const rect = element.getBoundingClientRect()
      return {
        element:
          element.id || element.className || element.tagName.toLowerCase(),
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }
    })
    const ctaOffenders = Array.from(document.querySelectorAll('.guide-cta *'))
      .map(element => {
        const rect = element.getBoundingClientRect()
        return {
          element: `${element.tagName.toLowerCase()}.${
            typeof element.className === 'string' ? element.className : ''
          }`,
          parent:
            typeof element.parentElement?.className === 'string'
              ? element.parentElement.className
              : '',
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        }
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > viewportWidth + 1)
      )
      .sort((first, second) => first.right - second.right)
      .slice(0, 20)
    const clientWidth = viewportWidth
    return {
      scrollWidth,
      clientWidth,
      overflowPixels: Math.max(0, scrollWidth - clientWidth),
      hasHorizontalOverflow: scrollWidth > clientWidth + 1,
      offenders,
      comparisonLayout,
      layoutRegions,
      ctaOffenders,
    }
  })
}

async function checkDocumentOverflow(page, name) {
  const overflow = await documentOverflow(page)
  recordCheck(name, !overflow.hasHorizontalOverflow, overflow)
  return overflow
}

async function languageState(page, language) {
  return page.evaluate(selectedLanguage => {
    const root = document.documentElement
    const selected = document.querySelector(
      `[data-set-language="${selectedLanguage}"]`
    )
    const en = document.querySelector('#cheap-title .copy.en')
    const yue = document.querySelector('#cheap-title .copy.yue')
    const isVisible = element =>
      element !== null && getComputedStyle(element).display !== 'none'

    return {
      selectedLanguage,
      rootLanguage: root.dataset.language ?? null,
      documentLanguage: root.lang,
      storedLanguage: localStorage.getItem('desktop-material-language'),
      selectedPressed: selected?.getAttribute('aria-pressed') ?? null,
      visible: {
        en: isVisible(en),
        yue: isVisible(yue),
      },
    }
  }, language)
}

async function exerciseLanguages(page) {
  const expectations = {
    en: { documentLanguage: 'en', en: true, yue: false },
    yue: { documentLanguage: 'zh-HK', en: false, yue: true },
    bi: { documentLanguage: 'en', en: true, yue: true },
  }

  for (const language of ['en', 'yue', 'bi']) {
    await page.locator(`[data-set-language="${language}"]`).click()
    const state = await languageState(page, language)
    const expected = expectations[language]
    recordCheck(
      `language.${language}`,
      state.rootLanguage === language &&
        state.documentLanguage === expected.documentLanguage &&
        state.storedLanguage === language &&
        state.selectedPressed === 'true' &&
        state.visible.en === expected.en &&
        state.visible.yue === expected.yue,
      state
    )
  }

  await page.locator('[data-set-language="yue"]').click()
  await page.reload({ waitUntil: 'load' })
  const persisted = await languageState(page, 'yue')
  recordCheck(
    'language.persistence',
    persisted.rootLanguage === 'yue' &&
      persisted.storedLanguage === 'yue' &&
      persisted.selectedPressed === 'true',
    persisted
  )
  await page.locator('[data-set-language="bi"]').click()
}

async function exerciseThemes(page) {
  await page.evaluate(() =>
    localStorage.setItem('desktop-material-theme', 'light')
  )
  await page.reload({ waitUntil: 'load' })

  const light = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    stored: localStorage.getItem('desktop-material-theme'),
    background: getComputedStyle(document.body).backgroundColor,
  }))
  recordCheck(
    'theme.light',
    light.theme === 'light' && light.stored === 'light',
    light
  )

  await page.locator('.theme-button').click()
  const dark = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    stored: localStorage.getItem('desktop-material-theme'),
    background: getComputedStyle(document.body).backgroundColor,
  }))
  recordCheck(
    'theme.dark',
    dark.theme === 'dark' &&
      dark.stored === 'dark' &&
      dark.background !== light.background,
    dark
  )

  await page.locator('.theme-button').click()
  const restored = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    stored: localStorage.getItem('desktop-material-theme'),
  }))
  recordCheck(
    'theme.light-restored',
    restored.theme === 'light' && restored.stored === 'light',
    restored
  )
}

async function setFunnyLevel(page, language, level) {
  await page.locator(`#funny-${language}`).evaluate((input, nextLevel) => {
    input.value = String(nextLevel)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, level)

  return page.evaluate(
    ({ selectedLanguage, selectedLevel }) => {
      const suffix = selectedLanguage === 'en' ? 'En' : 'Yue'
      const target = document.querySelector(
        `[data-tone-target="${selectedLanguage}"]`
      )
      return {
        language: selectedLanguage,
        level: selectedLevel,
        rootLevel: document.documentElement.dataset[`funny${suffix}`] ?? null,
        inputValue:
          document.querySelector(`#funny-${selectedLanguage}`)?.value ?? null,
        outputValue:
          document.querySelector(`#funny-${selectedLanguage}-value`)?.value ??
          null,
        stored: localStorage.getItem(
          `desktop-material-funny-${selectedLanguage}`
        ),
        targetText: target?.textContent?.trim() ?? null,
      }
    },
    { selectedLanguage: language, selectedLevel: level }
  )
}

async function exerciseFunnyLevels(page) {
  await page.locator('.tone-button').click()
  recordCheck(
    'funny.panel-open',
    await page.locator('#tone-panel').isVisible(),
    {
      expanded: await page
        .locator('.tone-button')
        .getAttribute('aria-expanded'),
    }
  )

  const observedText = { en: {}, yue: {} }
  for (const language of ['en', 'yue']) {
    for (const level of [1, 5]) {
      const state = await setFunnyLevel(page, language, level)
      observedText[language][level] = state.targetText
      recordCheck(
        `funny.${language}.${level}`,
        state.rootLevel === String(level) &&
          state.inputValue === String(level) &&
          state.outputValue === String(level) &&
          state.stored === String(level) &&
          Boolean(state.targetText),
        state
      )
    }

    recordCheck(
      `funny.${language}.changes-copy`,
      observedText[language][1] !== observedText[language][5],
      observedText[language]
    )
  }

  await page.reload({ waitUntil: 'load' })
  const persisted = await page.evaluate(() => ({
    en: {
      root: document.documentElement.dataset.funnyEn ?? null,
      input: document.querySelector('#funny-en')?.value ?? null,
      stored: localStorage.getItem('desktop-material-funny-en'),
    },
    yue: {
      root: document.documentElement.dataset.funnyYue ?? null,
      input: document.querySelector('#funny-yue')?.value ?? null,
      stored: localStorage.getItem('desktop-material-funny-yue'),
    },
  }))
  recordCheck(
    'funny.persistence',
    persisted.en.root === '5' &&
      persisted.en.input === '5' &&
      persisted.en.stored === '5' &&
      persisted.yue.root === '5' &&
      persisted.yue.input === '5' &&
      persisted.yue.stored === '5',
    persisted
  )

  await setFunnyLevel(page, 'en', 2)
  await setFunnyLevel(page, 'yue', 4)
}

async function comparisonState(page) {
  return page.evaluate(() => {
    const groups = [
      ...document.querySelectorAll('[data-comparison-group]'),
    ].map(group => ({
      name: group.dataset.comparisonGroup,
      hidden: group.hidden,
      display: getComputedStyle(group).display,
      rows: group.querySelectorAll('.comparison-row').length,
    }))
    const filters = [
      ...document.querySelectorAll('[data-comparison-filter]'),
    ].map(button => ({
      name: button.dataset.comparisonFilter,
      pressed: button.getAttribute('aria-pressed'),
    }))

    return {
      groups,
      filters,
      displayedCount: Number(
        document.querySelector('[data-comparison-count]')?.textContent ?? NaN
      ),
      totalRows: groups.reduce((total, group) => total + group.rows, 0),
      storedFilter: localStorage.getItem(
        'desktop-material-cheap-lfs-comparison-filter'
      ),
    }
  })
}

async function exerciseComparisonFilters(page) {
  const initial = await comparisonState(page)
  recordCheck(
    'comparison.minimum-size',
    initial.totalRows >= ExpectedComparisonMinimum,
    {
      expectedMinimum: ExpectedComparisonMinimum,
      actual: initial.totalRows,
      groups: initial.groups,
    }
  )

  for (const filter of initial.filters.map(item => item.name)) {
    await page.locator(`[data-comparison-filter="${filter}"]`).click()
    const state = await comparisonState(page)
    const expectedRows =
      filter === 'all'
        ? state.totalRows
        : state.groups.find(group => group.name === filter)?.rows ?? -1
    const groupsCorrect = state.groups.every(group =>
      filter === 'all'
        ? !group.hidden && group.display !== 'none'
        : group.name === filter
        ? !group.hidden && group.display !== 'none'
        : group.hidden && group.display === 'none'
    )
    const pressedCorrect = state.filters.every(item =>
      item.name === filter ? item.pressed === 'true' : item.pressed === 'false'
    )

    recordCheck(
      `comparison.filter.${filter}`,
      state.displayedCount === expectedRows &&
        state.storedFilter === filter &&
        groupsCorrect &&
        pressedCorrect,
      {
        expectedRows,
        ...state,
      }
    )
  }

  const persistedFilter = 'storage'
  await page.locator(`[data-comparison-filter="${persistedFilter}"]`).click()
  await page.reload({ waitUntil: 'load' })
  const persisted = await comparisonState(page)
  const persistedGroup = persisted.groups.find(
    group => group.name === persistedFilter
  )
  const persistedButton = persisted.filters.find(
    item => item.name === persistedFilter
  )
  recordCheck(
    'comparison.persistence',
    persisted.storedFilter === persistedFilter &&
      persistedButton?.pressed === 'true' &&
      persisted.displayedCount === persistedGroup?.rows &&
      persisted.groups.every(group =>
        group.name === persistedFilter ? !group.hidden : group.hidden
      ),
    persisted
  )

  await page.locator('[data-comparison-filter="all"]').click()
}

function pngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a'
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== pngSignature
  ) {
    throw new Error('Screenshot output is not a valid PNG.')
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function scrollToSection(page, selector) {
  await page.locator(selector).evaluate(element => {
    const appBar = document.querySelector('.guide-appbar')
    const offset = (appBar?.getBoundingClientRect().height ?? 0) + 12
    const top = element.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  })
  await page.waitForTimeout(150)
}

async function captureViewport(page, name, fileName, expectedViewport) {
  const capturePath = path.join(report.runDirectory, fileName)
  const buffer = await page.screenshot({
    path: capturePath,
    type: 'png',
    animations: 'disabled',
  })
  const dimensions = pngDimensions(buffer)
  const stat = await fsp.stat(capturePath)
  const capture = {
    path: capturePath,
    fileName,
    width: dimensions.width,
    height: dimensions.height,
    bytes: stat.size,
  }
  report.captures[name] = capture
  recordCheck(
    `capture.${name}.dimensions`,
    dimensions.width === expectedViewport.width &&
      dimensions.height === expectedViewport.height,
    {
      expected: expectedViewport,
      actual: dimensions,
    }
  )
  return capture
}

async function activeElementDescription(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    return {
      tagName: element?.tagName ?? null,
      id: element?.id ?? null,
      className:
        typeof element?.className === 'string' ? element.className : null,
      href: element?.getAttribute?.('href') ?? null,
      text: element?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    }
  })
}

async function tabUntil(page, selector, maximumTabs = 30) {
  for (let index = 1; index <= maximumTabs; index++) {
    await page.keyboard.press('Tab')
    const matched = await page.evaluate(candidate => {
      const target = document.querySelector(candidate)
      return target !== null && document.activeElement === target
    }, selector)
    if (matched) {
      return {
        reached: true,
        tabs: index,
        active: await activeElementDescription(page),
      }
    }
  }

  return {
    reached: false,
    tabs: maximumTabs,
    active: await activeElementDescription(page),
  }
}

async function exerciseCompactNavigationAndKeyboard(page) {
  await navigate(page)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.activeElement?.blur()
  })

  await page.keyboard.press('Tab')
  const firstFocus = await activeElementDescription(page)
  recordCheck(
    'keyboard.skip-link-first',
    firstFocus.tagName === 'A' &&
      firstFocus.className?.split(/\s+/).includes('skip-link'),
    firstFocus
  )

  await page.keyboard.press('Enter')
  const afterSkip = await activeElementDescription(page)
  recordCheck('keyboard.skip-link-target', afterSkip.id === 'main', afterSkip)

  await page.reload({ waitUntil: 'load' })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelector('.skip-link')?.focus()
  })

  const menuButton = page.locator('.guide-menu-button')
  recordCheck('compact-nav.menu-visible', await menuButton.isVisible(), {
    viewport: page.viewportSize(),
  })

  const reachedMenu = await tabUntil(page, '.guide-menu-button')
  recordCheck(
    'keyboard.compact-menu-reachable',
    reachedMenu.reached,
    reachedMenu
  )

  if (reachedMenu.reached) {
    await page.keyboard.press('Enter')
  } else {
    await menuButton.click()
  }

  const openState = await page.evaluate(() => ({
    expanded: document
      .querySelector('.guide-menu-button')
      ?.getAttribute('aria-expanded'),
    hasOpenClass: document
      .querySelector('.guide-nav')
      ?.classList.contains('is-open'),
    visible:
      getComputedStyle(document.querySelector('.guide-nav')).display !== 'none',
  }))
  recordCheck(
    'compact-nav.opens',
    openState.expanded === 'true' &&
      openState.hasOpenClass === true &&
      openState.visible === true,
    openState
  )
  await checkDocumentOverflow(page, 'overflow.narrow.compact-nav-open')

  const reachedPushLink = await tabUntil(page, '.guide-nav a[href="#push"]')
  recordCheck(
    'keyboard.compact-push-link-reachable',
    reachedPushLink.reached,
    reachedPushLink
  )

  if (reachedPushLink.reached) {
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.hash === '#push')
  } else {
    await page.locator('.guide-nav a[href="#push"]').click()
  }

  const closedState = await page.evaluate(() => ({
    hash: location.hash,
    expanded: document
      .querySelector('.guide-menu-button')
      ?.getAttribute('aria-expanded'),
    hasOpenClass: document
      .querySelector('.guide-nav')
      ?.classList.contains('is-open'),
  }))
  recordCheck(
    'compact-nav.closes-after-navigation',
    closedState.hash === '#push' &&
      closedState.expanded === 'false' &&
      closedState.hasOpenClass === false,
    closedState
  )
}

async function main() {
  report.runDirectory = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'desktop-material-cheap-lfs-pages-revamp-')
  )

  try {
    let chromium
    try {
      ;({ chromium } = require('playwright'))
    } catch (error) {
      throw new Error(
        `The already-installed Playwright package could not be loaded: ${
          serializeError(error).message
        }`
      )
    }

    server = await startStaticServer()

    const executablePath = findInstalledChrome()
    const launchOptions = {
      headless: true,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    }
    if (executablePath === null) {
      launchOptions.channel = 'chrome'
      report.chrome.launchMode = 'channel:chrome'
    } else {
      launchOptions.executablePath = executablePath
      report.chrome.launchMode = 'executablePath'
      report.chrome.executablePath = executablePath
    }

    browser = await chromium.launch(launchOptions)
    const browserProcess =
      browser?._browserProcess?.process ?? browser?._browserProcess ?? null
    report.pids.browser = Number.isInteger(browserProcess?.pid)
      ? browserProcess.pid
      : null

    const context = await browser.newContext({
      viewport: WideViewport,
      colorScheme: 'light',
      locale: 'en-CA',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    page.setDefaultNavigationTimeout(30_000)
    attachPageDiagnostics(page)

    await runPhase('wide-load-images-and-overflow', async () => {
      await navigate(page)
      const images = await loadEveryImage(page)
      const failed = images.filter(
        image =>
          !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0
      )
      const missingAlt = images.filter(image => !image.alt?.trim())
      recordCheck('images.present', images.length > 0, {
        count: images.length,
      })
      recordCheck('images.loaded', failed.length === 0, {
        count: images.length,
        failed,
      })
      recordCheck('images.alt-text', missingAlt.length === 0, {
        missingAlt,
      })
      await checkDocumentOverflow(page, 'overflow.wide.document')
    })

    await runPhase('languages', async () => {
      await exerciseLanguages(page)
    })

    await runPhase('themes', async () => {
      await exerciseThemes(page)
    })

    await runPhase('funny-levels', async () => {
      await exerciseFunnyLevels(page)
    })

    await runPhase('comparison-filters-and-persistence', async () => {
      await exerciseComparisonFilters(page)
      await checkDocumentOverflow(page, 'overflow.wide.comparison-all')
    })

    await runPhase('comparison-wide-capture', async () => {
      await page.setViewportSize(WideViewport)
      await page.locator('[data-set-language="bi"]').click()
      await page.evaluate(() =>
        localStorage.setItem('desktop-material-theme', 'light')
      )
      await page.reload({ waitUntil: 'load' })
      await page.locator('[data-comparison-filter="all"]').click()
      await scrollToSection(page, '.comparison-controls')
      await checkDocumentOverflow(page, 'overflow.wide.comparison-capture')
      await captureViewport(
        page,
        'comparisonWide',
        'comparison-wide.png',
        WideViewport
      )
    })

    await runPhase(
      'narrow-images-navigation-keyboard-and-overflow',
      async () => {
        await page.setViewportSize(NarrowViewport)
        await navigate(page)
        const images = await loadEveryImage(page)
        const failed = images.filter(
          image =>
            !image.complete ||
            image.naturalWidth <= 0 ||
            image.naturalHeight <= 0
        )
        recordCheck('images.narrow-loaded', failed.length === 0, {
          count: images.length,
          failed,
        })
        await checkDocumentOverflow(page, 'overflow.narrow.document')
        await exerciseCompactNavigationAndKeyboard(page)
      }
    )

    await runPhase('push-narrow-capture', async () => {
      await page.setViewportSize(NarrowViewport)
      await page.locator('[data-set-language="en"]').click()
      await page.evaluate(() => {
        localStorage.setItem('desktop-material-theme', 'dark')
      })
      await page.reload({ waitUntil: 'load' })
      await scrollToSection(page, '.push-command-grid')
      await checkDocumentOverflow(page, 'overflow.narrow.push-capture')
      await captureViewport(
        page,
        'pushNarrow',
        'push-narrow.png',
        NarrowViewport
      )
    })

    recordCheck('runtime.console-errors', report.errors.console.length === 0, {
      errors: report.errors.console,
    })
    recordCheck('runtime.page-errors', report.errors.page.length === 0, {
      errors: report.errors.page,
    })
    recordCheck(
      'runtime.request-failures',
      report.errors.requests.length === 0,
      { errors: report.errors.requests }
    )
    recordCheck('runtime.http-errors', report.errors.http.length === 0, {
      errors: report.errors.http,
    })
  } catch (error) {
    report.errors.fatal.push(serializeError(error))
  } finally {
    if (browser !== null) {
      try {
        await browser.close()
        report.cleanup.browserClosed = true
      } catch (error) {
        report.errors.cleanup.push({
          resource: 'browser',
          ...serializeError(error),
        })
      }
    } else {
      report.cleanup.browserClosed = true
    }

    try {
      await closeStaticServer(server)
    } catch (error) {
      report.errors.cleanup.push({
        resource: 'server',
        ...serializeError(error),
      })
    }

    report.finishedAt = new Date().toISOString()
    const everyCheckPassed =
      report.checks.length > 0 && report.checks.every(check => check.passed)
    const everyPhasePassed =
      report.phases.length > 0 && report.phases.every(phase => phase.passed)
    const noRecordedErrors = Object.values(report.errors).every(
      errors => errors.length === 0
    )
    report.passed =
      everyCheckPassed &&
      everyPhasePassed &&
      noRecordedErrors &&
      report.cleanup.browserClosed &&
      report.cleanup.serverClosed
    process.exitCode = report.passed ? 0 : 1
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  }
}

main().catch(error => {
  report.errors.fatal.push(serializeError(error))
  report.finishedAt = new Date().toISOString()
  report.passed = false
  process.exitCode = 1
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
})
