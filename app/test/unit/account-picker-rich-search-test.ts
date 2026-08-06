import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const component = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'account-picker.tsx'),
  'utf8'
)

describe('account picker rich search contract', () => {
  it('shows rich identity metadata and a searchable filter surface', () => {
    assert.match(component, /getAccountKey/)
    assert.match(component, /getAccountSearchText/)
    assert.match(component, /getAccountDetailsText/)
    assert.match(component, /<SectionFilterList/)
    assert.match(
      component,
      /filterAriaLabel=\{t\('accounts\.picker\.searchLabel'\)\}/
    )
    assert.match(
      component,
      /placeholderText=\{t\('accounts\.picker\.searchPlaceholder'\)\}/
    )
    assert.match(component, /filterInputType="search"/)
  })

  it('gives the three-line row enough height for the tertiary metadata', () => {
    assert.match(component, /rowHeight=\{60\}/)
    assert.match(component, /className="tertiary"/)
  })
})
