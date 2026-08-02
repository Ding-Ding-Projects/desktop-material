import * as assert from 'assert'
import { describe, it } from 'node:test'

import {
  AIContentClasses,
  AISecurityPolicyDeniedError,
  AISecurityPolicyVersion,
  IAIProviderBinding,
  IAISecurityPolicyAuthorization,
  IAISecurityPolicyRequest,
  IAISecurityPolicyV1,
  MaxAISecurityPolicyLifetimeMs,
  evaluateAISecurityPolicy,
  getAISecurityPolicyDigest,
  normalizeAIPolicyWindowsPath,
} from '../../src/lib/ai-security-policy'

const nowMs = 1_800_000_000_000
const repositoryId = 42

const provider: IAIProviderBinding = {
  kind: 'github-copilot',
  type: 'github',
  endpoint: 'https://api.github.com',
  wireApi: null,
  transport: null,
  azureApiVersion: null,
}

function makePolicy(
  overrides: Partial<IAISecurityPolicyV1> = {}
): IAISecurityPolicyV1 {
  return {
    version: AISecurityPolicyVersion,
    feature: 'conflict-resolution',
    repositoryId,
    canonicalRepositoryPath: 'c:\\work\\repository',
    provider,
    allowedContentClasses: AIContentClasses,
    issuedAtMs: nowMs - 1_000,
    expiresAtMs: nowMs + 60_000,
    ...overrides,
  }
}

function makeAuthorization(
  policy: unknown = makePolicy(),
  trustedOverrides: Partial<
    IAISecurityPolicyAuthorization['trustedMainProcess']
  > = {},
  authorizationOverrides: Partial<IAISecurityPolicyAuthorization> = {}
): IAISecurityPolicyAuthorization {
  return {
    policy,
    trustedMainProcess: {
      signatureVerified: true,
      verifiedPolicyDigest: getAISecurityPolicyDigest(policy) ?? '0'.repeat(64),
      repositoryId,
      canonicalRepositoryPath: 'C:\\WORK\\REPOSITORY\\',
      ...trustedOverrides,
    },
    ...authorizationOverrides,
  }
}

function makeRequest(
  overrides: Partial<IAISecurityPolicyRequest> = {}
): IAISecurityPolicyRequest {
  return {
    feature: 'conflict-resolution',
    repositoryId,
    repositoryPath: 'C:/Work/Repository/',
    provider,
    contentClasses: AIContentClasses,
    ...overrides,
  }
}

function assertDenied(authorization: unknown, request: unknown, code: string) {
  const decision = evaluateAISecurityPolicy(authorization, request, nowMs)
  assert.strictEqual(decision.allowed, false)
  if (decision.allowed) {
    assert.fail('Expected the policy evaluation to deny')
  }
  assert.strictEqual(decision.denial.code, code)
  assert.strictEqual(decision.auditReceipt.decision, 'deny')
  assert.strictEqual(decision.auditReceipt.denialCode, code)
  return decision
}

