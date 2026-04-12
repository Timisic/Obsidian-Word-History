"""CLI for building local word-history artifacts."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess

from .analysis import analyze_vault_history
from .counting import CountConfig
from .render import render_chart_svg


@dataclass(frozen=True)
class ReportPaths:
    analysis_json: Path
    chart_svg: Path
    chart_png: Path | None


def build_report(
    vault_path: Path | str,
    out_dir: Path | str | None = None,
    *,
    generated_at: str | None = None,
    config: CountConfig | None = None,
    top_n: int = 10,
) -> ReportPaths:
    vault = Path(vault_path).expanduser()
    output_dir = Path(out_dir).expanduser() if out_dir is not None else Path.cwd() / "out"
    output_dir.mkdir(parents=True, exist_ok=True)

    analysis = analyze_vault_history(vault, config=config, top_n=top_n)
    analysis["generated_at"] = generated_at or _utc_now_iso()
    analysis["vault_path"] = str(vault)

    analysis_path = output_dir / "analysis.json"
    chart_svg_path = output_dir / "chart.svg"
    chart_png_path = output_dir / "chart.png"

    analysis_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    chart_svg_path.write_text(render_chart_svg(analysis), encoding="utf-8")
    rendered_png = render_chart_png(chart_svg_path, chart_png_path)

    return ReportPaths(
        analysis_json=analysis_path,
        chart_svg=chart_svg_path,
        chart_png=chart_png_path if rendered_png else None,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a local Obsidian Git word-history report.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="Replay Git history and generate analysis.json + chart.svg (+ chart.png when rasterizer is available)")
    build.add_argument("--vault", required=True, help="Path to the Git-backed Obsidian vault")
    build.add_argument("--out", default="out", help="Directory to write report output (default: ./out)")
    build.add_argument("--generated-at", help="Override generated_at timestamp in ISO-8601 format")
    build.add_argument("--top-n", type=int, default=10, help="How many recent active notes to include")
    build.add_argument("--exclude-comments", action="store_true", help="Exclude Obsidian/HTML comments from counts")
    build.add_argument("--exclude-code-blocks", action="store_true", help="Exclude fenced code blocks from counts")
    build.add_argument(
        "--exclude-non-visible-link-portions",
        action="store_true",
        help="Exclude hidden link targets while keeping visible text",
    )
    build.add_argument("--exclude-footnotes", action="store_true", help="Exclude footnote references and definitions")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "build":
        explicit_config = None
        if any(
            [
                args.exclude_comments,
                args.exclude_code_blocks,
                args.exclude_non_visible_link_portions,
                args.exclude_footnotes,
            ]
        ):
            explicit_config = CountConfig(
                exclude_comments=args.exclude_comments,
                exclude_code_blocks=args.exclude_code_blocks,
                exclude_non_visible_link_portions=args.exclude_non_visible_link_portions,
                exclude_footnotes=args.exclude_footnotes,
            )
        paths = build_report(
            args.vault,
            args.out,
            generated_at=args.generated_at,
            config=explicit_config,
            top_n=args.top_n,
        )
        print(
            json.dumps(
                {
                    "analysis_json": str(paths.analysis_json),
                    "chart_svg": str(paths.chart_svg),
                    "chart_png": str(paths.chart_png) if paths.chart_png else None,
                },
                ensure_ascii=False,
            )
        )
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def render_chart_png(chart_svg_path: Path, chart_png_path: Path) -> bool:
    sips = shutil.which("sips")
    if sips:
        completed = subprocess.run(
            [sips, "-s", "format", "png", str(chart_svg_path), "--out", str(chart_png_path)],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0 and chart_png_path.exists():
            return True

    qlmanage = shutil.which("qlmanage")
    if not qlmanage:
        return False

    completed = subprocess.run(
        [qlmanage, "-t", "-s", "1600", "-o", str(chart_svg_path.parent), str(chart_svg_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    generated_path = chart_svg_path.parent / f"{chart_svg_path.name}.png"
    if completed.returncode != 0 or not generated_path.exists():
        return False
    generated_path.replace(chart_png_path)
    return True
