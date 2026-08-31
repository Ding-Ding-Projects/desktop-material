/**
 * Serializable, credential-free projection of an agent session into the
 * owner-operated Status Hub. The renderer may display this shape, but only
 * the main process may send it across the network.
 */
export type StatusHubConnectionState =
  | 'connected'
  | 'unavailable'
  | 'authentication-unavailable'
  | 'delivery-unconfirmed'

export type StatusHubEvidenceState =
  | 'verified'
  | 'running'
  | 'unrun'
  | 'blocked'

export interface IStatusHubEvidence {
  readonly id: string
  readonly label: string
  readonly state: StatusHubEvidenceState
  readonly detail: string
  readonly url: string | null
}

export interface IStatusHubProjectRegistration {
  readonly repositoryId: string
  readonly repositoryPath: string
  readonly defaultBranch: string | null
  readonly releaseChannel: string | null
  readonly displayName: string
}

export interface IStatusHubSessionProjection {
  readonly sessionId: string
  readonly project: IStatusHubProjectRegistration
  readonly state: 'running' | 'waiting' | 'blocked' | 'completed'
  readonly summary: string
  readonly heartbeatAt: number
  readonly evidence: ReadonlyArray<IStatusHubEvidence>
}

export interface IStatusHubReply {
  readonly id: string
  readonly questionId: string
  readonly text: string
  readonly receivedAt: number
}

export interface IStatusHubReplyPollResult {
  readonly replies: ReadonlyArray<IStatusHubReply>
  readonly nextCursor: string | null
  /** True only after the Hub accepts this renderer session's delivery poll. */
  readonly deliveryConfirmed: boolean
}

export interface IStatusHubStatus {
  readonly connection: StatusHubConnectionState
  readonly stableURL: string | null
  readonly message: string
  readonly lastUpdatedAt: number | null
}

export const LocalStatusHubFallback: IStatusHubStatus = Object.freeze({
  connection: 'unavailable',
  stableURL: null,
  message:
    'Status Hub is unavailable; this app is showing local session state only.',
  lastUpdatedAt: null,
})
