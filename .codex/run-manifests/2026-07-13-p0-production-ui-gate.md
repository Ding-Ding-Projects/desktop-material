# Desktop Material P0 production UI gate run manifest

- Mode: `publish`
- Run id: `dm-p0-ui-20260713-c7e68853`
- Milestone: verify the four pushed P0 named workflows—deepen shallow history, create a pull request, browse/download an Actions artifact with digest context, and inspect effective branch rules—through the exact unpackaged production build on one off-screen Win32 desktop; reject clipping, overlap, oversized text, and page-level horizontal scrolling; then refresh README, wiki, Pages, screenshots, and handoff evidence
- Exact source root: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Exact source commit at manifest creation: `c7e68853475745acc3655e480269fe2eb3a3b196`
- Initial dirty-state baseline: clean on `mega-feature-update`, with local `HEAD`, `origin/mega-feature-update`, and direct remote ref all equal to `c7e68853475745acc3655e480269fe2eb3a3b196`
- Remote: `origin` (`https://github.com/codingmachineedge/desktop-material.git`)
- Expected branch: `mega-feature-update`, tracking `origin/mega-feature-update`; push without force after each completed evidence increment
- Expected GitHub account: `codingmachineedge`; confirm with `gh auth status` without printing credentials before publication
- Publication authorization: the user explicitly requires the primary agent and every writing subagent to commit and push continuously

## Required UI states

1. **Deepen shallow history** — a deterministic shallow fixture exposes the named deepen-history action, bounded depth input, review/confirmation copy, cancellable progress, and a verified completion result without a raw Git command editor.
2. **Create pull request** — an exact-provider feature branch opens the native compose/review/submit workflow with safe base/head identity, title/body, permission-aware state, confirmation, cancellation/duplicate-risk copy, and a successful local-provider result. No public pull request may be created by this run.
3. **Actions artifact** — a deterministic workflow run exposes its first bounded artifact page, destination review, size/expiry/digest/attestation-presence context, exact cancellation, safe local extraction/download result, and reveal action. No untrusted archive path may escape the owned run root.
4. **Effective branch rules** — the Repository menu opens the named non-modal inspector for the exact checked-out remote branch. The loaded state must explain reviews, checks, signatures, history, merge queue, update/delete/force operations, account-specific bypass, source rulesets, partial/unknown evidence, refresh, and safe source links without displaying raw REST/GraphQL responses or CLI commands.
5. **Branch-rules recovery states** — signed-out and ambiguous/incompatible repository-account states must provide complete, wrapped routes to Accounts or Repository settings at the minimum supported width.
6. **Mixed non-modal sheets** — Branch Rules and Sparse Checkout may be reopened/retargeted in either order; the foreground sheet must own focus, Escape, and Ctrl/Cmd-W while both remain fully on-screen.

## Responsive and visual acceptance matrix

- Regular capture target: light theme, approximately 1000 × 687 client pixels, one accepted documentation capture for each of the four P0 workflows.
- Minimum-width evidence: product-enforced minimum window width for every P0 surface and both branch-rules recovery states; temporary evidence is retained until documentation promotion is complete.
- 200% evidence: each P0 surface at 200% renderer zoom or the closest exact app-supported zoom reached through HWND-targeted keys/app-native inspection; actions must wrap or stack and remain operable.
- Short-window evidence: at or below 560 CSS pixels high for Branch Rules and any vertically dense confirmation surface.
- Geometry gate: `document.scrollWidth === document.clientWidth`; each relevant panel/card/action row must stay inside the client rect; no visible sideways scrollbar, clipped label, overlap, ellipsis that hides required action copy, oversized heading, black/blank region, or off-screen control.
- Text stress: repository, branch, ruleset, check, deployment, artifact, file, and account labels use deterministic long fixture values and must wrap safely.
- Screenshot privacy: only synthetic owner/repository/account names, dummy tokens, owned Temp paths where unavoidable, and deterministic fixture content may appear.

## Screenshot and documentation targets

- Accepted tracked PNG targets: `docs/assets/screenshots/material-history-deepening.png`, `docs/assets/screenshots/material-create-pull-request.png`, `docs/assets/screenshots/material-actions-artifacts.png`, and `docs/assets/screenshots/material-effective-branch-rules.png`.
- Promote only stable, nonblank, original-resolution captures whose dimensions, visible state, theme, privacy, and SHA-256 have been inspected after capture.
- Documentation allowlist: this manifest; `README.md`; `HANDOFF.md`; relevant `docs/wiki/*.md`; relevant Pages sources under `site/`; the four screenshot targets above; and, only if a deterministic verification harness must be retained, narrowly scoped files under `.codex/verification/` with tests.
- Wiki source images must use raw `main`-branch URLs so the separate GitHub wiki renders them. Mirror the accepted Markdown/images to the existing wiki remote and verify its remote SHA and image responses.
- Pages may be built and its branch-targeted workflow observed, but do not bypass the protected `github-pages` environment or merge this feature branch to `main` solely to promote it.

## Ordered background interactions

