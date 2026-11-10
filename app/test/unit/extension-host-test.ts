import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'

import { ExtensionHost } from '../../src/main-process/extension-host'

async function withHost(
  run: (host: ExtensionHost, root: string) => Promise<void>
) {
  const root = await mkdtemp(Path.join(tmpdir(), 'dm-extensions-'))
  try {
    await run(
      new ExtensionHost(root, { command: process.execPath, env: {} }),
      root
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function install(
  root: string,
  folder: string,
  manifest: object,
  script: string
) {
  await mkdir(Path.join(root, folder), { recursive: true })
  await writeFile(
    Path.join(root, folder, 'extension.json'),
    JSON.stringify(manifest)
  )
  await writeFile(Path.join(root, folder, 'main.js'), script)
}

const base = {
  manifestVersion: 1,
  version: '1.0.0',
  description: 'A test extension.',
  command: '@app-node',
  args: ['main.js'],
}
const echo = `
const request = JSON.parse(require('fs').readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ protocol: 1, ok: true, title: 'Echo',
  text: JSON.stringify({ request, secret: process.env.DM_TEST_SECRET || null }) }))
`
const context = {
  repositoryPath: '/repo',
  branchName: 'main',
  changedFiles: ['a/b.ts', 'c.md'],
}

describe('extension host', () => {
  it('installs the built-ins, which need consent before they run', async () => {
    await withHost(async host => {
      await host.installBuiltIns()
      const list = await host.list()
      assert.deepEqual(
        list.map(e => e.manifest?.id),
        ['changed-files-summary', 'repository-size-report', 'todo-finder']
      )
      assert.ok(list.every(e => e.builtIn && e.enabled && !e.canRun))

      const refused = await host.run('changed-files-summary', context)
      assert.ok(!refused.ok)
      assert.match(refused.error, /needs your consent/)

      await host.grantConsent('changed-files-summary')
      const result = await host.run('changed-files-summary', context)
      assert.ok(result.ok, result.ok ? '' : result.error)
      assert.equal(result.title, '2 changed files')
      assert.match(result.text, /1 {2}a\//)
    })
  })

  it('runs the TODO finder against a real folder', async () => {
    await withHost(async (host, root) => {
      await host.installBuiltIns()
      const repo = Path.join(root, 'repo-under-test')
      await mkdir(Path.join(repo, 'src'), { recursive: true })
      await writeFile(
        Path.join(repo, 'src', 'a.ts'),
        'const x = 1\n// TODO: tidy this\n'
      )
      await host.grantConsent('todo-finder')
      const result = await host.run('todo-finder', {
        ...context,
        repositoryPath: repo,
      })
      assert.ok(result.ok, result.ok ? '' : result.error)
      assert.equal(result.title, '1 notes')
      assert.match(result.text, /a\.ts:2 {2}TODO tidy this/)
    })
  })

  it('gives an extension only its permitted context and a scrubbed environment', async () => {
    await withHost(async (host, root) => {
      await install(
        root,
        'echo',
        {
          ...base,
          id: 'echo-test',
          name: 'Echo',
          permissions: ['branch-name'],
        },
        echo
      )
      process.env.DM_TEST_SECRET = 'must-not-leak'
      try {
        await host.grantConsent('echo-test')
        const result = await host.run('echo-test', context)
        assert.ok(result.ok, result.ok ? '' : result.error)
        const seen = JSON.parse(result.text)
        assert.equal(seen.secret, null)
        assert.equal(seen.request.branchName, 'main')
        assert.equal(seen.request.repositoryPath, undefined)
        assert.equal(seen.request.changedFiles, undefined)
      } finally {
        delete process.env.DM_TEST_SECRET
      }
    })
  })

  it('asks again when an update adds a permission, and honours the switch', async () => {
    await withHost(async (host, root) => {
      await install(
        root,
        'echo',
        { ...base, id: 'echo-test', name: 'Echo', permissions: [] },
        echo
      )
      await host.grantConsent('echo-test')
      assert.equal((await host.list())[0].canRun, true)

      await install(
        root,
        'echo',
        {
          ...base,
          id: 'echo-test',
          name: 'Echo',
          version: '1.1.0',
          permissions: ['changed-files'],
        },
        echo
      )
      const updated = (await host.list())[0]
      assert.deepEqual(updated.needsConsent, ['changed-files'])
      assert.equal(updated.canRun, false)

      await host.grantConsent('echo-test')
      await host.setEnabled('echo-test', false)
      const off = await host.run('echo-test', context)
      assert.ok(!off.ok)
      assert.match(off.error, /switched off/)
    })
  })

  it('stops an extension that hangs, floods or answers badly', async () => {
    await withHost(async (host, root) => {
      const add = async (id: string, script: string) => {
        await install(
          root,
          id,
          { ...base, id, name: id, permissions: [] },
          script
        )
        await host.grantConsent(id)
      }
      await add('hangs-test', 'setInterval(() => {}, 1000)')
      await add('floods-test', "process.stdout.write('x'.repeat(400000))")
      await add('garbage-test', "process.stdout.write('hello')")

      const hung = await host.run('hangs-test', context, 400)
      assert.ok(!hung.ok)
      assert.match(hung.error, /did not finish/)
      const flooded = await host.run('floods-test', context)
      assert.ok(!flooded.ok)
      assert.match(flooded.error, /more than 256 KB/)
      const garbage = await host.run('garbage-test', context)
      assert.ok(!garbage.ok)
      assert.match(garbage.error, /did not answer with JSON/)
    })
  })

  it('lists a broken folder with its reasons instead of hiding it', async () => {
    await withHost(async (host, root) => {
      await mkdir(Path.join(root, 'empty'))
      await install(root, 'bad', { id: 'x' }, '')
      const list = await host.list()
      assert.equal(list.length, 2)
      assert.ok(
        list.every(e => e.manifest === null && e.errors.length > 0 && !e.canRun)
      )
    })
  })
})
