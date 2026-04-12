# Obsidian Word History Dashboard Spec

## Goal
Add a dynamic, static-first dashboard frontend for Obsidian word-history data with a warm editorial visual direction inspired by Claude-like layouts.

## Confirmed decisions
- Static frontend, no framework build step required
- Overview-first dashboard homepage
- Expand analysis data model before frontend
- Medium interaction depth
- Mixed KPI cards
- Folder stats support mixed metric switching
- Single-page dashboard with right-side detail drawer
- Drawer supports both note and folder detail
- Data source supports both default repo output and manual upload override
- Use a lightweight charting library; implementation choice: ECharts in plain static HTML/JS

## Functional requirements
1. Python analysis output remains backward-compatible for existing chart generation and adds dashboard-friendly aggregates.
2. Build output includes dashboard-capable data:
   - summary KPIs
   - full note-level metrics
   - folder-level metrics
   - daily/weekly/monthly delta series
3. Static frontend provides:
   - KPI cards
   - main trend chart
   - delta chart
   - note and folder leaderboards
   - folder metric switcher
   - search and filter controls
   - detail drawer for notes/folders
   - upload JSON fallback / override
4. CLI should produce a locally openable dashboard artifact for immediate use.

## Data model additions
- summary.latest_commit_at
- summary.recent_30d_words_added
- summary.recent_30d_active_notes
- notes[] with note-level metrics
- folders[] with folder-level aggregates
- series.daily_deltas / weekly_deltas / monthly_deltas

## UX shape
- Warm neutral background, terracotta accent, editorial spacing
- Hero header + KPI rail
- Two-chart overview band
- Two leaderboard sections
- Persistent side drawer for selected entity

## Constraints
- No frontend build pipeline required
- No backend service required
- Existing CLI/tests must remain green
- Keep diffs reviewable and repo-local
