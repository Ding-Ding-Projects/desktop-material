import { Repository } from '../../models/repository'
import { getBooleanConfigValue, getConfigValue } from './config'

/** The normalized values understood by Git's pull rebase parser. */
export type PullRebaseMode = 'false' | 'true' | 'merges' | 'interactive'

/** The normalized fast-forward policy Desktop passes to Git. */
export type PullFFMode = 'ff' | 'no-ff' | 'ff-only'

/** The user-visible result expected from a pull with incoming commits. */
export type PullStrategyOutcome =
  | 'fast-forward'
  | 'merge'
  | 'rebase'
  | 'rebase-merges'
  | 'rebase-interactive'
  | 'fast-forward-only-blocked'

export type PullStrategyErrorCode =
  | 'invalid-config'
  | 'invalid-branch-ref'
  | 'invalid-topology'

/** A fail-closed pull strategy error suitable for mapping to localized UI. */
export class PullStrategyError extends Error {
  public constructor(
    public readonly code: PullStrategyErrorCode,
    public readonly configKey?: string,
    public readonly configValue?: string
  ) {
    const configDetail =
      configKey === undefined
        ? ''
        : ` (${configKey}=${configValue ?? '<unreadable>'})`
    super(`Unable to resolve pull strategy: ${code}${configDetail}`)
    this.name = 'PullStrategyError'
  }
}

/** The effective Git configuration after applying branch-level precedence. */
export interface IPullStrategyConfiguration {
  readonly rebase: PullRebaseMode
  readonly ff: PullFFMode
}

/** A configuration snapshot resolved against one ahead/behind topology. */
export interface IPullStrategyPlan extends IPullStrategyConfiguration {
  readonly ahead: number
  readonly behind: number
  readonly outcome: PullStrategyOutcome | null
  readonly canIntegrate: boolean

  /** Explicit arguments which prevent later pull config from changing intent. */
  readonly strategyArguments: ReadonlyArray<string>
}

async function readConfigValue(
  repository: Repository,
  key: string
): Promise<string | null> {
  try {
    return await getConfigValue(repository, key)
  } catch {
    throw new PullStrategyError('invalid-config', key)
  }
}

async function readBooleanConfigValue(
  repository: Repository,
  key: string,
  rawValue: string
): Promise<boolean> {
  try {
    const value = await getBooleanConfigValue(repository, key)

    // The value disappeared between the raw and typed reads. Treat the
    // snapshot as invalid instead of silently choosing a different default.
    if (value === null) {
      throw new PullStrategyError('invalid-config', key, rawValue)
    }

    return value
  } catch (error) {
    if (error instanceof PullStrategyError) {
      throw error
    }
    throw new PullStrategyError('invalid-config', key, rawValue)
  }
}

async function readRebaseMode(
  repository: Repository,
  key: string
): Promise<PullRebaseMode | null> {
  const value = await readConfigValue(repository, key)
  if (value === null) {
    return null
  }

  // Git treats these values as case-sensitive additions to its ordinary
  // boolean parser. The short aliases are normalized for stable comparison.
  if (value === 'merges' || value === 'm') {
    return 'merges'
  }
  if (value === 'interactive' || value === 'i') {
    return 'interactive'
  }

  return (await readBooleanConfigValue(repository, key, value))
    ? 'true'
    : 'false'
}

async function readFFMode(repository: Repository): Promise<PullFFMode> {
  const key = 'pull.ff'
  const value = await readConfigValue(repository, key)

  // Desktop deliberately supplies --ff when pull.ff is absent, preserving its
  // established merge-on-divergence behavior across bundled Git versions.
  if (value === null) {
    return 'ff'
  }
  if (value === 'only') {
    return 'ff-only'
  }

  return (await readBooleanConfigValue(repository, key, value)) ? 'ff' : 'no-ff'
}

function branchNameFromRef(currentBranchRef: string): string {
  const prefix = 'refs/heads/'
  if (!currentBranchRef.startsWith(prefix)) {
    throw new PullStrategyError('invalid-branch-ref')
  }

  const branchName = currentBranchRef.slice(prefix.length)
  if (branchName.length === 0) {
    throw new PullStrategyError('invalid-branch-ref')
  }

  return branchName
}

