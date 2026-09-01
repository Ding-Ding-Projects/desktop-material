import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import '../../helpers/ui/setup'
import {
  Md3MenuOverlayCanonicalRegistry,
  Md3MenuOverlayCompletenessRegistry,
} from '../../../src/lib/collection-surface-registry'
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
      Md3MenuOverlayCanonicalRegistry.map(entry => entry.kind),
      MenuKinds
    )
    assert.equal(
      new Set(Md3MenuOverlayCanonicalRegistry.map(entry => entry.kind)).size,
      MenuKinds.length
    )
    assert.deepEqual(
      Md3MenuOverlayCompletenessRegistry.map(entry => entry.kind),
      ['rowMenu', 'listMenu']
    )
    for (const entry of [
      ...Md3MenuOverlayCanonicalRegistry,
      ...Md3MenuOverlayCompletenessRegistry,
    ]) {
      assert.equal(entry.implementation, 'Md3MenuOverlay')
      assert.equal(entry.supportsAnchoring, true)
      assert.equal(entry.supportsCenteredFallback, true)
      assert.ok(entry.searchSurfacePrefix.endsWith('-'))
    }
    assert.deepEqual(Md3MenuOverlayCompletenessRegistry[0].liveConsumers, [
      'md3-authenticator-view.tsx',
      'md3-support-tickets-view.tsx',
    ])
    assert.deepEqual(Md3MenuOverlayCompletenessRegistry[1].liveConsumers, [
      'md3-authenticator-view.tsx',
      'md3-locks-view.tsx',
      'md3-support-tickets-view.tsx',
    ])
  })

  it('binds every canonical kind to a factory case and live kinds to consumers', () => {
    const menuSpecs = readFileSync(
      join(process.cwd(), 'app', 'src', 'ui', 'md3', 'md3-menu-specs.ts'),
      'utf8'
    )
    for (const entry of Md3MenuOverlayCanonicalRegistry) {
      assert.match(
        menuSpecs,
        new RegExp(`^\\s*case '${entry.kind}':`, 'm'),
        `Missing getMenuSpec case for ${entry.kind}`
      )
    }
    for (const entry of Md3MenuOverlayCompletenessRegistry) {
      assert.ok(entry.liveConsumers !== undefined)
      for (const consumer of entry.liveConsumers) {
        const consumerSource = readFileSync(
          join(process.cwd(), 'app', 'src', 'ui', 'md3', consumer),
          'utf8'
        )
        assert.match(consumerSource, /<Md3MenuOverlay\b/)
        assert.match(consumerSource, /\binstanceId=/)
        assert.match(consumerSource, /\banchor=/)
      }
    }
  })

  it('turns red when a factory case is removed, then returns green restored', () => {
    const menuSpecsPath = join(
      process.cwd(),
      'app',
      'src',
      'ui',
      'md3',
      'md3-menu-specs.ts'
    )
    const original = readFileSync(menuSpecsPath, 'utf8')
    const assertFactoryCase = (contents: string) => {
      for (const entry of Md3MenuOverlayCanonicalRegistry) {
        assert.match(contents, new RegExp(`^\\s*case '${entry.kind}':`, 'm'))
      }
    }
    assertFactoryCase(original)
    const removed = original.replace(/^\s*case 'rowMenu':.*$/m, '')
    assert.throws(() => assertFactoryCase(removed))
    assertFactoryCase(original)
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

  it('applies regex flags to membership, validation, and count', () => {
    const multiline = [
      {
        ...spec('rowMenu', 'Rows').items[0],
        label: 'first\nsecond',
      },
      {
        ...spec('rowMenu', 'Rows').items[1],
        label: 'SECOND',
      },
    ]
    const caseSensitive = filterMenuItems(multiline, '^second$', true, {
      g: false,
      i: false,
      m: true,
      s: false,
      u: true,
      y: false,
    })
    assert.equal(caseSensitive.patternInvalid, false)
    assert.deepEqual(
      caseSensitive.items.map(item => item.label),
      ['first\nsecond']
    )

    const caseInsensitive = filterMenuItems(multiline, '^second$', true, {
      g: false,
      i: true,
      m: true,
      s: false,
      u: true,
      y: false,
    })
    assert.deepEqual(
      caseInsensitive.items.map(item => item.label),
      ['first\nsecond', 'SECOND']
    )

    const dotAll = filterMenuItems(multiline, '^first.second$', true, {
      g: false,
      i: true,
      m: false,
      s: true,
      u: true,
      y: false,
    })
    assert.deepEqual(
      dotAll.items.map(item => item.label),
      ['first\nsecond']
    )

    const sticky = filterMenuItems(multiline, 'second$', true, {
      g: false,
      i: true,
      m: false,
      s: false,
      u: true,
      y: true,
    })
    assert.deepEqual(
      sticky.items.map(item => item.label),
      ['SECOND']
    )
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

  it('keeps an anchored parent open across every nested builder interaction', () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 768,
    })
    let dismissed = 0
    render(
      <Md3MenuOverlay
        spec={spec('rowMenu', 'Nested row')}
        instanceId="nested"
        anchor={anchor}
        onDismiss={() => dismissed++}
      />
    )
    const opener = screen.getByRole('button', { name: /Regex builder for/ })
    fireEvent.click(opener)
    const builder = document.querySelector('.md3-regex-builder')
    assert.ok(builder)
    assert.equal(
      document
        .querySelector('.md3-regex-builder-owned-portal')
        ?.getAttribute('data-search-surface-id'),
      'md3-menu-rowMenu-nested'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Flag g — global' }))
    fireEvent.change(screen.getByLabelText('Regular expression pattern'), {
      target: { value: '^Export' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert $ — end' }))
    assert.ok(document.querySelector('.md3-menu-overlay__panel'))
    fireEvent.click(
      screen.getByRole('button', { name: /Apply to search Nested row/ })
    )
    assert.equal(document.querySelector('.md3-regex-builder'), null)
    assert.equal(dismissed, 0)
    assert.ok(document.querySelector('[data-menu-instance-id="nested"]'))

    fireEvent.click(opener)
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the regex builder' })
    )
    assert.equal(document.querySelector('.md3-regex-builder'), null)
    assert.equal(dismissed, 0)
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
