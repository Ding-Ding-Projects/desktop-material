# Installing Desktop Material

Desktop Material has two distinct runtime surfaces. The graphical Electron
edition is supported on Windows only and publishes Windows x64 installers plus
a Squirrel update feed. The new Python/Textual terminal edition targets Linux;
it builds a wheel and source distribution and does not claim to be a Linux
Electron package.

## Linux terminal edition

From a trusted checkout with Python 3.10–3.13, Git, and
[uv](https://docs.astral.sh/uv/):

```bash
uv tool install ./tui
github /path/to/repository
```

The installed `github`, `dmt`, and `desktop-material-tui` commands are
identical TUI launchers. The literal alias does not replace GitHub CLI's `gh`.
If `github` already names another command or shell alias, use `dmt` or
`desktop-material-tui` instead. From a repository, inspect the launcher and
machine-readable status with:

```bash
github --help
github status --json
```

The locked contributor route remains:

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

`pipx install ./tui` is the corresponding isolated install route. GitHub
surfaces additionally require an installed and authenticated `gh` CLI.

CI builds `desktop_material_tui-0.1.0-py3-none-any.whl` and the corresponding
source distribution as a short-lived workflow artifact. No immutable Linux
Release asset is claimed until one is actually published. See the complete
[Linux TUI installation and packaging
guide](features/linux-tui/install-and-packaging.md).

For an isolated container installation, build the local wheel into the
non-root image:

```bash
docker build \
  --build-arg APP_UID="$(id -u)" \
  --build-arg APP_GID="$(id -g)" \
  --tag desktop-material-tui:local \
  ./tui
```

The complete [container guide](features/linux-tui/container.md) provides the
copy-paste interactive `docker run --rm -it` command, current-repository bind
mount, and persistent XDG config/data/state/cache volumes.

## Windows

From Windows PowerShell 5.1 or PowerShell 7, the verified current-user install
is:

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

The tracked script resolves this repository's latest release, verifies the
published GitHub SHA-256 asset digest and any Authenticode signature, installs
for the current user, and removes its temporary download. Current builds are
unsigned, which the script reports after digest verification.

For a manual installation, download one of these assets from the
[latest Ding-Ding-Projects release](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest):

- `GitHubDesktopSetup-x64.exe` installs for the current user.
- `GitHubDesktopSetup-x64.msi` provides the Windows Installer package for
  managed deployment.
- `GitHub.Desktop-x64.zip` is the portable package; extract it before running
  the packaged executable.

An unsupported architecture or a missing or unverifiable graphical-edition
release asset fails closed. Use a supported Windows x64 system or Windows
virtual machine for Electron; the Linux TUI is a separate interface and not a
compatibility mode for that binary.

## Data directories

- `%LOCALAPPDATA%\GitHubDesktop\` contains the installed application and
  retained update versions.
- `%APPDATA%\GitHub Desktop\` contains user-specific application data and is
  created on first launch.

## Log files

Application logs are stored below the user data directory in a `logs`
subdirectory, organized as `YYYY-MM-DD.desktop.production.log`.

Installer and updater diagnostics are stored in:

- `%LOCALAPPDATA%\GitHubDesktop\SquirrelSetup.log` for updates after install.
- `%LOCALAPPDATA%\SquirrelSetup.log` for the initial installation. This file
  may contain entries for other Squirrel applications, so focus on
  `GitHubDesktop.exe`.
