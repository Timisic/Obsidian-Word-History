# Obsidian Word History Tool

[中文 README](README.md)

Turn a Git-backed Obsidian vault into a continuously updated word-history growth chart, in a Star History style.

![Obsidian word history example](assets/example-chart.svg)

## Features

- **One-command SVG generation**: the output can be embedded directly in Obsidian notes, Canvas, websites, or READMEs.
- **Incremental analysis**: replay full Git history once, then analyze only new commits.
- **Chinese-note friendly**: word counting supports Markdown and CJK text.
- **Lightweight local workflow**: only `git` + `python3`; no Node, dashboard, or external service.

## Install

After the user provides the vault path, run this single command:

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git && cd Obsidian-Word-History && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git
cd Obsidian-Word-History
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` creates `.venv` and writes an ignored `.env.local` file for the vault path, SVG output path, and local cache path.

## Run

```bash
./scripts/generate_chart.sh
```

## Notes

- The vault must be a Git repository.
- The default cache is `.cache/word-history-cache.json`.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
