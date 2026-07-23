import { createHash, randomUUID } from 'crypto'
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { Readable } from 'stream'
import { Entry, fromBuffer as openZipBuffer, ZipFile } from 'yauzl'
import {
  CheapLfsBundledOrasManifest,
  CheapLfsBundledOrasWindowsAmd64ArchiveSha256,
  CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
  CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
  CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
  CheapLfsOrasArchitecture,
} from '../app/src/lib/cheap-lfs/oci-registry-runtime'

const MaximumArchiveBytes = 64 * 1024 * 1024
const MaximumLicenseBytes = 64 * 1024
const MaximumRedirects = 5
const AllowedRedirectHost = 'release-assets.githubusercontent.com'
const DownloadDeadlineMilliseconds = 2 * 60 * 1000

export const CheapLfsBundledOrasLicenseSha256 =
  'sha256:eccb04b94c71454ea03f00ecb518b997952c4f2f23aca50baab98230f5c8dc00'
export const CheapLfsBundledOrasLicenseBytes = 11_343

export interface ICheapLfsOrasBuildTrust {
  readonly archiveUrl: string
  readonly archiveSha256: string
  readonly executableSha256: string
  readonly executableBytes: number
  readonly licenseSha256: string
  readonly licenseBytes: number
}

export const CheapLfsOfficialOrasBuildTrust: ICheapLfsOrasBuildTrust = {
  archiveUrl: CheapLfsBundledOrasWindowsAmd64ArchiveUrl,
  archiveSha256: CheapLfsBundledOrasWindowsAmd64ArchiveSha256,
  executableSha256: CheapLfsBundledOrasWindowsAmd64ExecutableSha256,
  executableBytes: CheapLfsBundledOrasWindowsAmd64ExecutableBytes,
  licenseSha256: CheapLfsBundledOrasLicenseSha256,
  licenseBytes: CheapLfsBundledOrasLicenseBytes,
}

export interface ICheapLfsOrasStagingDestination {
  readonly appArchitecture: CheapLfsOrasArchitecture
  readonly executableArchitecture: CheapLfsOrasArchitecture
  readonly path: string
}

export interface ICheapLfsOrasBuildPreparationResult {
  readonly archiveSha256: string
  readonly executableSha256: string
  readonly executableBytes: number
  readonly licenseSha256: string
  readonly licenseBytes: number
  readonly licensePath: string
  readonly destinations: ReadonlyArray<ICheapLfsOrasStagingDestination>
}

interface IFetchHeaders {
  get(name: string): string | null
}

interface IFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers: IFetchHeaders
  readonly body: ReadableStream<Uint8Array> | null
}

export type CheapLfsOrasBuildFetch = (
  url: string,
  init: { readonly redirect: 'manual'; readonly signal: AbortSignal }
) => Promise<IFetchResponse>

export interface IPrepareCheapLfsOrasForBuildOptions {
  /** The generated webpack/build root (`out`), never a source directory. */
  readonly generatedOutputRoot: string
  readonly platform?: NodeJS.Platform
  readonly fetch?: CheapLfsOrasBuildFetch
}

export class CheapLfsOrasBuildPreparationError extends Error {
  public constructor(
    public readonly kind:
      | 'invalid-input'
      | 'download'
      | 'integrity'
      | 'archive'
      | 'staging',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsOrasBuildPreparationError'
  }
}

function downloadError(): CheapLfsOrasBuildPreparationError {
  return new CheapLfsOrasBuildPreparationError(
    'download',
    'The pinned ORAS release archive could not be downloaded.'
  )
}

function waitForDownload<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(downloadError())
  }
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(downloadError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolvePromise(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

function isInside(root: string, path: string): boolean {
  const child = relative(resolve(root), resolve(path))
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function requireDigest(value: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS build trust manifest has an invalid digest.'
    )
  }
}

function requireTrust(trust: ICheapLfsOrasBuildTrust): void {
  requireDigest(trust.archiveSha256)
  requireDigest(trust.executableSha256)
  requireDigest(trust.licenseSha256)
  if (
    !Number.isSafeInteger(trust.executableBytes) ||
    trust.executableBytes <= 0 ||
    trust.executableBytes > MaximumArchiveBytes
  ) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS build trust manifest has an invalid executable size.'
    )
  }
  if (
    !Number.isSafeInteger(trust.licenseBytes) ||
    trust.licenseBytes <= 0 ||
    trust.licenseBytes > MaximumLicenseBytes
  ) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS build trust manifest has an invalid license size.'
    )
  }
  let source: URL
  try {
    source = new URL(trust.archiveUrl)
  } catch {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS build trust manifest has an invalid source URL.'
    )
  }
  if (
    source.protocol !== 'https:' ||
    source.username !== '' ||
    source.password !== '' ||
    source.port !== '' ||
    source.hostname !== 'github.com' ||
    source.pathname !==
      '/oras-project/oras/releases/download/v1.3.2/oras_1.3.2_windows_amd64.zip' ||
    source.search !== '' ||
    source.hash !== ''
  ) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS archive URL is not the allowlisted official release asset.'
    )
  }
}

