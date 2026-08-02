import { createHash, randomBytes, randomUUID } from 'crypto'

export type SelfHostedServerProvisioningPhase =
  | 'detecting-docker'
  | 'installing-docker'
  | 'starting-docker'
  | 'waiting-for-docker'
  | 'preparing-server'
  | 'starting-server'
  | 'verifying-server'
  | 'creating-join-link'
  | 'complete'

export type SelfHostedServerProvisioningErrorCode =
  | 'docker-probe-failed'
  | 'docker-install-required'
  | 'docker-install-failed'
  | 'docker-start-failed'
  | 'docker-daemon-unavailable'
  | 'docker-compose-unavailable'
  | 'server-bootstrap-failed'
  | 'server-origin-conflict'
  | 'admin-credential-missing'
  | 'server-start-failed'
  | 'server-health-failed'
  | 'join-link-failed'
  | 'cancelled'

export interface ISelfHostedServerProvisioningProgress {
  readonly phase: SelfHostedServerProvisioningPhase
  readonly detail: string
}

export interface IDockerProvisioningProbe {
  readonly cliAvailable: boolean
  readonly composeAvailable: boolean
  readonly daemonAvailable: boolean
  readonly desktopInstalled: boolean
}

export interface ISelfHostedServerBootstrap {
  readonly serverId: string
  readonly publicOrigin: string
  readonly configurationJson: string
  /** Transient only; the driver stores this in the OS credential vault. */
  readonly adminToken: string
}

export interface IExistingSelfHostedServerBootstrap {
  readonly serverId: string
  readonly publicOrigin: string
  readonly adminToken: string | null
}

export interface ISelfHostedServerProvisioningRequest {
  readonly publicOrigin: string
  readonly installDockerIfMissing: boolean
}

export interface ISelfHostedServerProvisioningResult {
  readonly serverId: string
  readonly publicOrigin: string
  readonly joinUrl: string
}

export interface ISelfHostedServerProvisioningDriver {
  readonly probeDocker: (
    signal: AbortSignal
  ) => Promise<IDockerProvisioningProbe>
  readonly installDockerDesktop: (signal: AbortSignal) => Promise<void>
  readonly startDockerDesktop: (signal: AbortSignal) => Promise<void>
  readonly waitForDockerDaemon: (signal: AbortSignal) => Promise<void>
  /**
   * The driver owns and validates the managed server directory. Renderer input
   * must never select a privileged Compose project or bootstrap path.
   */
  readonly readExistingBootstrap: (
    signal: AbortSignal
  ) => Promise<IExistingSelfHostedServerBootstrap | null>
  readonly writeBootstrap: (
    bootstrap: Omit<ISelfHostedServerBootstrap, 'adminToken'>,
    signal: AbortSignal
  ) => Promise<void>
  readonly storeAdminToken: (
    serverId: string,
    adminToken: string,
    signal: AbortSignal
  ) => Promise<void>
  /** Best-effort rollback for a credential stored before configuration write. */
  readonly removeAdminToken: (serverId: string) => Promise<void>
  readonly startServer: (signal: AbortSignal) => Promise<void>
  readonly verifyServer: (
    publicOrigin: string,
    serverId: string,
    signal: AbortSignal
  ) => Promise<void>
  readonly createJoinLink: (
    publicOrigin: string,
    adminToken: string,
    signal: AbortSignal
  ) => Promise<string>
}

export class SelfHostedServerProvisioningError extends Error {
  public constructor(
    public readonly code: SelfHostedServerProvisioningErrorCode,
    public readonly recovery: string,
    options?: ErrorOptions
  ) {
    super(code, options)
  }
}

function normalizePublicOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid self-hosted server origin')
  }
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0 ||
    url.search.length > 0 ||
    url.pathname !== '/'
  ) {
    throw new Error('The self-hosted server origin must not contain extras')
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('The self-hosted server origin must use HTTPS')
  }
  return url.origin
}

function token(): string {
  return randomBytes(32).toString('base64url')
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('base64url')
}

/**
 * Generate bootstrap material without ever putting a plaintext token in the
 * on-disk server configuration. The caller must vault `adminToken` and then
 * discard it from ordinary state/logging.
 */
