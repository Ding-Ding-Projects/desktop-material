import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DefaultTabGroupColor,
  MaxTabGroupNameLength,
  TabGroupColors,
  normalizeTabGroupColor,
  normalizeTabGroupName,
} from '../../src/models/repository-tab'

describe('tab group model', () => {
  it('accepts only curated colors', () => {
    for (const color of TabGroupColors) {
      assert.equal(normalizeTabGroupColor(color), color)
    }
  })

  it('falls back to the default for an untrusted color', () => {
    for (const value of [
      'red; background: url(evil)',
      '#ff0000',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(normalizeTabGroupColor(value), DefaultTabGroupColor)
    }
  })

  it('collapses whitespace and bounds the group name', () => {
    assert.equal(normalizeTabGroupName('  Release   work  '), 'Release work')
    assert.equal(
      normalizeTabGroupName('x'.repeat(MaxTabGroupNameLength + 40))?.length,
      MaxTabGroupNameLength
    )
  })

  it('rejects an empty or non-string group name', () => {
    for (const value of ['', '   ', '\t\n', null, undefined, 7, []]) {
      assert.equal(normalizeTabGroupName(value), null)
    }
  })
})
