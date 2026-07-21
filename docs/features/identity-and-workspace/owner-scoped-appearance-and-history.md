# Owner-scoped appearance and history

Desktop Material attaches appearance controls to the element that owns the
setting. A right-click or `Shift+F10` opens an anchored editor beside the
profile, feature, repository, tab, repository logo or name, or submodule Back
control being changed. The editor exposes that owner's History without routing
the edit through a shared appearance studio.

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
active profile's title owner is starting. A right-click first initializes the
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
refusal. `element-appearance-coordinator-test.ts` covers profile,
feature, tab, and repository isolation plus migration and UUID races.
`anchored-appearance-editor-test.tsx`,
`repository-element-appearance-editors-test.tsx`, and
`repository-tab-element-history-test.ts` exercise actual-element anchoring,
focus return, inheritance changes, owner-local history refresh, profile
replacement, stale-load rejection, and appearance-pending startup.
`repository-tab-actions-test.tsx` covers right-clicking an inactive title and
the non-crashing localized loading state.
`appearance-customization-test.ts`, `element-appearance-editors-test.tsx`,
`helper-side-effect-surfaces-test.tsx`, and `toolbar-overflow-test.tsx` cover
toolbar normalization, inheritance, localized controls, CSS
projection/cleanup, and grow/shrink remeasurement.
