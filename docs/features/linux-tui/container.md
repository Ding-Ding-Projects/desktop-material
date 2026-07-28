# Linux TUI container

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

Desktop Material TUI ships a minimal multi-stage `tui/Dockerfile` for users who
prefer an isolated Linux runtime. The builder creates a wheel from the local
checkout, installs dependency versions and hashes from `uv.lock`, and installs
that wheel into a dedicated virtual environment. The runtime contains Python,
Git, OpenSSH transport, the GitHub CLI, CA certificates, and the installed TUI;
build tools and checkout-only files do not cross into the runtime image.

The image is an alternative installation route for the terminal edition. It
does not contain or emulate the Windows-only Electron application.

## Build

Use a current Docker Engine with BuildKit and Linux-container support. From the
Desktop Material repository root on Linux:

```bash
docker build \
  --build-arg APP_UID="$(id -u)" \
  --build-arg APP_GID="$(id -g)" \
  --tag desktop-material-tui:local \
  ./tui
```

The UID and GID arguments make the unprivileged `dmt` account match the current
host user. This lets ordinary Git operations write to a bind-mounted working
tree without granting the application root privileges. The default is
UID/GID `1000` when the arguments are omitted.

The build context is allow-listed by `tui/.dockerignore`; Git history, local
virtual environments, tests, caches, and untracked credentials are not sent to
the builder.

## Persist XDG data

Create four named volumes once:

```bash
docker volume create desktop-material-tui-config
docker volume create desktop-material-tui-data
docker volume create desktop-material-tui-state
docker volume create desktop-material-tui-cache
```

- `desktop-material-tui-config` mounts at `/home/dmt/.config` and retains TUI
  and `gh` configuration.
- `desktop-material-tui-data` mounts at `/home/dmt/.local/share` and retains
  SQLite data plus isolated Git-backed profile history.
- `desktop-material-tui-state` mounts at `/home/dmt/.local/state` and retains
  application state, locks, and the runtime fallback.
- `desktop-material-tui-cache` mounts at `/home/dmt/.cache` and retains
  verified Cheap LFS objects plus any no-overwrite recovery files. Ordinary
  cache entries may be replaceable, but a reported recovery path is user data
  until it has been inspected or copied elsewhere.

The image deliberately declares no anonymous `VOLUME` entries. Every durable
mount is visible in the launch command, and `--rm` removes the stopped
container without deleting these named volumes.

## Run against the current repository

Change to the Git repository you want to manage, then run:

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

`-it` is required for keyboard, mouse, resize, and full-screen terminal
interaction. `--init` forwards signals and reaps any short-lived Git or `gh`
children. The final `/workspace` is passed through the image entry point as the
repository to open.

On an SELinux-enforcing host such as Fedora or RHEL, add the appropriate
bind-mount relabel option, commonly `:Z`, to the workspace mount after reviewing
the host's labeling policy:

```bash
--volume "$PWD:/workspace:Z"
```

## Git and GitHub configuration

The image includes `git`, `ssh`, and `gh`, but it does not copy host
credentials, SSH keys, agents, Git configuration, or the Docker socket.
Configure a repository-local Git identity or deliberately mount a reviewed
read-only Git configuration when commits need an identity.

GitHub features remain optional. Authentication retained by `gh` may live in
the config volume when no system credential service is available, so protect
that volume as sensitive application data. Do not bake tokens into the image,
Dockerfile, build arguments, command line, or repository. Authenticate through
the GitHub CLI's interactive flow without putting a credential in an argument:

```bash
docker run --rm -it \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --entrypoint gh \
  desktop-material-tui:local \
  auth login
```

The TUI's own bounded `gh` calls disable prompts so a background operation
cannot capture input unexpectedly. Local Git workflows continue to work when
`gh` is signed out.

### Noninteractive status and Cheap LFS

Reuse the selected repository and all four XDG volumes for CLI commands. A
small shell function keeps the examples readable without hiding any mount:

