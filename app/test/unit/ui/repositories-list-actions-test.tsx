import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { PopupType } from '../../../src/models/popup'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

class TestResizeObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})
Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})

const localRepository = new Repository('/work/local-repo', 1, null, false)

afterEach(() => {
  for (const backdrop of document.querySelectorAll<HTMLElement>(
    '.material-context-menu-backdrop'
  )) {
    fireEvent.mouseDown(backdrop)
  }
})

function createProps(showPopup: (popup: { type: PopupType }) => void) {
  const dispatcher = {
    closeFoldout: () => undefined,
    recordRepoClicked: () => undefined,
    showPopup,
  } as unknown as Dispatcher

  return {
    selectedRepository: null,
    repositories: [localRepository],
    recentRepositories: [],
    showRecentRepositories: true,
    showBranchNameInRepoList: ShowBranchNameInRepoListSetting.Never,
    localRepositoryStateLookup: new Map(),
    onSelectionChanged: () => undefined,
    askForConfirmationOnRemoveRepository: false,
    onRemoveRepository: () => undefined,
    onShowRepository: () => undefined,
    onViewOnGitHub: () => undefined,
    onOpenInNewWindow: () => undefined,
    onOpenInShell: () => undefined,
    onOpenInExternalEditor: () => undefined,
    onFilterTextChanged: () => undefined,
    filterText: '',
    dispatcher,
    accounts: [],
  }
}

describe('RepositoriesList batch actions', () => {
  it('keeps the frequent actions in one compact, accessible row', () => {
    render(<RepositoriesList {...createProps(() => {})} />)

    assert.ok(screen.getByRole('button', { name: 'Add a repository' }))
    assert.ok(
      screen.getByRole('button', { name: 'Select multiple repositories' })
    )
    assert.ok(screen.getByRole('button', { name: 'More repository actions' }))
    assert.equal(
      screen.queryByRole('button', { name: /Sync repositories/ }),
      null
    )
    assert.equal(
      screen.queryByRole('button', { name: /Commit & push all/ }),
      null
    )
  })

  it('keeps group, sync, and commit/push available in the More menu', async () => {
    const popups: Array<{ type: PopupType }> = []
    render(<RepositoriesList {...createProps(popup => popups.push(popup))} />)

    const more = screen.getByRole('button', {
      name: 'More repository actions',
    })
    assert.equal(more.getAttribute('aria-haspopup'), 'menu')
    fireEvent.click(more)

    await waitFor(() =>
      assert.ok(
        screen.getByRole('menuitem', { name: 'Create a repository group' })
      )
    )
    assert.ok(screen.getByRole('menuitem', { name: 'Sync repositories' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Commit & push all' }))

    await waitFor(() => assert.equal(popups.length, 1))
    assert.equal(popups[0].type, PopupType.CommitAndPushAll)
  })
})
