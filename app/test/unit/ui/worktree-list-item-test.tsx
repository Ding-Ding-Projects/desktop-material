import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { IMatches } from '../../../src/lib/fuzzy-find'
import {
  getWorktreeAriaLabel,
  getWorktreeAppearanceId,
  getWorktreeDescription,
  getWorktreeDisplayName,
  WorktreeEntry,
  worktreePathsEqual,
} from '../../../src/models/worktree'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'
import {
  getMergeBranchForWorktree,
  WorktreeList,
} from '../../../src/ui/worktrees/worktree-list'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const noMatches: IMatches = { title: [], subtitle: [] }

function linkedWorktree(options: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: 'C:/worktrees/feature',
    head: '1234567890abcdef',
    branch: 'refs/heads/feature',
    isDetached: false,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
    dirtyFileCount: 0,
    ...options,
  }
}

class FixedResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 420,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 240,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 420,
            height: 240,
            top: 0,
            right: 420,
            bottom: 240,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

let originalResizeObserver: typeof ResizeObserver | undefined
let originalWindowResizeObserver: typeof ResizeObserver | undefined

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver
  originalWindowResizeObserver = window.ResizeObserver
  Object.assign(globalThis, { ResizeObserver: FixedResizeObserver })
  Object.assign(window, { ResizeObserver: FixedResizeObserver })
})

afterEach(() => {
  Object.assign(globalThis, { ResizeObserver: originalResizeObserver })
  Object.assign(window, { ResizeObserver: originalWindowResizeObserver })
})

