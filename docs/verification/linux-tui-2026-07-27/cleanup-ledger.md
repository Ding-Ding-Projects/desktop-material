# Linux TUI publish cleanup ledger

<!-- markdownlint-disable MD013 -->

- Run ID: `linux-tui-2026-07-27-019fa510`
- Mode: `publish`
- Owner prefix: `desktop-material-tui-proof-019fa510-`
- Cleanup state: **In progress — the owned ephemeral WSL environment is active;
  every identifier below is recorded from the current run.**

The runner must replace each `pending` value with an exact runtime value. It
must never infer a PID, display, window ID, or path from a previous run.

| Owned resource                | Exact runtime value | Created | Teardown       | Final proof    |
| ----------------------------- | ------------------- | ------- | -------------- | -------------- |
| ephemeral WSL distribution    | `llcu-tmp-1785184334-1e40` | Yes | pending | pending |
| resolved disposable root      | `/tmp/desktop-material-tui-proof-019fa510-oon3lK` | Yes | pending | pending |
| deterministic Git fixture     | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/fixture` | Yes | pending | pending |
| local bare origin             | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/origin.git` | Yes | pending | pending |
| XDG config root               | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/xdg/config` | Yes | pending | pending |
| XDG data root                 | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/xdg/data` | Yes | pending | pending |
| XDG state/runtime root        | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/xdg/state`; runtime `/tmp/desktop-material-tui-proof-019fa510-oon3lK/xdg/runtime` | Yes | pending | pending |
| XDG cache root                | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/xdg/cache` | Yes | pending | pending |
| Linux wheel-smoke environment | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/wheel-env` | Yes | pending | pending |
| Lowlevel HTTP verification server | `127.0.0.1:8766` (PID `716`) | Yes | pending | pending |
| Lowlevel virtual display      | `:98` (Xvfb PID `795`, `1600x1000x24`) | Yes | pending | pending |
| terminal window identifier    | pending             | No      | pending        | pending        |
| terminal/TUI process PID      | pending             | No      | pending        | pending        |
| screen recording, if used     | not planned         | No      | not applicable | not applicable |
| raw capture directory         | `/tmp/desktop-material-tui-proof-019fa510-oon3lK/captures` | Yes | pending | pending |

The first candidate root,
`/tmp/desktop-material-tui-proof-019fa510-kezanG`, was removed by the ephemeral
distribution when it stopped before Xvfb was active. It contained only the
owned fixture, XDG directories, and wheel environment; absence was confirmed
before the active root above was created.

An initial direct-client display, `:97` (PID `330`), was cleanly stopped after
the stateless cheap client could not retain its process registry between calls.
The persistent Lowlevel HTTP server owns the active `:98` display above.

## Promoted evidence

| Capture                                                  |   Bytes | SHA-256 | Original inspected | Source removed |
| -------------------------------------------------------- | ------: | ------- | ------------------ | -------------- |
| `docs/assets/screenshots/linux-tui-overview.png`         | pending | pending | No                 | pending        |
| `docs/assets/screenshots/linux-tui-text-input.png`       | pending | pending | No                 | pending        |
| `docs/assets/screenshots/linux-tui-regex-builder.png`    | pending | pending | No                 | pending        |
| `docs/assets/screenshots/linux-tui-bilingual-narrow.png` | pending | pending | No                 | pending        |

## Guarded teardown procedure

1. Resolve the disposable root and verify it is an absolute child of `/tmp`
   whose basename starts with the owner prefix above.
2. List its immediate children and compare them to this ledger.
3. Gracefully quit the TUI; if it does not exit, record that fact before using
   the least-forceful targeted process action.
4. Close the terminal and stop the exact virtual display created by this run.
5. Stop any recorder created by the run.
6. Confirm no process still has a file open beneath the root.
7. Remove that one validated root through a single Linux shell end to end.
8. Recheck the path, display list, process list, and recording status.
9. Record hashes/byte sizes for promoted captures and prove raw duplicates were
   removed.

Do not remove another `/tmp` directory, a user home, the source checkout, a
shared uv cache, the persistent Lowlevel MCP service, or any display/process not
created by this run.
