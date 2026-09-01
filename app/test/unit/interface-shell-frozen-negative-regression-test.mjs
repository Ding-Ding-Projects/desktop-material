import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const testFile = join(root, 'app', 'test', 'unit', 'interface-shell-frozen-test.ts')
const loader = process.env.FROZEN_TS_LOADER ?? 'tsx'
const patterns = {
  'retired-path-resolution': 'loads a complete',
  'accepted-source-extensions': 'loads a complete',
  'alias-import-resolution': 'loads a complete',
  'comment-free-import-detection': 'current renderer entry',
  'renderer-boundary-markers': 'current renderer entry',
  'renderer-retired-imports': 'current renderer entry',
}
const run = dimension => spawnSync(process.execPath, ['--import', loader, `--test-name-pattern=${dimension ? patterns[dimension] : 'loads a complete'}`, '--test', testFile], {
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