export function getCheapLfsOrasStagingPlan(
  generatedOutputRoot: string
): ReadonlyArray<ICheapLfsOrasStagingDestination> {
  if (!isAbsolute(generatedOutputRoot)) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'ORAS staging requires an absolute generated output root.'
    )
  }
  const outputRoot = resolve(generatedOutputRoot)
  return (['x64', 'arm64'] as const).map(appArchitecture => {
    const manifest = CheapLfsBundledOrasManifest.binaries[appArchitecture]
    if (manifest === undefined) {
      throw new CheapLfsOrasBuildPreparationError(
        'invalid-input',
        'The checked-in ORAS runtime manifest is incomplete.'
      )
    }
    const path = join(
      outputRoot,
      'static',
      'cheap-lfs',
      'oras',
      `win32-${appArchitecture}`,
      'oras.exe'
    )
    if (!isInside(outputRoot, path)) {
      throw new CheapLfsOrasBuildPreparationError(
        'staging',
        'The ORAS staging path escaped generated build output.'
      )
    }
    return {
      appArchitecture,
      executableArchitecture: manifest.executableArchitecture,
      path,
    }
  })
}

function getCheapLfsOrasLicensePath(generatedOutputRoot: string): string {
  const outputRoot = resolve(generatedOutputRoot)
  const path = join(
    outputRoot,
    'static',
    'cheap-lfs',
    'oras',
    'LICENSE.ORAS.txt'
  )
  if (!isInside(outputRoot, path)) {
    throw new CheapLfsOrasBuildPreparationError(
      'staging',
      'The ORAS license staging path escaped generated build output.'
    )
  }
  return path
}

async function responseFollowingTrustedRedirects(
  fetch: CheapLfsOrasBuildFetch,
  sourceUrl: string,
  signal: AbortSignal
): Promise<IFetchResponse> {
  let url = sourceUrl
  for (let attempt = 0; attempt <= MaximumRedirects; attempt++) {
    let response: IFetchResponse
    try {
      response = await waitForDownload(
        fetch(url, { redirect: 'manual', signal }),
        signal
      )
    } catch (error) {
      if (error instanceof CheapLfsOrasBuildPreparationError) {
        throw error
      }
      throw downloadError()
    }
    if (response.ok && response.status === 200) {
      return response
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new CheapLfsOrasBuildPreparationError(
        'download',
        'The pinned ORAS release archive returned an unexpected response.'
      )
    }
    const location = response.headers.get('location')
    if (location === null || attempt === MaximumRedirects) {
      throw new CheapLfsOrasBuildPreparationError(
        'download',
        'The pinned ORAS release archive exceeded its redirect policy.'
      )
    }
    let target: URL
    try {
      target = new URL(location, url)
    } catch {
      throw new CheapLfsOrasBuildPreparationError(
        'download',
        'The pinned ORAS release archive returned an invalid redirect.'
      )
    }
    if (
      target.protocol !== 'https:' ||
      target.username !== '' ||
      target.password !== '' ||
      target.port !== '' ||
      target.hostname !== AllowedRedirectHost
    ) {
      throw new CheapLfsOrasBuildPreparationError(
        'download',
        'The pinned ORAS release archive redirected outside GitHub release assets.'
      )
    }
    url = target.toString()
  }
  throw new CheapLfsOrasBuildPreparationError(
    'download',
    'The pinned ORAS release archive exceeded its redirect policy.'
  )
}

async function downloadVerifiedArchive(
  fetch: CheapLfsOrasBuildFetch,
  trust: ICheapLfsOrasBuildTrust,
  destination: string,
  signal: AbortSignal
): Promise<string> {
  const response = await responseFollowingTrustedRedirects(
    fetch,
    trust.archiveUrl,
    signal
  )
  if (response.body === null) {
    throw new CheapLfsOrasBuildPreparationError(
      'download',
      'The pinned ORAS release archive response was empty.'
    )
  }
  const handle = await open(destination, 'wx')
  const hash = createHash('sha256')
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const read = await waitForDownload(reader.read(), signal)
      if (read.done) {
        break
      }
      const bytes = Buffer.from(read.value)
      size += bytes.byteLength
      if (size > MaximumArchiveBytes) {
        throw new CheapLfsOrasBuildPreparationError(
          'integrity',
          'The ORAS release archive exceeded its size bound.'
        )
      }
      hash.update(bytes)
      await handle.write(bytes)
    }
  } catch (error) {
    if (error instanceof CheapLfsOrasBuildPreparationError) {
      throw error
    }
    throw downloadError()
  } finally {
    void reader.cancel().catch(() => undefined)
    await handle.close()
  }
  const actual = `sha256:${hash.digest('hex')}`
  if (size <= 0 || actual !== trust.archiveSha256) {
    throw new CheapLfsOrasBuildPreparationError(
      'integrity',
      'The ORAS release archive does not match its pinned SHA-256.'
    )
  }
  return actual
}

