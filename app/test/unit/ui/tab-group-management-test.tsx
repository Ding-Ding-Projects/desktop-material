import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'

import { ProfileStore } from '../../../src/lib/stores/profile-store'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { RepositoryTabsStore } from '../../../src/lib/stores/repository-tabs-store'
import {
  IProfileTabsState,
  IRepositoryTab,
} from '../../../src/models/repository-tab'
import { Repository } from '../../../src/models/repository'
import { RepositoryTabStrip } from '../../../src/ui/repository-tabs/repository-tab-strip'
import { EditTabGroupDialog } from '../../../src/ui/repository-tabs/edit-tab-group-dialog'
import {
  tabGroupMembersButtonKey,
  tabGroupMembersCountKey,
} from '../../../src/ui/repository-tabs/tab-group-members-popover'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { LanguageModeChangedEvent, translate } from '../../../src/lib/i18n'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let previousIpcSend: typeof ipcRenderer.send
let dialogLayer: HTMLElement | null = null

beforeEach(() => {
  previousIpcSend = ipcRenderer.send
  ipcRenderer.send = () => undefined
  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem('filter-mode/tab-group-members')

  // `App` renders `<div id="dialog-layer">` once, and every floating dialog in
  // the app lives inside it. The strip is mounted on its own here, so stage the
  // layer the same way; without it the portal has nowhere to go.
  dialogLayer = document.createElement('div')
  dialogLayer.id = 'dialog-layer'
  document.body.appendChild(dialogLayer)
})

afterEach(() => {
  ipcRenderer.send = previousIpcSend
  localStorage.removeItem('language-mode-v1')
  dialogLayer?.remove()
  dialogLayer = null
})

function makeTab(id: string, repository: Repository): IRepositoryTab {
  return {
    id,
    repositoryId: repository.id,
    repositoryPath: repository.path,
    customLabel: null,
    titleStyle: null,
  }
}

/**
 * A tabs store whose writes are captured rather than committed, so a test can
 * assert what a group edit *persisted* without touching a profile repository.
 */
async function createStore(
  tabs: ReadonlyArray<IRepositoryTab>,
  activeTabId: string | null,
  written: Array<IProfileTabsState>
): Promise<RepositoryTabsStore> {
  const initial: IProfileTabsState = { tabs, activeTabId }
  const profileStore = {
    readTabs: () => Promise.resolve(initial),
    writeTabs: (state: IProfileTabsState) => {
      written.push(state)
      return Promise.resolve()
    },
  } as unknown as ProfileStore
  const store = new RepositoryTabsStore(profileStore, 'primary', Date.now)
  await store.initialize()
  return store
}

interface IStripHarness {
  readonly store: RepositoryTabsStore
  readonly selected: Array<string>
}

function renderStrip(
  store: RepositoryTabsStore,
  repositories: ReadonlyArray<Repository>,
  selected: Array<string>
) {
  const dispatcher = {
    selectRepository: (repository: Repository) => {
      selected.push(repository.name)
    },
    showFoldout: () => undefined,
    setNotificationCentreOpen: () => undefined,
  } as unknown as Dispatcher
  const stateManager = {
    get: () => {
      throw new Error('status cache should not be read by group management')
    },
  } as unknown as RepositoryStateCache

  return render(
    <RepositoryTabStrip
      tabsStore={store}
      repositories={repositories}
      dispatcher={dispatcher}
      repositoryStateManager={stateManager}
      unreadNotificationCount={0}
      isNotificationCentreOpen={false}
    />
  )
}

async function buildHarness(): Promise<IStripHarness> {
  const alpha = new Repository('/work/alpha', 1, null, false)
  const beta = new Repository('/work/beta', 2, null, false)
  const gamma = new Repository('/work/gamma', 3, null, false)
  const written = new Array<IProfileTabsState>()
  const store = await createStore(
    [makeTab('alpha', alpha), makeTab('beta', beta), makeTab('gamma', gamma)],
    'gamma',
    written
  )
  await store.createTabGroup('Work', 'purple', ['alpha', 'beta'])
  const selected = new Array<string>()
  renderStrip(store, [alpha, beta, gamma], selected)
  return { store, selected }
}

