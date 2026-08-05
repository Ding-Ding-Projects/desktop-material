/**
 * Prompt construction and response parsing for AI-generated commit-selection
 * summaries ("Explaining N commits").
 *
 * The model is given only the reviewed facts assembled in an
 * {@link IChangeSummaryReview} (author, date, subject, and per-file
 * added/deleted line counts — never full diffs or file contents in this
 * first build) and must return one prose summary plus a per-path change
 * description for every reviewed path. The raw candidate this module parses
 * is untrusted model output: it is never used directly. It must still pass
 * through `createChangeSummaryResult`, which enforces that every
 * reviewed path is covered exactly once and rejects any path the model
 * invented.
 */

import {
  IChangeSummaryReview,
  IChangeSummaryReviewedCommit,
} from './change-summary/change-summary-model'

export class CopilotCommitSummaryValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CopilotCommitSummaryValidationError'
  }
}

export const CommitSummarySystemPrompt = `
Respond ONLY with valid JSON in the format specified below. Do NOT use tools.

You are an expert at explaining a set of Git commits to a developer who did not write them.

You will receive a list of reviewed commits (author, date, subject when known) and, for each,
the files it changed with added/deleted line counts when known. Some facts may be marked
"unavailable" — never guess or invent a value for those facts.

Your job:
1. Write a short plain-language prose summary (2-4 sentences) of what this set of commits does
   as a whole, in terms a developer unfamiliar with the change could follow.
2. For every listed file path, across every commit, write one short plain-language sentence
   describing what changed in that file. If a file appears in multiple commits, describe its
   change across the whole set once.

Rules:
- Do not use markdown formatting (no headers, bullets, backticks, or links) in "summary" or any
  "description" — plain sentences only.
- Every file path given to you must appear exactly once in "changes", using the exact path text
  given to you.
- Do not invent file paths, authors, dates, or line counts that were not given to you.
- Do not repeat secrets, credentials, or tokens even if one appears to be present in the input.

Response format:
{
  "summary": "<2-4 sentence plain-language prose summary of the whole commit set>",
  "changes": [
    { "path": "relative/file/path.ts", "description": "<one plain-language sentence>" }
  ]
}
`

function describeFact(
  fact: { readonly availability: string; readonly value?: unknown } | undefined
): string {
  if (fact === undefined || fact.availability !== 'value') {
    return 'unavailable'
  }
  return String(fact.value)
}

function describeLineFact(fact: {
  readonly availability: string
  readonly value?: number
}): string {
  if (fact.availability === 'value') {
    return String(fact.value)
  }
  if (fact.availability === 'not-applicable') {
    return 'n/a'
  }
  return 'unavailable'
}

function formatCommitForPrompt(commit: IChangeSummaryReviewedCommit): string {
  const lines = [
    `Commit ${commit.commitId}`,
    `  Author: ${describeFact(commit.author)}`,
    `  Date: ${describeFact(commit.authoredAt)}`,
    `  Subject: ${describeFact(commit.subject)}`,
    `  Files:`,
  ]
  for (const file of commit.files) {
    lines.push(
      `    ${file.path} (+${describeLineFact(
        file.addedLines
      )}/-${describeLineFact(file.deletedLines)})`
    )
  }
  return lines.join('\n')
}

/** Build the user-turn prompt for one reviewed commit-summary request. */
export function formatCommitSummaryPromptForReview(
  review: IChangeSummaryReview
): string {
  const commitBlocks = review.commits.map(formatCommitForPrompt).join('\n\n')
  return [
    `Explain the following ${review.commits.length} commit(s).`,
    '',
    commitBlocks,
    '',
    `Every one of the following ${review.reviewedPaths.length} file path(s) must appear exactly once in "changes":`,
    ...review.reviewedPaths.map(path => `- ${path}`),
  ].join('\n')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Untrusted candidate shape this module extracts from the model's raw text.
 * This is intentionally permissive — final trust boundaries are enforced by
 * `createChangeSummaryResult`, which this candidate is later validated
 * against together with the authorization identity the caller attaches.
 */
export interface ICopilotCommitSummaryCandidate {
  readonly summary: string
  readonly changes: ReadonlyArray<{
    readonly path: string
    readonly description: string
  }>
}

/**
 * Parse the model's raw response text into an
 * {@link ICopilotCommitSummaryCandidate}. Throws
 * {@link CopilotCommitSummaryValidationError} on any structurally invalid
 * response. Does not check paths against the review — that happens later, in
 * `createChangeSummaryResult`.
 */
export function parseCopilotCommitSummaryResponse(
  content: string
): ICopilotCommitSummaryCandidate {
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
      parseError = new CopilotCommitSummaryValidationError(
        'Copilot returned invalid JSON for the commit summary'
      )
    }
  }
  if (parseError) {
    throw parseError
  }

  if (!isPlainObject(parsed)) {
    throw new CopilotCommitSummaryValidationError(
      'Copilot returned an invalid commit summary payload: expected an object'
    )
  }

  const { summary, changes } = parsed
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    throw new CopilotCommitSummaryValidationError(
      'Copilot returned an invalid commit summary payload: "summary" must be a non-empty string'
    )
  }
  if (!Array.isArray(changes)) {
    throw new CopilotCommitSummaryValidationError(
      'Copilot returned an invalid commit summary payload: "changes" must be an array'
    )
  }

  const parsedChanges = changes.map(change => {
    if (
      !isPlainObject(change) ||
      typeof change.path !== 'string' ||
      typeof change.description !== 'string' ||
      change.path.trim().length === 0 ||
      change.description.trim().length === 0
    ) {
      throw new CopilotCommitSummaryValidationError(
        'Copilot returned an invalid commit summary payload: each change needs a "path" and "description"'
      )
    }
    return { path: change.path, description: change.description }
  })

  return { summary, changes: parsedChanges }
}
