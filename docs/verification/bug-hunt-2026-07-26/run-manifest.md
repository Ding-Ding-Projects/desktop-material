# Bug-hunt publish run manifest

- Run ID: `bug-hunt-2026-07-26-019f9f87`
- Mode: `publish`
- Milestone: pull the latest `main`, continue the Desktop Material backlog,
  reproduce and repair actionable defects found by code, test, issue, and
  off-screen UI inspection, then publish the verified result.
- Expected UI state: the deterministic fixture opens in the normal Desktop
  Material workspace; every repaired visible surface renders without blank
  content, clipping, overlap, inaccessible controls, stale state, or blocking
  informational dialogs at the exercised viewport and theme.
- Background-only interaction order: preflight the fixed Lowlevel MCP HTTP
  server and scheduled task; fast-forward the clean default checkout; inventory
  issues and regressions; run focused static and automated probes; build the
  unpackaged production app through MCP; create an owned Git fixture and
  isolated profile; create one uniquely named Win32 headless desktop; launch the
  built Electron binary; dynamically resolve its HWND; reproduce and verify the
  selected repaired surface with HWND-targeted input; capture the accepted
  state; gracefully close the exact window and remove only owned temporary
  paths.
- Disposable MCP log root:
  `<system temporary folder>\desktop-material-bug-hunt-20260726-019f9f87`.
  It owns only the manual MCP server logs and an otherwise empty capture
  directory; it does not own the Git fixture or Electron profile.
- Disposable P0 UI harness root:
  `<system temporary folder>\desktop-material-p0-ui-bug-hunt-20260726-019f9f87`.
  The canonical provider/clone helpers own its `fixture`, `profile`,
  `captures`, and loopback-only fake provider; the bug-hunt state helper then
  removes branch tracking configuration while retaining the exact
  `origin/<branch>` ref, asserts the canonical clone is exactly one commit
  ahead, and leaves one deterministic changed Markdown file for diff
  inspection.
