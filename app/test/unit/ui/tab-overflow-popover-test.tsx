import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'

import { ProfileStore } from '../../../src/lib/stores/profile-store'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { RepositoryTabsStore } from '../../../src/lib/stores/repository-tabs-store'
import { Repository } from '../../../src/models/repository'
import {
  IProfileTabsState,
  IRepositoryTab,
} from '../../../src/models/repository-tab'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoryTabStrip } from '../../../src/ui/repository-tabs/repository-tab-strip'
import { TabOverflowPopover } from '../../../src/ui/repository-tabs/tab-overflow-popover'
import {
  repositoryTabMatchKeys,
  visibleTabLabel,
} from '../../../src/ui/repository-tabs/tab-action-helpers'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let previousIpcSend: typeof ipcRenderer.send

beforeEach(() => {
  previousIpcSend = ipcRenderer.send
  ipcRenderer.send = () => undefined
  localStorage.removeItem('filter-mode/tab-overflow')
})

afterEach(() => {
  ipcRenderer.send = previousIpcSend
  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem('filter-mode/tab-overflow')
  for (const backdrop of document.querySelectorAll<HTMLElement>(
    '.material-context-menu-backdrop'
  )) {
    fireEvent.mouseDown(backdrop)
  }
})

function makeTab(
  id: string,
  repository: Repository,
  customLabel: string | null = null
): IRepositoryTab {
  return {
    id,
    repositoryId: repository.id,
    repositoryPath: repository.path,
    customLabel,
    titleStyle: null,
  }
}

const alpha = new Repository('/work/alpha', 1, null, false)
const material = new Repository(
  '/clients/material',
  2,
  null,
  false,
  'Studio Alias'
)
const omega = new Repository('/work/omega', 3, null, false)
const repositories = [alpha, material, omega]
const repositoryFor = (tab: IRepositoryTab) =>
  repositories.find(candidate => candidate.id === tab.repositoryId) ?? null

const overflowTabs = [
  makeTab('alpha', alpha),
  makeTab('material', material, 'Material workspace'),
  makeTab('omega', omega),
]

interface IPopoverSpies {
  readonly selected: Array<string>
  readonly customized: Array<string>
  readonly contextMenus: Array<string>
  readonly closes: () => number
}

function renderPopover(
  tabs: ReadonlyArray<IRepositoryTab> = overflowTabs
): IPopoverSpies {
  const selected = new Array<string>()
  const customized = new Array<string>()
  const contextMenus = new Array<string>()
  let closes = 0

  render(
    <TabOverflowPopover
      tabs={tabs}
      activeTabId="material"
      anchor={null}
      languageMode="english"
      resolveLabel={tab => visibleTabLabel(tab, repositoryFor(tab))}
      resolveMatchKeys={tab => repositoryTabMatchKeys(tab, repositoryFor(tab))}
      onSelect={tab => selected.push(tab.id)}
      onCustomize={tab => customized.push(tab.id)}
      onContextMenu={tab => contextMenus.push(tab.id)}
      onClose={() => closes++}
    />
  )

  return { selected, customized, contextMenus, closes: () => closes }
}

