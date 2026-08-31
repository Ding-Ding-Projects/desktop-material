import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from '../../src/ui/preferences/settings-explanation'
import {
  assertImplementedSettingExplanationIds,
  ImplementedSettingExplanationIds,
} from '../../src/ui/preferences/settings-explanation-inventory'
import { render, screen } from '../helpers/ui/render'
import { Accessibility } from '../../src/ui/preferences/accessibility'
import {
  showDiffCheckMarksKey,
  underlineLinksKey,
} from '../../src/lib/stores/app-store'
import { LanguageModeStorageKey } from '../../src/lib/language-preference'

afterEach(() => {
  localStorage.removeItem(underlineLinksKey)
  localStorage.removeItem(showDiffCheckMarksKey)
  localStorage.removeItem(LanguageModeStorageKey)
})

describe('setting explanation', () => {
  it('keeps an exact hand-written inventory and turns red when one row disappears', () => {
    assertImplementedSettingExplanationIds(ImplementedSettingExplanationIds)
    assert.throws(() =>
      assertImplementedSettingExplanationIds(
        ImplementedSettingExplanationIds.filter(
          id => id !== 'status-hub-endpoint'
        )
      )
    )
  })

  it('keeps the explanation collapsed while exposing both descriptions', () => {
    const ids = settingExplanationDescriptionIds('example-setting')
    assert.deepEqual(ids, {
      explanationId: 'example-setting-setting-explanation',
      provenanceId: 'example-setting-setting-provenance',
      ariaDescribedBy:
        'example-setting-setting-explanation example-setting-setting-provenance',
    })

    const view = render(
      <SettingExplanation
        settingId="example-setting"
        summary="What this setting changes"
        explanation="Changes the example behavior without changing saved documents."
        provenance="No choice is recorded. Current and shipped value: off."
        source="compiled-default"
      />
    )

    const details = screen
      .getByText('What this setting changes')
      .closest('details') as HTMLDetailsElement
    assert.ok(details)
    assert.equal(details.open, false)
    assert.equal(
      view.container
        .querySelector('[data-setting-explanation-id="example-setting"]')
        ?.getAttribute('data-setting-provenance'),
      'compiled-default'
    )
    assert.equal(
      view.container.querySelector(`#${ids.explanationId}`)?.textContent,
      'Changes the example behavior without changing saved documents.'
    )
    assert.equal(
      view.container.querySelector(`#${ids.provenanceId}`)?.textContent,
      'No choice is recorded. Current and shipped value: off.'
    )
  })

  it('changes the machine-readable source with the rendered provenance', () => {
    const view = render(
      <SettingExplanation
        settingId="stored-setting"
        summary="What this setting changes"
        explanation="Controls the stored behavior."
        provenance="A choice is recorded. Current value: on. Shipped value: off."
        source="stored-choice"
      />
    )

    assert.equal(
      view.container
        .querySelector('[data-setting-explanation-id="stored-setting"]')
        ?.getAttribute('data-setting-provenance'),
      'stored-choice'
    )
  })

  it('distinguishes accessibility defaults from stored choices in every language mode', () => {
    const props = {
      underlineLinks: true,
      showDiffCheckMarks: true,
      onUnderlineLinksChanged: () => undefined,
      onShowDiffCheckMarksChanged: () => undefined,
    }
    const initial = render(<Accessibility {...props} />)

    assert.equal(
      initial.container
        .querySelector(
          '[data-setting-explanation-id="accessibility-underline-links"]'
        )
        ?.getAttribute('data-setting-provenance'),
      'compiled-default'
    )
    assert.equal(
      screen.getAllByText(
        'No choice is recorded on this computer. Current and shipped value: on.'
      ).length,
      2
    )
    initial.unmount()

    localStorage.setItem(underlineLinksKey, '0')
    localStorage.setItem(showDiffCheckMarksKey, '0')
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    const stored = render(
      <Accessibility
        {...props}
        underlineLinks={false}
        showDiffCheckMarks={false}
      />
    )

    assert.ok(
      screen.getByRole('checkbox', { name: 'Underline links · 連結加底線' })
    )
    assert.equal(
      screen.getAllByText(
        'A choice is recorded on this computer. Current value: off. Shipped value: on. · 呢部電腦記錄咗選擇。目前值：關。出廠值：開。'
      ).length,
      2
    )
    assert.equal(
      stored.container
        .querySelector(
          '[data-setting-explanation-id="accessibility-diff-check-marks"]'
        )
        ?.getAttribute('data-setting-provenance'),
      'stored-choice'
    )
  })
})
