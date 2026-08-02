import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  createIssueTrackerConfiguration,
  createIssueTrackerConfigurationKey,
  createIssueTrackerConfigurations,
  createIssueTrackerAvailability,
  createIssueTrackerItemIdentity,
  createIssueTrackerItemKey,
  isIssueTrackerConfiguration,
  isIssueTrackerConfigurationKey,
  isIssueTrackerConfigurations,
  isIssueTrackerAvailability,
  isIssueTrackerItemIdentity,
  isIssueTrackerItemKey,
  IssueTrackerModelError,
  IssueTrackerItemKinds,
  IssueTrackerNotApplicable,
  IssueTrackerProviders,
  IssueTrackerScopeKinds,
  IssueTrackerUnavailable,
  IssueTrackerWireVariants,
  issueTrackerValue,
} from '../../src/lib/issue-trackers/issue-tracker-model'

const configurationListMaximumLength = 256
const accountAndConfigurationMaximumBytes = 256
const credentialReferenceMaximumBytes = 256
const endpointMaximumBytes = 2_048
const scopeAndItemMaximumBytes = 512
const serializedKeyMaximumBytes = 8_192

const expectedProviders = [
  'jira-cloud',
  'jira-data-center',
  'git-integration-for-jira',
  'trello',
  'github',
  'github-enterprise',
  'gitlab',
  'gitlab-self-managed',
] as const

const expectedWireVariants = [
  'jira-rest-v3',
  'jira-rest-v2',
  'git-integration-for-jira-v1',
  'trello-rest-v1',
  'github-rest-v3',
  'gitlab-rest-v4',
] as const

const providerCases = [
  {
    provider: 'jira-cloud',
    endpoint: 'https://team.atlassian.net',
    wireVariant: 'jira-rest-v3',
    scopeKind: 'project',
    scopeId: 'DESK',
    itemKind: 'issue',
  },
  {
    provider: 'jira-data-center',
    endpoint: 'https://jira.corp.example',
    wireVariant: 'jira-rest-v2',
    scopeKind: 'project',
    scopeId: 'CORE',
    itemKind: 'issue',
  },
  {
    provider: 'git-integration-for-jira',
    endpoint: 'https://jira-integrations.corp.example',
    wireVariant: 'git-integration-for-jira-v1',
    scopeKind: 'project',
    scopeId: 'LINKS',
    itemKind: 'issue',
  },
  {
    provider: 'trello',
    endpoint: 'https://api.trello.com',
    wireVariant: 'trello-rest-v1',
    scopeKind: 'board',
    scopeId: 'board-42',
    itemKind: 'card',
  },
  {
    provider: 'github',
    endpoint: 'https://api.github.com',
    wireVariant: 'github-rest-v3',
    scopeKind: 'repository',
    scopeId: 'desktop-material',
    itemKind: 'pull-request',
  },
  {
    provider: 'github-enterprise',
    endpoint: 'https://github.corp.example',
    wireVariant: 'github-rest-v3',
    scopeKind: 'repository',
    scopeId: 'desktop-material-enterprise',
    itemKind: 'pull-request',
  },
  {
    provider: 'gitlab',
    endpoint: 'https://gitlab.com',
    wireVariant: 'gitlab-rest-v4',
    scopeKind: 'project',
    scopeId: 'group/desktop-material',
    itemKind: 'pull-request',
  },
  {
    provider: 'gitlab-self-managed',
    endpoint: 'https://gitlab.corp.example',
    wireVariant: 'gitlab-rest-v4',
    scopeKind: 'project',
    scopeId: 'group/desktop-material-self-managed',
    itemKind: 'pull-request',
  },
] as const

const defaultConfiguration = {
  provider: 'github',
  endpoint: 'https://api.github.com',
  accountId: 'account-1',
  configurationId: 'configuration-1',
  credentialReferenceId: 'credential-reference-1',
  wireVariant: 'github-rest-v3',
  scope: {
    kind: 'repository',
    id: 'desktop-material',
  },
} as const

const defaultItemIdentity = {
  provider: defaultConfiguration.provider,
  endpoint: defaultConfiguration.endpoint,
  accountId: defaultConfiguration.accountId,
  wireVariant: defaultConfiguration.wireVariant,
  scope: defaultConfiguration.scope,
  itemKind: 'issue',
  itemId: '133',
} as const

function configuration(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    ...defaultConfiguration,
    ...overrides,
    scope:
      'scope' in overrides
        ? overrides.scope
        : { ...defaultConfiguration.scope },
  }
}

