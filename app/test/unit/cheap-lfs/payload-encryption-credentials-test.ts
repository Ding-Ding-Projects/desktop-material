import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  acquireCheapLfsOperationPassword,
  ICheapLfsCredentialVault,
} from '../../../src/lib/cheap-lfs/payload-encryption-credentials'

const repository = {
  path: 'C:\\work\\encrypted-repository',
  gitHubRepository: null,
}

function createVault(initial: string | null = null): {
  readonly vault: ICheapLfsCredentialVault
  readonly savedValues: string[]
} {
  let value = initial
  const savedValues = new Array<string>()
  return {
    savedValues,
    vault: {
      getItem: async () => value,
      setItem: async (_service, _account, next) => {
        value = next
        savedValues.push(next)
      },
      deleteItem: async () => {
        const existed = value !== null
        value = null
        return existed
      },
    },
  }
}

describe('Cheap LFS operation-scoped payload passwords', () => {
  it('reuses a deliberately saved vault credential without prompting', async () => {
    const { vault } = createVault('saved-secret')
    let prompts = 0

    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'decrypt',
      async () => {
        prompts++
        return null
      },
      () => undefined,
      vault
    )

    assert.equal(prompts, 0)
    assert.equal(credential?.source, 'vault')
    assert.equal(credential?.rememberPassword, false)
    assert.equal(credential?.password.toString('utf8'), 'saved-secret')
    credential?.password.fill(0)
  })

  it('prompts again for every operation when Save was left off', async () => {
    const { vault, savedValues } = createVault()
    let prompts = 0
    const prompt = async () => {
      prompts++
      return {
        password: Buffer.from(`one-shot-${prompts}`, 'utf8'),
        rememberPassword: false,
      }
    }

    const first = await acquireCheapLfsOperationPassword(
      repository,
      'encrypt',
      prompt,
      () => undefined,
      vault
    )
    assert.equal(first?.source, 'prompt')
    assert.equal(first?.password.toString('utf8'), 'one-shot-1')
    first?.password.fill(0)

    const second = await acquireCheapLfsOperationPassword(
      repository,
      'encrypt',
      prompt,
      () => undefined,
      vault
    )
    assert.equal(second?.source, 'prompt')
    assert.equal(second?.password.toString('utf8'), 'one-shot-2')
    second?.password.fill(0)

    assert.equal(prompts, 2)
    assert.deepEqual(savedValues, [])
  })

  it('saves a confirmed encryption password only when explicitly requested', async () => {
    const { vault, savedValues } = createVault()
    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'encrypt',
      async () => ({
        password: Buffer.from('remember-me', 'utf8'),
        rememberPassword: true,
      }),
      () => assert.fail('the fake vault is available'),
      vault
    )

    assert.equal(credential?.source, 'prompt')
    assert.equal(credential?.rememberPassword, false)
    assert.deepEqual(savedValues, ['remember-me'])
    credential?.password.fill(0)
  })

  it('defers a decrypt password save until the caller verifies authentication', async () => {
    const { vault, savedValues } = createVault()
    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'decrypt',
      async () => ({
        password: Buffer.from('verify-first', 'utf8'),
        rememberPassword: true,
      }),
      () => assert.fail('the fake vault is available'),
      vault
    )

    assert.equal(credential?.source, 'prompt')
    assert.equal(credential?.rememberPassword, true)
    assert.deepEqual(savedValues, [])
    credential?.password.fill(0)
  })

  it('returns cancellation without retaining a credential', async () => {
    const { vault } = createVault()
    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'decrypt',
      async () => null,
      () => undefined,
      vault
    )

    assert.equal(credential, null)
  })
})
