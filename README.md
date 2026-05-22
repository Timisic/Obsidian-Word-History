# Obsidian Word History Tool

Lightweight local tool for generating a word-history SVG from a Git-backed Obsidian vault.

## One Command

```bash
./scripts/generate_chart.sh
```

By default this reads:

```text
/Users/hong/Obsidian Notes
```

and overwrites:

```text
/Users/hong/Obsidian Notes/Reference/chart.svg
```

Progress is printed to stderr while Git history is replayed. The final stdout line is machine-readable JSON:

```json
{"chart_svg": "/Users/hong/Obsidian Notes/Reference/chart.svg"}
```

## Custom Paths

```bash
./scripts/generate_chart.sh "<vault_path>" "<chart_svg_path>"
```

## Direct Python CLI

```bash
PYTHONPATH=. python3 -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes" \
  --out out
```

This writes:

- `out/analysis.json`
- `out/chart.svg`

## What Is Kept

- Git history replay for the Obsidian vault
- Markdown/CJK-aware word counting
- Python SVG rendering
- A single shell entrypoint for daily use
- Regression tests for counting, analysis, rendering, and script behavior

## Notes

- The vault must be a Git repository.
- Rename handling remains path-based; lineage is not merged across paths.
- The tool uses Python standard library modules plus the local `git` executable.
- No dashboard, Node, pnpm, or vendored renderer is required for the light workflow.
