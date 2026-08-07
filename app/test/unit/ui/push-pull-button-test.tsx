import assert from 'node:assert'
import * as React from 'react'
import { describe, it } from 'node:test'

import { ForcePushBranchState } from '../../../src/lib/rebase'
import { Repository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { PushPullButton } from '../../../src/ui/toolbar/push-pull-button'
import { render } from '../../helpers/ui/render'

function repository(): Repository {
  return new Repository('C:/work/multi-remote', 1, null, false)
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
