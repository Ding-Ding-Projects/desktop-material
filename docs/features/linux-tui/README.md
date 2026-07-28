# Linux-first terminal edition

Desktop Material TUI is a separate, terminal-native edition of Desktop Material.
It targets Linux first and is built with Textual. The graphical Electron edition
remains a Windows application; the TUI does not turn that binary into a
cross-platform Electron package.

The terminal edition is interactive, not a read-only CLI. Users can click
buttons, tabs, lists, checkboxes, tables, and selectors in a mouse-reporting
terminal. Repository paths, clone URLs, branch names, commit summaries, commit
bodies, issue and pull-request text, API requests, regex patterns, and sample
text use real editable `Input` or `TextArea` controls. Every primary workflow
also remains keyboard reachable.

## Current delivery state

The first preview is version `0.1.0`. It provides a substantial vertical slice:

- open, create, clone, and switch among repositories;
- inspect changes and diffs, stage files, commit, fetch, pull, and push;
- browse history, branches, stashes, remotes, tags, and repository tools;
- inspect, preview, track, verify, and restore Windows-compatible Release-backed
  Cheap LFS pointers through a clickable manager and real text fields;
- use GitHub issues, pull requests, Actions, releases, packages, projects
  inventory, and a bounded API explorer through an installed `gh` CLI;
- search collection surfaces in literal, fuzzy, or explicit RE2 mode and build a
  regular expression interactively;
- persist theme, density, accent, language, tone, editor, terminal, narrator,
  accessibility, and search preferences through XDG paths;
- retain reviewable notifications and isolated Git-backed settings history.

This is not yet complete parity with the 201-row desktop inventory. The
generated [parity contract](../../../tui/contracts/parity.yaml) defaults every
unmapped row to `not_yet_available`; its current summary is 14 adapted, 53
partial, 132 not yet available, and 2 terminal-owned capabilities. The contract
is an implementation ledger, not marketing shorthand. Regenerate it after the
desktop inventory or an evidence mapping changes:

```bash
node tui/tools/generate-parity-contract.mjs
node tui/tools/generate-parity-contract.mjs --check
```

## Verified terminal surfaces

The gallery uses original, unedited captures from the packaged wheel running in
an off-screen Debian terminal. It includes the Changes overview, real
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
- [Architecture and XDG persistence](architecture-and-persistence.md) —
  boundaries, config, SQLite, locking, and isolated local history.
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

Source code or a green unit test does not prove a mouse path. The original
[Linux TUI verification manifest](../../verification/linux-tui-2026-07-27/run-manifest.md)
and the later
[path-browser and Git-wrapper manifest](../../verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
own the real PTY, mouse, text-entry, resize, screenshot, CLI, install, and
cleanup evidence. Pending boxes in either record remain pending; they are never
implied by this feature overview.
