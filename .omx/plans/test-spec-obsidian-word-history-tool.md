# Test Specification — Obsidian Word History Tool

## Scope
This test specification covers the V1 local CLI + HTML report tool defined in `.omx/plans/prd-obsidian-word-history-tool.md`.

## Quality Goal
Prove that the tool is:
1. **correct enough to trust**,
2. **stable enough to rerun**, and
3. **simple enough to preserve**.

---

## Test Levels

### 1. Unit tests
Focus: deterministic parser and aggregation behavior.

#### U1 — Markdown word-count parity fixtures
Validate the parser against synthetic markdown fixtures covering:
- plain English text
- plain CJK text
- mixed English + CJK text
- files with YAML frontmatter
- punctuation-heavy text
- markdown links `[]()`
- wiki links `[[...]]`
- footnotes
- HTML comments / Obsidian comments
- fenced code blocks

Expected rule set should match the observed plugin logic:
- frontmatter is trimmed before counting,
- `wordCount = cjkWordCount + spaceDelimitedWordCount`
- exclusions are applied only when enabled

#### U2 — Exclusion toggles
Given a fixture containing comments, code blocks, link targets, and footnotes, verify that enabling each exclusion changes counts exactly in the expected direction.

#### U3 — Daily aggregation
Given commit-level total word counts across multiple commits on the same day, verify that daily net additions equal the sum of same-day commit deltas.

#### U4 — Per-note growth ranking
Given a sequence of note totals across time, verify that note ranking uses **historical cumulative net growth** (`final - initial`) rather than current total or last-30-day growth.

#### U5 — Empty / edge cases
Verify handling of:
- empty notes
- deleted notes
- notes introduced mid-history
- notes with only punctuation or whitespace

### 2. Integration tests
Focus: Git extraction and end-to-end dataset assembly.

#### I1 — Temporary fixture repo replay
Create a small temporary Git repo in tests with a few markdown commits:
- initial note creation
- later note edits
- same-day multiple commits
- note deletion or rename event

Run the analyzer and verify:
- chronological commit series is correct
- total trend values match expected totals
- daily deltas match expected same-day aggregation
- Top N ranking matches expected net growth
- rename behavior follows the documented V1 rule: old path and new path are treated as separate note identities

#### I2 — Incremental cache reuse
**Optional / non-blocking for V1.** If cache support is implemented in the first cut:
Run the analyzer twice on the same fixture repo:
1. initial build
2. add one new commit and rerun

Verify:
- cached prior analysis is reused when applicable
- final dataset equals a fresh full rebuild result

#### I3 — Output artifact generation
Run the CLI against the fixture repo and verify creation of:
- `report.html`
- `analysis.json`
- optional `.cache/` contents

### 3. Rendering verification
Focus: report correctness and stability.

#### R1 — HTML structural assertions
Parse generated `report.html` and verify the presence of exactly three homepage content sections:
1. total word trend
2. daily net additions
3. top notes ranking

#### R2 — Analysis/report consistency
Verify that chart input data embedded in the report matches `analysis.json`.

#### R2.1 — Canonical renderer contract
Verify that `report.html` is renderable purely from `analysis.json`, and that rerendering from the same `analysis.json` produces deterministic output for the same renderer version.
Also verify that `analysis.json` contains the required contract metadata:
- `schema_version`
- `generated_at`
- `vault_path`
- `head_commit`
- `renderer_version`

#### R3 — No online dependency regression
Verify the generated report does not require remote assets to display core content.

### 4. Manual verification
Focus: real-vault trust check.

#### M1 — Real vault run
Run the tool on `/Users/hong/Obsidian Notes` and verify:
- the command completes successfully,
- `report.html` opens locally,
- charts render,
- the Top N notes look plausible against recent vault activity.

#### M2 — HEAD parity spot check against `novel-word-count`
Select a sample of notes from the plugin cache and verify that the tool's HEAD counts match or document any bounded, explainable differences.

#### M3 — Daily delta interpretation check
Confirm the report labels make it clear that “daily” means **commit-date aggregated** rather than every writing session.

#### M4 — Rename caveat visibility
Confirm the README/report explicitly states that V1 note identity is path-based and that renames split note history.

---

## Acceptance Test Matrix

| PRD Acceptance Criterion | Test Coverage |
|---|---|
| Runnable local project exists | I3, M1 |
| CLI reads local Git history and generates report | I1, I3, M1 |
| HTML opens locally | R1, M1 |
| Exactly 3 homepage blocks | R1 |
| Daily additions are commit-date aggregated | U3, I1, M3 |
| Top N sorted by historical cumulative net growth | U4, I1, M1 |
| No online service / no extra homepage modules | R1, R3, M1 |
| Counts align with `novel-word-count` semantics | U1, U2, M2 |
| `analysis.json` is canonical and report is a pure renderer | R2, R2.1 |
| Rename behavior is explicit and non-implicit | I1, M4 |

---

## Test Data Strategy
- **Synthetic fixtures** for deterministic parser and Git-history tests.
- **Real local vault spot checks** for trust and parity validation.
- Do **not** commit private vault contents into the project repository.

## Failure Thresholds
- Parser unit tests: **0 tolerance** for fixture mismatches.
- Integration fixture datasets: **0 tolerance** for expected-series mismatches.
- Real-vault parity check: minor documented deltas are acceptable only if traced to a clearly documented rule difference; otherwise treated as failure.

## Deferred Test Areas (V2+)
- Folder statistics validation
- Rename-aware note identity
- Multi-vault support
- Alternate chart themes / richer interactions
- Required cache equivalence if cache ships later

## Exit Criteria
The implementation is ready to ship for V1 only when:
1. unit and integration tests pass,
2. the real-vault run succeeds,
3. the report remains offline-viewable,
4. the report homepage contains only the 3 approved sections,
5. parity with `novel-word-count` is demonstrated or any remaining difference is explicitly documented and accepted.
