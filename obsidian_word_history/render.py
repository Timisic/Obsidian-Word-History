"""Static SVG/HTML rendering inspired by Star History."""

from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timedelta
from html import escape
from math import log1p
import json

from .font_data import XKCD_FONT_DATA_URL

STAR_HISTORY_COLORS = {
    "background": "white",
    "stroke": "black",
    "series": "#dd4528",
    "muted": "#666666",
}

MARGIN = {"top": 60, "right": 30, "bottom": 50, "left": 70}


def render_chart_svg(analysis: dict, *, width: int | None = None) -> str:
    commit_trend = analysis["commit_trend"]
    width = width or _recommended_chart_width(commit_trend)
    height = (width * 2) // 3
    chart_width = width - MARGIN["left"] - MARGIN["right"]
    chart_height = height - MARGIN["top"] - MARGIN["bottom"]
    series_color = STAR_HISTORY_COLORS["series"]
    stroke_color = STAR_HISTORY_COLORS["stroke"]

    if not commit_trend:
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="white" />
  <text x="50%" y="30" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="20" font-weight="bold">Word History</text>
  <text x="50%" y="{height / 2}" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="16">No data</text>
</svg>'''

    x_values = [datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) for item in commit_trend]
    y_values = [int(item["total_words"]) for item in commit_trend]
    time_mapper = _build_time_mapper(x_values, y_values)
    min_x = min(x_values)
    max_x = max(x_values)
    if max_x == min_x:
        max_x = max_x.replace(second=max_x.second + 1)
    max_y = max(max(y_values), 1)

    x_axis_ticks = _build_time_ticks(min_x, max_x, 5)
    y_axis_ticks = _build_linear_ticks(max_y, 5)
    polyline_points = " ".join(
        f"{time_mapper(value, chart_width) + MARGIN['left']:.2f},{_scale_linear(y, max_y, chart_height) + MARGIN['top']:.2f}"
        for value, y in zip(x_values, y_values)
    )
    last_x = time_mapper(x_values[-1], chart_width) + MARGIN["left"]
    last_y = _scale_linear(y_values[-1], max_y, chart_height) + MARGIN["top"]

    x_tick_svg = "\n".join(
        f'''  <g class="x-tick">
    <text x="{_tick_x_position(tick, chart_width, time_mapper):.2f}" y="{MARGIN['top'] + chart_height + 24}" text-anchor="{_tick_anchor(index, len(x_axis_ticks))}">{escape(_format_date_tick(tick))}</text>
  </g>'''
        for index, tick in enumerate(x_axis_ticks)
    )
    y_tick_svg = "\n".join(
        f'''  <g class="y-tick">
    <line x1="{MARGIN['left'] - 3}" y1="{_scale_linear(tick, max_y, chart_height) + MARGIN['top']:.2f}" x2="{MARGIN['left']}" y2="{_scale_linear(tick, max_y, chart_height) + MARGIN['top']:.2f}" stroke="{stroke_color}" />
    <text x="{MARGIN['left'] - 8}" y="{_scale_linear(tick, max_y, chart_height) + MARGIN['top'] + 5:.2f}" text-anchor="end">{escape(_format_number_tick(tick))}</text>
  </g>'''
        for tick in y_axis_ticks
        if tick != 0
    )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <style type="text/css"><![CDATA[
      @font-face {{
        font-family: "xkcd";
        src: url({XKCD_FONT_DATA_URL}) format("woff");
      }}
      text {{
        font-family: "xkcd", "Comic Sans MS", cursive;
      }}
    ]]></style>
    <filter id="xkcdify" filterUnits="userSpaceOnUse" x="-5" y="-5" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise" />
      <feDisplacementMap scale="5" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="noise" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="{STAR_HISTORY_COLORS['background']}" />
  <text x="50%" y="30" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="20" font-weight="bold" fill="{stroke_color}">Word History</text>
  <text transform="rotate(-90)" x="-{height / 2:.2f}" y="12" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="17" fill="{stroke_color}">Words</text>
  <g class="chart">
    <line x1="{MARGIN['left']}" y1="{MARGIN['top'] + chart_height}" x2="{MARGIN['left'] + chart_width}" y2="{MARGIN['top'] + chart_height}" stroke="{stroke_color}" filter="url(#xkcdify)" stroke-width="2.5" />
    <line x1="{MARGIN['left']}" y1="{MARGIN['top']}" x2="{MARGIN['left']}" y2="{MARGIN['top'] + chart_height}" stroke="{stroke_color}" filter="url(#xkcdify)" stroke-width="2.5" />
{x_tick_svg}
{y_tick_svg}
    <polyline fill="none" stroke="{series_color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#xkcdify)" points="{polyline_points}" />
    <circle cx="{last_x:.2f}" cy="{last_y:.2f}" r="4.5" fill="{series_color}" />
  </g>
  <g class="legend">
    <rect x="8" y="5" width="120" height="32" rx="5" ry="5" fill="white" fill-opacity="0.85" stroke="{stroke_color}" stroke-width="2" filter="url(#xkcdify)" />
    <rect x="15" y="17" width="8" height="8" rx="2" ry="2" fill="{series_color}" filter="url(#xkcdify)" />
    <text x="30" y="26" font-family="xkcd, Comic Sans MS, cursive" font-size="15" fill="{stroke_color}">Total Words</text>
  </g>
</svg>'''


