import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(__dirname, '..')
const prepareScript = join(
  projectRoot,
  '.codex',
  'verification',
  'prepare_submodule_navigation_fixture.ps1'
)
const cloneScript = join(
  projectRoot,
  '.codex',
  'verification',
  'clone_p0_fixture.ps1'
)

interface ISubmodulePreparationReceipt {
  readonly fixture: string
  readonly head: string
  readonly preparation: 'created' | 'reused'
  readonly submodules: ReadonlyArray<string>
  readonly children: ReadonlyArray<{
    readonly name: string
    readonly path: string
    readonly head: string
    readonly initialized: boolean
  }>
  readonly clean: boolean
  readonly gitmodules: string
}

async function git(
  workingDirectory: string,
  ...args: ReadonlyArray<string>
): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', workingDirectory, ...args],
    {
      encoding: 'utf8',
      windowsHide: true,
    }
  )
  return stdout.trim()
}

async function createBaseFixture(root: string): Promise<string> {
  const fixture = join(root, 'fixture')
  await mkdir(fixture)
  await execFileAsync(
    'git',
    ['init', '--quiet', '-b', 'feature/material-verification', fixture],
    {
      windowsHide: true,
    }
  )
  await git(fixture, 'config', 'user.name', 'Material Fixture')
  await git(fixture, 'config', 'user.email', 'material-fixture@example.invalid')
  await writeFile(join(fixture, 'README.md'), 'Deterministic parent fixture\n')
  await git(fixture, 'add', '--', 'README.md')
  await execFileAsync(
    'git',
    ['-C', fixture, 'commit', '--quiet', '-m', 'Initialize parent fixture'],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-07-18T19:55:00Z',
        GIT_COMMITTER_DATE: '2026-07-18T19:55:00Z',
      },
      windowsHide: true,
    }
  )
  return fixture
}

async function runPreparation(
  root: string
): Promise<ISubmodulePreparationReceipt> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      prepareScript,
      '-RunRoot',
      root,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }
  )
  const output = stdout.trim()
  assert.equal(output.split(/\r?\n/).length, 1, output)
  return JSON.parse(output) as ISubmodulePreparationReceipt
}

async function removeOwnedRoot(root: string): Promise<void> {
  const resolvedRoot = resolve(root)
  const resolvedTemp = resolve(tmpdir())
  const fromTemp = relative(resolvedTemp, resolvedRoot)
  assert.ok(
    fromTemp !== '' &&
      fromTemp !== '..' &&
      !fromTemp.startsWith(`..${sep}`) &&
      !isAbsolute(fromTemp)
  )
  assert.match(
    resolve(root).split(/[\\/]/).at(-1) ?? '',
    /^desktop-material-p0-ui-/
  )
  await rm(resolvedRoot, { recursive: true })
}

describe(
  'P0 fixture provisioning scripts',
  { skip: process.platform !== 'win32' },
  () => {
    it('composes submodule preparation into the clone JSON receipt', async () => {
      const source = await readFile(cloneScript, 'utf8')
      const invocation = source.indexOf(
        '& $submodulePreparationScript -RunRoot $resolvedRoot'
      )
      const receipt = source.indexOf('submoduleFixture = $submoduleReceipt')
      const serialization = source.indexOf(
        'ConvertTo-Json -Depth 7 -Compress',
        receipt
      )

      assert.notEqual(invocation, -1)
      assert.notEqual(receipt, -1)
      assert.notEqual(serialization, -1)
      assert.ok(invocation < receipt && receipt < serialization)
      assert.match(source, /\$submoduleReceiptLines\.Count -ne 1/)
      assert.match(source, /\$submoduleReceiptLines\[0\] \| ConvertFrom-Json/)
    })

    it('creates, reuses, and recreates the exact deterministic topology', async () => {
      const root = await mkdtemp(
        join(tmpdir(), 'desktop-material-p0-ui-provisioning-')
      )
      try {
        let fixture = await createBaseFixture(root)
        const firstBase = await git(fixture, 'rev-parse', 'HEAD')
        const first = await runPreparation(root)
        assert.equal(first.preparation, 'created')
        assert.equal(first.clean, true)
        assert.equal(first.children.length, 2)
        assert.notEqual(first.head, firstBase)
        assert.equal(await git(fixture, 'rev-list', '--count', 'HEAD'), '2')
        assert.deepStrictEqual(
          first.children.map(child => [
            child.name,
            child.path,
            child.initialized,
          ]),
          [
            ['material-widget', 'modules/material-widget', true],
            ['dormant-addon', 'modules/dormant-addon', false],
          ]
        )
        assert.equal(first.submodules.length, 2)
        assert.match(
          first.submodules.join('\n'),
          /^ [0-9a-f]{40} modules\/material-widget/m
        )
        assert.match(
          first.submodules.join('\n'),
          /^-[0-9a-f]{40} modules\/dormant-addon/m
        )

        const second = await runPreparation(root)
        assert.equal(second.preparation, 'reused')
        assert.equal(second.head, first.head)
        assert.equal(await git(fixture, 'rev-list', '--count', 'HEAD'), '2')

        await rm(fixture, { recursive: true })
        fixture = await createBaseFixture(root)
        const recreated = await runPreparation(root)
        assert.equal(recreated.preparation, 'created')
        assert.equal(recreated.head, first.head)
        assert.equal(await git(fixture, 'rev-list', '--count', 'HEAD'), '2')

        const recreatedReplay = await runPreparation(root)
        assert.equal(recreatedReplay.preparation, 'reused')
        assert.equal(recreatedReplay.head, recreated.head)
        assert.equal(await git(fixture, 'status', '--porcelain'), '')

        await writeFile(
          join(root, 'submodule-source', 'material-widget', 'widget.txt'),
          'corrupted child fixture\n'
        )
        await assert.rejects(
          runPreparation(root),
          /Child source worktree is dirty: material-widget/
        )
      } finally {
        await removeOwnedRoot(root)
      }
    })

    it('rejects a partial reusable child repository pair', async () => {
      const root = await mkdtemp(
        join(tmpdir(), 'desktop-material-p0-ui-partial-')
      )
      try {
        await createBaseFixture(root)
        await mkdir(join(root, 'submodule-source', 'material-widget'), {
          recursive: true,
        })
        await assert.rejects(
          runPreparation(root),
          /Child fixture state is partial for material-widget: source=True bare=False/
        )
      } finally {
        await removeOwnedRoot(root)
      }
    })
  }
)
