/**
 * Pure parsing and decision logic for the quick-action window.
 *
 * Explorer context-menu verbs launch the app as
 * `GitHubDesktop.exe --quick-action=<verb> --path=<dir>`. Rather than booting
 * the full workspace — restoring every repository, its tabs and its history —
 * that command opens one small always-on-top window scoped to a single folder.
 * Fast startup is the entire point of the feature, so the launch path must
 * decide what to open before any store is constructed.
 *
 * Everything here is pure: argument parsing, validation, and the flow decisions
 * the window makes. The window itself, the git calls and the IPC live
 * elsewhere, so the decisions stay unit-testable without Electron or a repo.
 */

/** The actions the quick window can perform. */
export type QuickActionVerb = 'status-commit-push' | 'open-in-full-app'

/** Every verb, in menu order. */
export const QuickActionVerbs: ReadonlyArray<QuickActionVerb> = Object.freeze([
  'status-commit-push',
  'open-in-full-app',
] as const)

export function isQuickActionVerb(value: unknown): value is QuickActionVerb {
  return (
    typeof value === 'string' &&
    QuickActionVerbs.includes(value as QuickActionVerb)
  )
}

/** A validated request to open the quick window. */
export interface IQuickActionRequest {
  readonly verb: QuickActionVerb
  readonly path: string
}

export type QuickActionInvalidReason =
  | 'unknown-verb'
  | 'missing-path'
  | 'relative-path'
  | 'malformed-path'

/**
 * What the launch path should do with a command line. `not-requested` means the
 * arguments carry no quick action at all and the normal window logic applies.
 */
export type QuickActionDecision =
  | { readonly kind: 'quick-action'; readonly request: IQuickActionRequest }
  | { readonly kind: 'not-requested' }
  | { readonly kind: 'invalid'; readonly reason: QuickActionInvalidReason }

/** The CLI flag names, kept in one place so the payload generator agrees. */
export const QuickActionFlag = 'quick-action'
export const QuickActionPathFlag = 'path'

/**
 * A Windows absolute path: a drive-letter root or a UNC share. Explorer only
 * ever substitutes one of these, so anything else means the argument did not
 * come from where we think it did and the window refuses to open rather than
 * resolving it against an arbitrary working directory.
 */
const AbsoluteWindowsPath = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/
/** POSIX absolute path, so the decision function is testable off Windows. */
const AbsolutePosixPath = /^\//

function isAbsolutePath(value: string): boolean {
  return AbsoluteWindowsPath.test(value) || AbsolutePosixPath.test(value)
}

/**
 * Decide what a parsed command line asks for.
 *
 * Takes the already-parsed argument record (minimist output) rather than raw
 * argv so it can be exercised directly, and so it cannot disagree with how the
 * rest of the launch path parses arguments.
 */
export function decideQuickAction(
  args: Record<string, unknown>
): QuickActionDecision {
  const rawVerb = args[QuickActionFlag]

  if (rawVerb === undefined || rawVerb === false) {
    return { kind: 'not-requested' }
  }

  if (!isQuickActionVerb(rawVerb)) {
    return { kind: 'invalid', reason: 'unknown-verb' }
  }

  const rawPath = args[QuickActionPathFlag]
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { kind: 'invalid', reason: 'missing-path' }
  }

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(rawPath)) {
    return { kind: 'invalid', reason: 'malformed-path' }
  }

  const path = rawPath.trim()
  if (!isAbsolutePath(path)) {
    return { kind: 'invalid', reason: 'relative-path' }
  }

  return { kind: 'quick-action', request: { verb: rawVerb, path } }
}

/**
 * The argv the Explorer command should carry for a verb.
 *
 * `%V` is Explorer's folder substitution and is filled in by the shell, so it
 * travels as a literal here.
 */
export function quickActionLaunchArguments(
  verb: QuickActionVerb,
  path: string
): ReadonlyArray<string> {
  return Object.freeze([
    `--${QuickActionFlag}=${verb}`,
    `--${QuickActionPathFlag}=${path}`,
  ])
}

/** Phases the commit-and-push flow moves through, in order. */
export type QuickCommitPhase =
  | 'loading'
  | 'ready'
  | 'committing'
  | 'pushing'
  | 'done'
  | 'failed'

/** Why the commit button is unavailable, or null when it is usable. */
export type QuickCommitBlocker =
  | 'loading'
  | 'no-changes'
  | 'no-summary'
  | 'detached-head'
  | 'busy'
  | 'not-a-repository'

/** The inputs the commit decision depends on. */
export interface IQuickCommitInputs {
  readonly phase: QuickCommitPhase
  readonly isRepository: boolean
  readonly changedFileCount: number
  readonly summary: string
  /** Undefined on a detached HEAD, where there is no branch to push. */
  readonly currentBranch: string | undefined
}

