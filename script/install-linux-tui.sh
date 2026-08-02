#!/bin/sh
# shellcheck disable=SC2016

# Desktop Material TUI fresh-Linux installer.
#
# The default path installs a verified release for the invoking user. Elevated
# access is used only for native packages; Python, uv, gh, and the TUI stay in
# the user's home directory. Set DMT_INSTALL_TEST_MODE=1 to allow the explicit
# local wheel/constraints overrides used by the repository's isolated tests.

set -eu

INSTALLER_VERSION=1
REPOSITORY='Ding-Ding-Projects/desktop-material'
RELEASES_API="https://api.github.com/repos/$REPOSITORY/releases?per_page=100"
UV_VERSION='0.11.26'
PYTHON_VERSION='3.12'
GH_VERSION='2.97.0'
GH_SHA256_AMD64='a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112'
GH_SHA256_ARM64='73ea440ecad9c9e284429997ee6f93577bc6f7bc6fba357ef62c53ad8fb641a5'
MAX_RELEASE_JSON_BYTES=4194304
MAX_WHEEL_BYTES=33554432
MAX_CONSTRAINTS_BYTES=4194304
PATH_BLOCK_BEGIN='# >>> Desktop Material TUI PATH >>>'
PATH_BLOCK_END='# <<< Desktop Material TUI PATH <<<'

log() {
  printf '%s\n' "Desktop Material TUI: $*" >&2
}

die() {
  printf '%s\n' "Desktop Material TUI installer: $*" >&2
  exit 1
}

is_test_mode() {
  [ "${DMT_INSTALL_TEST_MODE:-0}" = '1' ]
}

require_test_mode() {
  is_test_mode || die "$1 is available only when DMT_INSTALL_TEST_MODE=1."
}

normalize_architecture() {
  case "$1" in
    x86_64 | amd64)
      printf '%s\n' 'amd64'
      ;;
    aarch64 | arm64)
      printf '%s\n' 'arm64'
      ;;
    *)
      return 1
      ;;
  esac
}

version_at_least() {
  actual=$1
  required=$2
  awk -v actual="$actual" -v required="$required" 'BEGIN {
    split(actual, a, "."); split(required, r, ".")
    for (i = 1; i <= 3; i++) {
      av = (a[i] == "" ? 0 : a[i]) + 0
      rv = (r[i] == "" ? 0 : r[i]) + 0
      if (av > rv) exit 0
      if (av < rv) exit 1
    }
    exit 0
  }'
}

check_glibc_version() {
  arch=$1
  libc_version=$2
  case "$libc_version" in
    '' | *[!0-9.]* | .* | *.)
      return 1
      ;;
  esac
  case "$arch" in
    amd64) minimum='2.27' ;;
    arm64) minimum='2.26' ;;
    *) return 1 ;;
  esac
  version_at_least "$libc_version" "$minimum"
}

detect_glibc_version() {
  if is_test_mode && [ -n "${DMT_TEST_GLIBC_VERSION:-}" ]; then
    printf '%s\n' "$DMT_TEST_GLIBC_VERSION"
    return
  fi

  if command -v getconf >/dev/null 2>&1; then
    glibc_line=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
    case "$glibc_line" in
      'glibc '*)
        printf '%s\n' "${glibc_line#glibc }"
        return
        ;;
    esac
  fi
  if command -v ldd >/dev/null 2>&1; then
    ldd_line=$(ldd --version 2>&1 | sed -n '1p')
    case "$ldd_line" in
      *musl*) die 'musl Linux is not supported because google-re2 has no compatible wheel.' ;;
    esac
    libc_version=$(printf '%s\n' "$ldd_line" | sed -n 's/.* \([0-9][0-9]*\.[0-9][0-9.]*\)$/\1/p')
    if [ -n "$libc_version" ]; then
      printf '%s\n' "$libc_version"
      return
    fi
  fi
  die 'GNU libc could not be identified; musl and unknown libc implementations are unsupported.'
}

