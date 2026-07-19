import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DefaultAutomationSettings,
  coerceAutomationSettingsState,
  loadRepositoryAutomationOverrides,
  resolveAutomationSettings,
  saveRepositoryAutomationOverrides,
} from '../../src/lib/automation/automation-settings'

describe('automation settings', () => {
  beforeEach(() => localStorage.clear())

  it('uses safe defaults for corrupt values', () => {
    assert.deepEqual(coerceAutomationSettingsState(null), {
      global: DefaultAutomationSettings,
      accounts: {},
    })

    const state = coerceAutomationSettingsState({
      global: {
        autoCommitPushEnabled: true,
        autoCommitPushInterval: 7,
        autoPullInterval: 60,
      },
      accounts: { alice: { autoPullEnabled: true, autoPullInterval: 4 } },
    })

    assert.deepEqual(state.global, {
      ...DefaultAutomationSettings,
      autoCommitPushEnabled: true,
      autoPullInterval: 60,
    })
    assert.deepEqual(state.accounts.alice, { autoPullEnabled: true })
  })

  it('resolves repository over account over global settings', () => {
    const state = {
      global: DefaultAutomationSettings,
      accounts: {
        alice: { autoPullEnabled: true, autoCommitPushInterval: 5 as const },
      },
    }

    assert.deepEqual(
      resolveAutomationSettings(state, 'alice', {
        autoPullEnabled: false,
        autoPullInterval: 60,
      }),
      {
        ...DefaultAutomationSettings,
        autoCommitPushInterval: 5,
        autoPullEnabled: false,
        autoPullInterval: 60,
      }
    )
  })

  it('does not persist overrides for temporary repository identities', () => {
    saveRepositoryAutomationOverrides(-42, {
      autoCommitPushEnabled: true,
      autoPullEnabled: true,
    })

    assert.deepEqual(loadRepositoryAutomationOverrides(-42), {})
    assert.equal(localStorage.length, 0)
  })
})
