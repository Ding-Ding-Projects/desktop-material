import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  ConflictForecastMaximumChangedFiles,
  ConflictForecastMaximumIgnoredScopes,
  ConflictForecastMaximumReportedOverlaps,
  ConflictForecastValidationError,
  createConflictForecastInput,
  createConflictWarningScopeKey,
  evaluateConflictForecast,
  isConflictWarningScopeKey,
} from '../../src/lib/conflict-prevention/conflict-forecast'

const oid = '1'.repeat(40)

const input = (
  localFiles: ReadonlyArray<unknown> = [
    { path: 'src/app.ts', change: 'modified' },
  ],
  peerFiles: ReadonlyArray<unknown> = [
    { path: 'src/app.ts', change: 'modified' },
  ]
) => ({
  local: {
    repositoryId: 'repository-1',
    branchName: 'feature/local',
    baseOid: oid,
    changedFiles: { availability: 'value', value: localFiles },
  },
  peer: { peerId: 'peer-1', displayName: 'Ada' },
  peerChanges: {
    repositoryId: 'repository-1',
    branchName: 'feature/peer',
    baseOid: oid,
    changedFiles: { availability: 'value', value: peerFiles },
  },
  actions: {
    ignoreBranch: { availability: 'available' },
    pushForFetch: { availability: 'unavailable', reason: 'no-remote' },
    sendSelfHostedPatch: { availability: 'available' },
  },
})

