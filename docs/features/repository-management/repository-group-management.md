# Custom repository group management

The repository side sheet groups rows under `Pinned`, `Recent`, one heading per
GitHub owner, one per Enterprise host, `Other`, and any **custom** group a user
has invented. A custom group is not a stored record: it exists exactly as long
as at least one repository carries its group label.

That made the group itself impossible to manage directly. Creating one meant
opening **Change group name…** on each repository in turn and spelling the same
name identically every time; taking one apart meant opening **Restore group
name** on each member. There was no rename, and no way to see the group as a
thing you could edit.

This adds the missing surface: a **Group** action in the list's toolbar, a group
actions button on every custom group heading, and one dialog that creates,
renames, re-populates, and dissolves a group.

## Behaviour

### Creating a group

The **Group** button in the repository list's action row opens the dialog with
an empty name and nothing ticked. Name the group, tick the repositories that
belong to it, and confirm. Each ticked repository gets that group label; nothing
else about it changes.

The member picker carries the app's standard search stack — plain text by
default, with substring and regex as explicit opt-ins through the shared
`FilterModeControl` and its full regex builder (RE2JS, never a raw `RegExp` over
user input). Filtering only hides rows: a repository the user already ticked
stays ticked, and the selected count keeps reporting the true total.

### Editing a group

Every custom group heading carries a **Group actions** button beside its
disclosure chevron, reachable by mouse and by keyboard (<kbd>Enter</kbd> or
<kbd>Space</kbd> while it is focused). It offers **Edit group…** and **Remove
group**.

**Edit group…** opens the same dialog with the group's current name and its
current members already ticked. Renaming re-labels every member in one action.
Un-ticking a member clears only that repository's label — a repository that
belongs to a *different* custom group is never touched, even when it is visible
in the picker.

### Removing a group

**Remove group** writes `null` into each member's group label and stops.

This is the whole of "removing a group never removes a repository". The planner
in `app/src/ui/repositories-list/repository-group-actions.ts` produces a list of
`{ repository, groupName }` label writes, and `planRepositoryGroupRemoval` can
only ever produce `groupName: null`. There is no expressible value on that path
that removes a repository from the list, closes it, or touches anything on disk,
which is why the action is not confirmation-gated: it is a label edit, and the
dialog states that in words before the button is pressed.

The result is announced as a polite, non-blocking status line in the list —
"Removed the *X* group. Its *N* repositories stayed in the list." — which
auto-clears. Nothing blocks the list while a group action runs.

### Case folding

Group identity folds case exactly the way `getGroupKey` does, so `Work` and
`work` are one group rather than two. A rename normalizes every member onto the
name the user actually typed.

## Persistence and compatibility

The group label lives on the repository record (`Repository.groupName`) and is
written through the existing reviewed `Dispatcher.changeRepositoryGroupName`
path, so this feature adds no new storage and no migration. A group survives
restart because its members do.

Fold state for the same groups continues to live in the profile's registered
settings (see [Repository list collapsible
groups](repository-list-group-collapse.md)); nothing here writes to a user's own
repository.

## Failure modes and recovery

A blank or whitespace-only group name keeps the dialog's confirm action
disabled. Names are whitespace-collapsed and truncated to 64 characters on
entry.

An invalid regular expression in the member search never empties the picker: the
shared matcher returns every repository untouched alongside the engine's
complaint, so a half-typed expression cannot hide a repository the user is
trying to tick.

If a label write fails, the dialog reports the localized failure notice rather
than claiming success. Removing a group nobody is in plans no writes at all.

## Security considerations

Group names are rendered as text and never interpreted as markup or CSS. User
search patterns are evaluated only through the shared RE2JS-backed matcher, so a
pathological pattern cannot hang the renderer. Nothing on this path reads or
writes inside a user's own repository.

## Localization and accessibility

Every string — the toolbar button, the heading actions button, both menu items,
the dialog's title, intro, labels, hints, counts, and result notices — resolves
through `app/src/lib/i18n-resources.ts` in all three modes: English, playful
Hong Kong-style Cantonese, and compact bilingual. Accessible names stay
single-language so assistive technology announces them once.

The heading actions button is a real `<button>` with `aria-haspopup="menu"` and
a name that includes its group. The member picker is a list of native
checkboxes with visible focus. The result line is a polite live region.

## Verification

- `app/test/unit/repository-group-actions-test.ts` — key parsing, name
  normalization, case-folded membership, and the create/rename/drop/remove
  planners, including the guarantee that removal can only produce `null`.
- `app/test/unit/ui/repository-group-management-test.tsx` — the heading actions
  button appears only on custom groups, opens from the keyboard, routes to the
  dialog popup, and removal clears labels while every repository row stays
  rendered; plus the dialog's create, rename, drop-a-member, remove, search, and
  three-mode localization behaviour.
