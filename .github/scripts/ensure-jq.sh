#!/usr/bin/env bash

set -euo pipefail

version="${JQ_VERSION:-1.7.1}"
runner_os="${RUNNER_OS:-}"
runner_arch="${RUNNER_ARCH:-}"

if [[ "$version" != '1.7.1' ]]; then
  echo "No repository-pinned jq checksum is available for version $version." >&2
  exit 1
fi

case "$runner_os" in
  Linux)
    case "$(uname -m)" in
      x86_64)
        asset='jq-linux-amd64'
        expected_sha256='5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5'
        ;;
      aarch64 | arm64)
        asset='jq-linux-arm64'
        expected_sha256='4dd2d8a0661df0b22f1bb9a1f9830f06b6f3b8f7d91211a1ef5d7c4f06a8b4a5'
        ;;
      *)
        echo "Unsupported Linux architecture for jq: $(uname -m)" >&2
        exit 1
        ;;
    esac
    cache_root="${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:?RUNNER_TEMP is required}}"
    temp_root="${RUNNER_TEMP:?RUNNER_TEMP is required}"
    binary_name='jq'
    ;;
  Windows)
    case "$runner_arch" in
      X64)
        asset='jq-windows-amd64.exe'
        expected_sha256='7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab'
        ;;
      *)
        echo "Unsupported Windows architecture for jq: ${runner_arch:-unknown}" >&2
        exit 1
        ;;
    esac
    cache_root=$(cygpath -u "${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:?RUNNER_TEMP is required}}")
    temp_root=$(cygpath -u "${RUNNER_TEMP:?RUNNER_TEMP is required}")
    binary_name='jq.exe'
    ;;
  *)
    echo "Unsupported runner operating system for jq: ${runner_os:-unknown}" >&2
    exit 1
    ;;
esac

cache_dir="$cache_root/desktop-material/jq/$version/${runner_os}-${runner_arch}"
asset_path="$cache_dir/$asset"
download_root="$temp_root/desktop-material-jq-download-$$"
install_root="$temp_root/desktop-material-jq/$version/${runner_os}-${runner_arch}"
binary="$install_root/$binary_name"

asset_is_valid() {
  [[ -f "$asset_path" ]] &&
    printf '%s  %s\n' "$expected_sha256" "$asset_path" | sha256sum -c - >/dev/null
}

if ! asset_is_valid; then
  if [[ "${DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE:-0}" == '1' ]]; then
    echo "The cached jq asset is missing or invalid while offline: $asset_path" >&2
    exit 1
  fi

  rm -rf "$download_root"
  mkdir -p "$download_root" "$cache_dir"
  downloaded="$download_root/$asset"
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --location --retry 3 --silent --show-error \
    "https://github.com/jqlang/jq/releases/download/jq-$version/$asset" \
    --output "$downloaded"
  printf '%s  %s\n' "$expected_sha256" "$downloaded" | sha256sum -c -
  mv -f "$downloaded" "$asset_path"
  rm -rf "$download_root"
fi

rm -rf "$install_root"
mkdir -p "$install_root"
cp "$asset_path" "$binary"
chmod +x "$binary"
printf '%s  %s\n' "$expected_sha256" "$binary" | sha256sum -c - >/dev/null

actual_version=$("$binary" --version | sed 's/^jq-//')
if [[ "$actual_version" != "$version" ]]; then
  echo "jq version mismatch: expected $version, received ${actual_version:-unknown}." >&2
  exit 1
fi

printf '%s\n' "$install_root" >> "${GITHUB_PATH:?GITHUB_PATH is required}"
export PATH="$install_root:$PATH"
"$binary" --version
