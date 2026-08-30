import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { spawn } from '../../src/lib/process/win32'

const settlesWithin = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(
        value => ({ kind: 'resolved' as const, value }),
        error => ({ kind: 'rejected' as const, error })
      ),
      new Promise<{ kind: 'timeout' }>(resolve => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

describe('process/win32', () => {
  it('drains large stderr output and preserves a bounded diagnostic tail', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-process-win32-'))
    const pidPath = join(directory, 'child.pid')
    const scriptPath = join(directory, 'large-stderr.cjs')
    t.after(async () => rm(directory, { recursive: true, force: true }))

    const diagnostic = 'large-stderr-diagnostic'
    await writeFile(
      scriptPath,
      [
        "const fs = require('node:fs')",
        'fs.writeFileSync(process.argv[1], String(process.pid))',
        `const chunk = Buffer.alloc(64 * 1024, ${JSON.stringify('x')})`,
        'for (let index = 0; index < 256; index++) fs.writeSync(2, chunk)',
        `fs.writeSync(2, ${JSON.stringify(diagnostic)})`,
        'process.exit(17)',
      ].join(';')
    )

    const execution = spawn(process.execPath, [scriptPath, pidPath])
    const outcome = await settlesWithin(execution, 2_000)

    if (outcome.kind === 'timeout') {
      const pid = Number(await readFile(pidPath, 'utf8'))
      try {
        if (process.platform === 'win32') {
          execFileSync(
            join(
              process.env.SystemRoot ?? 'C:\\Windows',
              'System32',
              'taskkill.exe'
            ),
            ['/PID', String(pid), '/T', '/F'],
            { stdio: 'ignore', windowsHide: true }
          )
        } else {
          process.kill(pid, 'SIGKILL')
        }
      } catch {
        // The child may exit exactly at the timeout boundary.
      }
      const cleanup = await settlesWithin(execution, 2_000)
      assert.notEqual(
        cleanup.kind,
        'timeout',
        'blocked child did not terminate'
      )
    }

    if (outcome.kind === 'timeout') {
      assert.fail('stderr pipe was not drained')
    }
    if (outcome.kind !== 'rejected') {
      assert.fail(`expected child process to reject, got ${outcome.kind}`)
    }
    assert.match(String(outcome.error), new RegExp(diagnostic))
    assert.ok(
      String(outcome.error).length < 128 * 1024,
      'failure output should retain only a bounded stderr tail'
    )
  })

  it('reports a small stderr diagnostic for a non-zero exit', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-process-win32-'))
    const scriptPath = join(directory, 'small-stderr.cjs')
    t.after(async () => rm(directory, { recursive: true, force: true }))
    const diagnostic = 'small-stderr-diagnostic'
    await writeFile(
      scriptPath,
      `process.stderr.write(${JSON.stringify(diagnostic)}); process.exit(23)`
    )

    await assert.rejects(
      spawn(process.execPath, [scriptPath]),
      error => error instanceof Error && error.message.includes(diagnostic)
    )
  })
})
