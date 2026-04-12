# Obsidian Word History Tool

Local-first utility for rebuilding an Obsidian vault's word-count history from Git and rendering a static HTML report.

## Status

Planning for V1 is approved in:

- `.omx/plans/prd-obsidian-word-history-tool.md`
- `.omx/plans/test-spec-obsidian-word-history-tool.md`

Implementation is still in progress. This README captures the agreed product contract so code and documentation stay aligned while parallel workers build the tool.

## V1 goals

Generate a local report for a Git-backed Obsidian vault with exactly three homepage blocks:

1. total word-count trend
2. daily net additions aggregated by commit date
3. top notes ranked by historical cumulative net growth

## Intended CLI

```bash
python -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes" \
  --out "/Users/hong/Downloads/obsidian-word-history-report"
```

## Output contract

Each build should produce:

- `analysis.json` — canonical versioned dataset
- `report.html` — pure renderer of `analysis.json`
- `.cache/` — optional internal cache only when it can be proven equivalent to a fresh replay

`analysis.json` must contain at least:

- `schema_version`
- `generated_at`
- `vault_path`
- `head_commit`
- `renderer_version`
- canonical datasets for the report

## Counting rules

V1 targets parity with the observed `novel-word-count` behavior:

- trim YAML frontmatter before counting
- model exclusion switches for comments, code blocks, non-visible link portions, and footnotes
- compute `spaceDelimitedWordCount`
- compute `cjkWordCount`
- define `wordCount = spaceDelimitedWordCount + cjkWordCount`

Current discovered settings imply exclusions are disabled during validation, but the parser should preserve those switches in code and tests.

## V1 caveats

- Note identity is repository-relative path.
- Renames split history across old and new paths.
- “Daily” means commit-date aggregated net additions, not every writing session.
- The report must remain offline-viewable with no remote asset dependency.

## Verification expectations

Before V1 is considered complete:

1. parser fixture tests pass
2. temporary Git fixture replay tests pass
3. `analysis.json` and `report.html` are generated together
4. the homepage contains exactly the approved three sections
5. a real-vault run succeeds against `/Users/hong/Obsidian Notes`
6. HEAD spot checks against `novel-word-count` are documented

See `docs/review-checklist.md` for the implementation review gate.
