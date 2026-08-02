/**
 * Repository-scoped setup commands for newly created Agent worktrees.
 *
 * A command is deliberately data, never a command line: the renderer stores an
 * allow-listed executable identifier plus individual argv tokens, and the main
 * process validates the same shape again before it resolves an executable.
 */

import * as Path from 'path'

export const AgentSetupCommandsVersion = 1 as const
export const MaximumAgentSetupCommands = 8
export const MaximumAgentSetupArguments = 16
export const MaximumAgentSetupTokenLength = 240
export const MaximumAgentSetupStorageBytes = 32 * 1024

export const AgentSetupExecutableIds = [
  'git',
  'node',
  'python',
  'py',
  'dotnet',
  'cargo',
  'go',
  'java',
] as const

export type AgentSetupExecutableId = typeof AgentSetupExecutableIds[number]

export interface IAgentSetupCommand {
  readonly enabled: boolean
  readonly executable: AgentSetupExecutableId
  readonly args: ReadonlyArray<string>
}

export interface IAgentSetupCommandsDocument {
  readonly version: typeof AgentSetupCommandsVersion
  readonly repositoryIdentity: string
  readonly commands: ReadonlyArray<IAgentSetupCommand>
}

export interface IAgentSetupRunRequest {
  readonly operationId: string
  readonly repositoryPath: string
  readonly branchName: string
  readonly worktreePath: string
  readonly commands: ReadonlyArray<IAgentSetupCommand>
}

export interface IAgentSetupWorktreeExpectation {
  readonly path: string
  readonly branchName: string
}

export interface IAgentSetupWorktreeCandidate {
  readonly path: string
  readonly branch: string | null
  readonly type: 'main' | 'linked'
  readonly isPrunable: boolean
}

/** Match the exact live linked branch a pending setup is allowed to resume. */
export function isExpectedAgentSetupWorktree(
  pending: IAgentSetupWorktreeExpectation,
  worktree: IAgentSetupWorktreeCandidate
): boolean {
  return (
    Path.resolve(worktree.path).toLocaleLowerCase('en-US') ===
      Path.resolve(pending.path).toLocaleLowerCase('en-US') &&
    worktree.type === 'linked' &&
    !worktree.isPrunable &&
    worktree.branch === `refs/heads/${pending.branchName}`
  )
}

export type AgentSetupRunFailureReason =
  | 'invalid-request'
  | 'worktree-unavailable'
  | 'executable-unavailable'
  | 'spawn-failed'
  | 'exit-code'
  | 'timeout'
  | 'output-limit'

export type AgentSetupRunResult =
  | { readonly status: 'succeeded'; readonly completed: number }
  | {
      readonly status: 'cancelled'
      readonly completed: number
      readonly commandIndex: number | null
    }
  | {
      readonly status: 'failed'
      readonly completed: number
      readonly commandIndex: number | null
      readonly reason: AgentSetupRunFailureReason
    }

export type AgentSetupCommandProblemKind =
  | 'too-many-commands'
  | 'invalid-command'
  | 'invalid-executable'
  | 'missing-argument'
  | 'too-many-arguments'
  | 'argument-too-long'
  | 'argument-control-character'
  | 'argument-shell-syntax'
  | 'argument-environment-expansion'
  | 'argument-credential'
  | 'argument-cwd-override'
  | 'argument-command-string'

export interface IAgentSetupCommandProblem {
  readonly kind: AgentSetupCommandProblemKind
  readonly commandIndex?: number
  readonly argumentIndex?: number
}

