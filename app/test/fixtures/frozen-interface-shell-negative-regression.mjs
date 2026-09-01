import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const testFile = join(root, 'app', 'test', 'unit', 'interface-shell-frozen-test.ts')
const loader = process.env.FROZEN_TS_LOADER ?? 'tsx'
const dimensions = [
  ['retired-path-resolution', 'loads a complete'],
  ['accepted-source-extensions', 'loads a complete'],
  ['alias-import-resolution', 'loads a complete'],
  ['comment-free-import-detection', 'current renderer entry'],
  ['renderer-boundary-markers', 'current renderer entry'],
  ['renderer-retired-imports', 'current renderer entry'],
]

for (const [dimension, testPattern] of dimensions) {
  const result = spawnSync(
    process.execPath,
    ['--import', loader, '--test', `--test-name-pattern=${testPattern}`, testFile],
    {
      cwd: root,
      env: { ...process.env, FROZEN_SHELL_NEGATIVE_DIMENSION: dimension },
      encoding: 'utf8',
      windowsHide: true,
    }
  )
  assert.notEqual(
    result.status,
    0,
    `negative regression ${dimension} stayed green\n${result.stdout}\n${result.stderr}`
  )
}

console.log(`negative regressions red for all ${dimensions.length} dimensions`)
