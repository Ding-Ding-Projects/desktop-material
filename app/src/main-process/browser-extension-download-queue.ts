import { access, rename, rm, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import {
  IBrowserExtensionDownloadProgress,
  IBrowserExtensionDownloadRequest,
} from '../lib/browser-extension-download'

export interface IBrowserExtensionDownloadExecutor {
  /**
   * The executor receives a unique same-volume temporary output path. It must
   * write no other path, honour abort, and report actual received bytes.
   */
  download(
    request: IBrowserExtensionDownloadRequest,
    temporaryPath: string,
    signal: AbortSignal,
    report: (
      downloadedBytes: number,
      totalBytes: number | null,
      bytesPerSecond: number | null
    ) => void
  ): Promise<void>
  pause?(requestId: string): Promise<void>
  resume?(requestId: string): Promise<void>
}

export type BrowserExtensionDownloadQueueListener = (
  progress: IBrowserExtensionDownloadProgress
) => void

/**
 * One request-at-a-time desktop transfer coordinator. A browser extension may
 * request a download, but cannot choose a writer, bypass confirmation, or
 * write directly to the final file. The native host supplies a concrete
 * executor only after its own installation/provenance work exists.
 */
export class BrowserExtensionDownloadQueue {
  private readonly controllers = new Map<string, AbortController>()
  private readonly current = new Map<string, IBrowserExtensionDownloadProgress>()

  public constructor(
    private readonly executor: IBrowserExtensionDownloadExecutor,
    private readonly onProgress: BrowserExtensionDownloadQueueListener
  ) {}

  public async start(request: IBrowserExtensionDownloadRequest): Promise<void> {
    if (this.current.has(request.id)) {
      return
    }

    const controller = new AbortController()
    this.controllers.set(request.id, controller)
    const temporaryPath = join(
      dirname(request.destination),
      `.${request.suggestedFileName}.${randomUUID()}.part`
    )
    this.publish({
      request,
      phase: 'downloading',
      downloadedBytes: 0,
      totalBytes: null,
      bytesPerSecond: null,
      error: null,
    })

    try {
      await this.executor.download(
        request,
        temporaryPath,
        controller.signal,
        (downloadedBytes, totalBytes, bytesPerSecond) => {
          this.publish({
            request,
            phase: 'downloading',
            downloadedBytes,
            totalBytes,
            bytesPerSecond,
            error: null,
          })
        }
      )
      if (controller.signal.aborted) {
        throw new DOMException('The download was canceled.', 'AbortError')
      }
      const output = await stat(temporaryPath)
      if (!output.isFile()) {
        throw new Error(
          'The download executor did not create a regular temporary file.'
        )
      }
      await access(request.destination).then(
        () => {
          throw new Error(
            'The approved destination already exists and was not overwritten.'
          )
        },
        () => undefined
      )
      // The temporary file is beside the approved destination, so this is a
      // same-volume materialization. On Windows rename refuses an existing
      // destination; the access check above makes the normal outcome explicit.
      await rename(temporaryPath, request.destination)
      this.publish({
        request,
        phase: 'completed',
        downloadedBytes: output.size,
        totalBytes: output.size,
        bytesPerSecond: null,
        error: null,
      })
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      const canceled =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      this.publish({
        request,
        phase: canceled ? 'canceled' : 'failed',
        downloadedBytes: this.current.get(request.id)?.downloadedBytes ?? 0,
        totalBytes: this.current.get(request.id)?.totalBytes ?? null,
        bytesPerSecond: null,
        error: canceled
          ? null
          : error instanceof Error
          ? error.message
          : 'Download failed.',
      })
    } finally {
      this.controllers.delete(request.id)
    }
  }

  public async pause(requestId: string): Promise<void> {
    const progress = this.current.get(requestId)
    if (progress?.phase !== 'downloading' || this.executor.pause === undefined) {
      return
    }
    await this.executor.pause(requestId)
    this.publish({ ...progress, phase: 'paused' })
  }

  public async resume(requestId: string): Promise<void> {
    const progress = this.current.get(requestId)
    if (progress?.phase !== 'paused' || this.executor.resume === undefined) {
      return
    }
    await this.executor.resume(requestId)
    this.publish({ ...progress, phase: 'downloading' })
  }

  public cancel(requestId: string): void {
    this.controllers.get(requestId)?.abort()
  }

  private publish(progress: IBrowserExtensionDownloadProgress): void {
    this.current.set(progress.request.id, progress)
    this.onProgress(progress)
  }
}
