# Obsidian Word History Tool

[中文 README](README.md)

Turn a Git-backed Obsidian vault into a continuously updated word-history growth chart, in a Star History style. This branch is a minimal desktop Obsidian plugin.

![Obsidian word history example](assets/example-chart.svg)

## Features

- **One-command SVG generation**: the output can be embedded directly in Obsidian notes, Canvas, websites, or READMEs.
- **Incremental analysis**: replay full Git history once, then analyze only new commits.
- **Chinese-note friendly**: word counting supports Markdown and CJK text.
- **Lightweight local workflow**: the plugin generates charts in JS and only depends on system `git`; no Python, Node setup, dashboard, or external service.
- **Minimal configuration**: set one SVG output path, then run manually, every N days, or after Git HEAD changes.

## Install

After the user provides the vault path, run this single command:

```bash
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "<vault_path>/.obsidian/plugins/word-history"
```

```bash
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
```

Then enable **Word History** in Obsidian settings and set the output SVG path, for example `Reference/chart.svg`.

## Run

In Obsidian, open the command palette and run:

```text
Word History: Generate word history chart
```

You can also choose an update mode in the plugin settings:

- `Manual`: generate only when triggered manually.
- `Every N days`: auto-generate while Obsidian is open.
- `On Git changes`: auto-generate when the Git HEAD changes.

## Notes

- The vault must be a Git repository.
- The default cache is `.cache/word-history-cache.json` inside the plugin directory.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
