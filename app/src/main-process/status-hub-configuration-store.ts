import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'

import { renameWithRetry } from '../lib/rename-with-retry'
import { TokenStore } from '../lib/stores/token-store'
import {
  IStatusHubOwnerConfiguration,
  IStatusHubOwnerConfigurationUpdate,
} from '../models/status-hub'
import { normalizeStatusHubEndpoint } from './status-hub-client'

export const StatusHubConfigurationSchemaVersion = 1
export const StatusHubConfigurationMaximumFileBytes = 4096
export const StatusHubAuthorizationMaximumLength = 8192
export const StatusHubCredentialService = 'desktop-material-status-hub'
export const StatusHubCredentialAccount = 'owner-read-plus-reply'

interface IStatusHubConfigurationFile {
  readonly schemaVersion: typeof StatusHubConfigurationSchemaVersion
  readonly endpoint: string | null
}

interface IStatusHubCredentialVault {
  setItem(service: string, account: string, value: string): Promise<unknown>
  getItem(service: string, account: string): Promise<string | null>
  deleteItem(service: string, account: string): Promise<unknown>
}

/**
 * Owner configuration for the main-process Status Hub boundary. The endpoint
 * is stored in the application data directory. Authorization stays in the
 * operating-system credential vault and is never returned by this class.
 */
export class StatusHubConfigurationStore {
  private mutations: Promise<void> = Promise.resolve()

  public constructor(
    private readonly path: string,
    private readonly vault: IStatusHubCredentialVault = TokenStore
  ) {}

  public async get(): Promise<IStatusHubOwnerConfiguration> {
    await this.mutations
    const [endpoint, authorization] = await Promise.all([
      this.readEndpoint(),
      this.getAuthorization(),
    ])
    return {
      endpoint,
      authorizationPresent: authorization !== null,
    }
  }

  public set(
    update: IStatusHubOwnerConfigurationUpdate
  ): Promise<IStatusHubOwnerConfiguration> {
    return this.queueMutation(async () => {
      const endpoint = validatedEndpoint(update.endpoint)
      const previousAuthorization =
        update.authorization === undefined
          ? null
          : await this.getAuthorization()
      if (update.authorization !== undefined) {
        const authorization = normalizeAuthorization(update.authorization)
        await this.vault.setItem(
          StatusHubCredentialService,
          StatusHubCredentialAccount,
          authorization
        )
      }
      try {
        await this.persistEndpoint(endpoint)
      } catch (error) {
        if (update.authorization !== undefined) {
          if (previousAuthorization === null) {
            await this.vault.deleteItem(
              StatusHubCredentialService,
              StatusHubCredentialAccount
            )
          } else {
            await this.vault.setItem(
              StatusHubCredentialService,
              StatusHubCredentialAccount,
              previousAuthorization
            )
          }
        }
        throw error
      }
      return this.getUnqueued(endpoint)
    })
  }

  public clearAuthorization(): Promise<IStatusHubOwnerConfiguration> {
    return this.queueMutation(async () => {
      await this.vault.deleteItem(
        StatusHubCredentialService,
        StatusHubCredentialAccount
      )
      return this.getUnqueued(await this.readEndpoint())
    })
  }

  /** Main-process-only provider consumed by StatusHubClient. */
  public async getAuthorization(): Promise<string | null> {
    const value = await this.vault.getItem(
      StatusHubCredentialService,
      StatusHubCredentialAccount
    )
    return value === null || value.length === 0 ? null : value
  }

  public readEndpoint(): Promise<string | null> {
    return this.readFile().then(file => file.endpoint)
  }

  private queueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation)
    this.mutations = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async getUnqueued(
    endpoint: string | null
  ): Promise<IStatusHubOwnerConfiguration> {
    return {
      endpoint,
      authorizationPresent: (await this.getAuthorization()) !== null,
    }
  }

  private async readFile(): Promise<IStatusHubConfigurationFile> {
    try {
      const file = await stat(this.path)
      if (
        !file.isFile() ||
        file.size > StatusHubConfigurationMaximumFileBytes
      ) {
        throw new Error('Status Hub configuration is invalid.')
      }
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!isConfigurationFile(value)) {
        throw new Error('Status Hub configuration is invalid.')
      }
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          schemaVersion: StatusHubConfigurationSchemaVersion,
          endpoint: null,
        }
      }
      if (error instanceof SyntaxError) {
        throw new Error('Status Hub configuration is invalid.')
      }
      throw error
    }
  }

  private async persistEndpoint(endpoint: string | null): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    const value: IStatusHubConfigurationFile = {
      schemaVersion: StatusHubConfigurationSchemaVersion,
      endpoint,
    }
    try {
      await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      await renameWithRetry(temporaryPath, this.path)
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }
}

function validatedEndpoint(value: string | null): string | null {
  if (value === null || value.trim().length === 0) {
    return null
  }
  const endpoint = normalizeStatusHubEndpoint(value.trim())
  if (endpoint === null) {
    throw new Error(
      'Status Hub endpoint must use HTTPS or an explicit 127.0.0.1 loopback URL.'
    )
  }
  return endpoint.toString()
}

function normalizeAuthorization(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > StatusHubAuthorizationMaximumLength ||
    /[\r\n\0]/.test(trimmed)
  ) {
    throw new Error('Status Hub authorization is invalid.')
  }
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`
}

function isConfigurationFile(
  value: unknown
): value is IStatusHubConfigurationFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<IStatusHubConfigurationFile>
  return (
    candidate.schemaVersion === StatusHubConfigurationSchemaVersion &&
    (candidate.endpoint === null ||
      (typeof candidate.endpoint === 'string' &&
        normalizeStatusHubEndpoint(candidate.endpoint) !== null))
  )
}
