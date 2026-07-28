export type CanonicalRemoteVerificationFailure =
  | 'provider-unverified'
  | 'unsafe-remote-update'

/**
 * A network mutation was stopped because Desktop Material could not prove the
 * configured remote's canonical destination. The error intentionally carries
 * no URL so credentials embedded in a malformed remote can never reach a log,
 * notification, or error report.
 */
export class CanonicalRemoteVerificationError extends Error {
  public readonly name = 'CanonicalRemoteVerificationError'

  public constructor(
    public readonly repositoryId: number,
    public readonly reason: CanonicalRemoteVerificationFailure
  ) {
    super(
      reason === 'provider-unverified'
        ? 'Desktop Material could not verify the configured repository URL before the network operation.'
        : 'Desktop Material could not safely verify or update the transferred repository URL.'
    )
  }
}
