import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Dispatcher } from '../../../src/ui/dispatcher'
import { BatchCloneProgress } from '../../../src/ui/clone-repository/batch-clone-progress'
import {
  BatchCloneMode,
  IBatchCloneItem,
  IBatchCloneItemStatus,
  IBatchCloneState,
} from '../../../src/models/batch-clone'
import { SubmoduleFetchStage } from '../../../src/models/progress'
import { render } from '../../helpers/ui/render'

// The Dialog component sends an IPC message and opens the native <dialog> on
// mount; neither is wired in jsdom, so stub them for the lifetime of each test.
let restoreDialogEnv: (() => void) | null = null

beforeEach(async () => {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => undefined

  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  const previousShowModal = prototype.showModal
  prototype.show = function () {
    this.setAttribute('open', '')
  }
  prototype.showModal = function () {
    this.setAttribute('open', '')
  }

  restoreDialogEnv = () => {
    electron.ipcRenderer.send = previousSend
    prototype.show = previousShow
    prototype.showModal = previousShowModal
    restoreDialogEnv = null
  }
})

afterEach(() => {
  restoreDialogEnv?.()
})

const dispatcher = {} as unknown as Dispatcher

const item: IBatchCloneItem = {
  url: 'https://github.com/desktop/desktop.git',
  name: 'desktop',
  path: 'C:/clones/desktop',
}

function stateWith(status: IBatchCloneItemStatus): IBatchCloneState {
  return {
    items: [item],
    statuses: new Map([[item.path, status]]),
    mode: BatchCloneMode.Parallel,
    isRunning: true,
    isPaused: false,
    source: 'manual',
    overallProgress: status.progress ?? 0,
    isDone: false,
  }
}

function renderState(state: IBatchCloneState) {
  return render(
    <BatchCloneProgress
      dispatcher={dispatcher}
      onDismissed={() => {}}
      batchCloneState={state}
      isTopMost={true}
    />
  )
}

describe('BatchCloneProgress rows', () => {
  it('renders a per-repo stage, percent, speed, and ETA', () => {
    const view = renderState(
      stateWith({
        kind: 'cloning',
        progress: 0.42,
        stage: 'Receiving objects',
        description: 'Receiving objects: 42% (42/100)',
        speedBytesPerSecond: 2.4 * 1024 ** 2,
        etaSeconds: 90,
      })
    )

    const stage = view.baseElement.querySelector('.batch-clone-item .stage')
    assert.equal(stage?.textContent, 'Receiving objects — 42%')

    const meta = view.baseElement.querySelector('.batch-clone-item .meta')
    assert.ok(meta?.textContent?.includes('MiB/s'))
    assert.ok(meta?.textContent?.includes('~1m 30s left'))
  })

  it('labels the submodule-fetch phase with an indeterminate bar', () => {
    const view = renderState(
      stateWith({
        kind: 'cloning',
        progress: 1,
        stage: SubmoduleFetchStage,
        description: "Cloning into 'vendor/dep'...",
      })
    )

    const stage = view.baseElement.querySelector('.batch-clone-item .stage')
    assert.equal(stage?.textContent, 'Fetching submodules')

    const progress = view.baseElement.querySelector(
      '.batch-clone-item progress'
    )
    assert.equal(progress?.hasAttribute('value'), false)
  })
})
