import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { MergeAllDialog } from '../../../src/ui/merge-all/merge-all-dialog'
import { Repository } from '../../../src/models/repository'

class DialogResizeObserver implements ResizeObserver {
  public disconnect(): void {}
  public observe(): void {}
  public unobserve(): void {}
}

Object.assign(globalThis, { ResizeObserver: DialogResizeObserver })
Object.assign(window, { ResizeObserver: DialogResizeObserver })

describe('MergeAllDialog', () => {
  it('passes the explicit Force Mat Day choice with checkpoint preservation', () => {
    let received: unknown = null
    const dispatcher = {
      mergeAllIntoDefaultBranch: (
        _repository: Repository,
        _mode: string,
        options: unknown
      ) => {
        received = options
        return Promise.resolve()
      },
      cancelMergeAll: () => undefined,
    }
    const repository = new Repository('/repo', 1, null, false)

    render(
      <MergeAllDialog
        repository={repository}
        mode="worktrees"
        state={null}
        dispatcher={dispatcher as never}
        onDismissed={() => undefined}
      />
    )

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Force Mat Day', hidden: true })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Start merge all', hidden: true })
    )

    assert.deepEqual(received, {
      checkpointDirtyWorktrees: true,
      forceMatDay: true,
    })
  })
})
