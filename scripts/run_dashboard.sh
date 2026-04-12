#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_VAULT="/Users/hong/Obsidian Notes"
VAULT_PATH="${1:-$DEFAULT_VAULT}"
PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"
PYTHON_CMD="${PYTHON_BIN:-}"

cd "$ROOT_DIR"
if [[ -z "$PYTHON_CMD" ]]; then
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
  else
    PYTHON_CMD="python3"
  fi
fi

PYTHONPATH=. "$PYTHON_CMD" -m obsidian_word_history serve \
  --vault "$VAULT_PATH" \
  --host "$HOST" \
  --port "$PORT"
