export type UpdateMode = "manual" | "interval" | "git-changes";

export interface WordHistorySettings {
  outputPath: string;
  updateMode: UpdateMode;
  intervalDays: number;
  lastRunAt: number;
  lastSeenHead: string;
  lastRunStatus: string;
  lastRunError: string;
  lastGeneratedPath: string;
  lastWordsAdded: number;
  lastTotalWords: number;
}


export interface CountConfig {
  exclude_comments: boolean;
  exclude_code_blocks: boolean;
  exclude_non_visible_link_portions: boolean;
  exclude_footnotes: boolean;
}

export interface CommitInfo {
  sha: string;
  timestamp: string;
}

export interface CommitTrendEntry {
  commit_sha: string;
  timestamp: string;
  total_words: number;
  tracked_notes: number;
}

export interface AnalysisState {
  currentCounts: Record<string, number>;
  noteTotals: Record<string, number[]>;
  noteActivity: Record<string, string[]>;
  commitTrend: CommitTrendEntry[];
}

export interface CountResult {
  char_count: number;
  non_whitespace_char_count: number;
  newline_count: number;
  space_delimited_word_count: number;
  cjk_word_count: number;
  word_count: number;
}

export interface BuildResult {
  analysis: any;
  chartSvgPath: string;
  headCommit: string;
  wordsAddedSinceLastRun: number;
  currentTotalWords: number;
}

export interface PreflightCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
  headCommit: string;
}
