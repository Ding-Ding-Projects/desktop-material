/**
 * Request/response shapes for "compose commits with AI" — asking an AI
 * provider to propose an {@link IInteractiveRebasePlan} for a reviewed
 * set of commits (an existing range, or a squash of uncommitted WIP into
 * one interim commit before review).
 *
 * Follows the same conventions as `copilot-conflict-resolution.ts`: a fixed
 * system prompt, a JSON response contract, and a defensive parser that
 * accepts markdown-fenced or raw JSON and never trusts model output beyond
 * what {@link createInteractiveRebasePlan} independently validates.
 *
 * This module has no Git, SDK, IPC, process, or network capability of its
 * own — it only builds the prompt text and parses/validates the response.
 * The actual model call lives in `CopilotStore.proposeComposeCommitsPlan`,
 * gated the same way every other AI feature in this app is gated.
 */

import isPlainObject from 'lodash/isPlainObject'
import {
  createInteractiveRebasePlan,
  IInteractiveRebaseAllowedCommit,
  IInteractiveRebasePlan,
  IInteractiveRebasePlanEntryInput,
  InteractiveRebaseAction,
  InteractiveRebaseActions,
  MaximumInteractiveRebaseCommits,
} from './interactive-rebase-plan'

/** One reviewed commit handed to the model, metadata only — no diffs. */
export interface IComposeCommitsSourceCommit {
  readonly commitId: string
  readonly subject: string
  readonly body: string
}

export class ComposeCommitsWithAIValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ComposeCommitsWithAIValidationError'
  }
}

/**
 * System prompt for the "compose commits with AI" request. The model is
 * asked to reorganize a reviewed commit set into a rebase todo — it never
 * sees file contents or diffs, only commit metadata, so it can only
 * reorder/relabel commits it was already shown, never invent content.
 */
export const ComposeCommitsWithAISystemPrompt = `
Respond ONLY with valid JSON in the format specified below. Do NOT use tools.

You are an expert at Git history hygiene. You will be given an ordered list of commits (oldest first) with their subject and body text only — no diffs or file contents.

Your job: propose a cleaner, more reviewable history covering the SAME set of commits.

You may:
- Reorder commits (group related work together)
- Mark a commit "squash" or "fixup" to fold it into the nearest preceding commit you keep as "pick" or "reword" (squash keeps its message for the author to edit; fixup discards it)
- Mark a commit "reword" when its subject should change but its content should not
- Mark a commit "drop" only when it is truly redundant with another commit in the set (e.g. an exact revert pair) — never drop a commit just because it looks unimportant
- Leave a commit as "pick" unchanged

Rules:
- Every commit id given to you must appear EXACTLY ONCE in your response
- Never invent a commit id that was not given to you
- A "squash" or "fixup" entry must have at least one earlier non-dropped entry in your output order to fold into
- Prefer the smallest change that produces a materially cleaner history — do not reorder or fold commits without a real reason
- For each entry, briefly explain your reasoning in "reasoning" (terse, 1 sentence)

Response format:
{
  "summary": "1-2 sentence overview of how you reorganized the history and why",
  "entries": [
    { "commitId": "<full commit id from the input, unchanged>", "action": "pick" | "reword" | "squash" | "fixup" | "drop", "reasoning": "why" }
  ]
}
`

