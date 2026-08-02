import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  CommitCompositionPlanError,
  CommitCompositionPushedFact,
  CommitCompositionSourceKind,
  createCommitCompositionPlan,
  ICommitCompositionGroup,
  ICommitCompositionPlan,
  IExistingHistoryCommitCompositionUnit,
  IWorkingTreeCommitCompositionUnit,
  MaximumCommitCompositionDescriptionBytes,
  MaximumCommitCompositionGroups,
  MaximumCommitCompositionLabelBytes,
  MaximumCommitCompositionPathBytes,
  MaximumCommitCompositionTitleBytes,
  MaximumCommitCompositionUnits,
  moveCommitCompositionUnit,
  updateCommitCompositionGroupTitle,
} from '../../src/lib/commit-composition/commit-composition-plan'

function hex(index: number, width = 64): string {
  return index.toString(16).padStart(width, '0')
}

function unitId(
  index: number,
  kind: CommitCompositionSourceKind = 'working-tree'
): string {
  return `${kind}:${hex(index)}`
}

function groupId(index: number): string {
  return `group:${hex(index)}`
}

function fingerprint(index: number): string {
  return `sha256:${hex(index)}`
}

function commitId(index: number, width: 40 | 64 = 40): string {
  return hex(index, width)
}

function working(
  index: number,
  path = `src/file-${index}.ts`
): IWorkingTreeCommitCompositionUnit {
  return {
    kind: 'working-tree',
    id: unitId(index),
    contentFingerprint: fingerprint(index),
    path,
  }
}

function history(
  index: number,
  pushed: CommitCompositionPushedFact = { value: false },
  width: 40 | 64 = 40,
  label = `Commit ${index}`
): IExistingHistoryCommitCompositionUnit {
  return {
    kind: 'existing-history',
    id: unitId(index, 'existing-history'),
    contentFingerprint: fingerprint(index),
    label,
    commitId: commitId(index, width),
    pushed,
  }
}

function group(
  index: number,
  unitIds: ReadonlyArray<string>,
  title = `Commit group ${index}`,
  description = `Description ${index}`
): ICommitCompositionGroup {
  return { groupId: groupId(index), title, description, unitIds }
}

function assertPlanError(
  operation: () => unknown,
  code: CommitCompositionPlanError['code']
): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof CommitCompositionPlanError)
    assert.equal(error.code, code)
    return true
  })
}

function flattened(plan: ICommitCompositionPlan): ReadonlyArray<string> {
  return plan.groups.flatMap(value => value.unitIds)
}

function permutations<T>(
  values: ReadonlyArray<T>
): ReadonlyArray<ReadonlyArray<T>> {
  if (values.length <= 1) {
    return [[...values]]
  }
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      suffix => [value, ...suffix]
    )
  )
}

