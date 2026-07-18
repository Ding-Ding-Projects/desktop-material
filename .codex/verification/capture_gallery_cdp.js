#!/usr/bin/env node
'use strict'

/**
 * Gallery screenshot driver (CDP attach mode).
 *
 * Connects to the already-running production build (launched on the hidden
 * Win32 desktop with --remote-debugging-port), seeds the deterministic
 * provider profile, drives surfaces entirely through the renderer (DOM plus
 * ipcRenderer-emitted menu events), fixes the capture viewport with CDP
 * device metrics, and writes canonical PNGs into docs/assets/screenshots.
 *
 * Usage:
 *   node .codex/verification/capture_gallery_cdp.js \
 *     --run-root %TEMP%\desktop-material-p0-ui-... [--port 9337] \
 *     --scenes seed,dump [--out docs/assets/screenshots]
 *   node ... --probe "expression"
 *   node ... --list
 */

const fs = require('fs')
const http = require('http')
const path = require('path')
const WebSocket = require('ws')

const repoRoot = path.resolve(__dirname, '..', '..')

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    values.set(name.slice(2), value)
  }
  return values
}

const args = parseArguments(process.argv.slice(2))
const port = Number(args.get('port') ?? '9337')
const outDir = path.resolve(
  repoRoot,
  args.get('out') ?? 'docs/assets/screenshots'
)
const runRoot = args.get('run-root')
const ready = runRoot
  ? JSON.parse(
      fs.readFileSync(path.join(runRoot, 'provider', 'ready.json'), 'utf8')
    )
  : null
const fixturePath = runRoot ? path.join(runRoot, 'fixture') : null
const fixtureSourcePath = runRoot ? path.join(runRoot, 'git-source') : null

const DefaultWidth = 1440
const DefaultHeight = 960

function getJSON(target) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: target, timeout: 5000 },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
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

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url, {
      handshakeTimeout: 5000,
      maxPayload: 64 * 1024 * 1024,
    })
    this.nextId = 1
    this.pending = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
    this.socket.on('message', data => {
      const message = JSON.parse(String(data))
      if (message.id === undefined) {
        return
      }
      const pending = this.pending.get(message.id)
      if (pending === undefined) {
        return
      }
      this.pending.delete(message.id)
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message ?? 'CDP failure'))
      } else {
        pending.resolve(message.result)
      }
    })
    this.socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP connection closed.'))
      }
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }), error => {
        if (error != null) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  close() {
    this.socket.close()
  }
}

let client = null

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(expression, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) {
        return
      }
    } catch {}
    await sleep(300)
  }
  fail(`Timed out waiting for ${label}.`)
}

async function setViewport(width = DefaultWidth, height = DefaultHeight) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await sleep(350)
}

async function capture(name) {
  fs.mkdirSync(outDir, { recursive: true })
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  const size = fs.statSync(file).size
  process.stdout.write(`CAPTURED ${name}.png ${size}b\n`)
  if (size < 20000) {
    process.stdout.write(`WARN ${name}.png is suspiciously small\n`)
  }
}

/** Emit a menu event directly to the renderer's ipc listener. */
async function menuEvent(name) {
  await evaluate(
    `require('electron').ipcRenderer.emit('menu-event', {}, ${JSON.stringify(
      name
    )}), true`
  )
  await sleep(500)
}

async function pressEscape(times = 1) {
  for (let index = 0; index < times; index++) {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await client.send('Input.dispatchKeyEvent', {
        type,
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      })
    }
    await sleep(300)
  }
}

async function clickText(label, options = {}) {
  const clicked = await evaluate(`(() => {
    const scope = ${
      options.within ? `document.querySelector(${JSON.stringify(options.within)})` : 'document'
    }
    if (!scope) return false
    const nodes = [...scope.querySelectorAll('button, [role="button"], a')]
    const target = nodes.find(node =>
      node.textContent.trim() === ${JSON.stringify(label)} &&
      node.getAttribute('aria-disabled') !== 'true' && !node.disabled
    )
    if (!target) return false
    target.scrollIntoView({ block: 'nearest' })
    target.click()
    return true
  })()`)
  if (!clicked && options.optional !== true) {
    fail(`Unable to activate "${label}".`)
  }
  return clicked
}

