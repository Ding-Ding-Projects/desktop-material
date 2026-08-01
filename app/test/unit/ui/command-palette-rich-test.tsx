import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { CommandPalette } from '../../../src/ui/command-palette/command-palette'
import { DialogStackContext } from '../../../src/ui/dialog'
import { PaletteControlValue } from '../../../src/lib/command-palette-catalog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialogShow: (() => void) | null = null

beforeEach(async () => {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }

  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  prototype.show = function () {
    this.setAttribute('open', '')
  }
  restoreDialogShow = () => {
    prototype.show = previousShow
    restoreDialogShow = null
  }

  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem('filter-mode/command-palette')
  localStorage.removeItem('command-palette-appearance-v1')
})

afterEach(() => {
  restoreIpcSend?.()
  restoreDialogShow?.()
})

function renderPalette(overrides: {
  onExecute?: (event: string) => void
  onTeleport?: (command: { event: string }) => void
  onControlChange?: (event: string, value: PaletteControlValue) => void
  controlValues?: ReadonlyMap<string, PaletteControlValue>
  onDismissed?: () => void
}) {
  return render(
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      <CommandPalette
        onExecute={overrides.onExecute ?? (() => undefined)}
        onTeleport={overrides.onTeleport}
        onControlChange={overrides.onControlChange}
        controlValues={overrides.controlValues}
        onDismissed={overrides.onDismissed ?? (() => undefined)}
      />
    </DialogStackContext.Provider>
  )
}

function enableRegexMode() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Filter mode: Fuzzy (click to change)' })
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Filter mode: Substring (click to change)',
    })
  )
}

describe('CommandPalette rich controls', () => {
  it('renders a live switch for a toggle setting and writes through it', async () => {
    const changes: Array<[string, PaletteControlValue]> = []
    let dismissals = 0

    renderPalette({
      controlValues: new Map<string, PaletteControlValue>([
        ['palette:toggle-theme', false],
      ]),
      onControlChange: (event, value) => changes.push([event, value]),
      onDismissed: () => dismissals++,
    })

    const input = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    await waitFor(() => assert.equal(document.activeElement, input))
    fireEvent.change(input, { target: { value: 'dark theme' } })

    const toggle = screen.getByRole('switch', { name: 'Dark theme' })
    assert.equal(toggle.getAttribute('aria-checked'), 'false')

    fireEvent.click(toggle)
    assert.deepEqual(changes, [['palette:toggle-theme', true]])
    // Flipping a switch must not close the palette: the user is adjusting a
    // setting in place, not dispatching a command.
    assert.equal(dismissals, 0)
  })

  it('renders a text box for an entry setting and applies on Enter', () => {
    const changes: Array<[string, PaletteControlValue]> = []

    renderPalette({
      controlValues: new Map<string, PaletteControlValue>([
        ['palette:entry-commit-summary', ''],
      ]),
      onControlChange: (event, value) => changes.push([event, value]),
    })

    const search = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    fireEvent.change(search, { target: { value: 'commit summary' } })

    const box = screen.getByRole('textbox', { name: 'Commit summary' })
    fireEvent.change(box, { target: { value: 'Fix the flaky test' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    assert.deepEqual(changes, [
      ['palette:entry-commit-summary', 'Fix the flaky test'],
    ])
  })

  it('renders a select for a choice setting', () => {
    const changes: Array<[string, PaletteControlValue]> = []

    renderPalette({
      controlValues: new Map<string, PaletteControlValue>([
        ['palette:set-language-mode', 'english'],
      ]),
      onControlChange: (event, value) => changes.push([event, value]),
    })

    const search = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    fireEvent.change(search, { target: { value: 'language mode' } })

    const select = screen.getByRole('combobox', { name: 'Language mode' })
    fireEvent.change(select, { target: { value: 'bilingual' } })

    assert.deepEqual(changes, [['palette:set-language-mode', 'bilingual']])
  })

  it('teleports on row click and on plain Enter, and runs on Ctrl+Enter', async () => {
    const executed: string[] = []
    const teleported: string[] = []
    let dismissals = 0

    renderPalette({
      onExecute: event => executed.push(event),
      onTeleport: command => teleported.push(command.event),
      onDismissed: () => dismissals++,
    })

    const search = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    await waitFor(() => assert.equal(document.activeElement, search))

    enableRegexMode()
    fireEvent.change(search, { target: { value: '^Push$' } })
    const rows = screen.getAllByRole('option')
    assert.equal(rows.length, 1)

    // Plain Enter goes to where the feature lives.
    fireEvent.keyDown(search, { key: 'Enter' })
    assert.deepEqual(teleported, ['push'])
    assert.deepEqual(executed, [])
    assert.equal(dismissals, 1)

    // Ctrl+Enter is the explicit "run it from here" gesture.
    fireEvent.keyDown(search, { key: 'Enter', ctrlKey: true })
    assert.deepEqual(executed, ['push'])
    assert.equal(dismissals, 2)

    // Clicking the row body teleports too.
    fireEvent.click(rows[0])
    assert.deepEqual(teleported, ['push', 'push'])
  })

  it('announces where every row lives and offers a Run action for commands', () => {
    renderPalette({})

    const search = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    enableRegexMode()
    fireEvent.change(search, { target: { value: '^Push$' } })

    const row = screen.getByRole('option', { name: /Push — Toolbar/ })
    assert.ok(row)

    // The Run button lives inside the row and carries the command's title in
    // its accessible name so it is distinguishable in a list of Run buttons.
    const run = screen.getByRole('button', { name: 'Run — Push' })
    assert.ok(run)
  })

  it('disables a control whose live value is unknown', () => {
    renderPalette({
      // No controlValues at all: every setting's value is unknown.
    })

    const search = screen.getByRole('textbox', {
      name: 'Search command palette',
    })
    fireEvent.change(search, { target: { value: 'dark theme' } })

    const toggle = screen.getByRole('switch', { name: 'Dark theme' })
    assert.ok(toggle.matches(':disabled'))
  })
})
