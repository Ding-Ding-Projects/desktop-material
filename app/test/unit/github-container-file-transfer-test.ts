import assert from 'node:assert'
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, it } from 'node:test'
import {
  DefaultGitHubContainerFileOrasRunner,
  GitHubContainerFileArtifactType,
  GitHubContainerFileEmptyConfigMediaType,
  GitHubContainerFileFormatAnnotation,
  GitHubContainerFileFormatVersion,
  GitHubContainerFileLayerMediaType,
  GitHubContainerFileManifestMediaType,
  GitHubContainerFileSourceAnnotation,
  GitHubContainerFileTitleAnnotation,
  GitHubContainerFileTransferError,
  IGitHubContainerFileOrasRequest,
  IGitHubContainerFileOrasResult,
  IGitHubContainerFileOrasRunner,
  IGitHubContainerFileTransferDependencies,
  downloadGitHubContainerFile,
  inspectGitHubContainerFileManifest,
  requireGitHubContainerFileSourceRepositoryUrl,
  requireSafeGitHubContainerFileTitle,
  uploadGitHubContainerFile,
} from '../../src/lib/github-container-file-transfer'

const roots: string[] = []
const account = { login: 'test-owner', token: 'fixture-package-token' }
const registryRepository = 'ghcr.io/test-owner/test-package'
const sourceRepositoryUrl = 'https://github.com/test-owner/test-repository'
const emptyJsonDigest =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'

function sha256(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function createRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'github-package-transfer-test-'))
  roots.push(path)
  return path
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null)) !== null
}

function manifestFor(
  title: string,
  file: Buffer,
  overrides: Readonly<Record<string, unknown>> = {}
): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: GitHubContainerFileManifestMediaType,
      artifactType: GitHubContainerFileArtifactType,
      config: {
        mediaType: GitHubContainerFileEmptyConfigMediaType,
        digest: emptyJsonDigest,
        size: 2,
        data: 'e30=',
      },
      layers: [
        {
          mediaType: GitHubContainerFileLayerMediaType,
          digest: sha256(file),
          size: file.byteLength,
          annotations: {
            [GitHubContainerFileTitleAnnotation]: title,
          },
        },
      ],
      annotations: {
        [GitHubContainerFileSourceAnnotation]: sourceRepositoryUrl,
        [GitHubContainerFileFormatAnnotation]: GitHubContainerFileFormatVersion,
      },
      ...overrides,
    })
  )
}

class FakeRunner implements IGitHubContainerFileOrasRunner {
  public readonly requests: Array<{
    readonly args: ReadonlyArray<string>
    readonly stdinCopy: Buffer
    readonly stdinReference: Buffer
    readonly cwd: string
    readonly environment: Readonly<NodeJS.ProcessEnv>
  }> = []

  public constructor(
    private readonly operation: (
      request: IGitHubContainerFileOrasRequest
    ) => Promise<IGitHubContainerFileOrasResult>
  ) {}

  public async run(
    request: IGitHubContainerFileOrasRequest
  ): Promise<IGitHubContainerFileOrasResult> {
    this.requests.push({
      args: [...request.args],
      stdinCopy: Buffer.from(request.stdin),
      stdinReference: request.stdin,
      cwd: request.cwd,
      environment: { ...request.environment },
    })
    return this.operation(request)
  }
}

class FakeOrasChild extends EventEmitter {
  public readonly stdin = new PassThrough()
  public readonly stdout = new PassThrough()
  public readonly stderr = new PassThrough()
  public readonly pid = 7_014
  public readonly killSignals = new Array<NodeJS.Signals | number | undefined>()
  private closed = false

  public kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal)
    return true
  }

  public close(code: number | null): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.emit('exit', code, null)
    this.stdout.end()
    this.stderr.end()
    this.emit('close', code, null)
  }
}

async function fixtureDependencies(
  root: string,
  runner: IGitHubContainerFileOrasRunner,
  ids: ReadonlyArray<string> = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]
): Promise<IGitHubContainerFileTransferDependencies> {
  const executable = join(root, 'oras.exe')
  const executableBytes = Buffer.from('trusted ORAS fixture')
  await writeFile(executable, executableBytes, { flag: 'wx' })
  let cursor = 0
  return {
    async resolveOras() {
      return {
        available: true,
        path: executable,
        sha256: sha256(executableBytes),
        source: 'packaged',
        architecture: 'x64',
      }
    },
    runner,
    createUniqueId() {
      const value = ids[cursor++]
      assert.ok(value, 'the fixture supplied enough unique IDs')
      return value
    },
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  )
})

