# Linux TUI publish run manifest

<!-- markdownlint-disable MD013 -->

- Run ID: `linux-tui-2026-07-27-019fa510`
- Mode: `publish`
- Milestone: deliver the first Linux-first, mouse-capable Desktop Material TUI
  preview with real editable text controls, keyboard parity for primary actions,
  packages, CI, honest feature-parity mapping, documentation, and off-screen
  Linux evidence.
- Product boundary: the new Python/Textual terminal edition targets Linux. The
  Electron graphical edition and its installer/E2E lanes remain Windows-only.
- Starting branch: `codex/linux-tui-clone`
- Starting commit: `821ab93d57948a7e17d3e41fc5ae804202d9ab82`
- Expected integration branch: `main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Verification target: package and interaction evidence was captured from TUI
  implementation commit `eee005c7f4bc0afeaefdd4606153deb14cfc5f8c`; merge
  commit `ba45dcfbaf8e76786ca975752c125e0b0e4299e1` adds the then-current
  `origin/main` without changing any file below `tui/`. Remote CI, Pages, and
  release receipts remain separate post-push evidence.
- Expected UI state: a real mouse-reporting terminal opens a deterministic Git
  fixture in the full-screen TUI. Repositories and workspace tabs are clickable;
  Inputs and TextAreas accept/edit text; keyboard focus is visible; tables,
  lists, dialogs, and scroll views remain reachable; wide, compact, and narrow
  layouts do not clip primary controls; language, search, notifications, and
  confirmation states remain factual.
- Automation boundary: use Lowlevel MCP's Linux virtual display/Xvfb route. Do
  not show, focus, or disturb the user's visible Windows desktop. Resolve
  display, process, terminal window, and control coordinates at run time; never
  reuse a hard-coded handle or display.
- Disposable root: a fresh `mktemp -d` beneath `/tmp` whose resolved basename
  begins `desktop-material-tui-proof-019fa510-`. It may own only the fixture,
  bare origin, XDG config/data/state/cache/runtime roots, wheel-smoke
  environment, raw captures, and run logs listed in the cleanup ledger.
- Source checkout: the current repository mounted into the Linux environment; it
  is read-only to the interaction harness except for tracked screenshot
  promotion performed later from the host checkout.
- Fixture: one local repository with a configured local bare `origin`, an
  initial pushed `main`, one tracked Markdown file, one controlled unstaged
  edit, one branch, one tag, and one named stash. No provider credential or
  external remote is created.
- GitHub state: exercise binding, fields, tabs, empty/auth/error/read-only
  rendering only. The headless proof must not create, comment, close, review,
  merge, dispatch, rerun, cancel, upload, or otherwise mutate GitHub.
- Expected terminal: `xterm` or another Xvfb-compatible UTF-8 terminal at a wide
  starting geometry (approximately 140×42 cells), with mouse reporting enabled
  by the TUI.
- Screenshot targets after original-resolution inspection:
  `docs/assets/screenshots/linux-tui-overview.png`,
  `docs/assets/screenshots/linux-tui-text-input.png`,
  `docs/assets/screenshots/linux-tui-regex-builder.png`, and
  `docs/assets/screenshots/linux-tui-bilingual-narrow.png`, and
  `docs/assets/screenshots/linux-tui-cheap-lfs.png`. Promote only real captures
  from the built artifact; do not substitute mockups or edited images.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`,
  `docs/README.md`, `docs/installation.md`, `docs/readme-tabs/**`,
  `docs/features/README.md`, `docs/features/linux-tui/**`,
  `docs/verification/README.md`, `docs/verification/linux-tui-2026-07-27/**`,
  `docs/assets/screenshots/linux-tui-*.png`, `tui/README.md`,
  `tui/contracts/**`, and the relevant CI/package metadata.

## Recorded environment

- Disposable runtime: Debian GNU/Linux 13 (trixie), `x86_64`, Python `3.13.5`,
  Git `2.47.3`, rxvt-unicode `9.31`, Xvfb `21.1.16`, Openbox `3.6.1`, and
  Lowlevel computer-use MCP `0.1.0`. GitHub CLI was intentionally absent from
  this isolated interaction distro; GitHub mutation was outside the proof.
- Host quality/build tools: uv `0.11.26`, Python `3.12.10`, Git
  `2.54.0.windows.1`, and GitHub CLI `2.95.0`.
- Docker proof host: remote Linux `x86_64`, Docker `29.5.3`, 14 logical CPUs,
  and 33 GB memory. Existing workloads were enumerated and left untouched.
- Package artifacts: wheel
  `desktop_material_tui-0.1.0-py3-none-any.whl` (164,317 bytes, SHA-256
  `7d137092340262cd92ade0291c1fd1c31d5b63f65f50c9e5f51d0f5780305555`)
  and source distribution (282,597 bytes, SHA-256
  `53e0674d29bfda053958a6862bb726964c6e5f9974b25b551c8b22f31c9bcfcc`).
  The wheel contains 53 files, including `styles.tcss`, `py.typed`, and the
  `github`, `dmt`, and `desktop-material-tui` entry points.

## Preflight and build

- [x] Record Linux distribution, architecture, Python, uv, Git, `gh`, terminal,
      and Lowlevel MCP versions without environment or credential dumps.
- [x] Confirm the source branch/commit and inspect the complete worktree diff.
- [x] Confirm `linux_status`, create exactly one virtual display, and record its
      opaque runtime identifier.
- [x] Create the disposable root with `mktemp -d`, resolve it, prove its
      basename prefix, and write that exact path into `cleanup-ledger.md`.
