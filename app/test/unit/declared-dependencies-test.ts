import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Every package the app imports must be a package the project declares.
 *
 * WHY THIS EXISTS, AND WHY A TYPE-CHECK IS NOT ENOUGH
 *
 * An `fs-extra` import reached the renderer in a single session. Nothing else in
 * that layer used it, it was not in either manifest, and it was present only as
 * a transitive install. `npx tsc --noEmit` passed on every run; CI failed with
 * `TS7016: Could not find a declaration file for module 'fs-extra'`.
 *
 * The local check passed because TypeScript resolves `@types/*` by walking
 * **parent directories** and stopping at the first hit — and this machine had
 * `@types/fs-extra` in the *home directory*, outside the checkout entirely. So a
 * package installed globally at some point silently satisfied a type that no CI
 * runner has.
 *
 * That is not two configs disagreeing, which is the first thing anyone checks
 * and the first thing they rule out. It is the same config reaching outside the
 * repository, and no local command reproduces it on the machine that has the
 * stray install. Hence a test that reads the manifests instead of the module
 * graph: it cannot be fooled by what happens to be on disk.
 */

const root = process.cwd()

/** Node built-ins, which are never declared and never need to be. */
const builtins = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'worker_threads',
  'zlib',
])

/** Provided by the runtime rather than by a manifest. */
const runtimeProvided = new Set(['electron'])

/**
 * Packages imported directly that are only ever installed as a transitive
 * dependency of a declared parent.
 *
 * These predate this test and are named rather than waved through, because each
 * is the same latent shape as the `fs-extra` failure above: the import resolves
 * today only because something else pulls the package in. A version bump to the
 * parent that drops or renames it breaks the build with no warning, and the
 * manifest gives no hint that this code depends on it.
 *
 * The parent is recorded beside each one and asserted to still be declared, so
 * this list cannot quietly become a place where new undeclared imports are
 * parked: removing a parent turns its exception into a failure rather than into
 * silence.
 *
 * The honest fix is to declare all three at the versions already installed.
 * That is a manifest and lockfile change and does not belong in the same commit
 * as a build fix; it is recorded in HANDOFF.md as the follow-up.
 */
const transitiveExceptions: ReadonlyMap<string, string> = new Map([
  ['winston-transport', 'winston'],
  ['@floating-ui/core', '@floating-ui/react-dom'],
  ['focus-trap', 'focus-trap-react'],
])

function declaredPackages(): ReadonlySet<string> {
  const names = new Set<string>()
  for (const manifest of ['package.json', 'app/package.json']) {
    const json = JSON.parse(readFileSync(join(root, manifest), 'utf8'))
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const name of Object.keys(json[field] ?? {})) {
        names.add(name)
      }
    }
  }
  return names
}

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') {
        continue
      }
      yield* sourceFiles(full)
    } else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      yield full
    }
  }
}

/**
 * The package a module specifier names, or `null` for a relative import.
 *
 * A scoped specifier keeps two segments (`@scope/name`); everything else keeps
 * one, so a deep import such as `@github/copilot-sdk/dist/generated/rpc`
 * resolves to the package that has to be declared rather than to a path inside
 * it.
 */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null
  }
  if (specifier.startsWith('node:')) {
    return null
  }
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

describe('every imported package is declared', () => {
  const declared = declaredPackages()

  it('finds the manifests it is asserting against', () => {
    // A test that silently found no dependencies would pass on everything.
    assert.ok(declared.size > 50, `only found ${declared.size} declarations`)
    assert.ok(declared.has('react'))
  })

  it('keeps every transitive exception anchored to a declared parent', () => {
    // What stops the exception list becoming a dumping ground. An exception is
    // only defensible while the package is genuinely reachable through
    // something the project declares; the moment that parent goes, the
    // exception is a plain undeclared import again and this fails.
    for (const [name, parent] of transitiveExceptions) {
      assert.ok(
        declared.has(parent),
        `${name} is excused because ${parent} pulls it in, but ${parent} is ` +
          `no longer declared — so ${name} is now simply undeclared`
      )
    }
  })

  it('has no undeclared import anywhere in app/src', () => {
    const undeclared: Array<string> = []

    for (const file of sourceFiles(join(root, 'app/src'))) {
      const source = readFileSync(file, 'utf8')
      // Every pattern here is single-line on purpose. A `[\s\S]*?` between
      // `import` and `from` spans lines and swallows whatever follows, which is
      // how the first version of this test reported packages called `) ||` and
      // `${this.repository.name}`. A specifier only ever appears at the head of
      // an import or export, or on the closing line of a multi-line one.
      const specifiers = [
        // `import X from 'y'`, `export { a } from 'b'` — all on one line.
        ...source.matchAll(/^\s*(?:import|export)\s[^'"]*\bfrom\s+'([^']+)'/gm),
        // The last line of a multi-line import: `} from 'y'`.
        ...source.matchAll(/^\s*\}\s*from\s+'([^']+)'/gm),
        // A side-effect import: `import 'y'`.
        ...source.matchAll(/^\s*import\s+'([^']+)'/gm),
      ].map(match => match[1])

      for (const specifier of specifiers) {
        const name = packageOf(specifier)
        if (
          name === null ||
          builtins.has(name) ||
          runtimeProvided.has(name) ||
          transitiveExceptions.has(name) ||
          declared.has(name)
        ) {
          continue
        }
        undeclared.push(`${relative(root, file)} imports ${name}`)
      }
    }

    assert.deepStrictEqual(
      [...new Set(undeclared)].sort(),
      [],
      'an undeclared package resolves locally only because it happens to be ' +
        'installed — as a transitive dependency, or from a node_modules above ' +
        'the checkout. It will not resolve in CI'
    )
  })
})
