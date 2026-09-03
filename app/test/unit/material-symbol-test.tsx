import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'
import {
  MaterialSymbol,
  MaterialSymbolNames,
} from '../../src/ui/lib/material-symbol'
import { ToolbarButton } from '../../src/ui/toolbar/button'
import { ThemeToggleButton } from '../../src/ui/toolbar/theme-toggle-button'
import { Dispatcher } from '../../src/ui/dispatcher'
import { ApplicationTheme } from '../../src/ui/lib/application-theme'
import { renderCommitListItemTags } from '../../src/ui/history/commit-list-item'
import { render } from '../helpers/ui/render'

interface IFontManifest {
  readonly assets: ReadonlyArray<{
    readonly id: string
    readonly requestedIconNameCount?: number
    readonly requestedIconNames?: ReadonlyArray<string>
    readonly officialSubsetInspection?: {
      readonly ligatureNames?: ReadonlyArray<string>
    }
  }>
}

const root = process.cwd()

const fontManifest = () =>
  JSON.parse(
    readFileSync(
      join(root, 'app/styles/fonts/font-assets-manifest.json'),
      'utf8'
    )
  ) as IFontManifest

const symbolsAsset = () =>
  fontManifest().assets.find(
    candidate => candidate.id === 'material-symbols-rounded-subset-222'
  )

describe('MaterialSymbol', () => {
  it('exposes exactly the 222 ligatures requested by the bundled manifest', () => {
    const asset = symbolsAsset()

    assert.ok(asset !== undefined)
    assert.equal(MaterialSymbolNames.length, 222)
    assert.equal(new Set(MaterialSymbolNames).size, 222)
    assert.equal(asset.requestedIconNameCount, 222)
    assert.deepEqual(MaterialSymbolNames, asset.requestedIconNames)
  })

  // A ligature font renders the literal English word for a name it does not
  // carry, so "the gallery lists it" proves nothing. This asserts every name
  // the UI can render against the ligature table read out of the shipped
  // WOFF2 by script/inspect-material-symbols.py.
  it('carries every declared name in the shipped font ligature table', () => {
    const inspection = symbolsAsset()?.officialSubsetInspection
    const ligatures = new Set(inspection?.ligatureNames ?? [])

    assert.ok(
      ligatures.size > 0,
      'font-assets-manifest.json has no officialSubsetInspection.ligatureNames; ' +
        're-run py -3 script/inspect-material-symbols.py'
    )

    const missing = MaterialSymbolNames.filter(name => !ligatures.has(name))
    assert.deepEqual(
      missing,
      [],
      `not in the bundled font: ${missing.join(', ')}`
    )
  })

  it('renders a decorative ligature with safe defaults', () => {
    const view = render(<MaterialSymbol name="sell" className="tag-glyph" />)
    const symbol = view.container.querySelector<HTMLElement>('.material-symbol')

    assert.ok(symbol !== null)
    assert.equal(symbol.textContent, 'sell')
    assert.equal(symbol.getAttribute('aria-hidden'), 'true')
    assert.ok(symbol.classList.contains('tag-glyph'))
    assert.equal(symbol.style.fontSize, '24px')
    assert.equal(
      symbol.style.fontVariationSettings,
      `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`
    )
  })

  it('clamps every numeric input to the bundled font contract', () => {
    const view = render(
      <MaterialSymbol
        name="sync"
        size={999}
        fill={3}
        weight={999}
        grade={200}
        opticalSize={999}
      />
    )
    const symbol = view.container.querySelector<HTMLElement>('.material-symbol')

    assert.ok(symbol !== null)
    assert.equal(symbol.style.fontSize, '96px')
    assert.equal(
      symbol.style.fontVariationSettings,
      `'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 48`
    )

    view.rerender(
      <MaterialSymbol
        name="sync"
        size={-1}
        fill={-1}
        weight={-1}
        grade={-1}
        opticalSize={-1}
      />
    )
    assert.equal(symbol.style.fontSize, '8px')
    assert.equal(
      symbol.style.fontVariationSettings,
      `'FILL' 0, 'wght' 100, 'GRAD' 0, 'opsz' 20`
    )
  })

  it('keeps the glyph hidden while its owning toolbar control remains named', () => {
    const view = render(
      <ToolbarButton
        title="Fetch origin"
        ariaLabel="Fetch origin"
        materialSymbol="sync"
      />
    )
    const button = view.getByRole('button', { name: 'Fetch origin' })
    const symbol = button.querySelector('.material-symbol')

    assert.ok(symbol !== null)
    assert.equal(symbol.getAttribute('aria-hidden'), 'true')
    assert.equal(button.querySelector('svg.octicon'), null)
  })

  it('keeps theme status separate from the Material Symbol ligature text', () => {
    const dispatcher = {
      setSelectedTheme: () => undefined,
    } as unknown as Dispatcher
    const view = render(
      <ThemeToggleButton
        dispatcher={dispatcher}
        selectedTheme={ApplicationTheme.Light}
        currentTheme={ApplicationTheme.Light}
      />
    )
    const button = view.getByRole('button', { name: 'Toggle theme' })
    const status = button.querySelector('.sr-only')

    assert.equal(button.textContent, 'dark_modeLight theme')
    assert.equal(status?.textContent, 'Light theme')
  })

  it('updates the action glyph when the applied system theme changes', () => {
    const dispatcher = {
      setSelectedTheme: () => undefined,
    } as unknown as Dispatcher
    const view = render(
      <ThemeToggleButton
        dispatcher={dispatcher}
        selectedTheme={ApplicationTheme.System}
        currentTheme={ApplicationTheme.Light}
      />
    )

    assert.equal(
      view.container.querySelector('.material-symbol')?.textContent,
      'dark_mode'
    )
    view.rerender(
      <ThemeToggleButton
        dispatcher={dispatcher}
        selectedTheme={ApplicationTheme.System}
        currentTheme={ApplicationTheme.Dark}
      />
    )
    assert.equal(
      view.container.querySelector('.material-symbol')?.textContent,
      'light_mode'
    )
  })

  it('keeps a long History tag in its own ellipsis target beside the glyph', () => {
    const longTag = `release-${'material-'.repeat(20)}candidate`
    const view = render(<>{renderCommitListItemTags([longTag])}</>)
    const chip = view.container.querySelector('.tag-name')
    const label = chip?.querySelector('.tag-label')

    assert.equal(chip?.querySelector('.material-symbol')?.textContent, 'sell')
    assert.equal(label?.textContent, longTag)
    assert.equal(chip?.childElementCount, 2)
  })

  it('uses ligatures and a stable one-em box', () => {
    const style = readFileSync(
      join(root, 'app/styles/ui/_material-symbol.scss'),
      'utf8'
    )

    assert.match(style, /font-family: 'Material Symbols Rounded';/)
    assert.match(style, /font-feature-settings: 'liga';/)
    assert.match(style, /height: 1em;/)
    assert.match(style, /width: 1em;/)
    assert.match(style, /line-height: 1;/)
    assert.match(style, /white-space: nowrap;/)
  })
})
