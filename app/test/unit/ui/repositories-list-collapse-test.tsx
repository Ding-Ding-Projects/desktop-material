import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { CloningRepository } from '../../../src/models/cloning-repository'
import { Repository } from '../../../src/models/repository'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import {
  CollapsedRepositoryGroupsKey,
  getCollapsedRepositoryGroups,
} from '../../../src/lib/stores/repository-group-collapse'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { gitHubRepoFixture } from '../../helpers/github-repo-builder'

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

/** Ungrouped locals plus a cloning row all land in the "Other" group. */
const alpha = new Repository('/work/alpha', 1, null, false)
const beta = new Repository('/work/beta', 2, null, false)
const cloning = new CloningRepository(
  '/work/cloning-repo',
  'https://example.test/cloning-repo.git'
)
/** A single-member group, so the header has to say "1 repository". */
const hosted = new Repository(
  '/work/hosted',
  3,
  gitHubRepoFixture({ owner: 'octocat', name: 'hosted' }),
  false
)

let collapseChangesRecorded = 0

const dispatcher = {
  closeFoldout: () => undefined,
  recordRepoClicked: () => undefined,
  showPopup: () => undefined,
  recordRepositoryGroupCollapseChange: () => {
    collapseChangesRecorded++
  },
} as unknown as Dispatcher