detect_package_manager() {
  if is_test_mode && [ -n "${DMT_TEST_PACKAGE_MANAGER:-}" ]; then
    case "$DMT_TEST_PACKAGE_MANAGER" in
      apt-get | dnf5 | dnf | yum | zypper | pacman)
        printf '%s\n' "$DMT_TEST_PACKAGE_MANAGER"
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

native_packages_for() {
  case "$1" in
    apt-get)
      printf '%s\n' 'ca-certificates curl git openssh-client libstdc++6 tar gzip vim xterm xdg-utils'
      ;;
    dnf5 | dnf | yum)
      printf '%s\n' 'ca-certificates curl git openssh-clients libstdc++ tar gzip vim-enhanced xterm xdg-utils'
      ;;
    zypper)
      printf '%s\n' 'ca-certificates curl git openssh libstdc++6 tar gzip vim xterm xdg-utils'
      ;;
    pacman)
      printf '%s\n' 'ca-certificates curl git openssh gcc-libs tar gzip vim xterm xdg-utils'
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_privilege() {
  if is_test_mode && [ -n "${DMT_TEST_EUID:-}" ]; then
    effective_uid=$DMT_TEST_EUID
    if [ "$effective_uid" = '0' ]; then
      printf '%s\n' ''
      return
    fi
    if [ "${DMT_TEST_HAS_SUDO:-0}" = '1' ]; then
      printf '%s\n' 'sudo'
      return
    fi
    if [ "${DMT_TEST_HAS_DOAS:-0}" = '1' ]; then
      printf '%s\n' 'doas'
      return
    fi
    return 1
  fi

  effective_uid=$(id -u)
  if [ "$effective_uid" = '0' ]; then
    printf '%s\n' ''
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    printf '%s\n' 'sudo'
    return
  fi
  if command -v doas >/dev/null 2>&1; then
    printf '%s\n' 'doas'
    return
  fi
  return 1
}

run_privileged() {
  if [ -n "${PRIVILEGE_COMMAND:-}" ]; then
    "$PRIVILEGE_COMMAND" "$@"
  else
    "$@"
  fi
}

install_native_dependencies() {
  manager=$1
  packages=$(native_packages_for "$manager") || die "Unsupported package manager $manager."
  log "installing native dependencies with $manager"
  case "$manager" in
    apt-get)
      run_privileged env DEBIAN_FRONTEND=noninteractive apt-get -qq update
      # Word splitting is deliberate: this is a fixed internal package list.
      # shellcheck disable=SC2086
      run_privileged env DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends $packages
      ;;
    dnf5 | dnf | yum)
      # shellcheck disable=SC2086
      run_privileged "$manager" install -y $packages
      ;;
    zypper)
      run_privileged zypper --non-interactive refresh
      # shellcheck disable=SC2086
      run_privileged zypper --non-interactive install --no-recommends $packages
      ;;
    pacman)
      # Never use `pacman -Sy`: a partial Arch upgrade is unsafe.
      # shellcheck disable=SC2086
      run_privileged pacman -Syu --needed --noconfirm $packages
      ;;
  esac
}

download_https() {
  url=$1
  destination=$2
  case "$url" in
    https://*) ;;
    *) die "Refusing non-HTTPS download URL: $url" ;;
  esac
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location \
    --output "$destination" "$url"
}

file_size() {
  wc -c <"$1" | tr -d '[:space:]'
}

verify_bounded_file() {
  path=$1
  maximum=$2
  label=$3
  size=$(file_size "$path")
  case "$size" in
    '' | *[!0-9]*) die "$label size is not numeric." ;;
  esac
  [ "$size" -gt 0 ] || die "$label is empty."
  [ "$size" -le "$maximum" ] || die "$label exceeds its $maximum-byte limit."
}

