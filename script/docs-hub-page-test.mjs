/**
 * Documentation-hub page behaviour: tabbed navigation, the search dock that
 * every tab shares, and the bounded regex path behind it.
 *
 * These tests drive the real docs/index.html and the real docs-hub.js in jsdom
 * rather than a reimplementation, and they back the regex surfaces with the
 * real worker running on a genuine thread, so the 750 ms deadline is measured
 * against a native RegExp call that really is stuck.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Worker as ThreadWorker } from 'node:worker_threads'
import { JSDOM, VirtualConsole } from 'jsdom'

const ProjectRoot = join(import.meta.dirname, '..')
const SiteRoot = join(ProjectRoot, 'docs', 'assets', 'site')
const IndexPath = join(ProjectRoot, 'docs', 'index.html')
const WorkerPath = join(SiteRoot, 'docs-hub-regex-worker.js')

const indexSource = readFileSync(IndexPath, 'utf8')
const scriptSources = [
  'docs-hub-strings.js',
  'docs-hub-catalog.js',
  'docs-hub.js',
].map(name => readFileSync(join(SiteRoot, name), 'utf8'))

/**
 * A `Worker` for jsdom, which has none. Every instance runs the real worker
 * file on a real thread, so `terminate()` is a real interruption rather than a
 * cooperative flag the page could not rely on in a browser either.
 */
function createWorkerClass(record) {
  const bridge = `
    const { parentPort } = require('node:worker_threads')
    global.self = {
      postMessage(message) { parentPort.postMessage(message) }
    }
    require(${JSON.stringify(WorkerPath)})
    parentPort.on('message', message => global.self.onmessage({ data: message }))
  `

  return class BridgedWorker {
    constructor(path) {
      record.created.push(path)
      this.onmessage = null
      this.onerror = null
      this.thread = new ThreadWorker(bridge, { eval: true })
      this.thread.on('message', message => {
        if (typeof this.onmessage === 'function') {
          this.onmessage({ data: message })
        }
      })
      this.thread.on('error', () => {
        if (typeof this.onerror === 'function') {
          this.onerror({ preventDefault() {} })
        }
      })
      this.thread.unref()
    }

    postMessage(message) {
      this.thread.postMessage(message)
    }

    terminate() {
      record.terminated.push(Date.now())
      this.thread.terminate()
    }
  }
}

async function openHub({ hash = '', withWorker = false, storage } = {}) {
  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM(indexSource, {
    url: `https://example.test/docs/${hash}`,
    runScripts: 'outside-only',
    virtualConsole,
  })
  const { window } = dom
  // jsdom reports scrolling as unimplemented; the hub only needs it to exist.
  window.scrollTo = () => {}

  for (const [key, value] of Object.entries(storage ?? {})) {
    window.localStorage.setItem(key, value)
  }

  const workers = { created: [], terminated: [] }
  if (withWorker) {
    window.Worker = createWorkerClass(workers)
  }

  // The pre-paint block is inline, and `outside-only` never runs it.
  const inline = window.document.querySelector('head script:not([src])')
  window.eval(inline.textContent)
  for (const source of scriptSources) {
    window.eval(source)
  }

  // The hub starts on DOMContentLoaded exactly as it does in a browser, and
  // jsdom fires that after the constructor returns.
  if (window.document.readyState === 'loading') {
    await new Promise(resolve => {
      window.document.addEventListener('DOMContentLoaded', resolve, {
        once: true,
      })
    })
  }

  return { dom, window, document: window.document, workers }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitFor(predicate, { timeout = 3000, step = 15 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = predicate()
    if (value) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for the hub to settle')
    }
    await sleep(step)
  }
}

function visible(element) {
  return element !== null && !element.hasAttribute('hidden')
}

function typeSearch(window, value) {
  const input = window.document.getElementById('search-input')
  input.value = value
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  return input
}

function press(window, element, key) {
  element.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
  )
}

