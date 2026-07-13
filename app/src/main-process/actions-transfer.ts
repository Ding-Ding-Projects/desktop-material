import { net } from 'electron'
import {
  ActionsArtifactDownloadError,
  downloadActionsArtifactArchive,
  normalizeActionsArtifactDestination,
} from '../lib/actions-artifact-download'
import {
  ActionsArtifactMaximumDownloadBytes,
  isSupportedActionsArtifactDigest,
} from '../lib/actions-artifacts'
import {
  ActionsArtifactTransferResult,
  ActionsJobLogMaximumBytes,
  ActionsJobLogTransferResult,
  ActionsJobLogTruncationMarker,
  ActionsTransferFailureReason,
  ActionsTransferMaximumRedirects,
  IActionsArtifactTransferRequest,
  IActionsJobLogTransferRequest,
  IActionsTransferFailure,
  IActionsTransferProgressEvent,
} from '../lib/actions-transfer'
import { createGitHubAPIRequestHeaders } from '../lib/github-rest-api-version'

type ActionsFetcher = (input: string, init: RequestInit) => Promise<Response>

export interface IActionsTransferSender {
  readonly id: number
  send(
    channel: 'actions-transfer-progress',
    event: IActionsTransferProgressEvent
  ): void
  once(event: 'destroyed', listener: () => void): unknown
  removeListener(event: 'destroyed', listener: () => void): unknown
  isDestroyed(): boolean
}

class TransferFailure extends Error {
  public constructor(
    public readonly reason: ActionsTransferFailureReason,
    public readonly status: number | null = null
  ) {
    super(reason)
    this.name = 'TransferFailure'
  }
}

interface IActiveTransfer {
  readonly controller: AbortController
  readonly sender: IActionsTransferSender
  readonly onDestroyed: () => void
}

const activeTransfers = new Map<string, IActiveTransfer>()
const operationIdPattern = /^[a-f0-9]{32}$/
const forbiddenPartCharacters = /[\u0000-\u001f\u007f/\\?#]/

const transferKey = (senderId: number, operationId: string) =>
  `${senderId}:${operationId}`

function throwIfTransferAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Actions transfer canceled.', 'AbortError')
  }
}

function failure(
  reason: ActionsTransferFailureReason,
  status: number | null = null
): IActionsTransferFailure {
  return { ok: false, reason, status }
}

function validateOperationId(value: unknown): string {
  if (typeof value !== 'string' || !operationIdPattern.test(value)) {
    throw new TransferFailure('invalid-request')
  }
  return value
}

function validatePart(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    forbiddenPartCharacters.test(value)
  ) {
    throw new TransferFailure('invalid-request')
  }
  return value
}

function validateIdentifier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TransferFailure('invalid-request')
  }
  return value
}

function validateEndpoint(value: unknown): URL {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new TransferFailure('invalid-request')
  }
  let endpoint: URL
  try {
    endpoint = new URL(value.endsWith('/') ? value : `${value}/`)
  } catch {
    throw new TransferFailure('invalid-request')
  }
  if (
    (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    throw new TransferFailure('invalid-request')
  }
  return endpoint
}

function validateToken(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 16 * 1024 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TransferFailure('invalid-request')
  }
  return value
}

function artifactPath(request: IActionsArtifactTransferRequest): {
  readonly endpoint: URL
  readonly token: string
  readonly path: string
} {
  const endpoint = validateEndpoint(request.endpoint)
  const token = validateToken(request.token)
  const owner = encodeURIComponent(validatePart(request.owner))
  const repository = encodeURIComponent(validatePart(request.repository))
  const id = validateIdentifier(request.artifact?.id)
  if (
    typeof request.artifact?.sizeInBytes !== 'number' ||
    !Number.isSafeInteger(request.artifact.sizeInBytes) ||
    request.artifact.sizeInBytes < 0 ||
    request.artifact.sizeInBytes > ActionsArtifactMaximumDownloadBytes ||
    typeof request.artifact.expired !== 'boolean' ||
    (request.artifact.digest !== null &&
      (typeof request.artifact.digest !== 'string' ||
        !isSupportedActionsArtifactDigest(request.artifact.digest)))
  ) {
    throw new TransferFailure('invalid-request')
  }
  if (request.artifact.expired) {
    throw new TransferFailure('expired', 410)
  }
  if (typeof request.destination !== 'string') {
    throw new TransferFailure('invalid-request')
  }
  normalizeActionsArtifactDestination(request.destination)
  return {
    endpoint,
    token,
    path: `repos/${owner}/${repository}/actions/artifacts/${id}/zip`,
  }
}

