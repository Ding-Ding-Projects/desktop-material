/**
 * Provider-neutral, immutable identity and configuration values for issue
 * trackers. This module intentionally has no transport, credential storage,
 * persistence, or provider client capability.
 */

export const IssueTrackerEndpointMaximumBytes = 2_048
export const IssueTrackerAccountIdMaximumBytes = 256
export const IssueTrackerConfigurationIdMaximumBytes = 256
export const IssueTrackerCredentialReferenceIdMaximumBytes = 256
export const IssueTrackerScopeIdMaximumBytes = 512
export const IssueTrackerItemIdMaximumBytes = 512
export const IssueTrackerAvailabilityStringMaximumBytes = 512
export const IssueTrackerMaximumConfigurations = 256
export const IssueTrackerKeyMaximumBytes = 8_192

export const IssueTrackerProviders = Object.freeze([
  'jira-cloud',
  'jira-data-center',
  'git-integration-for-jira',
  'trello',
  'github',
  'github-enterprise',
  'gitlab',
  'gitlab-self-managed',
] as const)

export type IssueTrackerProvider = typeof IssueTrackerProviders[number]

export const IssueTrackerWireVariants = Object.freeze([
  'jira-rest-v3',
  'jira-rest-v2',
  'git-integration-for-jira-v1',
  'trello-rest-v1',
  'github-rest-v3',
  'gitlab-rest-v4',
] as const)

export type IssueTrackerWireVariant = typeof IssueTrackerWireVariants[number]

export const IssueTrackerScopeKinds = Object.freeze([
  'project',
  'board',
  'repository',
] as const)

export type IssueTrackerScopeKind = typeof IssueTrackerScopeKinds[number]

export const IssueTrackerItemKinds = Object.freeze([
  'issue',
  'pull-request',
  'card',
] as const)

export type IssueTrackerItemKind = typeof IssueTrackerItemKinds[number]

export interface IIssueTrackerScope<
  K extends IssueTrackerScopeKind = IssueTrackerScopeKind
> {
  readonly kind: K
  readonly id: string
}

export interface IIssueTrackerConfiguration<
  P extends IssueTrackerProvider = IssueTrackerProvider,
  W extends IssueTrackerWireVariant = IssueTrackerWireVariant,
  S extends IssueTrackerScopeKind = IssueTrackerScopeKind
> {
  readonly provider: P
  /** Canonical origin only; provider adapters own all API paths. */
  readonly endpoint: string
  readonly accountId: string
  readonly configurationId: string
  /** Opaque secure-store reference. This is never credential material. */
  readonly credentialReferenceId: string
  readonly wireVariant: W
  readonly scope: IIssueTrackerScope<S>
}

export type IssueTrackerConfiguration =
  | IIssueTrackerConfiguration<'jira-cloud', 'jira-rest-v3', 'project'>
  | IIssueTrackerConfiguration<'jira-data-center', 'jira-rest-v2', 'project'>
  | IIssueTrackerConfiguration<
      'git-integration-for-jira',
      'git-integration-for-jira-v1',
      'project'
    >
  | IIssueTrackerConfiguration<'trello', 'trello-rest-v1', 'board'>
  | IIssueTrackerConfiguration<'github', 'github-rest-v3', 'repository'>
  | IIssueTrackerConfiguration<
      'github-enterprise',
      'github-rest-v3',
      'repository'
    >
  | IIssueTrackerConfiguration<'gitlab', 'gitlab-rest-v4', 'project'>
  | IIssueTrackerConfiguration<
      'gitlab-self-managed',
      'gitlab-rest-v4',
      'project'
    >

export interface IIssueTrackerItemIdentity<
  P extends IssueTrackerProvider = IssueTrackerProvider,
  W extends IssueTrackerWireVariant = IssueTrackerWireVariant,
  S extends IssueTrackerScopeKind = IssueTrackerScopeKind,
  K extends IssueTrackerItemKind = IssueTrackerItemKind
> {
  readonly provider: P
  readonly endpoint: string
  readonly accountId: string
  readonly wireVariant: W
  readonly scope: IIssueTrackerScope<S>
  readonly itemKind: K
  readonly itemId: string
}

