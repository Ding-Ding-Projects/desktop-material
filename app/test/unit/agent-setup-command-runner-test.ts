import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  AgentSetupCommandRunner,
  BoundedAgentSetupProcessExecutor,
  FileSystemAgentSetupDirectoryValidator,
  buildAgentSetupEnvironment,
  resolveAgentSetupGitTool,
} from '../../src/main-process/agent-setup-command-runner'

const temporaryDirectories = new Array<string>()

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

const worktree = 'C:\\work\\created-by-git'
const repositoryPath = 'C:\\work\\repository'
const branchName = 'created-by-git'
const requestIdentity = { repositoryPath, branchName }
const validDirectory = { isGitWorktree: async () => true }

describe('AgentSetupCommandRunner', () => {
  it('does not pull the renderer agent-session barrel into main startup', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'main-process',
        'agent-setup-command-runner.ts'
      ),
      'utf8'
    )

    assert.match(source, /from '\.\.\/lib\/agent-sessions\/setup-commands'/)
    assert.doesNotMatch(source, /from '\.\.\/lib\/agent-sessions'/)
  })

  it('runs enabled commands sequentially in the exact canonical Git path', async () => {
    const calls = new Array<{
      executable: string
      args: ReadonlyArray<string>
      path: string
    }>()
    const events = new Array<'validate' | 'execute'>()
    let concurrent = 0
    let maximumConcurrent = 0
    const runner = new AgentSetupCommandRunner(
      {
        execute: async (command, path, _signal, validateWorktree) => {
          assert.strictEqual(await validateWorktree(), true)
          events.push('execute')
          concurrent++
          maximumConcurrent = Math.max(maximumConcurrent, concurrent)
          calls.push({
            executable: command.executable,
            args: command.args,
            path,
          })
          await Promise.resolve()
          concurrent--
          return { status: 'succeeded' }
        },
        killAll: async () => undefined,
      },
      {
        isGitWorktree: async (path, repository, branch) => {
          assert.deepStrictEqual(
            [path, repository, branch],
            [worktree, repositoryPath, branchName]
          )
          events.push('validate')
          return true
        },
      }
    )

    const result = await runner.run(
      {
        operationId: 'setup-1',
        ...requestIdentity,
        worktreePath: worktree,
        commands: [
          { enabled: true, executable: 'git', args: ['status'] },
          { enabled: false, executable: 'node', args: ['disabled.js'] },
          { enabled: true, executable: 'node', args: ['setup.js', '--check'] },
        ],
      },
      new AbortController().signal
    )

    assert.deepStrictEqual(result, { status: 'succeeded', completed: 2 })
    assert.strictEqual(maximumConcurrent, 1)
    for (const [index, event] of events.entries()) {
      if (event === 'execute') {
        assert.strictEqual(events[index - 1], 'validate')
      }
    }
    assert.deepStrictEqual(calls, [
      { executable: 'git', args: ['status'], path: worktree },
      { executable: 'node', args: ['setup.js', '--check'], path: worktree },
    ])
  })

  it('stops before the next command after failure or cancellation', async () => {
    for (const terminal of [
      { status: 'failed' as const, reason: 'exit-code' as const },
      { status: 'cancelled' as const },
    ]) {
      let launches = 0
      const runner = new AgentSetupCommandRunner(
        {
          execute: async () => {
            launches++
            return terminal
          },
          killAll: async () => undefined,
        },
        validDirectory
      )
      const result = await runner.run(
        {
          operationId: 'setup-terminal',
          ...requestIdentity,
          worktreePath: worktree,
          commands: [
            { enabled: true, executable: 'git', args: ['status'] },
            { enabled: true, executable: 'node', args: ['never.js'] },
          ],
        },
        new AbortController().signal
      )
      assert.strictEqual(result.status, terminal.status)
      assert.strictEqual(launches, 1)
      assert.strictEqual(result.completed, 0)
      assert.strictEqual(result.commandIndex, 0)
    }
  })

  it('revalidates repository and branch identity before every spawn', async () => {
    let validations = 0
    let launches = 0
    const runner = new AgentSetupCommandRunner(
      {
        execute: async (_command, _path, _signal, validateWorktree) => {
          assert.strictEqual(await validateWorktree(), true)
          launches++
          return { status: 'succeeded' }
        },
        killAll: async () => undefined,
      },
      {
        isGitWorktree: async () => ++validations < 4,
      }
    )

    const result = await runner.run(
      {
        operationId: 'identity-changed',
        ...requestIdentity,
        worktreePath: worktree,
        commands: [
          { enabled: true, executable: 'git', args: ['status'] },
          { enabled: true, executable: 'node', args: ['setup.js'] },
        ],
      },
      new AbortController().signal
    )

    assert.deepStrictEqual(result, {
      status: 'failed',
      completed: 1,
      commandIndex: 1,
      reason: 'worktree-unavailable',
    })
    assert.strictEqual(launches, 1)
  })

  it('fails final identity verification without claiming a command failed', async () => {
    let validations = 0
    const runner = new AgentSetupCommandRunner(
      {
        execute: async (_command, _path, _signal, validateWorktree) => {
          assert.strictEqual(await validateWorktree(), true)
          return { status: 'succeeded' }
        },
        killAll: async () => undefined,
      },
      { isGitWorktree: async () => ++validations < 4 }
    )

    assert.deepStrictEqual(
      await runner.run(
        {
          operationId: 'identity-changed-after-command',
          ...requestIdentity,
          worktreePath: worktree,
          commands: [{ enabled: true, executable: 'git', args: ['status'] }],
        },
        new AbortController().signal
      ),
      {
        status: 'failed',
        completed: 1,
        commandIndex: null,
        reason: 'worktree-unavailable',
      }
    )
  })

  it('fails closed before spawning for invalid data or a non-worktree path', async () => {
    let launches = 0
    const executor = {
      execute: async () => {
        launches++
        return { status: 'succeeded' as const }
      },
      killAll: async () => undefined,
    }
    const invalid = new AgentSetupCommandRunner(executor, validDirectory)
    assert.deepStrictEqual(
      await invalid.run(null, new AbortController().signal),
      {
        status: 'failed',
        completed: 0,
        commandIndex: null,
        reason: 'invalid-request',
      }
    )
    assert.deepStrictEqual(
      await invalid.run(
        {
          operationId: 'bad',
          ...requestIdentity,
          worktreePath: worktree,
          commands: [
            { enabled: true, executable: 'node', args: ['--eval', 'bad()'] },
          ],
        },
        new AbortController().signal
      ),
      {
        status: 'failed',
        completed: 0,
        commandIndex: null,
        reason: 'invalid-request',
      }
    )
    const missing = new AgentSetupCommandRunner(executor, {
      isGitWorktree: async () => false,
    })
    assert.strictEqual(
      (
        await missing.run(
          {
            operationId: 'missing',
            ...requestIdentity,
            worktreePath: worktree,
            commands: [{ enabled: true, executable: 'git', args: ['status'] }],
          },
          new AbortController().signal
        )
      ).status,
      'failed'
    )
    assert.strictEqual(launches, 0)
  })

  it('aborts active work and refuses new work once shutdown begins', async () => {
    let executions = 0
    let kills = 0
    const runner = new AgentSetupCommandRunner(
      {
        execute: async (_command, _path, signal) => {
          executions++
          await new Promise<void>(resolve =>
            signal.addEventListener('abort', () => resolve(), { once: true })
          )
          return { status: 'cancelled' }
        },
        killAll: async () => {
          kills++
        },
      },
      validDirectory
    )
    const request = {
      operationId: 'shutdown',
      ...requestIdentity,
      worktreePath: worktree,
      commands: [
        { enabled: true, executable: 'git' as const, args: ['status'] },
      ],
    }
    const active = runner.run(request, new AbortController().signal)
    await new Promise<void>(resolve => setImmediate(resolve))
    await runner.killAll()

    assert.strictEqual((await active).status, 'cancelled')
    assert.strictEqual(executions, 1)
    assert.strictEqual(kills, 2)
    assert.strictEqual(
      (await runner.run(request, new AbortController().signal)).status,
      'cancelled'
    )
    assert.strictEqual(executions, 1)
  })
})