function openZipFile(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolvePromise, reject) => {
    openZipBuffer(
      bytes,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zip) => {
        if ((error !== undefined && error !== null) || zip === undefined) {
          reject(
            new CheapLfsOrasBuildPreparationError(
              'archive',
              'The pinned ORAS release archive could not be opened safely.'
            )
          )
        } else {
          resolvePromise(zip)
        }
      }
    )
  })
}

function openZipEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolvePromise, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if ((error !== undefined && error !== null) || stream === undefined) {
        reject(
          new CheapLfsOrasBuildPreparationError(
            'archive',
            'The pinned ORAS executable could not be extracted safely.'
          )
        )
      } else {
        resolvePromise(stream)
      }
    })
  })
}

async function readBoundedZipEntry(
  zip: ZipFile,
  entry: Entry,
  expectedBytes: number,
  description: 'executable' | 'license'
): Promise<Buffer> {
  const stream = await openZipEntry(zip, entry)
  return new Promise<Buffer>((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const fail = (message: string) => {
      if (settled) {
        return
      }
      settled = true
      stream.destroy()
      reject(new CheapLfsOrasBuildPreparationError('archive', message))
    }
    stream.on('data', value => {
      if (settled) {
        return
      }
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
      size += bytes.byteLength
      if (size > expectedBytes) {
        fail(`The pinned ORAS ${description} exceeded its exact size.`)
      } else {
        chunks.push(Buffer.from(bytes))
      }
    })
    stream.once('error', () =>
      fail(`The pinned ORAS ${description} could not be extracted safely.`)
    )
    stream.once('end', () => {
      if (settled) {
        return
      }
      settled = true
      if (size !== expectedBytes) {
        reject(
          new CheapLfsOrasBuildPreparationError(
            'archive',
            `The pinned ORAS ${description} has an unexpected size.`
          )
        )
      } else {
        resolvePromise(Buffer.concat(chunks, size))
      }
    })
  })
}

interface IExtractedOrasPayload {
  readonly executable: Buffer
  readonly license: Buffer
}

async function extractVerifiedPayload(
  archivePath: string,
  trust: ICheapLfsOrasBuildTrust
): Promise<IExtractedOrasPayload> {
  const archive = await readFile(archivePath)
  if (archive.byteLength <= 0 || archive.byteLength > MaximumArchiveBytes) {
    archive.fill(0)
    throw new CheapLfsOrasBuildPreparationError(
      'archive',
      'The pinned ORAS release archive exceeded its extraction size bound.'
    )
  }
  const zip = await openZipFile(archive)
  try {
    return await new Promise<IExtractedOrasPayload>(
      (resolvePromise, reject) => {
        let foundExecutable = false
        let foundLicense = false
        let executable: Buffer | null = null
        let license: Buffer | null = null
        let settled = false
        const clearExtracted = () => {
          executable?.fill(0)
          license?.fill(0)
        }
        const fail = () => {
          if (settled) {
            return
          }
          settled = true
          clearExtracted()
          zip.close()
          reject(
            new CheapLfsOrasBuildPreparationError(
              'archive',
              'The pinned ORAS release archive has an unsafe structure.'
            )
          )
        }
        zip.on('error', fail)
        zip.on('entry', (entry: Entry) => {
          if (settled) {
            return
          }
          if (entry.fileName !== 'oras.exe' && entry.fileName !== 'LICENSE') {
            zip.readEntry()
            return
          }
          const isExecutable = entry.fileName === 'oras.exe'
          const alreadyFound = isExecutable ? foundExecutable : foundLicense
          const expectedBytes = isExecutable
            ? trust.executableBytes
            : trust.licenseBytes
          if (
            alreadyFound ||
            entry.isEncrypted() ||
            entry.uncompressedSize !== expectedBytes
          ) {
            fail()
            return
          }
          if (isExecutable) {
            foundExecutable = true
          } else {
            foundLicense = true
          }
          readBoundedZipEntry(
            zip,
            entry,
            expectedBytes,
            isExecutable ? 'executable' : 'license'
          )
            .then(bytes => {
              if (isExecutable) {
                executable = bytes
              } else {
                license = bytes
              }
              zip.readEntry()
            })
            .catch(fail)
        })
        zip.on('end', () => {
          if (settled) {
            return
          }
          settled = true
          zip.close()
          if (
            !foundExecutable ||
            executable === null ||
            !foundLicense ||
            license === null
          ) {
            clearExtracted()
            reject(
              new CheapLfsOrasBuildPreparationError(
                'archive',
                'The pinned ORAS release archive did not contain one executable and one license.'
              )
            )
            return
          }
          const executableSha256 = `sha256:${createHash('sha256')
            .update(executable)
            .digest('hex')}`
          if (executableSha256 !== trust.executableSha256) {
            clearExtracted()
            reject(
              new CheapLfsOrasBuildPreparationError(
                'integrity',
                'The extracted ORAS executable does not match its pinned SHA-256.'
              )
            )
            return
          }
          const licenseSha256 = `sha256:${createHash('sha256')
            .update(license)
            .digest('hex')}`
          if (licenseSha256 !== trust.licenseSha256) {
            clearExtracted()
            reject(
              new CheapLfsOrasBuildPreparationError(
                'integrity',
                'The extracted ORAS license does not match its pinned SHA-256.'
              )
            )
            return
          }
          resolvePromise({ executable, license })
        })
        zip.readEntry()
      }
    )
  } finally {
    archive.fill(0)
  }
}

