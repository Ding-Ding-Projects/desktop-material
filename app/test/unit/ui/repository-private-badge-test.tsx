import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const noMatches: IMatches = { title: [], subtitle: [] }

class TestResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 365,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 360,
    })
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, 365, 360),
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

function repository(isPrivate: boolean | null, id = 1) {
  const owner = new Owner('octocat', 'https://api.github.com', id)
  const remote = new GitHubRepository(`desktop-${id}`, owner, id, isPrivate)
  return new Repository(`/work/desktop-${id}`, id, remote, false)
}

function row(
  repo: Repository,
  languageMode: 'english' | 'cantonese' | 'bilingual'
) {
  return (
    <RepositoryListItem
      repository={repo}
      needsDisambiguation={false}
      matches={noMatches}
      aheadBehind={null}
      changedFilesCount={0}
      branchName={null}
      languageMode={languageMode}
    />
  )
}

describe('private repository badge', () => {
  it('renders a filled Material lock only for explicit private metadata', () => {
    const privateView = render(row(repository(true), 'english'))
    const badge = privateView.container.querySelector(
      '.repository-private-badge'
    )

    assert.notEqual(badge, null)
    assert.equal(badge?.getAttribute('role'), 'img')
    assert.equal(badge?.getAttribute('tabindex'), '0')
    assert.equal(badge?.getAttribute('aria-label'), 'Private repository')
    assert.equal(badge?.querySelector('.material-symbol')?.textContent, 'lock')

    privateView.unmount()
    const publicView = render(row(repository(false, 2), 'english'))
    assert.equal(
      publicView.container.querySelector('.repository-private-badge'),
      null
    )

    publicView.unmount()
    const unknownView = render(row(repository(null, 3), 'english'))
    assert.equal(
      unknownView.container.querySelector('.repository-private-badge'),
      null
    )
  })

  it('shows a bilingual tooltip from keyboard focus without widening the row', () => {
    enableTestTimers(['setTimeout'])
    try {
      const view = render(row(repository(true), 'bilingual'))
      const badge = view.container.querySelector<HTMLElement>(
        '.repository-private-badge'
      )
      assert.notEqual(badge, null)
      assert.equal(badge?.getAttribute('aria-label'), 'Private repository')

      if (badge === null) {
        throw new Error('Expected a private repository badge')
      }

      fireEvent.focus(badge)
      advanceTimersBy(400)

      assert.equal(
        screen.getByRole('tooltip', { hidden: true }).textContent,
        'Private repository · 私人 repo'
      )
      assert.equal(badge.textContent, 'lock')
    } finally {
      resetTestTimers()
    }
  })

  it('includes privacy in the canonical list-row accessible name', async () => {
    const privateRepository = repository(true)
    const dispatcher = {
      closeFoldout: () => undefined,
      recordRepoClicked: () => undefined,
      showPopup: () => undefined,
    } as unknown as Dispatcher

    render(
      <RepositoriesList
        selectedRepository={null}
        repositories={[privateRepository]}
        recentRepositories={[]}
        showRecentRepositories={true}
        showBranchNameInRepoList={ShowBranchNameInRepoListSetting.Never}
        localRepositoryStateLookup={new Map()}
        onSelectionChanged={() => undefined}
        askForConfirmationOnRemoveRepository={false}
        onRemoveRepository={() => undefined}
        onShowRepository={() => undefined}
        onViewOnGitHub={() => undefined}
        onOpenInNewWindow={() => undefined}
        onOpenInShell={() => undefined}
        onOpenInExternalEditor={() => undefined}
        onFilterTextChanged={() => undefined}
        filterText=""
        accounts={[]}
        dispatcher={dispatcher}
      />
    )

    await waitFor(() =>
      assert.ok(
        screen.getByRole('option', {
          name: /desktop-1, Private repository, .*octocat/,
        })
      )
    )
  })
})