/**
 * Decide whether "Commit & push" can run, and why not when it cannot.
 *
 * Pure so the button's enablement — the one piece of logic a user actually
 * feels — is covered without rendering or a real repository.
 */
export function decideQuickCommit(
  inputs: IQuickCommitInputs
): QuickCommitBlocker | null {
  if (inputs.phase === 'loading') {
    return 'loading'
  }
  if (!inputs.isRepository) {
    return 'not-a-repository'
  }
  if (inputs.phase === 'committing' || inputs.phase === 'pushing') {
    return 'busy'
  }
  if (inputs.currentBranch === undefined) {
    // Pushing a detached HEAD needs a refspec decision this window does not ask
    // for; the escape hatch to the full app covers it.
    return 'detached-head'
  }
  if (inputs.changedFileCount === 0) {
    return 'no-changes'
  }
  if (inputs.summary.trim().length === 0) {
    return 'no-summary'
  }
  return null
}

/**
 * Strip the remote prefix from a tracking-branch name.
 *
 * `getStatus` reports the upstream as `origin/main`, but `push` wants the
 * branch name as the remote knows it. Returns null when there is no upstream,
 * which is what makes `push` set one.
 */
export function deriveRemoteBranchName(
  currentUpstreamBranch: string | undefined
): string | null {
  if (currentUpstreamBranch === undefined) {
    return null
  }
  const separator = currentUpstreamBranch.indexOf('/')
  if (separator === -1) {
    return currentUpstreamBranch
  }
  return currentUpstreamBranch.slice(separator + 1)
}

/**
 * Pick the remote to push to: `origin` when present, otherwise the only remote.
 * Returns null when the repository has no remotes or is ambiguous, in which
 * case the window sends the user to the full app rather than guessing.
 */
export function chooseQuickPushRemote<T extends { readonly name: string }>(
  remotes: ReadonlyArray<T>
): T | null {
  if (remotes.length === 0) {
    return null
  }
  const origin = remotes.find(remote => remote.name === 'origin')
  if (origin !== undefined) {
    return origin
  }
  return remotes.length === 1 ? remotes[0] : null
}

/**
 * The git operations the commit-and-push flow needs, as an injectable
 * interface.
 *
 * The orchestration — phase ordering, remote choice, and what happens when the
 * commit lands but the push cannot — is the part with behaviour worth testing,
 * so it lives here with the real git calls supplied by the renderer adapter.
 * That keeps this module free of `dugite`, `keytar` and the trampoline, and
 * lets the flow be exercised with fakes instead of a real repository.
 */
export interface IQuickCommitOperations<
  TFile,
  TRemote extends { name: string }
> {
  readonly createCommit: (
    summary: string,
    files: ReadonlyArray<TFile>
  ) => Promise<string>
  readonly getRemotes: () => Promise<ReadonlyArray<TRemote>>
  readonly push: (
    remote: TRemote,
    localBranch: string,
    remoteBranch: string | null,
    onProgress: (description: string) => void
  ) => Promise<void>
}

/** What the flow needs to know about the repository. */
export interface IQuickCommitTarget<TFile> {
  readonly files: ReadonlyArray<TFile>
  readonly currentBranch: string | undefined
  readonly currentUpstreamBranch: string | undefined
}

/**
 * Commit every change and push the current branch, reporting each phase.
 *
 * Returns the new commit's abbreviated SHA. A push that cannot proceed rejects
 * with a message that leads with the successful commit, because the user's work
 * is safely committed either way and that is the first thing they need to know.
 */
export async function runQuickCommitAndPush<
  TFile,
  TRemote extends { name: string }
>(
  target: IQuickCommitTarget<TFile>,
  summary: string,
  operations: IQuickCommitOperations<TFile, TRemote>,
  onPhase: (phase: QuickCommitPhase) => void,
  onProgress: (description: string) => void
): Promise<string> {
  const { files, currentBranch, currentUpstreamBranch } = target

  if (currentBranch === undefined) {
    throw new Error('This folder is not a repository on a branch.')
  }

  onPhase('committing')
  const sha = await operations.createCommit(summary, files)

  onPhase('pushing')
  const remotes = await operations.getRemotes()
  const remote = chooseQuickPushRemote(remotes)

  if (remote === null) {
    throw new Error(
      remotes.length === 0
        ? `Committed ${sha}, but this repository has no remote to push to.`
        : `Committed ${sha}, but it is not clear which remote to push to.`
    )
  }

  await operations.push(
    remote,
    currentBranch,
    deriveRemoteBranchName(currentUpstreamBranch),
    onProgress
  )

  return sha
}