export function createSelfHostedServerBootstrap(
  publicOriginValue: string,
  now: number = Date.now()
): ISelfHostedServerBootstrap {
  const publicOrigin = normalizePublicOrigin(publicOriginValue)
  const serverId = randomUUID()
  const adminToken = token()
  const initialJoinToken = token()
  const configurationJson = `${JSON.stringify(
    {
      version: 1,
      serverId,
      publicOrigin,
      adminTokenHash: hashSecret(adminToken),
      initialJoinTokenHash: hashSecret(initialJoinToken),
      initialJoinExpiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      allowInsecureHttp: publicOrigin.startsWith('http://'),
      // The container listens on 0.0.0.0 and is reached only through Docker's
      // loopback publication or the HTTPS boundary provisioned by the wizard.
      transport: 'reverse-proxy',
    },
    null,
    2
  )}\n`

  return { serverId, publicOrigin, configurationJson, adminToken }
}

function cancelled(signal: AbortSignal): never {
  throw new SelfHostedServerProvisioningError(
    'cancelled',
    'Run the wizard again when you are ready.',
    { cause: signal.reason }
  )
}

function assertActive(signal: AbortSignal) {
  if (signal.aborted) {
    cancelled(signal)
  }
}

function provisioningError(
  code: SelfHostedServerProvisioningErrorCode,
  recovery: string,
  error: unknown
): SelfHostedServerProvisioningError {
  if (error instanceof SelfHostedServerProvisioningError) {
    return error
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new SelfHostedServerProvisioningError(
      'cancelled',
      'Run the wizard again when you are ready.',
      { cause: error }
    )
  }
  return new SelfHostedServerProvisioningError(code, recovery, {
    cause: error,
  })
}

export class SelfHostedServerProvisioner {
  public constructor(
    private readonly driver: ISelfHostedServerProvisioningDriver
  ) {}

