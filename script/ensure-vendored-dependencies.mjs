// Make sure every vendored `file:` dependency has actually been compiled before
// anything tries to bundle it.
//
// Each of them declares `"install": "node-gyp rebuild && tsc"`. Those are two
// commands, and a checkout can end up having run only the first: the native
// `build/` is there, the TypeScript never became JavaScript, and the file the
// package's own `main` points at does not exist. Nothing about that is visible
// until webpack is most of the way through a build, and what it says then
// points somewhere else entirely:
//
//   - A missing `dist/` on `desktop-notifications` surfaces as
//     `Can't resolve 'desktop-notifications'` plus `TS2307` across nine files,
//     which reads as a dependency nobody installed.
//   - A missing `dist/` on `desktop-trampoline` is worse. Webpack falls back to
//     the package root's `index.ts`, hits the first type annotation, and reports
//     `Module parse failed: Unexpected token (3:49) ... no loaders are
//     configured to process this file`. That reads as a webpack loader
//     misconfiguration, and it is not one.
//
// Two full production builds were lost to this on 2026-08-13 before anyone
// looked at `main`. So this runs first, says the true cause, and — because the
// repair is completely deterministic — performs it rather than merely
// complaining about it.
//
// Nothing here is special-cased by package name. The list is whatever
// `app/package.json` declares with a `file:` specifier, and the file to check
// is whatever each package's own `main` names, so a fourth vendored dependency
// is covered the day it is added.
//
// Usage:
//   node script/ensure-vendored-dependencies.mjs            repair when needed
//   node script/ensure-vendored-dependencies.mjs --check     report, never write

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

/** The repository root, from this file rather than from the caller's cwd. */
export const repositoryRoot = resolve(scriptDirectory, '..')

/** What a caller is told to run when the repair itself cannot be done here. */
export const RepairCommand = 'node script/ensure-vendored-dependencies.mjs'

/**
 * Suffixes `tsc` emits.
 *
 * An allowlist rather than "copy the directory", and that is the whole safety
 * of this file. `windows-argv-parser` compiles into `build/`, which is also
 * where `node-gyp` puts `Release/*.node`; copying a directory wholesale could
 * replace a correctly built native binary with whatever happens to be sitting
 * in the vendor tree. Nothing below can match a `.node`.
 */
export const CompiledSuffixes = ['.js', '.mjs', '.cjs', '.jsx', '.d.ts', '.map']

export function isCompiledOutput(fileName) {
  return CompiledSuffixes.some(suffix => fileName.endsWith(suffix))
}

/** Read a package's `main`, defaulting the way node does. */
function mainField(packageDirectory) {
  try {
    const parsed = JSON.parse(
      readFileSync(join(packageDirectory, 'package.json'), 'utf8')
    )
    return typeof parsed.main === 'string' && parsed.main.length > 0
      ? parsed.main
      : 'index.js'
  } catch {
    return null
  }
}

/**
 * Every `file:` dependency `app/package.json` declares.
 *
 * The specifier is relative to `app/`, which is where the manifest lives — not
 * to the repository root, and not to the caller's working directory.
 */
