import { randomBytes } from 'crypto'
import { Account } from '../models/account'
import { GitHubRepository } from '../models/github-repository'
import { IActionsArtifact } from './actions-artifacts'
import { IActionsArtifactDownloadProgress } from './actions-artifact-download'
import {
  actionsTransferFailureMessage,
  ActionsArtifactTransferResult,
  ActionsJobLogMaximumBytes,
  ActionsJobLogTransferResult,
  ActionsJobLogTruncationMarker,
  ActionsTransferError,
  IActionsArtifactTransferSuccess,
  IActionsArtifactTransferRequest,
  IActionsJobLogTransferRequest,
  IActionsTransferFailure,
  IActionsTransferProgressEvent,
} from './actions-transfer'
import * as ipcRenderer from './ipc-renderer'

const opaqueIdPattern = /^[a-f0-9]{32}$/
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/
const transferFailureReasons = new Set([
  'canceled',
  'invalid-request',
  'network',
  'http',
  'missing-location',
  'unsafe-redirect',
  'too-many-redirects',
  'expired',
  'destination',
  'too-large',
  'size-mismatch',
  'digest-mismatch',
  'missing-body',
])

function operationId(): string {
  return randomBytes(16).toString('hex')
}

function abortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError('Actions transfer canceled.')
  }
}

function transferError(
  failure: {
    readonly reason: ConstructorParameters<typeof ActionsTransferError>[0]
    readonly status: number | null
  },
  subject: 'artifact' | 'job logs'
): ActionsTransferError {
  return new ActionsTransferError(
    failure.reason,
    failure.status,
    actionsTransferFailureMessage({ ok: false, ...failure }, subject)
  )
}

function invalidTransferResponse(subject: 'artifact' | 'job log'): Error {
  return new Error(`The main process returned an invalid ${subject} transfer response.`)
}

function transferResponseRecord(
  value: unknown,
  subject: 'artifact' | 'job log'
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidTransferResponse(subject)
  }
  return value as Readonly<Record<string, unknown>>
}

function parseTransferFailure(
  input: Readonly<Record<string, unknown>>,
  subject: 'artifact' | 'job log'
): IActionsTransferFailure {
  const { reason, status } = input
  if (
    typeof reason !== 'string' ||
    !transferFailureReasons.has(reason) ||
    (status !== null &&
      (typeof status !== 'number' ||
        !Number.isSafeInteger(status) ||
        status < 100 ||
        status > 599))
  ) {
    throw invalidTransferResponse(subject)
  }
  return {
    ok: false,
    reason: reason as IActionsTransferFailure['reason'],
    status,
  }
}

function parseArtifactTransferResponse(
  value: unknown,
  expectedBytes: number
): ActionsArtifactTransferResult {
  const input = transferResponseRecord(value, 'artifact')
  if (input.ok === false) {
    return parseTransferFailure(input, 'artifact')
  }
  if (
    input.ok !== true ||
    typeof input.downloadId !== 'string' ||
    !opaqueIdPattern.test(input.downloadId) ||
    typeof input.path !== 'string' ||
    input.path.length === 0 ||
    input.path.length > 32_768 ||
    input.path.includes('\u0000') ||
    typeof input.bytes !== 'number' ||
    !Number.isSafeInteger(input.bytes) ||
    input.bytes !== expectedBytes ||
    typeof input.localDigest !== 'string' ||
    !sha256DigestPattern.test(input.localDigest) ||
    (input.matchesGitHubDigest !== null &&
      typeof input.matchesGitHubDigest !== 'boolean')
  ) {
    throw invalidTransferResponse('artifact')
  }
  return {
    ok: true,
    downloadId: input.downloadId,
    path: input.path,
    bytes: input.bytes,
    localDigest: input.localDigest,
    matchesGitHubDigest: input.matchesGitHubDigest,
  }
}

function parseJobLogTransferResponse(value: unknown): ActionsJobLogTransferResult {
  const input = transferResponseRecord(value, 'job log')
  if (input.ok === false) {
    return parseTransferFailure(input, 'job log')
  }
  if (
    input.ok !== true ||
    typeof input.log !== 'string' ||
    input.log.length >
      ActionsJobLogMaximumBytes + ActionsJobLogTruncationMarker.length ||
    typeof input.truncated !== 'boolean' ||
    (input.truncated && !input.log.endsWith(ActionsJobLogTruncationMarker))
  ) {
    throw invalidTransferResponse('job log')
  }
  return { ok: true, log: input.log, truncated: input.truncated }
}

export async function downloadActionsArtifactThroughMainProcess(
  account: Account,
  repository: GitHubRepository,
  artifact: IActionsArtifact,
  destination: string,
  signal: AbortSignal,
  onProgress?: (progress: IActionsArtifactDownloadProgress) => void
): Promise<IActionsArtifactTransferSuccess> {
  throwIfAborted(signal)
  const id = operationId()
  const request: IActionsArtifactTransferRequest = {
    operationId: id,
    endpoint: account.endpoint,
    token: account.token,
    owner: repository.owner.login,
    repository: repository.name,
    artifact: {
      id: artifact.id,
      sizeInBytes: artifact.sizeInBytes,
      expired: artifact.expired,
      digest: artifact.digest,
      workflowRun: artifact.workflowRun,
    },
    destination,
  }
  const progressListener = (
    _event: unknown,
    progress: IActionsTransferProgressEvent
  ) => {
    if (progress.operationId === id) {
      onProgress?.(progress)
    }
  }
  const cancel = () => ipcRenderer.send('cancel-actions-transfer', id)
  ipcRenderer.on('actions-transfer-progress', progressListener)
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (signal.aborted) {
      cancel()
      throw abortError('Artifact download canceled.')
    }
    const result = parseArtifactTransferResponse(
      await ipcRenderer.invoke('download-actions-artifact', request),
      artifact.sizeInBytes
    )
    if (!result.ok) {
      if (result.reason === 'canceled') {
        throw abortError('Artifact download canceled.')
      }
      throw transferError(result, 'artifact')
    }
    return {
      ok: true,
      downloadId: result.downloadId,
      path: result.path,
      bytes: result.bytes,
      localDigest: result.localDigest,
      matchesGitHubDigest: result.matchesGitHubDigest,
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    ipcRenderer.removeListener('actions-transfer-progress', progressListener)
  }
}

export async function fetchActionsJobLogThroughMainProcess(
  account: Account,
  repository: GitHubRepository,
  jobId: number,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal)
  const id = operationId()
  const request: IActionsJobLogTransferRequest = {
    operationId: id,
    endpoint: account.endpoint,
    token: account.token,
    owner: repository.owner.login,
    repository: repository.name,
    jobId,
  }
  const cancel = () => ipcRenderer.send('cancel-actions-transfer', id)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    if (signal?.aborted) {
      cancel()
      throw abortError('Job log request canceled.')
    }
    const result = parseJobLogTransferResponse(
      await ipcRenderer.invoke('fetch-actions-job-log', request)
    )
    if (!result.ok) {
      if (result.reason === 'canceled') {
        throw abortError('Job log request canceled.')
      }
      throw transferError(result, 'job logs')
    }
    return result.log
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
