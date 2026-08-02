#!/bin/sh
# shellcheck disable=SC2016

# Contract tests for the fresh-Linux TUI installer. Unit mode stubs every
# privileged operation and confines writes to a temporary HOME. Container mode
# performs the real install twice in a disposable Debian slim container.

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd "$(dirname "$0")" && pwd)
INSTALLER=$SCRIPT_DIRECTORY/install-linux-tui.sh
BOOTSTRAP=$SCRIPT_DIRECTORY/bootstrap-linux-tui.sh
PYTHON_COMMAND=${PYTHON_COMMAND:-python3}
SH_COMMAND=$(command -v sh)

command -v "$PYTHON_COMMAND" >/dev/null 2>&1 || {
  printf '%s\n' "python3 is required to run installer contract tests." >&2
  exit 1
}

DMT_INSTALLER_LIBRARY_ONLY=1
DMT_BOOTSTRAP_LIBRARY_ONLY=1
DMT_INSTALL_TEST_MODE=1
export DMT_INSTALLER_LIBRARY_ONLY DMT_BOOTSTRAP_LIBRARY_ONLY DMT_INSTALL_TEST_MODE
# shellcheck disable=SC1090,SC1091
. "$INSTALLER"
# shellcheck disable=SC1090,SC1091
. "$BOOTSTRAP"

TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/desktop-material-tui-installer-tests.XXXXXX")
TEST_TOTAL=0
ACTIVE_CONTAINER=''

cleanup_tests() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -n "$ACTIVE_CONTAINER" ]; then
    case "$ACTIVE_CONTAINER" in
      desktop-material-tui-installer-test-*)
        docker rm --force -- "$ACTIVE_CONTAINER" >/dev/null 2>&1 || true
        ;;
      *) status=1 ;;
    esac
  fi
  case "$TEST_ROOT" in
    "${TMPDIR:-/tmp}"/desktop-material-tui-installer-tests.*)
      rm -rf -- "$TEST_ROOT"
      ;;
    *) status=1 ;;
  esac
  exit "$status"
}
trap cleanup_tests EXIT HUP INT TERM

fail() {
  printf '%s\n' "FAIL: $*" >&2
  exit 1
}

pass() {
  TEST_TOTAL=$((TEST_TOTAL + 1))
  printf '%s\n' "ok $TEST_TOTAL - $*"
}

assert_equal() {
  actual_value=$1
  expected_value=$2
  assertion_label=$3
  [ "$actual_value" = "$expected_value" ] || \
    fail "$assertion_label: expected '$expected_value', got '$actual_value'"
  pass "$assertion_label"
}

assert_contains() {
  haystack=$1
  needle=$2
  assertion_label=$3
  printf '%s\n' "$haystack" | grep -F -- "$needle" >/dev/null 2>&1 || \
    fail "$assertion_label: '$needle' was absent"
  pass "$assertion_label"
}

assert_file_text() {
  file_path=$1
  expected_text=$2
  assertion_label=$3
  [ -f "$file_path" ] || fail "$assertion_label: missing $file_path"
  actual_text=$(cat "$file_path")
  assert_equal "$actual_text" "$expected_text" "$assertion_label"
}

expect_failure() {
  assertion_label=$1
  shift
  if ("$@") >"$TEST_ROOT/expected-failure.log" 2>&1; then
    fail "$assertion_label: command unexpectedly succeeded"
  fi
  pass "$assertion_label"
}

