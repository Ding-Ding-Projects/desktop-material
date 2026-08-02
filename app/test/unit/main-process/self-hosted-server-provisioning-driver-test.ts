import assert from 'node:assert'
import * as path from 'node:path'
import { describe, it } from 'node:test'

import { createSelfHostedServerBootstrap } from '../../../src/lib/self-hosted-server/provisioning'
import {
  ISelfHostedServerCredentialVault,
  ISelfHostedServerProvisioningFileSystem,
  ISelfHostedServerProvisioningLaunch,
  ISelfHostedServerProvisioningProcessExecutor,
  ISelfHostedServerProvisioningProcessRequest,
  ISelfHostedServerProvisioningProcessResult,
  IWindowsSelfHostedServerProvisioningDriverDependencies,
  SelfHostedServerProvisioningCredentialService,
  SelfHostedServerProvisioningDriverError,
  SelfHostedServerProvisioningProjectName,
  WindowsSelfHostedServerProvisioningDriver,
} from '../../../src/main-process/self-hosted-server/provisioning-driver'

const UserDataPath = 'C:\\Users\\test\\AppData\\Roaming\\Desktop Material'
const ManagedRoot = `${UserDataPath}\\self-hosted-server`
const DataRoot = `${ManagedRoot}\\data`
const ConfigurationPath = `${DataRoot}\\config.json`
const BundlePath = 'C:\\Program Files\\Desktop Material\\resources\\server'
const ComposePath = `${BundlePath}\\compose.yml`
const ProgramFilesPath = 'C:\\Program Files'
const DockerPath =
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const DockerDesktopPath =
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
const WindowsDirectoryPath = 'C:\\Windows'
const WingetPath =
  'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe'
const CurrentUserSid = 'S-1-5-21-111-222-333-1001'
const AdminToken = 'a'.repeat(43)
const JoinToken = 'j'.repeat(43)
const PublicOrigin = 'https://desktop-material.example'
const LoopbackCompose = [
  'services:',
  '  server:',
  '    build:',
  '      context: ${DESKTOP_MATERIAL_SERVER_BUNDLE_PATH:?Desktop Material server bundle is required}',
  '      dockerfile: Dockerfile',
  '    volumes:',
  '      - type: bind',
  '        source: ${DESKTOP_MATERIAL_SERVER_DATA_PATH:?Desktop Material server data path is required}',
  '        target: /data',
  '    ports:',
  "      - '127.0.0.1:${DESKTOP_MATERIAL_SERVER_PORT:-8787}:8787'",
  '',
].join('\n')

function canonical(filePath: string): string {
  return path.win32.resolve(filePath).toLowerCase()
}

class FakeFileSystem implements ISelfHostedServerProvisioningFileSystem {
  public readonly entries = new Map<
    string,
    { readonly kind: 'file' | 'directory' | 'reparse'; readonly text?: string }
  >()
  public readonly operations = new Array<string>()
  public readonly transientReads = new Map<string, number>()
  public readonly realPaths = new Map<string, string>()
  public afterRename: (() => void) | null = null

  public constructor() {
    this.directory(UserDataPath)
    this.directory(BundlePath)
    this.file(ComposePath, LoopbackCompose)
    this.directory(ProgramFilesPath)
    this.directory('C:\\Program Files\\Docker')
    this.directory('C:\\Program Files\\Docker\\Docker')
    this.directory('C:\\Program Files\\Docker\\Docker\\resources')
    this.directory('C:\\Program Files\\Docker\\Docker\\resources\\bin')
    this.file(DockerPath, '')
    this.file(DockerDesktopPath, '')
    this.directory(WindowsDirectoryPath)
    this.directory('C:\\Windows\\System32')
    this.file('C:\\Windows\\System32\\icacls.exe', '')
    this.file('C:\\Windows\\System32\\taskkill.exe', '')
    this.directory('C:\\Users\\test\\AppData\\Local')
    this.directory('C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps')
    this.file(WingetPath, '')
  }

  public file(filePath: string, text: string): void {
    this.entries.set(canonical(filePath), { kind: 'file', text })
  }

  public directory(filePath: string): void {
    this.entries.set(canonical(filePath), { kind: 'directory' })
  }

  public reparse(filePath: string): void {
    this.entries.set(canonical(filePath), { kind: 'reparse' })
  }

  public readonly entryKind = async (filePath: string) =>
    this.entries.get(canonical(filePath))?.kind ?? null