describe('conflict forecast evaluation', () => {
  it('classifies exact Windows-path overlaps deterministically', () => {
    const result = evaluateConflictForecast(
      input(
        [
          { path: 'src/Zeta.ts', change: 'deleted' },
          { path: 'src/added.ts', change: 'added' },
          { path: 'src/app.ts', change: 'modified' },
        ],
        [
          { path: 'SRC/APP.TS', change: 'deleted' },
          { path: 'src/Added.ts', change: 'added' },
          { path: 'src/zeta.ts', change: 'modified' },
        ]
      )
    )

    assert.equal(result.kind, 'potential-conflict')
    if (result.kind !== 'potential-conflict') {
      return
    }
    assert.equal(result.overlappingFileCount, 3)
    assert.equal(result.overlappingFilesTruncated, false)
    assert.deepEqual(result.overlappingFiles, [
      {
        path: 'src/added.ts',
        peerPath: 'src/Added.ts',
        localChange: 'added',
        peerChange: 'added',
        risk: 'both-added',
      },
      {
        path: 'src/app.ts',
        peerPath: 'SRC/APP.TS',
        localChange: 'modified',
        peerChange: 'deleted',
        risk: 'delete-vs-change',
      },
      {
        path: 'src/Zeta.ts',
        peerPath: 'src/zeta.ts',
        localChange: 'deleted',
        peerChange: 'modified',
        risk: 'delete-vs-change',
      },
    ])
    assert.equal(result.peerDisplayName, 'Ada')
    assert.deepEqual(result.actions.pushForFetch, {
      availability: 'unavailable',
      reason: 'no-remote',
    })
    assert.deepEqual(result.actions.sendSelfHostedPatch, {
      availability: 'available',
    })
    assert.deepEqual(result.actions.ignoreBranch, {
      availability: 'available',
      scopeKey: result.scopeKey,
    })
    assert.ok(Object.isFrozen(result))
    assert.ok(Object.isFrozen(result.overlappingFiles))
    assert.ok(result.overlappingFiles.every(Object.isFrozen))
    assert.ok(Object.isFrozen(result.actions))
  })

  it('distinguishes clear and unavailable evidence states', () => {
    assert.equal(evaluateConflictForecast(input([], [])).kind, 'clear')
    assert.deepEqual(evaluateConflictForecast(input([], [])), {
      kind: 'clear',
      scopeKey: createConflictWarningScopeKey('repository-1', 'feature/local'),
      reason: 'no-local-changes',
    })
    assert.deepEqual(
      evaluateConflictForecast(
        input(
          [{ path: 'src/local.ts', change: 'modified' }],
          [{ path: 'src/peer.ts', change: 'modified' }]
        )
      ),
      {
        kind: 'clear',
        scopeKey: createConflictWarningScopeKey(
          'repository-1',
          'feature/local'
        ),
        reason: 'no-overlapping-files',
      }
    )

    const unavailable = input()
    unavailable.local.changedFiles = {
      availability: 'unavailable',
      reason: 'offline',
    } as never
    assert.deepEqual(evaluateConflictForecast(unavailable), {
      kind: 'unavailable',
      scopeKey: createConflictWarningScopeKey('repository-1', 'feature/local'),
      reason: 'local-inventory-unavailable',
    })
  })

  it('fails unavailable for repository or comparison-base drift', () => {
    const wrongRepository = input()
    wrongRepository.peerChanges.repositoryId = 'repository-2'
    assert.equal(
      (evaluateConflictForecast(wrongRepository) as { reason: string }).reason,
      'repository-mismatch'
    )

    const wrongBase = input()
    wrongBase.peerChanges.baseOid = '2'.repeat(40)
    assert.equal(
      (evaluateConflictForecast(wrongBase) as { reason: string }).reason,
      'comparison-base-mismatch'
    )
  })

  it('detects file/directory collisions but ignores matching deletions', () => {
    const collision = evaluateConflictForecast(
      input(
        [{ path: 'src/generated', change: 'added' }],
        [{ path: 'src/generated/output.ts', change: 'modified' }]
      )
    )
    assert.equal(collision.kind, 'potential-conflict')
    if (collision.kind === 'potential-conflict') {
      assert.deepEqual(collision.overlappingFiles, [
        {
          path: 'src/generated',
          peerPath: 'src/generated/output.ts',
          localChange: 'added',
          peerChange: 'modified',
          risk: 'file-directory-collision',
        },
      ])
    }

    assert.deepEqual(
      evaluateConflictForecast(
        input(
          [{ path: 'src/retired.ts', change: 'deleted' }],
          [{ path: 'SRC/RETIRED.TS', change: 'deleted' }]
        )
      ),
      {
        kind: 'clear',
        scopeKey: createConflictWarningScopeKey(
          'repository-1',
          'feature/local'
        ),
        reason: 'no-overlapping-files',
      }
    )
  })

  it('detects explicit and conservative divergent rename evidence', () => {
    const explicit = evaluateConflictForecast(
      input(
        [
          {
            path: 'src/local-name.ts',
            previousPath: 'src/original.ts',
            change: 'renamed',
          },
        ],
        [
          {
            path: 'src/peer-name.ts',
            previousPath: 'SRC/ORIGINAL.TS',
            change: 'renamed',
          },
        ]
      )
    )
    assert.equal(explicit.kind, 'potential-conflict')
    if (explicit.kind === 'potential-conflict') {
      assert.deepEqual(explicit.overlappingFiles, [
        {
          path: 'src/local-name.ts',
          peerPath: 'src/peer-name.ts',
          localChange: 'renamed',
          peerChange: 'renamed',
          risk: 'divergent-rename',
        },
      ])
    }

    const conservative = evaluateConflictForecast(
      input(
        [
          { path: 'src/original.ts', change: 'deleted' },
          { path: 'src/local-name.ts', change: 'added' },
        ],
        [
          { path: 'SRC/ORIGINAL.TS', change: 'deleted' },
          { path: 'src/peer-name.ts', change: 'added' },
        ]
      )
    )
    assert.equal(conservative.kind, 'potential-conflict')
    if (conservative.kind === 'potential-conflict') {
      assert.deepEqual(conservative.overlappingFiles, [
        {
          path: 'src/original.ts',
          peerPath: 'SRC/ORIGINAL.TS',
          localChange: 'deleted',
          peerChange: 'deleted',
          risk: 'divergent-rename',
        },
      ])
    }

    const renameVsChange = evaluateConflictForecast(
      input(
        [
          {
            path: 'src/renamed.ts',
            previousPath: 'src/original.ts',
            change: 'renamed',
          },
        ],
        [{ path: 'src/original.ts', change: 'modified' }]
      )
    )
    assert.equal(renameVsChange.kind, 'potential-conflict')
    if (renameVsChange.kind === 'potential-conflict') {
      assert.equal(renameVsChange.overlappingFiles[0].risk, 'rename-vs-change')
    }
  })

  it('counts prefix collisions symmetrically and bounds the disclosed sample', () => {
    const descendants = [
      { path: 'src/tree/a.ts', change: 'modified' },
      { path: 'src/tree/b.ts', change: 'modified' },
    ]
    const ancestor = [{ path: 'src/tree', change: 'added' }]
    const forward = evaluateConflictForecast(input(ancestor, descendants))
    const reverse = evaluateConflictForecast(input(descendants, ancestor))
    assert.equal(
      forward.kind === 'potential-conflict' ? forward.overlappingFileCount : 0,
      2
    )
    assert.equal(
      reverse.kind === 'potential-conflict' ? reverse.overlappingFileCount : 0,
      2
    )

    const manyDescendants = Array.from(
      { length: ConflictForecastMaximumReportedOverlaps + 10 },
      (_, index) => ({
        path: `src/tree/${String(index).padStart(3, '0')}.ts`,
        change: 'modified',
      })
    )
    const bounded = evaluateConflictForecast(input(ancestor, manyDescendants))
    assert.equal(bounded.kind, 'potential-conflict')
    if (bounded.kind === 'potential-conflict') {
      assert.equal(
        bounded.overlappingFileCount,
        ConflictForecastMaximumReportedOverlaps + 10
      )
      assert.equal(
        bounded.overlappingFiles.length,
        ConflictForecastMaximumReportedOverlaps
      )
      assert.equal(bounded.overlappingFilesTruncated, true)
    }
  })

  it('uses a canonical repository-and-local-branch ignore scope', () => {
    const scope = createConflictWarningScopeKey('repository-1', 'feature/local')
    assert.equal(isConflictWarningScopeKey(scope), true)
    assert.deepEqual(evaluateConflictForecast(input(), [scope]), {
      kind: 'ignored',
      scopeKey: scope,
    })

    const otherBranch = createConflictWarningScopeKey(
      'repository-1',
      'feature/other'
    )
    assert.equal(
      evaluateConflictForecast(input(), [otherBranch]).kind,
      'potential-conflict'
    )

    const mismatched = input()
    mismatched.peerChanges.repositoryId = 'repository-2'
    assert.deepEqual(evaluateConflictForecast(mismatched, [scope]), {
      kind: 'unavailable',
      scopeKey: scope,
      reason: 'repository-mismatch',
    })

    const unavailableIgnore = input()
    unavailableIgnore.actions.ignoreBranch = {
      availability: 'unavailable',
      reason: 'not-authorized',
    } as never
    const result = evaluateConflictForecast(unavailableIgnore)
    assert.equal(result.kind, 'potential-conflict')
    if (result.kind === 'potential-conflict') {
      assert.deepEqual(result.actions.ignoreBranch, {
        availability: 'unavailable',
        reason: 'not-authorized',
        scopeKey: result.scopeKey,
      })
    }

    assert.equal(
      isConflictWarningScopeKey(
        '["conflict-warning-scope",1,"repository-1","feature/local","extra"]'
      ),
      false
    )
  })
})

