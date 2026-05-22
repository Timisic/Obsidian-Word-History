import json
import unittest
from pathlib import Path


class ObsidianPluginMetadataTests(unittest.TestCase):
    def test_manifest_declares_desktop_plugin(self) -> None:
        manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["id"], "word-history")
        self.assertEqual(manifest["name"], "Word History")
        self.assertEqual(manifest["version"], "0.1.0")
        self.assertTrue(manifest["isDesktopOnly"])
        self.assertIn("SVG", manifest["description"])

    def test_plugin_entrypoint_preserves_minimal_settings_and_commands(self) -> None:
        main_js = Path("main.js").read_text(encoding="utf-8")

        self.assertIn("outputPath", main_js)
        self.assertIn("updateMode", main_js)
        self.assertIn("intervalDays", main_js)
        self.assertIn("generate-word-history-chart", main_js)
        self.assertIn("install-word-history-git-hooks", main_js)
        self.assertIn("generate_chart.sh", main_js)
        self.assertIn("post-commit", main_js)
        self.assertIn("pre-push", main_js)
        self.assertIn("BEGIN Word History", main_js)
        self.assertIn('value === "git-hooks"', main_js)
        self.assertNotIn("/Users/", main_js)
        self.assertNotIn("Obsidian" + " Notes", main_js)


if __name__ == "__main__":
    unittest.main()
