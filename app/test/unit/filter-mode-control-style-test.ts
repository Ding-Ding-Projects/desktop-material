import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const styles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_filter-mode-control.scss'),
  'utf8'
)
const releases = readFileSync(
  join(process.cwd(), 'app/styles/ui/_github-releases.scss'),
  'utf8'
)

describe('shared filter control hit targets', () => {
  it('keeps shared actions at 40px outside the high-zoom release layout', () => {
    assert.match(
      styles,
      /\.filter-mode-button,[\s\S]*?\.filter-case-button\s*\{[\s\S]*?height: 40px;[\s\S]*?min-width: 40px;/
    )
    assert.match(
      styles,
      /\.filter-regex-builder-button\s*\{[\s\S]*?height: 40px;/
    )
    assert.match(styles, /\.filter-chip\s*\{[\s\S]*?height: 40px;/)
    assert.doesNotMatch(styles, /height: 30px;/)
    const compactReleaseQuery =
      '@media (max-width: 800px) and (max-height: 560px)'
    const releasesBeforeCompactQuery = releases.slice(
      0,
      releases.indexOf(compactReleaseQuery)
    )
    assert.doesNotMatch(
      releasesBeforeCompactQuery,
      /\.filter-(?:mode|case|regex-builder)-button[\s\S]{0,180}?height: (?:28|30|32)px;/
    )
    assert.match(
      releases.slice(releases.indexOf(compactReleaseQuery)),
      /\.github-releases-search-field \{[\s\S]*?min-width: 32px;[\s\S]*?height: 32px;/
    )
  })

  it('keeps every shared filter action keyboard-visible', () => {
    assert.match(
      styles,
      /\.filter-mode-button,\s*\.filter-case-button\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?var\(--md-sys-color-primary\)/
    )
    assert.match(
      styles,
      /\.filter-regex-builder-button\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?var\(--md-sys-color-primary\)/
    )
    assert.match(
      styles,
      /\.filter-chip\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?var\(--md-sys-color-primary\)/
    )
  })
})