describe('conflict forecast validation', () => {
  it('copies, sorts, and deeply freezes accepted adapter input', () => {
    const original = input(
      [
        { path: 'z/file.ts', change: 'modified' },
        { path: 'a/file.ts', change: 'added' },
      ],
      []
    )
    const copied = createConflictForecastInput(original)
    assert.notEqual(copied, original)
    assert.deepEqual(
      copied.local.changedFiles.availability === 'value'
        ? copied.local.changedFiles.value.map(file => file.path)
        : [],
      ['a/file.ts', 'z/file.ts']
    )
    assert.ok(Object.isFrozen(copied))
    assert.ok(Object.isFrozen(copied.local))
    assert.ok(Object.isFrozen(copied.local.changedFiles))
    assert.ok(Object.isFrozen(copied.actions.sendSelfHostedPatch))
  })

  it('uses Windows ordinal casing for file identities', () => {
    assert.throws(
      () =>
        createConflictForecastInput(
          input(
            [
              { path: 'src/App.ts', change: 'modified' },
              { path: 'src/app.ts', change: 'deleted' },
            ],
            []
          )
        ),
      (error: unknown) =>
        error instanceof ConflictForecastValidationError &&
        error.code === 'invalid-input'
    )
    assert.doesNotThrow(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/I.ts', change: 'modified' },
            { path: 'src/ı.ts', change: 'deleted' },
            { path: 'src/STRASSE.ts', change: 'modified' },
            { path: 'src/Straße.ts', change: 'deleted' },
            { path: 'src/ß.ts', change: 'modified' },
            { path: 'src/ẞ.ts', change: 'deleted' },
            { path: 'src/ς.ts', change: 'modified' },
            { path: 'src/σ.ts', change: 'deleted' },
            { path: 'src/Ǆ.ts', change: 'modified' },
            { path: 'src/ǅ.ts', change: 'deleted' },
          ],
          []
        )
      )
    )

    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/ı.ts', change: 'modified' }],
          [{ path: 'src/I.ts', change: 'modified' }]
        )
      ).kind,
      'clear'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/\u2170.ts', change: 'modified' }],
          [{ path: 'src/\u2160.ts', change: 'modified' }]
        )
      ).kind,
      'potential-conflict'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/\u24d0.ts', change: 'modified' }],
          [{ path: 'src/\u24b6.ts', change: 'modified' }]
        )
      ).kind,
      'potential-conflict'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/\u0525.ts', change: 'modified' }],
          [{ path: 'src/\u0524.ts', change: 'modified' }]
        )
      ).kind,
      'clear'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/\u{10428}.ts', change: 'modified' }],
          [{ path: 'src/\u{10400}.ts', change: 'modified' }]
        )
      ).kind,
      'clear'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/Ǆ.ts', change: 'modified' }],
          [{ path: 'src/ǅ.ts', change: 'modified' }]
        )
      ).kind,
      'clear'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/ᾀ.ts', change: 'modified' }],
          [{ path: 'src/ᾈ.ts', change: 'modified' }]
        )
      ).kind,
      'potential-conflict'
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: 'src/Straße.ts', change: 'modified' }],
          [{ path: 'src/STRASSE.ts', change: 'modified' }]
        )
      ).kind,
      'clear'
    )
    assert.throws(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/ä.ts', change: 'modified' },
            { path: 'src/Ä.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
    assert.throws(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/Ǆ.ts', change: 'modified' },
            { path: 'src/ǆ.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
    assert.throws(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/ᾀ.ts', change: 'modified' },
            { path: 'src/ᾈ.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
    assert.throws(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/\u2160.ts', change: 'modified' },
            { path: 'src/\u2170.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
    assert.throws(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/\u24b6.ts', change: 'modified' },
            { path: 'src/\u24d0.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
    assert.doesNotThrow(() =>
      createConflictForecastInput(
        input(
          [
            { path: 'src/\u0524.ts', change: 'modified' },
            { path: 'src/\u0525.ts', change: 'deleted' },
            { path: 'src/\u{10400}.ts', change: 'modified' },
            { path: 'src/\u{10428}.ts', change: 'deleted' },
          ],
          []
        )
      )
    )
  })

  it('preserves valid non-normalized NTFS path identities', () => {
    const decomposed = 'src/e\u0301.ts'
    const composed = 'src/é.ts'
    const copied = createConflictForecastInput(
      input([{ path: decomposed, change: 'modified' }], [])
    )
    assert.equal(
      copied.local.changedFiles.availability === 'value'
        ? copied.local.changedFiles.value[0].path
        : '',
      decomposed
    )
    assert.equal(
      evaluateConflictForecast(
        input(
          [{ path: decomposed, change: 'modified' }],
          [{ path: composed, change: 'modified' }]
        )
      ).kind,
      'clear'
    )

    const branch = input()
    branch.local.branchName = 'feature/e\u0301'
    assert.equal(
      createConflictForecastInput(branch).local.branchName,
      'feature/e\u0301'
    )

    const nonBreakingSpace = 'src/file.ts\u00a0'
    const spaced = createConflictForecastInput(
      input([{ path: nonBreakingSpace, change: 'modified' }], [])
    )
    assert.equal(
      spaced.local.changedFiles.availability === 'value'
        ? spaced.local.changedFiles.value[0].path
        : '',
      nonBreakingSpace
    )
  })

  it('accepts an explicit case-only Windows rename', () => {
    const candidate = input(
      [
        {
          path: 'src/foo.ts',
          change: 'renamed',
          previousPath: 'src/Foo.ts',
        },
      ],
      []
    )
    const copied = createConflictForecastInput(candidate)
    assert.deepEqual(
      copied.local.changedFiles.availability === 'value'
        ? copied.local.changedFiles.value[0]
        : null,
      {
        path: 'src/foo.ts',
        change: 'renamed',
        previousPath: 'src/Foo.ts',
      }
    )
    assert.equal(
      evaluateConflictForecast(
        input(candidate.local.changedFiles.value, [
          { path: 'src/FOO.ts', change: 'modified' },
        ])
      ).kind,
      'potential-conflict'
    )
  })

  it('rejects unsafe Windows checkout paths and branch names', () => {
    for (const path of [
      '../secret',
      '/absolute',
      'C:/drive',
      'src\\backslash',
      '.git/config',
      'AUX.txt',
      'COM¹.txt',
      'LPT²',
      'src/trailing.',
      'src/ report.txt',
      'src//double',
      'src/next\u0085line',
      'src/arabic\u061cmark',
      'src/line\u2028separator',
      'src/paragraph\u2029separator',
      'src/\u202esecret',
      'src/zero\u200bwidth',
      'src/word\u2060joiner',
      'src/soft\u00adhyphen',
      'src/bom\ufeffmark',
    ]) {
      assert.throws(() =>
        createConflictForecastInput(input([{ path, change: 'modified' }], []))
      )
    }

    for (const branchName of [
      '../main',
      'HEAD',
      '-danger',
      'refs//main',
      'feature/.hidden',
      'main.lock',
      'feature/topic.LOCK',
      'feature/trailing.',
      'CON/feature',
      'feature/COM1/topic',
      'AUX.txt/topic',
      'bad name',
      'feature/zero\u200bwidth',
      'feature/word\u2060joiner',
      'feature/soft\u00adhyphen',
      'feature/bom\ufeffmark',
    ]) {
      const candidate = input()
      candidate.local.branchName = branchName
      assert.throws(() => createConflictForecastInput(candidate))
    }
  })

  it('rejects malformed identities, object IDs, capability facts, and bounds', () => {
    const invalidOid = input()
    invalidOid.local.baseOid = 'abc'
    assert.throws(() => createConflictForecastInput(invalidOid))

    const zeroOid = input()
    zeroOid.local.baseOid = '0'.repeat(40)
    assert.throws(() => createConflictForecastInput(zeroOid))

    const invalidCapability = input()
    invalidCapability.actions.ignoreBranch = {
      availability: 'available',
      reason: 'secret-reason',
    } as never
    assert.throws(() => createConflictForecastInput(invalidCapability))

    const tooMany = input(
      Array.from(
        { length: ConflictForecastMaximumChangedFiles + 1 },
        (_, i) => ({
          path: `src/${i}.ts`,
          change: 'modified',
        })
      ),
      []
    )
    assert.throws(() => createConflictForecastInput(tooMany))
  })

  it('rejects extras, symbols, sparse arrays, and accessors without invoking getters', () => {
    assert.throws(() =>
      createConflictForecastInput({ ...input(), extra: true })
    )

    const symbol = input() as Record<PropertyKey, unknown>
    symbol[Symbol('hidden')] = true
    assert.throws(() => createConflictForecastInput(symbol))

    const sparse = input()
    sparse.local.changedFiles.value = new Array(1) as never
    assert.throws(() => createConflictForecastInput(sparse))

    let getterRead = false
    const accessor = input()
    Object.defineProperty(accessor.peer, 'displayName', {
      enumerable: true,
      get: () => {
        getterRead = true
        return 'secret'
      },
    })
    assert.throws(() => createConflictForecastInput(accessor))
    assert.equal(getterRead, false)

    const arrayAccessor = input()
    const files = [{ path: 'src/app.ts', change: 'modified' }]
    Object.defineProperty(files, 0, {
      enumerable: true,
      get: () => {
        getterRead = true
        return { path: 'secret', change: 'modified' }
      },
    })
    arrayAccessor.local.changedFiles.value = files as never
    assert.throws(() => createConflictForecastInput(arrayAccessor))
    assert.equal(getterRead, false)

    const surplusIndex = input()
    const surplusFiles = [{ path: 'src/app.ts', change: 'modified' }]
    Object.defineProperty(surplusFiles, '4294967295', {
      enumerable: true,
      value: { path: 'src/hidden.ts', change: 'modified' },
    })
    surplusIndex.local.changedFiles.value = surplusFiles as never
    assert.throws(() => createConflictForecastInput(surplusIndex))

    let proxyGet = false
    const proxiedFiles = new Proxy(
      [{ path: 'src/app.ts', change: 'modified' }],
      {
        get: () => {
          proxyGet = true
          throw new Error('array get trap must not run')
        },
      }
    )
    const proxied = input()
    proxied.local.changedFiles.value = proxiedFiles as never
    assert.throws(() => createConflictForecastInput(proxied))
    assert.equal(proxyGet, false)

    let ownKeysCalls = 0
    const hiddenSurplus = new Proxy(
      { ...input(), extra: true },
      {
        ownKeys: target => {
          ownKeysCalls++
          return Reflect.ownKeys(target).filter(key => key !== 'extra')
        },
      }
    )
    assert.throws(() => createConflictForecastInput(hiddenSurplus))
    assert.equal(ownKeysCalls, 0)

    const revokedInput = Proxy.revocable({}, {})
    revokedInput.revoke()
    assert.throws(
      () => createConflictForecastInput(revokedInput.proxy),
      (error: unknown) =>
        error instanceof ConflictForecastValidationError &&
        error.code === 'invalid-input'
    )

    const revokedFiles = Proxy.revocable([], {})
    revokedFiles.revoke()
    const revokedNested = input()
    revokedNested.local.changedFiles.value = revokedFiles.proxy as never
    assert.throws(
      () => createConflictForecastInput(revokedNested),
      (error: unknown) =>
        error instanceof ConflictForecastValidationError &&
        error.code === 'invalid-input'
    )
  })

  it('rejects malformed, duplicate, sparse, and oversized ignore lists', () => {
    const scope = createConflictWarningScopeKey('repository-1', 'feature/local')
    assert.throws(
      () => evaluateConflictForecast(input(), [scope, scope]),
      (error: unknown) =>
        error instanceof ConflictForecastValidationError &&
        error.code === 'invalid-ignore-list'
    )
    assert.throws(() => evaluateConflictForecast(input(), ['not-a-key']))
    assert.throws(() =>
      evaluateConflictForecast(
        input(),
        new Array(ConflictForecastMaximumIgnoredScopes + 1).fill(scope)
      )
    )
    assert.throws(() => evaluateConflictForecast(input(), new Array(1)))

    const revoked = Proxy.revocable([], {})
    revoked.revoke()
    assert.throws(
      () => evaluateConflictForecast(input(), revoked.proxy),
      (error: unknown) =>
        error instanceof ConflictForecastValidationError &&
        error.code === 'invalid-ignore-list'
    )
  })
})
