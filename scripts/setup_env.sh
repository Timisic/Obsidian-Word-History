#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_PATH="${1:-$HOME/Documents/ObsidianVault}"
CHART_PATH="${2:-$VAULT_PATH/Reference/chart.svg}"
CACHE_PATH="${3:-$ROOT_DIR/.cache/word-history-cache.json}"
PYTHON_CMD="${PYTHON_BIN:-python3}"

log() {
  printf '%s\n' "$*" >&2
}

quote_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

command -v git >/dev/null 2>&1 || {
  log "Missing dependency: git"
  exit 1
}

command -v "$PYTHON_CMD" >/dev/null 2>&1 || {
  log "Missing dependency: $PYTHON_CMD"
  exit 1
}

cd "$ROOT_DIR"

if [[ "${SKIP_VENV:-0}" != "1" && ! -x "$ROOT_DIR/.venv/bin/python" ]]; then
  log "==> Creating .venv"
  "$PYTHON_CMD" -m venv "$ROOT_DIR/.venv"
fi

cat >"$ROOT_DIR/.env.local" <<EOF
OBSIDIAN_WORD_HISTORY_VAULT=$(quote_env_value "$VAULT_PATH")
OBSIDIAN_WORD_HISTORY_CHART=$(quote_env_value "$CHART_PATH")
OBSIDIAN_WORD_HISTORY_CACHE=$(quote_env_value "$CACHE_PATH")
EOF

log "==> Wrote .env.local"
log "==> Vault: $VAULT_PATH"
log "==> Chart: $CHART_PATH"
log "==> Cache: $CACHE_PATH"
log "==> Next: ./scripts/generate_chart.sh"
