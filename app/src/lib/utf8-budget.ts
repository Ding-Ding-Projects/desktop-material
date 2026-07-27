/**
 * UTF-8 byte budgeting for values a remote service measures in bytes rather
 * than in JavaScript string length.
 *
 * A JavaScript string is a sequence of UTF-16 code units, so `value.length`
 * scores an ASCII letter and a CJK ideograph identically even though the
 * ideograph costs three bytes once encoded, and an emoji costs four. Any limit
 * an API enforces on the encoded bytes must therefore be measured here and not
 * with `.length`, or a value this app believes is comfortably in range is
 * rejected by the server — which for a batch upload means failing partway
 * through rather than before the first byte moves.
 *
 * Both helpers cut only on code-point boundaries. A UTF-16 surrogate pair is a
 * single code point, so neither can leave a lone surrogate behind, and the
 * result always re-encodes to well-formed UTF-8 whose length is within budget.
 *
 * This module is pure and import-free so it can be shared freely between the
 * renderer and the main process.
 */

/** Encoded size, in UTF-8 bytes, of one Unicode code point. */
function utf8SizeOfCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1
  }
  if (codePoint <= 0x7ff) {
    return 2
  }
  // An unpaired surrogate lands here and is scored as three bytes, matching the
  // U+FFFD replacement character every UTF-8 encoder substitutes for it.
  if (codePoint <= 0xffff) {
    return 3
  }
  return 4
}

/**
 * Count the UTF-8 bytes a string occupies once encoded, which is what a service
 * that documents a byte ceiling actually measures.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) {
      break
    }
    bytes += utf8SizeOfCodePoint(codePoint)
    if (codePoint > 0xffff) {
      index++
    }
  }
  return bytes
}

/**
 * Keep the longest leading run of `value` that fits `maximumBytes` UTF-8 bytes,
 * never cutting inside a code point. A budget too small for even the first code
 * point yields an empty string rather than a mangled fragment.
 */
export function truncateToUtf8ByteBudget(
  value: string,
  maximumBytes: number
): string {
  if (maximumBytes <= 0) {
    return ''
  }
  let bytes = 0
  let end = 0
  while (end < value.length) {
    const codePoint = value.codePointAt(end)
    if (codePoint === undefined) {
      break
    }
    const size = utf8SizeOfCodePoint(codePoint)
    if (bytes + size > maximumBytes) {
      break
    }
    bytes += size
    end += codePoint > 0xffff ? 2 : 1
  }
  return end === value.length ? value : value.slice(0, end)
}

/**
 * The mirror of {@link truncateToUtf8ByteBudget}: keep the longest *trailing*
 * run that fits `maximumBytes`, for values whose tail is the part a reader
 * recognizes — a file name at the end of a long path, for instance.
 */
export function keepUtf8ByteTail(value: string, maximumBytes: number): string {
  if (maximumBytes <= 0) {
    return ''
  }
  let bytes = 0
  let start = value.length
  while (start > 0) {
    // Step back over a *paired* low surrogate so `codePointAt` reads the whole
    // pair. A lone low surrogate is its own (ill-formed) unit and stays one.
    const previous = value.charCodeAt(start - 1)
    const isLowSurrogate = previous >= 0xdc00 && previous <= 0xdfff
    const beforePrevious = start >= 2 ? value.charCodeAt(start - 2) : 0
    const isHighSurrogate = beforePrevious >= 0xd800 && beforePrevious <= 0xdbff
    const candidate = isLowSurrogate && isHighSurrogate ? start - 2 : start - 1
    const codePoint = value.codePointAt(candidate)
    if (codePoint === undefined) {
      break
    }
    const size = utf8SizeOfCodePoint(codePoint)
    if (bytes + size > maximumBytes) {
      break
    }
    bytes += size
    start = candidate
  }
  return start === 0 ? value : value.slice(start)
}