describe('FileSystemAgentSetupDirectoryValidator', () => {
  it('accepts only a registered linked-worktree pointer and backpointer', async () => {
    // Windows-hosted runners can expose RUNNER_TEMP through a junction. Build
    // this synthetic worktree from the canonical temporary path so the test
    // exercises the linked-worktree pointers instead of failing the validator's
    // deliberate outer reparse-path guard.
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'desktop-material-worktree-'))
    )
    temporaryDirectories.push(root)
    const worktreePath = join(root, 'agent')
    const repositoryPath = join(root, 'main')
    const administrativePath = join(
      repositoryPath,
      '.git',
      'worktrees',
      'agent'
    )
    await mkdir(worktreePath, { recursive: true })
    await mkdir(administrativePath, { recursive: true })
    await writeFile(
      join(worktreePath, '.git'),
      `gitdir: ${administrativePath}\n`,
      'utf8'
    )
    await writeFile(
      join(administrativePath, 'gitdir'),
      `${join(worktreePath, '.git')}\n`,
      'utf8'
    )
    await writeFile(
      join(administrativePath, 'HEAD'),
      'ref: refs/heads/agent\n',
      'utf8'
    )
    const validator = new FileSystemAgentSetupDirectoryValidator()

    assert.strictEqual(
      await validator.isGitWorktree(worktreePath, repositoryPath, 'agent'),
      true
    )
    assert.strictEqual(
      await validator.isGitWorktree(worktreePath, repositoryPath, 'replaced'),
      false
    )

    const otherRepositoryPath = join(root, 'other')
    await mkdir(join(otherRepositoryPath, '.git'), { recursive: true })
    assert.strictEqual(
      await validator.isGitWorktree(worktreePath, otherRepositoryPath, 'agent'),
      false
    )

    await writeFile(
      join(administrativePath, 'gitdir'),
      `${join(root, 'somewhere-else', '.git')}\n`,
      'utf8'
    )
    assert.strictEqual(
      await validator.isGitWorktree(worktreePath, repositoryPath, 'agent'),
      false
    )
  })

  it('rejects a main checkout whose .git marker is a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-material-main-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, '.git'))

    assert.strictEqual(
      await new FileSystemAgentSetupDirectoryValidator().isGitWorktree(
        root,
        root,
        'main'
      ),
      false
    )
  })
})

