import { IActionsJob } from '../actions-jobs'
import { IAPIWorkflowRun } from '../api'

const MaxPromptLength = 8_000
const MaxItems = 40

const clean = (value: string): string =>
  value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()

const bounded = (value: string): string =>
  clean(value).slice(0, MaxPromptLength)

export function buildConflictRepairPrompt(args: {
  readonly ourBranch?: string
  readonly theirBranch?: string
  readonly conflictedPaths: ReadonlyArray<string>
}): string {
  const paths = args.conflictedPaths
    .slice(0, MaxItems)
    .map(path => `- ${clean(path)}`)
  return bounded(`Resolve the current Git merge conflicts in this repository.

Branches: ours=${clean(args.ourBranch ?? 'current branch')}; theirs=${clean(
    args.theirBranch ?? 'incoming branch'
  )}.
Conflicted files:
${paths.join('\n')}

Inspect both sides and surrounding code, preserve intended behavior, make the smallest safe edits, and remove every conflict marker. Run focused checks that cover the edited files. Do not commit, push, change branches, discard unrelated work, or contact external services. Stop after the working tree contains the reviewed local resolution and report exactly what remains unresolved.`)
}

export const PaletteConflictRepairPrompt = buildConflictRepairPrompt({
  conflictedPaths: [],
})

export const PaletteCloudCiRepairPrompt =
  bounded(`Inspect this repository's cloud CI workflows and the most recent locally available failure evidence. Reproduce the failure locally where possible, make the smallest safe fix, and run focused verification.

Do not commit, push, dispatch or rerun cloud workflows, change branches, discard unrelated work, or contact external services. Stop after local verification and report that cloud CI remains unverified until the user pushes.`)

export function buildCloudCiRepairPrompt(
  run: IAPIWorkflowRun,
  jobs: ReadonlyArray<IActionsJob>
): string {
  const failures = jobs
    .filter(job => job.conclusion !== 'success' && job.conclusion !== 'skipped')
    .slice(0, MaxItems)
    .map(job => {
      const steps = job.steps
        .filter(
          step => step.conclusion !== 'success' && step.conclusion !== 'skipped'
        )
        .slice(0, 12)
        .map(step => `${clean(step.name)} (${step.conclusion ?? step.status})`)
      return `- ${clean(job.name)} (${job.conclusion ?? job.status})${
        steps.length > 0 ? `: ${steps.join(', ')}` : ''
      }`
    })

  return bounded(`Repair the local repository so its failed cloud CI run can pass when the user next pushes.

Workflow: ${clean(run.name ?? run.display_title ?? 'Workflow')}
Run: #${run.run_number}
Branch: ${clean(run.head_branch ?? 'detached')}
Event: ${clean(run.event)}
Conclusion: ${clean(run.conclusion ?? run.status ?? 'failure')}
Failed jobs and steps:
${
  failures.length > 0
    ? failures.join('\n')
    : '- Failure details are not loaded; inspect the repository workflow and reproduce locally.'
}

Inspect the workflow and relevant source, reproduce the failure locally where possible, make the smallest safe fix, and run focused verification. Do not commit, push, dispatch or rerun cloud workflows, change branches, discard unrelated work, or contact external services. Stop after local verification and report that cloud CI remains unverified until the user pushes.`)
}
