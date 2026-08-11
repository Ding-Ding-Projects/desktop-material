import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  openApplicationDataFolder,
  resolveApplicationDataFolder,
} from '../../src/lib/support-ticket-recovery'

const root = process.cwd()

const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), 'utf8')

describe('support ticket recovery', () => {
  it('resolves the folder the running application reports', async () => {
    const resolved = await resolveApplicationDataFolder(
      async () => 'C:\\Users\\person\\AppData\\Roaming\\Desktop Material'
    )
    assert.equal(
      resolved,
      'C:\\Users\\person\\AppData\\Roaming\\Desktop Material'
    )
  })

  it('reports no folder rather than an empty one when the host cannot answer', async () => {
    assert.equal(await resolveApplicationDataFolder(async () => ''), null)
    assert.equal(await resolveApplicationDataFolder(async () => '   '), null)
    assert.equal(
      await resolveApplicationDataFolder(async () => {
        throw new Error('no running application')
      }),
      null
    )
  })

  it('opens exactly the path it was shown, and echoes it back', async () => {
    const opened = new Array<string>()
    const outcome = await openApplicationDataFolder(
      'C:\\profile\\dm',
      async path => {
        opened.push(path)
        return ''
      }
    )

    assert.deepStrictEqual(opened, ['C:\\profile\\dm'])
    assert.equal(outcome.kind, 'opened')
    // The displayed path and the opened folder are one value, not two that
    // could drift apart.
    assert.equal(
      outcome.kind === 'opened' ? outcome.path : null,
      'C:\\profile\\dm'
    )
  })

  it('reports the platform message verbatim when the file manager refuses', async () => {
    const outcome = await openApplicationDataFolder(
      'C:\\profile\\dm',
      async () => 'Failed to open path'
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(
      outcome.kind === 'failed' ? outcome.error : null,
      'Failed to open path'
    )
    assert.equal(
      outcome.kind === 'failed' ? outcome.path : null,
      'C:\\profile\\dm'
    )
  })

  it('reports a thrown failure honestly rather than claiming success', async () => {
    const outcome = await openApplicationDataFolder(
      'C:\\profile\\dm',
      async () => {
        throw new Error('Explorer is not installed')
      }
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(
      outcome.kind === 'failed' ? outcome.error : null,
      'Explorer is not installed'
    )
  })

  it('refuses to pretend an unresolved folder was opened', async () => {
    let called = false
    const outcome = await openApplicationDataFolder(null, async () => {
      called = true
      return ''
    })
    assert.equal(called, false)
    assert.equal(outcome.kind, 'unavailable')
  })

  /**
   * The desk offers a one-click route to the folder that holds every lock. The
   * whole reason that is safe to offer is that the app only ever OPENS it — the
   * deletion is the user's own act in their own file manager. A deletion added
   * behind this button would be an irreversible action reached without the
   * two-key gate, so this asserts the modules that own the route reference no
   * filesystem-removal API at all.
   *
   * This is a guard, and it has been watched to fail: adding `rmdir(path)` to
   * `support-ticket-recovery.ts` turns it red, and removing it turns it green.
   */
  it('has no in-app deletion path anywhere in the recovery route', () => {
    const modules = [
      'app/src/lib/support-ticket-recovery.ts',
      'app/src/ui/md3/md3-support-tickets-view.tsx',
      'app/src/ui/md3/md3-support-ticket-entry.tsx',
    ]
    const forbidden = [
      'rmdir',
      'rmSync',
      'unlink',
      'trashItem',
      'moveItemToTrash',
      'forceDeleteDirectory',
      'removeDirectory',
    ]

    for (const module of modules) {
      const text = source(module)
      for (const symbol of forbidden) {
        assert.ok(
          !text.includes(symbol),
          `${module} must not reference ${symbol}: the desk opens the folder and stops there`
        )
      }
      // `rm(` on its own is too common a substring to match blindly, so it is
      // matched as a call with a word boundary in front of it.
      assert.equal(
        /\brm\s*\(/.test(text),
        false,
        `${module} must not call rm(): the desk never deletes anything`
      )
    }
  })
})
