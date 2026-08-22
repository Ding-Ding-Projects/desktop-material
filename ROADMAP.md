# Desktop Material roadmap

## August 22 — shared Material control conformance sweep

- [x] Sweep every renderer surface for raw `button`/`input`/`select`/`textarea`
  elements bypassing the shared layer; convert them to the shared Material
  primitives with every prop, handler and aria attribute preserved.
- [x] Convert the lock-creation menu items, seven-zip export selects, Jira
  deployment select, bulk-actions cancel button, notification/banner/changelog
  buttons, clone filter chips and checkboxes to the shared components.
- [x] Give the shared Button an `ariaKeyshortcuts` prop so menu items keep
  announcing their keyboard shortcuts after conversion.
- [x] Add cascade-safe padding/hover overrides for the tab-style toggle squares
  so shared-button chrome cannot collapse them or repaint the selected state.
- [x] Keep the sha-hint Copy button on its deliberate inverse-surface styling;
  its conversion was a false positive and is reverted.
- [x] Prove it: strict typecheck clean, focused suites green (two failures
  proven identical at HEAD before the change), and built-artifact captures of
  the fixed lock-creation menu, sound settings selects and changelog viewer
  through the repository capture harness.

## August 21 — credential wait ladder

- [x] Mount the bounded wait-recovery ladder in the existing anchored
  password/OTP lock prompt only while that prompt has a real retry wait.
- [x] Keep challenge answers and mole receipt times in the main process, with
  expiring single-use nonces, the three-per-hour wait-skip cap, and School-mode
  start-at-sums semantics.
- [x] Clear only the lock retry deadline after a correct ladder result; retain
  the consecutive-failure count and require the ordinary credential step.
- [x] Add focused model/service and credential-ledger tests (5/5 passing).
- [ ] Capture the mounted flow from the packaged Windows artifact through the
  approved cheap headless route.

## August 21 — current frozen-renderer capture ledger

- [x] Replace the retired-shell derivation with 26 current source-mapped rows.
- [x] Register high-risk toy-lock, School, narrator, attention, Support,
  authenticator-history, and publishing-recovery states without fabricating
  captures.
- [ ] Produce real packaged Windows captures through the approved cheap route.

## August 21 — browser-extension download handoff foundation

- [x] Define strict native-messaging parsing and an explicit unavailable state
  until a packaged extension and native host exist.
- [x] Add styled Start, Downloading, completion, canceled, failed, and
  unavailable states in existing surfaces.
- [x] Add a checked-in Manifest V3 link-action extension, bounded native frame
  codec, exact-origin host-manifest builder, and fixed per-user Chrome/Edge
  registration argv.
- [ ] Package/register the extension and host, then collect real interaction
  and capture evidence.

## August 21 — Ollama suite foundations

- [x] Add bounded queue-document normalization, restart reconciliation, and an explicit maximum worker count above the existing pull primitive.
- [x] Persist per-chat bounded system prompts and generation controls; send them only to the selected loopback model, gate attachments on declared vision capability, and provide redacted copy export plus retry-last-prompt.
- [x] Add explicit recovery-state and allowlisted harness-profile foundations without inventing an unsupported remote catalog, hardware verdict, or shell launcher.
- [x] Add the owned persistent queue runner with serialized transition persistence, bounded ids/model names, and live-inventory reconciliation for completed tags.
- [ ] Add the official exhaustive catalog source, conservative hardware-fit evidence, full harness preflight/snapshot/rollback UI, localization catalog entries, and built-artifact proof.
- [ ] Run focused tests, type checks, built-artifact interactions, and captures; this ultra-speed lane intentionally ran none.

## August 21 — local file-converter foundation

- [x] Define the Windows desktop converter's local-only source-preservation,
  bundled-adapter, output-validation, and honest queue-status contract in the
  categorized feature documentation.
- [x] Add typed English and Cantonese resource keys for source selection,
  adapter catalog, target selection, loss disclosure, local-only privacy,
  queue outcomes, progress, and status.
- [x] Add the Repository Tools converter workspace with its eight-category
  registry, local byte-signature inspection, persisted queue controls, and
  future adapter storage-preflight/atomic-output foundation.
- [ ] Package and prove offline adapters, wire paged durable queue execution,
  destination selection, overwrite confirmation, settings/palette/search
  routes, and generated offline documentation bundle.
- [ ] Run focused converter tests, type checks, built-artifact interaction, and
  capture evidence; the ultra-speed converter lane intentionally ran none of
  these checks.

## August 21 — Support Tickets and authenticator history

- [x] Wire the existing About/Help surface to the local Support Tickets desk.
- [x] Expose redacted `AuthenticatorStore` history through the existing styled
  history route and reconcile restored metadata against the credential vault.
- [ ] Run focused wiring tests and collect built-artifact interaction/capture
  evidence; the ultra-speed lane intentionally deferred them.

## August 21 — School mode live propagation

- [x] Propagate the shared mode event to the main shell, Settings,
  scheduled-settings editor, and internal browser.
- [x] Hide language, playfulness, personal-vocabulary, and scheduled-language
  capability references while active, while retaining saved values and the
  renamed unlock route.
- [ ] Run focused tests and collect built-artifact interaction/capture evidence;
  the ultra-speed implementation lane intentionally deferred them.

## August 21 — attention accommodations

- [x] Implement five independently toggleable, off-by-default modes: Focus,
  Low stimulation, Time awareness, One thing at a time, and Momentum.
- [x] Add persisted settings, search and palette routing, accessible runtime
  status, bounded next-action state, and a respected inactivity defer path.
- [ ] Run focused tests, type checks, built-artifact interactions, and captures;
  the ultra-speed implementation lane intentionally deferred them.

## August 21 — appearance-lock/authenticator runtime join

- [x] Wire the renderer startup authenticator document cache to the existing
  OTP lock verifier and keep all secret reads inside the credential-vault
  boundary, including metadata-only updates from the settings-owned store.
- [x] Route appearance-value lock creation through the shared password-or-OTP
  setup dialog, including duration and lock-on-launch persistence.
- [x] Enforce appearance locks at every activation boundary: pointer,
  keyboard, direct callbacks, context-menu actions, palette/search teleports,
  and programmatic tab selection. Locked targets expose `aria-disabled` and
  remain disabled until their own credential is verified.
- [ ] Run focused tests and collect built-artifact interaction/capture evidence;
  the ultra-speed implementation lane intentionally deferred them.

## August 21 — root Windows dependency preparation

- [x] Add a root `download-dependencies.bat` entrypoint with silent and
  idempotent preparation semantics.
- [x] Record pinned Node.js archive URLs and SHA-256 digests, vendored Yarn,
  Visual Studio workload requirements, and frozen package-install arguments in
  `script/windows-dependency-manifest.json`.
- [x] Route `build.bat` and `build-installer.bat` through the shared preparation
  path before their existing build or installer work.
- [x] Preflight interactive administrator elevation once, while keeping `/s`,
  `--silent`, and `SILENT=1` prompt-free and process-scoped.
- [x] Require fresh, non-empty installer artifacts, verify the Squirrel manifest,
  and report unsigned setup/MSI receipts with size, SHA-256, and source commit.
- [ ] Run cold-cache and warm-cache preparation, builds, installer packaging,
  and artifact captures; this implementation lane intentionally did not run
  those checks or perform downloads.

## August 21 — narrator voice controls restored

- [ ] Restore the Sound pane's two runtime voice pickers (English and
  Cantonese), with **Choose automatically** as the empty persisted choice,
  stable `voiceURI` persistence, and honest local/network/missing/no-voice
  status copy.
- [ ] Expose the persisted 0.5–2.0 speaking-rate and 0.0–2.0 pitch controls,
  with bounded values and localized labels.
- [ ] Keep the settings-search and command-palette routes aimed at the live
  narrator control group, and refresh the picker after `voiceschanged` while
  unsubscribing on unmount.
- [ ] Run the focused tests, lint, type checks, built-artifact interaction,
  capture, and review gates during the integration pass; this implementation
  lane intentionally ran none of them.

## August 21 — universal-feature completeness registration

- [ ] Harden the MD3 menu overlay: route menu and shared search-field regex
  diagnostics through the bounded RE2 adapter, derive `aria-keyshortcuts` from
  the rendered item hint, and wrap long bilingual labels within the existing
  overlay bounds. Implementation is present; tests, reviews, builds, and
  captures remain intentionally deferred in the ultra-speed lane.
- [x] Document the hand-written feature-by-surface inventory contract and its
  independent evidence fields.
- [x] Register all 62 canonical universal-feature identifiers in an explicit
  seven-dimension evidence manifest, with per-row present, pending, or blocked
  records and reasons for every unverified dimension.
- [x] Separate manifest/inventory validity from the completion verdict, check
  claimed-present paths, and exercise content-aware row and dimension mutations
  in the focused contract source.
- [ ] Run the deferred tests, reviews, audits, built-artifact interactions, and
  captures needed to verify each registered feature. The August 21 ultra-speed
  pass intentionally skipped those activities, so the manifest's completion
  Chut remains red until a later evidence pass closes every required record.
- [ ] Verify changelog Markdown and plain-text exports preserve each recorded
  full commit SHA and its forge URL, and explicitly report entries with no
  recorded commit. The implementation and focused assertions are present in
  `app/src/lib/changelog/changelog-export.ts` and
  `app/test/unit/changelog-viewer-test.ts`; the ultra-speed pass did not run
  the assertions.

## August 21 — publish account and owner recovery

- [x] Keep the selected GitHub.com account in the Publish repository dialog's
  tab state and use that identity for organization lookup and publication.
- [x] Preserve the personal-account destination when organization discovery
  fails, with localized non-blocking status and an explicit retry action.
- [x] Offer scoped GitHub.com re-authentication for a classified `401` publish
  failure without automatically repeating repository creation.
- [ ] Run the focused publish tests and built-artifact interaction after the
  ultra-speed implementation pass; this lane intentionally did not run them.

## August 20 — automated merge-all cleanup

- [x] Move a clean default-branch checkout from another worktree automatically
  instead of failing the entire merge-all operation.
- [x] Add the explicit **Force Mat Day** option, with checkpoint, synchronization,
  and publication of recoverable dirty worktrees before merge and cleanup.
- [x] Retain locked, divergent, unpublished, stale, or otherwise unproved work;
  no forced push or forced worktree removal is introduced.
- [x] Cover candidate exclusion and dialog option dispatch with focused tests
  (4/4 passing).
- [ ] Capture the updated dialog from the packaged Windows application after
  integration; source and jsdom evidence do not substitute for that artifact.

## Personal vocabulary schema and dynamic entries — August 20, 2026

- [x] Restore the canonical `schemaVersion`/`entries` upload contract while preserving legacy local-cache reads.
- [x] Prove more than the former 46-entry payload is accepted and fully applied from dynamic file data.
- [x] Render the chooser and clear actions through the shared Material `Button` primitive while retaining the semantic local file input and responsive narrow/high-scale layout.
- [x] Capture no-file, loaded, and cleared states from the real unpackaged Windows build at commit `9e388ba21523db559199d4d0b90ed530b8331b4c`; focused control coverage is 14/14.

Updated: **August 13, 2026**

## Current repository snapshot — August 13, 2026

