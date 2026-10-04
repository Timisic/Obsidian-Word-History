import * as fs from "fs";
import * as path from "path";
import { renderChartSvg, type ChartOptions } from "./chart";
export { renderChartSvg } from "./chart";
import { gitBuffer, gitText } from "./git";
import type { AnalysisState, BuildResult, CommitInfo, CountConfig, CountResult } from "./types";

const CACHE_SCHEMA_VERSION = "js-1";
const COUNTABLE_EXTENSIONS = new Set([
  "", "markdown", "md", "mdml", "mdown", "mdtext", "mdtxt", "mdwn", "mkd", "mkdn",
  "canvas", "txt", "text", "rtf", "qmd", "rmd", "fountain", "tex",
]);

export async function buildWordHistory(vaultPath: string, outputPath: string, cachePath: string, chartOptions: ChartOptions = {}): Promise<BuildResult> {
  const repoPath = path.resolve(vaultPath);
  const countConfig = loadCountConfig(repoPath);
  const headCommit = (await gitText(repoPath, ["rev-parse", "HEAD"])).trim();
  const previousTotal = readCachedTotal(cachePath);
  const state = await loadAnalysisState(repoPath, countConfig, headCommit, cachePath);
  const analysis = finalizeAnalysis(repoPath, headCommit, countConfig, state);
  const svg = renderChartSvg(analysis, undefined, chartOptions);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, "utf8");
  writeCache(repoPath, countConfig, headCommit, cachePath, state);

  const currentTotal = Number(analysis.summary.latest_total_words || 0);
  return {
    analysis,
    chartSvgPath: outputPath,
    headCommit,
    wordsAddedSinceLastRun: currentTotal - previousTotal,
    currentTotalWords: currentTotal,
  };
}

async function loadAnalysisState(repoPath: string, countConfig: CountConfig, headCommit: string, cachePath: string): Promise<AnalysisState> {
  const cached = await loadCache(repoPath, countConfig, headCommit, cachePath);
  const state: AnalysisState = cached ? cloneState(cached.state) : emptyState();
  const commits = cached
    ? await listCommits(repoPath, `${cached.head_commit}..HEAD`)
    : await listCommits(repoPath, null);

  for (const commit of commits) {
    const touchedPaths = await applyCommitChanges(repoPath, commit.sha, state.currentCounts, countConfig);
    for (const touchedPath of touchedPaths) {
      if (!state.noteActivity[touchedPath]) state.noteActivity[touchedPath] = [];
      state.noteActivity[touchedPath].push(commit.timestamp);
    }
    for (const currentPath of Object.keys(state.currentCounts)) {
      if (!state.noteTotals[currentPath]) state.noteTotals[currentPath] = Array(state.commitTrend.length).fill(0);
    }
    for (const notePath of Object.keys(state.noteTotals)) {
      state.noteTotals[notePath].push(Number(state.currentCounts[notePath] || 0));
    }
    state.commitTrend.push({
      commit_sha: commit.sha,
      timestamp: commit.timestamp,
      total_words: sum(Object.values(state.currentCounts)),
      tracked_notes: Object.keys(state.currentCounts).length,
    });
  }
  return state;
}

function finalizeAnalysis(repoPath: string, headCommit: string, countConfig: CountConfig, state: AnalysisState) {
  const commitTrend = state.commitTrend;
  const asOfTimestamp = commitTrend.length ? String(commitTrend[commitTrend.length - 1].timestamp) : utcNowIso();
  const dailyDeltas = aggregatePeriodDeltas(commitTrend, "day");
  const weeklyDeltas = aggregatePeriodDeltas(commitTrend, "week");
  const monthlyDeltas = aggregatePeriodDeltas(commitTrend, "month");
  const notes = buildNoteMetrics(state.noteTotals, state.noteActivity, state.currentCounts, commitTrend, asOfTimestamp);
  const folders = buildFolderMetrics(notes);
  return {
    schema_version: "1",
    renderer_version: "1",
    generated_at: utcNowIso(),
    vault_path: repoPath,
    head_commit: headCommit,
    settings: countConfig,
    summary: {
      commit_count: commitTrend.length,
      latest_total_words: commitTrend.length ? commitTrend[commitTrend.length - 1].total_words : 0,
      notes_tracked: commitTrend.length ? commitTrend[commitTrend.length - 1].tracked_notes : 0,
      latest_commit_at: asOfTimestamp,
      recent_30d_words_added: sumRecentPeriodValues(dailyDeltas, asOfTimestamp, 30),
      recent_30d_active_notes: notes.filter((note) => Number(note.touch_count_30d) > 0).length,
    },
    commit_trend: commitTrend,
    recent_active_notes_30d: buildRecentActiveNotes(state.noteActivity, state.currentCounts, asOfTimestamp, 10),
    top_notes: buildTopNotes(state.noteTotals, 10),
    notes,
    folders,
    series: { daily_deltas: dailyDeltas, weekly_deltas: weeklyDeltas, monthly_deltas: monthlyDeltas },
  };
}