describe('AI security policy', () => {
  it('allows only a fresh verified exact binding and returns the trusted normalized path', () => {
    const decision = evaluateAISecurityPolicy(
      makeAuthorization(),
      makeRequest(),
      nowMs
    )

    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.canonicalRepositoryPath, 'c:\\work\\repository')
    assert.deepStrictEqual(decision.auditReceipt, {
      version: 1,
      decision: 'allow',
      denialCode: null,
      policyVersion: 1,
      feature: 'conflict-resolution',
      providerKind: 'github-copilot',
      contentClasses: ['metadata', 'path', 'diff', 'code'],
      evaluatedAtMs: nowMs,
    })
  })

  it('normalizes safe Windows variants and rejects ambiguous repository paths', () => {
    const accepted = new Map([
      ['C:\\Repo', 'c:\\repo'],
      ['c:/repo/', 'c:\\repo'],
      ['D:\\', 'd:\\'],
      ['C:\\repo\\..hidden', 'c:\\repo\\..hidden'],
      ['C:\\\\repo\\child', 'c:\\repo\\child'],
    ])

    for (const [input, expected] of accepted) {
      assert.strictEqual(normalizeAIPolicyWindowsPath(input), expected, input)
    }

    const rejected = [
      '\\\\server\\share\\repo',
      '//server/share/repo',
      '\\\\?\\C:\\repo',
      '\\\\.\\C:\\repo',
      'relative\\repo',
      'C:relative\\repo',
      '\\rooted\\repo',
      '/posix/repo',
      'C:\\repo\\..\\other',
      'C:\\repo\\.\\child',
      'C:\\repo:stream',
      'C:\\repo\u0000secret',
      'C:\\repo\\folder.',
      'C:\\repo\\folder ',
      `C:\\${'a'.repeat(32768)}`,
    ]

    for (const input of rejected) {
      assert.strictEqual(normalizeAIPolicyWindowsPath(input), null, input)
    }
  })

  it('permits plaintext providers only on loopback and requires HTTPS remotely', () => {
    const loopbackProvider: IAIProviderBinding = {
      kind: 'byok',
      type: 'openai',
      endpoint: 'http://127.0.0.7:11434/v1/',
      wireApi: 'completions',
      transport: null,
      azureApiVersion: null,
    }
    const loopbackDecision = evaluateAISecurityPolicy(
      makeAuthorization(makePolicy({ provider: loopbackProvider })),
      makeRequest({ provider: loopbackProvider }),
      nowMs
    )
    assert.strictEqual(loopbackDecision.allowed, true)

    const remotePlaintextProvider: IAIProviderBinding = {
      ...loopbackProvider,
      endpoint: 'http://models.example.com/v1',
    }
    assertDenied(
      makeAuthorization(makePolicy({ provider: remotePlaintextProvider })),
      makeRequest({ provider: remotePlaintextProvider }),
      'policy-malformed'
    )
  })

  it('fails closed for missing, malformed, unverified, and unsupported policies', () => {
    assertDenied(undefined, makeRequest(), 'policy-missing')
    assertDenied(null, makeRequest(), 'policy-missing')
    assertDenied('policy', makeRequest(), 'policy-malformed')
    assertDenied(makeAuthorization(null), makeRequest(), 'policy-missing')
    assertDenied(
      makeAuthorization(makePolicy(), {
        signatureVerified: false,
      }),
      makeRequest(),
      'signature-unverified'
    )
    assertDenied(
      makeAuthorization({ ...makePolicy(), version: 2 }),
      makeRequest(),
      'policy-version-unsupported'
    )

    const policyWithExtraField = {
      ...makePolicy(),
      prompt: 'must-not-survive',
    }
    assertDenied(
      makeAuthorization(policyWithExtraField),
      makeRequest(),
      'policy-malformed'
    )
  })

  it('binds signature verification evidence to the exact normalized policy', () => {
    const originalPolicy = makePolicy()
    const authorization = makeAuthorization(originalPolicy)
    const substitutedPolicy = makePolicy({
      provider: { ...provider, endpoint: 'https://substituted.example.com' },
    })

    assertDenied(
      { ...authorization, policy: substitutedPolicy },
      makeRequest(),
      'signature-unverified'
    )

    assert.strictEqual(
      getAISecurityPolicyDigest(
        makePolicy({ canonicalRepositoryPath: 'C:/WORK/REPOSITORY/' })
      ),
      getAISecurityPolicyDigest(originalPolicy)
    )
  })

  it('rejects expired, future, reversed, and overlong policy lifetimes', () => {
    const stalePolicies = [
      makePolicy({ expiresAtMs: nowMs }),
      makePolicy({ issuedAtMs: nowMs + 1, expiresAtMs: nowMs + 2_000 }),
      makePolicy({
        issuedAtMs: nowMs - MaxAISecurityPolicyLifetimeMs,
        expiresAtMs: nowMs + 1,
      }),
    ]

    for (const policy of stalePolicies) {
      assertDenied(makeAuthorization(policy), makeRequest(), 'policy-stale')
    }

    assertDenied(
      makeAuthorization(
        makePolicy({ issuedAtMs: nowMs + 1, expiresAtMs: nowMs })
      ),
      makeRequest(),
      'policy-malformed'
    )

    const boundary = evaluateAISecurityPolicy(
      makeAuthorization(
        makePolicy({ issuedAtMs: nowMs, expiresAtMs: nowMs + 1 })
      ),
      makeRequest(),
      nowMs
    )
    assert.strictEqual(boundary.allowed, true)
  })

  it('binds the feature, repository identity, provider, and all repository paths', () => {
    assertDenied(
      makeAuthorization(makePolicy({ feature: 'commit-message-generation' })),
      makeRequest(),
      'feature-mismatch'
    )
    assertDenied(
      makeAuthorization(makePolicy({ repositoryId: repositoryId + 1 })),
      makeRequest(),
      'repository-mismatch'
    )
    assertDenied(
      makeAuthorization(),
      makeRequest({ repositoryId: repositoryId + 1 }),
      'repository-mismatch'
    )
    assertDenied(
      makeAuthorization(makePolicy(), {
        repositoryId: repositoryId + 1,
      }),
      makeRequest(),
      'repository-mismatch'
    )
    assertDenied(
      makeAuthorization(
        makePolicy({
          provider: { ...provider, endpoint: 'https://example.com' },
        })
      ),
      makeRequest(),
      'provider-mismatch'
    )
    assertDenied(
      makeAuthorization(
        makePolicy({ canonicalRepositoryPath: 'C:\\work\\other' })
      ),
      makeRequest(),
      'path-mismatch'
    )
    assertDenied(
      makeAuthorization(),
      makeRequest({ repositoryPath: 'C:\\work\\other' }),
      'path-mismatch'
    )
    assertDenied(
      makeAuthorization(makePolicy(), {
        canonicalRepositoryPath: 'C:\\work\\other',
      }),
      makeRequest(),
      'path-mismatch'
    )
  })

  it('denies when any requested content class is absent or malformed', () => {
    for (const omitted of AIContentClasses) {
      const allowedContentClasses = AIContentClasses.filter(
        contentClass => contentClass !== omitted
      )
      assertDenied(
        makeAuthorization(makePolicy({ allowedContentClasses })),
        makeRequest(),
        'content-class-denied'
      )
    }

    assertDenied(
      makeAuthorization(
        makePolicy({
          allowedContentClasses: ['metadata', 'metadata'] as ReadonlyArray<
            typeof AIContentClasses[number]
          >,
        })
      ),
      makeRequest(),
      'policy-malformed'
    )
    assertDenied(
      makeAuthorization(),
      {
        ...makeRequest(),
        contentClasses: ['metadata', 'secret'],
      },
      'request-malformed'
    )
  })

  it('rejects provider credentials and redacts every denial and audit receipt', () => {
    const secret = 'R14-SECRET-SENTINEL'
    const malformedProviderPolicy = makePolicy({
      provider: {
        ...provider,
        apiKey: secret,
      } as IAIProviderBinding,
      canonicalRepositoryPath: `C:\\work\\${secret}`,
    })
    const decision = assertDenied(
      makeAuthorization(malformedProviderPolicy),
      makeRequest({ repositoryPath: `C:\\other\\${secret}` }),
      'policy-malformed'
    )

    const serialized = JSON.stringify(decision)
    assert.ok(!serialized.includes(secret))
    assert.deepStrictEqual(Object.keys(decision.auditReceipt).sort(), [
      'contentClasses',
      'decision',
      'denialCode',
      'evaluatedAtMs',
      'feature',
      'policyVersion',
      'providerKind',
      'version',
    ])

    const error = new AISecurityPolicyDeniedError(
      decision.denial,
      decision.auditReceipt
    )
    assert.strictEqual(error.code, 'policy-malformed')
    assert.ok(!JSON.stringify(error).includes(secret))
    assert.ok(!error.message.includes(secret))
  })

  it('rejects hidden, symbol, and accessor properties without invoking getters', () => {
    const hiddenPolicy = makePolicy() as unknown as Record<string, unknown>
    Object.defineProperty(hiddenPolicy, 'prompt', {
      value: 'R14-HIDDEN-PROMPT',
    })
    assertDenied(
      makeAuthorization(hiddenPolicy),
      makeRequest(),
      'policy-malformed'
    )

    const symbolPolicy = makePolicy() as unknown as Record<PropertyKey, unknown>
    symbolPolicy[Symbol('prompt')] = 'R14-SYMBOL-PROMPT'
    assertDenied(
      makeAuthorization(symbolPolicy),
      makeRequest(),
      'policy-malformed'
    )

    let benignGetterCalls = 0
    const getterPolicy = makePolicy() as unknown as Record<string, unknown>
    Object.defineProperty(getterPolicy, 'version', {
      enumerable: true,
      get: () => {
        benignGetterCalls++
        return AISecurityPolicyVersion
      },
    })
    assertDenied(
      makeAuthorization(getterPolicy),
      makeRequest(),
      'policy-malformed'
    )
    assert.strictEqual(benignGetterCalls, 0)

    let providerGetterCalls = 0
    const getterProvider = { ...provider } as unknown as Record<string, unknown>
    Object.defineProperty(getterProvider, 'endpoint', {
      enumerable: true,
      get: () => {
        providerGetterCalls++
        return provider.endpoint
      },
    })
    assertDenied(
      makeAuthorization(),
      makeRequest({
        provider: getterProvider as unknown as IAIProviderBinding,
      }),
      'request-malformed'
    )
    assert.strictEqual(providerGetterCalls, 0)
  })

  it('turns throwing policy accessors into a redacted denial', () => {
    const policy = makePolicy() as unknown as Record<string, unknown>
    let getterCalls = 0
    Object.defineProperty(policy, 'version', {
      enumerable: true,
      get: () => {
        getterCalls++
        throw new Error('R14-GETTER-SECRET')
      },
    })

    const decision = assertDenied(
      makeAuthorization(policy),
      makeRequest(),
      'policy-malformed'
    )
    assert.strictEqual(getterCalls, 0)
    assert.ok(!JSON.stringify(decision).includes('R14-GETTER-SECRET'))
  })
})
