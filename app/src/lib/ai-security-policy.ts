import { createHash } from 'crypto'
import { win32 } from 'path'
import {
  getAIAdminPolicySettings,
  resolveRepositoryAIEligibility,
} from './ai-admin-policy'

export const AISecurityPolicyVersion = 1 as const
export const AISecurityPolicyAuditReceiptVersion = 1 as const
export const MaxAISecurityPolicyLifetimeMs = 5 * 60 * 1000

export const AIContentClasses = ['metadata', 'path', 'diff', 'code'] as const

export type AIContentClass = typeof AIContentClasses[number]

export const AIFeatures = [
  'commit-message-generation',
  'conflict-resolution',
  'commit-composition',
  'commit-summary',
  'pr-review-suggestion',
] as const

export type AIFeature = typeof AIFeatures[number]
export type AIProviderKind = 'github-copilot' | 'byok'

/**
 * Credential-free description of the destination that will receive AI data.
 * Authentication material and custom headers must never be copied here.
 */
export interface IAIProviderBinding {
  readonly kind: AIProviderKind
  readonly type: 'github' | 'openai' | 'azure' | 'anthropic'
  readonly endpoint: string
  readonly wireApi: 'completions' | 'responses' | null
  readonly transport: 'http' | 'websockets' | null
  readonly azureApiVersion: string | null
}

export interface IAISecurityPolicyV1 {
  readonly version: typeof AISecurityPolicyVersion
  readonly feature: AIFeature
  readonly repositoryId: number
  readonly canonicalRepositoryPath: string
  readonly provider: IAIProviderBinding
  readonly allowedContentClasses: ReadonlyArray<AIContentClass>
  readonly issuedAtMs: number
  readonly expiresAtMs: number
}

/**
 * Trust evidence produced outside the renderer policy document. A future
 * main-process verifier supplies this only after checking the document's real
 * signature and resolving the repository path immediately before use.
 */
export interface ITrustedMainProcessAIPolicyEvidence {
  readonly signatureVerified: boolean
  /** SHA-256 digest of the exact validated policy whose signature was checked. */
  readonly verifiedPolicyDigest: string
  readonly repositoryId: number
  readonly canonicalRepositoryPath: string
}

/**
 * Authorization accompanying one AI request. The active repository identity
 * remains a separate request input; this object only carries the policy and
 * evidence produced by a trusted main-process verifier.
 */
export interface IAISecurityPolicyAuthorization {
  readonly policy: unknown
  readonly trustedMainProcess: ITrustedMainProcessAIPolicyEvidence
}

export interface IAISecurityPolicyRequest {
  readonly feature: AIFeature
  readonly repositoryId: number
  readonly repositoryPath: string
  readonly provider: IAIProviderBinding
  readonly contentClasses: ReadonlyArray<AIContentClass>
}

export type AISecurityPolicyDenialCode =
  | 'policy-missing'
  | 'policy-malformed'
  | 'policy-version-unsupported'
  | 'policy-stale'
  | 'signature-unverified'
  | 'request-malformed'
  | 'feature-mismatch'
  | 'repository-mismatch'
  | 'provider-mismatch'
  | 'path-mismatch'
  | 'content-class-denied'

export interface IAISecurityPolicyDenial {
  readonly code: AISecurityPolicyDenialCode
  readonly message: string
}

/**
 * Metadata-only audit result. It deliberately excludes repository identities,
 * paths, provider URLs, model data, prompts, code, diffs, and credentials.
 */
export interface IAISecurityPolicyAuditReceipt {
  readonly version: typeof AISecurityPolicyAuditReceiptVersion
  readonly decision: 'allow' | 'deny'
  readonly denialCode: AISecurityPolicyDenialCode | null
  readonly policyVersion: number | null
  readonly feature: AIFeature | 'unknown'
  readonly providerKind: AIProviderKind | 'unknown'
  readonly contentClasses: ReadonlyArray<AIContentClass>
  readonly evaluatedAtMs: number
}

