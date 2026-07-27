import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  foldIgnoredPath,
  getDestinationCollisions,
  getIgnoredPathStructuralRejection,
  getIgnoredSubmoduleDestinationError,
  IgnoredSubmoduleDeferredPhase,
  IgnoredSubmoduleDestinationKey,
  IgnoredSubmoduleRejectionKey,
  ignoredPathAncestors,
  isIgnoredPathWithin,
  normalizeIgnoredPath,
} from '../../../src/lib/cheap-lfs/ignored-submodule-plan'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../../src/lib/i18n-resources'

const sourceRoot = join(__dirname, '../../../src')

describe('ignored submodule planning rules', () => {
  it('normalizes and folds repository-relative paths', () => {
    assert.strictEqual(normalizeIgnoredPath('  a\\b//c  '), 'a/b/c')
    assert.strictEqual(foldIgnoredPath('A\\Foo.BIN'), 'a/foo.bin')
    assert.deepStrictEqual(ignoredPathAncestors('a/b/c'), ['a', 'a/b'])
    assert.deepStrictEqual(ignoredPathAncestors('a'), [])
    assert.ok(isIgnoredPathWithin('vendor', 'VENDOR/x/y'))
    assert.ok(isIgnoredPathWithin('vendor', 'vendor'))
    assert.ok(!isIgnoredPathWithin('vendor', 'vendored/x'))
  })

  it('refuses paths which leave the repository or touch Git control data', () => {
    const cases: ReadonlyArray<{
      readonly path: string
      readonly reason: string
    }> = [
      { path: '', reason: 'path-escape' },
      { path: '/etc/passwd', reason: 'path-escape' },
      { path: 'C:/Windows/System32/drivers/etc/hosts', reason: 'path-escape' },
      { path: '../outside.bin', reason: 'path-escape' },
      { path: 'a/../../outside.bin', reason: 'path-escape' },
      { path: 'a/./b', reason: 'path-escape' },
      { path: 'a\u0000b', reason: 'path-escape' },
      { path: '.git/config', reason: 'git-control-path' },
      { path: 'nested/.GIT/objects/ab/cdef', reason: 'git-control-path' },
    ]

    for (const { path, reason } of cases) {
      const rejection = getIgnoredPathStructuralRejection(path)
      assert.ok(rejection !== null, `${path} must be refused`)
      assert.strictEqual(rejection.reason, reason, path)
      assert.ok(rejection.detail.length > 0)
    }

    assert.strictEqual(
      getIgnoredPathStructuralRejection('build/output/app.bin'),
      null
    )
  })

  it('refuses selections which collide at the destination on Windows', () => {
    const rejections = getDestinationCollisions([
      'A/Foo.bin',
      'a/foo.bin',
      'A/Foo.bin',
      'kept/other.bin',
    ])

    assert.deepStrictEqual(
      rejections.map(rejection => [rejection.path, rejection.reason]),
      [
        ['a/foo.bin', 'destination-case-collision'],
        ['A/Foo.bin', 'duplicate-selection'],
      ]
    )
  })

  it('refuses a selection where one path must be both a file and a folder', () => {
    const fileThenDirectory = getDestinationCollisions([
      'data/blob',
      'DATA/BLOB/inner.bin',
    ])
    assert.deepStrictEqual(
      fileThenDirectory.map(rejection => [rejection.path, rejection.reason]),
      [['DATA/BLOB/inner.bin', 'destination-case-collision']]
    )

    const directoryThenFile = getDestinationCollisions([
      'data/blob/inner.bin',
      'DATA/BLOB',
    ])
    assert.deepStrictEqual(
      directoryThenFile.map(rejection => [rejection.path, rejection.reason]),
      [['DATA/BLOB', 'destination-case-collision']]
    )
  })

  it('keeps a non-colliding selection intact', () => {
    assert.deepStrictEqual(
      getDestinationCollisions(['a/one.bin', 'a/two.bin', 'b/one.bin']),
      []
    )
  })

  it('validates the destination folder from its text alone', () => {
    assert.strictEqual(getIgnoredSubmoduleDestinationError('  '), 'empty')
    assert.strictEqual(getIgnoredSubmoduleDestinationError('/abs'), 'absolute')
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('C:/abs'),
      'absolute'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('a/../b'),
      'segments'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('a/.git/b'),
      'git-control-path'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('.'),
      'repository-root'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('vendor/lib', ['VENDOR']),
      'existing-submodule'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('vendor', ['vendor/lib']),
      'existing-submodule'
    )
    assert.strictEqual(
      getIgnoredSubmoduleDestinationError('local-large-files', ['vendor/lib']),
      null
    )
  })

  it('localizes every rejection and destination reason in both languages', () => {
    const keys = [
      ...Object.values(IgnoredSubmoduleRejectionKey),
      ...Object.values(IgnoredSubmoduleDestinationKey),
    ]

    for (const key of keys) {
      assert.ok(
        (englishTranslations[key] ?? '').length > 0,
        `${key} needs English copy`
      )
      assert.ok(
        (cantoneseTranslations[key] ?? '').length > 0,
        `${key} needs Cantonese copy`
      )
    }
  })

  it('names every capability this phase defers instead of doing', () => {
    assert.deepStrictEqual(
      [...IgnoredSubmoduleDeferredPhase],
      [
        'release-or-oci-storage-selection',
        'cheap-lfs-object-upload',
        'pointer-conversion',
        'provider-repository-creation',
        'remote-creation',
        'push',
      ]
    )
  })

  it('keeps the local phase free of upload, remote, and push code', async () => {
    const [local, plan] = await Promise.all([
      readFile(
        join(sourceRoot, 'lib/cheap-lfs/ignored-submodule-local.ts'),
        'utf8'
      ),
      readFile(
        join(sourceRoot, 'lib/cheap-lfs/ignored-submodule-plan.ts'),
        'utf8'
      ),
    ])

    for (const source of [local, plan]) {
      const imports = [
        ...source.matchAll(/^import[\s\S]*?from '([^']+)'/gm),
      ].map(match => match[1])

      for (const specifier of imports) {
        assert.ok(
          !/api|github-release|oci|ghcr|docker|push|upload|remote/i.test(
            specifier
          ),
          `The local phase must not import ${specifier}`
        )
      }
    }

    // The single `git submodule add` is the only Git mutation of the parent
    // repository; no network verb may reach Git from this module. The plan
    // module is exempt from this literal scan because the names it lists are
    // exactly the capabilities this phase refuses to have.
    for (const forbidden of [
      "'push'",
      "'fetch'",
      "'remote'",
      "'clone'",
      'uploadReleaseAsset',
      'pinFileToRelease',
    ]) {
      assert.ok(
        !local.includes(forbidden),
        `The local phase must not reference ${forbidden}`
      )
    }
  })
})
