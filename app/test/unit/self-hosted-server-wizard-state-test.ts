import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  initialSelfHostedServerWizardState,
  reduceSelfHostedServerWizardState,
  retryPhaseForError,
  wizardStepState,
} from '../../src/ui/preferences/self-hosted-server-wizard-state'

const progress = (phase: Parameters<typeof wizardStepState>[0]) => ({
  phase,
  detail: phase,
})

describe('self-hosted server wizard state', () => {
  it('marks only the active phase and completed phases', () => {
    assert.equal(wizardStepState('detecting-docker', null, false), 'pending')
    assert.equal(
      wizardStepState('detecting-docker', progress('preparing-server'), true),
      'done'
    )
    assert.equal(
      wizardStepState('preparing-server', progress('preparing-server'), true),
      'active'
    )
    assert.equal(
      wizardStepState('preparing-server', progress('preparing-server'), false),
      'done'
    )
    assert.equal(
      wizardStepState('complete', progress('complete'), false),
      'done'
    )
  })

  it('clears stale output at the start and ignores delayed progress after failure', () => {
    let state = initialSelfHostedServerWizardState()
    state = reduceSelfHostedServerWizardState(state, { type: 'run-started' })
    state = reduceSelfHostedServerWizardState(state, {
      type: 'progress',
      progress: progress('starting-server'),
    })
    state = reduceSelfHostedServerWizardState(state, {
      type: 'failed',
      failure: {
        code: 'server-health-failed',
        recovery: 'Retry verification.',
      },
    })
    const failedProgress = state.progress
    assert.equal(state.retryPhase, 'verifying-server')
    state = reduceSelfHostedServerWizardState(state, {
      type: 'progress',
      progress: progress('complete'),
    })
    assert.deepEqual(state.progress, failedProgress)
  })

  it('keeps credentials out of the renderer-facing success state', () => {
    let state = reduceSelfHostedServerWizardState(
      initialSelfHostedServerWizardState(),
      { type: 'run-started' }
    )
    state = reduceSelfHostedServerWizardState(state, {
      type: 'completed',
      result: {
        serverId: 'server-id',
        publicOrigin: 'https://server.example',
        joinUrl: 'https://server.example/join#token=opaque',
      },
    })
    assert.equal('adminToken' in state, false)
    assert.equal(Object.hasOwn(state, 'serverId'), false)
  })

  it('maps host and credential boundaries to safe retry behavior', () => {
    assert.equal(
      retryPhaseForError('docker-daemon-unavailable'),
      'waiting-for-docker'
    )
    assert.equal(
      retryPhaseForError('admin-credential-missing'),
      'preparing-server'
    )
    assert.equal(retryPhaseForError('unsupported-platform'), null)
    assert.equal(retryPhaseForError('driver-init-failed'), null)
  })

  it('marks cancellation as a visible in-flight state', () => {
    let state = reduceSelfHostedServerWizardState(
      initialSelfHostedServerWizardState(),
      { type: 'run-started' }
    )
    state = reduceSelfHostedServerWizardState(state, {
      type: 'cancel-requested',
    })
    assert.equal(state.running, true)
    assert.equal(state.cancellationRequested, true)
  })
})