export type AISecurityPolicyDecision =
  | {
      readonly allowed: true
      readonly canonicalRepositoryPath: string
      readonly auditReceipt: IAISecurityPolicyAuditReceipt
    }
  | {
      readonly allowed: false
      readonly denial: IAISecurityPolicyDenial
      readonly auditReceipt: IAISecurityPolicyAuditReceipt
    }

const denialMessages: Readonly<Record<AISecurityPolicyDenialCode, string>> = {
  'policy-missing':
    'AI request denied because no security policy was provided.',
  'policy-malformed':
    'AI request denied because the security policy is invalid.',
  'policy-version-unsupported':
    'AI request denied because the security policy version is unsupported.',
  'policy-stale':
    'AI request denied because the security policy is not current.',
  'signature-unverified':
    'AI request denied because the security policy signature is unverified.',
  'request-malformed': 'AI request denied because its policy input is invalid.',
  'feature-mismatch':
    'AI request denied because the policy does not authorize this feature.',
  'repository-mismatch':
    'AI request denied because the repository identity is not authorized.',
  'provider-mismatch':
    'AI request denied because the AI provider is not authorized.',
  'path-mismatch':
    'AI request denied because the repository path is not authorized.',
  'content-class-denied':
    'AI request denied because the requested content is not authorized.',
}

const policyKeys = [
  'allowedContentClasses',
  'canonicalRepositoryPath',
  'expiresAtMs',
  'feature',
  'issuedAtMs',
  'provider',
  'repositoryId',
  'version',
] as const

const authorizationKeys = ['policy', 'trustedMainProcess'] as const

const trustedEvidenceKeys = [
  'canonicalRepositoryPath',
  'repositoryId',
  'signatureVerified',
  'verifiedPolicyDigest',
] as const

const requestKeys = [
  'contentClasses',
  'feature',
  'provider',
  'repositoryId',
  'repositoryPath',
] as const

const providerKeys = [
  'azureApiVersion',
  'endpoint',
  'kind',
  'transport',
  'type',
  'wireApi',
] as const

const providerTypes = ['github', 'openai', 'azure', 'anthropic'] as const
const providerWireApis = ['completions', 'responses'] as const
const providerTransports = ['http', 'websockets'] as const
const maxWindowsPathLength = 32767

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function snapshotExactDataProperties(
  value: unknown,
  expected: ReadonlyArray<string>
): Readonly<Record<string, unknown>> | null {
  if (!isPlainObject(value)) {
    return null
  }

  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some(key => typeof key !== 'string')) {
    return null
  }

  const actual = [...(ownKeys as ReadonlyArray<string>)].sort()
  const sortedExpected = [...expected].sort()
  if (
    actual.length !== sortedExpected.length ||
    !actual.every((key, index) => key === sortedExpected[index])
  ) {
    return null
  }

  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >
  const snapshot: Record<string, unknown> = Object.create(null)
  for (const key of sortedExpected) {
    const descriptor = descriptors[key]
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      return null
    }
    snapshot[key] = descriptor.value
  }

  return Object.freeze(snapshot)
}

function isSafeRepositoryId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isSafeEpoch(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isOneOf<T extends string>(
  value: unknown,
  values: ReadonlyArray<T>
): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function parseContentClasses(
  value: unknown
): ReadonlyArray<AIContentClass> | null {
  if (!Array.isArray(value)) {
    return null
  }

  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some(key => typeof key !== 'string')) {
    return null
  }

  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >
  const lengthDescriptor = descriptors.length
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    (lengthDescriptor.value as number) < 1 ||
    (lengthDescriptor.value as number) > AIContentClasses.length
  ) {
    return null
  }

  const length = lengthDescriptor.value as number
  const expectedKeys = new Set([
    'length',
    ...Array.from({ length }, (_, i) => `${i}`),
  ])
  if (
    ownKeys.length !== expectedKeys.size ||
    ownKeys.some(key => !expectedKeys.has(key as string))
  ) {
    return null
  }

  const result: Array<AIContentClass> = []
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index]
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      return null
    }
    const contentClass = descriptor.value
    if (!isOneOf(contentClass, AIContentClasses)) {
      return null
    }
    if (result.includes(contentClass)) {
      return null
    }
    result.push(contentClass)
  }

  return Object.freeze(result)
}

function isLoopbackProviderHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]'
  ) {
    return true
  }

  const ipv4Octets = normalized.split('.')
  return (
    ipv4Octets.length === 4 &&
    ipv4Octets.every(octet => /^\d{1,3}$/.test(octet)) &&
    ipv4Octets.every(octet => Number(octet) <= 255) &&
    Number(ipv4Octets[0]) === 127
  )
}

function normalizeProviderEndpoint(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null
  }

  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    return null
  }

  if (
    (endpoint.protocol !== 'https:' &&
      (endpoint.protocol !== 'http:' ||
        !isLoopbackProviderHostname(endpoint.hostname))) ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    return null
  }

  const pathname = endpoint.pathname.replace(/\/+$/, '')
  return `${endpoint.origin}${pathname === '' ? '' : pathname}`
}

function parseProviderBinding(value: unknown): IAIProviderBinding | null {
  const providerSnapshot = snapshotExactDataProperties(value, providerKeys)
  if (providerSnapshot === null) {
    return null
  }

  const kind = providerSnapshot.kind
  const type = providerSnapshot.type
  const endpointValue = providerSnapshot.endpoint
  const wireApi = providerSnapshot.wireApi
  const transport = providerSnapshot.transport
  const azureApiVersion = providerSnapshot.azureApiVersion

  if (
    !isOneOf(kind, ['github-copilot', 'byok'] as const) ||
    !isOneOf(type, providerTypes) ||
    !(wireApi === null || isOneOf(wireApi, providerWireApis)) ||
    !(transport === null || isOneOf(transport, providerTransports)) ||
    !(
      azureApiVersion === null ||
      (typeof azureApiVersion === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(azureApiVersion))
    )
  ) {
    return null
  }

  if (
    (kind === 'github-copilot' &&
      (type !== 'github' ||
        wireApi !== null ||
        transport !== null ||
        azureApiVersion !== null)) ||
    (kind === 'byok' && type === 'github') ||
    (type !== 'azure' && azureApiVersion !== null)
  ) {
    return null
  }

  const endpoint = normalizeProviderEndpoint(endpointValue)
  if (endpoint === null) {
    return null
  }

  return Object.freeze({
    kind,
    type,
    endpoint,
    wireApi,
    transport,
    azureApiVersion,
  })
}

function providerBindingsEqual(
  left: IAIProviderBinding,
  right: IAIProviderBinding
): boolean {
  return (
    left.kind === right.kind &&
    left.type === right.type &&
    left.endpoint === right.endpoint &&
    left.wireApi === right.wireApi &&
    left.transport === right.transport &&
    left.azureApiVersion === right.azureApiVersion
  )
}

/**
 * Normalize a drive-rooted Windows repository path for policy comparison.
 * Invalid, relative, UNC, device-namespace, traversal, and ADS paths return
 * `null`; traversal is rejected before `win32.normalize` can erase it.
 */
export function normalizeAIPolicyWindowsPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxWindowsPathLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null
  }

  const separated = value.replace(/\//g, '\\')
  if (separated.startsWith('\\\\') || !/^[A-Za-z]:\\/.test(separated)) {
    return null
  }

  const pathAfterRoot = separated.slice(3)
  if (pathAfterRoot.includes(':')) {
    return null
  }

  const segments = pathAfterRoot.split(/\\+/)
  if (
    segments.some(
      segment =>
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ')
    )
  ) {
    return null
  }

  const normalized = win32.normalize(separated).toLowerCase()
  if (!/^[a-z]:\\/.test(normalized) || normalized.startsWith('\\\\')) {
    return null
  }

  return normalized.length > 3 && normalized.endsWith('\\')
    ? normalized.slice(0, -1)
    : normalized
}

