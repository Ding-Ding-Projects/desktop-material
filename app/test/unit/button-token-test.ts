import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Two stylesheets declaring the same token on the same selector.
 *
 * `_variables.scss` and `_material.scss` both set the button tokens on `:root`,
 * and `desktop.scss` imports the Material layer second — so the Material value
 * is the one that renders and the one in `_variables.scss` never wins.
 *
 * That is a perfectly ordinary layering arrangement and a genuinely misleading
 * one to read. `_variables.scss` carried `--button-height: 25px` and
 * `--button-border-radius: 6px` long after the app had stopped rendering
 * either, and anyone grepping for the token found the dead value first. It cost
 * exactly that: a commit that "fixed" the button size by editing the file that
 * does not decide it, and a claim in a changelog that the fix reached every
 * button when it reached none.
 *
 * So the two are asserted to agree. The fallback is then honest whichever file
 * a reader opens, and it is a real fallback if something ever stops importing
 * the Material layer.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

/** The value a `:root` declaration gives a token, last one winning. */
function tokenValue(source: string, token: string): string | null {
  const matches = [...source.matchAll(new RegExp(`${token}:\s*([^;]+);`, 'g'))]
  const last = matches[matches.length - 1]
  return last === undefined ? null : last[1].trim()
}

describe('the button tokens agree across both stylesheets', () => {
  const variables = read('app/styles/_variables.scss')
  const material = read('app/styles/_material.scss')

  for (const token of ['--button-height', '--button-border-radius']) {
    it(`declares the same ${token} in both files`, () => {
      const fallback = tokenValue(variables, token)
      const applied = tokenValue(material, token)
      assert.notStrictEqual(fallback, null, `${token} missing from _variables`)
      assert.notStrictEqual(applied, null, `${token} missing from _material`)
      assert.strictEqual(
        fallback,
        applied,
        `${token} is "${fallback}" in _variables.scss and "${applied}" in ` +
          `_material.scss. The Material layer is imported second and wins, so ` +
          `the value in _variables.scss is dead — and reading it will mislead ` +
          `the next person exactly as it misled the last one.`
      )
    })
  }

  it('is a Material 3 button size rather than the pre-Material one', () => {
    // The height M3 gives its default button, and a fully rounded corner. Not
    // a style preference: 25px is under the minimum touch target.
    assert.strictEqual(tokenValue(material, '--button-height'), '40px')
    assert.strictEqual(tokenValue(material, '--button-border-radius'), '999px')
  })

  it('imports the Material layer after the variables it overrides', () => {
    // If this order ever reverses, every assertion above still passes and the
    // app silently renders the fallback values instead.
    const desktop = read('app/styles/desktop.scss')
    const variablesAt = desktop.indexOf("@import 'variables'")
    const materialAt = desktop.indexOf("@import 'material'")
    assert.notStrictEqual(variablesAt, -1)
    assert.notStrictEqual(materialAt, -1)
    assert.ok(
      materialAt > variablesAt,
      'the Material layer must be imported after the variables it overrides'
    )
  })
})