describe('commit composition plan construction', () => {
  it('preserves reviewed order separately from deterministic proposal grouping', () => {
    const units = [working(1), working(2), working(3)]
    const plan = createCommitCompositionPlan(units, [
      group(1, [units[1].id]),
      group(2, [units[0].id, units[2].id]),
    ])

    assert.equal(plan.sourceKind, 'working-tree')
    assert.deepEqual(
      plan.reviewedUnitIds,
      units.map(unit => unit.id)
    )
    assert.deepEqual(flattened(plan), [units[1].id, units[0].id, units[2].id])
    assert.deepEqual(plan.summary, {
      sourceKind: 'working-tree',
      unitCount: 3,
      groupCount: 2,
      reordered: true,
      requiresPause: false,
      requiresReview: true,
      pushedCount: 0,
      pushedEvidenceUnavailableCount: 0,
      requiresPushedHistoryConfirmation: false,
    })
    assert.deepEqual(Reflect.ownKeys(plan.reviewedUnits[0]).sort(), [
      'contentFingerprint',
      'id',
      'kind',
      'path',
    ])
    assert.equal('commitId' in plan.reviewedUnits[0], false)
    assert.equal('pushed' in plan.reviewedUnits[0], false)
  })

  it('keeps pushed true, false, and unavailable evidence distinct', () => {
    const units = [
      history(1, { value: true }),
      history(2, { value: false }),
      history(3, { unavailable: true }),
    ]
    const plan = createCommitCompositionPlan(units, [
      group(
        1,
        units.map(unit => unit.id)
      ),
    ])

    assert.deepEqual(plan.summary, {
      sourceKind: 'existing-history',
      unitCount: 3,
      groupCount: 1,
      reordered: false,
      requiresPause: true,
      requiresReview: true,
      pushedCount: 1,
      pushedEvidenceUnavailableCount: 1,
      requiresPushedHistoryConfirmation: true,
    })
    const output =
      plan.reviewedUnits as ReadonlyArray<IExistingHistoryCommitCompositionUnit>
    assert.deepEqual(
      output.map(unit => unit.pushed),
      [{ value: true }, { value: false }, { unavailable: true }]
    )
    assert.deepEqual(Reflect.ownKeys(output[2].pushed), ['unavailable'])
    assert.equal('value' in output[2].pushed, false)
    assert.deepEqual(Reflect.ownKeys(output[0]).sort(), [
      'commitId',
      'contentFingerprint',
      'id',
      'kind',
      'label',
      'pushed',
    ])

    const noKnownPushed = createCommitCompositionPlan(
      [history(1, { value: false }), history(2, { unavailable: true })],
      [group(1, [unitId(1, 'existing-history'), unitId(2, 'existing-history')])]
    )
    assert.equal(noKnownPushed.summary.pushedCount, 0)
    assert.equal(noKnownPushed.summary.pushedEvidenceUnavailableCount, 1)
    assert.equal(noKnownPushed.summary.requiresPushedHistoryConfirmation, false)
  })

  it('canonicalizes inert display text with NFC and Unicode whitespace folding', () => {
    const decomposed = 'Cafe\u0301'
    const unit = working(1, `  src/${decomposed}   file.ts  `)
    const plan = createCommitCompositionPlan(
      [unit],
      [
        group(
          1,
          [unit.id],
          `  ${decomposed}\u00a0  title  `,
          `  safe   display-only   description  `
        ),
      ]
    )

    assert.equal(plan.reviewedUnits[0].kind, 'working-tree')
    if (plan.reviewedUnits[0].kind === 'working-tree') {
      assert.equal(plan.reviewedUnits[0].path, 'src/Café file.ts')
    }
    assert.equal(plan.groups[0].title, 'Café title')
    assert.equal(plan.groups[0].description, 'safe display-only description')

    const inert = updateCommitCompositionGroupTitle(
      plan,
      plan.groups[0].groupId,
      '  exec powershell -- display text only  '
    )
    assert.equal(inert.groups[0].title, 'exec powershell -- display text only')
  })

  it('copies caller input and deeply freezes every output layer', () => {
    const callerUnit = working(1)
    const callerUnits = [callerUnit]
    const callerGroup = group(1, [callerUnit.id])
    const callerGroups = [callerGroup]
    const plan = createCommitCompositionPlan(callerUnits, callerGroups)

    ;(callerUnit as { path: string }).path = 'changed-after-review.ts'
    callerUnits.push(working(2))
    ;(callerGroup.unitIds as Array<string>).push(unitId(99))
    callerGroups.push(group(2, [unitId(2)]))
    assert.deepEqual(plan.reviewedUnitIds, [unitId(1)])
    assert.equal(
      (plan.reviewedUnits[0] as IWorkingTreeCommitCompositionUnit).path,
      'src/file-1.ts'
    )
    assert.deepEqual(plan.groups[0].unitIds, [unitId(1)])

    assert.equal(Object.isFrozen(plan), true)
    assert.equal(Object.isFrozen(plan.reviewedUnits), true)
    assert.equal(Object.isFrozen(plan.reviewedUnits[0]), true)
    assert.equal(Object.isFrozen(plan.reviewedUnitIds), true)
    assert.equal(Object.isFrozen(plan.groups), true)
    assert.equal(Object.isFrozen(plan.groups[0]), true)
    assert.equal(Object.isFrozen(plan.groups[0].unitIds), true)
    assert.equal(Object.isFrozen(plan.summary), true)

    const historyPlan = createCommitCompositionPlan(
      [history(1, { unavailable: true })],
      [group(1, [unitId(1, 'existing-history')])]
    )
    assert.equal(
      Object.isFrozen(
        (historyPlan.reviewedUnits[0] as IExistingHistoryCommitCompositionUnit)
          .pushed
      ),
      true
    )
    assert.throws(() => {
      ;(plan.groups[0].unitIds as Array<string>).push(unitId(2))
    }, TypeError)
    assert.throws(() => {
      ;(plan.summary as { unitCount: number }).unitCount = 99
    }, TypeError)
  })
})

