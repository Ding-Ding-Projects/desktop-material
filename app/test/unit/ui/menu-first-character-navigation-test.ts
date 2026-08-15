import assert from 'node:assert'
import { describe, it } from 'node:test'
import { findByFirstCharacter } from '../../../src/ui/app-menu/menu-pane'

// "Open", "Options", "Quit" — the shape that exposed the bug.
const menu = ['o', 'o', 'q']

describe('menu first-character navigation', () => {
  it('moves to the item directly below the selection', () => {
    // The search used to begin two rows past the selection, so typing "o" with
    // Open selected skipped Options and landed back on Open.
    assert.equal(findByFirstCharacter(menu, 'o', 0), 1)
  })

  it('cycles through every match rather than sticking', () => {
    assert.equal(findByFirstCharacter(menu, 'o', 1), 0)
  })

  it('starts at the top when nothing is selected', () => {
    assert.equal(findByFirstCharacter(menu, 'o', -1), 0)
    assert.equal(findByFirstCharacter(menu, 'q', -1), 2)
  })

  it('wraps around from the last item', () => {
    assert.equal(findByFirstCharacter(menu, 'o', 2), 0)
  })

  it('reports no match', () => {
    assert.equal(findByFirstCharacter(menu, 'z', 0), -1)
  })

  it('passes over a separator to reach the next real item', () => {
    // A separator holds an empty first character. The caller only ever searches
    // for a printable key, so an empty entry can never be matched.
    assert.equal(findByFirstCharacter(['a', '', 'b'], 'b', 0), 2)
    assert.equal(findByFirstCharacter(['a', '', 'b'], 'a', 1), 0)
  })
})