describe('tab group member dropdown', () => {
  it('selects natural member-count copy for zero, one, and many in both languages', () => {
    const cases = [
      {
        language: 'english' as const,
        count: 0,
        button: 'Show the 0 tabs in Work',
        status: '0 tabs in this group.',
      },
      {
        language: 'english' as const,
        count: 1,
        button: 'Show the 1 tab in Work',
        status: '1 tab in this group.',
      },
      {
        language: 'english' as const,
        count: 2,
        button: 'Show the 2 tabs in Work',
        status: '2 tabs in this group.',
      },
      {
        language: 'cantonese' as const,
        count: 0,
        button: '打開「Work」入面 0 個分頁',
        status: '呢個群組有 0 個分頁。',
      },
      {
        language: 'cantonese' as const,
        count: 1,
        button: '打開「Work」入面 1 個分頁',
        status: '呢個群組有 1 個分頁。',
      },
      {
        language: 'cantonese' as const,
        count: 2,
        button: '打開「Work」入面 2 個分頁',
        status: '呢個群組有 2 個分頁。',
      },
    ]

    for (const testCase of cases) {
      const variables = {
        name: 'Work',
        count: String(testCase.count),
      }
      assert.equal(
        translate(
          tabGroupMembersButtonKey(testCase.count),
          testCase.language,
          variables
        ),
        testCase.button
      )
      assert.equal(
        translate(
          tabGroupMembersCountKey(testCase.count),
          testCase.language,
          variables
        ),
        testCase.status
      )
    }
  })

  it('uses singular copy in the real accessible name and dropdown status', async () => {
    const alpha = new Repository('/work/alpha', 1, null, false)
    const beta = new Repository('/work/beta', 2, null, false)
    const written = new Array<IProfileTabsState>()
    const store = await createStore(
      [makeTab('alpha', alpha), makeTab('beta', beta)],
      'beta',
      written
    )
    await store.createTabGroup('Work', 'purple', ['alpha'])
    await store.setTabGroupCollapsed(store.getGroups()[0].id, true)
    renderStrip(store, [alpha, beta], [])

    const trigger = await screen.findByRole('button', {
      name: 'Show the 1 tab in Work',
    })
    fireEvent.click(trigger)
    assert.ok(await screen.findByText('1 tab in this group.'))

    localStorage.setItem('language-mode-v1', 'cantonese')
    fireEvent(
      document,
      new CustomEvent(LanguageModeChangedEvent, { detail: 'cantonese' })
    )
    assert.ok(
      await screen.findByRole('button', {
        name: '打開「Work」入面 1 個分頁',
      })
    )
    assert.ok(await screen.findByText('呢個群組有 1 個分頁。'))
  })

  it('lists every member of a collapsed group and switches in one action', async () => {
    const { store, selected } = await buildHarness()
    const groupId = store.getGroups()[0].id
    await store.setTabGroupCollapsed(groupId, true)

    // A collapsed group hides its tabs from the strip entirely.
    await waitFor(() =>
      assert.equal(
        screen.queryByRole('tab', { name: 'alpha, Work group' }),
        null
      )
    )

    const trigger = screen.getByRole('button', {
      name: 'Show the 2 tabs in Work',
    })
    assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox')
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')

    fireEvent.click(trigger)

    await waitFor(() =>
      assert.ok(screen.getByRole('listbox', { name: 'Tabs in this group' }))
    )
    assert.equal(trigger.getAttribute('aria-expanded'), 'true')

    // Both members are listed even though neither is in the strip.
    const options = screen.getAllByRole('option')
    assert.deepEqual(
      options.map(option => option.getAttribute('aria-label')),
      ['alpha', 'beta']
    )
    assert.match(
      screen.getByText(/2 tabs in this group\./).textContent ?? '',
      /2 tabs in this group\./
    )

    // One press switches to a member: the repository is selected, the tab is
    // activated, and the dropdown closes — no second confirmation step.
    fireEvent.click(options[1])

    await waitFor(() => assert.equal(store.getState().activeTabId, 'beta'))
    assert.deepEqual(selected, ['beta'])
    await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  })

  it('navigates members with the keyboard and activates the highlighted one', async () => {
    const { store, selected } = await buildHarness()
    const groupId = store.getGroups()[0].id
    await store.setTabGroupCollapsed(groupId, true)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 tabs in Work' })
    )

    const list = await screen.findByRole('listbox', {
      name: 'Tabs in this group',
    })
    // The active tab is outside this group, so the first member is highlighted.
    assert.equal(
      screen.getAllByRole('option')[0].getAttribute('aria-selected'),
      'true'
    )

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    await waitFor(() =>
      assert.equal(
        screen.getAllByRole('option')[1].getAttribute('aria-selected'),
        'true'
      )
    )
    assert.equal(
      list.getAttribute('aria-activedescendant'),
      'tab-group-member-1'
    )

    fireEvent.keyDown(list, { key: 'Home' })
    await waitFor(() =>
      assert.equal(
        screen.getAllByRole('option')[0].getAttribute('aria-selected'),
        'true'
      )
    )

    fireEvent.keyDown(list, { key: 'Enter' })
    await waitFor(() => assert.equal(store.getState().activeTabId, 'alpha'))
    assert.deepEqual(selected, ['alpha'])
  })

  it('deletes the group from the dropdown without closing a single tab', async () => {
    const { store } = await buildHarness()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 tabs in Work' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete group “Work”' })
    )

    await waitFor(() => assert.equal(store.getGroups().length, 0))
    // Every tab is still open and still bound to its repository.
    assert.deepEqual(
      store.getState().tabs.map(tab => tab.id),
      ['alpha', 'beta', 'gamma']
    )
    assert.equal(
      store.getState().tabs.every(tab => (tab.groupId ?? null) === null),
      true
    )
    await waitFor(() =>
      assert.match(
        screen
          .getAllByRole('status')
          .map(status => status.textContent ?? '')
          .join(' '),
        /Work group deleted\. Its tabs stayed open\./
      )
    )
  })

  it('states that deleting keeps every tab, in bilingual mode', async () => {
    localStorage.setItem('language-mode-v1', 'bilingual')
    await buildHarness()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 tabs in Work' })
    )

    await waitFor(() =>
      assert.ok(
        screen.getByText(
          'Deleting the group clears the label only; every tab stays open. · 刪除群組只係甩個標籤，每個分頁都會繼續開住。'
        )
      )
    )
    assert.ok(
      screen.getByRole('heading', {
        name: 'Tabs in “Work” · 「Work」入面嘅分頁',
      })
    )
    // The accessible name stays single-language so it is announced once.
    assert.ok(screen.getByRole('listbox', { name: 'Tabs in this group' }))
  })
})