checksum_file() {
  "$PYTHON_COMMAND" - "$1" <<'PY'
import hashlib
import pathlib
import sys

print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

write_release_fixture() {
  fixture_mode=$1
  fixture_path=$2
  "$PYTHON_COMMAND" - "$fixture_mode" "$fixture_path" <<'PY'
import json
import pathlib
import sys
import urllib.parse

mode = sys.argv[1]
destination = pathlib.Path(sys.argv[2])
repository = "Ding-Ding-Projects/desktop-material"


def asset(tag: str, name: str, size: int, digest_character: str) -> dict[str, object]:
    return {
        "name": name,
        "browser_download_url": (
            f"https://github.com/{repository}/releases/download/"
            f"{urllib.parse.quote(tag, safe='')}/{urllib.parse.quote(name, safe='')}"
        ),
        "size": size,
        "digest": f"sha256:{digest_character * 64}",
        "state": "uploaded",
    }


def complete_release(tag: str, version: str) -> dict[str, object]:
    wheel_name = f"desktop_material_tui-{version}-py3-none-any.whl"
    constraints_name = f"desktop_material_tui-{version}-runtime-requirements.txt"
    return {
        "tag_name": tag,
        "draft": False,
        "prerelease": False,
        "assets": [
            asset(tag, wheel_name, 17, "a"),
            asset(tag, constraints_name, 19, "b"),
        ],
    }


if mode == "invalid-json":
    destination.write_text("{", encoding="utf-8")
    raise SystemExit(0)

selected = complete_release("release-9.9.0", "0.2.0")
if mode == "duplicate-wheel":
    selected["assets"].append(dict(selected["assets"][0]))
elif mode == "wrong-url":
    selected["assets"][0]["browser_download_url"] = "https://example.invalid/payload.whl"
elif mode == "missing-digest":
    selected["assets"][0].pop("digest")
elif mode == "oversize":
    selected["assets"][0]["size"] = 33_554_433
elif mode == "missing-constraints":
    selected["assets"] = selected["assets"][:1]
elif mode == "unsafe-tag":
    selected["tag_name"] = "release/path"
elif mode not in {"valid", "only-incomplete"}:
    raise SystemExit(f"unknown release fixture mode: {mode}")

draft = complete_release("draft-10.0.0", "0.3.0")
draft["draft"] = True
prerelease = complete_release("preview-10.0.0", "0.3.0")
prerelease["prerelease"] = True
incomplete = {
    "tag_name": "release-9.9.1",
    "draft": False,
    "prerelease": False,
    "assets": [],
}
older = complete_release("release-9.8.0", "0.1.0")
releases = [draft, prerelease, incomplete]
if mode != "only-incomplete":
    releases.append(selected)
releases.append(older if mode != "only-incomplete" else incomplete)
destination.write_text(json.dumps(releases), encoding="utf-8")
PY
}

capture_native_plan() {
  package_manager=$1
  (
    # shellcheck disable=SC2329
    run_privileged() {
      first_argument=1
      for command_argument in "$@"; do
        if [ "$first_argument" = '1' ]; then
          first_argument=0
        else
          printf ' '
        fi
        printf '%s' "$command_argument"
      done
      printf '\n'
    }
    install_native_dependencies "$package_manager"
  ) 2>/dev/null
}

capture_bootstrap_plan() {
  package_manager=$1
  (
    # shellcheck disable=SC2329
    bootstrap_run_privileged() {
      first_argument=1
      for command_argument in "$@"; do
        if [ "$first_argument" = '1' ]; then
          first_argument=0
        else
          printf ' '
        fi
        printf '%s' "$command_argument"
      done
      printf '\n'
    }
    bootstrap_install_curl "$package_manager"
  ) 2>/dev/null
}

test_architecture_and_libc() {
  assert_equal "$(normalize_architecture x86_64)" amd64 'x86_64 architecture'
  assert_equal "$(normalize_architecture amd64)" amd64 'amd64 architecture'
  assert_equal "$(normalize_architecture aarch64)" arm64 'aarch64 architecture'
  assert_equal "$(normalize_architecture arm64)" arm64 'arm64 architecture'
  expect_failure 'unsupported architecture' normalize_architecture riscv64

  check_glibc_version amd64 2.27 || fail 'amd64 glibc floor should pass'
  pass 'amd64 glibc floor'
  check_glibc_version arm64 2.26 || fail 'arm64 glibc floor should pass'
  pass 'arm64 glibc floor'
  expect_failure 'amd64 glibc below floor' check_glibc_version amd64 2.26
  expect_failure 'arm64 glibc below floor' check_glibc_version arm64 2.25
  expect_failure 'malformed glibc version' check_glibc_version amd64 2.x

  DMT_TEST_GLIBC_VERSION=2.39
  export DMT_TEST_GLIBC_VERSION
  assert_equal "$(detect_glibc_version)" 2.39 'test-only glibc detector override'
  unset DMT_TEST_GLIBC_VERSION
}

test_package_managers() {
  for package_manager in apt-get dnf5 dnf yum zypper pacman; do
    DMT_TEST_PACKAGE_MANAGER=$package_manager
    export DMT_TEST_PACKAGE_MANAGER
    assert_equal "$(detect_package_manager)" "$package_manager" \
      "$package_manager detection"
    packages=$(native_packages_for "$package_manager")
    for required_word in ca-certificates curl git tar gzip xterm xdg-utils; do
      assert_contains " $packages " " $required_word " \
        "$package_manager maps $required_word"
    done
    plan=$(capture_native_plan "$package_manager")
    assert_contains "$plan" "$package_manager" "$package_manager command plan"
  done
  unset DMT_TEST_PACKAGE_MANAGER
  expect_failure 'unsupported package manager override' unsupported_package_manager

  assert_contains "$(native_packages_for apt-get)" openssh-client 'apt OpenSSH package'
  assert_contains "$(native_packages_for dnf)" openssh-clients 'RPM OpenSSH package'
  assert_contains "$(native_packages_for pacman)" gcc-libs 'Arch libstdc++ package'
  assert_contains "$(capture_native_plan pacman)" '-Syu --needed --noconfirm' \
    'Arch avoids a partial upgrade'
}

unsupported_package_manager() {
  DMT_TEST_PACKAGE_MANAGER=apk
  export DMT_TEST_PACKAGE_MANAGER
  detect_package_manager
}

test_privilege_routes() {
  DMT_TEST_EUID=0
  DMT_TEST_HAS_SUDO=0
  DMT_TEST_HAS_DOAS=0
  export DMT_TEST_EUID DMT_TEST_HAS_SUDO DMT_TEST_HAS_DOAS
  assert_equal "$(resolve_privilege)" '' 'root privilege route'

  DMT_TEST_EUID=1000
  DMT_TEST_HAS_SUDO=1
  assert_equal "$(resolve_privilege)" sudo 'sudo privilege route'

  DMT_TEST_HAS_SUDO=0
  DMT_TEST_HAS_DOAS=1
  assert_equal "$(resolve_privilege)" doas 'doas privilege route'

  DMT_TEST_HAS_DOAS=0
  expect_failure 'missing privilege helper' resolve_privilege
  unset DMT_TEST_EUID DMT_TEST_HAS_SUDO DMT_TEST_HAS_DOAS
}

unsupported_bootstrap_package_manager() {
  DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER=apk
  export DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER
  bootstrap_detect_package_manager
}

test_bootstrap_contract() {
  DMT_BOOTSTRAP_TEST_MODE=1
  export DMT_BOOTSTRAP_TEST_MODE
  for package_manager in apt-get dnf5 dnf yum zypper pacman; do
    DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER=$package_manager
    export DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER
    assert_equal "$(bootstrap_detect_package_manager)" "$package_manager" \
      "bootstrap $package_manager detection"
    plan=$(capture_bootstrap_plan "$package_manager")
    assert_contains "$plan" ca-certificates \
      "bootstrap $package_manager installs CA certificates"
    assert_contains "$plan" curl "bootstrap $package_manager installs curl"
  done
  unset DMT_BOOTSTRAP_TEST_PACKAGE_MANAGER
  expect_failure 'bootstrap rejects unsupported package manager' \
    unsupported_bootstrap_package_manager

  DMT_BOOTSTRAP_TEST_HAS_CURL=1
  export DMT_BOOTSTRAP_TEST_HAS_CURL
  bootstrap_has_curl || fail 'bootstrap curl override should report available'
  pass 'bootstrap detects existing curl'
  DMT_BOOTSTRAP_TEST_HAS_CURL=0
  expect_failure 'bootstrap detects missing curl' bootstrap_has_curl
  unset DMT_BOOTSTRAP_TEST_HAS_CURL

  DMT_BOOTSTRAP_TEST_EUID=0
  DMT_BOOTSTRAP_TEST_HAS_SUDO=0
  DMT_BOOTSTRAP_TEST_HAS_DOAS=0
  export DMT_BOOTSTRAP_TEST_EUID DMT_BOOTSTRAP_TEST_HAS_SUDO \
    DMT_BOOTSTRAP_TEST_HAS_DOAS
  assert_equal "$(bootstrap_resolve_privilege)" '' 'bootstrap root route'
  DMT_BOOTSTRAP_TEST_EUID=1000
  DMT_BOOTSTRAP_TEST_HAS_SUDO=1
  assert_equal "$(bootstrap_resolve_privilege)" sudo 'bootstrap sudo route'
  DMT_BOOTSTRAP_TEST_HAS_SUDO=0
  DMT_BOOTSTRAP_TEST_HAS_DOAS=1
  assert_equal "$(bootstrap_resolve_privilege)" doas 'bootstrap doas route'
  DMT_BOOTSTRAP_TEST_HAS_DOAS=0
  expect_failure 'bootstrap missing privilege helper' bootstrap_resolve_privilege
  unset DMT_BOOTSTRAP_TEST_EUID DMT_BOOTSTRAP_TEST_HAS_SUDO \
    DMT_BOOTSTRAP_TEST_HAS_DOAS DMT_BOOTSTRAP_TEST_MODE

  assert_contains "$(capture_bootstrap_plan pacman)" '-Syu --needed --noconfirm' \
    'bootstrap Arch plan avoids a partial upgrade'

  valid_installer=$TEST_ROOT/bootstrap-valid-installer.sh
  printf '%s\n' '#!/bin/sh' 'exit 0' >"$valid_installer"
  bootstrap_validate_installer "$valid_installer"
  pass 'bootstrap accepts a bounded POSIX shell installer'

  empty_installer=$TEST_ROOT/bootstrap-empty-installer.sh
  : >"$empty_installer"
  expect_failure 'bootstrap rejects an empty installer' \
    bootstrap_validate_installer "$empty_installer"

  wrong_header_installer=$TEST_ROOT/bootstrap-wrong-header-installer.sh
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$wrong_header_installer"
  expect_failure 'bootstrap rejects an unexpected installer header' \
    bootstrap_validate_installer "$wrong_header_installer"

  oversized_installer=$TEST_ROOT/bootstrap-oversized-installer.sh
  "$PYTHON_COMMAND" - "$oversized_installer" "$BOOTSTRAP_MAX_INSTALLER_BYTES" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
limit = int(sys.argv[2])
path.write_bytes(b"#!/bin/sh\n" + b"#" * limit)
PY
  expect_failure 'bootstrap rejects an installer larger than 1 MiB' \
    bootstrap_validate_installer "$oversized_installer"
}

test_release_metadata() {
  release_json=$TEST_ROOT/releases.json
  release_fields=$TEST_ROOT/release-fields
  write_release_fixture valid "$release_json"
  parse_release_json "$PYTHON_COMMAND" "$release_json" "$release_fields"
  assert_file_text "$release_fields/version" 0.2.0 'latest complete TUI version'
  assert_file_text "$release_fields/tag" release-9.9.0 'latest complete release tag'
  assert_file_text "$release_fields/wheel_name" \
    desktop_material_tui-0.2.0-py3-none-any.whl 'exact wheel name'
  assert_file_text "$release_fields/constraints_name" \
    desktop_material_tui-0.2.0-runtime-requirements.txt 'exact constraints name'
  assert_file_text "$release_fields/wheel_size" 17 'bounded wheel size metadata'
  assert_file_text "$release_fields/wheel_sha256" \
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    'wheel GitHub digest metadata'

  for fixture_mode in duplicate-wheel wrong-url missing-digest oversize \
    missing-constraints only-incomplete invalid-json; do
    invalid_json=$TEST_ROOT/releases-$fixture_mode.json
    write_release_fixture "$fixture_mode" "$invalid_json"
    expect_failure "release metadata rejects $fixture_mode" \
      parse_release_json "$PYTHON_COMMAND" "$invalid_json" \
      "$TEST_ROOT/fields-$fixture_mode"
  done

  unsafe_json=$TEST_ROOT/releases-unsafe-tag.json
  unsafe_fields=$TEST_ROOT/fields-unsafe-tag
  write_release_fixture unsafe-tag "$unsafe_json"
  parse_release_json "$PYTHON_COMMAND" "$unsafe_json" "$unsafe_fields"
  assert_file_text "$unsafe_fields/version" 0.1.0 \
    'unsafe release tag is skipped for the older complete payload'
}

test_digest_and_size() {
  payload=$TEST_ROOT/payload.bin
  printf '%s' 'verified payload' >"$payload"
  payload_size=$(file_size "$payload")
  payload_digest=$(checksum_file "$payload")
  python_verify_file "$PYTHON_COMMAND" "$payload" "$payload_size" \
    "$payload_digest" 'test payload'
  pass 'matching size and SHA-256'
  expect_failure 'digest mismatch' python_verify_file "$PYTHON_COMMAND" \
    "$payload" "$payload_size" \
    ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
    'test payload'
  expect_failure 'size mismatch' python_verify_file "$PYTHON_COMMAND" \
    "$payload" 1 "$payload_digest" 'test payload'
  verify_bounded_file "$payload" "$payload_size" 'test payload'
  pass 'bounded non-empty file'
  expect_failure 'file exceeds bound' verify_bounded_file "$payload" 1 'test payload'
  empty_payload=$TEST_ROOT/empty.bin
  : >"$empty_payload"
  expect_failure 'empty payload rejected' verify_bounded_file "$empty_payload" 1 'empty'
}

test_local_payload_contract() {
  WORK_DIRECTORY=$TEST_ROOT/local-work
  mkdir -p "$WORK_DIRECTORY"
  export WORK_DIRECTORY
  local_source=$TEST_ROOT/local-source
  mkdir -p "$local_source"
  wheel_path=$local_source/desktop_material_tui-0.2.0-py3-none-any.whl
  constraints_path=$local_source/desktop_material_tui-0.2.0-runtime-requirements.txt
  printf '%s' wheel >"$wheel_path"
  printf '%s' constraints >"$constraints_path"
  local_fields=$TEST_ROOT/local-fields
  prepare_local_payload "$PYTHON_COMMAND" "$wheel_path" "$constraints_path" \
    "$local_fields"
  assert_file_text "$local_fields/version" 0.2.0 'local payload version'
  assert_file_text "$local_fields/wheel_name" \
    desktop_material_tui-0.2.0-py3-none-any.whl 'local payload wheel name'
  [ -f "$WORK_DIRECTORY/desktop_material_tui-0.2.0-py3-none-any.whl" ] || \
    fail 'local wheel was not materialized'
  pass 'local wheel materialized in temporary storage'

  mismatched=$local_source/desktop_material_tui-0.1.0-runtime-requirements.txt
  printf '%s' mismatch >"$mismatched"
  expect_failure 'mismatched local constraints filename' prepare_local_payload \
    "$PYTHON_COMMAND" "$wheel_path" "$mismatched" "$TEST_ROOT/mismatch-fields"
  expect_failure 'unsafe local filename' validate_local_filename '../payload.whl'
  expect_failure 'local override is test-only' local_override_without_test_mode
}

local_override_without_test_mode() {
  DMT_INSTALL_TEST_MODE=0
  export DMT_INSTALL_TEST_MODE
  require_test_mode 'Local payload override'
}

test_path_configuration() {
  profile_home=$TEST_ROOT/profile-home
  mkdir -p "$profile_home"
  HOME=$profile_home
  SHELL=/bin/bash
  export HOME SHELL
  printf '%s\n' 'export ORIGINAL_SETTING=kept' >"$HOME/.profile"
  printf '%s\n' '# existing bash configuration' >"$HOME/.bashrc"

  configure_path
  first_profile_checksum=$(checksum_file "$HOME/.profile")
  first_bash_checksum=$(checksum_file "$HOME/.bashrc")
  configure_path
  assert_equal "$(checksum_file "$HOME/.profile")" "$first_profile_checksum" \
    'profile PATH edit is idempotent'
  assert_equal "$(checksum_file "$HOME/.bashrc")" "$first_bash_checksum" \
    'bash PATH edit is idempotent'
  assert_equal "$(grep -F -c "$PATH_BLOCK_BEGIN" "$HOME/.profile")" 1 \
    'profile has one managed PATH block'
  assert_equal "$(grep -F -c "$PATH_BLOCK_BEGIN" "$HOME/.bashrc")" 1 \
    'bashrc has one managed PATH block'
  assert_contains "$(cat "$HOME/.profile")" 'ORIGINAL_SETTING=kept' \
    'profile preserves foreign content'

  configured_path=$(HOME=$profile_home PATH=/usr/bin:/bin "$SH_COMMAND" -c \
    '. "$HOME/.profile"; printf "%s\n" "$PATH"')
  case "$configured_path" in
    "$profile_home/.local/bin:"*) pass 'profile exposes ~/.local/bin first' ;;
    *) fail "profile did not expose ~/.local/bin first: $configured_path" ;;
  esac

  fish_home=$TEST_ROOT/fish-home
  mkdir -p "$fish_home"
  HOME=$fish_home
  SHELL=/usr/bin/fish
  export HOME SHELL
  configure_path
  fish_file=$HOME/.config/fish/conf.d/desktop-material-tui-path.fish
  fish_checksum=$(checksum_file "$fish_file")
  configure_path
  assert_equal "$(checksum_file "$fish_file")" "$fish_checksum" \
    'fish PATH edit is idempotent'
  assert_contains "$(cat "$fish_file")" 'set -gx PATH "$HOME/.local/bin" $PATH' \
    'fish PATH configuration'

  malformed_home=$TEST_ROOT/malformed-profile-home
  mkdir -p "$malformed_home"
  printf '%s\n' "$PATH_BLOCK_BEGIN" >"$malformed_home/.profile"
  expect_failure 'malformed managed PATH markers' rewrite_path_profile \
    "$malformed_home/.profile"
}

