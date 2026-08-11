import assert from 'node:assert'
import { beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { RepositorySettingsTab } from '../../src/models/repository-settings'
import { Repository } from '../../src/models/repository'
import { getSettingsTabDockPosition } from '../../src/ui/settings-tabs/settings-tab-model'
import { fireEvent, render } from '../helpers/ui/render'

// The dialog reads the remote snapshot and git config the moment it mounts.
// dugite has no resolvable git binary under the unit harness, so those reads
// reject after the test has ended and node:test reports the whole file as
// failing for something unrelated to what is under test. Stub them here rather
// than in the shared globals: plenty of suites run git against real
// repositories on purpose, and a global stub would quietly disarm them.
//
// The mocks must be registered before the component is loaded. This file
// compiles to CommonJS, so `require` resolves at call time and picks the mocks
// up; a static import would hoist above these calls and miss them.
mock.module('../../src/lib/git', {
  namedExports: {
    getRemoteManagementSnapshot: async () => ({
      remotes: [],
      currentRemote: null,
      defaultBranch: null,
    }),
    readGitIgnoreAtRoot: async () => '',
  },
})

mock.module('../../src/lib/git/config', {
  namedExports: {
    getConfigValue: async () => null,
    getGlobalConfigValue: async () => null,
    setConfigValue: async () => undefined,
    removeConfigValue: async () => undefined,
  },
})

const { RepositorySettings } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../src/ui/repository-settings/repository-settings') as typeof import('../../src/ui/repository-settings/repository-settings')

function renderSettings(overrides: Record<string, unknown> = {}) {
  const noop = () => undefined
  return render(
    <RepositorySettings
      {...({
        dispatcher: {
          closePopup: noop,
          // The Appearance panel probes this on mount; false keeps it in its
          // unavailable state rather than reaching for a coordinator.
          isElementAppearanceCoordinatorReady: () => false,
        },
        remote: null,
        repository: new Repository('C:\\repo', 1, null, false),
        accounts: [],
        repositoryAccount: null,
        appearanceCustomization: {},
        onDismissed: noop,
        ...overrides,
      } as any)}
    />
  )
}

const SearchLabel = 'Search settings'

// The dialog renders inside a <dialog> element, which jsdom treats as closed,
// so its contents are hidden from the accessibility tree.
const tabsOf = (view: ReturnType<typeof renderSettings>) =>
  view.getAllByRole('tab', { hidden: true })

beforeEach(() => {
  localStorage.removeItem('settings-tab-dock-position.repository-settings')
})

describe('Repository settings search', () => {
  it('uses browser-style tabs with a linked active panel', () => {
    const view = renderSettings()
    const workbench = view.container.querySelector(
      '.settings-workbench-repository'
    )
    const tablist = view.getByRole('tablist', { hidden: true })
    const selected = tabsOf(view).find(
      tab => tab.getAttribute('aria-selected') === 'true'
    )
    const panel = view.getByRole('tabpanel', { hidden: true })

    assert.ok(workbench)
    assert.ok(
      workbench?.querySelector(
        '.settings-workbench-navigation.settings-tab-rail'
      )
    )
    assert.ok(
      workbench?.querySelector('.settings-workbench-content.active-tab')
    )
    assert.equal(tablist.getAttribute('aria-orientation'), 'vertical')
    assert.ok(selected)
    assert.equal(selected?.getAttribute('aria-controls'), panel.id)
    assert.equal(
      panel.getAttribute('aria-labelledby'),
      selected?.getAttribute('id')
    )
  })

  it('defaults to the left dock and persists a changed dock position', () => {
    const view = renderSettings()
    const select = view.getByRole('combobox', {
      hidden: true,
      name: 'Settings tab position',
    }) as HTMLSelectElement

    assert.equal(select.value, 'left')
    fireEvent.change(select, { target: { value: 'right' } })

    assert.equal(select.value, 'right')
    assert.equal(getSettingsTabDockPosition('repository-settings'), 'right')
    assert.equal(
      view.container
        .querySelector('.tab-container')
        ?.getAttribute('data-settings-tab-dock-position'),
      'right'
    )
  })

  it('carries its own search field wired to a regex builder surface', () => {
    const view = renderSettings()

    assert.equal(
      view.getByLabelText(SearchLabel).getAttribute('data-search-surface-id'),
      'repository-settings-tabs'
    )
  })

  it('narrows the settings list to what was typed', () => {
    const view = renderSettings()
    const before = tabsOf(view).length

    fireEvent.change(view.getByLabelText(SearchLabel), {
      target: { value: 'submodule' },
    })

    const after = tabsOf(view)
    assert.ok(after.length < before, 'the list should have narrowed')
    assert.ok(after.some(tab => /Submodule/i.test(tab.textContent ?? '')))
  })

  it('opens the setting that was clicked, not the one at that position', () => {
    // The defect this exists to prevent. The tab enum was positional — its
    // values were defined to equal the TabBar's child indices — so once a
    // filter removes earlier rows, passing the clicked index straight through
    // opens whichever settings page happens to sit at that number.
    const view = renderSettings()
    fireEvent.change(view.getByLabelText(SearchLabel), {
      target: { value: 'metadata' },
    })

    // Row 0 is Remote, the open tab kept listed by design, so the row is found
    // by its label exactly as a user finds it.
    const row = tabsOf(view).find(tab =>
      /Metadata/i.test(tab.textContent ?? '')
    )
    assert.ok(row, 'the Metadata row should have survived the filter')
    assert.notStrictEqual(
      tabsOf(view).indexOf(row),
      RepositorySettingsTab.Metadata,
      'its position must differ from its enum value, or this proves nothing'
    )

    fireEvent.click(row)

    const selected = tabsOf(view).find(
      tab => tab.getAttribute('aria-selected') === 'true'
    )
    assert.ok(selected, 'something must stay selected')
    assert.match(
      selected.textContent ?? '',
      /Metadata/i,
      'clicking the Metadata row must open Metadata'
    )
  })

  it('keeps the open setting listed even when it does not match', () => {
    // The panel beside the strip keeps rendering the selected tab, so filtering
    // it out would show a selection the user can neither see nor return to.
    const view = renderSettings({
      initialSelectedTab: RepositorySettingsTab.Remote,
    })

    fireEvent.change(view.getByLabelText(SearchLabel), {
      target: { value: 'metadata' },
    })

    assert.ok(
      tabsOf(view).some(tab => /Remote/i.test(tab.textContent ?? '')),
      'the open setting must remain reachable'
    )
  })

  it('restores the full list when the query is cleared', () => {
    const view = renderSettings()
    const before = tabsOf(view).length
    const field = view.getByLabelText(SearchLabel)

    fireEvent.change(field, { target: { value: 'metadata' } })
    fireEvent.change(field, { target: { value: '' } })

    assert.equal(tabsOf(view).length, before)
  })

  it('never empties the strip, so there is always a way back', () => {
    const view = renderSettings()
    fireEvent.change(view.getByLabelText(SearchLabel), {
      target: { value: 'zzz-no-such-setting' },
    })

    const tabs = tabsOf(view)
    assert.equal(tabs.length, 1)
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
  })
})
