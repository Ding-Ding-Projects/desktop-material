import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'

for (const explicitSelection of [true, false]) {
  it(`rejects an empty ${explicitSelection ? 'explicit' : 'default'} selection without running unrelated tests`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-empty-selection-'))
    try {
      for (const directory of [
        'script',
        'app/test/unit',
        'empty-selection',
        'node_modules/tsx',
      ]) {
        await mkdir(join(root, directory), { recursive: true })
      }
      // Copy the actual runner under a non-test filename so an unfixed runner
      // demonstrates default discovery without recursively invoking itself.
      const runner = join(root, 'script', 'runner.mjs')
      await copyFile(new URL('./test.mjs', import.meta.url), runner)
      await writeFile(join(root, '.test.env'), '')
      await writeFile(join(root, 'app/test/globals.mts'), '')
      await writeFile(
        join(root, 'node_modules/tsx/package.json'),
        JSON.stringify({ name: 'tsx', type: 'module', exports: './index.mjs' })
      )
      await writeFile(join(root, 'node_modules/tsx/index.mjs'), '')
      const canary = join(root, 'unexpected-test-ran')
      await writeFile(
        join(root, 'unrelated.test.mjs'),
        `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(canary)}, 'ran');
`
      )
      const env = { ...process.env, GITHUB_ACTIONS: '' }
      delete env.NODE_TEST_CONTEXT
      const result = spawnSync(
        process.execPath,
        [runner, ...(explicitSelection ? ['empty-selection'] : [])],
        { cwd: root, env, encoding: 'utf8', timeout: 15_000 }
      )
      assert.equal(result.error, undefined, result.error?.message)
      assert.equal(existsSync(canary), false, 'unrelated test was executed')
      assert.equal(result.status, 1, result.stdout + result.stderr)
      assert.match(result.stderr, /No test files found/)
      assert.ok(
        result.stderr.includes(
          explicitSelection
            ? 'empty-selection'
            : join(root, 'app', 'test', 'unit')
        )
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
