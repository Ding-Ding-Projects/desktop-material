import { createHash } from 'crypto'
import { lstat, mkdir, realpath } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import {
  ICheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
  getCheapLfsOciRegistryProvider,
} from './ghcr-pointer'
import {
  ICheapLfsPointer,
  isEncryptedCheapLfsPointer,
  serializeCheapLfsPointer,
  validateCheapLfsTrackedPath,
} from './pointer'
import {
  CheapLfsTrackedPathStore,
  ICheapLfsTrackedPathStore,
  ICheapLfsTrackedTextWrite,
} from './tracked-path-store'
import {
  CHEAP_LFS_CLONE_HELPER_HYDRATE_MJS,
  CHEAP_LFS_CLONE_HELPER_HYDRATE_PS1,
  CHEAP_LFS_CLONE_HELPER_HYDRATE_SH,
  CHEAP_LFS_CLONE_HELPER_MANAGED_BY,
  CHEAP_LFS_CLONE_HELPER_MAXIMUM_ENTRIES,
  CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES,
  CHEAP_LFS_CLONE_HELPER_README,
  CHEAP_LFS_CLONE_HELPER_TEXT_MARKER,
} from './clone-helper-templates'
import {
  calculateCheapLfsClonePointerSetSha256,
  CheapLfsCloneAssetProvider,
  CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES,
  ICheapLfsCloneInventoryAsset,
  parseCheapLfsCloneInventory,
} from './clone-inventory'

export const CHEAP_LFS_CLONE_HELPER_DIRECTORY = '.desktop-material/cheap-lfs'

const MaximumManagedTextBytes = CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES
const ManagedFileNames = [
  'README.md',
  'inventory.json',
  'hydrate-inventory.json',
  'hydrate.mjs',
  'hydrate.ps1',
  'hydrate.sh',
] as const

export type CheapLfsCloneHelperManagedFileName = typeof ManagedFileNames[number]

export type CheapLfsCloneHelperEntry =
  | {
      readonly kind: 'release'
      readonly relativePath: string
      readonly pointer: ICheapLfsPointer
    }
  | {
      readonly kind: 'oci'
      readonly relativePath: string
      readonly pointer: ICheapLfsGhcrPointer
    }

export interface IEnsureCheapLfsCloneHelperOptions {
  readonly repositoryPath: string
  /**
   * The persisted preference is owned by the caller. `false` is an explicit
   * no-op and never deletes an existing helper bundle.
   */
  readonly enabled: boolean
  /** Already-validated, currently-local pointer entries. */
  readonly entries: ReadonlyArray<CheapLfsCloneHelperEntry>
}

export type EnsureCheapLfsCloneHelperResult =
  | {
      readonly status: 'not-needed'
      readonly reason: 'disabled' | 'no-pointers'
      readonly directory: typeof CHEAP_LFS_CLONE_HELPER_DIRECTORY
    }
  | {
      readonly status: 'conflict'
      readonly directory: typeof CHEAP_LFS_CLONE_HELPER_DIRECTORY
      readonly conflicts: ReadonlyArray<string>
    }
  | {
      readonly status: 'created' | 'updated' | 'unchanged'
      readonly directory: typeof CHEAP_LFS_CLONE_HELPER_DIRECTORY
      readonly created: ReadonlyArray<string>
      readonly updated: ReadonlyArray<string>
      readonly unchanged: ReadonlyArray<string>
      readonly entryCount: number
    }

interface IReleaseInventoryPart {
  readonly assetName: string
  readonly encoding: 'raw' | 'deflate-raw'
  readonly sizeInBytes: number
  readonly storedSizeInBytes: number
  readonly sha256: string
}

interface IHydrationInventoryEntry {
  readonly path: string
  readonly pointerText: string
  readonly pointerSha256: string
  readonly sizeInBytes: number
  readonly sha256: string
  readonly source:
    | {
        readonly provider: 'github-release'
        readonly releaseTag: string
        readonly parts: ReadonlyArray<IReleaseInventoryPart>
      }
    | {
        readonly provider: 'encrypted-github-release'
        readonly releaseTag: string
      }
    | {
        readonly provider: 'oci'
        readonly registryProvider: 'ghcr' | 'docker-hub'
        readonly image: string
      }
}

const repositoryQueues = new Map<string, Promise<void>>()

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalizeRootForComparison(path: string): string {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function canonicalRepositoryRoot(
  repositoryPath: string
): Promise<string> {
  const requested = resolve(repositoryPath)
  // realpath expands Windows 8.3 names (for example ADMINI~1) as well as real
  // redirects. Walk the requested chain so a short-but-regular path remains
  // valid without weakening the junction/symlink boundary.
  let ancestor = requested
  while (true) {
    if ((await lstat(ancestor, { bigint: true })).isSymbolicLink()) {
      throw new Error(
        'Cheap LFS clone helper requires a canonical regular repository directory.'
      )
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) {
      break
    }
    ancestor = parent
  }
  const requestedEntry = await lstat(requested, { bigint: true })
  if (requestedEntry.isSymbolicLink() || !requestedEntry.isDirectory()) {
    throw new Error(
      'Cheap LFS clone helper requires a canonical regular repository directory.'
    )
  }
  const canonical = await realpath(requested)
  const canonicalEntry = await lstat(canonical, { bigint: true })
  if (
    canonicalEntry.isSymbolicLink() ||
    !canonicalEntry.isDirectory() ||
    requestedEntry.dev !== canonicalEntry.dev ||
    requestedEntry.ino !== canonicalEntry.ino
  ) {
    throw new Error(
      'Cheap LFS clone helper refused a redirected repository directory.'
    )
  }
  return canonical
}

async function ensureCanonicalManagedDirectories(
  repositoryRoot: string
): Promise<void> {
  let parent = repositoryRoot
  for (const segment of ['.desktop-material', 'cheap-lfs']) {
    const candidate = join(parent, segment)
    await mkdir(candidate, { mode: 0o700 }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    })
    const entry = await lstat(candidate, { bigint: true })
    const canonical = await realpath(candidate)
    const canonicalEntry = await lstat(canonical, { bigint: true })
    if (
      entry.isSymbolicLink() ||
      !entry.isDirectory() ||
      normalizeRootForComparison(candidate) !==
        normalizeRootForComparison(canonical) ||
      entry.dev !== canonicalEntry.dev ||
      entry.ino !== canonicalEntry.ino
    ) {
      throw new Error(
        'Cheap LFS clone helper refused a symlink, junction, or replaced managed directory.'
      )
    }
    parent = canonical
  }
}

function releaseParts(
  pointer: ICheapLfsPointer
): ReadonlyArray<IReleaseInventoryPart> {
  if (pointer.parts === undefined) {
    return [
      {
        assetName: pointer.assetName,
        encoding: 'raw',
        sizeInBytes: pointer.sizeInBytes,
        storedSizeInBytes: pointer.sizeInBytes,
        sha256: pointer.sha256,
      },
    ]
  }
  return pointer.parts.map(part => {
    if (part.encrypted === true) {
      throw new Error(
        'Encrypted Cheap LFS pointers must use the explicit unsupported-provider inventory route.'
      )
    }
    return {
      assetName: part.name,
      encoding: part.deflatedSizeInBytes === undefined ? 'raw' : 'deflate-raw',
      sizeInBytes: part.sizeInBytes,
      storedSizeInBytes: part.deflatedSizeInBytes ?? part.sizeInBytes,
      sha256: part.sha256,
    }
  })
}

function hydrationInventoryEntry(
  entry: CheapLfsCloneHelperEntry
): IHydrationInventoryEntry {
  const relativePath = validateCheapLfsTrackedPath(entry.relativePath)
  if (relativePath === null) {
    throw new Error(
      `Cheap LFS clone helper rejected unsafe tracked path ${entry.relativePath}.`
    )
  }
  if (entry.kind === 'release') {
    const pointerText = serializeCheapLfsPointer(entry.pointer)
    return {
      path: relativePath,
      pointerText,
      pointerSha256: sha256(pointerText),
      sizeInBytes: entry.pointer.sizeInBytes,
      sha256: entry.pointer.sha256,
      source: isEncryptedCheapLfsPointer(entry.pointer)
        ? {
            provider: 'encrypted-github-release',
            releaseTag: entry.pointer.releaseTag,
          }
        : {
            provider: 'github-release',
            releaseTag: entry.pointer.releaseTag,
            parts: releaseParts(entry.pointer),
          },
    }
  }
  const pointerText = serializeCheapLfsGhcrPointer(entry.pointer)
  const registryProvider = getCheapLfsOciRegistryProvider(entry.pointer.image)
  if (registryProvider === null) {
    throw new Error(
      'Cheap LFS clone helper rejected an OCI pointer with an unknown registry.'
    )
  }
  return {
    path: relativePath,
    pointerText,
    pointerSha256: sha256(pointerText),
    sizeInBytes: entry.pointer.sizeInBytes,
    sha256: entry.pointer.object.slice('sha256:'.length),
    source: {
      provider: 'oci',
      registryProvider,
      image: entry.pointer.image,
    },
  }
}

export function renderCheapLfsCloneHelperInventory(
  entries: ReadonlyArray<CheapLfsCloneHelperEntry>
): string {
  if (entries.length > CHEAP_LFS_CLONE_HELPER_MAXIMUM_ENTRIES) {
    throw new Error(
      `Cheap LFS clone helper inventory exceeds ${CHEAP_LFS_CLONE_HELPER_MAXIMUM_ENTRIES} entries.`
    )
  }
  const rendered = entries
    .map(entry => {
      const hydrated = hydrationInventoryEntry(entry)
      const provider: CheapLfsCloneAssetProvider =
        hydrated.source.provider !== 'oci'
          ? 'release'
          : hydrated.source.registryProvider
      const asset: ICheapLfsCloneInventoryAsset = {
        path: hydrated.path,
        provider,
        size: hydrated.sizeInBytes,
        objectSha256: hydrated.sha256,
        pointerBlobSha256: hydrated.pointerSha256,
      }
      return asset
    })
    .sort((left, right) => compareOrdinal(left.path, right.path))
  const pathKeys = new Set<string>()
  for (const entry of rendered) {
    const pathKey = entry.path.toLowerCase()
    if (pathKeys.has(pathKey)) {
      throw new Error(
        'Cheap LFS clone helper inventory contains duplicate or case-colliding tracked paths.'
      )
    }
    pathKeys.add(pathKey)
  }
  const text =
    JSON.stringify(
      {
        schemaVersion: 1,
        pointerSetSha256: calculateCheapLfsClonePointerSetSha256(rendered),
        assets: rendered,
      },
      null,
      2
    ) + '\n'
  if (
    Buffer.byteLength(text, 'utf8') > CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES
  ) {
    throw new Error(
      `Cheap LFS clone helper inventory exceeds ${CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES} bytes.`
    )
  }
  return text
}

export function renderCheapLfsHydrationInventory(
  entries: ReadonlyArray<CheapLfsCloneHelperEntry>
): string {
  if (entries.length > CHEAP_LFS_CLONE_HELPER_MAXIMUM_ENTRIES) {
    throw new Error(
      `Cheap LFS hydration inventory exceeds ${CHEAP_LFS_CLONE_HELPER_MAXIMUM_ENTRIES} entries.`
    )
  }
  const rendered = entries
    .map(hydrationInventoryEntry)
    .sort((left, right) => compareOrdinal(left.path, right.path))
  const text =
    JSON.stringify(
      {
        managedBy: CHEAP_LFS_CLONE_HELPER_MANAGED_BY,
        schemaVersion: 1,
        entries: rendered,
      },
      null,
      2
    ) + '\n'
  if (
    Buffer.byteLength(text, 'utf8') >
    CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES
  ) {
    throw new Error(
      `Cheap LFS hydration inventory exceeds ${CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES} bytes.`
    )
  }
  return text
}

export function renderCheapLfsCloneHelperBundle(
  entries: ReadonlyArray<CheapLfsCloneHelperEntry>
): Readonly<Record<CheapLfsCloneHelperManagedFileName, string>> {
  return {
    'README.md': CHEAP_LFS_CLONE_HELPER_README,
    'inventory.json': renderCheapLfsCloneHelperInventory(entries),
    'hydrate-inventory.json': renderCheapLfsHydrationInventory(entries),
    'hydrate.mjs': CHEAP_LFS_CLONE_HELPER_HYDRATE_MJS,
    'hydrate.ps1': CHEAP_LFS_CLONE_HELPER_HYDRATE_PS1,
    'hydrate.sh': CHEAP_LFS_CLONE_HELPER_HYDRATE_SH,
  }
}

