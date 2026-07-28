'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const verifierPath = path.join(__dirname, 'verify_internal_browser_cdp.js')
const {
  DefaultReceiptName,
  MaximumFixtureRequests,
  MaximumTargetCount,
  OwnedRunRootPrefix,
  closeFixtureServer,
  isContainedPath,
  parseArguments,
  startFixtureServer,
  validateReceipt,
  writeReceipt,
} = require(verifierPath)

function ownedRunRoot(suffix = 'contract-run') {
  return fs.mkdtempSync(path.join(os.tmpdir(), OwnedRunRootPrefix + suffix))
}

function requestFixture(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method,
        timeout: 2_000,
        headers: { Connection: 'close' },
      },
      response => {
        const chunks = []
        let bytes = 0
        response.on('data', chunk => {
          bytes += chunk.length
          if (bytes > 64 * 1024) {
            request.destroy(new Error('Fixture response is oversized.'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        )
      }
    )
    request.on('timeout', () =>
      request.destroy(new Error('Fixture request timed out.'))
    )
    request.on('error', reject)
    request.end()
  })
}

function passedReceipt(runId, fixturePort) {
  return {
    schemaVersion: 1,
    verifier: 'desktop-material-internal-browser-cdp',
    status: 'passed',
    runId,
    completedAt: '2026-07-27T12:00:00.000Z',
    cdp: {
      host: '127.0.0.1',
      port: 9337,
      targetLimit: MaximumTargetCount,
    },
    fixture: {
      host: '127.0.0.1',
      port: fixturePort,
      requestLimit: MaximumFixtureRequests,
      requestCount: 4,
      routeCounts: {
        redirect: 1,
        landing: 1,
        popup: 1,
        auth: 1,
        other: 0,
        rejected: 0,
      },
    },
    checks: {
      mainRendererIPC: {
        defaultInternalOpen: true,
        authenticationInternalOpen: true,
      },
      sameTabRedirect: {
        passed: true,
        remainedInternal: true,
        tabsBefore: 0,
        tabsAfter: 1,
        finalURL: 'http://127.0.0.1:41234/landing/0123456789abcdef',
      },
      windowOpen: {
        passed: true,
        tabsBefore: 1,
        tabsAfter: 2,
        sandboxedTargetAttached: true,
      },
      newTab: {
        passed: true,
        tabsBefore: 2,
        tabsAfter: 3,
        blankAddress: true,
      },
      bookmark: {
        passed: true,
        persistedURL: 'http://127.0.0.1:41234/landing/0123456789abcdef',
        queryStripped: true,
        fragmentStripped: true,
        persisted: true,
      },
      authentication: {
        passed: true,
        tabCount: 4,
        privateNoticeVisible: true,
        continueInSystemBrowserVisible: true,
        openExternalVisible: true,
        bookmarkDisabled: true,
        authenticationURLNotBookmarked: true,
      },
      externalActionClicked: false,
    },
    finalUi: {
      tabCount: 4,
      activeIntent: 'authentication',
      internalBrowserChromeAttached: true,
      sandboxedAuthenticationTargetAttached: true,
      screenshotReady: true,
    },
    cleanup: {
      cdpDisconnected: true,
      fixtureServerClosed: true,
    },
    error: null,
  }
}

test('argument parsing confines the receipt to a direct owned Temp root', t => {
  const runRoot = ownedRunRoot()
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  const receipt = path.join(runRoot, 'browser-verification.json')
  const parsed = parseArguments([
    '--port',
    '9337',
    '--run-root',
    runRoot,
    '--receipt',
    receipt,
  ])
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.runRoot, fs.realpathSync.native(runRoot))
  assert.equal(parsed.receiptPath, receipt)
  assert.ok(isContainedPath(fs.realpathSync.native(os.tmpdir()), receipt))

  const defaultParsed = parseArguments([
    '--port',
    '9337',
    '--run-root',
    runRoot,
  ])
  assert.equal(
    defaultParsed.receiptPath,
    path.join(runRoot, DefaultReceiptName)
  )

  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        runRoot,
        '--receipt',
        path.join(os.tmpdir(), 'escaped-browser-receipt.json'),
      ]),
    /directly inside/
  )
  const nested = path.join(runRoot, 'nested')
  fs.mkdirSync(nested)
  assert.throws(
    () => parseArguments(['--port', '9337', '--run-root', nested]),
    /direct Temp child/
  )
  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        runRoot,
        '--host',
        '0.0.0.0',
      ]),
    /Unsupported argument/
  )
})

