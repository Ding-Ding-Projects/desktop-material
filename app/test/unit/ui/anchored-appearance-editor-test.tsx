import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  AnchoredAppearanceEditor,
  getAppearanceRepositoryDisplayPath,
  isAppearanceEditorFallbackContextMenu,
  isAppearanceEditorPointerGesture,
  openAppearanceEditorFromContextMenu,
  openAppearanceEditorFromKeyDown,
} from '../../../src/ui/appearance'
import {
  IVersionHistoryEntry,
  IVersionedStoreHistorySource,
} from '../../../src/ui/version-history'
import { captureClipboardWrites } from '../../helpers/ui/electron'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const RepositoryPath =
  'C:\\Users\\example\\AppData\\Local\\Temp\\appearance-elements\\profile\\toolbar\\setting'
const DisplayRepositoryPath =
  '…\\appearance-elements\\profile\\toolbar\\setting'

function historyEntry(): IVersionHistoryEntry {
  return {
    sha: '1234567890abcdef',
    shortSha: '1234567',
    summary: 'Changed toolbar density',
    body: '',
    committedAt: new Date('2026-07-19T12:00:00Z'),
    undoOf: null,
    redoOf: null,
    restoreOf: null,
  }
}

function createHistorySource(
  operations: string[] = []
): IVersionedStoreHistorySource {
  return {
    getHistory: () =>
      Promise.resolve({
        entries: [historyEntry()],
        total: 1,
        hasMore: false,
        canUndo: true,
        canRedo: true,
      }),
    getFiles: () => Promise.resolve(['setting.json']),
    getDiff: () => Promise.resolve('--- a/setting.json\n+++ b/setting.json'),
    undoLastChange: () => {
      operations.push('undo')
      return Promise.resolve()
    },
    redoLastChange: () => {
      operations.push('redo')
      return Promise.resolve()
    },
    restoreTo: sha => {
      operations.push(`restore:${sha}`)
      return Promise.resolve()
    },
  }
}

interface IHarnessProps {
  readonly historySource?: IVersionedStoreHistorySource
  readonly onMutation?: () => void
  readonly contentOwnsHeader?: boolean
  readonly insideFoldout?: boolean
  readonly onOwnerClick?: () => void
  /** Records what the owner's own context menu would have done, if anything. */
  readonly onOwnerContextMenu?: () => void
}

function Harness(props: IHarnessProps) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null)

  const open = (element: HTMLButtonElement) => setAnchor(element)

  const editor = (
    <div
      role="option"
      aria-selected={false}
      tabIndex={-1}
      onClick={props.onOwnerClick}
      onKeyDown={props.onOwnerClick}
      onContextMenu={props.onOwnerContextMenu}
    >
      <button
        type="button"
        onContextMenu={event =>
          openAppearanceEditorFromContextMenu(event, open)
        }
        onKeyDown={event => openAppearanceEditorFromKeyDown(event, open)}
      >
        Toolbar
      </button>
      <button type="button">Outside</button>
      <AnchoredAppearanceEditor
        title="Toolbar appearance"
        anchor={anchor}
        historySource={props.historySource ?? createHistorySource()}
        repositoryPath={RepositoryPath}
        onMutation={props.onMutation}
        onClose={() => setAnchor(null)}
        contentOwnsHeader={props.contentOwnsHeader}
      >
        {props.contentOwnsHeader === true
          ? controls => (
              <section aria-label="Owned toolbar editor">
                <h2>Owned toolbar controls</h2>
                <button type="button" onClick={controls.showHistory}>
                  Open owned history
                </button>
              </section>
            )
          : 'Toolbar settings'}
      </AnchoredAppearanceEditor>
    </div>
  )

  return props.insideFoldout === true ? (
    <div id="foldout-container">
      <div className="foldout" style={{ overflow: 'hidden' }}>
        {editor}
      </div>
    </div>
  ) : (
    editor
  )
}

