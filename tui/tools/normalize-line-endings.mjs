/** Keep generated text and source hashes stable across Git checkout modes. */
export function normalizeLineEndings(value) {
  return value.replace(/\r\n?/gu, '\n')
}
