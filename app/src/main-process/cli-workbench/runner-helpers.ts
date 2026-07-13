import { realpath, stat } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { StringDecoder } from 'string_decoder'
import {
  CLIWorkbenchOperation,
  CLIWorkbenchTool,
} from '../../lib/cli-workbench'
import { resolveCLIWorkbenchOperation } from './operation-registry'

export const CLICommandOutputCap = 4 * 1024 * 1024
export const CLICommandConcurrencyCap = 4

const RunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface IResolvedCLICommandRequest {
  readonly id: string
  readonly operation: CLIWorkbenchOperation
  readonly repositoryPath: string
  readonly tool: CLIWorkbenchTool
  readonly args: ReadonlyArray<string>
  readonly confirmed: boolean
}

/**
 * Validate the untrusted IPC payload, bind it to a Git repository, and resolve
 * its named operation to main-owned argv before child_process.spawn.
 */
export async function validateCLICommandRequest(
  value: unknown
): Promise<IResolvedCLICommandRequest> {
  if (!isRecord(value)) {
    throw new Error('Invalid CLI command request.')
  }

  const allowedFields = new Set([
    'id',
    'operation',
    'repositoryPath',
    'confirmed',
  ])
  if (Object.keys(value).some(field => !allowedFields.has(field))) {
    throw new Error('CLI command request fields are invalid.')
  }

  const { id, operation, repositoryPath, confirmed } = value
  if (typeof id !== 'string' || !RunIdPattern.test(id)) {
    throw new Error('CLI command id is invalid.')
  }
  if (
    typeof repositoryPath !== 'string' ||
    !isAbsolute(repositoryPath) ||
    repositoryPath.includes('\0')
  ) {
    throw new Error('CLI command repository path is invalid.')
  }
  const selectedPath = resolve(repositoryPath)
  const normalizedRepositoryPath = await realpath(selectedPath).catch(
    () => null
  )
  if (normalizedRepositoryPath === null) {
    throw new Error('CLI command repository path does not exist.')
  }
  const repositoryStat = await stat(normalizedRepositoryPath).catch(() => null)
  if (repositoryStat === null || !repositoryStat.isDirectory()) {
    throw new Error('CLI command repository path does not exist.')
  }
  const gitDirectory = await stat(join(normalizedRepositoryPath, '.git')).catch(
    () => null
  )
  if (
    gitDirectory === null ||
    (!gitDirectory.isDirectory() && !gitDirectory.isFile())
  ) {
    throw new Error('CLI command path is not a Git repository.')
  }

  if (confirmed !== undefined && typeof confirmed !== 'boolean') {
    throw new Error('CLI command confirmation is invalid.')
  }
  const resolvedOperation = await resolveCLIWorkbenchOperation(
    operation,
    normalizedRepositoryPath
  )
  if (resolvedOperation.requiresConfirmation && confirmed !== true) {
    throw new Error('This CLI operation requires confirmation.')
  }

  return {
    id,
    operation: resolvedOperation.operation,
    repositoryPath: normalizedRepositoryPath,
    tool: resolvedOperation.tool,
    args: resolvedOperation.args,
    confirmed: confirmed === true,
  }
}

export interface ILimitedCLIOutput {
  readonly data: string
  readonly didTruncate: boolean
}

/**
 * Byte-bound UTF-8 decoder for streamed stdout/stderr. It retains only the few
 * bytes StringDecoder needs to complete a code point, never command history.
 */
export class CLICommandOutputLimiter {
  private remaining: number
  private announcedTruncation = false
  private readonly decoders = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8'),
  }

  public constructor(cap: number = CLICommandOutputCap) {
    if (!Number.isInteger(cap) || cap < 0) {
      throw new Error('CLI command output cap is invalid.')
    }
    this.remaining = cap
  }

  public write(stream: 'stdout' | 'stderr', chunk: Buffer): ILimitedCLIOutput {
    const accepted = chunk.subarray(0, this.remaining)
    this.remaining -= accepted.length
    const wasTruncated = accepted.length < chunk.length
    const didTruncate = wasTruncated && !this.announcedTruncation
    this.announcedTruncation ||= wasTruncated
    return {
      data: this.decoders[stream].write(accepted),
      didTruncate,
    }
  }

  public end(stream: 'stdout' | 'stderr'): string {
    return this.announcedTruncation ? '' : this.decoders[stream].end()
  }
}
