import { createWriteStream } from 'fs'
import {
  access,
  mkdir,
  mkdtemp,
  open as openFile,
  rename,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'
import { execFile } from '../exec-file'
import { Entry as ZipEntry, fromFd, ZipFile } from 'yauzl'
import { git } from './core'
import { IStashEntry, stashEntryTitle } from '../../models/stash-entry'
import { Repository } from '../../models/repository'

export type StashExportFormat = 'directory' | 'zip' | '7z'

export type StashSevenZipMethod =
  | 'Copy'
  | 'Deflate'
  | 'BZip2'
  | 'LZMA'
  | 'LZMA2'
  | 'PPMd'

export interface IStashSevenZipOptions {
  readonly method: StashSevenZipMethod
  readonly level: number
  readonly dictionary: string
  readonly matchFinder: 'BT2' | 'BT3' | 'BT4' | 'HC4'
  readonly fastBytes: number
  readonly solid: boolean
  readonly threads: string
  readonly splitVolumes: string
  readonly password?: string
  readonly encryptHeaders: boolean
}

export interface IStashExportRequest {
  readonly repository: Repository
  readonly entries: ReadonlyArray<IStashEntry>
  readonly format: StashExportFormat
  /** For directory exports this is the parent directory. */
  readonly destination: string
  readonly sevenZip?: IStashSevenZipOptions
  readonly signal?: AbortSignal
}

export interface IStashExportResult {
  readonly destination: string
  readonly format: StashExportFormat
  readonly entryCount: number
}

const archiveLimit = 256 * 1024 * 1024
const safeSegment = /[^a-zA-Z0-9._-]+/g

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Stash export cancelled.')
  }
}

function safeName(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(safeSegment, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 96) || fallback
}

