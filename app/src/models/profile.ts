import { createHash } from 'crypto'

/**
 * A stable identity for a settings profile.
 *
 * For a signed-in account this is the account key (`endpoint#id`); when no
 * account is active we fall back to a single shared local profile.
 */
export type ProfileKey = string

/** The profile used when no account is signed in. */
export const LocalProfileKey: ProfileKey = 'local'

/** Description of a single on-disk profile. */
export interface IProfileDescriptor {
  /** The raw profile key (e.g. `https://api.github.com#1234`). */
  readonly key: ProfileKey
  /** The sanitized directory name the profile is stored under. */
  readonly directoryName: string
  /** The login associated with the profile, or null for the local profile. */
  readonly login: string | null
}

/** Maximum number of profile-history entries returned in one page. */
export const ProfileHistoryPageSize = 50

/** A serializable profile-repository commit for the settings-history UI. */
export interface IProfileHistoryEntry {
  readonly sha: string
  readonly shortSha: string
  readonly summary: string
  readonly body: string
  readonly committedAt: Date
  readonly undoOf: string | null
  readonly redoOf: string | null
  readonly restoreOf: string | null
}

/** One bounded page of profile history plus actions available at its HEAD. */
export interface IProfileHistoryPage {
  readonly entries: ReadonlyArray<IProfileHistoryEntry>
  readonly total: number
  readonly hasMore: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/**
 * Turn a profile key into a filesystem-safe, collision-free directory name.
 *
 * The readable portion (host and identity, with the protocol stripped) is kept
 * so the directory is easy to inspect, and a short hash of the full key
 * guarantees uniqueness even when two different keys sanitize to the same
 * readable prefix.
 */
export function sanitizeProfileDirectoryName(key: ProfileKey): string {
  if (key === LocalProfileKey) {
    return LocalProfileKey
  }

  const withoutProtocol = key.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const readable = withoutProtocol.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40)
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 8)
  return `${readable}-${hash}`
}

/**
 * Compose a commit message from a batch of change descriptions. A single change
 * becomes the subject line; multiple changes get a summary subject and a
 * bulleted body so the history stays readable.
 */
export function composeProfileCommitMessage(
  descriptions: ReadonlyArray<string>
): string {
  if (descriptions.length === 0) {
    return 'Update profile'
  }

  if (descriptions.length === 1) {
    return descriptions[0]
  }

  const subject = `Update profile (${descriptions.length} changes)`
  const body = descriptions.map(d => `- ${d}`).join('\n')
  return `${subject}\n\n${body}`
}
