import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsDockerHubCredentialServer,
  CheapLfsGhcrPolicyPendingError,
  CheapLfsGhcrPolicyVerificationMaximumAttempts,
  CheapLfsGhcrPolicyVerificationRetryDelayMs,
  CheapLfsOrasManifestVersion,
  CheapLfsRegistryRuntimeError,
  ICheapLfsOrasManifest,
  IDockerCredentialHelperRequest,
  IDockerCredentialHelperRunner,
  clearCheapLfsRegistryCredentials,
  createCheapLfsRegistryPolicyVerifier,
  deriveCheapLfsRegistryTarget,
  getCheapLfsGitHubRepositoryIdentity,
  resolveCheapLfsDockerHubCredentials,
  resolveCheapLfsGhcrCredentialsFromAccount,
  resolveTrustedCheapLfsOrasExecutable,
} from '../../../src/lib/cheap-lfs/oci-registry-runtime'

const roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-runtime-test-'))
  roots.push(root)
  return root
}

function digest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function manifest(bytes: Buffer): ICheapLfsOrasManifest {
  return {
    version: CheapLfsOrasManifestVersion,
    binaries: {
      x64: {
        sha256: digest(bytes),
        sizeInBytes: bytes.byteLength,
        executableArchitecture: 'x64',
      },
    },
  }
}

async function writeExecutable(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}

async function dockerFixture(helper = 'desktop') {
  const root = await makeRoot()
  const profile = join(root, 'profile')
  const configDirectory = join(profile, '.docker')
  const programFiles = join(root, 'Program Files')
  const helperPath = join(
    programFiles,
    'Docker',
    'Docker',
    'resources',
    'bin',
    `docker-credential-${helper}.exe`
  )
  await mkdir(configDirectory, { recursive: true })
  await writeExecutable(helperPath, Buffer.from('trusted helper fixture'))
  return {
    root,
    profile,
    configDirectory,
    helperPath,
    environment: {
      USERPROFILE: profile,
      ProgramFiles: programFiles,
      PATH: join(root, 'attacker-path'),
    },
  }
}

class FakeCredentialRunner implements IDockerCredentialHelperRunner {
  public readonly requests: IDockerCredentialHelperRequest[] = []

  public constructor(private readonly result: Buffer, private exitCode = 0) {}

  public async run(request: IDockerCredentialHelperRequest) {
    this.requests.push(request)
    return { exitCode: this.exitCode, stdout: this.result }
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  )
})

