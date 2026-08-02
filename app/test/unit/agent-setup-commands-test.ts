import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  AgentSetupExecutableIds,
  IAgentSetupCommandStorage,
  MaximumAgentSetupArguments,
  MaximumAgentSetupCommands,
  MaximumAgentSetupTokenLength,
  agentSetupCommandsStorageKey,
  createAgentSetupRepositoryIdentity,
  isExpectedAgentSetupWorktree,
  loadAgentSetupCommands,
  resumeAgentSetupCommands,
  saveAgentSetupCommands,
  validateAgentSetupCommands,
} from '../../src/lib/agent-sessions'

class MemoryStorage implements IAgentSetupCommandStorage {
  public readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

function kinds(commands: unknown): ReadonlyArray<string> {
  return validateAgentSetupCommands(commands).map(problem => problem.kind)
}

describe('Agent setup command validation', () => {
  it('keeps the executable catalog to native allow-listed identifiers', () => {
    assert.deepStrictEqual(AgentSetupExecutableIds, [
      'git',
      'node',
      'python',
      'py',
      'dotnet',
      'cargo',
      'go',
      'java',
    ])
    assert.deepStrictEqual(
      kinds([{ enabled: true, executable: 'git', args: ['status'] }]),
      []
    )
    assert.deepStrictEqual(
      kinds([
        {
          enabled: true,
          executable: 'C:\\tools\\setup.exe',
          args: ['run'],
        },
      ]),
      ['invalid-executable']
    )
  })

  it('rejects command strings, cwd overrides, shell syntax, and expansion', () => {
    const candidates = [
      ['node', ['--eval', 'doSomething()'], 'argument-command-string'],
      ['python', ['-c', 'print(1)'], 'argument-command-string'],
      ['python', ['-cprint(1)'], 'argument-command-string'],
      ['py', ['-cprint(1)'], 'argument-command-string'],
      [
        'git',
        ['-c', 'alias.setup=!calc.exe', 'setup'],
        'argument-command-string',
      ],
      ['git', ['--exec-path=C:\\tools', 'status'], 'argument-command-string'],
      ['git', ['-C', '..', 'status'], 'argument-cwd-override'],
      ['git', ['-C..', 'status'], 'argument-cwd-override'],
      ['go', ['-C..', 'test'], 'argument-cwd-override'],
      ['git', ['--work-tree=..', 'status'], 'argument-cwd-override'],
      ['node', ['scripts/setup.js', '&&'], 'argument-shell-syntax'],
      ['node', ['scripts/$USER.js'], 'argument-environment-expansion'],
      [
        'node',
        ['scripts/%USERPROFILE%/setup.js'],
        'argument-environment-expansion',
      ],
    ] as const

    for (const [executable, args, expected] of candidates) {
      assert.ok(
        kinds([{ enabled: true, executable, args }]).includes(expected),
        `${executable} ${args.join(' ')} should report ${expected}`
      )
    }
  })

  it('rejects credential-shaped and control-bearing argv without echoing it', () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345'
    const problems = validateAgentSetupCommands([
      {
        enabled: true,
        executable: 'node',
        args: [
          'scripts/setup.js',
          `--token=${secret}`,
          '--password-file=auth.txt',
          '  --secret=hidden',
          'account:password',
          'bad\nvalue',
        ],
      },
    ])
    assert.deepStrictEqual(
      problems.map(problem => problem.kind),
      [
        'argument-credential',
        'argument-credential',
        'argument-credential',
        'argument-credential',
        'argument-control-character',
      ]
    )
    assert.doesNotMatch(JSON.stringify(problems), /ghp_|bad/)
  })

  it('bounds command, argument, and token counts even for disabled rows', () => {
    assert.deepStrictEqual(
      kinds(
        Array.from({ length: MaximumAgentSetupCommands + 1 }, () => ({
          enabled: false,
          executable: 'git',
          args: ['status'],
        }))
      ),
      ['too-many-commands']
    )
    assert.ok(
      kinds([
        {
          enabled: false,
          executable: 'node',
          args: Array.from(
            { length: MaximumAgentSetupArguments + 1 },
            () => 'x'
          ),
        },
      ]).includes('too-many-arguments')
    )
    assert.ok(
      kinds([
        {
          enabled: false,
          executable: 'node',
          args: ['x'.repeat(MaximumAgentSetupTokenLength + 1)],
        },
      ]).includes('argument-too-long')
    )
  })

  it('identifies an empty token separately from a command with no argv', () => {
    assert.deepStrictEqual(
      validateAgentSetupCommands([
        { enabled: true, executable: 'git', args: ['status', ''] },
      ]),
      [{ kind: 'missing-argument', commandIndex: 0, argumentIndex: 1 }]
    )
    assert.deepStrictEqual(
      validateAgentSetupCommands([
        { enabled: true, executable: 'git', args: [] },
      ]),
      [{ kind: 'missing-argument', commandIndex: 0 }]
    )
  })

  it('resumes only an unchanged successfully completed command prefix', () => {
    const commands = [
      { enabled: true, executable: 'git' as const, args: ['status'] },
      { enabled: false, executable: 'node' as const, args: ['disabled.js'] },
      { enabled: true, executable: 'node' as const, args: ['setup.js'] },
    ]
    assert.deepStrictEqual(resumeAgentSetupCommands(commands, commands, 2), [
      { enabled: false, executable: 'git', args: ['status'] },
      { enabled: false, executable: 'node', args: ['disabled.js'] },
      { enabled: true, executable: 'node', args: ['setup.js'] },
    ])

    const changed = commands.map((command, index) =>
      index === 2 ? { ...command, args: ['changed.js'] } : command
    )
    assert.deepStrictEqual(resumeAgentSetupCommands(changed, commands, 2), [
      { enabled: false, executable: 'git', args: ['status'] },
      { enabled: false, executable: 'node', args: ['disabled.js'] },
      { enabled: true, executable: 'node', args: ['changed.js'] },
    ])

    const changedCompletedPrefix = commands.map((command, index) =>
      index === 0 ? { ...command, args: ['changed'] } : command
    )
    assert.deepStrictEqual(
      resumeAgentSetupCommands(changedCompletedPrefix, commands, 2),
      changedCompletedPrefix
    )
  })

  it('resumes only the exact live linked worktree and expected branch', () => {
    const pending = { path: 'C:\\work\\agent', branchName: 'agent' }
    const candidate = {
      path: 'c:/WORK/agent',
      branch: 'refs/heads/agent',
      type: 'linked' as const,
      isPrunable: false,
    }
    assert.strictEqual(isExpectedAgentSetupWorktree(pending, candidate), true)
    assert.strictEqual(
      isExpectedAgentSetupWorktree(pending, {
        ...candidate,
        branch: 'refs/heads/replaced',
      }),
      false
    )
    assert.strictEqual(
      isExpectedAgentSetupWorktree(pending, {
        ...candidate,
        type: 'main',
      }),
      false
    )
    assert.strictEqual(
      isExpectedAgentSetupWorktree(pending, {
        ...candidate,
        isPrunable: true,
      }),
      false
    )
  })
})