function itemIdentity(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    ...defaultItemIdentity,
    ...overrides,
    scope:
      'scope' in overrides ? overrides.scope : { ...defaultItemIdentity.scope },
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

function assertModelError(
  operation: () => unknown,
  code:
    | 'invalid-configuration'
    | 'invalid-configuration-list'
    | 'duplicate-configuration'
    | 'invalid-availability'
    | 'invalid-item-identity'
    | 'invalid-key',
  message: string
): void {
  assert.throws(operation, error => {
    assert.ok(error instanceof IssueTrackerModelError)
    assert.equal(error.name, 'IssueTrackerModelError')
    assert.equal(error.code, code)
    assert.equal(error.message, message)
    assert.equal('cause' in error, false)
    return true
  })
}

function cloneWithDataDescriptors(value: object): Record<PropertyKey, unknown> {
  return Object.defineProperties({}, Object.getOwnPropertyDescriptors(value))
}

describe('issue tracker provider configuration', () => {
  it('pins the exact provider, wire, and scope vocabulary', () => {
    assert.deepEqual(IssueTrackerProviders, expectedProviders)
    assert.deepEqual(IssueTrackerWireVariants, expectedWireVariants)
    assert.deepEqual(IssueTrackerScopeKinds, ['project', 'board', 'repository'])
    assert.deepEqual(IssueTrackerItemKinds, ['issue', 'pull-request', 'card'])
    assert.equal(Object.isFrozen(IssueTrackerProviders), true)
    assert.equal(Object.isFrozen(IssueTrackerWireVariants), true)
    assert.equal(Object.isFrozen(IssueTrackerScopeKinds), true)
    assert.equal(Object.isFrozen(IssueTrackerItemKinds), true)
  })

  it('constructs every exact provider variant with its bound wire and scope', () => {
    for (const [index, providerCase] of providerCases.entries()) {
      const input = configuration({
        provider: providerCase.provider,
        endpoint: providerCase.endpoint,
        accountId: `account-${index}`,
        configurationId: `configuration-${index}`,
        credentialReferenceId: `credential-reference-${index}`,
        wireVariant: providerCase.wireVariant,
        scope: { kind: providerCase.scopeKind, id: providerCase.scopeId },
      })
      const created = createIssueTrackerConfiguration(input)

      assert.deepEqual(created, input)
      assert.equal(isIssueTrackerConfiguration(created), true)
      assert.equal(Object.isFrozen(created), true)
      assert.equal(Object.isFrozen(created.scope), true)
      assert.equal(
        isIssueTrackerConfigurationKey(
          createIssueTrackerConfigurationKey(created)
        ),
        true
      )
    }
  })

  it('rejects every provider, wire, and scope mismatch', () => {
    for (const providerCase of providerCases) {
      const valid = configuration({
        provider: providerCase.provider,
        endpoint: providerCase.endpoint,
        wireVariant: providerCase.wireVariant,
        scope: { kind: providerCase.scopeKind, id: providerCase.scopeId },
      })
      assert.equal(isIssueTrackerConfiguration(valid), true)

      const wrongProvider = {
        ...valid,
        provider: providerCase.provider === 'trello' ? 'jira-cloud' : 'trello',
      }
      const wrongWire = {
        ...valid,
        wireVariant:
          providerCase.wireVariant === 'trello-rest-v1'
            ? 'jira-rest-v3'
            : 'trello-rest-v1',
      }
      const wrongScope = {
        ...valid,
        scope: {
          kind: providerCase.scopeKind === 'board' ? 'project' : 'board',
          id: providerCase.scopeId,
        },
      }

      assert.equal(isIssueTrackerConfiguration(wrongProvider), false)
      assert.equal(isIssueTrackerConfiguration(wrongWire), false)
      assert.equal(isIssueTrackerConfiguration(wrongScope), false)
    }

    for (const provider of [
      '',
      'jira',
      'github-cloud',
      'gitlab-enterprise',
      'JIRA-CLOUD',
    ]) {
      assert.equal(
        isIssueTrackerConfiguration(configuration({ provider })),
        false
      )
    }
  })

  it('canonicalizes safe origins and permits HTTP only for explicit loopback', () => {
    const canonical = createIssueTrackerConfiguration(
      configuration({ endpoint: 'HTTPS://API.GITHUB.COM:443/' })
    )
    assert.equal(canonical.endpoint, 'https://api.github.com')
    assert.equal(
      createIssueTrackerConfigurationKey(canonical),
      createIssueTrackerConfigurationKey(defaultConfiguration)
    )

    const loopbackCases = [
      ['http://localhost:8080/', 'http://localhost:8080'],
      ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080'],
      ['http://127.42.7.9:8080/', 'http://127.42.7.9:8080'],
      ['http://[::1]:8080/', 'http://[::1]:8080'],
    ] as const
    for (const [input, expected] of loopbackCases) {
      assert.equal(
        createIssueTrackerConfiguration(
          configuration({ provider: 'github-enterprise', endpoint: input })
        ).endpoint,
        expected
      )
    }

    const enterprise = configuration({
      provider: 'github-enterprise',
      endpoint: 'https://github.corp.example',
    })
    const differentPort = createIssueTrackerConfigurationKey(
      createIssueTrackerConfiguration(
        configuration({
          provider: 'github-enterprise',
          endpoint: 'https://github.corp.example:8443/',
        })
      )
    )
    assert.notEqual(
      differentPort,
      createIssueTrackerConfigurationKey(enterprise)
    )
  })

  it('rejects hostile URLs before parser normalization can disguise them', () => {
    const hostileEndpoints = [
      'http://example.com',
      'http://localhost.evil.example',
      'http://127.0.0.1.evil.example',
      'http://0.0.0.0',
      'http://[::]',
      'http://10.0.0.1',
      'http://169.254.1.1',
      'http://192.168.1.1',
      'http://127.1',
      'http://2130706433',
      'http://0x7f000001',
      'http://0177.0.0.1',
      'ftp://api.github.com',
      'file:///C:/work',
      'https://user:password@api.github.com',
      'https://@api.github.com',
      'https://user%40name@api.github.com',
      'https://api.github.com/api',
      'https://api.github.com/%2e',
      'https://api.github.com/%2e%2e',
      'https://api.github.com?token=value',
      'https://api.github.com?',
      'https://api.github.com#fragment',
      'https://api.github.com#',
      'https:\\api.github.com',
      'https://api.github.com\\path',
      'https://api.github.com\n',
      'https://api.github.com\u202e',
      'https://github.com',
    ]

    for (const endpoint of hostileEndpoints) {
      const candidate = configuration({ endpoint })
      assert.equal(
        isIssueTrackerConfiguration(candidate),
        false,
        `expected ${JSON.stringify(endpoint)} to be rejected`
      )
      assertModelError(
        () => createIssueTrackerConfiguration(candidate),
        'invalid-configuration',
        'Issue tracker configuration is invalid.'
      )
    }
  })

  it('binds hosted and self-managed variants to honest origins', () => {
    const mismatches = [
      configuration({
        provider: 'jira-cloud',
        endpoint: 'https://jira.example.com',
        wireVariant: 'jira-rest-v3',
        scope: { kind: 'project', id: 'DESK' },
      }),
      configuration({
        provider: 'github',
        endpoint: 'https://github.enterprise.example',
        wireVariant: 'github-rest-v3',
        scope: { kind: 'repository', id: 'desktop-material' },
      }),
      configuration({
        provider: 'github-enterprise',
        endpoint: 'https://api.github.com',
        wireVariant: 'github-rest-v3',
        scope: { kind: 'repository', id: 'desktop-material' },
      }),
      configuration({
        provider: 'gitlab',
        endpoint: 'https://gitlab.enterprise.example',
        wireVariant: 'gitlab-rest-v4',
        scope: { kind: 'project', id: 'group/project' },
      }),
      configuration({
        provider: 'gitlab-self-managed',
        endpoint: 'https://gitlab.com',
        wireVariant: 'gitlab-rest-v4',
        scope: { kind: 'project', id: 'group/project' },
      }),
      configuration({
        provider: 'trello',
        endpoint: 'https://trello.example.com',
        wireVariant: 'trello-rest-v1',
        scope: { kind: 'board', id: 'board-42' },
      }),
    ]
    for (const mismatch of mismatches) {
      assert.equal(isIssueTrackerConfiguration(mismatch), false)
    }
  })

  it('normalizes NFC while rejecting whitespace, controls, bidi, and surrogates', () => {
    const decomposed = 'Cafe\u0301'
    const composed = 'Caf\u00e9'
    const normalized = createIssueTrackerConfiguration(
      configuration({
        accountId: decomposed,
        configurationId: decomposed,
        credentialReferenceId: decomposed,
        scope: { kind: 'repository', id: decomposed },
      })
    )
    assert.equal(normalized.accountId, composed)
    assert.equal(normalized.configurationId, composed)
    assert.equal(normalized.credentialReferenceId, composed)
    assert.equal(normalized.scope.id, composed)
    assert.equal(
      createIssueTrackerConfigurationKey(normalized),
      createIssueTrackerConfigurationKey(
        configuration({
          accountId: composed,
          configurationId: composed,
          credentialReferenceId: 'a different reference',
          scope: { kind: 'repository', id: composed },
        })
      )
    )

    const unsafeSegments = [
      '',
      ' leading',
      'trailing ',
      'line\nfeed',
      'nul\0byte',
      'c1\u0085control',
      'arabic\u061cmark',
      'left\u200emark',
      'right\u200fmark',
      'override\u202evalue',
      'isolate\u2066value\u2069',
      'high\ud800surrogate',
      'low\udc00surrogate',
    ]
    const segmentCandidates = [
      (value: string) => configuration({ accountId: value }),
      (value: string) => configuration({ configurationId: value }),
      (value: string) => configuration({ credentialReferenceId: value }),
      (value: string) =>
        configuration({ scope: { kind: 'repository', id: value } }),
    ]
    for (const unsafe of unsafeSegments) {
      for (const candidate of segmentCandidates) {
        assert.equal(isIssueTrackerConfiguration(candidate(unsafe)), false)
      }
      assert.equal(
        isIssueTrackerItemIdentity(itemIdentity({ itemId: unsafe })),
        false
      )
    }
  })

  it('enforces UTF-8 byte bounds rather than JavaScript code-unit length', () => {
    const asciiAccount = 'a'.repeat(accountAndConfigurationMaximumBytes)
    const astralScope = '\ud83e\udd5f'.repeat(scopeAndItemMaximumBytes / 4)
    assert.equal(utf8Length(asciiAccount), accountAndConfigurationMaximumBytes)
    assert.equal(utf8Length(astralScope), scopeAndItemMaximumBytes)
    assert.doesNotThrow(() =>
      createIssueTrackerConfiguration(
        configuration({
          accountId: asciiAccount,
          configurationId: asciiAccount,
          credentialReferenceId: 'c'.repeat(credentialReferenceMaximumBytes),
          scope: { kind: 'repository', id: astralScope },
        })
      )
    )
    assert.doesNotThrow(() =>
      createIssueTrackerItemIdentity(itemIdentity({ itemId: astralScope }))
    )

    for (const candidate of [
      configuration({
        accountId: 'a'.repeat(accountAndConfigurationMaximumBytes + 1),
      }),
      configuration({
        configurationId: '\ud83e\udd5f'.repeat(
          accountAndConfigurationMaximumBytes / 4 + 1
        ),
      }),
      configuration({
        credentialReferenceId: 'c'.repeat(credentialReferenceMaximumBytes + 1),
      }),
      configuration({
        scope: {
          kind: 'repository',
          id: 's'.repeat(scopeAndItemMaximumBytes + 1),
        },
      }),
      configuration({
        endpoint: `https://${'a'.repeat(endpointMaximumBytes)}.com`,
      }),
    ]) {
      assert.equal(isIssueTrackerConfiguration(candidate), false)
    }
    assert.equal(
      isIssueTrackerItemIdentity(
        itemIdentity({ itemId: 'i'.repeat(scopeAndItemMaximumBytes + 1) })
      ),
      false
    )
  })

  it('uses descriptor-first exact records without executing accessors', () => {
    const surplusNames = [
      'token',
      'password',
      'authorization',
      'headers',
      'callback',
      'customField',
    ]
    for (const surplusName of surplusNames) {
      const candidate = configuration()
      candidate[surplusName] = 'SENTINEL-DO-NOT-ECHO'
      assert.equal(isIssueTrackerConfiguration(candidate), false)
      try {
        createIssueTrackerConfiguration(candidate)
        assert.fail('surplus configuration unexpectedly succeeded')
      } catch (error) {
        assert.ok(error instanceof IssueTrackerModelError)
        assert.equal(error.code, 'invalid-configuration')
        assert.equal(
          JSON.stringify({
            name: error.name,
            code: error.code,
            message: error.message,
          }).includes('SENTINEL-DO-NOT-ECHO'),
          false
        )
      }
    }

    let getterCalls = 0
    const accessor = cloneWithDataDescriptors(configuration())
    Object.defineProperty(accessor, 'accountId', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls++
        throw new Error('getter must not execute')
      },
    })
    assert.equal(isIssueTrackerConfiguration(accessor), false)
    assertModelError(
      () => createIssueTrackerConfiguration(accessor),
      'invalid-configuration',
      'Issue tracker configuration is invalid.'
    )
    assert.equal(getterCalls, 0)

    const nestedAccessor = configuration()
    const scope = { kind: 'repository' }
    Object.defineProperty(scope, 'id', {
      enumerable: true,
      get: () => {
        getterCalls++
        throw new Error('nested getter must not execute')
      },
    })
    nestedAccessor.scope = scope
    assert.equal(isIssueTrackerConfiguration(nestedAccessor), false)
    assertModelError(
      () => createIssueTrackerConfiguration(nestedAccessor),
      'invalid-configuration',
      'Issue tracker configuration is invalid.'
    )
    assert.equal(getterCalls, 0)

    const inherited = Object.create(configuration()) as unknown
    assert.equal(isIssueTrackerConfiguration(inherited), false)

    const nonEnumerable = configuration()
    Object.defineProperty(nonEnumerable, 'customField', { value: 'hidden' })
    assert.equal(isIssueTrackerConfiguration(nonEnumerable), false)

    const nonEnumerableRequired = configuration()
    Object.defineProperty(nonEnumerableRequired, 'accountId', {
      value: 'account-1',
      enumerable: false,
    })
    assert.equal(isIssueTrackerConfiguration(nonEnumerableRequired), false)

    const symbolKey = configuration()
    Object.defineProperty(symbolKey, Symbol('credential'), {
      value: 'hidden',
      enumerable: true,
    })
    assert.equal(isIssueTrackerConfiguration(symbolKey), false)
  })

  it('contains revoked proxies and clones accepted records', () => {
    const outer = Proxy.revocable(configuration(), {})
    outer.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerConfiguration(outer.proxy), false)
    })
    assertModelError(
      () => createIssueTrackerConfiguration(outer.proxy),
      'invalid-configuration',
      'Issue tracker configuration is invalid.'
    )

    const nested = Proxy.revocable({ ...defaultConfiguration.scope }, {})
    const nestedCandidate = configuration({ scope: nested.proxy })
    nested.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerConfiguration(nestedCandidate), false)
    })
    assertModelError(
      () => createIssueTrackerConfiguration(nestedCandidate),
      'invalid-configuration',
      'Issue tracker configuration is invalid.'
    )

    const mutableScope: { kind: string; id: string } = {
      ...defaultConfiguration.scope,
    }
    const mutableInput = configuration({ scope: mutableScope })
    const created = createIssueTrackerConfiguration(mutableInput)
    mutableInput.accountId = 'mutated-account'
    mutableScope.id = 'mutated-repository'
    assert.equal(created.accountId, defaultConfiguration.accountId)
    assert.equal(created.scope.id, defaultConfiguration.scope.id)
    assert.notEqual(created, mutableInput)
    assert.notEqual(created.scope, mutableScope)
  })
})

