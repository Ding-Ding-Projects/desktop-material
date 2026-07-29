/**
 * OCI distribution limits a full repository name to 255 characters. Applying
 * the same bound to a single component keeps validation work and downstream
 * request paths bounded.
 */
export const OciNameComponentMaximumLength = 255

function isLowercaseAsciiLetterOrDigit(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a)
}

/**
 * Validate one lowercase OCI repository-name component in bounded linear time.
 *
 * Components are alphanumeric runs separated by `.`, `_`, `__`, or one or
 * more `-` characters. The explicit scanner avoids the ambiguous nested
 * repetitions of the equivalent regular expression.
 */
export function isValidOciNameComponent(value: string): boolean {
  if (value.length === 0 || value.length > OciNameComponentMaximumLength) {
    return false
  }

  let index = 0
  while (
    index < value.length &&
    isLowercaseAsciiLetterOrDigit(value.charCodeAt(index))
  ) {
    index++
  }
  if (index === 0) {
    return false
  }

  while (index < value.length) {
    const separator = value.charCodeAt(index)
    if (separator === 0x2e) {
      index++
    } else if (separator === 0x5f) {
      index++
      if (value.charCodeAt(index) === 0x5f) {
        index++
      }
    } else if (separator === 0x2d) {
      do {
        index++
      } while (index < value.length && value.charCodeAt(index) === 0x2d)
    } else {
      return false
    }

    const componentStart = index
    while (
      index < value.length &&
      isLowercaseAsciiLetterOrDigit(value.charCodeAt(index))
    ) {
      index++
    }
    if (index === componentStart) {
      return false
    }
  }

  return true
}
