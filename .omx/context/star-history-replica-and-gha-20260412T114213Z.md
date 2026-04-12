# Context Snapshot — star-history-replica-and-gha

- Task: make the chart renderer much closer to Star History's original implementation, then write a concise GitHub Actions setup guide for the two-repo arrangement (Obsidian Notes repo + Obsidian Word History Tool repo).
- Desired outcome:
  1. chart.svg behaves more like Star History visually and structurally
  2. a short, practical doc explains exactly how to wire GitHub Actions across two repos
  3. output remains SVG-first and embeddable in README
- Known facts:
  - Tool repo: /Users/hong/Downloads/obsidian-word-history-tool
  - Notes repo: /Users/hong/Obsidian Notes
  - current renderer is Python-generated SVG inspired by Star History, not a full direct renderer port
  - current output directory defaults to ./out
  - README already embeds ./out/chart.svg
  - user wants automation later, but this turn prioritizes renderer fidelity + setup documentation
- Constraints:
  - keep SVG as the primary artifact; PNG export removed
  - two repositories remain separate
  - user wants concise, practical documentation
  - use OMX team runtime for parallel execution
- Unknowns / open questions:
  - how far the Star History renderer can be ported without adding heavy deps
  - whether current time-axis weighting should be kept or replaced by a closer Star History time mapping
- Likely touchpoints:
  - obsidian_word_history/render.py
  - obsidian_word_history/cli.py
  - README.md
  - docs/automation-roadmap.md or a new dedicated GitHub Actions guide
  - tests/test_cli_integration.py
