#!/usr/bin/env bash

set -euo pipefail

version="${GH_CLI_VERSION:-2.97.0}"
runner_os="${RUNNER_OS:-}"
runner_arch="${RUNNER_ARCH:-}"

if [[ "$version" != '2.97.0' ]]; then
  echo "No repository-pinned GitHub CLI checksum is available for version $version." >&2
  exit 1
fi

case "$runner_os" in
  Linux)
    case "$(uname -m)" in
      x86_64)
        archive_arch='amd64'
        expected_sha256='a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112'
        ;;
      aarch64 | arm64)
        archive_arch='arm64'
        expected_sha256='73ea440ecad9c9e284429997ee6f93577bc6f7bc6fba357ef62c53ad8fb641a5'
        ;;
      *)
        echo "Unsupported Linux architecture for GitHub CLI: $(uname -m)" >&2
        exit 1
        ;;
    esac
    archive="gh_${version}_linux_${archive_arch}.tar.gz"
    cache_root="${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:?RUNNER_TEMP is required}}"
    temp_root="${RUNNER_TEMP:?RUNNER_TEMP is required}"
    binary_name='gh'
    ;;
  Windows)
    case "$runner_arch" in
      X64)
        archive_arch='amd64'
        expected_sha256='35d7fe05c4dd1411ffda1e73dfc7c6f44b75c936ca51fa6595c657fdc0350cec'
        ;;
      ARM64)
        archive_arch='arm64'
        expected_sha256='3e2d4a166da4ee5020c592737b65eec0e724946d5d5b962f5fe59d99116dc4bf'
        ;;
      *)
        echo "Unsupported Windows architecture for GitHub CLI: ${runner_arch:-unknown}" >&2
        exit 1
        ;;
    esac
    archive="gh_${version}_windows_${archive_arch}.zip"
    cache_root=$(cygpath -u "${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:?RUNNER_TEMP is required}}")
    temp_root=$(cygpath -u "${RUNNER_TEMP:?RUNNER_TEMP is required}")
    binary_name='gh.exe'
    ;;
  *)
    echo "Unsupported runner operating system for GitHub CLI: ${runner_os:-unknown}" >&2
    exit 1
    ;;
esac

cache_dir="$cache_root/desktop-material/github-cli/$version/${runner_os}-${runner_arch}"
archive_path="$cache_dir/$archive"
download_root="$temp_root/desktop-material-github-cli-download-$$"
install_root="$temp_root/desktop-material-github-cli/$version/${runner_os}-${runner_arch}"
executable="$install_root/bin/$binary_name"

archive_is_valid() {
  [[ -f "$archive_path" ]] &&
    printf '%s  %s\n' "$expected_sha256" "$archive_path" | sha256sum -c - >/dev/null
}

if ! archive_is_valid; then
  if [[ "${DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE:-0}" == '1' ]]; then
    echo "The cached GitHub CLI archive is missing or invalid while offline: $archive_path" >&2
    exit 1
  fi

  rm -rf "$download_root"
  mkdir -p "$download_root" "$cache_dir"
  downloaded="$download_root/$archive"
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --location --retry 3 --silent --show-error \
    "https://github.com/cli/cli/releases/download/v${version}/${archive}" \
    --output "$downloaded"
  printf '%s  %s\n' "$expected_sha256" "$downloaded" | sha256sum -c -
  mv -f "$downloaded" "$archive_path"
  rm -rf "$download_root"
fi

# Persistent archives are revalidated above; executables are always produced in
# this job's temporary directory so a modified old extraction is never reused.
rm -rf "$install_root"
mkdir -p "$install_root"
case "$runner_os" in
  Linux) tar -xzf "$archive_path" --strip-components=1 -C "$install_root" ;;
  Windows) unzip -q "$archive_path" -d "$install_root" ;;
esac

if [[ ! -x "$executable" ]]; then
  echo "GitHub CLI archive did not contain an executable at $executable." >&2
  exit 1
fi
actual_version=$("$executable" --version | sed -n '1s/^gh version \([^ ]*\).*/\1/p')
if [[ "$actual_version" != "$version" ]]; then
  echo "GitHub CLI version mismatch: expected $version, received ${actual_version:-unknown}." >&2
  exit 1
fi

printf '%s\n' "$install_root/bin" >> "${GITHUB_PATH:?GITHUB_PATH is required}"
export PATH="$install_root/bin:$PATH"
"$executable" --version
