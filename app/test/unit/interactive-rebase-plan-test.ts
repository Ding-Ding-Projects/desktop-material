import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  createInteractiveRebasePlan,
  IInteractiveRebaseAllowedCommit,
  IInteractiveRebasePlan,
  IInteractiveRebasePlanEntryInput,
  InteractiveRebaseAction,
  InteractiveRebasePlanError,
  MaximumInteractiveRebaseCommits,
  MaximumInteractiveRebaseSubjectBytes,
  MaximumInteractiveRebaseTodoBytes,
  parseInteractiveRebaseTodo,
  reorderInteractiveRebaseCommit,
  sanitizeInteractiveRebaseSubject,
  serializeInteractiveRebaseTodo,
  updateInteractiveRebaseAction,
} from '../../src/lib/interactive-rebase/interactive-rebase-plan'

function objectId(index: number, width: 40 | 64 = 40): string {
  return index.toString(16).padStart(width, '0')
}

const first = objectId(1)
const second = objectId(2)
const third = objectId(3)
const fourth = objectId(4)

function entry(
  commitId: string,
  action: InteractiveRebaseAction = 'pick',
  subject = `Subject ${commitId.slice(-4)}`
): IInteractiveRebasePlanEntryInput {
  return { commitId, action, subject }
}

function allowed(
  commitId: string,
  subject = `Subject ${commitId.slice(-4)}`
): IInteractiveRebaseAllowedCommit {
  return { commitId, subject }
}

function assertPlanError(
  operation: () => unknown,
  code: InteractiveRebasePlanError['code']
) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof InteractiveRebasePlanError)
    assert.equal(error.code, code)
    return true
  })
}

function ids(plan: IInteractiveRebasePlan): ReadonlyArray<string> {
  return plan.entries.map(item => item.commitId)
}

