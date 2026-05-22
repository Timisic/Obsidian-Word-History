# Obsidian Word History Tool

[中文 README](README.md)

Turn a Git-backed Obsidian vault into a continuously updated word-history growth chart, in a Star History style. This branch can also run as a minimal desktop Obsidian plugin.

![Obsidian word history example](assets/example-chart.svg)

## Features

- **One-command SVG generation**: the output can be embedded directly in Obsidian notes, Canvas, websites, or READMEs.
- **Incremental analysis**: replay full Git history once, then analyze only new commits.
- **Chinese-note friendly**: word counting supports Markdown and CJK text.
- **Lightweight local workflow**: only `git` + `python3`; no Node, dashboard, or external service.
- **Obsidian plugin shell**: configure the SVG output path, then run manually, every N days, or through Git commit/push hooks.

## Install

After the user provides the vault path, run this single command:

```bash
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "<vault_path>/.obsidian/plugins/word-history" && cd "<vault_path>/.obsidian/plugins/word-history" && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

```bash
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
cd "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` creates `.venv` and writes an ignored `.env.local` file for the vault path, SVG output path, and local cache path.
Then enable **Word History** in Obsidian settings.

## Run

```bash
./scripts/generate_chart.sh
```

## Notes

- The vault must be a Git repository.
- The default cache is `.cache/word-history-cache.json`.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