test('loopback fixture exposes only bounded deterministic routes', async t => {
  const fixture = await startFixtureServer('0123456789abcdef')
  t.after(() => closeFixtureServer(fixture))
  const port = Number(new URL(fixture.origin).port)

  const redirect = await requestFixture(port, fixture.paths.redirect)
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.location, fixture.urls.landing)

  const landing = await requestFixture(port, fixture.paths.landing)
  assert.equal(landing.status, 200)
  assert.match(landing.body, /id="open-popup"/)
  assert.match(landing.body, /window\.open/)

  const popup = await requestFixture(port, fixture.paths.popup)
  assert.equal(popup.status, 200)
  assert.match(popup.body, /Popup became a tab/)

  const auth = await requestFixture(port, fixture.paths.auth)
  assert.equal(auth.status, 200)
  assert.match(auth.body, /Private authentication fixture/)
  assert.doesNotMatch(auth.body, /password|access[_ -]?token/i)

  const unknown = await requestFixture(port, '/not-a-fixture-route')
  assert.equal(unknown.status, 404)
  const rejected = await requestFixture(port, fixture.paths.auth, 'POST')
  assert.equal(rejected.status, 405)

  assert.deepEqual(fixture.stats.routeCounts, {
    redirect: 1,
    landing: 1,
    popup: 1,
    auth: 1,
    other: 1,
    rejected: 1,
  })
  assert.ok(fixture.stats.requestCount <= MaximumFixtureRequests)
})

test('strict passed receipt proves every required state and strips URL data', t => {
  const runRoot = ownedRunRoot('receipt-run')
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  const receiptPath = path.join(runRoot, 'receipt.json')
  const receipt = passedReceipt(path.basename(runRoot), 41234)
  assert.equal(validateReceipt(receipt), receipt)
  writeReceipt(receiptPath, receipt, runRoot)
  assert.deepEqual(JSON.parse(fs.readFileSync(receiptPath, 'utf8')), receipt)

  assert.throws(
    () =>
      validateReceipt({
        ...receipt,
        checks: {
          ...receipt.checks,
          externalActionClicked: true,
        },
      }),
    /required browser behavior/
  )
  assert.throws(
    () =>
      validateReceipt({
        ...receipt,
        checks: {
          ...receipt.checks,
          bookmark: {
            ...receipt.checks.bookmark,
            persistedURL: `${receipt.checks.bookmark.persistedURL}?code=bad`,
          },
        },
      }),
    /query string or fragment/
  )
  assert.throws(
    () => validateReceipt({ ...receipt, unexpected: true }),
    /unexpected schema/
  )
})

test('helper is attach-only and never activates an external-browser action', () => {
  const source = fs.readFileSync(verifierPath, 'utf8')
  for (const forbidden of [
    "require('node:child_process')",
    "require('child_process')",
    'chromium.launch(',
    'electron.launch(',
    'process.kill(',
    '.bringToFront(',
    'show_headless_desktop',
    'window.close(',
    "clickChromeControl(\n      chromeClient,\n      '.internal-browser-external-button'",
    "clickChromeControl(\n      chromeClient,\n      '.internal-browser-auth-notice button'",
    "type: 'open-external'",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  assert.match(source, /ipcRenderer\.invoke\('open-external'/)
  assert.match(source, /externalActionClicked: false/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /MaximumTargetCount = 32/)
  assert.match(source, /MaximumFixtureRequests = 32/)
})

test('helper names the real chrome, selectors, views, and explicit intent', () => {
  const source = fs.readFileSync(verifierPath, 'utf8')
  for (const contract of [
    'internal-browser\\.html',
    '.internal-browser-tab',
    'button[aria-label="New tab"]',
    'button[aria-label="Add bookmark"]',
    '.internal-browser-auth-notice[role="status"]',
    '.internal-browser-auth-notice button',
    '.internal-browser-external-button',
    '#open-popup',
    'window.open',
    "'default'",
    "'authentication'",
    "mode: 'internal'",
    'typeof process',
    'typeof require',
    'sandboxedAuthenticationTargetAttached',
  ]) {
    assert.ok(source.includes(contract), `missing contract: ${contract}`)
  }
  assert.match(
    source,
    /openThroughMainRenderer\(\s*mainClient,\s*fixture\.urls\.auth,\s*'authentication'/
  )
})