async function stageVerifiedFile(
  path: string,
  bytes: Buffer,
  kind: 'executable' | 'license'
): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.oras-${process.pid}-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, bytes, {
      flag: 'wx',
      mode: kind === 'executable' ? 0o755 : 0o644,
    })
    await rename(temporary, path)
  } catch {
    throw new CheapLfsOrasBuildPreparationError(
      'staging',
      `The verified ORAS ${kind} could not be staged into build output.`
    )
  } finally {
    await rm(temporary, { force: true })
  }
}

async function prepareWithTrust(
  options: IPrepareCheapLfsOrasForBuildOptions,
  trust: ICheapLfsOrasBuildTrust,
  downloadDeadlineMilliseconds = DownloadDeadlineMilliseconds
): Promise<ICheapLfsOrasBuildPreparationResult | null> {
  if ((options.platform ?? process.platform) !== 'win32') {
    return null
  }
  requireTrust(trust)
  if (
    !Number.isSafeInteger(downloadDeadlineMilliseconds) ||
    downloadDeadlineMilliseconds <= 0
  ) {
    throw new CheapLfsOrasBuildPreparationError(
      'invalid-input',
      'The ORAS build download deadline is invalid.'
    )
  }
  const destinations = getCheapLfsOrasStagingPlan(options.generatedOutputRoot)
  const licensePath = getCheapLfsOrasLicensePath(options.generatedOutputRoot)
  const work = await mkdtemp(join(tmpdir(), 'desktop-material-oras-'))
  const archivePath = join(work, 'oras.zip')
  let payload: IExtractedOrasPayload | null = null
  const downloadController = new AbortController()
  const downloadDeadline = setTimeout(
    () => downloadController.abort(),
    downloadDeadlineMilliseconds
  )
  try {
    const archiveSha256 = await downloadVerifiedArchive(
      options.fetch ?? (globalThis.fetch as CheapLfsOrasBuildFetch),
      trust,
      archivePath,
      downloadController.signal
    )
    clearTimeout(downloadDeadline)
    payload = await extractVerifiedPayload(archivePath, trust)
    await stageVerifiedFile(licensePath, payload.license, 'license')
    for (const destination of destinations) {
      await stageVerifiedFile(
        destination.path,
        payload.executable,
        'executable'
      )
    }
    return {
      archiveSha256,
      executableSha256: trust.executableSha256,
      executableBytes: payload.executable.byteLength,
      licenseSha256: trust.licenseSha256,
      licenseBytes: payload.license.byteLength,
      licensePath,
      destinations,
    }
  } finally {
    clearTimeout(downloadDeadline)
    downloadController.abort()
    payload?.executable.fill(0)
    payload?.license.fill(0)
    await rm(work, { recursive: true, force: true })
  }
}

/** Prepare the only production-trusted ORAS payload. */
export function prepareBundledCheapLfsOrasForBuild(
  options: IPrepareCheapLfsOrasForBuildOptions
): Promise<ICheapLfsOrasBuildPreparationResult | null> {
  return prepareWithTrust(options, CheapLfsOfficialOrasBuildTrust)
}

/** Explicit trust injection used only by deterministic build tests. */
export function prepareCheapLfsOrasForBuildWithTrustForTests(
  options: IPrepareCheapLfsOrasForBuildOptions,
  trust: ICheapLfsOrasBuildTrust,
  downloadDeadlineMilliseconds?: number
): Promise<ICheapLfsOrasBuildPreparationResult | null> {
  return prepareWithTrust(options, trust, downloadDeadlineMilliseconds)
}
