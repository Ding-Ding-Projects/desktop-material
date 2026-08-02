import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { describe, it, mock } from 'node:test'

type PointerBlobReader = (
  candidates: ReadonlyArray<{ readonly oid: string; readonly size: number }>,
  onBlob: (oid: string, contents: Buffer) => Promise<void>
) => Promise<void>

class ClosedPeerStdin extends EventEmitter {
  public listenersWhenEnded: number | null = null
  public unhandledError: Error | null = null
  public unhandledLateChildError: Error | null = null

  public constructor(private readonly child: EventEmitter) {
    super()
  }

  public end(): void {
    this.listenersWhenEnded = this.listenerCount('error')
    queueMicrotask(() => {
      const error = Object.assign(new Error('pointer batch write EPIPE'), {
        code: 'EPIPE',
      })
      try {
        this.emit('error', error)
      } catch (unhandled) {
        this.unhandledError = unhandled as Error
      }
      try {
        this.child.emit('error', new Error('late child-process error'))
      } catch (unhandled) {
        this.unhandledLateChildError = unhandled as Error
      }
      this.child.emit('close', 1)
      this.emit('close')
    })
  }
}

class FakeGitChild extends EventEmitter {
  public readonly stdin = new ClosedPeerStdin(this)
  public readonly stdout = Readable.from([])
  public readonly stderr = new PassThrough()

  public kill(): void {}
}

let nextChild: FakeGitChild | null = null

mock.module('node:child_process', {
  namedExports: {
    execFileSync,
    spawn: () => {
      assert.ok(nextChild, 'the test must provide one fake Git child')
      const child = nextChild
      nextChild = null
      return child
    },
  },
})

const actionPaths = [
  join(
    process.cwd(),
    '.github',
    'actions',
    'cheap-lfs-cloud-compression',
    'cloud-compress.mjs'
  ),
  join(
    process.cwd(),
    '.github',
    'actions',
    'cheap-lfs-release-to-ghcr',
    'release-to-ghcr.mjs'
  ),
]

describe('Cheap LFS pointer-batch stdin failure containment', () => {
  it('handles a closed Git peer before writing in both actions', async () => {
    const requiredEnvironment = {
      GITHUB_WORKSPACE: process.cwd(),
      GITHUB_REPOSITORY: 'owner/repository',
      GITHUB_REF_NAME: 'main',
      GITHUB_SHA: 'a'.repeat(40),
      GITHUB_ACTOR: 'desktop-material-test',
      CHEAP_LFS_GITHUB_TOKEN: 'test-token',
    }
    const previousEnvironment = Object.fromEntries(
      Object.keys(requiredEnvironment).map(key => [key, process.env[key]])
    )
    Object.assign(process.env, requiredEnvironment)
    let readers: ReadonlyArray<{
      readonly path: string
      readonly readPointerBlobs: PointerBlobReader
    }>
    try {
      readers = await Promise.all(
        actionPaths.map(async path => {
          const module = (await import(pathToFileURL(path).href)) as {
            readonly readPointerBlobs: PointerBlobReader
          }
          return { path, readPointerBlobs: module.readPointerBlobs }
        })
      )
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }

    for (const { path, readPointerBlobs } of readers) {
      const child = new FakeGitChild()
      nextChild = child

      await assert.rejects(
        readPointerBlobs([{ oid: 'b'.repeat(40), size: 1 }], async () => {}),
        (error: Error & { readonly code?: string }) => {
          assert.equal(error.code, 'EPIPE')
          return true
        }
      )

      assert.ok(
        (child.stdin.listenersWhenEnded ?? 0) > 0,
        'child.stdin must have an error listener before end()'
      )
      assert.equal(child.stdin.unhandledError, null)
      assert.equal(child.stdin.unhandledLateChildError, null)
      assert.equal(nextChild, null)
      assert.match(path, /cheap-lfs-(?:cloud-compression|release-to-ghcr)/)
    }
  })
})
