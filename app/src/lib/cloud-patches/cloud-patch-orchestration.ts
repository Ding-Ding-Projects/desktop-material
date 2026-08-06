import { createHash } from 'crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import * as Path from 'path'
import { tmpdir } from 'os'

import { Repository } from '../../models/repository'
import {
  createCloudPatchArtifact,
  ICloudPatchArtifact,
  ICloudPatchFileEntry,
  MaximumCloudPatchArtifactLifetimeMs,
  parseCloudPatchArtifact,
  verifyCloudPatchArtifact,
} from './patch-artifact'
import {
  fetchCloudPatch,
  ICloudPatchFetchResult,
  ICloudPatchServerConfig,
  ICloudPatchUploadResult,
  parseCloudPatchShareLink,
  uploadCloudPatch,
} from './cloud-patch-server-client'
import type { ITeamConnection } from '../self-hosted-server/team-connection'

const DefaultCloudPatchLifetimeMs = 24 * 60 * 60 * 1000

async function defaultGetConnection(): Promise<ITeamConnection | null> {
  // Keep the optional server path lazy so single-player operation does not
  // load the OS credential provider merely by loading the app store module.
  const { getTeamConnection } = await import(
    '../self-hosted-server/team-connection'
  )
  return getTeamConnection()
}

export type CloudPatchOrchestrationErrorCode =
  | 'invalid-repository'
  | 'invalid-recipient'
  | 'invalid-share-link'
  | 'invalid-server-response'
  | 'artifact-verification-failed'
  | 'unsupported-artifact'
  | 'stale-base'
  | 'git-am-failed'

export class CloudPatchOrchestrationError extends Error {
  public readonly name = 'CloudPatchOrchestrationError'

  public constructor(
    public readonly code: CloudPatchOrchestrationErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
  }
}

export type CloudPatchShareResult =
  | { readonly kind: 'unavailable'; readonly reason: 'no-server-configured' }
  | (ICloudPatchUploadResult & {
      readonly kind: 'shared'
      readonly artifactSha256: string
      readonly deviceId: string
    })

export type CloudPatchApplyResult =
  | { readonly kind: 'unavailable'; readonly reason: 'no-server-configured' }
  | {
      readonly kind: 'applied'
      readonly shareId: string
      readonly headSha: string
    }

export interface ICloudPatchOrchestrationDependencies {
  readonly getConnection?: () => Promise<ITeamConnection | null>
  readonly getRepositoryId?: (repository: Repository) => Promise<string>
  readonly resolveCommit?: (
    repository: Repository,
    revision: string
  ) => Promise<string>
  readonly getChangedFiles?: (
    repository: Repository,
    baseSha: string,
    headSha: string
  ) => Promise<ReadonlyArray<ICloudPatchFileEntry>>
  readonly formatPatch?: (
    repository: Repository,
    baseSha: string,
    headSha: string
  ) => Promise<string>
  readonly upload?: (
    config: ICloudPatchServerConfig,
    request: Parameters<typeof uploadCloudPatch>[1]
  ) => Promise<ICloudPatchUploadResult>
  readonly fetch?: (
    config: ICloudPatchServerConfig,
    shareId: string,
    shareSecret: string
  ) => Promise<ICloudPatchFetchResult>
  readonly applyFormatPatch?: (
    repository: Repository,
    patch: string
  ) => Promise<void>
  readonly now?: () => number
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function canonicalRepositorySource(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '')
    return url.toString()
  } catch {
    return value.trim().replace(/\.git$/i, '')
  }
}

async function defaultRepositoryId(repository: Repository): Promise<string> {
  const configuredCloneUrl = repository.gitHubRepository?.cloneURL
  const remoteUrl = configuredCloneUrl ?? (await defaultRemoteUrl(repository))
  if (remoteUrl === null || remoteUrl.trim().length === 0) {
    throw new CloudPatchOrchestrationError(
      'invalid-repository',
      'Cloud Patch sharing needs a repository remote to identify this repository safely.'
    )
  }
  return sha256(canonicalRepositorySource(remoteUrl))
}

async function defaultRemoteUrl(
  repository: Repository
): Promise<string | null> {
  const { getRemoteURL } = await import('../git')
  return getRemoteURL(repository, 'origin')
}

async function defaultResolveCommit(
  repository: Repository,
  revision: string
): Promise<string> {
  const { git } = await import('../git')
  const result = await git(
    ['rev-parse', '--verify', `${revision}^{commit}`],
    repository.path,
    'resolveCloudPatchCommit'
  )
  const sha = result.stdout.trim()
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) {
    throw new CloudPatchOrchestrationError(
      'invalid-repository',
      `Git did not return a commit for '${revision}'.`
    )
  }
  return sha
}

