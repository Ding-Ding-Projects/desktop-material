# Linux TUI — revived August 2, 2026

> **Current status:** Desktop Material TUI is again an actively built,
> installable Linux-first terminal application. The Windows Electron app remains
> the graphical desktop edition; the TUI adapts its user outcomes to real
> terminal controls instead of pretending that a terminal owns desktop window
> chrome.

Desktop Material TUI is a separate terminal-native application built with
Textual. It targets Linux first and shares the desktop edition's repository,
Git, GitHub, search, safety, language, persistence, and release contracts where
the terminal can represent them honestly.

The terminal edition is interactive, not a read-only CLI. Users can click
buttons, tabs, lists, checkboxes, tables, and selectors in a mouse-reporting
terminal. Repository paths, clone URLs, branch names, commit summaries, commit
bodies, issue and pull-request text, API requests, regex patterns, and sample
text use real editable `Input` or `TextArea` controls. Every primary workflow
also remains keyboard reachable.

## Delivery state

The revived package provides a substantial interactive surface:

- open, create, clone, and switch among repositories;
- inspect changes and diffs, stage files, commit, fetch, pull, and push;
- browse history, branches, stashes, remotes, tags, and repository tools;
- inspect, preview, track, verify, and restore Windows-compatible Release-backed
  Cheap LFS pointers through a clickable manager and real text fields;
- drag or keyboard-resize the repository rail, retain its persisted width, and
  keep the workspace usable at narrow terminal sizes;
- browse repository files through a bounded, repository-confined Files tab and
  open a selected file in a detected external editor;
- keep persistent repository tabs with aliases, pins, favourites, groups,
  ordering, search, overflow, guarded bulk close, and bounded import/export;
- use GitHub issues, pull requests, Actions, releases, packages, projects
  inventory, and a bounded API explorer through an installed `gh` CLI;
- search collection surfaces in literal, fuzzy, or explicit RE2 mode and build a
  regular expression interactively;
- persist theme, density, accent, language, tone, editor, terminal, narrator,
  accessibility, and search preferences through XDG paths;
- retain reviewable notifications and isolated Git-backed settings history;
- occasionally show one locally bundled, verified dim-sum dish through a
  non-blocking, focus-safe 10% startup draw.

The generated [parity contract](../../../tui/contracts/parity.yaml) covers all
202 rows in the desktop inventory and defaults every unmapped row to
`not_yet_available`. It is an implementation ledger, not marketing shorthand:
an adapted row carries source and test evidence, a partial row names its real
boundary, and terminal-owned behavior stays with the terminal emulator.
Regenerate it after the desktop inventory or an evidence mapping changes:

```bash
node tui/tools/generate-parity-contract.mjs
node tui/tools/generate-parity-contract.mjs --check
```

## Terminal captures

The five original, unedited captures came from the earlier packaged wheel
running in an off-screen Debian terminal. They remain historical evidence while
the August 2 revival has its own acceptance manifest and replacement captures.
They include the Changes overview, real
single-line and multiline editing, the clickable Cheap LFS manager, live RE2
matches, and the compact bilingual layout:

- [Changes overview](../../assets/screenshots/linux-tui-overview.png)
- [Editable Input and TextArea](../../assets/screenshots/linux-tui-text-input.png)
- [Cheap LFS inventory and local preview](../../assets/screenshots/linux-tui-cheap-lfs.png)
- [RE2 builder with live captures](../../assets/screenshots/linux-tui-regex-builder.png)
- [Bilingual narrow layout](../../assets/screenshots/linux-tui-bilingual-narrow.png)

## Documentation map

- [Install and package](install-and-packaging.md) — requirements, source
  installs, wheel artifacts, CI, launch, upgrade, and uninstall.
- [Container](container.md) — minimal non-root Docker image, current-repository
  bind mount, persisted XDG volumes, security, and troubleshooting.
- [Interaction and accessibility](interaction-and-accessibility.md) — mouse
  clicks, text boxes, keyboard focus, scrolling, resizing, assistive technology,
  and terminal constraints.
- [Repository path browser and quoted paste](repository-path-browser.md) —
  folder-only mouse/keyboard browsing, Home/Up navigation, immediate safe
  unquoting, failure behavior, and path-boundary security.
- [Repository file browser](file-browser.md) — bounded Files-tab enumeration,
  search and RE2, safe previews, symlink confinement, responsive interaction,
  and external-editor opening.
- [Architecture and XDG persistence](architecture-and-persistence.md) —
  boundaries, config, SQLite, locking, and isolated local history.
- [Repository tabs and saved sessions](repository-tabs.md) — aliases, pins,
  favourites, groups, overflow, search, guarded bulk close, and bounded session
  import/export.
- [Repositories and Git](repositories-and-git.md) — available workflows,
  confirmation gates, concurrency, and current gaps.
- [GitHub workflows](github-workflows.md) — `gh` authentication, issues, pull
  requests, Actions, releases, packages, projects, and the API explorer.
- [Cheap LFS](cheap-lfs.md) — Windows-compatible pointer limits, clickable
  manager, CLI, managed Release writes, verification, recovery, and current
  parity boundaries.
- [Cheap LFS-aware Git CLI wrapper](cheap-lfs-git-wrapper.md) — exact native
  Git argv passthrough, push preflight, materialized payload verification, and
  safe pull restoration.
- [Search and RE2](search-and-regex.md) — modes, dialect, bounds, builder,
  flags, zero-width matches, and synchronization.
- [Language, appearance, and notifications](language-appearance-notifications.md)
  — English/Cantonese/bilingual copy, funny levels, terminal-safe appearance,
  narrator state, and notification history.
- [External editor and local version history](external-editor-and-version-history.md)
  — editor/terminal discovery and app-owned Git snapshots.
- [Security and failure modes](security-and-failure-modes.md) — process,
  credential, path, network, storage, destructive-action, and recovery
  boundaries.
- [Verification](verification.md) — local quality gates, packaged-wheel smoke
  checks, headless Linux interaction evidence, and the parity drift gate.

## Acceptance boundary

Source code or a green unit test does not prove a mouse path. The current
[revival verification manifest](../../verification/linux-tui-revival-2026-08-02/run-manifest.md)
owns the packaged-wheel, real Linux terminal, mouse, text-entry, splitter,
Files-tab, resize, screenshot, installer, exit, and cleanup evidence for this
milestone. The original
[Linux TUI verification manifest](../../verification/linux-tui-2026-07-27/run-manifest.md)
and the later
[path-browser and Git-wrapper manifest](../../verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
remain dated historical evidence. A pending box stays pending until the real
artifact and interaction path have been observed; it never becomes a success
because a nearby unit test passed.
