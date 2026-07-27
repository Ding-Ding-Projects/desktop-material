import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Worker } from 'node:worker_threads'

const ProjectRoot = join(import.meta.dirname, '..')
const WorkerPath = join(
  ProjectRoot,
  'docs',
  'assets',
  'site',
  'docs-hub-regex-worker.js'
)
const HubPath = join(ProjectRoot, 'docs', 'assets', 'site', 'docs-hub.js')
const JobRunnerPath = join(
  ProjectRoot,
  'docs',
  'assets',
  'site',
  'docs-regex-job.js'
)
const SearchPagePath = join(ProjectRoot, 'site', 'docs-search.html')

async function createRegexWorker() {
  const bridge = `
    const { parentPort } = require('node:worker_threads')
    global.self = {
      postMessage(message) { parentPort.postMessage(message) }
    }
    require(${JSON.stringify(WorkerPath)})
    parentPort.on('message', message => global.self.onmessage({ data: message }))
    parentPort.postMessage({ bridgeReady: true })
  `
  const worker = new Worker(bridge, { eval: true })
  await new Promise((resolve, reject) => {
    const onMessage = message => {
      if (message?.bridgeReady === true) {
        worker.off('message', onMessage)
        resolve()
      }
    }
    worker.on('message', onMessage)
    worker.once('error', reject)
  })
  return worker
}

async function request(payload, timeoutMilliseconds = 2000) {
  const worker = await createRegexWorker()
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('regex worker test request timed out'))
      }, timeoutMilliseconds)
      worker.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      worker.once('message', message => {
        clearTimeout(timeout)
        resolve(message)
      })
      worker.postMessage({ requestId: 41, ...payload })
    })
  } finally {
    await worker.terminate()
  }
}