python_verify_file() {
  python_executable=$1
  path=$2
  expected_size=$3
  expected_digest=$4
  label=$5
  "$python_executable" - "$path" "$expected_size" "$expected_digest" "$label" <<'PY'
import hashlib
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
expected_size = int(sys.argv[2])
expected_digest = sys.argv[3].lower()
label = sys.argv[4]
if not re.fullmatch(r"[0-9a-f]{64}", expected_digest):
    raise SystemExit(f"{label} expected digest is invalid")
payload = path.read_bytes()
if len(payload) != expected_size:
    raise SystemExit(f"{label} size {len(payload)} does not match {expected_size}")
actual = hashlib.sha256(payload).hexdigest()
if actual != expected_digest:
    raise SystemExit(f"{label} SHA-256 {actual} does not match {expected_digest}")
PY
}

install_uv() {
  bin_dir=$1
  uv_path=$bin_dir/uv
  if [ -e "$uv_path" ] || [ -L "$uv_path" ]; then
    installed=$($uv_path --version 2>/dev/null || true)
    case "$installed" in
      "uv $UV_VERSION" | "uv $UV_VERSION "*)
        log "reusing uv $UV_VERSION"
        printf '%s\n' "$uv_path"
        return
        ;;
      *) die "Foreign or unsupported executable already occupies $uv_path." ;;
    esac
  fi

  installer=$WORK_DIRECTORY/uv-install.sh
  download_https "https://astral.sh/uv/$UV_VERSION/install.sh" "$installer" || \
    die 'uv installer download failed.'
  verify_bounded_file "$installer" 2097152 'uv installer'
  env UV_INSTALL_DIR="$bin_dir" UV_NO_MODIFY_PATH=1 sh "$installer" >&2 || \
    die 'uv installer execution failed.'
  [ -x "$uv_path" ] || die "uv did not install $uv_path."
  installed=$($uv_path --version 2>/dev/null || true)
  case "$installed" in
    "uv $UV_VERSION" | "uv $UV_VERSION "*) ;;
    *) die "uv reported '$installed', expected uv $UV_VERSION." ;;
  esac
  printf '%s\n' "$uv_path"
}

install_managed_python() {
  uv_path=$1
  "$uv_path" python install "$PYTHON_VERSION" >&2 || \
    die "uv could not install managed Python $PYTHON_VERSION."
  python_path=$($uv_path python find "$PYTHON_VERSION") || \
    die "uv could not locate managed Python $PYTHON_VERSION."
  [ -x "$python_path" ] || die 'uv did not return an executable managed Python.'
  printf '%s\n' "$python_path"
}

path_is_recorded() {
  path=$1
  record=$2
  [ -f "$record" ] && grep -F -x -- "$path" "$record" >/dev/null 2>&1
}

assert_replaceable_path() {
  path=$1
  record=$2
  label=$3
  if [ -e "$path" ] || [ -L "$path" ]; then
    path_is_recorded "$path" "$record" || die "Foreign file blocks $label at $path."
  fi
}

