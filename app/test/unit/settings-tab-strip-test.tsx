import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import * as React from 'react'

import { SettingsTabStrip } from '../../src/ui/settings-tabs/settings-tab-strip'
import {
  getPinnedSettingsTabs,
  orderSettingsTabs,
  pinSettingsTab,
  toggleSettingsTabPin,
  unpinSettingsTab,
} from '../../src/ui/settings-tabs/settings-tab-model'
import { fireEvent, render } from '../helpers/ui/render'

const PAGES = [
  { id: 'remote', label: 'Remote', searchText: 'Remote' },
  { id: 'ignored', label: 'Ignored files', searchText: 'Ignored files' },
  { id: 'sound', label: 'Sound', searchText: 'Sound' },
]

function renderStrip(overrides: Record<string, unknown> = {}) {
  const selected: Array<string> = []
  const view = render(
    <SettingsTabStrip
      {...({
        strip: 'preferences',
        title: 'settings',
        items: PAGES,
        selectedId: 'remote',
        onSelect: (id: string) => selected.push(id),
        ...overrides,
      } as any)}
    />
  )
  return { view, selected }
}

const tabsOf = (view: ReturnType<typeof renderStrip>['view']) =>
  view.getAllByRole('tab', { hidden: true })

describe('settings tab pinning', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a pin and reports what a toggle became', () => {
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), [])

    assert.strictEqual(toggleSettingsTabPin('preferences', 'sound'), true)
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), ['sound'])

    assert.strictEqual(toggleSettingsTabPin('preferences', 'sound'), false)
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), [])
  })

  it('keeps the pins of each strip to itself', () => {
    pinSettingsTab('preferences', 'sound')

    // The two dialogs share a component, not a preference. Pinning Sound in
    // Settings must not reorder anything in Repository Settings.
    assert.deepStrictEqual(getPinnedSettingsTabs('repository-settings'), [])
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), ['sound'])
  })

  it('never pins the same page twice and unpins only that page', () => {
    pinSettingsTab('preferences', 'sound')
    pinSettingsTab('preferences', 'sound')
    pinSettingsTab('preferences', 'remote')
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), [
      'sound',
      'remote',
    ])

    unpinSettingsTab('preferences', 'sound')
    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), ['remote'])
  })

  it('drops duplicate and empty ids that local storage hands back', () => {
    // Local storage is shared, writable by anything in the renderer, and
    // survives downgrades, so it is read as untrusted input rather than as
    // something this module knows it wrote.
    localStorage.setItem(
      'settings-tab-pins.preferences',
      JSON.stringify(['sound', 'sound', '', 'remote', 'x'.repeat(129)])
    )

    assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), [
      'sound',
      'remote',
    ])
  })

  it('fails closed on a stored value that is not a list of ids', () => {
    for (const stored of ['{"nope":1}', 'not json', '["sound", 42]']) {
      localStorage.setItem('settings-tab-pins.preferences', stored)
      assert.deepStrictEqual(
        getPinnedSettingsTabs('preferences'),
        [],
        `${stored} should yield no pins rather than a partial list`
      )
    }
  })

  it('survives storage that refuses to be read at all', () => {
    // Touching `localStorage` is not always permitted — a sandboxed origin or
    // blocked site data raises on the property access itself, and
    // `getStringArray` reads it outside its own try/catch. This is called from
    // the strip's constructor, and a throw there does not degrade the
    // component: React unmounts the subtree, so the dialog would open with no
    // navigation at all. SectionList already paid for this exact shape once.
    const real = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    ) as PropertyDescriptor

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Access is denied for this document.')
      },
    })

    try {
      assert.deepStrictEqual(getPinnedSettingsTabs('preferences'), [])
      // Writing must be just as quiet: losing a pin is not worth taking the
      // dialog down mid-click.
      assert.doesNotThrow(() => pinSettingsTab('preferences', 'sound'))
      assert.doesNotThrow(() => unpinSettingsTab('preferences', 'sound'))
    } finally {
      Object.defineProperty(globalThis, 'localStorage', real)
    }
  })

  it('orders pinned pages first without scrambling either run', () => {
    const { ordered, pinnedCount } = orderSettingsTabs(PAGES, [
      'sound',
      'remote',
    ])

    assert.strictEqual(pinnedCount, 2)
    assert.deepStrictEqual(
      ordered.map(p => p.id),
      ['sound', 'remote', 'ignored']
    )
  })

  it('ignores a pin naming a page that is not currently offered', () => {
    // The fork tab only exists for a forked repository. Pruning the pin on
    // every other repository would silently forget it.
    const { ordered, pinnedCount } = orderSettingsTabs(PAGES, ['fork', 'sound'])

    assert.strictEqual(pinnedCount, 1)
    assert.deepStrictEqual(
      ordered.map(p => p.id),
      ['sound', 'remote', 'ignored']
    )
  })
})

describe('SettingsTabStrip', () => {
  beforeEach(() => localStorage.clear())

  it('reports the page that was clicked, not its position', () => {
    // The defect this guards. Both dialogs used to key navigation by the tab
    // bar's child index, so a filtered or conditionally rendered list opened
    // whichever page happened to sit at that number.
    const { view, selected } = renderStrip()

    fireEvent.click(
      tabsOf(view).find(tab => /Sound/.test(tab.textContent ?? ''))!
    )

    assert.deepStrictEqual(selected, ['sound'])
  })

  it('renders every page it is given and marks the open one', () => {
    const { view } = renderStrip()
    const tabs = tabsOf(view)

    assert.strictEqual(tabs.length, PAGES.length)
    assert.strictEqual(
      tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length,
      1
    )
  })

  it('puts pinned pages at the top of the strip', () => {
    pinSettingsTab('preferences', 'sound')
    const { view } = renderStrip()

    assert.match(tabsOf(view)[0].textContent ?? '', /Sound/)
  })

  it('refuses navigation while the dialog owns a mutation', () => {
    const { view, selected } = renderStrip({ disabled: true })

    fireEvent.click(tabsOf(view)[1])

    assert.deepStrictEqual(selected, [])
    assert.strictEqual(tabsOf(view)[1].hasAttribute('disabled'), true)
  })

  it('carries the attributes the palette and the search rely on', () => {
    const { view } = renderStrip({
      items: [
        {
          id: 'sound',
          label: 'Sound',
          searchText: 'Sound',
          isFeature: true,
          noSearchMatch: true,
          domId: 'preferences-tab-sound',
        },
      ],
    })

    const [tab] = tabsOf(view)
    assert.strictEqual(tab.getAttribute('data-dm-feature'), 'true')
    assert.strictEqual(tab.getAttribute('data-settings-no-match'), 'true')
    assert.strictEqual(tab.id, 'preferences-tab-sound')
  })

  it('exposes a vertical tablist so arrow keys are announced correctly', () => {
    const { view } = renderStrip()

    assert.strictEqual(
      view
        .getByRole('tablist', { hidden: true })
        .getAttribute('aria-orientation'),
      'vertical'
    )
  })

  it('moves the selection with the arrow keys, wrapping at the ends', () => {
    const { view, selected } = renderStrip()
    const tabs = tabsOf(view)

    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' })
    fireEvent.keyDown(tabs[0], { key: 'ArrowUp' })

    assert.deepStrictEqual(selected, ['ignored', 'sound'])
  })
})
