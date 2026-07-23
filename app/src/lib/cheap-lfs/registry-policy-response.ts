const DefaultMaximumRegistryPolicyResponseBytes = 256 * 1024

/**
 * Read one JSON response without trusting Content-Length or allowing a remote
 * registry to make the desktop process buffer an unbounded body.
 */
export async function readBoundedRegistryPolicyJson(
  response: Response,
  signal?: AbortSignal,
  maximumBytes: number = DefaultMaximumRegistryPolicyResponseBytes
): Promise<unknown> {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    maximumBytes > 1024 * 1024
  ) {
    throw new Error('The registry policy response limit is invalid.')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(
      `Registry policy request failed with HTTP ${response.status}.`
    )
  }
  const declaredLength = response.headers.get('Content-Length')
  if (
    declaredLength !== null &&
    (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('The registry policy response exceeded its size limit.')
  }
  if (response.body === null) {
    throw new Error('The registry policy response was empty.')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let bytes: Buffer | null = null
  let aborted = signal?.aborted === true
  const abort = () => {
    aborted = true
    void reader.cancel().catch(() => undefined)
  }
  if (aborted) {
    abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }
  try {
    while (true) {
      if (aborted) {
        throw new Error('The registry policy request was canceled.')
      }
      const item = await reader.read()
      if (aborted) {
        throw new Error('The registry policy request was canceled.')
      }
      if (item.done) {
        break
      }
      totalBytes += item.value.byteLength
      if (totalBytes > maximumBytes) {
        throw new Error('The registry policy response exceeded its size limit.')
      }
      chunks.push(item.value)
    }
    if (totalBytes === 0) {
      throw new Error('The registry policy response was empty.')
    }
    bytes = Buffer.allocUnsafe(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      return JSON.parse(bytes.toString('utf8')) as unknown
    } catch {
      throw new Error('The registry policy response was not valid JSON.')
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
    bytes?.fill(0)
    for (const chunk of chunks) {
      chunk.fill(0)
    }
  }
}