export type IssueTrackerItemIdentity =
  | IIssueTrackerItemIdentity<'jira-cloud', 'jira-rest-v3', 'project', 'issue'>
  | IIssueTrackerItemIdentity<
      'jira-data-center',
      'jira-rest-v2',
      'project',
      'issue'
    >
  | IIssueTrackerItemIdentity<
      'git-integration-for-jira',
      'git-integration-for-jira-v1',
      'project',
      'issue'
    >
  | IIssueTrackerItemIdentity<'trello', 'trello-rest-v1', 'board', 'card'>
  | IIssueTrackerItemIdentity<
      'github',
      'github-rest-v3',
      'repository',
      'issue' | 'pull-request'
    >
  | IIssueTrackerItemIdentity<
      'github-enterprise',
      'github-rest-v3',
      'repository',
      'issue' | 'pull-request'
    >
  | IIssueTrackerItemIdentity<
      'gitlab',
      'gitlab-rest-v4',
      'project',
      'issue' | 'pull-request'
    >
  | IIssueTrackerItemIdentity<
      'gitlab-self-managed',
      'gitlab-rest-v4',
      'project',
      'issue' | 'pull-request'
    >

export type IssueTrackerAvailabilityValue = string | number | boolean

export interface IIssueTrackerValue<
  T extends IssueTrackerAvailabilityValue = IssueTrackerAvailabilityValue
> {
  readonly availability: 'value'
  readonly value: T
}

export interface IIssueTrackerUnavailable {
  readonly availability: 'unavailable'
}

export interface IIssueTrackerNotApplicable {
  readonly availability: 'not-applicable'
}

export type IssueTrackerAvailability<
  T extends IssueTrackerAvailabilityValue = IssueTrackerAvailabilityValue
> =
  | IIssueTrackerValue<T>
  | IIssueTrackerUnavailable
  | IIssueTrackerNotApplicable

export const IssueTrackerUnavailable: IIssueTrackerUnavailable = Object.freeze({
  availability: 'unavailable',
})

export const IssueTrackerNotApplicable: IIssueTrackerNotApplicable =
  Object.freeze({ availability: 'not-applicable' })

declare const issueTrackerConfigurationKeyBrand: unique symbol
declare const issueTrackerItemKeyBrand: unique symbol

export type IssueTrackerConfigurationKey = string & {
  readonly [issueTrackerConfigurationKeyBrand]: true
}

export type IssueTrackerItemKey = string & {
  readonly [issueTrackerItemKeyBrand]: true
}

export type IssueTrackerModelErrorCode =
  | 'invalid-configuration'
  | 'invalid-configuration-list'
  | 'duplicate-configuration'
  | 'invalid-item-identity'
  | 'invalid-availability'
  | 'invalid-key'

const ErrorMessages: Readonly<Record<IssueTrackerModelErrorCode, string>> =
  Object.freeze({
    'invalid-configuration': 'Issue tracker configuration is invalid.',
    'invalid-configuration-list':
      'Issue tracker configuration list is invalid.',
    'duplicate-configuration':
      'Issue tracker configuration list contains a duplicate identity.',
    'invalid-item-identity': 'Issue tracker item identity is invalid.',
    'invalid-availability': 'Issue tracker availability is invalid.',
    'invalid-key': 'Issue tracker identity key is invalid.',
  })

export class IssueTrackerModelError extends Error {
  public constructor(public readonly code: IssueTrackerModelErrorCode) {
    super(ErrorMessages[code])
    this.name = 'IssueTrackerModelError'
  }
}

type ExactDataRecord = Readonly<Record<string, unknown>>
type DescriptorRecord = Record<PropertyKey, PropertyDescriptor | undefined>

interface IDataRecordSnapshot {
  readonly keys: ReadonlyArray<string>
  readonly values: ExactDataRecord
}

type DenseArraySnapshot =
  | { readonly kind: 'valid'; readonly values: ReadonlyArray<unknown> }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' }

