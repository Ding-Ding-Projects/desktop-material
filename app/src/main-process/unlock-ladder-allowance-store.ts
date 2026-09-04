import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'

import { renameWithRetry } from '../lib/rename-with-retry'
import {
  canUseUnlockLadder,
  pruneUnlockLadderSkipTimestamps,
} from '../models/unlock-ladder'

export const UnlockLadderAllowanceSchemaVersion = 1
export const UnlockLadderAllowanceMaximumFileBytes = 4096
export const UnlockLadderAllowanceMaximumRecords = 64

interface IUnlockLadderAllowanceFile {
  readonly schemaVersion: typeof UnlockLadderAllowanceSchemaVersion
  readonly skipTimestamps: ReadonlyArray<number>
}

export interface IUnlockLadderAllowanceStore {
  read(now: number): Promise<ReadonlyArray<number>>
  tryRecordSkip(now: number): Promise<ReadonlyArray<number> | null>
}

/** Process-local fallback used only when no durable path is supplied. */
export class MemoryUnlockLadderAllowanceStore
  implements IUnlockLadderAllowanceStore
{
  private timestamps: ReadonlyArray<number> = []

  public async read(now: number): Promise<ReadonlyArray<number>> {
    this.timestamps = normalizeTimestamps(this.timestamps, now)
    return this.timestamps
  }

  public async tryRecordSkip(
    now: number
  ): Promise<ReadonlyArray<number> | null> {
    const current = await this.read(now)
    if (!canUseUnlockLadder(current, now)) {
      return null
    }
    this.timestamps = [...current, now]
    return this.timestamps
  }
}

/**
 * Durable rolling-hour allowance stored below the application's user-data
 * directory. It contains timestamps only, never credential or authentication
 * material. Mutations are serialized so two simultaneous lockouts cannot both
 * spend the final allowance slot.
 */
export class FileUnlockLadderAllowanceStore
  implements IUnlockLadderAllowanceStore
{
  private mutations: Promise<void> = Promise.resolve()

  public constructor(private readonly path: string) {}

  public read(now: number): Promise<ReadonlyArray<number>> {
    return this.mutations.then(() => this.readCurrent(now))
  }

  public tryRecordSkip(now: number): Promise<ReadonlyArray<number> | null> {
    const result = this.mutations.then(async () => {
      const current = await this.readCurrent(now)
      if (!canUseUnlockLadder(current, now)) {
        return null
      }
      const next = [...current, now]
      await this.persist(next)
      return next
    })
    this.mutations = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async readCurrent(now: number): Promise<ReadonlyArray<number>> {
    let bytes: string
    try {
      const file = await stat(this.path)
      if (!file.isFile() || file.size > UnlockLadderAllowanceMaximumFileBytes) {
        throw new Error('Unlock ladder allowance data is invalid.')
      }
      bytes = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }

    let value: unknown
    try {
      value = JSON.parse(bytes)
    } catch {
      throw new Error('Unlock ladder allowance data is invalid.')
    }
    if (!isAllowanceFile(value)) {
      throw new Error('Unlock ladder allowance data is invalid.')
    }
    return normalizeTimestamps(value.skipTimestamps, now)
  }

  private async persist(timestamps: ReadonlyArray<number>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    const value: IUnlockLadderAllowanceFile = {
      schemaVersion: UnlockLadderAllowanceSchemaVersion,
      skipTimestamps: timestamps,
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

function isAllowanceFile(value: unknown): value is IUnlockLadderAllowanceFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<IUnlockLadderAllowanceFile>
  return (
    candidate.schemaVersion === UnlockLadderAllowanceSchemaVersion &&
    Array.isArray(candidate.skipTimestamps) &&
    candidate.skipTimestamps.length <= UnlockLadderAllowanceMaximumRecords &&
    candidate.skipTimestamps.every(
      timestamp =>
        typeof timestamp === 'number' &&
        Number.isSafeInteger(timestamp) &&
        timestamp >= 0
    )
  )
}

function normalizeTimestamps(
  timestamps: ReadonlyArray<number>,
  now: number
): ReadonlyArray<number> {
  const boundedNow = Number.isSafeInteger(now) && now >= 0 ? now : Date.now()
  return pruneUnlockLadderSkipTimestamps(
    timestamps.map(timestamp => Math.min(timestamp, boundedNow)),
    boundedNow
  )
}
