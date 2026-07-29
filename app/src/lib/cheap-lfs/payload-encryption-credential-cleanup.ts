export const CheapLfsPayloadPasswordService = `${
  __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'
} - Cheap LFS payload password`

/** Service/account contract written by builds before durable repository keys. */
export const LegacyCheapLfsPayloadPasswordService =
  'desktop-material/cheap-lfs-encryption'

export const CheapLfsPayloadCredentialCleanupChannel =
  'cleanup-cheap-lfs-payload-credentials'

export interface ICheapLfsPayloadCredentialCleanupTarget {
  /** Canonical-path-only account used by current builds. */
  readonly canonicalAccount: string
  /** Numeric account used by legacy builds. */
  readonly legacyNumericAccount: string
  /** Known path-plus-remote accounts written by the interim durable-key build. */
  readonly priorStableAliases: ReadonlyArray<string>
}

export interface ICheapLfsPayloadCredentialCleanupRequest {
  /**
   * Account labels only. Passwords never cross the renderer/main-process IPC
   * boundary during enumeration or cleanup.
   */
  readonly currentRepositories: ReadonlyArray<ICheapLfsPayloadCredentialCleanupTarget>
}

export type CheapLfsPayloadCredentialCleanupResult =
  | {
      readonly kind: 'cleaned' | 'cleanup-pending'
      readonly migrated: number
      readonly deleted: number
      readonly pending: number
    }
  | { readonly kind: 'unavailable' }
