import assert from 'node:assert'
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
import {
  assertPersonalVocabularyBoundaryInventory,
  PersonalVocabularyBoundaryInventory,
  personalizeReactNode,
} from '../../src/lib/personal-vocabulary-rendering'
import {
  PersonalVocabularyChangedEvent,
  setActivePersonalVocabulary,
  type IPersonalVocabulary,
} from '../../src/lib/personal-vocabulary'
import { personalizeText } from '../../src/lib/i18n'

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
  setActivePersonalVocabulary(null)
})

class VocabularyRefreshProbe extends React.Component<{}, {}> {
  public componentDidMount() {
    window.addEventListener(PersonalVocabularyChangedEvent, this.onChanged)
  }

  public componentWillUnmount() {
    window.removeEventListener(PersonalVocabularyChangedEvent, this.onChanged)
  }

  private onChanged = () => this.forceUpdate()

  public render() {
    return <span>{personalizeText('Current repository')}</span>
  }
}

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
})

describe('personal vocabulary reaches typed React boundaries', () => {
  it('refreshes an already-mounted surface after apply and clear', async () => {
    setActivePersonalVocabulary(null)
    const { container } = render(<VocabularyRefreshProbe />)
    assert.strictEqual(container.textContent, 'Current repository')

    setActivePersonalVocabulary(testVocabulary)
    await waitFor(() =>
      assert.strictEqual(container.textContent, fixtureReplacement(0))
    )

    setActivePersonalVocabulary(null)
    await waitFor(() =>
      assert.strictEqual(container.textContent, 'Current repository')
    )
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
      </>
    )

    assert.strictEqual(
      container.textContent,
      'Current branchCurrent branchCurrent branch'
    )
  })
})
