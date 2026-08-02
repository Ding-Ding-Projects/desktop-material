import {
  CodingAgentId,
  INewAgentSessionRequest,
} from '../../models/agent-session'
import { USER_PROMPT_CAP } from '../build-run/opencode'
import { sanitizedRefName } from '../sanitize-ref-name'

/** Longest session name accepted, in characters. */
export const AgentSessionNameCap = 100

/**
 * Longest task accepted, mirroring the cap the runners already enforce on the
 * prompt they feed over stdin. Imported rather than restated so the form can
 * never accept text the runner would silently truncate.
 */
export const AgentSessionPromptCap = USER_PROMPT_CAP

/**
 * Windows refuses a directory with any of these base names, with or without an
 * extension, so a worktree named after one cannot be created even though git
 * would happily accept the ref.
 */
const ReservedWindowsNames = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

/** Everything that can stop a new session from starting. */
export type NewAgentSessionProblemKind =
  | 'name-empty'
  | 'name-too-long'
  | 'name-separator'
  | 'name-illegal'
  | 'name-reserved'
  | 'name-duplicate-worktree'
  | 'name-duplicate-branch'
  | 'base-branch-empty'
  | 'base-branch-unknown'
  | 'agent-unavailable'
  | 'prompt-empty'
  | 'prompt-too-long'

/** One reason Start stays disabled, with the sentence shown to the user. */
export interface INewAgentSessionProblem {
  readonly kind: NewAgentSessionProblemKind
  readonly message: string
}

/** Everything validation needs to know about the repository it runs against. */
export interface INewAgentSessionContext {
  /** Base names of the worktrees that already exist. */
  readonly existingWorktreeNames: ReadonlyArray<string>
  /** Short names of the local branches that already exist. */
  readonly existingBranchNames: ReadonlyArray<string>
  /** Short names of the branches the base picker offers. */
  readonly availableBaseBranches: ReadonlyArray<string>
  /** Agents the picker will let the user choose on this host. */
  readonly selectableAgentIds: ReadonlyArray<CodingAgentId>
}

/**
 * Compare names the way the filesystem will. Git refs are case-sensitive, but
 * a worktree is a directory and a branch is a file under `.git/refs`, so on
 * Windows and the default macOS volume `Feature` and `feature` collide. Folding
 * case everywhere refuses a name that would fail on those hosts rather than
 * creating one that only works on some of them.
 */
function foldName(value: string): string {
  return value.trim().toLowerCase()
}

function includesFolded(
  values: ReadonlyArray<string>,
  candidate: string
): boolean {
  const folded = foldName(candidate)
  return values.some(value => foldName(value) === folded)
}

/**
 * Check a proposed session name on its own, before it is compared with what
 * already exists.
 *
 * Legality is decided by round-tripping through {@link sanitizedRefName}: if
 * sanitizing changes the name, git would have refused it. That keeps this in
 * step with the branch-name rules the rest of the app already enforces instead
 * of maintaining a second, drifting copy of git's ref grammar.
 */
export function validateAgentSessionName(
  name: string
): INewAgentSessionProblem | null {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { kind: 'name-empty', message: 'Enter a name for the new worktree.' }
  }

  if (trimmed.length > AgentSessionNameCap) {
    return {
      kind: 'name-too-long',
      message: `Use ${AgentSessionNameCap} characters or fewer.`,
    }
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      kind: 'name-separator',
      message: 'A worktree name cannot contain a path separator.',
    }
  }

  if (sanitizedRefName(trimmed) !== trimmed) {
    return {
      kind: 'name-illegal',
      message:
        'Git will not accept this name. Avoid spaces, control characters, ' +
        'and the characters ~ ^ : ? * [ \\ and consecutive dots.',
    }
  }

  const base = trimmed.split('.')[0].toLowerCase()
  if (ReservedWindowsNames.has(base)) {
    return {
      kind: 'name-reserved',
      message: `${trimmed} is a reserved device name on Windows.`,
    }
  }

  return null
}

/**
 * Collect every reason the request cannot be started, in the order a user
 * reading the form would meet them. An empty array means Start is safe to
 * enable.
 */
export function validateNewAgentSession(
  request: INewAgentSessionRequest,
  context: INewAgentSessionContext
): ReadonlyArray<INewAgentSessionProblem> {
  const problems: Array<INewAgentSessionProblem> = []
  const name = request.name.trim()

  const nameProblem = validateAgentSessionName(request.name)
  if (nameProblem !== null) {
    problems.push(nameProblem)
  } else {
    if (includesFolded(context.existingWorktreeNames, name)) {
      problems.push({
        kind: 'name-duplicate-worktree',
        message: `A worktree named ${name} already exists.`,
      })
    }
    if (includesFolded(context.existingBranchNames, name)) {
      problems.push({
        kind: 'name-duplicate-branch',
        message: `A branch named ${name} already exists.`,
      })
    }
  }

  const baseBranch = request.baseBranch.trim()
  if (baseBranch.length === 0) {
    problems.push({
      kind: 'base-branch-empty',
      message: 'Choose a base branch.',
    })
  } else if (!context.availableBaseBranches.includes(baseBranch)) {
    problems.push({
      kind: 'base-branch-unknown',
      message: `${baseBranch} is not a branch in this repository.`,
    })
  }

  if (!context.selectableAgentIds.includes(request.agent)) {
    problems.push({
      kind: 'agent-unavailable',
      message: 'That coding agent cannot run on this computer.',
    })
  }

  if (request.agent !== 'none') {
    const prompt = request.prompt.trim()
    if (prompt.length === 0) {
      problems.push({
        kind: 'prompt-empty',
        message: 'Describe the task for the agent, or choose <None>.',
      })
    } else if (prompt.length > AgentSessionPromptCap) {
      problems.push({
        kind: 'prompt-too-long',
        message: `Use ${AgentSessionPromptCap} characters or fewer.`,
      })
    }
  }

  return problems
}

/** True when every field is legal and Start may be enabled. */
export function canStartAgentSession(
  request: INewAgentSessionRequest,
  context: INewAgentSessionContext
): boolean {
  return validateNewAgentSession(request, context).length === 0
}

/**
 * The branch a session creates for its worktree. The name is already ref-legal
 * by the time this runs, so it is used verbatim; sanitizing is a safety net for
 * callers that skipped validation rather than a transformation users see.
 */
export function getAgentSessionBranchName(name: string): string {
  return sanitizedRefName(name.trim())
}
