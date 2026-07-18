import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { CloningRepository } from '../../../src/models/cloning-repository'
import {
  ICloneProgress,
  SubmoduleFetchStage,
} from '../../../src/models/progress'
import { CloningRepositoryView } from '../../../src/ui/cloning-repository'
import { render } from '../../helpers/ui/render'

const repository = new CloningRepository(
  'C:/clones/desktop',
  'https://github.com/desktop/desktop.git'
)

function renderProgress(progress: ICloneProgress) {
  return render(
    <CloningRepositoryView repository={repository} progress={progress} />
  )
}

describe('CloningRepositoryView', () => {
  it('renders the stage label with the overall percentage', () => {
    const view = renderProgress({
      kind: 'clone',
      title: 'Cloning into C:/clones/desktop',
      value: 0.63,
      stage: 'Receiving objects',
      description: 'Receiving objects: 63% (63/100)',
    })

    const stage = view.container.querySelector('.clone-progress-stage')
    assert.equal(stage?.textContent, 'Receiving objects — 63%')
  })

  it('renders transfer speed and ETA when available', () => {
    const view = renderProgress({
      kind: 'clone',
      title: 'Cloning into C:/clones/desktop',
      value: 0.42,
      stage: 'Receiving objects',
      speedBytesPerSecond: 2.4 * 1024 ** 2,
      etaSeconds: 150,
    })

    const meta = view.container.querySelector('.clone-progress-meta')
    assert.ok(meta !== null)
    assert.ok(meta?.textContent?.includes('MiB/s'))
    assert.ok(meta?.textContent?.includes('~2m 30s left'))
  })

  it('shows an indeterminate bar and a distinct label while fetching submodules', () => {
    const view = renderProgress({
      kind: 'clone',
      title: 'Cloning into C:/clones/desktop',
      value: 1,
      stage: SubmoduleFetchStage,
      description: "Cloning into 'vendor/dep'...",
    })

    const stage = view.container.querySelector('.clone-progress-stage')
    assert.equal(stage?.textContent, 'Fetching submodules')

    const progress = view.container.querySelector('progress')
    // An indeterminate <progress> has no value attribute.
    assert.equal(progress?.hasAttribute('value'), false)
  })
})