describe('anchored appearance editor', () => {
  it('defines the gesture once and keeps shell-wide owners reachable from the keyboard', () => {
    // The gesture itself: Shift decides, nothing else.
    assert.equal(isAppearanceEditorPointerGesture({ shiftKey: false }), false)
    assert.equal(isAppearanceEditorPointerGesture({ shiftKey: true }), true)

    const contextMenu = (init: MouseEventInit) =>
      new MouseEvent('contextmenu', init)

    // A real right-click (Chromium reports button 2) must hold Shift.
    assert.equal(
      isAppearanceEditorFallbackContextMenu(
        contextMenu({ button: 2, shiftKey: false })
      ),
      false
    )
    assert.equal(
      isAppearanceEditorFallbackContextMenu(
        contextMenu({ button: 2, shiftKey: true })
      ),
      true
    )

    // A keyboard context-menu request (ContextMenu key / Shift+F10, button 0)
    // still reaches owners that have no other menu, so the editors behind the
    // shell-wide fallback never become mouse-only.
    assert.equal(
      isAppearanceEditorFallbackContextMenu(
        contextMenu({ button: 0, shiftKey: false })
      ),
      true
    )
    // The macOS Shift+F10 bridge synthesizes a plain Event with no button.
    assert.equal(
      isAppearanceEditorFallbackContextMenu(
        new Event('contextmenu', { bubbles: true })
      ),
      true
    )
  })

  it('leaves a plain right-click to the ordinary context menu and opens only on Shift+Right-click', () => {
    let ownerContextMenus = 0
    render(<Harness onOwnerContextMenu={() => ownerContextMenus++} />)
    const anchor = screen.getByRole('button', { name: 'Toolbar' })
    anchor.focus()

    // The regression this guards: a plain right-click used to be swallowed by
    // the appearance editor, so the surface's own context menu never ran.
    const plainWasNotCancelled = fireEvent.contextMenu(anchor)
    assert.equal(
      screen.queryByRole('dialog', { name: 'Toolbar appearance' }),
      null,
      'a plain right-click must not open the appearance editor'
    )
    assert.equal(
      plainWasNotCancelled,
      true,
      'a plain right-click must not be preventDefault()ed by the editor'
    )
    assert.equal(
      ownerContextMenus,
      1,
      'a plain right-click must keep bubbling to the surface that owns the menu'
    )

    // Shift+Right-click is the gesture, and it claims the event outright.
    const gestureWasNotCancelled = fireEvent.contextMenu(anchor, {
      shiftKey: true,
    })
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
    assert.equal(gestureWasNotCancelled, false)
    assert.equal(
      ownerContextMenus,
      1,
      'the gesture must not also open the surface context menu'
    )
  })

  it('opens from a pointer beside its owner, copies its repo path, closes outside, and restores focus', async () => {
    const clipboard = captureClipboardWrites()
    try {
      render(<Harness />)
      const anchor = screen.getByRole('button', { name: 'Toolbar' })
      anchor.focus()

      const wasNotCancelled = fireEvent.contextMenu(anchor, { shiftKey: true })
      assert.equal(wasNotCancelled, false)
      assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
      assert.ok(screen.getByRole('tab', { name: 'Customize' }))
      assert.ok(screen.getByRole('tab', { name: 'History' }))
      assert.equal(
        screen.getByTitle('Private root hidden; copy the exact path')
          .textContent,
        DisplayRepositoryPath
      )
      assert.doesNotMatch(document.body.textContent ?? '', /C:\\Users|Temp/i)

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Copy local Git repository path',
        })
      )
      assert.deepEqual(clipboard.writes, [RepositoryPath])

      fireEvent.click(screen.getByRole('button', { name: 'Outside' }))
      await waitFor(() => {
        assert.equal(
          screen.queryByRole('dialog', { name: 'Toolbar appearance' }),
          null
        )
        assert.equal(document.activeElement, anchor)
      })
    } finally {
      clipboard.restore()
    }
  })

  it('collapses known owners and fails private unknown layouts closed', () => {
    assert.equal(
      getAppearanceRepositoryDisplayPath(RepositoryPath),
      DisplayRepositoryPath
    )
    assert.equal(
      getAppearanceRepositoryDisplayPath(
        'C:\\Users\\private-name\\AppData\\Local\\Temp\\temporary-owner'
      ),
      '…\\element-settings'
    )
    assert.equal(
      getAppearanceRepositoryDisplayPath('D:/safe/custom-owner'),
      '…\\custom-owner'
    )

    for (const displayed of [
      getAppearanceRepositoryDisplayPath(RepositoryPath),
      getAppearanceRepositoryDisplayPath(
        'C:\\Users\\private-name\\AppData\\Local\\Temp\\temporary-owner'
      ),
    ]) {
      assert.doesNotMatch(displayed, /C:\\Users|Temp/i)
    }
  })

  it('opens with ContextMenu or Shift+F10, ignores plain F10, and closes on Escape', async () => {
    render(<Harness />)
    const anchor = screen.getByRole('button', { name: 'Toolbar' })
    anchor.focus()

    fireEvent.keyDown(anchor, { key: 'F10' })
    assert.equal(screen.queryByRole('dialog'), null)

    fireEvent.keyDown(anchor, { key: 'ContextMenu' })
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      assert.equal(screen.queryByRole('dialog'), null)
      assert.equal(document.activeElement, anchor)
    })

    fireEvent.keyDown(anchor, { key: 'F10', shiftKey: true })
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
  })

  it('lets a nested overlay handle Escape instead of tearing down the whole editor', async () => {
    render(<Harness />)
    const anchor = screen.getByRole('button', { name: 'Toolbar' })
    anchor.focus()

    fireEvent.keyDown(anchor, { key: 'ContextMenu' })
    const editor = screen.getByRole('dialog', { name: 'Toolbar appearance' })

    // Simulate a nested overlay (regex builder / menu / dropdown) rendered
    // inside the editor content, which manages its own Escape-to-dismiss.
    const content = editor.querySelector<HTMLElement>(
      '.anchored-appearance-editor-content'
    )
    assert.ok(content)
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    const overlayInput = document.createElement('input')
    overlay.appendChild(overlayInput)
    content.appendChild(overlay)
    overlayInput.focus()

    // Escape from within the nested overlay must NOT close the editor.
    fireEvent.keyDown(overlayInput, { key: 'Escape' })
    assert.ok(
      screen.getByRole('dialog', { name: 'Toolbar appearance' }),
      'editor should remain open while a nested overlay handles Escape'
    )

    content.removeChild(overlay)

    // A plain Escape (no nested overlay involved) still closes the editor.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      assert.equal(
        screen.queryByRole('dialog', { name: 'Toolbar appearance' }),
        null
      )
      assert.equal(document.activeElement, anchor)
    })
  })

  it('portals a foldout editor outside the clipping ancestor without changing dismissal or focus behavior', async () => {
    render(<Harness insideFoldout={true} />)
    const anchor = screen.getByRole('button', { name: 'Toolbar' })
    anchor.focus()

    fireEvent.contextMenu(anchor, { shiftKey: true })
    const editor = screen.getByRole('dialog', {
      name: 'Toolbar appearance',
    })
    const mount = editor.parentElement
    assert.ok(mount)
    assert.equal(
      mount.classList.contains('anchored-appearance-editor-mount'),
      true
    )
    assert.equal(editor.closest('.foldout'), null)
    assert.equal(mount.parentElement?.id, 'foldout-container')

    fireEvent.click(screen.getByRole('tab', { name: 'Customize' }))
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))

    fireEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => {
      assert.equal(
        screen.queryByRole('dialog', { name: 'Toolbar appearance' }),
        null
      )
      assert.equal(document.activeElement, anchor)
    })

    fireEvent.contextMenu(anchor, { shiftKey: true })
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      assert.equal(
        screen.queryByRole('dialog', { name: 'Toolbar appearance' }),
        null
      )
      assert.equal(document.activeElement, anchor)
      assert.ok(document.getElementById('foldout-container'))
    })
  })

  it('contains portaled editor interactions instead of selecting its owner row', () => {
    let ownerClicks = 0
    render(
      <Harness
        insideFoldout={true}
        onOwnerClick={() => {
          ownerClicks++
        }}
      />
    )
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Toolbar' }), {
      shiftKey: true,
    })

    const customize = screen.getByRole('tab', { name: 'Customize' })
    fireEvent.mouseDown(customize)
    fireEvent.mouseUp(customize)
    fireEvent.click(customize)

    assert.equal(ownerClicks, 0)
    assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
  })

  it('renders the element history with full undo, redo, and restore mutations', async () => {
    const operations: string[] = []
    let mutations = 0
    render(
      <Harness
        historySource={createHistorySource(operations)}
        onMutation={() => mutations++}
      />
    )
    const anchor = screen.getByRole('button', { name: 'Toolbar' })
    fireEvent.contextMenu(anchor, { shiftKey: true })
    fireEvent.click(screen.getByRole('tab', { name: 'History' }))

    const history = await screen.findByRole('dialog', {
      name: 'Toolbar appearance history',
    })
    assert.ok(history)
    assert.ok(screen.getByText(/own local Git repository/))
    assert.ok(screen.getByText(text => text.includes(DisplayRepositoryPath)))
    assert.doesNotMatch(history.textContent ?? '', /C:\\Users|Temp/i)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      assert.deepEqual(operations, ['undo'])
      assert.equal(mutations, 1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => {
      assert.deepEqual(operations, ['undo', 'redo'])
      assert.equal(mutations, 2)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Restore Changed toolbar density' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => {
      assert.deepEqual(operations, [
        'undo',
        'redo',
        `restore:${historyEntry().sha}`,
      ])
      assert.equal(mutations, 3)
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close Toolbar appearance history',
      })
    )
    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: 'Toolbar appearance' }))
    })
  })

  it('lets rich editor children own the visual heading and History action', async () => {
    render(<Harness contentOwnsHeader={true} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Toolbar' }), {
      shiftKey: true,
    })

    assert.ok(screen.getByRole('heading', { name: 'Owned toolbar controls' }))
    assert.equal(screen.queryByRole('tab', { name: 'Customize' }), null)
    assert.equal(screen.queryByRole('tab', { name: 'History' }), null)
    assert.ok(screen.getByRole('button', { name: 'Close Toolbar appearance' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open owned history' }))
    await waitFor(() => {
      assert.ok(
        screen.getByRole('dialog', {
          name: 'Toolbar appearance history',
        })
      )
    })
  })
})