function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = Path.resolve(root)
  const resolved = Path.resolve(candidate)
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${Path.sep}`)
  ) {
    throw new Error(
      'The stash archive contained a path outside its export directory.'
    )
  }
  return resolved
}

function openZip(fd: number): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromFd(
      fd,
      {
        autoClose: false,
        lazyEntries: true,
        decodeStrings: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, zip) =>
        error
          ? reject(error)
          : zip === undefined
          ? reject(new Error('The stash archive could not be opened.'))
          : resolve(zip)
    )
  })
}

function openEntryStream(
  zip: ZipFile,
  entry: ZipEntry
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (error, stream) =>
      error
        ? reject(error)
        : stream === undefined
        ? reject(new Error('The stash archive entry could not be read.'))
        : resolve(stream)
    )
  )
}

async function extractZip(
  archivePath: string,
  destination: string,
  signal?: AbortSignal
): Promise<void> {
  const handle = await openFile(archivePath, 'r')
  let zip: ZipFile | null = null
  try {
    zip = await openZip(handle.fd)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) {
          return
        }
        settled = true
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      zip?.on('error', finish)
      zip?.on('end', () => finish())
      zip?.on('entry', async entry => {
        try {
          throwIfAborted(signal)
          const entryPath = entry.fileName.replace(/\\/g, '/')
          const target = ensureInside(
            destination,
            Path.join(destination, entryPath)
          )
          if (/\/$/.test(entryPath)) {
            await mkdir(target, { recursive: true })
            zip?.readEntry()
            return
          }
          await mkdir(Path.dirname(target), { recursive: true })
          const stream = await openEntryStream(zip as ZipFile, entry)
          await new Promise<void>((streamResolve, streamReject) => {
            const output = createWriteStream(target, { flags: 'wx' })
            output.once('error', streamReject)
            output.once('close', () => streamResolve())
            stream.once('error', streamReject)
            stream.pipe(output)
          })
          zip?.readEntry()
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })
      zip?.readEntry()
    })
  } finally {
    zip?.close()
    await handle.close()
  }
}

async function archiveTree(
  repository: Repository,
  tree: string,
  destination: string,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal)
  await git(
    ['archive', '--format=zip', `--output=${destination}`, tree],
    repository.path,
    'exportStashTree',
    {
      maxBuffer: archiveLimit,
      processCallback: process =>
        signal?.addEventListener('abort', () => process.kill(), { once: true }),
    }
  )
}

async function writeEntryExport(
  request: IStashExportRequest,
  root: string,
  entry: IStashEntry,
  index: number
): Promise<void> {
  throwIfAborted(request.signal)
  const directory = Path.join(
    root,
    'stashes',
    `${String(index + 1).padStart(4, '0')}-${safeName(
      stashEntryTitle(entry),
      'stash'
    )}`
  )
  await mkdir(directory, { recursive: true })
  await writeFile(
    Path.join(directory, 'stash.json'),
    JSON.stringify(
      {
        name: stashEntryTitle(entry),
        ref: entry.name,
        objectId: entry.stashSha,
        branch: entry.branchName,
        origin: entry.origin ?? 'desktop',
        createdAt: entry.createdAt ?? null,
        tree: entry.tree,
        parents: entry.parents,
        note: 'The working-tree snapshot is under working-tree. Additional parent snapshots are preserved under index-tree and untracked when present.',
      },
      null,
      2
    ),
    'utf8'
  )

  const workingTreeZip = Path.join(directory, '.working-tree.zip')
  await archiveTree(
    request.repository,
    entry.stashSha,
    workingTreeZip,
    request.signal
  )
  await extractZip(
    workingTreeZip,
    Path.join(directory, 'working-tree'),
    request.signal
  )
  await rm(workingTreeZip, { force: true })

  if (entry.parents[1]) {
    const indexZip = Path.join(directory, '.index-tree.zip')
    await archiveTree(
      request.repository,
      entry.parents[1],
      indexZip,
      request.signal
    )
    await extractZip(
      indexZip,
      Path.join(directory, 'index-tree'),
      request.signal
    )
    await rm(indexZip, { force: true })
  }
  if (entry.parents[2]) {
    const untrackedZip = Path.join(directory, '.untracked-tree.zip')
    await archiveTree(
      request.repository,
      entry.parents[2],
      untrackedZip,
      request.signal
    )
    await extractZip(
      untrackedZip,
      Path.join(directory, 'untracked'),
      request.signal
    )
    await rm(untrackedZip, { force: true })
  }
}

async function makeDirectoryExport(
  request: IStashExportRequest,
  root: string
): Promise<string> {
  const base = Path.join(
    request.destination,
    `desktop-material-stashes-${new Date().toISOString().replace(/[:.]/g, '-')}`
  )
  let destination = base
  let suffix = 1
  while (true) {
    try {
      await access(destination)
      destination = `${base}-${suffix++}`
    } catch {
      break
    }
  }
  await rename(root, destination)
  return destination
}

async function findSevenZip(): Promise<string> {
  const candidates = [
    process.env['ProgramFiles']
      ? Path.join(process.env['ProgramFiles'], '7-Zip', '7z.exe')
      : null,
    process.env['ProgramFiles(x86)']
      ? Path.join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe')
      : null,
    '7z.exe',
  ].filter((value): value is string => value !== null)
  for (const candidate of candidates) {
    if (candidate === '7z.exe') {
      return candidate
    }
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the next known installation location.
    }
  }
  throw new Error(
    '7-Zip was not found. Install 7-Zip or choose ZIP or directory export.'
  )
}

export function sevenZipArguments(
  destination: string,
  root: string,
  options: IStashSevenZipOptions
): string[] {
  const level = Math.max(0, Math.min(9, Math.trunc(options.level)))
  const args = [
    'a',
    `-t7z`,
    `-mx=${level}`,
    `-m0=${options.method}`,
    `-ms=${options.solid ? 'on' : 'off'}`,
    `-mmt=${options.threads}`,
    `-md=${options.dictionary}`,
    `-mfb=${Math.max(5, Math.min(273, Math.trunc(options.fastBytes)))}`,
    `-mmf=${options.matchFinder.toLowerCase()}`,
  ]
  if (options.splitVolumes.trim()) {
    args.push(`-v${options.splitVolumes.trim()}`)
  }
  if (options.password) {
    args.push(`-p${options.password}`)
  }
  if (options.encryptHeaders && options.password) {
    args.push('-mhe=on')
  }
  args.push(destination, Path.join(root, '*'))
  return args
}

async function makeArchiveExport(
  request: IStashExportRequest,
  root: string
): Promise<string> {
  if (request.format === 'zip') {
    await execFile(
      'tar',
      ['-a', '-c', '-f', request.destination, '-C', root, '.'],
      { windowsHide: true, maxBuffer: archiveLimit }
    )
    return request.destination
  }
  const options = request.sevenZip
  if (options === undefined) {
    throw new Error('7-Zip export options were not provided.')
  }
  const executable = await findSevenZip()
  await execFile(
    executable,
    sevenZipArguments(request.destination, root, options),
    { windowsHide: true, maxBuffer: archiveLimit }
  )
  return request.destination
}

/** Export exact stash object identities with their metadata and all available parent trees. */
export async function exportStashes(
  request: IStashExportRequest
): Promise<IStashExportResult> {
  if (request.entries.length === 0) {
    throw new Error('Select at least one stash to export.')
  }
  throwIfAborted(request.signal)
  const temporaryRoot = await mkdtemp(
    Path.join(tmpdir(), 'desktop-material-stash-export-')
  )
  try {
    await mkdir(Path.join(temporaryRoot, 'stashes'), { recursive: true })
    await writeFile(
      Path.join(temporaryRoot, 'README.md'),
      '# Desktop Material stash export\n\nThis export contains exact stash object identities, metadata, the working-tree snapshot, and any index/untracked parent snapshots available in Git.\n',
      'utf8'
    )
    await writeFile(
      Path.join(temporaryRoot, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          createdAt: new Date().toISOString(),
          entries: request.entries.map(entry => ({
            objectId: entry.stashSha,
            name: stashEntryTitle(entry),
            branch: entry.branchName,
          })),
        },
        null,
        2
      ),
      'utf8'
    )
    for (const [index, entry] of request.entries.entries()) {
      await writeEntryExport(request, temporaryRoot, entry, index)
    }
    const destination =
      request.format === 'directory'
        ? await makeDirectoryExport(request, temporaryRoot)
        : await makeArchiveExport(request, temporaryRoot)
    return {
      destination,
      format: request.format,
      entryCount: request.entries.length,
    }
  } finally {
    try {
      await rm(temporaryRoot, { recursive: true, force: true })
    } catch {
      // The exported directory may have been renamed; cleanup is best effort.
    }
  }
}
