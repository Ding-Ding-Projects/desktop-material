import { APIError } from './http'

/** Package ecosystems accepted by GitHub's Packages REST API. */
export const GitHubPackageTypes = [
  'npm',
  'maven',
  'rubygems',
  'docker',
  'nuget',
  'container',
] as const

export type GitHubPackageType = typeof GitHubPackageTypes[number]

/**
 * The authenticated-user endpoint deliberately has no login path component.
 * Keeping this as a discriminated union makes incorrect routing hard to express.
 */
export type GitHubPackageOwner =
  | { readonly kind: 'authenticated-user'; readonly login?: never }
  | {
      readonly kind: 'organization' | 'user'
      readonly login: string
    }

export type GitHubPackageVisibility = 'public' | 'private' | 'internal'

export interface IGitHubPackageRepository {
  readonly id: number
  readonly name: string
  readonly fullName: string
  readonly private: boolean
  readonly htmlURL: string | null
}

export interface IGitHubPackage {
  readonly id: number
  readonly name: string
  readonly packageType: GitHubPackageType
  readonly visibility: GitHubPackageVisibility
  readonly versionCount: number
  readonly repository: IGitHubPackageRepository | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly url: string
  readonly htmlURL: string | null
}

export interface IGitHubPackageVersion {
  readonly id: number
  readonly name: string
  readonly packageType: GitHubPackageType
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly url: string
  /** Web page for the parent package, when supplied by GitHub. */
  readonly packageHTMLURL: string | null
  readonly htmlURL: string | null
  readonly description: string | null
  readonly license: string | null
  /** Container tags or legacy Docker tags supplied by GitHub. */
  readonly tags: ReadonlyArray<string>
}

export interface IGitHubPackagePage {
  readonly packages: ReadonlyArray<IGitHubPackage>
  readonly page: number
  readonly nextPage: number | null
  /** True when the provider has more results beyond the local safety cap. */
  readonly capped: boolean
}

export interface IGitHubPackageVersionPage {
  readonly versions: ReadonlyArray<IGitHubPackageVersion>
  readonly page: number
  readonly nextPage: number | null
  /** True when the provider has more results beyond the local safety cap. */
  readonly capped: boolean
}

/** GitHub's maximum documented package-list page size. */
export const GitHubPackagePageSize = 100

/** Keep interactive browsing finite even for unusually large registries. */
export const GitHubPackageMaximumPages = 1_000

/** Bound metadata independently from any later package payload transfer. */
export const GitHubPackageJSONMaximumBytes = 2 * 1024 * 1024

const maximumPackageNameLength = 255
const maximumVersionNameLength = 1024
const maximumURLLength = 4096
const maximumTagCount = 1_000
const maximumTagLength = 255
const controlCharacters = /[\u0000-\u001f\u007f]/
const githubLogin = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const packageTypeSet = new Set<string>(GitHubPackageTypes)

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value as Record<string, unknown>
}

function positiveIdentifier(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function boundedText(
  value: unknown,
  label: string,
  maximumLength: number,
  allowEmpty: boolean = false
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximumLength ||
    (!allowEmpty && value.length === 0) ||
    controlCharacters.test(value)
  ) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number
): string | null {
  return value === undefined || value === null
    ? null
    : boundedText(value, label, maximumLength, true)
}

function date(value: unknown, label: string): Date {
  if (typeof value !== 'string' || value.length > 64) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf())) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return parsed
}

function absoluteHTTPURL(
  value: unknown,
  label: string,
  optional: true
): string | null
function absoluteHTTPURL(
  value: unknown,
  label: string,
  optional?: false
): string
function absoluteHTTPURL(
  value: unknown,
  label: string,
  optional: boolean = false
): string | null {
  if (optional && (value === undefined || value === null)) {
    return null
  }
  const text = boundedText(value, label, maximumURLLength)
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return text
}

function packageType(value: unknown, expected: GitHubPackageType) {
  if (value !== expected) {
    throw new Error('GitHub returned a package from a different ecosystem.')
  }
  return expected
}

function parseRepository(value: unknown): IGitHubPackageRepository | null {
  if (value === undefined || value === null) {
    return null
  }
  const input = record(value, 'package repository')
  if (typeof input.private !== 'boolean') {
    throw new Error('GitHub returned an invalid package repository privacy.')
  }
  return {
    id: positiveIdentifier(input.id, 'package repository id'),
    name: boundedText(input.name, 'package repository name', 255),
    fullName: boundedText(input.full_name, 'package repository full name', 512),
    private: input.private,
    htmlURL: absoluteHTTPURL(input.html_url, 'package repository URL', true),
  }
}

