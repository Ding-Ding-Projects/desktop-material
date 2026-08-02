/**
 * Shared shapes for the Agents panel — the fleet view that shows every coding
 * agent session (one per worktree) at once.
 *
 * These types carry no behaviour so they can be imported from the pure engines
 * in `lib/agent-sessions`, the renderer panel, and unit tests alike without
 * dragging in Electron, React, or git.
 */

/**
 * The coding agents the session creator offers, in picker order.
 *
 * Only agents with a real main-process runner appear here. The union is meant
 * to grow when another agent gains one; an agent that cannot actually be
 * launched never gets an id, so a persisted session can never name one.
 */
export type CodingAgentId = 'none' | 'codex' | 'opencode'

/** The main-process runner that executes an agent. */
export type CodingAgentRunner = 'codex' | 'opencode'

/** One entry in the coding-agent catalog. */
export interface ICodingAgent {
  readonly id: CodingAgentId
  /** The label shown in the picker, e.g. `Claude Code`. */
  readonly name: string
  /**
   * The runner that executes this agent, or `null` when none exists. `null` is
   * also correct for `<None>`, which deliberately runs nothing.
   */
  readonly runner: CodingAgentRunner | null
  /**
   * Why this agent can never run here regardless of what is installed on the
   * host, or `null` when only host detection decides. Every shipped entry sets
   * `null`; the field exists so a future agent whose runner is still being
   * built can be listed honestly rather than silently doing nothing.
   */
  readonly unsupportedReason: string | null
}

/** How a session's underlying work is going right now. */
export type AgentSessionRunState = 'idle' | 'running' | 'error'

/** The change a session has accumulated in its worktree. */
export interface IAgentSessionDiffStat {
  readonly filesChanged: number
  readonly linesAdded: number
  readonly linesDeleted: number
}

/**
 * A single agent session. One session is one worktree, whether or not an agent
 * was ever started in it — the panel's whole point is that every worktree's
 * state is visible without opening any of them.
 */
export interface IAgentSession {
  /** Absolute worktree path. Unique, so it doubles as the session key. */
  readonly path: string
  /** Display name — the worktree directory's base name. */
  readonly name: string
  /** Short branch name, or `null` when the worktree HEAD is detached. */
  readonly branch: string | null
  /** The worktree's HEAD commit SHA. */
  readonly head: string
  /** True for the repository's own worktree rather than a linked one. */
  readonly isMainWorktree: boolean
  readonly isLocked: boolean
  /** True when git still has a record but the directory is gone. */
  readonly isMissing: boolean
  /** The agent this session was created with. */
  readonly agent: CodingAgentId
  readonly runState: AgentSessionRunState
  /** Present only when `runState` is `error`. */
  readonly errorMessage: string | null
  /** `null` when the worktree's diff has not been measured yet. */
  readonly diffStat: IAgentSessionDiffStat | null
  /** Files the running agent has touched so far, when it reports progress. */
  readonly editedFileCount: number | null
  /** Epoch milliseconds of the last observed activity, or `null`. */
  readonly lastActivityAt: number | null
}

/** The chip variants the fleet cards can show, in attention order. */
export type AgentSessionChipKind = 'error' | 'working' | 'diff' | 'clean'

/**
 * The derived status chip for one session. `label` is the terse visible text
 * the screenshots show (`+97`, `Error`, `91`); `accessibleLabel` is the full
 * sentence assistive technology announces, because a colour is not a status.
 */
export interface IAgentSessionChip {
  readonly kind: AgentSessionChipKind
  readonly label: string
  readonly accessibleLabel: string
  /** True when the chip carries the leading status dot (the error state). */
  readonly showsDot: boolean
}

/** What the session creator is asking for. */
export interface INewAgentSessionRequest {
  /** The new worktree's directory name; also seeds the branch name. */
  readonly name: string
  /** The branch (or commit-ish) the new worktree starts from. */
  readonly baseBranch: string
  readonly agent: CodingAgentId
  /**
   * The task handed to the agent over stdin. Ignored — and expected to be
   * empty — when `agent` is `none`, and required otherwise: an agent launched
   * with nothing to do is the silent-no-op the picker exists to prevent.
   */
  readonly prompt: string
}
