import { CodingAgentId } from '../../models/agent-session'
import {
  IAgentRunnerAvailability,
  AgentSessionRunnerExit,
  classifyAgentSessionRunnerExit,
  getCodingAgent,
  toAgentRunnerAvailability,
} from '../../lib/agent-sessions'
import {
  cancelCodex,
  cancelOpencode,
  detectCodex,
  detectOpencode,
  onCodexLog,
  onOpencodeLog,
  runCodexPrompt,
  runOpencodePrompt,
} from '../main-process-proxy'
import {
  appendAgentSessionConversationLog,
  beginAgentSessionConversation,
  finishAgentSessionConversation,
} from './agent-session-conversation'

/**
 * The only module in the Agents panel that talks to the main process. It is
 * kept apart from the components so the panel and every pure engine stay
 * importable — and testable — without Electron.
 */

/**
 * Probe the host for the CLIs behind the runnable agents.
 *
 * A probe that throws is reported as "not installed" rather than propagated: a
 * failed detection and a missing CLI lead the user to the same place, and the
 * panel must still render the fleet either way.
 */
export async function detectAgentRunnerAvailability(): Promise<IAgentRunnerAvailability> {
  const [codex, opencode] = await Promise.all([
    detectCodex().catch(() => null),
    detectOpencode().catch(() => null),
  ])

  return toAgentRunnerAvailability(codex, opencode)
}

export interface IStartAgentSessionRunOptions {
  readonly agent: CodingAgentId
  /**
   * The new worktree's absolute path. It is both the runner's `repoPath` and
   * its `cwd`: a linked worktree is its own working tree, and using it as the
   * root is what keeps the runners' own containment guards meaningful — they
   * clamp the agent to the directory they are handed.
   */
  readonly worktreePath: string
  /** Correlates streamed log lines and cancellation with this run. */
  readonly operationId: string
  /** The user's task, fed to the child over stdin — never as an argv element. */
  readonly prompt: string
  /** Whether the agent may proceed without pausing for command approval. */
  readonly autoApprove: boolean
}

/** What happened when a session's agent was launched. */
export type IStartAgentSessionRunResult =
  | { readonly status: 'skipped' }
  | AgentSessionRunnerExit

/**
 * Launch the chosen agent in a session's worktree.
 *
 * `<None>` is a real, deliberate outcome rather than a failure — it reports
 * `skipped` so the caller can say "worktree created" instead of implying an
 * agent ran.
 */
export async function startAgentSessionRun(
  options: IStartAgentSessionRunOptions
): Promise<IStartAgentSessionRunResult> {
  const runner = getCodingAgent(options.agent)?.runner ?? null
  if (runner === null) {
    return { status: 'skipped' }
  }

  beginAgentSessionConversation({
    operationId: options.operationId,
    worktreePath: options.worktreePath,
    agent: options.agent,
    prompt: options.prompt,
  })

  const disposeLog =
    runner === 'codex'
      ? onCodexLog((_event, log) => appendAgentSessionConversationLog(log))
      : onOpencodeLog((_event, log) => appendAgentSessionConversationLog(log))

  const request = {
    operationId: options.operationId,
    repoPath: options.worktreePath,
    cwd: options.worktreePath,
    autoApprove: options.autoApprove,
    prompt: options.prompt,
  }

  try {
    const result =
      runner === 'codex'
        ? await runCodexPrompt(request)
        : await runOpencodePrompt(request)
    const classified = classifyAgentSessionRunnerExit(result)
    finishAgentSessionConversation(options.operationId, classified.status)
    return classified
  } catch (error) {
    finishAgentSessionConversation(options.operationId, 'failed')
    throw error
  } finally {
    disposeLog()
  }
}

/** Ask a running agent session to stop. */
export async function cancelAgentSessionRun(
  agent: CodingAgentId,
  operationId: string
): Promise<void> {
  const runner = getCodingAgent(agent)?.runner ?? null
  if (runner === 'codex') {
    await cancelCodex(operationId)
  } else if (runner === 'opencode') {
    await cancelOpencode(operationId)
  }
}
