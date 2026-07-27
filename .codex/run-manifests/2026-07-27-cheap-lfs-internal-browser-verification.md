# Cheap LFS + app-hosted browser headless verification

- Mode: `headless-win32`
- Milestones:
  1. Cheap LFS restore starts the next file or part at the exact 90% download
     boundary while one shared coordinator limits the batch to two network
     transfers.
  2. Restore progress exposes current and prefetch lanes, logical and physical
     bytes, file/part counters, provider, phase, rate, ETA, elapsed time, queue,
     bounded failures, and cancellation.
  3. HTTP(S) links and popup redirects can open in the tabbed app-hosted
     browser; its chrome provides URL entry, Go, tabs, new tab, navigation,
     refresh/stop, bookmarks, and an external-browser action. Authentication
     tabs always expose the external-browser escape hatch and are never
     persisted or bookmarkable.
- Source baseline: `821ab93d57` from `origin/main`, after the user-requested
  `git pull --ff-only`.
- Worktree: `%USERPROFILE%\Documents\GitHub\desktop-material-cheap-lfs-restore`
  on `codex/cheap-lfs-restore-lookahead`.
- Initial state: clean baseline before task edits; the original checkout later
  moved independently to `codex/linux-tui-clone`, so all task changes remain
  isolated here.
- Build target: Windows x64 development/production bundles as supported by the
  repository, launched only through the exact Lowlevel MCP streamable-HTTP
  client.
- Ordered interactions:
  1. run focused unit, TypeScript, lint, format, Sass, and production compile
     checks;
  2. create an off-screen Win32 Headless Desktop;
  3. launch the built app on that desktop;
  4. open a deterministic local HTTP fixture through the centralized link
     router;
  5. exercise URL navigation, new tab, tab switching, refresh, bookmarks,
     popup/redirect capture, the global internal/system setting, and the
     authentication external-browser action;
  6. render a deterministic Cheap LFS restore-progress fixture with both lanes
     and inspect English, Cantonese, bilingual, narrow-width, keyboard-focus,
     reduced-motion, and high-scale behavior where the harness permits;
  7. capture original-resolution screenshots and destroy every fixture,
     process, and headless desktop created by this run.
- Disposable fixtures: loopback-only HTTP pages containing a same-tab redirect,
  a `window.open` popup, a stable title, and no credentials; deterministic
  in-memory restore state. No user repository or account is mutated.
- Screenshot targets:
  - app-hosted browser at 1160×780 in English;
  - authentication notice with external-browser action;
  - detailed two-lane Cheap LFS restore at 1440×960;
  - one narrow or scaled bilingual frame proving no clipping.
- Artifact destination:
  `docs/assets/screenshots/` for accepted, privacy-inspected frames, with a
  dated receipt under `docs/verification/`.
- Privacy: no account cookies, OAuth codes, signed URLs, tokens, user paths, or
  personal browser content may appear in captures or logs.
- Remote: `origin`
  (`https://github.com/Ding-Ding-Projects/desktop-material.git`).
- Completion owner: root agent; it owns cleanup, documentation receipts,
  default-branch integration, push, CI links, wiki/Pages synchronization, and
  GitHub Discussion/Announcement updates.

## Final local acceptance

- Combined source regression: **652 passed, 0 failed** across **53** discovered
  test files.
- Attach-only verifier contracts: **14 passed, 0 failed**.
- Full TypeScript no-emit check: passed.
- Exact Lowlevel MCP Windows build:
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod`; result `returncode: 0`,
  `timed_out: false`, `client_ok: true`, empty stderr. The build emitted the
  normal application plus `internal-browser.html`, `internal-browser.js`, and
  `internal-browser.css`.
- Headless desktop: `DesktopMaterialLfsBrowser019fa50e`; owned launch PID
  `41344`; loopback CDP port `58216`. The browser and main windows were closed,
  the process exited, the desktop handle was released, and the CDP port was
  verified closed.
- Restore receipts:
  - wide English: 1440×960, current lane exactly 90%, next lane 10%, SHA-256
    `001e9d09e95cf81c981f4b97a33c2aab958a93fce8eca064a8d0cea9df1e3a96`;
  - narrow bilingual: 640×960 with vertical lane reflow and every strict
    clipping/accessibility/privacy assertion true, SHA-256
    `7085fcd151937c3fe770ed3b609cb0fa4e37653c6b48b8292eab062db8d9eecd`.
- App-hosted browser receipt: same-tab redirect stayed internal, popup became a
  sandboxed tab, New Tab opened, the saved bookmark excluded query/fragment,
  and the private authentication tab exposed both external-browser actions
  without becoming bookmarkable. No external action was invoked.
- Privacy-inspected promoted captures:
  - `cheap-lfs-restore-lookahead.png` —
    `001e9d09e95cf81c981f4b97a33c2aab958a93fce8eca064a8d0cea9df1e3a96`;
  - `app-hosted-browser-authentication.png` —
    `257960b35797e2f7e5f2a8e442c353e656d98af5ef4a088fe30113b641293f69`;
  - `private-repository-lock-badge.png` —
    `7cf7e27565bceb3d584c24752c2e066b29abdbcafe066b25250fa65d3284de9a`.
- The private-repository capture used only a deterministic app-native state
  hook against the disposable repository and rendered privacy from exact
  `isPrivate === true` metadata. No network inference or real account was used.
- Remote merge, push, CI, wiki, Pages, and release receipts remain pending at
  this local-acceptance checkpoint.
