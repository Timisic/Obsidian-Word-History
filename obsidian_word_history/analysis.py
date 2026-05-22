"""Git history replay for Obsidian word-count trends."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import subprocess
from typing import Iterable, Literal

from .counting import CountConfig, count_countable_text, is_countable_path, load_count_config

Period = Literal["day", "week", "month"]


@dataclass(frozen=True)
class CommitRecord:
    sha: str
    timestamp: str


def analyze_vault_history(vault_path: Path | str, config: CountConfig | None = None, top_n: int = 10) -> dict:
    repo_path = Path(vault_path).expanduser().resolve()
    effective_config = config or load_count_config(repo_path)
    commits = _list_commits(repo_path)
    head_commit = _git(repo_path, "rev-parse", "HEAD").strip()

    current_counts: dict[str, int] = {}
    note_totals: dict[str, list[int]] = {}
    note_activity: dict[str, list[str]] = defaultdict(list)
    commit_trend: list[dict[str, object]] = []

    for commit in commits:
        touched_paths = _apply_commit_changes(repo_path, commit.sha, current_counts, effective_config)
        for touched_path in touched_paths:
            note_activity[touched_path].append(commit.timestamp)
        for path in current_counts:
            if path not in note_totals:
                note_totals[path] = [0] * len(commit_trend)
        for path, series in note_totals.items():
            series.append(current_counts.get(path, 0))
        commit_trend.append(
            {
                "commit_sha": commit.sha,
                "timestamp": commit.timestamp,
                "total_words": sum(current_counts.values()),
                "tracked_notes": len(current_counts),
            }
        )

    as_of_timestamp = str(commit_trend[-1]["timestamp"]) if commit_trend else _utc_now_iso()
    daily_deltas = aggregate_daily_deltas(commit_trend)
    weekly_deltas = aggregate_period_deltas(commit_trend, period="week")
    monthly_deltas = aggregate_period_deltas(commit_trend, period="month")
    notes = build_note_metrics(
        note_totals,
        note_activity,
        current_counts,
        commit_trend,
        as_of_timestamp=as_of_timestamp,
    )
    folders = build_folder_metrics(notes)

    return {
        "schema_version": "1",
        "renderer_version": "1",
        "generated_at": _utc_now_iso(),
        "vault_path": str(repo_path),
        "head_commit": head_commit,
        "settings": effective_config.to_dict(),
        "summary": {
            "commit_count": len(commit_trend),
            "latest_total_words": commit_trend[-1]["total_words"] if commit_trend else 0,
            "notes_tracked": commit_trend[-1]["tracked_notes"] if commit_trend else 0,
            "latest_commit_at": as_of_timestamp,
            "recent_30d_words_added": _sum_recent_period_values(daily_deltas, as_of_timestamp, days=30),
            "recent_30d_active_notes": sum(1 for note in notes if int(note["touch_count_30d"]) > 0),
        },
        "commit_trend": commit_trend,
        "recent_active_notes_30d": build_recent_active_notes(
            note_activity,
            current_counts,
            top_n=top_n,
            as_of_timestamp=as_of_timestamp,
        ),
        "top_notes": build_top_notes(note_totals, top_n=top_n),
        "notes": notes,
        "folders": folders,
        "series": {
            "daily_deltas": daily_deltas,
            "weekly_deltas": weekly_deltas,
            "monthly_deltas": monthly_deltas,
        },
    }


def aggregate_daily_deltas(commit_series: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    return aggregate_period_deltas(commit_series, period="day")


def aggregate_period_deltas(commit_series: Iterable[dict[str, object]], *, period: Period) -> list[dict[str, object]]:
    grouped: dict[str, int] = defaultdict(int)
    previous_total = 0
    for entry in commit_series:
        total_words = int(entry["total_words"])
        timestamp = str(entry["timestamp"])
        grouped[_period_start_label(timestamp, period)] += total_words - previous_total
        previous_total = total_words
    return [{"date": period_start, "net_words_added": grouped[period_start]} for period_start in sorted(grouped)]


def build_top_notes(note_totals: dict[str, list[int]], top_n: int = 10) -> list[dict[str, object]]:
    items = []
    for path, series in note_totals.items():
        if not series:
            continue
        initial = series[0]
        final = series[-1]
        if initial == 0 and final == 0:
            initial = next((value for value in series if value != 0), 0)
        items.append(
            {
                "path": path,
                "initial_words": initial,
                "final_words": final,
                "net_growth": final - initial,
            }
        )
    items.sort(key=lambda item: (-item["net_growth"], item["path"]))
    return items[:top_n]


def build_recent_active_notes(
    note_activity: dict[str, list[str]],
    current_counts: dict[str, int],
    *,
    top_n: int = 10,
    as_of_timestamp: str,
) -> list[dict[str, object]]:
    window_end = _parse_iso_timestamp(as_of_timestamp)
    window_start = window_end - timedelta(days=30)
    items: list[dict[str, object]] = []

    for path, timestamps in note_activity.items():
        recent_timestamps = [
            timestamp
            for timestamp in timestamps
            if window_start <= _parse_iso_timestamp(timestamp) <= window_end
        ]
        if not recent_timestamps:
            continue
        items.append(
            {
                "path": path,
                "touch_count_30d": len(recent_timestamps),
                "latest_touch_at": max(recent_timestamps, key=_parse_iso_timestamp),
                "current_words": current_counts.get(path, 0),
            }
        )

    items.sort(
        key=lambda item: (
            -item["touch_count_30d"],
            item["path"],
        )
    )
    return items[:top_n]


def build_note_metrics(
    note_totals: dict[str, list[int]],
    note_activity: dict[str, list[str]],
    current_counts: dict[str, int],
    commit_trend: list[dict[str, object]],
    *,
    as_of_timestamp: str,
) -> list[dict[str, object]]:
    timestamps = [str(entry["timestamp"]) for entry in commit_trend]
    window_end = _parse_iso_timestamp(as_of_timestamp)
    window_start = window_end - timedelta(days=30)
    items: list[dict[str, object]] = []

    for path, series in note_totals.items():
        if not series:
            continue
        initial = series[0]
        final = series[-1]
        if initial == 0 and final == 0:
            initial = next((value for value in series if value != 0), 0)
        peak_words = max(series)
        peak_index = max(range(len(series)), key=lambda index: series[index])
        all_timestamps = note_activity.get(path, [])
        recent_timestamps = [
            timestamp
            for timestamp in all_timestamps
            if window_start <= _parse_iso_timestamp(timestamp) <= window_end
        ]
        items.append(
            {
                "path": path,
                "folder": _parent_folder(path),
                "exists": path in current_counts,
                "current_words": current_counts.get(path, 0),
                "initial_words": initial,
                "final_words": final,
                "peak_words": peak_words,
                "peak_words_at": timestamps[peak_index] if timestamps else as_of_timestamp,
                "net_growth": final - initial,
                "touch_count_total": len(all_timestamps),
                "touch_count_30d": len(recent_timestamps),
                "latest_touch_at": max(all_timestamps, key=_parse_iso_timestamp) if all_timestamps else as_of_timestamp,
            }
        )

    items.sort(key=lambda item: (-int(item["current_words"]), str(item["path"])))
    return items


def build_folder_metrics(note_metrics: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}

    for note in note_metrics:
        latest_touch_at = str(note["latest_touch_at"])
        latest_touch_dt = _parse_iso_timestamp(latest_touch_at)
        for folder_path in _folder_prefixes_for_note(str(note["path"])):
            if folder_path not in grouped:
                grouped[folder_path] = {
                    "path": folder_path,
                    "depth": 0 if folder_path == "(root)" else folder_path.count("/") + 1,
                    "note_count": 0,
                    "active_notes_30d": 0,
                    "current_words": 0,
                    "net_growth": 0,
                    "touch_count_30d": 0,
                    "latest_touch_at": latest_touch_at,
                    "_latest_touch_dt": latest_touch_dt,
                }
            bucket = grouped[folder_path]
            if bool(note["exists"]):
                bucket["note_count"] = int(bucket["note_count"]) + 1
            if int(note["touch_count_30d"]) > 0:
                bucket["active_notes_30d"] = int(bucket["active_notes_30d"]) + 1
            bucket["current_words"] = int(bucket["current_words"]) + int(note["current_words"])
            bucket["net_growth"] = int(bucket["net_growth"]) + int(note["net_growth"])
            bucket["touch_count_30d"] = int(bucket["touch_count_30d"]) + int(note["touch_count_30d"])
            if latest_touch_dt >= bucket["_latest_touch_dt"]:
                bucket["latest_touch_at"] = latest_touch_at
                bucket["_latest_touch_dt"] = latest_touch_dt

    for bucket in grouped.values():
        bucket.pop("_latest_touch_dt", None)
    items = list(grouped.values())
    items.sort(key=lambda item: (-int(item["current_words"]), str(item["path"])))
    return items


def _list_commits(repo_path: Path) -> list[CommitRecord]:
    output = _git(repo_path, "log", "--first-parent", "--reverse", "--format=%H%x00%cI")
    if not output.strip():
        return []
    entries = []
    for line in output.splitlines():
        sha, timestamp = line.split("\x00", 1)
        entries.append(CommitRecord(sha=sha, timestamp=timestamp))
    return entries


def _apply_commit_changes(repo_path: Path, commit_sha: str, current_counts: dict[str, int], config: CountConfig) -> list[str]:
    touched_paths: list[str] = []
    for change in _list_commit_changes(repo_path, commit_sha):
        status = change[0]
        if status.startswith("R"):
            old_path, new_path = change[1], change[2]
            if is_countable_path(old_path):
                current_counts.pop(old_path, None)
                touched_paths.append(old_path)
            if is_countable_path(new_path):
                current_counts[new_path] = _count_path_at_commit(repo_path, commit_sha, new_path, config)
                touched_paths.append(new_path)
            continue
        if status.startswith("C"):
            new_path = change[2]
            if is_countable_path(new_path):
                current_counts[new_path] = _count_path_at_commit(repo_path, commit_sha, new_path, config)
                touched_paths.append(new_path)
            continue
        path = change[1]
        if status == "D":
            if is_countable_path(path):
                current_counts.pop(path, None)
                touched_paths.append(path)
            continue
        if is_countable_path(path):
            current_counts[path] = _count_path_at_commit(repo_path, commit_sha, path, config)
            touched_paths.append(path)
    return touched_paths


def _list_commit_changes(repo_path: Path, commit_sha: str) -> list[tuple[str, ...]]:
    output = subprocess.run(
        ["git", "-C", str(repo_path), "diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", commit_sha],
        check=True,
        capture_output=True,
    ).stdout.decode("utf-8", errors="replace")
    if not output:
        return []

    tokens = output.split("\x00")
    changes: list[tuple[str, ...]] = []
    index = 0
    while index < len(tokens) - 1:
        status = tokens[index]
        if not status:
            break
        index += 1
        if status.startswith(("R", "C")):
            old_path = tokens[index]
            new_path = tokens[index + 1]
            changes.append((status, old_path, new_path))
            index += 2
        else:
            path = tokens[index]
            changes.append((status, path))
            index += 1
    return changes


def _count_path_at_commit(repo_path: Path, commit_sha: str, path: str, config: CountConfig) -> int:
    completed = subprocess.run(
        ["git", "-C", str(repo_path), "show", f"{commit_sha}:{path}"],
        check=True,
        capture_output=True,
    )
    content = completed.stdout.decode("utf-8", errors="replace")
    return count_countable_text(path, content, config).word_count


def _git(repo_path: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _period_start_label(timestamp: str, period: Period) -> str:
    moment = _parse_iso_timestamp(timestamp)
    if period == "day":
        return moment.date().isoformat()
    if period == "week":
        start = moment.date() - timedelta(days=moment.weekday())
        return start.isoformat()
    start_of_month = date(moment.year, moment.month, 1)
    return start_of_month.isoformat()


def _sum_recent_period_values(series: Iterable[dict[str, object]], as_of_timestamp: str, *, days: int) -> int:
    window_end = _parse_iso_timestamp(as_of_timestamp).date()
    window_start = window_end - timedelta(days=days)
    total = 0
    for entry in series:
        entry_date = date.fromisoformat(str(entry["date"]))
        if window_start <= entry_date <= window_end:
            total += int(entry["net_words_added"])
    return total


def _parent_folder(path: str) -> str:
    parts = path.split("/")[:-1]
    return "/".join(parts) if parts else "(root)"


def _folder_prefixes_for_note(path: str) -> list[str]:
    parts = path.split("/")[:-1]
    if not parts:
        return ["(root)"]
    prefixes = ["(root)"]
    for index in range(1, len(parts) + 1):
        prefixes.append("/".join(parts[:index]))
    return prefixes
