/**
 * Bounded, byte-level validation for a user-supplied application logo.
 *
 * WHY THIS EXISTS
 *
 * The previous arrangement accepted a custom logo on the strength of its file
 * extension and then handed the path to an `<img>` tag pointed at the disk. An
 * extension is a claim made by whoever named the file, so `logo.png` could be
 * anything at all, and a decoder that is asked to open "anything at all" is the
 * classic route into an image library. Worse, nothing bounded the work: a file
 * declaring 60,000 x 60,000 pixels costs about fourteen gigabytes to decode,
 * and the first thing the user sees is the application dying.
 *
 * So the rule here is that the bytes decide, and they decide *before* anything
 * decodes them:
 *
 *   1. the signature identifies the format, not the extension and not a MIME
 *      claim, both of which are free to lie;
 *   2. the format must be on the allowlist;
 *   3. the dimensions are read out of the header, which is a bounded parse of
 *      the first few dozen bytes and never an allocation of the image itself;
 *   4. only then is a decode worth attempting.
 *
 * Reading the header for its dimensions is the part worth keeping. It is what
 * makes a decompression bomb cheap to refuse: a 40KB PNG that expands to
 * fourteen gigabytes announces those dimensions in the twenty-fourth byte of
 * the file, so it is rejected for a couple of microseconds of work rather than
 * discovered when the allocator gives up.
 *
 * Everything in this module is pure and takes bytes, so it is testable without
 * a window, a decoder or a filesystem.
 */

/** Formats accepted from a user-selected file. */
export type LogoImageFormat = 'png' | 'jpeg' | 'webp' | 'bmp'

/**
 * Formats recognised well enough to refuse by name.
 *
 * Naming them is deliberate. "That is not an image" is unhelpful when the file
 * plainly is one, and a user who picked an animated GIF deserves to be told it
 * is the animation that is the problem rather than left guessing.
 */
export type RejectedImageFormat = 'gif' | 'svg' | 'ico' | 'tiff' | 'avif'

/**
 * Eight megabytes.
 *
 * A logo is a few hundred pixels square. Anything past this is a photograph or
 * a mistake, and either way it is not what the field is for.
 */
export const MaxLogoImageBytes = 8 * 1024 * 1024

/** No side longer than this. Beyond it the file is a poster, not a mark. */
export const MaxLogoImageDimension = 4096

/**
 * The total pixel budget, which is the bound that actually stops a bomb.
 *
 * A per-side limit alone is not enough: 4096 x 4096 passes both side checks and
 * still costs 64MB decoded, and a long thin 4096 x 1 slab passes as well. The
 * area is the thing that maps to memory, so the area is what is bounded.
 */
export const MaxLogoImagePixels = 4096 * 4096

/** Smaller than this and there is nothing to render at any icon size. */
export const MinLogoImageDimension = 16

