# Linux TUI installation and packaging

## Requirements

- Linux with Python 3.10 through 3.13;
- Git on `PATH`;
- a UTF-8 terminal with at least 80 columns; 100 or more is recommended;
- terminal mouse reporting for click and wheel interaction;
- optional `gh` on `PATH` for GitHub features;
- optional `uv` or `pipx` for an isolated user install.

The TUI is pure Python except for the published `google-re2` wheel. Installation
must fail rather than silently replacing RE2 with Python's backtracking
regular-expression engine.

## Run from a checkout

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

## User installation

Git and [uv](https://docs.astral.sh/uv/getting-started/installation/) are
required. For a fresh Linux shell installation, clone the trusted repository,
install the isolated tool, and add uv's tool directory to future shells in one
line:

<!-- markdownlint-disable MD013 -->

```bash
git clone https://github.com/Ding-Ding-Projects/desktop-material.git && cd desktop-material && uv tool install ./tui && uv tool update-shell
```

The equivalent one-line Windows PowerShell installation is:

```powershell
git clone https://github.com/Ding-Ding-Projects/desktop-material.git; if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }; Set-Location .\desktop-material; uv tool install .\tui; if ($LASTEXITCODE -ne 0) { throw 'uv tool install failed' }; uv tool update-shell
```

<!-- markdownlint-enable MD013 -->

Close and reopen the terminal after either command so the updated `PATH` is
loaded. Then open a repository with `github /path/to/repository` on Linux or
`github C:\path\to\repository` on Windows. The fully interactive acceptance
target remains Linux; the Windows Terminal launch path and cross-platform core
are also tested.

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

`pipx install ./tui` is the corresponding pipx route. A wheel built by CI can
be installed with:

```bash
uv tool install ./desktop_material_tui-0.1.0-py3-none-any.whl
```

Do not download an artifact from an unrelated workflow or fork and present it as
a project release. The initial CI lane uploads the wheel and source distribution
as a short-lived `desktop-material-tui-python` workflow artifact; a signed or
immutable Linux release asset is not claimed until a release actually publishes
one.

## Build and inspect packages

```bash
cd tui
uv build --clear
python -m zipfile -l dist/desktop_material_tui-0.1.0-py3-none-any.whl
```

The build produces:

- `desktop_material_tui-0.1.0-py3-none-any.whl`;
- `desktop_material_tui-0.1.0.tar.gz`.

The wheel must contain the console entry points, `py.typed`, the Python
packages, and `ui/styles.tcss`. The source distribution additionally carries
tests, the locked environment, and the parity contract. Generated `dist/`,
virtual environments, bytecode, and coverage data are build outputs and are not
source.

## CI contract

The `Linux TUI` job in `.github/workflows/ci.yml` runs on Ubuntu for Python 3.10,
3.12, and 3.13. All three environments install from `uv.lock` and run the test
suite. Python 3.12 additionally checks the generated parity contract, runs Ruff
and mypy, builds both distributions, installs the wheel into a fresh virtual
environment, checks its version entry point, and uploads the two packages.

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
- `github` not found after installation: `uv tool update-shell` updates future
  shells, so open a new terminal or source the updated profile. Inspect the
  executable directory with `uv tool dir --bin`. If another program or alias
  already owns `github`, use the identical `dmt` or `desktop-material-tui`
  launcher.
- narrow terminal: content reflows and scrolls, but a terminal below the
  documented minimum may be impractical.
- wheel omits `styles.tcss`: packaged startup is a release blocker.
