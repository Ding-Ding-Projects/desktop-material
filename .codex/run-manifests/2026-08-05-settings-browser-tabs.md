# Browser-style settings tabs verification — 2026-08-05

## Scope

- Mode: `capture-only` during implementation; no public wiki or Pages promotion is authorized by this manifest.
- Milestone: browser-style tabs for Global Settings, Repository Settings, and Stash Manager.
- Expected UI: all three surfaces use the shared horizontal tab strip with open-page persistence, close controls, a new-page picker, overflow discovery, keyboard navigation, and tab/tabpanel semantics.
- Source worktree: `C:\Users\cntow\Documents\GitHub\desktop-material-settings-browser-tabs`.
- Branch: `codex/settings-browser-tabs-followup`.
- Baseline commit: `668d8183cd1d5dcefb67052acec91e6561a07eef`.
- Remote: `origin` at `https://github.com/Ding-Ding-Projects/desktop-material.git`.

## Initial state

- The source worktree was created fresh from the baseline commit before task files were read or edited.
- Only the implementation, focused-test, compile-config, and this manifest are intended changes at this stage.
- Other linked worktrees and their dirty state remain outside this task's write set.

## Required route

- Preflight and GUI verification use the bundled `lowlevel_mcp_client.py` against `http://127.0.0.1:8765/mcp`.
- The MCP service preflight returned `startup_status.ok=true`; the scheduled task is `LowLevelComputerUseMCP` and is running.
- The MCP checkout revision is recorded from `git rev-parse HEAD` when the preflight completes.
- Build command, through MCP `run_command` from this source worktree:

  ```text
  npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod
  ```

- GUI work must use one uniquely named off-screen Win32 desktop, a disposable Git fixture, an isolated Electron user-data directory, a runtime-resolved window handle, and CDP or the skill's background capture route. The user's visible desktop must remain untouched.

## Ordered checks

1. Run focused unit and style tests for the shared strip, Settings, Repository Settings, and Stash Manager.
2. Run the repository type-check and record baseline errors separately from changed-file errors.
3. Run the independent correctness, accessibility, and responsive-style review plus refutation pass.
4. Build the unpackaged production artifact through the MCP route above.
5. Launch the built application on the hidden desktop and capture Settings, Repository Settings, and Stash Manager in the browser-tab state.
6. Inspect each original PNG for nonblank pixels, clipping, focus/selection state, and accidental private data before any documentation promotion.
7. Re-run focused tests, inspect the complete diff, and scan for secrets.

## Artifact policy

- Captures stay in an owned temporary run directory unless visual inspection proves that an existing tracked screenshot needs a truthful refresh.
- No generated image, disposable fixture, user-data directory, desktop, or runtime log may be added to the repository.
- Documentation updates are limited to the feature article/index, repository README/roadmap/handoff/changelog surfaces, and the existing site/wiki source when their current structure supports the feature.
