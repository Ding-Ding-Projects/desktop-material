import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, mkdtemp, open, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { createInflateRaw } from 'node:zlib'

import {
  MAX_CHUNK_BYTES,
  MAX_IMAGE_REFERENCES,
  MAX_JSON_BYTES,
  MAX_LAYERS,
  MAX_OBJECTS,
  MAX_POINTER_BLOB_BYTES,
  OCI_ARTIFACT_TYPE,
  OCI_CONFIG_MEDIA_TYPE,
  OCI_MANIFEST_MEDIA_TYPE,
  OCI_REPOSITORY_TAG,
  OCI_RETENTION_TAG_PREFIX,
  OCI_SOURCE_ANNOTATION,
  PRIVATE_OBJECT_MEDIA_TYPE,
  PUBLIC_OBJECT_MEDIA_TYPE,
  SNAPSHOT_CONFIG_FIELD,
  buildImage,
  deriveTarget,
  digestFor,
  encryptChunk,
  parseOciPointer,
  parseReleasePointer,
  parseRepositoryKey,
  repositoryKeyId,
  requireManagedRelease,
  requireOciPointerVisibility,
  requirePackagePolicy,
  resolveConversionVisibility,
  runCanonicalPublicationTransaction,
  selectCanonicalGhcrEntries,
  serializeOciPointer,
  serializeRepositoryKey,
  newRepositoryKey,
  parseAdoptionReceipt,
  requireRepairableAdoption,
  serializeAdoptionReceipt,
  validateSnapshot,
} from './release-to-ghcr-core.mjs'

const API_VERSION = '2022-11-28'
const MAX_GIT_METADATA_BYTES = 64 * 1024 * 1024
const MAX_API_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_RELEASE_PAGES = 100
const MAX_RELEASE_ASSETS_PER_RELEASE = 10_000
const MAX_CACHED_RELEASE_ASSETS = 16_384
const MAX_RELEASE_ASSET_METADATA_BYTES = 32 * 1024 * 1024
const MAX_CACHED_RELEASE_ASSET_METADATA_BYTES = 64 * 1024 * 1024
const METADATA_REQUEST_TIMEOUT_MS = 2 * 60 * 1000
const ASSET_TRANSFER_TIMEOUT_MS = 2 * 60 * 60 * 1000
const MAX_PACKAGE_POLICY_ATTEMPTS = 12
const PACKAGE_POLICY_RETRY_MS = 2_000
const CANONICAL_KEY_PATH = '.desktop-material/cheap-lfs-registry-key-v1'
const LEGACY_KEY_PATH = '.desktop-material/cheap-lfs-ghcr-key-v1'
const CANONICAL_KEY_HEADER = 'desktop-material-cheap-lfs-registry-key-v1'
const LEGACY_KEY_HEADER = 'desktop-material-cheap-lfs-ghcr-key-v1'

const workspace = process.env.GITHUB_WORKSPACE
const repositoryName = process.env.GITHUB_REPOSITORY
const token = process.env.CHEAP_LFS_GITHUB_TOKEN
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com'
const refName = process.env.GITHUB_REF_NAME
const eventCommit = process.env.GITHUB_SHA
const actor = process.env.GITHUB_ACTOR
const privateConfirmation = process.env.CHEAP_LFS_PRIVATE_ACTIONS_CONFIRMED

if (
  !workspace ||
  !repositoryName ||
  !token ||
  !refName ||
  !eventCommit ||
  !actor
) {
  throw new Error(
    'Cheap LFS Release-to-GHCR conversion is missing its GitHub Actions context.'
  )
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryName)) {
  throw new Error(
    'Cheap LFS Release-to-GHCR conversion received an invalid repository name.'
  )
}
if (!/^[a-f0-9]{40,64}$/.test(eventCommit)) {
  throw new Error(
    'Cheap LFS Release-to-GHCR conversion received an invalid event commit.'
  )
}
if (
  privateConfirmation !== undefined &&
  privateConfirmation !== 'true' &&
  privateConfirmation !== 'false'
) {
  throw new Error(
    'Cheap LFS Release-to-GHCR conversion received an invalid private Actions confirmation.'
  )
}

function git(args, options = {}) {
  const output = execFileSync('git', ['-C', workspace, ...args], {
    encoding: options.buffer ? null : 'utf8',
    env: {
      ...process.env,
      GIT_NO_LAZY_FETCH: '1',
      ...options.env,
    },
    input: options.input,
    maxBuffer: options.maxBuffer || MAX_GIT_METADATA_BYTES,
    stdio: options.quiet ? ['pipe', 'pipe', 'pipe'] : undefined,
  })
  return options.raw || options.buffer ? output : output.trim()
}

function optionalGit(args, options = {}) {
  try {
    return { ok: true, value: git(args, { ...options, quiet: true }) }
  } catch (error) {
    const status = Number(error?.status)
    if (status === 1 || status === 128) {
      return { ok: false, value: null }
    }
    throw error
  }
}

async function boundedResponseBuffer(
  response,
  maximum = MAX_API_RESPONSE_BYTES
) {
  if (response.body === null) {
    return Buffer.alloc(0)
  }
  const chunks = []
  let bytes = 0
  for await (const chunk of Readable.fromWeb(response.body)) {
    bytes += chunk.byteLength
    if (bytes > maximum) {
      throw new Error('Cheap LFS refused an oversized network response.')
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function api(path, options = {}) {
  const {
    allowNotFound = false,
    timeoutMs = METADATA_REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options
  const response = await fetch(apiUrl + path, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'desktop-material-cheap-lfs-release-to-ghcr',
      ...fetchOptions.headers,
    },
  })
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    const detail = (await boundedResponseBuffer(response, 4 * 1024))
      .toString('utf8')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500)
    throw new Error(`GitHub API ${response.status}: ${detail}`)
  }
  return response
}

async function apiJsonWithSize(path, options = {}) {
  const response = await api(path, options)
  if (response.status === 404) {
    await response.body?.cancel().catch(() => {})
    return { value: null, byteLength: 0 }
  }
  const bytes = await boundedResponseBuffer(response)
  try {
    return {
      value: JSON.parse(bytes.toString('utf8')),
      byteLength: bytes.byteLength,
    }
  } catch {
    throw new Error('GitHub returned invalid bounded JSON.')
  }
}

async function apiJson(path, options = {}) {
  return (await apiJsonWithSize(path, options)).value
}

function parseTreeEntries(output, commit) {
  const entries = []
  const seenPaths = new Set()
  let offset = 0
  while (offset < output.length) {
    const end = output.indexOf(0, offset)
    if (end < 0) {
      throw new Error('Git returned an unterminated tree entry.')
    }
    const record = output.subarray(offset, end)
    offset = end + 1
    const separator = record.indexOf(9)
    if (separator < 0) {
      throw new Error('Git returned an invalid tree entry.')
    }
    const header = record.subarray(0, separator).toString('ascii')
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})$/.exec(header)
    if (match === null) {
      continue
    }
    const pathBytes = record.subarray(separator + 1)
    const path = pathBytes.toString('utf8')
    if (
      path.length === 0 ||
      path.includes('\0') ||
      !Buffer.from(path, 'utf8').equals(pathBytes) ||
      seenPaths.has(path)
    ) {
      throw new Error('Git returned an unsafe or duplicate tree path.')
    }
    seenPaths.add(path)
    entries.push({ commit, mode: match[1], oid: match[2], path })
  }
  return entries
}

function treeEntriesAt(commit) {
  return parseTreeEntries(
    git(['ls-tree', '-r', '-z', '--full-tree', commit], {
      buffer: true,
      quiet: true,
    }),
    commit
  )
}

