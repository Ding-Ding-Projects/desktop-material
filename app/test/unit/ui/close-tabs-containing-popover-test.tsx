import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { ProfileStore } from '../../../src/lib/stores/profile-store'
import { RepositoryTabsStore } from '../../../src/lib/stores/repository-tabs-store'
import {
  IProfileTabsState,
  IRepositoryTab,
} from '../../../src/models/repository-tab'
import {
  CloseTabsContainingPopover,
  CloseTabsExceptContainingPopover,
} from '../../../src/ui/repository-tabs/close-tabs-containing-popover'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const FilterModeKey = 'filter-mode/close-tabs-containing'
const CaseSensitiveKey = 'filter-case/close-tabs-containing'

beforeEach(() => {
  localStorage.removeItem(FilterModeKey)
  localStorage.removeItem(CaseSensitiveKey)
})

afterEach(() => {
  localStorage.removeItem(FilterModeKey)
  localStorage.removeItem(CaseSensitiveKey)
})

function makeTab(id: string, repositoryPath: string): IRepositoryTab {
  return {
    id,
    repositoryId: Number(id.replace(/\D/g, '')) || 1,
    repositoryPath,
    customLabel: null,
    titleStyle: null,
  }
}

async function createStore(
  tabs: ReadonlyArray<IRepositoryTab>
): Promise<RepositoryTabsStore> {
  const initial: IProfileTabsState = {
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  }
  const profileStore = {
    readTabs: () => Promise.resolve(initial),
    writeTabs: () => Promise.resolve(),
  } as unknown as ProfileStore
  const store = new RepositoryTabsStore(profileStore, 'primary')
  await store.initialize()
  return store
}

function statusText(): string {
  return screen.getByRole('status').textContent ?? ''
}

describe('bulk tab close parity', () => {
  it('keeps exactly the tabs the forward action would close', async () => {
    // The tab strip searches repository aliases as well as folder names, so a
    // repository cloned into `wf` is found by typing its `work-frontend`
    // alias. Both directions have to see that alias, or "close containing"
    // matches nothing while "close all except containing" keeps that very tab.
    const store = await createStore([
      makeTab('1', '/src/wf'),
      makeTab('2', '/src/api'),
    ])
    const aliases = (tab: IRepositoryTab) =>
      tab.id === '1' ? ['work-frontend'] : []

    const forward = render(
      <CloseTabsContainingPopover
        tabsStore={store}
        anchor={null}
        resolveAdditionalKeys={aliases}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Close tabs containing' }),
      { target: { value: 'work' } }
    )
    assert.match(statusText(), /1 close, 0 pinned protected/)
    assert.ok(screen.getByRole('button', { name: 'Close 1' }))
    forward.unmount()

    render(
      <CloseTabsExceptContainingPopover
        tabsStore={store}
        anchor={null}
        resolveAdditionalKeys={aliases}
        resolveLabel={tab => tab.repositoryPath}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(screen.getByLabelText('Text to keep'), {
      target: { value: 'work' },
    })
    // The same phrase, the same single tab: the inverse keeps `wf` and closes
    // the one tab the forward action would have left open.
    assert.match(statusText(), /1 kept, 1 closed/)
    assert.ok(screen.getByRole('button', { name: 'Close 1' }))
  })

  it('inverts the forward action under a stored regex mode', async () => {
    localStorage.setItem(FilterModeKey, 'regex')
    const store = await createStore([
      makeTab('1', '/src/alpha-one'),
      makeTab('2', '/src/beta'),
    ])

    const forward = render(
      <CloseTabsContainingPopover
        tabsStore={store}
        anchor={null}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Close tabs containing' }),
      { target: { value: 'alpha.*one' } }
    )
    assert.match(statusText(), /1 close, 0 pinned protected/)
    forward.unmount()

    render(
      <CloseTabsExceptContainingPopover
        tabsStore={store}
        anchor={null}
        resolveAdditionalKeys={() => []}
        resolveLabel={tab => tab.repositoryPath}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(screen.getByLabelText('Text to keep'), {
      target: { value: 'alpha.*one' },
    })
    // A literal reading of this pattern matches nothing, which used to make
    // the inverse action report "No tabs match" for a phrase its own forward
    // action matched.
    assert.match(statusText(), /1 kept, 1 closed/)
  })
})

describe('CloseTabsContainingPopover guards', () => {
  it('refuses a whitespace-only query in the count as well as the handler', async () => {
    const store = await createStore([
      makeTab('1', '/src/my repo'),
      makeTab('2', '/src/other repo'),
    ])

    render(
      <CloseTabsContainingPopover
        tabsStore={store}
        anchor={null}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Close tabs containing' })
    fireEvent.change(input, { target: { value: ' ' } })

    // Both paths contain a space. The button used to offer "Close 2" while the
    // confirm handler silently refused the same query.
    assert.equal(statusText(), 'Type to preview matches.')
    const confirm = screen.getByRole('button', { name: 'Close' })
    assert.equal(confirm.hasAttribute('disabled'), true)

    fireEvent.keyDown(input, { key: 'Enter' })
    assert.equal(store.getState().tabs.length, 2)
  })

  it('opens in substring mode rather than fuzzy on a destructive surface', async () => {
    const store = await createStore([
      makeTab('1', '/Documents/desktop-material'),
      makeTab('2', '/src/dm-tools'),
    ])

    render(
      <CloseTabsContainingPopover
        tabsStore={store}
        anchor={null}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    assert.ok(
      screen.getByRole('button', {
        name: 'Filter mode: Substring (click to change)',
      })
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Close tabs containing' }),
      { target: { value: 'dm' } }
    )
    // Fuzzily, `dm` also picks the d out of Documents and the m out of
    // material and offers to close both tabs.
    assert.match(statusText(), /1 close, 0 pinned protected/)
  })
})
