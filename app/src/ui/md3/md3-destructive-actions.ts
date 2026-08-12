/**
 * The hand-written inventory of destructive actions that must be gated.
 *
 * This list is deliberately hand-written rather than derived. A conformance
 * test shaped "every gated action is well-formed" passes cleanly on an
 * application that gates nothing at all — it only ever iterates what it finds,
 * so a surface that lost its gate, or never got one, is invisible to it. The
 * assertions in `app/test/unit/md3-destructive-gate-test.ts` iterate THIS array
 * and demand each entry's module actually hosts the shared gate, which is the
 * only direction that can catch an action nobody wired.
 *
 * Adding a destructive or irreversible action to the application means adding
 * it here in the same change. Removing an entry is a deliberate decision, and
 * the test carries its own copy of the expected identifiers so that deleting a
 * row here goes red rather than quietly shrinking the contract.
 */

/** The identifier a gated surface passes to the shared gate as `actionId`. */
export type Md3DestructiveActionId =
  | 'discard-changes'
  | 'discard-selection'
  | 'delete-branch'
  | 'delete-remote-branch'
  | 'delete-tag'
  | 'remove-repository'
  | 'reset-to-commit'
  | 'force-push'
  | 'repository-transfer'
  | 'self-hosted-runner-removal'
  | 'inbox-bulk-delete'
  | 'branches-bulk-delete'
  | 'changes-bulk-discard'
  | 'actions-bulk-cancel'
  | 'agents-bulk-delete'
  | 'history-bulk-revert'
  | 'authenticator-bulk-delete'
  | 'terminal-bulk-close'
  | 'authenticator-secrets-export'

/**
 * Which shape of the shared gate a surface hosts.
 *
 * `overlay` surfaces render `Md3DestructiveGate`, which brings its own scrim,
 * focus trap, Escape handling, emergency exit and confirm button — the anchored
 * presentation the contract prefers.
 *
 * `dialog` surfaces already sit inside the application's `Dialog`, which owns
 * the chrome, the Escape route and focus restoration. They render
 * `Md3DestructiveGateBody`, which is the same two keys, the same slider, the
 * same progress and completion treatment and the same status region, and they
 * hold their own affirmative button disabled until the body reports the gate
 * authorized. Wrapping a `Dialog` in a second modal would produce two nested
 * dialogs and two competing focus traps, which is worse for a keyboard user
 * than either one alone.
 */
export type Md3DestructiveGateHost = 'overlay' | 'dialog'

export interface IMd3DestructiveAction {
  readonly id: Md3DestructiveActionId

  /** Plain English name of the action, used by docs and by test failures. */
  readonly label: string

  /** What the action destroys. Stated as a fact, never as a warning voice. */
  readonly destroys: string

  /** Repository-relative path of the surface that must host the gate. */
  readonly module: string

  readonly host: Md3DestructiveGateHost
}

