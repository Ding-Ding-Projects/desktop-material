import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { IAPIOrganization } from '../../../src/lib/api'
import { translate, translateForAccessibleName } from '../../../src/lib/i18n'
import {
  LanguageModeStorageKey,
  setLanguageModePreference,
} from '../../../src/lib/language-preference'
import { LanguageMode } from '../../../src/models/language-mode'
import {
  IPublishOrganizationPickerProps,
  PublishOrganizationPicker,
} from '../../../src/ui/publish-repository/publish-organization-picker'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

const organizations: ReadonlyArray<IAPIOrganization> = [
  {
    id: 11,
    login: 'Alpha-Labs',
    url: 'https://api.github.test/orgs/Alpha-Labs',
    avatar_url: 'https://avatars.github.test/alpha',
  },
  {
    id: 22,
    login: 'Beta-Studio',
    url: 'https://api.github.test/orgs/Beta-Studio',
    avatar_url: 'https://avatars.github.test/beta',
  },
]

const alpha = organizations[0]
const beta = organizations[1]
const FilterModeStorageKey = 'filter-mode/publish-organizations'

beforeEach(() => {
  localStorage.removeItem(FilterModeStorageKey)
  setLanguageModePreference('english')
})

afterEach(() => {
  localStorage.removeItem(FilterModeStorageKey)
  localStorage.removeItem(LanguageModeStorageKey)
})

function picker(overrides: Partial<IPublishOrganizationPickerProps> = {}): {
  readonly selected: Array<IAPIOrganization | null>
  readonly element: JSX.Element
} {
  const selected = new Array<IAPIOrganization | null>()
  const element = (
    <PublishOrganizationPicker
      organizations={organizations}
      selectedOrganization={beta}
      languageMode="english"
      onSelectedOrganizationChanged={organization =>
        selected.push(organization)
      }
      {...overrides}
    />
  )

  return { selected, element }
}

function searchBox(languageMode: LanguageMode = 'english'): HTMLElement {
  return screen.getByRole('searchbox', {
    name: translateForAccessibleName(
      'publish.organization.searchAriaLabel',
      {},
      languageMode
    ),
  })
}

