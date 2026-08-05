/**
 * Prompt construction and response parsing for AI-generated pull request
 * review suggestions ("Suggest a fix" inside the in-app PR review flow,
 * R12/#129). The model is given only the reviewed diff hunk for a single
 * file/line selection — never the rest of the repository — and must return
 * one replacement text for that selection. The raw candidate this module
 * parses is untrusted model output: it is only ever used to prefill the
 * suggestion composer textarea, and still goes through the same
 * `createGitHubPullRequestSuggestionBody` fencing/validation as any
 * human-written suggestion before it can be queued or posted.
 */

export class CopilotPRSuggestionValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CopilotPRSuggestionValidationError'
  }
}

export const PRSuggestionSystemPrompt = `
Respond ONLY with valid JSON in the format specified below. Do NOT use tools.

You are an expert code reviewer proposing one concrete code change as a GitHub pull request
suggestion. You will receive a file path, a unified diff hunk, and the exact line the reviewer
selected within that hunk.

Your job:
1. Decide the smallest reasonable replacement for the reviewer's selected line (or, if a
   contiguous range was selected, all of the selected lines) that addresses an issue visible
   in the given hunk.
2. Return the exact replacement text that should take the place of the selected line(s),
   preserving indentation. Return an empty string if the correct suggestion is to delete the
   line(s).
3. Write one short plain-language sentence explaining the change.

Rules:
- Only use what is visible in the given diff hunk. Do not invent code, symbols, or context
  that was not shown to you.
- Do not use markdown code fences in "replacement" — it must be the literal replacement source
  text only.
- Do not repeat secrets, credentials, or tokens even if one appears to be present in the input.

Response format:
{
  "replacement": "<literal replacement source text, or empty string to suggest deletion>",
  "explanation": "<one plain-language sentence>"
}
`

export interface IPRSuggestionReview {
  readonly path: string
  readonly diffHunk: string
  readonly selectedLine: number
  readonly instruction: string
}

/** Build the user-turn prompt for one reviewed PR-suggestion request. */
export function formatPRSuggestionPromptForReview(
  review: IPRSuggestionReview
): string {
  return [
    `File: ${review.path}`,
    `Reviewer-selected line: ${review.selectedLine}`,
    review.instruction.trim().length > 0
      ? `Reviewer instruction: ${review.instruction.trim()}`
      : 'Reviewer instruction: (none given — use your best judgment)',
    '',
    'Diff hunk:',
    review.diffHunk,
  ].join('\n')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ICopilotPRSuggestionCandidate {
  readonly replacement: string
  readonly explanation: string
}

/**
 * Parse the model's raw response text into an
 * {@link ICopilotPRSuggestionCandidate}. Throws
 * {@link CopilotPRSuggestionValidationError} on any structurally invalid
 * response.
 */
export function parseCopilotPRSuggestionResponse(
  content: string
): ICopilotPRSuggestionCandidate {
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
      parseError = new CopilotPRSuggestionValidationError(
        'Copilot returned invalid JSON for the review suggestion'
      )
    }
  }
  if (parseError) {
    throw parseError
  }

  if (!isPlainObject(parsed)) {
    throw new CopilotPRSuggestionValidationError(
      'Copilot returned an invalid review suggestion payload: expected an object'
    )
  }

  const { replacement, explanation } = parsed
  if (typeof replacement !== 'string') {
    throw new CopilotPRSuggestionValidationError(
      'Copilot returned an invalid review suggestion payload: "replacement" must be a string'
    )
  }
  if (typeof explanation !== 'string' || explanation.trim().length === 0) {
    throw new CopilotPRSuggestionValidationError(
      'Copilot returned an invalid review suggestion payload: "explanation" must be a non-empty string'
    )
  }

  return { replacement, explanation }
}
