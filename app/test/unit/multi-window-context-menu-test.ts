import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Branch, BranchType } from '../../src/models/branch'
import { Repository } from '../../src/models/repository'
import { WorktreeEntry } from '../../src/models/worktree'
import { generateRepositoryListContextMenu } from '../../src/ui/repositories-list/repository-list-item-context-menu'
import {
  generateWorktreeDropdownContextMenuItems,
  IWorktreeMergeDispatcher,
  startWorktreeMergeFromMenu,
} from '../../src/ui/toolbar/worktree-dropdown'
import { generateWorktreeContextMenuItems } from '../../src/ui/worktrees/worktree-list-item-context-menu'
import { FoldoutType } from '../../src/lib/app-state'

describe('multi-window context actions', () => {
  it('opens a repository in a new window from the repository menu', () => {
    const repository = new Repository('C:\\repos\\material', 1, null, false)
    let opened: Repository | null = null
    const items = generateRepositoryListContextMenu({
      repository,
      accounts: [],
      shellLabel: undefined,
      externalEditorLabel: undefined,
      askForConfirmationOnRemoveRepository: false,
      onViewOnGitHub: () => {},
      onOpenInNewWindow: repo => {
        opened = repo as Repository
      },
      onOpenInShell: () => {},
      onShowRepository: () => {},
      onOpenInExternalEditor: () => {},
      onRemoveRepository: () => {},
      onChangeRepositoryAlias: () => {},
      onRemoveRepositoryAlias: () => {},
      onChangeRepositoryGroupName: () => {},
      onRemoveRepositoryGroupName: () => {},
    })

    const action = items.find(item =>
      item.label?.toLowerCase().includes('new window')
    )
    assert.ok(action && 'action' in action && action.action)
    action.action()
    assert.equal(opened, repository)
  })

  it('opens the exact worktree path in a new window', () => {
    let opened = false
    const items = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: false,
      onOpenInNewWindow: () => {
        opened = true
      },
    })

    const action = items.find(item =>
      item.label?.toLowerCase().includes('new window')
    )
    assert.ok(action && 'action' in action && action.action)
    action.action()
    assert.equal(opened, true)
  })

  it('offers only the valid lock transition for a linked worktree', () => {
    const transitions = new Array<string>()
    const unlockedItems = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: false,
      onLockWorktree: path => transitions.push(`lock:${path}`),
      onUnlockWorktree: path => transitions.push(`unlock:${path}`),
    })
    const lock = unlockedItems.find(item => item.label === 'Lock worktree')
    assert.ok(lock && 'action' in lock && lock.action)
    lock.action()

    const lockedItems = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: true,
      onLockWorktree: path => transitions.push(`lock:${path}`),
      onUnlockWorktree: path => transitions.push(`unlock:${path}`),
    })
    const unlock = lockedItems.find(item => item.label === 'Unlock worktree')
    assert.ok(unlock && 'action' in unlock && unlock.action)
    unlock.action()

    assert.deepEqual(transitions, [
      'lock:C:\\repos\\material-feature',
      'unlock:C:\\repos\\material-feature',
    ])
  })

  it('merges the exact eligible worktree branch from the worktree menu', () => {
    const worktree: WorktreeEntry = {
      path: 'C:\\repos\\material-feature',
      head: '1234567890abcdef',
      branch: 'refs/heads/feature',
      isDetached: false,
      type: 'linked',
      isLocked: false,
      isPrunable: false,
      dirtyFileCount: 0,
    }
    const merged = new Array<Branch>()
    const items = generateWorktreeDropdownContextMenuItems(
      worktree,
      'C:\\repos\\material',
      {
        onMergeWorktree: selected => {
          merged.push(selected)
        },
      }
    )

    const merge = items.find(item => item.label === 'Merge…')
    assert.ok(merge && 'action' in merge && merge.action)
    merge.action()
    assert.equal(merged.length, 1)
    assert.equal(merged[0].name, 'feature')
    assert.equal(merged[0].ref, 'refs/heads/feature')
    assert.equal(merged[0].tip.sha, '1234567890abcdef')
  })

  it('routes a menu merge through the reviewed dispatcher operation', () => {
    const repository = new Repository('C:\\repos\\material', 1, null, false)
    const branch = new Branch(
      'feature',
      null,
      { sha: '1234567890abcdef' },
      BranchType.Local,
      'refs/heads/feature'
    )
    const foldouts = new Array<FoldoutType>()
    const operations = new Array<readonly [Repository, boolean, Branch]>()
    const dispatcher: IWorktreeMergeDispatcher = {
      closeFoldout: foldout => foldouts.push(foldout),
      startMergeBranchOperation: (selectedRepository, isSquash, selected) =>
        operations.push([selectedRepository, isSquash, selected]),
    }

    startWorktreeMergeFromMenu(dispatcher, repository, branch)

    assert.deepEqual(foldouts, [FoldoutType.Worktree])
    assert.deepEqual(operations, [[repository, false, branch]])
  })

  it('omits merge unless both its branch and callback are available', () => {
    const branch = new Branch(
      'feature',
      null,
      { sha: '1234567890abcdef' },
      BranchType.Local,
      'refs/heads/feature'
    )
    const withoutBranch = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: false,
      onMergeWorktree: () => {},
    })
    const withoutCallback = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: false,
      mergeBranch: branch,
    })

    assert.equal(
      withoutBranch.some(item => item.label === 'Merge…'),
      false
    )
    assert.equal(
      withoutCallback.some(item => item.label === 'Merge…'),
      false
    )
  })

  it('deletes the exact linked worktree and disables protected targets', () => {
    const removed = new Array<string>()
    const linkedItems = generateWorktreeContextMenuItems({
      path: 'C:\\repos\\material-feature',
      isMainWorktree: false,
      isLocked: false,
      onRemoveWorktree: path => removed.push(path),
    })
    const linkedDelete = linkedItems.find(item => item.label === 'Delete…')
    assert.ok(linkedDelete && 'action' in linkedDelete && linkedDelete.action)
    assert.equal(linkedDelete.enabled, true)
    linkedDelete.action()

    for (const protectedItems of [
      generateWorktreeContextMenuItems({
        path: 'C:\\repos\\material',
        isMainWorktree: true,
        isLocked: false,
        onRemoveWorktree: () => {},
      }),
      generateWorktreeContextMenuItems({
        path: 'C:\\repos\\material-feature',
        isMainWorktree: false,
        isLocked: true,
        onRemoveWorktree: () => {},
      }),
    ]) {
      const protectedDelete = protectedItems.find(
        item => item.label === 'Delete…'
      )
      assert.ok(protectedDelete && 'enabled' in protectedDelete)
      assert.equal(protectedDelete.enabled, false)
    }

    assert.deepEqual(removed, ['C:\\repos\\material-feature'])
  })
})
