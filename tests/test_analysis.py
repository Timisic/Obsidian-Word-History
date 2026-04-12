import unittest

from obsidian_word_history.analysis import build_recent_active_notes, build_top_notes


class AnalysisTests(unittest.TestCase):
    def test_build_top_notes_uses_historical_net_growth(self) -> None:
        note_totals = {
            "alpha.md": [0, 5, 12],
            "beta.md": [4, 4, 9],
            "gamma.md": [0, 3, 3],
        }
        self.assertEqual(
            build_top_notes(note_totals, top_n=2),
            [
                {"path": "alpha.md", "initial_words": 0, "final_words": 12, "net_growth": 12},
                {"path": "beta.md", "initial_words": 4, "final_words": 9, "net_growth": 5},
            ],
        )

    def test_build_top_notes_handles_deleted_and_late_arriving_notes(self) -> None:
        note_totals = {
            "deleted.md": [4, 0],
            "late.md": [0, 7],
            "blank.md": [0, 0],
        }
        self.assertEqual(
            build_top_notes(note_totals, top_n=3),
            [
                {"path": "late.md", "initial_words": 0, "final_words": 7, "net_growth": 7},
                {"path": "blank.md", "initial_words": 0, "final_words": 0, "net_growth": 0},
                {"path": "deleted.md", "initial_words": 4, "final_words": 0, "net_growth": -4},
            ],
        )

    def test_build_recent_active_notes_counts_last_30_days_touch_frequency(self) -> None:
        note_activity = {
            "alpha.md": ["2026-03-15T08:00:00+00:00", "2026-04-01T08:00:00+00:00", "2026-04-10T08:00:00+00:00"],
            "beta.md": ["2026-04-05T08:00:00+00:00", "2026-04-06T08:00:00+00:00"],
            "gamma.md": ["2026-02-01T08:00:00+00:00", "2026-04-12T08:00:00+00:00"],
        }
        current_counts = {"alpha.md": 10, "beta.md": 6, "gamma.md": 2}
        self.assertEqual(
            build_recent_active_notes(
                note_activity,
                current_counts,
                top_n=2,
                as_of_timestamp="2026-04-12T12:00:00+00:00",
            ),
            [
                {
                    "path": "alpha.md",
                    "touch_count_30d": 3,
                    "latest_touch_at": "2026-04-10T08:00:00+00:00",
                    "current_words": 10,
                },
                {
                    "path": "beta.md",
                    "touch_count_30d": 2,
                    "latest_touch_at": "2026-04-06T08:00:00+00:00",
                    "current_words": 6,
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