def render_report_html(analysis: dict) -> str:
    analysis_json = json.dumps(analysis, ensure_ascii=False)
    recent_items = "\n".join(
        f'''
        <li class="recent-item">
          <div class="recent-path">{escape(item["path"])}</div>
          <div class="recent-meta">
            <span>近 30 天更新 {item["touch_count_30d"]} 次</span>
            <span>当前 {item["current_words"]} 字</span>
            <span>最近一次：{escape(item["latest_touch_at"])}</span>
          </div>
        </li>'''
        for item in analysis["recent_active_notes_30d"]
    )
    return f'''<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Obsidian Word History</title>
    <style>
      :root {{
        --bg: #f8fafc;
        --panel: white;
        --panel-border: #e2e8f0;
        --text: #111827;
        --muted: #64748b;
      }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }}
      main {{ max-width: 1080px; margin: 0 auto; padding: 40px 20px 80px; }}
      header {{ display: grid; gap: 12px; margin-bottom: 24px; }}
      h1 {{ margin: 0; font-size: clamp(2rem, 4vw, 3rem); }}
      p {{ margin: 0; color: var(--muted); }}
      .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }}
      .summary-card, section {{ background: var(--panel); border: 1px solid var(--panel-border); border-radius: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05); }}
      .summary-card {{ padding: 18px 20px; }}
      .summary-card .label {{ color: var(--muted); font-size: 0.84rem; margin-bottom: 8px; }}
      .summary-card .value {{ font-size: 1.7rem; font-weight: 700; }}
      section {{ padding: 22px; margin-bottom: 18px; }}
      section h2 {{ margin: 0 0 6px; font-size: 1.15rem; }}
      .chart-image {{ width: 100%; display: block; border-radius: 12px; background: white; }}
      .recent-list {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }}
      .recent-item {{ padding: 12px 14px; border-radius: 14px; border: 1px solid var(--panel-border); background: #fcfcfd; }}
      .recent-path {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.93rem; margin-bottom: 8px; word-break: break-all; }}
      .recent-meta {{ display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 0.88rem; }}
      footer {{ margin-top: 18px; color: var(--muted); font-size: 0.9rem; }}
      code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <p>本地 Git 回放 + Star History 风格图表</p>
          <h1>Obsidian Word History</h1>
          <p>仓库：<code id="vault-path"></code>。当前图表主产物是 <code>chart.svg</code>；近 30 天榜单按提交触达次数统计。V1 按 path 追踪，rename 会拆分旧路径与新路径。</p>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">当前总字数</div><div class="value" id="summary-total">{analysis["summary"]["latest_total_words"]}</div></div>
          <div class="summary-card"><div class="label">回放提交数</div><div class="value" id="summary-commits">{analysis["summary"]["commit_count"]}</div></div>
          <div class="summary-card"><div class="label">当前 Git 跟踪文件数</div><div class="value" id="summary-notes">{analysis["summary"]["notes_tracked"]}</div></div>
        </div>
      </header>

      <section id="total-word-trend">
        <h2>总字数趋势图</h2>
        <p>主图样式、标题、坐标布局尽量贴近 Star History，独立输出为 <code>chart.svg</code>。</p>
        <img class="chart-image" src="chart.svg" alt="总字数趋势图">
      </section>

      <section id="recent-active-notes">
        <h2>近 30 天更新最频繁的内容</h2>
        <p>按最近 30 天内被 commit 触达的次数排序，不再显示 daily net additions，也不再展示历史累计净增长榜单。</p>
        <ul class="recent-list">{recent_items}
        </ul>
      </section>

      <footer>
        生成时间 <span id="generated-at">{analysis["generated_at"]}</span> · HEAD <code id="head-commit">{analysis["head_commit"][:12]}</code>
      </footer>
    </main>

    <script id="analysis-data" type="application/json">{analysis_json}</script>
    <script>
      const analysis = JSON.parse(document.getElementById("analysis-data").textContent);
      document.getElementById("summary-total").textContent = new Intl.NumberFormat().format(analysis.summary.latest_total_words);
      document.getElementById("summary-commits").textContent = new Intl.NumberFormat().format(analysis.summary.commit_count);
      document.getElementById("summary-notes").textContent = new Intl.NumberFormat().format(analysis.summary.notes_tracked);
      document.getElementById("generated-at").textContent = analysis.generated_at;
      document.getElementById("head-commit").textContent = analysis.head_commit.slice(0, 12);
      document.getElementById("vault-path").textContent = analysis.vault_path;
    </script>
  </body>
</html>'''


