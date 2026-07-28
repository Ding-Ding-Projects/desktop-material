import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import { createObservableRef } from '../../../src/ui/lib/observable-ref'
import {
  clampTooltipRectToWindow,
  Tooltip,
  TooltipDirection,
} from '../../../src/ui/lib/tooltip'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

interface ITooltipFixtureProps {
  readonly hosted?: boolean
}

class TooltipFixture extends React.Component<ITooltipFixtureProps> {
  private readonly target = createObservableRef<HTMLButtonElement>()

  public render() {
    const content = (
      <>
        <button ref={this.target} type="button">
          GraphQL
        </button>
        <Tooltip target={this.target} direction={TooltipDirection.SOUTH}>
          GraphQL
        </Tooltip>
      </>
    )

    return this.props.hosted ? (
      <div className="tooltip-host">{content}</div>
    ) : (
      content
    )
  }
}

/**
 * A mouse-anchored tooltip (no explicit `direction`) shown without a pointer —
 * the keyboard-focus path.
 */
class FocusTooltipFixture extends React.Component {
  private readonly target = createObservableRef<HTMLButtonElement>()

  public render() {
    return (
      <>
        <button ref={this.target} type="button">
          Add tab to new group…
        </button>
        <Tooltip target={this.target} openOnFocus={true}>
          Add tab to new group…
        </Tooltip>
      </>
    )
  }
}

interface IDisconnectableTooltipFixtureProps {
  readonly showTarget: boolean
}

/** Keep the Tooltip mounted while its transient target leaves the document. */
class DisconnectableTooltipFixture extends React.Component<IDisconnectableTooltipFixtureProps> {
  private readonly target = createObservableRef<HTMLButtonElement>()

  public render() {
    return (
      <>
        {this.props.showTarget ? (
          <button ref={this.target} type="button">
            Transient action
          </button>
        ) : null}
        <Tooltip target={this.target} openOnFocus={true}>
          Transient action
        </Tooltip>
      </>
    )
  }
}

describe('tooltip viewport containment', () => {
  it('dismisses stale body and host portals after the viewport changes', t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)

    for (const hosted of [false, true]) {
      const view = render(<TooltipFixture hosted={hosted} />)
      const target = screen.getByRole('button', { name: 'GraphQL' })
      target.getBoundingClientRect = () => new DOMRect(800, 80, 50, 24)

      fireEvent.mouseEnter(target, { clientX: 800, clientY: 80 })
      advanceTimersBy(400)

      const tooltip = screen.getByRole('tooltip', { hidden: true })
      assert.equal(
        tooltip.parentElement,
        hosted ? target.parentElement : document.body
      )

      fireEvent(window, new Event('resize'))

      assert.equal(screen.queryByRole('tooltip', { hidden: true }), null)
      view.unmount()
    }
  })

  it('keeps body portals fixed and every tooltip bounded by the viewport', () => {
    const styles = readFileSync(
      join(process.cwd(), 'app', 'styles', 'ui', 'window', '_tooltips.scss'),
      'utf8'
    )

    assert.match(styles, /body > \.tooltip\s*\{\s*position:\s*fixed/)
    assert.match(
      styles,
      /\.tooltip-host > \.tooltip\s*\{\s*position:\s*absolute/
    )
    assert.match(styles, /max-width:\s*min\(/)
    assert.match(styles, /calc\(100vw - var\(--spacing-double\)\)/)
    assert.match(styles, /max-height:\s*min\(/)
    assert.match(styles, /calc\(100vh - var\(--spacing-double\)\)/)
  })

  // Regression cover for the second half of #92: a `New tab group…` tip was
  // stranded in the window's top-left corner, most of it clipped away by the
  // window edge. `mouseRect` is only written by a mouse event over the target,
  // so a tooltip opened by focus had no pointer position at all and was placed
  // against a pristine `DOMRect()` sitting at the viewport origin.
  it('anchors a focus-shown tooltip to its target, not the viewport origin', t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)

    const view = render(<FocusTooltipFixture />)
    const target = screen.getByRole('button', { name: 'Add tab to new group…' })
    target.getBoundingClientRect = () => new DOMRect(800, 80, 50, 24)

    // focusin, with no mouseenter/mousemove first — exactly what a keyboard
    // user (or a restored focus after a menu closes) produces.
    fireEvent.focusIn(target)
    advanceTimersBy(400)

    const tooltip = screen.getByRole('tooltip', { hidden: true })
    // South-east of the target (825 - 10 - 6, 104 + 6), not translate(0px, 6px)
    // hanging off the top-left corner.
    assert.equal(tooltip.style.transform, 'translate(809px, 110px)')
    view.unmount()
  })

  it('never places a tooltip outside the window, even when no direction fits', () => {
    const windowRect = new DOMRect(0, 0, 1440, 960)

    // The exact geometry the stranded tip had: a degenerate target at the
    // origin, SOUTH fallback, so left is -width/2 and the chip hangs off the
    // left edge.
    assert.deepEqual(
      [
        clampTooltipRectToWindow(new DOMRect(-64, 6, 128, 28), windowRect).left,
        clampTooltipRectToWindow(new DOMRect(-64, 6, 128, 28), windowRect).top,
      ],
      [0, 6]
    )

    // Overflowing the right/bottom edges pulls it back in by exactly the
    // overflow, keeping the whole chip on screen.
    const bottomRight = clampTooltipRectToWindow(
      new DOMRect(1400, 950, 128, 28),
      windowRect
    )
    assert.deepEqual(
      [bottomRight.left, bottomRight.top],
      [1440 - 128, 960 - 28]
    )

    // A tooltip larger than the window pins to the top-left rather than to a
    // negative coordinate; the internal max-width/max-height then scroll it.
    const oversized = clampTooltipRectToWindow(
      new DOMRect(-40, -40, 2000, 1400),
      windowRect
    )
    assert.deepEqual([oversized.left, oversized.top], [0, 0])

    // A tooltip that already fits is left exactly where it was placed.
    const untouched = clampTooltipRectToWindow(
      new DOMRect(809, 110, 128, 28),
      windowRect
    )
    assert.deepEqual([untouched.left, untouched.top], [809, 110])
  })

  it('cancels a pending tooltip when its target is removed', async t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)

    const view = render(<DisconnectableTooltipFixture showTarget={true} />)
    const target = screen.getByRole('button', { name: 'Transient action' })
    fireEvent.focusIn(target)
    view.rerender(<DisconnectableTooltipFixture showTarget={false} />)

    await Promise.resolve()
    await Promise.resolve()
    advanceTimersBy(500)

    assert.equal(screen.queryByRole('tooltip', { hidden: true }), null)
    assert.equal(target.getAttribute('data-tooltip-target'), null)
  })

  it('dismisses a visible tooltip when its target is removed without blur or mouseout', async t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)

    const view = render(<DisconnectableTooltipFixture showTarget={true} />)
    const target = screen.getByRole('button', { name: 'Transient action' })
    fireEvent.focusIn(target)
    advanceTimersBy(400)
    assert.ok(screen.getByRole('tooltip', { hidden: true }))

    view.rerender(<DisconnectableTooltipFixture showTarget={false} />)
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(screen.queryByRole('tooltip', { hidden: true }), null)
    assert.equal(target.getAttribute('data-tooltip-target'), null)
    assert.equal(target.getAttribute('aria-describedby'), null)
  })
})