describe('documentation hub tabbed navigation', () => {
  it('opens one tab at a time and exposes the tablist state', async () => {
    const { document } = await openHub()

    assert.equal(
      document.getElementById('tabs').getAttribute('role'),
      'tablist'
    )

    const overview = document.getElementById('tab-overview')
    const install = document.getElementById('tab-install')
    assert.equal(overview.getAttribute('role'), 'tab')
    assert.equal(overview.getAttribute('aria-controls'), 'overview')
    assert.equal(overview.getAttribute('aria-selected'), 'true')
    assert.equal(overview.getAttribute('tabindex'), '0')
    assert.equal(install.getAttribute('aria-selected'), 'false')
    assert.equal(install.getAttribute('tabindex'), '-1')

    assert.ok(visible(document.getElementById('overview')))
    assert.ok(!visible(document.getElementById('install')))
    assert.ok(!visible(document.getElementById('features')))
    assert.equal(
      document.getElementById('overview').getAttribute('role'),
      'tabpanel'
    )
  })

  it('gives every sub-tab its own address and history entry', async () => {
    const { window, document } = await openHub()

    document.getElementById('tab-features').click()
    assert.equal(window.location.hash, '#features')
    assert.ok(visible(document.getElementById('features')))
    // A bare tab opens its first sub-page rather than nothing at all.
    assert.ok(visible(document.getElementById('features/catalog')))
    assert.ok(!visible(document.getElementById('features/design-system')))

    document.getElementById('subtab-features-design-system').click()
    assert.equal(window.location.hash, '#features/design-system')
    assert.ok(visible(document.getElementById('features/design-system')))
    assert.ok(!visible(document.getElementById('features/catalog')))
    assert.equal(
      document
        .getElementById('subtab-features-design-system')
        .getAttribute('aria-selected'),
      'true'
    )
    assert.equal(
      document
        .getElementById('subtab-features-catalog')
        .getAttribute('tabindex'),
      '-1'
    )

    // Only the current panel is reachable; the rest are hidden from everyone.
    assert.equal(
      document.querySelectorAll('.tab-panel:not([hidden])').length,
      1
    )
  })

  it('restores a deep link and falls back for an unknown route', async () => {
    const deep = await openHub({ hash: '#features/quality-and-reliability' })
    assert.ok(
      visible(deep.document.getElementById('features/quality-and-reliability'))
    )
    assert.ok(visible(deep.document.getElementById('features')))
    assert.equal(
      deep.window.DesktopMaterialDocsHub.currentRoute(),
      'features/quality-and-reliability'
    )

    const hub = deep.window.DesktopMaterialDocsHub
    assert.equal(hub.normalizeRoute('#features/not-a-category'), 'features')
    assert.equal(hub.normalizeRoute('#nonsense'), 'overview')
    assert.equal(hub.normalizeRoute(''), 'overview')
    assert.equal(
      hub.normalizeRoute('#reference/technical'),
      'reference/technical'
    )

    const stale = await openHub({ hash: '#does-not-exist' })
    assert.ok(visible(stale.document.getElementById('overview')))
  })

  it('moves between tabs with the arrow keys and keeps one tab stop', async () => {
    const { window, document } = await openHub()
    const tabs = [...document.querySelectorAll('#tabs [data-tab]')]

    press(window, tabs[0], 'ArrowRight')
    assert.equal(document.activeElement, tabs[1])
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
    assert.equal(tabs[0].getAttribute('tabindex'), '-1')
    assert.ok(visible(document.getElementById('install')))

    press(window, tabs[1], 'End')
    assert.equal(document.activeElement, tabs[tabs.length - 1])

    // The strip wraps, so End then ArrowRight returns to the first tab.
    press(window, tabs[tabs.length - 1], 'ArrowRight')
    assert.equal(document.activeElement, tabs[0])

    press(window, tabs[0], 'ArrowLeft')
    assert.equal(document.activeElement, tabs[tabs.length - 1])

    press(window, tabs[tabs.length - 1], 'Home')
    assert.equal(document.activeElement, tabs[0])
    assert.equal(
      document.querySelectorAll('#tabs [data-tab][tabindex="0"]').length,
      1
    )
  })

  it('routes a content link to its tab instead of scrolling into a hidden panel', async () => {
    const { window, document } = await openHub()
    const cta = document.querySelector('a[data-focus="search-input"]')

    cta.click()
    assert.equal(window.location.hash, '#search')
    assert.ok(visible(document.getElementById('search')))
    assert.equal(
      document.activeElement,
      document.getElementById('search-input')
    )
  })

  it('serves readable content with no JavaScript at all', async () => {
    const dom = new JSDOM(indexSource, { url: 'https://example.test/docs/' })
    const document = dom.window.document

    // Nothing is hidden and nothing claims a tab state until the controller
    // upgrades the nav, so a scripting-free reader gets one complete page.
    assert.equal(document.querySelectorAll('.tab-panel[hidden]').length, 0)
    assert.equal(document.querySelectorAll('.subpanel[hidden]').length, 0)
    assert.equal(document.querySelectorAll('[role="tab"]').length, 0)
    assert.equal(document.querySelectorAll('[aria-selected]').length, 0)

    // Every tab is a working in-page anchor even so.
    for (const link of document.querySelectorAll('[data-tab]')) {
      const route = link.getAttribute('data-tab')
      assert.equal(link.getAttribute('href'), `#${route}`)
      assert.ok(
        document.getElementById(route) !== null,
        `no panel for the ${route} tab`
      )
    }

    // The generated inventory is real markup, not something a script builds.
    assert.ok(
      document.querySelectorAll('.doc-link').length > 100,
      'the feature and reference inventories are missing from the static page'
    )
  })
})

