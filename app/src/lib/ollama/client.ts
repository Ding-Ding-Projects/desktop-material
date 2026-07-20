import { normalizeOllamaEndpoint } from './endpoint'
import {
  IOllamaClient,
  IOllamaClientOptions,
  IOllamaModel,
  IOllamaModelInfo,
  IOllamaPullOptions,
  IOllamaPullProgress,
  IOllamaRequestOptions,
  IOllamaRunningModel,
  IOllamaVersion,
  OllamaClientError,
  OllamaFetch,
} from './types'
import {
  getServerError,
  isJsonObject,
  parseModelsResponse,
  parsePullProgress,
  parseRunningModelsResponse,
  parseShowResponse,
  parseVersionResponse,
  validateGenerateResponse,
} from './validation'

export const DefaultOllamaRequestTimeoutMs = 30_000
export const DefaultOllamaPullInactivityTimeoutMs = 120_000
export const MaxOllamaJsonBodyBytes = 8 * 1024 * 1024
export const MaxOllamaErrorBodyBytes = 16 * 1024
export const MaxOllamaNdjsonLineBytes = 64 * 1024

const MaxModelNameLength = 1_024
const MaxTimerDelayMs = 2_147_483_647
const MaxErrorDetailLength = 512

type OllamaMethod = 'GET' | 'POST' | 'DELETE'
type OllamaOperation =
  | 'version'
  | 'tags'
  | 'ps'
  | 'show'
  | 'pull'
  | 'copy'
  | 'delete'
  | 'generate'

interface IRequestContext {
  readonly signal: AbortSignal
  touch(): void
  timedOut(): boolean
  dispose(): void
}

interface IBoundedBody {
  readonly bytes: Uint8Array
  readonly truncated: boolean
}

function abortError(): Error {
  const error = new Error('The Ollama request was cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortError()
  }
}

function resolveTimeout(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > MaxTimerDelayMs) {
    throw new OllamaClientError(
      'validation',
      'The Ollama request timeout is invalid.'
    )
  }
  return timeout
}

function validateModelName(value: string): string {
  const model = value.trim()
  if (
    model.length === 0 ||
    model.length > MaxModelNameLength ||
    /[\u0000-\u001f\u007f]/.test(model)
  ) {
    throw new OllamaClientError(
      'validation',
      'The Ollama model name is invalid.'
    )
  }
  return model
}

function createRequestContext(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): IRequestContext {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let didTimeout = false

  const clearTimer = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout)
      timeout = undefined
    }
  }
  const touch = () => {
    clearTimer()
    timeout = setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)
  }
  const callerAborted = () => controller.abort()

  if (callerSignal?.aborted === true) {
    controller.abort()
  } else {
    callerSignal?.addEventListener('abort', callerAborted, { once: true })
  }
  touch()

  return {
    signal: controller.signal,
    touch,
    timedOut: () => didTimeout,
    dispose: () => {
      clearTimer()
      callerSignal?.removeEventListener('abort', callerAborted)
    },
  }
}

function combineBytes(chunks: ReadonlyArray<Uint8Array>, size: number) {
  const combined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body === null) {
    return
  }
  try {
    await response.body.cancel()
  } catch {
    // The transport may already have closed or aborted the body.
  }
}