const commonProps = {
  selectedRepository: null,
  repositories: [alpha, beta, cloning, hosted],
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

/**
 * Names of the repository rows the virtualized model is currently holding.
 * Read from the row's own name element rather than the row's text, which also
 * carries the sync summary and the icon ligatures.
 */
const renderedRowNames = () =>
  Array.from(
    document.querySelectorAll(
      '.repository-list-item [data-context-menu-owner="repository-list-name-appearance"]'
    )
  ).map(element => element.textContent?.trim() ?? '')

const groupHeader = (name: RegExp) =>
  screen.getByRole('button', { name }) as HTMLButtonElement

beforeEach(() => {
  localStorage.clear()
  collapseChangesRecorded = 0
})

describe('RepositoriesList collapsible groups', () => {
  it('renders every group header as an expanded disclosure control', async () => {
    render(<RepositoriesList {...commonProps} />)

    await waitFor(() => assert.ok(screen.getByText('alpha')))

    const other = groupHeader(/^Other, 3 repositories/)
    const single = groupHeader(/^octocat, 1 repository/)

    assert.equal(other.getAttribute('aria-expanded'), 'true')
    assert.equal(single.getAttribute('aria-expanded'), 'true')
    assert.equal(
      other.getAttribute('aria-controls'),
      'repository-group-rows-5_3a_other'
    )
    assert.equal(
      single.getAttribute('aria-controls'),
      'repository-group-rows-3_3a_dotcom_3a_octocat'
    )

    // The aria-controls target has to be a real element, or the disclosure
    // relationship points nowhere.
    for (const header of [other, single]) {
      const controlled = header.getAttribute('aria-controls')
      assert.notEqual(
        document.getElementById(controlled ?? ''),
        null,
        `aria-controls target ${controlled} does not exist`
      )
    }
  })

  it('drops exactly the folded group rows from the item model and restores them', async () => {
    render(<RepositoriesList {...commonProps} />)

    await waitFor(() => assert.ok(screen.getByText('alpha')))
    const expanded = renderedRowNames()
    assert.deepEqual(
      new Set(expanded),
      new Set(['alpha', 'beta', 'cloning-repo', 'hosted'])
    )

    fireEvent.click(groupHeader(/^Other, 3 repositories/))

    await waitFor(() => assert.equal(screen.queryByText('alpha'), null))
    // Only the folded group's rows leave; nothing else moves, and no phantom
    // slot is left behind for the rows that went away.
    assert.deepEqual(renderedRowNames(), ['hosted'])
    const collapsed = groupHeader(/^Other, 3 repositories/)
    assert.equal(collapsed.getAttribute('aria-expanded'), 'false')
    // A folded group still says what it is holding.
    assert.equal(collapsed.textContent?.includes('3'), true)

    fireEvent.click(collapsed)
    await waitFor(() => assert.ok(screen.getByText('alpha')))
    assert.deepEqual(new Set(renderedRowNames()), new Set(expanded))
  })

  it('toggles from the keyboard with Enter and Space', async () => {
    render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    fireEvent.keyDown(groupHeader(/^Other, 3 repositories/), { key: 'Enter' })
    await waitFor(() =>
      assert.equal(
        groupHeader(/^Other, 3 repositories/).getAttribute('aria-expanded'),
        'false'
      )
    )

    fireEvent.keyDown(groupHeader(/^Other, 3 repositories/), { key: ' ' })
    await waitFor(() =>
      assert.equal(
        groupHeader(/^Other, 3 repositories/).getAttribute('aria-expanded'),
        'true'
      )
    )

    // Keys that are not the disclosure keys must fall through untouched.
    fireEvent.keyDown(groupHeader(/^Other, 3 repositories/), { key: 'a' })
    assert.equal(
      groupHeader(/^Other, 3 repositories/).getAttribute('aria-expanded'),
      'true'
    )
  })

  it('persists the fold and restores it on the next mount', async () => {
    const first = render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    fireEvent.click(groupHeader(/^Other, 3 repositories/))
    await waitFor(() => assert.equal(screen.queryByText('alpha'), null))

    assert.deepEqual(getCollapsedRepositoryGroups(), ['5:other'])
    assert.equal(
      localStorage.getItem(CollapsedRepositoryGroupsKey),
      '["5:other"]'
    )
    // The profile store is told, once per toggle, that registered settings
    // moved. Its own debounce is what folds a burst into one commit.
    assert.equal(collapseChangesRecorded, 1)

    first.unmount()

    render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('hosted')))
    assert.equal(
      groupHeader(/^Other, 3 repositories/).getAttribute('aria-expanded'),
      'false'
    )
    assert.equal(screen.queryByText('alpha'), null)
  })

  it('never hides a filter match inside a folded group', async () => {
    localStorage.setItem(
      CollapsedRepositoryGroupsKey,
      JSON.stringify(['5:other'])
    )

    const view = render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('hosted')))
    assert.equal(screen.queryByText('alpha'), null)

    view.rerender(<RepositoriesList {...commonProps} filterText="alpha" />)

    // The match is on screen, not swallowed by the fold it lives in.
    await waitFor(() => assert.ok(screen.getByText('alpha')))
    assert.equal(
      groupHeader(/^Other, 3 repositories/).getAttribute('aria-expanded'),
      'true'
    )
    // And the list says, in words, why the fold opened itself.
    await waitFor(() =>
      assert.match(
        view.container.textContent ?? '',
        /Filtering opened 1 collapsed group so none of its matches can hide\./
      )
    )

    // Clearing the filter restores the fold from the untouched persisted set.
    view.rerender(<RepositoriesList {...commonProps} filterText="" />)
    await waitFor(() => assert.equal(screen.queryByText('alpha'), null))
    assert.deepEqual(getCollapsedRepositoryGroups(), ['5:other'])
    assert.equal(
      view.container.textContent?.includes('Filtering opened'),
      false
    )
  })

  it('claims nothing when the filter leaves a folded group with no matches', async () => {
    localStorage.setItem(
      CollapsedRepositoryGroupsKey,
      JSON.stringify(['5:other'])
    )

    const view = render(
      <RepositoriesList {...commonProps} filterText="hosted" />
    )

    await waitFor(() => assert.ok(screen.getByText('hosted')))
    // Every member of the folded group is filtered out, so the group is gone
    // entirely — no header, no phantom row, and no claim that it was expanded.
    assert.equal(screen.queryByRole('button', { name: /^Other,/ }), null)
    assert.equal(
      view.container.textContent?.includes('Filtering opened'),
      false
    )
  })

  it('folds a single-member group and a cloning row without losing either', async () => {
    render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('cloning-repo')))

    fireEvent.click(groupHeader(/^octocat, 1 repository/))
    await waitFor(() => assert.equal(screen.queryByText('hosted'), null))
    assert.deepEqual(
      new Set(renderedRowNames()),
      new Set(['alpha', 'beta', 'cloning-repo'])
    )

    fireEvent.click(groupHeader(/^Other, 3 repositories/))
    await waitFor(() => assert.equal(screen.queryByText('cloning-repo'), null))
    // Both groups folded: two header rows, zero repository rows, no crash.
    assert.deepEqual(renderedRowNames(), [])
    assert.deepEqual(getCollapsedRepositoryGroups(), [
      '3:dotcom:octocat',
      '5:other',
    ])

    fireEvent.click(groupHeader(/^Other, 3 repositories/))
    await waitFor(() => assert.ok(screen.getByText('cloning-repo')))
  })

  it('keeps folded rows out of a bulk select-all', async () => {
    render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    fireEvent.click(
      screen.getByRole('button', { name: 'Select multiple repositories' })
    )
    const selectAll = await waitFor(() =>
      screen.getByRole('checkbox', { name: 'Select all visible repositories' })
    )

    // alpha, beta, hosted — a cloning row is never bulk-selectable.
    fireEvent.click(selectAll)
    await waitFor(() => assert.ok(screen.getByText('3 selected')))

    fireEvent.click(selectAll)
    fireEvent.click(groupHeader(/^Other, 3 repositories/))
    await waitFor(() => assert.equal(screen.queryByText('alpha'), null))

    // "Select all visible" must mean what it says: rows the user folded away
    // are not visible, so a bulk fetch/pull/forget cannot reach them.
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all visible repositories' })
    )
    await waitFor(() => assert.ok(screen.getByText('1 selected')))
  })

  it('announces the disclosure in Cantonese with the count unchanged', async () => {
    localStorage.setItem(
      'appearance-customization-v1',
      JSON.stringify({ version: 1, languageMode: 'english' })
    )

    render(<RepositoriesList {...commonProps} />)
    await waitFor(() => assert.ok(screen.getByText('alpha')))

    document.dispatchEvent(
      new CustomEvent(LanguageModeChangedEvent, { detail: 'cantonese' })
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: /^Other，3 個 repo/ }))
    )

    fireEvent.click(groupHeader(/^Other，3 個 repo/))
    await waitFor(() =>
      assert.equal(
        groupHeader(/^Other，3 個 repo/).getAttribute('aria-expanded'),
        'false'
      )
    )
    // The voice changed language; the count did not change at all.
    assert.ok(
      screen.getByRole('button', { name: 'Other，3 個 repo，而家摺埋咗' })
    )
  })

  it('moves the voice, not the count, when the funny level changes', async () => {
    localStorage.setItem(
      'audio-system-settings-v1',
      JSON.stringify({ funnyLevelEnglish: 5, funnyLevelCantonese: 5 })
    )

    render(<RepositoriesList {...commonProps} />)
    await waitFor(() =>
      assert.ok(
        screen.getByRole('button', {
          name: 'Other, 3 repositories, wide open for business',
        })
      )
    )

    fireEvent.click(groupHeader(/^Other, 3 repositories/))
    await waitFor(() =>
      assert.ok(
        screen.getByRole('button', {
          name: 'Other, 3 repositories, folded up and hiding',
        })
      )
    )
  })
})