function localPointerBlobCandidates(entries) {
  const objectIds = [...new Set(entries.map(entry => entry.oid))]
  if (objectIds.length === 0) {
    return []
  }
  const output = git(
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      input: `${objectIds.join('\n')}\n`,
      quiet: true,
      raw: true,
    }
  )
  const lines = output.trimEnd().split('\n')
  if (lines.length !== objectIds.length) {
    throw new Error('Git returned an incomplete object inventory.')
  }
  const local = []
  for (let index = 0; index < objectIds.length; index++) {
    const objectId = objectIds[index]
    const line = lines[index]
    if (line === `${objectId} missing`) {
      continue
    }
    const match = /^([a-f0-9]{40,64}) blob (0|[1-9][0-9]*)$/.exec(line)
    if (match === null || match[1] !== objectId) {
      throw new Error('Git returned an invalid object inventory entry.')
    }
    const size = Number(match[2])
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Git returned an invalid blob size.')
    }
    if (size < MAX_POINTER_BLOB_BYTES) {
      local.push({ oid: objectId, size })
    }
  }
  return local
}

async function readPointerBlobs(candidates, onBlob) {
  if (candidates.length === 0) {
    return
  }
  const child = spawn('git', ['-C', workspace, 'cat-file', '--batch'], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    if (stderr.length < MAX_GIT_METADATA_BYTES) {
      stderr += chunk
    }
  })
  const completion = new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    const onChildError = error => settle(reject, error)
    const onStdinError = error => settle(reject, error)
    const onStdinClose = () => child.stdin.off('error', onStdinError)
    const onClose = code => {
      settle(resolve, code)
      child.off('error', onChildError)
      child.stdin.off('error', onStdinError)
      child.stdin.off('close', onStdinClose)
    }
    child.on('error', onChildError)
    child.once('close', onClose)
    child.stdin.on('error', onStdinError)
    child.stdin.once('close', onStdinClose)
  })
  child.stdin.end(`${candidates.map(candidate => candidate.oid).join('\n')}\n`)

  let pending = Buffer.alloc(0)
  let current = null
  let index = 0
  try {
    for await (const chunk of child.stdout) {
      pending = Buffer.concat([pending, chunk])
      while (true) {
        if (current === null) {
          const newline = pending.indexOf(10)
          if (newline < 0) {
            break
          }
          const header = pending.subarray(0, newline).toString('ascii')
          pending = pending.subarray(newline + 1)
          const match = /^([a-f0-9]{40,64}) blob (0|[1-9][0-9]*)$/.exec(header)
          const expected = candidates[index]
          if (
            match === null ||
            expected === undefined ||
            match[1] !== expected.oid ||
            Number(match[2]) !== expected.size
          ) {
            throw new Error('Git returned an invalid pointer-blob header.')
          }
          current = expected
        }
        if (pending.length < current.size + 1) {
          break
        }
        if (pending[current.size] !== 10) {
          throw new Error('Git returned an invalid pointer-blob delimiter.')
        }
        const contents = pending.subarray(0, current.size)
        pending = pending.subarray(current.size + 1)
        await onBlob(current.oid, contents)
        index++
        current = null
      }
    }
  } catch (error) {
    child.kill()
    await completion.catch(() => {})
    throw error
  }
  const exitCode = await completion
  if (
    exitCode !== 0 ||
    current !== null ||
    pending.length !== 0 ||
    index !== candidates.length
  ) {
    throw new Error(
      `Git could not read bounded pointer blobs without lazy fetching: ${stderr
        .trim()
        .slice(0, 500)}`
    )
  }
}

async function trackedPointersAt(commit) {
  const entries = treeEntriesAt(commit)
  const entriesByObject = new Map()
  for (const entry of entries) {
    const paths = entriesByObject.get(entry.oid) ?? []
    paths.push(entry)
    entriesByObject.set(entry.oid, paths)
  }
  const release = []
  const oci = []
  await readPointerBlobs(
    localPointerBlobCandidates(entries),
    async (oid, contents) => {
      if (contents.includes(0)) {
        return
      }
      const text = contents.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(contents)) {
        return
      }
      const prefix = text.slice(0, 128).replace(/^\uFEFF/, '')
      let pointer = null
      let kind = null
      if (prefix.startsWith('version desktop-material/cheap-lfs/v1')) {
        pointer = parseReleasePointer(text)
        kind = 'release'
      } else if (
        prefix.startsWith(
          'version https://desktop-material.app/cheap-lfs/oci/v1'
        )
      ) {
        pointer = parseOciPointer(text)
        kind = 'oci'
      }
      if (pointer === null || kind === null) {
        return
      }
      for (const entry of entriesByObject.get(oid) ?? []) {
        const candidate = { ...entry, text, pointer }
        if (kind === 'release') {
          release.push(candidate)
        } else {
          oci.push(candidate)
        }
      }
    }
  )
  return { release, oci }
}

function fetchPointerSizedBlobs() {
  const head = git(['rev-parse', '--verify', 'HEAD'])
  if (!/^[a-f0-9]{40,64}$/.test(head)) {
    throw new Error('Cheap LFS could not resolve the checked-out commit.')
  }
  if (!optionalGit(['merge-base', '--is-ancestor', eventCommit, head]).ok) {
    throw new Error(
      'The checked-out commit is not the workflow event commit or its verified compression descendant.'
    )
  }
  git([
    'fetch',
    '--no-tags',
    '--refetch',
    '--depth=1',
    `--filter=blob:limit=${MAX_POINTER_BLOB_BYTES}`,
    'origin',
    head,
  ])
  if (git(['rev-parse', '--verify', 'HEAD']) !== head) {
    throw new Error('The checked-out commit changed while fetching pointers.')
  }
  return head
}

function remoteBranchCommit(defaultBranch) {
  const remoteRef = `refs/heads/${defaultBranch}`
  const advertised = git(['ls-remote', '--refs', 'origin', remoteRef], {
    quiet: true,
    raw: true,
  })
  const match = /^([a-f0-9]{40,64})\t([^\r\n]+)\r?\n?$/.exec(advertised)
  return match !== null && match[2] === remoteRef ? match[1] : null
}

function requireRemoteDefaultCommit(defaultBranch, expectedCommit, phase) {
  if (remoteBranchCommit(defaultBranch) !== expectedCommit) {
    throw new Error(
      `The remote default branch changed ${phase}. No canonical tag was promoted.`
    )
  }
}

async function loadRepositoryMetadata() {
  const metadata = await apiJson(`/repos/${repositoryName}`)
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    String(metadata.full_name).toLowerCase() !== repositoryName.toLowerCase() ||
    typeof metadata.default_branch !== 'string' ||
    metadata.default_branch.length === 0 ||
    (metadata.visibility !== 'public' && metadata.visibility !== 'private') ||
    (metadata.private !== true && metadata.private !== false) ||
    metadata.private !== (metadata.visibility === 'private') ||
    typeof metadata.owner?.login !== 'string' ||
    (metadata.owner?.type !== 'User' &&
      metadata.owner?.type !== 'Organization') ||
    !Number.isSafeInteger(metadata.id) ||
    metadata.id <= 0
  ) {
    throw new Error(
      'GitHub did not return an exact supported public or private repository identity, visibility, and default branch. Internal and unknown visibility are blocked.'
    )
  }
  if (refName !== metadata.default_branch) {
    throw new Error(
      'Cheap LFS Release-to-GHCR conversion runs only on the current default branch.'
    )
  }
  return metadata
}

async function requireRepositoryPolicyUnchanged(expected, expectedVisibility) {
  const current = await loadRepositoryMetadata()
  const currentVisibility = resolveConversionVisibility(
    current.visibility,
    privateConfirmation === 'true'
  )
  if (
    current.id !== expected.id ||
    String(current.full_name).toLowerCase() !==
      String(expected.full_name).toLowerCase() ||
    current.default_branch !== expected.default_branch ||
    currentVisibility !== expectedVisibility
  ) {
    throw new Error(
      'Repository identity, visibility, or default branch changed during Release-to-GHCR conversion. No pointers were changed.'
    )
  }
}

