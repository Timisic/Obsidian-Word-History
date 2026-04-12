"""Local Git-backed Obsidian word history reporting."""

from .analysis import analyze_vault_history
from .cli import build_report
from .counting import CountConfig, CountResult, count_markdown, trim_frontmatter

__all__ = [
    "analyze_vault_history",
    "build_report",
    "CountConfig",
    "CountResult",
    "count_markdown",
    "trim_frontmatter",
]
