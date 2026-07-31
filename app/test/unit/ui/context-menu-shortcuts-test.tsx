/**
 * The Material context menu's keyboard-shortcut hints, its expansion of
 * Electron's composite `editMenu` role, and the two defects that made its
 * regex builder unusable.
 *
 * All four behaviours are asserted against the real component rather than the
 * helpers, because each bug was a wiring mistake that a helper-level test would
 * have passed straight through:
 *
 * - `editMenu` was rendered as one blank, unclickable row, so every text
 *   field's context menu was empty.
 * - The builder portals to a body-level layer, so the menu's DOM-based
 *   `closest('.filter-mode-control')` guard did not recognise it and every
 *   keystroke typed into the pattern field drove the menu instead.
 * - The menu's full-viewport backdrop dismissed the menu — and the builder with
 *   it — on any click landing in the builder overlay's transparent margin.
 */

import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { IMenuItem } from '../../../src/lib/menu-item'
import {
  ariaKeyShortcuts,
  expandRoleMenus,
  showMaterialContextMenu,
} from '../../../src/ui/lib/material-context-menu'
import { fireEvent, screen } from '../../helpers/ui/render'

let openMenu: Promise<IMenuItem | null> | null = null

afterEach(() => {
  // The menu is torn down by removing its host rather than by dismissing it.
  // Dismissing would not work here anyway: a menu with its builder open now
  // deliberately ignores backdrop clicks, so awaiting the resolve promise
  // would hang — which is the fix under test, not a teardown problem.
  openMenu?.catch(() => null)
  openMenu = null
  for (const host of document.querySelectorAll('.material-context-menu-host')) {
    host.remove()
  }
  for (const layer of document.querySelectorAll('#regex-builder-layer')) {
    layer.remove()
  }
})

describe('context menu role expansion', () => {
  it('expands editMenu into the commands it stands for', () => {
    const expanded = expandRoleMenus([{ role: 'editMenu' }])

    assert.deepEqual(
      expanded.map(item => item.role),
      ['cut', 'copy', 'paste', undefined, 'selectAll'],
      'the separator sits between paste and select all'
    )
    // Before the fix this was a single item with no label at all.
    for (const item of expanded) {
      if (item.type === 'separator') {
        continue
      }
      assert.ok(
        item.label !== undefined && item.label.length > 0,
        `${item.role} rendered without a label`
      )
      assert.ok(
        item.accelerator !== undefined,
        `${item.role} rendered without its shortcut`
      )
    }
  })

  it('leaves every other item untouched', () => {
    const action = () => {}
    const items: ReadonlyArray<IMenuItem> = [
      { label: 'Open in editor', action },
      { type: 'separator' },
      { label: 'Remove', action, enabled: false },
    ]

    assert.deepEqual(expandRoleMenus(items), items)
  })

  it('expands an edit menu nested inside a submenu', () => {
    const [parent] = expandRoleMenus([
      { label: 'Edit', submenu: [{ role: 'editMenu' }] },
    ])

    assert.deepEqual(
      (parent.submenu ?? []).map(item => item.role),
      ['cut', 'copy', 'paste', undefined, 'selectAll']
    )
  })
})

describe('accelerator announcement', () => {
  it('translates Electron modifiers into the ARIA vocabulary', () => {
    // ARIA names keys its own way; the visible hint keeps the platform symbols.
    assert.equal(
      ariaKeyShortcuts('CmdOrCtrl+C'),
      __DARWIN__ ? 'Meta+C' : 'Control+C'
    )
    assert.equal(ariaKeyShortcuts('Ctrl+Shift+P'), 'Control+Shift+P')
    assert.equal(ariaKeyShortcuts('Alt+F4'), 'Alt+F4')
  })
})

