# Close-all-open-issues verification run

- Run ID: `close-all-open-issues-20260728`
- Mode: `publish`
- Milestone: resolve, verify, publish, and close every actionable issue open at
  the start of this run: #23, #78, #80, #81, #82, #83, #85, #86, #87, and
  #89.
- Project worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material-close-issues-20260728`
- Initial source: `origin/main` at
  `75b45da89d494e031d01332a6c30c5407d371e21`
- Initial dirty-state baseline: clean, with zero divergence from `origin/main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Active GitHub account: `codingmachineedge`
- Working branch: `codex/close-all-open-issues-20260728`
- Expected publication branch: `main`
- Force push: prohibited

## Expected UI and behavior

- #23: every repository screenshot requested by the issue has a fresh,
  original-pixel, private-data-free capture from the current built application;
  README, Pages, and wiki references render the promoted assets.
- #78: optional Cheap LFS payload encryption has a usable passphrase flow,
  authenticated ciphertext, legacy plaintext compatibility, and documented
  failure behavior.
- #80: user-initiated push/fetch/pull failures are observed exactly once and
  present the actionable underlying failure without a duplicate generic toast.
- #81: repository and tab groups can be managed as first-class entities and a
  group exposes a usable member dropdown.
- #82: expensive startup/view work loads progressively without a blocking
  screen, while errors and cancellation remain visible and recoverable.
- #83: independent English and Cantonese funny-level controls are visible,
  accessible, persisted, and reflected in previews.
- #85: decrypting encrypted Cheap LFS content reports a truthful decrypting
  stage rather than a decompressing stage.
- #86: repository removal/re-addition cannot orphan or accidentally reuse a
  saved Cheap LFS passphrase.
- #87: an encrypted unattended commit-time Cheap LFS pin has a safe,
  deterministic passphrase path and never hangs or silently uploads plaintext.
- #89: appearance editing is reachable with Shift+right-click while ordinary
  right-click retains its native/context-menu meaning.

## Ordered background interactions

1. Preflight the exact lowlevel-computer-use MCP HTTP server, scheduled-task
   command, and MCP checkout revision.
2. Run the reproducible unpackaged production build through the MCP server.
3. Create one owned temporary run root containing deterministic Git fixtures,
   isolated app user data, captures, logs, and a cleanup ledger.
4. Create one uniquely named off-screen Win32 desktop.
5. Launch only the freshly built Desktop Material Electron binary with
   `--disable-gpu`, the isolated user-data directory, and the disposable
   fixture supplied through `--cli-open`.
6. Resolve the live HWND from the saved PID, capture a stable nonblank frame,
   and use only HWND-targeted allowlisted input.
7. Exercise each UI acceptance path, recapturing after every meaningful state
   transition.
8. Inspect candidate PNGs at original resolution, promote only accepted
   captures, then verify dimensions, bytes, and SHA-256.
9. Gracefully close the verified HWND, fall back only to the exact saved PID,
   close the owned desktop, and remove only containment-checked owned paths.

## Fixture and capture contract

- Owned run root:
  `%TEMP%\DesktopMaterial-close-all-open-issues-20260728-<unique>`
- Short-path P0 runtime root:
  `%TEMP%\desktop-material-p0-ui-<unique>` (kept below the established gallery
  fixture path-length ceiling and matching the fixture scripts' ownership
  prefix; independently owned and recorded in the cleanup ledger)
- Cleanup ledger:
  `docs/verification/close-all-open-issues-2026-07-28/cleanup-ledger.md`
- Headless desktop:
  `DesktopMaterialCloseIssues-20260728-<unique>`
- Theme: capture the theme required by each existing public target; otherwise
  use the repository's Material dark default.
- Dimensions: preserve each tracked target's documented dimensions; new
  milestone frames default to 1440x960, with any responsive variants recording
  their exact requested and observed sizes.
- Candidate capture location: beneath one of the two exact owned run roots
  recorded in the cleanup ledger only.
- Promotion targets: only issue-required paths under
  `docs/assets/screenshots/`.

## Change and documentation allowlist

- Product sources under `app/src/` needed by the ten starting issues
- Regression and verification tests under `app/test/`, `script/`, and `tui/`
  when directly relevant
- Deterministic capture tooling under `script/`
- Deterministic headless capture plans and CDP drivers under
  `.codex/verification/`
- Issue-required public screenshots under `docs/assets/screenshots/`
- README/gallery/wiki references in `README.md`, `docs/`, and `_config.yml`
- This run's records under
  `docs/verification/close-all-open-issues-2026-07-28/`
- `HANDOFF.md`

Any path outside this allowlist requires an explicit manifest update explaining
why it is necessary before it is staged.

## Verification gates

- Issue-focused regression tests, including proof that each regression test
  fails when its corresponding fix is reverted where practical
- `node script/test.mjs` full suite
- `node script/test.mjs script`
- `npx tsc --noEmit`
- `yarn lint`
- repository-wide Prettier check
- relevant TUI tests, Ruff, mypy, and package build if TUI files change
- exact MCP production build and off-screen interaction/capture acceptance
- `git diff --check`, full/staged diff review, and secret scan
- pushed `origin/main` SHA equality and ancestry proof for every completed
  source branch/worktree
- applicable CI, Pages, installer/release, README image, and wiki image checks

Issue closure requires shipped remote ancestry plus acceptance evidence. If an
issue is genuinely blocked by missing external authority or information, the
run will record the exact blocker and will not misrepresent it as closed.

## Headless preflight receipt

- `startup_status`: `ok: true`, installed, scheduled task state `Ready`
- Scheduled task: `\LowLevelComputerUseMCP`
- Executable: `uv`
- Arguments:
  `run --directory C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp lowlevel-computer-use-mcp --http --host 127.0.0.1 --port 8765`
- Working directory:
  `C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP checkout HEAD:
  `f2edfe442555cfe35a519dd0b058986cb09d6ee3`
- Endpoint: `http://127.0.0.1:8765/mcp`
- Every preflight call returned `client_ok: true`, `returncode: 0` where
  applicable, and `timed_out: false`.
