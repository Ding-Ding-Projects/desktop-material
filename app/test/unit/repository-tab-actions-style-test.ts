import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const style = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_repository-tabs.scss'),
  'utf8'
)
const strip = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'repository-tabs',
    'repository-tab-strip.tsx'
  ),
  'utf8'
)

describe('repository tab action responsive styles', () => {
  it('adds inverse close without removing the existing close-matching action', () => {
    assert.match(strip, /label: 'Close Tabs Containing…'/)
    assert.match(strip, /label: 'Close All Tabs Except Those Containing…'/)
  })

  it('keeps favorite tabs visible, labelled, and independently sortable', () => {
    assert.match(strip, /Add to Favorites/)
    assert.match(strip, /setTabFavorite/)
    assert.match(style, /\.repository-tab-favorite\s*\{[\s\S]*?focus-visible/)
    assert.match(style, /&\.favorite \.repository-tab-favorite/)
  })

  it('bounds both Material action surfaces without horizontal clipping', () => {
    assert.match(
      style,
      /\.close-tabs-containing\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100vw - 52px\);[\s\S]*?max-height: min\([\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.close-tabs-except\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100vw - 52px\);[\s\S]*?max-height: min\([\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.arrange-tabs\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100vw - 52px\);[\s\S]*?max-height: min\([\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.tab-search-popover\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100vw - 52px\);[\s\S]*?max-height: min\([\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.tab-search-results\s*\{[\s\S]*?max-height: 350px;[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.tab-overflow-popover\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100vw - 52px\);[\s\S]*?max-height: min\([\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.tab-overflow-results\s*\{[\s\S]*?max-height: 350px;[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    // The overflow row is the option plus its own appearance-editor button. The
    // option must be the part that gives way (flex: 1 1 auto over a fixed
    // width) so a long tab name ellipsizes instead of pushing the button out of
    // the sheet at a narrow width or a high display scale.
    assert.match(
      style,
      /\.tab-overflow-row\s*\{[\s\S]*?display: flex;[\s\S]*?min-width: 0;/
    )
    assert.match(
      style,
      /\.tab-overflow-result\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;/
    )
    assert.match(
      style,
      /\.tab-overflow-input\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;/
    )
    assert.match(
      style,
      /\.popover-component:has\(\.close-tabs-except\),[\s\S]*?max-width: calc\(100vw - 20px\);[\s\S]*?max-height: var\(--available-height,[\s\S]*?overflow: hidden;/
    )
  })

  it('stacks arrange content and keeps sticky actions reachable when compact', () => {
    assert.match(
      style,
      /\.close-tabs-except-actions\s*\{[\s\S]*?position: sticky;[\s\S]*?flex-wrap: wrap;/
    )
    assert.match(style, /\.arrange-tabs-actions\s*\{[\s\S]*?position: sticky;/)
    assert.match(
      style,
      /@media \(max-width: 520px\), \(max-height: 560px\)[\s\S]*?\.arrange-tabs-row\s*\{[\s\S]*?flex-direction: column;[\s\S]*?\.arrange-tabs-sort-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/
    )
    assert.match(
      style,
      /\.arrange-tabs-filter\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/
    )
    assert.match(
      style,
      /@media \(max-width: 520px\), \(max-height: 560px\)[\s\S]*?\.tab-search-popover \.tab-search-results\s*\{[\s\S]*?max-height: 220px;/
    )
    assert.match(
      style,
      /@media \(max-width: 520px\), \(max-height: 560px\)[\s\S]*?\.tab-overflow-popover \.tab-overflow-results\s*\{[\s\S]*?max-height: 220px;/
    )
    assert.match(
      style,
      /@media \(max-width: 520px\), \(max-height: 560px\)[\s\S]*?\.tab-overflow-popover \.tab-overflow-filter-row \.filter-regex-builder-label\s*\{[\s\S]*?display: none;/
    )
  })

  it('gives the overflow search field and per-row customization visible focus', () => {
    assert.match(
      style,
      /\.tab-overflow-input\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid/
    )
    assert.match(
      style,
      /\.tab-overflow-result-customize\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid/
    )
    // 32px keeps the icon button inside the 36px search-field rhythm while
    // staying a comfortable pointer target next to the option row.
    assert.match(
      style,
      /\.tab-overflow-result-customize\s*\{[\s\S]*?width: 32px;[\s\S]*?height: 32px;/
    )
  })

  it('provides visible keyboard focus on tabs and action controls', () => {
    assert.match(
      style,
      /\.repository-tab\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid/
    )
    assert.match(
      style,
      /\.arrange-tabs[\s\S]*?button:focus-visible\s*\{[\s\S]*?outline: 2px solid/
    )
  })
})
