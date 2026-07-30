**Overview** · [Install](docs/readme-tabs/install.md) · [Features](docs/readme-tabs/features.md) · [Complete list](docs/readme-tabs/complete-feature-list.md) · [Screenshots](docs/readme-tabs/screenshots.md) · [Roadmap & receipts](docs/readme-tabs/roadmap-and-receipts.md) · [Development](docs/readme-tabs/development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Desktop Material

> **Local repair and background progress — July 30, 2026:** conflict and failed
> CI surfaces launch bounded Codex/OpenCode tasks; long work has hideable
> elapsed/ETA progress; Cheap LFS restore details collapse; and every action is
> directly searchable and executable from the command palette.

Desktop Material is an independent Material Design 3 (M3 Expressive) remake of [GitHub Desktop](https://github.com/desktop/desktop). It rebuilds the entire application shell around Material Design 3 while keeping GitHub Desktop's full Git workflow and the same underlying stack: [TypeScript](https://www.typescriptlang.org), [React](https://react.dev), [Electron](https://www.electronjs.org), and [Sass](https://sass-lang.com). This project is in active development.

> **Platform support:** Desktop Material is a Windows-only product. Its
> supported runtime, build, packaging, installer, release, and end-to-end
> acceptance paths are Windows: x64 installer/portable ZIP, x64/arm64 build
> validation, and packaged x64 E2E. The retained
> [Linux TUI prototype](docs/features/linux-tui/README.md), its package notes,
> and its five Xvfb captures are historical July 27 evidence only. They are not
> a supported product edition, a current release target, or a blocker for the
> Windows application.

<img
  width="1072"
  src="docs/assets/screenshots/material-app-identity-workspace.png"
  alt="Desktop Material workspace with a profile-customized app name and logo, a favorite repository tab, the Material navigation rail, and the Changes view"
/>

![CI](https://github.com/Ding-Ding-Projects/desktop-material/actions/workflows/ci.yml/badge.svg?branch=main)

> **Cheap LFS hook bypass and central diagnostics — July 29, 2026:** the
> app-authored cloud-compression workflow commit now runs against an owned,
> empty hooks directory, so a broken Git LFS post-commit hook cannot falsely
> fail it; normal user commits keep every configured hook. Desktop clients can
> also choose local, central, or dual logging through launch configuration.
> The authenticated, double-redacted
> [diagnostic service](docs/features/quality-and-reliability/central-diagnostic-logging.md)
> is live on the private Docker host with searchable agent APIs, operator-picked
> storage, bounded retention, and a browser dashboard.

> **Current close-out status — July 29, 2026:** the active issue-closing wave is
> merged locally with the Cheap LFS helper train and the Windows shutdown/profile
> persistence corrections, and remains in final verification. Its capture and
> publication contracts own exactly **84 current Windows scenes**; five earlier
> Linux/Xvfb files remain immutable historical evidence outside that set. The
> distinct current-source updater frame is now accepted and published from
> runtime source `b069384ad7d8a65d1192ee06859a705fe484c9c8` through promotion
> `e3967f1b81ec039624500797dca40a1ab6d98598`; it proves the real
> Electron/Squirrel event path with a disclosed verifier-owned inert payload,
> not a published updater payload. The complete local regression accounted for
> 873/873 files and 7,112 tests with zero failures; final-SHA remote CI and each
> issue's own runtime-closure evidence remain separate gates. The dated notes
> below are preserved chronology, not current blockers or issue states.

> **Cheap LFS long-name correction — July 28, 2026:** valid long Windows
> filenames now use bounded basename-independent recovery and materialization
> sidecars across Release, OCI, and generated clone hydration. Focused
> regressions pass **82/82**, including 255-unit tracked names. The separate
> Pull warning shown for already-materialized payloads is ordinary Git safety:
> back up those verified caches, return them to committed pointers, pull, and
> materialize again; do not pack multi-gigabyte caches into a Git stash.
> Final-tip build, push, CI, and installer proof remain pending.

> **Standalone Cheap LFS versus Git LFS atlas — July 28, 2026:** the
> [separate comparison page](https://ding-ding-projects.github.io/desktop-material/cheap-lfs-vs-git-lfs.html)
> maps **72 sourced differences in 12 categories**, with row-level receipts,
> provider-first and pre-push graphics, composable text/category/fit filters,
> a bounded worker-isolated regex builder, an interactive fit finder, and a
> dedicated six-stage `git push` proof. It does not pretend the pointer formats
> interoperate, and it gives Git LFS the advantage where standards,
> cross-platform support, locking, migration, caching, CI, and automation are
> the better fit. The assembled route passed 35/35 installed-Chrome checks at
> 1440×960 and 390×844; the exact local boundary and post-push publication
> status are recorded in the
> [dated receipt](docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/README.md).

> **Cheap LFS Pages guide — July 28, 2026:** the
> [product guide](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html)
> now pairs a provider-first `git push` walkthrough with a sourced, filterable
> 30-point Cheap LFS versus Git LFS comparison. It calls out the first-branch
> Release-anchor exception, distinguishes provider proof from remote branch
> proof, and gives Git LFS the win where its open ecosystem is the better fit.
> The Pages-only headless gate passed **46/46** across desktop and 390 px
> layouts; see the
> [verification receipt](docs/verification/cheap-lfs-pages-revamp-2026-07-28/README.md).

> **Measured responsiveness checkpoint — July 28, 2026:** the exact released
> baseline Windows build at `9bdfdb8b25` held every sampled idle frame below
> 17 ms, but twelve warmed Changes/History switches still took 56–104 ms and
> produced six long tasks. The navigation path was emitting an identical
> compare-form update after the real section change, forcing a second root
> render. Navigation and `AppStore` now suppress that no-op; focused
> responsiveness and adjacent lifecycle/lazy-loading coverage passed **42/42**
> at that source checkpoint. Exact post-fix release timing remains pending;
> this does not replace the close-out gates above.

> **Historical local reliability checkpoint — July 28, 2026 (superseded):**
> the root renderer now owns
> and releases its store/updater/drag/IPC subscriptions, telemetry and update
> polling timers, and global document/window handlers. Queued idle and
> animation-frame callbacks cannot restart work after unmount. Focused
> lifecycle tests passed **4/4** and changed-file ESLint was clean. That
> predecessor checkout stopped before compilation because its dependency tree
> was absent. This was a checkout-specific historical condition, not the
> current build blocker or current verification state.

> **Historical local implementation checkpoint — July 27, 2026
> (superseded):** #78 added optional
> AES-256-GCM encryption to GitHub Release-backed Cheap LFS payloads. Passwords
> are requested once per operation or, only when the user opts in, retrieved
> from the Windows credential vault; existing pointer formats remain compatible,
> plaintext legacy restores never prompt, and combined authentication/cleanup
> failures fail closed. #80 observes asynchronous push, fetch, and pull actions
> and keeps an invalid canonical remote visible as a yellow warning with a
> **Change remote URL** action. #83 restores independent persisted English and
> Cantonese funny-level sliders from 1–5. #81 and #82 are deliberately deferred
> to a later continuation. Local evidence is **194/194 focused tests** and
> **6768/6768 full tests across 831 files**, with TypeScript and `yarn lint`
> clean. #78, #80, and #83 remain open pending real built-app screenshots;
> packaged visual evidence and remote CI are not yet claimed.

> **Historical merged and published checkpoint — July 27, 2026:** Cheap LFS
> Release restores then
> open one bounded look-ahead lane at the exact 90% download point and expose
> detailed overall/file/part progress. Browser-bound links can also use a
> secure app-hosted tabbed browser with an explicit system-browser escape.
> Private repositories then kept a separate lock badge even when their leading
> repository glyph is a fork or custom logo. The final focused gate passed
> **760/760**, verifier contracts passed **14/14**, TypeScript was clean, the
> exact Windows production build completed successfully, and the real built
> app passed isolated off-screen English/bilingual interaction and privacy
> inspection. The source was merged and pushed through `2abccae8fd`; Pages and
> wiki publication went live. TUI correction commit `f555d374a6` is contained
> in `origin/main`; remote run `30317262582` passed its Linux TUI matrix and
> Windows TUI core job but failed overall in the unrelated Windows x64 unit
> job. Installer run `30318769692` failed and published no Release. Packaged
> Windows E2E was verified.
> See
> [Release-backed Cheap LFS](docs/features/repository-management/release-backed-cheap-lfs.md),
> the [app-hosted browser](docs/features/integrations/app-hosted-browser.md),
> and the [private-repository lock badge](docs/features/repository-management/private-repository-lock-badge.md).

![Detailed Cheap LFS restore progress with the current transfer at exactly 90% and the next transfer already active](docs/assets/screenshots/cheap-lfs-restore-lookahead.png)

![App-hosted browser showing redirect, popup, new-tab, bookmark, and private authentication behavior](docs/assets/screenshots/app-hosted-browser-authentication.png)

![Repository picker showing the separate lock badge for explicit private metadata](docs/assets/screenshots/private-repository-lock-badge.png)

![Dark repository side sheet with one compact Add, Select, and More action row](docs/assets/screenshots/material-repositories-sheet.png)

## Install on Windows

Desktop Material's automated releases provide a per-user x64 Windows installer.
Run this one line in Windows PowerShell 5.1 or PowerShell 7; it does not require
an administrator shell:

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

See the [Install tab](docs/readme-tabs/install.md) for asset verification, manual
downloads, and updater behavior.

## Historical Linux TUI prototype (unsupported)

The commands and behavior below preserve the July 27 prototype record. The TUI
is not a current supported package, runtime, release lane, or compatibility
commitment, and its tests or package status do not block the Windows product.
The repository retains the source and exact acceptance receipts for audit; do
not read this section as a current installation recommendation.

At that historical checkpoint, a trusted checkout could be installed as an
isolated tool and launched with the literal `github` command:

Linux shell, from a fresh parent directory:

<!-- markdownlint-disable MD013 -->

```bash
git clone https://github.com/Ding-Ding-Projects/desktop-material.git && cd desktop-material && uv tool install ./tui && uv tool update-shell
```

Windows PowerShell, from a fresh parent directory:

```powershell
git clone https://github.com/Ding-Ding-Projects/desktop-material.git; if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }; Set-Location .\desktop-material; uv tool install .\tui; if ($LASTEXITCODE -ne 0) { throw 'uv tool install failed' }; uv tool update-shell
```

<!-- markdownlint-enable MD013 -->

Both commands require Git and
[uv](https://docs.astral.sh/uv/getting-started/installation/). Close and reopen
the terminal afterward so the updated `PATH` is loaded, then run
`github /path/to/repository` on Linux or
`github C:\path\to\repository` on Windows. The interactive acceptance target
was Linux-first; the Windows Terminal launch path and cross-platform core were
also tested at that checkpoint.

`github`, `dmt`, and `desktop-material-tui` are identical launchers for this
terminal edition. This alias does not replace GitHub CLI's `gh`. If another
program or shell alias already owns `github`, use `dmt` or
`desktop-material-tui` instead. Noninteractive discovery and status work too:

```bash
github --help
github status --json
github push --dry-run
github push origin main
github pull --ff-only
github git log --oneline --decorate
```

`github push` runs a native dry-run, then scans safe working candidates and the
publication delta; an unprovable remote base safely falls back to all history
reachable from the pushed source refs. Native Git publishes nothing until that
passes. `github pull` runs native Git first and then restores canonical Cheap
LFS pointers with exact size/SHA-256 verification. The explicit `github git …`
form passes other native Git arguments through without a shell; see the
[wrapper contract](docs/features/linux-tui/cheap-lfs-git-wrapper.md).

The dated browser/wrapper milestone passed the full Windows-hosted TUI suite
(250 passed, 1 Linux-only skip in 182.76 seconds), its 29 focused path/browser
tests, and its 47 focused wrapper tests. Ruff lint/format, strict mypy for the
normal and explicit Linux targets, and package build are also green. A real
Debian/Xvfb/xterm run accepted the packaged Open dialog and fixture-backed
push/pull with an exact restored pointer/cache hash match. All three Windows
aliases resolve from the uv tool directory already on `PATH`, the Linux wheel
smoke reported the same aliases, and disposable cleanup is complete. The
remaining automated-versus-live evidence split is explicit in the
[dated run manifest](docs/verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md).

For development, run the locked project directly:

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

The prototype supported mouse clicks, a folder-only repository browser, safe quoted-path
paste, keyboard focus, editable single-line and multiline text controls, local
Git workflows, GitHub workflows through `gh`, shared RE2 search, localization,
notifications, and XDG persistence. It did **not**
claim all 201 graphical-edition capabilities; see the generated
[parity contract](tui/contracts/parity.yaml) and
[TUI documentation](docs/features/linux-tui/README.md).

The historical record also retained a minimal non-root Docker image; the
[container guide](docs/features/linux-tui/container.md) records its build and
interactive run commands.

The five dated Linux/Xvfb captures remain preserved in the
[historical TUI verification record](docs/verification/linux-tui-2026-07-27/run-manifest.md).
They are not presented as current Windows evidence and are excluded from the
84-scene guided gallery and its refresh plan.

## Explore the tabs

- **[Install](docs/readme-tabs/install.md)** — supported Windows installation plus the archived Linux TUI prototype record
- **[Features](docs/readme-tabs/features.md)** — the full Material Design 3 shell plus every Git and GitHub workflow
- **[Complete list](docs/readme-tabs/complete-feature-list.md)** — every feature in one bilingual table, labelled Added / Extended / Inherited against GitHub Desktop
- **[Screenshots](docs/readme-tabs/screenshots.md)** — the annotated capture gallery
- **[Roadmap & receipts](docs/readme-tabs/roadmap-and-receipts.md)** — milestone status and published CI/release evidence
- **[Development](docs/readme-tabs/development.md)** — build Desktop Material from source

## Project site & docs

- Project site: https://ding-ding-projects.github.io/desktop-material/
- Wiki: https://github.com/Ding-Ding-Projects/desktop-material/wiki

## Credits & License

Desktop Material is built on [GitHub Desktop](https://github.com/desktop/desktop) (MIT), with feature-parity references from [desktop-plus](https://github.com/desktop-plus/desktop-plus) (MIT). Thanks to both projects and their contributors.

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo designs. GitHub reserves all trademark and copyright rights in and to all GitHub trademarks. GitHub's logos include, for instance, the stylized Invertocat designs that include "logo" in the file title in the following folder: [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's Trademarks or registered Trademarks. When using GitHub's logos, be sure to follow the GitHub [logo guidelines](https://github.com/logos).
