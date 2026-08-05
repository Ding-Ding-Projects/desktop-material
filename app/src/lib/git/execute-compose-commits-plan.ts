import { rm, writeFile } from 'fs/promises'

import { Repository } from '../../models/repository'
import { IMultiCommitOperationProgress } from '../../models/progress'
import { getTempFilePath } from '../file-system'
import { git } from './core'
import { rebaseInteractive, RebaseResult } from './rebase'
import {
  IInteractiveRebasePlan,
  serializeInteractiveRebaseTodo,
} from '../interactive-rebase/interactive-rebase-plan'

/**
 * Execute an already-reviewed and confirmed {@link IInteractiveRebasePlan}
 * (from R9 "compose commits with AI", or any future caller of the
 * interactive-rebase editor) as a real `git rebase -i` run.
 *
 * This function performs no confirmation, no pushed-history checking, and
 * no AI call — the caller (`AppStore._executeComposeCommitsPlan`) is
 * responsible for having already shown the confirmation step described in
 * the interactive-rebase editor before calling this.
 *
 * `reword`/`edit` entries do not pause for interactive input here: like the
 * rest of this app's rebase execution, `GIT_EDITOR` is a no-op, so a
 * `reword` entry keeps its original message (behaves like `pick`) and a
 * `squash`/`fixup` run auto-combines messages without an editing prompt.
 * The plan is a real, unmodified `git rebase -i` todo either way.
 */
export async function executeComposeCommitsPlan(
  repository: Repository,
  plan: IInteractiveRebasePlan,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<RebaseResult> {
  const todo = serializeInteractiveRebaseTodo(plan)
  const oldestCommitId = plan.reviewedCommitIds[0]

  const parentResult = await git(
    ['rev-parse', '--verify', `${oldestCommitId}^{commit}^`],
    repository.path,
    'composeCommitsWithAIResolveParent',
    { successExitCodes: new Set([0, 1]), maxBuffer: 4 * 1024 }
  )
  const lastRetainedCommitRef =
    parentResult.exitCode === 0 ? parentResult.stdout.trim() : null

  const todoPath = await getTempFilePath('composeCommitsWithAITodo')
  try {
    await writeFile(todoPath, todo, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })

    return await rebaseInteractive(repository, todoPath, lastRetainedCommitRef, {
      action: 'Compose commits with AI',
      commits: plan.entries.map(entry => ({
        sha: entry.commitId,
        summary: entry.subject,
      })),
      progressCallback,
    })
  } finally {
    await rm(todoPath, { force: true })
  }
}
