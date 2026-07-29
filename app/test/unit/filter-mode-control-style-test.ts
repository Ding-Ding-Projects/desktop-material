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
  it('keeps every shared filter action at the repository 40px minimum', () => {
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
    assert.doesNotMatch(
      releases,
      /\.filter-(?:mode|case|regex-builder)-button[\s\S]{0,180}?height: (?:28|30|32)px;/
    )
  })
})
