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