describe('issue tracker configuration collections', () => {
  it('accepts a bounded dense array and returns immutable snapshots', () => {
    const first = configuration()
    const second = configuration({
      accountId: 'account-2',
      configurationId: 'configuration-2',
      credentialReferenceId: 'credential-reference-2',
    })
    const input = [first, second]
    const created = createIssueTrackerConfigurations(input)

    assert.equal(isIssueTrackerConfigurations(created), true)
    assert.equal(Object.isFrozen(created), true)
    assert.equal(Object.isFrozen(created[0]), true)
    assert.equal(Object.isFrozen(created[0].scope), true)
    assert.notEqual(created, input)
    assert.notEqual(created[0], first)
    input.pop()
    first.accountId = 'mutated'
    assert.equal(created.length, 2)
    assert.equal(created[0].accountId, defaultConfiguration.accountId)
  })

  it('rejects holes, accessor indices, symbols, extra properties, and overflow', () => {
    const sparse = new Array(2)
    sparse[1] = configuration()

    let getterCalls = 0
    const accessor = [configuration()]
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls++
        throw new Error('array getter must not execute')
      },
    })

    const symbolKey = [configuration()]
    Object.defineProperty(symbolKey, Symbol('surplus'), {
      value: true,
      enumerable: true,
    })

    const namedProperty = [configuration()]
    Object.defineProperty(namedProperty, 'credential', {
      value: 'surplus',
      enumerable: true,
    })

    const nonEnumerableIndex = [configuration()]
    Object.defineProperty(nonEnumerableIndex, '0', {
      value: configuration(),
      enumerable: false,
    })

    const oversized = Array.from(
      { length: configurationListMaximumLength + 1 },
      (_, index) =>
        configuration({
          configurationId: `configuration-${index}`,
          credentialReferenceId: `credential-reference-${index}`,
        })
    )

    for (const candidate of [
      sparse,
      accessor,
      symbolKey,
      namedProperty,
      nonEnumerableIndex,
      oversized,
    ]) {
      assert.equal(isIssueTrackerConfigurations(candidate), false)
      assertModelError(
        () => createIssueTrackerConfigurations(candidate),
        'invalid-configuration-list',
        'Issue tracker configuration list is invalid.'
      )
    }
    assert.equal(getterCalls, 0)
  })

  it('contains revoked array proxies', () => {
    const revoked = Proxy.revocable([configuration()], {})
    revoked.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerConfigurations(revoked.proxy), false)
    })
    assertModelError(
      () => createIssueTrackerConfigurations(revoked.proxy),
      'invalid-configuration-list',
      'Issue tracker configuration list is invalid.'
    )
  })

  it('rejects duplicate semantic identities while allowing the exact cap', () => {
    const duplicates = [
      configuration(),
      configuration({ credentialReferenceId: 'rotated-reference' }),
    ]
    assert.equal(isIssueTrackerConfigurations(duplicates), false)
    assertModelError(
      () => createIssueTrackerConfigurations(duplicates),
      'duplicate-configuration',
      'Issue tracker configuration list contains a duplicate identity.'
    )

    const maximum = Array.from(
      { length: configurationListMaximumLength },
      (_, index) =>
        configuration({
          configurationId: `configuration-${index}`,
          credentialReferenceId: `credential-reference-${index}`,
        })
    )
    const created = createIssueTrackerConfigurations(maximum)
    assert.equal(created.length, configurationListMaximumLength)
    assert.equal(Object.isFrozen(created), true)
  })
})

