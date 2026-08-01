import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const styles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_github-releases.scss'),
  'utf8'
)
const materialCards = readFileSync(
  join(process.cwd(), 'app/styles/ui/_material-cards.scss'),
  'utf8'
)

describe('GitHub Releases responsive Material styles', () => {
  it('contains explicit containment, wrapping, focus, and narrow layouts', () => {
    assert.match(styles, /min-width:\s*0/)
    assert.match(styles, /overflow-wrap:\s*anywhere/)
    assert.match(styles, /word-break:\s*break-all/)
    assert.match(styles, /:focus-visible/)
    assert.match(styles, /@media \(max-width: 760px\)/)
    assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('uses named inline-size containers for pane-aware compaction', () => {
    assert.match(
      styles,
      /\.github-releases-view \{[\s\S]*?container-name:\s*github-releases-pane;[\s\S]*?container-type:\s*inline-size;/
    )
    assert.match(
      styles,
      /\.github-releases-list-panel \{[\s\S]*?container-name:\s*github-releases-list;[\s\S]*?container-type:\s*inline-size;/
    )
    assert.match(
      styles,
      /@container github-releases-pane \(max-width: 760px\)[\s\S]*?\.github-releases-overview[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(112px, 1fr\)\);[\s\S]*?overflow-x:\s*visible;/
    )
    assert.match(
      styles,
      /@container github-releases-list \(max-width: 520px\)[\s\S]*?\.github-releases-filter-toolbar[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(96px, 112px\);/
    )
  })

  it('uses semantic Material tokens for surfaces and destructive states', () => {
    assert.match(styles, /--md-sys-color-surface-container-low/)
    assert.match(styles, /--md-sys-color-primary-container/)
    assert.match(styles, /--md-sys-color-error-container/)
    assert.match(styles, /\.destructive/)
  })

  it('styles the dashboard, filters, metadata, and resilient loading states', () => {
    assert.match(styles, /\.github-releases-overview/)
    assert.match(styles, /\.github-release-metric\.latest/)
    assert.match(styles, /\.github-releases-filter-toolbar/)
    assert.match(styles, /\.github-release-metadata/)
    assert.match(styles, /\.github-releases-loading-indicator/)
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps release rows visible with compact, accessible controls', () => {
    assert.match(
      styles,
      /grid-template-columns:\s*clamp\(420px, 34vw, 560px\) minmax\(0, 1fr\)/
    )
    assert.match(
      styles,
      /\.github-releases-bulk-selection input\[type='checkbox'\],[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;[\s\S]*?min-height:\s*18px;/
    )
    assert.match(
      styles,
      /\.github-releases-bulk-actions \{[\s\S]*?\.button-component \{[\s\S]*?min-height:\s*32px;/
    )
    assert.match(
      styles,
      /@container github-releases-list \(max-width: 520px\)[\s\S]*?\.github-release-row \{[\s\S]*?min-height:\s*52px;/
    )
    assert.match(
      styles,
      /@media \(max-height: 760px\)[\s\S]*?\.github-releases-list \{[\s\S]*?min-height:\s*128px;/
    )
    assert.match(
      styles,
      /@media \(max-height: 760px\)[\s\S]*?\.github-releases-view \{[\s\S]*?overflow-y:\s*auto;/
    )
    assert.match(
      materialCards,
      /:not\(\.actions-view\):not\(\.github-releases-view\):not\(\.cheap-lfs-manager-view\) \{\s*overflow: hidden;/
    )
    assert.match(
      styles,
      /\.github-releases-list \{[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?scrollbar-gutter:\s*stable;/
    )
  })

  it('reflows compact metrics instead of creating a horizontal strip', () => {
    assert.match(
      styles,
      /@container github-releases-pane \(max-width: 760px\)[\s\S]*?\.github-release-metric\.latest \{[\s\S]*?grid-column:\s*span 2;/
    )
    assert.match(
      styles,
      /@media \(max-height: 760px\)[\s\S]*?\.github-releases-overview \{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(108px, 1fr\)\);[\s\S]*?overflow-x:\s*visible;/
    )
    assert.doesNotMatch(
      styles,
      /@media \(max-height: 760px\)[\s\S]*?\.github-releases-overview \{[\s\S]*?overflow-x:\s*auto;/
    )
  })

  it('offers the search and filter disclosure at every width', () => {
    // It used to be display:none outside the narrow layout, so a roomy panel
    // could never reclaim the space the search and filter row occupies.
    assert.match(
      styles,
      /\.github-releases-compact-tools-toggle \{[\s\S]*?display:\s*flex;/
    )
    assert.doesNotMatch(
      styles,
      /\.github-releases-compact-tools-toggle \{\s*display:\s*none;/
    )
    // A chevron that turns with the state, and a focus ring, so it reads and
    // behaves as a disclosure rather than an unexplained button.
    assert.match(
      styles,
      /\.github-releases-compact-tools-toggle \{[\s\S]*?&:focus-visible \{[\s\S]*?outline:\s*2px solid var\(--md-sys-color-primary\);/
    )
    assert.match(
      styles,
      /\.github-releases-list-panel\.tools-collapsed\s*\.github-releases-compact-tools-toggle::after \{[\s\S]*?rotate:\s*-45deg;/
    )
    // The turn is motion, so it stands down under reduced motion.
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.github-releases-compact-tools-toggle::after \{[\s\S]*?transition:\s*none;/
    )
  })

  it('keeps a complete release row above the fold from 125% through 200% zoom', () => {
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-view \{[\s\S]*?gap:\s*3px;[\s\S]*?padding:\s*6px;/
    )
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-overview \{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?\.github-release-metric\.latest \{[\s\S]*?grid-column:\s*span 2;/
    )
    // The disclosure is available at every width now, so visibility is driven
    // by .tools-collapsed in the base rules rather than hidden-by-default here.
    assert.match(
      styles,
      /\.github-releases-list-panel\.tools-collapsed \.github-releases-compact-tools \{\s*display:\s*none;/
    )
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-list-panel\.tools-expanded \.github-releases-compact-tools \{\s*display:\s*block;/
    )
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-list-panel\.tools-expanded \{[\s\S]*?min-height:\s*320px;[\s\S]*?height:\s*auto;[\s\S]*?overflow-y:\s*visible;/
    )
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-layout \{\s*display:\s*contents;[\s\S]*?\.github-releases-list-panel \{[\s\S]*?height:\s*176px;[\s\S]*?order:\s*1;/
    )
    assert.match(
      styles,
      /@media \(max-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.github-releases-list \{[\s\S]*?min-height:\s*52px;[\s\S]*?\.github-release-row \{[\s\S]*?min-height:\s*52px;/
    )
    // Slice to the reduced-motion block that FOLLOWS the compact one. There is
    // now an earlier reduced-motion block in the base rules, so a plain
    // indexOf would end the slice before it started and silently test ''.
    const compactStart = styles.indexOf(
      '@media (max-width: 800px) and (max-height: 560px)'
    )
    const compactEnd = styles.indexOf(
      '@media (prefers-reduced-motion: reduce)',
      compactStart
    )
    const compactBlock = styles.slice(
      compactStart,
      compactEnd === -1 ? styles.length : compactEnd
    )
    assert.ok(compactBlock.length > 0, 'compact block must be found')
    assert.doesNotMatch(compactBlock, /font-size:\s*[78]px;/)
    assert.match(
      compactBlock,
      /\.github-releases-compact-tools-toggle \{[\s\S]*?min-height:\s*34px;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?font-size:\s*11px;[\s\S]*?> span:last-child \{[\s\S]*?white-space:\s*normal;/
    )
    assert.match(
      compactBlock,
      /\.github-releases-search-field \{[\s\S]*?min-width:\s*32px;[\s\S]*?height:\s*32px;/
    )
  })
})
