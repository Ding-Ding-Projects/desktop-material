import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { verifyReleasesManifest } from './verify-releases-manifest'

function withPackage(
  content: Buffer,
  test: (directory: string, manifest: string) => Promise<void>
) {
  const directory = mkdtempSync(join(tmpdir(), 'dm-releases-manifest-'))
  const fileName = 'GitHubDesktop-3.6.3-beta3-test-full.nupkg'
  writeFileSync(join(directory, fileName), content)
  const sha = createHash('sha1').update(content).digest('hex')
  const manifest = `${sha} ${fileName} ${content.byteLength}\n`

  return test(directory, manifest).finally(() =>
    rmSync(directory, { recursive: true, force: true })
  )
}

describe('Squirrel RELEASES package verification', () => {
  it('streams and verifies every advertised package hash and size', async () => {
    await withPackage(
      Buffer.from('real package bytes'),
      async (dir, manifest) => {
        assert.equal(await verifyReleasesManifest(manifest, dir), 1)
      }
    )
  })

  it('rejects a package whose bytes or size no longer match', async () => {
    await withPackage(
      Buffer.from('real package bytes'),
      async (dir, manifest) => {
        const file = join(dir, 'GitHubDesktop-3.6.3-beta3-test-full.nupkg')
        writeFileSync(file, 'tampered package bytes')
        await assert.rejects(
          verifyReleasesManifest(manifest, dir),
          /package size mismatch/
        )
      }
    )
  })

  it('rejects an unsafe package path before reading outside the payload', async () => {
    await withPackage(
      Buffer.from('real package bytes'),
      async (dir, manifest) => {
        const unsafe = manifest.replace(
          'GitHubDesktop-3.6.3-beta3-test-full.nupkg',
          '../outside.nupkg'
        )
        await assert.rejects(
          verifyReleasesManifest(unsafe, dir),
          /Unsafe Squirrel package path/
        )
      }
    )
  })
})
