import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'

import { Repository } from '../../../src/models/repository'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { Popup, PopupType } from '../../../src/models/popup'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { ManageRepositoryGroupDialog } from '../../../src/ui/repository-groups/manage-repository-group-dialog'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

class TestResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 365,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 600,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 365,
            height: 600,
            top: 0,
            right: 365,
            bottom: 600,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this as unknown as ResizeObserver
    )
  }
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

/** A local repository carrying an optional custom group label. */
function repo(path: string, id: number, groupName: string | null): Repository {
  return new Repository(
    path,
    id,
    null,
    false,
    null,
    undefined,
    false,
    undefined,
    null,
    undefined,
    groupName
  )
}

const alpha = repo('/work/alpha', 1, 'Work')
const beta = repo('/work/beta', 2, 'Work')
const gamma = repo('/work/gamma', 3, null)

/** Every group-name write a test performed, in order. */
let groupWrites: Array<[string, string | null]> = []
let shownPopups: Array<Popup> = []

const dispatcher = {
  closeFoldout: () => undefined,
  recordRepoClicked: () => undefined,
  recordRepositoryGroupCollapseChange: () => undefined,
  showPopup: (popup: Popup) => {
    shownPopups.push(popup)
  },
  changeRepositoryGroupName: (
    repository: Repository,
    groupName: string | null
  ) => {
    groupWrites.push([repository.name, groupName])
    return Promise.resolve()
  },
} as unknown as Dispatcher

const listProps = {
  selectedRepository: null,
  repositories: [alpha, beta, gamma],
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
  accounts: [],
  dispatcher,
}

/** Repository names the virtualized list currently holds. */
const renderedRowNames = () =>
  Array.from(
    document.querySelectorAll(
      '.repository-list-item [data-context-menu-owner="repository-list-name-appearance"]'
    )
  ).map(element => element.textContent?.trim() ?? '')

function dismissContextMenu() {
  for (const backdrop of document.querySelectorAll<HTMLElement>(
    '.material-context-menu-backdrop'
  )) {
    fireEvent.mouseDown(backdrop)
  }
}

let previousIpcSend: typeof ipcRenderer.send

beforeEach(() => {
  previousIpcSend = ipcRenderer.send
  ipcRenderer.send = () => undefined
  localStorage.clear()
  groupWrites = []
  shownPopups = []
})

afterEach(() => {
  dismissContextMenu()
  ipcRenderer.send = previousIpcSend
  localStorage.removeItem('language-mode-v1')
})

