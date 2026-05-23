import * as fs from "fs";
import * as path from "path";
import { gitBuffer, gitText } from "./git";
import type { AnalysisState, BuildResult, CommitInfo, CountConfig, CountResult } from "./types";

const CACHE_SCHEMA_VERSION = "js-1";
const CHART_TITLE = "Word History";
const Y_AXIS_LABEL = "Words";
const LEGEND_LABEL = "Total Words";
const MARGIN = { top: 60, right: 30, bottom: 50, left: 70 };
const DATE_TICK_CHAR_WIDTH = 8;
const DATE_TICK_GAP = 8;
const COLORS = { background: "white", stroke: "black", series: "#dd4528" };
const COUNTABLE_EXTENSIONS = new Set([
  "", "markdown", "md", "mdml", "mdown", "mdtext", "mdtxt", "mdwn", "mkd", "mkdn",
  "canvas", "txt", "text", "rtf", "qmd", "rmd", "fountain", "tex",
]);

export async function buildWordHistory(vaultPath: string, outputPath: string, cachePath: string): Promise<BuildResult> {
  const repoPath = path.resolve(vaultPath);
  const countConfig = loadCountConfig(repoPath);
  const headCommit = (await gitText(repoPath, ["rev-parse", "HEAD"])).trim();
  const previousTotal = readCachedTotal(cachePath);
  const state = await loadAnalysisState(repoPath, countConfig, headCommit, cachePath);
  const analysis = finalizeAnalysis(repoPath, headCommit, countConfig, state);
  const svg = renderChartSvg(analysis);

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

export function renderChartSvg(analysis: any, width?: number) {
  const commitTrend = analysis.commit_trend || [];
  const chartWidthValue = width || recommendedChartWidth(commitTrend);
  const height = Math.floor((chartWidthValue * 2) / 3);
  const innerWidth = chartWidthValue - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  if (!commitTrend.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidthValue}" height="${height}" viewBox="0 0 ${chartWidthValue} ${height}">
  ${svgDefs()}
  <rect width="100%" height="100%" fill="white" />
  ${renderTitle(COLORS.stroke)}
  ${renderYLabel(height, 0, COLORS.stroke)}
  <text x="50%" y="${height / 2}" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="16">No data</text>
</svg>`;
  }
  const xValues = commitTrend.map((entry: any) => parseIsoDate(String(entry.timestamp)));
  const yValues = commitTrend.map((entry: any) => Number(entry.total_words));
  const minX = new Date(Math.min(...xValues.map((value: Date) => value.getTime())));
  const maxX = new Date(Math.max(...xValues.map((value: Date) => value.getTime())));
  const maxY = Math.max(...yValues, 1);
  const mapper = (value: Date, w: number) => scaleTime(value, minX, maxX, w);
  const xTicks = pruneOverlappingTicks(xValues.length === 1 ? [xValues[0]] : buildTimeTicks(minX, maxX, 5), innerWidth, mapper);
  const yTicks = buildLinearTicks(maxY, 5);
  const yDomainMax = yTicks.length ? yTicks[yTicks.length - 1] : maxY;
  const points = xValues.map((value: Date, index: number) => [mapper(value, innerWidth), scaleLinear(yValues[index], yDomainMax, innerHeight)]);
  const linePath = buildLinePath(points);
  const [endX, endY] = points[points.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidthValue}" height="${height}" viewBox="0 0 ${chartWidthValue} ${height}">
  ${svgDefs()}
  <rect width="100%" height="100%" fill="${COLORS.background}" />
  ${renderTitle(COLORS.stroke)}
  ${renderYLabel(height, maxY, COLORS.stroke)}
  <g class="chart" transform="translate(${MARGIN.left},${MARGIN.top})">
${renderXAxis(xTicks, innerWidth, innerHeight, mapper, COLORS.stroke)}
${renderYAxis(yTicks, yDomainMax, innerHeight, COLORS.stroke)}
    <path class="chart-line" d="${linePath}" fill="none" stroke="${COLORS.series}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
    <circle class="chart-dot endpoint-dot" cx="${formatNumber(endX)}" cy="${formatNumber(endY)}" r="4" fill="${COLORS.series}" stroke="${COLORS.series}" />
${renderLegend(COLORS.series, COLORS.stroke, COLORS.background)}
  </g>
</svg>`;
}

function svgDefs() {
  return `<defs>
    <style type="text/css"><![CDATA[
      text { font-family: "xkcd", "Comic Sans MS", cursive; }
    ]]></style>
    <filter id="xkcdify" filterUnits="userSpaceOnUse" x="-5" y="-5" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise" />
      <feDisplacementMap scale="5" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="noise" />
    </filter>
  </defs>`;
}

function renderTitle(strokeColor: any) {
  return `<text x="50%" y="30" text-anchor="middle" font-size="20" font-weight="bold" fill="${strokeColor}">${CHART_TITLE}</text>`;
}

function renderYLabel(height: any, maxValue: any, strokeColor: any) {
  let offsetY = 24;
  if (maxValue > 100000) offsetY = 2;
  else if (maxValue > 10000) offsetY = 8;
  else if (maxValue > 1000) offsetY = 12;
  else if (maxValue > 100) offsetY = 20;
  return `<text text-anchor="end" dy=".75em" transform="rotate(-90)" x="-${formatNumber(height / 2)}" y="${offsetY}" font-size="17" fill="${strokeColor}">${Y_AXIS_LABEL}</text>`;
}

function renderXAxis(ticks: any, chartWidth: any, chartHeight: any, mapper: any, strokeColor: any) {
  const tickSvg = ticks.map((tick: any, index: number) => `      <g class="tick" transform="translate(${formatNumber(tickXPosition(tick, chartWidth, mapper))},0)">
        <text y="24" text-anchor="${tickAnchor(index, ticks.length)}" font-size="16" fill="${strokeColor}">${escapeXml(formatDateTick(tick))}</text>
      </g>`).join("\n");
  return `    <g class="xaxis" transform="translate(0,${chartHeight})">
      <path class="domain" d="M0,0.5H${chartWidth}" fill="none" stroke="${strokeColor}" stroke-width="2.5" filter="url(#xkcdify)" />
${tickSvg}
    </g>`;
}

function renderYAxis(ticks: any, domainMax: any, chartHeight: any, strokeColor: any) {
  const tickSvg = ticks.filter((tick: any) => tick !== 0).map((tick: any) => `      <g class="tick" transform="translate(0,${formatNumber(scaleLinear(tick, domainMax, chartHeight))})">
        <line x2="-3" stroke="${strokeColor}" />
        <text x="-8" y="5" text-anchor="end" font-size="16" fill="${strokeColor}">${escapeXml(formatNumberTick(tick))}</text>
      </g>`).join("\n");
  return `    <g class="yaxis">
      <path class="domain" d="M0.5,0V${chartHeight}" fill="none" stroke="${strokeColor}" stroke-width="2.5" filter="url(#xkcdify)" />
${tickSvg}
    </g>`;
}

function renderLegend(seriesColor: any, strokeColor: any, backgroundColor: any) {
  const legendX = 8;
  const legendY = 5;
  const legendXPadding = 7;
  const colorBlockWidth = 8;
  const backgroundWidth = Math.max(120, Math.trunc(LEGEND_LABEL.length * 7.5 + colorBlockWidth + legendXPadding * 3 + 6));
  const textX = legendX + legendXPadding + colorBlockWidth + 6;
  const colorX = legendX + legendXPadding;
  return `    <g class="legend">
      <rect x="${legendX}" y="${legendY}" width="${backgroundWidth}" height="32" rx="5" ry="5" fill="${backgroundColor}" fill-opacity="0.85" stroke="${strokeColor}" stroke-width="2" filter="url(#xkcdify)" />
      <rect x="${colorX}" y="${legendY + 12}" width="${colorBlockWidth}" height="${colorBlockWidth}" rx="2" ry="2" fill="${seriesColor}" filter="url(#xkcdify)" />
      <text x="${textX}" y="${legendY + 21}" font-size="15" fill="${strokeColor}">${LEGEND_LABEL}</text>
    </g>`;
}

function buildTimeTicks(start: any, end: any, count: any) {
  if (end <= start) return [start];
  const spanDays = Math.max(Math.floor((end - start) / (24 * 60 * 60 * 1000)), 1);
  let ticks;
  if (spanDays > 730) ticks = buildMonthBoundaryTicks(start, end, 6);
  else if (spanDays > 365) ticks = buildMonthBoundaryTicks(start, end, 3);
  else if (spanDays > 180) ticks = buildMonthBoundaryTicks(start, end, 2);
  else if (spanDays > 60) ticks = buildMonthBoundaryTicks(start, end, 1);
  else if (spanDays > 21) ticks = buildDayBoundaryTicks(start, end, 14);
  else ticks = buildDayBoundaryTicks(start, end, 7);
  return ticks.length > Math.max(count + 2, 7) ? downsampleTicks(ticks, count + 2) : ticks;
}

function buildLinearTicks(maxValue: any, count: any) {
  if (maxValue <= 0) return [0];
  const step = niceNumber(maxValue / Math.max(count - 1, 1));
  const niceMax = Math.ceil(maxValue / step) * step;
  const tickCount = Math.max(Math.round(niceMax / step), 1);
  return Array.from({ length: tickCount + 1 }, (_value, index) => round10(step * index));
}

function buildMonthBoundaryTicks(start: any, end: any, monthStep: any) {
  const ticks = [start];
  let candidate = firstOfNextMonth(start);
  while (candidate < end) {
    if ((candidate.getUTCMonth() % monthStep) === 0) ticks.push(candidate);
    candidate = addMonths(candidate, 1);
  }
  if (ticks[ticks.length - 1].getTime() !== end.getTime()) ticks.push(end);
  return ticks;
}

function buildDayBoundaryTicks(start: any, end: any, dayStep: any) {
  const ticks = [start];
  let candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + dayStep));
  while (candidate < end) {
    ticks.push(candidate);
    candidate = new Date(candidate.getTime() + dayStep * 24 * 60 * 60 * 1000);
  }
  if (ticks[ticks.length - 1].getTime() !== end.getTime()) ticks.push(end);
  return ticks;
}

