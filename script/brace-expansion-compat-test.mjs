import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fromNodeModules = packagePath =>
  require(join(root, 'node_modules', packagePath))

test('brace-expansion keeps the legacy callable API over the safe implementation', async () => {
  const compatibilityAdapter = require('brace-expansion')
  const compatibilityAdapterEsm = await import('brace-expansion')
  const modern = require('brace-expansion-modern')

  assert.equal(typeof compatibilityAdapter, 'function')
  assert.equal(compatibilityAdapter, modern.expand)
  assert.equal(compatibilityAdapter.expand, modern.expand)
  assert.equal(compatibilityAdapterEsm.expand, modern.expand)
  assert.equal(compatibilityAdapter.EXPANSION_MAX, modern.EXPANSION_MAX)
  assert.equal(
    compatibilityAdapter.EXPANSION_MAX_LENGTH,
    modern.EXPANSION_MAX_LENGTH
  )
  assert.deepEqual(compatibilityAdapter('{a,b}{1..2}'), [
    'a1',
    'a2',
    'b1',
    'b2',
  ])
})

test('all installed minimatch and glob generations accept the adapter', async () => {
  const minimatch3 = require('minimatch')
  const minimatch5 = fromNodeModules('markdownlint-cli/node_modules/minimatch')
  const minimatch10CommonJs = fromNodeModules(
    '@typescript-eslint/typescript-estree/node_modules/minimatch'
  ).minimatch
  const minimatch10Esm = await import(
    pathToFileURL(
      join(
        root,
        'node_modules',
        '@typescript-eslint',
        'typescript-estree',
        'node_modules',
        'minimatch',
        'dist',
        'esm',
        'index.js'
      )
    ).href
  )

  for (const matches of [
    minimatch3,
    minimatch5,
    minimatch10CommonJs,
    minimatch10Esm.minimatch,
  ]) {
    assert.equal(matches('src/file.ts', 'src/*.{ts,tsx}'), true)
    assert.equal(matches('docs/guide.mdx', '**/*.{md,mdx}'), true)
    assert.equal(matches('src/file.css', 'src/*.{ts,tsx}'), false)
  }

  const glob7 = require('glob')
  const glob8 = fromNodeModules('markdownlint-cli/node_modules/glob')
  assert.deepEqual(glob7.sync('vendor/yarn-*.js'), ['vendor/yarn-1.21.1.js'])
  assert.deepEqual(glob8.sync('vendor/yarn-*.js'), ['vendor/yarn-1.21.1.js'])
})

test('brace expansion remains bounded for exponentially large input', () => {
  const compatibilityAdapter = require('brace-expansion')
  const expanded = compatibilityAdapter('{a,b}'.repeat(120))
  const characters = expanded.reduce((sum, value) => sum + value.length, 0)

  assert.ok(expanded.length <= compatibilityAdapter.EXPANSION_MAX)
  assert.ok(characters <= compatibilityAdapter.EXPANSION_MAX_LENGTH)
})

test('Electron ASAR packaging still honors brace-based unpack globs', async () => {
  const asar = require('@electron/asar')
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'desktop-material-brace-asar-')
  )
  const source = join(temporaryRoot, 'source')
  const archive = join(temporaryRoot, 'fixture.asar')

  try {
    await mkdir(source)
    await writeFile(join(source, 'packed.js'), 'module.exports = 42\n')
    await writeFile(join(source, 'loose.txt'), 'unpacked\n')

    await asar.createPackageWithOptions(source, archive, {
      unpack: '*.{txt,md}',
    })

    const archiveEntries = asar.listPackage(archive)
    assert.ok(archiveEntries.some(entry => entry.endsWith('packed.js')))
    assert.ok(archiveEntries.some(entry => entry.endsWith('loose.txt')))
    assert.equal(
      await readFile(join(`${archive}.unpacked`, 'loose.txt'), 'utf8'),
      'unpacked\n'
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