const Signatures: ReadonlyArray<{
  readonly format: LogoImageFormat | RejectedImageFormat
  readonly offset: number
  readonly bytes: ReadonlyArray<number>
}> = [
  {
    format: 'png',
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { format: 'jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // RIFF....WEBP — the four bytes between are the length, so they are skipped
  // and the `WEBP` tag at offset 8 is what actually identifies it.
  { format: 'webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { format: 'bmp', offset: 0, bytes: [0x42, 0x4d] },
  { format: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: 'ico', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
  { format: 'tiff', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { format: 'tiff', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
]

const acceptedFormats: ReadonlySet<string> = new Set<LogoImageFormat>([
  'png',
  'jpeg',
  'webp',
  'bmp',
])

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  expected: ReadonlyArray<number>
): boolean {
  if (bytes.length < offset + expected.length) {
    return false
  }
  for (let index = 0; index < expected.length; index++) {
    if (bytes[offset + index] !== expected[index]) {
      return false
    }
  }
  return true
}

/**
 * Identify a format from the leading bytes.
 *
 * SVG has no signature, being text, so it is sniffed separately and only after
 * every binary signature has failed — otherwise a binary file that happens to
 * contain `<svg` somewhere in its payload would be misread as one.
 */
export function detectImageFormat(
  bytes: Uint8Array
): LogoImageFormat | RejectedImageFormat | null {
  for (const signature of Signatures) {
    if (matchesAt(bytes, signature.offset, signature.bytes)) {
      // `RIFF` must lead a WebP as well; the tag at offset 8 alone is not
      // enough, since any file could carry those four bytes there by accident.
      if (
        signature.format === 'webp' &&
        !matchesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46])
      ) {
        continue
      }
      return signature.format
    }
  }

  // AVIF and friends carry an `ftyp` box whose brand names the format. Read the
  // brand rather than assuming, because the same box shape holds HEIC and MP4.
  if (matchesAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12))
    if (brand === 'avif' || brand === 'avis') {
      return 'avif'
    }
  }

  const leading = String.fromCharCode(...bytes.subarray(0, 512)).trimStart()
  if (leading.startsWith('<svg') || leading.startsWith('<?xml')) {
    return leading.includes('<svg') ? 'svg' : null
  }

  return null
}

export interface ILogoImageDimensions {
  readonly width: number
  readonly height: number
}

/**
 * Read a PNG's dimensions from its IHDR chunk.
 *
 * IHDR is required by the specification to be the first chunk, so its position
 * is fixed: the 8-byte signature, a 4-byte length, the 4-byte type, then width
 * and height as big-endian 32-bit integers.
 */
function readPngDimensions(bytes: Uint8Array): ILogoImageDimensions | null {
  if (bytes.length < 24 || !matchesAt(bytes, 12, [0x49, 0x48, 0x44, 0x52])) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/**
 * Walk a JPEG's segment chain to the frame header that carries the size.
 *
 * There is no fixed offset here: a JPEG is a chain of segments and the frame
 * header sits after however many application and quantisation segments the
 * encoder chose to write. The walk is bounded by the buffer and by a segment
 * ceiling, so a malformed file that claims a zero-length segment cannot spin
 * this forever.
 */
function readJpegDimensions(bytes: Uint8Array): ILogoImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  let segments = 0

  while (offset + 9 < bytes.length && segments < 512) {
    segments++
    if (bytes[offset] !== 0xff) {
      return null
    }
    const marker = bytes[offset + 1]
    // SOF0 through SOF15, excluding the DHT/JPG/DAC markers interleaved in the
    // range, all begin with height then width after a one-byte precision field.
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isStartOfFrame) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      }
    }
    const length = view.getUint16(offset + 2)
    if (length < 2) {
      return null
    }
    offset += 2 + length
  }

  return null
}

/**
 * Read a WebP's dimensions, across its three container shapes.
 *
 * Lossy stores them as 14-bit fields, lossless as 14-bit fields packed across a
 * 32-bit word, and the extended form as 24-bit minus-one values. They are
 * genuinely three different layouts rather than one with variations.
 */
function readWebpDimensions(bytes: Uint8Array): ILogoImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = String.fromCharCode(...bytes.subarray(12, 16))

  if (tag === 'VP8 ' && bytes.length >= 30) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  if (tag === 'VP8L' && bytes.length >= 25) {
    const packed = view.getUint32(21, true)
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    }
  }
  if (tag === 'VP8X' && bytes.length >= 30) {
    const read24 = (at: number) =>
      bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
    return { width: read24(24) + 1, height: read24(27) + 1 }
  }

  return null
}

/** Read a BMP's dimensions. Height is signed: negative means top-down. */
function readBmpDimensions(bytes: Uint8Array): ILogoImageDimensions | null {
  if (bytes.length < 26) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: Math.abs(view.getInt32(18, true)),
    height: Math.abs(view.getInt32(22, true)),
  }
}

/**
 * Read the declared dimensions without decoding the image.
 *
 * This is the bound that makes a decompression bomb cheap to refuse.
 */
export function readImageDimensions(
  format: LogoImageFormat,
  bytes: Uint8Array
): ILogoImageDimensions | null {
  const dimensions =
    format === 'png'
      ? readPngDimensions(bytes)
      : format === 'jpeg'
      ? readJpegDimensions(bytes)
      : format === 'webp'
      ? readWebpDimensions(bytes)
      : readBmpDimensions(bytes)

  if (dimensions === null) {
    return null
  }
  // A header may declare anything, including nonsense. Reject a non-finite or
  // non-positive value here rather than letting it reach a comparison, where
  // `NaN < limit` is false and would read as "within bounds".
  if (
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return null
  }
  return dimensions
}