const releaseCache = new Map()
const assetCache = new Map()
let cachedReleaseAssetCount = 0
let cachedReleaseAssetMetadataBytes = 0

function boundedReleaseMetadata(value, expectedTag) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    value.tag_name !== expectedTag ||
    typeof value.draft !== 'boolean' ||
    typeof value.prerelease !== 'boolean'
  ) {
    throw new Error('GitHub returned invalid bounded Release metadata.')
  }
  const body =
    typeof value.body === 'string' &&
    Buffer.byteLength(value.body, 'utf8') <= 4 * 1024
      ? value.body
      : null
  return {
    id: value.id,
    tag_name: value.tag_name,
    draft: value.draft,
    prerelease: value.prerelease,
    body,
  }
}

function boundedAssetMetadata(value) {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  return {
    id: Number.isSafeInteger(value.id) ? value.id : null,
    name:
      typeof value.name === 'string' &&
      Buffer.byteLength(value.name, 'utf8') <= 255
        ? value.name
        : null,
    state: typeof value.state === 'string' ? value.state : null,
    size: Number.isSafeInteger(value.size) ? value.size : null,
    digest:
      typeof value.digest === 'string' && value.digest.length <= 80
        ? value.digest
        : null,
    label:
      typeof value.label === 'string' &&
      Buffer.byteLength(value.label, 'utf8') <= 1024
        ? value.label
        : null,
  }
}

async function releaseForTag(tag) {
  if (releaseCache.has(tag)) {
    return releaseCache.get(tag)
  }
  if (releaseCache.size >= MAX_OBJECTS) {
    throw new Error('Cheap LFS found more than 4096 distinct Release buckets.')
  }
  let release = await apiJson(
    `/repos/${repositoryName}/releases/tags/${encodeURIComponent(tag)}`,
    { allowNotFound: true }
  )
  if (release === null) {
    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
      const releases = await apiJson(
        `/repos/${repositoryName}/releases?per_page=100&page=${page}`
      )
      if (!Array.isArray(releases)) {
        throw new Error('GitHub returned an invalid Release inventory.')
      }
      release = releases.find(candidate => candidate?.tag_name === tag) ?? null
      if (release !== null) {
        break
      }
      if (releases.length < 100) {
        break
      }
    }
  }
  if (release === null) {
    throw new Error(`GitHub Release tag was not found: ${tag}`)
  }
  const bounded = boundedReleaseMetadata(release, tag)
  releaseCache.set(tag, bounded)
  return bounded
}

async function allAssets(releaseId) {
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0) {
    throw new Error('GitHub returned an invalid Release identifier.')
  }
  if (assetCache.has(releaseId)) {
    return assetCache.get(releaseId)
  }
  const assets = []
  let releaseMetadataBytes = 0
  for (let page = 1; page <= MAX_RELEASE_PAGES + 1; page++) {
    const result = await apiJsonWithSize(
      `/repos/${repositoryName}/releases/${releaseId}/assets?per_page=100&page=${page}`
    )
    const next = result.value
    if (!Array.isArray(next)) {
      throw new Error('GitHub returned an invalid Release asset inventory.')
    }
    releaseMetadataBytes += result.byteLength
    if (
      releaseMetadataBytes > MAX_RELEASE_ASSET_METADATA_BYTES ||
      cachedReleaseAssetMetadataBytes + result.byteLength >
        MAX_CACHED_RELEASE_ASSET_METADATA_BYTES
    ) {
      throw new Error(
        'Cheap LFS Release asset metadata exceeded its cumulative bound.'
      )
    }
    if (
      assets.length + next.length > MAX_RELEASE_ASSETS_PER_RELEASE ||
      cachedReleaseAssetCount + next.length > MAX_CACHED_RELEASE_ASSETS
    ) {
      throw new Error(
        'Cheap LFS Release asset inventory exceeded its cumulative bound.'
      )
    }
    const bounded = next.map(boundedAssetMetadata)
    if (bounded.some(asset => asset === null)) {
      throw new Error('GitHub returned invalid Release asset metadata.')
    }
    assets.push(...bounded)
    cachedReleaseAssetCount += bounded.length
    cachedReleaseAssetMetadataBytes += result.byteLength
    if (next.length < 100) {
      assetCache.set(releaseId, assets)
      return assets
    }
  }
  throw new Error('A Cheap LFS Release has too many assets to inspect safely.')
}

function countingHashTransform(maximumBytes) {
  const hash = createHash('sha256')
  let bytes = 0
  return {
    transform: new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.byteLength
        if (bytes > maximumBytes) {
          callback(
            new Error('A Release asset exceeded its pointer-declared size.')
          )
          return
        }
        hash.update(chunk)
        callback(null, chunk)
      },
    }),
    result() {
      return { bytes, sha256: hash.digest('hex') }
    },
  }
}

async function downloadAsset(asset, destination, expectedBytes) {
  if (
    !Number.isSafeInteger(asset?.id) ||
    asset.id <= 0 ||
    asset.state !== 'uploaded' ||
    asset.size !== expectedBytes
  ) {
    throw new Error(
      `Release asset ${String(asset?.name)} does not match its pointer.`
    )
  }
  const response = await api(
    `/repos/${repositoryName}/releases/assets/${asset.id}`,
    {
      headers: { Accept: 'application/octet-stream' },
      timeoutMs: ASSET_TRANSFER_TIMEOUT_MS,
    }
  )
  if (response.body === null) {
    throw new Error('GitHub returned an empty Release asset response.')
  }
  const counter = countingHashTransform(expectedBytes)
  await pipeline(
    Readable.fromWeb(response.body),
    counter.transform,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 })
  )
  const result = counter.result()
  if (result.bytes !== expectedBytes) {
    throw new Error(
      `Release asset ${asset.name} ended before its pointer-declared size.`
    )
  }
  if (
    typeof asset.digest === 'string' &&
    asset.digest !== `sha256:${result.sha256}`
  ) {
    throw new Error(
      `Release asset ${asset.name} does not match GitHub's digest.`
    )
  }
  return result
}

async function hashFile(path) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.byteLength
    hash.update(chunk)
  }
  return { bytes, sha256: hash.digest('hex') }
}

class GhcrRegistry {
  constructor(target) {
    this.target = target
    this.authorization = null
  }