describe('GitHub Container file transfer', () => {
  it('accepts only an exact app-owned, immutable single-file manifest', () => {
    const file = Buffer.from('manifest fixture')
    const manifest = manifestFor('fixture.zip', file)
    const digest = sha256(manifest)
    assert.deepEqual(
      inspectGitHubContainerFileManifest(manifest, {
        manifestDigest: digest,
        sourceRepositoryUrl,
        title: 'fixture.zip',
        layerDigest: sha256(file),
        sizeInBytes: file.byteLength,
      }),
      {
        manifestDigest: digest,
        sourceRepositoryUrl,
        title: 'fixture.zip',
        layerDigest: sha256(file),
        sizeInBytes: file.byteLength,
      }
    )

    const wrongSource = manifestFor('fixture.zip', file, {
      annotations: {
        [GitHubContainerFileSourceAnnotation]:
          'https://github.com/another/repository',
        [GitHubContainerFileFormatAnnotation]: GitHubContainerFileFormatVersion,
      },
    })
    assert.throws(
      () =>
        inspectGitHubContainerFileManifest(wrongSource, {
          manifestDigest: sha256(wrongSource),
          sourceRepositoryUrl,
        }),
      (error: unknown) =>
        error instanceof GitHubContainerFileTransferError &&
        error.kind === 'integrity'
    )

    const multipleLayers = manifestFor('fixture.zip', file, {
      layers: [
        {
          mediaType: GitHubContainerFileLayerMediaType,
          digest: sha256(file),
          size: file.byteLength,
          annotations: {
            [GitHubContainerFileTitleAnnotation]: 'fixture.zip',
          },
        },
        {
          mediaType: GitHubContainerFileLayerMediaType,
          digest: sha256(file),
          size: file.byteLength,
          annotations: {
            [GitHubContainerFileTitleAnnotation]: 'second.zip',
          },
        },
      ],
    })
    assert.throws(
      () =>
        inspectGitHubContainerFileManifest(multipleLayers, {
          manifestDigest: sha256(multipleLayers),
          sourceRepositoryUrl,
        }),
      GitHubContainerFileTransferError
    )
    assert.throws(
      () =>
        inspectGitHubContainerFileManifest(manifest, {
          manifestDigest: `sha256:${'0'.repeat(64)}`,
          sourceRepositoryUrl,
        }),
      GitHubContainerFileTransferError
    )
  })

  it('uploads one staged file with a unique tag and verifies it by digest', async () => {
    const root = await createRoot()
    const sourcePath = join(root, 'registry-config.json')
    const file = Buffer.from('reviewed package bytes')
    await writeFile(sourcePath, file)
    const manifest = manifestFor('registry-config.json', file)
    const manifestDigest = sha256(manifest)
    const runner = new FakeRunner(async request => {
      if (request.args[0] === 'push') {
        assert.deepEqual(
          await readFile(join(request.cwd, 'registry-config.json')),
          file
        )
        return {
          stdout: Buffer.from(
            JSON.stringify({
              reference: `${registryRepository}@${manifestDigest}`,
              mediaType: GitHubContainerFileManifestMediaType,
              digest: manifestDigest,
              artifactType: GitHubContainerFileArtifactType,
            })
          ),
        }
      }
      assert.deepEqual(request.args.slice(0, 2), ['manifest', 'fetch'])
      const output = request.args[request.args.indexOf('--output') + 1]
      await writeFile(output, manifest, { flag: 'wx' })
      return { stdout: Buffer.alloc(0) }
    })
    const dependencies = await fixtureDependencies(root, runner)

    const result = await uploadGitHubContainerFile(
      {
        account,
        registryRepository,
        sourceRepositoryUrl,
        sourcePath,
      },
      dependencies
    )

    assert.equal(
      result.tag,
      'desktop-material-file-v1-11111111111141118111111111111111'
    )
    assert.equal(result.taggedReference, `${registryRepository}:${result.tag}`)
    assert.equal(
      result.immutableReference,
      `${registryRepository}@${manifestDigest}`
    )
    assert.equal(result.layerDigest, sha256(file))
    assert.equal(result.sizeInBytes, file.byteLength)
    assert.equal(runner.requests.length, 2)
    const upload = runner.requests[0]
    assert.ok(upload.args.includes('--artifact-type'))
    assert.ok(upload.args.includes(GitHubContainerFileArtifactType))
    assert.ok(upload.args.includes('--no-tty'))
    assert.ok(upload.args.includes('--password-stdin'))
    assert.ok(
      upload.args.includes(
        `${GitHubContainerFileSourceAnnotation}=${sourceRepositoryUrl}`
      )
    )
    assert.ok(
      upload.args.includes(
        `registry-config.json:${GitHubContainerFileLayerMediaType}`
      )
    )
    for (const request of runner.requests) {
      assert.equal(
        request.args.join(' ').includes(account.token),
        false,
        'the token never enters argv'
      )
      assert.deepEqual(
        request.stdinCopy,
        Buffer.from(`${account.token}\n`),
        'the token enters ORAS only through stdin'
      )
      assert.equal(
        request.stdinReference.every(byte => byte === 0),
        true,
        'each mutable stdin buffer is cleared'
      )
      assert.match(
        request.environment.ORAS_CACHE ?? '',
        /desktop-material-package-/
      )
      const configPath =
        request.args[request.args.indexOf('--registry-config') + 1]
      assert.match(configPath, /desktop-material-package-/)
      assert.equal(await exists(configPath), false)
      assert.equal(await exists(request.cwd), false)
    }
  })

  it('downloads only a verified digest and atomically creates a new file', async () => {
    const root = await createRoot()
    const destinationPath = join(root, 'downloaded artifact.zip')
    const file = Buffer.from('downloaded package bytes')
    const manifest = manifestFor('artifact.zip', file)
    const manifestDigest = sha256(manifest)
    const runner = new FakeRunner(async request => {
      if (request.args[0] === 'manifest') {
        const output = request.args[request.args.indexOf('--output') + 1]
        await writeFile(output, manifest, { flag: 'wx' })
        return { stdout: Buffer.alloc(0) }
      }
      assert.equal(request.args[0], 'pull')
      const output = request.args[request.args.indexOf('--output') + 1]
      await writeFile(join(output, 'artifact.zip'), file, { flag: 'wx' })
      return {
        stdout: Buffer.from(
          JSON.stringify({
            reference: `${registryRepository}@${manifestDigest}`,
            files: [
              {
                path: join(output, 'artifact.zip'),
                reference: `${registryRepository}@${sha256(file)}`,
                mediaType: GitHubContainerFileLayerMediaType,
                digest: sha256(file),
                size: file.byteLength,
                annotations: {
                  [GitHubContainerFileTitleAnnotation]: 'artifact.zip',
                },
              },
            ],
          })
        ),
      }
    })
    const dependencies = await fixtureDependencies(root, runner)

    const result = await downloadGitHubContainerFile(
      {
        account,
        registryRepository,
        sourceRepositoryUrl,
        manifestDigest,
        destinationPath,
      },
      dependencies
    )

    assert.deepEqual(await readFile(destinationPath), file)
    assert.equal(result.destinationPath, destinationPath)
    assert.equal(
      result.immutableReference,
      `${registryRepository}@${manifestDigest}`
    )
    assert.equal(result.title, 'artifact.zip')
    assert.equal(runner.requests.length, 2)
    assert.ok(runner.requests[1].args.includes('--keep-old-files'))
    assert.ok(runner.requests[1].args.includes('--no-tty'))
    assert.ok(runner.requests[1].args.includes('--password-stdin'))
    assert.equal(
      runner.requests.every(request =>
        request.stdinReference.every(byte => byte === 0)
      ),
      true
    )
  })

  it('never overwrites an existing download destination', async () => {
    const root = await createRoot()
    const destinationPath = join(root, 'existing.zip')
    const existing = Buffer.from('keep me')
    const file = Buffer.from('new package')
    await writeFile(destinationPath, existing)
    const manifest = manifestFor('artifact.zip', file)
    const manifestDigest = sha256(manifest)
    const runner = new FakeRunner(async request => {
      if (request.args[0] === 'manifest') {
        const output = request.args[request.args.indexOf('--output') + 1]
        await writeFile(output, manifest, { flag: 'wx' })
        return { stdout: Buffer.alloc(0) }
      }
      const output = request.args[request.args.indexOf('--output') + 1]
      await writeFile(join(output, 'artifact.zip'), file, { flag: 'wx' })
      return {
        stdout: Buffer.from(
          JSON.stringify({
            reference: `${registryRepository}@${manifestDigest}`,
            files: [
              {
                mediaType: GitHubContainerFileLayerMediaType,
                digest: sha256(file),
                size: file.byteLength,
                annotations: {
                  [GitHubContainerFileTitleAnnotation]: 'artifact.zip',
                },
              },
            ],
          })
        ),
      }
    })
    const dependencies = await fixtureDependencies(root, runner)

    await assert.rejects(
      downloadGitHubContainerFile(
        {
          account,
          registryRepository,
          sourceRepositoryUrl,
          manifestDigest,
          destinationPath,
        },
        dependencies
      ),
      (error: unknown) =>
        error instanceof GitHubContainerFileTransferError &&
        error.kind === 'destination-exists'
    )
    assert.deepEqual(await readFile(destinationPath), existing)
  })

  it('reports cancellation before resolving credentials or starting ORAS', async () => {
    const root = await createRoot()
    const sourcePath = join(root, 'artifact.zip')
    await writeFile(sourcePath, 'fixture')
    const controller = new AbortController()
    controller.abort()
    let resolutions = 0
    let runs = 0
    const dependencies: IGitHubContainerFileTransferDependencies = {
      async resolveOras() {
        resolutions++
        throw new Error('must not resolve')
      },
      runner: {
        async run() {
          runs++
          return { stdout: Buffer.alloc(0) }
        },
      },
      createUniqueId() {
        return '11111111-1111-4111-8111-111111111111'
      },
    }
    await assert.rejects(
      uploadGitHubContainerFile(
        {
          account,
          registryRepository,
          sourceRepositoryUrl,
          sourcePath,
          signal: controller.signal,
        },
        dependencies
      ),
      (error: unknown) =>
        error instanceof GitHubContainerFileTransferError &&
        error.kind === 'canceled'
    )
    assert.equal(resolutions, 0)
    assert.equal(runs, 0)
  })

  it('refuses ambiguous URLs and unsafe Windows titles before transfer', () => {
    assert.equal(
      requireGitHubContainerFileSourceRepositoryUrl(sourceRepositoryUrl),
      sourceRepositoryUrl
    )
    for (const value of [
      `${sourceRepositoryUrl}/`,
      `${sourceRepositoryUrl}.git`,
      'http://github.com/test-owner/test-repository',
      'https://github.com/test-owner/test-repository?tab=readme',
      'https://example.com/test-owner/test-repository',
    ]) {
      assert.throws(
        () => requireGitHubContainerFileSourceRepositoryUrl(value),
        GitHubContainerFileTransferError
      )
    }
    for (const title of [
      '../escape.zip',
      'CON.txt',
      'trailing. ',
      'hidden\u202efile.zip',
      'not:native.zip',
    ]) {
      assert.throws(
        () => requireSafeGitHubContainerFileTitle(title),
        GitHubContainerFileTransferError
      )
    }
  })

  it('keeps the real ORAS boundary hidden, non-shell, bounded, and stdin-only', async () => {
    const source = await readFile(
      join(
        process.cwd(),
        'app',
        'src',
        'lib',
        'github-container-file-transfer.ts'
      ),
      'utf8'
    )
    assert.match(source, /shell:\s*false/)
    assert.match(source, /windowsHide:\s*true/)
    assert.match(source, /stdio:\s*\['pipe', 'pipe', 'pipe'\]/)
    assert.match(source, /MaximumProcessOutputBytes/)
    assert.match(source, /DefaultProcessTimeoutMs/)
    assert.match(source, /stdin\.fill\(0\)/)
    assert.match(source, /clearCheapLfsRegistryCredentials\(credentials\)/)
    assert.match(source, /--password-stdin/)
    assert.match(source, /--registry-config/)
    assert.match(source, /--no-tty/)
    assert.match(source, /ORAS_CACHE:\s*workspace\.cachePath/)
    assert.doesNotMatch(source, /['"]--password['"]\s*,/)
    assert.doesNotMatch(source, /['"]login['"]\s*,/)
    assert.doesNotMatch(source, /--disable-path-validation/)
    assert.doesNotMatch(source, /--allow-path-traversal/)
  })

  it('tree-kills ORAS after an abort race and waits for termination to settle', async () => {
    const controller = new AbortController()
    const child = new FakeOrasChild()
    const stdinBytes = new Array<Buffer>()
    child.stdin.on('data', value => stdinBytes.push(Buffer.from(value)))
    let treeKills = 0
    let releaseTreeKill!: (value: boolean) => void
    const treeKill = new Promise<boolean>(resolve => {
      releaseTreeKill = resolve
    })
    const runner = new DefaultGitHubContainerFileOrasRunner({
      spawn: () => {
        // Exercise the gap after the initial abort check but before the
        // spawned child has registered its abort listener.
        controller.abort()
        return child as unknown as ChildProcessWithoutNullStreams
      },
      killTree: async (pid, isStillOwned) => {
        treeKills++
        assert.equal(pid, child.pid)
        assert.equal(isStillOwned(), true)
        child.close(null)
        return await treeKill
      },
    })
    let settled = false
    const operation = runner
      .run({
        executable: join(process.cwd(), 'trusted-oras.exe'),
        args: ['pull', 'ghcr.io/test-owner/test-package@sha256:fixture'],
        stdin: Buffer.from('sensitive-token\n'),
        cwd: process.cwd(),
        environment: {},
        signal: controller.signal,
        timeoutMs: 30_000,
      })
      .finally(() => {
        settled = true
      })
    const rejected = assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof GitHubContainerFileTransferError &&
        error.kind === 'canceled'
    )

    await new Promise(resolve => setImmediate(resolve))
    assert.equal(treeKills, 1)
    assert.equal(
      settled,
      false,
      'runner still owns cleanup while taskkill runs'
    )
    assert.equal(Buffer.concat(stdinBytes).byteLength, 0)
    assert.deepEqual(child.killSignals, [])

    releaseTreeKill(true)
    await rejected
    assert.equal(settled, true)
  })
})
