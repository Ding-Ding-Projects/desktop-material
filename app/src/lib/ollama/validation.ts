import {
  IOllamaJsonObject,
  IOllamaModel,
  IOllamaModelDetails,
  IOllamaModelInfo,
  IOllamaPullProgress,
  IOllamaRunningModel,
  IOllamaVersion,
  OllamaClientError,
  OllamaJsonValue,
} from './types'

const MaxMetadataDepth = 12
const MaxMetadataValues = 20_000
const MaxMetadataKeyLength = 512
const MaxIdentityLength = 1_024
const UnsafeObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])

interface ISanitizationBudget {
  remaining: number
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeJsonValue(
  value: unknown,
  depth: number,
  budget: ISanitizationBudget
): OllamaJsonValue | undefined {
  if (budget.remaining <= 0 || depth > MaxMetadataDepth) {
    return undefined
  }
  budget.remaining--

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (Array.isArray(value)) {
    const sanitized = new Array<OllamaJsonValue>()
    for (const entry of value) {
      const result = sanitizeJsonValue(entry, depth + 1, budget)
      if (result !== undefined) {
        sanitized.push(result)
      }
      if (budget.remaining <= 0) {
        break
      }
    }
    return sanitized
  }
  if (!isJsonObject(value)) {
    return undefined
  }

  const sanitized: { [key: string]: OllamaJsonValue } = {}
  for (const [key, entry] of Object.entries(value)) {
    if (
      key.length > MaxMetadataKeyLength ||
      UnsafeObjectKeys.has(key) ||
      budget.remaining <= 0
    ) {
      continue
    }
    const result = sanitizeJsonValue(entry, depth + 1, budget)
    if (result !== undefined) {
      sanitized[key] = result
    }
  }
  return sanitized
}

export function sanitizeJsonObject(value: unknown): IOllamaJsonObject {
  if (!isJsonObject(value)) {
    return {}
  }
  const result = sanitizeJsonValue(value, 0, {
    remaining: MaxMetadataValues,
  })
  return isJsonObject(result) ? (result as IOllamaJsonObject) : {}
}

function malformedResponse(message: string): OllamaClientError {
  return new OllamaClientError('response', message)
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number = Number.MAX_SAFE_INTEGER
): string | undefined {
  const value = record[key]
  if (typeof value !== 'string' || value.length > maxLength) {
    return undefined
  }
  return value
}

function optionalNonNegativeNumber(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string
): ReadonlyArray<string> | undefined {
  const value = record[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.length <= MaxIdentityLength
  )
}

function parseDetails(value: unknown): IOllamaModelDetails | undefined {
  if (!isJsonObject(value)) {
    return undefined
  }
  return {
    parentModel: optionalString(value, 'parent_model'),
    format: optionalString(value, 'format'),
    family: optionalString(value, 'family'),
    families: optionalStringArray(value, 'families'),
    parameterSize: optionalString(value, 'parameter_size'),
    quantizationLevel: optionalString(value, 'quantization_level'),
    metadata: sanitizeJsonObject(value),
  }
}

function parseModel(value: unknown): IOllamaModel | undefined {
  if (!isJsonObject(value)) {
    return undefined
  }
  const name = optionalString(value, 'name', MaxIdentityLength)
  const model = optionalString(value, 'model', MaxIdentityLength)
  const identity = name ?? model
  if (identity === undefined || identity.trim().length === 0) {
    return undefined
  }

  return {
    name: name ?? identity,
    model: model ?? identity,
    modifiedAt: optionalString(value, 'modified_at'),
    size: optionalNonNegativeNumber(value, 'size'),
    digest: optionalString(value, 'digest'),
    details: parseDetails(value.details),
    metadata: sanitizeJsonObject(value),
  }
}

function requireModels(value: unknown): ReadonlyArray<unknown> {
  if (!isJsonObject(value) || !Array.isArray(value.models)) {
    throw malformedResponse('Ollama returned a malformed model list.')
  }
  return value.models
}

export function parseVersionResponse(value: unknown): IOllamaVersion {
  if (!isJsonObject(value)) {
    throw malformedResponse('Ollama returned a malformed version response.')
  }
  const version = optionalString(value, 'version', 256)
  if (version === undefined || version.trim().length === 0) {
    throw malformedResponse('Ollama returned a malformed version response.')
  }
  return { version, metadata: sanitizeJsonObject(value) }
}

export function parseModelsResponse(
  value: unknown
): ReadonlyArray<IOllamaModel> {
  const models = new Array<IOllamaModel>()
  for (const entry of requireModels(value)) {
    const model = parseModel(entry)
    if (model !== undefined) {
      models.push(model)
    }
  }
  return models
}

export function parseRunningModelsResponse(
  value: unknown
): ReadonlyArray<IOllamaRunningModel> {
  const models = new Array<IOllamaRunningModel>()
  for (const entry of requireModels(value)) {
    const model = parseModel(entry)
    if (model === undefined || !isJsonObject(entry)) {
      continue
    }
    models.push({
      ...model,
      expiresAt: optionalString(entry, 'expires_at'),
      sizeVram: optionalNonNegativeNumber(entry, 'size_vram'),
      contextLength: optionalNonNegativeNumber(entry, 'context_length'),
    })
  }
  return models
}

export function parseShowResponse(value: unknown): IOllamaModelInfo {
  if (!isJsonObject(value) || Object.keys(value).length === 0) {
    throw malformedResponse('Ollama returned malformed model information.')
  }
  return {
    modelfile: optionalString(value, 'modelfile'),
    parameters: optionalString(value, 'parameters'),
    template: optionalString(value, 'template'),
    system: optionalString(value, 'system'),
    license: optionalString(value, 'license'),
    modifiedAt: optionalString(value, 'modified_at'),
    capabilities: optionalStringArray(value, 'capabilities'),
    details: parseDetails(value.details),
    modelInfo: isJsonObject(value.model_info)
      ? sanitizeJsonObject(value.model_info)
      : undefined,
    projectorInfo: isJsonObject(value.projector_info)
      ? sanitizeJsonObject(value.projector_info)
      : undefined,
    metadata: sanitizeJsonObject(value),
  }
}

export function parsePullProgress(value: unknown): IOllamaPullProgress {
  if (!isJsonObject(value)) {
    throw malformedResponse('Ollama returned malformed pull progress.')
  }
  const status = optionalString(value, 'status', MaxIdentityLength)
  if (status === undefined || status.trim().length === 0) {
    throw malformedResponse('Ollama returned malformed pull progress.')
  }
  return {
    status,
    digest: optionalString(value, 'digest'),
    total: optionalNonNegativeNumber(value, 'total'),
    completed: optionalNonNegativeNumber(value, 'completed'),
    metadata: sanitizeJsonObject(value),
  }
}

export function validateGenerateResponse(value: unknown): void {
  if (!isJsonObject(value) || Object.keys(value).length === 0) {
    throw malformedResponse('Ollama returned a malformed generate response.')
  }
  if (value.done !== undefined && typeof value.done !== 'boolean') {
    throw malformedResponse('Ollama returned a malformed generate response.')
  }
}

export function getServerError(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined
  }
  const error = optionalString(value, 'error')
  return error !== undefined && error.trim().length > 0 ? error : undefined
}
