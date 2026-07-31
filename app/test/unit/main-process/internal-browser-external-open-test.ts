import assert from 'node:assert'
import { describe, it } from 'node:test'
import { openInternalBrowserURLExternally } from '../../../src/main-process/internal-browser-external-open'

describe('internal browser external escape', () => {
  it('reports a rejected HTTP(S) launch to the owning app window', async () => {
    const owners: Array<number | null> = []
    const errors: Array<unknown> = []
    const rejection = new Error('fixture browser rejection')

    const opened = await openInternalBrowserURLExternally(
      'https://example.com/sign-in?code=must-not-cross-ipc',
      42,
      async () => {
        throw rejection
      },
      ownerWindowId => owners.push(ownerWindowId),
      error => errors.push(error)
    )

    assert.equal(opened, false)
    assert.deepEqual(owners, [42])
    assert.deepEqual(errors, [rejection])
  })

  it('does not report a successful external escape', async () => {
    const owners: Array<number | null> = []

    const opened = await openInternalBrowserURLExternally(
      'https://example.com/docs',
      null,
      async () => undefined,
      ownerWindowId => owners.push(ownerWindowId),
      () => assert.fail('success must not report an error')
    )

    assert.equal(opened, true)
    assert.deepEqual(owners, [])
  })

  it('does not report a non-web target as a browser failure', async () => {
    const owners: Array<number | null> = []

    const opened = await openInternalBrowserURLExternally(
      'mailto:octocat@example.com',
      7,
      async () => {
        throw new Error('fixture mail rejection')
      },
      ownerWindowId => owners.push(ownerWindowId),
      () => undefined
    )

    assert.equal(opened, false)
    assert.deepEqual(owners, [])
  })
})
