#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/install_plugin.sh <vault_path> [--skip-build]

Install the minimal Obsidian Word History runtime package into a local vault.
The plugin directory will contain only Obsidian runtime files while preserving
existing data.json settings and .cache analysis data.
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

VAULT_PATH="$1"
SKIP_BUILD="${2:-}"
if [[ -n "$SKIP_BUILD" && "$SKIP_BUILD" != "--skip-build" ]]; then
  usage >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_ID="word-history"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "Vault path does not exist: $VAULT_PATH" >&2
  exit 1
fi

if [[ "$SKIP_BUILD" != "--skip-build" ]]; then
  echo "[1/3] Building plugin runtime"
  (cd "$REPO_ROOT" && npm run build)
else
  echo "[1/3] Skipping build"
fi

for required in main.js manifest.json versions.json; do
  if [[ ! -f "$REPO_ROOT/$required" ]]; then
    echo "Missing required runtime file: $required" >&2
    exit 1
  fi
done

echo "[2/3] Installing minimal runtime files"
mkdir -p "$PLUGIN_DIR"
find "$PLUGIN_DIR" -mindepth 1 -maxdepth 1 \
  ! -name 'data.json' \
  ! -name '.cache' \
  -exec rm -rf {} +
cp "$REPO_ROOT/main.js" "$REPO_ROOT/manifest.json" "$REPO_ROOT/versions.json" "$PLUGIN_DIR/"

echo "[3/3] Installed $PLUGIN_ID to $PLUGIN_DIR"
find "$PLUGIN_DIR" -maxdepth 1 -mindepth 1 -print | sort