test_foreign_collisions_and_records() {
  BIN_DIRECTORY=$TEST_ROOT/collision-bin
  collision_state=$TEST_ROOT/collision-state
  managed_record=$collision_state/managed-paths-v1
  mkdir -p "$BIN_DIRECTORY" "$collision_state"
  export BIN_DIRECTORY

  printf '%s\n' '#!/bin/sh' 'exit 0' >"$BIN_DIRECTORY/github"
  chmod 0755 "$BIN_DIRECTORY/github"
  expect_failure 'foreign github launcher collision' \
    assert_tui_launcher_paths "$managed_record"
  write_managed_record "$managed_record" "$BIN_DIRECTORY/github"
  assert_tui_launcher_paths "$managed_record"
  pass 'recorded github launcher is replaceable'

  printf '%s\n' '#!/bin/sh' 'exit 0' >"$BIN_DIRECTORY/dmt"
  chmod 0755 "$BIN_DIRECTORY/dmt"
  expect_failure 'foreign dmt launcher collision' \
    assert_tui_launcher_paths "$managed_record"
  write_managed_record "$managed_record" "$BIN_DIRECTORY/github" "$BIN_DIRECTORY/dmt"
  record_checksum=$(checksum_file "$managed_record")
  write_managed_record "$managed_record" "$BIN_DIRECTORY/github" "$BIN_DIRECTORY/dmt"
  assert_equal "$(checksum_file "$managed_record")" "$record_checksum" \
    'managed ownership record is idempotent'

  foreign_gh=$BIN_DIRECTORY/gh
  printf '%s' foreign >"$foreign_gh"
  expect_failure 'foreign gh path collision' assert_replaceable_path \
    "$foreign_gh" "$managed_record" gh
}

