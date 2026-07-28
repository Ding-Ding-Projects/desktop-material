# TUI verification

## Local quality gates

From `tui/`:

```bash
uv sync --locked --extra dev
uv run pytest
uv run ruff check .
uv run mypy src
uv build --clear
```

Verify generated inventory drift from the repository root:

```bash
node tui/tools/generate-parity-contract.mjs --check
```

The contract generator must parse exactly 201 rows and 17 sections, reject
unknown overrides and duplicate IDs, and leave every unmapped row as
`not_yet_available`.

## Package smoke check

Install the built wheel into a new environment rather than reusing the source
environment:

```bash
uv venv /tmp/desktop-material-tui-wheel-smoke --python 3.12
uv pip install \
  --python /tmp/desktop-material-tui-wheel-smoke/bin/python \
  tui/dist/desktop_material_tui-0.1.0-py3-none-any.whl
/tmp/desktop-material-tui-wheel-smoke/bin/desktop-material-tui --version
```

Inspect the archive for `styles.tcss`, `py.typed`, metadata, and all three
console entry points: `github`, `dmt`, and `desktop-material-tui`. Delete the
controlled temporary environment after the check.

## Automated interaction

Textual pilot tests cover focus, button presses, text entry, dialogs, panes,
localization, and resizing without a display. PTY tests cover real terminal
escape sequences and lifecycle. They complement but do not replace an actual
mouse-reporting terminal capture.

## Headless Linux acceptance

The original dated
[run manifest](../../verification/linux-tui-2026-07-27/run-manifest.md) defines
the full publish-mode Lowlevel MCP/Xvfb exercise. The later
[path-browser and Git-wrapper manifest](../../verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
adds packaged mouse, paste, browser, native Git, one-line install, and cleanup
acceptance. Together they require:

- start from a deterministic temporary Git fixture;
- inspect a screenshot before sending input;
- click tabs, buttons, rows, Inputs, and TextAreas;
- type and edit a commit summary/body without accidentally submitting;
- prove Tab/Shift+Tab/Enter/Space behavior;
- scroll and resize through wide, compact, narrow, and bilingual states;
- exercise literal/fuzzy/RE2 search, builder synchronization, invalid syntax,
  captures, Unicode, multiline, and zero-width matching;
- trigger a non-blocking notice and review it in notification history;
- capture only the real built TUI;
- stop Xvfb/processes and remove all controlled fixtures recorded in the cleanup
  ledger.

Each checked interaction must cite the exact package/commit, command, terminal,
viewport, and screenshot. A planned checkbox is not evidence.

## Release gate

The Linux TUI is releasable only when:

1. the locked Python matrix passes;
2. Ruff, mypy, tests, parity drift, build, and fresh-wheel smoke are green;
3. the real Linux interaction record is complete with cleanup;
4. the source commit is pushed and the remote CI result is recorded;
5. any published package is uniquely versioned and immutable;
6. docs and the parity contract describe remaining gaps without calling them
   complete.

## Python and historical-target compatibility

Git may emit strict ISO timestamps with either a numeric UTC offset or a
terminal uppercase `Z`. Python 3.10's `datetime.fromisoformat` does not accept
the latter, so every Git/profile-history parser normalizes only that terminal
designator to `+00:00`. Tests must cover `Z`, non-zero numeric offsets, and
malformed input on the oldest supported Python version.

Platform-only lock modules stay behind runtime boundaries. In particular,
Linux mypy must not statically resolve the Windows-only `msvcrt.locking`
members, and Windows checks must still exercise the same lock path.

The release workflow can be loaded from a newer default branch while a
`workflow_run` event targets an older commit. If `prepare` has already marked
that upstream CI target as non-publishable, TUI packaging is skipped rather
than assuming the historical commit contains `tui/`. A publishable current
target still requires the locked environment, full matrix, wheel, source
distribution, and fresh-install smoke test.
