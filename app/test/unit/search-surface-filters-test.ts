import assert from 'node:assert'
import { describe, it } from 'node:test'

import { FilterMode } from '../../src/lib/fuzzy-find'
import { filterByMode } from '../../src/ui/lib/filter-string-list'
import { filterActionsLocalRunLog } from '../../src/ui/actions-local-run/actions-local-run-log-filter'
import {
  filterBranchRuleSources,
  filterBranchRuleValues,
} from '../../src/ui/branch-rules/branch-rules-filter'
import type { IEffectiveBranchRuleSource } from '../../src/lib/effective-branch-rules'

const identity = (value: string): ReadonlyArray<string> => [value]

describe('filterByMode', () => {
  const items = ['main', 'release/v2', 'feature/main-menu', 'MAIN-hotfix']

  it('passes every item through for an empty or whitespace query', () => {
    for (const query of ['', '   ']) {
      const result = filterByMode(
        items,
        identity,
        query,
        FilterMode.Fuzzy,
        false
      )
      assert.strictEqual(result.filtered, false)
      assert.strictEqual(result.regexError, null)
      assert.deepStrictEqual(result.items, items)
    }
  })

  it('narrows by substring, case-insensitive by default', () => {
    const result = filterByMode(
      items,
      identity,
      'main',
      FilterMode.Substring,
      false
    )
    assert.strictEqual(result.filtered, true)
    assert.deepStrictEqual(result.items, [
      'main',
      'feature/main-menu',
      'MAIN-hotfix',
    ])
  })

  it('honours case sensitivity in substring mode', () => {
    const result = filterByMode(
      items,
      identity,
      'MAIN',
      FilterMode.Substring,
      true
    )
    assert.deepStrictEqual(result.items, ['MAIN-hotfix'])
  })

  it('preserves the original order even in fuzzy mode', () => {
    const result = filterByMode(
      items,
      identity,
      'main',
      FilterMode.Fuzzy,
      false
    )
    assert.strictEqual(result.filtered, true)
    // Fuzzy ranking would reorder by score; the shared helper keeps input order.
    assert.deepStrictEqual(result.items, [
      'main',
      'feature/main-menu',
      'MAIN-hotfix',
    ])
  })

  it('matches on any of the supplied keys', () => {
    const rows = [
      { name: 'alpha', path: '/repos/alpha' },
      { name: 'beta', path: '/work/gamma' },
    ]
    const result = filterByMode(
      rows,
      row => [row.name, row.path],
      'gamma',
      FilterMode.Substring,
      false
    )
    assert.deepStrictEqual(
      result.items.map(r => r.name),
      ['beta']
    )
  })

  it('keeps an invalid regex non-throwing and preserves every item', () => {
    const result = filterByMode(items, identity, '(', FilterMode.Regex, false)
    assert.strictEqual(result.filtered, false)
    assert.ok(result.regexError)
    assert.deepStrictEqual(result.items, items)
  })

  it('is zero-width safe (an anchor matches every item)', () => {
    const result = filterByMode(items, identity, '^', FilterMode.Regex, false)
    assert.strictEqual(result.filtered, true)
    assert.strictEqual(result.regexError, null)
    assert.deepStrictEqual(result.items, items)
  })

  it('applies a valid regular expression', () => {
    const result = filterByMode(
      items,
      identity,
      '^release/',
      FilterMode.Regex,
      false
    )
    assert.deepStrictEqual(result.items, ['release/v2'])
  })
})

describe('filterActionsLocalRunLog', () => {
  const lines = [
    { stream: 'stdout', text: 'Setting up job' },
    { stream: 'stderr', text: 'Warning: cache miss' },
    { stream: 'stdout', text: 'Run tests' },
    { stream: 'stderr', text: 'Error: exit code 1' },
  ]

  it('reports match and total counts while narrowing', () => {
    const result = filterActionsLocalRunLog(
      lines,
      'error',
      FilterMode.Substring,
      false
    )
    assert.strictEqual(result.active, true)
    assert.strictEqual(result.totalCount, 4)
    assert.strictEqual(result.matchCount, 1)
    assert.deepStrictEqual(
      result.lines.map(l => l.text),
      ['Error: exit code 1']
    )
  })

  it('shows every line for an empty query', () => {
    const result = filterActionsLocalRunLog(lines, '', FilterMode.Fuzzy, false)
    assert.strictEqual(result.active, false)
    assert.strictEqual(result.regexError, null)
    assert.strictEqual(result.matchCount, 4)
    assert.strictEqual(result.totalCount, 4)
  })

  it('preserves all lines and reports the error for an invalid regex', () => {
    const result = filterActionsLocalRunLog(lines, '[', FilterMode.Regex, false)
    assert.strictEqual(result.active, false)
    assert.ok(result.regexError)
    assert.strictEqual(result.matchCount, 4)
    assert.deepStrictEqual(
      result.lines.map(l => l.text),
      lines.map(l => l.text)
    )
  })

  it('keeps stream order and is zero-width safe', () => {
    const result = filterActionsLocalRunLog(lines, '^', FilterMode.Regex, false)
    assert.strictEqual(result.active, true)
    assert.strictEqual(result.matchCount, 4)
    assert.deepStrictEqual(
      result.lines.map(l => l.text),
      lines.map(l => l.text)
    )
  })
})

describe('branch-rules filters', () => {
  const source = (name: string, owner?: string): IEffectiveBranchRuleSource =>
    ({ name, owner } as unknown as IEffectiveBranchRuleSource)

  it('filters enumerated value lists by substring', () => {
    const values = ['build', 'lint', 'unit-tests', 'build-linux']
    const result = filterBranchRuleValues(
      values,
      'build',
      FilterMode.Substring,
      false
    )
    assert.deepStrictEqual(result.items, ['build', 'build-linux'])
  })

  it('matches sources on name or owner', () => {
    const sources = [
      source('Protect main', 'octo-org'),
      source('Release ruleset', 'acme-co'),
    ]
    assert.deepStrictEqual(
      filterBranchRuleSources(
        sources,
        'octo',
        FilterMode.Substring,
        false
      ).items.map(s => s.name),
      ['Protect main']
    )
    assert.deepStrictEqual(
      filterBranchRuleSources(
        sources,
        'release',
        FilterMode.Substring,
        false
      ).items.map(s => s.name),
      ['Release ruleset']
    )
  })

  it('preserves every source when the regex is invalid', () => {
    const sources = [source('a'), source('b')]
    const result = filterBranchRuleSources(
      sources,
      '(',
      FilterMode.Regex,
      false
    )
    assert.strictEqual(result.filtered, false)
    assert.ok(result.regexError)
    assert.strictEqual(result.items.length, 2)
  })
})
