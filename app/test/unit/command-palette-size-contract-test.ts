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
const palette = Path.resolve(
  __dirname,
  '../../src/ui/command-palette/command-palette.tsx'
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
  const narrowWidthMarker = '@media (max-width: 600px) {'
  const shortHeightMarker = '@media (max-height: 420px) {'
  const narrowWidthStart = css.indexOf(narrowWidthMarker)
  const shortHeightStart = css.indexOf(shortHeightMarker)
  const baseGeometryEnd = [narrowWidthStart, shortHeightStart]
    .filter(start => start !== -1)
    .reduce((earliest, start) => Math.min(earliest, start), css.length)
  const baseGeometry = css.slice(0, baseGeometryEnd)
  const start = baseGeometry.lastIndexOf(marker)
  assert.notEqual(start, -1, `the ${size} size must exist`)
  const end = baseGeometry.indexOf('\n  }', start)
  assert.notEqual(end, -1, `the ${size} size must be a closed rule`)
  return baseGeometry.slice(start, end)
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
    const shared = css.slice(start, css.indexOf('\n  }', start))

    // A card that reaches the window edge reads as a failed full screen
    // rather than as a surface floating over the app.
    assert.match(shared, /top: var\(--command-palette-float-top\)/)
    assert.match(
      shared,
      /border-radius: var\(--md-sys-shape-corner-extra-large/
    )

    // Each size centres itself with `left` from its own width: half the window
    // minus half the card, never closer to the edge than the card's margin.
    assert.match(
      sizeBlock(css, 'medium'),
      /left: max\(32px, calc\(50vw - 440px\)\);/
    )
    assert.match(
      sizeBlock(css, 'compact'),
      /left: max\(24px, calc\(50vw - 310px\)\);/
    )
  })

  it('never centres a card with transform', async () => {
    // The Dialog component keeps a floating dialog on screen by writing an
    // inline `transform: translate(x, y)` on drag and on resize, and an inline
    // transform replaces the stylesheet's rather than adding to it. Centring
    // through `translateX(-50%)` therefore lasted exactly one frame: the
    // entrance keyframes own `transform` while they play, the resize observer
    // measured the card at `left: 50%` with no shift and at scale 0.82, the
    // clamp wrote a correction for that box, and the correction stuck. At a
    // 1280px window the palette sat 71px past the right edge with its close
    // button, regex-builder button and appearance toggle unreachable.
    const css = await readStylesheet()
    const surface = css.slice(
      css.indexOf(
        '#dialog-layer dialog#command-palette.command-palette-surface[open] {'
      ),
      css.indexOf('@media (max-height: 420px) {')
    )
    assert.doesNotMatch(surface, /^\s*transform:/m)
    assert.doesNotMatch(surface, /^\s*left: 50%/m)
  })

  it('lets the title keep its width inside a narrow results pane', async () => {
    const css = await readStylesheet()

    // The group chip answers to the pane's width, not the window's: inside the
    // medium card at a 1280px window the pane is 456px wide while the window
    // is not narrow, and the chip was costing the title its last word.
    assert.match(
      css,
      /\.command-palette-results\s*\{[\s\S]*?container: palette-results \/ inline-size;/
    )
    assert.match(
      css,
      /@container palette-results \(max-width: 600px\)\s*\{\s*\.command-palette-group\s*\{\s*display: none;/
    )

    // Only a row with an inline control reserves the control's width. A plain
    // command's Run button is always in the tree, so it holds its own width.
    assert.match(css, /\.command-palette-row-actions\s*\{[\s\S]*?min-width: 0;/)
    assert.match(
      css,
      /\.command-palette-row\.has-control \.command-palette-row-actions\s*\{\s*min-width: 132px;/
    )

    // The title, the place it lives and the search terms wrap instead of
    // ending in an ellipsis, and the closed select has room for its longest
    // label. (A `title` disclosure is not an option: the repository's a11y
    // lint forbids the attribute outside an iframe.)
    for (const selector of [
      '.command-palette-title {',
      '.command-palette-where {',
      '.command-palette-keywords {',
    ]) {
      const start = css.indexOf(selector)
      assert.notEqual(start, -1, `${selector} must exist`)
      const block = css.slice(start, css.indexOf('\n  }', start))
      assert.doesNotMatch(block, /white-space: nowrap/, selector)
      assert.doesNotMatch(block, /text-overflow: ellipsis/, selector)
    }
    assert.match(
      css,
      /\.command-palette-select\s*\{\s*max-width: min\(280px, 100%\);/
    )

    // A row wraps its trailing zone beneath the text once the text column
    // would drop under 200px; otherwise a wide select leaves the title one
    // character per line.
    assert.match(css, /\.command-palette-row\s*\{[\s\S]*?flex-wrap: wrap;/)
    assert.match(css, /\.command-palette-row-copy\s*\{[\s\S]*?flex: 1 1 200px;/)
    assert.match(
      css,
      /\.command-palette-row-actions\s*\{[\s\S]*?margin-left: auto;/
    )

    // Palette-owned controls meet the 40px pointer target the layout audit
    // holds every control to; the Run pill keeps at least 32px of height.
    for (const control of [
      '.command-palette-appearance-toggle',
      '.command-palette-apply',
    ]) {
      const block = css.slice(
        css.indexOf(`${control} {`),
        css.indexOf('\n  }', css.indexOf(`${control} {`))
      )
      assert.match(block, /width: 40px;/, control)
      assert.match(block, /height: 40px;/, control)
    }
    assert.match(css, /\.command-palette-run\s*\{[\s\S]*?min-height: 32px;/)

    // The palette's dialog header close button is a 40px target rather than
    // the shared mixin's 16px icon box, scoped here so the frozen dialog
    // stylesheet stays untouched.
    assert.match(
      css,
      /\.dialog-header \.close\s*\{[\s\S]*?width: 40px;[\s\S]*?height: 40px;/
    )
  })

  it('uses the native modal layer for the centred scrim and focus trap', async () => {
    const source = await readFile(palette, 'utf8')
    assert.match(source, /id="command-palette"[\s\S]*?modal=\{true\}/)
  })

  it('keeps results usable in the 200 percent short-height viewport', async () => {
    const css = await readStylesheet()
    const marker = '@media (max-height: 420px) {'
    const start = css.lastIndexOf(marker)
    assert.notEqual(start, -1, 'the short-height palette layout must exist')
    const shortHeight = css.slice(start)

    assert.match(
      shortHeight,
      /&\.command-palette-size-medium,[\s\S]*?&\.command-palette-size-compact/
    )
    assert.match(shortHeight, /top: var\(--command-palette-top\);/)
    assert.match(shortHeight, /bottom: 8px;/)
    assert.match(shortHeight, /height: auto;/)
    assert.match(
      shortHeight,
      /max-height: calc\(100vh - var\(--command-palette-top\) - 8px\);/
    )
    assert.match(
      shortHeight,
      /\.dialog-content\s*\{[\s\S]*?max-height: none !important;[\s\S]*?overflow-y: hidden;/
    )
    assert.match(
      shortHeight,
      /\.command-palette-body\s*\{[\s\S]*?min-height: min\(88px, 32vh\);/
    )
    assert.match(
      shortHeight,
      /\.command-palette-hints\s*\{[\s\S]*?display: none;/
    )
    assert.match(css, /\.command-palette-results\s*\{[\s\S]*?overflow-y: auto;/)
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
