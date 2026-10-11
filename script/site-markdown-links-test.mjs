#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
let pandoc = 'pandoc'
let filter = resolve(root, 'site/md-links.lua')
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index]
  assert.ok(['--pandoc', '--filter'].includes(flag), `Unknown argument: ${flag}`)
  const value = process.argv[++index]
  assert.ok(value, `${flag} requires a value`)
  if (flag === '--pandoc') pandoc = value
  else filter = resolve(value)
}

// Execute the real Lua filter through Pandoc, including prefixed filenames
// that must not inherit the exact README basename's index route.
const cases = [
  ['README.md', 'index.html'],
  ['./README.md', './index.html'],
  ['docs/README.md', 'docs/index.html'],
  ['Source-README.md', 'Source-README.html'],
  ['docs/wiki/published/Source-README.md', 'docs/wiki/published/Source-README.html'],
  ['AnotherREADME.md', 'AnotherREADME.html'],
  ['README.md#articles', 'index.html#articles'],
  ['Source-README.md#articles', 'Source-README.html#articles'],
  ['User-Guide', 'User-Guide.html'],
  ['guide.md#configuration', 'guide.html#configuration'],
  ['source-inventory.json', 'source-inventory.json'],
  ['https://example.com/README.md', 'https://example.com/README.md'],
  ['#articles', '#articles'],
  ['//example.com/README.md', '//example.com/README.md'],
  ['docs/', 'docs/'],
  ['mailto:reader@example.com', 'mailto:reader@example.com'],
]
const input = cases.map(([target], index) => `[case-${index}](${target})`).join('\n\n')
const result = spawnSync(pandoc, ['--from=gfm', '--to=json', '--lua-filter', filter], {
  cwd: root,
  input,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30000,
  maxBuffer: 1024 * 1024,
})
assert.ifError(result.error)
assert.equal(result.status, 0, `Pandoc failed: ${result.stderr}`)
const targets = []
function visit(value) {
  if (Array.isArray(value)) value.forEach(visit)
  else if (value && typeof value === 'object') {
    if (value.t === 'Link') targets.push(value.c[2][0])
    else Object.values(value).forEach(visit)
  }
}
visit(JSON.parse(result.stdout))
assert.equal(targets.length, cases.length, 'Every handwritten link case must render')
for (const [index, [inputTarget, expected]] of cases.entries()) {
  assert.equal(targets[index], expected, `Incorrect route for ${inputTarget}`)
}
console.log(`PASS ${cases.length}/${cases.length} real Pandoc/Lua link cases`)
