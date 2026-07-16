# Function screenshot catalog gate

- Mode: `publish`
- Milestone: expand the wiki into a function-by-function visual catalog. Every
  user-facing named function documented in the wiki inventory must have its own
  uniquely targeted screenshot and caption. A shared screenshot may remain in
  overview pages, but it does not satisfy two function rows in the catalog.
  Background-only services are represented by their user-visible settings,
  progress, result, or recovery surface.
- Run id: `function-screenshot-catalog-20260716-01`
- Expected branch/remote: canonical `main` -> `origin/main`, fast-forward only;
  separate wiki `master` -> its existing remote. The standing instruction to
  always push authorizes both publications.
- Initial foreign-work rule: preserve the unrelated untracked OAuth-scope run
  manifest byte-for-byte and do not touch the detached foreign release
  worktree.
- Owned temporary root:
  `%TEMP%\desktop-material-function-catalog-20260716-01`
- Headless desktop: `DesktopMaterialFunctionCatalog2026071601`
- Inventory: derive all user-facing functions from navigation registrations,
  menus, repository settings, dialogs, README capabilities, and the current
  wiki. Compare that inventory with tracked screenshots and create a stable
  function-to-asset matrix with one unique PNG target per function.
- Build gate: exact unpackaged production build through
  `http://127.0.0.1:8765/mcp` using `npx --no-install cross-env
  RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`; do not
  download dependencies.
- Fixture/profile: deterministic synthetic repositories, branches, commits,
  changes, stashes, remotes, submodules, worktrees, accounts, and bounded
  provider responses under the owned Temp root, plus an isolated Electron
  user-data directory.
- Capture target: light Material theme, normally 1440x960 client captures with
  compact variants where the function is specifically responsive. Every PNG
  must be nonblank, unclipped, privacy-safe, visually inspected at original
  resolution, and captured through the exact hidden-desktop MCP path.
- Ordered work: inventory and map functions; preflight MCP; build; create one
  fixture/profile and one hidden desktop; launch exact build; exercise each
  uncovered function with HWND-targeted input or a documented renderer-native
  fallback; capture and inspect; promote accepted assets; update wiki catalog,
  user guide, Home summary, and `HANDOFF.md`; clean exact owned resources;
  verify, commit, and push main and wiki without force.
- Documentation allowlist: this manifest, bounded verification helpers under
  `.codex/verification/`, `docs/assets/screenshots/`, `docs/wiki/`,
  `HANDOFF.md`, and minimal README/Pages index changes only when needed to link
  the complete wiki catalog.
- Tests: function inventory has no duplicate screenshot assignment and no
  missing function/asset; all Markdown/raw-main image references resolve;
  screenshot dimensions/hash/privacy checks; focused wiki/Pages contracts;
  TypeScript/lint/format/diff/secret checks; exact production build; public
  main/wiki image and workflow verification after push.
- Cleanup ledger: record owned Temp paths, desktop create result, exact launch
  PID/HWND, loopback ports, capture hashes, graceful close/fallback, zero-window
  poll, desktop close, and final absence checks.

## Completion receipt

- Inventory result: 55 current, user-facing visual functions or states. The
  gallery table and rendered Markdown image body each contain the same 55
  unique assets. Core History and Agent access were the two valid tracked
  images missing from the old 53-row catalog.
- Legacy cleanup: removed eight unreferenced obsolete/clipped captures:
  `07-clone.png`, `material-empty-state.png`,
  `material-multi-account-settings.png`, `material-post-merge-welcome.png`,
  `settings-accounts-dark.png`, `tab-text-style.png`,
  `workspace-changes-light.png`, and `workspace-dark.png`.
- MCP preflight: `startup_status.ok=true`; scheduled task executable and
  arguments matched the fixed checkout/port; checkout SHA
  `806d9ba85e4afbc2af58d7499496babfa7c68891`.
- Build: the service PATH initially lacked Yarn. The successful rerun used a
  temporary owned shim around the locally cached Yarn Classic package with
  offline mode enforced. The exact required build returned `ok=true`, code 0,
  `timed_out=false`, and `client_ok=true`, producing `out` without downloads.
- Hidden UI: desktop `DesktopMaterialFunctionCatalog2026071601`, create handle
  `972`, launch PID `7624`, resolved HWND `4392554`, and CDP port `9347`.
  Native client capture was 960×660; the renderer reported 1000×687, equal
  document/body client and scroll widths, named controls, and no horizontal
  clipping for first-run and Configure Git states. Hidden HWND resize was not
  available.
- Pixel decision: one post-CDP PrintWindow frame retained stale compositor
  regions. It was rejected during original-resolution inspection; no capture
  from this run was promoted or represented as current evidence.
- Catalog contract: focused wiki and Pages tests pass with every tracked PNG
  assigned once, every row rendered once, all assets present, and Home/User
  Guide links present.
- Cleanup: exact PID `7624` and port `9347` are absent; the named desktop no
  longer exists; the containment-checked owned Temp root, fixture, profile,
  shim, and captures were removed and read back absent. The foreign OAuth
  manifest remains byte-identical at SHA-256
  `01685d027056cc887455215075bf6ef8234283cef1385bcac6bb2971abb88fc3`.
