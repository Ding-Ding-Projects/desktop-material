import { createHash } from 'crypto'
import { lookup } from 'dns/promises'
import * as keytar from 'keytar'
import {
  HomeAssistantBooleanState,
  IHomeAssistantSettingsRequest,
  ISetHomeAssistantTokenRequest,
  IScheduledSettingsValue,
  MaxHomeAssistantTokenLength,
  normalizeHomeAssistantBaseURL,
  normalizeHomeAssistantEntityId,
  normalizeScheduledSettingsAPIEndpoint,
  parseScheduledSettingsAPIResponse,
} from '../models/scheduled-settings'

const ScheduledSettingsRequestTimeoutMs = 5_000
const MaxScheduledSettingsResponseLength = 64 * 1024
const HomeAssistantCredentialService = 'desktop-material-scheduled-settings'

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }
  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('::ffff:')
  )
}

/** Keep an arbitrary API source from turning the renderer into an SSRF proxy. */
async function assertPublicScheduledAPIEndpoint(
  endpoint: string
): Promise<void> {
  const hostname = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) =>
      address.includes(':') ? isPrivateIPv6(address) : isPrivateIPv4(address)
    )
  ) {
    throw new Error(
      'Scheduled settings API endpoint resolves to a private network.'
    )
  }
}

interface ICredentialVault {
  setPassword(service: string, account: string, password: string): Promise<void>
  getPassword(service: string, account: string): Promise<string | null>
  deletePassword(service: string, account: string): Promise<boolean>
}

function homeAssistantCredentialAccount(
  request: IHomeAssistantSettingsRequest
) {
  return createHash('sha256')
    .update(`${request.baseUrl}\u0000${request.entityId}`)
    .digest('hex')
}

function validateHomeAssistantRequest(request: IHomeAssistantSettingsRequest) {
  if (typeof request !== 'object' || request === null) {
    throw new Error('Home Assistant connection details are invalid.')
  }
  const baseUrl = normalizeHomeAssistantBaseURL(request.baseUrl)
  const entityId = normalizeHomeAssistantEntityId(request.entityId)
  if (baseUrl === null || entityId === null) {
    throw new Error('Home Assistant connection details are invalid.')
  }
  return { baseUrl, entityId }
}

async function readBoundedJSON(
  response: Response,
  failurePrefix: string
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MaxScheduledSettingsResponseLength) {
    throw new Error(`${failurePrefix} response is too large.`)
  }

  let body = ''
  if (response.body === null) {
    body = await response.text()
    if (body.length > MaxScheduledSettingsResponseLength) {
      throw new Error(`${failurePrefix} response is too large.`)
    }
  } else {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytesRead = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          body += decoder.decode()
          break
        }
        bytesRead += chunk.value.byteLength
        if (bytesRead > MaxScheduledSettingsResponseLength) {
          await reader.cancel()
          throw new Error(`${failurePrefix} response is too large.`)
        }
        body += decoder.decode(chunk.value, { stream: true })
        if (body.length > MaxScheduledSettingsResponseLength) {
          await reader.cancel()
          throw new Error(`${failurePrefix} response is too large.`)
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error(`${failurePrefix} response was not valid JSON.`)
  }
}

async function fetchJSON(
  url: string,
  headers: Record<string, string>,
  failurePrefix: string
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    ScheduledSettingsRequestTimeoutMs
  )
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      headers,
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        `${failurePrefix} request failed (HTTP ${response.status}).`
      )
    }
    return await readBoundedJSON(response, failurePrefix)
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchScheduledSettingsAPI(
  endpoint: string
): Promise<IScheduledSettingsValue> {
  const normalizedEndpoint = normalizeScheduledSettingsAPIEndpoint(endpoint)
  if (normalizedEndpoint === null) {
    throw new Error('Scheduled settings API endpoint is invalid.')
  }
  await assertPublicScheduledAPIEndpoint(normalizedEndpoint)

  const response = await fetchJSON(
    normalizedEndpoint,
    { Accept: 'application/json' },
    'Scheduled settings API'
  )
  const settings = parseScheduledSettingsAPIResponse(response)
  if (settings === null) {
    throw new Error('Scheduled settings API returned an invalid response.')
  }
  return settings
}

export async function setHomeAssistantToken(
  request: ISetHomeAssistantTokenRequest,
  vault: ICredentialVault = keytar
): Promise<void> {
  const normalized = validateHomeAssistantRequest(request)
  const token = typeof request.token === 'string' ? request.token.trim() : ''
  if (token.length > MaxHomeAssistantTokenLength) {
    throw new Error('Home Assistant token is too long.')
  }

  const account = homeAssistantCredentialAccount(normalized)
  if (token.length === 0) {
    await vault.deletePassword(HomeAssistantCredentialService, account)
    return
  }
  await vault.setPassword(HomeAssistantCredentialService, account, token)
}

export async function fetchHomeAssistantState(
  request: IHomeAssistantSettingsRequest,
  vault: ICredentialVault = keytar
): Promise<HomeAssistantBooleanState> {
  const normalized = validateHomeAssistantRequest(request)
  const account = homeAssistantCredentialAccount(normalized)
  const token = await vault.getPassword(HomeAssistantCredentialService, account)
  if (token === null || token.length === 0) {
    throw new Error('Home Assistant token is not configured.')
  }

  const entityPath = encodeURIComponent(normalized.entityId)
  const response = await fetchJSON(
    `${normalized.baseUrl}/api/states/${entityPath}`,
    {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-store',
    },
    'Home Assistant'
  )
  if (
    typeof response !== 'object' ||
    response === null ||
    !('state' in response) ||
    (response.state !== 'on' && response.state !== 'off')
  ) {
    throw new Error('Home Assistant returned a non-boolean entity state.')
  }
  if ('entity_id' in response && response.entity_id !== normalized.entityId) {
    throw new Error('Home Assistant returned a different entity state.')
  }
  return response.state
}
