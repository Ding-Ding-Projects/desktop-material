import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const publishStyles = readFileSync(
  join(
    process.cwd(),
    'app',
    'styles',
    'ui',
    'dialogs',
    '_publish-repository.scss'
  ),
  'utf8'
)
const selectStyles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_select.scss'),
  'utf8'
)

describe('Publish organization picker responsive styles', () => {
  it('gives the listbox a usable non-collapsing height and contained scroll', () => {
    assert.match(
      publishStyles,
      /\.publish-organization-results\s*\{[\s\S]*?height: clamp\(128px, 20vh, 176px\);[\s\S]*?min-height: 128px;[\s\S]*?max-height: 176px;[\s\S]*?flex: 0 0 auto;[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;[\s\S]*?scrollbar-gutter: stable;/
    )
  })

  it('contains long organization names instead of widening the dialog', () => {
    assert.match(
      publishStyles,
      /\.publish-organization-picker,[\s\S]*?\.publish-organization-option\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
    assert.match(
      publishStyles,
      /\.publish-organization-option-copy\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/
    )
  })

  it('stacks the search before mode controls at phone width', () => {
    assert.match(
      publishStyles,
      /@media \(max-width: 480px\)\s*\{[\s\S]*?\.publish-organization-search\s*\{[\s\S]*?flex-basis: 100%;[\s\S]*?\.filter-mode-control\s*\{[\s\S]*?width: 100%;/
    )
  })

  it('keeps legacy select controls shrinkable throughout the app', () => {
    assert.match(
      selectStyles,
      /\.select-component\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
    assert.match(
      selectStyles,
      /\.select-input\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
    assert.match(
      selectStyles,
      /select\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
  })
})