async function listCommits(repoPath: string, revRange: string | null): Promise<CommitInfo[]> {
  const args = ["log", "--first-parent", "--reverse", "--format=%H%x00%cI"];
  if (revRange) args.push(revRange);
  const output = await gitText(repoPath, args);
  if (!output.trim()) return [];
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, timestamp] = line.split("\x00", 2);
    return { sha, timestamp };
  });
}

async function applyCommitChanges(repoPath: string, commitSha: string, currentCounts: Record<string, number>, countConfig: CountConfig): Promise<string[]> {
  const touchedPaths = [];
  for (const change of await listCommitChanges(repoPath, commitSha)) {
    const status = change[0];
    if (status.startsWith("R")) {
      const [, oldPath, newPath] = change;
      if (isCountablePath(oldPath)) {
        delete currentCounts[oldPath];
        touchedPaths.push(oldPath);
      }
      if (isCountablePath(newPath)) {
        currentCounts[newPath] = await countPathAtCommit(repoPath, commitSha, newPath, countConfig);
        touchedPaths.push(newPath);
      }
    } else if (status.startsWith("C")) {
      const newPath = change[2];
      if (isCountablePath(newPath)) {
        currentCounts[newPath] = await countPathAtCommit(repoPath, commitSha, newPath, countConfig);
        touchedPaths.push(newPath);
      }
    } else {
      const filePath = change[1];
      if (status === "D") {
        if (isCountablePath(filePath)) {
          delete currentCounts[filePath];
          touchedPaths.push(filePath);
        }
      } else if (isCountablePath(filePath)) {
        currentCounts[filePath] = await countPathAtCommit(repoPath, commitSha, filePath, countConfig);
        touchedPaths.push(filePath);
      }
    }
  }
  return touchedPaths;
}

async function listCommitChanges(repoPath: string, commitSha: string): Promise<string[][]> {
  const output = await gitBuffer(repoPath, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", commitSha]);
  if (!output.length) return [];
  const tokens = output.toString("utf8").split("\x00");
  const changes = [];
  let index = 0;
  while (index < tokens.length - 1) {
    const status = tokens[index];
    if (!status) break;
    index += 1;
    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push([status, tokens[index], tokens[index + 1]]);
      index += 2;
    } else {
      changes.push([status, tokens[index]]);
      index += 1;
    }
  }
  return changes;
}

async function countPathAtCommit(repoPath: string, commitSha: string, filePath: string, countConfig: CountConfig): Promise<number> {
  const content = (await gitBuffer(repoPath, ["show", `${commitSha}:${filePath}`])).toString("utf8");
  return countCountableText(filePath, content, countConfig).word_count;
}

function loadCountConfig(vaultPath: string): CountConfig {
  const configPath = path.join(vaultPath, ".obsidian", "plugins", "novel-word-count", "data.json");
  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      exclude_comments: Boolean(data.excludeComments),
      exclude_code_blocks: Boolean(data.excludeCodeBlocks),
      exclude_non_visible_link_portions: Boolean(data.excludeNonVisibleLinkPortions),
      exclude_footnotes: Boolean(data.excludeFootnotes),
    };
  } catch (_error) {
    return defaultCountConfig();
  }
}

function defaultCountConfig(): CountConfig {
  return {
    exclude_comments: false,
    exclude_code_blocks: false,
    exclude_non_visible_link_portions: false,
    exclude_footnotes: false,
  };
}