function jobLogPath(request: IActionsJobLogTransferRequest): {
  readonly endpoint: URL
  readonly token: string
  readonly path: string
} {
  const endpoint = validateEndpoint(request.endpoint)
  const token = validateToken(request.token)
  const owner = encodeURIComponent(validatePart(request.owner))
  const repository = encodeURIComponent(validatePart(request.repository))
  const id = validateIdentifier(request.jobId)
  return {
    endpoint,
    token,
    path: `repos/${owner}/${repository}/actions/jobs/${id}/logs`,
  }
}

function redirectURL(location: string, current: URL, requireHTTPS: boolean) {
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    throw new TransferFailure('unsafe-redirect')
  }
  if (
    (next.protocol !== 'https:' && next.protocol !== 'http:') ||
    next.username !== '' ||
    next.password !== '' ||
    next.hash !== '' ||
    (requireHTTPS && next.protocol !== 'https:')
  ) {
    throw new TransferFailure('unsafe-redirect')
  }
  return next
}

async function fetchRedirectChain(
  endpoint: URL,
  path: string,
  token: string,
  signal: AbortSignal,
  fetcher: ActionsFetcher
): Promise<Response> {
  let current = new URL(path, endpoint)
  let authenticated = true
  let requireHTTPS = endpoint.protocol === 'https:'

  for (let redirects = 0; ; redirects++) {
    const headers = createGitHubAPIRequestHeaders(endpoint.toString(), path, {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GitHubDesktop-ActionsTransfer',
    })
    if (authenticated) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await fetcher(current.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal,
    })
    throwIfTransferAborted(signal)
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      throwIfTransferAborted(signal)
      if (redirects >= ActionsTransferMaximumRedirects) {
        throw new TransferFailure('too-many-redirects')
      }
      const location = response.headers.get('location')
      if (location === null) {
        throw new TransferFailure('missing-location')
      }
      current = redirectURL(location, current, requireHTTPS)
      requireHTTPS = requireHTTPS || current.protocol === 'https:'
      authenticated = false
      continue
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throwIfTransferAborted(signal)
      throw new TransferFailure(
        response.status === 410 ? 'expired' : 'http',
        response.status
      )
    }
    return response
  }
}

function beginTransfer(
  sender: IActionsTransferSender,
  operationId: string
): IActiveTransfer {
  validateOperationId(operationId)
  const key = transferKey(sender.id, operationId)
  if (activeTransfers.has(key)) {
    throw new TransferFailure('invalid-request')
  }
  const controller = new AbortController()
  const onDestroyed = () => controller.abort()
  const active = { controller, sender, onDestroyed }
  activeTransfers.set(key, active)
  sender.once('destroyed', onDestroyed)
  if (sender.isDestroyed()) {
    controller.abort()
  }
  return active
}

function endTransfer(operationId: string, active: IActiveTransfer) {
  activeTransfers.delete(transferKey(active.sender.id, operationId))
  if (!active.sender.isDestroyed()) {
    active.sender.removeListener('destroyed', active.onDestroyed)
  }
}

function mapFailure(error: unknown): IActionsTransferFailure {
  if ((error as Error)?.name === 'AbortError') {
    return failure('canceled')
  }
  if (error instanceof TransferFailure) {
    return failure(error.reason, error.status)
  }
  if (error instanceof ActionsArtifactDownloadError) {
    return failure(error.kind)
  }
  return failure('network')
}

function electronFetcher(input: string, init: RequestInit) {
  return net.fetch(input, init)
}

