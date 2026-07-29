import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode } from '../../../src/lib/fuzzy-find'
import { SettingsSearch } from '../../../src/ui/preferences/settings-search'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('SettingsSearch', () => {
  it('preserves native input navigation and hides stale popup relationships when no results exist', () => {
    render(
      <SettingsSearch
        query="not-a-setting"
        filterMode={FilterMode.Fuzzy}
        caseSensitive={false}
        results={[]}
        languageMode="english"
        onQueryChange={() => undefined}
        onFilterModeChange={() => undefined}
        onCaseSensitiveChange={() => undefined}
        onRegexPatternApply={() => undefined}
        onNavigate={() => undefined}
      />
    )

    const input = screen.getByRole('combobox', { name: 'Search settings' })
    assert.equal(screen.queryByRole('listbox'), null)
    assert.equal(input.getAttribute('aria-controls'), null)
    assert.equal(input.getAttribute('aria-expanded'), 'false')
    assert.equal(input.getAttribute('aria-activedescendant'), null)

    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      assert.equal(
        fireEvent.keyDown(input, { key }),
        true,
        `${key} should preserve the search field's native behavior`
      )
    }
  })
})
