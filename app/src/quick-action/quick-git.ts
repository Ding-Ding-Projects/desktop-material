import { Repository } from '../models/repository'
import { WorkingDirectoryFileChange } from '../models/status'
import { IRemote } from '../models/remote'
import { getRepositoryType } from '../lib/git/rev-parse'
import { getStatus } from '../lib/git/status'
import { createCommit } from '../lib/git/commit'
import { getRemotes } from '../lib/git/remote'
import { push } from '../lib/git/push'
import { AccountsStore, TokenStore } from '../lib/stores'
import { trampolineServer } from '../lib/trampoline/trampoline-server'
import { TrampolineCommandIdentifier } from '../lib/trampoline/trampoline-command'
import { createAskpassTrampolineHandler } from '../lib/trampoline/trampoline-askpass-handler'
import { createCredentialHelperTrampolineHandler } from '../lib/trampoline/trampoline-credential-helper'
import { QuickCommitPhase, runQuickCommitAndPush } from '../lib/quick-action'

/**
 * The git layer for the quick-action window.
 *
 * This window is its own JS realm, so none of the main renderer's bootstrapping
 * applies to it. In particular the trampoline server — how git asks Desktop for
 * credentials — is a per-realm singleton whose handlers are registered by the
 * main renderer only. Without registering them here a push would fail with an
 * unhelpful "terminal prompts disabled" error, so
 * {@link ensureCredentialHandlers} does that once, lazily, on the first push.
 */

/** Everything the window needs to know about the folder it was opened on. */
export interface IQuickRepositorySnapshot {
  /** Null when the folder is not a regular git working tree. */
  readonly repository: Repository | null
  readonly changedFileCount: number
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly currentBranch: string | undefined
  readonly currentUpstreamBranch: string | undefined
}

/** Probe a folder: is it a repository, on what branch, with what changes. */
export async function loadQuickRepositorySnapshot(
  path: string
): Promise<IQuickRepositorySnapshot> {
  const type = await getRepositoryType(path)

  if (type.kind !== 'regular') {
    return {
      repository: null,
      changedFileCount: 0,
      files: [],
      currentBranch: undefined,
      currentUpstreamBranch: undefined,
    }
  }

  // A negative id marks a repository that was never in the database, so an
  // accidental persist would be obvious rather than silently colliding.
  const repository = new Repository(
    type.topLevelWorkingDirectory,
    -1,
    null,
    false,
    null,
    {},
    false,
    type.gitDir
  )

  const status = await getStatus(repository, true, true)

  return {
    repository,
    changedFileCount: status.workingDirectory.files.length,
    files: status.workingDirectory.files,
    currentBranch: status.currentBranch,
    currentUpstreamBranch: status.currentUpstreamBranch,
  }
}

let credentialHandlersRegistered = false

/**
 * Register the askpass and credential-helper trampoline handlers for this
 * realm. Idempotent, and deferred until a push actually needs it so that the
 * accounts store never delays the window appearing.
 */
function ensureCredentialHandlers() {
  if (credentialHandlersRegistered) {
    return
  }
  credentialHandlersRegistered = true

  const accountsStore = new AccountsStore(localStorage, TokenStore)
  trampolineServer.registerCommandHandler(
    TrampolineCommandIdentifier.AskPass,
    createAskpassTrampolineHandler(accountsStore)
  )
  trampolineServer.registerCommandHandler(
    TrampolineCommandIdentifier.CredentialHelper,
    createCredentialHelperTrampolineHandler(accountsStore)
  )
}

export interface IQuickCommitCallbacks {
  readonly onPhase: (phase: QuickCommitPhase) => void
  readonly onProgress: (description: string) => void
}

/**
 * Commit every change in the working directory and push the current branch.
 *
 * Returns the new commit's abbreviated SHA. Any failure rejects with the git
 * error so the window can show it verbatim rather than paraphrasing it.
 */
export async function commitAndPush(
  snapshot: IQuickRepositorySnapshot,
  summary: string,
  callbacks: IQuickCommitCallbacks
): Promise<string> {
  const { repository } = snapshot

  if (repository === null) {
    throw new Error('This folder is not a repository on a branch.')
  }

  // A thin adapter: the orchestration (phase ordering, remote choice, and what
  // to say when the commit lands but the push cannot) lives in the pure module
  // so it can be tested without a real repository.
  return runQuickCommitAndPush<WorkingDirectoryFileChange, IRemote>(
    snapshot,
    summary,
    {
      createCommit: (message, files) =>
        createCommit(repository, message, files),
      getRemotes: () => getRemotes(repository),
      push: (remote, localBranch, remoteBranch, onProgress) => {
        // Deferred until a push actually needs credentials, so the accounts
        // store never delays the window appearing.
        ensureCredentialHandlers()
        return push(
          repository,
          remote,
          localBranch,
          remoteBranch,
          null,
          undefined,
          progress =>
            // `title` is optional on the progress record, so fall back rather
            // than rendering "undefined" into the live region.
            onProgress(progress.description ?? progress.title ?? 'Pushing…')
        )
      },
    },
    callbacks.onPhase,
    callbacks.onProgress
  )
}
