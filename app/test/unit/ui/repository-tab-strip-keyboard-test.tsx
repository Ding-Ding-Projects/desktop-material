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
import { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen } from '../../helpers/ui/render'

let previousIpcSend: typeof ipcRenderer.send

beforeEach(() => {
  previousIpcSend = ipcRenderer.send
  ipcRenderer.send = () => undefined
})

afterEach(() => {
  ipcRenderer.send = previousIpcSend
  localStorage.removeItem('language-mode-v1')
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

async function createStore(
  tabs: ReadonlyArray<IRepositoryTab>,
  activeTabId: string
): Promise<RepositoryTabsStore> {
  const initial: IProfileTabsState = { tabs, activeTabId }
  const profileStore = {
    readTabs: () => Promise.resolve(initial),
    writeTabs: () => Promise.resolve(),
  } as unknown as ProfileStore
  const store = new RepositoryTabsStore(profileStore, 'primary', Date.now)
  await store.initialize()
  return store
}

/** Four repositories named so the tab order reads straight off the labels. */
const repositories = ['alpha', 'beta', 'gamma', 'delta'].map(
  (name, index) => new Repository(`/work/${name}`, index + 1, null, false)
)

async function renderStrip(activeTabId: string) {
  const store = await createStore(
    repositories.map(repository => makeTab(repository.name, repository)),
    activeTabId
  )
  const dispatcher = {
    selectRepository: () => undefined,
    showFoldout: () => undefined,
    setNotificationCentreOpen: () => undefined,
  } as unknown as Dispatcher
  const repositoryStateManager = {
    get: () => {
      throw new Error('status cache should not be read by keyboard navigation')
    },
  } as unknown as RepositoryStateCache

  render(
    <RepositoryTabStrip
      tabsStore={store}
      repositories={repositories}
      dispatcher={dispatcher}
      repositoryStateManager={repositoryStateManager}
      unreadNotificationCount={0}
      isNotificationCentreOpen={false}
    />
  )

  return store
}

const tabNamed = (name: string) => screen.getByRole('tab', { name })

describe('RepositoryTabStrip keyboard navigation', () => {
  it('roves focus with the arrow keys and wraps at both ends', async () => {
    await renderStrip('gamma')

    // The tabs carry tabIndex={isActive ? 0 : -1}, so this is where the Tab
    // key drops a keyboard user; every other tab has to be reachable by arrow.
    const gamma = tabNamed('gamma')
    gamma.focus()
    assert.equal(document.activeElement, gamma)

    fireEvent.keyDown(gamma, { key: 'ArrowRight' })
    assert.equal(document.activeElement, tabNamed('delta'))

    fireEvent.keyDown(tabNamed('delta'), { key: 'ArrowRight' })
    assert.equal(document.activeElement, tabNamed('alpha'))

    fireEvent.keyDown(tabNamed('alpha'), { key: 'ArrowLeft' })
    assert.equal(document.activeElement, tabNamed('delta'))

    fireEvent.keyDown(tabNamed('delta'), { key: 'ArrowLeft' })
    assert.equal(document.activeElement, tabNamed('gamma'))
  })

  it('jumps to the first and last tab with Home and End', async () => {
    await renderStrip('beta')

    const beta = tabNamed('beta')
    beta.focus()

    fireEvent.keyDown(beta, { key: 'End' })
    assert.equal(document.activeElement, tabNamed('delta'))

    fireEvent.keyDown(tabNamed('delta'), { key: 'Home' })
    assert.equal(document.activeElement, tabNamed('alpha'))
  })

  it('activates the focused tab with Enter and Space', async () => {
    const store = await renderStrip('alpha')

    const alpha = tabNamed('alpha')
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' })
    assert.equal(store.getState().activeTabId, 'beta')

    fireEvent.keyDown(tabNamed('beta'), { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: ' ' })
    assert.equal(store.getState().activeTabId, 'gamma')
  })

  it('leaves keys it does not own to the tab itself', async () => {
    await renderStrip('alpha')

    const alpha = tabNamed('alpha')
    alpha.focus()
    assert.equal(
      fireEvent.keyDown(alpha, { key: 'ArrowDown' }),
      true,
      'an unhandled key keeps its default behavior'
    )
    assert.equal(document.activeElement, alpha)
  })
})

describe('RepositoryTabStrip tablist structure', () => {
  it('scopes the tablist to the row that owns the tabs', async () => {
    await renderStrip('alpha')

    const tablist = screen.getByRole('tablist', { name: 'Repository tabs' })
    assert.equal(tablist.classList.contains('repository-tab-list'), true)

    // The strip also holds the search/arrange/new controls, the trailing
    // cluster and the live region, so it must not be the tablist itself.
    const strip = document.querySelector<HTMLElement>('.repository-tab-strip')
    assert.ok(strip !== null)
    assert.equal(strip.getAttribute('role'), null)
    assert.equal(strip.contains(tablist), true)

    const tabs = screen.getAllByRole('tab')
    assert.equal(tabs.length, 4)
    for (const tab of tabs) {
      assert.equal(tablist.contains(tab), true)
    }

    // Nothing but tabs (and the presentational group clusters) may sit inside.
    for (const child of Array.from(tablist.children)) {
      assert.ok(
        child.getAttribute('role') === 'tab' ||
          child.getAttribute('role') === 'presentation',
        `${child.className} should not be a child of the tablist`
      )
    }

    for (const name of [
      'Search tabs',
      'Arrange tabs',
      'Open a repository in a new tab',
    ]) {
      assert.equal(
        tablist.contains(screen.getByRole('button', { name })),
        false,
        `${name} is not a tab`
      )
    }
    assert.equal(tablist.querySelector('[role="status"]'), null)
  })
})
