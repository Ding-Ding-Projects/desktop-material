import { createHash, randomUUID } from 'crypto'
import { constants, createReadStream } from 'fs'
import { copyFile, open, readdir, stat, unlink } from 'fs/promises'
import * as Path from 'path'

import {
  IBinaryEncodingResult,
  IDropPlan,
  IDroppedEntry,
  binaryEncodingDirection,
  binaryEncodingTargetName,
  nonClashingFileName,
  planDroppedEntries,
} from '../lib/file-converter-drop'

/** Bytes read per chunk when encoding. A multiple of three, so no padding mid-file. */
const EncodeChunkBytes = 3 * 64 * 1024

async function entryFor(path: string): Promise<IDroppedEntry> {
  const details = await stat(path)
  return {
    path,
    kind: details.isFile()
      ? 'file'
      : details.isDirectory()
        ? 'directory'
        : 'other',
  }
}

async function listDirectory(
  path: string
): Promise<ReadonlyArray<IDroppedEntry>> {
  const children = await readdir(path, { withFileTypes: true })
  return children
    .map(child => ({
      path: Path.join(path, child.name),
      kind: child.isFile()
        ? ('file' as const)
        : child.isDirectory()
          ? ('directory' as const)
          : ('other' as const),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Expand dropped files and folders into the regular files to convert. */
export async function expandDroppedPaths(
  paths: ReadonlyArray<string>,
  includeSubfolders: boolean
): Promise<IDropPlan> {
  if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string')) {
    throw new Error('The dropped paths are invalid.')
  }
  const entries = await Promise.all(paths.map(entryFor))
  return planDroppedEntries(entries, listDirectory, {
    includeSubfolders: includeSubfolders === true,
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

async function encodeTo(sourcePath: string, outputPath: string) {
  const output = await open(outputPath, 'wx')
  try {
    const stream = createReadStream(sourcePath, {
      highWaterMark: EncodeChunkBytes,
    })
    let carry = Buffer.alloc(0)
    for await (const chunk of stream) {
      const bytes = Buffer.concat([carry, chunk as Buffer])
      const whole = bytes.length - (bytes.length % 3)
      await output.write(bytes.subarray(0, whole).toString('base64'))
      carry = bytes.subarray(whole)
    }
    if (carry.length > 0) {
      await output.write(carry.toString('base64'))
    }
  } finally {
    await output.close()
  }
}

/**
 * Strictly decode Base64 text. Whitespace is ignored; any other character
 * outside the alphabet, padding before the end, or a length that is not a
 * multiple of four is an error that names the offset.
 */
async function decodeTo(
  sourcePath: string,
  outputPath: string | null
): Promise<string> {
  const output = outputPath === null ? null : await open(outputPath, 'wx')
  const hash = createHash('sha256')
  try {
    let carry = ''
    let offset = 0
    let ended = false
    for await (const chunk of createReadStream(sourcePath, {
      encoding: 'latin1',
    })) {
      for (const character of chunk as string) {
        offset++
        if (/\s/.test(character)) {
          continue
        }
        if (ended && character !== '=') {
          throw new Error(
            `Character at offset ${offset - 1} follows the padding.`
          )
        }
        if (character === '=') {
          ended = true
        } else if (!/[A-Za-z0-9+/]/.test(character)) {
          throw new Error(
            `Character "${character}" at offset ${offset - 1} is not Base64.`
          )
        }
        carry += character
      }
      const whole = carry.length - (carry.length % 4)
      if (whole > 0) {
        const bytes = Buffer.from(carry.slice(0, whole), 'base64')
        hash.update(bytes)
        await output?.write(bytes)
        carry = carry.slice(whole)
      }
    }
    if (carry.length > 0) {
      throw new Error(
        'The Base64 text is incomplete: its length is not a multiple of four.'
      )
    }
  } finally {
    await output?.close()
  }
  return hash.digest('hex')
}

/**
 * Encode a file to Base64 text, or decode `name.ext.base64.txt` back to
 * `name.ext`, writing the result beside the source.
 *
 * The source is never changed. The result is written to a temporary file,
 * checked, and only then published under a name that is not already taken.
 * Encoding is checked by decoding the result and comparing SHA-256 with the
 * source.
 */
export async function convertBinaryEncodingBesideSource(
  sourcePath: string
): Promise<IBinaryEncodingResult> {
  if (typeof sourcePath !== 'string' || !Path.isAbsolute(sourcePath)) {
    throw new Error('The conversion source must be an absolute path.')
  }
  const details = await stat(sourcePath)
  if (!details.isFile()) {
    throw new Error('The conversion source is not a regular file.')
  }

  const directory = Path.dirname(sourcePath)
  const sourceName = Path.basename(sourcePath)
  const direction = binaryEncodingDirection(sourceName)
  const temporaryPath = Path.join(
    directory,
    `.${sourceName}.${randomUUID()}.partial`
  )

  try {
    let sha256: string
    if (direction === 'encode') {
      await encodeTo(sourcePath, temporaryPath)
      sha256 = await sha256OfFile(sourcePath)
      if ((await decodeTo(temporaryPath, null)) !== sha256) {
        throw new Error(
          'The encoded text did not decode back to the original bytes.'
        )
      }
    } else {
      sha256 = await decodeTo(sourcePath, temporaryPath)
    }

    // Publish without ever replacing an existing file. The exclusive copy
    // fails if another process took the name first, in which case the next
    // free name is tried.
    for (let attempt = 0; attempt < 25; attempt++) {
      const taken = new Set<string>()
      let name = binaryEncodingTargetName(sourceName)
      while (await exists(Path.join(directory, name))) {
        taken.add(name)
        name = nonClashingFileName(binaryEncodingTargetName(sourceName), c =>
          taken.has(c)
        )
      }
      const destinationPath = Path.join(directory, name)
      try {
        await copyFile(temporaryPath, destinationPath, constants.COPYFILE_EXCL)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          continue
        }
        throw error
      }
      const published = await stat(destinationPath)
      return {
        sourcePath,
        destinationPath,
        direction,
        sourceBytes: details.size,
        outputBytes: published.size,
        sha256,
      }
    }
    throw new Error('No free file name is available beside the original.')
  } finally {
    await unlink(temporaryPath).catch(() => {})
  }
}
