import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode } from '../../../src/lib/fuzzy-find'
import { filterSettingsEntries } from '../../../src/lib/settings-search/settings-search-catalog'
import { PreferencesTab } from '../../../src/models/preferences'
import { SettingsSearch } from '../../../src/ui/preferences/settings-search'
import { fireEvent, render, screen } from '../../helpers/ui/render'

/** The title characters the Appearance "Theme" row emphasizes as matched. */
function markedTitleCharacters(): string {
  const row = screen.getByRole('option', { name: 'Theme, in Appearance' })
  return Array.from(row.querySelectorAll('.settings-search-mark'))
    .map(mark => mark.textContent ?? '')
    .join('')
}

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

  it('emphasizes what a regex pattern matched rather than the pattern text', () => {
    const options = { mode: FilterMode.Regex, caseSensitive: false }
    const results = filterSettingsEntries('the?me', options).results

    render(
      <SettingsSearch
        query="the?me"
        filterMode={FilterMode.Regex}
        caseSensitive={false}
        results={results}
        languageMode="english"
        onQueryChange={() => undefined}
        onFilterModeChange={() => undefined}
        onCaseSensitiveChange={() => undefined}
        onRegexPatternApply={() => undefined}
        onNavigate={() => undefined}
      />
    )

    // A pattern is not a substring of the text it matched, so a literal search
    // for "the?me" in "Theme" marks nothing and leaves the user with a result
    // row that never says why it is a result.
    assert.equal(markedTitleCharacters(), 'Theme')
  })

  it('emphasizes a fuzzy match left over from a case-sensitive session', () => {
    // Fuzzy matching is case-insensitive whatever the toggle says, so a match
    // the user can see must not lose its highlight to a case-sensitive lookup.
    const options = { mode: FilterMode.Fuzzy, caseSensitive: true }
    const results = filterSettingsEntries('theme', options).results

    render(
      <SettingsSearch
        query="theme"
        filterMode={FilterMode.Fuzzy}
        caseSensitive={true}
        results={results}
        languageMode="english"
        onQueryChange={() => undefined}
        onFilterModeChange={() => undefined}
        onCaseSensitiveChange={() => undefined}
        onRegexPatternApply={() => undefined}
        onNavigate={() => undefined}
      />
    )

    assert.equal(markedTitleCharacters(), 'Theme')
  })
})
