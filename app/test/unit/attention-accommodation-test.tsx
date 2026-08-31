import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'
import {
  AttentionAccommodationModes,
  AttentionAccommodationStorageKey,
  coerceAttentionAccommodationPreferences,
  DefaultAttentionAccommodationPreferences,
  formatAttentionElapsed,
  readAttentionAccommodationPreferences,
  setAttentionAccommodationEnabled,
  setAttentionNextAction,
} from '../../src/models/attention-accommodation'
import { CommandPaletteCatalog } from '../../src/lib/command-palette-catalog'
import { LanguageModeStorageKey } from '../../src/lib/language-preference'
import { SettingsSearchCatalog } from '../../src/lib/settings-search/settings-search-catalog'
import { AttentionAccommodations } from '../../src/ui/preferences/attention-accommodations'
import { fireEvent, render, screen } from '../helpers/ui/render'

const ExpectedModes = [
  'focus',
  'lowStimulation',
  'timeAwareness',
  'oneThingAtATime',
  'momentum',
] as const

function assertCompleteModeInventory(modes: ReadonlyArray<string>) {
  assert.deepEqual(modes, ExpectedModes)
  assert.equal(new Set(modes).size, ExpectedModes.length)
}

afterEach(() => {
  localStorage.removeItem(AttentionAccommodationStorageKey)
  localStorage.removeItem(LanguageModeStorageKey)
})

describe('attention accommodations', () => {
  it('keeps the five independent, off-by-default modes in an exact inventory', () => {
    assertCompleteModeInventory(AttentionAccommodationModes)
    assert.deepEqual(
      DefaultAttentionAccommodationPreferences.enabled,
      Object.fromEntries(ExpectedModes.map(mode => [mode, false]))
    )

    // Deliberately remove one required mode to prove the inventory check turns
    // red, then validate the restored canonical list above.
    assert.throws(() =>
      assertCompleteModeInventory(
        AttentionAccommodationModes.filter(mode => mode !== 'momentum')
      )
    )
  })

  it('coerces corrupt values to safe bounds without enabling missing modes', () => {
    const value = coerceAttentionAccommodationPreferences({
      enabled: { focus: true, momentum: 'yes' },
      nextAction: `  ${'x'.repeat(300)}  `,
      momentumDeferredUntil: Number.POSITIVE_INFINITY,
      lastChangedAt: -1,
    })

    assert.equal(value.enabled.focus, true)
    assert.equal(value.enabled.momentum, false)
    assert.equal(value.enabled.lowStimulation, false)
    assert.equal(value.nextAction.length, 240)
    assert.equal(value.momentumDeferredUntil, null)
    assert.equal(value.lastChangedAt, 0)
  })

  it('persists each mode independently and keeps the bounded next action', () => {
    setAttentionAccommodationEnabled('focus', true)
    setAttentionAccommodationEnabled('momentum', true)
    setAttentionNextAction('  Review the selected changes  ')

    const value = readAttentionAccommodationPreferences()
    assert.equal(value.enabled.focus, true)
    assert.equal(value.enabled.momentum, true)
    assert.equal(value.enabled.timeAwareness, false)
    assert.equal(value.nextAction, 'Review the selected changes')
    assert.ok(value.lastChangedAt > 0)
  })

  it('registers every mode in settings search and the command palette', () => {
    const settingsIds = new Set(SettingsSearchCatalog.map(entry => entry.id))
    for (const id of [
      'attention-focus',
      'attention-low-stimulation',
      'attention-time-awareness',
      'attention-one-thing',
      'attention-momentum',
    ]) {
      assert.ok(settingsIds.has(id), `missing settings-search entry ${id}`)
    }

    const paletteEvents = new Set(
      CommandPaletteCatalog.map(entry => entry.event)
    )
    for (const event of [
      'palette:set-attention-focus',
      'palette:set-attention-low-stimulation',
      'palette:set-attention-time-awareness',
      'palette:set-attention-one-thing',
      'palette:set-attention-momentum',
    ]) {
      assert.ok(
        paletteEvents.has(event),
        `missing command-palette entry ${event}`
      )
    }
  })

  it('renders accessible controls and reveals dependent controls only when enabled', () => {
    render(<AttentionAccommodations />)

    for (const name of [
      'Focus',
      'Low stimulation',
      'Time awareness',
      'One thing at a time',
      'Momentum',
    ]) {
      const control = screen.getByRole('checkbox', {
        name,
      }) as HTMLInputElement
      assert.equal(control.checked, false)
      assert.ok(control.getAttribute('aria-describedby'))
    }

    assert.equal(screen.queryByLabelText('Next action'), null)
    assert.equal(screen.queryByLabelText('Prompt defer interval'), null)

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'One thing at a time' })
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Momentum' }))

    assert.ok(screen.getByLabelText('Next action'))
    assert.ok(screen.getByLabelText('Prompt defer interval'))
  })

  it('renders the full bilingual labels without changing duration facts', () => {
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    render(<AttentionAccommodations />)

    assert.ok(
      screen.getByRole('checkbox', {
        name: 'Focus · 專注',
      })
    )
    assert.ok(
      screen.getByRole('checkbox', {
        name: 'Momentum · 動力提示',
      })
    )
    assert.equal(formatAttentionElapsed(65_000), '1m 5s')
    assert.equal(formatAttentionElapsed(3_661_000), '1h 1m')
  })
})