interface IParsedAISecurityPolicyV1 {
  readonly version: typeof AISecurityPolicyVersion
  readonly feature: AIFeature
  readonly repositoryId: number
  readonly canonicalRepositoryPath: string
  readonly provider: IAIProviderBinding
  readonly allowedContentClasses: ReadonlyArray<AIContentClass>
  readonly issuedAtMs: number
  readonly expiresAtMs: number
}

function parsePolicySnapshot(
  policySnapshot: Readonly<Record<string, unknown>>
): IParsedAISecurityPolicyV1 | null {
  const version = policySnapshot.version
  const feature = policySnapshot.feature
  const repositoryId = policySnapshot.repositoryId
  const canonicalRepositoryPath = normalizeAIPolicyWindowsPath(
    policySnapshot.canonicalRepositoryPath
  )
  const provider = parseProviderBinding(policySnapshot.provider)
  const allowedContentClasses = parseContentClasses(
    policySnapshot.allowedContentClasses
  )
  const issuedAtMs = policySnapshot.issuedAtMs
  const expiresAtMs = policySnapshot.expiresAtMs

  if (
    version !== AISecurityPolicyVersion ||
    !isOneOf(feature, AIFeatures) ||
    !isSafeRepositoryId(repositoryId) ||
    canonicalRepositoryPath === null ||
    provider === null ||
    allowedContentClasses === null ||
    !isSafeEpoch(issuedAtMs) ||
    !isSafeEpoch(expiresAtMs) ||
    expiresAtMs <= issuedAtMs
  ) {
    return null
  }

  return Object.freeze({
    version,
    feature,
    repositoryId,
    canonicalRepositoryPath,
    provider,
    allowedContentClasses,
    issuedAtMs,
    expiresAtMs,
  })
}

function digestParsedPolicy(policy: IParsedAISecurityPolicyV1): string {
  const canonicalContentClasses = AIContentClasses.filter(contentClass =>
    policy.allowedContentClasses.includes(contentClass)
  )
  const canonicalPolicy = JSON.stringify([
    policy.version,
    policy.feature,
    policy.repositoryId,
    policy.canonicalRepositoryPath,
    [
      policy.provider.kind,
      policy.provider.type,
      policy.provider.endpoint,
      policy.provider.wireApi,
      policy.provider.transport,
      policy.provider.azureApiVersion,
    ],
    canonicalContentClasses,
    policy.issuedAtMs,
    policy.expiresAtMs,
  ])

  return createHash('sha256').update(canonicalPolicy, 'utf8').digest('hex')
}

/**
 * Return the deterministic SHA-256 digest a main-process signature verifier
 * binds to its evidence. This hashes only a strictly validated, normalized V1
 * policy; it does not sign or verify the document.
 */
export function getAISecurityPolicyDigest(policy: unknown): string | null {
  try {
    const policySnapshot = snapshotExactDataProperties(policy, policyKeys)
    if (policySnapshot === null) {
      return null
    }

    const parsedPolicy = parsePolicySnapshot(policySnapshot)
    return parsedPolicy === null ? null : digestParsedPolicy(parsedPolicy)
  } catch {
    return null
  }
}