  public readonly realPath = async (filePath: string) =>
    this.realPaths.get(canonical(filePath)) ?? filePath

  public readonly makeDirectory = async (directoryPath: string) => {
    this.operations.push(`mkdir:${directoryPath}`)
    this.directory(directoryPath)
  }

  public readonly readText = async (filePath: string) => {
    const key = canonical(filePath)
    const remaining = this.transientReads.get(key) ?? 0
    if (remaining > 0) {
      this.transientReads.set(key, remaining - 1)
      const error = new Error('sensitive transient output') as Error & {
        code: string
      }
      error.code = 'EBUSY'
      throw error
    }
    const entry = this.entries.get(key)
    if (entry?.kind !== 'file') {
      const error = new Error('not found') as Error & { code: string }
      error.code = 'ENOENT'
      throw error
    }
    this.operations.push(`read:${filePath}`)
    return entry.text ?? ''
  }

  public readonly writeNewText = async (filePath: string, value: string) => {
    const key = canonical(filePath)
    if (this.entries.has(key)) {
      const error = new Error('exists') as Error & { code: string }
      error.code = 'EEXIST'
      throw error
    }
    this.operations.push(`write-new:${filePath}`)
    this.file(filePath, value)
  }

  public readonly rename = async (fromPath: string, toPath: string) => {
    const from = canonical(fromPath)
    const to = canonical(toPath)
    const entry = this.entries.get(from)
    if (entry === undefined || this.entries.has(to)) {
      throw new Error('rename failed')
    }
    this.operations.push(`rename:${fromPath}->${toPath}`)
    this.entries.set(to, entry)
    this.entries.delete(from)
    this.afterRename?.()
  }

  public readonly remove = async (filePath: string) => {
    this.operations.push(`remove:${filePath}`)
    this.entries.delete(canonical(filePath))
  }
}

class FakeProcessExecutor
  implements ISelfHostedServerProvisioningProcessExecutor
{
  public readonly runs =
    new Array<ISelfHostedServerProvisioningProcessRequest>()
  public readonly launches = new Array<
    Omit<
      ISelfHostedServerProvisioningProcessRequest,
      'timeoutMilliseconds' | 'maximumOutputBytes'
    >
  >()
  public composeAvailable = true
  public daemonAvailable = true
  public failNext = false
  public timeOutNext = false
  public outputExceededNext = false
  public onRun:
    | ((request: ISelfHostedServerProvisioningProcessRequest) => void)
    | null = null
  public afterLaunch: (() => void) | null = null
  public launchTerminations = 0
  public launchReleases = 0

  public readonly run = async (
    request: ISelfHostedServerProvisioningProcessRequest
  ): Promise<ISelfHostedServerProvisioningProcessResult> => {
    this.runs.push(request)
    this.onRun?.(request)
    const failure = this.failNext
    const timedOut = this.timeOutNext
    const outputExceeded = this.outputExceededNext
    this.failNext = false
    this.timeOutNext = false
    this.outputExceededNext = false

    let stdout = ''
    if (request.args[0] === 'compose' && request.args[1] === 'version') {
      stdout = this.composeAvailable ? 'v2.42.0\n' : ''
      return {
        exitCode: this.composeAvailable && !failure ? 0 : 1,
        stdout,
        timedOut,
        outputExceeded,
      }
    }
    if (request.args[0] === 'info') {
      stdout = this.daemonAvailable ? '29.7.1\n' : ''
      return {
        exitCode: this.daemonAvailable && !failure ? 0 : 1,
        stdout,
        timedOut,
        outputExceeded,
      }
    }
    return {
      exitCode: failure ? 1 : 0,
      stdout,
      timedOut,
      outputExceeded,
    }
  }

  public readonly launch = async (
    request: Omit<
      ISelfHostedServerProvisioningProcessRequest,
      'timeoutMilliseconds' | 'maximumOutputBytes'
    >
  ): Promise<ISelfHostedServerProvisioningLaunch> => {
    this.launches.push(request)
    this.afterLaunch?.()
    return {
      terminate: async () => {
        this.launchTerminations++
      },
      release: () => {
        this.launchReleases++
      },
    }
  }
}

class FakeVault implements ISelfHostedServerCredentialVault {
  public readonly passwords = new Map<string, string>()
  public readonly calls = new Array<ReadonlyArray<string>>()
  public fail = false
  public afterSet: (() => void) | null = null