  async authenticate() {
    if (this.authorization !== null) {
      return
    }
    const challengeResponse = await fetch('https://ghcr.io/v2/', {
      signal: AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'desktop-material-cheap-lfs-release-to-ghcr' },
    })
    const challenge = challengeResponse.headers.get('www-authenticate') ?? ''
    await challengeResponse.body?.cancel().catch(() => {})
    const realm =
      /realm="([^"]+)"/.exec(challenge)?.[1] ?? 'https://ghcr.io/token'
    const service = /service="([^"]+)"/.exec(challenge)?.[1] ?? 'ghcr.io'
    if (!/^https:\/\/ghcr\.io\/token(?:\?.*)?$/.test(realm)) {
      throw new Error('GHCR returned an untrusted authentication realm.')
    }
    const url = new URL(realm)
    url.searchParams.set('service', service)
    url.searchParams.set(
      'scope',
      `repository:${this.target.registryPath}:pull,push`
    )
    const response = await fetch(url, {
      signal: AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString(
          'base64'
        )}`,
        'User-Agent': 'desktop-material-cheap-lfs-release-to-ghcr',
      },
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new Error(
        `GHCR token exchange failed with HTTP ${response.status}.`
      )
    }
    const body = await boundedResponseBuffer(response, 64 * 1024)
    let parsed
    try {
      parsed = JSON.parse(body.toString('utf8'))
    } catch {
      throw new Error('GHCR returned an invalid authentication response.')
    }
    const bearer = parsed?.token ?? parsed?.access_token
    if (
      typeof bearer !== 'string' ||
      bearer.length < 1 ||
      bearer.length > 16_384
    ) {
      throw new Error('GHCR returned an invalid bearer token.')
    }
    this.authorization = `Bearer ${bearer}`
  }

  async request(pathOrUrl, options = {}) {
    await this.authenticate()
    const url = new URL(pathOrUrl, 'https://ghcr.io')
    if (url.protocol !== 'https:' || url.hostname !== 'ghcr.io') {
      throw new Error('GHCR returned an untrusted upload location.')
    }
    const { timeoutMs = METADATA_REQUEST_TIMEOUT_MS, ...fetchOptions } = options
    const response = await fetch(url, {
      ...fetchOptions,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: this.authorization,
        'User-Agent': 'desktop-material-cheap-lfs-release-to-ghcr',
        ...fetchOptions.headers,
      },
    })
    return response
  }

  async requireOk(response, expectedStatuses, operation) {
    if (!expectedStatuses.includes(response.status)) {
      const detail = (await boundedResponseBuffer(response, 4 * 1024))
        .toString('utf8')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 500)
      throw new Error(
        `GHCR ${operation} failed with HTTP ${response.status}: ${detail}`
      )
    }
  }

  async blobExists(digest) {
    const response = await this.request(
      `/v2/${this.target.registryPath}/blobs/${digest}`,
      { method: 'HEAD' }
    )
    if (response.status === 404) {
      await response.body?.cancel().catch(() => {})
      return false
    }
    await this.requireOk(response, [200], 'blob verification')
    const confirmed = response.headers.get('docker-content-digest')
    await response.body?.cancel().catch(() => {})
    if (confirmed !== null && confirmed !== digest) {
      throw new Error('GHCR returned a different blob digest.')
    }
    return true
  }

  async beginBlobUpload() {
    const response = await this.request(
      `/v2/${this.target.registryPath}/blobs/uploads/`,
      { method: 'POST' }
    )
    await this.requireOk(response, [202], 'blob upload start')
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => {})
    if (location === null) {
      throw new Error('GHCR omitted the blob upload location.')
    }
    const url = new URL(location, 'https://ghcr.io')
    if (url.protocol !== 'https:' || url.hostname !== 'ghcr.io') {
      throw new Error('GHCR returned an untrusted blob upload location.')
    }
    return url
  }

  async uploadBuffer(bytes, digest) {
    if (digestFor(bytes) !== digest) {
      throw new Error('Cheap LFS refused bytes with the wrong OCI digest.')
    }
    if (await this.blobExists(digest)) {
      return
    }
    const url = await this.beginBlobUpload()
    url.searchParams.set('digest', digest)
    const response = await this.request(url, {
      method: 'PUT',
      timeoutMs: ASSET_TRANSFER_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
      },
      body: bytes,
    })
    await this.requireOk(response, [201], 'blob upload')
    await response.body?.cancel().catch(() => {})
    if (!(await this.blobExists(digest))) {
      throw new Error('GHCR did not retain a verified blob upload.')
    }
  }

  async uploadFile(path, descriptor) {
    const local = await hashFile(path)
    if (
      local.bytes !== descriptor.size ||
      `sha256:${local.sha256}` !== descriptor.digest
    ) {
      throw new Error('Cheap LFS refused a changed staged OCI layer.')
    }
    if (await this.blobExists(descriptor.digest)) {
      return
    }
    const url = await this.beginBlobUpload()
    url.searchParams.set('digest', descriptor.digest)
    const response = await this.request(url, {
      method: 'PUT',
      timeoutMs: ASSET_TRANSFER_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(descriptor.size),
      },
      body: createReadStream(path),
      duplex: 'half',
    })
    await this.requireOk(response, [201], 'layer upload')
    await response.body?.cancel().catch(() => {})
    if (!(await this.blobExists(descriptor.digest))) {
      throw new Error('GHCR did not retain a verified layer upload.')
    }
  }

  async putManifest(reference, bytes) {
    if (
      !/^(?:sha256:[0-9a-f]{64}|[a-z0-9][a-z0-9._-]{0,127})$/.test(reference)
    ) {
      throw new Error('Cheap LFS refused an invalid OCI manifest reference.')
    }
    const response = await this.request(
      `/v2/${this.target.registryPath}/manifests/${reference}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': OCI_MANIFEST_MEDIA_TYPE,
          'Content-Length': String(bytes.byteLength),
        },
        body: bytes,
      }
    )
    await this.requireOk(response, [201], 'manifest publication')
    const returned = response.headers.get('docker-content-digest')
    await response.body?.cancel().catch(() => {})
    const expected = digestFor(bytes)
    if (returned !== null && returned !== expected) {
      throw new Error('GHCR acknowledged a different manifest digest.')
    }
    await this.verifyManifest(reference, expected, bytes)
  }

  async getManifest(reference) {
    const response = await this.request(
      `/v2/${this.target.registryPath}/manifests/${reference}`,
      {
        headers: {
          Accept: `${OCI_MANIFEST_MEDIA_TYPE}, application/vnd.oci.image.index.v1+json`,
        },
      }
    )
    if (response.status === 404) {
      await response.body?.cancel().catch(() => {})
      return null
    }
    await this.requireOk(response, [200], 'manifest download')
    const bytes = await boundedResponseBuffer(response, MAX_JSON_BYTES)
    const digest =
      response.headers.get('docker-content-digest') ?? digestFor(bytes)
    return { bytes, digest }
  }

  async getBlob(digest) {
    const response = await this.request(
      `/v2/${this.target.registryPath}/blobs/${digest}`
    )
    await this.requireOk(response, [200], 'config download')
    const bytes = await boundedResponseBuffer(response, MAX_JSON_BYTES)
    if (digestFor(bytes) !== digest) {
      throw new Error('GHCR returned config bytes with a different digest.')
    }
    return bytes
  }

  async verifyManifest(reference, expectedDigest, expectedBytes = null) {
    const loaded = await this.getManifest(reference)
    if (
      loaded === null ||
      loaded.digest !== expectedDigest ||
      digestFor(loaded.bytes) !== expectedDigest ||
      (expectedBytes !== null && !loaded.bytes.equals(expectedBytes))
    ) {
      throw new Error('GHCR did not return the exact published manifest.')
    }
    return loaded.bytes
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(`GHCR returned invalid ${label} JSON.`)
  }
}

function descriptorMatches(left, right) {
  return (
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest &&
    left?.size === right?.size
  )
}

function exactObjectKeys(value, keys) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key, index) => Object.keys(value)[index] === key)
  )
}