describe('commit composition exact input shapes', () => {
  it('rejects missing, surplus, hidden, symbol, and accessor record fields', () => {
    const id = unitId(1)
    const symbol = Symbol('surplus')
    const cases: ReadonlyArray<unknown> = [
      { kind: 'working-tree', id, contentFingerprint: fingerprint(1) },
      { ...working(1), extra: true },
      { ...working(1), pushed: { value: false } },
      { ...working(1), commitId: commitId(1) },
      { ...working(1), [symbol]: true },
    ]
    const hidden = working(1) as unknown as Record<string, unknown>
    Object.defineProperty(hidden, 'hidden', { value: true })

    for (const value of [...cases, hidden]) {
      assertPlanError(
        () => createCommitCompositionPlan([value], [group(1, [id])]),
        'invalid-shape'
      )
    }

    let unitGetterRead = false
    const accessorUnit = {
      id,
      contentFingerprint: fingerprint(1),
      path: 'src/file.ts',
      get kind() {
        unitGetterRead = true
        return 'working-tree'
      },
    }
    assertPlanError(
      () => createCommitCompositionPlan([accessorUnit], [group(1, [id])]),
      'invalid-shape'
    )
    assert.equal(unitGetterRead, false)

    let titleGetterRead = false
    const accessorGroup = {
      groupId: groupId(1),
      description: 'Description',
      unitIds: [id],
      get title() {
        titleGetterRead = true
        return 'Title'
      },
    }
    assertPlanError(
      () => createCommitCompositionPlan([working(1)], [accessorGroup]),
      'invalid-shape'
    )
    assert.equal(titleGetterRead, false)

    const invalidGroups: ReadonlyArray<unknown> = [
      { ...group(1, [id]), extra: true },
      { ...group(1, [id]), [Symbol('group')]: true },
      { groupId: groupId(1), title: 'Title', unitIds: [id] },
    ]
    const hiddenGroup = group(1, [id]) as unknown as Record<string, unknown>
    Object.defineProperty(hiddenGroup, 'hidden', { value: true })
    for (const value of [...invalidGroups, hiddenGroup]) {
      assertPlanError(
        () => createCommitCompositionPlan([working(1)], [value]),
        'invalid-shape'
      )
    }
  })

  it('accepts exact null-prototype records and rejects custom prototypes', () => {
    const nullPrototypeUnit = Object.assign(Object.create(null), working(1))
    const nullPrototypeGroup = Object.assign(
      Object.create(null),
      group(1, [unitId(1)])
    )
    const plan = createCommitCompositionPlan(
      [nullPrototypeUnit],
      [nullPrototypeGroup]
    )
    assert.deepEqual(plan.reviewedUnitIds, [unitId(1)])

    class UnitRecord {
      public readonly kind = 'working-tree'
      public readonly id = unitId(1)
      public readonly contentFingerprint = fingerprint(1)
      public readonly path = 'src/file.ts'
    }
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [new UnitRecord()],
          [group(1, [unitId(1)])]
        ),
      'invalid-shape'
    )
  })

  it('rejects malformed pushed evidence without reading accessors', () => {
    const invalidFacts: ReadonlyArray<unknown> = [
      {},
      { value: 1 },
      { unavailable: false },
      { value: false, unavailable: true },
      { value: false, extra: true },
      { [Symbol('fact')]: true, unavailable: true },
    ]
    for (const pushed of invalidFacts) {
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [{ ...history(1), pushed }],
            [group(1, [unitId(1, 'existing-history')])]
          ),
        'invalid-pushed-evidence'
      )
    }

    let getterRead = false
    const accessor = {}
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get() {
        getterRead = true
        return true
      },
    })
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [{ ...history(1), pushed: accessor }],
          [group(1, [unitId(1, 'existing-history')])]
        ),
      'invalid-pushed-evidence'
    )
    assert.equal(getterRead, false)
  })

  it('rejects sparse, accessor, surplus, symbolic, and unusual arrays', () => {
    const sparse = new Array<unknown>(1)
    const accessor = new Array<unknown>(1)
    let arrayGetterRead = false
    Object.defineProperty(accessor, 0, {
      enumerable: true,
      get() {
        arrayGetterRead = true
        return working(1)
      },
    })
    const nullPrototype = [working(1)]
    Object.setPrototypeOf(nullPrototype, null)
    const customPrototype = [working(1)]
    Object.setPrototypeOf(customPrototype, {})
    const stringSurplus = [working(1)]
    Object.defineProperty(stringSurplus, 'reviewed', { value: true })
    const highIndexSurplus = [working(1)]
    Object.defineProperty(highIndexSurplus, '4294967295', { value: true })
    const symbolic = [working(1)]
    Object.defineProperty(symbolic, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
    })

    for (const value of [
      sparse,
      accessor,
      nullPrototype,
      customPrototype,
      stringSurplus,
      highIndexSurplus,
      symbolic,
    ]) {
      assertPlanError(
        () => createCommitCompositionPlan(value, [group(1, [unitId(1)])]),
        'invalid-shape'
      )
    }
    assert.equal(arrayGetterRead, false)

    const units = [working(1)]
    const sparseGroups = new Array<unknown>(1)
    assertPlanError(
      () => createCommitCompositionPlan(units, sparseGroups),
      'invalid-shape'
    )
    const accessorIds = new Array<unknown>(1)
    Object.defineProperty(accessorIds, 0, {
      enumerable: true,
      get() {
        arrayGetterRead = true
        return unitId(1)
      },
    })
    assertPlanError(
      () =>
        createCommitCompositionPlan(units, [
          { ...group(1, []), unitIds: accessorIds },
        ]),
      'invalid-shape'
    )
    assert.equal(arrayGetterRead, false)
  })

  it('fails closed when reflection on a revoked proxy throws', () => {
    const revocable = Proxy.revocable(working(1), {})
    revocable.revoke()
    assertPlanError(
      () =>
        createCommitCompositionPlan([revocable.proxy], [group(1, [unitId(1)])]),
      'invalid-shape'
    )

    const arrayRevocable = Proxy.revocable([working(1)], {})
    arrayRevocable.revoke()
    assertPlanError(
      () =>
        createCommitCompositionPlan(arrayRevocable.proxy, [
          group(1, [unitId(1)]),
        ]),
      'invalid-shape'
    )
  })
})