- `origin/main` is `96c25861dba76055e3063544e7f22036751916ea`.
- The GitHub issue tracker has one open issue: [#190 — Reconcile current roadmap and release receipts](https://github.com/Ding-Ding-Projects/desktop-material/issues/190).
- The latest published release is
  [`v4.0.118401`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.118401),
  published at `2026-08-13T20:48:00Z` for that same commit, with six downloadable
  assets.
- For that commit, [CI Linux run 31742643323](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31742643323)
  completed successfully and [CI Windows run 31742643430](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31742643430)
  was still in progress when this snapshot was recorded.
- This is a status reconciliation, not new CI, installer, test, or capture
  evidence. Each dated entry below retains the evidence boundary that existed
  at its own checkpoint; words such as *open*, *pending*, and *not claimed* do
  not describe the current issue tracker or release state.

## August 11 — the Material Design 3 shell is the application chrome

- `Md3Shell` (`app/src/ui/md3/md3-shell.tsx`) is what `App.renderApp()` renders:
  the 56px application header, the repository tab strip band, the navigation
  drawer beside a 16px `surface-container-low` pane, the pane header, the active
  destination, and the menu, regex-builder and compose overlays with the toast
  host. Commit `5aa2b582c23de7256dbed0b860b79934f618272e`.
- The state is one exported shape driven by one exported pure reducer, so a
  screenshot harness can put the shell into any state with no application behind
  it. All eleven contract search fields are present and independent — each keeps
  its own query and its own regex mode, and applying a built pattern arms only
  the field that opened the builder.
- **Nothing was removed.** The repository tab strip is unchanged and shown by
  default; the classic toolbar is kept behind **Settings → Appearance → Show the
  classic toolbar**, which also ships on. Every destination still renders the
  real repository workspace and build runner, so every capability remains where
  it was. `app/src/ui/md3/md3-shell-carryover.ts` catalogues the forty-four
  capabilities the design contract never drew, each with the menu it will live
  in, and names any left without an action rather than rendering a dead row.
- The preceding rewrite commits are
  `0f48c44ad05233bf50a58db2e966f7924278b07b` (a 158-ligature icon subset),
  `8040e92f1e5b0f44d313f977da78becfa71f80a5` (the design source),
  `e45d54d0e18891f91c3af655e2928ded8b9bcec7` (the extracted contract),
  `51ed516b8b25a3316ac0928de226149d3c32d67e` (the frozen feature ledger),
  `4f587f092616776c8763461f7818b08c6d5678b0` (chrome and overlays),
  `72867cf170119313f91386719bec5f90157ae949` (drawer and token corrections),
  `c663645db8115329157385c604bb86248d52b29d` (conformance),
  `ab23749689d164df33e0adee375410bfdccc0f37` (capture coverage) and
  `ed0749fc1604fd0cff4a21d1b6a65927e96a9cef` (eight destinations plus six
  missing universal features).
- Verification actually run: `npx tsc --noEmit -p tsconfig.json` clean at the
  shell commit; ESLint with the repository rules and Prettier clean on every
  touched file; the feature-preservation ledger, the design-contract conformance
  suite, the i18n catalogs, the command-palette catalog, settings search and
  palette settings coverage all pass.
- **At the August 11 shell checkpoint, not claimed:** no installer was built,
  no remote CI run was observed, no release was published, and no hidden-desktop
  capture of this shell existed yet.
  The screenshot gallery still photographs the pre-rewrite chrome; the capture
  coverage contract landed in `ab2374968` enumerates what has to be replaced.

## August 9 — evidence-bound self-hosted runner risk confirmation

- The Windows self-hosted-runner form now limits custom labels to 20 and
  audits the complete `self-hosted`, custom, operating-system, and architecture
  label set before any managed runner file or registration exists.
- A completed unsafe workflow or queued-job preflight can be intentionally
  reviewed in the form, but the renderer cannot authorize it. The main process
  reruns the check, shows a Windows-owned confirmation, and keeps a volatile
  receipt only for matching scope and evidence during that setup operation.
- The receipt is cleared after a safe recheck, never reaches disk, and is never
  reused by Start or the scheduled trust monitor; unknown or incomplete
  evidence remains blocking.
- Focused verification passes **94/94**, and the root TypeScript check passes.
  The complete desktop suite reports **1,008/1,008** files and **8,494** tests
  with no failures or React unmounted-state-update warnings. The pinned Node
  24.15.0 production build produced
  `dist/GitHubDesktop-win32-x64/GitHubDesktop.exe`; it is unpackaged local
  build evidence, not a Squirrel installer. Installer verification, remote CI,
  tag, and release evidence remain pending at the stop-and-handoff boundary.

## August 9 — School mode and command shortcut completion

- School mode is now reachable from Settings → Appearance, can use a custom
  display name, and unlocks through a local salted credential digest.
- While active, the app forces English, hides language/playfulness controls and
  their palette/settings-search routes, hides scheduled language selection, and
  suppresses the dim-sum surprise.
- The command palette was recorded here as **Ctrl+Shift+P**. That was
  superseded: the collision with the file browser was resolved in favour of the
  palette, so the application menu registers **Ctrl+Shift+F** for
  `command-palette`, and the MD3 header chip prints whatever that item declares.
- Focused verification passes **50/50** plus source lint. Hidden-desktop capture
  remains blocked by the Lowlevel MCP Git preflight, so no capture is claimed.

## August 8 — Windows-only CI release gate and uncapped workflow jobs

- Standard CI no longer runs the Linux TUI. The Linux workflow retains only
  platform-neutral lint and supply-chain checks, while the Windows workflow
  owns the desktop build, tests, packaging, and packaged E2E validation.
- Automatic and manual combined release workflows now publish the Windows
  desktop payload only. The separate manual TUI workflow and historical source
  records remain available without gating the Windows release.
- Explicit `timeout-minutes: 60` caps were removed from the desktop CI,
  installer, and Windows emergency-release workflow definitions. Remote runtime
  and release status remain pending until the new `main` run reports them.
- Local workflow contract verification passes **31/31**.

## August 8 — repair GitHub auth and Actions runner surfaces

- GitHub OAuth now follows the upstream Desktop authorization and token
  exchange shape by omitting the unregistered custom `redirect_uri`.
- The Windows self-hosted runner manager uses the rich searchable account
  picker, preserves the repository's selected account, and audits public
  repositories instead of blanket-blocking them. Unknown visibility and
  workflows that can receive untrusted events remain fail-closed.
- The Actions run list fills the available row while its detail pane is closed,
  and release notes are isolated in their own collapsible section rather than
  repeating inside release details.
- Focused local verification is **130/130**; remote CI and release evidence
  remain pending until the integrated commit is observed on `main`.

## August 7 — hardened self-hosted runner manager

- The Windows Actions view now binds self-hosted runner setup to one exact
  account, private repository, and proposed label set. Setup and every later
  start require private-fork pull-request workflows to be disabled, one
  immutable default-branch workflow audit to pass, and two complete stable
  pending-job snapshots to contain no job that can claim the runner.
- Registration tokens remain in main-process memory and outside command-line
  arguments, existing registrations are never replaced, official runner
  packages are digest-verified, and readiness requires the exact new runner and
  label set to appear online. Exclusive operation leases, owned process-tree
  termination, lifecycle journaling, interrupted-operation reconciliation, and
  stable remote-absence checks keep cancellation, shutdown, recovery, and
  removal fail-closed.
- Native Windows setup and control are implemented. Linux-in-WSL management
  remains deliberately disabled until in-distribution process-group
  cancellation can be proved; a WSL distribution is not treated as isolation
  from Windows files or network access.
- Focused local verification passes **48/48**: **38/38** main-process contracts
  and **10/10** manager UI contracts. The broader Windows suite, exact
  production build, hidden-desktop runtime exercise, live runner registration,
  and remote CI verdict remain pending.
- Behaviour, configuration, failure recovery, security boundaries,
  accessibility, and verification are documented in
  `docs/features/integrations/self-hosted-runner-manager.md`.

## August 7 — opt-in post-clone runner provisioning

- A single interactive clone of a private GitHub/GitHub Enterprise repository
  can opt in to create a repository-scoped Windows or dedicated WSL/Linux
  Actions runner after the clone is registered.
- The option defaults off, demands explicit workflow-author trust, is excluded
  from public, batch, and automatic clone paths, and preserves a successful
  clone when runner provisioning needs recovery.
- Focused source and option tests cover the intent and safety boundary. A live
  runner setup remains pending an authorized private repository and host.

## August 6 — Windows renderer startup bundle safety

- The Node-oriented `@github/copilot-sdk` now stays outside the browser
  renderer bundle and is installed as a packaged external dependency.
- `script/build.ts` rejects a missing renderer bundle or an emitted
  `__webpack_module__` binding before packaging, with focused regression
  coverage for both failure and success paths.
- The exact Windows artifact launches on the hidden desktop and paints the
  first-run Desktop Material surface. The CDP reload check reports one
  populated `#desktop-app-container` child, no startup exceptions, and both
  renderer bundles contain zero `__webpack_module__` tokens.
- Details and failure modes are documented in
  `docs/features/quality-and-reliability/renderer-startup-bundle-safety.md`.

## August 5 — self-hosted Windows dependency bootstrap

- The Windows self-hosted setup selects the requested Node.js version before
  creating the repository-pinned Yarn launcher, then exposes both a Windows
  `yarn.cmd` launcher and a POSIX `yarn` launcher to later actions.
- The Git Bash preflight converts the temporary launcher directory to an MSYS
  path, marks the POSIX launcher executable, verifies that bare `yarn` resolves
  to that exact path, and only then allows cache probing and dependency
  installation to run.
- Focused CI tests pass **2/2**, the frozen local dependency install passes,
  and the Unicode/space-path PowerShell plus Git Bash probe passes. Remote
  Super Express verification remains required after publication.

## August 5 — multi-remote fetch sync

- The ordinary repository Fetch action now fetches every configured remote when
  a checkout has more than one, while preserving the existing focused
  `Fetch <remote>` behavior for one-remote checkouts. Current/default/upstream
  remotes remain first in the deterministic sequence, followed by any other
  configured remotes.
- The toolbar and dropdown now say **Fetch all remotes** and explain the wider
  scope in the status description. Remote configuration and the existing
  account-aware fetch path are unchanged.
- Focused verification passes **19/19** tests across the GitStore selection
  and toolbar surfaces. The exact Windows production build completed with
  packaging skipped, and the real hidden-desktop renderer displayed **Fetch
  all remotes** plus its expanded scope description for a two-remote fixture. The
  unmodified development renderer still logs its existing
  `__webpack_module__ is not defined` startup error, so the visual probe used
  a temporary CDP startup shim and does not claim packaged-release proof.

## August 5 — account-aware repository transfer

- The Windows desktop app now exposes **Transfer repository** from the
  Repository menu, repository-list context menu, Command Palette, and Remote
  Manager. The workflow can use an existing signed-in GitHub identity or open
  the normal GitHub/GitHub Enterprise sign-in flow for another account.
- **Full history** publishes every local branch and tag through a temporary bare
  clone. **Clean state** publishes the current files as one new root commit and
  keeps the old tip under a local `refs/desktop-material/transfer-backups/`
  recovery ref. Both modes verify the exact destination tip before retargeting
  `origin`; the source remote remains available as `upstream` when needed.
- The destination name, owner, privacy, mode, two confirmations, and full-range
  authorization slider are reviewed before the provider mutation. Focused
  contract tests pass **7/7**; the exact production build reached bundling but
  remains blocked by existing TypeScript 6 errors, so hidden-desktop runtime
  proof is not claimed.

## August 5 — account cards share one active identity across providers

- Settings → Accounts now compares every provider card with the single global
  `accounts[0]` identity instead of treating the first card in each provider
  section as active. With one GitHub.com account and one Enterprise account,
  exactly one row is marked **Active** and the other exposes **Make active**.
- The correction uses the same stable account identity and promotion path as
  the rail switcher; explicit repository account bindings remain authoritative.
- Focused account/store/routing/UI verification passes **39/39**. The required
  Lowlevel production build is pending because the shared endpoint is currently
  servicing another long-running build; no hidden-desktop runtime success is
  claimed yet.

## August 5 — Windows updates survive partial Releases

- The release promoter now considers only published Windows-capable Releases
  for the `Latest` update alias. A candidate must carry the Squirrel
  `RELEASES` manifest and a full `*-full.nupkg` package, so a newer Linux/TUI
  partial Release cannot turn the Windows feed into a 404.
- The existing live alias was repaired to
  `v3.6.3-beta3-zadwftypqg`; `releases/latest/download/RELEASES` returns HTTP
  200 and serves the expected manifest.
- The focused regression suites pass **29/29**. A Cheap headless production
  build was attempted but ended before renderer output was available, so the
  About-dialog capture remains explicitly unverified for this change.

## August 5 — rail account switching keeps the chosen identity active

- Selecting an account from the rail switcher now keeps that account first in
  the active-identity order across GitHub.com and GitHub Enterprise instead of
  immediately sorting the Enterprise choice back behind GitHub.com.
- The selected order is persisted and restored on reload; the account switcher
  and repository-owner auto-switch therefore agree on the same active account.
- Focused local verification passes: the combined account-switcher contracts,
  store, repository-owner, and click-handler suites report **55/55**. The
  required hidden build was attempted through Lowlevel, but its client stalled
  after the compiler worker stopped and no runtime evidence is claimed.

## August 5 — transient Actions job-log 404 recovery

- GitHub may return `HTTP 404` for a valid completed-job log endpoint while its
  archive is still being prepared. The Windows transfer path now retries only
  that API response after bounded **250 ms**, **750 ms**, and **1,500 ms** waits,
  returning to the API endpoint for a fresh signed redirect each time. Blob
  URLs never retry and API bearer headers never cross the redirect boundary.
- The in-app Job Log surface now explains the provider state and keeps explicit
  **Retry** and **Open on GitHub** recovery actions visible. The existing
  expired-log (`410`) behavior is unchanged.
- A follow-up audit keeps transient 404 retries outside the redirect-hop
  budget, stops before refetch when cancellation arrives during backoff,
  asserts that signed-blob 404s receive no bearer header, and verifies the
  external recovery link's destination and activation.
- Local evidence: focused transfer/viewer tests pass **20/20**; TypeScript,
  changed-file ESLint, and Prettier pass; the cheap headless Windows artifact
  shows the final 404 state and then both expected log lines after Retry. The
  standalone renderer diagnostic reports `hasErrors:false`; the production
  build also required and now includes a minimal Launchpad Sass brace fix so
  its declared renderer path compiles.

## August 3 — the site lays out on a phone

- The rebuilt site pushed the page 717px wide inside a 375px viewport. Every
  multi-column grid now collapses below 760px, grid items are allowed to shrink
  below their own min-content width, and the two inline minimums wider than a
  phone are relaxed.
- The app bar's 300px search field becomes a search button opening the same
  panel — a phone has no room for the field and no `Ctrl+F` to open the panel
  with. The brand subtitle, the keyboard hint, the gutters, and the tab heights
  all give ground, taking the sticky header from 256px to about 200px without
  dropping a control.
- Both tab strips scroll horizontally instead of pushing the page. A sticky
  header goes static below 520px of viewport height, so a phone held sideways
  gets its screen back. Footer links get a real tap target.
- Teleporting to a section measures the app bar rather than assuming 160px,
  which had been landing every target underneath a wrapped header.
- Measured in bilingual mode at 135% text scale across all six pages and all
  six overlay panels: no horizontal scroll and no clipped text at 320px or
  375px, and the desktop layout unchanged above the breakpoint.

## August 3 — the published site becomes one Material Design 3 component

- The homepage, the Cheap LFS guide, and the Cheap LFS versus Git LFS atlas
  were three hand-built pages sharing a stylesheet. They are now six pages of
  one Design Component behind a browser-style tab strip: Overview, Cheap LFS,
  Cheap LFS vs Git LFS, Docs hub, the regex-builder article, and Docs search.
- The site carries the standing per-surface rules as working controls rather
  than descriptions: three language modes, two independent playfulness sliders,
  a regex builder on every search bar, all four tab searches with
  close-containing and its inverse, the anchored per-element appearance editor,
  the notification centre with bulk actions, and export to Markdown, JSON,
  HTML, and CSV.
- Nothing loads from another host. `script/vendor-site-assets.mjs` vendors
  React and four font families, content-subsetting the icon face to the 54
  ligatures the site names and Noto Sans HK to the 231 characters the Cantonese
  copy renders — 420 KiB on disk.
- Five defects found and fixed while verifying: dropdown selections were silent
  no-ops, the dark-theme primary call to action sat at 2.02:1, both tab strips
  had no `tabpanel` or roving focus, three sliders and the appearance toggles
  had no accessible name or state, and the Screenshots section shipped seven
  empty upload placeholders.
- `/cheap-lfs.html` and `/cheap-lfs-vs-git-lfs.html` redirect rather than 404.
  The 249 rendered Markdown articles keep publishing under `/docs/`, and the
  Docs hub links into them with counts derived from the tree.
- Verified in a headless browser against an assembled `_site`: no console
  errors, zero third-party requests, all six pages and all eight overlay panels
  live, and every accent clearing 6.4:1 in both themes.

## August 3 — stash manager export slice

- The Stash Manager inventory no longer imposes the former 500-entry count cap;
  Git and the bounded metadata byte budget remain the practical limits.
- A separate non-blocking, keyboard-tabbed dialog now covers Manage, Export,
  History, and Appearance and voice. Export search uses the shared regex builder
  and can copy exact stash identities to a directory or ZIP, or configure 7z
  method, level, dictionary, match finder, fast bytes, solid mode, threads,
  split volumes, password, and encrypted headers.
- The focused Git/stash suites pass 40/40 and the new 7z mapping suite passes
  2/2. A fresh production compile and hidden Windows runtime capture are still
  required before this slice is called runtime-verified; remote CI and release
  proof remain separate.

## August 3 audit checkpoint — **Scoped fixes verified; browser page search now usable**

## August 21 — Status Hub projection foundation — **implementation pending verification**

- [ ] The existing Agents sidebar now receives a main-process-only Status Hub
  status projection with an honest local-only fallback. Repository registration,
  heartbeat/evidence models, and authenticated inbox reply confirmation are
  implemented; endpoint/vault configuration, focused Chuts, packaged
  interaction, and real HuiShots remain pending.

- The Agents creator is now mounted through the shared modal dialog layer and
  keeps its Options disclosure disabled during creation. The live store and
  mount are present; built-app acceptance capture is still pending.
- The Ollama model manager now has a localized Clear search action that resets
  only the query and preserves the active search mode. Its focused unit suite
  passes 14/14.
- The internal browser now exposes page search from its toolbar and `Ctrl+F`.
  Plain mode uses Chromium's in-page highlighting; regex mode reads bounded
  isolated-world page text and evaluates it with the existing safe RE2 engine.
  Both modes have case control, previous/next navigation, an anchored regex
  builder route, bounded request tokens, and localized result/status copy.
- The browser page-search contracts and chrome tests pass 32/32 across the
  focused contract and UI files. A real Windows bundle and hidden-desktop
  smoke remain required before this slice is called runtime-verified.
- The previous Windows CI run passed its assertions but exhausted the Node
  heap before test accounting completed. CI and Express Release now scope a
  4 GiB heap to their unit-test coordinators; the fix is pending remote-run
  proof rather than being called green locally.
- The required production bundle launched on the hidden Windows desktop and
  produced a real first-paint frame. CDP interaction was interrupted by the
  first-run/checklist overlay, so no Ollama screenshot is claimed from that
  run.
- The roadmap audit did not promote any item to complete without its remaining
  runtime, adapter, server, or capture evidence. R1/R2/R6/R7/R9–R18 therefore
  remain at their existing states; R3/R4/R5/R8 retain their documented capture
  or live-wiring gaps.

## Historical August 2 roadmap register — archived issue references

Every item below had its own issue (**#118–#135**). This table preserves the
planning and acceptance state recorded at that time; its issue links are
archival references, not a live issue queue. The August 13 snapshot above
reports zero open issues. A later issue closure is not, by itself, proof that a
row's historic acceptance work completed, and a historic *pending* state is not
a present issue or release claim. The original rule was that an item could be
called finished only when it was genuinely verified, not merely when code
compiled. Two rules govern that historical plan, set by the project owner:

- **Every screenshotted feature MUST be added** — not should, must. If it does
  not exist it is built from scratch, a web server included, and a way is found.
  A missing back end is a back end to write, never a reason to cut a feature.
- **Anything server-shaped is hosted in Docker, by the user.** No vendor
  backend, anywhere. The install is a fully automated, wizard-guided flow inside
  the app.

Those two together make the self-hosted server and its wizard the critical path,
ahead of any single feature that depends on it.

| # | Item | State |
| --- | --- | --- |
| [R1](https://github.com/Ding-Ding-Projects/desktop-material/issues/118) | Self-hosted Docker server and its guided install wizard | trust, provisioning, and build-context foundations implemented; guided UI and live transport pending — **critical path** |
| [R2](https://github.com/Ding-Ding-Projects/desktop-material/issues/119) | Custom Docker OAuth server (SSO, multi-domain SSO, SAML) | authority foundation implemented; server flows and capture pending, depends on R1 |
| [R3](https://github.com/Ding-Ding-Projects/desktop-material/issues/120) | History graph view: Branch/Tag ∣ Graph ∣ Commit Message | graph, context actions, lane visibility, explicit keyboard-accessible List/Graph tabs, and a dedicated full-width Graph repository page implemented; prior 1443×992 built-app List/Graph captures remain verified, while a fresh dedicated-page capture and broader graph-scale acceptance remain |
| [R4](https://github.com/Ding-Ding-Projects/desktop-material/issues/121) | Agents panel: fleet view, session creator, worktree status | operational foundation implemented; final acceptance and capture pending |
| [R5](https://github.com/Ding-Ding-Projects/desktop-material/issues/122) | Command palette expansion (45 audited additions, plus the git half) | catalog audited and partial routes added; remaining live commands and capture pending |
| [R6](https://github.com/Ding-Ding-Projects/desktop-material/issues/123) | Proactive conflict detection and predictive merge alerts | native-accurate forecast foundation implemented; observation adapter, live warning UI, and capture pending |
| [R7](https://github.com/Ding-Ding-Projects/desktop-material/issues/124) | AI merge conflict resolution, with an editable output pane | guarded three-pane editor implemented; conflict-flow integration and capture pending |
| [R8](https://github.com/Ding-Ding-Projects/desktop-material/issues/125) | Commit context menu in the graph | shared graph/list context actions implemented and tested; built-app capture pending |
| [R9](https://github.com/Ding-Ding-Projects/desktop-material/issues/126) | Compose commits with AI | immutable composition-plan foundation implemented; policy-backed generation UI and capture pending |
| [R10](https://github.com/Ding-Ding-Projects/desktop-material/issues/127) | Summarize past changes with AI | safe reviewed-result foundation implemented; policy-backed adapter/UI and capture pending |
| [R11](https://github.com/Ding-Ding-Projects/desktop-material/issues/128) | Launchpad, with pinning and snoozing | model, bounded preferences, and accessible view implemented; live adapters/navigation/capture pending |
| [R12](https://github.com/Ding-Ding-Projects/desktop-material/issues/129) | In-app pull request review and internal code suggestions | review workspace implemented; provider suggestion integration and capture pending |
| [R13](https://github.com/Ding-Ding-Projects/desktop-material/issues/130) | Team collaboration: shared workspaces, insights, presence, deep links | not started, depends on R1 |
| [R14](https://github.com/Ding-Ding-Projects/desktop-material/issues/131) | Admin and security controls, including AI security controls | fail-closed AI policy foundation implemented; trusted main-process wiring and admin UI pending, gates R7/R9/R10/R12 |
| [R15](https://github.com/Ding-Ding-Projects/desktop-material/issues/132) | Integrated terminal with a live synchronized graph | renderer/session and refresh-coordinator foundations implemented; ConPTY/IPC/live-graph wiring and capture pending |
| [R16](https://github.com/Ding-Ding-Projects/desktop-material/issues/133) | Issue tracker integrations: Jira, GitLab, Trello | strict provider identity/config foundation implemented; authenticated clients, UI, and capture pending |
| [R17](https://github.com/Ding-Ding-Projects/desktop-material/issues/134) | Parity gaps: lane hiding/soloing, SSH keygen, interactive rebase, Gitflow, in-app editor | lane controls and interactive-rebase model/editor implemented; SSH keygen, Gitflow, in-app editor, wiring, and capture pending |
| [R18](https://github.com/Ding-Ding-Projects/desktop-material/issues/135) | Cloud Patches, self-hosted on your own server | canonical artifact and encrypted store foundations implemented; authenticated HTTP/apply/UI/capture pending, depends on R1 |

## August 2 fleet bug hunt — **23 defects fixed; a handful named and left open**

- Six read-only agents swept disjoint areas of the desktop app and reported
  around thirty candidate defects; each one was re-read against the code before
  anything was touched, and every fix carries a test that fails without it.
- The branch did not typecheck when this started — two IPC channels were being
  sent and never declared — so the previous entry's claim of a clean `tsc` was
  wrong. That was fixed first.
- The worst of them, roughly in order: a profile restore that deleted a settings
  file was silently undone by its own crash-safe backup; history mutations ran
  with no repository lease, so a debounced commit could land on a half-restored
  tree; a synchronous throw on any simplex IPC channel destroyed every window;
  silent install judged one file and spawned another; and the internal browser's
  find commands were dropped at the IPC boundary, so page search could never
  have worked at all.
- Accessibility and clipping defects were treated as blockers, not polish: the
  tab strip had no arrow-key navigation, the tab colour picker discarded alpha,
  an invalid regex listed every row with nothing announced, and the browser's
  focus rings were clipped by their own scrollers.
- **Feature:** Commit & push all now lets you pick which repositories run, with
  a search bar wired to the regex builder. Bulk select and clear act only on
  what the filter is showing.
- Deliberately left open and named in `HANDOFF.md`: three tab surfaces and the
  Commit & push all dialog are still hard-coded English, the profile history
  page read is still unbounded, and the version-history timeline's `listbox`
  structure is still wrong.

## August 2 internal browser — **Defects fixed; page search renderer completed; three features remain**

- Four real defects fixed: an IPC message per address-bar keystroke, a
  `tablist` with no panel and non-tabs inside it, a window title that never
  named the page, and a null check that missed `undefined`.
- Page search now has its renderer find bar as well as the main-process half:
  plain search uses Chromium's `findInPage`; pattern search reads page text in
  an isolated world and evaluates RE2 outside the page. Stale replies are
  discarded by request token, and regex results expose bounded context buttons.
- Regex mode deliberately cannot highlight in-page matches — that needs DOM
  mutation. Plain mode highlights; regex mode lists matches with context.
- Running any script inside a page is new for this browser and was an explicit
  decision. See `HANDOFF.md` for the boundary it keeps.
- Still not started: funny-level sliders, non-blocking notifications, and the
  dim sum surprise in the browser window.

## August 1 line counts move into releases — **Implemented and dewed**

- Every release now carries its own line count, measured by CI over the exact
  commit it was built from, via the committed `script/count-lines.mjs`.
- The count is broken down by area, gives both a project total and a grand
  total, names its exclusions, and separates generated from hand-written.
- It also reports how many lines agents wrote versus people, attributed per
  surviving line with `git blame` rather than by summing added lines.
- `agent-global-memory` got the same treatment, and deliberately does **not**
  publish an agent share: 718 of its 750 commits are authored under the owner's
  identity with no agent trailer, so the figure would be precisely wrong.

## August 1 dim sum surprise in the app — **Implemented and locally verified**

- One launch in ten now shows a bundled photograph of a Hong Kong dim sum dish
  in the bottom-left corner, named in English and Traditional Chinese, as a
  self-clearing `role="status"` card that never gates startup and never takes
  focus. The website already had this; the app did not.
- Twelve real photographs are copied byte for byte out of the shared dim sum
  catalog into `app/static/dim-sum/` (~27 MiB) with a manifest recording each
  file's dimensions and SHA-256. Nothing is generated, fetched, or re-encoded,
  and `script/generate-dim-sum-assets.ts` verifies every PNG decodes before it
  copies it.
- The draw is spent once per launch whether it hits or misses, comes from a
  uniform CSPRNG rather than a biased source, and is suppressed on first run,
  error, update, modal and quiet-hours launches — each of which shows nothing
  and is never retried later in that launch.
- There is no off switch, and any retired opt-out preference is deleted on
  launch so an old profile rejoins the draw. 47 unit tests cover the band, the
  suppression table, all fifteen language × playfulness combinations, the
  bundled bytes, and the rendered card.

## August 1 gallery recapture — **81 of 92 frames refreshed; 11 blocked and named**

- Every published screenshot the harness can drive was re-shot against a build
  carrying the full-app command palette, so the gallery stops documenting a UI
  that no longer exists.
- Three real app defects surfaced and were fixed: a dead
  `window.location.reload()` app-wide, a double scrollbar in the repository
  logo editor, and a capture credential seeded under one build flavour only.
- Four harness drifts corrected; two acceptance gates rewritten to assert what
  they meant rather than a fixed row count.
- Remaining 11 frames (5 of them the out-of-scope Linux TUI) are itemized with
  blockers in `.codex/run-manifests/2026-08-01-gallery-recapture.md`.

## July 31 full-app command palette with rich controls and teleport — **Implemented and locally verified**

- The Ctrl+F palette now covers the entire app (MD3 full-screen search view)
  with a results list, a "where it lives" detail pane, and a keyboard-hint
  footer; narrow widths collapse the pane and chips instead of clipping.
- Settings rows render their live control inline — switch for booleans,
  text box for entries, numeric box for bounded numbers, select for choices —
  wired to real app state through the same dispatcher setters the Settings
  panes use; changing a control keeps the palette open.
- Click/Enter teleports to the exact control that owns the feature
  (spotlight ring + focus, `data-teleport-target` anchors and structural
  hooks); Ctrl+Enter or the row's Run button executes instead. Destructive
  and network commands can never fire from a teleport.
- Verified: `command-palette-catalog-test.ts` (27),
  `command-palette-rich-test.tsx` (6), `filter-mode-surfaces-test.tsx`,
  i18n tests; tsc clean; changed-file eslint/prettier clean.
- An MD3 source audit of the whole app UI (per the material-3 skill) is
  recorded at `docs/verification/md3-ui-audit-2026-07-31.md` (84/100; the
  two shape tokens it flagged as missing were added in this task).

## July 31 recurring background errors — **Implemented and locally verified**

Production logs separated two failures that had appeared together: a bundled
Git launcher denial during the hook-free settings history probe and an uncontained
provider failure in repository-indicator refresh. The startup probe now has two
bounded, cancellation-aware retries; indicator refresh contains each repository
and reschedules in `finally`. Mutating Git commands remain single-shot.

Focused verification passes 6/6 launcher/updater tests, 62/62 exact
pointer/submodule checks, 101/101 broader focused checks, changed-file ESLint
and Prettier, and TypeScript no-emit. The reproducible Lowlevel-MCP production
build returned 0 after 539.6 seconds; the exact rebased tree returned 0 again
after 559.1 seconds. Off-screen Win32 acceptance showed the
modified `.gitmodules` and deleted gitlink together for twelve stable seconds,
with empty notification history and none of the reported errors in isolated
logs. Push and hosted installer/Release evidence remain the close-out gates.

## July 31 automatic submodule recovery — **Implemented and locally verified**

Add Submodule now resolves one immutable stage-0 blob OID, validates that same
object, and restores its exact bytes only after the requested destination
passes validation. The exclusive create cannot overwrite a concurrent file;
failure cleanup removes only a matching device/inode and preserves a pathname
when ownership cannot be proven. Commit-time Cheap LFS inventory omits Git
metadata and gitlinks, but oversized protected dot paths stay in fail-closed
commit accounting and are rejected before provider, credential, release,
commit, or push mutation. This removes the follow-on unsafe-path toast without
weakening real path, pointer, or large-file enforcement.

Exact non-UTF-8 blob restoration, real submodule add/rollback, protected-path
zero-read behavior, early remote-mutation gates, and mixed/manual failure
merging are covered by the final focused suites.

The first hosted run exposed two rebase-adjacent integration checks: a duplicate
Help-menu <kbd>H</kbd> mnemonic from the incoming changelog viewer, and a
duplicate desktop feature-summary row against the frozen TUI parity count. The
Windows mnemonic now uses <kbd>R</kbd>; the duplicate summary row is removed
without touching the out-of-scope TUI, while the full reliability article and
Pages feature card remain published.

The second hosted run cleared both first-run failures. Its only remaining
Windows failure was the incoming context-menu search surface using a constant
expression instead of the registry auditor's literal one-to-one ID. Both the
input and its regex control now expose the literal `material-context-menu`
surface ID; the focused collection-registry contract passes.

## July 30 Publish organization sizing — **Implementation pushed; final hosted proof pending**

Publish repository's Organization field is now an explicit-None searchable
listbox instead of a native select. It persists fuzzy, substring, and bounded
regex modes, opens the full Regex Builder, supports
<kbd>Home</kbd>/<kbd>End</kbd>/<kbd>Enter</kbd>/<kbd>Space</kbd>/<kbd>Escape</kbd>,
ignores stale responses from a previously selected account, and keeps the
shared Regex Builder portal responsible for Escape so the host dialog stays
open. Global select wrappers can shrink within their parent, while this list
uses a bounded 128–176 CSS px viewport, contained vertical scrolling, and
ellipsis for long organization names.

The frozen local tree passes **26/26 focused UI tests**, TypeScript no-emit,
**83/83 pre-promotion verifier contracts**, **19/19 provider checks**, and
**61/61 documentation checks**. Its exact hidden production build returned 0
after **1042.19 seconds**, without a timeout; stderr contained only npm's
upgrade notice. The accepted 1440×960 capture is 133,919 bytes with SHA-256
`7db03d5db789d19e1ad49de66bd79abb62e46c7909eda9de08878aac367033d8`.
The 390×844 physical receipt used a 780×1688 logical viewport at combined
DPR/zoom 0.5: the 176 CSS px list rendered at 88 physical px, had
`clientHeight=172`, `scrollHeight=184`, reached `maxScrollTop=12`, kept the
final option visible, showed no horizontal overflow, ellipsized the long row,
and restored None. Gallery promotion makes this **85 current Windows scenes**
(67 canonical plus 18 specialist). Cleanup is complete, and implementation
commit `63c1ec08c4f24f85d87f21d98851dcd5784c7800` is proven on `origin/main`.
The first hosted matrix identified the omitted retained receipt and stale
generated parity contract; this follow-up publishes both. Final exact-SHA
hosted CI and installer-release proof remain open gates.

## July 30 local conflict/CI repair and background progress — **Implemented locally; push and hosted verification pending**

- [x] Launch a Windows `.NET` profile's final `dotnet run` application in an
  independent process so it remains open when Desktop Material closes, while
  keeping toolchain, restore, and build stages supervised.

Conflict dialogs and failed Actions runs now open bounded Codex/OpenCode tasks,
Build & Run carries elapsed/ETA progress and stays hidden while work continues,
and Cheap LFS restore details collapse without hiding the live header. All five
actions are direct command-palette results alongside its rich search controls.
TypeScript no-emit, targeted lint, Prettier, and 42/42 focused tests are green.
The real production renderer passed off-screen command-palette and background
progress acceptance; hosted CI and installer evidence remain pending until push.

Desktop Material's numbered roadmap now extends through **M27**. M0–M21 and the
M23 Ollama manager have published receipts; M22's 73-scene visual refresh is
published byte-identically. The current guided-gallery contract declares
exactly **86 Windows targets**. Its current-source updater-ready frame is now
accepted and published; each remaining replacement stays fail-closed until it
passes the current-build gates. Five Linux/Xvfb captures remain preserved as
historical evidence outside that target set. The exact
acceptance/publication state for M24–M27 is listed below. The July 22 tab-group,
command-palette, Alt-key,
release-gate, and Cheap LFS UI continuation is implemented, locally accepted,
pushed to `main`, and verified through the exact-source CI, CodeQL, Pages, wiki,
and installer-release pipelines.
This file is the compact public source of truth; implementation details and
historical test receipts stay in [PLAN.md](PLAN.md) and
[HANDOFF.md](HANDOFF.md).

## July 29 repository-sheet and command-palette refinement — **Implemented and locally verified**

Repository account, service, status, text, and regex filtering now live behind
one collapsed-by-default disclosure while preserving active state and an
always-reachable compact action row. The action strip remains one row at the
390 px sheet width, including bilingual mode.

History hover/focus cards show the exact authored timestamp plus a localized,
auto-updating relative age. Command-palette appearance controls are compact and
aligned, and the optional **Random per repository** mode deterministically maps
each stable local repository ID to one of six row layouts.

Focused implementation verification passes **133/133** and gallery capture
contracts pass **73/73**. This includes the `.gitmodules`/ordinary-metadata
Cheap LFS false-positive regression, while explicit unsafe Cheap LFS pathspecs
remain rejected. The gallery target has grown to 86 for the new History hover
and Publish organization listbox scenes. The exact post-review Windows
production build and four current-build screenshots remain in progress;
publication and remote workflow evidence remain the close-out gates.

## July 29 Cheap LFS hook containment and diagnostic server — **Implemented, deployed, and locally verified**

The one-file background commit that installs the Cheap LFS cloud-compression
caller now points Git at an operation-owned empty hooks directory. This closes
the gap left by `--no-verify`: a failing Git LFS-style `post-commit` hook is
never invoked, while ordinary user commits and pushes keep the repository's
hooks. A real-Git regression proves the generated workflow alone commits and
reaches the remote despite a deliberately failing post-commit hook.

Desktop clients can select local, remote, or dual diagnostic storage through
launch configuration, including an optional absolute local directory and a
token-file-backed central endpoint. The remote transport is five-second
bounded, best-effort, and redacts credentials before sending.

The ARM64 central service is live at the private Docker host on port 4318. It
requires bearer authentication for ingestion, search, storage status, and the
dashboard; redacts again server-side; stores per-client daily JSONL in an
operator-selected bind mount; and enforces 14-day/5-GiB retention plus CPU,
PID, request, query, and message bounds. The host Docker daemon reported that
memory cgroup limits are unsupported, so the configured 192-MiB Compose limit
is documented but not enforced there. Live health and an authenticated
ingest/search/storage smoke test passed with the injected token value removed.

## July 28 current close-out wave — **Merged locally; final verification in progress**

### Cheap LFS bounded Windows sidecars — **Implemented locally; final-tip build pending**

Pin, Release restore, OCI restore, and generated clone hydration no longer
derive scratch components from the complete tracked basename. Fixed
process/UUID names remain well below NTFS's 255-unit component limit while
preserving same-directory atomicity; current and legacy crash leftovers are
kept out of status, staging, and automatic pin scans. Focused coverage is green
at **82/82**, including 255-unit tracked names and 200-unit helper/GHCR/OCI
destinations. The earlier `67d475fd5e` build predates this correction and is
not final-tip evidence.

The screenshot's Pull refusal is tracked as a separate ordinary-Git boundary:
raw materialized caches are intentionally hidden only from Desktop's Changes
projection, not from Git's merge safety. The documented current workaround
backs up only verified **Materialized** files, restores their committed
pointers, pulls, then re-materializes; multi-gigabyte caches should not be
stashed. Automatic cache parking remains future work because it must retain
the payload, roll back on pull failure, and never rewrite a modified path.

### Standalone Cheap LFS versus Git LFS atlas — **Pages published; integrated app verification pending**

The new stable `/cheap-lfs-vs-git-lfs.html` route is separate from the
end-to-end Cheap LFS guide. Its source defines 72 row-level sourced
distinctions in 12 six-row categories, six persistent browser-style tabs, two
code-native SVG diagrams, an interactive fit finder, and category/fit/text
filters. Explicit regex mode reuses the documentation site's fresh-worker
runner and 750 ms hard deadline rather than compiling reader patterns on the UI
thread. A dedicated publication tab contrasts Cheap LFS's provider-first
handoff with Git LFS's pre-push path and includes the committed-pointer,
ordinary `git push`, fetch, matching `HEAD`/`@{upstream}`, first-anchor, and
raw-byte safety proofs.

The source keeps the result honest: Cheap LFS leads on the guided Windows
workflow, explicit provider verification, Release/OCI choice, multipart
logical files, optional encryption, recovery, and observability; Git LFS leads
on standards, cross-platform clients, tracking policy, locking, caching,
pruning, migration, CI, and automation. Host cost and policy remain dated
“depends” claims, the pointer formats are not described as interoperable, and
open 50+ GiB hardening issue #96 remains visible. Automated and Lowlevel MCP
headless acceptance is green: both route contracts, 59 documentation/search
tests, 35 installed-Chrome checks, all 33 HTTP requests, original-resolution
wide/narrow capture inspection, and runtime cleanup passed. The base predates
renderer multi-compiler fix `6903c9ae1e`, so its known pre-fix production-build
path was stopped with bounded evidence rather than misreported as a Pages
success. The route is published from remote `main` commit
`80e0209a12f41df8a6a80ef52925b52ab9ecb1b0`; Pages run `30391300142`
succeeded. Exact integrated application verification remains pending.

### Cheap LFS Pages product guide — **Pages published; integrated app verification pending**

The stable `/cheap-lfs.html` route now carries a marketing-style but
source-grounded 30-point comparison with five persisted filters, explicit
“choose Git LFS when…” guidance, and a six-stage provider-first push handoff.
The guide documents the create-only first-branch Release anchor separately
from ordinary manual branch publication, inspects the committed pointer with
`git show`, and proves the pushed branch through matching local/upstream SHAs.
The Pages-only Lowlevel MCP headless run passed **46/46** checks in eight
phases at 1440×960 and 390×844 with both accepted captures retained. The full
Electron production build was interrupted after an extended silent run so the
user-requested site push could proceed; no app-build result is claimed by this
documentation milestone.

### Integrated close-out gate

The locally merged issue-closing lineage covers the remaining actionable
source, accessibility, documentation, and acceptance gaps. It is not complete
until the exact Windows production build, all 86 fresh Windows scene checks,
the declared focused and full suites, default-branch integration/push, and
issue-closing receipts are proved. The archived Linux TUI prototype, its five
captures, and its package/compatibility lanes are historical and non-blocking
under the Windows-only product boundary.

Issue #96's reported working-tree inventory OOM path is now locally
closure-ready: Git supplies only changed/untracked names, Desktop Material
reads at most a securely identity-proven 512-byte prefix, and an exact
55,581,030,080-byte NTFS sparse regression proves `git grep --untracked` is
never invoked. Focused coverage passes 82/82 and the complete Cheap LFS
directory passes 673/673. Publication, final-tree gates, and the issue-closing
receipt remain part of this wave rather than being inferred from that local
checkpoint.

## Historical July 28 measured repository-view responsiveness — **Source fix locally verified; exact post-fix timing pending**

Lowlevel MCP exercised the immutable baseline Windows release at `9bdfdb8b25`
on an off-screen desktop. Idle animation stayed below 17 ms across 122 sampled
frames, but warmed Changes/History switches measured 56–104 ms with six long
tasks. Every section click sent an already-satisfied
`showBranchList: false` update after the real section mutation, causing a
second global app-state emission and root render. The rail now skips that
dispatch while the list is already closed, and the store rejects identical
partial updates from every caller. Focused tests passed **42/42** in that source
checkpoint. Its changed-file ESLint was blocked by five missing
repository-specific rule definitions in the reused dependency tree; that
historical environment does not override the active close-out branch's later
green lint gate. Exact post-fix packaged timing is still an acceptance
requirement.

## Historical July 28 root renderer resource audit — **Superseded checkout snapshot**

Root renderer subscriptions, IPC listeners, global document/window handlers,
and deferred telemetry/update polling now have deterministic unmount cleanup.
Queued idle and animation-frame work cannot resurrect those resources after the
root has unmounted. Focused lifecycle coverage passed **4/4** and changed-file
ESLint was clean. The Lowlevel MCP production build in that predecessor
checkout stopped because that checkout lacked its dependency tree. That
environment-specific stop is retained as chronology; it is not a current
blocker or a substitute for the active branch's final build.

## Historical July 27 encryption, observed network actions, and tone controls — **Superseded status snapshot**

- **#78:** GitHub Release-backed Cheap LFS payload encryption is optional and
  uses AES-256-GCM. Credentials are operation-scoped by default, with Windows
  credential-vault storage only after explicit opt-in. Legacy pointers remain
  compatible, plaintext legacy restores do not prompt, and mixed
  authentication plus cleanup failures fail closed.
- **#80:** push, fetch, and pull promises are observed. An invalid canonical
  remote produces a persistent yellow warning with a **Change remote URL**
  action instead of an unhandled background failure.
- **#83:** English and Cantonese again have independent persisted funny-level
  sliders, each spanning 1–5.
- **#81 and #82:** deliberately deferred to a later continuation.

Local verification is **194/194 focused tests** and **6768/6768 full tests
across 831 files**; TypeScript and `yarn lint` are clean. Packaged visual
evidence and remote CI are not yet claimed. #78, #80, and #83 remain open until
real built-app screenshots are captured. Those deferral and open-issue
statements describe that July 27 checkpoint only; the current close-out state
is the section above.

## Historical July 27–28 encryption, group management, lazy loading, tone controls — **Integration chronology**

Five issues landed on `main` in one sweep. At that checkpoint each was locally
green; none of the surfaces with a visible component had a real capture yet, so
the issues remained open rather than being closed on test evidence alone.

Two of them were then **superseded**. The repository owner independently
implemented #78 and #83 and pushed `a550dc1ea8`, which deleted this branch's
encryption module, encryption gate, funny-level controls and their test suites
in favour of its own. The owner's implementation is the one that ships; the
descriptions of #78 and #83 below record what this branch built and why, not
what is now in the tree. #80, #81, #82 and #85 were not covered by those
commits and survive as described.

- **#78 optional passphrase encryption for Cheap LFS payloads.** AES-256-GCM
  with scrypt at 2^17, fresh salt and nonce per call, passphrase held only in
  the operating system credential manager. An encrypted part records both a
  stored digest pair, checkable by anyone without the passphrase, and the
  plaintext pair the never-re-pin check compares against. Restore gates in
  order — stored pair, GCM tag, plaintext pair, whole-file check — and every
  one fails closed. The committed pointer still records each file's plaintext
  size and SHA-256, so encryption conceals contents rather than the fact that a
  given file is stored here; the confirmation dialog states this before the
  user opts in.
- **#80 push, force-push, pull and fetch observe their own promises.** A
  rejected canonical-remote preflight previously reached the renderer's global
  unhandled-rejection containment and surfaced as a generic "a background
  action stopped unexpectedly" notice instead of the real error.
- **#81 first-class repository and tab group management.** Groups can be
  created, renamed, recoloured and removed without closing repositories, and a
  collapsed tab group lists its members in a keyboard-navigable dropdown. This
  also gave `updateTabGroup` its first UI caller — it had shipped with none.
- **#82 progressive asynchronous lazy loading.** The external-editor
  availability scan and clone-queue journal recovery no longer block first
  paint, and seven heavy repository sections load behind a local, screen-reader
  announced progress state.
- **#83 funny-level sliders moved to Appearance › Tone.** They were not
  missing; they were stranded in the Sound tab under a text-to-speech heading,
  which implied they styled only spoken narration when they style every
  category of copy. Language mode now sits beside them, and the slider
  announces "Level 4 of 5, Playful" rather than a bare number.
- **#85 decryption reports its own progress stage** instead of borrowing
  `decompressing` — the wrong word on the slowest step of an encrypted restore.

Two build facts are worth recording because they cost real time. `yarn
compile:dev` exhausts a 10 GB V8 heap: the config exports six webpack
configurations built concurrently by one MultiCompiler, each holding a full
module graph. Building one configuration per process succeeds comfortably.
Separately, a build piped into `tail` returns `tail`'s exit status, so two
out-of-memory failures were reported as success and a screenshot was taken of a
stale bundle — which is how a shipped feature briefly appeared to be missing
from the settings tab.

## Historical July 27 Linux TUI path browser and Git wrapper — **Archived, non-blocking prototype receipt**

This section preserves what the prototype accepted on July 27. The TUI is not
a current supported product/package target, and none of its remaining
compatibility, CI, installer, or visual gaps blocks the Windows application.

The Linux-first terminal edition then added a folder-only repository browser to
its Open and Create dialogs without replacing the real editable path field.
Browse/Hide, Home, and Up work by mouse and keyboard. A matching outer pair of
single or double quotes is removed from pasted repository paths immediately
when bracketed paste is available and again at submission as a
terminal-independent fallback; path text is never evaluated by a shell.

The literal `github` launcher also provides `github push`, `github pull`, and
their `github git push` / `github git pull` forms. Push forces a parseable
native dry-run, checks the publication delta for Cheap LFS safety, and invokes
native Git only after the preflight passes. Pull invokes native Git first and
then materializes canonical pointers with exact size/SHA-256 verification.
Other `github git <argv>` operations remain argv-only native passthrough. The
wrapper never stages, commits, rewrites history, uploads a payload, or shadows
the system `git` executable.

The full Windows-hosted TUI suite passes **250 tests** with one Linux-only skip
in **182.76 seconds**. The focused path/browser suite passes **29/29**, the
focused wrapper suite passes **47/47**, Ruff lint/format and strict mypy for
both the normal and explicit Linux platform targets are clean, and the wheel
and source distribution build successfully. Linux and Windows one-line uv
install commands install all three aliases and update future shell `PATH`
values. A disposable Linux fixture accepted safe dry-run/push/pull behavior and
restored a 23-byte object with an exact pointer/cache hash match. The packaged
TUI launched in real xterm/Xvfb and its Open dialog was inspected. Windows
installs resolve all three aliases from the uv tool directory already on
`PATH`; the Linux wheel smoke did likewise. Cleanup is complete. Immediate
quoted-paste normalization, expanded-tree clicking, narrow live resizing, and
Ctrl+Q exit remain automated rather than accepted visual evidence in the
[dated run manifest](docs/verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md).
Feature commit `62420efaf6` is integrated and pushed through `f5f6f04c7e`;
current remote `main` contains that merge. Pages run `30323259671` and Cheap LFS
cloud run `30323259650` passed for the pushed merge, while CI `30323259648` and
code scanning `30323259706` were still running at handoff.

The preceding compatibility commit `f555d374a6` is already contained in
`origin/main`.
[CI run `30317262582`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30317262582)
passed the Linux TUI matrix and Windows TUI core job, although the overall
workflow failed in the unrelated Windows x64 unit job. Installer
[run `30318769692`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30318769692)
failed and published no Release.

## July 27 Cheap LFS restore look-ahead, app-hosted browser, and private badge — **Pushed; TUI lanes green, overall CI/Release failed**

The Cheap LFS Release restore path now uses one FIFO coordinator shared by every
file and multipart asset in a batch. It permits at most two active downloads
and opens the look-ahead lane only when the current provider transfer reaches
the exact 90% boundary; a missing or unusable progress total falls back to
starting the next item when the current transfer settles. Per-part and
whole-file size/SHA-256 verification, unchanged-pointer comparison, temporary
artifact cleanup, cancellation draining, and input-ordered outcomes remain
mandatory. The shared Large files and clone/batch restore surface now shows
overall/current/look-ahead progress, repository/provider/phase, file and part
ordinals, logical and actual network bytes, queued/remaining/succeeded/failed
counts, rate, ETA, elapsed time, bounded failure details, and cancellation.

Browser-bound HTTP(S) links can now follow a persisted global setting into a
dedicated Desktop Material browser or the system browser. The app-hosted window
provides tabs, New tab, address bar, Back/Forward, Refresh/Stop, Go, bookmarks,
popup/redirect capture, and an explicit external escape. Remote pages live in
permission-denied sandboxed `WebContentsView` tabs with no Node, preload, or
trusted app IPC. Authentication is explicit rather than URL-guessed, uses a
clearable in-memory partition, cannot be bookmarked, and always offers
**Continue in system browser**.

Repository-list privacy is now a separate filled-lock badge driven only by
exact `isPrivate === true` provider metadata. It remains visible beside a fork
glyph or custom repository logo; public and unknown metadata show no lock.
The badge is keyboard-focusable, localized, and included in the row's
accessible name.

Local acceptance is complete and the source is merged and pushed through
`2abccae8fd`. The final focused browser, restore, localization, IPC, badge, and
integration suite passed **760/760 across 58 files**;
the two CDP verifier contract suites passed **14/14**; full TypeScript checking
is clean; and the exact Windows production build returned `0` without timeout
or stderr and produced the normal `out` bundle including the internal-browser
assets. A real built app on an isolated hidden Win32 desktop passed wide
English and narrow bilingual restore receipts at the exact current-90% /
look-ahead-10% state, browser redirect/popup/new-tab/bookmark/authentication
escape receipts, and the private-badge capture, with no clipping, overlap, or
private data. Pages and wiki publication are verified live. The first remote CI
run exposed Linux TUI-only Python 3.10/mypy compatibility defects. Correction
commit `f555d374a6` is contained in `origin/main`, and remote run `30317262582`
passed the Linux TUI matrix plus Windows TUI core. The overall workflow still
failed in the unrelated Windows x64 unit job; installer run `30318769692`
failed and produced no Release. Packaged Windows E2E is verified by
[job `90140843987`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30315770398/job/90140843987).
Detailed contracts and the evidence split are in [HANDOFF.md](HANDOFF.md),
[Release-backed Cheap LFS](docs/features/repository-management/release-backed-cheap-lfs.md),
the [app-hosted browser](docs/features/integrations/app-hosted-browser.md), and
the [private-repository lock badge](docs/features/repository-management/private-repository-lock-badge.md).

## Historical Linux-first interactive TUI — **Archived, non-blocking prototype receipt**

A separate Python/Textual prototype adapted Desktop Material for Linux
terminals without weakening the graphical edition's Windows-only boundary. The
preview has a clickable repository rail, tabs, buttons, lists, tables, selects,
and checkboxes; real single-line and multiline text controls; keyboard focus
and shortcuts; local Git panes; GitHub workflows through `gh`; bounded RE2
search and a full builder; English, Hong Kong Cantonese, and bilingual modes;
non-blocking notifications; XDG state; editor/terminal integration; and
app-owned Git-backed settings history.

Cheap LFS interoperates with the Windows Release-v1 pointer format on both
Linux and Windows, exposes clickable inventory/preview/track/verify/restore
flows, and provides the same operations through the CLI. New TUI writes are
bounded at 500 MiB while legacy reads remain compatible through 2 GiB; size and
hash are verified before restoration. OCI/GHCR/cloud writes, encryption, and
automatic batching remain explicit parity gaps.

Packaging produces a wheel and source distribution, and the additive Ubuntu CI
matrix covers Python 3.10, 3.12, and 3.13 plus lint, typing, tests, a fresh-wheel
smoke install, and parity-contract drift. A separate Windows Server 2022/Python
3.12 lane checks the non-PTY cross-platform core without claiming Windows PTY
acceptance. The generated contract maps all 201 desktop rows conservatively: 14
adapted, 53 partial, 132 not yet available, and 2 terminal-owned. It is
deliberately not a full-parity claim.

The [publish run manifest](docs/verification/linux-tui-2026-07-27/run-manifest.md)
records the completed local matrix: 193 cross-platform tests plus a real Debian
PTY pass, five original Lowlevel/Xvfb captures with mouse/text-field evidence,
wheel/sdist and fresh-install inspection, a non-root Docker build, and complete
disposable-resource cleanup. The merged delivery is pushed through
`2abccae8fd`, and Pages/wiki publication is verified.

The first merged-source CI run then found a Python 3.10 compatibility boundary:
Git 2.54 emits UTC timestamps ending in `Z`, which Python 3.10 does not accept
through `datetime.fromisoformat`. It also found a Linux-typeshed mypy boundary
around the guarded Windows `msvcrt` lock path. The correction normalizes only
the terminal UTC designator, preserves numeric offsets and malformed-date
behavior, dynamically types the platform-only lock module, and skips TUI
packaging when an older upstream CI target is already non-publishable. An
isolated CPython 3.10.20 rerun passed **193 tests** with one Linux-only PTY skip;
Ruff, strict mypy, the 35 affected tests, and 8 workflow safety tests are green.
Correction commit `f555d374a6` is contained in `origin/main`. CI run
`30317262582` passed the Linux TUI Python matrix and Windows TUI core job, but
the workflow overall failed in the unrelated Windows x64 unit job. Installer
run `30318769692` failed and created no Release.

## July 26 reliability bug hunt — **Implemented and locally accepted**

The latest `main` was fast-forwarded before inspection. The pass repaired the
fresh-session publication state behind issue #39, made quick push honor only an
unambiguous configured tracking remote, corrected the Explorer shell package's
root layout and x64/ARM64 build identity, and removed stale native output before
a missing-toolchain return. User-authored app regex now uses bounded RE2
throughout; capture-heavy patterns receive a compositional work budget, diff
search reports its global result limit instead of lying about no matches, saved
legacy notification patterns require explicit migration, and the static Pages
hub runs native ECMAScript regex only in a hard-deadline worker with bounded
response data. Exact test, build, headless-capture, GitHub, and publication
receipts are recorded at the top of [HANDOFF.md](HANDOFF.md) and in
[the dated verification record](docs/verification/bug-hunt-2026-07-26/run-manifest.md).

## July 26 repository distribution follow-through — **Implemented and locally accepted**

Transferred GitHub repositories now repair the exact default remote before
network work while preserving protocol, origin, unrelated remotes, and any
deliberately divergent push URL. Scheduled Git and post-push SSH work uses an
explicit non-interactive path so hooks, signing, credential helpers, AskPass,
and modal error UI cannot stall unattended automation; manual operations remain
interactive.

The Distribution surface adds a per-repository GitHub Packages/version
explorer, safe plain/fuzzy/regex search, and a narrow GHCR file upload/download
path with immutable-digest and byte-integrity verification. App-owned Cheap LFS
storage releases are hidden from the normal Releases list by default and can be
revealed without mutation. Actions artifacts gain the same searchable catalog
behavior. Cache archive download remains unavailable because GitHub exposes no
supported cache-download API; the UI points users to downloadable workflow
artifacts instead. Details and current receipts are in [HANDOFF.md](HANDOFF.md).

## Ignored files to a local Cheap LFS submodule — **Local phase implemented and pushed**

Only the **local phase** is built; the publish phase below is still deferred.
The reviewed local workflow is reachable from **Repository settings →
Submodules → Ignored files to a local submodule…**. Candidates come from
`git status --porcelain=1 -z --untracked-files=all --ignored=traditional` and
every one is proven individually by `git check-ignore -v -z --stdin`, which is
deliberately run *without* `--no-index` so a tracked path — including a
force-added file that matches an ignore pattern — can never be proven ignored
and therefore can never be selected. The exact source file, line, and pattern
that proves each row is shown beside it. No `.gitignore` is ever parsed by the
app.

Every check is fail-closed, with its own named reason: `not-proven-ignored`,
`symbolic-link`, `reparse-point`, `not-regular-file`, `git-control-path`,
`nested-repository`, `path-escape`, `duplicate-selection`,
`destination-case-collision`, `inside-destination`, and `stale-inventory`. The
destination folder adds `empty`, `absolute`, `segments`, `git-control-path`,
`existing-submodule`, `repository-root`, `unsafe-link`, `occupied`, and
`ignored`. One refusal refuses the whole operation.

Copy and hash proofs finish before any topology change. The phases run
`validate → hash-originals → recovery-copy → stage-copy →
initialize-repository → topology → final-verification → cleanup`: each staged
copy is verified by size and SHA-256 while the parent repository is still
strictly read-only, and the first index mutation anywhere — the new
repository's own commit — happens only after every proof passes. The single
`git submodule add` follows it and leaves the submodule and `.gitmodules`
staged, not committed, with `./<path>` recorded as the URL so no machine path is
committed.

The ignored working files remain byte-for-byte at their exact original
parent-repository paths; final verification re-hashes each one and the workflow
has no code path that writes to an original. Independent recovery copies are
written under `<git-dir>/desktop-material/ignored-submodule-recovery/<run>/`,
outside the working tree, with a manifest, and are removed only after every
original passes final verification — any failure retains them and names the
directory in the error and in the UI.

Creating the local repository and submodule uploads no Cheap LFS object,
creates no provider repository, adds no remote, converts nothing into a
pointer, and pushes nothing; the dialog states each of those to the user before
the confirmation button and a source test asserts the module imports and
references none of that code. **Release/OCI storage selection, upload, pointer
conversion, remote creation, and push remain a separate explicit opt-in phase
which is not built.** Also still outstanding: merge to `main`, publication, and
headless screenshot acceptance. Focused coverage is 36/36 (9 pure planning, 22
real-Git, 5 dialog), `tsc` and configured ESLint are clean, and the behaviour
is documented in
[docs/features/repository-management/ignored-files-to-local-submodule.md](docs/features/repository-management/ignored-files-to-local-submodule.md).

## July 25 Repository list bulk actions — **Implemented on a branch, not merged**

The repository side sheet gained a multi-select mode: a checkbox per row, a
select-all that covers exactly the filter-visible rows, a selection-count bar,
and Escape or Clear to leave. The selection can fetch, pull, favorite or
unfavorite, assign or clear a custom group, and be removed from the list.
Fetch and pull are submitted one reviewed single-repository batch at a time
through the existing batch-sync path, so the store still revalidates every id
and applies its per-repository pull review; a determinate N-of-M progress row
shows each repository's status and can be cancelled between repositories, with
the in-flight repository always allowed to finish and the rest reported as not
started. Removing repositories is confirmation gated, names every repository,
and never deletes on-disk content. The picker is registered as its own audited
bulk surface with its safety exclusions. Details in
[HANDOFF.md](HANDOFF.md) and
[docs/features/repository-management/repository-list-bulk-actions.md](docs/features/repository-management/repository-list-bulk-actions.md).

## July 25 Cheap LFS cloud compression installs its own workflow — **Implemented on a branch, not merged**

A repository could have cloud compression switched on and still compress
nothing. Every entry point wrote the managed caller into the working tree and
then asked the user to commit and push it; GitHub Actions only sees committed
files, so the one step that made compression real was the step that silently
never happened. Enabling compression, opening the Large files manager, and the
automatic materialize pass now each detect a *committed* caller — never a
working-tree file — and, when one is missing, write the canonical workflow,
commit it with `Add Cheap LFS cloud compression workflow / 加入雲端壓縮工作流`,
and push it in the background without blocking whatever the user is doing.

Nothing that already exists is ever overwritten. A caller that differs from the
canonical one is reported through a non-blocking notice offering a confirm-class
one-click update; a file the app does not own is left completely alone. The push
reuses the existing batching machinery and its proofs — the remote tip is
asserted before the push and re-read from the remote afterwards — and reuses the
first-publish anchor when the branch has never been published. A branch that has
diverged from its remote is committed but deliberately not pushed, so a
background push can never publish local commits the user has not reviewed. The
one failure this provokes that nothing else does, GitHub refusing a
`.github/workflows` push without the `workflow` scope, is named explicitly with
its fix instead of being relayed as a raw refusal. Thirty tests cover every
detection and publish decision, the full-SHA action-pin contract, and an
end-to-end install against a real repository with a real local bare remote.

## July 25 Bundled-Git hooks, silent abort, and the 100k path cap — **Implemented, locally accepted**

Re-running the headless end-to-end against a build carrying the first-publish
fix (issue #38) proved the bootstrap push and the `EBUSY` race were gone and
exposed the next three defects. A repository with the stock Git LFS hooks could
not push at all under the app's bundled Git: hook interception asked Git to read
the hook's standard input from `/dev/stdin`, which the native Windows Git build
cannot open, so every intercepted hook died with exit 128 before the hook ran.
The payload is now written to a real file and that path is handed to Git, which
fixes every hook that reads standard input and also lets a hook script re-open
its own standard input under the bundled shell; separately, the app-generated
first-publish anchor push — a create-only publication the user never authored —
runs with `--no-verify`, while every reviewed push still runs hooks. A failed
anchor used to abort the commit with the reason recorded only in a log file, so
the commit button simply sprang back; the reason now reaches the per-file rows,
the commit terminal summary, and a persistent non-blocking notice in English and
Cantonese, with any credential-bearing Git text scrubbed first. Finally, the
batching adapter refused any repository over 100,000 paths, blocking a real
212,569-file publish; that ceiling is a memory bound only and is now 600,000,
derived from measured parse cost, with the raw-diff and path-inventory stdout
budgets raised in lockstep so they cannot silently become the real cap. The
per-batch 10,000-path and 1.4 GB ceilings are unchanged. Details in
[HANDOFF.md](HANDOFF.md).

## July 25 Cheap LFS anchor before the release review — **Implemented on a branch, not merged, not live-verified**

The third headless end-to-end pass (issue #38) left one defect. GitHub answers
the releases API with `[]` for a repository that has **no commits at all**, even
when releases exist on it, so the review a Cheap LFS commit acted on was not
stale but wrong: the anchor push un-hid the pre-existing buckets mid-flight and
the per-mutation review guard correctly aborted every in-flight upload. The
release route now guarantees a commit exists remotely *before* anything is
reviewed — bootstrapping one empty commit
(`Initialize repository for Cheap LFS / 開荒留名`, no invented file content) when
the local branch is unborn — then re-fetches the complete inventory, fingerprints
it, and only then pins. The guard stays fail-closed for every change after that
re-review, a capped or unreadable inventory yields no review rather than a false
one, and an already-published repository takes no extra review at all. The same
pass records the tracking ref and upstream the create-only anchor push does not
set, so the toolbar stops offering "Publish branch" for a branch it just
published. Committed on `fix/bootstrap-before-review`; a merge, a push, and a
fourth live end-to-end pass are still outstanding. Details in
[HANDOFF.md](HANDOFF.md).

## July 25 Cheap LFS first publish and push race — **Implemented, locally accepted**

A headless 200k-file end-to-end (issue #38) proved three defects on the release
storage route. Pinning during a commit created the bucket release against the
*local* branch name, so on a never-published repository GitHub answered
`422 Validation Failed` for every file; the release is now anchored by
publishing the branch tip first and re-reading the remote ref to prove it, and
every genuinely blocking condition refuses with an actionable reason instead of
retrying into another 422. The commit-batching snapshot's scratch index was
cleaned with an unconditional recursive delete that raced its own 14-second
`git add -A`, so a Windows `EBUSY` thrown from a `finally` masked the real error
and aborted the push before any network I/O; cleanup now waits for a live lock
to be released, never unlinks one, and never fails the operation. Per-file pin
failures now carry their provider status and sanitized reason into the commit
terminal rows, the summary, and the notification in English and Cantonese, so
`pinned 0 · failed 10` can no longer settle without a cause. An oversized GitHub
Actions response during the launch update check is also a handled, once-per-
session notice rather than a generic "background action stopped unexpectedly"
toast. Details in [HANDOFF.md](HANDOFF.md).

## July 24 trampoline token lifecycle — **Implemented, locally accepted**

A production log showed repeated `Tried to use invalid trampoline token`
rejections after a timed-out remote-HEAD refresh overlapped a submodule fetch,
surfacing as "a background action stopped unexpectedly" toasts and random Cheap
LFS failures on very large commits. Credential-trampoline tokens now live until
the Git process they were issued for actually exits rather than until the
promise that started it settles, and a command bearing a no-longer-valid token
is declined with a reply and a context-bearing warning instead of an unhandled
rejection that left Git wedged on an unclosed socket. Details in
[HANDOFF.md](HANDOFF.md).

## July 25 updater downgrade guard — **Implemented, locally accepted**

The reported 3.6.2 downgrade was traced to a stale local Squirrel bootstrapper
re-run (`--install . --checkInstall`), not the update feed and not a version
comparer; the live feed only ever advertised `3.6.3-beta3-zadtorqoxa`. As
defence-in-depth the app now refuses a feed whose highest entry is older than
the running build, and both release lanes filter the published `RELEASES` down
to this package at exactly this version.

## July 24 feature discoverability — **Implemented, pushed**

Buried features surfaced additively: six new command-palette commands (Sound
settings, GitHub API explorer with un-hide, tag lifecycle, Cheap LFS settings,
per-repo automation, Ollama chat), the Repository Settings tab relabelled
"Build, run & large files" with an explicit Cheap LFS section heading, and
settings-search entries for the Ollama manager/chat, global ignore, and Git
hooks. Deliberate skips (standalone Ollama tab, auto-fix toggle) are recorded
with reasons in [HANDOFF.md](HANDOFF.md). The standalone Ollama tab was
subsequently built and is no longer a skip — see the July 25 entry below.

## July 25 standalone Ollama settings tab — **Implemented, locally accepted**

Settings gains a real **Ollama** rail tab whose pane renders the Ollama model
manager and its chat workspace directly, with no dependency on Copilot access,
an account, or a Copilot licence. When no Ollama provider is configured the tab
shows a setup state — a loopback-validated endpoint field, a health-check
`Connect` action, and short guidance — instead of any Copilot sign-in content;
connecting persists the same managed provider record the Copilot provider
dialog creates, so both routes manage one endpoint. The palette's `Ollama model
manager` and `Ollama chat` commands and the Ollama settings-search results now
open this tab. The existing Preferences → Copilot → Providers route is
unchanged. Details in
[docs/features/integrations/ollama-model-manager.md](docs/features/integrations/
ollama-model-manager.md).

## July 26 dedicated Cheap LFS settings tab — **Implemented, locally accepted**

The Cheap LFS preferences (storage provider, auto-pin, auto-download,
parallel uploads, cloud-compression consent) moved from the combined
"Build, run & large files" tab into their own **Cheap LFS** tab in
Repository Settings, right after **Build & run** (which regained its plain
name). The shared `IBuildRunPreferences` model and Save flow are unchanged;
the palette command and the Large files manager's settings action now open
the new tab directly. Targeted suites 43/43 and 80/80, `tsc` clean; docs and
User Guide updated. Details in [HANDOFF.md](HANDOFF.md).

## July 24 mega wave — **Implemented, locally accepted**

Five backlog features built in parallel by isolated Opus agents, each
adversarially reviewed, then integrated: recorded narration wiring (the 243
bundled voice/melody assets now play at runtime with a serialized
non-overlapping queue and live-TTS fallback), distinct SFX event mapping
(push/fetch/pull and Build & Run phases each get their own motif), deterministic
repository-themed music (Git-backed persistence with localStorage migration),
safe Git auto-fix (classified auto/confirm/manual remediations, never
destructive automatically), and native large-repository handling
(gc/maintenance suppression across operations, stale-lock removal, explicit
status-computing state, missing-repo polling suspension, wired idle repack).
Plus: stash-inventory search with the full regex builder, and a responsive
contract that stops small dialogs clipping the regex builder. Details in
[HANDOFF.md](HANDOFF.md).

## July 24 settings search — **Implemented, locally accepted**

A search box in the Settings dialog rail filters a bilingual catalog of settings
by title, description, and keyword across every tab, highlights matches, badges
and dims tabs by match, and jumps to the owning tab on select. Reuses the shared
fuzzy/substring/regex filter control and regex builder (registered `preferences`
surface). Fully localized (English / Cantonese / bilingual), keyboard- and
screen-reader-accessible, tone-neutral. `tsc` clean; new filter/matching tests
15/15 with registry and i18n suites still green. Detail in
[HANDOFF.md](HANDOFF.md); feature doc under
`docs/features/identity-and-workspace/settings-search.md`.

## July 24 tab-strip overflow dropdown — **Implemented, locally accepted**

When the repository tab strip overflows, the tabs that no longer fit move into a
keyboard-accessible "more tabs" dropdown instead of clipping or scrolling
sideways. A contiguous run of tabs stays visible, the active tab is guaranteed
on screen, collapsed-group chips stay pinned, and every per-tab appearance
customization is preserved in both the strip and the dropdown rows. Split
geometry lives in a DOM-free, unit-tested module (`tab-overflow.ts`, 11 cases);
`npx tsc --noEmit` is clean. English/Cantonese/bilingual copy and docs shipped.

## July 24 optional audio system — **Implemented, locally accepted**

An opt-in, off-by-default audio layer: a bilingual (English + Cantonese) TTS
narrator, Web Audio synthesized sound effects, and per-repository looped music,
all gated in a new **Settings → Sound** pane. Event routing runs through the
in-app notification centre; a pure `decideAudioActions` enforces rate-limiting,
per-category cooldown, quiet hours, reduced-sound, and screen-reader
coexistence, with errors always clear and never suppressed. Narrator tone
scales with a per-language funny-level (1–5). `tsc` clean; 31 new unit tests
pass. Details in [HANDOFF.md](HANDOFF.md) and
[docs/features/design-system/audio-system.md](docs/features/design-system/audio-system.md).

## July 24 Local GitHub Actions runner — **Implemented, locally accepted**

A new **Repository ▸ Run actions locally…** dialog (and "Run Actions locally"
command-palette entry) discovers and parses a repository's `.github/workflows`,
feature-detects `act`+Docker with localized install guidance when either is
absent, and streams a chosen workflow/event/job run locally — supporting
`workflow_dispatch` inputs, per-run secrets (ephemeral `0600` `--secret-file`,
never logged or placed on the argv), a dry-run (`-n`) preview, and cancellation
with full container-tree teardown. Pure workflow-parsing and `act`-argv engines
are unit-tested (31 cases); `tsc` is clean. When a workflow contains a
release-upload step the dialog surfaces a guarded notice; a local run never
touches real releases.

- **Follow-up (planned):** a one-click, explicitly-confirmed "upload this run's
  produced artifact to the real GitHub Release" action reusing the account-bound
  `upload-release-asset` transfer boundary. See
  [docs/features/integrations/local-actions-runner.md](docs/features/integrations/local-actions-runner.md).

## July 24 batching dual caps, commit progress, and gc isolation — **Implemented and locally verified**

- Automatic commit batching now bounds every batch by **both** a file-count
  ceiling (10,000 files) **and** the 1.4 GB changed-blob byte ceiling, whichever
  is reached first. The legacy-history rebatching decision applies the same dual
  ceiling, so a local-only commit whose file count alone exceeds the cap is
  rebuilt into bounded batches even when its bytes fit, while a combined range
  that only crosses a ceiling in aggregate is pushed one existing tip at a time.
- Each committed batch is still pushed and proven at the remote tip before the
  next commit starts; a push failure aborts before the next batch. The existing
  gh-credential push fallback is unchanged and no `gh auth switch` is used.
- The Changes UI now surfaces detailed commit progress (stage, batch index/total,
  and cumulative files/bytes committed) instead of a generic "committing files"
  state, wired through the existing `commitOperationPhase`.
- Large batched commits, their staging, and their pushes suppress both auto-gc
  and background auto-maintenance (`-c gc.auto=0 -c maintenance.auto=false`) so a
  long repack never fires mid-batch and stalls the operation; a single
  best-effort `git repack -d` runs once after the whole sequence. Ordinary
  single-batch commits keep their normal maintenance behavior.
- Verified locally: `npx tsc --noEmit` clean for the changed files, Prettier
  clean, and green node:test suites — `commit-push-batching` (19), the mock
  `git/local-commit-batching` (24), `legacy local commit batching entry points`
  (8), and the real-Git `git/local-commit-batching-git` integration suite.

## July 23 cross-lane updater recovery — **Verified**

Commits `241cc90ce9` and `04246fdf12` moved both release lanes into one
Squirrel-monotonic alphabetic `z` namespace and removed the legacy comparer's
decimal `Int32` overflow. Exact-source CI `29977738533` and installer run
`29978844761` succeeded; the latter published six-asset exact-target Release
`v3.6.3-beta3-zadtberjmv`. A live installed
`3.6.3-beta3-s000000000201` build automatically downloaded and applied it.
Super Express run `29980281736` then published the greater same-SHA
`v3.6.3-beta3-zadtbhvdfc`, and the isolated legacy UI visibly progressed from
**Downloading update…** to **Quit and Install Update**. The detailed receipt is
in [HANDOFF.md](HANDOFF.md).

## July 23 Cheap LFS + push batching — **Live acceptance and serialization correction complete**

- A verified bug audit of the serialization change corrected three
  materialize-flow defects: canceling Materialize all now cancels queued
  batches repository-wide (an automatic restore enqueued by a concurrent fetch
  could previously restart the canceled downloads), the panel reports partial
  failures ("N materialized; M failed and were left as pointers.") from the
  batch summary instead of unconditional success, and a canceled batch reloads
  the pinned-file list so completed files never keep a stale pointer state that
  also suppressed Remove's local-deletion warning. Single-file cancels remain
  scoped to their own request.
- Cheap LFS commit preparation now exposes sanitized per-file phases, bytes,
  success/failure counts, and the selected-versus-recommended storage route in
  a compact terminal below Commit. A persisted default-on toggle permits up to
  three transfers; sequential mode remains available. Failed raw large files
  stay selected for retry while successful pointers and unrelated safe changes
  can commit, and the Changes filter can isolate files over 100 MiB.
- The repository rail's **Large files** page owns its vertical scroll so long
  pointer inventories remain reachable. Its direct settings action opens
  **Repository settings → Build & run**, where the storage provider, automatic
  pinning, transfer concurrency, clone/open materialization, and cloud policy
  live.
- Repository settings select published GitHub prereleases, GHCR, or Docker Hub.
  The registry modes publish the full repository object set as one logical OCI
  image within 4,096-object, 8,192-layer, and 8 MiB config/manifest proof
  bounds, create a new immutable manifest for each add/remove snapshot, reuse
  unchanged blobs, retention-tag every published digest, and point Git only at
  verified immutable digests. A timed-out layer is rebuilt at half the previous
  bound down to 8 MiB; accepted blobs are reused, but an incomplete immutable
  layer is never appended to.
- Verified-private source repositories encrypt each registry chunk with
  AES-256-GCM and intentionally share the key through the tracked private Git
  repository. The documentation calls out that this protects a registry-only
  leak, not anyone who can read the repository or its history. Private pointers
  bind the exact key id and the commit flow force-includes and proves that key.
  Commit-key path validation has one narrow legacy exception: it permits an
  otherwise Windows-hostile selected path only when a fresh, repository-bound
  status proves that exact path is deleted. Current nondeleted unsafe paths and
  real OCI pointers under control-plane paths remain fail-closed.
  Clone, pull, fetch, and open detection restores strict pointers by default,
  including old pointer-only clones; public registry and explicitly public
  GitHub.com Release restores can run while signed out.
- GHCR retains its documented 10 GB-per-layer and ten-minute transfer bounds;
  Docker Hub's changing plan, pull, storage, and fair-use limits remain provider
  policy rather than invented hard caps. The app recommends Git, Releases,
  private-source GHCR, or configured Docker Hub from the selected byte count
  without overriding the saved provider. Provider setup is a recommendation
  signal, not proof of live quota or organization policy. Same-provider updates
  retain existing Docker organization/collaborator targets; cross-provider
  migration requires exact materialized raws. A first public GHCR package fails
  before upload because GitHub creates it private; Releases, Docker Hub, or an
  already linked public package are the supported routes.
- Windows packaging pins ORAS 1.3.2 and ships its verified Apache-2.0 license.
  The ARM64 package currently depends on Windows 11 x64 emulation for that
  audited x64 binary. GitHub's OAuth scope reference grants package access to
  `write:packages`, while its registry page separately says PAT classic only;
  the non-mutating account challenge passed, but no live package mutation is
  claimed and a registry rejection fails closed.
- Ordinary Git changes are measured conservatively below a decimal 1.5 GB push
  ceiling, using a 1.4 GB changed-blob budget plus bounded path/proof overhead.
  Each batch is committed, durably checkpointed, pushed, and proven as the
  remote tip before the next commit exists; intent/pending transitions use
  atomic two-ref transactions. Push also detects
  older oversized local-only history: clean linear branches are protected by a
  compare-and-swap backup ref and safely rebuilt without force-push. Rebuilt
  batches preserve the reviewed message/final tree but receive new IDs, do not
  retain cryptographic signatures, and do not promise original author
  timestamps. App-owned
  commit commands use process-local `-c gc.auto=0` and validate HEAD so a valid
  commit followed by unrelated maintenance failure is reported once instead of
  duplicated.
- The public `codingmachineedge/bambu-build` acceptance exercised all
  **14,809,588,162 bytes and 8,305 payload files** through four UI-created,
  exact-SHA-proven batches. The first ordinary push received HTTP 408 and left
  its pending commit durable; the UI retry pushed that same immutable SHA before
  continuing. Cloud run `30048474438` processed the 13 Release objects one by
  one and reported **13 compressed, 0 kept raw, and 0 failed** while retaining
  all 13 raw originals, for 26 assets total. Final real-UI commit `712ad85`
  passed verifier run `30054805137` and published immutable manifest Release
  `bambu-build-verify-30054805137`.
- A fresh UI clone at `712ad85` restored all ten logical SHA-256 values while
  the committed Git objects remained 370–514-byte pointers. The first explicit
  Materialize-all action overlapped clone/open automatic materialization and
  reached two hash-identical CAS recovery copies. That integrity proof prompted
  repository-scoped serialization. The correction passes the affected
  disposable-Git concurrency and UI routing regressions; the promoted live
  ten-pointer inventory and separate 10/10 clone hashes preserve the real-UI
  evidence without misreporting a second multi-gigabyte rerun.

Focused local evidence passes **80/80** Release/OCI operations, **77/77**
registry transport/runtime cases, **117/117** disposable-Git batching cases,
**157/157** UI/settings/localization cases, **8/8** ORAS scripts, **19/19**
headless-verifier contracts, and **7/7** compact-shell style checks. The final
first-publication production build returned `0` after **400.46 seconds**
(**404.3 seconds wall**) and produced `out/renderer.css` with SHA-256
`6381556b36c295ba47ad90e8080f4079cbc61951bd7811ab9cb9fc3520638cb1`.
That is the historical initial `c3db37ea55` receipt. The corrected exact-source
build returned `0` after **390 seconds wall** (Yarn **387.64 seconds**) and
produced a 1,179,200-byte `out/renderer.css` with SHA-256
`6fba1434112ea5c02256a12e6ce8af42f5c870f0db5835155acb8075708d9d28`.

The promoted 1440×960 English Cheap LFS frame is 113,869 bytes with SHA-256
`3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333`.
All **36/36** named assertions, including `noBlockingDialog`, passed; one real
pointer selection settled the over-limit diff and the frame proves all three
worker rows. The final 640×960 bilingual frame is 85,175 bytes with SHA-256
`1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50`.
It also passed all **36/36** named assertions after one real pointer attempt,
kept the progress surface at y=942 inside the y=944 panel, and used only the
compiled source bundle with no diagnostic style injection.

The corrected compact Repository Releases proof ran at 100%, 125%, 150%, and
200% in one 960×660 physical viewport. The promoted 200% frame is 89,856 bytes
with SHA-256
`8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a`;
its 480×330 CSS viewport shows one complete 53.5 px release row, 24-hour `HH:mm`
timestamps, a wrapping bilingual disclosure, and no horizontal overflow. The
125% case now activates the 800×560 compact gate at 768×528 CSS; every compact
scale measures a 176 px panel, at least a 52 px row, 30 px target floors, a 9 px
text floor, three metric columns, and the latest card spanning two. Native Enter
expanded and collapsed the compact tools; available actions retained focus
semantics and the no-next-page pagination control remained correctly disabled.
The gallery source now contains **77** inspected images.

The historical initial combined changed suite passed **151/151**. The corrected
Releases style/localization/UI plus Pages contracts pass **55/55**. A final
152-test integrated rerun ran for 693 seconds without an observed failure, then
was stopped cleanly during the disposable-Git batching suite at the user's
explicit immediate-push request; no aggregate pass is claimed and the complete
rerun remains a handoff item.

The full Cheap LFS folder aggregate remains deliberately reported as
**261/262** only because one wall-clock policy case exceeded its harness budget
under concurrent heavy Git work; its isolated rerun passed **8/8**. The older
1,466.27-second build and its failed narrow attempt remain labeled as historical
interim evidence in the
[dated local receipt](docs/verification/cheap-lfs-commit-progress-2026-07-23.md).
Historical initial integration commit
[`c3db37ea55`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c3db37ea5524b91f9603151ae5d1107205f16a59)
is an ancestor of current corrective source
[`c22e29a03a`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c22e29a03ac14b01e35ab7b1434fa288bc794307),
which preserves every updater receipt commit. The responsive correction raises
the compact pane's text/control floors, lets bilingual disclosure copy wrap,
localizes its new controls, and widens the combined compact gate for 125%. Its exact-source build,
four-scale headless geometry/keyboard proof, original-pixel review, capture
promotion, and owned-resource cleanup passed locally. Cloud run `30055965804`,
CI `30055965807`, CodeQL `30055965809`, and Pages `30055965817` passed for exact
`c22e29a03a`; installer run `30057456712` published immutable six-asset
exact-target Release `v3.6.3-beta3-zadthusbjk`. The Bambu cloud, manifest
verifier, immutable manifest Release, and initial 10/10 fresh-clone hash proof
are complete; only the serialized-materialization rerun and final image remain
open.

## July 22 tab groups, command palette, and input/release reliability — **Implementation and publication verified**

- Named/color-coded group chips now show member counts and real expanded state;
  collapsing hides member tabs and the chip restores them by mouse, Enter, or
  Space. Group mutations announce their result and retain focus safely.
- Group definitions and collapse state survive tab opens/closes, bulk closes,
  imports, per-window persistence, legacy mirroring, reload, and unknown-field
  round trips. A group cannot cross the pinned/unpinned boundary. Portable
  session export intentionally omits profile-local group definitions and
  `groupId` memberships.
- Tab-group actions and the rich command-palette shell/rows/appearance editor
  now follow English, playful Hong Kong-style Cantonese, or bilingual mode.
  Palette density plus icon/group/keyword visibility remains persisted and
  repaired safely.
- Bare Alt uses an explicit one-press state machine, so repeats, other keys,
  modifiers, prevented events, modal transitions, and out-of-order releases do
  not leak into the next menu toggle.
- At this July checkpoint, Super Express ran unit and script suites before its
  build/package. The owner explicitly superseded that contract on August 2:
  the emergency lane now runs **zero tests** and goes directly to build,
  package, validation, and release; release pull requests still target `main`.
- The previously published baseline `7edca120c5` passed
  [CI `29895625564`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29895625564),
  [code scanning `29895625583`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29895625583),
  and [Build Installers `29896993449`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29896993449),
  which published
  [`v3.6.3-beta3-b0000040881`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000040881)
  with six required assets. Those are baseline receipts only. The current
  continuation's exact unpackaged production build passed through the fixed MCP
  endpoint, and off-screen interaction accepted the restart-restored collapsible
  group chip plus the fully visible rich-row palette editor. Two inspected
  1000×687 captures now appear in README, Pages, and wiki sources. Final source
  checkpoint `f7b4760a13894f0320f7b361f055f6fba40d913f` passed exact-source CI
  `29972351158`, CodeQL `29972351173`, and Pages `29972351147`; wiki commit
  `407cbf260c229e9f8e7fd86062afad83e5080f63` is synchronized, and installer run
  `29973527338` published six-asset Release `v3.6.3-beta3-b0000040887` from the
  exact tag.

## M27 — Reviewed pull previews — **Implementation, acceptance, and publication verified**

Toolbar and application-menu pulls now fetch first and open a blocking review
of the exact current/upstream refs and OIDs, ahead/behind topology, effective Git
integration strategy, and bounded incoming commit/file summaries. Confirmation
revalidates the frozen identity, strategy configuration, and clean worktree,
then integrates the reviewed upstream commit without a second superproject
fetch. Detached, dirty, conflicted, stale, failed-fetch, busy, and unsafe
fast-forward-only states remain non-destructive. Focused tests, TypeScript,
lint/format checks, the production build, and an isolated off-screen Win32 pull
exercise passed. Exact-source CI, CodeQL, Pages, synchronized wiki, and the
six-asset Windows x64 Release are verified for the `main` push recorded in
[HANDOFF.md](HANDOFF.md).

## M26 — Cheap LFS / Express Release — **Live cloud Actions/UI and source publication verified**

- **Release-backed large-file storage**: The repository rail's **Large files**
  manager can pin working-tree files over 100 MiB to GitHub Release assets,
  leaving small human-readable pointers at their tracked paths. Automatic pinning
  gates on commit entry points and downloads materialize detected pointers after
  clone, pull, user fetch, or open under one cancelable batch. Multi-gigabyte
  files are split into ordered raw parts of at most 500 MiB with whole-file and
  per-part SHA-256 verification. The manager lists and searches committed
  pointers, restores individually or all at once, and never requires browsing or
  decoding release asset names externally.
- **Cloud compression**: Public repositories receive an automatic reviewed
  caller. Private repositories remain off until explicit persisted consent;
  consent installs no private-repository workflow or private Actions cost and
  routes compression through the encrypted public builder. The SHA-pinned
  Action streams one Release object at a time directly to a
  raw-DEFLATE side asset, never uses Actions artifact/cache storage, updates
  only verified beneficial objects to v1 `part-deflate`, retains every raw
  historical asset, and leaves failed/non-beneficial pointers cloneable.
  Desktop Material is the only decompressor and verifies bounded expanded
  bytes locally. Focused real-action, policy, failure, UI, and materialization
  tests pass. The historical 2026-07-22 public/private production-UI caller
  commits triggered successful Actions runs that adopted 1,033-byte side assets,
  and both bot pointers restored locally to the exact original 1 MiB SHA-256. A
  preceding public draft-tag 404 also proved the raw pointer and asset remain
  usable after a failed run. Draft lookup is bounded to 10,000 releases; a
  missing bounded draft or a full 1,000-asset Release fails safely without
  pointer adoption.
- **Manual browser handoff**: When the trusted GitHub CLI path cannot complete
  safely, a browser-assisted upload handoff plans every remaining file, splits
  sources into ordered .partNNN files in a flat bounded folder, opens the
  Release editor and Explorer simultaneously, polls for uploads with bounded
  retry intervals, accepts only new exact-name/size assets, re-hashes every
  source before writing pointers, and records a version-2 manifest of original
  nested paths and flat asset ranges.
- **Super Express Release fast lane**: A workflow_dispatch-only emergency
  dispatcher checks out the exact SHA and creates one monotonic tag, then runs
  separate zero-test Windows x64 and registered self-hosted Linux x64 TUI
  packaging workflows in parallel. Preparation and publication also run on
  the registered Linux x64 WSL runner; no Super Express job uses a cloud
  runner. Each packaging workflow also exposes a direct, artifact-only
  workflow_dispatch action for recovery builds. The lanes restore the desktop
  dependency cache where
  needed, build the complete Windows/TUI payload, verify every asset, and
  preserve uncompressed lane artifacts. One publisher combines them into a
  uniquely tagged Release so the shared Squirrel update feed and TUI bootstrap
  URL never point at a half-release.
- **Cross-lane updater ordering**: Automatic and Super Express packages now use
  one validated `z` plus fixed-width, nine-letter base-26 GitHub run-ID
  namespace. It sorts above the legacy `b…`/`s…` lanes that stranded Super
  Express installations, keeps reruns deterministic, and avoids the legacy
  Squirrel `Int32` overflow caused by long numeric prerelease tails. Both
  workflows create
  immutable non-latest Releases, then revalidate current `main` and reconcile
  the greatest same-SHA version before promotion. No shared concurrency group
  cancels older work. Failed or cancelled main CI still retains a recoverable
  package artifact but cannot publish.
- **Build & Run integration**: "Pin large files before committing", "Upload up
  to three large files at once", and "Download large files after cloning" are
  enabled by default. A persisted storage-provider selector adds published
  prerelease, GHCR, and Docker Hub choices. The Large files surface is reachable
  from both the repository rail and Repository Tools hub.
- **Live GitHub and Desktop Material UI acceptance**: Retained public and
  private test repositories each contain pushed UI-created five-line pointers,
  draft-prerelease 1 MiB assets, and the generated Cheap LFS logo. Fresh clones
  resolved to the exact UI commits and retained pointers instead of Git LFS
  objects. The production app materialized and re-pinned both payloads through
  the Large files UI and native picker using an explicitly authorized temporary
  secure-store bridge that was deleted and verified absent after the runs. See
  the
  [dated receipt](docs/verification/cheap-lfs-github-public-private-2026-07-22.md).
- **Source publication receipt**: Exact checkpoint `f7b4760a13894f0320f7b361f055f6fba40d913f`
  passed CI, CodeQL, and Pages; the seven-page wiki is synchronized and the live
  gallery serves all 73 figures. The downstream installer workflow published
  latest Release `v3.6.3-beta3-b0000040887` from that exact tag with all six
  required Windows x64 assets.
- See the feature guide at
  [docs/features/repository-management/release-backed-cheap-lfs.md](docs/features/repository-management/release-backed-cheap-lfs.md).

## July 21 CI lint newline repair — **Local verification complete; remote verification pending**

- CI run `29879526652` failed its Lint job only because `opencode.json` lacked
  the final newline required by Prettier; no OpenCode setting or permission was
  changed.
- The full CI-equivalent `yarn lint` gate now passes locally. Exact-commit
  remote CI and installer Release verification remain pending.

## July 21 pull-preview and Cheap LFS hardening — **Locally verified**

- Reviewed pull previews now require fresh status, preserve one atomic raw
  strategy snapshot, stream a bounded changed-file parse, and keep busy/modal
  phase locks, accessibility state, and footer actions consistent. The accepted
  privacy-safe pull-preview screenshot is 960×660.
- Cheap LFS cancellation now requires confirmation. The GitHub CLI fallback
  streams uploads with bounded retry and reconciliation, verifies digests,
  redacts credential-bearing diagnostics, and uses 1 MiB chunks. Browser handoff
  staging creates only regular nonempty files through verified same-volume
  hardlinks or bounded copies—never symlinks—and recognizes verified partial
  uploads so a resumed handoff prepares only missing objects. Fresh and final
  complete Release inventories fence pointer publication.
- Exact commits `98bd712f2f` and `484ebc0210` correct overlapping Express
  Installer runs: every successful stale target publishes its own immutable
  Release, but it cannot steal Latest from current `main`. Publication uses a
  fresh promotion check with verified demotion instead of GitHub's lossy shared
  concurrency queue. A real failed upstream CI remains failed. The focused
  workflow contract passes **8/8**.
- The pre-integration Cheap LFS gate passes **189/189**, including **23/23**
  manual staging/resume checks. On the final rebased tree, expanded Cheap
  LFS/Release coverage passes **207/207** and pull-preview coverage passes
  **81/81**. TypeScript, configured targeted ESLint, Prettier,
  feature-document markdownlint, and diff integrity are green.
- The already published baseline Release
  [`v3.6.3-beta3-s000000000201`][release-s201]
  targets `fa4806971c` and contains all six required installer assets. It does
  not claim publication of the later hardening batch. At the user's direction,
  no future CI run is awaited for this batch and the GitHub Projects board is
  deliberately outside this completion scope.

[release-s201]: https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-s000000000201

## July 21 Settings queue and mobile connection — **Implementation complete; publication verification pending**

- **Settings → Clone queue**: Exposes the existing account-scoped automatic clone
  policy after the Clone dialog closes. Users choose an absolute base directory,
  parallel (up to three) or sequential mode, and the enabled state for every
  signed-in hosted account. Policies are stored by stable account identity with
  at most 32 entries per account, 5,000 seen URLs per policy, and a maximum of
  500 newly discovered repositories in one batch. Discovery continues after Settings
  closes without opening an unsolicited progress dialog.
- **Settings → Agent access → Open mobile connection page**: Available as a
  discoverable card in every mode, actionable only while Paired LAN mode is running.
  Each activation replaces the old code, opens a fresh five-minute one-use /connect
  link in the default browser, and keeps the secret in the URL fragment. The button
  stays disabled until paired mode is active.
- Both surfaces have explicit English, playful Hong Kong-style Cantonese, and compact
  bilingual copy, accessible labels/status, bounded failure behavior, and
  responsive-surface registration. Exact production build, off-screen interaction/
  screenshot acceptance, pushed-SHA CI, Pages/wiki sync, and Release verification
  remain to be recorded.

## July 21 responsiveness hardening — **Local implementation complete**

Publication verification is pending.

- Valid, locally resolvable remote defaults no longer trigger a potentially
  multi-minute online git remote set-head -a scan during background sync.
  Explicit fetches give discovery five seconds and process-tree cleanup one
  final five-second grace window, so a rename is detected even if the old
  target still exists and a missing child close cannot exceed the ten-second
  hard settlement bound. Clone cancellation retains strict full-close waiting.
  Missing, invalid, or dangling refs retain exact-account discovery.
- Concurrent environment preparation shares one in-flight proxy resolver per
  exact URL. Repeated timeout callers cannot multiply identical unresolved
  operating-system work; settled or failed entries are evicted.
- Concurrent GitHub, Git, and SSH credential prompts settle through one
  recoverable FIFO instead of allowing popup de-duplication or forced removal
  to strand a caller. Replaced popup owners receive one explicit replacement
  settlement; replacing sign-in state does not clear the new owner's flow.
- High-frequency appearance updates coalesce into one latest-value store
  mutation without crossing queued get() reads, flushes, or owner-history
  operations.
- Failed/cancelled Electron requests release their same-origin tracking entry,
  and unmounted sandboxed Markdown previews remove capture listeners, cancel
  deferred work, and release iframe references.
- Deterministic regressions cover a never-settling remote scan and terminator,
  late termination rejection, same-URL proxy coalescing, the strict clone
  barrier, every prompt family, a 500-update burst, failed request-ID reuse, and
  25 Markdown reloads.
  Exact rebased-source full tests, low-level-MCP production build, off-screen UI
  evidence, push, CI, Pages, wiki, and release receipts remain to be recorded.

## M25 — Repository-bound API functions — **Implementation complete; verification pending**

- Eligible GitHub repositories automatically receive a curated set of
  repository, issue, pull-request, release, and workflow read functions.
- Saved functions appear as runnable buttons in the API surface and in
  **Repository tools → API functions**; the raw REST/GraphQL catalog is now an
  advanced custom-function surface.
- The API rail item can be hidden per repository and restored from Repository
  tools. Mutations remain behind the existing exact-request review boundary.
- The feature guide is
  [docs/features/integrations/github-api-functions.md](docs/features/integrations/github-api-functions.md).

## Agent HTTP API — **Implemented** (part of M25–M26)

- Desktop Material ships an opt-in local agent server listening on 127.0.0.1 at
  a random port, with sessionless MCP JSON-RPC and REST compatibility surfaces.
- Three transport modes: **Local only** (loopback), **Paired LAN devices** (private
  IPv4 with five-minute one-use pairing codes and vault-backed tokens), and **YOLO
  LAN** (explicit confirmation, no auth, unsafe).
- HTTP routes include /api/v1/info, /api/v1/commands, legacy /api/v1/command/<name>,
  /mcp for sessionless MCP, /api/v1/remote/* for pairing status/devices, and
  /api/v1/remote/status for unauthenticated transport metadata.
- Version 1 command catalog covers discovery (list-accounts, list-repositories, etc.),
  repository selection (open-repository, select-repository, close-tab), clone and Git
  operations (clone, clone-batch, commit, fetch, pull, push, create-branch, merge-
  branch), automation (get-automation-status, run-automation, trigger-workflow), and
  named API functions. Built-in read functions appear as github_api_<name>.
- Concurrency is bounded to eight running plus 64 waiting requests with a 64 KiB body
  limit. Every POST requires Content-Type: application/json.
- See the feature guide at
  [docs/features/agent-api/local-agent-http-api.md](docs/features/agent-api/local-agent-http-api.md).

## Platform support

Desktop Material is Windows-only. The supported product gates are Windows
x64/arm64 builds, the Windows x64 full-unit and packaged-E2E lanes, and the
Windows x64 installer/portable-ZIP release workflow. macOS and Linux application
runtimes and packages are outside the roadmap; non-Windows runners may still
host platform-neutral repository automation.

## 2026-07-21 maintenance — Codex CLI build repair — **Implementation complete; integration verification pending**

Failed Build & Run stages and free-form repository requests can use Codex or
OpenCode, with a provider choice persisted per repository. Codex detection is
shell-free. Noninteractive work uses bounded stdin context, a workspace-write
sandbox, explicit per-run approval policy, ephemeral state, ignored user config
and rules, disabled lifecycle hooks, bounded streaming, and renderer-owned
process-tree cancellation. Trusted project Codex config remains part of the
repository trust boundary because Codex CLI 0.144 has no verified blanket MCP-
disable override. Installation and authentication stay explicit: the UI shows the
official npm package command and terminal login guidance, never asks for a
credential. Agent completion never implies success — Desktop Material reruns the
selected Build & Run profile unless the user cancels; **Stop** suppresses that
rerun. See the feature guide at
[docs/features/integrations/local-ai-build-fix.md](docs/features/integrations/
local-ai-build-fix.md).

## M24 — Guided sparse checkout — **Local acceptance complete; publication verification pending**

The existing bounded cone-mode sparse-checkout operation is now a persistent
**Choose/Adjust/Restore → Review selection** flow with search, fuzzy filtering,
preview counts, zero-match protection, and confirmed execution. Sparse files are
tracked alongside the normal commit history and survive repo moves. See the feature
guide at [docs/features/repository-management/sparse-checkout.md](docs/features/
repository-management/sparse-checkout.md).

## M23 — Full Ollama manager — **Complete; published**

A purpose-built local Ollama lifecycle workspace separates health/version, installed
inventory, running state, and selected-model details. Supports search/filter, streamed
pull with cancellation, copy and guarded rename, load/unload, and confirmed delete.
Synchronizes the authoritative installed inventory back to the provider's selectable
Copilot model list. Endpoint validation requires one terminal /v1, permits only an
exact loopback base, and rejects remote hosts, arbitrary prefixes, credential-bearing
URLs, queries, and fragments. See the feature guide at
[docs/features/integrations/ollama-model-manager.md](docs/features/integrations/
ollama-model-manager.md).

## M22 — Owner-scoped management and complete visual refresh (July 19–20, 2026) — **Implementation complete; visual acceptance in progress**

Owner-scoped appearance customization via anchored right-click editors. Each owner
stores one bounded versioned setting.json in its own local Git repository below the
app's ppearance-elements user-data root. The General Appearance page holds ordinary
preferences only; Repository Settings has no Appearance tab. Toolbar and typography
owners are separate with full font/color controls. Tab strip follows a guarded
organization contract with pinned tabs, inverse-close matching, drag/keyboard movement,
and stable sorts.

## M21 — Advanced workflow completeness (July 19, 2026) — **Complete**

M21 closes the 30 demand-backed workflow gaps identified in the July 19 research brief.
The canonical item-by-item map is at
[docs/features/github-desktop-demand-backlog.md](docs/features/github-desktop-
demand-backlog.md). Implementation extends existing account, repository, Git, provider,
store/dispatcher, and Material UI contracts without introducing a new application HTTP
endpoint.

## M20 — Platform wave (July 17–18, 2026) — **Complete**

Platform support hardened: Windows x64/arm64 builds, full-unit and packaged-E2E lanes,
installer/portable-ZIP release workflow.

## Ongoing maintenance

- The `build-installers.yml` workflow publishes exactly one uniquely tagged release after
  CI succeeds for every same-repository main push, including documentation-only pushes.
  Verify the exact SHA, CI gate, release target, and required non-empty assets for each
  final push.
- Keep account identity on endpoint#id; never collapse provider accounts by login or host
  alone.
- Keep profile settings, tab mutations, history operations, and multi-window updates on the
  serialized profile queue.
- Keep secrets out of profile/notification Git repositories, exports, logs, screenshots, and
  agent responses.
- Preserve Material token usage when adapting upstream or Desktop Plus code; do not import
  their branding or SCSS wholesale.
- A design token declared in more than one stylesheet is decided by import order, not by
  the file a reader opens first. `_variables.scss` and `_material.scss` both set the button
  tokens on `:root`; the Material layer is imported second and wins. Keep the two in step,
  and treat a "fix" applied to the losing declaration as a change that shipped nothing —
  `app/test/unit/button-token-test.ts` exists because exactly that happened.
- Every element that offers an appearance lock must also advertise its lock target in the
  DOM via `appearanceLockTargetProps`. A lock without the attribute is recorded, listed in
  the manager, and gates nothing. The guard's surface list is hand-written, so adding a
  lockable surface means adding its row in the same change.
- `commit.template` does not apply to `git commit -F`. Append the `Co-Authored-By` trailer
  to the message file explicitly, or a scripted commit silently drops it.

## Current maintenance acceptance

The following items track the current cycle's progress against all six acceptance gates:

<!-- markdownlint-disable MD013 -->

| Feature / Gate | Status | Key Evidence |
|---|---|---|
| Cross-lane automatic updater migration | **Complete; both release lanes and installed UI verified** | `241cc90` introduced the shared lane and `04246fdf` corrected the legacy integer-overflow boundary. CI `29977738533`, installer run `29978844761`, Super Express run `29980281736`, two six-asset exact-target `z…` Releases, automatic `s000000000201` migration, and the real download/ready UI are verified. |
| July 22 tab groups, palette, Alt, and release gates | **Complete; source publication verified** | Source contracts cover persistence, pin-boundary safety, portable-export stripping, three language modes, rich palette rows/appearance, deterministic bare-Alt sequencing, the then-current Super Express test-before-build contract, and release-PR `main` targeting. The production build and off-screen acceptance passed; source `f7b4760a13` passed CI, CodeQL, Pages, synchronized wiki publication, and exact-tag six-asset Release verification. The owner superseded only the emergency-lane test contract on August 2 with an explicit zero-test direct release path. |
| M26 Cheap LFS / Express Release | **Complete; live public/private UI and source publication verified** | Retained public/private repositories contain pushed UI-created raw pointers and exact 1 MiB draft-release assets. Public automatic setup and private explicit opt-in produced successful Actions runs `29969707165` and `29969957449`; each bot commit adopted a verified 1,033-byte `part-deflate` asset while retaining raw history. Both compressed pointers restored through the production UI to SHA-256 `30e14955…`; failed public run `29967844734` left its raw pointer cloneable and UI-materializable. Source `f7b4760a13` passed CI, CodeQL, Pages/wiki publication, cleanup audit, and exact-tag six-asset Release verification. |
| July 21 Settings queue and mobile connection | **Implementation complete** | Verified empty-account copy, persisted-policy hydration, required-directory validation, parallel/sequential changes, enable/disable dispatch, English/Cantonese/bilingual rendering, responsive-surface registration |
| July 21 responsiveness hardening | **Local implementation complete** | Deterministic regressions verified for remote scan terminator, late termination rejection, same-URL proxy coalescing, strict clone barrier, every prompt family, 500-update burst, failed request-ID reuse, and 25 Markdown reloads |
| M25 Repository-bound API functions | **Implementation complete** | Built-in function seeding verified; function-button execution tested; per-repository rail visibility persistence checked; responsive Explorer styles verified |
| Agent HTTP API | **Implemented** | All eight shipped route patterns audited; all 24 static command names verified; unit coverage spans REST forms, MCP discovery and calls, dynamic named functions, token rejection/rotation, Host/Origin policy, body limits, pairing expiry, device revocation, LAN mode boundaries, gateway policy, browser-link generation, unavailable-mode handling, queue bounds, shutdown, and redaction |
| M24 Guided sparse checkout | **Local acceptance complete** | Verified case-insensitive literal inverse-close matching, counts/preview/zero-match protection, pinned-tab safety, drag and keyboard movement, pin-group boundaries, stable one-shot label/opened/status sorts, persisted order, focus, announcements, and multi-window isolation. The current tab milestone also adds a reduced-motion-safe before/after drag preview and a bounded, persistent recently-closed tab history with restore/forget/clear actions; focused UI/store coverage is green, while the hosted Windows build remains the release gate. |
| Actions workflow-run cancellation | **Complete** | Verified exact repository/account/run revalidation, cancellable-status gating, one normal cancel request with duplicate suppression, accepted-response polling, stale and terminal transitions, bounded provider errors, focus return, and compact confirmation layout |
| Reviewed current-branch rebase | **Complete** | Verified target search, current→target and ahead/behind context, bounded commit preview, fresh dirty/conflict/operation guards, exact ref/SHA revalidation, cancel-before-start, conflict continue/abort routing, protected-branch guidance, and no automatic force push |
| Provider account binding and OAuth scope alignment | **Complete; Git transport routing verified locally** | Verified repository-settings binding propagation without reopening, unique-match auto-binding, explicit multiple-account choice, no-match/stale/permission/SSO recovery, generation safety, no silent replacement of a valid binding, and the bounded `repo user workflow notifications read:org` sign-in scope set. HTTPS fetch, pull, push, post-push refresh, scheduled sync, refspec fetch, and remote-HEAD routing now preserve the exact stable repository account key; unbound organization remotes prefer a verified write-capable identity and missing explicit bindings fail closed |
| Compact Repository Tools, Remote Manager, and Regex Builder | **Complete** | Verified vertical reachability at short heights; readable remote name/URL/control columns before a stacked fallback; reflowed Regex Builder categories/tokens with a scrollable body and reachable footer; named controls, focus, zoom, and no page-level horizontal overflow |
| Detailed Pull All progress | **Complete** | Verified live per-repository state, bounded concurrency, completion summary, keyboard/accessibility semantics, compact-window containment, focused and full-suite coverage, the exact production build, and inspected off-screen evidence on main |
| Clone-style Add Submodule | **Complete** | Verified hosted-provider and URL selection, exact-account affinity, reviewed relative path/branch, duplicate and occupied-path rejection, bounded progress, cancellation, list refresh, keyboard labels, and minimum-window containment |
| Repository-wide feature revalidation | **Complete** | The historical revalidation verified the registered-surface and M0–M19 implementation inventory, focused and repository-wide tests, production builds/packages, isolated headless interaction, exact-SHA CI and installer runs, Pages, the seven-page wiki, and its then-current 52-image documentation gallery |
| Live Bambu build Cheap LFS acceptance | **Remote storage, clone integrity, and serialization correction complete** | A public 14,809,588,162-byte, 8,305-file payload completed four proven UI batches after an HTTP 408 retry, cloud run `30048474438` reported 13/0/0 with raw fallback retained across 26 assets, UI commit `712ad85` passed verifier `30054805137`, and a fresh UI clone restored 10/10 hashes from 370–514-byte committed pointers. The first automatic/manual overlap prompted a normalized-checkout queue now covered by deterministic concurrency regressions; the live ten-pointer UI frame is promoted separately from the clone hash receipt. |
| Documentation gallery expansion | **86-scene Windows target assembled; picker implementation pushed; final hosted publication pending; historical evidence retained separately** | The published 77-scene history remains intact. Four upstream repository-list/tab scenes plus the accepted restore, app-hosted authentication, private-repository lock, updater-ready, History-hover, and Publish-organization captures established the current gallery. The machine-checked plan now declares 86 Windows targets: 66 canonical and 20 specialist outputs, including the accepted Publish organization picker frame and the dedicated dark bilingual repository-sheet owner. Every additional current-source replacement remains fail-closed until captured, inspected, and promoted. Five Linux/Xvfb captures remain byte-for-byte historical evidence outside its rows, Pages figures, and capture plan without making Linux a supported target. The legacy updater-migration frame stays pinned to its immutable July 22 blob. The distinct current-source updater-ready frame is accepted from runtime source `b069384ad7d8a65d1192ee06859a705fe484c9c8` and published by `e3967f1b81ec039624500797dca40a1ab6d98598`; its inspected 960×660 PNG is 47,086 bytes with SHA-256 `0fc9caf5b13eb5b914121090f403c394545e02ea4303b11dd4598afcb3a2dfca`. Publish organization implementation commit `63c1ec08c4f24f85d87f21d98851dcd5784c7800` is proven on `origin/main`; the retained receipt and regenerated parity input follow in the provenance correction push. Existing images remain in place unless a new deterministic capture passes original-resolution privacy inspection. Historical TUI correction commit `f555d374a6` is in `origin/main`; its lane results do not block the Windows product. |
| Complete notifications and Releases dashboard | **Complete** | Verified every GitHub notification page, confirmed local/remote Clear all with partial-failure retention, release status metrics and loaded-result search/filtering, rich asset metadata, scoped retries, responsive layout, and inspected headless evidence |

<!-- markdownlint-enable MD013 -->

## Acceptance gates

A roadmap or maintenance item is complete only when all applicable evidence is
present:

1. The implementation is reachable from a named UI, CLI, or agent workflow.
2. Focused tests cover success, failure, cancellation/stale state, and safety
   boundaries appropriate to the feature.
3. TypeScript, lint, formatting, repository-wide tests, and production build
   pass.
4. UI work passes desktop and compact-window keyboard, focus, screen-reader,
   scaling, overflow, and clipping checks.
5. Privacy-safe screenshots are inspected at original resolution and published
   in the relevant README, wiki, Pages, and tutorial surfaces.
6. The exact commit is pushed to main, remote CI/Pages are green, and any
   temporary branch/worktree is removed only after merge verification.

## Evidence index

- [PLAN.md](PLAN.md) — complete implementation ledger and architecture
  contracts.
- [HANDOFF.md](HANDOFF.md) — build, test, headless UI, screenshot, privacy,
  publication, and cleanup receipts.
- [Run manifests](.codex/run-manifests/) — exact milestone commands and capture
  records.
- [Feature gallery](docs/wiki/Feature-Gallery.md) — user-facing screenshot index.
