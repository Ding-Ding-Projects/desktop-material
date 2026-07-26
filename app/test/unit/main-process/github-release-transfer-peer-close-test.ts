import assert from 'node:assert'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import type { ClientRequest, Session } from 'electron'
import {
  createElectronGitHubReleaseUploadFetcher,
  createGitHubCliReleaseUploadFallback,
} from '../../../src/main-process/github-release-transfer'

const account = {
  endpoint: 'https://api.github.com',
  token: 'selected-account-token',
}
const bytes = Buffer.from('a Cheap LFS part streamed through gh')
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function withDirectory(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'dm-peer-close-'))
  try {
    await fn(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * The exact error a Windows named pipe produces when the peer exits while a
 * write is in flight. This is the failure the crash report carried:
 *
 * ```text
 * Error: write EOF
 *     at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87:19)
 * ```
 */
function writeEofError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('write EOF')
  error.code = 'EOF'
  error.errno = -4095
  error.syscall = 'write'
  return error
}

/**
 * A stdin pipe whose peer has gone away, reproducing Node's *double* report of
 * a failed write: once through the write callback and once as an `'error'`
 * event on the stream.
 *
 * The second report is what crashed the app. It arrives after the write
 * callback has run, so a listener the callback removed is already gone, and an
 * `'error'` event with no listener terminates the process.
 */
class ClosedPeerStdin extends EventEmitter {
  public destroyed = false
  public writable = true
  public writableEnded = false
  /** Listener count observed at the moment the failure was reported. */
  public listenersWhenReported: number | null = null
  /** Set when emitting 'error' threw, i.e. nothing was listening. */
  public unhandledError: unknown = null

  public write(
    _chunk: Buffer,
    callback?: (error?: Error | null) => void
  ): boolean {
    const error = writeEofError()
    this.destroyed = true
    this.writable = false
    // Node's order, which is the whole point of this fixture: the write
    // callback runs first, and the stream emits 'error' afterwards. A listener
    // the callback removed is already gone by then.
    callback?.(error)
    process.nextTick(() => {
      this.listenersWhenReported = this.listenerCount('error')
      try {
        this.emit('error', error)
      } catch (thrown) {
        this.unhandledError = thrown
      }
    })
    return false
  }

  public end(callback?: () => void): this {
    this.writableEnded = true
    callback?.()
    return this
  }

  public destroy(): this {
    this.destroyed = true
    return this
  }
}

function fakeGitHubCli(stdin: ClosedPeerStdin) {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = new EventEmitter() as EventEmitter & {
    stdin: ClosedPeerStdin
    stdout: PassThrough
    stderr: PassThrough
    pid: number
    kill: () => boolean
  }
  child.stdin = stdin
  child.stdout = stdout
  child.stderr = stderr
  child.pid = 4242
  child.kill = () => {
    setImmediate(() => {
      child.emit('exit', 1, null)
      child.emit('close', 1, null)
    })
    return true
  }
  return child as unknown as ChildProcessWithoutNullStreams
}

describe('release upload writes after the peer closed', () => {
  it('contains a gh stdin write that completes with EOF', async () => {
    await withDirectory(async directory => {
      const source = join(directory, 'part.bin')
      await writeFile(source, bytes)

      const stdin = new ClosedPeerStdin()
      const fallback = createGitHubCliReleaseUploadFallback({
        // Reconciliation finds no same-name asset, before and after the
        // failure, so the upload fails closed rather than adopting anything.
        fetch: async () => new Response('[]', { status: 200 }),
        resolveExecutable: () => 'C:\\Program Files\\GitHub CLI\\gh.exe',
        environment: { Path: 'C:\\ignored' },
        killTree: async () => true,
        maximumAttempts: 1,
        assetDetectionAttempts: 1,
        assetDetectionIntervalMs: 1,
        spawn: () => fakeGitHubCli(stdin),
      })

      await assert.rejects(
        fallback(
          {
            endpoint: new URL(account.endpoint),
            uploadURL: 'https://uploads.github.com/example',
            token: account.token,
            owner: 'desktop',
            repository: 'material',
            releaseId: 7,
            source: {
              path: source,
              offset: 0,
              length: bytes.byteLength,
              digest,
            },
            name: 'part.bin',
            label: null,
          },
          new AbortController().signal
        ),
        // The transfer still fails — through the retryable CLI path, not by
        // taking the process down with it.
        error => (error as { reason?: string }).reason === 'cli-failed'
      )

      assert.notEqual(
        stdin.listenersWhenReported,
        null,
        'the upload never reached the stdin write'
      )
      assert.ok(
        (stdin.listenersWhenReported ?? 0) > 0,
        'child.stdin had no error listener when the peer-closed write was reported'
      )
      assert.equal(stdin.unhandledError, null)
    })
  })

  it('fails the transfer instead of throwing when gh stdin is already closed', async () => {
    await withDirectory(async directory => {
      const source = join(directory, 'part.bin')
      await writeFile(source, bytes)

      const stdin = new ClosedPeerStdin()
      // Already torn down before the first byte: `canStillWriteTo` must refuse
      // the write rather than provoking a throw from a destroyed stream.
      stdin.destroyed = true
      stdin.writable = false

      const fallback = createGitHubCliReleaseUploadFallback({
        fetch: async () => new Response('[]', { status: 200 }),
        resolveExecutable: () => 'C:\\Program Files\\GitHub CLI\\gh.exe',
        environment: { Path: 'C:\\ignored' },
        killTree: async () => true,
        maximumAttempts: 1,
        assetDetectionAttempts: 1,
        assetDetectionIntervalMs: 1,
        spawn: () => fakeGitHubCli(stdin),
      })

      await assert.rejects(
        fallback(
          {
            endpoint: new URL(account.endpoint),
            uploadURL: 'https://uploads.github.com/example',
            token: account.token,
            owner: 'desktop',
            repository: 'material',
            releaseId: 7,
            source: {
              path: source,
              offset: 0,
              length: bytes.byteLength,
              digest,
            },
            name: 'part.bin',
            label: null,
          },
          new AbortController().signal
        ),
        error => (error as { reason?: string }).reason === 'cli-failed'
      )

      assert.equal(stdin.listenersWhenReported, null)
      assert.equal(stdin.unhandledError, null)
    })
  })

  it('contains an Electron upload write that throws after the server FIN', async () => {
    await withDirectory(async directory => {
      const source = join(directory, 'part.bin')
      await writeFile(source, bytes)

      let aborted = false
      const request = new EventEmitter() as EventEmitter & {
        chunkedEncoding: boolean
        write: (chunk: Buffer) => void
        end: () => void
        abort: () => void
      }
      request.chunkedEncoding = false
      request.write = () => {
        // Chromium tears the upload pipe down when the server closes early;
        // Electron surfaces that as a synchronous throw from inside the read
        // stream's 'data' handler, where nothing would catch it.
        throw writeEofError()
      }
      request.end = () => undefined
      request.abort = () => {
        aborted = true
      }

      const upload = createElectronGitHubReleaseUploadFetcher(
        () => request as unknown as ClientRequest,
        () => ({} as Session)
      )

      await assert.rejects(
        upload(
          'https://uploads.github.com/example',
          { Authorization: 'Bearer test-token' },
          { path: source, offset: 0, length: bytes.byteLength },
          new AbortController().signal
        ),
        error => (error as { reason?: string }).reason === 'network'
      )
      assert.equal(aborted, true)
    })
  })
})
