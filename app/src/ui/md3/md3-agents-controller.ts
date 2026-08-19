import { t } from '../../lib/i18n'
import { IAgentSession } from '../../models/agent-session'
import { getCodingAgent } from '../../lib/agent-sessions'
import { IAgentSessionConversation } from '../agent-sessions/agent-session-conversation'
import {
  md3AgentLastInstruction,
  md3AgentSendBlocker,
} from './md3-destination-adapters'

/**
 * What the Agents destination does when somebody presses Send or Resume.
 *
 * The view collects the instruction and `app.tsx` owns the runner and the
 * notifications; this module owns the decision in between — whether the
 * instruction can be delivered at all, which worktree it goes to, and what the
 * refusal says when it cannot. Keeping that here means it can be tested
 * against real `IAgentSession` and transcript objects without a running
 * application, and means the composer's disabled reason and the refusal a
 * caller reports are produced by the same code rather than by two lists of
 * conditions that drift apart.
 *
 * Both actions start a real run: the runners this application drives take
 * their task on stdin at launch and close it, so there is no channel into a
 * child that is already working. "Send" launches the agent on the typed
 * instruction, and "Resume" launches it again on the last one it was given.
 */

/** What a Send or Resume attempt did. */
export type Md3AgentInstructionResult =
  /** A run was launched. `operationId` correlates its logs and cancellation. */
  | {
      readonly kind: 'started'
      readonly operationId: string
      readonly instruction: string
    }
  /** Nothing was launched, and this already-localized sentence says why. */
  | { readonly kind: 'refused'; readonly reason: string }

export interface IMd3AgentsControllerDependencies {
  /** The live session for a worktree path, or `null` when it is gone. */
  readonly sessionFor: (path: string) => IAgentSession | null

  /** That session's recorded transcript, or `null` when none was recorded. */
  readonly conversationFor: (path: string) => IAgentSessionConversation | null

  /** Whether a runner exists for the session's agent on this host. */
  readonly runnerAvailable: (session: IAgentSession) => boolean

  /** A fresh correlation id for one run. */
  readonly newOperationId: () => string

  /**
   * Launch the agent in this session's worktree with this instruction. The
   * caller owns the live store bookkeeping and the completion notification.
   */
  readonly startRun: (
    session: IAgentSession,
    instruction: string,
    operationId: string
  ) => void
}

export class Md3AgentsController {
  public constructor(
    private readonly dependencies: IMd3AgentsControllerDependencies
  ) {}

  /**
   * Run `instruction` in the session at `path`.
   *
   * Every refusal names the real condition rather than failing silently: a
   * blank instruction, a worktree that has gone missing, an agent that is
   * already working, or a runner that is not installed.
   */
  public sendInstruction(
    path: string,
    instruction: string
  ): Md3AgentInstructionResult {
    const session = this.dependencies.sessionFor(path)
    if (session === null) {
      return { kind: 'refused', reason: t('md3.adapters.agent.missing') }
    }

    const trimmed = instruction.trim()
    if (trimmed.length === 0) {
      return { kind: 'refused', reason: t('md3.agents.nothingToSend') }
    }

    const blocker = md3AgentSendBlocker(
      session,
      this.dependencies.runnerAvailable
    )
    if (blocker !== null) {
      return { kind: 'refused', reason: blocker }
    }

    const operationId = this.dependencies.newOperationId()
    this.dependencies.startRun(session, trimmed, operationId)
    return { kind: 'started', operationId, instruction: trimmed }
  }

  /**
   * Run the session's last recorded instruction again.
   *
   * A session with no instruction on record has nothing to resume, and says so
   * rather than launching an agent with an empty task — which is the one thing
   * these runners treat as "do whatever you like in this worktree".
   */
  public resumeSession(path: string): Md3AgentInstructionResult {
    const session = this.dependencies.sessionFor(path)
    if (session === null) {
      return { kind: 'refused', reason: t('md3.adapters.agent.missing') }
    }

    const instruction = md3AgentLastInstruction(
      this.dependencies.conversationFor(path)
    )
    if (instruction === null) {
      return { kind: 'refused', reason: t('md3.adapters.agent.noInstruction') }
    }

    return this.sendInstruction(path, instruction)
  }

  /** The agent's display name, for the notification a caller posts. */
  public agentName(path: string): string {
    const session = this.dependencies.sessionFor(path)
    if (session === null) {
      return ''
    }
    return getCodingAgent(session.agent)?.name ?? session.agent
  }
}
