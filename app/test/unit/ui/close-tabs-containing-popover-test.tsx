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
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const FilterModeKey = 'filter-mode/close-tabs-containing'
const CaseSensitiveKey = 'filter-case/close-tabs-containing'

beforeEach(() => {
  localStorage.removeItem(FilterModeKey)
  localStorage.removeItem(CaseSensitiveKey)
  localStorage.removeItem('language-mode-v1')
})

afterEach(() => {
  localStorage.removeItem(FilterModeKey)
  localStorage.removeItem(CaseSensitiveKey)
  localStorage.removeItem('language-mode-v1')
})

function changeLanguageMode(
  languageMode: 'english' | 'cantonese' | 'bilingual'
) {
  localStorage.setItem('language-mode-v1', languageMode)
  fireEvent(
    document,
    new CustomEvent(LanguageModeChangedEvent, { detail: languageMode })
  )
}

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

describe('bulk tab close localization', () => {
  it('retranslates deferred save failures for both close directions', async () => {
    const forwardStore = await createStore([makeTab('1', '/src/alpha')])
    forwardStore.closeTabsMatching = async () => {
      throw new Error('write failed')
    }
    const forward = render(
      <CloseTabsContainingPopover
        tabsStore={forwardStore}
        anchor={null}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Close tabs containing' }),
      { target: { value: 'alpha' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close 1' }))
    await waitFor(() =>
      assert.equal(
        statusText(),
        'The change could not be saved. Review open tabs before trying again.'
      )
    )
    changeLanguageMode('cantonese')
    assert.equal(
      statusText(),
      '未能儲存今次改動。請先望清楚而家開住嘅分頁，再試一次。'
    )
    forward.unmount()

    const inverseStore = await createStore([
      makeTab('1', '/src/alpha'),
      makeTab('2', '/src/beta'),
    ])
    inverseStore.closeTabsExceptContaining = async () => {
      throw new Error('write failed')
    }
    render(
      <CloseTabsExceptContainingPopover
        tabsStore={inverseStore}
        anchor={null}
        resolveAdditionalKeys={() => []}
        resolveLabel={tab => tab.repositoryPath}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    fireEvent.change(screen.getByLabelText('要保留嘅文字'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: '閂 1 個' }))
    await waitFor(() =>
      assert.equal(
        statusText(),
        '未能儲存今次改動。請先望清楚而家開住嘅分頁，再試一次。'
      )
    )
    changeLanguageMode('english')
    assert.equal(
      statusText(),
      'The change could not be saved. Review open tabs before trying again.'
    )
  })

  it('frames invalid regex details in the selected language', async () => {
    localStorage.setItem(FilterModeKey, 'regex')
    changeLanguageMode('cantonese')
    const store = await createStore([
      makeTab('1', '/src/alpha'),
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
      screen.getByRole('textbox', { name: '閂咗含指定文字嘅分頁' }),
      {
        target: { value: '(' },
      }
    )
    assert.match(statusText(), /^安全 RE2 樣式無效或者唔支援：.+/)
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
    fireEvent.change(screen.getByLabelText('要保留嘅文字'), {
      target: { value: '(' },
    })
    assert.match(statusText(), /^安全 RE2 樣式無效或者唔支援：.+/)
  })

  it('updates both close directions live with localized counts and concise accessible names', async () => {
    changeLanguageMode('english')
    const store = await createStore([
      makeTab('1', '/src/alpha'),
      { ...makeTab('2', '/src/beta'), isPinned: true },
      makeTab('3', '/src/gamma'),
    ])

    const forward = render(
      <CloseTabsContainingPopover
        tabsStore={store}
        anchor={null}
        onClosed={() => undefined}
        onClose={() => undefined}
      />
    )
    const englishInput = screen.getByRole('textbox', {
      name: 'Close tabs containing',
    })
    fireEvent.change(englishInput, { target: { value: 'src' } })
    assert.equal(statusText(), '2 close, 1 pinned protected.')

    changeLanguageMode('cantonese')
    assert.ok(screen.getByRole('heading', { name: '閂咗含指定文字嘅分頁' }))
    assert.ok(screen.getByRole('textbox', { name: '閂咗含指定文字嘅分頁' }))
    assert.equal(statusText(), '2 個會閂，1 個置頂分頁受保護。')

    changeLanguageMode('bilingual')
    assert.ok(
      screen.getByText('Close tabs containing · 閂咗含指定文字嘅分頁', {
        exact: true,
      })
    )
    assert.ok(screen.getByRole('heading', { name: 'Close tabs containing' }))
    assert.equal(
      statusText(),
      '2 close, 1 pinned protected. · 2 個會閂，1 個置頂分頁受保護。'
    )
    forward.unmount()

    changeLanguageMode('cantonese')
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
    fireEvent.change(screen.getByLabelText('要保留嘅文字'), {
      target: { value: 'alpha' },
    })
    assert.equal(statusText(), '保留 2 個，閂 1 個，另有 1 個置頂分頁受保護。')
    assert.ok(screen.getByText('置頂，受保護'))
    assert.ok(screen.getByText('會閂'))
    assert.ok(screen.getByText('保留'))
  })
})