describe('commit composition identities and bounds', () => {
  it('requires full source-bound stable ids and exact SHA-256 fingerprints', () => {
    for (const id of [
      unitId(1).slice(0, -1),
      unitId(1).toUpperCase(),
      ` ${unitId(1)}`,
      unitId(1, 'existing-history'),
      'working-tree:not-a-digest',
    ]) {
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [{ ...working(1), id }],
            [group(1, [id])]
          ),
        'invalid-id'
      )
    }

    for (const contentFingerprint of [
      hex(1),
      `sha256:${hex(1, 63)}`,
      `sha256:${hex(1)}0`,
      `sha256:${hex(10).toUpperCase()}`,
      `sha1:${hex(1, 40)}`,
    ]) {
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [{ ...working(1), contentFingerprint }],
            [group(1, [unitId(1)])]
          ),
        'invalid-fingerprint'
      )
    }

    const sameFingerprint = createCommitCompositionPlan(
      [working(1), { ...working(2), contentFingerprint: fingerprint(1) }],
      [group(1, [unitId(1), unitId(2)])]
    )
    assert.equal(sameFingerprint.summary.unitCount, 2)
  })

  it('rejects malformed, zero, duplicate, and mixed-width history commit ids', () => {
    for (const id of [
      commitId(1).slice(0, -1),
      commitId(10).toUpperCase(),
      'g'.repeat(40),
      '0'.repeat(40),
      ` ${commitId(1)}`,
    ]) {
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [{ ...history(1), commitId: id }],
            [group(1, [unitId(1, 'existing-history')])]
          ),
        'invalid-commit-id'
      )
    }

    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [history(1), { ...history(2), commitId: commitId(1) }],
          [
            group(1, [
              unitId(1, 'existing-history'),
              unitId(2, 'existing-history'),
            ]),
          ]
        ),
      'duplicate-commit-id'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [history(1, { value: false }, 40), history(2, { value: false }, 64)],
          [
            group(1, [
              unitId(1, 'existing-history'),
              unitId(2, 'existing-history'),
            ]),
          ]
        ),
      'mixed-commit-id-width'
    )

    const sha256History = createCommitCompositionPlan(
      [history(1, { value: false }, 64), history(2, { value: false }, 64)],
      [group(1, [unitId(1, 'existing-history'), unitId(2, 'existing-history')])]
    )
    assert.equal(
      (sha256History.reviewedUnits[0] as IExistingHistoryCommitCompositionUnit)
        .commitId.length,
      64
    )
  })

  it('rejects duplicate unit and group ids plus mixed source kinds', () => {
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), working(1)],
          [group(1, [unitId(1)])]
        ),
      'duplicate-id'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), working(2)],
          [group(1, [unitId(1)]), group(1, [unitId(2)])]
        ),
      'duplicate-id'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), history(2)],
          [group(1, [unitId(1), unitId(2, 'existing-history')])]
        ),
      'mixed-source-kind'
    )
  })

  it('rejects controls, bidi overrides, line separators, and lone surrogates', () => {
    const hostile = [
      'text\nnext',
      'text\rnext',
      'text\u0000next',
      'text\u0085next',
      'text\u061cnext',
      'text\u200enext',
      'text\u2028next',
      'text\u202enext',
      'text\u2066next',
      'text\u206anext',
      'text\ufeffnext',
      'text\ud800next',
      'text\udc00next',
    ]
    for (const text of hostile) {
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [working(1, text)],
            [group(1, [unitId(1)])]
          ),
        'invalid-display-text'
      )
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [history(1, { value: false }, 40, text)],
            [group(1, [unitId(1, 'existing-history')])]
          ),
        'invalid-display-text'
      )
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [working(1)],
            [group(1, [unitId(1)], text)]
          ),
        'invalid-title'
      )
      assertPlanError(
        () =>
          createCommitCompositionPlan(
            [working(1)],
            [group(1, [unitId(1)], 'Title', text)]
          ),
        'invalid-description'
      )
    }

    const emoji = 'Safe 🧑‍💻 display text'
    const emojiPlan = createCommitCompositionPlan(
      [working(1, emoji)],
      [group(1, [unitId(1)], emoji, emoji)]
    )
    assert.equal(
      (emojiPlan.reviewedUnits[0] as IWorkingTreeCommitCompositionUnit).path,
      emoji
    )
    assert.equal(emojiPlan.groups[0].title, emoji)
  })

  it('enforces UTF-8 byte bounds before and after canonicalization', () => {
    const exactPath = 'p'.repeat(MaximumCommitCompositionPathBytes)
    const exactLabel = 'l'.repeat(MaximumCommitCompositionLabelBytes)
    const exactTitle = 't'.repeat(MaximumCommitCompositionTitleBytes)
    const exactDescription = 'd'.repeat(
      MaximumCommitCompositionDescriptionBytes
    )
    assert.equal(
      (
        createCommitCompositionPlan(
          [working(1, exactPath)],
          [group(1, [unitId(1)], exactTitle, exactDescription)]
        ).reviewedUnits[0] as IWorkingTreeCommitCompositionUnit
      ).path.length,
      MaximumCommitCompositionPathBytes
    )
    assert.equal(
      (
        createCommitCompositionPlan(
          [history(1, { value: false }, 40, exactLabel)],
          [group(1, [unitId(1, 'existing-history')])]
        ).reviewedUnits[0] as IExistingHistoryCommitCompositionUnit
      ).label.length,
      MaximumCommitCompositionLabelBytes
    )

    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1, `${exactPath}x`)],
          [group(1, [unitId(1)])]
        ),
      'invalid-display-text'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [history(1, { value: false }, 40, `${exactLabel}x`)],
          [group(1, [unitId(1, 'existing-history')])]
        ),
      'invalid-display-text'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          [group(1, [unitId(1)], `${exactTitle}x`)]
        ),
      'invalid-title'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          [group(1, [unitId(1)], 'Title', `${exactDescription}x`)]
        ),
      'invalid-description'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          [group(1, [unitId(1)], 'é'.repeat(129))]
        ),
      'invalid-title'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          [
            group(
              1,
              [unitId(1)],
              ' '.repeat(MaximumCommitCompositionTitleBytes + 1)
            ),
          ]
        ),
      'invalid-title'
    )
  })

  it('accepts exact count bounds and rejects one more without iterating it', () => {
    const units = Array.from(
      { length: MaximumCommitCompositionUnits },
      (_, index) => working(index + 1)
    )
    const groups = units.map((unit, index) => group(index + 1, [unit.id]))
    const maximum = createCommitCompositionPlan(units, groups)
    assert.equal(maximum.summary.unitCount, MaximumCommitCompositionUnits)
    assert.equal(maximum.summary.groupCount, MaximumCommitCompositionGroups)

    assertPlanError(
      () =>
        createCommitCompositionPlan(
          new Array(MaximumCommitCompositionUnits + 1),
          [group(1, [unitId(1)])]
        ),
      'too-many-units'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          new Array(MaximumCommitCompositionGroups + 1)
        ),
      'too-many-groups'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1)],
          [
            {
              ...group(1, [unitId(1)]),
              unitIds: new Array(MaximumCommitCompositionUnits + 1),
            },
          ]
        ),
      'too-many-units'
    )
  })
})