function parseNameStatus(output: string): ReadonlyArray<{
  readonly status: string
  readonly path: string
}> {
  const parts = output.split('\0')
  const entries: Array<{ readonly status: string; readonly path: string }> = []
  for (let index = 0; index < parts.length - 1; index += 2) {
    const status = parts[index]
    const path = parts[index + 1]
    if (status.length === 0 && path.length === 0) {
      continue
    }
    if (status.length === 0 || path.length === 0) {
      throw new CloudPatchOrchestrationError(
        'invalid-repository',
        'Git returned an invalid changed-file inventory.'
      )
    }
    entries.push({ status, path })
  }
  return entries
}

async function defaultChangedFiles(
  repository: Repository,
  baseSha: string,
  headSha: string
): Promise<ReadonlyArray<ICloudPatchFileEntry>> {
  const { git } = await import('../git')
  const changes = await git(
    ['diff', '--name-status', '--no-renames', '-z', baseSha, headSha, '--'],
    repository.path,
    'listCloudPatchFiles'
  )
  const entries: ICloudPatchFileEntry[] = []
  for (const entry of parseNameStatus(changes.stdout)) {
    if (entry.status.length !== 1 || !'AMD'.includes(entry.status)) {
      throw new CloudPatchOrchestrationError(
        'invalid-repository',
        `Cloud Patch cannot transfer Git entry '${entry.path}' with status '${entry.status}'.`
      )
    }
    if (entry.status === 'D') {
      entries.push({ path: entry.path, mode: 'deleted', byteLength: 0 })
      continue
    }
    const tree = await git(
      ['ls-tree', '-l', '-z', headSha, '--', entry.path],
      repository.path,
      'inspectCloudPatchFile'
    )
    const record = tree.stdout.replace(/\0$/, '').split('\t', 2)[0]
    const fields = record.split(' ')
    const mode = fields[0]
    const byteLength = Number(fields[3])
    if (
      (mode !== '100644' && mode !== '100755') ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      throw new CloudPatchOrchestrationError(
        'invalid-repository',
        `Cloud Patch cannot describe Git entry '${entry.path}'.`
      )
    }
    entries.push({
      path: entry.path,
      mode: mode as '100644' | '100755',
      byteLength,
    })
  }
  return entries
}

function serverConfig(connection: ITeamConnection): ICloudPatchServerConfig {
  return {
    origin: connection.publicOrigin,
    deviceToken: connection.deviceToken,
  }
}

function toBytes(artifact: ICloudPatchArtifact): Uint8Array {
  return new TextEncoder().encode(artifact.serialized)
}

function orchestrationFailure(
  code: CloudPatchOrchestrationErrorCode,
  message: string,
  cause?: unknown
): CloudPatchOrchestrationError {
  return new CloudPatchOrchestrationError(code, message, cause)
}

/** Build a real format-patch mailbox, validate it, and store it on the joined R1 server. */
export async function shareCloudPatch(
  repository: Repository,
  baseRevision: string,
  headRevision: string,
  recipientDeviceIds: ReadonlyArray<string>,
  dependencies: ICloudPatchOrchestrationDependencies = {}
): Promise<CloudPatchShareResult> {
  const connection = await (
    dependencies.getConnection ?? defaultGetConnection
  )()
  if (connection === null) {
    return { kind: 'unavailable', reason: 'no-server-configured' }
  }
  if (
    recipientDeviceIds.length === 0 ||
    recipientDeviceIds.includes(connection.deviceId)
  ) {
    throw orchestrationFailure(
      'invalid-recipient',
      'Choose at least one other joined device to receive the Cloud Patch.'
    )
  }

  const resolveCommit = dependencies.resolveCommit ?? defaultResolveCommit
  const baseSha = await resolveCommit(repository, baseRevision)
  const headSha = await resolveCommit(repository, headRevision)
  const format =
    dependencies.formatPatch ??
    (async (targetRepository: Repository, baseSha: string, headSha: string) => {
      const { formatPatch } = await import('../git')
      return formatPatch(targetRepository, baseSha, headSha)
    })
  const patch = await format(repository, baseSha, headSha)
  const getChangedFiles = dependencies.getChangedFiles ?? defaultChangedFiles
  const files = await getChangedFiles(repository, baseSha, headSha)
  const now = dependencies.now?.() ?? Date.now()
  const artifact = createCloudPatchArtifact(
    {
      kind: 'format-patch',
      repositoryId: await (dependencies.getRepositoryId ?? defaultRepositoryId)(
        repository
      ),
      createdAtMs: now,
      expiresAtMs:
        now +
        Math.min(
          DefaultCloudPatchLifetimeMs,
          MaximumCloudPatchArtifactLifetimeMs
        ),
      baseSha,
      headSha,
      files,
      patch,
    },
    { now: dependencies.now }
  )
  const upload = dependencies.upload ?? uploadCloudPatch
  const result = await upload(serverConfig(connection), {
    recipientDeviceIds,
    expectedArtifactSha256: artifact.artifactSha256,
    artifactBytes: toBytes(artifact),
    lifetimeMs: DefaultCloudPatchLifetimeMs,
  })
  return {
    kind: 'shared',
    ...result,
    artifactSha256: artifact.artifactSha256,
    deviceId: connection.deviceId,
  }
}

