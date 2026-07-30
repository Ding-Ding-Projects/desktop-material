import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { RegexBuilder } from '../../../src/ui/lib/regex-builder/regex-builder'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

function renderBuilder() {
  render(
    <RegexBuilder
      targetLabel="Changes"
      initialPattern=""
      sampleItems={[]}
      onApply={() => undefined}
      onDismissed={() => undefined}
    />
  )
}

describe('RegexBuilder keyboard tabs', () => {
  it('owns Escape after background focus and restores focus exactly once', () => {
    let builderDismissals = 0
    let hostDismissals = 0
    let nextFrameId = 0
    const scheduledFrames = new Map<number, FrameRequestCallback>()
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    window.requestAnimationFrame = callback => {
      const frameId = ++nextFrameId
      scheduledFrames.set(frameId, callback)
      return frameId
    }
    window.cancelAnimationFrame = frameId => {
      scheduledFrames.delete(frameId)
    }

    function NestedBuilderHarness() {
      const [builderOpen, setBuilderOpen] = React.useState(false)

      const onHostKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          hostDismissals++
        }
      }

      return (
        // The focusable test dialog models the host's real Escape handler.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          role="dialog"
          aria-label="Host dialog"
          tabIndex={-1}
          onKeyDown={onHostKeyDown}
        >
          <button type="button" onClick={() => setBuilderOpen(true)}>
            Open regex builder
          </button>
          {builderOpen ? (
            <RegexBuilder
              targetLabel="Changes"
              initialPattern=""
              sampleItems={[]}
              onApply={() => undefined}
              onDismissed={() => {
                builderDismissals++
                setBuilderOpen(false)
              }}
            />
          ) : null}
        </div>
      )
    }

    const view = render(<NestedBuilderHarness />)
    try {
      const opener = screen.getByRole('button', { name: 'Open regex builder' })
      opener.focus()
      fireEvent.click(opener)

      const patternInput = screen.getByRole('textbox', {
        name: 'Regular expression pattern',
      })
      assert.equal(document.activeElement, patternInput)

      // The overlay is intentionally non-modal, so a user can move focus back
      // to its host while the builder remains open. Escape must still belong
      // to the builder and never leak into the host dialog.
      opener.focus()
      assert.equal(document.activeElement, opener)
      const propagated = fireEvent.keyDown(opener, {
        key: 'Escape',
        code: 'Escape',
      })

      assert.equal(propagated, false, 'the builder prevents the Escape default')
      assert.equal(builderDismissals, 1)
      assert.equal(hostDismissals, 0)
      assert.equal(
        screen.queryByRole('dialog', { name: 'Build regular expression' }),
        null
      )

      assert.equal(scheduledFrames.size, 1)
      const returnFocusFrame = Array.from(scheduledFrames.values())[0]
      assert.ok(returnFocusFrame)
      returnFocusFrame(0)
      assert.equal(document.activeElement, opener)
    } finally {
      view.unmount()
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('roves through the view tabs and keeps every controlled panel mounted', () => {
    renderBuilder()

    const tablist = screen.getByRole('tablist', {
      name: 'Regex builder views',
    })
    const build = within(tablist).getByRole('tab', { name: 'Build' })
    const guide = within(tablist).getByRole('tab', {
      name: 'How regex works',
    })
    const buildPanel = document.getElementById(
      build.getAttribute('aria-controls') ?? ''
    ) as HTMLDivElement | null
    const guidePanel = document.getElementById(
      guide.getAttribute('aria-controls') ?? ''
    ) as HTMLDivElement | null

    assert.ok(buildPanel)
    assert.ok(guidePanel)
    assert.equal(build.tabIndex, 0)
    assert.equal(guide.tabIndex, -1)
    assert.equal(buildPanel.hidden, false)
    assert.equal(guidePanel.hidden, true)

    build.focus()
    fireEvent.keyDown(build, { key: 'ArrowLeft' })
    assert.equal(document.activeElement, guide)
    assert.equal(guide.getAttribute('aria-selected'), 'true')
    assert.equal(guide.tabIndex, 0)
    assert.equal(build.tabIndex, -1)
    assert.equal(buildPanel.hidden, true)
    assert.equal(guidePanel.hidden, false)

    fireEvent.keyDown(guide, { key: 'Home' })
    assert.equal(document.activeElement, build)
    assert.equal(build.getAttribute('aria-selected'), 'true')

    fireEvent.keyDown(build, { key: 'End' })
    assert.equal(document.activeElement, guide)
    fireEvent.keyDown(guide, { key: 'ArrowRight' })
    assert.equal(document.activeElement, build)
  })

  it('roves through palette categories and keeps their shared panel connected', () => {
    renderBuilder()

    const tablist = screen.getByRole('tablist', {
      name: 'Regular expression building-block categories',
    })
    const tabs = within(tablist).getAllByRole('tab')
    const first = tabs[0]
    const last = tabs[tabs.length - 1]
    const panelId = first.getAttribute('aria-controls') ?? ''
    const panel = document.getElementById(panelId)

    assert.ok(panel)
    assert.ok(
      tabs.every(tab => tab.getAttribute('aria-controls') === panelId),
      'every category tab controls the mounted token panel'
    )
    assert.equal(first.tabIndex, 0)
    assert.ok(tabs.slice(1).every(tab => tab.tabIndex === -1))

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    assert.equal(document.activeElement, tabs[1])
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
    assert.equal(panel?.getAttribute('aria-labelledby'), tabs[1].id)

    fireEvent.keyDown(tabs[1], { key: 'ArrowUp' })
    assert.equal(document.activeElement, first)
    assert.equal(first.getAttribute('aria-selected'), 'true')

    fireEvent.keyDown(first, { key: 'ArrowUp' })
    assert.equal(document.activeElement, last)
    assert.equal(last.getAttribute('aria-selected'), 'true')
    assert.equal(last.tabIndex, 0)
    assert.equal(first.tabIndex, -1)
    assert.equal(panel?.getAttribute('aria-labelledby'), last.id)

    fireEvent.keyDown(last, { key: 'Home' })
    assert.equal(document.activeElement, first)
    assert.equal(panel?.getAttribute('aria-labelledby'), first.id)

    fireEvent.keyDown(first, { key: 'End' })
    assert.equal(document.activeElement, last)
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    assert.equal(document.activeElement, first)
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    assert.equal(document.activeElement, last)
  })
})