describe('commit composition conservation and determinism', () => {
  it('rejects empty plans, empty groups, and non-conserving proposals', () => {
    assertPlanError(() => createCommitCompositionPlan([], []), 'invalid-plan')
    assertPlanError(
      () => createCommitCompositionPlan([working(1)], []),
      'invalid-plan'
    )
    assertPlanError(
      () => createCommitCompositionPlan([working(1)], [group(1, [])]),
      'invalid-plan'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), working(2)],
          [group(1, [unitId(1)])]
        ),
      'invalid-plan'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), working(2)],
          [group(1, [unitId(1), unitId(1)])]
        ),
      'invalid-plan'
    )
    assertPlanError(
      () =>
        createCommitCompositionPlan(
          [working(1), working(2)],
          [group(1, [unitId(1)]), group(2, [unitId(1)])]
        ),
      'invalid-plan'
    )
    assertPlanError(
      () => createCommitCompositionPlan([working(1)], [group(1, [unitId(99)])]),
      'unknown-unit'
    )
  })

  it('rejects fingerprints, commits, paths, and partial ids used as addresses', () => {
    const unit = working(1)
    for (const replacement of [
      unit.contentFingerprint,
      commitId(1),
      unit.path,
      unit.id.slice(0, -1),
    ]) {
      assertPlanError(
        () => createCommitCompositionPlan([unit], [group(1, [replacement])]),
        'invalid-id'
      )
    }
  })

  it('retains source order while honoring every proposal permutation', () => {
    const units = [working(1), working(2), working(3)]
    const reviewedIds = units.map(unit => unit.id)
    for (const order of permutations(reviewedIds)) {
      const first = createCommitCompositionPlan(units, [group(1, order)])
      const second = createCommitCompositionPlan(units, [group(1, order)])
      assert.deepEqual(first, second)
      assert.deepEqual(first.reviewedUnitIds, reviewedIds)
      assert.deepEqual(flattened(first), order)
      assert.equal(
        first.summary.reordered,
        order.some((id, index) => id !== reviewedIds[index])
      )
    }

    const partitioned = createCommitCompositionPlan(units, [
      group(1, [unitId(1)]),
      group(2, [unitId(2), unitId(3)]),
    ])
    assert.equal(partitioned.summary.reordered, false)
  })
})

