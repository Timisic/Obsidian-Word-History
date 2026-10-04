#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo 'Usage: scripts/publish_profile.sh input.png clean-profile-clone' >&2
  exit 2
fi
input=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
repo=$2
target=assets/obsidian-notes-word-history.png
[[ $(head -c 8 "$input" | od -An -tx1 | tr -d ' \n') == 89504e470d0a1a0a ]] || { echo 'Input must be a PNG' >&2; exit 2; }
cd "$repo"
[[ -z $(git status --porcelain) ]] || { echo 'Profile clone must be clean' >&2; exit 2; }
branch=$(git symbolic-ref --short HEAD)
for attempt in 1 2 3; do
  git fetch origin "$branch"
  git merge --ff-only FETCH_HEAD
  mkdir -p assets
  cp "$input" "$target"
  git add -- "$target"
  if git diff --cached --quiet -- "$target"; then
    echo 'Profile PNG unchanged'
    exit 0
  fi
  git commit -m 'Update Obsidian word history chart' -- "$target"
  if git push origin "HEAD:$branch"; then exit 0; fi
  git fetch origin "$branch"
  git reset --hard FETCH_HEAD
done
echo 'Profile push failed after three attempts' >&2
exit 1
