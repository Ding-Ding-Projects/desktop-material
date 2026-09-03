import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import * as React from 'react'

import { SettingsTabStrip } from '../../src/ui/settings-tabs/settings-tab-strip'
import { SettingsTabDockControl } from '../../src/ui/settings-tabs/settings-tab-dock-control'
import {
  getOpenSettingsTabs,
  getPinnedSettingsTabs,
  orderSettingsTabs,
  pinSettingsTab,
  setOpenSettingsTabs,
  DefaultSettingsTabDockPosition,
  getSettingsTabDockPosition,
  setSettingsTabDockPosition,
  SettingsTabDockPosition,
  toggleSettingsTabPin,
  unpinSettingsTab,
  SettingsTabPersistenceVersion,
  getSettingsTabLayout,
  getSettingsTabOrder,
  setSettingsTabLayout,
  createSettingsTabGroup,
  removeSettingsTabGroup,
  setSettingsTabGroupCollapsed,
  setSettingsTabGroupMembership,
  getSettingsTabGroupMembership,
  reorderSettingsTab,
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

  it('keeps repository pins separate between repository sessions', () => {
    const repoA = { scope: 'C:\\repo-a' } as const
    const repoB = { scope: 'C:\\repo-b' } as const

    pinSettingsTab('repository-settings', 'remote', repoA)
    pinSettingsTab('repository-settings', 'appearance', repoB)

    assert.deepStrictEqual(
      getPinnedSettingsTabs('repository-settings', repoA),
      ['remote']
    )
    assert.deepStrictEqual(
      getPinnedSettingsTabs('repository-settings', repoB),
      ['appearance']
    )
    assert.deepStrictEqual(getPinnedSettingsTabs('repository-settings'), [])
  })

  it('migrates scoped legacy pin ids and prunes unknown pages before the cap', () => {
    const scope = 'C:\\repo-a'
    const key = `settings-tab-pins.repository-settings.${encodeURIComponent(
      scope
    )}`
    localStorage.setItem(key, JSON.stringify(['0', 'removed-page', '11', '0']))

    const options = {
      scope,
      legacyIdMap: { '0': 'remote', '11': 'fork-settings' },
      allowedIds: ['remote', 'fork-settings'],
    } as const

    assert.deepStrictEqual(
      getPinnedSettingsTabs('repository-settings', options),
      ['remote', 'fork-settings']
    )
    assert.strictEqual(
      localStorage.getItem(key),
      JSON.stringify(['remote', 'fork-settings'])
    )
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

describe('settings tab docking', () => {
  beforeEach(() => localStorage.clear())

  it('defaults every surface to the historical left rail', () => {
    assert.strictEqual(
      getSettingsTabDockPosition('preferences'),
      DefaultSettingsTabDockPosition
    )
    assert.strictEqual(
      getSettingsTabDockPosition('repository-settings'),
      DefaultSettingsTabDockPosition
    )
  })

  it('persists each surface independently and rejects invalid stored values', () => {
    setSettingsTabDockPosition('preferences', 'bottom')
    setSettingsTabDockPosition('repository-settings', 'right')

    assert.strictEqual(getSettingsTabDockPosition('preferences'), 'bottom')
    assert.strictEqual(
      getSettingsTabDockPosition('repository-settings'),
      'right'
    )

    localStorage.setItem('settings-tab-dock-position.preferences', 'diagonal')
    assert.strictEqual(
      getSettingsTabDockPosition('preferences'),
      DefaultSettingsTabDockPosition
    )
  })

  it('exposes all four positions through a keyboard-reachable control', () => {
    const changes: SettingsTabDockPosition[] = []
    const view = render(
      <SettingsTabDockControl
        strip="preferences"
        position="left"
        onChange={position => changes.push(position)}
      />
    )

    const select = view.getByRole('combobox', {
      name: 'Settings tab position',
    })
    fireEvent.click(select)
    assert.deepStrictEqual(
      Array.from(view.getAllByRole('option', { hidden: true })).map(
        option => option.textContent
      ),
      ['Left', 'Top', 'Bottom', 'Right']
    )
    fireEvent.click(view.getByRole('option', { name: 'Right', hidden: true }))
    assert.deepStrictEqual(changes, ['right'])
  })
})

describe('versioned settings tab layout', () => {
  beforeEach(() => localStorage.clear())

  it('migrates legacy order and pins into one versioned record', () => {
    setOpenSettingsTabs('preferences', ['sound', 'remote'])
    pinSettingsTab('preferences', 'sound')

    const layout = getSettingsTabLayout('preferences', {
      allowedIds: PAGES.map(page => page.id),
    })
    assert.strictEqual(layout.version, SettingsTabPersistenceVersion)
    assert.deepStrictEqual(layout.order, ['sound', 'remote'])
    assert.deepStrictEqual(layout.pinnedIds, ['sound'])
    assert.deepStrictEqual(layout.groups, [])
  })

  it('round-trips order, groups, membership and collapse state', () => {
    const options = { allowedIds: PAGES.map(page => page.id) }
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['sound', 'remote', 'ignored'],
        pinnedIds: ['remote'],
        groups: [{ id: 'work', name: 'Work', color: 'green' }],
        groupOrder: ['work'],
        membership: { sound: 'work' },
      },
      options
    )

    assert.deepStrictEqual(getSettingsTabLayout('preferences', options), {
      version: SettingsTabPersistenceVersion,
      order: ['sound', 'remote', 'ignored'],
      pinnedIds: ['remote'],
      groups: [{ id: 'work', name: 'Work', color: 'green' }],
      groupOrder: ['work'],
      membership: { sound: 'work' },
    })
    assert.strictEqual(
      setSettingsTabGroupCollapsed('preferences', 'work', true, options),
      true
    )
    assert.strictEqual(
      getSettingsTabLayout('preferences', options).groups[0].isCollapsed,
      true
    )
  })

  it('supports bounded group lifecycle and isolated membership', () => {
    const options = { allowedIds: PAGES.map(page => page.id) }
    assert.ok(
      createSettingsTabGroup('preferences', { id: 'one', name: 'One' }, options)
    )
    assert.strictEqual(
      createSettingsTabGroup(
        'preferences',
        { id: 'one', name: 'Again' },
        options
      ),
      null
    )
    setSettingsTabGroupMembership('preferences', 'remote', 'one', options)
    assert.deepStrictEqual(
      getSettingsTabGroupMembership('preferences', options),
      { remote: 'one' }
    )
    assert.strictEqual(
      removeSettingsTabGroup('preferences', 'one', options),
      true
    )
    assert.deepStrictEqual(
      getSettingsTabGroupMembership('preferences', options),
      {}
    )
  })

  it('reorders tabs without mutating the pinned list', () => {
    const options = { allowedIds: PAGES.map(page => page.id) }
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['remote', 'ignored', 'sound'],
        pinnedIds: ['sound'],
        groups: [],
        groupOrder: [],
        membership: {},
      },
      options
    )
    assert.deepStrictEqual(
      reorderSettingsTab('preferences', 'remote', 2, options),
      ['ignored', 'sound', 'remote']
    )
    assert.deepStrictEqual(
      getSettingsTabLayout('preferences', options).pinnedIds,
      ['sound']
    )
  })

  it('falls back to valid legacy state when the versioned JSON is malformed', () => {
    localStorage.setItem('settings-tab-layout.preferences', '{not-json')
    setOpenSettingsTabs('preferences', ['sound', 'remote'])
    pinSettingsTab('preferences', 'remote')
    assert.deepStrictEqual(
      getSettingsTabLayout('preferences', {
        allowedIds: PAGES.map(page => page.id),
      }),
      {
        version: SettingsTabPersistenceVersion,
        order: ['sound', 'remote'],
        pinnedIds: ['remote'],
        groups: [],
        groupOrder: [],
        membership: {},
      }
    )
  })

  it('retains forward fields while dropping orphan membership', () => {
    localStorage.setItem(
      'settings-tab-layout.preferences',
      JSON.stringify({
        version: SettingsTabPersistenceVersion,
        order: ['remote'],
        pinnedIds: [],
        groups: [{ id: 'work', name: 'Work' }],
        groupOrder: ['work'],
        membership: { remote: 'work', removed: 'work' },
        futureSetting: { preserved: true },
      })
    )
    const options = { allowedIds: ['remote'] }
    assert.deepStrictEqual(
      getSettingsTabLayout('preferences', options).membership,
      { remote: 'work' }
    )
    assert.deepStrictEqual(
      getSettingsTabLayout('preferences', options).futureSetting,
      { preserved: true }
    )
  })

  it('supports moving a tab out of its group', () => {
    const options = { allowedIds: PAGES.map(page => page.id) }
    createSettingsTabGroup('preferences', { id: 'work', name: 'Work' }, options)
    setSettingsTabGroupMembership('preferences', 'remote', 'work', options)
    setSettingsTabGroupMembership('preferences', 'remote', null, options)
    assert.deepStrictEqual(
      getSettingsTabGroupMembership('preferences', options),
      { remote: null }
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

  it('does not handle a tab context menu while disabled', () => {
    const { view } = renderStrip({ disabled: true })
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    })

    tabsOf(view)[0].dispatchEvent(event)

    assert.strictEqual(
      event.defaultPrevented,
      false,
      'a disabled dialog must not open a pinning menu'
    )
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

  it('switches to a horizontal tablist and arrow direction for top and bottom docks', () => {
    const { view, selected } = renderStrip({ dockPosition: 'top' })
    const tabs = tabsOf(view)

    assert.strictEqual(
      view
        .getByRole('tablist', { hidden: true })
        .getAttribute('aria-orientation'),
      'horizontal'
    )
    assert.strictEqual(
      view.container
        .querySelector('.settings-tab-strip')
        ?.getAttribute('data-settings-tab-dock-position'),
      'top'
    )

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' })

    assert.deepStrictEqual(selected, ['ignored'])
  })

  it('moves the selection with the arrow keys, wrapping at the ends', () => {
    const { view, selected } = renderStrip()
    const tabs = tabsOf(view)

    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' })
    fireEvent.keyDown(tabs[0], { key: 'ArrowUp' })

    assert.deepStrictEqual(selected, ['ignored', 'sound'])
  })

  it('renders a horizontal browser tab lane with a new-page action', () => {
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })

    const tablist = view.getByRole('tablist', { hidden: true })
    assert.strictEqual(tablist.getAttribute('aria-orientation'), 'horizontal')
    assert.strictEqual(tabsOf(view).length, PAGES.length)
    assert.strictEqual(
      tablist.querySelectorAll('button').length,
      0,
      'close controls must not become tablist-owned descendants'
    )
    assert.match(
      tablist.getAttribute('aria-owns') ?? '',
      /settings-preferences-tab-remote/
    )
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Open a settings page in a new tab' })
        .hasAttribute('disabled'),
      true,
      'the new-page action is disabled when every declared page is already open'
    )
  })

  it('keeps the complete catalogue open on a first filtered visit', () => {
    const { view } = renderStrip({
      items: [PAGES[0]],
      allItems: PAGES,
      variant: 'browser',
      showNewTab: true,
    })

    assert.strictEqual(tabsOf(view).length, 1)
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Open a settings page in a new tab' })
        .hasAttribute('disabled'),
      true,
      'hidden pages in the complete catalogue are already open, even when the visible list is filtered'
    )
  })

  it('closes and reopens page tabs without losing stable identity', () => {
    const { view, selected } = renderStrip({
      variant: 'browser',
      showNewTab: true,
    })

    fireEvent.click(
      view.getByRole('button', { name: 'Close Ignored files tab' })
    )
    assert.strictEqual(tabsOf(view).length, 2)
    assert.deepStrictEqual(getOpenSettingsTabs('preferences'), [
      'remote',
      'sound',
    ])

    fireEvent.click(
      view.getByRole('button', { name: 'Open a settings page in a new tab' })
    )
    fireEvent.click(view.getByRole('option', { name: 'Ignored files' }))

    assert.strictEqual(tabsOf(view).length, PAGES.length)
    assert.deepStrictEqual(selected, ['ignored'])
    assert.deepStrictEqual(getOpenSettingsTabs('preferences'), [
      'remote',
      'sound',
      'ignored',
    ])
  })

  it('reconciles stale stored pages before they can crowd out real pages', () => {
    setOpenSettingsTabs('preferences', ['removed-page', 'remote'])

    const { view } = renderStrip({ variant: 'browser', showNewTab: true })

    assert.deepStrictEqual(
      tabsOf(view).map(tab => tab.getAttribute('value')),
      ['remote']
    )
    assert.deepStrictEqual(getOpenSettingsTabs('preferences'), ['remote'])
  })

  it('keeps a valid page after many stale stored ids', () => {
    setOpenSettingsTabs(
      'preferences',
      Array.from({ length: 64 }, (_, index) => `removed-${index}`)
    )
    localStorage.setItem(
      'settings-tab-open.preferences',
      JSON.stringify([
        ...Array.from({ length: 64 }, (_, index) => `removed-${index}`),
        'remote',
      ])
    )

    const { view } = renderStrip({ variant: 'browser', showNewTab: true })

    assert.deepStrictEqual(
      tabsOf(view).map(tab => tab.getAttribute('value')),
      ['remote']
    )
    assert.deepStrictEqual(getOpenSettingsTabs('preferences'), ['remote'])
  })

  it('returns focus to a surviving tab after close and after reopening', () => {
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })

    fireEvent.click(
      view.getByRole('button', { name: 'Close Ignored files tab' })
    )
    assert.strictEqual(
      document.activeElement,
      tabsOf(view).find(tab => tab.getAttribute('value') === 'sound')
    )

    fireEvent.click(
      view.getByRole('button', { name: 'Open a settings page in a new tab' })
    )
    fireEvent.click(view.getByRole('option', { name: 'Ignored files' }))
    assert.strictEqual(
      document.activeElement,
      tabsOf(view).find(tab => tab.getAttribute('value') === 'ignored')
    )
  })

  it('uses horizontal arrow keys and exposes the selected panel link', () => {
    const { view, selected } = renderStrip({
      variant: 'browser',
      items: PAGES.map(page => ({
        ...page,
        domId: `settings-tab-${page.id}`,
      })),
    })
    const tabs = tabsOf(view)

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    fireEvent.keyDown(tabs[1], { key: 'Home' })

    assert.deepStrictEqual(selected, ['ignored', 'remote'])
    assert.strictEqual(
      tabs[0].getAttribute('aria-controls'),
      'settings-tab-remote-panel'
    )
    assert.strictEqual(tabs[1].hasAttribute('aria-controls'), false)
  })

  it('round-trips open page ids and bounds malformed storage', () => {
    assert.strictEqual(getOpenSettingsTabs('preferences'), null)
    setOpenSettingsTabs('preferences', [
      'remote',
      'remote',
      '',
      'x'.repeat(129),
      'sound',
    ])

    assert.deepStrictEqual(getOpenSettingsTabs('preferences'), [
      'remote',
      'sound',
    ])
  })

  it('keeps repository page sessions separate and migrates numeric ids once', () => {
    localStorage.setItem(
      'settings-tab-open.repository-settings',
      JSON.stringify(['0', '11'])
    )

    const legacyOptions = {
      scope: 'C:\\repo-a',
      legacyIdMap: { '0': 'remote', '11': 'fork-settings' },
    } as const

    assert.deepStrictEqual(
      getOpenSettingsTabs(
        'repository-settings',
        ['remote', 'fork-settings'],
        legacyOptions
      ),
      ['remote', 'fork-settings']
    )

    setOpenSettingsTabs(
      'repository-settings',
      ['remote', 'fork-settings'],
      legacyOptions
    )
    setOpenSettingsTabs('repository-settings', ['remote'], {
      scope: 'C:\\repo-b',
      legacyIdMap: legacyOptions.legacyIdMap,
    })

    assert.deepStrictEqual(
      getOpenSettingsTabs(
        'repository-settings',
        ['remote', 'fork-settings'],
        legacyOptions
      ),
      ['remote', 'fork-settings']
    )
    assert.deepStrictEqual(
      getOpenSettingsTabs('repository-settings', ['remote', 'fork-settings'], {
        scope: 'C:\\repo-b',
        legacyIdMap: legacyOptions.legacyIdMap,
      }),
      ['remote']
    )
    assert.strictEqual(
      localStorage.getItem('settings-tab-open.repository-settings'),
      JSON.stringify(['0', '11'])
    )
  })

  it('keeps picker controls linked to their list and active option', () => {
    setOpenSettingsTabs('preferences', ['remote', 'sound'])
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })

    const trigger = view.getByRole('button', {
      name: 'Open a settings page in a new tab',
    })
    const pickerId = trigger.getAttribute('aria-controls')
    assert.ok(pickerId)

    fireEvent.click(trigger)

    const picker = view.getByRole('dialog', { hidden: true })
    const heading = view.getByRole('heading', {
      hidden: true,
      name: 'Choose a settings page',
    })
    const list = view.getByRole('listbox', { hidden: true })
    const input = view.getByRole('combobox', { hidden: true })
    assert.strictEqual(picker.id, pickerId)
    assert.ok(
      heading.closest('.settings-tab-picker-header'),
      'the searchable picker keeps its visible Material panel heading'
    )
    assert.strictEqual(input.getAttribute('aria-controls'), list.id)
    assert.strictEqual(
      input.getAttribute('aria-activedescendant'),
      view.getByRole('option', { name: 'Ignored files' }).id
    )
  })

  it('keeps the all-pages search reachable even when no tab overflows', () => {
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })
    const search = view.getByRole('button', { name: 'Search settings' })

    fireEvent.click(search)

    assert.ok(view.getByRole('dialog', { hidden: true }))
    assert.ok(view.getByRole('option', { name: 'Ignored files' }))
  })

  it('keeps the combobox linked to an empty result list', () => {
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })
    fireEvent.click(view.getByRole('button', { name: 'Search settings' }))

    const input = view.getByRole('combobox', { hidden: true })
    fireEvent.change(input, {
      target: { value: 'definitely-no-settings-page' },
    })

    const listId = input.getAttribute('aria-controls')
    assert.ok(listId)
    assert.strictEqual(input.getAttribute('aria-expanded'), 'true')
    assert.strictEqual(view.container.querySelector(`#${listId}`)?.id, listId)
    assert.match(view.getByRole('status').textContent ?? '', /No settings page/)
    assert.strictEqual(
      view.queryAllByRole('option', { hidden: true }).length,
      0
    )
  })

  it('returns focus to the picker trigger after outside dismissal', () => {
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })
    const trigger = view.getByRole('button', { name: 'Search settings' })

    fireEvent.click(trigger)
    assert.notStrictEqual(document.activeElement, trigger)

    fireEvent.click(document.body)

    assert.strictEqual(document.activeElement, trigger)
  })

  it('renders named groups and keeps a group search builder isolated', () => {
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['remote', 'ignored', 'sound'],
        pinnedIds: [],
        groups: [{ id: 'work', name: 'Work', color: 'green' }],
        groupOrder: ['work'],
        membership: { remote: 'work' },
      },
      { allowedIds: PAGES.map(page => page.id) }
    )
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })
    assert.ok(view.getByRole('button', { name: 'Collapse Work' }))
    fireEvent.click(view.getByRole('button', { name: 'Search Work tabs' }))
    const input = view.getByRole('combobox', { hidden: true })
    assert.strictEqual(
      input.getAttribute('data-search-surface-id'),
      'preferences-master-tabs-group-work'
    )
    assert.ok(view.getByRole('option', { name: 'Remote' }))
  })

  it('reveals a collapsed group for a search result without changing collapse state', () => {
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['remote', 'ignored', 'sound'],
        pinnedIds: [],
        groups: [{ id: 'work', name: 'Work', isCollapsed: true }],
        groupOrder: ['work'],
        membership: { remote: 'work' },
      },
      { allowedIds: PAGES.map(page => page.id) }
    )
    const { view } = renderStrip({ variant: 'browser', showNewTab: true })
    assert.ok(view.getByRole('tab', { name: 'Remote' }))
    fireEvent.click(view.getByRole('button', { name: 'Search settings' }))
    fireEvent.click(view.getByRole('option', { name: 'Remote' }))
    assert.ok(view.getByRole('tab', { name: 'Remote' }))
    assert.strictEqual(
      getSettingsTabLayout('preferences', {
        allowedIds: PAGES.map(page => page.id),
      }).groups[0].isCollapsed,
      true
    )
  })

  it('moves a tab with the keyboard while keeping stable identities', () => {
    const { view } = renderStrip({ variant: 'browser' })
    const remote = view.getByRole('tab', { name: 'Remote' })
    fireEvent.keyDown(remote, { key: 'ArrowRight', ctrlKey: true })
    assert.deepStrictEqual(
      getSettingsTabOrder('preferences', {
        allowedIds: PAGES.map(page => page.id),
      }),
      ['ignored', 'remote', 'sound']
    )
  })

  it('restores pinned order from the versioned layout after remount', () => {
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['remote', 'ignored', 'sound'],
        pinnedIds: ['sound', 'remote'],
        groups: [],
        groupOrder: [],
        membership: {},
      },
      { allowedIds: PAGES.map(page => page.id) }
    )
    const first = renderStrip({ variant: 'browser' })
    assert.deepStrictEqual(
      tabsOf(first.view).map(tab => tab.getAttribute('value')),
      ['sound', 'remote', 'ignored']
    )
    first.view.unmount()
    const second = renderStrip({ variant: 'browser' })
    assert.deepStrictEqual(
      tabsOf(second.view).map(tab => tab.getAttribute('value')),
      ['sound', 'remote', 'ignored']
    )
  })

  it('keeps unpinned grouped tabs behind the pinned region', () => {
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['ignored', 'remote', 'sound'],
        pinnedIds: ['remote'],
        groups: [{ id: 'work', name: 'Work' }],
        groupOrder: ['work'],
        membership: { ignored: 'work' },
      },
      { allowedIds: PAGES.map(page => page.id) }
    )
    const { view } = renderStrip({ variant: 'browser' })
    assert.deepStrictEqual(
      tabsOf(view).map(tab => tab.getAttribute('value')),
      ['remote', 'ignored', 'sound']
    )
  })

  it('keeps empty groups visible and disables their controls during mutation', () => {
    setSettingsTabLayout(
      'preferences',
      {
        version: SettingsTabPersistenceVersion,
        order: ['remote', 'ignored', 'sound'],
        pinnedIds: [],
        groups: [{ id: 'empty', name: 'Empty' }],
        groupOrder: ['empty'],
        membership: {},
      },
      { allowedIds: PAGES.map(page => page.id) }
    )
    const { view } = renderStrip({ variant: 'browser', disabled: true })
    assert.match(view.getByRole('status').textContent ?? '', /No tabs/)
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Expand Empty' })
        .hasAttribute('disabled'),
      true
    )
  })
})