/**
 * Resolve Git's effective pull configuration for the reviewed local branch.
 *
 * Git gives branch.<name>.rebase precedence over pull.rebase. When neither is
 * present it merges. pull.ff defaults to Desktop's explicit --ff behavior.
 */
export async function getPullStrategyConfiguration(
  repository: Repository,
  currentBranchRef: string
): Promise<IPullStrategyConfiguration> {
  const branchName = branchNameFromRef(currentBranchRef)
  const branchRebaseKey = `branch.${branchName}.rebase`
  const branchRebase = await readRebaseMode(repository, branchRebaseKey)
  const rebase =
    branchRebase ?? (await readRebaseMode(repository, 'pull.rebase')) ?? 'false'
  const ff = await readFFMode(repository)

  return { rebase, ff }
}

/**
 * Return explicit pull arguments which freeze the normalized configuration.
 *
 * Configured ff-only takes precedence over configured rebase in Git. For all
 * other rebase plans an explicit --ff neutralizes a later pull.ff change; Git
 * ignores --no-ff while rebasing and fast-forwards when no replay is needed.
 */
export function getFrozenPullStrategyArguments(
  configuration: IPullStrategyConfiguration
): ReadonlyArray<string> {
  if (configuration.ff === 'ff-only') {
    return ['--no-rebase', '--ff-only']
  }

  if (configuration.rebase !== 'false') {
    return [`--rebase=${configuration.rebase}`, '--ff']
  }

  return ['--no-rebase', configuration.ff === 'no-ff' ? '--no-ff' : '--ff']
}

function assertTopology(ahead: number, behind: number): void {
  if (
    !Number.isSafeInteger(ahead) ||
    !Number.isSafeInteger(behind) ||
    ahead < 0 ||
    behind < 0
  ) {
    throw new PullStrategyError('invalid-topology')
  }
}

function getOutcome(
  configuration: IPullStrategyConfiguration,
  ahead: number,
  behind: number
): PullStrategyOutcome | null {
  if (behind === 0) {
    return null
  }

  // Git applies configured ff-only before configured rebase.
  if (configuration.ff === 'ff-only') {
    return ahead === 0 ? 'fast-forward' : 'fast-forward-only-blocked'
  }

  if (configuration.rebase !== 'false') {
    if (ahead === 0) {
      return 'fast-forward'
    }

    switch (configuration.rebase) {
      case 'true':
        return 'rebase'
      case 'merges':
        return 'rebase-merges'
      case 'interactive':
        return 'rebase-interactive'
    }
  }

  if (ahead === 0 && configuration.ff === 'ff') {
    return 'fast-forward'
  }

  return 'merge'
}

/** Resolve a normalized configuration against a captured branch topology. */
export function createPullStrategyPlan(
  configuration: IPullStrategyConfiguration,
  ahead: number,
  behind: number
): IPullStrategyPlan {
  assertTopology(ahead, behind)

  const outcome = getOutcome(configuration, ahead, behind)
  return {
    ...configuration,
    ahead,
    behind,
    outcome,
    canIntegrate: behind > 0 && outcome !== 'fast-forward-only-blocked',
    strategyArguments: getFrozenPullStrategyArguments(configuration),
  }
}

/** Read configuration and build a plan for one captured pull preview. */
export async function getPullStrategyPlan(
  repository: Repository,
  currentBranchRef: string,
  ahead: number,
  behind: number
): Promise<IPullStrategyPlan> {
  const configuration = await getPullStrategyConfiguration(
    repository,
    currentBranchRef
  )
  return createPullStrategyPlan(configuration, ahead, behind)
}

/** Compare the complete semantic identity of two resolved strategy plans. */
export function pullStrategyPlansEqual(
  left: IPullStrategyPlan,
  right: IPullStrategyPlan
): boolean {
  return (
    left.rebase === right.rebase &&
    left.ff === right.ff &&
    left.ahead === right.ahead &&
    left.behind === right.behind &&
    left.outcome === right.outcome &&
    left.canIntegrate === right.canIntegrate
  )
}
