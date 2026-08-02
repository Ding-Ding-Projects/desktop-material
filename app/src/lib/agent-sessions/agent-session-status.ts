import {
  AgentSessionChipKind,
  IAgentSession,
  IAgentSessionChip,
} from '../../models/agent-session'

/** Longest error text carried into a chip's accessible name, in characters. */
export const ErrorSummaryCap = 160

/** https://user:token@host/… — the userinfo half of a remote URL. */
const UrlUserInfoPattern = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]*@/gi

/**
 * Credential-shaped text with no surrounding structure to preserve. A git or
 * agent failure is reported verbatim often enough that an error string can
 * carry a token, and the fleet renders every session's error at once — so the
 * summary is scrubbed before it ever reaches the DOM or an announcement.
 */
const SecretPatterns: ReadonlyArray<RegExp> = [
  // Provider-issued tokens with a recognisable prefix.
  /\b(?:gh[pousr]|github_pat|sk|xox[abposr])[_-][A-Za-z0-9_-]{8,}/g,
  // An auth header. The optional scheme is consumed with the credential —
  // stopping at the first token would redact `Bearer` and leave the secret.
  /\b(?:proxy-)?authorization\s*[:=]\s*(?:(?:bearer|basic|token|digest|negotiate)\s+)?\S+/gi,
  // Anything else explicitly named as a secret in a key=value pair.
  /\b(?:access[_-]?token|token|password|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
]

/**
 * Reduce an error to one bounded, credential-free line.
 *
 * Control characters are folded to spaces first so a multi-line git failure
 * cannot break the chip's accessible name into something unreadable.
 */
export function summarizeAgentSessionError(message: string): string {
  let text = message
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(UrlUserInfoPattern, '$1[redacted]@')
  for (const pattern of SecretPatterns) {
    text = text.replace(pattern, '[redacted]')
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > ErrorSummaryCap
    ? `${text.slice(0, ErrorSummaryCap - 1)}…`
    : text
}

/** True when a measured diff stat actually represents a change. */
export function hasAgentSessionChanges(session: IAgentSession): boolean {
  const stat = session.diffStat
  return (
    stat !== null &&
    (stat.filesChanged > 0 || stat.linesAdded > 0 || stat.linesDeleted > 0)
  )
}

function formatDiffLabel(added: number, deleted: number): string {
  const parts: Array<string> = []
  if (added > 0) {
    parts.push(`+${added}`)
  }
  if (deleted > 0) {
    // U+2212 MINUS SIGN, so the deletion count cannot be read as a hyphenated
    // continuation of the addition count at small sizes.
    parts.push(`−${deleted}`)
  }
  return parts.join(' ')
}

function pluralFiles(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

function pluralLines(count: number): string {
  return count === 1 ? '1 line' : `${count} lines`
}

/**
 * Derive the single chip a fleet card shows.
 *
 * Attention wins over detail: a failed session says `Error` even when it also
 * changed files, and a running one says how much it has edited rather than
 * showing a diff stat that is being invalidated as the user reads it. A
 * measured but empty diff is explicitly clean rather than chipless, so
 * "nothing has happened" and "nothing is known yet" stay distinguishable.
 */
export function deriveAgentSessionChip(
  session: IAgentSession
): IAgentSessionChip {
  const where = session.name

  if (session.runState === 'error') {
    const summary =
      session.errorMessage === null
        ? ''
        : summarizeAgentSessionError(session.errorMessage)
    return {
      kind: 'error',
      label: 'Error',
      accessibleLabel:
        summary.length === 0
          ? `${where} failed`
          : `${where} failed: ${summary}`,
      showsDot: true,
    }
  }

  if (session.runState === 'running') {
    const edited = session.editedFileCount
    return {
      kind: 'working',
      label: edited === null ? 'Working' : String(edited),
      accessibleLabel:
        edited === null
          ? `${where} is working`
          : `${where} is working, ${pluralFiles(edited)} edited`,
      showsDot: false,
    }
  }

  const stat = session.diffStat

  if (stat !== null && hasAgentSessionChanges(session)) {
    return {
      kind: 'diff',
      label: formatDiffLabel(stat.linesAdded, stat.linesDeleted),
      accessibleLabel:
        `${where} has ${pluralLines(stat.linesAdded)} added and ` +
        `${pluralLines(stat.linesDeleted)} deleted across ` +
        `${pluralFiles(stat.filesChanged)}`,
      showsDot: false,
    }
  }

  if (stat === null) {
    return {
      kind: 'clean',
      label: 'Not measured',
      accessibleLabel: `${where} has no measured changes yet`,
      showsDot: false,
    }
  }

  return {
    kind: 'clean',
    label: 'No changes',
    accessibleLabel: `${where} has no changes`,
    showsDot: false,
  }
}

/** How loudly a chip asks for attention. Lower sorts first in the fleet. */
export const AgentSessionChipAttention: Readonly<
  Record<AgentSessionChipKind, number>
> = {
  error: 0,
  working: 1,
  diff: 2,
  clean: 3,
}
