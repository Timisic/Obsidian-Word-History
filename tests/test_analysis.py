import unittest

from obsidian_word_history.analysis import (
    aggregate_period_deltas,
    build_folder_metrics,
    build_note_metrics,
    build_recent_active_notes,
    build_top_notes,
)


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

    def test_build_note_metrics_exposes_report_fields(self) -> None:
        note_totals = {
            "root.md": [2, 4, 5],
            "folder/alpha.md": [0, 3, 7],
            "folder/beta.md": [1, 0, 0],
        }
        note_activity = {
            "root.md": ["2026-04-01T08:00:00+00:00", "2026-04-12T08:00:00+00:00"],
            "folder/alpha.md": ["2026-04-10T08:00:00+00:00"],
            "folder/beta.md": ["2026-03-01T08:00:00+00:00", "2026-04-03T08:00:00+00:00"],
        }
        current_counts = {"root.md": 5, "folder/alpha.md": 7}
        commit_trend = [
            {"timestamp": "2026-04-01T08:00:00+00:00", "total_words": 3, "tracked_notes": 2},
            {"timestamp": "2026-04-10T08:00:00+00:00", "total_words": 7, "tracked_notes": 2},
            {"timestamp": "2026-04-12T08:00:00+00:00", "total_words": 12, "tracked_notes": 2},
        ]

        metrics = build_note_metrics(
            note_totals,
            note_activity,
            current_counts,
            commit_trend,
            as_of_timestamp="2026-04-12T08:00:00+00:00",
        )

        alpha = next(item for item in metrics if item["path"] == "folder/alpha.md")
        self.assertEqual(alpha["folder"], "folder")
        self.assertTrue(alpha["exists"])
        self.assertEqual(alpha["current_words"], 7)
        self.assertEqual(alpha["peak_words"], 7)
        self.assertEqual(alpha["net_growth"], 7)
        self.assertEqual(alpha["touch_count_30d"], 1)
        self.assertEqual(alpha["peak_words_at"], "2026-04-12T08:00:00+00:00")

        beta = next(item for item in metrics if item["path"] == "folder/beta.md")
        self.assertFalse(beta["exists"])
        self.assertEqual(beta["current_words"], 0)
        self.assertEqual(beta["touch_count_30d"], 1)

    def test_build_note_metrics_treats_zero_word_current_notes_as_existing(self) -> None:
        note_totals = {
            "empty.md": [0, 0],
        }
        note_activity = {
            "empty.md": ["2026-04-12T08:00:00+00:00"],
        }
        current_counts = {"empty.md": 0}
        commit_trend = [
            {"timestamp": "2026-04-12T08:00:00+00:00", "total_words": 0, "tracked_notes": 1},
        ]

        metrics = build_note_metrics(
            note_totals,
            note_activity,
            current_counts,
            commit_trend,
            as_of_timestamp="2026-04-12T08:00:00+00:00",
        )

        self.assertTrue(metrics[0]["exists"])
        self.assertEqual(metrics[0]["current_words"], 0)

    def test_build_folder_metrics_rolls_up_nested_paths(self) -> None:
        notes = [
            {
                "path": "root.md",
                "folder": "(root)",
                "exists": True,
                "current_words": 5,
                "net_growth": 5,
                "touch_count_30d": 2,
                "latest_touch_at": "2026-04-12T08:00:00+00:00",
            },
            {
                "path": "folder/alpha.md",
                "folder": "folder",
                "exists": True,
                "current_words": 7,
                "net_growth": 7,
                "touch_count_30d": 1,
                "latest_touch_at": "2026-04-10T08:00:00+00:00",
            },
            {
                "path": "folder/deep/beta.md",
                "folder": "folder/deep",
                "exists": False,
                "current_words": 0,
                "net_growth": -2,
                "touch_count_30d": 1,
                "latest_touch_at": "2026-04-03T08:00:00+00:00",
            },
        ]

        folders = build_folder_metrics(notes)
        folder = next(item for item in folders if item["path"] == "folder")
        self.assertEqual(folder["note_count"], 1)
        self.assertEqual(folder["active_notes_30d"], 2)
        self.assertEqual(folder["current_words"], 7)
        self.assertEqual(folder["net_growth"], 5)
        self.assertEqual(folder["touch_count_30d"], 2)

        root = next(item for item in folders if item["path"] == "(root)")
        self.assertEqual(root["current_words"], 12)
        self.assertEqual(root["note_count"], 2)

    def test_build_folder_metrics_compares_latest_touch_at_by_datetime(self) -> None:
        notes = [
            {
                "path": "a.md",
                "folder": "(root)",
                "exists": True,
                "current_words": 1,
                "net_growth": 1,
                "touch_count_30d": 1,
                "latest_touch_at": "2026-04-10T14:00:00+09:00",
            },
            {
                "path": "b.md",
                "folder": "(root)",
                "exists": True,
                "current_words": 1,
                "net_growth": 1,
                "touch_count_30d": 1,
                "latest_touch_at": "2026-04-10T02:30:00+00:00",
            },
        ]

        folders = build_folder_metrics(notes)
        root = next(item for item in folders if item["path"] == "(root)")
        self.assertEqual(root["latest_touch_at"], "2026-04-10T14:00:00+09:00")

    def test_aggregate_period_deltas_groups_by_week_and_month(self) -> None:
        commit_series = [
            {"timestamp": "2026-04-01T08:00:00+00:00", "total_words": 10},
            {"timestamp": "2026-04-03T08:00:00+00:00", "total_words": 15},
            {"timestamp": "2026-04-10T08:00:00+00:00", "total_words": 18},
            {"timestamp": "2026-05-01T08:00:00+00:00", "total_words": 25},
        ]
        self.assertEqual(
            aggregate_period_deltas(commit_series, period="week"),
            [
                {"date": "2026-03-30", "net_words_added": 15},
                {"date": "2026-04-06", "net_words_added": 3},
                {"date": "2026-04-27", "net_words_added": 7},
            ],
        )
        self.assertEqual(
            aggregate_period_deltas(commit_series, period="month"),
            [
                {"date": "2026-04-01", "net_words_added": 18},
                {"date": "2026-05-01", "net_words_added": 7},
            ],
        )


if __name__ == "__main__":
    unittest.main()