interface IProviderBinding {
  readonly wireVariant: IssueTrackerWireVariant
  readonly scopeKind: IssueTrackerScopeKind
  readonly itemKinds: ReadonlySet<IssueTrackerItemKind>
}

const TextBytes = new TextEncoder()
const ConfigurationIdentityVersion = 1
const ItemIdentityVersion = 1
const UnsafeTextPattern =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/u
const CanonicalIPv4LoopbackPattern =
  /^127\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/u
const NumericHostPattern = /^(?:0x[0-9a-f]+|[0-9][0-9a-fx.]*)$/iu

const ConfigurationKeys = Object.freeze([
  'provider',
  'endpoint',
  'accountId',
  'configurationId',
  'credentialReferenceId',
  'wireVariant',
  'scope',
] as const)
const ScopeKeys = Object.freeze(['kind', 'id'] as const)
const ItemIdentityKeys = Object.freeze([
  'provider',
  'endpoint',
  'accountId',
  'wireVariant',
  'scope',
  'itemKind',
  'itemId',
] as const)

const IssueItemKinds = new Set<IssueTrackerItemKind>(['issue'])
const CardItemKinds = new Set<IssueTrackerItemKind>(['card'])
const ForgeItemKinds = new Set<IssueTrackerItemKind>(['issue', 'pull-request'])

const ProviderBindings: Readonly<
  Record<IssueTrackerProvider, IProviderBinding>
> = Object.freeze({
  'jira-cloud': Object.freeze({
    wireVariant: 'jira-rest-v3',
    scopeKind: 'project',
    itemKinds: IssueItemKinds,
  }),
  'jira-data-center': Object.freeze({
    wireVariant: 'jira-rest-v2',
    scopeKind: 'project',
    itemKinds: IssueItemKinds,
  }),
  'git-integration-for-jira': Object.freeze({
    wireVariant: 'git-integration-for-jira-v1',
    scopeKind: 'project',
    itemKinds: IssueItemKinds,
  }),
  trello: Object.freeze({
    wireVariant: 'trello-rest-v1',
    scopeKind: 'board',
    itemKinds: CardItemKinds,
  }),
  github: Object.freeze({
    wireVariant: 'github-rest-v3',
    scopeKind: 'repository',
    itemKinds: ForgeItemKinds,
  }),
  'github-enterprise': Object.freeze({
    wireVariant: 'github-rest-v3',
    scopeKind: 'repository',
    itemKinds: ForgeItemKinds,
  }),
  gitlab: Object.freeze({
    wireVariant: 'gitlab-rest-v4',
    scopeKind: 'project',
    itemKinds: ForgeItemKinds,
  }),
  'gitlab-self-managed': Object.freeze({
    wireVariant: 'gitlab-rest-v4',
    scopeKind: 'project',
    itemKinds: ForgeItemKinds,
  }),
})

function fail(code: IssueTrackerModelErrorCode): never {
  throw new IssueTrackerModelError(code)
}

function snapshotDataRecord(value: unknown): IDataRecordSnapshot | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return null
    }

    const descriptors = Object.getOwnPropertyDescriptors(
      value
    ) as unknown as DescriptorRecord
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some(key => typeof key !== 'string')) {
      return null
    }

    const keys = ownKeys as ReadonlyArray<string>
    const copy: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null
      }
      copy[key] = descriptor.value
    }

    return Object.freeze({
      keys: Object.freeze([...keys]),
      values: Object.freeze(copy),
    })
  } catch {
    return null
  }
}

function hasExactKeys(
  snapshot: IDataRecordSnapshot,
  expectedKeys: ReadonlyArray<string>
): boolean {
  return (
    snapshot.keys.length === expectedKeys.length &&
    snapshot.keys.every(key => expectedKeys.includes(key))
  )
}

function exactDataRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>
): ExactDataRecord | null {
  const snapshot = snapshotDataRecord(value)
  return snapshot !== null && hasExactKeys(snapshot, expectedKeys)
    ? snapshot.values
    : null
}

