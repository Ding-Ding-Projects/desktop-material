import {
  CodingAgentId,
  CodingAgentRunner,
  ICodingAgent,
} from '../../models/agent-session'

/**
 * The coding agents the session creator offers, in the order the picker shows
 * them.
 *
 * Only agents this app can genuinely launch are listed: Codex and opencode,
 * each backed by a real main-process runner (`codex-run-prompt` /
 * `opencode-run-prompt`). `<None>` creates the worktree and runs nothing.
 *
 * An agent whose runner does not exist is not listed at all — a picker entry
 * that silently does nothing is worse than an absent one. The row shape still
 * carries `runner` and `unsupportedReason` so a third agent can be added the
 * day it gains a runner, or listed as explicitly unavailable while one is
 * being built.
 */
export const CodingAgents: ReadonlyArray<ICodingAgent> = [
  {
    id: 'none',
    name: '<None>',
    runner: null,
    unsupportedReason: null,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    runner: 'codex',
    unsupportedReason: null,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    runner: 'opencode',
    unsupportedReason: null,
  },
]

/** What the host detection probes found, per runner. */
export interface IAgentRunnerAvailability {
  readonly codexInstalled: boolean
  readonly codexAuthenticated: boolean
  readonly opencodeInstalled: boolean
  readonly opencodeAuthenticated: boolean
}

/** Detection has not run yet, so no runner-backed agent can be offered. */
export const UnknownAgentRunnerAvailability: IAgentRunnerAvailability = {
  codexInstalled: false,
  codexAuthenticated: false,
  opencodeInstalled: false,
  opencodeAuthenticated: false,
}

interface IAgentRunnerProbe {
  readonly installed: boolean
  readonly authConfigured: boolean
}

/** Preserve both installation and authentication results from host probes. */
export function toAgentRunnerAvailability(
  codex: IAgentRunnerProbe | null,
  opencode: IAgentRunnerProbe | null
): IAgentRunnerAvailability {
  return {
    codexInstalled: codex?.installed === true,
    codexAuthenticated: codex?.authConfigured === true,
    opencodeInstalled: opencode?.installed === true,
    opencodeAuthenticated: opencode?.authConfigured === true,
  }
}

/** One picker row: the agent plus whether it can be chosen, and why not. */
export interface ICodingAgentOption {
  readonly agent: ICodingAgent
  readonly disabled: boolean
  /** A short honest reason, or `null` when the option is selectable. */
  readonly unavailableReason: string | null
}

export function getCodingAgent(id: CodingAgentId): ICodingAgent | undefined {
  return CodingAgents.find(agent => agent.id === id)
}

function isRunnerInstalled(
  runner: CodingAgentRunner,
  availability: IAgentRunnerAvailability
): boolean {
  return runner === 'codex'
    ? availability.codexInstalled
    : availability.opencodeInstalled
}

function isRunnerAuthenticated(
  runner: CodingAgentRunner,
  availability: IAgentRunnerAvailability
): boolean {
  return runner === 'codex'
    ? availability.codexAuthenticated
    : availability.opencodeAuthenticated
}

/**
 * Split the catalog into selectable and unselectable rows for a given host.
 *
 * An agent with no runner is always disabled — nothing on the host could change
 * that. A runner-backed agent stays disabled until both its CLI and
 * authentication are detected; installation and authentication get distinct
 * visible reasons so the user knows which action can make it available.
 */
export function resolveCodingAgentOptions(
  availability: IAgentRunnerAvailability,
  catalog: ReadonlyArray<ICodingAgent> = CodingAgents
): ReadonlyArray<ICodingAgentOption> {
  return catalog.map(agent => {
    if (agent.unsupportedReason !== null) {
      return {
        agent,
        disabled: true,
        unavailableReason: agent.unsupportedReason,
      }
    }

    if (
      agent.runner !== null &&
      !isRunnerInstalled(agent.runner, availability)
    ) {
      return { agent, disabled: true, unavailableReason: 'not detected' }
    }

    if (
      agent.runner !== null &&
      !isRunnerAuthenticated(agent.runner, availability)
    ) {
      return { agent, disabled: true, unavailableReason: 'not authenticated' }
    }

    return { agent, disabled: false, unavailableReason: null }
  })
}

/** The ids a user may actually start a session with on this host. */
export function getSelectableCodingAgentIds(
  availability: IAgentRunnerAvailability,
  catalog: ReadonlyArray<ICodingAgent> = CodingAgents
): ReadonlyArray<CodingAgentId> {
  return resolveCodingAgentOptions(availability, catalog)
    .filter(option => !option.disabled)
    .map(option => option.agent.id)
}

/**
 * The label a picker row shows. The reason is appended to the visible text
 * rather than left to colour or the `disabled` attribute alone, so it reaches
 * a screen-reader user reading the option list.
 */
export function getCodingAgentOptionLabel(option: ICodingAgentOption): string {
  return option.unavailableReason === null
    ? option.agent.name
    : `${option.agent.name} — ${option.unavailableReason}`
}
