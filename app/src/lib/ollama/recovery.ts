export type OllamaRecoveryState =
  | 'ready'
  | 'missing-runtime'
  | 'stopped-runtime'
  | 'unhealthy-api'
  | 'catalog-offline'
  | 'catalog-stale'
  | 'insufficient-storage'
  | 'model-incompatible'
  | 'harness-failed'

export interface IOllamaRecoveryStatus {
  readonly state: OllamaRecoveryState
  readonly observedAt: number
  readonly retryable: boolean
  readonly localOnly: boolean
  readonly detail: string
}

/** The manager never turns an unknown or failed remote condition into a green state. */
export function createOllamaRecoveryStatus(
  state: OllamaRecoveryState,
  detail: string,
  observedAt = Date.now()
): IOllamaRecoveryStatus {
  return {
    state,
    observedAt,
    retryable: state !== 'ready' && state !== 'insufficient-storage' && state !== 'model-incompatible',
    localOnly: state !== 'catalog-offline' && state !== 'catalog-stale',
    detail: detail.slice(0, 512),
  }
}
