# Duplicate-open guard

Handing a path to something outside Desktop Material — an external editor, a
terminal, the file manager, or the system default application — spawns a
process, and none of those actions is idempotent. Without a guard, a stuttered
double-click on a changed-file row opens two editor windows, and a repeated
"Show in folder" stacks two Explorer windows on the same file.

## Behavior

Every such trigger claims its target through one renderer-wide guard before the
work starts. A second activation of the *same* target while the first is still
starting is a no-op; different targets remain independent. The claim is released
as soon as the launch settles — on the spawn event or on failure — so a
deliberate repeat afterwards still works, and a failed launch never leaves the
control stuck.

Targets are namespaced by the kind of open, so revealing a file in the file
manager and opening the same file in an editor never block each other. An
explicitly chosen editor (the toolbar's "open in this editor" dropdown) carries
the editor identity in its key, so picking a different editor for the same path
is still honoured.

Double-click-to-open semantics are unchanged: one gesture still produces exactly
one open.

## Configuration

None. The guard is always on and has no user-visible copy or setting.

## Guarded triggers

- Open a file or repository in the configured external editor — changes-list
  rows (double-click and context menu), history file rows, pull-request file
  rows, conflict rows and the conflicts dialog, the diff header button, the
  Changes empty-state suggested action, the repository-list context menu, the
  repository menu item, and the tutorial step.
- Open a repository in a specifically selected external editor.
- Open a repository in the shell, including the "install Git" prompt it can
  raise instead.
- Open a file with the system default application ("Open with default
  program", binary-diff open).
- Reveal a file or folder in the native file manager, including the repository
  working directory, downloaded release assets, downloaded Actions artifacts,
  exported repository archives, and the effective hooks folder.
- Open a downloaded release asset (installer) with the OS.

## Already protected before this guard

- Opening a submodule from a diff has its own in-flight flag.
- The manual Cheap LFS upload handoff is claimed by the commit-message guard,
  which also owns the file-manager reveal it performs.

## Not guarded

- Opening URLs in the browser. Those are a separate, much larger surface and
  are out of this contract.
- Opening a repository in a new application window: the main-process request is
  fire-and-forget, so there is no settle event to release a claim on. Guarding
  it would need an acknowledgement from the main process first.
- The `x-github-client://` deep-link reveal, which is triggered by a protocol
  activation rather than by a control the user can hammer.

## Failure modes

- A launch that fails releases the claim and surfaces the underlying error
  exactly as before; the guard never swallows or rewrites an error.
- A synchronous throw from the guarded work propagates unchanged.
- The guard is state-driven, not timer-driven. An open that never settles keeps
  its target claimed, which is deliberate: re-enabling the control on a timer
  would let a slow launch be started twice.

## Accessibility

Where the trigger is a button, it reports `aria-busy` while its own target is
opening: the diff-header editor button, the conflicts "Open in editor" button,
the Changes empty-state suggested actions, and the "Open file"/"Show in folder"
buttons for downloaded release assets, Actions artifacts, and exported
archives. Context-menu items have no busy state to report; they simply do
nothing on a repeat.

Note that a hyphenated `aria-busy` attribute written on the shared `Button`
component is dropped by React — it has to be passed as the `ariaBusy` prop.

## Verification

`app/test/unit/external-open-guard-test.ts` covers the guard's claim, release,
independence, failure, and subscription semantics, and drives the real
`Dispatcher.openInExternalEditor` and editor launcher against a mocked
`child_process.spawn`: two rapid activations of the same path produce exactly
one spawn, two different paths produce two, and both a settled launch and a
failed launch leave the target openable again.