install_gh() {
  bin_dir=$1
  arch=$2
  python_executable=$3
  managed_record=$4
  gh_path=$bin_dir/gh

  if [ -x "$gh_path" ]; then
    path_is_recorded "$gh_path" "$managed_record" || \
      die "Foreign executable blocks gh at $gh_path."
    installed=$($gh_path --version 2>/dev/null | sed -n '1p' || true)
    case "$installed" in
      "gh version $GH_VERSION "*)
        log "reusing gh $GH_VERSION"
        printf '%s\n' "$gh_path"
        return
        ;;
      *) ;;
    esac
  elif [ -e "$gh_path" ] || [ -L "$gh_path" ]; then
    assert_replaceable_path "$gh_path" "$managed_record" 'gh'
  fi

  case "$arch" in
    amd64) expected_digest=$GH_SHA256_AMD64 ;;
    arm64) expected_digest=$GH_SHA256_ARM64 ;;
    *) die "Unsupported gh architecture $arch." ;;
  esac
  archive_name="gh_${GH_VERSION}_linux_${arch}.tar.gz"
  archive=$WORK_DIRECTORY/$archive_name
  download_https "https://github.com/cli/cli/releases/download/v$GH_VERSION/$archive_name" "$archive" || \
    die 'gh archive download failed.'
  archive_size=$(file_size "$archive")
  python_verify_file "$python_executable" "$archive" "$archive_size" "$expected_digest" 'gh archive' || \
    die 'gh archive verification failed.'
  tar -xzf "$archive" -C "$WORK_DIRECTORY" || die 'The verified gh archive could not be extracted.'
  extracted=$WORK_DIRECTORY/gh_${GH_VERSION}_linux_${arch}/bin/gh
  [ -x "$extracted" ] || die 'The verified gh archive omitted its executable.'
  temporary=$bin_dir/.gh.desktop-material-tui.$$
  cp "$extracted" "$temporary"
  chmod 0755 "$temporary"
  mv -f "$temporary" "$gh_path"
  installed=$($gh_path --version 2>/dev/null | sed -n '1p' || true)
  case "$installed" in
    "gh version $GH_VERSION "*) ;;
    *) die "Installed gh reported '$installed'." ;;
  esac
  printf '%s\n' "$gh_path"
}

parse_release_json() {
  python_executable=$1
  json_path=$2
  output_dir=$3
  "$python_executable" - "$json_path" "$output_dir" "$REPOSITORY" \
    "$MAX_WHEEL_BYTES" "$MAX_CONSTRAINTS_BYTES" <<'PY'
import json
import pathlib
import re
import sys
import urllib.parse

json_path = pathlib.Path(sys.argv[1])
output_dir = pathlib.Path(sys.argv[2])
repository = sys.argv[3]
max_wheel = int(sys.argv[4])
max_constraints = int(sys.argv[5])

try:
    releases = json.loads(json_path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, json.JSONDecodeError) as exc:
    raise SystemExit(f"Release metadata is not valid bounded UTF-8 JSON: {exc}")
if not isinstance(releases, list):
    raise SystemExit("Release metadata must be an array")

wheel_pattern = re.compile(
    r"desktop_material_tui-([0-9][0-9A-Za-z_.!+-]*)-py3-none-any[.]whl"
)
selected = None
for release in releases:
    if not isinstance(release, dict) or release.get("draft") or release.get("prerelease"):
        continue
    tag = release.get("tag_name")
    assets = release.get("assets")
    if (
        not isinstance(tag, str)
        or not re.fullmatch(r"[0-9A-Za-z._+-]+", tag)
        or not isinstance(assets, list)
    ):
        continue
    wheels = [asset for asset in assets if isinstance(asset, dict) and isinstance(asset.get("name"), str) and wheel_pattern.fullmatch(asset["name"])]
    if not wheels:
        continue
    if len(wheels) != 1:
        raise SystemExit(f"Release {tag!r} has {len(wheels)} matching TUI wheels")
    version = wheel_pattern.fullmatch(wheels[0]["name"]).group(1)
    constraints_name = f"desktop_material_tui-{version}-runtime-requirements.txt"
    constraints = [asset for asset in assets if isinstance(asset, dict) and asset.get("name") == constraints_name]
    if len(constraints) != 1:
        raise SystemExit(f"Release {tag!r} must have exactly one {constraints_name}")
    selected = (release, wheels[0], constraints[0], version)
    break

if selected is None:
    raise SystemExit("No non-draft, non-prerelease release carries a complete TUI install payload")

release, wheel, constraints, version = selected
tag = release["tag_name"]
prefix = (
    f"https://github.com/{repository}/releases/download/"
    f"{urllib.parse.quote(tag, safe='')}/"
)

def validate_asset(asset, label, maximum):
    name = asset.get("name")
    url = asset.get("browser_download_url")
    size = asset.get("size")
    digest = asset.get("digest")
    state = asset.get("state")
    if not isinstance(name, str) or not name or "/" in name or "\\" in name:
        raise SystemExit(f"{label} name is invalid")
    expected_url = prefix + urllib.parse.quote(name, safe="")
    if url != expected_url:
        raise SystemExit(f"{label} URL is not exactly bound to {repository}@{tag}")
    if not isinstance(size, int) or not 0 < size <= maximum:
        raise SystemExit(f"{label} size is outside 1..{maximum}")
    if state != "uploaded":
        raise SystemExit(f"{label} is not in uploaded state")
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-fA-F]{64}", digest):
        raise SystemExit(f"{label} has no supported GitHub SHA-256 digest")
    return {
        "name": name,
        "url": url,
        "size": str(size),
        "sha256": digest.split(":", 1)[1].lower(),
    }

