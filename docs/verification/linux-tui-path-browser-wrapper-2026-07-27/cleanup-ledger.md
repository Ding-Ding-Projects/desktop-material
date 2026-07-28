# Linux TUI path browser and Git wrapper cleanup ledger

<!-- markdownlint-disable MD013 -->

- Run ID: `linux-tui-path-browser-wrapper-2026-07-27-019fa510`
- Owner prefix: `desktop-material-tui-browser-wrapper-20260727-`
- State: `Complete`

| Resource | Exact identifier | Cleanup result | Absence proof |
| --- | --- | --- | --- |
| temporary WSL distro | `desktop-material-tui-browser-wrapper-20260727-019fa510` | already absent when the final destroy command ran; the server returned exact `not found` instead of claiming a second deletion | absent from the post-run distro inventory; `wsl_list_temp` returned `count: 0` |
| virtual display | `:113` (earlier observations included PIDs `283` and `1049`; final relaunch PID `3294`) | exact owned Xvfb processes stopped before distro destruction | distro removal eliminates the display socket and process namespace |
| superseded virtual display | `:117` (Xvfb PID `571`) | stopped after the stateless cheap client returned `not tracked`; exact owned PID terminated | `kill -0 571` failed as expected |
| Xvfb/xterm/TUI processes | final observed Xvfb PID `3294`; packaged xterm/TUI window used runtime handle `2097164` before relaunch | stopped/destroyed with the disposable distro | distro absent after destroy |
| Linux fixture and bare remote | `/root/dm-verify/fixture`; symlink `/tmp/desktop-material-tui-browser-wrapper-20260727-019fa510-fixture` | removed with the disposable distro | distro absent after destroy |
| Linux verification environments | `/root/dm-verify/lowlevel-venv`; `/root/dm-verify/tui-venv`; `/opt/desktop-material-lowlevel-venv`; `/tmp/desktop-material-tui-venv` | removed with the disposable distro | distro absent after destroy |
| raw Windows capture staging | `C:\Users\cntow\AppData\Local\Temp\desktop-material-path-browser-raw-019fa510` | one genuine post-paste frame was promoted byte-for-byte as `path-browser.png`, then the exact owned staging directory was removed | filesystem absence proved after removal; promoted SHA-256 is `02b51879e2982ff5ae651e35da1ab440d5fcad923652b74a9d07e7497a5df32d` |
| Windows uv tool install | `C:\Users\cntow\.local\bin\{github,dmt,desktop-material-tui}.exe` | retained by user request | all three resolve on PATH and report `0.1.0` |
| retained Open-dialog capture | `docs/verification/linux-tui-path-browser-wrapper-2026-07-27/open-repository-dialog.png` | repository-owned evidence retained | 16,856 bytes; SHA-256 `95ce306606df496341d9b8155ae08386a7d2b916f6949cf85228698ea693b9b2` |

Cleanup is accepted by exact absence proof. The final destroy call raced with
the distro already being absent and returned `not found`; no second destruction
is inferred. The remaining Windows executables are the requested installation,
not disposable residue.