describe('RepositoriesList custom group actions', () => {
  it('offers group actions on a custom group header and nowhere else', async () => {
    render(<RepositoriesList {...listProps} />)

    await waitFor(() => assert.ok(screen.getByText('alpha')))

    // The user-created group gets an actions button…
    assert.ok(screen.getByRole('button', { name: 'Group actions for Work' }))
    // …while the derived "Other" group, which describes a fact rather than a
    // user's choice, has nothing to manage.
    assert.equal(
      screen.queryByRole('button', { name: 'Group actions for Other' }),
      null
    )
  })

  it('opens the group menu from the keyboard and edits through the dialog popup', async () => {
    render(<RepositoriesList {...listProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    const actions = screen.getByRole('button', {
      name: 'Group actions for Work',
    })
    assert.equal(actions.getAttribute('aria-haspopup'), 'menu')
    actions.focus()
    fireEvent.keyDown(actions, { key: 'Enter' })

    await waitFor(() =>
      assert.ok(screen.getByRole('menuitem', { name: 'Edit group…' }))
    )
    assert.ok(screen.getByRole('menuitem', { name: 'Remove group' }))

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit group…' }))

    await waitFor(() =>
      assert.deepEqual(shownPopups, [
        { type: PopupType.ManageRepositoryGroup, groupName: 'Work' },
      ])
    )
  })

  it('removes a group by clearing labels, keeping every repository listed', async () => {
    render(<RepositoriesList {...listProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    const before = renderedRowNames()
    assert.ok(before.includes('alpha'))
    assert.ok(before.includes('beta'))
    assert.ok(before.includes('gamma'))

    fireEvent.click(
      screen.getByRole('button', { name: 'Group actions for Work' })
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Remove group' })
    )

    // Every write is a label clear; no removal call exists on this path.
    await waitFor(() =>
      assert.deepEqual(groupWrites, [
        ['alpha', null],
        ['beta', null],
      ])
    )
    // The list still holds all three repositories — the props never changed,
    // and nothing in the removal path can drop a row.
    assert.deepEqual(renderedRowNames(), before)

    await waitFor(() =>
      assert.match(
        screen
          .getAllByRole('status')
          .map(status => status.textContent ?? '')
          .join(' '),
        /Removed the Work group\. Its 2 repositories stayed in the list\./
      )
    )
  })

  it('opens the create dialog from the list toolbar', async () => {
    render(<RepositoriesList {...listProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    fireEvent.click(
      screen.getByRole('button', { name: 'More repository actions' })
    )
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Create a repository group',
      })
    )

    await waitFor(() =>
      assert.deepEqual(shownPopups, [
        { type: PopupType.ManageRepositoryGroup, groupName: null },
      ])
    )
  })
})

function renderDialog(groupName: string | null) {
  const dismissed = { count: 0 }
  render(
    <ManageRepositoryGroupDialog
      dispatcher={dispatcher}
      repositories={[alpha, beta, gamma]}
      groupName={groupName}
      onDismissed={() => dismissed.count++}
    />
  )
  // jsdom does not implement HTMLDialogElement.show(); expose the dialog the
  // way Chromium does after Dialog.componentDidMount.
  const dialog = document.querySelector('dialog#manage-repository-group')
  assert.notEqual(dialog, null)
  dialog!.setAttribute('open', '')
  return dismissed
}

describe('ManageRepositoryGroupDialog', () => {
  it('creates a group from the repositories the user ticks', async () => {
    const dismissed = renderDialog(null)

    assert.ok(screen.getByRole('dialog', { name: 'New repository group' }))
    // Nothing is preselected for a brand new group.
    const checkboxes = screen.getAllByRole('checkbox')
    assert.equal(
      checkboxes.every(box => (box as HTMLInputElement).checked),
      false
    )
    assert.ok(screen.getByText('0 of 3 repositories chosen.'))

    fireEvent.change(screen.getByRole('textbox', { name: 'Group name' }), {
      target: { value: '  Client work  ' },
    })
    fireEvent.click(checkboxes[2])
    await waitFor(() =>
      assert.ok(screen.getByText('1 of 3 repositories chosen.'))
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    await waitFor(() =>
      assert.deepEqual(groupWrites, [['gamma', 'Client work']])
    )
    assert.equal(dismissed.count, 1)
  })

  it('preselects the members of the group being edited and renames them', async () => {
    renderDialog('Work')

    assert.ok(screen.getByRole('dialog', { name: 'Edit repository group' }))
    assert.ok(
      screen.getByText(
        'Rename “Work” or change which repositories it holds. It currently holds 2 repositories.'
      )
    )
    assert.ok(screen.getByText('2 of 3 repositories chosen.'))

    fireEvent.change(screen.getByRole('textbox', { name: 'Group name' }), {
      target: { value: 'Client work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }))

    await waitFor(() =>
      assert.deepEqual(groupWrites, [
        ['alpha', 'Client work'],
        ['beta', 'Client work'],
      ])
    )
  })

  it('drops a member by clearing only that repository label', async () => {
    renderDialog('Work')

    const alphaBox = screen.getAllByRole('checkbox')[0]
    assert.equal((alphaBox as HTMLInputElement).checked, true)
    fireEvent.click(alphaBox)

    fireEvent.click(screen.getByRole('button', { name: 'Save group' }))

    await waitFor(() => assert.deepEqual(groupWrites, [['alpha', null]]))
  })

  it('removes the group without removing a repository, and says so first', async () => {
    renderDialog('Work')

    assert.ok(
      screen.getByText(
        'Removing a group clears the group label only. Every repository stays in the list and nothing on disk is touched.'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove group' }))

    await waitFor(() =>
      assert.deepEqual(groupWrites, [
        ['alpha', null],
        ['beta', null],
      ])
    )
    // Only label clears — the dialog has no route to a repository removal.
    assert.equal(
      groupWrites.every(([, groupName]) => groupName === null),
      true
    )
  })

  it('filters the member picker without losing a ticked repository', async () => {
    renderDialog('Work')

    const search = screen.getByRole('searchbox', {
      name: 'Search repositories',
    })
    fireEvent.change(search, { target: { value: 'gamma' } })

    await waitFor(() => assert.equal(screen.getAllByRole('checkbox').length, 1))
    // The filter hides rows; it never un-ticks a repository behind the user's
    // back, so the count still reports both members of the group.
    assert.ok(screen.getByText('2 of 3 repositories chosen.'))

    fireEvent.change(search, { target: { value: 'nothing-matches-this' } })
    await waitFor(() =>
      assert.ok(screen.getByText('No repository matches that search.'))
    )
  })

  it('localizes the whole dialog and follows a live language change', () => {
    localStorage.setItem('language-mode-v1', 'cantonese')
    renderDialog('Work')

    assert.ok(screen.getByRole('dialog', { name: '編輯 repo 分組' }))
    assert.ok(screen.getByRole('button', { name: '儲存分組' }))
    assert.ok(screen.getByRole('button', { name: '移除分組' }))
    assert.ok(screen.getByText('3 個 repo 之中揀咗 2 個。'))

    localStorage.setItem('language-mode-v1', 'bilingual')
    fireEvent(
      document,
      new CustomEvent(LanguageModeChangedEvent, { detail: 'bilingual' })
    )

    assert.ok(
      screen.getByText(
        '2 of 3 repositories chosen. · 3 個 repo 之中揀咗 2 個。'
      )
    )
  })
})
