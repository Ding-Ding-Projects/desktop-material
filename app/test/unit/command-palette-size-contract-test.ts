import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import { DefaultCommandPaletteAppearance } from '../../src/ui/command-palette/command-palette-appearance'

const stylesheet = Path.resolve(
  __dirname,
  '../../styles/ui/_command-palette.scss'
)
const editor = Path.resolve(
  __dirname,
  '../../src/ui/command-palette/command-palette-appearance-editor.tsx'
)

/**
 * The stylesheet with newlines normalized. The file is checked out with CRLF
 * on Windows, which quietly defeats any multi-line search written with \n.
 */
async function readStylesheet(): Promise<string> {
  return (await readFile(stylesheet, 'utf8')).replace(/\r\n/g, '\n')
}

/**
 * The body of the rule that actually declares a given size's geometry.
 *
 * `command-palette-size-compact` appears twice — once as the second selector
 * of the block the two card sizes share, and once as its own rule. Taking the
 * first hit measured the shared block and reported a missing width that was
 * there all along, so this takes the rule that really sets it.
 */
function sizeBlock(css: string, size: string): string {
  const marker = `&.command-palette-size-${size} {`
  const start = css.lastIndexOf(marker)
  assert.notEqual(start, -1, `the ${size} size must exist`)
  const end = css.indexOf('\n  }', start)
  assert.notEqual(end, -1, `the ${size} size must be a closed rule`)
  return css.slice(start, end)
}

describe('command palette size contract', () => {
  it('does not default to swallowing the whole window', () => {
    // The palette shipped as Material Design 3's full-screen search view and
    // nothing else. On an ordinary desktop window that is far more surface
    // than a search box needs, so the bounded card is the default now and the
    // full-screen view is a choice.
    assert.equal(DefaultCommandPaletteAppearance.size, 'medium')
  })

  it('bounds the two card sizes and leaves full screen unbounded', async () => {
    const css = await readStylesheet()

    assert.match(sizeBlock(css, 'medium'), /width: min\(880px/)
    assert.match(sizeBlock(css, 'medium'), /max-height: calc\(100vh/)
    assert.match(sizeBlock(css, 'compact'), /width: min\(620px/)

    const full = sizeBlock(css, 'full')
    assert.match(full, /width: 100vw/)
    assert.match(full, /max-height: none/)
  })

  it('keeps the card sizes centred and off the window edge', async () => {
    const css = await readStylesheet()
    const start = css.indexOf(
      '&.command-palette-size-medium,\n  &.command-palette-size-compact {'
    )
    assert.notEqual(start, -1, 'the two card sizes must share their geometry')
    const block = css.slice(start, start + 600)

    // A card that reaches the window edge reads as a failed full screen
    // rather than as a surface floating over the app.
    assert.match(block, /left: 50%/)
    assert.match(block, /transform: translateX\(-50%\)/)
    assert.match(block, /border-radius: var\(--md-sys-shape-corner-extra-large/)
  })

  it('offers the size as a control, not only as a stored value', async () => {
    const source = await readFile(editor, 'utf8')
    assert.match(source, /renderSizeOption/)
    assert.match(source, /name="command-palette-size"/)
    for (const size of ['compact', 'medium', 'full']) {
      assert.match(
        source,
        new RegExp(`renderSizeOption\\(\\s*'${size}'`),
        `the ${size} size must be selectable`
      )
    }
  })

  it('does not let the randomized row look steal the chosen size', async () => {
    const source = (await readFile(editor, 'utf8')).replace(/\r\n/g, '\n')
    // Every other appearance fieldset is disabled under the random row look,
    // because the random look owns those. Size is geometry, not decoration.
    const legend = "<legend>{t('commandPalette.paletteSize')}</legend>"
    const at = source.indexOf(legend)
    assert.notEqual(at, -1, 'the size fieldset must exist')
    assert.doesNotMatch(
      source.slice(Math.max(0, at - 120), at),
      /<fieldset disabled=/,
      'the size fieldset must stay usable under the randomized row look'
    )
  })
})
