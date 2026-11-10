/**
 * What the About dialog says about where this build came from, and the
 * standing note that the app is free.
 */

/** The short commit this build was made from, or null when it is unknown. */
export function shortBuildCommit(sha: string): string | null {
  const trimmed = sha.trim().toLowerCase()
  return /^[0-9a-f]{7,64}$/.test(trimmed) ? trimmed.slice(0, 10) : null
}

/** One sentence naming the commit, or saying plainly that it is not known. */
export function describeBuildProvenance(sha: string): string {
  const commit = shortBuildCommit(sha)
  return commit === null
    ? 'The commit this build was made from was not recorded.'
    : `Built from commit ${commit}.`
}

export const FreeForeverNote =
  'Free, and it stays free: no ads, no upgrade prompts, no review nags. Desktop Material builds on GitHub Desktop by GitHub and its contributors.'