async function loadValidatedImage(registry, digest, target, visibility) {
  const manifestResult = await registry.getManifest(digest)
  if (
    manifestResult === null ||
    manifestResult.digest !== digest ||
    digestFor(manifestResult.bytes) !== digest
  ) {
    throw new Error('A tracked GHCR image manifest is unavailable.')
  }
  const manifest = parseJsonBytes(manifestResult.bytes, 'manifest')
  if (
    !exactObjectKeys(manifest, [
      'schemaVersion',
      'mediaType',
      'artifactType',
      'config',
      'layers',
      'annotations',
    ]) ||
    manifest.schemaVersion !== 2 ||
    manifest.mediaType !== OCI_MANIFEST_MEDIA_TYPE ||
    manifest.artifactType !== OCI_ARTIFACT_TYPE ||
    !Array.isArray(manifest.layers) ||
    manifest.layers.length > MAX_LAYERS ||
    !exactObjectKeys(manifest.annotations, [OCI_SOURCE_ANNOTATION]) ||
    manifest.annotations[OCI_SOURCE_ANNOTATION] !==
      target.sourceRepositoryUrl ||
    !exactObjectKeys(manifest.config, ['mediaType', 'digest', 'size']) ||
    manifest.config.mediaType !== OCI_CONFIG_MEDIA_TYPE ||
    !/^sha256:[0-9a-f]{64}$/.test(manifest.config.digest) ||
    !Number.isSafeInteger(manifest.config.size) ||
    manifest.config.size < 1 ||
    manifest.config.size > MAX_JSON_BYTES ||
    manifest.layers.some(
      layer =>
        !exactObjectKeys(layer, ['mediaType', 'digest', 'size']) ||
        (layer.mediaType !== PUBLIC_OBJECT_MEDIA_TYPE &&
          layer.mediaType !== PRIVATE_OBJECT_MEDIA_TYPE) ||
        !/^sha256:[0-9a-f]{64}$/.test(layer.digest) ||
        !Number.isSafeInteger(layer.size) ||
        layer.size < 1 ||
        layer.size > MAX_CHUNK_BYTES
    )
  ) {
    throw new Error('Cheap LFS rejected an invalid tracked GHCR manifest.')
  }
  const configBytes = await registry.getBlob(manifest.config.digest)
  if (
    configBytes.byteLength !== manifest.config.size ||
    digestFor(configBytes) !== manifest.config.digest
  ) {
    throw new Error('Cheap LFS rejected inconsistent GHCR config bytes.')
  }
  const config = parseJsonBytes(configBytes, 'config')
  if (
    !exactObjectKeys(config, [
      'architecture',
      'os',
      'config',
      'rootfs',
      SNAPSHOT_CONFIG_FIELD,
    ]) ||
    config.architecture !== 'unknown' ||
    config.os !== 'unknown' ||
    !exactObjectKeys(config.config, ['Labels']) ||
    !exactObjectKeys(config.config.Labels, [OCI_SOURCE_ANNOTATION]) ||
    config.config.Labels[OCI_SOURCE_ANNOTATION] !==
      target.sourceRepositoryUrl ||
    !exactObjectKeys(config.rootfs, ['type', 'diff_ids']) ||
    config.rootfs.type !== 'layers' ||
    !Array.isArray(config.rootfs.diff_ids) ||
    config.rootfs.diff_ids.length !== manifest.layers.length ||
    config.rootfs.diff_ids.some(
      (value, index) => value !== manifest.layers[index].digest
    )
  ) {
    throw new Error('Cheap LFS rejected an invalid tracked GHCR config.')
  }
  const snapshot = validateSnapshot(
    config[SNAPSHOT_CONFIG_FIELD],
    target.repositoryIdentity,
    visibility
  )
  const snapshotLayers = snapshot.objects.flatMap(object =>
    object.chunks.map(chunk => chunk.blob)
  )
  if (
    snapshotLayers.length !== manifest.layers.length ||
    snapshotLayers.some(
      (descriptor, index) =>
        !descriptorMatches(descriptor, manifest.layers[index])
    )
  ) {
    throw new Error(
      'Cheap LFS rejected a GHCR snapshot whose layer index differs from its manifest.'
    )
  }
  return { manifest, manifestBytes: manifestResult.bytes, snapshot }
}

function requirePointerObject(pointer, image) {
  const sha = pointer.object.slice('sha256:'.length)
  const object = image.snapshot.objects.find(
    candidate => candidate.sha256 === sha
  )
  if (
    object === undefined ||
    object.sizeInBytes !== pointer.sizeInBytes ||
    (pointer.keyId !== undefined && pointer.keyId !== image.snapshot.keyId) ||
    object.chunks.length !== pointer.layers.length ||
    object.chunks.some(
      (chunk, index) => chunk.blob.digest !== pointer.layers[index]
    )
  ) {
    throw new Error(
      'A tracked GHCR pointer does not match its immutable validated image.'
    )
  }
  return object
}

async function loadExistingObjects(
  ociEntries,
  registry,
  target,
  visibility,
  expectedKeyId
) {
  const references = new Map()
  for (const entry of ociEntries) {
    const separator = entry.pointer.image.lastIndexOf('@')
    const repository = entry.pointer.image.slice(0, separator)
    const digest = entry.pointer.image.slice(separator + 1)
    if (repository !== target.registryRepository) {
      throw new Error(
        'Release-to-GHCR conversion found a GHCR pointer outside this repository’s canonical package.'
      )
    }
    if (
      (visibility === 'public' && entry.pointer.keyId !== undefined) ||
      (visibility === 'private' && entry.pointer.keyId !== expectedKeyId)
    ) {
      throw new Error(
        'A tracked GHCR pointer does not match the current repository visibility or key.'
      )
    }
    references.set(digest, null)
  }
  if (references.size > MAX_IMAGE_REFERENCES) {
    throw new Error(
      'Release-to-GHCR conversion found too many historical GHCR images to validate safely.'
    )
  }
  for (const digest of references.keys()) {
    references.set(
      digest,
      await loadValidatedImage(registry, digest, target, visibility)
    )
  }
  const objects = new Map()
  for (const entry of ociEntries) {
    const digest = entry.pointer.image.slice(
      entry.pointer.image.lastIndexOf('@') + 1
    )
    const object = requirePointerObject(entry.pointer, references.get(digest))
    const existing = objects.get(object.sha256)
    if (existing !== undefined && existing.sizeInBytes !== object.sizeInBytes) {
      throw new Error(
        'Current GHCR pointers disagree about one object’s canonical size.'
      )
    }
    if (existing === undefined) {
      objects.set(object.sha256, object)
    }
  }
  return objects
}

async function loadRepositoryKey(head, visibility, ociEntries) {
  requireOciPointerVisibility(
    visibility,
    ociEntries.map(entry => entry.pointer.keyId)
  )
  if (visibility === 'public') {
    return { key: null, keyId: null, addCanonicalKey: false }
  }

  const readKey = (path, header) => {
    const result = optionalGit(['cat-file', 'blob', `${head}:${path}`], {
      raw: true,
      maxBuffer: 1024,
    })
    return result.ok ? parseRepositoryKey(result.value, header) : null
  }
  const canonical = readKey(CANONICAL_KEY_PATH, CANONICAL_KEY_HEADER)
  const legacy = readKey(LEGACY_KEY_PATH, LEGACY_KEY_HEADER)
  if (
    canonical !== null &&
    legacy !== null &&
    repositoryKeyId(canonical) !== repositoryKeyId(legacy)
  ) {
    canonical.fill(0)
    legacy.fill(0)
    throw new Error(
      'The canonical and legacy tracked Cheap LFS repository keys disagree.'
    )
  }
  let key = canonical ?? legacy
  const hasExistingPrivatePointers = ociEntries.some(
    entry => entry.pointer.keyId !== undefined
  )
  if (key === null && hasExistingPrivatePointers) {
    throw new Error(
      'Private GHCR pointers exist but their tracked repository key is missing.'
    )
  }
  if (key === null) {
    key = newRepositoryKey()
  }
  if (legacy !== null && legacy !== key) {
    legacy.fill(0)
  }
  const keyId = repositoryKeyId(key)
  for (const entry of ociEntries) {
    if (entry.pointer.keyId !== keyId) {
      key.fill(0)
      throw new Error(
        'A private GHCR pointer names a different tracked repository key.'
      )
    }
  }
  return {
    key,
    keyId,
    addCanonicalKey: canonical === null,
  }
}