export async function handleActionsArtifactTransfer(
  sender: IActionsTransferSender,
  request: IActionsArtifactTransferRequest,
  fetcher: ActionsFetcher = electronFetcher
): Promise<ActionsArtifactTransferResult> {
  let active: IActiveTransfer | null = null
  try {
    active = beginTransfer(sender, request?.operationId)
    const validated = artifactPath(request)
    const response = await fetchRedirectChain(
      validated.endpoint,
      validated.path,
      validated.token,
      active.controller.signal,
      fetcher
    )
    let lastProgressAt = 0
    const result = await downloadActionsArtifactArchive({
      artifact: {
        id: request.artifact.id,
        name: 'artifact',
        sizeInBytes: request.artifact.sizeInBytes,
        expired: request.artifact.expired,
        createdAt: new Date(0),
        expiresAt: null,
        updatedAt: new Date(0),
        digest: request.artifact.digest,
        workflowRun: null,
      },
      response,
      destination: request.destination,
      signal: active.controller.signal,
      onProgress: progress => {
        const now = Date.now()
        if (
          !sender.isDestroyed() &&
          (now - lastProgressAt >= 100 ||
            progress.receivedBytes === progress.totalBytes)
        ) {
          lastProgressAt = now
          try {
            sender.send('actions-transfer-progress', {
              operationId: request.operationId,
              ...progress,
            })
          } catch {
            // Renderer destruction can race the isDestroyed check. Abort the
            // owning transfer without replacing cancellation with a send error.
            active?.controller.abort()
          }
        }
      },
    })
    return { ok: true, ...result }
  } catch (error) {
    return mapFailure(error)
  } finally {
    if (active !== null) {
      endTransfer(request.operationId, active)
    }
  }
}

async function readBoundedJobLog(
  response: Response,
  signal: AbortSignal
): Promise<{ readonly log: string; readonly truncated: boolean }> {
  throwIfTransferAborted(signal)
  if (response.body === null) {
    return { log: '', truncated: false }
  }
  const reader = response.body.getReader()
  const chunks = new Array<Uint8Array>()
  let length = 0
  let truncated = false
  const cancel = () => reader.cancel().catch(() => undefined)
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (length < ActionsJobLogMaximumBytes) {
      if (signal.aborted) {
        throw new DOMException('Job log request canceled.', 'AbortError')
      }
      const next = await reader.read()
      throwIfTransferAborted(signal)
      if (next.done) {
        break
      }
      const remaining = ActionsJobLogMaximumBytes - length
      if (next.value.byteLength > remaining) {
        chunks.push(next.value.slice(0, remaining))
        length += remaining
        truncated = true
        break
      }
      chunks.push(next.value)
      length += next.value.byteLength
    }
    if (!truncated && length === ActionsJobLogMaximumBytes) {
      const extra = await reader.read()
      throwIfTransferAborted(signal)
      truncated = !extra.done
    }
    if (truncated) {
      await reader.cancel().catch(() => undefined)
      throwIfTransferAborted(signal)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const log = new TextDecoder().decode(bytes)
  return {
    log: truncated ? log + ActionsJobLogTruncationMarker : log,
    truncated,
  }
}

export async function handleActionsJobLogTransfer(
  sender: IActionsTransferSender,
  request: IActionsJobLogTransferRequest,
  fetcher: ActionsFetcher = electronFetcher
): Promise<ActionsJobLogTransferResult> {
  let active: IActiveTransfer | null = null
  try {
    active = beginTransfer(sender, request?.operationId)
    const validated = jobLogPath(request)
    const response = await fetchRedirectChain(
      validated.endpoint,
      validated.path,
      validated.token,
      active.controller.signal,
      fetcher
    )
    const result = await readBoundedJobLog(response, active.controller.signal)
    return { ok: true, ...result }
  } catch (error) {
    return mapFailure(error)
  } finally {
    if (active !== null) {
      endTransfer(request.operationId, active)
    }
  }
}

export function cancelActionsTransfer(
  senderId: number,
  operationId: string
): boolean {
  if (!operationIdPattern.test(operationId)) {
    return false
  }
  const active = activeTransfers.get(transferKey(senderId, operationId))
  if (active === undefined) {
    return false
  }
  active.controller.abort()
  return true
}
