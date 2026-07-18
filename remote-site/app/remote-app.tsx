'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Surface = 'repositories' | 'clone' | 'security' | 'connect'
type CredentialKind = 'device' | 'bearer' | 'none'
type ConnectionPhase =
  | 'idle'
  | 'probing'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'revoked'
  | 'error'

type JsonRecord = Record<string, unknown>

interface RemoteAppProps {
  readonly initialSurface?: 'connect'
}

interface AgentRepository {
  readonly key: string
  readonly id: number | null
  readonly name: string
  readonly path: string
  readonly missing: boolean
  readonly cloning: boolean
  readonly fullName: string | null
  readonly url: string | null
}

interface RepositoryStatus {
  readonly branch: string | null
  readonly changedFiles: number
  readonly ahead: number
  readonly behind: number
  readonly syncing: boolean
  readonly committing: boolean
}

interface PairedDevice {
  readonly id: string
  readonly name: string
  readonly current: boolean
  readonly revoked: boolean
  readonly lastSeen: string | null
}

interface SSHHost {
  readonly id: string
  readonly label: string
  readonly address: string
  readonly available: boolean
}

interface ActiveConnection {
  readonly baseUrl: string
  readonly token: string | null
  readonly credentialKind: CredentialKind
  readonly commands: ReadonlySet<string>
  readonly remoteStatus: JsonRecord | null
  readonly device: PairedDevice | null
  readonly yolo: boolean
}

interface PairingInvitation {
  readonly code: string
  readonly agent: string | null
}

interface BarcodeResult {
  readonly rawValue: string
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<ReadonlyArray<BarcodeResult>>
}

interface BarcodeDetectorConstructor {
  new (options: { formats: ReadonlyArray<string> }): BarcodeDetectorLike
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor
  }
}

const DEFAULT_AGENT_BASE = '/api/v1'
const DEVICE_TOKEN_KEY = 'desktop-material-remote.device-token.v1'
const SESSION_CONNECTION_KEY = 'desktop-material-remote.session-connection.v1'
const REQUEST_TIMEOUT_MS = 25_000

class RemoteRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly code: string | null = null
  ) {
    super(message)
    this.name = 'RemoteRequestError'
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function unwrapEnvelope(value: unknown): unknown {
  const record = asRecord(value)
  if (record === null) return value
  if (record.ok === false) {
    const error = asRecord(record.error)
    throw new RemoteRequestError(
      stringValue(error?.message) ?? 'Desktop Material rejected the request.',
      null,
      stringValue(error?.code)
    )
  }
  return record.ok === true && 'data' in record ? record.data : value
}

function getErrorDetails(value: unknown): {
  readonly message: string | null
  readonly code: string | null
} {
  const record = asRecord(value)
  const nested = asRecord(record?.error)
  return {
    message:
      stringValue(nested?.message) ?? stringValue(record?.message) ?? null,
    code: stringValue(nested?.code) ?? stringValue(record?.code) ?? null,
  }
}

function apiUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  if (cleanBase.startsWith('/')) return `${cleanBase}/${cleanPath}`
  return `${cleanBase}/${cleanPath}`
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'DELETE'
    readonly token?: string | null
    readonly body?: JsonRecord
  } = {}
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  )
  try {
    const headers = new Headers({ Accept: 'application/json' })
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetch(apiUrl(baseUrl, path), {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new RemoteRequestError(
          'The agent returned a response this app could not read.',
          response.status,
          'invalid_json'
        )
      }
    }
    if (!response.ok) {
      const details = getErrorDetails(parsed)
      throw new RemoteRequestError(
        details.message ?? `The agent returned HTTP ${response.status}.`,
        response.status,
        details.code
      )
    }
    return parsed
  } catch (error) {
    if (error instanceof RemoteRequestError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RemoteRequestError(
        'The agent did not respond in time. Check the private gateway and try again.',
        null,
        'timeout'
      )
    }
    throw new RemoteRequestError(
      navigator.onLine
        ? 'The agent could not be reached. Check HTTPS, gateway routing, and the allowed site origin.'
        : 'This device is offline. Reconnect to a network and try again.',
      null,
      'network_error'
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

async function executeAgentCommand(
  connection: Pick<ActiveConnection, 'baseUrl' | 'token'>,
  command: string,
  args: JsonRecord
): Promise<unknown> {
  try {
    const result = await requestJson(connection.baseUrl, 'commands', {
      method: 'POST',
      token: connection.token,
      body: { name: command, args },
    })
    return unwrapEnvelope(result)
  } catch (error) {
    if (
      error instanceof RemoteRequestError &&
      (error.status === 404 || error.status === 405)
    ) {
      const legacyResult = await requestJson(
        connection.baseUrl,
        `command/${encodeURIComponent(command)}`,
        {
          method: 'POST',
          token: connection.token,
          body: args,
        }
      )
      return unwrapEnvelope(legacyResult)
    }
    throw error
  }
}

function parseCommands(info: unknown, remoteStatus: JsonRecord | null) {
  const values: unknown[] = []
  const infoRecord = asRecord(unwrapEnvelope(info))
  if (Array.isArray(infoRecord?.commands)) values.push(...infoRecord.commands)
  if (Array.isArray(infoRecord?.tools)) values.push(...infoRecord.tools)
  if (Array.isArray(remoteStatus?.commands)) {
    values.push(...remoteStatus.commands)
  }
  return new Set(
    values.flatMap(value => {
      if (typeof value === 'string') return [value]
      const name = stringValue(asRecord(value)?.name)
      return name === null ? [] : [name]
    })
  )
}

function parseRepository(
  value: unknown,
  index: number
): AgentRepository | null {
  const record = asRecord(value)
  if (record === null) return null
  const path = stringValue(record.path) ?? ''
  const github = asRecord(record.github)
  const name =
    stringValue(record.name) ??
    stringValue(github?.name) ??
    (path.split(/[\\/]/).filter(Boolean).at(-1) || `Repository ${index + 1}`)
  const id =
    typeof record.id === 'number' && Number.isSafeInteger(record.id)
      ? record.id
      : null
  return {
    key: id === null ? path || `${name}-${index}` : String(id),
    id,
    name,
    path,
    missing: booleanValue(record.missing),
    cloning: booleanValue(record.cloning),
    fullName: stringValue(github?.fullName),
    url: stringValue(github?.url),
  }
}

function parseRepositories(value: unknown): AgentRepository[] {
  const unwrapped = unwrapEnvelope(value)
  const record = asRecord(unwrapped)
  const list = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(record?.repositories)
    ? record.repositories
    : []
  return list
    .map(parseRepository)
    .filter((repository): repository is AgentRepository => repository !== null)
}

function parseStatus(value: unknown): RepositoryStatus {
  const record = asRecord(unwrapEnvelope(value)) ?? {}
  const aheadBehind = asRecord(record.aheadBehind)
  const busy = asRecord(record.busy)
  return {
    branch: stringValue(record.branch),
    changedFiles: numberValue(record.changedFiles),
    ahead: numberValue(aheadBehind?.ahead),
    behind: numberValue(aheadBehind?.behind),
    syncing: booleanValue(busy?.sync),
    committing: booleanValue(busy?.commit),
  }
}

function parseDevice(value: unknown, fallbackIndex = 0): PairedDevice | null {
  const record = asRecord(value)
  if (record === null) return null
  const id =
    stringValue(record.id) ??
    stringValue(record.deviceId) ??
    stringValue(record.key)
  if (id === null) return null
  return {
    id,
    name:
      stringValue(record.name) ??
      stringValue(record.deviceName) ??
      `Device ${fallbackIndex + 1}`,
    current: booleanValue(record.current) || booleanValue(record.isCurrent),
    revoked: booleanValue(record.revoked),
    lastSeen:
      stringValue(record.lastSeen) ?? stringValue(record.lastSeenAt) ?? null,
  }
}

function parseDevices(value: unknown): PairedDevice[] {
  const unwrapped = unwrapEnvelope(value)
  const record = asRecord(unwrapped)
  const list = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(record?.devices)
    ? record.devices
    : []
  return list
    .map(parseDevice)
    .filter((device): device is PairedDevice => device !== null)
}

function parseSSHHosts(value: unknown): SSHHost[] {
  const unwrapped = unwrapEnvelope(value)
  const record = asRecord(unwrapped)
  const list = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(record?.hosts)
    ? record.hosts
    : []
  return list.flatMap((value, index) => {
    const host = asRecord(value)
    if (host === null) return []
    const id =
      stringValue(host.id) ??
      stringValue(host.hostId) ??
      stringValue(host.alias) ??
      stringValue(host.hostname)
    if (id === null) return []
    const address =
      stringValue(host.hostname) ?? stringValue(host.address) ?? id
    return [
      {
        id,
        label:
          stringValue(host.name) ??
          stringValue(host.alias) ??
          `SSH host ${index + 1}`,
        address,
        available: host.available !== false && host.online !== false,
      },
    ]
  })
}

function parseRemoteStatus(value: unknown): JsonRecord | null {
  return asRecord(unwrapEnvelope(value))
}

function isYoloMode(status: JsonRecord | null): boolean {
  if (status === null) return false
  const mode = (
    stringValue(status.mode) ??
    stringValue(status.authMode) ??
    stringValue(status.lanMode) ??
    ''
  ).toLowerCase()
  return (
    booleanValue(status.yolo) ||
    booleanValue(status.yoloLan) ||
    status.authenticationRequired === false ||
    mode.includes('yolo') ||
    mode.includes('unsafe') ||
    mode === 'open'
  )
}

function deviceFromStatus(status: JsonRecord | null): PairedDevice | null {
  return (
    parseDevice(status?.device) ?? parseDevice(status?.pairedDevice) ?? null
  )
}

function extractPairResult(value: unknown): {
  readonly token: string | null
  readonly device: PairedDevice | null
} {
  const record = asRecord(unwrapEnvelope(value))
  const nested = asRecord(record?.device)
  return {
    token:
      stringValue(record?.deviceToken) ??
      stringValue(record?.token) ??
      stringValue(nested?.deviceToken) ??
      stringValue(nested?.token),
    device: parseDevice(record?.device) ?? parseDevice(record),
  }
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === DEFAULT_AGENT_BASE) {
    return DEFAULT_AGENT_BASE
  }
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '')
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new RemoteRequestError(
      'Enter a complete HTTPS endpoint, such as https://remote.example.com/api/v1.'
    )
  }
  if (url.username || url.password) {
    throw new RemoteRequestError('Do not put credentials in the endpoint URL.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RemoteRequestError('The endpoint must use HTTPS or HTTP.')
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (url.pathname.endsWith('/mcp')) {
    url.pathname = `${url.pathname.slice(0, -4)}/api/v1`
  } else if (!url.pathname.endsWith('/api/v1')) {
    url.pathname = `${url.pathname}/api/v1`.replace(/\/+/g, '/')
  }
  return url.toString().replace(/\/$/, '')
}

function pairingInvitationFromValue(value: string): PairingInvitation | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  try {
    const url = new URL(trimmed)
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
    const code = fragment.get('pair')
    if (code) {
      return { code, agent: fragment.get('agent') }
    }
  } catch {
    // A manually entered one-time code is valid without being a URL.
  }
  return { code: trimmed, agent: null }
}

