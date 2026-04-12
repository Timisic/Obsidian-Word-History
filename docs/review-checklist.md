# V1 implementation review checklist

Use this checklist when reviewing the implementation against the approved PRD and test spec.

## Current repo reality

As of 2026-04-12, the repository contains the V1 implementation plus the approved planning artifacts. Use this checklist to review ongoing edits against the original contract.

## Product contract

- [ ] Architecture stays Python CLI + static SVG artifacts
- [ ] Analysis is replay-first; cache remains optional and non-authoritative
- [ ] `analysis.json` is the canonical output contract
- [ ] Output contract stays focused on `analysis.json` + `chart.svg`
- [ ] README and CLI output both describe the same two generated artifacts
- [ ] Rename behavior is documented as path-based split history in V1

## Counting and data rules

- [ ] Frontmatter trimming matches documented parity rules
- [ ] Word formula is `spaceDelimitedWordCount + cjkWordCount`
- [ ] Exclusion toggles exist even if current validation keeps them disabled
- [ ] Recent-active ranking uses last-30-day Git touch frequency
- [ ] `chart.svg` remains the primary presentation artifact

## Test coverage gate

- [ ] Unit fixtures cover English, CJK, mixed text, frontmatter, links, footnotes, comments, and fenced code blocks
- [ ] Toggle tests verify each exclusion changes counts in the expected direction
- [ ] Integration tests replay a temporary Git repo with same-day commits and rename/deletion behavior
- [ ] Rendering tests verify `chart.svg` structure without remote dependencies
- [ ] CLI integration tests prove the output contract stays `analysis.json` + `chart.svg`
- [ ] Real-vault verification is recorded or remaining gaps are explicitly called out

## Quality review prompts

- [ ] Is the analyzer deterministic for the same vault state and settings?
- [ ] Are parser/counting rules isolated in a dedicated module with explicit tests?
- [ ] Does the renderer avoid network dependencies?
- [ ] Are V1 limitations visible in the README and SVG-first output contract?
- [ ] Does the implementation avoid hidden rename-lineage logic not approved for V1?

## Suggested verification commands

```bash
# Static syntax check
python3 -m py_compile obsidian_word_history/*.py tests/*.py

# Tests
python3 -m unittest discover -s tests -v

# Type / static check
# No dedicated type checker is configured in this repo today; use LSP diagnostics / py_compile.

# End-to-end build
PYTHONPATH=. python3 -m obsidian_word_history build \
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