export function countCountableText(filePath: string, content: string, countConfig: CountConfig): CountResult {
  if (path.extname(filePath).toLowerCase() === ".canvas") {
    return countMarkdown(extractCanvasText(content), countConfig);
  }
  return countMarkdown(content, countConfig);
}

export function countMarkdown(content: string, countConfig: CountConfig = defaultCountConfig()): CountResult {
  const meaningfulContent = removeNonCountedContent(trimFrontmatter(content), countConfig);
  const cjkMatches = meaningfulContent.match(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/gu) || [];
  const withoutCjk = meaningfulContent.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/gu, " ");
  const withoutSymbols = withoutCjk.replace(/[\p{P}\p{S}]/gu, "");
  const words = withoutSymbols.trim() ? withoutSymbols.trim().split(/\s+/u) : [];
  const lines = meaningfulContent === "" ? [] : meaningfulContent.split("\n");
  return {
    char_count: meaningfulContent.length,
    non_whitespace_char_count: (meaningfulContent.match(/\S/gu) || []).length,
    newline_count: lines.length,
    space_delimited_word_count: words.length,
    cjk_word_count: cjkMatches.length,
    word_count: words.length + cjkMatches.length,
  };
}

function trimFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const lines = content.split(/(?<=\n)/u);
  if (!lines.length || lines[0].trim() !== "---") return content;
  let offset = lines[0].length;
  for (const line of lines.slice(1)) {
    if (["---", "..."].includes(line.trim())) return content.slice(offset + line.replace(/[\r\n]+$/u, "").length);
    offset += line.length;
  }
  return content;
}

function removeNonCountedContent(content: string, config: CountConfig): string {
  let result = content;
  if (config.exclude_code_blocks) result = result.replace(/```[\s\S]+?```/gu, "");
  if (config.exclude_comments) result = result.replace(/%%[\s\S]+?%%|<!--[\s\S]+?-->/gu, "");
  if (config.exclude_non_visible_link_portions) {
    result = result.replace(/\[([^\]]*?)\]\([^)]*?\)/gu, "$1");
    result = result.replace(/\[\[(.*?)\]\]/gu, (_match: string, inner: string) => (inner.includes("|") ? inner.split("|").slice(1).join("|") : inner));
  }
  if (config.exclude_footnotes) {
    result = result.replace(/\[\^.+?\]: .*/gu, "").replace(/\[\^.+?\]/gu, "");
  }
  return result;
}

function extractCanvasText(content: string): string {
  try {
    return (JSON.parse(content).nodes || []).map((node: any) => node.text).filter(Boolean).join("\n");
  } catch (_error) {
    return "";
  }
}

export function isCountablePath(filePath: string): boolean {
  if (filePath.split(/[\\/]+/u).some((part: string) => part.startsWith("."))) return false;
  const extension = path.extname(filePath).toLowerCase().replace(/^\./u, "");
  return COUNTABLE_EXTENSIONS.has(extension);
}

async function loadCache(repoPath: string, countConfig: CountConfig, headCommit: string, cachePath: string): Promise<any> {
  if (!cachePath || !fs.existsSync(cachePath)) return null;
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch (_error) {
    return null;
  }
  if (
    payload.schema_version !== CACHE_SCHEMA_VERSION ||
    payload.vault_path !== repoPath ||
    JSON.stringify(payload.settings) !== JSON.stringify(countConfig) ||
    !payload.head_commit ||
    !payload.state ||
    !hasCacheStateShape(payload.state)
  ) return null;
  if (payload.head_commit === headCommit) return payload;
  return await isAncestor(repoPath, payload.head_commit, headCommit) ? payload : null;
}