1. Reconfirm source root, clean baseline, exact branch/remote SHA, and active GitHub account.
2. Use the skill-bundled `scripts/lowlevel_mcp_client.py` against `http://127.0.0.1:8765/mcp`. The skill text contains stale `C:\Users\cntow\...` paths; this run must use the actual Administrator checkouts and record that mismatch rather than touching another checkout.
3. Require MCP `startup_status` `ok: true`. Through MCP `run_command`, inspect the scheduled task executable/arguments and require the actual server checkout `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`, port `8765`, and its exact `git rev-parse HEAD`; require `client_ok: true`, `returncode: 0`, and `timed_out: false` for every preflight command.
4. Through MCP `run_command`, build exactly `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` from the source root with a 3,600-second tool timeout and a longer client timeout. Abort rather than downloading any dependency.
5. Create one unique owned run root beneath `%TEMP%\desktop-material-p0-ui-20260713-c7e68853`. Under it create the disposable Git repositories/remotes, isolated user-data/home/config directories, captures, downloaded artifacts, local fake-provider state, logs, and cleanup ledger. Resolve every path beneath this root before later deletion.
6. Build a deterministic loopback-only GitHub Enterprise-compatible provider when provider data is required. Use a unique dummy account/token and synthetic `material-fixture` repository; bind to an owned ephemeral localhost port; implement only the exact repository, branch, protection, ruleset, pull-request, Actions, artifact, and download routes exercised by the production app. The stored Git remote and provider HTML identity use the reserved `.invalid` name `material-provider.invalid`; repository-local `http.proxy` sends only Git transport to the owned loopback listener without rewriting the identity Desktop reads. Record every request, reject unexpected mutations, and never proxy credentials or public GitHub traffic. A pull-request submit must mutate only in-memory/local fake-provider state.
7. Seed only the isolated profile and its unique dummy credential. Record and delete that exact credential during cleanup; do not read, copy, or alter the user's normal Desktop profile.
8. Create exactly one uniquely named headless desktop, `DesktopMaterialP0-20260713-c7e68853`; record creation state/handle once.
9. Recheck the newly built Electron binary. Launch with absolute paths, `--disable-gpu`, the isolated `--user-data-dir`, and only the disposable fixture as `--cli-open`; save the exact PID. Poll `list_headless_windows` to resolve the current Desktop Material HWND at runtime.
10. Capture a stable nonblank `client_only: true` image before coordinate input. Drive only the verified HWND with `mouse_click`, `type_text`, `win_send_keys`, `resize_window`, `screenshot`, and revalidated-handle `window_action`. Re-capture after every meaningful action.
11. If Chromium again rejects background-posted input or serves stale compositor pixels, document the failed allowlisted attempt and use only the repository's app-native Playwright/Electron hook on an owned loopback debug port. Never call `show_headless_desktop`, global input/focus/scroll tools, or expose/switch the user's desktop.
12. Exercise all required states and the responsive matrix. Store raw captures under the owned run root, inspect original pixels and geometry, and promote only accepted files.
13. In a `finally` cleanup path, close the app through its revalidated HWND. If graceful close fails, revalidate and terminate only the saved launch PID. Poll until owned windows/PIDs and loopback listeners are gone; close the headless desktop if and only if creation succeeded; delete only the exact dummy credential and owned paths after containment checks.
14. Update the allowed documentation/evidence, run declared checks, inspect full/staged diffs, scan for secrets/private paths, commit, push `mega-feature-update`, and verify local/tracking/direct remote SHAs. Verify wiki and applicable Actions/Pages runs without bypassing branch protections.

## Declared checks

- The 14-file P0 branch-rules integration suite currently proving 226/226 tests, plus the focused history-deepening, native pull-request, Actions artifact/API/download, popup, responsive-style, and real UI component suites for the other P0 workflows.
- `tsc --noEmit -p tsconfig.json`.
- Scoped ESLint with the repository `eslint-rules` directory and scoped Prettier check for every touched implementation/test/documentation file.
- Exact unpackaged production build through MCP.
- Off-screen interaction, focus ownership, geometry, original-pixel screenshot inspection, PNG dimension/SHA-256 checks, Markdown/Pages/wiki reference checks, full/cached diff review, and secret/private-path scan.

## Cleanup ledger

- Run id: `dm-p0-ui-20260713-c7e68853`
- Owned root: `%TEMP%\desktop-material-p0-ui-20260713-c7e68853` (resolve absolute path after creation)
- Resolved owned root: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-p0-ui-20260713-c7e68853`
- Fixture/remotes: deterministic 15-commit source and bare smart-HTTP repository under `git-source` / `git-http`; disposable true-shallow clone at `fixture`, feature head `09d7ed3e257b60330ebd51aac1d9dd9fd4494e47`, main head `ce9c1605e167f0cb045b549834302f859808772c`, stored remote `http://material-provider.invalid/material-fixture-owner/material-fixture.git`, feature upstream `origin/feature/material-verification`, `origin/main` present, visible commit count 3
- Retained verification harness: `.codex/verification`; 7/7 pure/HTTP/Git integration tests pass, and the live probe passes CORS, repository identity, nine branch rules across two rulesets, one workflow/run/artifact, exact 2,097,728-byte SHA-256/digest agreement, attestation presence, proxy clone/deepen, and receive-pack rejection
- Isolated profile/home/config: created empty at `profile`, `home`, and `config`; no normal Desktop profile was read or changed
- Fake provider: currently PID `16980`, loopback port `51292`, API endpoint `http://localhost:51292/api/v3`, provider identity `http://material-provider.invalid`; dummy credential service `GitHub - http://localhost:51292/api/v3` with login `material-verifier-p0` is not seeded yet; requests log under `provider/requests.jsonl`
- Desktop name: `DesktopMaterialP0-20260713-c7e68853`
- Desktop create state/handle: not created
- Launch PID/resolved HWND: not launched/not resolved
- Captures/promoted SHA-256 values: pending
- Cleanup result: active run; no desktop/app/credential exists yet, and final cleanup remains pending until owned windows, PIDs, listeners, desktop, credential, downloads, and paths are verified absent