describe('TabOverflowPopover search', () => {
  it('narrows the overflowed list through the shared filter modes', async () => {
    renderPopover()

    const input = screen.getByRole('combobox', {
      name: 'Search tabs in this menu',
    })
    await waitFor(() => assert.equal(document.activeElement, input))
    assert.equal(input.getAttribute('type'), 'search')
    assert.equal(
      input.getAttribute('data-search-surface-id'),
      'tab-overflow',
      'the audited surface marker must be a literal in the JSX'
    )
    assert.equal(screen.getAllByRole('option').length, 3)
    assert.ok(screen.getByText('3 tabs in this menu'))

    // Plain text is the default: the shared control starts on Fuzzy, and regex
    // is only reached by explicitly cycling to it.
    fireEvent.change(input, { target: { value: 'workspace' } })
    assert.equal(screen.getAllByRole('option').length, 1)
    assert.ok(screen.getByText('1 of 3 tabs in this menu'))

    // Substring mode consults every literal key, e.g. the repository alias.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Fuzzy (click to change)',
      })
    )
    fireEvent.change(input, { target: { value: 'studio alias' } })
    assert.equal(screen.getAllByRole('option').length, 1)
    assert.ok(
      screen.getByRole('option', { name: 'Material workspace, active' })
    )

    fireEvent.change(input, { target: { value: 'not-a-tab' } })
    assert.equal(screen.queryAllByRole('option').length, 0)
    assert.ok(screen.getByText('No tab in this menu matches this search.'))
    assert.ok(screen.getByText('0 of 3 tabs in this menu'))
  })

  it('applies an opt-in regular expression and reports an invalid one without hiding rows', () => {
    renderPopover()

    const input = screen.getByRole('combobox', {
      name: 'Search tabs in this menu',
    })
    assert.equal(screen.queryByRole('alert'), null)

    // Fuzzy -> Substring -> Regex: the regex engine is never the default.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Fuzzy (click to change)',
      })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter mode: Substring (click to change)',
      })
    )
    fireEvent.change(input, { target: { value: '^/work/' } })
    assert.deepEqual(
      screen.getAllByRole('option').map(option => option.textContent),
      ['alpha/work/alpha', 'omega/work/omega']
    )

    fireEvent.change(input, { target: { value: '(' } })
    const alert = screen.getByRole('alert')
    assert.match(alert.textContent ?? '', /Invalid regular expression/)
    assert.equal(
      screen.getAllByRole('option').length,
      3,
      'an unfinished pattern must never empty the menu'
    )
    assert.ok(screen.getByText('3 of 3 tabs in this menu'))
  })

  it('keeps the list keyboard operable from the field and from the list', () => {
    const spies = renderPopover()

    const input = screen.getByRole('combobox', {
      name: 'Search tabs in this menu',
    })
    // The active tab starts highlighted, and the field drives the list without
    // taking navigation away from it.
    assert.equal(
      input.getAttribute('aria-activedescendant'),
      'tab-overflow-result-1'
    )
    fireEvent.keyDown(input, { key: 'End' })
    assert.equal(
      input.getAttribute('aria-activedescendant'),
      'tab-overflow-result-2'
    )
    fireEvent.keyDown(input, { key: 'Home' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    assert.equal(
      input.getAttribute('aria-activedescendant'),
      'tab-overflow-result-1'
    )

    // A space in the query is typed text, never an activation.
    fireEvent.keyDown(input, { key: ' ' })
    assert.deepEqual(spies.selected, [])

    // Filtering narrows what Enter can reach.
    fireEvent.change(input, { target: { value: 'omega' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    assert.deepEqual(spies.selected, ['omega'])
    assert.equal(spies.closes(), 1)

    fireEvent.change(input, { target: { value: '' } })
    const list = screen.getByRole('listbox', {
      name: 'Overflowing repository tabs',
    })
    list.focus()
    assert.equal(document.activeElement, list)
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'tab-overflow-result-2'
    )
    // Space still activates from the list itself.
    fireEvent.keyDown(list, { key: ' ' })
    assert.deepEqual(spies.selected, ['omega', 'omega'])
  })

  it('offers per-row customization and the tab command menu', () => {
    const spies = renderPopover()

    const customize = screen.getByRole('button', {
      name: 'Customize appearance of Material workspace',
    })
    fireEvent.click(customize)
    assert.deepEqual(spies.customized, ['material'])

    const row = screen.getByRole('option', { name: 'alpha' }).closest('li')
    assert.notEqual(row, null)
    fireEvent.contextMenu(row!)
    assert.deepEqual(spies.contextMenus, ['alpha'])
  })

  it('localizes every new control in bilingual mode', () => {
    render(
      <TabOverflowPopover
        tabs={overflowTabs}
        activeTabId="material"
        anchor={null}
        languageMode="bilingual"
        resolveLabel={tab => visibleTabLabel(tab, repositoryFor(tab))}
        resolveMatchKeys={tab =>
          repositoryTabMatchKeys(tab, repositoryFor(tab))
        }
        onSelect={() => undefined}
        onCustomize={() => undefined}
        onContextMenu={() => undefined}
        onClose={() => undefined}
      />
    )

    const input = screen.getByRole('combobox', {
      name: 'Search tabs in this menu',
    })
    // Visible copy carries both languages; the accessible name stays concise.
    assert.equal(
      input.getAttribute('placeholder'),
      'Name, alias, path, or URL · 名、別名、路徑或者網址'
    )
    assert.match(
      screen.getByText(/ran out of room in the strip/).textContent ?? '',
      /冇位企/
    )
    assert.ok(
      screen.getByText(
        'Right-click a tab here for the same actions a tab in the strip has. · 喺呢度撳右鍵，分頁列有嘅功能一樣照有。'
      )
    )
    // The tab's own name is never translated or decorated.
    assert.ok(screen.getByRole('option', { name: 'alpha' }))
    assert.ok(
      screen.getByRole('button', { name: 'Customize appearance of alpha' })
    )
  })

  it('styles the description with each language own funny level, facts intact', () => {
    localStorage.setItem(
      'audio-system-settings-v1',
      JSON.stringify({ funnyLevelEnglish: 1, funnyLevelCantonese: 5 })
    )
    try {
      render(
        <TabOverflowPopover
          tabs={overflowTabs}
          activeTabId="material"
          anchor={null}
          languageMode="bilingual"
          resolveLabel={tab => visibleTabLabel(tab, repositoryFor(tab))}
          resolveMatchKeys={tab =>
            repositoryTabMatchKeys(tab, repositoryFor(tab))
          }
          onSelect={() => undefined}
          onCustomize={() => undefined}
          onContextMenu={() => undefined}
          onClose={() => undefined}
        />
      )

      // English reads fully plain at 1 while Cantonese reads maximally playful
      // at 5, and both still say what this menu holds and what can be done.
      const description = screen.getByText(/did not fit in the strip/)
      assert.match(description.textContent ?? '', /俾人擠咗出嚟/)
      assert.match(description.textContent ?? '', /Search them, switch to one/)
      assert.match(description.textContent ?? '', /整色整水/)
    } finally {
      localStorage.removeItem('audio-system-settings-v1')
    }
  })
})

/**
 * Force a measurable strip in jsdom, which reports every box as zero and would
 * otherwise never produce an overflow. Returns the restore function.
 */
function measureStrip(options: {
  readonly tab: number
  readonly list: number
  readonly overflowButton: number
}): () => void {
  const proto = HTMLElement.prototype
  const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')
  const clientWidth = Object.getOwnPropertyDescriptor(proto, 'clientWidth')

  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('repository-tab')) {
        return options.tab
      }
      return this.classList.contains('repository-tab-overflow')
        ? options.overflowButton
        : 0
    },
  })
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('repository-tab-list') ? options.list : 0
    },
  })

  return () => {
    if (offsetWidth !== undefined) {
      Object.defineProperty(proto, 'offsetWidth', offsetWidth)
    }
    if (clientWidth !== undefined) {
      Object.defineProperty(proto, 'clientWidth', clientWidth)
    }
  }
}

