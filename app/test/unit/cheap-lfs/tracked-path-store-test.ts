import assert from 'node:assert'
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { TestContext } from 'node:test'
import {
  CheapLfsTrackedPathError,
  CheapLfsTrackedPathStore,
} from '../../../src/lib/cheap-lfs/tracked-path-store'

async function repository(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-path-store-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function recoveryDirectories(root: string): Promise<string[]> {
  return (await readdir(root)).filter(name =>
    name.includes('cheap-lfs-recovery')
  )
}

async function trackedError(
  operation: Promise<unknown>
): Promise<CheapLfsTrackedPathError> {
  try {
    await operation
  } catch (error) {
    assert.ok(error instanceof CheapLfsTrackedPathError)
    return error
  }
  assert.fail('Expected a CheapLfsTrackedPathError.')
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(path), { code: 'ENOENT' })
}

describe('Cheap LFS tracked path store', () => {
  it('publishes a pointer through quarantine and leaves no recovery artifact', async t => {
    const root = await repository(t)
    const path = join(root, 'payload.bin')
    await writeFile(path, 'raw payload')
    const store = new CheapLfsTrackedPathStore()
    const proof = await store.proveExisting(root, 'payload.bin')

    await store.publishText(proof, 'pointer text\n')

    assert.equal(await readFile(path, 'utf8'), 'pointer text\n')
    assert.deepEqual(await recoveryDirectories(root), [])
  })

  it('restores a replacement claimed immediately before quarantine', async t => {
    const root = await repository(t)
    const path = join(root, 'race.bin')
    const originalPath = join(root, 'original-kept.bin')
    await writeFile(path, 'expected original')
    const store = new CheapLfsTrackedPathStore({
      beforeQuarantine: async () => {
        await rename(path, originalPath)
        await writeFile(path, 'concurrent replacement')
      },
    })
    const proof = await store.proveExisting(root, 'race.bin')

    const error = await trackedError(store.publishText(proof, 'pointer text\n'))

    assert.equal(await readFile(path, 'utf8'), 'concurrent replacement')
    assert.equal(await readFile(originalPath, 'utf8'), 'expected original')
    assert.equal(error.recoveryPaths.length, 1)
  })

  it('preserves the original, replacement, and racer when publication collides', async t => {
    const root = await repository(t)
    const path = join(root, 'collision.bin')
    await writeFile(path, 'expected original')
    const store = new CheapLfsTrackedPathStore({
      beforePublish: async () => {
        await writeFile(path, 'concurrent destination')
      },
    })
    const proof = await store.proveExisting(root, 'collision.bin')

    const error = await trackedError(
      store.publishText(proof, 'pointer replacement\n')
    )

    assert.equal(await readFile(path, 'utf8'), 'concurrent destination')
    assert.equal(error.recoveryPaths.length, 1)
    assert.equal(
      await readFile(join(error.recoveryPaths[0], 'original'), 'utf8'),
      'expected original'
    )
    assert.equal(
      await readFile(join(error.recoveryPaths[0], 'replacement'), 'utf8'),
      'pointer replacement\n'
    )
  })

  it('does not remove a file swapped at the final deletion boundary', async t => {
    const root = await repository(t)
    const path = join(root, 'remove.bin')
    const originalPath = join(root, 'remove-original.bin')
    await writeFile(path, 'expected original')
    const store = new CheapLfsTrackedPathStore({
      beforeQuarantine: async () => {
        await rename(path, originalPath)
        await writeFile(path, 'keep this replacement')
      },
    })
    const proof = await store.proveExisting(root, 'remove.bin')

    await assert.rejects(store.remove(proof), CheapLfsTrackedPathError)

    assert.equal(await readFile(path, 'utf8'), 'keep this replacement')
    assert.equal(await readFile(originalPath, 'utf8'), 'expected original')
  })

  it('uses exact absence and never overwrites a concurrently created target', async t => {
    const root = await repository(t)
    const path = join(root, 'absent.bin')
    const store = new CheapLfsTrackedPathStore({
      beforePublish: async () => {
        await writeFile(path, 'concurrent target')
      },
    })
    const proof = await store.proveDestination(root, 'absent.bin')

    const error = await trackedError(store.publishText(proof, 'new pointer\n'))

    assert.equal(await readFile(path, 'utf8'), 'concurrent target')
    assert.equal(error.recoveryPaths.length, 1)
    assert.equal(
      await readFile(join(error.recoveryPaths[0], 'replacement'), 'utf8'),
      'new pointer\n'
    )
  })

  it('rejects a nested junction before reading any outside payload', async t => {
    const root = await repository(t)
    const outside = await repository(t)
    await writeFile(join(outside, 'outside.bin'), 'outside secret')
    try {
      await symlink(
        outside,
        join(root, 'redirect'),
        process.platform === 'win32' ? 'junction' : 'dir'
      )
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'EPERM' ||
        (error as NodeJS.ErrnoException).code === 'EACCES'
      ) {
        t.skip('Creating junctions requires elevated Windows privileges.')
        return
      }
      throw error
    }
    const store = new CheapLfsTrackedPathStore()

    await assert.rejects(
      store.proveExisting(root, 'redirect/outside.bin'),
      /symlink or junction/
    )
    assert.equal(
      await readFile(join(outside, 'outside.bin'), 'utf8'),
      'outside secret'
    )
  })

  it('rolls an earlier batch member back when a later destination is swapped', async t => {
    const root = await repository(t)
    const first = join(root, 'first.bin')
    const second = join(root, 'second.bin')
    const secondOriginal = join(root, 'second-original.bin')
    await writeFile(first, 'first raw')
    await writeFile(second, 'second raw')
    let boundary = 0
    const store = new CheapLfsTrackedPathStore({
      beforeQuarantine: async proof => {
        boundary++
        if (boundary === 2) {
          await rename(proof.absolutePath, secondOriginal)
          await writeFile(proof.absolutePath, 'second racer')
        }
      },
    })
    const firstProof = await store.proveExisting(root, 'first.bin')
    const secondProof = await store.proveExisting(root, 'second.bin')

    const error = await trackedError(
      store.publishTextBatch([
        { proof: firstProof, text: 'first pointer\n' },
        { proof: secondProof, text: 'second pointer\n' },
      ])
    )

    assert.equal(await readFile(first, 'utf8'), 'first raw')
    assert.equal(await readFile(second, 'utf8'), 'second racer')
    assert.equal(await readFile(secondOriginal, 'utf8'), 'second raw')
    assert.ok(error.recoveryPaths.length >= 1)
    assert.equal(
      await readFile(join(error.recoveryPaths[0], 'replacement'), 'utf8'),
      'second pointer\n'
    )
  })

  it('consumes verified materialization temps on success, failure, and cancel', async t => {
    const root = await repository(t)
    const success = join(root, 'success.bin')
    const successTemp = join(root, 'success.tmp')
    await writeFile(success, 'pointer')
    await writeFile(successTemp, 'restored')
    const successStore = new CheapLfsTrackedPathStore()
    await successStore.replaceFromPath(
      await successStore.proveExisting(root, 'success.bin'),
      successTemp,
      'eb00bf0aba491c620ddf47bf68068be4cc52c39bf3b8b554e2c51ff74e5e915e',
      8
    )
    assert.equal(await readFile(success, 'utf8'), 'restored')
    await assertMissing(successTemp)

    const failed = join(root, 'failed.bin')
    const failedTemp = join(root, 'failed.tmp')
    await writeFile(failed, 'pointer')
    await writeFile(failedTemp, 'restored')
    const failedStore = new CheapLfsTrackedPathStore({
      beforePublish: async proof => {
        await writeFile(proof.absolutePath, 'racer')
      },
    })
    const failedError = await trackedError(
      failedStore.replaceFromPath(
        await failedStore.proveExisting(root, 'failed.bin'),
        failedTemp,
        'eb00bf0aba491c620ddf47bf68068be4cc52c39bf3b8b554e2c51ff74e5e915e',
        8
      )
    )
    assert.equal(await readFile(failed, 'utf8'), 'racer')
    assert.ok(failedError.recoveryPaths.length >= 1)
    await assertMissing(failedTemp)

    const canceled = join(root, 'canceled.bin')
    const canceledTemp = join(root, 'canceled.tmp')
    await writeFile(canceled, 'pointer')
    await writeFile(canceledTemp, 'restored')
    const canceledStore = new CheapLfsTrackedPathStore()
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      canceledStore.replaceFromPath(
        await canceledStore.proveExisting(root, 'canceled.bin'),
        canceledTemp,
        'eb00bf0aba491c620ddf47bf68068be4cc52c39bf3b8b554e2c51ff74e5e915e',
        8,
        controller.signal
      ),
      { name: 'AbortError' }
    )
    assert.equal(await readFile(canceled, 'utf8'), 'pointer')
    await assertMissing(canceledTemp)
  })
})