async function readBoundedBody(
  response: Response,
  limit: number,
  truncate: boolean,
  touch: () => void
): Promise<IBoundedBody> {
  const contentLength = Number(response.headers.get('Content-Length'))
  if (!truncate && Number.isFinite(contentLength) && contentLength > limit) {
    await cancelResponseBody(response)
    throw new OllamaClientError(
      'response',
      'The Ollama response exceeded the allowed size.'
    )
  }
  if (response.body === null) {
    return { bytes: new Uint8Array(), truncated: false }
  }

  const reader = response.body.getReader()
  const chunks = new Array<Uint8Array>()
  let size = 0
  while (true) {
    const result = await reader.read()
    touch()
    if (result.done) {
      return { bytes: combineBytes(chunks, size), truncated: false }
    }
    if (result.value.byteLength === 0) {
      continue
    }

    const remaining = limit - size
    if (result.value.byteLength > remaining) {
      if (remaining > 0) {
        chunks.push(result.value.slice(0, remaining))
        size += remaining
      }
      try {
        await reader.cancel()
      } catch {
        // The body may have been closed concurrently by an abort.
      }
      if (!truncate) {
        throw new OllamaClientError(
          'response',
          'The Ollama response exceeded the allowed size.'
        )
      }
      return { bytes: combineBytes(chunks, size), truncated: true }
    }
    chunks.push(result.value)
    size += result.value.byteLength
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new OllamaClientError(
      'response',
      'Ollama returned an invalid JSON response.'
    )
  }
  if (text.trim().length === 0) {
    throw new OllamaClientError(
      'response',
      'Ollama returned an empty JSON response.'
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new OllamaClientError(
      'response',
      'Ollama returned an invalid JSON response.'
    )
  }
}

async function readJsonResponse(
  response: Response,
  touch: () => void
): Promise<unknown> {
  const body = await readBoundedBody(
    response,
    MaxOllamaJsonBodyBytes,
    false,
    touch
  )
  return decodeJson(body.bytes)
}

function sanitizeErrorDetail(value: string): string {
  let detail = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  detail = detail.replace(
    /\b([a-z][a-z\d+.-]*:\/\/)[^/\s:@]+:[^@/\s]+@/gi,
    '$1[redacted]@'
  )
  detail = detail.replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [redacted]')
  detail = detail.replace(
    /\b(api[_-]?key|token|password)\s*([:=])\s*[^\s,;]+/gi,
    '$1$2[redacted]'
  )
  if (detail.length > MaxErrorDetailLength) {
    return `${detail.slice(0, MaxErrorDetailLength - 3)}...`
  }
  return detail
}

function serverError(message: string): OllamaClientError {
  const detail = sanitizeErrorDetail(message)
  return new OllamaClientError(
    'server',
    detail.length > 0
      ? `Ollama rejected the request: ${detail}`
      : 'Ollama rejected the request.'
  )
}

async function httpError(
  response: Response,
  touch: () => void
): Promise<OllamaClientError> {
  const body = await readBoundedBody(
    response,
    MaxOllamaErrorBodyBytes,
    true,
    touch
  )
  let detail: string | undefined
  if (!body.truncated && body.bytes.byteLength > 0) {
    try {
      const value = decodeJson(body.bytes)
      if (isJsonObject(value)) {
        const candidate = getServerError(value) ?? value.message
        if (typeof candidate === 'string') {
          detail = sanitizeErrorDetail(candidate)
        }
      }
    } catch {
      // Non-JSON HTTP errors remain status-only and never echo response bodies.
    }
  }

  const suffix = detail !== undefined && detail.length > 0 ? ` ${detail}` : ''
  return new OllamaClientError(
    'http',
    `Ollama request failed with HTTP ${response.status}.${suffix}`,
    response.status
  )
}

function parseNdjsonLine(bytes: Uint8Array): unknown | undefined {
  const withoutCarriageReturn =
    bytes.length > 0 && bytes[bytes.length - 1] === 13
      ? bytes.slice(0, -1)
      : bytes
  if (withoutCarriageReturn.byteLength === 0) {
    return undefined
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      withoutCarriageReturn
    )
  } catch {
    throw new OllamaClientError(
      'response',
      'Ollama returned invalid pull progress.'
    )
  }
  if (text.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new OllamaClientError(
      'response',
      'Ollama returned invalid pull progress.'
    )
  }
}

async function readPullProgress(
  response: Response,
  context: IRequestContext,
  options: IOllamaPullOptions
): Promise<IOllamaPullProgress> {
  if (response.body === null) {
    throw new OllamaClientError(
      'response',
      'Ollama returned an empty pull stream.'
    )
  }

  const reader = response.body.getReader()
  const lineParts = new Array<Uint8Array>()
  let lineSize = 0
  let lastProgress: IOllamaPullProgress | undefined

  const append = (part: Uint8Array) => {
    if (lineSize + part.byteLength > MaxOllamaNdjsonLineBytes) {
      throw new OllamaClientError(
        'response',
        'An Ollama pull progress line exceeded the allowed size.'
      )
    }
    if (part.byteLength > 0) {
      lineParts.push(part)
      lineSize += part.byteLength
    }
  }

  const emit = () => {
    const value = parseNdjsonLine(combineBytes(lineParts, lineSize))
    lineParts.length = 0
    lineSize = 0
    if (value === undefined) {
      return
    }
    const error = getServerError(value)
    if (error !== undefined) {
      throw serverError(error)
    }
    const progress = parsePullProgress(value)
    lastProgress = progress
    try {
      options.onProgress?.(progress)
    } catch {
      throw new OllamaClientError(
        'response',
        'The Ollama pull progress handler failed.'
      )
    }
    throwIfAborted(options.signal)
  }

  try {
    while (true) {
      const result = await reader.read()
      context.touch()
      if (result.done) {
        if (lineSize > 0) {
          emit()
        }
        if (lastProgress === undefined) {
          throw new OllamaClientError(
            'response',
            'Ollama returned an empty pull stream.'
          )
        }
        return lastProgress
      }

      let segmentStart = 0
      for (let index = 0; index < result.value.byteLength; index++) {
        if (result.value[index] !== 10) {
          continue
        }
        append(result.value.slice(segmentStart, index))
        emit()
        segmentStart = index + 1
      }
      append(result.value.slice(segmentStart))
    }
  } catch (error) {
    try {
      await reader.cancel()
    } catch {
      // The request abort may already have errored the reader.
    }
    throw error
  }
}

/** Native Ollama API client for model discovery and lifecycle operations. */
export class OllamaClient implements IOllamaClient {
  public readonly endpoint: string

  private readonly fetcher: OllamaFetch
  private readonly requestTimeoutMs: number
  private readonly pullInactivityTimeoutMs: number

