import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
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
  it('keeps recovery staging bounded for 255-unit filenames', async t => {
    const root = await repository(t)
    const targetName = `${'p'.repeat(251)}.bin`
    const sourceName = `${'s'.repeat(251)}.tmp`
    assert.equal(targetName.length, 255)
    assert.equal(sourceName.length, 255)
    const target = join(root, targetName)
    const source = join(root, sourceName)
    const store = new CheapLfsTrackedPathStore()

    await writeFile(target, 'raw payload')
    await store.publishText(
      await store.proveExisting(root, targetName),
      'pointer\n'
    )
    assert.equal(await readFile(target, 'utf8'), 'pointer\n')

    await writeFile(source, 'restored')
    await store.replaceFromPath(
      await store.proveExisting(root, targetName),
      source,
      'eb00bf0aba491c620ddf47bf68068be4cc52c39bf3b8b554e2c51ff74e5e915e',
      8
    )

    assert.equal(await readFile(target, 'utf8'), 'restored')
    await assertMissing(source)
    assert.deepEqual(await recoveryDirectories(root), [])
  })

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

  it('defers the destination hash to the owned-copy proof and publishes by identity', async t => {
    const root = await repository(t)
    const path = join(root, 'large.bin')
    const payload = 'original payload bytes'
    await writeFile(path, payload)
    const store = new CheapLfsTrackedPathStore()

    const verified = await store.prepareUpload(
      root,
      'large.bin',
      path,
      1024 * 1024
    )

    // The pre-copy proofs are identity-only; the streamed owned copy is the
    // single authoritative content hash for the upload.
    assert.equal(verified.destination.exists, true)
    assert.equal(verified.destination.sha256, null)
    assert.equal(
      verified.sha256,
      createHash('sha256').update(payload).digest('hex')
    )
    assert.equal(verified.source.sha256, verified.sha256)
    assert.equal(
      await readFile(verified.owned.path, 'utf8'),
      payload,
      'owned copy holds the verified bytes'
    )

    // An unchanged identity revalidates without re-reading the content, and
    // the deferred-hash destination proof still publishes through quarantine.
    await store.revalidateSource(verified.source)
    await store.publishText(verified.destination, 'pointer text\n')
    assert.equal(await readFile(path, 'utf8'), 'pointer text\n')
    assert.deepEqual(await recoveryDirectories(root), [])
    await store.cleanupOwned(verified.owned)
  })

  it('fails closed on identity drift and re-hashes only under a full content proof', async t => {
    const root = await repository(t)
    const path = join(root, 'drift.bin')
    await writeFile(path, 'first payload content')
    const store = new CheapLfsTrackedPathStore()
    const verified = await store.prepareUpload(
      root,
      'drift.bin',
      path,
      1024 * 1024
    )

    // A same-size rewrite drifts only the identity metadata. The deferred-hash
    // proofs must fail closed instead of trusting stale identities.
    const beforeRewrite = await stat(path, { bigint: true })
    await writeFile(path, 'other payload content')
    const afterRewrite = await stat(path, { bigint: true })
    assert.equal(
      afterRewrite.size,
      beforeRewrite.size,
      'the rewrite is same-size, so only a timestamp can reveal it'
    )
    assert.notEqual(
      afterRewrite.mtimeNs,
      beforeRewrite.mtimeNs,
      'the capture settled past one timestamp tick, so the rewrite must move mtime'
    )
    await assert.rejects(
      store.revalidateSource(verified.source),
      CheapLfsTrackedPathError
    )
    const publishError = await trackedError(
      store.publishText(verified.destination, 'pointer text\n')
    )
    assert.ok(publishError.recoveryPaths.length >= 1)
    assert.equal(await readFile(path, 'utf8'), 'other payload content')
    await store.cleanupOwned(verified.owned)

    // A metadata-only touch under a full (hashed) proof falls back to the
    // content re-hash and still publishes.
    const touched = join(root, 'touched.bin')
    await writeFile(touched, 'stable content')
    const hashedProof = await store.proveExisting(root, 'touched.bin')
    const past = new Date(Date.now() - 60_000)
    await utimes(touched, past, past)
    await store.publishText(hashedProof, 'pointer after touch\n')
    assert.equal(await readFile(touched, 'utf8'), 'pointer after touch\n')
  })

  it('refuses a racy identity that cannot prove its own content', async t => {
    const root = await repository(t)
    const store = new CheapLfsTrackedPathStore()
    // A modification time that is not older than the capture is exactly the
    // "racily clean" case: a same-size rewrite landing in that window leaves
    // mtime, ctime, and size identical, so the identity proves nothing. A
    // future timestamp pins the store on that branch without depending on how
    // fast this machine's disk happens to be.
    const unreachable = new Date(Date.now() + 3_600_000)

    const deferred = join(root, 'racy-deferred.bin')
    await writeFile(deferred, 'first payload content')
    await utimes(deferred, unreachable, unreachable)
    const verified = await store.prepareUpload(
      root,
      'racy-deferred.bin',
      deferred,
      1024 * 1024
    )
    assert.equal(verified.destination.sha256, null)

    // The source proof carries the hash the owned copy backfilled, so the same
    // racy identity re-hashes and still revalidates rather than failing.
    await store.revalidateSource(verified.source)

    // Nothing at all changed on disk, so a pure identity comparison would say
    // "unchanged" and publish. Without a content proof there is nothing to fall
    // back to, so the deferred proof must fail closed instead.
    const before = await stat(deferred, { bigint: true })
    const publishError = await trackedError(
      store.publishText(verified.destination, 'pointer text\n')
    )
    // Only the store's own quarantine-and-restore touched this file, and that
    // moves ctime alone: the inode, mtime, and size it was proven with are
    // untouched, so the refusal came from the racy capture and nothing else.
    const after = await stat(deferred, { bigint: true })
    assert.equal(after.ino, before.ino, 'the proven inode never drifted')
    assert.equal(
      after.mtimeNs,
      before.mtimeNs,
      'the proven modification time never drifted'
    )
    assert.equal(after.size, before.size, 'the proven size never drifted')
    assert.ok(publishError.recoveryPaths.length >= 1)
    assert.equal(await readFile(deferred, 'utf8'), 'first payload content')

    await store.cleanupOwned(verified.owned)

    // A tracked proof carrying its own full content proof publishes through the
    // very same racy identity, by paying the content re-hash instead.
    const hashed = join(root, 'racy-hashed.bin')
    await writeFile(hashed, 'first payload content')
    await utimes(hashed, unreachable, unreachable)
    const hashedProof = await store.proveExisting(root, 'racy-hashed.bin')
    assert.ok(hashedProof.sha256 !== null)
    const preserved = await recoveryDirectories(root)
    await store.publishText(hashedProof, 'pointer after re-hash\n')
    assert.equal(await readFile(hashed, 'utf8'), 'pointer after re-hash\n')
    assert.deepEqual(
      await recoveryDirectories(root),
      preserved,
      'the re-hashed publish left no new recovery artifact'
    )
  })

  it('reads only a proven prefix and refuses an unsettled identity', async t => {
    const root = await repository(t)
    const store = new CheapLfsTrackedPathStore()
    const stable = join(root, 'stable-prefix.bin')
    await writeFile(stable, 'version bounded-pointer\nunread payload')
    const stableProof = await store.proveDestinationIdentity(
      root,
      'stable-prefix.bin'
    )

    assert.equal(await store.readTextPrefix(stableProof, 7), 'version')
    await assert.rejects(
      store.readTextPrefix(stableProof, Number.POSITIVE_INFINITY),
      CheapLfsTrackedPathError
    )

    // A future mtime cannot settle, so same-size writes inside that filesystem
    // tick would not be distinguishable by identity metadata. Prefix reads
    // must reject the proof even when no observable metadata has drifted.
    const racy = join(root, 'racy-prefix.bin')
    await writeFile(racy, 'version bounded-pointer\nunread payload')
    const unreachable = new Date(Date.now() + 3_600_000)
    await utimes(racy, unreachable, unreachable)
    const racyProof = await store.proveDestinationIdentity(
      root,
      'racy-prefix.bin'
    )
    const before = await stat(racy, { bigint: true })

    await assert.rejects(
      store.readTextPrefix(racyProof, 7),
      CheapLfsTrackedPathError
    )

    const after = await stat(racy, { bigint: true })
    assert.equal(after.ino, before.ino)
    assert.equal(after.mtimeNs, before.mtimeNs)
    assert.equal(after.size, before.size)
    assert.equal(
      await readFile(racy, 'utf8'),
      'version bounded-pointer\nunread payload'
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

describe('Cheap LFS repository root canonicalization', () => {
  it('names the reason the root could not be canonicalized', async t => {
    const root = await repository(t)
    const store = new CheapLfsTrackedPathStore()
    // A root that is simply not there. Before, every distinct cause collapsed
    // into one sentence that told the user canonicalization had failed but
    // never which failure it was, so there was nothing to act on.
    const missing = join(root, 'was-moved-or-deleted')

    const error = await store
      .proveExisting(missing, 'payload.bin')
      .then(
        () => null,
        (raised: unknown) => raised as CheapLfsTrackedPathError
      )

    assert.ok(error instanceof CheapLfsTrackedPathError)
    assert.match(error.message, /could not canonicalize the repository root/)
    // The two things that make it actionable: which path, and which errno.
    assert.ok(
      error.message.includes(missing),
      `message should name the path it failed on: ${error.message}`
    )
    assert.match(error.message, /ENOENT/)
  })

  it('still canonicalizes a healthy root without complaint', async t => {
    const root = await repository(t)
    const store = new CheapLfsTrackedPathStore()
    await writeFile(join(root, 'payload.bin'), 'raw payload')

    const proof = await store.proveExisting(root, 'payload.bin')
    assert.equal(proof.exists, true)
  })
})
