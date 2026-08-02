import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  ChangeSummaryModelError,
  createChangeSummaryResult,
  createChangeSummaryReview,
  IChangeSummaryAuthorizationIdentity,
  IChangeSummaryReview,
  MaximumChangeSummaryAuthorBytes,
  MaximumChangeSummaryChangeTextBytes,
  MaximumChangeSummaryCommits,
  MaximumChangeSummaryFileFacts,
  MaximumChangeSummaryFilesPerCommit,
  MaximumChangeSummaryLineCount,
  MaximumChangeSummaryPathDepth,
  MaximumChangeSummaryPathSegmentBytes,
  MaximumChangeSummarySubjectBytes,
  MaximumChangeSummaryTextBytes,
  MaximumChangeSummaryUnavailableExplanationBytes,
} from '../../src/lib/change-summary/change-summary-model'

function hex(index: number, width = 64): string {
  return index.toString(16).padStart(width, '0')
}

function authorization(index = 1): IChangeSummaryAuthorizationIdentity {
  return {
    version: 1,
    authorizationId: `r14-authorization-v1:${hex(index)}`,
    evidenceId: `r14-evidence-v1:${hex(index + 100)}`,
  }
}

function value<T>(entry: T): {
  readonly availability: 'value'
  readonly value: T
} {
  return { availability: 'value', value: entry }
}

function unavailable(): { readonly availability: 'unavailable' } {
  return { availability: 'unavailable' }
}

function notApplicable(): { readonly availability: 'not-applicable' } {
  return { availability: 'not-applicable' }
}

function file(
  path: string,
  addedLines: unknown = value(1),
  deletedLines: unknown = value(0)
): Record<string, unknown> {
  return { path, addedLines, deletedLines }
}

function commit(
  index: number,
  files: ReadonlyArray<unknown> = [file(`src/file-${index}.ts`)],
  width: 40 | 64 = 40
): Record<string, unknown> {
  return {
    commitId: hex(index, width),
    author: value(`Author ${index}`),
    authoredAt: value('2026-08-02T12:34:56.000Z'),
    subject: value(`Subject ${index}`),
    files: [...files],
  }
}

function reviewInput(
  commits: ReadonlyArray<unknown> = [commit(1)],
  binding: IChangeSummaryAuthorizationIdentity = authorization()
): Record<string, unknown> {
  return { authorization: { ...binding }, commits: [...commits] }
}

function resultCandidate(
  review: IChangeSummaryReview,
  changes: ReadonlyArray<unknown> = review.reviewedPaths.map(path => ({
    path,
    availability: 'value',
    description: `Reviewed ${path}`,
  })),
  summary = 'The reviewed commits update the selected files.'
): Record<string, unknown> {
  return {
    authorization: { ...review.authorization },
    summary,
    changes: [...changes],
  }
}

function assertModelError(
  operation: () => unknown,
  code?: ChangeSummaryModelError['code']
): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof ChangeSummaryModelError)
    if (code !== undefined) {
      assert.equal(error.code, code)
    }
    assert.doesNotMatch(error.message, /sentinel-secret/)
    return true
  })
}

function assertDeeplyFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null ||
    seen.has(value)
  ) {
    return
  }
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) {
    assertDeeplyFrozen((value as Record<PropertyKey, unknown>)[key], seen)
  }
}

