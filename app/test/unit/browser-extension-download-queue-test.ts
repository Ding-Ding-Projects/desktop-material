import assert from 'node:assert'
import { describe, it } from 'node:test'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'

import {
  BrowserExtensionDownloadQueue,
  IBrowserExtensionDownloadExecutor,
} from '../../src/main-process/browser-extension-download-queue'

const request = (id: string) => ({
  id,
  source: 'https://downloads.example.test/file.zip',
  suggestedFileName: `${id}.zip`,
  destination: `${tmpdir()}\\${id}.zip`,
  receivedAt: 1_700_000_000_000,
})

describe('BrowserExtensionDownloadQueue', () => {
  it('requires confirmation and publishes its lifecycle phases', async () => {
    const phases: string[] = []
    let resolveDownload: (() => void) | null = null
    const executor: IBrowserExtensionDownloadExecutor = {
      download: async (_request, temporaryPath, _signal, report) => {
        await writeFile(temporaryPath, 'downloaded')
        report(4, 10, 2)
        await new Promise<void>(resolve => {
          resolveDownload = resolve
        })
      },
    }
    const queue = new BrowserExtensionDownloadQueue(executor, progress => {
      phases.push(progress.phase)
    })
    const value = request('lifecycle')
    queue.enqueue(value)
    assert.deepEqual(phases, ['awaiting-confirmation'])
    const started = queue.confirm(value.id)
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(phases, [
      'awaiting-confirmation',
      'downloading',
      'downloading',
    ])
    resolveDownload!()
    await started
    assert.equal(phases.at(-1), 'completed')
  })

  it('rejects duplicate starts and keeps one active request', async () => {
    let calls = 0
    let resolveDownload: (() => void) | null = null
    const executor: IBrowserExtensionDownloadExecutor = {
      download: async (_request, temporaryPath) => {
        calls++
        await writeFile(temporaryPath, 'one')
        await new Promise<void>(resolve => {
          resolveDownload = resolve
        })
      },
    }
    const queue = new BrowserExtensionDownloadQueue(executor, () => undefined)
    const first = request('first')
    const second = request('second')
    queue.enqueue(first)
    queue.enqueue(second)
    const started = queue.confirm(first.id)
    await new Promise(resolve => setTimeout(resolve, 10))
    await queue.confirm(first.id)
    await queue.confirm(second.id)
    assert.equal(calls, 1)
    resolveDownload!()
    await started
  })

  it('publishes paused and canceled phases through the controls', async () => {
    const phases: string[] = []
    let resolveDownload: (() => void) | null = null
    const executor: IBrowserExtensionDownloadExecutor = {
      download: async (_request, temporaryPath) => {
        await writeFile(temporaryPath, 'cancel')
        await new Promise<void>(resolve => {
          resolveDownload = resolve
        })
      },
      pause: async () => undefined,
      resume: async () => undefined,
    }
    const queue = new BrowserExtensionDownloadQueue(executor, progress => {
      phases.push(progress.phase)
    })
    const value = request('cancel')
    queue.enqueue(value)
    const started = queue.confirm(value.id)
    await new Promise(resolve => setTimeout(resolve, 10))
    await queue.pause(value.id)
    await queue.resume(value.id)
    queue.cancel(value.id)
    resolveDownload!()
    await started
    assert.deepEqual(phases, [
      'awaiting-confirmation',
      'downloading',
      'paused',
      'downloading',
      'canceled',
    ])
  })
})
