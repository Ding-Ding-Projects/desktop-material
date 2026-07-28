#!/usr/bin/env node
'use strict'

/**
 * Attach-only verification for Desktop Material's app-hosted browser.
 *
 * The caller owns the already-running production Electron process, its
 * loopback remote-debugging port, the hidden Win32 desktop, and the direct
 * Temp run root. This helper never launches, focuses, closes, or terminates an
 * application or native window. It starts one bounded loopback HTTP fixture,
 * drives the trusted renderers through CDP, detaches, stops its fixture, and
 * leaves the final authentication tab visible for a Lowlevel HWND capture.
 *
 * Example:
 *   node .codex/verification/verify_internal_browser_cdp.js \
 *     --port 9337 \
 *     --run-root %TEMP%\desktop-material-internal-browser-cdp-<run-id> \
 *     --receipt %TEMP%\desktop-material-internal-browser-cdp-<run-id>\browser.json
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const WebSocket = require('ws')

const VerifierName = 'desktop-material-internal-browser-cdp'
const ReceiptSchemaVersion = 1
const OwnedRunRootPrefix = 'desktop-material-internal-browser-cdp-'
const DefaultReceiptName = 'internal-browser-cdp-receipt.json'
const MaximumTargetCount = 32
const MaximumAttachedTargets = 6
const MaximumFixtureRequests = 32
const MaximumDiscoveryBytes = 1024 * 1024
const MaximumReceiptBytes = 64 * 1024
const MaximumCDPMessageBytes = 2 * 1024 * 1024
const DiscoveryTimeoutMs = 20_000
const InteractionTimeoutMs = 15_000
const CommandTimeoutMs = 5_000
const CleanupTimeoutMs = 2_000
const PollIntervalMs = 100

function fail(message) {
  throw new Error(message)
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) {
    fail(`${label} must be an object.`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} has an unexpected schema.`)
  }
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

function assertRealDirectory(candidate, label) {
  let linkStatus
  let realPath
  let realStatus
  try {
    linkStatus = fs.lstatSync(candidate)
    realPath = fs.realpathSync.native(candidate)
    realStatus = fs.lstatSync(realPath)
  } catch {
    fail(`${label} is missing.`)
  }
  if (
    !linkStatus.isDirectory() ||
    linkStatus.isSymbolicLink() ||
    !realStatus.isDirectory() ||
    linkStatus.dev !== realStatus.dev ||
    linkStatus.ino !== realStatus.ino
  ) {
    fail(`${label} must be a real directory, not a link or junction.`)
  }
  return realPath
}

function parseArguments(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    fail('Arguments must be supplied as --name value pairs.')
  }
  const allowed = new Set(['port', 'run-root', 'receipt'])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    const key = name.slice(2)
    if (!allowed.has(key)) {
      fail(`Unsupported argument --${key}.`)
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

  const runRootValue = values.get('run-root')
  if (
    runRootValue === undefined ||
    runRootValue.trim().length === 0 ||
    !path.isAbsolute(runRootValue)
  ) {
    fail('--run-root must be an absolute caller-owned Temp path.')
  }
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(
    path.resolve(runRootValue),
    'Caller-owned run root'
  )
  if (
    path.dirname(runRoot).toLowerCase() !== tempRoot.toLowerCase() ||
    !new RegExp(`^${OwnedRunRootPrefix}[A-Za-z0-9][A-Za-z0-9._-]{5,100}$`).test(
      path.basename(runRoot)
    )
  ) {
    fail(`Run root must be a direct Temp child named ${OwnedRunRootPrefix}*.`)
  }

  const receiptValue = values.get('receipt')
  const requestedReceipt =
    receiptValue === undefined
      ? path.join(runRoot, DefaultReceiptName)
      : path.resolve(receiptValue)
  if (
    (receiptValue !== undefined && !path.isAbsolute(receiptValue)) ||
    path.dirname(requestedReceipt).toLowerCase() !== runRoot.toLowerCase() ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{1,100}\.json$/i.test(
      path.basename(requestedReceipt)
    ) ||
    fs.existsSync(requestedReceipt)
  ) {
    fail(
      'Receipt must be a new JSON file directly inside the caller-owned run root.'
    )
  }
  const receiptParent = assertRealDirectory(
    path.dirname(requestedReceipt),
    'Receipt parent'
  )
  if (
    receiptParent.toLowerCase() !== runRoot.toLowerCase() ||
    !isContainedPath(tempRoot, requestedReceipt)
  ) {
    fail('Receipt escaped the caller-owned run root.')
  }

  return {
    port,
    runRoot,
    runId: path.basename(runRoot),
    receiptPath: requestedReceipt,
  }
}

function fixtureToken(runRoot) {
  return crypto
    .createHash('sha256')
    .update(path.basename(runRoot))
    .digest('hex')
    .slice(0, 16)
}

function htmlDocument(title, body, script = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
  <link rel="icon" href="data:,">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
    body { margin: 0; padding: 48px; background: Canvas; color: CanvasText; }
    main { max-width: 720px; margin: auto; }
    button { min-height: 44px; padding: 8px 18px; font: inherit; }
  </style>
</head>
<body>
  <main>${body}</main>
  ${script}
</body>
</html>`
}

function createFixtureDefinition(token, port) {
  if (!/^[a-f0-9]{16}$/.test(token)) {
    fail('Fixture token is invalid.')
  }
  const paths = Object.freeze({
    redirect: `/redirect/${token}`,
    landing: `/landing/${token}`,
    popup: `/popup/${token}`,
    auth: `/auth/${token}`,
  })
  const origin = `http://127.0.0.1:${port}`
  const urls = Object.freeze({
    redirect: `${origin}${paths.redirect}?view=start#proof`,
    landing: `${origin}${paths.landing}?view=redirected#proof`,
    popup: `${origin}${paths.popup}?source=window-open#proof`,
    auth: `${origin}${paths.auth}?display=authentication#proof`,
  })
  return { origin, paths, urls }
}

function sendFixtureResponse(response, statusCode, headers, body = '') {
  const encoded = Buffer.from(body, 'utf8')
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    Connection: 'close',
    'Content-Length': encoded.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(encoded)
}

async function startFixtureServer(token) {
  const stats = {
    requestCount: 0,
    routeCounts: {
      redirect: 0,
      landing: 0,
      popup: 0,
      auth: 0,
      other: 0,
      rejected: 0,
    },
  }
  let definition = null
  const server = http.createServer((request, response) => {
    stats.requestCount += 1
    if (stats.requestCount > MaximumFixtureRequests) {
      stats.routeCounts.rejected += 1
      sendFixtureResponse(
        response,
        429,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        'Fixture request limit reached.'
      )
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      stats.routeCounts.rejected += 1
      sendFixtureResponse(
        response,
        405,
        {
          Allow: 'GET, HEAD',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        'Method not allowed.'
      )
      return
    }
    if (
      typeof request.url !== 'string' ||
      request.url.length === 0 ||
      request.url.length > 2_048
    ) {
      stats.routeCounts.rejected += 1
      sendFixtureResponse(
        response,
        414,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        'Request target is invalid.'
      )
      return
    }

    let requested
    try {
      requested = new URL(request.url, 'http://127.0.0.1')
    } catch {
      stats.routeCounts.rejected += 1
      sendFixtureResponse(
        response,
        400,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        'Malformed request target.'
      )
      return
    }

    const { paths, urls } = definition
    if (requested.pathname === paths.redirect) {
      stats.routeCounts.redirect += 1
      sendFixtureResponse(response, 302, { Location: urls.landing })
      return
    }
    if (requested.pathname === paths.landing) {
      stats.routeCounts.landing += 1
      const popupTarget = `${paths.popup}?source=window-open#proof`
      sendFixtureResponse(
        response,
        200,
        { 'Content-Type': 'text/html; charset=utf-8' },
        htmlDocument(
          'Internal Browser Redirect Fixture',
          '<h1>Redirect stayed in Desktop Material</h1><p>This deterministic loopback page contains no account data.</p><button id="open-popup" type="button">Open fixture popup</button>',
          `<script>
document.getElementById('open-popup').addEventListener('click', () => {
  window.open(${JSON.stringify(popupTarget)}, '_blank')
})
</script>`
        )
      )
      return
    }
    if (requested.pathname === paths.popup) {
      stats.routeCounts.popup += 1
      sendFixtureResponse(
        response,
        200,
        { 'Content-Type': 'text/html; charset=utf-8' },
        htmlDocument(
          'Internal Browser Popup Fixture',
          '<h1>Popup became a tab</h1><p>The app kept this window.open target inside its tab strip.</p>'
        )
      )
      return
    }
    if (requested.pathname === paths.auth) {
      stats.routeCounts.auth += 1
      sendFixtureResponse(
        response,
        200,
        { 'Content-Type': 'text/html; charset=utf-8' },
        htmlDocument(
          'Internal Browser Authentication Fixture',
          '<h1>Private authentication fixture</h1><p>No real account, credential, or provider is used by this verification page.</p>'
        )
      )
      return
    }

    stats.routeCounts.other += 1
    sendFixtureResponse(
      response,
      404,
      { 'Content-Type': 'text/plain; charset=utf-8' },
      'Not found.'
    )
  })
  server.maxConnections = 8
  server.maxHeadersCount = 32
  server.headersTimeout = 2_000
  server.requestTimeout = 2_000
  server.keepAliveTimeout = 1_000

  await new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true })
  })
  const address = server.address()
  if (
    address === null ||
    typeof address === 'string' ||
    address.address !== '127.0.0.1'
  ) {
    await closeFixtureServer({ server }).catch(() => undefined)
    fail('Fixture server did not bind only to IPv4 loopback.')
  }
  definition = createFixtureDefinition(token, address.port)
  return {
    server,
    stats,
    ...definition,
  }
}

async function closeFixtureServer(fixture) {
  if (fixture?.server === undefined || !fixture.server.listening) {
    return true
  }
  if (typeof fixture.server.closeAllConnections === 'function') {
    fixture.server.closeAllConnections()
  }
  let timer
  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        fixture.server.close(error => {
          if (error === undefined) {
            resolve()
          } else {
            reject(error)
          }
        })
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Fixture server cleanup timed out.')),
          CleanupTimeoutMs
        )
      }),
    ])
    return true
  } finally {
    clearTimeout(timer)
  }
}

function requestJSON(port, requestPath) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0
    const chunks = []
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        timeout: CommandTimeoutMs,
        headers: { Connection: 'close' },
      },
      response => {
        response.on('data', chunk => {
          totalBytes += chunk.length
          if (totalBytes > MaximumDiscoveryBytes) {
            request.destroy(new Error('CDP discovery response is oversized.'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`CDP discovery returned ${response.statusCode}.`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () =>
      request.destroy(new Error('CDP discovery timed out.'))
    )
    request.on('error', reject)
  })
}

async function listTargets(port) {
  const targets = await requestJSON(port, '/json/list')
  if (!Array.isArray(targets) || targets.length > MaximumTargetCount) {
    fail(`CDP target count must stay at or below ${MaximumTargetCount}.`)
  }
  return targets.filter(
    target =>
      isObject(target) &&
      typeof target.id === 'string' &&
      typeof target.type === 'string' &&
      typeof target.url === 'string' &&
      target.url.length <= 8_192 &&
      typeof target.webSocketDebuggerUrl === 'string'
  )
}

async function waitForSingleTarget(port, predicate, label) {
  const deadline = Date.now() + DiscoveryTimeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets(port)
      const matches = targets.filter(predicate)
      if (matches.length > 1) {
        fail(`More than one ${label} target was discovered.`)
      }
      if (matches.length === 1) {
        return matches[0]
      }
    } catch (error) {
      lastError = error
    }
    await delay(PollIntervalMs)
  }
  throw lastError ?? new Error(`Timed out waiting for ${label}.`)
}

function isMainRendererTarget(target) {
  return (
    target.type === 'page' && /\/out\/index\.html(?:[?#]|$)/.test(target.url)
  )
}

function isInternalBrowserChromeTarget(target) {
  return (
    target.type === 'page' &&
    /\/out\/internal-browser\.html(?:[?#]|$)/.test(target.url)
  )
}

function fixtureTargetPredicate(fixture, expectedPath) {
  return target => {
    try {
      const url = new URL(target.url)
      return (
        (target.type === 'page' || target.type === 'webview') &&
        url.origin === fixture.origin &&
        url.pathname === expectedPath
      )
    } catch {
      return false
    }
  }
}

class CDPClient {
  constructor(target, port) {
    if (!isObject(target) || typeof target.webSocketDebuggerUrl !== 'string') {
      fail('CDP target has no debugger URL.')
    }
    const debuggerURL = new URL(target.webSocketDebuggerUrl)
    if (
      debuggerURL.protocol !== 'ws:' ||
      debuggerURL.hostname !== '127.0.0.1' ||
      Number(debuggerURL.port) !== port
    ) {
      fail('CDP target debugger URL is not on the supplied loopback port.')
    }
    this.socket = new WebSocket(debuggerURL.toString(), {
      handshakeTimeout: CommandTimeoutMs,
      maxPayload: MaximumCDPMessageBytes,
      perMessageDeflate: false,
    })
    this.nextId = 1
    this.pending = new Map()
    this.opened = false
  }

  async open() {
    let timer
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('CDP WebSocket handshake timed out.')),
          CommandTimeoutMs
        )
        this.socket.once('open', resolve)
        this.socket.once('error', reject)
      })
    } finally {
      clearTimeout(timer)
    }
    this.opened = true
    this.socket.on('message', payload => {
      let message
      try {
        message = JSON.parse(String(payload))
      } catch {
        return
      }
      if (!Number.isSafeInteger(message.id)) {
        return
      }
      const pending = this.pending.get(message.id)
      if (pending === undefined) {
        return
      }
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error !== undefined) {
        pending.reject(
          new Error(message.error.message ?? 'CDP command failed.')
        )
      } else {
        pending.resolve(message.result)
      }
    })
    this.socket.on('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('CDP connection closed.'))
      }
      this.pending.clear()
    })
    this.socket.on('error', () => {
      // Per-command timeout and close handling provide the actionable error.
    })
  }

  send(method, params = {}) {
    if (!this.opened || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP connection is not open.'))
    }
    if (this.pending.size >= 16) {
      return Promise.reject(new Error('Too many pending CDP commands.'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command ${method} timed out.`))
      }, CommandTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }), error => {
        if (error !== undefined && error !== null) {
          const pending = this.pending.get(id)
          if (pending !== undefined) {
            clearTimeout(pending.timer)
            this.pending.delete(id)
          }
          reject(error)
        }
      })
    })
  }

  async disconnect() {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return true
    }
    if (this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.terminate()
      return true
    }
    let timer
    try {
      await Promise.race([
        new Promise(resolve => {
          this.socket.once('close', resolve)
          if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.close(1000, 'verification complete')
          }
        }),
        new Promise(resolve => {
          timer = setTimeout(resolve, CleanupTimeoutMs)
        }),
      ])
      if (this.socket.readyState !== WebSocket.CLOSED) {
        this.socket.terminate()
      }
      return true
    } finally {
      clearTimeout(timer)
    }
  }
}

async function attachTarget(target, port, clients) {
  if (clients.length >= MaximumAttachedTargets) {
    fail(`No more than ${MaximumAttachedTargets} CDP targets may be attached.`)
  }
  const client = new CDPClient(target, port)
  // Register before awaiting the handshake so the caller's finally path also
  // owns a socket whose handshake fails or times out.
  clients.push(client)
  await client.open()
  return client
}

async function evaluate(client, expression, userGesture = false) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  })
  if (result.exceptionDetails !== undefined) {
    fail(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Renderer evaluation failed.'
    )
  }
  return result.result?.value
}

async function waitForValue(client, expression, predicate, label) {
  const deadline = Date.now() + InteractionTimeoutMs
  let lastValue
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate(client, expression)
      if (predicate(lastValue)) {
        return lastValue
      }
    } catch {
      // Renderer startup and navigation briefly invalidate execution contexts.
    }
    await delay(PollIntervalMs)
  }
  fail(
    `Timed out waiting for ${label}; last value was ${JSON.stringify(
      lastValue
    ).slice(0, 300)}.`
  )
}

async function openThroughMainRenderer(client, url, intent) {
  const opened = await evaluate(
    client,
    `(async () => {
      const { ipcRenderer } = require('electron')
      return await ipcRenderer.invoke('open-external', ${JSON.stringify(url)}, {
        mode: 'internal',
        intent: ${JSON.stringify(intent)},
      })
    })()`,
    true
  )
  if (opened !== true) {
    fail(`The main renderer rejected the ${intent} internal-browser request.`)
  }
  return true
}

const NewTabSelector =
  'button[aria-label="New tab"], button[aria-label="新分頁"], button[aria-label^="New tab · "]'
const BookmarkToggleSelector =
  'button[aria-label="Add bookmark"], button[aria-label="Remove bookmark"], button[aria-label="加入書籤"], button[aria-label="移除書籤"], button[aria-label^="Add bookmark · "], button[aria-label^="Remove bookmark · "]'

const ChromeSnapshotExpression = `(() => {
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    )
  }
  const tabs = [...document.querySelectorAll('.internal-browser-tab')]
  const selected = tabs.filter(tab =>
    tab.querySelector('[role="tab"]')?.getAttribute('aria-selected') === 'true'
  )
  const address = document.querySelector('.internal-browser-address input')
  const newTab = document.querySelector(${JSON.stringify(NewTabSelector)})
  const addBookmark = document.querySelector(
    ${JSON.stringify(BookmarkToggleSelector)}
  )
  const external = document.querySelector('.internal-browser-external-button')
  const authNotice = document.querySelector(
    '.internal-browser-auth-notice[role="status"]'
  )
  const authAction = document.querySelector(
    '.internal-browser-auth-notice button'
  )
  const selectedTab = selected[0] ?? null
  const viewport = document.querySelector('.internal-browser-content-viewport')
  const viewportBounds = viewport?.getBoundingClientRect()
  return {
    title: document.title,
    tabCount: tabs.length,
    selectedCount: selected.length,
    selectedTitle:
      selectedTab?.querySelector('.internal-browser-tab-title')?.textContent?.trim() ??
      '',
    selectedAuthentication:
      selectedTab?.querySelector('.internal-browser-auth-chip') !== null,
    address: address instanceof HTMLInputElement ? address.value : null,
    newTabVisible: visible(newTab),
    bookmarkButtonPresent: addBookmark instanceof HTMLButtonElement,
    bookmarkDisabled:
      addBookmark instanceof HTMLButtonElement ? addBookmark.disabled : null,
    bookmarkLabel: addBookmark?.getAttribute('aria-label') ?? null,
    bookmarkSelected:
      addBookmark instanceof HTMLButtonElement &&
      addBookmark.classList.contains('selected'),
    externalVisible: visible(external),
    externalText: external?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    authNoticeVisible: visible(authNotice),
    authNoticeText: authNotice?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    authActionVisible: visible(authAction),
    authActionText: authAction?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    bookmarkStorage:
      localStorage.getItem('internal-browser-bookmarks-v1'),
    bookmarkTitles: [
      ...document.querySelectorAll('.internal-browser-bookmarks button'),
    ].map(button => button.textContent?.trim() ?? ''),
    viewportWidth: Math.round(viewportBounds?.width ?? 0),
    viewportHeight: Math.round(viewportBounds?.height ?? 0),
    noHorizontalOverflow:
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1 &&
      document.body.scrollWidth <= document.body.clientWidth + 1,
    errorVisible: visible(
      document.querySelector('.internal-browser-error-notice')
    ),
  }
})()`

async function waitForChrome(client, predicate, label) {
  return waitForValue(
    client,
    ChromeSnapshotExpression,
    value => isObject(value) && predicate(value),
    label
  )
}

async function clickChromeControl(client, selector, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector(${JSON.stringify(selector)})
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return false
      }
      const style = getComputedStyle(button)
      const bounds = button.getBoundingClientRect()
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        return false
      }
      button.click()
      return true
    })()`,
    true
  )
  if (clicked !== true) {
    fail(`${label} was not an enabled visible browser-chrome control.`)
  }
}

async function inspectSandboxedFixtureTarget(client, expectedPath, title) {
  const snapshot = await waitForValue(
    client,
    `(() => ({
      path: location.pathname,
      title: document.title,
      ready: document.readyState,
      nodeProcessType: typeof process,
      nodeRequireType: typeof require,
      bodyText: document.body?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`,
    value =>
      isObject(value) &&
      value.path === expectedPath &&
      value.title === title &&
      value.ready === 'complete',
    `sandboxed fixture target ${expectedPath}`
  )
  if (
    snapshot.nodeProcessType !== 'undefined' ||
    snapshot.nodeRequireType !== 'undefined' ||
    snapshot.bodyText.length < 20
  ) {
    fail(`Fixture target ${expectedPath} is not a usable sandboxed page.`)
  }
  return snapshot
}

function safeBookmarkURL(value) {
  const parsed = new URL(value)
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function parseBookmarkStorage(serialized) {
  if (serialized === null) {
    return []
  }
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(serialized) > 128 * 1024
  ) {
    fail('Internal-browser bookmark storage is oversized.')
  }
  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    fail('Internal-browser bookmark storage is not JSON.')
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    fail('Internal-browser bookmark storage has an invalid shape.')
  }
  return parsed
}

function assertPassedReceipt(receipt) {
  const { checks, finalUi, fixture } = receipt
  exactKeys(
    checks,
    [
      'mainRendererIPC',
      'sameTabRedirect',
      'windowOpen',
      'newTab',
      'bookmark',
      'authentication',
      'externalActionClicked',
    ],
    'Receipt checks'
  )
  exactKeys(
    checks.mainRendererIPC,
    ['defaultInternalOpen', 'authenticationInternalOpen'],
    'Receipt main-renderer IPC checks'
  )
  exactKeys(
    checks.sameTabRedirect,
    ['passed', 'remainedInternal', 'tabsBefore', 'tabsAfter', 'finalURL'],
    'Receipt redirect checks'
  )
  exactKeys(
    checks.windowOpen,
    ['passed', 'tabsBefore', 'tabsAfter', 'sandboxedTargetAttached'],
    'Receipt window.open checks'
  )
  exactKeys(
    checks.newTab,
    ['passed', 'tabsBefore', 'tabsAfter', 'blankAddress'],
    'Receipt new-tab checks'
  )
  exactKeys(
    checks.bookmark,
    [
      'passed',
      'persistedURL',
      'queryStripped',
      'fragmentStripped',
      'persisted',
    ],
    'Receipt bookmark checks'
  )
  exactKeys(
    checks.authentication,
    [
      'passed',
      'tabCount',
      'privateNoticeVisible',
      'continueInSystemBrowserVisible',
      'openExternalVisible',
      'bookmarkDisabled',
      'authenticationURLNotBookmarked',
    ],
    'Receipt authentication checks'
  )
  if (
    checks.externalActionClicked !== false ||
    checks.mainRendererIPC.defaultInternalOpen !== true ||
    checks.mainRendererIPC.authenticationInternalOpen !== true ||
    checks.sameTabRedirect.passed !== true ||
    checks.sameTabRedirect.remainedInternal !== true ||
    checks.sameTabRedirect.tabsBefore !== 0 ||
    checks.sameTabRedirect.tabsAfter !== 1 ||
    checks.windowOpen.passed !== true ||
    checks.windowOpen.tabsBefore !== 1 ||
    checks.windowOpen.tabsAfter !== 2 ||
    checks.windowOpen.sandboxedTargetAttached !== true ||
    checks.newTab.passed !== true ||
    checks.newTab.tabsBefore !== 2 ||
    checks.newTab.tabsAfter !== 3 ||
    checks.newTab.blankAddress !== true ||
    checks.bookmark.passed !== true ||
    checks.bookmark.queryStripped !== true ||
    checks.bookmark.fragmentStripped !== true ||
    checks.bookmark.persisted !== true ||
    checks.authentication.passed !== true ||
    checks.authentication.tabCount !== 4 ||
    checks.authentication.privateNoticeVisible !== true ||
    checks.authentication.continueInSystemBrowserVisible !== true ||
    checks.authentication.openExternalVisible !== true ||
    checks.authentication.bookmarkDisabled !== true ||
    checks.authentication.authenticationURLNotBookmarked !== true
  ) {
    fail('Passed receipt does not prove every required browser behavior.')
  }
  for (const url of [
    checks.sameTabRedirect.finalURL,
    checks.bookmark.persistedURL,
  ]) {
    const parsed = new URL(url)
    if (parsed.search !== '' || parsed.hash !== '') {
      fail('Receipt persisted a query string or fragment.')
    }
  }
  exactKeys(
    finalUi,
    [
      'tabCount',
      'activeIntent',
      'internalBrowserChromeAttached',
      'sandboxedAuthenticationTargetAttached',
      'screenshotReady',
    ],
    'Receipt final UI'
  )
  if (
    finalUi.tabCount !== 4 ||
    finalUi.activeIntent !== 'authentication' ||
    finalUi.internalBrowserChromeAttached !== true ||
    finalUi.sandboxedAuthenticationTargetAttached !== true ||
    finalUi.screenshotReady !== true
  ) {
    fail('Final browser UI is not screenshot-ready.')
  }
  if (
    !isObject(fixture) ||
    fixture.host !== '127.0.0.1' ||
    !Number.isSafeInteger(fixture.port) ||
    fixture.port < 1 ||
    fixture.port > 65535 ||
    fixture.requestLimit !== MaximumFixtureRequests ||
    !Number.isSafeInteger(fixture.requestCount) ||
    fixture.requestCount < 4 ||
    fixture.requestCount > MaximumFixtureRequests
  ) {
    fail('Receipt fixture summary is invalid.')
  }
  exactKeys(
    fixture,
    ['host', 'port', 'requestLimit', 'requestCount', 'routeCounts'],
    'Receipt fixture'
  )
  exactKeys(
    fixture.routeCounts,
    ['redirect', 'landing', 'popup', 'auth', 'other', 'rejected'],
    'Receipt fixture routes'
  )
  let countedRequests = 0
  for (const count of Object.values(fixture.routeCounts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      fail('Receipt fixture route count is invalid.')
    }
    countedRequests += count
  }
  if (countedRequests !== fixture.requestCount) {
    fail('Receipt fixture route counts do not match its request total.')
  }
  for (const route of ['redirect', 'landing', 'popup', 'auth']) {
    if (!Number.isSafeInteger(fixture.routeCounts?.[route])) {
      fail(`Receipt fixture route ${route} is invalid.`)
    }
    if (fixture.routeCounts[route] < 1) {
      fail(`Receipt fixture route ${route} was not exercised.`)
    }
  }
}

function validateReceipt(receipt) {
  exactKeys(
    receipt,
    [
      'schemaVersion',
      'verifier',
      'status',
      'runId',
      'completedAt',
      'cdp',
      'fixture',
      'checks',
      'finalUi',
      'cleanup',
      'error',
    ],
    'Receipt'
  )
  if (
    receipt.schemaVersion !== ReceiptSchemaVersion ||
    receipt.verifier !== VerifierName ||
    (receipt.status !== 'passed' && receipt.status !== 'failed') ||
    typeof receipt.runId !== 'string' ||
    !new RegExp(`^${OwnedRunRootPrefix}[A-Za-z0-9][A-Za-z0-9._-]{5,100}$`).test(
      receipt.runId
    ) ||
    Number.isNaN(Date.parse(receipt.completedAt))
  ) {
    fail('Receipt identity is invalid.')
  }
  exactKeys(receipt.cdp, ['host', 'port', 'targetLimit'], 'Receipt CDP')
  if (
    receipt.cdp.host !== '127.0.0.1' ||
    !Number.isSafeInteger(receipt.cdp.port) ||
    receipt.cdp.port < 1 ||
    receipt.cdp.port > 65535 ||
    receipt.cdp.targetLimit !== MaximumTargetCount
  ) {
    fail('Receipt CDP endpoint is invalid.')
  }
  exactKeys(
    receipt.cleanup,
    ['cdpDisconnected', 'fixtureServerClosed'],
    'Receipt cleanup'
  )
  if (
    typeof receipt.cleanup.cdpDisconnected !== 'boolean' ||
    typeof receipt.cleanup.fixtureServerClosed !== 'boolean'
  ) {
    fail('Receipt cleanup state is invalid.')
  }

  if (receipt.status === 'passed') {
    if (
      receipt.error !== null ||
      receipt.cleanup.cdpDisconnected !== true ||
      receipt.cleanup.fixtureServerClosed !== true
    ) {
      fail('Passed receipt has an error or incomplete cleanup.')
    }
    assertPassedReceipt(receipt)
  } else {
    if (
      receipt.checks !== null ||
      receipt.finalUi !== null ||
      !isObject(receipt.error)
    ) {
      fail('Failed receipt schema is invalid.')
    }
    exactKeys(receipt.error, ['code', 'message'], 'Receipt error')
    if (
      receipt.error.code !== 'verification-failed' ||
      typeof receipt.error.message !== 'string' ||
      receipt.error.message.length < 1 ||
      receipt.error.message.length > 400
    ) {
      fail('Failed receipt error is invalid.')
    }
  }
  return receipt
}

function writeReceipt(receiptPath, receipt, runRoot) {
  const realRunRoot = assertRealDirectory(runRoot, 'Receipt run root')
  const realParent = assertRealDirectory(
    path.dirname(receiptPath),
    'Receipt parent'
  )
  if (
    realParent.toLowerCase() !== realRunRoot.toLowerCase() ||
    fs.existsSync(receiptPath)
  ) {
    fail('Receipt destination is no longer a new file in the owned run root.')
  }
  validateReceipt(receipt)
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`
  if (Buffer.byteLength(serialized) > MaximumReceiptBytes) {
    fail('Receipt is unexpectedly large.')
  }
  fs.writeFileSync(receiptPath, serialized, {
    encoding: 'utf8',
    flag: 'wx',
  })
}

function sanitizedError(error) {
  return String(error?.message ?? error)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 400)
}

async function runVerification(options) {
  const clients = []
  let fixture = null
  let checks = null
  let finalUi = null
  let failure = null
  let cdpDisconnected = false
  let fixtureServerClosed = false

  try {
    const initialTargets = await listTargets(options.port)
    const mainTargets = initialTargets.filter(isMainRendererTarget)
    if (mainTargets.length !== 1) {
      fail('Exactly one Desktop Material main renderer must be running.')
    }
    if (initialTargets.some(isInternalBrowserChromeTarget)) {
      fail('The internal browser must be closed before this isolated run.')
    }

    const mainClient = await attachTarget(mainTargets[0], options.port, clients)
    await waitForValue(
      mainClient,
      `document.querySelector('#desktop-app-container, #desktop-app-contents') !== null`,
      value => value === true,
      'Desktop Material main renderer'
    )

    fixture = await startFixtureServer(fixtureToken(options.runRoot))
    await openThroughMainRenderer(mainClient, fixture.urls.redirect, 'default')

    const chromeTarget = await waitForSingleTarget(
      options.port,
      isInternalBrowserChromeTarget,
      'internal-browser.html chrome'
    )
    const chromeClient = await attachTarget(chromeTarget, options.port, clients)
    const redirectedChrome = await waitForChrome(
      chromeClient,
      snapshot =>
        snapshot.tabCount === 1 &&
        snapshot.selectedCount === 1 &&
        snapshot.address === fixture.urls.landing &&
        snapshot.newTabVisible === true &&
        snapshot.bookmarkDisabled === false,
      'one redirected internal tab'
    )

    const landingTarget = await waitForSingleTarget(
      options.port,
      fixtureTargetPredicate(fixture, fixture.paths.landing),
      'redirect landing WebContentsView'
    )
    const landingClient = await attachTarget(
      landingTarget,
      options.port,
      clients
    )
    await inspectSandboxedFixtureTarget(
      landingClient,
      fixture.paths.landing,
      'Internal Browser Redirect Fixture'
    )

    const expectedBookmarkURL = safeBookmarkURL(fixture.urls.landing)
    await clickChromeControl(
      chromeClient,
      BookmarkToggleSelector,
      'Add bookmark'
    )
    const bookmarkedChrome = await waitForChrome(
      chromeClient,
      snapshot => {
        if (snapshot.bookmarkSelected !== true) {
          return false
        }
        const bookmarks = parseBookmarkStorage(snapshot.bookmarkStorage)
        return bookmarks.some(bookmark => bookmark.url === expectedBookmarkURL)
      },
      'query-and-fragment-stripped bookmark persistence'
    )
    const bookmarksAfterLanding = parseBookmarkStorage(
      bookmarkedChrome.bookmarkStorage
    )
    const persistedBookmark = bookmarksAfterLanding.find(
      bookmark => bookmark.url === expectedBookmarkURL
    )
    if (
      !isObject(persistedBookmark) ||
      new URL(persistedBookmark.url).search !== '' ||
      new URL(persistedBookmark.url).hash !== ''
    ) {
      fail('Bookmark persistence retained a query string or fragment.')
    }

    const popupInvoked = await evaluate(
      landingClient,
      `(() => {
        const button = document.querySelector('#open-popup')
        if (!(button instanceof HTMLButtonElement)) return false
        button.click()
        return true
      })()`,
      true
    )
    if (popupInvoked !== true) {
      fail('The fixture window.open control was unavailable.')
    }
    await waitForChrome(
      chromeClient,
      snapshot =>
        snapshot.tabCount === 2 &&
        snapshot.selectedCount === 1 &&
        snapshot.address === fixture.urls.popup,
      'window.open target as the second internal tab'
    )
    const popupTarget = await waitForSingleTarget(
      options.port,
      fixtureTargetPredicate(fixture, fixture.paths.popup),
      'window.open WebContentsView'
    )
    const popupClient = await attachTarget(popupTarget, options.port, clients)
    await inspectSandboxedFixtureTarget(
      popupClient,
      fixture.paths.popup,
      'Internal Browser Popup Fixture'
    )

    await clickChromeControl(chromeClient, NewTabSelector, 'New tab')
    await waitForChrome(
      chromeClient,
      snapshot =>
        snapshot.tabCount === 3 &&
        snapshot.selectedCount === 1 &&
        snapshot.address === '' &&
        snapshot.selectedAuthentication === false,
      'new blank internal tab'
    )

    await openThroughMainRenderer(
      mainClient,
      fixture.urls.auth,
      'authentication'
    )
    const authChrome = await waitForChrome(
      chromeClient,
      snapshot =>
        snapshot.tabCount === 4 &&
        snapshot.selectedCount === 1 &&
        snapshot.address === fixture.urls.auth &&
        snapshot.selectedAuthentication === true &&
        snapshot.authNoticeVisible === true &&
        snapshot.authActionVisible === true &&
        snapshot.externalVisible === true &&
        snapshot.bookmarkDisabled === true,
      'explicit private authentication tab'
    )
    if (
      !/Private sign-in session|私人登入工作階段/i.test(
        authChrome.authNoticeText
      ) ||
      !/Continue in system browser|轉去系統瀏覽器繼續/i.test(
        authChrome.authActionText
      ) ||
      !/Open externally|喺外部開啟/i.test(authChrome.externalText)
    ) {
      fail('Authentication escape actions are not visibly and clearly named.')
    }

    const authTarget = await waitForSingleTarget(
      options.port,
      fixtureTargetPredicate(fixture, fixture.paths.auth),
      'authentication WebContentsView'
    )
    const authClient = await attachTarget(authTarget, options.port, clients)
    await inspectSandboxedFixtureTarget(
      authClient,
      fixture.paths.auth,
      'Internal Browser Authentication Fixture'
    )

    const bookmarksAfterAuth = parseBookmarkStorage(authChrome.bookmarkStorage)
    const safeAuthenticationURL = safeBookmarkURL(fixture.urls.auth)
    if (
      bookmarksAfterAuth.length !== bookmarksAfterLanding.length ||
      bookmarksAfterAuth.some(
        bookmark => bookmark.url === safeAuthenticationURL
      )
    ) {
      fail('Authentication URL entered persistent bookmark storage.')
    }
    if (
      authChrome.viewportWidth < 600 ||
      authChrome.viewportHeight < 200 ||
      authChrome.noHorizontalOverflow !== true ||
      authChrome.errorVisible !== false
    ) {
      fail('Final authentication browser chrome is clipped or unusable.')
    }

    checks = {
      mainRendererIPC: {
        defaultInternalOpen: true,
        authenticationInternalOpen: true,
      },
      sameTabRedirect: {
        passed: true,
        remainedInternal: true,
        tabsBefore: 0,
        tabsAfter: redirectedChrome.tabCount,
        finalURL: expectedBookmarkURL,
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
        persistedURL: persistedBookmark.url,
        queryStripped: true,
        fragmentStripped: true,
        persisted: true,
      },
      authentication: {
        passed: true,
        tabCount: authChrome.tabCount,
        privateNoticeVisible: true,
        continueInSystemBrowserVisible: true,
        openExternalVisible: true,
        bookmarkDisabled: true,
        authenticationURLNotBookmarked: true,
      },
      externalActionClicked: false,
    }
    finalUi = {
      tabCount: authChrome.tabCount,
      activeIntent: 'authentication',
      internalBrowserChromeAttached: true,
      sandboxedAuthenticationTargetAttached: true,
      screenshotReady: true,
    }

    // Let layout and the native child view settle before the caller captures
    // the still-open HWND through Lowlevel computer-use.
    await delay(300)
  } catch (error) {
    failure = error
  } finally {
    const disconnectResults = []
    for (const client of [...clients].reverse()) {
      disconnectResults.push(await client.disconnect().catch(() => false))
    }
    cdpDisconnected = disconnectResults.every(value => value === true)
    fixtureServerClosed = await closeFixtureServer(fixture).catch(() => false)
  }

  if (failure === null && (!cdpDisconnected || !fixtureServerClosed)) {
    failure = new Error('Verifier resource cleanup did not complete.')
  }
  const receipt = {
    schemaVersion: ReceiptSchemaVersion,
    verifier: VerifierName,
    status: failure === null ? 'passed' : 'failed',
    runId: options.runId,
    completedAt: new Date().toISOString(),
    cdp: {
      host: '127.0.0.1',
      port: options.port,
      targetLimit: MaximumTargetCount,
    },
    fixture:
      fixture === null
        ? null
        : {
            host: '127.0.0.1',
            port: Number(new URL(fixture.origin).port),
            requestLimit: MaximumFixtureRequests,
            requestCount: fixture.stats.requestCount,
            routeCounts: { ...fixture.stats.routeCounts },
          },
    checks: failure === null ? checks : null,
    finalUi: failure === null ? finalUi : null,
    cleanup: {
      cdpDisconnected,
      fixtureServerClosed,
    },
    error:
      failure === null
        ? null
        : {
            code: 'verification-failed',
            message: sanitizedError(failure),
          },
  }
  writeReceipt(options.receiptPath, receipt, options.runRoot)
  return { receipt, failure }
}

module.exports = {
  DefaultReceiptName,
  MaximumFixtureRequests,
  MaximumTargetCount,
  OwnedRunRootPrefix,
  createFixtureDefinition,
  isContainedPath,
  parseArguments,
  runVerification,
  startFixtureServer,
  closeFixtureServer,
  validateReceipt,
  writeReceipt,
}

if (require.main === module) {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    const message = sanitizedError(error)
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: ReceiptSchemaVersion,
        verifier: VerifierName,
        status: 'failed',
        error: { code: 'argument-validation-failed', message },
      })}\n`
    )
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }

  if (options !== undefined) {
    runVerification(options)
      .then(({ receipt, failure }) => {
        process.stdout.write(`${JSON.stringify(receipt)}\n`)
        if (failure !== null) {
          process.stderr.write(`${failure.stack ?? failure}\n`)
          process.exitCode = 1
        }
      })
      .catch(error => {
        process.stdout.write(
          `${JSON.stringify({
            schemaVersion: ReceiptSchemaVersion,
            verifier: VerifierName,
            status: 'failed',
            error: {
              code: 'receipt-write-failed',
              message: sanitizedError(error),
            },
          })}\n`
        )
        process.stderr.write(`${error.stack ?? error}\n`)
        process.exitCode = 1
      })
  }
}