  public constructor(endpoint: string, options: IOllamaClientOptions = {}) {
    this.endpoint = normalizeOllamaEndpoint(endpoint)
    this.fetcher =
      options.fetcher ??
      ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
    this.requestTimeoutMs = resolveTimeout(
      options.requestTimeoutMs,
      DefaultOllamaRequestTimeoutMs
    )
    this.pullInactivityTimeoutMs = resolveTimeout(
      options.pullInactivityTimeoutMs,
      DefaultOllamaPullInactivityTimeoutMs
    )
  }

  public health(options: IOllamaRequestOptions = {}): Promise<IOllamaVersion> {
    return this.requestJson('GET', 'version', undefined, options, value =>
      parseVersionResponse(value)
    )
  }

  public list(
    options: IOllamaRequestOptions = {}
  ): Promise<ReadonlyArray<IOllamaModel>> {
    return this.requestJson('GET', 'tags', undefined, options, value =>
      parseModelsResponse(value)
    )
  }

  public listRunning(
    options: IOllamaRequestOptions = {}
  ): Promise<ReadonlyArray<IOllamaRunningModel>> {
    return this.requestJson('GET', 'ps', undefined, options, value =>
      parseRunningModelsResponse(value)
    )
  }

  public show(
    model: string,
    options: IOllamaRequestOptions = {}
  ): Promise<IOllamaModelInfo> {
    return this.requestJson(
      'POST',
      'show',
      { model: validateModelName(model) },
      options,
      value => parseShowResponse(value)
    )
  }

  public pull(
    model: string,
    options: IOllamaPullOptions = {}
  ): Promise<IOllamaPullProgress> {
    return this.request(
      'POST',
      'pull',
      { model: validateModelName(model), stream: true },
      options,
      options.timeoutMs ?? this.pullInactivityTimeoutMs,
      (response, context) => readPullProgress(response, context, options)
    )
  }

  public copy(
    source: string,
    destination: string,
    options: IOllamaRequestOptions = {}
  ): Promise<void> {
    return this.requestVoid(
      'POST',
      'copy',
      {
        source: validateModelName(source),
        destination: validateModelName(destination),
      },
      options
    )
  }

  public delete(
    model: string,
    options: IOllamaRequestOptions = {}
  ): Promise<void> {
    return this.requestVoid(
      'DELETE',
      'delete',
      { model: validateModelName(model) },
      options
    )
  }

  public load(
    model: string,
    options: IOllamaRequestOptions = {}
  ): Promise<void> {
    return this.generateKeepAlive(model, -1, options)
  }

  public unload(
    model: string,
    options: IOllamaRequestOptions = {}
  ): Promise<void> {
    return this.generateKeepAlive(model, 0, options)
  }

  private generateKeepAlive(
    model: string,
    keepAlive: -1 | 0,
    options: IOllamaRequestOptions
  ): Promise<void> {
    return this.requestJson(
      'POST',
      'generate',
      {
        model: validateModelName(model),
        prompt: '',
        keep_alive: keepAlive,
        stream: false,
      },
      options,
      value => validateGenerateResponse(value)
    )
  }

  private requestVoid(
    method: OllamaMethod,
    operation: OllamaOperation,
    body: unknown,
    options: IOllamaRequestOptions
  ): Promise<void> {
    return this.request(
      method,
      operation,
      body,
      options,
      options.timeoutMs ?? this.requestTimeoutMs,
      async response => cancelResponseBody(response)
    )
  }

  private requestJson<T>(
    method: OllamaMethod,
    operation: OllamaOperation,
    body: unknown,
    options: IOllamaRequestOptions,
    parse: (value: unknown) => T
  ): Promise<T> {
    return this.request(
      method,
      operation,
      body,
      options,
      options.timeoutMs ?? this.requestTimeoutMs,
      async (response, context) => {
        const value = await readJsonResponse(response, context.touch)
        const error = getServerError(value)
        if (error !== undefined) {
          throw serverError(error)
        }
        return parse(value)
      }
    )
  }

  private async request<T>(
    method: OllamaMethod,
    operation: OllamaOperation,
    body: unknown,
    options: IOllamaRequestOptions,
    requestedTimeoutMs: number,
    handle: (response: Response, context: IRequestContext) => Promise<T>
  ): Promise<T> {
    throwIfAborted(options.signal)
    const timeoutMs = resolveTimeout(requestedTimeoutMs, this.requestTimeoutMs)
    const context = createRequestContext(options.signal, timeoutMs)
    const request: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: context.signal,
    }

    try {
      const response = await this.fetcher(
        `${this.endpoint}/api/${operation}`,
        request
      )
      context.touch()
      if (!response.ok) {
        throw await httpError(response, context.touch)
      }
      const result = await handle(response, context)
      throwIfAborted(options.signal)
      return result
    } catch (error) {
      if (options.signal?.aborted === true) {
        throw abortError()
      }
      if (context.timedOut()) {
        throw new OllamaClientError('timeout', 'The Ollama request timed out.')
      }
      if (error instanceof OllamaClientError) {
        throw error
      }
      throw new OllamaClientError(
        'network',
        'Desktop Material could not reach the Ollama endpoint.'
      )
    } finally {
      context.dispose()
    }
  }
}

export function createOllamaClient(
  endpoint: string,
  options?: IOllamaClientOptions
): IOllamaClient {
  return new OllamaClient(endpoint, options)
}