describe('tab group edit dialog', () => {
  it('renames and recolors a group, persisting both without touching membership', async () => {
    const alpha = new Repository('/work/alpha', 1, null, false)
    const beta = new Repository('/work/beta', 2, null, false)
    const written = new Array<IProfileTabsState>()
    const store = await createStore(
      [makeTab('alpha', alpha), makeTab('beta', beta)],
      'alpha',
      written
    )
    await store.createTabGroup('Work', 'purple', ['alpha', 'beta'])
    renderStrip(store, [alpha, beta], [])

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 tabs in Work' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit group “Work”…' })
    )

    const dialog = await waitFor(() => {
      const element = document.querySelector('dialog#edit-tab-group')
      assert.notEqual(element, null)
      return element as HTMLDialogElement
    })
    // jsdom does not implement HTMLDialogElement.show(); expose it the way
    // Chromium does after Dialog.componentDidMount.
    dialog.setAttribute('open', '')

    assert.ok(screen.getByRole('dialog', { name: 'Edit tab group' }))
    assert.ok(
      screen.getByText(
        'Rename or recolor “Work”. Its 2 tabs stay open and stay in the group.'
      )
    )

    const nameInput = screen.getByRole('textbox', { name: 'Group name' })
    assert.equal((nameInput as HTMLInputElement).value, 'Work')
    fireEvent.change(nameInput, { target: { value: '  Client work  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Green group color' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }))

    await waitFor(() => {
      const group = store.getGroups()[0]
      assert.equal(group.name, 'Client work')
      assert.equal(group.color, 'green')
    })
    // Membership, order and openness are untouched by a label edit.
    assert.deepEqual(
      store.getState().tabs.map(tab => [tab.id, tab.groupId]),
      [
        ['alpha', store.getGroups()[0].id],
        ['beta', store.getGroups()[0].id],
      ]
    )
    // The edit reached the profile store, which is what survives a restart.
    const last = written[written.length - 1]
    assert.equal(last.groups?.[0].name, 'Client work')
    assert.equal(last.groups?.[0].color, 'green')

    await waitFor(() =>
      assert.match(
        screen
          .getAllByRole('status')
          .map(status => status.textContent ?? '')
          .join(' '),
        /Client work group updated\./
      )
    )
  })

  it('keeps the edit dialog usable in Cantonese and refuses a blank name', () => {
    localStorage.setItem('language-mode-v1', 'cantonese')
    let saved: { readonly name: string; readonly color: string } | null = null
    render(
      <EditTabGroupDialog
        group={{ id: 'g1', name: '工作', color: 'red' }}
        memberCount={3}
        onSave={(name, color) => (saved = { name, color })}
        onDismissed={() => undefined}
      />
    )

    const dialog = document.querySelector('dialog#edit-tab-group')
    assert.notEqual(dialog, null)
    dialog!.setAttribute('open', '')

    assert.ok(screen.getByRole('dialog', { name: '編輯分頁群組' }))
    assert.ok(
      screen.getByText(
        '改「工作」個名或者顏色。入面 3 個分頁照樣開住，亦都留喺呢個群組。'
      )
    )
    const save = screen.getByRole('button', { name: '儲存群組' })
    const nameInput = screen.getByRole('textbox', { name: '群組名' })

    // The shared Button models its disabled state with aria-disabled so the
    // control stays focusable and its reason stays announceable.
    fireEvent.change(nameInput, { target: { value: '   ' } })
    assert.equal(save.getAttribute('aria-disabled'), 'true')

    fireEvent.change(nameInput, { target: { value: ' 團隊 ' } })
    fireEvent.click(screen.getByRole('button', { name: '紫色群組顏色' }))
    fireEvent.click(save)
    assert.deepEqual(saved, { name: '團隊', color: 'purple' })

    localStorage.setItem('language-mode-v1', 'english')
    fireEvent(
      document,
      new CustomEvent(LanguageModeChangedEvent, { detail: 'english' })
    )
    assert.ok(screen.getByRole('dialog', { name: 'Edit tab group' }))
  })
})

