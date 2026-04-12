"""CLI for building local word-history artifacts."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import webbrowser

from .analysis import analyze_vault_history
from .counting import CountConfig, load_count_config
from .render import render_chart_svg


@dataclass(frozen=True)
class ReportPaths:
    analysis_json: Path
    dashboard_data_json: Path
    chart_svg: Path


def build_report(
    vault_path: Path | str,
    out_dir: Path | str | None = None,
    *,
    generated_at: str | None = None,
    config: CountConfig | None = None,
    top_n: int = 10,
    include_chart_svg: bool = True,
) -> ReportPaths:
    vault = Path(vault_path).expanduser()
    output_dir = Path(out_dir).expanduser() if out_dir is not None else Path.cwd() / "out"
    output_dir.mkdir(parents=True, exist_ok=True)

    analysis = analyze_vault_history(vault, config=config, top_n=top_n)
    analysis["generated_at"] = generated_at or _utc_now_iso()
    analysis["vault_path"] = str(vault)

    analysis_path = output_dir / "analysis.json"
    dashboard_data_path = output_dir / "dashboard-data.json"
    chart_svg_path = output_dir / "chart.svg"

    serialized = json.dumps(analysis, ensure_ascii=False, indent=2)
    analysis_path.write_text(serialized, encoding="utf-8")
    dashboard_data_path.write_text(serialized, encoding="utf-8")
    if include_chart_svg:
        if not render_chart_svg_with_star_history(analysis_path, chart_svg_path):
            chart_svg_path.write_text(render_chart_svg(analysis), encoding="utf-8")

    return ReportPaths(
        analysis_json=analysis_path,
        dashboard_data_json=dashboard_data_path,
        chart_svg=chart_svg_path,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a local Obsidian Git word-history report.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="Replay Git history and generate analysis.json + chart.svg")
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

    serve = subparsers.add_parser("serve", help="Build fresh output and launch the source dashboard with a local HTTP server")
    serve.add_argument("--vault", required=True, help="Path to the Git-backed Obsidian vault")
    serve.add_argument("--out", default="out", help="Directory to write report output (default: ./out)")
    serve.add_argument("--port", type=int, default=8000, help="Port for the local preview server")
    serve.add_argument("--host", default="127.0.0.1", help="Host for the local preview server")
    serve.add_argument("--generated-at", help="Override generated_at timestamp in ISO-8601 format")
    serve.add_argument("--top-n", type=int, default=10, help="How many recent active notes to include")
    serve.add_argument("--exclude-comments", action="store_true", help="Exclude Obsidian/HTML comments from counts")
    serve.add_argument("--exclude-code-blocks", action="store_true", help="Exclude fenced code blocks from counts")
    serve.add_argument(
        "--exclude-non-visible-link-portions",
        action="store_true",
        help="Exclude hidden link targets while keeping visible text",
    )
    serve.add_argument("--exclude-footnotes", action="store_true", help="Exclude footnote references and definitions")
    serve.add_argument("--no-open", action="store_true", help="Do not automatically open the browser")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command in {"build", "serve"}:
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
        if args.command == "serve":
            return serve_dashboard(
                Path(args.vault),
                requested_out_dir=Path(args.out).expanduser(),
                generated_at=args.generated_at,
                config=explicit_config,
                top_n=args.top_n,
                host=args.host,
                port=args.port,
                open_browser=not args.no_open,
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
                    "dashboard_data_json": str(paths.dashboard_data_json),
                    "chart_svg": str(paths.chart_svg),
                },
                ensure_ascii=False,
            )
        )
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def render_chart_svg_with_star_history(analysis_json_path: Path, chart_svg_path: Path) -> bool:
    try:
        analysis = json.loads(analysis_json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if len(analysis.get("commit_trend", [])) < 2:
        return False

    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root / "vendor" / "star-history" / "backend"
    script_path = backend_dir / "render-word-history.ts"
    tsx_bin = backend_dir / "node_modules" / ".bin" / "tsx"
    if not tsx_bin.exists() or not script_path.exists():
        return False

    command = (
        f"cd {shlex.quote(str(backend_dir))} && "
        f"./node_modules/.bin/tsx {shlex.quote(str(script_path))} "
        f"--input {shlex.quote(str(analysis_json_path))} "
        f"--output {shlex.quote(str(chart_svg_path))}"
    )
    completed = subprocess.run(
        ["/bin/bash", "-lc", command],
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.returncode == 0 and chart_svg_path.exists()


def serve_dashboard(
    vault_path: Path,
    *,
    requested_out_dir: Path,
    generated_at: str | None,
    config: CountConfig | None,
    top_n: int,
    host: str,
    port: int,
    open_browser: bool,
) -> int:
    repo_root = Path(__file__).resolve().parents[1]
    stable_out_dir = repo_root / "out"
    stable_out_dir.mkdir(parents=True, exist_ok=True)
    effective_config = config or load_count_config(vault_path.expanduser().resolve())
    stable_dashboard_data = stable_out_dir / "dashboard-data.json"
    cache_is_fresh = is_dashboard_data_fresh(
        stable_dashboard_data,
        vault_path=vault_path,
        config=effective_config,
    )

    if not cache_is_fresh:
        build_report(
            vault_path,
            stable_out_dir,
            generated_at=generated_at,
            config=effective_config,
            top_n=top_n,
            include_chart_svg=False,
        )

    stable_dashboard_data_path, dashboard_data_url = prepare_dashboard_data_for_serve(
        stable_dashboard_data,
        repo_root=repo_root,
    )
    handler = partial(SimpleHTTPRequestHandler, directory=str(repo_root))
    server = ThreadingHTTPServer((host, port), handler)
    dashboard_url = f"http://{host}:{port}/dashboard/?analysis={dashboard_data_url}"
    print(
        json.dumps(
            {
                "analysis_json": str(stable_out_dir / "analysis.json"),
                "dashboard_data_json": str(stable_dashboard_data_path),
                "chart_svg": str(stable_out_dir / "chart.svg"),
                "dashboard_url": dashboard_url,
                "cache_status": "reused" if cache_is_fresh else "rebuilt",
                "requested_out_dir": str(requested_out_dir),
            },
            ensure_ascii=False,
        )
    )
    if open_browser:
        webbrowser.open(dashboard_url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def prepare_dashboard_data_for_serve(dashboard_data_json_path: Path, *, repo_root: Path) -> tuple[Path, str]:
    stable_out_dir = repo_root / "out"
    stable_out_dir.mkdir(parents=True, exist_ok=True)
    stable_dashboard_data_path = stable_out_dir / "dashboard-data.json"
    if dashboard_data_json_path.resolve() != stable_dashboard_data_path.resolve():
        shutil.copyfile(dashboard_data_json_path, stable_dashboard_data_path)
    return stable_dashboard_data_path, "../out/dashboard-data.json"


def is_dashboard_data_fresh(dashboard_data_json_path: Path, *, vault_path: Path, config: CountConfig) -> bool:
    if not dashboard_data_json_path.exists():
        return False
    try:
        payload = json.loads(dashboard_data_json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    resolved_vault = str(vault_path.expanduser().resolve())
    if payload.get("vault_path") != resolved_vault:
        return False
    if payload.get("settings") != config.to_dict():
        return False
    return payload.get("head_commit") == _git_repo(Path(resolved_vault), "rev-parse", "HEAD").strip()


def _git_repo(repo_path: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout
