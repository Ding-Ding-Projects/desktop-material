import { createHash, randomBytes, randomUUID } from 'crypto'
import { constants, Stats } from 'fs'
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'fs/promises'
import { dirname, join, resolve } from 'path'

/** Provider-neutral tracked key used only by verified-private repositories. */
export const CheapLfsRegistryRepositoryKeyPath =
  '.desktop-material/cheap-lfs-registry-key-v1'
/** Compatibility alias for integrations built while the backend was GHCR-only. */
export const CheapLfsGhcrRepositoryKeyPath = CheapLfsRegistryRepositoryKeyPath
/** Retained indefinitely when present so historical GHCR pointers remain usable. */
export const CheapLfsLegacyGhcrRepositoryKeyPath =
  '.desktop-material/cheap-lfs-ghcr-key-v1'

/**
 * Repository-key files are control-plane state, never payload candidates.
 * Compare with Windows/Git's case-insensitive path semantics even when a test
 * or auxiliary host is case-sensitive.
 */
export function isCheapLfsRepositoryKeyPath(relativePath: string): boolean {
  const normalized = relativePath.trim().replace(/\\/g, '/').toLowerCase()
  return (
    normalized === CheapLfsRegistryRepositoryKeyPath.toLowerCase() ||
    normalized === CheapLfsLegacyGhcrRepositoryKeyPath.toLowerCase()
  )
}

const KeyHeader = 'desktop-material-cheap-lfs-registry-key-v1'
const LegacyKeyHeader = 'desktop-material-cheap-lfs-ghcr-key-v1'
const KeyBytes = 32
const KeyTextMaximumBytes = 256
const NoFollowFlag = constants.O_NOFOLLOW ?? 0

export type CheapLfsGhcrVerifiedVisibility =
  | 'verified-private'
  | 'verified-public'
  | 'unknown'

export interface ICheapLfsGhcrRepositoryKeyResult {
  readonly path: string | null
  /** Caller-owned copy. Fill with zeroes immediately after use. */
  readonly key: Buffer | null
  readonly created: boolean
  /** True when the canonical file was copied from, not rotated from, legacy. */
  readonly migratedFromLegacy: boolean
}

export interface IResolveCheapLfsGhcrRepositoryKeyOptions {
  readonly repositoryPath: string
  readonly visibility: CheapLfsGhcrVerifiedVisibility
  /** Explicit enable/pin flows may create; passive reads must leave this false. */
  readonly createIfMissing: boolean
  /** Injectable only for deterministic tests. Production uses crypto.randomBytes. */
  readonly generateRandomBytes?: (size: number) => Buffer
}

export interface IResolveCheapLfsRegistryRepositoryKeyForIdOptions {
  readonly repositoryPath: string
  /** Exact key identifier stored by the immutable image config. */
  readonly keyId: string
}

export class CheapLfsGhcrKeyError extends Error {
  public constructor(
    public readonly kind:
      | 'visibility-unverified'
      | 'public-key-disallowed'
      | 'missing-key'
      | 'invalid-key'
      | 'unsafe-path'
      | 'concurrent-create',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsGhcrKeyError'
  }
}

function isFileSystemError(
  error: unknown,
  ...codes: ReadonlyArray<string>
): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    codes.includes(String(error.code))
  )
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function requireSafeDirectory(path: string, metadata: Stats): void {
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CheapLfsGhcrKeyError(
      'unsafe-path',
      `Cheap LFS refuses a redirected or non-directory key path at ${path}.`
    )
  }
}

async function resolveSafeRepositoryRoot(
  repositoryPath: string
): Promise<string> {
  const requested = resolve(repositoryPath)
  let metadata: Stats
  try {
    metadata = await lstat(requested)
  } catch {
    throw new CheapLfsGhcrKeyError(
      'unsafe-path',
      'Cheap LFS requires an existing regular repository directory.'
    )
  }
  requireSafeDirectory(requested, metadata)
  const canonical = await realpath(requested)
  const canonicalMetadata = await lstat(canonical)
  requireSafeDirectory(canonical, canonicalMetadata)
  return canonical
}

async function resolveSafeKeyDirectory(
  root: string,
  create: boolean
): Promise<string> {
  const directory = join(root, '.desktop-material')
  try {
    const metadata = await lstat(directory)
    requireSafeDirectory(directory, metadata)
  } catch (error) {
    if (!isFileSystemError(error, 'ENOENT')) {
      throw error
    }
    if (!create) {
      return directory
    }
    try {
      await mkdir(directory, { mode: 0o700 })
    } catch (mkdirError) {
      if (!isFileSystemError(mkdirError, 'EEXIST')) {
        throw mkdirError
      }
    }
    const metadata = await lstat(directory)
    requireSafeDirectory(directory, metadata)
  }
  const canonical = await realpath(directory)
  if (!samePath(canonical, directory) || !samePath(dirname(canonical), root)) {
    throw new CheapLfsGhcrKeyError(
      'unsafe-path',
      'Cheap LFS refuses a redirected repository key directory.'
    )
  }
  return directory
}

