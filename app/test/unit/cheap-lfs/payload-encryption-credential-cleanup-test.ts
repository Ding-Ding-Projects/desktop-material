import assert from 'node:assert'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  CheapLfsPayloadPasswordService,
  LegacyCheapLfsPayloadPasswordService,
} from '../../../src/lib/cheap-lfs/payload-encryption-credential-cleanup'
import {
  cleanupCheapLfsPayloadCredentialsInMainProcess,
  ICheapLfsMainProcessCredentialVault,
} from '../../../src/main-process/cheap-lfs-payload-credential-cleanup'

const account = (label: string) =>
  createHash('sha256').update(label).digest('hex')

function sentinel(): { readonly value: string } {
  const value = randomBytes(32).toString('base64url')
  return { value }
}

function assertCredentialValue(
  value: string | undefined,
  expected: string
): void {
  const actual = Buffer.from(value ?? '', 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  const matches =
    actual.length === expectedBytes.length &&
    timingSafeEqual(actual, expectedBytes)
  actual.fill(0)
  expectedBytes.fill(0)
  assert.equal(matches, true)
}

class CredentialVault implements ICheapLfsMainProcessCredentialVault {
  public readonly values = new Map<string, string>()
  public readonly failingDeletes = new Set<string>()

  private key(service: string, accountName: string): string {
    return `${service}\0${accountName}`
  }

  public seed(service: string, accountName: string, value: string): void {
    this.values.set(this.key(service, accountName), value)
  }

  public async findCredentials(service: string) {
    const prefix = `${service}\0`
    return [...this.values]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, password]) => ({
        account: key.slice(prefix.length),
        password,
      }))
  }

  public async setPassword(
    service: string,
    accountName: string,
    password: string
  ): Promise<void> {
    this.values.set(this.key(service, accountName), password)
  }

  public async deletePassword(
    service: string,
    accountName: string
  ): Promise<boolean> {
    const key = this.key(service, accountName)
    if (this.failingDeletes.has(key)) {
      throw new Error('synthetic account-only deletion failure')
    }
    return this.values.delete(key)
  }

  public get(service: string, accountName: string): string | undefined {
    return this.values.get(this.key(service, accountName))
  }
}

describe('main-process Cheap LFS credential cleanup', () => {
  it('migrates known aliases and deletes legacy and stable orphans without returning values', async () => {
    const vault = new CredentialVault()
    const current = sentinel()
    const unrelated = sentinel()
    const canonicalAccount = account('canonical')
    const priorAlias = account('prior path plus remote')
    const stableOrphan = account('removed repository')
    vault.seed(CheapLfsPayloadPasswordService, priorAlias, current.value)
    vault.seed(CheapLfsPayloadPasswordService, stableOrphan, unrelated.value)
    vault.seed(
      LegacyCheapLfsPayloadPasswordService,
      'repository-91',
      current.value
    )
    vault.seed(
      LegacyCheapLfsPayloadPasswordService,
      'repository-7',
      unrelated.value
    )

    const result = await cleanupCheapLfsPayloadCredentialsInMainProcess(
      {
        currentRepositories: [
          {
            canonicalAccount,
            legacyNumericAccount: 'repository-91',
            priorStableAliases: [priorAlias],
          },
        ],
      },
      vault
    )

    assert.deepEqual(result, {
      kind: 'cleaned',
      migrated: 1,
      deleted: 4,
      pending: 0,
    })
    assertCredentialValue(
      vault.get(CheapLfsPayloadPasswordService, canonicalAccount),
      current.value
    )
    assert.equal(vault.values.size, 1)
    assert.equal(JSON.stringify(result).includes(current.value), false)
    assert.equal(JSON.stringify(result).includes(unrelated.value), false)
  })

  it('keeps a canonical write usable when deleting its legacy source must retry', async () => {
    const vault = new CredentialVault()
    const current = sentinel()
    const canonicalAccount = account('canonical retry')
    const legacyAccount = 'repository-42'
    vault.seed(
      LegacyCheapLfsPayloadPasswordService,
      legacyAccount,
      current.value
    )
    vault.failingDeletes.add(
      `${LegacyCheapLfsPayloadPasswordService}\0${legacyAccount}`
    )

    const result = await cleanupCheapLfsPayloadCredentialsInMainProcess(
      {
        currentRepositories: [
          {
            canonicalAccount,
            legacyNumericAccount: legacyAccount,
            priorStableAliases: [],
          },
        ],
      },
      vault
    )

    assert.deepEqual(result, {
      kind: 'cleanup-pending',
      migrated: 1,
      deleted: 0,
      pending: 1,
    })
    assertCredentialValue(
      vault.get(CheapLfsPayloadPasswordService, canonicalAccount),
      current.value
    )
    assertCredentialValue(
      vault.get(LegacyCheapLfsPayloadPasswordService, legacyAccount),
      current.value
    )
    assert.equal(JSON.stringify(result).includes(current.value), false)
  })

  it('returns no error detail or credential value when enumeration is unavailable', async () => {
    const current = sentinel()
    const unavailable: ICheapLfsMainProcessCredentialVault = {
      findCredentials: async () => {
        throw new Error(current.value)
      },
      setPassword: async () => undefined,
      deletePassword: async () => false,
    }

    const result = await cleanupCheapLfsPayloadCredentialsInMainProcess(
      { currentRepositories: [] },
      unavailable
    )

    assert.deepEqual(result, { kind: 'unavailable' })
    assert.equal(JSON.stringify(result).includes(current.value), false)
  })
})
