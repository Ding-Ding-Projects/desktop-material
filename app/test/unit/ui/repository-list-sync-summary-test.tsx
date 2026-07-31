import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { IMatches } from '../../../src/lib/fuzzy-find'
import { CloningRepository } from '../../../src/models/cloning-repository'
import {
  ILocalRepositoryState,
  Repository,
  RepositoryUpstreamState,
} from '../../../src/models/repository'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { IAheadBehind } from '../../../src/models/branch'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

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
          contentRect: {
            x: 0,
            y: 0,
            width: 365,
            height: 360,
            top: 0,
            right: 365,
            bottom: 360,
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

function renderRow(
  repository: Repository | CloningRepository,
  upstreamState: RepositoryUpstreamState | undefined,
  aheadBehind: IAheadBehind | null
) {
  const view = render(
    <RepositoryListItem
      repository={repository}
      needsDisambiguation={false}
      matches={noMatches}
      aheadBehind={aheadBehind}
      upstreamState={upstreamState}
      syncFunnyLevels={{ english: 1, cantonese: 1 }}
      changedFilesCount={0}
      branchName={null}
    />
  )

  return view.container.querySelector('.repository-sync-summary')
}

const local = (id: number, missing = false) =>
  new Repository(`/work/repo-${id}`, id, null, missing)

describe('repository list sync summary row', () => {
  it('renders the exact ahead, behind, diverged, and in-sync text', () => {
    assert.equal(
      renderRow(local(1), 'tracking', { ahead: 2, behind: 0 })?.textContent,
      '2 commits to push, nothing to pull'
    )
    assert.equal(
      renderRow(local(2), 'tracking', { ahead: 0, behind: 3 })?.textContent,
      '3 commits to pull, nothing to push'
    )
    assert.equal(
      renderRow(local(3), 'tracking', { ahead: 4, behind: 5 })?.textContent,
      '4 commits to push, 5 commits to pull'
    )
    assert.equal(
      renderRow(local(4), 'tracking', { ahead: 0, behind: 0 })?.textContent,
      'In sync as of the last check'
    )
  })

  it('renders an unknown state — not zero, not in sync — when nothing has been checked', () => {
    // No cached state at all: exactly the situation a fabricated "0" would
    // misreport as "you are up to date".
    const neverChecked = renderRow(local(5), 'unknown', null)
    assert.equal(
      neverChecked?.textContent,
      'Sync state unknown, not checked yet'
    )
    assert.doesNotMatch(neverChecked?.textContent ?? '', /\d/)
    assert.doesNotMatch(neverChecked?.textContent ?? '', /in sync/i)

    // A row rendered without the prop at all falls back to the same honesty.
    assert.equal(
      renderRow(local(6), undefined, null)?.textContent,
      'Sync state unknown, not checked yet'
    )

    // A tracking branch whose counts were never recorded is unknown too.
    assert.equal(
      renderRow(local(7), 'tracking', null)?.textContent,
      'Sync state unknown, not checked yet'
    )
  })

  it('renders no-upstream, detached, empty, cloning, and missing rows without crashing', () => {
    assert.equal(
      renderRow(local(8), 'no-upstream', null)?.textContent,
      'No upstream branch'
    )
    assert.equal(
      renderRow(local(9), 'detached', null)?.textContent,
      'Detached HEAD, no branch to compare'
    )
    assert.equal(
      renderRow(local(10), 'unborn', null)?.textContent,
      'No commits yet'
    )
    assert.equal(
      renderRow(local(11, true), 'tracking', { ahead: 1, behind: 1 })
        ?.textContent,
      'Missing from disk, sync state unknown'
    )
    assert.equal(
      renderRow(
        new CloningRepository('/work/cloning', 'https://example.test/c.git'),
        undefined,
        null
      )?.textContent,
      'Cloning, sync state not known yet'
    )
  })

  it('keeps the repository name a separate element from the summary', () => {
    const view = render(
      <RepositoryListItem
        repository={local(12)}
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={{ ahead: 1, behind: 0 }}
        upstreamState="tracking"
        changedFilesCount={0}
        branchName={null}
      />
    )

    assert.equal(view.container.querySelector('.name')?.textContent, 'repo-12')
    assert.notEqual(
      view.container.querySelector(
        '.repository-list-item-text > .repository-sync-summary'
      ),
      null
    )
  })

  it('memoizes the derivation per row and per list rather than per keystroke', () => {
    const item = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'ui',
        'repositories-list',
        'repository-list-item.tsx'
      ),
      'utf8'
    )
    const list = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'ui',
        'repositories-list',
        'repositories-list.tsx'
      ),
      'utf8'
    )

    assert.match(item, /private readonly getSyncSummaryText = memoizeOne\(/)
    assert.match(list, /private getSyncAccessibleNames = memoizeOne\(/)
    // The filter text must not be an input to either memo, or every keystroke
    // would invalidate it.
    assert.doesNotMatch(
      list.slice(
        list.indexOf('private getSyncAccessibleNames = memoizeOne('),
        list.indexOf('private itemRefs')
      ),
      /filterText/
    )
  })
})

