import { GitError as DugiteError } from 'dugite'

import { git, GitError } from './core'
import { envForRemoteOperation } from './environment'
import { IRemote } from '../../models/remote'
import { Repository } from '../../models/repository'
import { RemoteBranchPresence } from '../pull-branch-deleted'

/**
 * Whether Git reported the one structured failure that means the current
 * branch's configured upstream ref was not fetched.
 *
 * This is dugite's own classification of Git's diagnostic, not a stderr match
 * of ours, and it is only a candidate signal: `git pull` reports it whenever
 * the ref was not among the fetched refs, which a deleted upstream causes but
 * does not exclusively cause. The remote is asked directly before anything is
 * offered to the user.
 */
export function isMissingRemoteRefFailure(error: unknown): boolean {
  return (
    error instanceof GitError &&
    error.result.gitError === DugiteError.NoExistingRemoteBranch
  )
}

/**
 * Reject anything that is not a plain, safely quotable branch name before it
 * reaches a Git argument list.
 *
 * A leading dash would be read as an option, and the remaining characters are
 * the ones `git check-ref-format` rejects for a single ref component anyway.
 * An unusual but legal name is reported as unprobeable rather than being
 * passed through, because the caller treats "could not ask" as "do not offer".
 */
export function isProbeableBranchName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !name.startsWith('-') &&
    !name.startsWith('/') &&
    !name.startsWith('.') &&
    !name.endsWith('/') &&
    !name.endsWith('.') &&
    !name.endsWith('.lock') &&
    !name.includes('..') &&
    !name.includes('//') &&
    !name.includes('@{') &&
    // eslint-disable-next-line no-control-regex
    !/[\x00-\x20\x7f~^:?*[\]\\]/.test(name)
  )
}

/**
 * Ask a remote directly whether it still advertises a branch head.
 *
 * This is the load-bearing half of deleted-upstream detection: Git's own
 * failure text only tells us the ref was not fetched, while `ls-remote` tells
 * us what the remote actually has right now. The probe runs as a background
 * task so a missing or refused credential fails closed and never raises a
 * credential prompt on the back of a failed pull.
 *
 * Any failure to reach or authenticate with the remote returns
 * `indeterminate`. Callers must not read that as "deleted".
 */
export async function probeRemoteBranch(
  repository: Repository,
  remote: IRemote,
  branchName: string,
  accountKey?: string
): Promise<RemoteBranchPresence> {
  if (!isProbeableBranchName(branchName)) {
    return { kind: 'indeterminate', reason: 'unsupported-branch-name' }
  }

  const ref = `refs/heads/${branchName}`

  try {
    const result = await git(
      ['ls-remote', '--exit-code', '--heads', '--', remote.name, ref],
      repository.path,
      'probeRemoteBranch',
      {
        env: await envForRemoteOperation(remote.url),
        credentialAccountKey: accountKey,
        isBackgroundTask: true,
        // `--exit-code` reports 2 for "connected fine, matched nothing", which
        // is the exact answer we are looking for rather than an error.
        successExitCodes: new Set([0, 2]),
      }
    )

    if (result.exitCode === 2) {
      return { kind: 'absent' }
    }

    const match = result.stdout
      .split(/\r?\n/)
      .map(line => line.split('\t'))
      .find(parts => parts[1] === ref)

    if (match === undefined || !/^[0-9a-fA-F]{40,64}$/.test(match[0])) {
      return { kind: 'absent' }
    }

    return { kind: 'present', sha: match[0] }
  } catch (error) {
    log.debug(
      `Could not probe '${remote.name}' for branch '${branchName}'`,
      error
    )
    return { kind: 'indeterminate', reason: 'remote-unreachable' }
  }
}