describe('change summary reviewed evidence', () => {
  it('preserves reviewed order, deduplicates exact paths, and derives truthful facts', () => {
    const input = reviewInput([
      {
        ...commit(1, [
          file('src/alpha.ts', value(0), unavailable()),
          file('src/beta.ts', notApplicable(), value(5)),
        ]),
        author: unavailable(),
        subject: value(''),
      },
      {
        ...commit(2, [
          file('src/alpha.ts', value(7), notApplicable()),
          file('src/gamma.ts', unavailable(), value(2)),
        ]),
        authoredAt: unavailable(),
        subject: unavailable(),
      },
    ])

    const review = createChangeSummaryReview(input)

    assert.deepEqual(review.reviewedCommitIds, [hex(1, 40), hex(2, 40)])
    assert.deepEqual(review.reviewedPaths, [
      'src/alpha.ts',
      'src/beta.ts',
      'src/gamma.ts',
    ])
    assert.equal(review.objectIdWidth, 40)
    assert.deepEqual(review.facts, {
      commitCount: 2,
      fileChangeCount: 4,
      changedPathCount: 3,
      authorUnavailableCount: 1,
      authoredAtUnavailableCount: 1,
      subjectUnavailableCount: 1,
      knownAddedLines: 7,
      knownDeletedLines: 7,
      addedLinesValueCount: 2,
      addedLinesUnavailableCount: 1,
      addedLinesNotApplicableCount: 1,
      deletedLinesValueCount: 2,
      deletedLinesUnavailableCount: 1,
      deletedLinesNotApplicableCount: 1,
    })
    assert.deepEqual(review.commits[0].files[0].addedLines, {
      availability: 'value',
      value: 0,
    })
    assert.deepEqual(review.commits[0].files[0].deletedLines, unavailable())
    assert.deepEqual(review.commits[0].files[1].addedLines, notApplicable())
    assert.deepEqual(Reflect.ownKeys(review.authorization).sort(), [
      'authorizationId',
      'evidenceId',
      'version',
    ])
    assert.deepEqual(Reflect.ownKeys(review).sort(), [
      'authorization',
      'commits',
      'facts',
      'objectIdWidth',
      'reviewedCommitIds',
      'reviewedPaths',
      'version',
    ])
    assertDeeplyFrozen(review)
  })

  it('accepts one through fifty homogeneous full commit identities', () => {
    const one = createChangeSummaryReview(reviewInput([commit(1, [], 64)]))
    assert.equal(one.objectIdWidth, 64)
    assert.equal(one.facts.commitCount, 1)

    const fifty = createChangeSummaryReview(
      reviewInput(
        Array.from({ length: MaximumChangeSummaryCommits }, (_, index) =>
          commit(index + 1, [], 40)
        )
      )
    )
    assert.equal(fifty.facts.commitCount, 50)
    assert.equal(fifty.facts.fileChangeCount, 0)

    assertModelError(
      () => createChangeSummaryReview(reviewInput([])),
      'invalid-shape'
    )
    assertModelError(
      () =>
        createChangeSummaryReview(
          reviewInput(
            Array.from(
              { length: MaximumChangeSummaryCommits + 1 },
              (_, index) => commit(index + 1, [])
            )
          )
        ),
      'too-many-commits'
    )

    let descriptorCalls = 0
    const oversizedCommits = new Proxy(
      Array.from({ length: MaximumChangeSummaryCommits + 1 }, (_, index) =>
        commit(index + 1, [])
      ),
      {
        getOwnPropertyDescriptor(target, key) {
          descriptorCalls++
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
      }
    )
    assertModelError(
      () =>
        createChangeSummaryReview({
          authorization: { ...authorization() },
          commits: oversizedCommits,
        }),
      'too-many-commits'
    )
    assert.equal(descriptorCalls, 1)
  })

  it('rejects malformed, duplicate, zero, uppercase, and mixed-width commit identities', () => {
    for (const invalid of [
      '1'.repeat(39),
      '1'.repeat(41),
      '1'.repeat(63),
      '1'.repeat(65),
      'A'.repeat(40),
      ` ${'1'.repeat(40)}`,
      'g'.repeat(40),
      '0'.repeat(40),
    ]) {
      const input = reviewInput([{ ...commit(1, []), commitId: invalid }])
      assertModelError(
        () => createChangeSummaryReview(input),
        'invalid-commit-id'
      )
    }

    assertModelError(
      () =>
        createChangeSummaryReview(reviewInput([commit(1, []), commit(1, [])])),
      'duplicate-commit-id'
    )
    assertModelError(
      () =>
        createChangeSummaryReview(
          reviewInput([commit(1, [], 40), commit(2, [], 64)])
        ),
      'mixed-commit-id-width'
    )
  })

  it('canonicalizes safe display facts while retaining explicit unavailability', () => {
    const review = createChangeSummaryReview(
      reviewInput([
        {
          ...commit(1, []),
          author: value('  Cafe\u0301\u00a0  Maintainer 😀  '),
          authoredAt: unavailable(),
          subject: value('  Fix   the thing  '),
        },
      ])
    )

    assert.deepEqual(review.commits[0].author, value('Café Maintainer 😀'))
    assert.deepEqual(review.commits[0].authoredAt, unavailable())
    assert.deepEqual(review.commits[0].subject, value('Fix the thing'))

    for (const authoredAt of [
      '2026-08-02',
      '2026-08-02T12:34:56Z',
      '2026-08-02T08:34:56.000-04:00',
      '2026-02-30T12:34:56.000Z',
    ]) {
      const input = reviewInput([
        { ...commit(1, []), authoredAt: value(authoredAt) },
      ])
      assertModelError(() => createChangeSummaryReview(input), 'invalid-date')
    }

    const emptyAuthor = reviewInput([
      { ...commit(1, []), author: value('   ') },
    ])
    assertModelError(
      () => createChangeSummaryReview(emptyAuthor),
      'invalid-metadata'
    )
    const dateObject = reviewInput([
      { ...commit(1, []), authoredAt: value(new Date()) },
    ])
    assertModelError(
      () => createChangeSummaryReview(dateObject),
      'invalid-metadata'
    )

    for (const hostile of [
      'control\u0007',
      'bidi\u2066 text',
      String.fromCharCode(0xd800),
    ]) {
      for (const key of ['author', 'subject'] as const) {
        const input = reviewInput([{ ...commit(1, []), [key]: value(hostile) }])
        assertModelError(
          () => createChangeSummaryReview(input),
          'invalid-metadata'
        )
      }
    }
  })

  it('enforces UTF-8 metadata bounds before and after canonicalization', () => {
    const exactAuthor = 'é'.repeat(MaximumChangeSummaryAuthorBytes / 2)
    const exactSubject = 'é'.repeat(MaximumChangeSummarySubjectBytes / 2)
    const accepted = createChangeSummaryReview(
      reviewInput([
        {
          ...commit(1, []),
          author: value(exactAuthor),
          subject: value(exactSubject),
        },
      ])
    )
    assert.equal(accepted.commits[0].author.availability, 'value')

    for (const [key, oversized] of [
      ['author', `${exactAuthor}é`],
      ['subject', `${exactSubject}é`],
      ['author', `A${' '.repeat(MaximumChangeSummaryAuthorBytes)}`],
    ] as const) {
      const input = reviewInput([{ ...commit(1, []), [key]: value(oversized) }])
      assertModelError(
        () => createChangeSummaryReview(input),
        'invalid-metadata'
      )
    }
  })

  it('keeps zero, unavailable, and not-applicable line states distinct', () => {
    const review = createChangeSummaryReview(
      reviewInput([
        commit(1, [
          file('zero.ts', value(0), value(MaximumChangeSummaryLineCount)),
          file('unknown.ts', unavailable(), unavailable()),
          file('binary.dat', notApplicable(), notApplicable()),
        ]),
      ])
    )
    assert.equal(review.facts.knownAddedLines, 0)
    assert.equal(review.facts.knownDeletedLines, MaximumChangeSummaryLineCount)
    assert.equal(review.facts.addedLinesValueCount, 1)
    assert.equal(review.facts.addedLinesUnavailableCount, 1)
    assert.equal(review.facts.addedLinesNotApplicableCount, 1)

    const invalidFacts: ReadonlyArray<unknown> = [
      value(-0),
      value(-1),
      value(0.5),
      value(Number.NaN),
      value(Number.POSITIVE_INFINITY),
      value(Number.MAX_SAFE_INTEGER + 1),
      value(MaximumChangeSummaryLineCount + 1),
      { availability: 'unavailable', value: 0 },
      { availability: 'not-applicable', value: 0 },
      { availability: 'value' },
      { availability: 'unavailable', unavailable: false },
    ]
    for (const fact of invalidFacts) {
      const input = reviewInput([commit(1, [file('src/a.ts', fact)])])
      assertModelError(
        () => createChangeSummaryReview(input),
        'invalid-line-fact'
      )
    }
  })

  it('rejects unsafe or noncanonical Windows repository-relative paths', () => {
    const invalidPaths = [
      '/absolute.ts',
      '\\\\server\\share.ts',
      'C:/drive.ts',
      'C:drive.ts',
      'src\\backslash.ts',
      'src//double.ts',
      './relative.ts',
      'src/../escape.ts',
      '.git/config',
      'src/.GIT/config',
      'src/bad<name.ts',
      'src/bad>name.ts',
      'src/bad:name.ts',
      'src/bad"name.ts',
      'src/bad|name.ts',
      'src/bad?name.ts',
      'src/bad*name.ts',
      'src/trailing.',
      'src/trailing ',
      'CON',
      'src/prn.txt',
      'src/AUX.js',
      'src/NUL.bin',
      'src/CLOCK$.txt',
      'src/CONIN$.txt',
      'src/CONOUT$.txt',
      'src/COM1.txt',
      'src/LPT².log',
      'src/control\u0007.ts',
      'src/bidi\u202e.ts',
      `src/${String.fromCharCode(0xd800)}.ts`,
      'src/Cafe\u0301.ts',
      `src/${'a'.repeat(MaximumChangeSummaryPathSegmentBytes + 1)}`,
      `src/${'é'.repeat(
        Math.floor(MaximumChangeSummaryPathSegmentBytes / 2) + 1
      )}`,
      Array.from({ length: MaximumChangeSummaryPathDepth + 1 }, () => 'a').join(
        '/'
      ),
      Array.from({ length: 110 }, () => 'a'.repeat(40)).join('/'),
    ]

    for (const path of invalidPaths) {
      const input = reviewInput([commit(1, [file(path)])])
      assertModelError(() => createChangeSummaryReview(input), 'invalid-path')
    }
  })

  it('rejects duplicate and Windows-equivalent path spellings without losing repeated exact paths', () => {
    assertModelError(
      () =>
        createChangeSummaryReview(
          reviewInput([commit(1, [file('src/File.ts'), file('src/file.ts')])])
        ),
      'duplicate-path'
    )
    assertModelError(
      () =>
        createChangeSummaryReview(
          reviewInput([
            commit(1, [file('src/File.ts')]),
            commit(2, [file('src/file.ts')]),
          ])
        ),
      'duplicate-path'
    )
    assertModelError(
      () =>
        createChangeSummaryReview(
          reviewInput([commit(1, [file('src/Σ.ts'), file('src/σ.ts')])])
        ),
      'duplicate-path'
    )

    const distinctUnicodePaths = createChangeSummaryReview(
      reviewInput([
        commit(1, [
          file('src/Σ.ts'),
          file('src/ς.ts'),
          file('src/ß.ts'),
          file('src/ẞ.ts'),
        ]),
      ])
    )
    assert.deepEqual(distinctUnicodePaths.reviewedPaths, [
      'src/Σ.ts',
      'src/ς.ts',
      'src/ß.ts',
      'src/ẞ.ts',
    ])

    const accepted = createChangeSummaryReview(
      reviewInput([
        commit(1, [file('src/file.ts')]),
        commit(2, [file('src/file.ts')]),
      ])
    )
    assert.equal(accepted.facts.fileChangeCount, 2)
    assert.deepEqual(accepted.reviewedPaths, ['src/file.ts'])
  })

  it('bounds both per-commit and aggregate file evidence while allowing empty commits', () => {
    const empty = createChangeSummaryReview(reviewInput([commit(1, [])]))
    const result = createChangeSummaryResult(empty, resultCandidate(empty, []))
    assert.deepEqual(result.changes, [])
    assert.equal(result.facts.changeCount, 0)

    const overPerCommit = Array.from(
      { length: MaximumChangeSummaryFilesPerCommit + 1 },
      (_, index) => file(`src/over-${index}.ts`)
    )
    assertModelError(
      () => createChangeSummaryReview(reviewInput([commit(1, overPerCommit)])),
      'too-many-files'
    )

    const fileIndex = { value: 0 }
    const aggregate = Array.from({ length: 11 }, (_, commitIndex) =>
      commit(
        commitIndex + 1,
        Array.from({ length: MaximumChangeSummaryFilesPerCommit }, () => {
          fileIndex.value++
          return file(`src/aggregate-${fileIndex.value}.ts`)
        })
      )
    )
    assert.ok(
      aggregate.length * MaximumChangeSummaryFilesPerCommit >
        MaximumChangeSummaryFileFacts
    )
    assertModelError(
      () => createChangeSummaryReview(reviewInput(aggregate)),
      'too-many-files'
    )
  })

  it('copies every caller layer and deeply freezes outputs', () => {
    const input = reviewInput([commit(1, [file('src/original.ts')])])
    const review = createChangeSummaryReview(input)
    const rawCommit = (input.commits as Array<Record<string, unknown>>)[0]
    const rawFile = (rawCommit.files as Array<Record<string, unknown>>)[0]
    rawFile.path = 'src/mutated.ts'
    ;(rawCommit.files as Array<unknown>).push(file('src/extra.ts'))
    ;(input.commits as Array<unknown>).push(commit(2))
    ;(
      input.authorization as Record<string, unknown>
    ).evidenceId = `r14-evidence-v1:${hex(999)}`

    assert.deepEqual(review.reviewedPaths, ['src/original.ts'])
    assert.deepEqual(review.reviewedCommitIds, [hex(1, 40)])
    assert.equal(review.authorization.evidenceId, authorization().evidenceId)

    const candidate = resultCandidate(review)
    const result = createChangeSummaryResult(review, candidate)
    ;(candidate.changes as Array<Record<string, unknown>>)[0].description =
      'mutated later'
    ;(candidate.authorization as Record<string, unknown>).authorizationId =
      authorization(2).authorizationId
    candidate.summary = 'mutated later'
    assert.equal(
      result.summary,
      'The reviewed commits update the selected files.'
    )
    assert.equal(result.changes[0].availability, 'value')
    if (result.changes[0].availability === 'value') {
      assert.equal(result.changes[0].description, 'Reviewed src/original.ts')
    }
    assertDeeplyFrozen(result)
  })

  it('snapshots transparent proxies so revocation cannot affect accepted output', () => {
    const raw = reviewInput()
    const proxied = Proxy.revocable(raw, {})
    const review = createChangeSummaryReview(proxied.proxy)
    proxied.revoke()
    assert.deepEqual(review.reviewedPaths, ['src/file-1.ts'])

    const rawCandidate = resultCandidate(review)
    const proxiedCandidate = Proxy.revocable(rawCandidate, {})
    const result = createChangeSummaryResult(review, proxiedCandidate.proxy)
    proxiedCandidate.revoke()
    assert.equal(result.facts.describedChangeCount, 1)

    const revoked = Proxy.revocable(reviewInput(), {})
    revoked.revoke()
    assertModelError(
      () => createChangeSummaryReview(revoked.proxy),
      'invalid-shape'
    )
  })
})

describe('descriptor-first shape validation', () => {
  it('rejects accessors at every nested layer without invoking them', () => {
    const cases: ReadonlyArray<() => unknown> = [
      () => {
        const input = reviewInput()
        Object.defineProperty(input, 'authorization', {
          enumerable: true,
          get: () => authorization(),
        })
        return input
      },
      () => {
        const input = reviewInput()
        Object.defineProperty(input.authorization as object, 'evidenceId', {
          enumerable: true,
          get: () => authorization().evidenceId,
        })
        return input
      },
      () => {
        const input = reviewInput()
        const rawCommit = (input.commits as Array<Record<string, unknown>>)[0]
        Object.defineProperty(rawCommit, 'author', {
          enumerable: true,
          get: () => value('Author'),
        })
        return input
      },
      () => {
        const input = reviewInput()
        const rawCommit = (input.commits as Array<Record<string, unknown>>)[0]
        Object.defineProperty(rawCommit.author as object, 'value', {
          enumerable: true,
          get: () => 'Author',
        })
        return input
      },
      () => {
        const input = reviewInput()
        const rawFile = (
          (input.commits as Array<Record<string, unknown>>)[0].files as Array<
            Record<string, unknown>
          >
        )[0]
        Object.defineProperty(rawFile, 'path', {
          enumerable: true,
          get: () => 'src/file.ts',
        })
        return input
      },
      () => {
        const input = reviewInput()
        const rawFile = (
          (input.commits as Array<Record<string, unknown>>)[0].files as Array<
            Record<string, unknown>
          >
        )[0]
        Object.defineProperty(rawFile.addedLines as object, 'value', {
          enumerable: true,
          get: () => 1,
        })
        return input
      },
    ]

    for (const makeInput of cases) {
      let calls = 0
      const input = makeInput()
      const locateGetter = (current: unknown): void => {
        if (typeof current !== 'object' || current === null) {
          return
        }
        for (const key of Reflect.ownKeys(current)) {
          const descriptor = Object.getOwnPropertyDescriptor(current, key)
          if (descriptor?.get !== undefined) {
            const original = descriptor.get
            Object.defineProperty(current, key, {
              ...descriptor,
              get: () => {
                calls++
                return original.call(current)
              },
            })
            return
          }
          if (descriptor !== undefined && 'value' in descriptor) {
            locateGetter(descriptor.value)
          }
        }
      }
      locateGetter(input)
      assertModelError(() => createChangeSummaryReview(input))
      assert.equal(calls, 0)
    }

    const review = createChangeSummaryReview(reviewInput())
    for (const location of ['summary', 'description'] as const) {
      let calls = 0
      const candidate = resultCandidate(review)
      const target =
        location === 'summary'
          ? candidate
          : (candidate.changes as Array<Record<string, unknown>>)[0]
      Object.defineProperty(target, location, {
        enumerable: true,
        get: () => {
          calls++
          return 'sentinel-secret'
        },
      })
      assertModelError(() => createChangeSummaryResult(review, candidate))
      assert.equal(calls, 0)
    }
  })

  it('rejects hidden, symbol, surplus, and custom-prototype records', () => {
    const surplus = reviewInput()
    surplus.prompt = 'sentinel-secret'
    assertModelError(() => createChangeSummaryReview(surplus), 'invalid-shape')

    const hidden = reviewInput()
    Object.defineProperty(hidden, 'hidden', {
      value: 'sentinel-secret',
      enumerable: false,
    })
    assertModelError(() => createChangeSummaryReview(hidden), 'invalid-shape')

    const symbol = reviewInput()
    ;(symbol as Record<PropertyKey, unknown>)[Symbol('secret')] =
      'sentinel-secret'
    assertModelError(() => createChangeSummaryReview(symbol), 'invalid-shape')

    const custom = Object.assign(
      Object.create({ inherited: true }),
      reviewInput()
    )
    assertModelError(() => createChangeSummaryReview(custom), 'invalid-shape')

    const nullPrototype = Object.assign(Object.create(null), reviewInput())
    assert.equal(createChangeSummaryReview(nullPrototype).facts.commitCount, 1)
  })

  it('rejects sparse, accessor, symbol, surplus, and unusual arrays', () => {
    const arrays = new Array<ReadonlyArray<unknown>>()
    arrays.push(new Array(1))

    const accessor = [commit(1)]
    let accessorCalls = 0
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get: () => {
        accessorCalls++
        return commit(1)
      },
    })
    arrays.push(accessor)

    const symbol = [commit(1)]
    ;(symbol as unknown as Record<PropertyKey, unknown>)[Symbol('secret')] =
      true
    arrays.push(symbol)

    const surplus = [commit(1)]
    ;(surplus as unknown as Record<string, unknown>).extra = true
    arrays.push(surplus)

    class UnusualArray extends Array<unknown> {}
    const unusual = new UnusualArray()
    unusual.push(commit(1))
    arrays.push(unusual)

    const nullPrototype = [commit(1)]
    Object.setPrototypeOf(nullPrototype, null)
    arrays.push(nullPrototype)

    for (const commits of arrays) {
      assertModelError(
        () =>
          createChangeSummaryReview({
            authorization: { ...authorization() },
            commits,
          }),
        'invalid-shape'
      )
    }
    assert.equal(accessorCalls, 0)
  })

  it('applies the same dense-array rules to untrusted result changes', () => {
    const review = createChangeSummaryReview(reviewInput())
    const change = {
      path: review.reviewedPaths[0],
      availability: 'value',
      description: 'Updates the reviewed file.',
    }
    const arrays = new Array<ReadonlyArray<unknown>>()
    arrays.push(new Array(1))

    const accessor = [change]
    let accessorCalls = 0
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get: () => {
        accessorCalls++
        return change
      },
    })
    arrays.push(accessor)

    const symbol = [change]
    ;(symbol as unknown as Record<PropertyKey, unknown>)[Symbol('secret')] =
      true
    arrays.push(symbol)
    const surplus = [change]
    ;(surplus as unknown as Record<string, unknown>).extra = true
    arrays.push(surplus)
    class UnusualResultArray extends Array<unknown> {}
    const unusual = new UnusualResultArray()
    unusual.push(change)
    arrays.push(unusual)
    const nullPrototype = [change]
    Object.setPrototypeOf(nullPrototype, null)
    arrays.push(nullPrototype)

    for (const changes of arrays) {
      assertModelError(
        () =>
          createChangeSummaryResult(review, {
            authorization: { ...review.authorization },
            summary: 'A valid summary.',
            changes,
          }),
        'invalid-shape'
      )
    }
    assert.equal(accessorCalls, 0)
  })

  it('rejects secret-bearing surplus fields at nested review and result layers', () => {
    const secretFieldNames = [
      'prompt',
      'systemPrompt',
      'apiKey',
      'token',
      'password',
      'credential',
      'secret',
      'model',
      'provider',
      'transport',
      'diff',
      'code',
    ]
    for (const fieldName of secretFieldNames) {
      const input = reviewInput()
      const rawFile = (
        (input.commits as Array<Record<string, unknown>>)[0].files as Array<
          Record<string, unknown>
        >
      )[0]
      rawFile[fieldName] = 'sentinel-secret'
      assertModelError(() => createChangeSummaryReview(input), 'invalid-shape')

      const review = createChangeSummaryReview(reviewInput())
      const candidate = resultCandidate(review)
      ;(candidate.changes as Array<Record<string, unknown>>)[0][fieldName] =
        'sentinel-secret'
      assertModelError(
        () => createChangeSummaryResult(review, candidate),
        'invalid-shape'
      )
    }
  })
})