/**
 * Regression cover for #92: both group dialogs used to render inline in the
 * strip's own JSX. `Dialog` always carries the `tooltip-host` class, and
 * `.tooltip-host { position: relative }` overrides the UA `position: absolute`
 * every `<dialog>` starts with, so an inline dialog is laid out as an in-flow
 * flex item of the strip with `z-index: auto` — stretching the strip around it
 * and painting underneath the app bar's positioned Fetch origin / Commit &
 * push / Build & run pills, which come later in the document. Only
 * `#dialog-layer dialog[open]` (in _dialog-layer.scss) puts a dialog back out
 * of flow and onto the popup layer, so membership of that layer *is* the
 * stacking contract.
 */
describe('tab group dialog stacking', () => {
  it('portals the new group dialog into the dialog layer, out of the tab strip', async () => {
    await buildHarness()

    fireEvent.contextMenu(await screen.findByRole('tab', { name: 'gamma' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Add tab to new group…' })
    )

    const dialog = await waitFor(() => {
      const element = document.querySelector('dialog#create-tab-group')
      assert.notEqual(element, null)
      return element as HTMLDialogElement
    })

    assert.notEqual(dialog.closest('#dialog-layer'), null)
    assert.equal(document.querySelector('.repository-tab-strip dialog'), null)
    // The non-destructive guarantee stays stated in the product, not only in a
    // changelog, however the dialog is laid out.
    assert.ok(
      screen.getByText(
        '“gamma” becomes the first tab in this group. Grouping only organizes the strip; it never closes a tab.'
      )
    )
  })

  it('portals the edit group dialog into the dialog layer, out of the tab strip', async () => {
    await buildHarness()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 tabs in Work' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit group “Work”…' })
    )

    const dialog = await waitFor(() => {
      const element = document.querySelector('dialog#edit-tab-group')
      assert.notEqual(element, null)
      return element as HTMLDialogElement
    })

    assert.notEqual(dialog.closest('#dialog-layer'), null)
    assert.equal(document.querySelector('.repository-tab-strip dialog'), null)
  })
})
