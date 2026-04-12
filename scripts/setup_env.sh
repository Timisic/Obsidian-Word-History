#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_NODE=0
SKIP_VENV=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-node)
      SKIP_NODE=1
      shift
      ;;
    --skip-venv)
      SKIP_VENV=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: ./scripts/setup_env.sh [--skip-node] [--skip-venv]" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

echo "==> Project root: $ROOT_DIR"

if [[ "$SKIP_VENV" -eq 0 ]]; then
  if [[ ! -d "$VENV_DIR" ]]; then
    echo "==> Creating Python virtual environment at $VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  else
    echo "==> Reusing existing virtual environment at $VENV_DIR"
  fi

  VENV_PYTHON="$VENV_DIR/bin/python"
  echo "==> Upgrading pip in virtual environment"
  "$VENV_PYTHON" -m pip install --upgrade pip >/dev/null
else
  echo "==> Skipping virtual environment setup"
fi

if [[ "$SKIP_NODE" -eq 0 ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required to prepare the vendored star-history renderer." >&2
    exit 1
  fi

  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then
    PNPM_CMD=(corepack pnpm)
  else
    echo "pnpm was not found, and corepack is unavailable. Install pnpm or a modern Node.js with corepack." >&2
    exit 1
  fi

  if [[ -d "$ROOT_DIR/vendor/star-history" ]]; then
    echo "==> Installing vendored star-history workspace dependencies"
    (
      cd "$ROOT_DIR/vendor/star-history"
      "${PNPM_CMD[@]}" install --frozen-lockfile
    )

    echo "==> Installing vendored star-history backend dependencies"
    (
      cd "$ROOT_DIR/vendor/star-history/backend"
      "${PNPM_CMD[@]}" install --frozen-lockfile
    )
  else
    echo "==> vendor/star-history not found; skipping renderer dependency install"
  fi
else
  echo "==> Skipping Node / pnpm setup"
fi

cat <<EOF

Environment setup complete.

Next steps:
  source .venv/bin/activate
  ./scripts/run_dashboard.sh

Optional:
  PYTHONPATH=. python3 -m obsidian_word_history build --vault "/Users/hong/Obsidian Notes"
EOF
