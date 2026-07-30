import { Branch, BranchType } from '../../models/branch'
import { IRemote } from '../../models/remote'
import { Repository } from '../../models/repository'
import { WorktreeEntry } from '../../models/worktree'
import { git } from '../git'
import { envForRemoteOperation } from '../git/environment'
import { isProbeableBranchName } from '../git/remote-branch-existence'

export const SyncMergeCleanupBranchName = 'main'
export const MaximumSyncMergeCleanupBranches = 100

export type SyncMergeCleanupRemoteOwnership = 'absent' | 'tracked' | 'uncertain'

export interface ISyncMergeCleanupCandidate {
  readonly name: string
  readonly ref: string
  readonly localSha: string
  readonly remoteSha: string | null
  readonly remoteOwnership: SyncMergeCleanupRemoteOwnership
  readonly worktree: WorktreeEntry | null
}

export interface ISyncMergeCleanupRetainedBranch {
  readonly name: string
  readonly detail: string
}

export interface ISyncMergeCleanupPlan {
  readonly candidates: ReadonlyArray<ISyncMergeCleanupCandidate>
  readonly retained: ReadonlyArray<ISyncMergeCleanupRetainedBranch>
  readonly exceedsBranchLimit: boolean
}

/**
 * Build a conservative integration plan from one freshly fetched inventory.
 *
 * A remote branch belongs to a local candidate only when that local branch
 * explicitly tracks the exact remote/name pair. Same-name remote refs without
 * that relationship are ownership-uncertain and are retained. Dirty, locked,
 * detached, or ambiguous linked worktrees are retained as a unit with their
 * branch.
 */
export function planSyncMergeCleanup(
  branches: ReadonlyArray<Branch>,
  worktrees: ReadonlyArray<WorktreeEntry>,
  cleanWorktreePaths: ReadonlySet<string>,
  remoteName: string
): ISyncMergeCleanupPlan {
  const retained: ISyncMergeCleanupRetainedBranch[] = []
  const linkedByBranch = new Map<string, WorktreeEntry[]>()

  for (const worktree of worktrees.filter(item => item.type === 'linked')) {
    if (worktree.branch === null || worktree.isDetached) {
      retained.push({
        name: worktree.path,
        detail: 'Detached linked worktree retained.',
      })
      continue
    }
    const entries = linkedByBranch.get(worktree.branch) ?? []
    entries.push(worktree)
    linkedByBranch.set(worktree.branch, entries)
  }

  const remoteBranches = branches.filter(
    branch =>
      branch.type === BranchType.Remote &&
      branch.remoteName === remoteName &&
      branch.nameWithoutRemote !== SyncMergeCleanupBranchName &&
      branch.nameWithoutRemote !== 'HEAD'
  )
  const remoteByName = new Map(
    remoteBranches.map(branch => [branch.nameWithoutRemote, branch])
  )
  const localBranches = branches.filter(
    branch =>
      branch.type === BranchType.Local &&
      branch.name !== SyncMergeCleanupBranchName
  )
  const localNames = new Set(localBranches.map(branch => branch.name))
  const candidates: ISyncMergeCleanupCandidate[] = []

  for (const branch of localBranches) {
    const linked = linkedByBranch.get(branch.ref) ?? []
    if (linked.length > 1) {
      retained.push({
        name: branch.name,
        detail: 'More than one linked worktree reports this branch.',
      })
      continue
    }

    const worktree = linked[0] ?? null
    if (worktree !== null) {
      if (worktree.isLocked) {
        retained.push({
          name: branch.name,
          detail: 'Locked linked worktree retained.',
        })
        continue
      }
      if (!cleanWorktreePaths.has(worktree.path)) {
        retained.push({
          name: branch.name,
          detail: 'Linked worktree has uncommitted work and was retained.',
        })
        continue
      }
    }

    const remote = remoteByName.get(branch.name) ?? null
    const remoteOwnership: SyncMergeCleanupRemoteOwnership =
      remote === null
        ? 'absent'
        : branch.upstream === `${remoteName}/${branch.name}`
        ? 'tracked'
        : 'uncertain'

    candidates.push({
      name: branch.name,
      ref: branch.ref,
      localSha: branch.tip.sha,
      remoteSha: remote?.tip.sha ?? null,
      remoteOwnership,
      worktree,
    })
  }

  for (const branch of remoteBranches) {
    if (!localNames.has(branch.nameWithoutRemote)) {
      retained.push({
        name: branch.name,
        detail:
          'Remote-only branch retained because no local ownership relationship can be proved.',
      })
    }
  }

  return {
    candidates,
    retained,
    exceedsBranchLimit:
      candidates.length + retained.length > MaximumSyncMergeCleanupBranches,
  }
}

export function buildSyncMergeConflictPrompt(
  candidate: ISyncMergeCleanupCandidate,
  provider: 'Codex' | 'OpenCode'
): string {
  const remoteTip =
    candidate.remoteSha === null
      ? 'There is no reviewed remote tip for this branch.'
      : `The reviewed remote tip is ${candidate.remoteSha}.`
  return [
    `Resolve only the currently active Git merge conflicts while integrating branch ${candidate.name} into main.`,
    `The reviewed local branch tip is ${candidate.localSha}. ${remoteTip}`,
    `Desktop Material selected the configured ${provider} provider for this repository.`,
    '',
    'Edit only the conflicted files needed to preserve the intent of both sides. Run bounded, relevant local checks if useful.',
    'Do not commit, push, fetch, pull, checkout, reset, clean, stash, delete or rename branches, alter remotes, or add/remove/move worktrees.',
    'Leave the repository on main with MERGE_HEAD present and every conflict resolved in the working tree. Desktop Material will revalidate, stage, commit, push, and perform any verified cleanup itself.',
  ].join('\n')
}

export async function readExactRef(
  repositoryOrPath: Repository | string,
  ref: string
): Promise<string | null> {
  const result = await git(
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    typeof repositoryOrPath === 'string'
      ? repositoryOrPath
      : repositoryOrPath.path,
    'syncMergeCleanupReadRef',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  if (result.exitCode !== 0) {
    return null
  }
  const sha = result.stdout.trim().toLowerCase()
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha) ? sha : null
}

export async function isExactAncestor(
  repository: Repository,
  candidateSha: string,
  pushedMainSha: string
): Promise<boolean> {
  const result = await git(
    ['merge-base', '--is-ancestor', candidateSha, pushedMainSha],
    repository.path,
    'syncMergeCleanupProveAncestor',
    { successExitCodes: new Set([0, 1]) }
  )
  return result.exitCode === 0
}

/**
 * Delete one exact remote branch object. `--force-with-lease` is used only as
 * a compare-and-delete guard: a moved branch is retained rather than removed.
 */
export async function deleteRemoteBranchWithLease(
  repository: Repository,
  remote: IRemote,
  branchName: string,
  expectedSha: string,
  accountKey?: string
): Promise<void> {
  const sha = expectedSha.trim().toLowerCase()
  if (
    !isProbeableBranchName(branchName) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)
  ) {
    throw new Error('The reviewed remote branch identity is invalid.')
  }
  const ref = `refs/heads/${branchName}`
  await git(
    ['push', `--force-with-lease=${ref}:${sha}`, remote.name, `:${ref}`],
    repository.path,
    'syncMergeCleanupDeleteRemoteBranch',
    {
      env: await envForRemoteOperation(remote.url),
      credentialAccountKey: accountKey,
      isBackgroundTask: true,
    }
  )
}