/**
 * Is a PNG animated?
 *
 * APNG is a PNG carrying an `acTL` chunk before the first frame. The chunk is
 * required to appear before `IDAT`, so the search is bounded to the bytes ahead
 * of it rather than scanning the whole file — on a large still image that would
 * be megabytes of pointless work.
 */
function isAnimatedPng(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 64 * 1024)
  for (let at = 8; at + 4 <= limit; at++) {
    if (matchesAt(bytes, at, [0x49, 0x44, 0x41, 0x54])) {
      return false
    }
    if (matchesAt(bytes, at, [0x61, 0x63, 0x54, 0x4c])) {
      return true
    }
  }
  return false
}

/** Is a WebP animated? The extended header's second flag bit says so. */
function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'VP8X') {
    return false
  }
  return bytes.length > 20 && (bytes[20] & 0x02) !== 0
}

export type LogoImageRejection =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'too-large'
      readonly bytes: number
      readonly limit: number
    }
  | { readonly kind: 'unrecognised' }
  | {
      readonly kind: 'unsupported-format'
      readonly format: RejectedImageFormat
    }
  | { readonly kind: 'animated'; readonly format: LogoImageFormat }
  | { readonly kind: 'malformed'; readonly format: LogoImageFormat }
  | {
      readonly kind: 'too-small'
      readonly dimensions: ILogoImageDimensions
      readonly limit: number
    }
  | {
      readonly kind: 'dimension-limit'
      readonly dimensions: ILogoImageDimensions
      readonly limit: number
    }
  | {
      readonly kind: 'pixel-limit'
      readonly dimensions: ILogoImageDimensions
      readonly pixels: number
      readonly limit: number
    }

export interface IAcceptedLogoImage {
  readonly format: LogoImageFormat
  readonly dimensions: ILogoImageDimensions
  readonly bytes: number
  /** True when the format can carry an alpha channel and may be flattened. */
  readonly mayHaveTransparency: boolean
}

export type LogoImageInspection =
  | { readonly accepted: true; readonly image: IAcceptedLogoImage }
  | { readonly accepted: false; readonly rejection: LogoImageRejection }

/**
 * Inspect a candidate logo, in the order that keeps the cheap checks first.
 *
 * Nothing here decodes. A caller that gets `accepted: true` has a file whose
 * bytes identify a supported still format whose declared size fits the budget —
 * which is the point at which handing it to a decoder is a bounded operation
 * rather than an open question.
 */
export function inspectLogoImage(bytes: Uint8Array): LogoImageInspection {
  const reject = (rejection: LogoImageRejection): LogoImageInspection => ({
    accepted: false,
    rejection,
  })

  if (bytes.length === 0) {
    return reject({ kind: 'empty' })
  }
  if (bytes.length > MaxLogoImageBytes) {
    return reject({
      kind: 'too-large',
      bytes: bytes.length,
      limit: MaxLogoImageBytes,
    })
  }

  const format = detectImageFormat(bytes)
  if (format === null) {
    return reject({ kind: 'unrecognised' })
  }
  if (!acceptedFormats.has(format)) {
    return reject({
      kind: 'unsupported-format',
      format: format as RejectedImageFormat,
    })
  }

  const accepted = format as LogoImageFormat

  if (
    (accepted === 'png' && isAnimatedPng(bytes)) ||
    (accepted === 'webp' && isAnimatedWebp(bytes))
  ) {
    return reject({ kind: 'animated', format: accepted })
  }

  const dimensions = readImageDimensions(accepted, bytes)
  if (dimensions === null) {
    return reject({ kind: 'malformed', format: accepted })
  }
  if (
    dimensions.width < MinLogoImageDimension ||
    dimensions.height < MinLogoImageDimension
  ) {
    return reject({
      kind: 'too-small',
      dimensions,
      limit: MinLogoImageDimension,
    })
  }
  if (
    dimensions.width > MaxLogoImageDimension ||
    dimensions.height > MaxLogoImageDimension
  ) {
    return reject({
      kind: 'dimension-limit',
      dimensions,
      limit: MaxLogoImageDimension,
    })
  }
  const pixels = dimensions.width * dimensions.height
  if (pixels > MaxLogoImagePixels) {
    return reject({
      kind: 'pixel-limit',
      dimensions,
      pixels,
      limit: MaxLogoImagePixels,
    })
  }

  return {
    accepted: true,
    image: {
      format: accepted,
      dimensions,
      bytes: bytes.length,
      mayHaveTransparency: accepted === 'png' || accepted === 'webp',
    },
  }
}

