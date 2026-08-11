import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { englishTranslations } from '../../src/lib/i18n-resources'
import {
  Md3MenuOverlay,
  filterMenuItems,
} from '../../src/ui/md3/md3-menu-overlay'
import {
  IMd3MenuHandlers,
  IMd3MenuItem,
  IMd3MenuSpec,
  MenuKind,
  MenuKinds,
  defaultMd3MenuContext,
  getMenuSpec,
} from '../../src/ui/md3/md3-menu-specs'
import { fireEvent, render, screen, within } from '../helpers/ui/render'

/**
 * The filterable menu overlay, rendered.
 *
 * The contract gives every menu the same filter row, the same keyboard model
 * and the same two-step Escape. None of that is visible in a screenshot and
 * none of it is provable from the pure filter function alone, so the assertions
 * here drive the real component with real specs built from the real registry.
 */

const noop = () => undefined

// jsdom implements no layout, so it ships no `scrollIntoView`. The overlay
// calls it whenever the arrow keys move focus, which is real browser behaviour
// worth keeping; stubbing the missing method here is the environment gap, not
// the component's.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom, so there is nothing to scroll */
  }
}

function handlers(overrides: Partial<IMd3MenuHandlers> = {}): IMd3MenuHandlers {
  return {
    onCommand: noop,
    onNavigate: noop,
    onToggle: noop,
    onSwitchRepository: noop,
    onSwitchBranch: noop,
    onSwitchAccount: noop,
    onOpenMenu: noop,
    onOpenRegexBuilder: noop,
    ...overrides,
  }
}

function specFor(kind: MenuKind, extra?: Partial<IMd3MenuHandlers>) {
  return getMenuSpec(kind, defaultMd3MenuContext, handlers(extra))
}

interface IOverlayOverrides {
  readonly spec?: IMd3MenuSpec
  readonly onDismiss?: () => void
  readonly onOpenRegexBuilder?: (pattern: string) => void
  readonly initialFilter?: string
  readonly initialRegexEnabled?: boolean
}

function renderOverlay(overrides: IOverlayOverrides = {}) {
  const spec = overrides.spec ?? specFor('paneMenu')
  return {
    spec,
    ...render(
      <Md3MenuOverlay
        spec={spec}
        initialFilter={overrides.initialFilter}
        initialRegexEnabled={overrides.initialRegexEnabled}
        onDismiss={overrides.onDismiss ?? noop}
        onOpenRegexBuilder={overrides.onOpenRegexBuilder ?? noop}
      />
    ),
  }
}

function itemLabels(): ReadonlyArray<string> {
  return screen
    .getAllByRole('menuitem')
    .map(item =>
      (
        item.querySelector('.md3-menu-overlay__item-label')?.textContent ?? ''
      ).trim()
    )
}

function filterField(spec: IMd3MenuSpec): HTMLInputElement {
  return screen.getByRole('searchbox', {
    name: spec.filterPlaceholder,
  }) as HTMLInputElement
}

describe('md3 menu overlay — every kind opens', () => {
  it('checks all twenty-three kinds, not merely the ones still present', () => {
    // Iterating `MenuKinds` alone would shrink silently if a kind were
    // deleted from it, so the count is asserted too.
    assert.equal(MenuKinds.length, 23)
  })

  for (const kind of MenuKinds) {
    it(`opens ${kind} with its title, filter and every item`, () => {
      const { spec, unmount } = renderOverlay({ spec: specFor(kind) })

      const dialog = screen.getByRole('dialog', { name: spec.title })
      assert.ok(dialog instanceof HTMLElement)

      // The contract gives every menu a filter row; a menu that quietly lost
      // its own is the exact regression this loop exists to catch.
      assert.equal(spec.hasFilter, true, `${kind} must carry a filter row`)
      assert.ok(filterField(spec) instanceof HTMLInputElement)

      const menu = within(dialog).getByRole('menu')
      assert.equal(
        within(menu).getAllByRole('menuitem').length,
        spec.items.length,
        `${kind} must render every item its spec declares`
      )

      unmount()
    })
  }
})

