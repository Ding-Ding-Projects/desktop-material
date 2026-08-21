import { IOllamaPullProgress } from './types'

export const MaxOllamaBatchPullItems = 128
export const MaxOllamaBatchPullConcurrency = 3
export const MaxOllamaBatchPullItemIdCharacters = 128
export const MaxOllamaBatchPullModelNameCharacters = 256

export type OllamaBatchPullItemState =
  | 'queued'
  | 'pulling'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface IOllamaBatchPullItem {
  readonly id: string
  readonly model: string
  readonly state: OllamaBatchPullItemState
  readonly createdAt: number
  readonly updatedAt: number
  readonly progress?: IOllamaPullProgress
  readonly error?: string
}

export interface IOllamaBatchPullQueueDocument {
  readonly version: 1
  readonly concurrency: number
  readonly items: ReadonlyArray<IOllamaBatchPullItem>
}

export interface IOllamaBatchPullQueueExecutor {
  pull(
    model: string,
    options: {
      readonly signal?: AbortSignal
      readonly onProgress: (progress: IOllamaPullProgress) => void
    }
  ): Promise<unknown>
}

export type OllamaBatchQueuePersist = (
  document: IOllamaBatchPullQueueDocument
) => Promise<void>

/**
 * Reconciles a persisted queue only after a successful live inventory read.
 * A completed item is not proof that Ollama still has the tag: a user may
 * have deleted it, or the previous process may have persisted completion just
 * before it was interrupted. Missing completed tags therefore return to the
 * queue. Pulling entries are already requeued by normalization.
 */
export function reconcileOllamaBatchPullQueue(
  input: unknown,
  installedModels: ReadonlyArray<unknown>,
  reconciledAt = Date.now()
): IOllamaBatchPullQueueDocument {
  const queue = normalizeOllamaBatchPullQueue(input)
  const installed = new Set(
    installedModels.flatMap(value => {
      if (typeof value === 'string') {
        const model = value.trim()
        return model === '' ? [] : [model]
      }
      if (typeof value !== 'object' || value === null) return []
      const record = value as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name : record.model
      if (typeof name !== 'string' || name.trim() === '') return []
      return [name.trim()]
    })
  )
  return {
    ...queue,
    items: queue.items.map(item =>
      item.state === 'completed' && !installed.has(item.model)
        ? {
            ...item,
            state: 'queued',
            updatedAt: Number.isSafeInteger(reconciledAt)
              ? reconciledAt
              : Date.now(),
            error: undefined,
          }
        : item
    ),
  }
}

/**
 * Runs only queued entries, persists each state transition, and never marks a
 * failed/cancelled stream completed. The owner supplies private persistence
 * and can safely resume from the normalized document after restart.
 */
export async function runOllamaBatchPullQueue(
  input: IOllamaBatchPullQueueDocument,
  executor: IOllamaBatchPullQueueExecutor,
  persist: OllamaBatchQueuePersist,
  signal?: AbortSignal
): Promise<IOllamaBatchPullQueueDocument> {
  let document = normalizeOllamaBatchPullQueue(input)
  let persistenceTail: Promise<void> = Promise.resolve()
  let persistenceFailed = false
  let persistenceError: unknown
  const write = (items: ReadonlyArray<IOllamaBatchPullItem>) => {
    document = { ...document, items }
    const snapshot = document
    const attempt = persistenceTail.then(async () => {
      if (persistenceFailed) throw persistenceError
      await persist(snapshot)
    })
    const observed = attempt.catch(error => {
      if (!persistenceFailed) {
        persistenceFailed = true
        persistenceError = error
      }
      throw error
    })
    persistenceTail = observed.catch(() => undefined)
    return observed
  }
  const updateItem = (
    id: string,
    update: (item: IOllamaBatchPullItem) => IOllamaBatchPullItem
  ) => {
    const index = document.items.findIndex(item => item.id === id)
    if (index < 0) return Promise.resolve()
    const current = document.items[index]
    if (current === undefined) return Promise.resolve()
    return write(
      document.items.map((item, itemIndex) =>
        itemIndex === index ? update(current) : item
      )
    )
  }
  const nextIndex = () =>
    document.items.findIndex(item => item.state === 'queued')
  const worker = async () => {
    while (!signal?.aborted) {
      const index = nextIndex()
      if (index < 0) return
      const current = document.items[index]
      if (current === undefined) return
      await updateItem(current.id, item => ({
        ...item,
        state: 'pulling',
        updatedAt: Date.now(),
        error: undefined,
      }))
      let progressTail: Promise<void> = Promise.resolve()
      try {
        await executor.pull(current.model, {
          signal,
          onProgress: progress => {
            progressTail = progressTail.then(() => {
              const live = document.items.find(item => item.id === current.id)
              if (live?.state !== 'pulling') return
              return updateItem(current.id, item => ({
                ...item,
                progress,
                updatedAt: Date.now(),
              }))
            })
            void progressTail.catch(() => undefined)
          },
        })
        await progressTail
        if (signal?.aborted) {
          await updateItem(current.id, item => ({
            ...item,
            state: 'cancelled',
            updatedAt: Date.now(),
          }))
          return
        }
        await updateItem(current.id, item => ({
          ...item,
          state: 'completed',
          updatedAt: Date.now(),
        }))
      } catch (error) {
        await updateItem(current.id, item => ({
          ...item,
          state: signal?.aborted ? 'cancelled' : 'failed',
          updatedAt: Date.now(),
          error: signal?.aborted
            ? undefined
            : error instanceof Error
            ? error.message.slice(0, 512)
            : 'Ollama pull failed.',
        }))
        if (signal?.aborted) return
      }
    }
  }
  await Promise.all(
    Array.from({ length: document.concurrency }, () => worker())
  )
  return document
}

/**
 * Validation-only durable queue document. The owner persists this document in
 * its existing private store, allowing a restart to reconcile queued/pulling
 * work with the live Ollama tag list rather than guessing that a pull finished.
 */
export function normalizeOllamaBatchPullQueue(
  value: unknown
): IOllamaBatchPullQueueDocument {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const concurrency =
    typeof source.concurrency === 'number' &&
    Number.isInteger(source.concurrency)
      ? Math.min(MaxOllamaBatchPullConcurrency, Math.max(1, source.concurrency))
      : 1
  const seen = new Set<string>()
  const items = Array.isArray(source.items)
    ? source.items.slice(0, MaxOllamaBatchPullItems).flatMap(raw => {
        if (typeof raw !== 'object' || raw === null) return []
        const item = raw as Record<string, unknown>
        const id = typeof item.id === 'string' ? item.id.trim() : ''
        const model = typeof item.model === 'string' ? item.model.trim() : ''
        const state = item.state
        if (
          !id ||
          id.length > MaxOllamaBatchPullItemIdCharacters ||
          !model ||
          model.length > MaxOllamaBatchPullModelNameCharacters ||
          seen.has(id) ||
          !['queued', 'pulling', 'completed', 'cancelled', 'failed'].includes(
            String(state)
          )
        )
          return []
        seen.add(id)
        // A process cannot prove a previous stream survived restart; reconcile it.
        const recoveredState =
          state === 'pulling' ? 'queued' : (state as OllamaBatchPullItemState)
        return [
          {
            id,
            model,
            state: recoveredState,
            createdAt: Number.isSafeInteger(item.createdAt)
              ? (item.createdAt as number)
              : 0,
            updatedAt: Number.isSafeInteger(item.updatedAt)
              ? (item.updatedAt as number)
              : 0,
          },
        ]
      })
    : []
  return { version: 1, concurrency, items }
}