function normalizeLLMCommitId(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Build the user-turn prompt: the ordered, reviewed commit set the model is
 * authorized to plan over. Deliberately includes only commit ids, subjects,
 * and bodies — no diffs, no file paths, no file contents.
 */
export function buildComposeCommitsPrompt(
  commits: ReadonlyArray<IComposeCommitsSourceCommit>
): string {
  const lines = commits.map((commit, index) => {
    const body = commit.body.trim()
    return [
      `Commit ${index + 1} of ${commits.length}`,
      `id: ${commit.commitId}`,
      `subject: ${commit.subject}`,
      body.length > 0 ? `body:\n${body}` : 'body: (none)',
    ].join('\n')
  })

  return [
    'Reorganize the following commits (oldest first) into a cleaner history.',
    '',
    lines.join('\n\n'),
  ].join('\n')
}

interface IParsedComposeCommitsEntry {
  readonly commitId: string
  readonly action: InteractiveRebaseAction
  readonly reasoning: string
}

/**
 * Parse the raw model response text into validated entries, matched back to
 * the exact reviewed commit set. Never trusts subjects from the model — the
 * plan's subjects always come from the caller's own reviewed commit data,
 * consistent with how {@link createInteractiveRebasePlan} is used elsewhere.
 */
function parseRawComposeCommitsResponse(content: string): {
  readonly summary: string | null
  readonly entries: ReadonlyArray<IParsedComposeCommitsEntry>
} {
  const nonGreedy =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const greedy =
    content.match(/```json\s*([\s\S]*)```/) ||
    content.match(/```\s*([\s\S]*)```/)

  const candidates: Array<string> = []
  if (nonGreedy) {
    candidates.push(nonGreedy[1].trim())
  }
  if (greedy && greedy[1].trim() !== nonGreedy?.[1]?.trim()) {
    candidates.push(greedy[1].trim())
  }
  candidates.push(content.trim())

  let parsed: unknown
  let parseError: Error | undefined
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate)
      parseError = undefined
      break
    } catch {
      parseError = new ComposeCommitsWithAIValidationError(
        'The AI provider returned invalid JSON for a rebase plan proposal.'
      )
    }
  }
  if (parseError) {
    throw parseError
  }

  if (!isPlainObject(parsed)) {
    throw new ComposeCommitsWithAIValidationError(
      'The AI provider returned an invalid rebase plan payload: expected an object.'
    )
  }

  const obj = parsed as Record<string, unknown>
  const { entries: rawEntries, summary: rawSummary } = obj

  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new ComposeCommitsWithAIValidationError(
      'The AI provider returned an invalid rebase plan payload: "entries" must be a non-empty array.'
    )
  }

  const summary =
    typeof rawSummary === 'string' && rawSummary.trim().length > 0
      ? rawSummary.trim()
      : null

  const entries: Array<IParsedComposeCommitsEntry> = rawEntries.map(
    (entry, index) => {
      if (!isPlainObject(entry)) {
        throw new ComposeCommitsWithAIValidationError(
          `The AI provider's rebase plan entry ${index} is not an object.`
        )
      }
      const { commitId, action, reasoning } = entry as Record<string, unknown>
      if (typeof commitId !== 'string' || commitId.trim().length === 0) {
        throw new ComposeCommitsWithAIValidationError(
          `The AI provider's rebase plan entry ${index} has an invalid commit id.`
        )
      }
      if (
        typeof action !== 'string' ||
        !(InteractiveRebaseActions as ReadonlyArray<string>).includes(action)
      ) {
        throw new ComposeCommitsWithAIValidationError(
          `The AI provider's rebase plan entry ${index} has an invalid action.`
        )
      }
      return {
        commitId: normalizeLLMCommitId(commitId),
        action: action as InteractiveRebaseAction,
        reasoning:
          typeof reasoning === 'string' && reasoning.trim().length > 0
            ? reasoning.trim()
            : '',
      }
    }
  )

  return { summary, entries }
}

/**
 * Parse and validate a complete AI response against the exact reviewed
 * commit set, producing a ready-to-review {@link IInteractiveRebasePlan}.
 *
 * Fails closed: any entry referencing a commit id outside the reviewed set,
 * a missing commit, or a duplicate commit throws rather than silently
 * dropping or guessing. The subject shown to the user always comes from the
 * caller's own reviewed commit data, never from the model's echoed text.
 */
export function parseComposeCommitsPlanResponse(
  content: string,
  allowedCommits: ReadonlyArray<IInteractiveRebaseAllowedCommit>
): { readonly plan: IInteractiveRebasePlan; readonly summary: string | null } {
  if (allowedCommits.length === 0) {
    throw new ComposeCommitsWithAIValidationError(
      'There are no reviewed commits to propose a plan for.'
    )
  }
  if (allowedCommits.length > MaximumInteractiveRebaseCommits) {
    throw new ComposeCommitsWithAIValidationError(
      `AI-composed plans are limited to ${MaximumInteractiveRebaseCommits} commits.`
    )
  }

  const { summary, entries } = parseRawComposeCommitsResponse(content)

  const allowedById = new Map(
    allowedCommits.map(commit => [commit.commitId.toLowerCase(), commit])
  )

  if (entries.length !== allowedCommits.length) {
    throw new ComposeCommitsWithAIValidationError(
      'The AI provider did not return every reviewed commit exactly once.'
    )
  }

  const seen = new Set<string>()
  const planInputs: Array<IInteractiveRebasePlanEntryInput> = entries.map(
    entry => {
      const allowedCommit = allowedById.get(entry.commitId)
      if (allowedCommit === undefined) {
        throw new ComposeCommitsWithAIValidationError(
          'The AI provider referenced a commit that was not part of the reviewed set.'
        )
      }
      if (seen.has(allowedCommit.commitId)) {
        throw new ComposeCommitsWithAIValidationError(
          'The AI provider returned the same commit more than once.'
        )
      }
      seen.add(allowedCommit.commitId)

      return {
        commitId: allowedCommit.commitId,
        action: entry.action,
        subject: allowedCommit.subject,
      }
    }
  )

  if (seen.size !== allowedCommits.length) {
    throw new ComposeCommitsWithAIValidationError(
      'The AI provider did not return every reviewed commit exactly once.'
    )
  }

  return { plan: createInteractiveRebasePlan(planInputs), summary }
}