function snapshotDenseArray(
  value: unknown,
  maximumLength: number
): DenseArraySnapshot {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return { kind: 'invalid' }
    }

    const descriptors = Object.getOwnPropertyDescriptors(
      value
    ) as unknown as DescriptorRecord
    const ownKeys = Reflect.ownKeys(descriptors)
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0
    ) {
      return { kind: 'invalid' }
    }

    const length = lengthDescriptor.value as number
    if (length > maximumLength) {
      return { kind: 'too-large' }
    }
    if (
      ownKeys.length !== length + 1 ||
      ownKeys.some(key => typeof key !== 'string') ||
      !ownKeys.includes('length')
    ) {
      return { kind: 'invalid' }
    }

    const copy = new Array<unknown>()
    for (let index = 0; index < length; index++) {
      const descriptor = descriptors[String(index)]
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return { kind: 'invalid' }
      }
      copy.push(descriptor.value)
    }
    return { kind: 'valid', values: Object.freeze(copy) }
  } catch {
    return { kind: 'invalid' }
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1)
      if (trailing < 0xdc00 || trailing > 0xdfff) {
        return true
      }
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function canonicalText(value: unknown, maximumBytes: number): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumBytes ||
    value.trim() !== value ||
    hasUnpairedSurrogate(value) ||
    UnsafeTextPattern.test(value)
  ) {
    return null
  }

  try {
    const normalized = value.normalize('NFC')
    if (
      normalized.length === 0 ||
      normalized.length > maximumBytes ||
      normalized.trim() !== normalized ||
      hasUnpairedSurrogate(normalized) ||
      UnsafeTextPattern.test(normalized) ||
      TextBytes.encode(normalized).byteLength > maximumBytes
    ) {
      return null
    }
    return normalized
  } catch {
    return null
  }
}

function rawHost(authority: string): string | null {
  if (authority.length === 0 || authority.includes('@')) {
    return null
  }
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']')
    if (closingBracket < 0) {
      return null
    }
    const suffix = authority.slice(closingBracket + 1)
    if (suffix.length > 0 && !/^:\d+$/u.test(suffix)) {
      return null
    }
    return authority.slice(0, closingBracket + 1).toLowerCase()
  }

  const colon = authority.lastIndexOf(':')
  if (colon < 0) {
    return authority.toLowerCase()
  }
  if (
    authority.indexOf(':') !== colon ||
    !/^\d+$/u.test(authority.slice(colon + 1))
  ) {
    return null
  }
  return authority.slice(0, colon).toLowerCase()
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') {
    return true
  }
  if (!CanonicalIPv4LoopbackPattern.test(hostname)) {
    return false
  }
  return hostname
    .split('.')
    .slice(1)
    .every(part => Number(part) >= 0 && Number(part) <= 255)
}

