#!/usr/bin/env node
'use strict'

/**
 * Attach-only final race regression for temporary submodule navigation.
 *
 * The caller owns the app, hidden desktop, fixture, user data, and cleanup.
 * This helper never launches, focuses, resizes, or terminates Electron. It
 * opens a real checked-out submodule, synchronously invokes the Open action
 * twice, then synchronously invokes Back twice. The result proves both UI
 * guards coalesce their transition without persisting the child repository.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

const OwnedRootPrefix = 'desktop-material-p0-ui-'
const CaptureWidth = 1440
const CaptureHeight = 960

function fail(message) {
  throw new Error(message)
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

function parseArguments(argv) {
  if (argv.length !== 4) {
    fail('Usage: --port <loopback-port> --run-root <owned-temp-root>.')
  }
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (
      !key?.startsWith('--') ||
      value === undefined ||
      values.has(key.slice(2))
    ) {
      fail(`Invalid argument near ${key ?? '<end>'}.`)
    }
    values.set(key.slice(2), value)
  }
  if (values.size !== 2 || !values.has('port') || !values.has('run-root')) {
    fail('Only --port and --run-root are accepted.')
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }

  const requestedRoot = values.get('run-root')
  if (
    !path.isAbsolute(requestedRoot) ||
    !fs.statSync(requestedRoot).isDirectory()
  ) {
    fail('run-root must be an existing absolute directory.')
  }
  const runRoot = fs.realpathSync.native(requestedRoot)
  const tempRoot = fs.realpathSync.native(os.tmpdir())
  if (
    !isWithin(tempRoot, runRoot) ||
    runRoot === tempRoot ||
    !path.basename(runRoot).startsWith(OwnedRootPrefix)
  ) {
    fail('run-root must be an owned named child of the system temp directory.')
  }

  const fixturePath = path.join(runRoot, 'fixture')
  if (
    !fs.statSync(fixturePath).isDirectory() ||
    !fs.existsSync(path.join(fixturePath, '.git'))
  ) {
    fail('The owned fixture repository is missing.')
  }

  const captureDirectory = path.join(runRoot, 'captures')
  if (!fs.statSync(captureDirectory).isDirectory()) {
    fail('The owned captures directory is missing.')
  }

  return { port, runRoot, fixturePath, captureDirectory }
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
      .filter(page => page.url().includes('/out/index.html'))
    if (pages.length === 1) {
      return pages[0]
    }
    if (pages.length > 1) {
      fail('More than one Desktop Material renderer target is attached.')
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  fail('The Desktop Material renderer target did not become available.')
}

async function setViewport(session) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: CaptureWidth,
    height: CaptureHeight,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: CaptureWidth,
    screenHeight: CaptureHeight,
  })
  await new Promise(resolve => setTimeout(resolve, 300))
}

async function menuEvent(page, eventName) {
  await page.evaluate(name => {
    require('electron').ipcRenderer.emit('menu-event', {}, name)
  }, eventName)
  await page.waitForTimeout(300)
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
            const value = request.result
            transaction.oncomplete = () => database.close()
            resolve(value)
          }
        }
      })
  )
  if (!Number.isSafeInteger(count) || count < 1) {
    fail('The persistent repository database is unexpectedly empty.')
  }
  return count
}

async function tabCount(page) {
  return page.locator('.repository-tab[role="tab"]').count()
}

async function currentRepositoryName(page) {
  const title = page
    .locator('.toolbar-dropdown.foldout-style .description', {
      hasText: 'Current repository',
    })
    .locator('..')
    .locator('.title')
  return ((await title.textContent().catch(() => null)) ?? '').trim()
}

async function addFixtureRepository(page, fixturePath) {
  await menuEvent(page, 'add-local-repository')
  const heading = page.getByRole('heading', {
    name: 'Add local repository',
    exact: true,
  })
  await heading.waitFor({ state: 'visible', timeout: 15_000 })
  const pathInput = page.locator('#__TextBox_Local_path')
  await pathInput.fill(fixturePath)
  await pathInput.blur()
  const add = page.getByRole('button', {
    name: 'Add repository',
    exact: true,
  })
  if (!(await add.isEnabled())) {
    fail('The owned fixture repository is not eligible to be added.')
  }
  await add.click()
  await heading.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function capture(session, directory, name) {
  const output = path.join(directory, name)
  if (fs.existsSync(output)) {
    fail(`Capture already exists: ${name}`)
  }
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  fs.writeFileSync(output, Buffer.from(shot.data, 'base64'), { flag: 'wx' })
  const data = fs.readFileSync(output)
  if (
    data.length < 20_000 ||
    data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    data.readUInt32BE(16) !== CaptureWidth ||
    data.readUInt32BE(20) !== CaptureHeight
  ) {
    fail(`${name} failed its nonblank 1440x960 PNG gate.`)
  }
  return {
    name,
    bytes: data.length,
    width: CaptureWidth,
    height: CaptureHeight,
  }
}

async function ensureNoError(page, label) {
  const errors = await page
    .locator(
      '.error-notice-stack .error-notice:visible, .crash-window:visible, #fatal-error:visible'
    )
    .count()
  if (errors !== 0) {
    fail(`${label} displayed an error or crash surface.`)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const browser = await connect(options.port)
  const page = await getRenderer(browser)
  const session = await page.context().newCDPSession(page)
  try {
    await setViewport(session)
    await page.locator('#desktop-app-contents').waitFor({
      state: 'visible',
      timeout: 30_000,
    })
    const fixtureName = path.basename(options.fixturePath)
    if ((await currentRepositoryName(page)) !== fixtureName) {
      await addFixtureRepository(page, options.fixturePath)
    }

    const baseline = {
      persistentRepositoryCount: await persistentRepositoryCount(page),
      repositoryTabCount: await tabCount(page),
      parentName: await currentRepositoryName(page),
    }
    if (baseline.parentName !== fixtureName) {
      fail('The exact parent fixture is not the selected repository.')
    }

    const manager = page.locator('#submodule-manager')
    if (!(await manager.isVisible().catch(() => false))) {
      await menuEvent(page, 'show-repository-tools')
      const tools = page.locator('main.repository-tools')
      await tools.waitFor({ state: 'visible', timeout: 30_000 })
      await tools.locator('[data-hub-tool="submodule-manager"]').click()

      // Current Material builds open the manager directly from the hub card;
      // retain the older hub's explicit action as a bounded compatibility path.
      if (!(await manager.isVisible().catch(() => false))) {
        const openManager = tools.getByRole('button', {
          name: /Open submodule manager/i,
        })
        await openManager.waitFor({ state: 'visible', timeout: 15_000 })
        await openManager.click()
      }
    }
    await manager.waitFor({ state: 'visible', timeout: 30_000 })
    const open = manager.locator('.submodule-open-repository').first()
    await open.waitFor({ state: 'visible', timeout: 30_000 })
    if (!(await open.isEnabled())) {
      fail('The initialized submodule open action is unavailable.')
    }

    const duplicateOpen = await open.evaluate(button => {
      button.click()
      const firstDisabled = button.disabled
      button.click()
      return { firstDisabled, secondDisabled: button.disabled }
    })
    const context = page.locator('.submodule-repository-context')
    await context.waitFor({ state: 'visible', timeout: 30_000 })
    await manager.waitFor({ state: 'hidden', timeout: 30_000 })
    await page.waitForTimeout(250)
    const childCapture = await capture(
      session,
      options.captureDirectory,
      'race-child.png'
    )
    const childState = {
      persistentRepositoryCount: await persistentRepositoryCount(page),
      repositoryTabCount: await tabCount(page),
      childContextVisible: await context.isVisible(),
      errorFree: true,
    }
    await ensureNoError(page, 'Child submodule context')
    if (
      childState.persistentRepositoryCount !==
        baseline.persistentRepositoryCount ||
      childState.repositoryTabCount !== baseline.repositoryTabCount ||
      !childState.childContextVisible
    ) {
      fail('Duplicate Open changed the persistent repository or tab boundary.')
    }

    const back = context.locator('.submodule-context-back')
    const duplicateBack = await back.evaluate(button => {
      button.click()
      const firstDisabled = button.disabled
      button.click()
      return { firstDisabled, secondDisabled: button.disabled }
    })
    await context.waitFor({ state: 'hidden', timeout: 30_000 })
    await page
      .locator('.toolbar-dropdown.foldout-style .title')
      .filter({ hasText: baseline.parentName })
      .waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(250)
    const parentCapture = await capture(
      session,
      options.captureDirectory,
      'race-parent.png'
    )
    await ensureNoError(page, 'Restored parent context')
    const finalState = {
      persistentRepositoryCount: await persistentRepositoryCount(page),
      repositoryTabCount: await tabCount(page),
      parentName: await currentRepositoryName(page),
      childContextVisible: await context.isVisible(),
      errorFree: true,
    }
    if (
      finalState.persistentRepositoryCount !==
        baseline.persistentRepositoryCount ||
      finalState.repositoryTabCount !== baseline.repositoryTabCount ||
      finalState.parentName !== baseline.parentName ||
      finalState.childContextVisible
    ) {
      fail('Duplicate Back did not restore the exact parent boundary.')
    }

    const receipt = {
      schemaVersion: 1,
      status: 'passed',
      duplicateOpen,
      duplicateBack,
      baseline,
      childState,
      finalState,
      captures: [childCapture, parentCapture],
    }
    fs.writeFileSync(
      path.join(options.runRoot, 'final-race-receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { flag: 'wx' }
    )
    process.stdout.write(`${JSON.stringify(receipt)}\n`)
  } finally {
    await session
      .send('Emulation.clearDeviceMetricsOverride')
      .catch(() => undefined)
  }
  // `connectOverCDP` owns a WebSocket only. Leave Electron running for the
  // caller's screenshot/desktop cleanup, but do not leave this verifier's
  // socket keeping its Node process alive after a successful receipt.
  process.exit(0)
}

if (require.main === module) {
  main().catch(error => {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        status: 'failed',
        error: String(error?.message ?? error).replace(/[\r\n]+/g, ' '),
      })}\n`
    )
    process.exit(1)
  })
}

module.exports = { isWithin, parseArguments }
