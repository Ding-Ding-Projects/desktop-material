[Overview](../../README.md) · **Install** · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · [Roadmap & receipts](roadmap-and-receipts.md) · [Development](development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Install the Linux-first TUI

The terminal edition is a distinct Python/Textual package for Linux, not a
Linux Electron build. Install a trusted checkout and open a repository with the
literal launcher:

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

Both one-liners require Git and
[uv](https://docs.astral.sh/uv/getting-started/installation/). Close and reopen
the terminal afterward so the updated `PATH` is loaded, then run
`github /path/to/repository` on Linux or
`github C:\path\to\repository` on Windows. The interactive acceptance target
remains Linux-first; the Windows Terminal launch path and cross-platform core
are also tested.

`github`, `dmt`, and `desktop-material-tui` are identical launchers for the
terminal edition; the alias does not replace GitHub CLI's `gh`. If another
program or shell alias already owns `github`, use either longer name. Useful
noninteractive commands are:

```bash
github --help
github status --json
github push --dry-run
github pull --ff-only
github git status --short
```

Open/Create includes a clickable folder browser and safe quoted-path paste.
`github push` and `github pull` add Cheap LFS preflight/materialization, while
`github git …` preserves other native Git arguments without a shell. The
[Linux TUI guide](../features/linux-tui/README.md) links the detailed browser
and wrapper contracts.

`pipx install ./tui` is the corresponding isolated install route. The package
supports Python 3.10–3.13 and requires Git; provider surfaces also require an
authenticated `gh`. Contributors can instead use the locked project:

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

The CI lane builds a wheel and source distribution and smoke-installs the wheel
in a fresh environment. Current package, XDG, security, mouse/text-box, and
parity details live in the
[Linux TUI guide](../features/linux-tui/README.md).

Docker users can build the local wheel into the tracked non-root image and run
it interactively against the current repository with persistent XDG volumes.
See the copy-paste [container installation](../features/linux-tui/container.md).

# Install on Windows

Desktop Material's automated releases provide a per-user x64 Windows installer.
The Windows package command also creates `dist/GitHub Desktop-x64.zip`, and the
gated release workflow requires that portable archive beside the installer
assets. A successful main CI run enters packaging directly; a manual express
dispatch runs lint, Windows x64 trampoline/unit/script tests, and packaging in
parallel. The packaging
job preserves the complete payload as a short-lived Actions artifact before
attempting its create-only GitHub Release, so installers remain available when
publication alone fails. Run this one line in Windows PowerShell 5.1 or
PowerShell 7; it does not require an administrator shell:

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

The [tracked installer script](../../script/install-windows.ps1) asks GitHub for this
exact repository's latest stable installer release, accepts only the installer
for the native architecture, verifies its release-asset size and GitHub SHA-256 digest,
checks any Authenticode signature, runs the Squirrel installer silently with
`/S`, and removes its controlled temporary directory. The current release
workflow publishes unsigned x64 builds, so the script reports that status and
stops on ARM64 until an ARM64 asset is available. Review the script before
running any remote command, or use the
[latest release page](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest)
for a manual installer or portable-ZIP download. Extract the ZIP before running
the packaged executable. The focused archive/workflow contract is green; a
published baseline already contains the required installer, feed, and portable
ZIP assets. The updater-migration Releases additionally verify the complete
installer, feed, NuGet, MSI, and portable-ZIP payload on exact source
`04246fdf12`.

## Build and run from source

The same script can build Desktop Material from source instead of downloading a
release — a first-class path for contributors, air-gapped mirrors, or trying an
unreleased branch. Pass `-FromSource`:

```powershell
& ([scriptblock]::Create((Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1'))) -FromSource
```

or, from a local checkout of the script:

```powershell
./script/install-windows.ps1 -FromSource
```

The from-source path detects its prerequisites — **git**, **Node.js** (the
version pinned in `.node-version`), and **Yarn** (`corepack enable` provides it)
— and stops with a per-tool install hint when any is missing. It then
shallow-clones the repository into `<Documents>\desktop-material-source` (override
with `-SourceDirectory`), checks out `main` (override with `-SourceRef`), runs
`yarn install` and `yarn build:prod`, and launches the freshly built
`dist\GitHubDesktop-win32-<arch>\GitHubDesktop.exe`. Re-runs are idempotent: an
existing checkout is fast-forwarded with a shallow fetch and hard reset to the
chosen ref rather than re-cloned, and a non-empty directory that is not that
checkout is refused rather than overwritten. Every step prints its own progress
line and fails with the exact command and exit code.

Add `-DryRun` to `-FromSource` to print the resolved build plan — prerequisites,
the clone-versus-update decision, the ordered steps, and the launch path —
without cloning, building, or launching anything. That same pure decision logic
is covered by [`script/install-windows-test.ps1`](../../script/install-windows-test.ps1).
Building from source is unsigned and unversioned against the release feed, so the
Squirrel auto-updater does not manage a from-source build; re-run `-FromSource`
to update it.

When GitHub Actions is actively building or packaging a newer exact commit but
has not yet published its Release, the About updater reports **New update coming
soon** in the selected English, playful Hong Kong Cantonese, or bilingual mode.
The state is transient and fails closed; normal Squirrel update behavior resumes
on the next check after publication. Automated Release notes list bounded,
sanitized commit subjects from the previous installer release through the exact
release SHA. CI, installer, and Pages runs use unique groups so a newer
invocation never cancels or replaces older running or pending work. See
[Automated update build status and release
notes](../features/integrations/automated-updates-and-release-notes.md).
