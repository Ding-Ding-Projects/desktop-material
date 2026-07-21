import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  FileHandle,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, before, describe, it, mock } from 'node:test'
import type { IGitHubReleaseAsset } from '../../src/lib/github-releases'

let hardLinkAttempts = 0
let injectReservationRace = false
let failFallbackCopy = false
let replaceDestinationDuringFallbackWrite = false
let abortAfterFallbackSync: AbortController | null = null

function isFinalDestination(path: string): boolean {
  return /desktop(?: \(\d+\))?\.exe$/.test(path)
}

async function openWithFaults(
  path: string,
  flags: string
): Promise<FileHandle> {
  if (injectReservationRace && flags === 'wx' && path.endsWith('desktop.exe')) {
    injectReservationRace = false
    await writeFile(path, 'concurrent destination')
    throw Object.assign(new Error('destination appeared concurrently'), {
      code: 'EEXIST',
    })
  }

  const handle = await open(path, flags)
  if (flags === 'wx' && isFinalDestination(path)) {
    return new Proxy(handle, {
      get(target, property, receiver) {
        if (property === 'write' && failFallbackCopy) {
          return async () => {
            throw Object.assign(new Error('simulated copy failure'), {
              code: 'EIO',
            })
          }
        }
        if (property === 'write' && replaceDestinationDuringFallbackWrite) {
          return async (...args: Parameters<FileHandle['write']>) => {
            const result = await target.write(...args)
            replaceDestinationDuringFallbackWrite = false
            await unlink(path)
            await writeFile(path, 'replacement destination')
            return result
          }
        }
        if (property === 'sync' && abortAfterFallbackSync !== null) {
          return async () => {
            await target.sync()
            abortAfterFallbackSync?.abort()
            abortAfterFallbackSync = null
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  return handle
}

mock.module('fs/promises', {
  namedExports: {
    lstat,
    open: openWithFaults,
    unlink,
    link: async () => {
      hardLinkAttempts++
      throw Object.assign(new Error('hard links are unsupported'), {
        code: 'ENOTSUP',
      })
    },
  },
})

let downloadGitHubReleaseAsset: typeof import('../../src/lib/github-release-asset-download').downloadGitHubReleaseAsset

before(async () => {
  ;({ downloadGitHubReleaseAsset } = await import(
    '../../src/lib/github-release-asset-download'
  ))
})

const temporaryDirectories = new Array<string>()

afterEach(async () => {
  hardLinkAttempts = 0
  injectReservationRace = false
  failFallbackCopy = false
  replaceDestinationDuringFallbackWrite = false
  abortAfterFallbackSync = null
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(path => rm(path, { recursive: true, force: true }))
  )
})

function asset(bytes: Uint8Array): IGitHubReleaseAsset {
  return {
    id: 10,
    name: 'desktop.exe',
    label: null,
    state: 'uploaded',
    contentType: 'application/octet-stream',
    sizeInBytes: bytes.byteLength,
    downloadCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
}

describe('GitHub release asset download portability', () => {
  it('falls back from unsupported hard links without overwriting a collision', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-release-portability-')
    )
    temporaryDirectories.push(directory)
    const destination = join(directory, 'desktop.exe')
    await writeFile(destination, 'keep this file')
    const bytes = new TextEncoder().encode('portable release asset')

    const result = await downloadGitHubReleaseAsset(
      asset(bytes),
      new Response(bytes),
      destination,
      new AbortController().signal
    )

    assert.equal(result.path, join(directory, 'desktop (2).exe'))
    assert.equal(await readFile(destination, 'utf8'), 'keep this file')
    assert.deepEqual(await readFile(result.path), Buffer.from(bytes))
    assert.equal(hardLinkAttempts, 1)
    assert.deepEqual((await readdir(directory)).sort(), [
      'desktop (2).exe',
      'desktop.exe',
    ])
  })

  it('retries when the destination appears between link and fallback publish', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-release-race-')
    )
    temporaryDirectories.push(directory)
    const destination = join(directory, 'desktop.exe')
    const bytes = new TextEncoder().encode('race-safe release asset')
    injectReservationRace = true

    const result = await downloadGitHubReleaseAsset(
      asset(bytes),
      new Response(bytes),
      destination,
      new AbortController().signal
    )

    assert.equal(result.path, join(directory, 'desktop (2).exe'))
    assert.equal(await readFile(destination, 'utf8'), 'concurrent destination')
    assert.deepEqual(await readFile(result.path), Buffer.from(bytes))
    assert.deepEqual((await readdir(directory)).sort(), [
      'desktop (2).exe',
      'desktop.exe',
    ])
  })

  it('removes its owned temporary files when the fallback copy fails', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-release-copy-failure-')
    )
    temporaryDirectories.push(directory)
    const destination = join(directory, 'desktop.exe')
    const bytes = new TextEncoder().encode('copy failure fixture')
    failFallbackCopy = true

    await assert.rejects(
      downloadGitHubReleaseAsset(
        asset(bytes),
        new Response(bytes),
        destination,
        new AbortController().signal
      ),
      error =>
        (error as { readonly kind?: string }).kind === 'destination' &&
        (error as Error).name === 'GitHubReleaseAssetDownloadError'
    )

    assert.deepEqual(await readdir(directory), [])
  })

  it('preserves a replacement destination that appears during fallback copy', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-release-replacement-race-')
    )
    temporaryDirectories.push(directory)
    const destination = join(directory, 'desktop.exe')
    const bytes = new TextEncoder().encode('replacement race fixture')
    replaceDestinationDuringFallbackWrite = true

    await assert.rejects(
      downloadGitHubReleaseAsset(
        asset(bytes),
        new Response(bytes),
        destination,
        new AbortController().signal
      ),
      error =>
        (error as { readonly kind?: string }).kind === 'destination' &&
        /destination changed/.test((error as Error).message)
    )

    assert.equal(await readFile(destination, 'utf8'), 'replacement destination')
    assert.deepEqual(await readdir(directory), ['desktop.exe'])
  })

  it('removes the fallback publication when cancellation wins after sync', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-release-cancel-publish-')
    )
    temporaryDirectories.push(directory)
    const destination = join(directory, 'desktop.exe')
    const bytes = new TextEncoder().encode('cancel publication fixture')
    const controller = new AbortController()
    abortAfterFallbackSync = controller

    await assert.rejects(
      downloadGitHubReleaseAsset(
        asset(bytes),
        new Response(bytes),
        destination,
        controller.signal
      ),
      error => (error as Error).name === 'AbortError'
    )

    assert.deepEqual(await readdir(directory), [])
  })
})
