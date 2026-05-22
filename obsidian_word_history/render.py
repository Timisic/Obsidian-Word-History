"""Static SVG rendering inspired by Star History."""

from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
from math import ceil, floor, log10

from .font_data import XKCD_FONT_DATA_URL

STAR_HISTORY_COLORS = {
    "background": "white",
    "stroke": "black",
    "series": "#dd4528",
    "muted": "#666666",
}

CHART_TITLE = "Word History"
Y_AXIS_LABEL = "Words"
LEGEND_LABEL = "Total Words"

MARGIN = {"top": 60, "right": 30, "bottom": 50, "left": 70}
DATE_TICK_CHAR_WIDTH = 8.0
DATE_TICK_GAP = 8.0


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
  {_svg_defs()}
  <rect width="100%" height="100%" fill="white" />
  {_render_title(stroke_color)}
  {_render_x_label(height, stroke_color)}
  {_render_y_label(height, 0, stroke_color)}
  <text x="50%" y="{height / 2}" text-anchor="middle" font-family="xkcd, Comic Sans MS, cursive" font-size="16">No data</text>
</svg>'''

    x_values = [datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) for item in commit_trend]
    y_values = [int(item["total_words"]) for item in commit_trend]
    time_mapper = _build_time_mapper(x_values, y_values)
    min_x = min(x_values)
    max_x = max(x_values)
    max_y = max(max(y_values), 1)

    x_axis_ticks = [x_values[0]] if len(x_values) == 1 else _build_time_ticks(min_x, max_x, 5)
    x_axis_ticks = _prune_overlapping_ticks(x_axis_ticks, chart_width, time_mapper)
    y_axis_ticks = _build_linear_ticks(max_y, 5)
    y_domain_max = y_axis_ticks[-1] if y_axis_ticks else float(max_y)

    plotted_points = [
        (
            time_mapper(value, chart_width),
            _scale_linear(y, y_domain_max, chart_height),
        )
        for value, y in zip(x_values, y_values)
    ]
    line_path = _build_line_path(plotted_points)
    endpoint_dot = ""
    if plotted_points:
        end_x, end_y = plotted_points[-1]
        endpoint_dot = (
            f'    <circle class="chart-dot endpoint-dot" cx="{end_x:.2f}" cy="{end_y:.2f}" '
            f'r="4" fill="{series_color}" stroke="{series_color}" />'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  {_svg_defs()}
  <rect width="100%" height="100%" fill="{STAR_HISTORY_COLORS['background']}" />
  {_render_title(stroke_color)}
  {_render_y_label(height, max_y, stroke_color)}
  <g class="chart" transform="translate({MARGIN['left']},{MARGIN['top']})">
{_render_x_axis(x_axis_ticks, chart_width, chart_height, time_mapper, stroke_color)}
{_render_y_axis(y_axis_ticks, y_domain_max, chart_height, stroke_color)}
    <path class="chart-line" d="{line_path}" fill="none" stroke="{series_color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
{endpoint_dot}
{_render_legend(series_color, stroke_color, STAR_HISTORY_COLORS['background'], chart_width, chart_height)}
  </g>
</svg>'''


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


def _build_linear_ticks(max_value: int, count: int) -> list[float]:
    if max_value <= 0:
        return [0.0]

    rough_step = max_value / max(count - 1, 1)
    step = _nice_number(rough_step)
    nice_max = ceil(max_value / step) * step
    tick_count = max(int(round(nice_max / step)), 1)
    return [round(step * index, 10) for index in range(tick_count + 1)]


def _scale_time(value: datetime, start: datetime, end: datetime, width: int) -> float:
    total = (end - start).total_seconds()
    current = (value - start).total_seconds()
    return 0.0 if total == 0 else current / total * width


def _scale_linear(value: float, max_value: float, height: int) -> float:
    return height if max_value == 0 else height - (value / max_value) * height


def _format_date_tick(value: datetime) -> str:
    return value.strftime("%b %d, %Y")


