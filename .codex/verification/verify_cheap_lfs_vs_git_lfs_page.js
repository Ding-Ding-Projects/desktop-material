'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const RepositoryRoot = path.resolve(__dirname, '..', '..')
const PageName = 'cheap-lfs-vs-git-lfs.html'
const WideViewport = { width: 1440, height: 960 }
const NarrowViewport = { width: 390, height: 844 }
const TaskPrefix = 'desktop-material-cheap-lfs-vs-git-lfs-'
const ReportPath = path.join(
  os.tmpdir(),
  'desktop-material-cheap-lfs-vs-git-lfs-20260728-report.json'
)

const report = {
  schemaVersion: 1,
  helper: path.resolve(__filename),
  reportPath: ReportPath,
  repositoryRoot: RepositoryRoot,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  passed: false,
  runDirectory: null,
  publishRoot: null,
  pageUrl: null,
  chrome: {
    executablePath: null,
    headless: true,
  },
  pids: {
    helper: process.pid,
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
    runDirectoryRetainedForCapturePromotion: true,
  },
}

let browser = null
let server = null

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : 'NonError',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  }
}

function recordCheck(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details })
}

function assertCheck(name, condition, details = {}) {
  recordCheck(name, condition, details)
  if (!condition) {
    throw new Error(`${name} failed: ${JSON.stringify(details)}`)
  }
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
    report.errors.phases.push({ phase: name, ...serializeError(error) })
  } finally {
    phase.finishedAt = new Date().toISOString()
  }
}

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    process.env['PROGRAMFILES(X86)'] &&
      path.join(
        process.env['PROGRAMFILES(X86)'],
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
  ].filter(Boolean)
}

function findInstalledChrome() {
  return chromeCandidates().find(candidate => fs.existsSync(candidate)) ?? null
}

const MimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
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

function countStatus(status) {
  const key = String(status)
  report.server.responsesByStatus[key] =
    (report.server.responsesByStatus[key] ?? 0) + 1
}

async function serveRequest(request, response) {
  report.server.requests += 1
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    countStatus(405)
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    )
  } catch {
    countStatus(400)
    response.writeHead(400)
    response.end()
    return
  }

  const relative = pathname === '/' ? PageName : pathname.replace(/^[/\\]+/, '')
  const candidate = path.resolve(
    report.publishRoot,
    relative.replaceAll('/', path.sep)
  )
  if (!isInside(report.publishRoot, candidate)) {
    countStatus(403)
    response.writeHead(403)
    response.end()
    return
  }

  try {
    const stat = await fsp.stat(candidate)
    if (!stat.isFile()) {
      throw new Error('Not a file')
    }
    const body = await fsp.readFile(candidate)
    const status = 200
    countStatus(status)
    response.writeHead(status, {
      'content-type':
        MimeTypes.get(path.extname(candidate).toLowerCase()) ??
        'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    countStatus(404)
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
}

async function startServer() {
  server = http.createServer((request, response) => {
    serveRequest(request, response).catch(error => {
      report.errors.http.push(serializeError(error))
      if (!response.headersSent) {
        response.writeHead(500)
      }
      response.end()
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  report.server.port = server.address().port
  report.pageUrl = `http://127.0.0.1:${report.server.port}/${PageName}`
}

async function closeServer() {
  if (server === null || !server.listening) {
    report.cleanup.serverClosed = true
    return
  }
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()))
  })
  report.cleanup.serverClosed = true
}

async function assemblePublishTree() {
  report.runDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), TaskPrefix))
  report.publishRoot = path.join(report.runDirectory, 'publish')
  await fsp.mkdir(report.publishRoot, { recursive: true })
  await fsp.cp(path.join(RepositoryRoot, 'site'), report.publishRoot, {
    recursive: true,
  })
  const sharedAssetTarget = path.join(
    report.publishRoot,
    'docs',
    'assets',
    'site'
  )
  await fsp.mkdir(sharedAssetTarget, { recursive: true })
  await fsp.cp(
    path.join(RepositoryRoot, 'docs', 'assets', 'site'),
    sharedAssetTarget,
    { recursive: true }
  )
}

async function waitForCount(page, expected) {
  await page.waitForFunction(
    value =>
      Number(document.querySelector('[data-visible-count]')?.textContent) ===
      value,
    expected
  )
}