async function createStore(
  tabs: ReadonlyArray<IRepositoryTab>
): Promise<RepositoryTabsStore> {
  const initial: IProfileTabsState = { tabs, activeTabId: tabs[0]?.id ?? null }
  const profileStore = {
    readTabs: () => Promise.resolve(initial),
    writeTabs: () => Promise.resolve(),
  } as unknown as ProfileStore
  const store = new RepositoryTabsStore(profileStore, 'primary', Date.now)
  await store.initialize()
  return store
}

function renderStrip(
  store: RepositoryTabsStore,
  ref?: React.Ref<RepositoryTabStrip>
) {
  const dispatcher = {
    selectRepository: () => undefined,
    showFoldout: () => undefined,
    setNotificationCentreOpen: () => undefined,
  } as unknown as Dispatcher
  const stateManager = {
    get: () => {
      throw new Error('status cache should not be read by the overflow menu')
    },
  } as unknown as RepositoryStateCache

  return render(
    <RepositoryTabStrip
      ref={ref}
      tabsStore={store}
      repositories={repositories}
      dispatcher={dispatcher}
      repositoryStateManager={stateManager}
      unreadNotificationCount={0}
      isNotificationCentreOpen={false}
    />
  )
}

describe('RepositoryTabStrip overflow capabilities', () => {
  it('bounds cached chip widths to valid groups that still have members', async () => {
    const store = await createStore([
      makeTab('alpha', alpha),
      makeTab('material', material, 'Material workspace'),
    ])
    const activeGroupId = await store.createTabGroup('Active', 'blue', [
      'alpha',
    ])
    const inactiveGroupId = await store.createTabGroup('Empty', 'green')
    const deletedGroupId = await store.createTabGroup('Deleted', 'red')
    assert.ok(activeGroupId !== null)
    assert.ok(inactiveGroupId !== null)
    assert.ok(deletedGroupId !== null)
    await store.deleteTabGroup(deletedGroupId)

    const stripRef = React.createRef<RepositoryTabStrip>()
    renderStrip(store, stripRef)
    assert.ok(stripRef.current !== null)
    const chipWidthCache = (
      stripRef.current as unknown as {
        readonly chipWidthCache: Map<string, number>
      }
    ).chipWidthCache

    chipWidthCache.set(activeGroupId, 80)
    chipWidthCache.set(inactiveGroupId, 80)
    chipWidthCache.set(deletedGroupId, 80)
    assert.equal(chipWidthCache.size, 3)

    // A store update drives the same recomputation used after group changes.
    await store.updateTabGroup(activeGroupId, { name: 'Active renamed' })
    await waitFor(() => {
      assert.deepEqual(new Set(chipWidthCache.keys()), new Set([activeGroupId]))
    })
  })

  it('opens the per-tab appearance editor for a tab that only exists in the dropdown', async () => {
    const restore = measureStrip({ tab: 120, list: 260, overflowButton: 40 })
    try {
      const store = await createStore([
        makeTab('alpha', alpha),
        makeTab('material', material, 'Material workspace'),
        makeTab('omega', omega),
      ])
      renderStrip(store)

      // Only the leading tab fits, so the other two are reachable through the
      // dropdown alone — and must not lose the strip's customization route.
      const overflowButton = await waitFor(() =>
        screen.getByRole('button', { name: 'Show 2 more tabs' })
      )
      assert.equal(screen.queryByRole('tab', { name: 'omega' }), null)
      fireEvent.click(overflowButton)

      fireEvent.click(
        screen.getByRole('button', { name: 'Customize appearance of omega' })
      )

      await waitFor(() => assert.ok(screen.getByText('Tab appearance')))
      assert.equal(
        store.getState().activeTabId,
        'alpha',
        'customizing an overflowed tab must not switch to it'
      )
    } finally {
      restore()
    }
  })

  it('gives an overflowed row the same command menu a tab in the strip has', async () => {
    const restore = measureStrip({ tab: 120, list: 260, overflowButton: 40 })
    try {
      const store = await createStore([
        makeTab('alpha', alpha),
        makeTab('material', material, 'Material workspace'),
        makeTab('omega', omega),
      ])
      renderStrip(store)

      fireEvent.click(
        await waitFor(() =>
          screen.getByRole('button', { name: 'Show 2 more tabs' })
        )
      )
      const row = screen.getByRole('option', { name: 'omega' }).closest('li')
      assert.notEqual(row, null)
      fireEvent.contextMenu(row!)

      await waitFor(() =>
        assert.ok(
          screen.getByRole('menuitem', { name: 'Customize Appearance…' })
        )
      )
      for (const name of ['Pin Tab', 'Add to Favorites', 'Close Tab']) {
        assert.ok(screen.getByRole('menuitem', { name }))
      }

      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Customize Appearance…' })
      )
      await waitFor(() => assert.ok(screen.getByText('Tab appearance')))
    } finally {
      restore()
    }
  })
})
