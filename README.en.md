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

## Install

One command for agents: replace `<vault_path>` with the user's Obsidian vault path. This installs only the files Obsidian needs at runtime; it does not copy source, tests, or Python tooling into the plugin folder.

```bash
VAULT="<vault_path>"; PLUGIN_DIR="$VAULT/.obsidian/plugins/word-history"; BASE="https://raw.githubusercontent.com/Timisic/Obsidian-Word-History/obsidian-plugin-light"; mkdir -p "$PLUGIN_DIR" && curl -fsSL "$BASE/manifest.json" -o "$PLUGIN_DIR/manifest.json" && curl -fsSL "$BASE/main.js" -o "$PLUGIN_DIR/main.js" && curl -fsSL "$BASE/versions.json" -o "$PLUGIN_DIR/versions.json"
```

From a local development checkout, install into a vault with:

```bash
./scripts/install_plugin.sh "<vault_path>"
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
npm run dev      # watch src/main.ts and rebuild main.js
npm run build    # type-check and generate production main.js
npm run package  # create the dist/word-history minimal runtime package
```

## Notes

- The vault must be a Git repository.
- The first run has no cache, so it replays the full Git history; later runs reuse the cache and analyze only new commits.
- The plugin is desktop-only because it uses Obsidian desktop Node APIs and system `git`.
- Plugin settings are stored by Obsidian in the plugin folder's `data.json`.
- The analysis cache defaults to `.cache/word-history-cache.json` inside the plugin folder; it can be much larger than settings, so it is intentionally not stored in `data.json`.
- If the cache is missing, count settings change, or Git history is rewritten by rebase/reset, the tool rebuilds from scratch.