export interface IAgentSetupCommandStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const StorageKeyPrefix = 'desktop-material-agent-setup-commands-v1:'
const ControlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const ShellSyntax = /[&|<>;`"']/

// JavaScript has no free-spacing regular expressions. Keeping this assembled
// from small literals makes the intended forms easier to audit.
const EnvironmentExpansionParts = [
  /%[^%]+%/,
  /![^!]+!/,
  /\$[A-Za-z_]/,
  /\$\{/,
  /\$\(/,
]

const CredentialKey =
  /(?:^|[-_.=:])(?:token|password|passwd|secret|api[-_]?key|authorization|credential)(?:$|[-_.=:])/i
const CredentialValue =
  /(?:\bBearer\s+\S+|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b|\bxox[baprs]-\S+|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/i
const CredentialUrl = /:\/\/[^\s/@:]+:[^\s/@]+@/

function looksLikeCredential(value: string): boolean {
  const inspected = value.trim()
  return (
    CredentialKey.test(inspected) ||
    CredentialValue.test(inspected) ||
    CredentialUrl.test(inspected)
  )
}

const CwdOverrideByExecutable: Readonly<
  Partial<Record<AgentSetupExecutableId, ReadonlySet<string>>>
> = {
  git: new Set(['--git-dir', '--work-tree', '--namespace']),
  dotnet: new Set(['--working-directory']),
}

const CommandStringFlagsByExecutable: Readonly<
  Partial<Record<AgentSetupExecutableId, ReadonlySet<string>>>
> = {
  git: new Set(['-c', '--exec-path']),
  node: new Set(['-e', '--eval', '-p', '--print']),
  python: new Set(['-c']),
  py: new Set(['-c']),
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAgentSetupExecutableId(
  value: unknown
): value is AgentSetupExecutableId {
  return (
    typeof value === 'string' &&
    (AgentSetupExecutableIds as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Stable repository identity used both in the storage key and the payload.
 * The database id prevents two same-path historical entries from colliding;
 * the canonical Windows path prevents an id copied to another repository from
 * loading. The NUL separator cannot occur in either input.
 */
export function createAgentSetupRepositoryIdentity(
  repositoryId: number,
  repositoryPath: string
): string {
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 0) {
    throw new Error('A non-negative repository id is required.')
  }
  const canonicalPath = repositoryPath
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+$/g, '')
    .toLocaleLowerCase('en-US')
  if (canonicalPath.length === 0 || ControlCharacter.test(canonicalPath)) {
    throw new Error('A valid repository path is required.')
  }
  return `${repositoryId}\0${canonicalPath}`
}

export function agentSetupCommandsStorageKey(
  repositoryIdentity: string
): string {
  return `${StorageKeyPrefix}${encodeURIComponent(repositoryIdentity)}`
}

function hasEnvironmentExpansion(value: string): boolean {
  return EnvironmentExpansionParts.some(pattern => pattern.test(value))
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isCwdOverride(
  executable: AgentSetupExecutableId,
  argument: string
): boolean {
  const normalized = argument.toLocaleLowerCase('en-US')
  if (executable === 'git' && argument.startsWith('-C')) {
    // Git accepts both `-C path` and `-Cpath`.
    return true
  }
  if (executable === 'go' && argument.startsWith('-C')) {
    return true
  }
  const direct = CwdOverrideByExecutable[executable]
  if (direct?.has(normalized) === true) {
    return true
  }
  return [...(direct ?? [])].some(flag => normalized.startsWith(`${flag}=`))
}

function isCommandStringFlag(
  executable: AgentSetupExecutableId,
  argument: string
): boolean {
  const normalized = argument.toLocaleLowerCase('en-US')
  if (
    executable === 'git' &&
    normalized.startsWith('-c') &&
    !argument.startsWith('-C')
  ) {
    // `git -c alias.name=!command name` is a shell-backed command string;
    // attached `-cname=value` forms are rejected as well.
    return true
  }
  if (
    (executable === 'python' || executable === 'py') &&
    argument.startsWith('-c')
  ) {
    return true
  }
  const flags = CommandStringFlagsByExecutable[executable]
  if (flags?.has(normalized) === true) {
    return true
  }
  return [...(flags ?? [])].some(flag => normalized.startsWith(`${flag}=`))
}

export function validateAgentSetupCommands(
  commands: unknown
): ReadonlyArray<IAgentSetupCommandProblem> {
  if (!Array.isArray(commands)) {
    return [{ kind: 'invalid-command' }]
  }
  if (commands.length > MaximumAgentSetupCommands) {
    return [{ kind: 'too-many-commands' }]
  }

  const problems = new Array<IAgentSetupCommandProblem>()
  commands.forEach((candidate, commandIndex) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.enabled !== 'boolean' ||
      !Array.isArray(candidate.args)
    ) {
      problems.push({ kind: 'invalid-command', commandIndex })
      return
    }
    if (!isAgentSetupExecutableId(candidate.executable)) {
      problems.push({ kind: 'invalid-executable', commandIndex })
      return
    }
    const executable = candidate.executable
    if (candidate.args.length === 0) {
      problems.push({ kind: 'missing-argument', commandIndex })
      return
    }
    if (candidate.args.length > MaximumAgentSetupArguments) {
      problems.push({ kind: 'too-many-arguments', commandIndex })
      return
    }

    candidate.args.forEach((argument, argumentIndex) => {
      const location = { commandIndex, argumentIndex }
      if (typeof argument !== 'string' || argument.length === 0) {
        problems.push({ kind: 'missing-argument', ...location })
      } else if (argument.length > MaximumAgentSetupTokenLength) {
        problems.push({ kind: 'argument-too-long', ...location })
      } else if (ControlCharacter.test(argument)) {
        problems.push({ kind: 'argument-control-character', ...location })
      } else if (ShellSyntax.test(argument)) {
        problems.push({ kind: 'argument-shell-syntax', ...location })
      } else if (hasEnvironmentExpansion(argument)) {
        problems.push({ kind: 'argument-environment-expansion', ...location })
      } else if (looksLikeCredential(argument)) {
        problems.push({ kind: 'argument-credential', ...location })
      } else if (isCwdOverride(executable, argument)) {
        problems.push({ kind: 'argument-cwd-override', ...location })
      } else if (isCommandStringFlag(executable, argument)) {
        problems.push({ kind: 'argument-command-string', ...location })
      }
    })
  })
  return problems
}

function cloneCommands(
  commands: ReadonlyArray<IAgentSetupCommand>
): ReadonlyArray<IAgentSetupCommand> {
  return commands.map(command => ({
    enabled: command.enabled,
    executable: command.executable,
    args: [...command.args],
  }))
}

function areCommandsEqual(
  left: IAgentSetupCommand,
  right: IAgentSetupCommand
): boolean {
  return (
    left.enabled === right.enabled &&
    left.executable === right.executable &&
    left.args.length === right.args.length &&
    left.args.every((argument, index) => Object.is(argument, right.args[index]))
  )
}

/**
 * Resume the unchanged successfully completed prefix of a reviewed list. A
 * changed completed row restarts at that row; later edits keep the safe prefix.
 * A malformed snapshot always reruns the whole current list.
 */
export function resumeAgentSetupCommands(
  commands: ReadonlyArray<IAgentSetupCommand>,
  previousCommands: ReadonlyArray<IAgentSetupCommand>,
  nextCommandIndex: number
): ReadonlyArray<IAgentSetupCommand> {
  const mayResume =
    Number.isSafeInteger(nextCommandIndex) &&
    nextCommandIndex >= 0 &&
    nextCommandIndex <= commands.length &&
    nextCommandIndex <= previousCommands.length &&
    validateAgentSetupCommands(commands).length === 0 &&
    validateAgentSetupCommands(previousCommands).length === 0
  let unchangedPrefix = mayResume ? nextCommandIndex : 0
  for (let index = 0; index < unchangedPrefix; index++) {
    if (!areCommandsEqual(commands[index], previousCommands[index])) {
      unchangedPrefix = index
      break
    }
  }
  return cloneCommands(commands).map((command, index) =>
    index < unchangedPrefix ? { ...command, enabled: false } : command
  )
}

function parseDocument(
  raw: string,
  repositoryIdentity: string
): ReadonlyArray<IAgentSetupCommand> | null {
  if (utf8ByteLength(raw) > MaximumAgentSetupStorageBytes) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== AgentSetupCommandsVersion ||
    parsed.repositoryIdentity !== repositoryIdentity ||
    validateAgentSetupCommands(parsed.commands).length > 0
  ) {
    return null
  }
  return cloneCommands(parsed.commands as ReadonlyArray<IAgentSetupCommand>)
}

/** Load only a current, valid document belonging to the requested repository. */
export function loadAgentSetupCommands(
  storage: IAgentSetupCommandStorage,
  repositoryIdentity: string
): ReadonlyArray<IAgentSetupCommand> {
  const key = agentSetupCommandsStorageKey(repositoryIdentity)
  const raw = storage.getItem(key)
  if (raw === null) {
    return []
  }
  const commands = parseDocument(raw, repositoryIdentity)
  if (commands === null) {
    // Invalid and legacy values never remain as a trap for the next load.
    storage.removeItem(key)
    return []
  }
  return commands
}

/** Persist a reviewed, bounded command list for exactly one repository. */
export function saveAgentSetupCommands(
  storage: IAgentSetupCommandStorage,
  repositoryIdentity: string,
  commands: ReadonlyArray<IAgentSetupCommand>
): void {
  const problems = validateAgentSetupCommands(commands)
  if (problems.length > 0) {
    throw new Error(`Invalid Agent setup commands: ${problems[0].kind}`)
  }
  const document: IAgentSetupCommandsDocument = {
    version: AgentSetupCommandsVersion,
    repositoryIdentity,
    commands: cloneCommands(commands),
  }
  const serialized = JSON.stringify(document)
  if (utf8ByteLength(serialized) > MaximumAgentSetupStorageBytes) {
    throw new Error('Agent setup command storage limit exceeded.')
  }
  const key = agentSetupCommandsStorageKey(repositoryIdentity)
  if (commands.length === 0) {
    storage.removeItem(key)
  } else {
    storage.setItem(key, serialized)
  }
}