  public readonly setPassword = async (
    service: string,
    account: string,
    password: string
  ) => {
    this.calls.push(['set', service, account, password])
    if (this.fail) {
      throw new Error(`vault rejected ${password}`)
    }
    this.passwords.set(`${service}:${account}`, password)
    this.afterSet?.()
  }

  public readonly getPassword = async (service: string, account: string) => {
    this.calls.push(['get', service, account])
    if (this.fail) {
      throw new Error('vault provider leaked output')
    }
    return this.passwords.get(`${service}:${account}`) ?? null
  }

  public readonly deletePassword = async (service: string, account: string) => {
    this.calls.push(['delete', service, account])
    if (this.fail) {
      throw new Error('vault provider leaked output')
    }
    return this.passwords.delete(`${service}:${account}`)
  }
}

function createDependencies(
  overrides: Partial<IWindowsSelfHostedServerProvisioningDriverDependencies> = {}
): {
  readonly dependencies: IWindowsSelfHostedServerProvisioningDriverDependencies
  readonly fileSystem: FakeFileSystem
  readonly processExecutor: FakeProcessExecutor
  readonly vault: FakeVault
} {
  const fileSystem = new FakeFileSystem()
  const processExecutor = new FakeProcessExecutor()
  const vault = new FakeVault()
  return {
    dependencies: {
      userDataPath: UserDataPath,
      bundledServicePath: BundlePath,
      programFilesPath: ProgramFilesPath,
      windowsDirectoryPath: WindowsDirectoryPath,
      wingetExecutablePath: WingetPath,
      currentUserSid: CurrentUserSid,
      fileSystem,
      processExecutor,
      credentialVault: vault,
      randomId: () => 'fixed-id',
      ...overrides,
    },
    fileSystem,
    processExecutor,
    vault,
  }
}

function seedBootstrap(
  fileSystem: FakeFileSystem,
  publicOrigin = PublicOrigin
) {
  const bootstrap = createSelfHostedServerBootstrap(publicOrigin)
  fileSystem.directory(ManagedRoot)
  fileSystem.directory(DataRoot)
  fileSystem.file(ConfigurationPath, bootstrap.configurationJson)
  return bootstrap
}

function persistedBootstrap(
  bootstrap: ReturnType<typeof createSelfHostedServerBootstrap>
) {
  return {
    serverId: bootstrap.serverId,
    publicOrigin: bootstrap.publicOrigin,
    configurationJson: bootstrap.configurationJson,
  }
}

function processCallsContaining(
  processExecutor: FakeProcessExecutor,
  value: string
) {
  return processExecutor.runs.filter(call => call.args.includes(value))
}

