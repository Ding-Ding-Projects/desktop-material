import type {
  GitHubContainerPackageOwnerKind,
  IAPIFullRepository,
} from '../api'
import {
  CheapLfsGhcrPolicyPendingError,
  CheapLfsRegistryRuntimeError,
  CheapLfsRegistryVisibility,
  ICheapLfsGitHubRepositoryIdentityInput,
  ICheapLfsRegistryCredentials,
  ICheapLfsRegistryRepositoryPolicy,
  ICheapLfsRegistryRepositoryPolicyApi,
  ICheapLfsSourceRepositoryPolicy,
  ICheapLfsSourceRepositoryPolicyApi,
  getCheapLfsGitHubRepositoryIdentity,
} from './oci-registry-runtime'
import { readBoundedRegistryPolicyJson } from './registry-policy-response'

const DockerHubApiRoot = 'https://hub.docker.com'
const DefaultPolicyTimeoutMs = 20_000
const GitHubOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const OciComponentPattern = /^[a-z0-9]+(?:(?:[._]|__|[-]*)[a-z0-9]+)*$/

type JsonObject = { readonly [key: string]: unknown }

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownString(value: JsonObject, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return null
  }
  return typeof value[key] === 'string' ? (value[key] as string) : null
}

function policyError(): CheapLfsRegistryRuntimeError {
  return new CheapLfsRegistryRuntimeError(
    'policy',
    'Cheap LFS could not verify source repository access and registry visibility.'
  )
}

function canonicalRepositoryId(value: number | string): number {
  const numericId = typeof value === 'number' ? value : Number(value)
  if (
    !Number.isSafeInteger(numericId) ||
    numericId <= 0 ||
    String(numericId) !== String(value)
  ) {
    throw policyError()
  }
  return numericId
}

function validateSourceCoordinate(
  source: ICheapLfsGitHubRepositoryIdentityInput
): {
  readonly repositoryId: number
  readonly owner: string
  readonly name: string
} {
  const repositoryId = canonicalRepositoryId(source.repositoryId)
  if (
    !GitHubOwnerPattern.test(source.owner) ||
    source.name.length === 0 ||
    source.name.length > 100 ||
    !/^[A-Za-z0-9._-]+$/.test(source.name)
  ) {
    throw policyError()
  }
  return { repositoryId, owner: source.owner, name: source.name }
}

function accessFor(repository: IAPIFullRepository) {
  if (repository.permissions?.admin === true) {
    return 'admin' as const
  }
  if (repository.permissions?.push === true) {
    return 'write' as const
  }
  if (repository.permissions?.pull === true) {
    return 'read' as const
  }
  return 'none' as const
}

function requireExactSourceRepository(
  source: ICheapLfsGitHubRepositoryIdentityInput,
  repository: IAPIFullRepository | null
): IAPIFullRepository {
  const expected = validateSourceCoordinate(source)
  if (
    repository === null ||
    repository.id !== expected.repositoryId ||
    repository.owner.login.toLowerCase() !== expected.owner.toLowerCase() ||
    repository.name.toLowerCase() !== expected.name.toLowerCase() ||
    typeof repository.private !== 'boolean'
  ) {
    throw policyError()
  }
  return repository
}

export interface ICheapLfsGitHubPolicyApi {
  fetchRepository(
    owner: string,
    name: string
  ): Promise<IAPIFullRepository | null>
  fetchGitHubContainerPackageMetadata(
    owner: string,
    packageName: string,
    ownerKind: GitHubContainerPackageOwnerKind,
    signal?: AbortSignal
  ): Promise<unknown | null>
}

