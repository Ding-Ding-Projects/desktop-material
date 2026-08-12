import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Two layout faults in the Branches sheet, and the arithmetic that proves them.
 *
 * Both were reported from a screenshot and both are visible in the declared
 * values rather than only on screen, which is what makes them assertable here
 * instead of only in a capture.
 *
 * 1. `.tab-bar` is `height: var(--tab-bar-height)` — a fixed 29px, sized for
 *    the original 25px tabs. The Branches sheet restyles those tabs as 40px
 *    pills and adds 10px of padding beneath them. Fifty pixels of content in a
 *    twenty-nine pixel box overflows by twenty-one, straight onto the control
 *    below it, which is why the tabs were sitting on top of `Checkout from
 *    another fork…`.
 *
 * 2. The two merge actions carried `align-self: stretch`, which is right only
 *    while the grid is exactly as tall as its content. Any slack — an empty
 *    branch list, a container that sizes differently — inflates both buttons
 *    to fill it, and two 40px actions become slabs with their labels marooned
 *    in the middle. Nothing errors, so nothing catches it.
 */

/** The Branches sheet's own block, which several selectors below live in. */
const SheetAnchor = '#foldout-container .branches-container'

const styles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_branches.scss'),
  'utf8'
)

/**
 * Extract one rule's declarations.
 *
 * Comments are stripped first and braces are counted rather than matched with
 * a regular expression. A pattern of the `([^{}]+)\{([^{}]*)\}` shape cannot
 * see inside a nested block at all, and without stripping comments the text
 * above a rule is read as part of its selector — both of which produce a guard
 * that confidently reports a rule missing while it is plainly in the file.
 */
function declarationsFor(selector: string, after?: string): string {
  const source = styles
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  // `> .button-component` appears four times in this stylesheet and
  // `& > .tab-bar` three, each under a different parent. Searching from a
  // named anchor is what stops an assertion about the Branches sheet passing —
  // or failing — on the repository list's copy of the same selector.
  const from = after === undefined ? 0 : source.indexOf(after)
  assert.notStrictEqual(from, -1, `${after} is not in the stylesheet`)

  const at = source.indexOf(`${selector} {`, from)
  assert.notStrictEqual(at, -1, `${selector} is not in the stylesheet`)

  let depth = 0
  let index = source.indexOf('{', at)
  const start = index + 1
  for (; index < source.length; index++) {
    if (source[index] === '{') {
      depth++
    } else if (source[index] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(start, index)
      }
    }
  }
  throw new Error(`${selector} has no closing brace`)
}

/** Only this rule's own declarations, with nested blocks removed. */
function ownDeclarations(selector: string, after?: string): string {
  const body = declarationsFor(selector, after)
  let depth = 0
  let own = ''
  for (const character of body) {
    if (character === '{') {
      depth++
    } else if (character === '}') {
      depth--
    } else if (depth === 0) {
      own += character
    }
  }
  return own
}

describe('the Branches sheet tab strip fits its own tabs', () => {
  it('still restyles the tabs as 40px pills', () => {
    // The premise of the whole fix. If this ever drops back to the default
    // size the height override below stops being necessary, and a test that
    // no longer describes the code is worse than no test.
    assert.match(
      declarationsFor('& > .tab-bar', SheetAnchor),
      /min-height:\s*40px/
    )
  })

  it('releases the fixed height the base rule imposes', () => {
    const own = ownDeclarations('& > .tab-bar', SheetAnchor)
    assert.match(
      own,
      /height:\s*auto/,
      '29px of box around 50px of tabs overflows onto the control below it'
    )
  })

  it('does not simply hard-code a second number', () => {
    // A fixed height here is the same bug again the next time the pills
    // change. The pills state their own height; the strip follows it.
    const own = ownDeclarations('& > .tab-bar', SheetAnchor)
    assert.doesNotMatch(
      own,
      /height:\s*\d+px/,
      'the strip should follow its tabs, not restate their height'
    )
  })
})

describe('the merge footer buttons stay the size of buttons', () => {
  it('sizes its rows to their content', () => {
    const own = ownDeclarations('.merge-button-row', SheetAnchor)
    assert.match(own, /grid-auto-rows:\s*min-content/)
    assert.match(own, /align-content:\s*start/)
  })

  it('does not stretch a button to whatever height is going spare', () => {
    const buttons = declarationsFor('> .button-component', '.merge-button-row')
    assert.doesNotMatch(
      buttons,
      /align-self:\s*stretch/,
      'stretch is correct only while the grid is exactly its content height'
    )
    assert.match(buttons, /align-self:\s*start/)
  })

  it('keeps a floor rather than a fixed height', () => {
    // A long branch name wraps to a second line and the button has to grow
    // with it, so this must be a minimum and not an exact size.
    const buttons = declarationsFor('> .button-component', '.merge-button-row')
    assert.match(buttons, /min-height:\s*var\(--button-height\)/)
    assert.doesNotMatch(buttons, /^\s*height:\s*var\(--button-height\)/m)
  })
})
