import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { CanonicalRemoteVerificationError } from '../../src/lib/canonical-remote-verification-error'
import { Repository } from '../../src/models/repository'
import { canonicalRemoteVerificationHandler } from '../../src/ui/dispatcher/error-handlers'
import { PushPullButton } from '../../src/ui/toolbar/push-pull-button'

describe('push network rejection containment', () => {
  it('routes a rejected Push origin click through the dispatcher once', async () => {
    const repository = new Repository('C:/work/repository', 80, null, false)
    const failure = new CanonicalRemoteVerificationError(
      repository.id,
      'provider-unverified'
    )
    const posted = new Array<Error>()
    let closes = 0
    const dispatcher = {
      closeFoldout: () => {
        closes++
      },
      push: async () => {
        throw failure
      },
      postError: async (error: Error) => {
        posted.push(error)
      },
    }
    const component = new PushPullButton({
      repository,
      dispatcher,
    } as any)

    ;(component as any).push()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(closes, 1)
    assert.deepEqual(posted, [failure])
  })

  it('turns a canonical-remote error into the warning pipeline', async () => {
    const failure = new CanonicalRemoteVerificationError(
      80,
      'unsafe-remote-update'
    )
    const shown = new Array<CanonicalRemoteVerificationError>()
    const dispatcher = {
      showCanonicalRemoteWarning: (
        error: CanonicalRemoteVerificationError
      ) => shown.push(error),
    }

    const remaining = await canonicalRemoteVerificationHandler(
      failure,
      dispatcher as any
    )

    assert.equal(remaining, null)
    assert.deepEqual(shown, [failure])
  })

  it('contains background account refresh failures at their owner', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
      'utf8'
    )
    const updateStart = source.indexOf('this.accountsStore.onDidUpdate')
    const updateEnd = source.indexOf(
      'this.accountsStore.onDidError',
      updateStart
    )
    assert.notEqual(updateStart, -1)
    assert.notEqual(updateEnd, -1)
    const listener = source.slice(updateStart, updateEnd)

    assert.match(
      listener,
      /void this\.refreshSelectedRepositoryAfterAccountChange\(\)\.catch/
    )
    assert.match(listener, /Could not refresh the selected repository/)
  })

  it('keeps every toolbar network entry point on the observed boundary', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'ui',
        'toolbar',
        'push-pull-button.tsx'
      ),
      'utf8'
    )

    for (const call of [
      'dispatcher.push',
      'dispatcher.confirmOrForcePush',
      'dispatcher.pull',
      'dispatcher.fetch',
    ]) {
      const index = source.indexOf(call)
      assert.notEqual(index, -1, `missing ${call}`)
      assert.match(source.slice(Math.max(0, index - 100), index), /runNetworkAction/)
    }
  })
})
