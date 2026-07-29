import assert from 'node:assert'
import { createHmac, randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  acquireCheapLfsOperationPassword,
  cheapLfsPayloadPasswordAccount,
  CheapLfsPayloadPasswordService,
  cleanupLegacyCheapLfsPayloadPasswords,
  forgetSavedCheapLfsPayloadPassword,
  ICheapLfsCredentialVault,
  legacyCheapLfsPayloadPasswordAccount,
  LegacyCheapLfsPayloadPasswordService,
  priorRemoteScopedCheapLfsPayloadPasswordAccount,
  readSavedCheapLfsPayloadPassword,
  saveCheapLfsPayloadPassword,
} from '../../../src/lib/cheap-lfs/payload-encryption-credentials'

const repository = {
  id: 7,
  path: 'C:\\work\\encrypted-repository',
  gitHubRepository: null,
}

function createVault(initial: string | null = null): {
  readonly vault: ICheapLfsCredentialVault
  readonly savedValues: string[]
  readonly values: Map<string, string>
} {
  const key = (service: string, account: string) => `${service}\0${account}`
  const values = new Map<string, string>()
  if (initial !== null) {
    values.set(
      key(
        CheapLfsPayloadPasswordService,
        cheapLfsPayloadPasswordAccount(repository)
      ),
      initial
    )
  }
  const savedValues = new Array<string>()
  return {
    savedValues,
    values,
    vault: {
      getItem: async (service, account) =>
        values.get(key(service, account)) ?? null,
      setItem: async (service, account, next) => {
        values.set(key(service, account), next)
        savedValues.push(next)
      },
      deleteItem: async (service, account) =>
        values.delete(key(service, account)),
    },
  }
}

const CredentialFingerprintKey = randomBytes(32)

function credentialFingerprint(value: string | Buffer): string {
  return createHmac('sha256', CredentialFingerprintKey)
    .update(value)
    .digest('hex')
}

function runtimeCredential(): {
  readonly value: string
  readonly digest: string
} {
  const value = randomBytes(32).toString('base64url')
  return {
    value,
    digest: credentialFingerprint(value),
  }
}

function assertCredentialDigest(
  value: string | Buffer | null | undefined,
  expectedDigest: string
): void {
  assert.equal(
    credentialFingerprint(Buffer.isBuffer(value) ? value : value ?? ''),
    expectedDigest
  )
}