values = {
    "version": version,
    "tag": tag,
    "wheel": validate_asset(wheel, "TUI wheel", max_wheel),
    "constraints": validate_asset(constraints, "TUI runtime constraints", max_constraints),
}
output_dir.mkdir(parents=True, exist_ok=True)
for key in ("version", "tag"):
    (output_dir / key).write_text(values[key], encoding="utf-8")
for group in ("wheel", "constraints"):
    for key, value in values[group].items():
        (output_dir / f"{group}_{key}").write_text(value, encoding="utf-8")
PY
}

validate_local_filename() {
  name=$1
  case "$name" in
    '' | */* | *\\* | *[!A-Za-z0-9_.!+-]*) return 1 ;;
  esac
}

prepare_local_payload() {
  python_executable=$1
  wheel=$2
  constraints=$3
  output_dir=$4
  [ -f "$wheel" ] || die "Local wheel does not exist: $wheel"
  [ -f "$constraints" ] || die "Local constraints do not exist: $constraints"
  wheel_name=$(basename "$wheel")
  constraints_name=$(basename "$constraints")
  validate_local_filename "$wheel_name" || die 'Local wheel filename is unsafe.'
  validate_local_filename "$constraints_name" || die 'Local constraints filename is unsafe.'
  if ! version=$($python_executable - "$wheel_name" "$constraints_name" <<'PY'
import re
import sys
wheel = re.fullmatch(r"desktop_material_tui-([0-9][0-9A-Za-z_.!+-]*)-py3-none-any[.]whl", sys.argv[1])
if wheel is None:
    raise SystemExit("Local wheel filename is not a Desktop Material TUI wheel")
version = wheel.group(1)
if sys.argv[2] != f"desktop_material_tui-{version}-runtime-requirements.txt":
    raise SystemExit("Local constraints filename does not match the wheel version")
print(version)
PY
  ); then
    die 'Local package filenames do not form one matching TUI payload.'
  fi
  mkdir -p "$output_dir"
  printf '%s' "$version" >"$output_dir/version"
  printf '%s' 'local-test-payload' >"$output_dir/tag"
  cp "$wheel" "$WORK_DIRECTORY/$wheel_name" || die 'Local wheel copy failed.'
  cp "$constraints" "$WORK_DIRECTORY/$constraints_name" || \
    die 'Local constraints copy failed.'
  printf '%s' "$wheel_name" >"$output_dir/wheel_name"
  printf '%s' "$WORK_DIRECTORY/$wheel_name" >"$output_dir/wheel_local_path"
  printf '%s' "$constraints_name" >"$output_dir/constraints_name"
  printf '%s' "$WORK_DIRECTORY/$constraints_name" >"$output_dir/constraints_local_path"
}

resolve_release_payload() {
  python_executable=$1
  metadata_dir=$WORK_DIRECTORY/release-fields
  mkdir -p "$metadata_dir"

  if [ -n "${DMT_LOCAL_WHEEL:-}" ] || [ -n "${DMT_LOCAL_CONSTRAINTS:-}" ]; then
    require_test_mode 'Local package overrides'
    [ -n "${DMT_LOCAL_WHEEL:-}" ] && [ -n "${DMT_LOCAL_CONSTRAINTS:-}" ] || \
      die 'Both DMT_LOCAL_WHEEL and DMT_LOCAL_CONSTRAINTS are required.'
    prepare_local_payload "$python_executable" "$DMT_LOCAL_WHEEL" \
      "$DMT_LOCAL_CONSTRAINTS" "$metadata_dir" || die 'Local payload validation failed.'
    printf '%s\n' "$metadata_dir"
    return
  fi

  release_json=$WORK_DIRECTORY/releases.json
  if [ -n "${DMT_RELEASE_JSON:-}" ]; then
    require_test_mode 'Local release metadata override'
    cp "$DMT_RELEASE_JSON" "$release_json" || die 'Release metadata override copy failed.'
  else
    download_https "$RELEASES_API" "$release_json" || die 'Release metadata download failed.'
  fi
  verify_bounded_file "$release_json" "$MAX_RELEASE_JSON_BYTES" 'release metadata'
  parse_release_json "$python_executable" "$release_json" "$metadata_dir" || \
    die 'Release metadata validation failed.'
  printf '%s\n' "$metadata_dir"
}

materialize_release_payload() {
  python_executable=$1
  metadata_dir=$2
  group=$3
  local_path_file=$metadata_dir/${group}_local_path
  if [ -f "$local_path_file" ]; then
    cat "$local_path_file"
    return
  fi

  name=$(cat "$metadata_dir/${group}_name")
  url=$(cat "$metadata_dir/${group}_url")
  expected_size=$(cat "$metadata_dir/${group}_size")
  expected_digest=$(cat "$metadata_dir/${group}_sha256")
  destination=$WORK_DIRECTORY/$name
  download_https "$url" "$destination" || die "$group download failed."
  python_verify_file "$python_executable" "$destination" "$expected_size" \
    "$expected_digest" "$group" || die "$group verification failed."
  printf '%s\n' "$destination"
}

assert_tui_launcher_paths() {
  managed_record=$1
  for name in github dmt desktop-material-tui; do
    target=$BIN_DIRECTORY/$name
    if [ -e "$target" ] || [ -L "$target" ]; then
      path_is_recorded "$target" "$managed_record" || \
        die "Foreign file blocks the $name launcher at $target."
    fi
  done
}

write_managed_record() {
  record=$1
  shift
  record_dir=$(dirname "$record")
  mkdir -p "$record_dir"
  temporary=$record_dir/.installer-managed.$$
  : >"$temporary"
  for path in "$@"; do
    printf '%s\n' "$path" >>"$temporary"
  done
  chmod 0600 "$temporary"
  mv -f "$temporary" "$record"
}

rewrite_path_profile() {
  profile=$1
  profile_dir=$(dirname "$profile")
  mkdir -p "$profile_dir"
  [ -e "$profile" ] || : >"$profile"
  [ -f "$profile" ] && [ ! -L "$profile" ] || die "Refusing non-regular shell profile $profile."
  temporary=$profile_dir/.desktop-material-tui-profile.$$
  if ! awk -v begin="$PATH_BLOCK_BEGIN" -v end="$PATH_BLOCK_END" '
    $0 == begin { if (skip) exit 41; skip = 1; next }
    $0 == end { if (!skip) exit 42; skip = 0; next }
    !skip { print }
    END { if (skip) exit 43 }
  ' "$profile" >"$temporary"; then
    rm -f "$temporary"
    die "Managed PATH markers are malformed in $profile."
  fi
  {
    printf '%s\n' "$PATH_BLOCK_BEGIN"
    printf '%s\n' 'case ":${PATH}:" in'
    printf '%s\n' '  *":${HOME}/.local/bin:"*) ;;'
    printf '%s\n' '  *) PATH="${HOME}/.local/bin:${PATH}" ;;'
    printf '%s\n' 'esac'
    printf '%s\n' 'export PATH'
    printf '%s\n' "$PATH_BLOCK_END"
  } >>"$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$profile"
}

configure_path() {
  rewrite_path_profile "$HOME/.profile"
  shell_name=$(basename "${SHELL:-sh}")
  case "$shell_name" in
    bash) rewrite_path_profile "$HOME/.bashrc" ;;
    zsh) rewrite_path_profile "$HOME/.zshrc" ;;
    fish)
      fish_dir=$HOME/.config/fish/conf.d
      fish_file=$fish_dir/desktop-material-tui-path.fish
      mkdir -p "$fish_dir"
      fish_temp=$fish_dir/.desktop-material-tui-path.$$
      {
        printf '%s\n' '# Managed by the Desktop Material TUI installer.'
        printf '%s\n' 'if not contains -- "$HOME/.local/bin" $PATH'
        printf '%s\n' '    set -gx PATH "$HOME/.local/bin" $PATH'
        printf '%s\n' 'end'
      } >"$fish_temp"
      chmod 0600 "$fish_temp"
      mv -f "$fish_temp" "$fish_file"
      ;;
  esac
}

install_tui() {
  uv_path=$1
  wheel=$2
  constraints=$3
  managed_record=$4
  assert_tui_launcher_paths "$managed_record"
  UV_TOOL_BIN_DIR=$BIN_DIRECTORY "$uv_path" tool install \
    --python "$PYTHON_VERSION" --force --constraints "$constraints" "$wheel" || \
    die 'uv could not install the verified TUI payload.'
  for name in github dmt desktop-material-tui; do
    [ -x "$BIN_DIRECTORY/$name" ] || die "uv omitted the $name launcher."
  done
}

smoke_installation() {
  uv_path=$1
  expected_version=$2
  PATH=$BIN_DIRECTORY:$PATH
  export PATH
  git --version >/dev/null
  ssh -V >/dev/null 2>&1
  gh --version >/dev/null
  for name in github dmt desktop-material-tui; do
    reported=$("$BIN_DIRECTORY/$name" --version)
    [ "$reported" = "$name $expected_version" ] || \
      die "$name reported '$reported', expected '$name $expected_version'."
  done
  tool_dir=$(UV_TOOL_BIN_DIR=$BIN_DIRECTORY "$uv_path" tool dir)
  tool_python=$tool_dir/desktop-material-tui/bin/python
  [ -x "$tool_python" ] || die 'The installed TUI environment has no Python executable.'
  "$tool_python" - <<'PY'
import re2
pattern = re2.compile(r"(?P<dish>har|siu) gow")
match = pattern.search("har gow")
if match is None or match.group("dish") != "har":
    raise SystemExit("google-re2 smoke check failed")
PY
}

parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --local-wheel)
        require_test_mode '--local-wheel'
        [ "$#" -ge 2 ] || die '--local-wheel requires a path.'
        DMT_LOCAL_WHEEL=$2
        export DMT_LOCAL_WHEEL
        shift 2
        ;;
      --local-constraints)
        require_test_mode '--local-constraints'
        [ "$#" -ge 2 ] || die '--local-constraints requires a path.'
        DMT_LOCAL_CONSTRAINTS=$2
        export DMT_LOCAL_CONSTRAINTS
        shift 2
        ;;
      --help)
        printf '%s\n' 'Usage: install-linux-tui.sh'
        printf '%s\n' 'Installs native dependencies, uv, Python 3.12, gh, and Desktop Material TUI.'
        exit 0
        ;;
      *) die "Unknown installer argument: $1" ;;
    esac
  done
}

main() {
  parse_arguments "$@"
  [ "$(uname -s)" = 'Linux' ] || die 'This installer supports Linux only.'
  [ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] && [ "$HOME" != '/' ] || \
    die 'HOME must be an absolute non-root directory.'
  case "$HOME" in *'
'*) die 'HOME must not contain a newline.' ;; esac

  if is_test_mode && [ -n "${DMT_TEST_ARCHITECTURE:-}" ]; then
    machine=$DMT_TEST_ARCHITECTURE
  else
    machine=$(uname -m)
  fi
  if ! arch=$(normalize_architecture "$machine"); then
    die "Unsupported Linux architecture: $machine. Only x86_64 and arm64 are supported."
  fi
  libc_version=$(detect_glibc_version)
  check_glibc_version "$arch" "$libc_version" || \
    die "GNU libc $libc_version is too old for the $arch google-re2 wheel."
  manager=$(detect_package_manager) || \
    die 'No supported package manager found (apt-get, dnf5/dnf, yum, zypper, or pacman).'
  PRIVILEGE_COMMAND=$(resolve_privilege) || \
    die 'Native packages require root, sudo, or doas. Run as a normal sudo/doas-enabled user or as root.'
  export PRIVILEGE_COMMAND

  install_native_dependencies "$manager"
  command -v curl >/dev/null 2>&1 || die 'curl remained unavailable after native installation.'

  BIN_DIRECTORY=$HOME/.local/bin
  STATE_ROOT=${XDG_STATE_HOME:-$HOME/.local/state}/desktop-material-tui/installer
  MANAGED_RECORD=$STATE_ROOT/managed-paths-v$INSTALLER_VERSION
  mkdir -p "$BIN_DIRECTORY" "$STATE_ROOT"
  chmod 0755 "$BIN_DIRECTORY"
  chmod 0700 "$STATE_ROOT"
  export BIN_DIRECTORY

  WORK_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/desktop-material-tui-install.XXXXXX")
  export WORK_DIRECTORY
  cleanup_work_directory() {
    case "$WORK_DIRECTORY" in
      "${TMPDIR:-/tmp}"/desktop-material-tui-install.*)
        rm -rf -- "$WORK_DIRECTORY"
        ;;
      *)
        printf '%s\n' 'Desktop Material TUI installer: refusing unsafe temporary cleanup path.' >&2
        return 1
        ;;
    esac
  }
  cleanup() {
    status=$?
    trap - EXIT HUP INT TERM
    cleanup_work_directory || status=1
    exit "$status"
  }
  interrupted() {
    trap - EXIT HUP INT TERM
    cleanup_work_directory || true
    exit 130
  }
  trap cleanup EXIT
  trap interrupted HUP INT TERM

  uv_path=$(install_uv "$BIN_DIRECTORY")
  python_executable=$(install_managed_python "$uv_path")
  gh_path=$(install_gh "$BIN_DIRECTORY" "$arch" "$python_executable" "$MANAGED_RECORD")
  metadata_dir=$(resolve_release_payload "$python_executable")
  wheel=$(materialize_release_payload "$python_executable" "$metadata_dir" wheel)
  constraints=$(materialize_release_payload "$python_executable" "$metadata_dir" constraints)
  expected_version=$(cat "$metadata_dir/version")

  install_tui "$uv_path" "$wheel" "$constraints" "$MANAGED_RECORD"
  configure_path
  write_managed_record "$MANAGED_RECORD" "$gh_path" \
    "$BIN_DIRECTORY/github" "$BIN_DIRECTORY/dmt" "$BIN_DIRECTORY/desktop-material-tui"
  smoke_installation "$uv_path" "$expected_version"

  log "installed Desktop Material TUI $expected_version"
  log "commands: $BIN_DIRECTORY/github, $BIN_DIRECTORY/dmt, $BIN_DIRECTORY/desktop-material-tui, $BIN_DIRECTORY/gh"
  log 'open a new shell (or source ~/.profile), then authenticate only when wanted with: gh auth login'
}

if [ "${DMT_INSTALLER_LIBRARY_ONLY:-0}" != '1' ]; then
  main "$@"
fi
