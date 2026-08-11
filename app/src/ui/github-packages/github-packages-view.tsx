import * as Path from 'path'
import * as React from 'react'
import { AutoSizer, Index, List, ListRowProps } from 'react-virtualized'
import memoizeOne from 'memoize-one'
import { API, IAPIFullRepository, getHTMLURL } from '../../lib/api'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import {
  downloadGitHubContainerFile,
  uploadGitHubContainerFile,
} from '../../lib/github-container-file-transfer'
import {
  filterGitHubPackagesByRepositoryId,
  GitHubPackageMaximumPages,
  GitHubPackageOwner,
  GitHubPackageType,
  GitHubPackageTypes,
  IGitHubPackage,
  IGitHubPackagePage,
  IGitHubPackageVersion,
  IGitHubPackageVersionPage,
} from '../../lib/github-packages'
import { Account, getAccountKey, isDotComAccount } from '../../models/account'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { t } from '../../lib/i18n'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { LinkButton } from '../lib/link-button'
import {
  showItemInFolder,
  showOpenDialog,
  showSaveDialog,
} from '../main-process-proxy'

const PackagesSearchFilterId = 'github-packages-search'
const PackageVersionsSearchFilterId = 'github-package-versions-search'

/**
 * Width used before the AutoSizer has produced a real measurement (initial
 * mount and non-laid-out environments such as jsdom report zero width).
 */
const VirtualizedListFallbackWidth = 640
/** Maximum viewport height of a virtualized package or version list. */
const VirtualizedListMaximumHeight = 480
/** Vertical spacing preserved between virtualized rows (former grid gap). */
const VirtualizedRowGap = 10
const PackageRowBaseHeight = 80
const PackageRowLinkExtraHeight = 26
const VersionRowBaseHeight = 112
const VersionRowTagsExtraHeight = 34

/**
 * react-virtualized's Grid defaults its inner cell container to role="row",
 * which is nonsense between our role="list" and role="listitem" elements. The
 * prop exists at runtime but is missing from the bundled typings.
 */
const virtualizedListContainerProps = { containerRole: 'presentation' }

type PackageTypeFilter = 'all' | GitHubPackageType
type BusyTransfer = 'upload' | 'download' | null

export interface IGitHubPackagesClient {
  fetchRepository(
    owner: string,
    name: string
  ): Promise<IAPIFullRepository | null>
  fetchGitHubPackages(
    owner: GitHubPackageOwner,
    packageType: GitHubPackageType,
    page?: number,
    signal?: AbortSignal
  ): Promise<IGitHubPackagePage>
  fetchGitHubPackageVersions(
    owner: GitHubPackageOwner,
    packageType: GitHubPackageType,
    packageName: string,
    page?: number,
    signal?: AbortSignal
  ): Promise<IGitHubPackageVersionPage>
}

export interface IGitHubPackageFileUploadRequest {
  readonly account: Account
  readonly owner: string
  readonly repository: string
  readonly sourceRepositoryURL: string
  readonly packageName: string
  readonly sourcePath: string
  readonly signal?: AbortSignal
  readonly onProgress?: (message: string) => void
}

export interface IGitHubPackageFileUploadResult {
  readonly packageName: string
  readonly immutableReference: string
  readonly manifestDigest: string
}

export interface IGitHubPackageFileDownloadRequest {
  readonly account: Account
  readonly owner: string
  readonly repository: string
  readonly sourceRepositoryURL: string
  readonly packageName: string
  readonly versionDigest: string
  readonly chooseDestination: (fileName: string) => Promise<string | null>
  readonly signal?: AbortSignal
  readonly onProgress?: (message: string) => void
}

export interface IGitHubPackageFileDownloadResult {
  readonly destinationPath: string
  readonly fileName: string
  readonly digest: string
  readonly sizeInBytes: number
}

export interface IGitHubPackageFileTransferClient {
  uploadFile(
    request: IGitHubPackageFileUploadRequest
  ): Promise<IGitHubPackageFileUploadResult>
  downloadFile(
    request: IGitHubPackageFileDownloadRequest
  ): Promise<IGitHubPackageFileDownloadResult>
}

interface IGitHubPackagesViewProps {
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly clientFactory?: (account: Account) => IGitHubPackagesClient
  readonly transferClient?: IGitHubPackageFileTransferClient
  readonly chooseUploadFile?: () => Promise<string | null>
  readonly chooseDownloadDestination?: (
    fileName: string
  ) => Promise<string | null>
  /** Tests and deterministic previews may suppress the initial live request. */
  readonly autoLoad?: boolean
  /**
   * Re-runs sign-in for the account whose token is missing a scope. Without
   * it the scope error is a dead end: the message names what is missing and
   * offers no way to fix it.
   */
  readonly onReauthorize?: (account: Account) => void
}

/**
 * Whether an error is GitHub refusing for a missing token scope rather than a
 * transport or permission failure. GitHub phrases these as "you need at least
 * <scope> scope", so the scope name is matched rather than the whole
 * sentence, which varies by endpoint.
 */
export function missingPackagesScope(error: string | null): string | null {
  if (error === null) {
    return null
  }
  const match =
    /\b(?:at least\s+)?(read:packages|write:packages|repo)\b[^.]*\bscope\b/i.exec(
      error
    )
  return match === null ? null : match[1].toLowerCase()
}

interface IGitHubPackagesViewState {
  readonly contextKey: string
  readonly packages: ReadonlyArray<IGitHubPackage>
  readonly repositoryId: number | null
  readonly canonicalRepositoryURL: string | null
  readonly nextPackagePages: Readonly<
    Partial<Record<GitHubPackageType, number>>
  >
  readonly packagesCapped: boolean
  readonly loadingPackages: boolean
  readonly loadingAllPackages: boolean
  readonly selectedPackageKey: string | null
  readonly versions: ReadonlyArray<IGitHubPackageVersion>
  readonly nextVersionPage: number | null
  readonly versionsCapped: boolean
  readonly loadingVersions: boolean
  readonly packageQuery: string
  readonly packageSearchMode: FilterMode
  readonly packageSearchCaseSensitive: boolean
  readonly packageTypeFilter: PackageTypeFilter
  readonly versionQuery: string
  readonly versionSearchMode: FilterMode
  readonly versionSearchCaseSensitive: boolean
  readonly uploadPackageName: string
  readonly pendingUploadPath: string | null
  readonly busyTransfer: BusyTransfer
  readonly transferProgress: string | null
  readonly completedDownload: IGitHubPackageFileDownloadResult | null
  readonly message: string | null
  readonly error: string | null
}

