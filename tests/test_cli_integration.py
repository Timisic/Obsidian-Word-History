import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

from obsidian_word_history.analysis import analyze_vault_history
from obsidian_word_history.cli import build_report
from obsidian_word_history.render import _build_time_mapper, _build_time_ticks


class SectionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.section_ids = []
        self.script_json = None
        self.image_sources = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "section" and "id" in attrs_dict:
            self.section_ids.append(attrs_dict["id"])
        if tag == "img" and "src" in attrs_dict:
            self.image_sources.append(attrs_dict["src"])
        if tag == "script" and attrs_dict.get("id") == "analysis-data":
            self._capture_script = True
        else:
            self._capture_script = False

    def handle_data(self, data):
        if getattr(self, "_capture_script", False):
            self.script_json = (self.script_json or "") + data


class CliIntegrationTests(unittest.TestCase):
    def test_time_mapper_compresses_low_change_long_intervals(self) -> None:
        mapper = _build_time_mapper(
            [
                datetime.fromisoformat("2025-01-01T00:00:00+00:00"),
                datetime.fromisoformat("2025-04-01T00:00:00+00:00"),
                datetime.fromisoformat("2025-04-15T00:00:00+00:00"),
            ],
            [0, 1, 100],
        )
        april_first_x = mapper(datetime.fromisoformat("2025-04-01T00:00:00+00:00"), 1000)
        self.assertLess(april_first_x, 800.0)

    def test_build_time_ticks_prefers_calendar_boundaries_for_long_ranges(self) -> None:
        ticks = _build_time_ticks(
            datetime.fromisoformat("2025-01-16T13:39:05+08:00"),
            datetime.fromisoformat("2026-04-12T18:02:02+08:00"),
            5,
        )
        self.assertEqual(
            [tick.strftime("%Y-%m-%d") for tick in ticks],
            [
                "2025-01-16",
                "2025-04-01",
                "2025-07-01",
                "2025-10-01",
                "2026-01-01",
                "2026-04-01",
                "2026-04-12",
            ],
        )

    def test_analyzer_replays_git_history_and_preserves_path_based_rename_behavior(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir)
            self._git(repo, "init")
            self._git(repo, "config", "user.name", "Test User")
            self._git(repo, "config", "user.email", "test@example.com")

            (repo / "note-a.md").write_text("alpha beta", encoding="utf-8")
            self._commit(repo, "initial", "2026-01-01T08:00:00+00:00")

            (repo / "note-a.md").write_text("alpha beta gamma", encoding="utf-8")
            self._commit(repo, "expand a", "2026-01-01T09:00:00+00:00")

            (repo / "note-b.md").write_text("delta epsilon", encoding="utf-8")
            self._commit(repo, "add b", "2026-01-02T10:00:00+00:00")

            self._git(repo, "mv", "note-b.md", "renamed-b.md")
            self._commit(repo, "rename b", "2026-01-03T11:00:00+00:00")

            analysis = analyze_vault_history(repo)

            self.assertEqual(
                [entry["total_words"] for entry in analysis["commit_trend"]],
                [2, 3, 5, 5],
            )
            self.assertEqual(
                analysis["recent_active_notes_30d"],
                [
                    {
                        "path": "note-a.md",
                        "touch_count_30d": 2,
                        "latest_touch_at": "2026-01-01T09:00:00+00:00",
                        "current_words": 3,
                    },
                    {
                        "path": "note-b.md",
                        "touch_count_30d": 2,
                        "latest_touch_at": "2026-01-03T11:00:00+00:00",
                        "current_words": 0,
                    },
                    {
                        "path": "renamed-b.md",
                        "touch_count_30d": 1,
                        "latest_touch_at": "2026-01-03T11:00:00+00:00",
                        "current_words": 2,
                    },
                ],
            )

    def test_build_report_writes_canonical_analysis_svg_and_two_section_html(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "vault"
            out_dir = Path(tmpdir) / "out"
            repo.mkdir()
            self._git(repo, "init")
            self._git(repo, "config", "user.name", "Test User")
            self._git(repo, "config", "user.email", "test@example.com")

            (repo / "note.md").write_text("hello world", encoding="utf-8")
            self._commit(repo, "initial", "2026-01-01T08:00:00+00:00")

            paths = build_report(repo, out_dir, generated_at="2026-01-02T00:00:00+00:00")
            analysis = json.loads(paths.analysis_json.read_text(encoding="utf-8"))
            html = paths.report_html.read_text(encoding="utf-8")
            chart_svg = paths.chart_svg.read_text(encoding="utf-8")

            self.assertEqual(paths.analysis_json, out_dir / "analysis.json")
            self.assertEqual(paths.report_html, out_dir / "report.html")
            self.assertEqual(paths.chart_svg, out_dir / "chart.svg")
            self.assertEqual(analysis["schema_version"], "1")
            self.assertEqual(analysis["generated_at"], "2026-01-02T00:00:00+00:00")
            self.assertEqual(analysis["renderer_version"], "1")
            self.assertEqual(analysis["head_commit"], self._git(repo, "rev-parse", "HEAD").strip())

            parser = SectionParser()
            parser.feed(html)
            self.assertEqual(
                parser.section_ids,
                ["total-word-trend", "recent-active-notes"],
            )
            self.assertEqual(parser.image_sources, ["chart.svg"])
            self.assertEqual(json.loads(parser.script_json), analysis)
            self.assertNotIn('src="http', html)
            self.assertNotIn('href="http', html)
            self.assertIn("Word History", chart_svg)
            self.assertIn("Words", chart_svg)
            self.assertIn("<svg", chart_svg)
            self.assertNotIn("obsidian-word-history", chart_svg)
            self.assertNotIn(">Date</text>", chart_svg)

    def test_module_cli_build_command_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "vault"
            out_dir = Path(tmpdir) / "out"
            repo.mkdir()
            self._git(repo, "init")
            self._git(repo, "config", "user.name", "Test User")
            self._git(repo, "config", "user.email", "test@example.com")

            (repo / "note.md").write_text("hello world again", encoding="utf-8")
            self._commit(repo, "initial", "2026-01-01T08:00:00+00:00")

            env = os.environ.copy()
            env["PYTHONPATH"] = str(Path.cwd())
            completed = subprocess.run(
                [
                    "python3",
                    "-m",
                    "obsidian_word_history",
                    "build",
                    "--vault",
                    str(repo),
                    "--out",
                    str(out_dir),
                    "--generated-at",
                    "2026-01-03T00:00:00+00:00",
                ],
                check=False,
                capture_output=True,
                text=True,
                env=env,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((out_dir / "analysis.json").exists())
            self.assertTrue((out_dir / "report.html").exists())
            self.assertTrue((out_dir / "chart.svg").exists())

    def _commit(self, repo: Path, message: str, timestamp: str) -> None:
        env = os.environ.copy()
        env["GIT_AUTHOR_DATE"] = timestamp
        env["GIT_COMMITTER_DATE"] = timestamp
        subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, env=env)
        subprocess.run(["git", "-C", str(repo), "commit", "-m", message], check=True, env=env, capture_output=True)

    def _git(self, repo: Path, *args: str) -> str:
        completed = subprocess.run(
            ["git", "-C", str(repo), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout


if __name__ == "__main__":
    unittest.main()