describe('documentation hub search dock', () => {
  it('is present once, outside the tab panels, and starts in plain text', async () => {
    const { document } = await openHub()
    const dock = document.querySelector('.dock')

    assert.ok(dock !== null)
    assert.equal(dock.getAttribute('role'), 'search')
    assert.equal(dock.closest('.tab-panel'), null)
    assert.ok(dock.contains(document.getElementById('search-input')))
    assert.ok(dock.contains(document.getElementById('regex-builder')))
    assert.ok(dock.contains(document.getElementById('search-results')))

    assert.equal(
      document.getElementById('search-mode').getAttribute('aria-pressed'),
      'false'
    )
  })

  it('matches literally until regex mode is switched on', async () => {
    const { window, document } = await openHub()
    const results = document.getElementById('search-results')

    typeSearch(window, 'sparse-checkout')
    assert.ok(results.querySelectorAll('.result').length > 0)

    // A pattern is only ever a pattern once the reader opts in: in plain mode
    // `^install` is a literal string that appears in no page.
    typeSearch(window, '^install')
    assert.equal(results.querySelectorAll('.result').length, 0)
    assert.equal(
      document.getElementById('search-status').textContent,
      'No documentation page matches that search.'
    )
  })

  it('reports the empty state without clearing the reader’s query', async () => {
    const { window, document } = await openHub()
    const input = typeSearch(window, 'zzzz-no-such-documentation-page')

    assert.equal(input.value, 'zzzz-no-such-documentation-page')
    assert.equal(document.getElementById('search-results').innerHTML.trim(), '')
    assert.equal(
      document.getElementById('search-status').textContent,
      'No documentation page matches that search.'
    )
    assert.equal(input.getAttribute('aria-invalid'), 'false')
  })

  it('opts in to regex, keeps the builder in step and runs it in a worker', async () => {
    const { window, document, workers } = await openHub({ withWorker: true })

    document.getElementById('builder-toggle').click()
    assert.ok(visible(document.getElementById('regex-builder')))
    assert.equal(
      document.getElementById('builder-toggle').getAttribute('aria-expanded'),
      'true'
    )

    document.getElementById('search-mode').click()
    assert.equal(
      document.getElementById('search-mode').getAttribute('aria-pressed'),
      'true'
    )

    typeSearch(window, '^(Named|Selective)')
    assert.equal(
      document.getElementById('rb-pattern').value,
      '^(Named|Selective)'
    )

    const results = document.getElementById('search-results')
    await waitFor(() => results.querySelectorAll('.result').length > 0)
    assert.ok(workers.created.length > 0)
    assert.equal(workers.created[0], 'assets/site/docs-hub-regex-worker.js')

    // The builder's own pattern edits flow back into the search query.
    const pattern = document.getElementById('rb-pattern')
    pattern.value = '^Tag lifecycle'
    pattern.dispatchEvent(new window.Event('input', { bubbles: true }))
    assert.equal(
      document.getElementById('search-input').value,
      '^Tag lifecycle'
    )
    await waitFor(() => results.querySelectorAll('.result').length === 1)
  })

  it('applies a built pattern to the search and leaves plain mode', async () => {
    const { window, document } = await openHub({ withWorker: true })

    document.getElementById('builder-toggle').click()
    const pattern = document.getElementById('rb-pattern')
    pattern.value = 'stash'
    pattern.dispatchEvent(new window.Event('input', { bubbles: true }))
    document.getElementById('rb-apply').click()

    assert.equal(window.DesktopMaterialDocsHub.searchState.mode, 'regex')
    assert.equal(document.getElementById('search-input').value, 'stash')
    await waitFor(
      () =>
        document.getElementById('search-results').querySelectorAll('.result')
          .length > 0
    )
  })

  it('terminates a catastrophically backtracking pattern at the deadline', async () => {
    const { window, document, workers } = await openHub({ withWorker: true })

    document.getElementById('builder-toggle').click()
    const sample = document.getElementById('rb-sample')
    sample.value = `${'a'.repeat(19999)}!`
    sample.dispatchEvent(new window.Event('input', { bubbles: true }))

    const pattern = document.getElementById('rb-pattern')
    const started = Date.now()
    pattern.value = '^(a+)+$'
    pattern.dispatchEvent(new window.Event('input', { bubbles: true }))

    const feedback = document.getElementById('rb-feedback')
    await waitFor(() => feedback.getAttribute('data-tone') === 'warn', {
      timeout: 5000,
    })
    const elapsed = Date.now() - started

    assert.ok(workers.terminated.length > 0, 'the worker was never terminated')
    assert.ok(
      elapsed >= 700,
      `the deadline fired after ${elapsed}ms, before the budget`
    )
    assert.ok(
      elapsed < 3000,
      `the deadline took ${elapsed}ms, so it was not a hard interruption`
    )
    assert.match(feedback.textContent, /exceeded the evaluation deadline/)
    assert.equal(document.getElementById('rb-matches').innerHTML.trim(), '')

    // A stopped pattern stays stopped until it is edited, and the reader is
    // told so without a modal dialog.
    const toast = document.querySelector('#toasts .toast')
    assert.ok(toast !== null)
    assert.equal(toast.getAttribute('role'), 'alert')
  })
})

