import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsBundledOrasManifest,
  CheapLfsBundledOrasWindowsAmd64ArchiveSha256,
  CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
  CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
  CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
} from '../app/src/lib/cheap-lfs/oci-registry-runtime'
import {
  CheapLfsBundledOrasLicenseBytes,
  CheapLfsBundledOrasLicenseSha256,
  CheapLfsOfficialOrasBuildTrust,
  CheapLfsOrasBuildPreparationError,
  ICheapLfsOrasBuildTrust,
  getCheapLfsOrasStagingPlan,
  prepareCheapLfsOrasForBuildWithTrustForTests,
} from './prepare-cheap-lfs-oras'

const roots: string[] = []
const FixtureLicense = Buffer.from('Apache License test fixture\n')

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-oras-build-test-'))
  roots.push(root)
  return root
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface IZipFixtureEntry {
  readonly name: string
  readonly bytes: Buffer
  readonly encrypted?: boolean
}

/** A deterministic stored ZIP fixture understood by yauzl. */
function zipWithEntries(entries: ReadonlyArray<IZipFixtureEntry>): Buffer {
  const localEntries: Buffer[] = []
  const centralEntries: Buffer[] = []
  let localOffset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const checksum = crc32(entry.bytes)
    const flags = entry.encrypted === true ? 1 : 0
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(flags, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(entry.bytes.byteLength, 18)
    localHeader.writeUInt32LE(entry.bytes.byteLength, 22)
    localHeader.writeUInt16LE(name.byteLength, 26)
    const local = Buffer.concat([localHeader, name, entry.bytes])
    localEntries.push(local)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(flags, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(entry.bytes.byteLength, 20)
    centralHeader.writeUInt32LE(entry.bytes.byteLength, 24)
    centralHeader.writeUInt16LE(name.byteLength, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralEntries.push(Buffer.concat([centralHeader, name]))
    localOffset += local.byteLength
  }

  const central = Buffer.concat(centralEntries)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.byteLength, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localEntries, central, end])
}

function zipWithOras(
  executable: Buffer,
  license = FixtureLicense,
  additionalEntries: ReadonlyArray<IZipFixtureEntry> = []
): Buffer {
  return zipWithEntries([
    { name: 'LICENSE', bytes: license },
    { name: 'oras.exe', bytes: executable },
    ...additionalEntries,
  ])
}

function fixtureTrust(
  archive: Buffer,
  executable: Buffer,
  license = FixtureLicense
): ICheapLfsOrasBuildTrust {
  return {
    archiveUrl: CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
    archiveSha256: sha256(archive),
    executableSha256: sha256(executable),
    executableBytes: executable.byteLength,
    licenseSha256: sha256(license),
    licenseBytes: license.byteLength,
  }
}

function okResponse(bytes: Buffer) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
  }
}

async function assertNoStagedExecutable(output: string): Promise<void> {
  for (const destination of getCheapLfsOrasStagingPlan(output)) {
    await assert.rejects(
      readFile(destination.path),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
  }
  await assert.rejects(
    readFile(join(output, 'static', 'cheap-lfs', 'oras', 'LICENSE.ORAS.txt')),
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
  )
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  )
})

