import {
  CodingAgentId,
  IAgentSession,
  IAgentSessionChip,
} from '../../models/agent-session'
import { WorktreeEntry } from '../../models/worktree'
import { LanguageMode } from '../../models/language-mode'
import {
  AgentSessionChipAttention,
  deriveAgentSessionChip,
} from './agent-session-status'

/**
 * The base name of a worktree path.
 *
 * Deliberately not `path.basename`: git reports Windows paths with forward
 * slashes while the app normalizes them with backslashes, and this module is
 * unit-tested on every platform, so both separators are handled here rather
 * than depending on whichever one the host's `path` implementation knows.
 */
export function getWorktreeDisplayName(worktreePath: string): string {
  const segments = worktreePath.split(/[/\\]+/).filter(s => s.length > 0)
  return segments.length === 0 ? worktreePath : segments[segments.length - 1]
}

/** Strip the `refs/heads/` prefix git's porcelain output carries. */
export function getShortBranchName(branch: string | null): string | null {
  return branch === null ? null : branch.replace(/^refs\/heads\//, '')
}

/** Everything the app knows about a worktree beyond what git's listing says. */
export interface IAgentSessionOverlay {
  readonly agent?: CodingAgentId
  readonly runState?: IAgentSession['runState']
  readonly errorMessage?: string | null
  readonly diffStat?: IAgentSession['diffStat']
  readonly editedFileCount?: number | null
  readonly lastActivityAt?: number | null
}

/**
 * Project a git worktree entry, plus whatever live agent state the app has
 * observed for it, into one fleet session. A worktree with no observed agent
 * state is still a session — the panel exists so every worktree is visible,
 * not only the ones an agent happens to be running in.
 */
export function toAgentSession(
  entry: WorktreeEntry,
  overlay: IAgentSessionOverlay = {}
): IAgentSession {
  return {
    path: entry.path,
    name: getWorktreeDisplayName(entry.path),
    branch: getShortBranchName(entry.branch),
    head: entry.head,
    isMainWorktree: entry.type === 'main',
    isLocked: entry.isLocked,
    isMissing: entry.isPrunable,
    agent: overlay.agent ?? 'none',
    runState: overlay.runState ?? 'idle',
    errorMessage: overlay.errorMessage ?? null,
    diffStat: overlay.diffStat ?? null,
    editedFileCount: overlay.editedFileCount ?? null,
    lastActivityAt: overlay.lastActivityAt ?? null,
  }
}

/** A session paired with the chip the fleet renders for it. */
export interface IAgentSessionRow {
  readonly session: IAgentSession
  readonly chip: IAgentSessionChip
}

function compareSessions(a: IAgentSessionRow, b: IAgentSessionRow): number {
  // The main worktree is the repository itself rather than an agent session
  // someone created, so it holds the top slot instead of being shuffled around
  // by whatever an agent happened to do a moment ago.
  if (a.session.isMainWorktree !== b.session.isMainWorktree) {
    return a.session.isMainWorktree ? -1 : 1
  }

  const attention =
    AgentSessionChipAttention[a.chip.kind] -
    AgentSessionChipAttention[b.chip.kind]
  if (attention !== 0) {
    return attention
  }

  const activityA = a.session.lastActivityAt
  const activityB = b.session.lastActivityAt
  if (activityA !== activityB) {
    // Never-seen sessions sort after ones with a timestamp, newest first.
    if (activityA === null) {
      return 1
    }
    if (activityB === null) {
      return -1
    }
    return activityB - activityA
  }

  const byName = a.session.name.localeCompare(b.session.name, undefined, {
    sensitivity: 'base',
  })
  // Fall back to the path so two worktrees whose directories share a name in
  // different parents keep a stable, reproducible order.
  return byName !== 0 ? byName : a.session.path.localeCompare(b.session.path)
}

/**
 * Order the fleet so the sessions that need a person come first: the main
 * worktree, then errors, then running agents, then changed worktrees, then
 * quiet ones — recency breaking ties inside each tier.
 */
export function buildAgentSessionFleet(
  sessions: ReadonlyArray<IAgentSession>,
  languageMode: LanguageMode = 'english'
): ReadonlyArray<IAgentSessionRow> {
  return sessions
    .map(session => ({
      session,
      chip: deriveAgentSessionChip(session, languageMode),
    }))
    .sort(compareSessions)
}