describe('Cheap LFS operation-scoped payload passwords', () => {
  it('reuses a deliberately saved vault credential without prompting', async () => {
    const sentinel = runtimeCredential()
    const { vault } = createVault(sentinel.value)
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
    assertCredentialDigest(credential?.password, sentinel.digest)
    credential?.password.fill(0)
  })

  it('prompts again for every operation when Save was left off', async () => {
    const { vault, savedValues } = createVault()
    const sentinels = [runtimeCredential(), runtimeCredential()]
    let prompts = 0
    const prompt = async () => {
      const sentinel = sentinels[prompts++]
      return {
        password: Buffer.from(sentinel.value, 'utf8'),
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
    assertCredentialDigest(first?.password, sentinels[0].digest)
    first?.password.fill(0)

    const second = await acquireCheapLfsOperationPassword(
      repository,
      'encrypt',
      prompt,
      () => undefined,
      vault
    )
    assert.equal(second?.source, 'prompt')
    assertCredentialDigest(second?.password, sentinels[1].digest)
    second?.password.fill(0)

    assert.equal(prompts, 2)
    assert.deepEqual(savedValues, [])
  })

  it('saves a confirmed encryption password only when explicitly requested', async () => {
    const { vault, savedValues } = createVault()
    const sentinel = runtimeCredential()
    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'encrypt',
      async () => ({
        password: Buffer.from(sentinel.value, 'utf8'),
        rememberPassword: true,
      }),
      () => assert.fail('the fake vault is available'),
      vault
    )

    assert.equal(credential?.source, 'prompt')
    assert.equal(credential?.rememberPassword, false)
    assert.equal(savedValues.length, 1)
    assertCredentialDigest(savedValues[0], sentinel.digest)
    credential?.password.fill(0)
  })

  it('defers a decrypt password save until the caller verifies authentication', async () => {
    const { vault, savedValues } = createVault()
    const sentinel = runtimeCredential()
    const credential = await acquireCheapLfsOperationPassword(
      repository,
      'decrypt',
      async () => ({
        password: Buffer.from(sentinel.value, 'utf8'),
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

  it('migrates and deletes the legacy numeric credential entry', async () => {
    const { vault, values } = createVault()
    const sentinel = runtimeCredential()
    const legacyKey = `${LegacyCheapLfsPayloadPasswordService}\0${legacyCheapLfsPayloadPasswordAccount(
      repository
    )}`
    const stableKey = `${CheapLfsPayloadPasswordService}\0${cheapLfsPayloadPasswordAccount(
      repository
    )}`
    values.set(legacyKey, sentinel.value)

    const result = await readSavedCheapLfsPayloadPassword(repository, vault)

    assert.equal(result.kind, 'saved')
    assertCredentialDigest(
      result.kind === 'saved' ? result.password : null,
      sentinel.digest
    )
    if (result.kind === 'saved') {
      result.password.fill(0)
    }
    assertCredentialDigest(values.get(stableKey), sentinel.digest)
    assert.equal(values.has(legacyKey), false)
  })

  it('uses one durable key across remove/re-add and leaves no old or new orphan', async () => {
    const readdedRepository = {
      ...repository,
      id: 91,
    }
    assert.equal(
      cheapLfsPayloadPasswordAccount(repository),
      cheapLfsPayloadPasswordAccount(readdedRepository)
    )
    const { vault, values } = createVault()
    const sentinel = runtimeCredential()
    const credential = Buffer.from(sentinel.value)
    assert.equal(
      await saveCheapLfsPayloadPassword(repository, credential, vault),
      true
    )
    credential.fill(0)

    const afterReadd = await readSavedCheapLfsPayloadPassword(
      readdedRepository,
      vault
    )
    assert.equal(afterReadd.kind, 'saved')
    if (afterReadd.kind === 'saved') {
      afterReadd.password.fill(0)
    }

    values.set(
      `${LegacyCheapLfsPayloadPasswordService}\0${legacyCheapLfsPayloadPasswordAccount(
        repository
      )}`,
      runtimeCredential().value
    )
    assert.equal(
      await forgetSavedCheapLfsPayloadPassword(repository, vault),
      'deleted'
    )
    assert.deepEqual([...values.keys()], [])

    assert.deepEqual(
      await readSavedCheapLfsPayloadPassword(readdedRepository, vault),
      { kind: 'missing' }
    )
  })

  it('keeps the durable account invariant across association and remote rename', () => {
    const local = {
      ...repository,
      gitHubRepository: null,
    }
    const associated = {
      ...repository,
      gitHubRepository: { fullName: 'owner/first-name' },
    } as unknown as typeof repository
    const renamed = {
      ...repository,
      gitHubRepository: { fullName: 'owner/renamed' },
    } as unknown as typeof repository

    assert.equal(
      cheapLfsPayloadPasswordAccount(local),
      cheapLfsPayloadPasswordAccount(associated)
    )
    assert.equal(
      cheapLfsPayloadPasswordAccount(associated),
      cheapLfsPayloadPasswordAccount(renamed)
    )
    assert.notEqual(
      priorRemoteScopedCheapLfsPayloadPasswordAccount(associated),
      priorRemoteScopedCheapLfsPayloadPasswordAccount(renamed)
    )
  })

  it('returns a usable saved value when canonical write succeeds but alias cleanup fails', async () => {
    const sentinel = runtimeCredential()
    const { vault, values } = createVault()
    const legacyKey = `${LegacyCheapLfsPayloadPasswordService}\0${legacyCheapLfsPayloadPasswordAccount(
      repository
    )}`
    values.set(legacyKey, sentinel.value)
    vault.deleteItem = async () => {
      throw new Error('cleanup unavailable')
    }

    const result = await readSavedCheapLfsPayloadPassword(repository, vault)

    assert.equal(result.kind, 'saved')
    if (result.kind === 'saved') {
      assert.equal(result.cleanupPending, true)
      assertCredentialDigest(result.password, sentinel.digest)
      result.password.fill(0)
    }
    assertCredentialDigest(
      values.get(
        `${CheapLfsPayloadPasswordService}\0${cheapLfsPayloadPasswordAccount(
          repository
        )}`
      ),
      sentinel.digest
    )
    assert.equal(values.has(legacyKey), true)
  })

  it('reports a canonical save as successful when only obsolete cleanup fails', async () => {
    const sentinel = runtimeCredential()
    const { vault, values } = createVault()
    vault.deleteItem = async () => {
      throw new Error('cleanup unavailable')
    }

    assert.equal(
      await saveCheapLfsPayloadPassword(
        repository,
        Buffer.from(sentinel.value),
        vault
      ),
      true
    )
    assertCredentialDigest(
      values.get(
        `${CheapLfsPayloadPasswordService}\0${cheapLfsPayloadPasswordAccount(
          repository
        )}`
      ),
      sentinel.digest
    )
  })

  it('sends only account labels to the main-process cleanup primitive', async () => {
    const sentinel = runtimeCredential()
    let serializedRequest = ''
    const result = await cleanupLegacyCheapLfsPayloadPasswords(
      [repository],
      async request => {
        serializedRequest = JSON.stringify(request)
        return { kind: 'cleaned', migrated: 0, deleted: 0, pending: 0 }
      }
    )

    assert.equal(result.kind, 'cleaned')
    assert.doesNotMatch(serializedRequest, /password/i)
    assert.equal(serializedRequest.includes(sentinel.value), false)
    assert.match(serializedRequest, /canonicalAccount/)
    assert.match(serializedRequest, /legacyNumericAccount/)
  })
})
