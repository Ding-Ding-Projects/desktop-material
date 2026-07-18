import { createHash, timingSafeEqual } from 'crypto'
import { promises as Fs } from 'fs'
import * as Path from 'path'
import { IAgentPairedDevice } from '../../lib/agent-commands'

export const AgentDeviceCredentialService =
  'Desktop Material Agent Paired Devices'

export interface IAgentDeviceCredentialStore {
  readonly setItem: (
    service: string,
    account: string,
    value: string
  ) => Promise<unknown>
  readonly getItem: (service: string, account: string) => Promise<string | null>
  readonly deleteItem: (service: string, account: string) => Promise<unknown>
}

interface IAgentDeviceMetadataFile {
  readonly version: 1
  readonly devices: ReadonlyArray<IAgentPairedDevice>
}

const DeviceIDPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MaxPairedDevices = 256

function isPairedDevice(value: unknown): value is IAgentPairedDevice {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<IAgentPairedDevice>
  return (
    typeof candidate.id === 'string' &&
    DeviceIDPattern.test(candidate.id) &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    candidate.name.length <= 80 &&
    candidate.name === candidate.name.trim() &&
    !/[\u0000-\u001f\u007f]/.test(candidate.name) &&
    typeof candidate.createdAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  )
}

function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedDigest = createHash('sha256').update(supplied).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(suppliedDigest, expectedDigest)
}

/**
 * Persists only display metadata on disk. Every bearer token remains in the OS
 * credential vault and is fetched by its opaque device id when authenticating.
 */
export class PairedDeviceStore {
  private readonly devices = new Map<string, IAgentPairedDevice>()
  private loaded: Promise<void> | null = null
  private mutations: Promise<void> = Promise.resolve()

  public constructor(
    private readonly metadataPath: string,
    private readonly credentials: IAgentDeviceCredentialStore
  ) {}

  public load(): Promise<void> {
    this.loaded ??= this.loadMetadata()
    return this.loaded
  }

  public list(): ReadonlyArray<IAgentPairedDevice> {
    return [...this.devices.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    )
  }

  public async authenticate(token: string): Promise<IAgentPairedDevice | null> {
    await this.load()
    const separator = token.indexOf('.')
    if (separator <= 0) {
      return null
    }
    const id = token.slice(0, separator)
    const device = this.devices.get(id)
    if (device === undefined) {
      return null
    }
    const expected = await this.credentials.getItem(
      AgentDeviceCredentialService,
      id
    )
    return expected !== null &&
      this.devices.get(id) === device &&
      secretsMatch(token, expected)
      ? device
      : null
  }

  public add(
    device: IAgentPairedDevice,
    token: string
  ): Promise<IAgentPairedDevice> {
    return this.queueMutation(async () => {
      await this.load()
      if (
        !isPairedDevice(device) ||
        this.devices.has(device.id) ||
        this.devices.size >= MaxPairedDevices
      ) {
        throw new Error('Invalid or duplicate paired device metadata')
      }
      await this.credentials.setItem(
        AgentDeviceCredentialService,
        device.id,
        token
      )
      this.devices.set(device.id, device)
      try {
        await this.persistMetadata()
      } catch (error) {
        this.devices.delete(device.id)
        await this.credentials
          .deleteItem(AgentDeviceCredentialService, device.id)
          .catch(() => undefined)
        throw error
      }
      return device
    })
  }

  public revoke(id: string): Promise<boolean> {
    return this.queueMutation(async () => {
      await this.load()
      if (!DeviceIDPattern.test(id) || !this.devices.delete(id)) {
        return false
      }

      // Removing the in-memory authorization record happens before any await,
      // so a revoked credential cannot authorize another request in this run.
      let persistenceError: unknown = null
      try {
        await this.persistMetadata()
      } catch (error) {
        persistenceError = error
      }
      await this.credentials.deleteItem(AgentDeviceCredentialService, id)
      if (persistenceError !== null) {
        throw persistenceError
      }
      return true
    })
  }

  private queueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation)
    this.mutations = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async loadMetadata(): Promise<void> {
    let value: unknown
    try {
      value = JSON.parse(await Fs.readFile(this.metadataPath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw new Error('Unable to read paired device metadata')
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Paired device metadata is invalid')
    }
    const file = value as Partial<IAgentDeviceMetadataFile>
    if (
      file.version !== 1 ||
      !Array.isArray(file.devices) ||
      file.devices.length > MaxPairedDevices ||
      !file.devices.every(isPairedDevice)
    ) {
      throw new Error('Paired device metadata is invalid')
    }
    this.devices.clear()
    const ids = new Set<string>()
    for (const device of file.devices) {
      if (ids.has(device.id)) {
        throw new Error('Paired device metadata is invalid')
      }
      ids.add(device.id)
      this.devices.set(device.id, device)
    }
  }

  private async persistMetadata(): Promise<void> {
    await Fs.mkdir(Path.dirname(this.metadataPath), { recursive: true })
    const temporaryPath = `${this.metadataPath}.${process.pid}.tmp`
    const value: IAgentDeviceMetadataFile = {
      version: 1,
      devices: this.list(),
    }
    await Fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await Fs.chmod(temporaryPath, 0o600)
    await Fs.rename(temporaryPath, this.metadataPath)
  }
}
