/**
 * Shared, renderer-safe contracts for the local file converter.
 *
 * The converter deliberately stores paths and operation metadata only. Source
 * bytes, file contents, and conversion payloads never enter renderer storage.
 */

export const FileConverterQueueSchemaVersion = 1
export const FileConverterQueueStorageKey = 'local-file-converter-queue-v1'
export const DefaultFileConverterConcurrency = 2
export const MaxFileConverterConcurrency = 4

export type FileConverterCategory =
  | 'Documents/PDF'
  | 'Images'
  | 'Audio'
  | 'Video'
  | 'Archives'
  | 'Structured Data/Spreadsheets'
  | 'Code/Text'
  | 'Binary Encodings'

export const FileConverterCategories: ReadonlyArray<FileConverterCategory> = [
  'Documents/PDF',
  'Images',
  'Audio',
  'Video',
  'Archives',
  'Structured Data/Spreadsheets',
  'Code/Text',
  'Binary Encodings',
]

export type FileConverterAdapterAvailability = 'available' | 'unavailable'

export interface IFileConverterAdapter {
  readonly id: string
  readonly category: FileConverterCategory
  readonly title: string
  readonly sourceFormats: ReadonlyArray<string>
  readonly targetFormats: ReadonlyArray<string>
  readonly availability: FileConverterAdapterAvailability
  /** Required whenever availability is unavailable; surfaced verbatim in UI. */
  readonly unavailableReason?: string
  /** A converter is enabled only with a packaged, offline implementation. */
  readonly bundled: boolean
  readonly networkAccess: 'never'
  readonly operationIds: ReadonlyArray<string>
}

