# Owner-scoped appearance and history

Desktop Material attaches appearance controls to the element that owns the
setting. `Shift`+right-click, the keyboard Context Menu key, or `Shift+F10`
opens an anchored editor beside the profile, feature, repository, tab,
repository logo or name, or submodule Back control being changed. An ordinary
right-click remains available to its native or component-specific command menu.
The editor exposes that owner's History without routing the edit through a
shared appearance studio.

## The Shift+right-click gesture

A plain right-click belongs to the surface's ordinary context menu. Requiring
`Shift` keeps the appearance editor from claiming right-clicks that a tab
command menu or a repository row menu wanted, which is what it used to do
across the whole shell.

The gesture is defined in exactly one place —
`isAppearanceEditorPointerGesture` in
`app/src/ui/appearance/anchored-appearance-editor.tsx`, re-exported from
`app/src/ui/appearance/index.ts` — so changing it later is one edit. Two
helpers build on it:

- `openAppearanceEditorFromContextMenu(event, open)` opens the editor and
  returns `true` on `Shift`+right-click; on a plain right-click it returns
  `false` without calling `preventDefault()` or `stopPropagation()`, so the
  surface's own menu still runs.
- `isAppearanceEditorFallbackContextMenu(event)` is used only by the shell-wide
  `document` listener in `app.tsx`. Those owners (the toolbar, repository list,
  tab strip, workspace, `[data-dm-feature]` elements) have no other context
  menu, so it also accepts a keyboard-originated context-menu request —
  Chromium reports `button === 0` for the `ContextMenu` key and `Shift+F10`,
  and the macOS `Shift+F10` bridge dispatches a plain `Event` with no `button`
  at all. Without that allowance those editors would become mouse-only.

Surfaces that already own a context menu keep it and gain the shortcut: the
repository tab strip and the tab overflow rows still open the tab command menu
with its **Customize Appearance…** entry, and the repository list still opens
its row menu with the **Customize …** entries. `Shift`+right-click jumps
straight to the editor instead.

The gesture is advertised in **Settings → Appearance**, in the note at the top
of the pane. That copy is localized (`appearance.elementGesture`) and follows
the per-language playfulness sliders; every level names the gesture, what a
plain right-click does instead, and the keyboard route.

## Behavior and configuration

Profile owners configure workspace palettes, update progress, toolbar,
repository-list and tab defaults, diff typography, the submodule Back control,
app identity, and the default repository logo. Repository owners can override
workspace, toolbar, tabs, list name, and logo values; a null override inherits
the matching profile owner. Feature highlights and individual tab titles have
their own stable owner IDs and never share a mutable timeline.

The toolbar owner includes labels and density plus a responsive typography
studio: curated font family, bounded size, safe text color, bold, italic,
underline, strikethrough, small caps, case, spacing, effect, and alignment.
Profile typography can return to theme defaults. Repository typography is a
partial layer, so clearing one field inherits that profile field and clearing
the layer inherits the complete profile style. A live pill preview reflects the
resolved result before the owner-local commit.

Repository Settings → **Appearance** is a discoverable hub over those same five
repository owners, not a second store. Each section renders the exact editor the
anchored surface renders, commits through the same
`setRepositoryAppearanceElement` owner path, and broadcasts the same
invalidation, so an edit made in the dialog and an edit made by
`Shift`+right-clicking the element are indistinguishable — including History, undo,
and restore. There is no staged copy and no separate Save: a change lands in
the owner's dedicated local Git repository immediately. Every section names
whether each value is inherited or repository-owned, shows a bounded live
preview, and offers a Reset that writes the inherited default back to that one
owner. The hub is deliberately repository-scoped: it never writes a profile
owner, so profile defaults stay editable only from their own elements and from
Settings.

The editor applies normalized, schema-checked values to only the selected
owner. Its footer identifies the dedicated local repository, while History can
load commits and diffs, undo or redo the latest change, or restore a selected
revision. Undo, redo, and restore append audit commits instead of resetting or
rewriting successful history. Language mode remains an ordinary profile
preference and is deliberately outside these element histories.

## Persistence

Every owner stores one versioned `setting.json` in an independent local Git
repository below Desktop Material's profile-scoped appearance data root.
Profile, feature, and tab identities are placed in separate owned paths.
Repository owners use the local Git configuration key
`desktop-material.appearance-id`; its UUID keeps the five repository-owned
histories stable when the working copy moves.

The former aggregate appearance value is read only as a migration seed and
bounded startup projection. Owner repositories are authoritative after
initialization. Writes are crash-safe and serialized across renderer activity.
Adjacent synchronous updates to one owner collapse into the latest normalized
value before the durable write and state notification, preventing sliders and
color controls from queuing hundreds of redundant file operations. Queued
`get()` reads, flushes, and history actions close that burst and preserve call
order; separately awaited writes retain sequential behavior. Durable changes
remain coalesced for 250 milliseconds before their owner-local commit.

## Append-only linearity

Every owner repository is one unbroken chain: exactly one branch, HEAD attached
to it, and every commit a single-parent child of the one before it. The panel
renders that chain directly, so anything that forks it shows up as a timeline
that doubles back on itself.

Undo, redo, and restore each sample HEAD before deciding what to replay, so
that commit is reserved as the audit commit's parent. The write is refused if
anything moved HEAD in between, and the commit is verified afterwards to be its
single linear child. An unfinished merge left in the repository is refused
before any append, because it is the only way an ordinary commit here can gain
a second parent.