async function clickSelector(selector, options = {}) {
  const clicked = await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)})
    if (!(target instanceof HTMLElement)) return false
    target.scrollIntoView({ block: 'nearest' })
    target.click()
    return true
  })()`)
  if (!clicked && options.optional !== true) {
    fail(`Unable to click ${selector}.`)
  }
  return clicked
}

/** Set a React-controlled input's value with native setter + input event. */
async function setInput(selector, value) {
  const done = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
      return false
    }
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!done) {
    fail(`Unable to set input ${selector}.`)
  }
}

async function seedProfile() {
  const account = {
    endpoint: ready.endpoint.replace(/\/$/, ''),
    login: 'material-verifier-p0',
    id: 7130701,
  }
  const users = JSON.stringify([
    {
      token: '',
      login: account.login,
      endpoint: account.endpoint,
      emails: [
        {
          email: 'material-verifier@example.invalid',
          verified: true,
          primary: true,
          visibility: 'private',
        },
      ],
      avatarURL: '',
      id: account.id,
      name: 'Material Verification Account',
      plan: 'enterprise',
      provider: 'github',
    },
  ])

  const changed = await evaluate(`(() => {
    const expected = {
      'has-shown-welcome-flow': '1',
      'theme': 'light',
      'zoom-auto-fit-enabled': '1',
      'stats-opt-out': '1',
      'has-sent-stats-opt-in-ping': '1'
    }
    let changed = false
    for (const [key, value] of Object.entries(expected)) {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value)
        changed = true
      }
    }
    const expectedUsers = ${JSON.stringify(users)}
    let storedUsers = []
    try { storedUsers = JSON.parse(localStorage.getItem('users') || '[]') } catch {}
    const expectedAccount = JSON.parse(expectedUsers)[0]
    const present = Array.isArray(storedUsers) && storedUsers.some(value =>
      value?.provider === expectedAccount.provider &&
      value?.endpoint === expectedAccount.endpoint &&
      value?.login === expectedAccount.login &&
      value?.id === expectedAccount.id)
    if (!present) {
      localStorage.setItem('users', expectedUsers)
      changed = true
    }
    return changed
  })()`)

  if (changed) {
    await evaluate('window.location.reload(), true')
    await sleep(4500)
    await client.send('Runtime.enable')
  }
  process.stdout.write(`SEEDED changed=${changed}\n`)
}

async function ensureRepository(repositoryPath = fixturePath) {
  const hasRail = await evaluate(
    `document.querySelector('nav.repository-rail') !== null`
  )
  if (hasRail) {
    return
  }

  await menuEvent('add-local-repository')
  await waitFor(
    `document.querySelector('#add-existing-repository input[type="text"]') !== null`,
    'add repository dialog'
  )
  await setInput(
    '#add-existing-repository input[type="text"]',
    repositoryPath
  )
  await sleep(900)
  ;(await clickText('Add repository', { optional: true })) ||
    (await clickText('Add Repository', { optional: true }))
  await waitFor(
    `document.querySelector('nav.repository-rail') !== null`,
    'repository workspace',
    25000
  )
  await sleep(1500)
}

/** Switch to a repository section tab via its rail/tab label. */
async function showSection(label) {
  const done = await evaluate(`(() => {
    const rail = document.querySelector('nav.repository-rail')
    if (!rail) return false
    const target = [...rail.querySelectorAll('button')].find(button => {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      return name.trim().toLowerCase().startsWith(${JSON.stringify(
        label.toLowerCase()
      )})
    })
    if (!target) return false
    target.click()
    return true
  })()`)
  if (!done) {
    fail(`Unable to activate section ${label}.`)
  }
  await sleep(900)
}

/** Close every open dialog via its own controls, falling back to Escape. */
async function closeAllDialogs() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const open = await evaluate(
      `[...document.querySelectorAll('dialog')].some(d => d.open)`
    )
    if (!open) {
      return
    }
    const closed = await evaluate(`(() => {
      const dialogs = [...document.querySelectorAll('dialog')].filter(d => d.open)
      const dialog = dialogs.at(-1)
      if (!dialog) return false
      const control =
        dialog.querySelector('[aria-label="Dismiss"], [aria-label="Close"], .close-button') ??
        [...dialog.querySelectorAll('button')].find(b =>
          ['Cancel', 'Close', 'Done', 'Not now'].includes(b.textContent.trim()))
      if (control instanceof HTMLElement) {
        control.click()
        return true
      }
      return false
    })()`)
    if (!closed) {
      await pressEscape(1)
    }
    await sleep(600)
  }
}

/** Move hover state away so tooltips don't pollute captures. */
async function parkPointer() {
  await evaluate(`(() => {
    for (const el of document.querySelectorAll(':hover')) {
      el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    }
    document.body.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, clientX: 5, clientY: 700,
    }))
    // Hover tooltips render as floating body children. Hide them with an
    // injected style — never remove React-owned nodes from the DOM.
    if (!document.getElementById('gallery-tooltip-suppressor')) {
      const style = document.createElement('style')
      style.id = 'gallery-tooltip-suppressor'
      style.textContent = 'body > .tooltip { display: none !important; }'
      document.head.appendChild(style)
    }
    return true
  })()`)
  await sleep(400)
}

/** The compact history mode hides the commit list; bring it back. */
async function ensureCommitList() {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const hasList = await evaluate(
      `document.querySelector('#commit-list .list-item, .commit-list .list-item') !== null`
    )
    if (hasList) {
      return
    }
    await clickSelector('.compact-history-list-button', { optional: true })
    await sleep(800)
  }
  fail('Commit list did not appear.')
}

const scenes = new Map()
const scene = (name, run) => scenes.set(name, run)

scene('seed', async () => {
  await seedProfile()
})

scene('dump', async () => {
  const summary = await evaluate(`(() => {
    const texts = selector => [...document.querySelectorAll(selector)].map(el => ({
      label: el.getAttribute('aria-label'),
      text: (el.textContent ?? '').trim().slice(0, 50),
    }))
    return {
      title: document.title,
      hasRequire: typeof require === 'function',
      railButtons: texts('nav.repository-rail button'),
      tabButtons: texts('.repository-rail [role="tab"], [class*="rail"] button').slice(0, 24),
      dialogs: [...document.querySelectorAll('dialog')].map(d => d.id),
      blankslate: document.querySelector('#no-repositories') !== null,
      toolbar: texts('.toolbar-button, [class*="toolbar"] > button').slice(0, 16),
    }
  })()`)
  process.stdout.write(`DUMP ${JSON.stringify(summary, null, 1)}\n`)
})

scene('welcome', async () => {
  const inWelcome = await evaluate(
    `document.querySelector('#welcome') !== null`
  )
  if (!inWelcome) {
    process.stdout.write('SKIP welcome (already completed)\n')
    return
  }
  await sleep(800)
  await capture('material-welcome')
})

scene('complete-welcome', async () => {
  for (let step = 0; step < 6; step++) {
    const inWelcome = await evaluate(
      `document.querySelector('#welcome') !== null`
    )
    if (!inWelcome) {
      return
    }
    const advanced =
      (await clickText('Continue without signing in', { optional: true })) ||
      (await clickText('Continue', { optional: true })) ||
      (await clickText('Finish', { optional: true })) ||
      (await clickText('Get started', { optional: true })) ||
      (await clickText('Done', { optional: true })) ||
      (await clickText('Skip this step', { optional: true }))
    if (!advanced) {
      const controls = await evaluate(
        `[...document.querySelectorAll('#welcome a, #welcome button')].map(e => (e.textContent||'').trim()).filter(t => t)`
      )
      fail(`Welcome flow stuck; controls: ${JSON.stringify(controls)}`)
    }
    await sleep(1400)
  }
  fail('Welcome flow did not finish within 6 steps.')
})

scene('state-shot', async () => {
  await capture('current-state')
})

scene('dismiss-checklist', async () => {
  await clickText('Skip for now', { optional: true })
  await sleep(800)
})

scene('ensure-repo', async () => {
  await ensureRepository()
})

scene('workspace-changes', async () => {
  await ensureRepository()
  fs.writeFileSync(
    path.join(fixturePath, 'material-notes.md'),
    '# Material verification notes\n\nDeterministic fixture change.\n'
  )
  fs.writeFileSync(
    path.join(fixturePath, 'docs-outline.md'),
    '# Outline\n\n- workspace\n- history\n'
  )
  await menuEvent('show-changes')
  await sleep(2500)
  await capture('material-workspace-changes')
})

scene('history', async () => {
  await ensureRepository()
  await menuEvent('show-history')
  await sleep(1500)
  await ensureCommitList()
  await evaluate(`(() => {
    const row = document.querySelector('#commit-list .list-item, .commit-list .list-item')
    if (row instanceof HTMLElement) row.click()
    return true
  })()`)
  await sleep(1200)
  await parkPointer()
  await capture('material-history')
})

scene('history-context-actions', async () => {
  await ensureRepository()
  await menuEvent('show-history')
  await sleep(1200)
  await ensureCommitList()
  const opened = await evaluate(`(() => {
    const row = document.querySelector('#commit-list .list-item, .commit-list .list-item')
    if (!(row instanceof HTMLElement)) return false
    const rect = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + 150, clientY: rect.top + 16,
    }))
    return true
  })()`)
  if (!opened) {
    fail('No commit row for the context menu.')
  }
  await waitFor(
    `document.querySelector('.material-context-menu') !== null`,
    'material context menu',
    8000
  )
  await parkPointer()
  await capture('material-history-context-actions')
  await closeAllDialogs()
})

scene('branches-sheet', async () => {
  await ensureRepository()
  await menuEvent('show-branches')
  await sleep(1200)
  await capture('material-branches-sheet')
  await closeAllDialogs()
})

scene('repositories-sheet', async () => {
  await ensureRepository()
  await menuEvent('choose-repository')
  await sleep(1200)
  await capture('material-repositories-sheet')
  await closeAllDialogs()
})

scene('settings', async () => {
  await ensureRepository()
  await menuEvent('show-preferences')
  await sleep(1400)
  await capture('material-settings')
  await closeAllDialogs()
})

/** Open Settings on a named tab and capture. */
async function captureSettingsTab(tabLabel, name) {
  await ensureRepository()
  await menuEvent('show-preferences')
  await waitFor(
    `document.querySelector('#preferences') !== null`,
    'settings dialog'
  )
  await sleep(700)
  if (tabLabel !== null) {
    await clickText(tabLabel, { within: '#preferences' })
    await sleep(900)
  }
  await parkPointer()
  await capture(name)
  await closeAllDialogs()
}

scene('settings-agent-access', async () => {
  await captureSettingsTab('Agent access', 'material-agent-access')
})

scene('settings-appearance', async () => {
  await captureSettingsTab('Appearance', 'material-customization')
})

scene('settings-accounts', async () => {
  await captureSettingsTab('Accounts', 'material-provider-accounts')
})

scene('settings-automation', async () => {
  await captureSettingsTab('Automation', 'material-automation')
})

scene('settings-history', async () => {
  await ensureRepository()
  await menuEvent('show-settings-history')
  await sleep(1500)
  await parkPointer()
  await capture('settings-history-manager')
  await closeAllDialogs()
})

scene('sparse-checkout', async () => {
  await ensureRepository()
  await menuEvent('manage-sparse-checkout')
  await sleep(1500)
  await parkPointer()
  await capture('material-sparse-checkout')
  await closeAllDialogs()
})

scene('gitignore-manager', async () => {
  await ensureRepository()
  await menuEvent('manage-gitignore')
  await sleep(1500)
  await parkPointer()
  await capture('material-gitignore-manager')
  await closeAllDialogs()
})

scene('branch-rules', async () => {
  await ensureRepository()
  await menuEvent('inspect-branch-rules')
  await sleep(2200)
  await parkPointer()
  await capture('material-effective-branch-rules')
  await closeAllDialogs()
})

scene('repository-tools', async () => {
  await ensureRepository()
  await menuEvent('show-repository-tools')
  await sleep(1800)
  await parkPointer()
  await capture('material-repository-tools')
})

scene('repository-tools-scroll', async () => {
  await ensureRepository()
  await menuEvent('show-repository-tools')
  await sleep(1200)
  await setViewport(960, 420)
  await evaluate(`(() => {
    const scroller = document.querySelector('.repository-tools')
    if (scroller instanceof HTMLElement) scroller.scrollTop = scroller.scrollHeight
    return true
  })()`)
  await sleep(700)
  await capture('material-repository-tools-scroll')
  await setViewport()
})

scene('error-notice', async () => {
  await ensureRepository()
  await menuEvent('test-app-error')
  await sleep(1600)
  await capture('material-error-notice')
  await sleep(400)
  await clickText('Dismiss', { optional: true })
  await closeAllDialogs()
})

scene('responsive-overflow', async () => {
  await ensureRepository()
  await menuEvent('show-changes')
  await setViewport(640, 480)
  await sleep(900)
  await capture('material-responsive-overflow-fixed')
  await setViewport()
})

/** Switch to a GitHub section by its rail label and capture. */
async function captureSection(railLabel, name, settleMs = 2500) {
  await ensureRepository()
  const done = await evaluate(`(() => {
    const rail = document.querySelector('nav.repository-rail')
    if (!rail) return false
    const target = [...rail.querySelectorAll('button')].find(button =>
      (button.textContent ?? '').trim() === ${JSON.stringify(railLabel)})
    if (!target) return false
    target.click()
    return true
  })()`)
  if (!done) {
    fail(`Rail section ${railLabel} not found.`)
  }
  await sleep(settleMs)
  await parkPointer()
  if (name !== null) {
    await capture(name)
  }
}

scene('releases', async () => {
  await captureSection('Releases', 'material-github-releases', 3500)
})

scene('issues', async () => {
  await captureSection('Issues', 'material-github-issues', 3500)
})

scene('provider-triage', async () => {
  await captureSection('Triage', 'material-provider-triage', 3000)
})

scene('api-explorer', async () => {
  await captureSection('API', 'material-github-api-explorer', 3000)
})

scene('api-app-functions', async () => {
  await captureSection('API', null, 2000)
  await evaluate(`(() => {
    const panel = document.querySelector('.github-api-functions')
    if (panel instanceof HTMLElement) {
      panel.scrollIntoView({ block: 'start' })
      return true
    }
    const explorer = document.querySelector('.github-api-explorer')
    if (explorer instanceof HTMLElement) explorer.scrollTop = explorer.scrollHeight
    return true
  })()`)
  await sleep(900)
  await parkPointer()
  await capture('material-api-app-functions')
})

scene('actions-runs', async () => {
  await captureSection('Actions', null, 3500)
  await parkPointer()
  await capture('material-actions-pagination')
})

scene('actions-load-more', async () => {
  await captureSection('Actions', null, 2500)
  await clickText('Load more runs', { optional: true })
  await sleep(2500)
  await evaluate(`(() => {
    const main = document.querySelector('.actions-view')
    if (main instanceof HTMLElement) main.scrollTop = main.scrollHeight
    return true
  })()`)
  await sleep(600)
  await parkPointer()
  await capture('material-actions-pagination-headless')
})

scene('actions-run-details', async () => {
  await captureSection('Actions', null, 2500)
  await evaluate(`(() => {
    const row = document.querySelector('.actions-run-row, [class*=actions-run-] button, .actions-run-column .list-item')
    if (row instanceof HTMLElement) { row.click(); return true }
    const anyRun = [...document.querySelectorAll('.actions-view button')].find(b => /Run|workflow/i.test(b.textContent))
    if (anyRun) { anyRun.click(); return true }
    return false
  })()`)
  await sleep(3000)
  await parkPointer()
  await capture('material-actions-jobs-pagination')
})

scene('actions-caches', async () => {
  await captureSection('Actions', null, 2000)
  await clickText('Caches', { within: '.actions-view' })
  await sleep(2500)
  await parkPointer()
  await capture('material-actions-cache-manager')
})

async function main() {
  if (args.has('list')) {
    for (const name of scenes.keys()) {
      process.stdout.write(`${name}\n`)
    }
    return
  }

  const targets = await getJSON('/json/list')
  const page = targets.find(
    target => target.type === 'page' && target.url.includes('out/index.html')
  )
  if (page === undefined) {
    fail('Desktop Material page target not found.')
  }

  client = new CDPClient(page.webSocketDebuggerUrl)
  await client.open()
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await setViewport()

  if (args.has('probe')) {
    const value = await evaluate(args.get('probe'))
    process.stdout.write(`PROBE ${JSON.stringify(value, null, 1)}\n`)
  }

  const names = (args.get('scenes') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0)

  for (const name of names) {
    const run = scenes.get(name)
    if (run === undefined) {
      fail(`Unknown scene: ${name}`)
    }
    process.stdout.write(`SCENE ${name}\n`)
    await run()
  }

  client.close()
}

main().catch(error => {
  process.stderr.write(`CAPTURE_FAIL ${error?.stack ?? String(error)}\n`)
  try {
    client?.close()
  } catch {}
  process.exit(1)
})
