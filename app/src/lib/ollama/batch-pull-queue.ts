import { IOllamaPullProgress } from './types'

export const MaxOllamaBatchPullItems = 128
export const MaxOllamaBatchPullConcurrency = 3

export type OllamaBatchPullItemState = 'queued' | 'pulling' | 'completed' | 'cancelled' | 'failed'

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
  const write = async (items: ReadonlyArray<IOllamaBatchPullItem>) => {
    document = { ...document, items }
    await persist(document)
  }
  const nextIndex = () => document.items.findIndex(item => item.state === 'queued')
  const worker = async () => {
    while (!signal?.aborted) {
      const index = nextIndex()
      if (index < 0) return
      const current = document.items[index]
      if (current === undefined) return
      await write(document.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, state: 'pulling', updatedAt: Date.now(), error: undefined }
        : item))
      try {
        await executor.pull(current.model, {
          signal,
          onProgress: progress => {
            void write(document.items.map(item => item.id === current.id
              ? { ...item, progress, updatedAt: Date.now() }
              : item))
          },
        })
        if (signal?.aborted) {
          await write(document.items.map(item => item.id === current.id
            ? { ...item, state: 'cancelled', updatedAt: Date.now() }
            : item))
          return
        }
        await write(document.items.map(item => item.id === current.id
          ? { ...item, state: 'completed', updatedAt: Date.now() }
          : item))
      } catch (error) {
        await write(document.items.map(item => item.id === current.id
          ? {
              ...item,
              state: signal?.aborted ? 'cancelled' : 'failed',
              updatedAt: Date.now(),
              error: error instanceof Error ? error.message.slice(0, 512) : 'Ollama pull failed.',
            }
          : item))
        if (signal?.aborted) return
      }
    }
  }
  await Promise.all(Array.from({ length: document.concurrency }, () => worker()))
  return document
}

/**
 * Validation-only durable queue document. The owner persists this document in
 * its existing private store, allowing a restart to reconcile queued/pulling
 * work with the live Ollama tag list rather than guessing that a pull finished.
 */
export function normalizeOllamaBatchPullQueue(value: unknown): IOllamaBatchPullQueueDocument {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const concurrency = typeof source.concurrency === 'number' && Number.isInteger(source.concurrency)
    ? Math.min(MaxOllamaBatchPullConcurrency, Math.max(1, source.concurrency))
    : 1
  const seen = new Set<string>()
  const items = Array.isArray(source.items) ? source.items.slice(0, MaxOllamaBatchPullItems).flatMap(raw => {
    if (typeof raw !== 'object' || raw === null) return []
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : ''
    const model = typeof item.model === 'string' ? item.model.trim() : ''
    const state = item.state
    if (!id || !model || seen.has(id) || !['queued', 'pulling', 'completed', 'cancelled', 'failed'].includes(String(state))) return []
    seen.add(id)
    // A process cannot prove a previous stream survived restart; reconcile it.
    const recoveredState = state === 'pulling' ? 'queued' : state as OllamaBatchPullItemState
    return [{ id, model, state: recoveredState, createdAt: Number.isSafeInteger(item.createdAt) ? item.createdAt as number : 0, updatedAt: Number.isSafeInteger(item.updatedAt) ? item.updatedAt as number : 0 }]
  }) : []
  return { version: 1, concurrency, items }
}