describe('commit composition transformations', () => {
  it('updates only a canonical display title by full group id', () => {
    const original = createCommitCompositionPlan(
      [working(1), working(2)],
      [group(1, [unitId(1)]), group(2, [unitId(2)])]
    )
    const updated = updateCommitCompositionGroupTitle(
      original,
      groupId(2),
      '  Cafe\u0301   follow-up  '
    )

    assert.equal(original.groups[1].title, 'Commit group 2')
    assert.equal(updated.groups[1].title, 'Café follow-up')
    assert.equal(updated.groups[0].title, original.groups[0].title)
    assert.deepEqual(updated.reviewedUnits, original.reviewedUnits)
    assert.deepEqual(updated.reviewedUnitIds, original.reviewedUnitIds)
    assert.deepEqual(flattened(updated), flattened(original))
    assert.deepEqual(updated.summary, original.summary)
    assert.equal(Object.isFrozen(updated.groups[1]), true)

    assertPlanError(
      () =>
        updateCommitCompositionGroupTitle(
          original,
          groupId(1).slice(0, -1),
          'Title'
        ),
      'invalid-id'
    )
    assertPlanError(
      () => updateCommitCompositionGroupTitle(original, groupId(99), 'Title'),
      'unknown-group'
    )
  })

  it('moves exact units before an exact anchor or to a group end', () => {
    const original = createCommitCompositionPlan(
      [working(1), working(2), working(3), working(4)],
      [group(1, [unitId(1), unitId(2)]), group(2, [unitId(3), unitId(4)])]
    )
    const movedBefore = moveCommitCompositionUnit(
      original,
      unitId(2),
      groupId(2),
      unitId(3)
    )
    assert.deepEqual(
      original.groups.map(value => value.unitIds),
      [
        [unitId(1), unitId(2)],
        [unitId(3), unitId(4)],
      ]
    )
    assert.deepEqual(
      movedBefore.groups.map(value => value.unitIds),
      [[unitId(1)], [unitId(2), unitId(3), unitId(4)]]
    )
    assert.deepEqual(movedBefore.reviewedUnitIds, original.reviewedUnitIds)
    assert.equal(movedBefore.summary.reordered, false)

    const movedToEnd = moveCommitCompositionUnit(
      original,
      unitId(2),
      groupId(2),
      null
    )
    assert.deepEqual(flattened(movedToEnd), [
      unitId(1),
      unitId(3),
      unitId(4),
      unitId(2),
    ])
    assert.equal(movedToEnd.summary.reordered, true)

    const withinGroup = moveCommitCompositionUnit(
      original,
      unitId(1),
      groupId(1),
      null
    )
    assert.deepEqual(withinGroup.groups[0].unitIds, [unitId(2), unitId(1)])
    assert.equal(Object.isFrozen(withinGroup.groups[0].unitIds), true)
  })

  it('rejects partial, unknown, ambiguous, and emptying moves', () => {
    const plan = createCommitCompositionPlan(
      [working(1), working(2), working(3)],
      [group(1, [unitId(1)]), group(2, [unitId(2), unitId(3)])]
    )
    assertPlanError(
      () =>
        moveCommitCompositionUnit(
          plan,
          unitId(1).slice(0, -1),
          groupId(2),
          null
        ),
      'invalid-id'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(99), groupId(2), null),
      'unknown-unit'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(2), groupId(99), null),
      'unknown-group'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(2), groupId(2), unitId(2)),
      'invalid-operation'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(2), groupId(2), unitId(1)),
      'invalid-operation'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(2), groupId(2), unitId(99)),
      'unknown-unit'
    )
    assertPlanError(
      () => moveCommitCompositionUnit(plan, unitId(1), groupId(2), null),
      'invalid-operation'
    )
  })

  it('revalidates forged plan fields before any transformation', () => {
    const plan = createCommitCompositionPlan(
      [working(1)],
      [group(1, [unitId(1)])]
    )
    const forgedSummary = {
      ...plan,
      summary: { ...plan.summary, unitCount: 99 },
    } as ICommitCompositionPlan
    assertPlanError(
      () =>
        updateCommitCompositionGroupTitle(forgedSummary, groupId(1), 'Title'),
      'invalid-plan'
    )

    let summaryGetterRead = false
    const accessorSummary = { ...plan } as unknown as Record<string, unknown>
    Object.defineProperty(accessorSummary, 'summary', {
      enumerable: true,
      get() {
        summaryGetterRead = true
        return plan.summary
      },
    })
    assertPlanError(
      () =>
        updateCommitCompositionGroupTitle(
          accessorSummary as unknown as ICommitCompositionPlan,
          groupId(1),
          'Title'
        ),
      'invalid-shape'
    )
    assert.equal(summaryGetterRead, false)

    const forgedOrder = {
      ...plan,
      reviewedUnitIds: [unitId(99)],
    } as ICommitCompositionPlan
    assertPlanError(
      () => moveCommitCompositionUnit(forgedOrder, unitId(1), groupId(1), null),
      'invalid-plan'
    )

    const surplus = { ...plan, executable: true } as ICommitCompositionPlan
    assertPlanError(
      () => updateCommitCompositionGroupTitle(surplus, groupId(1), 'Title'),
      'invalid-shape'
    )
  })
})

describe('commit composition capability boundary', () => {
  it('contains no AI, execution, transport, or command-serialization capability', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'lib',
        'commit-composition',
        'commit-composition-plan.ts'
      ),
      'utf8'
    )

    assert.doesNotMatch(source, /^\s*import\b/gm)
    assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(/)
    assert.doesNotMatch(source, /\b(?:process|Deno|Bun)\s*\./)
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/)
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/)
    assert.doesNotMatch(source, /\b(?:exec|execFile|spawn|fork)\s*\(/)
    assert.doesNotMatch(
      source,
      /\b(?:ipcMain|ipcRenderer|child_process|dugite|argv|shellCommand)\b/
    )
    assert.doesNotMatch(source, /export\s+function\s+(?:serialize|toCommand)\b/)
  })
})
