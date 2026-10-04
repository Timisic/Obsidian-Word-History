"""Deterministic calendar axes for the hand-drawn word-history chart."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil, floor, isfinite, log10
import re
from zoneinfo import ZoneInfo

from .font_data import XKCD_FONT_DATA_URL


@dataclass(frozen=True)
class AxisTick:
    timestamp: float
    x: float
    label: str
    anchor: str


@dataclass(frozen=True)
class Milestone:
    kind: str
    label: str
    x: float | None = None
    label_x: float | None = None


@dataclass(frozen=True)
class AxisLayout:
    ticks: list[AxisTick]
    start_label: str
    end_label: str
    stacked_range: bool
    interval_months: int
    milestone: Milestone | None = None


def validate_chart_options(milestone_month: str | None, time_zone: str) -> ZoneInfo:
    zone = ZoneInfo(time_zone)
    if milestone_month and (not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", milestone_month) or milestone_month.startswith("0000-")):
        raise ValueError("Milestone month must be YYYY-MM or empty, with year at least 0001.")
    return zone


def _parse_timestamp(value: str) -> float:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Chart timestamps must include a UTC offset.")
    return parsed.timestamp()


def _scale_time(value: float, start: float, end: float, width: float) -> float:
    return width / 2 if start == end else (value - start) / (end - start) * width


def _calendar_ticks(start: float, end: float, width: float, step: int, zone: ZoneInfo) -> list[AxisTick]:
    if start == end:
        return []
    first = datetime.fromtimestamp(start, zone)
    last = datetime.fromtimestamp(end, zone)
    first_month = first.year * 12 + first.month - 1
    last_month = last.year * 12 + last.month - 1
    ticks = []
    for month_index in range(ceil(first_month / step) * step, last_month + 1, step):
        year, month = divmod(month_index, 12)
        candidate = datetime(year, month + 1, 1, tzinfo=zone).timestamp()
        if not start <= candidate <= end:
            continue
        label = f"{year:04d}" if step >= 12 else f"{year:04d}-{month + 1:02d}"
        x = _scale_time(candidate, start, end, width)
        half = len(label) * 4
        anchor = "start" if x < half else "end" if x + half > width else "middle"
        ticks.append(AxisTick(candidate, x, label, anchor))
    return ticks


def _ticks_fit(ticks: list[AxisTick], width: float) -> bool:
    previous_right = -14.0
    for tick in ticks:
        size = len(tick.label) * 8
        left = tick.x if tick.anchor == "start" else tick.x - size if tick.anchor == "end" else tick.x - size / 2
        if left < 0 or left + size > width or left < previous_right + 14:
            return False
        previous_right = left + size
    return True


def build_axis_layout(start: float, end: float, width: float, *, milestone_month: str | None = None, time_zone: str = "UTC") -> AxisLayout:
    if not all(isfinite(value) for value in (start, end, width)) or end < start or width < 1:
        raise ValueError("Invalid axis range or width.")
    zone = validate_chart_options(milestone_month, time_zone)
    ticks = []
    interval = 12000
    for step in [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200, 2400, 6000, 12000]:
        candidates = _calendar_ticks(start, end, width, step, zone)
        if _ticks_fit(candidates, width):
            ticks, interval = candidates, step
            break
    milestone = None
    if milestone_month:
        year, month = map(int, milestone_month.split("-"))
        timestamp = datetime(year, month, 1, tzinfo=zone).timestamp()
        if not start <= timestamp <= end:
            milestone = Milestone("outside", f"{milestone_month} (outside range)")
        else:
            x = _scale_time(timestamp, start, end, width)
            half = len(milestone_month) * 4
            milestone = Milestone("inside", milestone_month, x, min(max(x, half), width - half))
    return AxisLayout(ticks, f"Start {datetime.fromtimestamp(start, zone):%Y-%m-%d}", f"End {datetime.fromtimestamp(end, zone):%Y-%m-%d}", width < 330, interval, milestone)


def _number_tick(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M" if value % 1_000_000 else f"{value / 1_000_000:.0f}M"
    if value >= 1000:
        return f"{value / 1000:.1f}K" if value % 1000 else f"{value / 1000:.0f}K"
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _y_ticks(maximum: float) -> list[float]:
    rough = maximum / 5
    magnitude = 10 ** floor(log10(rough))
    fraction = rough / magnitude
    step = (1 if fraction <= 1 else 2 if fraction <= 2 else 5 if fraction <= 5 else 10) * magnitude
    return [index * step for index in range(ceil(maximum / step) + 1)]


def render_chart_svg(analysis: dict, *, width: int | None = None, milestone_month: str | None = None, time_zone: str = "UTC") -> str:
    validate_chart_options(milestone_month, time_zone)
    width = 780 if width is None else width
    if width < 360:
        raise ValueError("Chart width must be at least 360 pixels.")
    inner_width = width - 100
    stacked = inner_width < 330
    height = max(360, width * 2 // 3)
    inner_height = height - 110 - (115 if stacked else 95)
    trend = analysis.get("commit_trend", [])
    defs = f'''<defs><style type="text/css"><![CDATA[@font-face {{font-family:"xkcd";src:url({XKCD_FONT_DATA_URL}) format("woff");}} text {{font-family:"xkcd","Comic Sans MS",cursive;}}]]></style><filter id="xkcdify" filterUnits="userSpaceOnUse" x="-5" y="-5" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise"/><feDisplacementMap scale="5" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="noise"/></filter></defs>'''
    opening = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{defs}<rect width="100%" height="100%" fill="white"/><text x="50%" y="28" text-anchor="middle" font-size="20" font-weight="bold" fill="black">Word History</text>'''
    if not trend:
        return f'{opening}<text x="50%" y="{height / 2}" text-anchor="middle" font-size="16">No data</text></svg>'
    times = [_parse_timestamp(entry["timestamp"]) for entry in trend]
    start, end = min(times), max(times)
    layout = build_axis_layout(start, end, inner_width, milestone_month=milestone_month, time_zone=time_zone)
    ticks = _y_ticks(max(1, max(entry["total_words"] for entry in trend)))
    domain = ticks[-1]
    def y(value):
        return inner_height * (1 - value / domain)
    points = [(_scale_time(time, start, end, inner_width), y(entry["total_words"])) for time, entry in zip(times, trend)]
    line = " ".join(f'{"L" if index else "M"}{x:.2f},{py:.2f}' for index, (x, py) in enumerate(points))
    end_x, end_y = points[-1]
    x_tick_svg = "".join(f'<g class="tick" transform="translate({tick.x:.2f},0)"><text y="24" text-anchor="{tick.anchor}" font-size="16" fill="black">{tick.label}</text></g>' for tick in layout.ticks)
    x_axis = f'<g class="xaxis" transform="translate(0,{inner_height})"><path class="domain" d="M0,0.5H{inner_width}" fill="none" stroke="black" stroke-width="2.5" filter="url(#xkcdify)"/>{x_tick_svg}</g>'
    y_tick_svg = "".join(f'<g class="tick" transform="translate(0,{y(tick):.2f})"><line x2="-3" stroke="black"/><text x="-8" y="5" text-anchor="end" font-size="16" fill="black">{_number_tick(tick)}</text></g>' for tick in ticks)
    y_axis = f'<g class="yaxis"><path class="domain" d="M0.5,0V{inner_height}" fill="none" stroke="black" stroke-width="2.5" filter="url(#xkcdify)"/>{y_tick_svg}</g>'
    range_svg = f'<g class="range-labels"><text x="0" y="{inner_height + 52}" text-anchor="start" font-size="16">{layout.start_label}</text><text x="{0 if stacked else inner_width}" y="{inner_height + (74 if stacked else 52)}" text-anchor="{"start" if stacked else "end"}" font-size="16">{layout.end_label}</text></g>'
    annotation = ""
    marker = layout.milestone
    if marker and marker.kind == "inside":
        annotation = f'<g class="milestone"><line class="milestone-line" x1="{marker.x:.2f}" x2="{marker.x:.2f}" y1="0" y2="{inner_height}" stroke="#666666" stroke-dasharray="5 5"/><path class="milestone-leader" d="M{marker.x:.2f},-4L{marker.label_x:.2f},-18" fill="none" stroke="#666666"/><text x="{marker.label_x:.2f}" y="-25" text-anchor="middle" font-size="16" fill="#666666">{marker.label}</text></g>'
    elif marker:
        annotation = f'<text class="milestone-outside" x="0" y="{inner_height + (98 if stacked else 76)}" font-size="14" fill="#666666">{marker.label}</text>'
    return f'''{opening}<text class="latest-total" x="50%" y="52" text-anchor="middle" font-size="16" fill="#dd4528">{trend[-1]['total_words']:,} words</text><text transform="rotate(-90)" x="-{110 + inner_height / 2:.2f}" y="18" text-anchor="middle" font-size="17" fill="black">Words</text><g class="chart" transform="translate(70,110)">{x_axis}{y_axis}{annotation}<path class="chart-line" d="{line}" fill="none" stroke="#dd4528" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle class="chart-dot endpoint-dot" cx="{end_x:.2f}" cy="{end_y:.2f}" r="4" fill="#dd4528" stroke="#dd4528"/>{range_svg}</g></svg>'''


def _build_time_mapper(x_values: list[datetime], y_values: list[int]):
    del y_values
    start, end = min(value.timestamp() for value in x_values), max(value.timestamp() for value in x_values)
    return lambda value, width: _scale_time(value.timestamp(), start, end, width)
