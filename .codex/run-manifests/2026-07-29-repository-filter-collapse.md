# Repository surfaces and per-repository appearance manifest

- Mode: `publish`
- Milestone: Make the repository account, service, status, text-search, and
  regex controls one accessible collapsible block; add exact plus relative time
  to the History commit hover card; tighten the command-palette Appearance
  editor and add a stable random appearance mode per repository; replace the
  Publish repository organization select with a searchable listbox and the
  shared Regex Builder.
- Expected UI state: The Windows repository sheet opens with a compact
  `Filters` disclosure. Expanding it reveals the existing filters without
  resetting their values; collapsing it leaves the repository list and Add,
  Select, and More actions available without bilingual narrow-width overflow.
  A History commit card shows its exact date and localized relative age. The
  command-palette editor keeps controls beside their labels and can derive one
  deterministic layout for each active repository. Publish repository exposes
  personal and organization owners as a keyboard-operable listbox whose search
  is local, regex-capable, fail-open for invalid patterns, and reset safely when
  the account changes.
- Ordered background interactions: preflight the fixed Lowlevel MCP endpoint;
  run focused tests; build with the exact unpackaged production command; create
  a unique off-screen Win32 Headless Desktop; launch the built application with
  isolated user data and a disposable repository fixture; open the repository
  sheet; exercise collapse and expansion through background input; focus a
  History row and require the relative age; open the command palette, exercise
  random-per-repository mode, and check control alignment; capture all four
  original requested surfaces plus the Publish owner listbox; exercise a real
  submodule working tree and reject any spurious Cheap LFS path notice; close
  the app and destroy the headless desktop.
- Disposable fixture path: a unique directory below the operating-system
  temporary folder, recorded when created and removed after capture.
- Screenshot targets/theme/dimensions:
  `docs/assets/screenshots/material-repositories-sheet.png`,
  `docs/assets/screenshots/material-history-hover-time.png`, and
  `docs/assets/screenshots/material-command-palette-appearance.png`, plus
  `docs/assets/screenshots/material-publish-organization-picker.png`, which
  the already-accepted `publish-organization-picker` scene owns.
  Repository and History evidence use dark theme at 1440×960; the contained
  command-palette verifier uses light theme at 1000×687; the Publish
  organization picker uses dark bilingual mode at 1440×960.
- Documentation allowlist: `README.md`, `HANDOFF.md`, `ROADMAP.md`,
  `docs/features/repository-management/README.md`, the repository-management
  feature pages that own the filter controls, History card, and command-palette
  appearance; the Pages/wiki source that references the screenshots; the
  canonical GitHub wiki page; and this manifest.
- Tests: focused repository-list, History tooltip, command-palette appearance,
  and capture-contract tests; TypeScript; focused
  Prettier/ESLint/Markdown checks; `git diff --check`; exact Lowlevel MCP
  unpackaged production build; real off-screen Windows interaction and capture.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Initial baseline: `main` at
  `d50599d58b398122758f3b2e1dee01fe126e8d4f`, aligned with `origin/main`, with
  a clean worktree, one linked worktree, no non-default local branches, and no
  stashes.
- GitHub handoff: rolling progress continues in Discussion
  `https://github.com/Ding-Ding-Projects/desktop-material/discussions/98`.
  GitHub Projects are externally blocked because the active `gh` token lacks
  `read:project`; no Project state will be claimed.