function canonicalEndpoint(value: unknown): string | null {
  const text = canonicalText(value, IssueTrackerEndpointMaximumBytes)
  if (
    text === null ||
    text.includes('\\') ||
    text.includes('?') ||
    text.includes('#')
  ) {
    return null
  }

  const match = text.match(/^(https?):\/\/([^/]+)\/?$/iu)
  if (match === null) {
    return null
  }
  const sourceHost = rawHost(match[2])
  if (sourceHost === null || sourceHost.endsWith('.')) {
    return null
  }

  try {
    const parsed = new URL(text)
    const hostname = parsed.hostname.toLowerCase()
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.pathname !== '/' ||
      hostname.length === 0 ||
      hostname.endsWith('.') ||
      parsed.port === '0'
    ) {
      return null
    }
    if (
      NumericHostPattern.test(sourceHost) &&
      sourceHost !== hostname.toLowerCase()
    ) {
      return null
    }
    if (
      parsed.protocol === 'http:' &&
      hostname === '[::1]' &&
      sourceHost !== '[::1]'
    ) {
      return null
    }
    if (parsed.protocol === 'http:' && !isLoopbackHostname(hostname)) {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

function isProvider(value: unknown): value is IssueTrackerProvider {
  return (
    typeof value === 'string' &&
    IssueTrackerProviders.includes(value as IssueTrackerProvider)
  )
}

function providerEndpointIsAllowed(
  provider: IssueTrackerProvider,
  endpoint: string
): boolean {
  try {
    const parsed = new URL(endpoint)
    const hostname = parsed.hostname.toLowerCase()
    // Loopback is the one explicit local-adapter exception to hosted-origin
    // binding; the wire and scope contracts remain provider-specific.
    if (isLoopbackHostname(hostname)) {
      return true
    }
    switch (provider) {
      case 'jira-cloud':
        return (
          parsed.protocol === 'https:' &&
          hostname !== 'atlassian.net' &&
          hostname.endsWith('.atlassian.net')
        )
      case 'jira-data-center':
        return (
          hostname !== 'atlassian.net' && !hostname.endsWith('.atlassian.net')
        )
      case 'git-integration-for-jira':
        return true
      case 'trello':
        return parsed.protocol === 'https:' && hostname === 'api.trello.com'
      case 'github':
        return parsed.protocol === 'https:' && hostname === 'api.github.com'
      case 'github-enterprise':
        return hostname !== 'github.com' && hostname !== 'api.github.com'
      case 'gitlab':
        return parsed.protocol === 'https:' && hostname === 'gitlab.com'
      case 'gitlab-self-managed':
        return hostname !== 'gitlab.com'
    }
  } catch {
    return false
  }
}

function parseScope(
  value: unknown,
  expectedKind: IssueTrackerScopeKind
): IIssueTrackerScope | null {
  const record = exactDataRecord(value, ScopeKeys)
  const id =
    record === null
      ? null
      : canonicalText(record.id, IssueTrackerScopeIdMaximumBytes)
  if (record === null || record.kind !== expectedKind || id === null) {
    return null
  }
  return Object.freeze({ kind: expectedKind, id })
}

function parseConfiguration(value: unknown): IssueTrackerConfiguration | null {
  try {
    const record = exactDataRecord(value, ConfigurationKeys)
    if (record === null || !isProvider(record.provider)) {
      return null
    }

    const binding = ProviderBindings[record.provider]
    const endpoint = canonicalEndpoint(record.endpoint)
    const accountId = canonicalText(
      record.accountId,
      IssueTrackerAccountIdMaximumBytes
    )
    const configurationId = canonicalText(
      record.configurationId,
      IssueTrackerConfigurationIdMaximumBytes
    )
    const credentialReferenceId = canonicalText(
      record.credentialReferenceId,
      IssueTrackerCredentialReferenceIdMaximumBytes
    )
    const scope = parseScope(record.scope, binding.scopeKind)
    if (
      record.wireVariant !== binding.wireVariant ||
      endpoint === null ||
      !providerEndpointIsAllowed(record.provider, endpoint) ||
      accountId === null ||
      configurationId === null ||
      credentialReferenceId === null ||
      scope === null
    ) {
      return null
    }

    return Object.freeze({
      provider: record.provider,
      endpoint,
      accountId,
      configurationId,
      credentialReferenceId,
      wireVariant: binding.wireVariant,
      scope,
    }) as IssueTrackerConfiguration
  } catch {
    return null
  }
}

export function createIssueTrackerConfiguration(
  value: unknown
): IssueTrackerConfiguration {
  const configuration = parseConfiguration(value)
  return configuration ?? fail('invalid-configuration')
}

export function isIssueTrackerConfiguration(
  value: unknown
): value is IssueTrackerConfiguration {
  return parseConfiguration(value) !== null
}

function encodeConfigurationKey(
  configuration: IssueTrackerConfiguration
): IssueTrackerConfigurationKey {
  return JSON.stringify([
    'issue-tracker-configuration',
    ConfigurationIdentityVersion,
    configuration.provider,
    configuration.endpoint,
    configuration.accountId,
    configuration.configurationId,
    configuration.wireVariant,
    configuration.scope.kind,
    configuration.scope.id,
  ]) as IssueTrackerConfigurationKey
}

export function createIssueTrackerConfigurationKey(
  value: unknown
): IssueTrackerConfigurationKey {
  const configuration = parseConfiguration(value)
  if (configuration === null) {
    fail('invalid-configuration')
  }
  const key = encodeConfigurationKey(configuration)
  if (TextBytes.encode(key).byteLength > IssueTrackerKeyMaximumBytes) {
    fail('invalid-key')
  }
  return key
}

function parseConfigurations(value: unknown):
  | {
      readonly kind: 'valid'
      readonly values: ReadonlyArray<IssueTrackerConfiguration>
    }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'invalid' } {
  const snapshot = snapshotDenseArray(value, IssueTrackerMaximumConfigurations)
  if (snapshot.kind !== 'valid') {
    return { kind: 'invalid' }
  }

  const configurations = new Array<IssueTrackerConfiguration>()
  const keys = new Set<IssueTrackerConfigurationKey>()
  for (const candidate of snapshot.values) {
    const configuration = parseConfiguration(candidate)
    if (configuration === null) {
      return { kind: 'invalid' }
    }
    const key = encodeConfigurationKey(configuration)
    if (keys.has(key)) {
      return { kind: 'duplicate' }
    }
    keys.add(key)
    configurations.push(configuration)
  }
  return { kind: 'valid', values: Object.freeze(configurations) }
}

export function createIssueTrackerConfigurations(
  value: unknown
): ReadonlyArray<IssueTrackerConfiguration> {
  const parsed = parseConfigurations(value)
  if (parsed.kind === 'duplicate') {
    fail('duplicate-configuration')
  }
  if (parsed.kind === 'invalid') {
    fail('invalid-configuration-list')
  }
  return parsed.values
}

export function isIssueTrackerConfigurations(
  value: unknown
): value is ReadonlyArray<IssueTrackerConfiguration> {
  return parseConfigurations(value).kind === 'valid'
}

function parseItemIdentity(value: unknown): IssueTrackerItemIdentity | null {
  try {
    const record = exactDataRecord(value, ItemIdentityKeys)
    if (record === null || !isProvider(record.provider)) {
      return null
    }
    const binding = ProviderBindings[record.provider]
    const endpoint = canonicalEndpoint(record.endpoint)
    const accountId = canonicalText(
      record.accountId,
      IssueTrackerAccountIdMaximumBytes
    )
    const scope = parseScope(record.scope, binding.scopeKind)
    const itemId = canonicalText(record.itemId, IssueTrackerItemIdMaximumBytes)
    if (
      record.wireVariant !== binding.wireVariant ||
      endpoint === null ||
      !providerEndpointIsAllowed(record.provider, endpoint) ||
      accountId === null ||
      scope === null ||
      typeof record.itemKind !== 'string' ||
      !binding.itemKinds.has(record.itemKind as IssueTrackerItemKind) ||
      itemId === null
    ) {
      return null
    }

    return Object.freeze({
      provider: record.provider,
      endpoint,
      accountId,
      wireVariant: binding.wireVariant,
      scope,
      itemKind: record.itemKind,
      itemId,
    }) as IssueTrackerItemIdentity
  } catch {
    return null
  }
}

export function createIssueTrackerItemIdentity(
  value: unknown
): IssueTrackerItemIdentity {
  const identity = parseItemIdentity(value)
  return identity ?? fail('invalid-item-identity')
}

export function isIssueTrackerItemIdentity(
  value: unknown
): value is IssueTrackerItemIdentity {
  return parseItemIdentity(value) !== null
}

function encodeItemKey(
  identity: IssueTrackerItemIdentity
): IssueTrackerItemKey {
  return JSON.stringify([
    'issue-tracker-item',
    ItemIdentityVersion,
    identity.provider,
    identity.endpoint,
    identity.accountId,
    identity.scope.kind,
    identity.scope.id,
    identity.itemKind,
    identity.itemId,
  ]) as IssueTrackerItemKey
}

export function createIssueTrackerItemKey(value: unknown): IssueTrackerItemKey {
  const identity = parseItemIdentity(value)
  if (identity === null) {
    fail('invalid-item-identity')
  }
  const key = encodeItemKey(identity)
  if (TextBytes.encode(key).byteLength > IssueTrackerKeyMaximumBytes) {
    fail('invalid-key')
  }
  return key
}

function parsedKeyValues(
  value: unknown,
  expectedLength: number
): ReadonlyArray<unknown> | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > IssueTrackerKeyMaximumBytes ||
    TextBytes.encode(value).byteLength > IssueTrackerKeyMaximumBytes
  ) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    const snapshot = snapshotDenseArray(parsed, expectedLength)
    return snapshot.kind === 'valid' &&
      snapshot.values.length === expectedLength
      ? snapshot.values
      : null
  } catch {
    return null
  }
}

