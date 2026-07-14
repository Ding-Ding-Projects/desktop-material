import assert from 'node:assert'
import { describe, it } from 'node:test'
import { API } from '../../src/lib/api'
import {
  ActionsMetadataJSONError,
  ActionsMetadataJSONMaximumBytes,
} from '../../src/lib/actions-response'
import { APIError } from '../../src/lib/http'

const runId = 29283111640
const sourceSHA = '7d3af28c422bf02197a99f195b689b34377e11a2'

const attemptResponse = () => ({
  id: runId,
  run_attempt: 1,
  head_branch: 'feature/provenance',
  head_sha: sourceSHA,
  path: '.github/workflows/prober.yml',
})

type CapturedRequest = {
  readonly method: string
  readonly path: string
  readonly signal?: AbortSignal
}

describe('Actions artifact authoritative provenance API', () => {
  it('uses exact bounded repository, attempt, ref, and tag paths', async () => {
    const api = new API('https://api.github.com', 'selected-token')
    const controller = new AbortController()
    const requests = new Array<CapturedRequest>()
    Reflect.set(
      api,
      'ghRequest',
      async (
        method: string,
        path: string,
        options?: { signal?: AbortSignal }
      ) => {
        requests.push({ method, path, signal: options?.signal })
        if (path === 'repos/actions/attest') {
          return new Response(
            JSON.stringify({
              full_name: 'actions/attest',
              visibility: 'public',
              token: 'not returned',
            })
          )
        }
        if (path.includes('/actions/runs/')) {
          return new Response(JSON.stringify(attemptResponse()))
        }
        if (path.includes('/git/ref/')) {
          return new Response(
            JSON.stringify({
              ref: 'refs/heads/feature/provenance',
              object: { type: 'commit', sha: sourceSHA, url: 'not returned' },
            })
          )
        }
        return new Response(
          JSON.stringify({
            sha: sourceSHA,
            object: { type: 'commit', sha: 'a'.repeat(40) },
            message: 'not returned',
          })
        )
      }
    )

    assert.deepEqual(
      await api.fetchArtifactProvenanceRepositoryMetadata(
        'actions',
        'attest',
        controller.signal
      ),
      { full_name: 'actions/attest', visibility: 'public' }
    )
    assert.deepEqual(
      await api.fetchArtifactProvenanceRunAttemptMetadata(
        'actions',
        'attest',
        runId,
        1,
        controller.signal
      ),
      { ...attemptResponse(), referenced_workflows: [] }
    )
    assert.deepEqual(
      await api.fetchArtifactProvenanceGitRef(
        'actions',
        'attest',
        'heads',
        'feature/provenance',
        controller.signal
      ),
      {
        ref: 'refs/heads/feature/provenance',
        object: { type: 'commit', sha: sourceSHA },
      }
    )
    assert.deepEqual(
      await api.fetchArtifactProvenanceAnnotatedTag(
        'actions',
        'attest',
        sourceSHA,
        controller.signal
      ),
      {
        sha: sourceSHA,
        object: { type: 'commit', sha: 'a'.repeat(40) },
      }
    )

    assert.deepEqual(
      requests.map(({ method, path, signal }) => ({ method, path, signal })),
      [
        {
          method: 'GET',
          path: 'repos/actions/attest',
          signal: controller.signal,
        },
        {
          method: 'GET',
          path: `repos/actions/attest/actions/runs/${runId}/attempts/1?exclude_pull_requests=true`,
          signal: controller.signal,
        },
        {
          method: 'GET',
          path: 'repos/actions/attest/git/ref/heads%2Ffeature%2Fprovenance',
          signal: controller.signal,
        },
        {
          method: 'GET',
          path: `repos/actions/attest/git/tags/${sourceSHA}`,
          signal: controller.signal,
        },
      ]
    )
  })

  it('rejects canonical repository, attempt, ref, and tag mismatches', async () => {
    const api = new API('https://api.github.com', 'selected-token')
    let response: unknown
    Reflect.set(
      api,
      'ghRequest',
      async () => new Response(JSON.stringify(response))
    )

    response = { full_name: 'actions/other', visibility: 'public' }
    await assert.rejects(() =>
      api.fetchArtifactProvenanceRepositoryMetadata('actions', 'attest')
    )

    for (const mismatch of [
      { ...attemptResponse(), id: runId + 1 },
      { ...attemptResponse(), run_attempt: 2 },
    ]) {
      response = mismatch
      await assert.rejects(() =>
        api.fetchArtifactProvenanceRunAttemptMetadata(
          'actions',
          'attest',
          runId,
          1
        )
      )
    }

    response = {
      ref: 'refs/heads/other',
      object: { type: 'commit', sha: sourceSHA },
    }
    await assert.rejects(() =>
      api.fetchArtifactProvenanceGitRef(
        'actions',
        'attest',
        'heads',
        'feature/provenance'
      )
    )

    response = {
      sha: 'a'.repeat(40),
      object: { type: 'commit', sha: sourceSHA },
    }
    await assert.rejects(() =>
      api.fetchArtifactProvenanceAnnotatedTag('actions', 'attest', sourceSHA)
    )
  })

  it('maps only an exact ref 404 to null and preserves every other error', async () => {
    const refAPI = new API('https://api.github.com', 'selected-token')
    Reflect.set(
      refAPI,
      'ghRequest',
      async () =>
        new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    )
    assert.equal(
      await refAPI.fetchArtifactProvenanceGitRef(
        'actions',
        'attest',
        'heads',
        'main'
      ),
      null
    )

    const calls = [
      (api: API) =>
        api.fetchArtifactProvenanceRepositoryMetadata('actions', 'attest'),
      (api: API) =>
        api.fetchArtifactProvenanceRunAttemptMetadata(
          'actions',
          'attest',
          runId,
          1
        ),
      (api: API) =>
        api.fetchArtifactProvenanceAnnotatedTag('actions', 'attest', sourceSHA),
    ]
    for (const call of calls) {
      const api = new API('https://api.github.com', 'selected-token')
      Reflect.set(
        api,
        'ghRequest',
        async () =>
          new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          })
      )
      await assert.rejects(
        call(api),
        error => error instanceof APIError && error.responseStatus === 404
      )
    }

    const forbidden = new API('https://api.github.com', 'selected-token')
    Reflect.set(
      forbidden,
      'ghRequest',
      async () =>
        new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
    )
    await assert.rejects(
      forbidden.fetchArtifactProvenanceGitRef(
        'actions',
        'attest',
        'tags',
        'main'
      ),
      error => error instanceof APIError && error.responseStatus === 403
    )
  })

  it('uses the two-MiB fatal reader and preserves aborts', async () => {
    const oversized = new API('https://api.github.com', 'selected-token')
    Reflect.set(
      oversized,
      'ghRequest',
      async () =>
        new Response('{}', {
          headers: {
            'Content-Length': String(ActionsMetadataJSONMaximumBytes + 1),
          },
        })
    )
    await assert.rejects(
      oversized.fetchArtifactProvenanceRepositoryMetadata('actions', 'attest'),
      error =>
        error instanceof ActionsMetadataJSONError && error.kind === 'too-large'
    )

    const malformed = new API('https://api.github.com', 'selected-token')
    Reflect.set(malformed, 'ghRequest', async () => new Response('{not-json'))
    await assert.rejects(
      malformed.fetchArtifactProvenanceRepositoryMetadata('actions', 'attest'),
      error =>
        error instanceof ActionsMetadataJSONError &&
        error.kind === 'invalid-json'
    )

    const oversizedFailure = new API('https://api.github.com', 'selected-token')
    Reflect.set(
      oversizedFailure,
      'ghRequest',
      async () =>
        new Response(
          new Uint8Array(ActionsMetadataJSONMaximumBytes + 1).fill(65),
          { status: 500 }
        )
    )
    await assert.rejects(
      oversizedFailure.fetchArtifactProvenanceRepositoryMetadata(
        'actions',
        'attest'
      ),
      error =>
        error instanceof APIError &&
        error.responseStatus === 500 &&
        !error.message.includes('AAAA')
    )

    const controller = new AbortController()
    controller.abort()
    const aborted = new API('https://api.github.com', 'selected-token')
    let signal: AbortSignal | undefined
    Reflect.set(
      aborted,
      'ghRequest',
      async (
        _method: string,
        _path: string,
        options?: { signal?: AbortSignal }
      ) => {
        signal = options?.signal
        return new Response('{}')
      }
    )
    await assert.rejects(
      aborted.fetchArtifactProvenanceRepositoryMetadata(
        'actions',
        'attest',
        controller.signal
      ),
      error => (error as Error).name === 'AbortError'
    )
    assert.equal(signal, controller.signal)
  })

  it('rejects unsafe coordinates before transport', async () => {
    const api = new API('https://api.github.com', 'selected-token')
    let requests = 0
    Reflect.set(api, 'ghRequest', async () => {
      requests++
      return new Response('{}')
    })

    const invalidCalls = [
      () =>
        api.fetchArtifactProvenanceRepositoryMetadata(
          'actions/other',
          'attest'
        ),
      () =>
        api.fetchArtifactProvenanceRunAttemptMetadata(
          'actions',
          'attest',
          0,
          1
        ),
      () =>
        api.fetchArtifactProvenanceRunAttemptMetadata(
          'actions',
          'attest',
          runId,
          0
        ),
      () =>
        api.fetchArtifactProvenanceGitRef(
          'actions',
          'attest',
          'pulls' as 'heads',
          'main'
        ),
      () =>
        api.fetchArtifactProvenanceGitRef(
          'actions',
          'attest',
          'heads',
          'refs/heads/main'
        ),
      () =>
        api.fetchArtifactProvenanceAnnotatedTag(
          'actions',
          'attest',
          sourceSHA.toUpperCase()
        ),
    ]
    for (const call of invalidCalls) {
      await assert.rejects(call)
    }
    assert.equal(requests, 0)
  })

  it('resolves through the same API instance with serial exact ref probes', async () => {
    const api = new API('https://api.github.com', 'selected-token')
    const controller = new AbortController()
    const paths = new Array<string>()
    Reflect.set(
      api,
      'ghRequest',
      async (
        _method: string,
        path: string,
        options?: { signal?: AbortSignal }
      ) => {
        assert.equal(options?.signal, controller.signal)
        paths.push(path)
        if (path.endsWith('heads%2Ffeature%2Fprovenance')) {
          return new Response(
            JSON.stringify({
              ref: 'refs/heads/feature/provenance',
              object: { type: 'commit', sha: sourceSHA },
            })
          )
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        })
      }
    )
    const metadata = {
      ...attemptResponse(),
      referenced_workflows: [],
    }
    assert.equal(
      await api.resolveArtifactProvenanceSourceRef(
        'actions',
        'attest',
        metadata,
        controller.signal
      ),
      'refs/heads/feature/provenance'
    )
    assert.deepEqual(paths, [
      'repos/actions/attest/git/ref/heads%2Ffeature%2Fprovenance',
      'repos/actions/attest/git/ref/tags%2Ffeature%2Fprovenance',
    ])
  })
})