function serializeKey(key: Buffer, header: string = KeyHeader): string {
  if (key.length !== KeyBytes) {
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'Cheap LFS requires an exact 256-bit repository encryption key.'
    )
  }
  return `${header}\n${key.toString('base64url')}\n`
}

function parseKey(text: string, expectedHeader: string): Buffer {
  const lines = text.split('\n')
  if (
    lines.length !== 3 ||
    lines[0] !== expectedHeader ||
    !/^[A-Za-z0-9_-]{43}$/.test(lines[1]) ||
    lines[2] !== ''
  ) {
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'The tracked Cheap LFS GHCR repository key is invalid.'
    )
  }
  const key = Buffer.from(lines[1], 'base64url')
  if (key.length !== KeyBytes || key.toString('base64url') !== lines[1]) {
    key.fill(0)
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'The tracked Cheap LFS GHCR repository key is invalid.'
    )
  }
  return key
}

function keyIdFor(key: Uint8Array): string {
  return `sha256:${createHash('sha256').update(key).digest('hex')}`
}

export function cheapLfsRegistryRepositoryKeyId(key: Uint8Array): string {
  if (key.byteLength !== KeyBytes) {
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'Cheap LFS requires an exact 256-bit repository encryption key.'
    )
  }
  return keyIdFor(key)
}

/** SHA-256 of the exact canonical tracked key-file bytes Git must commit. */
export function cheapLfsRegistryRepositoryKeyTextSha256(
  key: Uint8Array
): string {
  const copy = Buffer.from(key)
  try {
    return createHash('sha256').update(serializeKey(copy), 'utf8').digest('hex')
  } finally {
    copy.fill(0)
  }
}

export interface ICheapLfsCreatedRepositoryKeyCleanupProof {
  readonly absolutePath: string
  readonly device: number
  readonly inode: number
  readonly sizeInBytes: number
  readonly keyId: string
  readonly canonicalTextSha256: string
}

export type CheapLfsCreatedRepositoryKeyCleanupResult =
  | 'discarded'
  | 'already-absent'
  | 'retained-replaced'

interface IInspectedRepositoryKey {
  readonly metadata: Stats
  readonly keyId: string
  readonly canonicalTextSha256: string
}

async function inspectRepositoryKey(
  path: string
): Promise<IInspectedRepositoryKey | null> {
  let entry: Stats
  try {
    entry = await lstat(path)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  if (
    entry.isSymbolicLink() ||
    !entry.isFile() ||
    entry.nlink !== 1 ||
    entry.size <= 0 ||
    entry.size > KeyTextMaximumBytes
  ) {
    return {
      metadata: entry,
      keyId: '',
      canonicalTextSha256: '',
    }
  }
  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat()
    if (!sameFile(entry, opened) || opened.size !== entry.size) {
      return {
        metadata: opened,
        keyId: '',
        canonicalTextSha256: '',
      }
    }
    const text = await handle.readFile('utf8')
    const after = await lstat(path)
    if (!sameFile(opened, after) || after.size !== opened.size) {
      return {
        metadata: after,
        keyId: '',
        canonicalTextSha256: '',
      }
    }
    let key: Buffer
    try {
      key = parseKey(text, KeyHeader)
    } catch {
      return {
        metadata: after,
        keyId: '',
        canonicalTextSha256: '',
      }
    }
    try {
      return {
        metadata: after,
        keyId: keyIdFor(key),
        canonicalTextSha256: createHash('sha256')
          .update(text, 'utf8')
          .digest('hex'),
      }
    } finally {
      key.fill(0)
    }
  } finally {
    await handle.close()
  }
}

/** Capture the exact identity and canonical bytes of a key just created here. */
export async function captureCheapLfsCreatedRepositoryKeyCleanupProof(
  absolutePath: string,
  expectedKey: Uint8Array
): Promise<ICheapLfsCreatedRepositoryKeyCleanupProof> {
  const inspected = await inspectRepositoryKey(absolutePath)
  const expectedKeyId = cheapLfsRegistryRepositoryKeyId(expectedKey)
  const expectedTextSha256 =
    cheapLfsRegistryRepositoryKeyTextSha256(expectedKey)
  if (
    inspected === null ||
    inspected.keyId !== expectedKeyId ||
    inspected.canonicalTextSha256 !== expectedTextSha256
  ) {
    throw new CheapLfsGhcrKeyError(
      'concurrent-create',
      'The newly created Cheap LFS repository key changed before publication began.'
    )
  }
  return {
    absolutePath,
    device: inspected.metadata.dev,
    inode: inspected.metadata.ino,
    sizeInBytes: inspected.metadata.size,
    keyId: inspected.keyId,
    canonicalTextSha256: inspected.canonicalTextSha256,
  }
}

