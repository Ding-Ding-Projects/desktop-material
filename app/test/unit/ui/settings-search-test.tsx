import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode } from '../../../src/lib/fuzzy-find'
import { filterSettingsEntries } from '../../../src/lib/settings-search/settings-search-catalog'
import { PreferencesTab } from '../../../src/models/preferences'
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

  it('opens Advanced when the external-browser setting is selected', () => {
    const navigations: Array<{
      readonly tab: PreferencesTab
      readonly entryId: string
    }> = []
    const results = filterSettingsEntries('blank page', {
      mode: FilterMode.Substring,
      caseSensitive: false,
    }).results

    render(
      <SettingsSearch
        query="blank page"
        filterMode={FilterMode.Substring}
        caseSensitive={false}
        results={results}
        languageMode="english"
        onQueryChange={() => undefined}
        onFilterModeChange={() => undefined}
        onCaseSensitiveChange={() => undefined}
        onRegexPatternApply={() => undefined}
        onNavigate={(tab, entryId) => navigations.push({ tab, entryId })}
      />
    )

    fireEvent.click(
      screen.getByRole('option', {
        name: 'Open web links, in Advanced',
      })
    )

    assert.deepEqual(navigations, [
      {
        tab: PreferencesTab.Advanced,
        entryId: 'advanced-browser-open-mode',
      },
    ])
  })
})