run_unit_tests() {
  test_architecture_and_libc
  test_package_managers
  test_privilege_routes
  test_bootstrap_contract
  test_release_metadata
  test_digest_and_size
  test_local_payload_contract
  test_path_configuration
  test_foreign_collisions_and_records
  printf '%s\n' "1..$TEST_TOTAL"
  printf '%s\n' "Installer contract tests passed ($TEST_TOTAL assertions)."
}

absolute_existing_file() {
  requested_path=$1
  [ -f "$requested_path" ] || fail "container payload is missing: $requested_path"
  case "$requested_path" in
    /*) printf '%s\n' "$requested_path" ;;
    *) printf '%s/%s\n' "$(pwd -P)" "$requested_path" ;;
  esac
}

run_debian_container() {
  [ "$#" -eq 2 ] || fail '--debian-container requires a wheel and constraints file'
  command -v docker >/dev/null 2>&1 || fail 'docker is required for Debian container mode'
  wheel_file=$(absolute_existing_file "$1")
  constraints_file=$(absolute_existing_file "$2")
  wheel_name=$(basename "$wheel_file")
  constraints_name=$(basename "$constraints_file")
  expected_version=$(printf '%s\n' "$wheel_name" | \
    sed -n 's/^desktop_material_tui-\(.*\)-py3-none-any[.]whl$/\1/p')
  [ -n "$expected_version" ] || fail "unexpected wheel name: $wheel_name"
  [ "$constraints_name" = \
    "desktop_material_tui-$expected_version-runtime-requirements.txt" ] || \
    fail 'constraints filename does not match the wheel version'

  installer_file=$INSTALLER
  if command -v cygpath >/dev/null 2>&1; then
    installer_file=$(cygpath -aw "$installer_file")
    wheel_file=$(cygpath -aw "$wheel_file")
    constraints_file=$(cygpath -aw "$constraints_file")
    MSYS_NO_PATHCONV=1
    export MSYS_NO_PATHCONV
  fi

  ACTIVE_CONTAINER=desktop-material-tui-installer-test-$$
  export ACTIVE_CONTAINER
  docker run --detach --pull=always --name "$ACTIVE_CONTAINER" \
    debian:bookworm-slim sh -c 'while :; do sleep 3600; done' >/dev/null
  docker exec "$ACTIVE_CONTAINER" mkdir -p /payload
  docker cp "$installer_file" "$ACTIVE_CONTAINER:/payload/install-linux-tui.sh"
  docker cp "$wheel_file" "$ACTIVE_CONTAINER:/payload/$wheel_name"
  docker cp "$constraints_file" "$ACTIVE_CONTAINER:/payload/$constraints_name"
  docker exec \
    --env "DMT_WHEEL_NAME=$wheel_name" \
    --env "DMT_CONSTRAINTS_NAME=$constraints_name" \
    --env "DMT_EXPECTED_VERSION=$expected_version" \
    "$ACTIVE_CONTAINER" sh -c '
      set -eu
      export HOME=/root
      export DMT_INSTALL_TEST_MODE=1
      installer=/payload/install-linux-tui.sh
      wheel=/payload/$DMT_WHEEL_NAME
      constraints=/payload/$DMT_CONSTRAINTS_NAME

      sh "$installer" --local-wheel "$wheel" --local-constraints "$constraints"
      test "$(grep -F -c "# >>> Desktop Material TUI PATH >>>" "$HOME/.profile")" -eq 1
      profile_before=$(sha256sum "$HOME/.profile" | cut -d " " -f 1)
      mkdir -p "$HOME/.local/share/desktop-material-tui"
      printf "%s\n" keep >"$HOME/.local/share/desktop-material-tui/idempotency-sentinel"

      sh "$installer" --local-wheel "$wheel" --local-constraints "$constraints"
      profile_after=$(sha256sum "$HOME/.profile" | cut -d " " -f 1)
      test "$profile_before" = "$profile_after"
      test "$(grep -F -c "# >>> Desktop Material TUI PATH >>>" "$HOME/.profile")" -eq 1
      test "$(cat "$HOME/.local/share/desktop-material-tui/idempotency-sentinel")" = keep
      test ! -e "$HOME/.gitconfig"
      test ! -e "$HOME/.config/gh/hosts.yml"

      set +u
      . "$HOME/.profile"
      set -u
      case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) exit 1 ;; esac
      case "$(uv --version)" in "uv 0.11.26" | "uv 0.11.26 "*) ;; *) exit 1 ;; esac
      case "$(gh --version | sed -n "1p")" in "gh version 2.97.0 "*) ;; *) exit 1 ;; esac
      for launcher in github dmt desktop-material-tui; do
        test "$(command -v "$launcher")" = "$HOME/.local/bin/$launcher"
        test "$("$launcher" --version)" = "$launcher $DMT_EXPECTED_VERSION"
      done
    '
  docker rm --force -- "$ACTIVE_CONTAINER" >/dev/null
  ACTIVE_CONTAINER=''
  pass 'real Debian slim fresh install and idempotent rerun'
}

case "${1:---unit}" in
  --unit)
    [ "$#" -eq 0 ] || [ "$#" -eq 1 ] || fail '--unit accepts no payload arguments'
    run_unit_tests
    ;;
  --debian-container)
    shift
    run_debian_container "$@"
    ;;
  *)
    printf '%s\n' \
      'Usage: install-linux-tui-test.sh [--unit | --debian-container WHEEL CONSTRAINTS]' >&2
    exit 2
    ;;
esac
