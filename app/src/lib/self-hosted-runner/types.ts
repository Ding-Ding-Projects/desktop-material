/** The two runner hosts the Windows desktop app can manage. */
export type SelfHostedRunnerPlatform = 'windows' | 'linux-wsl'

export type SelfHostedRunnerStatus = 'running' | 'stopped' | 'missing'

export type SelfHostedRunnerProgressPhase =
  | 'validating'
  | 'detecting-wsl'
  | 'creating-wsl'
  | 'installing-windows-dependencies'
  | 'installing-linux-dependencies'
  | 'downloading-runner'
  | 'configuring-runner'
  | 'starting-runner'
  | 'removing-runner'
  | 'complete'

/** Renderer-facing runner record. Secrets and managed filesystem paths never cross IPC. */
export interface ISelfHostedRunner {
  readonly id: string
  readonly owner: string
  readonly repository: string
  readonly name: string
  readonly labels: ReadonlyArray<string>
  readonly platform: SelfHostedRunnerPlatform
  readonly wslDistribution: string | null
  readonly dedicatedWsl: boolean
  readonly accountKey: string | null
  readonly createdAt: string
  readonly status: SelfHostedRunnerStatus
}

export interface ISelfHostedRunnerProgress {
  readonly runnerId: string
  readonly phase: SelfHostedRunnerProgressPhase
  readonly detail: string
}

export interface ISelfHostedRunnerStatus {
  readonly supported: boolean
  readonly wslAvailable: boolean
  readonly distributions: ReadonlyArray<string>
  readonly runners: ReadonlyArray<ISelfHostedRunner>
  readonly activeRunnerId: string | null
}

/** Repository scope used to prevent one Actions tab from controlling another. */
export interface ISelfHostedRunnerRepositoryScope {
  readonly owner: string
  readonly repository: string
}

export type ISelfHostedRunnerStatusRequest = ISelfHostedRunnerRepositoryScope

export interface ISelfHostedRunnerPreflightRequest
  extends ISelfHostedRunnerRepositoryScope {
  readonly accountKey: string
  readonly githubApiEndpoint: string
  readonly labels: ReadonlyArray<string>
}

export interface ISelfHostedRunnerPreflightResult {
  readonly commitSHA: string
  readonly workflowCount: number
}

/** The main process resolves the account credential and mints the one-time token. */
export interface ISelfHostedRunnerSetupRequest {
  readonly id: string
  readonly accountKey: string
  readonly owner: string
  readonly repository: string
  readonly githubApiEndpoint: string
  readonly name: string
  readonly labels: ReadonlyArray<string>
  readonly platform: SelfHostedRunnerPlatform
  readonly wslDistribution?: string
  readonly createDedicatedWsl: boolean
  readonly wslBaseDistribution?: string
  readonly dedicatedWslDistribution?: string
  readonly autoInstallDependencies: boolean
}

export interface ISelfHostedRunnerControlRequest
  extends ISelfHostedRunnerRepositoryScope {
  readonly id: string
}

export interface ISelfHostedRunnerRemoveRequest
  extends ISelfHostedRunnerControlRequest {
  readonly accountKey: string
  readonly githubApiEndpoint: string
}

export interface ISelfHostedRunnerCreateWslRequest {
  readonly baseDistribution: string
  readonly dedicatedDistribution: string
}

export interface ISelfHostedRunnerSetupResult {
  readonly runner: ISelfHostedRunner
}

export interface ISelfHostedRunnerRemoveResult {
  readonly removedRunnerId: string
  readonly warnings: ReadonlyArray<string>
}

export interface ISelfHostedRunnerWslResult {
  readonly distribution: string
}

export interface ISelfHostedRunnerSuccess<T> {
  readonly ok: true
  readonly result: T
}

export interface ISelfHostedRunnerFailure {
  readonly ok: false
  readonly code: string
  readonly recovery: string
}

export type SelfHostedRunnerReply<T> =
  | ISelfHostedRunnerSuccess<T>
  | ISelfHostedRunnerFailure
