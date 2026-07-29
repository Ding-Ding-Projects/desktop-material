# Final bug-hunt verification run

- Run ID: `bug-hunt-20260728-final`
- Mode: `publish`
- Milestone: pull the current default branch, audit the full product and
  repository topology, fix every reproducible defect found in scope, verify the
  resulting Windows application off-screen, then publish a clean `main`.
- Initial source: `origin/main` at
  `80e0209a12f41df8a6a80ef52925b52ab9ecb1b0`
- Integration worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material-worktrees\bug-hunt-20260728`
- Canonical build worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material`
- Working branch: `codex/bug-hunt-20260728`
- Expected publication branch: `main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Repository-affine GitHub account: `DingDingChae`
- Started: `2026-07-28 23:17:46 -04:00`
- Force push: prohibited

## Expected source and UI behavior

- Windows CRLF checkouts pass the Pages push contract without weakening the
  requirement for a standalone `git push`.
- Concurrent Cheap LFS restores keep one truthful visible owner: a stale
  operation cannot overwrite or clear the newer operation's progress.
- A Regex Builder opened from a search control inside a popover remains usable
  after focus, typing, pointer interaction, and Apply; an unrelated portal
  still counts as outside the popover.
- Enter or Space on an overflow row's Customize appearance button performs
  only customization and never switches the highlighted repository tab.
- Empty search results preserve native text-caret keys and expose no ARIA
  relationship to a listbox that is not mounted.
- Shared filter and Regex Builder chrome follows English, Hong Kong Cantonese,
  and bilingual language modes, including a mode change while open.
- Tab-group copy is grammatically truthful at zero, one, and many; shared
  controls meet the repository hit-target convention; focus-container
  descendant moves do not create redundant leave/re-enter renders or a stale
  animation-frame callback.
- The current-source updater-ready gallery frame exists and is generated only
  from the final built application.

## Ordered off-screen interaction plan

1. Reconfirm clean canonical and integration worktrees, branch ancestry,
   worktree/stash inventory, remote URL, repository-affine account, and
   `origin/main`.
2. Use only `scripts/lowlevel_mcp_client.py` against
   `http://127.0.0.1:8765/mcp` for host and GUI actions. Record startup,
   process, scheduled-task, and non-elevated execution preflight.
3. Fast-forward the canonical worktree to the reviewed integration tip, then
   invoke the production build through the MCP `run_command` tool. Stop on any
   failed exit code or missing final artifact.
4. Create a unique disposable fixture root and user-data directory under the
   system Temp directory. Launch the built application on a uniquely named
   off-screen Win32 Headless Desktop; never show or switch to that desktop.
5. Drive background HWND controls, or the repository's app-native Chromium
   verification hook when Chromium rejects background Win32 input. Exercise
   the tab-overflow search, open Regex Builder, focus/type/apply a pattern,
   activate Customize with Enter and Space, and confirm zero-result keyboard
   and accessibility state.
6. Run the current-source updater verifier against the same final build.
   Capture only the approved assets below at original pixels.
7. Inspect every candidate at original resolution, verify expected state,
   absence of unrelated windows/private data, and receipt integrity. Promote
   only passing candidates, then update README, canonical wiki, verification
   index, and `HANDOFF.md`.
8. Run the complete applicable static/unit/build gates, push `main`, verify
   remote ancestry and required Actions, then remove only worktrees/branches
   whose useful tips are ancestors of the pushed default branch.

## Exact write allowlist

- `%TEMP%\DesktopMaterial-bug-hunt-20260728-*`
- `docs/assets/screenshots/auto-updater-current-source-ready.png`
- `docs/assets/screenshots/bug-hunt-regex-builder-popover.png`
- `docs/verification/bug-hunt-2026-07-28/**`
- `README.md`
- `docs/readme-tabs/screenshots.md`
- `docs/wiki/Feature-Gallery.md`
- `docs/verification/README.md`
- `HANDOFF.md`

No untracked file outside the disposable Temp root and the repository paths
listed above is authorized.

## Required verification

- Changed-file Prettier and ESLint
- `npx --no-install tsc --noEmit`
- Focused regression suites for Pages, Cheap LFS routing, popovers, search,
  Regex Builder, tab groups, and focus handling
- Complete application unit suite
- Documentation catalog generation and checked parity generation
- Windows production build through the low-level MCP server
- Off-screen original-pixel visual inspection plus privacy scan
- Branch and final-default CI, including Windows x64, Windows arm64, and
  packaged Windows x64 E2E jobs

## Failure boundary

Any failed command, unexpected repository mutation, missing or stale artifact,
unreadable private fixture, unrelated captured window, receipt mismatch,
visual/accessibility mismatch, or remote ancestry discrepancy blocks
publication or issue closure. Historical images and local source evidence are
not substitutes for a fresh final-build receipt.