describe('interactive rebase plan construction', () => {
  it('models every action, pause fact, and deterministic count', () => {
    const plan = createInteractiveRebasePlan([
      entry(objectId(1), 'pick'),
      entry(objectId(2), 'reword'),
      entry(objectId(3), 'edit'),
      entry(objectId(4), 'squash'),
      entry(objectId(5), 'fixup'),
      entry(objectId(6), 'drop'),
    ])

    assert.equal(plan.objectIdWidth, 40)
    assert.deepEqual(
      plan.entries.map(item => item.action),
      ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']
    )
    assert.deepEqual(
      plan.entries.map(item => item.pauseRequired),
      [false, true, true, false, false, false]
    )
    assert.deepEqual(plan.summary, {
      totalCount: 6,
      effectiveCount: 5,
      droppedCount: 1,
      foldedCount: 2,
      requiresPause: true,
      pauseRequiredCount: 2,
      pauseRequiredCommitIds: [objectId(2), objectId(3)],
      reordered: false,
      actionCounts: {
        pick: 1,
        reword: 1,
        edit: 1,
        squash: 1,
        fixup: 1,
        drop: 1,
      },
    })
  })

  it('canonicalizes safe display subjects without putting them in identity', () => {
    const decomposed = 'Cafe\u0301'
    const plan = createInteractiveRebasePlan([
      entry(first, 'pick', `  ${decomposed}    subject  `),
      entry(second, 'pick', '   '),
    ])

    assert.equal(plan.entries[0].subject, 'Café subject')
    assert.equal(plan.entries[1].subject, '(no subject)')
    assert.equal(sanitizeInteractiveRebaseSubject('  one   line  '), 'one line')
  })

  it('copies and deeply freezes caller-owned input and every derived layer', () => {
    const callerEntry = {
      commitId: first,
      action: 'pick' as const,
      subject: 'Original',
    }
    const callerEntries: Array<IInteractiveRebasePlanEntryInput> = [callerEntry]
    const plan = createInteractiveRebasePlan(callerEntries)

    callerEntry.subject = 'Changed after construction'
    callerEntries.push(entry(second))
    assert.equal(plan.entries.length, 1)
    assert.equal(plan.entries[0].subject, 'Original')

    assert.ok(Object.isFrozen(plan))
    assert.ok(Object.isFrozen(plan.entries))
    assert.ok(Object.isFrozen(plan.entries[0]))
    assert.ok(Object.isFrozen(plan.reviewedCommitIds))
    assert.ok(Object.isFrozen(plan.summary))
    assert.ok(Object.isFrozen(plan.summary.actionCounts))
    assert.ok(Object.isFrozen(plan.summary.pauseRequiredCommitIds))

    assert.throws(() => {
      ;(plan.entries as Array<unknown>).push(entry(second))
    }, TypeError)
    assert.throws(() => {
      ;(plan.summary.actionCounts as { pick: number }).pick = 99
    }, TypeError)
  })

  it('rejects unknown, missing, accessor, sparse, and array-surplus data', () => {
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          { ...entry(first), extra: 'not part of the schema' },
        ]),
      'invalid-shape'
    )
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          { commitId: first, subject: 'Missing action' },
        ]),
      'invalid-shape'
    )

    let getterRead = false
    const accessor = {
      commitId: first,
      action: 'pick',
      get subject() {
        getterRead = true
        return 'Getter subject'
      },
    }
    assertPlanError(
      () => createInteractiveRebasePlan([accessor]),
      'invalid-shape'
    )
    assert.equal(getterRead, false)

    const sparse = new Array<unknown>(2)
    sparse[1] = entry(second)
    assertPlanError(() => createInteractiveRebasePlan(sparse), 'invalid-shape')

    let arrayGetterRead = false
    const arrayAccessor = new Array<unknown>(1)
    Object.defineProperty(arrayAccessor, 0, {
      enumerable: true,
      get() {
        arrayGetterRead = true
        return entry(first)
      },
    })
    assertPlanError(
      () => createInteractiveRebasePlan(arrayAccessor),
      'invalid-shape'
    )
    assert.equal(arrayGetterRead, false)

    const unusualArray = [entry(first)]
    Object.setPrototypeOf(unusualArray, null)
    assertPlanError(
      () => createInteractiveRebasePlan(unusualArray),
      'invalid-shape'
    )

    const surplus = [entry(first)]
    Object.defineProperty(surplus, 'reviewed', { value: true })
    assertPlanError(() => createInteractiveRebasePlan(surplus), 'invalid-shape')

    const symbolKey = Symbol('surplus')
    const symbolSurplus = { ...entry(first), [symbolKey]: true }
    assertPlanError(
      () => createInteractiveRebasePlan([symbolSurplus]),
      'invalid-shape'
    )
  })

  it('rejects malformed, uppercase, zero, duplicate, and mixed-width ids', () => {
    for (const commitId of [
      '1'.repeat(39),
      'g'.repeat(40),
      'A'.repeat(40),
      ` ${first}`,
      `${first} `,
    ]) {
      assertPlanError(
        () => createInteractiveRebasePlan([entry(commitId)]),
        'invalid-commit-id'
      )
    }

    assertPlanError(
      () => createInteractiveRebasePlan([entry('0'.repeat(40))]),
      'zero-commit-id'
    )
    assertPlanError(
      () => createInteractiveRebasePlan([entry(first), entry(first)]),
      'duplicate-commit-id'
    )
    assertPlanError(
      () => createInteractiveRebasePlan([entry(first), entry(objectId(2, 64))]),
      'mixed-object-id-width'
    )

    const sha256 = createInteractiveRebasePlan([
      entry(objectId(1, 64)),
      entry(objectId(2, 64)),
    ])
    assert.equal(sha256.objectIdWidth, 64)
    assert.match(
      serializeInteractiveRebaseTodo(sha256),
      new RegExp(objectId(1, 64))
    )
  })

  it('rejects controls, newlines, bidi overrides, wrong types, and oversized subjects', () => {
    for (const subject of [
      'title\nexec calc.exe',
      'title\rbody',
      'title\u0000body',
      'title\u0007body',
      'title\ud800body',
      'title\u202ebody',
      'title\u2066body',
    ]) {
      assertPlanError(
        () => createInteractiveRebasePlan([entry(first, 'pick', subject)]),
        'invalid-subject'
      )
    }
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          { commitId: first, action: 'pick', subject: 123 },
        ]),
      'invalid-subject'
    )

    const exact = 'x'.repeat(MaximumInteractiveRebaseSubjectBytes)
    assert.equal(
      createInteractiveRebasePlan([entry(first, 'pick', exact)]).entries[0]
        .subject,
      exact
    )
    assertPlanError(
      () => createInteractiveRebasePlan([entry(first, 'pick', `${exact}x`)]),
      'invalid-subject'
    )
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          entry(
            first,
            'pick',
            ' '.repeat(MaximumInteractiveRebaseSubjectBytes + 1)
          ),
        ]),
      'invalid-subject'
    )
  })

  it('accepts the exact commit bound and rejects one more', () => {
    const maximum = Array.from(
      { length: MaximumInteractiveRebaseCommits },
      (_, index) => entry(objectId(index + 1))
    )
    assert.equal(
      createInteractiveRebasePlan(maximum).entries.length,
      maximum.length
    )
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          ...maximum,
          entry(objectId(MaximumInteractiveRebaseCommits + 1)),
        ]),
      'too-many-commits'
    )
  })
})