def _format_number_tick(value: float) -> str:
    if float(value).is_integer():
        value = int(value)
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M" if value % 1_000_000 else f"{value // 1_000_000}M"
    if value >= 1_000:
        return f"{value / 1000:.1f}K" if value % 1000 else f"{value // 1000}K"
    if isinstance(value, float):
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return str(value)


def _tick_anchor(index: int, total: int) -> str:
    if index == 0:
        return "start"
    if index == total - 1:
        return "end"
    return "middle"


def _tick_x_position(value: datetime, width: int, mapper) -> float:
    raw = mapper(value, width)
    return min(max(raw, 0), width)


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
    start = min(x_values)
    end = max(x_values)

    def mapper(value: datetime, width: int) -> float:
        return _scale_time(value, start, end, width)

    return mapper


def _svg_defs() -> str:
    return f'''<defs>
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
  </defs>'''


def _render_title(stroke_color: str) -> str:
    return f'<text x="50%" y="30" text-anchor="middle" font-size="20" font-weight="bold" fill="{stroke_color}">{CHART_TITLE}</text>'


def _render_y_label(height: int, max_value: int, stroke_color: str) -> str:
    offset_y = 24
    if max_value > 100_000:
        offset_y = 2
    elif max_value > 10_000:
        offset_y = 8
    elif max_value > 1_000:
        offset_y = 12
    elif max_value > 100:
        offset_y = 20
    return (
        f'<text text-anchor="end" dy=".75em" transform="rotate(-90)" '
        f'x="-{height / 2:.2f}" y="{offset_y}" font-size="17" fill="{stroke_color}">{Y_AXIS_LABEL}</text>'
    )


def _render_x_axis(
    ticks: list[datetime],
    chart_width: int,
    chart_height: int,
    mapper,
    stroke_color: str,
) -> str:
    tick_svg = "\n".join(
        f'''      <g class="tick" transform="translate({_tick_x_position(tick, chart_width, mapper):.2f},0)">
        <text y="24" text-anchor="{_tick_anchor(index, len(ticks))}" font-size="16" fill="{stroke_color}">{escape(_format_date_tick(tick))}</text>
      </g>'''
        for index, tick in enumerate(ticks)
    )
    return f'''    <g class="xaxis" transform="translate(0,{chart_height})">
      <path class="domain" d="M0,0.5H{chart_width}" fill="none" stroke="{stroke_color}" stroke-width="2.5" filter="url(#xkcdify)" />
{tick_svg}
    </g>'''


def _render_y_axis(
    ticks: list[float],
    domain_max: float,
    chart_height: int,
    stroke_color: str,
) -> str:
    tick_svg = "\n".join(
        f'''      <g class="tick" transform="translate(0,{_scale_linear(tick, domain_max, chart_height):.2f})">
        <line x2="-3" stroke="{stroke_color}" />
        <text x="-8" y="5" text-anchor="end" font-size="16" fill="{stroke_color}">{escape(_format_number_tick(tick))}</text>
      </g>'''
        for tick in ticks
        if tick != 0
    )
    return f'''    <g class="yaxis">
      <path class="domain" d="M0.5,0V{chart_height}" fill="none" stroke="{stroke_color}" stroke-width="2.5" filter="url(#xkcdify)" />
{tick_svg}
    </g>'''


def _render_legend(
    series_color: str,
    stroke_color: str,
    background_color: str,
    chart_width: int,
    chart_height: int,
) -> str:
    del chart_width, chart_height
    legend_x = 8
    legend_y = 5
    legend_x_padding = 7
    color_block_width = 8
    xkcd_char_width = 7.5
    background_width = max(120, int(len(LEGEND_LABEL) * xkcd_char_width + color_block_width + legend_x_padding * 3 + 6))
    background_height = 32
    text_x = legend_x + legend_x_padding + color_block_width + 6
    color_x = legend_x + legend_x_padding
    return f'''    <g class="legend">
      <rect x="{legend_x}" y="{legend_y}" width="{background_width}" height="{background_height}" rx="5" ry="5" fill="{background_color}" fill-opacity="0.85" stroke="{stroke_color}" stroke-width="2" filter="url(#xkcdify)" />
      <rect x="{color_x}" y="{legend_y + 12}" width="{color_block_width}" height="{color_block_width}" rx="2" ry="2" fill="{series_color}" filter="url(#xkcdify)" />
      <text x="{text_x}" y="{legend_y + 21}" font-size="15" fill="{stroke_color}">{LEGEND_LABEL}</text>
    </g>'''


def _build_line_path(points: list[tuple[float, float]]) -> str:
    if not points:
        return ""
    return " ".join(
        f'{"M" if index == 0 else "L"}{x:.2f},{y:.2f}'
        for index, (x, y) in enumerate(points)
    )


def _nice_number(value: float) -> float:
    if value <= 0:
        return 1.0
    exponent = floor(log10(value))
    fraction = value / (10**exponent)
    if fraction <= 1:
        nice_fraction = 1
    elif fraction <= 2:
        nice_fraction = 2
    elif fraction <= 5:
        nice_fraction = 5
    else:
        nice_fraction = 10
    return nice_fraction * (10**exponent)


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


def _prune_overlapping_ticks(ticks: list[datetime], chart_width: int, mapper) -> list[datetime]:
    if len(ticks) <= 2:
        return ticks

    kept = [ticks[0]]
    previous_extent = _date_tick_extent(ticks[0], chart_width, mapper, "start")
    for tick in ticks[1:-1]:
        tick_extent = _date_tick_extent(tick, chart_width, mapper, "middle")
        if tick_extent[0] >= previous_extent[1] + DATE_TICK_GAP:
            kept.append(tick)
            previous_extent = tick_extent

    last_tick = ticks[-1]
    last_extent = _date_tick_extent(last_tick, chart_width, mapper, "end")
    while kept and previous_extent[1] + DATE_TICK_GAP > last_extent[0] and len(kept) > 1:
        kept.pop()
        anchor = "start" if len(kept) == 1 else "middle"
        previous_extent = _date_tick_extent(kept[-1], chart_width, mapper, anchor)
    kept.append(last_tick)
    return kept


def _date_tick_extent(tick: datetime, chart_width: int, mapper, anchor: str) -> tuple[float, float]:
    x = _tick_x_position(tick, chart_width, mapper)
    label_width = len(_format_date_tick(tick)) * DATE_TICK_CHAR_WIDTH
    if anchor == "start":
        return (x, x + label_width)
    if anchor == "end":
        return (x - label_width, x)
    half_width = label_width / 2
    return (x - half_width, x + half_width)


def _first_of_next_month(value: datetime) -> datetime:
    if value.month == 12:
        return datetime(value.year + 1, 1, 1, tzinfo=value.tzinfo)
    return datetime(value.year, value.month + 1, 1, tzinfo=value.tzinfo)


def _add_months(value: datetime, months: int) -> datetime:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    return datetime(year, month, 1, tzinfo=value.tzinfo)
