import {
  git,
  gitRebaseArguments,
  HookProgress,
  IGitStringExecutionOptions,
  TerminalOutput,
  TerminalOutputCallback,
} from './core'
import { Repository } from '../../models/repository'
import { IPullProgress } from '../../models/progress'
import { PullProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { getConfigValue } from './config'

export interface IPullOptions {
  readonly progressCallback?: (progress: IPullProgress) => void
  readonly onHookProgress?: (progress: HookProgress) => void
  readonly onHookFailure?: (
    hookName: string,
    terminalOutput: TerminalOutput
  ) => Promise<'abort' | 'ignore'>
  readonly onTerminalOutputAvailable?: TerminalOutputCallback
  readonly noVerify?: boolean
  /** Stable account identity to force for this pull. Never a token. */
  readonly accountKey?: string
  /** Explicit reviewed strategy flags which freeze the accepted Git config. */
  readonly strategyArguments?: ReadonlyArray<string>
  /** Last-boundary validation run after arguments/env are prepared. */
  readonly beforeExecute?: () => Promise<void>
}

/**
 * Pull from the specified remote.
 *
 * @param repository - The repository in which the pull should take place
 *
 * @param remote     - The name of the remote that should be pulled from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the pull operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git pull'.
 */
export async function pull(
  repository: Repository,
  remote: IRemote,
  options?: IPullOptions
): Promise<void> {
  await pullFrom(repository, remote, [remote.name], options)
}

/**
 * Pull an already-present, exact commit without fetching the remote again.
 *
 * The caller must validate its preview identity immediately before invoking
 * this function. Using the repository itself as the pull source preserves
 * pull.rebase, pull.ff, hooks, and submodule behavior while preventing a
 * second superproject network fetch from integrating a newer remote tip.
 */
export async function pullToCommit(
  repository: Repository,
  remote: IRemote,
  commitOid: string,
  options?: IPullOptions
): Promise<void> {
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commitOid)) {
    throw new Error('Cannot pull to an invalid commit object ID')
  }

  await pullFrom(repository, remote, ['.', commitOid], options)
}

async function pullFrom(
  repository: Repository,
  remote: IRemote,
  sourceArguments: ReadonlyArray<string>,
  options?: IPullOptions
): Promise<void> {
  let opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(remote.url),
    credentialAccountKey: options?.accountKey,
    // git pull triggers merge or rebase hooks depending on config, instead of
    // trying to check pull.rebase and friends we'll just intercept all possible
    // hooks that could be run as part of a pull operation.
    interceptHooks: [
      'pre-merge-commit',
      'prepare-commit-msg',
      'commit-msg',
      'post-merge',
      'pre-rebase',
      'pre-commit',
      'post-rewrite',
    ],
  }

  if (options?.progressCallback) {
    const title = `Pulling ${remote.name}`
    const kind = 'pull'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new PullProgressParser(),
      progress => {
        // In addition to progress output from the remote end and from
        // git itself, the stderr output from pull contains information
        // about ref updates. We don't need to bring those into the progress
        // stream so we'll just punt on anything we don't know about for now.
        if (progress.kind === 'context') {
          if (!progress.text.startsWith('remote: Counting objects')) {
            return
          }
        }

        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text

        const value = progress.percent

        options?.progressCallback?.({
          kind,
          title,
          description,
          value,
          remote: remote.name,
        })
      }
    )

    // Initial progress
    options.progressCallback({ kind, title, value: 0, remote: remote.name })
  }

  const args = [
    ...gitRebaseArguments(),
    'pull',
    ...(options?.strategyArguments ??
      (await getDefaultPullDivergentBranchArguments(repository))),
    '--recurse-submodules',
    ...(options?.progressCallback ? ['--progress'] : []),
    ...(options?.noVerify ? ['--no-verify'] : []),
    ...sourceArguments,
  ]

  await options?.beforeExecute?.()
  await git(args, repository.path, 'pull', opts)
}

/**
 * Defaults the pull default for divergent paths to try to fast forward and if
 * not perform a merge. Aka uses the flag --ff
 *
 * It checks whether the user has a config set for this already, if so, no need for
 * default.
 */
async function getDefaultPullDivergentBranchArguments(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  try {
    const pullFF = await getConfigValue(repository, 'pull.ff')
    return pullFF !== null ? [] : ['--ff']
  } catch (e) {
    log.error("Couldn't read 'pull.ff' config", e)
  }

  // If there is a failure in checking the config, we still want to use any
  // config and not overwrite the user's set config behavior. This will show the
  // git error if no config is set.
  return []
}
