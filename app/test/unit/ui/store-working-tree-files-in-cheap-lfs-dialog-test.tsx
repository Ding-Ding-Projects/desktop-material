import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import type {
  ICheapLfsAutoPinProgress,
  ICheapLfsWorkingTreePinResult,
} from '../../../src/lib/cheap-lfs/operations'
import type { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher/dispatcher'
import { StoreWorkingTreeFilesInCheapLfsDialog } from '../../../src/ui/changes/store-working-tree-files-in-cheap-lfs-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function repository(): Repository {
  return {} as Repository
}

describe('Store working-tree files in Cheap LFS dialog', () => {
  it('reviews the bulk selection, shows skipped files, and renders per-file results', async () => {
    const calls: Array<ReadonlyArray<string>> = []
    const result: ICheapLfsWorkingTreePinResult = {
      stored: [{ relativePath: 'large-a.bin', sizeInBytes: 1024 * 1024 }],
      failures: [
        {
          relativePath: 'large-b.bin',
          message: 'The file changed while it was being uploaded.',
        },
      ],
      canceled: false,
    }
    const dispatcher = {
      storeWorkingTreeFilesInCheapLfs: async (
        _repository: Repository,
        paths: ReadonlyArray<string>,
        _signal: AbortSignal | undefined,
        onProgress?: (progress: ICheapLfsAutoPinProgress) => void
      ) => {
        calls.push(paths)
        onProgress?.({
          phase: 'uploading',
          completedFiles: 0,
          totalFiles: 2,
          currentPath: 'large-a.bin',
          transferredBytes: 0,
          totalBytes: 2 * 1024 * 1024,
        })
        return result
      },
    } as unknown as Dispatcher

    render(
      <StoreWorkingTreeFilesInCheapLfsDialog
        repository={repository()}
        paths={['large-a.bin', 'large-b.bin']}
        excludedPaths={[
          {
            path: 'partial.bin',
            reason: 'Select the whole file before replacing it with a pointer.',
          },
        ]}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )

    assert.ok(
      screen.getByRole('listitem', {
        name: /partial\.bin: Select the whole file before replacing it with a pointer\./,
        hidden: true,
      })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Store 2 files in Cheap LFS',
        hidden: true,
      })
    )

    assert.deepEqual(calls, [['large-a.bin', 'large-b.bin']])
    await waitFor(() => {
      assert.ok(screen.getByText('1 file was stored in Cheap LFS.'))
      assert.ok(
        screen.getByRole('listitem', {
          name: /large-b\.bin: The file changed while it was being uploaded\./,
          hidden: true,
        })
      )
    })
  })

  it('aborts the single batch operation from its progress footer', async () => {
    let observedSignal: AbortSignal | undefined
    let resolveOperation:
      | ((result: ICheapLfsWorkingTreePinResult) => void)
      | undefined
    const dispatcher = {
      storeWorkingTreeFilesInCheapLfs: async (
        _repository: Repository,
        _paths: ReadonlyArray<string>,
        signal: AbortSignal | undefined
      ) => {
        observedSignal = signal
        return await new Promise<ICheapLfsWorkingTreePinResult>(resolve => {
          resolveOperation = resolve
        })
      },
    } as unknown as Dispatcher

    render(
      <StoreWorkingTreeFilesInCheapLfsDialog
        repository={repository()}
        paths={['large.bin']}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Store file in Cheap LFS',
        hidden: true,
      })
    )
    await waitFor(() => assert.ok(observedSignal !== undefined))
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel', hidden: true })
    )
    assert.equal(observedSignal?.aborted, true)

    resolveOperation?.({ stored: [], failures: [], canceled: true })
    await waitFor(() => {
      assert.ok(
        screen.getByText(
          'The Cheap LFS batch was canceled. Files not completed were left unchanged.'
        )
      )
    })
  })
})