/** Authoritative source-repository policy from the signed-in GitHub API. */
export class GitHubCheapLfsSourceRepositoryPolicyApi
  implements ICheapLfsSourceRepositoryPolicyApi
{
  public constructor(private readonly api: ICheapLfsGitHubPolicyApi) {}

  public async inspectSourceRepository(
    source: ICheapLfsGitHubRepositoryIdentityInput
  ): Promise<ICheapLfsSourceRepositoryPolicy> {
    const repository = requireExactSourceRepository(
      source,
      await this.api.fetchRepository(source.owner, source.name)
    )
    return {
      repositoryIdentity: getCheapLfsGitHubRepositoryIdentity(repository.id!),
      repositoryUrl: `https://github.com/${repository.owner.login.toLowerCase()}/${repository.name.toLowerCase()}`,
      owner: repository.owner.login,
      name: repository.name,
      visibility: repository.private ? 'private' : 'public',
      access: accessFor(repository),
    }
  }
}

function packageOwnerKind(
  repository: IAPIFullRepository,
  authenticatedLogin: string
): GitHubContainerPackageOwnerKind {
  if (
    repository.owner.type === 'User' &&
    repository.owner.login.toLowerCase() === authenticatedLogin.toLowerCase()
  ) {
    return 'authenticated-user'
  }
  return repository.owner.type === 'Organization' ? 'organization' : 'user'
}

function requireGitHubPackagePolicy(
  value: unknown,
  source: {
    readonly repositoryId: number
    readonly owner: string
    readonly name: string
  },
  allowPendingRepositoryLink: boolean
): ICheapLfsRegistryRepositoryPolicy {
  if (!isObject(value)) {
    throw policyError()
  }
  const packageName = `${source.name.toLowerCase()}-cheap-lfs`
  const visibility = ownString(value, 'visibility')
  const repository = value.repository
  if (
    ownString(value, 'name') !== packageName ||
    ownString(value, 'package_type') !== 'container' ||
    (visibility !== 'public' && visibility !== 'private')
  ) {
    throw policyError()
  }
  if (repository === null || repository === undefined) {
    if (allowPendingRepositoryLink) {
      throw new CheapLfsGhcrPolicyPendingError()
    }
    throw policyError()
  }
  if (
    !isObject(repository) ||
    repository.id !== source.repositoryId ||
    ownString(repository, 'name')?.toLowerCase() !==
      source.name.toLowerCase() ||
    ownString(repository, 'full_name')?.toLowerCase() !==
      `${source.owner}/${source.name}`.toLowerCase() ||
    repository.private !== (visibility === 'private')
  ) {
    throw policyError()
  }
  return {
    visibility,
    hasPushAccess: true,
    linkedRepositoryIdentity: getCheapLfsGitHubRepositoryIdentity(
      source.repositoryId
    ),
    linkedRepositoryUrl: `https://github.com/${source.owner.toLowerCase()}/${source.name.toLowerCase()}`,
  }
}

/**
 * Inspect the GHCR package only after an authenticated immutable push. The
 * successful push proves package write access; this API check proves exact
 * source linkage and matching visibility before the mutable tag is moved.
 */