def _build_time_ticks(start: datetime, end: datetime, count: int) -> list[datetime]:
    if end <= start:
        return [start]

    span_days = max((end - start).days, 1)
    if span_days > 730:
        ticks = _build_month_boundary_ticks(start, end, month_step=6)
    elif span_days > 365:
        ticks = _build_month_boundary_ticks(start, end, month_step=3)
    elif span_days > 180:
        ticks = _build_month_boundary_ticks(start, end, month_step=2)
    elif span_days > 60:
        ticks = _build_month_boundary_ticks(start, end, month_step=1)
    elif span_days > 21:
        ticks = _build_day_boundary_ticks(start, end, day_step=14)
    else:
        ticks = _build_day_boundary_ticks(start, end, day_step=7)

    if len(ticks) > max(count + 2, 7):
        ticks = _downsample_ticks(ticks, count + 2)
    return ticks


def _build_linear_ticks(max_value: int, count: int) -> list[int]:
    step = max(max_value / (count - 1), 1)
    return [round(step * index) for index in range(count)]


def _scale_time(value: datetime, start: datetime, end: datetime, width: int) -> float:
    total = (end - start).total_seconds()
    current = (value - start).total_seconds()
    return 0.0 if total == 0 else current / total * width


def _scale_linear(value: int, max_value: int, height: int) -> float:
    return height if max_value == 0 else height - (value / max_value) * height


def _format_date_tick(value: datetime) -> str:
    return value.strftime("%b %d, %Y")