describe('documentation hub appearance controls', () => {
  it('persists theme, density and accent across a reload', async () => {
    const first = await openHub()
    const document = first.document

    document.querySelector('input[name="density"][value="compact"]').click()
    document.querySelector('input[name="accent"][value="teal"]').click()
    document.querySelector('input[name="theme"][value="dark"]').click()

    const root = document.documentElement
    assert.equal(root.getAttribute('data-density'), 'compact')
    assert.equal(root.getAttribute('data-accent'), 'teal')
    assert.equal(root.getAttribute('data-theme'), 'dark')

    assert.equal(
      first.window.localStorage.getItem('dm-docs-density'),
      'compact'
    )
    assert.equal(first.window.localStorage.getItem('dm-docs-accent'), 'teal')
    assert.equal(first.window.localStorage.getItem('dm-docs-theme'), 'dark')
  })

  it('restores a stored appearance before the first paint', async () => {
    const { document } = await openHub({
      storage: {
        'dm-docs-theme': 'dark',
        'dm-docs-density': 'compact',
        'dm-docs-accent': 'rose',
        'dm-docs-lang': 'bi',
      },
    })

    const root = document.documentElement
    assert.equal(root.getAttribute('data-theme'), 'dark')
    assert.equal(root.getAttribute('data-density'), 'compact')
    assert.equal(root.getAttribute('data-accent'), 'rose')
    assert.equal(root.getAttribute('data-lang'), 'bi')
    assert.equal(
      document.querySelector('input[name="accent"][value="rose"]').checked,
      true
    )
  })

  it('ignores a stored value that is not an offered option', async () => {
    const { document } = await openHub({
      storage: { 'dm-docs-accent': 'chartreuse', 'dm-docs-density': 'airy' },
    })

    const root = document.documentElement
    assert.equal(root.getAttribute('data-accent'), null)
    assert.equal(root.getAttribute('data-density'), null)
    assert.equal(
      document.querySelector('input[name="accent"][value="violet"]').checked,
      true
    )
  })
})