function downsampleTicks(ticks: any, target: any) {
  if (ticks.length <= target) return ticks;
  const kept = [ticks[0]];
  const interior = ticks.slice(1, -1);
  const needed = Math.max(target - 2, 0);
  if (needed > 0) {
    const step = interior.length / needed;
    const pickedIndices = [];
    for (let index = 0; index < needed; index += 1) {
      let picked = Math.round(index * step);
      picked = Math.min(picked, interior.length - 1);
      if (pickedIndices.length && picked <= pickedIndices[pickedIndices.length - 1]) {
        picked = Math.min(pickedIndices[pickedIndices.length - 1] + 1, interior.length - 1);
      }
      pickedIndices.push(picked);
    }
    for (const index of pickedIndices) kept.push(interior[index]);
  }
  kept.push(ticks[ticks.length - 1]);
  return kept.filter((tick, index) => index === 0 || tick.getTime() !== kept[index - 1].getTime());
}

function pruneOverlappingTicks(ticks: any, chartWidth: any, mapper: any) {
  if (ticks.length <= 2) return ticks;
  const kept = [ticks[0]];
  let previousExtent = dateTickExtent(ticks[0], chartWidth, mapper, "start");
  for (const tick of ticks.slice(1, -1)) {
    const extent = dateTickExtent(tick, chartWidth, mapper, "middle");
    if (extent[0] >= previousExtent[1] + DATE_TICK_GAP) {
      kept.push(tick);
      previousExtent = extent;
    }
  }
  const lastTick = ticks[ticks.length - 1];
  const lastExtent = dateTickExtent(lastTick, chartWidth, mapper, "end");
  while (kept.length > 1 && previousExtent[1] + DATE_TICK_GAP > lastExtent[0]) {
    kept.pop();
    previousExtent = dateTickExtent(kept[kept.length - 1], chartWidth, mapper, kept.length === 1 ? "start" : "middle");
  }
  kept.push(lastTick);
  return kept;
}

