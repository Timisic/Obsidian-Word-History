# V1 implementation review checklist

Use this checklist when reviewing the implementation against the approved PRD and test spec.

## Current repo reality

As of 2026-04-12, this repository contains planning artifacts only. Use this checklist to review incoming implementation work and to keep documentation consistent while parallel workers land code.

## Product contract

- [ ] Architecture stays Python CLI + static HTML
- [ ] Analysis is replay-first; cache remains optional and non-authoritative
- [ ] `analysis.json` is the canonical output contract
- [ ] `report.html` renders from `analysis.json` instead of recomputing history
- [ ] Homepage contains exactly three primary blocks
- [ ] Rename behavior is documented as path-based split history in V1

## Counting and data rules

- [ ] Frontmatter trimming matches documented parity rules
- [ ] Word formula is `spaceDelimitedWordCount + cjkWordCount`
- [ ] Exclusion toggles exist even if current validation keeps them disabled
- [ ] Daily net additions are aggregated by commit date
- [ ] Top notes are ranked by historical cumulative net growth, not current total

## Test coverage gate

- [ ] Unit fixtures cover English, CJK, mixed text, frontmatter, links, footnotes, comments, and fenced code blocks
- [ ] Toggle tests verify each exclusion changes counts in the expected direction
- [ ] Integration tests replay a temporary Git repo with same-day commits and rename/deletion behavior
- [ ] Rendering tests verify exactly three homepage sections
- [ ] Renderer consistency tests prove `report.html` can be rebuilt from the same `analysis.json`
- [ ] Real-vault verification is recorded or remaining gaps are explicitly called out

## Quality review prompts

- [ ] Is the analyzer deterministic for the same vault state and settings?
- [ ] Are parser/counting rules isolated in a dedicated module with explicit tests?
- [ ] Does the renderer avoid network dependencies?
- [ ] Are V1 limitations visible in both README and generated report copy?
- [ ] Does the implementation avoid hidden rename-lineage logic not approved for V1?

## Suggested verification commands

Replace placeholders with actual project commands once implementation lands:

```bash
# Lint
<lint-command>

# Tests
<test-command>

# Type / static check
<typecheck-command>

# End-to-end build
python -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes" \
  --out "/tmp/obsidian-word-history-report"
```

## Review outcome template

```text
Verification:
- PASS/FAIL Lint: <command + summary>
- PASS/FAIL Tests: <command + summary>
- PASS/FAIL Typecheck: <command + summary>
- PASS/FAIL E2E build: <command + summary>
- PASS/FAIL Real-vault parity spot check: <summary>

Risks:
- <remaining issue or explicit none>
```
