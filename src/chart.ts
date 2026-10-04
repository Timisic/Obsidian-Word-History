import { XKCD_FONT_DATA_URL } from "./fontData";

export interface ChartOptions {
  milestoneMonth?: string;
  timeZone?: string;
}
interface TrendPoint { timestamp: string; total_words: number }
interface ChartAnalysis { commit_trend: TrendPoint[] }
interface AxisTick { timestamp: number; x: number; label: string; anchor: "start" | "middle" | "end" }
type Milestone = { kind: "inside"; label: string; x: number; labelX: number }
  | { kind: "outside"; label: string };
export interface AxisLayout {
  ticks: AxisTick[];
  startLabel: string;
  endLabel: string;
  stackedRange: boolean;
  intervalMonths: number;
  milestone?: Milestone;
}
const LEFT = 70;
const RIGHT = 30;
const TOP = 110;
const CHAR_WIDTH = 8;
const LABEL_GAP = 14;
const ORANGE = "#dd4528";

export function validateChartOptions(options: ChartOptions): Required<ChartOptions> {
  const timeZone = options.timeZone || "UTC";
  new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  const milestoneMonth = options.milestoneMonth || "";
  if (milestoneMonth && !/^[0-9]{4}-(0[1-9]|1[0-2])$/u.test(milestoneMonth)) {
    throw new Error("Milestone month must be YYYY-MM or empty.");
  }
  if (milestoneMonth.startsWith("0000-")) throw new Error("Milestone year must be at least 0001.");
  return { timeZone, milestoneMonth };
}