async function splitAndUploadPart({
  stream,
  expectedPart,
  object,
  tempRoot,
  registry,
  target,
  visibility,
  key,
}) {
  const partHash = createHash('sha256')
  let partBytes = 0
  let chunkHandle = null
  let chunkPath = null
  let chunkHash = null
  let chunkBytes = 0

  const closeChunk = async () => {
    if (chunkHandle === null || chunkPath === null || chunkHash === null) {
      return
    }
    await chunkHandle.sync()
    await chunkHandle.close()
    chunkHandle = null
    const ordinal = object.chunks.length
    const offset = object.processedBytes
    const plaintextSha256 = chunkHash.digest('hex')
    let storedPath = chunkPath
    let encryptedPath = null
    let encryption = null
    try {
      if (visibility === 'private') {
        encryptedPath = join(tempRoot, `encrypted-${object.index}-${ordinal}`)
        encryption = await encryptChunk({
          sourcePath: chunkPath,
          destinationPath: encryptedPath,
          repositoryIdentity: target.repositoryIdentity,
          objectSha256: object.sha256,
          objectSize: object.sizeInBytes,
          ordinal,
          offset,
          chunkSize: chunkBytes,
          repositoryKey: key,
        })
        storedPath = encryptedPath
      }
      const stored = await hashFile(storedPath)
      if (stored.bytes !== chunkBytes) {
        throw new Error('Cheap LFS staged an incomplete OCI chunk.')
      }
      const descriptor = {
        mediaType:
          visibility === 'private'
            ? PRIVATE_OBJECT_MEDIA_TYPE
            : PUBLIC_OBJECT_MEDIA_TYPE,
        digest: `sha256:${stored.sha256}`,
        size: stored.bytes,
      }
      await registry.uploadFile(storedPath, descriptor)
      object.chunks.push({
        ordinal,
        offset,
        sizeInBytes: chunkBytes,
        plaintextSha256,
        blob: descriptor,
        encryption,
      })
      object.processedBytes += chunkBytes
    } finally {
      await unlink(chunkPath).catch(() => {})
      if (encryptedPath !== null) {
        await unlink(encryptedPath).catch(() => {})
      }
      chunkPath = null
      chunkHash = null
      chunkBytes = 0
    }
  }

  try {
    for await (const incoming of stream) {
      const buffer = Buffer.isBuffer(incoming)
        ? incoming
        : Buffer.from(incoming)
      partBytes += buffer.byteLength
      if (partBytes > expectedPart.sizeInBytes) {
        throw new Error(
          `Release part ${expectedPart.name} inflated beyond its pointer size.`
        )
      }
      partHash.update(buffer)
      object.hash.update(buffer)
      let cursor = 0
      while (cursor < buffer.byteLength) {
        if (chunkHandle === null) {
          chunkPath = join(
            tempRoot,
            `plain-${object.index}-${object.chunks.length}`
          )
          chunkHandle = await open(chunkPath, 'wx', 0o600)
          chunkHash = createHash('sha256')
        }
        const available = MAX_CHUNK_BYTES - chunkBytes
        const count = Math.min(available, buffer.byteLength - cursor)
        const slice = buffer.subarray(cursor, cursor + count)
        let written = 0
        while (written < slice.byteLength) {
          const result = await chunkHandle.write(
            slice,
            written,
            slice.byteLength - written,
            chunkBytes + written
          )
          if (result.bytesWritten <= 0) {
            throw new Error('Cheap LFS could not stage a complete OCI chunk.')
          }
          written += result.bytesWritten
        }
        chunkHash.update(slice)
        chunkBytes += count
        cursor += count
        if (chunkBytes === MAX_CHUNK_BYTES) {
          await closeChunk()
        }
      }
    }
    await closeChunk()
  } finally {
    await chunkHandle?.close().catch(() => {})
    if (chunkPath !== null) {
      await unlink(chunkPath).catch(() => {})
    }
  }
  if (
    partBytes !== expectedPart.sizeInBytes ||
    partHash.digest('hex') !== expectedPart.sha256
  ) {
    throw new Error(
      `Release part ${expectedPart.name} does not match its plaintext pointer digest and size.`
    )
  }
}

async function convertReleaseObject({
  source,
  index,
  tempRoot,
  registry,
  target,
  visibility,
  key,
}) {
  const state = {
    index,
    sha256: source.sha256,
    sizeInBytes: source.sizeInBytes,
    hash: createHash('sha256'),
    processedBytes: 0,
    chunks: [],
  }
  for (let partIndex = 0; partIndex < source.parts.length; partIndex++) {
    const part = source.parts[partIndex]
    const release = await releaseForTag(source.releaseTag)
    const assets = await allAssets(release.id)
    requireManagedRelease(release, assets, source.releaseTag)
    const matches = assets.filter(asset => asset?.name === part.name)
    if (matches.length !== 1) {
      throw new Error(
        `Release asset ${part.name} is missing or ambiguous on ${source.releaseTag}.`
      )
    }
    const storedPath = join(tempRoot, `release-${index}-${partIndex}`)
    await downloadAsset(matches[0], storedPath, part.storedSizeInBytes)
    try {
      const stream =
        part.compression === 'deflate-raw'
          ? createReadStream(storedPath).pipe(createInflateRaw())
          : createReadStream(storedPath)
      await splitAndUploadPart({
        stream,
        expectedPart: part,
        object: state,
        tempRoot,
        registry,
        target,
        visibility,
        key,
      })
    } finally {
      await unlink(storedPath).catch(() => {})
    }
  }
  if (
    state.processedBytes !== source.sizeInBytes ||
    state.hash.digest('hex') !== source.sha256
  ) {
    throw new Error(
      `Release object ${source.sha256} does not match its whole-file pointer.`
    )
  }
  return {
    sha256: source.sha256,
    sizeInBytes: source.sizeInBytes,
    chunks: state.chunks,
  }
}

function mergeReleaseSources(releaseEntries) {
  const sources = new Map()
  for (const entry of releaseEntries) {
    const source = entry.pointer
    const previous = sources.get(source.sha256)
    if (previous !== undefined && previous.sizeInBytes !== source.sizeInBytes) {
      throw new Error(
        'Two Release pointers disagree about one object digest’s size.'
      )
    }
    if (previous === undefined) {
      sources.set(source.sha256, source)
    }
  }
  return sources
}

function parsePackageMetadata(value, repository, target) {
  if (
    typeof value !== 'object' ||
    value === null ||
    value.name !== target.packageName ||
    value.package_type !== 'container' ||
    (value.visibility !== 'public' && value.visibility !== 'private')
  ) {
    throw new Error('GitHub returned invalid GHCR package metadata.')
  }
  const linked = value.repository
  let linkedRepositoryIdentity = null
  if (
    typeof linked === 'object' &&
    linked !== null &&
    linked.id === repository.id &&
    String(linked.full_name).toLowerCase() === repositoryName.toLowerCase() &&
    linked.private === repository.private
  ) {
    linkedRepositoryIdentity = target.repositoryIdentity
  }
  return {
    packageVisibility: value.visibility,
    linkedRepositoryIdentity,
  }
}

async function inspectPackagePolicy(repository, target, visibility) {
  const endpoint =
    repository.owner.type === 'Organization'
      ? `/orgs/${repository.owner.login}/packages/container/${target.packageName}`
      : `/users/${repository.owner.login}/packages/container/${target.packageName}`
  let last = null
  for (let attempt = 1; attempt <= MAX_PACKAGE_POLICY_ATTEMPTS; attempt++) {
    const value = await apiJson(endpoint, { allowNotFound: true })
    if (value !== null) {
      last = parsePackageMetadata(value, repository, target)
      if (last.linkedRepositoryIdentity !== null) {
        break
      }
    }
    if (attempt < MAX_PACKAGE_POLICY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, PACKAGE_POLICY_RETRY_MS))
    }
  }
  if (last === null) {
    throw new Error(
      'GitHub did not expose the published GHCR package for policy verification. No pointers were changed.'
    )
  }
  requirePackagePolicy({
    sourceVisibility: visibility,
    packageVisibility: last.packageVisibility,
    repositoryIdentity: target.repositoryIdentity,
    linkedRepositoryIdentity: last.linkedRepositoryIdentity,
  })
}

