import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'

/**
 * The Inbox row's layout contract.
 *
 * The contract draws the row as a fixed-width unread dot and glyph, a title /
 * meta / detail column that takes the remaining space, and a fixed-width
 * relative time followed by two 26px buttons. Everything in that row that must
 * shrink has to say so: a flex child without `min-width: 0` refuses to go below
 * its content width and pushes its siblings out of the row instead of
 * ellipsing, which is how a badge ends up sitting on top of the value beside
 * it.
 */

const styles = readFileSync(
  resolve(__dirname, '../../styles/ui/_md3-inbox.scss'),
  'utf8'
)

const view = readFileSync(
  resolve(__dirname, '../../src/ui/md3/md3-inbox-view.tsx'),
  'utf8'
)

/**
 * The declarations of one rule, by exact selector.
 *
 * Written by hand rather than with a single regular expression because both
 * shortcuts are wrong in ways that pass: a comment sitting above a rule becomes
 * part of the selector text, and matching the selector anywhere in a selector
 * list means `.a b { … }` satisfies a check for `.a`.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function ruleBody(source: string, selector: string): string {
  const lines = withoutComments(source)

  let from = 0
  for (;;) {
    const at = lines.indexOf(selector, from)
    assert.notEqual(at, -1, `no rule for ${selector}`)
    from = at + selector.length

    // The selector has to START a selector-list entry and be followed by its
    // own block — not sit at the tail of a descendant selector, and not be the
    // prefix of a longer class name. Indentation is skipped; anything else in
    // front of it means this occurrence is part of a larger selector.
    let back = at - 1
    while (back >= 0 && (lines[back] === ' ' || lines[back] === '\t')) {
      back--
    }
    const before = back < 0 ? '\n' : lines[back]
    if (!'\n,}{'.includes(before)) {
      continue
    }
    const after = lines.slice(from)
    const opens = after.match(/^\s*\{/)
    if (opens === null) {
      continue
    }

    let depth = 0
    const start = from + opens[0].length
    for (let index = start; index < lines.length; index++) {
      const character = lines[index]
      if (character === '{') {
        depth++
      } else if (character === '}') {
        if (depth === 0) {
          return lines.slice(start, index)
        }
        depth--
      }
    }
    assert.fail(`unterminated rule for ${selector}`)
  }
}

describe('md3 inbox row layout', () => {
  it('gives the title its own shrinkable text element', () => {
    // The rule is useless if nothing wears the class.
    assert.match(view, /className="md3-inbox__title-text"/)

    const body = ruleBody(styles, '.md3-inbox__title-text')
    assert.match(body, /min-width:\s*0/)
    assert.match(body, /overflow:\s*hidden/)
    assert.match(body, /text-overflow:\s*ellipsis/)
    assert.match(body, /white-space:\s*nowrap/)
  })

  it('does not put an ellipsis on the title flex container, where it cannot apply', () => {
    const body = ruleBody(styles, '.md3-inbox__title')
    assert.match(body, /display:\s*flex/)
    assert.ok(
      !/text-overflow/.test(body),
      'text-overflow on a flex container reads as working and does nothing'
    )
  })

  it('keeps the muted badge out of the shrink', () => {
    const body = ruleBody(styles, '.md3-inbox__badge')
    assert.match(body, /flex:\s*none/)
  })

  it('lets the text column shrink so the time and buttons keep their room', () => {
    const body = ruleBody(styles, '.md3-inbox__text')
    assert.match(body, /flex:\s*1 1 auto/)
    assert.match(body, /min-width:\s*0/)
  })

  it('holds the relative time on one line whatever the locale calls it', () => {
    const body = ruleBody(styles, '.md3-inbox__time')
    assert.match(body, /flex:\s*none/)
    assert.match(body, /white-space:\s*nowrap/)
  })

  it('drops a read row to the contract opacity without hiding it', () => {
    const body = ruleBody(styles, '.md3-inbox__row--read')
    assert.match(body, /opacity:\s*0\.62/)
  })

  it('never selects a theme the way the contract prototype does', () => {
    assert.ok(
      !withoutComments(styles).includes('[data-theme'),
      'this repository selects light with :root and dark with body.theme-dark'
    )
  })
})
