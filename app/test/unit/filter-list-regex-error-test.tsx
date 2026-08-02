import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode, matchWithMode } from '../../src/lib/fuzzy-find'
import { AugmentedSectionFilterList } from '../../src/ui/lib/augmented-filter-list'
import { FilterList, IFilterListItem } from '../../src/ui/lib/filter-list'
import { render } from '../helpers/ui/render'

// List and SectionList construct their observer from `window.ResizeObserver`
// while the shared UI setup only polyfills the global one. Mirror it onto the
// jsdom window so mounting either list works here.
if (typeof window !== 'undefined') {
  Object.assign(window, { ResizeObserver: globalThis.ResizeObserver })
}

const items: ReadonlyArray<IFilterListItem> = [
  { id: 'one', text: ['alpha'] },
  { id: 'two', text: ['beta'] },
]

const groups = [{ identifier: 'group', items }]

/** A pattern RE2 refuses to compile, so the matcher hands back an error. */
const InvalidPattern = '('

/**
 * The exact message the shared matcher produces for {@link InvalidPattern}.
 * Deriving it keeps the assertion honest if the localized wording changes.
 */
function expectedRegexError(): string {
  const { regexError } = matchWithMode(
    InvalidPattern,
    items,
    item => item.text,
    { mode: FilterMode.Regex, caseSensitive: false }
  )
  assert.ok(regexError !== null)
  return regexError
}

function renderItem(item: IFilterListItem) {
  return <div>{item.text[0]}</div>
}

function selectRegexMode(filterListId: string) {
  localStorage.setItem(`filter-mode/${filterListId}`, FilterMode.Regex)
}

describe('filter list invalid-regex messaging', () => {
  afterEach(() => localStorage.clear())

  it('FilterList announces the regex error instead of silently listing everything', () => {
    selectRegexMode('regex-error-filter-list')
    const view = render(
      <FilterList
        rowHeight={30}
        groups={groups}
        selectedItem={null}
        renderItem={renderItem}
        invalidationProps={items}
        filterListId="regex-error-filter-list"
        filterText={InvalidPattern}
      />
    )

    const alert = view.getByRole('alert')
    assert.equal(alert.textContent, expectedRegexError())
    assert.equal(alert.className, 'filter-list-regex-message')
  })

  it('AugmentedSectionFilterList announces the regex error instead of silently listing everything', () => {
    selectRegexMode('regex-error-augmented-list')
    const view = render(
      <AugmentedSectionFilterList
        rowHeight={30}
        groups={groups}
        selectedItems={[]}
        renderItem={renderItem}
        invalidationProps={items}
        filterListId="regex-error-augmented-list"
        filterText={InvalidPattern}
      />
    )

    const alert = view.getByRole('alert')
    assert.equal(alert.textContent, expectedRegexError())
    assert.equal(alert.className, 'filter-list-regex-message')
  })

  it('renders no alert while the pattern compiles', () => {
    selectRegexMode('regex-error-filter-list')
    const view = render(
      <FilterList
        rowHeight={30}
        groups={groups}
        selectedItem={null}
        renderItem={renderItem}
        invalidationProps={items}
        filterListId="regex-error-filter-list"
        filterText="alpha"
      />
    )

    assert.equal(view.queryByRole('alert'), null)
  })
})
