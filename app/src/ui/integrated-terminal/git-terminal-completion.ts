import { AllowedCustomGitCommands } from '../../lib/custom-git-command'

/**
 * Modest, hand-curated flag suggestions for the Git subcommands people type
 * into the integrated terminal most often. This is intentionally small: it
 * exists to make common flags discoverable, not to mirror `git help` for
 * every subcommand.
 */
const CommonFlagsByCommand: Readonly<Record<string, ReadonlyArray<string>>> = {
  diff: ['--stat', '--cached', '--staged', '--name-only', '--color'],
  log: [
    '--oneline',
    '--graph',
    '--all',
    '--decorate',
    '--stat',
    '-n',
    '--follow',
  ],
  blame: ['--line-porcelain', '-w', '-M', '-C'],
  status: ['--short', '--branch', '--porcelain'],
  branch: ['--all', '--merged', '--no-merged', '-v'],
  show: ['--stat', '--name-only'],
  stash: ['list', 'show', 'pop', 'apply', 'drop'],
  grep: ['-n', '-i', '--count'],
}

const GenericFlags: ReadonlyArray<string> = ['--help']

const SortedGitCommands: ReadonlyArray<string> = [
  ...AllowedCustomGitCommands,
].sort()

export interface IGitTerminalCompletionResult {
  /** The token being completed, e.g. `"sta"` for `"git sta"`. */
  readonly prefix: string
  /** Every candidate matching that prefix, sorted alphabetically. */
  readonly candidates: ReadonlyArray<string>
  /**
   * The token index within the tokenized input, used by the caller to know
   * whether the completion replaces the Git subcommand or a later argument.
   */
  readonly tokenIndex: number
}

/** Split an in-progress input line the same forgiving way a shell prompt would. */
function tokenizeForCompletion(line: string): {
  readonly tokens: ReadonlyArray<string>
  readonly trailingSpace: boolean
} {
  const tokens = line.length === 0 ? [] : line.split(/\s+/).filter(Boolean)
  return { tokens, trailingSpace: /\s$/.test(line) }
}

/**
 * Compute Git subcommand/flag completions for the current terminal input
 * line. Never touches the filesystem or the network: candidates come only
 * from the fixed allowlist used to validate real command execution and a
 * small static flag table, so a suggestion can never imply a capability the
 * runner would reject.
 */
export function completeGitTerminalInput(
  line: string
): IGitTerminalCompletionResult {
  const { tokens, trailingSpace } = tokenizeForCompletion(line)
  const leading = tokens[0] === 'git' ? 1 : 0

  if (
    tokens.length - leading <= 0 ||
    (tokens.length - leading === 1 && !trailingSpace)
  ) {
    // Completing the Git subcommand itself (the first real token).
    const prefix = trailingSpace ? '' : tokens[leading] ?? ''
    return {
      prefix,
      candidates: SortedGitCommands.filter(command =>
        command.startsWith(prefix)
      ),
      tokenIndex: leading,
    }
  }

  const command = tokens[leading]
  const flagTable = [...(CommonFlagsByCommand[command] ?? []), ...GenericFlags]
  const lastIndex = tokens.length - 1
  const prefix = trailingSpace ? '' : tokens[lastIndex] ?? ''
  return {
    prefix,
    candidates: flagTable.filter(flag => flag.startsWith(prefix)).sort(),
    tokenIndex: trailingSpace ? tokens.length : lastIndex,
  }
}

/**
 * Apply a chosen completion to the input line, replacing only the token that
 * was being completed. Returns the original line unchanged if the candidate
 * does not actually extend the current prefix (defensive against a stale
 * completion request racing ahead of newer keystrokes).
 */
export function applyGitTerminalCompletion(
  line: string,
  result: IGitTerminalCompletionResult,
  candidate: string
): string {
  if (!candidate.startsWith(result.prefix)) {
    return line
  }
  const { tokens, trailingSpace } = tokenizeForCompletion(line)
  const nextTokens = [...tokens]
  if (trailingSpace || result.tokenIndex >= tokens.length) {
    nextTokens[result.tokenIndex] = candidate
  } else {
    nextTokens[result.tokenIndex] = candidate
  }
  return nextTokens.slice(0, result.tokenIndex + 1).join(' ') + ' '
}