describe('change summary result conservation and binding', () => {
  it('conserves every unique reviewed path and normalizes result permutations', () => {
    const review = createChangeSummaryReview(
      reviewInput([
        commit(1, [file('src/first.ts'), file('src/shared.ts')]),
        commit(2, [file('src/shared.ts'), file('src/last.ts')]),
      ])
    )
    const ordered = [
      {
        path: 'src/first.ts',
        availability: 'value',
        description: 'Updates the first file.',
      },
      {
        path: 'src/shared.ts',
        availability: 'unavailable',
        explanation: 'A reliable explanation was not returned.',
      },
      {
        path: 'src/last.ts',
        availability: 'value',
        description: 'Updates the last file.',
      },
    ]

    const forward = createChangeSummaryResult(
      review,
      resultCandidate(review, ordered, '  Cafe\u0301\u00a0 summary 😀  ')
    )
    const reverse = createChangeSummaryResult(
      review,
      resultCandidate(review, [...ordered].reverse(), 'Café summary 😀')
    )

    assert.deepEqual(forward, reverse)
    assert.equal(forward.summary, 'Café summary 😀')
    assert.deepEqual(
      forward.changes.map(change => change.path),
      review.reviewedPaths
    )
    assert.deepEqual(forward.facts, {
      changeCount: 3,
      describedChangeCount: 2,
      unavailableChangeCount: 1,
    })
    assert.deepEqual(Reflect.ownKeys(forward).sort(), [
      'authorization',
      'changes',
      'facts',
      'reviewedCommitIds',
      'reviewedPaths',
      'summary',
      'version',
    ])
    assert.deepEqual(Reflect.ownKeys(forward.changes[1]).sort(), [
      'availability',
      'explanation',
      'path',
    ])
    assert.deepEqual(forward.authorization, review.authorization)
    assert.deepEqual(forward.reviewedCommitIds, review.reviewedCommitIds)
    assert.deepEqual(forward.reviewedPaths, review.reviewedPaths)
    assert.notEqual(forward.authorization, review.authorization)
    assert.notEqual(forward.reviewedCommitIds, review.reviewedCommitIds)
    assert.notEqual(forward.reviewedPaths, review.reviewedPaths)
    assertDeeplyFrozen(forward)
  })

  it('rejects omitted, invented, duplicated, or case-replaced result paths', () => {
    const review = createChangeSummaryReview(
      reviewInput([commit(1, [file('src/one.ts'), file('src/two.ts')])])
    )
    const one = {
      path: 'src/one.ts',
      availability: 'value',
      description: 'Updates one file.',
    }
    const two = {
      path: 'src/two.ts',
      availability: 'value',
      description: 'Updates another file.',
    }

    assertModelError(
      () => createChangeSummaryResult(review, resultCandidate(review, [one])),
      'incomplete-result'
    )
    assertModelError(
      () =>
        createChangeSummaryResult(
          review,
          resultCandidate(review, [
            one,
            {
              ...two,
              path: 'src/invented.ts',
            },
          ])
        ),
      'unknown-result-path'
    )
    assertModelError(
      () =>
        createChangeSummaryResult(
          review,
          resultCandidate(review, [one, { ...one }])
        ),
      'duplicate-result-path'
    )
    assertModelError(
      () =>
        createChangeSummaryResult(
          review,
          resultCandidate(review, [one, { ...two, path: 'src/Two.ts' }])
        ),
      'unknown-result-path'
    )
  })

  it('requires an exact nonempty unavailable explanation per path', () => {
    const review = createChangeSummaryReview(reviewInput())
    const unavailableChange = (
      explanation: unknown
    ): Record<string, unknown> => ({
      path: review.reviewedPaths[0],
      availability: 'unavailable',
      explanation,
    })

    const accepted = createChangeSummaryResult(
      review,
      resultCandidate(review, [
        unavailableChange('The source did not provide enough information.'),
      ])
    )
    assert.equal(accepted.facts.unavailableChangeCount, 1)

    for (const explanation of ['', '   ', false, null]) {
      assertModelError(
        () =>
          createChangeSummaryResult(
            review,
            resultCandidate(review, [unavailableChange(explanation)])
          ),
        'invalid-result-text'
      )
    }
  })

  it('requires exact matching fixed-format R14 authorization and evidence identities', () => {
    const review = createChangeSummaryReview(reviewInput())
    const different = authorization(2)
    const mismatches = [
      { ...review.authorization, authorizationId: different.authorizationId },
      { ...review.authorization, evidenceId: different.evidenceId },
      {
        ...review.authorization,
        authorizationId: review.authorization.authorizationId.toUpperCase(),
      },
      {
        ...review.authorization,
        authorizationId: `r14-authorization-v1:${'0'.repeat(64)}`,
      },
      {
        ...review.authorization,
        evidenceId: `r14-evidence-v1:${'0'.repeat(64)}`,
      },
      { ...review.authorization, version: 2 },
    ]

    for (const binding of mismatches) {
      const candidate = resultCandidate(review)
      candidate.authorization = binding
      assertModelError(() => createChangeSummaryResult(review, candidate))
    }

    const surplus = resultCandidate(review)
    ;(surplus.authorization as Record<string, unknown>).signatureVerified = true
    assertModelError(
      () => createChangeSummaryResult(review, surplus),
      'invalid-authorization'
    )

    const missing = resultCandidate(review)
    delete (missing.authorization as Record<string, unknown>).evidenceId
    assertModelError(
      () => createChangeSummaryResult(review, missing),
      'invalid-authorization'
    )
  })

  it('rejects HTML, Markdown, controls, bidi, lone surrogates, secrets, and oversized result text', () => {
    const review = createChangeSummaryReview(reviewInput())
    const unsafe = [
      '<script>alert(1)</script>',
      '<b>bold</b>',
      '# heading',
      '- list item',
      '[label](https://example.invalid)',
      '`inline code`',
      '```fence```',
      '**bold**',
      '__bold__',
      '~~strike~~',
      '---',
      '###',
      '-',
      '1.',
      '&lt;script&gt;',
      'control\u0007',
      'bidi\u202e text',
      String.fromCharCode(0xdc00),
      'apiKey=sentinel-secret',
      'Bearer sentinel-secret-value',
      `ghp_${'a'.repeat(20)}`,
      'a'.repeat(MaximumChangeSummaryTextBytes + 1),
      `A${' '.repeat(MaximumChangeSummaryTextBytes)}`,
    ]

    for (const text of unsafe) {
      assertModelError(
        () =>
          createChangeSummaryResult(
            review,
            resultCandidate(review, undefined, text)
          ),
        'invalid-result-text'
      )
    }

    const exactUtf8 = 'é'.repeat(MaximumChangeSummaryTextBytes / 2)
    assert.equal(
      createChangeSummaryResult(
        review,
        resultCandidate(review, undefined, exactUtf8)
      ).summary,
      exactUtf8
    )
    assertModelError(
      () =>
        createChangeSummaryResult(
          review,
          resultCandidate(review, undefined, `${exactUtf8}é`)
        ),
      'invalid-result-text'
    )

    const unsafeDescription = resultCandidate(review, [
      {
        path: review.reviewedPaths[0],
        availability: 'value',
        description: '<b>unsafe</b>',
      },
    ])
    assertModelError(
      () => createChangeSummaryResult(review, unsafeDescription),
      'invalid-result-text'
    )
    const oversizedDescription = resultCandidate(review, [
      {
        path: review.reviewedPaths[0],
        availability: 'value',
        description: 'a'.repeat(MaximumChangeSummaryChangeTextBytes + 1),
      },
    ])
    assertModelError(
      () => createChangeSummaryResult(review, oversizedDescription),
      'invalid-result-text'
    )
    const oversizedExplanation = resultCandidate(review, [
      {
        path: review.reviewedPaths[0],
        availability: 'unavailable',
        explanation: 'a'.repeat(
          MaximumChangeSummaryUnavailableExplanationBytes + 1
        ),
      },
    ])
    assertModelError(
      () => createChangeSummaryResult(review, oversizedExplanation),
      'invalid-result-text'
    )
    const unsafeExplanation = resultCandidate(review, [
      {
        path: review.reviewedPaths[0],
        availability: 'unavailable',
        explanation: 'password=sentinel-secret',
      },
    ])
    assertModelError(
      () => createChangeSummaryResult(review, unsafeExplanation),
      'invalid-result-text'
    )
  })

  it('rejects tampered derived review evidence before accepting a result', () => {
    const review = createChangeSummaryReview(reviewInput())
    const tampered: ReadonlyArray<IChangeSummaryReview> = [
      { ...review, version: 2 as 1 },
      { ...review, objectIdWidth: 64 },
      { ...review, reviewedCommitIds: [hex(2, 40)] },
      { ...review, reviewedPaths: ['src/replaced.ts'] },
      { ...review, facts: { ...review.facts, commitCount: 2 } },
    ]
    for (const value of tampered) {
      assertModelError(
        () => createChangeSummaryResult(value, resultCandidate(review)),
        'invalid-review'
      )
    }
  })

  it('preserves reviewed selection order rather than sorting commit permutations', () => {
    const first = createChangeSummaryReview(
      reviewInput([commit(1, [file('a.ts')]), commit(2, [file('b.ts')])])
    )
    const second = createChangeSummaryReview(
      reviewInput([commit(2, [file('b.ts')]), commit(1, [file('a.ts')])])
    )
    assert.deepEqual(first.reviewedCommitIds, [hex(1, 40), hex(2, 40)])
    assert.deepEqual(second.reviewedCommitIds, [hex(2, 40), hex(1, 40)])
    assert.deepEqual(first.reviewedPaths, ['a.ts', 'b.ts'])
    assert.deepEqual(second.reviewedPaths, ['b.ts', 'a.ts'])
  })
})