describe('Windows self-hosted server provisioning driver', () => {
  it('owns a canonical local root and rejects relative, UNC, escaped, and reparse paths', async () => {
    for (const userDataPath of [
      'relative\\user-data',
      '\\\\server\\share\\user-data',
      '\\\\?\\C:\\unsafe',
      'C:\\safe\\..\\outside',
    ]) {
      const { dependencies } = createDependencies({ userDataPath })
      assert.throws(
        () => new WindowsSelfHostedServerProvisioningDriver(dependencies),
        (error: unknown) => {
          assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
          assert.equal(error.code, 'unsafe-path')
          return true
        }
      )
    }

    const reparse = createDependencies()
    reparse.fileSystem.reparse(ManagedRoot)
    await assert.rejects(
      new WindowsSelfHostedServerProvisioningDriver(
        reparse.dependencies
      ).readExistingBootstrap(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'unsafe-reparse-point')
        return true
      }
    )

    const redirected = createDependencies()
    redirected.fileSystem.directory(ManagedRoot)
    redirected.fileSystem.realPaths.set(
      canonical(ManagedRoot),
      'C:\\outside\\redirected'
    )
    await assert.rejects(
      new WindowsSelfHostedServerProvisioningDriver(
        redirected.dependencies
      ).readExistingBootstrap(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'unsafe-reparse-point')
        return true
      }
    )

    const escaped = createDependencies({
      randomId: () => '..\\..\\..\\outside',
    })
    const bootstrap = createSelfHostedServerBootstrap(PublicOrigin)
    await assert.rejects(
      new WindowsSelfHostedServerProvisioningDriver(
        escaped.dependencies
      ).writeBootstrap(
        persistedBootstrap(bootstrap),
        new AbortController().signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'unsafe-path')
        return true
      }
    )
  })

  it('probes CLI, Compose, daemon, and Desktop independently with fixed argv', async () => {
    const { dependencies, processExecutor } = createDependencies()
    processExecutor.daemonAvailable = false
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    const probe = await driver.probeDocker(new AbortController().signal)

    assert.deepEqual(probe, {
      cliAvailable: true,
      composeAvailable: true,
      daemonAvailable: false,
      desktopInstalled: true,
    })
    assert.deepEqual(
      processExecutor.runs.map(run => run.args),
      [
        ['compose', 'version', '--short'],
        ['info', '--format', '{{.ServerVersion}}'],
      ]
    )
    for (const run of processExecutor.runs) {
      assert.equal(run.executable, DockerPath)
      assert.equal(run.shell, false)
      assert.equal(run.windowsHide, true)
      assert.equal(run.env.DOCKER_HOST, 'npipe:////./pipe/docker_engine')
      assert.equal('PATH' in run.env, false)
    }
  })

  it('installs only the fixed Docker Desktop package and starts the allowlisted binary', async () => {
    const { dependencies, processExecutor } = createDependencies()
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)
    const signal = new AbortController().signal

    await driver.installDockerDesktop(signal)
    await driver.startDockerDesktop(signal)

    const install = processExecutor.runs[0]
    assert.equal(install.executable, WingetPath)
    assert.deepEqual(install.args, [
      'install',
      '--exact',
      '--id',
      'Docker.DockerDesktop',
      '--source',
      'winget',
      '--accept-source-agreements',
      '--accept-package-agreements',
      '--silent',
      '--disable-interactivity',
    ])
    assert.equal(install.shell, false)
    assert.equal(processExecutor.launches[0].executable, DockerDesktopPath)
    assert.deepEqual(processExecutor.launches[0].args, [])
    assert.equal(processExecutor.launches[0].shell, false)
    assert.equal(processExecutor.launches[0].windowsHide, true)
  })

  it('bounds daemon waiting and terminates a wizard-launched process on abort', async () => {
    let now = 0
    const timeout = createDependencies({
      now: () => now,
      schedule: callback => {
        now += 1_000
        queueMicrotask(callback)
        return 1 as unknown as ReturnType<typeof setTimeout>
      },
      cancelSchedule: () => undefined,
    })
    timeout.processExecutor.daemonAvailable = false
    const timeoutDriver = new WindowsSelfHostedServerProvisioningDriver(
      timeout.dependencies
    )
    await timeoutDriver.startDockerDesktop(new AbortController().signal)
    await assert.rejects(
      timeoutDriver.waitForDockerDaemon(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'process-timed-out')
        return true
      }
    )
    assert.equal(timeout.processExecutor.launchTerminations, 1)

    const aborted = createDependencies()
    aborted.processExecutor.daemonAvailable = false
    const controller = new AbortController()
    aborted.processExecutor.onRun = request => {
      if (request.args[0] === 'info') {
        controller.abort('private abort reason')
      }
    }
    const abortedDriver = new WindowsSelfHostedServerProvisioningDriver(
      aborted.dependencies
    )
    await abortedDriver.startDockerDesktop(controller.signal)
    await assert.rejects(
      abortedDriver.waitForDockerDaemon(controller.signal),
      (error: unknown) => {
        assert.ok(error instanceof DOMException)
        assert.equal(error.name, 'AbortError')
        assert.doesNotMatch(error.message, /private abort reason/)
        return true
      }
    )
    assert.equal(aborted.processExecutor.launchTerminations, 1)

    const launchAbort = createDependencies()
    const launchController = new AbortController()
    launchAbort.processExecutor.afterLaunch = () =>
      launchController.abort('private launch reason')
    const launchDriver = new WindowsSelfHostedServerProvisioningDriver(
      launchAbort.dependencies
    )
    await assert.rejects(
      launchDriver.startDockerDesktop(launchController.signal),
      (error: unknown) => {
        assert.ok(error instanceof DOMException)
        assert.equal(error.name, 'AbortError')
        assert.doesNotMatch(error.message, /private launch reason/)
        return true
      }
    )
    assert.equal(launchAbort.processExecutor.launchTerminations, 1)
  })

  it('writes bootstrap atomically under restrictive ACLs without receiving a token', async () => {
    const { dependencies, fileSystem, processExecutor } = createDependencies()
    const bootstrap = createSelfHostedServerBootstrap(PublicOrigin)
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    await driver.writeBootstrap(
      persistedBootstrap(bootstrap),
      new AbortController().signal
    )

    const stored = fileSystem.entries.get(canonical(ConfigurationPath))
    assert.equal(stored?.kind, 'file')
    assert.equal(stored?.text, bootstrap.configurationJson)
    assert.doesNotMatch(stored?.text ?? '', new RegExp(bootstrap.adminToken))
    assert.equal(
      fileSystem.operations.some(operation => operation.startsWith('rename:')),
      true
    )
    assert.equal(
      fileSystem.operations.some(operation => operation.includes('.tmp')),
      true
    )
    const aclCalls = processCallsContaining(processExecutor, '/inheritance:r')
    assert.equal(aclCalls.length, 3)
    assert.equal(
      aclCalls.every(
        call => call.executable === 'C:\\Windows\\System32\\icacls.exe'
      ),
      true
    )
    assert.equal(
      aclCalls.every(
        call =>
          call.args.includes(`*${CurrentUserSid}:(OI)(CI)F`) ||
          call.args.includes(`*${CurrentUserSid}:F`)
      ),
      true
    )
    assert.equal(
      JSON.stringify(processExecutor.runs).includes(bootstrap.adminToken),
      false
    )

    await assert.rejects(
      driver.writeBootstrap(
        persistedBootstrap(bootstrap),
        new AbortController().signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'configuration-write-failed')
        return true
      }
    )

    const withPlaintextField = {
      ...persistedBootstrap(createSelfHostedServerBootstrap(PublicOrigin)),
      adminToken: AdminToken,
    }
    await assert.rejects(
      driver.writeBootstrap(withPlaintextField, new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'configuration-invalid')
        return true
      }
    )
  })

  it('retries transient atomic reads and returns an honest missing-vault state', async () => {
    let scheduledReads = 0
    const { dependencies, fileSystem } = createDependencies({
      schedule: callback => {
        scheduledReads++
        queueMicrotask(callback)
        return scheduledReads as unknown as ReturnType<typeof setTimeout>
      },
      cancelSchedule: () => undefined,
    })
    const bootstrap = seedBootstrap(fileSystem)
    fileSystem.transientReads.set(canonical(ConfigurationPath), 1)
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    const existing = await driver.readExistingBootstrap(
      new AbortController().signal
    )

    assert.equal(scheduledReads, 1)
    assert.deepEqual(existing, {
      serverId: bootstrap.serverId,
      publicOrigin: PublicOrigin,
      adminToken: null,
    })
  })

  it('rolls back config and vault mutations completed by non-cooperative aborts', async () => {
    const write = createDependencies()
    const writeController = new AbortController()
    write.fileSystem.afterRename = () => writeController.abort('private path')
    const bootstrap = createSelfHostedServerBootstrap(PublicOrigin)
    const writeDriver = new WindowsSelfHostedServerProvisioningDriver(
      write.dependencies
    )

    await assert.rejects(
      writeDriver.writeBootstrap(
        persistedBootstrap(bootstrap),
        writeController.signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof DOMException)
        assert.equal(error.name, 'AbortError')
        assert.doesNotMatch(error.message, /private path/)
        return true
      }
    )
    assert.equal(
      write.fileSystem.entries.has(canonical(ConfigurationPath)),
      false
    )

    const token = createDependencies()
    const tokenController = new AbortController()
    token.vault.afterSet = () => tokenController.abort('private token')
    const tokenDriver = new WindowsSelfHostedServerProvisioningDriver(
      token.dependencies
    )
    await assert.rejects(
      tokenDriver.storeAdminToken(
        bootstrap.serverId,
        AdminToken,
        tokenController.signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof DOMException)
        assert.equal(error.name, 'AbortError')
        assert.doesNotMatch(error.message, /private token/)
        return true
      }
    )
    assert.equal(token.vault.passwords.size, 0)
    assert.equal(token.vault.calls.at(-1)?.[0], 'delete')
  })

  it('uses one stable keytar service and server account with no plaintext fallback', async () => {
    const { dependencies, fileSystem, vault } = createDependencies()
    const bootstrap = seedBootstrap(fileSystem)
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)
    const signal = new AbortController().signal

    await driver.storeAdminToken(bootstrap.serverId, AdminToken, signal)
    const existing = await driver.readExistingBootstrap(signal)
    await driver.removeAdminToken(bootstrap.serverId)

    assert.equal(existing?.adminToken, AdminToken)
    assert.deepEqual(
      vault.calls.map(call => call.slice(0, 3)),
      [
        [
          'set',
          SelfHostedServerProvisioningCredentialService,
          `server:${bootstrap.serverId}`,
        ],
        [
          'get',
          SelfHostedServerProvisioningCredentialService,
          `server:${bootstrap.serverId}`,
        ],
        [
          'delete',
          SelfHostedServerProvisioningCredentialService,
          `server:${bootstrap.serverId}`,
        ],
      ]
    )

    vault.fail = true
    await assert.rejects(
      driver.storeAdminToken(bootstrap.serverId, AdminToken, signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'credential-vault-failed')
        assert.doesNotMatch(error.message, new RegExp(AdminToken))
        assert.equal(error.cause, undefined)
        return true
      }
    )
  })

  it('runs the fixed bundled Compose project and preserves loopback publication', async () => {
    const { dependencies, fileSystem, processExecutor } = createDependencies()
    seedBootstrap(fileSystem, 'http://127.0.0.1:8787')
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    await driver.startServer(new AbortController().signal)

    const compose = processExecutor.runs.at(-1)
    assert.ok(compose)
    assert.equal(compose.executable, DockerPath)
    assert.equal(compose.cwd, ManagedRoot)
    assert.deepEqual(compose.args, [
      'compose',
      '--project-directory',
      ManagedRoot,
      '--file',
      ComposePath,
      '--project-name',
      SelfHostedServerProvisioningProjectName,
      'up',
      '--detach',
      '--build',
      '--remove-orphans',
      '--wait',
      '--wait-timeout',
      '120',
    ])
    assert.equal(compose.shell, false)
    assert.deepEqual(compose.env, {
      SystemRoot: WindowsDirectoryPath,
      WINDIR: WindowsDirectoryPath,
      DOCKER_HOST: 'npipe:////./pipe/docker_engine',
      DESKTOP_MATERIAL_SERVER_BUNDLE_PATH: BundlePath,
      DESKTOP_MATERIAL_SERVER_DATA_PATH: DataRoot,
    })

    fileSystem.file(
      ComposePath,
      [
        'services:',
        '  server:',
        '    ports:',
        "      - '0.0.0.0:8787:8787' # 127.0.0.1:${DESKTOP_MATERIAL_SERVER_PORT:-8787}:8787",
      ].join('\n')
    )
    await assert.rejects(
      driver.startServer(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'compose-contract-invalid')
        return true
      }
    )

    for (const unsafeCompose of [
      LoopbackCompose.replace(
        '${DESKTOP_MATERIAL_SERVER_BUNDLE_PATH:?Desktop Material server bundle is required}',
        '.'
      ),
      LoopbackCompose.replace(
        '${DESKTOP_MATERIAL_SERVER_DATA_PATH:?Desktop Material server data path is required}',
        './data'
      ),
    ]) {
      fileSystem.file(ComposePath, unsafeCompose)
      await assert.rejects(
        driver.startServer(new AbortController().signal),
        (error: unknown) => {
          assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
          assert.equal(error.code, 'compose-contract-invalid')
          return true
        }
      )
    }
  })

  it('verifies a bounded exact health identity over HTTPS or loopback HTTP', async () => {
    const requests = new Array<{
      readonly url: string
      readonly init?: RequestInit
    }>()
    const { dependencies } = createDependencies({
      fetch: async (input, init) => {
        requests.push({ url: String(input), init })
        return new Response(
          JSON.stringify({ status: 'ok', version: 1, serverId: 'server-1' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      },
    })
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    await driver.verifyServer(
      'http://127.0.0.1:8787',
      'server-1',
      new AbortController().signal
    )

    assert.equal(requests[0].url, 'http://127.0.0.1:8787/healthz')
    assert.equal(requests[0].init?.method, 'GET')
    assert.equal(requests[0].init?.redirect, 'error')
    assert.equal(requests[0].init?.credentials, 'omit')
  })

  it('rejects health identity mismatch and oversized bodies without leaking response data', async () => {
    const leaked = 'arbitrary-private-response-body'
    for (const response of [
      new Response(
        JSON.stringify({ status: 'ok', serverId: `${leaked}-wrong` }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
      new Response(leaked, {
        status: 200,
        headers: {
          'Content-Length': '20000',
          'Content-Type': 'application/json',
        },
      }),
    ]) {
      const { dependencies } = createDependencies({
        fetch: async () => response,
      })
      const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)
      await assert.rejects(
        driver.verifyServer(
          PublicOrigin,
          'expected-server',
          new AbortController().signal
        ),
        (error: unknown) => {
          assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
          assert.equal(error.code, 'health-response-invalid')
          assert.doesNotMatch(error.message, new RegExp(leaked))
          assert.equal(error.cause, undefined)
          return true
        }
      )
    }
  })

  it('keeps the request deadline active while a response body is still streaming', async () => {
    const privateBodyError = 'body stream exposed private credentials'
    let scheduledTimeout: (() => void) | null = null
    let timeoutActive = true
    let timeoutTriggered = false
    const { dependencies } = createDependencies({
      schedule: callback => {
        scheduledTimeout = () => {
          if (timeoutActive) {
            timeoutTriggered = true
            callback()
          }
        }
        return 1 as unknown as ReturnType<typeof setTimeout>
      },
      cancelSchedule: () => {
        timeoutActive = false
      },
      fetch: async (_input, init) => {
        let requestedTimeout = false
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{'))
            init?.signal?.addEventListener(
              'abort',
              () => controller.error(new Error(privateBodyError)),
              { once: true }
            )
          },
          pull() {
            if (!requestedTimeout) {
              requestedTimeout = true
              queueMicrotask(() => scheduledTimeout?.())
            }
          },
        })
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    await assert.rejects(
      driver.verifyServer(
        PublicOrigin,
        'server-1',
        new AbortController().signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'health-response-invalid')
        assert.doesNotMatch(error.message, new RegExp(privateBodyError))
        return true
      }
    )
    assert.equal(timeoutTriggered, true)
  })

  it('sends the admin token only in Authorization and validates a bounded join link', async () => {
    const requests = new Array<{
      readonly url: string
      readonly init?: RequestInit
    }>()
    const joinUrl = `${PublicOrigin}/join#token=${JoinToken}`
    const { dependencies } = createDependencies({
      fetch: async (input, init) => {
        requests.push({ url: String(input), init })
        return new Response(JSON.stringify({ joinUrl }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    const driver = new WindowsSelfHostedServerProvisioningDriver(dependencies)

    assert.equal(
      await driver.createJoinLink(
        PublicOrigin,
        AdminToken,
        new AbortController().signal
      ),
      joinUrl
    )

    const request = requests[0]
    assert.ok(request)
    assert.equal(request.url, `${PublicOrigin}/v1/admin/join-links`)
    assert.doesNotMatch(request.url, new RegExp(AdminToken))
    assert.equal(request.init?.body, '{}')
    assert.doesNotMatch(String(request.init?.body), new RegExp(AdminToken))
    const headers = request.init?.headers as Record<string, string>
    assert.equal(headers.Authorization, `Bearer ${AdminToken}`)
    assert.equal(request.init?.redirect, 'error')
  })

  it('redacts token, credentials, and arbitrary bodies from join and process errors', async () => {
    const privateBody = `https://user:${AdminToken}@example.test/${'x'.repeat(
      20_000
    )}`
    const join = createDependencies({
      fetch: async () =>
        new Response(privateBody, {
          status: 201,
          headers: {
            'Content-Length': String(privateBody.length),
            'Content-Type': 'application/json',
          },
        }),
    })
    const joinDriver = new WindowsSelfHostedServerProvisioningDriver(
      join.dependencies
    )
    await assert.rejects(
      joinDriver.createJoinLink(
        PublicOrigin,
        AdminToken,
        new AbortController().signal
      ),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'join-response-invalid')
        assert.doesNotMatch(error.message, new RegExp(AdminToken))
        assert.doesNotMatch(error.message, /user:/)
        assert.equal(error.cause, undefined)
        return true
      }
    )

    const process = createDependencies()
    process.processExecutor.failNext = true
    const processDriver = new WindowsSelfHostedServerProvisioningDriver(
      process.dependencies
    )
    await assert.rejects(
      processDriver.installDockerDesktop(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'process-failed')
        assert.equal(error.cause, undefined)
        return true
      }
    )

    process.processExecutor.timeOutNext = true
    await assert.rejects(
      processDriver.installDockerDesktop(new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningDriverError)
        assert.equal(error.code, 'process-timed-out')
        assert.equal(error.cause, undefined)
        return true
      }
    )
  })
})
