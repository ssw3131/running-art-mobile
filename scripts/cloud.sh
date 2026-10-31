#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(tr -d '\r\n' < .node-version)"
mode=setup
if (( $# > 0 )); then mode="$1"; fi
export EXPO_NO_DOTENV=1 CI=1
if [[ "$mode" == setup ]]; then
  if [[ ! -x .tools/node-linux/bin/node ]]; then
    [[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo "Expected Linux x86_64"; exit 1; }
    mkdir -p .cache/downloads .tools/node-linux
    archive=".cache/downloads/node-v$version-linux-x64.tar.xz"
    curl --fail --location --retry 3 "https://nodejs.org/dist/v$version/node-v$version-linux-x64.tar.xz" -o "$archive"
    expected=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
    [[ "$version" == 24.21.0 ]] || { echo "Update the pinned Linux checksum with .node-version"; exit 1; }
    printf '%s  %s\n' "$expected" "$archive" | sha256sum --check
    tar -xJf "$archive" -C .tools/node-linux --strip-components=1
  fi
fi
export PATH="$PWD/.tools/node-linux/bin:$PATH"
[[ "$(node --version)" == "v$version" ]] || { echo "Run bash scripts/cloud.sh setup to install pinned Node"; exit 1; }
case "$mode" in
  setup) npm ci ;;
  check) npm run check ;;
  fast) npm run qa:fast ;;
  *) echo "Usage: bash scripts/cloud.sh {setup|check|fast}"; exit 2 ;;
esac
