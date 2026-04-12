# Context Snapshot — star-history-full-port

- Task: clone the upstream `star-history` repository locally and push this project much closer to a real Star History renderer/structure by reusing upstream code and assets where practical.
- Desired outcome:
  1. local chart output visually and structurally matches Star History much more closely than the current custom SVG renderer
  2. current SVG/PNG dissatisfaction is addressed by using upstream code/assets rather than continued approximation
  3. keep the word-history data pipeline intact while swapping or adapting the rendering layer
- Known facts:
  - current repo: /Users/hong/Downloads/obsidian-word-history-tool
  - notes repo: /Users/hong/Obsidian Notes
  - current renderer is Python SVG generation with some Star History-inspired styling, but user is dissatisfied
  - current outputs: analysis.json + chart.svg + chart.png
  - user explicitly wants the upstream repo cloned and reused directly
  - team runtime is available and user explicitly allowed parallel/team work
- Constraints:
  - preserve the local word-history data pipeline unless the renderer port requires a thin adapter
  - the result should be much closer to upstream Star History, not another approximation pass
  - keep progress evidence and final verification before claiming success
- Unknowns / open questions:
  - whether the cleanest path is full renderer port, partial TS runtime embedding, or generation through a small upstream-derived toolchain wrapper
  - how much of current Python render.py should remain after integration
- Likely touchpoints:
  - clone upstream repo under a local vendor/external path
  - obsidian_word_history/render.py / cli.py
  - test expectations around output contract
  - README docs if output contract changes
