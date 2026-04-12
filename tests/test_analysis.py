import unittest

from obsidian_word_history.analysis import (
    aggregate_daily_deltas,
    build_top_notes,
)


class AnalysisTests(unittest.TestCase):
    def test_aggregate_daily_deltas_sums_same_day_commit_changes(self) -> None:
        commit_series = [
            {"commit_sha": "a", "timestamp": "2026-01-01T08:00:00+00:00", "total_words": 10},
            {"commit_sha": "b", "timestamp": "2026-01-01T09:00:00+00:00", "total_words": 18},
            {"commit_sha": "c", "timestamp": "2026-01-02T10:00:00+00:00", "total_words": 15},
        ]
        self.assertEqual(
            aggregate_daily_deltas(commit_series),
            [
                {"date": "2026-01-01", "net_words_added": 18},
                {"date": "2026-01-02", "net_words_added": -3},
            ],
        )

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


if __name__ == "__main__":
    unittest.main()
