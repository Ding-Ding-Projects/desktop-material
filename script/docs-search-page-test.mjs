/**
 * Published documentation search page (`site/docs-search.html`, served as
 * `/docs/search.html`).
 *
 * These tests drive the real page in jsdom with the real regex worker running
 * on a genuine thread, so the 750 ms deadline is measured against a native
 * RegExp call that really is stuck rather than a cooperative flag. Issue #69
 * shipped this page with a bare `new RegExp` on the UI thread; the adversarial
 * case below is what that regression would fail.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Worker as ThreadWorker } from 'node:worker_threads'
import { JSDOM, VirtualConsole } from 'jsdom'

const ProjectRoot = join(import.meta.dirname, '..')
const SiteRoot = join(ProjectRoot, 'docs', 'assets', 'site')
const PagePath = join(ProjectRoot, 'site', 'docs-search.html')
const WorkerPath = join(SiteRoot, 'docs-hub-regex-worker.js')
const JobRunnerPath = join(SiteRoot, 'docs-regex-job.js')

const pageSource = readFileSync(PagePath, 'utf8')
const jobRunnerSource = readFileSync(JobRunnerPath, 'utf8')

const SamplePages = [
  {
    url: 'installation.html',
    path: 'installation',
    title: 'Installing Desktop Material',
    text: 'Install Desktop Material on Windows. The installer is signed. Installation notes follow.',
  },
  {
    url: 'features/index.html',
    path: 'features/',
    title: 'Feature catalogue',
    text: 'Cheap LFS, sparse-checkout and pull request review all live here.',
  },
  {
    url: 'regex-guide.html',
    path: 'regex-guide',
    title: 'Regex guide',
    text: 'Patterns run in an isolated worker. Nested quantifiers are slow.',
  },
]

/**
 * A `Worker` for jsdom, which has none. Every instance runs the real worker
 * file on a real thread, so `terminate()` is a real interruption rather than
 * something the page could not rely on in a browser either.
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

async function openSearch({
  query = '',
  pages = SamplePages,
  withWorker = true,
  indexFails = false,
} = {}) {
  const dom = new JSDOM(pageSource, {
    url: `https://example.test/docs/search.html${query}`,
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  })
  const { window } = dom

  const workers = { created: [], terminated: [] }
  if (withWorker) {
    window.Worker = createWorkerClass(workers)
  }

  const requests = []
  window.fetch = path => {
    requests.push(path)
    return indexFails
      ? Promise.reject(new Error('HTTP 404'))
      : Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ pages }),
        })
  }

  window.eval(jobRunnerSource)
  const inline = window.document.querySelector('body script:not([src])')
  window.eval(inline.textContent)

  const status = window.document.getElementById('status')
  await waitFor(() => status.textContent !== 'Loading the search index…')

  return { window, document: window.document, workers, requests }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitFor(predicate, { timeout = 5000, step = 15 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = predicate()
    if (value) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for the search page to settle')
    }
    await sleep(step)
  }
}

function search(window, value, options = {}) {
  const document = window.document
  document.getElementById('opt-regex').checked = options.regex === true
  document.getElementById('opt-case').checked = options.matchCase === true
  document.getElementById('opt-word').checked = options.wholeWord === true
  document.getElementById('query').value = value
  document
    .getElementById('search-form')
    .dispatchEvent(new window.Event('submit', { cancelable: true }))
}

function resultTitles(document) {
  return [...document.querySelectorAll('#results li h2 a')].map(
    link => link.textContent
  )
}

function marks(document) {
  return [...document.querySelectorAll('#results mark')].map(
    mark => mark.textContent
  )
}

describe('documentation search page', () => {
  it('loads the index and keeps plain text as the default mode', async () => {
    const { document, requests } = await openSearch()

    assert.deepEqual(requests, ['search-index.json'])
    assert.equal(document.getElementById('opt-regex').checked, false)
    assert.equal(
      document.getElementById('status').textContent,
      'Ready to search 3 documentation pages.'
    )
  })

  it('matches plain text literally and never as a pattern', async () => {
    const { window, document } = await openSearch()

    search(window, 'Install')
    assert.deepEqual(resultTitles(document), ['Installing Desktop Material'])
    assert.equal(
      document.getElementById('status').textContent,
      'Found 3 matches across 1 page.'
    )
    // Case-insensitive by default, so "Install", "installer" and
    // "Installation" all count, each highlighted as it is actually written.
    assert.deepEqual(marks(document), ['Install', 'install', 'Install'])

    // In plain mode a regex metacharacter is just a character.
    search(window, '^Install')
    assert.deepEqual(resultTitles(document), [])
    assert.equal(
      document.getElementById('status').textContent,
      'No documentation page matched that search.'
    )
  })

  it('honours match case and whole word without compiling anything', async () => {
    const { window, document } = await openSearch()

    search(window, 'install', { matchCase: true })
    assert.equal(
      document.getElementById('status').textContent,
      'Found 1 match across 1 page.'
    )
    assert.deepEqual(marks(document), ['install'])

    search(window, 'install', { wholeWord: true })
    assert.equal(
      document.getElementById('status').textContent,
      'Found 1 match across 1 page.'
    )
    assert.deepEqual(marks(document), ['Install'])
  })

  it('runs an opted-in pattern in a fresh same-origin worker', async () => {
    const { window, document, workers } = await openSearch()

    search(window, '^Install', { regex: true })
    await waitFor(() => resultTitles(document).length > 0)

    assert.deepEqual(resultTitles(document), ['Installing Desktop Material'])
    assert.equal(workers.created.length, 1)
    // Relative to /docs/search.html this is /docs/assets/site/…, the same
    // same-origin file /docs/index.html resolves it to.
    assert.equal(workers.created[0], 'assets/site/docs-hub-regex-worker.js')
    assert.equal(workers.terminated.length, 1)
    assert.equal(
      document.getElementById('results').hasAttribute('aria-busy'),
      false
    )
    assert.equal(
      document.getElementById('status').textContent,
      'Found 1 match across 1 page.'
    )
  })

  it('reports an invalid pattern against the query field', async () => {
    const { window, document } = await openSearch()

    search(window, '(unclosed', { regex: true })
    await waitFor(() =>
      document.getElementById('status').getAttribute('data-kind')
    )

    assert.equal(
      document.getElementById('query').getAttribute('aria-invalid'),
      'true'
    )
    assert.match(
      document.getElementById('status').textContent,
      /^That regular expression is not valid/
    )
    assert.deepEqual(resultTitles(document), [])
  })

  it('rejects an over-long pattern before it reaches a worker', async () => {
    const { window, document, workers } = await openSearch()

    search(window, 'a'.repeat(513), { regex: true })

    assert.equal(workers.created.length, 0)
    assert.match(
      document.getElementById('status').textContent,
      /limit is 512 characters/
    )
  })

  it('terminates a catastrophically backtracking pattern at the deadline', async () => {
    const { window, document, workers } = await openSearch({
      pages: [
        {
          url: 'bait.html',
          path: 'bait',
          title: 'Bait',
          text: `${'a'.repeat(19999)}!`,
        },
      ],
    })

    const started = Date.now()
    search(window, '^(a+)+$', { regex: true })

    const status = document.getElementById('status')
    await waitFor(() => status.getAttribute('data-kind') === 'error')
    const elapsed = Date.now() - started

    assert.ok(workers.terminated.length > 0, 'the worker was never terminated')
    assert.ok(
      elapsed >= 700,
      `the deadline fired after ${elapsed}ms, before the budget`
    )
    assert.ok(
      elapsed < 4000,
      `the deadline took ${elapsed}ms, so it was not a hard interruption`
    )
    assert.match(status.textContent, /exceeded the 750 ms evaluation deadline/)
    assert.deepEqual(resultTitles(document), [])
    assert.equal(
      document.getElementById('results').hasAttribute('aria-busy'),
      false
    )

    // The page is still alive and still answers a plain-text search.
    search(window, 'aaa')
    assert.deepEqual(resultTitles(document), ['Bait'])
  })

  it('fails closed for regex when the browser has no worker', async () => {
    const { window, document } = await openSearch({ withWorker: false })

    search(window, 'Install', { regex: true })
    assert.match(
      document.getElementById('status').textContent,
      /unavailable in this browser/
    )
    assert.deepEqual(resultTitles(document), [])

    // Plain text is unaffected: it never needed a worker.
    search(window, 'Install')
    assert.deepEqual(resultTitles(document), ['Installing Desktop Material'])
  })

  it('restores and republishes the query and its options in the address', async () => {
    const { window, document } = await openSearch({
      query: '?q=sparse-checkout&word=1',
    })

    assert.equal(document.getElementById('query').value, 'sparse-checkout')
    assert.equal(document.getElementById('opt-word').checked, true)
    assert.equal(document.getElementById('opt-regex').checked, false)
    assert.deepEqual(resultTitles(document), ['Feature catalogue'])

    search(window, 'Regex', { regex: true, matchCase: true })
    assert.equal(window.location.search, '?q=Regex&regex=1&case=1')
  })

  it('surfaces an index-loading failure instead of searching nothing', async () => {
    const { window, document } = await openSearch({ indexFails: true })

    assert.equal(
      document.getElementById('status').getAttribute('data-kind'),
      'error'
    )
    search(window, 'Install')
    assert.match(
      document.getElementById('status').textContent,
      /search index could not be loaded/
    )
  })
})

describe('documentation search regex builder', () => {
  it('builds a pattern, switches to regex mode and searches with it', async () => {
    const { window, document } = await openSearch()

    document.getElementById('builder-kind').value = 'exact'
    document.getElementById('builder-text').value = 'worker'
    document
      .getElementById('builder-text')
      .dispatchEvent(new window.Event('input', { bubbles: true }))
    assert.equal(
      document.getElementById('pattern-preview').textContent,
      '\\bworker\\b'
    )

    document.getElementById('builder-apply').click()
    assert.equal(document.getElementById('opt-regex').checked, true)
    assert.equal(document.getElementById('query').value, '\\bworker\\b')
    await waitFor(() => resultTitles(document).length > 0)
    assert.deepEqual(resultTitles(document), ['Regex guide'])
  })

  it('applies a snippet through the same bounded path', async () => {
    const { window, document, workers } = await openSearch()

    document.querySelector('#snippets button[data-pattern="\\\\d+"]').click()
    assert.equal(document.getElementById('opt-regex').checked, true)
    assert.equal(document.getElementById('query').value, '\\d+')

    // No sample page contains a digit, so the honest answer is "no match" —
    // arrived at through the worker rather than an in-page compile.
    await waitFor(
      () =>
        document.getElementById('status').textContent ===
        'No documentation page matched that search.'
    )
    assert.equal(workers.created.length, 1)
  })
})