function makeReceipt(
  decision: 'allow' | 'deny',
  denialCode: AISecurityPolicyDenialCode | null,
  policyVersion: number | null,
  request: unknown,
  evaluatedAtMs: number
): IAISecurityPolicyAuditReceipt {
  let feature: AIFeature | 'unknown' = 'unknown'
  let providerKind: AIProviderKind | 'unknown' = 'unknown'
  let contentClasses: ReadonlyArray<AIContentClass> = Object.freeze([])

  try {
    const requestSnapshot = snapshotExactDataProperties(request, requestKeys)
    if (requestSnapshot !== null) {
      const requestFeature = requestSnapshot.feature
      const requestProvider = snapshotExactDataProperties(
        requestSnapshot.provider,
        providerKeys
      )
      const requestContentClasses = requestSnapshot.contentClasses
      if (isOneOf(requestFeature, AIFeatures)) {
        feature = requestFeature
      }
      if (requestProvider !== null) {
        const requestProviderKind = requestProvider.kind
        if (isOneOf(requestProviderKind, ['github-copilot', 'byok'] as const)) {
          providerKind = requestProviderKind
        }
      }
      contentClasses =
        parseContentClasses(requestContentClasses) ?? Object.freeze([])
    }
  } catch {
    // A malicious proxy/getter must not make denial reporting throw or echo its
    // data. The all-unknown metadata receipt is the safe fallback.
    feature = 'unknown'
    providerKind = 'unknown'
    contentClasses = Object.freeze([])
  }

  return Object.freeze({
    version: AISecurityPolicyAuditReceiptVersion,
    decision,
    denialCode,
    policyVersion,
    feature,
    providerKind,
    contentClasses,
    evaluatedAtMs,
  })
}

function deny(
  code: AISecurityPolicyDenialCode,
  policyVersion: number | null,
  request: unknown,
  evaluatedAtMs: number
): AISecurityPolicyDecision {
  return Object.freeze({
    allowed: false,
    denial: Object.freeze({ code, message: denialMessages[code] }),
    auditReceipt: makeReceipt(
      'deny',
      code,
      policyVersion,
      request,
      evaluatedAtMs
    ),
  })
}

/**
 * Evaluate a signed AI policy without throwing. Every malformed or ambiguous
 * input produces a typed denial, and only a fresh, independently verified,
 * exact binding produces an allow decision.
 */
