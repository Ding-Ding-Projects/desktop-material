import { OllamaClientError } from './types'

const MaxEndpointLength = 2_048

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  if (normalized === 'localhost') {
    return true
  }

  // URL.hostname includes brackets around IPv6 literals in some runtimes.
  if (normalized === '::1' || normalized === '[::1]') {
    return true
  }

  const octets = normalized.split('.')
  if (octets.length !== 4 || octets[0] !== '127') {
    return false
  }

  return octets.every(octet => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false
    }
    const value = Number(octet)
    return value >= 0 && value <= 255
  })
}

function normalizeBasePath(pathname: string): string {
  let path = pathname.replace(/\/+$/, '')

  // Copilot uses Ollama's OpenAI-compatible `/v1` base while the model
  // manager uses the native `/api` routes. Also accept an already-native
  // `/api` base so callers do not accidentally produce `/api/api/...`.
  let removedSuffix = true
  while (removedSuffix) {
    removedSuffix = false
    for (const suffix of ['/v1', '/api']) {
      if (path.endsWith(suffix)) {
        path = path.slice(0, -suffix.length).replace(/\/+$/, '')
        removedSuffix = true
      }
    }
  }

  return path
}

/**
 * Validates and canonicalizes an Ollama base URL for native API requests.
 * Plain HTTP is restricted to the local machine; remote endpoints require
 * HTTPS. URL credentials are rejected instead of risking disclosure.
 */
export function normalizeOllamaEndpoint(value: string): string {
  const candidate = value.trim()
  if (candidate.length === 0 || candidate.length > MaxEndpointLength) {
    throw new OllamaClientError('endpoint', 'The Ollama endpoint is invalid.')
  }

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new OllamaClientError('endpoint', 'The Ollama endpoint is invalid.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OllamaClientError(
      'endpoint',
      'The Ollama endpoint must use HTTP or HTTPS.'
    )
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new OllamaClientError(
      'endpoint',
      'The Ollama endpoint must not contain URL credentials.'
    )
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new OllamaClientError(
      'endpoint',
      'The Ollama endpoint must not contain a query or fragment.'
    )
  }
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new OllamaClientError(
      'endpoint',
      'Plain HTTP Ollama endpoints must use a loopback address.'
    )
  }

  const path = normalizeBasePath(parsed.pathname)
  return `${parsed.origin}${path}`
}

/** Returns whether a configured endpoint meets the native client trust rules. */
export function isTrustedOllamaEndpoint(value: string): boolean {
  try {
    normalizeOllamaEndpoint(value)
    return true
  } catch {
    return false
  }
}

export function getOllamaApiUrl(endpoint: string, operation: string): string {
  return `${endpoint}/api/${operation}`
}
