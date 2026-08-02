/**
 * A structural decode of a PNG's header.
 *
 * Not a full decode: it proves the bytes are a real image with real dimensions
 * and a terminating chunk, which is exactly what distinguishes a genuine
 * picture from a truncated copy, a renamed text file, or a half-written
 * download. That is the property the bundled dim sum pictures are verified
 * against — once by the tool that copies them in, and again by the test that
 * reads what was actually committed.
 */

/** The eight bytes every PNG file starts with. */
const PngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** A PNG's pixel dimensions, as declared by its `IHDR` chunk. */
export interface IPngSize {
  readonly width: number
  readonly height: number
}

/**
 * Read a PNG's dimensions from its header.
 *
 * @throws when the bytes are not a PNG whose first chunk is a well-formed
 * `IHDR` and whose final chunk is `IEND`.
 */
export function readPngSize(bytes: Buffer): IPngSize {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PngSignature)) {
    throw new Error('not a PNG: the eight-byte signature is missing')
  }
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('not a PNG: the first chunk is not IHDR')
  }

  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width === 0 || height === 0) {
    throw new Error(`degenerate PNG dimensions ${width}x${height}`)
  }

  // A PNG always ends with the twelve-byte IEND chunk. Checking it catches the
  // one corruption a header check cannot: a file cut off part-way through.
  const tail = bytes.subarray(bytes.length - 8, bytes.length - 4)
  if (tail.toString('latin1') !== 'IEND') {
    throw new Error('truncated PNG: no IEND chunk at the end of the file')
  }

  return { width, height }
}
