# Linux TUI revival verification manifest

This receipt tracks the 2026-08-02 revival of the interactive Linux terminal
edition. It is updated only with observed evidence; a planned check is not a
passing check.

## Scope

- Restore the supported Linux TUI and its install/release path.
- Add a mouse- and keyboard-operable repository/workspace splitter.
- Replace clipped fixed rows with reachable scrolling or stacked layouts.
- Provide a visible file-and-folder browser in Open, Create, and Clone flows.
- Derive Clone's initial destination from the process working directory.
- Recheck the complete desktop-to-terminal parity contract without relabelling
  an absent feature as complete.

## Source state

| Item | Value |
| --- | --- |
| Working branch | `codex/revive-linux-tui` |
| Starting commit | `a07444813bcfae1e5aadb67e4353b378d7593937` |
| Latest observed `origin/main` during work | `9367e97bcab21146d09d18452226714dcc4b7c5f` |
| TUI package before revival | `0.1.0` |
| Planned revived TUI package | `0.2.0` |
| Parity source | `docs/readme-tabs/complete-feature-list.md` |
| Generated parity rows at start | 202 |
| Starting parity summary | 14 adapted, 53 partial, 133 unavailable, 2 terminal-owned |

## Environment routing

The preferred ephemeral WSL route could not start: WSL is installed, but the
host reports virtualization disabled and has no installed or temporary Linux
distribution. No WSL distribution was created. Linux acceptance therefore uses
an isolated, resource-bounded Docker container with Xvfb and a real terminal;
that fallback must be labelled as Docker/Xvfb evidence rather than WSL evidence.

## Evidence ledger

| Time (America/Toronto) | Check | Result |
| --- | --- | --- |
| 2026-08-02 | Baseline Python suite | 250 passed, 1 Windows-only PTY skip |
| 2026-08-02 | Clone/path parser unit slice | 35 passed |
| 2026-08-02 | Splitter/config focused slice | 17 passed |
| 2026-08-02 | Existing responsive/app interaction slice | 9 passed |
| 2026-08-02 | Clone/path, dialog, worker, and worktree slice | 65 passed |
| 2026-08-02 | Responsive layout matrix and path regression slice | 20 passed in 160.09 seconds; all 132 main-tab size/language combinations exercised |
| 2026-08-02 | Responsive-checkpoint Python suite | 304 passed, 1 expected Linux-only PTY skip in 428.93 seconds |
| 2026-08-02 | Responsive-checkpoint Ruff and strict mypy | Ruff passed; mypy passed across 51 source files |
| 2026-08-02 | Fresh-Linux installer isolated contract | 144 assertions passed; ShellCheck and actionlint passed |
| 2026-08-02 | Fresh Debian slim install | First install and idempotent repeat install passed with the built wheel and lock-derived constraints |
| 2026-08-02 | Installed command smoke | `github`, `dmt`, `desktop-material-tui`, `gh`, Git, SSH, managed Python, and RE2 checks passed from the managed PATH |

## Required completion evidence

- [ ] Full Python suite on the integrated source.
- [ ] Ruff and strict mypy.
- [ ] Generated parity contract check.
- [x] Fresh Debian installer run from no project dependencies, repeated twice.
- [x] `github`, `dmt`, `desktop-material-tui`, and `gh` launch from the managed PATH.
- [ ] Xvfb terminal capture at wide, narrow, short, and bilingual layouts.
- [ ] Mouse splitter drag and keyboard splitter controls.
- [ ] File browser mouse and keyboard selection.
- [ ] Clone working-directory default and manual override preservation.
- [ ] Regex builder, tab traversal, settings scrolling, and clean `Ctrl+Q` exit.
- [ ] Installed wheel/container smoke.
- [ ] Pushed default-branch ancestry proof and GitHub Actions run link.

## Planned captures

Captures will be written beneath this directory only after they come from the
real built TUI running in the isolated Linux terminal. Mockups and edited images
are not acceptance evidence.