/** One thing a conversion will change about the image the user chose. */
export interface ILogoConversionLoss {
  readonly kind:
    | 'transparency'
    | 'colour-profile'
    | 'downscale'
    | 'crop'
    | 'format'
  readonly detail: string
}

export interface ILogoConversionPlan {
  /** The square edge every derived asset is rendered at. */
  readonly renderedSize: number
  readonly losses: ReadonlyArray<ILogoConversionLoss>
}

/**
 * Say what a conversion will change, before it changes it.
 *
 * The contract is that a lossy step is disclosed rather than discovered, so
 * this is computed from the accepted image and shown to the user while the
 * previous logo is still the active one. An empty `losses` array is a real
 * answer — it means nothing will be lost — and is not the same as not having
 * looked.
 */
export function planLogoConversion(
  image: IAcceptedLogoImage,
  options: {
    readonly renderedSize: number
    readonly flattenTransparency: boolean
    readonly cropped: boolean
  }
): ILogoConversionPlan {
  const losses: Array<ILogoConversionLoss> = []
  const { width, height } = image.dimensions

  if (image.format !== 'png') {
    losses.push({
      kind: 'format',
      detail: `The image is re-encoded as PNG from ${image.format.toUpperCase()}.`,
    })
  }
  if (image.mayHaveTransparency && options.flattenTransparency) {
    losses.push({
      kind: 'transparency',
      detail:
        'Transparent areas are filled with the chosen background colour and ' +
        'cannot be made transparent again without picking the file afresh.',
    })
  }
  if (image.format === 'jpeg') {
    losses.push({
      kind: 'colour-profile',
      detail:
        'Any embedded colour profile is flattened to sRGB, so colours may ' +
        'shift slightly from the original file.',
    })
  }
  if (width > options.renderedSize || height > options.renderedSize) {
    losses.push({
      kind: 'downscale',
      detail:
        `The image is ${width}x${height} and is scaled down to ` +
        `${options.renderedSize}x${options.renderedSize}. Fine detail is lost.`,
    })
  }
  if (options.cropped) {
    losses.push({
      kind: 'crop',
      detail: 'The area outside the crop is discarded from the derived assets.',
    })
  }
  if (width !== height && !options.cropped) {
    losses.push({
      kind: 'crop',
      detail:
        `The image is ${width}x${height} rather than square, so it is fitted ` +
        'inside a square and the remaining area takes the background colour.',
    })
  }

  return { renderedSize: options.renderedSize, losses }
}

/**
 * Plain, exact copy for a refusal.
 *
 * The funny level styles the surrounding surface; this names the actual reason,
 * because "that image could not be used" leaves a user with no idea whether to
 * pick a different file or a different format.
 */
export function describeLogoRejection(rejection: LogoImageRejection): string {
  switch (rejection.kind) {
    case 'empty':
      return 'That file is empty.'
    case 'too-large':
      return (
        `That file is ${Math.round(rejection.bytes / 1024)}KB and the limit ` +
        `is ${Math.round(rejection.limit / 1024)}KB.`
      )
    case 'unrecognised':
      return 'That file is not a PNG, JPEG, WebP or BMP image.'
    case 'unsupported-format':
      return (
        `${rejection.format.toUpperCase()} is not accepted here. Use a PNG, ` +
        'JPEG, WebP or BMP image.'
      )
    case 'animated':
      return (
        'That image is animated. A logo is a single still image, so pick one ' +
        'frame and use that.'
      )
    case 'malformed':
      return (
        `That file claims to be a ${rejection.format.toUpperCase()} but its ` +
        'header could not be read.'
      )
    case 'too-small':
      return (
        `That image is ${rejection.dimensions.width}x` +
        `${rejection.dimensions.height} and the smallest usable size is ` +
        `${rejection.limit}x${rejection.limit}.`
      )
    case 'dimension-limit':
      return (
        `That image is ${rejection.dimensions.width}x` +
        `${rejection.dimensions.height} and no side may exceed ` +
        `${rejection.limit} pixels.`
      )
    case 'pixel-limit':
      return (
        `That image is ${rejection.dimensions.width}x` +
        `${rejection.dimensions.height}, which is more than the ` +
        `${rejection.limit} pixel budget for a logo.`
      )
  }
}
