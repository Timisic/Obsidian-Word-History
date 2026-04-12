# PRD — Obsidian Word History Tool

## Context
- Source spec: `.omx/specs/deep-interview-obsidian-word-history-tool.md`
- Vault target: `/Users/hong/Obsidian Notes`
- Local Git evidence: 419 commits spanning 2025-01-16 → 2026-04-12 (checked on 2026-04-12)
- Word-count reference: `/Users/hong/Obsidian Notes/.obsidian/plugins/novel-word-count/data.json`
- Current `novel-word-count` settings in use:
  - `countType=word`
  - `excludeComments=false`
  - `excludeCodeBlocks=false`
  - `excludeNonVisibleLinkPortions=false`
  - `excludeFootnotes=false`
  - `characterCountType=AllCharacters`
  - `pageCountType=ByWords`

---

## RALPLAN-DR Summary

### Principles
1. **Local-first over platform-first** — use the local Git vault as the primary source of truth; no online dependency.
2. **Parity before cleverness** — match `novel-word-count` semantics closely before adding extra metrics.
3. **Three-block homepage discipline** — the first report must stay visually narrow and immediately readable.
4. **Deterministic rebuilds** — the same vault state and same settings must produce the same output artifacts.
5. **Simple internals, extensible edges** — choose a straightforward architecture that leaves room for folder stats later without forcing them into V1.

### Decision Drivers
1. **Stable personal reuse** — the tool should be easy to rerun as the vault grows.
2. **Metric trustworthiness** — the user must believe the counts because they align with the tool already used daily.
3. **Low operational overhead** — one local command should regenerate the report without service setup.

### Viable Options

#### Option A — Python CLI + self-contained static HTML report (**Recommended**)
**Approach:** Build a Python analyzer that reads Git history via `subprocess`, computes datasets, and emits a single static HTML report with embedded assets.

**Pros**
- Very small runtime surface; easy local execution.
- No browser build pipeline or frontend framework overhead.
- Can generate offline, portable artifacts.
- Fits the user's “simple and stable” requirement best.

**Cons**
- Less component reuse from `star-history` itself.
- Need to handcraft chart rendering or vendor a lightweight local chart asset.

#### Option B — Node CLI + mini static frontend
**Approach:** Use Node/TypeScript for history analysis and produce a local static site with a lightweight chart library.

**Pros**
- Easier to borrow frontend patterns from `star-history`.
- More familiar path if later evolving into a richer web UI.

**Cons**
- Larger toolchain and dependency surface.
- More moving parts than the user currently needs.
- Higher maintenance cost for a personal utility.

#### Option C — Fork/adapt `star-history`
**Approach:** Reuse the `star-history` frontend/backend shape, replacing GitHub-star ingestion with local Git-word-history ingestion.

**Pros**
- Closest aesthetic lineage to the requested visual style.
- Reuses an existing chart-first product structure.

**Cons**
- Inherits a GitHub-centric architecture, token/rate-limit assumptions, and extra complexity.
- Overbuilt for a single-user local report tool.
- Harder to keep simple and stable.

### Recommendation
Choose **Option A**. It best satisfies the user's actual goal: a dependable local report generator with minimal ceremony. The style can still borrow from `star-history` (layout, typography, chart prominence) without importing its heavier product architecture.

### Invalidation rationale for non-recommended options
- **Option B** is valid but unjustified for the current scope because the frontend pipeline complexity does not buy enough value in V1.
- **Option C** is explicitly rejected for V1 because it optimizes for visual lineage at the expense of simplicity, maintainability, and local-first clarity.

---

## Product Goal
Create a local utility in `/Users/hong/Downloads` that reconstructs word-count history from the user's Obsidian Git repo and generates a clean, Star-History-inspired HTML report with exactly three homepage blocks:
1. total word-count trend,
2. daily net word additions,
3. top notes ranked by historical cumulative net growth.

## User Story
As a writer maintaining a Git-backed Obsidian vault, I want to regenerate a simple history report from my local repository so I can quickly see how my total writing volume changed over time, how much I added per day, and which notes grew the most — without depending on plugins, cloud services, or a complicated dashboard.

## Non-goals
- Obsidian plugin packaging in V1
- Online sync or hosted dashboards
- Large settings UI or many toggles
- Folder statistics on the V1 homepage
- Real-time file watching
- Attempting to reconstruct non-committed writing sessions

## Functional Requirements