function isManagedText(
  name: CheapLfsCloneHelperManagedFileName,
  text: string
): boolean {
  if (name === 'inventory.json') {
    return parseCheapLfsCloneInventory(text).kind === 'valid'
  }
  if (name === 'hydrate-inventory.json') {
    return text.startsWith(
      `{\n  "managedBy": "${CHEAP_LFS_CLONE_HELPER_MANAGED_BY}",\n`
    )
  }
  if (name === 'README.md') {
    return text.startsWith(`<!-- ${CHEAP_LFS_CLONE_HELPER_TEXT_MARKER} -->\n`)
  }
  if (name === 'hydrate.mjs') {
    return text.startsWith(`// ${CHEAP_LFS_CLONE_HELPER_TEXT_MARKER}\n`)
  }
  if (name === 'hydrate.sh') {
    return text.startsWith(
      `#!/usr/bin/env sh\n# ${CHEAP_LFS_CLONE_HELPER_TEXT_MARKER}\n`
    )
  }
  return text.startsWith(`# ${CHEAP_LFS_CLONE_HELPER_TEXT_MARKER}\n`)
}

async function serialized<T>(
  repositoryRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = normalizeRootForComparison(repositoryRoot)
  const previous = repositoryQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(
    () => undefined,
    () => undefined
  )
  repositoryQueues.set(key, tail)
  try {
    return await current
  } finally {
    if (repositoryQueues.get(key) === tail) {
      repositoryQueues.delete(key)
    }
  }
}

export class CheapLfsCloneHelperBundleGenerator {
  public constructor(
    private readonly pathStore: ICheapLfsTrackedPathStore = new CheapLfsTrackedPathStore()
  ) {}

  public async ensure(
    options: IEnsureCheapLfsCloneHelperOptions
  ): Promise<EnsureCheapLfsCloneHelperResult> {
    if (!options.enabled) {
      return {
        status: 'not-needed',
        reason: 'disabled',
        directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
      }
    }
    const repositoryRoot = await canonicalRepositoryRoot(options.repositoryPath)
    if (options.entries.length === 0) {
      try {
        await lstat(join(repositoryRoot, CHEAP_LFS_CLONE_HELPER_DIRECTORY))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            status: 'not-needed',
            reason: 'no-pointers',
            directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
          }
        }
        throw error
      }
    }
    return serialized(repositoryRoot, async () => {
      await ensureCanonicalManagedDirectories(repositoryRoot)
      const bundle = renderCheapLfsCloneHelperBundle(options.entries)
      const created = new Array<string>()
      const updated = new Array<string>()
      const unchanged = new Array<string>()
      const conflicts = new Array<string>()
      const writes = new Array<ICheapLfsTrackedTextWrite>()

      for (const name of ManagedFileNames) {
        const relativePath = `${CHEAP_LFS_CLONE_HELPER_DIRECTORY}/${name}`
        const proof = await this.pathStore.proveManagedPath(
          repositoryRoot,
          relativePath,
          relativePath
        )
        if (!proof.exists) {
          created.push(relativePath)
          writes.push({ proof, text: bundle[name] })
          continue
        }
        const existing = await this.pathStore.readText(
          proof,
          MaximumManagedTextBytes
        )
        if (!isManagedText(name, existing)) {
          conflicts.push(relativePath)
          continue
        }
        if (existing === bundle[name]) {
          unchanged.push(relativePath)
        } else {
          updated.push(relativePath)
          writes.push({ proof, text: bundle[name] })
        }
      }

      if (conflicts.length > 0) {
        return {
          status: 'conflict',
          directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
          conflicts,
        }
      }
      if (writes.length === 0) {
        return {
          status: 'unchanged',
          directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
          created,
          updated,
          unchanged,
          entryCount: options.entries.length,
        }
      }
      if (this.pathStore.publishTextBatch === undefined) {
        throw new Error(
          'Cheap LFS clone helper requires atomic managed batch publication.'
        )
      }
      await this.pathStore.publishTextBatch(writes)
      return {
        status: updated.length === 0 ? 'created' : 'updated',
        directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
        created,
        updated,
        unchanged,
        entryCount: options.entries.length,
      }
    })
  }
}

const defaultGenerator = new CheapLfsCloneHelperBundleGenerator()

export function ensureCheapLfsCloneHelperBundle(
  options: IEnsureCheapLfsCloneHelperOptions
): Promise<EnsureCheapLfsCloneHelperResult> {
  return defaultGenerator.ensure(options)
}
