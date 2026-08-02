import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const appSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'app.tsx'),
  'utf8'
)

function method(startMarker: string, endMarker: string): string {
  const start = appSource.indexOf(startMarker)
  const end = appSource.indexOf(endMarker, start)
  assert.ok(
    start >= 0 && end > start,
    `${startMarker} must exist before ${endMarker}`
  )
  return appSource.slice(start, end)
}

describe('App Agents integration source contract', () => {
  it('tracks only the selected repository and polls only while its panel is visible', () => {
    const sync = method(
      'private syncAgentSessionWorktrees()',
      'private syncAgentSessionPolling()'
    )
    assert.match(sync, /const selection = this\.getSelectedRepositoryState\(\)/)
    assert.match(sync, /selection\.state\.worktrees\.map/)
    assert.doesNotMatch(sync, /repositories|values\(\)|flat\(\)/)

    const polling = method(
      'private syncAgentSessionPolling()',
      'private onRepositorySidebarViewChanged'
    )
    assert.match(polling, /FoldoutType\.Repository/)
    assert.match(polling, /repositorySidebarView === 'agents'/)
    assert.match(polling, /SubmoduleRepository/)

    const dropdown = method(
      'private onRepositoryDropdownStateChanged',
      'private onExitTutorial'
    )
    assert.match(
      dropdown,
      /else \{\s*this\.agentSessionLiveStore\.setPollingEnabled\(false\)/
    )
  })

  it('uses Git returned path identity and treats runner exit as neutral', () => {
    const create = method(
      'private async createAgentSession(',
      'private async runAgentSession('
    )
    assert.match(create, /createdWorktreePath = created\.path/)
    assert.match(
      create,
      /beginRun\(\s*createdWorktreePath[\s\S]*?runAgentSession\([\s\S]*?createdWorktreePath/
    )
    assert.match(create, /Promise<boolean>/)

    const run = method(
      'private async runAgentSession(',
      'private onCancelAgentSession'
    )
    assert.match(run, /result\.status === 'exited'/)
    assert.match(run, /agentSessions\.notification\.endedTitle/)
    assert.doesNotMatch(run, /notification\.finished/)
    assert.match(run, /runnerExitedWithCode/)
  })

  it('runs reviewed setup after Git verification and before any agent launch', () => {
    const create = method(
      'private async createAgentSession(',
      'private async runAgentSession('
    )
    const addWorktree = create.indexOf('dispatcher.addWorktree')
    const reviewedSnapshot = create.indexOf('cloneAgentSetupCommands(')
    const canonicalPath = create.indexOf('createdWorktreePath = created.path')
    const setup = create.indexOf('await runAgentSetupCommands')
    const beginAgent = create.indexOf('agentSessionLiveStore.beginRun')
    const launchAgent = create.indexOf('void this.runAgentSession')

    assert.ok(reviewedSnapshot >= 0 && addWorktree > reviewedSnapshot)
    assert.ok(canonicalPath > addWorktree)
    assert.ok(setup > canonicalPath)
    assert.ok(beginAgent > setup)
    assert.ok(launchAgent > beginAgent)
    assert.match(
      create,
      /runAgentSetupCommands\(\{[\s\S]*?repositoryPath: repository\.path,[\s\S]*?branchName,[\s\S]*?worktreePath: createdWorktreePath/
    )
    assert.doesNotMatch(create, /this\.loadAgentSetupCommands\(repository\)/)
    assert.match(create, /submittedSetupCommands/)
    assert.match(create, /resumeAgentSetupCommands\(/)
    assert.match(create, /!restartSetup/)
    assert.match(
      create,
      /setupResult\.status === 'cancelled'[\s\S]*?return false[\s\S]*?setupResult\.status === 'failed'[\s\S]*?return false[\s\S]*?beginRun/
    )
  })

  it('preserves keyed setup retries independently and owns cancellation', () => {
    assert.match(
      appSource,
      /pendingAgentSetupWorktrees = new Map<[\s\S]*?IPendingAgentSetupWorktree/
    )
    const create = method(
      'private async createAgentSession(',
      'private async runAgentSession('
    )
    assert.match(create, /const isRetry =/)
    assert.match(
      create,
      /if \(retryCandidate !== null\)[\s\S]*?else \{[\s\S]*?addWorktree/
    )
    assert.match(create, /pendingAgentSetupWorktrees\.get\(retryKey\)/)
    assert.match(create, /pendingAgentSetupWorktrees\.set\(retryKey, \{/)
    const addWorktree = create.indexOf('dispatcher.addWorktree')
    const provisionalRetry = create.indexOf(
      'this.pendingAgentSetupWorktrees.set(retryKey, {',
      addWorktree
    )
    const postMutationList = create.indexOf(
      'worktrees = await listWorktrees(repository)',
      provisionalRetry
    )
    assert.ok(
      provisionalRetry > addWorktree && postMutationList > provisionalRetry
    )
    assert.match(create, /isExpectedAgentSetupWorktree/)
    assert.match(create, /nextSetupCommandIndex/)
    assert.match(create, /setupResult\.commandIndex \?\?/)
    assert.match(create, /reviewedSetupCommands\.length/)
    assert.match(create, /setupResult\.completed > 0/)
    assert.match(create, /agentSessions\.notification\.setupFailedAfterRunBody/)
    assert.match(create, /pendingAgentSetupWorktrees\.delete\(retryKey\)/)
    assert.doesNotMatch(create, /pendingAgentSetupWorktree\s*=/)
    assert.match(create, /availableBaseBranches/)
    assert.match(
      create,
      /setupRetryUnavailableTitle[\s\S]*?setupVerificationFailedTitle/
    )
    assert.doesNotMatch(
      create,
      /The preserved setup worktree|Git did not return the expected linked worktree/
    )

    const cancel = method(
      'private onCancelAgentSessionCreate',
      'private async createAgentSession('
    )
    assert.match(cancel, /cancelAgentSetupCommands\(operationId\)/)
    assert.match(cancel, /cancelledAgentSetupOperationId = operationId/)
    assert.doesNotMatch(cancel, /asError|error\.message|postNotification/)
  })

  it('retires the operation before requesting cancellation', () => {
    const cancel = method(
      'private onCancelAgentSession',
      'private renderAgentSessionsPanel'
    )
    const retire = cancel.indexOf(
      'agentSessionLiveStore.cancelRun(operationId)'
    )
    const request = cancel.indexOf(
      'cancelAgentSessionRun(session.agent, operationId)'
    )
    assert.ok(retire >= 0 && request > retire)
    assert.match(cancel, /recordCancellationFailure/)
  })
})
