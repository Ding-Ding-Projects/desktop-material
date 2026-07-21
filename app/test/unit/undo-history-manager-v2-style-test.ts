import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const style = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_versioned-store-history.scss'),
  'utf8'
)
const component = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'version-history',
    'versioned-store-history.tsx'
  ),
  'utf8'
)

describe('undo history manager v2 styles', () => {
  it('fills both Undo and Redo pills with the secondary container pair', () => {
    assert.match(
      style,
      /\.versioned-store-history-undo,\s*\.versioned-store-history-redo\s*\{[\s\S]*?background: var\(--md-sys-color-secondary-container\);[\s\S]*?color: var\(--md-sys-color-on-secondary-container\);/
    )
    // The old primary-container Undo emphasis is gone from the actions row:
    // inspect only the undo/redo declaration block itself.
    const undoRedoBlock = style.match(
      /\.versioned-store-history-undo,\s*\.versioned-store-history-redo\s*\{[^}]*\}/
    )
    assert.ok(undoRedoBlock !== null, 'undo/redo pill block exists')
    assert.doesNotMatch(undoRedoBlock[0], /primary-container/)
    assert.match(component, /className="versioned-store-history-redo"/)
  })

  it('shapes the actions row as 40px pills with a trailing 28px count chip', () => {
    assert.match(
      style,
      /\.versioned-store-history-toolbar\s*\{[\s\S]*?gap: 8px;[\s\S]*?padding: 0 16px 12px;[\s\S]*?\.button-component\s*\{[\s\S]*?gap: 7px;[\s\S]*?height: 40px;[\s\S]*?border-radius: 999px;/
    )
    assert.match(
      style,
      /\.versioned-store-history-count\s*\{[\s\S]*?height: 28px;[\s\S]*?border-radius: 999px;[\s\S]*?background: var\(--md-sys-color-surface-container-high\);[\s\S]*?font-size: 11\.5px;/
    )
    // Disabled actions keep the flattened neutral treatment.
    assert.match(
      style,
      /\.button-component\[aria-disabled='true'\]\s*\{[\s\S]*?background: var\(--md-sys-color-surface-container-highest\);[\s\S]*?opacity: 0\.38;/
    )
  })

  it('composes the header as icon row + full-width description paragraph', () => {
    assert.match(
      style,
      /\.versioned-store-history-header\s*\{[\s\S]*?gap: 12px;[\s\S]*?padding: 20px 20px 6px;/
    )
    assert.match(
      style,
      /\.versioned-store-history-description\s*\{[\s\S]*?padding: 0 20px 12px;[\s\S]*?color: var\(--md-sys-color-on-surface-variant\);[\s\S]*?font-size: 12px;[\s\S]*?line-height: 1\.55;/
    )
    // The paragraph renders between the header and the actions row.
    assert.match(
      component,
      /\{this\.renderHeader\(\)\}\s*<p className="versioned-store-history-description">\s*\{this\.props\.description\}\s*<\/p>\s*\{this\.renderToolbar\(\)\}/
    )
    // The close affordance twists away on press, per the prototype.
    assert.match(
      style,
      /\.versioned-store-history-close\.button-component\s*\{[\s\S]*?transform: scale\(0\.86\) rotate\(90deg\);/
    )
  })

  it('renders log rows as radius-14 pills with a staggered dmUp entrance', () => {
    assert.match(
      style,
      /\.versioned-store-history-entry\s*\{[\s\S]*?border-radius: 14px;[\s\S]*?animation: dmUp calc\(400ms \* var\(--mdur, 1\)\) var\(--spring\) backwards;/
    )
    assert.match(style, /&:nth-child\(#\{\$i\}\)/)
    assert.match(
      style,
      /\.versioned-store-history-entry\s*\{[\s\S]*?&:active\s*\{\s*transform: scale\(0\.98\);/
    )
    assert.match(style, /\.versioned-store-history-list\s*\{[\s\S]*?gap: 2px;/)
  })

  it('styles the sha chip, message, and time per the prototype log rows', () => {
    assert.match(
      style,
      />\s*code\s*\{[\s\S]*?padding: 4px 8px;[\s\S]*?border-radius: 8px;[\s\S]*?font-family: var\(--font-family-monospace\);[\s\S]*?font-size: 11px;[\s\S]*?font-weight: var\(--font-weight-semibold\);/
    )
    assert.match(
      style,
      /\.versioned-store-history-entry-copy\s*\{[\s\S]*?strong\s*\{[\s\S]*?font-size: 12\.5px;/
    )
    assert.match(
      style,
      /\.versioned-store-history-entry-time\s*\{\s*font-size: 11px;\s*opacity: 0\.85;/
    )
  })

  it('badges HEAD as a filled primary pill that bounces in', () => {
    assert.match(
      style,
      /\.versioned-store-history-head\s*\{[\s\S]*?height: 22px;[\s\S]*?padding: 0 9px;[\s\S]*?background: var\(--md-sys-color-primary\);[\s\S]*?color: var\(--md-sys-color-on-primary\);[\s\S]*?font-size: 10\.5px;[\s\S]*?font-weight: 800;[\s\S]*?letter-spacing: 0\.04em;[\s\S]*?animation: dmBounce/
    )
    // Non-HEAD rows end in the dimmed 17px history glyph (the restore button).
    assert.match(
      style,
      /\.versioned-store-history-restore\.button-component\s*\{[\s\S]*?\.octicon\s*\{[\s\S]*?width: 17px;[\s\S]*?height: 17px;[\s\S]*?opacity: 0\.7;/
    )
  })

  it('labels the pills Undo and Redo with their matching glyphs', () => {
    assert.match(
      component,
      /<Octicon symbol=\{octicons\.undo\} \/> \{this\.strings\.undo\}\s*</
    )
    assert.match(
      component,
      /<Octicon symbol=\{octicons\.redo\} \/> \{this\.strings\.redo\}\s*</
    )
    assert.match(component, /undo: 'Undo'/)
    assert.match(component, /redo: 'Redo'/)
  })

  it('suppresses the entrance choreography under reduced motion', () => {
    assert.match(
      style,
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.versioned-store-history-panel,\s*\.versioned-store-history-entry,\s*\.versioned-store-history-head\s*\{\s*animation: none;/
    )
  })
})