export function isIssueTrackerConfigurationKey(
  value: unknown
): value is IssueTrackerConfigurationKey {
  try {
    const parsed = parsedKeyValues(value, 9)
    if (
      parsed === null ||
      parsed[0] !== 'issue-tracker-configuration' ||
      parsed[1] !== ConfigurationIdentityVersion
    ) {
      return false
    }
    const configuration = parseConfiguration({
      provider: parsed[2],
      endpoint: parsed[3],
      accountId: parsed[4],
      configurationId: parsed[5],
      credentialReferenceId: 'key-validation-reference',
      wireVariant: parsed[6],
      scope: { kind: parsed[7], id: parsed[8] },
    })
    return (
      configuration !== null && encodeConfigurationKey(configuration) === value
    )
  } catch {
    return false
  }
}

export function isIssueTrackerItemKey(
  value: unknown
): value is IssueTrackerItemKey {
  try {
    const parsed = parsedKeyValues(value, 9)
    if (
      parsed === null ||
      parsed[0] !== 'issue-tracker-item' ||
      parsed[1] !== ItemIdentityVersion ||
      !isProvider(parsed[2])
    ) {
      return false
    }
    const binding = ProviderBindings[parsed[2]]
    const identity = parseItemIdentity({
      provider: parsed[2],
      endpoint: parsed[3],
      accountId: parsed[4],
      wireVariant: binding.wireVariant,
      scope: { kind: parsed[5], id: parsed[6] },
      itemKind: parsed[7],
      itemId: parsed[8],
    })
    return identity !== null && encodeItemKey(identity) === value
  } catch {
    return false
  }
}

