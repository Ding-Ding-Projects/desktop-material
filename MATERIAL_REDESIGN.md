# Desktop Material

Desktop Material is an independent remake of GitHub Desktop that keeps the
upstream TypeScript, React, Electron, and Sass implementation stack while
rebuilding the application shell around Material Design 3.

## Product contract

- Preserve the complete Git workflow that makes GitHub Desktop useful.
- Replace the current visual shell with Material Design 3 navigation,
  surfaces, typography, color roles, elevation, motion, and components.
- Support multiple accounts on the same GitHub host, including multiple
  `github.com` identities.
- Let each repository remember the account used for network operations.
- Keep credentials in the operating-system credential store and never write
  tokens to repository configuration or exported settings.
- Keep the product language and implementation language aligned with upstream:
  English UI copy and TypeScript/React/Electron source.
- Publish a screenshot-led project site and complete user/developer wiki with
  GitHub Pages.

## Multi-account model

Upstream identifies accounts primarily by endpoint and prevents a second
account on the same endpoint. Desktop Material will use an immutable account
ID derived from host and authenticated user identity. Repository preferences
will store an optional account ID; operations without a repository will use
the active global account.

Migration must preserve existing users:

1. Read existing accounts from the current account store.
2. Generate stable account IDs without changing stored credentials.
3. Assign repositories to the matching endpoint account when the choice is
   unambiguous.
4. Ask once when multiple accounts match, then remember the selection.

Repository-bound provider surfaces consume that same canonical account key;
they do not maintain a second selection. An unassigned repository may bind
automatically only when exactly one signed-in, token-bearing account matches the
provider and endpoint. Multiple matches require a labelled choice, no match
routes to sign-in/account management, and stale credentials or organization SSO
route to reauthorization. A valid explicit binding is never silently replaced,
and repository/account generation is rechecked before provider data loads.

GitHub browser authorization uses a reviewed feature allowlist: `repo`, `user`,
`workflow`, `notifications`, and `read:org`. It excludes unrelated destructive
and administrative scope families; credentials remain outside renderer state,
repository configuration, profile history, logs, and screenshots.

## Appearance customization contract

App-wide customization is profile-scoped. **Settings → Appearance** exposes 12
versioned defaults: accent color, surface color, surface depth, interface font,
code/diff font, animation, toolbar labels, toolbar density, repository-list
density, tab density, tab width, and tab-close-button behavior. These values
are part of the active profile's allowlisted settings snapshot and therefore
participate in its local Git history, undo, redo, and restore workflow.

Repository-specific customization is deliberately narrower. **Repository
Settings → Appearance** may override six fields: accent color, surface color,
toolbar labels, toolbar density, tab density, and tab width. Every field offers
**Use app default** inheritance. Explicit overrides stay in the repository's
local `.git/config`; they are not committed or shared with collaborators and
must never enter the profile repository.

Repository tabs retain their profile-backed typography controls and add
independent text and background colors. Both targets support curated palettes,
recent colors, a custom color picker, validation, and return to the Material
default.

The tab strip also follows a guarded organization contract. Pinned tabs form a
protected leading group. The existing regex **Close Tabs Containing…** action
and the inverse literal **Close all tabs except those containing…** action both
preserve pinned tabs; the inverse exposes live counts and a bounded preview and
cannot confirm an empty or zero-match query. Manual drag and named keyboard
move actions stay within the current pin group. Label, opened-date, and
repository-status sorts are stable one-shot mutations whose persisted result
remains manually editable instead of continuously reacting to later status
changes.

## Adaptive Material app bar

The app bar measures its usable lane and the real overflow pressure of labels
that use ellipsis. It recalculates when the window, live label copy, toolbar
density, or label mode changes. Icons only and compact layouts use their actual
compact footprint.

Core repository, worktree, branch, and sync controls stay pinned. When space
runs out, Build & Run moves into the accessible **More** surface first, then
Commit & Push. The original controls remain mounted off-layout so subscriptions
and in-flight state survive. Focus follows an action across the overflow
boundary, widening or shorter copy restores controls deterministically, and an
open **More** surface remains stable until the user closes it.

## Reviewed operations and compact task surfaces

Material confirmation is part of the safety model, not decoration. Workflow
run cancellation names the exact run and relevant ref/actor/commit context,
revalidates repository/account/run identity and cancellable status, prevents a
duplicate submission, and keeps progress plus recovery guidance in a live
status region. Only normal cancellation appears in the primary flow.

The reviewed rebase surface searches target branches and shows the current→base
relationship, ahead/behind state, and a bounded replay preview. It blocks dirty,
conflicted, or ongoing-operation states, revalidates both refs immediately
before Git starts, offers cancellation before mutation, and enters the existing
continue/abort conflict workflow when necessary. Desktop Material never
force-pushes automatically.

Every task surface owns its available height and narrows through readable
stacking before content collapses. Repository Tools scrolls vertically at short
heights; Remote Manager preserves usable field/control widths and stacks its
rows before arbitrary character wrapping; Regex Builder reflows its
category/token layout and scrolls the body while keeping its tester and footer
reachable. Horizontal page scrolling is not an acceptable compact fallback.

## Material entry surfaces

The first-run Welcome flow is a pure Material composition: product lockup,
task card, tonal workspace preview, responsive compact fallback, and
reduced-motion handling, without changing sign-in, enterprise, or skip
semantics. The public static landing page uses the same system through a
Material app bar, expressive hero surface, design-principle cards, screenshot
evidence gallery, tonal call to action, and footer.

The inspected acceptance images are:

- `docs/assets/screenshots/material-welcome.png`
- `docs/assets/screenshots/material-customization.png`
- `docs/assets/screenshots/material-toolbar-overflow.png`
- `docs/assets/screenshots/material-tab-appearance-word.png`
- `docs/assets/screenshots/material-tab-arrange.png`
- `docs/assets/screenshots/material-actions-cancel.png`
- `docs/assets/screenshots/material-rebase-review.png`

All seven were rendered from the exact tested production source, inspected at
their original 1440×960 resolution, and privacy reviewed. Dimensions, hashes,
source/build identity, and interaction receipts live in `HANDOFF.md` and the
run manifest; publication receipts are recorded after direct `main`, Pages, and
wiki promotion.

## Delivery phases

1. Material foundations: design tokens, theme modes, app frame, navigation.
2. Repository workspace: changes, history, diff, branches, pull requests.
3. Account profiles: account switcher, sign-in management, repository binding,
   and local-Git-backed appearance defaults.
4. Remaining dialogs and flows: clone, publish, settings, merge, conflicts.
5. Accessibility, keyboard navigation, automated tests, packaged builds.
6. Pure Material Welcome and GitHub Pages landing surfaces, screenshots, and a
   complete wiki.

This file is the implementation contract. A phase is complete only after its
tests pass, its UI has been rendered and reviewed, and its commit is pushed.
