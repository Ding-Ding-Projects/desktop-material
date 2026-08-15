import { BuildRunLogStream } from '../../lib/build-run/types'
import { canonicalAgentSessionPath } from '../../lib/agent-sessions'
import { CodingAgentId } from '../../models/agent-session'

export type AgentSessionConversationRole =
  | 'instruction'
  | 'output'
  | 'error'
  | 'meta'

export type AgentSessionConversationStatus =
  | 'running'
  | 'exited'
  | 'failed'
  | 'cancelled'

export interface IAgentSessionConversationTurn {
  readonly id: number
  readonly role: AgentSessionConversationRole
  readonly text: string
  readonly createdAt: number
}

export interface IAgentSessionConversation {
  readonly operationId: string
  readonly worktreePath: string
  readonly agent: CodingAgentId
  readonly status: AgentSessionConversationStatus
  readonly turns: ReadonlyArray<IAgentSessionConversationTurn>
}

const MaximumConversationTurns = 240
const MaximumTurnLength = 4_000
const conversations = new Map<string, IAgentSessionConversation>()
const operationPaths = new Map<string, string>()
const listeners = new Set<() => void>()
let nextTurnId = 1

function safeTurnText(raw: string): string {
  return raw
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '\ufffd')
    .trim()
    .slice(0, MaximumTurnLength)
}

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeAgentSessionConversations(
  listener: () => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readAgentSessionConversation(
  worktreePath: string
): IAgentSessionConversation | null {
  return conversations.get(canonicalAgentSessionPath(worktreePath)) ?? null
}

export function beginAgentSessionConversation(options: {
  readonly operationId: string
  readonly worktreePath: string
  readonly agent: CodingAgentId
  readonly prompt: string
  readonly createdAt?: number
}): void {
  const pathKey = canonicalAgentSessionPath(options.worktreePath)
  const createdAt = options.createdAt ?? Date.now()
  const instruction = safeTurnText(options.prompt)
  const turns: ReadonlyArray<IAgentSessionConversationTurn> =
    instruction.length === 0
      ? []
      : [
          {
            id: nextTurnId++,
            role: 'instruction',
            text: instruction,
            createdAt,
          },
        ]

  operationPaths.set(options.operationId, pathKey)
  conversations.set(pathKey, {
    operationId: options.operationId,
    worktreePath: options.worktreePath,
    agent: options.agent,
    status: 'running',
    turns,
  })
  emit()
}

export function appendAgentSessionConversationLog(log: {
  readonly operationId: string
  readonly stream: BuildRunLogStream
  readonly text: string
  readonly createdAt?: number
}): boolean {
  const pathKey = operationPaths.get(log.operationId)
  if (pathKey === undefined) {
    return false
  }

  const conversation = conversations.get(pathKey)
  if (
    conversation === undefined ||
    conversation.operationId !== log.operationId
  ) {
    return false
  }

  const createdAt = log.createdAt ?? Date.now()
  const role: AgentSessionConversationRole =
    log.stream === 'stderr'
      ? 'error'
      : log.stream === 'stdout'
      ? 'output'
      : 'meta'
  const appended = log.text
    .split(/\r?\n/)
    .map(safeTurnText)
    .filter(text => text.length > 0)
    .map(text => ({ id: nextTurnId++, role, text, createdAt }))

  if (appended.length === 0) {
    return false
  }

  conversations.set(pathKey, {
    ...conversation,
    turns: [...conversation.turns, ...appended].slice(
      -MaximumConversationTurns
    ),
  })
  emit()
  return true
}

export function finishAgentSessionConversation(
  operationId: string,
  status: Exclude<AgentSessionConversationStatus, 'running'>
): boolean {
  const pathKey = operationPaths.get(operationId)
  if (pathKey === undefined) {
    return false
  }

  operationPaths.delete(operationId)
  const conversation = conversations.get(pathKey)
  if (conversation === undefined || conversation.operationId !== operationId) {
    return false
  }

  conversations.set(pathKey, { ...conversation, status })
  emit()
  return true
}

/** Test seam: conversation data is in-memory only and never enters app storage. */
export function clearAgentSessionConversations(): void {
  conversations.clear()
  operationPaths.clear()
  emit()
}