function localParts(timestamp: number, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(timestamp);
  return ["year", "month", "day", "hour", "minute", "second"].map((type) => Number(parts.find((part) => part.type === type)?.value));
}
function utcMillis(year: number, month: number, day = 1, hour = 0, minute = 0, second = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
function monthInstant(year: number, month: number, timeZone: string): number {
  const target = utcMillis(year, month);
  let instant = target;
  for (let index = 0; index < 4; index += 1) {
    const [y, m, d, h, min, sec] = localParts(instant, timeZone);
    const difference = target - utcMillis(y, m, d, h, min, sec);
    if (!difference) break;
    instant += difference;
  }
  return instant;
}
function dateLabel(timestamp: number, timeZone: string): string {
  const [year, month, day] = localParts(timestamp, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function scaleTime(value: number, start: number, end: number, width: number): number {
  return start === end ? width / 2 : (value - start) / (end - start) * width;
}
function calendarTicks(start: number, end: number, width: number, step: number, timeZone: string): AxisTick[] {
  if (start === end) return [];
  const [startYear, startMonth] = localParts(start, timeZone);
  const [endYear, endMonth] = localParts(end, timeZone);
  const firstMonth = startYear * 12 + startMonth - 1;
  const lastMonth = endYear * 12 + endMonth - 1;
  const first = Math.ceil(firstMonth / step) * step;
  const ticks: AxisTick[] = [];
  for (let monthIndex = first; monthIndex <= lastMonth; monthIndex += step) {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    const timestamp = monthInstant(year, month, timeZone);
    if (timestamp < start || timestamp > end) continue;
    const label = step >= 12 ? String(year).padStart(4, "0") : `${year}-${String(month).padStart(2, "0")}`;
    const x = scaleTime(timestamp, start, end, width);
    const half = label.length * CHAR_WIDTH / 2;
    const anchor = x < half ? "start" : x + half > width ? "end" : "middle";
    ticks.push({ timestamp, x, label, anchor });
  }
  return ticks;
}
function ticksFit(ticks: AxisTick[], width: number): boolean {
  let previousRight = -LABEL_GAP;
  for (const tick of ticks) {
    const size = tick.label.length * CHAR_WIDTH;
    const left = tick.anchor === "start" ? tick.x : tick.anchor === "end" ? tick.x - size : tick.x - size / 2;
    if (left < 0 || left + size > width || left < previousRight + LABEL_GAP) return false;
    previousRight = left + size;
  }
  return true;
}
export function buildAxisLayout(start: number, end: number, width: number, options: ChartOptions = {}): AxisLayout {
  if (![start, end, width].every(Number.isFinite) || end < start || width < 1) throw new Error("Invalid axis range or width.");
  const { timeZone, milestoneMonth } = validateChartOptions(options);
  const ladder = [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200, 2400, 6000, 12000];
  let ticks: AxisTick[] = [];
  let intervalMonths = ladder[ladder.length - 1];
  for (const step of ladder) {
    const candidates = calendarTicks(start, end, width, step, timeZone);
    if (ticksFit(candidates, width)) { ticks = candidates; intervalMonths = step; break; }
  }
  const layout: AxisLayout = { ticks, intervalMonths, startLabel: `Start ${dateLabel(start, timeZone)}`, endLabel: `End ${dateLabel(end, timeZone)}`, stackedRange: width < 330 };
  if (milestoneMonth) {
    const [year, month] = milestoneMonth.split("-").map(Number);
    const timestamp = monthInstant(year, month, timeZone);
    if (timestamp < start || timestamp > end) layout.milestone = { kind: "outside", label: `${milestoneMonth} (outside range)` };
    else {
      const x = scaleTime(timestamp, start, end, width);
      const half = milestoneMonth.length * CHAR_WIDTH / 2;
      layout.milestone = { kind: "inside", label: milestoneMonth, x, labelX: Math.min(Math.max(x, half), width - half) };
    }
  }
  return layout;
}
function numberTick(value: number): string {
  if (value >= 1000000) return value % 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${value / 1000000}M`;
  if (value >= 1000) return value % 1000 ? `${(value / 1000).toFixed(1)}K` : `${value / 1000}K`;
  return String(Number(value.toFixed(1)));
}
function yTicks(max: number): number[] {
  const rough = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}
const f = (value: number): string => value.toFixed(2);

export function renderChartSvg(analysis: ChartAnalysis, width = 780, options: ChartOptions = {}): string {
  validateChartOptions(options);
  if (!Number.isFinite(width) || width < 360) throw new Error("Chart width must be at least 360 pixels.");
  const innerWidth = width - LEFT - RIGHT;
  const stacked = innerWidth < 330;
  const height = Math.max(360, Math.floor(width * 2 / 3));
  const innerHeight = height - TOP - (stacked ? 115 : 95);
  const trend = analysis.commit_trend || [];
  const defs = `<defs><style type="text/css"><![CDATA[@font-face {font-family:"xkcd";src:url(${XKCD_FONT_DATA_URL}) format("woff");} text {font-family:"xkcd","Comic Sans MS",cursive;}]]></style><filter id="xkcdify" filterUnits="userSpaceOnUse" x="-5" y="-5" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise"/><feDisplacementMap scale="5" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="noise"/></filter></defs>`;
  const title = '<text x="50%" y="28" text-anchor="middle" font-size="20" font-weight="bold" fill="black">Word History</text>';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}<rect width="100%" height="100%" fill="white"/>${title}`;
  if (!trend.length) return `${open}<text x="50%" y="${height / 2}" text-anchor="middle" font-size="16">No data</text></svg>`;
  if (trend.some((entry) => !/(Z|[+-][0-9]{2}:[0-9]{2})$/u.test(entry.timestamp))) throw new Error("Chart timestamps must include a UTC offset.");
  const times = trend.map((entry) => Date.parse(entry.timestamp));
  if (times.some((time) => !Number.isFinite(time))) throw new Error("Invalid chart timestamp.");
  const start = Math.min(...times);
  const end = Math.max(...times);
  const layout = buildAxisLayout(start, end, innerWidth, options);
  const ticks = yTicks(Math.max(1, ...trend.map((entry) => entry.total_words)));
  const domain = ticks[ticks.length - 1];
  const y = (value: number) => innerHeight * (1 - value / domain);
  const points = times.map((time, index) => [scaleTime(time, start, end, innerWidth), y(trend[index].total_words)]);
  const line = points.map(([px, py], index) => `${index ? "L" : "M"}${f(px)},${f(py)}`).join(" ");
  const [endX, endY] = points[points.length - 1];
  const xAxis = `<g class="xaxis" transform="translate(0,${innerHeight})"><path class="domain" d="M0,0.5H${innerWidth}" fill="none" stroke="black" stroke-width="2.5" filter="url(#xkcdify)"/>${layout.ticks.map((tick) => `<g class="tick" transform="translate(${f(tick.x)},0)"><text y="24" text-anchor="${tick.anchor}" font-size="16" fill="black">${tick.label}</text></g>`).join("")}</g>`;
  const yAxis = `<g class="yaxis"><path class="domain" d="M0.5,0V${innerHeight}" fill="none" stroke="black" stroke-width="2.5" filter="url(#xkcdify)"/>${ticks.map((tick) => `<g class="tick" transform="translate(0,${f(y(tick))})"><line x2="-3" stroke="black"/><text x="-8" y="5" text-anchor="end" font-size="16" fill="black">${numberTick(tick)}</text></g>`).join("")}</g>`;
  const range = `<g class="range-labels"><text x="0" y="${innerHeight + 52}" text-anchor="start" font-size="16">${layout.startLabel}</text><text x="${stacked ? 0 : innerWidth}" y="${innerHeight + (stacked ? 74 : 52)}" text-anchor="${stacked ? "start" : "end"}" font-size="16">${layout.endLabel}</text></g>`;
  const milestone = layout.milestone;
  let annotation = "";
  if (milestone?.kind === "inside") annotation = `<g class="milestone"><line class="milestone-line" x1="${f(milestone.x)}" x2="${f(milestone.x)}" y1="0" y2="${innerHeight}" stroke="#666666" stroke-dasharray="5 5"/><path class="milestone-leader" d="M${f(milestone.x)},-4L${f(milestone.labelX)},-18" fill="none" stroke="#666666"/><text x="${f(milestone.labelX)}" y="-25" text-anchor="middle" font-size="16" fill="#666666">${milestone.label}</text></g>`;
  if (milestone?.kind === "outside") annotation = `<text class="milestone-outside" x="0" y="${innerHeight + (stacked ? 98 : 76)}" font-size="14" fill="#666666">${milestone.label}</text>`;
  return `${open}<text class="latest-total" x="50%" y="52" text-anchor="middle" font-size="16" fill="${ORANGE}">${trend[trend.length - 1].total_words.toLocaleString("en-US")} words</text><text transform="rotate(-90)" x="-${f(TOP + innerHeight / 2)}" y="18" text-anchor="middle" font-size="17" fill="black">Words</text><g class="chart" transform="translate(${LEFT},${TOP})">${xAxis}${yAxis}${annotation}<path class="chart-line" d="${line}" fill="none" stroke="${ORANGE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle class="chart-dot endpoint-dot" cx="${f(endX)}" cy="${f(endY)}" r="4" fill="${ORANGE}" stroke="${ORANGE}"/>${range}</g></svg>`;
}
