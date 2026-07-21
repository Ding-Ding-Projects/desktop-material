import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import type {
  IBuildRunLogEvent,
  IBuildRunStateEvent,
} from '../../src/lib/build-run/types'

type LogHandler = (event: unknown, log: IBuildRunLogEvent) => void
type StateHandler = (event: unknown, state: IBuildRunStateEvent) => void

let logHandler: LogHandler | null = null
let stateHandler: StateHandler | null = null

mock.module('../../src/ui/main-process-proxy', {
  namedExports: {
    onBuildRunLog: (handler: LogHandler) => {
      logHandler = handler
    },
    onBuildRunState: (handler: StateHandler) => {
      stateHandler = handler
    },
  },
})

let BuildRunStore: typeof import('../../src/lib/stores/build-run-store').BuildRunStore

before(async () => {
  ;({ BuildRunStore } = await import('../../src/lib/stores/build-run-store'))
})

describe('BuildRunStore active-run fencing', () => {
  it('rejects state and log events from superseded and completed runs', () => {
    const store = new BuildRunStore()
    const repositoryId = 71
    store.beginRun(repositoryId, 'old-run')
    assert.ok(stateHandler !== null)
    assert.ok(logHandler !== null)
    stateHandler(undefined, {
      runId: 'old-run',
      repositoryId,
      phase: 'building',
      pid: 101,
    })
    assert.equal(store.getStateForRepository(repositoryId).runPid, 101)

    store.beginRun(repositoryId, 'new-run')
    stateHandler(undefined, {
      runId: 'old-run',
      repositoryId,
      phase: 'running',
      pid: 102,
    })
    logHandler(undefined, {
      runId: 'old-run',
      seq: 1,
      stage: 'run',
      stream: 'stdout',
      text: 'stale output',
    })
    stateHandler(undefined, {
      runId: 'old-run',
      repositoryId,
      phase: 'failed',
      exitCode: 1,
    })

    let current = store.getStateForRepository(repositoryId)
    assert.equal(current.activeRunId, 'new-run')
    assert.equal(current.phase, 'detecting')
    assert.equal(current.runPid, null)
    assert.deepEqual(current.logLines, [])

    stateHandler(undefined, {
      runId: 'new-run',
      repositoryId,
      phase: 'building',
      pid: 201,
    })
    logHandler(undefined, {
      runId: 'new-run',
      seq: 1,
      stage: 'build',
      stream: 'stdout',
      text: 'current output',
    })
    current = store.getStateForRepository(repositoryId)
    assert.equal(current.phase, 'building')
    assert.equal(current.runPid, 201)
    assert.deepEqual(
      current.logLines.map(line => line.text),
      ['current output']
    )

    stateHandler(undefined, {
      runId: 'new-run',
      repositoryId,
      phase: 'succeeded',
      exitCode: 0,
    })
    stateHandler(undefined, {
      runId: 'new-run',
      repositoryId,
      phase: 'running',
      pid: 202,
    })
    current = store.getStateForRepository(repositoryId)
    assert.equal(current.activeRunId, null)
    assert.equal(current.phase, 'succeeded')
    assert.equal(current.runPid, null)
  })
})