describe('documentation hub regex worker', () => {
  it('returns bounded catalog hits and highlight ranges', async () => {
    const result = await request({
      operation: 'search',
      pattern: 'regex',
      flags: 'i',
      catalog: [
        ['Regex guide', 'regex-guide.md', 'How regex works'],
        ['Install', 'installation.md', 'Windows setup'],
      ],
      maximumResults: 60,
      maximumRanges: 200,
    })

    assert.equal(result.requestId, 41)
    assert.equal(result.ok, true)
    assert.equal(result.total, 1)
    assert.deepEqual(result.hits, [
      {
        catalogIndex: 0,
        titleRanges: [[0, 5]],
        pathRanges: [[0, 5]],
        descriptionRanges: [[4, 9]],
      },
    ])
  })

  it('honours sticky matching while highlighting every visible occurrence', async () => {
    const result = await request({
      operation: 'search',
      pattern: 'regex',
      flags: 'iy',
      catalog: [
        ['Regex regex', 'guide.md', 'regex'],
        ['A regex guide', 'other.md', 'regex'],
      ],
      maximumResults: 60,
      maximumRanges: 200,
    })

    assert.equal(result.ok, true)
    assert.equal(result.total, 1)
    assert.deepEqual(result.hits[0].titleRanges, [
      [0, 5],
      [6, 11],
    ])
  })

  it('serializes numbered and named builder captures', async () => {
    const result = await request({
      operation: 'builder',
      pattern: '(?<word>[a-z]+)-(\\d+)',
      flags: 'i',
      sample: 'Alpha-42 beta-7',
      maximumMatches: 100,
    })

    assert.equal(result.ok, true)
    assert.equal(result.matches.length, 2)
    assert.deepEqual(result.matches[0], {
      value: { value: 'Alpha-42', truncated: false },
      index: 0,
      captures: [
        { value: 'Alpha', truncated: false },
        { value: '42', truncated: false },
      ],
      namedGroups: { word: { value: 'Alpha', truncated: false } },
      capturesOmitted: 0,
    })
    assert.equal(result.matches[1].index, 9)
  })

  it('advances Unicode zero-width matches without spinning', async () => {
    const result = await request({
      operation: 'builder',
      pattern: '(?=.)',
      flags: 'u',
      sample: '😀x',
      maximumMatches: 100,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(
      result.matches.map(match => match.index),
      [0, 2]
    )
  })

  it('rejects invalid syntax and repeated flags without throwing', async () => {
    const invalidPattern = await request({
      operation: 'builder',
      pattern: '(',
      flags: 'i',
      sample: 'text',
    })
    assert.equal(invalidPattern.ok, false)
    assert.equal(invalidPattern.code, 'invalid')

    const invalidFlags = await request({
      operation: 'builder',
      pattern: 'text',
      flags: 'ii',
      sample: 'text',
    })
    assert.equal(invalidFlags.ok, false)
    assert.equal(invalidFlags.code, 'invalid')
  })

  it('enforces pattern, sample, catalog and result bounds in the worker', async () => {
    const longPattern = await request({
      operation: 'builder',
      pattern: 'a'.repeat(513),
      flags: '',
      sample: 'a',
    })
    assert.equal(longPattern.code, 'too-long-pattern')

    const longSample = await request({
      operation: 'builder',
      pattern: 'a',
      flags: '',
      sample: 'a'.repeat(20001),
    })
    assert.equal(longSample.code, 'too-long-sample')

    const longCatalog = await request({
      operation: 'search',
      pattern: 'a',
      flags: '',
      catalog: Array.from({ length: 5001 }, () => ['', '', '']),
    })
    assert.equal(longCatalog.code, 'invalid-request')

    const boundedResults = await request({
      operation: 'builder',
      pattern: 'a',
      flags: '',
      sample: 'a'.repeat(150),
      maximumMatches: 1000,
    })
    assert.equal(boundedResults.matches.length, 100)
  })

  it('bounds capture amplification and structured-clone output', async () => {
    const groupCount = 200
    const result = await request({
      operation: 'builder',
      pattern: `(?=${'('.repeat(groupCount)}.*${')'.repeat(groupCount)})`,
      flags: '',
      sample: 'a'.repeat(20000),
      maximumMatches: 100,
    })

    assert.equal(result.ok, true)
    assert.equal(result.matches.length, 100)
    assert.equal(result.matches[0].captures.length, 24)
    assert.equal(result.matches[0].capturesOmitted, groupCount - 24)
    assert.equal(
      result.matches
        .slice(1)
        .reduce((sum, match) => sum + match.captures.length, 0),
      0
    )
    assert.ok(JSON.stringify(result).length < 20000)
  })

  it('returns offsets, not corpus slices, for a full-text page scan', async () => {
    const result = await request({
      operation: 'pages',
      pattern: 'regex',
      flags: 'gi',
      pages: ['Regex here and regex there', 'nothing to see', 'one Regex'],
      maximumPages: 60,
      maximumExcerpts: 3,
    })

    assert.equal(result.ok, true)
    assert.equal(result.total, 3)
    assert.equal(result.truncated, false)
    assert.deepEqual(result.hits, [
      {
        pageIndex: 0,
        matches: 2,
        ranges: [
          [0, 5],
          [15, 20],
        ],
      },
      { pageIndex: 2, matches: 1, ranges: [[4, 9]] },
    ])
  })

  it('bounds page hits, excerpts per page and matches per page', async () => {
    const truncatedPages = await request({
      operation: 'pages',
      pattern: 'a',
      flags: 'g',
      pages: Array.from({ length: 10 }, () => 'aaaa'),
      maximumPages: 3,
      maximumExcerpts: 2,
    })

    assert.equal(truncatedPages.ok, true)
    assert.equal(truncatedPages.hits.length, 3)
    assert.equal(truncatedPages.truncated, true)
    assert.equal(truncatedPages.hits[0].matches, 4)
    assert.equal(truncatedPages.hits[0].ranges.length, 2)
    // Only scanned pages are counted, exactly as the page has always reported.
    assert.equal(truncatedPages.total, 12)

    const scanCapped = await request({
      operation: 'pages',
      pattern: 'a',
      flags: 'g',
      pages: ['a'.repeat(900)],
      maximumPages: 60,
      maximumExcerpts: 3,
    })
    assert.equal(scanCapped.hits[0].matches, 500)
  })

  it('counts a zero-width page match once and points it somewhere', async () => {
    const result = await request({
      operation: 'pages',
      pattern: '(?=b)',
      flags: 'g',
      pages: ['abc b'],
      maximumPages: 60,
      maximumExcerpts: 3,
    })

    assert.equal(result.ok, true)
    assert.equal(result.total, 2)
    assert.deepEqual(result.hits[0].ranges, [
      [1, 2],
      [4, 5],
    ])
  })

  it('rejects an oversized or malformed page corpus', async () => {
    const tooManyPages = await request({
      operation: 'pages',
      pattern: 'a',
      flags: '',
      pages: Array.from({ length: 2001 }, () => 'a'),
    })
    assert.equal(tooManyPages.code, 'invalid-request')

    const tooLongPage = await request({
      operation: 'pages',
      pattern: 'a',
      flags: '',
      pages: ['a'.repeat(200001)],
    })
    assert.equal(tooLongPage.code, 'invalid-request')

    const notStrings = await request({
      operation: 'pages',
      pattern: 'a',
      flags: '',
      pages: [{ text: 'a' }],
    })
    assert.equal(notStrings.code, 'invalid-request')

    const invalidPattern = await request({
      operation: 'pages',
      pattern: '(',
      flags: '',
      pages: ['a'],
    })
    assert.equal(invalidPattern.code, 'invalid')
  })

  it('can be terminated while a native regex call is backtracking', async () => {
    const worker = await createRegexWorker()
    let responded = false
    worker.on('message', () => {
      responded = true
    })
    const started = performance.now()
    worker.postMessage({
      requestId: 99,
      operation: 'builder',
      pattern: '^(a+)+$',
      flags: '',
      sample: `${'a'.repeat(19999)}!`,
      maximumMatches: 100,
    })

    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(responded, false, 'the adversarial RegExp call was still busy')
    await worker.terminate()
    assert.ok(
      performance.now() - started < 2000,
      'the controlling thread remained able to enforce a hard deadline'
    )
  })
})

describe('documentation regex controller', () => {
  it('fails closed on the UI thread and owns worker termination', async () => {
    const [jobSource, workerSource] = await Promise.all([
      readFile(JobRunnerPath, 'utf8'),
      readFile(WorkerPath, 'utf8'),
    ])

    assert.match(jobSource, /new scope\.Worker\(workerPath\)/)
    assert.match(jobSource, /scope\.setTimeout\(function \(\) \{/)
    assert.match(jobSource, /job\.worker\.terminate\(\)/)
    assert.match(jobSource, /DefaultBudgetMilliseconds = 750/)
    assert.doesNotMatch(jobSource, /new RegExp\s*\(/)
    assert.doesNotMatch(
      workerSource,
      /\b(?:fetch|importScripts|XMLHttpRequest|WebSocket)\s*\(/
    )
  })

  /**
   * The regression guard for issue #69. Every published surface that accepts a
   * reader's pattern has to reach the worker through the shared runner; a bare
   * `new RegExp` anywhere in one of them is a UI-thread evaluation waiting to
   * hang the page, which is exactly how /docs/search.html shipped before.
   */
  it('lets no published page compile a reader pattern on its own thread', async () => {
    const [hubSource, searchSource] = await Promise.all([
      readFile(HubPath, 'utf8'),
      readFile(SearchPagePath, 'utf8'),
    ])

    for (const [name, source] of [
      ['docs-hub.js', hubSource],
      ['docs-search.html', searchSource],
    ]) {
      assert.doesNotMatch(
        source,
        /new RegExp\s*\(/,
        `${name} compiles a regex on the page thread`
      )
      assert.match(
        source,
        /DesktopMaterialRegexJob/,
        `${name} does not use the shared bounded regex runner`
      )
      assert.match(
        source,
        /assets\/site\/docs-hub-regex-worker\.js/,
        `${name} does not point at the shared worker`
      )
    }

    assert.match(hubSource, /highlight\(value, ranges\)/)
    // The search page renders only worker-produced offsets into text it
    // already holds, so no pattern output crosses back as unbounded strings.
    assert.match(searchSource, /excerptFor\(text, range\[0\], range\[1\]\)/)
    assert.match(searchSource, /EvaluationBudgetMilliseconds = 750/)
  })
})
