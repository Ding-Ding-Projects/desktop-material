/**
 * RFC 4648 base32, the alphabet every authenticator issues secrets in.
 *
 * Nothing here is secret-aware beyond returning bytes: the caller decides
 * where the decoded material goes, and it never goes anywhere but the OS
 * credential vault. The encoder exists for exactly one purpose — showing a
 * freshly generated secret once, beside the QR, so somebody without a camera
 * can still pair by hand.
 */

/** The RFC 4648 base32 alphabet. Lowercase input is accepted on decode. */
const Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Group size the manual secret is displayed in. Four is what phones show. */
export const Base32GroupSize = 4

const DecodeTable: ReadonlyMap<string, number> = new Map(
  Array.from(Alphabet, (character, index) => [character, index] as const)
)

/** Thrown when a string cannot be read as base32. */
export class Base32Error extends Error {}

/**
 * Encode bytes as unpadded uppercase base32.
 *
 * Padding is omitted because every authenticator this interoperates with
 * accepts an unpadded secret and many reject the `=` characters outright.
 */
export function encodeBase32(bytes: Uint8Array): string {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += Alphabet[(buffer >>> bits) & 31]
    }
  }

  if (bits > 0) {
    output += Alphabet[(buffer << (5 - bits)) & 31]
  }

  return output
}

/**
 * Whether a string is readable as base32 once spaces, hyphens and padding are
 * discarded. Used to validate a typed secret before anything is stored.
 */
export function isBase32(value: string): boolean {
  try {
    decodeBase32(value)
    return true
  } catch {
    return false
  }
}

/**
 * Decode base32, tolerating the shapes people actually paste: lowercase,
 * spaces, hyphens and trailing `=` padding.
 *
 * @throws {Base32Error} when a character is outside the alphabet, or when the
 * trailing bits carry data that no whole byte can hold — which means the
 * string was truncated rather than merely unpadded.
 */
export function decodeBase32(value: string): Uint8Array {
  const cleaned = value.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()

  if (cleaned.length === 0) {
    throw new Base32Error('The secret is empty.')
  }

  const bytes: Array<number> = []
  let buffer = 0
  let bits = 0

  for (const character of cleaned) {
    const digit = DecodeTable.get(character)
    if (digit === undefined) {
      throw new Base32Error(
        `"${character}" is not a base32 character (A–Z and 2–7 only).`
      )
    }
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 0xff)
    }
  }

  // Leftover bits are legitimate padding only while they are all zero. A
  // non-zero remainder means the string lost characters somewhere, and a
  // silently truncated secret produces codes that are refused everywhere with
  // no error to read.
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Base32Error('The secret ends mid-byte, so it is incomplete.')
  }

  return Uint8Array.from(bytes)
}

/**
 * Break a base32 secret into fixed-width groups for display.
 *
 * Grouping is presentational only — {@link decodeBase32} strips the spaces
 * back out, so a user may copy either form.
 */
export function groupBase32(value: string, size = Base32GroupSize): string {
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase()
  const groups: Array<string> = []
  for (let index = 0; index < cleaned.length; index += size) {
    groups.push(cleaned.slice(index, index + size))
  }
  return groups.join(' ')
}
