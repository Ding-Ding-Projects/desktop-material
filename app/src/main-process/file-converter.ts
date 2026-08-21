import { open, stat, statfs, writeFile, rename, unlink } from 'fs/promises'
import * as Path from 'path'
import { randomUUID } from 'crypto'
import {
  FileConverterCategory,
  FileSignatureFormat,
  IFileConverterStoragePreflight,
  IFileSignatureInspection,
} from '../lib/file-converter'

const SignatureReadLimit = 16 * 1024

/**
 * Inspect a locally selected file using bounded bytes, never an extension and
 * never a network request. The returned metadata is safe to retain in the
 * renderer queue; file contents remain in the main process.
 */
export async function inspectLocalFileForConversion(
  path: string
): Promise<IFileSignatureInspection> {
  const details = await stat(path)
  if (!details.isFile()) {
    throw new Error('The selected conversion source is not a regular file.')
  }

  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(SignatureReadLimit, details.size))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const signature = detectFileSignature(buffer.subarray(0, bytesRead))
    return {
      path,
      byteLength: details.size,
      format: signature.format,
      mimeType: signature.mimeType,
      category: signature.category,
    }
  } finally {
    await handle.close()
  }
}

/** Preflight free space at a user-selected output directory before queuing. */
export async function preflightFileConverterStorage(
  destinationPath: string,
  requiredBytes: number
): Promise<IFileConverterStoragePreflight> {
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0) {
    throw new Error('The conversion storage estimate is invalid.')
  }
  const existingDirectory = await findExistingDirectory(destinationPath)
  const volume = await statfs(existingDirectory)
  const availableBytes = Number(volume.bavail * volume.bsize)
  return {
    destinationPath,
    requiredBytes,
    availableBytes,
    canProceed: Number.isFinite(availableBytes) && availableBytes >= requiredBytes,
    reason:
      Number.isFinite(availableBytes) && availableBytes >= requiredBytes
        ? null
        : 'The selected destination does not have enough available storage for this conversion queue.',
  }
}

/**
 * Future bundled adapters publish a validated result by writing beside the
 * destination and renaming only after an independent validator accepts it.
 */
export async function publishValidatedConversionOutput(
  destinationPath: string,
  bytes: Buffer,
  validate: (path: string) => Promise<void>
): Promise<void> {
  const directory = Path.dirname(destinationPath)
  const temporaryPath = Path.join(
    directory,
    `.${Path.basename(destinationPath)}.${randomUUID()}.partial`
  )
  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx' })
    await validate(temporaryPath)
    await rename(temporaryPath, destinationPath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

function detectFileSignature(bytes: Buffer): {
  readonly format: FileSignatureFormat
  readonly mimeType: string | null
  readonly category: FileConverterCategory | null
} {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { format: 'pdf', mimeType: 'application/pdf', category: 'Documents/PDF' }
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'png', mimeType: 'image/png', category: 'Images' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: 'jpeg', mimeType: 'image/jpeg', category: 'Images' }
  }
  if (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return { format: 'gif', mimeType: 'image/gif', category: 'Images' }
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { format: 'webp', mimeType: 'image/webp', category: 'Images' }
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
    return { format: 'zip', mimeType: 'application/zip', category: 'Archives' }
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE') {
    return { format: 'wav', mimeType: 'audio/wav', category: 'Audio' }
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'fLaC') {
    return { format: 'flac', mimeType: 'audio/flac', category: 'Audio' }
  }
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { format: 'mp3', mimeType: 'audio/mpeg', category: 'Audio' }
  }
  return { format: 'unknown', mimeType: null, category: null }
}

async function findExistingDirectory(path: string): Promise<string> {
  let current = Path.resolve(path)
  while (true) {
    try {
      const details = await stat(current)
      return details.isDirectory() ? current : Path.dirname(current)
    } catch {
      const parent = Path.dirname(current)
      if (parent === current) {
        throw new Error('No existing directory is available for the selected conversion destination.')
      }
      current = parent
    }
  }
}
