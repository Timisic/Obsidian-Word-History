import unittest

from obsidian_word_history.counting import CountConfig, count_markdown, trim_frontmatter


class MarkdownCounterTests(unittest.TestCase):
    def test_counts_plain_english_text(self) -> None:
        result = count_markdown("hello world")
        self.assertEqual(result.space_delimited_word_count, 2)
        self.assertEqual(result.cjk_word_count, 0)
        self.assertEqual(result.word_count, 2)

    def test_counts_plain_cjk_text(self) -> None:
        result = count_markdown("你好世界")
        self.assertEqual(result.space_delimited_word_count, 0)
        self.assertEqual(result.cjk_word_count, 4)
        self.assertEqual(result.word_count, 4)

    def test_counts_mixed_english_and_cjk_text(self) -> None:
        result = count_markdown("hello 世界")
        self.assertEqual(result.space_delimited_word_count, 1)
        self.assertEqual(result.cjk_word_count, 2)
        self.assertEqual(result.word_count, 3)

    def test_trims_yaml_frontmatter_before_counting(self) -> None:
        content = "---\ntitle: Demo\n---\n\nBody text here"
        self.assertEqual(trim_frontmatter(content), "\n\nBody text here")
        self.assertEqual(count_markdown(content).word_count, 3)

    def test_counts_markdown_with_default_plugin_like_rules(self) -> None:
        content = (
            "---\ntitle: Demo\n---\n"
            "Hello, world!\n"
            "[Docs](https://example.com/path) [[Page|Alias]] [^1]\n"
            "[^1]: Footnote text\n"
            "<!-- hidden note -->\n"
            "%% also hidden %%\n"
            "```py\nprint('hi')\n```\n"
            "中文"
        )
        result = count_markdown(content)
        self.assertEqual(result.space_delimited_word_count, 14)
        self.assertEqual(result.cjk_word_count, 2)
        self.assertEqual(result.word_count, 16)

    def test_exclusion_toggles_remove_expected_content(self) -> None:
        content = (
            "Visible words\n"
            "[Docs](https://example.com/path) [[Long Page Name|Alias]]\n"
            "[^1] reference\n"
            "[^1]: Footnote text\n"
            "<!-- hidden note -->\n"
            "%% also hidden %%\n"
            "```py\nprint('hi')\n```"
        )
        default_result = count_markdown(content)
        self.assertEqual(default_result.word_count, 17)

        comments_result = count_markdown(content, CountConfig(exclude_comments=True))
        self.assertEqual(comments_result.word_count, 13)

        code_result = count_markdown(content, CountConfig(exclude_code_blocks=True))
        self.assertEqual(code_result.word_count, 15)

        links_result = count_markdown(content, CountConfig(exclude_non_visible_link_portions=True))
        self.assertEqual(links_result.word_count, 15)

        footnotes_result = count_markdown(content, CountConfig(exclude_footnotes=True))
        self.assertEqual(footnotes_result.word_count, 13)

    def test_handles_empty_and_punctuation_only_notes(self) -> None:
        self.assertEqual(count_markdown("").word_count, 0)
        self.assertEqual(count_markdown("... !!!").word_count, 0)


if __name__ == "__main__":
    unittest.main()
