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
- Verification target: the final source tree after all TUI agents integrate; the
  exact commit and remote CI receipts must be added before publication is
  described as verified.
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
  `docs/assets/screenshots/linux-tui-bilingual-narrow.png`. Promote only real
  captures from the built artifact; do not substitute mockups or edited images.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`,
  `docs/README.md`, `docs/installation.md`, `docs/readme-tabs/**`,
  `docs/features/README.md`, `docs/features/linux-tui/**`,
  `docs/verification/README.md`, `docs/verification/linux-tui-2026-07-27/**`,
  `docs/assets/screenshots/linux-tui-*.png`, `tui/README.md`,
  `tui/contracts/**`, and the relevant CI/package metadata.

## Preflight and build

- [ ] Record Linux distribution, architecture, Python, uv, Git, `gh`, terminal,
      and Lowlevel MCP versions without environment or credential dumps.
- [ ] Confirm the source branch/commit and inspect the complete worktree diff.
- [ ] Confirm `linux_status`, create exactly one virtual display, and record its
      opaque runtime identifier.
- [ ] Create the disposable root with `mktemp -d`, resolve it, prove its
      basename prefix, and write that exact path into `cleanup-ledger.md`.
- [ ] Point `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`,
      `XDG_CACHE_HOME`, and `XDG_RUNTIME_DIR` at owned children. Do not override
      `HOME`.
- [ ] Create and prove the deterministic fixture and local bare remote; record
      `git status --porcelain=v2 --branch`, branches, stashes, tags, and
      remotes.
- [ ] Install the locked Linux environment and run the source quality gates.
- [ ] Build wheel and sdist, inspect the wheel for `styles.tcss`, `py.typed`,
      metadata, and entry points, then install it into a fresh owned
      environment.
- [ ] Prove the installed `desktop-material-tui --version` reports `0.1.0`.

## Interaction script

Golden order for every state-changing interaction: capture the current terminal,
resolve the target, act in the background, then capture and inspect the result.

- [ ] Launch the installed wheel against the fixture on the virtual display and
      record the PID and terminal window identifier.
- [ ] Capture the untouched overview before input; prove nonblank Changes,
      repository rail, toolbar, tab strip, focus treatment, and one unstaged
      file.
- [ ] Click History, Branches, Stashes, Repository tools, GitHub, Regex,
      Settings, Notifications, then Changes; prove the selected tab changes each
      time.
- [ ] Click the repository search Input, type a substring, edit it with
      Backspace, clear it, and prove the repository row filters/restores.
- [ ] Click the changed-file row and prove its diff appears.
- [ ] Click Stage selected and prove the marker/status refreshes in the
      disposable fixture only.
- [ ] Click the commit-summary Input and type `TUI mouse proof`; click the
      multiline body TextArea, type two lines, edit the second line, and prove
      Enter inserted a newline without submitting.
- [ ] Tab and Shift+Tab between summary, body, checkboxes, and Commit; activate
      a checkbox with Space and return it to the original state.
- [ ] Capture the text-input state. Do not click Commit in the publish capture;
      automated tests own commit mutation and the fixture must remain
      disposable.
- [ ] Open the command palette with Ctrl+P, type a query, activate a
      non-destructive destination with Enter, reopen it, and dismiss with
      Escape.
- [ ] In Regex, build a pattern through clickable token controls; edit the raw
      pattern; toggle `i`, `m`, and `s`; enter Unicode multiline sample text;
      prove matches/captures; test invalid syntax and a zero-width pattern
      without a hang; return to a valid state for capture.
- [ ] Use a shared search bar in literal, fuzzy, and regex modes and prove the
      mode/result synchronization. Invalid regex must report its error and never
      silently become literal search.
- [ ] Trigger a safe informational notice, click Notifications, search it, mark
      it read, and inspect the detail TextArea.
- [ ] Open a target-naming destructive confirmation (for example stash drop),
      prove the background remains rendered, cancel with Escape, and prove no
      Git state changed.
- [ ] Change Settings to Cantonese and funny level 1, then bilingual and level
      5; prove repository paths, SHAs, and error facts do not change. Restore
      bilingual at moderate tone for capture.
- [ ] Resize from wide to compact and narrow dimensions. At each size, inspect
      horizontal overflow, clipped labels, off-screen buttons, focus, scroll
      range, and longest bilingual labels.
- [ ] Use wheel scrolling over Settings, a table, and a TextArea; prove nested
      content moves and controls remain reachable.
- [ ] Exercise light and dark themes and reduced-motion state; restore dark for
      the final overview.
- [ ] Capture all accepted states at original resolution and inspect each image
      before promotion.

## Automated and static gates

- [ ] `node tui/tools/generate-parity-contract.mjs --check`
- [ ] `uv sync --locked --extra dev`
- [ ] `uv run pytest`
- [ ] `uv run ruff check .`
- [ ] `uv run mypy src`
- [ ] `uv build --clear`
- [ ] fresh-wheel install and `desktop-material-tui --version`
- [ ] package content inspection
- [ ] workflow YAML parse and CI job contract inspection
- [ ] Markdown link and formatting checks for every touched document
- [ ] secret/credential-pattern scan of the diff and promoted captures
- [ ] final branch/worktree/stash/remote inspection
- [ ] exact remote commit/CI/Pages/release evidence after push, without
      predicting success

## Evidence table

Nothing in this table is accepted until the run fills every factual column.

| Surface                    | Build/commit | Viewport | Interaction evidence | Capture                          | Status  |
| -------------------------- | ------------ | -------- | -------------------- | -------------------------------- | ------- |
| Overview/Changes           | pending      | pending  | pending              | `linux-tui-overview.png`         | Pending |
| Input + multiline TextArea | pending      | pending  | pending              | `linux-tui-text-input.png`       | Pending |
| RE2 builder                | pending      | pending  | pending              | `linux-tui-regex-builder.png`    | Pending |
| Bilingual narrow layout    | pending      | pending  | pending              | `linux-tui-bilingual-narrow.png` | Pending |

## Cleanup gate

Cleanup is part of acceptance, not a later courtesy.

- [ ] Gracefully quit the TUI and prove its PID exited.
- [ ] Close the exact virtual-display terminal window.
- [ ] Stop the one virtual display created by this run and prove it is absent.
- [ ] Remove only the resolved disposable root after validating its prefix and
      contents against the ledger.
- [ ] Prove no fixture, bare remote, XDG override, wheel-smoke environment,
      recorder, terminal, or raw capture from this run remains.
- [ ] Update [cleanup-ledger.md](cleanup-ledger.md) with exact identifiers,
      hashes for promoted captures, and final `Complete` or factual blocker
      state.

Current local interaction status: **planned, not yet executed**. This manifest
does not claim a screenshot, mouse action, packaged Linux run, cleanup, remote
CI result, or release.