function inspectedKeyMatchesCleanupProof(
  inspected: IInspectedRepositoryKey | null,
  proof: ICheapLfsCreatedRepositoryKeyCleanupProof
): boolean {
  return (
    inspected !== null &&
    inspected.metadata.dev === proof.device &&
    inspected.metadata.ino === proof.inode &&
    inspected.metadata.size === proof.sizeInBytes &&
    inspected.keyId === proof.keyId &&
    inspected.canonicalTextSha256 === proof.canonicalTextSha256
  )
}

/**
 * Remove only the exact key created for a failed first publish. Renaming to a
 * private quarantine path closes the check/unlink gap: if another actor swaps
 * the pathname, its file is detected and restored instead of deleted.
 */
export async function discardCheapLfsCreatedRepositoryKeyIfUnchanged(
  proof: ICheapLfsCreatedRepositoryKeyCleanupProof
): Promise<CheapLfsCreatedRepositoryKeyCleanupResult> {
  const before = await inspectRepositoryKey(proof.absolutePath)
  if (before === null) {
    return 'already-absent'
  }
  if (!inspectedKeyMatchesCleanupProof(before, proof)) {
    return 'retained-replaced'
  }

  const quarantine = join(
    dirname(proof.absolutePath),
    `.cheap-lfs-registry-key-retained-${process.pid}-${randomUUID()}`
  )
  try {
    await rename(proof.absolutePath, quarantine)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) {
      return 'already-absent'
    }
    throw error
  }

  const quarantined = await inspectRepositoryKey(quarantine)
  if (inspectedKeyMatchesCleanupProof(quarantined, proof)) {
    await unlink(quarantine)
    return 'discarded'
  }

  // The path changed between the final inspection and atomic rename. Restore
  // that replacement by hard-linking without overwriting any newer occupant.
  try {
    await link(quarantine, proof.absolutePath)
    await unlink(quarantine)
  } catch (error) {
    if (!isFileSystemError(error, 'EEXIST')) {
      throw error
    }
    // A newer file now owns the canonical path. Keep the quarantined file too;
    // deleting either unowned identity would violate the cleanup contract.
  }
  return 'retained-replaced'
}

async function readExistingKey(
  path: string,
  expectedHeader: string = KeyHeader
): Promise<Buffer | null> {
  let entry: Stats
  try {
    entry = await lstat(path)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  if (
    entry.isSymbolicLink() ||
    !entry.isFile() ||
    entry.nlink !== 1 ||
    entry.size <= 0 ||
    entry.size > KeyTextMaximumBytes
  ) {
    throw new CheapLfsGhcrKeyError(
      'unsafe-path',
      'Cheap LFS refuses an aliased or non-regular repository key file.'
    )
  }

  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat()
    if (
      opened.isSymbolicLink() ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size !== entry.size ||
      !sameFile(opened, entry)
    ) {
      throw new CheapLfsGhcrKeyError(
        'unsafe-path',
        'Cheap LFS refuses a repository key that changed while opening it.'
      )
    }
    const text = await handle.readFile('utf8')
    const after = await lstat(path)
    if (!sameFile(opened, after) || after.size !== opened.size) {
      throw new CheapLfsGhcrKeyError(
        'unsafe-path',
        'Cheap LFS refuses a repository key that changed while reading it.'
      )
    }
    return parseKey(text, expectedHeader)
  } finally {
    await handle.close()
  }
}

async function createKeyAtomically(path: string, key: Buffer): Promise<void> {
  const temporary = join(
    dirname(path),
    `.cheap-lfs-registry-key-v1.desktop-material-${process.pid}-${randomUUID()}`
  )
  let temporaryExists = false
  try {
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NoFollowFlag,
      0o600
    )
    temporaryExists = true
    try {
      await handle.writeFile(serializeKey(key), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await link(temporary, path)
    } catch (error) {
      if (isFileSystemError(error, 'EEXIST')) {
        throw new CheapLfsGhcrKeyError(
          'concurrent-create',
          'The Cheap LFS repository key was created concurrently; retry after reviewing it.'
        )
      }
      throw error
    }
    await unlink(temporary)
    temporaryExists = false

    const published = await readExistingKey(path)
    try {
      if (published === null || !published.equals(key)) {
        throw new CheapLfsGhcrKeyError(
          'invalid-key',
          'Cheap LFS could not verify the generated repository key.'
        )
      }
    } finally {
      published?.fill(0)
    }
  } finally {
    if (temporaryExists) {
      await unlink(temporary).catch(() => {})
    }
  }
}

