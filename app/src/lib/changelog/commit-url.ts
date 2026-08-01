/**
 * Where a changelog entry's commit reference points.
 *
 * The changelog viewer ships inside the app, so it cannot ask a repository
 * where it came from — a user reading the release history may have no
 * repository open at all. The build's own source URL is therefore the only
 * honest answer, and it is baked in here rather than assembled at the call
 * site so every surface that renders a commit reference resolves it the same
 * way.
 */

/**
 * The repository the shipped build was made from.
 *
 * Deliberately not read from a repository the user happens to have open: a
 * changelog entry describes a commit in *this project*, and resolving it
 * against whatever repository is selected would produce a link that is wrong
 * in a way the reader cannot detect.
 */
export const ChangelogRepositoryUrl =
  'https://github.com/Ding-Ding-Projects/desktop-material'

/** A full 40-character lowercase hexadecimal SHA and nothing else. */
const FullSha = /^[0-9a-f]{40}$/

/**
 * Whether a string is a commit SHA this module is willing to link.
 *
 * Abbreviated SHAs are refused because they are ambiguous, and anything that
 * is not hexadecimal would produce a confidently wrong URL — worse than no
 * link, because a reader cannot tell a dead link from a moved one.
 */
export function isLinkableCommit(sha: string): boolean {
  return FullSha.test(sha)
}

/**
 * The web URL for a commit, or null when the SHA is not one we can link.
 *
 * Returning null rather than throwing keeps a malformed reference from taking
 * the whole changelog down; the viewer simply renders the entry without a
 * link, which is the honest outcome.
 */
export function commitUrlOrNull(sha: string): string | null {
  return isLinkableCommit(sha)
    ? `${ChangelogRepositoryUrl}/commit/${sha}`
    : null
}

/**
 * The web URL for a commit already known to be linkable.
 *
 * Callers that have run the reference through `splitChangelogEntry` are in
 * that position: the parser only produces a commit when it matched a full SHA.
 */
export function commitUrl(sha: string): string {
  return `${ChangelogRepositoryUrl}/commit/${sha}`
}