  public async provision(
    request: ISelfHostedServerProvisioningRequest,
    signal: AbortSignal,
    onProgress: (progress: ISelfHostedServerProvisioningProgress) => void
  ): Promise<ISelfHostedServerProvisioningResult> {
    const publicOrigin = normalizePublicOrigin(request.publicOrigin)
    const progress = (
      phase: SelfHostedServerProvisioningPhase,
      detail: string
    ) => {
      assertActive(signal)
      onProgress({ phase, detail })
    }

    progress('detecting-docker', 'Checking Docker Desktop and Compose…')
    let probe: IDockerProvisioningProbe
    try {
      probe = await this.driver.probeDocker(signal)
      assertActive(signal)
    } catch (error) {
      throw provisioningError(
        'docker-probe-failed',
        'Check Docker Desktop diagnostics, then retry detection.',
        error
      )
    }
    const needsInstall =
      !probe.cliAvailable || !probe.desktopInstalled || !probe.composeAvailable

    if (needsInstall) {
      if (!request.installDockerIfMissing) {
        throw new SelfHostedServerProvisioningError(
          'docker-install-required',
          'Allow the wizard to install Docker Desktop, then try again.'
        )
      }
      progress('installing-docker', 'Installing Docker Desktop safely…')
      try {
        await this.driver.installDockerDesktop(signal)
      } catch (error) {
        throw provisioningError(
          'docker-install-failed',
          'Review the installer result, then run this step again.',
          error
        )
      }
      assertActive(signal)
      try {
        probe = await this.driver.probeDocker(signal)
        assertActive(signal)
      } catch (error) {
        throw provisioningError(
          'docker-probe-failed',
          'Check Docker Desktop diagnostics, then retry detection.',
          error
        )
      }
    }

    if (!probe.cliAvailable || !probe.composeAvailable) {
      throw new SelfHostedServerProvisioningError(
        'docker-compose-unavailable',
        'Finish Docker Desktop setup, then run the wizard again.'
      )
    }

    if (!probe.daemonAvailable) {
      progress('starting-docker', 'Starting Docker Desktop…')
      try {
        await this.driver.startDockerDesktop(signal)
      } catch (error) {
        throw provisioningError(
          'docker-start-failed',
          'Start Docker Desktop once, then retry this step.',
          error
        )
      }
      progress('waiting-for-docker', 'Waiting for the Docker engine…')
      try {
        await this.driver.waitForDockerDaemon(signal)
      } catch (error) {
        throw provisioningError(
          'docker-daemon-unavailable',
          'Open Docker Desktop diagnostics, resolve the engine error, and retry.',
          error
        )
      }
      assertActive(signal)
      try {
        probe = await this.driver.probeDocker(signal)
        assertActive(signal)
      } catch (error) {
        throw provisioningError(
          'docker-probe-failed',
          'Check Docker Desktop diagnostics, then retry detection.',
          error
        )
      }
      if (!probe.daemonAvailable) {
        throw new SelfHostedServerProvisioningError(
          'docker-daemon-unavailable',
          'Open Docker Desktop diagnostics, resolve the engine error, and retry.'
        )
      }
    }

    progress('preparing-server', 'Preparing private server configuration…')
    let existing: IExistingSelfHostedServerBootstrap | null
    try {
      existing = await this.driver.readExistingBootstrap(signal)
      assertActive(signal)
    } catch (error) {
      throw provisioningError(
        'server-bootstrap-failed',
        'Retry the private server preparation step.',
        error
      )
    }
    if (existing !== null && existing.publicOrigin !== publicOrigin) {
      throw new SelfHostedServerProvisioningError(
        'server-origin-conflict',
        `This managed server already uses ${existing.publicOrigin}. Remove it through the wizard before choosing another origin.`
      )
    }

    if (existing === null) {
      const bootstrap = createSelfHostedServerBootstrap(publicOrigin)
      let storedAdminToken = false
      try {
        await this.driver.storeAdminToken(
          bootstrap.serverId,
          bootstrap.adminToken,
          signal
        )
        storedAdminToken = true
        assertActive(signal)
        const persistedBootstrap: Omit<
          ISelfHostedServerBootstrap,
          'adminToken'
        > = {
          serverId: bootstrap.serverId,
          publicOrigin: bootstrap.publicOrigin,
          configurationJson: bootstrap.configurationJson,
        }
        await this.driver.writeBootstrap(persistedBootstrap, signal)
        assertActive(signal)
      } catch (error) {
        if (storedAdminToken) {
          try {
            await this.driver.removeAdminToken(bootstrap.serverId)
          } catch {
            // The recovery remains explicit and the config was never made
            // authoritative. A main-process driver can surface vault repair.
          }
        }
        throw provisioningError(
          'server-bootstrap-failed',
          'Retry server preparation; no server configuration was activated.',
          error
        )
      }
      existing = {
        serverId: bootstrap.serverId,
        publicOrigin: bootstrap.publicOrigin,
        adminToken: bootstrap.adminToken,
      }
    }

    if (existing.adminToken === null) {
      throw new SelfHostedServerProvisioningError(
        'admin-credential-missing',
        'Repair or remove this managed server through the wizard; its vault credential is missing.'
      )
    }

    progress('starting-server', 'Starting the self-hosted server…')
    try {
      await this.driver.startServer(signal)
      assertActive(signal)
    } catch (error) {
      throw provisioningError(
        'server-start-failed',
        'Review the container status shown by the wizard, then retry.',
        error
      )
    }

    progress('verifying-server', 'Verifying the exact server identity…')
    try {
      await this.driver.verifyServer(
        existing.publicOrigin,
        existing.serverId,
        signal
      )
      assertActive(signal)
    } catch (error) {
      throw provisioningError(
        'server-health-failed',
        'Check the HTTPS address and container health, then retry verification.',
        error
      )
    }

    progress('creating-join-link', 'Creating a one-time join link…')
    let joinUrl: string
    try {
      joinUrl = await this.driver.createJoinLink(
        existing.publicOrigin,
        existing.adminToken,
        signal
      )
      assertActive(signal)
      const parsedJoinUrl = new URL(joinUrl)
      const tokenMatch = /^#token=([A-Za-z0-9_-]{43})$/.exec(parsedJoinUrl.hash)
      if (
        parsedJoinUrl.username.length > 0 ||
        parsedJoinUrl.password.length > 0 ||
        parsedJoinUrl.origin !== existing.publicOrigin ||
        parsedJoinUrl.pathname !== '/join' ||
        parsedJoinUrl.search.length > 0 ||
        tokenMatch === null ||
        tokenMatch[1] === existing.adminToken
      ) {
        throw new Error('Invalid join link')
      }
    } catch (error) {
      throw provisioningError(
        'join-link-failed',
        'The server is healthy. Retry only the join-link step.',
        error
      )
    }

    progress('complete', 'The self-hosted server is ready.')
    return {
      serverId: existing.serverId,
      publicOrigin: existing.publicOrigin,
      joinUrl,
    }
  }
}
