#!/bin/sh

# Minimal bootstrap for a fresh Linux host. It installs only the HTTPS
# downloader prerequisites, fetches the full release installer, and delegates
# every package/runtime/PATH decision to that installer.

set -eu

BOOTSTRAP_INSTALLER_URL='https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/install-linux-tui.sh'
BOOTSTRAP_MAX_INSTALLER_BYTES=1048576

bootstrap_log() {
  printf '%s\n' "Desktop Material TUI bootstrap: $*" >&2
}

bootstrap_die() {
  printf '%s\n' "Desktop Material TUI bootstrap: $*" >&2
  exit 1
}

bootstrap_is_test_mode() {
  [ "${DMT_BOOTSTRAP_TEST_MODE:-0}" = '1' ]
}

bootstrap_has_curl() {
  if bootstrap_is_test_mode && [ -n "${DMT_BOOTSTRAP_TEST_HAS_CURL:-}" ]; then
    [ "$DMT_BOOTSTRAP_TEST_HAS_CURL" = '1' ]
    return
  fi
  command -v curl >/dev/null 2>&1
}

bootstrap_detect_package_manager() {
  if bootstrap_is_test_mode && [ -n "${DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER:-}" ]; then
    case "$DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER" in
      apt-get | dnf5 | dnf | yum | zypper | pacman)
        printf '%s\n' "$DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER"
        return
        ;;
      *) return 1 ;;
    esac
  fi
  for candidate in apt-get dnf5 dnf yum zypper pacman; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

bootstrap_resolve_privilege() {
  if bootstrap_is_test_mode && [ -n "${DMT_BOOTSTRAP_TEST_EUID:-}" ]; then
    if [ "$DMT_BOOTSTRAP_TEST_EUID" = '0' ]; then
      printf '%s\n' ''
      return
    fi
    if [ "${DMT_BOOTSTRAP_TEST_HAS_SUDO:-0}" = '1' ]; then
      printf '%s\n' sudo
      return
    fi
    if [ "${DMT_BOOTSTRAP_TEST_HAS_DOAS:-0}" = '1' ]; then
      printf '%s\n' doas
      return
    fi
    return 1
  fi

  if [ "$(id -u)" = '0' ]; then
    printf '%s\n' ''
  elif command -v sudo >/dev/null 2>&1; then
    printf '%s\n' sudo
  elif command -v doas >/dev/null 2>&1; then
    printf '%s\n' doas
  else
    return 1
  fi
}

bootstrap_run_privileged() {
  if [ -n "${BOOTSTRAP_PRIVILEGE_COMMAND:-}" ]; then
    "$BOOTSTRAP_PRIVILEGE_COMMAND" "$@"
  else
    "$@"
  fi
}

bootstrap_install_curl() {
  manager=$1
  bootstrap_log "installing ca-certificates and curl with $manager"
  case "$manager" in
    apt-get)
      bootstrap_run_privileged env DEBIAN_FRONTEND=noninteractive apt-get -qq update
      bootstrap_run_privileged env DEBIAN_FRONTEND=noninteractive \
        apt-get install -qq -y --no-install-recommends ca-certificates curl
      ;;
    dnf5 | dnf | yum)
      bootstrap_run_privileged "$manager" install -y ca-certificates curl
      ;;
    zypper)
      bootstrap_run_privileged zypper --non-interactive refresh
      bootstrap_run_privileged zypper --non-interactive install \
        --no-recommends ca-certificates curl
      ;;
    pacman)
      bootstrap_run_privileged pacman -Syu --needed --noconfirm ca-certificates curl
      ;;
    *) bootstrap_die "unsupported package manager $manager" ;;
  esac
}

bootstrap_download() {
  destination=$1
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location \
    --output "$destination" "$BOOTSTRAP_INSTALLER_URL"
}

bootstrap_validate_installer() {
  candidate=$1
  candidate_size=$(wc -c <"$candidate" | tr -d '[:space:]') || \
    bootstrap_die 'could not measure the downloaded installer.'
  case "$candidate_size" in
    '' | *[!0-9]*) bootstrap_die 'downloaded installer size is invalid.' ;;
  esac
  [ "$candidate_size" -gt 0 ] || bootstrap_die 'downloaded installer is empty.'
  [ "$candidate_size" -le "$BOOTSTRAP_MAX_INSTALLER_BYTES" ] || \
    bootstrap_die 'downloaded installer exceeds the 1 MiB safety limit.'
  [ "$(LC_ALL=C sed -n '1p' "$candidate")" = '#!/bin/sh' ] || \
    bootstrap_die 'downloaded installer does not have the expected shell header.'
}

bootstrap_main() {
  [ "$(uname -s)" = Linux ] || bootstrap_die 'this bootstrap supports Linux only.'
  if ! bootstrap_has_curl; then
    manager=$(bootstrap_detect_package_manager) || \
      bootstrap_die 'no supported package manager found.'
    BOOTSTRAP_PRIVILEGE_COMMAND=$(bootstrap_resolve_privilege) || \
      bootstrap_die 'installing curl requires root, sudo, or doas.'
    export BOOTSTRAP_PRIVILEGE_COMMAND
    bootstrap_install_curl "$manager"
  fi
  bootstrap_has_curl || bootstrap_die 'curl remained unavailable after installation.'

  installer=$(mktemp "${TMPDIR:-/tmp}/desktop-material-tui-bootstrap.XXXXXX")
  bootstrap_cleanup() {
    status=$?
    trap - EXIT HUP INT TERM
    case "$installer" in
      "${TMPDIR:-/tmp}"/desktop-material-tui-bootstrap.*)
        rm -f -- "$installer" || status=1
        ;;
      *) status=1 ;;
    esac
    exit "$status"
  }
  bootstrap_interrupted() {
    trap - EXIT HUP INT TERM
    case "$installer" in
      "${TMPDIR:-/tmp}"/desktop-material-tui-bootstrap.*)
        rm -f -- "$installer" || true
        ;;
    esac
    exit 130
  }
  trap bootstrap_cleanup EXIT
  trap bootstrap_interrupted HUP INT TERM

  bootstrap_download "$installer" || bootstrap_die 'installer download failed.'
  bootstrap_validate_installer "$installer"
  chmod 0700 "$installer"
  sh "$installer" "$@"
}

if [ "${DMT_BOOTSTRAP_LIBRARY_ONLY:-0}" != '1' ]; then
  bootstrap_main "$@"
fi