async function remoteContainsCommit(defaultBranch, commit) {
  const remote = remoteBranchCommit(defaultBranch)
  if (remote === null) {
    return false
  }
  if (remote === commit) {
    return true
  }
  try {
    const comparison = await apiJson(
      `/repos/${repositoryName}/compare/${commit}...${remote}`
    )
    return (
      comparison?.status === 'ahead' &&
      comparison?.merge_base_commit?.sha === commit
    )
  } catch {
    return false
  }
}

function currentTreeBlob(path, head) {
  const output = optionalGit(['ls-tree', '-z', head, '--', path], {
    buffer: true,
  })
  if (!output.ok || output.value.length === 0) {
    return null
  }
  const records = parseTreeEntries(output.value, head)
  if (records.length !== 1 || records[0].path !== path) {
    throw new Error(`Cheap LFS found an unsafe tracked path at ${path}.`)
  }
  return records[0]
}

async function adoptPointers({
  head,
  defaultBranch,
  expectedRepository,
  releaseEntries,
  image,
  target,
  visibility,
  key,
  addCanonicalKey,
  tempRoot,
}) {
  await requireRepositoryPolicyUnchanged(expectedRepository, visibility)
  git(['diff', '--quiet'])
  git(['diff', '--cached', '--quiet'])
  if (
    git(['rev-parse', '--verify', 'HEAD']) !== head ||
    remoteBranchCommit(defaultBranch) !== head
  ) {
    throw new Error(
      'The default branch advanced before Cheap LFS pointer adoption.'
    )
  }
  const current = new Map(treeEntriesAt(head).map(entry => [entry.path, entry]))
  for (const entry of releaseEntries) {
    const exact = current.get(entry.path)
    if (
      exact === undefined ||
      exact.mode !== entry.mode ||
      exact.oid !== entry.oid
    ) {
      throw new Error(
        `Release pointer ${entry.path} changed before GHCR adoption.`
      )
    }
  }

  const temporaryIndex = join(tempRoot, 'pointer-index')
  const indexEnvironment = { GIT_INDEX_FILE: temporaryIndex }
  git(['read-tree', head], { env: indexEnvironment })
  const immutableImage = `${target.registryRepository}@${image.manifestDigest}`
  const objectBySha = new Map(
    image.snapshot.objects.map(object => [object.sha256, object])
  )
  const expectedPaths = new Set()
  for (const entry of releaseEntries) {
    const object = objectBySha.get(entry.pointer.sha256)
    if (
      object === undefined ||
      object.sizeInBytes !== entry.pointer.sizeInBytes
    ) {
      throw new Error(
        `The canonical GHCR snapshot omitted Release pointer ${entry.path}.`
      )
    }
    const text = serializeOciPointer({
      image: immutableImage,
      object: `sha256:${object.sha256}`,
      sizeInBytes: object.sizeInBytes,
      layers: object.chunks.map(chunk => chunk.blob.digest),
      ...(visibility === 'private' ? { keyId: image.snapshot.keyId } : {}),
    })
    const oid = git(['hash-object', '-w', '--stdin'], {
      input: text,
      quiet: true,
    })
    git(['update-index', '-z', '--index-info'], {
      env: indexEnvironment,
      input: Buffer.from(`${entry.mode} ${oid}\t${entry.path}\0`),
    })
    expectedPaths.add(entry.path)
  }

  if (visibility === 'private' && addCanonicalKey) {
    if (key === null || currentTreeBlob(CANONICAL_KEY_PATH, head) !== null) {
      throw new Error(
        'The tracked Cheap LFS repository key changed before pointer adoption.'
      )
    }
    const keyText = serializeRepositoryKey(key)
    const keyOid = git(['hash-object', '-w', '--stdin'], {
      input: keyText,
      quiet: true,
    })
    git(['update-index', '-z', '--index-info'], {
      env: indexEnvironment,
      input: Buffer.from(`100644 ${keyOid}\t${CANONICAL_KEY_PATH}\0`),
    })
    expectedPaths.add(CANONICAL_KEY_PATH)
  }

  const tree = git(['write-tree', '--missing-ok'], {
    env: indexEnvironment,
  })
  const changedPaths = git(
    ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', head, tree],
    { quiet: true, raw: true }
  )
    .split('\0')
    .filter(Boolean)
  if (
    changedPaths.length !== expectedPaths.size ||
    changedPaths.some(path => !expectedPaths.has(path))
  ) {
    throw new Error('Cheap LFS prepared an unexpected pointer tree change.')
  }
  if (
    git(['rev-parse', '--verify', 'HEAD']) !== head ||
    remoteBranchCommit(defaultBranch) !== head
  ) {
    throw new Error(
      'The default branch advanced while Cheap LFS prepared pointer adoption.'
    )
  }
  await requireRepositoryPolicyUnchanged(expectedRepository, visibility)
  const commit = git(
    [
      '-c',
      'user.name=github-actions[bot]',
      '-c',
      'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit-tree',
      tree,
      '-p',
      head,
      '-m',
      'Adopt Cheap LFS GHCR snapshot / 接收 Cheap LFS GHCR 快照 [skip ci]',
      '-m',
      'Replace current default-branch Release pointers only after one exact GHCR snapshot was published and verified.',
      '-m',
      '一個完整 GHCR 快照驗明正身先一次過換 pointer；舊 Release 資產原封不動，歷史仲有路返屋企。',
      '-m',
      serializeAdoptionReceipt({
        manifestDigest: image.manifestDigest,
        parentCommit: head,
        visibility,
        pointerCount: releaseEntries.length,
      }),
    ],
    { quiet: true }
  )
  try {
    git(['push', 'origin', `${commit}:refs/heads/${defaultBranch}`])
  } catch (error) {
    if (!(await remoteContainsCommit(defaultBranch, commit))) {
      throw error
    }
    console.warn(
      'The pointer push acknowledgement was lost, but the remote contains the exact adoption commit.'
    )
  }
  git(['diff', '--quiet'])
  git(['diff', '--cached', '--quiet'])
  git(['reset', '--hard', commit])
  if (
    git(['rev-parse', '--verify', 'HEAD']) !== commit ||
    remoteBranchCommit(defaultBranch) !== commit
  ) {
    throw new Error(
      'Cheap LFS could not prove the adopted default-branch commit remotely.'
    )
  }
  return commit
}

async function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, 'utf8')
  }
}

function singleCommitParent(commit) {
  const lineage = git(['rev-list', '--parents', '-n', '1', commit])
    .split(/\s+/)
    .filter(Boolean)
  if (
    lineage.length !== 2 ||
    lineage[0] !== commit ||
    !/^[a-f0-9]{40,64}$/.test(lineage[1])
  ) {
    throw new Error(
      'Cheap LFS GHCR adoption repair requires one exact parent commit.'
    )
  }
  return lineage[1]
}

function changedTreePaths(parent, commit) {
  const paths = git(
    ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', parent, commit],
    { raw: true, quiet: true }
  )
    .split('\0')
    .filter(Boolean)
  if (new Set(paths).size !== paths.length) {
    throw new Error(
      'Cheap LFS GHCR adoption repair found duplicate changed paths.'
    )
  }
  return paths
}

function fetchAdoptionParent(head) {
  git([
    'fetch',
    '--no-tags',
    '--refetch',
    '--depth=2',
    `--filter=blob:limit=${MAX_POINTER_BLOB_BYTES}`,
    'origin',
    head,
  ])
  if (git(['rev-parse', '--verify', 'HEAD']) !== head) {
    throw new Error(
      'The checked-out commit changed while fetching its adoption parent.'
    )
  }
}