async function defaultApplyFormatPatch(
  repository: Repository,
  patch: string
): Promise<void> {
  const { git } = await import('../git')
  const directory = await mkdtemp(
    Path.join(tmpdir(), 'desktop-material-cloud-patch-')
  )
  const patchPath = Path.join(directory, 'series.patch')
  try {
    await writeFile(patchPath, patch, 'utf8')
    await git(
      ['am', '--3way', '--keep-cr', '--no-gpg-sign', '--', patchPath],
      repository.path,
      'applyCloudPatch'
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** Fetch, verify against this repository and the reviewed digest, then apply via the existing git-am argv. */
export async function applyCloudPatch(
  repository: Repository,
  link: string,
  dependencies: ICloudPatchOrchestrationDependencies = {}
): Promise<CloudPatchApplyResult> {
  const connection = await (
    dependencies.getConnection ?? defaultGetConnection
  )()
  if (connection === null) {
    return { kind: 'unavailable', reason: 'no-server-configured' }
  }
  const parsedLink = parseCloudPatchShareLink(link)
  if (parsedLink === null) {
    throw orchestrationFailure(
      'invalid-share-link',
      'The supplied value is not a valid Cloud Patch share link.'
    )
  }
  const fetchPatch = dependencies.fetch ?? fetchCloudPatch
  const fetched = await fetchPatch(
    serverConfig(connection),
    parsedLink.shareId,
    parsedLink.shareSecret
  )
  if (fetched.shareId !== parsedLink.shareId) {
    throw orchestrationFailure(
      'invalid-server-response',
      'The Cloud Patch server returned a different share identifier.'
    )
  }
  const repositoryId = await (
    dependencies.getRepositoryId ?? defaultRepositoryId
  )(repository)
  const parsedArtifact = createArtifactFromBytes(fetched.artifactBytes)
  if (parsedArtifact.manifest.contentKind !== 'format-patch') {
    throw orchestrationFailure(
      'unsupported-artifact',
      'The shared Cloud Patch is not a git format-patch series.'
    )
  }
  const currentHead = await (
    dependencies.resolveCommit ?? defaultResolveCommit
  )(repository, 'HEAD')
  const verified = verifyCloudPatchArtifact(
    fetched.artifactBytes,
    {
      kind: 'format-patch',
      repositoryId,
      baseSha: currentHead,
      headSha: parsedArtifact.manifest.headSha as string,
      expectedArtifactSha256: parsedArtifact.artifactSha256,
    },
    { now: dependencies.now }
  )
  if (!verified.ok) {
    throw orchestrationFailure(
      'artifact-verification-failed',
      verified.error.message,
      verified.error
    )
  }
  const apply = dependencies.applyFormatPatch ?? defaultApplyFormatPatch
  try {
    await apply(repository, verified.artifact.content as string)
  } catch (error) {
    throw orchestrationFailure(
      'git-am-failed',
      error instanceof Error
        ? `Git could not apply the Cloud Patch: ${error.message}`
        : 'Git could not apply the Cloud Patch.',
      error
    )
  }
  return {
    kind: 'applied',
    shareId: parsedLink.shareId,
    headSha: parsedArtifact.manifest.headSha as string,
  }
}

function createArtifactFromBytes(bytes: Uint8Array): ICloudPatchArtifact {
  const parsed = parseCloudPatchArtifact(bytes)
  if (!parsed.ok) {
    throw orchestrationFailure(
      'artifact-verification-failed',
      parsed.error.message,
      parsed.error
    )
  }
  return parsed.artifact
}
