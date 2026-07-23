import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsGhcrKeyError,
  CheapLfsLegacyGhcrRepositoryKeyPath,
  CheapLfsRegistryRepositoryKeyPath,
  captureCheapLfsCreatedRepositoryKeyCleanupProof,
  discardCheapLfsCreatedRepositoryKeyIfUnchanged,
  isCheapLfsRepositoryKeyPath,
  resolveCheapLfsGhcrRepositoryKey,
  resolveCheapLfsRegistryRepositoryKeyForId,
} from '../../../src/lib/cheap-lfs/ghcr-key'

const roots: string[] = []

async function root() {
  const path = await mkdtemp(join(tmpdir(), 'cheap-lfs-registry-key-test-'))
  roots.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  )
})

describe('Cheap LFS tracked registry key', () => {
  it('reserves canonical and legacy key paths case-insensitively', () => {
    assert.equal(
      isCheapLfsRepositoryKeyPath(
        '.DESKTOP-MATERIAL\\CHEAP-LFS-REGISTRY-KEY-V1'
      ),
      true
    )
    assert.equal(
      isCheapLfsRepositoryKeyPath('.Desktop-Material/Cheap-Lfs-Ghcr-Key-V1'),
      true
    )
    assert.equal(
      isCheapLfsRepositoryKeyPath(
        '.desktop-material/cheap-lfs-registry-key-v1.backup'
      ),
      false
    )
  })

  it('uses no key for verified-public repositories and fails closed otherwise', async () => {
    const repositoryPath = await root()
    assert.deepEqual(
      await resolveCheapLfsGhcrRepositoryKey({
        repositoryPath,
        visibility: 'verified-public',
        createIfMissing: false,
      }),
      {
        path: null,
        key: null,
        created: false,
        migratedFromLegacy: false,
      }
    )

    await assert.rejects(
      resolveCheapLfsGhcrRepositoryKey({
        repositoryPath,
        visibility: 'unknown',
        createIfMissing: false,
      }),
      (error: unknown) =>
        error instanceof CheapLfsGhcrKeyError &&
        error.kind === 'visibility-unverified'
    )
    await assert.rejects(
      resolveCheapLfsGhcrRepositoryKey({
        repositoryPath,
        visibility: 'verified-private',
        createIfMissing: false,
      }),
      (error: unknown) =>
        error instanceof CheapLfsGhcrKeyError && error.kind === 'missing-key'
    )
  })

  it('creates the provider-neutral tracked key only on an explicit private flow', async () => {
    const repositoryPath = await root()
    const expected = Buffer.alloc(32, 0x2a)
    const result = await resolveCheapLfsGhcrRepositoryKey({
      repositoryPath,
      visibility: 'verified-private',
      createIfMissing: true,
      generateRandomBytes: () => Buffer.from(expected),
    })
    try {
      assert.equal(result.created, true)
      assert.equal(result.migratedFromLegacy, false)
      assert.equal(
        result.path?.endsWith(
          CheapLfsRegistryRepositoryKeyPath.replaceAll('/', '\\')
        ),
        true
      )
      assert.deepEqual(result.key, expected)
      assert.equal(
        await readFile(result.path!, 'utf8'),
        `desktop-material-cheap-lfs-registry-key-v1\n${expected.toString(
          'base64url'
        )}\n`
      )
    } finally {
      result.key?.fill(0)
      expected.fill(0)
    }
  })

  it('migrates a legacy GHCR key byte-for-byte and retains the historical file', async () => {
    const repositoryPath = await root()
    const directory = join(repositoryPath, '.desktop-material')
    await mkdir(directory)
    const key = Buffer.alloc(32, 0x17)
    const legacyPath = join(repositoryPath, CheapLfsLegacyGhcrRepositoryKeyPath)
    await writeFile(
      legacyPath,
      `desktop-material-cheap-lfs-ghcr-key-v1\n${key.toString('base64url')}\n`
    )

    const result = await resolveCheapLfsGhcrRepositoryKey({
      repositoryPath,
      visibility: 'verified-private',
      createIfMissing: true,
    })
    try {
      assert.equal(result.created, true)
      assert.equal(result.migratedFromLegacy, true)
      assert.deepEqual(result.key, key)
      assert.match(await readFile(legacyPath, 'utf8'), /cheap-lfs-ghcr-key-v1/)
      assert.match(await readFile(result.path!, 'utf8'), /registry-key-v1/)
    } finally {
      result.key?.fill(0)
    }
  })

  it('selects a retained historical key by config keyId', async () => {
    const repositoryPath = await root()
    const directory = join(repositoryPath, '.desktop-material')
    await mkdir(directory)
    const current = Buffer.alloc(32, 0x31)
    const historical = Buffer.alloc(32, 0x32)
    await writeFile(
      join(repositoryPath, CheapLfsRegistryRepositoryKeyPath),
      `desktop-material-cheap-lfs-registry-key-v1\n${current.toString(
        'base64url'
      )}\n`
    )
    await writeFile(
      join(repositoryPath, CheapLfsLegacyGhcrRepositoryKeyPath),
      `desktop-material-cheap-lfs-ghcr-key-v1\n${historical.toString(
        'base64url'
      )}\n`
    )
    const keyId = `sha256:${createHash('sha256')
      .update(historical)
      .digest('hex')}`

    const result = await resolveCheapLfsRegistryRepositoryKeyForId({
      repositoryPath,
      keyId,
    })
    try {
      assert.deepEqual(result.key, historical)
      assert.equal(result.path?.endsWith('cheap-lfs-ghcr-key-v1'), true)
    } finally {
      result.key?.fill(0)
    }
  })

  it('retains a concurrently replaced newly-created key during cleanup', async () => {
    const repositoryPath = await root()
    const createdBytes = Buffer.alloc(32, 0x41)
    const replacementBytes = Buffer.alloc(32, 0x42)
    const result = await resolveCheapLfsGhcrRepositoryKey({
      repositoryPath,
      visibility: 'verified-private',
      createIfMissing: true,
      generateRandomBytes: () => Buffer.from(createdBytes),
    })
    try {
      const proof = await captureCheapLfsCreatedRepositoryKeyCleanupProof(
        result.path!,
        result.key!
      )
      await unlink(result.path!)
      const replacementText = `desktop-material-cheap-lfs-registry-key-v1\n${replacementBytes.toString(
        'base64url'
      )}\n`
      await writeFile(result.path!, replacementText)

      assert.equal(
        await discardCheapLfsCreatedRepositoryKeyIfUnchanged(proof),
        'retained-replaced'
      )
      assert.equal(await readFile(result.path!, 'utf8'), replacementText)
    } finally {
      result.key?.fill(0)
      createdBytes.fill(0)
      replacementBytes.fill(0)
    }
  })
})
