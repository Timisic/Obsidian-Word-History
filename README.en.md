# Word History for Obsidian

[中文 README](README.md)

Turn your Git-backed Obsidian vault into a local, auto-updating writing growth chart. Word History is designed for long-term writers, PKM users, and CJK/Chinese note collections that want one embeddable SVG to show writing accumulation over time.

![Example word history chart](assets/example-chart.svg)

## What you get

- An SVG chart you can embed in Obsidian notes, Canvas, websites, or READMEs
- One full Git-history replay on first run, then incremental updates for new commits
- Markdown, Canvas text, and CJK-friendly counting
- Local-only runtime: Obsidian desktop + system `git`
- Manual, interval-based, or Git HEAD-change updates
- Post-generation actions: Open SVG, Copy Obsidian embed, Reveal output file, and Reset cache

## Who it is for

Use this if your Obsidian vault is already backed by Git. The plugin reconstructs history from commits, so uncommitted writing sessions are not part of the chart.

Version 0.1 intentionally stays focused on a single SVG chart. HTML reports, note tables, and dashboards are out of scope for this beta.

## Install

### Recommended: GitHub Release zip

1. Download the latest `word-history.zip` / `word-history-v*.zip`
2. Extract it to `<vault>/.obsidian/plugins/word-history/`
3. Enable **Word History** in Obsidian settings

### BRAT install

1. Install and enable the Obsidian BRAT plugin
2. Add `Timisic/Obsidian-Word-History` in BRAT
3. Select the Release / beta version and enable **Word History**

### Manual runtime install

Copy these files into `<vault>/.obsidian/plugins/word-history/`:

- `main.js`
- `manifest.json`
- `versions.json`

Normal users do not need `npm install`, Python, Node, dashboards, or repository source files.

### Advanced: command-line install

For beta users who are comfortable with shell commands. Make sure you trust the target branch before running it.

```bash
VAULT="<vault_path>"; PLUGIN_DIR="$VAULT/.obsidian/plugins/word-history"; BASE="https://raw.githubusercontent.com/Timisic/Obsidian-Word-History/obsidian-plugin-light"; mkdir -p "$PLUGIN_DIR" && curl -fsSL "$BASE/manifest.json" -o "$PLUGIN_DIR/manifest.json" && curl -fsSL "$BASE/main.js" -o "$PLUGIN_DIR/main.js" && curl -fsSL "$BASE/versions.json" -o "$PLUGIN_DIR/versions.json"
```

This repository also includes a local installer:

```bash
scripts/install_plugin.sh "<vault_path>"
```

## First chart in 3 steps

1. Make sure your vault is a Git repository with at least one commit
2. Set the output path, for example `Reference/chart.svg`
3. Run `Word History: Generate word history chart`, or click **Generate** in plugin settings

Embed the chart in a note:

```md
![[Reference/chart.svg]]
```

The settings tab shows git, vault, HEAD, output path, cache, and last-run status. Failed runs surface actionable preflight messages.

## Requirements and limitations

- Desktop-only Obsidian plugin
- Requires system `git`
- Uses committed Git history only
- First run replays the full history; later runs reuse cache
- Cache is stored in the plugin folder under `.cache/word-history-cache.json`
- Rebase/reset or count-setting changes trigger a full rebuild
- Rename history is path-based in the current version
- Release zip and BRAT are the first supported distribution paths; Obsidian Community Plugin publishing is out of scope for now

## Troubleshooting

- **Not a Git repository**: run `git init` in the vault root, add files, and create at least one commit.
- **No commit found**: commit your notes first; the chart is rebuilt from commit history.
- **Git not found**: install Git and make sure Obsidian's launch environment can access `git`.
- **Output path is not writable**: use a vault-relative path such as `Reference/chart.svg`, or fix folder permissions.
- **The chart did not change**: make sure your edits are committed; if needed, Reset cache in settings and regenerate.

## Development

Normal users do not need this section; the repository already includes the built `main.js`.

```bash
npm install
npm run dev      # watch src/*.ts and rebuild main.js
npm run build    # type-check and generate production main.js
npm run package  # create dist/word-history and dist/word-history-v*.zip
```

The Python CLI remains available as development/migration tooling. The Obsidian plugin runtime does not depend on Python.
