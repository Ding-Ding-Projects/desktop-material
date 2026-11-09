/**
 * Base64 text toolkit: standard, URL-safe and MIME variants, optional padding,
 * and strict decoding that names the offending offset.
 *
 * Everything here is pure and local. Text is always UTF-8.
 */

export type Base64Variant = 'standard' | 'url-safe' | 'mime'

export const Base64Variants: ReadonlyArray<Base64Variant> = [
  'standard',
  'url-safe',
  'mime',
]

/** RFC 2045 line length for the MIME variant. */
export const MimeLineLength = 76

/** Text longer than this is refused; use the file converter for files. */
export const MaxBase64ToolkitCharacters = 1_000_000

export interface IBase64Options {
  readonly variant: Base64Variant
  /** Keep the trailing `=` characters when encoding. */
  readonly padding: boolean
  /** Require correct length and padding when decoding. */
  readonly strict: boolean
}

export const DefaultBase64Options: IBase64Options = {
  variant: 'standard',
  padding: true,
  strict: true,
}

export type Base64Result =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string }

function tooLong(text: string): Base64Result | null {
  return text.length > MaxBase64ToolkitCharacters
    ? {
        ok: false,
        error:
          'This text is too long for the toolkit. Use the file converter for files.',
      }
    : null
}

/** Encode UTF-8 text. */
export function encodeBase64Text(
  text: string,
  options: IBase64Options
): Base64Result {
  const refused = tooLong(text)
  if (refused !== null) {
    return refused
  }
  let encoded = Buffer.from(text, 'utf8').toString('base64')
  if (options.variant === 'url-safe') {
    encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_')
  }
  if (!options.padding) {
    encoded = encoded.replace(/=+$/, '')
  }
  if (options.variant === 'mime') {
    encoded = (
      encoded.match(new RegExp(`.{1,${MimeLineLength}}`, 'g')) ?? []
    ).join('\r\n')
  }
  return { ok: true, text: encoded }
}

/**
 * Decode to UTF-8 text. Whitespace is always ignored. In strict mode the
 * length must be a multiple of four with correct padding; otherwise missing
 * padding is accepted.
 */
export function decodeBase64Text(
  text: string,
  options: IBase64Options
): Base64Result {
  const refused = tooLong(text)
  if (refused !== null) {
    return refused
  }
  const alphabet =
    options.variant === 'url-safe' ? /[A-Za-z0-9\-_]/ : /[A-Za-z0-9+/]/
  let compact = ''
  let padding = 0
  for (let offset = 0; offset < text.length; offset++) {
    const character = text[offset]
    if (/\s/.test(character)) {
      continue
    }
    if (character === '=') {
      padding++
      continue
    }
    if (padding > 0) {
      return {
        ok: false,
        error: `Character "${character}" at offset ${offset} follows the padding.`,
      }
    }
    if (!alphabet.test(character)) {
      return {
        ok: false,
        error: `Character "${character}" at offset ${offset} is not ${
          options.variant === 'url-safe' ? 'URL-safe Base64' : 'Base64'
        }.`,
      }
    }
    compact += character
  }

  const remainder = compact.length % 4
  if (remainder === 1) {
    return {
      ok: false,
      error: `Length ${compact.length} cannot be Base64: one character is left over.`,
    }
  }
  const expectedPadding = remainder === 0 ? 0 : 4 - remainder
  if (padding > 2 || (padding > 0 && padding !== expectedPadding)) {
    return { ok: false, error: 'The padding does not match the length.' }
  }
  if (options.strict && padding !== expectedPadding) {
    return {
      ok: false,
      error: `Length ${compact.length} is not a multiple of 4. Turn off strict decoding to accept missing padding.`,
    }
  }

  const standard =
    options.variant === 'url-safe'
      ? compact.replace(/-/g, '+').replace(/_/g, '/')
      : compact
  const bytes = Buffer.from(standard, 'base64')
  const decoded = bytes.toString('utf8')
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) {
    return {
      ok: false,
      error:
        'The decoded bytes are not UTF-8 text. Use the file converter to save them as a file.',
    }
  }
  return { ok: true, text: decoded }
}

/** Build a `data:` URL for UTF-8 text. */
export function buildTextDataUrl(text: string, mimeType: string): Base64Result {
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) {
    return { ok: false, error: 'The media type must look like text/plain.' }
  }
  const encoded = encodeBase64Text(text, DefaultBase64Options)
  return encoded.ok
    ? {
        ok: true,
        text: `data:${mimeType};charset=utf-8;base64,${encoded.text}`,
      }
    : encoded
}
