import {
  INewAgentSessionRequest,
  CodingAgentId,
} from '../../models/agent-session'
import {
  AgentSessionNameCap,
  AgentSessionPromptCap,
  INewAgentSessionProblem,
} from '../../lib/agent-sessions'
import { t } from '../../lib/i18n'

/** Localize one validation fact without weakening the pure validator. */
export function localizeAgentSessionProblem(
  problem: INewAgentSessionProblem,
  request: INewAgentSessionRequest
): string {
  switch (problem.kind) {
    case 'name-empty':
      return t('agentSessions.problem.nameEmpty')
    case 'name-too-long':
      return t('agentSessions.problem.nameTooLong', {
        count: String(AgentSessionNameCap),
      })
    case 'name-separator':
      return t('agentSessions.problem.nameSeparator')
    case 'name-illegal':
      return t('agentSessions.problem.nameIllegal')
    case 'name-reserved':
      return t('agentSessions.problem.nameReserved', {
        name: request.name.trim(),
      })
    case 'name-duplicate-worktree':
      return t('agentSessions.problem.duplicateWorktree', {
        name: request.name.trim(),
      })
    case 'name-duplicate-branch':
      return t('agentSessions.problem.duplicateBranch', {
        name: request.name.trim(),
      })
    case 'base-branch-empty':
      return t('agentSessions.problem.baseEmpty')
    case 'base-branch-unknown':
      return t('agentSessions.problem.baseUnknown', {
        branch: request.baseBranch.trim(),
      })
    case 'agent-unavailable':
      return t('agentSessions.problem.agentUnavailable')
    case 'prompt-empty':
      return t('agentSessions.problem.promptEmpty')
    case 'prompt-too-long':
      return t('agentSessions.problem.promptTooLong', {
        count: String(AgentSessionPromptCap),
      })
  }
}

export function codingAgentDisplayName(agent: CodingAgentId): string {
  switch (agent) {
    case 'none':
      return t('agentSessions.agent.none')
    case 'codex':
      return 'Codex CLI'
    case 'opencode':
      return 'OpenCode'
  }
}