- Screenshot target: an accepted, nonblank client-only PNG at the surface's
  natural state, promoted only after review to the canonical tracked target
  `docs/assets/screenshots/regex-builder.png`;
  dark theme at `1280 x 800`, with a narrow-width capture when relevant.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`,
  `.codex/verification/prepare_bug_hunt_state.ps1`,
  `docs/verification/bug-hunt-2026-07-26/**`, `docs/verification/README.md`,
  the repaired feature's categorized documentation and category index,
  `docs/wiki/**`, Pages source under `docs/**`, and any genuinely relevant
  screenshot beneath `docs/assets/screenshots/`.
- Declared verification: repository and issue inventory; focused unit or
  integration regressions for each repair; lint and type checks; reproducible
  production unpackaged build; deterministic headless UI traversal;
  original-resolution screenshot inspection; documentation/link checks; full
  diff, credential-pattern, branch/worktree/stash, and remote-ancestry checks;
  GitHub issue, rolling Discussion, changelog Announcement, Actions, Pages,
  wiki, and Release receipts as supported by current permissions. GitHub
  Projects are deliberately skipped for this run at the user's direction.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Starting branch: `main`
- Expected integration branch: `main`
- Starting commit: `a6d5841b05ab4277e2573d1b37ce59e0feb2698b`
- Initial worktree state: clean, tracking `origin/main`, three commits behind
  and not ahead (`+0 -3`); no linked worktree and no stash were reported.
- Active GitHub account: `codingmachineedge`.

## Pulled baseline and findings

- `git pull --ff-only origin main` fast-forwarded the checkout to
  `78dc8d0bc5` before any source edit.
- Issue scan: six open issues and no open pull requests in Desktop Material;
  no open issues or pull requests in the Lowlevel MCP or agent-memory
  repositories. Issue #39 was the bounded actionable defect for this pass. The
  screenshot campaign (#23), submodule picker (#34), and Cheap LFS performance
  tranche (#35) remain open as separate enhancements; #22 still needs a genuine
  installed-app capture and #25 still needs its recorded product decision.
- Code/test inspection additionally found configured-upstream misrouting,
  sparse-package root and target-architecture defects, stale native output,
  renderer and Pages regex denial-of-service paths, diff-result amplification,
  silent filter-disable behavior, boundary-space mutation, and an unsafe legacy
  notification-rule migration path.
- Independent adversarial review found ten concrete defects in the combined
  first patch. Every finding was repaired before the final build; the reviewer
  found no additional defect in PE parsing, manifest mapping, native package
  layout, portal focus, or worker cancellation.
- A last UI/accessibility audit found that tester rows were incorrectly joined
  into one regex corpus, long errors were repeated through multiple live
  regions, and both tablists lacked roving keyboard focus. The final source
  preserves per-candidate anchors, shares one cross-row budget, exposes one
  concise linked error, keeps controlled panels mounted, and implements
  Left/Right/Up/Down/Home/End navigation.
- The continuation also repaired transferred-repository remote URLs before
  network work, suppressed prompt-capable hooks/signing/credential UI in
  scheduled Git and SSH work, hid only app-owned Cheap LFS storage releases by
  default, added bounded per-repository GitHub Packages/version browsing with
  verified GHCR file transfer, and added Actions artifact search. GitHub does
  not expose a supported cache-archive download API, so that cache control is
  explicitly unavailable instead of presenting a non-working download.
- The requested ignored-files-to-Cheap-LFS-submodule migration remains a
  documented design item rather than a partial destructive workflow. No file
  was moved: future work must keep every original byte at its original path and
  separate local staging from any provider upload, repository creation, or
  push.
- The first disposable-state attempt also caught a fixture contract mismatch:
  the canonical clone was already one commit ahead after submodule seeding.
  The helper now accepts only a proved zero-or-one-ahead clean baseline and
  produces exactly one-ahead state in either case. The failed owned root and
  provider were removed before a fresh fixture passed at `ahead 1 / behind 0`.

## Local verification complete; remote publication pending

- Canonical `yarn lint`: passed.
- Root TypeScript `--noEmit`: passed.
- Final distribution/Actions matrix: 39 passed, 0 failed; the GitHub Packages
  UI follow-up passed 2/2 and the Cheap LFS Releases visibility/responsive
  follow-up passed 39/39.
- Final Git/authentication/canonical-remote matrix: 130 passed, 0 failed.
- Changed renderer/unit/real-Git matrix: 179 passed, 0 failed.
- RE2 capture-work follow-up: 14 passed, 0 failed; the 500-group stress case
  completed in about 100 ms after the compositional budget.
- Static Pages worker/controller: 9 passed, 0 failed, including hard worker
  termination and a 200-capture structured-clone amplification case.
- Final safe-regex, tester, localization, and keyboard follow-up: 51 passed, 0
  failed. The gallery source contract passed 48/48 after repairing two stale
  inherited assertions alongside the stronger adversarial/clipping scene.
- The exact Electron 42.0.1 Windows x64 archive was restored from the local
  cache only after its SHA-256 matched the package checksum; no dependency was
  downloaded for the UI run.
- Script gate before catalog regeneration: 83 passed; the sole failing
  assertion correctly identified this run's two new verification pages as
  missing from the generated catalog. After regeneration, final
  `yarn test:script` passed 84/84 across twelve files. Real x64 DLL activation,
  stale-output removal, ARM64 cross-compilation, and the documentation catalog
  all passed.
- Preliminary MCP-routed production build: passed in 1,499 seconds. It is a
  diagnostic receipt only because adversarial fixes landed afterwards; the
  final-tree build receipt supersedes it below.
- Final cross-feature regression selection: 104 passed, 0 failed across seven
  files, covering Packages UI/file transfer, Cheap LFS visibility, canonical
  remote repair, scheduled commit hooks, and unattended pull authentication.
- Final exact Lowlevel-MCP-routed production build:
  `RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` passed
  in 287.9 seconds from the final source tree. The Windows x64 Electron client,
  shell extension, and pinned ORAS helper were produced beneath `out`.
- A fresh owned fixture and Electron profile launched the final build on
  `DesktopMaterialBugHuntFinal-019f9f87`. The initial client-only capture proved
  the exact one-ahead/no-configured-upstream state rendered **Push origin**,
  not **Publish branch**. Its promoted evidence is
  `issue-39-push-origin.png`, SHA-256
  `568C2B927F555586CDBFA62BD1AC79B6E4A7C8B7CC17D4F98178CCF6441D4AC6`.
- The deterministic `seed,regex-builder` dark-English scene passed at
  `1280 x 800`; the safe-RE2 adversarial near miss completed in 16 ms. The
  original-resolution accepted image is the immutable
  [`regex-builder.png` blob at `f8eca3ac844e8eaec2dc2dce635f57874b4e92bc`](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/f8eca3ac844e8eaec2dc2dce635f57874b4e92bc/docs/assets/screenshots/regex-builder.png),
  SHA-256
  `BEFBFA90491120195884F7424AAB551B81CB3174068077E466A8020C335A28B1`.
  The mutable `main` pathname is not the authority for this dated hash.
- The exact app process exited, the disposable provider credential was deleted
  and proved absent, the provider stopped, the headless desktop closed, and
  both owned P0 fixture roots were removed. Remote Actions, Pages, wiki,
  Discussion, issue, and release receipts remain publication work and are not
  claimed by this local section.
