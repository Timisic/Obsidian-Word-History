# Obsidian Word History Tool

[中文 README](README.md)

This is a lightweight local tool that replays Markdown history from a Git-backed Obsidian vault and generates a word-history SVG chart.

## Example

![Obsidian word history example](assets/example-chart.svg)

## Quick Start

Set up the local environment and output path first:

```bash
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

Then refresh the chart with:

```bash
./scripts/generate_chart.sh
```

The generator prints progress while it runs and ends with one JSON line:

```json
{"chart_svg": "/path/to/your/vault/Reference/chart.svg"}
```

The first run builds a local incremental cache. Later runs analyze only new commits, as long as the Git history has not been rewritten, and then re-render the SVG.

## Run With Explicit Paths

```bash
./scripts/generate_chart.sh "<vault_path>" "<chart_svg_path>" "<cache_json_path>"
```

The third argument is optional. When omitted, the default cache path is `.cache/word-history-cache.json`.

## Direct Python CLI

```bash
PYTHONPATH=. python3 -m obsidian_word_history build \
  --vault "<vault_path>" \
  --out out \
  --cache .cache/word-history-cache.json
```

This writes:

- `out/analysis.json`
- `out/chart.svg`

## Local Configuration

`./scripts/setup_env.sh` creates `.venv` and writes a local `.env.local` file:

```bash
OBSIDIAN_WORD_HISTORY_VAULT="/path/to/your/vault"
OBSIDIAN_WORD_HISTORY_CHART="/path/to/your/vault/Reference/chart.svg"
OBSIDIAN_WORD_HISTORY_CACHE="/path/to/this/repo/.cache/word-history-cache.json"
```

`.env.local` is ignored by Git, so it is the right place for your private vault and output paths.

## What Is Kept

- Git history replay for the Obsidian vault
- Markdown/CJK-aware word counting
- Pure Python SVG rendering
- A single shell entrypoint for daily use
- JSON-based local incremental caching
- Regression tests for counting, analysis, rendering, and script behavior

## Notes

- The vault must be a Git repository.
- Rename handling remains path-based; lineage is not merged across paths.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool automatically rebuilds the cache from scratch.
- The tool uses Python standard library modules plus the local `git` executable.
- The light workflow does not require a dashboard, Node, pnpm, or a vendored renderer.