function writeCache(repoPath: string, countConfig: CountConfig, headCommit: string, cachePath: string, state: AnalysisState): void {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const payload = {
    schema_version: CACHE_SCHEMA_VERSION,
    vault_path: repoPath,
    settings: countConfig,
    head_commit: headCommit,
    state,
  };
  const tempPath = path.join(path.dirname(cachePath), `.${path.basename(cachePath)}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, cachePath);
}

function readCachedTotal(cachePath: string): number {
  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const trend = payload && payload.state && Array.isArray(payload.state.commitTrend) ? payload.state.commitTrend : [];
    return trend.length ? Number(trend[trend.length - 1].total_words || 0) : 0;
  } catch (_error) {
    return 0;
  }
}

function hasCacheStateShape(state: any) {
  return Boolean(
    state &&
    typeof state.currentCounts === "object" && !Array.isArray(state.currentCounts) &&
    typeof state.noteTotals === "object" && !Array.isArray(state.noteTotals) &&
    typeof state.noteActivity === "object" && !Array.isArray(state.noteActivity) &&
    Array.isArray(state.commitTrend)
  );
}

function emptyState(): AnalysisState {
  return { currentCounts: {}, noteTotals: {}, noteActivity: {}, commitTrend: [] };
}

function cloneState(state: AnalysisState): AnalysisState {
  return {
    currentCounts: Object.fromEntries(Object.entries(state.currentCounts).map(([key, value]) => [key, Number(value)])),
    noteTotals: Object.fromEntries(Object.entries(state.noteTotals).map(([key, values]) => [key, (values as any[]).map(Number)])),
    noteActivity: Object.fromEntries(Object.entries(state.noteActivity).map(([key, values]) => [key, (values as any[]).map(String)])),
    commitTrend: state.commitTrend.map((entry: any) => Object.assign({}, entry)),
  };
}

async function isAncestor(repoPath: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await gitBuffer(repoPath, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (_error) {
    return false;
  }
}

function aggregatePeriodDeltas(commitSeries: any[], period: string) {
  const grouped = new Map();
  let previousTotal = 0;
  for (const entry of commitSeries) {
    const totalWords = Number(entry.total_words);
    const label = periodStartLabel(String(entry.timestamp), period);
    grouped.set(label, (grouped.get(label) || 0) + totalWords - previousTotal);
    previousTotal = totalWords;
  }
  return [...grouped.keys()].sort().map((label) => ({ date: label, net_words_added: grouped.get(label) }));
}

function periodStartLabel(timestamp: any, period: any) {
  const moment = parseIsoDate(timestamp);
  if (period === "day") return toDateLabel(moment);
  if (period === "week") {
    const weekday = (moment.getUTCDay() + 6) % 7;
    const start = new Date(moment.getTime() - weekday * 24 * 60 * 60 * 1000);
    return toDateLabel(start);
  }
  return `${moment.getUTCFullYear()}-${pad2(moment.getUTCMonth() + 1)}-01`;
}

function sumRecentPeriodValues(series: Array<{ date: string; net_words_added: number }>, asOfTimestamp: string, days: number) {
  const end = parseDateOnly(toDateLabel(parseIsoDate(asOfTimestamp))).getTime();
  const start = end - days * 24 * 60 * 60 * 1000;
  let total = 0;
  for (const entry of series) {
    const dateMs = parseDateOnly(String(entry.date)).getTime();
    if (start <= dateMs && dateMs <= end) total += Number(entry.net_words_added);
  }
  return total;
}

function buildTopNotes(noteTotals: Record<string, number[]>, topN: number) {
  const items = [];
  for (const [notePath, series] of Object.entries(noteTotals)) {
    if (!series.length) continue;
    let initial = Number(series[0]);
    const final = Number(series[series.length - 1]);
    if (initial === 0 && final === 0) initial = series.find((value) => Number(value) !== 0) || 0;
    items.push({ path: notePath, initial_words: initial, final_words: final, net_growth: final - initial });
  }
  items.sort((a, b) => b.net_growth - a.net_growth || a.path.localeCompare(b.path));
  return items.slice(0, topN);
}

function buildRecentActiveNotes(noteActivity: Record<string, string[]>, currentCounts: Record<string, number>, asOfTimestamp: string, topN: number) {
  const windowEnd = parseIsoDate(asOfTimestamp).getTime();
  const windowStart = windowEnd - 30 * 24 * 60 * 60 * 1000;
  const items = [];
  for (const [notePath, timestamps] of Object.entries(noteActivity)) {
    const recent = timestamps.filter((timestamp) => {
      const t = parseIsoDate(timestamp).getTime();
      return windowStart <= t && t <= windowEnd;
    });
    if (!recent.length) continue;
    items.push({
      path: notePath,
      touch_count_30d: recent.length,
      latest_touch_at: recent.sort((a, b) => parseIsoDate(b).getTime() - parseIsoDate(a).getTime())[0],
      current_words: Number(currentCounts[notePath] || 0),
    });
  }
  items.sort((a, b) => b.touch_count_30d - a.touch_count_30d || a.path.localeCompare(b.path));
  return items.slice(0, topN);
}

function buildNoteMetrics(noteTotals: Record<string, number[]>, noteActivity: Record<string, string[]>, currentCounts: Record<string, number>, commitTrend: any[], asOfTimestamp: string) {
  const timestamps = commitTrend.map((entry) => String(entry.timestamp));
  const windowEnd = parseIsoDate(asOfTimestamp).getTime();
  const windowStart = windowEnd - 30 * 24 * 60 * 60 * 1000;
  const items = [];
  for (const [notePath, series] of Object.entries(noteTotals)) {
    if (!series.length) continue;
    let initial = Number(series[0]);
    const final = Number(series[series.length - 1]);
    if (initial === 0 && final === 0) initial = series.find((value) => Number(value) !== 0) || 0;
    const peakWords = Math.max(...series.map(Number));
    const peakIndex = series.map(Number).indexOf(peakWords);
    const allTimestamps = noteActivity[notePath] || [];
    const recentTimestamps = allTimestamps.filter((timestamp) => {
      const t = parseIsoDate(timestamp).getTime();
      return windowStart <= t && t <= windowEnd;
    });
    items.push({
      path: notePath,
      folder: parentFolder(notePath),
      exists: Object.prototype.hasOwnProperty.call(currentCounts, notePath),
      current_words: Number(currentCounts[notePath] || 0),
      initial_words: initial,
      final_words: final,
      peak_words: peakWords,
      peak_words_at: timestamps[peakIndex] || asOfTimestamp,
      net_growth: final - initial,
      touch_count_total: allTimestamps.length,
      touch_count_30d: recentTimestamps.length,
      latest_touch_at: allTimestamps.length ? allTimestamps.sort((a, b) => parseIsoDate(b).getTime() - parseIsoDate(a).getTime())[0] : asOfTimestamp,
    });
  }
  items.sort((a, b) => Number(b.current_words) - Number(a.current_words) || a.path.localeCompare(b.path));
  return items;
}

function buildFolderMetrics(noteMetrics: any) {
  const grouped = new Map();
  for (const note of noteMetrics) {
    for (const folderPath of folderPrefixesForNote(String(note.path))) {
      if (!grouped.has(folderPath)) {
        grouped.set(folderPath, {
          path: folderPath,
          depth: folderPath === "(root)" ? 0 : folderPath.split("/").length,
          note_count: 0,
          active_notes_30d: 0,
          current_words: 0,
          net_growth: 0,
          touch_count_30d: 0,
          latest_touch_at: note.latest_touch_at,
        });
      }
      const bucket = grouped.get(folderPath);
      if (note.exists) bucket.note_count += 1;
      if (Number(note.touch_count_30d) > 0) bucket.active_notes_30d += 1;
      bucket.current_words += Number(note.current_words);
      bucket.net_growth += Number(note.net_growth);
      bucket.touch_count_30d += Number(note.touch_count_30d);
      if (parseIsoDate(note.latest_touch_at) >= parseIsoDate(bucket.latest_touch_at)) bucket.latest_touch_at = note.latest_touch_at;
    }
  }
  return [...grouped.values()].sort((a, b) => b.current_words - a.current_words || a.path.localeCompare(b.path));
}

function parentFolder(notePath: any) {
  const parts = notePath.split("/").slice(0, -1);
  return parts.length ? parts.join("/") : "(root)";
}

function folderPrefixesForNote(notePath: any) {
  const parts = notePath.split("/").slice(0, -1);
  if (!parts.length) return ["(root)"];
  const prefixes = ["(root)"];
  for (let index = 1; index <= parts.length; index += 1) prefixes.push(parts.slice(0, index).join("/"));
  return prefixes;
}

function parseIsoDate(value: any) {
  return new Date(String(value).replace("Z", "+00:00"));
}

function parseDateOnly(value: any) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateLabel(value: any) {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function pad2(value: any) {
  return String(value).padStart(2, "0");
}

function sum(values: any) {
  return values.reduce((total: number, value: any) => total + Number(value), 0);
}