describe('interactive rebase plan invariants', () => {
  it('rejects squash or fixup as the first effective commit', () => {
    for (const action of ['squash', 'fixup'] as const) {
      assertPlanError(
        () =>
          createInteractiveRebasePlan([
            entry(first, 'drop'),
            entry(second, action),
            entry(third, 'pick'),
          ]),
        'invalid-plan'
      )
    }
  })

  it('allows folds after an earlier non-dropped predecessor even across drops', () => {
    const plan = createInteractiveRebasePlan([
      entry(first, 'pick'),
      entry(second, 'drop'),
      entry(third, 'squash'),
      entry(fourth, 'fixup'),
    ])

    assert.equal(plan.summary.effectiveCount, 3)
    assert.equal(plan.summary.foldedCount, 2)
  })

  it('rejects a plan that drops every reviewed commit', () => {
    assertPlanError(
      () =>
        createInteractiveRebasePlan([
          entry(first, 'drop'),
          entry(second, 'drop'),
        ]),
      'invalid-plan'
    )
  })

  it('rejects every action outside the exact allowlist', () => {
    for (const action of ['exec', 'break', 'label', 'reset', 'merge', 'p']) {
      assertPlanError(
        () =>
          createInteractiveRebasePlan([
            entry(first, action as InteractiveRebaseAction),
          ]),
        'invalid-action'
      )
    }
  })
})

describe('interactive rebase plan operations', () => {
  it('updates by commit id without reordering or mutating the source plan', () => {
    const original = createInteractiveRebasePlan([
      entry(first),
      entry(second),
      entry(third),
    ])
    const updated = updateInteractiveRebaseAction(original, second, 'reword')

    assert.deepEqual(ids(original), [first, second, third])
    assert.deepEqual(
      original.entries.map(item => item.action),
      ['pick', 'pick', 'pick']
    )
    assert.deepEqual(ids(updated), [first, second, third])
    assert.deepEqual(updated.reviewedCommitIds, [first, second, third])
    assert.equal(updated.entries[1].action, 'reword')
    assert.equal(updated.entries[1].pauseRequired, true)
    assert.deepEqual(updated.summary.pauseRequiredCommitIds, [second])
  })

  it('fails closed for unknown ids, unknown actions, and invalid updates', () => {
    const plan = createInteractiveRebasePlan([entry(first), entry(second)])
    assertPlanError(
      () => updateInteractiveRebaseAction(plan, third, 'edit'),
      'unknown-commit'
    )
    assertPlanError(
      () =>
        updateInteractiveRebaseAction(
          plan,
          first,
          'exec' as InteractiveRebaseAction
        ),
      'invalid-action'
    )
    assertPlanError(
      () => updateInteractiveRebaseAction(plan, first, 'squash'),
      'invalid-plan'
    )
    assertPlanError(
      () =>
        updateInteractiveRebaseAction(
          createInteractiveRebasePlan([entry(first)]),
          first,
          'drop'
        ),
      'invalid-plan'
    )
  })

  it('reorders only through exact source and destination commit ids', () => {
    const original = createInteractiveRebasePlan([
      entry(first),
      entry(second),
      entry(third),
    ])
    const moved = reorderInteractiveRebaseCommit(original, third, first)

    assert.deepEqual(ids(original), [first, second, third])
    assert.deepEqual(ids(moved), [third, first, second])
    assert.deepEqual(moved.reviewedCommitIds, [first, second, third])
    assert.equal(moved.summary.reordered, true)

    const restored = reorderInteractiveRebaseCommit(moved, third, null)
    assert.deepEqual(ids(restored), [first, second, third])
    assert.deepEqual(restored.reviewedCommitIds, [first, second, third])
    assert.equal(restored.summary.reordered, false)
  })

  it('rejects ambiguous, unknown, mixed-width, and invariant-breaking moves', () => {
    const plan = createInteractiveRebasePlan([
      entry(first),
      entry(second),
      entry(third),
    ])
    assertPlanError(
      () => reorderInteractiveRebaseCommit(plan, first, first),
      'invalid-operation'
    )
    assertPlanError(
      () => reorderInteractiveRebaseCommit(plan, fourth, null),
      'unknown-commit'
    )
    assertPlanError(
      () => reorderInteractiveRebaseCommit(plan, first, fourth),
      'unknown-commit'
    )
    assertPlanError(
      () => reorderInteractiveRebaseCommit(plan, objectId(1, 64), null),
      'unknown-commit'
    )

    const foldPlan = createInteractiveRebasePlan([
      entry(first),
      entry(second, 'fixup'),
    ])
    assertPlanError(
      () => reorderInteractiveRebaseCommit(foldPlan, second, first),
      'invalid-plan'
    )
  })
})

