import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { SearchableSelect } from '../../src/ui/lib/searchable-select'
import { fireEvent, render, within } from '../helpers/ui/render'

const options = [
  { value: 'ci.yml', label: 'CI (ci.yml)' },
  { value: 'pages.yml', label: 'Deploy Pages (pages.yml)' },
  { value: 'codeql.yml', label: 'Code scanning (codeql.yml)' },
]

function renderSelect(overrides: Record<string, unknown> = {}) {
  return render(
    <SearchableSelect
      label="Workflow"
      value="ci.yml"
      options={options}
      onChange={() => undefined}
      searchSurfaceId="test-workflow"
      regexBuilderTarget="workflows"
      {...(overrides as any)}
    />
  )
}

describe('SearchableSelect', () => {
  it('stays collapsed until asked, showing the current selection', () => {
    const view = renderSelect()
    const button = view.getByRole('combobox', { name: 'Workflow' })

    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.match(button.textContent ?? '', /CI \(ci\.yml\)/)
    assert.equal(view.queryByRole('listbox'), null)
  })

  it('opens a real listbox with a search field, not a bare menu', () => {
    const view = renderSelect()
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))

    const listbox = view.getByRole('listbox')
    assert.equal(within(listbox).getAllByRole('option').length, 3)
    // The search field is the whole point: a native select cannot be searched.
    assert.ok(view.getByLabelText('Search workflows'))
  })

  it('filters the options as the user types', () => {
    const view = renderSelect()
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    fireEvent.change(view.getByLabelText('Search workflows'), {
      target: { value: 'pages' },
    })

    const shown = within(view.getByRole('listbox')).getAllByRole('option')
    assert.equal(shown.length, 1)
    assert.match(shown[0].textContent ?? '', /Deploy Pages/)
  })

  it('says so plainly when nothing matches', () => {
    const view = renderSelect()
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    fireEvent.change(view.getByLabelText('Search workflows'), {
      target: { value: 'nothing-here' },
    })

    assert.equal(
      within(view.getByRole('listbox')).queryAllByRole('option').length,
      0
    )
    assert.ok(view.getByText('No match'))
  })

  it('reports the chosen value and closes', () => {
    const chosen: Array<string> = []
    const view = renderSelect({ onChange: (v: string) => chosen.push(v) })
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    fireEvent.click(view.getByRole('option', { name: /Deploy Pages/ }))

    assert.deepEqual(chosen, ['pages.yml'])
    assert.equal(view.queryByRole('listbox'), null)
  })

  it('is operable from the keyboard and returns focus on Escape', () => {
    const chosen: Array<string> = []
    const view = renderSelect({ onChange: (v: string) => chosen.push(v) })
    const button = view.getByRole('combobox', { name: 'Workflow' })

    fireEvent.keyDown(button, { key: 'ArrowDown' })
    const search = view.getByLabelText('Search workflows')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    assert.deepEqual(chosen, ['pages.yml'])

    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(view.getByLabelText('Search workflows'), {
      key: 'Escape',
    })
    // A popover that drops focus leaves a keyboard user at the top of the page.
    assert.equal(document.activeElement, button)
  })

  it('gives each field its own search surface', () => {
    const view = renderSelect({ searchSurfaceId: 'actions-local-run-job' })
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))

    const search = view.getByLabelText('Search workflows')
    assert.equal(
      search.getAttribute('data-search-surface-id'),
      'actions-local-run-job',
      'a pattern built here must not apply to another dropdown'
    )
  })

  it('uses caller-localized search and empty-result copy', () => {
    const view = renderSelect({
      searchPlaceholder: '搵演算法',
      emptyMessage: '冇相符項目',
    })
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    const search = view.getByLabelText('搵演算法')

    fireEvent.change(search, { target: { value: 'missing' } })

    assert.ok(view.getByText('冇相符項目'))
  })

  it('links keyboard focus to the active option by exact id', () => {
    const view = renderSelect()
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    const search = view.getByLabelText('Search workflows')
    const initialId = search.getAttribute('aria-activedescendant')

    assert.ok(initialId !== null)
    assert.equal(
      document.getElementById(initialId)?.getAttribute('role'),
      'option'
    )
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    assert.notEqual(search.getAttribute('aria-activedescendant'), initialId)
  })

  it('connects supporting and validation copy without an empty error state', () => {
    const view = renderSelect({ supportingText: 'Choose one workflow' })
    const button = view.getByRole('combobox', { name: 'Workflow' })
    const support = view.getByText('Choose one workflow')

    assert.equal(button.getAttribute('aria-describedby'), support.id)
    assert.equal(button.getAttribute('aria-invalid'), null)

    view.rerender(
      <SearchableSelect
        label="Workflow"
        value="ci.yml"
        options={options}
        onChange={() => undefined}
        searchSurfaceId="test-workflow"
        regexBuilderTarget="workflows"
        error=""
      />
    )
    assert.equal(
      view
        .getByRole('combobox', { name: 'Workflow' })
        .getAttribute('aria-invalid'),
      null
    )
    assert.equal(view.queryByRole('status'), null)
  })

  it('reports an invalid regex politely while keeping every option', () => {
    const view = renderSelect()
    fireEvent.click(view.getByRole('combobox', { name: 'Workflow' }))
    const search = view.getByLabelText('Search workflows')
    const mode = view.container.querySelector<HTMLButtonElement>(
      '.filter-mode-button'
    )
    assert.ok(mode !== null)

    // Substring is the default; one cycle selects Regex.
    fireEvent.click(mode)
    fireEvent.change(search, { target: { value: '(' } })

    assert.equal(search.getAttribute('aria-invalid'), 'true')
    assert.equal(
      within(view.getByRole('listbox')).getAllByRole('option').length,
      3
    )
    assert.ok(view.getByRole('status').textContent?.includes('('))
  })

  it('dismisses on an outside interaction but not inside its regex-builder portal', () => {
    const view = renderSelect()
    const button = view.getByRole('combobox', { name: 'Workflow' })
    fireEvent.click(button)

    const portal = document.createElement('div')
    portal.id = 'regex-builder-layer'
    document.body.appendChild(portal)
    try {
      fireEvent.mouseDown(portal)
      assert.ok(view.getByRole('listbox'))

      fireEvent.mouseDown(document.body)
      assert.equal(view.queryByRole('listbox'), null)
    } finally {
      portal.remove()
    }
  })
})
