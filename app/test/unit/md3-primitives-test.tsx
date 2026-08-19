import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  Md3Disclosure,
  Md3Field,
  Md3FileAction,
  Md3GhostButton,
  Md3IconButton,
  Md3SearchableSelect,
  Md3TextArea,
  Md3TextField,
  Md3TonalButton,
} from '../../src/ui/md3/md3-primitives'
import { RippleClassName } from '../../src/ui/lib/ripple'
import { fireEvent, render, within } from '../helpers/ui/render'

const rippleSelector = `.${RippleClassName}`

function stubRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      width: 80,
      height: 40,
      left: 10,
      top: 20,
      right: 90,
      bottom: 60,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect)
}

afterEach(() => {
  document.body.removeAttribute('data-dm-motion')
})

describe('Material Design 3 primitive controls', () => {
  it('reserves search and file input types for their dedicated primitives', () => {
    const props: React.ComponentProps<typeof Md3TextField> = {
      id: 'not-a-search',
      label: 'Not a search',
      // @ts-expect-error Search fields require Md3SearchField and its builder.
      type: 'search',
    }
    assert.equal(props.type, 'search')
  })

  it('gives each button family the shared ripple and disabled boundary', () => {
    let composedMouseDown = 0
    const view = render(
      <>
        <Md3IconButton icon="close" label="Close" tooltip={null} />
        <Md3TonalButton
          label="Save"
          onMouseDown={() => {
            composedMouseDown += 1
          }}
        />
        <Md3GhostButton label="Cancel" />
        <Md3TonalButton label="Unavailable" disabled={true} />
      </>
    )

    for (const name of ['Close', 'Save', 'Cancel']) {
      const button = view.getByRole('button', { name })
      stubRect(button)
      fireEvent.mouseDown(button, { clientX: 30, clientY: 40 })
      assert.ok(
        button.querySelector(rippleSelector) !== null,
        `${name} must use the shared state layer`
      )
    }
    assert.equal(composedMouseDown, 1)

    const disabled = view.getByRole('button', { name: 'Unavailable' })
    stubRect(disabled)
    fireEvent.mouseDown(disabled, { clientX: 30, clientY: 40 })
    assert.equal(disabled.querySelector(rippleSelector), null)
  })

  it('suppresses every primitive ripple under reduced motion', () => {
    document.body.setAttribute('data-dm-motion', 'reduced')
    const view = render(<Md3TonalButton label="Save" />)
    const button = view.getByRole('button', { name: 'Save' })
    stubRect(button)

    fireEvent.mouseDown(button, { clientX: 30, clientY: 40 })

    assert.equal(button.querySelector(rippleSelector), null)
  })

  it('connects text-field labels, supporting copy and validation semantics', () => {
    const view = render(
      <>
        <span id="caller-note">Managed by your provider</span>
        <Md3TextField
          id="account-name"
          label="Account name"
          value="Octocat"
          supportingText="Shown to collaborators"
          required={true}
          aria-describedby="caller-note"
          onChange={() => undefined}
        />
      </>
    )
    const field =
      view.container.querySelector<HTMLInputElement>('#account-name')
    assert.ok(field !== null)

    assert.equal(field.getAttribute('value'), 'Octocat')
    assert.equal(field.hasAttribute('required'), true)
    assert.equal(field.getAttribute('aria-invalid'), null)
    const support = view.getByText('Shown to collaborators')
    assert.equal(
      field.getAttribute('aria-describedby'),
      `caller-note ${support.id}`
    )

    view.rerender(
      <Md3TextField
        id="account-name"
        label="Account name"
        value=""
        error="Enter an account name"
        onChange={() => undefined}
      />
    )
    assert.equal(
      view.container
        .querySelector<HTMLInputElement>('#account-name')
        ?.getAttribute('aria-invalid'),
      'true'
    )
    assert.ok(view.getByRole('status'))
  })

  it('keeps textarea behavior native inside the shared field anatomy', () => {
    const view = render(
      <Md3TextArea
        id="description"
        label="Description"
        rows={4}
        value="A useful explanation"
        onChange={() => undefined}
      />
    )
    const textArea =
      view.container.querySelector<HTMLTextAreaElement>('#description')

    assert.ok(textArea !== null)
    assert.equal(textArea.tagName, 'TEXTAREA')
    assert.equal(textArea.getAttribute('rows'), '4')
    assert.equal(
      (textArea as HTMLTextAreaElement).value,
      'A useful explanation'
    )
  })

  it('preserves caller validation semantics in the visible field state', () => {
    const view = render(
      <Md3TextField
        id="repository-url"
        label="Repository URL"
        aria-invalid="spelling"
      />
    )
    const input =
      view.container.querySelector<HTMLInputElement>('#repository-url')

    assert.ok(input !== null)
    assert.equal(input.getAttribute('aria-invalid'), 'spelling')
    assert.equal(
      input.closest('.md3-field')?.getAttribute('data-invalid'),
      'true'
    )
  })

  it('offers a composition point for the existing rich color control', () => {
    const view = render(
      <Md3Field
        id="accent-color"
        label="Accent color"
        supportingText="Uses the existing infinite picker"
      >
        <button
          id="accent-color"
          type="button"
          aria-label="Accent color: Open color picker"
        >
          Open color picker
        </button>
      </Md3Field>
    )
    const picker = view.getByRole('button', {
      name: 'Accent color: Open color picker',
    })

    assert.equal(picker.id, 'accent-color')
    assert.equal(
      view
        .getByRole('group', { name: 'Accent color' })
        .getAttribute('aria-describedby'),
      view.getByText('Uses the existing infinite picker').id
    )
  })

  it('composes the existing per-field regex builder searchable listbox', () => {
    const chosen: Array<string> = []
    const view = render(
      <Md3SearchableSelect
        label="Algorithm"
        value="sha1"
        options={[
          { value: 'sha1', label: 'SHA-1' },
          { value: 'sha256', label: 'SHA-256' },
        ]}
        onChange={value => chosen.push(value)}
        searchSurfaceId="authenticator-algorithms"
        regexBuilderTarget="algorithms"
        searchPlaceholder="Search algorithms"
        emptyMessage="No algorithm matches"
      />
    )
    const control = view.getByRole('combobox', { name: 'Algorithm' })

    assert.equal(view.container.querySelector('select'), null)
    stubRect(control)
    fireEvent.mouseDown(control, { clientX: 30, clientY: 40 })
    assert.ok(control.querySelector(rippleSelector) !== null)
    fireEvent.click(control)
    const search = view.getByLabelText('Search algorithms')
    assert.equal(
      search.getAttribute('data-search-surface-id'),
      'authenticator-algorithms'
    )
    fireEvent.change(search, { target: { value: '256' } })
    const options = within(view.getByRole('listbox')).getAllByRole('option')
    assert.equal(options.length, 1)
    stubRect(options[0])
    fireEvent.mouseDown(options[0], { clientX: 30, clientY: 40 })
    assert.ok(options[0].querySelector(rippleSelector) !== null)
    fireEvent.click(options[0])
    assert.deepEqual(chosen, ['sha256'])
  })

  it('renders a native disclosure with Material summary anatomy', () => {
    const view = render(
      <Md3Disclosure summary="What this file looks like" defaultOpen={true}>
        <code>{'{ "schemaVersion": 1 }'}</code>
      </Md3Disclosure>
    )
    const details = view.container.querySelector('details')

    assert.ok(details !== null)
    assert.equal(details.open, true)
    assert.ok(view.getByText('What this file looks like'))
    assert.ok(view.getByText('{ "schemaVersion": 1 }'))
  })

  it('hides native file chrome behind a real Material action', () => {
    const selected: Array<string> = []
    const view = render(
      <Md3FileAction
        label="Choose vocabulary file"
        accept="application/json"
        onChange={event => selected.push(event.currentTarget.accept)}
      />
    )
    const input =
      view.container.querySelector<HTMLInputElement>('input[type="file"]')
    assert.ok(input !== null)
    assert.equal(input.classList.contains('md3-file-action__input'), true)
    assert.equal(input.getAttribute('aria-hidden'), 'true')
    assert.equal(input.tabIndex, -1)

    let nativeClicks = 0
    input.click = () => {
      nativeClicks += 1
    }
    Object.defineProperty(input, 'value', {
      configurable: true,
      writable: true,
      value: 'already-selected',
    })
    fireEvent.click(
      view.getByRole('button', { name: 'Choose vocabulary file' })
    )
    assert.equal(nativeClicks, 1)
    assert.equal(input.value, '')

    fireEvent.change(input, { target: { files: [] } })
    assert.deepEqual(selected, ['application/json'])

    view.rerender(
      <Md3FileAction
        label="Choose vocabulary file"
        disabled={true}
        onChange={() => undefined}
      />
    )
    const disabledInput =
      view.container.querySelector<HTMLInputElement>('input[type="file"]')
    assert.ok(disabledInput !== null)
    let disabledClicks = 0
    disabledInput.click = () => {
      disabledClicks += 1
    }
    fireEvent.click(
      view.getByRole('button', { name: 'Choose vocabulary file' })
    )
    assert.equal(disabledClicks, 0)
  })

  it('loads the primitive extension as the final specialized control sublayer', () => {
    const desktop = readFileSync(
      join(process.cwd(), 'app/styles/desktop.scss'),
      'utf8'
    )
    const controls = readFileSync(
      join(process.cwd(), 'app/styles/_material-controls.scss'),
      'utf8'
    )
    const style = readFileSync(
      join(process.cwd(), 'app/styles/ui/_md3-primitives.scss'),
      'utf8'
    )

    assert.match(desktop, /@import 'material-controls';\s*$/)
    assert.match(
      controls,
      /@import 'ui\/md3-primitives';\s*$/,
      'The exact primitive anatomy must load after generic native controls'
    )
    assert.match(
      style,
      /\.md3-field__container\s*\{[\s\S]*?border: 2px solid var\(--md-sys-color-outline-variant\);[\s\S]*?border-radius: 14px;[\s\S]*?min-height: 48px;/
    )
    assert.match(
      style,
      /\.md3-search-row input\.md3-search-row__input\s*\{[\s\S]*?background: transparent;[\s\S]*?border: 0;/
    )
    for (const selector of [
      '.md3-field__container',
      '.md3-searchable-select',
      '.md3-disclosure__summary',
      '.md3-file-action__input',
    ]) {
      assert.match(style, new RegExp(selector.replace('.', '\\.'), 'm'))
    }
  })
})
