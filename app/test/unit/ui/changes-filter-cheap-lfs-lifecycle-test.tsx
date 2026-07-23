import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const CheapLfsPinThresholdBytes = 100 * 1024 * 1024

interface ITestWorkingDirectoryFileSize {
  readonly kind: 'known' | 'missing' | 'non-file' | 'unknown'
  readonly sizeInBytes: number | null
}

let resolveSizeScan:
  | ((sizes: ReadonlyMap<string, ITestWorkingDirectoryFileSize>) => void)
  | undefined
let scannedPaths = new Array<string>()

mock.module('../../../src/lib/large-files', {
  namedExports: {
    ReceiveLimit: CheapLfsPinThresholdBytes,
    CheapLfsPinThresholdBytes,
    getWorkingDirectoryFileSizes: (
      _repository: unknown,
      files: ReadonlyArray<{ readonly path: string }>
    ) => {
      scannedPaths = files.map(file => file.path)
      return new Promise<ReadonlyMap<string, ITestWorkingDirectoryFileSize>>(
        resolve => {
          resolveSizeScan = resolve
        }
      )
    },
    getLargeFilePaths: async () => [],
  },
})

mock.module('../../../src/ui/changes/commit-message', {
  namedExports: {
    CommitMessage: () => null,
  },
})

describe('Cheap LFS Changes filter lifecycle', () => {
  it('refreshes an inactive candidate count when same-ID sizes arrive', async () => {
    Object.assign(window, { ResizeObserver: globalThis.ResizeObserver })

    const [
      { FilterChangesList },
      { DefaultCommitMessage },
      { DiffSelection, DiffSelectionType },
      { RepoRulesInfo },
      { Repository },
      { AppFileStatusKind, WorkingDirectoryFileChange, WorkingDirectoryStatus },
    ] = await Promise.all([
      import('../../../src/ui/changes/filter-changes-list'),
      import('../../../src/models/commit-message'),
      import('../../../src/models/diff'),
      import('../../../src/models/repo-rules'),
      import('../../../src/models/repository'),
      import('../../../src/models/status'),
    ])

    const candidate = new WorkingDirectoryFileChange(
      'candidate.bin',
      { kind: AppFileStatusKind.New },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const ordinary = new WorkingDirectoryFileChange(
      'ordinary.bin',
      { kind: AppFileStatusKind.New },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const workingDirectory = WorkingDirectoryStatus.fromFiles([
      candidate,
      ordinary,
    ])
    const repository = new Repository(
      'C:\\desktop-material-cheap-lfs-filter-fixture',
      1,
      null,
      false
    )

    render(
      <FilterChangesList
        repository={repository}
        repositoryAccount={null}
        workingDirectory={workingDirectory}
        mostRecentLocalCommit={null}
        conflictState={null}
        rebaseConflictState={null}
        selectedFileIDs={[]}
        onFileSelectionChanged={() => {}}
        onIncludeChanged={() => {}}
        onCreateCommit={async () => false}
        onDiscardChanges={() => {}}
        askForConfirmationOnDiscardChanges={false}
        askForConfirmationOnCommitFilteredChanges={false}
        focusCommitMessage={false}
        isShowingModal={false}
        isShowingFoldout={false}
        onDiscardChangesFromFiles={() => {}}
        onStashChangesFromFiles={() => {}}
        onChangesListScrolled={() => {}}
        onOpenItem={() => {}}
        onOpenItemInExternalEditor={() => {}}
        branch="main"
        commitAuthor={null}
        dispatcher={{} as never}
        availableWidth={640}
        isCommitting={false}
        commitOperationPhase={null}
        hookProgress={null}
        onManualCheapLfsUpload={() => {}}
        onCancelCheapLfsCommit={() => {}}
        isGeneratingCommitMessage={false}
        shouldShowGenerateCommitMessageCallOut={false}
        commitToAmend={null}
        currentBranchProtected={false}
        currentRepoRulesInfo={new RepoRulesInfo()}
        aheadBehind={null}
        commitMessage={DefaultCommitMessage}
        autocompletionProviders={[]}
        onIgnoreFile={() => {}}
        onIgnorePattern={() => {}}
        showCoAuthoredBy={false}
        coAuthors={[]}
        allStashEntries={[]}
        foreignStashEntryCount={0}
        stashInventoryTruncated={false}
        isShowingStashEntry={false}
        selectedStashEntry={null}
        shouldNudgeToCommit={false}
        commitSpellcheckEnabled={false}
        showCommitLengthWarning={false}
        accounts={[]}
        fileListFilter={{
          filterText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: false,
          isNewFile: false,
          isModifiedFile: false,
          isDeletedFile: false,
          isCheapLfsCandidate: false,
        }}
        showChangesFilter={true}
        skipCommitHooks={false}
        signOffCommits={false}
        allowEmptyCommit={false}
        onUpdateCommitOptions={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Filter Options/ }))
    const pendingChip = screen.getByRole('button', {
      name: /Cheap LFS candidates.*0/,
    })
    assert.equal(pendingChip.getAttribute('aria-pressed'), 'false')
    assert.deepEqual(scannedPaths, [candidate.path, ordinary.path])
    const completeSizeScan = resolveSizeScan
    assert.ok(completeSizeScan !== undefined)

    completeSizeScan(
      new Map<string, ITestWorkingDirectoryFileSize>([
        [
          candidate.path,
          {
            kind: 'known',
            sizeInBytes: CheapLfsPinThresholdBytes + 1,
          },
        ],
        [ordinary.path, { kind: 'known', sizeInBytes: 1 }],
      ])
    )

    await waitFor(() => {
      const refreshedChip = screen.getByRole('button', {
        name: /Cheap LFS candidates.*1/,
      })
      assert.equal(refreshedChip.getAttribute('aria-pressed'), 'false')
      assert.ok(screen.getByRole('checkbox', { name: /2 changed files/ }))
    })
  })
})
