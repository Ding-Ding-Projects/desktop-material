# Linux TUI path browser and Git wrapper run manifest

<!-- markdownlint-disable MD013 -->

- Run ID: `linux-tui-path-browser-wrapper-2026-07-27-019fa510`
- Mode: `publish`
- Starting branch: `main`
- Starting commit: `f555d374a66f50fe8dcb343a84b94f75f8876a6e`
- Product boundary: the Textual edition targets Linux first and retains its
  tested Windows Terminal/core path; the Electron edition remains Windows-only.
- Source target: the final integrated commit recorded below after commit.
- Disposable owner prefix:
  `desktop-material-tui-browser-wrapper-20260727-`.
- Capture target:
  `docs/verification/linux-tui-path-browser-wrapper-2026-07-27/path-browser.png`.
- Automation boundary: Lowlevel MCP only, through a temporary clone of the
  installed `Debian` WSL distribution, one real Xvfb display, and one real
  mouse-capable terminal. The user's visible Windows desktop must remain
  untouched.

## Expected behavior

- The Open repository dialog retains a real editable text field.
- Browse/Hide, Home, and Up are mouse- and keyboard-reachable.
- The tree lists folders rather than selectable regular files.
- Clicking a folder writes its path into the editable field and Open submits
  that exact normalized path.
- Bracketed paste of a path wrapped in matching single or double quotes removes
  one wrapper pair immediately; submission provides the same fallback for
  terminals without bracketed paste.
- `github git <argv>` passes native Git arguments without a shell.
- `github push` and `github git push` run a native Git dry-run, Cheap LFS
  preflight, then the real native push; they never rewrite history, stage,
  commit, or upload automatically.
- `github pull` and `github git pull` run native Git first, then materialize
  canonical pointers only through exact size/hash verification.
- Linux and Windows one-line installation commands install all three launchers
  and add uv's tool directory to future shell `PATH` values.

## Build and automated gates

- [ ] Inspect the complete integrated diff and source status.
- [x] Run the full locked Python test suite: 250 passed and one Linux-only case
      skipped on Windows in 182.76 seconds.
- [x] Run Ruff lint and formatting checks.
- [x] Run strict mypy for the full package on the normal and Linux platform
      targets.
- [x] Check the generated 201-row parity contract.
- [x] Build wheel and source distribution.
- [x] Inspect package paths, metadata, styles, `py.typed`, and the `github`,
      `dmt`, and `desktop-material-tui` entry points.
- [x] Install the package with `uv tool install --force ./tui` and smoke all
      aliases.
- [x] Regenerate the documentation hub catalog; its focused page/catalog suite
      passed 33 tests, generated JS/HTML passed Prettier, and all three dated
      manifests passed Markdownlint.
- [ ] Run the remaining repository-wide documentation/link gates.
- [x] Exercise the Windows uv tool installation and PATH update. All three
      aliases resolve from `C:\Users\cntow\.local\bin` and report `0.1.0`.
- [x] Install the freshly built wheel in the disposable Linux distro and smoke
      all three aliases at `0.1.0`.

## Real Linux interaction gate

Golden order: inspect a current screenshot, resolve the runtime window handle,
act only against the hidden display, then capture and inspect the result.

- [x] Resolve WSL availability and select `Debian` from the returned inventory.
- [x] Create one Lowlevel-owned temporary distro and record its exact opaque
      name in the cleanup ledger.
- [x] Install Git, Python, Xvfb, xterm, xdotool, xclip, ImageMagick, fonts, the
      vendored Lowlevel client, and the freshly built TUI wheel.
- [x] Create a deterministic disposable bare remote plus two working copies.
- [x] Prove `github git status --short` native passthrough in the fixture.
- [x] Prove `github push --dry-run` performs no ref mutation.
- [x] Prove a normal `github push` publishes a safe commit.
- [x] Prove `github pull` integrates a canonical pointer and restores its
      locally cached payload with exact byte/hash verification and no provider
      credential.
- [x] Launch the packaged `github` TUI in a real xterm on one Xvfb display.
- [ ] Open the repository path dialog, use real bracketed paste with matching
      outer quotes, and prove the visible field is normalized immediately.
- [ ] Click Browse, inspect the folder-only tree, click the fixture directory,
      and open it.
- [ ] Resize to 80×24 and prove the field, browser controls, tree, and
      Cancel/Open actions remain inside the viewport.
- [x] Capture and inspect the real Open repository state at original resolution.
- [ ] Quit with Ctrl+Q and prove the terminal/TUI process exits.

## Evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| focused path/parser/Pilot tests | accepted | 29 passed |
| Cheap LFS Git wrapper tests | accepted | 47 passed |
| full locked suite/static/package | automated gates accepted; install inspection pending | 250 passed, 1 Linux-only skip in 182.76 seconds; Ruff lint/format clean; strict mypy clean on normal and Linux targets; wheel and source distribution built |
| one-line installs | accepted for the Windows host and packaged Linux wheel | Windows aliases resolve from `C:\Users\cntow\.local\bin`; the disposable Linux environment reported all aliases at `0.1.0` |
| real Linux CLI push/pull | accepted | disposable remote advanced through `safe-push` and `pointer`; the consumer materialized 23 bytes whose SHA-256 `7105fb968e5a0c2501ca439db315f6fe96bebc3d75551dfef293566da729f0ee` exactly matched the index pointer and cache object |
| real Linux browser/quoted paste | partial | packaged xterm and Open repository dialog captured; immediate quoted-paste normalization and expanded tree interaction remain covered by Pilot/unit tests rather than accepted live evidence |
| screenshot SHA-256 | accepted for retained Open-dialog capture | `open-repository-dialog.png`: `95ce306606df496341d9b8155ae08386a7d2b916f6949cf85228698ea693b9b2` |
| exact remote CI/Pages/wiki | current milestone pending | Prior compatibility commit `f555d374a6` is contained in `origin/main`; run `30317262582` passed the Linux TUI matrix and Windows TUI core but failed overall in the unrelated Windows x64 unit job; installer run `30318769692` failed and published no Release |

## Cleanup gate

- [x] Stop the exact virtual display.
- [x] Destroy the exact Lowlevel-owned temporary WSL distro.
- [x] Prove the distro is absent from `wsl_list_temp`.
- [x] Prove no disposable fixture, terminal, Xvfb, install environment, or
      Windows installation-test root remains.
- [x] Record every exact identifier and cleanup result in
      [cleanup-ledger.md](cleanup-ledger.md).

Current state: **handoff accepted with a bounded live-interaction gap**. The
source, automated gates, package installation, fixture-backed push/pull receipt,
real packaged xterm launch, Open-dialog capture, and cleanup are accepted.
Immediate quoted-paste normalization, the expanded folder-tree click path,
80×24 live resize, and Ctrl+Q process-exit proof remain explicitly unaccepted
live gates; their behavior is covered by the focused automated suite. Integration
and publication are recorded by the final commit/push handoff.