describe('md3 menu overlay — filtering', () => {
  it('filters by a case-insensitive substring by default', () => {
    const spec = specFor('paneMenu')
    renderOverlay({ spec })

    const needle = spec.items[0].label.slice(0, 4).toUpperCase()
    fireEvent.change(filterField(spec), { target: { value: needle } })

    const shown = itemLabels()
    assert.ok(shown.length > 0)
    assert.ok(shown.length < spec.items.length, 'the filter must narrow')
    for (const label of shown) {
      assert.ok(
        label.toLowerCase().includes(needle.toLowerCase()),
        `"${label}" does not contain "${needle}"`
      )
    }
  })

  it('filters by a regular expression once regex mode is on', () => {
    const items: ReadonlyArray<IMd3MenuItem> = [
      { id: 'a', label: 'Fetch origin', icon: 'sync', hint: '', onClick: noop },
      { id: 'b', label: 'Force push', icon: 'bolt', hint: '', onClick: noop },
      {
        id: 'c',
        label: 'Pull request',
        icon: 'merge',
        hint: '',
        onClick: noop,
      },
    ]
    const spec: IMd3MenuSpec = { ...specFor('paneMenu'), items }
    renderOverlay({ spec })

    const regex = screen.getByRole('button', {
      name: `Regex mode for ${spec.title}`,
    })
    fireEvent.click(regex)
    assert.equal(regex.getAttribute('aria-pressed'), 'true')

    fireEvent.change(filterField(spec), { target: { value: '^(fetch|force)' } })
    assert.deepStrictEqual(itemLabels(), ['Fetch origin', 'Force push'])
  })

  it('keeps the list whole and says why when the pattern will not compile', () => {
    const spec = specFor('paneMenu')
    renderOverlay({ spec, initialRegexEnabled: true })

    // `(foo` is what a half-typed group looks like. Emptying the menu at that
    // moment would make composing a pattern in place impossible.
    assert.doesNotThrow(() =>
      fireEvent.change(filterField(spec), { target: { value: '(foo' } })
    )

    assert.equal(itemLabels().length, spec.items.length)
    assert.equal(filterField(spec).getAttribute('aria-invalid'), 'true')
    assert.ok(
      screen.getByText(
        englishTranslations['md3.menuOverlay.invalidPattern']
      ) instanceof HTMLElement
    )
  })

  it('reports an honest no-match rather than a blank surface', () => {
    const spec = specFor('paneMenu')
    renderOverlay({ spec })

    fireEvent.change(filterField(spec), {
      target: { value: 'zzz-nothing-matches-this' },
    })

    assert.equal(screen.queryAllByRole('menuitem').length, 0)
    assert.ok(
      screen.getByText(
        englishTranslations['md3.menuOverlay.noMatches'].replace(
          '{title}',
          spec.title
        )
      ) instanceof HTMLElement
    )

    // And the empty state's own control puts the list back.
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.menuOverlay.clearFilter'],
      })
    )
    assert.equal(screen.getAllByRole('menuitem').length, spec.items.length)
  })

  it('agrees with the pure filter it is built on', () => {
    const spec = specFor('paneMenu')
    const needle = spec.items[1].label.slice(0, 3)
    renderOverlay({ spec })
    fireEvent.change(filterField(spec), { target: { value: needle } })

    assert.deepStrictEqual(
      itemLabels(),
      filterMenuItems(spec.items, needle, false).items.map(item => item.label)
    )
  })

  it('opens the builder seeded with what is already typed', () => {
    const spec = specFor('paneMenu')
    const seen: Array<string> = []
    renderOverlay({ spec, onOpenRegexBuilder: pattern => seen.push(pattern) })

    fireEvent.change(filterField(spec), { target: { value: 'fetc' } })
    fireEvent.click(
      screen.getByRole('button', { name: `Regex builder for ${spec.title}` })
    )

    assert.deepStrictEqual(seen, ['fetc'])
  })

  it('honours a seeded filter and a seeded regex mode', () => {
    const items: ReadonlyArray<IMd3MenuItem> = [
      { id: 'a', label: 'Fetch origin', icon: 'sync', hint: '', onClick: noop },
      {
        id: 'b',
        label: 'Discard all',
        icon: 'delete',
        hint: '',
        onClick: noop,
      },
    ]
    const spec: IMd3MenuSpec = { ...specFor('paneMenu'), items }
    renderOverlay({ spec, initialFilter: '^fetch', initialRegexEnabled: true })

    assert.equal(filterField(spec).value, '^fetch')
    assert.equal(
      screen
        .getByRole('button', { name: `Regex mode for ${spec.title}` })
        .getAttribute('aria-pressed'),
      'true'
    )
    assert.deepStrictEqual(itemLabels(), ['Fetch origin'])
  })
})