export class GhcrCheapLfsRegistryRepositoryPolicyApi
  implements ICheapLfsRegistryRepositoryPolicyApi
{
  public constructor(
    private readonly api: ICheapLfsGitHubPolicyApi,
    private readonly source: ICheapLfsGitHubRepositoryIdentityInput,
    private readonly authenticatedLogin: string
  ) {}

  private async loadRegistryRepository(
    target: {
      readonly provider: 'ghcr' | 'docker-hub'
      readonly registryRepository: string
    },
    signal?: AbortSignal,
    allowPendingRepositoryLink = false
  ): Promise<ICheapLfsRegistryRepositoryPolicy | null> {
    const source = validateSourceCoordinate(this.source)
    const expected =
      `ghcr.io/${source.owner}/${source.name}-cheap-lfs`.toLowerCase()
    if (
      target.provider !== 'ghcr' ||
      target.registryRepository !== expected ||
      !GitHubOwnerPattern.test(this.authenticatedLogin)
    ) {
      throw policyError()
    }
    const repository = requireExactSourceRepository(
      this.source,
      await this.api.fetchRepository(source.owner, source.name)
    )
    const policy = await this.api.fetchGitHubContainerPackageMetadata(
      repository.owner.login,
      `${repository.name.toLowerCase()}-cheap-lfs`,
      packageOwnerKind(repository, this.authenticatedLogin),
      signal
    )
    if (!['write', 'admin'].includes(accessFor(repository))) {
      throw policyError()
    }
    return policy === null
      ? null
      : requireGitHubPackagePolicy(policy, source, allowPendingRepositoryLink)
  }

  /**
   * Fail before uploading a public source when GitHub would create the first
   * GHCR package as private. GitHub exposes visibility changes only through
   * package settings, so Release/Docker Hub is the automatic public fallback.
   */
  public async preflightRegistryRepository(
    target: { readonly provider: 'ghcr'; readonly registryRepository: string },
    visibility: CheapLfsRegistryVisibility
  ): Promise<void> {
    const policy = await this.loadRegistryRepository(target)
    if (policy === null) {
      if (visibility === 'private') {
        return
      }
      throw new CheapLfsRegistryRuntimeError(
        'policy',
        'GitHub creates a first GHCR package as private and has no supported visibility-change API. Use published Release or Docker Hub storage, or make an existing linked GHCR package public in GitHub package settings.'
      )
    }
    if (policy.visibility !== visibility || !policy.hasPushAccess) {
      throw policyError()
    }
  }

  public async inspectRegistryRepository(
    target: {
      readonly provider: 'ghcr' | 'docker-hub'
      readonly registryRepository: string
    },
    signal?: AbortSignal
  ): Promise<ICheapLfsRegistryRepositoryPolicy> {
    const policy = await this.loadRegistryRepository(target, signal, true)
    if (policy === null) {
      throw new CheapLfsGhcrPolicyPendingError()
    }
    return policy
  }
}

export interface ICheapLfsRegistryPolicyFetch {
  (url: string, init: RequestInit): Promise<Response>
}

interface IDockerHubCoordinate {
  readonly namespace: string
  readonly repository: string
}

function dockerHubCoordinate(registryRepository: string): IDockerHubCoordinate {
  const match = /^docker\.io\/([^/]+)\/([^/]+)$/.exec(registryRepository)
  const namespace = match?.[1]
  const repository = match?.[2]
  if (
    namespace === undefined ||
    repository === undefined ||
    !/^[a-z0-9](?:[a-z0-9_-]{0,253}[a-z0-9])?$/.test(namespace) ||
    !OciComponentPattern.test(repository)
  ) {
    throw policyError()
  }
  return { namespace, repository }
}

function checkedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 60_000) {
    throw policyError()
  }
  return value
}