describe('issue tracker item identity and keys', () => {
  it('constructs bounded provider items for issues, pull requests, and cards', () => {
    for (const [index, providerCase] of providerCases.entries()) {
      const candidate = itemIdentity({
        provider: providerCase.provider,
        endpoint: providerCase.endpoint,
        accountId: `account-${index}`,
        wireVariant: providerCase.wireVariant,
        scope: { kind: providerCase.scopeKind, id: providerCase.scopeId },
        itemKind: providerCase.itemKind,
        itemId: `item-${index}`,
      })
      const created = createIssueTrackerItemIdentity(candidate)
      assert.deepEqual(created, candidate)
      assert.equal(Object.isFrozen(created), true)
      assert.equal(Object.isFrozen(created.scope), true)
      assert.equal(isIssueTrackerItemIdentity(created), true)
      assert.equal(
        isIssueTrackerItemKey(createIssueTrackerItemKey(created)),
        true
      )

      const wrongWire = itemIdentity({
        ...candidate,
        wireVariant:
          providerCase.wireVariant === 'trello-rest-v1'
            ? 'jira-rest-v3'
            : 'trello-rest-v1',
      })
      const wrongScope = itemIdentity({
        ...candidate,
        scope: {
          kind: providerCase.scopeKind === 'board' ? 'project' : 'board',
          id: providerCase.scopeId,
        },
      })
      const wrongKind = itemIdentity({
        ...candidate,
        itemKind:
          providerCase.provider === 'trello'
            ? 'issue'
            : providerCase.provider.startsWith('jira') ||
              providerCase.provider === 'git-integration-for-jira'
            ? 'pull-request'
            : 'card',
      })
      assert.equal(isIssueTrackerItemIdentity(wrongWire), false)
      assert.equal(isIssueTrackerItemIdentity(wrongScope), false)
      assert.equal(isIssueTrackerItemIdentity(wrongKind), false)
    }

    assert.doesNotThrow(() =>
      createIssueTrackerItemIdentity(itemIdentity({ itemKind: 'issue' }))
    )
    assert.doesNotThrow(() =>
      createIssueTrackerItemIdentity(itemIdentity({ itemKind: 'pull-request' }))
    )
    for (const itemKind of ['', 'merge-request', 'task', 'ISSUE', 'card']) {
      assert.equal(
        isIssueTrackerItemIdentity(itemIdentity({ itemKind })),
        false
      )
    }

    const jira = providerCases[0]
    const trello = providerCases[3]
    for (const itemKind of ['pull-request', 'card']) {
      assert.equal(
        isIssueTrackerItemIdentity(
          itemIdentity({
            provider: jira.provider,
            endpoint: jira.endpoint,
            wireVariant: jira.wireVariant,
            scope: { kind: jira.scopeKind, id: jira.scopeId },
            itemKind,
          })
        ),
        false
      )
    }
    for (const itemKind of ['issue', 'pull-request']) {
      assert.equal(
        isIssueTrackerItemIdentity(
          itemIdentity({
            provider: trello.provider,
            endpoint: trello.endpoint,
            wireVariant: trello.wireVariant,
            scope: { kind: trello.scopeKind, id: trello.scopeId },
            itemKind,
          })
        ),
        false
      )
    }
  })

  it('normalizes item identity and rejects exact-shape attacks', () => {
    const normalized = createIssueTrackerItemIdentity(
      itemIdentity({ itemId: 'Cafe\u0301' })
    )
    assert.equal(normalized.itemId, 'Caf\u00e9')
    assert.equal(
      createIssueTrackerItemKey(normalized),
      createIssueTrackerItemKey(itemIdentity({ itemId: 'Caf\u00e9' }))
    )

    const surplus = itemIdentity({ token: 'SENTINEL-ITEM-TOKEN' })
    assert.equal(isIssueTrackerItemIdentity(surplus), false)
    assertModelError(
      () => createIssueTrackerItemIdentity(surplus),
      'invalid-item-identity',
      'Issue tracker item identity is invalid.'
    )

    let getterCalls = 0
    const accessor = cloneWithDataDescriptors(itemIdentity())
    Object.defineProperty(accessor, 'itemId', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls++
        throw new Error('item getter must not execute')
      },
    })
    assert.equal(isIssueTrackerItemIdentity(accessor), false)
    assertModelError(
      () => createIssueTrackerItemIdentity(accessor),
      'invalid-item-identity',
      'Issue tracker item identity is invalid.'
    )
    assert.equal(getterCalls, 0)

    const symbolKey = itemIdentity()
    Object.defineProperty(symbolKey, Symbol('surplus'), { value: true })
    assert.equal(isIssueTrackerItemIdentity(symbolKey), false)

    const revoked = Proxy.revocable(itemIdentity(), {})
    revoked.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerItemIdentity(revoked.proxy), false)
    })
    assertModelError(
      () => createIssueTrackerItemIdentity(revoked.proxy),
      'invalid-item-identity',
      'Issue tracker item identity is invalid.'
    )
  })

  it('produces deterministic collision-safe isolated keys', () => {
    const baseConfigurationKey =
      createIssueTrackerConfigurationKey(defaultConfiguration)
    const rotatedCredentialKey = createIssueTrackerConfigurationKey(
      configuration({ credentialReferenceId: 'rotated-reference' })
    )
    assert.equal(
      rotatedCredentialKey,
      baseConfigurationKey,
      'rotating an opaque credential reference must not relabel configuration identity'
    )

    const configurationDimensions = [
      configuration({ accountId: 'account-2' }),
      configuration({ configurationId: 'configuration-2' }),
      configuration({
        scope: { kind: 'repository', id: 'another-repository' },
      }),
    ]
    for (const variant of configurationDimensions) {
      assert.notEqual(
        createIssueTrackerConfigurationKey(variant),
        baseConfigurationKey
      )
    }

    const baseItemKey = createIssueTrackerItemKey(defaultItemIdentity)
    assert.equal(baseConfigurationKey.includes('github-rest-v3'), true)
    assert.equal(baseItemKey.includes('github-rest-v3'), false)
    const itemDimensions = [
      itemIdentity({ accountId: 'account-2' }),
      itemIdentity({ scope: { kind: 'repository', id: 'another-repository' } }),
      itemIdentity({ itemKind: 'pull-request' }),
      itemIdentity({ itemId: '134' }),
    ]
    for (const variant of itemDimensions) {
      assert.notEqual(createIssueTrackerItemKey(variant), baseItemKey)
    }

    const enterpriseBaseItem = itemIdentity({
      provider: 'github-enterprise',
      endpoint: 'https://github.corp.example',
    })
    assert.notEqual(
      createIssueTrackerItemKey(enterpriseBaseItem),
      createIssueTrackerItemKey({
        ...enterpriseBaseItem,
        endpoint: 'https://github-alt.corp.example',
      })
    )

    const githubEnterprise = providerCases[5]
    const crossProviderKey = createIssueTrackerItemKey(
      itemIdentity({
        provider: githubEnterprise.provider,
        endpoint: githubEnterprise.endpoint,
        wireVariant: githubEnterprise.wireVariant,
        scope: {
          kind: githubEnterprise.scopeKind,
          id: defaultItemIdentity.scope.id,
        },
      })
    )
    assert.notEqual(crossProviderKey, baseItemKey)

    const delimiterHeavyA = createIssueTrackerItemKey(
      itemIdentity({
        accountId: 'a|b',
        scope: { kind: 'repository', id: 'c' },
        itemId: 'd',
      })
    )
    const delimiterHeavyB = createIssueTrackerItemKey(
      itemIdentity({
        accountId: 'a',
        scope: { kind: 'repository', id: 'b|c' },
        itemId: 'd',
      })
    )
    assert.notEqual(delimiterHeavyA, delimiterHeavyB)
    assert.equal(
      createIssueTrackerItemKey(itemIdentity()),
      createIssueTrackerItemKey(itemIdentity())
    )
  })

  it('rejects forged, noncanonical, and oversized serialized keys', () => {
    const configurationKey =
      createIssueTrackerConfigurationKey(defaultConfiguration)
    const itemKey = createIssueTrackerItemKey(defaultItemIdentity)
    assert.ok(utf8Length(configurationKey) <= serializedKeyMaximumBytes)
    assert.ok(utf8Length(itemKey) <= serializedKeyMaximumBytes)

    for (const forged of [
      '',
      ` ${configurationKey}`,
      `${configurationKey} `,
      JSON.stringify(JSON.parse(configurationKey), null, 2),
      JSON.stringify([...JSON.parse(configurationKey), 'surplus']),
      'x'.repeat(serializedKeyMaximumBytes + 1),
      'not-json',
      '{}',
      '[]',
    ]) {
      assert.equal(isIssueTrackerConfigurationKey(forged), false)
    }
    for (const forged of [
      '',
      ` ${itemKey}`,
      JSON.stringify(JSON.parse(itemKey), null, 2),
      JSON.stringify([...JSON.parse(itemKey), 'surplus']),
      'x'.repeat(serializedKeyMaximumBytes + 1),
      configurationKey,
      new Proxy({}, {}),
    ]) {
      assert.equal(isIssueTrackerItemKey(forged), false)
    }

    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerConfigurationKey(revoked.proxy), false)
      assert.equal(isIssueTrackerItemKey(revoked.proxy), false)
    })
  })
})