function pairingInvitationFromLocation(): PairingInvitation | null {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = fragment.get('pair')
  if (!code) return null
  const invitation = { code, agent: fragment.get('agent') }
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  )
  return invitation
}

function repositorySelector(repository: AgentRepository): JsonRecord {
  return repository.id === null
    ? { path: repository.path }
    : { repositoryId: repository.id }
}

function friendlyError(error: unknown): string {
  if (!(error instanceof RemoteRequestError)) {
    return error instanceof Error ? error.message : 'Something went wrong.'
  }
  if (error.status === 401) {
    return 'This credential is no longer accepted. Pair this browser again or enter a fresh token.'
  }
  if (error.status === 403) {
    return 'The gateway refused this browser. Verify the paired device, gateway Host rewrite, and allowed origin.'
  }
  if (error.status === 404) {
    return 'This Desktop Material version does not advertise that remote feature.'
  }
  return error.message
}

function isRevocationError(error: unknown): boolean {
  return (
    error instanceof RemoteRequestError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code?.toLowerCase().includes('revok') === true)
  )
}

function formatLastSeen(value: string | null): string {
  if (value === null) return 'No activity reported'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function defaultDeviceName(): string {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  return mobile ? 'My phone' : 'My browser'
}

export function RemoteApp({ initialSurface }: RemoteAppProps) {
  const [phase, setPhase] = useState<ConnectionPhase>('probing')
  const [surface, setSurface] = useState<Surface>(
    initialSurface ?? 'repositories'
  )
  const [connection, setConnection] = useState<ActiveConnection | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<JsonRecord | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [yoloAcknowledged, setYoloAcknowledged] = useState(false)

  const [pairCode, setPairCode] = useState('')
  const [pairingAgent, setPairingAgent] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('This device')
  const [stayLoggedIn, setStayLoggedIn] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [endpoint, setEndpoint] = useState(DEFAULT_AGENT_BASE)
  const [bearerToken, setBearerToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [rememberTab, setRememberTab] = useState(false)

  const [repositories, setRepositories] = useState<AgentRepository[]>([])
  const [repositoriesLoading, setRepositoriesLoading] = useState(false)
  const [repositoryFilter, setRepositoryFilter] = useState('')
  const [selectedRepositoryKey, setSelectedRepositoryKey] = useState<
    string | null
  >(null)
  const [statuses, setStatuses] = useState<Record<string, RepositoryStatus>>({})
  const [statusLoading, setStatusLoading] = useState<string | null>(null)
  const [busyCommand, setBusyCommand] = useState<string | null>(null)
  const [pendingCommand, setPendingCommand] = useState<{
    readonly name: 'pull' | 'push'
    readonly repository: AgentRepository
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [cloneUrl, setCloneUrl] = useState('')
  const [clonePath, setClonePath] = useState('')
  const [cloneBranch, setCloneBranch] = useState('')
  const [cloneMode, setCloneMode] = useState<'local' | 'ssh'>('local')
  const [sshHosts, setSSHHosts] = useState<SSHHost[]>([])
  const [sshHostsLoading, setSSHHostsLoading] = useState(false)
  const [selectedSSHHost, setSelectedSSHHost] = useState('')

  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)

  const markRevoked = useCallback((message: string) => {
    window.localStorage.removeItem(DEVICE_TOKEN_KEY)
    window.sessionStorage.removeItem(SESSION_CONNECTION_KEY)
    setConnection(null)
    setRepositories([])
    setStatuses({})
    setConnectionError(message)
    setPhase('revoked')
    setSurface('connect')
  }, [])

  const establishConnection = useCallback(
    async (options: {
      readonly baseUrl: string
      readonly token: string | null
      readonly credentialKind: CredentialKind
      readonly rememberedDevice?: boolean
      readonly pairedDevice?: PairedDevice | null
    }) => {
      setPhase('connecting')
      setConnectionError(null)
      try {
        const [info, statusResult] = await Promise.all([
          requestJson(options.baseUrl, 'info', { token: options.token }),
          requestJson(options.baseUrl, 'remote/status', {
            token: options.token,
          }).catch(error => {
            if (
              error instanceof RemoteRequestError &&
              (error.status === 404 || error.status === 401)
            ) {
              return null
            }
            throw error
          }),
        ])
        const status = parseRemoteStatus(statusResult)
        const commands = parseCommands(info, status)
        const yolo = isYoloMode(status)
        if (!commands.has('list-repositories')) {
          throw new RemoteRequestError(
            'The endpoint connected, but it does not advertise repository discovery.',
            null,
            'missing_command'
          )
        }
        const active: ActiveConnection = {
          baseUrl: options.baseUrl,
          token: options.token,
          credentialKind: options.credentialKind,
          commands,
          remoteStatus: status,
          device: options.pairedDevice ?? deviceFromStatus(status),
          yolo,
        }
        const repositoryResult = await executeAgentCommand(
          active,
          'list-repositories',
          {}
        )
        const nextRepositories = parseRepositories(repositoryResult)
        setRemoteStatus(status)
        setConnection(active)
        setRepositories(nextRepositories)
        setSelectedRepositoryKey(nextRepositories[0]?.key ?? null)
        setPhase('connected')
        setSurface('repositories')
        setConnectionError(null)
        if (options.rememberedDevice) {
          setNotice('Welcome back. This paired device is still authorized.')
        }
        if (nextRepositories[0] !== undefined && commands.has('get-status')) {
          const repository = nextRepositories[0]
          const statusValue = await executeAgentCommand(
            active,
            'get-status',
            repositorySelector(repository)
          )
          setStatuses({ [repository.key]: parseStatus(statusValue) })
        }
      } catch (error) {
        const message = friendlyError(error)
        if (options.credentialKind === 'device' && isRevocationError(error)) {
          markRevoked(message)
          return
        }
        setConnection(null)
        setConnectionError(message)
        setPhase('error')
      }
    },
    [markRevoked]
  )

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const initialStateTimer = window.setTimeout(() => {
      setOnline(navigator.onLine)
      setDeviceName(defaultDeviceName())

      const invitation = pairingInvitationFromLocation()
      if (invitation !== null) {
        setPairCode(invitation.code)
        setPairingAgent(invitation.agent)
        setSurface('connect')
      }

      const rememberedDevice = window.localStorage.getItem(DEVICE_TOKEN_KEY)
      if (rememberedDevice) {
        let rememberedToken = rememberedDevice
        let rememberedBaseUrl = DEFAULT_AGENT_BASE
        let rememberedIdentity: PairedDevice | null = null
        try {
          const parsed = asRecord(JSON.parse(rememberedDevice))
          rememberedToken = stringValue(parsed?.token) ?? rememberedDevice
          rememberedBaseUrl = stringValue(parsed?.baseUrl) ?? DEFAULT_AGENT_BASE
          rememberedIdentity = parseDevice(parsed?.device)
        } catch {
          // Older builds stored a token-only value. Keep that pairing usable.
        }
        void establishConnection({
          baseUrl: rememberedBaseUrl,
          token: rememberedToken,
          credentialKind: 'device',
          rememberedDevice: true,
          pairedDevice: rememberedIdentity,
        })
      } else {
        const sessionValue = window.sessionStorage.getItem(
          SESSION_CONNECTION_KEY
        )
        if (sessionValue) {
          try {
            const parsed = asRecord(JSON.parse(sessionValue))
            const sessionToken = stringValue(parsed?.token)
            const sessionBase = stringValue(parsed?.baseUrl)
            if (sessionToken && sessionBase) {
              void establishConnection({
                baseUrl: sessionBase,
                token: sessionToken,
                credentialKind: 'bearer',
              })
            } else {
              window.sessionStorage.removeItem(SESSION_CONNECTION_KEY)
              setPhase('idle')
            }
          } catch {
            window.sessionStorage.removeItem(SESSION_CONNECTION_KEY)
            setPhase('idle')
          }
        } else {
          void requestJson(DEFAULT_AGENT_BASE, 'remote/status')
            .then(value => {
              const status = parseRemoteStatus(value)
              setRemoteStatus(status)
              setPhase('idle')
            })
            .catch(() => setPhase('idle'))
        }
      }
    }, 0)

    return () => {
      window.clearTimeout(initialStateTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [establishConnection])

  useEffect(() => {
    if (!scannerOpen) return
    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    let videoElement: HTMLVideoElement | null = null

    async function startScanner() {
      setScannerError(null)
      if (!window.BarcodeDetector) {
        setScannerError(
          'This browser does not support live QR scanning. Paste the pairing link instead.'
        )
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerError(
          'Camera access is unavailable. Paste the pairing link instead.'
        )
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled || videoRef.current === null) return
        const video = videoRef.current
        videoElement = video
        video.srcObject = stream
        await video.play()
        const detector = new window.BarcodeDetector!({ formats: ['qr_code'] })
        const inspect = async () => {
          if (cancelled) return
          try {
            const results = await detector.detect(video)
            const invitation = results[0]
              ? pairingInvitationFromValue(results[0].rawValue)
              : null
            if (invitation) {
              setPairCode(invitation.code)
              setPairingAgent(invitation.agent)
              setScannerOpen(false)
              setNotice('Pairing QR read. Confirm the device name to continue.')
              return
            }
          } catch {
            // A frame can be unreadable while the camera is moving; keep scanning.
          }
          frame = window.requestAnimationFrame(() => void inspect())
        }
        frame = window.requestAnimationFrame(() => void inspect())
      } catch {
        setScannerError(
          'Camera permission was not granted. Paste the one-time pairing link instead.'
        )
      }
    }

    void startScanner()
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
      if (videoElement) videoElement.srcObject = null
    }
  }, [scannerOpen])

  useEffect(() => {
    if (notice === null) return
    const timeout = window.setTimeout(() => setNotice(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const selectedRepository = useMemo(
    () =>
      repositories.find(
        repository => repository.key === selectedRepositoryKey
      ) ?? null,
    [repositories, selectedRepositoryKey]
  )

  const filteredRepositories = useMemo(() => {
    const filter = repositoryFilter.trim().toLowerCase()
    if (!filter) return repositories
    return repositories.filter(repository =>
      [repository.name, repository.fullName, repository.path]
        .filter((value): value is string => value !== null)
        .some(value => value.toLowerCase().includes(filter))
    )
  }, [repositories, repositoryFilter])

  const supportsSSH =
    connection?.commands.has('list-ssh-hosts') === true &&
    connection.commands.has('clone-to-ssh') === true

  const handleConnectedError = useCallback(
    (error: unknown) => {
      const message = friendlyError(error)
      if (connection?.credentialKind === 'device' && isRevocationError(error)) {
        markRevoked(message)
      } else {
        setNotice(message)
      }
    },
    [connection?.credentialKind, markRevoked]
  )

  const refreshRepositories = useCallback(async () => {
    if (!connection || !online) return
    setRepositoriesLoading(true)
    try {
      const value = await executeAgentCommand(
        connection,
        'list-repositories',
        {}
      )
      const next = parseRepositories(value)
      setRepositories(next)
      setSelectedRepositoryKey(current =>
        next.some(repository => repository.key === current)
          ? current
          : next[0]?.key ?? null
      )
    } catch (error) {
      handleConnectedError(error)
    } finally {
      setRepositoriesLoading(false)
    }
  }, [connection, handleConnectedError, online])

  const loadRepositoryStatus = useCallback(
    async (repository: AgentRepository) => {
      if (!connection || !connection.commands.has('get-status') || !online) {
        return
      }
      setSelectedRepositoryKey(repository.key)
      setStatusLoading(repository.key)
      try {
        const value = await executeAgentCommand(
          connection,
          'get-status',
          repositorySelector(repository)
        )
        setStatuses(current => ({
          ...current,
          [repository.key]: parseStatus(value),
        }))
      } catch (error) {
        handleConnectedError(error)
      } finally {
        setStatusLoading(null)
      }
    },
    [connection, handleConnectedError, online]
  )

  const runRepositoryCommand = useCallback(
    async (name: 'fetch' | 'pull' | 'push', repository: AgentRepository) => {
      if (!connection || !online || busyCommand !== null) return
      setBusyCommand(`${name}:${repository.key}`)
      setPendingCommand(null)
      try {
        await executeAgentCommand(
          connection,
          name,
          repositorySelector(repository)
        )
        setNotice(
          `${name[0].toUpperCase()}${name.slice(1)} completed for ${
            repository.name
          }.`
        )
        if (connection.commands.has('get-status')) {
          const value = await executeAgentCommand(
            connection,
            'get-status',
            repositorySelector(repository)
          )
          setStatuses(current => ({
            ...current,
            [repository.key]: parseStatus(value),
          }))
        }
      } catch (error) {
        handleConnectedError(error)
      } finally {
        setBusyCommand(null)
      }
    },
    [busyCommand, connection, handleConnectedError, online]
  )

  const onPairSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const invitation = pairingInvitationFromValue(pairCode)
    if (!invitation) {
      setConnectionError('Scan or enter a one-time pairing code.')
      return
    }
    setPhase('pairing')
    setConnectionError(null)
    try {
      const advertisedAgent = invitation.agent ?? pairingAgent
      const invitationBase = advertisedAgent
        ? normalizeEndpoint(advertisedAgent)
        : DEFAULT_AGENT_BASE
      const candidateBases = [...new Set([invitationBase, DEFAULT_AGENT_BASE])]
      let value: unknown = null
      let pairedBase = candidateBases[0]
      let lastPairError: unknown = null
      for (const baseUrl of candidateBases) {
        try {
          value = await requestJson(baseUrl, 'remote/pair', {
            method: 'POST',
            body: {
              code: invitation.code,
              deviceName: deviceName.trim() || defaultDeviceName(),
              ...(stayLoggedIn ? { stayLoggedIn: true } : {}),
            },
          })
          pairedBase = baseUrl
          lastPairError = null
          break
        } catch (error) {
          lastPairError = error
          if (
            !(error instanceof RemoteRequestError) ||
            (error.status !== null &&
              error.status !== 403 &&
              error.status !== 404 &&
              error.status !== 405)
          ) {
            break
          }
        }
      }
      if (lastPairError !== null) throw lastPairError
      const result = extractPairResult(value)
      if (!result.token) {
        throw new RemoteRequestError(
          'Pairing succeeded without a usable device credential.',
          null,
          'missing_device_token'
        )
      }
      if (stayLoggedIn) {
        window.localStorage.setItem(
          DEVICE_TOKEN_KEY,
          JSON.stringify({
            token: result.token,
            baseUrl: pairedBase,
            device: result.device,
          })
        )
      } else {
        window.localStorage.removeItem(DEVICE_TOKEN_KEY)
      }
      setPairCode('')
      setPairingAgent(null)
      await establishConnection({
        baseUrl: pairedBase,
        token: result.token,
        credentialKind: 'device',
        pairedDevice: result.device,
      })
    } catch (error) {
      setConnectionError(friendlyError(error))
      setPhase('error')
    }
  }

  const onLegacyConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const baseUrl = normalizeEndpoint(endpoint)
      const token = bearerToken.trim()
      if (!token) {
        throw new RemoteRequestError(
          'Enter the bearer token from Agent access.'
        )
      }
      if (rememberTab) {
        window.sessionStorage.setItem(
          SESSION_CONNECTION_KEY,
          JSON.stringify({ baseUrl, token })
        )
      } else {
        window.sessionStorage.removeItem(SESSION_CONNECTION_KEY)
      }
      await establishConnection({
        baseUrl,
        token,
        credentialKind: 'bearer',
      })
      setBearerToken('')
    } catch (error) {
      setConnectionError(friendlyError(error))
      setPhase('error')
    }
  }

  const continueInYoloMode = async () => {
    setYoloAcknowledged(true)
    await establishConnection({
      baseUrl: DEFAULT_AGENT_BASE,
      token: null,
      credentialKind: 'none',
    })
  }

  const signOut = () => {
    window.localStorage.removeItem(DEVICE_TOKEN_KEY)
    window.sessionStorage.removeItem(SESSION_CONNECTION_KEY)
    setConnection(null)
    setRepositories([])
    setStatuses({})
    setDevices([])
    setBearerToken('')
    setPhase('idle')
    setSurface('connect')
    setNotice('Signed out on this browser.')
  }

  const onCloneSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!connection || !online || busyCommand !== null) return
    setBusyCommand('clone')
    try {
      const branch = cloneBranch.trim()
      if (cloneMode === 'ssh') {
        if (!supportsSSH) {
          throw new RemoteRequestError(
            'This agent does not advertise clone-to-SSH support.'
          )
        }
        if (!selectedSSHHost) {
          throw new RemoteRequestError('Choose an SSH host.')
        }
        await executeAgentCommand(connection, 'clone-to-ssh', {
          hostId: selectedSSHHost,
          url: cloneUrl.trim(),
          path: clonePath.trim(),
          ...(branch ? { branch } : {}),
        })
        setNotice('The clone was sent to the selected SSH host.')
      } else {
        await executeAgentCommand(connection, 'clone', {
          url: cloneUrl.trim(),
          path: clonePath.trim(),
          ...(branch ? { branch } : {}),
        })
        setNotice('Clone completed on the Desktop Material machine.')
        await refreshRepositories()
      }
      setCloneUrl('')
      setClonePath('')
      setCloneBranch('')
    } catch (error) {
      handleConnectedError(error)
    } finally {
      setBusyCommand(null)
    }
  }

  const loadSSHHosts = useCallback(async () => {
    if (!connection || !supportsSSH || sshHostsLoading) return
    setSSHHostsLoading(true)
    try {
      const value = await executeAgentCommand(connection, 'list-ssh-hosts', {})
      const hosts = parseSSHHosts(value)
      setSSHHosts(hosts)
      setSelectedSSHHost(current => current || hosts[0]?.id || '')
    } catch (error) {
      handleConnectedError(error)
    } finally {
      setSSHHostsLoading(false)
    }
  }, [connection, handleConnectedError, sshHostsLoading, supportsSSH])

  const loadDevices = useCallback(async () => {
    if (
      !connection ||
      connection.credentialKind !== 'device' ||
      devicesLoading
    ) {
      return
    }
    setDevicesLoading(true)
    try {
      const value = await requestJson(connection.baseUrl, 'remote/devices', {
        token: connection.token,
      })
      setDevices(
        parseDevices(value).map(device =>
          connection.device?.id === device.id
            ? { ...device, current: true }
            : device
        )
      )
    } catch (error) {
      handleConnectedError(error)
    } finally {
      setDevicesLoading(false)
    }
  }, [connection, devicesLoading, handleConnectedError])

  const openSurface = (nextSurface: Surface) => {
    setSurface(nextSurface)
    if (nextSurface === 'clone' && supportsSSH && sshHosts.length === 0) {
      void loadSSHHosts()
    }
    if (
      nextSurface === 'security' &&
      connection?.credentialKind === 'device' &&
      devices.length === 0
    ) {
      void loadDevices()
    }
  }

  const revokeDevice = async (device: PairedDevice) => {
    if (!connection) return
    setBusyCommand(`revoke:${device.id}`)
    try {
      await requestJson(
        connection.baseUrl,
        `remote/devices/${encodeURIComponent(device.id)}`,
        { method: 'DELETE', token: connection.token }
      )
      if (device.current || connection.device?.id === device.id) {
        markRevoked(
          'This browser was revoked. Use a new one-time QR to pair again.'
        )
      } else {
        setDevices(current => current.filter(item => item.id !== device.id))
        setNotice(`${device.name} can no longer control Desktop Material.`)
      }
    } catch (error) {
      handleConnectedError(error)
    } finally {
      setBusyCommand(null)
    }
  }

  if (connection === null) {
    const yolo = isYoloMode(remoteStatus)
    return (
      <main className="connect-shell">
        <a className="skip-link" href="#connect-card">
          Skip to connection
        </a>
        <header className="connect-brand" aria-label="Desktop Material Remote">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>Desktop Material</strong>
            <small>Remote</small>
          </span>
        </header>

        {!online && (
          <div className="offline-banner" role="status">
            <span aria-hidden="true">↯</span>
            You&apos;re offline. Pairing and repository actions will resume when
            this device reconnects.
          </div>
        )}

        <section className="connect-layout">
          <div className="connect-copy">
            <span className="eyebrow">Private remote control</span>
            <h1>Your repositories, within reach.</h1>
            <p>
              Pair once with the Desktop Material agent, then check status, sync
              branches, and start clones from any touch-friendly browser.
            </p>
            <ol className="connection-steps" aria-label="Connection steps">
              <li>
                <span>1</span>
                Enable Remote access in Desktop Material.
              </li>
              <li>
                <span>2</span>
                Scan its one-time QR code here.
              </li>
              <li>
                <span>3</span>
                Approve this named device on the desktop.
              </li>
            </ol>
            <div className="privacy-note">
              <span className="privacy-icon" aria-hidden="true">
                ◈
              </span>
              <div>
                <strong>Secrets stay out of the site.</strong>
                <p>
                  Pairing codes live only in memory. SSH keys are never
                  requested. Device credentials are stored only when you choose
                  Stay logged in.
                </p>
              </div>
            </div>
          </div>

          <div className="connect-card" id="connect-card">
            <div className="connect-card-heading">
              <span className="tonal-icon" aria-hidden="true">
                ⌁
              </span>
              <div>
                <span className="eyebrow">Secure pairing</span>
                <h2>Connect this device</h2>
              </div>
            </div>

            {phase === 'probing' && (
              <div className="loading-state" role="status">
                <span className="spinner" aria-hidden="true" />
                Looking for the same-origin gateway…
              </div>
            )}

            {phase === 'revoked' && connectionError && (
              <div className="message-card error" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Device access was revoked</strong>
                  <p>{connectionError}</p>
                </div>
              </div>
            )}

            {phase === 'error' && connectionError && (
              <div className="message-card error" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Couldn&apos;t connect</strong>
                  <p>{connectionError}</p>
                </div>
              </div>
            )}

            {yolo && !yoloAcknowledged && (
              <div className="yolo-gate" role="alert">
                <span className="yolo-label">UNSAFE YOLO LAN MODE</span>
                <h3>No authentication. Full repository rights.</h3>
                <p>
                  Anyone who can reach this LAN endpoint can fetch, pull, push,
                  or clone without pairing. Use only on an isolated trusted
                  network and turn it off as soon as possible.
                </p>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void continueInYoloMode()}
                  disabled={!online || phase === 'connecting'}
                >
                  {phase === 'connecting'
                    ? 'Connecting…'
                    : 'I understand — continue with full access'}
                </button>
              </div>
            )}

            {!yolo && (
              <>
                <form className="pair-form" onSubmit={onPairSubmit}>
                  <label htmlFor="device-name">Device name</label>
                  <input
                    id="device-name"
                    value={deviceName}
                    onChange={event => setDeviceName(event.currentTarget.value)}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="My phone"
                  />

                  <label htmlFor="pair-code">
                    One-time pairing code or link
                  </label>
                  <div className="field-with-action">
                    <input
                      id="pair-code"
                      value={pairCode}
                      onChange={event => {
                        const invitation = pairingInvitationFromValue(
                          event.currentTarget.value
                        )
                        setPairCode(event.currentTarget.value)
                        if (invitation?.agent) setPairingAgent(invitation.agent)
                      }}
                      autoComplete="one-time-code"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Paste the QR link or one-time code"
                      required
                    />
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      aria-label="Scan pairing QR code"
                      title="Scan pairing QR code"
                    >
                      ▦
                    </button>
                  </div>
                  {pairingAgent && (
                    <p className="field-hint">
                      Invitation for <strong>{pairingAgent}</strong>. Pairing is
                      exchanged through this site&apos;s same-origin gateway.
                    </p>
                  )}

                  <label className="switch-row" htmlFor="stay-logged-in">
                    <span>
                      <strong>Stay logged in</strong>
                      <small>
                        Store only this device credential in this browser.
                      </small>
                    </span>
                    <input
                      id="stay-logged-in"
                      type="checkbox"
                      checked={stayLoggedIn}
                      onChange={event =>
                        setStayLoggedIn(event.currentTarget.checked)
                      }
                    />
                    <i aria-hidden="true" />
                  </label>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!online || phase === 'pairing'}
                  >
                    {phase === 'pairing' ? (
                      <>
                        <span className="spinner light" aria-hidden="true" />
                        Pairing…
                      </>
                    ) : (
                      <>
                        Pair this device <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                </form>

                <details className="legacy-connect">
                  <summary>Connect with an existing bearer token</summary>
                  <form onSubmit={onLegacyConnect}>
                    <p>
                      Compatibility mode for a trusted HTTPS tunnel. The token
                      remains in memory unless you choose this tab only.
                    </p>
                    <label htmlFor="agent-endpoint">Agent endpoint</label>
                    <input
                      id="agent-endpoint"
                      type="url"
                      inputMode="url"
                      value={endpoint}
                      onChange={event => setEndpoint(event.currentTarget.value)}
                      placeholder="https://remote.example.com/api/v1"
                    />
                    <label htmlFor="bearer-token">Bearer token</label>
                    <div className="field-with-action">
                      <input
                        id="bearer-token"
                        type={showToken ? 'text' : 'password'}
                        value={bearerToken}
                        onChange={event =>
                          setBearerToken(event.currentTarget.value)
                        }
                        autoComplete="off"
                        spellCheck={false}
                        required
                      />
                      <button
                        className="icon-button text-icon"
                        type="button"
                        onClick={() => setShowToken(current => !current)}
                        aria-label={
                          showToken ? 'Hide bearer token' : 'Show bearer token'
                        }
                      >
                        {showToken ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={rememberTab}
                        onChange={event =>
                          setRememberTab(event.currentTarget.checked)
                        }
                      />
                      Remember only until this browser tab closes
                    </label>
                    <button
                      className="secondary-button"
                      type="submit"
                      disabled={!online || phase === 'connecting'}
                    >
                      {phase === 'connecting'
                        ? 'Checking…'
                        : 'Connect endpoint'}
                    </button>
                  </form>
                </details>
              </>
            )}
          </div>
        </section>

        <section className="tunnel-guide" aria-labelledby="tunnel-title">
          <span className="tonal-icon small" aria-hidden="true">
            ↔
          </span>
          <div>
            <h2 id="tunnel-title">Use a private same-origin gateway</h2>
            <p>
              The supplied Docker gateway terminates HTTPS, forwards only
              <code>/api/v1/*</code>, removes cookies and browser Origin before
              the agent hop, and keeps access logging off. Never publish the raw
              loopback agent or put a token in a URL.
            </p>
          </div>
        </section>

        {scannerOpen && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="scanner-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scanner-title"
            >
              <div className="dialog-heading">
                <div>
                  <span className="eyebrow">Camera</span>
                  <h2 id="scanner-title">Scan pairing QR</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  aria-label="Close QR scanner"
                >
                  ×
                </button>
              </div>
              <div className="camera-frame">
                <video ref={videoRef} muted playsInline />
                <span className="scan-corners" aria-hidden="true" />
              </div>
              {scannerError ? (
                <p className="scanner-error" role="alert">
                  {scannerError}
                </p>
              ) : (
                <p>Point the camera at the QR shown by Desktop Material.</p>
              )}
            </section>
          </div>
        )}
      </main>
    )
  }

  const selectedStatus = selectedRepository
    ? statuses[selectedRepository.key]
    : undefined
  const commandBusy = busyCommand !== null

  const navigation = (
    <>
      <button
        type="button"
        className={surface === 'repositories' ? 'active' : ''}
        onClick={() => openSurface('repositories')}
        aria-current={surface === 'repositories' ? 'page' : undefined}
      >
        <span aria-hidden="true">⌂</span>
        Repositories
      </button>
      <button
        type="button"
        className={surface === 'clone' ? 'active' : ''}
        onClick={() => openSurface('clone')}
        aria-current={surface === 'clone' ? 'page' : undefined}
      >
        <span aria-hidden="true">＋</span>
        Clone
      </button>
      <button
        type="button"
        className={surface === 'security' ? 'active' : ''}
        onClick={() => openSurface('security')}
        aria-current={surface === 'security' ? 'page' : undefined}
      >
        <span aria-hidden="true">◇</span>
        Security
      </button>
    </>
  )

  return (
    <div className={`remote-shell${connection.yolo ? ' yolo-active' : ''}`}>
      <a className="skip-link" href="#remote-content">
        Skip to content
      </a>
      {connection.yolo && (
        <div className="yolo-banner" role="alert">
          <strong>UNSAFE YOLO LAN MODE</strong>
          <span>No authentication · full repository rights</span>
          <button type="button" onClick={() => setSurface('security')}>
            Review risk
          </button>
        </div>
      )}
      {!online && (
        <div className="offline-banner app-offline" role="status">
          <span aria-hidden="true">↯</span>
          Offline — actions are paused
        </div>
      )}

      <header className="app-bar">
        <div className="app-brand">
          <span className="brand-mark compact" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>Desktop Material</strong>
            <small>Remote</small>
          </span>
        </div>
        <div className="app-bar-actions">
          <span className={`connection-chip${online ? ' online' : ''}`}>
            <i aria-hidden="true" />
            {connection.yolo ? 'Unsafe LAN' : online ? 'Connected' : 'Offline'}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => void refreshRepositories()}
            disabled={!online || repositoriesLoading}
            aria-label="Refresh repositories"
            title="Refresh repositories"
          >
            ↻
          </button>
        </div>
      </header>

      <aside className="side-navigation" aria-label="Primary navigation">
        <div className="side-navigation-items">{navigation}</div>
        <div className="side-connection-card">
          <span className="eyebrow">Connected through</span>
          <strong>
            {connection.baseUrl === DEFAULT_AGENT_BASE
              ? 'Private gateway'
              : new URL(connection.baseUrl).host}
          </strong>
          <small>
            {connection.credentialKind === 'device'
              ? connection.device?.name ?? 'Paired device'
              : connection.credentialKind === 'bearer'
              ? 'Session bearer'
              : 'No authentication'}
          </small>
        </div>
      </aside>

      <main className="remote-content" id="remote-content">
        {surface === 'repositories' && (
          <section className="surface" aria-labelledby="repositories-title">
            <div className="surface-heading">
              <div>
                <span className="eyebrow">Desktop agent</span>
                <h1 id="repositories-title">Repositories</h1>
                <p>
                  {repositories.length} known on the connected Desktop Material
                  machine
                </p>
              </div>
              <button
                className="primary-button compact-button"
                type="button"
                onClick={() => setSurface('clone')}
              >
                <span aria-hidden="true">＋</span> Clone repository
              </button>
            </div>

            <div className="search-field">
              <span aria-hidden="true">⌕</span>
              <label className="sr-only" htmlFor="repository-filter">
                Search repositories
              </label>
              <input
                id="repository-filter"
                type="search"
                value={repositoryFilter}
                onChange={event =>
                  setRepositoryFilter(event.currentTarget.value)
                }
                placeholder="Search repositories"
              />
              {repositoryFilter && (
                <button
                  type="button"
                  onClick={() => setRepositoryFilter('')}
                  aria-label="Clear repository search"
                >
                  ×
                </button>
              )}
            </div>

            {repositoriesLoading ? (
              <div className="loading-panel" role="status">
                <span className="spinner" aria-hidden="true" />
                Refreshing repositories…
              </div>
            ) : filteredRepositories.length === 0 ? (
              <div className="empty-state">
                <span className="empty-art" aria-hidden="true">
                  ⌁
                </span>
                <h2>
                  {repositories.length === 0
                    ? 'No repositories yet'
                    : 'No matching repositories'}
                </h2>
                <p>
                  {repositories.length === 0
                    ? 'Clone a repository on the Desktop Material machine to get started.'
                    : 'Try a repository name, owner, or local path.'}
                </p>
                {repositories.length === 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSurface('clone')}
                  >
                    Open clone
                  </button>
                )}
              </div>
            ) : (
              <div className="repository-workspace">
                <div className="repository-list" role="list">
                  {filteredRepositories.map(repository => {
                    const status = statuses[repository.key]
                    return (
                      <button
                        type="button"
                        role="listitem"
                        key={repository.key}
                        className={`repository-row${
                          selectedRepositoryKey === repository.key
                            ? ' selected'
                            : ''
                        }`}
                        onClick={() => void loadRepositoryStatus(repository)}
                      >
                        <span className="repo-avatar" aria-hidden="true">
                          {repository.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="repo-copy">
                          <strong>
                            {repository.fullName ?? repository.name}
                          </strong>
                          <small>{status?.branch ?? repository.path}</small>
                        </span>
                        <span className="repo-badges">
                          {repository.cloning && <i>Cloning</i>}
                          {repository.missing && (
                            <i className="error">Missing</i>
                          )}
                          {status && status.changedFiles > 0 && (
                            <i>{status.changedFiles} changed</i>
                          )}
                          {status && status.behind > 0 && (
                            <i className="attention">↓ {status.behind}</i>
                          )}
                        </span>
                        <span className="chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    )
                  })}
                </div>

                <aside className="repository-detail" aria-live="polite">
                  {selectedRepository ? (
                    <>
                      <div className="detail-title">
                        <span className="repo-avatar large" aria-hidden="true">
                          {selectedRepository.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <span className="eyebrow">Selected repository</span>
                          <h2>
                            {selectedRepository.fullName ??
                              selectedRepository.name}
                          </h2>
                          <p>{selectedRepository.path}</p>
                        </div>
                      </div>

                      {statusLoading === selectedRepository.key ? (
                        <div className="loading-state" role="status">
                          <span className="spinner" aria-hidden="true" />
                          Reading repository status…
                        </div>
                      ) : selectedStatus ? (
                        <div className="status-grid">
                          <div>
                            <span>Branch</span>
                            <strong>
                              {selectedStatus.branch ?? 'Detached'}
                            </strong>
                          </div>
                          <div>
                            <span>Working tree</span>
                            <strong>
                              {selectedStatus.changedFiles === 0
                                ? 'Clean'
                                : `${selectedStatus.changedFiles} changed`}
                            </strong>
                          </div>
                          <div>
                            <span>Ahead</span>
                            <strong>{selectedStatus.ahead}</strong>
                          </div>
                          <div>
                            <span>Behind</span>
                            <strong>{selectedStatus.behind}</strong>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() =>
                            void loadRepositoryStatus(selectedRepository)
                          }
                        >
                          Check status
                        </button>
                      )}

                      <div
                        className="repository-actions"
                        aria-label="Git actions"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void runRepositoryCommand(
                              'fetch',
                              selectedRepository
                            )
                          }
                          disabled={
                            !online ||
                            commandBusy ||
                            !connection.commands.has('fetch')
                          }
                        >
                          <span aria-hidden="true">↻</span>
                          <strong>Fetch</strong>
                          <small>Update remote refs</small>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingCommand({
                              name: 'pull',
                              repository: selectedRepository,
                            })
                          }
                          disabled={
                            !online ||
                            commandBusy ||
                            !connection.commands.has('pull')
                          }
                        >
                          <span aria-hidden="true">↓</span>
                          <strong>Pull</strong>
                          <small>Bring changes in</small>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingCommand({
                              name: 'push',
                              repository: selectedRepository,
                            })
                          }
                          disabled={
                            !online ||
                            commandBusy ||
                            !connection.commands.has('push')
                          }
                        >
                          <span aria-hidden="true">↑</span>
                          <strong>Push</strong>
                          <small>Publish branch</small>
                        </button>
                      </div>
                      {busyCommand?.endsWith(`:${selectedRepository.key}`) && (
                        <div className="inline-progress" role="status">
                          <span className="spinner" aria-hidden="true" />
                          Running {busyCommand.split(':')[0]}…
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-detail">
                      <span aria-hidden="true">⌁</span>
                      Select a repository to view status.
                    </div>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}

        {surface === 'clone' && (
          <section
            className="surface narrow-surface"
            aria-labelledby="clone-title"
          >
            <div className="surface-heading">
              <div>
                <span className="eyebrow">New working copy</span>
                <h1 id="clone-title">Clone repository</h1>
                <p>Send a reviewed clone request to the connected agent.</p>
              </div>
            </div>

            <div
              className="segmented-control"
              role="tablist"
              aria-label="Clone destination"
            >
              <button
                type="button"
                role="tab"
                aria-selected={cloneMode === 'local'}
                className={cloneMode === 'local' ? 'active' : ''}
                onClick={() => setCloneMode('local')}
              >
                This Desktop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cloneMode === 'ssh'}
                className={cloneMode === 'ssh' ? 'active' : ''}
                onClick={() => setCloneMode('ssh')}
                disabled={!supportsSSH}
              >
                SSH host
              </button>
            </div>

            <form className="clone-card" onSubmit={onCloneSubmit}>
              <div className="clone-card-heading">
                <span className="tonal-icon" aria-hidden="true">
                  {cloneMode === 'local' ? '⌄' : '⇄'}
                </span>
                <div>
                  <h2>
                    {cloneMode === 'local'
                      ? 'Clone on the Desktop machine'
                      : 'Clone on a saved SSH host'}
                  </h2>
                  <p>
                    {cloneMode === 'local'
                      ? 'The path is interpreted by the Desktop Material agent, not this browser.'
                      : 'SSH authentication remains on the agent. This site never receives a key or passphrase.'}
                  </p>
                </div>
              </div>

              {cloneMode === 'ssh' && (
                <>
                  <label htmlFor="ssh-host">SSH host</label>
                  {sshHostsLoading ? (
                    <div className="loading-state" role="status">
                      <span className="spinner" aria-hidden="true" />
                      Loading advertised SSH hosts…
                    </div>
                  ) : (
                    <select
                      id="ssh-host"
                      value={selectedSSHHost}
                      onChange={event =>
                        setSelectedSSHHost(event.currentTarget.value)
                      }
                      required
                    >
                      <option value="">Choose a host</option>
                      {sshHosts.map(host => (
                        <option
                          key={host.id}
                          value={host.id}
                          disabled={!host.available}
                        >
                          {host.label} · {host.address}
                          {host.available ? '' : ' (offline)'}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <label htmlFor="clone-url">Repository URL</label>
              <input
                id="clone-url"
                type="url"
                inputMode="url"
                value={cloneUrl}
                onChange={event => setCloneUrl(event.currentTarget.value)}
                placeholder="https://github.com/owner/repository.git"
                required
              />

              <label htmlFor="clone-path">
                {cloneMode === 'local' ? 'Local destination' : 'Remote path'}
              </label>
              <input
                id="clone-path"
                value={clonePath}
                onChange={event => setClonePath(event.currentTarget.value)}
                placeholder={
                  cloneMode === 'local'
                    ? 'C:\\Users\\you\\Projects\\repository'
                    : '~/projects/repository'
                }
                required
              />

              <label htmlFor="clone-branch">Branch (optional)</label>
              <input
                id="clone-branch"
                value={cloneBranch}
                onChange={event => setCloneBranch(event.currentTarget.value)}
                placeholder="main"
              />

              <div className="form-security-note">
                <span aria-hidden="true">◇</span>
                <p>
                  No SSH secret, Git credential, or token is entered in this
                  form. Authentication is resolved by Desktop Material.
                </p>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={
                  !online ||
                  commandBusy ||
                  (cloneMode === 'ssh' && !supportsSSH)
                }
              >
                {busyCommand === 'clone' ? (
                  <>
                    <span className="spinner light" aria-hidden="true" />
                    Starting clone…
                  </>
                ) : (
                  <>
                    Start {cloneMode === 'ssh' ? 'SSH ' : ''}clone
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </form>

            {!supportsSSH && (
              <div className="feature-unavailable">
                <span aria-hidden="true">⇄</span>
                <div>
                  <strong>SSH Hosts is not advertised by this agent</strong>
                  <p>
                    Local cloning remains available. SSH controls will appear
                    automatically after the connected Desktop Material version
                    advertises <code>list-ssh-hosts</code> and
                    <code>clone-to-ssh</code>.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {surface === 'security' && (
          <section
            className="surface narrow-surface"
            aria-labelledby="security-title"
          >
            <div className="surface-heading">
              <div>
                <span className="eyebrow">Access & devices</span>
                <h1 id="security-title">Security</h1>
                <p>Review how this browser can control Desktop Material.</p>
              </div>
            </div>

            {connection.yolo ? (
              <div className="security-yolo" role="alert">
                <span className="yolo-label">UNSAFE YOLO LAN MODE</span>
                <h2>Every reachable device has full rights.</h2>
                <p>
                  Authentication is disabled. Pairing and revocation cannot
                  protect this endpoint; anyone on the reachable network can
                  invoke every advertised command.
                </p>
                <ol>
                  <li>Return to Desktop Material on the host machine.</li>
                  <li>
                    Turn off YOLO LAN mode and enable paired-device access.
                  </li>
                  <li>Generate a one-time QR and pair this browser again.</li>
                </ol>
              </div>
            ) : (
              <>
                <article className="security-card current-device-card">
                  <div className="security-card-heading">
                    <span className="tonal-icon" aria-hidden="true">
                      ▣
                    </span>
                    <div>
                      <span className="eyebrow">Current session</span>
                      <h2>
                        {connection.device?.name ??
                          (connection.credentialKind === 'device'
                            ? 'Paired browser'
                            : 'Bearer-token session')}
                      </h2>
                    </div>
                    <span className="safe-chip">Authorized</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Credential</dt>
                      <dd>
                        {connection.credentialKind === 'device'
                          ? 'Device bearer'
                          : 'Session bearer'}
                      </dd>
                    </div>
                    <div>
                      <dt>Endpoint</dt>
                      <dd>{connection.baseUrl}</dd>
                    </div>
                    <div>
                      <dt>Storage</dt>
                      <dd>
                        {window.localStorage.getItem(DEVICE_TOKEN_KEY)
                          ? 'Stay logged in on this browser'
                          : connection.credentialKind === 'bearer' &&
                            rememberTab
                          ? 'This browser tab only'
                          : 'Memory only'}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={signOut}
                  >
                    Sign out on this browser
                  </button>
                </article>

                {connection.credentialKind === 'device' && (
                  <article className="security-card">
                    <div className="security-card-heading">
                      <span className="tonal-icon" aria-hidden="true">
                        ⌘
                      </span>
                      <div>
                        <span className="eyebrow">Desktop Material agent</span>
                        <h2>Paired devices</h2>
                      </div>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => void loadDevices()}
                        disabled={devicesLoading}
                        aria-label="Refresh paired devices"
                      >
                        ↻
                      </button>
                    </div>
                    {devicesLoading ? (
                      <div className="loading-state" role="status">
                        <span className="spinner" aria-hidden="true" />
                        Loading paired devices…
                      </div>
                    ) : devices.length === 0 ? (
                      <p className="muted-copy">
                        No device list was returned. Refresh after the agent
                        finishes registering this pairing.
                      </p>
                    ) : (
                      <div className="device-list">
                        {devices.map(device => (
                          <div className="device-row" key={device.id}>
                            <span className="device-icon" aria-hidden="true">
                              ▯
                            </span>
                            <span>
                              <strong>
                                {device.name} {device.current && <i>Current</i>}
                              </strong>
                              <small>{formatLastSeen(device.lastSeen)}</small>
                            </span>
                            <button
                              type="button"
                              onClick={() => void revokeDevice(device)}
                              disabled={busyCommand === `revoke:${device.id}`}
                            >
                              {busyCommand === `revoke:${device.id}`
                                ? 'Revoking…'
                                : 'Revoke'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}
              </>
            )}

            <article className="security-card gateway-card">
              <div className="security-card-heading">
                <span className="tonal-icon" aria-hidden="true">
                  ↔
                </span>
                <div>
                  <span className="eyebrow">Network boundary</span>
                  <h2>Safe gateway checklist</h2>
                </div>
              </div>
              <ul>
                <li>
                  Use HTTPS and a private network or authenticated tunnel.
                </li>
                <li>
                  Expose only <code>/api/v1/*</code> to the agent upstream.
                </li>
                <li>Strip cookies and Origin; rewrite the upstream Host.</li>
                <li>Keep access logs and caches off for agent requests.</li>
                <li>
                  Never put a bearer, pairing code, or SSH secret in a URL.
                </li>
              </ul>
            </article>
          </section>
        )}
      </main>

      <nav className="bottom-navigation" aria-label="Primary navigation">
        {navigation}
      </nav>

      {pendingCommand && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-command-title"
          >
            <span className="tonal-icon" aria-hidden="true">
              {pendingCommand.name === 'push' ? '↑' : '↓'}
            </span>
            <h2 id="confirm-command-title">
              {pendingCommand.name === 'push' ? 'Push' : 'Pull'}{' '}
              {pendingCommand.repository.name}?
            </h2>
            <p>
              {pendingCommand.name === 'push'
                ? 'This publishes the current branch to its configured remote.'
                : 'This fetches and integrates upstream changes into the current branch.'}
            </p>
            <div className="dialog-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setPendingCommand(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button compact-button"
                type="button"
                onClick={() =>
                  void runRepositoryCommand(
                    pendingCommand.name,
                    pendingCommand.repository
                  )
                }
              >
                {pendingCommand.name === 'push'
                  ? 'Push branch'
                  : 'Pull changes'}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="snackbar" role="status">
          <span aria-hidden="true">✓</span>
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
