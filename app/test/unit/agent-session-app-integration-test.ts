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
