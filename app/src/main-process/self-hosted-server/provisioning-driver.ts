import { spawn } from 'child_process'
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'fs/promises'
import { randomUUID } from 'crypto'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'

import {
  IDockerProvisioningProbe,
  IExistingSelfHostedServerBootstrap,
  ISelfHostedServerBootstrap,
  ISelfHostedServerProvisioningDriver,
  validateSamlMetadataXml,
} from '../../lib/self-hosted-server/provisioning'

const DockerDesktopPackageId = 'Docker.DockerDesktop'
const DockerDesktopProjectName = 'desktop-material-server'
const ManagedDirectoryName = 'self-hosted-server'
const ServerDataDirectoryName = 'data'
const ServerConfigurationFileName = 'config.json'
const ServerComposeFileName = 'compose.yml'
const CredentialService = 'desktop-material.self-hosted-server.admin'
const LocalSystemSid = 'S-1-5-18'
const DockerDaemonPollMilliseconds = 1_000
const DockerDaemonWaitMilliseconds = 120_000
const ProbeTimeoutMilliseconds = 8_000
const InstallTimeoutMilliseconds = 30 * 60 * 1_000
const ComposeTimeoutMilliseconds = 10 * 60 * 1_000
const HttpTimeoutMilliseconds = 10_000
const MaximumProcessOutputBytes = 16 * 1_024
const MaximumConfigurationBytes = 32 * 1_024
const MaximumHttpResponseBytes = 16 * 1_024
const MaximumJoinUrlCharacters = 2_048
const MaximumReadAttempts = 3
const TransientReadRetryMilliseconds = 40

type FileSystemEntryKind = 'file' | 'directory' | 'reparse' | null

export interface ISelfHostedServerProvisioningFileSystem {
  readonly entryKind: (filePath: string) => Promise<FileSystemEntryKind>
  readonly realPath: (filePath: string) => Promise<string>
  readonly makeDirectory: (directoryPath: string) => Promise<void>
  readonly readText: (filePath: string) => Promise<string>
  readonly writeNewText: (filePath: string, value: string) => Promise<void>
  readonly rename: (fromPath: string, toPath: string) => Promise<void>
  readonly remove: (filePath: string) => Promise<void>
}

export interface ISelfHostedServerProvisioningProcessRequest {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly env: Readonly<Record<string, string>>
  readonly shell: false
  readonly windowsHide: true
  readonly timeoutMilliseconds: number
  readonly maximumOutputBytes: number
  readonly signal: AbortSignal
}

export interface ISelfHostedServerProvisioningProcessResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly timedOut: boolean
  readonly outputExceeded: boolean
}

export interface ISelfHostedServerProvisioningLaunch {
  /** Stop this exact process and its descendants. */
  readonly terminate: () => Promise<void>
  /** Keep the process running and remove only the wizard abort listener. */
  readonly release: () => void
}

export interface ISelfHostedServerProvisioningProcessExecutor {
  readonly run: (
    request: ISelfHostedServerProvisioningProcessRequest
  ) => Promise<ISelfHostedServerProvisioningProcessResult>
  readonly launch: (
    request: Omit<
      ISelfHostedServerProvisioningProcessRequest,
      'timeoutMilliseconds' | 'maximumOutputBytes'
    >
  ) => Promise<ISelfHostedServerProvisioningLaunch>
}

export interface ISelfHostedServerCredentialVault {
  readonly setPassword: (
    service: string,
    account: string,
    password: string
  ) => Promise<void>
  readonly getPassword: (
    service: string,
    account: string
  ) => Promise<string | null>
  readonly deletePassword: (
    service: string,
    account: string
  ) => Promise<boolean>
}

export interface IWindowsSelfHostedServerProvisioningDriverDependencies {
  /** Trusted Electron `app.getPath('userData')`; never renderer supplied. */
  readonly userDataPath: string
  /** Trusted packaged `services/desktop-material-server` directory. */
  readonly bundledServicePath: string
  /** Trusted Windows Program Files directory. */
  readonly programFilesPath: string
  /** Trusted Windows directory, used only for system utilities. */
  readonly windowsDirectoryPath: string
  /** Resolved, allowlisted App Installer executable. */
  readonly wingetExecutablePath: string
  /** Current Windows identity in SID form, for a non-ambiguous ACL. */
  readonly currentUserSid: string
  readonly fileSystem?: ISelfHostedServerProvisioningFileSystem
  readonly processExecutor?: ISelfHostedServerProvisioningProcessExecutor
  readonly credentialVault?: ISelfHostedServerCredentialVault
  readonly fetch?: typeof fetch
  readonly now?: () => number
  readonly randomId?: () => string
  readonly schedule?: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>
  readonly cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void
}

export type SelfHostedServerProvisioningDriverErrorCode =
  | 'unsafe-path'
  | 'unsafe-reparse-point'
  | 'process-failed'
  | 'process-timed-out'
  | 'configuration-invalid'
  | 'configuration-write-failed'
  | 'credential-vault-failed'
  | 'compose-contract-invalid'
  | 'health-response-invalid'
  | 'join-response-invalid'

/**
 * A deliberately content-free error. Process output, response bodies, URLs,
 * and credential-provider errors never become part of its message or cause.
 */
export class SelfHostedServerProvisioningDriverError extends Error {
  public constructor(
    public readonly code: SelfHostedServerProvisioningDriverErrorCode
  ) {
    super(code)
  }
}

function abortError(): DOMException {
  return new DOMException(
    'The provisioning operation was cancelled.',
    'AbortError'
  )
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError()
  }
}

