import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { GitError as DugiteError } from 'dugite'

import { ErrorWithMetadata } from '../../src/lib/error-with-metadata'
import { GitError } from '../../src/lib/git/core'
import { Banner, BannerType } from '../../src/models/banner'
import { Repository } from '../../src/models/repository'
import { RetryAction, RetryActionType } from '../../src/models/retry-actions'
import { PushDidNotReachRemoteBanner } from '../../src/ui/banners/push-did-not-reach-remote-banner'
import { Dispatcher } from '../../src/ui/dispatcher'
import { pushDidNotReachRemoteHandler } from '../../src/ui/dispatcher/error-handlers'
import { fireEvent, render, screen } from '../helpers/ui/render'

const repository = new Repository('/repos/demo', 1, null, false)

function gitFailure(kind: DugiteError | null) {
  return new GitError(
    {
      stdout: '',
      stderr: 'fatal: unable to access',
      exitCode: 128,
      gitError: kind,
      gitErrorDescription: null,
      path: repository.path,
    } as any,
    ['push'],
    ''
  )
}

function fakeDispatcher() {
  const banners = new Array<Banner>()
  const retried = new Array<RetryAction>()
  const dispatcher = {
    setBanner: (banner: Banner) => banners.push(banner),
    performRetry: async (action: RetryAction) => {
      retried.push(action)
    },
    postError: async () => {},
  } as unknown as Dispatcher
  return { dispatcher, banners, retried }
}

const pushRetry: RetryAction = { type: RetryActionType.Push, repository }

describe('a push that did not reach its remote', () => {
  it('becomes a banner with a retry instead of a dialog', async () => {
    const { dispatcher, banners, retried } = fakeDispatcher()
    const error = new ErrorWithMetadata(gitFailure(DugiteError.HostDown), {
      repository,
      retryAction: pushRetry,
    })
    assert.equal(await pushDidNotReachRemoteHandler(error, dispatcher), null)
    assert.equal(banners.length, 1)
    const banner = banners[0]
    assert.equal(banner.type, BannerType.PushDidNotReachRemote)
    if (banner.type === BannerType.PushDidNotReachRemote) {
      assert.equal(banner.repositoryName, 'demo')
      banner.onRetry()
    }
    assert.deepEqual(retried, [pushRetry])
  })

  it('leaves every other failure to the usual handling', async () => {
    const { dispatcher, banners } = fakeDispatcher()
    const cases = [
      new Error('plain'),
      new ErrorWithMetadata(gitFailure(DugiteError.PushNotFastForward), {
        repository,
        retryAction: pushRetry,
      }),
      new ErrorWithMetadata(gitFailure(DugiteError.HostDown), {
        repository,
        retryAction: { type: RetryActionType.Fetch, repository },
      }),
      new ErrorWithMetadata(gitFailure(DugiteError.HostDown), { repository }),
      new ErrorWithMetadata(gitFailure(DugiteError.HostDown), {
        repository,
        retryAction: pushRetry,
        backgroundTask: true,
      }),
    ]
    for (const error of cases) {
      assert.equal(await pushDidNotReachRemoteHandler(error, dispatcher), error)
    }
    assert.equal(banners.length, 0)
  })

  it('says nothing was lost and puts Try again on the banner', () => {
    const calls = new Array<string>()
    render(
      <PushDidNotReachRemoteBanner
        repositoryName="demo"
        onRetry={() => calls.push('retry')}
        onDismissed={() => calls.push('dismissed')}
      />
    )
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /push from demo did not reach the remote\. Your commits are safe/
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    assert.deepEqual(calls, ['dismissed', 'retry'])
  })
})
