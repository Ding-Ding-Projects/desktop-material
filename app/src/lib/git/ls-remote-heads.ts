/**
 * Pure parser for `git ls-remote --symref` branch-head output.
 *
 * This module deliberately has no imports so UI surfaces, the git layer, and
 * node-only unit tests can consume it without dragging in dugite or React.
 */

/** One branch head advertised by a remote. */
export interface IRemoteHeadBranch {
  /** The branch name without the `refs/heads/` prefix. */
  readonly name: string
  /** The commit SHA the branch head points at. */
  readonly sha: string
}

/** The parsed result of listing a remote's branch heads. */
export interface IRemoteHeadsListing {
  /** The advertised branches, bounded by the parse limit. */
  readonly branches: ReadonlyArray<IRemoteHeadBranch>
  /**
   * The branch name the remote HEAD symref points at, or null when the
   * remote did not advertise one (for example an empty repository).
   */
  readonly defaultBranch: string | null
  /** Whether the advertised branch list was cut off at the parse limit. */
  readonly truncated: boolean
}

/**
 * The maximum number of branches a single listing will surface. A remote with
 * more heads than this is truncated and reported as such rather than letting
 * an adversarial or degenerate remote balloon renderer state.
 */
export const MaximumRemoteHeadBranches = 5000

/** `ref: refs/heads/<name>\tHEAD` — the remote HEAD symref advertisement. */
const symrefRe = /^ref: refs\/heads\/(.+)\tHEAD$/

/** `<sha>\trefs/heads/<name>` — one advertised branch head. */
const headRe = /^([0-9a-fA-F]{40,64})\trefs\/heads\/([^\0]+)$/

/**
 * Parse `git ls-remote --symref` output into branch heads and the remote
 * default branch.
 *
 * Lines that are not a branch head or the HEAD symref — the plain `HEAD`
 * object line, tags, peeled `^{}` entries, other symrefs, and malformed
 * output — are skipped rather than treated as errors. Zero branches (an
 * empty repository) is a valid, empty listing.
 */
export function parseLsRemoteHeads(
  stdout: string,
  limit: number = MaximumRemoteHeadBranches
): IRemoteHeadsListing {
  const branches = new Array<IRemoteHeadBranch>()
  let defaultBranch: string | null = null
  let truncated = false

  for (const line of stdout.split(/\r?\n/)) {
    if (line.length === 0) {
      continue
    }

    const symref = symrefRe.exec(line)
    if (symref !== null) {
      defaultBranch = symref[1]
      continue
    }

    const head = headRe.exec(line)
    if (head === null) {
      // Malformed or out-of-scope line; tolerate and move on.
      continue
    }

    if (branches.length >= limit) {
      // Keep scanning so a late HEAD symref line is still honoured, but stop
      // collecting branches and report the cut.
      truncated = true
      continue
    }

    branches.push({ name: head[2], sha: head[1] })
  }

  return { branches, defaultBranch, truncated }
}