Recovery from a failed mutation restores the index and working tree but never
moves the branch ref backwards. Rewinding to the sampled parent was safe only
while one writer existed; once a second window or the store's own debounced
commit timer had appended, the rewind abandoned that commit and left history
unreachable.

Opening a repository repairs one that an earlier build left forked. A detached
HEAD is reattached so its commits cannot orphan themselves, and a ref already
reachable from HEAD is dropped because every commit it named survives. A
genuinely diverged tip is replayed *forward* as two ordinary audit commits —
its tree, then the tree that was live before the fold — so both states stay
reachable, diffable, and restorable from the single timeline, and the live
setting is left exactly as it was. Nothing is ever deleted to restore
linearity. Merge commits inherited from an older build cannot be removed
without rewriting history, so they are reported rather than repaired.

The history panel enforces the same invariant on what it displays. Stores page
by offset and a read can itself create a commit, so a commit landing between
two pages slides the window and repeats an entry. Repeats, and any entry not
older than the oldest already loaded, are dropped; paging advances by what the
store served rather than by what survived, so a fully rejected page cannot be
requested forever. A panel pointed at a different store discards what it has
loaded and re-reads from the new store's HEAD instead of paging one
repository's commits underneath another's.

## Failure modes and recovery

Invalid JSON, an unsupported document version, an unexpected file, a missing
`setting.json` in an established history, or an external working-tree edit is
rejected rather than silently imported. A valid crash-safe backup or recovery
file can restore the setting and is recorded by a recovery commit. A failed
mutation does not poison the queue: later owner operations can still run after
the error is handled.

Repository UUID initialization is locked and re-read from Git config so
concurrent windows converge on the same persisted identity. Profile switches
dispose the old subscriptions and initialize the new profile's owners before
publishing their aggregate renderer projection.

Tab history and repository-path lookups are deliberately nullable while the
active profile's title owner is starting. `Shift`+right-click or the tab
command menu's explicit **Customize Appearance…** action first initializes the
clicked tab, including an inactive tab, and opens its editor only when both
owner resources are ready. During a profile transition the live status region
offers localized retry guidance. Delayed work is fenced by coordinator
instance, active profile key, tab existence, and edit revision so an old
profile cannot overwrite the replacement profile or a newer title edit.

Toolbar typography changes publish a bounded body signature as well as safe CSS
variables. The adaptive toolbar watches that signature and invalidates its
retained width measurement, preventing a larger font from clipping and a
smaller font from leaving actions stranded in More.

## Security considerations

The coordinator requires normalized absolute paths below its owned data root.
It resolves the nearest existing ancestor and refuses symbolic-link, junction,
or reparse-point redirection, directory escape, a linked `.git`, and unowned
files. Each store accepts only its exact strict schema and returns copied
values, preventing callers from mutating canonical state by object alias.
Toolbar colors accept hex only, font families pass the curated/safe-family
validator, unsupported background highlighting is removed, and font size is
clamped to 20 px before rendering.

These repositories are local application history, not user working copies and
not provider remotes. Editing one owner cannot write another owner's setting
or Git history.

## Verification

`dedicated-setting-store-test.ts` covers independent roots, a 500-call
latest-value burst, ordering barriers, failed-batch recovery, debounced commits,
append-only undo/redo/restore, corruption, external edits, and path escape
refusal. `profile-history-linearity-test.ts` covers the compare-and-swap under
a forced concurrent write, the merge-state refusal, a deliberately forked
fixture folded rather than pruned, detached-HEAD reattachment, redundant-ref
removal, and the untouched already-linear case.
`versioned-store-history-test.tsx` covers the sliding-window guard, the
newest-entry guard, offset advancement, and the store-swap reset.
`element-appearance-coordinator-test.ts` covers profile,
feature, tab, and repository isolation plus migration and UUID races.
`anchored-appearance-editor-test.tsx`,
`repository-element-appearance-editors-test.tsx`, and
`repository-tab-element-history-test.ts` exercise actual-element anchoring,
focus return, inheritance changes, owner-local history refresh, profile
replacement, stale-load rejection, and appearance-pending startup.
`repository-tab-actions-test.tsx` covers the ordinary command menu,
`Shift`+right-clicking an inactive title, the explicit Customize action, and
the non-crashing localized loading state.
`anchored-appearance-editor-test.tsx` additionally proves the gesture contract
directly: a plain right-click opens no editor, is not `preventDefault()`ed, and
keeps bubbling to the surface that owns the menu, while `Shift`+right-click
opens the editor and claims the event.
`tab-session-and-context-style-test.ts` proves every surface asks the shared
predicate rather than reading `shiftKey` itself, and that the Settings →
Appearance note carries the gesture in both languages at all three playfulness
bands.
`repository-settings-appearance-test.tsx` covers the Repository Settings hub:
every repository owner rendered with its inherited state, an edit and a reset
committed through the same owner id, the round trip from the hub to the
anchored editor opened on the actual row, and the refusal to paint a value
while the coordinator is still starting.
`appearance-customization-test.ts`, `element-appearance-editors-test.tsx`,
`helper-side-effect-surfaces-test.tsx`, and `toolbar-overflow-test.tsx` cover
toolbar normalization, inheritance, localized controls, CSS
projection/cleanup, and grow/shrink remeasurement.