describe('interactive rebase todo serialization and parsing', () => {
  it('serializes only fixed actions and full ids with one terminal LF', () => {
    const hostileSubject =
      'exec powershell -Command Write-Output SUBJECT_MUST_NOT_EXECUTE'
    const plan = createInteractiveRebasePlan([
      entry(objectId(1), 'pick', hostileSubject),
      entry(objectId(2), 'reword', 'reword subject'),
      entry(objectId(3), 'edit', 'edit subject'),
      entry(objectId(4), 'squash', 'squash subject'),
      entry(objectId(5), 'fixup', 'fixup subject'),
      entry(objectId(6), 'drop', 'drop subject'),
    ])
    const expected = [
      `pick ${objectId(1)}`,
      `reword ${objectId(2)}`,
      `edit ${objectId(3)}`,
      `squash ${objectId(4)}`,
      `fixup ${objectId(5)}`,
      `drop ${objectId(6)}`,
      '',
    ].join('\n')

    assert.equal(serializeInteractiveRebaseTodo(plan), expected)
    assert.equal(serializeInteractiveRebaseTodo(plan), expected)
    assert.doesNotMatch(expected, /powershell|token=|subject|ghp_/)
    assert.equal(expected.endsWith('\n'), true)
    assert.equal(expected.endsWith('\n\n'), false)
  })

  it('round-trips a deterministic reordered todo against reviewed commits', () => {
    const reviewed = [
      allowed(first, 'First display subject'),
      allowed(second, 'Second display subject'),
      allowed(third, 'Third display subject'),
    ]
    const todo = `edit ${third}\npick ${first}\nsquash ${second}\n`
    const plan = parseInteractiveRebaseTodo(todo, reviewed)

    assert.deepEqual(plan.reviewedCommitIds, [first, second, third])
    assert.deepEqual(ids(plan), [third, first, second])
    assert.deepEqual(
      plan.entries.map(item => item.subject),
      [
        'Third display subject',
        'First display subject',
        'Second display subject',
      ]
    )
    assert.deepEqual(plan.summary.pauseRequiredCommitIds, [third])
    assert.equal(plan.summary.reordered, true)
    assert.equal(serializeInteractiveRebaseTodo(plan), todo)
  })

  it('rejects missing, extra, duplicate, and replaced commit ids', () => {
    const reviewed = [allowed(first), allowed(second), allowed(third)]
    const cases = [
      `pick ${first}\npick ${second}\n`,
      `pick ${first}\npick ${second}\npick ${third}\npick ${fourth}\n`,
      `pick ${first}\npick ${first}\npick ${third}\n`,
      `pick ${first}\npick ${second}\npick ${fourth}\n`,
    ]

    for (const todo of cases) {
      assertPlanError(
        () => parseInteractiveRebaseTodo(todo, reviewed),
        'invalid-todo'
      )
    }
  })

  it('rejects noncanonical actions, ids, spacing, tokens, controls, and endings', () => {
    const reviewed = [allowed(first), allowed(second)]
    const cases = [
      `exec ${first}\npick ${second}\n`,
      `p ${first}\npick ${second}\n`,
      `pick ${first.slice(0, 7)}\npick ${second}\n`,
      `pick ${'a'.repeat(40).toUpperCase()}\npick ${second}\n`,
      ` pick ${first}\npick ${second}\n`,
      `pick  ${first}\npick ${second}\n`,
      `pick ${first} subject\npick ${second}\n`,
      `pick ${first}\t\npick ${second}\n`,
      `pick ${first}\r\npick ${second}\r\n`,
      `pick ${first}\npick ${second}`,
      `pick ${first}\npick ${second}\n\n`,
      `pick ${first}\n\npick ${second}\n`,
    ]

    for (const todo of cases) {
      assertPlanError(
        () => parseInteractiveRebaseTodo(todo, reviewed),
        'invalid-todo'
      )
    }
  })

  it('rejects mixed-width and zero ids in both reviewed sets and todos', () => {
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(`pick ${first}\npick ${objectId(2, 64)}\n`, [
          allowed(first),
          allowed(objectId(2, 64)),
        ]),
      'mixed-object-id-width'
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(`pick ${'0'.repeat(40)}\n`, [
          allowed('0'.repeat(40)),
        ]),
      'zero-commit-id'
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(`pick ${first}\npick ${objectId(2, 64)}\n`, [
          allowed(first),
          allowed(second),
        ]),
      'invalid-todo'
    )
  })

  it('rejects malformed reviewed-set metadata and injected subjects', () => {
    const exactTodo = `pick ${first}\n`
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(exactTodo, [
          { ...allowed(first), action: 'pick' },
        ]),
      'invalid-shape'
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(exactTodo, [
          { commitId: first, subject: 'title\nexec calc.exe' },
        ]),
      'invalid-subject'
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(`pick ${first}\npick ${first}\n`, [
          allowed(first),
          allowed(first),
        ]),
      'duplicate-commit-id'
    )
  })

  it('reapplies fold and retained-commit invariants while parsing', () => {
    const reviewed = [allowed(first), allowed(second)]
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(
          `drop ${first}\nsquash ${second}\n`,
          reviewed
        ),
      'invalid-plan'
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(`drop ${first}\ndrop ${second}\n`, reviewed),
      'invalid-plan'
    )
  })

  it('accepts the maximum canonical todo and rejects an oversized input', () => {
    const reviewed = Array.from(
      { length: MaximumInteractiveRebaseCommits },
      (_, index) => allowed(objectId(index + 1, 64))
    )
    const todo = reviewed
      .map(commit => `reword ${commit.commitId}`)
      .join('\n')
      .concat('\n')
    const plan = parseInteractiveRebaseTodo(todo, reviewed)

    assert.equal(plan.entries.length, MaximumInteractiveRebaseCommits)
    assert.equal(
      Buffer.byteLength(todo, 'utf8'),
      MaximumInteractiveRebaseTodoBytes
    )
    assertPlanError(
      () =>
        parseInteractiveRebaseTodo(
          `${'x'.repeat(MaximumInteractiveRebaseTodoBytes + 1)}\n`,
          reviewed
        ),
      'invalid-todo'
    )
  })
})

describe('interactive rebase capability boundary', () => {
  it('contains no import or require path to Git, shell, process, fs, or network code', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'lib',
        'interactive-rebase',
        'interactive-rebase-plan.ts'
      ),
      'utf8'
    )

    assert.doesNotMatch(source, /^\s*import\b/gm)
    assert.doesNotMatch(source, /\brequire\s*\(/)
    assert.doesNotMatch(source, /\b(?:process|Deno|Bun)\s*\./)
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/)
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/)
  })
})
