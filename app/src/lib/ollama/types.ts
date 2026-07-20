export type OllamaJsonPrimitive = string | number | boolean | null

export type OllamaJsonValue =
  | OllamaJsonPrimitive
  | ReadonlyArray<OllamaJsonValue>
  | IOllamaJsonObject

export interface IOllamaJsonObject {
  readonly [key: string]: OllamaJsonValue
}

export type OllamaClientErrorKind =
  | 'endpoint'
  | 'http'
  | 'network'
  | 'response'
  | 'server'
  | 'timeout'

/** A bounded, credential-safe failure returned by the Ollama client. */
export class OllamaClientError extends Error {
  public readonly kind: OllamaClientErrorKind
  public readonly status: number | undefined

  public constructor(
    kind: OllamaClientErrorKind,
    message: string,
    status?: number
  ) {
    super(message)
    this.name = 'OllamaClientError'
    this.kind = kind
    this.status = status
  }
}

export interface IOllamaVersion {
  readonly version: string
  readonly metadata: IOllamaJsonObject
}

export interface IOllamaModelDetails {
  readonly parentModel?: string
  readonly format?: string
  readonly family?: string
  readonly families?: ReadonlyArray<string>
  readonly parameterSize?: string
  readonly quantizationLevel?: string
  readonly metadata: IOllamaJsonObject
}

export interface IOllamaModel {
  readonly name: string
  readonly model: string
  readonly modifiedAt?: string
  readonly size?: number
  readonly digest?: string
  readonly details?: IOllamaModelDetails
  readonly metadata: IOllamaJsonObject
}

export interface IOllamaRunningModel extends IOllamaModel {
  readonly expiresAt?: string
  readonly sizeVram?: number
  readonly contextLength?: number
}

export interface IOllamaModelInfo {
  readonly modelfile?: string
  readonly parameters?: string
  readonly template?: string
  readonly system?: string
  readonly license?: string
  readonly modifiedAt?: string
  readonly capabilities?: ReadonlyArray<string>
  readonly details?: IOllamaModelDetails
  readonly modelInfo?: IOllamaJsonObject
  readonly projectorInfo?: IOllamaJsonObject
  readonly metadata: IOllamaJsonObject
}

export interface IOllamaPullProgress {
  readonly status: string
  readonly digest?: string
  readonly total?: number
  readonly completed?: number
  readonly metadata: IOllamaJsonObject
}

export interface IOllamaRequestOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface IOllamaPullOptions extends IOllamaRequestOptions {
  readonly onProgress?: (progress: IOllamaPullProgress) => void
}

export type OllamaFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export interface IOllamaClientOptions {
  readonly fetcher?: OllamaFetch
  readonly requestTimeoutMs?: number
  readonly pullInactivityTimeoutMs?: number
}

/** The small operation surface consumed by the React model manager. */
export interface IOllamaClient {
  readonly endpoint: string

  health(options?: IOllamaRequestOptions): Promise<IOllamaVersion>
  list(options?: IOllamaRequestOptions): Promise<ReadonlyArray<IOllamaModel>>
  listRunning(
    options?: IOllamaRequestOptions
  ): Promise<ReadonlyArray<IOllamaRunningModel>>
  show(
    model: string,
    options?: IOllamaRequestOptions
  ): Promise<IOllamaModelInfo>
  pull(
    model: string,
    options?: IOllamaPullOptions
  ): Promise<IOllamaPullProgress>
  copy(
    source: string,
    destination: string,
    options?: IOllamaRequestOptions
  ): Promise<void>
  delete(model: string, options?: IOllamaRequestOptions): Promise<void>
  load(model: string, options?: IOllamaRequestOptions): Promise<void>
  unload(model: string, options?: IOllamaRequestOptions): Promise<void>
}