function parsePackage(
  value: unknown,
  expectedType: GitHubPackageType
): IGitHubPackage {
  const input = record(value, 'package')
  const visibility = input.visibility
  if (
    visibility !== 'public' &&
    visibility !== 'private' &&
    visibility !== 'internal'
  ) {
    throw new Error('GitHub returned an invalid package visibility.')
  }
  return {
    id: positiveIdentifier(input.id, 'package id'),
    name: boundedText(input.name, 'package name', maximumPackageNameLength),
    packageType: packageType(input.package_type, expectedType),
    visibility,
    versionCount: nonNegativeInteger(
      input.version_count,
      'package version count'
    ),
    repository: parseRepository(input.repository),
    createdAt: date(input.created_at, 'package creation date'),
    updatedAt: date(input.updated_at, 'package update date'),
    url: absoluteHTTPURL(input.url, 'package API URL'),
    htmlURL: absoluteHTTPURL(input.html_url, 'package HTML URL', true),
  }
}

function parseTags(value: unknown, label: string): ReadonlyArray<string> {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value) || value.length > maximumTagCount) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  const seen = new Set<string>()
  return value.map((tag, index) => {
    const parsed = boundedText(
      tag,
      `${label} at position ${index + 1}`,
      maximumTagLength
    )
    if (seen.has(parsed)) {
      throw new Error(`GitHub returned duplicate ${label}.`)
    }
    seen.add(parsed)
    return parsed
  })
}

function parseVersionTags(
  value: unknown,
  expectedType: GitHubPackageType
): ReadonlyArray<string> {
  if (value === undefined || value === null) {
    return []
  }
  const metadata = record(value, 'package version metadata')
  if (metadata.package_type !== undefined) {
    packageType(metadata.package_type, expectedType)
  }
  if (expectedType === 'container') {
    if (metadata.container === undefined || metadata.container === null) {
      return []
    }
    const container = record(
      metadata.container,
      'container package version metadata'
    )
    return parseTags(container.tags, 'container package tags')
  }
  if (expectedType === 'docker') {
    if (metadata.docker === undefined || metadata.docker === null) {
      return []
    }
    const docker = record(metadata.docker, 'Docker package version metadata')
    return parseTags(docker.tag, 'Docker package tags')
  }
  return []
}

function parseVersion(
  value: unknown,
  expectedType: GitHubPackageType
): IGitHubPackageVersion {
  const input = record(value, 'package version')
  return {
    id: positiveIdentifier(input.id, 'package version id'),
    name: boundedText(
      input.name,
      'package version name',
      maximumVersionNameLength
    ),
    packageType: expectedType,
    createdAt: date(input.created_at, 'package version creation date'),
    updatedAt: date(input.updated_at, 'package version update date'),
    url: absoluteHTTPURL(input.url, 'package version API URL'),
    packageHTMLURL: absoluteHTTPURL(
      input.package_html_url,
      'parent package HTML URL',
      true
    ),
    htmlURL: absoluteHTTPURL(input.html_url, 'package version HTML URL', true),
    description: optionalText(
      input.description,
      'package version description',
      4096
    ),
    license: optionalText(input.license, 'package version license', 255),
    tags: parseVersionTags(input.metadata, expectedType),
  }
}

export function validateGitHubPackageType(value: unknown): GitHubPackageType {
  if (typeof value !== 'string' || !packageTypeSet.has(value)) {
    throw new Error('The GitHub package type is invalid.')
  }
  return value as GitHubPackageType
}

export function validateGitHubPackagePage(page: unknown): number {
  if (
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > GitHubPackageMaximumPages
  ) {
    throw new Error('The requested package page exceeds the app safety limit.')
  }
  return page
}

export function validateGitHubPackageName(value: unknown): string {
  return boundedText(value, 'package name', maximumPackageNameLength)
}

/** Return the exact API path prefix required for this owner kind. */
export function getGitHubPackageOwnerPath(owner: GitHubPackageOwner): string {
  if (typeof owner !== 'object' || owner === null) {
    throw new Error('The GitHub package owner is invalid.')
  }
  if (owner.kind === 'authenticated-user') {
    return 'user'
  }
  if (owner.kind !== 'organization' && owner.kind !== 'user') {
    throw new Error('The GitHub package owner kind is invalid.')
  }
  if (!githubLogin.test(owner.login)) {
    throw new Error('The GitHub package owner login is invalid.')
  }
  const collection = owner.kind === 'organization' ? 'orgs' : 'users'
  return `${collection}/${encodeURIComponent(owner.login)}`
}

/**
 * GitHub does not expose a repository query parameter for package listings.
 * Associate results only through the exact numeric repository id in each
 * package response; owner/name strings may be stale after a transfer.
 */
export function filterGitHubPackagesByRepositoryId(
  packages: ReadonlyArray<IGitHubPackage>,
  repositoryId: number
): ReadonlyArray<IGitHubPackage> {
  positiveIdentifier(repositoryId, 'repository id')
  return packages.filter(pkg => pkg.repository?.id === repositoryId)
}

function hasNextPage(itemCount: number, providerHasNextPage?: boolean) {
  return providerHasNextPage ?? itemCount === GitHubPackagePageSize
}

