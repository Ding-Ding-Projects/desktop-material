# Linux TUI installation and packaging

> **Current release path:** the Linux TUI wheel, source distribution, locked
> runtime constraints, bootstrap, and installer are built and tested as release
> payloads. The Windows Electron packaging lanes remain separate.

## Runtime boundary

- x86-64 or ARM64 GNU/Linux with glibc (musl is not currently compatible with
  the required published RE2 wheel);
- a UTF-8 terminal with at least 80 columns; 100 or more is recommended;
- terminal mouse reporting for click and wheel interaction;
- network access to the project release and pinned upstream tool releases during
  installation.

The fresh-machine installer supplies Git, SSH, certificates, `gh`, `uv`, and a
managed Python 3.12 runtime. The TUI is pure Python except for the published
`google-re2` wheel. Installation fails rather than silently replacing RE2 with
Python's backtracking regular-expression engine.

## Contributor checkout route

The locked contributor path is:

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

Open a repository on startup:

```bash
uv run desktop-material-tui /path/to/repository
```

The short entry point is equivalent:

```bash
uv run dmt /path/to/repository
```

Useful non-interactive checks are:

```bash
uv run desktop-material-tui --version
uv run desktop-material-tui --help
```

`--theme dark|light|system` and `--language en|yue-HK|bilingual` are accepted
run-level choices. Persistent choices live in Settings.

## Fresh-machine installation route

Use the single copy-and-paste command in the repository's
[Install guide](../../readme-tabs/install.md#install-the-linux-tui-on-a-fresh-machine).
The command has no preinstalled developer-tool requirement: it detects the
native package manager and installs `ca-certificates` plus `curl` before running
the release bootstrap. The checked-in source of that bootstrap is
[`script/bootstrap-linux-tui.sh`](../../../script/bootstrap-linux-tui.sh); it
downloads the full installer to a bounded temporary file, validates its shell
header, and delegates the remaining work.

The full installer:

- supports `apt-get`, `dnf5`, `dnf`, `yum`, `zypper`, and `pacman`;
- uses root, `sudo`, or `doas` only for the fixed native package list;
- pins and verifies the supported `gh` archive by architecture and SHA-256;
- resolves a non-draft project release whose wheel and constraints carry
  GitHub-provided SHA-256 digests, then verifies size and digest again locally;
- installs into a user-owned `uv tool` environment and refuses path collisions
  with unrelated executables;
- writes one managed, replaceable `PATH` block to supported shell profiles;
- records owned paths so a repeat run is idempotent without claiming unrelated
  files;
- never asks for or embeds a credential.

Close and reopen the terminal so the updated `PATH` is loaded. Then run
`github` in the current repository or `github /path/to/repository`. Open and
Clone default their folder chooser to the process's current working directory.

From an existing trusted local checkout:

```bash
uv tool install ./tui
github /path/to/repository
```

The installed `github`, `dmt`, and `desktop-material-tui` commands are
identical launchers. The literal `github` alias is convenient and does not
replace GitHub CLI's `gh`. If another program or shell alias already owns that
name, use `dmt` or `desktop-material-tui` instead. From a repository:

```bash
github --help
github status --json
github push --dry-run
github pull --ff-only
github git status --short
```

The Open/Create dialog provides a clickable folder browser. Bracketed or
Textual clipboard paste immediately unwraps one matching pair of outer quotes;
submission applies the same normalization for typed paths and terminals
without bracketed-paste reporting. Direct `github push` and `github pull` are
Cheap-LFS-aware; the explicit `github git …` form passes other native Git argv
through. See
[Repository path browser and quoted paste](repository-path-browser.md) and the
[Cheap LFS Git wrapper](cheap-lfs-git-wrapper.md) for their exact contracts.

`pipx install ./tui` is an optional checkout route. A release wheel can
be installed with:

```bash
uv tool install ./desktop_material_tui-0.2.0-py3-none-any.whl
```

Do not download an artifact from an unrelated workflow or fork and present it
as a project release. The installer accepts only a complete payload attached to
a non-draft, non-prerelease release in the expected repository.

## Build and inspect packages

```bash
cd tui
uv build --clear
python -m zipfile -l dist/desktop_material_tui-0.1.0-py3-none-any.whl
```

The build produces:

- `desktop_material_tui-0.2.0-py3-none-any.whl`;
- `desktop_material_tui-0.2.0.tar.gz`.

The wheel must contain the console entry points, `py.typed`, the Python
packages, `ui/styles.tcss`, and the verified local dim-sum catalog. The source distribution additionally carries
tests, the locked environment, and the parity contract. Generated `dist/`,
virtual environments, bytecode, and coverage data are build outputs and are not
source.

## CI contract

The `Linux TUI` job in `.github/workflows/ci-linux.yml` runs on Ubuntu for the declared
Python matrix. Environments install from `uv.lock` and run the test suite. The
packaging lane additionally checks the generated parity contract, runs Ruff and
mypy, builds both distributions, installs the wheel into a fresh virtual
environment, checks its version entry point, and uploads the packages.

The release workflow attaches the wheel, source distribution, lock-derived
runtime constraints, `bootstrap-linux-tui.sh`, and `install-linux-tui.sh`. Its
clean Debian acceptance container runs the installer twice and verifies the
managed Python, `uv`, RE2, `gh`, `github`, `dmt`, and
`desktop-material-tui` commands after each pass.

A separate Windows Server 2022/Python 3.12 lane runs the non-PTY unit,
application, infrastructure, Cheap LFS, lint, and type-check core. It is a
cross-platform-core regression gate, not a claim that the Linux-first terminal
interaction or PTY acceptance runs on Windows. Both TUI lanes are additive.
They do not weaken or replace the Electron edition's Windows x64/arm64 build
and packaged Windows x64 E2E gates.

## Upgrade and uninstall

Upgrade a checkout installation by fetching a reviewed ref and repeating
`uv tool install --force ./tui`. For pipx, use
`pipx reinstall desktop-material-tui` from the same trusted source.

Remove the executable with `uv tool uninstall desktop-material-tui` or
`pipx uninstall desktop-material-tui`. Uninstalling the package deliberately
does not delete app data. Review the
[XDG paths](architecture-and-persistence.md) before removing configuration,
notification history, or version snapshots.

## Docker installation

The repository also provides a multi-stage, non-root container image. Build it
from the local checkout and launch it against a bind-mounted repository with
explicit persistent XDG volumes. Copy-paste commands, the mount map, credential
boundary, SELinux note, and failure modes are in the
[container guide](container.md).

## Failure modes

- `git` missing: repository validation and operations report an error; install
  Git and retry.
- `gh` missing or signed out: local Git stays available; the GitHub tab reports
  the missing prerequisite without opening a credential prompt.
- unsupported Python: the package installer refuses it.
- RE2 wheel unavailable for a platform: installation fails closed; do not
  substitute a different regex engine.
- `github` not found after installation: open a new terminal or source the
  installer-managed profile block. If another program or alias already owns
  `github`, use the identical `dmt` or `desktop-material-tui` launcher; the
  installer refuses to overwrite an unrelated executable.
- narrow terminal: content reflows and scrolls, but a terminal below the
  documented minimum may be impractical.
- wheel omits `styles.tcss`: packaged startup is a release blocker.
