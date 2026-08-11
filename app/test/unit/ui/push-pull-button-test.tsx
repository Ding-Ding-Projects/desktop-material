import assert from 'node:assert'
import * as React from 'react'
import { describe, it } from 'node:test'

import { ForcePushBranchState } from '../../../src/lib/rebase'
import { Repository } from '../../../src/models/repository'
import {
  advanceElapsedMilliseconds,
  formatElapsedDuration,
  Progress,
} from '../../../src/models/progress'
import { TipState } from '../../../src/models/tip'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { PushPullButton } from '../../../src/ui/toolbar/push-pull-button'
import { render } from '../../helpers/ui/render'

function repository(): Repository {
  return new Repository('C:/work/multi-remote', 1, null, false)
}

function pushProgress(startedAt: number): Progress {
  return {
    kind: 'push',
    title: 'Pushing to origin',
    description: 'Writing objects',
    value: 0.5,
    remote: 'origin',
    branch: 'main',
    startedAt,
  }
}

function renderFetchButton(remoteCount: number) {
  return render(
    <PushPullButton
      aheadBehind={{ ahead: 0, behind: 0 }}
      remoteName="origin"
      remoteCount={remoteCount}
      networkActionInProgress={false}
      lastFetched={null}
      progress={null}
      dispatcher={{ closeFoldout: () => {} } as unknown as Dispatcher}
      repository={repository()}
      tipState={TipState.Valid}
      rebaseInProgress={false}
      forcePushBranchState={ForcePushBranchState.NotAvailable}
      shouldNudge={false}
      numTagsToPush={0}
      isDropdownOpen={false}
      askForConfirmationOnForcePush={false}
      enableFocusTrap={false}
      pushPullButtonWidth={{ value: 230, min: 200, max: 400 }}
      onDropdownStateChanged={() => {}}
    />
  )
}

describe('PushPullButton elapsed progress', () => {
  it('formats an elapsed duration monotonically when clocks regress', () => {
    assert.equal(formatElapsedDuration(65_000), '1m 5s')
    assert.equal(advanceElapsedMilliseconds(1_000, 5_000, 4_000), 5_000)
    assert.equal(advanceElapsedMilliseconds(1_000, 5_000, Number.NaN), 5_000)
  })

  it('shows phase and elapsed time in the visible and accessible progress label', () => {
    const view = render(
      <PushPullButton
        aheadBehind={{ ahead: 1, behind: 0 }}
        remoteName="origin"
        networkActionInProgress={true}
        lastFetched={null}
        progress={pushProgress(Date.now())}
        dispatcher={{ closeFoldout: () => {} } as unknown as Dispatcher}
        repository={repository()}
        tipState={TipState.Valid}
        rebaseInProgress={false}
        forcePushBranchState={ForcePushBranchState.NotAvailable}
        shouldNudge={false}
        numTagsToPush={0}
        isDropdownOpen={false}
        askForConfirmationOnForcePush={false}
        enableFocusTrap={false}
        pushPullButtonWidth={{ value: 230, min: 200, max: 400 }}
        onDropdownStateChanged={() => {}}
      />
    )

    const button = view.getByRole('button', { name: /Pushing to origin/ })
    assert.match(button.textContent ?? '', /Writing objects · Elapsed 0s/)
    assert.match(button.getAttribute('aria-label') ?? '', /Elapsed 0s/)
  })
})

describe('PushPullButton multi-remote fetch copy', () => {
  it('keeps the existing remote-specific label for one remote', () => {
    const view = renderFetchButton(1)
    assert.ok(view.getByRole('button', { name: /^Fetch origin/ }))
  })

  it('labels the fetch action as syncing all remotes when more than one exists', () => {
    const view = renderFetchButton(2)
    assert.ok(view.getByRole('button', { name: /^Fetch all remotes/ }))
    assert.match(
      view.container.querySelector('.description')?.textContent ?? '',
      /Fetches all configured remotes/
    )
  })
})