const accountObjectKeys = new WeakMap<Account, number>()
let nextAccountObjectKey = 0

function accountObjectKey(account: Account | null): number | null {
  if (account === null) {
    return null
  }
  const existing = accountObjectKeys.get(account)
  if (existing !== undefined) {
    return existing
  }
  const created = ++nextAccountObjectKey
  accountObjectKeys.set(account, created)
  return created
}

function packageKey(value: IGitHubPackage): string {
  return `${value.packageType}:${value.id}`
}

function appendPackages(
  current: ReadonlyArray<IGitHubPackage>,
  additions: ReadonlyArray<IGitHubPackage>
): ReadonlyArray<IGitHubPackage> {
  const byKey = new Map(current.map(value => [packageKey(value), value]))
  for (const value of additions) {
    byKey.set(packageKey(value), value)
  }
  return [...byKey.values()].sort(
    (left, right) =>
      right.updatedAt.valueOf() - left.updatedAt.valueOf() ||
      left.name.localeCompare(right.name)
  )
}

function appendVersions(
  current: ReadonlyArray<IGitHubPackageVersion>,
  additions: ReadonlyArray<IGitHubPackageVersion>
): ReadonlyArray<IGitHubPackageVersion> {
  const byId = new Map(current.map(value => [value.id, value]))
  for (const value of additions) {
    byId.set(value.id, value)
  }
  return [...byId.values()].sort(
    (left, right) => right.updatedAt.valueOf() - left.updatedAt.valueOf()
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'GitHub Packages could not complete this operation safely.'
}

/** Choose the least-privileged GitHub Packages owner endpoint. */
export function getGitHubPackageOwner(
  repository: Repository,
  account: Account
): GitHubPackageOwner | null {
  const remote = repository.gitHubRepository
  if (
    remote === null ||
    account.provider !== 'github' ||
    account.endpoint !== remote.endpoint
  ) {
    return null
  }
  if (remote.owner.type === 'Organization') {
    return { kind: 'organization', login: remote.owner.login }
  }
  return remote.owner.login.toLowerCase() === account.login.toLowerCase()
    ? { kind: 'authenticated-user' }
    : { kind: 'user', login: remote.owner.login }
}

/** A valid, predictable GHCR package coordinate for the current repository. */
export function defaultGitHubFilePackageName(repositoryName: string): string {
  const normalized = repositoryName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 190)
  return `${normalized || 'repository'}-desktop-material-files`
}