### FR1 — Local vault input
The tool must accept a local vault path, with `/Users/hong/Obsidian Notes` as the expected initial target during development and validation.

### FR2 — Git-history reconstruction
The tool must analyze the vault's local Git history and derive a chronological series of markdown word counts.

### FR3 — `novel-word-count` parity target
The tool must compute word counts using a parser aligned to the discovered `novel-word-count` logic:
- trim YAML frontmatter before counting using the plugin's frontmatter-position behavior when metadata is available,
- remove optional content according to active settings,
- compute `spaceDelimitedWordCount`,
- compute `cjkWordCount`,
- define `wordCount = spaceDelimitedWordCount + cjkWordCount`.

For V1, parity must come from a **direct implementation/spec of the observed plugin counting rules** plus a locked fixture suite. The plugin cache may be used as a temporary oracle for HEAD spot checks, but it is not the canonical counting engine.

For V1, the observed active settings imply **no exclusions are enabled**, but the parser layer should still model those exclusion switches so future versions can read them directly from plugin config.

### FR4 — Core datasets
The tool must produce these canonical datasets:
- **Commit trend series**: `(commit_sha, timestamp, total_words)`
- **Daily delta series**: `(date, net_words_added)` aggregated by commit date
- **Per-note growth series**: net growth for each markdown note across analyzed history

### FR5 — Report generation
The tool must generate a local HTML report that is directly openable in a browser and contains exactly three main presentation blocks:
1. total word-count trend chart,
2. daily net additions chart,
3. Top N notes table/list ranked by historical cumulative net growth.

### FR6 — Stable regeneration
The tool must support repeated use. A rerun on the same HEAD should reproduce equivalent output; a rerun on a later HEAD should append/rebuild cleanly without manual cleanup.

### FR7 — Canonical data contract
The tool must emit `analysis.json` as the **canonical versioned output contract** for the computed history. `report.html` must be a pure renderer of `analysis.json`, not an independent source of truth.
At minimum, `analysis.json` must carry:
- `schema_version`
- `generated_at`
- `vault_path`
- `head_commit`
- `renderer_version`
- canonical datasets used by the report

For V1, rendering should be a **build-time generation step**: the CLI reads Git history, writes `analysis.json`, and then renders `report.html` from that JSON in the same run. The browser should not depend on privileged local file reads at runtime.

### FR8 — Explicit rename behavior
V1 must treat note identity as **repository-relative path**. If a note is renamed, the history is split across the old and new paths. This caveat must be documented in the README/report and reflected in fixture expectations.

## Testable Acceptance Criteria
1. A runnable local project exists under `/Users/hong/Downloads/<project-dir>`.
2. Running the CLI against `/Users/hong/Obsidian Notes` produces `analysis.json` and `report.html`.
3. `analysis.json` is the canonical source of truth for computed history, and `report.html` renders from it rather than recomputing history independently.
4. The report homepage contains exactly 3 primary content blocks:
   - total word trend,
   - daily net additions,
   - Top N notes by historical cumulative net growth.
5. Daily net additions are explicitly labeled and computed as **commit-date aggregated** values.
6. Word counting follows the documented `novel-word-count` parity rules, including frontmatter trimming and the `spaceDelimitedWordCount + cjkWordCount` formula.
7. V1 rename behavior is explicit: note identity is path-based and renames split history unless a later version adds lineage handling.
8. The generated report remains viewable without online service dependencies.

## Proposed UX

### CLI shape
V1 should expose one primary command such as:
```bash
python -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes" \
  --out "/Users/hong/Downloads/obsidian-word-history-report"
```

### Output shape
The command should create a small output directory with:
- `report.html` — primary deliverable rendered from canonical data
- `analysis.json` — canonical machine-readable dataset and source of truth for the report
- `.cache/` — optional internal cache for future incremental rebuild support

`analysis.json` is a canonical output artifact, not a homepage feature.

## Architecture

### Recommended implementation slices
1. **Config slice**
   - Resolve vault path, output path, and parser settings.
   - Read current `novel-word-count` config when available.

2. **Git extraction slice**
   - Enumerate relevant commits in chronological order.
   - Prefer markdown-touching commits for efficiency, while keeping totals deterministic.

3. **Counting slice**
   - Parse markdown blobs using `novel-word-count`-compatible logic.
   - Keep the parser as a dedicated module with explicit tests.

