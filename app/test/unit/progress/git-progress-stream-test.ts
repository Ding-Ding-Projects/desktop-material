import assert from 'node:assert'
import { describe, it } from 'node:test'

import { GitProgressStream } from '../../../src/lib/progress/stream'
import { FetchProgressParser } from '../../../src/lib/progress/fetch'
import { IGitProgress, IGitOutput } from '../../../src/lib/progress/git'

function progressOnly(
  results: ReadonlyArray<IGitProgress | IGitOutput>
): ReadonlyArray<IGitProgress> {
  return results.filter(
    (result): result is IGitProgress => result.kind === 'progress'
  )
}

describe('GitProgressStream', () => {
  it('parses carriage-return separated progress records', () => {
    const stream = new GitProgressStream(new FetchProgressParser())
    const results = progressOnly(
      stream.push(
        'remote: Compressing objects:  50% (5/10)\r' +
          'remote: Compressing objects: 100% (10/10), done.\r'
      )
    )

    assert.equal(results.length, 2)
    assert.equal(results[0].details.title, 'remote: Compressing objects')
    assert.equal(results[0].details.value, 5)
    assert.equal(results[0].details.total, 10)
    assert.equal(results[1].details.done, true)
  })

  it('holds a partial record until the next chunk completes it', () => {
    const stream = new GitProgressStream(new FetchProgressParser())

    assert.deepStrictEqual(
      progressOnly(stream.push('Receiving objects:  4')),
      [],
      'a half-written record must not be parsed'
    )

    const completed = progressOnly(stream.push('2% (42/100)\r'))
    assert.equal(completed.length, 1)
    assert.equal(completed[0].details.value, 42)
    assert.equal(completed[0].details.total, 100)
  })

  it('parses the final unterminated record on flush', () => {
    const stream = new GitProgressStream(new FetchProgressParser())
    assert.deepStrictEqual(
      progressOnly(stream.push('Resolving deltas:  7')),
      []
    )

    const flushed = progressOnly(
      stream.push('0% (7/10)').concat(stream.flush())
    )
    assert.equal(flushed.length, 1)
    assert.equal(flushed[0].details.title, 'Resolving deltas')
    assert.equal(flushed[0].details.value, 7)
  })

  it('reports non-progress lines as context rather than dropping them', () => {
    const stream = new GitProgressStream(new FetchProgressParser())
    const results = stream.push('From https://example.invalid/repo\n')
    assert.equal(results.length, 1)
    assert.equal(results[0].kind, 'context')
  })

  it('drops a pathologically long unterminated line instead of buffering it', () => {
    const stream = new GitProgressStream(new FetchProgressParser())
    stream.push('x'.repeat(9 * 1024))
    // The oversized fragment is discarded, so the next well-formed record still
    // parses cleanly rather than being prefixed with megabytes of junk.
    const results = progressOnly(
      stream.push('Receiving objects:  10% (1/10)\r')
    )
    assert.equal(results.length, 1)
    assert.equal(results[0].details.value, 1)
  })

  it('ignores empty records produced by \\r\\n pairs', () => {
    const stream = new GitProgressStream(new FetchProgressParser())
    const results = stream.push('\r\n\r\n')
    assert.deepStrictEqual(results, [])
  })
})
