import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  AgentToolDefinitions,
  assertSafeAgentArgs,
  isAgentCommandName,
  redactAgentValue,
} from '../../src/lib/agent-commands'

describe('agent command contract', () => {
  it('has unique names and object input schemas', () => {
    const names = AgentToolDefinitions.map(x => x.name)
    assert.equal(new Set(names).size, names.length)
    assert.ok(AgentToolDefinitions.every(x => x.inputSchema.type === 'object'))
    assert.equal(isAgentCommandName('push'), true)
    assert.equal(isAgentCommandName('delete-everything'), false)
  })

  it('advertises exact, credential-free SSH host command schemas', () => {
    const list = AgentToolDefinitions.find(x => x.name === 'list-ssh-hosts')
    const clone = AgentToolDefinitions.find(x => x.name === 'clone-to-ssh')
    assert.deepEqual(list?.inputSchema, {
      type: 'object',
      additionalProperties: false,
      properties: {},
    })
    assert.deepEqual(clone?.inputSchema, {
      type: 'object',
      additionalProperties: false,
      required: ['hostId', 'url', 'path'],
      properties: {
        hostId: {
          type: 'string',
          minLength: 32,
          maxLength: 32,
          pattern: '^[a-f0-9]{32}$',
        },
        url: { type: 'string', minLength: 1, maxLength: 2048 },
        path: {
          type: 'string',
          minLength: 2,
          maxLength: 512,
          pattern: '^(?:/|~/)',
        },
        branch: { type: 'string', minLength: 1, maxLength: 255 },
      },
    })
    assert.equal(
      JSON.stringify(clone).match(/password|privateKey|token/g),
      null
    )
  })

  it('redacts credential-shaped properties recursively', () => {
    assert.deepEqual(
      redactAgentValue({
        login: 'octocat',
        token: 'never-leak',
        nested: { api_key: 'never-leak-either', value: 42 },
      }),
      {
        login: 'octocat',
        token: '[redacted]',
        nested: { api_key: '[redacted]', value: 42 },
      }
    )

    const text = redactAgentValue(
      'Bearer abc.def https://user:pass@example.test ' + 'a'.repeat(64)
    )
    assert.equal(String(text).includes('abc.def'), false)
    assert.equal(String(text).includes('user:pass'), false)
    assert.equal(String(text).includes('a'.repeat(64)), false)
  })

  it('rejects credentials and excessive argument nesting', () => {
    assert.throws(() => assertSafeAgentArgs({ authorization: 'Bearer x' }))

    let value: unknown = 'leaf'
    for (let i = 0; i < 10; i++) {
      value = { child: value }
    }
    assert.throws(() => assertSafeAgentArgs(value))
  })
})