describe('repository list sync summary in the list', () => {
  const github = local(101)
  const behindRepo = local(102)
  const neverChecked = local(103)

  const lookup: ReadonlyMap<number, ILocalRepositoryState> = new Map([
    [
      github.id,
      {
        aheadBehind: { ahead: 2, behind: 0 },
        upstreamState: 'tracking' as const,
        changedFilesCount: 0,
        branchName: 'main',
        defaultBranchName: 'main',
      },
    ],
    [
      behindRepo.id,
      {
        aheadBehind: { ahead: 0, behind: 7 },
        upstreamState: 'tracking' as const,
        changedFilesCount: 0,
        branchName: 'main',
        defaultBranchName: 'main',
      },
    ],
  ])

  let touched: string[] = []
  let fetchCalls = 0
  let originalFetch: typeof globalThis.fetch | undefined

  const dispatcher = new Proxy(
    {
      closeFoldout: () => undefined,
      recordRepoClicked: () => undefined,
      showPopup: () => undefined,
    } as unknown as Record<string, unknown>,
    {
      get(target, property) {
        if (typeof property === 'string') {
          touched.push(property)
        }
        return target[property as string]
      },
    }
  ) as unknown as Dispatcher

  const commonProps = {
    selectedRepository: null,
    repositories: [github, behindRepo, neverChecked],
    recentRepositories: [],
    showRecentRepositories: true,
    showBranchNameInRepoList: ShowBranchNameInRepoListSetting.Never,
    localRepositoryStateLookup: lookup,
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

  beforeEach(() => {
    localStorage.clear()
    touched = []
    fetchCalls = 0
    originalFetch = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: (...args: ReadonlyArray<unknown>) => {
        fetchCalls++
        throw new Error(`Unexpected network call: ${String(args[0])}`)
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    })
  })

  it('folds the summary into each row accessible name so it is announced', async () => {
    render(<RepositoriesList {...commonProps} />)

    await waitFor(() => assert.ok(screen.getByText('repo-101')))

    // The default funny level (3) selects the "light" band; the counts are the
    // same in every band.
    assert.ok(
      screen.getByRole('option', {
        name: 'repo-101, 2 commits waiting to push, nothing to pull, Other',
      })
    )
    assert.ok(
      screen.getByRole('option', {
        name: 'repo-102, 7 commits waiting to pull, nothing to push, Other',
      })
    )
    // The uninspected row says unknown in its accessible name too.
    assert.ok(
      screen.getByRole('option', {
        name: 'repo-103, Not checked yet, so the sync state is unknown, Other',
      })
    )
  })

  it('never reaches the network to paint the line, including while filtering', async () => {
    const { rerender } = render(<RepositoriesList {...commonProps} />)

    await waitFor(() => assert.ok(screen.getByText('repo-101')))

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const filter = screen.getByRole('textbox', { name: 'Filter Repositories' })
    for (const text of ['r', 're', 'rep', 'repo-10', 'repo-101']) {
      fireEvent.change(filter, { target: { value: text } })
      rerender(<RepositoriesList {...commonProps} filterText={text} />)
    }

    await waitFor(() => assert.ok(screen.getByText('repo-101')))

    assert.equal(fetchCalls, 0)
    const networkish = touched.filter(name =>
      /fetch|pull|push|clone|refresh|network|api|remote/i.test(name)
    )
    assert.deepEqual(networkish, [])
  })
})