```bash
dmt_docker() {
  docker run --rm --init \
    --volume "$PWD:/workspace" \
    --volume desktop-material-tui-config:/home/dmt/.config \
    --volume desktop-material-tui-data:/home/dmt/.local/share \
    --volume desktop-material-tui-state:/home/dmt/.local/state \
    --volume desktop-material-tui-cache:/home/dmt/.cache \
    --workdir /workspace \
    desktop-material-tui:local "$@"
}
```

Inspect ordinary Git state and Cheap LFS pointers/candidates as JSON:

```bash
dmt_docker status --json
dmt_docker cheap-lfs status --json
```

Exercise the Cheap-LFS-aware native Git wrapper with the same writable
repository and persistent cache:

```bash
dmt_docker push --dry-run origin main
dmt_docker push origin main
dmt_docker pull --ff-only
```

The first command performs Git's native dry-run and the read-only Cheap LFS
preflight without publishing refs or downloading provider payloads. A real push
requires Git credentials or an SSH agent deliberately made available to that
container; the default example does not mount the host home, credential files,
or agent socket. Pull writes Git state and working files, and its post-pull
materialization uses the mounted cache. A missing cached object additionally
requires the scoped `gh` authentication described above. With a read-only
workspace mount, real push/pull or restoration fails rather than silently
escaping the mount boundary.

Review a Cheap LFS mutation before explicitly confirming the same command:

```bash
dmt_docker cheap-lfs track artifacts/model.bin --dry-run
dmt_docker cheap-lfs track artifacts/model.bin --yes --stage
```

The confirmed command can create or upload to an app-managed GitHub
prerelease. Authenticate with the interactive `gh auth login` command above
first. Do not delete `desktop-material-tui-cache` merely because Track finished:
its Cheap LFS recovery area may hold the reviewed original after the working
path becomes a pointer. The [Cheap LFS guide](cheap-lfs.md) documents pointer
compatibility, confirmation, one-hour transfer timeout, verification, and
recovery.

The container cannot launch a graphical editor on the host. Use terminal-owned
editing tools inside the container or run the native TUI when external-editor
integration is required.

## Security boundary

- The runtime process is the unprivileged `dmt` user.
- Only the selected repository and four named XDG volumes are mounted.
- No privileged mode, host networking, Docker socket, device, or home-directory
  mount is required.
- The workspace bind mount is writable because repository workflows modify
  files and Git metadata. Use a reviewed clone or a read-only mount when only
  inspection is intended; write workflows then fail closed.
- Network access is required only for remote Git and GitHub operations. Add
  `--network none` for a strictly local session.

## Failure modes

- **Permission denied in `/workspace`** — rebuild with the current host's
  `APP_UID` and `APP_GID`; do not solve the mismatch by running the image as
  root.
- **Existing named volumes are not writable** — they were likely created by an
  image with a different UID/GID. Reuse the original identity, migrate their
  ownership deliberately, or choose new volume names after preserving required
  data.
- **No mouse, colour, or resize events** — confirm `-it`, a mouse-reporting host
  terminal, and the documented `TERM`/`COLORTERM` values.
- **Repository is missing** — run from the intended repository and keep both
  the `$PWD:/workspace` mount and final `/workspace` argument.
- **`gh` reports signed out** — local Git is still available. Authenticate
  through a reviewed interactive path without embedding a token in the image.
- **SELinux denies the bind mount** — apply the host's reviewed bind-mount
  labeling policy.
- **The builder rejects `RUN --mount`** — enable the current BuildKit builder;
  the legacy Docker builder is not supported.
- **Base images or packages cannot be resolved** — the build needs outbound
  HTTPS access to the Python and uv registries plus Debian package mirrors.

## Verification

The Python test suite checks the static image and documentation contract. The
Python 3.12 CI lane also runs Docker's Dockerfile checks, builds the actual
image, verifies its non-root user and exact entry point, then executes:

```bash
docker run --rm desktop-material-tui:ci --version
```

The reported application version must match `tui/pyproject.toml`. A successful
wheel build alone is not treated as container evidence.