describe('Agent setup command persistence', () => {
  it('propagates storage access failures so creation can fail closed', () => {
    const identity = createAgentSetupRepositoryIdentity(6, 'C:\\Work\\Repo')
    assert.throws(() =>
      loadAgentSetupCommands(
        {
          getItem: () => {
            throw new Error('storage denied')
          },
          setItem: () => undefined,
          removeItem: () => undefined,
        },
        identity
      )
    )
  })

  it('round-trips a versioned reviewed list only for the exact repository', () => {
    const storage = new MemoryStorage()
    const first = createAgentSetupRepositoryIdentity(7, 'C:/Work/First/')
    const second = createAgentSetupRepositoryIdentity(8, 'C:/Work/Second')
    const commands = [
      { enabled: true, executable: 'git' as const, args: ['status'] },
      {
        enabled: false,
        executable: 'node' as const,
        args: ['scripts/setup.js'],
      },
    ]

    saveAgentSetupCommands(storage, first, commands)
    assert.deepStrictEqual(loadAgentSetupCommands(storage, first), commands)
    assert.deepStrictEqual(loadAgentSetupCommands(storage, second), [])

    const firstRaw = storage.getItem(agentSetupCommandsStorageKey(first))!
    storage.setItem(agentSetupCommandsStorageKey(second), firstRaw)
    assert.deepStrictEqual(loadAgentSetupCommands(storage, second), [])
    assert.strictEqual(
      storage.getItem(agentSetupCommandsStorageKey(second)),
      null
    )
  })

  it('drops corrupt, legacy, oversized, and invalid stored documents', () => {
    const identity = createAgentSetupRepositoryIdentity(9, 'C:\\Work\\Repo')
    const key = agentSetupCommandsStorageKey(identity)
    const values = [
      '{bad json',
      JSON.stringify({
        version: 0,
        repositoryIdentity: identity,
        commands: [],
      }),
      JSON.stringify({
        version: 1,
        repositoryIdentity: identity,
        commands: [{ enabled: true, executable: 'powershell', args: ['x'] }],
      }),
      'x'.repeat(40 * 1024),
    ]

    for (const value of values) {
      const storage = new MemoryStorage()
      storage.setItem(key, value)
      assert.deepStrictEqual(loadAgentSetupCommands(storage, identity), [])
      assert.strictEqual(storage.getItem(key), null)
    }
  })

  it('removes the repository document when the reviewed list is empty', () => {
    const storage = new MemoryStorage()
    const identity = createAgentSetupRepositoryIdentity(10, 'C:\\Work\\Repo')
    saveAgentSetupCommands(storage, identity, [
      { enabled: true, executable: 'git', args: ['status'] },
    ])
    saveAgentSetupCommands(storage, identity, [])
    assert.strictEqual(
      storage.getItem(agentSetupCommandsStorageKey(identity)),
      null
    )
  })
})