describe('context menu shortcut hints', () => {
  it('shows the shortcut beside the label and announces it once', () => {
    openMenu = showMaterialContextMenu([{ role: 'editMenu' }])

    const copy = screen.getByRole('menuitem', { name: /copy/i })

    const hint = copy.querySelector('.context-menu-accelerator')
    assert.ok(hint !== null, 'the copy item rendered no shortcut hint')
    assert.match(hint.textContent ?? '', /C$/)
    assert.equal(
      copy.getAttribute('aria-keyshortcuts'),
      __DARWIN__ ? 'Meta+C' : 'Control+C'
    )
    // Announced through aria-keyshortcuts only: the visible glyphs would
    // otherwise be read a second time as literal text.
    assert.equal(hint.getAttribute('aria-hidden'), 'true')
  })

  it('renders no hint for an item that has no shortcut', () => {
    openMenu = showMaterialContextMenu([
      { label: 'Open in editor', action: () => {} },
    ])

    const item = screen.getByRole('menuitem', { name: 'Open in editor' })
    assert.equal(item.querySelector('.context-menu-accelerator'), null)
    assert.equal(item.getAttribute('aria-keyshortcuts'), null)
  })
})

describe('context menu regex builder', () => {
  const openBuilder = () => {
    openMenu = showMaterialContextMenu([
      { label: 'Discard changes', action: () => {} },
      { label: 'Discard all changes', action: () => {} },
    ])
    const launcher = screen.getByRole('button', { name: 'Open regex builder' })
    // Mirror the browser's pointer sequence: focus then click, so the owning
    // control does not read the builder taking focus as a blur.
    launcher.focus()
    fireEvent.click(launcher)
    const overlay = document.querySelector<HTMLElement>(
      '.regex-builder-overlay[data-search-surface-id="material-context-menu"]'
    )
    assert.ok(overlay !== null, 'the builder never opened')
    return overlay
  }

  it('opens from the menu into the body-level portal layer', () => {
    const overlay = openBuilder()

    // The portal is why the DOM-based guards below have to name the overlay:
    // it is not a descendant of the menu at all.
    assert.equal(
      overlay.closest('.material-context-menu'),
      null,
      'the builder should not be nested inside the menu surface'
    )
    assert.ok(document.querySelector('.material-context-menu') !== null)
  })

  it('keeps the menu open when a backdrop click lands in the builder margin', () => {
    openBuilder()

    const backdrop = document.querySelector('.material-context-menu-backdrop')
    assert.ok(backdrop !== null)
    fireEvent.mouseDown(backdrop)

    // Before the fix this dismissed the menu, unmounting the builder and
    // discarding a half-built pattern.
    assert.ok(
      document.querySelector('.material-context-menu') !== null,
      'the menu was dismissed while its own builder was open'
    )
    assert.ok(
      document.querySelector('.regex-builder-overlay') !== null,
      'the builder went with it'
    )
  })

  it('does not let keys typed in the builder drive the menu', () => {
    openBuilder()

    const field = screen.getByLabelText('Regular expression pattern')

    // Enter used to activate the highlighted menu row, resolving the whole
    // menu out from under the builder.
    fireEvent.keyDown(field, { key: 'Enter' })
    assert.ok(
      document.querySelector('.regex-builder-overlay') !== null,
      'Enter in the pattern field resolved the menu'
    )

    // ArrowDown used to move the menu highlight behind the builder.
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    assert.equal(
      document.querySelector(
        '.material-context-menu .context-menu-item.highlighted'
      ),
      null,
      'an arrow key in the builder moved the menu highlight'
    )
  })
})

describe('context menu builder stacking order', () => {
  const read = (file: string) =>
    readFileSync(join(process.cwd(), 'app', 'styles', file), 'utf8')

  it('paints the builder above the menu backdrop that used to swallow it', () => {
    const variables = read('_variables.scss')
    const builder = read(join('ui', '_regex-builder.scss'))
    const menu = read(join('ui', '_material-context-menu.scss'))

    const declared = /--regex-builder-z-index:\s*(\d+);/.exec(variables)
    assert.ok(declared !== null, 'the builder z-index is no longer a token')

    const backdrop =
      /\.material-context-menu-backdrop\s*\{[\s\S]*?z-index:\s*(\d+);/.exec(
        menu
      )
    assert.ok(backdrop !== null, 'the backdrop declares no z-index')

    assert.ok(
      Number(declared[1]) > Number(backdrop[1]),
      `builder ${declared[1]} must outrank the backdrop ${backdrop[1]}`
    )
    // The overlay must actually use the token rather than a stale literal.
    assert.match(
      builder,
      /\.regex-builder-overlay\s*\{[\s\S]*?z-index:\s*var\(--regex-builder-z-index/
    )
  })
})
