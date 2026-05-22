#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

DEFAULT_VAULT="${OBSIDIAN_WORD_HISTORY_VAULT:-$HOME/Documents/ObsidianVault}"
DEFAULT_CHART="${OBSIDIAN_WORD_HISTORY_CHART:-$DEFAULT_VAULT/Reference/chart.svg}"
DEFAULT_CACHE="${OBSIDIAN_WORD_HISTORY_CACHE:-$ROOT_DIR/.cache/word-history-cache.json}"

VAULT_PATH="${1:-$DEFAULT_VAULT}"
CHART_PATH="${2:-$DEFAULT_CHART}"
CACHE_PATH="${3:-$DEFAULT_CACHE}"
PYTHON_CMD="${PYTHON_BIN:-}"

log() {
  printf '%s\n' "$*" >&2
}

start_spinner() {
  local message="$1"
  (
    local frames='-\|/'
    local i=0
    local started=$SECONDS
    while :; do
      printf '\r[%s] %s (%ss)' "${frames:i++%4:1}" "$message" "$((SECONDS - started))" >&2
      sleep 1
    done
  ) &
  SPINNER_PID=$!
}

stop_spinner() {
  local status="$1"
  local message="$2"
  if [[ -n "${SPINNER_PID:-}" ]]; then
    kill "$SPINNER_PID" >/dev/null 2>&1 || true
    wait "$SPINNER_PID" >/dev/null 2>&1 || true
    SPINNER_PID=""
  fi
  printf '\r[%s] %s\n' "$status" "$message" >&2
}

cd "$ROOT_DIR"

if [[ -z "$PYTHON_CMD" ]]; then
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
  else
    PYTHON_CMD="python3"
  fi
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/obsidian-word-history-chart.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

log "==> Vault: $VAULT_PATH"
log "==> Target chart: $CHART_PATH"
log "==> Cache: $CACHE_PATH"
log "==> Python: $PYTHON_CMD"

start_spinner "Reading cached Git history and rendering chart"
if PYTHONPATH=. "$PYTHON_CMD" -m obsidian_word_history build \
  --vault "$VAULT_PATH" \
  --out "$TMP_DIR" \
  --cache "$CACHE_PATH" \
  >"$TMP_DIR/build-result.json" \
  2>"$TMP_DIR/build-error.log"; then
  stop_spinner "OK" "Built chart artifacts"
else
  status=$?
  stop_spinner "FAIL" "Build failed"
  if [[ -s "$TMP_DIR/build-error.log" ]]; then
    cat "$TMP_DIR/build-error.log" >&2
  fi
  exit "$status"
fi

log "==> Installing chart"
mkdir -p "$(dirname "$CHART_PATH")"
install -m 0644 "$TMP_DIR/chart.svg" "$CHART_PATH"
log "==> Done"

"$PYTHON_CMD" - "$CHART_PATH" <<'PY'
import json
import sys

print(json.dumps({"chart_svg": sys.argv[1]}, ensure_ascii=False))
PY
