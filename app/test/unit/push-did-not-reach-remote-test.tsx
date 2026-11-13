import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { GitError as DugiteError } from 'dugite'

import { ErrorWithMetadata } from '../../src/lib/error-with-metadata'
import { GitError } from '../../src/lib/git/core'
import { Banner, BannerType } from '../../src/models/banner'
import { Repository } from '../../src/models/repository'
import {
  isUnreachableRemoteOutput,
  retryableRemoteOperation,
} from '../../src/lib/unreachable-remote'
import { RetryAction, RetryActionType } from '../../src/models/retry-actions'
import { PushDidNotReachRemoteBanner } from '../../src/ui/banners/push-did-not-reach-remote-banner'
import { Dispatcher } from '../../src/ui/dispatcher'
import { pushDidNotReachRemoteHandler } from '../../src/ui/dispatcher/error-handlers'
import { fireEvent, render, screen } from '../helpers/ui/render'

const repository = new Repository('/repos/demo', 1, null, false)

function gitFailure(
  kind: DugiteError | null,
  stderr: string = 'fatal: something else went wrong'
) {
  return new GitError(
    {
      stdout: '',
      stderr,
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

  it('recognises an unreachable host from Git output it does not classify', async () => {
    const { dispatcher, banners } = fakeDispatcher()
    const error = new ErrorWithMetadata(
      gitFailure(
        null,
        "fatal: unable to access 'https://example.invalid/a/b.git/': Could not resolve host: example.invalid"
      ),
      { repository, retryAction: pushRetry }
    )
    assert.equal(await pushDidNotReachRemoteHandler(error, dispatcher), null)
    assert.equal(banners.length, 1)

    for (const output of [
      "fatal: unable to access 'https://h/x.git/': Failed to connect to h port 443 after 21 ms: Connection refused",
      "fatal: unable to access 'https://h/x.git/': Failed to connect to h port 443: Connection timed out",
      'ssh: Could not resolve hostname github.invalid: Name or service not known',
      'ssh: connect to host github.com port 22: Connection timed out',
    ]) {
      assert.equal(isUnreachableRemoteOutput(output), true, output)
    }
    for (const output of [
      "remote: Repository not found.\nfatal: repository 'https://h/x.git/' not found",
      "fatal: Authentication failed for 'https://h/x.git/'",
      ' ! [rejected]        main -> main (fetch first)',
      'git@github.com: Permission denied (publickey).',
      "fatal: unable to access 'https://h/x.git/': The requested URL returned error: 403",
    ]) {
      assert.equal(isUnreachableRemoteOutput(output), false, output)
    }
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

  it('offers a retry only for a push, pull or fetch that could not reach its host', () => {
    const unreachable =
      "fatal: unable to access 'https://h/x.git/': Could not resolve host: h"
    assert.equal(
      retryableRemoteOperation(RetryActionType.Pull, unreachable),
      'pull'
    )
    assert.equal(
      retryableRemoteOperation(RetryActionType.Fetch, unreachable),
      'fetch'
    )
    assert.equal(
      retryableRemoteOperation(RetryActionType.Push, unreachable),
      'push'
    )
    assert.equal(
      retryableRemoteOperation(RetryActionType.Clone, unreachable),
      null
    )
    assert.equal(retryableRemoteOperation(undefined, unreachable), null)
    assert.equal(retryableRemoteOperation(RetryActionType.Pull, null), null)
    assert.equal(
      retryableRemoteOperation(
        RetryActionType.Pull,
        "fatal: Authentication failed for 'https://h/x.git/'"
      ),
      null
    )
  })
})
