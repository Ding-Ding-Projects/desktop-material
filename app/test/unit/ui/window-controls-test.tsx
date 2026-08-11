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
  const variables = readFileSync(
    join(process.cwd(), 'app/styles/_variables.scss'),
    'utf8'
  )

  function declaredPixels(source: string, pattern: RegExp): number {
    const match = pattern.exec(source)

    if (match === null) {
      assert.fail(`expected ${String(pattern)} to be declared`)
    }

    return Number(match[1])
  }

  it('reserves a fixed, edge-pinned cluster before flexible title content', () => {
    // The Material shell turned the Windows title bar into the product header,
    // so the measured bar height is the shell's 56px header rather than the
    // 44px caption minimum it used to be. The caption target itself did not
    // move, so assert the invariant rather than the old constant: the single
    // height the renderer measures must still clear the caption target, and it
    // must still agree with the height the stylesheet actually renders (dialog
    // geometry is derived from the measured value).
    const titleBarHeightSource =
      /export function getTitleBarHeight\(\) \{[\s\S]*?\r?\n\}/.exec(
        component
      )?.[0] ?? ''
    assert.notEqual(titleBarHeightSource, '')

    const captionMinimumTarget = declaredPixels(
      style,
      /--window-control-min-target: (\d+)px;/
    )
    const measuredTitleBarHeight = declaredPixels(
      titleBarHeightSource,
      /return (\d+)\s*\r?\n\}/
    )

    assert.equal(captionMinimumTarget, 44)
    assert.ok(
      measuredTitleBarHeight >= captionMinimumTarget,
      `title bar height ${measuredTitleBarHeight}px is shorter than the ${captionMinimumTarget}px caption target`
    )
    assert.equal(
      measuredTitleBarHeight,
      declaredPixels(variables, /--win32-title-bar-height: (\d+)px;/)
    )

    assert.match(style, /--window-control-min-target: 44px;/)
    assert.match(
      style,
      /@include win32\s*\{[\s\S]*?min-height: var\(--window-control-min-target\);[\s\S]*?padding-right: var\(--window-controls-width\);/
    )
    assert.match(
      style,
      /> #app-menu-bar\s*\{[\s\S]*?flex: 0 1 auto;[\s\S]*?min-width: 0;[\s\S]*?button\s*\{[\s\S]*?-webkit-app-region: no-drag;/
    )
    assert.match(
      style,
      /> #app-menu-bar\s*\{[\s\S]*?> \.toolbar-dropdown\s*\{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;[\s\S]*?> \.toolbar-button\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;[\s\S]*?> button\s*\{[\s\S]*?max-width: 100%;/
    )
    assert.match(
      component,
      /className="title-bar-drag-region"[\s\S]*?data-verification="window-drag-region"/
    )
    assert.match(
      style,
      /> \.title-bar-drag-region\s*\{[\s\S]*?-webkit-app-region: drag;[\s\S]*?flex: 1 0 var\(--title-bar-drag-min-width\);[\s\S]*?min-width: var\(--title-bar-drag-min-width\);/
    )
    assert.match(
      style,
      /\.window-controls\s*\{[\s\S]*?position: absolute;[\s\S]*?right: 0;[\s\S]*?width: var\(--window-controls-width\);[\s\S]*?min-height: var\(--window-control-min-target\);/
    )
    // The shell's product-action lane holds fixed-width icon buttons that
    // cannot shrink, so it has to be clipped at the reserved cluster's edge
    // instead of overflowing underneath the caption buttons.
    assert.match(
      style,
      /@include win32\s*\{[\s\S]*?> \.dm-shell-header-controls\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/
    )
  })

  it('keeps interactive controls out of the native drag lane', () => {
    const dragRegionRule =
      style.match(/> \.title-bar-drag-region\s*\{([^}]*)\}/)?.[1] ?? ''

    assert.notEqual(dragRegionRule, '')
    assert.doesNotMatch(dragRegionRule, /\b(position|inset|z-index)\s*:/)
    assert.match(
      style,
      /#desktop-app-title-bar\s*\{[\s\S]*?-webkit-app-region: drag;/
    )
    assert.match(
      style,
      /\.window-controls\s*\{[\s\S]*?-webkit-app-region: no-drag;/
    )
    assert.match(
      style,
      /\.window-controls\s*\{[\s\S]*?button\s*\{[\s\S]*?-webkit-app-region: no-drag;/
    )
  })

  it('leaves Windows double-click handling to its native drag region', () => {
    assert.match(
      component,
      /const onTitlebarDoubleClick = __DARWIN__\s*\? this\.onTitlebarDoubleClickDarwin\s*: undefined/
    )
    assert.match(
      component,
      /id="desktop-app-title-bar"[\s\S]*?onDoubleClick=\{onTitlebarDoubleClick\}/
    )
  })

  it('keeps a non-overlapping drag lane at 390px native width and 200% zoom', () => {
    const nativeWidth = 390
    const rendererZoom = 2
    const cssViewportWidth = nativeWidth / rendererZoom
    const captionClusterWidth = 138
    const leadingInset = 10
    const minimumDragWidth = 24
    const captionClusterLeft = cssViewportWidth - captionClusterWidth
    const availableDragWidth = captionClusterLeft - leadingInset

    assert.equal(cssViewportWidth, 195)
    assert.equal(captionClusterLeft, 57)
    assert.equal(availableDragWidth, 47)
    assert.ok(availableDragWidth >= minimumDragWidth)
    assert.match(style, /--title-bar-drag-min-width: 24px;/)
    assert.match(
      style,
      /@media \(max-width: 210px\)\s*\{[\s\S]*?#desktop-app-title-bar\s*\{[\s\S]*?@include win32\s*\{[\s\S]*?> \.app-brand-container,\s*> #app-menu-bar\s*\{[\s\S]*?display: none;/
    )
    // The arithmetic above only holds while every non-caption lane collapses,
    // including the Material shell's product actions.
    assert.match(
      style,
      /@media \(max-width: 210px\)\s*\{[\s\S]*?@include win32\s*\{[\s\S]*?> \.dm-shell-header-controls,[\s\S]*?display: none;/
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
