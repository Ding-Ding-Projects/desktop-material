[Overview](../../README.md) · **Install** · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · [Roadmap & receipts](roadmap-and-receipts.md) · [Development](development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Supported platform

Desktop Material ships as a Windows desktop application and as a Linux-first
terminal application. The terminal package keeps the clickable Git and GitHub
workflows, repository tabs, file browser, responsive layout, and terminal-safe
counterparts of desktop features without requiring a graphical desktop.

# Install the Linux TUI on a fresh machine

Paste the following single command into a fresh glibc-based Linux installation.
It detects `apt-get`, `dnf5`, `dnf`, `yum`, `zypper`, or `pacman`; obtains root
through `sudo` or `doas` only for native packages; installs HTTPS certificates
and `curl` when missing; and then runs the bounded release bootstrap. The
bootstrap installs Git, SSH, terminal/editor helpers, a pinned user-owned Python
runtime, `uv`, GitHub CLI's `gh`, and Desktop Material TUI. It also adds the
user bin directory to supported shell startup files so `github`, `dmt`, `gh`,
and `desktop-material-tui` are on `PATH` in the next shell.

<!-- markdownlint-disable MD013 MD046 -->

```bash
sh -c 'set -eu; if ! command -v curl >/dev/null 2>&1; then p=; for x in apt-get dnf5 dnf yum zypper pacman; do if command -v "$x" >/dev/null 2>&1; then p=$x; break; fi; done; [ -n "$p" ] || { echo "No supported package manager was found." >&2; exit 1; }; s=; if [ "$(id -u)" != 0 ]; then if command -v sudo >/dev/null 2>&1; then s=sudo; elif command -v doas >/dev/null 2>&1; then s=doas; else echo "Installing curl requires root, sudo, or doas." >&2; exit 1; fi; fi; case "$p" in apt-get) $s env DEBIAN_FRONTEND=noninteractive apt-get -qq update; $s env DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends ca-certificates curl;; dnf5|dnf|yum) $s "$p" install -y ca-certificates curl;; zypper) $s zypper --non-interactive refresh; $s zypper --non-interactive install --no-recommends ca-certificates curl;; pacman) $s pacman -Syu --needed --noconfirm ca-certificates curl;; esac; fi; f=$(mktemp /tmp/desktop-material-tui-bootstrap.XXXXXX); trap "rm -f -- $f" EXIT HUP INT TERM; curl --proto =https --proto-redir =https --tlsv1.2 --fail --silent --show-error --location --output "$f" https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/bootstrap-linux-tui.sh; n=$(wc -c <"$f" | tr -d "[:space:]"); case "$n" in ""|*[!0-9]*) echo "Downloaded bootstrap size is invalid." >&2; exit 1;; esac; [ "$n" -le 1048576 ] && [ "$(sed -n 1p "$f")" = "#!/bin/sh" ] || { echo "Downloaded bootstrap failed validation." >&2; exit 1; }; sh "$f"'
```

The command is idempotent: running it again reuses verified matching tools and
refreshes the managed TUI installation. It never overwrites an unrelated
executable that already occupies one of its owned paths. ARM64 and x86-64 are
supported on GNU libc; musl distributions are rejected with an explicit
compatibility explanation because the required RE2 wheel is unavailable.

For an already-provisioned machine with `curl`, the shorter release bootstrap
is equivalent:

```bash
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/bootstrap-linux-tui.sh | sh
```

<!-- markdownlint-enable MD013 MD046 -->

Close and reopen the terminal afterward, then run `github` from inside a
repository or `github /path/to/repository`. The Open and Clone flows initially
select the process's current working directory, while their folder browser lets
you choose another destination without typing a path.

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

The release workflow builds a wheel and source distribution, derives a locked
runtime constraint file, installs the published payload in a clean Debian
container twice, and verifies all four launch commands before publication. The
[Linux TUI guide](../features/linux-tui/README.md) documents XDG persistence,
security boundaries, mouse and keyboard interaction, the file browser, Git
workflows, GitHub surfaces, and parity status. A tracked non-root image remains
available through the [container instructions](../features/linux-tui/container.md).

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
`--silent`, verifies the installed postcondition, and removes its controlled
temporary directory. Windows releases are permanently unsigned: packaging and
publication require the setup executable and MSI to report `NotSigned`, and the
release notes disclose that Windows may show SmartScreen or an unknown-publisher
warning. The script reports the unsigned status and stops on ARM64 until an
ARM64 asset is available. Review the script before running any remote command,
or use the
[latest release page](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest)
for a manual installer or portable-ZIP download. Extract the ZIP before running
the packaged executable. The focused archive/workflow contract is green; a
published baseline already contains the required installer, feed, and portable
ZIP assets. The updater-migration Releases additionally verify the complete
installer, feed, NuGet, MSI, and portable-ZIP payload on exact source
`04246fdf12`.

## Unattended current-user operations

The one-line command above performs the default `Install` operation. For an
explicit install, update, or uninstall, load the reviewed script as a script
block and pass the operation:

```powershell
$installer = [scriptblock]::Create((Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1'))
& $installer -Operation Install -InstallScope CurrentUser
& $installer -Operation Update -InstallScope CurrentUser
& $installer -Operation Uninstall -InstallScope CurrentUser
```

`Install` may refresh an existing complete installation; `Update` requires one;
and `Uninstall` succeeds without changing anything when Desktop Material is
already absent. Install uses the downloaded, digest-verified setup asset with
`--silent`. Update validates the native release asset and invokes the installed
updater against the immutable tag-specific feed with `--update=<url> --silent`,
so it preserves Squirrel's update semantics instead of doing a full reinstall.
Uninstall uses only the installed
`%LOCALAPPDATA%\GitHubDesktop\Update.exe` with `--uninstall --silent`.

`CurrentUser` is the only supported application scope. Squirrel's MSI is a
machine deployment bootstrapper that schedules a per-user setup at logon, not
an all-users application directory, so this script deliberately rejects
`AllUsers` instead of implying a scope the package does not provide. Mutating
operations also reject an elevated token before Squirrel can surface its
unsupported-elevation error; use a normal, non-administrator PowerShell. The
install path also preflights Squirrel's .NET Framework 4.5 minimum rather than
opening a framework installer or reboot prompt in unattended mode.

The script never force-closes the app. A running installed process or a partial
installation fails before mutation with a recovery instruction. Squirrel runs
hidden and must exit zero within 15 minutes; the expected installed or
removed postcondition must then appear within one minute. The returned receipt
records the operation, scope, child exit code, installation root, and resulting
executable path. Use `-ResolveOnly` to inspect the exact executable and argument
list without downloading or changing anything.

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
