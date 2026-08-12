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

/**
 * The rule that actually wins.
 *
 * The assertions above check the first `.merge-button-row` block. A second,
 * later block in the same file overrides it — `display: flex`,
 * `grid-template-columns: none`, and a `flex` shorthand on the buttons — so
 * every grid property asserted above is inert at runtime, and the fix that was
 * shipped for the oversized merge actions changed nothing at all.
 *
 * That was found by measuring the built app, not by reading the stylesheet:
 * the row came back 316px tall, which is 150 + 150 + 4 gap + 12 padding — the
 * arithmetic of a 150px flex basis applied twice down a column. `flex: 1 1
 * 150px` reads as a width, and is a height here, because the row is a column.
 *
 * It is the second time in one session that a correct-looking edit landed on a
 * losing declaration. Hence this block: the later rule is asserted directly.
 */
describe('the merge footer rule that wins', () => {
  /** The second block, which overrides the first. */
  const LaterAnchor = '.merge-button-row {\n    display: flex;'

  it('still overrides the earlier block', () => {
    // If this ever stops being true the assertions above become the live ones
    // again, and this block is describing a rule that no longer exists.
    assert.ok(
      styles.includes(LaterAnchor),
      'the later flex override is gone — re-check which block now wins'
    )
  })

  it('does not give a merge action a fixed size along the column', () => {
    const buttons = declarationsFor('> .button-component', LaterAnchor)
    assert.doesNotMatch(
      buttons,
      /flex:\s*1 1 150px/,
      'a 150px basis down a flex column is a 150px-tall button'
    )
    assert.match(buttons, /flex:\s*0 0 auto/)
  })

  it('keeps a floor so the action stays a usable target', () => {
    const buttons = declarationsFor('> .button-component', LaterAnchor)
    assert.match(buttons, /min-height:\s*\d+px/)
  })
})
