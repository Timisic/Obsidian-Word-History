# Obsidian Word History Tool

[中文 README](README.md)

Turn a Git-backed Obsidian vault into a continuously updated word-history SVG. It is for writers, note-takers, and agents that need a lightweight way to track long-term vault growth.

![Obsidian word history example](assets/example-chart.svg)

## Features

- **One-command SVG generation** for Obsidian notes, Canvas, websites, or READMEs.
- **Incremental analysis**: full Git replay once, then only new commits.
- **Progress summary**: prints words added since the last run and the current total.
- **Markdown/CJK-aware counting** for mixed English and Chinese notes.
- **Local and lightweight**: only `git` and `python3`; no Node, dashboard, or external service.
- **Agent-friendly setup** with one copyable install command.

## Install

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

Example output:

```text
新增字数: 0；当前总字数: 344630
```

## Agent Install Command

If you are an agent helping a user install this tool, ask for the vault path and run this single command:

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git && cd Obsidian-Word-History && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

## Notes

- The vault must be a Git repository.
- The default cache is `.cache/word-history-cache.json`.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