describe('issue tracker availability and failure boundary', () => {
  it('keeps known, unavailable, and not-applicable states truthful and immutable', () => {
    const known = issueTrackerValue('open')
    const knownNumber = issueTrackerValue(42)
    const knownBoolean = issueTrackerValue(false)
    assert.deepEqual(known, { availability: 'value', value: 'open' })
    assert.deepEqual(IssueTrackerUnavailable, { availability: 'unavailable' })
    assert.deepEqual(IssueTrackerNotApplicable, {
      availability: 'not-applicable',
    })
    assert.notEqual(IssueTrackerUnavailable, IssueTrackerNotApplicable)
    assert.equal(Object.isFrozen(known), true)
    assert.equal(Object.isFrozen(IssueTrackerUnavailable), true)
    assert.equal(Object.isFrozen(IssueTrackerNotApplicable), true)
    assert.deepEqual(Reflect.ownKeys(known).sort(), ['availability', 'value'])
    assert.deepEqual(Reflect.ownKeys(IssueTrackerUnavailable), ['availability'])
    assert.deepEqual(Reflect.ownKeys(IssueTrackerNotApplicable), [
      'availability',
    ])

    for (const fact of [
      known,
      knownNumber,
      knownBoolean,
      IssueTrackerUnavailable,
      IssueTrackerNotApplicable,
    ]) {
      assert.equal(isIssueTrackerAvailability(fact), true)
      assert.deepEqual(createIssueTrackerAvailability(fact), fact)
    }

    const invalidFacts = [
      { availability: 'value' },
      { availability: 'value', value: { nested: true } },
      { availability: 'unavailable', value: false },
      { availability: 'unavailable', reason: 'provider said no' },
      { availability: 'not-applicable', value: 0 },
      { availability: 'unknown' },
    ]
    for (const invalid of invalidFacts) {
      assert.equal(isIssueTrackerAvailability(invalid), false)
      assertModelError(
        () => createIssueTrackerAvailability(invalid),
        'invalid-availability',
        'Issue tracker availability is invalid.'
      )
    }

    let getterCalls = 0
    const accessor = { availability: 'value' }
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get: () => {
        getterCalls++
        throw new Error('availability getter must not execute')
      },
    })
    assert.equal(isIssueTrackerAvailability(accessor), false)
    assertModelError(
      () => createIssueTrackerAvailability(accessor),
      'invalid-availability',
      'Issue tracker availability is invalid.'
    )
    assert.equal(getterCalls, 0)

    const symbolKey = { availability: 'unavailable' }
    Object.defineProperty(symbolKey, Symbol('reason'), { value: 'hidden' })
    assert.equal(isIssueTrackerAvailability(symbolKey), false)

    const revoked = Proxy.revocable({ availability: 'unavailable' }, {})
    revoked.revoke()
    assert.doesNotThrow(() => {
      assert.equal(isIssueTrackerAvailability(revoked.proxy), false)
    })
    assertModelError(
      () => createIssueTrackerAvailability(revoked.proxy),
      'invalid-availability',
      'Issue tracker availability is invalid.'
    )
  })

  it('returns only fixed non-secret typed construction errors', () => {
    const sentinel = 'SECRET-SENTINEL-MUST-NOT-LEAK'
    const invalidConfiguration = configuration({ password: sentinel })
    const invalidItem = itemIdentity({ authorization: sentinel })
    const operations = [
      {
        run: () => createIssueTrackerConfiguration(invalidConfiguration),
        code: 'invalid-configuration',
        message: 'Issue tracker configuration is invalid.',
      },
      {
        run: () => createIssueTrackerConfigurations([invalidConfiguration]),
        code: 'invalid-configuration-list',
        message: 'Issue tracker configuration list is invalid.',
      },
      {
        run: () => createIssueTrackerItemIdentity(invalidItem),
        code: 'invalid-item-identity',
        message: 'Issue tracker item identity is invalid.',
      },
    ] as const

    for (const operation of operations) {
      try {
        operation.run()
        assert.fail('invalid input unexpectedly succeeded')
      } catch (error) {
        assert.ok(error instanceof IssueTrackerModelError)
        assert.equal(error.code, operation.code)
        assert.equal(error.message, operation.message)
        assert.equal(error.message.includes(sentinel), false)
        assert.equal('cause' in error, false)
        assert.deepEqual(Reflect.ownKeys(error).sort(), [
          'code',
          'message',
          'name',
          'stack',
        ])
      }
    }
  })

  it('contains no transport, credential-content, execution, or logging capability', async () => {
    const source = await readFile(
      join(
        process.cwd(),
        'app',
        'src',
        'lib',
        'issue-trackers',
        'issue-tracker-model.ts'
      ),
      'utf8'
    )

    assert.doesNotMatch(source, /^\s*import\b/gm)
    assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(/)
    assert.doesNotMatch(
      source,
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|axios|got)\b/
    )
    assert.doesNotMatch(source, /\brequest\s*\(/)
    assert.doesNotMatch(
      source,
      /['"](?:node:)?(?:http|https|net|tls|fs|child_process|worker_threads)['"]/
    )
    assert.doesNotMatch(source, /\b(?:process|Deno|Bun|electron)\s*\./)
    assert.doesNotMatch(source, /\b(?:ipcMain|ipcRenderer|shell)\b/)
    assert.doesNotMatch(source, /\b(?:exec|execFile|spawn|fork)\s*\(/)
    assert.doesNotMatch(source, /\b(?:console|logger)\s*\.|\blog\s*\(/)
    assert.doesNotMatch(
      source,
      /\b(?:token|password|authorization|headers?)\s*[?:]/i
    )
    assert.doesNotMatch(source, /export\s+function\s+(?:serialize|toRequest)\b/)
  })
})
