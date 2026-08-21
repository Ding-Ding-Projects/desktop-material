# Desktop Material — Active parity handoff

## Current frozen-renderer capture ledger — 2026-08-21

The capture ledger no longer derives phantom rows from the removed MD3 shell.
It names 26 source-mapped states for the frozen renderer baseline, including
toy locks, School mode, narrator controls, attention modes, Support Tickets,
authenticator history, and publishing recovery.

All 26 states remain honestly pending. No historical frame is promoted as
current evidence, and the reverted UI must not be restored to satisfy a stale
row. The approved cheap headless route remains unavailable.

## Browser-extension download handoff foundation — 2026-08-21

The desktop app now owns strict native-messaging parsing and distinct styled
Start, active Downloading, completion, cancellation, failure, and unavailable
surfaces using the existing Dialog, Button, and OperationProgressRow
primitives. It does not create a generic browser destination or restore the
frozen shell.

The current integration remains explicitly unavailable because no packaged
browser extension/native host is registered. The in-app browser's blocked
download route and File Explorer shell extension are not treated as proof.
Runtime native-host interaction and captures remain pending.

## Ollama suite foundations — 2026-08-21

The existing Preferences, model-manager, and chat surfaces now have bounded
queue, chat-control, recovery, and harness-profile foundations without adding a
generic dashboard or changing the frozen shell. Chat sessions persist bounded
local system prompts and generation parameters, support retry and redacted
export, and fail closed on unknown image capability.

The durable queue now has an owned runner in
`app/src/lib/ollama/batch-pull-queue.ts`: it is capped at 128 items and three
workers, serializes every persistence callback across overlapping workers and
progress events, rejects oversized ids/model names, and requeues completed tags
that disappear from a successful live installed-model inventory. The queue
still has no renderer-owned persistent store in this lane; the caller must
provide that private callback and must not report completed rows until live
inventory reconciliation has succeeded.

The recovery-state and allowlisted harness-profile contracts remain
foundations only. Exhaustive official catalogue evidence, conservative
hardware-fit proof, complete launcher/rollback UI, runtime interaction, and
captures remain pending. Focused queue coverage is in
`app/test/unit/ollama/batch-pull-queue-test.ts`; it passed **6/6** using the
repository's existing TypeScript test loader. No built-artifact interaction or
capture was run in this narrow source lane.

## Status Hub projection foundation — 2026-08-21

The existing Agents sidebar now owns the desktop-visible Status Hub state line;
no duplicate dashboard or raw browser controls were added. A typed,
main-process-only client projects repository registration, heartbeat and
evidence states, a stable URL when configured, and authenticated inbox replies
that are marked delivered only after confirmation. No endpoint or vault
credential is configured in this checkout, so the shipped state is explicitly
local-only rather than a mock connected state.

The Discord bridge remains documented as Hub-owned read-plus-reply only; it is
not a renderer client and receives no desktop agent credential. See
`docs/features/design-system/status-hub.md`.

No tests, lint, typecheck, build, runtime interaction, or capture was run in
this assigned Yum Leung Cha lane.

## Local file-converter foundation — 2026-08-21

The converter lane now exposes **Repository tools → Local file converter**
through the existing frozen tools surface. It has a categorized eight-category
adapter registry, bounded byte-signature inspection in the main process, a
persisted renderer queue, pause/resume and final-outcome clearing controls, and
a storage-preflight/atomic-output publication foundation for future bundled
adapters. All current adapters remain visibly unavailable: this application
declares no bundled offline PDF, image, audio, video, archive, structured-data,
text, or binary-encoding engine.

No conversion executes yet: the queue accurately records unavailable sources
instead of inventing a target or an outcome. Destination selection, overwrite
confirmation, adapter packaging, paged durable queue persistence, offline
docs-bundle regeneration, tests, type checking, built artifact interaction, and
capture evidence remain required before completion.

## Appearance locks disable their targets — 2026-08-21

The appearance-lock gate now keeps a locked target behaviorally disabled for
pointer and keyboard activation, direct callbacks, tab context-menu actions,
and palette/search teleports. It publishes `aria-disabled="true"` and a locked
marker while closed, refreshing those semantics as lock or unlock state changes.

Every blocked route opens the existing anchored unlock prompt. Cancellation or
failed verification leaves the target locked and restores focus to the exact
attempted control. Multiple locks are answered independently; successful
verification does not replay the interrupted action.

No tests, typecheck, build, runtime interaction, or capture was run under the
ultra-speed boundary.

## Support Tickets Help route and authenticator history — 2026-08-21

The existing About surface now opens the real local Support Tickets desk with
`entryPoint: 'help'`. Authenticator settings exposes **View authenticator
history** through the current styled Button component and the existing
`VersionedStoreHistory` route.

The history adapter exposes entry metadata only. Credential-vault records and
generated codes never enter history, diffs, or exports. After undo, redo, or
restore, the view re-reads the document and vault; restored entries without a
matching vault record remain visible but cannot produce a code.

Tests, builds, packaging, runtime interaction, and captures remain unrun under
the ultra-speed boundary.

## School mode live propagation — 2026-08-21

The shared `SchoolModeChangedEvent` now reaches the main shell, Settings,
Appearance, scheduled settings, and the internal browser. Existing windows
refresh immediately. While active, language, playfulness, personal-vocabulary,
and scheduled-language controls and discovery routes are omitted while saved
values remain retained. Banded funny-level copy falls back to plain English.

The command palette and settings search resolve the current renamed mode label
and description without exposing shipped fallback copy. Unlock and Support
Tickets routes remain available.

No tests, lint, typecheck, builds, captures, reviews, or runtime interaction
were performed in this ultra-speed lane.

## Attention accommodations — 2026-08-21

Five independently persisted, off-by-default interface accommodations now
exist: Focus, Low stimulation, Time awareness, One thing at a time, and
Momentum. The lane adds a Preferences page, settings-search entries, command
palette toggles, live root state/styles, elapsed/activity facts, a bounded
next-action field, and a dismissible inactivity prompt.

The ultra-speed boundary remains explicit: no tests, lint, type checks,
reviews, builds, captures, packaging, or runtime interaction were performed.
Built-artifact evidence remains pending.

## Appearance locks use the authenticator runtime join — 2026-08-21

Appearance-value lock creation now uses the shared `Md3LockSetupDialog`, with
the existing password or authenticator OTP choices, unlock duration, and
lock-on-launch settings.

Renderer startup installs `installAuthenticatorLockFactor` with a cache of
public authenticator entry metadata loaded from the existing
`AuthenticatorStore`. OTP verification still reads the secret only through
`readAuthenticatorSecret` and the operating-system credential-vault boundary;
no secret is copied into the lock registry, document history, exports, logs, or
UI. The settings-owned store publishes metadata snapshots after initialization
and updates so newly registered factors become available without restart.

Verification boundary: no tests, lint, typecheck, review, build, package,
runtime interaction, or capture was run. The generated offline docs browser
bundle was not rebuilt and remains pending.

## Root Windows dependency preparation — 2026-08-21

This lane adds `download-dependencies.bat` and the checked-in
`script/windows-dependency-manifest.json`. The root entrypoint accepts `/s`,
`--silent`, and `SILENT=1`, then invokes the existing
`script/build-windows.ps1 -Mode Prepare` path. `build.bat` and
`build-installer.bat` call that entrypoint before their existing modes, so the
resolver and frozen-lockfile logic remain shared.

The manifest records Node.js `24.15.0` x64/arm64 canonical URLs and SHA-256
digests, vendored Yarn Classic `1.21.1`, the Visual Studio Build Tools 2022 C++
workload, and the exact frozen Yarn arguments. Preparation is user-scoped where
the upstream installer supports it, keeps signing disabled, and does not accept
or write credentials.

The root scripts now preflight interactive administrator elevation before
dependency resolution. A non-elevated interactive run starts one elevated child
and returns its exact exit code; `/s`, `--silent`, and `SILENT=1` skip the prompt,
report the non-elevated continuation, and remain process-scoped. Installer mode
also rejects zero-byte fresh setup, MSI, `RELEASES`, or full-package artifacts
before manifest and unsigned-signature verification.

Verification boundary: this lane intentionally ran no tests, lint, type checks,
builds, packaging, downloads, installation, runtime interaction, or captures.
Cold/warm preparation and build/package evidence remain pending.

## Narrator voice controls restoration — 2026-08-21

The Sound preferences pane now renders the narrator settings that the persisted
audio model already supports:

- independent English and Cantonese voice pickers backed by the platform's
  live `SpeechSynthesis` voice list;
- an empty **Choose automatically** choice, stable `voiceURI` persistence, and
  status copy for local, network-backed, missing, and no-compatible-voice
  states;
- late `voiceschanged` refresh with teardown unsubscribe; and
- bounded speaking-rate (0.5–2.0) and pitch (0.0–2.0) sliders, both localized
  in English and Hong Kong Cantonese.

The narrator voice group is anchored for the existing settings-search and
command-palette routes. The feature article is
`docs/features/design-system/narrator-voice.md`.

Verification boundary: this implementation lane intentionally ran no tests,
lint, type checks, reviews, captures, builds, packaging, or release checks.
Built-artifact interaction and current capture evidence remain pending.

## Publish account and owner recovery — 2026-08-21

The Publish repository dialog now retains a selected GitHub.com account in the
DotCom tab state instead of reverting to the first account after a rerender.
The resolved account is passed to organization discovery and to the final
publication call; changing accounts also clears an owner selected for the
previous identity.

Organization discovery now requests an explicit error result. When lookup
fails, the personal-account destination stays present, a localized
non-blocking status names the limitation, and a bounded retry action refreshes
the same account. A late response from an older account remains fenced by the
existing request generation.

When a GitHub.com publication returns the existing `APIError` `401`
classification, the dialog offers a localized sign-in-again action. The
callback adopts the successful GitHub.com account and clears the stale error;
it deliberately does not auto-submit publication, so re-authentication cannot
duplicate a repository creation.

Changed surfaces in this lane:

- `app/src/ui/publish-repository/publish.tsx`
- `app/src/ui/publish-repository/publish-repository.tsx`
- `app/src/lib/i18n-resources.ts`
- `app/test/unit/ui/publish-repository-test.tsx`
- `docs/features/repository-management/publish-organization-picker.md`
- `ROADMAP.md`
- `HANDOFF.md`
- `changelog.json`

Verification boundary: per the ultra-speed lane, no tests, lint, typecheck,
review, capture, build, or packaging command was run. The focused publish test
record is intentionally pending, and the selected-account and re-authentication
paths still need built-artifact interaction evidence before they can be called
verified.

## Changelog export traceability — 2026-08-21

The in-app changelog export lane now keeps provenance visible in both export
formats. Markdown entries include the full 40-character commit SHA as a link to
the exact project forge commit URL. Plain-text entries include the same full SHA
and URL without Markdown syntax. Entries with no recorded commit explicitly say
`Commit: not recorded (no commit SHA is available for this changelog entry).`
Malformed references are reported without inventing a link.

Changed files in this lane:

- `app/src/lib/changelog/changelog-export.ts`
- `app/test/unit/changelog-viewer-test.ts`
- `docs/features/integrations/automated-updates-and-release-notes.md`
- `ROADMAP.md`
- `HANDOFF.md`
- `changelog.json`

The focused assertions cover both linked and absent commit metadata, but this
ultra-speed lane intentionally ran no tests, lint, type checks, reviews,
captures, builds, or packaging. The evidence state is therefore **implemented;
verification deferred** until a later pass runs the focused checks against the
integrated default branch.

## MD3 menu safety and bilingual wrapping — 2026-08-21

The menu overlay lane updated the existing MD3 controls without changing the
frozen application shell. `md3SearchPatternError` now asks the shared bounded
RE2 adapter whether a pattern is valid, and `filterMenuItems` delegates both
substring and regex filtering to the shared ordered filter helper. Native
JavaScript `RegExp` compilation is no longer used for these user-authored menu
patterns.

Menu rows now derive normalized `aria-keyshortcuts` values from their existing
visible shortcut hints. A recognized shortcut's visible hint is marked
decorative for assistive technology so it is announced once through the ARIA
metadata; state hints and pointer gestures remain readable text. Menu titles and
labels wrap at word and character boundaries so long bilingual strings remain
inside the existing bounded panel and scrolling list.

Changed source and records:

- `app/src/ui/md3/md3-primitives.tsx`
- `app/src/ui/md3/md3-menu-overlay.tsx`
- `app/styles/ui/_md3-menu-overlay.scss`
- `docs/features/design-system/md3-shell.md`
- `changelog.json`
- `ROADMAP.md`
- this handoff

No tests, lint, type checks, reviews, builds, captures, commits, pushes, merges,
or releases were run in this implementation lane. The owning delivery lane
must perform its own integration and later verification, then add the final
source commit identifier to the changelog entry if required by its release
format.

## CI compile repair lane — 2026-08-21

This lane prepares the narrow source repairs reported by the production compile
feedback. It is scoped to the following files:

- `app/src/lib/process/win32.ts`
- `app/test/unit/atomic-rename-coverage-test.ts`
- `app/test/unit/process-win32-test.ts`
- `changelog.json`
- `HANDOFF.md`

The source changes use explicit `Buffer<ArrayBufferLike>` types for the bounded
stderr tail, remove the duplicate fail-closed quarantine coverage declaration,
and narrow the process-settlement union before reading its rejection error.

Evidence boundary: this ultra-speed lane performed static source inspection
only. Tests, lint, type-checking, builds, captures, and reviews were not run.
No commit, publication, or default-branch integration has been performed in
this lane; the owning delivery lane must inspect and integrate the diff.

## Five-day public guidance notice — 2026-08-21

Added a compact, public-safe README banner summarizing the latest shared
contributor guidance. It names the new hand-written completeness inventory,
the evidence links expected between implementation and documentation, and the
need to distinguish source or release receipts from runtime and visual
verification. The banner states that it is documentation-only, remains visible
through **2026-08-26**, and may be removed after that date.

Changed files in this lane:

- `README.md`
- `changelog.json`
- `HANDOFF.md`

No application code, tests, captures, builds, packaging, or verification
evidence were added in this documentation lane. The change is prepared on
`docs/five-day-shared-instruction-notice`; integration and publication remain
with the owning delivery lane.

## Universal-feature completeness registration — 2026-08-21

This pass replaces the old uniform evidence-path templates with an explicit
schema-versioned manifest for all 62 canonical feature IDs. Each row keeps
implementation or registration, documentation, localization, persistence,
focused tests, built-artifact interaction, and real capture evidence as an
independent array of records. A record is `present`, `pending`, or `blocked`;
present records name only paths found during read-only inspection, while every
pending or blocked record carries its reason. Registration metadata is an index
into those proofs; it is not proof that a feature is implemented, reachable,
functional, or verified.

The focused contract source now validates the exact canonical ID order and
dimension set, checks repository-relative paths for claimed-present records,
requires reasons for pending/blocked records, and reports a separate
completion verdict. Its dedicated completion Chut asserts `complete === true`
and prints the exact pending, blocked, or missing-path errors; it is expected
to be red until the deferred evidence is filled. Its row-by-row mutation
coverage removes each dimension and mutates either a claimed path or a pending
reason, so a broad template or commented-out placeholder cannot satisfy the
contract. The current Chut is intentionally red because the ultra-speed pass
did not run tests, built-artifact interactions, captures, reviews, audits,
builds, or packaging.

Directly related records are
`app/test/fixtures/feature-completeness/evidence-paths.json`,
`app/test/unit/feature-registration-completeness-test.ts`,
`docs/features/design-system/universal-feature-completeness-inventory.md`, the
design-system category index, this handoff, `ROADMAP.md`, and `changelog.json`.
The associated source registration work is owned by separate implementation
lanes.

Evidence boundary: the 2026-08-21 ultra-speed pass intentionally ran no tests,
reviews, audits, built-artifact interactions, captures, builds, or packaging in
this records lane. A later verification pass must fill or refresh those evidence
fields before any registered feature is described as implemented or verified.

## Automated merge-all cleanup — 2026-08-20

The Worktrees dialog now recovers automatically when the default branch is
checked out in another clean worktree. It transfers the default branch to the
active worktree, removes a redundant linked owner, and continues the existing
merge, non-force push, exact-tip deletion, and worktree cleanup sequence.

An explicit **Force Mat Day** checkbox enables the existing preservation path
for recoverable dirty worktrees: fetch, fast-forward-only pull, commit, and
push occur before merge. Unsafe work remains retained. Focused candidate and
renderer coverage passes 4/4; exact-file ESLint and `git diff --check` pass.
The repository-wide TypeScript run remains red on pre-existing errors in
`app/src/lib/process/win32.ts`, `app/test/unit/atomic-rename-coverage-test.ts`,
and `app/test/unit/process-win32-test.ts`. A packaged Windows capture of the
new checkbox remains outstanding.

## Personal vocabulary dynamic-entry repair — 2026-08-20

- The upload parser again accepts the documented canonical `schemaVersion`/`entries` payload and keeps older `schemaVersion`/`terms` and `version`/`terms` cache records readable.
- The focused unit Chut builds 47 distinct mappings, confirms the parsed map keeps all 47, and confirms one replacement pass applies all 47 rather than stopping at the former payload count.
- Directly affected files: `app/src/lib/personal-vocabulary.ts`, `app/src/ui/preferences/personal-vocabulary-control.tsx`, `app/test/unit/personal-vocabulary-test.ts`, and `docs/features/design-system/personal-vocabulary.md`.

## Eighteen defects, five hunts — 2026-08-19

Five adversarial hunts ran over the tree, every finding put through independent
refuters that default to refuted on any uncertainty. Eighteen survived and were
fixed. Three are worth knowing about before touching the related code.

**The tertiary colour role was never declared.** 155 `var()` references across
30 stylesheets, zero declarations, no fallbacks — so each resolved to the
guaranteed-invalid value and the property computed as unset. Chips, badges and
status pills rendered with no fill, which is why parts of the app had stopped
looking like Material Design. Declared now for light and dark in
`app/styles/_material.scss`. Accent blocks deliberately do not restate it; they
do not restate the secondary base either.

**Every toast was silently lost.** `Md3ToastHost` says "mount it once, at the
root of the shell", and the shell that mounted it was reverted. Seven surfaces
pushed into a store with no subscriber. Mounted in `app.tsx`.

**Support Tickets was built and unreachable.** Three dead ends: a palette entry
with no handler, an unlock-prompt link reporting the desk unavailable, and
nothing rendering it. A lock here is not a security boundary, so a closed
recovery route is the feature failing rather than degrading.

### Guards added, each proved red then green

| Guard | Catches |
| --- | --- |
| `interface-shell-frozen-test.ts` | 35 shell files returning, 9 surviving controls being removed |
| `atomic-rename-coverage-test.ts` | a bare `rename` where user state is published |
| `lock-recovery-wiring-test.ts` | the recovery desk being disconnected again |
| `md3-regex-builder-tokens-test.ts` | a token the builder offers but cannot compile |

### Recorded so nobody rediscovers it

The commit graph is rebuilt in full whenever history loads a batch, and that
**cannot** be resumed from a cached prefix. `visibleSHAs` spans the whole loaded
list and history arrives newest first, so a commit's parents load in later
batches and the oldest row legitimately changes when they do. A cached prefix
freezes that row in its earlier, wrong shape. Only the constant was taken; the
per-row lane lookups are one index instead of a scan per lane and per parent,
and output equivalence was proved by running the same tests against both
implementations.


## The August 7 chrome, restored a second time — 2026-08-19

**Read this before the entry below it.** The chrome described there was rebuilt
by an agent on 2026-08-18 and has now been removed again. If you are about to
"restore the Material Design 3 shell", stop and read
[AGENTS.md](AGENTS.md) — the shell is frozen and that rebuild is exactly what
this entry exists to prevent happening a third time.

### What happened

The 2026-08-15 revert landed correctly (`d3a822d773`). On 2026-08-18 an agent
read *"Material Design 3 throughout"* in `AGENTS.md` as a standing order,
concluded the shell was missing, and re-added roughly 40,000 lines: the
`app/src/ui/md3/` view components, ten stylesheets, and 3,127 lines inside
`app.tsx`. Nobody had asked for it.

### What was done about it

| Change | Commit | Evidence |
| --- | --- | --- |
| Whole 2026-08-18 wave reverted | `3abcee9015` | 58,291 deletions; `app/src`, `app/styles`, `app/test` byte-identical to `d3a822d773` |
| Vocabulary loader reverted too | `3733524bba` | the one kept exception removed, so the tree is one known-good state |
| `AGENTS.md` shell-frozen rule | `3abcee9015` | new section; the MD3 line now scopes to controls and dialogs only |
| tslib test-loader fix | `2faa8a046a` | `add-submodule-dialog` went from 1 test / 0 pass to **16 / 16** |
| Wildcard ignore builder rebuilt | `9fcc761332` | 3/3 tests, on the frozen chrome |
| Vocabulary reaches menu labels | `e9c2d2abb8` | 4/4 tests, proved red-then-green |
| Worktree card clipping fix | `cbd58f2bae` | `grid-template-columns: minmax(0, 1fr)` |
| Infinite colour picker rebuilt | `adeb35b978` | 5/5 engine tests |

### What is deliberately not claimed

- `app/package.json` and `app/yarn.lock` stay **ahead** of the Aug 15 state.
  Those are dependabot bumps against 14 open advisories and touch no interface.
- The worktree clipping fix is reasoned from the CSS and a screenshot. The
  stylesheet compiles with both rules emitted, but **the built app has not been
  photographed at this commit**. Run `script/capture-app.js` before calling it
  verified.
- Hardcoded JSX strings elsewhere still bypass the personal-vocabulary
  boundary. Menus were the loudest gap and are closed; routing the rest through
  `t()` is still open work.
- Running several UI test files in one `script/test.mjs` invocation hung past
  16 minutes on this machine while each file passed individually. Treat a
  combined-run stall as contention, not as a failure, and re-run the file alone.


## August 7 chrome, every feature back on top of it — 2026-08-15

**Read this first; it supersedes the two entries below it.** The requested end
state is now live: the interface is the **August 7 chrome**, and **every feature
is back**.

Those are not in tension, and the proof is two diffs rather than an assurance:

| Check | Result |
| --- | --- |
| `app/src/ui/repository.tsx` vs `02d627e662` | **byte-identical** — the workspace, rail, tabs and avatar *are* August 7 |
| `app/src/ui/app.tsx` vs `02d627e662` | 81 insertions, **0 deletions** — purely feature wiring |

Restored: Support Tickets, the authenticator (entries, TOTP, QR registration,
secret vault), the regex builder, the destructive-action gate, the every-element
appearance locks, the offline docs browser, agent sessions, the newer runner
surface, and the personal-vocabulary, School-mode and dialog-emoji settings.
Also back: diff line wrapping, hunk-expansion focus order, commit-drop insertion
ordering, menu first-character navigation and the worktree list's merge-branch
handling — the five post-August-7 fixes that were never MD3 and had been taken
out indiscriminately.

Material mode stays retired. This is the earlier M3 design with the features on
it, not the MD3 shell returning; see the entry further down for why the app is
still Material Design 3 throughout.

### How this was done, and why not by hand

`app/` was restored wholesale from `9c9755d844`, whose tree already *was*
"August 7 chrome plus every feature" — the surgical route the revert jer had
produced before the literal revert removed it. Rebuilding 42,638 lines by hand
would have been slower and strictly worse: this way the result is verifiable by
`git diff` rather than by review.

### Verified, against a real baseline

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **exit 0, zero errors** |
| `app/` vs `9c9755d844` | **identical** (empty diff) |
| The 50-file contract suite | **64 failing of 465** |
| The 26 failures the literal revert introduced | **0 remain** |

64 of 465 is **exactly the pre-revert baseline**, so the 21 reintroduced defects
tracked on issue #196 are all resolved — the AI merge editor's security guards,
the 158-glyph font contract, the accessibility and layout contracts, and the
destructive-action honesty guards all pass again. The 5 obsolete guards in that
issue are no longer obsolete, because the features they guard exist again.

> [!NOTE]
> The remaining **64** were already red before any of this and are unrelated to
> the revert or the restore. They are the standing contract debt, not new.

Lint, captures, packaging and a built-artifact run were **not** performed.

## The interface is now literally August 7, and the features went with it — 2026-08-15

**Read this first.** `app/src/ui` and `app/styles` were hard-reverted to
`02d627e662` (2026-08-07 21:10). This was requested explicitly and confirmed
after the cost below was put in writing, so it is a decision, not an accident.
146 files changed: **361 insertions, 42,638 deletions, 95 files deleted.**

### What this deleted, deliberately

Support Tickets, the authenticator (entries, TOTP, QR registration, secret
vault), the regex builder, the destructive-action gate, the every-element
appearance locks, the offline docs browser, the self-hosted runner manager's
newer surface, and agent sessions. Their `app/src/lib` modules
(`docs-browser/`, `md3-locks/`, `authenticator/`, `md3-view-preferences.ts`,
`stores/authenticator-store.ts`, `rewrite-surface-registry.ts`) and 22 test
files went with them.

> [!WARNING]
> Several of these are contracts the shared agent instructions require of every
> user-facing app. This tree no longer satisfies them. That is a known,
> requested state — do not "fix" it by restoring them without asking.

### It also took post-August-7 work that was never MD3

Reverting the whole of `app/src/ui` is indiscriminate, and these went too:
diff line wrapping, hunk-expansion focus order, commit-drop insertion ordering,
menu first-character navigation, and the worktree list's merge-branch handling.
Each was an accessibility or behaviour fix, not chrome. They are recoverable
from history if wanted; they are named here so nobody has to rediscover the
loss.

### The 98-glyph icon font is back, and that has teeth

August 7 ships `material-symbols-rounded-prototype-98.woff2`, not the 158-glyph
official subset. `MaterialSymbolNames` in `app/src/ui/lib/material-symbol.tsx`
documents itself as "the exact ligatures bundled" in that prototype, and a unit
contract compares it to `font-assets-manifest.json`.

**A ligature name the font does not carry renders as its literal English word.**
So do not widen that union to satisfy a call site — 14 names
(`calendar_month`, `construction`, `description`, `edit_note`, `folder`,
`help`, `inbox`, `menu`, `merge_type`, `more_vert`, `play_circle`, `smart_toy`,
`sort`, `wrap_text`) were referenced by the newer palette catalog and are *not*
in the 98-glyph set. That catalog was reverted to August 7 rather than the union
widened, which is why the tree compiles. Subset the real font first if a new
icon is ever needed.

### One deliberate non-revert, and why

`ISelfHostedRunnerSetupRequest.accountKey` and
`ISelfHostedRunnerRemoveRequest.accountKey` are now **optional**. The August 7
runner UI has no account picker, but multi-account infrastructure elsewhere in
`app/src/lib` survives and is used widely, so reverting the types was not an
option. `validateSetupRequest` resolves the key through
`SelfHostedRunnerAccountCredentials.onlyAccountKeyForEndpoint` and returns
`ValidatedSelfHostedRunnerSetupRequest`, so every later step still has a
concrete account. **It refuses when two signed-in accounts share an endpoint**
rather than guessing — guessing would register a runner as a user who never
chose it.

### Known incoherence left in place

`app/src/lib/settings-search/settings-search-catalog.ts` and
`app/src/lib/collection-surface-registry.ts` still list rows for surfaces the
August 7 Settings does not render, and `lib/personal-vocabulary.ts`,
`lib/school-mode.ts`, `lib/dialog-emoji.ts` and `lib/support-tickets.ts` are
still imported by `i18n.ts` and that catalog. They were **not** deleted, because
deleting them breaks `i18n`. Auditing that catalog against the August 7 Settings
is real remaining work.

### Verified for this revert — including what is red

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **exit 0, zero errors** |
| Prettier on all 44 changed source files | clean |
| `node script/test.mjs` | **8,564 tests, 89 failing across 50 files** |
| Lint, captures, packaging, built-artifact run | **not performed, not claimed** |

**A baseline was taken**, by running the same 50 files at `9c9755d844` (the
commit immediately before the revert) in the same checkout:

| | Failing leaf tests |
| --- | --- |
| Before the revert (`9c9755d844`) | **64** |
| After the revert | **89** |
| **New, caused by the revert** | **26** |
| Fixed by the revert | 1 |

So 64 of the 89 were **already red** and are not this revert's doing. The 26 new
ones split two ways, and the split is the important part:

#### Five are obsolete guards — they guard deleted features and can never pass

`feature-ledger-test.ts` (3: "still declares every dialog the app could open",
"still has a live route to every dialog it declares", "still ships every UI
feature area"), `collection-surface-registry-test.ts` (1),
`support-ticket-recovery-test.ts` (1).

#### Twenty-one are the revert reintroducing real defects

> [!WARNING]
> These are not stale guards. **Do not delete them to make the suite green** —
> each is catching something the August 7 tree genuinely does wrong, which is
> why it was written in the first place.

| Area | Tests | What it means |
| --- | --- | --- |
| `ai-merge-editor-test.tsx` | 6 | Includes **"renders hostile HTML-looking content only as plain text"** — a security guard — plus "does not reintroduce CodeMirror hidden input buffers" and "refuses an over-limit result instead of emitting silently truncated code" |
| `bundled-fonts-test.ts`, `material-symbol-test.tsx` | 4 | The 98-glyph prototype font is back; see the icon-font section above |
| `button-token-test.ts` | 2 | `--button-height` 25px vs 40px again — the trap that hid a sub-minimum touch target once already |
| `responsive-repository-surfaces-style-test.ts` | 3 | Narrow-width and short-height layout: missing-repository actions no longer stack, sheets escape their viewport insets |
| `popover-clipping-contract-test.ts`, `post-shell-style-test.ts` | 2 | Popovers unbounded; the floating-popover available-height token is gone |
| `command-palette-size-contract-test.ts` | 1 | Palette results unusable at 200% zoom in a short viewport |
| `self-hosted-runner-removal-dialog-test.tsx` | 1 | An irreversible removal hides itself while running |
| `shallow-clone-ui-test.ts` | 1 | Post-clone runner provisioning no longer explicit, no longer blocks public repositories |
| `issue-134-workflow-paths-test.ts` | 1 | The editable conflict result is off the native full-value control |

Accepting the August 7 interface means accepting these until each is fixed
against August 7's chrome. They are tracked on the issue linked from the
changelog entry for this revert.

## One of the two MD3 designs was retired — the app is still Material Design 3 — 2026-08-15

> [!IMPORTANT]
> **The app did not stop being Material Design 3.** It has had *two* M3 designs.
> The second one — the MD3 shell with its eight destination views — is the one
> that was retired. The first one is what renders now, and it is M3 throughout.
> Do not read the rest of this entry, or the phrase "Material mode", as saying
> Material Design left the product. It did not, and nothing here is a licence to
> "restore M3" against the design system that is already live.

**Read this before the 2026-08-14 entry, which it supersedes on one point.** The
revert was carried through: `finish/ui-revert-to-2026-08-07` merged into `main`
as `92b3ef9164`, removing 60,309 lines — the second design's shell, its eight
destination views, its controllers, adapters and its thirteen test files. **The
`Material mode` *setting* no longer exists**, because the alternate shell it
switched to no longer exists. The 2026-08-14 entry's heading "Nothing was
deleted, and nothing needs re-adding" described `main` on that date and is no
longer true of the tree; it is left in place as the record of what was decided
then, with a correction note attached.

### The design system that is live right now

The chrome the revert restored is the earlier M3 design, and it consumes the
same M3 foundations the second design did:

| Evidence | Where |
| --- | --- |
| `--md-sys-color-*` system tokens declared on `:root` | `app/styles/_material.scss` — its own first line reads "Material Design 3 foundations for Desktop Material" |
| M3 motion tokens | `app/styles/material/_motion.scss` |
| Material Symbols icon font, 158-glyph subset | `app/styles/fonts/material-symbols-rounded-subset-158.woff2` |
| M3 components in the shared UI library | `app/src/ui/lib/material-symbol.tsx`, `material-switch.tsx`, `material-context-menu.tsx` |
| M3 surface partials | `app/styles/_material-controls.scss`, `_material-shell.scss`, `app/styles/ui/_material-rail.scss`, `_material-cards.scss`, `_material-switch.scss`, `_material-symbol.scss` |
| `MaterialSymbol` call sites | 69 files under `app/src` |

The `--button-height` fix recorded below is itself proof of this: the value that
*won* came from `_material.scss`, because the M3 layer is imported second and is
the live one.

What the retirement kept, deliberately: 46 md3 files remain, and they are
dialogs rather than chrome — the destructive-action gate, the regex builder, the
toasts, the menu overlay, the compose dialog, the authenticator and Support
Tickets. That is the line the revert itself drew, and the four commits on the
merged jer restore every setting the shell's removal had stranded
(`lib/personal-vocabulary`, `lib/school-mode`, `lib/dialog-emoji`,
`lib/md3-locks`, `lib/authenticator`) into the classic Settings surface.

Two user-visible defects were fixed on the way, and both are worth knowing about
because each had shipped: `--button-height` was declared 25px in
`_variables.scss` and 40px in `_material.scss`, the Material layer is imported
second and wins, so the 25px was dead *and* under the minimum touch target; and
the revert had swapped the 158-glyph Material Symbols subset for a 98-glyph
prototype while the code still asked for 158 names, so an interface shipped with
English words rendered where icons belong.

`wip/stopped-fleets-2026-08-14` merged as `fe1db0dbb5`, and only its GitLab
design-conformance work survived — five of its seven files built on the shell
that is now gone. That closes open item 3 below. Issue #195's current MD3
header-avatar wiring is now covered by focused regression tests for shared
account-switcher routing, distinct header and rail expanded state, and focus
return through the invoking avatar anchor. Those tests were added in the
task-owned issue-195 lane; they have not been run in the Yum Leung Cha pass.

Verified for this integration: `npx tsc --noEmit -p tsconfig.json` exit 0, zero
errors, on the merged tree at `fe1db0dbb5`. The test suite, lint, captures,
packaging and CI were **not** run in this lane and are not claimed.

## UI reverted to the pre-rewrite interface — 2026-08-14

**Read this first if you are picking up UI work.** The default interface was
changed back at the user's explicit and repeated request: *"please revert the ui
to how it was one week ago before this rewrite"*, *"the new ui is causing more
issues than good"*, *"and keep all features"*.

### What "the pre-rewrite UI" actually is

The pre-rewrite tip is `f443f3cd10` (2026-08-11, "Report the lint state of
app.tsx honestly in the handoff"), named as such by `app/src/lib/interface-mode.ts`
itself. Reading `git show f443f3cd10:app/src/ui/app.tsx` shows `renderApp()`
rendered `<Md3Shell views={md3NoViews} renderLegacyDestination={…}>` with the
**navigation drawer** — every destination falling through to the classic
repository workspace.

That is *identical* to what `renderClassicApp()` does today. The shell existed
and rendered before the rewrite; what the rewrite (`0f5525ec89`, "Render the app
through the MD3 shell") added was the eight real MD3 destination **views**.

So the revert did not require removing the rewrite. Three changes were enough:

| Change | File |
| --- | --- |
| `renderClassicApp()` asks for the drawer again, not the rail | `app/src/ui/app.tsx` |
| `shellProvidesNavigation={false}` — the workspace rail draws its own tabs, Settings and avatar again | `app/src/ui/app.tsx` |
| `InterfaceModeDefault` is `'classic'` | `app/src/lib/interface-mode.ts` |

### Nothing was deleted, and nothing needs re-adding

> **Superseded on 2026-08-15 — do not act on this subsection.** It was accurate
> for `main` on 2026-08-14. The second MD3 design's destinations, controllers,
> adapters and navigation rail have since been deleted by `92b3ef9164`, and the
> `Material mode` setting went with the shell it switched to.
> `navigation='rail'` has no caller and no shell to serve. **The app is still
> Material Design 3** — the restored chrome is the earlier M3 design, on the same
> `--md-sys-color-*` foundations; see the 2026-08-15 entry for the evidence.
> The claim that no features were lost still holds — every stranded setting was
> restored into classic Settings — but it now holds for a different reason.
> See the 2026-08-15 entry at the top of this file.

The user asked to "use the git commits to add features back once reverted".
**No features were lost, so there is nothing to add back.** Every MD3
destination, controller, adapter, command-palette entry, localized string and
the navigation rail itself are all still in the tree. Material mode is one
setting away (Settings → Appearance, or the command palette's "Use Classic
mode" toggle). A caller passing `navigation='rail'` still gets the rail.

If a specific feature does turn out to be unreachable from the pre-rewrite
chrome, that is a real bug and should be fixed by making it reachable — not by
switching the default back.

### Work stopped mid-flight, preserved not discarded

> **Resolved on 2026-08-15.** That jer merged as `fe1db0dbb5` and was then
> deleted. Only the GitLab work below survived; the account-switcher work built
> on the deleted shell and did not. The header-avatar defect it describes is
> still real and is now the one open item from this entry.

Two multi-agent fleets were running when the revert was requested and were
stopped so they could not write into a tree being rewound. Their unfinished
work is preserved on the jer **`wip/stopped-fleets-2026-08-14`**, commit
`064fdab5fd`. It is incomplete and unverified. It covers:

- **The account-switcher wiring.** `onMd3OpenAccountSwitcher` in `app/src/ui/app.tsx`
  dispatches `PopupType.Preferences`, so a control whose accessible name promises
  "switch account" opens Settings, directly below a gear that opens the same
  popup. A working `AccountSwitcher` already exists (`app/src/ui/account-switcher/`,
  rendered by `repository.tsx`'s `renderAccountSwitcher()` anchored to
  `railAvatarButtonRef`). The wrinkle: one handler serves two avatars (header and
  rail) and the popover must anchor to whichever was clicked. `ObservableRef` is
  structurally assignable to `React.RefObject`, so the rail's existing observable
  ref can be the `anchorRef` without breaking its Tooltip. Issue #195 now has
  focused MD3 shell regression coverage for both avatar routes, independent
  expanded state, and focus-return anchoring; the coverage has not been run.
- **GitLab design conformance.** `renderGitLabAccounts()` in
  `app/src/ui/preferences/accounts.tsx` diverges from
  `design/Desktop Material v2.dc.html` lines 5174-5296 in five strings and one
  layout. See the "GitLab" section below.

### Known open items in the reverted UI

1. **Actions is offered where it cannot work.** The rail's *extra* classic
   destinations are gated by `md3ClassicSectionAvailable` (`app.tsx`), but
   `actions` is one of the fixed eight in `md3Destinations()`
   (`md3-navigation-drawer.tsx`), so it renders unconditionally. In Classic mode
   `views` is `md3NoViews`, so selecting it falls through to the workspace and
   `RepositoryView.getSelectedSection()` silently lands on Changes. The tab it
   replaced was gated on `supportsGitHubActions()`. Do **not** just drop it from
   `md3Destinations()` — those eight are the design contract asserted by
   `md3-contract-conformance-test.ts`, and Material mode legitimately shows
   Actions because its real view handles the unavailable case.
2. **Two red tests in the one-click Windows build contract**, pre-existing:
   `bounds only printenvz lock metadata and timestamp rounding for native
   freshness` and `passes the detected Visual Studio path only to the direct
   native rebuild`. Confirmed at pristine HEAD.
3. **GitLab does not match the design** — *fixed on 2026-08-15 by `fe1db0dbb5`;
   all five strings and the endpoint default now match, with the design's masked
   `glpat-` token placeholder. The structural note below (bordered three-column
   grid vs unbordered 460px flex column) is the part that remains open.* The
   original entry, for the record:
   description says "Connect GitLab.com … instance" where the design says "Sign
   in to gitlab.com … server"; URL label "GitLab server" vs "GitLab server URL";
   default endpoint `https://gitlab.com` vs `https://gitlab.example.com`; token
   placeholder "Token with api scope" vs `glpat-••••••••••••••••`; button "Add
   GitLab account" vs "Sign in to GitLab". Structurally the shipped
   `.provider-sign-in-card` is a bordered three-column grid; the design is an
   unbordered flex column, 460px, 48px monospace fields, outlined pill button.
   The design is a single-state mock — keep the connected-accounts list, the
   provider error region, the loading state and the disabled-until-valid logic,
   and add the reduced-motion block and focus rings the mock lacks.

### Traps this session paid for, worth not repeating

- **A backgrounded command ending in `tail` reports exit 0 for a failed build or
  push.** Write `EXIT=$?` into the log and grep for it; confirm effects
  independently (`git merge-base --is-ancestor`, grep the bundle for a symbol
  only new code contains).
- **The capture harness can photograph a stale build.** Fixed in `b9f1bb2c18`;
  the freshness stamp is `out/package.json`, written by `build.ts` only after
  webpack exits zero. Bundle mtimes are meaningless because webpack's
  `[compared for emit]` leaves unchanged outputs untouched.
- **Vendored `file:` dependencies arrive with node-gyp run and `tsc` not.**
  `script/ensure-vendored-dependencies.mjs` detects and repairs this; the errors
  otherwise blame a missing module or a webpack loader.
- **Guards must be watched failing.** Two written this session passed after the
  thing they guarded was deleted.

## Repository snapshot as of 2026-08-14 (historical — see the 2026-08-15 entry above)

Checked at `2026-08-14T16:23:33Z` against the fetched default branch and GitHub
state.

- `origin/main` is `514ce07e1cf0c567007b6d762149f1f0b8400503` — *Render the
  interface the app had before the MD3 rewrite*.
- The GitHub issue tracker has zero open issues. [#190 — Reconcile current
  roadmap and release receipts](https://github.com/Ding-Ding-Projects/desktop-material/issues/190)
  is closed.
- The latest published release is
  [`v4.0.119701`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.119701),
  published at `2026-08-14T05:35:30Z` for
  `b7cfb51963157b431e37aa49a7183a6d135146fd`, with six downloadable assets.
  No release for `514ce07e1cf0c567007b6d762149f1f0b8400503` was observed.
- For `514ce07e1cf0c567007b6d762149f1f0b8400503`, [CI Linux run
  31817029168](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31817029168)
  and [Cheap LFS cloud compression run
  31817029399](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31817029399)
  completed successfully. [CI Windows run
  31817029209](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31817029209)
  and [Build Installers / Express Release run
  31817209038](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31817209038)
  were still in progress when this snapshot was recorded.

This is a current-state reconciliation only. It does not turn a dated local
check into CI, installer, test, or capture evidence, and it does not certify
any earlier milestone beyond the evidence that milestone recorded. Every dated
handoff below remains historical: *open*, *pending*, *not claimed*, and
*remaining work* describe the boundary at that entry's time. Reconcile a
historic item with later commits and the current tracker or release state before
treating it as live work.

## 2026-08-13 — Bound DOM assertions in the agent-session panel test

`app/test/unit/agent-sessions-panel-test.tsx` no longer passes nullable query
results or DOM nodes to Node's object-formatting assertions. The remaining
absence checks use boolean identity and the parent/focus checks use
`assertSameNode`, so a failed expectation reports the small mismatch instead of
synchronously serializing the jsdom document until it exhausts memory.

Implementation commit: `418e56a592722b72ee9f8ff4f6eb1dec2f8469bb`.

Tests, lint, review, captures, and packaging were intentionally not run in this
lane.

## 2026-08-11 — The MD3 shell is assembled, wired and documented

**Scope.** Assemble the Material Design 3 rewrite into the application chrome,
keep the pre-rewrite chrome alongside it, and bring the documentation, the
changelog and the site current in the same change.

**Commit.** `5aa2b582c23de7256dbed0b860b79934f618272e` — "Assemble the MD3 shell
and keep the classic chrome that came before it". It follows the nine rewrite
commits listed in the August 11 ROADMAP entry.

### What landed

- `app/src/ui/md3/md3-shell.tsx` — the whole contract shell as one component,
  with an exported state shape (`IMd3ShellState`), an exported pure reducer
  (`md3ShellReducer`) and an exported per-field search binding
  (`md3SearchBinding`). `App.renderApp()` renders it.
- `app/src/ui/md3/md3-shell-carryover.ts` — the hand-written catalogue of the
  forty-four capabilities the design contract never drew, each with its menu
  kind, icon, localized label and destructive flag.
  `buildMd3CarryOverExtensions` turns handlers into the shell's
  `menuExtensions`; `md3UnplacedCarryOverCommands` names any without an action.
- `app/src/lib/classic-toolbar.ts` — the persisted **Show the classic toolbar**
  preference (default **on**) on the same local-storage boolean store every
  other UI preference uses, with a provenance reader and a `window` change
  event so the shell updates live.
- `app/styles/ui/_md3-shell-layout.scss`, imported from `app/styles/_ui.scss`
  immediately after `ui/md3-shell`.
- Documentation: `docs/features/design-system/md3-shell.md`, indexed in that
  category's README in both languages; notes added to the five existing feature
  documents whose described route the rewrite changed; eighteen changelog
  entries added to `4.0.0`, each carrying a commit whose existence was verified
  with `git cat-file -t` before the file was written.

### Verification actually performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | Clean at `5aa2b58`, and clean again on the whole tree after the concurrent destination-wiring work settled |
| ESLint (`--rulesdir ./eslint-rules`) on touched files | Clean except `app/src/ui/app.tsx`, which reports three errors that belong to the concurrent destination-wiring work, not to this change — see below |
| Prettier `--check` on touched files | Clean |
| `feature-ledger-test.ts` | Pass — nothing went missing |
| `md3-contract-conformance-test.ts` | Pass |
| `docs-browser-bundle-test.ts` | Pass after regeneration |
| `i18n-test`, `command-palette-catalog-test`, `settings-search-test`, `palette-settings-coverage-test`, `command-palette-appearance-test` | 84 pass, 0 fail |
| `script/validate-changelog.ts` | Pass |

**Not claimed:** no installer was built, no remote CI run was observed, no
release was published, and no capture of the new shell exists. The screenshot
gallery still photographs the pre-rewrite chrome.

**`app/src/ui/app.tsx` is red on lint, and not because of this change.** The
three errors are `@typescript-eslint/member-ordering` on `md3MenuPayload` and
`md3SelectedAgentSessionPath` (both must be declared before the constructor) and
one `react/jsx-no-bind` on the workflow-dispatch `onSubmit` arrow. All three
belong to the destination-wiring work that was rewriting this file at the same
time — that pass added 779 lines to it — and none of them is on a line this
change touched. They were left rather than fixed because moving a member
declaration in a file somebody else is actively rewriting is how a conflict is
manufactured. Whoever lands that pass owns them.

### Two defects found and repaired while documenting

- **Unobserved promises in the shell's Git handlers.** `onMd3Fetch`,
  `onMd3Push`, `onMd3CommitAndPush`, `onMd3Commit`, `onMd3SwitchBranch` and the
  fetch/pull/commit-and-push arms of `onMd3MenuCommand` each started a
  dispatcher promise with a bare `void`. React discards what a click handler
  returns, so a rejection was dropped — the exact defect
  `docs/features/quality-and-reliability/observed-user-initiated-operations.md`
  records against the old toolbar's handlers. All of them now go through the
  shared `observeUserInitiatedOperation`.
- **The new setting was not discoverable.** "Show the classic toolbar" had a
  `teleportAnchor` but no entry in the command-palette catalog, the settings
  search catalog or `teleport-targets.ts`, so it could not be found by name from
  either search surface. All three registrations were added, with real English
  and Cantonese copy.

### Remaining work, named

1. **The carry-over handlers are not wired.** `buildMd3CarryOverExtensions` is
   not called from `app.tsx`, so none of the forty-four renders in a menu today.
   This is **not** a capability loss: `views` is `md3NoViews`, so every
   destination renders the real repository workspace and build runner, and both
   legacy surfaces are on by default. Each becomes unreachable only when a
   destination's MD3 view replaces the legacy surface, so the change that wires
   a view must supply that view's handlers and check
   `md3UnplacedCarryOverCommands`.
2. **Two carry-over entries need a decision.** Log match navigation and log
   group collapse: the contract filters the log rather than dimming it, which
   may supersede match-stepping. Both survive in `runMenu`. Neither has been
   retired, and retiring one requires a `retired` record in
   `app/test/fixtures/feature-ledger.json` with a reason.
3. **Captures.** Every gallery frame still shows the pre-rewrite chrome. The
   capture-coverage contract (`ab2374968`) enumerates what must be replaced.
4. **The MD3 primitives do not ripple.** `Md3IconButton`, `Md3TonalButton` and
   `Md3GhostButton` render their own `<button>` and never call `attachRipple`.
   Recorded in the ripple feature document as the same open follow-up the
   toolbar controls already carry.
5. **Uncommitted at handoff.** The source-side repairs in item "Two defects"
   above touch `app/src/ui/app.tsx` and `app/src/lib/i18n-resources.ts`, which
   were being rewritten concurrently by the destination-wiring work. They are in
   the working tree and deliberately not committed here, so that in-flight work
   is not swept into a documentation commit. `command-palette-catalog.ts`,
   `settings-search-catalog.ts` and `teleport-targets.ts` carry the matching
   registrations and are in the same state, because their new rows reference
   i18n keys that live in the uncommitted catalog.

## 2026-08-10 — Land the audited history cache and request-guard repair

Issue #177 shipped the debugging bundle
`desktop-material-debug-handoff-31d3fd4.zip`, audited against
`31d3fd4618fddb9d0941cc9ffdbcba02e5299a14`. Its Phase 1 source-safe patch is
now applied, tested, and merged; the bundle's own patcher refused to run
because its reconstructed anchors differ from this tree in whitespace only, so
the changes were applied by hand against the real source and reviewed line by
line rather than forced through a fuzzy match.

What landed in `GitStore`:

- `commitLookup` is capped at **2,000** entries (`CommitBatchSize * 20`, twenty
  full history pages) with least-recently-used eviction. `storeCommits`
  refreshes insertion order, `lookupCommit` refreshes a cache hit, and a lazily
  loaded commit is routed through `storeCommits` so it is bounded too. An
  evicted commit is transparently reloaded by the existing lazy lookup.
- `reconcileHistory`, `loadCommitBatch`, and `loadHistoryBatch` release their
  request keys through `finally`. Before this, a handled Git failure or an
  unexpected throw left `history` or a batch key permanently in flight, and the
  affected view never loaded again for that session.

Two repairs outside the bundle were required to leave the gates green:

- `BuildRunSettings` and `GitIgnore` named their `componentDidUpdate` parameter
  `previousProps`, which the repository's `react-proper-lifecycle-methods` rule
  rejects. `yarn lint:src` was red on the default branch before this change.
- `script/prepare-cheap-lfs-oras-test.ts` asserted the Windows ORAS preparation
  ordering as raw file order. The trampoline-build change hoisted
  `verifyInjectedSassVariables` into `finishBuildAfterPreparation`, so the
  regex failed while the runtime ordering stayed correct. The test now asserts
  the real contract: the platform-guarded preparation promise gates
  `finishBuildAfterPreparation`, and that function verifies the Sass variables
  before packaging.
- `site/index.html` advertised 283 articles and 6 review-and-diff articles while
  `docs/` renders 284 and 7. `node script/sync-site-doc-counts.mjs` corrected
  the hub counts, which is the Pages half of issue #174.

Verification on this Linux container, with Node 22.22.2:

- `node script/test.mjs app/test/unit/git-store-test.ts`: **21/21 passed**,
  including the four new lifecycle regressions (handled reconciliation failure,
  thrown compare-batch failure, thrown all-refs failure, and the cache bound
  with recency preservation).
- `node script/test.mjs app/test/unit/app-network-action-boundary-test.ts`:
  **5/5 passed**.
- Full unit gate: **1,008/1,008 files**, **8,495 tests**, **8,443 passed**,
  **22 failed**, **13 skipped**.
- `yarn test:script`: **218 tests**, **208 passed**, **2 failed**, **8 skipped**
  (up from 206 passed and 4 failed before this change).
- `yarn lint:src`, `yarn prettier --check`, `git diff --check`, and
  `npx tsc --noEmit -p tsconfig.json`: all pass.

**The 22 unit failures and 2 script failures are not caused by this change and
are not claimed as fixed.** They are Windows contracts executed on a Linux
host: WSL distribution discovery, UNC and drive-root probing, packaged Dugite
path selection, 7-Zip stash export, `\`-separated ORAS staging paths, the
self-hosted runner manager, and `update-coming-soon`, whose renderer returns
`null` under `__LINUX__`. The exact same failing set was recorded on a stashed,
unmodified tree and after the patch — an identical list, proving no regression.
Windows CI remains the authority for those files.

**Not verified here:** packaged Electron build, Windows E2E, the screenshot and
accessibility matrix, heap soak evidence, and push/pull/commit stage timings.
Phases 2 through 7 of the bundle's plan — push, pull, and commit latency
instrumentation, the memory soak, the visual contract, and the release proof —
remain open and need a packaged Windows runtime. Do not read this checkpoint as
completing them.

## 2026-08-09 — Make self-hosted runner risk choice main-process owned

The Actions runner form still warns before setup and requires the two host-risk
acknowledgements plus a third acknowledgement for a completed known unsafe
finding. That third checkbox is intentionally not an IPC permission. Setup
reruns the current workflow and queue audits in the main process, presents a
Windows-owned confirmation containing the repository, complete labels, and
finding detail, and keeps a receipt only in memory for matching evidence during
that one setup operation. A safe recheck erases the receipt; a changed finding
requires a new native decision; **Start** and scheduled trust monitoring remain
strict and never reuse any earlier choice.

The manager now audits the complete runner label set—including `self-hosted`—
before creating the managed root or registration, rejects more than 20 custom
labels in the UI before a new preflight or setup request, and strips legacy
renderer-provided risk fields from persisted runner state on load.

Focused verification passes **94/94** across the runner contract, runner UI,
removal-dialog, automatic commit proof, diff-theme, style-token, and lifecycle
suites. The root TypeScript check passes, and the complete desktop test command
reports **1,008/1,008** discovered files and **8,494** tests with no failures
or React unmounted-state-update warnings. A production build run with the
repository-pinned Node **24.15.0** produced
`dist/GitHubDesktop-win32-x64/GitHubDesktop.exe`; the build script now owns a
short-lived event-loop handle until asynchronous packaging settles, so Node
cannot exit while Electron Packager is still copying the app.

**Stop-and-handoff boundary:** this local handoff intentionally stops before
`yarn package`, installer verification, remote CI, tag, and Release
publication. The unpackaged application directory is real build evidence, not
a verified Squirrel installer or a remotely published result.

**Preservation note:** the detached audit worktree that was present during the
initial inventory disappeared from disk and from Git worktree metadata during
this handoff. Its base commit
`d82f1fc1603ad3aa55cabdd016fd6b4adac4cce7` is an ancestor of `origin/main`,
but its staged index had uncommitted deletions and is no longer available to
inspect or recover. No cleanup command in this handoff removed that worktree;
do not describe its disappearance as a verified safe deletion.

## 2026-08-09 — Complete School mode and settle command shortcuts

School mode is now a complete Windows Appearance surface. It supports a
persisted custom name, local salted credential setup and unlock, immediate
English-only presentation, hidden language/playfulness controls and related
palette/settings-search rows, hidden scheduled language selection, and dim-sum
suppression. The renamed value is used by the visible mode surface, command
palette, and settings search; deleting the local profile remains the documented
reset route rather than a claim of security.

The command palette is bound to `Ctrl+Shift+P`. `Ctrl+Shift+F` remains bound to
opening the current repository in its folder, with a focused menu regression
test covering both accelerators.

Focused verification is **50/50** for the School mode, command-palette, and
settings-search changes, and `yarn lint:src` passes. The required hidden-desktop
capture is not claimed: the Lowlevel MCP server executes basic commands but
hangs on its required Git preflight. Remote CI and installer-release evidence
must still be read from the actual `main` runs.

## 2026-08-08 — Keep standard CI Windows-only and remove the 60-minute cap

The standard CI and automatic installer release gates no longer include the
Linux TUI. `ci-linux.yml` retains only platform-neutral lint and supply-chain
checks, `ci-windows.yml` retains the Windows desktop build and packaged E2E
jobs, and the installer publisher listens only to `CI Windows` and uploads only
the Windows installer payload. The manual combined Super Express lane is now
Windows-only as well; the separate manual TUI workflow and all TUI source and
historical verification records remain intact.

All explicit `timeout-minutes: 60` entries were removed from the desktop CI,
installer, and Windows emergency-release workflows. This removes the workflow
cap; it does not claim a remote run is complete until GitHub reports its actual
result.

Focused verification: the CI workflow safety and Super Express contract suite
passes **31/31**. Remote CI for the integrated commit and the resulting release
are pending and must be reported from their actual run and asset records.

## 2026-08-08 — Repair OAuth, public runner preflight, Actions layout, and release details

The Windows desktop source now follows the upstream GitHub Desktop OAuth request
shape: the authorization and token exchange omit an unregistered custom
`redirect_uri`, so GitHub uses the callback registered on the OAuth application.
The Actions runner manager now uses the rich searchable GitHub account picker,
honours the repository's persisted account binding, and permits public
repositories only after the immutable workflow audit proves that an untrusted
event cannot reach the managed labels. Unknown visibility and unsafe workflows
still fail closed.

The Actions run list fills the available row when no workflow detail is open and
returns to the resizable split when a run is selected. Release notes now have a
separate collapsible section from release metadata, preventing the notes from
appearing inside the Release details dropdown. Focused verification passed
**130/130** tests, including the OAuth, public-runner, searchable-account,
full-width Actions, and release-details contracts. Lint passed; the exact
production build and hidden-desktop capture were still in flight at handoff.

Changed source and tests are on `main` for the requested integration pass. Remote
CI, release publication, and the final cleanup proof must not be described as
green until their actual results are observed.

## 2026-08-07 — Opt-in post-clone runner provisioning

**Scope:** Single interactive private GitHub/GitHub Enterprise clones can opt
in to a Windows or dedicated WSL/Linux self-hosted runner. The clone dialog
keeps the feature off by default, requires a workflow-author trust acknowledgement,
does not expose it for public repositories, and excludes batch/background
clones. `Dispatcher.clone` triggers provisioning only after the new repository
is registered and its canonical GitHub remote matches the original selection.

**Changed:** Clone options, clone dialog and dispatcher, the trusted runner
manager, clone styles, focused tests, and repository-management documentation.
The main process now independently verifies that the target repository remains
private before allocating a local runner, WSL distribution, download, or
registration token.

**Verification:** focused clone option/UI tests pass **8/8**, the root
TypeScript check passes, and the documentation catalog check passes **19/19**.
A real runner needs an authorized private repository plus a Windows/WSL host,
so no local test claims live registration.

## 2026-08-07 — Harden the Windows self-hosted runner manager

The Windows Actions view now treats a managed GitHub Actions runner as one
repository-scoped, exact-account operation. Public or unknown-visibility
repositories are blocked. For a private repository, setup and every later
start prove that private-fork pull-request workflows are disabled, resolve one
default-branch commit, audit every workflow from that immutable commit, and
scan complete stable pending-run and job inventories for any labels that could
claim the runner. The setup-form result is bound to its current account and
proposed labels; **Start** deliberately performs a fresh audit against the
runner's live labels.

The main process keeps one-time registration and removal tokens in memory and
keeps Windows registration tokens out of command-line arguments. It never uses
runner replacement, rejects duplicate or inconsistent paginated inventories,
verifies the official runner package digest, and waits for the exact new
registration and complete label set to be online before reporting readiness.
Process ownership, process-tree termination, stopped-state postconditions,
exclusive operation leases, a lifecycle journal, restart reconciliation, and
stable GitHub absence checks now cover setup, start, stop, cancellation,
scheduled trust rechecks, removal, and shutdown. Ambiguous registration or
local metadata retains recoverable state instead of guessing that cleanup
succeeded.

The UI exposes contextual setup and start preflights, both security
acknowledgements, runner-specific accessible controls, cancellable in-flight
operations, and an irreversible removal dialog that keeps exact progress open
after submission. Suggested labels stay within 64 characters without losing
the platform suffix. Linux-in-WSL management is visibly disabled until the app
can prove in-distribution process-group cancellation; WSL is not presented as
isolation from the Windows host.

Focused local verification on the current source passes **48/48** tests:
`app/test/unit/self-hosted-runner-contract-test.ts` is **38/38**, and
`app/test/unit/ui/self-hosted-runner-manager-test.tsx` is **10/10**. The command
was:

```powershell
node script/test.mjs app/test/unit/self-hosted-runner-contract-test.ts app/test/unit/ui/self-hosted-runner-manager-test.tsx
```

The broader Windows app suite, exact production build, hidden-desktop runtime
exercise, live runner registration, and remote CI verdict remain pending. The
current source is not yet a published or remotely verified result. Detailed
behaviour and recovery guidance are in
`docs/features/integrations/self-hosted-runner-manager.md`.

## 2026-08-07 — Repair Windows CI, release contracts, and Pages validation

Repair commit `fef8e7e5574d88dbd2f5720a2c0d5799a44032bb` restores the
Windows CI setup and Super Express release contracts, regenerates the
documentation catalog and 279-article hub count, gives reruns a unique package
version, and replaces the AI merge editor's inaccessible hidden input buffer
with one controlled native text area that exposes the complete document and
submits one form value. Hardening commit `4954a74529` adds fail-closed coverage
for changed, missing, and non-ENOENT unreadable dependency manifests.

Local evidence before publication: the full script gate passed **219** with
**0 failures** and **2 expected skips**; the six originally failing unit files
passed **85/85**; the final AI editor pair passed **15/15**; the release and
manifest contract pair passed **11/11**; and the lifecycle-accurate nested app
install completed in 94.56 seconds without changing either app manifest.
Adversarial mutations proved the exact runner labels, token chain, run-attempt
version input, active shell programs, native editor, and every manifest failure
mode can each turn their own contract red.

The GitHub Actions, Pages, and direct Windows manual-release results remain
pending until these commits reach `main`; this handoff does not claim a remote
verdict or a published Release in advance.

## 2026-08-06 — Repair the blank Windows startup renderer

The packaged Windows renderer failed before React mounted with
`ReferenceError: __webpack_module__ is not defined`. The cause was the
Node-oriented `@github/copilot-sdk` ESM graph being concatenated into the
renderer through `CopilotStore`; the empty root and hidden-until-ready window
then presented as a blank white launch. `app/webpack.common.ts` now
externalizes the SDK, and `script/build.ts` fails before packaging if either
renderer bundle contains the undefined binding.

The focused contracts pass **14/14**. A production Windows build completed with
the external SDK present. The exact `dist/GitHubDesktop-win32-x64/GitHubDesktop.exe`
launched on the hidden desktop, reloaded through CDP with
`readyState=complete`, one populated `#desktop-app-container` child, and no
captured runtime exceptions. The genuine Lowlevel MCP capture is tracked at
`docs/assets/screenshots/material-blank-startup-fixed-20260806.png`, `960x660`,
SHA-256 `00D8BD6FCE0EFA10107523BF92BEA54E80DDA6ED66B8E3700B21297D6CBF2A82`,
and shows the first-run Desktop Material surface. The detailed
behavior, failure modes, security notes, and verification record are in
`docs/features/quality-and-reliability/renderer-startup-bundle-safety.md` and
`.codex/run-manifests/2026-08-06-blank-startup.md`.

The source branch still needs its commit, dew, default-branch integration, and
remote CI result before this handoff is complete.

## 2026-08-06 — Verify Super Express on the self-hosted pool

The pure self-hosted Super Express path now has remote runner evidence. Run
`31064587087 <https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31064587087>`_
at `60f32baf76` completed preparation and Linux TUI packaging on `linux`, then
ran the Windows lane on `CLAUDE`. The Windows lane passed the Git Bash
preflight, AllSigned-compatible PowerShell helpers, uv-managed Python 3.11,
the pinned Yarn shim, setup-node's Yarn cache probe, dependency installation,
and reached `Build production app`. GitHub's runner control channel cancelled
the job at `2026-08-06T02:26:44Z` before `Package Windows`.

Run
`31065485291 <https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31065485291>`_
at `3fe381f5f9` repeated the same self-hosted-only path on `COMPUTER`; Linux
TUI passed, the Windows setup and dependency stages passed, and the Windows
production build started. The runner control channel cancelled it at
`2026-08-06T02:46:25Z`, again before `Package Windows`. Both runs finished
`cancelled`, not `success`; both used `publish=false`, so no Release was
created. Self-hosted placement and prerequisite repair are verified, while a
completed Windows package/artifact and combined Release remain unverified
because the external cancellations occurred before packaging.

## 2026-08-06 — Scope run cancellation to Super Express

Ordinary push-triggered CI, installer, and Pages workflows continue to use
unique run-and-attempt concurrency groups with `cancel-in-progress: false`, so
a new push cannot cancel an earlier validation or publication run. The three
Super Express workflow files are the only exception: each uses a ref-scoped
`cancel-in-progress: true` group. A newer Super Express dispatch can therefore
free the scarce self-hosted runner from an obsolete release, while normal push
runs remain independent. The focused workflow safety tests now enforce this
allowlist and the group scope.

## 2026-08-06 — Bootstrap every self-hosted Windows dependency shell

The self-hosted Windows dependency setup now selects the requested Node.js
version before the repository-pinned Yarn bootstrap runs. The bootstrap copies
`vendor/yarn-1.21.1.js` beside two small launchers under `RUNNER_TEMP`: a
Windows `yarn.cmd` launcher and a POSIX `yarn` launcher for Git Bash. The
following Git Bash step converts the temporary directory to an MSYS path,
marks the POSIX launcher executable, and fails if bare `yarn` resolves anywhere
else. This covers both PowerShell/cmd actions and the Bash cache/install steps,
including Unicode and space-containing temporary paths.

The focused CI contract test passes **2/2**. A clean local
`node vendor/yarn-1.21.1.js install --frozen-lockfile` completed in 84.58s,
and an isolated probe selected Node `v24.15.0`, returned Yarn `1.21.1` from
both launchers, and resolved Git Bash to the temporary POSIX launcher. The
remote Super Express run after this change is still the required final
verification; a queued, failed, or cancelled run must not be reported as
green.

## 2026-08-06 — Keep Super Express scheduling self-hosted-only

The latest self-hosted-only release dispatch reached the registered Windows
runner, but its first prerequisite failed because that machine had no WSL
distribution installed. The exact remote failure was `Windows Subsystem for
Linux has no installed distributions`, so the Windows package never reached
dependency setup or compilation even though the Linux package passed.

The explicit release contract keeps every Super Express job on the registered
self-hosted pool: `linux` handles preparation, Linux TUI packaging, and
publication, while a registered Windows x64 runner handles the Windows
package. The direct reusable Windows and Linux TUI workflows use the same
static `[self-hosted, Windows, X64]` and `[self-hosted, Linux, X64]` labels. A
busy or unavailable local runner queues or fails the release; it never moves
to a GitHub-hosted machine. `uv python install 3.12` remains responsible for
the Linux TUI's pinned interpreter, and self-hosted Windows setup uses uv for
Python 3.11 after the Git Bash preflight.

The workflow contract test asserts the static self-hosted labels and rejects
hosted targets, runner-selection, and cloud-fallback shapes. Focused workflow
tests, YAML parsing, actionlint, Prettier, and `git diff --check` are the local
gates; the next remote Super Express run is the required post-fix evidence.

## 2026-08-05 — Multi-remote fetch sync

The ordinary Fetch path now uses every configured remote when a repository has
more than one. A single-remote repository retains the existing `Fetch <remote>`
copy and focused selection. Multi-remote repositories expose `Fetch all
remotes` in the toolbar and dropdown, with a status description that names the
expanded scope. The store keeps current/default/upstream remotes first and then
adds the remaining configured remotes once each.

Changed implementation and test files:

- `app/src/lib/stores/git-store.ts`
- `app/src/lib/app-state.ts`
- `app/src/lib/stores/app-store.ts`
- `app/src/lib/stores/repository-state-cache.ts`
- `app/src/ui/app.tsx`
- `app/src/ui/toolbar/push-pull-button.tsx`
- `app/src/ui/toolbar/push-pull-button-dropdown.tsx`
- `app/test/unit/git-store-test.ts`
- `app/test/unit/ui/push-pull-button-test.tsx`

Focused verification is **19/19** tests passing. The exact Windows production
build completed with packaging skipped. The real hidden-desktop renderer
displayed **Fetch all remotes** and **Fetch the latest changes from every
configured remote** for a two-remote fixture without clipping in the inspected
frame. The unmodified development renderer still logs its existing
`__webpack_module__ is not defined` startup error, so the visual probe used a
temporary CDP startup shim and does not claim packaged-release proof. A later
capture-only DOM-removal attempt triggered the disposable app's crash boundary;
that contaminated frame was discarded. Documentation is in
`docs/features/repository-management/multi-remote-fetch-sync.md` with index,
README, roadmap, and feature-list references.

On the merged linked checkout, the first focused test invocation found the
declared `windows-argv-parser` native output missing from `app/node_modules`.
Running `yarn install --immutable` rebuilt that vendor dependency; the same
focused command then passed **19/19** without source or lockfile changes.

## 2026-08-05 — Harden the Windows dependency cache and preserve Team View styling

The CI dependency-cache hit path now validates the actual Electron runtime,
targeted Copilot package, and `react-confetti` ESM entry for the current
runner and architecture before reusing an installed-dependency cache. The
final dependency verification checks the same `react-confetti` runtime file,
so a cache containing only package manifests cannot skip installation and then
fail later in the renderer build.

The Launchpad Team View selectors now live in the shared `.launchpad-view`
scope rather than only inside the `max-width: 520px` media query. Team View
therefore retains its layout and state styling on desktop as well as narrow
Windows windows, while the Sass-safe parent-selector structure remains intact.

Local verification is **32/32** focused CI, dependency, workflow, and
Launchpad tests, passing ESLint type-checking, and `git diff --check`. A fresh
production renderer compile after this styling and cache follow-up is still
pending; remote Windows/Linux runs remain queued.

## 2026-08-05 — Settings account cards keep one active identity across providers

Settings → Accounts was using the first card in each provider section as its
active marker. A GitHub.com account and a GitHub Enterprise account could
therefore both appear active, while neither exposed **Make active**. The
surface now compares every account with the single global `accounts[0]`
identity and applies the same predicate to GitHub.com, Enterprise, GitLab, and
Bitbucket cards. Clicking **Make active** updates the controlled account order,
so the target row becomes active and the previous row becomes actionable.
Explicit repository account bindings remain authoritative.

Source commit `7a757f5b75d627e1b4b7ae5ed47b2181638fefa0` contains the fix and
regression test. Focused account/store/routing/UI verification passes **39/39**;
targeted ESLint, Prettier, and `git diff --check` pass. The required Lowlevel
production build has not yet returned because its shared endpoint is servicing
another long-running build. No hidden-desktop capture or runtime success is
claimed until that route is healthy.

## 2026-08-05 — Account-aware repository transfer (verification in progress)

The Windows Electron app now has an account-aware **Transfer repository**
workflow. It can add another GitHub.com or GitHub Enterprise identity through
the existing sign-in dialog, choose a personal or organization owner, keep or
rename the destination repository, and choose privacy. **Full history** uses a
temporary bare clone to publish every local branch and tag. **Clean state**
creates one root snapshot commit, retains the previous tip under a local
`refs/desktop-material/transfer-backups/` recovery ref, and publishes only the
current files. Both routes verify the destination tip before retargeting
`origin` and preserve the source as `upstream` when needed.

The entry points are the Repository menu, repository-list context menu, Command
Palette, and **Repository settings → Remote**. The transfer dialog requires two
independent confirmations plus a full-range authorization slider, and displays
real checking, creation, preparation, publication, retargeting, and completion
progress. Focused direct Node contract tests pass **7/7**. Targeted ESLint
passes, and the changed-path TypeScript check reports no diagnostics in the
transfer files although the repository-wide command exits on existing
TypeScript 6 findings. The exact Windows production build reached the full
renderer/main bundle after the missing local file-package outputs were rebuilt,
but remained nonzero on four existing TypeScript 6 errors in `dds-converter.ts`,
two fixture typings, and `ui/index.tsx`; it did not emit a runnable
`out/main.js`. The repository-wide test harness remains blocked before test
discovery by the malformed `whatwg-encoding` dependency payload, so
hidden-desktop runtime evidence is not claimed.

Implementation commit
`6c3a4ec8297e79226968a89e3232ba281c539357` contains the feature, tests, and
documentation update. Hardening commit
`5e96aad79e82bc597b5c1233fccd17c0b37ce7fa` preserves known-private defaults
and verifies the exact destination tip before retargeting. Verification and
changelog commit `8ac2bf5cfce2f4645fa4ead4e7cf05e23cd59478` records the run
manifest and current evidence.

## 2026-08-05 — Make Super Express release self-hosted-only

The Super Express Release path is now deliberately self-hosted-only. The
combined dispatcher runs preparation and publication on the registered Linux
x64 WSL runner, the Windows package runs on `[self-hosted, Windows, X64]`, and
the Linux TUI package runs on `[self-hosted, Linux, X64]`. The direct Windows
and Linux TUI recovery workflows use the same static labels. Hosted selectors,
`ubuntu-latest`, `windows-2022`, cloud fallback jobs, and runner-inventory
branching were removed from all three Super Express workflow files. If a
required local runner is offline or busy, the release queues or fails rather
than silently consuming a cloud runner.

Because the Linux runner is Debian 13, the dispatcher publisher also installs
the pinned `uv` tool and Python 3.12 through `uv python install 3.12`; TUI
version discovery uses `uv run --python 3.12`. This keeps the pure self-hosted
path independent of the `actions/setup-python` distribution manifest that
previously lacked a Debian 13 Python 3.12 entry.

The focused workflow contract now asserts that all three workflow files
contain only the expected static self-hosted labels and no hosted target or
fallback selector. Pure self-hosted run
`31063281760 <https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31063281760>`_
at `eb5a769c51` proved `Prepare exact release target` and the Linux TUI package
on runner `linux`; the Windows package reached runner `COMPUTER` but stopped
before its build because `shell: bash` resolved to the Windows WSL launcher,
which reported that no WSL distribution was installed. The Windows action and
shared setup action now prepend the installed Git Bash directory to
`GITHUB_PATH`, and fail with a direct prerequisite message if Git or Git Bash
is absent. That repair is in the next pushed revision; no Release was created
because this run used `publish=false`.

Follow-up pure self-hosted run
`31063591401 <https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31063591401>`_
at `4a9afbbbf7` proved preparation and the complete Linux TUI package on
`linux`, and reached the Windows build on `CLAUDE` with Git Bash selected. It
then failed in the shared `actions/setup-python@v6` step while installing
Python 3.11 into the self-hosted toolcache (`Error happened during Python
installation`). The next repair keeps hosted runners on `setup-python`, but
uses pinned `uv`, `uv python install 3.11`, and its discovered interpreter path
for `npm_config_python` on self-hosted Windows. This run also used
`publish=false`, so it created no Release.

## 2026-08-05 — Fix Super Express workflow startup planning and repair build prerequisites

The Super Express dispatcher keeps preparation and publication on
`ubuntu-latest`, while its combined packaging jobs and its two direct reusable
packaging lanes each check the repository runner inventory on a hosted
selector. When an online, idle matching runner is available, exactly one
static conditional job uses `[self-hosted, Windows, X64]` or `[self-hosted,
Linux, X64]`; otherwise the lane uses `windows-2022` or `ubuntu-latest`. The
earlier dynamic self-hosted fallback tried to build a multi-label `runs-on`
value from job outputs; GitHub marked those dispatches `startup_failure` before
creating a job, so no runner log existed to diagnose. The combined dispatcher
now inlines its static selector/build jobs instead of calling the reusable
workflows, because the caller itself remained planner-invalid after the lane
repair. Static targets retain schedulability while allowing the requested
self-hosted-first behavior and keeping the zero-test emergency lane and direct
artifact-only lane behavior unchanged.

The workflow contract test now asserts the fixed labels and rejects the
dynamic runner-selection shape. The setup action now checks cached React JSX
runtime and `react-confetti` files before use; an incomplete cache automatically
returns to the bounded dependency install path. The source Sass error at
`app/styles/ui/_launchpad.scss:278` was corrected by nesting the team selectors
under `.launchpad-view` inside the media query, so Sass can resolve every
`&__…` selector against its real parent.

Local verification is **9/9** focused CI/dependency/workflow tests, YAML
parsing, Prettier, and `git diff --check`. The full production compile was
attempted with the repository-pinned TypeScript and a supported local Node 24
runtime, but the webpack process exceeded the four-minute local bound without
returning a client verdict; no production-build success is claimed from that
attempt. The earlier cloud Windows fallback run `31060316032` was red at the
Sass error and also reported `react/jsx-runtime` resolution from its incomplete
dependency cache. The cache repair and Sass correction address those reported
causes.

The matching Windows and Linux self-hosted runners were online and idle during
inventory checks. Follow-up combined dispatches `31060759025`, `31061020998`,
and `31061157152` created the selector and static build jobs but were cancelled
by an external concurrent-run sweep before any selector or build step ran.
Self-hosted execution and a post-fix remote green build therefore remain
unverified; no Release was published by these `publish=false` dispatches.

## 2026-08-05 — Close remaining Windows TypeScript build gaps

The merged default-branch tree exposed five additional TypeScript diagnostics
across three seams after the dependency and stylesheet failures were
corrected. The provider
triage label switch now handles the `self-hosted` account provider. The
self-hosted OAuth error path now captures and validates the active
authentication state before updating it, so a nullable store state cannot be
spread into an invalid sign-in state and a callback race cannot overwrite a
replacement flow. The SignInStore regression fixture now records callback
accounts in a typed list and asserts exactly one authenticated account before
checking its provider, endpoint, and login.

Local evidence for this follow-up is **41/41** focused tests across SignInStore,
provider triage, and CI workflow safety; passing ESLint type-checking; and an
isolated production renderer compile with **0** Webpack errors. The compile
also emitted only the existing Sass deprecation warnings and no Koffi,
JSX-runtime, Sass parent-selector, or TypeScript errors. Fresh remote Windows
and Pages verification for the integrated fix is pending.

## 2026-08-05 — Restore Windows production build compatibility

The final Windows verification of the retired tooling correction reached the
production compiler but failed on three dependency and stylesheet edges. The
application now pins `@github/copilot-sdk` back to `1.0.5`, which removes the
Koffi native dependency introduced by `1.0.8`; the supplied dependency-install
trace showed the retrying native failure while Koffi's optional platform
packages were being resolved. The version-specific `1.0.8` declaration shim is
removed with the rollback.

`react-confetti` `6.4.0` keeps its React 16 JSX-runtime support, but its ESM
entry asks Webpack for `react/jsx-runtime` without an extension. The common
Webpack configuration now aliases that exact request to the installed
`react/jsx-runtime.js` file, preserving strict ESM resolution for other
dependencies. The Launchpad Team View styles are also nested under their
`.launchpad-view` parent so Dart Sass no longer rejects a top-level `&` selector.
The CI workflow guard now matches the integrated removal of the retired
agent-only submodule instead of requiring a stale `.gitmodules` block.

Local evidence for this correction is **3/3** dependency compatibility tests,
**13/13** Launchpad tests, **12/12** CI workflow-safety tests, passing ESLint
type-checking, and an isolated production renderer compile with **0** Webpack
errors. The earlier full production compile showed the other five compilers
finishing successfully; the renderer's two reported errors are covered by the
isolated rerun. Fresh remote Windows and Pages verification for this correction
is pending.
## 2026-08-05 — Keep private tooling out of hosted CI checkout

The first remote Windows verification after the dependency repair reached the
runner but failed while recursively cloning
`vendor/lowlevel-computer-use-mcp`: that submodule is agent tooling whose
history is not available to the hosted workflow token. The desktop build does
not consume it; the three public product submodules remain available. The first
correction used `update = none` to keep recursive checkout from attempting the
unavailable agent-only clone. The subsequent integration at
`883c1b6c6b01ca1371d590d2971e756ff5ed9039` removed that retired gitlink and
its registry entry entirely, leaving only the three public product submodules
in `.gitmodules`. Fresh remote verification of that integrated correction is
pending.

## 2026-08-05 — Preserve dirty work while creating a destination worktree

The dirty branch-switch dialog now offers **Leave my changes here**. It closes
the decision dialog without stashing or checking out the dirty source, opens
the existing Add worktree flow with the destination branch and suggested name
prefilled, and leaves creation and switching until the user confirms a path.

### Verification

- Source commit: `c41ae8345a`.
- Focused UI test: **1 passed, 0 failed**.
- Targeted Prettier and ESLint: **passed**.
- Isolated TypeScript check: **passed**.
- The exact production build was attempted through the required hidden
  verification route but stopped before renderer emission on the pre-existing
  `origin/main` Sass error at `app/styles/ui/_launchpad.scss:278`. A
  disposable renderer-only build with that unrelated selector wrapped emitted
  the fresh renderer used for capture.
- Hidden-desktop runtime: **verified**. The source fixture retained one
  modified `README.md` on `feature/worktree-switch`; the created destination
  worktree was clean on `main`; the application switched into it with zero
  stashes.
- Captures:
  - `docs/verification/dirty-worktree-worktree-option-20260805/dirty-worktree-switch-dialog.png`
    (960×660, SHA-256
    `0FF723C7361C6A9125B9C95AF9A9C40614C5B7B646BBC061A18C0B0D56DDDAB7`).
  - `docs/verification/dirty-worktree-worktree-option-20260805/add-worktree-prefilled.png`
    (960×660, SHA-256
    `54B29ACF0B6A31CAA18E701BF413D720F161C65D3BA9DF5626A4747A3BD5588C`).

GitHub integration and remote CI evidence are recorded after the source and
documentation commits land on the default branch.

## 2026-08-05 — Direct Super Express lane dispatch actions

The Windows and Linux TUI Super Express packaging workflows now each expose a
manual `workflow_dispatch` action in addition to their reusable `workflow_call`
entry point. Direct dispatches are restricted to `main`, default to the
dispatched commit, validate the same packaging payload, and upload an
artifact-only recovery result. They never publish independently, preserving the
combined dispatcher's one-Release update/bootstrap contract.

## 2026-08-05 — Restore CI-compatible dependency pins

The Dependabot upgrades to TypeScript `6.0.3` and `@types/request` `2.48.13`
made the Windows setup action fail before the desktop tests could start:
TypeScript 6 rejected the repository's legacy project layout, and the newer
request declarations introduced an incompatible `tough-cookie` type graph in
the vendored compile. The dependency manifest and lockfile now restore
TypeScript `5.8.2` and `@types/request` `2.0.9`, the versions compatible with
the current setup action and vendor sources. The same dependency group also
carried `tsx` `4.23.1`, which transforms JSON imports incorrectly under the
test runner, and `@types/react-virtualized` `9.22.3`, which removed the
`Grid.propTypes` declaration used by the app; those are restored to `4.19.3`
and `9.7.14` as well.

The same correction refreshes the Pages Docs hub from **254** to **264**
rendered articles using `node script/sync-site-doc-counts.mjs`; the committed
check now agrees with the current `docs/` tree. Remote CI verification is
pending for the resulting default-branch commit.

## 2026-08-05 — Cross-provider account switching correction

The rail account switcher was calling the real `promoteAccount` path, but the
account store immediately re-sorted a selected GitHub Enterprise account behind
GitHub.com. Because the rail derives its active indicator from `accounts[0]`,
the UI appeared to switch and then silently returned to the previous account.
The store now preserves the promoted account at `accounts[0]` across providers,
sorts only the remaining accounts, and persists that order for the next launch.

### Verification

- `node script/test.mjs app/test/unit/accounts-store-test.ts` — **21/21**.
- `node script/test.mjs app/test/unit/get-account-for-repository-test.ts` —
  **12/12**.
- Combined account-switcher contracts and interaction coverage — **55/55**,
  including the new real click-handler test.
- The required production build was attempted through the hidden Lowlevel
  route. Its compiler worker stopped without a returned client exit status, so
  the rail surface has no runtime capture and no runtime success is claimed.

## 2026-08-05 — Super Express packaging lanes parallelized

The manual Super Express dispatcher now keeps one combined immutable Release
but runs Windows x64 and Linux TUI packaging in separate reusable workflows.
The Windows lane owns the desktop dependency cache, build, Squirrel payload,
portable ZIP, and installer assets on `windows-2022`. The TUI lane builds on
`ubuntu-latest` with `uv build` and locked runtime constraints, and carries the
bootstrap and installer scripts as executable assets. A single publisher
downloads both lane artifacts so the shared Squirrel `latest` feed and TUI
bootstrap URL cannot land on separate partial Releases.

Local proof for this change is **16/16** application workflow-contract tests,
**10/10** TUI installer-contract tests, passing Prettier/YAML parsing, and
`sh -n` success for both checked-in TUI shell scripts. No remote Actions run
or Release is claimed by this handoff entry yet.

## 2026-08-05 — Partial Releases no longer steal the Windows update feed

Commit `a4ce485037138f24d7534452a861a1fb7749beeb` hardens
`.github/scripts/promote-current-release.sh`: a published Release may own the
Windows `Latest` alias only when it includes both the Squirrel `RELEASES`
manifest and a `*-full.nupkg` package. This prevents a newer Linux/TUI-only
partial Release from making `releases/latest/download/RELEASES` return 404 to
the Windows app.

### Verification

- Focused version-order, CI-workflow-safety, and automated-release-notes
  suites: **29 passed, 0 failed**.
- The previously broken live alias was repaired to the existing
  Windows-capable Release `v3.6.3-beta3-zadwftypqg`, whose assets include
  `RELEASES` and both full Squirrel packages. The exact
  `releases/latest/download/RELEASES` URL now returns **HTTP 200**.
- The required Cheap headless production build was attempted, but terminated
  after about 800 seconds before emitting the renderer output; no About-dialog
  screenshot is claimed from that incomplete artifact. The direct release
  metadata and HTTP feed proof above are the available runtime evidence.

### Remote state

The fix was merged into `main` as `6f5cf66c30`, with source commit
`a4ce485037138f24d7534452a861a1fb7749beeb` and documentation commit
`96fcc0a2d14cd2f791fd51f6b470ae7f225695aa`. The integrated tree passes the
focused suite with the repository's pinned Node `24.15.0` invocation: **29
passed, 0 failed**. The repository wrapper's additional `--conditions=import`
flag is not used for this proof because its current `tsx` loader path changes
the `whatwg-encoding` JSON import shape before the test can start.

The dewed integrated tip was `bc63986119e2c71cc28d98e1465c9c8501c25f58`.
Its current-SHA remote evidence is recorded precisely: `Deploy Pages` run
[31056983826](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31056983826)
passed; **CI Windows run
[31056982528](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31056982528)
failed** because the Windows jobs could not clone the configured
`codingmachineedge/lowlevel-computer-use-mcp` submodule (`repository not found`),
and the follow-on production step could not find `cross-env`. The dependent
`Build Installers / Express Release` run
[31057063196](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31057063196)
was blocked because its trigger was `workflow_dispatch`, not this repository's
main push CI, so no Release was published. These are external CI/submodule
blockers; the updater guard's local tests and live HTTP feed proof remain
verified.

The enabled GitHub Wiki recovery note was committed as
`34cb7157716cd846117ad9e86fe876dd70c389b2` and is now published on its
`master` branch. An initial publication attempt used a stale Git credential
and returned HTTP 403; `gh auth setup-git --hostname github.com` refreshed the
credential path, after which the exact commit landed and the Wiki checkout is
clean.
## 2026-08-05 — Actions job-log transient 404 recovery

This Windows Electron fix was developed in the new linked worktree branch
`codex/job-log-404-fix` at commits
`33f54a69825d97083dc8f0b1fb134b353e9686ca` and
`e85cf787e3aea81ac28679f00b3b0201507af133`, and the integration checkout
carries those commits into the default branch.
GitHub can briefly return `HTTP 404`
while a valid completed-job log archive is being prepared. The main-process
transfer now retries only that API response after 250/750/1,500 ms waits,
restarts from the original API endpoint for a fresh signed redirect, and keeps
the bearer header off cross-origin blob requests. A follow-up audit separates
the retry count from the redirect-hop budget, proves cancellation during
backoff prevents another fetch, and asserts the blob-404 request has no bearer
header. The log viewer explains the provider state and exposes **Retry** and
**Open on GitHub**; its test checks the link destination and external
activation. The unrelated
Launchpad Sass brace correction is included because it was the build-blocking
syntax error discovered while producing the required renderer artifact.

### Verification receipts

- Focused transfer/viewer tests: **20 passed, 0 failed** (including the
  redirect-budget, abort-during-backoff, blob-header, and external-link
  audit regressions).
- `tsc --noEmit -p tsconfig.json`: passed.
- Changed-file ESLint and Prettier checks: passed.
- `git diff --check`: passed before documentation and capture promotion.
- Standalone renderer diagnostic: `hasErrors:false`. The final exact
  `yarn build:prod` command completed with the fresh Node 24.15.0 runtime in
  **512.78s**, passed the Sass/license checks, produced fresh
  `out/renderer.js`, `out/main.js`, stylesheet, and `out/index.html` outputs,
  and packaged `dist\\GitHubDesktop-win32-x64`. Signing was not run.
- Genuine hidden-desktop capture at **1400×1000** from the built artifact:
  `docs/assets/screenshots/material-actions-job-log-404-recovery.png` shows the
  final 404 explanation and both recovery controls (SHA-256
  `444AA612720799BCB6107BFD7B3CEED66E56252E82E724B1C26559F347968972`).
  `docs/assets/screenshots/material-actions-job-log-404-recovered.png` shows
  the two expected log lines after Retry (SHA-256
  `83D9704989173353467E8C5B079B8D3905A0C52AF6283AC7C09FAB92D2B15A78`).
- In the dedicated 404-to-Retry acceptance sequence, the fixture recorded four
  bounded 404 attempts followed by one successful transfer after the user
  activated Retry. The final recapture used the same built artifact after the
  fixture was reset and also rendered both states. No credential, token, or
  personal path appears in either promoted image.
- Teardown evidence: the exact Electron process, fixture server, isolated
  headless desktop, and isolated MCP server were stopped; the fixture listener
  is absent and three owned keytar entries were removed. The host shell policy
  blocked deletion of the explicitly named temporary capture roots and helper
  scripts, so those recoverable artifacts remain outside the repository.

The task-branch workflows were cancelled by workflow concurrency, so no remote
green result is claimed here. Release publication remains an external
follow-up after the default-branch workflow produces its verified installer.

## 2026-08-04 — Live Material renderer proof and startup cleanup

The design reference is now verified against the real production Electron
renderer rather than only the static `design/` file. Commit
`ab8c26d7535c9861f81b761e73798d1363bd78e1` also fixes a startup race in
`app/src/ui/repository-settings/repository-settings.tsx`: asynchronous initial
settings reads now begin after mount and stop updating state after unmount.
That removes the React warning that appeared when the settings surface closed
while its reads were still pending.

### Verification

- Focused Material/UI contract suite: **47 passed, 0 failed**; the unmounted
  state-update warning is absent.
- Targeted ESLint for `repository-settings.tsx`: **passed**.
- Cheap headless production build:
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod` — **exit 0 in 291.45s**. The build
  emitted the renderer and main outputs and completed its shell-extension,
  license, and stylesheet checks; existing Sass/Node deprecation warnings are
  non-fatal. Packaging was intentionally skipped for this renderer proof.
- Hidden-desktop runtime: **verified**. The built `out/main.js` launched on a
  uniquely named hidden desktop, showed first-run setup, completed the
  no-sign-in path, added a disposable Git fixture, and reached the live
  repository workspace with Changes, History, Triage, Repository tools, and
  Branches surfaces visible.
- Cleanup: **verified**. The exact launch PID was closed and the owned hidden
  desktop/temp root were removed.

### Remote checks and boundaries

Run [30928494987](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30928494987)
is still in progress. Its Lint job reports four pre-existing formatting
findings (`.act-super-express-event.json`,
`.github/workflows/build-installers.yml`,
`app/test/unit/site-accessibility-test.ts`, and
`tui/src/desktop_material_tui/assets/changelog-catalog.json`), while TUI jobs
have also failed; Windows x64/arm64 and CodeQL are still running. The changed
renderer file passes its targeted ESLint check. The TUI scope is explicitly
closed, so those unrelated TUI failures are recorded rather than changed in
this Windows Electron milestone.

The follow-up run for `0969cbbb76ed18fe4f6d79d33ad95b6ae96a38d9`,
[30929478484](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30929478484),
has the same Lint/TUI failures. Windows arm64 also built and uploaded its
artifact, then failed `Run script tests` because the committed documentation
hub catalog and index are stale relative to the already-merged TUI articles.
Running `yarn generate-docs-hub-catalog` followed by `yarn test:script` passes
locally (**214 tests, 213 passed, 1 optional skip**), but the generated diff
is entirely for the closed TUI documentation surface and is intentionally not
carried into this Windows Electron task. Windows x64 and E2E remain remote
checks in progress at this handoff update.

The local package/signing step was not part of this proof and no signing policy
was changed. No release is claimed by this handoff entry.

### CI formatting follow-up

Commit `a89900dd419e4dd78031516dea10c4edb1df9b38` formats the two installer
workflow `TUI_CONSTRAINTS_NAME` environment assignments reported by the remote
Lint job. It is a formatting-only change: installer behavior and the
intentional skip-signing contract are unchanged. File-scoped Prettier and the
Git whitespace check passed, and the commit is on `main`.

- CI: [30931585531](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931585531) — queued at this handoff update.
- Cheap LFS: [30931582576](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931582576) — verified green.
- Code scanning: [30931582659](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931582659) — queued or still running.

The remaining TUI catalog formatting and stale TUI documentation output are
not changed because the Windows Electron task keeps the TUI scope closed.

### Desktop lint correction

Commit `a9c69adfde9bb97cd03e48a99783ff6e6a5a87f1` formats only the desktop
`app/test/unit/site-accessibility-test.ts`. Its focused accessibility contract
suite passes **11/11**, and file-scoped Prettier passes. The commit is on
`main` and is covered by [CI 30932145369](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30932145369)
and [Cheap LFS 30932145377](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30932145377),
which were queued behind earlier Windows/TUI work at this handoff update.
The remaining formatter finding is the closed-scope TUI catalog.

## 2026-08-04 — Search registry and changelog catalog correction

Commit `77c7b1ebc6cee54c9e0b1febf5a6b67496477891` registers the repository
settings tab surface in the collection search registry, updates its appearance
contract test for the descriptor-based UI, and aligns the Pages screenshot
gallery contract test with the tracked CSS. The focused suites pass **39/39**;
Prettier and the Git whitespace check pass.

Commit `0b004744bb3f228651fdc8a2c693d57d9f933da1` restores the 12 newest
`3.6.3-material22` records already present in `changelog.json` and updates the
catalog count to **4151**. The changelog suite passes **24/24**, with one
explicit release-tag date skip because this checkout has no matching
`release-*` tags; historical dates were not rewritten from incomplete local
metadata.

The full script suite currently reports **214 tests: 210 passed, 3 failed,
1 optional skip**. All three failures are the already-closed TUI documentation
scope: a stale committed docs-hub catalog and two missing Linux TUI pages. No
desktop script contract failed. CI run
[30935849771](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30935849771)
is queued; no release or installer success is claimed here. The Squirrel
Windows packaging job continues to skip signing as required by the current
contract.

## 2026-08-03 — App fixes: repository list, Cheap LFS, local Actions, CI

A session of defect work across the app and the test harness. Everything below
is on `main` and dewed; the one item that is *not* finished is named at the end
rather than left for someone to discover.

**The Repositories list rendered nothing while holding repositories.**
`SectionList` tested one value and constructed another: the capability guard
asked about the global `ResizeObserver` while the constructor used
`window.ResizeObserver`. Whenever the two disagreed the guard passed and `new`
threw on undefined — and a throw in a component constructor unmounts the
subtree rather than degrading it, so the panel came up empty instead of falling
back to an unobserved list. Fixed in `bcd832d40e`; the guard now asks whether
the value it is about to construct is callable. A separate change gives the
genuinely-empty case real copy and the three creation paths as operable
buttons, because the old empty state apologised for failing to find a
repository the user had never searched for.

**Cheap LFS aborted a large commit on a momentary lock.** "Could not
canonicalize the repository root" turned out not to be about the root at all:
probing that exact repository afterwards canonicalizes cleanly. On Windows
`realpath` must open a handle to ask for the final path, so it queues behind
virus scanners, indexers, and Git's own working-tree writes; during an
18,750-file commit that contention is routine and lasts milliseconds.
`0612c7c538` retries the transient codes (EACCES, EAGAIN, EBUSY, EIO, EMFILE,
ENFILE, EPERM, UNKNOWN) and excludes ENOENT on purpose — a repository that is
not there is not busy. It still fails closed, and the reparse-point checks
still run on whatever comes back; only the waiting changed.

**Local Actions runs work without a manual install.** `act` stops on an
arrow-key menu asking for a default image when it has no platform
configuration; spawned from the app its stdin is not a terminal, so the console
read fails and Windows reports `Incorrect function` — an error that never
mentions images. `d023f5ef92` passes the platform mappings up front. `act`
itself is now installed automatically into the app's own data directory
(`ccad989359`), user-scoped, no elevation, and a PATH-resolved copy always
wins. Two things worth keeping: the asset spellings are the release's own
(`x86_64`, not `x64`), and extraction must use the absolute System32 bsdtar —
where Git for Windows or MSYS is installed their GNU tar shadows it and reads
`C:\...` as `host:path`, failing a purely local copy with `Cannot connect to
C: resolve failed`.

**Settings tabs are no longer positional.** The `RepositorySettingsTab` enum
was *defined* to equal the TabBar's child indices, with a note asking
integrators to keep them contiguous. That holds only while the list is a fixed
run of children — the moment a filter removes earlier rows, clicking one opens
whichever page sits at that number. `eb7fadc805` gives each row a descriptor
carrying the tab it selects and resolves clicks through the filtered list, then
adds the search field the shared rules require. The open tab stays listed even
when it does not match, so the strip can never empty and strand a selection the
panel is still rendering.

**CI: memory exhaustion was real, and it was not the tests.** `node --test`
runs one worker per file and V8 sizes each worker's old-space from the
machine's memory, so four workers on a 16 GB runner were entitled to the whole
machine before git or Windows asked for anything. Windows charges reserved
commit, so it hit the limit long before the tests wanted the memory, and the
damage landed as scattered, unrelated-looking failures: "paging file is too
small", "Not enough memory resources", `spawn UNKNOWN`, git "Out of memory",
V8 "Array buffer allocation failed". `b02a3ff611` bounds per-worker heap and
derives concurrency from memory as well as cores. Verified: none of those
strings appear in the CI unit log afterwards.

**Testing notes worth reusing.** Module mocks in a `.tsx` test must be followed
by `require`, not a static import — the file compiles to CommonJS, so `require`
resolves at call time and picks the mocks up while a static import hoists above
them, and top-level `await import` is a parse error under that output format.
Dialogs render inside a `<dialog>` element that jsdom treats as closed, so role
queries against them need `{ hidden: true }`. Stub git per test file rather than
in the shared globals: several suites run git against real repositories on
purpose and a global stub disarms them silently.

### Open: `agent-sessions-panel-test.tsx` is pathologically slow

Two tests that complete in ~44 ms on an idle machine take 250–500 s, and the
file fails. This is *not* caused by the worker heap cap or by the section-list
repair — both were ruled out by substitution (restoring the pre-repair
section-list still reproduces it; so does raising the heap back to 4 GB), and it
was already taking 127 s in CI before either landed. Do not re-test those two.

DOM accumulation is ruled out too: rendering the panel repeatedly leaves 13
elements and one body child every time, so Testing Library cleanup is working
and the queries are not scanning a growing document.

The per-test ceiling cannot help here, and the reason is worth knowing before
anyone retries it: `node --test` can only time a test out between awaits, and
these tests are synchronous. Whatever is burning the time is blocking the event
loop, which also means the cost is inside a synchronous call — a render or a
query — rather than in anything being waited on.

`a2c25bf537` added a 120-second per-test ceiling so a wedged test names itself
instead of the batch failing at file level with nothing to act on. It has not
had the effect hoped for here: the run still ends at file level rather than
naming the two tests, so the next step is to establish why `--test-timeout` is
not firing for them before spending more time on the underlying slowness.

# Desktop Material — Active parity handoff

## 2026-08-03 — Integrate-and-clean pass, and the Linux TUI is back on main

The TUI scope was reopened by the user during this session, so the revival
branch was integrated rather than kept aside. `main` now carries it.

### What was preserved before anything was touched

The linked worktree at `desktop-material-linux-tui-revival` was holding **20
modified and 39 new files, all under `tui/`** — uncommitted, which is the only
kind of work a wiped directory takes with it permanently. Committed first as
`dbbb3431c8`, before any merge: multi-account sign-in with keyring-backed
secrets, a bounded agent surface (CLI, client, access policy, local server) with
its Postman collection, GitLab and Bitbucket provider clients, Build & Run with
local AI repair and Ollama, automation, an audio system with bundled melody
cues, a `gh push` fallback, Help and Changelog screens, settings palette search,
and the Section 6 advanced Git and workspace surfaces — 309 files, +17,694
lines including roughly 4,000 lines of tests.

> That commit is a **checkpoint, not a verified release**. The TUI suite has not
> been run against it, so the parity contract is claimed rather than proven
> until it has. This is the first thing a successor should do.

### The one merge conflict, and why it was not resolved by picking a side

`tui/contracts/parity.yaml`'s `status_summary` is a **derived** number. The
branch claimed 89 rows `not_yet_available`, `main` claimed 135, and the merged
row set actually holds **91** — so neither side was right, and taking either
would have published a total the file itself contradicts. The contract was
regenerated from its source of truth
(`tui/tools/generate-parity-contract.mjs`, which reads
`docs/readme-tabs/complete-feature-list.md` plus the overrides). It produced the
same counts a hand recount did, and fixed 26 further lines a hand resolution
would have left stale. Merge commit `05528e87d1`; `main` then fast-forwarded.

### The site's count guard earned its keep

Merging the TUI branch added four `docs/**/*.md` articles, and
`script/site-dc-pages-test.mjs` immediately failed with *"the Docs hub
advertises article counts that docs/ no longer matches"*. One
`node script/sync-site-doc-counts.mjs` and the site went from advertising 249
articles to the real 253. That is exactly the drift this guard exists to catch,
on the first merge after it shipped.

### Deleted, kept, and left alone

| Item | Outcome |
| --- | --- |
| `codex/revive-linux-tui` + its worktree | **Deleted** after its tip was proved an ancestor of the dewed `origin/main` |
| `origin/claude/pensive-visvesvaraya-e86ef2` | **Deleted** — proved already an ancestor of `origin/main` |
| Nine `dependabot/**` branches | **Kept.** Each backs an open pull request (#137–#145). Deleting them closes those PRs, and they are neither agent task branches nor merged |
| Stashes | None existed |
| `app/test/unit/agent-sessions-panel-test.tsx` | **Left uncommitted.** Another agent's `MARK …` timing probes, added to diagnose a wedged test. Debug instrumentation, not work — committing it would ship `console.log` into the suite, and reverting it would destroy their investigation |
| `.act-*`, `.codex/repo-list-*` | **Left uncommitted, and now ignored.** They kept reappearing as untracked noise in this shared checkout and being swept into unrelated commits; the patterns now cover the family |

### Concurrency, again

Three separate agents committed into this working tree during the session. One
of them swept an earlier task's staged `git rm` deletions into its own commits
(`ba452e4017`, `dbea7be82f`) and dewed them, briefly leaving `main` publishing
the old homepage with its stylesheet and both Cheap LFS pages deleted.
**Stage explicit paths, never `git add -A`, and re-read `git log` before
committing** — the index may not still be yours.

## 2026-08-03 — The published site is one Material Design 3 component

Commit `80d05e73b881d6b2cd4da4f5a99465be5ad2df98` replaces every hand-built page
under `site/` with a single Design Component: `site/index.html` holds the
template and its logic class, `site/Listbox.dc.html` is the searchable select it
imports, and `site/support.js` is the byte-for-byte upstream runtime.

**Vendoring.** `site/support.js` hard-codes the unpkg URLs it loads React from.
Rather than fork it, `script/vendor-site-assets.mjs` downloads those builds,
re-hashes them against the SRI digests the runtime itself pins, and points it at
the local copies through the `window.__resources` map it already consults —
`site/vendor/dc-resources.js`, which must load *before* `support.js`. The same
script subsets Material Symbols Outlined by `icon_names` and Noto Sans HK by
`text`, both derived from the page source on every run. 420 KiB on disk;
provenance, digests, and licences in `site/vendor/manifest.json`.

**Verified.** A headless Chrome on an off-screen desktop, against an assembled
`_site` served locally: no console errors, `performance.getEntriesByType`
reporting zero third-party hosts, all six pages rendering with content and
correct `aria-labelledby`, all eight overlay panels opening and closing on
Escape, the language switch reaching Cantonese with all three Noto Sans HK
weights loading, the playfulness slider changing the voice line across levels 1
and 5, the regex builder naming its dialect and reporting a syntax error, the
four tab searches and both close modes previewing with counts and protection,
and the appearance editor applying and persisting per element.

**Five defects found and fixed during that pass.**

1. Every listbox selection was a silent no-op. The page is parsed from the
   browser's own document, where HTML lowercases attribute names, so the
   callback arrived as `onpick` while the component read `onPick`. It now reads
   both. This is the failure mode to remember for any Design Component used as
   a page rather than previewed from source text.
2. The accent seed replaced `--md-sys-color-primary` without
   `--md-sys-color-on-primary`, leaving the dark theme's `#00344f` on `#006493`
   — a **2.02:1** primary call to action. `onColor()` now derives black or white
   from WCAG relative luminance; all four accents measure 6.4:1 in both themes.
3. Both tab strips had `role="tab"` with no `tabpanel`, no `aria-controls`, and
   no roving `tabindex`.
4. Three range inputs and the Bold/Italic/Underline toggles had no accessible
   name or pressed state.
5. Seven drag-and-drop upload placeholders shipped as empty boxes; they now hold
   captures this repository already had.

**Concurrency note.** Two commits made by another agent in this same checkout —
`ba452e4017` and `dbea7be82f` — swept this task's staged `git rm` deletions into
themselves and were dewed, leaving `main` briefly publishing the old homepage
with its stylesheet and both Cheap LFS pages deleted. Commit
`80d05e73b881d6b2cd4da4f5a99465be5ad2df98` restores a coherent tree. When
several agents share one working tree, stage explicit paths and re-check
`git log` before assuming the index is still yours.

**Known, not caused here.** `app/test/unit/wiki-function-gallery-test.ts` fails
two assertions (88 raw-main images against 86 catalog rows). It fails
identically with this work stashed.

## 2026-08-03 — Stash manager portal runtime correction

The stash manager is now rendered through the shared dialog portal, so its
Manage, Export, History, and Appearance and voice tabs paint above the Changes
pane instead of being clipped inside it. The accepted hidden-Windows capture
`material-stash-manager-centered-20260803.png` is 1443×992 and has SHA-256
`B733BC06C0B3DB455BF634381409D64B898773D6D742A97097F2E9AF130F4A01`.
Additional inspected captures proved the complete 7z option set, the
appearance/funny-level controls, and the History tab. A disposable fixture
also created a real Git stash with subject `Named headless stash`; the manager
surface itself did not refresh its inventory before the final capture, so that
Git result is recorded as operation proof rather than as a UI-row claim.

Focused manager/export tests passed 17/17, targeted ESLint passed, and the
full TypeScript check passed. The exact fix checkout's webpack compilation
completed; the later packaging script stopped only because the isolated
checkout lacked ignored generated `choosealicense.com/_licenses` data.

## 2026-08-05 — Dedicated History Graph repository page

The graph now has a first-class HistoryGraph repository section appended to
the persisted RepositorySectionTab enum, so existing saved section values do
not move. The repository rail labels the page **Graph** and routes it directly
to the shared compare renderer in full-width page mode: the branch filter,
history scope, commit search, filter chips, lane controls, selection, and
commit actions are retained, while the narrow History sidebar is not mounted.
The page has its own localized title and accessible panel relationship. The
responsive surface catalog and repository section-order tests include the page
and the previously drifted Launchpad, preference, AI-security, and repository-
settings entries now match their source enums again.

Focused verification is **85/85** across graph behavior, repository
navigation, section ordering, feature registration, and the responsive surface
catalog. npx --no-install tsc --noEmit still stops on two unrelated dirty
test fixtures (app/test/unit/ui/merge-choose-branch-dialog-test.tsx, lines
84 and 117), where the existing "Merge" fixture is not a
MultiCommitOperationKind; that dirty work was preserved. The required
Lowlevel preflight and checkout identity checks passed, but the MCP build
receipt did not: the first exact build produced refreshed output and then
wedged its client, while a retry returned an unhandled TaskGroup error while
another checkout was building through the same service. No built-app capture
is claimed from that unverified receipt.

## 2026-08-03 — History view tabs checkpoint

The History surface now exposes a real, keyboard-accessible `List` / `Graph`
tab strip rather than hiding the graph mode behind an icon-only toggle. The
selected view remains persisted, the tabs use roving focus with arrow/Home/End
navigation, and both views share the existing commit actions and filter state.
The three-column graph continues to use the virtualized continuous lane
renderer. Focused source/style verification passed, and the exact production
build was exercised on a hidden Win32 desktop with a disposable Git fixture.
The inspected 1443×992 captures are
`material-history-view-tabs-list.png` (List selected) and
`material-history-view-tabs-graph.png` (Graph selected); the CDP receipt also
confirmed the `tablist`/`tab`/`tabpanel` relationship. R3 still retains its
broader graph-scale and multi-branch acceptance work, but the missing view-tab
surface is now runtime-proven.

## 2026-08-03 — Stash manager export slice

The new isolated checkout `codex/stash-manager-20260803` contains a separate
tabbed Stash Manager dialog with searchable exact-identity export to directory,
ZIP, and configurable 7z, plus History and shared language/funny-level
controls. `getStashes` no longer truncates by entry count. Focused verification
currently passes 42/42 (40 existing Git/UI assertions plus 2 7z argument
assertions). The production build emitted `out/main.js` before the final
appearance/options edits; rerun the exact build and headless Windows capture
after those edits. Do not claim runtime verification until the dialog is
opened in the real built artifact and the export surface is exercised.


## 2026-08-03 — Bug-hunt and Ollama interface checkpoint

This checkpoint is the current source of truth for the active audit. The main
checkout started at `79d5d59662dd7639664a878b390706f0c3975f2c` with unrelated
working-tree material already present. The audit kept that material intact and
added the following scoped fixes:

- The Windows CI and Express Release unit-test steps now give the complete
  Node test coordinator a 4 GiB heap. The previous `a0d7b4a598` CI run passed
  all 7,238 assertions but died at 318 MiB while the long Agents test batch was
  still emitting its accounting summary; the new workflow change is awaiting
  its own GitHui run for proof.

- The Agents creator now uses the shared modal dialog layer, exposes dialog
  semantics, avoids a nested form, and disables the Options disclosure while
  creation is running. The live Agents store and app mount are present; final
  built-app acceptance capture remains pending because the first-run/checklist
  overlay interrupted the CDP interaction path.
- The Ollama model manager now has a localized, accessible Clear search action
  beside its inventory search. It clears only the query and preserves the
  selected plain-text/regex filter mode and case behavior.
- The internal browser now has a toolbar and `Ctrl+F` find bar. Plain-text
  searches retain Chromium highlighting; regex searches read bounded text from
  an isolated world and evaluate it with the safe RE2 adapter. The bar exposes
  case control, previous/next navigation, bounded regex match context, the
  shared regex builder, and localized accessible labels. Main-process and
  renderer request IDs prevent stale asynchronous tallies from repainting a
  newer query.
- The repository-list flex containment adjustment and its existing test remain
  in the task diff; they were preserved rather than discarded during this
  audit.

Verification so far: the required production webpack build emitted the current
`out/main.js` bundle; the hidden Win32 desktop launched it with a disposable
profile and fixture and produced a nonblank 1443×992 first-paint capture;
`ollama-model-manager-test.tsx` passed 14/14; the focused rejected-creation
Agents test passed 1/1; the focused internal-browser contract and UI files pass
32/32; Prettier, `tsc --noEmit`, and the targeted repository ESLint rules are
clean. The new browser slice still needs a fresh exact build and runtime smoke;
the prior first-run/checklist overlay prevented a truthful Ollama capture.

The three roadmap audits confirm that R3/R4/R5/R8 have substantial local
foundations but still need built-app captures or remaining live wiring, while
R1/R2/R6/R7/R9–R18 retain the server, provider, adapter, or integration work
listed below. No roadmap item is marked complete merely because source tests
passed. Open issues were re-read at the checkpoint: desktop-material remains
open on #23 and #118–#135; agent-global-memory has no open issues.

The hidden verification service was reached at the documented loopback MCP
endpoint. Its scheduled task could not be enabled because Windows returned
Access Denied, so the exact documented server command was run as a hidden,
task-owned process for this capture. The disposable fixture, profile, desktop,
and Electron process must be removed after final evidence is recorded.

## 2026-08-02 — Session close: 51 commits, all on `main`

**Start here.** Everything below is dewed; `origin/main` contains all of it and
no worktree holds uncommitted work.

### What landed

- **23 defects fixed** across the desktop app, each with a test that fails
  without the fix. The branch did not typecheck when the session started.
- **All nine Dependabot branches merged**, with **four bumps held back** because
  they genuinely break the build — `tsx` 4.23.1 (stops all 930 test files
  loading), `@types/request` 2.48.13 (fails `postinstall`),
  `@github/copilot-sdk` 1.0.8 (ships `.d.ts` naming four types it never
  declares), `@types/react-virtualized` 9.22.3 (removes `Grid.propTypes`).
- **Repository selection in Commit & push all**, with a search bar on the regex
  builder whose bulk actions never reach past the filter.
- **The history graph view** — implemented with explicit List/Graph tabs,
  continuous lanes, and shared commit actions; built-app capture remains the
  final acceptance gate.
- **The Agents panel** — pure logic and components complete and tested, **not
  mounted**.
- **18 issues, #118–#135**, one per roadmap item, linked from `ROADMAP.md`, with
  the build order and its reasoning in `PLAN.md`.

Full suite: **7,670 tests pass** across 930 files. `tsc --noEmit` clean.

### The next concrete step: mount the Agents panel

It is built and green but reachable from nothing. `app/src/ui/agent-sessions/`
exports `AgentSessionsPanel` with `IAgentSessionsPanelProps`:

```
sessions, availability, baseBranches, defaultBaseBranch, existingBranchNames,
selectedPath, onSelectSession, onCreateSession, isCreating,
onConfigureSetupCommands?
```

plus `startAgentSessionRun` / `cancelAgentSessionRun` /
`detectAgentRunnerAvailability` from `agent-runner-bridge`.

Mounting means adding a `List` / `Agents` tab beside the repository list, in
`renderRepositoryList` in `app/src/ui/app.tsx`, and rendering:

```tsx
<AgentSessionsPanel
  sessions={this.state.worktrees.map(w => toAgentSession(w))}
  availability={this.state.agentRunnerAvailability}
  baseBranches={allBranches.map(b => b.name)}
  defaultBaseBranch={defaultBranch?.name ?? 'main'}
  existingBranchNames={allBranches.map(b => b.name)}
  selectedPath={currentWorktree?.path ?? null}
  onSelectSession={this.onSelectAgentSession}
  onCreateSession={this.onCreateAgentSession}
  isCreating={this.state.isCreatingAgentSession}
/>
```

`onCreateAgentSession` calls the existing
`dispatcher.addWorktree(repository, path, { createBranch: getAgentSessionBranchName(request.name), commitish: request.baseBranch })`,
then `startAgentSessionRun({ agent, worktreePath, operationId, prompt, autoApprove })`,
and reports the outcome through `dispatcher.postNotification` — never a modal.
`availability` comes from `detectAgentRunnerAvailability()` once on mount,
defaulting to `UnknownAgentRunnerAvailability`.

**The one piece nobody has built yet is the live status feed.** `runState`,
`diffStat` and `editedFileCount` are props; nothing polls git or subscribes to
`codex-log` / `opencode-log`, so the fleet chips will render whatever the caller
passes and no more. That belongs in a store, and until it exists the panel shows
a static fleet rather than a live one.

Two design decisions worth knowing before reviewing it. The creator has a **Task
for the agent** field, required once a runnable agent is chosen, because
otherwise picking Codex spawns a process with nothing to do. And **Start sits
below the `Options` disclosure, not inside it** — the screenshot reads as
putting it inside, but a primary action hidden behind a collapsed section is a
usability defect.

### Two things found but deliberately not fixed

- **The palette audit is done and unapplied.** 108 concrete additions across
  both halves; 55 need only a `palette:*` case. Two shipped rows are wrong:
  `palette:tag-lifecycle` lands on Status summary rather than Tag lifecycle, and
  three signing rows teleport to an anchor no element in `app/src` renders.
  Structural finding: the catalog already holds **all 68 non-test menu events**,
  so there is no cheap addition left — the palette has exhausted the menu.
- **Right-clicking a graph row does nothing.** The per-commit menu lives in
  `commit-list.tsx`; wiring it into the graph view is R8 (#125).

### Still open from the bug hunt

Three tab surfaces and the Commit & push all dialog are hard-coded English; the
profile history page read is unbounded; the version-history timeline is a
`listbox` whose options are not its children; the overflow button sits inside
the tablist; the regex block model is dead code emitting constructs RE2 rejects;
compact density starts the browser view 14 px low.


## 2026-08-02 — REQUESTED FEATURES, recorded before they are built

**Read this first.** These were asked for in one session, from screenshots of
GitKraken. They are written down here *before* implementation because the
machine they were requested from was about to lose power. Nothing below is
finished unless it says so. Where a screenshot is the only specification, the
description is what the screenshot showed, not a guess at what it meant.

### The two rules that govern all of it

**1. Every screenshotted feature MUST be added. Not should — must.** The user's instructions, in their words: *"if it doesn't exist,
create the feature fully from scratch even if it means creating a web server"*
and *"every single feature i screenshotted should be added, if not possible
create them from scratch and host them in docker"* — corrected immediately after
to *"not should be, must be added, and find a way to do so."* So "we don't have
that", "that needs a service we don't run" and "that is not possible here" are
answers to nothing. A missing back end is a back end to write, and a way is
found. Nothing on this list is cut for being hard.

**2. Anything server-shaped is hosted in Docker, by the user.** Every one of
these features that needs somewhere for two machines to meet — collaboration,
patches, insights, presence, deep links, single sign-on, SAML, the OAuth
authorization server — runs in a container the user hosts, stood up by a fully
automated, wizard-guided flow inside the app. There is no vendor backend
anywhere in this design, and none is to be introduced.

Together those two rules say: write the server, ship it as a container, and make
the wizard install it. That, not any individual feature, is the critical path.

### 1. History: a toggleable graph view — **IN PROGRESS**

A second view mode for history, alongside the existing list, laid out as three
columns: **Branch / Tag | Graph | Commit Message**.

- Branch/tag chips down the left, coloured to match their lane, right-aligned
  against the graph, with the current branch marked.
- A continuous lane graph, not the per-row clipped SVG the current inline
  graph draws — lanes must join across rows.
- Commit summary per row, the row tinted by its lane colour so a branch reads
  as a horizontal band.
- Row pitch must equal the graph's row pitch or the lanes stop lining up.

Existing groundwork: `showCommitGraph` in `compare.tsx` (persisted under
`ShowCommitGraphKey`), `buildCommitGraphRows` in `commit-graph-model.ts`, and
`CommitGraph` in `commit-graph.tsx`.

### 2. Agents panel — **IN PROGRESS**

A second sidebar tab beside the repository **List**, called **Agents**. Three
parts, from three screenshots:

- **The fleet.** `Worktrees` + a count, a `+ New Agent Session` button, then one
  card per worktree showing its name and a live status chip. Observed chips:
  a green diff stat (`+97`), a red `Error`, and a working indicator (`✏️ 91`).
  The stated point is *seeing every agent at once* without opening any of them.
- **The session creator.** Worktree name, an `Options` disclosure holding a
  **Base branch** picker, a **Coding agent** picker, a `Configure setup commands`
  link, and `Start`.
- **The coding agent picker**: `<None>`, `Codex CLI`, `OpenCode` — and nothing
  else. The first screenshot showed six entries including Claude Code, Gemini
  CLI and Copilot CLI, but the user then said **"only use codex and opencode"**,
  which settles it: the picker contains only agents that genuinely run. Keep the
  catalog extensible so a third can be added when it has a real runner.

Both shipped agents are real: `app/src/lib/build-run/codex.ts` and
`opencode.ts`, the `*-runner.ts` files in `app/src/main-process/build-run/`, and
the `codex-*` / `opencode-*` IPC channels already exist and work.

### 3. Command palette: far more commands — **AUDITED, NOT YET ADDED**

The user's screenshot showed `111 of 111 commands`. The catalog is now 246
unique entries, so that screenshot is an older build — but the point stands:
whole feature areas have no palette route.

An audit of the settings/app half returned **45 concrete additions**: tab
management (close/others/left/right, the eight sort orders, favourite, rename,
move to group, group collapse/delete), the notification centre inbox (which has
**no** palette route at all — the existing `palette:notification-history` row is
mistitled and actually opens the Git-backed version history), settings undo/redo,
sign-in actions, six element appearance editors, and repository-scoped editor
and default-branch overrides. 27 need only a `palette:*` case in
`onPaletteCommand`; 18 need a teleport anchor first. The git/repository half of
the audit was still running.

Also found: `docs/features/design-system/command-palette-coverage-gaps.md` has a
stale header claiming 112 catalog entries.

### 4. Proactive conflict detection — **NOT STARTED**

A banner: *"Potential conflict detected"* — «X has changes that could conflict
with your changes on `branch`. Review to avoid future conflicts.» With
**Other options**: send your changes to that person as a Cloud Patch, push your
changes so they can fetch them, and ignore conflict warnings for your changes on
that branch. Plus a `Show N overlapping files` disclosure.

**Cloud Patch is back in** — the user first said "skip cloud patch", then said
**"even the cloud patch"**. It is built self-hosted, on the user's own Docker
server, never as a vendor service. So the banner keeps all three options: send
your changes as a patch, push so they can fetch, and ignore warnings for this
branch. Tracked as R18.

### 5. AI-assisted merge conflict resolution — **NOT STARTED**

A three-pane conflict editor (ours | result | theirs) with `Auto-resolve with AI`
and `Open in external merge tool`, plus an **AI Merge Summary** panel giving,
per conflict, a confidence percentage and a plain-language reason for the choice
it made.

Existing groundwork: `app/src/lib/copilot-conflict-context.ts` and
`copilot-conflict-resolution.ts` already exist — start there rather than from
nothing.

### 6. Commit context menu in the graph — **NOT STARTED**

Right-clicking a commit in the graph view offers: Checkout this commit, Create
worktree from this commit, Create branch here, Cherry pick N commits, Reset
`branch` to this commit, Revert commit, **Recompose N commits with AI**, and
**Recompose N children of `sha` with AI**.

### 7. Compose commits with AI — **NOT STARTED**

Restructure existing history into a cleaner story: take a pile of uncommitted
WIP, or a mess of coding-agent commits, and reorganize it into logical,
readable, reviewable commits. This is the feature the context menu's "Recompose"
entries invoke.

### 8. Summarize past changes with AI — **NOT STARTED**

Select N commits and get a plain-language explanation. The screenshot showed a
header `Explaining 3 commits`, the commit rows with author and date, then a
prose summary followed by a **Changes** bullet list naming each modified file
and what changed in it.

### 9. Launchpad — **NOT STARTED**

A prioritized inbox across issues, pull requests and work in progress, grouped
into collapsible status sections with counts: **Pinned**, **Ready to merge**,
**Unassigned**, **CI failing**, **Merge conflicts**. Each row shows age, status
icons, the item title with its `#number`, and its diff stat (`+102 / -0`), and
rows can be pinned. Stated purpose: start the day here and act on the most
important work without juggling apps.

### 10. In-app pull request review — **NOT STARTED**

A `GitHub Pull Request` screen inside the app: the PR number and title, an
`Open` state badge, «author wants to merge `head` into `base`», a Description
section, a Comments thread, and a right rail carrying `N files changed`, a
**Review Code and Suggest Changes** button, a **Submit a Review** button,
Reviewers and Assignees.

The requested emphasis is **suggesting code changes internally** — writing
review suggestions from inside the app and posting them as review comments,
rather than opening the browser. The comment in the screenshot showed a posted
suggestion block ("Code Suggestion for #212").

### 12. Feature parity checklist — **a target list, not a claim**

Three more screenshots supplied a competitor's feature checklist. Below is that
list with what a quick codebase check found. **The "here?" column is a grep-level
answer, not a verified parity claim** — anything marked `partial` or `?` needs
someone to open the app and look before it is called done.

| Feature | Here? | Evidence / what is missing |
| --- | --- | --- |
| Git LFS | partial | Cheap LFS (release-backed) is extensive; ordinary Git LFS is a separate thing — see `docs/features/repository-management/cheap-lfs-vs-git-lfs.md` |
| Git Worktrees | yes | `app/src/ui/worktrees/`, `app/src/lib/git/worktree.ts` |
| File history & blame | partial | 10 files mention blame; whether there is a blame *view* needs checking |
| View & create pull requests | partial | Creating exists; the in-app PR review screen is item 10 above |
| Hiding & soloing | **no** | zero hits — graph lane hide/solo does not exist |
| Auto-Gen SSH key | **no** | 3 incidental hits only |
| Git hooks support | yes | extensive, including a hooks proxy |
| Submodules | yes | `app/src/ui/repository-settings/submodules.tsx` and more |
| Visual Interactive Rebase | **no** | zero hits for interactive rebase |
| Visual Interactive Cherry Pick | partial | cherry-pick is everywhere (42 files); the *visual interactive* form is the gap |
| One-click undo & redo Git operations | partial | undo exists; a general redo of Git operations needs checking |
| Command Palette | yes | 246 entries — and item 3 above is about growing it |
| GPG commit signing | partial | 10 files mention gpg |
| Keyboard shortcuts | yes | throughout |
| Dark, Light & Custom Themes | yes | full appearance customization system |
| Local Workspaces | partial | repository groups exist; "workspace" appears in 45 files, needs checking |
| Cloud Workspaces | **no** | hosted service, and out of step with this app's local-first design |
| Merge Conflict Tool | partial | conflict handling exists; the three-pane tool is item 5 above |
| Merge Conflict Output Editor | **no** | the editable result pane of item 5 |
| Code Editor | **no** | external editors are supported; there is no in-app editor |
| Pull or fetch multiple repos | yes | Pull all, and Commit & push all |
| Multiple Profiles | partial | a profile store exists (22 files); a user-facing profile switcher needs checking |
| Gitflow support | **no** | zero hits |

And the agent-specific checklist:

| Feature | Here? | Note |
| --- | --- | --- |
| Agent Sessions View | in progress | item 2 above |
| Launch Agent Sessions | in progress | item 2 above |
| Independent Terminal Sessions | partial | `create-terminal-stream.ts` and a CLI workbench exist; per-session terminals do not |
| Worktree Status | in progress | the fleet status chips in item 2 |
| Claude Code | **no runner** | picker entry only |
| Codex CLI | yes | real runner and IPC |
| OpenCode | yes | real runner and IPC |
| Copilot CLI | **no runner** | picker entry only |
| Gemini CLI | **no runner** | picker entry only |

### 13. Team collaboration — **self-hosted, wizard-guided, NOT STARTED**

A team-collaboration feature set, from a screenshot: Code Suggest, shared
workspaces, Insights, Launchpad with pinning and snoozing, a Team View both in
the Launchpad and as live activity status in the left panel, Conflict
Prevention, predictive merge-conflict alerts, filtering the commit graph by
team, and sharing with deep links.

**The user's explicit design decision: there is no vendor cloud. The user hosts
their own Docker server, and setting it up must be a fully wizard-guided,
automated flow inside the app.** That is what makes this set buildable here at
all — everything above needs a place for two machines to meet, and the answer is
a container the user owns rather than a service they rent.

So the first deliverable is not a feature from that list; it is the **wizard**:
detect or install Docker, generate the server's configuration and credentials,
start the container, verify it is reachable, and hand back a join URL — with
every step recoverable and nothing asking the user to type a command. The
collaboration features are then built against that server.

Constraints that already apply here: secrets never go through chat or a log,
the server's credentials are generated rather than typed, and the app must
degrade honestly to single-player when no server is configured. `Cloud Patches`
from that screenshot stays out, per the earlier decision. `Share Cloud
Workspaces` becomes "share a workspace through your own server", or it is cut.

### 13b. Every "cloud" function runs on that Docker server

Said plainly by the user: **use the Docker server for the cloud functions.**
There is no vendor backend anywhere in this design. Anything a competitor calls
"cloud" — shared workspaces, patches, insights, team presence, deep links — is
served by the container the user owns, or it is not built.

**Resolved:** the "skip cloud patch" said earlier meant no *vendor* patch
service. The user has since said **"even the cloud patch"**, so patches are in,
self-hosted on that server. Private storage and self-hosted storage collapse
into the one thing. Tracked as R18.

### 13c. Admin and security controls — **NOT STARTED**

From a screenshot: AI security controls, and patch storage that is private
and/or self-hosted. With the self-hosted decision above, "private storage" and
"self-hosted storage" collapse into one thing: storage on the user's own server.

AI security controls means the administrator deciding what may be sent to a
model at all — which repositories, which files, whether diffs leave the machine,
and which provider is permitted. Every AI feature in this list (items 5, 7, 8
and Code Suggest) has to be gated by it, so it is a prerequisite for them rather
than a companion to them.

### 13d. Access management — the Docker server is also the identity provider

From a screenshot: Single Sign-On, Multi-Domain SSO, SAML. The user's direction:
**a custom Docker OAuth server.** So the same container the user hosts issues
the identities — it is the OAuth authorization server, and SSO and SAML are
things it federates, not things a vendor sells.

This makes the wizard in item 13 bigger and more important, not smaller: it now
has to provision an OAuth server, which means real key material, correct
redirect handling, and token lifetimes — generated by the wizard, never typed by
the user and never shown in a log.

Two things this app already knows that apply directly: it has **no OAuth
loopback HTTP listener** — sign-in uses the `x-github-desktop-auth` protocol
deep link (recorded in the peer-closed-stream entry further down this file) — so
a self-hosted OAuth flow must decide deliberately between that deep link and a
loopback listener rather than assuming one exists. And the internal browser
already has a hardened private-session OAuth path with partition rotation and
callback correlation, which is the right place to run this flow.

### 15. Integrated terminal — **NOT STARTED**

From a screenshot: a Git-enhanced terminal, a commit graph that stays live and
synchronized with what the terminal is doing, CLI diff/blame/history views, and
auto-suggest plus auto-complete for Git commands.

Existing groundwork: `app/src/lib/create-terminal-stream.ts`, the CLI workbench
(`app/src/lib/cli-workbench.ts`, `cli-workbench-catalog.ts`), and the
`start-cli-command` / `cli-command-output` / `cli-command-state` IPC channels.
The live-synchronized graph is the interesting half: it means the graph view of
item 1 has to be able to refresh from an external mutation, not only from the
app's own.

### 14. Issue tracker integrations — **NOT STARTED**

From a screenshot: Jira Cloud, Jira Data Center, the Git Integration for Jira
app, GitHub, GitHub Enterprise, GitLab, GitLab Self-Managed, and Trello.

GitHub and GitHub Enterprise are already first-class in this app, and there is
existing GitLab and Bitbucket account plumbing (see the submodule provider
sign-in strings). Jira and Trello are entirely absent. Each integration needs
its own credential path, and every one of them must obey the rule that a token
is never rendered, logged, or pasted into a conversation.

### 11. Screenshots belong in a gitignored directory

Requested during this session: reference screenshots go to a gitignored folder.
`design/reference-screenshots/` is created and ignored for exactly this. Note
honestly: the agent that recorded these features **could not write the image
files** — the screenshots were pasted into a conversation, not handed over as
files on disk, so only the descriptions above exist. Drop the images into that
folder and the descriptions become checkable against them.

---

## 2026-08-02 — Fleet bug hunt: six readers, ten fixes so far, more in flight

Six read-only agents were pointed at disjoint areas of the desktop app — the
internal browser, appearance and tabs, the regex builder and every search
surface, localization/changelog/dim-sum, main-process and IPC, and the local
version history plus notifications. Between them they reported around thirty
candidate defects. Each one below was re-read against the code before it was
touched, and each fix carries a test that fails against the old code.

**The branch did not typecheck when this started.** `tsc --noEmit` failed on two
`ipcWebContents.send` calls in `internal-browser-window.ts`, so the previous
handoff's claim of a clean typecheck was wrong. That was the first thing fixed.

### Landed

| Commit | What was wrong |
| --- | --- |
| [`2714c53345`](https://github.com/Ding-Ding-Projects/desktop-material/commit/2714c53345) | `internal-browser-find` / `internal-browser-page-text` were sent but never declared in `RequestChannels` — the branch failed `tsc`. Both now carry named payload types and appear in the IPC contract test. |
| [`1dbeca53ff`](https://github.com/Ding-Ding-Projects/desktop-material/commit/1dbeca53ff) | Pinned tabs went into the overflow dropdown whenever the active tab sat past the leading run. The layout now takes `pinnedCount` and lays the pinned run out first. |
| [`cb29c34dbc`](https://github.com/Ding-Ding-Projects/desktop-material/commit/cb29c34dbc) | Notification dedupe matched on kind/title/body only, so repository A's failure and repository B's collapsed into one row pointing at B. `accountKey` and `repositoryId` now take part, and the coalesced entry no longer inherits fields the new notification omitted. |
| [`dff4f9c9fb`](https://github.com/Ding-Ding-Projects/desktop-material/commit/dff4f9c9fb) | 24 keys existed only in English, so Cantonese mode rendered the submodule Create-remote tab in English and bilingual mode rendered it twice. Both catalogs are now asserted key-for-key and placeholder-for-placeholder. Two mojibake ellipses repaired. |
| [`ae4ba15421`](https://github.com/Ding-Ding-Projects/desktop-material/commit/ae4ba15421) | `safeSimplexListener` caught rejections and not synchronous throws, so one malformed `update-accounts` payload reached `uncaughtException` and destroyed every window. |
| [`19940edffb`](https://github.com/Ding-Ding-Projects/desktop-material/commit/19940edffb) | Filter surfaces trimmed the query and then searched with the trimmed string: the regex ` +` became the uncompilable `+`, and a substring with a deliberate trailing space matched text without it. |
| [`4d9e6216e3`](https://github.com/Ding-Ding-Projects/desktop-material/commit/4d9e6216e3) | `FilterList` and `AugmentedSectionFilterList` computed `regexError` and rendered only a red border, so an invalid pattern listed every item with nothing announced. They now render the same `role="alert"` message `SectionFilterList` already had. |
| [`3df847fcfa`](https://github.com/Ding-Ding-Projects/desktop-material/commit/3df847fcfa) | A profile restore that deletes a state file unlinked only the primary, leaving the git-ignored crash-safe backup; the next read recovered from it and resurrected the file. Now uses `clearCrashSafeFile`. |
| [`abb255cbd8`](https://github.com/Ding-Ding-Projects/desktop-material/commit/abb255cbd8) | Silent install judged the release asset's *name* and spawned whatever was at the supplied *path*, with nothing requiring them to match. The review now compares the path's base name too. |
| [`e4595bc179`](https://github.com/Ding-Ding-Projects/desktop-material/commit/e4595bc179) | `normalizeInternalBrowserCommand` never learned the three page-search commands, so every find request was dropped at the IPC boundary before reaching its handler. The feature could not have worked. |

### Landed in the second pass

| Commit | What was wrong |
| --- | --- |
| [`d324e86952`](https://github.com/Ding-Ding-Projects/desktop-material/commit/d324e86952) | The quick-action window disabled its summary box at "done" while leaving Commit & push enabled, over a snapshot it never re-read — a second click re-committed the files it had just committed. |
| [`470c78ce2c`](https://github.com/Ding-Ding-Projects/desktop-material/commit/470c78ce2c) | The dim-sum card cancelled its dismissal timer on `focusin` and never restarted it, so tabbing past it once left it up for the session. Changelog copy had no `catch`. |
| [`7eecf4c227`](https://github.com/Ding-Ding-Projects/desktop-material/commit/7eecf4c227) | `QuickActionWindow` treated any `did-fail-load` as fatal and reported it twice; `notificationWindowOwners` grew without bound; the exception reporter logged the crash instead of the submission failure. |
| [`e8a16d8ab5`](https://github.com/Ding-Ding-Projects/desktop-material/commit/e8a16d8ab5) | The tab colour picker showed the default over any stored `#rgb` or `#rrggbbaa` and silently flattened alpha on the next touch. |
| [`953600d6e0`](https://github.com/Ding-Ding-Projects/desktop-material/commit/953600d6e0) | Roving `tabIndex` with no arrow-key roving: only the active tab was keyboard reachable. `role="tablist"` also sat on a container holding seven non-tab controls. |
| [`754abc062e`](https://github.com/Ding-Ding-Projects/desktop-material/commit/754abc062e) | The date-range picker rewrote the field under the caret and could swap a half-typed value into the other end; the calendar lost its only tab stop once a range was set. |
| [`84c3ea0e72`](https://github.com/Ding-Ding-Projects/desktop-material/commit/84c3ea0e72) | **Feature:** Commit & push all now selects repositories, with a search bar wired to the regex builder. Bulk select/clear never reach past the filter. |
| [`1a8ea1a964`](https://github.com/Ding-Ding-Projects/desktop-material/commit/1a8ea1a964) | The two bulk tab closes disagreed on mode, casing and match-key scope, so they were not each other's negation. Whitespace-only queries enabled a dead button; the surface defaulted to fuzzy subsequence over the absolute path. |
| [`97040068ec`](https://github.com/Ding-Ding-Projects/desktop-material/commit/97040068ec) | Settings search marked no characters in regex mode; version history advertised a file search it could only run against one loaded commit. |
| [`318616e127`](https://github.com/Ding-Ding-Projects/desktop-material/commit/318616e127) | Notification and log history mutations ran with no profile repository lease, so a debounced commit could land on a half-restored tree and the restore would roll back onto it. |
| [`ca3cf95a49`](https://github.com/Ding-Ding-Projects/desktop-material/commit/ca3cf95a49) | Six internal-browser defects: renderer leak on window close, address bar reverting on Enter, auth tabs never showing an error, a blank external-open button below 840 px, a 21 px dead band above every page, and clipped focus rings. |
| [`9c70e73849`](https://github.com/Ding-Ding-Projects/desktop-material/commit/9c70e73849) | The regex builder seeded the user's plain-text query unescaped and then switched the surface to regex — `(WIP)` silently became a capture group. The palette also had no way to insert a literal at all. |
| [`fc8eafbf12`](https://github.com/Ding-Ding-Projects/desktop-material/commit/fc8eafbf12) | The automation store had the same missing lease as its two siblings. |

### Still open, verified but not fixed

- **Three tab surfaces are hard-coded English** — the close-tabs popovers, the
  tab style editor and the arrange popover — while their siblings translate.
  The Commit & push all dialog is likewise English throughout, including the
  controls added in `84c3ea0e72`. Both are localization work, not defects in the
  behaviour, and neither was attempted here.
- **`getProfileHistoryInternal` reads the whole repository twice per page**, with
  no limit on the `getCommits(repository, 'HEAD')` it uses only for a count.
  With the log store committing roughly once a second of renderer activity, this
  is the thing that will make Log history unusable first. `git rev-list --count`
  is the fix.
- **The version-history timeline is a `listbox` whose options are not its
  children**, with no `aria-activedescendant` and no roving `tabIndex`, so arrow
  keys do not move between commits.
- **The overflow button renders inside the tablist**, so that row still owns one
  non-tab control. Moving it out requires changing how `recomputeOverflow`
  reserves its width, or the reservation double-counts.
- **The regex block model is dead code** that would emit `(?=` and `(?<=` —
  constructs RE2 rejects outright — if anyone ever wired it up.
- **Compact density still starts the browser view 14 px low** until the first
  real measurement arrives, because the safety floor is the default-density
  chrome height.

## 2026-08-02 — Internal browser: page search renderer completed, three features remain

**Read this before touching `app/src/internal-browser/`.** The main-process and
renderer halves of page search are now present. Four commits established the
browser defects/plumbing, and the current slice makes the feature reachable.

### Landed

| Commit | What |
| --- | --- |
| [`af9b60b787`](https://github.com/Ding-Ding-Projects/desktop-material/commit/af9b60b787) | Four real defects fixed (below) |
| [`abee1ad199`](https://github.com/Ding-Ding-Projects/desktop-material/commit/abee1ad199) | Page-search plumbing: commands, main-process handlers, IPC back-channels |

The four defects, each found by reading rather than from a report:

1. **An IPC message per keystroke.** `componentDidUpdate` re-measured the content
   viewport on every state change, and typing in the address bar is one state
   change per character — each cancelling a frame, rescheduling a 120 ms timer,
   and sending the native view an identical rectangle. Now gated on
   `chromeLayoutKey`, which changes only when the chrome's height can.
2. **A `tablist` with no panel and non-tabs inside it.** Wrapper `div`s sat
   between the tablist and its tabs, the new-tab button was a non-tab child, and
   nothing declared itself the panel. Wrappers are `role="presentation"`, the
   button moved out, the viewport is the panel, and a `sr-only` line explains the
   panel is empty because a separate native view draws the page.
3. **The window was called "Browser" forever** — several browser windows were
   indistinguishable in the taskbar. It now names the active tab.
4. **A null check that missed.** `tab?.url === null` is false when there is no
   tab (undefined is not null), so it validated an empty string every render.

### The security decision, stated plainly

Page search in regular-expression mode **runs a script inside the page**. This is
the first time this browser has ever done so, it was an explicit user decision
after the constraint was raised, and it happens on every regex search on every
site. It is built as tightly as the platform allows:

- an **isolated world** (`PageTextReadWorldId = 1010`), so page scripts can
  neither observe the read nor replace the globals it uses;
- it reads `innerText` only, truncates to `MaximumPageTextLength` (2 MB), and
  returns — defining nothing, storing nothing, mutating nothing;
- **the pattern never enters the page.** It is evaluated in the trusted renderer
  under the existing RE2 bounds, so a hostile page never learns what is being
  searched for and a pathological pattern cannot hang it.

A successor changing any of this should treat it as a security boundary, not an
implementation detail.

### Known limitation, by design

**Regex mode cannot highlight or scroll to matches in the page.** Doing that
means mutating the page's DOM, which is a far larger boundary than reading text.
Plain mode gets real in-page highlighting from Chromium's `findInPage`; regex
mode gets a match count and a results list with surrounding context
(`findMatchContext` builds the window). This must be documented in the UI, not
left to look like a bug.

### Not started

| Feature | Notes for whoever picks it up |
| --- | --- |
| **Find bar UI** | Implemented in `app/src/internal-browser/internal-browser-app.tsx`. The renderer listens to `internal-browser-find` and `internal-browser-page-text`, sends bounded request-token commands, keeps plain text as the default, and offers regex mode plus the shared anchored builder. Focused contract/UI tests pass 32/32; exact Windows build and runtime smoke are still pending for this checkpoint. |
| **Funny-level sliders** | It reads `languageMode` and uses `t()` for 37 strings but never consults `readFunnyLevels()`, so its copy ignores a setting the rest of the app honours. Pattern to copy: `app/src/lib/dim-sum-copy.ts`. |
| **Non-blocking notifications** | It has no toast surface; the error notice is `role="alert"` `aria-live="assertive"` in the header, which interrupts and shifts layout. |
| **Dim sum surprise** | The browser is a separate renderer entry point and takes no part in the 10% draw. Model, copy and card all exist — see `app/src/models/dim-sum.ts` and `app/src/ui/dim-sum/`. Needs its own suppression rules (an authentication tab is mid-task and must not be interrupted). |

### Verification state

`tsc --noEmit` clean, Prettier and targeted ESLint clean, SCSS compiles. The
focused internal-browser contract and chrome suites pass **32/32**, including
plain and regex query dispatch, request-token matching, regex result navigation,
and close behavior. The exact Windows build and runtime smoke are the remaining
verification boundary for this checkpoint.

## 2026-08-01 — The dim sum surprise reaches the app

The website has served a dim sum dish on one visit in ten since
`309ad27736`; the Windows app served none. It does now.

**What shipped**

- `app/src/models/dim-sum.ts` — the pure part: the 10% band, dish selection,
  the seven suppression reasons in priority order, bilingual naming with
  per-run `lang` tags, alt text, and the opt-out migration. No DOM, no
  randomness of its own — every draw is passed in, so every outcome is pinnable
  in a test.
- `app/src/lib/dim-sum-assets.ts` — build-time import of
  `app/static/dim-sum/manifest.json`, coerced defensively so one corrupt entry
  costs one dish rather than startup. A filename that is not
  `^[A-Za-z0-9._-]+\.png$` is dropped rather than resolved.
- `app/src/lib/dim-sum-copy.ts` — composes the card for a language mode and a
  pair of funny levels. Bilingual renders two framing blocks, each at its own
  language's level, and one name.
- `app/src/lib/dim-sum-random.ts` — `drawUnitRandom()`, a full 32-bit CSPRNG
  draw over its range. `Math.random` is banned repository-wide by the
  `insecure-random` rule, and a biased source would not give the stated rate
  anyway.
- `app/src/ui/dim-sum/dim-sum-surprise.tsx` + `_dim-sum-surprise.scss` — the
  card. Bottom-**left**, because the error notice stack owns bottom-right.
- `app/src/ui/app.tsx` — `drawDimSumSurprise()` at the end of
  `performDeferredLaunchActions`, wrapped so a failure costs a dumpling and not
  a startup.

**The pictures**

Twelve dishes, ~27 MiB, copied byte for byte from the shared catalog by
`script/generate-dim-sum-assets.ts`. Twelve rather than the whole catalog
because each is a multi-megabyte lossless PNG the installer pays for; the
twelve span steamed, baked, fried, rolled, bakery, dessert and drink.
`script/build.ts` copies `app/static/dim-sum` to `out/static/dim-sum`, matching
how the narration assets already travel.

**Verification**

47 unit tests across five files, all passing:
`dim-sum-surprise-test.ts`, `dim-sum-copy-test.ts`, `dim-sum-assets-test.ts`,
`dim-sum-wiring-test.ts`, `ui/dim-sum-surprise-test.tsx`. The asset test hashes
every committed PNG against the manifest on every run, so a picture that stops
decoding fails CI rather than reaching a user as a broken image. The wiring
test walks every settings surface and fails if a dim sum toggle ever appears.

**Not done here**

No screenshot of the card in the running app: it appears on a 1-in-10 draw at
launch, and the capture harness has no hook to force the draw. Adding one would
mean a test-only override of the probability, which is a change to the feature
rather than to the harness. The rendered markup is asserted instead.

## 2026-08-01 — Gallery recapture after the palette rework

Issue #23 asked for every published screenshot to be replaced. **81 of 92 are
refreshed** against a build containing the full-app command palette; the 11
that are not are listed with concrete blockers in
`.codex/run-manifests/2026-08-01-gallery-recapture.md` (5 are the Linux TUI,
which is out of scope by directive).

The run exposed three real app defects, all fixed here:

1. `window.location.reload()` was dead app-wide — the main process denied every
   `will-navigate`, including a document reloading itself, so both renderer
   Reload buttons did nothing. Fixed in `app/src/lib/same-document-reload.ts`.
2. The repository logo editor grew a second scrollbar because its override
   released `overflow-y` but not `overflow-x` (CSS computes `(hidden, visible)`
   as `(hidden, auto)`).
3. The capture fixture seeded its token under the dev-flavoured credential
   service name only, so a production build could never hydrate an account —
   the blocker that killed the 2026-07-31 run.

Four harness drifts were also corrected (Shift+right-click appearance editors,
two controls that moved into the More menu, the `· N visible` artifacts clause,
and rail buttons whose text now embeds their Material Symbol ligature).

Published: `66d446266e`, ancestry proven against the remote `main`.

## 2026-07-31 — Full-app command palette: rich controls and teleport

The Ctrl+F command palette was rebuilt as Material 3's full-screen search
view. Three behaviours landed together:

1. **Full-app coverage** — the palette dialog opts out of the floating-card
   geometry and covers the window below the title bar
   (`#dialog-layer dialog#command-palette.command-palette-full`), with a
   1180px content column, a detail pane, and a hint footer.
2. **Rich controls** — a catalog command may declare `control`
   (`toggle` | `entry` | `number` | `choice`); the palette renders the
   matching live control inline. `App` supplies values via
   `getPaletteControlValues()` and writes via `onPaletteControlChange`,
   reusing the exact dispatcher setters the Settings panes call. Unknown
   values render disabled controls; changes never dismiss the palette.
3. **Teleport** — every command resolves a home (`resolvePaletteHome`);
   click/Enter opens the owning surface and spotlights the exact control
   (`teleportTo` in `app/src/ui/lib/teleport.ts`, selector registry in
   `app/src/lib/teleport-targets.ts`, anchors spread with
   `teleportAnchor(...)` in the preferences panes). Ctrl+Enter/Run executes.
   Push/force-push/pull/fetch/discard/remove homes carry no self-opener, so
   teleporting can never fire them. A missing surface posts a non-blocking
   notification instead of failing silently.

New i18n keys live under `commandPalette.*` / `palette.*` in both languages.
Docs: `docs/features/design-system/command-palette-full-coverage.md`.
MD3 audit of the whole UI:
`docs/verification/md3-ui-audit-2026-07-31.md` (84/100; missing
`--md-sys-shape-corner-extra-small`/`-full` tokens were added).

Verified locally: tsc clean; changed-file eslint/prettier clean; palette
suites green (catalog 27, rich 6, filter-mode 4, appearance, i18n 23);
`_command-palette.scss` + `_teleport.scss` compile standalone under dart-sass.

## 2026-07-31 — In-app changelog viewer and two context-menu defects

Handoff written mid-stream at the user's request. Three of five requested
items are complete and pushed; two were never started. Nothing is left in a
broken or half-applied state, and no work is stashed or branch-only.

### Done and pushed

**`4942f2025c` — context menu regex builder and keyboard shortcuts.**

The regex builder opened from a context menu was unusable, from three
separate causes that had to be fixed together:

1. The builder's overlay sat at `z-index: 70` while the menu's own
   full-viewport backdrop sits at `1000`. Both are body-level layers in the
   same stacking context, so the builder was painted *under* a transparent
   sheet: the first click landed on the backdrop, dismissed the menu, and
   unmounted the builder. Fixed with a named `--regex-builder-z-index: 1100`
   token in `app/styles/_variables.scss`.
2. The builder portals to `#regex-builder-layer` on `document.body`, so it is
   not a DOM descendant of `.filter-mode-control` — only a React-tree one.
   The menu's `onKeyDown` guard tested that class alone, so every keystroke
   typed into the pattern field drove the menu instead: <kbd>Escape</kbd> tore
   the menu down, <kbd>Enter</kbd> fired a menu action, arrows moved a
   highlight nobody could see. Every other host of the builder already tested
   `.regex-builder-overlay`; the context menu now does too.
3. A click landing in the builder overlay's transparent margin still reached
   the backdrop. The backdrop now stands down while a builder carrying its own
   search-surface id is open.

Also in that commit: `IMenuItem` gained an `accelerator`, rendered as a
trailing `<kbd>` hint and announced through `aria-keyshortcuts` (never both,
so the shortcut is not read twice). Electron's composite `editMenu` role is
now expanded into Cut / Copy / Paste / Select all — it previously rendered as
**one blank unclickable row**, which means every text field in the app
(`text-box`, `text-area`, the autocompleting input) had an empty context
menu. The menu's three hardcoded English strings are now localized.

**`f89f162d3d` — the changelog viewer.**

The app had no changelog: only a release-notes dialog for a pending update,
plus a link that opened a website. The new Release history dialog covers all
683 recorded releases and 3,694 entries, reachable from Help → Release
history, the command palette, and About.

- Entry text is imported directly from `changelog.json`. Only the dates are
  generated (`app/src/lib/changelog/release-dates.ts`, from `release-*` Git
  tags via `script/generate-changelog-catalog.mjs`, which now writes both the
  site catalog and the app dates from one tag read). The app and the
  documentation site therefore cannot drift about what a release said.
- The 39 releases with no tag render "date unrecorded" rather than a guessed
  date, and a date range reports how many it excluded for that reason instead
  of letting them disappear.
- Every time is 24-hour; a test asserts no AM/PM form survives anywhere.
- Search runs through the shared `FilterModeControl` with the full regex
  builder; plain text stays the default. Category and date filters compose
  with it rather than overriding it.
- Export and copy render exactly the filtered view, with the active filters
  and the omitted-undated count stated in the file itself.
- New shared `DateRangePicker` (`app/src/ui/lib/date-range-picker.tsx`):
  presets, month/year jumps, range selection, and typed entry accepting ISO in
  any locale plus the locale's own order and the `2026年7月31日` form. An
  incomplete or impossible date is reported under its field **without
  discarding what was typed**, and the last good range keeps filtering.

That commit also repairs `yarn lint:src`, which was **already red on `main`**
from two test files added earlier in this session's work
(`docs-site-color-test.ts`, `docs-site-tabs-test.ts`).

**CI had been red on `main` for the previous three pushes, blocking every
release, from three independent causes — all of them mine, all now fixed.**
The lint job above was only one of them. The other two:

- **`ci.yml` concurrency.** Commit `f35fcb76da` earlier in this session
  rewrote the concurrency group so superseded pull-request and feature-branch
  runs would cancel, to save runner minutes. That silently broke the safety
  contract `app/test/unit/ci-workflow-safety-test.ts` exists to defend: the
  installer workflow publishes a Release only when CI concludes `success`, so
  a cancelled or *queued* main run makes a release quietly never ship. Now
  reverted to the unique `ci-${{ github.run_id }}-${{ github.run_attempt }}`
  group with `cancel-in-progress: false`, and the comment says why so the
  next person does not re-optimise it.
- **`script/render-mermaid-test.mjs`** asserted the docs template contained no
  `<script>` at all, as a proxy for "nothing loads from a CDN". That proxy
  held until the dim sum surprise shipped a locally bundled script into
  `site/docs-template.html`. The assertion now checks what it actually means —
  every `src` must be relative, and no inline script may import a remote
  module — and was verified to still fail against an injected CDN tag rather
  than being loosened into something that passes everything.

`Build Installers / Express Release` run `30652270161` shows the shape of the
damage: it built, packaged, signed and collected the installers successfully,
then failed on "Preserve the upstream CI failure result" and skipped
publishing. The release machinery is fine; it was being fed a red CI.

### Evidence

| Check | Result |
| --- | --- |
| `changelog-viewer-test.ts` | 37/37 |
| `changelog-viewer-wiring-test.ts` | 10/10 |
| `ui/context-menu-shortcuts-test.tsx` | 11/11 |
| `docs-site-color-test.ts` + `docs-site-tabs-test.ts` | 68/68 |
| `material-context-menu-style-test.ts` | 4/4 |
| `i18n-test.ts`, filter-mode and diff-search suites | 35/35 |
| `npx tsc --noEmit` | clean |
| `yarn lint:src` | clean (was red before) |

The backdrop and keyboard cases in the context-menu test genuinely fail
without their fixes — verified by watching them fail first.

### Decision: stop supporting arm64

The user has directed that **arm64 support ends**. The only development
machine is amd64 (x64), so nothing arm64 can be built, run, or verified here —
an arm64 job can only ever report a result nobody on this project can
reproduce or debug.

This is recorded, **not yet implemented**. Nothing has been removed. Whoever
picks it up should drop the arm64 matrix legs and any arm64-only packaging,
release assets, and verification steps, then confirm the release still
publishes a complete x64 installer set.

Worth knowing before starting: the arm64 leg has already cost real time this
session. One of the three CI failures above — the `render-mermaid-test.mjs`
CDN assertion — was reported **only by the arm64 runner**, because the matrix
splits which test batch runs where, not because the failure was
architecture-specific. It reproduced on x64 the moment it was run there. So
removing arm64 must not be treated as removing coverage: check which test
batches the arm64 legs were carrying and make sure the x64 legs still run all
of them, or the suite will get quieter without getting greener.

Search starting points: `.github/workflows/ci-linux.yml`,
`.github/workflows/ci-windows.yml`,
`.github/workflows/build-installers.yml`, and any `arch`/`matrix` entries
naming `arm64`.

### Not done — pick these up

1. **Drag a tab onto a tab to create a group; drag into a group to add.**
   Requested this session, **not started**. Nothing was written for it.
2. **Per-repository tabs above the history editor**, so history can be read
   tab by tab. Requested this session, **not started**.
3. **No webpack build has been run since the changelog landed.** `tsc` and the
   unit tests pass, but the renderer now statically imports the 552 KB
   `changelog.json` (via `app/src/lib/changelog/changelog-catalog.ts`, path
   `../../../../changelog.json`). There is precedent for importing JSON from
   outside `app/src` (`github-api-operation-catalog.ts`), so this is expected
   to resolve — but **expected is not verified**. Run
   `yarn build:prod` before trusting it, and consider a dynamic `import()` so
   the catalog lands in its own chunk rather than the main bundle.
4. **Documentation is not updated for either commit**: no feature article
   under `docs/`, no `README.md` or `ROADMAP.md` entry, no landing-page or
   docs-site section, and no screenshots of the new dialog. Anything added
   under `docs/` must be followed by `yarn generate-docs-hub-catalog` — a
   missed regeneration is what broke CI earlier in this work.
5. **Issue #23 is unchanged** from the previous handoff: 8/86 frames promoted,
   38 uninspected frames outside the repository, the per-feature `verify_*`
   batch untouched, and the live Cheap LFS batch still needing real
   multi-gigabyte uploads.
6. **The `settings-history` capture has still not been re-run under demo
   mode.** `out/` was rebuilt at the start of this session (exit 0) and now
   contains the redaction, so the run is unblocked — it just has not happened.

### Notes for whoever picks this up

- `expandRoleMenus` and `ariaKeyShortcuts` are exported from
  `material-context-menu.tsx` specifically so they can be tested without a DOM.
- A context menu whose builder is open **cannot** be dismissed by clicking the
  backdrop. That is deliberate. A test that awaits `showMaterialContextMenu`'s
  promise after opening a builder will hang forever; tear the menu down by
  removing `.material-context-menu-host` instead.
- `filterChangelog` keeps a release whole when the *version* matched, and shows
  only matching entries otherwise. Searching `3.6.2` is a request for that
  release, not for a line inside it.

## 2026-07-31 — Recurring Git errors auto-repair (local verification)

The Windows app now contains the four failures reported from the repository
surface. Its app-owned, hook-free `rev-parse --verify HEAD` probe retries only
the localized Windows launcher denial, twice, with bounded cancellation-aware
backoff. Repository-indicator refresh contains each provider failure, clears
visible progress in `finally`, continues with the other repositories, and
reschedules without producing the generic background-action toast.

Add Submodule repairs a missing working `.gitmodules` only from one immutable,
Git-validated stage-0 blob OID. The byte buffer is restored exactly (including
valid non-UTF-8 comment bytes) through an exclusive create; failure rollback
removes only a matching device/inode and preserves any path whose ownership
cannot be proven. Cheap LFS pointer inventory omits protected metadata and
gitlinks, while oversized protected dot paths remain in commit enforcement and
fail before provider discovery, credentials, release anchoring, upload, commit,
or push. Normal, mixed automatic/manual, scheduled, and one-click commit paths
therefore cannot silently commit those raw bytes.

Local evidence includes **6/6** launcher/updater regressions, **62/62** exact
pointer/submodule checks, **101/101** broader focused checks, the exact
non-UTF-8 blob and terminal-branch checks, **19/19** generated documentation
checks, changed-file ESLint, and TypeScript no-emit. The reproducible production
build passed through Lowlevel MCP before rebase, and the exact merged
`7b6bed9768` tree passed again in **559.1 seconds** (`returncode: 0`, no
timeout). A real off-screen Win32 session opened a deterministic repository with
a modified `.gitmodules` and deleted gitlink; after twelve stable seconds the
960×660 Changes surface showed both entries, notification history was empty,
and isolated logs contained none of the four reported errors. The accepted
80,546-byte frame had SHA-256
`32f2849dd973c899f4596618f73a498929c137f00402c196a667a1003374cb21`.
The app, desktop, profile, fixture, screenshots, and incomplete dependency
backup were removed. Push, hosted CI, installer Release, and dim-sum asset proof
remain pending. Rolling progress is recorded in
[Discussion #113](https://github.com/Ding-Ding-Projects/desktop-material/discussions/113).

香港粵語：Git 啟動跣腳會有節制咁再試，背景 fetch 自己仆低唔再拉埋全場；
`.gitmodules` 只會由同一粒 index blob 原封不動補返，連奇怪 comment byte
都唔會俾 UTF-8 攪成炒蛋。Cheap LFS 亦識得分清 metadata 同大檔，唔會再
亂報 unsafe path，更加唔會未判死刑就走去開 Release、commit 或 push。

The first hosted CI run (`30677422935`) found one inherited Windows regression
from the changelog commit rebased immediately before this fix: **Release
history** and **Show logs in Explorer** both claimed <kbd>H</kbd> in Help. The
release-history mnemonic now uses <kbd>R</kbd>; the exhaustive menu combination
test passes. The same run's three Linux parity jobs reported 202 desktop feature
rows against a frozen 201-row TUI contract. Rather than edit the prohibited TUI
surface, this follow-up removes the duplicate summary row while retaining the
dedicated feature article, category index, Pages card, and app documentation.
The second hosted run (`30678663185`) cleared those failures and passed 7,472
of 7,473 Windows unit checks; its sole failure found the same incoming context
menu's new search input used a constant expression where the registry auditor
requires a literal one-to-one surface ID. The input and its regex control now
carry the literal `material-context-menu` ID, and the focused registry contract
passes without changing runtime behavior.

## 2026-07-30 — Publish organization listbox sizing (pushed acceptance)

Publish repository's Organization control is no longer a native select whose
options could disappear inside a compact dialog. It is now a searchable,
explicit-None listbox with persisted fuzzy, substring, and bounded-regex
matching plus direct access to the full Regex Builder. Keyboard operation covers
<kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Enter</kbd>, <kbd>Space</kbd>, and
<kbd>Escape</kbd>. The parent ignores a previous account's late organization
response. The shared Regex Builder portal now owns Escape and closes itself
without closing the Publish dialog.

The list viewport is bounded to 128–176 CSS px, scrolls vertically inside the
dialog, and ellipsizes long organization names. Shared select wrappers also
gain shrink containment so they cannot force dialog-level horizontal overflow.
The owned provider fixture returns exactly three stable organizations, including
one deliberately long name and local deterministic avatars.

Local evidence is green:

- focused Publish UI and style coverage: **26/26**;
- TypeScript no-emit: passed;
- capture, gallery-state, and responsive verifier contracts before gallery
  promotion: **83/83**;
- provider fixture coverage: **19/19**;
- documentation catalog and page checks: **61/61**; and
- exact hidden Windows production build: return code 0 after **1042.19
  seconds**, no timeout, with only npm's upgrade notice on stderr.

The accepted final capture,
`docs/assets/screenshots/material-publish-organization-picker.png`, is
1440×960, 133,919 bytes, with SHA-256
`7db03d5db789d19e1ad49de66bd79abb62e46c7909eda9de08878aac367033d8`.
Its narrow acceptance used a 390×844 physical window, 780×1688 logical
viewport, and combined DPR/zoom 0.5. The list measured 176 CSS px / 88 physical
px with `clientHeight=172`, `scrollHeight=184`, and `maxScrollTop=12`; the
harness reached the bottom, kept the final option visible, found no horizontal
overflow, proved the long label ellipsis, and restored None as the selection.
The owned provider, app processes, headless desktop, fixture, profile, and
temporary evidence were cleaned up.

Gallery promotion brings the current Windows plan to **85 scenes**: 67
canonical plus 18 specialist. Older dated 84-scene entries below remain
point-in-time provenance. Implementation commit
`63c1ec08c4f24f85d87f21d98851dcd5784c7800` is proven on `origin/main`.
Its first hosted matrix exposed two provenance-generation omissions rather
than an application regression: this retained receipt was not committed even
though the generated catalog linked it, and the TUI parity contract had not
been regenerated. This follow-up publishes both inputs; final exact-SHA CI,
Pages/wiki, and installer Release proof remain open.

## 2026-07-30 — Conflict/CI agent repair and hideable progress (local state)

- Conflict dialogs and failed Actions details open the existing Codex/OpenCode
  composer with bounded, non-destructive local repair prompts.
- Build/agent work shows elapsed time and a conservative ETA. Closing the panel
  hides it without stopping work or letting streamed output reopen it.
- Cheap LFS restore details collapse while the live header remains visible.
- Five command-palette results dispatch these exact features on Enter or click;
  the palette's mode, case, regex-builder, and appearance toggles remain inline.
- Local evidence: TypeScript no-emit, targeted lint, repository-wide Prettier,
  and 42/42 focused tests passed. The real production renderer was exercised on
  Lowlevel MCP's off-screen Win32 desktop; direct palette activation, the CI
  composer, active elapsed/ETA progress, hide-without-Stop, and palette reopen
  are captured in
  [`docs/verification/agent-repair-progress-2026-07-30.md`](docs/verification/agent-repair-progress-2026-07-30.md).
  Remote SHA, hosted CI, and installer release remain pending until push.

## 2026-07-29 — CURRENT HANDOFF (read this first)

### Collapsible filters, searchable publish owners, relative age, and per-repository appearance

The repository side sheet now keeps its account, service, status, search, and
regex controls behind one state-preserving **Filters** disclosure that starts
collapsed. Active filters remain applied and are counted on the disclosure.
The existing compact **Add**, **Select**, and **More** action strip remains
reachable outside the panel. Its three equal-width buttons stay inside the
390 px sheet; bilingual labels stack inside each button instead of overflowing
or recreating the old multi-row clutter.

History commit hover/focus cards now pair the exact authored timestamp with an
auto-updating relative age. The relative phrase follows the active English,
Hong Kong Cantonese, or bilingual mode. The command-palette appearance editor
is compact and left-aligned and adds a persisted **Random per repository**
mode. It derives one of six balanced row layouts from the stable local
repository ID, so the same repository keeps its look across opens and restarts
without storing a path or redrawing randomly.

Publish repository now replaces the organization select with an anchored
Material listbox. Its native search field uses the shared fuzzy, substring, and
safe-RE2 modes plus the full Regex Builder. Typing never changes ownership,
invalid regex remains visibly fail-open, and switching accounts clears a stale
organization before the newest request can populate the list.

Focused implementation verification passes **133/133 tests across 11 files**,
including the ordinary `.gitmodules` Cheap LFS false-positive regression,
state-preserving filter collapse, bilingual relative time, nested
listbox/builder focus, fail-closed publishing, and a renderer-level proof that
two repository keys resolve to different row structures. The two gallery
capture-contract suites pass **73/73**. The exact Windows production build and
the four final current-build captures remain in progress; no stale renderer or
missing organization screenshot is being presented as final evidence.

The earlier candidate files awaiting current-build replacement are:

- `material-repositories-sheet.png` — 1440×960, SHA-256
  `0e7b37cc5b3e369c5ffb6a389c2b9cd7af02a4e51d76728d5ad96384ea97e02e`;
- `material-history-hover-time.png` — 1440×960, SHA-256
  `e3cc4132c79031ca7b7b8c559bdc1df9b862d60f887d34da2fe57f47cb14d933`;
- `material-command-palette-appearance.png` — 1000×687, SHA-256
  `23b2274af93b126ef3fa6103863c53a3abe0f3750f4bafd6f24758143fc65a7c`.

香港粵語：repo 篩選而家識摺埋又記得狀態，三粒主要掣喺窄版雙語都唔會
衝出門口；Publish owner 由舊式下拉變咗可搜尋 listbox，仲有完整 Regex
Builder，打錯 regex 都唔會將選項變魔術消失；History hover 同時講實際日期
同「幾耐之前」；命令面板仲可以每個 repo 穩定抽一款外觀，唔會每次打開都
洗牌洗到暈。133/133 個 focused test 同 73/73 capture contract 已過，
`.gitmodules` 唔再無啦啦畀 Cheap LFS 捉去問話；exact build 同四張最終圖
仲做緊，未綠燈就唔會偷步報喜。

### Earlier July 29 reliability close-out

This close-out is limited to two existing reliability changes. The Cheap LFS
cloud-compression workflow commit now uses a temporary empty
`core.hooksPath`, closing the post-commit gap left by `--no-verify` without
changing hooks for ordinary user commits. The second change adds the
authenticated diagnostic-log service, the best-effort client transport, its
deployment runbook, feature documentation, and category/master Postman
collections.

The focused desktop gate passes **38/38 tests across 2 files**, including a
real-Git fixture whose deliberately failing Git LFS-style `post-commit` hook
is not invoked while the exact workflow commit still reaches its bare remote.
The service gate passes **4/4 tests** for authorization, dashboard isolation,
ingest/redaction/persistence/search, and bounded storage metadata. TypeScript,
focused Prettier and ESLint, JSON parsing, Docker Compose validation, and
`git diff --check` pass. The deployed ARM64 service at
`192.168.50.242:4318` returns HTTP 200 from `/health`; its earlier
authenticated ingest/search/storage acceptance remains recorded below without
re-reading or exposing its bearer token.

The exact hidden Lowlevel MCP production build passed before integration in
402.68 seconds. While closing out, `origin/main` advanced independently to
`d99c09886001f778f11cbf51db67021e76b4f4ad` with the compact repository
actions work. Local `main` was fast-forwarded to that commit and this scope
reapplied without conflict. The exact integrated production build then passed
in **520.65 seconds** with `client_ok: true`, return code 0, no stderr, and no
timeout. The client reported a session-termination transport cleanup failure
only after returning the complete successful result; this non-visual run
created no headless desktop or app window. The integrated tree again passes
**38/38 desktop tests across 2 files**, **4/4 service tests**, and **19/19
documentation-catalog tests**, plus TypeScript, focused Prettier/ESLint,
new-file Markdown lint, JSON parsing, Compose validation, catalog parity, and
`git diff --check`. Remote publication evidence is the remaining gate.

Final review caught and corrected the dashboard's default `level=` request:
an empty level now means all levels, while a malformed non-empty client filter
returns HTTP 400 instead of falling through to an all-client query. The 4/4
service suite covers both cases, and the service image builds locally. After a
fresh host capacity/workload/port preflight, only the existing
`desktop-material-diagnostic-log-server` Compose service was rebuilt and
recreated. It is `running/healthy`; live public health and authenticated
default search return HTTP 200, malformed-client search returns HTTP 400, and
the deployed `server.mjs` SHA-256 is
`087a3e7b47d71c857dd9ee4b5111249dbf7e382dd3b0e3f44fde5beee37c9270`.
The host again reported that its kernel does not enforce the configured memory
limit; CPU, PID, retention, storage, and application-level bounds remain
active.

Immediately before commit, `origin/main` advanced from `d99c098860` to
`5a2fb5c228` with one test-only correction in
`app/test/unit/ui/repository-group-management-test.tsx`. The staged close-out
was preserved, local `main` was fast-forwarded, and the index reapplied
without conflict. No production source changed after the accepted build; the
upstream focused test was rerun as the integration gate.

香港粵語：今次淨係收好兩件已經開咗工嘅可靠性修正——Cheap LFS 背景 commit
唔再畀壞咗嘅 `post-commit` hook 扮失敗，同埋中央診斷記錄服務／客戶端正式
執齊。38/38 個桌面測試、4/4 個服務測試同靜態檢查都過晒；遠端中途有新
`main` commit 亦已經穩陣接返，冇用推土機式 push。依家只欠合併後最終
驗證同遠端出貨證明，唔會臨收舖先加新餸。

## 2026-07-29 — Compact repository actions

The repository side sheet no longer presents five equal-weight pills across
three rows. Its top-level action strip is now one 44 px row with **Add**,
**Select**, and **More**. The More menu preserves repository-group creation,
workspace sync, and commit/push-all; the two menu buttons expose localized
accessible names and popup state. New visible and accessibility copy ships in
English and playful Hong Kong Cantonese.

Focused repository-action and layout tests pass **6/6**. Targeted ESLint and
Prettier pass. The exact Lowlevel MCP production build completed successfully,
and the built Electron UI was exercised on the isolated
`WinSta0\DMCompactActions20260729T200345` desktop with a disposable one-repo
fixture. The accepted dark `1440×960` capture is
`docs/assets/screenshots/material-repositories-sheet.png`, SHA-256
`a4337af0544827860e8c0e9cf540359926f2b79b51c4ae9d1fe4b9571841dd1a`.
It contains no user repository names, credentials, or private account data.

The first production build correctly failed because an unbundled
`more_horiz` ligature violated the typed Material Symbols allowlist. The action
now uses the already bundled `category` glyph; the repeated build passed. The
headless run restored the matching Electron 42.0.1 runtime from its
checksum-verified local cache, with no download. Remote and CI publication
evidence follows in the rolling progress record, Discussion #98.

## 2026-07-29 — Diagnostic logging and Cheap LFS hook containment

The current task adds two isolated reliability surfaces. The Cheap LFS
cloud-compression workflow commit now uses a temporary empty `core.hooksPath`,
closing the post-commit gap that `--no-verify` leaves. Its real-Git regression
passes with a deliberately failing Git LFS-style hook and proves the exact
one-file commit reaches the remote.

The repository now also contains the authenticated diagnostic log service,
client remote transport, deployment runbook, feature documentation, and
category/master Postman routes. The ARM64 service is running healthy at
`192.168.50.242:4318` from
`/home/docker/services/desktop-material-diagnostic-log-server`, with data at
`/home/docker/data/desktop-material-diagnostic-logs`. Its bearer token exists
only in the host-side mode-0600 secret file. Live ingest, redaction, search, and
storage-status acceptance passed. Docker warned that this host does not enforce
memory cgroup limits; CPU, PID, storage, retention, and application-level
bounds remain active.

The issue-closeout, Cheap LFS helper, GitLab, and Windows bug-hunt lineages are
now reconciled in the local `main` merge, and all six textual conflicts are
resolved. The shutdown/profile persistence checkpoint is present at
`ac0e50fc2d`; its focused tests and task-branch push passed before
reconciliation. The merged tree then received four additional P1 repairs:

- single-clone Cheap LFS selections now reach the first real-repository refresh
  before ordinary all-pointer hydration can start, including an explicit empty
  selection;
- clone-helper inventories now begin with the exact `HEAD` pointer set and
  overlay only commit-selected paths, preserving hydrated and locally deleted
  unselected pointers while covering new pointers, rewrites, renames, and
  selected deletions;
- a retried quit requests pause before awaiting an already resumed clone batch,
  so a long clone cannot consume the bounded shutdown window before its journal
  is flushed; and
- profile leases and native close preparation are renderer-document scoped.
  Active profile mutations block unload until release, acquisitions crossing a
  navigation are rejected, and a replacement document must answer a fresh
  close request before normal exit or update installation may continue.

The post-reconciliation focused gate passes **194/194 tests across 17 files**.
TypeScript, targeted ESLint with the repository rules, targeted Prettier, the
231-entry documentation catalog, the generated hub parity gate, and the
line-ending contract also pass. This is a source checkpoint, not the final
acceptance claim. Completion still requires the full-tree gates, an exact
Windows production build through the off-screen Lowlevel MCP workflow, runtime
and updater-exit acceptance, a pushed default-branch proof, cleanup of every
merged task worktree/branch, and the applicable issue receipts.

香港粵語：四條工作線已經喺本機 `main` 完整對齊，六個文字衝突亦已解決。
今輪再修正單一 clone 揀檔時序、clone helper 清單遺漏、重試關閉等候長時間
clone，同埋 reload 跨文件設定檔鎖／關閉確認競態；相關 194/194 個重點測試
已通過。未完成完整 Windows build、離屏實機驗證、推送同清理之前，唔會當成
最終完成。

Desktop Material is Windows-only. The five `linux-tui-*.png` files, the TUI
source/package notes, and the July 27 Debian/Xvfb manifests are preserved
historical records, not supported product/release targets and not blockers for
this Windows close-out. Any later heading that says “read this first” is an
archived point-in-time handoff and is explicitly superseded by this section.

### Current-source updater capture accepted and published

The packaged development x64 application at runtime source
`b069384ad7d8a65d1192ee06859a705fe484c9c8` passed the real updater-ready gate.
Screenshot promotion commit
`e3967f1b81ec039624500797dca40a1ab6d98598` publishes
`docs/assets/screenshots/auto-updater-current-source-ready.png`: 960×660,
47,086 bytes, SHA-256
`0fc9caf5b13eb5b914121090f403c394545e02ea4303b11dd4598afcb3a2dfca`.
The 12,299-byte receipt has SHA-256
`50fe3ed0bcb5287786933a6ae1523021bd1417b1462a3fe5bb48d644d7527f3c`.

The accepted package contains 6,210 files and 385 directories totalling
904,084,592 bytes, with SHA-256
`1b728afc5c53c9a37b63b57af528a71356a726a1115458a458b6284fb05a7cdc`.
Its 226,677,760-byte `GitHubDesktop.exe` has SHA-256
`7930378e3675b12f337784dd29018c5110b4b789ec5bb79be2cec6c83a8a0c40`.

The verifier exercised real Electron/Squirrel events over loopback using a
disclosed inert, no-executable `9000.0.1` full nupkg. It proved the exact
current development x64 source, frontmost About, onboarding absent, and the
ready state. Protected install and external state stayed unchanged. File Exit
was requested before the graceful direct-quit fallback; **Quit and Install**
was never clicked. Owned processes, registry state, install tree, profile,
temporary state, and ready tree were removed, then the desktop listed zero
windows and closed.

Original-resolution inspection rejected an earlier formally successful frame
because Welcome covered About. The verifier was fixed to require the first-run
checklist to be absent and to use `elementFromPoint` for a frontmost About
attestation. That rejected candidate and the dated pending notes below remain
historical facts; they are superseded as the current updater acceptance state.
The immutable July 22 legacy migration frame remains a separate historical
artifact.

香港粵語：今次用真 build 同真 Electron/Squirrel event，Welcome 遮住 About
嗰張舊候選圖已經打回頭；修正 gate 要 onboarding checklist 消失兼驗明
About 喺最前，先收貨 960×660 圖、receipt 同完整清理證明。`Quit and
Install` 冇撳過，保護中嘅 install／外部狀態亦冇郁過。

### Main consolidation and task-worktree cleanup

Every task tip was rechecked as clean and as an ancestor of both `main` and
`origin/main` before cleanup:

- `codex/bug-hunt-20260728` at `bd0041d33989ded70ba1b6424b538312d502b455`;
- `codex/report-gitlab-core` at
  `10c2e3142d165fc971ba06bac52191a41f0b5b91`;
- `codex/report-gitlab-fixture` at
  `ada118d1bafe52e96f2517452747cbd94102da53`;
- `codex/report-gitlab-integration` at
  `b574c256061c1aebf524da4df86f5e384bfcacd2`;
- `codex/report-gitlab-live-fixture` at
  `a5ae2f6f535309113d10b3e119be580a0747cd92`; and
- `codex/report-gitlab-ui` at
  `bf566b4c5bee3487d2b3409443c91fc427d3a1d6`.

Their six linked worktrees and local branches were removed. The merged remote
`origin/codex/bug-hunt-20260728` tip
`ac0e50fc2d4571ffe0ec8c6d72f929988daf35cb` was also deleted. The one
initialized submodule set was at its recorded commits with no modified or
untracked content; the other five sets were uninitialized. Git left four
dependency junction shells after unregistering the worktrees, so each exact
junction was resolved and removed without traversal; the main checkout's root
and app `node_modules` targets remained intact. The now-empty worktree parent
was removed. Final cleanup proof must continue to show one registered `main`
worktree, no local or origin task branches, and no stashes. The unrelated
`desktop-plus` and `upstream` remotes were deliberately preserved.

香港粵語：六個 task tip 全部先驗明已經入咗本地同遠端 `main`、worktree
乾淨、submodule 冇改動，先刪 worktree、分支同已合併嘅遠端 task 分支；
共用 dependency junction 只刪連結本身，主 checkout 嘅 dependencies
冇郁。`desktop-plus` 同 `upstream` 係無關 remote，所以保留。

### Final regression and security sweep

The complete post-merge test run used application source
`d0be4827e0bb636132006d2c361ce845dc579f15` plus the documentation-only
publication edits in this handoff. It accounted for all 873 discovered files
across four batches: 7,112 tests reported, 7,111 passed, one intentional skip,
zero failures, and exit code 0 in 457.47 seconds. The script suite separately
reported 190 passes, two intentional skips, and zero failures.

`yarn lint`, `yarn tsc`, `yarn test:eslint`, the 27 updater/Pages verifier
contracts, and the 17 screenshot/wiki contracts all passed. The documentation
catalog regenerated 231 entries without a tracked generated-file change.

The full run exposed and then verified two late high-zoom regressions. The
GitHub Releases controls now retain their normal 40 CSS-pixel target while the
dedicated 125%–200% zoom layout uses 32 CSS pixels so a complete release row
stays above the fold. The formerly contradictory tests now assert both scopes,
and the verifier sources that had failed CI formatting are formatted.

The dependency sweep now resolves every `brace-expansion` consumer through the
callable compatibility adapter backed by patched 5.0.8. The adapter is covered
across minimatch 3/10, glob 7/13, bounded expansion, and Electron ASAR unpack
globs. `markdownlint-cli` 0.49.1 now brings `markdown-it` 14.3.0 and
`linkify-it` 5.0.2. The dev-dependency audit reports zero vulnerabilities, and
GitHub reports zero open Dependabot alerts.

Nine CodeQL false positives were removed without exclusions or suppressions:
fixed error strings are asserted exactly, the GHES host is checked as the exact
`--hostname` argument, Git config uses JSON string serialization, and
credential tests use length-checked constant-time equality without printing
secrets. The subsequent CodeQL run closed all nine. One high alert remains:
the production OAuth client secret is intentionally compiled into the native
public client. Moving it to another shipped bundle would not secure it.
GitHub's device flow is disabled for the bundled app registration, and changing
to device flow or a confidential exchange broker requires external app-owner
authority, a credential rotation/migration plan, and a product decision. Alert
45 therefore remains open rather than being dismissed inaccurately.

香港粵語：最終 full suite 873/873 個檔案都有結果，7,112 個 test 係
7,111 pass、1 個有意 skip、0 fail；lint、TypeScript、驗證器同文件合約
亦全綠。三個 Dependabot 漏洞已清零，九個 CodeQL 誤報用更精準斷言收妥。
OAuth secret 嗰個真實架構警報冇扮作解決：要 app owner 開 device flow
或者提供 confidential broker，同時要做憑證輪換先可以真正移除。

### Security, packaging, and toolchain hardening checkpoint

The merged tree at `d273ae95d7` received a second bug-hunt pass before packaged
runtime acceptance:

- the static-resource packager now materializes only contained regular-file
  links, rejects escaping, directory, broken, and destination links before a
  copy can write outside the output tree, and leaves the packaged static tree
  free of reparse points;
- the shell-extension build captures Visual Studio's environment through one
  bounded static `cmd.exe` bootstrap, parses only rows after an explicit marker,
  and passes every compiler path and option directly to `cl.exe` as argv;
- bounded linear OCI component validation replaces three backtracking regular
  expressions, including million-character pre-network regressions;
- payload bounds use checked `BigInt` arithmetic, guided-proof authorization is
  length-bounded and linear, TLS tests trust their fixture CA, certificate paths
  reject controls, and documentation HTML extraction uses JSDOM rather than
  regex stripping or manual entity decoding;
- real OAuth values are injected only into the full renderer. Main, crash, CLI,
  highlighter, and quick-action bundles receive JavaScript `undefined`; the
  quick-action renderer now has its own process kind so it cannot emit a false
  authentication warning;
- TypeScript-ESLint 8 support retains the repository's explicit legacy policy
  while fixing the custom React lifecycle rule for the renamed AST field and
  for context leakage across sibling or nested classes; and
- the dependency refresh pins compatibility-sensitive TypeScript, React,
  formatter, test-runner, and request-typing versions, removes an unused Azure
  dependency, raises the honest Node floor to 22, and keeps both Yarn lockfiles
  plus the TUI UV lock synchronized.

Current local gates pass: a frozen root install (including the app/native
post-install), repo-wide lint, TypeScript, 93/93 focused app tests, 186/188
script tests with only the absent ARM64 toolchain and optional Mermaid browser
skipped, 4/4 custom ESLint-rule tests, and the TUI's 250 tests with its one
platform-only skip plus Ruff and Mypy. The dependency audit is reduced to one
unique `brace-expansion` advisory through four repository build/lint paths; no
compatible 1.x patch exists, those paths do not ship in the app, and forcing
the incompatible 5.x API into Minimatch 3 was rejected.

This is still a source checkpoint. The exact committed tip needs its own
production build, packaged-tree proof, off-screen updater receipt and inspected
960×660 screenshot, full 7,100-test gate after screenshot promotion, final
documentation push, remote CI/Pages proof, and merged branch/worktree cleanup.

香港粵語：第二輪已加固封裝 symlink／reparse point、原生編譯器參數、OCI
驗證、加密長度、文件 HTML 解析、OAuth bundle 邊界、ESLint AST 相容性同
依賴鎖檔；fresh install、lint、TypeScript、重點 app／script／TUI 測試已
通過。未完成同一個 commit 嘅 Windows 封裝、離屏 updater receipt、完整
7,100 個測試、遠端 CI／Pages 同分支／worktree 清理之前，仍然唔會當成
最終完成。

### Superseded stop-now checkpoint

The last exact source-and-verifier checkpoint is
`ddfbec8302cd4ac4f5f4fb4313f36505dd34750c`, and the stop-now handoff recording
its final boundary is pushed at
`d107b0aeb8be2db6f3bd1baf152548249bcd562b`. Local and remote `main` matched
that latter commit before this final cleanup note. The completed Cheap LFS and
close-out source tips are ancestors of pushed `main`; their two remote task
branches were deleted after that proof.

The exact-tip updater run built `ddfbec8302` successfully and reached the real
Electron/Squirrel **Update ready** UI. Chromium wrote a 960×660, 46,232-byte
candidate PNG, but the verifier deliberately rejected the run because its
normal File → Exit request left the owned app process alive beyond the
45-second cleanup bound. The candidate was therefore **not promoted** to the
gallery and no complete verifier receipt exists. Cleanup was then performed
through the real app dispatcher with `quitApp(true)` on the same off-screen
desktop. The app process count and headless window count both reached zero, and
`DesktopMaterialMainUpdater-20260728-441a0f01ca54` was released. A successor
should repair the verifier's normal-exit boundary, rerun it from a clean owned
root, require the complete receipt, inspect the image at original pixels, and
only then promote the screenshot.

The focused updater source gates completed before this stop: updater behavior
31/31, release-note behavior 6/6, and verifier contract 18/18, with TypeScript
and targeted formatting/lint clean. Full final-tree tests and the exact pushed
CI/release verdict remain remote or outstanding and must be reported as such.

Eight sibling directories that were no longer registered Git worktrees were
revalidated as empty shells containing only two junctions back to this
checkout's dependency directories. The junctions were unlinked first and all
eight empty shells were removed. The failed updater run root contained no live
owned process or reparse point; its read-only Git objects were normalized and
the exact temporary root was then removed. No stash or additional registered
worktree remains.

`origin/codex/bug-hunt-20260728` is intentionally preserved at
`bd0041d33989ded70ba1b6424b538312d502b455`. It is an unfinished lineage, not
cleanup debris: 25 commits diverge from `main`, a trial merge has six content
conflicts, and exact-tip CI run
[`30420344514`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30420344514)
failed current docs/gallery gates. Its own handoff still requires a build, full
tests, visual acceptance, and issue receipts. Do not delete or wholesale-merge
it until those changes are reconciled and verified.

For `d107b0aeb8`, Cheap LFS cloud compression run
[`30423623373`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30423623373)
passed, while CI
[`30423623412`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30423623412)
and Code scanning
[`30423623414`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30423623414)
were still running at handoff. No release targeted that SHA yet. The continuous
issue scan remained #23, #80, #81, #82, #85, #87, #94, #95, and #96.

### Cheap LFS long Windows filenames and materialized-pull boundary

The integrated tree now keeps every Cheap LFS recovery/materialization
component independent of the tracked basename. A valid 200-unit Windows
filename previously grew to 256–267 units when the tracked store, GHCR/OCI
restore, or generated clone hydrator appended its suffix; a 255-unit filename
grew to 311–322. Those per-component overflows are not repaired by
`core.longpaths`, `\\?\`, a short checkout root, or 8.3 aliases. The new
bounded process/UUID names cover tracked recovery, consumed sources, GHCR
staging, OCI materialization, and generated hydration. Current and historical
crash-orphan shapes are also recognized by the owned-artifact scanner and
private `info/exclude` block.

The focused Windows regression gate passes **82/82 tests across seven files**:
255-unit tracked publish/replace, 200-unit Release helper hydration, 200-unit
GHCR and OCI materialization, all bounded sidecar kinds, and current/legacy
owned-artifact shapes. That is a source-level checkpoint only. The earlier
successful exact-`67d475fd5e` production compile/package is now superseded by
this later source change; the bounded-sidecar final tip still needs its own
full build, headless acceptance, commit, push, CI, and installer release.

The reported Pull dialog is a separate boundary. Desktop projects an
exact-hash **Materialized** payload as clean, while Git still sees raw bytes
where its index carries a pointer and correctly refuses an incoming overwrite.
Do not use **Stash changes and continue** for multi-gigabyte materialized
payloads. On the current build, first copy those verified payloads outside the
repository, restore only paths explicitly marked **Materialized** from `HEAD`,
pull, run **Materialize all**, and retain the backup until hydration verifies.
An edited or **Modified** path must never be restored this way.

### Standalone Cheap LFS versus Git LFS comparison atlas

The Pages lineage based on remote `823f7fa0e5` added
`site/cheap-lfs-vs-git-lfs.html` as a genuinely separate route rather than
stretching the existing product guide again. The route controller defines
exactly 72 bilingual, row-level sourced criteria in 12 categories and renders
desktop table plus narrow card views. Its fit signals are contextual:
`cheap`, `git`, `tie`, or `depends`; there is no aggregated product winner.

Six browser-style tabs separate the verdict, matrix, exact `git push` handoff,
workflow diagrams, fit finder, and source library. Tab order, pins, active
hash, and per-tab font/size/color/radius appearance persist. Comparison
category and outcome persist under route-specific keys, while the page shares
the established EN/粵/EN+粵, independent funny-level, and theme keys. Text
search remains plain by default. Explicit regex mode delegates both search and
builder work to the documentation site's shared same-origin worker, which the
page terminates at 750 ms; patterns never compile on the page thread and are
not persisted.

The dedicated push tab preserves the product boundary: provider bytes and
provider proof precede a Cheap pointer commit on an established branch; a
first Release-backed publication may need the app's create-only anchor; OCI
does not. Plain `git push` publishes the already-created pointer commit. The
proof inspects `git show HEAD:path/to/large-file.bin`, pushes, fetches, and
requires `git rev-parse HEAD` to equal `git rev-parse '@{upstream}'`. It warns
that materialized raw bytes may appear modified and must not be added over the
pointer, and that ordinary
`git push --set-upstream origin HEAD` is not the app's hook-skipping anchor.
The parallel Git LFS lane documents tracking, `.gitattributes`, the clean
filter, and the pre-push hook.

The two marketing graphics are code-native
`site/assets/cheap-lfs/comparison-orbit.svg` and
`site/assets/cheap-lfs/pointer-paths.svg`; they are conceptual diagrams with
accessible titles/descriptions, not fabricated app evidence. The full feature
contract is
[`docs/features/repository-management/cheap-lfs-vs-git-lfs.md`](docs/features/repository-management/cheap-lfs-vs-git-lfs.md).

**Verification state:** local Pages acceptance completed before integration.
The new 72-row contract and original 30-row guide pass; documentation
catalog/hub/regex/search suites pass 59/59; and the exact Lowlevel MCP run passed
35/35 installed-Chrome checks in six phases with 33/33 HTTP 200 responses, zero
runtime errors, zero document overflow at 1440×960 and 390×844, and verified
browser/server cleanup. The accepted captures and hashes live in
`docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/`.

That branch base predates renderer multi-compiler correction `6903c9ae1e`. Its
skill-required production-build attempt entered that known pre-fix webpack
path, so only the validated task-owned ten-process tree was stopped. The
captured boundary is `returncode=4294967295`, empty stderr, and
`timed_out=false`; no app-build success is claimed. The route is now present on
remote `main` at `80e0209a12f41df8a6a80ef52925b52ab9ecb1b0`, and Pages run
`30391300142` deployed that source successfully. Final exact application build
proof still belongs to the integrated tree.

### Cheap LFS Pages comparison and push guide

`site/cheap-lfs.html` now presents a filterable 30-decision Cheap LFS versus
Git LFS comparison and a six-stage push handoff. The copy is deliberately
marketing-forward without hiding the boundaries: an established branch
uploads and verifies provider bytes before the compact pointer commit is
pushed; a first Release-backed publication may require the app's create-only,
hook-skipping branch anchor first. The CLI proof uses `git show` for the
committed pointer, warns against adding the materialized raw file, fetches the
remote, and requires `HEAD` to equal `@{upstream}`.

The dedicated verifier served the assembled site on loopback and drove
installed Chrome headlessly through Lowlevel MCP. Its **46/46** checks across
eight phases covered all three language modes, both themes, independent
funny-level persistence, every comparison filter and reload persistence,
desktop and 390 px overflow, compact-nav keyboard reachability, image/network
health, and browser/server cleanup. Accepted captures are
`docs/verification/cheap-lfs-pages-revamp-2026-07-28/cheap-lfs-comparison-wide.png`
(1440×960) and `cheap-lfs-push-narrow.png` (390×844); exact hashes and the
Pages-only evidence boundary are in the dated receipt.

The skill-required full Electron production build was started through the
exact Lowlevel MCP endpoint but remained silent for more than 34 minutes. It
was interrupted when the user prioritized publishing the site update, so this
milestone makes no full-app build claim and changes no app screenshot.

## Close-all-open-issues verification provenance

### Integrated close-out gate

The close-all-open-issues wave is merged locally but remains unpushed.
Source and contract work is present, but completion still requires the exact
Windows production build, the declared focused and full test gates, fresh
acceptance for all 86 Windows gallery targets, default-branch integration and
push proof, and separate finished/closing receipts for each issue. None of
those remaining gates is inferred from an older screenshot or test run.

Desktop Material is Windows-only. The five `linux-tui-*.png` files, the TUI
source/package notes, and the July 27 Debian/Xvfb manifests are preserved
historical records, not supported product/release targets and not blockers for
this Windows close-out. Any later heading that says “read this first” is an
archived point-in-time handoff and is explicitly superseded by this section.

### Immutable provenance for historical screenshot hashes

Every dated screenshot byte count/SHA table below refers to the exact
commit-addressed blob in this table. The pathname is a display label, not a
claim that mutable `main` still contains the same bytes after a gallery
refresh.

<!-- markdownlint-disable MD013 -->

| Historical frame | Immutable source blob |
| --- | --- |
| Tab groups | [`material-tab-groups.png` at `58be6fe5953477b015a134c414a8cf82363ecc75`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/58be6fe5953477b015a134c414a8cf82363ecc75/docs/assets/screenshots/material-tab-groups.png) |
| Command palette | [`material-command-palette-appearance.png` at `58be6fe5953477b015a134c414a8cf82363ecc75`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/58be6fe5953477b015a134c414a8cf82363ecc75/docs/assets/screenshots/material-command-palette-appearance.png) |
| Cheap LFS UI | [`cheap-lfs-ui-acceptance.png` at `342a1548009a3e1591c27f7a4af82cf6cf02c96e`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/342a1548009a3e1591c27f7a4af82cf6cf02c96e/docs/assets/screenshots/cheap-lfs-ui-acceptance.png) |
| Cheap LFS cloud | [`cheap-lfs-cloud-compression.png` at `f7b4760a13894f0320f7b361f055f6fba40d913f`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/f7b4760a13894f0320f7b361f055f6fba40d913f/docs/assets/screenshots/cheap-lfs-cloud-compression.png) |
| Cheap LFS commit progress | [`cheap-lfs-commit-progress.png` at `c3db37ea5524b91f9603151ae5d1107205f16a59`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/c3db37ea5524b91f9603151ae5d1107205f16a59/docs/assets/screenshots/cheap-lfs-commit-progress.png) |
| Compact Releases | [`material-github-releases-compact.png` at `513c5cc96aee045a218837530a11951e8466b618`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/513c5cc96aee045a218837530a11951e8466b618/docs/assets/screenshots/material-github-releases-compact.png) |
| Legacy updater migration | [`auto-updater-update-ready.png` at `923dbb51acad8f01f01f1c100c6945c7a2e08e23`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/923dbb51acad8f01f01f1c100c6945c7a2e08e23/docs/assets/screenshots/auto-updater-update-ready.png) |
| Safe regex builder | [`regex-builder.png` at `f8eca3ac844e8eaec2dc2dce635f57874b4e92bc`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/f8eca3ac844e8eaec2dc2dce635f57874b4e92bc/docs/assets/screenshots/regex-builder.png) |

<!-- markdownlint-enable MD013 -->

### Superseded pre-final-review TypeScript gate

The logged root `npx tsc --noEmit` run completed with exit `0` after its
foreground wait had timed out. The authoritative files are
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\tsc-noemit-source-freeze.log`
and
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\tsc-noemit-source-freeze.exit`;
an empty log is expected for this clean compiler pass. Wrapper PID `14588` and
compiler PID `19300` were both rechecked and proved absent, so the gate left no
owned compiler process running. Later adversarial review changed progressive
error normalization and its tests, so this earlier pass is retained only as a
scoped historical checkpoint and is **not** the final-tree TypeScript proof. A
second run begun before that review finished was deliberately marked
superseded; its exact wrapper/command/compiler/console-host process tree
(`3148`, `6168`, `16148`, `16340`) was stopped and proved absent. Final closure
requires a fresh post-review compiler run. Neither checkpoint stands in for the
production build, full test suite, visual acceptance, publication, or issue
closure.

### Reviewed-source checkpoint before `main` reconciliation

After the adversarial code and documentation reviews completed, a fresh
`npx tsc --noEmit` run passed with exit `0`, and `yarn lint` passed the
repository-wide Prettier check, the ESLint/Prettier compatibility check, and
source ESLint with exit `0` in 319.30 seconds. The authoritative files are
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\tsc-noemit-reviewed-source-freeze.{log,exit}`
and
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\yarn-lint-reviewed-source.{log,exit}`.
Their wrapper/compiler process trees were rechecked and proved absent.

All 16 verifier contract files then ran. **206/207** assertions passed; the
only failure was the intended fail-closed Pages import because the distinct
current-source updater frame,
`auto-updater-current-source-ready.png`, does not exist yet. The complete log
is
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\verifier-contracts-reviewed-source.log`.
This checkpoint predates reconciliation with the newer remote `main` fixes,
including #96, so the same gates must run again on the merged source before the
exact build.

### Post-checkpoint acceptance and CI reconciliation

The pushed close-out checkpoint is
`2fedf140e394fa2fea3e380203e716b6f7aa8628`. Remote CI run
[`30370044526`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30370044526)
completed with successful lint, Windows TUI core, and packaged Windows x64 E2E
smoke. Its 845-file/6,957-test Windows x64 unit run had exactly seven leaf
failures: the two deliberate missing-updater gallery gates plus five stale
source/copy assertions described below. Three Linux TUI jobs stopped only at
the generated parity-contract hash, and Windows arm64 script tests stopped only
at the generated documentation catalog. The parity contract has therefore been
regenerated from the current 201-row source. The documentation catalog repair
already exists on newer `main` and will be regenerated again only after the
final documentation tree is reconciled.

The preceding branch run also exposed three stale source-shape tests. Their
assertions now follow the current lazy repository-tools JSX wiring, the shared
context-menu appearance helper, and the localized “Subtrees could not be
loaded” copy. These are test-contract repairs, not product-behavior changes.
The updater/wiki failures remain deliberately unresolved until the distinct
current-source updater frame is produced by the packaged-build verifier.

A separate read-only acceptance audit proved that every required verifier
implementation exists, but found two printed command templates that their own
containment checks would reject. The internal-browser receipt is now a direct
child of its owned run root, and the Ollama receipt now shares the owned P0
`captures` directory with its PNG. A cross-contract assertion pins both rules.
After the shared renderer profiler became quiescent, the three repaired app
test files passed **46/46 across 3/3 files**, the regenerated 201-row parity
contract passed its checked-generation gate, and the gallery plus live Cheap
LFS contracts passed **75/75**. Prettier, application-test ESLint, the
repository-ignored verifier lint with its intentional CommonJS/synchronous
rules disabled, syntax checks, and `git diff --check` are green. The
authoritative logs are
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\post-ci-repair-{targeted-tests,contracts,format-lint}.log`.
Those reviewed repairs and provenance fences are pushed at
`107bd91a003f490fa3d91cc642a7beaa350d2c35`; branch CI run
[`30376865471`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30376865471)
is queued. The matching rolling checkpoint is
[Discussion #54 comment 17815363](https://github.com/Ding-Ding-Projects/desktop-material/discussions/54#discussioncomment-17815363),
and the private-gallery authority boundary is recorded on
[#23 comment 5106684118](https://github.com/Ding-Ding-Projects/desktop-material/issues/23#issuecomment-5106684118).
Those two earlier receipts printed a nonexistent source-gate SHA; the
correction is explicit in
[Discussion comment 17815648](https://github.com/Ding-Ding-Projects/desktop-material/discussions/54#discussioncomment-17815648)
and
[#23 comment 5107001088](https://github.com/Ding-Ding-Projects/desktop-material/issues/23#issuecomment-5107001088).
Only `107bd91a003f490fa3d91cc642a7beaa350d2c35` is authoritative.

The open-issue scan after that audit remains exactly #23, #80, #81, #82, #85,
#87, #94, #95, and #96. Two #23 specialist frames still require read access to
`DingDingChae/desktop-material-cheap-lfs-private-20260722-153308`. Both GitHub
API and non-prompting HTTPS checks under the active `codingmachineedge`
identity return not-found. No substitute repository, historical frame, or
mocked provenance will be represented as that private live acceptance.

The read-only audit also found that the cloud specialist's current pin is
internally inconsistent with the retained history. Its verifier requires
`e56519d4742c63bb2c9f5f1e917de3fca7379fdd`, the pre-compression UI-acceptance
commit, while simultaneously requiring the compressed pointer first documented
at `6259b0fa0dc6c65cdb5a90af8e1da9358b45b0ac` and today's
no-private-workflow encrypted-builder routing. Read access is required first to
inspect authentic later history. If no retained commit contains the compressed
pointer with the legacy private workflow removed, producing that current-state
evidence will require separate owner authorization for one narrowly scoped
fixture commit; it will not be inferred from the request to capture screenshots.

The live Cheap LFS specialist now fails closed around that boundary. Before
attaching to Chromium, after the settled production surface proves the current
builder-routing state, and immediately after original-pixel capture, it
bookends read-only Git snapshots and requires a clean `main` checkout at the
exact `origin/main` SHA. Every fence revalidates the repository root and
`.git` directory as the same real directories, checks Git's reported top-level
and absolute Git directory, and rebinds the reviewed GitHub origin. The cloud
scene additionally requires
`.github/workflows/cheap-lfs-cloud-compression.yml` to be absent from `HEAD`,
the index, and the real working tree; link/junction parents, ignored occupants,
and any other non-absence fail. A version-2 receipt binds the exact reviewed
commit, hashed origin, and stable filesystem identity to its canonical SHA-256
fingerprints. Capture creation uses an exclusive descriptor, full write,
`fsync`, and identity-aware cleanup; the fully written receipt is published
atomically without overwriting through a same-directory hard link. The focused
contract passes **20/20**, including real dangling-link and atomic-publication
probes plus injected write failures. This closes the verifier's mount-time
rewrite and orphan-output gaps without pretending that the inaccessible,
internally inconsistent fixture pin is resolved. A mutation that begins and
fully reverts between samples remains the unavoidable read-only TOCTOU limit;
the owned fresh clone and three double-fenced samples are the strongest
non-mutating mitigation.

## 2026-07-28 — Bounded Cheap LFS inventory joins the close-out (Refs #96)

Issue #96 was filed while this campaign was active. The initial fix landed on
remote `main` and is now present through this merge. Adversarial review showed
that its size preflight still sent a pointer-looking oversized file to
`git grep -I --untracked`, so a hostile 50+ GiB sparse file could exhaust Git
before Desktop Material's bounded format validator ran.

The close-out branch now removes working-tree content from Git grep entirely.
Unscoped inventory asks Git only for NUL-delimited changed/untracked names;
explicit path selections are validated before any asynchronous Git work. Each
candidate is then proven as an in-repository regular single-link file and only
its first **512 bytes** are read through the tracked-path store. The prefix read
requires a settled identity, rechecks the opened handle and visible path after
the read, revalidates every parent, refuses symlinks/reparse points, gitlinks,
linked files, and identity drift, and rejects unsafe or non-safe-integer
bounds. Clean committed pointers remain classified from their bounded
working-tree text. Pointer-looking oversized files are carried to the existing
bounded format rejection; raw oversized files never enter content grep.

The regression uses real NTFS sparse files with the issue's exact logical size,
**55,581,030,080 bytes**, for both raw and pointer-looking cases. Git Trace2
proves the vulnerable `grep --untracked` command is absent while the bounded
name inventory still runs. It also covers scoped and unscoped calls, traversal
prevalidation, clean committed pointers, modified gitlinks, selected symlinks,
the exact pointer-format boundary, future-mtime/unsettled identity proofs, and
invalid prefix bounds. The final focused pair passes **82/82**; the complete
Cheap LFS directory passes **673/673 across 48 files and 89 suites** in
187.55 seconds. Two independent adversarial reviewers found no remaining
actionable blocker in #96's reported working-tree scope. Index/HEAD Git-object
inventory still uses bounded-result Git plumbing and is recorded as a separate
hardening opportunity, not part of #96's explicit `--untracked` reproduction.

The source fix is closure-ready locally, but the issue remains open. Final
closure still requires a fresh final-tree typecheck/lint pass after all
reconciliation, the exact MCP production build, pushed `main` ancestry,
applicable remote checks, and a timestamped finished receipt.

## 2026-07-28 — Guided gallery scoped to 84 Windows scenes (Refs #23)

The current guided-gallery contract, capture plan, and Pages manifest declare
exactly **84 Windows targets**: 67 canonical outputs and 17 specialist outputs.
That declaration does not become a published 84-image acceptance until every
target exists and passes the current-build capture, privacy, and promotion
gates. The five original `linux-tui-*.png` files and their dated Debian/Xvfb
manifests remain byte-for-byte historical evidence, but are explicitly outside
the current gallery rows, raw-main image set, Pages figures, and promotion
plan. README/wiki/site screenshot surfaces describe that boundary without
relabeling the old pixels as Windows evidence.

Issue #23's older public body and comments contain superseded 77- and 89-image
counts. Its final evidence comment must explicitly correct that history to the
current contract: 84 blocking Windows scenes, plus five preserved historical
Linux/Xvfb frames outside the current set.

The July 22 legacy updater-migration frame is also retained outside the current
set at immutable commit `923dbb51acad8f01f01f1c100c6945c7a2e08e23`.
Current-source updater acceptance owns a distinct filename, so its promotion
cannot overwrite or relabel those 49,195 historical bytes.

Static documentation generation and the non-image-dependent documentation,
tab-count, tooltip-lifetime, and localization checks pass. The fail-closed
gallery validity checks correctly remain red because the distinct
`auto-updater-current-source-ready.png` target has not yet been captured; the
legacy updater blob is historical evidence and cannot satisfy that current
slot. No UI was launched and no screenshot was recaptured or deleted in this
documentation checkpoint. Issue closure still requires current-build
acceptance for all 84 Windows targets.

## 2026-07-28 — Measured Changes/History renderer update suppression (`main` checkpoint)

The exact baseline `v3.6.3-beta3-zadughkqcv` Windows x64 portable build at
`9bdfdb8b25e458e4834bdaa26473d44a5602621d` was driven on an isolated Lowlevel
MCP Win32 desktop. Idle rendering was already smooth (122/122 frames at
16.51 ms average, 16.80 ms max, zero over 25 ms), but twelve warmed
Changes/History switches measured 56–104 ms and six 59–67 ms long tasks. A
single Changes click measured 104 ms, one 62 ms long task, and 166 mutation
records.

`RepositoryView.onTabClicked` always dispatched
`updateCompareForm({ showBranchList: false })` after the real section mutation.
`AppStore._updateCompareForm` then merged and emitted even when the value was
already false, producing a second root render for one user click. Navigation
now dispatches only when the list is open, and a store-level equality gate
protects every caller. Focused responsiveness, lifecycle, progressive-loading,
and navigation coverage passed **42/42**. In that source checkout, changed-file
ESLint could not load five repository-specific rules; it reported only missing
rule definitions, not source findings.

That source checkout's mandated production build and direct compile diagnostic
both reached bounded webpack timeouts, and its reused incomplete dependency
tree left repository-wide TypeScript red without naming the new helper or
test. No post-fix binary or timing was claimed by that checkpoint. The merged
close-out tree still owes the final gates listed in the current handoff above.

## 2026-07-28 — Tab-group dialogs move onto the dialog layer (Refs #92)

`CreateTabGroupDialog`/`EditTabGroupDialog` rendered inline in
`repository-tab-strip.tsx`. `Dialog` carries `tooltip-host`, whose
`position: relative` overrides the UA `position: absolute` on `<dialog>`, so
they laid out as in-flow flex items of the strip at `z-index: auto` and the app
bar's positioned pills painted over the Group color swatches. Both now portal
into `#dialog-layer` via the new `app/src/ui/dialog/dialog-layer.tsx`. Second
defect in the same frame: `Tooltip` anchors mouse-placed tips to `mouseRect`,
which stays `(0,0,0,0)` when a tip is shown by focus, and `getDirection` falls
back to an unclamped SOUTH — so the tip landed half outside the window.
`getTargetRect` now falls back to the target's box and
`clampTooltipRectToWindow` bounds every tooltip. Verified: 17/17 across the
three touched test files (5 new, each confirmed failing before the fix), `tsc`
exits 0, eslint and repo-wide prettier clean. **Not visually verified** — no
build or capture was run on this worktree.

## 2026-07-28 — Disconnected tooltip owners clean up immediately (Refs #94)

A tooltip could outlive a transient button or row when React removed its owner
without dispatching `mouseout` or `blur`. `Tooltip` now observes target
connectivity only while a tip is pending or visible. If the target disconnects,
it cancels pending show/hide timers, stops its observer and viewport listeners,
removes the portal, and clears the old target's tooltip marker and
`aria-describedby`; unmount performs the same cleanup. Focused regressions
cover both removal before the delay expires and removal after the tooltip is
visible. Final built-app acceptance remains part of the current Windows gate
and is not claimed here.

## 2026-07-28 — Tab counts use truthful singular and many copy (Refs #95)

Count selection now lives in `tab-count-copy.ts` instead of being scattered
through individual controls. English uses singular copy for exactly one and
the many form for zero or two-plus across the group chip, edit-dialog intro,
member-menu button/status, and overflow-button accessible name. Cantonese keeps
its natural count wording while using the same one/many selection contract.
Unit coverage exercises 0, 1, and 2 in English and Cantonese and checks the real
collapsed-group and overflow-button accessible names. The fresh source-freeze
#95/i18n run covered 4/4 declared files and passed 64/64 tests with exit `0`;
its authoritative files are
`%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\focused-tab-copy-source-freeze.log`
and the matching `.exit` file. Wrapper PID `3252` was rechecked and proved
absent. This is exact focused proof, not built-app acceptance, which remains
pending with the current Windows gate.

## 2026-07-28 — Encrypted restore names the decrypting phase (Refs #85)

Encrypted-and-compressed Release restores now report the real transform order:
**Downloading → Decrypting → Decompressing → Verifying → Materializing**.
The plain bilingual label is **Decrypting · 解密緊**; funny-level voice may vary
without changing the phase, path, byte counts, or order. The focused operation,
progress, localization, and real-operation verifier contracts cover the
distinct phase. Exact current-build UI acceptance remains pending and is not
borrowed from the July 22 Cheap LFS screenshots.

## 2026-07-28 — Unattended encrypted Cheap LFS pin skips instead of prompting (Refs #87)

`isBackgroundTask` now reaches `autoPinLargeFilesBeforeCommit`. A scheduled
commit whose repository has Release payload encryption on and no saved password
skips the pin via `app/src/lib/cheap-lfs/unattended-encryption.ts` — nothing
encrypted, nothing uploaded, no anchor published, the large files left in the
working tree and out of that commit, and one non-blocking notice per repository.
The interactive modal is unchanged. Verified: 638/638 Cheap LFS tests green
(22 new), `npx tsc --noEmit` exits 0, `yarn lint` clean. Not visually verified —
no build was run.

## 2026-07-28 — Shift+Right-click opens appearance editors (Refs #89)

The appearance editor no longer claims a plain right-click anywhere. The
gesture is now Shift+Right-click, decided once by
`isAppearanceEditorPointerGesture` in `app/src/ui/appearance/`; the
shell-wide `document` listener in `app.tsx` uses
`isAppearanceEditorFallbackContextMenu`, which also accepts a
keyboard-originated context menu so those owners never become mouse-only.
Surfaces with a real menu (tab strip, tab overflow rows, repository list)
keep it and their Customize entries. Settings → Appearance advertises the
gesture in both languages at every playfulness level. Verified: 100 unit tests
across 15 files green, eslint and prettier clean. Not visually verified — no
build was run.

The two pre-existing `tsc` errors that branch recorded against its base
(`operations.ts` and `app.tsx`) were the merge-collision damage fixed in
`ff53cd2155`; after merging, `npx tsc --noEmit` exits 0 on this tree.

## 2026-07-28 — Root renderer resource lifetime audit (historical predecessor checkout snapshot)

The root `App` created telemetry and update-check intervals without retaining
their handles, while `componentWillUnmount` cleared only an unrelated interval.
A queued idle callback could therefore start permanent polling after unmount.
The same root instance was retained by undisposed app/build/updater/drag
subscriptions, three IPC listeners, document drag/drop/focus handlers, and
application-menu key listeners.

The fix collects subscriptions in one `CompositeDisposable`, makes typed IPC
`on()` registrations disposable, retains and clears both deferred timer
handles, releases every global handler, and guards queued idle/animation-frame
work with the mounted state. Focused lifecycle tests pass **4/4** and ESLint is
clean on all three changed files.

In that predecessor checkout, the exact Lowlevel MCP headless build preflight
passed against server checkout
`f2edfe442555cfe35a519dd0b058986cb09d6ee3`, but the mandated production build
stopped before compilation because that predecessor checkout had no dependency
tree and `npx --no-install` correctly refused to download missing `cross-env`.
Repository-wide TypeScript was also red from missing baseline dependencies
(`dugite`, `registry-js`, Copilot SDK, Dexie, and others); no reported
diagnostic targeted the changed files. That checkout-specific environment is
superseded by the current handoff and is not a current blocker or current test
verdict.
## 2026-07-27 — Progressive asynchronous lazy loading (locally verified, Refs #82)

`App.render()` returns `null` until `AppStore.loadInitialState()` resolves, so
every await in that method was a blank window. Two of them were slow and
optional: enumerating installed external editors (a filesystem walk plus, on
Windows, a registry read) and recovering the interrupted clone-queue journal.
Both now run in `loadDeferredInitialState()`, which `loadInitialState()` starts
without awaiting. The selected editor is adopted from `localStorage` so the
shell paints with the user's real choice; the availability scan corrects it
afterwards and drops its own answer when `externalEditorSelectionGeneration`
shows the user picked an editor while it was running. Each deferred step is
isolated and reports failures through `sendNonFatalException('deferredStartup')`
rather than swallowing them. No timers were introduced anywhere in that path.

`repository.tsx` previously imported seven substantial section modules
statically (Actions, Releases, Cheap LFS, Issues, GitHub API explorer, provider
triage, repository tools), so all seven were evaluated at launch even in a
session that only looked at Changes. They are now type-only imports plus direct
named asynchronous imports, rendered through a new `LazyView`. The production
renderer emits the exact seven `repository-*.js` chunks; no
`webpackMode: "eager"` or barrel import remains. Changes and History stay
static. A failing section shows a local `role="alert"` surface naming the real
error with a working retry, plus a persistent corner notification — never a
modal, never a focus move. Webpack chunk failures retain the actionable chunk
name while redacting only a private `file:///C:/…/out/` installation prefix
before the message reaches either surface.

`app/src/lib/progressive-load.ts` holds the ordering rules once:
`LatestLoadGate` refuses a token that is not strictly newer than the last
accepted one, and `ProgressiveLoad.run()` never rejects, turning a rejection
into a `failed` state carrying the real `Error`. It is used by `LazyView` and by
the submodule/subtree count loaders in `repository.tsx`, which also stop
discarding their failure reason in a bare `catch {}`.

Current focused evidence is **37/37** across
`progressive-load-test.ts`, `ui/lazy-view-test.tsx`, and
`progressive-startup-test.ts`; the new packaged verifier contract is **8/8**.
That verifier inventories the exact seven chunks, withholds only
`repository-tools.js`, observes the real accessible loading→local-failure
transition without focus or modal theft, restores the identical SHA-256, uses
the physical **Try again** control, and requires a spinner-free cached revisit.
The final exact MCP build and off-screen original-pixel execution remain the
publication gate and are not claimed by this source checkpoint.

## 2026-07-27 — Funny-level sliders: superseded by the owner's own integration (Refs #83)

A parallel implementation of #83 was written on this branch and then
**discarded during the merge with `origin/main`**, because the repository owner
had independently implemented and pushed the same feature in `a550dc1ea8`
("Integrate safer pushes, encrypted payloads, and funny controls"). Their
version is the one that ships; `FunnyLevelControls`
(`app/src/ui/preferences/funny-level-controls.tsx`) and its 14-test suite were
deleted rather than merged, because two implementations of one settings control
is strictly worse than either alone.

The same happened to the #78 encryption work merged earlier from this branch:
`a550dc1ea8` deleted `app/src/lib/cheap-lfs/encrypted-payload.ts`,
`app/src/ui/repository-settings/cheap-lfs-encryption-gate.tsx` and their three
test files, replacing them with `payload-encryption-credentials.ts` and
`cheap-lfs-payload-password.tsx`. That deletion is the owner's call and stands.

What survived from this branch, because the owner's commits did not cover it:
the `decrypting` restore phase (#85), progressive lazy loading (#82), the
repository/tab group management merged in `a2ad99e218` (#81), the capture
fixture's `menu:` step, and the two CI test repairs below.

## 2026-07-27 — Observed user-initiated push/pull/fetch promises (locally verified, Refs #80)

Pressing **Push origin** could surface the generic "A background action stopped
unexpectedly" notice instead of the real failure. The toolbar handler started
`dispatcher.push(...)` and dropped the returned promise, so when the push
preflight's hosted-repository lookup 404s and
`repositoryWithCanonicalRemoteForNetwork` rejects, the renderer's global
`unhandledrejection` containment in `app/src/ui/index.tsx` — which is
deliberately generic so an arbitrary rejection cannot copy a credential onto
the screen — was the only thing left to report it.

The rejection was never double-reported by the store: `performFailableOperation`
catches a Git-level push failure, calls `emitError`, and **resolves**, so a
rejection escaping `_push` is by construction a failure nothing has presented.
The fix is therefore observe-**and**-report at the call site, not
observe-and-swallow. New helpers live in
`app/src/ui/lib/observed-operations.ts`; the toolbar push/force-push/pull/fetch,
the menu push and force push, the force-push confirmation dialog, and the
workflow-push-rejection retry now route their promise through
`observeUserInitiatedOperation`, while the previously `void`-ed provider triage
refresh is contained as a background diagnostic via
`containBackgroundOperation`. A failed canonical-remote preflight still runs no
Git command at all — `withCanonicalRemoteForNetwork` never invokes
`performPush` when the destination cannot be proven.

Local evidence: `app/test/unit/push-rejection-observation-test.tsx` passes
**17/17**, including a rendered `PushPullButton` click on a rejecting push
(asserted to post the real error once and leave nothing for Node's
`unhandledRejection`), and the same suite fails 2/17 when the observation is
reverted. Adjacent suites pass — provider triage and canonical-remote preflight
**52/52**, source-regex/style neighbours **100/100**, docs-hub catalog
**33/33**. `npx tsc --noEmit`, ESLint, and Prettier are all clean. Remote CI,
installer, and built-app screenshot evidence for #80 remain outstanding.

## 2026-07-27 — Historical encryption/network/tone checkpoint (superseded status)

The current local implementation covers three open issues. #78 provides
optional AES-256-GCM encryption for GitHub Release-backed Cheap LFS payloads:
the app asks once per operation unless the user explicitly opts into the
Windows credential vault, reads legacy pointer formats, restores plaintext
legacy payloads without prompting, and fails closed when authentication and
cleanup both fail. #80 observes asynchronous push, fetch, and pull actions and
shows an invalid canonical remote as a persistent yellow notification whose
**Change remote URL** action opens the repair surface. #83 restores separate,
persisted 1–5 funny-level sliders for English and Cantonese. #81 and #82 are
deliberately deferred to a later continuation.

Current local evidence is **194/194 focused tests** and **6768/6768 full tests
across 831 files**, with `tsc` and `yarn lint` clean. This checkpoint does not
claim packaged visual evidence or remote CI. #78, #80, and #83 remain open
pending screenshots captured from the real built application.

## 2026-07-27 — Historical TUI path browser and Cheap LFS Git wrapper (archived, non-blocking)

The Linux-first Textual edition now has a folder-only browser in its Open and
Create repository dialogs. Browse/Hide, Home, and Up remain reachable by mouse
and keyboard while the repository path stays a real editable field. Matching
outer single or double quotes are removed from pasted paths immediately where
the terminal exposes bracketed paste, with the same normalization at
submission. The input is treated only as a path: it is never evaluated by a
shell.

The literal `github` launcher now also provides bounded native-Git routing:

- `github push` and `github git push` force a native parseable dry-run, inspect
  the publication delta for Cheap LFS safety, and invoke the real native push
  only after that preflight passes.
- `github pull` and `github git pull` invoke native Git first, then materialize
  canonical Cheap LFS pointers only after exact size and SHA-256 verification.
- Other `github git <argv>` operations pass an argument vector directly to Git,
  without shell parsing. The wrapper does not stage, commit, rewrite history,
  upload payloads, or shadow the system `git` executable.

The README and installation guide include one-line Linux shell and Windows
PowerShell installs. Both install the `github`, `dmt`, and
`desktop-material-tui` launchers through uv and run `uv tool update-shell` so
uv's tool directory is added to future shell `PATH` values.

Current automated evidence is green:

| Gate | Result |
| --- | --- |
| full Windows-hosted TUI suite | **250 passed, 1 Linux-only skip in 182.76 s** |
| focused path normalization/browser/Pilot suite | **29 passed** |
| focused Cheap LFS Git-wrapper suite | **47 passed** |
| Ruff lint and format | clean |
| strict mypy, normal and explicit Linux platform | clean |
| package build | wheel and source distribution built successfully |

The final handoff accepted the source and package with one bounded visual gap.
A disposable Debian/Xvfb/xterm run launched the packaged TUI and captured the
real Open repository dialog. Its deterministic bare-remote fixture advanced
through `safe-push` and `pointer`; the consumer restored 23 bytes whose SHA-256
exactly matched both the pointer and cache object. The Windows uv tool install
puts all three `0.1.0` launchers in `C:\Users\cntow\.local\bin`, which was
already on `PATH`, and the Linux wheel smoke reported the same aliases. The
owned distro, displays, fixtures, and virtual environments were destroyed and
proved absent. Immediate bracketed-paste normalization, the expanded-tree
click path, narrow live resize, and Ctrl+Q exit remain automated rather than
accepted visual evidence, as recorded without inference in the
[run manifest](docs/verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
and
[cleanup ledger](docs/verification/linux-tui-path-browser-wrapper-2026-07-27/cleanup-ledger.md).

The preceding TUI compatibility correction commit `f555d374a6` is contained in
`origin/main`. In
[CI run `30317262582`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30317262582),
the Linux TUI Python matrix and Windows TUI core job passed, but the workflow
overall failed in the unrelated Windows x64 unit job. Installer
[run `30318769692`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30318769692)
failed and published no Release. Feature commit `62420efaf6` is integrated and
pushed through merge `f5f6f04c7e`, which remains an ancestor of current remote
`main`. For that exact merge, Pages run `30323259671` and Cheap LFS cloud run
`30323259650` passed; CI run `30323259648` and code-scanning run `30323259706`
were still running at handoff and are not claimed green.

## 2026-07-27 — Historical TUI compatibility correction (archived, non-blocking)

The first CI run for merged source `2abccae8fd` exposed two real portability
defects after the earlier local matrix:

- Git 2.54 on Ubuntu emits strict ISO UTC timestamps ending in `Z`. CPython
  3.10 rejects that suffix in `datetime.fromisoformat`, which caused nine
  direct Git/profile-history failures and two downstream TUI failures.
- Linux typeshed deliberately does not expose the Windows-only
  `msvcrt.locking` and `LK_*` members, so strict mypy rejected the statically
  imported Windows branch even though its runtime guard was correct.

The Git porcelain, reflog, and profile-history parsers now normalize only a
terminal uppercase `Z` to `+00:00`; numeric offsets and malformed-date
failure behavior remain unchanged. The Windows lock branch now imports
`msvcrt` dynamically as `Any`, matching the existing `fcntl` runtime boundary.
The installer workflow also skips TUI package work when `prepare` has already
marked an upstream failed-CI target as non-publishable. That prevents a newly
loaded workflow from assuming a historical pre-TUI target contains `tui/`,
while successful current-source release runs still require the wheel and
source distribution.

Local correction evidence is green: the isolated CPython 3.10.20 full suite
passed **193 tests** with one Windows-host Linux-PTY skip, the affected
post-format set passed **35/35**, Ruff lint/format passed, strict mypy passed
all 47 source files for both Linux and Windows platforms, 32 focused
persistence/CLI tests passed, and the release workflow safety suite passed
**8/8**. Packaged Windows E2E passed in
[job `90140843987`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30315770398/job/90140843987).
Correction commit `f555d374a6` is contained in `origin/main`.
[CI run `30317262582`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30317262582)
passed the Linux TUI Python matrix and Windows TUI core job, but the overall
workflow failed in the unrelated Windows x64 unit job. Installer
[run `30318769692`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30318769692)
failed and produced no Release. The earlier failed jobs that motivated the
correction were
[Python 3.10](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30315770398/job/90140843973),
[Python 3.12 mypy](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30315770398/job/90140843983),
and the
[historical-target TUI package job](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30315814320/job/90141026604).

## 2026-07-27 — Historical Linux-first interactive TUI preview (archived, non-blocking)

A new `tui/` Python project is a terminal-native sibling to the Windows-only
Electron application. Its Textual shell is designed for both mouse and keyboard
operation: repository/workspace tabs, buttons, lists, tables, checkboxes, and
selectors are clickable, while repository paths, URLs, commit messages,
provider bodies, API payloads, regex patterns, and sample text use real
`Input`/`TextArea` controls.

- Local Git covers repository open/create/clone, status/diff, file staging,
  commit/amend/sign-off, fetch/pull/push, history, branches, stashes, plus
  read-only tag/remote tools through argv-only bounded subprocess adapters.
- The GitHub pane uses an installed, non-prompting `gh` CLI for issues, pull
  requests, Actions, releases, packages, read-only Projects inventory, and a
  bounded REST/GraphQL explorer. It does not store a GitHub token.
- Shared literal/fuzzy/explicit-RE2 search enforces pattern, input, memory,
  match, capture, and zero-width iteration bounds. Settings and notification
  state use XDG paths, atomic TOML, SQLite WAL, and an isolated app-owned Git
  history.
- Linux packaging is a wheel plus source distribution. The additive Ubuntu CI
  job tests Python 3.10/3.12/3.13; Python 3.12 also checks Ruff, mypy, package
  contents, a fresh-wheel install, and the generated parity ledger.
- An additive Windows Server 2022/Python 3.12 lane checks the non-PTY unit,
  application, infrastructure, Cheap LFS, lint, and typed core. Linux PTY and
  mouse acceptance remain Linux-only and are not inferred from that lane.
- Cheap LFS reads and writes the canonical Windows Release-v1 pointer format
  across Linux and Windows, uses a 500 MiB limit for new writes while retaining
  2 GiB legacy reads, and verifies size/hash before restore with a local recovery
  cache. The TUI preview does not yet implement OCI/GHCR or cloud-provider
  writes, encryption, or automatic multi-file batching.
- `tui/contracts/parity.yaml` is generated from the existing 201-row desktop
  source of truth. Current mapping is 14 adapted, 53 partial, 132 not yet
  available, and 2 terminal-owned; unmapped work can never default to complete.
- Categorized docs under `docs/features/linux-tui/` cover installation,
  interaction, accessibility, XDG persistence, Git/GitHub, RE2, language,
  appearance, notifications, editor/history, security, failure modes, and
  verification.

Status: implementation commit `eee005c7f4`, integration merge `ba45dcfbaf`, and
verification commit `fcb86eca4d` are integrated and pushed through merge
`2abccae8fd`. Local evidence is complete:
193 Windows-hosted TUI/core tests passed with one Linux-only PTY skip, that PTY
test passed on real Debian, all 164 focused Windows Cheap LFS tests passed, the
wheel/sdist and fresh install were inspected, and a non-root remote Docker build
ran successfully. Five original Lowlevel/Xvfb screenshots prove mouse clicks,
editable Inputs/TextAreas, regex matches, bilingual narrow layout, and Cheap LFS
preview; every disposable process, display, filesystem root, Docker image, and
WSL distribution was removed and proven absent. Pages/wiki publication is live;
the first CI defects and locally verified correction are recorded immediately
above. Packaged Windows E2E is verified. The correction is contained in
`origin/main`, and its Linux TUI matrix and Windows TUI core jobs passed in run
`30317262582`; that workflow still failed in the unrelated Windows x64 unit
job, while installer run `30318769692` failed and published no Release. The
[run manifest](docs/verification/linux-tui-2026-07-27/run-manifest.md) records
the exact local evidence and hashes.

## 2026-07-27 — HISTORICAL SESSION HANDOFF (superseded; do not read as current)

`main` is at **`949dc81e6d`**, pushed, with **zero divergence** from the remote.
The working tree is clean; no stashes; every agent branch is merged and deleted
except the one still running (below).

### Verification state on this tree

| Gate | Result |
| --- | --- |
| `node script/test.mjs` | **6,508 tests / 808 files / 0 failures** |
| `node script/test.mjs script` | **163 pass / 0 fail / 2 skipped** |
| `npx tsc --noEmit` (root) | clean |
| `npx eslint --rulesdir ./eslint-rules` | clean |
| `npx prettier --check` (repo-wide) | clean |
| CI | **runs were still in flight at handoff time — not green, not claimed green** |

Nothing in this session was closed on a CI badge. Every closing comment says so
explicitly and commits to reopening rather than burying a later CI failure. If
CI on `96eeb54c17` or its ancestors reports a failure, that is real and the
affected issues should be reopened.

### Issues: 23 open → 6 open

**Closed with a real capture from a built app:** #22, #73 (tab overflow with its
search field, Regex builder and per-row customize control), #74 (repository
groups expanded and collapsed, count pill and accessible name visible), #70
(sync summary line).

**Closed as fixed, merged, pushed, locally verified:** #55, #56, #58, #59, #65,
#67, #69, #72. Each carries its own regression tests, and each was proven to
fail without its fix.

**Closed as shipped:** #63, #64, #71, #75.

**Still open, with the honest reason:**

| Issue | State |
| --- | --- |
| ~~**#35**~~ | **Closed.** Stream-hash shipped in `949dc81e6d`: OCI drops from 7 full payload reads to 3, with the registry authoritative for layer digests. The Release path was already single-pass from tranche 1 — 2 → 2, no saving, and that is stated rather than dressed up as a win. |
| **#66** | Fixed and pushed (registration now targets the update-stable Squirrel root, stale registrations detected and repaired). **Not closed** because no real re-registration was exercised — verifying the post-update repair needs an installed build carrying the change to be updated over. |
| **#68** | Fixed and pushed. **Not closed** because the private route deliberately ends at a `builder-unavailable` blocker: creating the public builder repo and writing its Actions secrets needs a token this feature never holds. Until that external setup exists, private-repo compression does not run at all — which is the safe outcome, not a silent fallback. |
| **#34** | Feature shipped and merged. Wants a framed capture of the branch picker. |
| **#23** | 79-capture campaign. Now unblocked — `script/capture-app.js` exists and works. |
| **#62** | **Blocked on the user.** All 21 desktop-plus features referenced anywhere in this tree are already implemented; no unadapted one could be found. Needs a name or screenshot of the feature believed missing. Upstream delta measured: 78 commits since fork point `d9080117b1`, versus 1,345 here (2,438 files, +902k lines). Do **not** bulk-merge upstream. |
| **#78** | **Blocked on the user.** Needs the scope decision: encrypt Cheap LFS payloads before upload (fits this app), or encrypt working-tree files in place (fights Git's diffing). |

### Things a successor should know

- **The Electron runtime was broken and is now fixed.** `node_modules/electron/dist/`
  held only a `locales` folder because the postinstall had downloaded
  `electron-v42.0.1-win32-x64.zip` (144 MB) into the cache on **July 12** and
  never extracted it. Every "blocked on a build host" note in earlier handoffs
  traced to this. Extracting the cached zip fixed it; `path.txt` now names
  `electron.exe`.
- **Captures have two paths and they are not interchangeable.**
  `script/capture-app.js` (CDP) drives interaction — it seeds repositories
  straight into the renderer's IndexedDB and opens tabs through the app's own
  IPC, so no app behaviour was changed to make capture possible. The Lowlevel
  MCP headless desktop launches and captures the real build off-screen, but
  **cannot drive Chromium**: posted input to `Chrome_RenderWidgetHostHWND` is
  ignored. Use the former for interaction scenes, the latter for launch-and-capture.
- **Screenshot counts are pinned in two places** — `app/test/unit/wiki-function-gallery-test.ts`
  and `app/test/unit/site-accessibility-test.ts`, the second cross-referencing
  the wiki manifest against `site/index.html` figures. Adding a PNG without
  updating the wiki row, the rendered image, the Pages figure and **both**
  counts turns one red test into a different red test. This broke CI twice.
- **New docs must be followed by `node script/generate-docs-hub-catalog.mjs`.**
  The staleness test caught this three times in one session.
- A junctioned submodule **breaks `git status` outright** in a worktree
  (`fatal: not a git repository`). Remove such junctions before any git command.
- `gh` resolves the default repo from remotes. After an `upstream` remote was
  added to measure the fork delta, a comment landed on `desktop/desktop` instead
  of this fork. It was deleted within the minute and `gh repo set-default` now
  pins `Ding-Ding-Projects/desktop-material`. Keep that pin.

### Open risk worth carrying forward

The racily-clean fix (#72) makes publishing pay one filesystem timestamp tick.
Measured: ordinary revalidation is unchanged (3.95 ms → 3.68 ms, still skipping
the re-hash, so #35's win survives), but `publishTextBatch` pays roughly
**17 ms × N** in its staging loop. Settling members in parallel is the obvious
follow-up if that shows up on a large batch.

## 2026-07-27 — Ignored files to a local submodule (local phase, on a branch)

Built on the isolated worktree branch `worktree-agent-a1c6b6311afbc2837`; not
merged and not pushed. It implements only the **local** half of the roadmap
entry: candidates come from `git status --porcelain=1 -z --untracked-files=all
--ignored=traditional` and each is proven by `git check-ignore -v -z --stdin`
run *without* `--no-index`, so a tracked path — including one force-added
against an ignore pattern — can never be proven ignored and can never be
selected. Eleven per-file rejection reasons and nine destination reasons are all
fail-closed. Every staged copy is verified by size and SHA-256 while the parent
repository is still strictly read-only; the first index mutation anywhere is the
new repository's own commit, and the single `git submodule add` follows it.
Originals are only ever read and are re-hashed at their exact original paths
afterwards. Independent recovery copies under
`<git-dir>/desktop-material/ignored-submodule-recovery/<run>/` are deleted only
after that final verification and are named in every failure.

Local evidence: **36/36** focused tests (9 pure planning, 22 against real
temporary Git repositories, 5 dialog), and **732/732** across the cheap-lfs,
submodule, repository-settings, collection-surface-registry,
search-surface-filters, and i18n suites (61 files). Root `npx tsc --noEmit` is
clean and `npx eslint --rulesdir ./eslint-rules` is clean on every touched file.
Two mutation checks confirm the safety tests are load-bearing: adding
`--no-index` to `check-ignore` fails exactly the two tracked-file tests, and
disabling the staged-copy hash comparison fails exactly the copy-proof abort
test.

Still open: merge to `main`, push, CI, and headless screenshot acceptance. The
publish phase — Release/OCI storage selection, Cheap LFS upload, pointer
conversion, provider repository creation, remote creation, and push — is
deliberately **not** built; the module imports none of that code and a source
test asserts it. Detail in
[docs/features/repository-management/ignored-files-to-local-submodule.md](docs/features/repository-management/ignored-files-to-local-submodule.md).

## 2026-07-27 — Session summary: fifteen pushes, and what is still open

Pushed to `main` through `821ab93d57`. Full local gate on that tree:
`node script/test.mjs` reports **6,508 tests across 808 files with 0
failures**, root `npx tsc --noEmit` is clean, `eslint` is clean, and
repository-wide `prettier --check` passes.

Shipped and pushed this session, each verified before its own push:

- **Latest-release reconcile** (`2e62c5a2a6`) — installed apps had stopped
  receiving updates. Promotion only crowned a release whose commit still
  equalled the tip of `main`, so any push landing mid-build stranded Latest
  permanently while Squirrel polled `releases/latest/download/`. Promotion is
  now a monotonic reconcile along `main`.
- **Racily-clean identity revalidation** (#72, `01d2ba31fd`) — a genuine
  fail-open found by CI, not by review. Same-size writes inside one filesystem
  timestamp tick produced identical `mtimeNs` *and* size, so `sameEntry`
  reported "unchanged" for different bytes and the deferred-hash path could
  accept stale content. Reproduced locally in **11 of 40 trials**. Observed
  tick steps here were 0.79–3.1 ms, not the 15.6 ms Windows default, so a
  hardcoded constant would have been wrong in the unsafe direction; the fix
  probes granularity per device behind a 2 s conservative bound.
- **Cheap LFS owned-artifact rule** (#65, `f7cb50b874`) — the app was pinning
  and uploading its own in-tree scratch files during a clone. The cause was
  commit-time selection, not a background scanner.
- **Post-commit payload restore** (#55), **UTF-8 byte budget for asset names**
  (#67 — long CJK files could not be pinned at all), **scratch-ODB worktree
  fingerprint** (#59), **append-guarded release uploads** (#56),
  **documentation-search worker** (#69), **tab-overflow search and
  customization route** (#73), **collapsible repository groups** (#74),
  **repository-list sync summary** (#70), the **complete feature list** (#64),
  the **tabbed documentation hub** (#63), and **README feature diagrams**.

Open, with the honest blocker recorded on each issue:

- **#66 Windows 11 context menu** — root-caused on this machine. The sparse
  package registers with `Path.dirname(process.execPath)` as its external
  location, which resolves to `app-<version>\` and therefore changes on every
  Squirrel update; the package keeps reporting `Status: Ok` while its location
  rots. Architecture mismatch and COM activation are ruled out. Fix in flight.
- **#22, #34, #73, #74 captures** — the Electron runtime was repaired this
  session (the postinstall had downloaded the 144 MB zip on July 12 and never
  extracted it), so single-repository captures now work and produced #70's
  evidence. Multi-tab scenes still need the reusable fixture filed as **#75**;
  three UI-driven routes were tried and all proved fragile. No substitute
  screenshot has been posted for any of them.
- **#35** — the deferred profiler findings are all fixed; stream-hash-on-upload
  ("cloud hash") remains.
- **#62** — a read-only survey is under way rather than a blind upstream merge.
- **#68, #71, #75** — in flight.

Two self-inflicted CI breaks were fixed in the same session: a screenshot added
without its wiki-manifest row, and then the same screenshot missing from the
Pages gallery, which is a second pinned count cross-referencing the first.

## 2026-07-27 — GitHub Pages renders Mermaid diagrams instead of their source (#71)

Ten ` ```mermaid ` fences — three in `docs/learn-more/unreachable-commits.md`,
five in `docs/readme-tabs/features.md`, two in
`docs/readme-tabs/complete-feature-list.md` — rendered as diagrams on
github.com and as raw fence source on the published site, because
`pandoc --from gfm` turns a Mermaid fence into `<pre class="mermaid">` and
`site/docs-template.html` loads no JavaScript at all.

- **Pre-rendered at build time, not in the reader's browser.** The new
  `site/render-mermaid.mjs` runs after pandoc and before the search index,
  finds each `<pre class="mermaid">`, renders it with `@mermaid-js/mermaid-cli`
  in a headless Chromium, and splices the SVG inline inside
  `<figure class="mermaid-figure">`. No CDN tag, no vendored runtime bundle, no
  second request; the site still loads zero external resources, asserted by the
  test against both the template and generated output.
- **Theme safety by construction.** Mermaid is handed a sentinel palette — one
  unique impossible colour per theme variable — and every sentinel in the
  returned SVG is replaced with a CSS custom property, defined inside the SVG
  for light with a `@media (prefers-color-scheme: dark)` override. All ten real
  diagrams now render with **zero** literal colours surviving the build's audit.
  Contrast is asserted numerically in both schemes (4.5:1 text, 3:1 graphics).
- **Accessibility.** Each SVG gets `role="img"`, `aria-labelledby`, and a
  `<title>` taken from the bold caption the author already wrote below the
  fence. The bilingual English / 廣東話 prose under every diagram is untouched
  and remains the real fallback.
- **Failure is loud; local builds still work.** A fence that will not render
  fails the build with the page, position, name, Mermaid error and source; the
  page is left unwritten and nothing is published. Without
  `--require-toolchain` a missing toolchain is only a warning and every fence
  is left exactly as pandoc emitted it, so a contributor needs no browser.
- **Legibility floor.** A diagram may scale down to 80% of its drawn size and
  then scrolls inside its own container, so the 1,557px-wide feature map no
  longer shrinks to 7px type in the 52rem column.

Local evidence: `node script/test.mjs script` passed 148/150 with 0 failures
and 2 environment-gated skips (pre-existing ARM64 cross-tools; the new
browser-gated end-to-end render, which passed when run with
`DESKTOP_MERMAID_TOOLCHAIN` set). The full Pages build was reproduced locally
with real pandoc 3.10 and a real headless Chromium 151: all ten diagrams
rendered, zero colour-audit warnings, and Chromium reported **0** non-`file:`
requests for the published pages in both colour schemes. `npx prettier --check`
passes on every touched non-Markdown file. Not yet verified against the
deployed Pages site.
## 2026-07-27 — Exact-90% restore, app-hosted browser, and private badge (pre-publication local receipt)

At this pre-publication checkpoint, three user-facing continuations were
locally accepted and integrated into local `main`. The source and captures were
later pushed through `2abccae8fd`, and Pages/wiki publication is now verified
live. Packaged Windows E2E is verified. At that checkpoint, a TUI compatibility
rerun and installer/Release evidence were still pending; the TUI item is now
historical and non-blocking under the Windows-only product boundary. Do not
attach an older installer badge to these changes.

**Cheap LFS restore scheduling and progress**

- `app/src/lib/cheap-lfs/operations.ts` gives one Release restore batch a FIFO
  coordinator capped at two active HTTP downloads. File-level and multipart
  look-ahead both use the same fixed threshold: 899/1000 stays single-lane and
  900/1000 may start the next file or part. A provider with no usable progress
  total opens the next lane only when the current transfer settles.
- The look-ahead changes download scheduling only. Ordered part
  decompression/verification, part and whole-file size/SHA-256 proofs,
  unchanged-pointer compare-and-replace, input-ordered results, cancellation
  draining, and owned-temp cleanup remain in the materialization path. The
  shared coordinator prevents nested file/part prefetch from exceeding two
  downloads.
- `app/src/lib/cheap-lfs/restore-progress.ts` defines the canonical UI model:
  repository/provider/phase, file totals, logical and actual downloaded bytes,
  rate/ETA/elapsed time, queued work, fixed threshold, bounded failures,
  cancel state, and separate current/look-ahead lane detail including file and
  multipart ordinals.
- `app/src/ui/lib/cheap-lfs-restore-progress.tsx` is reused by the Large files
  manager and batch-clone restore progress. It keeps exact visible counters,
  buckets screen-reader announcements to meaningful 10% transitions, removes
  active shimmer under reduced motion, and wraps narrow/bilingual content
  rather than clipping. Legacy sequential progress is adapted into the same
  contract.
- The combined local gate described below supersedes the earlier 42/42 and
  15/15 focused checkpoints.

**App-hosted browser**

- `app/src/lib/internal-browser.ts` owns strict HTTP(S) normalization,
  credential/query/fragment redaction, bounded bookmark persistence, the
  persisted internal/external setting, explicit default/authentication intent,
  serializable state, and runtime command/bounds validation.
- `app/src/main-process/internal-browser-window.ts` separates trusted local
  browser chrome from remote `WebContentsView` tabs. Remote content has Node
  and preload disabled, context isolation/sandbox/web security enabled,
  permissions and downloads denied, certificate errors refused, and no trusted
  Desktop Material IPC registration. Valid HTTP(S) redirects stay in place,
  `window.open` targets are captured into new tabs, app callbacks return to the
  app, and only the allowlisted `mailto:`, `tel:`, and `ms-settings:` schemes
  escape to Windows.
- `app/src/internal-browser/` supplies New tab, close/activate tabs, URL bar,
  Back/Forward, Refresh/Stop, Go, ordinary bookmarks, and **Open externally**.
  Authentication tabs show a SIGN IN chip, cannot be bookmarked, use one
  in-memory partition, clear its storage/cache after use, and expose
  **Continue in system browser**.
- `app/src/ui/preferences/advanced.tsx` persists the global choice. Main/menu
  routing uses that choice for browser-bound links while authentication intent
  remains explicit rather than inferred from URL text. Webpack produces a
  separate trusted browser-chrome bundle.
- The built browser passed the local redirect, popup, New tab, query-stripped
  bookmark, authentication-session, and external-escape receipt described
  below.

**Private-repository lock badge**

- `app/src/ui/repositories-list/repository-list-item.tsx` renders a separate
  filled Material lock only when provider metadata is exactly
  `isPrivate === true`. `false`, `null`, and missing GitHub metadata render no
  privacy claim.
- The lock remains visible beside a fork glyph or custom logo, is
  keyboard-focusable, exposes a localized tooltip, and contributes **Private
  repository** to the canonical row accessible name. Its fixed 22 px shape
  (20 px in compact density) does not widen or clip bilingual rows.
- The UI does not infer privacy from a URL, account, remote name, access
  failure, or local filesystem state.

**Local acceptance**

- The combined browser, Cheap LFS restore, IPC, localization, and
  private-badge test run passed **652/652 across 53 files**.
- The two deterministic verifier contract suites passed **14/14**.
- Full `tsc --noEmit` completed cleanly.
- The exact Windows production command completed with `returncode 0`,
  `timed_out false`, `client_ok true`, and no stderr. The resulting `out`
  directory includes the normal renderer/main assets and the
  `internal-browser` HTML, JavaScript, and CSS assets.
- The real built app ran on an isolated hidden Win32 desktop. Wide English and
  narrow bilingual restore receipts both proved the current lane at exactly
  **90%** and the already-running next lane at **10%**, with no clipping,
  overlap, or private data. The browser receipt proved same-tab redirect,
  popup capture into a new tab, New tab, query-stripped bookmark storage, and
  the explicit authentication escape without using a real account or
  credential. The private-repository badge receipt proved the separate lock in
  the real repository picker.

| Accepted local capture | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-restore-lookahead.png` | 1440×960 | 106,724 | `001e9d09e95cf81c981f4b97a33c2aab958a93fce8eca064a8d0cea9df1e3a96` |
| `docs/assets/screenshots/app-hosted-browser-authentication.png` | 1144×741 | 65,346 | `257960b35797e2f7e5f2a8e442c353e656d98af5ef4a088fe30113b641293f69` |
| `docs/assets/screenshots/private-repository-lock-badge.png` | 960×660 | 87,517 | `7cf7e27565bceb3d584c24752c2e066b29abdbcafe066b25250fa65d3284de9a` |

**Publication update**

The source and accepted captures are pushed through `2abccae8fd`, and
Pages/wiki publication and packaged Windows E2E are verified. At that
historical checkpoint, installer/Release evidence remained pending; the
separate TUI correction no longer defines or blocks the supported Windows
product. This pre-publication local receipt does not claim the missing
installer evidence.

Feature contracts:
[Release-backed Cheap LFS](docs/features/repository-management/release-backed-cheap-lfs.md),
[App-hosted browser](docs/features/integrations/app-hosted-browser.md), and
[Private-repository lock badge](docs/features/repository-management/private-repository-lock-badge.md).
## 2026-07-27 — Documentation search no longer compiles reader regex on the UI thread (#69)

`site/docs-search.html`, published as `/docs/search.html`, built and compiled
reader-supplied patterns with a bare `new RegExp(...)` on the page thread. A
catastrophically backtracking pattern such as `^(a+)+$` against a long
non-matching page hung the tab with no recovery. This was pre-existing debt, not
a regression from #63.

- **One evaluator, one deadline owner.** The hub's job runner moved out of
  `docs-hub.js` into `docs/assets/site/docs-regex-job.js`, and both published
  surfaces now use it: a fresh same-origin worker per request, a page-owned
  hard 750 ms timeout that calls `terminate()` before reporting failure, and a
  fail-closed path when `Worker` is unavailable. Neither page keeps a private
  copy of that logic any more.
- **Same worker, new bounded operation.** `docs-hub-regex-worker.js` gained a
  `pages` operation for the full-text corpus: at most 2,000 pages, 200,000
  characters per page, 12,000,000 characters in total, 500 counted matches per
  page and the requested excerpt cap per page. Only match *offsets* cross the
  structured-clone boundary; the page slices excerpts from text it already
  holds, so a pattern matching everywhere cannot amplify one reply.
- **Plain text is still the default and no longer uses regex at all.** Plain
  search is a bounded substring scan; match-case and whole-word are honoured
  with an explicit ASCII word-boundary check rather than a compiled `\b`.
  Regex stays an explicit opt-in, and query/pattern/options still round-trip
  through the address bar. The regex builder, its six snippets, excerpt
  highlighting, and the result and status copy are unchanged.
- **Regression guard extended.** `docs-hub-regex-worker-test.mjs` now asserts
  `doesNotMatch(/new RegExp\s*\(/)` against **both** `docs-hub.js` and
  `docs-search.html`, and requires each to reference the shared runner and the
  shared worker. The new `script/docs-search-page-test.mjs` drives the real
  page in jsdom against the real worker on a real thread.
- **Publication.** `/docs/search.html` and `/docs/index.html` sit at the same
  depth, so `assets/site/docs-hub-regex-worker.js` resolves identically from
  both; `pages.yml` now asserts the runner and worker ship next to
  `search.html` and that the page references them. The site still loads zero
  external resources.

Local evidence: `node script/test.mjs script` passed 121/122 with 1 pre-existing
skip and 0 failures, including 12 new worker/controller assertions and the new
12-test `docs-search-page-test.mjs`, whose adversarial case measured `^(a+)+$`
against a 20,000-character non-matching page terminating at ~815 ms wall clock
(deadline 750 ms) with the page still answering a plain-text search afterwards.
`npx prettier --check` passes on every touched non-Markdown file. No TypeScript
was touched. Not yet verified in a real browser against the deployed Pages site.

## 2026-07-27 — Tabbed GitHub Pages hub with a site-wide search dock (#63)

The published documentation hub (`docs/index.html`) is no longer one long
scroll. Six top-level tabs — Overview, Install, Features, Reference, Search and
Project links — each open a panel of their own, and Features and Reference carry
generated sub-tabs so a category or a documentation folder is a page rather than
a section to scroll past.

- **Routing.** Every tab is a route and every route is the id of the panel it
  opens, so `#features/design-system` and `#reference/technical` are shareable
  addresses and Back returns to the previous tab. Unknown sub-routes fall back
  to their parent tab; anything else falls back to Overview.
- **No-JavaScript behaviour is a first-class case.** The committed markup hides
  nothing and claims no ARIA tab state; `docs-hub.js` adds the tablist roles,
  the roving tab stop, `aria-controls`, arrow/Home/End movement and the `hidden`
  attributes at runtime. Without scripting the same file is one complete,
  readable document whose tabs are ordinary in-page anchors.
- **Search on every page.** The search box, the plain-text/regex switch, the
  regex builder and the results moved into a dock above the panels, so they are
  present on every tab. Plain text stays the default; regex remains an explicit
  opt-in and still runs only in the existing fresh same-origin worker under the
  page-owned 750 ms termination deadline. No new `RegExp` evaluation path was
  added.
- **Every documented feature is on the site.** `yarn generate-docs-hub-catalog`
  now also refreshes four managed blocks in `docs/index.html` from the same
  records the search catalog uses: 8 feature categories (78 feature pages) and
  10 reference sections (84 pages), 162 generated document links in total.
  Nothing is hand-maintained, and a drifted page fails `yarn test:script`.
- **Appearance.** Density (comfortable/compact) and accent seed
  (violet/teal/amber/rose) join theme, language mode and the two playfulness
  sliders; all six persist in `localStorage` and apply before first paint.
  Compact removes whitespace only — no control loses its hit target.
- Issue #64's comparison list is linked at `readme-tabs/features.html` rather
  than copied, so that page stays the single source for it.

Local evidence: `node script/test.mjs script` passed 104/105 with 1 pre-existing
skip and 0 failures, including the new `script/docs-hub-page-test.mjs` (14/14 —
tab state, deep links, arrow-key movement, no-JS readability, plain-text default
versus regex opt-in, builder⇄search synchronisation, the empty state, a real
`^(a+)+$` termination measured at ~750 ms through the real worker on a real
thread, and appearance persistence) and the extended
`script/generate-docs-hub-catalog-test.mjs` (22/22, including a coverage
assertion that every feature page is linked from the hub and a staleness
assertion for the committed page). `npx prettier --check` passes on every
touched file. Rendered checks in a real browser at 375×812, dark, bilingual,
compact: no horizontal page overflow on any tab, no overflowing element outside
the pre-existing `overflow-x: auto` code blocks, tab targets 48 px tall, and
text contrast between 7.2:1 and 13.2:1 for tab, sub-tab, body, note and link
roles. The Pages workflow is unchanged and its `docs-hub-catalog.js` assertion
still holds.

## 2026-07-26 — Dedicated Cheap LFS tab in Repository Settings

The Cheap LFS preferences moved out of the combined "Build, run & large
files" tab into their own **Cheap LFS** tab in the Repository Settings
dialog, inserted immediately after **Build & run** (enum value = TabBar
position invariant preserved; the conditional ForkSettings tab stays last).

- New `app/src/ui/repository-settings/cheap-lfs-settings.tsx` renders the
  storage-provider selector, auto-materialize / auto-pin / parallel-upload
  toggles, and the cloud-compression consent, moved verbatim from
  `build-run-settings.tsx`. The preference plumbing is unchanged: both tabs
  edit the same `IBuildRunPreferences` working copy through the same
  `onBuildRunPreferencesChanged` callback and the existing Save flow.
- Deep links rerouted to the new tab: the `palette:cheap-lfs-settings`
  command (`app.tsx`) and **Open Cheap LFS settings** in the Large files
  manager (`repository-tools/cheap-lfs.tsx`). All other
  `RepositorySettingsTab` callers keep their original intent.
- Localization: `repositorySettings.cheapLfsTab` added ("Cheap LFS" /
  "Cheap LFS 大檔案"), `repositorySettings.buildRunTab` renamed back to
  "Build & run" / "建置同執行", and `cheapLfs.settings.location` now points
  at the new tab. Settings search indexes only Preferences tabs, so no
  search-catalog change was needed.
- The responsive surface catalog gained the `repository-settings.CheapLfs`
  surface (metadata count 91 → 92 pinned in
  `responsive-surface-catalog-test.ts`).

Verification: `build-run-cheap-lfs-settings-test.tsx` now exercises the new
component plus new tab-wiring/i18n/negative cases; with `cheap-lfs-test.tsx`
and `responsive-surface-catalog-test.ts` the three files pass 43/43, and the
nine adjacent suites (repository-settings management/appearance, settings
search/surfaces, build-run opencode/auto-pull, i18n, tab-session style,
command-palette catalog) pass 80/80. `npx tsc --noEmit` is clean. Feature
docs, the User Guide, and this handoff were updated to the new path
**Repository settings → Cheap LFS**.

## 2026-07-26 — Add Submodule dialog searchable branch picker (issue #34)

The Add Submodule dialog's URL route now lists the remote's branches instead
of relying on free-text alone. A "Load branches" action beside the URL field
(also fired automatically on first blur with a valid URL) runs
`git ls-remote --symref -- <url> HEAD refs/heads/*` — `--heads` alone was
verified to suppress the HEAD symref line, so the ref patterns are explicit —
through the new pure parser in `app/src/lib/git/ls-remote-heads.ts` and the
spawning helper `listSubmoduleSourceBranches` in `app/src/lib/git/submodule.ts`
(source revalidated before spawn, remote-operation env, credential trampoline,
AbortSignal process kill, 5,000-branch cap with truncation reported, malformed
lines skipped, empty repo yields an empty listing).

The loaded list renders as the registered standalone search surface
`add-submodule-branches` (literal IDs in JSX for the static audit): a
`type="search"` input plus `FilterModeControl` on the shared
fuzzy/substring/RE2 `matchGroup` stack with the invalid-regex `role="alert"`
contract, then a select whose pre-selected first option is the visibly marked
remote default. Picking writes the free-text branch field, typing free text
deselects the list, and the remote-default option maps to an empty branch
argument (no `-b`), preserving the existing `addSubmodule` call contract and
Create remote behavior. All new copy is keyed in English and Cantonese
(`submodule.addLoadBranches*`/`addBranch*` keys); loading is announced through
a polite live region and failures are inline and non-blocking.

Verification (local, this worktree): `collection-surface-registry-test.ts`
4/4, `search-surface-filters-test.ts` 15/15, new `ls-remote-heads-test.ts`
6/6, `ui/add-submodule-dialog-test.tsx` 16/16 (5 new picker tests), the eight
existing submodule suites 55/55, `i18n-test.ts` 20/20, and root
`npx tsc --noEmit` clean. Feature doc updated in
`docs/features/repository-management/submodule-subtree-and-remote-creation.md`.
Refs #34; remote CI has not run on this branch yet.

## 2026-07-26 — Unit-test repair after the remote-automation hardening

The `f8eca3ac84` hardening moved scheduled commit/push, pull preview, and
commit-batch flows onto `repositoryWithCanonicalRemoteForNetwork` before
network I/O but did not update the test suite, so the Windows x64 unit job
failed in CI (and in the dependent Express/Super Express release runs).
Commit `6d6bda8a79` repairs the suite without touching the hardened runtime
behavior:

- Structural-store tests (`Object.create(AppStore.prototype)`) that mocked
  `repositoryWithRefreshedGitHubRepository` or `withRefreshedGitHubRepository`
  now stub the canonical-remote seam instead: the scheduled-automation
  repository-switch tests mock `repositoryWithCanonicalRemoteForNetwork`, the
  pull-preview suite's `setRefreshedRepositoryWrapper` also stubs
  `withCanonicalRemoteForNetwork`, and the Cheap LFS unborn-root checkpoint
  test passes the repository straight through the new seam.
- Source-guard regexes were re-pinned to the hardened call shapes:
  `isBackgroundTask` threading in the split-push/legacy-flush and scheduled
  `_commitIncludedChanges` calls, `maybeAutoMaterializeCheapLfs(
  refreshedRepository, …)` on repository open, the multiline
  `performScheduledPush(repository, null, isBackgroundTask)` probe, and the
  regex-mode branch that moved into the extracted `diff-search-matcher.ts`.
  The organization-account wiring test now also asserts the canonical
  resolver delegates to `repositoryWithRefreshedGitHubRepository(
  latestRepository, true, false, true)`, keeping the account-routing chain
  guarded end to end.
- The GitHub Packages explorer search inputs and `FilterModeControl`s now
  carry the literal surface IDs (`github-packages-search`,
  `github-package-versions-search`) the collection-surface audit requires;
  JSX const references are invisible to that static audit.

Verification: the seven previously failing files pass 54/54 locally, and the
full unit suite reports 793/793 files with 6306 tests — the only local
failure is `get-shell-env-test.ts (pwsh)`, which fails identically on clean
`f8eca3ac84` and is a pre-existing local-shell environment issue, not a
regression. Remote CI on the push is tracked from the run list; no remote
success is inferred before it lands.

## 2026-07-26 — Remote repair, unattended Git, and distribution surfaces

- Before Git network work, Desktop Material now resolves the exact matched
  GitHub default remote and repairs its URL after a repository rename or
  transfer. The repair preserves SSH versus HTTP(S), requires the same exact
  web origin, refuses stale/unsafe candidates, and does not assume `origin`.
  An explicit `pushurl` moves only when it exactly equals the old fetch URL;
  deliberately divergent write/deployment targets and unrelated remotes remain
  untouched. Background checks are bounded and retry failed config mutations;
  explicit network actions revalidate immediately.
- Scheduled commit/push and pull are non-interactive. They use only already
  available account/vault credentials, skip repository hooks, disable
  commit/merge signing, suppress GitHub/generic/GCM/SSH prompts, and run
  post-push SSH deployment with batch mode and AskPass disabled. Failure is
  reported through non-blocking notification state. Manual operations remain
  interactive and retain the user's normal hook and signing behavior.
- App-managed Cheap LFS Release buckets now carry an exact body sentinel and
  are hidden from the ordinary Releases catalog by default. A user can reveal
  them without mutating or deleting their releases/assets; legacy prerelease
  buckets remain recognizable from valid Cheap LFS asset provenance.
- The repository Distribution surface now includes a GitHub Packages explorer
  for bounded, exact-repository-associated package/version metadata across the
  supported GitHub ecosystems. Its narrow native file-transfer path publishes
  app-owned GHCR OCI artifacts with unique tags and reports immutable digests;
  download accepts only an exact digest, verifies app artifact type, repository
  provenance, safe filename, size, and SHA-256, and never overwrites a file.
- Actions artifacts now support the same bounded search modes and safe regex
  feedback as the other catalog surfaces. Actions cache download is explicitly
  unavailable because GitHub exposes supported cache list/delete APIs but no
  supported cache-archive download API; downloadable output remains a workflow
  artifact operation.
- The ignored-files-to-local-Cheap-LFS-submodule workflow remains **planned,
  not implemented**. Any future implementation must leave the ignored originals
  byte-for-byte at their exact original parent-repository paths, retain recovery
  copies until final verification, and must not replace originals with links or
  silently upload/create a remote/push.

Final-tree local evidence: canonical `yarn lint` and root TypeScript `--noEmit`
passed; the final cross-feature regression matrix passed **104/104** across
seven files; and `yarn test:script` passed **84/84** across twelve files,
including x64/ARM64 shell-extension and documentation-catalog checks. The exact
Lowlevel-MCP-routed unpackaged production build passed in **287.9 seconds**.
The fresh off-screen Win32 build then completed the dark-English regex-builder
scene at `1280 x 800`; its adversarial safe-RE2 near miss completed in **16 ms**.
The accepted capture is `docs/assets/screenshots/regex-builder.png` (SHA-256
`BEFBFA90491120195884F7424AAB551B81CB3174068077E466A8020C335A28B1`). A
separate issue-#39 capture proves the one-ahead fixture renders **Push origin**
rather than **Publish branch** (SHA-256
`568C2B927F555586CDBFA62BD1AC79B6E4A7C8B7CC17D4F98178CCF6441D4AC6`).
Remote CI and publication are pending until this commit is pushed; no remote
success is inferred from the local receipts.

Remaining audit risks: automatic Cheap LFS OCI materialization still invokes
the external Docker credential helper without a direct unattended/no-window
proof. Also, direct Cheap LFS remote operations in publication-state reads,
first-publish anchor pushes, and workflow-commit pushes still need either the
canonical-remote preflight or explicit stale-URL coverage. Treat both as open
until verified or repaired.

Product follow-up requested by the user: **every cancellation action must use a
slide-to-confirm interaction**. This is a handoff requirement only in the
current push; the existing cancellation controls have not yet been migrated or
claimed as verified. The eventual control must remain keyboard- and
screen-reader-operable, expose clear pending/confirmed/canceled states, respect
reduced motion, and avoid turning ordinary non-cancellation navigation into a
confirmation gate.

## 2026-07-26 — Pull-and-bug-hunt reliability pass

Fast-forwarded clean `main` from `a6d5841b05` to `78dc8d0bc5`, scanned every
open issue and three touched repositories, then split the bug hunt across Git,
renderer/security, static Pages, and native Windows packaging. The resulting
repair set is deliberately broader than issue #39 because adversarial review
found additional release-blocking defects in the first implementations:

- A branch with an exact `origin/<branch>` publication ref but no `branch.*`
  config now reconstructs ahead/behind after either remote or status refresh;
  the follow-up status read can no longer erase the fallback. The branch stays
  untracked so the next real push still writes `--set-upstream`. This resolves
  the restart and same-session form of #39 without trusting a same-name ref on
  another remote.
- Quick Commit & Push follows the configured tracking remote and refuses a
  slash-containing tracking label when more than one remote can parse it. A
  missing or ambiguous upstream never redirects a completed commit to `origin`.
- The Explorer DLL resolves `GitHubDesktop.exe` from the sparse package's real
  parent layout, validates the owned directory and file, builds with the target
  x64/ARM64 MSVC lane, validates the PE machine before manifest generation, and
  removes stale generated output even when that target toolchain is absent.
- Every app-owned user regex now goes through RE2JS. Pattern, input, aggregate,
  match, capture-preview, and capture-group/match-work budgets compose instead
  of multiplying. Diff search keeps large literal lines searchable, caps one
  operation at 5,000 navigable highlights, and announces truncation. Size-limit
  list filters fail closed; Actions exposes the evaluation error. Capture
  previews retain only 24 bounded first-match entries. Tester rows retain
  per-candidate anchor semantics, status errors no longer overflow or announce
  three times, and both builder tablists use roving keyboard focus with live
  `aria-controls` targets.
- Notification rules preserve meaningful boundary spaces and old
  JavaScript-only patterns remain visibly disarmed until edited into safe RE2;
  invalid list-search patterns are announced, and duplicate imported rule IDs
  are repaired before toggle/remove actions can alias two rules.
  The Pages hub retains ECMAScript compatibility in a fresh same-origin worker,
  enforces a hard 750 ms termination deadline, and bounds match/capture data
  before the structured-clone boundary.

Local evidence so far: root TypeScript no-emit passed; canonical `yarn lint`
passed; the changed renderer/real-Git matrix passed 179/179; the tightened RE2
stress rerun passed 14/14 and reduced the 500-group case from roughly 875 ms to
roughly 100 ms; the Pages worker/controller passed 9/9 including real hard
termination and capture amplification; and the script gate passed all 83
non-catalog tests, including real x64 DLL activation and ARM64 cross-compilation.
Its one catalog assertion correctly reported the two new verification pages as
unindexed before regeneration. The final production build, off-screen Win32 UI
capture, regenerated catalog/full gates, and remote receipts are recorded below
in this section before publication; do not infer remote success from this local
implementation paragraph alone.

## 2026-07-26 — Multi-account token-invalidation fix re-verified; worktree sweep

A reported bug — `AppStore.onTokenInvalidated` resolving the affected account by
endpoint position, so a second same-host account's invalidated token signed
nobody out — was investigated and found **already fixed and on `main`**.
Commit `3e692befb2` ("Sign out the account whose token actually failed") is an
ancestor of `origin/main`: `getAccountForEndpointAndToken`
([api.ts:5975](app/src/lib/api.ts:5975)) matches endpoint **plus** the exact
token the failing request used, and `onTokenInvalidated`
([app-store.ts:2013](app/src/lib/stores/app-store.ts:2013)) uses it, so exactly
the affected account is signed out and other accounts on the host stay signed
in. A token no signed-in account holds signs nobody out and logs a warning.
Coverage already exists at
[accounts-store-test.ts:186](app/test/unit/accounts-store-test.ts:186) — five
tests including the two-dotcom-accounts / second-token case, the first-account
case, the unheld-token case, and same-token-different-endpoint. Re-verified this
session: `node script/test.mjs app/test/unit/accounts-store-test.ts` with
`TEMP=C:\dm-temp` → **21/21 pass, 0 fail**. No source change was needed, so
nothing new was written to `app/`.

Worktree/branch sweep completed in the same pass. `git worktree list` now shows
only the main checkout; branch `claude/determined-heyrovsky-eca6d2` was merged
(identical tip `12d3ed4600`) and deleted; no stashes exist. 43 stale directories
under `.claude/worktrees/` were left behind by earlier sessions. Before deleting
anything, every file in the two non-empty ones was hashed and checked against
git's object store: `agent-a55be6fd4ca9e9180` — 103/103 blobs already known;
`material-design-ui-audit-763c44` — 3572/3576 known, and the four outliers were
two test files byte-identical to `main` (CRLF-vs-LF hashing artifact) and the
two `icon-logo.icon/icon.json` assets, which are **semantically equal** to
`main` and differ only by a stray reformatting. Conclusion: no unique,
uncommitted, or unpushed work in either. All 74 `node_modules` junctions were
deleted as links (never followed) and the real `node_modules` trees were
verified intact afterwards, then all 42 removable directories were deleted —
including `agent-a55be6fd4ca9e9180` (206M) and `material-design-ui-audit-763c44`
(629M, whose `WORKTREE-IN-USE.md` marker was a stale 2026-07-20 note whose
branch no longer exists). Roughly 835M reclaimed.

NEXT AGENT: nothing is pending here. One empty directory,
`.claude/worktrees/determined-heyrovsky-eca6d2`, could not be unlinked only
because it is the running session's shell cwd; it holds no files, is not a
registered worktree, and disappears when that session exits.

## 2026-07-26 — Windows 11 context menu LIVE; packaging gap fixed

The packaged handler is registered and verified on this host
(`DesktopMaterial.ShellExtension_1.0.0.0_x64__6yspk5eyn48ge`, from the CI-built
`v3.6.3-beta3-zadttgmugx` payload). No security setting was changed — Developer
Mode was already enabled. Verified: manifest wires `Directory` +
`Directory\Background` to the compiled class; `DllGetClassObject` S_OK; root
command `ECS_ENABLED` (app-beside-DLL check passes); right-clicking a folder in
Explorer opens the Win11 modern menu (PopupHost windows on demand) — exercised
on an off-screen desktop via Lowlevel MCP, where DWM does not compose XAML
popups, so the one outstanding capture is an interactive-session screenshot of
the open menu (registration + activation + menu-opens are proven; the entry
rendering inside it is not pixel-proven yet).

Found and fixed in the same pass: packaged builds ship `shell-extension/` under
`resources\app`, but registration needs it beside `GitHubDesktop.exe` — no
shipped build could register at all. Registration now self-heals by copying the
shipped folder into place (`decideShellExtensionPackageSource`, three new
tests), and the settings pane counts either location as package-present. Gates:
both tsc projects, 110/110 extension tests, `yarn test:script` 68/68, prettier
clean. NEXT AGENT: an interactive-session screenshot of the top-level menu
entry (right-click any folder on the real desktop) completes the evidence; the
registered package on this host already serves it.

## 2026-07-26 — Integration cycle complete: CI verified green, two releases shipped

Remote `main` = `6d3b2f0834`; CI run
[30192722432](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30192722432)
on `b7146213fd` is **fully green** (Lint, Windows x64/arm64, E2E smoke, script
tests). Everything below in this file dated 2026-07-26 is now merged, pushed,
and CI-verified; issues #40 #41 #42 #43 #45 closed on that run. Releases
`v3.6.3-beta3-zadtsszkum` (target `7608c04200`) and `v3.6.3-beta3-zadttgmugx`
(target `b7146213fd`, the green tip) were published manually from the lanes'
own verified artifacts because the Actions token currently cannot create ANY
release (fallback run proved prerelease creation 403s too — **#44, needs an
org admin**: the change window is 2026-07-25T20:55Z → 2026-07-26T02:50Z; tag
pushes still work, repo rulesets empty, workflow grants unchanged).

Local push gate, now mandatory and memory-recorded: app tsc **and**
`yarn tsc -P script/tsconfig.json`, `node script/test.mjs` (all-batch fail-0 +
accounting), `TEMP=C:/dm-temp yarn test:script`, `yarn lint`, and
`yarn generate-docs-hub-catalog` whenever docs pages change (the staleness
guard fails CI otherwise — it caught three un-catalogued docs on its first CI
pass). The compression-workflow caller is pinned to a Prettier fixed point
(byte-equality test vs the rendered template) after an automation reflow broke
main's lint; CodeQL is pinned to `javascript-typescript` after the COM stub
woke the cpp autobuilder.

Open user-action items: promote `v3.6.3-beta3-zadttgmugx` to Latest
(`gh release edit v3.6.3-beta3-zadttgmugx --repo
Ding-Ding-Projects/desktop-material --latest`); investigate #44 in org
settings; restore `read:project`/`project` token scopes for board updates.
Open work: #22 closing capture, #23 screenshot tranche, #25 decision, #34
submodule branch picker, #35 perf tranche 2, #39 publish-label remote read.

## 2026-07-26 — Windows Explorer context menu + quick-action window

Branch `feat/windows-context-menu` (worktree), three commits, **not yet merged
or pushed**: `48e1f02b45` (classic verbs), `807a6f5267` (quick-action window +
packaged Windows 11 handler), plus an unrelated pre-existing prettier fix to
`.github/workflows/cheap-lfs-cloud-compression.yml` that was blocking
`yarn lint`.

Shipped: per-user (`HKCU`-only, never elevated) Explorer verbs on folders and
folder backgrounds — "Open with OpenCode here" and "Open in Desktop Material";
a small always-on-top MD3 quick-action window (own webpack entry
`quick-action`) doing status → commit → push for one folder; and a real
`IExplorerCommand` COM server in a sparse MSIX for top-level Windows 11
placement. Settings → Integrations reports which implementation is actually
serving the menu. Full detail:
`docs/features/integrations/windows-explorer-context-menu.md`.

**Verified**: tsc clean; `yarn lint` green; targeted suites green (151 tests
across the three new files plus the ipc/i18n/settings-search/settings-surfaces
contract tests). The COM DLL compiles with MSVC and exports
`DllGetClassObject`/`DllCanUnloadNow` undecorated; the generated manifest passes
real MSIX schema validation via `makeappx pack` — which is what caught the
X.500 quoted-publisher and bare-GUID requirements, and that `Directory` item
types come from the **desktop5** schema, not desktop4.

**Bug found and fixed by actually launching the app**, not by tests:
`handleCommandLineArguments` runs at module scope *before* `app.on('ready')`,
so the quick-action branch tried to create a `BrowserWindow` too early and died
as an unhandled rejection. Now guarded on `app.isReady()`; the initial command
line is handled from the `ready` handler and that branch serves
`second-instance` only.

**NOT verified, needs a human or a differently-configured host**:
live `Add-AppxPackage -Register` and the resulting top-level menu entry — it
needs sideloading enabled in Windows Settings, which is a system security
setting the agent will not change. No certificate is ever installed by design
(trusting a self-signed cert is a machine-wide change); the classic verbs are
the documented automatic fallback. A cold-open millisecond figure from a
packaged build is also still outstanding — the instrumentation is in and logs
`Quick action window interactive in <n>ms`; the dev bundle is 11.4 MB vs the
main renderer's 25.8 MB, which is a size proxy, not a timing.

## 2026-07-25 HISTORICAL SESSION HANDOFF — superseded / 舊交接紀錄

Seven cycles pushed today (tips: `f9e07c9c42` → `72876526d4` → `7c588cb224` →
`a49757e881` → `51fcf503f4`/`645657f470`/`be5784f7da` → `ee591a3278` →
`896497dba0`/`4698458a84` → `a71cbd4a74` → `7921cceb97`), each gated on tsc +
lint + the accounted full suite and receipted in Discussions (#37 and the
rolling thread #3). **Test-releases-only mode is ON**: both lanes publish
prereleases (`--prerelease`), the promote step skips prereleases cleanly, and
`releases/latest` stays frozen at `zadtorqoxa` so installed apps do not
auto-roll; revert the two `--prerelease` flags to resume production releases.
Latest green prerelease: `v3.6.3-beta3-zadtqgahmd` (all fixes below).

**Cheap LFS 200k end-to-end (issues #24/#38), state after round 3** on the test
repo `bambustudio-deps-cheaplfs-test` (local `f3a768470` "pin 10 large deps",
3 pointer files committed, 7 files pending; remote has `main @ 611b665e9` and
three one-asset prereleases — verified read-only):
verified WORKING live — first-publish bootstrap (branch published to an empty
remote through a stock LFS pre-push hook), hook stdin spool + `--no-verify`
anchor, per-file failure reasons, 600k path ceiling (212k paths; scoped scan
3.5s vs 161s), loud aborts; EBUSY never recurred.
**ONE OPEN DEFECT** (the only #38 remainder): GitHub's releases API returns
`[]` for a commit-less repository, so the pre-commit release review cannot see
pre-existing releases; the anchor push then un-hides them mid-flight and the
review-fingerprint guard correctly aborts the in-flight uploads ("The reviewed
release, asset, repository, or account changed."). **FIX IMPLEMENTED, NOT YET
PUSHED OR RE-VERIFIED LIVE** — see "Anchor before the release review" below;
it is committed only on branch `fix/bootstrap-before-review` in a linked
worktree and still needs a merge, a push, and a fourth headless E2E pass.
Then re-run the E2E pass 2 (app is parked headless at "Commit 7 files to
main", desktop `CheapLfsRun3`, CDP 9223) and close #38/#24 on captures.

**Environment lessons that cost real time** (also in agent memory): MSIX Temp
virtualization on this host diverges the container `%TEMP%` from real Temp —
junction fixtures then fail `realpath` with ENOENT; run gates with
`TEMP/TMP=C:\dm-temp`. The Lowlevel MCP server sees REAL paths (container
`%LOCALAPPDATA%` = `...\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local`).
Headless app driving that works: extract the portable release zip, launch via
Lowlevel MCP `launch_on_headless_desktop` with `--remote-debugging-port`, and
drive by CDP DOM clicks (scripts under the session scratchpad `run2`/`run3`;
omit the `Origin` header against Chrome 148). A gate is green ONLY if every
batch's `ℹ fail` line is 0 AND the exit code is 0 — never trust the tail.
Worktree junctions must use full Windows paths; worktree `build:prod` needs the
gemoji/choosealicense/gitignore submodule content.

**Open issues:** #22 (tab overflow — fixed + released, needs a live capture to
close), #23 (screenshots: 36/77 regenerated, tranche 2 pending), #24/#38 (above),
#25 (needs the user's A/B/C decision on six external-UI screenshots), #34
(submodule branch picker feature), #35 (Cheap LFS perf tranche 2 / stream-hash
uploads). The stale July-1 `GitHubDesktopSetup-x64.exe` should be deleted by
the user (Squirrel `--install` performs no version comparison; guard shipped
but cannot stop a re-run installer).

## 2026-07-25 Repository list bulk actions

Branch `feat/repo-list-bulk-actions` (worktree only; **not merged, not
pushed** — push was explicitly out of scope for this task).

- **Selection state machine** —
  `app/src/ui/repositories-list/repository-bulk-selection.ts` is pure and
  React-free: enter/exit, per-row toggle, filter-aware select-all, prune, and
  the all/some-visible predicates. Select-all only ever adds or removes the ids
  the caller says are visible, so a selection made under one filter survives the
  next filter. Escape and Clear both call `exitBulkSelection`, which leaves the
  mode and empties the set; `clearBulkSelection` (used after a bulk removal)
  empties it but stays in the mode.
- **Visible rows** — `SectionFilterList` never exposed its filtered rows, and
  they cannot be recomputed by a consumer because the match mode, case
  sensitivity, and chip filters are private state. A new optional
  `onVisibleItemsChanged` prop publishes the exact visible items on mount and
  whenever the visible id list changes; the id-equality guard is what stops the
  parent's `setState` from looping. Pinned and Recent repeat a repository, so
  the picker dedupes by id. Cloning and submodule rows are never selectable
  (temporary ids; a submodule cannot be removed from the list at all).
- **Bulk runner** — `app/src/lib/automation/bulk-repository-runner.ts` is a
  sequential, determinate runner. `isCancelled` is consulted only *between*
  items, so the in-flight repository always finishes and the rest are reported
  `cancelled`/"Not started" rather than dropped. Every detail and thrown error
  passes through `sanitizeBulkFailureReason`: Windows/UNC/POSIX absolute paths
  → `<path>`, URL credentials and `gh*_`/`github_pat_` tokens → `<redacted>`,
  whitespace collapsed, elided at 200 chars. The Windows drive-letter pattern
  carries a leading non-alphanumeric guard so it cannot eat a URL scheme.
- **Reviewed pull/fetch is not bypassed** — each selected repository is
  submitted as its own single-repository `dispatcher.syncRepositories` call, so
  `_syncRepositories` revalidates the id against the live persisted inventory
  and `performPullAllRepository` applies its unchanged per-repository review
  (missing repo, no remote, detached/unborn tip, no upstream, network op in
  flight). A row that fails or is skipped does not stop the batch.
- **Removal safety** — bulk removal is confirmation gated in a
  `role="alertdialog"` that names every affected repository and states nothing
  on disk is deleted. The path always calls `removeRepository(repository,
  false)` and has no access to `forceRemoveRepository` or the trash route; the
  collection-surface contract test asserts both the presence of the `false`
  call and the absence of the destructive ones.
- **Registry** — new `repositories-list` entry in `BulkActionSurfaceRegistry`
  (the existing `repositories` entry still points at the Sync dialog). The
  pinned contract test gained a source match for the new surface plus a check
  that every registered operation id exists as a real value in the implementing
  source, so the registry cannot drift into fiction.
- **i18n / a11y** — 51 new `repositoryBulk.*` keys across the union, English,
  and Cantonese catalogs; destructive copy is plain and placeholder-free in
  both. Selection bar is `role="group"`, the count is `role="status"`, the
  progress track is a `role="progressbar"` with `aria-valuenow`/`aria-valuetext`,
  each row checkbox has a per-repository accessible name, and every control is a
  native focusable element. Clicking a row toggles it while multi-select is on,
  so the list's own keyboard navigation reaches every checkbox. Clear and the
  Select-multiple toggle are disabled while a batch runs so a running batch's
  progress and cancel control can never be hidden.
- **Local verification**: `yarn lint` green end to end (Prettier repo-wide
  check clean, `eslint-config-prettier-check` clean, repo-wide eslint clean) and
  `npx tsc --noEmit` clean, all with `TEMP=C:\dm-temp`.
  - Dependency-scoped sweep — every test file importing any changed module
    (`section-filter-list`, `repositories-list`, `collection-surface-registry`,
    `automation/pull-all`, `i18n-resources`, the new bulk modules): 247/247,
    `ℹ fail 0`, `Test file accounting: 31/31 discovered file(s) produced results
    across 1 batch(es); 247 test(s) reported.`, exit 0. Includes the two suites
    that render `RepositoriesList` directly.
  - Targeted sweep of the three new suites plus repositories-list, pull-all,
    i18n, and filter-mode: 117/117, `ℹ fail 0`, `Test file accounting: 12/12 …
    117 test(s) reported.`, exit 0.
  - Broad UI/contract sweep (`app/test/unit/ui` plus every registration,
    responsive, settings-search, palette, design/style, and surface suite):
    212 files, 1308 tests, `ℹ fail 1` — `OllamaModelManager chat panel`. That
    suite imports none of the changed modules; re-running it in isolation failed
    a *different* pair of its own tests, i.e. the same non-deterministic timing
    behavior already recorded for it in this file. Everything else passed.
  - A full `node script/test.mjs` was started as well; batches 1 and 2 finished
    clean (1388/1388 `ℹ fail 0`; 1338 tests, 1337 pass, 1 pre-existing skip,
    `ℹ fail 0`) and batch 3 was still inside the slow Cheap LFS/git integration
    files when the run was stopped, so the full-suite accounting line was never
    emitted. Those remaining batches are Git/Cheap-LFS integration work that the
    dependency-scoped sweep above shows is untouched by this change.
  - SCSS: the new partial compiles standalone with `sass` (6,164 bytes), so the
    bundle import cannot break the build.
## 2026-07-25 Cloud compression installs its own workflow (background)

Branch `feat/auto-install-compression-workflow` (worktree only; **not merged,
not pushed** — this session was explicitly forbidden from pushing).

**Defect.** A repository could use Cheap LFS cloud compression and compress
nothing. `ensureCheapLfsCloudCompressionWorkflow` wrote
`.github/workflows/cheap-lfs-cloud-compression.yml` into the working tree and
deliberately stopped there ("never stages, commits, or pushes"), leaving a
Changes entry the user had to notice, review, commit, and push. GitHub Actions
never sees an uncommitted file, so until they did, compression was off in fact
while the UI said it was on.

**Fix.** New pure module `app/src/lib/cheap-lfs/workflow-auto-install.ts` holds
the decisions; `AppStore.maybeAutoInstallCheapLfsCloudCompressionWorkflow`
(fire-and-forget, in-flight-guarded per repository) runs them.

- Detection reads the **committed** blob (`git cat-file blob HEAD:<path>`), not
  the working tree, so a file `ensure` just wrote does not read as "installed".
  Decisions: `install` / `installed` / `offer-update` / `blocked-unowned` /
  `disabled`.
- Install writes through the existing hardened writer, re-verifies the bytes are
  canonical, stages the one path by name, and commits with
  `git commit --no-verify -m "Add Cheap LFS cloud compression workflow / 加入雲端壓縮工作流" -- <path>`
  so the user's staged selection survives untouched.
- Publish decision: `push` when the remote tip equals the commit's parent (goes
  through `ILocalCommitBatchingOperations.push` with `expectedRemoteSha`, then
  `readRemoteTip` proves the new tip); `anchor` when the branch was never
  published (reuses `ensureCheapLfsReleaseAnchor` unchanged);
  `defer-unpushed-commits` when the branch diverged — committed, deliberately
  **not** pushed, so no unreviewed local commit is ever published for the user.
- Never overwrites. A divergent managed caller gets a confirm-class one-click
  update on the notice stack (new `IErrorNoticeAction` kind
  `update-cheap-lfs-workflow`, two-step confirm mirroring
  `remove-repository-lock`); an unowned file is left alone and reported once.
- `workflow`-scope refusals are classified and named with the fix; every relayed
  Git string goes through `sanitizeCheapLfsFailureReason` first.
- Hooks are skipped on both the commit and the push: app-generated, single-file,
  unattended, and a hook prompt would hang it forever. Documented on
  `ILocalCommitBatchingExactPushRequest.skipHooks`.

**Entry points.** `_ensureCheapLfsCloudCompressionWorkflow` (covers the settings
toggle and the Cheap LFS panel sync) and `maybeAutoMaterializeCheapLfs` (a
checkout demonstrably carrying Release pointers).

**Gates (all green, `TEMP=C:\dm-temp`).** `npx tsc --noEmit` exit 0;
`yarn lint` green (prettier check + eslint); `node script/test.mjs
app/test/unit/cheap-lfs` → 417/417, accounting `32/32 discovered file(s)
produced results across 1 batch(es); 417 test(s) reported`, `ℹ fail 0`;
`workflow-auto-install-test.ts` alone → 30/30, `ℹ fail 0`, accounting `1/1`;
i18n + error-notice + notice-stack + auto-fix + notification-centre → 68/68,
accounting `6/6`, `ℹ fail 0`; `local-commit-batching-git-test.ts` +
`pending-commit-push-safety-test.ts` exit 0.

**Not done here.** No push (forbidden this session), no merge to `main`, no
live headless verification of the background install against a real GitHub
remote, and no screenshot of the new notices. Account selection uses the
repository's current association only — the fallback resolver work lives on
another branch.

## 2026-07-25 Anchor before the release review (#38 last defect)

Branch `fix/bootstrap-before-review` (worktree only; **not merged, not
pushed**). Addresses the round-3 defect above plus the toolbar state it left
behind.

**Root cause, exact pre-fix lines.** `app/src/lib/stores/app-store.ts:14771`
called `ensureCheapLfsReleaseAnchor` and then went straight to
`autoPinLargeFilesForCommit` (`:14799`) — the release inventory was only ever
read *inside* the per-file pin (`allocateCheapLfsReleaseBucket`,
`app/src/lib/cheap-lfs/operations.ts:2075`), so nothing in the flow re-read or
re-fingerprinted it once the anchor had changed what GitHub was willing to
show. Compounding it, `decideCheapLfsFirstPublish`
(`app/src/lib/cheap-lfs/first-publish.ts:84`) returned `blocked-unborn-branch`
for an empty local repository, which is the one case that can never escape the
hidden-inventory state on its own.

**Implemented sequence** (release provider, anchored path only):
`ensureCheapLfsReleaseAnchor` → bootstrap commit if the branch is unborn →
create-only push → prove from `ls-remote` → record tracking ref + upstream and
reload remotes/branches/status → `GitHubReleasesStore.listAll` →
`takeCheapLfsReleaseReview` → pin/upload. An already-published repository
returns `anchored: false`, takes no review, and behaves exactly as before.

- Empty repository: one `--allow-empty` commit through `createCommit`, message
  `Initialize repository for Cheap LFS / 開荒留名`, app's ordinary author
  identity, **no invented file content**. A refusing hook aborts with
  `cheapLfs.firstPublish.unbornBranch` plus the underlying detail.
- Fail-closed after the review: a bucket the review proved exists which the
  live lookup can no longer see aborts instead of being created twice. Every
  mutation still revalidates its own release fingerprint.
- A capped or unreadable inventory yields **no** review rather than a false
  one, so the guard can never conclude that unseen buckets are absent.
- Toolbar: the create-only anchor push sets no tracking, which is why "Publish
  branch" survived it; `trackAndRefreshAfterCheapLfsAnchor` now writes
  `refs/remotes/<remote>/<branch>` to the proven tip, sets the upstream, and
  reloads remotes → branches → status (ahead/behind comes from the status
  branch header, so it is read last). Both Git writes are best effort.

Docs: `docs/features/repository-management/release-backed-cheap-lfs.md`.
Gates: prettier clean, `tsc --noEmit` clean, `yarn lint` green, targeted
`node script/test.mjs app/test/unit/cheap-lfs app/test/unit/github-releases-store-test.ts`
= 415/415, 32/32 files, `fail 0`, exit 0 (run with `TEMP=C:\dm-temp`).
**Still unverified:** no live E2E re-run against a build containing this fix.

## 2026-07-25 Bundled-Git hook stdin, swallowed abort, 100k path cap

Branch `fix/push-hooks-and-caps`. Closes the three defects the live #38
re-verification found against `v3.6.3-beta3-zadtpwiotl` after the first-publish
bootstrap started working.

**1. Bundled-Git `/dev/stdin` hook failure.** Root cause proved locally against
the bundled Git 2.53.0.windows.3: `app/src/lib/hooks/hooks-proxy.ts:188` ran
`git hook run <hook> --to-stdin=/dev/stdin`. Git for Windows is a **native Win32
program** whose `open()` special-cases only `/dev/null`, so `/dev/stdin` was
resolved as an ordinary filesystem path and `xopen()` in Git's `pick_next_hook`
died before the hook was spawned — `fatal: could not open '/dev/stdin' for
reading: No such file or directory`, exit 128, on every intercepted hook run in
a repository with stock Git LFS hooks. The companion MSYS symptom
(`sh: /dev/stdin: No such file or directory`) has the same shape: `/dev/stdin`
is a symlink to `/proc/self/fd/0`, and the MSYS runtime cannot re-open an
anonymous Windows pipe inherited from a non-MSYS parent (measured: it *can*
re-open a disk-file handle).

Fixed at the layer that fixes all hook users: `app/src/lib/hooks/
hook-stdin-spool.ts` streams the proxied payload into a real file (bounded at
64 MiB, `mkdtemp`-private, removed in a `finally`) and `--to-stdin=<that path>`
is passed instead. Additionally, the Cheap LFS first-publish anchor push now
carries `--no-verify` (`ILocalCommitBatchingGitOptions.skipPushHooks` →
`buildLocalCommitBatchingExactPushArgv(..., skipHooks)`), with hook interception
dropped in lockstep. That is scoped strictly to the app-generated create-only
publication; the user's reviewed push and every batch push still run hooks.

**2. Silently swallowed abort.** `AppStore.ensureCheapLfsReleaseAnchor` returned
only a `TranslationKey` and logged the real Git failure to `log.warn`, and the
notification it produced went to the notification-centre *history* — the app's
on-screen surface is the `ErrorNoticeStack`, fed only by `_pushError`. Net
effect: the commit aborted with no toast and no reason anywhere. It now returns
`ICheapLfsFirstPublishFailure { reasonKey, detail }`, and
`buildCheapLfsFirstPublishAbort` derives all three surfaces from that one
failure — per-file rows (`reasonKey` + `reasonDetail`), a terminal progress
snapshot stating `failed = n / succeeded = 0` with the reason on every row, and
a persistent notice enqueued straight onto the notice stack (not `emitError`,
which can become a modal). `reasonDetail` is scrubbed by
`sanitizeCheapLfsFailureReason` on every surface. New EN + 粵語 keys
`cheapLfs.firstPublish.reasonWithDetail` and `.abortTitle`.

**3. 100k path cap.** `MaximumLocalCommitBatchingPaths` was 100,000, refusing a
real 212,569-path first publish outright. The bound is a *memory* bound only —
paths reach Git through NUL-delimited stdin, and the per-batch 10,000-path /
1.4 GB ceilings are what bound a commit and a push. Raised to **600,000** from
measured cost (400k paths = 58 MiB raw-diff stdout + 159 MiB parsed entries +
106 MiB tree map; 600k = 87/239/158 MiB), which keeps the worst-case transient
parse footprint near 400 MiB and clears the required 400,000 by 50%; 1,000,000
was rejected at ~700 MiB. The 64 MiB raw-diff and path-inventory stdout budgets
were raised to 160 MiB in lockstep — at 400k paths a raw diff already measures
58 MiB, so the byte budget would otherwise have become the real, less legible
cap. The proof capture's whole-tree `git add -A` ceiling matches.

Gates: `npx tsc --noEmit` clean; Prettier written; targeted `node
script/test.mjs` green with intact accounting lines (`hooks/
hook-stdin-spool-test.ts` new, `cheap-lfs/first-publish-test.ts` and
`git/local-commit-batching-git-test.ts` extended). `cheap-lfs/
oci-registry-runtime-test.ts` "accepts a pinned winget link…" fails both with
and without this change (Windows symlink/realpath privilege in the fixture) —
pre-existing, verified by re-running it on a stashed clean tree. Not yet
re-verified against a live installed build.

## 2026-07-25 Cheap LFS first publish, EBUSY push race, silent failures

Branch `fix/cheap-lfs-first-publish`. Closes the three defects proved by the
headless 200k end-to-end in issue #38, plus the launch-time Actions metadata
error observed in the same session.

**1. Release-route first publish (422 × 10).** `pinFileToRelease` →
`allocateCheapLfsReleaseBucket` → `releases.create` passes
`targetCommitish: await releaseTargetCommitish(...)`
(`cheap-lfs/operations.ts:1493`), which resolves to the *local* branch name via
`resolveReleaseTargetCommitish` (`:927`). On an unpublished repository that
branch does not exist on the remote, so GitHub answers `422 Validation Failed`
for every file, unrecoverably.

Design chosen: **publish the branch tip before uploading, then prove it from the
remote**, consistent with the existing "each batch pushed and proven" contract.
`app/src/lib/cheap-lfs/first-publish.ts` holds the pure decision;
`AppStore.ensureCheapLfsReleaseAnchor` runs it once per commit before any
hashing or upload and, for `publish-branch`, pushes with
`expectedRemoteSha: null` (create-only, can never overwrite) and re-reads the
remote ref via `isCheapLfsFirstPublishProven`. Blocking decisions refuse with a
localized per-file reason instead of retrying into another 422. Deferring
uploads to the push phase was rejected: it would commit pointers whose bytes
exist nowhere remote, so a clone taken between commit and push would resolve to
a dangling pointer. No silent provider fallback was added.

**2. EBUSY push race.** `readWorkingTreeFingerprint`
(`git/local-commit-batching-git.ts`) built a scratch index under
`desktop-material-commit-batch-*` and cleaned it with an unconditional
`rm(dir, { recursive: true, force: true })` in a `finally`. At 200k files the
`git add -A` holds `index.lock` ~14 s, so the unlink hit `EBUSY` — and because
it threw from a `finally` it replaced the real error and aborted the push before
any network I/O. Replaced with `git/temporary-index-cleanup.ts`, which consults
`decideTemporaryIndexLockCleanup` (fail-closed: never touches a symlink or
non-regular lock; awaits a live *or indeterminate* owner on a bounded 60 s / 250
ms budget; treats `EBUSY`/`EPERM`/`EACCES` from the unlink as proof of a live
owner) and never throws. The same pattern in `git/commit-push-batch-proof.ts`
(`desktop-material-commit-intent-*`) was fixed identically. The trigger was also
removed: the whole-tree `git add -A` ran with a 256 KiB (8 KiB in the proof
capture) stdout ceiling, so Node killed Git part-way through a large tree's
line-ending warnings — which is what stranded the lock. Both now use the 64 MiB
path-inventory ceiling.

**3. Silent failures.** `ICheapLfsAutoPinFailure` now carries `statusCode`
(read from `responseStatus` on `GitHubReleasesError`/`APIError`) and an optional
self-diagnosed `reasonKey`; `ICheapLfsAutoPinProgress.failedFileDetails`
republishes every settled failure with its sanitized reason on each progress
snapshot. The Cheap LFS mini terminal renders per-file failure rows and folds
the reasons into the summary's `aria-valuetext`; the failure notification
appends `Reason: HTTP 422 — …`. `sanitizeCheapLfsFailureReason` bounds the text
to 240 characters, collapses control characters, and strips URLs, `gh*_`
tokens, and `Authorization: Bearer` values before display. New EN + Cantonese
keys; error copy stays plain and factual.

**4. `ActionsMetadataJSONError` on launch.** The only producer of that message
outside `api.ts` is the update-build probe (`desktop-material-update-build.ts`),
whose 256 KiB bound is far below a real `compare` or `workflow_runs` page. One
oversized response aborted the whole probe, and `onUpdateNotAvailable` is
registered directly as an IPC listener, so its floating promise turned any
rejection into the generic "background action stopped unexpectedly" toast. The
bound now matches the shared 2 MiB Actions limit; each leg degrades
independently through `updateBuildProbeDegradation` (unproven is never reported
as "ahead"); `UpdateStore` logs every skipped response and emits
`onActionsMetadataSkipped` at most once per session, which `app.tsx` turns into
one informative non-blocking notification; and `onUpdateNotAvailable` can no
longer reject.

Gates: `npx tsc --noEmit` clean, `yarn lint` green, `yarn prettier --check`
green, targeted `node script/test.mjs` green (new suites `cheap-lfs/
first-publish-test.ts`, `cheap-lfs/failure-reason-test.ts`,
`git/temporary-index-cleanup-test.ts`, plus honest contract extensions to
`cheap-lfs/automation-test.ts` and `update-coming-soon-test.tsx`). Not yet
verified against a live installed build — the 200k end-to-end that produced the
evidence has not been re-run.

## 2026-07-24 trampoline token lifecycle fix

Production build `zadtjbevjx` logged repeated `Unhandled renderer promise
rejection — Error: Tried to use invalid trampoline token` from
`trampoline-server.ts` `processCommand`, immediately after a 5 s
`updateRemoteHEAD` timeout overlapping a `git fetch --recurse-submodules`.
User-visible symptoms were "A background action stopped unexpectedly" toasts
and Cheap LFS randomly failing a 10 GB commit.

Root cause: a trampoline token was revoked when the *promise* that requested it
settled, not when the Git *process* it was issued for exited. Timed-out,
aborted, and max-buffer operations — and `spawnGit`, which resolves the moment
the process starts — all leave Git running past that point, so a live process
asked for credentials with an already-deleted token. `processCommand` then threw
from a socket `data` handler: an unhandled renderer rejection *and* a reply that
never arrived, wedging that Git process on an unclosed socket while it still
held its lock files.

Fix (`fix/trampoline-token-lifecycle`): tokens are now lease-counted and
disposed only once revoked *and* every child process holding them has exited
(`keepTrampolineTokenAliveUntilExit`, wired into `git()`, `spawnGit`, and the
bounded SSH working-copy runner). Per-operation trampoline context moved from
the promise's `finally` to token disposal so a late request keeps the right
repository and forced account. The invalid-token path now replies on the socket
and logs one `warn` naming the command identifier, credential-helper verb, and
parameter count — never the token, stdin, or askpass prompt — and distinguishes
an expired token from one this session never issued. No new user-facing copy,
so no new translation keys.

Verification: `trampoline-token-lifecycle-test.ts` (11 new tests, including a
real server driven over a loopback socket); trampoline suites 39/39 and the
related Git/SSH suites 49/49 green with the accounting line intact; `tsc
--noEmit` clean; `yarn lint` (Prettier + ESLint) green.
## 2026-07-25 updater downgrade investigation and guard

`fix/updater-downgrade`, branch-only. The reported "auto-update downgraded the
install to 3.6.2" did **not** come from the update feed, and no comparer ranked
`3.6.2` above `3.6.3-beta3-*`:

- The live feed
  (`https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/RELEASES`)
  served exactly one line,
  `6C3349F0B42AD9F3466E80687B7DF6D30AFA984A GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg 326312175`.
  None of the repository's 124 published releases carries a `3.6.2` tag or any
  `3.6.2` asset.
- `Squirrel-CheckForUpdate.log` shows every network check sending
  `localVersion=3.6.3-beta3-zadtjbevjx`, with no check at all in the 09:39 →
  00:11 window that brackets the 17:40 event; `Squirrel-Update.log` shows the
  only applied update as `zadtjbevjx` → `zadtorqoxa`.
- `%LOCALAPPDATA%\SquirrelTemp\Squirrel-Install.log` records the real cause at
  `[24-07-26 17:40:06]`: `Starting Squirrel Updater: --install . --checkInstall
  --silent`, `Reading RELEASES file from ...\SquirrelTemp`, `First run, starting
  from scratch`, then `Writing files to app directory: ...\app-3.6.2`. A stale
  local bootstrapper carrying the 2026-07-01
  `GitHubDesktop-3.6.2-full.nupkg` was re-run; Squirrel's `--install` path does
  no version comparison whatsoever.

Fixes landed as defence-in-depth for the same failure class, since Squirrel
installs the highest feed entry without comparing it to the running version:

- `app/src/lib/update-version-order.ts` — legacy-NuGet-compatible ordering,
  `RELEASES` parsing, and `probeUpdateFeed`, wired into
  `AppWindow.checkForUpdates` so a feed whose best offer is older than
  `app.getVersion()` reports no-update instead of reaching Squirrel. Fails open
  on network/HTTP/non-manifest responses.
- `script/release-version.js filter` plus both release workflows — the published
  `RELEASES` is filtered to the `GitHubDesktop` package at exactly
  `RELEASE_VERSION` before the payload copy, and the package-copy loop now reads
  the filtered manifest so a stale entry cannot conjure a mislabelled asset.

Verification: `prettier --check` clean, `tsc -P tsconfig.json` and
`tsc -P script/tsconfig.json` clean, `yarn lint` green,
`node script/test.mjs script/release-version-test.ts
app/test/unit/update-version-order-test.ts
app/test/unit/super-express-release-workflow-test.ts
app/test/unit/ci-workflow-safety-test.ts` → 34/34 pass, accounting `4/4`.
Not pushed; no CI run exists yet.

## 2026-07-24 feature discoverability pass

Two Opus audits (entry-point matrix + user-journey burial hunt, 11 raw
reports) drove `feat/feature-discoverability`, integrated with one review
blocker fixed. All changes are additive or relabel-only; no entry point was
moved or removed:

- New command-palette commands: Preferences → Sound, GitHub API explorer
  (which now un-hides a user-hidden API rail item before navigating — the
  review blocker), tag lifecycle (Repository Tools), Cheap LFS repository
  settings, per-repository automation settings, and Ollama chat.
- Cheap LFS findability: the Repository Settings tab is relabelled
  "Build, run & large files" with an explicit "Large files & storage
  (Cheap LFS)" section heading around its toggles.
- Settings-search additions: Ollama manager/chat under Copilot (findable by
  "ollama"), global ignore and Git-hook environment under Git.
- Honest skips recorded in the workflow result: no standalone Ollama
  Preferences tab (the pane is Copilot-access-gated and would frequently
  render sign-in content; churns the pinned responsive catalog), no
  auto-fix preference toggle (nothing reads it yet — a dead toggle would
  repeat the repack-toggle defect), no Repository-Settings entries in
  settings search (its schema is typed to PreferencesTab).

Verification: lint fully green after removing a stale workflow worktree
Prettier was sweeping; `tsc` clean; complete suite run exit 0, 0 failures,
coverage of the palette/search/tab suites confirmed in the log.

## 2026-07-24 mega wave: audio wiring, auto-fix, large repos, search

Seven more branches were merged into `main` after the morning feature wave,
each built by an isolated Opus agent and adversarially reviewed before
integration:

- `feat/wire-narration-assets` (#9b) — the 243 bundled narration/melody assets
  now play at runtime: per-language recorded MP3 narration (English /
  Cantonese / bilingual strictly serialized) through one non-overlapping
  queue with live-TTS fallback, melody WAVs as per-event cues, packaged
  `static/audio` copying, a persisted "use recorded narration" toggle, and a
  filesystem manifest-completeness contract test.
- `feat/sfx-event-mapping` (#10) — push/fetch/pull and every Build & Run
  phase get audibly distinct motifs (four families) via a pure, exhaustively
  tested event → category → motif mapping, plus a per-cue audition grid in
  Settings → Sound.
- `feat/repo-theme-music` (#11) — a deterministic synthesized theme per
  repository (seeded from its identity) with per-repo override/clear;
  persistence moved from localStorage to a Git-backed dedicated-setting
  store with one-time migration.
- `feat/auto-fix-errors` (#15) — pure classifier for recognized Git failures
  (stale `index.lock`, auto-gc/maintenance hang, non-fast-forward push,
  forbidden org-remote push, detached-HEAD commit) with safety classes
  (auto / confirm / manual; destructive fixes are never automatic) and a
  localized one-click "Fix it" notification action.
- `feat/native-large-repo` (#16) — per-repository large mode extends
  gc/maintenance suppression to status/add/checkout/fetch, fail-closed stale
  index.lock removal, an explicit "checking for changes" state (no more
  transient "No local changes"), suspended polling with one persistent
  notification for missing-on-disk repositories, and a confirm-class nested
  `.git` compression offer. The review's one confirmed blocker — a dead
  "Repack large repositories when idle" toggle — was fixed at integration:
  large classification now schedules one controlled deferred repack per
  repository per process (setting re-checked at fire time) with
  notification-centre progress/outcome toasts.
- `feat/more-search-bars` — the stash manager inventory gains the shared
  fuzzy/substring/regex filter with the full inline regex builder, registered
  in the search-surface audit registry (audit rated the other unsearchable
  surfaces low-value; they remain listed in the workflow result).
- `fix/regex-builder-clipping` — the regex builder gets a responsive
  contract (min-width floor with single-column collapse, internal
  max-height scroll region) so small host dialogs no longer clip it,
  pinned by new style-contract tests.

Integration notes: `audio-cue-store.ts` needed a real three-way resolution
(narration queue × SFX routing × theme player — operation cues route through
the merged `playForEvent` gate with null event ids so recorded narration
stays attached to notifications); `i18n-resources.ts` resolved keep-both
three times. One regression was found by the first complete full-suite run
and fixed at the root: a hidden or unrealized tab strip measures every tab
width as zero and the overflow split collapsed all but one tab — the strip
now never splits on unmeasurable widths. Earlier "full" runs had silently
skipped the tab UI suite; the final gate below is a complete run.

## 2026-07-24 feature-wave integration into `main`

The five July 24 feature branches and the narration-asset branch were merged
into `main` sequentially: `feat/settings-search`, `feat/tab-overflow-dropdown`,
`feat/audio-system`, `feat/audio-narration-assets` (243 MP3/WAV files +
`manifest.json` under `app/static/audio/`), `feat/local-actions-runner`, and
`feat/batching-filecount-progress-wip` (#14). Per the handoff plan, the
batching WIP branch's stray concurrent-agent copies of the settings-search and
preferences files were resolved in favor of the already-merged feature
branches; its batching-only changes (dual caps, commit progress, gc isolation)
merged cleanly. Three integration commits follow the merges: the Sound pane
(which merged in parallel with settings search) is indexed by the
settings-search catalog — tab name key in English and Cantonese plus five
entries reusing the pane's own labels; four pinned source-contract tests were
updated to the post-merge source shapes (command allowlist gains
`run-actions-locally`, `renderRailTab` feature-marker gating, tab-control
registration, and gc suppression followed through
`AutomaticCommitPushBatchGitMaintenanceArgs`); and the responsive surface
smoke catalog registers the Sound settings tab, moving its pinned gate count
from 87 to 88.

Known follow-up: the bundled narration/melody assets are not yet played by the
audio runtime — the narrator currently uses live TTS and SFX are synthesized;
wiring the pre-generated files (and per-event melodies) remains task #9's
second half. Remaining backlog after this integration: #10 sound effects
mapping, #11 repo-themed music tracks, #15 auto-fix errors, #16 native
large-repo handling, and the Cheap LFS end-to-end app test (push as
codingmachineedge, big-file auto-pin, fresh-clone verify).

## 2026-07-24 settings search (feat/settings-search)

Added a search box to the Settings (Preferences) dialog rail so a setting can be
found by title, description, or keyword across every tab and jumped to directly.
Because the rail renders on every tab, the box is present on every settings page.

- New pure catalog + matching module
  `app/src/lib/settings-search/settings-search-catalog.ts`
  (`SettingsSearchCatalog`, `filterSettingsEntries`, `groupSettingsResultsByTab`,
  `settingsTabsWithMatches`, `settingsSearchKeys`, `settingsTabNameKey`). All
  searchable text is packed into the first two match keys so keyword aliases
  (e.g. "telemetry" → Usage stats) match in fuzzy mode, not only substring/regex.
- New UI `app/src/ui/preferences/settings-search.tsx` (`SettingsSearch`):
  labelled combobox → listbox results grouped by tab, highlighted title matches,
  full keyboard nav (arrows/Home/End/Enter/Escape), `role="status"` live count,
  clear button. Reuses the shared `FilterModeControl` + regex builder; registered
  as the `preferences` standalone surface in `collection-surface-registry.ts`.
- `app/src/ui/preferences/preferences.tsx` mounts the box in the rail, tracks
  query/mode/case/languageMode state, subscribes to `LanguageModeChangedEvent`,
  shows per-tab match-count badges, and dims non-matching tabs during a search.
- Fully localized (English / Cantonese / bilingual) via new `settingsSearch.*`
  keys in `app/src/lib/i18n-resources.ts`; navigational so tone is funny-level
  neutral. Styles in `app/styles/ui/_preferences.scss`. Docs:
  `docs/features/identity-and-workspace/settings-search.md`.
- Verification: `npx tsc --noEmit` clean; `app/test/unit/settings-search-test.ts`
  15/15 pass; `collection-surface-registry-test.ts` 3/3 and `i18n-test.ts` 16/16
  still pass. The catalog is a representative index of high-value settings, not
  an exhaustive mirror of every control — new settings should add an entry.

## 2026-07-24 tab-strip overflow dropdown (branch `feat/tab-overflow-dropdown`)

When the repository tab strip overflows its width, the tabs that no longer fit
move into a keyboard-accessible "more tabs" dropdown instead of clipping or
scrolling horizontally. The split keeps a contiguous, in-order run of tabs
visible, guarantees the active tab stays on screen by sliding the run, pins
collapsed-group chips, and preserves every per-tab appearance customization for
both visible tabs and dropdown rows.

- New pure geometry module
  `app/src/ui/repository-tabs/tab-overflow.ts` (`computeTabOverflowLayout`,
  `hasTabOverflow`) — DOM-free and unit-tested.
- New dropdown `app/src/ui/repository-tabs/tab-overflow-popover.tsx`
  (labelled listbox, arrow/Home/End/Enter/Escape, per-tab styling).
- `repository-tab-strip.tsx` measures widths via a `ResizeObserver`, caches
  them, and renders the more-tabs button plus popover; `.repository-tab-list`
  now clips (`overflow: hidden`) instead of scrolling.
- i18n: `tabs.overflow*` keys added in English and Cantonese (bilingual derived).
- Tests: `app/test/unit/tab-overflow-test.ts`, 11 cases, all green via
  `node script/test.mjs`. `npx tsc --noEmit` clean; Prettier applied.
- Docs:
  `docs/features/identity-and-workspace/tab-overflow-dropdown.md` (+ category
  README index).

MVP-vs-complete: the split, active-tab guarantee, chip pinning, appearance
preservation, a11y, i18n, and tests are complete. Overflow rows do not carry
the live repository logo/icon (they show label + path + status chips); adding
the async logo loader to dropdown rows is a possible follow-up.

## 2026-07-24 optional audio system (branch `feat/audio-system`)

Added an optional, off-by-default audio layer with three parts: a spoken TTS
narrator (English + `zh-HK` Cantonese, rate-limited), Web Audio synthesized
sound effects (no bundled assets), and per-repository looped music. New pure
modules under `app/src/lib/audio/` (`audio-settings`, `audio-throttle`,
`narrator-lines`, `tone-synth`) plus the renderer `audio-cue-store`; a new
**Settings → Sound** pane (`app/src/ui/preferences/sound.tsx`) wired through the
`PreferencesTab.Sound` tab; and event routing added to `App` via the in-app
notification centre (`syncAudioSystem`). Anti-annoyance is enforced by the pure
`decideAudioActions` (master gate, global SFX debounce + per-category cooldown,
narrator cooldown, quiet hours, reduced-sound, screen-reader coexistence);
errors always bypass suppression and stay clear at every funny-level. All copy
localized (English / Cantonese / bilingual) via `settings.sound*`. Funny-level
(1–5, per language) scales only narrator tone.

Verification: `npx tsc --noEmit` clean; `app/test/unit/audio-throttle-test.ts`
(16) and `app/test/unit/audio-settings-test.ts` (15) pass — 31 total. Feature
doc: [docs/features/design-system/audio-system.md](docs/features/design-system/audio-system.md).
MVP scope: throttling, settings serialization, TTS/SFX/music, and the Settings
UI are complete and working; build-run phase SFX and a distinct push/fetch cue
mapping are noted follow-ups (push currently narrates via the `auto-commit`
notification). Per-repo music persists in localStorage rather than the
git-backed dedicated-setting store — a possible future upgrade.

## 2026-07-24 Local GitHub Actions runner (branch `feat/local-actions-runner`)

Added a local GitHub Actions runner: **Repository ▸ Run actions locally…** (and
the "Run Actions locally" command-palette entry) opens a dialog that discovers
and parses `.github/workflows`, feature-detects `act`+Docker (clear localized
install guidance when either is missing), and streams a chosen workflow/event/
job run — with `workflow_dispatch` inputs, secrets (written to a `0600` temp
`--secret-file`, deleted after the run, never logged, never on the argv), and a
dry-run (`-n`) mode. Cancel tears down the container tree via Build & Run's
`kill-tree`. Renderer↔main is wired over new IPC channels
(`detect-actions-local-tools`, `list-actions-workflows`,
`start-/cancel-actions-local-run`, and the `actions-local-run-log/-state`
pushes).

- **New code:** `app/src/lib/actions-local-run/{types,parse-workflows,command}.ts`
  (pure, tested), `app/src/main-process/actions-local-run/{tool-resolver,
  discovery,runner,index}.ts`, `app/src/ui/actions-local-run/
  actions-local-run-dialog.tsx`, `app/styles/ui/_actions-local-run.scss`.
- **Wiring:** ipc-shared, main-process-proxy, main.ts, menu-ids/menu-event/
  build-default-menu, command-palette-catalog, desktop-material-features,
  popup model + app.tsx, i18n-resources (EN + Cantonese; bilingual derived).
- **Tests:** `command-test.ts` (15) and `parse-workflows-test.ts` (16) green;
  `ipc-contract-test.ts` updated (5) and green. `npx tsc --noEmit` clean.
- **MVP boundary:** running/streaming/secrets/inputs/dry-run and the
  release-upload **detection + guarded notice** ship now. The one-click
  "upload this run's artifact to the real release" button (reusing the
  account-bound `upload-release-asset` boundary) is a documented follow-up.
  A live container run is not covered by unit tests.

## 2026-07-24 batching dual caps, detailed commit progress, and gc isolation

Extended the automatic local commit batching and commit progress.

- **Dual per-batch caps.** Batching is now bounded by **both** a configurable
  file-count ceiling (default 10,000 files, `AutomaticLocalCommitBatchFileCountLimit`,
  kept in lockstep with the existing per-batch path bound) **and** the existing
  1.4 GB changed-blob byte ceiling, whichever is reached first. `createLocalCommitBatchPlan`
  threads the file-count limit into the shared splitter, and `decideLocalCommitPushBatching`
  now considers file count as well as bytes: a single local-only commit whose file
  count exceeds the cap is rewritten into bounded batches even when its bytes fit,
  and a combined range that only crosses a ceiling in aggregate (every commit within
  both caps) is pushed one existing tip at a time. The design note in
  `commit-push-batching.ts` records why the byte default stays at the conservative
  1.4 GB changed-blob figure (which keeps each push below the hard 1.5 GB
  `AutomaticCommitPushMaximumBytes` push ceiling after pack/tree/commit overhead)
  rather than a nominal 1.5 GiB.
- **Auto-push per batch preserved.** Each committed batch is pushed and proven at
  the remote branch tip before the next commit is created; a push failure aborts
  before the next batch and restores the original tip where safe. No `gh auth switch`
  is used; the existing gh-credential push path is unchanged.
- **Detailed commit progress.** Added `ICommitBatchProgress` and the pure
  `computeCommitBatchProgress` helper; extended the `git-commit` `commitOperationPhase`
  variant with an optional `batchProgress` field (stage, batch index/total, cumulative
  files/bytes committed). `_commitIncludedChanges` emits it from the batch sequencer's
  `onProgress`, and the commit-message UI renders "Committing/Pushing batch N of M
  (X/Y files)" for multi-batch commits. Single-batch commits keep their existing text.
- **Auto-gc / auto-maintenance isolation.** Large batched commits, their explicit
  staging, and their pushes now carry `-c gc.auto=0 -c maintenance.auto=false`
  (`AutomaticCommitPushBatchGitMaintenanceArgs`) so a `gc --auto` / `maintenance --auto`
  repack cannot fire mid-batch (observed live to burn 1000+ CPU-seconds and hang the
  operation). The working-tree commit opts into this via a new `disableAutoMaintenance`
  createCommit flag gated to multi-batch runs, and a single best-effort `git repack -d`
  runs once after the whole sequence (`repackAfterBatchedCommit`). Ordinary single-batch
  commits are unchanged.

Files changed: `app/src/lib/commit-push-batching.ts`, `app/src/lib/git/local-commit-batching.ts`,
`app/src/lib/git/local-commit-batching-git.ts`, `app/src/lib/git/commit.ts`,
`app/src/lib/app-state.ts`, `app/src/lib/stores/app-store.ts`, `app/src/ui/changes/commit-message.tsx`,
plus the `commit-push-batching`, `git/local-commit-batching`, `git/local-commit-batching-git`,
and `legacy local commit batching entry points` unit suites, and
`docs/features/repository-management/automatic-commit-push-batching.md`.

Local verification: `npx tsc --noEmit` is clean for the changed files (the only tree-wide
tsc errors belong to an unrelated in-progress `settings-search`/`actions-local-run` feature
being edited concurrently in the same checkout, not to this change). Prettier is clean on
every changed file. node:test suites green: `commit-push-batching` 19/19, mock
`git/local-commit-batching` 24/24, `legacy local commit batching entry points` 8/8, and the
real-Git `git/local-commit-batching-git` integration suite.

## 2026-07-24 final integration and clean Git topology receipt

The requested merge-and-cleanup pass found no separate work left to integrate.
After `git fetch origin --prune --tags`, both local `main` and live
`origin/main` were exactly
`727496025775c1015492beb936b79e0b4f019b04` with `0/0` divergence. The live
remote exposed only `refs/heads/main`, GitHub had no open pull requests, the
checkout had no local non-default branch, `.git/worktrees` did not exist, the
sole registered worktree was the clean primary checkout, and the stash list was
empty. Accordingly, branch merges, branch deletion, linked-worktree removal,
stale-metadata pruning, and stash deletion were all deliberate no-ops: every
available repository tip was already contained in `main`.

Exact-source local acceptance ran before this documentation-only receipt. The
fixed Lowlevel MCP service reported healthy at `127.0.0.1:8765`; its scheduled
task pointed to the required checkout and Python, whose source tip was
`547a102a49169d41da876de217856229ab7c03a1`. The prescribed unpackaged
production build returned `0`, did not time out, and completed in **527.53
seconds**. Its binding hashes were `out/main.js`
`c0573314a9e3fcda894e41cf545e5c2e876c1324317a3b7b5da7bbfcc3a1c625`,
`out/index.html`
`d44d3b8f637b17fc75c9f3ea14bc08166a7fa931de46b6ea41971ccd6131f553`,
`out/keytar.node`
`391976ea3af33d6697a9df2e007a8a00d5c7e0aa6f08c7eceeb21fb483591c09`,
and Electron
`082d352efc6a9f5882354ee4096ae0b40b78bc6c8e52fc5084f3df9254c613ff`.

That bundle launched only on the uniquely named off-screen Win32 desktop
`DM-Merge-20260724-a82f`, using isolated profile and disposable Git fixture
paths. The runtime-resolved `Desktop Material` window (PID `18216`, HWND
`1056160`) produced a stable, nonblank, unclipped, private-data-free 960×660
client capture: 90,059 bytes, SHA-256
`f6d8bcf136f3a993eafbfeaba5a18ef1b55298ec9923173641984357b5a0c80f`.
The generic background close helper could not resolve that alternate-desktop
HWND, so the already revalidated saved PID was terminated as the declared
fallback. The desktop then reported zero windows and closed successfully. The
exact owned Temp root and the two ignored trampoline bootstrap directories were
moved to the Recycle Bin after path validation; all remain recoverable until
the bin is emptied.

Local validation passed Electron-version and changelog checks, TypeScript,
full source lint/Prettier, and all **39/39** script tests. The optional local
desktop-trampoline bootstrap could not compile because this host lacks the
ClangCL Visual Studio toolset (and uses Node 26/Python 3.9 rather than CI's
pinned Node 24.15/Python 3.11); it changed no tracked source, and its generated
directories were removed as described above. The authoritative fresh Windows
x64/arm64, packaged x64 E2E, CodeQL, Cheap LFS, and downstream installer/release
results for this receipt are therefore verified after its single `main` push
and recorded in the GitHub Discussion plus the final external handoff, avoiding
an endless documentation-release loop.

This receipt changes no product behavior or UI. / 今次純粹係合併同清場驗收：啲分支
一早已經乖乖地入晒 `main`，冇偷走、冇亂刪，亦冇整花個介面。

## 2026-07-23 materialize cancel/summary correction from verified bug audit

A multi-agent bug audit of the last fifteen commits (nine finder lenses, every
finding adversarially verified by three independent reviewers) confirmed seven
defects. The three user-facing materialize-flow defects are fixed in this
change:

- **Cancel now reaches queued batches.** Materialization owners register in
  `cheapLfsMaterializeOwners` from enqueue time, so canceling Materialize all
  aborts every pending batch for the repository — including an automatic
  restore enqueued by a concurrent fetch/pull, which previously took over the
  queue slot and restarted the downloads the user had just canceled. A
  single-file cancel stays scoped to its own request signal, and
  `disposeTemporaryRepositoryState` aborts queued owners too.
- **Honest completion reporting.** `runCheapLfsMaterialize` resolves with an
  `ICheapLfsBatchMaterializeResult` (per-file failures now carry messages and
  the batch total bytes), and the Large files panel reports "Materialized N
  files; M files failed and were left as pointers." instead of unconditionally
  claiming every object is verified locally.
- **No stale list after cancel.** A canceled Materialize all reloads the
  pinned-file list again, so files completed before the cancel no longer keep
  `workingTreeState: 'pointer'` — which also restored the local-deletion
  warning on Remove for those files.

Verification: `tsc --noEmit` clean; ESLint and Prettier clean on every touched
file; focused suites pass — `app/test/unit/cheap-lfs` **298/298**,
`ui/cheap-lfs-test.tsx` **20/20** (three new behavioral tests plus the
rewritten repo-wide-cancel test), `submodule-mutation-guard-test.ts` **7/7**
and `submodule-repository-navigation-test.ts` **21/21**. The latter two were
already failing at the previous HEAD (the dispose assertions matched an
outdated map shape and a line-wrapped source pattern) and were repaired with
the field rename.

Remaining verified findings, not yet fixed: committing a selected **non-deleted**
`.git*`-prefixed path whose parent directory is a symlink/junction, or whose
leaf is a symlink or multi-link file, still throws an unhandled
`CheapLfsTrackedPathError` that fails the whole commit
(`app/src/lib/cheap-lfs/commit-key.ts`, a regression of "Allow ordinary
.github commit files"; the merged legacy-deletion guard from `9a0be385a1`
already bypasses the more common deleted-path case);
`maybeAutoMaterializeCheapLfs` awaiting the whole per-checkout queue can stall
awaited `_selectRepository` chains behind long downloads (`app-store.ts`,
medium); the cloud-compression action rejects documented-valid exactly-2-GiB
legacy parts and lacks a stdin `error` listener in `readPointerBlobs`
(`.github/actions/cheap-lfs-cloud-compression/cloud-compress.mjs`, medium/low).

## 2026-07-23 Cheap LFS settings, scrolling, and legacy-deletion key guard

The Large files manager now makes its configuration route explicit: **Open
Cheap LFS settings** opens **Repository settings → Build & run**, where storage,
automatic pinning, transfer concurrency, clone/open materialization, and cloud
compression are configured. The manager is also the repository page's vertical
scroll owner, so long pinned-file inventories remain reachable instead of being
clipped by the repository shell.

Private-registry commit-key validation keeps its pointer/key proof fail-closed.
Its only compatibility exception is an otherwise Windows-hostile selected path
whose exact repository-relative identity is proven deleted by a fresh live Git
status. A current nondeleted unsafe path, a missing or mismatched status proof,
or a real OCI pointer stored under a control-plane path is still rejected. This
allows a legacy deletion to commit without turning path validation into a key
bypass.

UI note / 介面提示：**Open Cheap LFS settings / 開啟 Cheap LFS 設定** 會直接帶你去
**Repository settings → Build & run**；長檔案清單都可以一路碌到底，唔使周圍搵
設定。

Exact-source verification passed **58/58** focused key, commit-entry, UI,
localization, navigation, and temporary-workspace regressions; TypeScript and
the full source lint passed. The fixed Lowlevel MCP production build returned
`0`. An isolated 960×660 app then rendered 60 canonical pointers with computed
`overflow-y: auto` (`518` px client height, `9,942` px scroll height), reached
`assets/large-file-60.bin`, and opened `#repository-settings` with **Build &
run** as the sole selected tab. The complete bundle/capture hashes and
recoverable cleanup receipt are in
`.codex/run-manifests/2026-07-23-cheap-lfs-settings-scroll-key.md`.

The first concurrent publication at `9a0be385a1` passed lint, ARM64 packaging,
packaged x64 E2E, Pages, CodeQL, and Cheap LFS cloud automation. Its x64 unit
job found two pre-existing source-contract regexes that still expected the old
three-item scroll-owner exception list. The follow-up makes both contracts
expect the new Cheap LFS exception and also preserves the earlier
Prettier-tolerant controller assertion. / 首次 push 功能本身過關，但 CI 捉到兩條舊
regex 仲認住舊 scroll-owner 清單；今次一齊更新，唔畀測試字蝨再扮大佬。

## 2026-07-23 responsive Releases publication and live Bambu checkpoint

The integrated Cheap LFS, ordinary-Git batching, responsive Repository
Releases, and richer commit-progress source is now published through corrective
source
[`c22e29a03ac14b01e35ab7b1434fa288bc794307`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c22e29a03ac14b01e35ab7b1434fa288bc794307).
Exact-source Cheap LFS cloud-compression run `30055965804`, CI `30055965807`,
CodeQL `30055965809`, and Pages `30055965817` passed. Installer run
[`30057456712`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30057456712)
then published immutable, non-draft, non-prerelease, six-asset exact-target
Release
[`v3.6.3-beta3-zadthusbjk`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-zadthusbjk).

The corrected unpackaged production build returned `0` after **390 seconds
wall** (Yarn **387.64 seconds**) through the fixed Lowlevel MCP endpoint. Its
1,179,200-byte `out/renderer.css` has SHA-256
`6fba1434112ea5c02256a12e6ce8af42f5c870f0db5835155acb8075708d9d28`.

The current public-safe UI receipts are:

| Surface | Dimensions | Bytes | SHA-256 | Acceptance |
| --- | ---: | ---: | --- | --- |
| Cheap LFS progress, English | 1440×960 | 113,869 | `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333` | All 36 named assertions passed, including `noBlockingDialog`; one real pointer selection settled the diff and all three worker rows are contained. |
| Cheap LFS progress, bilingual | 640×960 | 85,175 | `1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50` | All 36 named assertions passed after one real pointer attempt; progress bottom y=942 remains inside panel bottom y=944, with no injected diagnostic style. |
| Repository Releases, 200% zoom | 960×660 | 89,856 | `8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a` | The 480×330 CSS viewport contains one complete 53.5 px release row, `HH:mm` timestamps, a wrapping bilingual disclosure, and zero horizontal overflow. |
| Bambu Cheap LFS, live ten-object inventory | 960×660 | 98,404 | `55a6519a81edef49cb7b6f6f02606a75485b34a1fed21beafa21b67fd758d142` | The inspected public-safe frame shows the real Bambu repository with ten tracked raw pointers, their immutable public Release tag, local pointer state, sizes, and Materialize actions. The separate fresh-clone hash receipt below proves the later 10/10 restore. |

The historical initial-integration changed suite passed **151/151**. For the
corrected source, the focused Releases style/localization/UI plus Pages
contracts pass **55/55**. A final 152-test integrated rerun was still progressing
after 693 seconds with no observed failure when the user explicitly requested
the immediate push; it was stopped cleanly during the disposable-Git batching
suite and therefore has no aggregate pass claim. A complete rerun is handed off
instead of being misreported.

For the compact Releases scene, native Enter expanded and collapsed the tools
disclosure. Search, status, selection, and release-row actions remained
keyboard-focusable; the no-next-page pagination action remained present with
its correct disabled state. Constant-physical-size probes passed at 100%, 125%,
150%, and 200%, with one complete row and zero horizontal overflow at every
scale. The gallery source now contains **77** inspected images.

The public
[`codingmachineedge/bambu-build`](https://github.com/codingmachineedge/bambu-build)
exercise copied exactly **8,305 payload files** and **14,809,588,162 bytes**.
Desktop Material created four ordered UI batches (`639d566b`, `8efaa6f9`,
`93d72d61`, and `f58fd4c0`) and proved each remote tip. The first normally
packed push received HTTP 408 while leaving its exact pending commit durable;
the real UI retry pushed that same immutable SHA with process-local fast-pack
options, then completed the remaining three batches.

Managed public cloud run
[`30048474438`](https://github.com/codingmachineedge/bambu-build/actions/runs/30048474438)
processed the 13 Release objects one by one and reported **13 compressed, 0 kept
raw, and 0 failed**. The Release still retains all 13 raw originals beside the
13 verified compressed assets, for **26 assets** and historical raw fallback.
The real Changes UI then pushed manifest/workflow commit
[`712ad85f92f9002474f0f13b6bb6991153d586af`](https://github.com/codingmachineedge/bambu-build/commit/712ad85f92f9002474f0f13b6bb6991153d586af).
Verifier run
[`30054805137`](https://github.com/codingmachineedge/bambu-build/actions/runs/30054805137)
passed all 8,305 files, ten pointers, and 26 assets and published immutable
Release
[`bambu-build-verify-30054805137`](https://github.com/codingmachineedge/bambu-build/releases/tag/bambu-build-verify-30054805137)
with its 5,489-byte manifest asset (SHA-256
`234e88a446073d59c293e40966b6cbcfa080e21467fe14df840452d0c04694b3`).

A fresh real-UI clone at exact `712ad85` restored all ten working files to the
manifest SHA-256 values (**10/10**) while their committed Git objects remained
370–514-byte pointer blobs. The first explicit **Materialize all** overlapped
clone/open automatic materialization and reached two hash-identical
compare-and-swap recovery copies. Integrity remained correct, but that overlap
was not accepted; it prompted repository-scoped serialization of automatic and
manual materialization.

The repository-scoped correction passed **29/29** focused queue and UI tests;
the wider four-suite Cheap LFS pass immediately before the final progress
plumbing was **108/108**. Coverage includes a real disposable-Git concurrency
regression in which automatic, individual, and Materialize-all requests target
the same checkout. The test
proves one download, FIFO queue release, exact-request cancellation ownership,
fresh pointer re-listing under the lock, and no rejected-tail poisoning. The
initial real-UI clone remains the GUI receipt; a second multi-gigabyte overlap
rerun was not claimed because the user requested immediate publication and
worktree cleanup.

Cleanup followed remote proof of exact handoff commit `a64c1cb54c`. All six
completed Desktop Material task tips were ancestors of `origin/main`; their
clean linked worktrees and merged local branches were removed, the default
checkout was fast-forwarded, and the repository finished with only clean
`main`, no stash, and zero divergence. The older unstaged run-manifest draft
contained no exact receipt token absent from the pushed final manifest and was
therefore dropped as superseded. In `codingmachineedge/bambu-build`, both sets
of locally materialized payloads were size- and SHA-256-proven against all ten
committed pointers before restoration; its default checkout now equals
`712ad85`, and its merged manifest worktree/branch were removed. The empty
headless desktop was closed, and the two owned temporary evidence directories
were moved to the Windows Recycle Bin, so they remain recoverable. The unrelated
`BambuStudio/.claude/worktrees/recursing-kepler-58a6c3` checkout was preserved.

Historical initial integration commit
[`c3db37ea5524b91f9603151ae5d1107205f16a59`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c3db37ea5524b91f9603151ae5d1107205f16a59)
and responsive source `513c5cc96a` are both ancestors of corrective `c22e29a03a`.
That correction replaces the 7–8 px/22 px compact overrides with readable
9–16 px text, 30–34 px controls, a 52 px row, a wrapping localized disclosure,
and three-column metrics. Its widened 800×560 combined gate covers the exact
125% case (768×528 CSS) that the earlier 760×520 gate missed. Exact-source
build, four-scale geometry/keyboard proof, original-pixel review, capture
promotion, cloud compression, CI, CodeQL, Pages, and installer Release
publication are complete. The newer repository-scoped Cheap LFS serialization
fix is covered by the deterministic concurrency regression above. The promoted
live inventory frame documents the real ten-pointer UI, while the separate
fresh-clone manifest proof documents the 10/10 restored bytes.

## 2026-07-23 cross-lane automatic updater recovery

Commits
[`241cc90ce90f240bad075edac7ebe43eea515df8`](https://github.com/Ding-Ding-Projects/desktop-material/commit/241cc90ce90f240bad075edac7ebe43eea515df8)
and
[`04246fdf12c09446b88d2f40130581d603131c8e`](https://github.com/Ding-Ding-Projects/desktop-material/commit/04246fdf12c09446b88d2f40130581d603131c8e)
moved automatic and Super Express packages into one Squirrel-monotonic
`z<9-letter-base-26-run-ID>` namespace. The alphabetic payload retains GitHub
run ordering without triggering the installed NuGet comparer's 32-bit overflow
on modern decimal run IDs.

Exact-source
[CI `29977738533`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29977738533)
and downstream
[Build Installers `29978844761`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29978844761)
succeeded for `04246fdf12c09446b88d2f40130581d603131c8e`. The latter published
six-asset Release
[`v3.6.3-beta3-zadtberjmv`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-zadtberjmv).
A live installed `3.6.3-beta3-s000000000201` build automatically selected,
downloaded, and applied its 311,110,425-byte full package; the installed
`packages/RELEASES` and the following check both reported `zadtberjmv`.

For a visible UI receipt, successful
[Super Express run `29980281736`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29980281736)
published and promoted the greater same-SHA Release
[`v3.6.3-beta3-zadtbhvdfc`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-zadtbhvdfc).
On the isolated off-screen legacy process, **Check for Updates** changed from
the reproduced stale **latest version** state to **Downloading update…**, then
to **An update has been downloaded and is ready to be installed** with
**Quit and Install Update**. Squirrel independently recorded
`localVersion=3.6.3-beta3-zadtberjmv`, downloaded the `zadtbhvdfc` full package,
wrote its app directory, repointed the execution stub, and finished. The
accepted 960×660 capture is 49,195 bytes with SHA-256
`a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d`.

![Historical legacy Super Express installation with a newer alphabetic-z update ready at immutable source commit 923dbb51acad8f01f01f1c100c6945c7a2e08e23](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/923dbb51acad8f01f01f1c100c6945c7a2e08e23/docs/assets/screenshots/auto-updater-update-ready.png)

The detailed fail-closed, remote, package, log, headless-desktop, and cleanup
receipt is in
[`docs/verification/auto-updater-version-order-2026-07-22.md`](docs/verification/auto-updater-version-order-2026-07-22.md).

## 2026-07-23 Cheap LFS registry storage and automatic push batching

This continuation is integrated, locally build/UI accepted, and remotely
published through corrective source `c22e29a03a`. Its exact-source cloud, CI,
CodeQL, Pages, and six-asset installer Release receipts are recorded above. The
subsequent repository-scoped materialization serialization correction remains
inside this overall task but does not borrow those earlier remote receipts.

Cheap LFS commit preparation now keeps a compact terminal-style panel directly
below Commit. It reports sanitized active paths, hashing/preparation/upload/
verification phases, per-file and aggregate bytes, and completed/failed counts.
The persisted **Upload up to three large files at once** toggle defaults on and
limits Release or OCI transfers to three; disabling it restores sequential
work. The Changes filter can isolate files strictly over 100 MiB. A per-file
upload failure removes that raw path from the current commit but leaves it
selected for retry; successful pointers and unrelated safe changes may commit,
and an all-failed selection creates no empty commit.

**Repository settings → Build & Run → Large-file storage** now selects a
published GitHub prerelease, GHCR, or Docker Hub. New Release buckets are real
published prereleases, not drafts, and exact older Desktop Material drafts are
published in place after revalidation. The progress panel also computes a
byte/capability recommendation without changing the saved provider: ordinary
Git at or below 100 MiB, Releases for one transfer totaling at most 1.5 GiB,
private-source GHCR for a larger eligible GitHub.com batch, Docker Hub when it
is locally configured, and Releases when no registry setup is detected. These
signals do not prove live quota, billing, organization policy, or service
health.

The concrete user report in
[`codingmachineedge/lowlevel-computer-use-mcp`](https://github.com/codingmachineedge/lowlevel-computer-use-mcp)
was repaired without rewriting Git. Remote `main`
`f2edfe442555cfe35a519dd0b058986cb09d6ee3` contains the 166-byte pointer for
`software/docker.exe`. After revalidating tag `assets`, release ID `357437469`,
its one uploaded asset ID `486745803`, exact size `638124464`, and provider
digest `sha256:a5b5837542f2f57fadbb09db90a60c84f8efc0a65f8d6dcd2e5b9fca3a2b87e6`,
that exact legacy draft was published in place as a non-draft prerelease. The
four unrelated empty same-tag drafts were left untouched. The stable public
asset is now available from the
[`assets` prerelease](https://github.com/codingmachineedge/lowlevel-computer-use-mcp/releases/tag/assets).
The source repository currently contains only `.github/workflows/pages.yml` and
has no Cheap LFS compression run, which proves why cloud compression never
started. The updated app will create the managed
`.github/workflows/cheap-lfs-cloud-compression.yml` caller in Changes when that
public repository is opened; by design it is not silently committed or pushed,
so the user must review and commit that one workflow before compression can run.

GHCR and Docker Hub each use one logical `<source-name>-cheap-lfs` OCI package
with stable tag `desktop-material-cheap-lfs-v1`. A complete current snapshot is
bounded to 4,096 objects, 8,192 layers, and 8 MiB each for canonical config and
manifest JSON. Add or remove inside those proof bounds uploads only new content-
addressed chunks, verifies a new immutable manifest, creates and verifies its
deterministic retention tag, moves the stable tag, and rewrites current pointer-
form files to that digest while
preserving verified materialized raws and their valid older pointer metadata.
Historical retention tags are not deleted. It cannot mutate or append to an
existing manifest or timed-out layer; unchanged and already accepted blobs are
reused, while a timed-out object is reprepared at half the prior layer bound
down to an 8 MiB floor. New chunks start at 1.5 GiB, safely below GHCR's
documented 10 GB layer limit, and each GHCR ORAS process times out below the
provider's ten-minute boundary. Docker Hub has no hard layer-size or upload-
time limit encoded; current plan, pull, storage, abuse, and fair-use rules
remain external provider policy.

Same-provider updates retain the exact package coordinate already named by the
committed/index-aware pointer inventory, including Docker Hub organization or
collaborator namespaces. Only a first Docker publish defaults to the current
credential username. GHCR-to-Docker or Docker-to-GHCR migration refuses unless
every old pointer is an exact unedited materialized raw; it re-hashes those
bytes, performs no old-provider pull or delete, publishes a fresh full snapshot,
then rewrites the pointer-form paths. Mixed logical targets, same-provider
relocation, pointer-form migration inputs, and edited raws fail before publish.

Verified-private repositories encrypt every OCI chunk with AES-256-GCM. The
shared key is intentionally committed at
`.desktop-material/cheap-lfs-registry-key-v1` so authorized private-repository
collaborators can restore it. This protects payloads from a registry-only leak;
it does not protect them from anyone who can read the private repository, an
old clone, fork, backup, or Git history. Key removal or rotation must retain old
bytes for historical immutable pointers. New private pointers bind the exact
key with `key-id sha256:...`; both canonical and legacy key paths are reserved
from pin/remove operations. Required-key staging overrides ignore and selection
state, proves the final commit-tree bytes, and safely rolls back a hook-damaged
commit. Credentials remain operation-scoped:
GHCR uses the selected GitHub.com account and Docker Hub uses the trusted Docker
Desktop credential helper, passing a token to ORAS through standard input and
clearing it afterward. A first public GHCR package is refused before upload
because GitHub creates it private and exposes no supported visibility-change
API; use Releases, Docker Hub, or an existing exact-linked public package.
GitHub browser sign-in now requests `write:packages`; the account-scope audit
offers reauthorization for older tokens, while destructive `delete:packages`
remains excluded. GitHub's OAuth scope page describes `write:packages` as
granting package upload/download, but its Container registry page separately
says Packages supports PAT classic only. The selected OAuth token passed a non-
mutating GHCR challenge; no live package mutation was performed, so PAT-classic
compliance is not claimed and any provider rejection fails closed before the
stable tag or Git pointers move.

Windows builds download and verify the official ORAS 1.3.2 AMD64 archive,
executable, and license before packaging. The installer ships the Apache-2.0
text as `static/cheap-lfs/oras/LICENSE.ORAS.txt`. Both package architectures use
that audited x64 executable, so the ARM64 package depends on Windows 11 x64
emulation and fails closed if it cannot start.

The default-on clone/open detector now scans Release and OCI pointers before it
requires a selected Releases account. Explicitly public GitHub.com Release and
public OCI pointers can materialize while signed out. Anonymous Release reads
omit `Authorization`; Release mutations and private/unknown reads stay account-
gated. Private OCI pointers fail closed without matching credentials and the
tracked key. Updated Desktop Material repairs an old pointer-only clone by
reopening it or by choosing **Large files → Materialize all**. Original bytes
remain in Release assets or immutable OCI layers, and verified temporary bytes
replace the working-tree pointer atomically only after size, digest, source
identity, visibility, and (when applicable) GCM checks pass.

Ordinary Git commits now stay below a decimal **1.5 GB (1,500,000,000-byte)**
push ceiling by using a 1.4 GB changed-blob budget and bounded path/proof
overhead. The app forms stable path batches, creates one commit, records a
durable branch/remote/path intent and pending-commit ref, pushes it with ordinary
fast-forward rules, proves that exact commit as the same remote tip, and only
then creates the next commit. Intent-to-pending and final cleanup are atomic two-
ref transactions. No later commit exists after a failed or ambiguous push;
retry reconciles the exact intent and resumes the pending push before new commit
work. A required tracked private-registry key is promoted into batch 1 and
included in the byte/path/proof budget exactly once. Push also inspects local-
only commits made by
older app versions. Existing individually safe commits are pushed and proven
one at a time without changing their SHA, author, timestamps, message, or
signature before any new working-tree batch is created; a currently pending
batch bypasses that legacy rewriter. An individually oversized commit can be
rebuilt only on a clean, linear local-only branch with an exact configured or
resolved destination and no Git operation. A
compare-and-swap ref below
`refs/desktop-material/commit-batch-backup/` protects the original tip. Before
the first proven push, a safe failure restores it; after a proven push, the app
never rolls the branch backward and retains the recovery ref when needed. Every
replacement batch must reproduce the expected path modes and object IDs, and a
candidate already reachable from any configured remote is never rewritten.
Rebuilding preserves the reviewed message and final tree but creates new commit
IDs, does not preserve cryptographic commit signatures, and does not promise the
original author timestamp on each replacement batch. Final tree equality and
every replacement path's exact mode/object ID are proven before success.

Every app-owned commit entry point supplies process-local `-c gc.auto=0`; no
repository/global setting is changed. The commit flow records HEAD and verifies
the new commit's object, tree, parent transition, and message. If Git exits
nonzero only after creating that exact commit (for example an unrelated
post-commit maintenance failure), Desktop Material accepts it once and shows a
maintenance warning. An unchanged, unreachable, or unexpected HEAD remains a
real failure and is never retried into a duplicate commit.

Local acceptance is recorded in the
[dated Cheap LFS commit-progress receipt](docs/verification/cheap-lfs-commit-progress-2026-07-23.md).
The initial `c3db37ea55` worktree's unpackaged production build returned `0`
after **400.46 seconds** (**404.3 seconds wall**) through Lowlevel MCP and
produced `out/renderer.css` SHA-256
`6381556b36c295ba47ad90e8080f4079cbc61951bd7811ab9cb9fc3520638cb1`.
That is retained as historical first-publication evidence; the responsive
correction's current build receipt is the 390-second `6fba1434…` build above.
The current promoted accepted frame is:

| Frame | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-commit-progress.png` | 1440×960 | 113,869 | `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333` |

The wide English receipt passed all **36/36** named assertions, including
`noBlockingDialog`, plus its deterministic one-pointer selection receipt and
contains all three worker rows. The final 640×960 bilingual receipt also passed
all **36/36** named assertions after one real pointer attempt. Its 85,175-byte
capture has SHA-256
`1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50`,
keeps the progress surface at y=942 inside the y=944 panel, and contains no
injected diagnostic style. The earlier 1,466.27-second build, 107,411-byte wide
frame, and visibility-hidden narrow failure remain in the dated receipt only as
superseded interim evidence.

The corrected companion `material-github-releases-compact.png` proof passed at
100%, 125%, 150%, and 200% in one 960×660 physical viewport. The promoted 200%
frame is 89,856 bytes with SHA-256
`8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a`.
Its 480×330 CSS viewport shows one complete 53.5 px row, 24-hour timestamps, a
wrapping bilingual disclosure, and zero horizontal overflow. All compact
scales measured the 176 px panel, 30 px target floors, 9 px text floor, and the
three-column metrics layout. Native Enter expands/collapses the tools; available
actions retain focus semantics and the no-next-page pagination control remains
correctly disabled. The gallery source now contains **77** images, including the
dedicated live Bambu Cheap LFS frame.

Release/OCI operations pass **80/80**, registry transport/runtime policy
**77/77**, disposable-Git batching **117/117**, UI/settings/localization
**157/157**, ORAS scripts **8/8**, the headless verifier contract **19/19**, and
the compact commit-shell style contract **7/7**. The full Cheap LFS folder
aggregate is deliberately reported as **261/262** because one wall-clock policy
case exceeded its 2.5-second harness budget during concurrent heavy Git work;
the isolated policy rerun passed **8/8**, including that same behavior.

These UI/build receipts are local evidence for the initial integration and its
isolated responsive correction. The final acceptance app PID `20836`, HWND
`1905774`, provider PID `16700`, hidden desktop, provider credential, ports
`52613`/`53748`, and exact owned temporary root were stopped, deleted, or proved
absent. The separately retained installed-app Bambu environment remained
untouched during that earlier checkpoint. Corrective source `c22e29a03a` later
completed exact-source cloud, CI, CodeQL, Pages, and immutable six-asset
installer publication. Bambu commit `712ad85`, cloud run `30048474438`, verifier
run `30054805137`, its immutable manifest Release, and the initial 10/10 fresh-
clone hash proof are now complete. Only the newer serialized materialization
rerun and its final promoted image remain explicitly pending above.

## 2026-07-22 Cheap LFS cloud compression implementation

Cheap LFS now has repository-local cloud compression without cloud
decompression. A generated caller pins `actions/checkout` and Desktop
Material's composite compressor to immutable SHAs, grants only
`contents: write`, and runs on pushes to the repository's default branch or by
manual dispatch. Public repositories receive automatic setup in the Large
files UI. Private repositories remain off until the user explicitly enables a
persisted setting; unknown visibility fails closed, and the workflow repeats a
live event-visibility guard.

The Action downloads Release objects directly, raw-DEFLATEs one object at a
time at level 9, and uploads a verified side asset without Actions artifacts or
caches. A strictly smaller success changes only that pointer object to the
existing v1 `part-deflate` form and pushes a `[skip ci]` commit. Mixed raw and
compressed multipart pointers are valid. Original raw assets are never deleted
because historical commits can still name them. Failed or non-beneficial
objects retain their exact raw pointer and remain cloneable; independent later
objects still run.

Desktop Material alone downloads and decompresses. Its existing bounded local
inflate path checks the recorded output cap, original per-object size/SHA-256,
and assembled whole-file size/SHA-256 before replacing a pointer. The UI labels
raw, compressed, and mixed pointers, explains the local-only boundary, and
offers English, playful Hong Kong-style Cantonese, and bilingual copy.

Focused tests exercise the real composite Action against a temporary Git remote
and fake Release API, workflow/policy ownership, public/private UI controls,
settings persistence, pointer state, failure and non-beneficial fallback,
ambiguous-push recovery, build-output-style pointer paths, bounded draft lookup,
atomic workflow replacement and link rejection, repository-switch races, and
local compressed-object materialization failures. The final combined gate
passed 134/134 tests across 25 suites; all 27 script tests, repository-wide
Prettier and ESLint, the ESLint/Prettier compatibility check, TypeScript, and
`git diff --check` also passed.

Live cloud-compression acceptance is complete in the retained repositories:

- The public production UI wrote and pushed caller commit
  [`72b2db3e0b6554364e07e5e34945c8be5c125216`](https://github.com/DingDingChae/desktop-material-cheap-lfs-public-20260722-153308/commit/72b2db3e0b6554364e07e5e34945c8be5c125216).
  [Actions run `29969707165`](https://github.com/DingDingChae/desktop-material-cheap-lfs-public-20260722-153308/actions/runs/29969707165)
  succeeded and pushed bot commit
  [`f10d8d2acedbba0e3b5ce978dff09c25217cad9c`](https://github.com/DingDingChae/desktop-material-cheap-lfs-public-20260722-153308/commit/f10d8d2acedbba0e3b5ce978dff09c25217cad9c).
- The private production UI showed cloud compression off, then recorded the
  explicit opt-in and pushed commit
  `3d398786dd4c599730e0dbb77b0c83a5fa14a57a`. Private Actions run
  `29969957449` succeeded and pushed bot commit
  `6259b0fa0dc6c65cdb5a90af8e1da9358b45b0ac`.
- Each bot commit changed only its payload pointer to `part-deflate`. The public
  and private compressed assets are each **1,033 bytes**, have stored digest
  `sha256:8d22b086820b0896bdcb33cf965ebc275cb0b5f0b4c44a364aa4144c015f9f7b`,
  and expand to the original **1,048,576 bytes** with digest
  `sha256:30e14955ebf1352266dc2ff8067e68104607e750abb9d3b36582b8af909fcb58`.
  The corresponding raw 1 MiB assets remain uploaded for earlier commits.

The first public run,
[`29967844734`](https://github.com/DingDingChae/desktop-material-cheap-lfs-public-20260722-153308/actions/runs/29967844734),
also provides the live safe-failure proof. GitHub's tag endpoint returned 404
for the draft release; the Action reported `0 compressed, 0 kept raw, 1 failed
safely`, did not rewrite the pointer or remove the raw asset, and exited failed.
The production UI then materialized that still-raw pointer successfully with the
exact 1 MiB digest above. After the bounded draft lookup correction, the public
and private compressed pointers were each materialized manually through the UI
and again produced that exact size and digest on the local PC.

Draft lookup is deliberately bounded to 100 API pages of 100 releases, or **10,000
releases**. If the exact draft tag is outside that window, the object fails
safely and remains raw. A GitHub Release also holds at most **1,000 assets**;
because the historical raw asset is retained, a full Release cannot accept the
compressed side asset and likewise stays safely raw until capacity is available.

The production bundle and all interaction ran through the fixed Lowlevel MCP
HTTP endpoint on the isolated `DesktopMaterialCheapLfsCloud-20260722-190000`
headless desktop. The accepted bilingual private-opt-in/compressed-row frame is:

| Accepted local capture | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-cloud-compression.png` | 960×660 | 105,577 | `9449e50f60cd298e9cc261e9044fc0cd93706a8e9f243dcceb88d63b6df9ab8d` |

The canonical `yarn build:prod` wrapper could not start because this fixed
environment has no `yarn` executable. No dependency was downloaded; the
equivalent existing-dependency production Webpack command compiled all five
targets through MCP in 420.6 seconds with `ok: true`, `client_ok: true`, and
`returncode: 0`. The one-time development alias and GitHub credentials were
deleted and verified absent, the production credential was restored with no
backup left behind, the exact Electron process and zero-window headless desktop
were closed, and the owned synchronized test-clone run root was removed.

Publication is complete for source checkpoint
`f7b4760a13894f0320f7b361f055f6fba40d913f`, which is pushed on `main` with a
clean zero-divergence checkout. Exact-source
[CI `29972351158`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351158),
[CodeQL `29972351173`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351173),
and [Pages `29972351147`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351147)
all succeeded. Wiki commit `407cbf260c229e9f8e7fd86062afad83e5080f63`
publishes the synchronized seven-page source, and the live Pages gallery serves
all 73 figures including the byte-identical 105,577-byte cloud-compression
capture. Downstream
[installer run `29973527338`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29973527338)
published non-draft, non-prerelease latest Release
[`v3.6.3-beta3-b0000040887`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000040887)
from that exact tag and commit with all six required Windows x64 assets. The
final source audit found only local/remote `main`, one root worktree, and no
stashes.

## 2026-07-22 live Cheap LFS public/private GitHub and UI acceptance

Live Cheap LFS protocol, history, and Desktop Material UI acceptance completed
through the configured `DingDingChae` account. Both purpose-built repositories
are retained on pushed `main` commits:

- Public:
  [`DingDingChae/desktop-material-cheap-lfs-public-20260722-153308`](https://github.com/DingDingChae/desktop-material-cheap-lfs-public-20260722-153308),
  commit `a7c90eff6a4d7963577125e3204a1b9af28da756`, release `358270369`,
  UI asset `486477022` (`payload-public-30e1495.bin`).
- Private: `DingDingChae/desktop-material-cheap-lfs-private-20260722-153308`,
  commit `e56519d4742c63bb2c9f5f1e917de3fca7379fdd`, release `358270368`,
  UI asset `486479377` (`payload-private-30e1495.bin`).

Both releases remain draft prereleases tagged `assets-test-20260722-153308`.
The original backend assets and the two UI-created assets are all uploaded at
1,048,576 bytes with digest
`sha256:30e14955ebf1352266dc2ff8067e68104607e750abb9d3b36582b8af909fcb58`.
The public UI explicitly materialized and re-pinned its payload; the private UI
materialized on open in a fresh profile and passed the same native-picker,
review, upload, and pointer-replacement sequence.

The first live UI attempt exposed two defects: GitHub's exact draft-tag route
can return 404, and an absent asset label can arrive as either `null` or `""`.
The store now performs a bounded release-inventory fallback, while the provider
model normalizes both no-label spellings. The focused Release-store and
transfer/model gates pass 17/17 and 41/41, TypeScript passes, and all five
production Webpack targets plus staging completed in 296.8 seconds.

Fresh public/private clones resolved to the exact UI commits above, retained
their earlier deterministic-pointer commits as parents, and were clean. Their
canonical five-line Git blobs are 201 and 202 bytes; Windows CRLF copies are
206 and 207 bytes. `git lfs ls-files` returned no entries, proving the test is
real Cheap LFS history rather than Git LFS metadata.

The user explicitly authorized a temporary bridge from the logged-in GitHub
CLI account to Desktop Material's development secure store. The token was not
printed, logged, placed in an argument/URL, written to source, captured, or
committed. After both isolated UI runs, the exact credential entry was deleted
and re-read as absent; the app PIDs, CDP ports, and off-screen desktops were
also closed.

Both repositories include the generated Cheap LFS logo. The canonical
documentation copy at `docs/assets/cheap-lfs-logo.png` is 1254×1254,
1,091,778 bytes, SHA-256
`34b2e68ad1e95f45cac08e3c2ee5d9981a35611d30b0deb7282a5c7fe0682a2f`.
The accepted UI capture at
`docs/assets/screenshots/cheap-lfs-ui-acceptance.png` is 1200×752, 79,404
bytes, SHA-256
`8f53ed803dc7415ca86e4399040201afbbd627718a48e4a453e637099fa03684`.
Full evidence is in the
[dated verification record](docs/verification/cheap-lfs-github-public-private-2026-07-22.md).

## 2026-07-22 command palette rows, tab groups, Alt reliability, and release gates

The published baseline at `7edca120c5` introduced rich command-palette rows,
appearance controls, the first tab-group data/actions, and its accessibility
follow-up. That exact SHA is on `origin/main`; [CI `29895625564`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29895625564)
and [code scanning `29895625583`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29895625583)
passed. [Build Installers `29896993449`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29896993449)
published the non-draft, exact-target Windows release
[`v3.6.3-beta3-b0000040881`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000040881)
with all six required non-empty installer/feed/portable assets. Those receipts
prove only that baseline; they do not verify the continuation below.

The current continuation makes tab groups real, visible strip controls. One
named/color-coded chip appears before each group's first member with a count,
chevron, accessible expanded state, and active-group marker. Clicking the chip
or pressing Enter/Space hides or restores the member tabs; focus and a localized
status announcement return to the chip when a mutation removes the focused tab
from view. Group creation, context actions, color names, chip descriptions,
success/failure announcements, and accessible names now follow English,
playful Hong Kong-style Cantonese, or bilingual mode.

Persistence now retains `groups` through open, single-close, bulk-close,
session-import, per-window serialization, legacy-primary mirroring, reload, and
unknown-field round trips. Malformed/duplicate group records are repaired at
the profile boundary. A group can contain pinned tabs or unpinned tabs, never
both: a cross-boundary move is a no-op, preserving the invariant that every
pinned tab precedes every unpinned tab. Portable version-1 tab-session exports
deliberately strip `groupId` and do not export profile-local group definitions;
import preserves the destination profile's groups rather than creating dangling
memberships.

Group ordering is normalized as one contiguous block at load and after every
structural mutation. Manual movement within the block keeps membership; moving
a member outside the block ungroups only that tab. Label, opened-time,
repository-status, and favorite arrangements sort whole blocks by their first
member, and malformed cross-pin input degrades incompatible later members to
ungrouped tabs rather than splitting one group across the boundary.

The command palette keeps its 760px shell, 520px result area, leading icon,
title, optional keyword line, and group chip. The title/search/empty state,
stable group labels, row search-term prefix, anchored appearance editor, and
the Ollama/Copilot/background-queue discoverability entries now follow all
three language modes. Search retains English and localized keys. Escape closes
only the appearance editor and restores its toggle focus; density and row-part
choices remain persisted and safely repaired.

Windows bare-Alt handling is now an isolated state machine: one uninterrupted
bare press toggles once, held repeats remain part of that press, and Alt plus
another key, Shift/Ctrl/Meta, prevented events, modal transitions, orphaned
repeats, or out-of-order key-up events cannot leave stale state for a later
toggle. Every Alt release consumes its pending sequence and clears the menu
highlight path. This is covered as a deterministic keyboard-state contract;
current end-to-end headless interaction evidence has not yet been recorded.

At this July checkpoint, the manual **Super Express Release** lane ran the
complete unit and script suites before its production build/package. That
test-before-build contract was explicitly superseded on August 2 by the
owner-directed zero-test emergency lane recorded later in this handoff.
Release pull requests continue to target the Windows product's `main` default
branch.

**Local continuation acceptance is complete; publication is pending.** The exact
unpackaged production build passed through the fixed Lowlevel MCP endpoint in
394.1 seconds with `client_ok: true`. An isolated off-screen run restored the
named group after relaunch, collapsed it to a selected `role="tab"` chip,
expanded it again, and confirmed the member was visible. The same run opened
the fully contained command-palette appearance editor, kept Reset visible, and
returned five Ollama matches.

| Accepted local capture | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-tab-groups.png` | 1000×687 | 94,467 | `fd857137f71b79fbef65225e4469f2d2e3d95ecb6701e4847b84da11ad2875b8` |
| `docs/assets/screenshots/material-command-palette-appearance.png` | 1000×687 | 99,234 | `ac4db2aa3696d2e1987c0c93573ccf48f86c61111e42fcabf0cec54db3b87a7d` |

README, Pages, the User Guide, and the 73-scene Guided Feature Gallery now
reference the two inspected synthetic-only captures plus the separately
accepted raw and cloud-compression Cheap LFS UI frames. Implementation checkpoint
`58be6fe5953477b015a134c414a8cf82363ecc75` is pushed on `main`; exact final
CI/code scanning, Pages/wiki publication, and installer Release receipts remain
required.

## 2026-07-22 mobile Pages, documentation search, and regenerated gallery

The published Pages site is now usable on a phone. The top app bar previously
hid every navigation link below 760px, leaving Install/Features/Screenshots/
Docs unreachable; a hamburger control now discloses the same links as a
stacked sheet with 48px targets, and a 480px breakpoint collapses the feature,
footer, and principle grids to one column without page-level sideways
scrolling. The rendered documentation template gained a sticky, wrapping
header, a search field, and a compact type scale.

`site/docs-search.html` publishes as `docs/search.html` and searches every
rendered page from a `search-index.json` built by `site/build-search-index.js`
during the Pages workflow (137 pages locally). Search accepts plain text or a
regular expression with match-case and whole-word options, highlights up to
three excerpts per page, guards zero-length matches, reports invalid patterns
instead of throwing, and mirrors state into the URL. A regex builder composes
contains/starts/ends/exact/any-of/all-of patterns with an optional quantifier
plus six ready-made snippets, previews the pattern, and applies it to the
query. The builder was exercised in a browser: `(?:cheap lfs|pull request)`
and `\b(?:timeout)+\b` both compile.

Screenshot regeneration ran against a fresh production build on an isolated
profile with the deterministic loopback GitHub provider and Ollama fixtures.
52 distinct canonical captures were promoted (50 replacements plus the new
`material-repository-folder-detection` and
`material-repository-submodule-management`, both added to the Feature-Gallery
catalog, the Pages gallery, and their two count assertions, now 69). Two
captures were withheld because they were byte-identical to another surface
(`material-api-app-functions` matched the API explorer;
`material-notification-bulk-actions` matched the notification centre), so the
previously published images for those two remain in place rather than
publishing a duplicate as a distinct feature. Thirteen further canonical
scenes could not be made deterministic in this run and their existing images
are unchanged: error-notice, app-identity, history-power-tools, remote-manager,
logo-studio, submodule-context, rebase-review, pull-request-compose,
pull-request-open, pull-all, history-deepen, history-deepening, merge-all, and
cheap-lfs-preparing. They need the additional submodule/shallow-clone/remote
fixtures rather than the base P0 fixture, and `material-pull-preview` and
`material-ollama-model-manager` are outside the canonical set. No scene is
reported as renewed unless its file actually changed.

## 2026-07-22 Cheap LFS 1.5 GiB parts, no upload timeouts, Pages-hosted docs

Cheap LFS release uploads kept failing near the 2 GiB asset ceiling, so
`CHEAP_LFS_PART_SIZE_BYTES` now plans new parts at 1.5 GiB while the pointer
parser still accepts legacy parts up to exactly 2 GiB. Release-asset uploads
no longer apply any stall or total-runtime timeout by default on either the
GitHub CLI or Electron compatibility transport: a transfer ends only on
completion, transport failure, or user cancellation. Tests keep injecting
explicit `stallTimeoutMs`/`maximumRuntimeMs` values to exercise the watchdog
paths, and the pointer contract test now pins the legacy 2 GiB parse bound
independently of the upload cap. Feature and User Guide documentation were
updated to match.

The GitHub Pages site now hosts the complete rendered documentation set. The
Pages workflow installs pandoc, renders every `docs/**/*.md` (README files as
folder indexes) plus the root project documents through
`site/docs-template.html` with `site/md-links.lua` rewriting `.md` and
wiki-style links, and the site's Docs/Read-the-docs/Documentation links point
at the hosted `docs/` index instead of redirecting to the GitHub wiki. The
render loop was executed locally with pandoc 3.10 (137 docs pages plus root
documents) and one page was visually verified. Local verification: 142
passing tests across site accessibility, CI workflow safety, release
transfer, cheap-lfs, and pull-preview contract suites, plus repository-wide
TypeScript no-emit and Prettier on changed files. Remote CI, the Pages
deploy, and the express release are post-push verification items.

## 2026-07-21 pull preview moved to right click on the toolbar Pull button

A plain left click on the toolbar **Pull _remote_** button now performs the
pull directly via the dispatcher; the reviewed pull-preview dialog opens only
from a right click on that button (wired solely to the pull-state button) or
from the application-menu **Pull** action, which is unchanged. The
pull-preview contract test was updated to pin the new routing, and the
feature doc, docs index, wiki User Guide, and Feature Gallery now describe the
click/right-click split. Verified locally with the pull-preview contract suite
(5 passing tests), repository-wide TypeScript no-emit, and Prettier on changed
files. Remote CI and release publication occur after push.

## 2026-07-21 reviewed pull previews

Ordinary pulls now open a reviewed Material dialog before mutating the current
repository. The implementation freezes the local/upstream refs and full OIDs,
ahead/behind counts, effective `pull.rebase`/branch rebase/`pull.ff` plan, and
bounded incoming commit/file summaries. Confirmation revalidates that identity,
strategy, and a freshly read clean worktree, then integrates the exact reviewed
OID. Unsafe, stale, detached, conflicted, dirty, failed-fetch, busy, and
fast-forward-only-blocked states fail closed. The dialog is globally modal and
non-dismissible while Git runs, with persisted English, playful Hong Kong-style
Cantonese, and bilingual copy.

Local verification on implementation source `b86b4618d3` passed 92 focused
tests across 24 suites, TypeScript no-emit, changed-source ESLint/Prettier,
`git diff --check`, and the exact production command
`npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
through Lowlevel MCP (exit 0; 625.37 seconds). The fixed MCP checkout was
`ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`.

The app was exercised on the uniquely named off-screen Win32 desktop
`DesktopMaterialPullPreview-b86b4618` against a synthetic clean repository.
The review showed local `6692f0306cb38b794ed44d910f32f554134aeff0`, upstream
`c5543728717b5029acc9b80c901dd22f6fcdc343`, `0 ahead`, `2 behind`, a
fast-forward plan, two incoming commits, and three changed paths. Confirming the
dialog advanced HEAD to the exact upstream OID with `+0/-0` and no worktree
changes. The inspected client-only screenshot is 960×660, 62,882 bytes, SHA-256
`cbbfc9876ded7366aca8532a7d685fed4a959453c1ccfd1845f4dc7fc408895`, at
`docs/assets/screenshots/material-pull-preview.png`; it is nonblank, unclipped,
and contains synthetic data only. The validated Electron PID, hidden desktop,
and containment-checked fixture root were removed and confirmed absent.

The feature was replayed onto the latest remote baseline in an isolated publish
worktree because another active task had unrelated edits in the shared checkout.
Those edits were left untouched. Remote CI, Pages, installer/release, and live
wiki synchronization are post-push verification items.

## 2026-07-21 CI lint newline repair

GitHub CI run
[`29879526652`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29879526652),
Lint job `88797062810`, failed only during the repository-wide Prettier check:
`opencode.json` had no final newline. The configuration values and permissions
were already valid, so the repair adds only the missing newline and does not
change OpenCode behavior. On the exact failing source plus this repair, the
full CI-equivalent `yarn lint` command passes Prettier, the
ESLint/Prettier-compatibility check, and repository-wide ESLint. Remote CI and
installer publication remain pending until this commit reaches `main`.

## 2026-07-21 final pull-preview, Cheap LFS, and stale-overlap CI checkpoint

Reviewed pull previews now gate execution on fresh repository status, retain an
atomic raw strategy/configuration snapshot, and parse changed-file output as a
bounded stream. A busy sentinel and phase-locked modal prevent refresh, close,
or footer actions from racing an active pull; accessible state and the footer
remain synchronized with the exact phase. The privacy-safe reviewed
pull-preview screenshot was accepted at 960×660.

Cheap LFS cancellation now opens an explicit confirmation instead of stopping
the operation immediately. The GitHub CLI fallback streams the exact source,
uses 1 MiB chunks to reduce renderer progress traffic, verifies the streamed
digest, bounds retry, and reconciles the Release inventory before retrying so
an ambiguous prior upload is never duplicated or deleted. Authentication,
proxy authentication, cookies, and Basic credentials are redacted from bounded
CLI diagnostics.

The manual browser handoff now stages only regular, nonempty files. It uses a
verified same-volume hardlink when possible and otherwise a bounded copy; it
never exposes a symlink that Explorer or GitHub can interpret as an empty
`.symlink` file. Multipart files remain actual regular parts. Existing uploads
with the exact expected size and digest count toward progress and capacity, so
a partial manual upload can resume with only missing objects. Digestless legacy
assets receive bounded download/hash verification before reuse. Every reuse is
revalidated against a fresh complete Release inventory, followed by a final
inventory fence before any pointer is published.

The pre-integration Cheap LFS gate passed **189/189**, with the manual staging
and partial-resume subset passing **23/23**. After rebasing onto the final remote
baseline, the expanded Cheap LFS/Release selection passed **207/207** and the
pull-preview selection passed **81/81**. Root TypeScript, configured targeted
ESLint, targeted Prettier, feature-document markdownlint, and
`git diff --check` are green on the merged tree.

Express Installer hotfixes `98bd712f2f` and `484ebc0210` separate stale overlap
from genuine CI failure without dropping a successful Release. Every successful
exact target publishes its own immutable Release even after newer commits
overtake it. Creation is always non-latest; only a freshly revalidated current
`main` target is promoted, and a mid-promotion branch advance triggers verified
demotion. The flow deliberately avoids GitHub's lossy shared concurrency queue.
A real failed upstream CI still preserves the artifact while the workflow
remains failed. The focused workflow contract passes **8/8**.

Release
[`v3.6.3-beta3-s000000000201`][release-s201]
was already published from `fa4806971c` with all six required assets. That is
the verified installer-release baseline, not a claim that the later hardening
batch has published. The user explicitly requested that completion not wait on
future CI, and explicitly skipped the GitHub Projects board; neither is a
remaining acceptance gate for this batch.

[release-s201]: https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-s000000000201

## 2026-07-21 final Git topology cleanup

Feature tip `5c0fec2381` was verified byte-for-byte as the remote `main` tip
before cleanup. Every remaining local and remote topic-branch tip was proven an
ancestor of that pushed default branch. Eight merged local topic branches and
four merged remote topic branches were then deleted without force; the two
temporary CI worktrees had already been removed after their own remote proofs.
`git worktree prune` leaves only the clean `main` checkout, the stash list is
empty, all initialized submodules are at their recorded commits, and local
`main` has zero divergence from `origin/main` at this checkpoint.

## 2026-07-21 printenvz Windows install-stage repair

The install stage failed building `vendor/printenvz` with
`LINK : fatal error LNK1117: syntax error in option 'opt:lldltojobs=2'`.
Node >= 24 Windows headers ship `enable_thin_lto=true` and `lto_jobs=2` in
`config.gypi`, so the bundled `common.gypi` Release config injects
clang/lld-only flags (`-flto=thin`, `/opt:lldltojobs=N`) into every gyp
target; MSVC `link.exe` rejects them. `vendor/printenvz/binding.gyp` now
forces `enable_lto=false`, `enable_thin_lto=false`, and `lto_jobs=""` on
Windows through gyp's conditions-inside-variables pattern, the only scope
that survives `config.gypi` include merging and still applies to
`target_defaults` Release conditions (target-level variables are evaluated
too late, and plain top-level variables are overwritten by includes).
Verified with the exact failing step (`node-gyp rebuild` in
`vendor/printenvz`): `build/Release/printenvz.exe` links and runs, and the
generated `printenvz.vcxproj` no longer contains any `-flto`/`lldltojobs`
options. No cleanup of branches, worktrees, or stashes was needed; the
untracked `opencode.json` predates this task and is intentionally left
uncommitted.

## 2026-07-21 Settings clone queue and mobile connection checkpoint

The durable automatic-clone policy now has a first-class **Settings → Clone
queue** destination. One card per signed-in hosted account hydrates the saved
base directory, parallel/sequential mode, and enabled state. A folder is
required before enabling; changing the directory or mode while enabled updates
the same policy immediately. Discovery still establishes a baseline and checks
every five minutes, queues only newly discovered repositories, uses the existing
three-wide/one-at-a-time modes and durable batch journal, and never opens an
unsolicited progress dialog. The page does not expose the Agent API's fixed
eight-running/64-waiting request bounds as user settings.

**Settings → Agent access** now keeps a localized **Mobile connection** card
visible in every mode. Local or stopped states explain the required recovery;
when Paired LAN mode is running, **Open mobile connection page** first replaces
any existing pairing code, then hands the fresh five-minute one-use `/connect`
URL to the default browser. Its secret stays in the fragment, is not logged or
sent to the site server, and a browser-open failure reports only a generic
localized error.

Focused Queue, Agent access, and Settings registration coverage exercises
policy hydration, directory choice/validation, enable/disable and clone-mode
dispatch, fresh-link generation, unavailable states, browser failure, and all
three language modes. The responsive inventory includes the new Settings page.
Exact-source TypeScript/lint/format gates, production build, Lowlevel MCP
off-screen interaction and screenshot acceptance, remote CI, Pages/wiki sync,
Release verification, and final topology cleanup remain separate acceptance
steps and are not claimed by this checkpoint.

## 2026-07-21 manual multipart Cheap LFS and express release checkpoint

The browser-assisted Cheap LFS fallback no longer rejects a file merely because
it exceeds GitHub's per-asset size limit. Planning first stats the complete
batch, fails before expensive hashing when projected parts exceed one Release's
1,000-asset cap, streams whole/part SHA-256 values, allocates one bucket with
room for the complete batch, and reserves collision-safe names. A large source
becomes ordered `.partNNN` files in the private handoff folder using 1 MiB
bounded range copies. Small sources retain symlink, hardlink, then bounded-copy
fallbacks. Hash and copy callbacks are time-throttled before they reach the
renderer, the preflight reserves the worst-case copy fallback plus verification
space, and Unicode/Win32 case variants cannot collide in the flat folder.

The existing single action opens the exact Release editor and the prepared
Explorer folder. Polling remains cancelable for roughly six hours, backs off to
30 seconds, scans the bounded paginated inventory once per attempt, accepts
only new uploaded IDs with exact names and sizes, downloads
and hashes every part sequentially, then rehashes every source before writing
any pointer. A version-2 handoff manifest records original nested paths and all
flat asset ranges. Materialization uses the bounded preview when sufficient and
otherwise caches the complete paginated Release inventory before resolving
pointer parts, so assets beyond the preview page are not reported missing.
Subfolders remain encoded in each tracked pointer; they
do not need matching Release folders.

`Build Installers / Express Release` keeps the automatic successful-main-CI
path and adds a manual main-only fast path whose Linux lint, Windows x64
trampoline/unit/script tests, and Windows x64 build/package jobs run in
parallel. A failed or cancelled main CI still runs the package lane for a
recoverable Actions artifact but cannot publish. The package job
uploads the exact ZIP/EXE/MSI/Squirrel payload as a three-day uncompressed
artifact before release-note generation and publication. The publisher
revalidates current main and tag
absence, then uses one create-only `gh release create --notes-file` call. A
deterministic package-version-plus-commit-count tag prevents reruns from
inventing a second release for the same source commit.

The shared CI setup action restores only an exact installed-dependency
cache keyed by platform, target architecture, toolchain, manifests, lockfiles,
install configuration, post-install logic, and local vendor inputs. It includes
Playwright's external FFmpeg payload; Python setup remains unconditional. Cache
hits and cold installs validate package sentinels before use or cache save;
misses retain bounded install retries. Build output,
installers, Release payloads, credentials, and runtime configuration are not
cached. Focused Cheap LFS, UI, workflow-safety, setup-action, and release-note
tests currently pass **72/72**. Remote CI, cache-hit
timing, live multi-gigabyte browser upload, and Release publication remain
external verification rather than claims in this checkpoint.
## 2026-07-21 responsiveness, resource lifecycle, and CI handoff

The lag, hang, and retained-resource implementation is integrated through
`2a2742796bdf65fc8562b317dcb73423bff9aa30`. The final task branch is rebased
onto the concurrent clone-queue/mobile-settings work at `fa4806971c`; its two
task commits update the temporary-submodule build-fix guard contract and make
wide anchored appearance editors use their intended 780 px shell without
changing the compact 390 px fallback.

The focused Git/process gate passes **30/30**, the changed-test/Pages/wiki gate
passes **84/84**, the complete UI directory passes **815/815**, and the full
all-files run passes **1,491/1,492** with one intentional skip and zero
failures. After the later release, CI, and settings integrations, the combined
Cheap LFS/release/workflow/guard/responsive-editor gate passes **83/83**.

The fixed Lowlevel MCP checkout remained clean at
`ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`. App-source candidate
`aabb111d2c01f38e7535ab077048816a5ad16893` completed the required no-download
production build; all five Webpack configurations compiled successfully and
the build finished with `Done in 1178.13s`. The later `fa4806971c` app feature
arrived while that build was running, so the pushed-SHA Windows CI result is the
required final integrated build proof.

The first off-screen screenshot candidate was rejected during final visual
audit because the 780 px repository-toolbar editor was clipped by its 390 px
anchored shell. The shell-width defect is now fixed and covered by a responsive
style contract. The rejected PNG is not published; the tracked gallery image
remains unchanged, and a fresh final-source recapture is follow-up evidence.
All owned Electron processes, loopback listeners, and headless desktops from
the rejected run were closed.

Remote CI proved the Playwright cache validator fix on Windows x64, packaged
E2E, and arm64. The remaining x64 failure was exactly the stale
`runOpencodeFix` source assertion corrected by this branch. A concurrent
`opencode.json` merge then added a missing-final-newline lint failure; this
handoff formats that file as well. Exact pushed-SHA CI, installer, and Release
verification remain pending.

## 2026-07-21 remote discovery hard-total-bound follow-up

The responsiveness correction is rebased additively onto
`910f7de5be3b577e4492d65c1162fcea962d7652`. Remote default-branch discovery
still receives five seconds, including proxy environment preparation. If that
deadline aborts an owned Git process, process-tree termination receives one
final five-second grace window. The advisory post-fetch lookup therefore has a
ten-second hard settlement bound even when taskkill/SIGKILL completes without
an observable child `close`. Its termination promise receives a rejection
observer as soon as abort starts, including after the caller's bounded wait has
ended. Clone cancellation continues to use the unbounded strict-close barrier.

Repeated environment preparations for the same exact URL and resolver now
share one in-flight system proxy promise. A timed-out caller can stop awaiting
without starting duplicate unresolved operating-system work; success or failure
evicts the entry and authentication environment assembly remains per operation.
Electron exposes no abort signal for proxy resolution, so one permanently
stalled entry can remain for each distinct URL until resolution or restart.

The Windows helper audit found only the existing environment-derived
`SystemRoot` pattern (and equivalent `WINDIR` guesses) in this Node/Electron
codebase, not an authoritative `GetSystemDirectoryW` binding. The correction
therefore preserves the existing realpath/type/basename/containment validation
and `C:\Windows` fallback instead of substituting a different guess. Independent
Windows-installation-directory authentication remains a defense-in-depth item.

Deterministic focused coverage passes **30/30**: injected never-settling and
late-rejecting terminators, the normal cleanup barrier, same-URL proxy
coalescing and eviction, and clone's unchanged strict termination barrier join
the existing remote-HEAD/account/clone tests. The exact rebased changed-test,
Pages, and wiki set passes **84/84**. Root and script TypeScript, changed-source
ESLint and Prettier, categorized feature Markdown, and diff integrity pass on
the same tree. This local checkpoint claims no push, CI, package, wiki
deployment, or Release.

## 2026-07-21 temporary submodule viewer and dialog-wheel checkpoint

The changed/new submodule commit card no longer calls the permanent
`openOrAddRepository` path. It resolves the clicked absolute checkout back to a
currently declared submodule, rejects relative or unrelated paths, and enters
the existing validated `SubmoduleRepository` path. That model remains absent
from the repository database, Recent, tabs, and last-selection persistence and
keeps the established read-only mutation/process boundary.

The manager and diff card now say **Open temporary viewer** instead of promising
normal repository management or commits. English, playful Hong Kong Cantonese,
and compact bilingual resources explain the read-only/no-import boundary. The
temporary context bar adds a visible, accessible, responsive **Close viewer**
action beside the customizable Back control. Both use the same guarded return
path, which disposes temporary caches and restores the persisted parent.

The shared dialog shell now routes wheel and trackpad gestures from any
descendant to the nearest vertical owner with remaining range. Nested lists and
editors consume their own range, an owner at its edge lets the outer body take
the next gesture, preventing controls and `Ctrl`+wheel retain ownership, and a
background floating dialog still requests front through the existing stack.

Local verification passed **103/103** checks: 67 temporary-viewer,
localization, and Pages contracts plus 36 existing dialog/responsive/style
regressions. Root TypeScript no-emit, targeted ESLint, targeted Prettier, and
`git diff --check` passed. The fixed Lowlevel MCP endpoint at
`http://127.0.0.1:8765/mcp` timed out during `startup_status`; the visible
desktop was not used as a fallback. Therefore this checkpoint claims no exact
production build, off-screen screenshot, remote CI, or release. After rebasing
onto `d6dd74b9d761f3b384788af8b2a8889213017d4b`, all six changed test files pass
**46/46**; root TypeScript and exact changed-file ESLint, Prettier, Markdown,
and diff gates also pass.

## 2026-07-21 Cheap-LFS CLI-first crash containment and direct manager

Production Release-asset uploads now try the trusted, exact-length GitHub CLI
transport before Electron. This prevents the reported fatal `mojo result not
ok: 9` path when a validated `gh.exe` is available: Electron's native chunked
upload data pipe is never opened for that attempt. GitHub CLI credentials remain
isolated, progress stays bounded, and cancellation/quit still tears down the
owned child process. The memory-bounded Electron uploader remains only as the
compatibility path when the trusted CLI cannot be resolved.

The repository rail now has a direct, localized **Large files** destination.
Its Cheap LFS manager lists committed pointers from nested folders, searches by
path, pins reviewed files, materializes one or all objects, and owns a stable
vertical scroll region. Users no longer need to locate or decode assets in the
GitHub Releases catalog. The existing Release editor plus flat temporary-folder
handoff remains available for explicit browser recovery; its manifest still
maps every asset back to the original repository-relative path.

The manager, repository-section mapping, scroll contract, and all three language
modes pass **48/48 focused tests** across six suites. This checkpoint does not
claim a live multi-gigabyte upload or final packaged-app visual receipt.
## 2026-07-21 CI update-coming-soon and exact-SHA Release notes checkpoint

The updater now distinguishes “no release yet” from “GitHub Actions is actively
building or packaging a newer commit.” After Squirrel reports no update, a
bounded unauthenticated provider probe derives only the configured HTTPS GitHub
release feed and reads exact `ci.yml` plus `build-installers.yml` run data. It
accepts only an in-progress main push CI run or workflow-run/manual-dispatch
installer run under the expected workflow path. Bounded job data must also
prove that run's exact `Windows x64` build/packaging job is in progress for the
same run ID and SHA. GitHub's compare endpoint must then prove that exact SHA is
ahead of the installed exact `__SHA__`; equality, behind/diverged state, malformed
data, a non-GitHub feed, network failure, and rate limiting all retain the
ordinary no-update state.

The accepted state is the new in-memory `UpdateComingSoon` enum and is never
stored. About renders **New update coming soon**, **新版本就快焗好出爐**, or the
compact bilingual composition from the existing persisted language preference.
The ordinary last-check timestamp remains compatible. An update-transition
generation prevents a delayed Actions/compare result from overwriting a real
Squirrel available/downloaded event, and the check button plus existing
four-hour schedule continue to use the normal release feed after publication.

`Build Installers` now checks out full history at the same exact
`RELEASE_TARGET_SHA` already protected by the initial and pre-publication main
checks. A new TypeScript generator reads the latest published Release through a
256 KiB authenticated response, resolves its tag, requires ancestry and exact
`HEAD`, collects at most 50 newest exact commit IDs/subjects in the range, and
caps the final body at 24,000 characters. Subjects are whitespace/control
normalized, limited to 180 characters, and neutralized for Markdown, HTML, and
mentions. The notes expose the exact range and commit links, report omitted
history, preserve the update-feed explanation, and reach the single release
action through `body_path`; mismatches fail before publication.

CI, installer, and Pages now make the overlap contract explicit: each invocation
has a unique `run_id`/`run_attempt` concurrency group and
`cancel-in-progress: false`. A newer run therefore cannot cancel active work or
replace GitHub's single older pending slot. The workflow source contract scans
every YAML workflow to reject `cancel-in-progress: true` and any declared group
that omits either uniqueness component. Release notes are generated before the
final main/tag revalidation, keeping that fail-closed check immediately adjacent
to the single publish action.

Focused updater, persisted-state, race, English/Cantonese/bilingual,
non-cancelling workflow concurrency, exact Git range, sanitization, bound, and
first-release checks pass **35/35**.
Root app TypeScript and script TypeScript pass. The implementation has not been
pushed or exercised by remote Actions, so no CI run or sample published Release
is claimed. The fixed low-level MCP preflight passed after its stalled scheduled
task was restarted, but the mandated no-download production-build command could
not start because this host has no `yarn` executable; no headless GUI capture is
claimed. Integration must preserve the exact workflow filename and include the
generator, workflow, runtime, tests, feature docs, wiki, Pages, roadmap, and this
handoff together.
## 2026-07-21 Codex CLI support for Build & Run repair

Build & Run's existing OpenCode repair path now also supports the Codex CLI.
The failed-build and free-form send dialogs expose the same provider selector,
persist it per repository, and retain a separately gated per-run auto-approve
choice. Settings exposes both preferences. New labels and guidance use English,
playful Hong Kong Cantonese, and compact bilingual resources.

The installed `codex-cli 0.144.0` help was inspected directly before the runner
was written. Detection uses shell-free `codex --version` and `codex login
status`. Execution uses the supported stdin form:

```text
codex --ask-for-approval <on-request|never> exec --sandbox workspace-write \
  --disable hooks --ephemeral --ignore-user-config --ignore-rules \
  --color never -
```

A local parser dry run of that complete option prefix with `--help` exited 0;
putting `--ask-for-approval` after `exec` exited 2. A second installed-CLI probe
confirmed that `--disable hooks` disables the stable hooks feature and
`--ignore-rules` is accepted. The exact root-option order and flags are locked
into the pure and runner tests.

The child `cwd` is the repository root. Neither the repository path nor prompt
enters argv. A selected nested profile directory is lexically validated to stay
inside the repository, capped at 1,024 characters, and included in stdin only.
Failed-build output is capped at 4,000 characters, free-form input at 8,000
characters, captured detection output at 8,000 characters, and each streamed
line at 16,000 characters. Both providers retain the existing bounded
dialog/panel buffers and application-owned shutdown barrier. Operations are
owned by the exact renderer `WebContents`; duplicate IDs are rejected, foreign
cancellation is ignored, owner navigation/destruction aborts and awaits the
process tree, and panel **Stop** fences the verification rerun. Codex never
receives the dangerous sandbox-bypass flag.

`--ignore-user-config` skips the user's base config, `--disable hooks` disables
lifecycle hooks, and `--ignore-rules` skips user/project execution-policy rules.
An inert installed-CLI probe also established that `mcp_servers={}` does not
clear MCP servers contributed by trusted project `.codex/config.toml`, and
Codex CLI 0.144 exposes no verified blanket MCP-disable switch. Project Codex
configuration therefore remains an explicit repository trust boundary; the
integration does not claim MCP isolation.

Missing Codex installs show `npm install --global @openai/codex` behind explicit
consent. Missing authentication points to `codex login` in a terminal and
states that Desktop Material does not request or store secrets. Agent completion
never establishes success: the dispatcher still runs the selected Build & Run
profile again unless the operation was cancelled.

Verification from the isolated `codex/codex-build-fix` worktree based on
`2a2742796bdf65fc8562b317dcb73423bff9aa30`:

- focused Codex/OpenCode, ownership, cancellation, repository-identity,
  localization, IPC, shutdown, settings, panel, and dialog tests passed
  **115/115**;
- root TypeScript `--noEmit` and script TypeScript compilation passed;
- changed-source ESLint and Prettier passed; and
- the categorized feature guide/index and `git diff --check` passed.

The README, categorized feature documentation, roadmap, local wiki sources,
Developer Guide, User Guide, and Pages source now describe the feature and its
safety/failure contract. A packaged production UI run, screenshot acceptance,
default-branch integration, remote CI, wiki/Pages publication, and release proof
remain pending. This branch is intentionally committed without push or merge so
the coordinating agent can integrate it with the other July 21 worktrees.

## 2026-07-21 Cheap-LFS recovery, output controls, and portable-ZIP checkpoint

This earlier checkpoint removed two misleading Cheap-LFS progress states from
the compatibility Electron path. A two-minute no-forward-progress watchdog
aborts its owned request, and the transfer reserves 100% until an exact provider
response or reconciled asset proves GitHub accepted the object. The later
CLI-first checkpoint above prevents that native data pipe from opening whenever
the trusted GitHub CLI is available.

A stalled request now retries automatically through a fixed `gh api` transport.
HTTP 411 also selects that exact-length path because GitHub requires
`Content-Length` while Electron needs chunked mode for memory-bounded
multi-gigabyte requests; HTTP 502 selects it because the failed native request
may have left an asset in `starter`. Each reconciliation scans at most the ten
100-object Release pages once, then polls only the discovered asset ID. An exact
uploaded name, label, size, and digest is reused, while a persistent incomplete
object fails closed without clobbering or deleting it. A failed CLI process gets
one post-failure reconciliation in case GitHub committed the upload before the
transport error.

The fallback resolves only the real `Program Files\GitHub CLI\gh.exe`, uses no
shell, and supplies the selected account token only through a scrubbed child
environment and one temporary empty `GH_CONFIG_DIR`. Inherited GitHub
credentials/debug state, prompts, update checks, telemetry, spinner, and color
are disabled. The exact validated source range streams through stdin while its
SHA-256 and progress are calculated; stdout/stderr, no-activity time, and total
runtime are bounded. Cancellation terminates and awaits the owned process, and
the temporary configuration root is removed. Application quit now stops
accepting Release transfers, aborts all active native/CLI work, and waits for
their completion through the existing owned-process shutdown barrier. Missing
CLI, failed CLI, and incomplete-asset results have localized English and playful
Hong Kong Cantonese recovery text; bilingual mode composes both. The explicit
browser/Explorer drag-and-drop handoff remains available when the user chooses
manual recovery.

The Build & Run panel now exposes a one-shot **Scroll to bottom** action,
persisted **Auto-scroll output**, and persisted **Truncate long lines**. Reading
older output automatically pauses auto-scroll; enabling it again jumps to the
tail. Truncation is display-only: the full line remains in the DOM and **Copy all
output** retains the original text. Both toggles expose pressed state and all
three names use the English, Cantonese, or shared bilingual translation path.

Windows packaging now creates `dist/GitHub Desktop-x64.zip` from the complete
packaged application tree before building the Squirrel outputs. Native Windows
`tar.exe` streams a ZIP64-capable archive to `.partial.zip`, lists it to reject a
truncated/corrupt result, requires non-zero size, then promotes it atomically.
The release workflow collects that ZIP beside the EXE, MSI, update manifest, and
NuGet packages and treats a missing or empty ZIP as a publication failure. This
also makes the same portable output available from a local Windows production
build and `yarn package` if remote CI is unavailable.

Verification is deliberately recorded by subset rather than as one unrun total:

- transfer plus localization passed **34/34** (21 transfer and 13 i18n) after
  the watchdog, CLI, reconciliation, error-copy, and shutdown changes;
- Build & Run UI, style, and localization passed **42/42**;
- portable-ZIP and CI workflow contracts passed **11/11**; and
- root TypeScript no-emit, script TypeScript, and the applicable focused
  ESLint, Prettier, and diff checks passed at those checkpoints.

The combined Cheap-LFS, transfer, output-control, style, localization, workflow,
and portable-ZIP gate passed **165/165** across 18 suites. A complete local
production package has not yet run. Therefore this checkpoint does not yet
claim a full-size local ZIP/installer, an exact production-build receipt, remote
CI, or a published release containing the ZIP. Those receipts must be appended
after they exist.

## 2026-07-21 Cheap-LFS 0% transport repair and manual Release handoff

The automatic Release-asset upload's 0% deadlock was traced to Electron's
`ClientRequest.write()` contract: it returns `void`, while the old pump treated
that value as Node backpressure, paused the source, and waited for a `drain`
event Electron never emits. Commit `c4403f2a0faf6e96fb53be3c5a9f4587f4a219c7`
now advances the stream from Electron's write callback and reports accepted-byte
progress. It was fast-forwarded to `origin/main`; [CI 29853767664](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29853767664),
[CodeQL 29853768026](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29853768026),
and [Build Installers 29855717704](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29855717704)
all passed. The exact commit is published as non-draft release
[`v3.6.3-beta3-b0000000266`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000000266)
with the canonical/full x64 NuGet packages, x64 EXE, x64 MSI, and `RELEASES`.

The follow-up manual fallback is implementation-complete. **Manual upload** is
available beside **Cancel** only during an automatic upload. It stops that
attempt, plans every remaining file as one collision-safe batch, splits sources
above the Release limit into ordered `.partNNN` assets, and creates a random
`upload-these-files` handoff. Whole files use symlink, hardlink, then a bounded
streamed-copy fallback; multipart ranges use bounded 1 MiB streamed copies. It
opens the validated exact GitHub Release editor
before bringing Explorer to the front, and polls for the user's drag/drop
upload. GitHub Release assets are flat, but the manifest and pointers preserve
every original repository-relative subfolder; duplicate basenames receive
hash-suffixed asset names. Only newly created exact-name/exact-size asset IDs
are accepted. Every asset is downloaded and SHA-256 verified, every source is
rehashed before any pointer is written, and the original commit resumes
automatically. Explicit cancel is distinct from account/repository aborts.
Every multipart part counts toward the 1,000-asset bucket cap and remains in one
release with its logical file.

A later live multi-gigabyte attempt exposed a separate 1%/out-of-memory failure:
Electron buffers a `ClientRequest` body internally when chunked encoding is not
enabled. The upload adapter now removes the conflicting `Content-Length` only at
the Electron boundary and enables `chunkedEncoding` before the first write. The
validated byte range still bounds every read and progress value, while Electron
can release streamed chunks instead of retaining the complete asset in process
memory. The focused transfer suite proves the flag is already active on the
first write, the length header is absent, authentication/type headers survive,
only one source chunk is in flight, and the exact range reaches the request.
Commit `e90f1765017892a857cc6d4ecad791b122c03412` is on `origin/main`; its
[CI run 29858326644](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29858326644)
passed lint, Windows x64 tests/package, Windows arm64 package, and packaged x64
E2E.

The same repair now enforces GitHub's 1,000-asset Release capacity as a complete
repository-local bucket family: `assets`, `assets-2`, `assets-3`, and later
exact tags. All ten 100-item pages are inventoried. An automatic multipart file
or complete manual batch is allocated as one group, so a group that would cross
the remaining slots moves intact to the next Release and every pointer,
refresh, rollback, handoff, and verification uses that selected tag. A group
above 1,000 is rejected before hashing or per-file I/O. Provider objects still
in the `starter` state count toward capacity and name collision checks but are
shown as processing and cannot satisfy manual detection, upload success,
download, or materialization. Exact single-release JSON remains bounded at
8 MiB so a legitimate 1,000-record response fits; list responses keep their
smaller 2 MiB boundary.

Rollover acceptance covers 998 existing objects plus a two-part file staying in
the base bucket, 999 plus two parts moving together to `assets-2`, the matching
two-file manual case, exactly 1,000 objects across ten capped pages, pre-I/O
1,001 rejection, and `starter`-to-`uploaded` polling. The expanded related
suite passed **165/165**; after the final audit added rejected-asset cleanup and
wrong-tag refresh guards, its focused transfer/operations rerun passed
**34/34**. TypeScript no-emit, scoped formatting, and diff validation also pass.

Local acceptance passed **104/104 focused tests** across the transfer pump,
cheap-LFS operations/automation/manual flow, GitHub Release parsing/API/store,
asset download, and commit UI. TypeScript no-emit, scoped ESLint, scoped
Prettier, and `git diff --check` passed. The exact low-level-MCP production build
(`RELEASE_CHANNEL=development`, `DESKTOP_SKIP_PACKAGE=1`) returned
`client_ok: true` after 840.62 seconds. The resulting app launched on the
uniquely owned `DesktopMaterialCheapLfsManual20260721` off-screen desktop with
only a synthetic Git fixture and isolated user data. Its 960×660 client capture
was nonblank, unclipped, light-themed, private-data-free, and SHA-256
`4267b4e51261c170ee994b70696080207f4df1f47f13488d55f025f525e537b3`.
The server's generic resize/close helpers could not resolve their own headless
HWND; the exact saved Electron PID was therefore terminated as the documented
fallback. The window list reached zero, the desktop closed, and the validated
Temp run root was removed. No public screenshot was promoted.

No live browser drag/drop was performed; direct draft/GHES editor routes,
pagination, pre-existing-ID exclusion, basename collision handling, remote and
source corruption, cancel cleanup, and link/copy fallbacks are deterministic
unit coverage. During final verification the user's still-running visible app
was read-only inspected and found to be build `b0000000256`, started before the
repair was published. It therefore cannot contain either the `b0000000266`
transport correction or this follow-up manual fallback; the visible process was
not closed or replaced by the verifier.

## 2026-07-21 — lag, hang, and resource lifecycle hardening

This milestone is implemented in the isolated
`codex/fix-lag-hangs-20260721` worktree. It started from
`c4403f2a0faf6e96fb53be3c5a9f4587f4a219c7`; the primary checkout's unrelated
dirty feature set remains preserved and untouched. Concurrent upstream work
advanced through `41ce24d6b8`, `e90f176501`, and `09b3a0ee89`; this task is
rebased onto `09b3a0ee89f520621f0db6be077f0ab70b2b4221` without overwriting it.

### Proven defects and fixes

- Upstream issue
  [desktop/desktop#22039](https://github.com/desktop/desktop/issues/22039)
  records a roughly 10-second fetch followed by repeated 365–371-second
  `git remote set-head -a` calls on a very large ref inventory. Desktop Material
  now validates and reuses an existing local remote-HEAD symref during
  background refresh only while its target exists. A user-initiated fetch
  refreshes the remote default with the selected account and a five-second hard
  bound, detecting a rename even when the old branch remains. Missing,
  dangling, malformed, empty, and cross-remote background values retain exactly
  one authenticated discovery.
- `PopupManager` intentionally de-duplicates popup types, but concurrent
  askpass calls previously created a second promise without a second visible
  prompt, leaving that caller unresolved forever. `TrampolineUIHelper` now
  serializes host-key, key-passphrase, SSH password, generic Git credential, and
  GitHub sign-in prompts through a non-poisoning FIFO. Manager de-duplication,
  explicit removal, and stack eviction now settle promise-backed popups; a
  removed sign-in flow also clears its retained store callback. A deliberate
  contextual replacement now settles the old popup owner exactly once with a
  `replaced` reason; sign-in replacement preserves global state for the new
  owner while an ordinary removal still resets it.
- Appearance sliders could enqueue hundreds of full ownership checks,
  crash-safe file writes, state emissions, and local-Git work in one gesture.
  `DedicatedSettingStore.set()` now coalesces adjacent synchronous calls into
  one latest-value mutation while keeping queued `get()` reads, flushes, and
  history actions as ordering barriers. Sequential awaited writes and the
  250-millisecond commit debounce retain their prior semantics.
- Failed/cancelled Electron requests ended at `onErrorOccurred`, but the
  same-origin filter deleted request IDs only from `onCompleted`. It now removes
  either terminal path, preventing process-lifetime map growth while preserving
  cross-origin authorization stripping.
- `SandboxedMarkdown` registered its document scroll listener in capture mode
  but removed it without the capture flag. Unmount now performs matching
  removal, cancels pending debounced scroll work, and clears iframe document and
  frame references.

### Current local evidence

- The combined remote-HEAD, prompt FIFO, appearance-store, and same-origin gate
  passes **27/27** tests. The real-DOM Markdown lifecycle regression passes
  **1/1** after 25 content reloads and verifies that a post-unmount scroll no
  longer invokes the component.
- The exact rebased branch passes **79/79** focused tests across Git routing,
  popup management, trampoline prompts, appearance-store coalescing,
  same-origin cleanup, and sandboxed-Markdown lifecycle. Root TypeScript also
  passes on that exact source; targeted ESLint/Prettier and diff validation pass
  on the correction.
- Each implementation lane also passed full app TypeScript, targeted ESLint and
  Prettier, and `git diff --check` before integration.
- The pre-change full unit run completed 1,593 passes and one intentional skip;
  its only failure occurred before app code because Strawberry OpenSSL pointed
  at missing `Z:/extlib/_5040x__/ssl/openssl.cnf`. The final exact-source run
  uses Git for Windows OpenSSL and its present configuration rather than
  suppressing that test.
- Exact rebased-source full tests, the required no-download production build
  through low-level MCP, off-screen Windows interaction/capture, final diff and
  secret review, push, CI, Pages, wiki, installer release, and topology cleanup
  remain pending. No publication success is claimed yet.

## 2026-07-21 Screenshot renewal — 58 of 66 delivered

**58 of 66 gallery screenshots were recaptured from the shipped Material UI**
and promoted (commits `dc40ffb316` renewing 57 and `bf86e6c6a3` renewing the
welcome screen). Every promoted image passed the driver's per-capture privacy
and dimension gate (synthetic fixture only; no home/profile/Temp/credential or
user repository content) and shows the full Material Design 3 UI with Material
Symbols iconography.

Getting there required reconciling the codex capture driver
(`.codex/verification/capture_gallery_cdp.js`, committed in `dc40ffb316`) with
the migrated UI: a `vt` helper injected into every renderer evaluation to read
visible text with aria-hidden Material Symbol ligatures excluded; rail
navigation and the functions-first API surface; and a `--resilient` mode that
banks every scene that renders and reports any it cannot. A real product
privacy fix also landed (`7b319f92d8`): the settings history diff no longer
exposes local paths.

**Not renewed this pass (existing Material-era images kept, low marginal
value):** `material-ollama-model-manager` (its scene needs a Copilot-enabled
provider plus a separate Ollama server via `--ollama-run-root`);
`material-app-identity-workspace` (React-fiber appearance reload times out);
`material-repository-logo-studio` (logo-studio portal timing);
`material-create-pull-request` and `material-native-pull-request`
(`pull-request-open` deepens and removes the shallow boundary, which also
cascades to the clone/pull scenes); `material-pull-all-account-fallback`,
`material-shallow-clone`, `material-shallow-clone-safe`, and
`material-clone-account-fallback` (clone-dialog / batch-sync state after that
shallow-boundary mutation). These need targeted per-scene fixture/state work or
the extra Ollama+Copilot fixture stack; they were left rather than shipping a
broken or non-deterministic capture.

Earlier attempt notes retained below for provenance.

The full gallery renewal against the shipped Material UI was attempted end to
end. Everything except the driver's assertions works: fresh production build
(`out/main.js`/`renderer.js` at `main` tip `148b297f2b`, 231s), deterministic
fixture + loopback provider (53 runs, 31 artifacts, releases/issues/branch
rules), disposable keychain credential, hidden Win32 desktop, Electron launch
with CDP, and canonical capture. Five images captured cleanly at 1440×960 —
`material-welcome`, `material-workspace-changes`, `material-history`,
`material-history-context-actions`, `material-branches-sheet` — with all four
Material fonts (Roboto/Roboto Mono/Roboto Serif/Material Symbols Rounded)
reporting `loaded` and light/english state verified. A diagnostic capture of
the Repositories sheet confirms the shipped UI is correct (Sync repositories,
Commit & push all, Add all present and unclipped, Material Symbols rendering).

**Blocker (well specified):** `.codex/verification/capture_gallery_cdp.js`
matches UI elements by raw `element.textContent.trim()` in ~20 spots across 85
scenes (e.g. the `repositories-sheet` assertion at ~line 2769). The Material
Symbol migration renders glyphs as `aria-hidden` font **ligatures**, so a
button's `textContent` is now e.g. `"syncSync repositories"` instead of
`"Sync repositories"` — the driver's label match fails and the strict canonical
run aborts (`CAPTURE_EXIT:1`) even though the UI is correct.

**Fix spec:** add a visible-text helper the driver can inject into its CDP
evaluations — clone the node, remove `[aria-hidden="true"]` descendants
(this excludes `.material-symbol`), then read `textContent.trim()` — and use it
in place of raw `textContent.trim()` at the 20 label-matching sites (leave
content-reading sites, e.g. diff text, on raw `textContent`). Then re-run the
canonical, audit-design, and responsive passes and promote byte-for-byte with
the privacy/dimension gate. This is best fanned out (helper + per-site edits +
re-run) once subagent capacity is available. Per policy **no partial gallery
was promoted**; the existing `docs/assets/screenshots` set is unchanged.

Capture teardown is complete: app and provider processes stopped, keychain
credential deleted, disposable Temp run root removed. One empty headless
desktop (`DesktopMaterialShots20260721`) could not be removed via the MCP
`remove_headless_desktop` tool (returns a TaskGroup error); it holds no windows
or processes and clears on MCP server restart.

## 2026-07-21 Backend handoff for Codex

Division of labor (user-directed 2026-07-21): Claude owns the frontend
(`app/src/ui/**`, `app/styles/**`); Codex (GPT 5.6 Terra Ultra) owns the
backend (`app/src/lib/**`, `app/src/main-process/**`). The items below were
found by an adversarially-verified bug hunt over the pushed `main` tip
(each confirmed by a 3-lens majority). They are backend and are **left for
Codex** — not fixed by Claude.

1. **`wip-title-nondraft-parse-throws` (high)** —
   [gitlab-merge-request-json.ts:355](app/src/lib/gitlab-merge-request-json.ts:355)
   with `DraftTitlePrefix` at [gitlab-merge-request.ts:338](app/src/lib/gitlab-merge-request.ts:338).
   `draftState()` throws `invalid-response` when a title carries the legacy
   `wip:` prefix but the provider reports `draft=false`/`work_in_progress=false`.
   On GitLab ≥14 `WIP:` is ordinary title text, so a non-draft MR titled
   `WIP: …` deterministically breaks the whole MR list/dialog. Fix: trust the
   declared draft/work_in_progress booleans as authoritative; never throw
   because a legacy title prefix disagrees (drop `wip:` from the draft-prefix
   regex, or treat the prefix as non-authoritative when a boolean is present).

2. **`scheduled-automation-survives-repository-switch` (medium)** —
   [app-store.ts:3156](app/src/lib/stores/app-store.ts:3156). `runScheduledCommitPush`/
   `runScheduledPull` check `selectedRepository === repository` once, then
   `await _refreshRepository` (and `isMergeHeadSet`) and proceed without
   re-checking. A repo switch during that await lets an auto commit+push (or
   pull) run against the deselected repo — a durable remote side effect. Fix:
   re-validate selection after each await (and before commit/push/pull), or
   thread a cancellation token from `AutomationScheduler.stop()` into the
   in-flight callback.

3. **`gitlab-mr-mutation-success-reported-as-canceled` (low)** —
   [gitlab-merge-request-store.ts:364](app/src/lib/stores/gitlab-merge-request-store.ts:364).
   `run()` calls `assertContextCurrent()` after the mutation already resolved
   server-side; an accounts-update mid-flight makes a completed create/update
   report as canceled. Fix: a server-confirmed mutation should report success
   (or "succeeded, refresh") rather than a spurious cancel.

4. **`hardlink-publish-fails-on-exfat-fat-network-share` (medium)** —
   [github-release-asset-download.ts:147](app/src/lib/github-release-asset-download.ts:147).
   `publishWithoutOverwrite()` installs assets via `fs.link` and only tolerates
   `EEXIST`; exFAT/FAT/network-share targets (the cheap-LFS large-binary case)
   don't support hard links, so publish fails fatally. Fix: fall back to
   copy+rename on `EXDEV`/`EPERM`/`ENOTSUP`/etc.

5. **`stale-guard-readopts-superseded-live-run` (medium)** —
   [build-run-store.ts:231](app/src/lib/stores/build-run-store.ts:231).
   `onState()`'s stale guard only drops events from a superseded run once that
   run is terminal, so late non-terminal events from a still-live superseded
   run (e.g. an opencode fix running after a new run started) are re-adopted.
   Fix: reject events whose `runId !== activeRunId` regardless of the old run's
   phase.

6. **`replace-import-duplicate-tabs-same-repository` (medium)** —
   [repository-tabs-store.ts:790](app/src/lib/stores/repository-tabs-store.ts:790).
   `parseTabSession()`/`comparablePath()` don't canonicalize paths (no
   `..`/`.`/dup-separator collapsing), so an imported session with two
   spellings of the same repo path creates duplicate tabs. Fix: `Path.normalize`
   before deduping.

Refuted (not real, do not action): two candidates were dropped by the
verification panel. One frontend bug from the same hunt —
`anchored-editor-capture-escape-preempts-nested-overlays`
([anchored-appearance-editor.tsx:207](app/src/ui/appearance/anchored-appearance-editor.tsx:207)) —
is **owned by Claude (frontend)** and tracked separately.

## 2026-07-20 ultracode audit and completion wave

This section records the July 20 audit of the outstanding `codex/report-gitlab-*`
work and the completion wave that followed. No production build, screenshot,
release, or remote CI/Pages success is claimed here. Those are delivery receipts
and are recorded only once the exact pushed commit and its green remote runs
exist.

### Branch audit outcome

- Five remote branches carried the GitLab merge-request work:
  `origin/codex/report-gitlab-core`, `-fixture`, `-live-fixture`, `-ui`, and
  `-integration`. `git cherry` proves `origin/codex/report-gitlab-integration`
  is the patch-superset of the other four: `core`, `fixture`, and `live-fixture`
  each have zero commits without an equivalent already in `integration`, and the
  only two `ui` commits absent from `integration` (`57a3728085`, `2455814988`)
  are M23 Ollama commits already reachable from `main`, not GitLab work. Every
  GitLab commit on the other four branches has an equivalent in `integration`.
- The `codex/ui-design-audit-20260720` UI wave is already merged to `main`:
  merge commit `867c8662a0` is an ancestor of `origin/main`, and
  `app/src/ui/lib/material-symbol.tsx` and the bundled Roboto/Material fonts are
  present on `main`. After that merge, the minimal remaining merge set for the
  GitLab feature is `integration` alone.
- `git merge-tree --write-tree` merges
  `origin/codex/report-gitlab-integration` into the current `main` tip
  `a9abc1a561` with a clean exit and zero `CONFLICT` entries (seven files
  auto-merge without conflict). The branch adds 48 files (about 15,600
  insertions): the GitLab merge-request model, JSON parser, workspace router,
  account-bound store, native `GitLabAPI` methods, the merge-request workspace
  UI, styles, i18n entries, and unit tests, plus one `.codex/run-manifests`
  entry. It ships no `docs/features` guide, README, ROADMAP, wiki, or Pages
  documentation. This documentation pass closes that gap with
  [`docs/features/integrations/gitlab-merge-request.md`](docs/features/integrations/gitlab-merge-request.md).

### Environment-blocked items left honestly pending

Two items cannot complete in this checkout because the `LowLevelComputerUseMCP`
server and its off-screen Win32 desktop are not available here. Both remain open
rather than being reported done.

- **M25 headless production build and off-screen verification.** The
  repository-bound API-functions wave has passed focused source, style, and
  navigation checks, but the exact no-download production build and the
  off-screen UI acceptance still require the MCP build/capture window.
- **M22 66-image visual refresh.** The full synthetic-fixture screenshot
  recapture across README, Pages, and the wiki, including the privacy-safe
  collapsed anchored-editor path proof, still requires the off-screen desktop
  and remains paused.

### Completion wave contents

- **GitHub CLI push credential fallback.** A `gh`-CLI push fallback is
  documented at
  [`docs/features/integrations/gh-cli-push-fallback.md`](docs/features/integrations/gh-cli-push-fallback.md).
- **UI gap fixes** addressing the design-prototype audit, each owned by its own
  scoped agent: Material 3 switches, advanced-preference disclosures, and
  integrations cards; app-wide ripple and theme-toggle reveal animations;
  richer multi-clone details; and a tab-strip commit-SHA chip.
- **Intentional deviation:** the auto-pull-on-select default remains **off**;
  automatic pulling is not enabled by default.

This handoff records the wave's scope. Per-item build, screenshot, release, and
remote-CI receipts are added only when the exact pushed commit and its green
remote runs exist.

## Graphical edition platform support decision

Desktop Material's Electron application is Windows-only. Windows x64 is the
published installer target; Windows x64/arm64 builds, the Windows x64 full-unit
lane, and Windows x64 packaged E2E are the supported graphical product gates.
macOS and Linux Electron runtimes, packages, and E2E lanes are intentionally
unsupported. Non-Windows runners may still host platform-neutral repository
automation. On July 27 the user explicitly authorized a separate Linux-first
Python/Textual TUI; its wheel, tests, and headless terminal acceptance do not
change this Electron boundary.

The policy change has a tracked CI contract and a fresh combined-tree Windows
gate: 592 unit files ran in three batches, with 4,161 passes, zero failures,
and one intentional skip across 4,162 tests in 386.4 seconds. The 8/8 CI-policy
checks, 16/16 script tests, root/script TypeScript, formatting, ESLint, feature
Markdownlint, YAML parsing, and 13/13 wiki/catalog checks also pass.

The first Windows-only remote run, CI `29710664098`, correctly withheld a
release because the concurrently added `script/generate-wiki-diagrams.js` was
not Prettier-clean. Pages `29710664112` passed and installer run `29710722904`
skipped. The correction formats that generator without changing any generated
SVG content; the repository-wide Prettier gate and a fresh generator run pass.

## 2026-07-20 — toolbar typography and readable Releases catalog

The repository-toolbar appearance owner now includes a complete, responsive
typography surface alongside label and density controls. It supports a curated
font family, 10–20 px title size, safe hex text color, bold, italic, underline,
strikethrough, small caps, letter case, character spacing, text effect, and
left/center/right alignment with a live toolbar preview. All new copy follows
English, playful Hong Kong Cantonese, and bilingual presentation.

- Profile values can return to Material theme defaults. A repository stores a
  partial typography layer: clearing one property inherits that property from
  the profile, while **Inherit profile** clears the complete local layer. The
  existing toolbar owner retains its dedicated setting, History, undo, redo,
  restore, and exact local path.
- Legacy profile and repository toolbar documents that contain only labels and
  density remain structurally valid. New values reuse the injection-safe tab
  text normalizer, reject arbitrary CSS, remove unsupported background
  highlighting, and clamp toolbar size before CSS variables reach the body.
- Toolbar and More-surface label selectors consume only those bounded
  variables. A stable typography signature invalidates retained width
  measurements, so growing or shrinking text recalculates overflow instead of
  clipping or leaving actions unnecessarily hidden.
- The Repository Releases catalog now reserves a 420–560 px desktop list pane,
  uses larger row and control targets, and waits until 900 px before stacking.
  Its narrow fallback remains contained and scrollable.
- TypeScript passes. The combined focused gate passes 66 tests across the
  appearance model/config/coordinator/dispatcher, profile/repository editors,
  runtime theme projection, toolbar overflow, tab startup/profile races, tab
  interactions, and Releases style contracts. Targeted lint, formatting, and
  diff checks and 15 Pages/wiki accessibility/catalog checks pass. A fresh
  production build and screenshot acceptance remain with the separately owned
  combined UI audit; this checkout did not compete for its headless/MCP window.

## 2026-07-20 — tab-title appearance startup/profile-switch containment

An installed `3.6.3-beta3-b0000000240` session reached the root crash boundary
after the user right-clicked a tab title. The sanitized production log recorded
`Tab title appearance is not initialized` from the tab-history lookup while an
account/profile transition was rebuilding owner-scoped appearance stores.

- Selected-repository tab creation now waits for both the repository-tab store
  and the appearance coordinator. Existing tabs are rehydrated for the active
  profile, while a new structural tab can still open safely if appearance
  startup has not completed.
- Tab-history/path accessors return an unavailable state instead of throwing.
  The clicked tab—also when inactive—is initialized before its editor opens. If
  a profile transition is still running, the editor stays closed and the live
  status region gives localized English, playful Hong Kong Cantonese, or
  bilingual retry guidance.
- Async title loads are fenced by coordinator instance, active profile key,
  tab existence, and optimistic-edit revision. A delayed result from a signed-
  out profile therefore cannot overwrite the replacement profile or a newer
  title edit. Newer editor requests and component teardown also invalidate an
  earlier right-click request.
- The focused local regression gate passes 29 tests: seven coordinator tests,
  two runtime-wiring tests, five dedicated-tab-history/profile-race tests, and
  fifteen repository-tab interaction tests. TypeScript, targeted ESLint with
  the repository rules, targeted Prettier, and `git diff --check` also pass.
  A fresh exact-source headless production build and pushed-SHA publication
  receipts remain pending the separately owned combined UI-audit window.

## 2026-07-20 M25 — repository-bound API functions in buttons

This worktree implements the user-requested functions-first GitHub API
workflow. Eligible GitHub repositories seed five safe read functions on first
use: repository details, issues, pull requests, releases, and Actions
workflows. They are stored through the existing profile-backed named-function
registry, remain bound to the exact repository/account/provider, and run from
buttons in both the API surface and **Repository tools → API functions**.

- The API rail item is hideable per repository and restorable from Repository
  tools; the preference is renderer-local and does not change Agent API data.
- The full operation catalog and manual REST/GraphQL request builder stay
  behind **Add or edit an API function**. Existing mutation review,
  credential-redaction, response bounds, and binding checks remain in place.
- Focused source/style/navigation checks pass. The React component test could
  not load in this checkout because the shared dependency tree does not contain
  `react`; the exact no-download production build and off-screen verification
  remain pending the fixed MCP environment.
- No screenshot or public wiki/Pages image claim is made until the rebuilt
  headless app passes the acceptance gate.
- The checked-in Pages source is aligned with the functions-first wording and
  does not claim a new screenshot or remote Pages deployment.

## 2026-07-20 — organization repository Git authentication routing

- Repository-bound HTTPS Git operations now preserve the exact stable account
  key through interactive and scheduled fetch/pull/push, post-push refresh,
  refspec fetch, and remote-HEAD lookup. The credential selector is metadata
  only: no token is written to a command line, environment variable, or log.
- A missing explicit binding fails closed instead of silently selecting another
  GitHub.com identity. Legacy unbound remotes probe same-origin signed-in
  accounts, select a verified write-capable identity before a read-only one,
  and persist the successful choice. Rebinding refreshes repository metadata
  and permissions under the selected identity; unrelated Repository Settings
  saves do not bind the first same-host account.
- Local verification: 73 focused tests across 17 suites, TypeScript,
  Prettier, and targeted ESLint passed. The exact production build for
  `f21c6255bb` passed through the fixed MCP service; visual acceptance and
  gallery capture remain deferred in the separate-worktree UI-audit handoff.

## 2026-07-20 M24 — guided sparse checkout accepted locally

This is the implementation and local-acceptance receipt for the user-directed
guided sparse-checkout dialog. Final pushed-SHA CI, Pages, release, wiki, and
topology checks are delivery receipts and are not claimed by this
pre-publication section.

- Commits `83dbe4c628`, `55a94bb468`, `9ebae109ba`, `083e4a378d`, and
  `255ad0c228` develop the sheet into a persistent **Choose/Adjust/Restore →
  Review selection → Apply and refresh** workflow. Its state-aware copy
  distinguishes empty, invalid, ready, locked-review, running, and
  settled-result states. Review freezes the editor and lists every bounded
  normalized root; enabled cone mode also separates added, removed, and
  unchanged roots. Success, cancellation, and failure stay in the Apply/result
  phase until an edit or manual refresh begins another pass.
- The guide now occupies a dedicated region above the scrollable editor/review
  body, remains visible without covering content, and stacks within compact
  layouts. The 23 focused parser, Git-safety, UI-behavior, and static-layout
  checks pass, as do TypeScript, targeted ESLint/Prettier, and the 41-test
  gallery-driver contract.
- Exact application source
  `255ad0c2283dd3a86328808a373a5438526bdaec` completed the required production
  build through the exact low-level MCP server in 254.90 seconds with
  `client_ok: true`, exit code 0, and no timeout. The repository-pinned Yarn
  runtime was invoked through an owned Temp PATH shim because global Yarn was
  absent; no dependency was downloaded.
- The deterministic loopback provider probe passed API, CORS, Git, pagination,
  artifact, branch-rule, and blocked-push contracts. Two pre-input HWND frames
  were byte-identical, rendered, and nonblank before the app-native driver
  opened the production sheet and exercised Choose plus frozen Review.

| M24 promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-sparse-checkout.png` | 1452×1001 | 112,506 | `8ee7149da7eb045bcda347067dcf2d88c32a626829402c97a52df2d60b2a3576` |
| `docs/assets/screenshots/material-sparse-checkout-safe.png` | 1452×1001 | 125,413 | `d536c936e1888c5ea7712bb746ec6eac302ae204edd170ab55379455aeda6a5d` |

- Both light-theme captures were inspected at original resolution and promoted
  byte-for-byte. They contain only the neutral fixture, show no private path,
  identity, credential, token, clipping, overlap, or blank region, and never
  exposed or focused the visible desktop.
- Cleanup is complete for every M24-owned resource: the exact app PID/HWND,
  hidden desktop, provider processes, CDP/provider ports, synthetic production
  and development credential namespaces, and containment-checked Temp root are
  absent. Port 8765 and the headless build/capture window were explicitly
  released to the separate UI audit afterward.
- The 845 deleted PNGs in the nested `gemoji` checkout belong to separate audit
  activity. M24 did not stage, commit, discard, or otherwise claim that state;
  it remains exactly preserved and is excluded from this milestone's diff.
- README, the categorized feature guide/index, wiki guide/gallery, Pages source,
  roadmap, plan, handoff, screenshots, and the publish run manifest carry the
  guided-workflow evidence. The manifest contains the complete resource and
  cleanup ledger.

## 2026-07-20 M23 — complete and published

This is the live handoff for the user-directed **full Ollama model manager**
wave. Its scope is Ollama model lifecycle management only; the separate
submodule-manager and general regex-builder requests are not part of M23.

- **Settings → Copilot → Providers** now includes an **Ollama (local)** preset
  and opens a dedicated **Manage models** workspace for a saved provider.
  Health/version, installed and running inventories, search plus a running-only
  filter, selected-model details, streamed pull/cancel, copy, guarded rename,
  load/unload, exact-name confirmed deletion, and provider-model
  synchronization are implemented.
- Native management is loopback-only. The saved provider URL must use an exact
  `/v1` base on `localhost`, `127.0.0.0/8`, or `[::1]`; remote HTTP and HTTPS
  hosts, arbitrary prefixes, a saved `/api` base, embedded credentials, query
  strings, and fragments are rejected. The manager derives the loopback origin
  and calls only fixed native `/api/*` routes. Provider credentials are not
  placed in management URLs, process arguments, logs, or documentation.
- The manager preserves independent partial/unavailable states, bounds response
  and displayed metadata, aborts stale provider work, keeps pull cancellation
  scoped to the active pull, and reports a successful Ollama mutation followed
  by a failed provider save as a split outcome. All manager labels,
  confirmations, announcements, and accessible names follow English, playful
  Hong Kong Cantonese, or bilingual mode.
- Exact application source `27ffc1af7dd1223809c69ea0f72ddab369869f31`
  completed the required production build through the exact low-level MCP
  server in 213.16 seconds. The deterministic loopback Ollama exercise then
  verified endpoint health/version, installed and running inventories,
  search/filter/details, pull cancellation with rollback, completed pull,
  copy, guarded rename, load, unload, exact-name confirmed deletion, and
  authoritative provider-model synchronization.
- The accepted off-screen capture is
  `docs/assets/screenshots/material-ollama-model-manager.png`: **1452×1001**,
  **128,903 bytes**, SHA-256
  `f1735c664248cd1b10a64e672dbbab24c95dabab99a62deeaf93557145a36509`.
  Original-resolution inspection confirms the synthetic-only scene contains no
  personal path, account, email, credential, token, or user repository content.
  The verifier reports the manager, Preferences shell, and lifecycle controls
  contained above the footer, zero overlaps, `horizontalOverflow: false`, and
  `privacySafe: true`.
- Owned verification cleanup is complete: the app window, hidden desktop,
  provider and Ollama fixtures, synthetic credential, loopback listeners, and
  disposable Temp roots were removed. This receipt does not claim final Git
  branch/worktree topology cleanup, which belongs to the final integration.
- README, Pages, the feature guide/index, roadmap/plan, and the actual Markdown
  wiki sources reference that exact asset. Canonical wiki commit
  `18af0a88ed87fff019043060f537deee28844e4f` is public, and both the User Guide
  and Feature Gallery return HTTP 200 with the Ollama section and raw-`main`
  image reference. Pages run
  [`29777642060`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29777642060)
  passed; the live site and its deployed PNG return HTTP 200, and the deployed
  image is 128,903 bytes with the accepted SHA-256 above.
- Product-bearing `main` commit
  `255ad0c2283dd3a86328808a373a5438526bdaec` passed the complete Windows gate
  in [CI run
  `29778132934`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29778132934):
  lint, Windows x64/arm64 builds and packages, the full x64 unit/script suite,
  installation, and packaged x64 E2E all succeeded. Its exact CodeQL run
  [`29778132660`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29778132660)
  also passed.
- The receipt-only `main` commit containing this paragraph is the final M23
  publication SHA. Its attached exact-SHA CI, CodeQL, Pages, and gated Windows
  installer/release workflows are the final remote receipts; no follow-up
  documentation commit is needed to record them and invalidate that proof.
- Publication-source validation passes 15 focused Pages/gallery/wiki tests,
  targeted Prettier, and Markdownlint for the new feature index and guide. An
  independent audit resolved 187 local documentation/site references with zero
  missing targets, and all nine linked official Ollama API pages returned HTTP
  200. The accepted screenshot still matches the dimensions, byte count, and
  SHA-256 above after branch reconciliation.

## 2026-07-20 M22 handoff — implementation pushed; visual refresh paused

This section is the live handoff for the current user-directed wave. Do not
interpret the historical completion receipts below as proof that this wave is
finished.

- A tested fast-forward checkpoint is already on remote `main` at
  `cdedb4afb86588553a72222a729bfe4fc1e232e3`. It adds raw, release-backed
  cheap-LFS assets with verified multipart splitting, bounded parent-folder
  repository discovery, and redacted saved-host SSH clone commands. The
  checkpoint passed TypeScript and 89 focused tests against its then-current
  remote parent.
- All upstream M21/wiki/Windows-only commits were reconciled without choosing
  either side wholesale. The remaining owner-scoped appearance, commit routing,
  wider Repository Settings, temporary submodule navigation, subtree manager,
  documentation, and tests are rebased locally as `04581544cf`. The integrated
  tree passes TypeScript and 166 focused tests, including concurrent owner-store
  initialization, strict corruption recovery, repository UUID races, junction
  escape refusal, actual-element editor focus/history, auto-discovery, TGA plus
  oversized-file diff handling, temporary submodules, subtrees, and tab history.
- Every appearance owner now has one strict `setting.json`, one independent
  local Git repository, and append-only history mutations for undo, redo, and
  restore. Editors open by right-click or `Shift+F10` beside the actual profile,
  feature, repository, tab, logo, name, or Back owner. Language remains an
  ordinary preference and neither general nor repository settings contains a
  monolithic custom-visual studio.
- The Add Submodule dialog now also has a **Create remote** flow. It uses the
  selected authenticated GitHub/GHE account and loaded organization owner,
  validates repository metadata and relative path, creates an initialized
  public/private remote, and then adds its exact clone URL. A remote-create
  failure never invokes Git; if Git fails after creation, retry reuses the
  already-created remote instead of creating a duplicate. Focused UI/service/
  model/i18n tests pass.
- The collection-manager bulk-action and search-input audit is complete and
  shipped in commit `ef8623f9e3`. Two frozen registries in
  `app/src/lib/collection-surface-registry.ts` record the outcome: a
  search-surface registry that maps every real search input to its shared
  fuzzy/substring/regex control, and a bulk-action registry that lists each
  reviewed batch manager (Releases, Actions runs and caches, branches, clone
  candidates, notifications, repositories, and tags) alongside the deliberate
  one-at-a-time exclusions (submodules, subtrees, stashes, worktrees) with a
  safety rationale. The enforcing test
  `app/test/unit/collection-surface-registry-test.ts` requires every audited
  bulk manager to be implemented or explicitly excluded and fails an
  unregistered search field, and the behavior is documented in
  `docs/features/identity-and-workspace/collection-bulk-and-regex-safety.md`.
- Publication scope is now the complete 68-image screenshot set referenced by
  README, Pages, and the canonical wiki. All images must be freshly captured
  from synthetic fixtures through the exact low-level MCP server and an
  off-screen Win32 desktop, inspected at original resolution, checked for stale
  UI and private data, promoted, and verified byte-for-byte after publication.
  The central capture driver currently covers 63 images; five specialized
  scenes and three retired appearance scenes require reconciliation.
- The anchored-editor path redaction shipped in commit `ef8623f9e3`. Its visible
  label now collapses the private user-data prefix through
  `getAppearanceRepositoryDisplayPath` in
  `app/src/ui/appearance/anchored-appearance-editor.tsx`: it keeps only the
  logical owner path below `appearance-elements`, drops drive letters, user
  names, AppData, Documents, and temporary run roots, and renders a leading
  `…\` marker while Copy continues to use the exact path. Regression coverage is
  in `app/test/unit/ui/anchored-appearance-editor-test.tsx`. The still-pending
  screenshot capture must confirm no published frame contains `C:\Users\`, a
  real email, token, credential, or user repository content.
- Exact MCP build invocation is
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`.
  The first integrated run completed and produced fresh `out/main.js` and
  `out/renderer.js`; the client timed out before returning its receipt because
  the client timeout was shorter than the build. The final post-follow-up run
  must use an MCP client timeout longer than the 3600-second tool timeout and
  record the returned exit-0 receipt. Focused UI/service tests passed (83/83),
  the fake provider passed 14/14, TypeScript and full lint passed, and the
  capture/Page contract tests passed (9/9 and 4/4).
- The 68-image capture was intentionally stopped at the user's request. No
  incomplete gallery output was promoted; existing published screenshots remain
  unchanged. Resume later with the exact MCP capture workflow and complete the
  privacy/dimension audit before claiming a full visual refresh.
- Remote CI `29716801845` for the integrated M22 checkpoint failed only the
  Windows x64 unit assertion that compared a Git-reported long path with the
  same temporary directory's Windows 8.3 spelling. The correction compares both
  paths through `realpath` without changing the production setting-store path or
  Copy behavior; its focused suite passes 9/9 locally. Fresh remote CI and
  installer proof remain pending for the correction commit.
- Current topology has only local/remote `main`, no stash, and one primary
  worktree after the tested checkpoint worktree was removed following remote
  proof. Final acceptance still requires committing and pushing every intended
  change, proving every completed source tip is an ancestor of remote `main`,
  deleting only proven-merged temporary branches/worktrees, and ending at clean
  `main` with zero divergence.

## Outcome

The July 19 documentation pass adds a repo-wide visual-learning layer: eight
reproducible labeled SVG workflow diagrams (one on every canonical wiki page)
and seven generated conceptual PNG illustrations for Git, branching, conflict
resolution, rebase, stash recovery, automation, and provider-account isolation.
The SVG sources are regenerated by `node script/generate-wiki-diagrams.js`, and
all wiki image references use raw `main` URLs so the separate GitHub Wiki can
render them after publication.

The complete **M0 through M21** Material and guided Git/GitHub roadmap is shipped
on `main`; it turns audited capabilities into named, interactive app functions.
The separately guarded expert GitHub API Explorer is contextualized by the
selected repository and bound to its selected account and provider host. It
reviews mutations and bounds and redacts responses rather than acting as an
unrestricted command console.

The first four-function P0 wave is implemented, pushed, and production-UI
verified at exact source SHA `9e946fd527e5843b2fdba5de675a5476b0c80445`:
guided history deepening, native pull-request creation, Actions artifact
download/digest context, and effective branch-rules inspection. The typed
operation registry is also complete. Actions workflow-run and artifact
pagination then passed its exact production UI gate at
`0aca4420df88a0865a0223530b956209e131431d`. Attempt-aware job pagination,
exact job logs/re-runs, pending deployment reviews, and fork-run approval now
pass their production UI gate at
`2f40d8949aaa7ae4ce5418cd949c28c643da0a37`. Cryptographic artifact
attestation review/result UI, Actions cache manager, bounded Pull Request
Center, Release Manager, Issue Hub, and the named Git functions are all shipped
as the accepted M19 parity wave.

The current Pages source, README, and in-repository wiki sources are on `main`.
Pages deployment remains subject to the protected reviewed `main` promotion
path; historical branch-only publication receipts below are retained as
provenance rather than current status.

The July 18–19 temporary-submodule navigation and CI/release-hardening changes
have completed ten-pass off-screen local acceptance. Initialized children remain
temporary and return to their persisted root through the profile-customizable
Back control. The final post-build child/read-only/Back regression, later
fresh-bundle duplicate Open/Back race regression, and owned runtime cleanup are
also complete.

## 2026-07-19 advanced workflow completeness (M21)

The supplied GitHub Desktop demand brief is closed item by item in the
[30-item feature ledger](docs/features/github-desktop-demand-backlog.md). The
wave extends the existing Desktop/store/dispatcher boundaries rather than
adding a generic command console or application HTTP endpoint:

- Account-bound repository context, scalable repository filters/visibility,
  reviewed batch sync, all-ref History, and exact fork branch/SHA checkout.
- Native pull-request review and creation with bounded templates/metadata,
  comments/reviews/checks/activity context, stale-generation guards, and
  partial-success receipts.
- Selective, named, and external stash interoperability; full tag inventory,
  create/move/sign/push/fetch/prune/delete; and worktree-aware reviewed bulk
  local-branch deletion with recovery SHAs.
- Changed-file trees, persisted expanded context, structured CSV/TSV comparison,
  TGA decoding, broader editor discovery, WSL/network path handling, global
  ignores, allowlisted Git command presets, and reviewed patch import/export.
- Read-only live GitHub Projects with explicit partial/error states and a
  sanitized, size/entry/time-bounded last-known-good offline cache.

Mutation paths use typed fixed arguments rather than a shell, bind confirmation
to repository/account/ref identities, re-read live state before acting, cap
provider pagination and cached content, and keep credentials, raw provider
responses, and disposable paths out of renderer-visible receipts. Every new
surface listens to the persisted English, playful Hong Kong Cantonese, and
compact bilingual mode contract with English fallback.

### Integrated verification and off-screen acceptance

- The M21 checkpoint rebased cleanly onto upstream `fcd490f162`; a post-rebase
  audit proved the shared cheap-LFS commit path and stale-lock recovery blocks
  byte-identical to upstream while retaining all 30 workflow items. One stale
  test label was corrected from **Pull all** to the shipped **Sync
  repositories** action; no product behavior changed in that follow-up.
- The complete unit gate discovered 592 files in three batches: 4,161 tests,
  4,160 passed, zero failed, and one intentional skip across 1,053 suites.
  Script compilation and all 16 script tests passed. Repository-wide Prettier,
  ESLint, root TypeScript, feature-doc Markdownlint, and `git diff --check`
  also passed.
- Fixed MCP preflight returned `startup_status.ok=true`. Scheduled task
  `LowLevelComputerUseMCP` runs the exact venv Python from checkout
  `8d6940be6a5f6e7c37de3f73acd2259fa7651efe` with
  `-m lowlevel_computer_use_mcp.server --http --host 127.0.0.1 --port 8765`.
  The required no-download command
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
  returned `client_ok=true`, exit 0, and no timeout in 226.5 seconds, producing
  the unpackaged app in `out`. Yarn 1.22.22 was restored only from an existing
  local npm cache and delegated to the repository-pinned Yarn 1.21.1; the exact
  temporary shim/package were removed after the final gate, with no `yarn`
  command left on `PATH`.
- The deterministic fixture contained three local tags (including one
  local-only tag), two pushed tags, and one remote-only tag. The never-shown
  desktop `DesktopMaterialBacklog-20260719-175748` was created exactly once;
  launch PID `3908` resolved dynamically to HWND `50136490`. The required
  960×660 client-only pre-input capture was nonblank. Win32 accepted but
  Chromium ignored the HWND-bound click, so the documented attach-only hook
  completed onboarding, imported only the owned fixture, opened Tag lifecycle,
  and loaded the remote inventory. The prefilled Git identity matched the
  existing synthetic values, leaving the global config byte-identical at
  SHA-256 `0eda438ed46fca8f6b6e002ae5d54c6a05c9e56dbeeab3165a869a858582b9b8`.
- The promoted light capture is
  `docs/assets/screenshots/advanced-workflows.png`, 1440×960, 113,275 bytes,
  SHA-256 `4351b54c8c4af0f784b23185ed820adc1854418b3bdb68f0260a843eeb07b968`.
  It passed English-mode, exact local/remote heading, path-redaction, and
  horizontal-overflow checks. A separately inspected 960×660 dark reflow was
  76,151 bytes with SHA-256
  `2de7260d75664811a71deb9aabb2f5fb1a12a199bfb876d27b795add4793b39e` and
  also had no horizontal overflow or private path.
- Graceful HWND close failed closed as expected on the off-screen desktop.
  After revalidating the same HWND and title, only saved PID `3908` was
  terminated; the desktop reported zero windows and closed once, and CDP port
  `61929` had zero listeners. Containment-checked cleanup removed the exact
  owned run root and independently verified it absent. README, Pages, Home,
  User Guide, and the separate 65-function gallery source all reference the
  promoted capture. The application checkpoint reached `origin/main` as
  `7c98044bcebe5f65e51aee60af1036080fbd5110` while the final evidence tree was
  still being reviewed, triggering CI `29709506204`, code scanning
  `29709506207`, and Pages `29709506220`. Code scanning passed. Windows x64 CI
  found one deterministic stale test label: the assertion still expected
  **Pull all** after the shipped control became **Sync repositories**. The
  reviewed evidence commit corrects that assertion, and the complete
  4,161-test local rerun passed afterward. Pages failed before assembly because
  GitHub's Configure Pages API returned HTTP 503, not because of a source
  defect. The failed checkpoint cannot produce an installer release. The
  corrected evidence commit, raw/Pages image parity, its one uniquely tagged
  non-draft release, and separate-wiki delivery remain post-commit checks.

## 2026-07-19 owner-scoped appearance, large-file, and repository-management release

- Custom visuals no longer live in either monolithic Appearance tab. Right-click
  or `Shift+F10` on the actual visual owner opens a bounded editor beside it.
  Profile elements, feature IDs, repository elements, and individual tab titles
  each own a strict `setting.json`, an independent local Git repository, and a
  mutable History manager whose undo/redo/restore operations append audit
  commits. Language remains an ordinary separate preference.
- Repository workspaces, toolbars, tab strips, list names, and logos inherit
  matching profile owners without sharing history. A local
  `desktop-material.appearance-id` UUID keeps the five repositories stable across
  path moves. Legacy aggregate values are migration/startup compatibility only.
  The profile default logo remains reachable beside an inherited real logo.
- Large selected files over 100 MiB auto-pin before every commit entry point.
  New cheap-LFS uploads deliberately skip compression: Git's object compression
  is not a general-purpose improvement over ZIP/RAR and would add a long opaque
  pass for ISO/archive/media data. Files below the release cap upload as one raw
  asset; larger files split into ordered raw parts below 2 GiB, with per-part and
  whole-file verification during materialization. Legacy compressed pointers
  remain readable.
- Add Local Repository can perform bounded, link-safe parent-folder discovery
  and bulk add. Repository Settings is wider, manages initialized submodules
  temporarily without adding them to the saved list, anchors the Back owner's
  editor beside its preview, and embeds the full Subtrees manager.
- The in-app SSH working-copy manager supports clone/status/fetch/pull/push and
  fast-forward-only Docker deployment. The remote site advertises redacted SSH
  hosts and can request a credential-vault-backed clone without receiving a
  password or key.
- Final production build, off-screen capture hashes, unit/lint/type receipts,
  exact pushed SHA, CI/CodeQL/Pages/release/wiki proof, and branch/worktree/stash
  cleanup are recorded at the end of this section once publication completes.

## 2026-07-19 cheap-LFS commit routing fix

- Scheduled commit-and-push and multi-repository commit-and-push-all no longer
  call Git's `createCommit` directly. Both route through
  `_commitIncludedChanges`, so selected files over 100 MiB receive the same
  release-backed cheap-LFS pinning and multipart handling as the commit composer.
- The concrete `lowlevel-computer-use-mcp` reproduction contains an untracked
  7,318,016,000-byte Windows ISO. The running app entered its commit state, and
  its logs showed repeated 25–30 second full-file diff reads before the pin
  finished; the source pipeline plans four release assets for that size.
- Focused cheap-LFS behavior and entry-point regression tests cover the shared
  routing. The required off-screen production verification was preflighted via
  the exact HTTP MCP checkout at `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`,
  but the build stopped before GUI launch. The user authorized downloading the
  initially missing locked `qrcode.react` package; a second build then exposed
  pre-existing unbuilt local native packages (`desktop-notifications` and
  `desktop-trampoline`) plus their downstream type errors. No headless desktop
  was created, and no disposable fixture or user-data directory required
  cleanup.

## 2026-07-19 adaptive cheap-LFS compression (superseded for new uploads)

This intermediate implementation is retained as history. The later raw-upload
changeset disables compression for every new asset while preserving reads of
the compressed pointer records described below.

- Cheap LFS now raw-DEFLATE-compresses each release asset at maximum level
  before upload and keeps that representation only when it is at least 1%
  smaller. Already-compressed data remains a raw ranged upload.
- The backward-compatible pointer format adds `part-deflate` records containing
  original size/hash and stored size. Materialization verifies the stored size,
  expands each part into an owned temporary file, verifies every original part,
  then verifies the reassembled whole before replacing the pointer.
- Single-asset and multipart uploads share the adaptive behavior. Temporary
  compressed/expanded files are removed on success and failure. Existing v1
  raw pointers continue parsing and materializing unchanged.

## 2026-07-19 stale repository lock recovery and CI hardening

- A `LockFileAlreadyExists` notice offers **Remove lock file** only when Git's
  stderr names the affected repository's exact `index.lock`. Notices use the
  repository id in their dedupe key so recovery never retargets across repos.
- Recovery refuses active Desktop operations, recent locks, links, non-files,
  and locks that change during inspection. It quarantines by atomic rename,
  rechecks identity, and restores with a non-overwriting hard link on failure;
  an already-removed lock is an idempotent success.
- The shared CI setup action now installs the cross-compiled Copilot binary at
  the exact installed Copilot core version and retries registry installation
  up to three times. This addresses the Windows ARM64 job's floating-version
  drift and one-shot package-install failure.
- Source commit `c2c6033431` passed CI run `29705698712`, including the formerly
  failing Windows ARM64 setup/build/package job, both Windows x64 jobs, both
  macOS architectures, lint, unit/script tests, and packaged E2E smoke tests.
  Code scanning run `29705698711` and Build Installers run `29706427612` also
  completed successfully.
- SSH working copies remain under **Repository Settings → Remote**. Optional
  Docker Compose deployment targets that same host; public domain, DNS, TLS,
  reverse-proxy, and port configuration intentionally remain server-owned.
- Exact production verification later succeeded through the requested HTTP MCP
  checkout at `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`. The first exact build
  exposed missing local native outputs; `desktop-notifications`,
  `desktop-trampoline`, `windows-argv-parser`, `printenvz`, and Electron were
  rebuilt/downloaded with the pinned Node 24 runtime, after which the MCP build
  returned `client_ok: true`, exit code 0, and no timeout.
- On the never-shown desktop `DesktopMaterialLock0d8c93b0`, disposable fixture
  commit `2f4c3c4` failed against an aged exact `index.lock`; the rendered notice
  offered **Remove lock file**. Clicking it dismissed the notice, left no lock
  or quarantine, and the same UI commit immediately succeeded as `509c9ea`.
  The accepted 960×660 light client capture is
  `docs/assets/screenshots/material-error-notice.png`, 93,361 bytes, SHA-256
  `94e122b927e0be24dd040b6465f90cb8d47011b01616a1899bee3c3398a877d4`.
- The MCP checkout had no installed startup task, so verification used a
  transient hidden server from that exact checkout and port without changing
  boot configuration. The app launch PID was `48520` and its dynamically
  resolved HWND was `5244054`. Hidden-HWND resize/close failed closed; after
  revalidating the exact executable and full launch arguments, only PID `48520`
  was terminated. The desktop then reported zero windows and closed, and the
  separately revalidated transient server PID `44992` was stopped. Read-only
  Git object attributes were cleared only inside the containment-checked owned
  run root, which was then removed and independently verified absent.

## 2026-07-18 repository-page CI status

### Internationalization follow-up

- The CI status tooltip/result vocabulary, update-download progress
  accessibility text, Appearance setting label, inheritance option, and palette
  names now use a typed catalog selected from `navigator.language`.
- English, Traditional Chinese (`zh-HK` and `zh-TW`), and Simplified Chinese are
  included. Locale normalization and interpolation are unit-tested, and every
  unsupported locale falls back to the complete English catalog.
- The exact low-level MCP preflight passed at server SHA `beed66ca6ed`; its
  production Webpack build remained CPU-active but exceeded 8 GB and stopped
  making normal progress, so only that revalidated owned process tree was
  terminated. The focused 14-test set, ESLint, `git diff --check`, and the full
  repository TypeScript `--noEmit` compile all pass.

- The selected repository's branch control now shows the existing compact,
  state-coloured CI logo for the current commit even when that branch has no
  pull request. Pull-request branches retain their existing interactive badge.
- Each rendered status has a concise tooltip and accessible label, including
  successful, failed, action-required, timed-out, and in-progress states.
- The real auto-updater `UpdateAvailable` download phase now renders a thin,
  non-blocking top-edge progress bar. Electron's Squirrel-backed updater does
  not expose byte totals, so this phase is accurately indeterminate and clears
  as soon as the updater becomes ready, unavailable, or errors.
- Settings → Appearance persists an allowlisted update-progress palette. It
  inherits the active accent by default or can use blue, violet, teal, green,
  amber, or rose; reduced-motion users receive a static full-width bar.
- Focused CI status tests and repository lint pass. The required exact MCP
  endpoint was listening with the pinned startup arguments and source SHA
  `beed66ca6ed2503e6170ee1e1158247f1c2f0140`, but its streamable HTTP session
  failed during initialization; the local production build is retained as the
  fallback verification receipt for this small toolbar-only change.

## 2026-07-18 complete inbox, Docker-over-SSH, and Releases dashboard

- GitHub notifications now traverse every 50-item page instead of stopping at
  the first page or an arbitrary cap. GitHub and Local tabs expose **Clear all**
  with bounded concurrency, cancellation, partial-success retention, and
  auth/rate-limit stop conditions. The deterministic visual provider has an
  empty inbox, so the inspected GUI proves the panel and Clear all control
  render correctly; focused tests prove the complete 249-item pagination and
  mutation semantics.
- Repository Settings → Remote can save non-secret SSH working-copy metadata,
  opt a source remote into Docker Compose deployment after successful normal,
  scheduled, or Commit & Push All pushes, and run **Deploy Docker now**. The
  remote flow verifies the exact pushed branch and credential-free URL,
  requires the server checkout to match, rejects ahead/divergent state, applies
  only a fast-forward, verifies final HEAD, and then runs
  `docker compose up --detach --build`. Output is bounded/redacted, and a deploy
  failure never rewrites a successful push result. No live third-party SSH host
  was contacted; command construction, identity gates, push wiring, and UI were
  verified deterministically.
- The per-repository Releases workspace now presents loaded, published,
  prerelease, draft, and latest-stable metrics; fuzzy/substring/regex and case
  search; status filtering; provider links; rich author/date/target and asset
  metadata; explicit loading/empty/error/retry states; and responsive detail
  panels. The concurrently shipped public-by-default creation flow remains
  integrated as **New release**, with an explicit unpublished-draft opt-out.
- The required no-download production build passed through the fixed
  low-level MCP server in `214.9s`. The final merged app ran only on the owned
  off-screen Win32 desktop. Its exact HWND produced a valid low-level capture;
  because Chromium rejected background input/window actions, the documented
  app-native CDP hook produced the inspected `1440x960` canonical Releases
  frame. The promoted PNG is `146835` bytes with SHA-256
  `98659faa911d505cf0e1d1bfe8556bad994afd904afc959264f49ccdf6e4a856`.
- Verification passed: focused feature suite `128/128`, all `552` unit-test
  files in three Windows-safe batches, script tests `16/16`, provider tests
  `14/14`, provider compilation, TypeScript, targeted ESLint, Prettier, and diff
  checks. Feature/evidence commit `d9cd85d6735124bde11545b61e2f923dce9830c2`
  is present on `origin/main`; the final repository-cleanup receipt follows in
  this handoff.
- Headless cleanup is complete: owned Electron PIDs and provider PIDs are
  absent, debug/provider ports are closed, the disposable credential is absent
  after independent readback, the one desktop handle is closed, and the exact
  contained run root is removed. No real account or user desktop was used.
- After remote proof, the clean linked Claude worktree and its merged local
  branch were removed; the merged `origin/temp-work-branch` was deleted without
  force; remote/worktree metadata was pruned; and the two exact temporary
  export-inspection directories were sent to the Recycle Bin after containment
  checks. Both user-supplied ZIPs remain untouched. The final audit has one
  `main` worktree, only local/remote `main`, no stash, and `0/0` divergence
  before this receipt commit.
- The live GitHub wiki was updated from `docs/wiki` at
  `1d047329ed647d96e0bb42ed9374d89a9dbd59d2`, while preserving its remote-only
  `Images` directory. The exact remote SHA was verified and the clean temporary
  publish clone was sent to the Recycle Bin.

## 2026-07-18 multi-account push owner routing

- Push now passes the selected repository's resolved `accountKey` to Desktop's
  in-process credential trampoline. When multiple GitHub accounts share the
  same host, Git therefore authenticates as the repository owner instead of
  whichever account the credential helper happens to encounter first.
- The selector is stable account metadata, never a token, and is stripped
  before Git starts; it does not enter argv, the child environment, remote
  URLs, or logs. Explicit repository bindings remain authoritative, while
  legacy repositories keep the existing endpoint fallback.
- Regression coverage in `push-authenticated-git-test.ts` proves the account
  key reaches the credential-only execution option and does not leak into the
  environment. The focused account/push suite passes 10/10 and repository lint
  passes.
- Headless MCP preflight passed after restarting its existing scheduled task
  (server checkout `beed66ca6ed2503e6170ee1e1158247f1c2f0140`). The required
  production build could not launch the app because compilation stops on a
  pre-existing TypeScript error in `app/src/ui/preferences/agent-access.tsx`,
  outside this change. No screenshot was promoted for this non-visual fix.

## 2026-07-18 Build terminal OpenCode handoff and add-instead recovery

- After the user reviews consent and starts **Fix with opencode**, the launch
  dialog now closes, restores the Build & Run terminal, and leaves the entire
  OpenCode stream there. The detached repair still re-runs the real build to
  determine success; it no longer traps progress in a blocking log dialog.
- Detached `opencode run` has no interactive TUI answer surface. Its scoped
  config therefore denies the `question` tool (including overriding a global
  `ask` value for this repair), and the repair prompt tells the agent to make
  the safest minimal reasonable choice and explain it in terminal output rather
  than waiting on an invisible question. Existing edit/bash preferences remain
  preserved unless their scoped defaults were absent.
- A clone destination containing files now presents **Try to add instead** in
  the error banner. It sends that exact path through the existing add-repository
  flow, preserves the selected account binding, and closes only after a
  repository was successfully added.
- Repository lint passes and the focused push, path, OpenCode helper/runner,
  launch-dialog, and Build-panel suites pass 31/31. Production launch remains
  blocked by the pre-existing `agent-access.tsx` compilation error recorded
  above, so no misleading screenshot was promoted.

## 2026-07-18 direct public release creation

- Release Manager now opens **New release** rather than **New draft**. New
  releases default to **Publish immediately**, show the selected publication
  state in the immutable review, and submit a single GitHub create-release
  request with `draft: false`; successful completion reports `Published <tag>`.
- Turning **Publish immediately** off retains the reviewed unpublished-draft
  path. Existing drafts still retain their separate **Review publish** action.
- The previously shipped clone add-instead control now imports its Button
  component correctly, and the locally declared release API fixtures include
  the direct-create method. After restoring the already-locked QR dependency,
  the exact no-download MCP production build succeeds.
- Release API/store/view coverage passes 29/29, including exact `draft: false`
  request bodies, public-by-default review, explicit draft opt-out, account
  routing, stale review protection, and provider-safe failures.

## 2026-07-18 Build & Run OSS-fleet stress test

A 21-repository open-source corpus (express, vite, fresh, ripgrep, gin,
Newtonsoft.Json, flask, junit5, commons-lang, guzzle, sinatra, Alamofire,
dart args, elixir plug, scalatra, aeson, zls, jq, nlohmann/json,
awesome-compose, traefik) was cloned and driven through
`probeRepository`/`detectProfiles`. Findings and fixes:

- **Windows batch shims could never spawn.** Node's CVE-2024-27980 hardening
  makes `spawn` throw `EINVAL` for `.cmd`/`.bat` targets under
  `shell: false`, so npm/yarn/pnpm and Gradle/Maven wrapper stages failed
  instantly on Windows. The runner now routes resolved batch shims through
  `cmd.exe /d /s /c` with a strict argv allow-list (`batchSpawnSpec`) and
  verbatim arguments; any argument cmd.exe could reinterpret is refused,
  never escaped. Verified end-to-end with a real `npm install` in the
  express clone (exit 0, 403 packages).
- **Go run targets.** `go run .` was emitted even for library modules (gin)
  and cmd-layout apps (traefik). Detection now runs the root package only
  when `main.go` exists, otherwise prefers `cmd/<module-basename>` (parsed
  from `go.mod`, `/vN`-aware) with an alphabetical fallback; libraries get
  build-only profiles with an explicit reason.
- **XML solutions.** `.slnx` files rank and build like `.sln`:
  Newtonsoft.Json now surfaces `dotnet build Src/Newtonsoft.Json.slnx`
  (verified `dotnet restore` exit 0 on .NET SDK 11).
- **Auxiliary manifests.** A tooling-only `Gemfile` (Alamofire's fastlane)
  and a packaging `Dockerfile` (guzzle) no longer outrank the primary
  ecosystem in the same directory; both demote with an explicit
  `auxiliary to another ecosystem here` reason.
- New env-gated corpus suite
  `app/test/unit/lib/build-run/real-world-fleet-test.ts` (point
  `BUILD_RUN_FLEET_DIR` at a directory of clones) asserts non-throwing
  probing, at least one positive-score profile, shell-free argv commands,
  and deterministic ranking for every repo; it skips itself entirely in CI.

The sync pill also gained its missing state: **diverged** (ahead and behind
at once) now renders the pull shape in the amber family
(`--dm-sync-diverged-bg/on` over new `--dm-amber-on-container` tokens in
both themes) instead of borrowing the pull tone, so the pill signals that a
push will follow the offered pull. The post-shell style contract covers the
new state alongside the original five.

## 2026-07-18 UI fixes: submodule diff, subtree access, oversized→cheap-LFS

- **Submodule changes view revamped.** `submodule-diff.tsx` was restyled to
  Material Design 3 (tonal icon tile, path chip, info cards, an old → new
  SHA transition) and its stale "GitHub Desktop" branding fixed to the
  canonical `DefaultAppDisplayName` ("Desktop Material") — note
  `package.json`'s `productName`/`__APP_NAME__` is still the old string, so
  that path would not have fixed it. Added a "View on GitHub" action.
- **Subtree Manager always reachable.** Ungated the Tools-hub subtree entry
  from `subtreeCount > 0` so any Git repo shows it (subtrees are a pure-git
  feature) — the dialog's empty state now guides the user to add a first
  subtree. Submodule/cheap-LFS gating unchanged.
- **Oversized files auto-pin to cheap LFS.** When auto-pin-on-commit is on
  and the repo is Releases-capable, the "Files too large" (100 MB) warning
  is **pre-empted** — the commit proceeds and `_commitIncludedChanges`
  pins the oversized files to a release, committing pointers. When auto-pin
  is off/unavailable the warning still shows but gains a "Pin to release
  (cheap LFS)" button (a `forceAutoPinLargeFiles` flag through the commit
  path) gated on releases availability.

## 2026-07-18 Cheap-LFS automation and Commit & push all

- **Auto-materialize on detect (default on).** After a clone, a pull that
  brought pointers, a fetch, or on repo open, committed cheap-LFS pointers
  are automatically downloaded and reassembled into their real bytes —
  gated on a Releases-capable account, cancelable via a per-repo
  AbortController (also the re-entrancy guard), with a `cheap-lfs`
  completion notification. A manual **Materialize all** button in the
  Large files & storage panel runs the same batch with inline progress.
- **Auto-pin large files on commit (default on).** At commit time, any
  selected file over the ~100 MB push-size threshold that isn't already a
  pointer is pinned to the release (splitting >2 GiB) and committed as a
  pointer, so oversized files never break a push. A pin failure **aborts
  the commit** (emitError + return false before `createCommit`) rather
  than committing a half-pinned tree; a notification lists what was
  pinned. Gated on `getGitHubReleasesAvailability === 'available'`.
- **Repo-list "Commit & push all (pull first)".** A button next to
  Pull all opens a confirmation dialog listing the affected (non-clean)
  repositories and a required, user-confirmed commit message, then runs a
  bounded worker pool (concurrency 3, order-preserving) that per repo
  skips-if-clean, pulls first (conflicts isolate the repo as failed, never
  auto-resolved), commits all local changes with the user's identity/
  signing/hooks (not the bot-author path), and pushes (never forced).
  Per-repo failures are isolated so one repo never blocks the batch;
  progress uses the persistent PullAll-style run.

## 2026-07-18 Account, clone, and Releases fixes

- **Auto-switch account to the repo owner.** On selecting a repository the
  active account (positional `accounts[0]`, which drives the rail avatar
  and the unbound endpoint-fallback) now reorders to the repo's owning
  account, so the visible identity and unbound actions follow the repo.
  It reuses `getAccountForRepository`, so explicit bindings are respected
  and a signed-out/mismatched binding is never clobbered; it only fires
  when the owner actually differs (no churn), writes no binding, and never
  re-auths. Global toggle in Advanced preferences, default on.
- **Multi-clone no longer rejects a non-empty base folder.** The clone
  dialog only enforces the empty-folder rule for single-repo clones; with
  more than one repository selected each clones into its own
  `<base>/<name>` subfolder, validated per-repo by the batch flow.
- **Releases "could not load safely" now logs its cause.** The releases
  store logged nothing when it fell back to the guarded message; it now
  records the operation, status, error name, and a bounded message (no
  tokens) so the real cause — network/proxy vs. validation vs. scope —
  shows up in the Log History viewer. Confirmed the list validation is not
  over-strict (empty release lists load) and that scope failures surface
  as clear 401/403/404 messages, not the fallback.

## 2026-07-18 Cheap LFS — 2 GiB streamed uploads and auto-split larger files

- **Streamed uploads:** the release-asset upload path no longer buffers the
  whole file in RAM — it streams from disk with backpressure, hashing while
  streaming, Content-Length from the validated stat size, redirect handling
  unchanged. The per-asset cap rose from 128 MiB to **2 GiB** (GitHub's real
  release-asset limit). The `ReleaseUploadFetcher` contract now takes a
  streamable `{ path, offset, length }` source instead of a `Uint8Array`.
- **Auto-split:** a file larger than 2 GiB is split into `partNNN` assets
  (each ≤ 2 GiB), uploaded via byte-range streaming into the same release,
  with the mutation review re-fetched before each part. The pointer format
  is back-compatible: single-asset pointers are byte-for-byte unchanged;
  multi-part pointers append one `part <sha256> <size> <name>` line per
  part, and parsing validates that the parts' sizes sum to the whole-file
  size. Materialize downloads and verifies each part, concatenates in order
  while streaming the whole-file digest, verifies digest+size, then
  atomically replaces the pointer — any failure leaves the pointer intact.

## 2026-07-18 Clone progress — stage, %, speed, ETA, submodule phase

The clone progress experience was enriched from a bare bar into a Material
readout: the git **stage** (Receiving objects / Resolving deltas / Checking
out) with a numeric percentage, **transfer speed** and a derived **ETA**
(rolling-window rate in the store), and a distinct **Fetching submodules**
phase (indeterminate) that was previously an opaque pin near 100%. The git
progress parser now captures the throughput segment it used to discard;
multi-clone rows surface each repo's stage/description/percent, not just a
bar.

## 2026-07-18 Notification automations (context-menu-only, safety-gated)

A right-click **Automations…** entry on any notification row (the only
entry point) opens a builder for rules that fire a **webhook** or a **local
command** when a matching notification arrives. Non-negotiable safety, all
verified: every rule is **disabled by default** and its `enabled` flag is
**re-clamped to false on load**, so a rule restored/synced/imported through
its Git-backed store can never fire until deliberately armed in the current
session; webhooks run main-process-only on an isolated session with the
full SSRF guard set (manual redirects, https-only, credentials omit,
bounded response, content templated into the body never the URL); commands
run `shell:false` with every substituted argument re-validated against the
argv allowlist (refused, never escaped); and a receipt loop-guard stops an
automation firing on its own follow-up notification.

## 2026-07-18 Build & Run — fix errors with opencode

When a Build & Run stage fails, the panel now offers **Fix with opencode**:
launch the opencode AI coding agent to diagnose and fix the errors,
auto-installing it if missing, and running it in repo-scoped auto-approve
("yolo") mode.

- Plumbing: a pure install planner (npm `opencode-ai@latest` on every
  platform — no remote-script paths), argv/prompt/config builders
  (`opencode run --auto --dir <cwd>`, prompt bounded and passed via
  **stdin** so it never flows through the Windows batch-shim allowlist,
  a repo-root `opencode.json` permission block scoped `external_directory:
  deny`), and a main-process `OpencodeRunner` (detect via
  `opencode --version` + `opencode auth list`, install, run-fix, IPC,
  shutdown teardown).
- Success is measured by **re-running Build & Run** after the fix, never
  by opencode's exit code (it is known to exit 0 on failure).
- UI: a `PopupType.OpencodeFix` consent dialog — detect → (install with
  the exact command shown / prompt for `opencode auth login` /
  ready) → run with live streamed output and cancel → verify via the
  re-run, reporting Fixed or still-fails.
- Safety: the **offer** defaults on (so a failed build always surfaces
  it — merely showing the button is harmless), but **auto-approve
  (yolo)** defaults **off** and is an explicit per-repo toggle carrying a
  warning; installing opencode and enabling yolo are each separately
  consented; the prompt is fed via stdin; and yolo is strictly scoped to
  the repo's `--dir`.

## 2026-07-18 GitHub API Explorer — functions-first

The Explorer was reorganized from a browse-first catalog into a
functions-first surface (presentation only — no execution, review,
redaction, scoping, or persistence machinery changed):

- The saved runnable-function registry ("App functions") is now the
  primary surface at the top, retitled **API functions** with copy that
  frames them as saved, repo/account-bound, review-gated calls.
- The descriptive operation lists are reframed as a secondary **operation
  picker** ("Add a function from an operation" / "…from a GraphQL root"),
  and each row gained a one-click **Create function** button that
  prefills the builder and focuses the save-as-function form, so browsing
  an operation flows straight into creating a runnable function.
- The raw request builder is relabeled **Manual request** and kept as the
  always-available fallback — still the only surface when a catalog is
  unavailable (fail-closed GHES).
- Every guard chokepoint is unchanged: mutation review, response
  bounding/redaction, and endpoint/account scoping all still gate every
  request.

## 2026-07-18 Release-backed "cheap LFS"

A new **Large files & storage** tools-hub category hosts a cheap-LFS panel:
instead of real Git LFS, a chosen large file is uploaded to a GitHub
Release asset and a small text **pointer file** is committed in its place;
materialize downloads the asset and restores the real bytes.

- Plumbing: `api.fetchReleaseByTag` + a store `getReleaseByTag`; a pure
  pointer model (`cheap-lfs/pointer.ts` — serialize/parse, path-safety
  validator stricter than repository-lfs, CRLF/BOM-tolerant read,
  stable `\n` write); and `cheap-lfs/operations.ts` with streamed
  sha256 hashing, `pinFileToRelease` (128 MiB cap enforced before hash,
  find-or-create-draft-release, upload, write pointer),
  `materializePointer` (download to a same-volume sibling temp, verify
  sha256 **and** size, atomically rename over the tracked file — working
  around the download layer's refuse-to-overwrite), and a bounded
  `listCheapLfsPointers` working-tree scan.
- Panel: review-gated, lists pointers with the FilterModeControl search,
  per-row Materialize with progress/cancel, and a Pin flow (file picker,
  tracked-path + tag form, inline cap/path validation) — plus explicit
  copy that this is **not** real Git LFS, other clients see only the
  pointer text, and draft-release assets are visible only to signed-in
  app users until published.
- Honest limits recorded: 128 MiB upload cap (buffered upload), draft vs
  published visibility, and the same-volume temp-replace assumption.

## 2026-07-18 Repository Tools catalog reorganization

The tools hub's taxonomy was rebuilt for scanability: seven
plain-language categories ordered by everyday frequency — Status &
branches, Search & inspect, Commits & history, Nested repositories
(gated, submodules + subtrees), Cleanup & maintenance, Share & transfer,
Repair & recovery — with entries alphabetical within each (enforced by a
shared comparator, rule documented on `HubCategoryOrder`). All 24 entry
ids and titles are unchanged; ~15 vague descriptions were rewritten as
one-line "what you'd use this for" sentences. Category headers gained
one-line subtitles, filter chips derive from the categories actually
present, and a latent invalid-HTML-id bug in the detail-pane header was
fixed with a slugifier. Contract, responsive, and RTL suites extended
additively.

## 2026-07-18 Git subtree manager

A full subtree vertical slice mirroring the submodule manager (the bundled
dugite git 2.53 ships contrib `git-subtree`, verified by a memoized
capability probe that still gates the UI defensively):

- Plumbing in `git/subtree.ts`: `discoverSubtrees` (trailer-driven —
  `git log --grep=git-subtree-dir:` through the existing `getCommits`
  trailer parsing, deduped by prefix), `addSubtree` / `pullSubtree` /
  `pushSubtree` (URL-resolved sources, `envForRemoteOperation` +
  `credentialAccountKey` + auth-error handling, progress via the
  fetch/push parsers — no `--progress` flag, git-subtree rejects unknown
  options), `splitSubtree` returning the split-head SHA, and prefix
  validation that rejects before spawning.
- `PopupType.SubtreeManager` / `PopupType.AddSubtree` dialogs: discovered
  list (short split/merge SHAs), required FilterModeControl search,
  per-row inline Pull/Push/Split editors (remote select + custom-URL
  fallback, ref, squash on pull, branch on split), and an add dialog
  composed from the add-submodule building blocks (provider tabs +
  account picker + URL tab, squash default on).
- Tools-hub entry (Maintenance) gated by discovered-subtree count,
  following the pinned submodule gating idiom; contract, modality, and
  RTL suites extended.

## 2026-07-18 Submodule config manager

Every submodule row in the Submodule Manager (and the Repository Settings
Submodules tab) gained a **Configure** action opening a per-submodule
config dialog:

- Edits the tracked `.gitmodules` keys — URL (`git submodule set-url` +
  sync), branch (`set-branch --branch/--default`), update strategy,
  ignore, shallow (tri-state), and fetchRecurseSubmodules — with an
  "inherit default" sentinel that clears a key, diff-only saves that call
  exactly the changed operations in order, and per-step inline errors.
- Action row: Sync, Init (uninitialized only), and a confirmed
  force-Deinit.
- New plumbing: file-targeted `git config -f` helpers in config.ts
  (idempotent unset), `setSubmoduleUrl` / `setSubmoduleBranch` /
  `setSubmoduleConfigKey` (value-validated before spawning git) /
  `initSubmodule` / `deinitSubmodule` in git/submodule.ts (removeSubmodule
  now reuses deinit), and `.gitmodules` parsing extended so
  `IManagedSubmodule` carries the four config keys.
- `PopupType.SubmoduleConfig` registered as a normal modal popup; the
  submodule contract test and popup-modality test pin the new surface.

## 2026-07-18 In-app log viewer, verbose logging, Git-backed log history

Logging is now a first-class, inspectable surface:

- A renderer `LogStore` (modeled on the notification-centre store) tees
  every logged line into a Git-backed repository at
  `<userData>/log-history/` tracking `app.log` (working file capped at the
  last 5000 lines; full history stays in Git), with debounced
  "Capture log activity" commits, undo/redo/restore, and the shared
  history surface.
- A dependency-free log sink hook in the renderer logging shim forwards
  every formatted line; debug lines flow only when verbose logging is on.
- New **Verbose logging (debug level)** checkbox in Advanced preferences,
  persisted and plumbed over a new `set-verbose-logging` IPC channel so
  the main process raises the previously hardcoded winston file-transport
  level from `info` to `debug` at runtime.
- New non-modal **Log history** dialog (`PopupType.LogHistory`) — a thin
  wrapper over the shared `VersionedStoreHistory` panel, so timeline,
  diffs, undo/redo/restore, and the FilterModeControl search (with the
  regex builder) come standard. Reachable from Help → View Log History
  and the command palette ("View log history").

## 2026-07-18 Regex builder on every filter bar

Every persistent search/filter surface in the app now carries the shared
`FilterModeControl` cluster (fuzzy/substring/regex mode cycle, match-case
toggle, and the regex-builder launcher) with its mode persisted per surface.
The wave covered the 23 surfaces that lacked it: the three
`SectionFilterList` consumers that only needed a `filterListId` (worktrees,
account picker, Copilot model picker); the five Actions surfaces (runs
filter, workflow manager, workflow catalog, cache manager, and the
find-in-job-log search with mode-aware match navigation); the six
shell/tab surfaces (command palette, Material context-menu filter, tab
search, arrange tabs, close-tabs-containing — its inverse "keep" variant
deliberately stays a documented literal substring for destructive-action
safety — and the tab-style-editor font search); the five repository
surfaces (in-diff search with mode-aware occurrence navigation, submodule
manager, gitignore templates, tools catalog, provider triage); and the
four GitHub views (issues search, REST + GraphQL API-explorer catalogs,
notification centre). Bespoke one-off regex toggles were replaced by the
shared control everywhere they existed. All `FilterModeControl` and
regex-builder buttons now declare `type="button"` so dialog-form hosts
(the command palette) cannot implicitly submit. A completeness sweep
confirmed no remaining filter bar lacks the affordance; compact popovers
hide the launcher label via their own SCSS while keeping the aria-label.

## 2026-07-17 Docker builds, sync-pill vibes, auto-build-on-pull, and list typography

The three urgent goals previously recorded at the top of this handoff are
implemented on `claude/handoff-md-implementation-3b529c`:

- **Docker build actions.** Build & Run detects `Dockerfile` and Docker
  Compose (`docker-compose.yml`/`.yaml`, `compose.yml`/`.yaml`) projects as a
  first-class `docker` ecosystem with argv-encoded `docker build .`,
  `docker compose build`, and `docker compose up` stages, a `docker --version`
  toolchain probe, nested-directory manifest markers, and stable
  `docker:image` / `docker:compose` profile ids (compose outranks the plain
  image build when both exist). Docker deliberately does not suppress the
  generic Make fallback — a Dockerfile packages a project without replacing
  its native build — and stays out of the winget auto-install path.
- **Sync-pill vibes.** Every push/pull toolbar state now carries a
  `push-pull-button--<state>` modifier on both pill shapes (single-button and
  split-button, whose backgrounds live on different DOM nodes), themed through
  new `--dm-sync-*` background/on-color token pairs: neutral fetch, secondary
  container pull, primary container push, green publish, and error-container
  force push, whose ahead/behind badge and disclosure chevron also adopt the
  error family. The aliases are declared on `body` — not `:root` — so dark
  theme, curated accent palettes, and the neutral surface variant all flow
  through the var() substitution; publish gained a dedicated
  `--dm-green-on-container` tone that passes AA on the 0.75-opacity
  description line.
- **Auto build after pull.** A per-repository, default-off Build & Run
  preference `autoBuildOnPull` ("Build after pulling new commits") starts the
  selected profile only when an interactive pull actually moves the branch tip
  to a new commit, no build-run is already in flight, and both tips are valid
  branches — decided by the pure, tested `shouldAutoBuildAfterPull` helper.
  Build problems never surface as pull failures. The preference participates
  in the repository equality hash so saving the checkbox takes effect
  immediately, the post-pull read re-resolves the live repository instance
  (the pull can swap in a refreshed instance whose state is keyed by a new
  hash), and the localhost agent API's `pull` command passes
  `autoBuild: false` so a remote command can never spawn build or run
  processes as a side effect.
- **Repository-list fonts.** Repository appearance overrides gained a
  validated `listNameStyle` Word-style typography field — curated font
  family, size clamped to the row-safe `MaxListNameFontSize` (18px),
  bold/italic, and the rest of the tab title-style model — stored beside the
  logo in the repository's local `desktop-material.appearance` Git config,
  resolved and LRU-cached through the shared bounded logo loader in one
  config read, applied to the list row's name through `tabTitleStyleToCss`,
  and edited in Repository Settings → Appearance with a live preview that
  reproduces the row's real base typography.

A three-dimension adversarial review (correctness, security/invariants, and
UI/style consistency, with every finding independently re-verified against
the code) confirmed nine defects, all fixed before commit: the
stale-preference equality hash, agent-surface auto-build exposure, the
light-theme accent freeze of `:root`-declared aliases, the 32px-size versus
29px-row mismatch, publish description contrast, the force-push badge color
mismatch, the misleading typography preview baseline, the stale post-pull tip
read after a mid-pull repository refresh, and docker suppressing make.

Local verification in this checkout: 105 focused tests across the build-run,
appearance, and style-contract suites pass, including 11 Docker detection
cases, 9 auto-build decision cases, the new typography validation cases, and
a new sync-pill style contract; repository-wide `tsc --noEmit` introduces
zero new errors against the pre-change baseline; changed-file Prettier and
repository-rule ESLint are clean. The loader, list-row, and Git-config
round-trip suites were extended for the new appearance payload but cannot
execute in this checkout because it lacks the `dugite`/`@testing-library`
dependencies; they run in CI. No production build or headless UI gate was run
for this wave.

A parallel implementation of the same three goals on
`claude/ui-clipping-material-design-g5g3n9` was superseded by this reviewed
wave when the branches were merged to `main`; that branch's distinct
clipping/token/accessibility polish pass (next section) was kept in full.

## 2026-07-17 clipping, Material-token, and accessibility polish pass

A dedicated audit swept all 219 stylesheets and the Material shell components
for text clipping, pre-Material styling leftovers, and keyboard accessibility.
Dialogs now use the MD3 extra-large radius and level-3 elevation instead of the
legacy 6px Primer card; the title bar, window controls, CI status popover,
avatar stack, tab bar, tooltips, toast/repository `kbd` chips, and commit drag
badge all route through `--md-sys-*`/`--dm-*` tokens (with a new `--dm-on-green`
on-color for dark-mode contrast). Fixed pixel heights on app-bar chips,
repository tabs, menu rows, dialog headers, and buttons became min-heights so
larger user-selected interface fonts grow controls instead of clipping, the CI
check-run description lost its hard 250×12px clip box, and the branch list
description gained the ellipsis treatment. Keyboard users can now see the tab
close button on focus, the tab rename input has an accessible name and focus
ring, the tab-strip search fields have focus-within indicators, split-button
dropdown options highlight tonally on focus-visible, and notification unread
state is exposed to screen readers rather than being color-only. Validated
with a full Sass compile, TypeScript, ESLint (custom rules), Prettier, all 31
style-contract suites (110 tests), and the affected component suites
(258 tests), all passing.

## 2026-07-17 Build & Run auto-build hardening

The one-click Build & Run auto-build now works across every detected
ecosystem, on every supported host, including complex builds whose
dependencies must be installed automatically:

- **Toolchain auto-install is no longer Windows-only.** The pure
  `planToolchainInstall` mapping now covers winget on Windows (extended from 5
  ecosystems to Node/Bun, Python, Go, Rust, .NET, Deno, Java via Temurin JDK
  plus Gradle/Maven, PHP, Ruby with DevKit, Elixir, sbt, Swift, Zig, CMake,
  and GNU Make), Homebrew on macOS (same coverage plus Composer, Dart,
  Flutter and the Haskell toolchain; the JDK installs as the `temurin` cask so
  wrappers and `/usr/bin/java` find it, and brew steps are never elevated),
  and runtime-provisioned package managers on every platform including Linux:
  `yarn`/`pnpm` via Corepack, `pipenv`/`poetry` via pip, and Bundler via gem.
- **Missing-dependency auto-fix covers every dependency-managed ecosystem.**
  `planRemediation` now receives the plan's install-stage commands and
  proposes ordered multi-command remediations. Build/run stages that fail on
  missing packages re-run the profile's install commands (or a sensible
  ecosystem default) before retrying: Node missing-module errors, Python
  `ModuleNotFoundError`, `go mod tidy` for missing go.sum entries, `cargo
  fetch`, `dotnet restore` on NU1101/NETSDK1004, `composer install` on a
  missing `vendor/autoload.php`, `bundle install` on `Bundler::GemNotFound`,
  `mix deps.get`, `dart pub get`, `swift package resolve`, `sbt update`, and
  a bounded plain retry for transient Gradle/Maven resolution failures. The
  Python venv fix is now correctly scoped to the install stage, and the
  per-stage retry budget is unchanged.
- **GUI-launched builds on macOS/Linux now find their toolchains.**
  `resolveRunEnv` appends the well-known Homebrew and per-user tool
  directories (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`,
  `~/go/bin`, `~/.local/bin`, `~/.deno/bin`, `~/.bun/bin`,
  `~/.pub-cache/bin`, `~/.dotnet/tools`, `~/.mix/escripts`) to PATH off
  Windows, mirroring the existing registry-based PATH refresh on Windows, so
  both the initial probe and the post-install re-check see what a terminal
  would.

The runner threads install commands into the auto-fix planner and executes
multi-command remediations sequentially with the existing cancellation
checks; the Repository settings auto-install copy and the plan/type docs now
describe the cross-platform behaviour. Focused verification in this
environment: the rewritten `auto-fix`/`toolchain-install` suites plus the
existing detect/gitignore suites pass (128 tests), the IPC-contract,
toolbar-overflow-layout, and post-shell style suites pass (32 tests), and
repository-wide `tsc --noEmit --skipLibCheck`, changed-file ESLint with the
repository rule directory, and Prettier are clean. No production UI gate was
run in this Linux container.

## 2026-07-17 recovery, custom logos, app functions, and responsive completion

Clone account changes now invalidate stale provider selections and reload the
new account before a repository can be chosen. Automatic clone work is owned by
an app-lifetime background store instead of a blocking dialog. Its versioned
journal preserves queued, running, paused, interrupted, failed, and
review-required items across renderer or process restarts, with explicit
pause/resume/retry/dismiss controls. Clone recovery rejects credential-bearing
URLs, unsafe canonical paths, origin mismatches, non-owned worktrees, symlink
escapes, and time-of-check/time-of-use path changes; displayed failures redact
credential material. Recovery finalizes only repositories which were actually
added to the app: a temporarily unavailable completed clone remains journaled,
visibly needs attention, exposes **Retry adding repositories**, and cannot emit
or suppress its completion summary prematurely.

Repository appearance now includes a code-native vector logo studio rather
than another set of dropdowns. Profiles can define a default and individual
repositories can inherit or override it. The bounded model supports presets,
text and mark layers, transforms, colors, live preview, undo/redo, and guarded
JSON import/export without accepting raw SVG. The selected logo propagates to
the repository list and open tabs through the shared bounded loader.

The API surface now exposes saved, versioned **app functions** with stable
names, exact repository/provider/account bindings, reviewed mutation behavior,
bounded redacted output, SHA-256 fingerprints, and the same catalog through the
app, local Agent API, MCP, and REST adapters. Malformed persisted state fails
closed and never stores credentials. The GitHub API Explorer can create,
inspect, execute, update, reload, and remove these functions.

The final review also replaced three regex-based GraphQL token strippers with
one shared lexical scanner. Comments are recognized only outside strings,
ordinary escapes and escaped triple quotes in block strings remain contained,
and malformed strings fail closed. Exact lexical-decoy regressions prove that a
retained mutation cannot be classified or invoked as a noninteractive read.

The responsive smoke catalog accounts for every registered repository page,
preferences page, repository-settings page, clone and notification tab, File
History surface, and safely orchestrated dialog/menu surface. All 76 applicable
rows passed all eight viewport/zoom scenarios; the three unavailable fixture
integrations are explicit N/A rows, with zero failures, blockers, missing rows,
document-width overflows, unreachable scroll bottoms, or unnamed buttons. The
scenarios include the 320×240 CSS viewport produced by 200% zoom as well as
short, portrait, standard, and wide layouts. The complete 79-row evidence is in
`docs/verification/responsive-surface-matrix-2026-07-17.json` (SHA-256
`108c4c444feda61bb890d341cc83fb5bc27c008695fe9f384114d6499ed9532b`).

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-repository-logo-studio.png` | 960×660 | 110,716 | `791c67e611a87c9e7e716616c1031c3bf696cd8acdb7f98aa1fbdffb36858777` |
| `docs/assets/screenshots/material-api-app-functions.png` | 944×1000 | 126,774 | `10d635a3e884902d4e791258e9cb470c83be0b268aa4e88aaab537601bb6a3f5` |

The exact required unpackaged production build completed through the fixed MCP
endpoint in 365.14 seconds under concurrent verification load, without a
timeout or dependency download. Full TypeScript, repository-aware ESLint over
77 changed source files, Prettier over 113 supported files, and diff-integrity
checks passed. The final sequential unit run covered 457 files in two batches:
3,139 tests across 863 suites, with 3,138 passing, zero failures, and one
intentional skip. The focused script harness also passed all 15 tests; the
post-review clone/API audit passed all 59 tests.

The first remote CI attempt (`29571690398`) then caught two existing
account-binding tests whose clone destination was hard-coded as a Windows path;
the strengthened absolute-path contract correctly rejected that fixture on
macOS. The tests now derive the same parent/name destination with the host
platform's `path.resolve` instead of weakening production validation. The
account-binding, batch model/journal/recovery, and auto-clone retest passed all
48 tests locally before the corrective push.

The hidden run used only `DesktopMaterialP0_20260717_0139`, saved app PID
`8700`, provider PIDs `14392`/`6460`, provider port `61130`, and CDP port
`61241`. The generic alternate-desktop close route failed closed, after which
the exact revalidated app PID was terminated gracefully. The disposable
credential was deleted and read back absent; all recorded PIDs and both ports
reached zero; the named desktop closed exactly once; and the containment-checked
owned Temp root was removed and verified absent.

### Publication checkpoint

- The implementation, evidence ledger, screenshots, and canonical docs were
  committed and pushed without force at
  `fb15895289341f2e197fe9857e55ebfefab65497`. The platform-neutral test-fixture
  correction and its failure receipt were pushed at
  `a052e322f6fa47a6bc26fc7baf737fc747065ed2`.
- Corrective CI run `29572459399` completed successfully for exact SHA
  `a052e322f6fa47a6bc26fc7baf737fc747065ed2`: lint, Windows x64/arm64, macOS
  x64/arm64, and Windows/macOS E2E smoke all passed. Corrective Build Installers
  run `29572459417` also completed successfully, including Windows x64.
- Pages run `29571690395` completed successfully for the implementation SHA.
  The live page returned 200 with both new gallery entries; the raw logo-studio
  and API-function PNGs returned their exact promoted byte lengths and SHA-256
  values.
- The separate wiki preserved its remote-only `Images/` directory and overlaid
  only Agent API, Developer Guide, Feature Gallery, and User Guide. Wiki
  `master` was committed and pushed without force at
  `905047f4cc7e0934516ea0ebaf79c4510f4385ed`; local, tracking, and direct remote
  SHAs matched. The rendered gallery returned 200 with all 63 named entries and
  both new images, and the rendered User Guide contained the new API-function
  and logo guidance.
- After remote proof, the containment-checked disposable wiki checkout was sent
  to the Recycle Bin and verified absent. Main had one worktree, one local
  branch, no stashes, and no unintegrated or divergent tip.

## 2026-07-16 navigation, context actions, and scroll containment

Repository tabs now have a runtime search/switcher across labels, aliases,
paths, and clone URLs. Arrange Tabs has its own literal multi-key filter while
one-shot sorts continue to apply to all open tabs. The repositories side sheet
adds independent exact-account and provider-service scopes, including explicit
local-only, unavailable-account, and unknown/signed-out states.

Every button receives a discoverable shared hover and keyboard-focus hint.
History commit rows own their specialized context path: right-click, Context
Menu, `Shift+F10`, and the named More button all build the same action set from
the effective selection, so an unselected clicked row cannot accidentally act
on an unrelated multi-selection.

Repository Tools now wins the real compiled Material-card cascade with an
owned vertical scroll region. The production gate reached its exact bottom at
regular, `640×480`, `960×420`, and 150% zoom layouts with the final named
control inside both the surface and viewport.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-tab-search.png` | 1000×687 | 91,055 | `1a18b970c9aaffe4716be61cbbc84afa34cad6395a9e2e35bdfe48472396abc5` |
| `docs/assets/screenshots/material-history-context-actions.png` | 1000×687 | 92,197 | `c5c2b722a4c79979ce3973ed8ce921fb1eac661caa1c03ace2317d4f81ef0ec0` |
| `docs/assets/screenshots/material-repository-tools-scroll.png` | 960×420 | 29,840 | `d39dad61015ca333fbb95d388a8d75d7484a662d85f068e99a4b5fefa80f8b45` |

The exact hidden-desktop verifier and safety/build/geometry receipts live in
`.codex/run-manifests/2026-07-16-navigation-context-scroll.md`. The app process,
desktop, CDP listener, and disposable fixture were removed after promotion.

The **July 16 adaptive customization maintenance release** also passed its exact
production build and off-screen interaction gate at tested code source
`c5205838dfc5ee2b7ce80ce488215a2cd903bb26`. It adds profile/repository/tab
appearance, measured app-bar overflow, pure Material entry surfaces, guarded
tab close/arrangement, workflow-run cancellation, reviewed rebase,
repository-account propagation, bounded OAuth scopes, and compact-surface
corrections. Its detailed acceptance receipt and seven inspected captures are
recorded below.

The final feature-completeness audit closes every current roadmap maintenance
item. Detailed Pull All progress passed its production/headless/a11y gate at
`1bc8a226de`; exact shipped commit `36197bf6dd` then passed CI run
`29490902486` and installer run `29490902407`. Pages run `29489043545`
deployed the then-current 51-image gallery, and the public seven-page wiki carries
the same inspected release documentation. A final focused checkout pass added
37/37 green registration, Pull All, checkbox, compact-style, and Pages-gallery
tests to those repository-wide and off-screen receipts.

## 2026-07-16 notification triage and error notices

The notification centre now supports explicit Local/GitHub sources, text
search, source-appropriate filters, select-all-visible, and bounded bulk
triage. Local rows can be marked read or unread and deleted together in one
history-backed mutation; GitHub rows can be marked read or done only within
the loaded account/filter context. The former trash-only affordance is now an
explicit **Clear all** action with a visible non-modal confirmation and a
notification-history recovery explanation.

Generic errors that previously opened a blocking acknowledgement-only dialog
now appear as bounded, dismissible red notices in the bottom-right corner by
default. **Preferences → Notifications → Application errors** can restore the
legacy blocking-dialog style. Authentication, retry, file-size, Copilot, and
other flows that require a decision or remediation remain dialogs regardless
of that preference. Safe error summaries continue to be written to the local
notification history independently of the transient notice stack.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-error-notice.png` | 1000×687 | 101,359 | `953467ac7846bf01ec3090b01b15938c35e7be2ee73bd0638e1df3bfeaf3fe0b` |
| `docs/assets/screenshots/material-notification-bulk-actions.png` | 1029×600 | 101,445 | `b3ca2875c1080733e832df49bc0680e7711ad650809c33149382f96fe8cf7c32` |

Focused notification, error-routing, preference, profile-history,
responsive-style, and React interaction coverage first passed `68/68` tests
across 21 suites. The final combined source, Pages, and 58-item wiki-gallery
gate passed `84/84` tests across 24 suites. Full TypeScript,
repository-aware ESLint, targeted Prettier, diff integrity, and the exact
unpackaged production build also passed; the final MCP build emitted every
webpack target in 131.72 seconds without a timeout or dependency download.

The accepted app-native geometry had equal document/body client and scroll
widths. The normal error notice stayed fixed entirely inside a 1000×687 CSS
viewport with no card overflow. In the short-height notification gate, the
panel stayed inside a 1029×600 CSS viewport; its source surface measured
374/374 pixels client/scroll width and 473/486 pixels client/scroll height
with `overflow-y:auto`. Exactly three filtered rows were selected, all named
bulk controls were reachable, and the Clear-all recovery confirmation remained
visible. Both promoted PNGs were reopened at original resolution and contain
only the deterministic `git-source` fixture and synthetic error copy.

The fixed low-level MCP ran only on the uniquely named off-screen desktop. The
final saved launch PID `12760`, runtime HWND `7406868`, and CDP port `57931`
were revalidated. The alternate-desktop generic close path failed closed, so
only the exact owned Electron process set was terminated; the listener reached
zero, the desktop listed zero windows and closed, and the containment-checked
Temp root was removed. A stale post-interaction HWND frame was rejected because
its hash matched the pre-interaction frame; only current app-native pixels were
promoted.

### Publication checkpoint

- Main implementation, documentation, verifier, and screenshots were committed
  and pushed without force at
  `67411a6bfaed2d411b35bd9e9026e487f23bc54a`.
- Pages workflow `29552951424` completed successfully for that exact SHA. The
  live Pages render referenced the bulk-action image, and both raw-main PNGs
  returned 200 with their exact promoted byte lengths.
- Build Installers workflow `29552951386` completed successfully for that exact
  SHA; its Windows x64 installer job passed.
- CI workflow `29552951433` completed successfully for that exact SHA: lint,
  Windows and macOS E2E smoke, Windows x64/arm64, and macOS x64/arm64 all passed.
- The separate wiki preserved its remote-only `Images/` directory and overlaid
  only the four reviewed canonical Markdown files. Wiki `master` was committed
  and pushed without force at
  `5ac1ebfa3427fab7b3d49ebe2cea7ff010a715c5`; local, tracking, and direct remote
  SHAs matched. Live Feature Gallery and User Guide renders contained the new
  guidance, and the containment-checked temporary checkout was removed.

## 2026-07-16 GitHub API Explorer release

The repository rail now includes a GitHub API Explorer contextualized by the
exact selected repository and bound to its selected saved account and provider
host. Its complete searchable catalog contains all 1,206 current REST
operations and identifies exactly 10 operations added since the prior pinned
2026-03-10 catalog. The request builder supports REST and GraphQL, requires
exact-request review before a mutation can run, and keeps displayed response
headers and bodies bounded and credential-redacted.

The accepted evidence uses the deterministic synthetic
`material-fixture-owner/material-fixture` repository and provider identity. The
catalog's **New operations** scope shows 10 of 10 operations; the selected
repository custom-pattern read completed with a synthetic 200 response. No
personal account, credential, or private repository identifier appears in the
capture.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-github-api-explorer.png` | 944×1000 | 129,807 | `0115fb552e5212d7d326eb36197e4499f03dd99707b0ebb18c5c3fddf6082228` |

README, Pages, User Guide, and Feature Gallery sources now reference this
evidence. The machine-checked guided gallery therefore contains 56 distinct
named functions or states, each backed by one distinct tracked PNG.

The exact unpackaged production build passed twice through the off-screen MCP
runner; the final rebuilt-source run exited 0 without a timeout in 126.5
seconds. The accepted app-native client was 944×1000 physical pixels
(983×1041 CSS pixels at DPR 0.9599999785), with equal document/body client and
scroll widths and no element outside the horizontal viewport. The verifier
confirmed 10 rows and 10 **New** badges, the expanded synthetic repository path,
the 200 response, and both deterministic custom-pattern names. The disposable
credential was deleted and read back absent; the saved Electron and provider
PIDs, their two loopback ports, the uniquely named desktop, and the
containment-checked fixture root were all confirmed gone after capture.

## 2026-07-16 function screenshot catalog

The wiki now treats the Guided Feature Gallery as a machine-checked visual
catalog: 56 named, user-facing workflows or states each own one distinct PNG.
Core History browsing, local Agent access, and the repository-contextual GitHub
API Explorer are included in the manifest and its rendered image body. Eight unused
legacy captures with obsolete or clipped UI were removed, leaving no tracked
PNG unassigned and no screenshot reused for a second catalog row. Home, User
Guide, and Developer Guide link or describe the same canonical catalog, and a
focused unit contract rejects missing, duplicate, unrendered, or unassigned
assets.

The exact MCP endpoint and scheduled task passed preflight against low-level
checkout `806d9ba85e4afbc2af58d7499496babfa7c68891`. The service PATH no longer
contained a global Yarn command, so the first build stopped before compilation.
A temporary owned shim then invoked the already-cached Yarn Classic package in
offline mode; the required `npx --no-install cross-env
RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` command
completed with code 0, no timeout, and no dependency download.

The compact visual check used only hidden desktop
`DesktopMaterialFunctionCatalog2026071601` (creation handle `972`), launch PID
`7624`, runtime HWND `4392554`, CDP port `9347`, and the synthetic
`material-fixture@example.invalid` identity. The first 960×660 MCP frame was
clean and the Configure Git renderer measured 1000/1000 document and body
widths with seven named controls and no horizontal clipping. Native hidden-HWND
resize was unavailable. A later post-CDP PrintWindow frame retained stale
compositor regions, so it was rejected and no replacement image was promoted;
the catalog uses only previously inspected current assets. The exact PID,
listener, hidden desktop, disposable fixture/profile/captures, and owned Temp
root were all verified absent after cleanup. The unrelated OAuth manifest and
detached foreign worktree remained untouched.

## 2026-07-16 clone-style Add Submodule release

**Repository settings → Submodules → Add submodule…** now opens a dedicated
Material popup with the same GitHub.com, GitHub Enterprise, URL, and GitLab &
Bitbucket source model as Clone. Hosted tabs preserve exact-account affinity
and repository browsing; URL mode accepts validated HTTPS, SSH, and local Git
sources. The review binds the source to a safe repository-relative checkout
path plus an optional tracked branch before Git starts.

The Git boundary revalidates duplicate and occupied destinations against the
live superproject immediately before spawn, forwards the selected credential
account only to the remote operation, reports bounded clone progress, and owns
an abort signal plus exact process callback. While Git runs, inputs freeze but
**Cancel operation** remains active; success refreshes the underlying managed
submodule list.

Verification is green: 53 focused model/UI/Git/popup/style/Pages tests,
TypeScript, changed-file ESLint and Prettier, the complete 1,190-test suite, and the exact
unpackaged production build. The build and UI gate ran through low-level MCP
checkout `806d9ba85e4afbc2af58d7499496babfa7c68891` on the single hidden desktop
`DesktopMaterialAddSubmodule2026071601`. The visible desktop was never shown,
focused, resized, or used for input.

Chromium accepted the initial HWND-targeted onboarding click but its next
PrintWindow frame became a stale black compositor surface, so the isolated
loopback CDP endpoint was used for renderer interaction and capture. At the
app's minimum logical `1000×688` renderer, the popup measured `(129,59)` to
`(919,677)`, document/body widths were `1000=1000`, the internal scroll region
was `790=790`, every required control was named and keyboard-reachable, and the
review retained the synthetic source/path/branch. Native off-screen resize was
unavailable; a requested `700×650` CDP emulation was clamped to the app's
supported logical minimum/auto-fit behavior and is recorded as a limitation,
not as a native-size claim.

The accepted `1500×1032` screenshot is
`docs/assets/screenshots/add-submodule-dialog.png` (109,198 bytes, SHA-256
`9ebfe5d94f7f624736c6fada706ee15279754102735d01d63d201b322ad10834`).
It contains only the synthetic `superproject` and `.invalid` URL. README,
Pages, Home, User Guide, and Feature Gallery sources reference it, bringing the
guided gallery to 52 inspected images. The exact launch PID `13704`, its
windows, CDP listener `59317`, hidden desktop, ephemeral tooling, profile,
fixture, and owned Temp root were revalidated and removed; the desktop reached
zero windows before closing.

The assembled Pages source also passed the isolated browser gate at desktop
`960×660` and mobile `390×844` viewports: all 54 image instances loaded, all 53
gallery cards rendered, document/body widths matched their scroll widths, and
no control or content crossed the viewport. Its exact HTTP/browser PIDs,
loopback ports, profile, hidden desktop, and containment-checked Temp root were
then removed and verified absent.

## 2026-07-13 P0 production UI gate

The exact unpackaged production build passed with:

`npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`

The build took 108.72 seconds. It ran at `9e946fd527` through the exact
low-level MCP checkout `806d9ba85e4afbc2af58d7499496babfa7c68891` on one
off-screen Win32 desktop. The visible user desktop was never shown, focused, or
used for input. A loopback-only synthetic provider, disposable profile, true
shallow Git fixture, and reserved `.invalid` repository identity kept all
mutations and credentials out of public GitHub and the normal Desktop profile.

### Functional receipts

- **History deepening:** the fixture started with a real shallow marker and 3
  visible commits. The bounded review fetched older history from `origin`; the
  app then reported full history. Direct Git verification returned
  `--is-shallow-repository=false`, 15 commits, branch
  `feature/material-verification`, and upstream
  `origin/feature/material-verification`.
- **Native pull requests:** the purpose-built compose, review, and submit flow
  created provider-only PRs #73 and #74 from `feature/material-verification` to
  `main`. Long titles and Markdown bodies wrapped. The provider recorded
  authorized HTTP 201 mutations; no public PR was created.
- **Actions artifact:** the native Save dialog wrote the deterministic
  2,097,728-byte archive. Its local SHA-256 exactly matched the provider digest:
  `ff2e29e2ab05d44fb7e66c8242a8d74895232ad7ea2258255b91a9145fa5a783`.
  The app reported attestation presence while explicitly withholding a
  cryptographic-verification claim.
- **Effective branch rules:** refresh loaded classic protection plus two
  rulesets into seven plain-language sections with 12 state badges and no
  alert. Signed-out and two-matching-account states exposed complete routes to
  Accounts or Repository settings. The repository picker showed both accounts;
  saving one persisted `http://localhost:54612/api/v3#7130701`.

### Responsive, focus, and clipping receipts

- At the product-enforced minimum outer width of 960, the auto-fit renderer had
  a 1000 CSS-pixel viewport and `document.scrollWidth === clientWidth === 1000`.
- The requested base scale reached 200% through **View → Zoom in**. Auto-fit
  displayed the interface at 94% for the minimum window; the Appearance dialog
  showed both values and stayed bounded at the shortest supported height.
- At outer height 660, dense Branch Rules and confirmation content scrolled
  vertically inside its surface. Geometry inspection found no element outside
  the viewport and no document-level horizontal overflow.
- Branch Rules and Sparse Checkout were opened together. The front sheet owned
  focus and dismissal; closing it restored focus to Sparse Checkout. Both
  remained non-modal and horizontally contained.
- Long repository, branch, check, deployment, artifact, digest, path, account,
  title, and body values wrapped. No measured state had clipped controls,
  overlapping/oversized text, or page-level sideways scrolling. Horizontal
  scrolling remains reserved for intrinsically spatial code, diff, and log
  content.

Win32 background input and the native Save dialog were exercised through the
low-level server. Chromium ignored background-posted clicks and PrintWindow
occasionally returned stale/black compositor pixels, so the allowlisted
app-native CDP fallback drove renderer controls and captured the stable original
surface. Every promoted candidate was reopened at original resolution.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-history-deepening.png` | 944×660 | 70,047 | `a03f313b604ade9eb4458aaccffe2807c7580e53651215d52b75d9ddbfc181e2` |
| `docs/assets/screenshots/material-create-pull-request.png` | 944×660 | 76,575 | `93c8ec71c65e73414419d46214dd5849a128908e7336b08786ab677cd9f48022` |
| `docs/assets/screenshots/material-actions-artifacts.png` | 944×1000 | 106,252 | `326a27a927fa668444487f0dff3ef71c8b81eaf53e5d300b554d07a62541ae42` |
| `docs/assets/screenshots/material-effective-branch-rules.png` | 944×1000 | 107,573 | `7a4533aa0e9b40644ac2fb55ceb3fe0788ccb502137e370fd1762925a685bfd6` |

The two 944×1000 captures intentionally preserve tall original viewports of the
dense Actions and Branch Rules states, including their visible internal scroll
positions. They are original screenshots, not stitched or resized images.

### 2026-07-14 post-merge production launch

The post-merge source at `b6e78eecf3638fcdb1a81d27e7275c84e641a5f6` was rebuilt
with the exact unpackaged production command and launched on one uniquely named
off-screen Win32 desktop. The disposable HTTPS fixture and isolated profile were
removed after capture. Chromium ignored the permitted background-posted welcome
events, so this receipt intentionally records the stable launch surface rather
than claiming a deeper renderer state that was not exercised.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-post-merge-welcome.png` | 960×660 | 150,763 | `c0e5cd5e56fe0cc839446256a8439789229627bc932b91421b418377fcf68d5a` |

> Provenance note (2026-07-17): this capture was later retired in the "one
> screenshot per visual function" catalog dedup and is no longer tracked or
> referenced. The row is retained as a historical receipt; the byte length and
> SHA-256 describe the file as it existed at this checkpoint.

The Pages publish layout was also assembled exactly under the owned run root.
All 21 images loaded with nonzero natural dimensions. At 944×660 the document
width was 929 with matching scroll/client widths and zero visible overflows. At
390×844 mobile emulation the document width was 375 with matching widths; the
four P0 cards collapsed into one 259-pixel-wide column with wrapped captions.
Desktop, P0-gallery, and mobile-P0 captures were visually inspected before
cleanup. All 33 formerly parent-relative screenshot URLs in the Pages source
were corrected to publish-root-relative paths.

Cleanup completed: the exact disposable development-channel credential was
deleted and read back absent; the app, provider, CDP endpoint, provider port,
and off-screen desktop were gone; and the containment-checked owned Temp root
was removed. No normal Desktop profile or public provider state was changed.

### Publication checkpoint

- Main-repository evidence, roadmap, wiki sources, Pages source, and four PNGs
  were committed and pushed on `mega-feature-update` at
  `949eca9a29f266f9aa21451718c92d71fe0a4701`; local, tracking, and direct
  remote SHAs matched.
- The separate wiki's existing extra guidance was preserved while the P0 Home
  and User Guide content was merged. Four local `Images/` assets avoid raw-main
  404s before branch promotion. Wiki `master` was committed and pushed at
  `cf115fec684278f44cceced279651b7f288b2ddd`; local, tracking, and direct
  remote SHAs matched.
- Public Home and User Guide renders showed the current named-function text and
  all four image links; each raw wiki image returned successfully. Pages source
  remains branch-only. Workflow run `29260862943` checked out the exact branch
  SHA, configured Pages, assembled the publish directory, and uploaded the
  artifact successfully. The deploy job was then rejected because
  `mega-feature-update` is not allowed by the `github-pages` environment's
  branch protection; live deployment still follows the reviewed `main` path.
- The verified clean temporary wiki checkout was containment-checked beneath
  `%TEMP%`, removed, and confirmed absent after its remote SHA matched.

## 2026-07-13 Actions pagination production UI gate

The exact unpackaged production build at
`0aca4420df88a0865a0223530b956209e131431d` passed on the isolated desktop
`DesktopMaterialActions-20260713-29de6ec7`. The build used the same exact
production command and completed in 112.3 seconds.

### Pagination and responsive receipts

- The **Success** filter loaded 50→51 workflow runs through the named **Load
  more runs** control. The deliberately long page-two sentinel appeared, and
  all 51 runs plus the sentinel remained after **Refresh**.
- The selected run loaded 30→31 artifacts through **Load more artifacts**. The
  long page-two artifact name wrapped, and both load-more controls disappeared
  when their bounded collections were complete.
- Provider requests contained exact `per_page=50&page=1|2&status=success` run
  paths and `per_page=30&page=1|2` artifact paths. No GitHub API mutation was
  made; POST traffic was limited to the fixture's smart-HTTP `git-upload-pack`
  fetches.
- At the supported 960×660 minimum/short window, the renderer was 1000×690 CSS
  pixels. Document and body client/scroll widths matched, and measured
  overflow, clipped controls, outside controls, and overlaps were all empty.
- Five actual **View → Zoom in** actions moved the requested base through
  100→110→125→150→175→200%. Auto-fit held the effective scale at 94%; the same
  geometry gate remained clean.
- The first pass caught a real flex-shrink defect in the run-detail **Close**
  button. The header button now keeps its intrinsic width, the exact source was
  rebuilt, and the full 51-run/31-artifact interaction passed.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-actions-pagination.png` | 960×660 | 95,213 | `3250eaee8b6fc69b06dceb6439f04ee45e68351229ac87db003d04c27c4dd7a2` |
| `docs/assets/screenshots/material-actions-artifact-page-two.png` | 960×660 | 83,960 | `5310197657763fc1269639d5b3c8c3998393ae36e6077e71e274877e51dbdb8b` |

The Pages layout was also assembled under the owned run root with all 33
tracked PNGs. Its 23 referenced images and 22 gallery cards loaded at nonzero
natural dimensions. At 960×660 and 390×844, document/body widths matched the
viewport and measured overflow/outside arrays were empty; original desktop and
mobile captures showed both new cards and wrapped captions.

### Publication and cleanup receipt

- Main-repository evidence and both PNGs were committed and pushed at
  `1d81472595b1e01ff457425668cd8afa41f3bf2f`; local, tracking, and direct remote
  SHAs matched.
- The separate wiki's extra job-log and responsive guidance was preserved.
  Home, User Guide, and two local `Images/` assets were committed and pushed at
  `2585cf7977b14d5792a1addb8b9a7c9f944e1e84`; local, tracking, and direct remote
  SHAs matched. The live rendered pages show the new named controls and both
  image links.
- Pages run `29270933754` checked out exact source `1d81472595`, configured
  Pages, assembled the publish directory, and uploaded the `github-pages`
  artifact. The downloaded 3,051,520-byte tar contains both PNGs with the exact
  tracked hashes. Deployment was correctly rejected because
  `mega-feature-update` is not allowed by the protected `github-pages`
  environment.
- The exact app/provider PIDs and ports exited, the dummy credential was
  deleted and read back absent, the hidden desktop was closed once, and the
  containment-checked owned Temp root was removed and confirmed absent. The
  visible desktop, normal app profile, and public provider state were never
  touched.

See `.codex/run-manifests/2026-07-13-actions-pagination-ui-gate.md` for the
complete fixture, request, interaction, geometry, publication, and cleanup
record.

## Legacy M0-M18 milestone summary

| Milestone | Status | Shipped result |
| --- | --- | --- |
| **M0** | **COMPLETE** | CI, Pages, Windows installer/release workflow, README, wiki sources, and screenshot pipeline. |
| **M1** | **COMPLETE** | Token-safe per-account settings repositories with serialized Git history and recovery. |
| **M2** | **COMPLETE** | Persistent browser-style repository tabs with range/regex close controls and rich per-tab styling. |
| **M3** | **COMPLETE** | Reusable Git-backed settings history, diffs, undo/redo, and restore-to-point. |
| **M4** | **COMPLETE** | Draggable non-modal dialogs and Material side sheets that preserve background interaction. |
| **M5** | **COMPLETE** | Notification centre with unread controls, Git-backed event log, and notification history. |
| **M6** | **COMPLETE** | Shared fuzzy/substring/regex search modes, filters, and full regex builder. |
| **M7** | **COMPLETE** | Parallel/sequential multi-clone, URL-only repository export/import, and secure exact-origin clone account fallback with persisted affinity. |
| **M8** | **COMPLETE** | 50–200% UI scaling, auto-fit, and full GitHub organization repository browsing. |
| **M9** | **COMPLETE** | One-click commit/push, schedulers, safe auto-pull, and merge-all branches/worktrees. |
| **M10** | **COMPLETE** | GitHub Actions runs, reruns, workflow dispatch, job detail, and searchable logs. |
| **M11** | **COMPLETE** | Secure localhost MCP/REST agent server, renderer bridge, stdio proxy, CLI, and Preferences UI. |
| **M12** | **COMPLETE** | Desktop Plus quick-win parity: telemetry off, status/sort controls, Material actions, identity, permanent discard, hide-recent, and accessibility tooltips. |
| **M13** | **COMPLETE** | Repository metadata/defaults, pinning/grouping, branch pills, bounded Pull All with exact-origin account fallback, remotes, and submodules. |
| **M14** | **COMPLETE** | History metadata/regex search, commit graph, guarded deletion, SVG preview, and branch presets. |
| **M15** | **COMPLETE** | Multiple stashes per branch and the rebranded Desktop Material CLI. |
| **M16** | **COMPLETE** | Tab-aware multi-window lifecycle, routing, scoping, and serialized profile mutation. |
| **M17** | **COMPLETE** | GitLab/Bitbucket providers, self-hosted GitLab PAT flow, clone browsing, and cross-host PR/status routing. |
| **M18** | **COMPLETE** | Full Material shell and final post-shell polish, including layout, clipping, and accessibility regression coverage. |

Additional shipped work includes the `.gitignore` manager, Build & Run with
toolchain/project handling, multi-remote and submodule managers, fork-owned
updating, and the merge-wave integration fixes listed in Git history.

### Build & Run detection gate

Build & Run now walks bounded nested project roots and presents the project
folder beside every profile name. The detector covers Node package-manager
metadata (including modern `bun.lock` and `packageManager`), Deno, Rust, Go,
.NET, Python entrypoints and packaging files, Java/Kotlin build files, PHP,
Ruby, Swift packages, Dart/Flutter, Elixir/Phoenix, Scala/SBT, Haskell, Zig,
Make, and CMake. Settings and the toolbar use the same stable
`<profile> — <project folder>` display name; long labels wrap in settings and
ellipsize only in the compact toolbar/panel header.

Focused evidence for this gate is in
`app/test/unit/lib/build-run/detect-test.ts` and
`app/test/unit/post-shell-style-test.ts`. The exact production webpack bundles
compile, but this checkout still lacks the packaged Electron runtime and the
native `printenvz` package binary, so an interactive Electron headless capture
cannot be claimed until those dependencies are restored.

## Merged implementation ledger

These are the first paths to inspect when maintaining each subsystem:

- **Profiles, tabs, and history:** `app/src/lib/profiles/`,
  `app/src/lib/stores/profile-store.ts`,
  `app/src/lib/stores/repository-tabs-store.ts`,
  `app/src/ui/repository-tabs/`, `app/src/ui/version-history/`, and
  `app/src/ui/settings-history/`.
- **Notifications and search:**
  `app/src/lib/stores/notification-centre-store.ts`,
  `app/src/ui/notifications/`, `app/src/lib/fuzzy-find.ts`,
  `app/src/ui/lib/filter-mode-control.tsx`, and
  `app/src/ui/lib/regex-builder/`.
- **Clone, organizations, and transfer:**
  `app/src/lib/automation/clone-account-fallback.ts`,
  `app/src/lib/git/authentication-failure-origin.ts`,
  `app/src/lib/git/clone.ts`, `app/src/lib/stores/batch-clone-store.ts`,
  `app/src/lib/stores/cloning-repositories-store.ts`,
  `app/src/lib/stores/repositories-store.ts`,
  `app/src/ui/clone-repository/`, `app/src/lib/repo-list-file.ts`, and
  `app/src/ui/repository-list-transfer/`.
- **Automation:** `app/src/lib/automation/`,
  `app/src/lib/stores/helpers/automation-scheduler.ts`,
  `app/src/ui/preferences/automation.tsx`,
  `app/src/ui/repository-settings/automation-overrides.tsx`, and
  `app/src/ui/merge-all/`.
- **Actions and agent access:** `app/src/lib/stores/actions-store.ts`,
  `app/src/ui/actions/`, `app/src/main-process/same-origin-filter.ts`,
  `app/src/lib/agent-commands.ts`,
  `app/src/main-process/agent-server/`,
  `app/src/lib/agent-command-executor.ts`, `script/agent/`, and
  `docs/wiki/Agent-API.md`.
- **Repository parity:** `app/src/lib/databases/repositories-database.ts`,
  `app/src/ui/repository-settings/`, `app/src/ui/pull-all/`,
  `app/src/lib/automation/pull-all.ts`,
  `app/src/lib/automation/pull-all-account-fallback.ts`,
  `app/src/lib/git/pull.ts`, `app/src/lib/trampoline/find-account.ts`,
  `app/src/lib/trampoline/trampoline-environment.ts`,
  `app/src/ui/history/`, `app/src/ui/diff/image-diffs/`,
  `app/src/ui/stashing/`, and `app/src/cli/`.
- **Providers and windows:** `app/src/lib/api.ts`,
  `app/src/lib/stores/accounts-store.ts`,
  `app/src/main-process/window-routing.ts`,
  `app/src/main-process/app-window.ts`, `app/src/lib/window-scope.ts`, and
  `docs/integrations/`.
- **Material UI:** `app/styles/_material.scss`,
  `app/styles/_material-shell.scss`, `app/styles/ui/`, and
  `app/src/ui/app.tsx`.

## Prior integrated validation evidence

The exhaustive run on the earlier application/test tree shipped by
`b2699faccb07728fe9aa2838aa13355d71e172b0` recorded:

- **1,880 unit tests: 1,879 passed, 0 failed, 1 intentional skip**;
- `yarn lint:src`: **passed**;
- repository-wide Prettier validation: **passed**;
- `yarn tsc --noEmit --skipLibCheck`: **passed**;
- production unpackaged build: **passed** with
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`;
- build and GUI verification through the exact low-level MCP checkout at
  `beed66ca6ed2503e6170ee1e1158247f1c2f0140`;
- isolated HTTPS integration proof: clean advance from
  `dd0bbb04b04da50d42fa55245bc89a1426f01488` to
  `1d58935cf4ef9645f08e2fb3aa68e364ab382676`, with only the redacted
  primary-rejected/fallback-accepted sequence retained;
- the reproducible build emitted `out/`, and Electron was exercised only on a
  uniquely named off-screen Win32 Headless Desktop with isolated fixture and
  user-data paths;
- all captures in that earlier final set were visually inspected at original
  resolution, nonblank, private-data-free, and exactly **1443×992**.

### Secure clone account fallback validation

| Screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| `docs/assets/screenshots/material-agent-access.png` | 110,128 | `644891eaa37c878cb577065822681ee8fd33a018a92e0b89822b43e67393ef93` |
| `docs/assets/screenshots/material-automation.png` | 87,304 | `efe45408a390301294d5e23193b619eec858fcef4abb147d82709513c5bb3843` |
| `docs/assets/screenshots/material-branch-merge-all.png` | 116,134 | `c5cb41e17d67c627758ef43620c255c8272f85ed182a741c086a80d735c8719e` |
| `docs/assets/screenshots/material-history-power-tools.png` | 122,930 | `fe8b6323d77663467b2a6ae887d5e277e31b8dc84f0e35cec2332537ec7fd28a` |
| `docs/assets/screenshots/material-multi-window-menu.png` | 115,719 | `9a6cbcbb4c257eac3312b76f8ed0077a6a123901a6bee9b7793b926a61310c66` |
| `docs/assets/screenshots/material-notification-center.png` | 111,723 | `f8d0cf33723b1c9793d165ab39fd0cec2ccd41b50136d36f6be9c3d34b7d4709` |
| `docs/assets/screenshots/material-provider-accounts.png` | 117,558 | `91ab46ec566676f0c87534f5e72795e31a62adeecf6bf2597e533920ff428cff` |
| `docs/assets/screenshots/material-workspace-changes.png` | 123,162 | `3155b321f9aabb73ee6a40000c69f8931f1915920216818a362ec974cc3a4621` |

Earlier verified captures, including
`docs/assets/screenshots/settings-history-manager.png`, remain tracked; that M3
image is also 1443×992 and has SHA-256
`abbcc34aa02949d2144f008c9ed10b4414f721843890643d65d8e0b9360c3da1`.

### 2026-07-13 guided Git and GitHub evidence

A subsequent exact off-screen run verified three named, task-specific app
functions at **1000×687**. The app presents focused controls and state for these
tasks; it does not expose a searchable list of raw Git/`gh` commands or API
endpoints.

- **GitHub notifications:** the GitHub tab, account selector, inbox filters,
  refresh guard, and complete no-signed-in-account state fit without clipped
  labels.
- **Sparse checkout:** the disabled-state side panel explains cone mode,
  validates repository-relative directories, and provides an explicit review
  step before enabling the worktree change.
- **Shallow clone:** the URL clone form exposes a named toggle and numeric
  commit-depth field, explains current-branch/submodule scope, and points users
  to Repository tools for later deepening.

| Screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-github-notifications.png` | 1000×687 | 81,465 | `53f40a94a6ead19b73c6c3302d0eb60b0effd050c7b018b43dd76d4b2072a354` |
| `docs/assets/screenshots/material-sparse-checkout.png` (historical M19 version) | 1000×687 | 60,070 | `49a7182f5fd9eb7e0a86d6c20a1ed5b5f388b9063c87d033bfef63d42b7b37e7` |
| `docs/assets/screenshots/material-shallow-clone.png` | 1000×687 | 67,271 | `337e7a967b538de22bdd560ff9393ff35619fd1ea76e6ff8aea7827793befd59` |

Each promoted PNG was reopened at original resolution and matched the source
capture's SHA-256. No bundle-import or issue-creation screenshot is included in
this evidence set. Task forms follow a no-page-level-sideways-scroll policy:
labels wrap and action groups stack when practical, while horizontal scrolling
is reserved for spatial code, diff, or log content.

The M19 table is a historical receipt. M24 later replaced the tracked
`material-sparse-checkout.png` with the 1452×1001, 112,506-byte guided Choose
capture whose SHA-256 is
`8ee7149da7eb045bcda347067dcf2d88c32a626829402c97a52df2d60b2a3576`.

## Headless verification environment

- Project: `%USERPROFILE%\Documents\GitHub\desktop-material`
- MCP checkout: `%USERPROFILE%\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP SHA used by the P0 gate: `806d9ba85e4afbc2af58d7499496babfa7c68891`
- MCP endpoint: `http://127.0.0.1:8765/mcp`
- Skill and client: `.codex/skills/verify-desktop-material-headless/`
- Accepted application source/build:
  `5e80e678d062b65a82c0991b352e5a861c7469e5`
- Release runtime: Node **24.15.0** from `.tool-versions`; when system Node 26
  is used for tests, disable its experimental web storage global.

The safety contract is mandatory:

1. Write a run manifest and record the initial dirty-state baseline.
2. Preflight the scheduled MCP task and exact MCP source SHA.
3. Build without downloading dependencies.
4. Create one uniquely named off-screen desktop and one owned Temp run root.
5. Launch the absolute Electron binary with isolated `--user-data-dir` and
   disposable `--cli-open`; save the returned PID and discover the live HWND.
6. Use only HWND-bound background input and `client_only` screenshots. Never
   call `show_headless_desktop`, focus a normal window, or send global input.
7. Treat `rendered_ok` as transport success only; inspect pixels at original
   resolution for blank frames, theme, clipping, private data, and dimensions.
8. Revalidate HWND/PID before close; use exact saved-PID termination only as a
   fallback; close the desktop exactly once; delete only the owned Temp root.

The proof cleanup completed after screenshot promotion. The exact saved app
process was terminated only after its background close request was ignored;
the fixture then stopped through its owned stop marker, both loopback listeners
were absent, the hidden desktop listed zero remaining windows and was closed
exactly once, and both synthetic credential entries were verified absent. The
owned path alias, safe working root, and Temp run root were each resolved to
their recorded exact target before removal and are all verified absent. All
completed agent worktrees were subsequently verified clean and merged before
removal; local `main` was synchronized with `origin/main`.

## M19 final publication and repository evidence

- **Code and CI:** final code/release baseline
  `a0c2f19433631d577979c8c8a88a5151f5ab0656` passed all seven jobs in
  [CI 29274841990](https://github.com/codingmachineedge/desktop-material/actions/runs/29274841990):
  Lint, Windows x64/arm64, macOS x64/arm64, and both packaged E2E smoke lanes.
  The formerly failing Windows x64 and macOS arm64 full-unit lanes both passed.
- **Installer and release:**
  [Build Installers 29274842059](https://github.com/codingmachineedge/desktop-material/actions/runs/29274842059)
  succeeded for exact SHA `a0c2f194…` and published public, non-draft,
  non-prerelease release
  [`v3.6.3-beta3-b0000000083`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000083).
  Its lightweight tag points directly to that commit. Each asset URL returned
  HTTP 200; every asset was streamed independently, and computed bytes/SHA-256
  matched the release metadata:

The complete function-first parity roadmap is now shipped: the P0 four-function
slice, typed operation boundary, Actions run/artifact pagination,
attempt/job/log/re-run, deployment review, fork approval, cryptographic artifact
attestation review/result UI, Actions cache management, bounded PR/Release and
Issue waves, and the named Git functions are all accepted. The complete M19
ledger remains the source of truth for that acceptance.

## 2026-07-13 Actions run inspector production UI gate

The exact unpackaged production build at
`2f40d8949aaa7ae4ce5418cd949c28c643da0a37` passed on the isolated
off-screen desktop. The build used the required no-download production command
and completed in 115 seconds. The visible user desktop was never shown,
focused, resized, or used for input.

This roadmap slice exists as named app functions rather than a command or API
catalogue. The run detail pane selects the latest or a historical attempt,
loads strict 50-job pages, retains page one through a later-page retry, and
sends an exact loaded job to the bounded log transfer or re-run mutation.
Run-level pending deployments and review history load independently; selected
approvable environments use a dedicated required 1–1024-character decision
dialog, while an eligible first-time fork run has a separate confirmation.

Every new API/store surface stays on the repository-selected same-endpoint account. Current jobs use the fixed latest-attempt path, historical jobs use the fixed attempt path, deployment reviews send only normalized environment ids/state/comment, and fork approval is bodyless. Same-run attempt changes abort and generation-guard stale jobs; repository/account/run changes also cancel child work. Artifacts are now correctly labelled as run-level outputs across all attempts.

Focused implementation evidence is green: TypeScript `--noEmit`, targeted ESLint with the repository rule directory, responsive style contracts, and 124/124 Actions checks across 22 suites. Those checks cover strict bounded parsing (including single-byte response streams), fixed paths and bodies, permission-aware bounded errors, exact-account routing, current→historical stale-request cancellation, latest-attempt page revalidation, shortened-page stopping, 50→51 retained retry, exact recovered-job log/re-run targeting, 101-attempt bounded navigation, locked deployment selection, required bounded comments, approval submission, separate fork confirmation, consuming modal scrims, and contained/restored focus.

The deterministic provider checkpoint is also green. Eleven provider tests plus
the live probe cover inspector run `84152` at attempt 2, 51 current and 51
historical jobs, current sentinel `85101`, historical sentinel `85050`, a
one-time current page-two 503, exact bodyless re-run/fork mutations, exact
bounded deployment-review bodies, redirected log content without credentials,
two eligibility-distinct environments, stateful history, unchanged artifact
integrity, and blocked Git receive-pack.

### Interaction, request, and responsive receipts

- The real app loaded the current 50→51 jobs through a deliberate 503→200
  retry, selected attempt 1, loaded its 50→51 historical jobs, opened the exact
  recovered logs, and confirmed the exact loaded job re-run.
- Exact provider links resolved run `84152`, current job `85101`, historical job
  `85050`, and environment `86101`. The isolated provider recorded exactly
  three POSTs: job `85101` re-run (201, bodyless), run `84152` pending-deployment
  review (204, exact normalized body SHA-256
  `32a6c1c2d4615f352f1d0060b11e688d3cf020146027c4ada23d56e82e460be8`),
  and run `84152` fork approval (204, bodyless). No public GitHub state was
  touched.
- A first production pass caught a real short-window defect: the deployment
  dialog footer extended 7 pixels below the renderer because its layer was
  positioned against the tall scrolled Actions view. The layer now uses fixed
  viewport positioning; the exact source was rebuilt and the same modal passed.
- The full interaction passed in a 1000×687 CSS renderer captured at a true
  960×660. Regular-height, supported short-height, and requested 200%-base
  states also passed. Auto-fit preserved the user base while applying a 96%
  effective scale. Document and body client/scroll widths matched in every
  receipt; overflow, clipped controls, outside controls, sibling overlaps, and
  oversized text arrays were empty.
- Job-log, deployment-review, and fork-review dialogs each produced exactly one
  modal and one interactive scrim; focus stayed contained while open and was
  restored after close. The spatial log body remains the sole intentional
  horizontal-pan surface.

| Promoted screenshot | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-actions-jobs-pagination.png` | 960×660 | 111,675 | `0e61eb4e66c20bffbeac76c79eebb9508d44160cb104feb8fc47f2617dc94b90` |
| `docs/assets/screenshots/material-actions-pending-deployments.png` | 944×808 | 98,249 | `6eea1333755d5edad469c8d0d06b8a3d62e43c991e6bc9de5e98080dee75c1bc` |

Both promoted PNGs were reopened at original resolution after copying and
matched their accepted run captures. README, in-repository wiki, and Pages
sources now reference them. The assembled local Pages layout loaded 25 nonzero
images across 24 gallery cards. At 960×660, document/body client and scroll
widths were all 945; at 390×844 they were all 375. Overflow and outside-control
arrays were empty, and original desktop/mobile captures showed the two new
cards with wrapped captions and no sideways scrolling.

### Publication and cleanup receipt

- Primary-repository evidence and both promoted PNGs were pushed at
  `6d00ab73531d5359d821b6fccef2bf9ffffb3035`; local, tracking, and direct remote
  SHA matched with a clean worktree.
- The existing live wiki's newer M19 content was preserved while the Actions
  Home/User Guide sections were merged. Wiki commit
  `e4f4a49a973a442078369c61b7c6da9696fd38a7` is on the direct remote, with both
  screenshots stored as local `Images/` assets. Public Home, User Guide, raw
  sources, and both PNG responses were verified; the images returned 200 with
  the exact 111,675/98,249 byte sizes.
- [Pages run `29283239381`](https://github.com/codingmachineedge/desktop-material/actions/runs/29283239381)
  checked out the exact evidence SHA and passed checkout, configuration,
  assembly, and upload. Artifact `8292133247` contained 41 traversal/link-safe
  entries; its HTML and both PNG Git blobs exactly matched the pushed source.
  Deployment correctly stopped before a runner because the protected
  `github-pages` environment does not allow `mega-feature-update`.
- The fixture remote was restored to its `.invalid` identity. The exact
  loopback dummy credential was deleted and read back absent. Only the
  revalidated owned app, Pages Edge, and provider PID trees were terminated;
  ports `62208`, `62209`, and `64402` were absent afterward. Both owned desktops
  reached zero windows, closed exactly once, and then returned not found. The
  containment-checked run root and separate wiki clone were removed with
  `Test-Path=false`. The visible user desktop remained untouched.

## 2026-07-14 Actions cache and screenshot refresh

The Actions provenance/result UI and cache-manager slice is complete at exact
source SHA `e282eb2fce` on `main`. The cache manager now starts after the repository's
selected-account subscription, survives late Fetch-origin association, and
keeps cache state when a concurrent workflow refresh completes. The page uses a
scrollable vertical layout so long cache keys, refs, usage, and destructive
controls remain visible without page-level sideways scrolling.

The synthetic loopback provider adds three bounded cache records and usage,
single-delete, and delete-by-key routes. Exact headless verification ran on
`DesktopMaterialActionsCache-20260714-8c4f` with the cached Electron 42.0.1
runtime, provider `http://localhost:51008/api/v3`, and renderer CDP port 51111.
The pagination gate loaded 51 successful workflow runs and 31 artifacts with
both page-two sentinels and empty overflow/clipping/outside/overlap receipts.
The cache gate displayed 3 caches using 836.8 MiB, all cache cards, and all
delete controls in an inspected original-resolution 960×660 PNG.

Promoted evidence is referenced by README, the three in-repo wiki pages, and
the Pages gallery:

- `material-actions-cache-manager.png`
- `material-actions-pagination-headless.png`
- `material-actions-artifacts-headless.png`
- `material-actions-sentinel-headless.png`

Focused formatting, TypeScript, Actions cache/store/UI tests (30/30), fake
provider tests (12/12), and scoped ESLint passed. Webpack completed in the
exact `build:prod` command, but packaging remains environment-blocked because
`node_modules\printenvz\build\Release\printenvz.exe` is absent; no dependency
was downloaded or synthesized.

## 2026-07-14 accessibility and clipping gate

The Pages source was exercised in system Edge headless mode at 960×660 and
390×844. Both viewports passed with zero axe accessibility violations, matching
document/body client and scroll widths, and zero visible elements extending past
the horizontal viewport. The existing page gallery remained fully contained at
both widths.

The audit found and fixed two real accessibility defects: the footer skipped
from page-level `h2` sections to `h4` headings, and the in-text roadmap link had
insufficient contrast without a non-color distinction. Footer headings now use
the correct `h3` level, and section links are underlined with a visible offset.

Focused source/style coverage passed 27/27 tests, including the new Pages
accessibility contracts and existing compact-shell, post-shell, Actions, and
responsive style contracts. The exact production webpack bundles also compiled
successfully. The Electron interaction portion could not launch in this checkout
because the installed Electron package has no runtime binary and Playwright's
bundled browser is absent; the build's packaging step remains blocked by the
known missing `node_modules\printenvz\build\Release\printenvz.exe`. No runtime or
dependency was downloaded.

## 2026-07-16 adaptive customization production gate

The exact tested code source, fixed verification checkout, production build,
launched renderer, and captured UI all matched
`c5205838dfc5ee2b7ce80ce488215a2cd903bb26`. The unpackaged production build
completed successfully in 147.1 seconds through the repository's exact
low-level computer-use service. All input, resize, capture, and inspection work
stayed on an off-screen Win32 desktop; the visible user desktop was never shown,
focused, or used for input.

The interaction gate verified:

- all 12 active-profile defaults, six repository-local overrides and
  inheritance, per-tab typography/color persistence, profile local-Git history,
  repository-local config isolation, and restart restoration;
- measured **More toolbar actions** behavior at the clipping boundary, including
  mounted-state/focus continuity and deterministic widening restoration;
- guarded inverse tab close with literal matching, live counts, zero-match and
  pinned-tab protection, plus drag/keyboard arrangement and six stable one-shot
  sorts that persist without reacting continuously to status changes;
- a raised, reduced-motion-safe drag preview with a live before/after insertion
  rail, plus a bounded per-profile/window recently-closed tab history surface.
  History restores the original tab object, including group, pin, favorite,
  label, and appearance, and exposes search, regex opt-in, forget, restore, and
  clear actions;
- exact workflow-run cancellation identity/status revalidation, one normal
  cancellation request, duplicate suppression, accepted-response polling to a
  terminal state, and no force-cancel request;
- current-branch rebase review, fresh ref/repository preflight, deliberate
  conflict routing through the existing continue/abort surface, exact branch
  restoration after abort, and no force push;
- immediate Provider Triage resolution of the exact repository-account binding
  saved in Repository Settings, including restart and refresh without replacing
  a valid explicit binding; and
- compact/zoomed Repository Tools, Remote Manager, Regex Builder, confirmation,
  and popover geometry with named controls, focus return, reachable final
  actions, vertical scrolling where needed, and no page-level horizontal
  clipping.

Focused model/store/UI/migration/stale-state/accessibility coverage, TypeScript,
lint, formatting, diff checks, and the exact production build passed for the
tested code source. Documentation and screenshot publication are committed only
after that fixed source gate; direct fast-forward `main`, CI/Pages, and wiki
receipts therefore belong to the later publication commit rather than being
retroactively claimed for the captured code SHA.

Seven privacy-safe captures were inspected at original resolution:

| Capture | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-welcome.png` | 1440×960 | 146,428 | `28f0b56ef43347fad0bbe7e0bcb824d7c3df2c39e444a022fb7145c51b6991ca` |
| `docs/assets/screenshots/material-customization.png` | 1440×960 | 109,343 | `a9b1493641c69840df6467612dc6f32fa5603404ac5e9b34ac776e7399dc79db` |
| `docs/assets/screenshots/material-toolbar-overflow.png` | 1440×960 | 167,132 | `67d64944736d37dd521028d55557a2bb7a9d42d8940aa8051d2ef875c5f021c5` |
| `docs/assets/screenshots/material-tab-appearance-word.png` | 1440×960 | 167,878 | `4df433b6bf3b58993299032d6d19e0ded5da3acb0a37f53e6b7109686df7a569` |
| `docs/assets/screenshots/material-tab-arrange.png` | 1440×960 | 160,546 | `ce6a43a088b650d14bca158d12776d8dd4dcca5bf89d3f1d52720ddefda85470` |
| `docs/assets/screenshots/material-actions-cancel.png` | 1440×960 | 133,083 | `6dceb918e322b2f30ee574a51e815e32f5d4b272f250811b20202a409bec731c` |
| `docs/assets/screenshots/material-rebase-review.png` | 1440×960 | 153,207 | `145c5b54320116ce41bdc0b17eb9e726a8cb0dbaf0988886011a862d8cc189de` |

## 2026-07-16 profile identity and portable tab workspace

The exact implementation commit is
`4e797f52b9ecb4d77f40bfa1e11629fb2f8e3b95`. It adds a persistent,
profile-backed **App identity** editor with a shared live/title-bar brand,
validated built-in or custom logos, geometry, borders, shadows, colors, and
Word-style name typography. Font, width, weight, case, size, spacing, opacity,
bold, italic, underline, strikethrough, small caps, highlight, and fixed text
effects restore across restart without changing the signed executable or
operating-system icon. Migration retains unknown newer identity and tab-style
keys while validating every known field before persistence or CSS use.

Repository tabs now support favorites, favorites-first/last stable one-shot
sorting inside pin groups, local repository-folder drop to add/open/switch, and
bounded JSON export/import of the current order, active tab, aliases, pins,
favorites, and appearance. Runtime ids and credentials are excluded; malformed,
oversized, relative-only, duplicate, and missing-path entries fail or skip
safely, and a replace import never destroys a usable session when no repository
can be resolved. Appropriate shell, title, tab, and repository surfaces expose
right-click customization plus the exact profile-history or repository Git
ownership path; editable and specialized context menus retain priority.

The complete runner passed 1,218/1,218 tests across 420 files and 306 suites.
TypeScript, scoped ESLint/Prettier, staged diff and secret scans, focused
accessibility/context/session tests, and the exact MCP production build passed.
The build used the fixed low-level service and returned successfully in 170.5
seconds without downloading dependencies.

All interaction stayed on off-screen desktop
`DesktopMaterialScreenshotRefresh2026071601`. Because native hidden-HWND resize
was unavailable, the approved CDP viewport fallback verified all 38 unique
identity controls at a 645×645 renderer viewport. Document, body, preference
pane, and identity surfaces had matching client/scroll widths; no required
control clipped horizontally. Restart restoration, the eight arrange actions,
favorite state, export/import dialogs, and folder-drop overlay passed their
bounded geometry gates. This native-width limitation is explicit; the renderer
gate did not claim a second native resize mechanism.

The freshly rebuilt MCP screenshot
`docs/assets/screenshots/material-app-identity-workspace.png` is 1443×992,
166,398 bytes, SHA-256
`45504266edf337f36a5a6bde0932e1b7ab740d33009e7d8c04a866979e506533`.
README, Pages, and wiki sources share the asset. Fifty-five distinct published
screenshot references resolve locally with none missing; Pages presents 54
unique gallery images and the guided wiki table catalogs 53. The screenshot was
inspected at original resolution and contains synthetic state only.

Exact owned PID/HWND pairs `11388`/`315884768` and `2148`/`54920934` were
gracefully stopped, the hidden desktop reached zero windows and closed once,
and the containment-checked Temp root was removed. The visible desktop and
unrelated Electron processes were untouched. The foreign OAuth-scope manifest
remained untracked and byte-identical; the detached release worktree was not
modified.

## 2026-07-16 final repository integration and cleanup

The integration baseline immediately before this memory-only update is
`ea76808dca482d2ce6f78c1fb5de27a6dc6f2462`. Both previously untracked run
manifests are committed. Detached worktree commit
`991b57bc1b098e78e4ae43b1ac0b1b76fb74ebe3` is merged into `main`, and the
superseded Pull All stash commit
`183ee8648e77be6b43b3899d3b81c4361099504a` is retained as merged history
without replacing the newer published implementation. Both integration merges
preserved tree `28e5840b55d989cc8ef0514f1f3c2ca5673a41b8` exactly.

The stash was dropped after its commit became reachable from `main`. The clean
detached worktree at
`%USERPROFILE%\.codex\worktrees\3e3c\desktop-material`, its empty
parent directory, and stale worktree metadata were removed. The final audit at
that baseline reported zero dirty files, zero stashes, no unmerged local or
remote branches, one local branch (`main`), one remote branch (`origin/main`),
one canonical worktree, and `0/0` divergence between `main` and `origin/main`.

## 2026-07-18 optional Desktop Material feature highlighting

The current publication changeset adds a thirteenth profile-backed Appearance
default: **Highlight Desktop Material features**. It is off by default and uses
the existing version-1 appearance object, profile persistence, local Git-backed
Settings History, live preview, and Cancel rollback. No parallel store, schema
version, storage key, or repository-local override was added. The normalizer
accepts only a real boolean and old version-1 profiles migrate naturally to
`false`.

When enabled, `AppTheme` installs one `data-dm-highlight-features` body gate.
Only explicit `data-dm-feature` entry points receive the non-animated accent
edge plus compact `M` or full **Material** badge. The reviewed inventory covers
repository Actions, Releases, Issues, API, Triage, and Tools; Settings Agent
access and Automation; repository-tab search, arrange, new-tab, notification,
and settings-history controls; the Commit & Push, Build & Run, and theme
toolbar controls (including overflow); and a centralized allowlist shared by
the app menu and command palette. Changes, History, Branches, Accounts, Git,
Appearance, and other upstream/mixed surfaces remain deliberately neutral.

Focused persistence, UI, theme-side-effect, responsive-marker, shell,
Settings-toggle, and allowlist coverage passed `28/28` tests across seven
files. All 554 repository unit-test files passed in three batches in `516.9s`;
script tests passed `16/16`; deterministic provider tests passed `14/14`; root
and script TypeScript, repository-wide no-cache ESLint, and repository-wide
Prettier passed. The configured Markdownlint command is not a clean Windows
repository gate: its recursive glob includes nested dependencies and reported
54,084 baseline diagnostics, so this milestone does not claim a Markdownlint
pass.

The fixed MCP preflight was healthy at `127.0.0.1:8765`; its scheduled task
points to checkout `8d6940be6a5f6e7c37de3f73acd2259fa7651efe`. A temporary
Yarn shim came strictly from the existing local npm cache, delegated to pinned
Yarn `1.21.1`, and the exact required final production build passed in `229.1s`
(`yarn` reported `227.46s`). The shim was removed and `where yarn` was absent.

The final rebuilt UI run stayed on Win32 desktop
`DesktopMaterialHighlightFinal-20260718-2015` (handle `1044`). Provider and
launcher PIDs `32220`/`20420` used loopback port `52821`; exact launch PID
`7260` resolved to HWND `20251006`, with CDP on `9347`. The accepted light
Appearance capture is 1440×960, 137,390 bytes, SHA-256
`3e7cfc236741dc9873e4e3dace1d25e58b57c73464ed026a45e56c44eda53b08`.
A final 1440×960 dark capture, a 600×240 compact shell capture, and a true
300×400 narrow Settings capture were inspected for contrast, compact `M`
replacement, hidden-label behavior, scroll reachability, and clipping. The
native off-screen helper could not close the revalidated HWND, so only saved
launch PID `7260` was terminated as the documented fallback. The desktop then
reported zero windows and closed; both loopback ports reached zero listeners;
both provider processes stopped; and containment-checked cleanup removed the
exact owned Temp root. The visible desktop and unrelated Electron processes
were untouched.

The tracked `material-customization.png`, README, Pages, and wiki sources now
describe the default-off discovery treatment.

### Publication and cleanup checkpoint

- Final diff review found no unrelated or actionable changes. Diff/staged
  checks and both pre-stage and staged secret scans passed. Commit
  `7134b380b166a97240cbed2ceb1a181c1bc61b15` (`Add optional Desktop Material
  feature highlights`) was pushed without rewriting history, and `origin/main`
  resolved to that exact source before this receipts-only update.
- [CI run `29667316652`](https://github.com/codingmachineedge/desktop-material/actions/runs/29667316652)
  succeeded for that exact SHA. All seven jobs passed: macOS x64, macOS arm64,
  Windows x64, Windows arm64, both packaged E2E smoke jobs, and Lint.
- [Installer run `29667316628`](https://github.com/codingmachineedge/desktop-material/actions/runs/29667316628)
  succeeded for that exact SHA, including build, signing, packaging, collection,
  and publication. It published non-draft release
  [`v3.6.3-beta3-b0000000161`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000161)
  with `RELEASES`, full and x64-full NuGet packages, an x64 EXE, and an x64 MSI;
  both the lightweight tag and release target resolve to the feature commit.
- [Pages run `29667316623`](https://github.com/codingmachineedge/desktop-material/actions/runs/29667316623)
  succeeded for that exact SHA. The live site returned HTTP 200, and its PNG
  plus raw `main` are byte-identical to the tracked 137,390-byte evidence at
  SHA-256
  `3e7cfc236741dc9873e4e3dace1d25e58b57c73464ed026a45e56c44eda53b08`.
- Wiki `master` was committed and pushed at
  `b0daf7df5f63ebc055ccf2c07e962bbb4b7ee939` (`Document optional feature
  highlighting`). Raw Home carries the image and updated `13 app defaults`
  text. The clean, containment-checked disposable wiki checkout was removed
  after remote proof.
- Before this documentation-only receipt update, topology was one clean `main`
  checkout at exact `origin/main`, only local/remote `main`, no stash or
  unmerged work, and `0/0` divergence. Both owned headless roots, the temporary
  wiki checkout, temporary Yarn, and loopback listeners `9347`/`52821` were
  absent. The user-supplied export ZIPs were untouched. Revalidate that same
  invariant after pushing these receipts and confirm the documentation path
  filter does not publish another installer release.

## 2026-07-18–19 CI recovery and temporary submodule navigation

### Local outcome

The July 18–19 changeset repairs the Windows packaged-E2E updater-port failure
and adds **Open as repository** for initialized Submodule Manager rows. The
opened child is a temporary negative-ID repository: it is absent from the saved
repository database, repository list, Recent group, persisted last selection,
and persisted tab collection. A context bar returns directly to the persisted
root repository, including from nested temporary navigation. Appearance now
stores exactly English, playful Hong Kong Cantonese, or bilingual presentation,
plus Tonal/Filled accent/Outlined and Back to parent/Parent name/Icon only
presentation for the Back action.

That explicit profile selection supersedes the earlier locale-derived behavior
recorded in the historical internationalization receipt above. The older text
remains provenance for its original source rather than a description of the
current language contract.

The CI action selects one exact loopback `/update` URL for both the production
bundle and runtime mock server. Installer publication is now downstream of
successful CI for the exact same-repository `main` SHA; manual dispatch runs the
same reusable CI gate; existing tags and missing or empty required assets fail;
and one successful eligible run contains one release-publication action. This
local receipt does not claim the still-pending remote result.

### Exact build and headless environment

- Run id: `20260718-232824-ci-10-pass-submodule-navigation`.
- Low-level MCP checkout:
  `8d6940be6a5f6e7c37de3f73acd2259fa7651efe`, served at
  `http://127.0.0.1:8765/mcp`.
- Off-screen Win32 desktop: `DesktopMaterialDebug10-20260718-232824`.
- It was created exactly once; all app interaction and capture stayed on that
  desktop, leaving the user's visible desktop and unrelated Electron processes
  untouched.
- Owned synthetic provider: PID `12096`, loopback port `50158`.
- App-native CDP transport: loopback port `62241`. Native HWND targeting was
  retained for the headless transport proof; app-native CDP was the documented
  renderer fallback when hidden Chromium actions rejected native automation.
- The earlier accepted exact production build returned zero in **215.38
  seconds** (**217 seconds wall time**). After the later stale-parent
  correction, the same MCP command rebuilt the renderer, but its client stream
  detached before returning a receipt. The fresh bundle passed the final
  duplicate Open/Back race regression documented in
  `.codex/run-manifests/2026-07-19-final-exact-race-regression.md`.

| Runtime stage | PID | HWND |
| --- | ---: | ---: |
| Diagnostic launch | 20380 | 67830826 |
| Accepted passes 1–4 | 6048 | 19464818 |
| Pass 5 and initial pass 6 | 17732 | 48956738 |
| Persistence-build verification | 13272 | 19661426 |
| Tokenized passes 6–9 before localization correction | 8624 | 73991674 |
| Final localized pass 9 and pass 10 | 32600 | 83101264 |
| Log-loop-fixed provider launch | 16460 | 90637818 |
| Fixture published-remote relaunch | 23188 | 56230330 |
| Final branch-rules environment launch | wrapper 24136; Electron main 5116 | 86050108 |
| Final post-build regression | wrapper 28356; Electron main 25584 | 62588622 |

The retained verifier state finished at pass 10 with one persistent repository,
one persisted repository tab, checked-out child `modules/material-widget`, and
uninitialized control `modules/dormant-addon`. Each pass reset known state before
interaction, rejected blank/error frames, and advanced the durable pass ledger
only after all assertions and the final direct CDP capture succeeded.

### Ten accepted passes

| Pass | Accepted capture | Dimensions | Bytes | SHA-256 |
| ---: | --- | ---: | ---: | --- |
| 1 | `pass-01-launch-final.png` | 1440×960 | 110,384 | `21f098f11388e1b57028dbcf9288e51272932b9a8a14cd150d6a2e04766a981e` |
| 2 | `pass-02-manager-final.png` | 1440×960 | 140,353 | `2e883f275f7c888404a959d51be5dac0c88cf46fa39a343d4795315efd53c40d` |
| 3 | `pass-03-child-context.png` | 1440×960 | 103,250 | `25de28cb43ea3031f20788a52638095b0272b73424f4e36d7e43657ab7f381b0` |
| 4 | `pass-04-back-parent.png` | 1440×960 | 122,228 | `bec6bf8e2ae957ab8544df68babf12e6fffe88be179e0e88e996878619119ff5` |
| 5 | `pass-05-restart-policy.png` | 1440×960 | 140,116 | `a5402d2eb7b2a545c965eb0ce3a217a12a4fa634c7e85695ae050a3205b6e28e` |
| 6 | `pass-06-appearance-tokenized.png` | 1440×960 | 136,786 | `4e511ff542907575633335ffdd8d8eb379b13b3a2f5c08e32ca6cf51b4298169` |
| 7 | `pass-07-compact-keyboard.png` | 700×650 | 63,406 | `6cbbf7a893dbb0b5d111057364d040e1a57a6c42d30f2b392cb022fee6c2415d` |
| 8 | `pass-08-dark-200.png` | 640×480 | 61,722 | `2f79c502ce72fd4cfafe44b12ffd35e58d23ff703d507e6441e4ef846c3f37cf` |
| 9 | `pass-09-languages-localized.png` | 700×650 | 77,064 | `62c02c1040ecae78bfed9f7f24841b546719815994a772eaa1cd524c4ff9b4f9` |
| 10 | `pass-10-regression.png` | 1440×960 | 164,471 | `f86886bae8848f73bd35015cc9b87ba0dc3f2438c09791439347f2f697e71f0c` |

The passes proved fresh launch and identity; initialized/uninitialized manager
gating; child Git scope and persistent-database invariants; exact Back focus and
parent restoration after child changes; restart fallback without repository or
tab pollution; Appearance live preview, Save, Cancel, and legacy fallback;
keyboard-only compact operation; dark and 200%-requested auto-fit behavior; all
three language modes and localized stale recovery; and final Changes, History,
Actions, Notifications, Releases, Repository Tools, and Settings regressions.

The additional inspected stale bilingual frame was 1443×993 and 163,335 bytes
at SHA-256
`33a595e1faf1b7ade1b523c254ef826c0a9e5239c84a184a84e7cfe6f6b50a6b`.
The provider regression captures were Actions at 1440×960 and 109,546 bytes
(`bd682b6f465012f0737fd6e47eb054bdb58333c13d2eaaffdf092523b0529325`)
and Releases at 1440×960 and 146,415 bytes
(`8dea0b61a0da101c730cb93e3534b5281d9aa3392c75acef8a1944cc36fbc1fb`).
The same sweep accepted the effective-branch-rules state at 1440×960, 162,231
bytes
(`6a391269c74dd638687100651f023d727667b47960ab2353a1717fde96037ba8`).

Two 2160×1440 pass-1 candidates were rejected because Playwright inherited the
Windows 150% device scale rather than the requested renderer pixels. Direct
`Page.captureScreenshot` produced the accepted exact-size frames. Other
intermediate frames were retained only for debugging when stale tooltip CSS,
incomplete async waits, or pre-fix localization made them unsuitable for public
evidence.

### Bugs found and corrected

- The verifier continuously checks the persistent repository database, tab
  count, and last-selection boundary instead of relying on UI cardinality alone.
- Toolbar and navigation-rail selectors, async view waits, notification-panel
  timing/close behavior, and capture-only tooltip cleanup now survive renderer
  replacement and delayed surfaces without leaking state into later passes.
- Windows directory `fsync` no longer turns a successful settings write into a
  platform-specific failure.
- Profile lock recovery distinguishes a reused process ID from a different
  renderer lifetime and safely restores the serialized profile writer.
- A temporary workspace that later fails path/Git revalidation clears its
  caches and returns to the persisted root with localized error copy.
- Temporary negative IDs remain memory-only for branch visibility and are
  ignored by repository automation, pending-tag, settings, hosted-association,
  worktree-mutation, and repository-bound notification persistence.
- The log-history profile no longer recursively records its own Git bookkeeping
  until the renderer stalls. A failing history commit disables and clears its
  own queue before reporting, and timer/direct commits suppress the history sink.
- Localized copy now lives in separate resources and renders through semantic
  localized spans, preserving separators, bilingual hierarchy, and concise
  accessible names across navigation, configuration, Appearance, and CI status.
- A comprehensive last-boundary audit guards branch, tag, stash, reset, merge,
  rebase, network, remote, worktree, submodule, subtree, sparse-checkout,
  large-file, automation, shell/editor, and window-launch mutations. Temporary
  Repository Tools is read-only; cache generations, listeners, and abort
  controllers cannot leak delayed child state back into the root workspace.
- Installer publication checks immutable-tag availability and exact
  `origin/main` twice: before packaging and immediately before publication.
  Query failures are fail-closed, and the release-PR workflow explicitly has
  `contents: read`.

### Final local code and runtime gates

- Stable focused tests: **237/237**.
- Temporary-context lifecycle subset: **66/66**.
- Localization subset: **32/32**.
- Supervised full `node script/test.mjs`: all **562** test files passed in three
  batches; **3,986** tests passed, **one** was skipped, and the final batch was
  **537/537**.
- Script tests: **16/16**.
- TypeScript, full lint, changed-workflow actionlint, and `git diff --check`:
  **passed**.
- Earlier accepted exact MCP production build: exit `0` in **215.38 seconds**
  (**217 seconds wall time**). The later stale-parent rebuild had a detached
  client stream, so no duration or exit code is claimed; its fresh bundle passed
  the final off-screen race regression.

The final built bundle then reopened the child and confirmed its context bar,
unchanged persistent repository count, customizable Back control, and read-only
Repository Tools boundary. The inspected 1440×960 child frame was 134,223 bytes,
SHA-256
`53bae0c04eccedbafa4dbb749151b00df4d95fadce701758259ffd049fdc89ad`.
Back restored the root in a second inspected 1440×960 frame, 159,924 bytes,
SHA-256
`e11956f58a18216bd90b65276890f86579e0bdd1b559268a139861fe2f94dcf0`.
Both were nonblank, unclipped, and private-data-free at original pixels.

The log-history repository remained at HEAD
`af8c8e91c8d99f0bf99f05dd46c7903d2ef9baf1`, count `22682`, and clean status
across eight idle seconds. Before its owned run root was deleted, the fixture
root was at `5f4cc173` with only the expected modified submodule pointer; child
`modules/material-widget` was clean at `de377c26`.

The exact app/wrapper and provider/launcher processes were stopped. Listeners
`62241` and `50158`, the owned credential entry, the headless desktop, and the
entire containment-checked run root were independently confirmed absent. The
visible desktop and unrelated Electron processes were never touched.

The final privacy audit rejected the first Repository Tools pair because its
introductory path exposed the verifier account's Temp directory. The pair was
recaptured from the same production bundle against the synthetic
`C:\DesktopMaterialEvidence-20260719\fixture` checkout; the compact scene now
also proves an actual scroll of the function list. Both replacements passed
original-pixel inspection. Exact PID `5608`, listener `62243`,
`DesktopMaterialPublicTools-20260719`, and the neutral evidence root were closed
or removed and confirmed absent.

### Promoted public screenshots

All six frames were inspected at original resolution for exact dimensions,
nonblank pixels, clipping, theme, synthetic-only data, and private-data absence
before promotion.

| Asset | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/assets/screenshots/material-repository-tools.png` | 1440×960 | 124,544 | `670295d148df32c1796951363a1cde5ddb4aa7b31ce3142e2a50949b7e56c398` |
| `docs/assets/screenshots/material-repository-tools-scroll.png` | 960×420 | 68,162 | `4b47645776429875394280f0e5584aacf28988d2dcf2ccc79793e929a68f46f3` |
| `docs/assets/screenshots/material-effective-branch-rules.png` | 1440×960 | 162,231 | `6a391269c74dd638687100651f023d727667b47960ab2353a1717fde96037ba8` |
| `docs/assets/screenshots/add-submodule-dialog.png` | 1440×960 | 145,009 | `4c441e7d9757b6627e930bb9d43a39c86e38d408cc568b1c1ca874484b808a2a` |
| `docs/assets/screenshots/material-customization.png` | 1440×960 | 165,740 | `478009bd887a067d007627a531206750bdb9e95508ec9860c609e8c090db2f15` |
| `docs/assets/screenshots/material-submodule-context.png` | 1440×960 | 103,250 | `25de28cb43ea3031f20788a52638095b0272b73424f4e36d7e43657ab7f381b0` |

### Publication checkpoint — implementation and correction

- Initial implementation SHA
  `751c9aef03a39f8e26caccbbf0949d221f870174` reached
  [Pages 29696036761](https://github.com/codingmachineedge/desktop-material/actions/runs/29696036761)
  and [CodeQL 29696036719](https://github.com/codingmachineedge/desktop-material/actions/runs/29696036719).
  CI [29696036744](https://github.com/codingmachineedge/desktop-material/actions/runs/29696036744)
  failed only on macOS arm64: Git classified a redirected checkout as
  uninitialized before the no-follow guard could report its symlink/junction.
  The downstream Build Installers run `29696890850` was therefore skipped and
  did not create a release.
- Corrective SHA `98d93ccc8e6be4b5ae43c8166273157dfc8eef9c` separates declared
  submodule lookup from initialization enforcement and resolves the physical
  path first. All seven jobs in
  [CI 29696805239](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805239)
  passed, including macOS arm64 and Windows x64 packaged E2E; [CodeQL
  29696805243](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805243)
  also passed.
- [Build Installers 29697597981](https://github.com/codingmachineedge/desktop-material/actions/runs/29697597981)
  passed and published non-draft, non-prerelease
  [`v3.6.3-beta3-b0000000165`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000165)
  targeting exactly `98d93ccc8e6be4b5ae43c8166273157dfc8eef9c`. Its five
  non-empty assets are `RELEASES` (102 bytes), x64 MSI (309,559,296 bytes), x64
  EXE (309,954,048 bytes), and the canonical and x64 full `.nupkg` files
  (309,832,995 bytes each). Their API digests are recorded in the release.
- Pages `29696036761` returned HTTP 200 for the live site and all six promoted
  screenshots; each PNG was byte-identical to its tracked SHA-256 record in the
  table above. The initial deployment remains valid because the correction did
  not modify the promoted assets.
- Owned credential/provider/CDP/desktop/temporary-root cleanup: **COMPLETE
  LOCALLY**. The succeeding documentation-only publication and final clean
  topology proof are deliberately recorded in the canonical wiki after its own
  independent CI/release cycle, preventing a base-repository release loop.

The repair baseline remains CI run `29671087941` at source
`19c1e2a06d0746f4c371d37a1c102ae961011f90`: only Windows x64 packaged E2E
failed, while both macOS packaged-E2E jobs, both Windows build jobs, both macOS
build jobs, and lint succeeded. The failed-SHA release is immutable historical
state: installer run `29671087924` and release
`v3.6.3-beta3-b0000000163` are not reused, deleted, or rewritten.

## Maintenance constraints

- Keep account identity on `endpoint#id`; never collapse provider accounts by
  login or host alone.
- Keep profile settings, tab mutations, history operations, and multi-window
  updates on the serialized profile queue.
- Keep secrets out of profile/notification Git repositories, exports, logs,
  screenshots, and agent responses.
- Keep Pull All fallback limited to HTTPS auth/not-found ambiguity and
  token-bearing exact-origin accounts, with repository preference plus stable
  order. Never retry SSH/non-auth failures, expose the selector to Git children,
  relax same-origin fail-closed behavior, or force it across submodule origins.
- Keep clone fallback limited to the HTTPS auth/not-found ambiguity reported by
  the rejecting exact origin, including its port. Preserve hosted selection,
  proactive eligible generic-account selection, no-eligible-only unforced
  behavior, successful-account persistence, and the internal-only selector;
  never add a credentials-dialog fallback.
- Keep agent access localhost-only, opt-in, token-gated, origin-checked, and
  response-redacted.
- Preserve Material token usage when adapting upstream or Desktop Plus code;
  do not import their branding or SCSS wholesale.
- Keep named Git and GitHub workflows responsive: prefer wrapping and stacked
  controls over page-level sideways scrolling, with spatial code/diff/log
  surfaces as the narrow exception.
- `build-installers.yml` intentionally publishes exactly one uniquely tagged
  release after CI succeeds for every same-repository `main` push, including a
  documentation-only push. Verify the exact SHA, CI gate, release target, and
  required non-empty assets for each final push; never assume a docs-only push
  is skipped.
## 2026-07-21 CI FFmpeg recovery and Super Express Release

- CI run `29877231968` failed before build/test execution because the exact
  dependency-cache validator searched only for `ffmpeg`/`ffmpeg.exe`, while
  Playwright stores platform payloads as `ffmpeg-linux`, `ffmpeg-mac`, or
  `ffmpeg-win64.exe` under a versioned `ffmpeg-*` directory. Commit
  `239a87669c` updated the bounded two-level sentinel and its source-contract
  test, passed 2/2 focused checks locally, and was pushed to `main` without
  waiting for the replacement CI run.
- `.github/workflows/super-express-release.yml` adds a separate
  `workflow_dispatch`-only emergency lane. It accepts only a `main` dispatch,
  checks out the exact SHA, restores the exact dependency cache, skips lint and
  all test suites, builds/packages Windows x64 directly, verifies the complete
  Squirrel/installer/portable payload, writes a local note from the checked-out
  commit, and preserves an uncompressed seven-day artifact before optional
  create-only release publication. The fast lane intentionally skips the
  history-aware TypeScript notes generator so its token/release-history lookup
  cannot block an emergency installer.
- Super Express versions combine the package base with its run number and
  attempt, keeping NuGet-compatible unique immutable tags. The workflow has no
  shared concurrency group, so a newer dispatch cannot cancel an older one.
  Existing-tag, missing/empty asset, release-target, or draft verification
  failures stop publication without replacing prior assets.
- Local verification passed 4/4 focused CI/workflow contract tests, Prettier for
  both workflows and tests, and `git diff --check`. Remote execution and an
  actual Super Express publication remain external verification.

## 2026-07-25 Standalone Ollama settings tab

- `PreferencesTab.Ollama` is a real rail tab (`octicons.hubot`,
  `data-dm-feature`) appended last in the enum so the existing
  `tabToVisualIndex`/`visualIndexToTab` shift for a hidden Copilot tab keeps
  working unchanged. The Copilot pane's own Ollama route is untouched.
- `app/src/ui/preferences/ollama.tsx` renders `OllamaModelManager` directly.
  The manager already accepted a structural `IOllamaManagerProvider`, so no
  Copilot access state, account, or licence is involved on this path.
- Unconfigured state: an endpoint field prefilled with
  `http://127.0.0.1:11434`, validated through the existing
  `isTrustedOllamaEndpoint` / `normalizeOllamaEndpoint` loopback rules, an
  `/api/version` health probe, then persistence of a provider identical to the
  Copilot dialog's Ollama preset (`type: openai`, `authKind: none`,
  `wireApi: completions`, `integration: ollama`, `<origin>/v1`) through the
  existing `updateCopilotBYOKProvider` seam, which treats an unknown id as an
  add. Connect stays enabled for an invalid endpoint so the reason is announced
  in an `aria-describedby`-linked alert instead of being hidden behind a
  disabled control; a non-loopback host is rejected before any request is made.
  A failed probe or failed save leaves the tab unconfigured rather than
  appearing connected.
- Contracts updated: feature-registration-completeness (rail call plus two case
  arms), `responsive_surface_catalog.json` preferences group and its pinned
  counts 88→89 and 87→88, settings-search (`copilot-ollama` retargeted and
  split into `ollama-manager` and `ollama-chat` on the new tab, plus a
  `settingsTabNameKey` arm), palette `palette:ollama-model-manager` and
  `palette:ollama-chat` now open the new tab while `palette:preferences-copilot`
  still opens Copilot, and 22 new translation keys across the union, English,
  and Cantonese catalogs.
- Local verification: Prettier clean, `npx tsc --noEmit` clean, `yarn lint`
  clean, and 194/194 tests across 18 files for the ollama, preferences,
  registration, responsive, settings-search, palette, and i18n suites
  (`Test file accounting: 18/18 discovered file(s) produced results across 1
  batch(es); 194 test(s) reported.`). One earlier batch run flaked on two
  pre-existing timing-sensitive tests (`enforces request deadlines against a
  native socket` and `aborts and clears an in-flight reply when another chat is
  opened`); both pass in isolation and on re-run, and neither touches this
  change. Push was explicitly out of scope for this task, so the work stays on
  `feat/ollama-settings-tab`.

## 2026-07-31 recurring background Git and indicator errors

- Production evidence separated the notification pair. The raw
  `error launching git: Access is denied.` came from
  `git rev-parse --verify HEAD` while an appearance settings repository
  initialized. The generic background-action notice came from an unhandled
  GitLab provider rejection in `RepositoryIndicatorUpdater`. A third,
  independent `log-history` commit failed on a corrupt loose object and remains
  fail-closed; it is not part of this cross-window-safe repair.
- `app/src/lib/git/transient-launch-retry.ts` gives only the exact hook-free,
  read-only startup probe two retries after 75 ms and 250 ms. Matching accepts
  localized Windows launcher messages, cancellation prevents a later launch,
  and mutating commands are never eligible.
- `repository-indicator-updater.ts` catches each repository failure, continues
  to the next repository, and reschedules in `finally`; the timer callback also
  observes an unexpected cycle rejection.
- Local evidence: 6/6 focused tests pass across the launcher and updater suites;
  changed-file ESLint and Prettier pass;
  TypeScript no-emit passes. The pre-containment production tree built
  successfully through the off-screen Lowlevel MCP in 551.00 seconds. The
  final exact-tree production build and headless runtime acceptance follow
  before publication.

## 2026-07-31 automatic submodule add recovery

- The production add flow could stage `.gitmodules`, later find its working
  file absent, and surface Git's `please make sure that the .gitmodules file is
  in the working tree` refusal. After ordinary destination validation,
  `restoreMissingGitModulesFromIndex` now reads only the valid stage-0 blob and
  publishes it with an exclusive create; it never overwrites an existing file
  or invents configuration, and removes its owned inode after a failed write.
- Commit-time Cheap LFS preparation no longer submits Git metadata paths such
  as `.gitmodules` to the explicit pointer scanner. The downstream commit-key
  safety gate still evaluates every selected file, so unsafe pointer spellings
  remain fail-closed while normal submodule declarations and gitlinks commit.
- Focused evidence includes the real fixture-backed `.gitmodules` restoration,
  metadata filtering in `cheap-lfs/pointer-test.ts`, and the existing modified
  gitlink regression in `cheap-lfs/operations-test.ts`.

## 2026-07-26 `write EOF` crash — peer-closed stream writes

Branch `fix/write-eof-crash` (not pushed; push was explicitly out of scope).
Fixes the user-reported unrecoverable dialog from build `zadtrqvojl`:
`Error: write EOF at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87:19)`.

- Root cause, reproduced byte-for-byte before any fix: `writeGitHubCliInput` in
  `app/src/main-process/github-release-transfer.ts` attached a per-write
  `child.stdin.once('error', …)` and removed it from the write's own completion
  callback. When a multi-megabyte write to the `gh api --input -` stdin pipe
  completes with `UV_EOF` (the `gh` child exited — an expiring token forcing
  re-authorization is the everyday cause), Node reports the failure twice: the
  callback first, then an `'error'` event on the stream a tick later, by which
  point the listener was gone. Unlistened `'error'` in the main process →
  `handleUncaughtException` → `CrashWindow`. `endGitHubCliInput` had the same
  shape.
- Guards added: a permanent `child.stdin` guard installed with the `gh` child
  plus writability checks in both stdin helpers; try/catch around the Electron
  `ClientRequest.write`/`end`; error listener ordering and a single guarded
  reply helper in the trampoline server (always-reply semantics preserved);
  request/response/connection/`clientError`/post-bind server guards in the
  agent server; the previously listener-less hooks proxy-process server; and
  permanent guards replacing `once('error')` on the ORAS and Docker credential
  helper stdin pipes.
- Process backstop: `app/src/lib/peer-closed-stream-error.ts` classifies only
  errors carrying the shape of a peer-closed stream write (errno code plus an
  I/O syscall, Node stream-state codes, or an anchored message form — needed
  because `withSourceMappedStack` and `getIpcFriendlyError` both flatten an
  error to `{ name, message, stack }`). Main-process `uncaughtException` /
  `unhandledRejection`, the `uncaught-exception` IPC handler, and the renderer
  handler contain a match as a logged non-fatal plus a non-blocking notice
  (new `contained-background-failure` main→renderer channel, no detail in the
  payload). Everything unrecognized stays as fatal as before.
- Note for whoever wires OAuth work: this app has **no** OAuth loopback HTTP
  listener. Sign-in and re-authorization use the `x-github-desktop-auth`
  protocol deep link; the local HTTP responder a browser can disconnect from is
  the agent server, which is guarded above.
- Local verification: `tsc --noEmit` clean; Prettier clean for every touched
  file (the repo-wide check still flags
  `.github/workflows/cheap-lfs-cloud-compression.yml`, which is untouched here
  and already reformatted on `main` — this branch's base predates that commit);
  `eslint --rulesdir ./eslint-rules` clean across `app/src`, `app/test`,
  `script`, `eslint-rules`, and `changelog.json`; targeted suite green. New
  tests in `app/test/unit/peer-closed-stream-error-test.ts`,
  `app/test/unit/trampoline-peer-close-test.ts`,
  `app/test/unit/agent-server-peer-close-test.ts`, and
  `app/test/unit/main-process/github-release-transfer-peer-close-test.ts`; the
  stdin fixture reproduces Node's real double-report ordering and was confirmed
  to fail against the pre-fix code.
- Docs: `docs/features/quality-and-reliability/peer-closed-stream-writes.md`
  plus its category index entry.

## 2026-08-02 closeout publication, CI recovery, and roadmap foundations

The closeout range from `b637f07e0e` through `55ecff5946` is published on
`origin/main`. It includes the completed bug/UI checkpoints, the bounded
roadmap foundations listed below, and the release/installer corrections the
owner requested. The exact run record is
`docs/verification/handoff-closeout-2026-08-02/run-manifest.md`.

### Release and CI behavior

- **Super Express Release is now a genuine zero-test emergency lane.** It goes
  directly through build, package, asset validation, line-count/release-note
  generation, and release publication. It does not run unit, script, TUI,
  lint, type, parity, or smoke tests.
- **Normal CI still fails when tests fail, but packaging is no longer lost.**
  Windows packaging and installer/portable artifact uploads run under
  `always()` after an earlier test failure, while the job's final verdict stays
  red. Remote arm64 artifact `8840399524` and Express installer artifact
  `8840120256` are concrete failed-test-path receipts.
- Packaged Electron startup was repaired by keeping the main-process setup
  runner off the renderer/store/Copilot barrel. E2E job
  [`91555720873`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30770121458/job/91555720873)
  built, packaged, installed, and passed **10/10** packaged tests in 32 seconds.
- The Windows silent installer now verifies the exact requested version after
  install/update, treats an already-absent app as an idempotent uninstall,
  stays current-user and hidden, and fails closed on mismatched postconditions.
  PowerShell 5.1 and 7 contract tests pass. The source wiki and the real GitHub
  wiki are synchronized; current wiki commit `dc4f9548bb` also carries the
  zero-test Super Express correction.
- Every real Actions workflow/run list now shows a truthful elapsed state. The
  focused elapsed-time/UI gate passes **28/28**.

### Roadmap foundation receipts

These commits are foundations, not declarations that the corresponding open
roadmap issue is finished:

| Roadmap | Published foundation |
| --- | --- |
| R1 | server trust boundary, restart-safe provisioning, Windows provisioning driver, and Docker build context (`6839db9256`, `e014b3676c`, `a229ddabca`, `1547cb97f3`) |
| R2 | fail-closed OAuth authority core (`74d8ee7eb8`) |
| R3/R8 | continuous graph actions and truthful lane visibility (`f3e386edbc`, `22a44bceed`) |
| R4 | operational Agents/signing surfaces and secure setup commands (`7373ba0afa`, `4613d62db8`) |
| R6 | immutable, native-Windows-accurate conflict forecast (`55ecff5946`) |
| R7 | guarded editable three-pane merge editor (`f52d815b2a`) |
| R9 | immutable commit-composition plan (`482fd3bb3b`) |
| R10 | safe reviewed change-summary contract (`d6ccccaa14`) |
| R11 | Launchpad model, bounded preferences, and accessible view (`e19ccbc7c9`, `cd00c6c152`) |
| R12 | pull-request review workspace (`a1a5e87e11`) |
| R14 | fail-closed AI policy boundary (`f0fa06da2a`) |
| R15 | repository refresh coordinator and integrated-terminal renderer (`0a78b569d5`, `c8abe88858`) |
| R16 | provider sign-in redaction and strict issue-tracker identity/config (`8f94d5617c`, `229978e75f`) |
| R17 | interactive-rebase plan/editor plus history lane controls (`cb4c38a5f4`, `a12756271d`, `22a44bceed`) |
| R18 | canonical Cloud Patch artifact and encrypted self-hosted store (`e8cc4a1314`, `f895bf7aad`, `8abed0ce7e`) |

Repository TypeScript is green at the last product commit. The R6 gate passes
**15/15**, and an independent native `CompareStringOrdinal(ignoreCase=TRUE)`
sweep covered all **1,112,064** Unicode scalar values with **1,946** aliases and
zero mapper mismatches. R10 passes **24/24** and R16 passes **21/21**.

### Deliberately open acceptance work

Issues #118–#135 stay open wherever the roadmap table says an adapter, server
route, live UI, or capture is pending. A foundation test is not a substitute
for a reachable feature. In particular, the requested README/docs/wiki image
for each new roadmap feature is **not claimed**: those images must come from
the real built Windows surface through the off-screen Lowlevel capture harness
after each feature is wired. No mockup, design image, or unrelated screenshot
was substituted.

A separate linked worktree at
`C:\Users\cntow\Documents\GitHub\desktop-material-linux-tui-revival` contains
uncommitted TUI work on `codex/revive-linux-tui`. Its recorded branch tip is an
ancestor of `origin/main`, but its working files are not clean or proven
complete. They were preserved exactly and were neither staged, committed,
merged, nor deleted by this Windows closeout.

## 2026-08-04 command-palette routes and shortcut contract

The command-palette coverage work now keeps the live notification centre and
the Git-backed notification-history dialog as separate commands. The former
opens the live side sheet; the latter opens the local history surface. The
desktop menu now names the command palette directly and binds it to
`CmdOrCtrl+Shift+F`, matching the app-wide shortcut contract. The old `Ctrl+F`
binding was removed from that menu; `Ctrl+F` remains reserved for find-in-page
where that surface owns it.

Verification for this checkpoint:

- Focused catalog, coverage, and menu tests: **49/49**.
- Documentation hub and search tests: **48/48**; site contract: **1/1**.
- Full `yarn test:script`: **213/214** passed, **0** failed, and **1** optional
  Mermaid-toolchain test was skipped because `DESKTOP_MERMAID_TOOLCHAIN` is not
  configured.
- `yarn build:prod` completed in **287.51s** with
  `DESKTOP_SKIP_PACKAGE=1`; the build printed `Skipping packaging` and did not
  invoke Squirrel packaging or signing.
- The label-only rebuild after the home-label correction completed in
  **282.18s** after one transient native V8 allocation crash; the retry
  compiled all targets successfully. The final `yarn compile:prod` after the
  `find` keyword correction completed in **280.75s**, again compiling all
  targets successfully with warnings only.
- A genuine hidden Windows Electron capture used the cheap Lowlevel route and
  dynamic HWND resolution. It showed separate notification rows, opened the
  live notification centre side sheet, and showed the Edit-menu
  `Command palette` / `Ctrl+Shift+F` entry. The cheap background key helper did
  not deliver the accelerator reliably, so the menu contract is the static
  shortcut proof and the menu click supplied the visual palette proof.
- Public evidence is stored in
  `docs/assets/screenshots/material-command-palette-notification-before.png`,
  `docs/assets/screenshots/material-command-palette-notification-after.png`,
  and `docs/assets/screenshots/material-notification-centre-route.png`.

The release/installer path was intentionally not exercised in this checkpoint;
the user's skip-signing contract remains in force.

## 2026-08-04 screenshot catalog and Windows unit-test contract correction

The Windows desktop job in CI run
[`30940885403`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30940885403)
packaged the application and uploaded its Squirrel.Windows files, but its unit
test step was red. The failure combined a stale screenshot-docs contract with
three assertions that queried the parent `New Agent Session` dialog after the
nested setup editor had closed. The setup editor itself already handled Escape
through its native key listener; the test needed to identify the nested dialog
by its accessible name rather than treating both dialog layers as one node.

This checkpoint refreshes the committed gallery plan and generated screenshot
pages to **91 published gallery outputs**, retains the historical notification
frame separately, and scopes the setup-editor close assertions to `Setup
commands`. The generated docs now contain **98 screenshot pages** plus the
index, with **7 retained historical frames**.

Verification for this correction:

- Focused desktop, screenshot-docs, accessibility, and wiki-catalog tests:
  **64/64 passed**.
- Targeted ESLint: passed.
- Prettier check over all changed JavaScript, TypeScript, Markdown, and HTML:
  passed.
- `git diff --check`: passed.
- The previous remote E2E job packaged, installed, and passed its packaged smoke
  tests. Its signing setup was deliberately skipped (`sign=false`); Azure Code
  Signing installation and Azure Login were both skipped. No signing secret was
  added or enabled.
- The prior aggregate CI run remains unverified for this correction: its result
  is red because TUI jobs fail outside the Windows desktop scope, while the
  next commit will rerun the corrected Windows unit contract.


## 2026-08-12 surface locks wired, narrator voice, personal vocabulary

### What changed

**Surface locks did nothing.** `setMd3LockCredentialVault` was never called at
renderer start-up — a gap the feature's own documentation had recorded months
earlier under a heading called *Not yet wired*. Every attempt to lock an
element wrote a lock record, was refused the credential, rolled the record
back, and left a button that appeared to be made of paint. The vault is now
installed in `app/src/ui/index.tsx`.

A recorded lock also **gated nothing**: the row appeared in the manager and the
element carried on working. `app/src/ui/appearance/appearance-lock-gate.ts`
adds one capture-phase gate over `mousedown`, `click` and Enter/Space, keyed on
a `data-md3-lock-target` attribute an element carries via
`appearanceLockTargetProps`. `AppearanceLockPromptHost`, mounted once in the
shell, opens the existing unlock prompt anchored to the blocked control.

**Narrator voice is selectable**, per language, with rate and pitch —
`app/src/lib/audio/narrator-voices.ts` plus pickers in Sound preferences.

**Personal vocabulary** — `app/src/lib/personal-vocabulary.ts` and the control
on Settings → Appearance. Applied at `translate`, which is the single
user-facing text boundary.

**Two Material 3 corrections.** `--button-height` 25px → 40px and
`--button-border-radius` 6px → 20px, which were the last values in the app
reading as Material 2 and were under the minimum touch target besides.

### Verification

- `personal-vocabulary-test.ts` 27, `narrator-voices-test.ts` 16,
  `appearance-lock-gate-test.ts` 26, plus the existing layout, palette,
  settings-search, i18n, changelog and docs-bundle suites.
- Ten guards were broken on purpose and watched go red, then restored.

### What a successor needs to know

**One guard could not be made to fail, and that is recorded rather than
hidden.** A `lastIndex` reset was added to the vocabulary's cached regex with a
confident comment about why it was necessary; `String.replace` with a global
pattern manages `lastIndex` itself, so the test written to prove the reset was
needed passed with the reset removed. The line was deleted and the comment now
says so. Anyone reviewing a module-level `/g` regex will want to add it back.

**Seven commits in this session are missing the `Co-Authored-By` trailer.**
Author and committer are correct throughout, so `git blame` attribution is
intact, but the trailer is what the release line-count attribution reads.
Correcting them needs a history rewrite and therefore explicit authorization;
they were left alone. `commit.template` does **not** apply to `git commit -F`,
which is how the gap opened.

### Still open

- The lock gate stamps the submodule Back button and repository tabs. The
  repository list rows and the shell-wide `feature:` / `profile:` appearance
  targets have lock records but no DOM attribute, so their locks still gate
  nothing.
- No HuiShots have been captured against a built artifact this session, so the
  Material 3 button change and both new controls are unverified visually.
- The empty branch list visible in the reported Branches screenshot was never
  diagnosed; the two layout faults beside it were.


## 2026-08-12 capture harness — three distinct failures, two fixed

Worth separating, because they arrived one behind the other and the temptation
was to treat them as one problem with one cause.

**1. `ERR_CONNECTION_REFUSED` — fixed.** A development compile sets webpack's
`publicPath` to `http://localhost:3000/build/`, so the renderer fetches its own
bundle from a dev server no capture run has any reason to be running. Run
`yarn compile:prod` before capturing. The harness now names this outright when it
sees a refused connection, because the bare error sends a reader looking at the
network rather than at which webpack config produced the bundle.

This was found only because the harness was changed to report the console errors
it had been collecting all along. It reported them **only on the success path**,
so the one failure where they are decisive was the one failure that discarded
them — leaving `locator timed out waiting for #desktop-app-contents`, which reads
identically whether the app is broken, the machine is slow, or this.

**2. Silent process abort on `--tabs=N` — fixed.** With no dialog handler
registered, Playwright auto-dismisses every dialog, and that auto-dismiss races
Electron's teardown: it calls `Page.handleJavaScriptDialog` after the dialog has
gone, rejects with `No dialog is showing`, and Node turns the unhandled rejection
into a process abort. No failure line, no console errors, no indication of which
step was in flight — indistinguishable from the application crashing. The harness
now accepts dialogs deliberately, tolerates one that has already closed, and
reports a driver-level rejection as an ordinary non-zero exit.

**3. `--tabs=N` still fails, but now legibly — NOT fixed.**
`page.reload: Timeout 30000ms exceeded, waiting for navigation until "load"`.

The cause is understood and neither half is misbehaving. `profile-git.ts`
installs a `beforeunload` guard while a profile write is in flight
(`profileRepositoryNavigationGuards`), and the tab-seeding path writes
repositories into IndexedDB and then reloads the renderer straight into it.
Electron cancels the navigation rather than prompting, so `page.reload` waits for
a navigation that will never happen. Accepting the dialog does not help, because
there is no dialog to accept.

Candidate fixes for whoever picks this up: reload with
`waitUntil: 'domcontentloaded'`; or wait for the profile write to settle before
reloading; or have the seeding path avoid the reload entirely. Not attempted here
— the settings captures this session needed did not use `--tabs`, and guessing at
a fix for a path that is not exercised would have shipped an unverified change.

**Captures taken this session:** `docs/assets/screenshots/personal-vocabulary.png`
and `docs/assets/screenshots/narrator-voice-pickers.png`, both from the built app
at the commits named in their feature articles. Both caught defects no test was
looking at — a label that repeated its own heading, and a disabled text button
that rendered as stray grey text because a Material text button has no container
until it is interacted with.


## 2026-08-12 the trailer question, settled by checking rather than by rewriting

Ten commits in this session carry no `Co-Authored-By` trailer, because
`commit.template` does not apply to `git commit -F`. The obvious remedy is a
history rewrite and a force-push, which needs explicit authorization and is
worth not asking for, because the premise turns out to be wrong.

`script/count-lines.mjs` attributes a commit to an agent when **either** the
author matches `AgentAuthorPattern` (`/^(claude|codex|opencode|…)/i`) **or** a
`Co-Authored-By` trailer matches. Every commit in this repository is authored by
`Claude Fable 5`, so the first branch is satisfied and the trailer is redundant.

Verified rather than reasoned: running `agentCommits()` over the real history and
checking all ten SHAs returns **10/10 attributed to an agent**.

So there is nothing to fix, and rewriting ten pushed commits would have changed
no number anywhere. The trailer still goes on every new commit — it is the rule,
and it is the branch that carries the attribution in any repository where an
agent commits under a person's identity. It simply is not load-bearing here.


## 2026-08-12 undeclared imports — one fixed, three named, guard added

`app/test/unit/declared-dependencies-test.ts` reads the two manifests and fails
on any package `app/src` imports that neither declares. It reads the manifests
rather than the module graph on purpose: the graph is exactly what lied.

It found three pre-existing direct imports of transitive packages:

| Imported | Reaches the build through |
| --- | --- |
| `winston-transport` | `winston` |
| `@floating-ui/core` | `@floating-ui/react-dom` |
| `focus-trap` | `focus-trap-react` |

They are the same latent shape as the `fs-extra` failure — resolving only
because something else pulls them in — but they differ in two ways that make
them lower risk: each ships its own types, so they cannot produce TS7016, and
each parent is a direct dependency that reliably installs them.

They are listed as exceptions **anchored to their parent**, and a second
assertion fails if a parent ever stops being declared, so the list cannot become
somewhere new undeclared imports are parked.

**Follow-up, deliberately not done here:** declare all three at the versions
already installed (`winston-transport@4.5.0`, `@floating-ui/core@1.8.0`,
`focus-trap@6.1.0`). That is a manifest and lockfile change and had no business
riding along in a commit whose job was turning a red build green.


## 2026-08-18 personal vocabulary schemaVersion and Material control

### What changed

The personal vocabulary contract now treats `schemaVersion` as the canonical
top-level field for user-supplied files. Existing local cache/data that still
uses `version` is kept compatible on read so older installs continue to load,
but new cached data is written with `schemaVersion` and new files are validated
against that shape only.

The settings surface was moved onto the app's existing Material Design 3
primitives instead of the raw file input: a read-only summary field, a choose
button that opens the local file dialog, and a clear button that restores the
original wording. The change stays inside the existing preference surface and
keeps the fail-closed behavior intact.

### Files changed

- `app/src/lib/personal-vocabulary.ts`
- `app/src/ui/preferences/personal-vocabulary-control.tsx`
- `app/test/unit/personal-vocabulary-test.ts`
- `docs/features/design-system/personal-vocabulary.md`
- `HANDOFF.md`

### Verification

No tests or captures were run in this lane, per the Yum Leung Cha boundary for
this task.

### Notes for the next person

The compatibility policy is deliberate: user-facing files must use
`schemaVersion`, while legacy cache entries using `version` are still read so
existing data does not disappear. The UI change uses only the repository's
existing Material primitives and does not introduce a new style file.