describe('md3 menu overlay — keyboard', () => {
  it('takes focus into the filter when it opens', () => {
    const spec = specFor('paneMenu')
    renderOverlay({ spec })
    assert.equal(document.activeElement, filterField(spec))
  })

  it('walks the items with the arrow keys, Home and End', () => {
    const spec = specFor('paneMenu')
    const { container } = renderOverlay({ spec })
    const panel = container.querySelector('.md3-menu-overlay__panel')
    assert.ok(panel !== null)

    const items = screen.getAllByRole('menuitem')

    fireEvent.keyDown(panel as Element, { key: 'ArrowDown' })
    assert.equal(document.activeElement, items[0])

    fireEvent.keyDown(panel as Element, { key: 'ArrowDown' })
    assert.equal(document.activeElement, items[1])

    fireEvent.keyDown(panel as Element, { key: 'ArrowUp' })
    assert.equal(document.activeElement, items[0])

    fireEvent.keyDown(panel as Element, { key: 'End' })
    assert.equal(document.activeElement, items[items.length - 1])

    fireEvent.keyDown(panel as Element, { key: 'Home' })
    assert.equal(document.activeElement, items[0])

    // And the walk wraps rather than dead-ending on the last row.
    fireEvent.keyDown(panel as Element, { key: 'ArrowUp' })
    assert.equal(document.activeElement, items[items.length - 1])
  })

  it('runs the first surviving item on Enter from the filter', () => {
    let ran: string | null = null
    const items: ReadonlyArray<IMd3MenuItem> = [
      {
        id: 'a',
        label: 'Fetch origin',
        icon: 'sync',
        hint: '',
        onClick: () => (ran = 'a'),
      },
      {
        id: 'b',
        label: 'Force push',
        icon: 'bolt',
        hint: '',
        onClick: () => (ran = 'b'),
      },
    ]
    const spec: IMd3MenuSpec = { ...specFor('paneMenu'), items }
    renderOverlay({ spec })

    fireEvent.change(filterField(spec), { target: { value: 'force' } })
    // Fired at the field itself and left to bubble to the panel's listener,
    // which is what a real keystroke does. Firing at the panel would make the
    // handler's "only from the filter" guard untestable.
    fireEvent.keyDown(filterField(spec), { key: 'Enter' })

    assert.equal(ran, 'b')
  })

  it('clears the filter on the first Escape and closes on the second', () => {
    let dismissals = 0
    const spec = specFor('paneMenu')
    const { container } = renderOverlay({
      spec,
      onDismiss: () => dismissals++,
    })
    const panel = container.querySelector('.md3-menu-overlay__panel')

    fireEvent.change(filterField(spec), { target: { value: 'fetch' } })

    fireEvent.keyDown(panel as Element, { key: 'Escape' })
    assert.equal(filterField(spec).value, '')
    assert.equal(
      dismissals,
      0,
      'the first Escape clears; closing as well would throw away a query the ' +
        'user was still editing'
    )
    assert.equal(document.activeElement, filterField(spec))

    fireEvent.keyDown(panel as Element, { key: 'Escape' })
    assert.equal(dismissals, 1)
  })

  it('closes on the first Escape when there is nothing to clear', () => {
    let dismissals = 0
    const { container } = renderOverlay({ onDismiss: () => dismissals++ })
    const panel = container.querySelector('.md3-menu-overlay__panel')

    fireEvent.keyDown(panel as Element, { key: 'Escape' })
    assert.equal(dismissals, 1)
  })

  it('keeps Tab inside the panel', () => {
    const spec = specFor('paneMenu')
    const { container } = renderOverlay({ spec })
    const panel = container.querySelector<HTMLElement>(
      '.md3-menu-overlay__panel'
    )
    assert.ok(panel !== null)

    const focusable = Array.from(
      (panel as HTMLElement).querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)'
      )
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    first.focus()
    fireEvent.keyDown(panel as Element, { key: 'Tab', shiftKey: true })
    assert.equal(document.activeElement, last)

    last.focus()
    fireEvent.keyDown(panel as Element, { key: 'Tab' })
    assert.equal(document.activeElement, first)
  })

  it('goes on filtering when a printable key lands on an item', () => {
    const spec = specFor('paneMenu')
    const { container } = renderOverlay({ spec })
    const panel = container.querySelector('.md3-menu-overlay__panel')

    fireEvent.keyDown(panel as Element, { key: 'ArrowDown' })
    const item = screen.getAllByRole('menuitem')[0]
    fireEvent.keyDown(item, { key: 'f' })

    assert.equal(filterField(spec).value, 'f')
    assert.equal(document.activeElement, filterField(spec))
  })
})

