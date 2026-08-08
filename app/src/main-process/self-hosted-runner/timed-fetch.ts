export interface ITimedFetch {
  readonly response: Response
  readonly signal: AbortSignal
  readonly dispose: () => void
}

export interface ITimedFetchDependencies {
  readonly fetch: typeof fetch
}

const DefaultTimedFetchDependencies: ITimedFetchDependencies = { fetch }

/** Keep the deadline active until the caller finishes consuming the body. */
export async function beginTimedFetch(
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds: number,
  dependencies: ITimedFetchDependencies = DefaultTimedFetchDependencies
): Promise<ITimedFetch> {
  const controller = new AbortController()
  const externalSignal = init.signal
  const abortFromExternalSignal = () => controller.abort()
  if (externalSignal?.aborted) {
    controller.abort()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, {
      once: true,
    })
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds)
  const cleanup = () => {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
  try {
    const response = await dependencies.fetch(input, {
      ...init,
      signal: controller.signal,
    })
    let disposed = false
    return {
      response,
      signal: controller.signal,
      dispose: () => {
        if (!disposed) {
          disposed = true
          cleanup()
        }
      },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