export const FileConverterAdapterRegistry: ReadonlyArray<IFileConverterAdapter> = [
  {
    id: 'pdf-tools',
    category: 'Documents/PDF',
    title: 'PDF inspect and document tools',
    sourceFormats: ['PDF'],
    targetFormats: ['PDF', 'text metadata'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline PDF engine is declared in this application.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['inspect', 'split', 'merge', 'extract', 'reorder', 'rotate', 'metadata'],
  },
  {
    id: 'image-conversion',
    category: 'Images',
    title: 'Image conversion',
    sourceFormats: ['PNG', 'JPEG', 'GIF', 'WebP'],
    targetFormats: ['PNG', 'JPEG', 'WebP'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline image conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'audio-conversion',
    category: 'Audio',
    title: 'Audio conversion',
    sourceFormats: ['WAV', 'MP3', 'FLAC'],
    targetFormats: ['WAV', 'MP3'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline audio conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'video-conversion',
    category: 'Video',
    title: 'Video conversion',
    sourceFormats: ['MP4', 'WebM', 'MOV'],
    targetFormats: ['MP4', 'WebM'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline video conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'archive-conversion',
    category: 'Archives',
    title: 'Archive conversion',
    sourceFormats: ['ZIP', '7z', 'TAR'],
    targetFormats: ['ZIP', '7z', 'TAR'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline archive conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'structured-data-conversion',
    category: 'Structured Data/Spreadsheets',
    title: 'Structured data conversion',
    sourceFormats: ['CSV', 'TSV', 'JSON', 'YAML'],
    targetFormats: ['CSV', 'TSV', 'JSON', 'YAML'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline structured-data conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'text-conversion',
    category: 'Code/Text',
    title: 'Code and text conversion',
    sourceFormats: ['plain text', 'Markdown', 'HTML'],
    targetFormats: ['plain text', 'Markdown', 'HTML'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline code or text conversion adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['convert'],
  },
  {
    id: 'binary-encoding-conversion',
    category: 'Binary Encodings',
    title: 'Binary encoding conversion',
    sourceFormats: ['Base64', 'hex'],
    targetFormats: ['Base64', 'hex'],
    availability: 'unavailable',
    unavailableReason:
      'Unavailable: no bundled offline binary encoding adapter is declared.',
    bundled: false,
    networkAccess: 'never',
    operationIds: ['encode', 'decode'],
  },
]

export type FileSignatureFormat =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'zip'
  | 'wav'
  | 'mp3'
  | 'flac'
  | 'unknown'

export interface IFileSignatureInspection {
  readonly path: string
  readonly byteLength: number
  readonly format: FileSignatureFormat
  readonly mimeType: string | null
  readonly category: FileConverterCategory | null
}

export type FileConverterQueueStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'converted'
  | 'skipped'
  | 'failed'

export interface IFileConverterQueueItem {
  readonly id: string
  readonly sourcePath: string
  readonly destinationPath: string | null
  readonly adapterId: string | null
  readonly signature: IFileSignatureInspection
  readonly status: FileConverterQueueStatus
  readonly progress: number
  readonly outcome: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface IFileConverterQueueState {
  readonly version: typeof FileConverterQueueSchemaVersion
  readonly paused: boolean
  readonly concurrency: number
  readonly items: ReadonlyArray<IFileConverterQueueItem>
}

export interface IFileConverterStoragePreflight {
  readonly destinationPath: string
  readonly requiredBytes: number
  readonly availableBytes: number | null
  readonly canProceed: boolean
  readonly reason: string | null
}

export function createEmptyFileConverterQueueState(): IFileConverterQueueState {
  return {
    version: FileConverterQueueSchemaVersion,
    paused: false,
    concurrency: DefaultFileConverterConcurrency,
    items: [],
  }
}

export function normalizeFileConverterConcurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return DefaultFileConverterConcurrency
  }
  return Math.max(1, Math.min(MaxFileConverterConcurrency, Math.floor(value)))
}

/**
 * Read the persisted queue as untrusted JSON. Corrupt data never partially
 * applies: the caller receives a fresh bounded state instead.
 */
export function readFileConverterQueueState(
  storage: Pick<Storage, 'getItem'>
): IFileConverterQueueState {
  try {
    const raw = storage.getItem(FileConverterQueueStorageKey)
    if (raw === null) {
      return createEmptyFileConverterQueueState()
    }
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) {
      return createEmptyFileConverterQueueState()
    }
    const candidate = value as Partial<IFileConverterQueueState>
    if (
      candidate.version !== FileConverterQueueSchemaVersion ||
      typeof candidate.paused !== 'boolean' ||
      !Array.isArray(candidate.items)
    ) {
      return createEmptyFileConverterQueueState()
    }
    const items = candidate.items.filter(isFileConverterQueueItem)
    if (items.length !== candidate.items.length) {
      return createEmptyFileConverterQueueState()
    }
    return {
      version: FileConverterQueueSchemaVersion,
      paused: candidate.paused,
      concurrency: normalizeFileConverterConcurrency(candidate.concurrency ?? 2),
      items,
    }
  } catch {
    return createEmptyFileConverterQueueState()
  }
}

export function writeFileConverterQueueState(
  state: IFileConverterQueueState,
  storage: Pick<Storage, 'setItem'>
): boolean {
  try {
    storage.setItem(
      FileConverterQueueStorageKey,
      JSON.stringify({
        ...state,
        concurrency: normalizeFileConverterConcurrency(state.concurrency),
      })
    )
    return true
  } catch {
    return false
  }
}

function isFileConverterQueueItem(value: unknown): value is IFileConverterQueueItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const item = value as Partial<IFileConverterQueueItem>
  return (
    typeof item.id === 'string' &&
    typeof item.sourcePath === 'string' &&
    (typeof item.destinationPath === 'string' || item.destinationPath === null) &&
    (typeof item.adapterId === 'string' || item.adapterId === null) &&
    typeof item.signature === 'object' &&
    item.signature !== null &&
    typeof item.status === 'string' &&
    typeof item.progress === 'number' &&
    (typeof item.outcome === 'string' || item.outcome === null) &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  )
}

export interface IFileConverterScheduledOperation {
  readonly item: IFileConverterQueueItem
  readonly signal: AbortSignal
  reportProgress: (progress: number) => void
}

/**
 * Bounded-concurrency scheduling for a paged/persistent queue. Callers feed
 * items in batches; this helper never expands the complete queue into source
 * bytes or eagerly reads a file list into memory.
 */
export async function runFileConverterQueueBatch(
  items: ReadonlyArray<IFileConverterQueueItem>,
  concurrency: number,
  operation: (request: IFileConverterScheduledOperation) => Promise<IFileConverterQueueItem>,
  onItemChanged: (item: IFileConverterQueueItem) => void,
  signal: AbortSignal
): Promise<void> {
  let nextIndex = 0
  const limit = Math.min(normalizeFileConverterConcurrency(concurrency), items.length)
  const worker = async () => {
    while (!signal.aborted) {
      const item = items[nextIndex]
      nextIndex += 1
      if (item === undefined) {
        return
      }
      const running = { ...item, status: 'running' as const, updatedAt: new Date().toISOString() }
      onItemChanged(running)
      const completed = await operation({
        item: running,
        signal,
        reportProgress: progress =>
          onItemChanged({
            ...running,
            progress: Math.max(0, Math.min(1, progress)),
            updatedAt: new Date().toISOString(),
          }),
      })
      onItemChanged(completed)
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()))
}
