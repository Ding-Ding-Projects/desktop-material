import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const source = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)
const dispatcherSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'dispatcher', 'dispatcher.ts'),
  'utf8'
)

function methodBody(start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `missing ${start}`)
  assert.notEqual(endIndex, -1, `missing boundary ${end}`)
  return source.slice(startIndex, endIndex)
}

describe('cheap LFS commit entry points', () => {
  it('measures the post-pin safe selection and sequences every split push', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )

    const measure = body.indexOf('measureWorkingTreeBatchFiles(')
    const split = body.indexOf('splitCommitPushBatchesWithFirstBatchFiles(')
    const execute = body.indexOf('executeCommitPushBatches(')
    const requiresPush = body.indexOf('const requiresPush =')
    const legacyFlush = body.indexOf(
      'this.handleLegacyLocalCommitPushBatching(',
      requiresPush
    )
    assert.ok(measure >= 0)
    assert.ok(split > measure)
    assert.ok(execute > split)
    assert.ok(legacyFlush > requiresPush)
    assert.ok(execute > legacyFlush)
    assert.match(
      body.slice(legacyFlush, execute),
      /onHookFailure: async \(\) => 'abort', isBackgroundTask \},\s*true/
    )
    assert.match(
      body,
      /const requiresPush = pushAfterCommit \|\| batches\.length > 1/
    )
    const readPending = body.indexOf('readPendingCommitPushBatchState(')
    const push = body.indexOf('this.performScheduledPush(', readPending)
    const proveAndClear = body.indexOf(
      'this.proveAndClearPendingCommitPushBatch(',
      push
    )
    assert.ok(readPending > execute)
    assert.ok(push > readPending)
    assert.ok(proveAndClear > push)
    assert.match(
      body.slice(push, proveAndClear),
      /performScheduledPush\(\s*repository,\s*null,\s*isBackgroundTask\s*\)/
    )
    assert.match(
      body,
      /onRecoveredPostCommitFailure:\s*\(\) =>\s*this\.postCommitMaintenanceWarning\(repository\)/
    )
    assert.match(
      body,
      /cheapLfsCommitKeyRequirement\?\.changesTree === true[\s\S]*measureWorkingTreeBatchFiles\(repository\.path,[\s\S]*splitCommitPushBatchesWithFirstBatchFiles/
    )
    assert.doesNotMatch(
      body,
      /paths:\s*\[[\s\S]*cheapLfsCommitKeyRequirement\.relativePath/
    )
  })

  it('commits any uncommitted enabled compression caller with successful Release pointers', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    const pin = body.indexOf('autoPinLargeFilesBeforeCommit(')
    const ensureWorkflow = body.indexOf(
      'ensureCheapLfsCloudCompressionWorkflow('
    )
    const refreshStatus = body.indexOf('await this._loadStatus(repository)')

    assert.ok(pin >= 0)
    assert.ok(ensureWorkflow > pin)
    assert.ok(refreshStatus > ensureWorkflow)
    assert.match(
      body,
      /autoIncludedCheapLfsManagedPaths\.add\(\s*CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH/
    )
    // Public repositories and explicitly opted-in private repositories have a
    // caller to include. Keep the auto-include gated on the resolved route,
    // rather than a looser preference check.
    assert.match(
      body,
      /cheapLfsCloudCompressionUsesInRepoWorkflow\(workflow\.policy\)/
    )
    assert.doesNotMatch(body, /isCheapLfsCloudCompressionEnabled\(/)
    assert.doesNotMatch(body, /if \(workflow\.changed\)/)
    assert.match(
      body,
      /for \(const managedPath of autoIncludedCheapLfsManagedPaths\)[\s\S]*originalSelectedPaths\.add\(managedPath\)[\s\S]*requiredCheapLfsPaths\.add\(managedPath\)/
    )
  })

  it('generates and atomically includes the default-on clone helper', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    const pin = body.indexOf('autoPinLargeFilesBeforeCommit(')
    const listHeadPointers = body.indexOf(
      'await listAllCheapLfsPointersAtHead(repository)',
      pin
    )
    const mergePointers = body.indexOf(
      'mergeCheapLfsPointersForProspectiveCommit(',
      pin
    )
    const ensureHelper = body.indexOf(
      'ensureCheapLfsCloneHelperBundle(',
      mergePointers
    )
    const refreshStatus = body.indexOf(
      'await this._loadStatus(repository)',
      ensureHelper
    )

    assert.ok(pin >= 0)
    assert.ok(mergePointers > pin)
    assert.ok(listHeadPointers > mergePointers)
    assert.ok(ensureHelper > listHeadPointers)
    assert.ok(refreshStatus > ensureHelper)
    assert.match(body, /preferences\.cheapLfsCloneHelperEnabled !== false/)
    assert.match(
      body,
      /const helperPaths = new Set\(\[[\s\S]*helper\.created[\s\S]*helper\.updated[\s\S]*file\.withIncludeAll\(true\)/
    )
    assert.match(
      body,
      /selectedWorktreePointers[\s\S]*workingTreeState === 'pointer'[\s\S]*selectedFiles = selectedFiles\.map[\s\S]*file\.withIncludeAll\(true\)/
    )
  })

  it('refreshes selected deletions before private pointer key proof', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    const deletionRefresh = body.indexOf(
      'selectedFiles.some(file => file.isDeleted())'
    )
    const keyProof = body.indexOf('resolveCheapLfsCommitKeyRequirement(')

    assert.ok(deletionRefresh >= 0)
    assert.ok(keyProof > deletionRefresh)
    assert.match(
      body.slice(deletionRefresh, keyProof),
      /await this\._loadStatus\(repository\)[\s\S]*file\.selection\.getSelectionType\(\) !== DiffSelectionType\.None/
    )
    assert.match(
      body.slice(keyProof),
      /relativePath: file\.path,\s*deleted: file\.isDeleted\(\)/
    )
  })

  it('waits for verified materialization when opening or completing a clone', () => {
    assert.match(
      source,
      /await this\.maybeAutoMaterializeCheapLfs\(refreshedRepository, \{[\s\S]*?requireSelected: true/
    )
    // The loop now also publishes a 'restoring' finalization reading per
    // repository so the clone popup stays live, but it must still await every
    // materialization before the batch is allowed to report completion.
    assert.match(
      source,
      /for \(const \[index, registered\] of addedRepositories\.entries\(\)\) \{[\s\S]*?await this\.maybeAutoMaterializeCheapLfs\(registered, \{/
    )
    assert.match(
      source,
      /stage: 'restoring',[\s\S]*?await this\.maybeAutoMaterializeCheapLfs\(registered, \{/
    )
    assert.match(
      source,
      /cheapLfsSelection: cloneItem\.cheapLfsSelection[\s\S]*expectedCloneUrl: cloneItem\.url[\s\S]*expectedDefaultBranch: cloneItem\.defaultBranch/
    )
  })

  it('binds single-clone asset choices to authoritative local evidence', () => {
    const body = methodBody(
      'public async maybeAutoMaterializeCheapLfs(',
      'private async runCheapLfsMaterialize('
    )
    const manifest = body.indexOf('readCheapLfsCloneManifestEvidence(')
    const validate = body.indexOf('validateCheapLfsCloneSelection(', manifest)
    const rejected = body.indexOf("validation.kind === 'invalid'", validate)
    const materialize = body.indexOf('this.runCheapLfsMaterialize(', rejected)

    assert.ok(manifest >= 0)
    assert.ok(validate > manifest)
    assert.ok(rejected > validate)
    assert.ok(materialize > rejected)
    assert.match(
      body.slice(rejected, materialize),
      /postPersistentErrorNotice\([\s\S]*return/
    )
    assert.match(body, /requestedPaths = new Set\(validation\.selectedPaths\)/)
    assert.match(
      dispatcherSource,
      /_selectRepository\(addedRepository, true, false, \{[\s\S]*cheapLfsSelection: options\.cheapLfsSelection[\s\S]*expectedCloneUrl: url/
    )
    assert.doesNotMatch(
      dispatcherSource,
      /maybeAutoMaterializeCheapLfs\(addedRepository/
    )
  })

  it('routes scheduled commits through the auto-pin-aware commit flow', () => {
    const body = methodBody(
      'private async performScheduledCommitPush(',
      'private async performScheduledPush('
    )

    assert.match(
      body,
      /this\._commitIncludedChanges\(\s*repository,\s*context,\s*false,\s*true,\s*\(\) => this\.isScheduledAutomationFenceCurrent\(fence\),\s*true\s*\)/
    )
    assert.doesNotMatch(body, /performScheduledPush\(repository, null\)/)
    assert.doesNotMatch(body, /createCommit\(/)
  })

  it('routes commit-and-push-all through the auto-pin-aware commit flow', () => {
    const body = methodBody(
      'private async commitAllChangesForCommitPushAll(',
      'private async pushForCommitPushAll('
    )

    assert.match(body, /this\._commitIncludedChanges\(repository, context\)/)
    assert.doesNotMatch(body, /createCommit\(/)
  })

  it('keeps every commit entry point behind the active restore guard', () => {
    const commitBody = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    const withIsCommitting = methodBody(
      'private async withIsCommitting(',
      'private async withIsGeneratingCommitMessage('
    )
    const materializeLock = methodBody(
      'private withCheapLfsMaterializeLock<T>(',
      'private async materializeCheapLfsEntry('
    )

    assert.match(
      commitBody,
      /if \(this\.blockCommitDuringCheapLfsMaterialize\(repository\)\) \{\s*return false/
    )
    assert.match(
      withIsCommitting,
      /blockCommitDuringCheapLfsMaterialize\(repository\)[\s\S]*cheapLfsCommitGates[\s\S]*releaseCommitGate\(\)/
    )
    assert.match(
      materializeLock,
      /const commitGate = this\.cheapLfsCommitGates\?\.get\(key\)[\s\S]*Promise\.all\(\[previousMaterialize, commitGate\]\)/
    )
    assert.match(
      materializeLock,
      /const settled = queued\.then\([\s\S]*cleanup\(\)[\s\S]*observeCheapLfsMaterializeRequest\(settled/
    )
  })

  it('excludes temporary submodules from every commit-time Cheap LFS path', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    const eligibility = body.indexOf(
      'const canUseCheapLfs = !isSubmoduleRepository(repository)'
    )
    const pin = body.indexOf('this.autoPinLargeFilesBeforeCommit(', eligibility)
    const key = body.indexOf(
      'resolveCheapLfsCommitKeyRequirement(',
      eligibility
    )
    const helper = body.indexOf('ensureCheapLfsCloneHelperBundle(', eligibility)

    assert.ok(eligibility >= 0)
    assert.ok(pin > eligibility)
    assert.ok(key > pin)
    assert.ok(helper > key)
    assert.match(
      body.slice(eligibility, pin),
      /const pinResult = canUseCheapLfs\s*\?/
    )
    assert.match(
      body.slice(pin, helper),
      /cheapLfsCommitKeyRequirement = canUseCheapLfs\s*\?/
    )
    assert.match(
      body.slice(key, helper),
      /if \(\s*canUseCheapLfs &&\s*preferences\.cheapLfsCloneHelperEnabled !== false/
    )
  })

  it('keeps ordinary push while bypassing the mutating legacy rewriter for unsafe owners', () => {
    const batching = methodBody(
      'private async handleLegacyLocalCommitPushBatching(',
      'private canRunLegacyLocalCommitPushBatching('
    )
    const eligibility = methodBody(
      'private canRunLegacyLocalCommitPushBatching(',
      'private async performPush('
    )
    const push = methodBody(
      'private async performPush(',
      'private async deployDockerAfterPush('
    )

    assert.match(
      batching,
      /if \(!this\.canRunLegacyLocalCommitPushBatching\(repository\)\) \{\s*[\s\S]*?return/
    )
    assert.ok(
      batching.indexOf('canRunLegacyLocalCommitPushBatching(repository)') <
        batching.indexOf('session.prepare(')
    )
    assert.match(
      eligibility,
      /isSubmoduleRepository\(repository\)[\s\S]*cheapLfsMaterializeOwners\?\.get[\s\S]*owners === undefined \|\| owners\.size === 0/
    )
    assert.match(
      push,
      /await this\.handleLegacyLocalCommitPushBatching\([\s\S]*await pushRepo\(/
    )
  })
})
