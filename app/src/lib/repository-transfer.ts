/** The two ways a local repository can be transferred to a new account. */
export type RepositoryTransferMode = 'full-history' | 'clean-state'

/** Stages surfaced by the transfer dialog while Git and the provider work. */
export type RepositoryTransferProgressStage =
  | 'checking'
  | 'creating'
  | 'preparing'
  | 'publishing'
  | 'retargeting'
  | 'complete'

export interface IRepositoryTransferProgress {
  readonly stage: RepositoryTransferProgressStage
  readonly message: string
}

/**
 * The commit made by Clean state mode. Keep this message stable so a user can
 * recognise the boundary later in local history or after restoring the
 * recovery ref.
 */
export const RepositoryTransferSnapshotCommitMessage =
  'Create clean repository transfer snapshot'

/** A stable namespace for the old tip kept before a clean-state rewrite. */
export const RepositoryTransferRecoveryRefPrefix =
  'refs/desktop-material/transfer-backups/'

/**
 * Return the user-facing description for a transfer mode.
 *
 * This lives outside the dialog so tests and documentation can use the same
 * facts as the operation itself.
 */
export function describeRepositoryTransferMode(
  mode: RepositoryTransferMode
): string {
  return mode === 'full-history'
    ? 'Publishes every local branch and tag with the existing commit history.'
    : 'Publishes the current files as one new root commit and keeps the old tip in a local recovery ref.'
}

/** Validate a repository name before it reaches the provider API. */
export function validateRepositoryTransferName(name: string): string {
  const trimmed = name.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 100 ||
    trimmed === '.' ||
    trimmed === '..' ||
    !/^[A-Za-z0-9_.-]+$/.test(trimmed)
  ) {
    throw new Error(
      'Repository names must be 1–100 characters and use only letters, numbers, dots, dashes, or underscores.'
    )
  }
  return trimmed
}
