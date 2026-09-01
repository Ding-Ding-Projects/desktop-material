import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable, Writable } from 'stream'
import { exec } from 'dugite'

import {
  HookStdinTooLargeError,
  MaximumHookStdinBytes,
  spoolHookStdinToFile,
} from '../../../src/lib/hooks/hook-stdin-spool'

async function temporaryDirectory(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), 'desktop-hook-stdin-test-'))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

async function runGit(cwd: string, args: ReadonlyArray<string>) {
  const result = await exec([...args], cwd)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout
}

/**
 * A repository whose executable `pre-push` hook reads its ref lines from
 * standard input, exactly like the stock `git lfs pre-push` hook does.
 */
async function repositoryWithStdinReadingPrePushHook(t: TestContext) {
  const root = await temporaryDirectory(t)
  await runGit(root, ['init', '--initial-branch=main', '.'])
  await runGit(root, ['config', 'user.name', 'Hook Test'])
  await runGit(root, ['config', 'user.email', 'hook@example.invalid'])
  await writeFile(join(root, 'file.txt'), 'contents\n')
  await runGit(root, ['add', '--', 'file.txt'])
  await runGit(root, ['commit', '-m', 'base'])

  const hooks = join(root, '.git', 'hooks')
  await mkdir(hooks, { recursive: true })
  const hookPath = join(hooks, 'pre-push')
  // `cat` on its own reads fd 0; the `< /dev/stdin` line additionally proves the
  // hook can re-open its own standard input, which is what the bundled MSYS
  // shell could not do when fd 0 was an anonymous pipe.
  await writeFile(
    hookPath,
    [
      '#!/bin/sh',
      'echo "ARGS:$*" >&2',
      'while read -r line; do echo "REF:$line" >&2; done < /dev/stdin',
      'exit 0',
      '',
    ].join('\n')
  )
  await chmod(hookPath, 0o755)
  return root
}

