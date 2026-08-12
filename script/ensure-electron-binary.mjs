#!/usr/bin/env node
/**
 * Make sure `node_modules/electron/dist` actually holds the Electron binary.
 *
 * WHY THIS EXISTS
 *
 * On a host whose Node runtime exits before asynchronous work settles — seen on
 * Node 26 — the `electron` package's own `install.js` is a dead end. It prints a
 * `@electron/get` cache hit, exits 0 in under a second, and extracts nothing:
 * `dist/` is left holding at most an empty `locales` folder and no `path.txt`.
 * Re-running it changes nothing and no error is ever printed, so the only
 * honest way to judge it is whether the executable exists afterwards. npm 11's
 * install-script gate can leave the same state for a different reason.
 *
 * The result looks exactly like a broken checkout: `yarn start` fails, the
 * packaging step fails, and the screenshot harness cannot launch anything —
 * all with a dependency that `npm ls` reports as perfectly installed.
 *
 * THE RECOVERY, WHICH IS SYNCHRONOUS AND NEEDS NO NEW DEPENDENCY
 *
 * The zip is already in the `@electron/get` cache; only the extraction was
 * skipped. So: find it, verify its SHA-256 against the electron package's own
 * `checksums.json`, extract it, and write the `path.txt` that the package's
 * `index.js` reads to find the executable.
 *
 * Verifying the hash matters. This runs unattended as a `prestart` hook, and a
 * truncated or half-written cache entry would otherwise be extracted into a
 * subtly broken install that fails later and somewhere else.
 *
 * Usage:
 *   node script/ensure-electron-binary.mjs           # repair when needed
 *   node script/ensure-electron-binary.mjs --check   # report, change nothing
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronRoot = join(root, 'node_modules', 'electron')
const distRoot = join(electronRoot, 'dist')
const checkOnly = process.argv.includes('--check')

const say = message => process.stdout.write(`${message}\n`)
const fail = message => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

/** The executable name for this platform, and the value `path.txt` must hold. */
function executableName() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe'
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    default:
      return 'electron'
  }
}

if (!existsSync(electronRoot)) {
  fail('node_modules/electron is absent — run the install first.')
}

const executable = join(distRoot, executableName())
if (existsSync(executable)) {
  say(`ok electron binary present at ${executable}`)
  process.exit(0)
}

if (checkOnly) {
  fail(
    `electron binary missing at ${executable}\n` +
      'Run: node script/ensure-electron-binary.mjs'
  )
}

const version = JSON.parse(
  readFileSync(join(electronRoot, 'package.json'), 'utf8')
).version

// `@electron/get` names the asset by version, platform and architecture, and
// stores each one in its own hash-named directory. Which directory is not
// derivable, so the cache is searched for the exact filename instead.
const assetName = `electron-v${version}-${process.platform}-${process.arch}.zip`

const cacheRoot =
  process.env.electron_config_cache ??
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? '', 'electron', 'Cache')
    : process.platform === 'darwin'
    ? join(process.env.HOME ?? '', 'Library', 'Caches', 'electron')
    : join(process.env.HOME ?? '', '.cache', 'electron'))

function findCachedAsset() {
  if (!existsSync(cacheRoot)) {
    return null
  }
  const direct = join(cacheRoot, assetName)
  if (existsSync(direct)) {
    return direct
  }
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, assetName)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const asset = findCachedAsset()
if (asset === null) {
  fail(
    `electron ${version} is not extracted and ${assetName} is not in the cache ` +
      `(${cacheRoot}).\n` +
      'Re-run the dependency install with electron install scripts enabled so ' +
      'the archive is downloaded, then run this again.'
  )
}

say(`found ${asset}`)

// The electron package ships the upstream checksums, so the archive can be
// verified without any network access at all.
const checksums = JSON.parse(
  readFileSync(join(electronRoot, 'checksums.json'), 'utf8')
)
const expected = checksums[assetName]
if (typeof expected !== 'string') {
  fail(`checksums.json carries no entry for ${assetName}`)
}

const actual = createHash('sha256').update(readFileSync(asset)).digest('hex')
if (actual.toLowerCase() !== expected.toLowerCase()) {
  fail(
    `${assetName} failed its SHA-256 check.\n` +
      `  expected ${expected}\n  actual   ${actual}\n` +
      'The cached archive is corrupt. Delete it and install again.'
  )
}
say('sha-256 verified against the electron package checksums')

mkdirSync(distRoot, { recursive: true })

if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${asset}' -DestinationPath '${distRoot}' -Force`,
    ],
    { stdio: 'inherit' }
  )
} else {
  execFileSync('unzip', ['-o', '-q', asset, '-d', distRoot], {
    stdio: 'inherit',
  })
}

// `electron/index.js` reads this to find the executable. Without it the package
// throws even though the binary is now sitting right beside it.
writeFileSync(join(electronRoot, 'path.txt'), executableName())

if (!existsSync(executable)) {
  fail(`extraction finished but ${executable} is still absent`)
}

say(`ok extracted electron ${version} to ${distRoot}`)
