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

describe('documentation hub regex controller', () => {
  it('fails closed on the UI thread and owns worker termination', async () => {
    const [hubSource, workerSource] = await Promise.all([
      readFile(HubPath, 'utf8'),
      readFile(WorkerPath, 'utf8'),
    ])

    assert.match(hubSource, /new window\.Worker\(RegexWorkerPath\)/)
    assert.match(hubSource, /window\.setTimeout\(function \(\) \{/)
    assert.match(hubSource, /job\.worker\.terminate\(\)/)
    assert.match(hubSource, /highlight\(value, ranges\)/)
    assert.doesNotMatch(hubSource, /new RegExp\s*\(/)
    assert.doesNotMatch(
      workerSource,
      /\b(?:fetch|importScripts|XMLHttpRequest|WebSocket)\s*\(/
    )
  })
})
