import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import '../../helpers/ui/setup'
import { Md3MenuOverlayCompletenessRegistry } from '../../../src/lib/collection-surface-registry'
import {
  filterMenuItems,
  Md3MenuOverlay,
} from '../../../src/ui/md3/md3-menu-overlay'
import { IMd3MenuSpec, MenuKinds } from '../../../src/ui/md3/md3-menu-specs'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const spec = (kind: IMd3MenuSpec['kind'], title: string): IMd3MenuSpec => ({
  kind,
  title,
  icon: 'menu',
  width: 320,
  hasFilter: true,
  filterPlaceholder: 'Search actions',
  items: [
    {
      id: 'export',
      label: 'Export record',
      icon: 'cloud_download',
      hint: '',
      onClick: () => undefined,
    },
    {
      id: 'openRegexBuilder',
      label: 'Open regex builder',
      icon: 'construction',
      hint: '',
      onClick: () => undefined,
    },
  ],
})

describe('MD3 menu overlay completeness', () => {
  it('keeps one explicit registry row for every menu kind', () => {
    assert.deepEqual(
      Md3MenuOverlayCompletenessRegistry.map(entry => entry.kind),
      MenuKinds
    )
    assert.equal(
      new Set(Md3MenuOverlayCompletenessRegistry.map(entry => entry.kind)).size,
      MenuKinds.length
    )
    for (const entry of Md3MenuOverlayCompletenessRegistry) {
      assert.equal(entry.implementation, 'Md3MenuOverlay')
      assert.equal(entry.supportsAnchoring, true)
      assert.equal(entry.supportsCenteredFallback, true)
      assert.ok(entry.searchSurfacePrefix.endsWith('-'))
    }
  })

  it('filters invalid patterns without hiding actions and reports no matches', () => {
    const items = spec('rowMenu', 'Row actions').items
    const invalid = filterMenuItems(items, '(', true)
    assert.equal(invalid.patternInvalid, true)
    assert.equal(invalid.items.length, items.length)

    const empty = filterMenuItems(items, 'missing', false)
    assert.equal(empty.patternInvalid, false)
    assert.equal(empty.items.length, 0)
  })

  it('gives simultaneous menu instances isolated search surfaces', () => {
    render(
      <>
        <Md3MenuOverlay
          spec={spec('rowMenu', 'First row')}
          instanceId="first"
          onDismiss={() => undefined}
        />
        <Md3MenuOverlay
          spec={spec('rowMenu', 'Second row')}
          instanceId="second"
          onDismiss={() => undefined}
        />
      </>
    )

    const inputs = screen.getAllByRole('searchbox') as HTMLInputElement[]
    assert.equal(inputs.length, 2)
    assert.notEqual(inputs[0].id, inputs[1].id)
    assert.notEqual(
      inputs[0].getAttribute('data-search-surface-id'),
      inputs[1].getAttribute('data-search-surface-id')
    )
    assert.match(
      inputs[0].getAttribute('data-search-surface-id') ?? '',
      /md3-menu-rowMenu-first/
    )
    assert.match(
      inputs[1].getAttribute('data-search-surface-id') ?? '',
      /md3-menu-rowMenu-second/
    )
  })

  it('keeps the menu mounted while its own builder applies and cancels', () => {
    render(
      <Md3MenuOverlay
        spec={spec('listMenu', 'Export actions')}
        instanceId="export-one"
        onDismiss={() => undefined}
      />
    )

    const input = screen.getByRole('searchbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'export' } })
    assert.equal(input.dataset.searchMode, 'substring')
    assert.equal(input.dataset.searchPattern, 'export')
    assert.match(input.dataset.searchHistory ?? '', /export/)
    fireEvent.click(screen.getByRole('button', { name: /Regex builder for/ }))
    assert.ok(document.querySelector('.md3-regex-builder'))
    assert.match(
      screen
        .getByRole('dialog', {
          name: /Regex builder .*Export actions \(export-one\)/,
        })
        .getAttribute('data-search-surface-id') ?? '',
      /md3-menu-listMenu-export-one/
    )
    assert.ok(document.querySelector('[data-menu-instance-id="export-one"]'))

    fireEvent.change(screen.getByLabelText('Regular expression pattern'), {
      target: { value: '^export' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Apply to search Export actions/ })
    )
    assert.equal(input.value, '^export')
    assert.equal(input.getAttribute('aria-invalid'), null)

    fireEvent.click(screen.getByRole('button', { name: /Regex builder for/ }))
    fireEvent.keyDown(screen.getByLabelText('Regular expression pattern'), {
      key: 'Escape',
    })
    assert.equal(document.querySelector('.md3-regex-builder'), null)
    assert.ok(document.querySelector('[data-menu-instance-id="export-one"]'))
  })

  it('keeps invalid regex input visible and shows an honest no-match state', () => {
    render(
      <Md3MenuOverlay
        spec={spec('rowMenu', 'Filterable row')}
        instanceId="invalid"
        onDismiss={() => undefined}
      />
    )
    const input = screen.getByRole('searchbox')
    fireEvent.click(screen.getByRole('button', { name: /Regex mode for/ }))
    fireEvent.change(input, { target: { value: '(' } })
    assert.equal(screen.getAllByRole('menuitem').length, 2)
    assert.ok(screen.getByText(/not a valid regular expression/i))
    fireEvent.click(
      screen.getByRole('button', { name: /Clear Filterable row/ })
    )
    fireEvent.change(input, { target: { value: 'missing' } })
    assert.equal(
      screen.queryByRole('menuitem', { name: 'Open regex builder' }),
      null
    )
    assert.ok(screen.getByText(/Nothing in Filterable row matches/))
  })

  it('uses the centered fallback only for a constrained anchored viewport', () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 480,
    })
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    render(
      <Md3MenuOverlay
        spec={spec('rowMenu', 'Constrained row')}
        instanceId="constrained"
        anchor={anchor}
        onDismiss={() => undefined}
      />
    )
    assert.ok(document.querySelector('.md3-menu-overlay'))
    assert.equal(document.querySelector('.popover-component'), null)
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalHeight,
    })
    anchor.remove()
  })

  it('keeps each menu item at the accessible 40px hit-area floor', () => {
    const styles = readFileSync(
      join(process.cwd(), 'app', 'styles', 'ui', '_md3-menu-overlay.scss'),
      'utf8'
    )
    assert.match(
      styles,
      /\.md3-menu-overlay__item\s*\{[\s\S]*?min-height:\s*40px;/
    )
  })
})