export const Md3DestructiveActions: ReadonlyArray<IMd3DestructiveAction> = [
  {
    id: 'discard-changes',
    label: 'Discard changes',
    destroys: 'Uncommitted working-directory changes in the selected files.',
    module: 'app/src/ui/discard-changes/discard-changes-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'discard-selection',
    label: 'Discard selected changes',
    destroys: 'The selected lines of an uncommitted diff.',
    module: 'app/src/ui/discard-changes/discard-selection-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'delete-branch',
    label: 'Delete branch',
    destroys: 'A local branch, and optionally the same branch on its remote.',
    module: 'app/src/ui/delete-branch/delete-branch-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'delete-remote-branch',
    label: 'Delete remote branch',
    destroys: 'A branch on the remote that has no local counterpart.',
    module: 'app/src/ui/delete-branch/delete-remote-branch-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'delete-tag',
    label: 'Delete tag',
    destroys: 'A tag, locally and wherever the deletion is pushed.',
    module: 'app/src/ui/delete-tag/delete-tag-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'remove-repository',
    label: 'Remove repository',
    destroys:
      'A repository entry, and optionally the working directory on disk.',
    module: 'app/src/ui/remove-repository/confirm-remove-repository.tsx',
    host: 'dialog',
  },
  {
    id: 'reset-to-commit',
    label: 'Reset to commit',
    destroys: 'Uncommitted changes in the working directory.',
    module: 'app/src/ui/reset/warning-before-reset.tsx',
    host: 'dialog',
  },
  {
    id: 'force-push',
    label: 'Force push',
    destroys: 'The history currently published on the upstream branch.',
    module: 'app/src/ui/rebase/confirm-force-push.tsx',
    host: 'dialog',
  },
  {
    id: 'repository-transfer',
    label: 'Transfer repository',
    destroys:
      'The local origin remote, which is retargeted at the new destination.',
    module: 'app/src/ui/repository-transfer/repository-transfer-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'self-hosted-runner-removal',
    label: 'Remove self-hosted runner',
    destroys:
      'A registered runner, its managed files, and any dedicated WSL distro.',
    module: 'app/src/ui/actions/self-hosted-runner-removal-dialog.tsx',
    host: 'dialog',
  },
  {
    id: 'inbox-bulk-delete',
    label: 'Delete notifications in bulk',
    destroys: 'Every notification in the current selection or filter.',
    module: 'app/src/ui/md3/md3-inbox-view.tsx',
    host: 'overlay',
  },
  {
    id: 'branches-bulk-delete',
    label: 'Delete branches in bulk',
    destroys:
      'Every selected local branch, and any commit reachable only from one.',
    module: 'app/src/ui/md3/md3-branches-view.tsx',
    host: 'overlay',
  },
  {
    id: 'changes-bulk-discard',
    label: 'Discard changed files in bulk',
    destroys:
      'Every working-tree change to the files in scope, which are in no ' +
      'commit and cannot be recovered from this app.',
    module: 'app/src/ui/md3/md3-changes-view.tsx',
    host: 'overlay',
  },
  {
    id: 'actions-bulk-cancel',
    label: 'Cancel workflow runs in bulk',
    destroys:
      'The unfinished work of every selected run, and any partial result a ' +
      'cancelled job would have produced.',
    module: 'app/src/ui/md3/md3-actions-view.tsx',
    host: 'overlay',
  },
  {
    id: 'agents-bulk-delete',
    label: 'Delete agent sessions in bulk',
    destroys:
      'Every selected worktree session, its directory, and any work only it holds.',
    module: 'app/src/ui/md3/md3-agents-view.tsx',
    host: 'overlay',
  },
  {
    id: 'history-bulk-revert',
    label: 'Revert commits in bulk',
    destroys:
      'The effect of every selected commit, by writing one revert commit per ' +
      'commit onto the current branch.',
    module: 'app/src/ui/md3/md3-history-view.tsx',
    host: 'overlay',
  },
  {
    id: 'terminal-bulk-close',
    label: 'Close shell sessions in bulk',
    destroys:
      'Every selected shell, the command running in it, and its scrollback.',
    module: 'app/src/ui/md3/md3-terminal-view.tsx',
    host: 'overlay',
  },
  {
    id: 'authenticator-bulk-delete',
    label: 'Delete authenticator factors in bulk',
    destroys:
      'Registered second factors and their secrets in the credential store.',
    module: 'app/src/ui/md3/md3-authenticator-view.tsx',
    host: 'overlay',
  },
  {
    id: 'authenticator-secrets-export',
    label: 'Export authenticator secrets in the clear',
    destroys:
      'The confidentiality of every exported secret, which the file publishes.',
    module: 'app/src/ui/md3/md3-authenticator-view.tsx',
    host: 'overlay',
  },
]

/** Look an action up by identifier, or throw naming the missing entry. */
export function md3DestructiveAction(
  id: Md3DestructiveActionId
): IMd3DestructiveAction {
  const action = Md3DestructiveActions.find(entry => entry.id === id)
  if (action === undefined) {
    throw new Error(`No destructive action is registered as "${id}".`)
  }
  return action
}