4. **Aggregation slice**
   - Derive total trend, daily deltas, and per-note growth.
   - Define note identity as repository-relative markdown path in V1.

5. **Rendering slice**
   - Render one self-contained HTML report.
   - Use a chart style that is visually inspired by `star-history`: chart-first, light chrome, readable legend/labels, no dashboard clutter.

### Data engine choice
For V1, prefer a **snapshot-replay analyzer**:
- replay commit history chronologically and compute counts,
- write canonical results to `analysis.json`,
- keep caching as an **optional optimization path**, not a correctness-critical architectural pillar.

This keeps the logic simpler than a fully diff-driven engine and makes correctness easier to reason about. If cache support is added in V1, it must be gated by equivalence checks against a fresh replay.

## Report Layout

### Block 1 — Total Word Trend
- Primary hero chart at top of page.
- X-axis: commit date/time (rendered as timeline/date trend)
- Y-axis: total words
- Purpose: answer “How has my vault grown overall?”

### Block 2 — Daily Net Additions
- Secondary bar or area chart.
- Aggregation rule: sum commit-level total-word deltas by commit date.
- Purpose: answer “How much did I add on each day with commits?”

### Block 3 — Top Notes by Historical Net Growth
- Ranked list or compact table.
- Metric: `net growth = final_words - initial_words_at_first_observed_commit`
- Purpose: answer “Which notes accumulated the most growth over history?”
- Caveat: ranking is path-based in V1, so renamed notes may appear as separate entries.

## Risks and Mitigations

### Risk 1 — Counting parity mismatch
**Risk:** The tool's counts may drift from `novel-word-count`, reducing trust.

**Mitigation**
- Implement the parser directly from the observed plugin logic.
- Add golden tests for mixed English/CJK markdown fixtures.
- Compare the analyzer's HEAD totals against sampled entries from the plugin cache.

### Risk 2 — Initial run performance
**Risk:** Full-history replay could be slow as the repo grows.

**Mitigation**
- Limit analysis to markdown-relevant history.
- Ship replay-first correctness before cache complexity.
- Treat cache as optional and require equivalence validation against a fresh replay before trusting it.
- Keep V1 architecture simple, but leave room for a future diff-driven engine if needed.

### Risk 3 — Note rename semantics
**Risk:** Renamed notes may appear as separate paths in V1.

**Mitigation**
- Document path-based identity as the V1 rule in both README and report.
- Encode rename-splitting behavior explicitly in test fixtures so implementation does not guess.
- Treat rename-aware lineage as a later enhancement rather than hidden logic.

### Risk 4 — Misinterpretation of “daily”
**Risk:** Users may assume the chart reflects every writing session, not commit-day aggregation.

**Mitigation**
- Label the chart clearly as commit-date aggregated daily net additions.
- Document the limitation in the report and README.

## Milestones
1. **M1 — Parser parity prototype**
2. **M2 — Git history extraction + canonical dataset generation**
3. **M3 — Static report rendering with the 3 required homepage blocks**
4. **M4 — Validation against the real vault + documentation**

## ADR

### Decision
Build V1 as a **Python CLI that generates a self-contained static HTML report** from the local Obsidian Git history.

### Drivers
- Simplicity and repeatability matter more than framework richness.
- The user values stable local reuse over product breadth.
- The requested visual inspiration can be satisfied without inheriting `star-history`'s GitHub-specific architecture.

### Alternatives considered
- Node CLI + static frontend
- Fork/adapt `star-history`

### Why chosen
Python + static HTML is the smallest architecture that still cleanly supports Git analysis, parser testing, and portable reporting.

### Consequences
- We must explicitly craft or vendor lightweight local chart rendering.
- We must define and preserve a canonical `analysis.json` schema.
- We gain an easy-to-rerun local tool with minimal moving parts.
- We defer richer interactivity and multi-view dashboards to later versions.

### Follow-ups
- Add folder statistics in V2
- Consider rename-aware note identity in V2
- Consider cache-based incremental rebuild as a V1.1/V2 optimization after replay equivalence is proven
- Consider a richer chart interaction model only after V1 proves useful

## Execution Follow-up Guidance
If/when execution starts, recommended staffing is:
- **`executor`** — main implementation lane
- **`test-engineer`** — test-spec review and validation hardening
- **`verifier`** — final evidence pass against the real vault

Reasoning effort guidance:
- Parser/counting logic: **high**
- Report rendering: **medium**
- Verification/manual parity checks: **medium**
