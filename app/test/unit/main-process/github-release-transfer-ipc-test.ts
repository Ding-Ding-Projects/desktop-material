import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { registerGitHubReleaseTransferIPC } from '../../../src/main-process/github-release-transfer-ipc'

describe('GitHub release transfer IPC registration', () => {
  it('registers download, upload, and sender-scoped cancellation', () => {
    const handled = new Array<string>()
    const listened = new Array<string>()

    registerGitHubReleaseTransferIPC({
      handle(channel, _listener) {
        handled.push(channel)
      },
      on(channel, _listener) {
        listened.push(channel)
      },
    })

    assert.deepEqual(handled, [
      'download-release-asset',
      'upload-release-asset',
    ])
    assert.deepEqual(listened, ['cancel-github-release-transfer'])
  })

  it('keeps registration live and seeds accounts before deduplication', () => {
    const mainSource = readFileSync(
      join(process.cwd(), 'app', 'src', 'main-process', 'main.ts'),
      'utf8'
    )
    assert.match(mainSource, /registerGitHubReleaseTransferIPC\(ipcMain\)/)

    const updateHandlerStart = mainSource.indexOf(
      "ipcMain.on('update-accounts'"
    )
    const nextHandlerStart = mainSource.indexOf(
      "ipcMain.on('update-preferred-app-menu-item-labels'",
      updateHandlerStart
    )
    assert.ok(updateHandlerStart >= 0, 'update-accounts handler is missing')
    assert.ok(nextHandlerStart > updateHandlerStart)

    const updateHandler = mainSource.slice(updateHandlerStart, nextHandlerStart)
    const seedAccounts = updateHandler.indexOf(
      'updateGitHubReleaseTransferAccounts(accounts)'
    )
    const fingerprintGuard = updateHandler.indexOf(
      'if (fingerprint === accountsFingerprint)'
    )
    assert.ok(seedAccounts >= 0, 'release transfer accounts are not seeded')
    assert.ok(fingerprintGuard >= 0, 'account fingerprint guard is missing')
    assert.ok(
      seedAccounts < fingerprintGuard,
      'release transfer accounts must be seeded before deduplication'
    )
  })
})