describe('BoundedAgentSetupProcessExecutor', () => {
  async function script(source: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-material-setup-'))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, '.git'))
    const path = join(directory, 'setup-script.js')
    await writeFile(path, source, 'utf8')
    return path
  }

  it('revalidates after discovery before the shell-free spawn', async () => {
    const blocked = await script('process.exit(42)')
    const result = await new BoundedAgentSetupProcessExecutor().execute(
      { enabled: true, executable: 'node', args: [blocked] },
      dirname(blocked),
      new AbortController().signal,
      async () => false
    )

    assert.deepStrictEqual(result, {
      status: 'failed',
      reason: 'worktree-unavailable',
    })
  })

  it('uses fixed private-output and timeout limits without returning output', async () => {
    const noisy = await script(
      "process.stdout.write('private-output'.repeat(1000)); setInterval(() => {}, 1000)"
    )
    const noisyResult = await new BoundedAgentSetupProcessExecutor(
      30_000,
      32
    ).execute(
      { enabled: true, executable: 'node', args: [noisy] },
      dirname(noisy),
      new AbortController().signal,
      async () => true
    )
    assert.deepStrictEqual(noisyResult, {
      status: 'failed',
      reason: 'output-limit',
    })
    assert.doesNotMatch(JSON.stringify(noisyResult), /private-output/)

    const slow = await script('setInterval(() => {}, 1000)')
    const slowResult = await new BoundedAgentSetupProcessExecutor(
      50,
      1024
    ).execute(
      { enabled: true, executable: 'node', args: [slow] },
      dirname(slow),
      new AbortController().signal,
      async () => true
    )
    assert.deepStrictEqual(slowResult, { status: 'failed', reason: 'timeout' })
  })

  it('terminates the owned process tree when its AbortSignal fires', async () => {
    const slow = await script('setInterval(() => {}, 1000)')
    const controller = new AbortController()
    const execution = new BoundedAgentSetupProcessExecutor(2_000, 1024).execute(
      { enabled: true, executable: 'node', args: [slow] },
      dirname(slow),
      controller.signal,
      async () => true
    )
    setTimeout(() => controller.abort(), 40)
    assert.deepStrictEqual(await execution, { status: 'cancelled' })
  })

  it('strips credential variables while preserving Windows tool discovery', () => {
    assert.deepStrictEqual(
      buildAgentSetupEnvironment({
        Path: 'C:\\Tools',
        PATHEXT: '.EXE;.COM',
        USERPROFILE: 'C:\\Users\\person',
        GH_TOKEN: 'never-copy-this',
        API_KEY: 'also-never-copy-this',
      }),
      {
        CI: 'true',
        Path: 'C:\\Tools',
        PATHEXT: '.EXE;.COM',
        USERPROFILE: 'C:\\Users\\person',
      }
    )
  })

  it('selects packaged Dugite Git even when user PATH has no Git', () => {
    const runtimeDirectory = join('C:\\', 'DesktopMaterial', 'resources')
    const result = resolveAgentSetupGitTool(
      { PATH: 'C:\\NoGitHere', PATHEXT: '.EXE' },
      runtimeDirectory
    )

    assert.strictEqual(
      result.executable,
      join(runtimeDirectory, 'git', 'cmd', 'git.exe')
    )
    assert.notStrictEqual(result.executable, 'git')
    assert.match(
      result.env.GIT_EXEC_PATH,
      /git[\\/](?:mingw64|clangarm64)[\\/]libexec[\\/]git-core/i
    )
  })
})