describe('static change-summary capability boundary', () => {
  it('contains no import, transport, policy-evaluation, Git, process, or serializer capability', () => {
    const sourcePath = join(
      process.cwd(),
      'app',
      'src',
      'lib',
      'change-summary',
      'change-summary-model.ts'
    )
    const source = readFileSync(sourcePath, 'utf8')

    assert.doesNotMatch(source, /^\s*import(?:\s|\()/mu)
    assert.doesNotMatch(source, /\brequire\s*\(/u)
    assert.doesNotMatch(source, /\bimport\s*\(/u)
    assert.doesNotMatch(
      source,
      /node:(?:fs|path|child_process|net|http|https)|\bdugite\b|\bipc(?:Main|Renderer)\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bprocess\s*\.|\b(?:execFile|execSync|spawn|spawnSync|eval)\s*\(|\bnew\s+Function\b|\btoCommand\b|\bserializ(?:e|er)\b/iu
    )
    assert.doesNotMatch(
      source,
      /^\s*(?:export\s+)?(?:interface|type)\s+[^\n]+\{[^}]*\b(?:prompt|systemPrompt|apiKey|token|password|credential|secret|modelId|provider|transport|diff|code|argv|command)\s*:/imsu
    )
    assert.match(source, /opaque correlation identities/u)
    assert.match(
      source,
      /neither grants authority nor interprets security policy/u
    )
    assert.doesNotMatch(
      source,
      /\b(?:evaluateAISecurityPolicy|getAISecurityPolicyDigest)\b|readonly\s+(?:allowed|verified|signature)\s*:/u
    )
  })
})