describe('hooks/hook-stdin-spool', () => {
  it('spools a payload to a real file and cleans it up', async () => {
    const payload = 'refs/heads/main aaa refs/heads/main bbb\n'
    const spooled = await spoolHookStdinToFile(Readable.from([payload]))
    try {
      assert.equal(spooled.byteLength, Buffer.byteLength(payload))
      assert.equal(await readFile(spooled.path, 'utf8'), payload)
    } finally {
      await spooled.dispose()
    }
    await assert.rejects(() => readFile(spooled.path, 'utf8'))
  })

  it('streams multiple chunks in order', async () => {
    const spooled = await spoolHookStdinToFile(
      Readable.from([
        Buffer.from('one\n'),
        Buffer.from('two\n'),
        Buffer.from('three\n'),
      ])
    )
    try {
      assert.equal(await readFile(spooled.path, 'utf8'), 'one\ntwo\nthree\n')
      assert.equal(spooled.byteLength, 14)
    } finally {
      await spooled.dispose()
    }
  })

  it('handles an empty payload without inventing content', async () => {
    const spooled = await spoolHookStdinToFile(Readable.from([]))
    try {
      assert.equal(spooled.byteLength, 0)
      assert.equal(await readFile(spooled.path, 'utf8'), '')
    } finally {
      await spooled.dispose()
    }
  })

  it('refuses a payload above the budget and removes the partial spool', async () => {
    const directories = new Array<string>()
    await assert.rejects(
      () =>
        spoolHookStdinToFile(
          Readable.from([Buffer.alloc(8), Buffer.alloc(8)]),
          12,
          {
            makeDirectory: async () => {
              const path = await mkdtemp(
                join(tmpdir(), 'desktop-hook-stdin-budget-')
              )
              directories.push(path)
              return path
            },
          }
        ),
      (error: unknown) =>
        error instanceof HookStdinTooLargeError && error.maximumBytes === 12
    )
    assert.equal(directories.length, 1)
    await assert.rejects(() => readFile(join(directories[0], 'stdin'), 'utf8'))
  })

  it('accepts the exact byte budget without buffering beyond it', async () => {
    const payload = Buffer.alloc(12, 7)
    const spooled = await spoolHookStdinToFile(Readable.from([payload]), 12)
    try {
      assert.equal(spooled.byteLength, payload.byteLength)
      assert.deepEqual(await readFile(spooled.path), payload)
    } finally {
      await spooled.dispose()
    }
  })

  it('cleans up after an input stream error', async () => {
    let directory: string | undefined
    const stdin = new Readable({
      read() {
        this.destroy(new Error('stdin exploded'))
      },
    })

    await assert.rejects(
      () =>
        spoolHookStdinToFile(stdin, MaximumHookStdinBytes, {
          makeDirectory: async () => {
            directory = await mkdtemp(
              join(tmpdir(), 'desktop-hook-stdin-error-')
            )
            return directory
          },
        }),
      /stdin exploded/
    )
    assert.ok(directory)
    await assert.rejects(() => readFile(join(directory as string, 'stdin')))
  })

  it('cleans up after a sink stream error', async () => {
    let directory: string | undefined
    const removeCalls: string[] = []
    const sink = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('sink exploded'))
      },
    })

    await assert.rejects(
      () =>
        spoolHookStdinToFile(
          Readable.from(['payload']),
          MaximumHookStdinBytes,
          {
            makeDirectory: async () => {
              directory = await mkdtemp(
                join(tmpdir(), 'desktop-hook-stdin-sink-')
              )
              return directory
            },
            createSink: () => sink,
            removeDirectory: async path => {
              removeCalls.push(path)
              await rm(path, { recursive: true, force: true })
            },
          }
        ),
      /sink exploded/
    )
    assert.ok(directory)
    assert.deepEqual(removeCalls, [directory])
  })

  it('rejects a non-positive budget', async () => {
    await assert.rejects(
      () => spoolHookStdinToFile(Readable.from(['x']), 0),
      RangeError
    )
    assert.ok(MaximumHookStdinBytes > 0)
  })

  it('dispose is idempotent and never throws', async () => {
    let removeCount = 0
    const spooled = await spoolHookStdinToFile(
      Readable.from(['x']),
      MaximumHookStdinBytes,
      {
        removeDirectory: async path => {
          removeCount += 1
          await rm(path, { recursive: true, force: true })
        },
      }
    )
    await spooled.dispose()
    await spooled.dispose()
    assert.equal(removeCount, 1)
  })

  it('does not create a directory when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let makeDirectoryCalls = 0

    await assert.rejects(
      () =>
        spoolHookStdinToFile(
          Readable.from(['payload']),
          MaximumHookStdinBytes,
          {
            makeDirectory: async () => {
              makeDirectoryCalls += 1
              return mkdtemp(join(tmpdir(), 'desktop-hook-stdin-early-abort-'))
            },
          },
          controller.signal
        ),
      (error: unknown) => error instanceof Error && error.name === 'AbortError'
    )
    assert.equal(makeDirectoryCalls, 0)
  })

  it('aborts a pending spool and removes its private directory', async () => {
    const controller = new AbortController()
    let directory: string | undefined
    const stdin = new Readable({ read() {} })
    const pending = spoolHookStdinToFile(
      stdin,
      MaximumHookStdinBytes,
      {
        makeDirectory: async () => {
          directory = await mkdtemp(join(tmpdir(), 'desktop-hook-stdin-abort-'))
          return directory
        },
      },
      controller.signal
    )

    await new Promise<void>(resolve => setImmediate(resolve))
    controller.abort()

    await assert.rejects(
      pending,
      (error: unknown) => error instanceof Error && error.name === 'AbortError'
    )
    assert.ok(directory)
    await assert.rejects(() =>
      readFile(join(directory as string, 'stdin'), 'utf8')
    )
    await rm(directory as string, { recursive: true, force: true })
  })

  it('removes a directory created after abort during directory allocation', async () => {
    const controller = new AbortController()
    let resolveDirectory: (path: string) => void = () => {}
    const directoryPromise = new Promise<string>(resolve => {
      resolveDirectory = resolve
    })
    const pending = spoolHookStdinToFile(
      Readable.from(['payload']),
      MaximumHookStdinBytes,
      { makeDirectory: () => directoryPromise },
      controller.signal
    )

    controller.abort()
    const directory = await mkdtemp(join(tmpdir(), 'desktop-hook-stdin-late-'))
    resolveDirectory(directory)

    await assert.rejects(
      pending,
      (error: unknown) => error instanceof Error && error.name === 'AbortError'
    )
    await assert.rejects(() => access(directory))
  })

  it('lets the bundled Git run a stdin-reading pre-push hook', async t => {
    const root = await repositoryWithStdinReadingPrePushHook(t)
    const payload =
      'refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 0000000000000000000000000000000000000000\n'
    const spooled = await spoolHookStdinToFile(Readable.from([payload]))
    try {
      const result = await exec(
        [
          'hook',
          'run',
          'pre-push',
          `--to-stdin=${spooled.path}`,
          '--',
          'origin',
          'https://example.invalid/repo.git',
        ],
        root
      )
      assert.equal(result.exitCode, 0, result.stderr)
      assert.match(
        result.stderr,
        /ARGS:origin https:\/\/example\.invalid\/repo\.git/
      )
      assert.match(result.stderr, /REF:refs\/heads\/main 1{40} refs\/heads/)
    } finally {
      await spooled.dispose()
    }
  })

  it('proves /dev/stdin is what the bundled Git could not open', async t => {
    // The regression this module exists for. On Windows the bundled Git is a
    // native Win32 program whose open() only special-cases /dev/null, so the
    // old `--to-stdin=/dev/stdin` died with exit 128 before the hook ran.
    if (process.platform !== 'win32') {
      t.skip('the /dev/stdin failure is specific to the Windows Git build')
      return
    }
    const root = await repositoryWithStdinReadingPrePushHook(t)
    const result = await exec(
      [
        'hook',
        'run',
        'pre-push',
        '--to-stdin=/dev/stdin',
        '--',
        'origin',
        'https://example.invalid/repo.git',
      ],
      root
    )
    assert.notEqual(result.exitCode, 0)
    assert.match(result.stderr, /\/dev\/stdin/)
  })
})
