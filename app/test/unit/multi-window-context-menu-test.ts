import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../src/models/repository'
import { generateRepositoryListContextMenu } from '../../src/ui/repositories-list/repository-list-item-context-menu'
import { generateWorktreeContextMenuItems } from '../../src/ui/worktrees/worktree-list-item-context-menu'

describe('multi-window context actions', () => {
  it('opens a repository in a new window from the repository menu', () => {
    const repository = new Repository('C:\\repos\\material', 1, null, false)
    let opened: Repository | null = null
    const items = generateRepositoryListContextMenu({
      repository,
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
})