describe('md3 menu overlay — focus return', () => {
  it('returns focus to whatever opened it', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open pane menu'
    document.body.appendChild(opener)
    opener.focus()

    const view = renderOverlay()
    assert.notEqual(document.activeElement, opener)

    view.unmount()
    assert.equal(
      document.activeElement,
      opener,
      'a keyboard user who closes a menu must land back on the control that ' +
        'opened it, not on the top of the document'
    )
    opener.remove()
  })

  it('does not chase a control that left the document', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const view = renderOverlay()
    opener.remove()

    assert.doesNotThrow(() => view.unmount())
  })
})

describe('md3 menu overlay — dismissal by pointer', () => {
  it('closes from the scrim and from the close button', () => {
    let dismissals = 0
    const { container } = renderOverlay({ onDismiss: () => dismissals++ })

    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.menuOverlay.close'],
      })
    )
    assert.equal(dismissals, 1)

    const scrim = container.querySelector('.md3-menu-overlay')
    assert.ok(scrim !== null)
    fireEvent.mouseDown(scrim as Element)
    assert.equal(dismissals, 2)
  })

  it('does not close when the press started inside the panel', () => {
    let dismissals = 0
    const { container } = renderOverlay({ onDismiss: () => dismissals++ })
    const panel = container.querySelector('.md3-menu-overlay__panel')

    fireEvent.mouseDown(panel as Element)
    assert.equal(dismissals, 0)
  })

  it('runs the item that was clicked', () => {
    const ran: Array<string> = []
    const items: ReadonlyArray<IMd3MenuItem> = [
      {
        id: 'a',
        label: 'Fetch origin',
        icon: 'sync',
        hint: '',
        onClick: () => ran.push('a'),
      },
      {
        id: 'b',
        label: 'Force push',
        icon: 'bolt',
        hint: '',
        onClick: () => ran.push('b'),
      },
    ]
    renderOverlay({ spec: { ...specFor('paneMenu'), items } })

    fireEvent.click(screen.getByRole('menuitem', { name: /Force push/ }))
    assert.deepStrictEqual(ran, ['b'])
  })
})
