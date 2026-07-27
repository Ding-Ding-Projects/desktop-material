# Linux TUI publish cleanup ledger

<!-- markdownlint-disable MD013 -->

- Run ID: `linux-tui-2026-07-27-019fa510`
- Mode: `publish`
- Owner prefix: `desktop-material-tui-proof-019fa510-`
- Cleanup state: **Complete — every run-owned process, display, temporary
  filesystem root, Docker image, and WSL distribution was removed and then
  proven absent.**

Every identifier below was resolved from this run. No PID, display, window ID,
or path was reused from an earlier run.

| Owned resource | Exact runtime value | Teardown | Final proof |
| -------------- | ------------------- | -------- | ----------- |
| ephemeral WSL distribution | `llcu-tmp-1785184334-1e40` | terminated and unregistered | absent from `wsl.exe --list --quiet` |
| resolved disposable root | `/tmp/desktop-material-tui-proof-019fa510-oon3lK` | exact validated root removed | path absent before distro teardown |
| deterministic Git fixture | root child `fixture` | removed with root | included in exact child allowlist |
| local bare origin | root child `origin.git` | removed with root | included in exact child allowlist |
| XDG roots | root children `xdg`, `xdg-final`, `xdg-bilingual` | removed with root | included in exact child allowlist |
| Linux wheel-smoke environment | root child `wheel-env` | removed with root | included in exact child allowlist |
| Lowlevel HTTP verification server | `127.0.0.1:8766`, PID `716` | exact command matched; `SIGTERM` | PID absent and port closed |
| Lowlevel virtual display | `:98`, accepted-capture Xvfb PID `7003`, Openbox PID `7006`, `1600x1000x24` | cleanly stopped | display unreachable; both PIDs absent |
| terminal window identifier | `2097158` | closed | absent from the display window list |
| terminal/TUI process | final TUI PID `8009` | Ctrl+Q | PID absent |
| screen recording | not used | not applicable | no recorder created |
| raw capture directory | root child `captures` | removed with root after promotion | exact root absent |
| Docker verification image | `desktop-material-tui:codex-final-019fa510` on `docker@192.168.50.193` | removed in build proof finalizer | `docker image inspect` returned “No such image” |

The first candidate root,
`/tmp/desktop-material-tui-proof-019fa510-kezanG`, was removed by the ephemeral
distribution when it stopped before Xvfb was active. It contained only the
owned fixture, XDG directories, and wheel environment; absence was confirmed
before the active root above was created.

An initial direct-client display, `:97` (PID `330`), was cleanly stopped after
the stateless client could not retain its process registry between calls. An
earlier run-owned `:98` Xvfb PID `795` was also stopped during setup; final
accepted captures came from the `:98` process identifiers in the table.

## Promoted evidence

| Capture | Bytes | SHA-256 | Original inspected | Source removed |
| ------- | ----: | ------- | ------------------ | -------------- |
| `docs/assets/screenshots/linux-tui-overview.png` | 74,330 | `f65f309ff94a44830d76b01fd5949c9793b0caddd4e520914d194cf38e0e9550` | Yes | Yes |
| `docs/assets/screenshots/linux-tui-text-input.png` | 75,793 | `0d849cb47988184b6ef3e95e14fec9a52ddb33c0f3f17d20910d329064e64d8b` | Yes | Yes |
| `docs/assets/screenshots/linux-tui-regex-builder.png` | 73,555 | `ab4ff04021967edbc836e3c13ebd9f24878e4652fbff1e9b3de02439960f7e7e` | Yes | Yes |
| `docs/assets/screenshots/linux-tui-bilingual-narrow.png` | 58,251 | `fa71881abf15c8290d6db76110a785b8598c1465ccb52cb2c513e5da665b771d` | Yes | Yes |
| `docs/assets/screenshots/linux-tui-cheap-lfs.png` | 88,937 | `dd5a47907681645df5bad79b8f80ddc0d84a0739caebd7341bd0189cad98035a` | Yes | Yes |

The promoted PNGs were compared byte-for-byte with the accepted raw captures.
Immediately before root deletion, the root resolved identically, its immediate
children matched the ten-entry allowlist, no process held an open descriptor
beneath it, and no Xvfb or TUI process remained. The two run-owned Windows
temporary directories used for the full test log and wheel install were also
validated beneath `%TEMP%`, removed, and proven absent.

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
