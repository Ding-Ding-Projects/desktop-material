import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { DiffSearchInput } from '../../../src/ui/diff/diff-search-input'
import { FilterMode, IFilterOptions } from '../../../src/lib/fuzzy-find'
import { fireEvent, render, screen } from '../../helpers/ui/render'

interface ISearchCall {
  readonly query: string
  readonly direction: 'next' | 'previous'
  readonly options: IFilterOptions
}

function renderInput() {
  const searches = new Array<ISearchCall>()
  let closes = 0
  render(
    <DiffSearchInput
      onSearch={(query, direction, options) =>
        searches.push({ query, direction, options })
      }
      onClose={() => closes++}
      getSampleItems={() => ['const value = 1', 'let other = 2']}
    />
  )
  return { searches, getCloses: () => closes }
}

describe('DiffSearchInput', () => {
  beforeEach(() => {
    localStorage.removeItem('filter-mode/diff-search')
  })

  it('searches on Enter with the default fuzzy options', () => {
    const { searches } = renderInput()
    const input = screen.getByRole('textbox', { name: 'Search within diff' })
    fireEvent.change(input, { target: { value: 'needle' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    assert.deepStrictEqual(searches, [
      {
        query: 'needle',
        direction: 'next',
        options: { mode: FilterMode.Fuzzy, caseSensitive: false },
      },
    ])
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    assert.equal(searches[1].direction, 'previous')
  })

  it('re-runs the active search when the mode or case toggles change', () => {
    const { searches } = renderInput()
    const input = screen.getByRole('textbox', { name: 'Search within diff' })
    fireEvent.change(input, { target: { value: 'needle' } })

    fireEvent.click(screen.getByRole('button', { name: /^Filter mode/ }))
    assert.equal(searches.length, 1)
    assert.equal(searches[0].options.mode, FilterMode.Substring)

    fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
    assert.equal(searches.length, 2)
    assert.deepStrictEqual(searches[1].options, {
      mode: FilterMode.Substring,
      caseSensitive: true,
    })
  })

  it('applies a regex-builder pattern as a single regex-mode search', () => {
    const { searches, getCloses } = renderInput()
    const launcher = screen.getByRole('button', {
      name: 'Open regex builder',
    })

    // Mirror the browser's real pointer-focus sequence. The builder lives in a
    // body portal, so focusing its input must not make the owning diff search
    // interpret that blur as leaving the control and unmount the builder.
    launcher.focus()
    fireEvent.click(launcher)
    const pattern = screen.getByLabelText('Regular expression pattern')
    assert.equal(
      screen
        .getByRole('button', { name: /ignore case/ })
        .getAttribute('aria-pressed'),
      'true'
    )
    assert.equal(document.activeElement, pattern)
    assert.equal(getCloses(), 0)
    fireEvent.change(pattern, { target: { value: 'a+b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Diff' }))
    assert.equal(getCloses(), 0)
    assert.deepStrictEqual(searches, [
      {
        query: 'a+b',
        direction: 'next',
        options: { mode: FilterMode.Regex, caseSensitive: false },
      },
    ])
  })

  it('synchronizes builder ignore-case changes back to the search surface', () => {
    const { searches } = renderInput()
    const mode = screen.getByRole('button', { name: /^Filter mode/ })
    fireEvent.click(mode)
    fireEvent.click(mode)
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open regex builder' }))

    const ignoreCase = screen.getByRole('button', { name: /ignore case/ })
    assert.equal(ignoreCase.getAttribute('aria-pressed'), 'false')
    fireEvent.click(ignoreCase)
    fireEvent.change(screen.getByLabelText('Regular expression pattern'), {
      target: { value: '^needle$' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Diff' }))

    assert.deepStrictEqual(searches, [
      {
        query: '^needle$',
        direction: 'next',
        options: { mode: FilterMode.Regex, caseSensitive: false },
      },
    ])
    assert.equal(
      screen
        .getByRole('button', { name: 'Match case' })
        .getAttribute('aria-pressed'),
      'false'
    )
  })

  it('delegates an invalid Enter after a valid result so the diff can clear it', () => {
    const { searches } = renderInput()
    const mode = screen.getByRole('button', { name: /^Filter mode/ })
    fireEvent.click(mode)
    fireEvent.click(mode)
    const input = screen.getByRole('textbox', { name: 'Search within diff' })

    fireEvent.change(input, { target: { value: 'needle' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'needle(?=ahead)' } })

    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.match(screen.getByRole('alert').textContent ?? '', /RE2/)
    fireEvent.keyDown(input, { key: 'Enter' })
    assert.deepStrictEqual(
      searches.map(({ query, options }) => ({ query, mode: options.mode })),
      [
        { query: 'needle', mode: FilterMode.Regex },
        { query: 'needle(?=ahead)', mode: FilterMode.Regex },
      ]
    )
  })

  it('delegates a literal-to-invalid-regex mode transition', () => {
    localStorage.setItem('filter-mode/diff-search', FilterMode.Substring)
    const { searches } = renderInput()
    const input = screen.getByRole('textbox', { name: 'Search within diff' })

    fireEvent.change(input, { target: { value: '(' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: /^Filter mode/ }))

    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.deepStrictEqual(
      searches.map(({ query, options }) => ({ query, mode: options.mode })),
      [
        { query: '(', mode: FilterMode.Substring },
        { query: '(', mode: FilterMode.Regex },
      ]
    )
  })

  it('closes on Escape but not when focus moves inside the control', () => {
    const view = renderInput()
    const input = screen.getByRole('textbox', { name: 'Search within diff' })
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: 'Match case' }),
    })
    assert.equal(view.getCloses(), 0)
    fireEvent.keyDown(input, { key: 'Escape' })
    assert.equal(view.getCloses(), 1)
  })
})
