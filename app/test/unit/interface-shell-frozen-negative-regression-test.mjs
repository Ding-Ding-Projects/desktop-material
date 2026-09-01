import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const testFile = join(root, 'app', 'test', 'unit', 'interface-shell-frozen-test.ts')
const loader = process.env.FROZEN_TS_LOADER ?? 'tsx'
const run = dimension => spawnSync(process.execPath, ['--import', loader, '--test', `--test-name-pattern=${dimension ? 'interface shell' : 'loads a complete'}`, testFile], {
  cwd: root,
  env: { ...process.env, ...(dimension ? { FROZEN_SHELL_NEGATIVE_DIMENSION: dimension } : {}) },
  encoding: 'utf8', windowsHide: true,
})

assert.equal(run(null).status, 0, 'untouched frozen-shell contract must be green')
const dimensions = [
  'retired-path-resolution',
  'accepted-source-extensions',
  'alias-import-resolution',
  'comment-free-import-detection',
  'renderer-boundary-markers',
  'renderer-retired-imports',
]
for (const dimension of dimensions) {
  assert.notEqual(run(dimension).status, 0, `negative regression ${dimension} stayed green`)
}
assert.equal(run(null).status, 0, 'restored frozen-shell contract must be green')
console.log(`registered frozen-shell red-green runner covered ${dimensions.length} dimensions`)