def _format_number_tick(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M" if value % 1_000_000 else f"{value // 1_000_000}M"
    if value >= 300:
        return f"{value / 1000:.1f}K" if value % 1000 else f"{value // 1000}K"
    return str(value)


def _tick_anchor(index: int, total: int) -> str:
    if index == 0:
        return "start"
    if index == total - 1:
        return "end"
    return "middle"


def _tick_x_position(value: datetime, width: int, mapper) -> float:
    raw = mapper(value, width) + MARGIN["left"]
    return min(max(raw, MARGIN["left"] + 4), MARGIN["left"] + width - 4)


def _recommended_chart_width(commit_trend: list[dict[str, object]]) -> int:
    if len(commit_trend) < 2:
        return 900
    first = datetime.fromisoformat(str(commit_trend[0]["timestamp"]).replace("Z", "+00:00"))
    last = datetime.fromisoformat(str(commit_trend[-1]["timestamp"]).replace("Z", "+00:00"))
    span_days = max((last - first).days, 1)
    return min(1600, max(900, 900 + max(0, span_days - 365)))


def _build_time_mapper(x_values: list[datetime], y_values: list[int]):
    if len(x_values) <= 1:
        return lambda _value, width: 0.0

    max_delta = max((abs(y_values[index] - y_values[index - 1]) for index in range(1, len(y_values))), default=0)
    weighted_intervals = [0.0]
    cumulative = [0.0]

    for index in range(1, len(x_values)):
        seconds = max((x_values[index] - x_values[index - 1]).total_seconds(), 60.0)
        days = seconds / 86400.0
        delta_words = abs(y_values[index] - y_values[index - 1])
        activity = 0.0 if max_delta == 0 else log1p(delta_words) / log1p(max_delta)
        compression_factor = 0.30 + 0.70 * activity
        weighted = days * compression_factor
        weighted_intervals.append(weighted)
        cumulative.append(cumulative[-1] + weighted)

    total_weight = cumulative[-1] if cumulative[-1] > 0 else 1.0

    def mapper(value: datetime, width: int) -> float:
        if value <= x_values[0]:
            return 0.0
        if value >= x_values[-1]:
            return float(width)

        right_index = bisect_right(x_values, value)
        left_index = max(0, right_index - 1)
        if right_index >= len(x_values):
            return float(width)

        left_time = x_values[left_index]
        right_time = x_values[right_index]
        interval_seconds = max((right_time - left_time).total_seconds(), 60.0)
        ratio = (value - left_time).total_seconds() / interval_seconds
        scaled = cumulative[left_index] + ratio * weighted_intervals[right_index]
        return scaled / total_weight * width

    return mapper


def _build_month_boundary_ticks(start: datetime, end: datetime, month_step: int) -> list[datetime]:
    ticks = [start]
    candidate = _first_of_next_month(start)
    while candidate < end:
        if ((candidate.month - 1) % month_step) == 0:
            ticks.append(candidate)
        candidate = _add_months(candidate, 1)
    if ticks[-1] != end:
        ticks.append(end)
    return ticks


def _build_day_boundary_ticks(start: datetime, end: datetime, day_step: int) -> list[datetime]:
    ticks = [start]
    candidate = datetime(start.year, start.month, start.day, tzinfo=start.tzinfo) + timedelta(days=day_step)
    while candidate < end:
        ticks.append(candidate)
        candidate += timedelta(days=day_step)
    if ticks[-1] != end:
        ticks.append(end)
    return ticks


def _downsample_ticks(ticks: list[datetime], target: int) -> list[datetime]:
    if len(ticks) <= target:
        return ticks
    kept = [ticks[0]]
    interior = ticks[1:-1]
    needed = max(target - 2, 0)
    if needed > 0:
        step = len(interior) / needed
        picked_indices = []
        for index in range(needed):
            picked = int(round(index * step))
            picked = min(picked, len(interior) - 1)
            if picked_indices and picked <= picked_indices[-1]:
                picked = min(picked_indices[-1] + 1, len(interior) - 1)
            picked_indices.append(picked)
        kept.extend(interior[index] for index in picked_indices)
    kept.append(ticks[-1])
    deduped = []
    for tick in kept:
        if not deduped or deduped[-1] != tick:
            deduped.append(tick)
    return deduped


def _first_of_next_month(value: datetime) -> datetime:
    if value.month == 12:
        return datetime(value.year + 1, 1, 1, tzinfo=value.tzinfo)
    return datetime(value.year, value.month + 1, 1, tzinfo=value.tzinfo)


def _add_months(value: datetime, months: int) -> datetime:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    return datetime(year, month, 1, tzinfo=value.tzinfo)
