import json
import os
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from obsidian_word_history.analysis import analyze_vault_history
from obsidian_word_history.cli import build_report


class SectionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.section_ids = []
        self.script_json = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "section" and "id" in attrs_dict:
            self.section_ids.append(attrs_dict["id"])
        if tag == "script" and attrs_dict.get("id") == "analysis-data":
            self._capture_script = True
        else:
            self._capture_script = False

    def handle_data(self, data):
        if getattr(self, "_capture_script", False):
            self.script_json = (self.script_json or "") + data


class CliIntegrationTests(unittest.TestCase):
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
                analysis["daily_deltas"],
                [
                    {"date": "2026-01-01", "net_words_added": 3},
                    {"date": "2026-01-02", "net_words_added": 2},
                    {"date": "2026-01-03", "net_words_added": 0},
                ],
            )
            top_notes = {item["path"]: item for item in analysis["top_notes"]}
            self.assertEqual(top_notes["note-a.md"]["net_growth"], 1)
            self.assertEqual(top_notes["note-b.md"]["net_growth"], -2)
            self.assertEqual(top_notes["renamed-b.md"]["net_growth"], 2)

    def test_build_report_writes_canonical_analysis_and_three_section_html(self) -> None:
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

            self.assertEqual(paths.analysis_json, out_dir / "analysis.json")
            self.assertEqual(paths.report_html, out_dir / "report.html")
            self.assertEqual(analysis["schema_version"], "1")
            self.assertEqual(analysis["generated_at"], "2026-01-02T00:00:00+00:00")
            self.assertEqual(analysis["renderer_version"], "1")
            self.assertEqual(analysis["head_commit"], self._git(repo, "rev-parse", "HEAD").strip())

            parser = SectionParser()
            parser.feed(html)
            self.assertEqual(
                parser.section_ids,
                ["total-word-trend", "daily-net-additions", "top-note-growth"],
            )
            self.assertEqual(json.loads(parser.script_json), analysis)
            self.assertNotIn('src="http', html)
            self.assertNotIn('href="http', html)

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
