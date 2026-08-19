import assert from 'node:assert'
import { describe, it, beforeEach, afterEach } from 'node:test'

import { personalizeMenuItems, IMenuItem } from '../../src/lib/menu-item'
import {
  setActivePersonalVocabulary,
  restorePersonalVocabulary,
} from '../../src/lib/personal-vocabulary'

describe('menu labels reach the personal-vocabulary boundary', () => {
  beforeEach(() => {
    setActivePersonalVocabulary({
      version: 1,
      terms: new Map([
        ['New worktree…', 'New sandbox…'],
        ['Worktrees', 'Sandboxes'],
      ]),
    })
  })

  afterEach(() => restorePersonalVocabulary())

  it('renames a top-level label', () => {
    const items: ReadonlyArray<IMenuItem> = [{ label: 'New worktree…' }]
    assert.equal(personalizeMenuItems(items)[0].label, 'New sandbox…')
  })

  it('renames labels inside a submenu', () => {
    const items: ReadonlyArray<IMenuItem> = [
      { label: 'Worktrees', submenu: [{ label: 'New worktree…' }] as never },
    ]
    const out = personalizeMenuItems(items)
    assert.equal(out[0].label, 'Sandboxes')
    assert.equal((out[0].submenu ?? [])[0].label, 'New sandbox…')
  })

  it('leaves structural fields alone', () => {
    const action = () => undefined
    const items: ReadonlyArray<IMenuItem> = [
      {
        label: 'New worktree…',
        accelerator: 'CmdOrCtrl+Shift+W',
        type: 'checkbox',
        checked: true,
        enabled: false,
        action,
      },
    ]
    const out = personalizeMenuItems(items)[0]
    assert.equal(out.accelerator, 'CmdOrCtrl+Shift+W')
    assert.equal(out.type, 'checkbox')
    assert.equal(out.checked, true)
    assert.equal(out.enabled, false)
    assert.equal(out.action, action)
  })

  it('leaves a label with no mapping untouched', () => {
    const items: ReadonlyArray<IMenuItem> = [{ label: 'Fetch origin' }]
    assert.equal(personalizeMenuItems(items)[0].label, 'Fetch origin')
  })
})