/**
 * Read or explicitly create the tracked repository-wide encryption key.
 *
 * This key is intentionally committed in a *private* Git repository so every
 * authorized clone can restore historical objects. It protects payloads if the
 * GHCR package leaks independently; it does not protect against anyone who can
 * read the private repository or its history.
 */
export async function resolveCheapLfsGhcrRepositoryKey(
  options: IResolveCheapLfsGhcrRepositoryKeyOptions
): Promise<ICheapLfsGhcrRepositoryKeyResult> {
  if (options.visibility === 'unknown') {
    throw new CheapLfsGhcrKeyError(
      'visibility-unverified',
      'Cheap LFS GHCR key handling requires verified repository visibility.'
    )
  }
  if (options.visibility === 'verified-public') {
    if (options.createIfMissing) {
      throw new CheapLfsGhcrKeyError(
        'public-key-disallowed',
        'Public repositories do not create or use a Cheap LFS GHCR key.'
      )
    }
    return {
      path: null,
      key: null,
      created: false,
      migratedFromLegacy: false,
    }
  }

  const root = await resolveSafeRepositoryRoot(options.repositoryPath)
  const directory = await resolveSafeKeyDirectory(root, options.createIfMissing)
  const path = join(directory, 'cheap-lfs-registry-key-v1')
  const existing = await readExistingKey(path)
  if (existing !== null) {
    return {
      path,
      key: existing,
      created: false,
      migratedFromLegacy: false,
    }
  }

  const legacyPath = join(directory, 'cheap-lfs-ghcr-key-v1')
  const legacy = await readExistingKey(legacyPath, LegacyKeyHeader)
  if (legacy !== null) {
    if (!options.createIfMissing) {
      return {
        path: legacyPath,
        key: legacy,
        created: false,
        migratedFromLegacy: false,
      }
    }
    try {
      await createKeyAtomically(path, legacy)
      return {
        path,
        key: Buffer.from(legacy),
        created: true,
        migratedFromLegacy: true,
      }
    } finally {
      legacy.fill(0)
    }
  }
  if (!options.createIfMissing) {
    throw new CheapLfsGhcrKeyError(
      'missing-key',
      `Private Cheap LFS registry storage requires the tracked ${CheapLfsRegistryRepositoryKeyPath} file.`
    )
  }

  const generated = (options.generateRandomBytes ?? randomBytes)(KeyBytes)
  if (!Buffer.isBuffer(generated) || generated.length !== KeyBytes) {
    generated.fill?.(0)
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'Cheap LFS could not generate an exact 256-bit repository key.'
    )
  }
  try {
    await createKeyAtomically(path, generated)
    return {
      path,
      key: Buffer.from(generated),
      created: true,
      migratedFromLegacy: false,
    }
  } finally {
    generated.fill(0)
  }
}

/**
 * Resolve the exact key named by an immutable historical image. This checks
 * both the provider-neutral file and the retained legacy GHCR file; callers
 * can then fall back to the key file from that pointer's Git commit/history.
 */
export async function resolveCheapLfsRegistryRepositoryKeyForId(
  options: IResolveCheapLfsRegistryRepositoryKeyForIdOptions
): Promise<ICheapLfsGhcrRepositoryKeyResult> {
  if (!/^sha256:[0-9a-f]{64}$/.test(options.keyId)) {
    throw new CheapLfsGhcrKeyError(
      'invalid-key',
      'Cheap LFS rejected an invalid historical repository key identifier.'
    )
  }
  const root = await resolveSafeRepositoryRoot(options.repositoryPath)
  const directory = await resolveSafeKeyDirectory(root, false)
  const candidates = [
    {
      path: join(directory, 'cheap-lfs-registry-key-v1'),
      header: KeyHeader,
    },
    {
      path: join(directory, 'cheap-lfs-ghcr-key-v1'),
      header: LegacyKeyHeader,
    },
  ]
  for (const candidate of candidates) {
    const key = await readExistingKey(candidate.path, candidate.header)
    if (key === null) {
      continue
    }
    if (keyIdFor(key) === options.keyId) {
      return {
        path: candidate.path,
        key,
        created: false,
        migratedFromLegacy: false,
      }
    }
    key.fill(0)
  }
  throw new CheapLfsGhcrKeyError(
    'missing-key',
    'The current checkout does not contain the key referenced by this historical Cheap LFS image; recover that tracked file from its Git commit, history, or backup.'
  )
}
