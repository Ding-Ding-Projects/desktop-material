import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { render, fireEvent, waitFor } from '../helpers/ui/render'
import { AriaLiveContainer } from '../../src/ui/accessibility/aria-live-container'
import { Button } from '../../src/ui/lib/button'
import { Checkbox } from '../../src/ui/lib/checkbox'
import { DialogHeader } from '../../src/ui/dialog/header'
import { DialogContent } from '../../src/ui/dialog/content'
import { Ref } from '../../src/ui/lib/ref'
import { TextBox } from '../../src/ui/lib/text-box'
import { TextArea } from '../../src/ui/lib/text-area'
import { Select } from '../../src/ui/lib/select'
import { RadioButton } from '../../src/ui/lib/radio-button'
import { RangeSlider } from '../../src/ui/lib/range-slider'
import { ToolbarDropdown } from '../../src/ui/toolbar/dropdown'
import { PersonalVocabularyControl } from '../../src/ui/preferences/personal-vocabulary-control'
import { NotificationListItem } from '../../src/ui/notifications/notification-list-item'
import type { INotificationEntry } from '../../src/models/notification-centre'
import {
  PersonalVocabularyBoundaryAnchors,
  assertPersonalVocabularyBoundaryInventory,
  PersonalVocabularyBoundaryInventory,
  personalizeHostTextProps,
  personalizeReactNode,
} from '../../src/lib/personal-vocabulary-rendering'
import {
  clearPersonalVocabulary,
  setActivePersonalVocabulary,
  type IPersonalVocabulary,
} from '../../src/lib/personal-vocabulary'
import { bilingualVariable, translate } from '../../src/lib/i18n'

/**
 * Synthetic test-only wording. It proves boundary behavior without carrying a
 * user's private vocabulary, a shipped mapping, or a default into the tree.
 */
const fixtureReplacement = (index: number) => `fixture-replacement-${index}`
const fixtureSources = [
  'Current repository',
  'Current worktree',
  'Current branch',
  'Select notification:',
  'Mark as read',
  'Clear',
] as const

const testVocabulary: IPersonalVocabulary = {
  schemaVersion: 1,
  terms: new Map(
    fixtureSources.map((source, index) => [source, fixtureReplacement(index)])
  ),
}

beforeEach(() => {
  setActivePersonalVocabulary(testVocabulary)
})

afterEach(() => {
  clearPersonalVocabulary()
  setActivePersonalVocabulary(null)
})

describe('personal vocabulary boundary inventory', () => {
  it('keeps a hand-written row for every rendered boundary category', () => {
    assert.doesNotThrow(() => assertPersonalVocabularyBoundaryInventory())
    assert.deepStrictEqual(
      [...PersonalVocabularyBoundaryInventory],
      [
        'visible-text-children',
        'accessible-name',
        'title-and-tooltip',
        'input-label-and-placeholder',
        'context-menu-label',
        'dialog-header',
        'dropdown-and-overflow',
        'palette-search-result',
        'notification-copy',
        'aria-live-copy',
        'repository-selector',
        'worktree-selector',
        'branch-selector',
        'technical-content-preservation',
        'host-text-properties',
      ]
    )
  })

  it('turns red when one inventory row is removed, then green when restored', () => {
    const missing = PersonalVocabularyBoundaryInventory.slice(0, -1)
    assert.throws(() => assertPersonalVocabularyBoundaryInventory(missing))
    assert.doesNotThrow(() =>
      assertPersonalVocabularyBoundaryInventory(
        PersonalVocabularyBoundaryInventory
      )
    )
  })

  it('turns red when a category anchor is missing or empty', () => {
    const missingPaletteAnchor = { ...PersonalVocabularyBoundaryAnchors }
    Reflect.deleteProperty(missingPaletteAnchor, 'palette-search-result')
    assert.throws(() =>
      assertPersonalVocabularyBoundaryInventory(
        PersonalVocabularyBoundaryInventory,
        missingPaletteAnchor
      )
    )

    const emptySelectorAnchor = {
      ...PersonalVocabularyBoundaryAnchors,
      'branch-selector': '',
    }
    assert.throws(() =>
      assertPersonalVocabularyBoundaryInventory(
        PersonalVocabularyBoundaryInventory,
        emptySelectorAnchor
      )
    )

    assert.doesNotThrow(() =>
      assertPersonalVocabularyBoundaryInventory(
        PersonalVocabularyBoundaryInventory,
        PersonalVocabularyBoundaryAnchors
      )
    )
  })

  it('keeps every anchor wired to a real source boundary', () => {
    for (const [id, anchor] of Object.entries(
      PersonalVocabularyBoundaryAnchors
    )) {
      const separator = anchor.indexOf(':')
      assert.ok(separator > 0, `${id} has no source separator`)
      const file = anchor.slice(0, separator)
      const needle = anchor.slice(separator + 1)
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      assert.ok(source.includes(needle), `${id} anchor is stale: ${anchor}`)
    }

    const missingAnchor = {
      ...PersonalVocabularyBoundaryAnchors,
      'palette-search-result':
        'app/src/ui/command-palette/command-palette.tsx:removed-boundary',
    }
    assert.throws(() => {
      const anchor = missingAnchor['palette-search-result']
      const separator = anchor.indexOf(':')
      const source = readFileSync(
        join(process.cwd(), anchor.slice(0, separator)),
        'utf8'
      )
      assert.ok(source.includes(anchor.slice(separator + 1)))
    })
  })
})