async function visibleRowCount(page) {
  return page.locator('[data-row]:not([hidden])').count()
}

async function documentOverflow(page) {
  return page.evaluate(() => ({
    innerWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow:
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1 ||
      document.body.scrollWidth > document.documentElement.clientWidth + 1,
  }))
}

async function assertNoOverflow(page, name) {
  const details = await documentOverflow(page)
  assertCheck(name, details.overflow === false, details)
}

async function assertImages(page, name) {
  const images = await page.locator('img').evaluateAll(nodes =>
    nodes.map(image => ({
      src: image.getAttribute('src'),
      alt: image.getAttribute('alt'),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))
  )
  const failed = images.filter(
    image =>
      !image.complete ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0 ||
      !image.alt?.trim()
  )
  assertCheck(name, images.length >= 2 && failed.length === 0, {
    count: images.length,
    failed,
  })
}

async function capture(page, key, fileName, viewport) {
  const capturePath = path.join(report.runDirectory, fileName)
  const bytes = await page.screenshot({
    path: capturePath,
    fullPage: false,
    animations: 'disabled',
  })
  report.captures[key] = {
    path: capturePath,
    bytes: bytes.length,
    width: viewport.width,
    height: viewport.height,
  }
  assertCheck(`capture.${key}`, bytes.length > 10_000, report.captures[key])
}

async function main() {
  try {
    await assemblePublishTree()
    let chromium
    try {
      ;({ chromium } = require('playwright'))
    } catch (error) {
      throw new Error(
        `Installed Playwright could not be loaded: ${
          serializeError(error).message
        }`
      )
    }

    const executablePath = findInstalledChrome()
    if (executablePath === null) {
      throw new Error('Installed Google Chrome was not found.')
    }
    report.chrome.executablePath = executablePath

    await startServer()
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--no-default-browser-check',
        '--no-first-run',
      ],
    })
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
    page.on('console', message => {
      if (message.type() === 'error') {
        report.errors.console.push({
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
        failure: request.failure()?.errorText ?? 'unknown',
      })
    })
    page.on('response', response => {
      if (response.status() >= 400) {
        report.errors.http.push({
          url: response.url(),
          status: response.status(),
        })
      }
    })

    await runPhase('wide-load-and-structure', async () => {
      const response = await page.goto(`${report.pageUrl}#matrix`, {
        waitUntil: 'load',
      })
      assertCheck('page.http-200', response?.status() === 200, {
        status: response?.status() ?? null,
      })
      await page.waitForFunction(
        () => document.querySelectorAll('[data-row]').length === 72
      )
      await waitForCount(page, 72)
      assertCheck(
        'page.title',
        (await page.title()).includes('Cheap LFS vs Git LFS'),
        { title: await page.title() }
      )
      assertCheck(
        'matrix.rows',
        (await page.locator('[data-row]').count()) === 72,
        {
          count: await page.locator('[data-row]').count(),
        }
      )
      assertCheck(
        'matrix.categories',
        (await page
          .locator(
            '[data-category-filters] button[data-category]:not([data-category="all"])'
          )
          .count()) === 12,
        {
          count: await page
            .locator(
              '[data-category-filters] button[data-category]:not([data-category="all"])'
            )
            .count(),
        }
      )
      assertCheck(
        'tabs.six',
        (await page.locator('[role="tab"][data-tab]').count()) === 6,
        { count: await page.locator('[role="tab"][data-tab]').count() }
      )
      assertCheck(
        'push.six-stages',
        (await page.locator('[data-push-stage]').count()) === 6,
        { count: await page.locator('[data-push-stage]').count() }
      )
      assertCheck(
        'sources.thirty-six',
        (await page.locator('[data-source-library] .source-card').count()) ===
          36,
        {
          count: await page
            .locator('[data-source-library] .source-card')
            .count(),
        }
      )
      await assertImages(page, 'assets.images-loaded')
      await assertNoOverflow(page, 'overflow.wide.initial')
    })

    await runPhase('filters-compose-and-reset', async () => {
      const firstCategory = page
        .locator(
          '[data-category-filters] button[data-category]:not([data-category="all"])'
        )
        .first()
      const category = await firstCategory.getAttribute('data-category')
      await firstCategory.click()
      await waitForCount(page, 6)
      assertCheck('filters.category-six', (await visibleRowCount(page)) === 6, {
        category,
        count: await visibleRowCount(page),
      })

      await page
        .locator('.outcome-filters button[data-outcome="cheap"]')
        .click()
      const composed = Number(
        await page.locator('[data-visible-count]').textContent()
      )
      assertCheck(
        'filters.category-outcome-compose',
        composed >= 0 && composed <= 6,
        { category, outcome: 'cheap', count: composed }
      )

      await page.locator('[data-matrix-form] .matrix-reset').click()
      await waitForCount(page, 72)
      await page.locator('#matrix-search').fill('encryption')
      const searched = Number(
        await page.locator('[data-visible-count]').textContent()
      )
      assertCheck('filters.plain-text', searched > 0 && searched < 72, {
        query: 'encryption',
        count: searched,
      })
      await page.locator('[data-matrix-form] .matrix-reset').click()
      await waitForCount(page, 72)
      await assertNoOverflow(page, 'overflow.wide.filtered')
    })

    await runPhase('bounded-regex-builder', async () => {
      await page.locator('[data-open-regex]').click()
      await page.locator('#regex-pattern').fill('(encryption|migration)')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-regex-validation]')
            ?.getAttribute('data-error') === 'false'
      )
      await page.locator('[data-apply-regex]').click()
      await page.waitForFunction(() => {
        const value = Number(
          document.querySelector('[data-visible-count]')?.textContent
        )
        return value > 0 && value < 72
      })
      const regexCount = Number(
        await page.locator('[data-visible-count]').textContent()
      )
      assertCheck('regex.valid-filter', regexCount > 0 && regexCount < 72, {
        count: regexCount,
      })

      await page.locator('[data-open-regex]').click()
      await page.locator('#regex-pattern').fill('[')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-regex-validation]')
            ?.getAttribute('data-error') === 'true'
      )
      const invalidText = await page
        .locator('[data-regex-validation]')
        .innerText()
      assertCheck(
        'regex.invalid-fails-closed',
        /invalid|無效/i.test(invalidText),
        {
          feedback: invalidText,
        }
      )

      await page.locator('#regex-pattern').fill('^(a+)+$')
      await page.locator('#regex-sample').fill(`${'a'.repeat(1198)}!`)
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-regex-validation]')
            ?.textContent?.includes('750 ms'),
        null,
        { timeout: 4_000 }
      )
      const timeoutText = await page
        .locator('[data-regex-validation]')
        .innerText()
      assertCheck(
        'regex.adversarial-terminated',
        timeoutText.includes('750 ms'),
        {
          feedback: timeoutText,
        }
      )
      await page.locator('#regex-dialog .dialog-close-row button').click()
      await page.locator('[data-tab="sources"]').click()
      assertCheck(
        'regex.ui-remains-responsive',
        (await page
          .locator('[data-tab="sources"]')
          .getAttribute('aria-selected')) === 'true',
        {}
      )
    })

    await runPhase('tabs-keyboard-order-pin-and-persistence', async () => {
      await page.locator('[data-tab="verdict"]').focus()
      await page.keyboard.press('ArrowRight')
      assertCheck(
        'tabs.arrow-right',
        (await page
          .locator('[role="tab"][aria-selected="true"]')
          .getAttribute('data-tab')) === 'matrix',
        {}
      )
      await page.keyboard.press('End')
      assertCheck(
        'tabs.end',
        (await page
          .locator('[role="tab"][aria-selected="true"]')
          .getAttribute('data-tab')) === 'sources',
        {}
      )
      await page.keyboard.press('Home')
      assertCheck(
        'tabs.home',
        (await page
          .locator('[role="tab"][aria-selected="true"]')
          .getAttribute('data-tab')) === 'verdict',
        {}
      )
      await page.locator('[data-tab="push"]').click()
      const before = await page
        .locator('[role="tab"][data-tab]')
        .evaluateAll(tabs => tabs.map(tab => tab.dataset.tab))
      await page.locator('[data-tab-action="left"]').click()
      await page.locator('[data-tab-action="pin"]').click()
      const stored = await page.evaluate(() => ({
        order: JSON.parse(
          localStorage.getItem('desktop-material-lfs-atlas-tab-order-v1')
        ),
        pins: JSON.parse(
          localStorage.getItem('desktop-material-lfs-atlas-pinned-tabs-v1')
        ),
      }))
      assertCheck(
        'tabs.order-and-pin-stored',
        Array.isArray(stored.order) &&
          Array.isArray(stored.pins) &&
          stored.pins.includes('push') &&
          stored.order.join('|') !== before.join('|'),
        { before, stored }
      )
      await page.reload({ waitUntil: 'load' })
      await page.waitForFunction(
        () => document.querySelectorAll('[data-row]').length === 72
      )
      const restored = await page
        .locator('[role="tab"][data-tab]')
        .evaluateAll(tabs => tabs.map(tab => tab.dataset.tab))
      assertCheck(
        'tabs.order-restored',
        restored.join('|') === stored.order.join('|'),
        { stored: stored.order, restored }
      )
      assertCheck(
        'tabs.pin-restored',
        (await page
          .locator('[data-tab="push"]')
          .getAttribute('data-pinned')) === 'true',
        {}
      )
    })

    await runPhase('language-theme-tone-and-wide-capture', async () => {
      await page.locator('[data-set-language="bi"]').click()
      await page.evaluate(() => {
        const en = document.querySelector('#funny-en')
        const yue = document.querySelector('#funny-yue')
        en.value = '1'
        yue.value = '5'
        en.dispatchEvent(new Event('input', { bubbles: true }))
        yue.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const state = await page.evaluate(() => ({
        language: document.documentElement.dataset.language,
        funnyEn: document.documentElement.dataset.funnyEn,
        funnyYue: document.documentElement.dataset.funnyYue,
        storedEn: localStorage.getItem('desktop-material-funny-en'),
        storedYue: localStorage.getItem('desktop-material-funny-yue'),
      }))
      assertCheck(
        'language-and-independent-tone',
        state.language === 'bi' &&
          state.funnyEn === '1' &&
          state.funnyYue === '5' &&
          state.storedEn === '1' &&
          state.storedYue === '5',
        state
      )
      await page.evaluate(() => {
        localStorage.setItem('desktop-material-theme', 'light')
        document.documentElement.dataset.theme = 'light'
        history.replaceState(null, '', '#verdict')
        scrollTo(0, 0)
      })
      await page.locator('[data-tab="verdict"]').click()
      await page.evaluate(() => scrollTo(0, 0))
      await assertNoOverflow(page, 'overflow.wide.capture')
      await capture(
        page,
        'comparisonAtlasWide',
        'comparison-atlas-wide.png',
        WideViewport
      )
    })

    await runPhase('narrow-push-and-capture', async () => {
      await page.setViewportSize(NarrowViewport)
      await page.locator('[data-set-language="yue"]').click()
      await page.evaluate(() => {
        localStorage.setItem('desktop-material-theme', 'dark')
        document.documentElement.dataset.theme = 'dark'
      })
      await page.locator('[data-tab="push"]').click()
      await page.evaluate(() => {
        const heading = document.querySelector('#panel-push .panel-heading')
        const top = heading.getBoundingClientRect().top + scrollY
        scrollTo(0, Math.max(0, top - 190))
      })
      assertCheck(
        'narrow.push-stages-visible',
        (await page.locator('#panel-push [data-push-stage]').count()) === 6,
        { count: await page.locator('#panel-push [data-push-stage]').count() }
      )
      const commands = await page.locator('#panel-push code').allTextContents()
      const commandText = commands.join('\n')
      assertCheck(
        'narrow.push-proof-commands',
        [
          'git remote get-url --push origin',
          'git show HEAD:path/to/large-file.bin',
          'git push',
          'git fetch origin',
          "git rev-parse '@{upstream}'",
          'git lfs install',
          'git lfs track "*.psd"',
        ].every(command => commandText.includes(command)),
        { commands }
      )
      await assertImages(page, 'assets.narrow-images-loaded')
      await assertNoOverflow(page, 'overflow.narrow.push')
      await capture(
        page,
        'comparisonPushNarrow',
        'comparison-push-narrow.png',
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
      {
        errors: report.errors.requests,
      }
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
      await closeServer()
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
    try {
      await fsp.writeFile(ReportPath, `${JSON.stringify(report, null, 2)}\n`)
    } catch (error) {
      report.errors.cleanup.push({
        resource: 'report',
        ...serializeError(error),
      })
      report.passed = false
    }
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
