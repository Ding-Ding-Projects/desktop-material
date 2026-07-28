# Desktop Material TUI

Desktop Material TUI is the Linux-first terminal edition of Desktop Material. It
provides real mouse-clickable controls, editable text fields, keyboard
navigation, responsive layouts, and safe Git and GitHub workflows without
requiring a graphical desktop.

The terminal edition targets workflow and data parity with the Electron
application. Terminal-owned concerns such as font family, font size, and image
protocol support remain under the terminal emulator's control.

Python 3.10 or newer is required. The interactive product is Linux-first; the
non-PTY CLI, Cheap LFS compatibility core, and Windows Terminal launch path are
also tested on Windows with Python 3.12. The Electron application remains the
full Windows GUI.

This `0.1.0` preview does not yet claim all 201 desktop capabilities. The
generated `contracts/parity.yaml` ledger marks 14 rows adapted, 53 partial, 132
not yet available, and 2 terminal-owned, with source evidence for every
non-default mapping.

## One-line install

These commands require Git and
[uv](https://docs.astral.sh/uv/getting-started/installation/). They clone the
trusted repository, install the TUI as an isolated user tool, and add uv's tool
directory to future shells.

Linux shell:

<!-- markdownlint-disable MD013 -->

```bash
git clone https://github.com/Ding-Ding-Projects/desktop-material.git && cd desktop-material && uv tool install ./tui && uv tool update-shell
```

Windows PowerShell:

```powershell
git clone https://github.com/Ding-Ding-Projects/desktop-material.git; if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }; Set-Location .\desktop-material; uv tool install .\tui; if ($LASTEXITCODE -ne 0) { throw 'uv tool install failed' }; uv tool update-shell
```

<!-- markdownlint-enable MD013 -->

Close and reopen the terminal after the command finishes so the updated
`PATH` is loaded, then launch a repository with
`github /path/to/repository` on Linux or
`github C:\path\to\repository` on Windows. The interactive product remains
Linux-first; its Windows Terminal launch path and cross-platform core are also
tested.

## Development quick start

```bash
cd tui
uv sync --extra dev
uv run desktop-material-tui
```

Open a repository directly:

```bash
uv run desktop-material-tui /path/to/repository
```

Install the reviewed checkout as an isolated tool:

```bash
uv tool install .
github /path/to/repository
```

`github`, `dmt`, and `desktop-material-tui` are identical launchers. The short
literal `github` command is convenient for this clone, but it may conflict with
another command already on `PATH`; use `dmt` or `desktop-material-tui` in that
case. Discover the complete scriptable CLI or request machine-readable status:

```bash
github --help
github -C /path/to/repository status --json
github -C /path/to/repository push --dry-run
github -C /path/to/repository push origin main
github -C /path/to/repository pull --ff-only
github -C /path/to/repository git log --oneline
```

The short `github push` and `github pull` forms are Cheap-LFS-aware wrappers.
Push blocks oversized safe working candidates or blobs in the publication
delta, conservatively falling back to all source-ref history when its remote
base cannot be proven. It never stages, commits, uploads, or rewrites history.
Pull runs native Git first and then restores canonical pointers through the
verified cache/provider path. `github git …` preserves other native Git argv
without invoking a shell. See the
[full wrapper contract](../docs/features/linux-tui/cheap-lfs-git-wrapper.md).

## Docker quick start

Build the minimal non-root image from the repository root. Matching the image
user to the Linux host keeps the bind-mounted working tree writable without
running the TUI as root:

```bash
docker build \
  --build-arg APP_UID="$(id -u)" \
  --build-arg APP_GID="$(id -g)" \
  --tag desktop-material-tui:local \
  ./tui
```

Create the persistent XDG volumes once:

```bash
docker volume create desktop-material-tui-config
docker volume create desktop-material-tui-data
docker volume create desktop-material-tui-state
docker volume create desktop-material-tui-cache
```

From the Git repository you want to manage, launch the fully interactive TUI:

```bash
docker run --rm -it --init \
  --name desktop-material-tui \
  --env TERM=xterm-256color \
  --env COLORTERM=truecolor \
  --volume "$PWD:/workspace" \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --volume desktop-material-tui-data:/home/dmt/.local/share \
  --volume desktop-material-tui-state:/home/dmt/.local/state \
  --volume desktop-material-tui-cache:/home/dmt/.cache \
  --workdir /workspace \
  desktop-material-tui:local \
  /workspace
```

`--rm` removes only the stopped container; the named volumes retain settings,
notification history, Git-backed profile history, and cache data. The bind
mount gives the container the same access to the current repository that the
host user has. See the [container guide](../docs/features/linux-tui/container.md)
for the safe interactive `gh` login command, SELinux, permissions, failure
modes, and verification.

The same image exposes the full scriptable CLI. Read-only JSON status works
with a read-only repository mount:

```bash
docker run --rm \
  --volume "$PWD:/workspace:ro" \
  --workdir /workspace \
  desktop-material-tui:local status --json

docker run --rm \
  --volume "$PWD:/workspace:ro" \
  --workdir /workspace \
  desktop-material-tui:local cheap-lfs status --json
```

Run the Cheap-LFS-aware native Git dry-run against the writable repository
mount, then use the same form for an authenticated push or pull:

```bash
docker run --rm --init \
  --volume "$PWD:/workspace" \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --volume desktop-material-tui-cache:/home/dmt/.cache \
  --workdir /workspace \
  desktop-material-tui:local push --dry-run origin main

docker run --rm --init \
  --volume "$PWD:/workspace" \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --volume desktop-material-tui-cache:/home/dmt/.cache \
  --workdir /workspace \
  desktop-material-tui:local pull --ff-only
```

Replace the final command with `push origin main` for a real publish. The
default container does not inherit host Git credentials, SSH keys, or an agent;
make only the required authentication available deliberately. Push preflight
never downloads Cheap LFS payloads. Pull may use the persistent cache or the
scoped `gh` login to materialize verified pointers, and therefore needs a
writable workspace.

Preview a Cheap LFS publication before allowing any mutation, then repeat the
same reviewed command with explicit confirmation:

```bash
docker run --rm \
  --volume "$PWD:/workspace" \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --volume desktop-material-tui-cache:/home/dmt/.cache \
  --workdir /workspace \
  desktop-material-tui:local cheap-lfs track artifacts/model.bin \
  --release-tag assets --repo OWNER/NAME --dry-run

docker run --rm \
  --volume "$PWD:/workspace" \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --volume desktop-material-tui-cache:/home/dmt/.cache \
  --workdir /workspace \
  desktop-material-tui:local cheap-lfs track artifacts/model.bin \
  --release-tag assets --repo OWNER/NAME --yes
```

Run `gh auth login` interactively inside a container that mounts the config
volume before a Release transfer. Keep the cache volume: it stores verified
content objects and retained recovery copies. Confirmed track and restore
transfers have no safe cancellation; the TUI blocks Quit until they finish or
the provider command reaches its one-hour timeout.

Run the test and quality gates:

```bash
uv run pytest
uv run ruff check .
uv run mypy src
```

Full installation, interaction, architecture, failure-mode, security, and
verification documentation lives in the repository's
[Linux TUI guide](https://github.com/Ding-Ding-Projects/desktop-material/tree/main/docs/features/linux-tui).