describe('WorktreeListItem', () => {
  it('normalizes Windows separators and casing for current-path state', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32',
    })
    try {
      assert.equal(
        worktreePathsEqual('c:/Users/example/repo', 'C:\\Users\\example\\repo'),
        true
      )
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: originalPlatform,
      })
    }
  })

  it('keeps POSIX backslashes literal and case-sensitive', () => {
    const literalBackslash = '/tmp/worktree\\name'
    const separatorPath = '/tmp/worktree/name'
    const differentlyCased = '/tmp/Worktree/name'

    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'linux',
    })
    try {
      assert.equal(worktreePathsEqual(literalBackslash, separatorPath), false)
      assert.equal(worktreePathsEqual(separatorPath, differentlyCased), false)
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: originalPlatform,
      })
    }
    assert.equal(worktreePathsEqual(separatorPath, separatorPath), true)
  })

  it('derives stable accessible names with observed state', () => {
    const worktree = linkedWorktree({
      dirtyFileCount: 2,
      isLocked: true,
      isPrunable: true,
    })

    assert.equal(getWorktreeDisplayName(worktree), 'feature')
    assert.equal(getWorktreeDescription(worktree), 'feature')
    assert.equal(
      getWorktreeAriaLabel(worktree),
      'feature, feature, 2 uncommitted, locked, missing'
    )
  })

  it('shows unavailable status instead of claiming a clean row', () => {
    render(
      <WorktreeListItem
        worktree={linkedWorktree({ dirtyFileCount: null })}
        isCurrentWorktree={false}
        matches={noMatches}
      />
    )

    assert.ok(screen.getByText(/status unavailable/))
    assert.equal(screen.queryByText(/^clean$/), null)
  })

  it('registers isolated appearance and lock targets for each row', () => {
    const firstId = getWorktreeAppearanceId(7, 'C:/worktrees/one')
    const secondId = getWorktreeAppearanceId(7, 'C:/worktrees/two')
    assert.notEqual(firstId, secondId)

    const { container } = render(
      <WorktreeListItem
        worktree={linkedWorktree()}
        isCurrentWorktree={false}
        matches={noMatches}
        appearanceId={firstId}
      />
    )
    const row = container.querySelector('.worktrees-list-item')
    assert.ok(row)
    assert.equal(row.getAttribute('data-dm-feature'), firstId)
    assert.equal(row.getAttribute('data-dm-feature-id'), firstId)
    assert.equal(row.getAttribute('data-worktree-appearance-id'), firstId)
    assert.equal(row.getAttribute('data-md3-lock-target'), `feature:${firstId}`)
  })

  it('indexes unavailable status in the worktree filter', async () => {
    localStorage.setItem('filter-mode/worktrees', 'substring')
    render(
      <WorktreeList
        worktrees={[linkedWorktree({ dirtyFileCount: null })]}
        currentWorktree={null}
        filterText="unavailable"
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    await waitFor(() => {
      assert.equal(screen.getAllByRole('option').length, 1)
    })
    localStorage.removeItem('filter-mode/worktrees')
  })

  it('dispatches a still-eligible row merge through its per-item owner', async () => {
    const worktree = linkedWorktree()
    let mergedRef: string | null = null
    let mergedSha: string | null = null

    const { container } = render(
      <WorktreeList
        worktrees={[worktree]}
        currentWorktree={null}
        onMergeWorktree={branch => {
          mergedRef = branch.ref
          mergedSha = branch.tip.sha
        }}
        filterText=""
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    const button = await waitFor(() => {
      const element = container.querySelector<HTMLButtonElement>(
        '.merge-worktree-button'
      )
      assert.ok(element)
      return element
    })
    fireEvent.click(button)
    assert.equal(mergedRef, worktree.branch)
    assert.equal(mergedSha, worktree.head)
  })

  it('activates the focused worktree with Enter and keeps the state accessible', async () => {
    const worktree = linkedWorktree({
      path: 'C:/worktrees/main',
      branch: 'refs/heads/main',
      type: 'main',
    })
    let activatedPath: string | null = null

    const { container } = render(
      <WorktreeList
        worktrees={[worktree]}
        currentWorktree={worktree}
        onWorktreeClick={selected => {
          activatedPath = selected.path
        }}
        filterText=""
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    await waitFor(() => {
      assert.ok(
        screen.getByRole('option', {
          name: 'main, main, current worktree',
        })
      )
    })

    const list = container.querySelector<HTMLElement>(
      '.ReactVirtualized__Grid[tabindex="0"]'
    )
    assert.ok(list)
    list.focus()
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })

    assert.equal(activatedPath, worktree.path)
  })

  it('announces main, linked, and detached rows with one counted group label', async () => {
    const main = linkedWorktree({
      path: 'C:/worktrees/main',
      branch: 'refs/heads/main',
      type: 'main',
    })
    const linked = linkedWorktree()
    const detached = linkedWorktree({
      path: 'C:/worktrees/detached',
      head: 'abcdef1234567890',
      branch: null,
      isDetached: true,
      dirtyFileCount: 3,
      isLocked: true,
      isPrunable: true,
    })

    render(
      <WorktreeList
        worktrees={[main, linked, detached]}
        currentWorktree={main}
        filterText=""
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    await waitFor(() => {
      assert.equal(screen.getAllByRole('option').length, 3)
    })

    const mainOption = screen.getByRole('option', {
      name: 'main, main, current worktree',
    })
    const linkedOption = screen.getByRole('option', {
      name: 'feature, feature',
    })
    const detachedOption = screen.getByRole('option', {
      name: 'detached, abcdef1, 3 uncommitted, locked, missing',
    })

    const listboxes = screen.getAllByRole('listbox')
    assert.ok(
      listboxes.some(
        listbox =>
          listbox.getAttribute('aria-label') === 'Main worktree, 1 worktree'
      )
    )
    assert.ok(
      listboxes.some(
        listbox =>
          listbox.getAttribute('aria-label') === 'Linked worktrees, 2 worktrees'
      )
    )

    assert.equal(
      (mainOption.getAttribute('aria-label')?.match(/Main worktree/g) ?? [])
        .length,
      0
    )
    assert.equal(
      (
        linkedOption.getAttribute('aria-label')?.match(/Linked worktrees/g) ??
        []
      ).length,
      0
    )
    assert.equal(
      detachedOption.getAttribute('aria-label'),
      'detached, abcdef1, 3 uncommitted, locked, missing'
    )
  })

  it('counts only filtered linked rows in the section association', async () => {
    const main = linkedWorktree({
      path: 'C:/worktrees/main',
      branch: 'refs/heads/main',
      type: 'main',
    })
    const firstLinked = linkedWorktree({ path: 'C:/worktrees/feature-one' })
    const secondLinked = linkedWorktree({ path: 'C:/worktrees/other' })

    render(
      <WorktreeList
        worktrees={[main, firstLinked, secondLinked]}
        currentWorktree={main}
        filterText="feature-one"
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    await waitFor(() => {
      assert.equal(screen.getAllByRole('option').length, 1)
    })

    assert.equal(
      screen
        .getByRole('option', { name: 'feature-one, feature' })
        .getAttribute('aria-label'),
      'feature-one, feature'
    )
    assert.ok(
      screen
        .getAllByRole('listbox')
        .some(
          listbox =>
            listbox.getAttribute('aria-label') ===
            'Linked worktrees, 1 worktree'
        )
    )
  })

  it('uses a singular count when one linked row is rendered', async () => {
    const main = linkedWorktree({
      path: 'C:/worktrees/main',
      branch: 'refs/heads/main',
      type: 'main',
    })

    render(
      <WorktreeList
        worktrees={[main, linkedWorktree()]}
        currentWorktree={main}
        filterText=""
        onFilterTextChanged={() => undefined}
        canCreateNewWorktree={false}
      />
    )

    await waitFor(() => {
      assert.ok(
        screen
          .getAllByRole('listbox')
          .some(
            listbox =>
              listbox.getAttribute('aria-label') ===
              'Linked worktrees, 1 worktree'
          )
      )
    })
  })

  it('merges an eligible linked worktree without selecting it', () => {
    const branch = new Branch(
      'feature',
      null,
      { sha: '1234567890abcdef' },
      BranchType.Local,
      'refs/heads/feature'
    )
    const merged = new Array<Branch>()
    let selected = 0
    render(
      <div onClick={() => selected++}>
        <WorktreeListItem
          worktree={linkedWorktree()}
          isCurrentWorktree={false}
          matches={noMatches}
          mergeBranch={branch}
          onMergeWorktree={mergeBranch => merged.push(mergeBranch)}
        />
      </div>
    )

    const button = screen.getByRole('button', { name: 'Merge worktree' })

    // The merge action must say WHICH branch it merges: "Merge worktree" alone
    // is the same label on every row, so the description is the only thing
    // telling a screen-reader user what this particular button will do.
    //
    // No assertion here about the button's description, deliberately, and it
    // is worth saying why so nobody adds a decorative one back.
    //
    // The merge action does carry a branch-naming tooltip, and it should: the
    // visible label is "Merge worktree" on every row, so the description is
    // the only thing distinguishing them. None of it is assertable at this
    // level. `Tooltip` attaches `aria-describedby` only once it is visible
    // (`componentDidUpdate`, on `state.show`) and removes it again when it
    // hides, and becoming visible needs real layout measurement jsdom does not
    // do — `button-hints-test.tsx` meets the same wall and asserts the
    // attribute is `null`. The tooltip's text is not in the DOM until then
    // either. And `data-tooltip-target` proves nothing: `Button` infers a
    // tooltip from its visible text when none is supplied, so that attribute
    // is `"true"` with or without the prop — an assertion on it stays green
    // after the tooltip is deleted, which was verified rather than assumed.
    //
    // Covering it properly needs the real rendered app, where the capture
    // harness can drive a hover; that belongs in a capture step, not here.

    fireEvent.click(button)

    assert.deepEqual(merged, [branch])
    assert.equal(selected, 0)
  })

  it('does not render a merge action without an eligible branch', () => {
    render(
      <WorktreeListItem
        worktree={linkedWorktree({ isLocked: true })}
        isCurrentWorktree={false}
        matches={noMatches}
      />
    )

    assert.equal(screen.queryByRole('button', { name: 'Merge worktree' }), null)
  })

  it('only resolves merge branches for eligible linked worktrees', () => {
    const ineligible = [
      linkedWorktree({ type: 'main' }),
      linkedWorktree({ branch: null, isDetached: true }),
      linkedWorktree({ isLocked: true }),
      linkedWorktree({ isPrunable: true }),
      linkedWorktree({ dirtyFileCount: null }),
      linkedWorktree({ branch: 'refs/remotes/origin/feature' }),
    ]

    assert.equal(getMergeBranchForWorktree(linkedWorktree(), true), undefined)
    for (const worktree of ineligible) {
      assert.equal(getMergeBranchForWorktree(worktree, false), undefined)
    }

    const branch = getMergeBranchForWorktree(linkedWorktree(), false)
    assert.equal(branch?.type, BranchType.Local)
    assert.equal(branch?.name, 'feature')
    assert.equal(branch?.ref, 'refs/heads/feature')
    assert.equal(branch?.tip.sha, '1234567890abcdef')
  })
})
