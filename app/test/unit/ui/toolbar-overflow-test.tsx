import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Toolbar, ToolbarItem } from '../../../src/ui/toolbar/toolbar'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

class ControlledResizeObserver implements ResizeObserver {
  public static instances = new Array<ControlledResizeObserver>()

  public constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  public observe() {}
  public unobserve() {}
  public disconnect() {}

  public trigger() {
    this.callback([], this)
  }
}

class MountProbe extends React.Component {
  public static mounts = 0
  public static unmounts = 0

  public componentDidMount() {
    MountProbe.mounts++
  }

  public componentWillUnmount() {
    MountProbe.unmounts++
  }

  public render() {
    return <button type="button">Build original</button>
  }
}

const originalWindowResizeObserver = (window as any).ResizeObserver
const originalGlobalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  ControlledResizeObserver.instances = []
  MountProbe.mounts = 0
  MountProbe.unmounts = 0
  ;(window as any).ResizeObserver = ControlledResizeObserver
  ;(globalThis as any).ResizeObserver = ControlledResizeObserver
})

afterEach(() => {
  ;(window as any).ResizeObserver = originalWindowResizeObserver
  ;(globalThis as any).ResizeObserver = originalGlobalResizeObserver
})

function renderResponsiveToolbar(onBuild = () => {}) {
  let width = 290
  const view = render(
    <Toolbar id="test-toolbar" ariaLabel="Repository controls">
      <ToolbarItem id="repository" preferredWidth={100}>
        <button type="button">Repository</button>
      </ToolbarItem>
      <ToolbarItem
        id="one-click-commit-push"
        preferredWidth={80}
        overflowPriority={2}
        renderOverflow={() => (
          <button type="button">Commit &amp; push overflow action</button>
        )}
      >
        <button type="button">Commit &amp; push original</button>
      </ToolbarItem>
      <ToolbarItem
        id="build-run"
        preferredWidth={90}
        overflowPriority={1}
        renderOverflow={() => (
          <button type="button" onClick={onBuild}>
            Build overflow action
          </button>
        )}
      >
        <MountProbe />
      </ToolbarItem>
    </Toolbar>
  )
  const toolbar = screen.getByRole('toolbar', {
    name: 'Repository controls',
  }) as HTMLDivElement
  toolbar.style.gap = '10px'
  toolbar.style.padding = '0'
  Object.defineProperty(toolbar, 'clientWidth', {
    configurable: true,
    get: () => width,
  })

  return {
    ...view,
    setWidth(nextWidth: number) {
      width = nextWidth
      for (const observer of ControlledResizeObserver.instances) {
        observer.trigger()
      }
    },
  }
}

describe('responsive toolbar overflow', () => {
  it('overflows in priority order, restores on widening, and keeps originals mounted', async () => {
    const view = renderResponsiveToolbar()

    view.setWidth(250)
    const oneActionMore = await screen.findByRole('button', {
      name: 'More toolbar actions (1)',
    })
    assert.equal(
      view.container
        .querySelector('[data-toolbar-item-id="build-run"]')
        ?.getAttribute('aria-hidden'),
      'true'
    )
    assert.equal(MountProbe.mounts, 1)
    assert.equal(MountProbe.unmounts, 0)

    view.setWidth(200)
    await screen.findByRole('button', { name: 'More toolbar actions (2)' })
    assert.equal(MountProbe.mounts, 1)
    assert.equal(MountProbe.unmounts, 0)

    view.setWidth(290)
    await waitFor(() =>
      assert.equal(
        screen.queryByRole('button', { name: /More toolbar actions/ }),
        null
      )
    )
    assert.equal(
      view.container
        .querySelector('[data-toolbar-item-id="build-run"]')
        ?.hasAttribute('aria-hidden'),
      false
    )
    assert.equal(MountProbe.mounts, 1)
    assert.equal(MountProbe.unmounts, 0)
    assert.equal(oneActionMore.isConnected, false)
  })

  it('supports Escape, outside-click, action close, and focus return', async () => {
    let buildClicks = 0
    const view = renderResponsiveToolbar(() => buildClicks++)
    view.setWidth(250)

    const more = await screen.findByRole('button', {
      name: 'More toolbar actions (1)',
    })
    fireEvent.click(more)
    let dialog = await screen.findByRole('dialog', {
      name: 'More toolbar actions',
    })
    assert.equal(more.getAttribute('aria-expanded'), 'true')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() =>
      assert.equal(
        screen.queryByRole('dialog', { name: 'More toolbar actions' }),
        null
      )
    )
    await waitFor(() => assert.equal(document.activeElement, more))

    fireEvent.click(more)
    await screen.findByRole('dialog', { name: 'More toolbar actions' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Build overflow action' })
    )
    await waitFor(() =>
      assert.equal(
        screen.queryByRole('dialog', { name: 'More toolbar actions' }),
        null
      )
    )
    assert.equal(buildClicks, 1)

    fireEvent.click(more)
    dialog = await screen.findByRole('dialog', {
      name: 'More toolbar actions',
    })
    fireEvent.click(document.body)
    await waitFor(() => assert.equal(dialog.isConnected, false))
  })

  it('moves focus with an action that crosses the overflow boundary', async () => {
    const view = renderResponsiveToolbar()
    const build = screen.getByRole('button', { name: 'Build original' })
    build.focus()

    view.setWidth(250)
    const more = await screen.findByRole('button', {
      name: 'More toolbar actions (1)',
    })
    await waitFor(() => assert.equal(document.activeElement, more))

    view.setWidth(290)
    await waitFor(() => assert.equal(document.activeElement, build))
    assert.equal(
      screen.queryByRole('button', { name: /More toolbar actions/ }),
      null
    )
  })

  it('keeps an open More surface stable while widening, then restores on close', async () => {
    const view = renderResponsiveToolbar()
    view.setWidth(250)

    const more = await screen.findByRole('button', {
      name: 'More toolbar actions (1)',
    })
    fireEvent.click(more)
    await screen.findByRole('dialog', { name: 'More toolbar actions' })

    view.setWidth(290)
    await waitFor(() => assert.equal(more.isConnected, true))
    assert.notEqual(
      screen.queryByRole('dialog', { name: 'More toolbar actions' }),
      null
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Close more toolbar actions' })
    )
    await waitFor(() =>
      assert.equal(
        screen.queryByRole('button', { name: /More toolbar actions/ }),
        null
      )
    )
  })
})
