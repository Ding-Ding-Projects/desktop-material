import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IMatch,
  match,
  mergeMatchesByDescendingScore,
} from '../../src/lib/fuzzy-find'
import { getText } from '../../src/ui/lib/filter-list'
describe('fuzzy find', () => {
  const items = [
    {
      id: '300',
      text: ['add fix for ...', 'opened 5 days ago by bob'],
    },
    {
      id: '500',
      text: ['add support', '#4653 opened 3 days ago by damaneice '],
    },
    {
      id: '500',
      text: ['add an awesome feature', '#7564 opened 10 days ago by ... '],
    },
  ]

  it('should find matching item when searching by pull request number', () => {
    const results = match('4653', items, getText)

    assert.equal(results.length, 1)
    assert(results[0].item['text'].join('').includes('4653'))
  })

  it('should find matching item when searching by author', () => {
    const results = match('damaneice', items, getText)

    assert.equal(results.length, 1)
    assert(results[0].item['text'].join('').includes('damaneice'))
  })

  it('should find matching item when by title', () => {
    const results = match('awesome feature', items, getText)

    assert.equal(results.length, 1)
    assert(results[0].item['text'].join('').includes('awesome feature'))
  })

  it('should find nothing', () => {
    const results = match('$%^', items, getText)

    assert.equal(results.length, 0)
  })
})

describe('mergeMatchesByDescendingScore', () => {
  const asMatch = (item: string, score: number): IMatch<string> => ({
    score,
    item,
    matches: { title: [], subtitle: [] },
  })

  it('produces the exact stable descending sort of the concatenation', () => {
    const left = [asMatch('a', 0.9), asMatch('b', 0.5), asMatch('c', 0.5)]
    const right = [asMatch('d', 0.7), asMatch('e', 0.5), asMatch('f', 0.1)]

    const merged = mergeMatchesByDescendingScore(left, right)
    const sorted = [...left, ...right].sort((x, y) => y.score - x.score)

    assert.deepEqual(
      merged.map(m => m.item),
      sorted.map(m => m.item)
    )
    // Ties keep earlier-list items first, exactly like a stable sort over
    // the concatenated list: b and c (left) precede e (right) at 0.5.
    assert.deepEqual(
      merged.map(m => m.item),
      ['a', 'd', 'b', 'c', 'e', 'f']
    )
  })

  it('handles empty sides without altering the other list', () => {
    const some = [asMatch('a', 1), asMatch('b', 0.2)]

    assert.deepEqual(mergeMatchesByDescendingScore([], some), some)
    assert.deepEqual(mergeMatchesByDescendingScore(some, []), some)
    assert.deepEqual(mergeMatchesByDescendingScore([], []), [])
  })

  it('matches a full fuzzy pass when a batch is matched and merged in', () => {
    const corpus = [
      { id: '1', text: ['add fix for parser', 'opened by bob'] },
      { id: '2', text: ['add support for filters', 'opened by damaneice'] },
      { id: '3', text: ['fix add-on loading', 'opened by eve'] },
      { id: '4', text: ['docs: add examples', 'opened by mallory'] },
      { id: '5', text: ['refactor: additional cleanup', 'opened by trent'] },
    ]

    for (const splitAt of [1, 2, 3, 4]) {
      const whole = match('add', corpus, getText)
      const merged = mergeMatchesByDescendingScore(
        match('add', corpus.slice(0, splitAt), getText),
        match('add', corpus.slice(splitAt), getText)
      )

      assert.deepEqual(merged, whole, `split at ${splitAt}`)
    }
  })
})