function isErrorCode(error: unknown, ...codes: ReadonlyArray<string>): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    codes.includes(error.code)
  )
}

function isAbsoluteLocalPath(value: string): boolean {
  const withoutTrailingSeparator = value.replace(/[\\/]+$/, '')
  const normalizedWithoutTrailingSeparator = path.win32
    .normalize(value)
    .replace(/[\\/]+$/, '')
  const pathSegments = value.slice(3).split('\\')
  return (
    /^[A-Za-z]:\\/.test(value) &&
    path.win32.isAbsolute(value) &&
    withoutTrailingSeparator === normalizedWithoutTrailingSeparator &&
    !/[\u0000-\u001f:*?"<>|]/.test(value.slice(2)) &&
    pathSegments.every(
      segment =>
        segment.length === 0 ||
        (segment !== '.' &&
          segment !== '..' &&
          !segment.endsWith('.') &&
          !segment.endsWith(' '))
    ) &&
    !value.startsWith('\\\\') &&
    !value.startsWith('//') &&
    !value.startsWith('\\\\?\\') &&
    !value.startsWith('\\\\.\\')
  )
}

function canonicalWindowsPath(value: string): string {
  return path.win32
    .resolve(value)
    .replace(/[\\/]+$/, '')
    .toLowerCase()
}

function isContainedPath(root: string, candidate: string): boolean {
  const canonicalRoot = canonicalWindowsPath(root)
  const canonicalCandidate = canonicalWindowsPath(candidate)
  return (
    canonicalCandidate === canonicalRoot ||
    canonicalCandidate.startsWith(`${canonicalRoot}\\`)
  )
}

function credentialAccount(serverId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serverId)) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  return `server:${serverId}`
}

function normalizeOrigin(value: string): string {
  if (value.length === 0 || value.length > MaximumJoinUrlCharacters) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  const isLoopback =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]'
  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && isLoopback))
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  return parsed.origin
}

function defaultFileSystem(): ISelfHostedServerProvisioningFileSystem {
  return {
    entryKind: async filePath => {
      try {
        const entry = await lstat(filePath)
        if (entry.isSymbolicLink()) {
          return 'reparse'
        }
        if (entry.isDirectory()) {
          return 'directory'
        }
        return entry.isFile() ? 'file' : 'reparse'
      } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
          return null
        }
        throw error
      }
    },
    makeDirectory: async directoryPath => {
      await mkdir(directoryPath, { recursive: true, mode: 0o700 })
    },
    realPath: async filePath => await realpath(filePath),
    readText: async filePath => await readFile(filePath, 'utf8'),
    writeNewText: async (filePath, value) => {
      await writeFile(filePath, value, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
        flush: true,
      })
    },
    rename: async (fromPath, toPath) => await rename(fromPath, toPath),
    remove: async filePath => {
      await rm(filePath, { force: true })
    },
  }
}

async function loadDefaultVault(): Promise<ISelfHostedServerCredentialVault> {
  const keytar = await import('keytar')
  return keytar
}

function boundedAppend(
  current: string,
  chunk: Buffer,
  maximum: number
): string {
  if (current.length >= maximum) {
    return current
  }
  return (current + chunk.toString('utf8')).slice(0, maximum)
}

function defaultProcessExecutor(
  taskkillPath: string
): ISelfHostedServerProvisioningProcessExecutor {
  const terminateTree = async (pid: number | undefined) => {
    if (pid === undefined) {
      return
    }
    await new Promise<void>(resolve => {
      let child
      try {
        child = spawn(taskkillPath, ['/PID', String(pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        })
      } catch {
        resolve()
        return
      }
      let settled = false
      const finish = () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve()
        }
      }
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // The taskkill process already exited.
        }
        finish()
      }, ProbeTimeoutMilliseconds)
      timer.unref?.()
      child.once('error', finish)
      child.once('close', finish)
    })
  }

  return {
    run: request =>
      new Promise((resolve, reject) => {
        assertActive(request.signal)
        let child
        try {
          child = spawn(request.executable, [...request.args], {
            cwd: request.cwd,
            env: { ...request.env },
            shell: false,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        } catch {
          reject(new SelfHostedServerProvisioningDriverError('process-failed'))
          return
        }

        let stdout = ''
        let outputBytes = 0
        let outputExceeded = false
        let settled = false
        let timedOut = false
        const finish = (
          result: ISelfHostedServerProvisioningProcessResult | null,
          error?: Error
        ) => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          request.signal.removeEventListener('abort', onAbort)
          if (error !== undefined) {
            reject(error)
          } else if (result !== null) {
            resolve(result)
          }
        }
        const stopTree = () => {
          void terminateTree(child.pid).finally(() => {
            try {
              child.kill()
            } catch {
              // The child already exited.
            }
          })
        }
        const collect = (chunk: Buffer, retain: boolean) => {
          outputBytes += chunk.length
          if (outputBytes > request.maximumOutputBytes) {
            outputExceeded = true
            stopTree()
            finish({
              exitCode: null,
              stdout,
              timedOut: false,
              outputExceeded: true,
            })
          }
          if (retain) {
            stdout = boundedAppend(stdout, chunk, request.maximumOutputBytes)
          }
        }
        const onAbort = () => {
          stopTree()
          finish(null, abortError())
        }
        request.signal.addEventListener('abort', onAbort, { once: true })
        const timer = setTimeout(() => {
          timedOut = true
          stopTree()
          finish({
            exitCode: null,
            stdout,
            timedOut: true,
            outputExceeded,
          })
        }, request.timeoutMilliseconds)
        timer.unref?.()

        child.stdout?.on('data', (chunk: Buffer) => collect(chunk, true))
        child.stderr?.on('data', (chunk: Buffer) => collect(chunk, false))
        child.once('error', () => {
          finish(
            null,
            new SelfHostedServerProvisioningDriverError('process-failed')
          )
        })
        child.once('close', code => {
          finish({ exitCode: code, stdout, timedOut, outputExceeded })
        })
      }),
    launch: request =>
      new Promise((resolve, reject) => {
        assertActive(request.signal)
        let child
        try {
          child = spawn(request.executable, [...request.args], {
            cwd: request.cwd,
            env: { ...request.env },
            shell: false,
            windowsHide: true,
            stdio: 'ignore',
          })
        } catch {
          reject(new SelfHostedServerProvisioningDriverError('process-failed'))
          return
        }
        let settled = false
        const onAbort = () => {
          void terminateTree(child.pid).finally(() => {
            try {
              child.kill()
            } catch {
              // The child already exited.
            }
          })
          if (!settled) {
            settled = true
            reject(abortError())
          }
        }
        request.signal.addEventListener('abort', onAbort, { once: true })
        child.once('error', () => {
          request.signal.removeEventListener('abort', onAbort)
          if (!settled) {
            settled = true
            reject(
              new SelfHostedServerProvisioningDriverError('process-failed')
            )
          }
        })
        child.once('spawn', () => {
          if (!settled) {
            settled = true
            child.unref()
            resolve({
              terminate: async () => {
                request.signal.removeEventListener('abort', onAbort)
                await terminateTree(child.pid)
                try {
                  child.kill()
                } catch {
                  // The child already exited.
                }
              },
              release: () =>
                request.signal.removeEventListener('abort', onAbort),
            })
          }
        })
      }),
  }
}