function getRepositoryAccount(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Account | null {
  const remote = repository.gitHubRepository
  const account = getAccountForRepository(accounts, repository)
  return remote !== null &&
    account?.provider === 'github' &&
    account.endpoint === remote.endpoint
    ? account
    : null
}

function contextKey(props: IGitHubPackagesViewProps): string {
  const remote = props.repository.gitHubRepository
  const account = getRepositoryAccount(props.repository, props.accounts)
  return JSON.stringify([
    props.repository.id,
    remote?.endpoint ?? null,
    remote?.owner.login ?? null,
    remote?.name ?? null,
    account === null ? null : getAccountKey(account),
    accountObjectKey(account),
  ])
}

function providerURL(
  url: string | null,
  account: Account | null
): string | null {
  if (url === null || account === null) {
    return null
  }
  try {
    const candidate = new URL(url)
    const provider = new URL(getHTMLURL(account.endpoint))
    return candidate.origin === provider.origin ? candidate.href : null
  } catch {
    return null
  }
}

function initialState(
  props: IGitHubPackagesViewProps
): IGitHubPackagesViewState {
  return {
    contextKey: contextKey(props),
    packages: [],
    repositoryId: null,
    canonicalRepositoryURL: null,
    nextPackagePages: {},
    packagesCapped: false,
    loadingPackages: false,
    loadingAllPackages: false,
    selectedPackageKey: null,
    versions: [],
    nextVersionPage: null,
    versionsCapped: false,
    loadingVersions: false,
    packageQuery: '',
    packageSearchMode: readPersistedFilterMode(PackagesSearchFilterId),
    packageSearchCaseSensitive: false,
    packageTypeFilter: 'all',
    versionQuery: '',
    versionSearchMode: readPersistedFilterMode(PackageVersionsSearchFilterId),
    versionSearchCaseSensitive: false,
    uploadPackageName: defaultGitHubFilePackageName(
      props.repository.gitHubRepository?.name ?? 'repository'
    ),
    pendingUploadPath: null,
    busyTransfer: null,
    transferProgress: null,
    completedDownload: null,
    message: null,
    error: null,
  }
}

const defaultClientFactory = (account: Account): IGitHubPackagesClient =>
  API.fromAccount(account)

const defaultTransferClient: IGitHubPackageFileTransferClient = {
  uploadFile: async request => {
    request.onProgress?.('Uploading the reviewed file to GHCR…')
    const result = await uploadGitHubContainerFile({
      account: request.account,
      registryRepository: `ghcr.io/${request.owner.toLowerCase()}/${request.packageName.toLowerCase()}`,
      sourceRepositoryUrl: request.sourceRepositoryURL,
      sourcePath: request.sourcePath,
      signal: request.signal,
    })
    return {
      packageName: request.packageName,
      immutableReference: result.immutableReference,
      manifestDigest: result.manifestDigest,
    }
  },
  downloadFile: async request => {
    const suggestedName = `${request.packageName}-${request.versionDigest.slice(
      7,
      19
    )}.package`
    const destinationPath = await request.chooseDestination(suggestedName)
    if (destinationPath === null) {
      const error = new Error('Package download canceled.')
      error.name = 'AbortError'
      throw error
    }
    request.onProgress?.('Downloading and verifying the immutable GHCR file…')
    const result = await downloadGitHubContainerFile({
      account: request.account,
      registryRepository: `ghcr.io/${request.owner.toLowerCase()}/${request.packageName.toLowerCase()}`,
      sourceRepositoryUrl: request.sourceRepositoryURL,
      manifestDigest: request.versionDigest,
      destinationPath,
      signal: request.signal,
    })
    return {
      destinationPath: result.destinationPath,
      fileName: result.title,
      digest: result.layerDigest,
      sizeInBytes: result.sizeInBytes,
    }
  },
}

export class GitHubPackagesView extends React.Component<
  IGitHubPackagesViewProps,
  IGitHubPackagesViewState
> {
  private mounted = false
  private generation = 0
  private packageController: AbortController | null = null
  private versionController: AbortController | null = null
  private transferController: AbortController | null = null

  /**
   * Memoized so that a render caused by unrelated state (transfer progress,
   * page appends, selection) reuses the previous filter result instead of
   * re-running matchWithMode over up to 100,000 rows, and so the row array
   * identity is stable for the virtualized list.
   */
  private getVisiblePackages = memoizeOne(
    (
      packages: ReadonlyArray<IGitHubPackage>,
      packageTypeFilter: PackageTypeFilter,
      packageQuery: string,
      mode: FilterMode,
      caseSensitive: boolean
    ) => {
      const candidates =
        packageTypeFilter === 'all'
          ? packages
          : packages.filter(value => value.packageType === packageTypeFilter)
      const query = packageQuery.trim()
      if (query.length === 0) {
        return { packages: candidates, regexError: null as string | null }
      }
      const result = matchWithMode(
        query,
        candidates,
        value => [
          value.name,
          `${value.packageType} ${value.visibility} ${
            value.repository?.fullName ?? ''
          }`,
        ],
        { mode, caseSensitive }
      )
      return {
        packages: result.results.map(value => value.item),
        regexError: result.regexError,
      }
    }
  )

  private getVisibleVersions = memoizeOne(
    (
      versions: ReadonlyArray<IGitHubPackageVersion>,
      versionQuery: string,
      mode: FilterMode,
      caseSensitive: boolean
    ) => {
      const query = versionQuery.trim()
      if (query.length === 0) {
        return { versions, regexError: null as string | null }
      }
      const result = matchWithMode(
        query,
        versions,
        value => [
          value.name,
          `${value.tags.join(' ')} ${value.description ?? ''} ${
            value.license ?? ''
          }`,
        ],
        { mode, caseSensitive }
      )
      return {
        versions: result.results.map(value => value.item),
        regexError: result.regexError,
      }
    }
  )

  /**
   * Memoized on its data inputs so the virtualized List (a PureComponent)
   * re-renders exactly when a row could look different and not otherwise.
   */
  private createPackageRowRenderer = memoizeOne(
    (
        packages: ReadonlyArray<IGitHubPackage>,
        selectedPackageKey: string | null,
        account: Account | null
      ) =>
      // Not a component: this is a react-virtualized rowRenderer callback, so
      // ListRowProps is the library's parameter type rather than React props.
      // eslint-disable-next-line react/prop-types
      ({ index, key, style }: ListRowProps) => {
        const value = packages[index]
        if (value === undefined) {
          return null
        }
        const selected = packageKey(value) === selectedPackageKey
        const packageURL = providerURL(value.htmlURL, account)
        return (
          <div
            key={key}
            style={style}
            role="listitem"
            className="github-package-virtual-row"
          >
            <div className={`github-package-row${selected ? ' selected' : ''}`}>
              <button
                type="button"
                className="github-package-select"
                data-package-key={packageKey(value)}
                onClick={this.onSelectPackage}
                aria-pressed={selected}
              >
                <span className="github-package-row-header">
                  <strong>{value.name}</strong>
                  <span>
                    <span className="github-package-kind">
                      {value.packageType}
                    </span>{' '}
                    <span className="github-package-visibility">
                      {value.visibility}
                    </span>
                  </span>
                </span>
                <span className="github-package-muted">
                  {value.versionCount} version
                  {value.versionCount === 1 ? '' : 's'} · updated{' '}
                  {value.updatedAt.toLocaleString()}
                </span>
              </button>
              {packageURL !== null && (
                <LinkButton uri={packageURL}>Open on GitHub</LinkButton>
              )}
            </div>
          </div>
        )
      }
  )

  private createVersionRowRenderer = memoizeOne(
    (
        versions: ReadonlyArray<IGitHubPackageVersion>,
        account: Account | null,
        isContainerPackage: boolean,
        canDownload: boolean,
        busyTransfer: BusyTransfer
      ) =>
      // Not a component: this is a react-virtualized rowRenderer callback, so
      // ListRowProps is the library's parameter type rather than React props.
      // eslint-disable-next-line react/prop-types
      ({ index, key, style }: ListRowProps) => {
        const version = versions[index]
        if (version === undefined) {
          return null
        }
        const versionURL = providerURL(
          version.htmlURL ?? version.packageHTMLURL,
          account
        )
        return (
          <div
            key={key}
            style={style}
            role="listitem"
            className="github-package-virtual-row"
          >
            <div
              className="github-package-version"
              data-package-version-id={version.id}
            >
              <div className="github-package-version-header">
                <code>{version.name}</code>
                <span className="github-package-version-meta">
                  {version.updatedAt.toLocaleString()}
                </span>
              </div>
              {version.tags.length > 0 && (
                <div
                  className="github-package-tags"
                  role="group"
                  aria-label="Version tags"
                >
                  {version.tags.map(tag => (
                    <span key={tag} className="github-package-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="github-package-transfer-actions">
                {versionURL !== null && (
                  <LinkButton uri={versionURL}>Open on GitHub</LinkButton>
                )}
                {isContainerPackage && (
                  <Button
                    onClick={this.onDownloadVersion}
                    disabled={!canDownload || busyTransfer !== null}
                    tooltip={
                      canDownload
                        ? 'Inspect and download this immutable app file artifact'
                        : 'Only Desktop Material GHCR file artifacts can be downloaded here'
                    }
                  >
                    Download file
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      }
  )

  public constructor(props: IGitHubPackagesViewProps) {
    super(props)
    this.state = initialState(props)
  }

  public componentDidMount() {
    this.mounted = true
    if (this.props.autoLoad !== false) {
      void this.loadPackages(true)
    }
  }

  public componentDidUpdate(prevProps: IGitHubPackagesViewProps) {
    const nextKey = contextKey(this.props)
    if (nextKey === this.state.contextKey) {
      return
    }
    this.abortRequests()
    this.generation++
    this.setState({ ...initialState(this.props), contextKey: nextKey }, () => {
      if (this.props.autoLoad !== false) {
        void this.loadPackages(true)
      }
    })
  }

  public componentWillUnmount() {
    this.mounted = false
    this.generation++
    this.abortRequests()
  }

  private abortRequests() {
    this.packageController?.abort()
    this.versionController?.abort()
    this.transferController?.abort()
    this.packageController = null
    this.versionController = null
    this.transferController = null
  }

  private currentContext() {
    const remote = this.props.repository.gitHubRepository
    const account = getRepositoryAccount(
      this.props.repository,
      this.props.accounts
    )
    const owner =
      account === null
        ? null
        : getGitHubPackageOwner(this.props.repository, account)
    return remote === null || account === null || owner === null
      ? null
      : { remote, account, owner }
  }

  private isCurrent(generation: number, controller: AbortController): boolean {
    return (
      this.mounted &&
      generation === this.generation &&
      !controller.signal.aborted
    )
  }

  /**
   * Whether a settled request may still update state. Unlike isCurrent this
   * deliberately ignores the abort flag: a canceled request that is still the
   * owner of its slot must restore an actionable state instead of leaving the
   * busy flag wedged forever. Ownership is compared against the controller the
   * response belongs to, so a superseding request can never be clobbered.
   */
  private ownsVersionLoad(
    generation: number,
    controller: AbortController
  ): boolean {
    return (
      this.mounted &&
      generation === this.generation &&
      this.versionController === controller
    )
  }

  /** See ownsVersionLoad; the same rule for the single transfer slot. */
  private ownsTransfer(
    generation: number,
    controller: AbortController
  ): boolean {
    return (
      this.mounted &&
      generation === this.generation &&
      this.transferController === controller
    )
  }

  private loadPackages = async (refresh: boolean) => {
    const context = this.currentContext()
    if (context === null || this.state.loadingPackages) {
      return
    }
    this.packageController?.abort()
    if (refresh) {
      this.versionController?.abort()
      this.versionController = null
    }
    const controller = new AbortController()
    this.packageController = controller
    const generation = this.generation
    if (refresh) {
      this.setState({
        loadingPackages: true,
        loadingAllPackages: false,
        loadingVersions: false,
        error: null,
        message: null,
        packages: [],
        nextPackagePages: {},
        selectedPackageKey: null,
        versions: [],
        nextVersionPage: null,
        versionsCapped: false,
      })
    } else {
      this.setState({ loadingPackages: true, error: null, message: null })
    }
    try {
      const clientFactory = this.props.clientFactory ?? defaultClientFactory
      const client = clientFactory(context.account)
      const canonical = await client.fetchRepository(
        context.remote.owner.login,
        context.remote.name
      )
      if (
        canonical === null ||
        typeof canonical.id !== 'number' ||
        !Number.isSafeInteger(canonical.id) ||
        canonical.id < 1
      ) {
        throw new Error(
          'GitHub did not return a stable repository ID for package filtering.'
        )
      }
      const pages = await Promise.all(
        GitHubPackageTypes.map(packageType =>
          client.fetchGitHubPackages(
            context.owner,
            packageType,
            1,
            controller.signal
          )
        )
      )
      if (!this.isCurrent(generation, controller)) {
        return
      }
      const nextPackagePages: Partial<Record<GitHubPackageType, number>> = {}
      let packagesCapped = false
      let packages: ReadonlyArray<IGitHubPackage> = []
      pages.forEach((page, index) => {
        const packageType = GitHubPackageTypes[index]
        packages = appendPackages(
          packages,
          filterGitHubPackagesByRepositoryId(page.packages, canonical.id!)
        )
        if (page.nextPage !== null) {
          nextPackagePages[packageType] = page.nextPage
        }
        packagesCapped ||= page.capped
      })
      this.setState({
        packages,
        repositoryId: canonical.id,
        canonicalRepositoryURL: canonical.html_url,
        nextPackagePages,
        packagesCapped,
        loadingPackages: false,
        message:
          packages.length === 0
            ? 'No repository-linked packages were found in the loaded owner pages.'
            : null,
      })
    } catch (error) {
      if (this.isCurrent(generation, controller)) {
        this.setState({
          loadingPackages: false,
          error:
            (error as Error)?.name === 'AbortError'
              ? null
              : errorMessage(error),
        })
      }
    } finally {
      if (this.packageController === controller) {
        this.packageController = null
      }
    }
  }

  private loadAllPackages = async () => {
    const context = this.currentContext()
    const repositoryId = this.state.repositoryId
    if (
      context === null ||
      repositoryId === null ||
      this.state.loadingPackages ||
      this.state.loadingAllPackages
    ) {
      return
    }
    const controller = new AbortController()
    this.packageController = controller
    const generation = this.generation
    let packages = this.state.packages
    let packagesCapped = this.state.packagesCapped
    const nextPackagePages = { ...this.state.nextPackagePages }
    this.setState({ loadingAllPackages: true, error: null, message: null })
    try {
      const client = (this.props.clientFactory ?? defaultClientFactory)(
        context.account
      )
      for (const packageType of GitHubPackageTypes) {
        let pageNumber = nextPackagePages[packageType] ?? null
        while (pageNumber !== null) {
          if (pageNumber > GitHubPackageMaximumPages) {
            packagesCapped = true
            delete nextPackagePages[packageType]
            break
          }
          const page = await client.fetchGitHubPackages(
            context.owner,
            packageType,
            pageNumber,
            controller.signal
          )
          if (!this.isCurrent(generation, controller)) {
            return
          }
          packages = appendPackages(
            packages,
            filterGitHubPackagesByRepositoryId(page.packages, repositoryId)
          )
          packagesCapped ||= page.capped
          pageNumber = page.nextPage
          if (pageNumber === null) {
            delete nextPackagePages[packageType]
          } else {
            nextPackagePages[packageType] = pageNumber
          }
          this.setState({ packages, nextPackagePages, packagesCapped })
        }
      }
      this.setState({
        loadingAllPackages: false,
        message: `Loaded every available owner package page; ${
          packages.length
        } linked package${packages.length === 1 ? '' : 's'} found.`,
      })
    } catch (error) {
      if (this.isCurrent(generation, controller)) {
        this.setState({
          loadingAllPackages: false,
          error:
            (error as Error)?.name === 'AbortError'
              ? null
              : errorMessage(error),
        })
      }
    } finally {
      if (this.packageController === controller) {
        this.packageController = null
      }
    }
  }

  private selectedPackage(): IGitHubPackage | null {
    return (
      this.state.packages.find(
        value => packageKey(value) === this.state.selectedPackageKey
      ) ?? null
    )
  }

  private selectPackage = (value: IGitHubPackage) => {
    const key = packageKey(value)
    if (this.state.selectedPackageKey === key) {
      return
    }
    this.versionController?.abort()
    this.setState(
      {
        selectedPackageKey: key,
        versions: [],
        nextVersionPage: null,
        versionsCapped: false,
        // The aborted in-flight load can no longer clear this flag (its
        // response is stale by definition), so reset it here or every future
        // version load would be silently skipped.
        loadingVersions: false,
        versionQuery: '',
        error: null,
        completedDownload: null,
      },
      () => void this.loadVersions(value, true)
    )
  }

  private loadVersions = async (
    selected: IGitHubPackage | null = this.selectedPackage(),
    refresh: boolean = false
  ) => {
    const context = this.currentContext()
    if (context === null || selected === null || this.state.loadingVersions) {
      return
    }
    const page = refresh ? 1 : this.state.nextVersionPage
    if (page === null) {
      return
    }
    this.versionController?.abort()
    const controller = new AbortController()
    this.versionController = controller
    const generation = this.generation
    const selectedKey = packageKey(selected)
    this.setState({ loadingVersions: true, error: null })
    try {
      const client = (this.props.clientFactory ?? defaultClientFactory)(
        context.account
      )
      const result = await client.fetchGitHubPackageVersions(
        context.owner,
        selected.packageType,
        selected.name,
        page,
        controller.signal
      )
      if (
        !this.isCurrent(generation, controller) ||
        this.state.selectedPackageKey !== selectedKey
      ) {
        // A stale response must never publish versions, but if this request
        // still owns the slot it has to clear the loading flag on the way out
        // or every future version load would be skipped.
        if (this.ownsVersionLoad(generation, controller)) {
          this.setState({ loadingVersions: false })
        }
        return
      }
      this.setState(state => ({
        versions: refresh
          ? result.versions
          : appendVersions(state.versions, result.versions),
        nextVersionPage: result.nextPage,
        versionsCapped: state.versionsCapped || result.capped,
        loadingVersions: false,
      }))
    } catch (error) {
      if (this.ownsVersionLoad(generation, controller)) {
        this.setState({
          loadingVersions: false,
          error:
            (error as Error)?.name === 'AbortError'
              ? null
              : errorMessage(error),
        })
      }
    } finally {
      if (this.versionController === controller) {
        this.versionController = null
      }
    }
  }

  private visiblePackages() {
    return this.getVisiblePackages(
      this.state.packages,
      this.state.packageTypeFilter,
      this.state.packageQuery,
      this.state.packageSearchMode,
      this.state.packageSearchCaseSensitive
    )
  }

  /** See getVisiblePackages; the same memoization for version rows. */

  private visibleVersions() {
    return this.getVisibleVersions(
      this.state.versions,
      this.state.versionQuery,
      this.state.versionSearchMode,
      this.state.versionSearchCaseSensitive
    )
  }

  private onPackageQueryChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ packageQuery: event.currentTarget.value })

  private onUploadPackageNameChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => this.setState({ uploadPackageName: event.currentTarget.value })

  private clearPendingUpload = () => this.setState({ pendingUploadPath: null })

  private refreshPackages = () => void this.loadPackages(true)

  private onPackageTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
    this.setState({
      packageTypeFilter: event.currentTarget.value as PackageTypeFilter,
    })

  private onPackageSearchModeChange = (packageSearchMode: FilterMode) => {
    persistFilterMode(PackagesSearchFilterId, packageSearchMode)
    this.setState({ packageSearchMode })
  }

  private onPackageSearchCaseSensitiveChange = (
    packageSearchCaseSensitive: boolean
  ) => this.setState({ packageSearchCaseSensitive })

  private getPackageSearchSampleItems = () =>
    this.state.packages.map(
      value => `${value.name} ${value.packageType} ${value.visibility}`
    )

  private onPackageRegexPatternApply = (
    packageQuery: string,
    packageSearchCaseSensitive: boolean
  ) => this.setState({ packageQuery, packageSearchCaseSensitive })

  private onVersionSearchModeChange = (versionSearchMode: FilterMode) => {
    persistFilterMode(PackageVersionsSearchFilterId, versionSearchMode)
    this.setState({ versionSearchMode })
  }

  private onVersionQueryChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ versionQuery: event.currentTarget.value })

  private onVersionSearchCaseSensitiveChange = (
    versionSearchCaseSensitive: boolean
  ) => this.setState({ versionSearchCaseSensitive })

  private getVersionSearchSampleItems = () =>
    this.state.versions.map(value => `${value.name} ${value.tags.join(' ')}`)

  private onVersionRegexPatternApply = (
    versionQuery: string,
    versionSearchCaseSensitive: boolean
  ) => this.setState({ versionQuery, versionSearchCaseSensitive })

  private onSelectPackage = (event: React.MouseEvent<HTMLButtonElement>) => {
    const key = event.currentTarget.dataset.packageKey
    const value = this.state.packages.find(item => packageKey(item) === key)
    if (value !== undefined) {
      this.selectPackage(value)
    }
  }

  private loadMoreVersions = () => void this.loadVersions()

  private onDownloadVersion = (event: React.MouseEvent<HTMLButtonElement>) => {
    const row = event.currentTarget.closest<HTMLElement>(
      '[data-package-version-id]'
    )
    const id = row?.dataset.packageVersionId
    const version = this.state.versions.find(value => String(value.id) === id)
    if (version !== undefined) {
      void this.downloadVersion(version)
    }
  }

  private showCompletedDownloadInFolder = () => {
    const completed = this.state.completedDownload
    if (completed !== null) {
      void showItemInFolder(completed.destinationPath)
    }
  }

  private chooseUpload = async () => {
    if (this.state.busyTransfer !== null) {
      return
    }
    try {
      const path = this.props.chooseUploadFile
        ? await this.props.chooseUploadFile()
        : await showOpenDialog({
            title: 'Choose a file to publish as a GitHub package',
            properties: ['openFile'],
          })
      if (path !== null && this.mounted) {
        this.setState({ pendingUploadPath: path, error: null, message: null })
      }
    } catch (error) {
      this.setState({ error: errorMessage(error) })
    }
  }

  private uploadFile = async () => {
    const context = this.currentContext()
    const sourcePath = this.state.pendingUploadPath
    const sourceRepositoryURL = this.state.canonicalRepositoryURL
    const transferClient = this.props.transferClient ?? defaultTransferClient
    if (
      context === null ||
      sourcePath === null ||
      sourceRepositoryURL === null ||
      this.state.busyTransfer !== null
    ) {
      return
    }
    const controller = new AbortController()
    this.transferController = controller
    const generation = this.generation
    this.setState({
      busyTransfer: 'upload',
      transferProgress: 'Preparing the immutable package…',
      error: null,
      message: null,
    })
    try {
      const result = await transferClient.uploadFile({
        account: context.account,
        owner: context.remote.owner.login,
        repository: context.remote.name,
        sourceRepositoryURL,
        packageName: this.state.uploadPackageName.trim(),
        sourcePath,
        signal: controller.signal,
        onProgress: transferProgress => {
          if (this.isCurrent(generation, controller)) {
            this.setState({ transferProgress })
          }
        },
      })
      if (!this.ownsTransfer(generation, controller)) {
        return
      }
      this.setState(
        {
          busyTransfer: null,
          transferProgress: null,
          pendingUploadPath: null,
          message: `Published ${Path.basename(sourcePath)} as ${
            result.immutableReference
          }.`,
        },
        () => void this.loadPackages(true)
      )
    } catch (error) {
      if (this.ownsTransfer(generation, controller)) {
        this.setState({
          busyTransfer: null,
          transferProgress: null,
          error:
            (error as Error)?.name === 'AbortError'
              ? 'Package upload canceled.'
              : errorMessage(error),
        })
      }
    } finally {
      if (this.transferController === controller) {
        this.transferController = null
      }
    }
  }

  private downloadVersion = async (version: IGitHubPackageVersion) => {
    const context = this.currentContext()
    const selected = this.selectedPackage()
    const sourceRepositoryURL = this.state.canonicalRepositoryURL
    const transferClient = this.props.transferClient ?? defaultTransferClient
    if (
      context === null ||
      selected === null ||
      selected.packageType !== 'container' ||
      sourceRepositoryURL === null ||
      this.state.busyTransfer !== null
    ) {
      return
    }
    const controller = new AbortController()
    this.transferController = controller
    const generation = this.generation
    this.setState({
      busyTransfer: 'download',
      transferProgress: 'Inspecting the immutable package…',
      completedDownload: null,
      error: null,
      message: null,
    })
    try {
      const result = await transferClient.downloadFile({
        account: context.account,
        owner: context.remote.owner.login,
        repository: context.remote.name,
        sourceRepositoryURL,
        packageName: selected.name,
        versionDigest: version.name,
        chooseDestination: async fileName => {
          if (this.props.chooseDownloadDestination) {
            return this.props.chooseDownloadDestination(fileName)
          }
          return showSaveDialog({
            title: 'Save GitHub package file',
            defaultPath: fileName,
          })
        },
        signal: controller.signal,
        onProgress: transferProgress => {
          if (this.isCurrent(generation, controller)) {
            this.setState({ transferProgress })
          }
        },
      })
      if (!this.ownsTransfer(generation, controller)) {
        return
      }
      this.setState({
        busyTransfer: null,
        transferProgress: null,
        completedDownload: result,
        message: `Verified and downloaded ${result.fileName}.`,
      })
    } catch (error) {
      if (this.ownsTransfer(generation, controller)) {
        this.setState({
          busyTransfer: null,
          transferProgress: null,
          error:
            (error as Error)?.name === 'AbortError'
              ? 'Package download canceled.'
              : errorMessage(error),
        })
      }
    } finally {
      if (this.transferController === controller) {
        this.transferController = null
      }
    }
  }

  private cancelTransfer = () => {
    const controller = this.transferController
    if (controller === null) {
      return
    }
    // Release ownership before aborting so the canceled request's rejection
    // handler cannot touch state that a newer transfer may own by then, and
    // restore an actionable state immediately even if the underlying client
    // never honors the abort signal.
    this.transferController = null
    controller.abort()
    this.setState(state =>
      state.busyTransfer === null
        ? null
        : {
            busyTransfer: null,
            transferProgress: null,
            error:
              state.busyTransfer === 'upload'
                ? 'Package upload canceled.'
                : 'Package download canceled.',
          }
    )
  }

  private renderAvailability() {
    const remote = this.props.repository.gitHubRepository
    const account = getRepositoryAccount(
      this.props.repository,
      this.props.accounts
    )
    if (remote === null) {
      return (
        <section className="github-packages-empty" role="status">
          <h2>GitHub repository required</h2>
          <p>Packages are scoped to the selected GitHub repository.</p>
        </section>
      )
    }
    if (account === null) {
      return (
        <section className="github-packages-empty" role="status">
          <h2>Sign in to explore Packages</h2>
          <p>
            Sign in with the account selected for this repository. Desktop
            Material will not substitute another account on the same host.
          </p>
        </section>
      )
    }
    return null
  }

  private renderUpload() {
    const context = this.currentContext()
    if (context === null) {
      return null
    }
    const nativeTransferAvailable = isDotComAccount(context.account)
    const pending = this.state.pendingUploadPath
    return (
      <section
        className="github-package-upload"
        aria-labelledby="package-upload-heading"
      >
        <div className="github-packages-heading">
          <div>
            <h2 id="package-upload-heading">Publish a file package</h2>
            <p className="github-package-muted">
              Uploads use a new immutable GHCR/OCI version. Registry clients
              remain the publishing path for npm, Maven, RubyGems, NuGet, and
              general-purpose container images.
            </p>
          </div>
          <Button
            onClick={this.chooseUpload}
            disabled={
              !nativeTransferAvailable || this.state.busyTransfer !== null
            }
          >
            Choose file
          </Button>
        </div>
        <label className="github-package-name-field">
          GHCR package name
          <input
            value={this.state.uploadPackageName}
            onChange={this.onUploadPackageNameChange}
            disabled={
              !nativeTransferAvailable || this.state.busyTransfer !== null
            }
            spellCheck={false}
            aria-describedby="github-package-upload-guidance"
          />
        </label>
        <p id="github-package-upload-guidance" className="github-package-muted">
          Native file transfer is available for GitHub.com GHCR. Other package
          types remain searchable here and show their GitHub metadata and links.
        </p>
        {pending !== null && (
          <div
            className="github-package-transfer-review"
            role="group"
            aria-label="Review package upload"
          >
            <strong>Review before upload</strong>
            <span>
              File: <code>{Path.basename(pending)}</code>
            </span>
            <span>
              Destination:{' '}
              <code>
                ghcr.io/{context.remote.owner.login.toLowerCase()}/
                {this.state.uploadPackageName.trim()}
              </code>
            </span>
            <div className="github-package-transfer-actions">
              <Button
                className="primary"
                onClick={this.uploadFile}
                disabled={
                  this.state.busyTransfer !== null ||
                  this.state.uploadPackageName.trim().length === 0
                }
              >
                Confirm upload
              </Button>
              <Button
                onClick={this.clearPendingUpload}
                disabled={this.state.busyTransfer !== null}
              >
                Cancel review
              </Button>
            </div>
          </div>
        )}
      </section>
    )
  }

  private packageRowHeight = ({ index }: Index): number => {
    const { packages } = this.visiblePackages()
    const value = packages[index]
    const hasURL =
      value !== undefined &&
      providerURL(value.htmlURL, this.currentContext()?.account ?? null) !==
        null
    return (
      PackageRowBaseHeight +
      (hasURL ? PackageRowLinkExtraHeight : 0) +
      VirtualizedRowGap
    )
  }

  private versionRowHeight = ({ index }: Index): number => {
    const { versions } = this.visibleVersions()
    const value = versions[index]
    const hasTags = value !== undefined && value.tags.length > 0
    return (
      VersionRowBaseHeight +
      (hasTags ? VersionRowTagsExtraHeight : 0) +
      VirtualizedRowGap
    )
  }

  /** Viewport height: exact row total for short lists, capped for long ones. */
  private listViewportHeight(
    rowCount: number,
    rowHeight: (info: Index) => number
  ): number {
    let total = 0
    for (let index = 0; index < rowCount; index++) {
      total += rowHeight({ index })
      if (total >= VirtualizedListMaximumHeight) {
        return VirtualizedListMaximumHeight
      }
    }
    return total
  }

  private renderPackageList() {
    const visible = this.visiblePackages()
    const hasMore = Object.keys(this.state.nextPackagePages).length > 0
    const account = this.currentContext()?.account ?? null
    const packageRowRenderer = this.createPackageRowRenderer(
      visible.packages,
      this.state.selectedPackageKey,
      account
    )
    const packageListHeight = this.listViewportHeight(
      visible.packages.length,
      this.packageRowHeight
    )
    return (
      <section
        className="github-packages-list-panel"
        aria-labelledby="github-packages-list-heading"
      >
        <div className="github-packages-heading">
          <div>
            <h2 id="github-packages-list-heading">Repository packages</h2>
            <span className="github-packages-summary">
              {visible.packages.length} shown · {this.state.packages.length}{' '}
              linked packages loaded
            </span>
          </div>
          <div>
            <Button
              onClick={this.refreshPackages}
              disabled={
                this.state.loadingPackages || this.state.loadingAllPackages
              }
            >
              {this.state.loadingPackages ? 'Refreshing…' : 'Refresh'}
            </Button>{' '}
            {hasMore && (
              <Button
                onClick={this.loadAllPackages}
                disabled={
                  this.state.loadingPackages || this.state.loadingAllPackages
                }
              >
                {this.state.loadingAllPackages
                  ? 'Loading all pages…'
                  : 'Load all owner pages'}
              </Button>
            )}
          </div>
        </div>
        <div className="github-packages-toolbar">
          <div className="github-packages-search">
            <input
              data-search-surface-id="github-packages-search"
              value={this.state.packageQuery}
              onChange={this.onPackageQueryChange}
              placeholder="Search package names, types, visibility…"
              aria-label="Search repository packages"
              aria-invalid={visible.regexError !== null}
              aria-describedby={
                visible.regexError === null ? undefined : 'package-search-error'
              }
              spellCheck={false}
            />
            <FilterModeControl
              searchSurfaceId="github-packages-search"
              mode={this.state.packageSearchMode}
              caseSensitive={this.state.packageSearchCaseSensitive}
              onModeChange={this.onPackageSearchModeChange}
              onCaseSensitiveChange={this.onPackageSearchCaseSensitiveChange}
              regexBuilderTarget="GitHub packages"
              getSampleItems={this.getPackageSearchSampleItems}
              filterText={this.state.packageQuery}
              onRegexPatternApply={this.onPackageRegexPatternApply}
            />
          </div>
          <label className="github-packages-type-filter">
            Package type
            <select
              value={this.state.packageTypeFilter}
              onChange={this.onPackageTypeChange}
            >
              <option value="all">All types</option>
              {GitHubPackageTypes.map(packageType => (
                <option key={packageType} value={packageType}>
                  {packageType}
                </option>
              ))}
            </select>
          </label>
        </div>
        {visible.regexError !== null && (
          <p
            id="package-search-error"
            className="github-packages-banner error"
            role="alert"
          >
            {visible.regexError}
          </p>
        )}
        {this.state.packagesCapped && (
          <p className="github-packages-banner" role="status">
            GitHub reported more package metadata than the local safety cap. The
            displayed inventory is explicitly partial.
          </p>
        )}
        {visible.packages.length === 0 && !this.state.loadingPackages ? (
          <div className="github-packages-empty" role="status">
            No loaded repository package matches these filters. Packages with no
            exact repository-ID association are intentionally excluded.
          </div>
        ) : (
          <div
            className="github-packages-list"
            style={{ height: packageListHeight }}
          >
            <AutoSizer disableHeight={true}>
              {({ width }) => (
                <List
                  {...virtualizedListContainerProps}
                  role="list"
                  aria-label="Repository packages"
                  width={width > 0 ? width : VirtualizedListFallbackWidth}
                  height={packageListHeight}
                  rowCount={visible.packages.length}
                  rowHeight={this.packageRowHeight}
                  rowRenderer={packageRowRenderer}
                  overscanRowCount={10}
                />
              )}
            </AutoSizer>
          </div>
        )}
      </section>
    )
  }

  /** See createPackageRowRenderer for the memoization rationale. */

  private renderPackageDetail() {
    const selected = this.selectedPackage()
    if (selected === null) {
      return null
    }
    const visible = this.visibleVersions()
    const account = this.currentContext()?.account ?? null
    const canDownload =
      selected.packageType === 'container' &&
      account !== null &&
      isDotComAccount(account)
    const versionRowRenderer = this.createVersionRowRenderer(
      visible.versions,
      account,
      selected.packageType === 'container',
      canDownload,
      this.state.busyTransfer
    )
    const versionListHeight = this.listViewportHeight(
      visible.versions.length,
      this.versionRowHeight
    )
    return (
      <section
        className="github-package-detail"
        aria-labelledby="github-package-detail-heading"
      >
        <div className="github-package-version-header">
          <div>
            <h2 id="github-package-detail-heading">{selected.name}</h2>
            <span className="github-package-muted">
              {selected.packageType} versions · newest updated first
            </span>
          </div>
          {this.state.nextVersionPage !== null && (
            <Button
              onClick={this.loadMoreVersions}
              disabled={this.state.loadingVersions}
            >
              {this.state.loadingVersions ? 'Loading…' : 'Load more versions'}
            </Button>
          )}
        </div>
        <div className="github-packages-search">
          <input
            data-search-surface-id="github-package-versions-search"
            value={this.state.versionQuery}
            onChange={this.onVersionQueryChange}
            placeholder="Search digests, tags, descriptions…"
            aria-label="Search package versions"
            aria-invalid={visible.regexError !== null}
            aria-describedby={
              visible.regexError === null ? undefined : 'version-search-error'
            }
            spellCheck={false}
          />
          <FilterModeControl
            searchSurfaceId="github-package-versions-search"
            mode={this.state.versionSearchMode}
            caseSensitive={this.state.versionSearchCaseSensitive}
            onModeChange={this.onVersionSearchModeChange}
            onCaseSensitiveChange={this.onVersionSearchCaseSensitiveChange}
            regexBuilderTarget="GitHub package versions"
            getSampleItems={this.getVersionSearchSampleItems}
            filterText={this.state.versionQuery}
            onRegexPatternApply={this.onVersionRegexPatternApply}
          />
        </div>
        {visible.regexError !== null && (
          <p
            id="version-search-error"
            className="github-packages-banner error"
            role="alert"
          >
            {visible.regexError}
          </p>
        )}
        {this.state.versionsCapped && (
          <p className="github-packages-banner" role="status">
            Version results reached the local safety cap and are partial.
          </p>
        )}
        {!canDownload && (
          <p className="github-packages-banner" role="note">
            Metadata is available for every package type. Native Download file
            is enabled only for Desktop Material file artifacts stored in
            GitHub.com GHCR; ecosystem registries remain the install/download
            client for all other packages.
          </p>
        )}
        {visible.versions.length === 0 && !this.state.loadingVersions ? (
          <div className="github-packages-empty" role="status">
            No loaded package version matches this search.
          </div>
        ) : (
          <div
            className="github-package-versions"
            style={{ height: versionListHeight }}
          >
            <AutoSizer disableHeight={true}>
              {({ width }) => (
                <List
                  {...virtualizedListContainerProps}
                  role="list"
                  aria-label="Package versions"
                  width={width > 0 ? width : VirtualizedListFallbackWidth}
                  height={versionListHeight}
                  rowCount={visible.versions.length}
                  rowHeight={this.versionRowHeight}
                  rowRenderer={versionRowRenderer}
                  overscanRowCount={10}
                />
              )}
            </AutoSizer>
          </div>
        )}
      </section>
    )
  }

  /**
   * A way out of a missing-scope error. The token cannot gain a scope in
   * place, so the only real remedy is signing in again and approving it;
   * saying so and offering the button beats leaving the user to guess.
   */
  private renderScopeRecovery(): JSX.Element | null {
    const scope = missingPackagesScope(this.state.error)
    const account = this.currentContext()?.account ?? null
    if (scope === null || account === null) {
      return null
    }
    return (
      <span className="github-packages-scope-recovery">
        <span>{t('githubPackages.scopeRecovery', { scope })}</span>
        <Button
          onClick={this.onReauthorizeClick}
          disabled={this.props.onReauthorize === undefined}
        >
          {t('githubPackages.signInAgain')}
        </Button>
      </span>
    )
  }

  private onReauthorizeClick = () => {
    const account = this.currentContext()?.account ?? null
    if (account !== null) {
      this.props.onReauthorize?.(account)
    }
  }

  public render() {
    const unavailable = this.renderAvailability()
    const context = this.currentContext()
    return (
      <div className="github-packages-view">
        <header className="github-packages-header">
          <div>
            <h1>GitHub Packages</h1>
            <p className="github-package-muted">
              Explore only packages whose GitHub repository ID exactly matches
              this repository.
            </p>
          </div>
          {context !== null && (
            <span className="github-packages-account">
              {context.account.login} · {context.account.friendlyEndpoint}
            </span>
          )}
        </header>
        {unavailable ?? (
          <>
            {this.state.error !== null && (
              <div className="github-packages-banner error" role="alert">
                <span>{this.state.error}</span>
                {this.renderScopeRecovery()}
              </div>
            )}
            {this.state.message !== null && (
              <div
                className="github-packages-banner success"
                role="status"
                aria-live="polite"
              >
                {this.state.message}
              </div>
            )}
            {this.state.transferProgress !== null && (
              <div
                className="github-packages-banner"
                role="status"
                aria-live="polite"
              >
                {this.state.transferProgress}{' '}
                <Button onClick={this.cancelTransfer} size="small">
                  Cancel
                </Button>
              </div>
            )}
            {this.state.completedDownload !== null && (
              <div className="github-packages-banner success" role="status">
                <strong>{this.state.completedDownload.fileName}</strong>{' '}
                verified (
                {this.state.completedDownload.sizeInBytes.toLocaleString()}{' '}
                bytes).{' '}
                <LinkButton onClick={this.showCompletedDownloadInFolder}>
                  Show in folder
                </LinkButton>
              </div>
            )}
            {this.renderUpload()}
            <div className="github-packages-layout">
              {this.renderPackageList()}
              {this.renderPackageDetail()}
            </div>
          </>
        )}
      </div>
    )
  }
}