export function evaluateAISecurityPolicy(
  authorization: unknown,
  request: unknown,
  nowMs: number = Date.now()
): AISecurityPolicyDecision {
  const evaluatedAtMs = isSafeEpoch(nowMs) ? nowMs : Date.now()

  try {
    if (authorization === undefined || authorization === null) {
      return deny('policy-missing', null, request, evaluatedAtMs)
    }

    const authorizationSnapshot = snapshotExactDataProperties(
      authorization,
      authorizationKeys
    )
    if (authorizationSnapshot === null) {
      return deny('policy-malformed', null, request, evaluatedAtMs)
    }

    const rawPolicy = authorizationSnapshot.policy
    const rawTrustedMainProcess = authorizationSnapshot.trustedMainProcess

    if (rawPolicy === undefined || rawPolicy === null) {
      return deny('policy-missing', null, request, evaluatedAtMs)
    }

    const trustedSnapshot = snapshotExactDataProperties(
      rawTrustedMainProcess,
      trustedEvidenceKeys
    )
    if (trustedSnapshot === null) {
      return deny('policy-malformed', null, request, evaluatedAtMs)
    }

    const signatureVerified = trustedSnapshot.signatureVerified
    const verifiedPolicyDigest = trustedSnapshot.verifiedPolicyDigest
    const trustedRepositoryId = trustedSnapshot.repositoryId
    const trustedCanonicalRepositoryPath =
      trustedSnapshot.canonicalRepositoryPath
    if (
      typeof signatureVerified !== 'boolean' ||
      !isSafeRepositoryId(trustedRepositoryId) ||
      typeof verifiedPolicyDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(verifiedPolicyDigest)
    ) {
      return deny('policy-malformed', null, request, evaluatedAtMs)
    }

    if (!signatureVerified) {
      return deny('signature-unverified', null, request, evaluatedAtMs)
    }

    const policySnapshot = snapshotExactDataProperties(rawPolicy, policyKeys)
    if (policySnapshot === null) {
      return deny('policy-malformed', null, request, evaluatedAtMs)
    }

    const rawVersion = policySnapshot.version
    const policyVersion = Number.isSafeInteger(rawVersion)
      ? (rawVersion as number)
      : null
    if (policyVersion !== AISecurityPolicyVersion) {
      return deny(
        policyVersion === null
          ? 'policy-malformed'
          : 'policy-version-unsupported',
        policyVersion,
        request,
        evaluatedAtMs
      )
    }

    const policy = parsePolicySnapshot(policySnapshot)
    if (policy === null) {
      return deny('policy-malformed', policyVersion, request, evaluatedAtMs)
    }

    if (digestParsedPolicy(policy) !== verifiedPolicyDigest) {
      return deny('signature-unverified', policyVersion, request, evaluatedAtMs)
    }

    if (
      policy.issuedAtMs > evaluatedAtMs ||
      policy.expiresAtMs <= evaluatedAtMs ||
      policy.expiresAtMs - policy.issuedAtMs > MaxAISecurityPolicyLifetimeMs
    ) {
      return deny('policy-stale', policyVersion, request, evaluatedAtMs)
    }

    const requestSnapshot = snapshotExactDataProperties(request, requestKeys)
    if (requestSnapshot === null) {
      return deny('request-malformed', policyVersion, request, evaluatedAtMs)
    }

    const requestFeature = requestSnapshot.feature
    const requestRepositoryId = requestSnapshot.repositoryId
    const requestRepositoryPath = requestSnapshot.repositoryPath
    const requestProviderValue = requestSnapshot.provider
    const requestContentClassValue = requestSnapshot.contentClasses
    const requestProvider = parseProviderBinding(requestProviderValue)
    const requestContentClasses = parseContentClasses(requestContentClassValue)
    if (
      !isOneOf(requestFeature, AIFeatures) ||
      !isSafeRepositoryId(requestRepositoryId) ||
      requestProvider === null ||
      requestContentClasses === null
    ) {
      return deny('request-malformed', policyVersion, request, evaluatedAtMs)
    }

    if (policy.feature !== requestFeature) {
      return deny('feature-mismatch', policyVersion, request, evaluatedAtMs)
    }

    if (
      trustedRepositoryId !== requestRepositoryId ||
      policy.repositoryId !== requestRepositoryId
    ) {
      return deny('repository-mismatch', policyVersion, request, evaluatedAtMs)
    }

    if (!providerBindingsEqual(policy.provider, requestProvider)) {
      return deny('provider-mismatch', policyVersion, request, evaluatedAtMs)
    }

    const requestPath = normalizeAIPolicyWindowsPath(requestRepositoryPath)
    const trustedPath = normalizeAIPolicyWindowsPath(
      trustedCanonicalRepositoryPath
    )
    if (
      requestPath === null ||
      trustedPath === null ||
      requestPath !== trustedPath ||
      policy.canonicalRepositoryPath !== trustedPath
    ) {
      return deny('path-mismatch', policyVersion, request, evaluatedAtMs)
    }

    if (
      requestContentClasses.some(
        contentClass => !policy.allowedContentClasses.includes(contentClass)
      )
    ) {
      return deny('content-class-denied', policyVersion, request, evaluatedAtMs)
    }

    return Object.freeze({
      allowed: true,
      canonicalRepositoryPath: trustedPath,
      auditReceipt: makeReceipt(
        'allow',
        null,
        policyVersion,
        request,
        evaluatedAtMs
      ),
    })
  } catch {
    return deny('policy-malformed', null, request, evaluatedAtMs)
  }
}

/** Error exposed to callers when the policy gate denies an AI request. */
export class AISecurityPolicyDeniedError extends Error {
  public readonly code: AISecurityPolicyDenialCode
  public readonly auditReceipt: IAISecurityPolicyAuditReceipt

  public constructor(
    denial: IAISecurityPolicyDenial,
    auditReceipt: IAISecurityPolicyAuditReceipt
  ) {
    super(denial.message)
    this.name = 'AISecurityPolicyDeniedError'
    this.code = denial.code
    this.auditReceipt = auditReceipt
  }
}

export function isAISecurityPolicyDeniedError(
  error: unknown
): error is AISecurityPolicyDeniedError {
  return error instanceof AISecurityPolicyDeniedError
}