export function readVendoredDependencies(root = repositoryRoot) {
  const appDirectory = join(root, 'app')
  const manifest = JSON.parse(
    readFileSync(join(appDirectory, 'package.json'), 'utf8')
  )

  const declared = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  }

  return Object.entries(declared)
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
    .map(([name, spec]) => ({
      name,
      spec,
      sourceDirectory: resolve(appDirectory, spec.slice('file:'.length)),
      installedDirectory: join(appDirectory, 'node_modules', name),
      // Carried on the entry rather than read from module state, so a caller
      // can point the whole preflight at a fixture tree and have resolution
      // answer about that tree instead of about this repository.
      manifestPath: join(appDirectory, 'package.json'),
      root,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * What state one vendored dependency is in.
 *
 * `satisfied` deliberately checks the exact file `main` names and then asks
 * node to resolve the package as well. Neither alone is enough: a directory can
 * be present and importable while the file its `main` points at is absent (node
 * falls through to `index.js`), and a `main` file can exist in a tree node
 * still refuses to resolve.
 */
export function describeVendoredDependency(entry) {
  const installed = existsSync(entry.installedDirectory)
  const main = installed
    ? mainField(entry.installedDirectory)
    : mainField(entry.sourceDirectory)

  const mainPath = main === null ? null : join(entry.installedDirectory, main)
  const mainPresent = mainPath !== null && existsSync(mainPath)

  let resolves = false
  if (mainPresent) {
    try {
      const require = createRequire(
        entry.manifestPath ?? join(repositoryRoot, 'app', 'package.json')
      )
      require.resolve(entry.name)
      resolves = true
    } catch {
      resolves = false
    }
  }

  // The first segment of `main` is the directory `tsc` emits into — `dist` for
  // two of these, `build` for the one that shares a directory with node-gyp.
  // A `main` with no directory part means the output lands at the package root.
  const outputSegment =
    main === null || !main.includes('/') ? null : main.split('/')[0]

  return {
    ...entry,
    main,
    mainPath,
    installed,
    mainPresent,
    resolves,
    outputSegment,
    satisfied: installed && mainPresent && resolves,
  }
}

/** Copy only `tsc` output, preserving structure. Returns what it copied. */
function copyCompiledOutput(fromDirectory, toDirectory) {
  const copied = []

  const walk = relativePath => {
    const absolute =
      relativePath === '' ? fromDirectory : join(fromDirectory, relativePath)
    let entries
    try {
      entries = readdirSync(absolute, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const childRelative =
        relativePath === '' ? entry.name : join(relativePath, entry.name)
      if (entry.isDirectory()) {
        walk(childRelative)
        continue
      }
      if (!isCompiledOutput(entry.name)) {
        continue
      }
      const destination = join(toDirectory, childRelative)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(fromDirectory, childRelative), destination)
      copied.push(childRelative.split(sep).join('/'))
    }
  }

  walk('')
  return copied
}

/**
 * Compile a vendored package and put the result where webpack will look.
 *
 * The copy is not optional. Yarn v1 resolves a `file:` specifier by **copying**
 * the package into `node_modules`, not by symlinking it, so building the vendor
 * tree alone changes nothing that a bundler ever sees — which is exactly the
 * mistake that makes this look fixed when it is not.
 *
 * `tsc` is invoked as a script through the current node binary rather than
 * through `node_modules/.bin/tsc`, because that entry is a `.cmd` shim on
 * Windows and `execFileSync` cannot run one without a shell.
 */
export function repairVendoredDependency(described, log = console.log) {
  if (!existsSync(described.sourceDirectory)) {
    return {
      repaired: false,
      reason: `no vendor source at ${described.sourceDirectory}`,
    }
  }
  if (!described.installed) {
    return {
      repaired: false,
      reason: `${described.name} is not installed under app/node_modules; run yarn first`,
    }
  }

  const typescript = join(
    described.root ?? repositoryRoot,
    'node_modules',
    'typescript',
    'lib',
    'tsc.js'
  )
  if (!existsSync(typescript)) {
    return {
      repaired: false,
      reason: `no TypeScript compiler at ${typescript}`,
    }
  }

  log(`  compiling ${described.name} in ${described.sourceDirectory}`)
  try {
    execFileSync(process.execPath, [typescript, '--project', '.'], {
      cwd: described.sourceDirectory,
      stdio: 'inherit',
    })
  } catch (error) {
    return {
      repaired: false,
      reason: `tsc failed in ${described.sourceDirectory}: ${error.message}`,
    }
  }

  const segment = described.outputSegment
  const from =
    segment === null
      ? described.sourceDirectory
      : join(described.sourceDirectory, segment)
  const to =
    segment === null
      ? described.installedDirectory
      : join(described.installedDirectory, segment)

  const copied = copyCompiledOutput(from, to)
  log(`  copied ${copied.length} compiled file(s) into ${to}`)

  return { repaired: true, copied }
}

/**
 * The preflight itself. Throws when a dependency cannot be made usable.
 *
 * It throws rather than warns for the same reason the capture freshness guard
 * does: the failure it prevents arrives much later, wearing someone else's
 * name, and a warning in a build log nobody reads is how it got through twice.
 */
export function ensureVendoredDependencies(options = {}) {
  const { root = repositoryRoot, repair = true, log = console.log } = options

  const described = readVendoredDependencies(root).map(
    describeVendoredDependency
  )
  const results = []
  const failures = []

  for (const entry of described) {
    if (entry.satisfied) {
      results.push({ name: entry.name, state: 'ok', main: entry.main })
      continue
    }

    if (!repair) {
      failures.push(entry)
      continue
    }

    log(`ensure-vendored: ${entry.name} is missing ${entry.main}`)
    const outcome = repairVendoredDependency(entry, log)
    const after = describeVendoredDependency(entry)

    if (after.satisfied) {
      results.push({ name: entry.name, state: 'repaired', main: after.main })
      continue
    }

    failures.push({ ...after, reason: outcome.reason })
  }

  if (failures.length > 0) {
    const detail = failures
      .map(
        f =>
          `  - ${f.name}: expected ${f.mainPath}` +
          (f.reason === undefined ? '' : `\n      ${f.reason}`)
      )
      .join('\n')

    throw new Error(
      `Vendored dependencies are not compiled, so a bundle of this tree would ` +
        `fail with an error naming something else:\n${detail}\n` +
        `Each declares "install": "node-gyp rebuild && tsc"; the tsc half has ` +
        `not run. Repair with: ${RepairCommand}`
    )
  }

  return results
}

// Run directly: repair by default, `--check` to report without writing.
if (process.argv[1] !== undefined) {
  const invokedDirectly =
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

  if (invokedDirectly) {
    const checkOnly = process.argv.includes('--check')
    try {
      const results = ensureVendoredDependencies({ repair: !checkOnly })
      const repaired = results.filter(r => r.state === 'repaired')
      if (repaired.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `ensure-vendored: repaired ${repaired.map(r => r.name).join(', ')}; ${
            results.length
          } vendored dependencies usable`
        )
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`ensure-vendored: ${error.message}`)
      process.exit(1)
    }
  }
}