describe('pinned Cheap LFS ORAS build preparation', () => {
  it('checks in the exact official trust values and explicit arm64 emulation strategy', async () => {
    assert.equal(
      CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
      'https://github.com/oras-project/oras/releases/download/v1.3.2/oras_1.3.2_windows_amd64.zip'
    )
    assert.equal(
      CheapLfsBundledOrasWindowsAmd64ArchiveSha256,
      'sha256:c896f26245f11e6385d52010bb0a65a4e500e1f3244680a6556ed05462fa1c0d'
    )
    assert.equal(
      CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
      'sha256:1fd2a8672c9a6e5aade53380dd405781271e802529edef6e8d9509d508b8482b'
    )
    assert.equal(CheapLfsBundledOrasWindowsAmd64ExecutableBytes, 12_280_832)
    assert.equal(
      CheapLfsBundledOrasLicenseSha256,
      'sha256:eccb04b94c71454ea03f00ecb518b997952c4f2f23aca50baab98230f5c8dc00'
    )
    assert.equal(CheapLfsBundledOrasLicenseBytes, 11_343)
    assert.deepEqual(CheapLfsOfficialOrasBuildTrust, {
      archiveUrl: CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
      archiveSha256: CheapLfsBundledOrasWindowsAmd64ArchiveSha256,
      executableSha256: CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
      executableBytes: CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
      licenseSha256: CheapLfsBundledOrasLicenseSha256,
      licenseBytes: CheapLfsBundledOrasLicenseBytes,
    })
    for (const architecture of ['x64', 'arm64'] as const) {
      assert.deepEqual(CheapLfsBundledOrasManifest.binaries[architecture], {
        sha256: CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
        sizeInBytes: CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
        executableArchitecture: 'x64',
      })
    }

    const root = await makeRoot()
    assert.deepEqual(
      getCheapLfsOrasStagingPlan(join(root, 'out')).map(destination => ({
        appArchitecture: destination.appArchitecture,
        executableArchitecture: destination.executableArchitecture,
        suffix: destination.path.slice(join(root, 'out').length),
      })),
      [
        {
          appArchitecture: 'x64',
          executableArchitecture: 'x64',
          suffix: '\\static\\cheap-lfs\\oras\\win32-x64\\oras.exe',
        },
        {
          appArchitecture: 'arm64',
          executableArchitecture: 'x64',
          suffix: '\\static\\cheap-lfs\\oras\\win32-arm64\\oras.exe',
        },
      ]
    )
  })

  it('downloads only through GitHub release assets and stages verified bytes under generated output', async () => {
    const root = await makeRoot()
    const output = join(root, 'out')
    const executable = Buffer.from('deterministic ORAS executable fixture')
    const archive = zipWithOras(executable)
    const trust = fixtureTrust(archive, executable)
    const calls: string[] = []

    const result = await prepareCheapLfsOrasForBuildWithTrustForTests(
      {
        generatedOutputRoot: output,
        platform: 'win32',
        fetch: async url => {
          calls.push(url)
          if (calls.length === 1) {
            return {
              ok: false,
              status: 302,
              headers: {
                get: name =>
                  name.toLowerCase() === 'location'
                    ? 'https://release-assets.githubusercontent.com/github-production-release-asset/fixture'
                    : null,
              },
              body: null,
            }
          }
          return okResponse(archive)
        },
      },
      trust
    )

    assert.ok(result !== null)
    assert.deepEqual(calls, [
      CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
      'https://release-assets.githubusercontent.com/github-production-release-asset/fixture',
    ])
    assert.equal(result.archiveSha256, sha256(archive))
    assert.equal(result.executableSha256, sha256(executable))
    assert.equal(result.executableBytes, executable.byteLength)
    assert.equal(result.licenseSha256, sha256(FixtureLicense))
    assert.equal(result.licenseBytes, FixtureLicense.byteLength)
    assert.equal(
      result.licensePath,
      join(output, 'static', 'cheap-lfs', 'oras', 'LICENSE.ORAS.txt')
    )
    assert.deepEqual(await readFile(result.licensePath), FixtureLicense)
    assert.deepEqual(
      result.destinations.map(destination => destination.appArchitecture),
      ['x64', 'arm64']
    )
    for (const destination of result.destinations) {
      assert.deepEqual(await readFile(destination.path), executable)
      assert.equal(destination.path.startsWith(`${output}\\`), true)
    }
  })

  it('rejects archive, executable, and license integrity mismatches before staging', async () => {
    const root = await makeRoot()
    const output = join(root, 'out')
    const executable = Buffer.from('fixture executable')
    const archive = zipWithOras(executable)

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: async () => okResponse(archive),
        },
        {
          ...fixtureTrust(archive, executable),
          archiveSha256: `sha256:${'0'.repeat(64)}`,
        }
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'integrity'
    )

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: async () => okResponse(archive),
        },
        {
          ...fixtureTrust(archive, executable),
          executableSha256: `sha256:${'1'.repeat(64)}`,
        }
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'integrity'
    )

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: async () => okResponse(archive),
        },
        {
          ...fixtureTrust(archive, executable),
          licenseSha256: `sha256:${'2'.repeat(64)}`,
        }
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'integrity'
    )
    await assertNoStagedExecutable(output)
  })

  it('rejects a missing, duplicate, encrypted, or tampered license before staging', async () => {
    const root = await makeRoot()
    const output = join(root, 'out')
    const executable = Buffer.from('fixture executable')
    const unsafeArchives = [
      zipWithEntries([{ name: 'oras.exe', bytes: executable }]),
      zipWithOras(executable, FixtureLicense, [
        { name: 'LICENSE', bytes: FixtureLicense },
      ]),
      zipWithEntries([
        { name: 'LICENSE', bytes: FixtureLicense, encrypted: true },
        { name: 'oras.exe', bytes: executable },
      ]),
    ]
    for (const archive of unsafeArchives) {
      await assert.rejects(
        prepareCheapLfsOrasForBuildWithTrustForTests(
          {
            generatedOutputRoot: output,
            platform: 'win32',
            fetch: async () => okResponse(archive),
          },
          fixtureTrust(archive, executable)
        ),
        (error: unknown) =>
          error instanceof CheapLfsOrasBuildPreparationError &&
          error.kind === 'archive'
      )
    }

    const tamperedLicense = Buffer.from(FixtureLicense)
    tamperedLicense[0] ^= 1
    const tamperedArchive = zipWithOras(executable, tamperedLicense)
    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: async () => okResponse(tamperedArchive),
        },
        fixtureTrust(tamperedArchive, executable, FixtureLicense)
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'integrity'
    )
    await assertNoStagedExecutable(output)
  })

  it('rejects redirects outside GitHub assets and skips non-Windows builds', async () => {
    const root = await makeRoot()
    const executable = Buffer.from('fixture executable')
    const archive = zipWithOras(executable)
    const trust = fixtureTrust(archive, executable)

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: join(root, 'out'),
          platform: 'win32',
          fetch: async () => ({
            ok: false,
            status: 302,
            headers: { get: () => 'https://example.test/oras.zip' },
            body: null,
          }),
        },
        trust
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'download'
    )

    let fetched = false
    const skipped = await prepareCheapLfsOrasForBuildWithTrustForTests(
      {
        generatedOutputRoot: join(root, 'out'),
        platform: 'linux',
        fetch: async () => {
          fetched = true
          return okResponse(archive)
        },
      },
      trust
    )
    assert.equal(skipped, null)
    assert.equal(fetched, false)
  })

  it('uses one bounded deadline for a stalled connection and leaves no staged executable', async () => {
    const root = await makeRoot()
    const output = join(root, 'out')
    const executable = Buffer.from('fixture executable')
    const archive = zipWithOras(executable)
    let downloadSignal: AbortSignal | undefined

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: (_url, init) => {
            downloadSignal = init.signal
            return new Promise(() => undefined)
          },
        },
        fixtureTrust(archive, executable),
        20
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'download' &&
        error.message ===
          'The pinned ORAS release archive could not be downloaded.'
    )

    assert.equal(downloadSignal?.aborted, true)
    await assertNoStagedExecutable(output)
  })

  it('cancels a stalled response body at the same deadline and cleans partial output', async () => {
    const root = await makeRoot()
    const output = join(root, 'out')
    const executable = Buffer.from('fixture executable')
    const archive = zipWithOras(executable)
    let bodyCancelled = false

    await assert.rejects(
      prepareCheapLfsOrasForBuildWithTrustForTests(
        {
          generatedOutputRoot: output,
          platform: 'win32',
          fetch: async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(archive.subarray(0, 8))
              },
              cancel() {
                bodyCancelled = true
              },
            }),
          }),
        },
        fixtureTrust(archive, executable),
        20
      ),
      (error: unknown) =>
        error instanceof CheapLfsOrasBuildPreparationError &&
        error.kind === 'download' &&
        error.message ===
          'The pinned ORAS release archive could not be downloaded.'
    )

    assert.equal(bodyCancelled, true)
    await assertNoStagedExecutable(output)
  })

  it('wires the pinned preparation before packaging in the Windows build', async () => {
    const source = await readFile(join(__dirname, 'build.ts'), 'utf8')
    assert.match(
      source,
      /import \{ prepareBundledCheapLfsOrasForBuild \} from '\.\/prepare-cheap-lfs-oras'/
    )
    assert.match(
      source,
      /process\.platform === 'win32'[\s\S]*prepareBundledCheapLfsOrasForBuild\(\{ generatedOutputRoot: outRoot \}\)[\s\S]*verifyInjectedSassVariables/
    )
  })
})
