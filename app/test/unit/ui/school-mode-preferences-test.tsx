import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  SchoolModeCredentialStorageKey,
  SchoolModeStorageKey,
  setSchoolModeCredential,
  writeSchoolMode,
} from '../../../src/lib/school-mode'
import { SchoolModePreferences } from '../../../src/ui/preferences/school-mode'
import { fireEvent, render, screen } from '../../helpers/ui/render'

afterEach(() => {
  localStorage.removeItem(SchoolModeStorageKey)
  localStorage.removeItem(SchoolModeCredentialStorageKey)
})

describe('School mode settings explanations', () => {
  it('covers the shared name, enabled state, and setup inputs', () => {
    const view = render(<SchoolModePreferences languageMode="english" />)

    for (const id of ['school-mode-name', 'school-mode-enabled']) {
      assert.ok(
        view.container.querySelector(`[data-setting-explanation-id="${id}"]`),
        `missing setting explanation ${id}`
      )
    }

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Enable School mode' })
    )
    for (const id of [
      'school-mode-setup-credential',
      'school-mode-setup-confirmation',
    ]) {
      assert.ok(
        view.container.querySelector(`[data-setting-explanation-id="${id}"]`),
        `missing setting explanation ${id}`
      )
    }
  })

  it('covers the credential-vault unlock input without rendering secret facts', async () => {
    await setSchoolModeCredential('test-credential')
    writeSchoolMode({ enabled: true, name: 'Focus presentation' })
    const view = render(<SchoolModePreferences languageMode="english" />)

    const explanation = view.container.querySelector(
      '[data-setting-explanation-id="school-mode-unlock-credential"]'
    )
    assert.ok(explanation)
    assert.equal(
      explanation.getAttribute('data-setting-provenance'),
      'credential-vault'
    )
    assert.doesNotMatch(explanation.textContent ?? '', /test-credential/)
  })
})