- [x] Point `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`,
      `XDG_CACHE_HOME`, and `XDG_RUNTIME_DIR` at owned children. Do not override
      `HOME`.
- [x] Create and prove the deterministic fixture and local bare remote; record
      `git status --porcelain=v2 --branch`, branches, stashes, tags, and
      remotes.
- [x] Install the locked Linux environment and run the source quality gates.
- [x] Build wheel and sdist, inspect the wheel for `styles.tcss`, `py.typed`,
      metadata, and entry points, then install it into a fresh owned
      environment.
- [x] Prove the installed `desktop-material-tui --version` reports `0.1.0`.

## Interaction script

Golden order for every state-changing interaction: capture the current terminal,
resolve the target, act in the background, then capture and inspect the result.

- [x] Launch the installed wheel against the fixture on the virtual display and
      record TUI PID `8009` and terminal window identifier `2097158`.
- [x] Capture the overview; prove nonblank Changes, repository rail, toolbar,
      tab strip, focus treatment, and three fixture changes.
- [x] Click the commit-summary Input and type `TUI mouse proof`; click the
      multiline body TextArea, type two lines, edit the second line, and prove
      Enter inserted a newline without submitting.
- [x] Capture the text-input state. Do not click Commit in the publish capture;
      automated tests own commit mutation and the fixture must remain
      disposable.
- [x] In Regex, click and edit the raw `(alpha|beta)` pattern, enter multiline
      sample text, click case-insensitive mode, and prove two live matches plus
      capture groups. Invalid, multiline, dot-all, Unicode, zero-width, and
      bounded adversarial cases are covered by the automated search/UI suite.
- [x] Dismiss a real non-blocking notification through a mouse click.
- [x] Change to bilingual mode, resize to a 100-column terminal layout, and
      inspect the longest bilingual labels for clipping.
- [x] In Cheap LFS, render a canonical pointer and a 101 MiB auto-pin
      candidate, click editable repository/provider fields, click Preview, and
      prove the local plan made no provider mutation.
- [x] Capture all five accepted states at original resolution and inspect each
      before promotion.

The broader keyboard/tab, literal/fuzzy/regex synchronization, command-palette,
destructive-confirmation, notification-history, theme, reduced-motion, and
scrolling matrix was exercised through 187 cross-platform Textual/core tests
and the dedicated real-Linux PTY test. Unchecked manual scenarios from the
planning draft are not silently claimed as captured interactions.

## Automated and static gates

- [x] `node tui/tools/generate-parity-contract.mjs --check`
- [x] `uv sync --locked --extra dev`
- [x] `uv run pytest`: 187 passed and 1 Linux-only PTY case skipped on Windows;
      the skipped PTY case separately passed on real Debian Linux.
- [x] `uv run ruff check .` and `uv run ruff format --check .`
- [x] `uv run mypy src`: strict typing clean across 47 source files.
- [x] 164 focused Windows Cheap LFS tests, including all 16 cloud-compression
      action cases, plus root TypeScript and focused ESLint/Prettier
- [x] `uv build --clear`
- [x] fresh-wheel install and all three aliases report version `0.1.0`
- [x] package content inspection
- [x] workflow YAML parse and CI job contract inspection
- [x] Markdown links and focused formatting checks for every new/touched TUI
      document
- [x] secret/credential-pattern scan of the diff and promoted captures
- [x] final branch/worktree/stash/remote inspection; an unrelated dirty
      `codex/cheap-lfs-restore-lookahead` worktree is preserved, not modified
- [ ] exact remote commit/CI/Pages/release evidence after push, without
      predicting success

## Evidence table

Every capture is an original 1600×1000 Xvfb window image from the installed
wheel at `eee005c7f4bc0afeaefdd4606153deb14cfc5f8c`. The interaction
coordinates and window handle were resolved at run time.

| Surface | Interaction evidence | Capture | Status |
| ------- | -------------------- | ------- | ------ |
| Overview/Changes | Installed wheel opened a three-change fixture | `linux-tui-overview.png` | Accepted |
| Input + multiline TextArea | Mouse click, `TUI mouse proof`, two-line body | `linux-tui-text-input.png` | Accepted |
| RE2 builder | Editable pattern/sample, clicked `i`, two matches/captures | `linux-tui-regex-builder.png` | Accepted |
| Bilingual narrow layout | Bilingual mode at 100 columns; clicked toast dismiss | `linux-tui-bilingual-narrow.png` | Accepted |
| Cheap LFS | Pointer/candidate rows, editable fields, clicked no-mutation Preview | `linux-tui-cheap-lfs.png` | Accepted |

## Cleanup gate

Cleanup is part of acceptance, not a later courtesy.

- [x] Gracefully quit the TUI with Ctrl+Q and prove PID `8009` exited.
- [x] Close the exact virtual-display terminal window `2097158`.
- [x] Stop display `:98` and prove Xvfb PID `7003` and Openbox PID `7006`
      exited.
- [x] Remove only the resolved disposable root after validating its prefix and
      contents against the ledger.
- [x] Prove no fixture, bare remote, XDG override, wheel-smoke environment,
      recorder, terminal, or raw capture from this run remains.
- [x] Update [cleanup-ledger.md](cleanup-ledger.md) with exact identifiers,
      hashes for promoted captures, and final `Complete` or factual blocker
      state.

Current local interaction status: **Complete**. The packaged Linux run, real
mouse/text-field acceptance, five captures, and guarded cleanup are proven
locally. Remote CI, Pages, and release results remain unclaimed until the final
default-branch push creates exact receipts.
