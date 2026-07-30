import assert from 'node:assert'
import { beforeEach, describe, it, mock } from 'node:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as React from 'react'
import type { WindowState } from '../../../src/lib/window-state'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

let currentWindowState: WindowState = 'normal'
let actions = new Array<string>()

mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    closeWindow: () => actions.push('close'),
    getCurrentWindowState: async () => currentWindowState,
    maximizeWindow: () => actions.push('maximize'),
    minimizeWindow: () => actions.push('minimize'),
    restoreWindow: () => actions.push('restore'),
  },
})

mock.module('../../../src/lib/ipc-renderer', {
  namedExports: {
    on: () => undefined,
    removeListener: () => undefined,
  },
})

async function getWindowControls() {
  return (await import('../../../src/ui/window/window-controls')).WindowControls
}

beforeEach(() => {
  actions = []
  currentWindowState = 'normal'
})

describe('WindowControls', () => {
  it('exposes all three caption buttons to keyboard and assistive technology', async () => {
    const WindowControls = await getWindowControls()
    render(<WindowControls />)

    const group = await screen.findByRole('group', {
      name: 'Window controls',
    })
    const buttons = within(group).getAllByRole('button')

    assert.deepEqual(
      buttons.map(button => button.getAttribute('aria-label')),
      ['Minimize', 'Maximize', 'Close']
    )
    assert.deepEqual(
      buttons.map(button => button.getAttribute('data-verification')),
      [
        'window-control-minimize',
        'window-control-maximize',
        'window-control-close',
      ]
    )

    for (const button of buttons) {
      assert.equal(button.getAttribute('aria-hidden'), null)
      assert.equal(button.tabIndex, 0)
      button.focus()
      assert.equal(document.activeElement, button)
    }

    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])
    assert.deepEqual(actions, ['minimize', 'maximize', 'close'])
  })

  it('keeps the restore caption accessible when the window is maximized', async () => {
    currentWindowState = 'maximized'
    const WindowControls = await getWindowControls()
    render(<WindowControls />)

    const restore = await screen.findByRole('button', { name: 'Restore' })
    assert.equal(
      restore.getAttribute('data-verification'),
      'window-control-restore'
    )
    assert.equal(restore.tabIndex, 0)

    fireEvent.click(restore)
    assert.deepEqual(actions, ['restore'])
  })
})

describe('Windows title-bar layout contract', () => {
  const style = readFileSync(
    join(process.cwd(), 'app/styles/ui/window/_title-bar.scss'),
    'utf8'
  )
  const component = readFileSync(
    join(process.cwd(), 'app/src/ui/window/title-bar.tsx'),
    'utf8'
  )

  it('reserves a fixed, edge-pinned cluster before flexible title content', () => {
    assert.match(component, /return 44/)
    assert.match(style, /--window-control-min-target: 44px;/)
    assert.match(
      style,
      /@include win32\s*\{[\s\S]*?min-height: var\(--window-control-min-target\);[\s\S]*?padding-right: var\(--window-controls-width\);/
    )
    assert.match(
      style,
      /> #app-menu-bar\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;/
    )
    assert.match(
      style,
      /\.window-controls\s*\{[\s\S]*?position: absolute;[\s\S]*?right: 0;[\s\S]*?width: var\(--window-controls-width\);/
    )
  })

  it('keeps every caption button at least 44 by 44 CSS pixels', () => {
    assert.match(
      style,
      /\.window-controls\s*\{[\s\S]*?button\s*\{[\s\S]*?min-width: var\(--window-control-min-target\);[\s\S]*?min-height: var\(--window-control-min-target\);/
    )
    assert.match(
      style,
      /button\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid var\(--md-sys-color-primary\);/
    )
  })
})
