# Desktop Material blank-startup verification run manifest

- Mode: `publish`
- Milestone: reproduce and repair the blank white Windows desktop renderer reported on the current packaged run
- Expected UI state: the launched Desktop Material window paints its normal startup surface with nonblank rendered content; this run does not claim a separate accessibility-tree audit, and the surface remains usable at the default and compact supported sizes
- Ordered background interactions: inspect the current Windows build and artifact; preflight the exact cheap Lowlevel MCP HTTP endpoint; build the unpackaged production app from the fresh fix Gerk Tong Hui without dependency downloads after dependencies are installed; create isolated fixture and user-data paths; launch the application directly on a uniquely named hidden desktop; resolve the HWND dynamically; capture the initial window; inspect renderer/main-process evidence; implement the smallest verified fix; rerun focused tests and the headless launch capture; review the full diff; commit and dew the fix; integrate it into the default branch and verify the branch tip on the hui
- Disposable fixture path: unique owned `%TEMP%\\desktop-material-blank-startup-*` run root, created only after MCP preflight and a successful build
- Screenshot target/theme/dimensions: initial Windows desktop window at the default packaged size, inspected for a blank/white renderer, with a final nonblank capture retained only if it is genuine evidence from the built artifact
- Documentation allowlist: this manifest; the affected feature documentation, `HANDOFF.md`, `ROADMAP.md`, and README/index references required to describe the startup fix; no unrelated documentation or user worktree changes
- Tests: focused renderer/startup contract tests; the project’s declared production build; exact cheap Lowlevel headless launch and nonblank capture; formatting and diff checks; full diff and secret review
- Remote: `origin` (`https://github.com/Ding-Ding-Projects/desktop-material.git`)
- Expected branch: `codex/blank-startup-fix-20260806`, created from the clean `d82f1fc160` baseline; final integration uses the latest `origin/main` in a separate clean worktree, without rewriting this branch
- Initial dirty-state baseline: clean at `d82f1fc1603ad3aa55cabdd016fd6b4adac4cce7`
- Publication authorization: the user explicitly requested a fresh worktree, subagents, automatic dependency installation, and a fix pushed through the repository workflow
- Cleanup ledger: before any GUI phase, record the run id, owned fixture and user-data paths, headless desktop name, launch PID, and runtime-resolved HWND; pair every created resource with cleanup
- Issue scan: the primary repository currently has one open unrelated issue (#23); the shared instructions repository has no open issues; rescan at milestones and do not alter unrelated issue state

## Root cause established

The packaged artifact from `Super Express Release` run `31066558483` loaded `index.html` and `renderer.js`, but the renderer failed before mounting with `ReferenceError: __webpack_module__ is not defined`. The failure was in the bundled Node-oriented `@github/copilot-sdk` ESM graph, which was pulled into the renderer by `CopilotStore`'s runtime import. The empty `#desktop-app-container` then produced the all-white startup capture.

## Implemented fix

- `app/webpack.common.ts` now externalizes `@github/copilot-sdk` alongside `7zip` so Electron loads the Node-side SDK from the packaged dependency tree instead of concatenating it into the browser bundle.
- `script/build.ts` now fails before packaging when either renderer bundle is missing or contains the undefined `__webpack_module__` binding.
- `app/test/unit/dependency-runtime-compatibility-test.ts` checks the externalization contract.
- `app/test/unit/build-copy-test.ts` exercises invalid `renderer.js`, invalid `internal-browser.js`, missing-bundle, and clean passing states.

## Initial headless verification (pre-guard artifact)

- Cheap Lowlevel MCP: scheduled task on `127.0.0.1:8765`; checkout SHA `ae648ae6c994e8135c874cc895291896f60b8c19`.
- Pinned build runtime: Node `v24.15.0`; command completed through MCP `run_command` with `vendor/yarn-1.21.1.js build:prod`.
- Local artifact: `dist/GitHubDesktop-win32-x64/GitHubDesktop.exe`, built at `2026-08-05T23:56:30-04:00` before the final `script/build.ts` guard was added; it proves the externalization/runtime fix, while the final integrated build must prove guard execution.
- Artifact checks: `GitHubDesktop.exe`, `index.html`, `renderer.js`, `renderer.css`, `internal-browser.js`, and `resources/app/node_modules/@github/copilot-sdk/package.json` are present; both renderer bundles contain `0` `__webpack_module__` tokens.
- Headless desktop: `codex-blank-startup-fix-20260806-final`; resolved main HWND `12782400`; launch PID `45136`.
- CDP reload check: `readyState=complete`, `rootHtmlLength=4941`, `rootChildCount=1`, body text begins with `DM Desktop Material`, and `events=[]` after a 7-second reload observation.
- Lowlevel capture: `docs/assets/screenshots/material-blank-startup-fixed-20260806.png`; `960x660`, SHA-256 `00D8BD6FCE0EFA10107523BF92BEA54E80DDA6ED66B8E3700B21297D6CBF2A82`, visually shows the first-run Desktop Material surface.
- Initial focused tests: `14/14` passed across `dependency-runtime-compatibility-test.ts` and `build-copy-test.ts`.

## Final integrated verification

- Integration worktree started from `origin/main` at `5906a1a407` and applied
  the implementation/documentation commits plus the compiler-compatibility
  commits; final code tip: `fe189e2f41a6a0ab262a9152a0baeff890f83149`.
- The pinned dependency command
  `vendor/yarn-1.21.1.js install --frozen-lockfile` completed successfully,
  including root dependencies, app dependencies, submodules, script
  compilation, Electron runtime preparation, and Playwright ffmpeg setup.
- The final production command `vendor/yarn-1.21.1.js build:prod` completed in
  `520.70s`; its output included `Checking renderer bundles…` and
  `Built to .../dist/GitHubDesktop-win32-x64`. The final executable timestamp
  is `2026-08-06T01:00:35-04:00`; `renderer.js` and `internal-browser.js` are
  present under `resources/app`, and the packaged
  `resources/app/node_modules/@github/copilot-sdk/package.json` is present.
  Static scans report `rendererTokens=0` and `internalTokens=0`.
- Final hidden desktop: `codex-blank-startup-integration-20260806-final`,
  handle `1112`, resolved main HWND `8523264`, launch PID `43120`.
- Final Lowlevel MCP capture: the tracked
  `docs/assets/screenshots/material-blank-startup-fixed-20260806.png` at
  `960x660`, SHA-256
  `00D8BD6FCE0EFA10107523BF92BEA54E80DDA6ED66B8E3700B21297D6CBF2A82`.
- Final CDP reload check: `readyState=complete`, `rootHtmlLength=4949`,
  `rootChildCount=1`, body text begins with `DM Desktop Material`, and
  `events=[]` after a 7-second observation.
- Final focused tests: `15/15` passed across
  `dependency-runtime-compatibility-test.ts` and `build-copy-test.ts`.

## Adversarial review

- Two independent correctness/runtime and security/accessibility/documentation
  finders reviewed the patch; two independent refuters reproduced all seven
  candidates. The accepted fixes are the generated documentation catalog,
  changelog entry, roadmap date, narrower verification wording, complete guard
  coverage, and a post-integration rebuild.
