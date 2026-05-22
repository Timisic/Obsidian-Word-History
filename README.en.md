# Obsidian Word History Tool

[中文 README](README.md)

Generate a word-history SVG from a Git-backed Obsidian vault.

![Obsidian word history example](assets/example-chart.svg)

## Install

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git
cd Obsidian-Word-History
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` creates `.venv` and writes a local `.env.local`. The file is ignored by Git and stores your vault path, SVG output path, and local cache path.

## Run

```bash
./scripts/generate_chart.sh
```

The script overwrites the target SVG and prints one summary line:

```text
新增字数: 0；当前总字数: 344630
```

The first run builds `.cache/word-history-cache.json`. Later runs analyze only new commits. If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds the cache from scratch.

## Agent Install Command

If you are an agent helping a user install this tool, ask for the vault path and run this single command:

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git && cd Obsidian-Word-History && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

## Requirements

- The vault must be a Git repository.
- Local `git` and `python3` are required.
- Node, pnpm, dashboard, and vendored renderers are not required.
