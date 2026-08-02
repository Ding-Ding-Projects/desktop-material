import { IOpencodeRunResult } from '../build-run/opencode'

/** A runner process outcome, kept distinct from whether its task succeeded. */
export type AgentSessionRunnerExit =
  | { readonly status: 'exited'; readonly exitCode: 0 }
  | { readonly status: 'failed'; readonly exitCode: number | null }
  | { readonly status: 'cancelled' }

/** Interpret the richer runner metadata for the Agents surface. */
export function classifyAgentSessionRunnerExit(
  result: IOpencodeRunResult
): AgentSessionRunnerExit {
  if (result.cancelled === true) {
    return { status: 'cancelled' }
  }
  if (!result.ok) {
    return { status: 'failed', exitCode: result.code ?? null }
  }

  const exitCode = result.code ?? 0
  return exitCode === 0
    ? { status: 'exited', exitCode: 0 }
    : { status: 'failed', exitCode }
}
