import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  keepUtf8ByteTail,
  truncateToUtf8ByteBudget,
  utf8ByteLength,
} from '../../src/lib/utf8-budget'

/** True when the string survives a UTF-8 round trip with no substitutions. */
function isWellFormedUtf8(value: string): boolean {
  return Buffer.from(value, 'utf8').toString('utf8') === value
}

describe('UTF-8 byte budgeting', () => {
  it('counts encoded bytes rather than UTF-16 code units', () => {
    assert.equal(utf8ByteLength(''), 0)
    assert.equal(utf8ByteLength('abc'), 3)
    // Latin-1 supplement is two bytes, CJK three, astral-plane emoji four.
    assert.equal(utf8ByteLength('é'), 2)
    assert.equal(utf8ByteLength('中'), 3)
    assert.equal(utf8ByteLength('😀'), 4)
    assert.equal('😀'.length, 2)
    assert.equal(utf8ByteLength('中'.repeat(255)), 765)
    assert.equal(
      utf8ByteLength('a中😀'),
      Buffer.byteLength('a中😀', 'utf8'),
      'must agree with Node’s own encoder'
    )
  })

  it('scores a lone surrogate as its replacement character', () => {
    // A UTF-8 encoder substitutes U+FFFD (three bytes) for an unpaired half, so
    // budgeting has to charge three bytes or the encoded result overruns.
    assert.equal(utf8ByteLength('\ud800'), 3)
    assert.equal(utf8ByteLength('\udc00'), 3)
    assert.equal(utf8ByteLength('\ud800'), Buffer.byteLength('\ud800', 'utf8'))
  })

  it('truncates ASCII exactly like a character budget', () => {
    assert.equal(truncateToUtf8ByteBudget('abcdef', 3), 'abc')
    assert.equal(truncateToUtf8ByteBudget('abcdef', 6), 'abcdef')
    assert.equal(truncateToUtf8ByteBudget('abcdef', 99), 'abcdef')
    assert.equal(truncateToUtf8ByteBudget('abcdef', 0), '')
    assert.equal(truncateToUtf8ByteBudget('abcdef', -1), '')
  })

  it('never splits a multi-byte code point', () => {
    // Two CJK characters cost six bytes; a seven- or eight-byte budget cannot
    // fit a third, so the result stays at two rather than emitting a fragment.
    for (let budget = 6; budget <= 8; budget++) {
      const truncated = truncateToUtf8ByteBudget('中'.repeat(4), budget)
      assert.equal(truncated, '中中')
      assert.ok(utf8ByteLength(truncated) <= budget)
      assert.ok(isWellFormedUtf8(truncated))
    }
    assert.equal(truncateToUtf8ByteBudget('中', 2), '')
  })

  it('never splits a surrogate pair', () => {
    const emoji = '😀'.repeat(4)
    for (let budget = 0; budget <= utf8ByteLength(emoji) + 2; budget++) {
      const truncated = truncateToUtf8ByteBudget(emoji, budget)
      assert.ok(utf8ByteLength(truncated) <= budget)
      assert.equal(truncated.length % 2, 0, 'left half of a surrogate pair')
      assert.ok(isWellFormedUtf8(truncated))
    }
    assert.equal(truncateToUtf8ByteBudget('a😀b', 4), 'a')
    assert.equal(truncateToUtf8ByteBudget('a😀b', 5), 'a😀')
  })

  it('holds the byte budget for every prefix of a mixed-script string', () => {
    const mixed = 'a中😀é漢字b😀中'
    for (let budget = 0; budget <= utf8ByteLength(mixed) + 3; budget++) {
      const truncated = truncateToUtf8ByteBudget(mixed, budget)
      assert.ok(utf8ByteLength(truncated) <= budget)
      assert.ok(isWellFormedUtf8(truncated))
      assert.ok(mixed.startsWith(truncated))
    }
    assert.equal(truncateToUtf8ByteBudget(mixed, 1000), mixed)
  })

  it('keeps the tail on code-point boundaries', () => {
    assert.equal(keepUtf8ByteTail('abcdef', 3), 'def')
    assert.equal(keepUtf8ByteTail('abcdef', 99), 'abcdef')
    assert.equal(keepUtf8ByteTail('abcdef', 0), '')
    assert.equal(keepUtf8ByteTail('中中中', 8), '中中')
    assert.equal(keepUtf8ByteTail('a😀', 4), '😀')
    assert.equal(keepUtf8ByteTail('a😀', 3), '')

    const mixed = 'a中😀é漢字b😀中'
    for (let budget = 0; budget <= utf8ByteLength(mixed) + 3; budget++) {
      const tail = keepUtf8ByteTail(mixed, budget)
      assert.ok(utf8ByteLength(tail) <= budget)
      assert.ok(isWellFormedUtf8(tail))
      assert.ok(mixed.endsWith(tail))
    }
  })
})