describe('Cheap LFS OCI registry runtime', () => {
  describe('trusted ORAS resolution', () => {
    it('prefers the architecture-specific packaged binary and verifies its digest', async () => {
      const root = await makeRoot()
      const bytes = Buffer.from('pinned oras x64')
      const staticRoot = join(root, 'static')
      const packaged = join(
        staticRoot,
        'cheap-lfs',
        'oras',
        'win32-x64',
        'oras.exe'
      )
      const installed = join(root, 'Program Files', 'ORAS', 'oras.exe')
      await writeExecutable(packaged, bytes)
      await writeExecutable(installed, bytes)

      const result = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot,
        platform: 'win32',
        architecture: 'x64',
        environment: { ProgramFiles: join(root, 'Program Files') },
      })

      assert.equal(result.available, true)
      if (result.available) {
        assert.equal(result.path, await realpath(packaged))
        assert.equal(result.source, 'packaged')
        assert.equal(result.sha256, digest(bytes))
      }
    })

    it('falls back only to a pinned Program Files installation', async () => {
      const root = await makeRoot()
      const bytes = Buffer.from('installed pinned oras')
      const programFiles = join(root, 'Program Files')
      const installed = join(programFiles, 'ORAS', 'oras.exe')
      await writeExecutable(installed, bytes)

      const result = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot: join(root, 'missing-static'),
        platform: 'win32',
        architecture: 'x64',
        environment: { ProgramFiles: programFiles },
      })

      assert.equal(result.available, true)
      if (result.available) {
        assert.equal(result.source, 'program-files')
        assert.equal(result.path, await realpath(installed))
      }
    })

    it('accepts a pinned winget link only when it resolves inside winget packages', async () => {
      const root = await makeRoot()
      const bytes = Buffer.from('winget pinned oras')
      const wingetRoot = join(root, 'LocalAppData', 'Microsoft', 'WinGet')
      const target = join(
        wingetRoot,
        'Packages',
        'ORASProject.ORAS_fixture',
        'oras.exe'
      )
      const link = join(wingetRoot, 'Links', 'oras.exe')
      await writeExecutable(target, bytes)
      await mkdir(dirname(link), { recursive: true })
      await symlink(target, link, 'file')

      const result = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot: join(root, 'missing-static'),
        platform: 'win32',
        architecture: 'x64',
        environment: { LOCALAPPDATA: join(root, 'LocalAppData') },
      })

      assert.equal(result.available, true)
      if (result.available) {
        assert.equal(result.source, 'winget')
        assert.equal(result.path, await realpath(target))
      }

      await rm(link)
      const outside = join(root, 'outside-winget', 'oras.exe')
      await writeExecutable(outside, bytes)
      await symlink(outside, link, 'file')
      const escaped = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot: join(root, 'missing-static'),
        platform: 'win32',
        architecture: 'x64',
        environment: { LOCALAPPDATA: join(root, 'LocalAppData') },
      })
      assert.equal(escaped.available, false)
      if (!escaped.available) {
        assert.equal(escaped.reason, 'untrusted-candidate')
      }
    })

    it('never searches PATH or the current working directory', async () => {
      const root = await makeRoot()
      const bytes = Buffer.from('path oras must not execute')
      const pathDirectory = join(root, 'path')
      await writeExecutable(join(pathDirectory, 'oras.exe'), bytes)

      const result = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot: join(root, 'missing-static'),
        platform: 'win32',
        architecture: 'x64',
        environment: { PATH: pathDirectory },
      })

      assert.deepEqual(result, {
        available: false,
        reason: 'unavailable',
        message:
          'ORAS is not bundled in this app build and no digest-matching trusted installation was found. Update or reinstall Desktop Material.',
      })
    })

    it('fails closed on a tampered packaged binary instead of falling back', async () => {
      const root = await makeRoot()
      const trusted = Buffer.from('trusted oras')
      const staticRoot = join(root, 'static')
      const packaged = join(
        staticRoot,
        'cheap-lfs',
        'oras',
        'win32-x64',
        'oras.exe'
      )
      const programFiles = join(root, 'Program Files')
      await writeExecutable(packaged, Buffer.from('tampered'))
      await writeExecutable(join(programFiles, 'ORAS', 'oras.exe'), trusted)

      const result = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(trusted),
        staticRoot,
        platform: 'win32',
        architecture: 'x64',
        environment: { ProgramFiles: programFiles },
      })

      assert.equal(result.available, false)
      if (!result.available) {
        assert.equal(result.reason, 'untrusted-candidate')
        assert.match(result.message, /integrity checks/)
      }
    })

    it('rejects redirected packaged binaries and relative resource roots', async () => {
      const root = await makeRoot()
      const bytes = Buffer.from('redirect target')
      const staticRoot = join(root, 'static')
      const target = join(root, 'outside', 'oras.exe')
      const packaged = join(
        staticRoot,
        'cheap-lfs',
        'oras',
        'win32-x64',
        'oras.exe'
      )
      await writeExecutable(target, bytes)
      await mkdir(dirname(packaged), { recursive: true })
      await symlink(target, packaged, 'file')

      const redirected = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot,
        platform: 'win32',
        architecture: 'x64',
        environment: {},
      })
      assert.equal(redirected.available, false)
      if (!redirected.available) {
        assert.equal(redirected.reason, 'untrusted-candidate')
      }

      const relative = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        staticRoot: 'static',
        platform: 'win32',
        architecture: 'x64',
        environment: {},
      })
      assert.equal(relative.available, false)
      if (!relative.available) {
        assert.equal(relative.reason, 'invalid-manifest')
      }
    })

    it('reports unsupported and missing manifest variants without probing', async () => {
      const bytes = Buffer.from('oras')
      const unsupported = await resolveTrustedCheapLfsOrasExecutable({
        manifest: manifest(bytes),
        platform: 'linux',
      })
      assert.equal(unsupported.available, false)
      if (!unsupported.available) {
        assert.equal(unsupported.reason, 'unsupported-platform')
      }

      const invalid = await resolveTrustedCheapLfsOrasExecutable({
        manifest: {
          version: CheapLfsOrasManifestVersion,
          binaries: {},
        },
        platform: 'win32',
        architecture: 'arm64',
      })
      assert.equal(invalid.available, false)
      if (!invalid.available) {
        assert.equal(invalid.reason, 'invalid-manifest')
      }
    })
  })

  describe('registry credentials', () => {
    it('copies caller-owned GitHub account credentials and supports zeroing', () => {
      const credentials = resolveCheapLfsGhcrCredentialsFromAccount({
        login: 'octo-user',
        token: 'github-token-fixture',
      })
      assert.equal(credentials.username, 'octo-user')
      assert.equal(
        Buffer.from(credentials.token).toString(),
        'github-token-fixture'
      )

      clearCheapLfsRegistryCredentials(credentials)
      assert.deepEqual([...credentials.token], new Array(20).fill(0))
    })

    it('rejects invalid GHCR logins and multiline credentials', () => {
      assert.throws(
        () =>
          resolveCheapLfsGhcrCredentialsFromAccount({
            login: '-unsafe',
            token: 'token',
          }),
        CheapLfsRegistryRuntimeError
      )
      assert.throws(
        () =>
          resolveCheapLfsGhcrCredentialsFromAccount({
            login: 'safe-user',
            token: 'secret\nsecond-line',
          }),
        CheapLfsRegistryRuntimeError
      )
    })

    it('gets Docker Hub credentials through one trusted helper stdin request', async () => {
      const fixture = await dockerFixture()
      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({ credsStore: 'desktop' })
      )
      const secret = 'docker-secret-fixture'
      const runner = new FakeCredentialRunner(
        Buffer.from(
          JSON.stringify({
            ServerURL: CheapLfsDockerHubCredentialServer,
            Username: 'docker_user',
            Secret: secret,
          })
        )
      )

      const credentials = await resolveCheapLfsDockerHubCredentials({
        configDirectory: fixture.configDirectory,
        environment: fixture.environment,
        runner,
      })

      assert.equal(credentials.username, 'docker_user')
      assert.equal(Buffer.from(credentials.token).toString(), secret)
      assert.equal(runner.requests.length, 1)
      assert.equal(
        runner.requests[0].executable,
        await realpath(fixture.helperPath)
      )
      assert.deepEqual(runner.requests[0].args, ['get'])
      assert.equal(
        runner.requests[0].stdin.toString(),
        `${CheapLfsDockerHubCredentialServer}\n`
      )
      assert.equal(JSON.stringify(runner.requests[0]).includes(secret), false)
    })

    it('honors an exact Docker Hub credHelpers entry and rejects conflicts', async () => {
      const fixture = await dockerFixture('wincred')
      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({
          credsStore: 'desktop',
          credHelpers: { [CheapLfsDockerHubCredentialServer]: 'wincred' },
        })
      )
      const runner = new FakeCredentialRunner(
        Buffer.from(
          JSON.stringify({
            ServerURL: 'docker.io',
            Username: 'docker-user',
            Secret: 'token',
          })
        )
      )
      const credentials = await resolveCheapLfsDockerHubCredentials({
        configDirectory: fixture.configDirectory,
        environment: fixture.environment,
        runner,
      })
      assert.equal(credentials.username, 'docker-user')
      assert.match(runner.requests[0].executable, /wincred\.exe$/)

      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({
          credHelpers: {
            [CheapLfsDockerHubCredentialServer]: 'wincred',
            'docker.io': 'desktop',
          },
        })
      )
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
          runner,
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'invalid-config'
      )
    })

    it('refuses inline auth, PATH helpers, redirected config, and untrusted helper names', async () => {
      const fixture = await dockerFixture()
      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({
          auths: {
            [CheapLfsDockerHubCredentialServer]: { auth: 'dXNlcjpzZWNyZXQ=' },
          },
        })
      )
      await writeExecutable(
        join(fixture.environment.PATH, 'docker-credential-desktop.exe'),
        Buffer.from('path helper')
      )
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'credential-unavailable'
      )

      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({ credsStore: 'evil-helper' })
      )
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'credential-unavailable'
      )

      const redirectedProfile = join(fixture.root, 'redirected-profile')
      const redirectedConfig = join(redirectedProfile, '.docker')
      await mkdir(redirectedProfile, { recursive: true })
      await symlink(fixture.configDirectory, redirectedConfig, 'junction')
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: redirectedConfig,
          environment: {
            ...fixture.environment,
            USERPROFILE: redirectedProfile,
          },
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'invalid-config'
      )
    })

    it('rejects helper overflow, failures, and registry substitution without exposing output', async () => {
      const fixture = await dockerFixture()
      await writeFile(
        join(fixture.configDirectory, 'config.json'),
        JSON.stringify({ credsStore: 'desktop' })
      )
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
          runner: new FakeCredentialRunner(Buffer.alloc(64 * 1024 + 1, 65)),
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'output-overflow'
      )

      const substitutedSecret = 'must-not-appear-in-error'
      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
          runner: new FakeCredentialRunner(
            Buffer.from(
              JSON.stringify({
                ServerURL: 'evil.example',
                Username: 'docker-user',
                Secret: substitutedSecret,
              })
            )
          ),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CheapLfsRegistryRuntimeError)
          assert.equal(error.message.includes(substitutedSecret), false)
          return true
        }
      )

      await assert.rejects(
        resolveCheapLfsDockerHubCredentials({
          configDirectory: fixture.configDirectory,
          environment: fixture.environment,
          runner: new FakeCredentialRunner(Buffer.from('helper secret'), 1),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CheapLfsRegistryRuntimeError)
          assert.equal(error.message.includes('helper secret'), false)
          return true
        }
      )
    })
  })

  describe('canonical target and policy verification', () => {
    it('derives stable repository identity and one canonical registry repository', () => {
      assert.equal(
        getCheapLfsGitHubRepositoryIdentity('987654321'),
        'github.com/repositories/987654321'
      )
      assert.deepEqual(
        deriveCheapLfsRegistryTarget({
          provider: 'ghcr',
          repositoryId: 987654321,
          owner: 'CodingMachineEdge',
          name: 'Desktop.Material',
        }),
        {
          provider: 'ghcr',
          repositoryIdentity: 'github.com/repositories/987654321',
          registryRepository:
            'ghcr.io/codingmachineedge/desktop.material-cheap-lfs',
          sourceRepositoryUrl:
            'https://github.com/codingmachineedge/desktop.material',
          sourceOwner: 'codingmachineedge',
          sourceName: 'desktop.material',
        }
      )
      assert.equal(
        deriveCheapLfsRegistryTarget({
          provider: 'docker-hub',
          repositoryId: '987654321',
          owner: 'CodingMachineEdge',
          name: 'Desktop-Material',
          dockerHubNamespace: 'shared_team',
        }).registryRepository,
        'docker.io/shared_team/desktop-material-cheap-lfs'
      )
    })

    it('rejects unsafe ids, names, and non-lowercase Docker Hub namespaces', () => {
      assert.throws(
        () => getCheapLfsGitHubRepositoryIdentity('../7'),
        CheapLfsRegistryRuntimeError
      )
      assert.throws(
        () =>
          deriveCheapLfsRegistryTarget({
            provider: 'ghcr',
            repositoryId: 7,
            owner: '../owner',
            name: 'repo',
          }),
        CheapLfsRegistryRuntimeError
      )
      assert.throws(
        () =>
          deriveCheapLfsRegistryTarget({
            provider: 'docker-hub',
            repositoryId: 7,
            owner: 'owner',
            name: 'repo',
            dockerHubNamespace: 'Uppercase',
          }),
        CheapLfsRegistryRuntimeError
      )
    })

    it('verifies write access, exact source identity, GHCR linkage, and visibility', async () => {
      const source = {
        repositoryId: 987654,
        owner: 'owner',
        name: 'repo',
      }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      const calls: string[] = []
      const verifier = createCheapLfsRegistryPolicyVerifier({
        source,
        target,
        sourceApi: {
          async inspectSourceRepository(request) {
            calls.push('source')
            assert.deepEqual(request, source)
            assert.equal('token' in request, false)
            return {
              repositoryIdentity: target.repositoryIdentity,
              repositoryUrl: target.sourceRepositoryUrl,
              owner: 'owner',
              name: 'repo',
              visibility: 'private',
              access: 'write',
            }
          },
        },
        registryApi: {
          async inspectRegistryRepository(request) {
            calls.push('registry')
            assert.deepEqual(request, {
              provider: 'ghcr',
              registryRepository: target.registryRepository,
            })
            assert.equal('token' in request, false)
            return {
              visibility: 'private',
              hasPushAccess: true,
              linkedRepositoryIdentity: target.repositoryIdentity,
              linkedRepositoryUrl: target.sourceRepositoryUrl,
            }
          },
        },
      })
      const result = await verifier.verify({
        provider: 'ghcr',
        repositoryIdentity: target.repositoryIdentity,
        registryRepository: target.registryRepository,
        sourceRepositoryUrl: target.sourceRepositoryUrl,
        immutableReference: `${target.registryRepository}@sha256:${'a'.repeat(
          64
        )}`,
        visibility: 'private',
      })

      assert.deepEqual(calls, ['source', 'registry'])
      assert.deepEqual(result, {
        provider: 'ghcr',
        repositoryIdentity: target.repositoryIdentity,
        registryRepository: target.registryRepository,
        sourceRepositoryUrl: target.sourceRepositoryUrl,
        visibility: 'private',
        sourceRepositoryAccessVerified: true,
        registryVisibilityVerified: true,
      })
    })

    it('polls bounded GHCR package metadata until its repository link is ready', async () => {
      const source = { repositoryId: 72, owner: 'owner', name: 'repo' }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      const controller = new AbortController()
      let sourceCalls = 0
      let registryCalls = 0
      const waits: number[] = []
      const verifier = createCheapLfsRegistryPolicyVerifier({
        source,
        target,
        sourceApi: {
          async inspectSourceRepository() {
            sourceCalls++
            return {
              repositoryIdentity: target.repositoryIdentity,
              repositoryUrl: target.sourceRepositoryUrl,
              owner: source.owner,
              name: source.name,
              visibility: 'private',
              access: 'write',
            }
          },
        },
        registryApi: {
          async inspectRegistryRepository(_request, signal) {
            registryCalls++
            assert.equal(signal, controller.signal)
            if (registryCalls < 3) {
              throw new CheapLfsGhcrPolicyPendingError()
            }
            return {
              visibility: 'private',
              hasPushAccess: true,
              linkedRepositoryIdentity: target.repositoryIdentity,
              linkedRepositoryUrl: target.sourceRepositoryUrl,
            }
          },
        },
        async waitForGhcrPolicyRetry(delayMs, signal) {
          waits.push(delayMs)
          assert.equal(signal, controller.signal)
        },
      })

      await verifier.verify({
        provider: 'ghcr',
        repositoryIdentity: target.repositoryIdentity,
        registryRepository: target.registryRepository,
        sourceRepositoryUrl: target.sourceRepositoryUrl,
        immutableReference: `${target.registryRepository}@sha256:${'d'.repeat(
          64
        )}`,
        visibility: 'private',
        signal: controller.signal,
      })

      assert.equal(sourceCalls, 1)
      assert.equal(registryCalls, 3)
      assert.deepEqual(waits, [
        CheapLfsGhcrPolicyVerificationRetryDelayMs,
        CheapLfsGhcrPolicyVerificationRetryDelayMs,
      ])
    })

    it('exhausts only the fixed GHCR pending-metadata budget', async () => {
      const source = { repositoryId: 73, owner: 'owner', name: 'repo' }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      let registryCalls = 0
      let waitCalls = 0
      const verifier = createCheapLfsRegistryPolicyVerifier({
        source,
        target,
        sourceApi: {
          async inspectSourceRepository() {
            return {
              repositoryIdentity: target.repositoryIdentity,
              repositoryUrl: target.sourceRepositoryUrl,
              owner: source.owner,
              name: source.name,
              visibility: 'private',
              access: 'write',
            }
          },
        },
        registryApi: {
          async inspectRegistryRepository() {
            registryCalls++
            throw new CheapLfsGhcrPolicyPendingError()
          },
        },
        async waitForGhcrPolicyRetry() {
          waitCalls++
        },
      })

      await assert.rejects(
        verifier.verify({
          provider: 'ghcr',
          repositoryIdentity: target.repositoryIdentity,
          registryRepository: target.registryRepository,
          sourceRepositoryUrl: target.sourceRepositoryUrl,
          immutableReference: `${target.registryRepository}@sha256:${'e'.repeat(
            64
          )}`,
          visibility: 'private',
        }),
        (error: unknown) => {
          assert.ok(error instanceof CheapLfsRegistryRuntimeError)
          assert.equal(error.kind, 'policy')
          assert.equal(error.message.includes(target.registryRepository), false)
          return true
        }
      )
      assert.equal(registryCalls, CheapLfsGhcrPolicyVerificationMaximumAttempts)
      assert.equal(waitCalls, CheapLfsGhcrPolicyVerificationMaximumAttempts - 1)
    })

    it('does not retry stable GHCR mismatches or any Docker Hub policy failure', async () => {
      for (const provider of ['ghcr', 'docker-hub'] as const) {
        const source = { repositoryId: 74, owner: 'owner', name: 'repo' }
        const target = deriveCheapLfsRegistryTarget({ ...source, provider })
        let registryCalls = 0
        let waitCalls = 0
        const verifier = createCheapLfsRegistryPolicyVerifier({
          source,
          target,
          sourceApi: {
            async inspectSourceRepository() {
              return {
                repositoryIdentity: target.repositoryIdentity,
                repositoryUrl: target.sourceRepositoryUrl,
                owner: source.owner,
                name: source.name,
                visibility: 'private',
                access: 'write',
              }
            },
          },
          registryApi: {
            async inspectRegistryRepository() {
              registryCalls++
              if (provider === 'docker-hub') {
                throw new CheapLfsGhcrPolicyPendingError()
              }
              return {
                visibility: 'public',
                hasPushAccess: true,
                linkedRepositoryIdentity: target.repositoryIdentity,
                linkedRepositoryUrl: target.sourceRepositoryUrl,
              }
            },
          },
          async waitForGhcrPolicyRetry() {
            waitCalls++
          },
        })
        await assert.rejects(
          verifier.verify({
            provider,
            repositoryIdentity: target.repositoryIdentity,
            registryRepository: target.registryRepository,
            sourceRepositoryUrl: target.sourceRepositoryUrl,
            immutableReference: `${
              target.registryRepository
            }@sha256:${'f'.repeat(64)}`,
            visibility: 'private',
          }),
          (error: unknown) =>
            error instanceof CheapLfsRegistryRuntimeError &&
            error.kind === 'policy'
        )
        assert.equal(registryCalls, 1)
        assert.equal(waitCalls, 0)
      }
    })

    it('cancels a GHCR metadata poll before another API attempt', async () => {
      const source = { repositoryId: 75, owner: 'owner', name: 'repo' }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      const controller = new AbortController()
      let registryCalls = 0
      const verifier = createCheapLfsRegistryPolicyVerifier({
        source,
        target,
        sourceApi: {
          async inspectSourceRepository() {
            return {
              repositoryIdentity: target.repositoryIdentity,
              repositoryUrl: target.sourceRepositoryUrl,
              owner: source.owner,
              name: source.name,
              visibility: 'private',
              access: 'write',
            }
          },
        },
        registryApi: {
          async inspectRegistryRepository() {
            registryCalls++
            throw new CheapLfsGhcrPolicyPendingError()
          },
        },
        async waitForGhcrPolicyRetry(_delayMs, signal) {
          assert.equal(signal, controller.signal)
          controller.abort()
        },
      })

      await assert.rejects(
        verifier.verify({
          provider: 'ghcr',
          repositoryIdentity: target.repositoryIdentity,
          registryRepository: target.registryRepository,
          sourceRepositoryUrl: target.sourceRepositoryUrl,
          immutableReference: `${target.registryRepository}@sha256:${'1'.repeat(
            64
          )}`,
          visibility: 'private',
          signal: controller.signal,
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'canceled'
      )
      assert.equal(registryCalls, 1)
    })

    it('rejects read-only source access and wrong registry visibility or linkage', async () => {
      const source = { repositoryId: 43, owner: 'owner', name: 'repo' }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      const request = {
        provider: 'ghcr' as const,
        repositoryIdentity: target.repositoryIdentity,
        registryRepository: target.registryRepository,
        sourceRepositoryUrl: target.sourceRepositoryUrl,
        immutableReference: `${target.registryRepository}@sha256:${'c'.repeat(
          64
        )}`,
        visibility: 'private' as const,
      }
      const sourcePolicy = {
        repositoryIdentity: target.repositoryIdentity,
        repositoryUrl: target.sourceRepositoryUrl,
        owner: 'owner',
        name: 'repo',
        visibility: 'private' as const,
        access: 'write' as const,
      }
      const registryPolicy = {
        visibility: 'private' as const,
        hasPushAccess: true,
        linkedRepositoryIdentity: target.repositoryIdentity,
        linkedRepositoryUrl: target.sourceRepositoryUrl,
      }

      for (const policies of [
        {
          source: { ...sourcePolicy, access: 'read' as const },
          registry: registryPolicy,
        },
        {
          source: sourcePolicy,
          registry: { ...registryPolicy, visibility: 'public' as const },
        },
        {
          source: sourcePolicy,
          registry: {
            ...registryPolicy,
            linkedRepositoryIdentity: 'github.com/repositories/999',
          },
        },
        {
          source: sourcePolicy,
          registry: {
            ...registryPolicy,
            linkedRepositoryIdentity: null,
          },
        },
      ]) {
        const verifier = createCheapLfsRegistryPolicyVerifier({
          source,
          target,
          sourceApi: {
            async inspectSourceRepository() {
              return policies.source
            },
          },
          registryApi: {
            async inspectRegistryRepository() {
              return policies.registry
            },
          },
        })
        await assert.rejects(
          verifier.verify(request),
          (error: unknown) =>
            error instanceof CheapLfsRegistryRuntimeError &&
            error.kind === 'policy'
        )
      }
    })

    it('fails closed with a generic message on API or request mismatch', async () => {
      const source = { repositoryId: 42, owner: 'owner', name: 'repo' }
      const target = deriveCheapLfsRegistryTarget({
        ...source,
        provider: 'ghcr',
      })
      const verifier = createCheapLfsRegistryPolicyVerifier({
        source,
        target,
        sourceApi: {
          async inspectSourceRepository() {
            throw new Error('api-token-must-not-leak')
          },
        },
        registryApi: {
          async inspectRegistryRepository() {
            assert.fail('registry must not run after source failure')
          },
        },
      })
      await assert.rejects(
        verifier.verify({
          provider: 'ghcr',
          repositoryIdentity: target.repositoryIdentity,
          registryRepository: target.registryRepository,
          sourceRepositoryUrl: target.sourceRepositoryUrl,
          immutableReference: `${target.registryRepository}@sha256:${'b'.repeat(
            64
          )}`,
          visibility: 'private',
        }),
        (error: unknown) => {
          assert.ok(error instanceof CheapLfsRegistryRuntimeError)
          assert.equal(error.kind, 'policy')
          assert.equal(error.message.includes('api-token-must-not-leak'), false)
          return true
        }
      )

      await assert.rejects(
        verifier.verify({
          provider: 'ghcr',
          repositoryIdentity: target.repositoryIdentity,
          registryRepository: target.registryRepository,
          sourceRepositoryUrl: target.sourceRepositoryUrl,
          immutableReference: `${target.registryRepository}:mutable-tag`,
          visibility: 'private',
        }),
        (error: unknown) =>
          error instanceof CheapLfsRegistryRuntimeError &&
          error.kind === 'policy'
      )
    })
  })
})