describe('personal vocabulary reaches typed React boundaries', () => {
  it('refreshes the production control after apply, invalid import, and clear', async () => {
    setActivePersonalVocabulary(null)
    const { container } = render(<PersonalVocabularyControl />)
    const input = container.querySelector('input[type="file"]')
    assert.ok(input)
    assert.ok(container.textContent?.includes('Choose a vocabulary file'))
    assert.equal(container.querySelector('button'), null)

    const validFile = new File(
      [
        JSON.stringify({
          schemaVersion: 1,
          entries: { 'source-token': 'replacement-token' },
        }),
      ],
      'fixture.json',
      { type: 'application/json' }
    )
    fireEvent.change(input, { target: { files: [validFile] } })
    await waitFor(() => assert.ok(container.querySelector('button')))

    const invalidFile = new File(['{'], 'invalid.json', {
      type: 'application/json',
    })
    fireEvent.change(input, { target: { files: [invalidFile] } })
    await waitFor(() => {
      assert.ok(
        container.textContent?.includes(
          'That vocabulary file was not accepted. Nothing has been changed.'
        )
      )
      assert.ok(container.querySelector('button'))
    })

    const unreadableFile = {
      size: 1,
      arrayBuffer: async () => {
        throw new Error('private path must not appear')
      },
    } as unknown as File
    fireEvent.change(input, { target: { files: [unreadableFile] } })
    await waitFor(() => {
      assert.ok(
        container.textContent?.includes(
          'That vocabulary file could not be read. Nothing has been changed.'
        )
      )
      assert.ok(
        !container.textContent?.includes('private path must not appear')
      )
      assert.ok(container.querySelector('button'))
    })

    fireEvent.click(container.querySelector('button')!)
    await waitFor(() => {
      assert.ok(
        container.textContent?.includes(
          'No vocabulary file is loaded. Every surface is rendering its original wording.'
        )
      )
      assert.equal(container.querySelector('button'), null)
    })
  })

  it('refreshes local notification copy through its PureComponent lifecycle', async () => {
    setActivePersonalVocabulary(null)
    const entry: INotificationEntry = {
      id: 'fixture-notification',
      kind: 'info',
      title: 'Current repository',
      body: 'Current branch',
      createdAt: new Date(0).toISOString(),
      read: false,
    }
    const { container } = render(
      <NotificationListItem
        entry={entry}
        selected={false}
        onToggleSelected={() => undefined}
        onActivate={() => undefined}
        onToggleRead={() => undefined}
        onDelete={() => undefined}
      />
    )
    assert.ok(container.textContent?.includes('Current repository'))

    setActivePersonalVocabulary(testVocabulary)
    await waitFor(() => {
      assert.ok(container.textContent?.includes(fixtureReplacement(0)))
      assert.ok(container.textContent?.includes(fixtureReplacement(2)))
    })
  })

  it('updates visible children, accessible names, title/tooltip, and inputs', async () => {
    const { container } = render(
      <>
        <Button ariaLabel="Current branch" tooltip="Current worktree">
          Current repository
        </Button>
        <TextBox
          label="Current repository"
          placeholder="Current worktree"
          ariaLabel="Current branch"
        />
        <Checkbox
          value={0}
          label="Current repository"
          ariaLabel="Current branch"
        />
        <TextArea
          label="Current repository"
          placeholder="Current worktree"
          ariaLabel="Current branch"
        />
        <Select label="Current repository">
          <option value="branch">Current branch</option>
        </Select>
        <RadioButton
          value="branch"
          checked={true}
          label="Current branch"
          onSelected={() => undefined}
        />
        <RangeSlider
          id="vocabulary-range"
          label="Current worktree"
          value={1}
          min={1}
          max={5}
          step={1}
          onChange={() => undefined}
        />
      </>
    )

    const button = container.querySelector('button')
    assert.ok(button)
    assert.strictEqual(button.getAttribute('aria-label'), fixtureReplacement(2))
    assert.ok(button.textContent?.includes(fixtureReplacement(0)))

    const input = container.querySelector('input[type="text"]')
    assert.ok(input)
    assert.strictEqual(input.getAttribute('placeholder'), fixtureReplacement(1))
    assert.strictEqual(input.getAttribute('aria-label'), fixtureReplacement(2))
    assert.ok(container.textContent?.includes(fixtureReplacement(0)))

    const tooltipTarget = button
    fireEvent.mouseEnter(tooltipTarget)
    await waitFor(() => {
      const tooltip =
        container.ownerDocument.body.querySelector('[role="tooltip"]')
      assert.ok(tooltip)
      assert.ok(tooltip.textContent?.includes(fixtureReplacement(1)))
    })
  })

  it('updates dialog, dropdown/selector, and live-region copy', () => {
    const { container } = render(
      <>
        <DialogHeader title="Current repository" />
        <DialogContent>
          <p>Current branch</p>
        </DialogContent>
        <ToolbarDropdown
          title="feature/current-branch"
          description="Current branch"
          tooltip="Current worktree"
          dropdownState="closed"
          onDropdownStateChanged={() => undefined}
          dropdownContentRenderer={() => null}
        />
        <AriaLiveContainer message="Current branch" />
      </>
    )

    assert.ok(
      container
        .querySelector('h1')
        ?.textContent?.includes(fixtureReplacement(0))
    )
    assert.ok(container.textContent?.includes(fixtureReplacement(2)))
    // The closed dropdown owns the tooltip but does not mount the portal until
    // the user opens/points at it; its visible selector copy is still covered
    // by the description and title assertions above.
    assert.ok(container.textContent?.includes('feature/current-branch'))
  })

  it('preserves technical and explicitly hidden content', () => {
    const { container } = render(
      <>
        {personalizeReactNode(
          <>
            <code>Current branch</code>
            <Ref>Current branch</Ref>
            <span aria-hidden={true}>Current branch</span>
          </>
        )}
        <AriaLiveContainer
          message="Current branch"
          preserveTechnicalMessage={true}
        />
      </>
    )

    assert.ok(container.textContent?.includes('Current branch'))
    assert.ok(!container.textContent?.includes(fixtureReplacement(2)))
  })

  it('personalizes a wrapped string exactly once', () => {
    setActivePersonalVocabulary({
      schemaVersion: 1,
      terms: new Map([
        ['source-token', 'middle-token'],
        ['middle-token', 'final-token'],
      ]),
    })
    const firstBoundary = personalizeReactNode(<span>source-token</span>)
    const secondBoundary = personalizeReactNode(firstBoundary)
    const { container } = render(<>{secondBoundary}</>)
    assert.strictEqual(container.textContent, 'middle-token')
  })

  it('personalizes catalog prose but preserves exact interpolation values', () => {
    setActivePersonalVocabulary({
      schemaVersion: 1,
      terms: new Map([
        ['Failed updating', 'Fixture update failed'],
        ['Current branch', 'Fixture branch'],
      ]),
    })
    const path = 'C:/Current repository/Current branch'
    const error = 'SHA Current branch'
    const output = translate('submodule.updateFailed', 'english', {
      path,
      error,
    })
    assert.ok(output.startsWith('Fixture update failed'))
    assert.ok(output.includes(path))
    assert.ok(output.includes(error))

    // Deliberately model the old unsafe implementation: personalize the
    // fully interpolated sentence. The exact-value assertions above must
    // distinguish that red result from the protected current result.
    const brokenLegacyResult = personalizeHostTextProps({
      title: `Failed updating ${path}: ${error}`,
    }).title
    assert.throws(() => assert.strictEqual(brokenLegacyResult, output))
    assert.notStrictEqual(brokenLegacyResult, output)

    const bilingual = translate('submodule.updateFailed', 'bilingual', {
      path: bilingualVariable(path, path),
      error: bilingualVariable(error, error),
    })
    assert.ok(bilingual.includes(path))
    assert.ok(bilingual.includes(error))
  })

  it('personalizes only the typed host text properties', () => {
    const output = personalizeHostTextProps({
      'aria-label': 'Current branch',
      title: 'Current worktree',
      placeholder: 'Current repository',
      value: 'Current branch',
      id: 'Current branch',
    })
    assert.strictEqual(output['aria-label'], fixtureReplacement(2))
    assert.strictEqual(output.title, fixtureReplacement(1))
    assert.strictEqual(output.placeholder, fixtureReplacement(0))
    assert.strictEqual(output.value, 'Current branch')
    assert.strictEqual(output.id, 'Current branch')
  })
})
