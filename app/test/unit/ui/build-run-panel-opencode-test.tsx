import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Repository } from '../../../src/models/repository'
import { defaultBuildRunPreferences } from '../../../src/models/build-run-preferences'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { PopupType } from '../../../src/models/popup'
import { BuildRunPanel } from '../../../src/ui/build-run/build-run-panel'
import {
  BuildRunStore,
  IRepositoryBuildRunState,
} from '../../../src/lib/stores/build-run-store'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function failedState(): IRepositoryBuildRunState {
  return {
    phase: 'failed',
    detectedProfiles: [],
    selectedProfileId: null,
    logLines: [{ stage: 'build', stream: 'stderr', text: 'error: boom' }],
    activeRunId: null,
    exitCode: 2,
    runPid: null,
    panelOpen: true,
    panelMinimized: false,
    detected: true,
  }
}

function fakeStore(state: IRepositoryBuildRunState): BuildRunStore {
  return {
    getStateForRepository: () => state,
    onDidUpdate: () => ({ dispose: () => {} }),
  } as unknown as BuildRunStore
}

function repository(offerOpencodeAutoFix: boolean) {
  return new Repository(
    'C:/opencode-repo',
    1,
    null,
    false,
    null,
    {},
    false,
    undefined,
    null,
    { ...defaultBuildRunPreferences, offerOpencodeAutoFix }
  )
}

describe('BuildRunPanel — Fix with opencode', () => {
  it('hides the button when the offer preference is off', () => {
    render(
      <BuildRunPanel
        repository={repository(false)}
        dispatcher={{} as Dispatcher}
        buildRunStore={fakeStore(failedState())}
      />
    )

    assert.equal(
      screen.queryByRole('button', { name: /fix with opencode/i }),
      null
    )
  })

  it('opens the OpencodeFix popup with the failure context when clicked', () => {
    const popups: Array<{ type: PopupType }> = []
    const dispatcher = {
      showPopup: (popup: { type: PopupType }) => {
        popups.push(popup)
        return Promise.resolve()
      },
    } as unknown as Dispatcher

    render(
      <BuildRunPanel
        repository={repository(true)}
        dispatcher={dispatcher}
        buildRunStore={fakeStore(failedState())}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /fix with opencode/i }))

    assert.equal(popups.length, 1)
    const popup = popups[0] as {
      type: PopupType
      failure: { stageKind: string; exitCode: number; cwd: string }
    }
    assert.equal(popup.type, PopupType.OpencodeFix)
    assert.equal(popup.failure.stageKind, 'build')
    assert.equal(popup.failure.exitCode, 2)
    assert.equal(popup.failure.cwd, 'C:/opencode-repo')
  })
})