function parseAvailabilityValue(
  value: unknown
): IssueTrackerAvailabilityValue | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  return canonicalText(value, IssueTrackerAvailabilityStringMaximumBytes)
}

function parseAvailability(value: unknown): IssueTrackerAvailability | null {
  try {
    const snapshot = snapshotDataRecord(value)
    if (snapshot === null) {
      return null
    }
    if (
      hasExactKeys(snapshot, ['availability']) &&
      snapshot.values.availability === 'unavailable'
    ) {
      return IssueTrackerUnavailable
    }
    if (
      hasExactKeys(snapshot, ['availability']) &&
      snapshot.values.availability === 'not-applicable'
    ) {
      return IssueTrackerNotApplicable
    }
    if (
      !hasExactKeys(snapshot, ['availability', 'value']) ||
      snapshot.values.availability !== 'value'
    ) {
      return null
    }
    const parsedValue = parseAvailabilityValue(snapshot.values.value)
    return parsedValue === null
      ? null
      : Object.freeze({ availability: 'value', value: parsedValue })
  } catch {
    return null
  }
}

export function issueTrackerValue<T extends number | boolean>(
  value: T
): IIssueTrackerValue<T>
export function issueTrackerValue(value: string): IIssueTrackerValue<string>
export function issueTrackerValue(
  value: IssueTrackerAvailabilityValue
): IIssueTrackerValue
export function issueTrackerValue(
  value: IssueTrackerAvailabilityValue
): IIssueTrackerValue {
  const parsed = parseAvailabilityValue(value)
  if (parsed === null) {
    fail('invalid-availability')
  }
  return Object.freeze({ availability: 'value' as const, value: parsed })
}

export function createIssueTrackerAvailability(
  value: unknown
): IssueTrackerAvailability {
  const availability = parseAvailability(value)
  return availability ?? fail('invalid-availability')
}

export function isIssueTrackerAvailability(
  value: unknown
): value is IssueTrackerAvailability {
  return parseAvailability(value) !== null
}
