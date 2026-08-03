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

The generated `contracts/parity.yaml` ledger tracks all 202 desktop
capabilities and records the exact terminal adaptation, partial boundary, or
remaining gap for each row. The ledger is an implementation contract, not a
claim that a terminal can reproduce desktop-only window chrome.

## One-line install

This single command is designed for a fresh glibc-based Linux installation with
no developer tools preinstalled. It supports `apt-get`, `dnf5`, `dnf`, `yum`,
`zypper`, and `pacman`; installs native dependencies with root, `sudo`, or
`doas`; then installs pinned user-owned copies of Python, `uv`, GitHub CLI's
`gh`, and the verified release wheel. It configures supported shell startup
files so `github`, `dmt`, `gh`, and `desktop-material-tui` are on `PATH` in the
next shell.

<!-- markdownlint-disable MD013 -->

```bash
sh -c 'set -eu; if ! command -v curl >/dev/null 2>&1; then p=; for x in apt-get dnf5 dnf yum zypper pacman; do if command -v "$x" >/dev/null 2>&1; then p=$x; break; fi; done; [ -n "$p" ] || { echo "No supported package manager was found." >&2; exit 1; }; s=; if [ "$(id -u)" != 0 ]; then if command -v sudo >/dev/null 2>&1; then s=sudo; elif command -v doas >/dev/null 2>&1; then s=doas; else echo "Installing curl requires root, sudo, or doas." >&2; exit 1; fi; fi; case "$p" in apt-get) $s env DEBIAN_FRONTEND=noninteractive apt-get -qq update; $s env DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends ca-certificates curl;; dnf5|dnf|yum) $s "$p" install -y ca-certificates curl;; zypper) $s zypper --non-interactive refresh; $s zypper --non-interactive install --no-recommends ca-certificates curl;; pacman) $s pacman -Syu --needed --noconfirm ca-certificates curl;; esac; fi; f=$(mktemp /tmp/desktop-material-tui-bootstrap.XXXXXX); trap "rm -f -- $f" EXIT HUP INT TERM; curl --proto =https --proto-redir =https --tlsv1.2 --fail --silent --show-error --location --output "$f" https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/bootstrap-linux-tui.sh; n=$(wc -c <"$f" | tr -d "[:space:]"); case "$n" in ""|*[!0-9]*) echo "Downloaded bootstrap size is invalid." >&2; exit 1;; esac; [ "$n" -le 1048576 ] && [ "$(sed -n 1p "$f")" = "#!/bin/sh" ] || { echo "Downloaded bootstrap failed validation." >&2; exit 1; }; sh "$f"'
```

<!-- markdownlint-enable MD013 -->

The installation is idempotent and refuses to replace unrelated executables in
its managed paths. Close and reopen the terminal after it finishes, then run
`github` from a repository or `github /path/to/repository`. The Open and Clone
flows begin at the current working directory and include a clickable folder
browser.

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