async function repairInterruptedCanonicalPromotion({
  repository,
  visibility,
  target,
  head,
  pointers,
}) {
  const message = git(['show', '-s', '--format=%B', head], { raw: true })
  const receipt = parseAdoptionReceipt(message)
  if (receipt === null) {
    return false
  }
  if (receipt.visibility !== visibility) {
    throw new Error(
      'Repository visibility changed after the recorded GHCR adoption. The canonical tag was not promoted.'
    )
  }

  fetchAdoptionParent(head)
  const parent = singleCommitParent(head)
  if (parent !== receipt.parentCommit) {
    throw new Error(
      'The GHCR adoption receipt does not name the exact parent commit.'
    )
  }
  const parentPointers = await trackedPointersAt(parent)
  const auxiliaryPaths = []
  const parentCanonicalKey = currentTreeBlob(CANONICAL_KEY_PATH, parent)
  const currentCanonicalKey = currentTreeBlob(CANONICAL_KEY_PATH, head)
  if (
    visibility === 'private' &&
    parentCanonicalKey === null &&
    currentCanonicalKey !== null
  ) {
    auxiliaryPaths.push(CANONICAL_KEY_PATH)
  }
  const converted = requireRepairableAdoption({
    receipt,
    headCommit: head,
    parentCommit: parent,
    changedPaths: changedTreePaths(parent, head),
    allowedAuxiliaryPaths: auxiliaryPaths,
    parentReleasePointers: parentPointers.release,
    currentReleasePointers: pointers.release,
    currentOciPointers: pointers.oci,
    registryRepository: target.registryRepository,
    visibility,
  })

  const registry = new GhcrRegistry(target)
  const keyState = await loadRepositoryKey(head, visibility, pointers.oci)
  try {
    if (keyState.addCanonicalKey) {
      throw new Error(
        'Cheap LFS GHCR adoption repair could not prove the canonical repository key.'
      )
    }
    const image = await loadValidatedImage(
      registry,
      receipt.manifestDigest,
      target,
      visibility
    )
    for (const entry of converted) {
      requirePointerObject(entry.pointer, image)
    }
    await inspectPackagePolicy(repository, target, visibility)
    await requireRepositoryPolicyUnchanged(repository, visibility)
    requireRemoteDefaultCommit(
      repository.default_branch,
      head,
      'immediately before interrupted canonical-tag repair'
    )
    await registry.putManifest(OCI_REPOSITORY_TAG, image.manifestBytes)
    requireRemoteDefaultCommit(
      repository.default_branch,
      head,
      'immediately after interrupted canonical-tag repair'
    )
    await summary(
      `Repaired the canonical GHCR tag for already-adopted snapshot \`${receipt.manifestDigest}\` at \`${head}\` after revalidating the exact adoption commit.`
    )
    await summary(
      'No Git pointer or Release asset changed during canonical-tag repair.'
    )
    console.log(
      `Cheap LFS Release-to-GHCR: repaired the canonical tag for ${head}.`
    )
    return true
  } finally {
    keyState.key?.fill(0)
  }
}

async function main() {
  git(['diff', '--quiet'])
  git(['diff', '--cached', '--quiet'])
  const repository = await loadRepositoryMetadata()
  const visibility = resolveConversionVisibility(
    repository.visibility,
    privateConfirmation === 'true'
  )
  const target = deriveTarget(repository)
  const head = fetchPointerSizedBlobs()
  requireRemoteDefaultCommit(
    repository.default_branch,
    head,
    'before conversion began'
  )
  const pointers = await trackedPointersAt(head)
  await summary('## Cheap LFS Release → GHCR')
  if (pointers.release.length === 0) {
    if (
      await repairInterruptedCanonicalPromotion({
        repository,
        visibility,
        target,
        head,
        pointers,
      })
    ) {
      return
    }
    await summary(
      'No current default-branch Release pointers needed conversion. Nothing was published or changed.'
    )
    console.log(
      'Cheap LFS Release-to-GHCR: no current default-branch Release pointers.'
    )
    return
  }

  const registry = new GhcrRegistry(target)
  const keyState = await loadRepositoryKey(head, visibility, pointers.oci)
  const tempRoot = await mkdtemp(join(tmpdir(), 'cheap-lfs-release-to-ghcr-'))
  try {
    const objects = await loadExistingObjects(
      selectCanonicalGhcrEntries(pointers.oci, target.registryRepository),
      registry,
      target,
      visibility,
      keyState.keyId
    )
    const sources = mergeReleaseSources(pointers.release)
    let converted = 0
    for (const source of [...sources.values()].sort((left, right) =>
      left.sha256.localeCompare(right.sha256)
    )) {
      const existing = objects.get(source.sha256)
      if (existing !== undefined) {
        if (existing.sizeInBytes !== source.sizeInBytes) {
          throw new Error(
            'A Release object disagrees with an existing GHCR object size.'
          )
        }
        continue
      }
      if (objects.size >= MAX_OBJECTS) {
        throw new Error(
          'The canonical Cheap LFS GHCR snapshot would exceed 4096 objects.'
        )
      }
      console.log(`Converting Release object ${source.sha256}…`)
      const object = await convertReleaseObject({
        source,
        index: converted,
        tempRoot,
        registry,
        target,
        visibility,
        key: keyState.key,
      })
      objects.set(object.sha256, object)
      converted++
    }
    const totalLayers = [...objects.values()].reduce(
      (sum, object) => sum + object.chunks.length,
      0
    )
    if (totalLayers > MAX_LAYERS) {
      throw new Error(
        'The canonical Cheap LFS GHCR snapshot would exceed 8192 layers.'
      )
    }
    const image = buildImage({
      repositoryIdentity: target.repositoryIdentity,
      sourceRepositoryUrl: target.sourceRepositoryUrl,
      visibility,
      keyId: keyState.keyId,
      objects: [...objects.values()],
    })
    const retentionTag = `${OCI_RETENTION_TAG_PREFIX}${image.manifestDigest.slice(
      'sha256:'.length
    )}`
    const commit = await runCanonicalPublicationTransaction({
      publishImmutableSnapshot: async () => {
        await registry.uploadBuffer(
          image.configBytes,
          image.configDescriptor.digest
        )
        await registry.putManifest(image.manifestDigest, image.manifestBytes)
        await registry.putManifest(retentionTag, image.manifestBytes)
      },
      // A public first publish intentionally reaches package inspection:
      // GHCR has created its default-private package and retained the immutable
      // image, but neither Git pointers nor the mutable canonical tag changed.
      verifyPackagePolicy: async () => {
        await inspectPackagePolicy(repository, target, visibility)
      },
      verifyCapturedDefault: async () => {
        await requireRepositoryPolicyUnchanged(repository, visibility)
        requireRemoteDefaultCommit(
          repository.default_branch,
          head,
          'before pointer adoption'
        )
      },
      adoptPointers: async () =>
        adoptPointers({
          head,
          defaultBranch: repository.default_branch,
          expectedRepository: repository,
          releaseEntries: pointers.release,
          image,
          target,
          visibility,
          key: keyState.key,
          addCanonicalKey: keyState.addCanonicalKey,
          tempRoot,
        }),
      verifyAdoptedDefault: async adoptionCommit => {
        await requireRepositoryPolicyUnchanged(repository, visibility)
        requireRemoteDefaultCommit(
          repository.default_branch,
          adoptionCommit,
          'after pointer adoption and immediately before canonical-tag promotion'
        )
      },
      publishCanonicalTag: async () => {
        await registry.putManifest(OCI_REPOSITORY_TAG, image.manifestBytes)
      },
    })
    await summary(
      `Published one canonical GHCR snapshot \`${image.manifestDigest}\` and adopted ${pointers.release.length} current default-branch Release pointer(s) in \`${commit}\`.`
    )
    await summary(
      'Release assets were retained unchanged for historical restores.'
    )
    console.log(
      `Cheap LFS Release-to-GHCR: adopted ${pointers.release.length} pointer(s) in ${commit}.`
    )
  } finally {
    keyState.key?.fill(0)
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main()
}

export { readPointerBlobs }