function parseBootstrapConfiguration(value: string): {
  readonly serverId: string
  readonly publicOrigin: string
} {
  if (Buffer.byteLength(value, 'utf8') > MaximumConfigurationBytes) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.prototype.hasOwnProperty.call(parsed, 'adminToken')
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  const config = parsed as Record<string, unknown>
  const expectedKeys = [
    'version',
    'serverId',
    'publicOrigin',
    'adminTokenHash',
    'initialJoinTokenHash',
    'initialJoinExpiresAt',
    'allowInsecureHttp',
    'transport',
  ]
  // OAuth key material is written alongside the base fields but, unlike
  // them, this driver only bounds-checks it: deep validation of client
  // registrations and the signing key belongs to the server that actually
  // uses them (services/desktop-material-server/server.mjs), matching how
  // this function already treats adminTokenHash as an opaque, bounded blob.
  const oauthKeys = [
    'oauthClientsJson',
    'oauthSigningKeyPem',
    'oauthSigningPublicJwkJson',
    'oauthKeyId',
  ]
  const samlMetadataKey = 'samlMetadataXml'
  const presentOAuthKeys = oauthKeys.filter(key => key in config)
  if (
    presentOAuthKeys.length !== 0 &&
    presentOAuthKeys.length !== oauthKeys.length
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  const allowedKeys = [...expectedKeys, ...oauthKeys, samlMetadataKey]
  if (
    !Object.keys(config).every(key => allowedKeys.includes(key)) ||
    !expectedKeys.every(key => key in config) ||
    config.version !== 1 ||
    typeof config.serverId !== 'string' ||
    typeof config.publicOrigin !== 'string' ||
    typeof config.adminTokenHash !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(config.adminTokenHash) ||
    typeof config.initialJoinTokenHash !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(config.initialJoinTokenHash) ||
    typeof config.initialJoinExpiresAt !== 'string' ||
    !Number.isFinite(Date.parse(config.initialJoinExpiresAt)) ||
    typeof config.allowInsecureHttp !== 'boolean' ||
    config.transport !== 'reverse-proxy'
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  if (samlMetadataKey in config) {
    try {
      if (typeof config[samlMetadataKey] !== 'string') {
        throw new Error('invalid-saml-metadata')
      }
      validateSamlMetadataXml(config[samlMetadataKey])
    } catch {
      throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
    }
  }
  if (
    presentOAuthKeys.length === oauthKeys.length &&
    (typeof config.oauthClientsJson !== 'string' ||
      config.oauthClientsJson.length === 0 ||
      config.oauthClientsJson.length > 16_384 ||
      typeof config.oauthSigningKeyPem !== 'string' ||
      !config.oauthSigningKeyPem.startsWith('-----BEGIN PRIVATE KEY-----') ||
      config.oauthSigningKeyPem.length > 4_096 ||
      typeof config.oauthSigningPublicJwkJson !== 'string' ||
      config.oauthSigningPublicJwkJson.length === 0 ||
      config.oauthSigningPublicJwkJson.length > 2_048 ||
      typeof config.oauthKeyId !== 'string' ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(config.oauthKeyId))
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  credentialAccount(config.serverId)
  const publicOrigin = normalizeOrigin(config.publicOrigin)
  if (
    publicOrigin !== config.publicOrigin ||
    config.allowInsecureHttp !== publicOrigin.startsWith('http://')
  ) {
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }
  return {
    serverId: config.serverId,
    publicOrigin,
  }
}

function composePreservesLoopbackPublication(value: string): boolean {
  if (Buffer.byteLength(value, 'utf8') > MaximumConfigurationBytes) {
    return false
  }
  try {
    const document = parseYaml(value) as unknown
    if (
      document === null ||
      typeof document !== 'object' ||
      Array.isArray(document)
    ) {
      return false
    }
    const services = (document as Record<string, unknown>).services
    if (
      services === null ||
      typeof services !== 'object' ||
      Array.isArray(services)
    ) {
      return false
    }
    if (
      Object.keys(services as Record<string, unknown>).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(services, 'server')
    ) {
      return false
    }
    const server = (services as Record<string, unknown>).server
    if (
      server === null ||
      typeof server !== 'object' ||
      Array.isArray(server)
    ) {
      return false
    }
    const definition = server as Record<string, unknown>
    const build = definition.build
    const volumes = definition.volumes
    if (
      build === null ||
      typeof build !== 'object' ||
      Array.isArray(build) ||
      Object.keys(build as Record<string, unknown>).length !== 2 ||
      (build as Record<string, unknown>).context !==
        '${DESKTOP_MATERIAL_SERVER_BUNDLE_PATH:?Desktop Material server bundle is required}' ||
      (build as Record<string, unknown>).dockerfile !== 'Dockerfile' ||
      !Array.isArray(volumes) ||
      volumes.length !== 1 ||
      volumes[0] === null ||
      typeof volumes[0] !== 'object' ||
      Array.isArray(volumes[0]) ||
      Object.keys(volumes[0] as Record<string, unknown>).length !== 3 ||
      (volumes[0] as Record<string, unknown>).type !== 'bind' ||
      (volumes[0] as Record<string, unknown>).source !==
        '${DESKTOP_MATERIAL_SERVER_DATA_PATH:?Desktop Material server data path is required}' ||
      (volumes[0] as Record<string, unknown>).target !== '/data'
    ) {
      return false
    }
    const ports = definition.ports
    const exactServerPort =
      Array.isArray(ports) &&
      ports.length === 1 &&
      ports[0] === '127.0.0.1:${DESKTOP_MATERIAL_SERVER_PORT:-8787}:8787'
    if (!exactServerPort) {
      return false
    }
    return Object.values(services).every(service => {
      if (
        service === null ||
        typeof service !== 'object' ||
        Array.isArray(service)
      ) {
        return false
      }
      const definition = service as Record<string, unknown>
      if (
        definition.network_mode === 'host' ||
        definition.privileged === true
      ) {
        return false
      }
      const publishedPorts = definition.ports
      return (
        publishedPorts === undefined ||
        (Array.isArray(publishedPorts) &&
          publishedPorts.every(
            publishedPort =>
              typeof publishedPort === 'string' &&
              publishedPort.startsWith('127.0.0.1:')
          ))
      )
    })
  } catch {
    return false
  }
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maximumBytes
  ) {
    throw new SelfHostedServerProvisioningDriverError('health-response-invalid')
  }
  if (response.body === null) {
    throw new SelfHostedServerProvisioningDriverError('health-response-invalid')
  }
  const reader = response.body.getReader()
  const chunks = new Array<Uint8Array>()
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      length += next.value.byteLength
      if (length > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        throw new SelfHostedServerProvisioningDriverError(
          'health-response-invalid'
        )
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const data = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch {
    throw new SelfHostedServerProvisioningDriverError('health-response-invalid')
  }
}

/**
 * Windows-only main-process provisioning boundary. Every filesystem target is
 * derived from trusted constructor roots; no path, executable, argv, cwd, or
 * environment field is accepted from a renderer request.
 */
export class WindowsSelfHostedServerProvisioningDriver
  implements ISelfHostedServerProvisioningDriver
{
  private readonly fileSystem: ISelfHostedServerProvisioningFileSystem
  private readonly processExecutor: ISelfHostedServerProvisioningProcessExecutor
  private readonly loadCredentialVault: () => Promise<ISelfHostedServerCredentialVault>
  private readonly fetchImplementation: typeof fetch
  private readonly now: () => number
  private readonly randomId: () => string
  private readonly schedule: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>
  private readonly cancelSchedule: (
    timer: ReturnType<typeof setTimeout>
  ) => void
  private readonly managedRoot: string
  private readonly dataRoot: string
  private readonly configurationPath: string
  private readonly composePath: string
  private readonly dockerExecutablePath: string
  private readonly dockerDesktopExecutablePath: string
  private readonly icaclsExecutablePath: string
  private readonly dockerEnvironment: Readonly<Record<string, string>>
  private desktopLaunch: ISelfHostedServerProvisioningLaunch | null = null

  public constructor(
    private readonly dependencies: IWindowsSelfHostedServerProvisioningDriverDependencies
  ) {
    for (const candidate of [
      dependencies.userDataPath,
      dependencies.bundledServicePath,
      dependencies.programFilesPath,
      dependencies.windowsDirectoryPath,
      dependencies.wingetExecutablePath,
    ]) {
      if (!isAbsoluteLocalPath(candidate)) {
        throw new SelfHostedServerProvisioningDriverError('unsafe-path')
      }
    }
    if (!/^S-1-(?:\d+-){1,14}\d+$/.test(dependencies.currentUserSid)) {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }

    this.managedRoot = path.win32.join(
      dependencies.userDataPath,
      ManagedDirectoryName
    )
    this.dataRoot = path.win32.join(this.managedRoot, ServerDataDirectoryName)
    this.configurationPath = path.win32.join(
      this.dataRoot,
      ServerConfigurationFileName
    )
    this.composePath = path.win32.join(
      dependencies.bundledServicePath,
      ServerComposeFileName
    )
    this.dockerExecutablePath = path.win32.join(
      dependencies.programFilesPath,
      'Docker',
      'Docker',
      'resources',
      'bin',
      'docker.exe'
    )
    this.dockerDesktopExecutablePath = path.win32.join(
      dependencies.programFilesPath,
      'Docker',
      'Docker',
      'Docker Desktop.exe'
    )
    this.icaclsExecutablePath = path.win32.join(
      dependencies.windowsDirectoryPath,
      'System32',
      'icacls.exe'
    )
    const taskkillPath = path.win32.join(
      dependencies.windowsDirectoryPath,
      'System32',
      'taskkill.exe'
    )
    this.dockerEnvironment = Object.freeze({
      SystemRoot: dependencies.windowsDirectoryPath,
      WINDIR: dependencies.windowsDirectoryPath,
      DOCKER_HOST: 'npipe:////./pipe/docker_engine',
      DESKTOP_MATERIAL_SERVER_BUNDLE_PATH: dependencies.bundledServicePath,
      DESKTOP_MATERIAL_SERVER_DATA_PATH: this.dataRoot,
    })
    this.fileSystem = dependencies.fileSystem ?? defaultFileSystem()
    this.processExecutor =
      dependencies.processExecutor ?? defaultProcessExecutor(taskkillPath)
    this.loadCredentialVault =
      dependencies.credentialVault === undefined
        ? loadDefaultVault
        : async () =>
            dependencies.credentialVault as ISelfHostedServerCredentialVault
    this.fetchImplementation = dependencies.fetch ?? fetch
    this.now = dependencies.now ?? Date.now
    this.randomId = dependencies.randomId ?? randomUUID
    this.schedule = dependencies.schedule ?? setTimeout
    this.cancelSchedule = dependencies.cancelSchedule ?? clearTimeout
  }

  public readonly probeDocker = async (
    signal: AbortSignal
  ): Promise<IDockerProvisioningProbe> => {
    assertActive(signal)
    const [cliAvailable, desktopInstalled] = await Promise.all([
      this.isTrustedFile(this.dockerExecutablePath),
      this.isTrustedFile(this.dockerDesktopExecutablePath),
    ])
    assertActive(signal)
    if (!cliAvailable) {
      return {
        cliAvailable: false,
        composeAvailable: false,
        daemonAvailable: false,
        desktopInstalled,
      }
    }
    const [composeAvailable, daemonAvailable] = await Promise.all([
      this.probeDockerCommand(
        ['compose', 'version', '--short'],
        signal,
        output => output.trim().length > 0
      ),
      this.probeDockerCommand(
        ['info', '--format', '{{.ServerVersion}}'],
        signal,
        output => output.trim().length > 0 && output.trim().length <= 256
      ),
    ])
    return {
      cliAvailable,
      composeAvailable,
      daemonAvailable,
      desktopInstalled,
    }
  }

  public readonly installDockerDesktop = async (
    signal: AbortSignal
  ): Promise<void> => {
    assertActive(signal)
    if (!(await this.isTrustedFile(this.dependencies.wingetExecutablePath))) {
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
    await this.runRequiredProcess(
      this.dependencies.wingetExecutablePath,
      [
        'install',
        '--exact',
        '--id',
        DockerDesktopPackageId,
        '--source',
        'winget',
        '--accept-source-agreements',
        '--accept-package-agreements',
        '--silent',
        '--disable-interactivity',
      ],
      undefined,
      InstallTimeoutMilliseconds,
      signal,
      { SystemRoot: this.dependencies.windowsDirectoryPath }
    )
  }

  public readonly startDockerDesktop = async (
    signal: AbortSignal
  ): Promise<void> => {
    assertActive(signal)
    if (!(await this.isTrustedFile(this.dockerDesktopExecutablePath))) {
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
    this.desktopLaunch?.release()
    try {
      this.desktopLaunch = await this.processExecutor.launch({
        executable: this.dockerDesktopExecutablePath,
        args: [],
        env: {
          SystemRoot: this.dependencies.windowsDirectoryPath,
          WINDIR: this.dependencies.windowsDirectoryPath,
        },
        shell: false,
        windowsHide: true,
        signal,
      })
    } catch {
      if (signal.aborted) {
        throw abortError()
      }
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
    if (signal.aborted) {
      await this.desktopLaunch.terminate()
      this.desktopLaunch = null
      throw abortError()
    }
  }

  public readonly waitForDockerDaemon = async (
    signal: AbortSignal
  ): Promise<void> => {
    const deadline = this.now() + DockerDaemonWaitMilliseconds
    try {
      while (this.now() < deadline) {
        assertActive(signal)
        if (
          await this.probeDockerCommand(
            ['info', '--format', '{{.ServerVersion}}'],
            signal,
            output => output.trim().length > 0 && output.trim().length <= 256
          )
        ) {
          this.desktopLaunch?.release()
          this.desktopLaunch = null
          return
        }
        await this.delay(DockerDaemonPollMilliseconds, signal)
      }
    } catch (error) {
      if (signal.aborted) {
        await this.desktopLaunch?.terminate()
        this.desktopLaunch = null
      }
      throw error
    }
    await this.desktopLaunch?.terminate()
    this.desktopLaunch = null
    throw new SelfHostedServerProvisioningDriverError('process-timed-out')
  }

  public readonly readExistingBootstrap = async (
    signal: AbortSignal
  ): Promise<IExistingSelfHostedServerBootstrap | null> => {
    assertActive(signal)
    await this.assertManagedTarget(this.configurationPath)
    if (
      (await this.readEntryKind(
        this.configurationPath,
        'configuration-invalid'
      )) === null
    ) {
      return null
    }
    if (
      (await this.readEntryKind(
        this.configurationPath,
        'configuration-invalid'
      )) !== 'file'
    ) {
      throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
    }
    const rawConfiguration = await this.readTextWithRetries(
      this.configurationPath,
      signal
    )
    const configuration = parseBootstrapConfiguration(rawConfiguration)
    assertActive(signal)
    let adminToken: string | null
    try {
      adminToken = await (
        await this.loadCredentialVault()
      ).getPassword(
        CredentialService,
        credentialAccount(configuration.serverId)
      )
    } catch {
      throw new SelfHostedServerProvisioningDriverError(
        'credential-vault-failed'
      )
    }
    assertActive(signal)
    if (adminToken !== null && !/^[A-Za-z0-9_-]{43}$/.test(adminToken)) {
      adminToken = null
    }
    return { ...configuration, adminToken }
  }

  public readonly writeBootstrap = async (
    bootstrap: Omit<ISelfHostedServerBootstrap, 'adminToken'>,
    signal: AbortSignal
  ): Promise<void> => {
    assertActive(signal)
    if (Object.prototype.hasOwnProperty.call(bootstrap, 'adminToken')) {
      throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
    }
    const parsed = parseBootstrapConfiguration(bootstrap.configurationJson)
    if (
      parsed.serverId !== bootstrap.serverId ||
      parsed.publicOrigin !== normalizeOrigin(bootstrap.publicOrigin)
    ) {
      throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
    }
    await this.ensurePrivateDirectory(this.managedRoot, signal)
    await this.ensurePrivateDirectory(this.dataRoot, signal)
    await this.assertManagedTarget(this.configurationPath)
    if (
      (await this.readEntryKind(
        this.configurationPath,
        'configuration-write-failed'
      )) !== null
    ) {
      throw new SelfHostedServerProvisioningDriverError(
        'configuration-write-failed'
      )
    }

    const randomId = this.randomId()
    if (!/^[A-Za-z0-9-]{1,128}$/.test(randomId)) {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    const temporaryPath = path.win32.join(
      this.dataRoot,
      `.${ServerConfigurationFileName}.${randomId}.tmp`
    )
    await this.assertManagedTarget(temporaryPath)
    let activated = false
    try {
      await this.fileSystem.writeNewText(
        temporaryPath,
        bootstrap.configurationJson
      )
      await this.applyPrivateAcl(temporaryPath, false, signal)
      assertActive(signal)
      await this.fileSystem.rename(temporaryPath, this.configurationPath)
      activated = true
      assertActive(signal)
    } catch (error) {
      let removed = true
      await this.fileSystem
        .remove(activated ? this.configurationPath : temporaryPath)
        .catch(() => {
          removed = false
        })
      if (!removed) {
        throw new SelfHostedServerProvisioningDriverError(
          'configuration-write-failed'
        )
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      throw new SelfHostedServerProvisioningDriverError(
        'configuration-write-failed'
      )
    }
  }

  public readonly storeAdminToken = async (
    serverId: string,
    adminToken: string,
    signal: AbortSignal
  ): Promise<void> => {
    assertActive(signal)
    if (!/^[A-Za-z0-9_-]{43}$/.test(adminToken)) {
      throw new SelfHostedServerProvisioningDriverError(
        'credential-vault-failed'
      )
    }
    let vault: ISelfHostedServerCredentialVault
    const account = credentialAccount(serverId)
    try {
      vault = await this.loadCredentialVault()
      await vault.setPassword(CredentialService, account, adminToken)
    } catch {
      throw new SelfHostedServerProvisioningDriverError(
        'credential-vault-failed'
      )
    }
    if (signal.aborted) {
      try {
        if (!(await vault.deletePassword(CredentialService, account))) {
          throw new Error('vault rollback failed')
        }
      } catch {
        throw new SelfHostedServerProvisioningDriverError(
          'credential-vault-failed'
        )
      }
      throw abortError()
    }
  }

  public readonly removeAdminToken = async (
    serverId: string
  ): Promise<void> => {
    try {
      await (
        await this.loadCredentialVault()
      ).deletePassword(CredentialService, credentialAccount(serverId))
    } catch {
      throw new SelfHostedServerProvisioningDriverError(
        'credential-vault-failed'
      )
    }
  }

  public readonly startServer = async (signal: AbortSignal): Promise<void> => {
    assertActive(signal)
    await this.assertManagedTarget(this.managedRoot)
    await this.assertManagedTarget(this.configurationPath)
    await this.assertBundleTarget(this.composePath)
    if (
      !(await this.isTrustedFile(this.dockerExecutablePath)) ||
      (await this.readEntryKind(
        this.configurationPath,
        'compose-contract-invalid'
      )) !== 'file' ||
      (await this.readEntryKind(
        this.composePath,
        'compose-contract-invalid'
      )) !== 'file'
    ) {
      throw new SelfHostedServerProvisioningDriverError(
        'compose-contract-invalid'
      )
    }
    let compose: string
    try {
      compose = await this.fileSystem.readText(this.composePath)
    } catch {
      throw new SelfHostedServerProvisioningDriverError(
        'compose-contract-invalid'
      )
    }
    if (!composePreservesLoopbackPublication(compose)) {
      throw new SelfHostedServerProvisioningDriverError(
        'compose-contract-invalid'
      )
    }
    await this.runRequiredProcess(
      this.dockerExecutablePath,
      [
        'compose',
        '--project-directory',
        this.managedRoot,
        '--file',
        this.composePath,
        '--project-name',
        DockerDesktopProjectName,
        'up',
        '--detach',
        '--build',
        '--remove-orphans',
        '--wait',
        '--wait-timeout',
        '120',
      ],
      this.managedRoot,
      ComposeTimeoutMilliseconds,
      signal,
      this.dockerEnvironment
    )
  }

  public readonly verifyServer = async (
    publicOrigin: string,
    serverId: string,
    signal: AbortSignal
  ): Promise<void> => {
    assertActive(signal)
    const origin = normalizeOrigin(publicOrigin)
    const body = await this.fetchBoundedJson(
      new URL('/healthz', origin).toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
      200,
      'health-response-invalid',
      signal
    )
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (body as Record<string, unknown>).status !== 'ok' ||
      (body as Record<string, unknown>).serverId !== serverId
    ) {
      throw new SelfHostedServerProvisioningDriverError(
        'health-response-invalid'
      )
    }
  }

  public readonly createJoinLink = async (
    publicOrigin: string,
    adminToken: string,
    signal: AbortSignal
  ): Promise<string> => {
    assertActive(signal)
    const origin = normalizeOrigin(publicOrigin)
    if (!/^[A-Za-z0-9_-]{43}$/.test(adminToken)) {
      throw new SelfHostedServerProvisioningDriverError('join-response-invalid')
    }
    const body = await this.fetchBoundedJson(
      new URL('/v1/admin/join-links', origin).toString(),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      201,
      'join-response-invalid',
      signal
    )
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).joinUrl !== 'string'
    ) {
      throw new SelfHostedServerProvisioningDriverError('join-response-invalid')
    }
    const joinUrl = (body as Record<string, unknown>).joinUrl as string
    if (joinUrl.length > MaximumJoinUrlCharacters) {
      throw new SelfHostedServerProvisioningDriverError('join-response-invalid')
    }
    let parsed: URL
    try {
      parsed = new URL(joinUrl)
    } catch {
      throw new SelfHostedServerProvisioningDriverError('join-response-invalid')
    }
    if (
      parsed.origin !== origin ||
      parsed.pathname !== '/join' ||
      parsed.search.length > 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      !/^#token=[A-Za-z0-9_-]{43}$/.test(parsed.hash) ||
      parsed.hash.includes(adminToken)
    ) {
      throw new SelfHostedServerProvisioningDriverError('join-response-invalid')
    }
    return joinUrl
  }

  private async isTrustedFile(filePath: string): Promise<boolean> {
    if (!isAbsoluteLocalPath(filePath)) {
      return false
    }
    try {
      return (
        (await this.fileSystem.entryKind(filePath)) === 'file' &&
        canonicalWindowsPath(await this.fileSystem.realPath(filePath)) ===
          canonicalWindowsPath(filePath)
      )
    } catch {
      return false
    }
  }

  private async readEntryKind(
    filePath: string,
    errorCode:
      | 'unsafe-path'
      | 'configuration-invalid'
      | 'configuration-write-failed'
      | 'compose-contract-invalid'
  ): Promise<FileSystemEntryKind> {
    try {
      return await this.fileSystem.entryKind(filePath)
    } catch {
      throw new SelfHostedServerProvisioningDriverError(errorCode)
    }
  }

  private async assertManagedTarget(target: string): Promise<void> {
    await this.assertContainedTarget(
      this.dependencies.userDataPath,
      this.managedRoot,
      target
    )
  }

  private async assertBundleTarget(target: string): Promise<void> {
    await this.assertContainedTarget(
      this.dependencies.bundledServicePath,
      this.dependencies.bundledServicePath,
      target
    )
  }

  private async assertContainedTarget(
    trustedRoot: string,
    containedRoot: string,
    target: string
  ): Promise<void> {
    if (
      !isAbsoluteLocalPath(target) ||
      !isContainedPath(containedRoot, target)
    ) {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    const relative = path.win32.relative(trustedRoot, target)
    if (relative.startsWith('..') || path.win32.isAbsolute(relative)) {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    let cursor = trustedRoot
    const kindAtRoot = await this.readEntryKind(cursor, 'unsafe-path')
    if (kindAtRoot === 'reparse') {
      throw new SelfHostedServerProvisioningDriverError('unsafe-reparse-point')
    }
    if (kindAtRoot !== null && kindAtRoot !== 'directory') {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    await this.assertRealPathIsExact(cursor, kindAtRoot)
    const segments = relative.split(path.win32.sep).filter(Boolean)
    for (const [index, segment] of segments.entries()) {
      cursor = path.win32.join(cursor, segment)
      const kind = await this.readEntryKind(cursor, 'unsafe-path')
      if (kind === 'reparse') {
        throw new SelfHostedServerProvisioningDriverError(
          'unsafe-reparse-point'
        )
      }
      await this.assertRealPathIsExact(cursor, kind)
      if (
        index < segments.length - 1 &&
        kind !== null &&
        kind !== 'directory'
      ) {
        throw new SelfHostedServerProvisioningDriverError('unsafe-path')
      }
    }
  }

  private async assertRealPathIsExact(
    candidate: string,
    kind: FileSystemEntryKind
  ): Promise<void> {
    if (kind === null) {
      return
    }
    let resolved: string
    try {
      resolved = await this.fileSystem.realPath(candidate)
    } catch {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    if (
      !isAbsoluteLocalPath(resolved) ||
      canonicalWindowsPath(resolved) !== canonicalWindowsPath(candidate)
    ) {
      throw new SelfHostedServerProvisioningDriverError('unsafe-reparse-point')
    }
  }

  private async ensurePrivateDirectory(
    directoryPath: string,
    signal: AbortSignal
  ): Promise<void> {
    await this.assertManagedTarget(directoryPath)
    const existingKind = await this.readEntryKind(directoryPath, 'unsafe-path')
    if (existingKind !== null && existingKind !== 'directory') {
      throw new SelfHostedServerProvisioningDriverError('unsafe-path')
    }
    if (existingKind === null) {
      try {
        await this.fileSystem.makeDirectory(directoryPath)
      } catch {
        throw new SelfHostedServerProvisioningDriverError(
          'configuration-write-failed'
        )
      }
    }
    await this.assertManagedTarget(directoryPath)
    await this.applyPrivateAcl(directoryPath, true, signal)
  }

  private async applyPrivateAcl(
    target: string,
    directory: boolean,
    signal: AbortSignal
  ): Promise<void> {
    if (!(await this.isTrustedFile(this.icaclsExecutablePath))) {
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
    const inheritance = directory ? '(OI)(CI)' : ''
    await this.runRequiredProcess(
      this.icaclsExecutablePath,
      [
        target,
        '/inheritance:r',
        '/grant:r',
        `*${this.dependencies.currentUserSid}:${inheritance}F`,
        `*${LocalSystemSid}:${inheritance}F`,
      ],
      undefined,
      ProbeTimeoutMilliseconds,
      signal,
      { SystemRoot: this.dependencies.windowsDirectoryPath }
    )
  }

  private async probeDockerCommand(
    args: ReadonlyArray<string>,
    signal: AbortSignal,
    validate: (stdout: string) => boolean
  ): Promise<boolean> {
    try {
      const result = await this.processExecutor.run({
        executable: this.dockerExecutablePath,
        args,
        env: this.dockerEnvironment,
        shell: false,
        windowsHide: true,
        timeoutMilliseconds: ProbeTimeoutMilliseconds,
        maximumOutputBytes: MaximumProcessOutputBytes,
        signal,
      })
      assertActive(signal)
      return (
        result.exitCode === 0 &&
        !result.timedOut &&
        !result.outputExceeded &&
        validate(result.stdout)
      )
    } catch (error) {
      if (signal.aborted) {
        throw abortError()
      }
      return false
    }
  }

  private async runRequiredProcess(
    executable: string,
    args: ReadonlyArray<string>,
    cwd: string | undefined,
    timeoutMilliseconds: number,
    signal: AbortSignal,
    env: Readonly<Record<string, string>>
  ): Promise<void> {
    assertActive(signal)
    let result: ISelfHostedServerProvisioningProcessResult
    try {
      result = await this.processExecutor.run({
        executable,
        args,
        cwd,
        env,
        shell: false,
        windowsHide: true,
        timeoutMilliseconds,
        maximumOutputBytes: MaximumProcessOutputBytes,
        signal,
      })
    } catch (error) {
      if (signal.aborted) {
        throw abortError()
      }
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
    assertActive(signal)
    if (result.timedOut) {
      throw new SelfHostedServerProvisioningDriverError('process-timed-out')
    }
    if (result.exitCode !== 0 || result.outputExceeded) {
      throw new SelfHostedServerProvisioningDriverError('process-failed')
    }
  }

  private async readTextWithRetries(
    filePath: string,
    signal: AbortSignal
  ): Promise<string> {
    for (let attempt = 1; attempt <= MaximumReadAttempts; attempt++) {
      assertActive(signal)
      try {
        return await this.fileSystem.readText(filePath)
      } catch (error) {
        if (
          attempt === MaximumReadAttempts ||
          !isErrorCode(error, 'EBUSY', 'EPERM', 'EACCES')
        ) {
          throw new SelfHostedServerProvisioningDriverError(
            'configuration-invalid'
          )
        }
        await this.delay(TransientReadRetryMilliseconds, signal)
      }
    }
    throw new SelfHostedServerProvisioningDriverError('configuration-invalid')
  }

  private async fetchBoundedJson(
    url: string,
    init: RequestInit,
    expectedStatus: number,
    errorCode: 'health-response-invalid' | 'join-response-invalid',
    callerSignal: AbortSignal
  ): Promise<unknown> {
    assertActive(callerSignal)
    const controller = new AbortController()
    const onAbort = () => controller.abort(callerSignal.reason)
    callerSignal.addEventListener('abort', onAbort, { once: true })
    const timer = this.schedule(
      () => controller.abort('request-timeout'),
      HttpTimeoutMilliseconds
    )
    try {
      const response = await this.fetchImplementation(url, {
        ...init,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (
        response.status !== expectedStatus ||
        response.headers.get('content-type')?.split(';', 1)[0].trim() !==
          'application/json'
      ) {
        throw new SelfHostedServerProvisioningDriverError(errorCode)
      }
      try {
        const body = await readBoundedJson(response, MaximumHttpResponseBytes)
        assertActive(callerSignal)
        if (controller.signal.aborted) {
          throw new SelfHostedServerProvisioningDriverError(errorCode)
        }
        return body
      } catch {
        throw new SelfHostedServerProvisioningDriverError(errorCode)
      }
    } catch {
      if (callerSignal.aborted) {
        throw abortError()
      }
      throw new SelfHostedServerProvisioningDriverError(errorCode)
    } finally {
      this.cancelSchedule(timer)
      callerSignal.removeEventListener('abort', onAbort)
    }
  }

  private delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      assertActive(signal)
      const onAbort = () => {
        this.cancelSchedule(timer)
        signal.removeEventListener('abort', onAbort)
        reject(abortError())
      }
      const timer = this.schedule(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, milliseconds)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export const SelfHostedServerProvisioningCredentialService = CredentialService
export const SelfHostedServerProvisioningProjectName = DockerDesktopProjectName