export function parseGitHubPackagePage(
  value: unknown,
  expectedType: GitHubPackageType,
  page: number = 1,
  providerHasNextPage?: boolean
): IGitHubPackagePage {
  const safeType = validateGitHubPackageType(expectedType)
  const safePage = validateGitHubPackagePage(page)
  if (!Array.isArray(value) || value.length > GitHubPackagePageSize) {
    throw new Error('GitHub returned an invalid package list.')
  }
  const ids = new Set<number>()
  const packages = value.map(item => {
    const parsed = parsePackage(item, safeType)
    if (ids.has(parsed.id)) {
      throw new Error('GitHub returned duplicate package ids.')
    }
    ids.add(parsed.id)
    return parsed
  })
  const more = hasNextPage(packages.length, providerHasNextPage)
  return {
    packages,
    page: safePage,
    nextPage:
      more && safePage < GitHubPackageMaximumPages ? safePage + 1 : null,
    capped: more && safePage === GitHubPackageMaximumPages,
  }
}

export function parseGitHubPackageVersionPage(
  value: unknown,
  expectedType: GitHubPackageType,
  page: number = 1,
  providerHasNextPage?: boolean
): IGitHubPackageVersionPage {
  const safeType = validateGitHubPackageType(expectedType)
  const safePage = validateGitHubPackagePage(page)
  if (!Array.isArray(value) || value.length > GitHubPackagePageSize) {
    throw new Error('GitHub returned an invalid package version list.')
  }
  const ids = new Set<number>()
  const versions = value.map(item => {
    const parsed = parseVersion(item, safeType)
    if (ids.has(parsed.id)) {
      throw new Error('GitHub returned duplicate package version ids.')
    }
    ids.add(parsed.id)
    return parsed
  })
  const more = hasNextPage(versions.length, providerHasNextPage)
  return {
    versions,
    page: safePage,
    nextPage:
      more && safePage < GitHubPackageMaximumPages ? safePage + 1 : null,
    capped: more && safePage === GitHubPackageMaximumPages,
  }
}

export class GitHubPackageJSONError extends Error {
  public constructor(
    message: string,
    public readonly kind: 'too-large' | 'invalid-length' | 'invalid-json'
  ) {
    super(message)
    this.name = 'GitHubPackageJSONError'
  }
}

function abortError(): Error {
  const error = new Error('GitHub Packages request canceled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError()
  }
}

/** Read package metadata without retaining more than the explicit byte cap. */
export async function readBoundedGitHubPackageJSON(
  response: Response,
  signal?: AbortSignal
): Promise<unknown> {
  throwIfAborted(signal)
  const rawLength = response.headers.get('content-length')
  if (rawLength !== null) {
    if (!/^\d+$/.test(rawLength) || !Number.isSafeInteger(Number(rawLength))) {
      await response.body?.cancel().catch(() => undefined)
      throw new GitHubPackageJSONError(
        'GitHub returned an invalid package metadata size.',
        'invalid-length'
      )
    }
    if (Number(rawLength) > GitHubPackageJSONMaximumBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new GitHubPackageJSONError(
        'GitHub returned more package metadata than the app can process safely.',
        'too-large'
      )
    }
  }
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new GitHubPackageJSONError(
      'GitHub returned an invalid empty package response.',
      'invalid-json'
    )
  }
  const chunks = new Array<Uint8Array>()
  let received = 0
  const cancel = () => reader.cancel(abortError()).catch(() => undefined)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      throwIfAborted(signal)
      const next = await reader.read()
      throwIfAborted(signal)
      if (next.done) {
        break
      }
      if (received + next.value.byteLength > GitHubPackageJSONMaximumBytes) {
        await reader.cancel().catch(() => undefined)
        throwIfAborted(signal)
        throw new GitHubPackageJSONError(
          'GitHub returned more package metadata than the app can process safely.',
          'too-large'
        )
      }
      chunks.push(next.value)
      received += next.value.byteLength
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    ) as unknown
  } catch {
    throw new GitHubPackageJSONError(
      'GitHub returned invalid package metadata.',
      'invalid-json'
    )
  }
}

function boundedAPIError(value: unknown): { readonly message?: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const message = (value as Record<string, unknown>).message
  return typeof message === 'string' && message.length <= 512
    ? { message }
    : null
}

/** Parse one bounded response while retaining typed provider errors. */
export async function boundedGitHubPackageResponse(
  response: Response,
  signal?: AbortSignal
): Promise<unknown> {
  let value: unknown
  try {
    value = await readBoundedGitHubPackageJSON(response, signal)
  } catch (error) {
    if (!response.ok && error instanceof GitHubPackageJSONError) {
      throw new APIError(response, null)
    }
    throw error
  }
  if (!response.ok) {
    throw new APIError(response, boundedAPIError(value))
  }
  return value
}

/** Read a bounded Link header without trusting its target URL. */
export function githubPackageResponseHasNextPage(
  response: Response
): boolean | undefined {
  const link = response.headers.get('link')
  if (link === null) {
    return undefined
  }
  if (link.length > 16 * 1024) {
    throw new Error('GitHub returned an invalid package pagination header.')
  }
  return link
    .split(',')
    .some(part =>
      /(?:^|;)\s*rel\s*=\s*"[^"]*\bnext\b[^"]*"\s*(?:;|$)/i.test(part)
    )
}
