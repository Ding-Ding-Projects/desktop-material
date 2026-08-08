import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readStyle = (name: string) =>
  readFileSync(join(process.cwd(), 'app', 'styles', 'ui', name), 'utf8')

describe('responsive repository surface style contracts', () => {
  it('keeps fixed repository and branch sheets inside their viewport insets', () => {
    const style = readStyle('_foldout.scss')

    assert.match(
      style,
      /&:has\(\.repository-list\),\s*&:has\(\.branches-container\) \{[\s\S]*?\.foldout\s*\{[\s\S]*?left: 10px !important;[\s\S]*?width: min\(390px, calc\(100vw - 20px\)\) !important;[\s\S]*?min-width: min\(390px, calc\(100vw - 20px\)\) !important;[\s\S]*?max-width: calc\(100vw - 20px\);/
    )

    const viewportWidth = 320
    const inset = 10
    const sheetWidth = Math.min(390, viewportWidth - inset * 2)
    assert.equal(sheetWidth, 300)
    assert.ok(inset + sheetWidth + inset <= viewportWidth)
  })

  it('bounds cloning and missing-repository views and restores short-height scrolling', () => {
    const cloning = readStyle('_cloning-repository-view.scss')
    const missing = readStyle('_missing-repository-view.scss')

    for (const style of [cloning, missing]) {
      assert.match(style, /width: min\(600px, 100%\);\s*min-width: 0;/)
      assert.match(
        style,
        /@media \(max-height: 520px\)[\s\S]*?margin-top: 0;[\s\S]*?overflow-y: auto;/
      )
    }

    assert.match(
      cloning,
      /@media \(max-height: 520px\)[\s\S]*?\.details\s*\{\s*margin-bottom: 0;/
    )
  })

  it('stacks every missing-repository recovery action at narrow widths', () => {
    const style = readStyle('_missing-repository-view.scss')

    assert.match(
      style,
      /@media \(max-width: 520px\)[\s\S]*?#missing-repository-view > \.row-component\s*\{[\s\S]*?width: 100%;[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;[\s\S]*?gap: var\(--spacing\);/
    )
    assert.match(style, /> \*:not\(:last-child\)\s*\{\s*margin-right: 0;/)
    assert.match(
      style,
      /\.button-component\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?align-self: stretch;/
    )
  })
})