describe('PublishOrganizationPicker', () => {
  it('selects an organization and the explicit None row', () => {
    const view = picker()
    render(view.element)

    fireEvent.click(screen.getByTestId('publish-organization-option-11'))
    assert.equal(document.activeElement, screen.getByRole('listbox'))
    fireEvent.click(screen.getByTestId('publish-organization-option-none'))
    assert.equal(document.activeElement, screen.getByRole('listbox'))

    assert.deepEqual(view.selected, [alpha, null])
    assert.equal(
      screen
        .getByTestId('publish-organization-option-none')
        .textContent?.includes(
          translate('publish.organization.none', 'english')
        ),
      true
    )
  })

  it('supports listbox navigation and Enter or Space selection', () => {
    const view = picker({ selectedOrganization: null })
    render(view.element)

    const list = screen.getByRole('listbox')
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'publish-organization-option-none'
    )

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'publish-organization-option-11'
    )
    fireEvent.keyDown(list, { key: 'Enter' })

    fireEvent.keyDown(list, { key: 'End' })
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'publish-organization-option-22'
    )
    fireEvent.keyDown(list, { key: ' ' })

    fireEvent.keyDown(list, { key: 'Home' })
    fireEvent.keyDown(list, { key: 'Enter' })

    fireEvent.keyDown(list, { key: 'ArrowUp' })
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'publish-organization-option-22'
    )

    assert.deepEqual(view.selected, [alpha, beta, null])
  })

  it('filters through persisted fuzzy, substring, and bounded regex modes', () => {
    const first = picker()
    let formSubmissions = 0
    const rendered = render(
      <form
        onSubmit={event => {
          event.preventDefault()
          formSubmissions++
        }}
      >
        {first.element}
        <button type="submit">Publish</button>
      </form>
    )
    const input = searchBox()

    assert.equal(
      input.getAttribute('data-search-surface-id'),
      'publish-organizations'
    )
    assert.equal(screen.getAllByRole('option').length, 3)

    fireEvent.change(input, { target: { value: 'AlpLab' } })
    assert.deepEqual(
      screen.getAllByRole('option').map(option => option.textContent),
      ['Alpha-Labs']
    )
    assert.ok(
      screen.getByText(
        translate('publish.organization.resultCountOne', 'english')
      )
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Fuzzy (click to change)',
      })
    )
    assert.equal(localStorage.getItem(FilterModeStorageKey), 'substring')
    fireEvent.change(input, { target: { value: '^Alpha' } })
    assert.equal(screen.queryAllByRole('option').length, 0)
    assert.ok(
      screen.getByText(translate('publish.organization.noMatches', 'english'))
    )
    assert.equal(
      fireEvent.keyDown(input, { key: 'Enter' }),
      false,
      'Enter with no matches must not submit the enclosing Publish form'
    )
    assert.equal(formSubmissions, 0)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Substring (click to change)',
      })
    )
    assert.equal(localStorage.getItem(FilterModeStorageKey), 'regex')
    fireEvent.change(input, { target: { value: '^Alpha' } })
    assert.equal(screen.getAllByRole('option').length, 1)
    assert.ok(screen.getByRole('option', { name: 'Alpha-Labs' }))
    input.focus()
    assert.equal(fireEvent.keyDown(input, { key: 'Enter' }), false)
    assert.equal(
      document.activeElement,
      screen.getByRole('listbox'),
      'Enter hands focus to the listbox before it can select an option'
    )
    assert.deepEqual(first.selected, [])

    fireEvent.change(input, { target: { value: '(' } })
    assert.equal(
      screen.getAllByRole('option').length,
      3,
      'an invalid expression must leave every choice reachable'
    )
    const errorPrefix = translate(
      'publish.organization.regexErrorPrefix',
      'english'
    )
    const errorText = screen.getByRole('alert').textContent ?? ''
    assert.ok(errorText.startsWith(errorPrefix))
    assert.ok(errorText.length > errorPrefix.length)
    assert.equal(input.getAttribute('aria-invalid'), 'true')

    rendered.unmount()
    render(picker().element)
    assert.ok(
      screen.getByRole('button', {
        name: 'Filter mode: Regex (click to change)',
      }),
      'the explicitly chosen mode should survive a fresh picker'
    )
  })

  it('clears a populated query with Escape without selecting a row', () => {
    const view = picker()
    render(view.element)
    const input = searchBox() as HTMLInputElement

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Fuzzy (click to change)',
      })
    )
    fireEvent.change(input, { target: { value: 'Beta' } })
    assert.equal(input.value, 'Beta')
    assert.equal(screen.getAllByRole('option').length, 1)

    assert.equal(
      fireEvent.keyDown(input, { key: 'Home' }),
      true,
      'Home must remain available for ordinary text caret movement'
    )
    assert.equal(
      fireEvent.keyDown(input, { key: 'End' }),
      true,
      'End must remain available for ordinary text caret movement'
    )
    fireEvent.keyDown(input, { key: 'Escape' })

    assert.equal(input.value, '')
    assert.equal(screen.getAllByRole('option').length, 3)
    assert.deepEqual(view.selected, [])
  })

  it('renders bilingual visible copy with concise accessible names', () => {
    setLanguageModePreference('bilingual')
    const mode: LanguageMode = 'bilingual'
    render(picker({ languageMode: mode, selectedOrganization: null }).element)

    const expectedLabel = translate('publish.organization.label', mode)
    const expectedPlaceholder = translate(
      'publish.organization.searchPlaceholder',
      mode
    )
    const expectedNone = translate('publish.organization.none', mode)
    const expectedSelected = translate(
      'publish.organization.selectedHint',
      mode
    )
    const expectedCount = translate(
      'publish.organization.resultCountMany',
      mode,
      { count: '3' }
    )

    assert.ok(screen.getByText(expectedLabel))
    assert.equal(
      searchBox(mode).getAttribute('placeholder'),
      expectedPlaceholder
    )
    assert.match(expectedLabel, / · /)
    assert.ok(screen.getByText(expectedNone))
    assert.ok(screen.getByText(expectedSelected))
    assert.ok(screen.getByText(expectedCount))
    assert.ok(
      screen.getByRole('listbox', {
        name: translateForAccessibleName(
          'publish.organization.listAriaLabel',
          {},
          mode
        ),
      })
    )
  })

  it('exposes controlled selection and active-descendant ARIA, and scrolls the selected row', () => {
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView'
    )
    let scrollCalls = 0
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => scrollCalls++,
    })

    try {
      const callback = () => undefined
      const rendered = render(
        <PublishOrganizationPicker
          organizations={organizations}
          selectedOrganization={beta}
          languageMode="english"
          onSelectedOrganizationChanged={callback}
        />
      )
      const root = screen.getByTestId('publish-organization-picker')
      const input = searchBox()
      const list = screen.getByTestId('publish-organization-results')
      const options = within(list).getAllByRole('option')

      assert.equal(root.className, 'publish-organization-picker')
      assert.equal(list.getAttribute('role'), 'listbox')
      assert.equal(list.getAttribute('tabindex'), '0')
      assert.equal(input.getAttribute('aria-controls'), list.id)
      assert.equal(
        input.getAttribute('aria-describedby'),
        'publish-organization-status'
      )
      assert.equal(input.getAttribute('aria-invalid'), 'false')
      assert.equal(
        list.getAttribute('aria-activedescendant'),
        'publish-organization-option-22'
      )
      assert.deepEqual(
        options.map(option => option.getAttribute('aria-selected')),
        ['false', 'false', 'true']
      )
      assert.ok(
        options.every(option => option.getAttribute('tabindex') === '-1'),
        'the listbox, rather than its option buttons, owns keyboard focus'
      )
      assert.equal(scrollCalls, 1)

      rendered.rerender(
        <PublishOrganizationPicker
          organizations={organizations}
          selectedOrganization={alpha}
          languageMode="english"
          onSelectedOrganizationChanged={callback}
        />
      )

      assert.equal(
        list.getAttribute('aria-activedescendant'),
        'publish-organization-option-11'
      )
      assert.equal(
        screen
          .getByTestId('publish-organization-option-11')
          .getAttribute('aria-selected'),
        'true'
      )
      assert.equal(scrollCalls, 2)

      fireEvent.keyDown(list, { key: 'ArrowDown' })
      assert.equal(
        list.getAttribute('aria-activedescendant'),
        'publish-organization-option-22'
      )
      assert.equal(
        scrollCalls,
        3,
        'keyboard navigation should keep the active descendant in view'
      )

      input.focus()
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      assert.equal(
        document.activeElement,
        list,
        'searchbox arrow navigation hands focus to the active-descendant owner'
      )
      assert.equal(
        list.getAttribute('aria-activedescendant'),
        'publish-organization-option-11'
      )
    } finally {
      if (previousScrollIntoView === undefined) {
        delete (
          HTMLElement.prototype as {
            scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView
          }
        ).scrollIntoView
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollIntoView',
          previousScrollIntoView
        )
      }
    }
  })
})