// ---------------------------------------------------------------------------
// Administrator gate
//
// Everything above this point verifies a *signed* policy document. The
// functions below are the actual reusable enforcement point every AI
// feature must call first: they read the administrator's live settings
// (`ai-admin-policy.ts`) and decide, in plain terms, whether a request for a
// repository/path may proceed at all. Only a request this gate allows is
// ever turned into a signed policy and handed to `evaluateAISecurityPolicy`.
// ---------------------------------------------------------------------------

/** A minimal description of an AI request, used only to decide admin policy. */
export interface IAIAdminGateRequest {
  readonly feature: AIFeature
  readonly repositoryId: number
  readonly repositoryPath: string
  /** Repository-relative file paths the feature wants to send. May be empty for repo-wide features. */
  readonly filePaths: ReadonlyArray<string>
  readonly providerKind: AIProviderKind
}

export type AIAdminGateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }

/**
 * Evaluate a request against the administrator's live AI policy settings
 * (master kill switch, provider allow-list, per-repository eligibility).
 *
 * This is the single, central gate every AI feature must call before
 * building a prompt or reading a diff/file for a model. It never logs or
 * returns file contents/diffs — only the decision, keyed by repository and
 * path, is ever surfaced to callers or logs.
 */
export function evaluateAIAdminGate(
  request: IAIAdminGateRequest
): AIAdminGateDecision {
  const settings = getAIAdminPolicySettings()

  if (!settings.aiFeaturesEnabled) {
    return {
      allowed: false,
      reason:
        'An administrator has disabled sending diffs or file contents to AI providers on this machine.',
    }
  }

  if (!settings.allowedProviderKinds.includes(request.providerKind)) {
    return {
      allowed: false,
      reason: `An administrator has not authorized the "${request.providerKind}" AI provider.`,
    }
  }

  const eligibility = resolveRepositoryAIEligibility(
    settings,
    request.repositoryPath
  )
  if (eligibility !== 'allow') {
    return {
      allowed: false,
      reason:
        'An administrator has not authorized AI features for this repository.',
    }
  }

  return { allowed: true }
}

/**
 * Build a signed-shape {@link IAISecurityPolicyAuthorization} for a request
 * that the administrator gate allows, so it can be handed to
 * {@linkcode evaluateAISecurityPolicy}. Returns `null` when the admin gate
 * denies the request, the repository path cannot be normalized, or the
 * policy cannot be digested — callers must treat `null` the same as any
 * other denial and must not fall back to sending the request unauthorized.
 *
 * This app has no separate main-process boundary for AI policy today, so
 * the policy is issued and "verified" in the same process that evaluates
 * it; `signatureVerified` reflects that the administrator settings were
 * read and applied, not a cross-process cryptographic signature.
 */
export function issueAISecurityPolicyAuthorization(
  feature: AIFeature,
  repositoryId: number,
  repositoryPath: string,
  filePaths: ReadonlyArray<string>,
  provider: IAIProviderBinding,
  contentClasses: ReadonlyArray<AIContentClass>
): IAISecurityPolicyAuthorization | null {
  const gate = evaluateAIAdminGate({
    feature,
    repositoryId,
    repositoryPath,
    filePaths,
    providerKind: provider.kind,
  })
  if (!gate.allowed) {
    return null
  }

  const canonicalRepositoryPath = normalizeAIPolicyWindowsPath(repositoryPath)
  if (canonicalRepositoryPath === null) {
    return null
  }

  const issuedAtMs = Date.now()
  const policy: IAISecurityPolicyV1 = {
    version: AISecurityPolicyVersion,
    feature,
    repositoryId,
    canonicalRepositoryPath,
    provider,
    allowedContentClasses: contentClasses,
    issuedAtMs,
    expiresAtMs: issuedAtMs + MaxAISecurityPolicyLifetimeMs,
  }

  const verifiedPolicyDigest = getAISecurityPolicyDigest(policy)
  if (verifiedPolicyDigest === null) {
    return null
  }

  return {
    policy,
    trustedMainProcess: {
      signatureVerified: true,
      verifiedPolicyDigest,
      repositoryId,
      canonicalRepositoryPath,
    },
  }
}
