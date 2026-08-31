import assert from 'node:assert'
import { describe, it } from 'node:test'

import { StatusHubClient } from '../../src/main-process/status-hub-client'
import { IStatusHubSessionProjection } from '../../src/models/status-hub'

const projection: IStatusHubSessionProjection = {
  sessionId: 'session-1',
  project: {
    repositoryId: 'repository-1',
    repositoryPath: 'C:\\fixture',
    defaultBranch: 'main',
    releaseChannel: 'production',
    displayName: 'Fixture',
  },
  state: 'running',
  summary: 'Focused verification',
  heartbeatAt: 123,
  evidence: [],
}

describe('StatusHubClient', () => {
  it('uses an honest local fallback for absent or unsafe endpoints', async () => {
    for (const endpoint of [null, 'http://example.com', 'not a URL']) {
      const client = new StatusHubClient({
        endpoint,
        getAuthorization: async () => 'unused',
      })
      const status = await client.getStatus()
      assert.equal(status.connection, 'unavailable')
      assert.equal(status.stableURL, null)
    }
  })

  it('distinguishes missing owner authorization from connectivity', async () => {
    const client = new StatusHubClient({
      endpoint: 'https://status.example.test',
      getAuthorization: async () => null,
    })

    const status = await client.getStatus()
    assert.equal(status.connection, 'authentication-unavailable')
    assert.equal(status.stableURL, 'https://status.example.test/')
  })

  it('publishes through the main-process boundary with bounded credentials', async () => {
    const calls = new Array<{ url: string; init: RequestInit }>()
    const client = new StatusHubClient({
      endpoint: 'https://status.example.test/base',
      getAuthorization: async () => 'Bearer fixture',
      now: () => 456,
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return new Response('{}', { status: 200 })
      },
    })

    const status = await client.publish(projection)

    assert.equal(status.connection, 'connected')
    assert.equal(status.lastUpdatedAt, 456)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://status.example.test/api/agent/sessions')
    assert.equal(calls[0].init.method, 'PUT')
    assert.equal(
      (calls[0].init.headers as Record<string, string>).authorization,
      'Bearer fixture'
    )
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), projection)
  })

  it('fails locally for oversized, malformed, or refused publish responses', async () => {
    for (const response of [
      new Response('x'.repeat(65 * 1024), { status: 200 }),
      new Response('not json', { status: 200 }),
      new Response('{}', { status: 503 }),
    ]) {
      const client = new StatusHubClient({
        endpoint: 'https://status.example.test',
        getAuthorization: async () => 'Bearer fixture',
        fetch: async () => response,
      })
      assert.equal((await client.publish(projection)).connection, 'unavailable')
    }
  })

  it('filters reply fields and confirms only an accepted Hub delivery', async () => {
    const client = new StatusHubClient({
      endpoint: 'https://status.example.test',
      getAuthorization: async () => 'Bearer fixture',
      fetch: async () =>
        new Response(
          JSON.stringify({
            replies: [
              {
                id: 'reply-1',
                questionId: 'question-1',
                text: 'Answer',
                receivedAt: 789,
              },
              { id: 'invalid' },
            ],
            nextCursor: 'cursor-2',
            deliveryConfirmed: true,
          }),
          { status: 200 }
        ),
    })

    const result = await client.pollReplies('session/1', 'cursor-1')
    assert.deepEqual(result.replies, [
      {
        id: 'reply-1',
        questionId: 'question-1',
        text: 'Answer',
        receivedAt: 789,
      },
    ])
    assert.equal(result.nextCursor, 'cursor-2')
    assert.equal(result.deliveryConfirmed, true)
  })
})