function dateTickExtent(tick: any, chartWidth: any, mapper: any, anchor: any) {
  const x = tickXPosition(tick, chartWidth, mapper);
  const labelWidth = formatDateTick(tick).length * DATE_TICK_CHAR_WIDTH;
  if (anchor === "start") return [x, x + labelWidth];
  if (anchor === "end") return [x - labelWidth, x];
  return [x - labelWidth / 2, x + labelWidth / 2];
}

function tickXPosition(value: any, width: any, mapper: any) {
  return Math.min(Math.max(mapper(value, width), 0), width);
}

function scaleTime(value: any, start: any, end: any, width: any) {
  const total = end.getTime() - start.getTime();
  return total === 0 ? 0 : ((value.getTime() - start.getTime()) / total) * width;
}

function scaleLinear(value: any, maxValue: any, height: any) {
  return maxValue === 0 ? height : height - (value / maxValue) * height;
}

function recommendedChartWidth(commitTrend: Array<{ timestamp: string }>) {
  if (commitTrend.length < 2) return 900;
  const first = parseIsoDate(String(commitTrend[0].timestamp));
  const last = parseIsoDate(String(commitTrend[commitTrend.length - 1].timestamp));
  const spanDays = Math.max(Math.floor((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)), 1);
  return Math.min(1600, Math.max(900, 900 + Math.max(0, spanDays - 365)));
}

function buildLinePath(points: any) {
  return points.map(([x, y]: any, index: number) => `${index === 0 ? "M" : "L"}${formatNumber(x)},${formatNumber(y)}`).join(" ");
}

function niceNumber(value: any) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / (10 ** exponent);
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * (10 ** exponent);
}

function firstOfNextMonth(value: any) {
  return value.getUTCMonth() === 11
    ? new Date(Date.UTC(value.getUTCFullYear() + 1, 0, 1))
    : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
}

function addMonths(value: any, months: any) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function formatDateTick(value: any) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[value.getUTCMonth()]} ${pad2(value.getUTCDate())}, ${value.getUTCFullYear()}`;
}

function formatNumberTick(value: any) {
  if (value >= 1000000) return value % 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${Math.trunc(value / 1000000)}M`;
  if (value >= 1000) return value % 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.trunc(value / 1000)}K`;
  return Number.isInteger(value) ? String(value) : String(value.toFixed(1)).replace(/\.0$/u, "");
}

function tickAnchor(index: any, total: any) {
  if (index === 0) return "start";
  if (index === total - 1) return "end";
  return "middle";
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

function round10(value: any) {
  return Math.round(value * 10000000000) / 10000000000;
}

function formatNumber(value: any) {
  return Number(value).toFixed(2);
}

function escapeXml(value: any) {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}
