import {
  ISelfHostedServerControllerStatus,
  ISelfHostedServerProvisioningProgress,
  ISelfHostedServerProvisioningResult,
  SelfHostedServerProvisioningPhase,
} from '../../lib/self-hosted-server/provisioning'

export const SelfHostedServerProvisioningPhaseOrder: ReadonlyArray<SelfHostedServerProvisioningPhase> =
  [
    'detecting-docker',
    'installing-docker',
    'starting-docker',
    'waiting-for-docker',
    'preparing-server',
    'starting-server',
    'verifying-server',
    'creating-join-link',
    'complete',
  ]

export const SelfHostedServerProvisioningPhaseLabel: Record<
  SelfHostedServerProvisioningPhase,
  string
> = {
  'detecting-docker': 'Detect Docker',
  'installing-docker': 'Install Docker Desktop',
  'starting-docker': 'Start Docker Desktop',
  'waiting-for-docker': 'Wait for the Docker engine',
  'preparing-server': 'Prepare server configuration',
  'starting-server': 'Start the server container',
  'verifying-server': 'Verify the server is reachable',
  'creating-join-link': 'Create a join link',
  complete: 'Done',
}

export type SelfHostedServerWizardStepState = 'pending' | 'active' | 'done'

export interface ISelfHostedServerWizardFailure {
  readonly code: string
  readonly recovery: string
}

export interface ISelfHostedServerWizardState {
  readonly status: ISelfHostedServerControllerStatus | null
  readonly publicOriginInput: string
  readonly running: boolean
  readonly cancellationRequested: boolean
  readonly progress: ISelfHostedServerProvisioningProgress | null
  readonly joinUrl: string | null
  readonly error: ISelfHostedServerWizardFailure | null
  readonly retryPhase: SelfHostedServerProvisioningPhase | null
}

export type SelfHostedServerWizardAction =
  | {
      readonly type: 'status-loaded'
      readonly status: ISelfHostedServerControllerStatus
    }
  | { readonly type: 'origin-changed'; readonly value: string }
  | { readonly type: 'run-started' }
  | {
      readonly type: 'progress'
      readonly progress: ISelfHostedServerProvisioningProgress
    }
  | { readonly type: 'cancel-requested' }
  | {
      readonly type: 'completed'
      readonly result: ISelfHostedServerProvisioningResult
    }
  | {
      readonly type: 'failed'
      readonly failure: ISelfHostedServerWizardFailure
    }

export const initialSelfHostedServerWizardState = (
  publicOriginInput = 'https://localhost:8787'
): ISelfHostedServerWizardState => ({
  status: null,
  publicOriginInput,
  running: false,
  cancellationRequested: false,
  progress: null,
  joinUrl: null,
  error: null,
  retryPhase: null,
})

const RetryPhaseByErrorCode: Readonly<
  Record<string, SelfHostedServerProvisioningPhase>
> = {
  'docker-probe-failed': 'detecting-docker',
  'docker-install-required': 'installing-docker',
  'docker-install-failed': 'installing-docker',
  'docker-start-failed': 'starting-docker',
  'docker-daemon-unavailable': 'waiting-for-docker',
  'docker-compose-unavailable': 'detecting-docker',
  'server-bootstrap-failed': 'preparing-server',
  'server-origin-conflict': 'preparing-server',
  'admin-credential-missing': 'preparing-server',
  'server-start-failed': 'starting-server',
  'server-health-failed': 'verifying-server',
  'join-link-failed': 'creating-join-link',
  cancelled: 'detecting-docker',
}

export function retryPhaseForError(
  code: string
): SelfHostedServerProvisioningPhase | null {
  return RetryPhaseByErrorCode[code] ?? null
}

export function wizardStepState(
  phase: SelfHostedServerProvisioningPhase,
  progress: ISelfHostedServerProvisioningProgress | null,
  running: boolean
): SelfHostedServerWizardStepState {
  if (progress === null) {
    return 'pending'
  }
  const currentIndex = SelfHostedServerProvisioningPhaseOrder.indexOf(
    progress.phase
  )
  const phaseIndex = SelfHostedServerProvisioningPhaseOrder.indexOf(phase)
  if (phaseIndex < currentIndex) {
    return 'done'
  }
  if (phaseIndex === currentIndex) {
    return running ? 'active' : 'done'
  }
  return 'pending'
}

export function reduceSelfHostedServerWizardState(
  state: ISelfHostedServerWizardState,
  action: SelfHostedServerWizardAction
): ISelfHostedServerWizardState {
  switch (action.type) {
    case 'status-loaded':
      return {
        ...state,
        status: action.status,
        publicOriginInput:
          action.status.publicOrigin ?? state.publicOriginInput,
      }
    case 'origin-changed':
      return { ...state, publicOriginInput: action.value }
    case 'run-started':
      return {
        ...state,
        running: true,
        cancellationRequested: false,
        progress: null,
        joinUrl: null,
        error: null,
        retryPhase: null,
      }
    case 'progress':
      return state.running ? { ...state, progress: action.progress } : state
    case 'cancel-requested':
      return state.running ? { ...state, cancellationRequested: true } : state
    case 'completed':
      return {
        ...state,
        running: false,
        cancellationRequested: false,
        progress: {
          phase: 'complete',
          detail: 'The self-hosted server is ready.',
        },
        joinUrl: action.result.joinUrl,
        error: null,
        retryPhase: null,
      }
    case 'failed':
      return {
        ...state,
        running: false,
        cancellationRequested: false,
        joinUrl: null,
        error: action.failure,
        retryPhase: retryPhaseForError(action.failure.code),
      }
  }
}
