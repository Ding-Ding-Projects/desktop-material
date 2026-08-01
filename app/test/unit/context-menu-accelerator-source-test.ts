import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import {
  menuAccelerator,
  roleAccelerator,
  setMenuAccelerators,
  knownAcceleratorCount,
} from '../../src/lib/menu-accelerators'
import { IMenu } from '../../src/models/app-menu'

const src = Path.resolve(__dirname, '../../src')

/** A menu shaped like the one the main process actually delivers. */
function menuFixture(): IMenu {
  return {
    id: undefined,
    items: [
      {
        id: 'repository',
        type: 'submenuItem',
        label: 'Repository',
        enabled: true,
        visible: true,
        accessKey: null,
        menu: {
          id: 'repository',
          items: [
            {
              id: 'view-repository-on-github',
              type: 'menuItem',
              label: 'View on GitHub',
              enabled: true,
              visible: true,
              accelerator: 'CmdOrCtrl+Shift+G',
              accessKey: null,
            },
            { id: undefined, type: 'separator', visible: true },
            {
              id: 'no-shortcut',
              type: 'menuItem',
              label: 'Something',
              enabled: true,
              visible: true,
              accelerator: null,
              accessKey: null,
            },
          ],
        },
      },
    ],
  } as unknown as IMenu
}

describe('context menu accelerators come from the menu itself', () => {
  it('reads shortcuts out of the delivered menu, including submenus', () => {
    setMenuAccelerators(menuFixture())
    assert.equal(
      menuAccelerator('view-repository-on-github'),
      'CmdOrCtrl+Shift+G'
    )
    assert.ok(knownAcceleratorCount() > 0)
  })

  it('answers undefined rather than guessing', () => {
    setMenuAccelerators(menuFixture())
    // Three different situations, one honest answer: the command has no
    // shortcut, the id does not exist, or the menu has not arrived yet. In
    // each case the item shows no shortcut, which is correct.
    assert.equal(menuAccelerator('no-shortcut'), undefined)
    assert.equal(menuAccelerator('not-a-real-command'), undefined)
  })

  it('forgets a shortcut the menu stops registering', () => {
    setMenuAccelerators(menuFixture())
    assert.notEqual(menuAccelerator('view-repository-on-github'), undefined)

    // A stale shortcut trains a user to press a key that does nothing, so the
    // map is replaced on every delivery rather than merged into.
    setMenuAccelerators({ id: undefined, items: [] } as unknown as IMenu)
    assert.equal(menuAccelerator('view-repository-on-github'), undefined)
    assert.equal(knownAcceleratorCount(), 0)
  })

  it('knows the standard editing roles the menu declares as roles', () => {
    assert.equal(roleAccelerator('copy'), 'CmdOrCtrl+C')
    assert.equal(roleAccelerator('selectAll'), 'CmdOrCtrl+A')
    assert.equal(roleAccelerator('not-a-role'), undefined)
    assert.equal(roleAccelerator(undefined), undefined)
  })

  it('is refreshed wherever the renderer takes delivery of the menu', async () => {
    const store = await readFile(
      Path.join(src, 'lib/stores/app-store.ts'),
      'utf8'
    )
    // Without this the map stays empty and every context menu silently shows
    // no shortcuts at all — a failure that looks exactly like "these commands
    // have none".
    assert.match(
      store,
      /private setAppMenu\(menu: IMenu\): Promise<void> \{[\s\S]{0,400}setMenuAccelerators\(menu\)/
    )
  })

  it('does not write accelerator strings at the call sites', async () => {
    // Two records of the same binding means the displayed one goes stale
    // unnoticed. Every context menu item must look its shortcut up.
    const files = [
      'ui/repositories-list/repository-list-item-context-menu.ts',
      'ui/repositories-list/repositories-list.tsx',
      'ui/branches/branch-list-item-context-menu.tsx',
      'ui/changes/filter-changes-list.tsx',
      'ui/toolbar/worktree-dropdown.tsx',
      'ui/diff/side-by-side-diff.tsx',
      'ui/lib/material-context-menu.tsx',
    ]
    for (const file of files) {
      const source = await readFile(Path.join(src, file), 'utf8')
      assert.doesNotMatch(
        source,
        /accelerator: '(?!.*menuAccelerator)[^']+'/,
        `${file} hardcodes an accelerator instead of looking it up`
      )
      assert.match(
        source,
        /accelerator: (menuAccelerator|roleAccelerator)\(/,
        `${file} must show the shortcuts its items have`
      )
    }
  })
})
