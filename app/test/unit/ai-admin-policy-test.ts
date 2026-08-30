import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  DefaultAIAdminPolicySettings,
  getAIAdminPolicySettings,
  normalizeAIAdminPolicySettings,
  parseAIAdminPolicySettings,
  resetAIAdminPolicySettingsCache,
} from '../../src/lib/ai-admin-policy'

const failClosedSettings = {
  aiFeaturesEnabled: false,
  allowedProviderKinds: [],
  defaultRepositoryEligibility: 'deny',
  repositoryOverrides: {},
}

describe('AI administrator policy', () => {
  it('uses the product default only when no persisted policy exists', () => {
    assert.deepStrictEqual(
      parseAIAdminPolicySettings(null),
      DefaultAIAdminPolicySettings
    )
  })

  it('fails closed when a persisted policy is malformed or incomplete', () => {
    for (const raw of [
      '{',
      'null',
      '{}',
      JSON.stringify({
        aiFeaturesEnabled: 'false',
        allowedProviderKinds: ['github-copilot', 'byok'],
        defaultRepositoryEligibility: 'allow',
        repositoryOverrides: {},
      }),
    ]) {
      assert.deepStrictEqual(
        parseAIAdminPolicySettings(raw),
        failClosedSettings
      )
    }

    assert.deepStrictEqual(
      normalizeAIAdminPolicySettings({
        aiFeaturesEnabled: true,
        allowedProviderKinds: ['github-copilot', 'unexpected-provider'],
        defaultRepositoryEligibility: 'allow',
        repositoryOverrides: {},
      }),
      failClosedSettings
    )
  })

  it('preserves a complete valid persisted policy', () => {
    const allowedRepository = join(process.cwd(), 'allowed')
    const settings = {
      aiFeaturesEnabled: true,
      allowedProviderKinds: ['byok'] as const,
      defaultRepositoryEligibility: 'deny' as const,
      repositoryOverrides: {
        [allowedRepository]: 'allow' as const,
      },
    }

    assert.deepStrictEqual(
      parseAIAdminPolicySettings(JSON.stringify(settings)),
      normalizeAIAdminPolicySettings(settings)
    )
  })

  it('fails closed when persisted policy storage cannot be read', () => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    )
    resetAIAdminPolicySettingsCache()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('simulated storage failure')
        },
      },
    })

    try {
      assert.deepStrictEqual(getAIAdminPolicySettings(), failClosedSettings)
    } finally {
      resetAIAdminPolicySettingsCache()
      if (storageDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, 'localStorage')
      } else {
        Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
      }
    }
  })
})
