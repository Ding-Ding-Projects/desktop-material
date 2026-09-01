import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import {
  BrowserExtensionDownloadQueue,
  IBrowserExtensionDownloadExecutor,
} from './browser-extension-download-queue'
import { BrowserExtensionDownloadHandoff } from './browser-extension-download-handoff'
import {
  IBrowserExtensionDownloadProgress,
  IBrowserExtensionDownloadRequest,
} from '../lib/browser-extension-download'

class HttpBrowserExtensionDownloadExecutor
  implements IBrowserExtensionDownloadExecutor
{
  private readonly streams = new Map<string, Readable>()

  public async download(
    request: IBrowserExtensionDownloadRequest,
    temporaryPath: string,
    signal: AbortSignal,
    report: (
      downloadedBytes: number,
      totalBytes: number | null,
      bytesPerSecond: number | null
    ) => void
  ): Promise<void> {
    const response = await fetch(request.source, { signal, redirect: 'error' })
    if (!response.ok || response.body === null) {
      throw new Error(`Download source returned HTTP ${response.status}.`)
    }
    const totalHeader = response.headers.get('content-length')
    const totalBytes = totalHeader === null ? null : Number(totalHeader)
    const startedAt = Date.now()
    let downloadedBytes = 0
    const body = Readable.fromWeb(
      response.body as unknown as import('stream/web').ReadableStream
    )
    this.streams.set(request.id, body)
    body.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.byteLength
      const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
      report(
        downloadedBytes,
        Number.isFinite(totalBytes) ? totalBytes : null,
        downloadedBytes / elapsedSeconds
      )
    })
    try {
      await pipeline(body, createWriteStream(temporaryPath, { flags: 'wx' }), {
        signal,
      })
    } finally {
      this.streams.delete(request.id)
    }
  }

  public pause(requestId: string): Promise<void> {
    this.streams.get(requestId)?.pause()
    return Promise.resolve()
  }

  public resume(requestId: string): Promise<void> {
    this.streams.get(requestId)?.resume()
    return Promise.resolve()
  }
}

export interface IBrowserExtensionDownloadRuntime {
  readonly queue: BrowserExtensionDownloadQueue
  readonly handoff: BrowserExtensionDownloadHandoff
}

export function createBrowserExtensionDownloadRuntime(
  onProgress: (progress: IBrowserExtensionDownloadProgress) => void
): IBrowserExtensionDownloadRuntime {
  const queue = new BrowserExtensionDownloadQueue(
    new HttpBrowserExtensionDownloadExecutor(),
    onProgress
  )
  const handoff = new BrowserExtensionDownloadHandoff({
    onDownloadRequested: request => queue.enqueue(request),
  })
  return { queue, handoff }
}
