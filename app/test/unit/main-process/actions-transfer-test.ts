import assert from 'node:assert'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { mkdtemp, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it } from 'node:test'
import {
  cancelActionsTransfer,
  handleActionsArtifactTransfer,
  handleActionsJobLogTransfer,
  IActionsTransferSender,
} from '../../../src/main-process/actions-transfer'
import {
  ActionsJobLogMaximumBytes,
  ActionsJobLogTruncationMarker,
  IActionsArtifactTransferRequest,
  IActionsJobLogTransferRequest,
  IActionsTransferProgressEvent,
} from '../../../src/lib/actions-transfer'

const archive = Buffer.from('trusted main process artifact')
const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`

class TestSender extends EventEmitter implements IActionsTransferSender {
  public readonly sent = new Array<IActionsTransferProgressEvent>()
  private destroyed = false

  public constructor(public readonly id: number) {
    super()
  }

  public send(
    channel: 'actions-transfer-progress',
    event: IActionsTransferProgressEvent
  ) {
    assert.equal(channel, 'actions-transfer-progress')
    this.sent.push(event)
  }

  public isDestroyed() {
    return this.destroyed
  }

  public destroy() {
    this.destroyed = true
    this.emit('destroyed')
  }
}

class ThrowingSender extends TestSender {
  public override send(): void {
    throw new Error('renderer was destroyed')
  }
}

const artifactRequest = (
  destination: string,
  overrides: Partial<IActionsArtifactTransferRequest> = {}
): IActionsArtifactTransferRequest => ({
  operationId: 'a'.repeat(32),
  endpoint: 'https://api.github.com',
  token: 'selected-account-token',
  owner: 'owner',
  repository: 'repo',
  artifact: {
    id: 19,
    sizeInBytes: archive.byteLength,
    expired: false,
    digest,
  },
  destination,
  ...overrides,
})

const logRequest = (
  overrides: Partial<IActionsJobLogTransferRequest> = {}
): IActionsJobLogTransferRequest => ({
  operationId: 'b'.repeat(32),
  endpoint: 'https://api.github.com',
  token: 'selected-account-token',
  owner: 'owner',
  repository: 'repo',
  jobId: 7,
  ...overrides,
})

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'actions-main-transfer-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('main-process Actions transfer', () => {
  it('validates every hop, strips auth after the API, and streams to disk', async () => {
    await withDirectory(async directory => {
      const requests = new Array<{
        url: string
        authorization: string | null
        redirect: RequestRedirect | undefined
        credentials: RequestCredentials | undefined
        referrerPolicy: ReferrerPolicy | undefined
        cache: RequestCache | undefined
        accept: string | null
        apiVersion: string | null
      }>()
      const responses = [
        new Response(null, {
          status: 302,
          headers: { Location: 'https://blob.example.test/first' },
        }),
        new Response(null, {
          status: 307,
          headers: { Location: 'https://cdn.example.test/final.zip' },
        }),
        new Response(archive, {
          headers: { 'Content-Length': String(archive.byteLength) },
        }),
      ]
      const sender = new TestSender(1)
      const destination = join(directory, 'artifact.zip')
      const result = await handleActionsArtifactTransfer(
        sender,
        artifactRequest(destination),
        async (url, init) => {
          requests.push({
            url,
            authorization: new Headers(init.headers).get('Authorization'),
            redirect: init.redirect,
            credentials: init.credentials,
            referrerPolicy: init.referrerPolicy,
            cache: init.cache,
            accept: new Headers(init.headers).get('Accept'),
            apiVersion: new Headers(init.headers).get('X-GitHub-Api-Version'),
          })
          return responses.shift()!
        }
      )

      assert.equal(result.ok, true)
      assert.deepEqual(
        requests.map(request => request.authorization),
        ['Bearer selected-account-token', null, null]
      )
      assert.ok(requests.every(request => request.redirect === 'manual'))
      assert.ok(requests.every(request => request.credentials === 'omit'))
      assert.ok(
        requests.every(request => request.referrerPolicy === 'no-referrer')
      )
      assert.ok(requests.every(request => request.cache === 'no-store'))
      assert.ok(
        requests.every(
          request => request.accept === 'application/vnd.github+json'
        )
      )
      assert.ok(requests.every(request => request.apiVersion === '2026-03-10'))
      assert.equal(requests[2].url, 'https://cdn.example.test/final.zip')
      assert.deepEqual(await readFile(destination), archive)
      assert.ok(sender.sent.length >= 1)
      assert.ok(
        sender.sent.every(event => event.operationId === 'a'.repeat(32))
      )
    })
  })

  it('rejects downgrade and excessive redirect chains before publication', async () => {
    await withDirectory(async directory => {
      let downgradeFetches = 0
      const downgrade = await handleActionsArtifactTransfer(
        new TestSender(2),
        artifactRequest(join(directory, 'downgrade.zip')),
        async () => {
          downgradeFetches++
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://blob.example.test/archive.zip' },
          })
        }
      )
      assert.deepEqual(downgrade, {
        ok: false,
        reason: 'unsafe-redirect',
        status: null,
      })
      assert.equal(downgradeFetches, 1)

      let redirectFetches = 0
      const excessive = await handleActionsArtifactTransfer(
        new TestSender(3),
        artifactRequest(join(directory, 'redirects.zip'), {
          operationId: 'c'.repeat(32),
        }),
        async () => {
          redirectFetches++
          return new Response(null, {
            status: 302,
            headers: {
              Location: `https://blob.example.test/${redirectFetches}`,
            },
          })
        }
      )
      assert.equal(excessive.ok, false)
      assert.equal(excessive.ok ? '' : excessive.reason, 'too-many-redirects')
      assert.equal(redirectFetches, 6)
      assert.deepEqual(await readdir(directory), [])
    })
  })

  it('returns typed expiration and missing-location outcomes', async () => {
    await withDirectory(async directory => {
      const expiredArtifact = await handleActionsArtifactTransfer(
        new TestSender(4),
        artifactRequest(join(directory, 'expired.zip'), {
          operationId: '1'.repeat(32),
        }),
        async () => new Response(null, { status: 410 })
      )
      assert.deepEqual(expiredArtifact, {
        ok: false,
        reason: 'expired',
        status: 410,
      })

      const expiredLog = await handleActionsJobLogTransfer(
        new TestSender(5),
        logRequest({ operationId: '2'.repeat(32) }),
        async () => new Response(null, { status: 410 })
      )
      assert.deepEqual(expiredLog, {
        ok: false,
        reason: 'expired',
        status: 410,
      })

      const missingLocation = await handleActionsArtifactTransfer(
        new TestSender(6),
        artifactRequest(join(directory, 'missing.zip'), {
          operationId: '3'.repeat(32),
        }),
        async () => new Response(null, { status: 302 })
      )
      assert.deepEqual(missingLocation, {
        ok: false,
        reason: 'missing-location',
        status: null,
      })
      assert.deepEqual(await readdir(directory), [])
    })
  })

  it('scopes duplicate and cancellation state to sender plus operation id', async () => {
    await withDirectory(async directory => {
      const sender = new TestSender(8)
      const other = new TestSender(9)
      const request = artifactRequest(join(directory, 'pending.zip'), {
        operationId: 'd'.repeat(32),
      })
      const pending = handleActionsArtifactTransfer(
        sender,
        request,
        async (_url, init) =>
          await new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('canceled', 'AbortError')),
              { once: true }
            )
          )
      )
      const duplicate = await handleActionsArtifactTransfer(
        sender,
        request,
        async () => new Response(archive)
      )
      assert.deepEqual(duplicate, {
        ok: false,
        reason: 'invalid-request',
        status: null,
      })
      assert.equal(cancelActionsTransfer(other.id, request.operationId), false)
      assert.equal(cancelActionsTransfer(sender.id, request.operationId), true)
      assert.deepEqual(await pending, {
        ok: false,
        reason: 'canceled',
        status: null,
      })
      assert.equal(cancelActionsTransfer(sender.id, request.operationId), false)
    })
  })

  it('aborts and cleans state when the owning renderer is destroyed', async () => {
    await withDirectory(async directory => {
      const sender = new TestSender(10)
      const request = artifactRequest(join(directory, 'destroyed.zip'), {
        operationId: 'e'.repeat(32),
      })
      const pending = handleActionsArtifactTransfer(
        sender,
        request,
        async (_url, init) =>
          await new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('destroyed', 'AbortError')),
              { once: true }
            )
          )
      )
      sender.destroy()
      assert.equal((await pending).ok, false)
      assert.equal(cancelActionsTransfer(sender.id, request.operationId), false)
    })
  })

  it('rejects malformed request fields before network access', async () => {
    await withDirectory(async directory => {
      let fetches = 0
      const result = await handleActionsArtifactTransfer(
        new TestSender(11),
        artifactRequest(join(directory, 'invalid.zip'), {
          owner: 'owner/escape',
        }),
        async () => {
          fetches++
          return new Response(archive)
        }
      )
      assert.equal(result.ok, false)
      assert.equal(result.ok ? '' : result.reason, 'invalid-request')
      assert.equal(fetches, 0)

      const invalidDestination = await handleActionsArtifactTransfer(
        new TestSender(14),
        artifactRequest('unused', {
          operationId: '4'.repeat(32),
          destination: 42 as unknown as string,
        }),
        async () => {
          fetches++
          return new Response(archive)
        }
      )
      assert.deepEqual(invalidDestination, {
        ok: false,
        reason: 'invalid-request',
        status: null,
      })
      assert.equal(fetches, 0)
    })
  })

  it('turns a raced progress-send failure into cancellation', async () => {
    await withDirectory(async directory => {
      const result = await handleActionsArtifactTransfer(
        new ThrowingSender(15),
        artifactRequest(join(directory, 'destroyed.zip'), {
          operationId: '5'.repeat(32),
        }),
        async () =>
          new Response(archive, {
            headers: { 'Content-Length': String(archive.byteLength) },
          })
      )

      assert.deepEqual(result, {
        ok: false,
        reason: 'canceled',
        status: null,
      })
      assert.deepEqual(await readdir(directory), [])
    })
  })

  it('uses the same redirect guard and bounded stream for job logs', async () => {
    const bytes = new Uint8Array(ActionsJobLogMaximumBytes + 1).fill(65)
    const requests = new Array<string | null>()
    const responses = [
      new Response(null, {
        status: 302,
        headers: { Location: 'https://blob.example.test/job.txt' },
      }),
      new Response(bytes),
    ]
    const result = await handleActionsJobLogTransfer(
      new TestSender(12),
      logRequest(),
      async (_url, init) => {
        requests.push(new Headers(init.headers).get('Authorization'))
        return responses.shift()!
      }
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.truncated, true)
      assert.equal(result.log.endsWith(ActionsJobLogTruncationMarker), true)
    }
    assert.deepEqual(requests, ['Bearer selected-account-token', null])
  })

  it('reports cancellation that occurs while a job-log read is pending', async () => {
    let readStarted!: () => void
    const reading = new Promise<void>(resolve => (readStarted = resolve))
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          readStarted()
          return new Promise<void>(() => undefined)
        },
      })
    )
    const sender = new TestSender(13)
    const request = logRequest({ operationId: 'f'.repeat(32) })
    const pending = handleActionsJobLogTransfer(
      sender,
      request,
      async () => response
    )

    await reading
    assert.equal(cancelActionsTransfer(sender.id, request.operationId), true)
    assert.deepEqual(await pending, {
      ok: false,
      reason: 'canceled',
      status: null,
    })
  })
})
