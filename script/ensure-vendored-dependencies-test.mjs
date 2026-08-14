import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  CompiledSuffixes,
  describeVendoredDependency,
  ensureVendoredDependencies,
  isCompiledOutput,
  readVendoredDependencies,
  RepairCommand,
  repositoryRoot,
} from './ensure-vendored-dependencies.mjs'

/**
 * A miniature repository: one `file:` dependency declared by `app`, a vendor
 * source beside it, and an installed copy — which is what yarn v1 makes, since
 * it resolves `file:` by copying rather than symlinking.
 *
 * `withDist` writes the file the package's own `main` names. Leaving it out is
 * the exact state a checkout reaches when `node-gyp rebuild` ran and the `tsc`
 * half of the same install script did not.
 */
function makeFixture({ withDist = false, extraDependencies = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vendored-preflight-'))
  const app = join(root, 'app')
  const vendor = join(root, 'vendor', 'fixture-vendored')
  const installed = join(app, 'node_modules', 'fixture-vendored')

  mkdirSync(app, { recursive: true })
  mkdirSync(vendor, { recursive: true })
  mkdirSync(installed, { recursive: true })

  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({
      name: 'fixture-app',
      dependencies: {
        'fixture-vendored': 'file:../vendor/fixture-vendored',
        // A perfectly ordinary registry dependency, which must be ignored.
        classnames: '^2.2.5',
        ...extraDependencies,
      },
    })
  )

  const manifest = JSON.stringify({
    name: 'fixture-vendored',
    main: 'dist/index.js',
  })
  writeFileSync(join(vendor, 'package.json'), manifest)
  writeFileSync(join(installed, 'package.json'), manifest)

  if (withDist) {
    mkdirSync(join(installed, 'dist'), { recursive: true })
    writeFileSync(join(installed, 'dist', 'index.js'), 'module.exports = {}')
  }

  return { root, app, vendor, installed }
}

describe('vendored dependency preflight — discovery', () => {
  it('derives the list from file: specifiers rather than from package names', () => {
    const fixture = makeFixture()
    try {
      const entries = readVendoredDependencies(fixture.root)

      assert.equal(entries.length, 1, 'only the file: dependency counts')
      assert.equal(entries[0].name, 'fixture-vendored')
      assert.equal(entries[0].sourceDirectory, fixture.vendor)
      assert.equal(entries[0].installedDirectory, fixture.installed)
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('covers a newly added vendored dependency with no code change', () => {
    // The regression this forbids is a hard-coded list of three names. A fourth
    // vendored dependency must be picked up by existing to be declared.
    const fixture = makeFixture({
      extraDependencies: { 'fixture-second': 'file:../vendor/fixture-second' },
    })
    try {
      const names = readVendoredDependencies(fixture.root).map(e => e.name)
      assert.deepEqual(names, ['fixture-second', 'fixture-vendored'])
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('resolves a file: specifier relative to app/, not to the repository root', () => {
    // `file:../vendor/x` is written in `app/package.json`, so its `..` is the
    // repository root. Resolving it from the wrong base silently points the
    // whole preflight at a directory that does not exist.
    const fixture = makeFixture()
    try {
      const [entry] = readVendoredDependencies(fixture.root)
      assert.equal(
        entry.sourceDirectory,
        join(fixture.root, 'vendor', 'fixture-vendored')
      )
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('reads the real repository without special-casing any package', () => {
    const entries = readVendoredDependencies(repositoryRoot)
    assert.ok(entries.length > 0, 'this repository declares file: dependencies')
    for (const entry of entries) {
      assert.ok(entry.spec.startsWith('file:'), `${entry.name} is a file: dep`)
      assert.ok(
        entry.installedDirectory.includes(join('app', 'node_modules')),
        `${entry.name} installs under app/node_modules`
      )
    }
  })
})

describe('vendored dependency preflight — detection', () => {
  it('reports the package unsatisfied when the file main names is absent', () => {
    const fixture = makeFixture({ withDist: false })
    try {
      const [entry] = readVendoredDependencies(fixture.root)
      const described = describeVendoredDependency(entry)

      assert.equal(described.installed, true, 'the directory is present')
      assert.equal(described.main, 'dist/index.js')
      assert.equal(described.mainPresent, false)
      assert.equal(described.satisfied, false)
      assert.equal(described.outputSegment, 'dist')
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('is satisfied once that file exists', () => {
    const fixture = makeFixture({ withDist: true })
    try {
      const [entry] = readVendoredDependencies(fixture.root)
      const described = describeVendoredDependency(entry)

      assert.equal(described.mainPresent, true)
      assert.equal(described.resolves, true)
      assert.equal(described.satisfied, true)
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('fails with the package, the exact path, the cause and the repair command', () => {
    const fixture = makeFixture({ withDist: false })
    try {
      assert.throws(
        () => ensureVendoredDependencies({ root: fixture.root, repair: false }),
        error => {
          // The name, so the reader knows which one.
          assert.match(error.message, /fixture-vendored/)
          // The exact file, so nobody has to guess what "not compiled" means.
          assert.ok(
            error.message.includes(join(fixture.installed, 'dist', 'index.js')),
            `expected the exact main path in: ${error.message}`
          )
          // The true cause, because the build's own error names something else.
          assert.match(error.message, /the tsc half has not run/)
          // The fix.
          assert.ok(error.message.includes(RepairCommand))
          return true
        }
      )
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('passes silently when every vendored dependency is compiled', () => {
    const fixture = makeFixture({ withDist: true })
    try {
      const results = ensureVendoredDependencies({
        root: fixture.root,
        repair: false,
        log: () => undefined,
      })
      assert.deepEqual(results, [
        { name: 'fixture-vendored', state: 'ok', main: 'dist/index.js' },
      ])
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})

describe('vendored dependency preflight — what may be copied', () => {
  it('never treats a native binary as compiler output', () => {
    // This is the load-bearing safety property. `windows-argv-parser` compiles
    // into `build/`, the same directory node-gyp fills with `Release/*.node`,
    // so a repair that copied whole directories could replace a correctly built
    // native binary. Nothing on the allowlist can match one.
    for (const native of [
      'windows-argv-parser.node',
      'desktop-notifications.node',
      'binding.node',
    ]) {
      assert.equal(isCompiledOutput(native), false, native)
    }
  })

  it('recognises exactly what tsc emits', () => {
    for (const emitted of [
      'index.js',
      'index.d.ts',
      'index.js.map',
      'index.d.ts.map',
      'native-module.js',
    ]) {
      assert.equal(isCompiledOutput(emitted), true, emitted)
    }
  })

  it('keeps the allowlist an allowlist', () => {
    // A denylist would let the next unknown artifact type through by default;
    // this asserts the shape stays inverted.
    assert.ok(CompiledSuffixes.length > 0)
    for (const suffix of CompiledSuffixes) {
      assert.ok(suffix.startsWith('.'), `${suffix} is a suffix`)
      assert.notEqual(suffix, '.node')
    }
  })
})