async function withResponseTimeout<T>(
  fetcher: ICheapLfsRegistryPolicyFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (response: Response, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) {
    abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), checkedTimeout(timeoutMs))
  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    return await operation(response, controller.signal)
  } catch (error) {
    if (error instanceof CheapLfsRegistryRuntimeError) {
      throw error
    }
    throw policyError()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

function requireDockerHubRepositoryPolicy(
  value: unknown,
  expected: IDockerHubCoordinate
): ICheapLfsRegistryRepositoryPolicy {
  if (!isObject(value)) {
    throw policyError()
  }
  const namespaceValue = value.namespace
  const namespace =
    typeof namespaceValue === 'string'
      ? namespaceValue
      : isObject(namespaceValue)
      ? ownString(namespaceValue, 'name')
      : null
  const permissions = value.permissions
  if (
    ownString(value, 'name') !== expected.repository ||
    namespace !== expected.namespace ||
    typeof value.is_private !== 'boolean' ||
    !isObject(permissions)
  ) {
    throw policyError()
  }
  return {
    visibility: value.is_private ? 'private' : 'public',
    hasPushAccess: permissions.write === true || permissions.admin === true,
    linkedRepositoryIdentity: null,
    linkedRepositoryUrl: null,
  }
}

/** Authenticated, bounded Docker Hub repository creation and policy checks. */
export class DockerHubCheapLfsRegistryRepositoryPolicyApi
  implements ICheapLfsRegistryRepositoryPolicyApi
{
  private readonly timeoutMs: number

  public constructor(
    private readonly credentials: ICheapLfsRegistryCredentials,
    private readonly fetcher: ICheapLfsRegistryPolicyFetch = fetch,
    timeoutMs: number = DefaultPolicyTimeoutMs
  ) {
    this.timeoutMs = checkedTimeout(timeoutMs)
  }

  private async withBearer<T>(
    operation: (authorization: string) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const username = this.credentials.username
    const secret = Buffer.from(this.credentials.token)
    const body = Buffer.from(
      `{"identifier":${JSON.stringify(username)},"secret":${JSON.stringify(
        secret.toString('utf8')
      )}}`,
      'utf8'
    )
    secret.fill(0)
    let value: unknown
    try {
      value = await withResponseTimeout(
        this.fetcher,
        `${DockerHubApiRoot}/v2/auth/token`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body,
        },
        this.timeoutMs,
        signal,
        (response, responseSignal) =>
          readBoundedRegistryPolicyJson(response, responseSignal)
      )
    } finally {
      body.fill(0)
    }
    if (!isObject(value)) {
      throw policyError()
    }
    const token = ownString(value, 'access_token')
    if (
      token === null ||
      token.length === 0 ||
      token.length > 16 * 1024 ||
      /[\r\n]/.test(token)
    ) {
      throw policyError()
    }
    return await operation(`Bearer ${token}`)
  }

  private async fetchRepository(
    coordinate: IDockerHubCoordinate,
    authorization: string,
    signal?: AbortSignal
  ): Promise<ICheapLfsRegistryRepositoryPolicy | null> {
    return await withResponseTimeout(
      this.fetcher,
      `${DockerHubApiRoot}/v2/namespaces/${coordinate.namespace}/repositories/${coordinate.repository}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: authorization },
      },
      this.timeoutMs,
      signal,
      async (response, responseSignal) => {
        if (response.status === 404) {
          await response.body?.cancel().catch(() => undefined)
          return null
        }
        return requireDockerHubRepositoryPolicy(
          await readBoundedRegistryPolicyJson(response, responseSignal),
          coordinate
        )
      }
    )
  }

  public async ensureRegistryRepository(
    registryRepository: string,
    visibility: CheapLfsRegistryVisibility,
    signal?: AbortSignal
  ): Promise<ICheapLfsRegistryRepositoryPolicy> {
    const coordinate = dockerHubCoordinate(registryRepository)
    return await this.withBearer(async authorization => {
      let policy = await this.fetchRepository(coordinate, authorization, signal)
      if (policy === null) {
        const body = Buffer.from(
          JSON.stringify({
            name: coordinate.repository,
            namespace: coordinate.namespace,
            description: 'Desktop Material Cheap LFS storage',
            is_private: visibility === 'private',
          }),
          'utf8'
        )
        try {
          await withResponseTimeout(
            this.fetcher,
            `${DockerHubApiRoot}/v2/namespaces/${coordinate.namespace}/repositories`,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                Authorization: authorization,
                'Content-Type': 'application/json',
              },
              body,
            },
            this.timeoutMs,
            signal,
            (response, responseSignal) =>
              readBoundedRegistryPolicyJson(response, responseSignal)
          )
        } finally {
          body.fill(0)
        }
        policy = await this.fetchRepository(coordinate, authorization, signal)
      }
      if (
        policy === null ||
        policy.visibility !== visibility ||
        !policy.hasPushAccess
      ) {
        throw policyError()
      }
      return policy
    }, signal)
  }

  public async inspectRegistryRepository(
    target: {
      readonly provider: 'ghcr' | 'docker-hub'
      readonly registryRepository: string
    },
    signal?: AbortSignal
  ): Promise<ICheapLfsRegistryRepositoryPolicy> {
    if (target.provider !== 'docker-hub') {
      throw policyError()
    }
    const coordinate = dockerHubCoordinate(target.registryRepository)
    return await this.withBearer(async authorization => {
      const policy = await this.fetchRepository(
        coordinate,
        authorization,
        signal
      )
      if (policy === null) {
        throw policyError()
      }
      return policy
    }, signal)
  }
}
