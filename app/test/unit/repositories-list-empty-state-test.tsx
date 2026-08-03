import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { RepositoriesList } from '../../src/ui/repositories-list'
import { fireEvent, render } from '../helpers/ui/render'

// Only the props the empty list actually reads are meaningful here; the rest
// exist because the component requires them.
function renderList(overrides: Record<string, unknown> = {}) {
  const noop = () => undefined
  const props = {
    selectedRepository: null,
    repositories: [],
    recentRepositories: [],
    showRecentRepositories: false,
    showBranchNameInRepoList: 'never',
    localRepositoryStateLookup: new Map(),
    onSelectionChanged: noop,
    askForConfirmationOnRemoveRepository: false,
    onRemoveRepository: noop,
    onShowRepository: noop,
    onViewOnGitHub: noop,
    onOpenInNewWindow: noop,
    onOpenInShell: noop,
    onOpenInExternalEditor: noop,
    onFilterTextChanged: noop,
    filterText: '',
    dispatcher: { showPopup: () => undefined },
    ...overrides,
  }

  return render(<RepositoriesList {...(props as any)} />)
}

describe('RepositoriesList empty state', () => {
  it('says the list is empty rather than blaming a search nobody ran', () => {
    const view = renderList()

    // The failing behaviour this guards: a user with no repositories was told
    // "Sorry, I can't find that repository" about a repository they never
    // asked for.
    assert.equal(view.queryByText(/can't find that repository/), null)
    assert.ok(view.getByText('No repositories yet'))
  })

  it('offers the three real creation paths, not a description of them', () => {
    const view = renderList()

    for (const name of [
      'Clone repository',
      'Add local repository',
      'Create new repository',
    ]) {
      assert.ok(
        view.getByRole('button', { name }),
        `${name} should be an operable button`
      )
    }
  })

  it('actually dispatches when an empty-state action is used', () => {
    const shown: Array<string> = []
    const view = renderList({
      dispatcher: {
        showPopup: (popup: { type: string }) => shown.push(popup.type),
      },
    })

    fireEvent.click(view.getByRole('button', { name: 'Add local repository' }))
    fireEvent.click(view.getByRole('button', { name: 'Create new repository' }))

    assert.equal(shown.length, 2, 'both buttons should reach the dispatcher')
  })
})
