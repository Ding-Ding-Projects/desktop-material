---
name: verify-desktop-material-headless
description: Build, exercise, capture, document, commit, and push a Desktop Material milestone through the exact lowlevel-computer-use MCP HTTP server and an off-screen Win32 Headless Desktop. Use for Desktop Material UI verification, milestone screenshots, README or Pages or wiki screenshot refreshes, and HANDOFF.md updates where the user's visible desktop must remain untouched.
---

# Verify Desktop Material Headlessly

Keep every build and GUI action invisible. Never open a terminal window, focus a
normal window, call `show_headless_desktop`, or switch away from the user's live
desktop.

## Fixed locations

- Project: `C:\Users\cntow\Documents\GitHub\desktop-material`
- MCP checkout: `C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP endpoint: `http://127.0.0.1:8765/mcp`
- MCP Python: `<MCP checkout>\.venv\Scripts\python.exe`
- Client: `scripts/lowlevel_mcp_client.py` relative to this skill

Invoke every low-level tool with the bundled client so calls reach the requested
HTTP server instead of a stale native MCP registration. Pass the tool's model
fields as the JSON object; the client discovers whether the server expects the
object directly or under `params`.

## Workflow

1. Write a run manifest before acting: mode (`capture-only`, `local-docs`, or
   `publish`), milestone, expected UI state, ordered background interactions,
   disposable fixture path, screenshot target/theme/dimensions, documentation
   allowlist, tests, remote, and expected branch. Publication requires explicit
   user authorization; "always push" is authorization for this repository.
2. Confirm the project worktree, exact remote/branch, and active GitHub account.
   Record the initial dirty-state baseline and preserve it; do not redefine
   success as a clean tree when unrelated changes existed initially.
3. Preflight the target MCP with `startup_status`. Query the scheduled task's
   executable/arguments through MCP `run_command`, and verify they point at the
   fixed MCP checkout and port. Also run `git rev-parse HEAD` in that checkout.
   Require `ok: true`; for `run_command`, also require `returncode: 0` and
   `timed_out: false` (`client_ok: true` enforces all three).
4. Run the reproducible unpackaged build through MCP `run_command`:
   `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
   with the project as `cwd`, a 3600-second tool timeout, and a client timeout
   longer than the build. Abort rather than downloading a missing dependency.
5. Create a deterministic disposable Git fixture and isolated user-data path in
   a unique owned Temp directory. Record a cleanup ledger containing the run id,
   owned paths, desktop name, create state, launch PID, and resolved HWND.
6. Create one uniquely named headless desktop. Do not call create twice for the
   same live name.
7. Re-check the Electron binary after the build. Launch it with absolute paths,
   `--disable-gpu`, the isolated `--user-data-dir`, and only the disposable
   fixture as `--cli-open`. Save the returned PID.
8. Poll `list_headless_windows` with a deadline; resolve the current Desktop
   Material HWND at run
   time. Never hard-code a handle.
9. Take a stable, nonblank `client_only: true` capture before coordinate input.
   Drive only with this allowlist: HWND-targeted `mouse_click`, `type_text`,
   `win_send_keys`, `resize_window`, and `screenshot`; `window_action` by
   verified handle for graceful close; exact saved-PID termination only as
   fallback. Do not use
   global mouse/keyboard/focus/scroll tools. Re-capture after each meaningful
   action. If Chromium ignores background input, use a documented app-native
   hook or abort; never expose the headless desktop.
10. Capture the final window to a unique owned Temp PNG. Inspect it at original
   resolution for the expected state, black/blank pixels, clipping, private
   data, theme, and dimensions. Only after acceptance, promote it to the tracked
   `docs/assets/screenshots/` target and verify the promoted file plus SHA-256.
11. Update the README caption or reference, the Pages gallery when relevant, an
   actual Markdown image in `docs/wiki/`, and `HANDOFF.md`. The wiki source should
   use a raw main-branch image URL so it also renders from the separate wiki repo.
12. Ask for confirmation immediately before a browser-only public wiki bootstrap.
    Once the wiki git remote exists, ordinary requested git pushes do not need a
    browser action.
13. In a `finally` cleanup path, close the app by its revalidated resolved HWND.
    If graceful close fails, revalidate and terminate only the saved launch PID.
    Poll with a deadline until owned windows are gone, then close the desktop if
    creation succeeded. Remove only owned Temp paths after resolving them beneath
    the run root.
14. Run declared focused tests, lint/typecheck/build checks, inspect the full and
    staged diffs, and scan for secrets. In publish mode, reject remote divergence,
    stage only the manifest allowlist, commit, push `origin/main` without force,
    and verify the remote SHA, applicable CI/Pages/release runs, README image, and
    wiki image. Restore the initial worktree baseline plus intended changes.

## Safety gates

- Never kill by the generic name `electron.exe`; other Electron apps may belong
  to the user.
- Never use `show_headless_desktop` during an unattended run.
- Treat `rendered_ok` as transport success only; visually inspect the pixels.
- Pair every successful create with app cleanup and desktop close.
- Do not claim README or wiki coverage unless each rendered page contains the
  current image.
