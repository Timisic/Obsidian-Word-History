# Obsidian Word History Tool

[中文 README](README.md)

Turn a Git-backed Obsidian vault into a continuously updated word-history growth chart, in a Star History style. This branch is a minimal desktop Obsidian plugin: the source is TypeScript and the runtime artifact is the bundled `main.js`.

![Obsidian word history example](assets/example-chart.svg)

## Features

- **One-command SVG generation**: embed the output directly in Obsidian notes, Canvas, websites, or READMEs.
- **Incremental analysis**: replay full Git history once, then analyze only new commits.
- **Chinese-note friendly**: word counting supports Markdown and CJK text.
- **Lightweight local workflow**: at runtime the plugin only depends on system `git`; no Python, Node setup, dashboard, or external service.
- **Minimal configuration**: set one SVG output path, then run manually, every N days, or after Git HEAD changes.
- **Community-plugin shape**: TypeScript source lives in `src/main.ts` and esbuild produces the Obsidian-ready `main.js`.

## Install

After the user provides the vault path, run this single command:

```bash
mkdir -p "<vault_path>/.obsidian/plugins" && git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "<vault_path>/.obsidian/plugins/word-history"
```

```bash
mkdir -p "$HOME/Documents/ObsidianVault/.obsidian/plugins" && git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
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

## Development

Normal users do not need this section; the repository already includes the built `main.js`.

```bash
npm install
npm run dev     # watch src/main.ts and rebuild main.js
npm run build   # type-check and generate production main.js
```

## Notes

- The vault must be a Git repository.
- The plugin is desktop-only because it uses Obsidian desktop Node APIs and system `git`.
- The default cache is `.cache/word-history-cache.json` inside the plugin directory.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
